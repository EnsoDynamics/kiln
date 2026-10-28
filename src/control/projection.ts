import { messageReceiptLabel } from "../live/target.js";
import { expandHome } from "../engine/worktree-setup.js";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, openSync, closeSync, readSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { recentSavedOutput } from "./logs.js";
import { readWork } from "./private-state.js";
import { sessionStorageKey } from "../state/records.js";
import type { SessionRecord } from "../state/records.js";
import type { OutputLine } from "../session/session-output.js";
import type { Engine } from "../engine/engine.js";
import { buildSnapshot, codexResumeCommand, resumeCommand, codexCommand, claudeCommand, type Snapshot, type LimitView } from "../engine/snapshot.js";
import { freshSessionPrompt, resumePrompt, auditRecoveryPrompt, pullRequestSessionPrompt, codexSessionPrompt } from "../session/prompts.js";
import { claudeConfigFolder, findTranscripts } from "../session/transcripts.js";
import { CodexHistoryRpc } from "../session/codex-history-rpc.js";
import { selectedChoice } from "../state/records.js";
import { writeJsonAtomically } from "../state/state-files.js";
import type { BillingView } from "../billing/authority.js";
import { publicProvenance, publicUsage } from "./public-facts.js";
import { ownResult } from "./spool.js";
import type { AgentAccount } from "../agents/metadata.js";
import { privateJson, deadlineCheck, safeSelector, type SavedWork } from "./private-state.js";
import { chooseSession, readHistory, newestSession, workingDirectoryAvailable, type Conversation, type History } from "./history.js";
import { ControlFailure, errorFact, result, type Result } from "./result.js";
import { latestActivity, type ActivityObservation } from "./activity.js";

