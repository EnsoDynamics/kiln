// Resolving a choice (Kiln Phase Model Tiers, technical design "Resolving a Choice"): the one
// function every row, readiness check, launch and status reply asks for an activity's model. The
// order is fixed: what it started on; its own entry; the PRD's kept choice; then, from the settings
// in force, the one model or its row, with the Fallback column's choice when Claude Code isn't
// installed (DEF-003); and last, while the fallback is used for everything, its fallback in place
// of that choice (Kiln Model Modes, "Resolving a Choice").

import { autoModeError, type ModelEntry } from "../account/model-list.js";
import type { Tier } from "../plan/phase-document.js";
import { AGENT_NAMES, type AgentId } from "../state/records.js";
import { fallbackInForce, oneModelOf, type DefaultsRow, type FamilyChoice, type ModelChoice, type ModelDefaults } from "./model-defaults.js";

/** A choice with what the row shows: the model's name as the agent reports it, and why it can't be used. */
export interface ResolvedChoice {
  agentId: AgentId;
  /** The agent's model-list value; absent while a family can't be resolved. */
  model?: string;
  /** "Opus 5.5", or the family's name ("Opus", "GPT Sol") while it can't be resolved. */
  modelName: string;
  effort?: string;
  /** Why this choice can't be used, known before launch (AC-PICK-06). */
  problem?: string;
}

/** Where steps 2 to 4 took a choice from: a row of the settings in force, a change for this PRD, or the one model. */
export type ChoiceSource = "model_defaults" | "changed" | "one_model";

/** What an activity runs on before it starts, and where that came from. */
export interface ActivityChoice extends ResolvedChoice {
  from: ChoiceSource;
  claudeCodeMissing?: true;
  /** The row its choice came from, when it came from a row: its first choice, or its fallback used for everything. */
  row?: DefaultsRow;
  /** The settings in force were the PRD's own, not Model defaults. */
  ownSettings?: true;
  /** The fallback is used for everything and this is the activity's fallback: the choice steps 2 to 4 gave is kept as its first choice. */
  everything?: { first: ResolvedChoice };
  /** The fallback is used for everything and the activity has none, so it keeps its own choice. */
  noFallback?: true;
  /** The settings in force can't be read, so Kiln can't tell whether this choice would give way to its fallback: it can't be used, and changing it isn't the remedy. */
  settingsUnreadable?: true;
}

/** What the agent's model list reads now. `pending` while the first read hasn't finished. */
export interface ModelList { models?: ModelEntry[] | undefined; error?: string | undefined; pending?: boolean }

/** A family's name as a person reads it: Claude Code's alias capitalised, Codex's after "GPT". */
export function familyName(choice: Pick<FamilyChoice, "agentId" | "family">): string {
  const word = choice.family.charAt(0).toUpperCase() + choice.family.slice(1);
  return choice.agentId === "codex" ? `GPT ${word}` : word;
}

/** The row a phase's tier uses, Not rated using Standard; an audit uses Audits; every other activity Preflight and pull request (AC-ROW-01). */
export function defaultsRowFor(tier: Tier | undefined | "audits" | "preflight_pr"): DefaultsRow {
  return tier ?? "standard";
}

/** A Codex model's version and family, from `gpt-<version>-<family>`; undefined outside that pattern. */
export function codexFamilyOf(model: string): { version: number[]; family: string } | undefined {
  const match = /^gpt-(\d+(?:\.\d+)*)-([a-z]+)$/i.exec(model);
  return match ? { version: match[1]!.split(".").map(Number), family: match[2]!.toLowerCase() } : undefined;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const n = (a[i] ?? 0) - (b[i] ?? 0); if (n) return n; }
  return 0;
}

/**
 * The newest model of a family its agent offers (AC-DEFAULT-01): Claude Code's alias entry, which
 * Claude Code resolves to its newest version itself, or Codex's `gpt-<version>-<family>` with the
 * greatest numeric version. A family with two models at the newest version has no single newest.
 *
 *   newestOfFamily({ agentId: "codex", family: "sol" }, codexModels)  // the gpt-6.2-sol entry
 */
