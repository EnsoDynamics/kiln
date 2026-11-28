// The usage fallback's launch decision (Kiln Phase Model Tiers AC-FALLBACK-02, technical design
// "The launch decision"): which usage windows count for the model about to run, whether an
// account reads at or above the threshold, which one limit is recorded, and whether a launch goes
// to the fallback. Pure: the engine supplies the readings and the fallback's launch checks.

import type { AgentAccount } from "../agents/metadata.js";
import type { ModelEntry } from "../account/model-list.js";
import { AGENT_NAMES, type AgentId } from "../state/records.js";

/** The one limit a decision records: a window with its percent, or a usage block or used-up attempt with none. */
export interface DecidedLimit { agentId: AgentId; label: string; percent?: number }

/** The decision's result as the session saves it (`launch.fallback`) and the snapshot shows it (`model.fallback`). */
export interface LaunchFallback<Choice = DecisionChoice> {
  used: boolean;
  /** The fallback was used because it is used for everything, with no usage read: no limit or threshold (Kiln Model Modes, "Launching"). */
  forEverything?: true;
  limit?: DecidedLimit;
  threshold?: number;
  /** The first choice, when the launch went to the fallback. */
  first?: Choice;
  /** Why the fallback wasn't used, when it wasn't. */
  reason?: string;
}

export interface DecisionChoice { agentId: AgentId; model: string; modelName: string; effort?: string }

/** One agent's usage as the decision reads it. */
export interface UsageSide {
  agentId: AgentId;
  /** The model about to run on it. */
  model: string;
  /** The reading taken for this launch; undefined when none came back in time. */
  account: AgentAccount | undefined;
  /** The agent's model list read with the usage, which names Codex's model-scoped buckets. */
  models?: ModelEntry[] | undefined;
  /** In a wait: Codex's one automatic attempt is used up for this choice on this reading. */
  attemptUsed?: boolean;
}

export const USAGE_BLOCKED = "ordinary usage blocked";
export const ATTEMPT_USED = "one automatic attempt used";

type Limit = AgentAccount["limits"][number];

/**
 * Whether a usage window counts for the model about to run: every window except one the agent
 * scopes to another model. Claude Code scopes a window by model name, which belongs to the model
 * when it is one of the hyphen-separated parts of its ID. Codex scopes a bucket to its
 * `normalModelSlug`, or, without one, to the listed model whose display name or ID equals its
 * `limitName`, ignoring case; a bucket naming no listed model counts. `limitId` never names a model.
 *
 *   countedFor({ scope: { by: "model", name: "Opus" } }, "claude-sonnet-5-5")  // false
 *   countedFor({ limitName: "GPT Astra" }, "gpt-6.2-sol", [{ value: "gpt-6.2-astra", displayName: "GPT Astra" }])  // false
 */
export function countedFor(limit: Pick<Limit, "scope" | "modelSlug" | "limitName">, model: string, models?: Pick<ModelEntry, "value" | "displayName">[]): boolean {
  const running = model.toLowerCase();
  if (limit.scope?.by === "model") return running.split("-").includes(limit.scope.name.toLowerCase());
  const scoped = limit.modelSlug ?? (limit.limitName ? models?.find(entry => [entry.value, entry.displayName].some(name => name.toLowerCase() === limit.limitName!.toLowerCase()))?.value : undefined);
  return scoped === undefined || scoped.toLowerCase() === running;
}

/** What one account's reading says for the decision: whether it reads, and the limit at or above the threshold. */
export interface UsageVerdict { readable: boolean; over?: DecidedLimit }

/**
 * Reads one side of the decision. As the first choice, the usage reads when Codex reports usage
 * blocked or at least one counted window reads a percent; as the fallback, only when it isn't
 * blocked and every counted window reads a percent. A failed reading, or a plan account's reading
 * with no windows, can't be read; a Claude Code account with no plan reads with no counted limit.
 * Codex's usage block, and a used-up attempt in a wait, count as a limit at or above the threshold.
 */
