import { readFileSync } from "node:fs";
import type { ModelEntry } from "../account/model-list.js";
import type { AgentAccount } from "./metadata.js";
import { runHelper } from "../platform/helper-process.js";
import { CodexMetadataRpc } from "./codex-metadata-rpc.js";

import { CODEX_VERSION_REQUIREMENT, supportedCodexVersion } from "./codex-version.js";
export const METHOD_SKILLS = ["implement-from-requirements", "deliverable-review", "test-hardening", "refactor-pass", "implementation-lifecycle", "engineering-principles", "pre-commit-validation", "continuation-prompt", "phase-split"];
interface CodexModel { model: string; displayName: string; description: string; hidden?: boolean; selectable?: boolean; supportedReasoningEfforts: { reasoningEffort: string; description?: string }[]; defaultReasoningEffort?: string }
export interface AccountResult { account?: { type: string; email?: string; planType?: string } | null; workspaceRouting?: { chatgptAccountId?: string } }
interface Window { usedPercent?: number | null; windowDurationMins?: number | null; resetsAt?: number | null }
interface Bucket { credits?: { balance?: string | null; hasCredits?: boolean; unlimited?: boolean } | null; limitId?: string | null; limitName?: string | null; primary?: Window | null; secondary?: Window | null; spendControlReached?: boolean | null; rateLimitReachedType?: string | null }
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
/** A usage account ID alone cannot bind two otherwise unidentified auth reads. */
function usageBindingError(before: AccountResult, usage: CodexLimits | undefined, after: AccountResult): string | undefined {
  if (before.account?.type !== "chatgpt" || after.account?.type !== "chatgpt") return "Codex ChatGPT authentication changed or is unavailable.";
  if (before.account.email !== after.account.email || before.account.planType !== after.account.planType) return "Codex account identity changed during the usage reading.";
  if (!usage?.accountId?.trim()) return "Codex did not establish a stable usage account identity.";
  const routes = [before.workspaceRouting?.chatgptAccountId, after.workspaceRouting?.chatgptAccountId];
  if (routes.some(route => route !== undefined && route !== usage.accountId)) return "Codex account identity changed during the usage reading.";
  if (!after.account.email?.trim() && !routes.every(route => route === usage.accountId)) return "Codex account identity could not be corroborated across the usage reading.";
  return undefined;
}
export function codexAccount(before: AccountResult, usage: CodexLimits | undefined, account: AccountResult, startedAt: string, usageObservedAt: string): AgentAccount {
  const result: AgentAccount = { agentId: "codex", startedAt, updatedAt: new Date().toISOString(), limits: [] };
  if (account.account?.type !== "chatgpt") result.error = "Sign in to Codex with ChatGPT in a terminal: codex login. API-key-only accounts are not supported.";
  if (account.account?.type === "chatgpt" && account.account.email) result.email = account.account.email;
  if (account.account?.type === "chatgpt" && account.account.planType) result.plan = account.account.planType;
  const routing = account.workspaceRouting?.chatgptAccountId;
  if (routing && account.account?.type === "chatgpt") result.routingAccountId = routing;
  const bindingError = usageBindingError(before, usage, account);
  if (bindingError) { result.limitsError = bindingError; return result; }
  result.accountId = usage!.accountId!;
  const buckets = usage?.rateLimitsByLimitId !== undefined && usage!.rateLimitsByLimitId !== null ? Object.entries(usage!.rateLimitsByLimitId) : usage?.rateLimits ? [["legacy", usage!.rateLimits] as const] : [];
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
  if (result.limits.length) { result.limitsObservedAt = usageObservedAt; result.limitsAccountId = usage!.accountId!; }
  else result.limitsError = "Codex did not report usage windows. Allowance is unknown.";
  return result;
}

/** Optional workspace facts, qualified against the pinned schema and live metadata-only reads.
 * Credits never participate in ordinary-usage permission or recovery authorization. */
export function codexCredits(before: AccountResult, usage: CodexLimits | undefined, after: AccountResult, observedAt: string): NonNullable<AgentAccount["credits"]> {
  if (usageBindingError(before, usage, after)) return [];
  const accountId = usage!.accountId!;
  const buckets = usage!.rateLimitsByLimitId != null ? Object.entries(usage!.rateLimitsByLimitId) : usage!.rateLimits ? [["legacy", usage!.rateLimits] as const] : [];
  return buckets.flatMap(([bucketId, bucket]) => {
    const credits = bucket?.credits;
    if (!credits || typeof credits !== "object") return [];
    const balance = typeof credits.balance === "string" && credits.balance.length <= 128 && /^\d+(?:\.\d+)?$/.test(credits.balance) ? credits.balance : undefined;
    const hasCredits = typeof credits.hasCredits === "boolean" ? credits.hasCredits : undefined;
    if (balance === undefined && hasCredits === undefined) return [];
    return [{ bucketId, accountId, observedAt, scope: "workspace" as const, ...(balance === undefined ? {} : { balance }), ...(hasCredits === undefined ? {} : { hasCredits }) }];
  });
}

