import type { PhaseRecoveryView } from "./phase-recovery.js";
import type { ReopenCheck } from "./reopen-check.js";
import { lastRecordedRun, launchFailure, type LaunchFailure, type WorkRead } from "./stopped-phase.js";
import { runLastOutputAt } from "../session/claude-session.js";
import { codexBillingView } from "../billing/codex.js";
import type { BillingView } from "../billing/authority.js";
import { RESULT_CHECK } from "../audit/admission.js";
import { activityHistory, auditLabel, acceptedAudit } from "../audit/workflow.js";
import { AuditStore } from "../audit/storage.js";
import { personItems, settledLines } from "../audit/person-items.js";
import type { WorkSnapshot } from "../audit/contracts.js";
import { simpleCommands } from "../session/bash-command.js";
import { DELIVERY_CHECK, deliveryEnabled, finishedBy } from "./development-delivery.js";
import { sameOwner, type DevelopmentSettings } from "../state/development-delivery.js";
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
import { leavesOf, type PhasePlan, type PlannedPhase } from "../plan/phase-plan.js";
import { auditRecoveryPrompt, codexSessionPrompt, freshSessionPrompt, pullRequestSessionPrompt, resumePrompt } from "../session/prompts.js";
import { readOutputLines } from "../session/claude-session.js";
import { runTiming, type Timing } from "../session/timing.js";
import { stepStates, type OutputLine } from "../session/session-output.js";
import { automaticResumeSchedule, blockingRow, limitRow } from "../session/usage-limit.js";
import type { StartCheckReport } from "../start-checks.js";
import { applyWaivers, AUDIT_WARNING, checkCounts, effectiveRecordedClosed, KNOWN_PROBLEM_CHECKS, NO_REPORT_WARNING, PLAN_WARNING, type AuditWaiverResult, type MarkCompleteOffer, type WaivedItem, type Waiver, type WaiverSource } from "./waivers.js";
import { activityLoops, auditLoopsView } from "./loop-view.js";
import { closingAudits, LOOP_STOP_LINE } from "../state/audit-loops.js";
import { PR_PHASE_KEY, type CheckRun, type CheckResult, type PrdRecord, type Effort, type PullRequestFacts, type MergedBranchFacts, type DeliveryHistory, type RecordedPlanPhase, type RepositoryKind, type SessionRecord, type StopKind, type StopLimit } from "../state/records.js";
import type { Engine, RepositoryCommits } from "./engine.js";
import type { ExecutionSummary } from "./continuation-state.js";
import { judgedPhase, recordedLeaves } from "./plan-reading.js";
import { baseFor, displayPath, expandHome, type FieldErrors } from "./worktree-setup.js";
import { labelAmong } from "./repository-labels.js";
import type { Question } from "./repository-finding.js";
import type { SavedQuestion } from "../state/records.js";
import { questionLabel } from "./plan-repositories.js";
import { noticeLines } from "./compatibility-notices.js";
import type { CatchUpOffer, StartPreview } from "./start-from.js";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { isPhaseKey, isPreflightKey } from "../state/activity-keys.js";
import { keyOf as preflightKeyOf, preflightFound, preflightSettled, PREFLIGHT_TITLE, type PreflightOutcome } from "./preflight.js";

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
  /** Absent only on a page a reset built, when the start checks could not read it (run restart AC-RESET-04). */
  design?: { file: string; criteriaCited: number };
  assumptions: { file: string; total: number; notYetConfirmed: number } | null;
  /** Absent only on a page a reset built, when the plan could not be read (run restart AC-RESET-04). */
  plan?: {
    phaseDocCount: number;
    leafCount: number;
    closedCount: number;
    /**
     * `repositories`: the names on each document's `**Repositories:**` line (multi-repo AC-REPO-03);
     * `attended` and `earlyMerge`: its `**Attended:**` and `**Early merge:**` lines' text (build preflight AC-ATTEND-01, AC-ATTEND-05).
     */
    phases: { id: string; title: string; splitInto?: string[]; closed: boolean; repositories: string[]; attended?: string; earlyMerge?: string }[];
  };
  /** Links in the requirements Kiln won't follow, when there are any: neither a passed nor a failed check (Kiln Linked Documents AC-LINK-04). */
  unfollowedLinks?: { target: string; from: string; reason: string }[];
  /** A failed row, on a page a reset built, names the check in `kiln run`'s words (run restart AC-RESET-04). */
  /** `locate`: the unpassed "<n> repository to locate", which a question answers rather than a fix (find repositories anywhere AC-SEE-01). */
  checks: { name: string; passed: boolean; text?: string; locate?: true }[];
  /** On a page a reset built: a start check failed, so Start is unavailable until a reload finds them all passing. */
  checksFailed?: true;
  /** Where Kiln starts from (run restart AC-FROM-01 to 05, AC-CURRENT-01); absent until the first preview finishes. */
  start?: StartView;
}

/** Documents found's Start from, for the chosen starting point (run restart "Interfaces", Snapshot). */
export interface StartView {
  from: "new" | "existing";
  bringUpToDate: boolean;
  previewId: string;
  /** Every name, available or not; the selected name's message is `settings.fieldErrors.featureBranch`. */
  branches: { name: string; available: boolean }[];
  /** Where the plan is read: the start commit. */
  planSource?: { kind: "base" | "branch" | "base_after_catch_up"; branch: string; sha: string };
  repositories: { name: string; hasBranch: boolean; pullRequest?: { number: number; url: string } | { unknown: string }; worktree?: { path: string; adopted: boolean; uncommittedFiles?: number } }[];
  /** Several repositories with existing worktrees: the one folder holding them, fixed. */
  workspaceFolder?: string;
  closedCount: number;
  startAt?: { id: string; title: string };
  catchUp?: CatchUpOffer;
}

export interface PhaseView {
  activityId?: string;
  kind?: "implementation" | "delivery_audit" | "test_audit" | "final_delivery" | "preflight";
  /** A Preflight row (build preflight "Interfaces"). */
  preflight?: {
    /** Absent when no report has been read: running, or marked complete before a session reported. */
    outcome?: PreflightOutcome;
    /** "Nothing to settle" | "Ended without a report". */
    found?: string;
    /** Why a no_report preflight launched no session for its last attempt. */
    reason?: string;
  };
  round?: number;
  continuationIndex?: number;
  audit?: { outcome?: string; summary?: string; checks: CheckResult[]; criteria: { key: string; status: string; findings: string[] }[]; repositories: { name: string; label?: string; revision: string }[]; blockers: string[]; pendingActions: string[];
    /** Items an accepted audit left for a person while Kiln carried on, and whether any is still waiting (AC-NEUTRAL-03). */
    personItems?: { count: number; waiting: boolean };
    /** Items this audit settled, each as "<problem> Listed by <audit>, settled by <audit>: <how>". */
    settledItems?: string[] };
  outputLineCount?: number;
  id: string;
  title: string;
  file: string;
  state: "planned" | "next" | "implementing" | "needs_you" | "waiting" | "done" | "split";
  splitInto?: string[];
  /** The phase document's `**Attended:**` text, closed or not (build preflight AC-ATTEND-01): the Needs you there marker. */
  attended?: string;
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
  /** The loop this audit activity is, with the limit in force (Kiln Deliver When Audit Loops Run Out AC-STOP-05). */
  loops?: import("./loop-view.js").ActivityLoopView[];
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
  /** What it is shown by (find repositories anywhere AC-FOLDER-02). */
  label?: string;
  /** The judged leaf it was added in, for an added repository. */
  addedInPhase?: string;
  worktree: string;
  branch: string;
  commitCount: number;
  latestCommit: string;
}

