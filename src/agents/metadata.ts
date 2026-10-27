import { readAuthStatus, type AccountStatus } from "../account/claude-account.js";
// Selection-scoped metadata. Provider reads never create a conversation or a model turn.
import type { AccountView } from "../account/claude-account.js";
import { ClaudeInfo, type ClaudeInfoSource, ACCOUNT_REFRESH_MS } from "../account/claude-info.js";
import { readSkillList, type ModelEntry } from "../account/model-list.js";
import { type AgentId } from "../state/records.js";
import { METHOD_SKILLS, readCodexMetadata } from "./codex-metadata.js";

export interface AgentAccount extends Omit<AccountView, "limits"> {
  /** Usage is independent of auth-only readiness and retains its own reading time. */
  limitsObservedAt?: string | undefined;
  limitsStale?: boolean;
  /** Codex usage keeps its source workspace even when later auth reads omit routing. */
  limitsAccountId?: string | undefined;
  credits?: import("../billing/inspection.js").WorkspaceCredits[];
  codexUsage?: { state: "allowed" | "blocked" | "unknown"; reason: string; administrative?: boolean };
  codexUsageObservedAt?: string;
  codexUsageStale?: boolean;
  agentId?: AgentId;
  accountId?: string;
  routingAccountId?: string;
  stale?: boolean;
  lastSuccessfulAt?: string;
  limits: { scope?: { by: "model" | "surface"; name: string }; id?: string; kind: string; label: string; shortLabel: string; percent?: number; resetsAt?: string; durationMinutes?: number; nearLimit: boolean }[];
}
export interface MetadataState {
  agentId: AgentId;
  generation: number;
  pending: boolean;
  models?: ModelEntry[] | undefined;
  modelListError?: string | undefined;
  account?: AgentAccount | undefined;
  blockers: string[];
}
function sameAccountContext(previous: AgentAccount, current: AgentAccount): boolean {
  if (previous.agentId === "claude_code" && current.agentId === "claude_code") {
    return !!(current.email || current.orgId) && previous.email === current.email && previous.orgId === current.orgId && previous.plan === current.plan;
  }
  if (previous.email !== current.email || previous.plan !== current.plan) return false;
  const beforeIds = [previous.accountId, previous.routingAccountId, previous.limitsAccountId].filter((id): id is string => !!id);
  const afterIds = [current.accountId, current.routingAccountId].filter((id): id is string => !!id);
  if (new Set([...beforeIds, ...afterIds]).size > 1) return false;
  return !!current.email?.trim() || afterIds.some(id => beforeIds.includes(id));
}
export class AgentInfo {
  state: MetadataState;
  claude: ClaudeInfoSource;
  private readonly ownClaude: boolean;
  private readonly listeners = new Set<() => void>();
  private timer: NodeJS.Timeout | undefined;
  private reading: Promise<void> | undefined;
  private readingContexts = "";
  private contexts: string[];
  private readonly abort = new AbortController();
  private offClaude;
  private lastClaudeAccount: AccountView | undefined;
  constructor(private options: { agentId: AgentId; generation?: number; claude?: ClaudeInfoSource; executable: { claude: string; codex?: string }; cwd: string; claudeCwd: string; env: NodeJS.ProcessEnv }) {
    this.contexts = [options.cwd];
    this.state = { agentId: options.agentId, generation: options.generation ?? 0, pending: true, blockers: [] };
    this.ownClaude = !options.claude;
    this.claude = options.claude ?? new ClaudeInfo({ claude: options.executable.claude, cwd: options.claudeCwd, env: options.env });
    this.offClaude = this.claude.onChange(() => this.claudeChanged());
  }
  select(agentId: AgentId): void {
    if (this.ownClaude && this.claude instanceof ClaudeInfo) {
      this.offClaude(); this.claude.close();
      this.claude = new ClaudeInfo({ claude: this.options.executable.claude, cwd: this.options.claudeCwd, env: this.options.env });
      this.offClaude = this.claude.onChange(() => this.claudeChanged());
    }
    this.contexts = [this.options.cwd];
    this.state = { agentId, generation: this.state.generation + 1, pending: true, blockers: [] };
    this.reading = undefined;
    this.changed();
    void this.refresh();
  }
  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), ACCOUNT_REFRESH_MS);
    this.timer.unref();
  }
  refresh(directories = this.contexts): Promise<void> {
    const cwds = [...new Set(directories)];
    const contextKey = JSON.stringify(cwds);
    if (this.reading) return this.readingContexts === contextKey ? this.reading : this.reading.then(() => this.refresh(cwds));
    this.contexts = cwds;
    this.readingContexts = contextKey;
    const state = this.state;
    const previous = state.account;
    state.pending = true;
    this.changed();
    const read = async () => {
      if (state.agentId === "codex") {
        const result = await readCodexMetadata({ executable: this.options.executable.codex, cwd: this.options.cwd, cwds, env: this.options.env, signal: this.abort.signal });
        if (this.state !== state || this.abort.signal.aborted) return;
        state.models = result.models; state.modelListError = result.modelListError;
        state.blockers = result.blockers;
        state.account = result.account;
      } else {
        await Promise.all([this.claude.refreshAccount(), this.claude.refreshModels?.()]);
        if (this.state !== state || this.abort.signal.aborted) return;
        this.updateClaude();
        const skills = await Promise.all(cwds.map(async cwd => ({ cwd, result: await readSkillList({ claude: this.options.executable.claude, cwd, env: this.options.env, signal: this.abort.signal }) })));
        if (this.state !== state || this.abort.signal.aborted) return;
        for (const { cwd, result } of skills) {
          if (!result.ok) {
            state.blockers.push(`Could not inspect enabled Claude Code skills in ${cwd}: recheck agent information.`);
            continue;
          }
          for (const required of METHOD_SKILLS) {
            if (!result.skills.some(name => name === required || name === `enso-method:${required}`)) state.blockers.push(`Enable or install the Enso Method ${required} skill for Claude Code in ${cwd}.`);
          }
        }
      }
      if (state.account?.error && previous && !previous.error) {
        state.account = { ...previous, stale: true, codexUsageStale: true, lastSuccessfulAt: previous.updatedAt, error: state.account.error };
        delete state.account.credits;
      }
      else if (state.account?.limitsError && previous?.limitsObservedAt && sameAccountContext(previous, state.account)) {
        state.account = { ...state.account, limits: previous.limits, limitsObservedAt: previous.limitsObservedAt, limitsStale: true, ...(state.agentId === "codex" ? { limitsAccountId: previous.limitsAccountId } : {}) };
      }
    };
    const pending = read().catch(() => {
      if (this.state === state) { if (state.account) { delete state.account.credits; state.account.stale = true; state.account.codexUsageStale = true; } state.models = undefined; state.modelListError = "Could not refresh agent metadata."; state.blockers = ["Could not refresh agent readiness. Check the selected agent in a terminal."]; }
    }).finally(() => {
      if (this.state === state && !this.abort.signal.aborted) { state.pending = false; this.reading = undefined; this.changed(); }
    });
    this.reading = pending;
    return pending;
  }
  /** Publish the required catalogue independently of an optional account/usage refresh. */
  async refreshClaudeModels(): Promise<void> {
    const state = this.state;
    await this.claude.refreshModels?.();
    if (state !== this.state || this.abort.signal.aborted) return;
    state.models = this.claude.models; state.modelListError = this.claude.modelListError;
    this.changed();
  }
  /** Required Claude launch readiness uses the inspected auth inputs; optional usage is independent. */
  async refreshClaudeForLaunch(cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<AccountStatus> {
    const state = this.state;
    const startedAt = new Date().toISOString();
    const [auth, , skills] = await Promise.all([
      readAuthStatus({ claude: this.options.executable.claude, cwd, env, signal }),
      this.claude.refreshModels?.(),
      Promise.all([...new Set([cwd, ...this.contexts])].map(async directory => ({ directory, result: await readSkillList({ claude: this.options.executable.claude, cwd: directory, env: this.options.env, signal }) }))),
    ]);
    if (state !== this.state || signal.aborted) return { error: "Claude readiness check was cancelled." };
    state.models = this.claude.models;
    state.modelListError = this.claude.modelListError;
    state.blockers = auth.error ? [auth.error] : [];
    for (const { result } of skills) {
      if (!result.ok) state.blockers.push("Could not inspect enabled Claude Code skills. Recheck agent information.");
      else for (const required of METHOD_SKILLS) if (!result.skills.some(name => name === required || name === `enso-method:${required}`)) state.blockers.push(`Enable or install the Enso Method ${required} skill for Claude Code.`);
    }
    const previous = state.account;
    const account: AgentAccount = { ...auth, agentId: "claude_code", startedAt, updatedAt: new Date().toISOString(), limits: [] };
    const source = this.claude.account;
    const sourceUsage: AgentAccount | undefined = source && !source.error && !source.limitsError ? { ...source, agentId: "claude_code", limitsObservedAt: source.updatedAt } : undefined;
    // An intermediate auth context may have cleared the display. The independent
    // full reader can still establish dated usage for the account now authenticated.
    const usage = previous?.limitsObservedAt && sameAccountContext(previous, account) ? previous : sourceUsage && sameAccountContext(sourceUsage, account) ? sourceUsage : undefined;
    if (usage && !auth.error) {
      account.limits = usage.limits;
      if (usage.limitsObservedAt) account.limitsObservedAt = usage.limitsObservedAt;
      account.limitsStale = true;
      if (usage.limitsError) account.limitsError = usage.limitsError;
      if (usage.extraUsage) account.extraUsage = usage.extraUsage;
    } else account.limitsError = "Usage has not been observed for the current authenticated account.";
    if (auth.error && previous) {
      state.account = { ...previous, error: auth.error, stale: true, limitsStale: true };
    } else state.account = account;
    this.changed();
    return auth;
  }
  private claudeChanged(): void {
    if (this.state.agentId !== "claude_code" || this.state.pending || this.abort.signal.aborted) return;
    // Model catalogue notifications carry no new identity or usage observation.
    if (this.claude.account === this.lastClaudeAccount) {
      this.state.models = this.claude.models; this.state.modelListError = this.claude.modelListError;
      this.changed(); return;
    }
    const previous = this.state.account;
    this.updateClaude();
    const account = this.state.account;
    if (this.claude.refreshModels && (previous?.email !== account?.email || previous?.orgId !== account?.orgId || previous?.plan !== account?.plan || previous?.error !== account?.error)) {
      this.state.models = undefined;
      void this.refresh();
    } else this.changed();
  }
  private updateClaude(): void {
    this.state.models = this.claude.models;
    this.state.modelListError = this.claude.modelListError;
    this.lastClaudeAccount = this.claude.account;
    this.state.account = this.claude.account ? { ...this.claude.account, agentId: "claude_code", ...(!this.claude.account.error && !this.claude.account.limitsError ? { limitsObservedAt: this.claude.account.updatedAt } : {}) } : undefined;
    this.state.blockers = !this.claude.account ? ["Claude Code account is unavailable. Check claude auth login in a terminal."] : this.claude.account.error ? [this.claude.account.error] : [];
  }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private changed(): void { for (const listener of this.listeners) listener(); }
  close(): void { clearInterval(this.timer); this.abort.abort(); this.offClaude(); if (this.ownClaude && this.claude instanceof ClaudeInfo) this.claude.close(); }
}
