import type { PhaseRecoveryView } from "./phase-recovery.js";
import { codexBillingView } from "../billing/codex.js";
import type { BillingView } from "../billing/authority.js";
import { RESULT_CHECK } from "../audit/admission.js";
import { activityHistory, auditLabel, acceptedAudit } from "../audit/workflow.js";
import { AuditStore } from "../audit/storage.js";
import type { WorkSnapshot } from "../audit/contracts.js";
import { simpleCommands } from "../session/bash-command.js";
import { deliveryEnabled } from "./development-delivery.js";
import type { DevelopmentSettings } from "../state/development-delivery.js";
import { AGENT_NAMES, type AgentId } from "../state/records.js";
import type { AgentAccount } from "../agents/metadata.js";
import { selectedChoice } from "../state/records.js";
// The Snapshot every screen renders from (technical design, "Snapshot"), built from the
// engine's record, the plan as last read, what the engine is doing, and the account and model
// list once they have arrived.

import { readFileSync } from "node:fs";
import { effortLevelsFor } from "../account/model-list.js";
import { join } from "node:path";
import { countAssumptions, countDesignCitations, countPrdCriteria } from "../plan/document-counts.js";
import { leavesOf, type PhasePlan } from "../plan/phase-plan.js";
import { auditRecoveryPrompt, codexSessionPrompt, freshSessionPrompt, pullRequestSessionPrompt, resumePrompt } from "../session/prompts.js";
import { readOutputLines } from "../session/claude-session.js";
import { runTiming, type Timing } from "../session/timing.js";
import { stepStates, type OutputLine } from "../session/session-output.js";
import { automaticResumeSchedule, blockingRow, limitRow } from "../session/usage-limit.js";
import type { StartCheckReport } from "../start-checks.js";
import { applyWaivers, AUDIT_WARNING, checkCounts, effectiveRecordedClosed, KNOWN_PROBLEM_CHECKS, NO_REPORT_WARNING, PLAN_WARNING, type AuditWaiverResult, type MarkCompleteOffer, type WaivedItem, type Waiver, type WaiverSource } from "./waivers.js";
import { PR_PHASE_KEY, type CheckRun, type CheckResult, type Effort, type PullRequestFacts, type MergedBranchFacts, type DeliveryHistory, type RecordedPlanPhase, type RepositoryKind, type SessionRecord, type StopKind, type StopLimit } from "../state/records.js";
import type { Engine, RepositoryCommits } from "./engine.js";
import { judgedPhase, recordedLeaves } from "./plan-reading.js";
import { baseFor, displayPath, expandHome, type FieldErrors } from "./worktree-setup.js";
import { noticeLines } from "./compatibility-notices.js";

export const PR_TITLE = "Final pull request";

export type FeatureState = "not_started" | "implementing" | "paused" | "needs_you" | "waiting" | "complete" | "folder_missing";

/** The Folder missing page's facts (missing worktree recovery, "Interfaces"); the setup panel joins it in Phase 2. */
export type FolderMissingSnapshot = Omit<import("./folder-facts.js").FolderMissingView, "existingBranch" | "reads"> & {
  /** The setup panel (AC-SETUP-01 to 03, 07), or why it can't suggest a start (AC-FACTS-03, AC-SETUP-02). */
  panel?: import("./folder-setup.js").PanelView;
  /** What a Start that failed partway did, and what remains (AC-SAFE-01). */
  startProgress?: { done: string[]; remaining: string[]; error: string };
  /** Whether the folder can be put back could not be told, because a read it depends on failed (AC-FACTS-03). */
  restoreUnknown?: true;
  /** The stopped phase's last completion results, shown only as history with when they were checked (AC-GONE-02). */
  stoppedResult?: { phaseId: string; checkedAt: string; passed: number; failed: number };
  /** The completion results recorded when the phase waiting for usage was last judged, shown only as history (AC-GONE-02). */
  waitingResult?: { phaseId: string; checkedAt: string; passed: number; failed: number };
};

/**
 * A usage limit as the waiting screen and a usage-limit Needs you show it (usage-limit recovery
 * AC-LIMIT-01 to 03, technical design "Snapshot"). `account` is the reading the Claude account
 * panel holds, once one started after the refusal; `percent` the stopping limit's row in it;
 * `atLimitUntil` that row's reset while it reads 100%; `blockingLimit`, on the waiting screen once
 * the reset has passed, another row at 100% that still keeps the account from having usage left.
 */
export interface LimitView {
  agentId?: AgentId;
  recovery?: { state: "allowed" | "blocked" | "unknown"; reason: string };
  allowances?: AgentAccount["limits"];
  allowancesObservation?: { observedAt: string | null; state: "current" | "stale" | "unavailable"; reason: string | null };
  label: string;
  resetsAt?: string;
  resetPassed: boolean;
  /** Effective reset plus the provider buffer; absent time means no reliable countdown. */
  automaticResume?: { label: string; at?: string };
  account?: { email?: string; plan?: string; error?: string; percent?: number; at: string; atLimitUntil?: string };
  blockingLimit?: { label: string; resetsAt?: string };
}
type StepView = { name: string; state: "finished" | "current" | "unreached" | "observed" | "unobserved"; startedAt?: string };

export interface SessionIdentityView {
  agentId?: AgentId;
  agent?: string;
  providerSessionId?: string;
  requested?: { model: string; effort?: string };
  effective?: { model: string; effort?: string };
  observed?: import("../state/records.js").CodexTurnExecution[];
  recoveryObserved?: import("../state/records.js").CodexTurnExecution[];
  historyError?: string;
  originalAccount?: import("../state/records.js").CodexAccountProvenance;
  attemptAccount?: import("../state/records.js").CodexAccountProvenance;
  cleanupWarning?: string;
  cleanupFailure?: string;
  failure?: string;
  humanRequests?: import("../state/records.js").CodexRunFacts["humanRequests"];
  resumeError?: string;
}

export function sessionIdentity(session: SessionRecord): SessionIdentityView {
  const run = session.runs.at(-1)?.codex;
  return {
    agentId: session.agentId ?? "claude_code", agent: AGENT_NAMES[session.agentId ?? "claude_code"],
    ...optional("providerSessionId", session.conversation?.threadId),
    ...(session.agentId === "codex" ? { requested: { model: session.model, ...optional("effort", session.effort) } } : {}),
    ...optional("effective", run?.effective), ...optional("observed", run?.observed),
    ...optional("recoveryObserved", session.codex?.recoveryObserved), ...optional("historyError", session.codex?.historyError),
    ...optional("originalAccount", session.codex?.originalAccount), ...optional("attemptAccount", run?.account),
    ...optional("cleanupWarning", run?.cleanupWarning), ...optional("cleanupFailure", run?.cleanupFailure),
    ...optional("failure", run?.failure), ...optional("humanRequests", run?.humanRequests), ...optional("resumeError", session.codex?.resumeError),
  };
}

export interface DocumentsFound {
  prd: { file: string; criteriaCount: number; firstLabel?: string; lastLabel?: string };
  design: { file: string; criteriaCited: number };
  assumptions: { file: string; total: number; notYetConfirmed: number } | null;
  plan: {
    phaseDocCount: number;
    leafCount: number;
    closedCount: number;
    /** `repositories`: the names on each document's `**Repositories:**` line (multi-repo AC-REPO-03). */
    phases: { id: string; title: string; splitInto?: string[]; closed: boolean; repositories: string[] }[];
  };
  /** Links in the requirements Kiln won't follow, when there are any: neither a passed nor a failed check (Kiln Linked Documents AC-LINK-04). */
  unfollowedLinks?: { target: string; from: string; reason: string }[];
  checks: { name: string; passed: boolean }[];
}

export interface PhaseView {
  activityId?: string;
  kind?: "implementation" | "delivery_audit" | "test_audit" | "final_delivery";
  round?: number;
  continuationIndex?: number;
  audit?: { outcome?: string; summary?: string; checks: CheckResult[]; criteria: { key: string; status: string; findings: string[] }[]; repositories: { name: string; revision: string }[]; blockers: string[]; pendingActions: string[]; remainingAfterDeliveryActions?: string[] };
  outputLineCount?: number;
  id: string;
  title: string;
  file: string;
  state: "planned" | "next" | "implementing" | "needs_you" | "waiting" | "done" | "split";
  splitInto?: string[];
  sessionStartedAt?: string;
  timing?: Timing;
  doneAt?: string;
  pushedSha?: string;
  finishedByPerson: boolean;
  /** A multi-repository PRD's Done: how many repositories the phase pushed to, in place of its pushed commit (AC-PRS-03). */
  pushedRepositoryCount?: number;
  /** Checks met only through a waiver in this activity's completion (AC-WAIVE-10): "Complete · N check(s) waived". */
  waivedChecks?: number;
  /** The waived completion's check list, marked, with its counts (AC-WAIVE-10). */
  waivedCompletion?: { checks: CheckResult[]; counts: CheckCounts };
  /** The waivers that count on this activity: its own, and a `continued` one on it once complete. */
  waivers?: WaiverView[];
  /** Warning markers beside its status (AC-WAIVE-04, AC-WAIVE-12). */
  warnings?: { kind: WaiverWarningKind; text: string }[];
  /** Skipped under a waived plan problem (AC-WAIVE-04): not built, counted as closed. */
  skippedByWaiver?: true;
  details?: SessionIdentityView & {
    from: string;
    to?: string;
    model: string;
    effort?: Effort;
    worktree: string;
    branch: string;
    commitCount?: number;
    latestCommit?: string;
    sessionId: string;
    /** A multi-repository PRD: each repository with commits in the phase, in list order (AC-PRS-03). */
    repositories?: RepositoryDetails[];
  };
}