export function newestOfFamily(choice: Pick<FamilyChoice, "agentId" | "family">, models: ModelEntry[]): { entry?: ModelEntry; problem?: string } {
  const name = familyName(choice);
  if (choice.agentId === "claude_code") {
    const entry = models.find(one => one.value === choice.family);
    return entry ? { entry } : { problem: `Claude Code doesn't offer ${name} on this account.` };
  }
  const family = choice.family.toLowerCase();
  const candidates = models.flatMap(entry => { const parsed = codexFamilyOf(entry.value); return parsed?.family === family ? [{ entry, version: parsed.version }] : []; });
  candidates.sort((a, b) => compareVersions(b.version, a.version));
  const [first, second] = candidates;
  if (!first) return { problem: `Codex doesn't offer a ${name} model on this account.` };
  if (second && compareVersions(first.version, second.version) === 0) return { problem: `Codex offers more than one newest ${name} model, so Kiln can't tell which to use.` };
  return { entry: first.entry };
}

/** Whether a model takes this effort, and the choice to save: none for a model that takes no effort. */
function effortProblem(entry: ModelEntry, effort: string | undefined): { effort?: string; problem?: string } {
  if (!entry.supportsEffort) return {};
  if (!effort) return { problem: `Choose an effort for ${entry.displayName}.` };
  if (!entry.supportedEffortLevels.includes(effort)) return { problem: `${entry.displayName} doesn't offer ${effort} effort.` };
  return { effort };
}

function listProblem(agentId: AgentId, list: ModelList): string {
  if (list.pending) return `Reading ${AGENT_NAMES[agentId]} models…`;
  return list.error ?? `${AGENT_NAMES[agentId]}'s model list can't be read.`;
}

/** A Model defaults side against its agent's model list now. */
export function resolveFamily(choice: FamilyChoice, list: ModelList): ResolvedChoice {
  const name = familyName(choice);
  const base = { agentId: choice.agentId, ...(choice.effort ? { effort: choice.effort } : {}) };
  if (!list.models) return { ...base, modelName: name, problem: listProblem(choice.agentId, list) };
  const found = newestOfFamily(choice, list.models);
  if (!found.entry) return { ...base, modelName: name, problem: found.problem! };
  const entry = found.entry;
  const effort = effortProblem(entry, choice.effort);
  const problem = effort.problem ?? (choice.agentId === "claude_code" ? autoModeError(entry) : undefined);
  return { agentId: choice.agentId, model: entry.value, modelName: entry.displayName, ...(effort.effort ? { effort: effort.effort } : entry.supportsEffort && choice.effort ? { effort: choice.effort } : {}), ...(problem ? { problem } : {}) };
}

/** A saved choice for one activity (a change, or a kept choice) against its agent's model list now. */
export function resolveModel(choice: ModelChoice, list: ModelList): ResolvedChoice {
  const base = { agentId: choice.agentId, model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}) };
  if (!list.models) return { ...base, modelName: choice.model, problem: listProblem(choice.agentId, list) };
  const entry = list.models.find(one => one.value === choice.model);
  if (!entry) return { ...base, modelName: choice.model, problem: `${AGENT_NAMES[choice.agentId]} doesn't offer ${choice.model} on this account.` };
  const effort = effortProblem(entry, choice.effort);
  const problem = effort.problem ?? (choice.agentId === "claude_code" ? autoModeError(entry) : undefined);
  return { agentId: choice.agentId, model: entry.value, modelName: entry.displayName, ...(effort.effort ? { effort: effort.effort } : entry.supportsEffort && choice.effort ? { effort: choice.effort } : {}), ...(problem ? { problem } : {}) };
}

