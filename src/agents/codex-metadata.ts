import { readFileSync } from "node:fs";
import type { ModelEntry } from "../account/model-list.js";
import type { AgentAccount } from "./metadata.js";
import { runHelper } from "../platform/helper-process.js";
import { CodexMetadataRpc } from "./codex-metadata-rpc.js";

export const CODEX_VERSION = "0.162.1";
export const METHOD_SKILLS = ["implement-from-requirements", "deliverable-review", "test-hardening", "refactor-pass", "implementation-lifecycle", "engineering-principles", "pre-commit-validation", "continuation-prompt", "phase-split"];
interface CodexModel { model: string; displayName: string; description: string; hidden?: boolean; selectable?: boolean; supportedReasoningEfforts: { reasoningEffort: string; description?: string }[]; defaultReasoningEffort?: string }
interface AccountResult { account?: { type: string; email?: string; planType?: string } | null; workspaceRouting?: { chatgptAccountId?: string } }
interface Window { usedPercent?: number | null; windowDurationMins?: number | null; resetsAt?: number | null }
interface Bucket { limitId?: string | null; limitName?: string | null; primary?: Window | null; secondary?: Window | null }
export interface CodexLimits { accountId?: string; ordinaryUsageAllowed?: boolean | null; rateLimitsByLimitId?: Record<string, Bucket> | null; rateLimits?: Bucket | null }
interface Skill { name: string; path: string; enabled: boolean }
export interface CodexMetadata { models?: ModelEntry[]; modelListError?: string; account: AgentAccount; blockers: string[]; version?: string; skills: { cwd: string; entries: Skill[] }[] }