/** A saved waiver as the screens show it (AC-WAIVE-08, AC-WAIVE-10). */
export interface WaiverView {
  id: string;
  at: string;
  activityKey: string;
  /** The activity's name in a sentence: "Phase 3", "Final delivery", "Delivery audit". */
  activity: string;
  effect: "completed" | "continued";
  source: WaiverSource;
  /** The check run Mark complete was offered on. */
  checkRun: { id: string; at: string };
  items: WaivedItem[];
}

export type WaiverWarningKind = "plan_problem_waived" | "audit_problem_waived" | "no_audit_report";

/** Check counts with waived checks reported separately (AC-WAIVE-10). */
export interface CheckCounts { passed: number; waived: number; failed: number }

export interface RepositoryDetails {
  name: string;
  /** The judged leaf it was added in, for an added repository. */
  addedInPhase?: string;
  worktree: string;
  branch: string;
  commitCount: number;
  latestCommit: string;
}

/** One of the PRD's repositories, as Documents found and the settings list them (multi-repo AC-REPO-03, AC-PRS-04). */
export interface RepositoryRow {
  github?: string;
  name: string;
  kind: RepositoryKind;
  /** The judged leaf it was added in, for an added repository. */
  addedInPhase?: string;
  baseBranch: string;
  /** Not started only: the base field's list, from its origin. */
  baseBranches?: string[];
  baseCheck?: "checking" | "ok" | "error";
  /** Shown under `~/`. */
  worktreePath: string;
  fixed: boolean;
  /** That row's base message. */
  fieldErrors: { baseBranch?: string };
}

export interface Snapshot {
  /** Set exactly when `feature.state` is `folder_missing` (AC-GONE-02). */
  folderMissing?: FolderMissingSnapshot;
  /** The record's compatibility notices, one line each, shown on every screen (AC-AGENT-04). */
  compatibility?: string[];
  liveControl?: import("../live/target.js").LiveView;
  continuation?: { preparation?: ReturnType<Engine["preparationStatus"]>; acceptance?: ReturnType<Engine["continuationAcceptance"]>; executions?: Omit<import("./continuation-state.js").ExecutionSummary, "archiveId">[]; check?: import("./completed-plan-discovery.js").CompletedPlanCheck; handback?: import("./plan-reconciliation.js").HandbackNotice; planCheck?: { status: "failed"; attemptedAt: string; problem: string } };
  controlToken?: string;
  unsentReplies?: { id: string; text: string }[];
  billing?: BillingView;
  activities?: PhaseView[];
  auditHistoryUnavailable?: boolean;
  developmentDelivery?: ReturnType<Engine["deliveryStatus"]>;
  feature: {
    name: string;
    repositoryName: string;
    /** More than one repository (multi-repo AC-SPACE-03): the screens then show them. */
    multiRepository: boolean;
    prdFolder: string;
    state: FeatureState;
    currentPhaseId?: string;
    phasesDone: number;
    phasesTotal: number;
    startedAt?: string;
    completedAt?: string;
    timing?: Timing;
    stoppedAt?: string;
  };
  documents?: DocumentsFound & { starting?: true; startError?: string };
  settings: {
    developmentDeployments?: DevelopmentSettings;
    agent: string;
    agentId?: AgentId;
    agentFixed?: boolean;
    selectionGeneration?: number;
    metadataPending?: boolean;
    readinessErrors?: string[];
    choiceNotice?: string;
    efforts?: { value: string; label: string; description?: string }[];
    model: { value: string; displayName: string };
    effort: Effort;
    effortLevels: Effort[] | null;
    modelListError?: string;
    keepAwake: boolean;
    keepAwakeError?: string;
    /** Usage-limit recovery AC-AUTO-04. */
    resumeAfterUsageLimit: boolean;
    /** Shown under `~/`; only a multi-repository PRD's screens show it. */
    workspaceFolder: string;
    worktreePath: string;
    featureBranch: string;
    baseBranch: string;
    /** Not started only: the base field's list and whether the base check is running. */
    baseBranches?: string[];
    baseCheck?: "checking" | "ok" | "error";
    fixed: { workspaceFolder: boolean; featureBranch: boolean; worktreePath: boolean };
    fieldErrors: FieldErrors;
  };
  /** The PRD's repositories in list order: the PRD's repository, named, then added. */
  repositories: RepositoryRow[];
  /** The Model list's entries, once Claude Code's list has loaded (Startup order). */
  models?: { value: string; displayName: string }[];
  phases: PhaseView[];
  /** Every saved waiver, oldest first (AC-WAIVE-08), for the tags and the delivery panel. */
  waivers?: WaiverView[];
  current?: SessionIdentityView & {
    deliveryActivity?: { label: string; repository?: string; environment?: string };
    phaseId: string;
    sessionId?: string;
    model: string;
    effort?: Effort;
    startedAt?: string;
    steps: StepView[];
    seenInSession?: { text: string; at: string };
    latestLine?: OutputLine;
    /** The phase's commits by repository, only those with commits, newest first. */
    repositories: RepositoryCommits[];
    reviewerWorking?: boolean;
    followUp?: boolean;
  };
  needsYou?: SessionIdentityView & {
    phaseId: string;
    kind: StopKind;
    stoppedAt: string;
    /** `stoppedAt` is the interrupted run's last output, since Kiln recorded no interruption time. */
    stoppedAtIsLastOutput?: true;
    /** A `not_resumable` stop left by the person's Resume, not by Kiln resuming an interruption (usage-limit recovery AC-RESUME-04). */
    pressedResume?: true;
    finalMessage?: string;
    exitCode?: number;
    signal?: string;
    spawnError?: { code: string; message: string };
    lastSkill?: { name: string; at: string };
    lastLines?: OutputLine[];
    /** The latest check run's rows, marked by the coverage rule (AC-WAIVE-10, AC-WAIVE-11). */
    checks: CheckResult[];
    /** Their counts, waived checks separately (AC-WAIVE-10). */
    counts?: CheckCounts;
    checkedAt?: string;
    /** The latest check run: `origin: stop` until the person checks again (AC-NEXT-02). */
    checkRun?: CheckRun;
    /** Whether Mark complete is offered, and what it would do (AC-WAIVE-02, AC-WAIVE-03). */
    markComplete?: MarkCompleteOffer;
    phaseRecovery?: PhaseRecoveryView;
    checking?: true;
    /** Resume, with its note, is offered (usage-limit recovery AC-RESUME-01). */
    resumeOffered: boolean;
    resumeCommand?: string;
    /** Send in the reopened conversation before working, so older instructions receive current authority. */
    resumePrompt?: string;
    freshSessionPrompt: string;
    /** `cd <worktree>` then `claude`: how a fresh session starts when there is nothing to resume (UI-007). */
    freshSessionCommand: string;
    outputLineCount?: number;
    sessionEndedAt?: string;
    steps?: StepView[];
    /** The stopped session, for Full session output (AC-WATCH-06, AC-WATCH-10). */
    sessionId?: string;
    model?: string;
    effort?: Effort;
    sessionStartedAt?: string;
    /** The phase's commits by repository, only those with commits, newest first. */
    repositories?: RepositoryCommits[];
    /**
     * @deprecated Retired legacy snapshot shape. New snapshots never expose it.
     */
    outside?: {
      changes: string[];
      missingTranscripts: string[];
      checkouts: string[];
      prompt?: string;
      confirmation: { offered: boolean; ticked: boolean };
      uncertainty?: { offered: boolean; ticked: boolean };
    };
    /** The interrupted run's timing, retained while independent recovery requirements are checked. */
    interrupted?: { at: string; atIsLastOutput: boolean };
    /** The stopped session hit a usage limit (usage-limit recovery AC-LIMIT-01 to 03); `refusedAgainAt` when Kiln's own resume was refused again (AC-AUTO-05). */
    limit?: LimitView & { refusedAgainAt?: string };
  };
  /**
   * Waiting for usage (usage-limit recovery AC-LIMIT-04): the limit, how the session ended
   * (AC-STOP-02) and Full session output's fields; `checking` while Resume now or the end of the
   * wait holds the lock.
   */
  waiting?: SessionIdentityView & {
    phaseId: string;
    since: string;
    limit: LimitView;
    sessionId: string;
    stoppedAt: string;
    finalMessage?: string;
    exitCode?: number;
    signal?: string;
    lastSkill?: { name: string; at: string };
    lastLines?: OutputLine[];
    outputLineCount?: number;
    checking?: true;
    model: string;
    effort?: Effort;
    sessionStartedAt?: string;
    sessionEndedAt?: string;
    steps?: StepView[];
    /** The phase's commits by repository, read from Git when the wait started. */
    repositories: RepositoryCommits[];
  };
  pause: { pending: boolean; active: boolean };
  restartReview?: { activityKey: string; action: "start" | "resume" | "wait" };
  /** The signed-in account and its usage, once the first calls return (Startup order). */
  account?: AgentAccount;
  /** Every pull request, in list order, once the PRD is complete (multi-repo AC-PRS-03). */
  pullRequests?: PullRequestFacts[];
  mergedBranches?: MergedBranchFacts[];
  deliveryHistory?: DeliveryHistory;
  deliveryHistoryPending?: boolean;
  deliveryHistoryError?: string;
}