export interface ResolveInputs {
  /** The settings in force: the PRD's own, or Model defaults. */
  defaults: ModelDefaults;
  /** Which of the two they are; Model defaults when left out. */
  source?: "defaults" | "prd" | undefined;
  /** The activity's own entry: a phase's, the PRD's Audits entry, or its Preflight and pull request entry. */
  entry?: ModelChoice | "default" | undefined;
  kept?: ModelChoice | undefined;
  row: DefaultsRow;
  claudeCodeInstalled: boolean;
  lists: Partial<Record<AgentId, ModelList>>;
}

/**
 * Steps 2 to 5 of "Resolving a Choice", for an activity with no start. Steps 2 to 4: its own
 * entry, the PRD's kept choice, then from the settings in force the one model, or its row's first
 * choice, or that row's Fallback column choice when the first is on Claude Code and Claude Code
 * isn't installed (DEF-003). Step 5: while the fallback is used for everything, an activity with a
 * fallback takes it as its choice, keeping what steps 2 to 4 gave as its first choice, and one
 * with none is marked as having no fallback (AC-WHEN-02).
 *
 *   resolveNotStarted({ defaults: forEverything, row: "demanding", … })
 *   // { agentId: "codex", modelName: "GPT-6.2-Astra", from: "model_defaults", row: "demanding", everything: { first: { agentId: "claude_code", modelName: "Fable 5.2", … } } }
 */
export function resolveNotStarted(inputs: ResolveInputs): ActivityChoice {
  const own = inputs.source === "prd" ? { ownSettings: true as const } : {};
  const choice: ActivityChoice = { ...ownChoice(inputs), ...own };
  if (fallbackInForce(inputs.defaults) !== "everything") return choice;
  const fallback = fallbackFor(inputs, choice);
  if (!fallback) return { ...choice, noFallback: true };
  return { ...fallback, from: choice.from, row: inputs.row, ...own, everything: { first: resolvedOnly(choice) } };
}

/** A choice without where it came from. */
function resolvedOnly(choice: ResolvedChoice): ResolvedChoice {
  return { agentId: choice.agentId, ...(choice.model === undefined ? {} : { model: choice.model }), modelName: choice.modelName, ...(choice.effort === undefined ? {} : { effort: choice.effort }), ...(choice.problem === undefined ? {} : { problem: choice.problem }) };
}

/** Steps 2 to 4. */
function ownChoice(inputs: ResolveInputs): ActivityChoice {
  const list = (agentId: AgentId) => inputs.lists[agentId] ?? { pending: true };
  if (inputs.entry && inputs.entry !== "default") return { ...resolveModel(inputs.entry, list(inputs.entry.agentId)), from: "changed" };
  if (inputs.entry === undefined && inputs.kept) return { ...resolveModel(inputs.kept, list(inputs.kept.agentId)), from: "changed" };
  if (inputs.defaults.mode === "one_model") {
    const one = oneModelOf(inputs.defaults, inputs.claudeCodeInstalled);
    return { ...resolveFamily(one, list(one.agentId)), from: "one_model" };
  }
  const row = inputs.defaults.rows[inputs.row];
  if (row.first.agentId === "claude_code" && !inputs.claudeCodeInstalled) {
    return { ...resolveFamily(row.fallback, list(row.fallback.agentId)), from: "model_defaults", row: inputs.row, claudeCodeMissing: true };
  }
  return { ...resolveFamily(row.first, list(row.first.agentId)), from: "model_defaults", row: inputs.row };
}

/**
 * The activity's fallback (AC-FALLBACK-02): its row's Fallback column choice in the settings in
 * force. None when that is on the choice's own agent, while one model runs everything, whatever
 * step gave its choice (AC-MODE-03), or once the fallback used for everything has become its
 * choice (step 5).
 */
export function fallbackFor(inputs: Pick<ResolveInputs, "defaults" | "row" | "lists">, choice: Pick<ActivityChoice, "agentId" | "everything">): ResolvedChoice | undefined {
  if (inputs.defaults.mode === "one_model" || choice.everything) return undefined;
  const fallback = inputs.defaults.rows[inputs.row].fallback;
  if (fallback.agentId === choice.agentId) return undefined;
  return resolveFamily(fallback, inputs.lists[fallback.agentId] ?? { pending: true });
}