/** The pinned schema supplies account-wide permission, never model scope via normalModelSlug. */
export function codexUsagePermission(before: AccountResult, usage: CodexLimits | undefined, after: AccountResult): NonNullable<AgentAccount["codexUsage"]> {
  const unknown = (reason: string) => ({ state: "unknown" as const, reason });
  const bindingError = usageBindingError(before, usage, after);
  if (bindingError) return unknown(bindingError);
  const buckets = usage!.rateLimitsByLimitId != null ? Object.values(usage!.rateLimitsByLimitId) : usage!.rateLimits ? [usage!.rateLimits] : [];
  // This profile reports no authoritative model scope. Never treat a quota alias as one.
  if (buckets.some(bucket => bucket.spendControlReached === true || bucket.rateLimitReachedType != null && bucket.rateLimitReachedType !== "rate_limit_reached")) return { state: "blocked", administrative: true, reason: "Codex reports an administrative, credit or spend-control block. Resolve it in Codex before resuming." };
  if (usage!.ordinaryUsageAllowed === false) return { state: "blocked", reason: "Codex reports that ordinary included usage is blocked." };
  if (usage!.ordinaryUsageAllowed === true) return { state: "allowed", reason: "Codex permits one original-model attempt using ordinary included usage; model access is not guaranteed." };
  return unknown("Codex ordinary-usage permission is unavailable. This version supplies no applicable structured reset; resume manually when ready.");
}
export async function readCodexMetadata(options: { executable: string | undefined; cwd: string; cwds: string[]; env: NodeJS.ProcessEnv; signal?: AbortSignal }): Promise<CodexMetadata> {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + 30_000;
  const unavailable = (reason: string): AgentAccount => ({ agentId: "codex", startedAt, updatedAt: new Date().toISOString(), limits: [], error: reason, limitsError: "Codex usage is unavailable because account metadata could not be read." });
  const result: CodexMetadata = { account: unavailable("Codex account metadata has not been read."), blockers: [], skills: [] };
  if (!options.executable) { result.account = unavailable(`Codex is not on PATH. Install ${CODEX_VERSION_REQUIREMENT} and sign in with codex login.`); result.blockers.push(result.account.error!); return result; }
  const version = await runHelper(options.executable, ["--version"], { cwd: options.cwd, env: options.env, ...(options.signal ? { signal: options.signal } : {}), timeoutMs: 30_000 });
  result.version = version.stdout.trim();
  if (version.exitCode !== 0 || !supportedCodexVersion(result.version)) { result.account = unavailable(`Codex ${result.version || "version unavailable"} is incompatible. Kiln requires ${CODEX_VERSION_REQUIREMENT}.`); result.blockers.push(result.account.error!); return result; }
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
    const readAccount = async () => {
      const before = await rpc.call<AccountResult>("account/read", { refreshToken: false });
      let usage: CodexLimits | undefined;
      let usageObservedAt = "";
      try { usage = await rpc.call<CodexLimits>("account/rateLimits/read"); usageObservedAt = new Date().toISOString(); } catch { /* Display the failed read as unknown; normal work remains permitted. */ }
      const after = await rpc.call<AccountResult>("account/read", { refreshToken: false });
      const account = codexAccount(before, usage, after, startedAt, usageObservedAt);
      account.codexUsage = codexUsagePermission(before, usage, after);
      account.codexUsageObservedAt = account.updatedAt;
      account.codexUsageStale = false;
      const credits = codexCredits(before, usage, after, usageObservedAt);
      if (credits.length) account.credits = credits;
      if (!usage) account.limitsError = "Could not refresh Codex usage. Allowance is unknown.";
      return account;
    };
    const [models, account, requirements, skills, configuration] = await Promise.allSettled([
      collectModels(), readAccount(),
      rpc.call<{ requirements: Record<string, unknown> | null }>("configRequirements/read"),
      rpc.call<{ data: { cwd: string; skills: Skill[] }[] }>("skills/list", { cwds: options.cwds, forceReload: true }),
      rpc.call<{ config: { model_provider: string | null; hooks?: unknown } }>("config/read", { includeLayers: false }),
    ]);
    if (models.status === "fulfilled") result.models = models.value; else result.modelListError = "Could not read Codex models. Refresh before starting a session.";
    if (account.status === "fulfilled") result.account = account.value;
    else result.account = unavailable("Could not read Codex account. Check codex login in a terminal.");
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
      if (provider !== null && provider !== "openai") result.blockers.push("Kiln's Codex candidate requires the OpenAI provider and existing ChatGPT sign-in. Change the model provider in Codex settings to OpenAI, then refresh Codex information.");
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
  } catch { result.account = unavailable("Codex metadata failed. Check Codex installation and sign-in in a terminal."); result.blockers.push(result.account.error!); }
  finally { await rpc.close(); }
  return result;
}