/**
 * Builds the snapshot from the engine's state now.
 *
 *   const snapshot = buildSnapshot(engine, documentsFound);
 *   snapshot.feature.state  // "implementing"
 */
export interface SnapshotReads {
  /** Inspection publishes saved attempt times directly and avoids aggregate browser timing. */
  includeTiming?: boolean;
  auditStore?: Pick<AuditStore, "read">;
  output?: (session: SessionRecord) => OutputLine[];
}
const REFUSAL_CODES = new Set(["malformed_request", "outside_execution", "report_too_large", "stale_revision", "wrong_activity", "busy", "result_conflict", "invalid_report", "stale_snapshot", "inconsistent_plan", "missing_evidence", "evidence_unavailable"]);
/** A stop saved before refusals were titled by their condition still shows the condition, not the code. */
function auditCheckTitle(key: string, check: CheckResult): CheckResult {
  return key.startsWith("audit-") && REFUSAL_CODES.has(check.name) ? { ...check, name: RESULT_CHECK } : check;
}

export function buildSnapshot(engine: Engine, documents?: DocumentsFound, reads: SnapshotReads = {}): Snapshot {
  const includeTiming = reads.includeTiming !== false;
  const { record } = engine;
  const plan = record.plan ?? [];
  const leaves = recordedLeaves(plan);
  const stoppedKey = engine.stoppedPhaseKey();
  const waitingKey = engine.waitingPhaseKey();
  const folderMissing = engine.isUnderway && !engine.currentlyComplete ? engine.folderMissing : undefined;
  const state: FeatureState = !engine.isUnderway
    ? "not_started"
    : folderMissing
      ? "folder_missing"
      : engine.currentlyComplete
      ? "complete"
      : stoppedKey !== undefined
        ? "needs_you"
        : engine.restartReview
          ? "paused"
          : waitingKey !== undefined
          ? "waiting"
          : record.pause.activeSince !== undefined
          ? "paused"
          : "implementing";

  // While a folder is missing no phase state is current: earlier results are history only (AC-GONE-02).
  const needsYou = stoppedKey === undefined || folderMissing ? undefined : needsYouView(engine, stoppedKey);
  const waiting = state === "waiting" ? waitingView(engine, waitingKey!) : undefined;
  const current = state === "implementing" ? currentView(engine, reads) : undefined;
  const settings = record.settings;
  const entry = engine.modelEntry(selectedChoice(settings).model);
  const metadata = engine.agents.state;

  const views = phaseViews(engine, state, includeTiming);
  const snapshot: Snapshot = {
    ...(record.continuation || record.completedPlanCheck || record.planReconciliation?.handback || record.planReconciliation?.check?.status === "failed" ? { continuation: {
      ...(record.preparation ? { preparation: engine.preparationStatus(record.executionId, record.preparation.phaseId) } : {}),
      ...(record.continuation ? { acceptance: engine.continuationAcceptance(), executions: record.continuation.executions.slice(-100).reverse().map(({ archiveId: _archiveId, ...row }) => { void _archiveId; return row; }) } : {}),
      ...(record.completedPlanCheck ? { check: record.completedPlanCheck } : {}),
      ...(record.planReconciliation?.handback ? { handback: record.planReconciliation.handback } : {}),
      ...(record.planReconciliation?.check?.status === "failed" ? { planCheck: { status: "failed" as const, attemptedAt: record.planReconciliation.check.attemptedAt, problem: record.planReconciliation.check.problem! } } : {}),
    } } : {}),
    activities: activityViews(engine, state, views, includeTiming, reads.auditStore),
    ...(record.completionAudits?.policy === "legacy_complete" ? { auditHistoryUnavailable: true } : {}),
    feature: {
      name: engine.paths.featureName,
      repositoryName: engine.paths.repositoryName,
      multiRepository: engine.multiRepository,
      prdFolder: `${engine.paths.prdDirectoryFromRoot}/`,
      state,
      phasesDone: deliveryEnabled(record) ? views.filter(phase => phase.id !== PR_PHASE_KEY && phase.state === "done").length : leaves.filter((leaf) => effectiveRecordedClosed(record, leaf)).length,
      phasesTotal: leaves.length,
      ...optional("currentPhaseId", needsYou?.phaseId ?? waiting?.phaseId ?? current?.phaseId),
      ...optional("startedAt", record.startedAt),
      ...optional("completedAt", record.completedAt),
      ...(includeTiming ? optional("timing", timingFor(engine, Object.keys(record.phases), record.startedAt, record.completedAt)) : {}),
      ...optional("stoppedAt", needsYou?.stoppedAt),
    },
    ...optional("liveControl", engine.liveView()),
    ...(engine.record.compatibility?.length ? { compatibility: noticeLines(engine.record) } : {}),
    ...(stoppedKey !== undefined || deliveryEnabled(record) ? { developmentDelivery: engine.deliveryStatus() } : {}),
    settings: {
      ...optional("developmentDeployments", settings.developmentDeployments),
      agent: AGENT_NAMES[settings.agentId],
      agentId: settings.agentId,
      agentFixed: engine.agentFixed,
      selectionGeneration: metadata.generation,
      metadataPending: metadata.pending,
      readinessErrors: metadata.blockers,
      ...optional("choiceNotice", engine.choiceNotice),
      ...optional("efforts", entry?.efforts),
      // A saved alias the list doesn't offer, or any model before the list loads, is named as saved.
      model: { value: selectedChoice(settings).model, displayName: entry?.displayName ?? selectedChoice(settings).model },
      effort: selectedChoice(settings).effort ?? "",
      effortLevels: effortLevelsFor(entry),
      ...optional("modelListError", metadata.modelListError),
      keepAwake: settings.keepAwake,
      ...optional("keepAwakeError", engine.keepAwakeError),
      resumeAfterUsageLimit: settings.resumeAfterUsageLimit,
      workspaceFolder: displayPath(expandHome(settings.workspaceFolder)),
      worktreePath: displayPath(engine.worktreePath),
      featureBranch: settings.featureBranch,
      baseBranch: settings.baseBranch,
      ...(state === "not_started" ? { ...optional("baseBranches", engine.baseBranches), ...optional("baseCheck", engine.baseCheck) } : {}),
      fixed: {
        workspaceFolder: engine.isUnderway || engine.workspaceFixed || !engine.multiRepository,
        featureBranch: engine.isUnderway || engine.workspaceFixed,
        worktreePath: engine.isUnderway || engine.workspaceFixed,
      },
      fieldErrors: engine.currentFieldErrors,
    },
    repositories: repositoryRows(engine, state),
    ...optional("models", metadata.models?.map((model) => ({ value: model.value, displayName: model.displayName }))),
    phases: views,
    ...(record.waivers?.length ? { waivers: record.waivers.map(waiver => waiverView(engine, waiver)) } : {}),
    ...optional("restartReview", engine.restartReview),
    pause: { pending: record.pause.requestedAt !== undefined && record.pause.activeSince === undefined, active: record.pause.activeSince !== undefined },
    ...optional("account", metadata.account),
    billing: record.settings.agentId === "claude_code" ? engine.billing.view : codexBillingView(metadata, record.executionId!, record.billing?.lastLaunch),
    ...optional("pullRequests", record.pullRequests),
    ...optional("mergedBranches", record.mergedBranches),
    ...optional("deliveryHistory", record.deliveryHistory),
    deliveryHistoryPending: engine.deliveryHistoryPending,
    ...optional("deliveryHistoryError", engine.deliveryHistoryError),
    ...optional("current", current),
    ...optional("needsYou", needsYou),
    ...optional("waiting", waiting),
    ...(folderMissing ? { folderMissing: folderMissingSnapshot(folderMissing, engine) } : {}),
  };
  if (state === "not_started" && documents) {
    snapshot.documents = { ...documents, ...(engine.settingUp ? { starting: true as const } : {}), ...optional("startError", engine.startError) };
  }
  return snapshot;
}