export function readUsage(side: UsageSide, threshold: number, role: "first" | "fallback"): UsageVerdict {
  const account = side.account;
  // A reading kept from an earlier read is never used: a stale 97% mustn't send a launch to the fallback.
  if (!account || account.error || account.stale || account.limitsStale) return { readable: false };
  const blocked = side.agentId === "codex" && !account.codexUsageStale && account.codexUsage?.state === "blocked" && !account.codexUsage.administrative;
  if (blocked) return { readable: role === "first", over: { agentId: side.agentId, label: USAGE_BLOCKED } };
  if (side.attemptUsed) return { readable: role === "first", over: { agentId: side.agentId, label: ATTEMPT_USED } };
  // A Claude Code account with no plan has no plan limits: its usage reads with no counted limit.
  if (side.agentId === "claude_code" && account.plan === undefined && !account.limitsError && account.limitsUnavailable !== undefined && !account.limits.length) return { readable: true };
  if (account.limitsError) return { readable: false };
  const counted = account.limits.filter(limit => countedFor(limit, side.model, side.models));
  const read = counted.filter(limit => limit.percent !== undefined);
  if (!read.length || role === "fallback" && read.length !== counted.length) return { readable: false };
  const over = recordedLimit(read.filter(limit => limit.percent! >= threshold));
  return over ? { readable: true, over: { agentId: side.agentId, label: over.label, percent: over.percent! } } : { readable: true };
}

/** The counted limit with the highest percent; on a tie, the one that resets latest (unknown latest), then the first in reading order. */
function recordedLimit(limits: Limit[]): Limit | undefined {
  let best: Limit | undefined;
  for (const limit of limits) {
    if (!best || limit.percent! > best.percent! || limit.percent === best.percent && resetsLater(limit, best)) best = limit;
  }
  return best;
}
function resetsLater(a: Limit, b: Limit): boolean {
  if (b.resetsAt === undefined) return false;
  return a.resetsAt === undefined || Date.parse(a.resetsAt) > Date.parse(b.resetsAt);
}

/** "Codex · GPT Astra 1 · high". */
export function choiceWords(choice: Pick<DecisionChoice, "agentId" | "modelName" | "effort">): string {
  return [AGENT_NAMES[choice.agentId], choice.modelName, choice.effort].filter(Boolean).join(" · ");
}

/** "Claude Code's Weekly read 97%", or "Codex's ordinary usage blocked". */
export function limitWords(limit: DecidedLimit): string {
  return limit.percent === undefined ? `${AGENT_NAMES[limit.agentId]}: ${limit.label}` : `${AGENT_NAMES[limit.agentId]}'s ${limit.label} read ${limit.percent}%`;
}

export interface DecideInputs {
  threshold: number;
  first: DecisionChoice;
  fallback: DecisionChoice;
  firstUsage: UsageSide;
  fallbackUsage: UsageSide;
  /** Why the fallback's launch checks fail, read for this launch; undefined when they pass. */
  fallbackProblem?: string | undefined;
}

/**
 * The decision once the switch is on and the activity has a fallback (AC-FALLBACK-02's table):
 * the first choice while its usage is unreadable or every counted limit reads below the
 * threshold; the fallback when its launch checks pass and its usage reads with no counted limit
 * at or above the threshold; otherwise the first choice, recording why the fallback wasn't used.
 *
 *   decideLaunch({ threshold: 95, first, fallback, firstUsage, fallbackUsage })
 *   // { on: "fallback", fallback: { used: true, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95, first } }
 */
export function decideLaunch(inputs: DecideInputs): { on: "first" | "fallback"; fallback?: LaunchFallback } {
  const first = readUsage(inputs.firstUsage, inputs.threshold, "first");
  if (!first.readable || !first.over) return { on: "first" };
  const recorded = { limit: first.over, threshold: inputs.threshold };
  const reason = fallbackReason(inputs);
  if (reason !== undefined) return { on: "first", fallback: { used: false, ...recorded, reason } };
  return { on: "fallback", fallback: { used: true, ...recorded, first: inputs.first } };
}

/** Whether the first choice's account reads at or above the threshold, so the fallback's launch checks run. */
export function firstOverThreshold(firstUsage: UsageSide, threshold: number): boolean {
  const first = readUsage(firstUsage, threshold, "first");
  return first.readable && first.over !== undefined;
}

function fallbackReason(inputs: DecideInputs): string | undefined {
  if (inputs.fallbackProblem !== undefined) return inputs.fallbackProblem;
  const permission = inputs.fallbackUsage.account?.codexUsage;
  if (inputs.fallbackUsage.agentId === "codex" && permission?.state === "blocked" && permission.administrative) return permission.reason;
  const usage = readUsage(inputs.fallbackUsage, inputs.threshold, "fallback");
  if (usage.over) return usage.over.percent === undefined ? `${AGENT_NAMES[usage.over.agentId]}: ${usage.over.label}.` : `${limitWords(usage.over)}, at or above the ${inputs.threshold}% threshold.`;
  if (!usage.readable) return `${AGENT_NAMES[inputs.fallbackUsage.agentId]}'s usage couldn't be read.`;
  return undefined;
}