/**
 * What Documents found asks about a repository (find repositories anywhere AC-ASK-01, AC-ASK-02;
 * technical design, "Snapshot"). Folders are shown under `~/`.
 */
export interface QuestionView {
  kind: "where" | "which";
  /** The address path, as the plan writes it. */
  repository: string;
  label: string;
  searchedFrom: string;
  searchedTo?: string;
  checkouts: { folder: string; remote: string; pickable: boolean; remembered?: true }[];
  /** How many checkouts the search itself found. */
  found: number;
  /** Change, when the search found nothing: the remembered folder, already in the field. */
  field?: string;
  fieldError?: string;
}

/** One of the PRD's repositories, as Documents found and the settings list them (multi-repo AC-REPO-03, AC-PRS-04). */
export interface RepositoryRow {
  github?: string;
  /** Kiln's name for it: the key `bases` takes. */
  name: string;
  /** What it is shown by: its short name, or its address path while another of the PRD's repositories shares the short name (AC-FOLDER-02). */
  label: string;
  /** Its address path, as its origin spells it, or as the plan writes it while the row asks (AC-SEE-01). */
  addressPath: string;
  /** Its own checkout's folder; absent while the row asks. */
  checkoutFolder?: string;
  /** How its checkout was found, before Start only: `answer` offers Change (AC-ASK-05). */
  located?: "beside" | "search" | "answer";
  /** The row's question, while Kiln can't tell where its checkout is (AC-ASK-01). */
  question?: QuestionView;
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
  /** A preflight the next Start, Continue or Resume would run, or one due and not yet allocated (build preflight "Interfaces"). */
  preflight?: { planned?: { before: string } };
  /** The audit loop settings, counts and, at a loop stop, its page (Kiln Audit Loop Limits). */
  auditLoops?: import("./loop-view.js").AuditLoopsView;
  /** The items for a person at a Needs you stop on an audit, and at the hold stop (Kiln Deliver When Audit Loops Run Out AC-ITEM-02). */
  items?: import("./engine.js").PersonItemView[];
  /**
   * On a finished run (AC-LEFT-02, AC-ITEM-03): each kind's loops used and limit in force, **For you**
   * in the order it is listed with each line word for word, and each pull request's address.
   */
  delivered?: { loops: import("../state/audit-loops.js").ClosingAudits; forYou: import("../audit/for-you.js").ForYou; pullRequests: { repository: string; number: number; url: string }[] };
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
    /** When the PRD total starts, when it counts earlier executions too (time totals AC-TOTAL-02); otherwise `startedAt`. */
    timingSince?: string;
    stoppedAt?: string;
  };
  documents?: DocumentsFound & { starting?: true; startError?: string };
  /** Started PRDs only: present means the reset line shows (run restart "Availability"). */
  reset?: { available: boolean; reason?: string };
  settings: {
    developmentDeployments?: DevelopmentSettings;
    /** The reason under Start while a repository row asks (find repositories anywhere "Asking Before Start"). */
    startBlockedBy?: string;
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
    /** Each question the stop asks about where a repository is (find repositories anywhere AC-ASK-07); the plan stop's carry `phaseFile`. */
    locate?: (QuestionView & { phaseFile?: string })[];
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
    /** Set once a finished check since the stop ran the completion checks; until then the rows read Why Kiln stopped (AC-STOPCHECK-01, 03). */
    rowsAreCompletionChecks?: true;
    /** Check again at this stop runs the activity's completion checks (AC-STOPCHECK-02). */
    recheckRunsAll?: true;
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
    /** A stopped phase's case (run restart AC-CASE-01); absent on every other page, a held one included. */
    case?: "could_not_start" | "built_nothing" | "needs_input";
    /** The phase's work (AC-CASE-01); absent until the first read finishes. A held page whose conversation can't be reopened has it too. */
    work?: WorkRead;
    /** How long the latest conversation ran (AC-CASE-01's duration line). */
    conversationRanMs?: number;
    /** What Kiln found: the latest launch has a run and never began a conversation (AC-CASE-04). */
    launchFailure?: LaunchFailure;
    /** The earlier conversation's last message, shown after What Kiln found (AC-CASE-04). */
    conversationMessage?: { finalMessage?: string; lastLines?: OutputLine[]; endedAt: string };
    /** The phase built nothing and its checks haven't run since it stopped (AC-CASE-03). */
    nothingToCheck?: true;
    /** Whether the latest conversation can be reopened (AC-CARRY-01, AC-CARRY-02). */
    reopen?: ReopenCheck;
    /** Send reply & continue (AC-CARRY-05, AC-CARRY-06); `endsHold` on a held page. */
    carryOn?: { available: boolean; reason?: string; endsHold?: "takeover" | "message" };
    /** Start Phase N again (AC-CASE-02). */
    startAgain?: { available: boolean; reason?: string };
    /** Bring the branch up to date first (run restart AC-CURRENT-01): read with work; absent until the first read finishes, when it fails, or when nothing qualifies. */
    catchUp?: CatchUpOffer;
    /** The stopped session hit a usage limit (usage-limit recovery AC-LIMIT-01 to 03); `refusedAgainAt` when Kiln's own resume was refused again (AC-AUTO-05). */
    limit?: LimitView & { refusedAgainAt?: string };
    /**
     * Only Kiln's record stops a finished phase (AC-WAIVE-02 in Kiln Completion Waivers): a Kiln session finished it,
     * the phase's own or, `finishedBy`, a split ancestor's that built it, and its one failing item is the assessment.
     */
    bookkeeping?: { finishedBy: string };
    /** The stopped phase's `**Attended:**` text (build preflight AC-ATTEND-03): the planned-as-needing-you card. */
    attended?: string;
    /** A preflight stop's headline, its items in the session's order and the activity it came before (build preflight "Display Contract"). */
    preflight?: { headline: string; items: string[]; nextActivity: { kind: "phase" | "audit" | "final_delivery"; key?: string; title: string }; line: string };
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
  pullRequests?: (PullRequestFacts & { label?: string })[];
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
      ...(record.completedPlanCheck ? { check: labelledPlanCheck(engine, record.completedPlanCheck) } : {}),
      ...(record.planReconciliation?.handback ? { handback: record.planReconciliation.handback } : {}),
      ...(record.planReconciliation?.check?.status === "failed" ? { planCheck: { status: "failed" as const, attemptedAt: record.planReconciliation.check.attemptedAt, problem: record.planReconciliation.check.problem! } } : {}),
    } } : {}),
    activities: activityViews(engine, state, views, includeTiming, reads.auditStore),
    ...preflightPlanned(engine, state, documents),
    auditLoops: auditLoopsView(engine),
    ...personItemFields(engine, reads.auditStore),
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
      // Delivery can reopen a completed PRD and leave completedAt set; its totals keep counting until it is complete again (time totals AC-TOTAL-03).
      ...(includeTiming ? prdTimingFields(prdTiming(engine, timingFor(engine, Object.keys(record.phases), record.startedAt, state === "complete" ? record.completedAt : undefined)), record.startedAt) : {}),
      ...optional("stoppedAt", needsYou?.stoppedAt),
    },
    ...optional("liveControl", engine.liveView()),
    ...(engine.record.compatibility?.length ? { compatibility: noticeLines(engine.record) } : {}),
    ...(stoppedKey !== undefined || deliveryEnabled(record) ? { developmentDelivery: engine.deliveryStatus() } : {}),
    settings: {
      ...optional("developmentDeployments", settings.developmentDeployments),
      ...(state === "not_started" ? optional("startBlockedBy", engine.startBlockedBy) : {}),
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
    ...optional("pullRequests", record.pullRequests?.map((pull) => ({ ...pull, label: engine.labelOf(pull.repository) }))),
    ...optional("mergedBranches", record.mergedBranches),
    ...optional("deliveryHistory", record.deliveryHistory),
    deliveryHistoryPending: engine.deliveryHistoryPending,
    ...optional("deliveryHistoryError", engine.deliveryHistoryError),
    ...optional("current", current),
    ...optional("needsYou", needsYou),
    ...optional("waiting", waiting),
    ...(folderMissing ? { folderMissing: folderMissingSnapshot(folderMissing, engine) } : {}),
    // Every screen of a started PRD ends with the reset line (run restart AC-RESET-01).
    ...(record.startedAt !== undefined ? { reset: engine.resetControl() } : {}),
  };
  if (state === "not_started" && documents) {
    const preview = engine.startPreview;
    // With an existing branch, What Kiln found is read from Git at the start commit (run restart AC-FROM-02).
    const fromGit = preview?.from === "existing" && preview.documents && preview.plan && preview.plan.problems.length === 0 ? gitDocumentsFound(preview, engine) : undefined;
    // A start check that failed on a page a reset built stays named, and holds Start, whichever documents show (AC-RESET-04).
    // On a page a reset built, its start checks decide the check rows: a clean tree it didn't find isn't shown as passed.
    const cleanRow = (name: string) => name.startsWith("Working tree");
    const resetRows = engine.resetStart ? (fromGit?.checks ?? []).filter(check => !cleanRow(check.name) || documents.checks.some(row => row.passed && row.name === check.name)) : fromGit?.checks;
    const found = fromGit ? { ...fromGit, checks: [...resetRows!, ...documents.checks.filter(check => !check.passed)], ...(documents.checksFailed ? { checksFailed: true as const } : {}) } : documents;
    // The page says where the plan was read only over documents read there (AC-FROM-02): the start commit's, or a base the checkout matches.
    const readAtStart = preview?.from === "existing" ? fromGit !== undefined : preview !== undefined && engine.baseDocumentsMatched === preview.previewId;
    snapshot.documents = { ...withRepositoriesCheck(found, engine), ...(preview ? { start: startView(engine, preview, readAtStart) } : {}), ...(engine.settingUp ? { starting: true as const } : {}), ...optional("startError", engine.startError) };
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

/** A plan phase as Documents found lists it. */
/**
 * The repositories' passed check as the named rows stand now: "Repositories found on this
 * computer", or, while a row asks, the unpassed "<n> repository to locate" (AC-SEE-01). Each
 * phase's repositories are shown by label (AC-FOLDER-02).
 */
function withRepositoriesCheck(found: DocumentsFound, engine: Engine): DocumentsFound {
  const asking = engine.locatingRepositories.length;
  // While a start check fails on a page a reset built, Kiln says nothing about a repository it would ask about (AC-ASK-01).
  const held = asking > 0 && engine.resetCheckFailing;
  const named = (name: string) => name === REPOSITORIES_FOUND || / repositor(y|ies) to locate$/.test(name);
  // A named repository Kiln couldn't find or check since kiln run started is a failed check, in the terminal's words.
  const problems = engine.record.startedAt === undefined ? engine.repositoryProblems : [];
  const checks = found.checks.flatMap((check) => {
    if (!check.passed || !named(check.name)) return [check];
    if (problems.length > 0) return problems.map((problem) => ({ name: problem, passed: false, text: problem }));
    if (held) return [];
    return [asking === 0 ? { name: REPOSITORIES_FOUND, passed: true } : { name: `${asking} ${asking === 1 ? "repository" : "repositories"} to locate`, passed: true, locate: true as const }];
  });
  const plan = found.plan ? { ...found.plan, phases: found.plan.phases.map((phase) => ({ ...phase, repositories: phase.repositories.map((name) => engine.labelOf(name)) })) } : undefined;
  return { ...found, checks, ...(plan ? { plan } : {}), ...(problems.length > 0 ? { checksFailed: true as const } : {}) };
}

/** The passed check once every named repository is found (find repositories anywhere AC-SEE-01). */
export const REPOSITORIES_FOUND = "Repositories found on this computer";

function documentsPhase(phase: PlannedPhase): NonNullable<DocumentsFound["plan"]>["phases"][number] {
  return { id: phase.id, title: phase.title, ...optional("splitInto", phase.splitInto), closed: phase.closed, repositories: phase.repositories, ...optional("attended", phase.attended), ...optional("earlyMerge", phase.earlyMerge) };
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
    return { phaseId: current.phaseKey, model: selectedChoice(settings).model, effort: selectedChoice(settings).effort ?? "", steps: engine.auditActivity(current.phaseKey) || isPreflightKey(current.phaseKey) ? [] : stepStates([], settings.agentId), repositories: [] };
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
    repositories: labelled(engine, current.commits),
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
  const stop = hold ? { kind: "billing" as const, at: hold.at, checkedAt: hold.run?.at ?? hold.at, ...optional("run", hold.run), ...optional("rowsAreCompletionChecks", hold.rowsAreCompletionChecks), checks: holdRows.some(check => check.name === "Billing approval") ? holdRows : [...holdRows, { name: "Billing approval", passed: false, facts: [hold.reason, ...hold.observed.sources] }], ...(retainedStop?.limit ? { limit: retainedStop.limit } : {}) } : retainedStop!;
  const phaseRecovery = engine.phaseRecoveryView();
  const plan = record.plan ?? [];
  const isPr = phaseKey === PR_PHASE_KEY;
  const judged = judgedKeyFor(plan, phaseKey);
  // A loop stop saved by Kiln 1.3.0 shows its one line, never a stored check, so it is never waivable; Check again clears it ("Upgrade").
  const loopStop = !hold && stop.kind === "loop_limit";
  const checks = [...(loopStop ? [{ name: "Audit loop limit", passed: false, reason: true as const, facts: [LOOP_STOP_LINE] }] : []), ...(phaseRecovery ? retainedStop?.checks ?? [] : loopStop ? [] : stop.checks)].map(check => auditCheckTitle(phaseKey, check));
  const checkRun = phaseRecovery ? retainedStop?.run : stop.run;
  const bookkeeping = !hold && !phaseRecovery && stop.kind === "done_check" ? bookkeepingStop(record, judged, checks) : undefined;
  const base = {
    phaseId: judged,
    kind: stop.kind,
    checks,
    counts: checkCounts(checks),
    ...optional("checkRun", checkRun),
    ...((phaseRecovery ? retainedStop?.rowsAreCompletionChecks : stop.rowsAreCompletionChecks) ? { rowsAreCompletionChecks: true as const } : {}),
    ...(engine.recheckRunsCompletion(phaseKey) ? { recheckRunsAll: true as const } : {}),
    markComplete: engine.markCompleteOffer(),
    ...(phaseRecovery ? { phaseRecovery, ...optional("checkedAt", retainedStop?.checkedAt) } : { checkedAt: stop.checkedAt }),
    ...(engine.checking ? { checking: true as const } : {}),
    resumeOffered: engine.resumeOffered(phaseKey),
    ...optional("limit", stop.limit === undefined ? undefined : { ...limitView(engine, phaseKey, stop.limit, false), ...optional("refusedAgainAt", stop.limit.refusedAgainAt) }),
    // A bookkeeping stop has no session to restart or carry on: the work is done.
    ...(bookkeeping ? { bookkeeping } : restartFacts(engine, phaseKey, checkRun)),
    ...preflightStopFacts(engine, phaseKey),
    // Only a phase carries the line; an audit, preflight or final delivery stop never shows the card.
    ...optional("attended", isPhaseKey(phaseKey) ? plan.find(phase => phase.id === judged)?.attended : undefined),
    ...optional("locate", locateView(engine, retainedStop?.locate ?? hold?.locate)),
  };
  const session = stop.kind === "plan" || stop.kind === "selection" ? undefined : sessionFor(engine, phaseKey);
  // Resume, reply and the terminal command read the latest conversation, or the latest launch when none began (run restart "A session record with no run").
  const recovery = session ? engine.recoverySession(phaseKey) ?? session : undefined;
  // The folder the session started in; with no session, the one the phase's next session would start in (AC-SPACE-04).
  const folder = session ? engine.workingDirectoryOf(session) : engine.sessionFolder;
  const auditTask = engine.auditRecoveryTask(phaseKey, folder);
  const preflight = engine.preflightActivity(phaseKey);
  const originalPrompts = (ran: boolean) =>
      preflight ? engine.preflightPrompt(preflight, folder) :
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
            deliveryBlock: engine.deliveryBlockNow(),
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
    repositories: labelled(engine, engine.stoppedCommits?.phaseKey === phaseKey ? engine.stoppedCommits.commits : []),
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
    // The run before the failed resume ended on its own unless Kiln was resuming an interruption, or one was recorded.
    const endedOnItsOwn = run?.cause !== "resume" && interrupted?.interruptedAt === undefined;
    const messageRun = endedOnItsOwn && engine.stoppedPhase() === phaseKey ? lastRecordedRun(session) : undefined;
    const finalMessage = messageRun?.result?.text;
    return {
      ...base,
      ...sessionFacts,
      stoppedAt,
      ...(lastOutput ? { stoppedAtIsLastOutput: true as const } : {}),
      ...(pressedResume ? { pressedResume: true as const } : {}),
      // A stopped phase's first card gives the latest launch's last recorded final message (AC-CASE-04),
      // apart from a resume after an interruption, which keeps the interrupted run's last lines (Kiln v1 AC-KEEP-05).
      ...(finalMessage === undefined ? { lastLines: lines.slice(-10) } : { finalMessage }),
      freshSessionPrompt: prompts(true),
      freshSessionCommand,
      outputLineCount: lines.length,
      sessionEndedAt: endedAt,
      steps: sessionSteps(engine, phaseKey, session),
    };
  }
  // An interrupted session Kiln stopped instead of resuming shows when it was interrupted and its last lines (AC-OUTSIDE-04).
  const interrupted = stop.interrupted;
  // A stopped phase's first card gives the latest launch's last recorded final message, the one the
  // carry-on prompt carries, so a resume that couldn't spawn still shows it (AC-CASE-04).
  const messageRun = engine.stoppedPhase() === phaseKey ? lastRecordedRun(session) : run;
  const finalMessage = interrupted === undefined && messageRun?.result?.text?.trim() ? messageRun.result.text : undefined;
  // `claude --resume` needs the conversation the reopen check finds available (OUT-003; run restart AC-CARRY-01).
  const resumable = recovery!.runs.some(candidate => candidate.pid !== undefined) && engine.reopenCheck(phaseKey).state === "available" && (!record.liveControl || record.liveControl.takeover.state === "released" || record.liveControl.takeover.kind !== "delivery_recovery" && record.liveControl.takeover.releasedAt !== undefined);
  // A held Pause now keeps its command from the release on, whatever later readings find (Kiln Pause Now, "The Paused Page").
  const resumeFolder = engine.workingDirectoryOf(recovery!);
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
      resumeCommand: recovery!.agentId === "codex" ? codexResumeCommand(resumeFolder, recovery!) : record.liveControl ? resumeCommand(resumeFolder, recovery!.sessionId, process.platform, true) : resumeCommand(resumeFolder, recovery!.sessionId),
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
 * A stopped phase's restart facts (run restart "A Stopped Phase's Facts"): its case, work, the
 * latest conversation's running time, What Kiln found, Nothing to check yet, the reopen check and
 * the two session-starting buttons. A held page whose conversation can't be reopened gets only
 * its work, the reopen check and the carry-on button (AC-CARRY-06).
 */
/**
 * A done-check stop on a phase a Kiln session finished, its check passing then, whose only failing item asks for a
 * current assessment of the phase's own: the shared documents changed after the finish and no session is left to
 * assess them again, so only Kiln's record is out of date. Not when a person or a waiver finished it, when it never
 * had an assessment, or when it had a binding, which only a change to its own phase document ends; a material change to
 * a closed phase's document stops Kiln as a plan problem before this check.
 */
function bookkeepingStop(record: PrdRecord, phaseId: string, checks: CheckResult[]): { finishedBy: string } | undefined {
  const finished = finishedBy(record, phaseId);
  const delivery = record.developmentDelivery;
  if (!finished || finished[1].finishedByPerson || finished[1].waiverId || delivery?.accepted?.some(one => one.phaseId === phaseId)) return undefined;
  if (!delivery?.assessments.some(one => sameOwner(one, { owner: { kind: "phase", phaseId } }))) return undefined;
  const failing = checks.filter(check => !check.passed);
  const assessmentOnly = failing.length > 0 && failing.every(check => check.name === DELIVERY_CHECK && check.facts.length > 0 && check.facts.every(fact => fact === `Phase ${phaseId} needs a current development-delivery assessment.`));
  return assessmentOnly ? { finishedBy: finished[0] } : undefined;
}

/**
 * A stop on a preflight key (build preflight "Display Contract"): at the preflight stop its
 * headline, items and the line under the headline; at a launch-check or done-check stop, Start again.
 */
function preflightStopFacts(engine: Engine, phaseKey: string): Partial<NonNullable<Snapshot["needsYou"]>> {
  const activity = engine.preflightActivity(phaseKey);
  if (!activity) return {};
  if (engine.preflightStopKey() !== phaseKey) {
    const start = engine.startAgainControl();
    return start.offered ? { startAgain: { available: start.available, ...optional("reason", start.reason) } } : {};
  }
  const { record } = engine;
  const next = engine.preflightNextActivity(activity);
  const built = recordedLeaves(record.plan ?? []).some(leaf => effectiveRecordedClosed(record, leaf)) || activityHistory(record, engine.stateDirectory).some(one => one.kind !== "preflight" && (record.phases[one.key]?.sessionIds.length ?? 0) > 0);
  const stop = record.phases[phaseKey]!.stop!;
  const items = activity.result?.items ?? stop.checks.find(check => check.name === "Preflight")?.facts ?? [];
  return { preflight: {
    headline: activity.result?.headline ?? `Preflight: ${items.length} ${items.length === 1 ? "item needs" : "items need"} you`,
    items,
    nextActivity: { kind: next.kind, ...optional("key", next.key), title: next.title },
    line: `${built ? "" : "Nothing has been built. "}Settle these and check again, and Kiln ${engine.preflightVerb(phaseKey)} ${next.name}.`,
  } };
}

function restartFacts(engine: Engine, phaseKey: string, checkRun: CheckRun | undefined): Partial<NonNullable<Snapshot["needsYou"]>> {
  const hold = engine.record.liveControl?.takeover;
  const work = engine.workOf(phaseKey);
  const carry = engine.carryOnControl();
  const carryOn = carry.offered ? { available: carry.available, ...optional("reason", carry.reason) } : undefined;
  if (hold) {
    if (!hold.history || engine.heldHistoryKey() !== phaseKey) return {};
    const uncertain = engine.messageReceipts(hold.target).some(r => r.message?.delivery === "uncertain");
    return { ...optional("work", work), reopen: hold.history, ...(carryOn ? { carryOn: { ...carryOn, endsHold: hold.kind === "delivery_recovery" || uncertain ? "message" as const : "takeover" as const } } : {}) };
  }
  if (engine.stoppedPhase() !== phaseKey) return {};
  const began = engine.conversationBegan(phaseKey);
  const latest = engine.latestSession(phaseKey);
  const conversation = began ? engine.recoverySession(phaseKey) : undefined;
  const failure = latest && latest.runs.length ? launchFailure(engine.stateDirectory, latest, engine.workingDirectoryOf(latest), engine.worktreePath, one => engine.outputLines(one)) : undefined;
  const ranMs = conversation?.runs.length ? runTiming(conversation.runs.map((run, index) => ({ startedAt: run.startedAt, ...optional("interruptedAt", run.interruptedAt), endedAt: run.endedAt ?? runLastOutputAt(engine.stateDirectory, conversation, index) ?? run.startedAt })), conversation.runs[0]!.startedAt, conversation.runs.at(-1)!.endedAt ?? engine.clock().toISOString()).runningMs : undefined;
  const known = work && !("unknown" in work) ? work : undefined;
  const earlier = failure && conversation && conversation.sessionId !== latest?.sessionId ? conversation : undefined;
  const earlierRun = earlier && lastRecordedRun(earlier);
  const start = engine.startAgainControl();
  return {
    case: engine.stoppedCase(phaseKey),
    ...optional("work", work),
    ...optional("conversationRanMs", ranMs),
    ...optional("launchFailure", failure),
    ...(earlier ? { conversationMessage: { ...(earlierRun?.result?.text ? { finalMessage: earlierRun.result.text } : { lastLines: engine.outputLines(earlier).slice(-10) }), endedAt: earlier.runs.at(-1)!.endedAt ?? earlier.runs.at(-1)!.startedAt } } : {}),
    ...(known?.builtNothing && checkRun?.origin === "stop" ? { nothingToCheck: true as const } : {}),
    ...(began ? { reopen: engine.reopenCheck(phaseKey) } : {}),
    ...optional("carryOn", carryOn),
    ...(start.offered ? { startAgain: { available: start.available, ...optional("reason", start.reason) } } : {}),
    ...optional("catchUp", labelledCatchUp(engine, engine.stoppedCatchUp?.phaseKey === phaseKey ? engine.stoppedCatchUp.offer : undefined)),
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
    repositories: labelled(engine, engine.stoppedCommits?.phaseKey === phaseKey ? engine.stoppedCommits.commits : []),
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
  const { runs, running } = engine.sessionRuns(keys);
  return runTiming(runs, from, doneAt ?? new Date().toISOString(), doneAt ? undefined : running ? "running" : "waiting");
}

/**
 * The PRD's totals (time totals AC-TOTAL-02): this execution's timing with every earlier
 * execution's running time added in, counted from the first start among them. An execution
 * archived before Kiln saved its running time ends the count; the total starts after it.
 */
function prdTiming(engine: Engine, current: Timing | undefined): { timing: Timing; since: string } | undefined {
  const { record } = engine;
  if (!current || !record.startedAt) return undefined;
  const earlier: ExecutionSummary[] = [];
  for (const row of [...(record.continuation?.executions ?? [])].reverse()) {
    if (row.runningMs === undefined || !row.startedAt) break;
    earlier.unshift(row);
  }
  if (!earlier.length) return { timing: current, since: record.startedAt };
  const since = earlier[0]!.startedAt!;
  const runningMs = current.runningMs + earlier.reduce((sum, row) => sum + row.runningMs!, 0);
  return { timing: { ...current, runningMs, waitingMs: Math.max(0, Date.parse(current.asOf) - Date.parse(since) - runningMs) }, since };
}

/** The feature's timing, and `timingSince` only when the total reaches back past this execution's start. */
function prdTimingFields(total: ReturnType<typeof prdTiming>, startedAt?: string): { timing?: Timing; timingSince?: string } {
  if (!total) return {};
  return { timing: total.timing, ...(total.since !== startedAt ? { timingSince: total.since } : {}) };
}

function phaseViews(engine: Engine, state: FeatureState, includeTiming: boolean): PhaseView[] {
  const { record } = engine;
  const plan = record.plan ?? [];
  // Kiln's facts are keyed by the leaf it launched; rows follow the plan as last read.
  const factsByRow = new Map<string, string>();
  for (const key of Object.keys(record.phases)) {
    if (key !== PR_PHASE_KEY && !isPreflightKey(key)) factsByRow.set(judgedKeyFor(plan, key), key);
  }
  const nextLeaf = recordedLeaves(plan).find((leaf) => !effectiveRecordedClosed(record, leaf));
  const multi = engine.multiRepository;
  const currentRow = engine.current ? judgedKeyFor(plan, engine.current.phaseKey) : undefined;

  const rows: PhaseView[] = plan.map((phase) => {
    const base = { id: phase.id, title: phase.title, file: phase.file, finishedByPerson: false, ...optional("attended", phase.attended) };
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
  found: StartCheckReport["found"] & { repositories: StartCheckReport["repositories"]; namedCount?: number },
  repositoryName: string,
  read: (name: string) => string = (name) => readFileSync(join(prdDirectory, name), "utf8"),
): DocumentsFound {
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
      phases: plan.phases.map(documentsPhase),
    },
    // One row per document and target: two links from one document to one file (a section link) are one row.
    ...(found.unfollowedLinks?.length ? { unfollowedLinks: found.unfollowedLinks.filter((link, index, all) => all.findIndex(other => other.from === link.from && other.target === link.target) === index).map(link => ({ target: link.target, from: link.from, reason: link.reason })) } : {}),
    checks: [
      { name: "Every phase cites its criteria", passed: true },
      { name: "Dependencies point backward", passed: true },
      ...(found.repositories.length > 0 || (found.namedCount ?? 0) > 0
        ? [
            { name: REPOSITORIES_FOUND, passed: true },
            { name: `Working tree of ${repositoryName} is clean`, passed: true },
          ]
        : [{ name: "Working tree is clean", passed: true }]),
    ],
  };
}

/**
 * Documents found on a page a reset built (run restart AC-RESET-04, "Start checks on the page"):
 * the documents the start checks could read, the passed checks, and each failed one in `kiln run`'s
 * words. `adoptsCheckout` lets the uncommitted-files check give way for a selection that adopts the
 * checkout `kiln run` was run from (AC-FROM-03 row 6).
 *
 *   startCheckDocuments(prdDirectory, "customer-returns", report, "acme-shop", prdDirectoryFromRoot, false)  // { prd, design, plan, checks, ... }
 */
export function startCheckDocuments(prdDirectory: string, folderName: string, report: StartCheckReport, repositoryName: string, prdDirectoryFromRoot: string, adoptsCheckout: boolean): DocumentsFound {
  const problems = report.problems.filter(problem => !(adoptsCheckout && problem === report.uncommitted));
  const failed = [...report.missingDocuments.map(document => `Missing from ${prdDirectoryFromRoot}/: ${document.name} ${document.description}`), ...problems];
  const read = (name: string) => readFileSync(join(prdDirectory, name), "utf8");
  const prdFile = `${folderName}-prd.md`;
  let criteria: ReturnType<typeof countPrdCriteria> = { count: 0, labels: [] } as unknown as ReturnType<typeof countPrdCriteria>;
  try { criteria = countPrdCriteria(read(prdFile)); } catch { /* A PRD the checks couldn't read is named among the failed checks. */ }
  const readable = (name: string | undefined) => { if (!name) return undefined; try { return read(name); } catch { return undefined; } };
  const design = readable(report.found.designFile);
  const assumptions = readable(report.found.assumptionsFile);
  const plan = report.plan && report.plan.problems.length === 0 ? report.plan : undefined;
  const leaves = plan ? leavesOf(plan) : [];
  const cleanName = report.named.length > 0 ? `Working tree of ${repositoryName} is clean` : "Working tree is clean";
  return {
    prd: { file: prdFile, criteriaCount: criteria.count, ...optional("firstLabel", criteria.firstLabel), ...optional("lastLabel", criteria.lastLabel) },
    ...(design !== undefined ? { design: { file: report.found.designFile!, criteriaCited: countDesignCitations(design, criteria.labels) } } : {}),
    assumptions: assumptions !== undefined ? { file: report.found.assumptionsFile!, ...countAssumptions(assumptions) } : null,
    ...(plan ? { plan: { phaseDocCount: report.found.phaseDocCount, leafCount: leaves.length, closedCount: leaves.filter(leaf => leaf.closed).length, phases: plan.phases.map(documentsPhase) } } : {}),
    ...(report.found.unfollowedLinks?.length ? { unfollowedLinks: report.found.unfollowedLinks.filter((link, index, all) => all.findIndex(other => other.from === link.from && other.target === link.target) === index).map(link => ({ target: link.target, from: link.from, reason: link.reason })) } : {}),
    checks: [
      ...(plan ? [{ name: "Every phase cites its criteria", passed: true }, { name: "Dependencies point backward", passed: true }] : []),
      ...(report.named.length > 0 && !report.problems.some(problem => problem.includes("repositor")) ? [{ name: REPOSITORIES_FOUND, passed: true }] : []),
      // Uncommitted files an adopted worktree holds are counted on the page, never shown as a clean tree.
      ...(report.uncommitted !== undefined || report.problems.some(problem => problem.startsWith("Couldn't read the checkout's status")) ? [] : [{ name: cleanName, passed: true }]),
      ...failed.map(text => ({ name: text, passed: false, text })),
    ],
    ...(failed.length ? { checksFailed: true as const } : {}),
  };
}

/** Documents found's Start from, as the engine's latest preview read it. */
function startView(engine: Engine, preview: StartPreview, readAtStart: boolean): StartView {
  return {
    from: preview.from,
    bringUpToDate: preview.bringUpToDate,
    previewId: preview.previewId,
    branches: (engine.branchChoices ?? []).map(({ name, available }) => ({ name, available })),
    ...optional("planSource", readAtStart ? preview.planSource : undefined),
    repositories: preview.repositories.map(repository => ({ name: repository.name, hasBranch: repository.hasBranch, ...optional("pullRequest", repository.pullRequest), ...(repository.worktree ? { worktree: { path: displayPath(repository.worktree.path), adopted: repository.worktree.adopted, ...optional("uncommittedFiles", repository.worktree.uncommittedFiles) } } : {}) })),
    ...optional("workspaceFolder", preview.workspaceFolder === undefined ? undefined : displayPath(preview.workspaceFolder)),
    closedCount: preview.closedCount,
    // The closed marks belong to the plan read at the start commit, so Start at Phase N waits for it too.
    ...optional("startAt", readAtStart ? preview.startAt : undefined),
    ...optional("catchUp", labelledCatchUp(engine, preview.catchUp)),
  };
}

/** What Kiln found, read from the documents at the start commit, with today's checks. */
function gitDocumentsFound(preview: StartPreview, engine: Engine): DocumentsFound {
  const { names, contents, unfollowed } = preview.documents!;
  const folder = engine.paths.folderName;
  const directory = engine.paths.prdDirectoryFromRoot;
  const pick = (bare: string) => names.find(name => name === bare || name === `${folder}-${bare}`);
  const designFile = pick("technical-design.md");
  const assumptionsFile = pick("assumptions.md");
  const read = (name: string) => contents[`${directory}/${name}`] ?? "";
  const repositories = preview.repositories.filter(repository => repository.kind !== "prd").map(repository => ({ name: repository.name, mainCheckoutPath: repository.mainCheckoutPath, github: repository.github }));
  return documentsFound("", folder, preview.plan!, { ...(designFile ? { designFile } : {}), ...(assumptionsFile ? { assumptionsFile } : {}), phaseDocCount: names.filter(isPhaseFileName).length, ...(unfollowed.length ? { unfollowedLinks: unfollowed.map(link => ({ ...link, href: link.target })) as unknown as NonNullable<StartCheckReport["found"]["unfollowedLinks"]> } : {}), repositories }, engine.paths.repositoryName, read);
}

/** A catch-up offer with each repository's label beside its name (find repositories anywhere AC-FOLDER-02). */
function labelledCatchUp(engine: Engine, offer: CatchUpOffer | undefined): CatchUpOffer | undefined {
  return offer && { repositories: labelled(engine, offer.repositories) };
}

/** Each repository's commits and latest commit in a phase: what its Done recorded, or what Kiln read for its stop. */

/** Each repository's label beside its name (find repositories anywhere AC-FOLDER-02). */
function labelled<T extends { name: string }>(engine: Engine, list: T[]): (T & { label: string })[] {
  return list.map((one) => ({ ...one, label: engine.labelOf(one.name) }));
}

function repositoryDetails(engine: Engine, facts: { repositories: Record<string, { startCommit: string; pushedSha?: string; commitCount?: number }> }, stopped: RepositoryCommits[] | undefined): RepositoryDetails[] {
  const rows: RepositoryDetails[] = [];
  for (const entry of engine.setUpRepositories) {
    const added = entry.kind === "added" && entry.addedInPhase !== undefined ? { addedInPhase: engine.judgedId(entry.addedInPhase) } : {};
    const base = { name: entry.name, label: engine.labelOf(entry.name), ...added, worktree: displayPath(expandHome(entry.worktreePath)), branch: engine.record.settings.featureBranch };
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

/** The PRD's repositories as rows: before Start the planned list with its bases and messages, and each row that asks; after it the set-up entries. */
function repositoryRows(engine: Engine, state: FeatureState): RepositoryRow[] {
  const notStarted = state === "not_started";
  const { settings } = engine.record;
  const multi = engine.multiRepository;
  const labels = engine.labelSet();
  const labelOf = (shortName: string, addressPath: string) => labelAmong({ shortName, addressPath }, labels);
  const located = new Map(notStarted ? engine.namedRows.flatMap((row) => (row.found ? [[row.found.name, row.found.located] as const] : [])) : []);
  const repositories = notStarted ? engine.plannedRepositories : engine.setUpRepositories.map((entry) => ({ ...entry, entry }));
  const rows: RepositoryRow[] = repositories.map((repository) => {
    const entry = repository.entry;
    const isPrd = repository.kind === "prd";
    const fixed = !notStarted || entry?.setupCompletedAt !== undefined || (engine.workspaceFixed && entry?.createdBranch !== undefined);
    const message = isPrd ? engine.currentFieldErrors.baseBranch : engine.baseErrors[repository.name];
    const choices = isPrd ? engine.baseBranches : engine.repositoryBaseBranches[repository.name];
    const worktreePath = entry?.setupCompletedAt !== undefined ? expandHome(entry.worktreePath) : isPrd && !multi ? engine.worktreePath : `${expandHome(settings.workspaceFolder)}/${repository.name}`;
    const shortName = repository.shortName ?? entry?.shortName ?? repository.name;
    const how = located.get(repository.name);
    return {
      name: repository.name,
      label: labelOf(shortName, repository.github),
      addressPath: repository.github,
      checkoutFolder: displayPath(expandHome(repository.mainCheckoutPath)),
      ...(how === undefined ? {} : { located: how }),
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
  if (!notStarted) return rows;
  // A row that asks sits in plan order among the named repositories (find repositories anywhere AC-ASK-01).
  const order = engine.namedRows.map((row) => row.name);
  // A failing start check on a page a reset built holds each row's question until it passes (AC-ASK-01).
  const held = engine.resetCheckFailing;
  for (const row of engine.locatingRepositories) {
    const question = row.question!;
    const label = labelOf(row.shortName, row.addressPath);
    const asking: RepositoryRow = {
      name: row.name,
      label,
      addressPath: question.repository,
      kind: "named",
      baseBranch: "",
      worktreePath: displayPath(`${expandHome(settings.workspaceFolder)}/${row.name}`),
      fixed: true,
      fieldErrors: {},
      ...(held ? {} : { question: questionView(question, label) }),
    };
    if (!order.includes(row.name)) { rows.push(asking); continue; }
    const before = order.slice(0, order.indexOf(row.name)).reverse().find((name) => rows.some((one) => one.name === name));
    const at = before === undefined ? rows.findIndex((one) => one.kind !== "prd") : rows.findIndex((one) => one.name === before) + 1;
    rows.splice(at === -1 ? rows.length : at, 0, asking);
  }
  return rows;
}

/** A stop's saved questions as the page shows them, each with its label (find repositories anywhere, "Screens"). */
function locateView(engine: Engine, questions: SavedQuestion[] | undefined): NonNullable<Snapshot["needsYou"]>["locate"] {
  if (!questions?.length) return undefined;
  const set = engine.labelSet();
  return questions.map((question) => ({ ...questionView({ ...question }, questionLabel(set, question.repository)), ...optional("phaseFile", question.phaseFile) }));
}

/** A question as the page shows it: folders under `~/`. */
export function questionView(question: Question | SavedQuestion, label: string): QuestionView {
  return {
    kind: question.kind,
    repository: question.repository,
    label,
    searchedFrom: displayPath(question.searchedFrom),
    ...optional("searchedTo", question.searchedTo === undefined ? undefined : displayPath(question.searchedTo)),
    checkouts: question.checkouts.map((checkout) => ({ folder: displayPath(checkout.folder), remote: checkout.remote, pickable: checkout.pickable, ...(checkout.remembered ? { remembered: true as const } : {}) })),
    found: question.found,
    ...optional("field", !("field" in question) || question.field === undefined ? undefined : displayPath(question.field)),
    ...optional("fieldError", "fieldError" in question ? question.fieldError : undefined),
  };
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
  // A preflight session runs build-preflight alone: it has none of a phase's build steps.
  if (isPreflightKey(key)) return [];
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
  const audits = record.completionAudits?.activities ?? [];
  let ledger: ReturnType<typeof personItems> | undefined;
  try { ledger = personItems(engine.stateDirectory, audits, Infinity, inspectionStore); } catch (error) { if (inspectionStore) throw error; }
  for (const activity of activityHistory(record, engine.stateDirectory)) {
    if (activity.kind === "implementation" || activity.kind === "final_delivery") {
      const parent = phases.find(r => r.id === activity.key && r.state === "split");
      if (parent && !started.has(parent.id)) { rows.push(parent); started.add(parent.id); }
      const row = phases.find(r => r.id === engine.judgedId(activity.key));
      if (row && !started.has(row.id)) { rows.push({ ...row, activityId: activity.activityId, kind: activity.kind, ...loopFacts(engine, activity.key) }); started.add(row.id); }
      continue;
    }
    if (activity.kind === "preflight") {
      const row = preflightRow(engine, activity.key, state, includeTiming);
      if (row) { rows.push(row); started.add(row.id); }
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
      const repositories = snapshot?.repositories.map(r => ({ name: r.repository, label: engine.labelOf(r.repository), revision: r.head })) ?? [];
      if (report?.schemaVersion === 2) {
        row.audit = { outcome: report.outcome, summary: report.summary, checks, criteria: [], repositories, blockers: report.needsYou.map(item => `${item.problem} ${item.action}`), pendingActions: [] };
        // An audit marked complete with a valid report counts as accepted (AC-ITEM-01), unless Kiln 1.3.0 marked it.
        const counted = accepted || (waivedResult?.reportBytes !== undefined && !audit.itemsUnread);
        if (counted && report.needsYou.length) {
          // Until a later audit has an effective result read for items, every item this one listed is still outstanding.
          row.audit.personItems = { count: report.needsYou.length, waiting: !audits.some(other => other.sequence > audit.sequence && (other.waivedResult && !other.itemsUnread ? store.read<AuditWaiverResult>(other.waivedResult).reportBytes !== undefined : !!other.acceptedResult)) };
        }
        const settledHere = ledger?.settled.filter(item => item.settledByActivityId === audit.activityId) ?? [];
        if (settledHere.length) row.audit.settledItems = settledLines(settledHere).split("\n").map(line => line.slice(2));
      } else {
        // A version-1 result keeps its history: criteria, findings, blockers and human actions.
        row.audit = { ...optional("outcome", report?.outcome), checks, criteria: report?.criteria.map(c => ({ key: c.criterionKey, status: c.deliveryStatus ?? (c.testAssessment && "grade" in c.testAssessment ? c.testAssessment.grade : c.testAssessment?.status) ?? "unresolved", findings: c.findings.map(f => f.missing) })) ?? [], repositories, blockers: report?.blockers.map(b => `${b.problem} ${b.requiredAction}`) ?? [], pendingActions: report?.pendingHumanActions.map(a => a.action) ?? [] };
      }
    } catch (error) { if (inspectionStore) throw error; row.audit = { checks: [{ name: "Audit evidence", passed: false, facts: [(error as Error).message] }], criteria: [], repositories: [], blockers: [(error as Error).message], pendingActions: [] }; }
    Object.assign(row, waivedFacts(engine, activity.key, row.state === "done", waivedResult));
    Object.assign(row, loopFacts(engine, activity.key));
    // A waived audit's checks are its waived completion's, never the refused attempt's (AC-WAIVE-10).
    if (row.audit && row.waivedCompletion) row.audit.checks = row.waivedCompletion.checks;
    rows.push(row); started.add(row.id);
  }
  // Closed-at-start phases have no activity history; show their preserved history before audits.
  const historical = phases.filter(r => !started.has(r.id) && (r.state === "done" || r.state === "split"));
  const pending = phases.filter(r => !started.has(r.id) && r.state !== "done" && r.state !== "split");
  const ordered = [...historical, ...rows, ...pending];
  // A preflight run ahead of an interrupted or waiting activity sits directly above that activity's row.
  for (const preflight of record.preflight?.activities ?? []) {
    if (!preflight.before) continue;
    const at = ordered.findIndex(row => row.id === preflightKeyOf(preflight));
    const target = isPreflightKey(preflight.before) ? undefined : preflight.before.startsWith("audit-") || preflight.before === PR_PHASE_KEY ? preflight.before : engine.judgedId(preflight.before);
    if (at === -1 || target === undefined) continue;
    const [row] = ordered.splice(at, 1);
    const above = ordered.findIndex(one => one.id === target);
    ordered.splice(above === -1 ? at : above, 0, row!);
  }
  return ordered;
}

/**
 * A Preflight row (build preflight "Display Contract"): circle PF, no file line, its session
 * detail as an audit's; Ready, No report or a waiver's pill once finished, with the Found line.
 */
function preflightRow(engine: Engine, key: string, state: FeatureState, includeTiming: boolean): PhaseView | undefined {
  const { record } = engine;
  const activity = engine.preflightActivity(key);
  if (!activity) return undefined;
  const facts = record.phases[key]; const session = engine.latestSession(key);
  const outcome = activity.result?.outcome;
  const found = facts?.doneAt ? preflightFound(outcome) : undefined;
  const row: PhaseView = {
    id: key, activityId: activity.activityId, kind: "preflight", title: PREFLIGHT_TITLE, file: "",
    state: facts?.stop || record.billing?.hold?.phaseKey === key ? "needs_you" : facts?.wait ? "waiting" : facts?.doneAt ? "done" : state === "paused" ? "next" : "implementing",
    finishedByPerson: facts?.finishedByPerson ?? false, ...optional("doneAt", facts?.doneAt),
    preflight: { ...optional("outcome", outcome), ...optional("found", found), ...(facts?.doneAt && outcome === "no_report" && activity.result?.reason ? { reason: activity.result.reason } : {}) },
  };
  if (session) {
    const first = facts?.sessionIds[0] ? engine.sessionRecord(key, facts.sessionIds[0]) : undefined;
    const from = first?.runs[0]?.startedAt;
    row.outputLineCount = engine.outputLines(session).length;
    if (from) {
      row.sessionStartedAt = from; if (includeTiming) row.timing = timingFor(engine, [key], from, facts?.doneAt)!;
      row.details = { ...sessionIdentity(session), from, ...optional("to", facts?.doneAt ?? session.runs.at(-1)?.endedAt), model: session.modelDisplayName, ...optional("effort", session.effort), worktree: displayPath(engine.worktreePath), branch: record.settings.featureBranch, sessionId: session.sessionId };
    }
  }
  Object.assign(row, waivedFacts(engine, key, row.state === "done"));
  return row;
}

/**
 * `Snapshot.preflight.planned` (build preflight "Interfaces"): present while the next Start,
 * Continue or Resume would allocate a preflight, or one is due and not yet allocated, and the
 * skill was found. `before` is the row it would sit above, or `end`.
 */
function preflightPlanned(engine: Engine, state: FeatureState, documents?: DocumentsFound): Pick<Snapshot, "preflight"> {
  const { record } = engine;
  if (!engine.agents.state.optionalSkills?.buildPreflight) return {};
  const unallocated = !record.preflight?.activities.some(activity => !record.phases[preflightKeyOf(activity)]?.doneAt);
  const due = !!record.preflight?.due && unallocated;
  const nextStart = state === "not_started"
    || state === "paused" && unallocated && (record.pause.activeSince !== undefined || engine.restartReview !== undefined && !preflightSettled(record))
    || state === "complete" && !!record.completedPlanCheck?.result?.proposal;
  if (!due && !nextStart) return {};
  if (state === "not_started") {
    const leaf = documents?.start?.startAt?.id ?? documents?.plan?.phases.find(phase => !phase.splitInto && !phase.closed)?.id;
    return { preflight: { planned: { before: leaf ?? "end" } } };
  }
  if (state === "complete") return { preflight: { planned: { before: "end" } } };
  const next = engine.preflightNextActivity(undefined);
  return { preflight: { planned: { before: next.key ?? "end" } } };
}

/** The loop an audit row is, with the limit in force (Kiln Deliver When Audit Loops Run Out AC-STOP-05); phase rows and sessions of test fixes carry none. */
function loopFacts(engine: Engine, key: string): Pick<PhaseView, "loops"> {
  const loops = activityLoops(engine, key);
  return loops ? { loops } : {};
}

/** "Phase 3", "Final delivery" or "Delivery audit": an activity's name in a sentence. */
function activityName(engine: Engine, key: string): string {
  if (key === PR_PHASE_KEY) return "Final delivery";
  if (isPreflightKey(key)) return PREFLIGHT_TITLE;
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

/** The items at a stop and, on a finished run, **For you**; left out when the audit history cannot be read. */
function personItemFields(engine: Engine, store?: Pick<AuditStore, "read">): Pick<Snapshot, "items" | "delivered"> {
  try {
    const items = engine.stopItems(store); const forYou = engine.deliveredForYou(store);
    const delivered = forYou && { loops: closingAudits(engine.record), forYou, pullRequests: (engine.record.pullRequests ?? []).map(pull => ({ repository: pull.repository, number: pull.number, url: pull.url })) };
    return { ...(items?.length ? { items } : {}), ...(delivered ? { delivered } : {}) };
  } catch (error) { if (store) throw error; return {}; }
}

/** A completed-plan check with each repository's label beside Kiln's name for it, for the page (find repositories anywhere AC-FOLDER-02). */
function labelledPlanCheck(engine: Engine, check: NonNullable<PrdRecord["completedPlanCheck"]>): NonNullable<PrdRecord["completedPlanCheck"]> {
  const labelled = (result: typeof check.result) => result && { ...result, ...(result.leaves ? { leaves: result.leaves.map((leaf) => ({ ...leaf, repositories: leaf.repositories.map((repository) => ({ ...repository, label: engine.labelOf(repository.repository) })) })) } : {}) };
  return { ...check, ...(check.result ? { result: labelled(check.result)! } : {}), ...(check.earlierResult ? { earlierResult: labelled(check.earlierResult)! } : {}) };
}