function folderMissingSnapshot(view: import("./folder-facts.js").FolderMissingView, engine: Engine): FolderMissingSnapshot {
  const { checkedAt, repositories, plans, factsId } = view;
  const stoppedKey = engine.stoppedPhaseKey();
  const stop = stoppedKey === undefined ? undefined : engine.record.phases[stoppedKey]?.stop;
  const waitingKey = engine.waitingPhaseKey();
  const wait = waitingKey === undefined ? undefined : engine.record.phases[waitingKey]?.wait;
  const results = (key: string, checks: { passed: boolean }[], checkedAt: string) => ({ phaseId: engine.judgedId(key), checkedAt, passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length });
  // The put-it-back command only while the panel offers the existing branch as an available start (AC-SETUP-06);
  // a panel that is blocked or withholds that start for a failed read can't yet tell (AC-FACTS-03).
  const panel = engine.folderPanel;
  const offered = !!panel && !("blocked" in panel) && !("unavailable" in panel.choices.branch);
  const restoreCommands = offered ? view.restoreCommands : [];
  const restoreUnknown = view.existingBranch.available === "unknown" || view.existingBranch.available === true && !offered;
  return { checkedAt, repositories, plans, restoreCommands, factsId, ...(restoreUnknown ? { restoreUnknown: true as const } : {}),
    // The busy line is read now, so it clears as soon as the session ends (AC-SAFE-01).
    ...(engine.folderPanel ? { panel: "blocked" in engine.folderPanel ? engine.folderPanel : livePanel(engine.folderPanel, engine) } : {}), ...(engine.folderStartProgress ? { startProgress: engine.folderStartProgress } : {}),
    ...(stop ? { stoppedResult: results(stoppedKey!, stop.checks, stop.checkedAt) } : {}),
    ...(wait ? { waitingResult: results(waitingKey!, wait.checks, wait.checkedAt) } : {}) };
}

/**
 * The stored panel with what can change without a rebuild read now: the busy line (AC-SAFE-01), and
 * Model's message and the efforts the panel's model takes, as the model catalogue arrives (AC-SETUP-01).
 */
function livePanel(stored: import("./folder-setup.js").SetupPanel, engine: Engine): import("./folder-setup.js").SetupPanel {
  const { busy: _busy, efforts: _efforts, fieldErrors: { model: _model, ...fieldErrors }, ...panel } = stored;
  void _busy; void _efforts; void _model;
  const busy = engine.folderBusy();
  const model = engine.folderModelCheck({ model: panel.fields.model, ...(panel.fields.effort ? { effort: panel.fields.effort } : {}) });
  return { ...panel, fieldErrors: { ...fieldErrors, ...(model.error ? { model: model.error } : {}) }, effortLevels: model.effortLevels, ...(model.efforts ? { efforts: model.efforts } : {}), ...(busy ? { busy } : {}) };
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

function sessionFor(engine: Engine, phaseKey: string): SessionRecord | undefined {
  return engine.latestSession(phaseKey);
}

/** The leaf a launched leaf's session is shown as, after any split; the launched leaf when the plan doesn't have it. */
function judgedKeyFor(plan: RecordedPlanPhase[], launchedKey: string): string {
  if (launchedKey === PR_PHASE_KEY) return launchedKey;
  return judgedPhase(plan, launchedKey)?.id ?? launchedKey;
}

function currentView(engine: Engine, reads: SnapshotReads): Snapshot["current"] {
  const current = engine.current;
  if (!current) return undefined;
  const plan = engine.record.plan ?? [];
  const session = current.session;
  const settings = engine.record.settings;
  if (!session) {
    return { phaseId: current.phaseKey, model: selectedChoice(settings).model, effort: selectedChoice(settings).effort ?? "", steps: engine.auditActivity(current.phaseKey) ? [] : stepStates([], settings.agentId), repositories: [] };
  }
  const followUp = session.runs.some((run, index) => run.cause === "person_resume" && (run.note !== undefined || session.runs[index - 1]?.limitRefusal === undefined));
  const steps = sessionSteps(engine, current.phaseKey, session).map(step => followUp && step.state === "current" ? { ...step, state: "observed" as const } : step);
  const latestStep = [...session.steps].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)).at(-1);
  let seen: { text: string; at: string } | undefined;
  if (latestStep) seen = { text: stepLine(latestStep.name), at: latestStep.startedAt };
  if (session.lastSkill && (!seen || session.lastSkill.at > seen.at)) seen = { text: `${session.lastSkill.name} skill started`, at: session.lastSkill.at };
  return {
    ...(deliveryEnabled(engine.record) ? { deliveryActivity: observedDeliveryActivity(engine, session, reads.output) } : {}),
    phaseId: judgedKeyFor(plan, current.phaseKey),
    ...sessionIdentity(session),
    sessionId: session.sessionId,
    model: session.modelDisplayName,
    ...optional("effort", session.effort),
    ...optional("startedAt", session.runs[0]?.startedAt),
    steps,
    ...(followUp ? { followUp: true } : {}),
    ...optional("seenInSession", seen),
    ...optional("latestLine", current.latestLine),
    repositories: current.commits,
    ...(current.processRunning && current.reader?.reviewerWorking ? { reviewerWorking: true } : {}),
  };
}

/** A started step's line on Phase detail (UI-010 item 11). */
function stepLine(name: string): string {
  switch (name) {
    case "Build":
      return "implement-from-requirements skill started";
    case "Deliverable review":
      return "deliverable-review skill started";
    case "Test hardening":
      return "test-hardening skill started";
    case "Refactor pass":
      return "refactor-pass skill started";
    case "Commit":
      return "first git commit seen";
    default:
      return "git push seen";
  }
}

