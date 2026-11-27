import { startPath, writtenDirectory } from "../requirements/run-path.js";
import { AGENT_NAMES, type AgentId } from "../state/records.js";
import { judgedPhase, readPlanAt, recordedPlan } from "../engine/plan-reading.js";
import { notStartedChoice } from "../engine/activity-models.js";
import { modelDefaultsPath } from "../models/model-defaults.js";
import type { ActivityChoice, ModelList } from "../models/resolver.js";
import type { Effort } from "../state/records.js";
import { activityKeyKind } from "../state/activity-keys.js";
import { auditSentenceStart, recordedAuditName } from "../audit/audit-names.js";
import { AuditStore, hashBytes } from "../audit/storage.js";
import { pausingStatusText } from "../live/pause-now.js";
import { messageReceiptLabel } from "../live/target.js";
import { expandHome } from "../engine/worktree-setup.js";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { recentSavedOutput } from "./logs.js";
import { readWork, retainedAliases } from "./private-state.js";
import { writeDurableMetadata } from "./durable-file.js";
import { sessionStorageKey } from "../state/records.js";
import type { SessionRecord } from "../state/records.js";
import type { OutputLine } from "../session/session-output.js";
import type { Engine } from "../engine/engine.js";
import { buildSnapshot, codexResumeCommand, resumeCommand, codexCommand, claudeCommand, type AgentView, type Snapshot, type LimitView } from "../engine/snapshot.js";
import { freshSessionPrompt, resumePrompt, auditRecoveryPrompt, pullRequestSessionPrompt, codexSessionPrompt } from "../session/prompts.js";
import { claudeHistoryAvailability } from "../session/transcripts.js";
import { CodexHistoryRpc } from "../session/codex-history-rpc.js";
import { writeJsonAtomically } from "../state/state-files.js";
import type { BillingView } from "../billing/authority.js";
import { publicProvenance, publicUsage, publicBillingSummary, publicCredits, fieldAvailability } from "./public-facts.js";
import { ownResult } from "./spool.js";
import type { AgentAccount } from "../agents/metadata.js";
import { privateJson, privateBytes, deadlineCheck, safeSelector, type SavedWork } from "./private-state.js";
import { chooseSession, readHistory, readInspectionSession, newestSession, workingDirectoryAvailable, type Conversation, type History } from "./history.js";
import { commandText, ControlFailure, errorFact, result, type Result } from "./result.js";
import { latestActivity, type ActivityObservation } from "./activity.js";
import { markCompletePreview, NEW_COMMAND_ID, progressRows, projectCheck, projectPersonItem, type AuditWaiverReader, type ProgressRow } from "./waiver-facts.js";
import { checkCounts, effectiveRecordedClosed, type AuditWaiverResult } from "../engine/waivers.js";
import type { CheckResult } from "../state/records.js";
import { statusCompatibility } from "../engine/compatibility-notices.js";
import { checkFoldersSync, type FolderCheck } from "../engine/folder-check.js";
import { findExecutable } from "../platform/helper-process.js";
import { displayPath } from "../engine/worktree-setup.js";
import { kindClosed, limitFloor, limitOf, limitsInForce, loopSettings, loopsUsed } from "../state/audit-loops.js";
import type { AuditLoopsView } from "../engine/loop-view.js";
import { afterDeliveryFacts, continuationFacts, deliveredFacts } from "./delivered-facts.js";
import { questionLabel, recordLabelSet, repositoryDetails } from "../engine/plan-repositories.js";