export const PLANNED_CONTROLS = ["reply", "resume", "verify-and-advance", "request-pause", "cancel-pause", "continue", "check-again", "settings", "outside-confirmation", "message", "take-over"];
interface Instructions { continuation_prompt: string | null; fresh_session_instructions: { command: string; prompt: string } | null }
export interface InspectionCache { version: 1; execution_id: string; observed_at: string; snapshot: Snapshot; last_activity?: ActivityObservation; handoffs?: Record<string, Instructions> }
function instructionsFor(engine: Engine, selected: Conversation, view: Snapshot): Instructions {
  const session = selected.record; const cwd = engine.workingDirectoryOf(session);
  const current = view.needsYou?.sessionId === session.sessionId ? view.needsYou : undefined;
  if (current) return { continuation_prompt: current.resumePrompt ?? null, fresh_session_instructions: { command: current.freshSessionCommand, prompt: current.freshSessionPrompt } };
  const run = session.runs.at(-1); const plan = engine.record.plan?.find(p => p.id === selected.phase);
  const task = engine.auditRecoveryTask(selected.phase, cwd);
  const fresh = task ? auditRecoveryPrompt(task, engine.deliveryAuthority())
    : session.kind === "pull_request" ? pullRequestSessionPrompt({ deliveryAuthority: engine.deliveryAuthority(), featureName: engine.paths.featureName, prdFile: engine.pathFrom(cwd, engine.prdFile()), branch: engine.record.settings.featureBranch,
      repositories: engine.pullRequestRepositories().map(r => ({ name: r.name, github: r.github, worktreePath: expandHome(r.worktreePath), baseBranch: r.baseBranch, isPrd: r.kind === "prd" })) })
    : plan ? freshSessionPrompt(engine.phasePromptValues(plan.file, cwd), true) : null;
  const providerFresh = fresh && session.agentId === "codex" && session.kind === "phase" && session.codex ? codexSessionPrompt(fresh, session.codex.launchIntent.skills) : fresh;
  return {
    continuation_prompt: resumePrompt({ agentId: session.agentId ?? "claude_code", endedOnItsOwn: !!run?.endedAt, ...(run?.interruptedBy ? { cause: run.interruptedBy } : {}), time: run?.endedAt ?? run?.startedAt ?? session.createdAt, deliveryAuthority: engine.deliveryAuthority(), ...(task ? { auditTask: task } : plan ? { phaseDoc: engine.pathFrom(cwd, `${engine.record.prdDirectory}/${plan.file}`) } : {}) }),
    fresh_session_instructions: providerFresh ? { command: session.agentId === "codex" ? codexCommand(cwd) : claudeCommand(cwd), prompt: providerFresh } : null,
  };
}
/** Reuse the browser's presentation/eligibility without loading whole transcripts for status. */
function inspectionReader(engine: Engine, deadline: number): Engine {
  const work = { ...readWork(dirname(dirname(engine.stateDirectory)), engine.stateDirectory), record: engine.record };
  const tails = new Map<string, OutputLine[]>();
  const tail = (s: SessionRecord) => {
    if (!tails.has(s.sessionId)) {
      if (tails.size >= 4) tails.delete(tails.keys().next().value!);
      tails.set(s.sessionId, recentSavedOutput(work, sessionStorageKey(s), s.sessionId, 10, deadline) as OutputLine[]);
    }
    return tails.get(s.sessionId)!;
  };
  const sessionRecord = (phase: string, id: string): SessionRecord | undefined => {
    if (!safeSelector(phase) || !safeSelector(id)) return undefined;
    let session: SessionRecord;
    try { session = privateJson<SessionRecord>(work.root, join(work.directory, phase, id, "session.json"), deadline); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    if (session.sessionId !== id || sessionStorageKey(session) !== phase || session.executionId && session.executionId !== engine.record.executionId) throw new ControlFailure("state_unavailable", "Saved inspection session identity does not match this execution.");
    if (!session.executionId) {
      const binding = privateJson<{ execution_id: string; sessions: Record<string, string> }>(work.root, join(work.directory, "inspection-bindings.json"), deadline);
      if (binding.execution_id !== engine.record.executionId || binding.sessions[`${phase}/${id}`] !== session.createdAt) throw new ControlFailure("state_unavailable", "Legacy inspection session ownership is unavailable.");
    }
    return session;
  };
  const bounded = new Proxy(engine, { get(target, name, receiver) {
    deadlineCheck(deadline);
    if (name === "sessionRecord") return sessionRecord;
    if (name === "current" && target.current?.session) {
      const current = target.current; const saved = sessionRecord(current.phaseKey, current.session!.sessionId);
      if (!saved) throw new ControlFailure("state_unavailable", "The active inspection session is unavailable.");
      return { ...current, session: saved, latestLine: tail(saved).at(-1) };
    }
    if (name === "outputLines") return tail;
    if (name === "runLastOutputAt") return (session: SessionRecord, index: number) => {
      const run = session.runs[index]; const next = session.runs[index + 1];
      return tail(session).filter(l => run && l.at >= run.startedAt && (!next || l.at < next.startedAt)).at(-1)?.at;
    };
    const value = Reflect.get(target, name, receiver) as unknown;
    return typeof value === "function" ? value.bind(receiver) : value;
  } });
  return bounded;
}
export function inspectionSnapshot(engine: Engine, deadline = Date.now() + 5000): Snapshot {
  const bounded = inspectionReader(engine, deadline);
  const snapshot = buildSnapshot(bounded, undefined, { includeTiming: false, output: session => bounded.outputLines(session) });
  deadlineCheck(deadline); return snapshot;
}
export function cacheSnapshot(engine: Engine, snapshot: Snapshot): void {
  const work = { ...readWork(dirname(dirname(engine.stateDirectory)), engine.stateDirectory), record: engine.record };
  const history = readHistory(work);
  try {
  const handoffs = Object.fromEntries(history.sessions.map(s => [s.id, instructionsFor(engine, s, snapshot)]));
  const last = latestActivity(work, history, snapshot);
  writeJsonAtomically(join(engine.stateDirectory, "inspection-view.json"), { version: 1, execution_id: engine.record.executionId, observed_at: new Date().toISOString(), snapshot, last_activity: last.activity, handoffs });
  } finally { history.dispose(); }
}
/** Called only during controller startup, while kiln run owns its exclusive PRD lock. */
export function bindLegacySessions(engine: Engine): void {
  const bindings: Record<string, string> = {};
  for (const [phase, facts] of Object.entries(engine.record.phases)) for (const id of facts.sessionIds) {
    let session: SessionRecord | undefined;
    try { session = engine.sessionRecord(phase, id); } catch { continue; }
    if (session && (!session.executionId || session.executionId === engine.record.executionId) && session.createdAt >= (engine.record.startedAt ?? "") && session.sessionId === id) bindings[`${phase}/${id}`] = session.createdAt;
  }
  const path = join(engine.stateDirectory, "inspection-bindings.json");
  if (Object.keys(bindings).length) writeJsonAtomically(path, { version: 1, execution_id: engine.record.executionId, sessions: bindings });
}
function cached(work: SavedWork, deadline = Date.now() + 5000): InspectionCache | null {
  const path = join(work.directory, "inspection-view.json");
  if (!existsSync(path)) return null;
  const saved = privateJson<InspectionCache>(work.root, path, deadline);
  if (saved.version !== 1 || saved.execution_id !== work.record.executionId) throw new ControlFailure("state_unavailable", "Saved inspection snapshot does not match this execution.");
  return saved;
}
export function accountFacts(work: SavedWork, snapshot: Snapshot | undefined, reachable: boolean, history: History): Record<string, unknown> {
  const cache = snapshot ? null : cached(work); const view = snapshot ?? cache?.snapshot;
  const account = view?.account;
  const observed = (value: unknown, at: string | null, reason: string | null, stale = false) => ({ value: value ?? null, observed_at: at, state: value == null ? "unavailable" : stale || !reachable ? "stale" : "current", reason: reason ?? (!reachable ? "Controller disconnected; last-known observation." : null) });
  const lastSession = history.complete ? newestSession(history, true)?.record : undefined;
  const lastRun = lastSession?.runs.at(-1);
  // Global lastLaunch can be saved before the next durable dispatch checkpoint.
  // Only the selected attempt's own dated observations establish its provenance.
  // Legacy run.account has no observation time or plan and cannot supply these.
  const attemptAccount = (lastRun?.codex?.account ? publicProvenance(lastRun.codex.account) : null) ?? (lastRun?.billing ? publicBilling(lastRun.billing) : null);
  const attemptAt = lastRun?.codex?.account?.at ?? lastRun?.billing?.observedAt ?? null;
  const next = account && (account.agentId !== "codex" || account.email || account.accountId || account.routingAccountId) ? publicAccount(account) : null;
  const usageAt = account?.limitsObservedAt ?? null;
  return {
    agent: work.record.settings.agentId,
    last_attempt: observed(attemptAccount, attemptAt, !history.complete ? "Saved attempt history is incomplete; last-attempt account provenance is unavailable." : attemptAccount ? null : "Dated account provenance was not recorded for the last attempt."),
    original_attempt: observed(lastSession?.codex?.originalAccount ? publicProvenance(lastSession.codex.originalAccount) : null, lastSession?.codex?.originalAccount?.at ?? null, lastSession?.codex?.originalAccount ? null : "Original account provenance unavailable."),
    next_attempt: observed(next, account?.updatedAt ?? null, account?.error ?? (!next ? "Current provider identity is unavailable." : null), account?.stale || !!account?.error),
    usage: observed(usageAt ? account?.limits.map(publicUsage) : null, usageAt, account?.limitsError ?? account?.limitsUnavailable ?? (!usageAt ? "Dated usage for this account is unavailable." : account?.limitsStale ? "Usage was retained without a fresh usage read." : null), account?.limitsStale || account?.stale || !!account?.limitsError),
    recovery: observed(account?.codexUsageObservedAt ? account.codexUsage : null, account?.codexUsageObservedAt ?? null, account?.error ?? (account?.codexUsage ? null : "No provider recovery permission was observed."), account?.codexUsageStale ?? account?.stale),
    billing: billingFacts(view?.billing, account, reachable),
    resume_after_usage_limit: work.record.settings.resumeAfterUsageLimit,
  };
}
function publicBilling(b: NonNullable<SavedWork["record"]["billing"]>["lastLaunch"]): unknown {
  if (!b) return null;
  return { agent: b.agentId, route: b.route, provider: b.provider ?? null, email: b.email ?? null, account_id: b.accountId ?? null, plan: b.plan ?? null, credits: b.credits ?? null, overflow: b.overflow ?? null, approved: b.approved };
}
function billingFacts(view: BillingView | undefined, account: AgentAccount | undefined, reachable: boolean): unknown {
  const observation = (value: unknown, at?: string, reason?: string, stale = false) => ({ value: value ?? null, observed_at: at ?? null,
    state: value == null || !at ? "unavailable" : !reachable || stale ? "stale" : "current",
    reason: reason ?? (!at || value == null ? "Dated billing observation is unavailable." : !reachable ? "Controller disconnected; last-known billing observation." : null) });
  const next = view?.next;
  const codex = next?.agentId === "codex";
  const unavailable = codex && (!account || !!account.error && !account.stale);
  const summaryFields = (summary: BillingView["lastLaunch"]) => summary ? { ...summary, provider: summary.provider ?? null, email: summary.email ?? null, orgId: summary.orgId ?? null, accountId: summary.accountId ?? null, plan: summary.plan ?? null, credits: summary.credits ?? null, overflow: summary.overflow ?? null } : {};
  return { ...(view ? { executionId: view.executionId, selectionGeneration: view.selectionGeneration, pending: view.pending } : {}), observed_at: next?.observedAt ?? null, state: !next || unavailable ? "unavailable" : !reachable || account?.stale || view?.pending ? "stale" : "current",
    reason: !next || unavailable ? "Current billing observation is unavailable." : !reachable ? "Controller disconnected; last-known billing observation." : account?.error ?? (view?.pending ? "Billing refresh is pending; previous observation retained." : null),
    next: { ...summaryFields(next), ...observation(unavailable ? null : publicBilling(next), next?.observedAt, codex ? account?.error : undefined, account?.stale || view?.pending), canApprove: reachable ? next?.canApprove ?? false : false, canClear: reachable ? next?.canClear ?? false : false },
    lastLaunch: { ...summaryFields(view?.lastLaunch), ...observation(publicBilling(view?.lastLaunch), view?.lastLaunch?.observedAt) },
    hold: { ...(view?.hold ?? {}), ...observation(view?.hold ? { phase_key: view.hold.phaseKey, action: view.hold.action, session_id: view.hold.sessionId ?? null, reason: view.hold.reason, observed: publicBilling(view.hold.observed) } : null, view?.hold?.at), ...(view?.hold ? { reason: view.hold.reason, observation_reason: !reachable ? "Controller disconnected; last-known billing hold." : null } : {}) },
    canLaunch: reachable ? view?.canLaunch ?? false : false };
}
function publicAccount(a: AgentAccount): unknown {
  return { agent: a.agentId ?? null, email: a.email ?? null, account_id: a.accountId ?? a.routingAccountId ?? null, plan: a.plan ?? null, error: a.error ?? null, credits: a.credits ?? null, identity_availability: a.email || a.accountId || a.routingAccountId ? "known" : "unknown", identity_reason: a.email || a.accountId || a.routingAccountId ? null : "Provider did not report identity; separately known plan and route remain available." };
}
/** Pure retained projection: nested usage facts cannot stay current after disconnect. */
function retainedLimit(limit: LimitView): LimitView {
  if (limit.agentId !== "codex") return limit;
  const observation = limit.allowancesObservation;
  const dated = observation && (observation.state === "current" || observation.state === "stale") && observation.observedAt && Number.isFinite(Date.parse(observation.observedAt));
  return { ...limit, allowances: dated ? limit.allowances ?? [] : [], allowancesObservation: dated
    ? { ...observation, state: "stale", reason: observation.reason ?? "Controller disconnected; last-known usage observation." }
    : { observedAt: null, state: "unavailable", reason: "Dated Codex usage is unavailable in this saved observation." } };
}
function publicLimit(limit: LimitView): Record<string, unknown> {
  return { ...limit, allowances: limit.allowances?.map(publicUsage) ?? null,
    allowancesObservation: limit.allowancesObservation ?? { observedAt: null, state: "unavailable", reason: "Dated provider usage is unavailable." } };
}
function publicIdentity(view: NonNullable<Snapshot["waiting"]> | NonNullable<Snapshot["needsYou"]>): Record<string, unknown> {
  return { originalAccount: view.originalAccount ? publicProvenance(view.originalAccount) : null, attemptAccount: view.attemptAccount ? publicProvenance(view.attemptAccount) : null };
}
export function statusProjection(work: SavedWork, engine?: Engine, full = false, deadline = Date.now() + 5000): Result {
  const before = engine ? JSON.stringify(engine.record) : null;
  const cache = engine ? null : cached(work, deadline);
  const statusErrors = [];
  let view: Snapshot | undefined;
  try { view = engine ? inspectionSnapshot(engine, deadline) : cache?.snapshot; }
  catch { statusErrors.push(errorFact("state_unavailable", "The current browser projection could not be assembled; collected saved records remain available below.")); }
  const record = engine?.record ?? work.record;
  const reachable = !!engine;
  if (!reachable && view) view = { ...view,
    ...(view.waiting ? { waiting: { ...view.waiting, limit: retainedLimit(view.waiting.limit) } } : {}),
    ...(view.needsYou?.limit ? { needsYou: { ...view.needsYou, limit: retainedLimit(view.needsYou.limit) } } : {}),
  };
  const stop = view?.needsYou;
  const savedStop = Object.entries(record.phases).find(([, f]) => f.stop);
  const wait = Object.entries(record.phases).find(([, f]) => f.wait);
  const phase = view?.feature.currentPhaseId ?? savedStop?.[0] ?? wait?.[0] ?? record.nextActivityKey ?? null;
  const sessionKey = engine?.current?.phaseKey ?? savedStop?.[0] ?? wait?.[0];
  const sessionId = engine?.current?.session?.sessionId ?? (sessionKey ? record.phases[sessionKey]?.sessionIds.at(-1) : undefined);
  let modelSession: SessionRecord | undefined;
  if (sessionKey && sessionId) {
    try { modelSession = privateJson<SessionRecord>(work.root, join(work.directory, sessionKey, sessionId, "session.json"), deadline); }
    catch { statusErrors.push(errorFact("state_unavailable", "The current session model observation is unavailable.")); }
  }
  const state = view?.feature.state ?? (!record.startedAt ? "not_started" : record.completedAt ? "complete" : savedStop ? "needs_you" : wait ? "waiting" : record.pause.activeSince ? "paused" : "implementing");
  const leaves = (record.plan ?? []).filter(p => !p.splitInto?.length);
  let control: ReturnType<Engine["controlView"]> | undefined;
  try { control = engine ? inspectionReader(engine, deadline).controlView() : undefined; }
  catch { statusErrors.push(errorFact("state_unavailable", "Current controls could not be read; no executable controls are returned.")); }
  const controls = control ? control.controls.filter(c => c.name !== "message-review").map(c => ({ ...c, required_inputs: ["PRD-path", "--only-if-status-matches", "--command-id"], invocation: ["kiln", c.name, work.canonical] })) : PLANNED_CONTROLS.map(name => ({ name, available: false, reason: reachable ? "Current controls could not be read." : "Controller is disconnected; no executable controls.", required_inputs: ["PRD-path", "--only-if-status-matches", "--command-id"], invocation: null }));
  const active = engine?.current?.processRunning ? engine.current.session?.sessionId : undefined;
  const history = readHistory(work, active, deadline);
  try {
  const last = latestActivity({ ...work, record }, history, view, cache?.last_activity, deadline);
  const savedMessage = savedStop && savedStop[1].stop?.kind !== "not_resumable" && !savedStop[1].stop?.interrupted ? modelSession?.runs.at(-1)?.result?.text : undefined;
  const audit = record.completionAudits?.activities.find(a => `audit-${a.activityId}` === phase);
  const savedActivity = { phase_id: audit ? null : phase, kind: audit?.kind ?? record.activities?.find(a => a.key === phase)?.kind ?? (phase === "pr" ? "final_delivery" : phase ? "implementation" : null), title: audit ? audit.kind === "delivery_audit" ? "Delivery audit" : "Test audit" : record.plan?.find(p => p.id === phase)?.title ?? (phase === "pr" ? "Final delivery" : null), round: audit?.round ?? null, continuation_index: audit?.continuationIndex ?? null, activity_id: audit?.activityId ?? null };
  const completedKey = record.activities?.findLast(a => record.phases[a.key]?.doneAt)?.key;
  const pauseKey = record.pause.activeSince ? completedKey : view?.liveControl?.target.activityKey ?? phase;
  const pauseAudit = record.completionAudits?.activities.find(a => `audit-${a.activityId}` === pauseKey);
  const pauseLabel = pauseAudit ? `${pauseAudit.kind === "delivery_audit" ? "Delivery audit" : "Test audit"} · Round ${pauseAudit.round}` : pauseKey ? `Phase ${pauseKey}` : "Activity";
  const takeover = view?.liveControl?.takeover;
  const takeoverStatus = takeover ? takeover.kind === "delivery_recovery" ? "Delivery uncertain. Review the conversation before explicit hand-back." : takeover.state === "released" ? "Paused for terminal takeover." : "Pausing for takeover — finishing the current operation. Wait before opening Claude." : record.pause.activeSince ? `${pauseLabel} finished. Paused before the next activity.` : record.pause.requestedAt ? `Will pause after ${pauseLabel} finishes. Current work continues.` : null;
  const pauseStatus = takeover && record.pause.requestedAt && !record.pause.activeSince ? `${takeoverStatus} Will pause after ${pauseLabel} finishes. Current work continues.` : takeoverStatus;
  const retainedInstructions = sessionId ? cache?.handoffs?.[sessionId] : undefined;
  if (savedStop && !stop && !retainedInstructions) statusErrors.push(errorFact("state_unavailable", "Saved inspection stop details are unavailable; readable stop facts are retained, but no matching recovery instructions were saved."));
  const savedHumanRequests = modelSession?.agentId === "codex" ? modelSession.runs.at(-1)?.codex?.humanRequests ?? null : modelSession ? [] : null;
  const stopDetail = stop ? { ...stop, ...publicIdentity(stop), ...(stop.limit ? { limit: publicLimit(stop.limit) } : {}), reason: stop.kind, final_message: stop.finalMessage ?? null, message_complete: true, failed_checks: stop.checks.filter(c => !c.passed), session_id: stop.sessionId ?? null, human_requests: stop.humanRequests ?? [], checked_at: stop.checkedAt ?? null }
    : savedStop ? { reason: savedStop[1].stop!.kind, final_message: savedMessage?.trim() ? savedMessage : null, message_complete: !!modelSession, message_reason: savedMessage?.trim() ? null : "No final message was saved for this stop.", failed_checks: savedStop[1].stop!.checks.filter(c => !c.passed), checked_at: savedStop[1].stop!.checkedAt, human_requests: savedHumanRequests,
      session_id: sessionId ?? null, sessionId: sessionId ?? null, activity: savedActivity, agent: modelSession?.agentId ?? record.settings.agentId,
      recovery: retainedInstructions ? { state: "stale", observed_at: cache!.observed_at, reason: "Controller disconnected; last-known recovery instructions.", ...retainedInstructions } : { state: "unavailable", observed_at: null, reason: "Saved recovery instructions are unavailable without a matching inspection sidecar.", resume_command: null, continuation_prompt: null, fresh_session_instructions: null } } : null;
  const answer = result({ prd_path: work.canonical, execution_id: record.executionId!, prd: { name: record.featureName, path: work.canonical }, document_state: existsSync(work.canonical) ? "available" : "document_unavailable",
    repositories: record.repositories.length ? record.repositories.map(r => r.name) : [record.repository.name],
    controller: reachable ? "reachable" : "stopped", working_sessions: active ? 1 : 0, facts: { state: reachable ? "current" : "stale", observed_at: reachable ? new Date().toISOString() : cache?.observed_at ?? work.observedAt, reason: reachable ? null : "Controller disconnected; only last-known facts are available." },
    state, phases: { completed: view?.feature.phasesDone ?? leaves.filter(p => p.closed).length, total: view?.feature.phasesTotal ?? leaves.length },
    activity: view?.activities?.find(a => a.state === "implementing" || a.state === "needs_you" || a.state === "waiting") ?? savedActivity,
    agent: view?.current?.agentId ?? stop?.agentId ?? record.settings.agentId, model: view?.current?.requested ?? view?.current?.model ?? stop?.requested ?? selectedChoice(record.settings),
    requested_model: modelSession ? { model: modelSession.model, effort: modelSession.effort ?? null } : selectedChoice(record.settings), effective_model: modelSession?.runs.at(-1)?.codex?.effective ?? (modelSession?.initModel ? { model: modelSession.initModel } : null),
    started_at: record.startedAt ?? null, last_activity: { ...last.activity, state: last.errors.length ? "unavailable" : reachable ? "current" : "stale", ...(last.errors.length ? { reason: "Latest activity could not be read completely; dated known facts are retained." } : {}) },
    live_control: view?.liveControl ? { ...view.liveControl, messages: view.liveControl.messages?.map(m => ({ ...m, receipt: messageReceiptLabel(m.delivery) })), state: reachable ? "current" : "stale", ...(reachable ? {} : { available: false, reason: "Controller disconnected; reconnect before acting.", input: { ...view.liveControl.input, available: false, reason: "Controller disconnected; reconnect before sending." } }) } : null,
    pause_status: pauseStatus,
    pause: record.pause, usage_wait: view?.waiting ? { ...view.waiting, ...publicIdentity(view.waiting), limit: publicLimit(view.waiting.limit) } : wait?.[1].wait ?? null, stop: stopDetail,
    completion: { completed_at: record.completedAt ?? null, pull_requests: record.pullRequests ?? [], merged_branches: record.mergedBranches ?? [] },
    status_token: control?.token ?? null, controls, unsent_replies: engine && control ? engine.commands.unsent(control.target).map(r => ({ command_id: r.command_id, text: r.reply_text, delivery: r.effects.reply })) : [],
    ...(full ? { plan: record.plan ?? [], activity_history: view?.activities ?? record.activities ?? [], settings: { keep_awake: record.settings.keepAwake, resume_after_usage_limit: record.settings.resumeAfterUsageLimit }, account: accountFacts(work, view, reachable && !!view, history), session_history: { complete: history!.complete, errors: history!.errors, phases: history!.phases } } : {}),
  }, [...statusErrors, ...last.errors]);
  if (engine && JSON.stringify(engine.record) !== before) throw new ControlFailure("state_unavailable", "Execution changed while status was assembled; refresh status.");
  if (full) return ownResult(answer, history.dispose, deadline);
  history.dispose(); return answer;
  } catch (error) { history.dispose(); throw error; }
}
export async function handoffProjection(work: SavedWork, selector: string | undefined, env: NodeJS.ProcessEnv, engine?: Engine): Promise<Result> {
  if (engine?.record.liveControl) await engine.reconcileTakeover();
  const activeId = engine?.current?.processRunning ? engine.current.session?.sessionId : undefined;
  const history = readHistory(work, activeId);
  try {
  const selected = chooseSession(work, history, selector, activeId);
  if (!selected) {
    const view = engine ? inspectionSnapshot(engine) : cached(work)?.snapshot;
    const stop = view?.needsYou;
    const cwd = stop && view ? engine?.sessionFolder ?? expandHome(view.feature.multiRepository ? view.settings.workspaceFolder : view.settings.worktreePath) : null;
    return result({ prd_path: work.canonical, execution_id: work.record.executionId!, data: {
      session_id: null, provider_session_id: null, agent: engine?.record.settings.agentId ?? work.record.settings.agentId,
      phase_key: stop?.phaseId ?? null, working_directory: cwd, resumable: false, reason: "No saved session.", active_under_kiln: false,
      provider_history: { state: "unavailable", observed_at: null, reason: "No saved session." },
      resume_command: null, resume_argv: null, environment: {}, continuation_prompt: null,
      fresh_session_instructions: stop ? { command: stop.freshSessionCommand, prompt: stop.freshSessionPrompt } : null,
    } }, history.errors);
  }
  const session = selected.record; const cwd = session.workingDirectory ?? work.record.settings.worktreePath;
  const provider = session.agentId === "codex" ? session.conversation?.threadId : session.sessionId;
  let available = false; let reason = "Provider conversation identity is unknown.";
  if (activeId === selected.id || engine?.ownsInspectionSession(selected.id)) reason = "This conversation is currently running under Kiln; a concurrent manual resume is unavailable.";
  else if (!workingDirectoryAvailable(cwd)) reason = "The recorded working directory is unavailable.";
  else if (provider) {
    try {
      if (session.agentId === "codex") {
        const rpc = new CodexHistoryRpc("codex", cwd, { ...env, ...(session.conversation?.codexHome ? { CODEX_HOME: session.conversation.codexHome } : {}) }, AbortSignal.timeout(30000));
        try { await rpc.initialize(); const response = await rpc.call<{ thread: { id: string } }>("thread/read", { threadId: provider, includeTurns: false }); available = response.thread.id === provider; } finally { await rpc.close(); }
      } else {
        const file = findTranscripts(claudeConfigFolder(env), provider).main;
        if (file) { const stat = statSync(file); available = stat.isFile() && stat.size > 0; if (available) { const fd = openSync(file, "r"); try { readSync(fd, Buffer.alloc(1), 0, 1, 0); } finally { closeSync(fd); } } }
      }
      reason = available ? "Saved provider conversation is available." : "Provider history is missing or unavailable.";
    } catch { reason = "Provider history could not be read within its deadline."; }
  }
  const saved = engine ? null : cached(work);
  const view = engine ? inspectionSnapshot(engine) : saved?.snapshot;
  const currentStop = view?.needsYou?.sessionId === session.sessionId ? view.needsYou : undefined;
  const instructions = engine && view ? instructionsFor(engine, selected, view) : saved?.handoffs?.[session.sessionId] ?? { continuation_prompt: currentStop?.resumePrompt ?? null, fresh_session_instructions: currentStop ? { command: currentStop.freshSessionCommand, prompt: currentStop.freshSessionPrompt } : null };
  const owned = engine?.ownsInspectionSession(selected.id) ?? false;
  if (owned) { available = false; reason = "This conversation is currently owned by Kiln; a concurrent manual resume is unavailable."; }
  const instructionsRecorded = !!(engine && view || saved?.handoffs && Object.hasOwn(saved.handoffs, session.sessionId) || currentStop);
  const instructionReason = !instructionsRecorded || !instructions.fresh_session_instructions ? "Some saved recovery instructions are unavailable; their inspection sidecar or activity context is missing." : null;
  const hold = engine?.record.liveControl?.takeover ?? work.record.liveControl?.takeover;
  const heldSession = hold?.target.sessionId === session.sessionId;
  const liveRun = session.runs.at(-1);
  const requiresRelease = heldSession || !!liveRun?.live && !liveRun.endedAt;
  if (requiresRelease && (!engine || hold?.state !== "released")) {
    available = false;
    reason = !engine ? "Controller disconnected; reconnect to establish safe terminal release." : hold?.reason ?? reason;
  }
  const argv = session.agentId === "codex" ? ["codex", "resume", provider!, "--model", session.model, ...(session.effort ? ["-c", `model_reasoning_effort=${JSON.stringify(session.effort)}`] : [])] : ["claude", "--resume", provider!];
  return result({ prd_path: work.canonical, execution_id: work.record.executionId!, data: { session_id: session.sessionId, provider_session_id: provider ?? null, agent: session.agentId ?? "claude_code", phase_key: selected.phase,
    takeover: heldSession ? hold : null, terminal_readiness: requiresRelease ? { ready: available, observed_at: heldSession ? hold.observedAt : view?.liveControl?.observedAt ?? null, reason } : null,
    working_directory: cwd, resumable: available, reason, active_under_kiln: owned,
    provider_history: { state: available ? "available" : owned ? "unknown" : "unavailable", observed_at: new Date().toISOString(), reason },
    resume_command: available ? currentStop?.resumeCommand ?? (session.agentId === "codex" ? codexResumeCommand(cwd, session) : resumeCommand(cwd, session.sessionId)) : null,
    resume_argv: available ? argv : null, environment: session.conversation?.codexHome ? { CODEX_HOME: session.conversation.codexHome } : {}, instructions_availability: { state: instructionReason ? "unavailable" : "available", reason: instructionReason, continuation: instructions.continuation_prompt ? "available" : instructionsRecorded ? "not_required" : "unavailable" }, continuation_prompt: instructions.continuation_prompt, fresh_session_instructions: requiresRelease && !available ? null : instructions.fresh_session_instructions } }, [...history.errors, ...(instructionReason ? [errorFact("state_unavailable", instructionReason)] : []), ...(!available ? [errorFact("provider_unavailable", reason)] : [])]);
  } finally { history.dispose(); }
}
/** An epoch is response identity, never a mutation authorization in this read-only release. */
export const instanceEpoch = () => randomUUID();
export const recordRevision = (record: SavedWork["record"]) => createHash("sha256").update(JSON.stringify(record)).digest("hex");