function needsYouView(engine: Engine, phaseKey: string): Snapshot["needsYou"] {
  const { record } = engine;
  const hold = record.billing?.hold?.phaseKey === phaseKey ? record.billing.hold : undefined;
  const retainedStop = record.phases[phaseKey]?.stop;
  // A hold's own run and rows govern (waivers "Check Runs"); where the activity has run, the Billing approval row is shown beside them, outside the run.
  const holdRows = hold ? hold.checks ?? retainedStop?.checks ?? record.phases[phaseKey]?.wait?.checks ?? [] : [];
  const stop = hold ? { kind: "billing" as const, at: hold.at, checkedAt: hold.run?.at ?? hold.at, ...optional("run", hold.run), checks: holdRows.some(check => check.name === "Billing approval") ? holdRows : [...holdRows, { name: "Billing approval", passed: false, facts: [hold.reason, ...hold.observed.sources] }], ...(retainedStop?.limit ? { limit: retainedStop.limit } : {}) } : retainedStop!;
  const phaseRecovery = engine.phaseRecoveryView();
  const plan = record.plan ?? [];
  const isPr = phaseKey === PR_PHASE_KEY;
  const judged = judgedKeyFor(plan, phaseKey);
  const checks = (phaseRecovery ? retainedStop?.checks ?? [] : stop.checks).map(check => auditCheckTitle(phaseKey, check));
  const checkRun = phaseRecovery ? retainedStop?.run : stop.run;
  const base = {
    phaseId: judged,
    kind: stop.kind,
    checks,
    counts: checkCounts(checks),
    ...optional("checkRun", checkRun),
    markComplete: engine.markCompleteOffer(),
    ...(phaseRecovery ? { phaseRecovery, ...optional("checkedAt", retainedStop?.checkedAt) } : { checkedAt: stop.checkedAt }),
    ...(engine.checking ? { checking: true as const } : {}),
    resumeOffered: engine.resumeOffered(phaseKey),
    ...optional("limit", stop.limit === undefined ? undefined : { ...limitView(engine, phaseKey, stop.limit, false), ...optional("refusedAgainAt", stop.limit.refusedAgainAt) }),
  };
  const session = stop.kind === "plan" || stop.kind === "selection" ? undefined : sessionFor(engine, phaseKey);
  // The folder the session started in; with no session, the one the phase's next session would start in (AC-SPACE-04).
  const folder = session ? engine.workingDirectoryOf(session) : engine.sessionFolder;
  const auditTask = engine.auditRecoveryTask(phaseKey, folder);
  const originalPrompts = (ran: boolean) =>
      auditTask ? auditRecoveryPrompt(auditTask, engine.deliveryAuthority()) :
      isPr
        ? pullRequestSessionPrompt({
            deliveryAuthority: engine.deliveryAuthority(),
            featureName: engine.paths.featureName,
            prdFile: engine.pathFrom(folder, engine.prdFile()),
            branch: record.settings.featureBranch,
            repositories: engine.pullRequestRepositories().map((entry) => ({
              name: entry.name,
              github: entry.github,
              worktreePath: expandHome(entry.worktreePath),
              baseBranch: entry.baseBranch,
              isPrd: entry.kind === "prd",
            })),
          })
        : freshSessionPrompt(engine.phasePromptValues(engine.fileOf(judged) ?? "", folder), ran);

  const prompts = (ran: boolean) => session?.agentId === "codex" && session.kind === "phase" && session.codex ? codexSessionPrompt(originalPrompts(ran), session.codex.launchIntent.skills) : originalPrompts(ran);
  const freshSessionCommand = (session?.agentId ?? record.settings.agentId) === "codex" ? codexCommand(folder) : claudeCommand(folder);
  if (!session) return { ...base, stoppedAt: stop.at, freshSessionPrompt: prompts(false), freshSessionCommand };

  const run = session.runs.at(-1);
  const sessionFacts = {
    ...sessionIdentity(session),
    sessionId: session.sessionId,
    model: session.modelDisplayName,
    ...optional("effort", session.effort),
    ...optional("sessionStartedAt", session.runs[0]?.startedAt),
    repositories: engine.stoppedCommits?.phaseKey === phaseKey ? engine.stoppedCommits.commits : [],
  };
  const everStarted = session.runs.some((candidate) => candidate.pid !== undefined);
  const lines = engine.outputLines(session);
  const endedAt = run?.endedAt ?? stop.at;
  if (stop.kind === "not_resumable") {
    // In place of AC-STOP-02's list: when the session was interrupted, its last lines, and the
    // fresh session with no resume command (AC-KEEP-05). The interrupted run is the one before the failed resume.
    // After the person's Resume (usage-limit recovery AC-RESUME-04) that run may have ended on its own: then it stopped at its end.
    const interruptedIndex = session.runs.length - 2;
    const interrupted = session.runs[interruptedIndex];
    const pressedResume = run?.cause === "person_resume";
    const ended = pressedResume && interrupted?.interruptedAt === undefined ? interrupted?.endedAt : undefined;
    const lastOutput = interrupted?.interruptedAt === undefined && ended === undefined;
    const stoppedAt = interrupted?.interruptedAt ?? ended ?? (interrupted ? engine.runLastOutputAt(session, interruptedIndex) : undefined) ?? endedAt;
    return {
      ...base,
      ...sessionFacts,
      stoppedAt,
      ...(lastOutput ? { stoppedAtIsLastOutput: true as const } : {}),
      ...(pressedResume ? { pressedResume: true as const } : {}),
      lastLines: lines.slice(-10),
      freshSessionPrompt: prompts(true),
      freshSessionCommand,
      outputLineCount: lines.length,
      sessionEndedAt: endedAt,
      steps: sessionSteps(engine, phaseKey, session),
    };
  }
  // An interrupted session Kiln stopped instead of resuming shows when it was interrupted and its last lines (AC-OUTSIDE-04).
  const interrupted = stop.interrupted;
  const finalMessage = interrupted === undefined && run?.result?.text?.trim() ? run.result.text : undefined;
  // `claude --resume` needs the transcript Kiln couldn't find (OUT-003).
  const resumable = everStarted && !engine.transcriptMissing(session) && (!record.liveControl || record.liveControl.takeover.state === "released");
  return {
    ...base,
    ...sessionFacts,
    stoppedAt: interrupted?.at ?? endedAt,
    ...(interrupted?.atIsLastOutput ? { stoppedAtIsLastOutput: true as const } : {}),
    ...optional("interrupted", interrupted),
    ...optional("finalMessage", finalMessage),
    ...optional("exitCode", run?.exitCode),
    ...optional("signal", run?.signal),
    ...optional("spawnError", run?.spawnError),
    ...(everStarted ? optional("lastSkill", session.lastSkill) : {}),
    ...(finalMessage === undefined ? { lastLines: lines.slice(-10) } : {}),
    ...(resumable ? {
      resumeCommand: session.agentId === "codex" ? codexResumeCommand(folder, session) : record.liveControl ? resumeCommand(folder, session.sessionId, process.platform, true) : resumeCommand(folder, session.sessionId),
      ...(engine.deliveryAuthority() ? { resumePrompt: resumePrompt({
        deliveryAuthority: engine.deliveryAuthority(),
        agentId: session.agentId ?? "claude_code",
        endedOnItsOwn: interrupted === undefined,
        time: interrupted?.at ?? endedAt,
        ...(auditTask ? { auditTask } : isPr ? {} : { phaseDoc: engine.pathFrom(folder, `${engine.paths.prdDirectoryFromRoot}/${engine.fileOf(judged) ?? ""}`) }),
        multiRepository: isPr ? engine.pullRequestRepositories().length > 1 : folder !== engine.worktreePath,
      }) } : {}),
    } : {}),
    freshSessionPrompt: prompts(everStarted),
    freshSessionCommand,
    outputLineCount: lines.length,
    sessionEndedAt: endedAt,
    steps: sessionSteps(engine, phaseKey, session),
  };
}

/**
 * The waiting screen's facts (usage-limit recovery AC-LIMIT-04): the limit, and how the refused
 * run ended as Needs you would show it, with Full session output's fields.
 */
function waitingView(engine: Engine, phaseKey: string): Snapshot["waiting"] {
  const wait = engine.record.phases[phaseKey]!.wait!;
  const session = engine.sessionRecord(phaseKey, wait.sessionId);
  const run = session?.runs[wait.run];
  const lines = session ? engine.outputLines(session) : [];
  const finalMessage = run?.result?.text?.trim() ? run.result.text : undefined;
  return {
    phaseId: judgedKeyFor(engine.record.plan ?? [], phaseKey),
    ...(session ? sessionIdentity(session) : {}),
    since: wait.since,
    limit: limitView(engine, phaseKey, undefined, true),
    sessionId: wait.sessionId,
    stoppedAt: run?.endedAt ?? wait.since,
    ...optional("finalMessage", finalMessage),
    ...optional("exitCode", run?.exitCode),
    ...optional("signal", run?.signal),
    ...optional("lastSkill", session?.lastSkill),
    ...(finalMessage === undefined ? { lastLines: lines.slice(-10) } : {}),
    outputLineCount: lines.length,
    ...(engine.checking ? { checking: true as const } : {}),
    model: session?.modelDisplayName ?? selectedChoice(engine.record.settings).model,
    ...optional("effort", session?.effort),
    ...optional("sessionStartedAt", session?.runs[0]?.startedAt),
    ...optional("sessionEndedAt", run?.endedAt),
    ...(session ? { steps: sessionSteps(engine, phaseKey, session) } : {}),
    repositories: engine.stoppedCommits?.phaseKey === phaseKey ? engine.stoppedCommits.commits : [],
  };
}

/**
 * A usage limit's view from the refused run and the reading the account panel holds; `stop`
 * gives a usage-limit stop's own label when its session can't be read.
 */
function limitView(engine: Engine, phaseKey: string, stop: StopLimit | undefined, waitingScreen: boolean): LimitView {
  const now = engine.clock().getTime();
  const found = engine.refusedRun(phaseKey);
  const refusal = found?.refusal;
  const label = stop?.label ?? refusal?.label ?? "A usage limit";
  const resetsAt = refusal?.resetsAt ?? stop?.resetsAt;
  const view: LimitView = { label, ...optional("resetsAt", resetsAt), resetPassed: resetsAt !== undefined && now >= Date.parse(resetsAt) };
  if (found?.session.agentId === "codex") {
    view.agentId = "codex";
    view.allowancesObservation = { observedAt: null, state: "unavailable", reason: "No dated Codex usage reading is available after the refusal." };
    const release = found.session.codex?.usageRecovery?.release;
    if (release) view.recovery = { state: release.state, reason: release.reason };
    const current = engine.agents.state.account;
    if (current && Date.parse(current.startedAt) >= Date.parse(refusal!.at)) {
      view.account = { ...optional("email", current.email), ...optional("plan", current.plan), ...optional("error", current.error ?? current.limitsError), at: current.updatedAt };
      const usageAt = current.limitsObservedAt;
      const stale = !!(current.stale || current.limitsStale || current.limitsError || current.error);
      view.allowances = usageAt ? current.limits : [];
      view.allowancesObservation = { observedAt: usageAt ?? null, state: !usageAt ? "unavailable" : stale ? "stale" : "current", reason: current.limitsError ?? current.error ?? (!usageAt ? "Dated Codex usage is unavailable." : stale ? "Usage was retained without a fresh usage reading." : null) };
    }
    return view;
  }
  view.agentId = "claude_code";
  view.allowancesObservation = { observedAt: null, state: "unavailable", reason: "No dated Claude usage reading is available after the refusal." };
  const reading = engine.claude?.account;
  if (waitingScreen && found && refusal) view.automaticResume = automaticResumeSchedule(refusal, reading, found.session.initModel ?? found.session.model);
  if (!found || !refusal || reading === undefined || Date.parse(reading.startedAt) < Date.parse(refusal.at)) return view;
  const usageAt = reading.limitsObservedAt;
  const stale = !!(reading.limitsError || reading.error);
  view.allowances = usageAt ? reading.limits : [];
  view.allowancesObservation = { observedAt: usageAt ?? null, state: !usageAt ? "unavailable" : stale ? "stale" : "current", reason: reading.limitsError ?? reading.error ?? (!usageAt ? "Dated Claude usage is unavailable." : stale ? "Usage was retained without a fresh usage reading." : null) };
  const account: NonNullable<LimitView["account"]> = { ...optional("email", reading.error === undefined ? reading.email : undefined), ...optional("plan", reading.error === undefined ? reading.plan : undefined), ...optional("error", reading.error), at: reading.updatedAt };
  if (reading.error === undefined && reading.limitsError === undefined) {
    const row = limitRow(refusal.rateLimitType, reading.limits);
    if (row !== undefined) {
      account.percent = row.percent;
      if (row.percent >= 100 && row.resetsAt !== undefined && Date.parse(row.resetsAt) > now) account.atLimitUntil = row.resetsAt;
    }
    if (waitingScreen && view.resetPassed) {
      const blocking = blockingRow(reading, refusal, found.session.initModel ?? found.session.model);
      if (blocking !== undefined) view.blockingLimit = { label: blocking.label, ...optional("resetsAt", blocking.resetsAt) };
    }
  }
  view.account = account;
  return view;
}