export const PLANNED_CONTROLS = ["reply", "resume", "carry-on", "start-again", "verify-and-advance", "request-pause", "cancel-pause", "continue", "start-build", "check-again", "waive-and-advance", "settings", "message", "take-over", "reset", "locate-repository", "merge", "exit", "check-for-new-phases", "continue-with-phases", "handoff", "model"];
/** What each control needs on the command line: most change work under a status token and command ID; checking for new phases takes neither (AC-BOT-01). */
const requiredInputs = (name: string) => name === "model" ? ["PRD-path", "--phase | --audits", "--agent --model [--effort] | --use-default", "--only-if-status-matches", "--command-id"] : name === "check-for-new-phases" || name === "handoff" ? ["PRD-path"] : name === "locate-repository" ? ["PRD-path", "address-path", "folder", "--only-if-status-matches", "--command-id"] : name === "continue-with-phases" ? ["PRD-path", "--proposal", "--only-if-status-matches", "--command-id"] : ["PRD-path", "--only-if-status-matches", "--command-id"];
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
      repositories: engine.pullRequestRepositories().map(r => ({ name: r.name, github: r.github, worktreePath: expandHome(r.worktreePath), baseBranch: r.baseBranch, isPrd: r.kind === "prd" })), deliveryBlock: engine.deliveryBlockNow() })
    : plan ? freshSessionPrompt(engine.phasePromptValues(plan.file, cwd), true) : null;
  const providerFresh = fresh && session.agentId === "codex" && session.kind === "phase" && session.codex ? codexSessionPrompt(fresh, session.codex.launchIntent.skills) : fresh;
  return {
    continuation_prompt: resumePrompt({ agentId: session.agentId ?? "claude_code", endedOnItsOwn: !!run?.endedAt, ...(run?.interruptedBy ? { cause: run.interruptedBy } : {}), time: run?.endedAt ?? run?.startedAt ?? session.createdAt, deliveryAuthority: engine.deliveryAuthority(), ...(session.kind === "requirements" ? { requirementsStage: true } : task ? { auditTask: task } : plan ? { phaseDoc: engine.pathFrom(cwd, `${writtenDirectory(engine.record)}/${plan.file}`) } : {}) }),
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
    try { session = readInspectionSession(work, phase, id, deadline); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    return session;
  };
  const bounded = new Proxy(engine, { get(target, name, receiver) {
    deadlineCheck(deadline);
    if (name === "sessionRecord") return sessionRecord;
    if (name === "transcriptMissing") return (session: SessionRecord) => session.agentId === "codex" ? target.transcriptMissing(session) : !claudeHistoryAvailability(target.environment, session.sessionId, deadline).available;
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
  const store = new AuditStore(engine.stateDirectory);
  const root = dirname(dirname(engine.stateDirectory));
  const auditStore = { read<T>(id: string): T {
    const bytes = privateBytes(root, store.path(id), deadline);
    if (hashBytes(bytes) !== id) throw new ControlFailure("state_unavailable", "Retained audit evidence integrity is unavailable.");
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
    deadlineCheck(deadline); return parsed;
  } };
  const snapshot = buildSnapshot(bounded, undefined, { includeTiming: false, output: session => bounded.outputLines(session), auditStore });
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
export function bindExecutionAliases(engine: Engine): void {
  const work = readWork(dirname(dirname(engine.stateDirectory)), engine.stateDirectory);
  const aliases = [...new Set([...retainedAliases(work).filter(path => !path.endsWith("-prd.md")), work.canonical, join(expandHome(engine.record.settings.worktreePath), startPath(engine.record))])];
  writeDurableMetadata(join(engine.stateDirectory, "inspection-aliases.json"), { version: 1, execution_id: engine.record.executionId, canonical: work.canonical, aliases: aliases.map(path => ({ path, provenance: "git_resolved_at_controller_start" })) });
}

/** Called under the controller's exclusive PRD lock at startup or execution rotation. */
export function bindLegacySessions(engine: Engine): void {
  const bindings: Record<string, string> = {};
  for (const [phase, facts] of Object.entries(engine.record.phases)) for (const id of facts.sessionIds) {
    let session: SessionRecord | undefined;
    try { session = engine.sessionRecord(phase, id); } catch { continue; }
    if (session && (!session.executionId || session.executionId === engine.record.executionId) && session.createdAt >= (engine.record.startedAt ?? "") && session.sessionId === id) bindings[`${phase}/${id}`] = session.createdAt;
  }
  const path = join(engine.stateDirectory, "inspection-bindings.json");
  writeJsonAtomically(path, { version: 1, execution_id: engine.record.executionId, sessions: bindings });
}
function cached(work: SavedWork, deadline = Date.now() + 5000): InspectionCache | null {
  const path = join(work.directory, "inspection-view.json");
  if (!existsSync(path)) return null;
  const saved = privateJson<InspectionCache>(work.root, path, deadline);
  if (saved.version !== 1 || saved.execution_id !== work.record.executionId) throw new ControlFailure("state_unavailable", "Saved inspection snapshot does not match this execution.");
  const stop = saved.snapshot.needsYou;
  if (stop) {
    const retired = stop.outside !== undefined || stop.checks.some(check => check.name === "Stayed in the workspace");
    stop.checks = stop.checks.filter(check => check.name !== "Stayed in the workspace");
    delete stop.outside;
    if (retired) {
      // Do not rewrite a cached prompt that can contain the person's exact reply.
      // The controller regenerates these instructions from current requirements on restart.
      delete stop.resumePrompt;
      stop.freshSessionPrompt = "";
      if (stop.sessionId && saved.handoffs) delete saved.handoffs[stop.sessionId];
    }
  }
  for (const phase of [...saved.snapshot.phases ?? [], ...saved.snapshot.activities ?? []]) if (phase.audit) phase.audit.checks = phase.audit.checks.filter(check => check.name !== "Stayed in the workspace");
  return saved;
}
export function accountFacts(work: SavedWork, snapshot: Snapshot | undefined, reachable: boolean, history: History): Record<string, unknown> {
  const cache = snapshot ? null : cached(work); const view = snapshot ?? cache?.snapshot;
  // The agent of the activity status reports takes today's fields; every other needed agent is listed after it (Kiln Phase Model Tiers, "Command line").
  const needed = (view?.agents ?? []).filter(entry => entry.neededBy.activities.length > 0 || entry.neededBy.fallbackOnly);
  const reported = needed.find(entry => entry.inUse);
  const observed = (value: unknown, at: string | null, reason: string | null, stale = false) => ({ value: value ?? null, observed_at: at, state: value == null ? "unavailable" : stale || !reachable ? "stale" : "current", reason: reason ?? (!reachable ? "Controller disconnected; last-known observation." : null) });
  const lastSession = history.complete ? newestSession(history, true)?.record : undefined;
  const lastRun = lastSession?.runs.at(-1);
  // Global lastLaunch can be saved before the next durable dispatch checkpoint.
  // Only the selected attempt's own dated observations establish its provenance.
  // Legacy run.account has no observation time or plan and cannot supply these.
  const attemptAccount = (lastRun?.codex?.account ? publicProvenance(lastRun.codex.account) : null) ?? (lastRun?.billing ? publicBilling(lastRun.billing, !reachable) : null);
  const attemptAt = lastRun?.codex?.account?.at ?? lastRun?.billing?.observedAt ?? null;
  const fallback = view?.settings?.models?.fallback;
  const facts = (entry: AgentView | undefined) => {
    if (!entry) {
      const reason = "No activity is current or next.";
      return { next_attempt: observed(null, null, reason), usage: observed(null, null, reason), recovery: observed(null, null, reason), billing: billingFacts(undefined, undefined, reachable, reason) };
    }
    const account = entry.account;
    const next = account && (account.agentId !== "codex" || account.email || account.accountId || account.routingAccountId) ? publicAccount(account, !reachable || !!account.stale) : null;
    const usageAt = account?.limitsObservedAt ?? null;
    return {
      next_attempt: observed(next, account?.updatedAt ?? null, account?.error ?? entry.readinessErrors?.join(" ") ?? (!next ? "Current provider identity is unavailable." : null), account?.stale || !!account?.error),
      usage: observed(usageAt ? account?.limits.map(limit => ({ ...(publicUsage(limit) as object), ...(fallback?.enabled ? { over_threshold: (limit as { overThreshold?: true }).overThreshold === true } : {}) })) : null, usageAt, account?.limitsError ?? account?.limitsUnavailable ?? (!usageAt ? "Dated usage for this account is unavailable." : account?.limitsStale ? "Usage was retained without a fresh usage read." : null), account?.limitsStale || account?.stale || !!account?.limitsError),
      recovery: observed(account?.codexUsageObservedAt ? account.codexUsage : null, account?.codexUsageObservedAt ?? null, account?.error ?? (account?.codexUsage ? null : "No provider recovery permission was observed."), account?.codexUsageStale ?? account?.stale),
      billing: billingFacts(entry.billing, account, reachable),
    };
  };
  return {
    agent: reported?.agentId ?? null,
    last_attempt: observed(attemptAccount, attemptAt, !history.complete ? "Saved attempt history is incomplete; last-attempt account provenance is unavailable." : attemptAccount ? null : "Dated account provenance was not recorded for the last attempt."),
    original_attempt: observed(lastSession?.codex?.originalAccount ? publicProvenance(lastSession.codex.originalAccount) : null, lastSession?.codex?.originalAccount?.at ?? null, lastSession?.codex?.originalAccount ? null : "Original account provenance unavailable."),
    ...facts(reported),
    other_agents: needed.filter(entry => entry !== reported).map(entry => ({ agent: entry.agentId, ...facts(entry) })),
    ...(fallback?.enabled ? { fallback: { enabled: true, threshold: fallback.threshold } } : {}),
    resume_after_usage_limit: work.record.settings.resumeAfterUsageLimit,
  };
}
function publicBilling(b: import("../billing/inspection.js").BillingSummary | undefined, stale = false): unknown {
  if (!b) return null;
  const summary = publicBillingSummary(b, stale);
  return { ...summary, agent: b.agentId, account_id: b.accountId ?? null };
}
function billingFacts(view: BillingView | undefined, account: AgentAccount | undefined, reachable: boolean, unavailableReason?: string): unknown {
  const observation = (value: unknown, at?: string, reason?: string, stale = false) => ({ value: value ?? null, observed_at: at ?? null,
    state: value == null || !at ? "unavailable" : !reachable || stale ? "stale" : "current",
    reason: reason ?? (!at || value == null ? "Dated billing observation is unavailable." : !reachable ? "Controller disconnected; last-known billing observation." : null) });
  const next = view?.next;
  const codex = next?.agentId === "codex";
  const unavailable = codex && (!account || !!account.error && !account.stale);
  const summaryFields = (summary: BillingView["lastLaunch"]) => summary ? { ...summary, ...publicBillingSummary(summary, !reachable) } : {};
  return { ...(view ? { executionId: view.executionId, pending: view.pending } : {}), observed_at: next?.observedAt ?? null, state: !next || unavailable ? "unavailable" : !reachable || account?.stale || view?.pending ? "stale" : "current",
    reason: !next || unavailable ? unavailableReason ?? "Current billing observation is unavailable." : !reachable ? "Controller disconnected; last-known billing observation." : account?.error ?? (view?.pending ? "Billing refresh is pending; previous observation retained." : null),
    next: { ...summaryFields(next), ...observation(unavailable ? null : publicBilling(next, !reachable), next?.observedAt, codex ? account?.error : undefined, account?.stale || view?.pending), canApprove: reachable ? next?.canApprove ?? false : false, canClear: reachable ? next?.canClear ?? false : false },
    lastLaunch: { ...summaryFields(view?.lastLaunch), ...observation(publicBilling(view?.lastLaunch, !reachable), view?.lastLaunch?.observedAt) },
    hold: { ...(view?.hold ? { ...view.hold, observed: publicBillingSummary(view.hold.observed, !reachable) } : {}), ...observation(view?.hold ? { phase_key: view.hold.phaseKey, action: view.hold.action, session_id: view.hold.sessionId ?? null, reason: view.hold.reason, observed: publicBilling(view.hold.observed, !reachable) } : null, view?.hold?.at), ...(view?.hold ? { reason: view.hold.reason, observation_reason: !reachable ? "Controller disconnected; last-known billing hold." : null } : {}) },
    canLaunch: reachable ? view?.canLaunch ?? false : false };
}
function publicAccount(a: AgentAccount, stale = false): unknown {
  return { agent: a.agentId ?? null, email: a.email ?? null, account_id: a.accountId ?? a.routingAccountId ?? null, plan: a.plan ?? null, error: a.error ?? null, orgId: a.orgId ?? null, provider: null, credits: publicCredits(a.credits, stale), availability: fieldAvailability({ email: a.email ?? null, account_id: a.accountId ?? a.routingAccountId ?? null, orgId: a.orgId ?? null, plan: a.plan ?? null, credits: a.credits ?? null, provider: null }), identity_availability: a.email || a.accountId || a.routingAccountId ? "known" : "unknown", identity_reason: a.email || a.accountId || a.routingAccountId ? null : "Provider did not report identity; separately known plan and route remain available." };
}
/** Pure retained projection: nested usage facts cannot stay current after disconnect. */
function retainedLimit(limit: LimitView): LimitView {
  const observation = limit.allowancesObservation;
  const dated = observation && (observation.state === "current" || observation.state === "stale") && observation.observedAt && Number.isFinite(Date.parse(observation.observedAt));
  return { ...limit, allowances: dated ? limit.allowances ?? [] : [], allowancesObservation: dated
    ? { ...observation, state: "stale", reason: observation.reason ?? "Controller disconnected; last-known usage observation." }
    : { observedAt: null, state: "unavailable", reason: "Dated provider usage is unavailable in this saved observation." } };
}
function publicLimit(limit: LimitView, stale = false): Record<string, unknown> {
  const accountFields = { email: limit.account?.email ?? null, plan: limit.account?.plan ?? null, percent: limit.account?.percent ?? null, error: limit.account?.error ?? null, atLimitUntil: limit.account?.atLimitUntil ?? null };
  return { ...limit, account: { ...accountFields, at: limit.account?.at ?? null, state: !limit.account?.at ? "unavailable" : stale ? "stale" : "current", reason: !limit.account?.at ? "Account observation date is unavailable." : stale ? "Controller disconnected; last-known account observation." : null, availability: fieldAvailability(accountFields) }, allowances: limit.allowances?.map(publicUsage) ?? null,
    allowancesObservation: limit.allowancesObservation ?? { observedAt: null, state: "unavailable", reason: "Dated provider usage is unavailable." } };
}

function publicIdentity(view: NonNullable<Snapshot["waiting"]> | NonNullable<Snapshot["needsYou"]>): Record<string, unknown> {
  return { originalAccount: view.originalAccount ? publicProvenance(view.originalAccount) : null, attemptAccount: view.attemptAccount ? publicProvenance(view.attemptAccount) : null };
}
/**
 * The folder check at read time (missing worktree recovery, "The Folder Check"), whether or not a
 * controller is running: never a cached state. Undefined when every folder is the run's worktree.
 */
function failingFolders(record: SavedWork["record"], engine: Engine | undefined, deadline: number): FolderCheck | undefined {
  const env = engine?.environment ?? process.env;
  const git = engine?.gitExecutable ?? findExecutable("git", env) ?? "git";
  const check = checkFoldersSync(git, env, record, deadline);
  return check.passed ? undefined : check;
}
function folderFacts(check: FolderCheck, canonical: string, record: SavedWork["record"]): Record<string, unknown> {
  // Labels and address paths beside the names (find repositories anywhere "kiln status --json").
  const details = repositoryDetails(record);
  const labelled = (name: string) => { const one = details.find(detail => detail.name === name); return { label: one?.label ?? name, address_path: one?.address_path ?? null }; };
  return { checked_at: check.checkedAt, repositories: check.repositories.map(r => ({ name: r.name, ...labelled(r.name), saved_folder: displayPath(r.savedFolder), state: r.state, holds: r.holds ?? null, unknown: r.unknown ?? null })),
    set_up_again: { description: "Open the run with kiln run to see what Kiln still knows and set it up again.", argv: ["kiln", "run", canonical] } };
}
export function statusProjection(work: SavedWork, engine?: Engine, full = false, deadline = Date.now() + 5000): Result {
  const folders = failingFolders(engine?.record ?? work.record, engine, deadline);
  if (folders) return folderMissingStatus(work, engine, folders, full);
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
    try { modelSession = readInspectionSession(work, sessionKey, sessionId, deadline); }
    catch { statusErrors.push(errorFact("state_unavailable", "The current session model observation is unavailable.")); }
  }
  const state = view?.feature.state ?? (!record.startedAt ? "not_started" : record.completedAt ? "complete" : savedStop ? "needs_you" : wait ? "waiting" : record.pause.activeSince ? "paused" : record.requirements?.phase === "early_review" || record.requirements?.phase === "final_review" ? record.requirements.phase : "implementing");
  const leaves = (record.plan ?? []).filter(p => !p.splitInto?.length);
  let control: ReturnType<Engine["controlView"]> | undefined;
  try { control = engine ? inspectionReader(engine, deadline).controlView() : undefined; }
  catch { statusErrors.push(errorFact("state_unavailable", "Current controls could not be read; no executable controls are returned.")); }
  const controls: { name: string; available: boolean; reason: string | null; required_inputs: string[]; invocation: string[] | null }[] = control && engine ? [...control.controls.filter(c => c.name !== "message-review"), ...engine.newPhaseControls()].map(c => ({ ...c, required_inputs: requiredInputs(c.name), invocation: ["kiln", c.name, work.canonical] })) : PLANNED_CONTROLS.filter(name => name !== "handoff").map(name => ({ name, available: false, reason: reachable ? "Current controls could not be read." : "Controller is disconnected; no executable controls.", required_inputs: requiredInputs(name), invocation: null }));
  const active = engine?.current?.processRunning ? engine.current.session?.sessionId : undefined;
  const history = readHistory(work, active, deadline);
  try {
  // `kiln handoff` reads saved sessions itself, so it is listed with its own availability, with or without a controller (AC-BOT-01).
  controls.push(handoffControl(work, history, engine, active));
  const last = latestActivity({ ...work, record }, history, view, cache?.last_activity, deadline);
  const savedMessage = savedStop && savedStop[1].stop?.kind !== "not_resumable" && !savedStop[1].stop?.interrupted ? modelSession?.runs.at(-1)?.result?.text : undefined;
  const audit = record.completionAudits?.activities.find(a => `audit-${a.activityId}` === phase);
  const preflight = phase !== null && activityKeyKind(phase) === "preflight";
  const stage = record.requirements?.stages.find(s => `req-${s.activityId}` === phase);
  const savedActivity = { phase_id: audit || preflight ? null : phase, kind: audit?.kind ?? record.activities?.find(a => a.key === phase)?.kind ?? (phase === null ? null : activityKeyKind(phase) === "phase" ? "implementation" : activityKeyKind(phase)), title: stage ? stage.ran[0]?.title ?? stage.expected?.title ?? (stage.task === "review" ? "Stakeholder review" : "Next requirements stage") : audit ? recordedAuditName(record, audit).title : preflight ? "Preflight" : record.plan?.find(p => p.id === phase)?.title ?? (phase === "pr" ? "Final delivery" : null), round: audit?.round ?? null, continuation_index: audit?.continuationIndex ?? null, activity_id: audit?.activityId ?? null };
  const completedKey = record.activities?.findLast(a => record.phases[a.key]?.doneAt)?.key;
  // A pending request carried through a Folder missing base-branch start names its phase (missing worktree recovery, "The Folder Check").
  const pauseKey = record.pause.activeSince ? completedKey : record.pause.requestedFor ?? view?.liveControl?.target.activityKey ?? phase;
  const pauseAudit = record.completionAudits?.activities.find(a => `audit-${a.activityId}` === pauseKey);
  const pauseLabel = pauseAudit ? auditSentenceStart(recordedAuditName(record, pauseAudit)) : pauseKey && activityKeyKind(pauseKey) === "preflight" ? "Preflight" : pauseKey ? `Phase ${pauseKey}` : "Activity";
  const takeover = view?.liveControl?.takeover;
  const pauseNow = view?.liveControl?.pauseNow;
  // Under Pause now: "Pausing — …" with its running commands or processes, or "Paused."; with no projection, a launch from the paused page is starting (Kiln Pause Now, "The Pause Now State").
  const takeoverStatus = takeover ? takeover.kind === "delivery_recovery" ? "Delivery uncertain. Review the conversation before explicit hand-back." : pauseNow ? pauseNow.phase === "paused" ? "Paused." : pausingStatusText(pauseNow) : "The new session is starting." : record.pause.activeSince ? `${pauseLabel} finished. Paused before the next activity.` : record.pause.requestedAt ? `Will pause after ${pauseLabel} finishes. Current work continues.` : null;
  const pauseStatus = takeover && record.pause.requestedAt && !record.pause.activeSince ? `${takeoverStatus} Will pause after ${pauseLabel} finishes. Current work continues.` : takeoverStatus;
  const retainedInstructions = sessionId ? cache?.handoffs?.[sessionId] : undefined;
  if (savedStop && !stop && !retainedInstructions) statusErrors.push(errorFact("state_unavailable", "Saved inspection stop details are unavailable; readable stop facts are retained, but no matching recovery instructions were saved."));
  const savedHumanRequests = modelSession?.agentId === "codex" ? modelSession.runs.at(-1)?.codex?.humanRequests ?? null : modelSession ? [] : null;
  const stopDetail = stop ? { ...stop, ...publicIdentity(stop), ...(stop.limit ? { limit: publicLimit(stop.limit, !reachable) } : {}), reason: stop.kind, final_message: stop.finalMessage ?? null, message_complete: true, failed_checks: stop.checks.filter(c => !c.passed), session_id: stop.sessionId ?? null, human_requests: stop.humanRequests ?? [], checked_at: stop.checkedAt ?? null }
    : savedStop ? { reason: savedStop[1].stop!.kind, final_message: savedMessage?.trim() ? savedMessage : null, message_complete: !!modelSession, message_reason: !modelSession ? "Saved session is unavailable; its final message cannot be established." : savedMessage?.trim() ? null : "No final message was saved for this stop.", failed_checks: savedStop[1].stop!.checks.filter(c => !c.passed), checked_at: savedStop[1].stop!.checkedAt, human_requests: savedHumanRequests,
      session_id: sessionId ?? null, sessionId: sessionId ?? null, activity: savedActivity, agent: modelSession ? modelSession.agentId ?? "claude_code" : null,
      recovery: retainedInstructions ? { state: "stale", observed_at: cache!.observed_at, reason: "Controller disconnected; last-known recovery instructions.", ...retainedInstructions } : { state: "unavailable", observed_at: null, reason: "Saved recovery instructions are unavailable without a matching inspection sidecar.", resume_command: null, continuation_prompt: null, fresh_session_instructions: null } } : null;
  let progress: ProgressRow[] = [];
  try { progress = progressRows(record, engine?.current?.phaseKey, auditWaiverReader(engine ? dirname(dirname(engine.stateDirectory)) : work.root, engine?.stateDirectory ?? work.directory, deadline)); }
  catch { statusErrors.push(errorFact("state_unavailable", "Waiver facts could not be read completely.")); }
  const waived = (key: string | null | undefined) => {
    const row = key ? progress.find(r => r.key === key) : undefined;
    return row ? { waived_checks: row.waived_checks, waivers: row.waivers, warnings: row.warnings } : { waived_checks: 0, waivers: [], warnings: [] };
  };
  const keyOf = (a: { id?: string; activityId?: string; kind?: string; key?: string; phase_id?: string | null; activity_id?: string | null }) => a.key ?? (a.kind === "final_delivery" ? "pr" : a.kind === "delivery_audit" || a.kind === "test_audit" ? (a.activityId ?? a.activity_id) && `audit-${a.activityId ?? a.activity_id}` : a.id ?? a.phase_id);
  const stopRecord = savedStop?.[1].stop;
  let markComplete: Record<string, unknown> = { offered: false, reason: "Controller is disconnected; no executable controls." };
  if (engine) {
    // The repeated command acknowledges a reply kept unsent for this stop, as Mark complete requires (AC-WAIVE-05).
    const unsentReply = !!control && engine.commands.unsent(control.target).length > 0;
    try { markComplete = markCompletePreview(engine.markCompleteOffer(), work.canonical, control?.token ?? null, unsentReply); }
    catch { statusErrors.push(errorFact("state_unavailable", "Mark complete eligibility could not be read.")); markComplete = { offered: false, reason: "Mark complete eligibility could not be read." }; }
  }
  // A billing hold that names the stopped activity carries its own check run and rows, as the engine reads them (waivers "Check Runs").
  const hold = record.billing?.hold;
  const heldRun = hold?.checks && (hold.phaseKey === stop?.phaseId || hold.phaseKey === savedStop?.[0]) ? { run: hold.run, checks: hold.checks } : undefined;
  const stopWaivers = (detail: Record<string, unknown>) => {
    const checks = (detail.checks ?? heldRun?.checks ?? stopRecord?.checks ?? []) as CheckResult[];
    const run = heldRun ? heldRun.run : stopRecord?.run;
    return { ...detail, checks: checks.map(projectCheck), failed_checks: checks.filter(c => !c.passed).map(projectCheck),
      check_run: run ? { id: run.id, at: run.at, origin: run.origin, finished: run.finished, counts: checkCounts(checks) } : null,
      mark_complete: markComplete };
  };
  const activityFacts = (activity: Record<string, unknown> | null | undefined) => activity && { ...activity, ...waived(keyOf(activity)) };
  // The activity status reports: the current one, else the next (Kiln Phase Model Tiers, "Command line").
  const reportedRow = view?.activities?.find(a => a.state === "implementing" || a.state === "needs_you" || a.state === "waiting") ?? view?.activities?.find(a => a.state === "next" || a.state === "planned");
  const reportedChoice = reportedRow?.model?.choice;
  const answer = result({ ...(view?.requirements ? { requirements: view.requirements } : {}), prd_path: work.canonical, execution_id: record.executionId!, prd: { name: record.featureName, path: work.canonical, directory: record.prdDirectory }, document_state: existsSync(work.canonical) ? "available" : "document_unavailable",
    repositories: record.repositories.length ? record.repositories.map(r => r.name) : [record.repository.name],
    repository_details: repositoryDetails(record),
    controller: reachable ? "reachable" : "stopped", working_sessions: active ? 1 : 0, facts: { state: reachable ? "current" : "stale", observed_at: reachable ? new Date().toISOString() : cache?.observed_at ?? work.observedAt, reason: reachable ? null : "Controller disconnected; only last-known facts are available." },
    state, phases: { completed: view?.feature.phasesDone ?? leaves.filter(p => effectiveRecordedClosed(record, p)).length, total: view?.feature.phasesTotal ?? leaves.length },
    activity: activityFacts((view?.activities?.find(a => a.state === "implementing" || a.state === "needs_you" || a.state === "waiting") ?? savedActivity) as Record<string, unknown>),
    // The reported activity's agent and model: its session's recorded choice, else its row's choice (Kiln Phase Model Tiers, "Command line").
    agent: view?.current?.agentId ?? stop?.agentId ?? modelSession?.agentId ?? reportedChoice?.agentId ?? null, model: view?.current?.requested ?? view?.current?.model ?? stop?.requested ?? (reportedChoice ? { model: reportedChoice.model, ...(reportedChoice.effort ? { effort: reportedChoice.effort } : {}) } : null),
    requested_model: modelSession ? { model: modelSession.model, effort: modelSession.effort ?? null } : reportedChoice ? { model: reportedChoice.model, effort: reportedChoice.effort ?? null } : null, effective_model: modelSession?.runs.at(-1)?.codex?.effective ?? (modelSession?.initModel ? { model: modelSession.initModel } : null),
    started_at: record.startedAt ?? null, last_activity: { ...last.activity, state: last.errors.length ? "unavailable" : reachable ? "current" : "stale", ...(last.errors.length ? { reason: "Latest activity could not be read completely; dated known facts are retained." } : {}) },
    live_control: view?.liveControl ? { ...view.liveControl, messages: view.liveControl.messages?.map(m => ({ ...m, receipt: messageReceiptLabel(m.delivery) })), state: reachable ? "current" : "stale", ...(reachable ? {} : { available: false, reason: "Controller disconnected; reconnect before acting.", input: { ...view.liveControl.input, available: false, reason: "Controller disconnected; reconnect before sending." } }) } : null,
    compatibility: statusCompatibility(record),
    pause_status: pauseStatus,
    // The snapshot's loop limits, counts and position (AC-STOP-05); read from the record when no snapshot was saved.
    audit_loops: view?.auditLoops ?? savedAuditLoops(record),
    // The items for a person at a Needs you stop on an audit, or at the hold stop (AC-ITEM-02).
    items: view?.items?.map(projectPersonItem) ?? null,
    // A finished run's loops, For you and pull requests, and the offer to continue the finished page shows (AC-LEFT-02, AC-BOT-02).
    delivered: view?.delivered ? deliveredFacts(view.delivered, record) : null,
    continuation: record.completedAt && (view?.continuation?.check ?? record.completedPlanCheck) ? continuationFacts((view?.continuation?.check ?? record.completedPlanCheck)!, record.prdDirectory) : null,
    // What GitHub last showed of the delivery's pull requests, and whether it waits to merge (Kiln After Delivery AC-BOT-02).
    after_delivery: afterDeliveryFacts(record, view?.afterDelivery),
    pause: record.pause, usage_wait: view?.waiting ? { ...view.waiting, ...publicIdentity(view.waiting), limit: publicLimit(view.waiting.limit, !reachable) } : wait?.[1].wait ?? null, stop: stopDetail && { ...stopWaivers(stopDetail as Record<string, unknown>), locate: locateFacts(record, work.canonical, control) },
    // Each activity's tier and model, as the snapshot gives them (Kiln Phase Model Tiers, "Command line").
    progress: progress.map(row => { const shown = view?.activities?.find(a => a.id === row.key || a.id === engine?.judgedId(row.key)); return { ...row, tier: shown?.tier ?? null, model: shown?.model ?? null }; }),
    // Every row of the plan, those Kiln hasn't allocated yet and the planned ones included, with its tier and model, so a bot reads which it may change with kiln model (AC-PICK-05).
    plan_models: view?.activities ? view.activities.map(a => ({ id: a.id, title: a.title, kind: a.kind ?? "phase", planned: a.plannedActivity === true, tier: a.tier ?? null, model: a.model ?? null })) : null,
    completion: { completed_at: record.completedAt ?? null, pull_requests: record.pullRequests ?? [], merged_branches: record.mergedBranches ?? [] },
    status_token: control?.token ?? null, controls, unsent_replies: engine && control ? engine.commands.unsent(control.target).map(r => ({ command_id: r.command_id, text: r.reply_text, delivery: r.effects.reply })) : [],
    ...(full ? { plan: record.plan ?? [], activity_history: ((view?.activities ?? record.activities ?? []) as unknown as Record<string, unknown>[]).map(activityFacts), settings: settingsFacts(record), account: accountFacts(work, view, reachable && !!view, history), session_history: { complete: history!.complete, errors: history!.errors, phases: history!.phases } } : {}),
  }, [...statusErrors, ...last.errors]);
  if (engine && JSON.stringify(engine.record) !== before) throw new ControlFailure("state_unavailable", "Execution changed while status was assembled; refresh status.");
  if (full) return ownResult(answer, history.dispose, deadline);
  history.dispose(); return answer;
  } catch (error) { history.dispose(); throw error; }
}
/** The audit loop limits and counts from the saved record, for a run with no saved snapshot; no position without one. */
function savedAuditLoops(record: SavedWork["record"]): AuditLoopsView {
  const limits = limitsInForce(record);
  const kind = (one: "delivery" | "test") => ({ used: loopsUsed(record.auditLoops, one), limit: limitOf(limits, one), closed: kindClosed(record, one), floor: limitFloor(record, one) });
  return { settings: loopSettings(record.settings), delivery: kind("delivery"), test: kind("test"), ...(record.auditLoops?.atPullRequest ? { frozen: { at: record.auditLoops.atPullRequest.at } } : {}) };
}
/** `--detail full`'s settings: the runtime preferences and the two audit loop limits. */
function settingsFacts(record: SavedWork["record"]): Record<string, unknown> {
  const loops = loopSettings(record.settings);
  return { keep_awake: record.settings.keepAwake, resume_after_usage_limit: record.settings.resumeAfterUsageLimit, delivery_audit_loops: loops.deliveryLimit, test_audit_loops: loops.testLimit };
}
/** `kiln status` while a folder is missing (AC-GONE-02): the state, no current activity, no stop, no phase progress. */
function folderMissingStatus(work: SavedWork, engine: Engine | undefined, folders: FolderCheck, full: boolean): Result {
  const record = engine?.record ?? work.record;
  const reachable = !!engine;
  const control = engine ? engine.controlView() : undefined;
  const reset = control?.controls.find(one => one.name === "reset");
  return result({ prd_path: work.canonical, execution_id: record.executionId!, prd: { name: record.featureName, path: work.canonical, directory: record.prdDirectory }, document_state: existsSync(work.canonical) ? "available" : "document_unavailable",
    repositories: record.repositories.length ? record.repositories.map(r => r.name) : [record.repository.name],
    repository_details: repositoryDetails(record),
    controller: reachable ? "reachable" : "stopped", working_sessions: engine?.current?.processRunning ? 1 : 0, facts: { state: "current", observed_at: folders.checkedAt, reason: null },
    state: "folder_missing", folder_missing: folderFacts(folders, work.canonical, record), phases: null, activity: null, stop: null, usage_wait: null, live_control: null, pause: record.pause, pause_status: null,
    progress: [], started_at: record.startedAt ?? null, completion: { completed_at: null, pull_requests: [], merged_branches: [] },
    // Reset is the one control left while a folder is missing (run restart "Availability"), so a running Kiln returns its status token.
    status_token: control?.token ?? null, controls: PLANNED_CONTROLS.map(name => name === "reset" && reset ? { name, available: reset.available, reason: reset.reason, required_inputs: ["PRD-path", "--only-if-status-matches", "--command-id"], invocation: ["kiln", name, work.canonical] } : { name, available: false, reason: "This run’s folder is missing; set the run up again with kiln run.", required_inputs: requiredInputs(name), invocation: null }), unsent_replies: [],
    ...(full ? { plan: record.plan ?? [], settings: settingsFacts(record) } : {}),
  });
}
/** The audit store's waiver results, read through the same private, bounded reads as inspection. */
function auditWaiverReader(root: string, stateDirectory: string, deadline: number): AuditWaiverReader {
  const store = new AuditStore(stateDirectory);
  return id => {
    const bytes = privateBytes(root, store.path(id), deadline);
    if (hashBytes(bytes) !== id) return undefined;
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as AuditWaiverResult;
    return value.kind === "audit_waiver" ? value : undefined;
  };
}
/**
 * `kiln handoff` among the status controls (AC-BOT-01): available when the session it would open
 * isn't running under Kiln or held by a takeover and its working directory is there. The provider
 * history read stays with `kiln handoff`, which reports it when it runs.
 */
function handoffControl(work: SavedWork, history: History, engine: Engine | undefined, activeId: string | undefined) {
  const control = (available: boolean, reason: string | null) => ({ name: "handoff", available, reason, required_inputs: requiredInputs("handoff"), invocation: ["kiln", "handoff", work.canonical] });
  let selected: Conversation | null;
  try { selected = chooseSession(work, history, undefined, activeId); } catch { return control(false, "Saved sessions could not be read."); }
  if (!selected) return control(false, "No saved session.");
  if (activeId === selected.id || engine?.ownsInspectionSession(selected.id)) return control(false, "This conversation is currently running under Kiln; a concurrent manual resume is unavailable.");
  if (!workingDirectoryAvailable(selected.record.workingDirectory ?? work.record.settings.worktreePath)) return control(false, "The recorded working directory is unavailable.");
  const provider = selected.record.agentId === "codex" ? selected.record.conversation?.threadId : selected.record.sessionId;
  if (typeof provider !== "string" || !safeSelector(provider)) return control(false, "Provider conversation identity is unknown.");
  const hold = engine?.record.liveControl?.takeover ?? work.record.liveControl?.takeover;
  const liveRun = selected.record.runs.at(-1);
  if ((hold?.target.sessionId === selected.record.sessionId || !!liveRun?.live && !liveRun.endedAt) && (!engine || hold?.state !== "released")) return control(false, !engine ? "Controller disconnected; reconnect to establish safe terminal release." : hold?.reason ?? "This conversation is still running.");
  return control(true, null);
}
export async function handoffProjection(work: SavedWork, selector: string | undefined, env: NodeJS.ProcessEnv, engine?: Engine): Promise<Result> {
  const folders = failingFolders(engine?.record ?? work.record, engine, Date.now() + 5000);
  if (folders) {
    // No resume command, continuation prompt or fresh-session instructions from a folder that is gone (AC-GONE-01).
    return result({ prd_path: work.canonical, execution_id: work.record.executionId!, data: {
      session_id: null, provider_session_id: null, agent: reportedAgentId(engine), phase_key: null, working_directory: null,
      resumable: false, reason: "This run’s folder is missing. Set the run up again with kiln run.", active_under_kiln: false, state: "folder_missing", folder_missing: folderFacts(folders, work.canonical, engine?.record ?? work.record),
      provider_history: { state: "unavailable", observed_at: null, reason: "This run’s folder is missing." },
      resume_command: null, resume_argv: null, environment: {}, continuation_prompt: null, fresh_session_instructions: null,
    } });
  }
  if (engine?.record.liveControl) await engine.reconcileTakeover();
  const activeId = engine?.current?.processRunning ? engine.current.session?.sessionId : undefined;
  const history = readHistory(work, activeId);
  try {
  const selected = chooseSession(work, history, selector, activeId);
  if (!selected) {
    const view = engine ? inspectionSnapshot(engine) : cached(work)?.snapshot;
    const stop = view?.needsYou;
    const cwd = stop && view ? engine?.sessionFolder ?? expandHome(view.feature.multiRepository ? view.settings.workspaceFolder : view.settings.worktreePath) : null;
    // With Kiln not running, a stop on an activity that hasn't started takes its current choice resolved now,
    // so a Model defaults, tier or change made after Kiln stopped names the agent its fresh session runs on (AC-PICK-07).
    const offline = !engine && stop && view && notStartedRow(work, view, stop.phaseId) ? offlineChoice(work, view, stop.phaseId, env).agentId : undefined;
    return result({ prd_path: work.canonical, execution_id: work.record.executionId!, data: {
      // With no session, the facts follow the activity's current choice (Kiln Phase Model Tiers AC-AGENTS-04).
      session_id: null, provider_session_id: null, agent: (stop && engine ? engine.agentOf(stop.phaseId) : offline) ?? view?.agents?.find(entry => entry.inUse)?.agentId ?? null,
      phase_key: stop?.phaseId ?? null, working_directory: cwd, resumable: false, reason: "No saved session.", active_under_kiln: false,
      provider_history: { state: "unavailable", observed_at: null, reason: "No saved session." },
      resume_command: null, resume_argv: null, environment: {}, continuation_prompt: null,
      fresh_session_instructions: stop ? { command: offline && cwd ? (offline === "codex" ? codexCommand(cwd) : claudeCommand(cwd)) : stop.freshSessionCommand, prompt: stop.freshSessionPrompt } : null,
    } }, history.errors);
  }
  const session = selected.record; const cwd = session.workingDirectory ?? work.record.settings.worktreePath;
  const rawProvider = session.agentId === "codex" ? session.conversation?.threadId : session.sessionId;
  const provider = typeof rawProvider === "string" && safeSelector(rawProvider) ? rawProvider : null;
  let available = false; let reason = "Provider conversation identity is unknown.";
  if (activeId === selected.id || engine?.ownsInspectionSession(selected.id)) reason = "This conversation is currently running under Kiln; a concurrent manual resume is unavailable.";
  else if (!workingDirectoryAvailable(cwd)) reason = "The recorded working directory is unavailable.";
  else if (provider) {
    try {
      if (session.agentId === "codex") {
        const rpc = new CodexHistoryRpc("codex", cwd, { ...env, ...(session.conversation?.codexHome ? { CODEX_HOME: session.conversation.codexHome } : {}) }, AbortSignal.timeout(30000));
        try { await rpc.initialize(); const response = await rpc.call<{ thread: { id: string } }>("thread/read", { threadId: provider, includeTurns: false }); available = response.thread.id === provider; } finally { await rpc.close(); }
      } else {
        available = claudeHistoryAvailability(env, provider).available;
      }
      reason = available ? "Saved provider conversation is available." : "Provider history is missing or unavailable.";
    } catch { reason = "Provider history could not be read within its deadline."; }
  }
  const saved = engine ? null : cached(work);
  const view = engine ? inspectionSnapshot(engine) : saved?.snapshot;
  const currentStop = view?.needsYou?.sessionId === session.sessionId ? view.needsYou : undefined;
  const instructions = engine && view ? instructionsFor(engine, selected, view) : saved?.handoffs?.[session.sessionId] ?? { continuation_prompt: currentStop?.resumePrompt ?? null, fresh_session_instructions: currentStop?.freshSessionPrompt.trim() ? { command: currentStop.freshSessionCommand, prompt: currentStop.freshSessionPrompt } : null };
  const owned = engine?.ownsInspectionSession(selected.id) ?? false;
  if (owned) { available = false; reason = "This conversation is currently owned by Kiln; a concurrent manual resume is unavailable."; }
  const instructionsRecorded = !!(engine && view || saved?.handoffs && Object.hasOwn(saved.handoffs, session.sessionId) || currentStop?.freshSessionPrompt.trim());
  const instructionReason = !instructionsRecorded || !instructions.fresh_session_instructions ? "Some saved recovery instructions are unavailable; their inspection sidecar or activity context is missing." : null;
  const hold = engine?.record.liveControl?.takeover ?? work.record.liveControl?.takeover;
  const heldSession = hold?.target.sessionId === session.sessionId;
  const liveRun = session.runs.at(-1);
  const requiresRelease = heldSession || !!liveRun?.live && !liveRun.endedAt;
  // A hold whose saved conversation can't be reopened is never released, yet once the carry-on
  // ownership check passes its fresh-session instructions are usable, with no resume command (run restart AC-CARRY-06).
  const heldFresh = !!engine && heldSession && !!hold?.history && !hold.carryOnObstacle;
  if (requiresRelease && (!engine || hold?.state !== "released")) {
    available = false;
    reason = !engine ? "Controller disconnected; reconnect to establish safe terminal release." : hold?.reason ?? reason;
  }
  // An activity that hasn't started reopens a saved conversation only while its current choice is the one that session ran on (Kiln Phase Model Tiers AC-PICK-07).
  // With Kiln not running, the choice is resolved now from the saved record, Model defaults and the plan on disk.
  const movedTo = engine ? (engine.reopenMatchesChoice(selected.phase, session) ? undefined : engine.agentOf(selected.phase)) : cachedChoiceMove(work, view, selected.phase, session, env);
  const choiceMoved = movedTo !== undefined;
  if (movedTo && instructions.fresh_session_instructions) {
    // The fresh session runs on the activity's current choice, so its command names that agent.
    instructions.fresh_session_instructions = { ...instructions.fresh_session_instructions, command: movedTo === "codex" ? codexCommand(cwd) : claudeCommand(cwd) };
  }
  if (available && movedTo) {
    available = false;
    reason = `This activity hasn't started, and its model choice is no longer the one this conversation ran on, so it isn't reopened. Start a fresh ${AGENT_NAMES[movedTo]} session with the instructions below.`;
  }
  const argv = session.agentId === "codex" ? ["codex", "resume", provider!, "--model", session.model, ...(session.effort ? ["-c", `model_reasoning_effort=${JSON.stringify(session.effort)}`] : [])] : ["claude", "--resume", provider!];
  return result({ prd_path: work.canonical, execution_id: work.record.executionId!, data: { session_id: session.sessionId, provider_session_id: provider ?? null, agent: session.agentId ?? "claude_code", phase_key: selected.phase,
    takeover: heldSession ? hold : null, terminal_readiness: requiresRelease ? { ready: available, observed_at: heldSession ? hold.observedAt : view?.liveControl?.observedAt ?? null, reason } : null,
    working_directory: cwd, resumable: available, reason, active_under_kiln: owned,
    provider_history: { state: available ? "available" : owned ? "unknown" : "unavailable", observed_at: new Date().toISOString(), reason },
    resume_command: available ? currentStop?.resumeCommand ?? (session.agentId === "codex" ? codexResumeCommand(cwd, session) : resumeCommand(cwd, session.sessionId)) : null,
    resume_argv: available ? argv : null, environment: session.conversation?.codexHome ? { CODEX_HOME: session.conversation.codexHome } : {}, instructions_availability: { state: instructionReason ? "unavailable" : "available", reason: instructionReason, continuation: instructions.continuation_prompt ? "available" : instructionsRecorded ? "not_required" : "unavailable" }, continuation_prompt: instructions.continuation_prompt, fresh_session_instructions: requiresRelease && !available && !heldFresh && !choiceMoved ? null : instructions.fresh_session_instructions } }, [...history.errors, ...(instructionReason ? [errorFact("state_unavailable", instructionReason)] : []), ...(!available ? [errorFact("provider_unavailable", reason)] : [])]);
  } finally { history.dispose(); }
}
/**
 * With Kiln not running (AC-PICK-07): the agent of the activity's current choice when that choice
 * has moved off the one this session ran on. While the activity hasn't started, the choice is
 * resolved now, from the record's own changes, the Model defaults file and the plan's tier on
 * disk, so a Model defaults or tier change made after Kiln stopped counts too. Undefined while
 * they match, or once it has started.
 *
 *   cachedChoiceMove(work, view, "2", codexSession, env)  // "claude_code", after Phase 2 was changed to Claude Code
 */
function cachedChoiceMove(work: SavedWork, view: Snapshot | undefined, key: string, session: SessionRecord, env: NodeJS.ProcessEnv): AgentId | undefined {
  if (!view) return undefined;
  const model = notStartedRow(work, view, key);
  if (!model) return undefined;
  const sessionAgent = session.agentId ?? "claude_code";
  const now = offlineChoice(work, view, key, env);
  // Another agent is a move even when the saved snapshot holds no model list to resolve its model against;
  // so is Model defaults that can't be read, which leaves no model to match, as `reopenMatchesChoice` finds.
  if (!now.modelName || now.agentId !== sessionAgent) return now.agentId;
  const choice = now.listed ? now : model.choice;
  if (!choice) return sessionAgent;
  const same = choice.agentId === sessionAgent && choice.model === session.model && (choice.effort ?? undefined) === (session.effort ?? undefined);
  return same ? undefined : choice.agentId;
}

/**
 * The saved snapshot row's model for an activity that hasn't started, undefined otherwise. A
 * saved snapshot that carries no rows says nothing about whether the activity has started.
 */
function notStartedRow(work: SavedWork, view: Snapshot, key: string) {
  const rows = [...(view.activities ?? []), ...(view.phases ?? [])];
  const rowId = judgedPhase(work.record.plan ?? [], key)?.id ?? key;
  const model = (rows.find(row => row.id === key) ?? rows.find(row => row.id === rowId))?.model;
  return model?.state === "will_run_on" ? model : undefined;
}

/**
 * An activity's choice resolved now with Kiln not running (AC-PICK-07), against the model lists the
 * saved snapshot carries. `listed` is false when it holds no list for the agent the choice names,
 * so only the agent is known and the saved row decides the model.
 */
function offlineChoice(work: SavedWork, view: Snapshot, key: string, env: NodeJS.ProcessEnv): ActivityChoice & { listed: boolean } {
  const lists: Partial<Record<AgentId, ModelList>> = {};
  for (const agent of view.agents ?? []) {
    if (agent.models) lists[agent.agentId] = { models: agent.models.map(entry => ({ value: entry.value, resolvedModel: entry.value, displayName: entry.displayName, description: "", supportsEffort: entry.efforts.length > 0, supportedEffortLevels: entry.efforts as Effort[], supportsAutoMode: !entry.needsAutoMode, ...(entry.defaultEffort ? { defaultEffort: entry.defaultEffort } : {}) })) };
  }
  const prd = work.record.repositories.find(entry => entry.kind === "prd");
  const read = work.record.prdDirectory && readPlanAt(expandHome(prd?.worktreePath ?? work.record.settings.worktreePath), work.record.prdDirectory);
  const plan = read && read.ok ? recordedPlan(read.plan) : work.record.plan ?? [];
  // The snapshot lists every installed agent, so an absent Claude Code entry means it isn't installed; one saved before agents were listed ran Claude Code.
  const claudeCodeInstalled = view.agents ? view.agents.some(entry => entry.agentId === "claude_code" && entry.installed) : true;
  const choice = notStartedChoice({ record: work.record, plan, defaultsPath: modelDefaultsPath(env), claudeCodeInstalled, lists, session: () => undefined }, key);
  return { ...choice, listed: !!lists[choice.agentId] };
}

/** The agent of the activity status reports, from the controller. */
function reportedAgentId(engine: Engine | undefined): string | null { return engine ? engine.inUseAgent(undefined) ?? null : null; }
/** An epoch is response identity, never a mutation authorization in this read-only release. */
export const instanceEpoch = () => randomUUID();
export const recordRevision = (record: SavedWork["record"]) => createHash("sha256").update(JSON.stringify(record)).digest("hex");

/**
 * A stop's questions about where a repository is, projected for `kiln status --json` from the
 * saved record (find repositories anywhere, "`kiln status --json`"), never the snapshot's field.
 */
export function locateFacts(record: import("../state/records.js").PrdRecord, canonical: string, control: { token: string; controls: { name: string; available: boolean; reason: string | null }[] } | undefined): Record<string, unknown>[] {
  const stopped = Object.entries(record.phases).find(([, facts]) => facts.stop)?.[0] ?? record.billing?.hold?.phaseKey;
  if (stopped === undefined) return [];
  const questions = record.phases[stopped]?.stop?.locate ?? (record.billing?.hold?.phaseKey === stopped ? record.billing.hold.locate : undefined) ?? [];
  const set = recordLabelSet(record, record.plan ?? []);
  const command = control?.controls.find(one => one.name === "locate-repository");
  const argv = (addressPath: string, folder: string) => control ? ["kiln", "locate-repository", canonical, addressPath, folder, "--only-if-status-matches", control.token, "--command-id", NEW_COMMAND_ID] : null;
  return questions.map(question => {
    const available = !!command?.available;
    const next = available ? argv(question.repository, "<folder>") : null;
    return {
      kind: question.kind, address_path: question.repository, label: questionLabel(set, question.repository), phase_file: question.phaseFile ?? null,
      searched_from: question.searchedFrom, searched_to: question.searchedTo ?? null,
      checkouts: question.checkouts.map(checkout => ({ folder: checkout.folder, remote: checkout.remote, pickable: checkout.pickable, remembered: checkout.remembered === true, ...(checkout.pickable && available ? { next_argv: argv(question.repository, checkout.folder) } : {}) })),
      available, reason: available ? null : command?.reason ?? "Controller is disconnected; no executable controls.",
      next_argv: next, next_command: next ? commandText(next) : null,
    };
  });
}