export function codexModels(data: CodexModel[]): ModelEntry[] {
  return data.filter((m) => !m.hidden && m.selectable !== false).map((m) => ({
    value: m.model, resolvedModel: m.model, displayName: m.displayName, description: m.description,
    supportsEffort: m.supportedReasoningEfforts.length > 0,
    supportedEffortLevels: m.supportedReasoningEfforts.map((e) => e.reasoningEffort), supportsAutoMode: true,
    efforts: m.supportedReasoningEfforts.map((e) => ({ value: e.reasoningEffort, label: e.reasoningEffort.charAt(0).toUpperCase() + e.reasoningEffort.slice(1), ...(e.description ? { description: e.description } : {}) })),
    ...(m.defaultReasoningEffort ? { defaultEffort: m.defaultReasoningEffort } : {}),
  }));
}
export function latestSol(models: ModelEntry[]): string | undefined {
  const candidates = models.flatMap((m) => { const match = /^gpt-(\d+(?:\.\d+)*)-sol$/i.exec(m.value); return match ? [{ model: m, version: match[1]!.split(".").map(Number) }] : []; });
  const compare = (a: number[], b: number[]) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const n = (b[i] ?? 0) - (a[i] ?? 0); if (n) return n; } return 0; };
  candidates.sort((a, b) => compare(a.version, b.version));
  const first = candidates[0];
  if (!first || (candidates[1] && compare(first.version, candidates[1].version) === 0) || !first.model.supportedEffortLevels.includes("high")) return undefined;
  return first.model.value;
}
export function codexAccount(account: AccountResult, usage: CodexLimits | undefined, startedAt: string): AgentAccount {
  const result: AgentAccount = { agentId: "codex", startedAt, updatedAt: new Date().toISOString(), limits: [] };
  if (account.account?.type !== "chatgpt") result.error = "Sign in to Codex with ChatGPT in a terminal: codex login. API-key-only accounts are not supported.";
  if (account.account?.email) result.email = account.account.email;
  if (account.account?.planType) result.plan = account.account.planType;
  if (usage?.accountId) result.accountId = usage.accountId;
  const routing = account.workspaceRouting?.chatgptAccountId;
  if (routing) result.routingAccountId = routing;
  if (routing && usage?.accountId && routing !== usage.accountId) {
    result.limitsError = "Codex account changed during the reading. Refresh to read its usage.";
    return result;
  }
  const buckets = usage?.rateLimitsByLimitId !== undefined && usage.rateLimitsByLimitId !== null ? Object.entries(usage.rateLimitsByLimitId) : usage?.rateLimits ? [["legacy", usage.rateLimits] as const] : [];
  for (const [id, bucket] of buckets) {
    for (const role of ["primary", "secondary"] as const) {
      const window = bucket[role];
      if (!window) continue;
      const percent = typeof window.usedPercent === "number" && Number.isFinite(window.usedPercent) ? window.usedPercent : undefined;
      const name = bucket.limitName ?? bucket.limitId ?? id;
      const label = `${name === id ? id : `${name} [${id}]`} · ${role}`;
      result.limits.push({ id: `${id}:${role}`, kind: `${id}:${role}`, label, shortLabel: label, ...(percent === undefined ? {} : { percent }), nearLimit: percent !== undefined && percent >= 80,
        ...(typeof window.windowDurationMins === "number" ? { durationMinutes: window.windowDurationMins } : {}),
        ...(typeof window.resetsAt === "number" && Number.isFinite(window.resetsAt) && Math.abs(window.resetsAt * 1000) < 8.64e15 ? { resetsAt: new Date(window.resetsAt * 1000).toISOString() } : {}) });
    }
  }
  if (!result.limits.length) result.limitsError = "Codex did not report usage windows. Allowance is unknown.";
  return result;
}
export async function readCodexMetadata(options: { executable: string | undefined; cwd: string; cwds: string[]; env: NodeJS.ProcessEnv; signal?: AbortSignal }): Promise<CodexMetadata> {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + 30_000;
  const result: CodexMetadata = { account: { agentId: "codex", startedAt, updatedAt: startedAt, limits: [] }, blockers: [], skills: [] };
  if (!options.executable) { result.blockers.push("Codex is not on PATH. Install codex-cli 0.162.1 and sign in with codex login."); return result; }
  const version = await runHelper(options.executable, ["--version"], { cwd: options.cwd, env: options.env, ...(options.signal ? { signal: options.signal } : {}), timeoutMs: 30_000 });
  result.version = version.stdout.trim();
  if (version.exitCode !== 0 || result.version !== `codex-cli ${CODEX_VERSION}`) { result.blockers.push(`Codex ${result.version || "version unavailable"} is incompatible. This candidate requires codex-cli ${CODEX_VERSION}.`); return result; }
  const rpc = new CodexMetadataRpc(options.executable, options.cwd, options.env, options.signal, Math.max(1, deadline - Date.now()));
  try {
    await rpc.initialize();
    const collectModels = async () => {
      const models: CodexModel[] = []; let cursor: string | null = null; const seen = new Set<string>();
      do {
        const page: { data: CodexModel[]; nextCursor: string | null } = await rpc.call("model/list", { includeHidden: false, cursor, limit: 100 });
        models.push(...page.data); cursor = page.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error("Codex model pagination repeated a cursor.");
        if (cursor) seen.add(cursor);
        if (models.length > 10_000) throw new Error("Codex model catalogue exceeds scan limit.");
      } while (cursor);
      return codexModels(models);
    };
    const [models, account, limits, requirements, skills, configuration] = await Promise.allSettled([
      collectModels(), rpc.call<AccountResult>("account/read", { refreshToken: false }), rpc.call<CodexLimits>("account/rateLimits/read"),
      rpc.call<{ requirements: Record<string, unknown> | null }>("configRequirements/read"),
      rpc.call<{ data: { cwd: string; skills: Skill[] }[] }>("skills/list", { cwds: options.cwds, forceReload: true }),
      rpc.call<{ config: { model_provider: string | null; hooks?: unknown } }>("config/read", { includeLayers: false }),
    ]);
    if (models.status === "fulfilled") result.models = models.value; else result.modelListError = "Could not read Codex models. Refresh before starting a session.";
    if (account.status === "fulfilled") result.account = codexAccount(account.value, limits.status === "fulfilled" ? limits.value : undefined, startedAt);
    else result.account.error = "Could not read Codex account. Check codex login in a terminal.";
    if (limits.status === "rejected") result.account.limitsError = "Could not refresh Codex usage. Allowance is unknown.";
    if (result.account.error) result.blockers.push(result.account.error);
    if (requirements.status === "rejected") result.blockers.push("Could not read Codex managed requirements. Check Codex in a terminal.");
    else if (requirements.value.requirements !== null) {
      const req = requirements.value.requirements;
      const expected: Record<string, string> = { allowedApprovalPolicies: "on-request", allowedApprovalsReviewers: "auto_review", allowedSandboxModes: "workspace-write" };
      if (process.platform === "win32") expected.allowedWindowsSandboxImplementations = "mxc";
      for (const [key, value] of Object.entries(req)) {
        if (value === null || value === undefined) continue;
        if (key in expected && Array.isArray(value) && value.includes(expected[key])) continue;
        result.blockers.push(`Codex managed requirement ${key} needs compatibility validation. Resolve policy requirements in Codex; Kiln will not bypass them.`);
      }
    }
    if (configuration.status === "rejected") result.blockers.push("Could not inspect Codex provider and hooks. Resolve configuration in Codex before starting work.");
    else {
      // In the pinned profile, unset/null uses built-in OpenAI (also verified by gate-1 effective settings).
      const provider = configuration.value.config.model_provider;
      if (provider !== null && provider !== "openai") result.blockers.push("Kiln's Codex candidate requires the OpenAI provider and existing ChatGPT sign-in.");
      const hooks = configuration.value.config.hooks;
      if (hooks !== undefined && hooks !== null && (typeof hooks !== "object" || Object.keys(hooks).length > 0)) result.blockers.push("This Codex hook configuration has not been qualified for unattended work. Resolve interactive hook or trust requirements in a terminal; Kiln will not bypass them.");
    }
    if (skills.status === "rejected") result.blockers.push("Could not inspect enabled Enso Method skills for the launch directories.");
    else for (const cwd of options.cwds) {
      const entries = skills.value.data.find((d) => d.cwd === cwd)?.skills ?? [];
      result.skills.push({ cwd, entries });
      for (const required of METHOD_SKILLS) {
        const matches = entries.filter((s) => s.enabled && (s.name === required || s.name === `enso-method:${required}`));
        if (matches.length !== 1) { result.blockers.push(`Enable one Enso Method ${required} skill for ${cwd}.`); continue; }
        try { readFileSync(matches[0]!.path, "utf8"); } catch { result.blockers.push(`Enso Method ${required} is unreadable at ${matches[0]!.path}. Reinstall that skill.`); }
      }
    }
  } catch { result.blockers.push("Codex metadata failed. Check Codex installation and sign-in in a terminal."); }
  finally { await rpc.close(); }
  result.account.updatedAt = new Date().toISOString();
  return result;
}