/**
 * The command that reopens a stopped session in a terminal (AC-STOP-05): `cd <worktree>` then
 * `claude --resume <id>`, the path shown under `~/` and quoted only where the shell needs it.
 * On Windows, the PowerShell form.
 */
export function resumeCommand(worktreePath: string, sessionId: string, platform: NodeJS.Platform = process.platform, conditional = false): string {
  return claudeCommand(worktreePath, `--resume ${sessionId}`, platform, conditional);
}

/** `cd <worktree>` then `claude`, with any arguments: the path quoted as `resumeCommand` gives. */
export function claudeCommand(worktreePath: string, args?: string, platform: NodeJS.Platform = process.platform, conditional = false): string {
  const claude = args === undefined ? "claude" : `claude ${args}`;
  if (platform === "win32") return `cd '${worktreePath.replace(/'/g, "''")}'; ${claude}`;
  const shown = displayPath(worktreePath);
  const quote = (text: string) => (text === "" || /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`);
  const path = shown === "~" ? "~" : shown.startsWith("~/") ? `~/${quote(shown.slice(2))}` : quote(shown);
  return `cd ${path}${conditional ? " && " : "\n"}${claude}`;
}

function shellArgument(value: string, platform: NodeJS.Platform): string {
  if (platform === "win32") return `'${value.replaceAll("'", "''")}'`;
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

export function codexCommand(folder: string, args: string[] = [], platform: NodeJS.Platform = process.platform, codexHome?: string): string {
  const prefix = claudeCommand(folder, undefined, platform).replace(/claude$/, "");
  const home = codexHome ? platform === "win32" ? `$env:CODEX_HOME=${shellArgument(codexHome, platform)}; ` : `CODEX_HOME=${shellArgument(codexHome, platform)} ` : "";
  return `${prefix}${home}codex${args.length ? ` ${args.map(arg => shellArgument(arg, platform)).join(" ")}` : ""}`;
}

export function codexResumeCommand(folder: string, session: SessionRecord, platform: NodeJS.Platform = process.platform): string {
  if (!session.conversation?.threadId) throw new Error("Codex conversation identity is missing.");
  return codexCommand(folder, ["resume", session.conversation.threadId, "--model", session.model, ...(session.effort ? ["-c", `model_reasoning_effort=${JSON.stringify(session.effort)}`] : [])], platform, session.conversation.codexHome);
}

/** Timing is derived from saved runs; historical open runs stop at their last evidence. */
function timingFor(engine: Engine, keys: string[], from?: string, doneAt?: string): Timing | undefined {
  if (!from) return undefined;
  let running = false;
  const runs = keys.flatMap(key => (engine.record.phases[key]?.sessionIds ?? []).flatMap(id => {
    const session = engine.sessionRecord(key, id);
    if (!session) return [];
    return session.runs.map((run, index) => {
      const live = engine.current?.session?.sessionId === id && engine.current.processRunning && index === session.runs.length - 1 && !run.endedAt && !run.interruptedAt;
      running ||= live;
      return { ...run, ...(!live && !run.endedAt && !run.interruptedAt ? { endedAt: engine.runLastOutputAt(session, index) ?? run.startedAt } : {}) };
    });
  }));
  return runTiming(runs, from, doneAt ?? new Date().toISOString(), doneAt ? undefined : running ? "running" : "waiting");
}

function phaseViews(engine: Engine, state: FeatureState, includeTiming: boolean): PhaseView[] {
  const { record } = engine;
  const plan = record.plan ?? [];
  // Kiln's facts are keyed by the leaf it launched; rows follow the plan as last read.
  const factsByRow = new Map<string, string>();
  for (const key of Object.keys(record.phases)) {
    if (key !== PR_PHASE_KEY) factsByRow.set(judgedKeyFor(plan, key), key);
  }
  const nextLeaf = recordedLeaves(plan).find((leaf) => !effectiveRecordedClosed(record, leaf));
  const multi = engine.multiRepository;
  const currentRow = engine.current ? judgedKeyFor(plan, engine.current.phaseKey) : undefined;

  const rows: PhaseView[] = plan.map((phase) => {
    const base = { id: phase.id, title: phase.title, file: phase.file, finishedByPerson: false };
    if (phase.splitInto !== undefined) return { ...base, state: "split" as const, splitInto: phase.splitInto };
    const key = factsByRow.get(phase.id);
    const facts = key === undefined ? undefined : record.phases[key];
    const session = key === undefined ? undefined : sessionFor(engine, key);
    const view: PhaseView = { ...base, state: "planned" };
    const prdFacts = facts?.repositories[engine.paths.repositoryName];
    if (deliveryEnabled(record) && facts?.stop) view.state = "needs_you";
    else if (deliveryEnabled(record) && facts?.wait) view.state = "waiting";
    else if (deliveryEnabled(record) && state === "implementing" && currentRow === phase.id) view.state = "implementing";
    else if (facts?.doneAt) {
      Object.assign(view, { state: "done", doneAt: facts.doneAt, finishedByPerson: facts.finishedByPerson }, optional("pushedSha", prdFacts?.pushedSha));
      if (multi) view.pushedRepositoryCount = Object.values(facts.repositories).filter((repository) => repository.pushedSha !== undefined && repository.pushedSha !== repository.startCommit).length;
    }
    else if (facts?.stop) view.state = "needs_you";
    else if (facts?.wait) view.state = "waiting";
    else if (state === "implementing" && currentRow === phase.id) view.state = "implementing";
    else if (phase.closed) view.state = "done";
    else if (state === "paused" && nextLeaf?.id === phase.id) view.state = "next";
    const firstSession = key === undefined ? undefined : engine.sessionRecord(key, facts!.sessionIds[0] ?? "");
    const startedAt = firstSession?.runs[0]?.startedAt;
    if (startedAt && session) {
      view.sessionStartedAt = startedAt;
      if (includeTiming) view.timing = timingFor(engine, [key!], startedAt, facts?.doneAt)!;
      // Done records its count and pushed commit; a stopped row has the commits Kiln read for the stop, newest first.
      const read = engine.stoppedCommits;
      const stopped = (view.state === "needs_you" || view.state === "waiting") && read?.phaseKey === key ? read?.commits : undefined;
      const prdStopped = stopped?.find((repository) => repository.name === engine.paths.repositoryName)?.commits;
      view.details = {
        ...sessionIdentity(session),
        from: startedAt,
        ...optional("to", facts?.doneAt ?? session.runs.at(-1)?.endedAt),
        model: session.modelDisplayName,
        ...optional("effort", session.effort),
        worktree: displayPath(engine.worktreePath),
        branch: record.settings.featureBranch,
        ...optional("commitCount", stopped ? (prdStopped?.length ?? 0) : prdFacts?.commitCount),
        ...optional("latestCommit", stopped ? prdStopped?.[0]?.sha : prdFacts?.pushedSha),
        sessionId: session.sessionId,
        ...(multi ? { repositories: repositoryDetails(engine, facts!, stopped) } : {}),
      };
    }
    if (key !== undefined) Object.assign(view, waivedFacts(engine, key, view.state === "done"));
    return view;
  });

  if (recordedLeaves(plan).length > 0 && recordedLeaves(plan).every((leaf) => effectiveRecordedClosed(record, leaf)) && (record.phases[PR_PHASE_KEY]?.sessionIds.length || record.phases[PR_PHASE_KEY]?.stop || record.nextActivityKey === PR_PHASE_KEY && !engine.currentlyComplete || !deliveryEnabled(record) && (record.completionAudits?.policy === "legacy_complete" || record.completedAt))) {
    const facts = record.phases[PR_PHASE_KEY];
    const firstSession = engine.sessionRecord(PR_PHASE_KEY, facts?.sessionIds[0] ?? "");
    const startedAt = firstSession?.runs[0]?.startedAt;
    const row: PhaseView = { id: PR_PHASE_KEY, title: deliveryEnabled(record) ? "Finalize delivery" : PR_TITLE, file: "pull request session", state: "planned", finishedByPerson: facts?.finishedByPerson ?? false };
    if (engine.currentlyComplete) Object.assign(row, { state: "done", ...optional("doneAt", facts?.doneAt) });
    else if (facts?.stop) row.state = "needs_you";
    else if (facts?.wait) row.state = "waiting";
    else if (state === "implementing" && engine.current?.phaseKey === PR_PHASE_KEY) row.state = "implementing";
    else if (state === "paused") row.state = "next";
    if (startedAt) {
      row.sessionStartedAt = startedAt;
      if (includeTiming) row.timing = timingFor(engine, [PR_PHASE_KEY], startedAt, facts?.doneAt)!;
    }
    Object.assign(row, waivedFacts(engine, PR_PHASE_KEY, row.state === "done"));
    rows.push(row);
  }
  return rows;
}

/**
 * What Documents found shows beside the PRD (AC-START-04), read from the checkout once per
 * `kiln run`, after the start checks passed.
 */
export function documentsFound(
  prdDirectory: string,
  folderName: string,
  plan: PhasePlan,
  found: StartCheckReport["found"] & { repositories: StartCheckReport["repositories"] },
  repositoryName: string,
): DocumentsFound {
  const read = (name: string) => readFileSync(join(prdDirectory, name), "utf8");
  const prdFile = `${folderName}-prd.md`;
  const criteria = countPrdCriteria(read(prdFile));
  const leaves = leavesOf(plan);
  return {
    prd: { file: prdFile, criteriaCount: criteria.count, ...optional("firstLabel", criteria.firstLabel), ...optional("lastLabel", criteria.lastLabel) },
    design: { file: found.designFile!, criteriaCited: countDesignCitations(read(found.designFile!), criteria.labels) },
    assumptions: found.assumptionsFile ? { file: found.assumptionsFile, ...countAssumptions(read(found.assumptionsFile)) } : null,
    plan: {
      phaseDocCount: found.phaseDocCount,
      leafCount: leaves.length,
      closedCount: leaves.filter((leaf) => leaf.closed).length,
      phases: plan.phases.map((phase) => ({ id: phase.id, title: phase.title, ...optional("splitInto", phase.splitInto), closed: phase.closed, repositories: phase.repositories })),
    },
    // One row per document and target: two links from one document to one file (a section link) are one row.
    ...(found.unfollowedLinks?.length ? { unfollowedLinks: found.unfollowedLinks.filter((link, index, all) => all.findIndex(other => other.from === link.from && other.target === link.target) === index).map(link => ({ target: link.target, from: link.from, reason: link.reason })) } : {}),
    checks: [
      { name: "Every phase cites its criteria", passed: true },
      { name: "Dependencies point backward", passed: true },
      ...(found.repositories.length > 0
        ? [
            { name: `Named repositories found beside ${repositoryName}`, passed: true },
            { name: `Working tree of ${repositoryName} is clean`, passed: true },
          ]
        : [{ name: "Working tree is clean", passed: true }]),
    ],
  };
}

/** Each repository's commits and latest commit in a phase: what its Done recorded, or what Kiln read for its stop. */
function repositoryDetails(engine: Engine, facts: { repositories: Record<string, { startCommit: string; pushedSha?: string; commitCount?: number }> }, stopped: RepositoryCommits[] | undefined): RepositoryDetails[] {
  const rows: RepositoryDetails[] = [];
  for (const entry of engine.setUpRepositories) {
    const added = entry.kind === "added" && entry.addedInPhase !== undefined ? { addedInPhase: engine.judgedId(entry.addedInPhase) } : {};
    const base = { name: entry.name, ...added, worktree: displayPath(expandHome(entry.worktreePath)), branch: engine.record.settings.featureBranch };
    if (stopped) {
      const commits = stopped.find((repository) => repository.name === entry.name)?.commits ?? [];
      if (commits.length > 0) rows.push({ ...base, commitCount: commits.length, latestCommit: commits[0]!.sha });
      continue;
    }
    const repository = facts.repositories[entry.name];
    if (repository?.pushedSha === undefined || !repository.commitCount) continue;
    rows.push({ ...base, commitCount: repository.commitCount, latestCommit: repository.pushedSha });
  }
  return rows;
}

/** The PRD's repositories as rows: before Start the planned list with its bases and messages, after it the set-up entries. */
function repositoryRows(engine: Engine, state: FeatureState): RepositoryRow[] {
  const notStarted = state === "not_started";
  const { settings } = engine.record;
  const multi = engine.multiRepository;
  const repositories = notStarted ? engine.plannedRepositories : engine.setUpRepositories.map((entry) => ({ ...entry, entry }));
  return repositories.map((repository) => {
    const entry = repository.entry;
    const isPrd = repository.kind === "prd";
    const fixed = !notStarted || entry?.setupCompletedAt !== undefined || (engine.workspaceFixed && entry?.createdBranch !== undefined);
    const message = isPrd ? engine.currentFieldErrors.baseBranch : engine.baseErrors[repository.name];
    const choices = isPrd ? engine.baseBranches : engine.repositoryBaseBranches[repository.name];
    const worktreePath = entry?.setupCompletedAt !== undefined ? expandHome(entry.worktreePath) : isPrd && !multi ? engine.worktreePath : `${expandHome(settings.workspaceFolder)}/${repository.name}`;
    return {
      name: repository.name,
      github: `github.com/${repository.github}`.toLowerCase(),
      kind: repository.kind,
      ...(entry?.kind === "added" && entry.addedInPhase !== undefined ? { addedInPhase: engine.judgedId(entry.addedInPhase) } : {}),
      baseBranch: baseFor(repository, settings, engine.workspaceFixed),
      ...(notStarted && !fixed ? { ...optional("baseBranches", choices), ...optional("baseCheck", engine.baseCheck) } : {}),
      worktreePath: displayPath(worktreePath),
      fixed,
      fieldErrors: message === undefined ? {} : { baseBranch: message },
    };
  });
}

/** Labels actual tool invocations or observed remote activity, never a prepared intent. */
function observedDeliveryActivity(engine: Engine, session: SessionRecord, output?: SnapshotReads["output"]): NonNullable<NonNullable<Snapshot["current"]>["deliveryActivity"]> {
  const tool = (output ? output(session) : readOutputLines(engine.stateDirectory, session)).filter(line => line.source === "tool").at(-1);
  if (!tool) return { label: "Implementing" };
  let command = tool.text.replace(/^Bash /, "");
  let commands = simpleCommands(command);
  if (commands.length === 1 && ["/bin/zsh", "/bin/bash", "/bin/sh"].includes(commands[0]?.[0] ?? "") && ["-c", "-lc"].includes(commands[0]?.[1] ?? "") && commands[0]?.length === 3) { command = commands[0][2]!; commands = simpleCommands(command); }
  for (const checkpoint of engine.record.developmentDelivery?.checkpoints ?? []) {
    const where = { repository: checkpoint.target.repository, environment: checkpoint.target.environment };
    const polling = commands.some(words => words[0] === "gh" && words[1] === "run" && ["watch", "view", "list"].includes(words[2] ?? ""));
    if (checkpoint.observedActivity && (polling || Date.parse(checkpoint.observedActivity.at) > Date.parse(tool.at))) return { label: checkpoint.observedActivity.kind, ...where };
    if (commands.some(words => words[0] === "gh" && words[1] === "pr" && words[2] === "merge" && words.some(word => word.replace(/^github.com\//, "").toLowerCase() === checkpoint.target.repository.replace(/^github.com\//, "")) && words.includes(checkpoint.headSha))) return { label: "Merging", ...where };
    for (const requirement of checkpoint.requirements) if (requirement.match.kind === "command" && command === requirement.match.invocation.replaceAll("{{mergeRevision}}", checkpoint.merge?.resultSha ?? "{{mergeRevision}}").replaceAll("{{environment}}", checkpoint.target.environment)) return { label: requirement.purpose === "deployment" ? "Deploying" : requirement.purpose === "verification" ? "Verifying" : "Implementing", ...where };
  }
  return { label: "Implementing" };
}

function sessionSteps(engine: Engine, key: string, session: SessionRecord): StepView[] {
  const audit = engine.auditActivity(key);
  if (!audit) return stepStates(session.steps, session.agentId);
  return [
    ...(audit.skill && session.lastSkill?.name.endsWith(audit.skill.name) ? [{ name: "Assessment", state: "observed" as const, startedAt: session.lastSkill.at }] : []),
    ...session.steps.filter(s => s.name === "Commit" || s.name === "Push").map(s => ({ ...s, state: "observed" as const })),
    ...(audit.acceptedResult ? [{ name: "Audit result recorded", state: "observed" as const }] : []),
  ];
}

function activityViews(engine: Engine, state: FeatureState, phases: PhaseView[], includeTiming: boolean, inspectionStore?: Pick<AuditStore, "read">): PhaseView[] {
  const { record } = engine;
  const rows: PhaseView[] = [];
  const started = new Set<string>();
  for (const activity of activityHistory(record, engine.stateDirectory)) {
    if (activity.kind === "implementation" || activity.kind === "final_delivery") {
      const parent = phases.find(r => r.id === activity.key && r.state === "split");
      if (parent && !started.has(parent.id)) { rows.push(parent); started.add(parent.id); }
      const row = phases.find(r => r.id === engine.judgedId(activity.key));
      if (row && !started.has(row.id)) { rows.push({ ...row, activityId: activity.activityId, kind: activity.kind }); started.add(row.id); }
      continue;
    }
    const audit = engine.auditActivity(activity.key)!;
    const facts = record.phases[activity.key]; const session = engine.latestSession(activity.key);
    const row: PhaseView = { id: activity.key, activityId: activity.activityId, kind: audit.kind, title: auditLabel(audit.kind), file: `Round ${audit.round}${audit.continuationIndex > 1 ? ` · Continuation ${audit.continuationIndex}` : ""}`, round: audit.round, continuationIndex: audit.continuationIndex, state: facts?.stop ? "needs_you" : facts?.wait ? "waiting" : facts?.doneAt ? "done" : state === "paused" ? "next" : "implementing", finishedByPerson: facts?.finishedByPerson ?? false, ...optional("doneAt", facts?.doneAt) };
    if (session) {
      const first = facts?.sessionIds[0] ? engine.sessionRecord(activity.key, facts.sessionIds[0]) : undefined;
      const from = first?.runs[0]?.startedAt;
      row.outputLineCount = engine.outputLines(session).length;
      if (from) {
        row.sessionStartedAt = from; if (includeTiming) row.timing = timingFor(engine, [activity.key], from, facts?.doneAt)!;
        row.details = { ...sessionIdentity(session), from, ...optional("to", facts?.doneAt ?? session.runs.at(-1)?.endedAt), model: session.modelDisplayName, ...optional("effort", session.effort), worktree: displayPath(engine.worktreePath), branch: record.settings.featureBranch, sessionId: session.sessionId, ...optional("commitCount", facts?.repositories[engine.paths.repositoryName]?.commitCount), ...optional("latestCommit", facts?.repositories[engine.paths.repositoryName]?.pushedSha) };
      }
    }
    let waivedResult: AuditWaiverResult | undefined;
    try {
      const store = inspectionStore ?? new AuditStore(engine.stateDirectory);
      waivedResult = audit.waivedResult ? store.read<AuditWaiverResult>(audit.waivedResult) : undefined;
      const accepted = acceptedAudit(engine.stateDirectory, audit, store);
      const attempt = accepted?.result ?? (audit.attempts.at(-1) ? store.read<import("../audit/contracts.js").AuditResult>(audit.attempts.at(-1)!) : undefined);
      const report = accepted?.report ?? (!attempt?.refusal && attempt?.reportBytes ? JSON.parse(attempt.reportBytes) as import("../audit/contracts.js").AuditReport : undefined);
      const snapshot = audit.snapshots.at(-1) ? store.read<WorkSnapshot>(audit.snapshots.at(-1)!) : undefined;
      const checks = (facts?.stop?.checks ?? attempt?.checks ?? []).filter(check => check.name !== "Stayed in the workspace").map(check => auditCheckTitle(activity.key, check));
      const repositories = snapshot?.repositories.map(r => ({ name: r.repository, revision: r.head })) ?? [];
      if (report?.schemaVersion === 2) {
        row.audit = { outcome: report.outcome, summary: report.summary, checks, criteria: [], repositories, blockers: report.needsYou.map(item => `${item.problem} ${item.action}`), pendingActions: [] };
        if (report.outcome === "passed" && accepted && facts?.doneAt) row.audit.remainingAfterDeliveryActions = report.afterDeliveryActions ?? [];
      } else {
        // A version-1 result keeps its history: criteria, findings, blockers and human actions.
        row.audit = { ...optional("outcome", report?.outcome), checks, criteria: report?.criteria.map(c => ({ key: c.criterionKey, status: c.deliveryStatus ?? (c.testAssessment && "grade" in c.testAssessment ? c.testAssessment.grade : c.testAssessment?.status) ?? "unresolved", findings: c.findings.map(f => f.missing) })) ?? [], repositories, blockers: report?.blockers.map(b => `${b.problem} ${b.requiredAction}`) ?? [], pendingActions: report?.pendingHumanActions.map(a => a.action) ?? [] };
        if (report?.outcome === "passed" && accepted && facts?.doneAt) row.audit.remainingAfterDeliveryActions = report.pendingHumanActions.filter(action => action.beyondDelivery && !action.result).map(action => action.action);
      }
    } catch (error) { if (inspectionStore) throw error; row.audit = { checks: [{ name: "Audit evidence", passed: false, facts: [(error as Error).message] }], criteria: [], repositories: [], blockers: [(error as Error).message], pendingActions: [] }; }
    Object.assign(row, waivedFacts(engine, activity.key, row.state === "done", waivedResult));
    // A waived audit's checks are its waived completion's, never the refused attempt's (AC-WAIVE-10).
    if (row.audit && row.waivedCompletion) row.audit.checks = row.waivedCompletion.checks;
    rows.push(row); started.add(row.id);
  }
  // Closed-at-start phases have no activity history; show their preserved history before audits.
  const historical = phases.filter(r => !started.has(r.id) && (r.state === "done" || r.state === "split"));
  const pending = phases.filter(r => !started.has(r.id) && r.state !== "done" && r.state !== "split");
  return [...historical, ...rows, ...pending];
}

/** "Phase 3", "Final delivery" or "Delivery audit": an activity's name in a sentence. */
function activityName(engine: Engine, key: string): string {
  if (key === PR_PHASE_KEY) return "Final delivery";
  const audit = key.startsWith("audit-") ? engine.auditActivity(key) : undefined;
  if (audit) return auditLabel(audit.kind);
  return `Phase ${judgedKeyFor(engine.record.plan ?? [], key)}`;
}

function waiverView(engine: Engine, waiver: Waiver): WaiverView {
  return { id: waiver.waiverId, at: waiver.at, activityKey: waiver.activityKey, activity: activityName(engine, waiver.activityKey), effect: waiver.effect, source: waiver.source, checkRun: waiver.checkRun, items: waiver.items };
}

/**
 * A waiver's saved check run as it read once the waiver applied: the rerun's rows, cloned, with
 * the coverage rule run over the waivers up to and including this one, so its own items read
 * Waived and carried ones keep the tag they had (AC-WAIVE-10).
 */
function markedBy(waivers: readonly Waiver[], waiver: Waiver): CheckResult[] {
  const index = waivers.indexOf(waiver);
  return applyWaivers(waivers.slice(0, index + 1), structuredClone(waiver.checks));
}

/**
 * What an activity shows of waivers (AC-WAIVE-04, AC-WAIVE-10, AC-WAIVE-12): its waived
 * completion's check list, read from its own waiver's `checks`, otherwise its `completionChecks`;
 * a `continued` waiver on it once complete counts on it too, while a Continue in normal order
 * waiver, saved before the activity completed, adds no count. An audit completed at once under a
 * readiness waiver shows the carried readiness row from the originating waiver.
 */
function waivedFacts(engine: Engine, key: string, done: boolean, waivedResult?: AuditWaiverResult): Partial<PhaseView> {
  const { record } = engine;
  const facts = record.phases[key];
  const all = record.waivers ?? [];
  const own = facts?.waiverId ? all.find(waiver => waiver.waiverId === facts.waiverId) : undefined;
  const counting = all.filter(waiver => waiver.activityKey === key && (waiver.effect === "completed" || (facts?.doneAt !== undefined && Date.parse(facts.doneAt) <= Date.parse(waiver.at))));
  if (own && !counting.includes(own)) counting.unshift(own);
  const lists: CheckResult[][] = [];
  if (own) lists.push(markedBy(all, own));
  else if (facts?.completionChecks?.length) lists.push(facts.completionChecks);
  const origin = !own && waivedResult ? all.find(waiver => waiver.waiverId === waivedResult.waiverId && waiver.activityKey !== key) : undefined;
  if (origin) lists.push(markedBy(all, origin).filter(check => KNOWN_PROBLEM_CHECKS.includes(check.name) && check.waived));
  for (const waiver of counting) if (waiver !== own) lists.push(markedBy(all, waiver));
  const merged: CheckResult[] = [];
  for (const list of lists) for (const check of list) {
    const at = merged.findIndex(one => one.name === check.name);
    if (at === -1) merged.push(check); else if (check.waived || !check.passed) merged[at] = check;
  }
  const waived = merged.filter(check => check.passed && check.waived).length;
  const warnings: NonNullable<PhaseView["warnings"]> = [];
  if (facts?.waiverWarning?.kind === "plan") warnings.push({ kind: "plan_problem_waived", text: PLAN_WARNING });
  if (facts?.waiverWarning?.kind === "audit") warnings.push({ kind: "audit_problem_waived", text: AUDIT_WARNING });
  if (waivedResult?.report === "none" || own?.audit?.report === "none") warnings.push({ kind: "no_audit_report", text: NO_REPORT_WARNING });
  const views = [...counting, ...(origin ? [origin] : [])].map(waiver => waiverView(engine, waiver));
  return {
    ...(done && waived > 0 ? { waivedChecks: waived, waivedCompletion: { checks: merged, counts: checkCounts(merged) } } : {}),
    ...(views.length ? { waivers: views } : {}),
    ...(warnings.length ? { warnings } : {}),
    ...(facts?.skippedByWaiver && !done ? { skippedByWaiver: true as const } : {}),
  };
}
