import { runStartChecks, startChecksPassed, type StartCheckReport } from "../start-checks.js";
import { resolvePrdPath } from "../prd-location.js";
import { inspectSource } from "../requirements/source.js";
import { expectedStage, feedbackProblem, FEEDBACK_LIMIT_BYTES, LIVE_LIMIT_CHARACTERS, nextStageKey, readStageReport, reviewDue, type FeedbackMessage, type RequirementsStage, type RequirementsState, type StageReport } from "../requirements/stages.js";
import { gitText, locateWrittenPrd, reviewState } from "../requirements/git.js";
import { requirementsPrompt } from "../session/prompts.js";
import { startPath, writtenDirectory } from "../requirements/run-path.js";
import { preparationPermissions } from "./preparation-permissions.js";
import { claudeReopenCheck, conversationBegan as sessionBegan, lastRecordedRun, readPhaseWork, type WorkRead } from "./stopped-phase.js";
import type { ReopenCheck } from "./reopen-check.js";
import { markReasonRows } from "../state/records.js";
import { itemEffect, itemLine, itemWaiver, keptFields, kindWords, outstandingLines, personItems } from "../audit/person-items.js";
import { deliveryBlock, forYou, waivedTagText, type ForYou } from "../audit/for-you.js";
import { descriptionRow } from "./description-check.js";
import { readContinuationProposal, type ContinuationProposal } from "./continuation-readiness.js";
import { preparationPrompt, preparationImplementationPrompt, carryOnPrompt, freshSessionPrompt } from "../session/prompts.js";
import { newPreparationState, preparationAttemptNeedsReconciliation, preparationDigest, preparesPhase, type PreparationReference } from "./preparation-state.js";
import { verifyPreparation, preparationCheckpoint, reconcilePreparationAttempt } from "./preparation-verifier.js";
import { bindExecutionAliases, bindLegacySessions, cacheSnapshot, inspectionSnapshot } from "../control/projection.js";
import { newAcceptance, prepareWorkspaces, validatePreparedWorkspace } from "./continuation-setup.js";
import { authorityForApproval, changesContinuationScope, readPendingAuthority, writePendingAuthority, pendingForProposal, reserveAuthority, type ContinuationInputObservation } from "./continuation-authority.js";
import { acceptanceSummary, executionDeliveries, readAcceptance, writeAcceptance, readExecution, retainExecution, type ContinuationAcceptance, type ContinuationState, type ExecutionSummary } from "./continuation-state.js";
import { DiscoveryWriteFailure, discoverCompletedPlan, type CompletedPlanCheck, type DeliveryDecision } from "./completed-plan-discovery.js";
import { deliveryWaiting, findMainCheckout, latestPlanPush, mergeOffer, openAfterDeliveryKey, openMerge, openPlanPush, orderedForMerge, prdPullRequest, readDelivery, type PlanPushActivity } from "./delivery-reading.js";
import { syncBaseBranch, type BaseBranchEntry } from "./base-branch-sync.js";
import { closedAtStopLine, closedOfferLine, MERGE_LIVE_REASON, PLAN_PUSH_LIVE_REASON, unreadableLine } from "./merge-wording.js";
import { captureOwnedProcesses } from "../live/owned-processes.js";
import { execFileSync } from "node:child_process";
import { createGate, gateDirectory, readGate, withGate, unsettled, observeGate, type GateState } from "../live/gate.js";
import { ALREADY_PAUSED, type PauseNowView } from "../live/pause-now.js";
import { aliveTrackedProcesses, backgroundedWork, lastCommandOf, lastSaidOf, runningOperations } from "./pause-now-state.js";
import { sameLiveTarget, validLiveTarget, consumedUuids, messageContractProblem, messageProblem, type LiveTarget, type LiveView, type TakeoverHold } from "../live/target.js";
import { OwnershipError, requireExited, requireHistory, requireNoTerminal } from "../live/ownership.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import { runHelper } from "../platform/helper-process.js";
import { runGit } from "./git-reads.js";
import { startCheckDocuments, type DocumentsFound } from "./snapshot.js";
import { discardResetState, freshResetRecord, resetFailureReason, resetForgets, type ResetPreview } from "./reset.js";
import { openPullRequest } from "./start-from.js";
import { ControlFailure } from "../control/result.js";
import { checkFolder, checkFolders, checkedEntries, type FolderCheck } from "./folder-check.js";
import { gatherFolderFacts, type FolderMissingView } from "./folder-facts.js";
import { buildPanel, buildStart, emptyDraft, type PanelContext, type PanelDraft, type PanelFields, type PanelView, type StartBuild, type StartKind } from "./folder-setup.js";
import { addWorktreeOnBranch, clearStaleRecord, createBranchAndFolder, createLocalBranch, plannedSteps, progressOf, startIntents, step, StartStepFailure, FolderSetupChanged, stillOwnArtifacts, writeStartIntent, readStartIntent, type FolderSetupRepository, type FolderSetupStart } from "./folder-setup-start.js";
import { bindPreparation } from "./continuation-readiness.js";
import { parseGithubOrigin } from "../github-origin.js";
import { deliveredInHistory } from "../control/delivery-evidence.js";
import { resolve } from "node:path";
import { CommandJournal, ACTIONS, isStartingReceipt, lookupReceipt, readReceipts, type Receipt, type Action, type JournalAction, type ControlView } from "../control/commands.js";
import { CompletionCheckUnavailable, RecoveryStateWriteFailed, sameRecoveryTarget, validRecoveryTarget, type PhaseRecoveryTarget, type PhaseRecoveryView, type PhaseRecoveryOutcome, type PhaseRecoveryCode } from "./phase-recovery.js";
import { BillingAuthority, BillingError, newBillingState } from "../billing/authority.js";
import { classify, readInventory, type BillingSummary } from "../billing/inspection.js";
import { activityHistory, observeActivity, latestTestContinues, auditKey, auditLabel, auditNext, resolveAuditSkill, resolveSkill, type SkillResolution, effectiveAudit, hasEffectiveResult, classifyAuditReport, waiveAudit, waiveUnstartedAudit, continuablePredecessor } from "../audit/workflow.js";
import { auditSentenceStart, recordedAuditName, type AuditName } from "../audit/audit-names.js";
import { AuditStore } from "../audit/storage.js";
import { captureSnapshot } from "../audit/snapshots.js";
import { runTiming } from "../session/timing.js";
import { auditSessionPrompt, planPushPrompt, preflightSessionPrompt } from "../session/prompts.js";
import { isPhaseKey, isPreflightKey, activityKeyKind, isAfterDeliveryKey, isPlanPushKey, MERGE_KEY, planPushKey } from "../state/activity-keys.js";
import { keyOf as preflightKeyOf, latestPreflight, preflightActivity, preflightSettled, readPreflightReport, setPreflightDue, unfinishedPreflight, PREFLIGHT_CHECK, PREFLIGHT_LIVE_REASON, PREFLIGHT_PAUSE_REASON, PREFLIGHT_SKILL, PREFLIGHT_STOP_REASON, PREFLIGHT_TITLE, type PreflightActivity, type PreflightReport, type PreflightTrigger } from "./preflight.js";
import { appendLoop, closedKinds, closingAudits, limitFloor, LOOP_STOP_LINE, loopSettings, REMOVED_LOOP_COMMAND, startedLedger, validLimit, type AuditLoopSettings } from "../state/audit-loops.js";
import { nextStepsForecast } from "./next-steps.js";
import { assignAuditObligations } from "./development-owners.js";
import type { AuditActivity, AuditKind, AuditReport, AuditResult } from "../audit/contracts.js";
import { orderedRecoveryOwners } from "./development-owners.js";
import { ownerDocuments, ownerDeliveryCheck } from "./development-delivery.js";
import { deliveryOwner, ownerKey, ownerFields, recoveryOwners, recoveryStopKey, type DeliveryOwner } from "../state/development-delivery.js";
import { auditStatus, issueSnapshot, submitAudit, auditCurrentness, oneRowPerCheck, repositoryChecks, latestAuditRefusal, type AdmissionContext } from "../audit/admission.js";
import { AuditRefusal } from "../audit/contracts.js";
import { normalizeMergeTarget, authorizationTargetKey, type MergeTarget } from "../state/development-delivery.js";
import { fileURLToPath } from "node:url";
import { DeliveryRefusal, deliveryEnabled, ledger, validateStartTargets, recordAssessment, prepareOperation, submitEvidence, reconcileDelivery, phaseDeliveryCheck, acceptPhaseDocuments, acceptAuditDocuments, bindAtFinish, owesDevelopmentEvidence, leavesClosedAtRunBase, evaluateRepositories, finishedReviewMerged, type DeliveryContext } from "./development-delivery.js";
import { emptyDevelopmentLedger, restrictedAuthorization, developmentDeliverySummary, assertDevelopmentState, type CommandEvidence } from "../state/development-delivery.js";
import { readTranscript } from "../session/transcripts.js";
import { readDeliveryHistory } from "./delivery-history.js";
import { appendJsonLine, readJson, readJsonLines } from "../state/state-files.js";
import { runCodexSession, reconcileCodexAttempt } from "../session/codex-session.js";
import { CodexHistoryRpc } from "../session/codex-history-rpc.js";
import { recoverCodexOutput } from "../session/codex-recovery-output.js";
import { prepareCodexLaunch } from "../session/codex-launch-profile.js";
import { probeCodexLaunchSettings } from "../session/codex-launch-probe.js";
import { CodexOutputReader, CODEX_CHILD_OUTPUT_NOTICE } from "../session/codex-output.js";
import { CODEX_NATIVE_CLEANUP_WARNING } from "../session/codex-background-terminals.js";
import { sleepInterruption } from "../session/run-verdict.js";
import { ensurePrivateDirectory } from "../state/state-files.js";
import { AgentInfo } from "../agents/metadata.js";
import { AGENT_IDS, AGENT_NAMES, type AgentId, type CodexUsageRecovery, type RecordedPlanPhase } from "../state/records.js";
import { modelDefaultsPath, readModelDefaults, type ModelChoice } from "../models/model-defaults.js";
import { checkModelChoice } from "../models/model-defaults-edit.js";
import { continuedModelChoices } from "../models/keep.js";
import { activityFallback, auditsChangePlace, choiceView, launchMarks, launchSource, ranOnView, countedFor, fallbackView, installRemedy, listWords, PLANNED_AUDITS_KEY, PLANNED_PREFLIGHT_KEY, type AgentNeed, modelView, notStartedChoice, phaseFinished, startedSession, tierView, type FallbackView, type ModelContext, type ModelView, type TierView } from "./activity-models.js";
import { firstResponseInSavedEvents } from "../models/start-line.js";
import type { ActivityChoice, ModelList, ResolvedChoice } from "../models/resolver.js";
import { choiceWords, decideLaunch, firstOverThreshold, limitWords, type DecisionChoice, type LaunchFallback, type UsageSide } from "../models/launch-decision.js";
import { claudeHistoryStart, codexHistoryStart } from "../models/history-start.js";
import { executableAvailable } from "../platform/helper-process.js";
// The engine: works out where a feature stands, picks the next phase, runs its session, runs
// the done check, and owns Kiln's record (technical design, "Workload Type and Starting Point",
// "Where a Feature Stands", engine loop). The server and view reach it only through its
// commands (start, pause, cancel a pause, check again, resume, change settings) and its snapshots. State
// is kept per phase and per session; the next phase is chosen in one function, `nextLeaf`.

import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, watch, type FSWatcher } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, sep } from "node:path";
import type { AccountView } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import type { ModelEntry } from "../account/model-list.js";
import { isAncestorOf } from "../plan/phase-ids.js";
import { leavesOf, namedRepositories, type PhasePlan, type PlannedPhase } from "../plan/phase-plan.js";
import { endProcessTree } from "../platform/helper-process.js";
import type { KeepAwakeHolder } from "../platform/keep-awake.js";
import { isProcessLive } from "../platform/process-start-time.js";
import { platformSleepReader, type SleepReader } from "../platform/sleep-readings.js";
import {
  sessionFiles,
  launchArguments,
  eventsOfRun,
  readOutputLines,
  resumeArguments,
  runLastOutputAt,
  runReportedInit,
  runSessionProcess,
  type SessionControl,
} from "../session/claude-session.js";
import {
  phaseSessionPrompt,
  pullRequestSessionPrompt,
  mergeSessionPrompt,
  resumePrompt,
  type MergePullRequest,
  type PhasePromptValues,
  type AuditRecoveryTask,
  type PromptRepository,
} from "../session/prompts.js";
import { isModelResponse } from "../session/run-verdict.js";
import type { OutputLine, PartialText, SessionOutputReader } from "../session/session-output.js";
import { automaticResumeSchedule, judgeReading, limitRow, limitSentence, readingAccount, sameAccount, UNKNOWN_LIMIT_LABEL } from "../session/usage-limit.js";
import { activityUsageRelease, CodexLaunchCancelled, CodexUsageRecoveryUnavailable, codexUsageRelease } from "../session/codex-usage.js";
import type { AgentAccount } from "../agents/metadata.js";
import {
  PR_PHASE_KEY,
  readSessionRecord,
  SCHEMA_VERSION,
  writePrdRecord,
  writeSessionRecord,
  type CheckResult,
  type AccountIdentity,
  type InterruptCause,
  type LimitRefusal,
  type PrdRecord,
  type PullRequestFacts,
  type MergedBranchFacts,
  type RepositoryEntry,
  type SessionRecord,
  type SessionRun,
  type LiveRunFacts,
  type Settings,
  type PhaseStop,
  type PhaseFacts,
  type CheckRun,
  type StopKind,
  type StopLimit,
} from "../state/records.js";
import { applyWaivers, changedItems, checkCounts, closedWaiver, completeLabel, effectivePlan, fillAgainst, itemize, knownProblemWaiver, KNOWN_PROBLEM_CHECKS, previewSentence, unmetItems, READINESS_CHECK, HOLD_CHECK, DESCRIPTION_CHECK, type ItemChange, type MarkCompleteOffer, type MarkCompleteOutcome, type Waiver, type WaiverRef, type WaiverSource } from "./waivers.js";
import { userInfo } from "node:os";
import { readRepositoryFingerprints } from "./waiver-fingerprints.js";
import { readPhasePlan } from "../plan/phase-plan.js";
import { isPhaseFileName } from "../plan/phase-ids.js";
import { CHECK_NAMES, planCheck, runDoneCheck, runPullRequestChecks, type CheckedRepository, type DoneCheckOutcome } from "./checks.js";
import { auditCodexConversation } from "../session/codex-evidence.js";
import { applyCodexHistoryReadings, liveContractAtLaunch, liveNotice, liveNoticeReason, noticeText, writeNotice } from "./compatibility-notices.js";
import { compareToMinimum } from "../agents/tooling-minimums.js";
type CodexHistoryReading = Parameters<typeof applyCodexHistoryReadings>[1][number];
import { claudeConfigFolder, findTranscripts, claudeHistoryAvailability, readTranscriptRecords } from "../session/transcripts.js";
import { firstParentCommits, firstParentCount, listWorktrees, localBranchCommit, originBranches, type GitContext } from "./git-reads.js";
import { observeGitPlan, remoteBase } from "./completed-plan-sources.js";
import { PLAN_NORMALIZER_VERSION, PlanBaselineWriteFailure, PlanCapacityError, phaseRepositories, scopeKey, completedPhaseScopeUnchanged, comparisonBaseline, BASELINE_LIMIT, addedLeaves, completedScopeProblems, observePlan, observeActivePlan, readBaseline, retainBaseline, type PlanBaseline, type PlanSource, type UnfollowedLink } from "./plan-reconciliation.js";
import { judgedPhase, nextLeaf, readPlanAt, recordedLeaves, recordedPlan, type PlanRead } from "./plan-reading.js";
import { repositoriesParent, type FoundRepository } from "./repositories.js";
import { besideAddressPath, planNames, recordedName, recordLabelSet, resolvePlanRepositories, type NamedRepositoryRow } from "./plan-repositories.js";
import { checkAnswer, resolveNames, type Question } from "./repository-finding.js";
import { planStopFact, requestRefusal, savedQuestion, stopNowAsks, withQuestion } from "./stop-questions.js";
import type { SavedQuestion } from "../state/records.js";
import { giveNames, labelAmong, shortNameOf, type Labelled } from "./repository-labels.js";
import { readRepositoryName, sameAddressPath } from "../plan/repository-names.js";
import { rememberLocation } from "../state/repository-locations.js";
import {
  addEntryWorktree,
  baseBranchChoices,
  baseFor,
  checkFields,
  checkWorkspaceFolder,
  checkWorkspaceFolderPlacement,
  checkWorktreePath,
  comparable,
  defaultBaseBranch,
  displayPath,
  entryHoldsNothing,
  expandHome,
  fetchIfMissing,
  halfMadeMessage,
  isOwnBranchAt,
  isWithin,
  realPathOfNearestAncestor,
  SETUP_TIMEOUT_MS,
  undoEntry,
  worktreePathFor,
  type FieldErrors,
  type OriginRead,
  type PlannedRepository,
  type RepositoryPaths,
} from "./worktree-setup.js";
import { branchList, catchUpRepository, catchUpSentence, existingBranchPreview, newBranchPreview, otherStartedBranches, readCatchUp, readRepositoryRefs, stoppedCatchUpOffer, uncommittedFiles, type BranchChoice, type CatchUpOffer, type StartPreview, type StartRepository } from "./start-from.js";
import { ensureObjects, gitError, isAncestor, shortSha } from "./git-reads.js";

export interface EngineTools {
  git: string;
  gh: string;
  claude: string;
  codex?: string;
}

/** What the terminal prints while Kiln works (AC-START-09): one line per event. */
export type TerminalEvent =
  | { kind: "folder_missing"; view: FolderMissingView; folders: FolderCheck; address?: string }
  | { kind: "completed_plan_checked"; check: CompletedPlanCheck }
  | { kind: "plan_updated"; at: Date; addedPhaseIds: string[]; remainingCount: number; source: string }
  | { kind: "audit"; at: Date; activityId: string; title: string; line?: string; event: "started" | "stopped" | "paused" | "done" | "interrupted" | "resumed" | "waiting"; limit?: { label: string; resetsAt?: string };
      /** Set on the build preflight's lines, printed as an audit titled Preflight with id PF (build preflight "Display Contract"). */
      preflight?: { outcome?: "ready" | "no_report"; reason?: string } }
  | { kind: "prd_started"; at: Date; branch: string; baseBranch: string; repositoryCount: number }
  /** A line about finding a repository: an answer accepted, a remembered answer forgotten, a candidate Git couldn't read (find repositories anywhere). */
  | { kind: "repository_line"; at: Date; text: string; rest?: string }
  | {
      kind: "phase";
      at: Date;
      phaseId: string;
      title: string;
      event: "started" | "stopped" | "paused" | "done" | "interrupted" | "resumed" | "waiting";
      pushedSha?: string;
      /** A wait's limit: its label and reset (usage-limit recovery AC-LIMIT-05). */
      limit?: { label: string; resetsAt?: string };
      /** A multi-repository PRD's Done: each repository the phase pushed to, as the done line lists them. */
      pushes?: { name: string; sha: string }[];
    }
  | { kind: "repository_added"; at: Date; phaseId: string; title: string; name: string }
  | {
      kind: "pull_request";
      at: Date;
      event: "started" | "stopped" | "paused" | "opened" | "completed" | "interrupted" | "resumed" | "waiting";
      summary?: string;
      number?: number;
      limit?: { label: string; resetsAt?: string };
      /** A multi-repository PRD's pull requests, in list order. */
      opened?: { repository: string; number: number }[];
    }
  | { kind: "delivery"; at: Date; repository: string; environment: string; stage: string; outcome: string }
  /** The merge activity's lines (Kiln After Delivery AC-MERGE-05): its row is **Merge**, id M. */
  | { kind: "merge"; at: Date; event: "started" | "stopped" | "paused" | "interrupted" | "resumed" | "waiting" | "merged"; summary?: string; limit?: { label: string; resetsAt?: string } }
  /** Continue's push of the plan (Kiln After Delivery AC-BACK-05). */
  | { kind: "plan_push"; at: Date; event: "started" | "stopped" | "paused" | "interrupted" | "resumed" | "waiting" | "pushed"; limit?: { label: string; resetsAt?: string } }
  | { kind: "message"; text: string };

class TakeoverAlreadyComplete extends Error {}
/** A Pause now on an attempt recovered from an earlier Kiln with no gate: nothing can stop it (Kiln Pause Now, "Wording"). */
const GATELESS_PAUSE_REASON = "Input connection lost. Pause now waits for this session to end on its own; no forced interruption.";

export type FeedbackAnswer = { ok: true; outcome: "feedback_sent" | "feedback_delivered" } | { ok: false; status: 400 | 409 | 413; code: string; reason: string };
export type CommandResult =
  | { ok: true; noteSkipped?: true; outcome?: PhaseRecoveryOutcome; target?: PhaseRecoveryTarget }
  | { ok: false; status: 400 | 409 | 422 | 500 | 503; reason: string; code?: PhaseRecoveryCode; fieldErrors?: FieldErrors; baseErrors?: Record<string, string> };

/** What `kiln add-repository` gets back (multi-repo AC-ADD-01). */
/** What Mark complete's rerun and act answer (waivers "Interfaces"). */
export type WaiveAnswer = { ok: boolean; outcome?: MarkCompleteOutcome | string; reason?: string; code?: string; status?: number; waiver_id?: string; changes?: ItemChange[] };
/** A launch's decision, saved on the session before its process starts (Kiln Phase Model Tiers, "The launch decision"). */
interface LaunchDecision {
  choice: ModelChoice & { modelName: string };
  launch: NonNullable<SessionRecord["launch"]>;
  /** Both agents' usage was read for this launch, so the launch checks don't read the decided agent again. */
  read: boolean;
  /** The activity's skill, resolved again against the fallback's agent. */
  skill?: NonNullable<AuditActivity["skill"]>;
}

interface WaiveRequest { offered: CheckResult[]; offeredRun: { id: string; at: string }; source: WaiverSource; operationId: string; continueInOrder: boolean }

export type AddRepositoryResult =
  | { ok: true; name: string; worktreePath: string; branch: string; baseBranch: string; added: boolean }
  | { ok: false; status: 409 | 422; reason: string; asked?: true };

/** What `locate-repository` settles as (find repositories anywhere AC-ASK-06; technical design, "The command"). */
export type LocateAnswer =
  | { ok: true; outcome: "located" | "located_phase_starting" | "located_still_stopped" | "folder_not_accepted"; reason?: string; located?: LocatedFacts }
  | { ok: false; code: string; reason: string; status?: number };
/** What `kiln command-status` says about an accepted answer: the repository, its folder, and for the plan stop what came of the phase. */
export interface LocatedFacts { repository: string; folder: string; label?: string; phase?: string; facts?: string[] }

export interface EngineOptions {
  paths: RepositoryPaths & { featureName: string };
  tools: EngineTools;
  env: NodeJS.ProcessEnv;
  stateDirectory: string;
  record: PrdRecord;
  /** The PRD directory's tree as this `kiln run` read it, for the base check before Start. */
  prdTree?: string;
  onTerminal?: (event: TerminalEvent) => void;
  openStakeholderReview?: () => Promise<void>;
  now?: () => Date;
  /** How long a failing read of origin is retried in the done check; two minutes unless a test says otherwise. */
  originRetryMs?: number;
  /** The operating system's suspend record; the platform's own unless a test gives one. */
  sleepReader?: SleepReader;
  /** How often the suspend record is read while Kiln runs: every 10 seconds. */
  sleepCheckMs?: number;
  /** Holds the computer awake while a session's process runs and keep-awake is on (AC-KEEP-06). */
  keepAwake?: KeepAwakeHolder;
  /** How long a stop waits for the session to exit after its interrupt: 30 seconds. */
  stopWaitMs?: number;
  /** How long after SIGTERM to the session's group a stop sends SIGKILL: 5 seconds. */
  killGraceMs?: number;
  /** The wait before a session's end is handled; on Windows a Ctrl+C reaches the session too ([Windows]). */
  exitGraceMs?: number;
  /** The account and the model list, which arrive after startup (technical design, "Startup order"). */
  claude?: ClaudeInfoSource;
  /** Model defaults' file (Kiln Phase Model Tiers, "Storage"): `<state root>/model-defaults.json` unless a test gives one. */
  modelDefaultsPath?: string;
  /** The plan the start checks read in the checkout, recorded when Start is pressed (not started only). */
  startPlan?: PhasePlan;
  /** The named repositories the start checks found, beside the PRD's repository or by their origin (not started only). */
  namedRepositories?: FoundRepository[];
  /** Every named repository in plan order, found or asked about (not started only; find repositories anywhere AC-ASK-01). */
  named?: NamedRepositoryRow[];
  /**
   * Put first on each session's PATH, so `kiln add-repository` reaches this Kiln: the directory
   * of the `kiln` the person ran, on macOS and Linux (multi-repo technical design, "The command").
   */
  kilnBinDirectory?: string;
  /**
   * Step 5 of a reset, once its receipt has settled (run restart "Reset", Doing it): the run builds
   * and publishes a not-started engine, or ends when a step failed. Resolves with what
   * `POST /api/reset` answers.
   */
  onReset?: (receipt: Receipt) => Promise<ResetOutcome>;
  /**
   * Exit Kiln (Kiln After Delivery AC-EXIT-02), once its receipt has settled and the pages were
   * told: the run ends through the ordinary stop path with exit code 0.
   */
  onExit?: (exit: ExitNotice) => void;
  /**
   * An engine built by a reset reruns the run's start-check step on each event-stream connection
   * before Start (run restart AC-RESET-04, Start checks on the page).
   */
  startChecks?: () => Promise<ResetStartChecks>;
}

/** What Exit Kiln tells every open page, and the terminal's last line, before Kiln ends (Kiln After Delivery AC-EXIT-02). */
export interface ExitNotice {
  at: string;
  via: "browser" | "command_line";
  /** The command that opens this PRD again: `kiln run docs/prds/customer-returns`. */
  command: string;
}

/** What `POST /api/reset` answers once the reset is over (run restart "Interfaces"). */
export type ResetOutcome = { ok: true; controlToken: string } | { ok: false; reason: string };

/** The start-check step a reset's engine reruns: the report, the PRD tree and Documents found. */
export interface ResetStartChecks {
  report: import("../start-checks.js").StartCheckReport;
  prdTree: string | undefined;
}

/** What a stop leaves to print (UI-010 item 3): the first sentence, then the grey rest. */
export interface StopReport {
  text: string;
  grey?: string;
}

const STOP_WAIT_MS = 30_000;
/** How long Exit Kiln's answer and the pages' `exited` event have to go out before the run ends, as a reset's failure does. */
const EXIT_DELAY_MS = 250;
const KILL_GRACE_MS = 5_000;
const SLEEP_CHECK_MS = 10_000;
const WINDOWS_EXIT_GRACE_MS = 1_000;
/** How long a resume waits for its account reading (usage-limit recovery "Resume"). */
const RESUME_READING_MS = 30_000;
/** The longest a Node timer waits; a later reset is re-armed. */
const LONGEST_TIMER_MS = 2 ** 31 - 1;
/** The longest note Resume takes (usage-limit recovery technical design, "Prompts"). */
export const NOTE_LIMIT = 4_000;

/**
 * The phase Kiln is working on: between a Done and the next spawn it has no session; while the
 * session runs and while its check runs afterwards, it keeps the session's steps and latest line.
 */
export interface CurrentPhase {
  /** The leaf Kiln launched, or `pr`. */
  phaseKey: string;
  session?: SessionRecord;
  latestLine?: OutputLine;
  /** The phase's commits in each repository that has any, newest first, in list order. */
  commits: RepositoryCommits[];
  processRunning: boolean;
  reader?: SessionOutputReader;
}

export type DoneFirst = { phaseId: string; byPerson: boolean };

export interface RepositoryCommits {
  name: string;
  /** What it is shown by (find repositories anywhere AC-FOLDER-02), set in the snapshot. */
  label?: string;
  commits: { sha: string; subject: string }[];
}

/** What `kiln run` decided for a feature underway: the ● line's subject (UI-010 item 5). */
export type UnderwayDecision =
  | { kind: "requirements_review"; review: "early" | "final" } | { kind: "start_stage" }
  | { kind: "start_audit"; phaseKey: string; name: string; doneFirst?: DoneFirst }
  | { kind: "start_phase"; phaseId: string; doneFirst?: DoneFirst }
  | { kind: "start_pull_request"; doneFirst?: DoneFirst }
  /** The merge activity is open and its session has not started yet (Kiln After Delivery AC-MERGE-05). */
  | { kind: "start_merge" }
  /** Continue's push of the plan is open and its session has not started yet (Kiln After Delivery AC-BACK-05). */
  | { kind: "start_plan_push" }
  /** The push of the plan is done and Kiln checks again before starting the build (AC-BACK-05). */
  | { kind: "plan_push_accepting" }
  | { kind: "needs_you"; phaseKey: string; again: boolean; doneFirst?: DoneFirst }
  | { kind: "plan_stop"; phaseKey: string; doneFirst?: DoneFirst }
  | { kind: "paused"; beforePhaseKey: string; doneFirst?: DoneFirst }
  | { kind: "complete"; doneFirst?: DoneFirst }
  | { kind: "resume"; phaseKey: string; sessionId: string }
  | { kind: "waiting"; phaseKey: string; limit: { label: string; resetsAt?: string }; doneFirst?: DoneFirst }
  | { kind: "setup_failed"; error: string }
  | { kind: "folder_missing" };

/** The journal actions that rerun the folder check before acting (AC-GONE-01). */
const FOLDER_CHECKED_ACTIONS = new Set<string>(["reply", "resume", "verify-and-advance", "waive-and-advance", "check-again", "continue"]);
const FOLDER_MISSING_REASON = "This run's folder is missing. Nothing can run until it is put back or the run is set up again.";

type Verdict = { kind: "done"; judgedId: string } | { kind: "complete" } | { kind: "stopped" } | { kind: "waiting" } | { kind: "stopping" };

/** A resume Kiln does on someone's word: the person's Resume or Resume now, or the end of a wait. */
type ResumeRequest = { phaseKey: string; cause: "person_resume" | "limit_resume"; note?: string };

/** Writes refused because an earlier durable control write failed; the controller does no more work until restart. */
class ControllerFrozen extends Error {}
class FrozenStateWrite extends RecoveryStateWriteFailed {}
const MERGE_BUSY = "Kiln is checking or changing work. Try again when it has finished.";
const refusedWhileFrozen = (error: unknown) => error instanceof ControllerFrozen || error instanceof FrozenStateWrite;

/** Why Start, an answer or Change waits before Start while a check Kiln reports has failed. */
const FIX_WHAT_FAILED = "Fix what failed, then reload.";

export class Engine {
  readonly commands: CommandJournal;
  private controlEpoch = randomUUID();
  private controlDispatch: Receipt | undefined;
  private controlKickPending = false;
  readonly record: PrdRecord;
  current: CurrentPhase | undefined;
  /** True while Start's worktree setup runs. */
  settingUp = false;
  /** True while Check again's check runs. */
  checking = false;
  private completedPlanReading: Promise<CompletedPlanCheck> | undefined;
  /** Whether the check in flight was a person's press (Kiln After Delivery AC-WAIT-01). */
  private completedPlanPress = false;
  private phaseCheckError: { target: PhaseRecoveryTarget; reason: string; attemptedAt: string } | undefined;
  private announcedDelivery = new Set<string>();
  private deliveryBusy = false;
  private deliveryPending: Promise<void> | undefined;
  /** Field messages from the last field check, before Start. */
  fieldErrors: FieldErrors = {};
  /** Each repository's base message other than the PRD's repository's, from the last field check. */
  baseErrors: Record<string, string> = {};
  /** Each other repository's base list, from its origin's branches. */
  repositoryBaseBranches: Record<string, string[]> = {};
  /** The base check before Start: running, passed, or failed with the base field's message. */
  baseCheck: "checking" | "ok" | "error" | undefined;
  /** The base field's list, from origin's branches: `develop`, origin's default branch, then the rest. */
  baseBranches: string[] | undefined;
  /** git's message from a failed setup, held in memory only, cleared by the next Start. */
  startError: string | undefined;
  /** The stopped phase's commits, as last read from Git (Full session output). */
  stoppedCommits: { phaseKey: string; commits: RepositoryCommits[] } | undefined;
  /** A stopped or held phase's work, as last read from Git (run restart "Work"). */
  stoppedWork: { phaseKey: string; read: WorkRead } | undefined;
  /** The start preview for the chosen starting point, recomputed at each of its moments (run restart "The preview"). */
  startPreview: StartPreview | undefined;
  /**
   * The new-branch preview whose base the checkout's PRD documents were last found to match, so
   * Documents found's documents are the base's and the page may say the plan was read there (AC-FROM-02).
   */
  baseDocumentsMatched: string | undefined;
  /** A branch that already exists: every name, available or not (run restart "The branch list"). */
  branchChoices: BranchChoice[] | undefined;
  /** Whether a branch named `settings.featureBranch` exists in any repository, read with the branch list. */
  private featureBranchExists = false;
  private previewRun = 0;
  /** A stopped phase's catch-up offer, read with its work; absent until the first read finishes (run restart "Catching a Branch Up"). */
  stoppedCatchUp: { phaseKey: string; offer: CatchUpOffer | undefined } | undefined;
  /** How the session-starting command being applied treats an untouched branch, and what it moved. */
  private catchUpRequest: { mode: "ticked" | "if_qualifies" | "leave"; moved: { repository: string; branch: string; from: string; to: string; commits: number }[] } | undefined;
  /** The catch-up rows and session a launched prompt carried, told once its run reports init or a turn. */
  private pendingTell: { sessionId: string; rows: number[]; files: boolean } | undefined;
  /** The last successful read of the plan in this run. */
  plan: PhasePlan | undefined;
  /** Links in the requirements Kiln did not follow, from its latest read of the active plan (Kiln Linked Documents AC-LINK-03). Never saved. */
  unfollowedLinks: UnfollowedLink[] = [];
  /** Set once a stop begins (Ctrl+C, a closed terminal, a signal); from then on nothing is judged. */
  stopping: InterruptCause | undefined;

  private readonly options: EngineOptions;
  private readonly now: () => Date;
  private readonly git: GitContext;
  private driving: Promise<void> | undefined;
  private readonly exitListeners = new Set<(exit: ExitNotice) => void>();
  /** Set once Exit Kiln is accepted: nothing more starts, and the run ends. */
  private exiting: ExitNotice | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly outputListeners = new Set<(sessionId: string, lines: OutputLine[]) => void>();
  private readonly partialListeners = new Set<(sessionId: string, partial: PartialText) => void>();
  private lastCommitRefresh = 0;
  private stoppedCommitsReading: Promise<void> | undefined;
  /** True while `kiln run` decides; its ● line stands in for the terminal lines, except an added repository's. */
  private quiet = false;
  /** `kiln run` already ran the check before the pull-request session and it failed. */
  private pullRequestPrecheckDone = false;
  deliveryHistoryPending = false;
  deliveryHistoryError: string | undefined;
  private deliveryReading: Promise<void> | undefined;
  /** The delivery reading in flight (Kiln After Delivery, "The Delivery Reading"): one at a time, joined by every occasion. */
  private afterDeliveryReading: Promise<{ failed: { repository: string; number: number }[] }> | undefined;
  /** Aborted when a stop begins: every git and gh call still running ends, and new ones fail at once. */
  private readonly abort = new AbortController();
  /** The live session process's controls, while one runs. */
  private control: SessionControl | undefined;
  /** An interrupted session `kiln run` decided to resume, once its ● line is printed. */
  private pendingResume: string | undefined;
  restartReview: { activityKey: string; action: "start" | "resume" | "wait" } | undefined;
  private reviewingRestart = false;
  /** Read-only inspection ownership spans asynchronous resume preflight before current exists. */
  private inspectionResumingSession: string | undefined;
  /** A Resume, Resume now or end of a wait whose check failed: the loop resumes that session next, with any note. */
  private requestedResume: ResumeRequest | undefined;
  /** Carry on or Start again at a stopped phase: the loop launches a new session of the phase next (run restart "Starting a Session at a Stop"). */
  private requestedLaunch: { phaseKey: string; kind: "carry_on" | "start_again"; note?: string } | undefined;
  /** The hold whose carry-on found the phase already complete: its advance is offered on the carry-on ownership check (AC-CARRY-06). */
  private heldAdvance: string | undefined;
  /** The wait being watched in this run of Kiln: how many readings it has judged, and its reset timer. */
  private waitWatch: { phaseKey: string; readings: number; resetTimer?: NodeJS.Timeout } | undefined;
  /** The last account reading the engine saw, so each new one is handled once. */
  private lastReading: AccountView | undefined;
  private freshReading: AccountView | undefined;
  /** The phase whose check is running, for the line a stop prints. */
  private activeCheck: string | undefined;
  private readonly sleepReader: SleepReader;
  private sleepTimer: NodeJS.Timeout | undefined;
  private sleepReading: Promise<void> | undefined;
  /** When the last sleep reading found the computer had slept (milliseconds since the epoch). */
  private lastWakeAt: number | undefined;
  private stopPromise: Promise<StopReport> | undefined;
  /** A left-over session process being stopped, which a stop waits for so none is left behind. */
  private orphanStop: Promise<void> | undefined;
  /** An interrupted session between its verdict and its resumed process, for the line a stop prints. */
  private interruptedKey: string | undefined;
  private skipStopWait: (() => void) | undefined;
  private closed = false;
  private takeoverTimer: NodeJS.Timeout | undefined;
  private takeoverReading: Promise<void> | undefined;
  private returningTakeover = false;
  /** The background-process lookup's last result, keyed by the hold it was read for; derived each second, never saved. */
  private pauseNowProcesses: { operationId: string; entries: { pid: number; command?: string }[] } | undefined;
  /** The last thing the agent said before a Pause now stop, read once per hold from its saved events. */
  private pauseNowSaid: { operationId: string; text: string | undefined } | undefined;
  private recoveredLive = false;
  /**
   * Folder missing (missing worktree recovery, "The Folder Check"): computed from disk and Git
   * each time it is checked and never saved. Set while any set-up repository's saved folder is
   * not the run's worktree; the facts are gathered on entry and on Check again.
   */
  folderMissing: (FolderMissingView & { folders: FolderCheck }) | undefined;
  private folderChecking: Promise<boolean> | undefined;
  private leavingFolderMissing = false;
  /** Startup prints Folder missing itself; later entries print through a terminal event. */
  private announceFolderMissing = false;
  private recoveredTimer: NodeJS.Timeout | undefined;
  /** Counts field checks, so only the latest one's result is shown. */
  private fieldCheckRun = 0;
  private fieldChecksRunning = 0;
  private readonly offClaude: (() => void) | undefined;
  private observedClaude: ClaudeInfoSource | undefined;
  private offUsage: (() => void) | undefined;
  private lastCodexReading: AgentAccount | undefined;
  /** Additions run one at a time; a request for a repository being set up waits for that setup. */
  private additionChain: Promise<unknown> = Promise.resolve();
  private readonly additionsUnderway = new Map<string, Promise<AddRepositoryResult>>();
  /** The repositories the last pull-request check read from Git as getting a pull request. */
  private lastPullRequestRepositories: RepositoryEntry[] | undefined;
  /** The latest completion check of each kind, for Mark complete's act after its rerun. */
  private lastDoneCheck: { key: string; outcome: DoneCheckOutcome } | undefined;
  private lastFinalCheck: { pullRequests?: PullRequestFacts[] | undefined; mergedBranches?: MergedBranchFacts[] | undefined } | undefined;

  constructor(options: EngineOptions) {
    this.options = options;
    this.record = options.record;
    this.now = options.now ?? (() => new Date());
    this.git = { git: options.tools.git, env: options.env, signal: this.abort.signal };
    this.sleepReader = options.sleepReader ?? platformSleepReader();
    ensurePrivateDirectory(options.stateDirectory);
    const migratingActivities = !this.record.activities;
    activityHistory(this.record, options.stateDirectory);
    if (migratingActivities && this.record.startedAt) writePrdRecord(options.stateDirectory, this.record);
    this.defaultsPath = options.modelDefaultsPath ?? modelDefaultsPath(options.env);
    this.claudeCodeInstalled = executableAvailable(options.tools.claude, options.env);
    this.codexInstalled = !!options.tools.codex && executableAvailable(options.tools.codex, options.env);
    // One reader per agent (Kiln Phase Model Tiers, "Agents"): each holds its own readiness, model list, account and usage.
    const claudeReader = new AgentInfo({ agentId: "claude_code", ...(options.claude ? { claude: options.claude } : {}), executable: options.tools, cwd: options.paths.mainCheckoutPath, claudeCwd: options.stateDirectory, env: options.env });
    this.readers = { claude_code: claudeReader, codex: new AgentInfo({ agentId: "codex", claude: claudeReader.claude, executable: options.tools, cwd: options.paths.mainCheckoutPath, claudeCwd: options.stateDirectory, env: options.env }) };
    this.offClaude = (() => { const offs = AGENT_IDS.map(id => this.readers[id].onChange(() => this.modelsChanged())); return () => offs.forEach(off => off()); })();
    this.record.executionId ??= randomUUID();
    this.record.billing ??= newBillingState(this.record.executionId);
    this.billing = new BillingAuthority({
      state: () => this.record.billing!, generation: () => this.readers.claude_code.state.generation,
      save: () => this.save(), changed: () => this.changed(), busy: () => this.billingBusy(),
      cancelled: () => this.abort.signal.aborted || this.closed, readiness: () => this.billingResumesConversation ? this.readers.claude_code.state.blockers.length === 0 : !this.agentProblem("claude_code"),
      completed: () => this.currentlyComplete, now: () => this.now().toISOString(),
      inspect: async (cwd, env, args) => {
        const read = await readInventory({ executable: this.options.tools.claude, cwd, env, args, signal: this.abort.signal });
        this.abort.signal.throwIfAborted();
        const auth = await this.readers.claude_code.refreshClaudeForLaunch(cwd, read.projected, this.abort.signal);
        const result = classify({ cwd, env, read, auth, at: this.now().toISOString() });
        const overflow = this.claude?.account?.extraUsage;
        if (result.summary.route === "subscription" && overflow && Date.parse(result.summary.observedAt) - Date.parse(overflow.observedAt) <= 5 * 60_000 && (overflow.email || overflow.orgId) && overflow.email === result.summary.email && overflow.orgId === result.summary.orgId) result.summary.overflow = { enabled: overflow.enabled, observedAt: overflow.observedAt };
        return result;
      },
    });
    this.commands = new CommandJournal(this.stateDirectory, resolve(this.record.repository.mainCheckoutPath, startPath(this.record)), {
      journalScope: () => this.record.continuation ? { execution: this.record.executionId!, commandIds: [...this.record.continuation.acceptances.filter(row => row.id === this.record.continuation!.currentAcceptanceId).map(row => row.commandId), ...(this.record.folderSetupStart ? [this.record.folderSetupStart.commandId] : [])] } : undefined,
      internalControl: instruction => this.continuationControl(instruction),
      execution: () => this.record.executionId!, view: () => this.controlView(), runState: () => this.controlRunState(),
      staleReason: instruction => {
        const target = instruction.inputs.target;
        if (instruction.action !== "take-over" || !validLiveTarget(target) || target.executionId !== this.record.executionId || !this.record.phases[target.activityKey]?.doneAt) return undefined;
        const activity = activityHistory(this.record, this.stateDirectory).find(a => a.key === target.activityKey && a.activityId === target.activityId);
        const session = this.sessionRecord(target.activityKey, target.sessionId);
        if (activity && session?.executionId === target.executionId && session.sessionId === target.providerSessionId && session.runs.some((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session, i)) === target.attemptId)) return "The targeted activity finished before Pause now was accepted. Its successor was not paused.";
        return undefined;
      },
      admission: instruction => instruction.action === "locate-repository" ? this.locateAdmission(String(instruction.inputs.repository)) : undefined,
      apply: (action, inputs, receipt) => this.applyControl(action, inputs, receipt),
      markCompleteOffer: () => this.markCompleteOffer(),
      reconcile: receipt => this.reconcileControl(receipt), changed: () => { this.changed(); if (this.controlKickPending && !this.commands.busy) { this.controlKickPending = false; this.kick(); } },
    });
    this.recoverLiveMessages();
    this.record.controlEpoch = this.controlEpoch;
    this.save();
    if (this.record.liveControl) this.watchTakeover();
    this.startReaders();
    this.watchModelDefaults();
    void this.refreshBilling().catch(() => this.changed());
  }

  async refreshCommand(id: string) {
    const answer = this.commands.lookup(id); const receipt = answer.operation as Receipt;
    if (receipt.session_id && receipt.phase_key && receipt.effects.reply !== "delivered" && ["submitted", "unknown"].includes(receipt.effects.reply)) {
      const session = this.sessionRecord(receipt.phase_key, receipt.session_id);
      const run = session?.runs.find(r => r.control?.operationId === receipt.id);
      if (session && run?.control) {
        const delivered = await deliveredInHistory(session, run, this.environment).catch(() => false);
        if (delivered) {
          this.commands.recordDelivery(id);
        }
      }
    }
    return this.commands.lookup(id);
  }

  controlRunState(): string {
    if (this.reviewStop) return `${this.reviewStop}_review`;
    return this.current?.processRunning ? "implementing" : this.stoppedPhaseKey() || this.record.billing?.hold ? "needs_you" : this.restartReview ? "paused" : this.waitingPhaseKey() ? "waiting" : this.record.pause.activeSince ? "paused" : this.currentlyComplete ? "complete" : this.isUnderway ? "implementing" : "not_started";
  }

  /** Inspection only: synchronous ownership after any awaited provider history read. */
  ownsInspectionSession(id: string): boolean {
    if (this.current?.session?.sessionId === id || this.inspectionResumingSession === id) return true;
    for (const phase of [this.reviewingRestart ? undefined : this.pendingResume, this.requestedResume?.phaseKey]) if (phase && this.record.phases[phase]?.sessionIds.at(-1) === id) return true;
    const wait = this.waitingPhaseKey();
    if (this.checking && wait && this.record.phases[wait]?.wait?.sessionId === id) return true;
    for (const receipt of [this.controlDispatch, this.commands.active]) {
      if (!receipt || !["reply", "resume"].includes(receipt.instruction.action)) continue;
      if (receipt.session_id === id) return true;
      try {
        const target: unknown = JSON.parse(receipt.target);
        if (validRecoveryTarget(target) && target.executionId === this.record.executionId && target.sessionId === id) return true;
        if (target && typeof target === "object" && "execution" in target && target.execution === this.record.executionId && "key" in target && typeof target.key === "string") {
          const facts = this.record.phases[target.key];
          if ((facts?.wait?.sessionId ?? facts?.sessionIds.at(-1)) === id) return true;
        }
      } catch { /* An unrecognized target cannot claim a different conversation. */ }
    }
    return false;
  }

  controlView(): ControlView {
    const key = this.stoppedPhaseKey(); const wait = this.waitingPhaseKey();
    const target = JSON.stringify(this.phaseRecoveryTarget() ?? { review: this.reviewStop && this.record.requirements?.review, live: this.liveTarget(), execution: this.record.executionId, key: key ?? wait ?? this.current?.phaseKey ?? this.record.nextActivityKey, stop: key ? this.record.phases[key]?.stop?.at : wait ? this.record.phases[wait]?.wait : null });
    // Once Exit Kiln is accepted nothing else starts (Kiln After Delivery AC-EXIT-02).
    const busy = !!(this.checking || this.driving || this.settingUp || this.deliveryBusy || this.stopping || this.exiting || this.commands?.busy);
    const paused = !!this.record.pause.activeSince || !!this.restartReview;
    // A hold whose conversation can't be reopened advances from the carry-on's already-complete choice on the carry-on ownership check, in place of release (AC-CARRY-06).
    const heldHistory = this.record.liveControl?.takeover.history !== undefined && !this.record.liveControl.takeover.carryOnObstacle && this.heldAdvance === this.record.liveControl.takeover.operationId;
    const releasePending = !!this.current || this.record.liveControl?.takeover.state === "pending" && !heldHistory;
    const available: Record<Action, boolean> = {
      message: !!this.liveView()?.input?.available && !this.commands?.busy,
      "message-review": !!this.record.liveControl && !this.commands?.busy,
      "take-over": !!this.liveView()?.available && !this.commands?.busy,
      reply: !!key && this.resumeOffered(key) && !busy,
      resume: !this.restartReview && !!(this.reviewStop || wait || key && this.resumeOffered(key)) && !busy,
      "verify-and-advance": !!this.phaseRecoveryTarget() && !busy && !releasePending,
      "request-pause": this.isUnderway && !this.currentlyComplete && !openAfterDeliveryKey(this.record) && !key && !wait && !paused && !this.record.pause.requestedAt && this.current?.phaseKey !== PR_PHASE_KEY && !this.commands?.busy,
      "cancel-pause": !!this.record.pause.requestedAt && !paused && !wait && !this.commands?.busy,
      continue: (paused || this.reviewStop === "early") && !busy,
      "start-build": this.reviewStop === "final" && !!this.requirementsBuildPlan?.ok && !this.finalStartProblems.length && !busy,
      // Feedback is taken whenever the requirements side is open, during any activity; it never waits on one (AC-TALK-03).
      feedback: this.requirementsOpen && this.record.startedAt !== undefined && !this.folderMissing && !this.commands?.busy,
      "check-again": !!key && !this.phaseRecoveryTarget() && !busy,
      "waive-and-advance": this.markCompleteOffer().offered && !busy && !releasePending,
      settings: !this.settingUp && !this.completedPlanReading && !this.commands?.busy && !this.billing.busy && !(this.checking && this.phaseRecoveryTarget()),
      "outside-confirmation": false,
      "carry-on": this.carryOnControl(true).available && !busy,
      "start-again": this.startAgainControl().available && !busy,
      reset: this.resetControl().available,
      "locate-repository": !!key && !!this.questionHolder(key)?.locate?.length && !busy,
      merge: this.mergeControl().available,
      exit: this.exitControl().available,
      // `kiln model` (AC-PICK-05): in a run underway that isn't complete, whatever any activity's state, since --audits is never refused for one; withdrawn only as settings is.
      model: this.isUnderway && !this.record.completedAt && !this.folderMissing && !this.settingUp && !this.completedPlanReading && !this.commands?.busy && !this.billing.busy,
    };
    // At a preflight stop only Check Preflight again and Mark complete are offered (The Preflight Stop).
    if (this.reviewStop) available["request-pause"] = false;
    const lastStage = this.record.requirements?.stages.at(-1);
    if (key && key === `req-${lastStage?.activityId}` && lastStage?.report?.next?.kind === "before_prd") {
      for (const action of ACTIONS) available[action] = action === "reset";
    }
    const preflightStop = this.preflightStopKey() !== undefined;
    if (preflightStop) for (const name of ["reply", "resume", "carry-on", "start-again", "verify-and-advance"] as const) available[name] = false;
    const preflightRunning = isPreflightKey(this.current?.phaseKey) || !!this.record.preflight?.due;
    if (preflightRunning) available["request-pause"] = false;
    // A running merge or push session offers no message, pause or takeover, and says why (AC-MERGE-05, MERGE-001).
    const afterDeliveryKey = openAfterDeliveryKey(this.record);
    // A push past Done runs no session: during its re-check the controls give Kiln's busy reason.
    const afterDeliveryRunning = afterDeliveryKey !== undefined && !key && !wait && !(isPlanPushKey(afterDeliveryKey) && openPlanPush(this.record)?.doneAt);
    const liveReason = afterDeliveryKey === MERGE_KEY ? MERGE_LIVE_REASON : PLAN_PUSH_LIVE_REASON;
    const unavailable: Partial<Record<Action, string>> = {
      "start-build": this.reviewStop === "final" ? this.finalStartProblems[0] ?? "The phase plan must pass the start checks." : "Start the build is available only at the final review.",
      feedback: !this.record.requirements ? "This run has no requirements stages." : this.record.startedAt === undefined ? "Feedback is taken once Start is pressed." : !this.requirementsOpen ? "The build has started. Feedback goes to the requirements before the build." : this.folderMissing ? FOLDER_MISSING_REASON : "Another instruction owns control; send the feedback again in a moment.",
      "take-over": this.liveView()?.reason ?? (preflightRunning ? PREFLIGHT_LIVE_REASON : "Pause now needs an active supported Claude phase or audit."),
      message: this.liveView()?.input?.reason ?? (preflightRunning ? PREFLIGHT_LIVE_REASON : "No active supported Claude input is available."),
      "request-pause": !this.isUnderway || this.currentlyComplete ? "Nothing is running to pause after." : !this.record.pause.requestedAt && this.record.liveControl && this.record.liveControl.takeover.kind !== "delivery_recovery" && key ? `${this.auditActivity(key) ? auditSentenceStart(this.auditName(key)!) : `Phase ${this.judgedId(key)}`} is pausing or paused, which offers no pause after.` : "A pause is already requested or this activity cannot pause.",
      "cancel-pause": "No pause is requested.",
      // A paused Pause now whose later reading found an obstacle (Claude open on the conversation) says so (AC-PAUSE-06).
      resume: this.pausedObstacle() ?? "Resume isn't offered here.", reply: this.pausedObstacle() ?? "Resume isn't offered here.",
      "outside-confirmation": "Workspace confirmations have been retired; recheck the remaining completion requirements.",
      "verify-and-advance": releasePending ? this.record.liveControl?.takeover.reason ?? "Wait for the current attempt and tracked work to be released." : "No stopped activity is available to verify.",
      "waive-and-advance": (() => { const offer = this.markCompleteOffer(); return offer.offered ? this.record.liveControl?.takeover.reason ?? "Wait for the current attempt and tracked work to be released." : offer.reason; })(),
      "carry-on": this.carryOnControl(true).reason ?? "Carry on isn't offered here.",
      "start-again": this.startAgainControl().reason ?? "Start again isn't offered here.",
      reset: this.resetControl().reason ?? "Reset isn't available.",
      "locate-repository": this.record.startedAt === undefined ? `${this.paths.featureName} hasn’t started. Tell Kiln where a repository is on Documents found, in the browser.` : "No stop is asking where a repository is.",
      merge: this.mergeControl().reason ?? "Merge with the agent isn't offered here.",
      exit: this.exitControl().reason ?? "Exit Kiln isn't offered here.",
      model: !this.isUnderway ? "No run is underway. Change models on Documents found." : this.record.completedAt ? "The run is complete; no activity is left to change." : this.folderMissing ? FOLDER_MISSING_REASON : "Kiln is checking, dispatching or reconciling an instruction.",
      ...(afterDeliveryRunning ? { "take-over": liveReason, message: liveReason, "request-pause": liveReason } : {}),
      ...(preflightStop ? { reply: PREFLIGHT_STOP_REASON, resume: PREFLIGHT_STOP_REASON, "carry-on": PREFLIGHT_STOP_REASON, "start-again": PREFLIGHT_STOP_REASON, "verify-and-advance": PREFLIGHT_STOP_REASON } : {}),
      ...(preflightRunning ? { "request-pause": PREFLIGHT_PAUSE_REASON } : {}),
    };
    // Live controls run beside the phase Kiln is driving, so only a pending instruction makes them busy; otherwise they carry the live view's reasons.
    const liveControl = (name: Action) => name === "message" || name === "take-over" || name === "message-review";
    const fixedReason = (name: Action) => name === "reset" || name === "locate-repository" && !(key && this.questionHolder(key)?.locate?.length) || name === "merge" || name === "exit" || name === "model" || afterDeliveryRunning && (name === "take-over" || name === "message" || name === "request-pause") || preflightStop && ["reply", "resume", "carry-on", "start-again", "verify-and-advance"].includes(name) || preflightRunning && name === "request-pause";
    const controls = ACTIONS.filter(name => name !== "outside-confirmation").map(name => ({ name, available: available[name], reason: available[name] ? null : fixedReason(name) ? unavailable[name]! : (liveControl(name) ? this.commands?.busy : busy) ? "Kiln is checking, dispatching or reconciling an instruction." : unavailable[name] ?? "The current browser recovery rules do not offer this control." }));
    const live = this.liveView();
    // A Pause now's per-reading reasons (the hold's reason, its rows) stay out of the token, so a pause still pausing doesn't change it every second (Kiln Pause Now, "Interfaces").
    const pauseHeld = !!this.record.liveControl && this.record.liveControl.takeover.kind !== "delivery_recovery";
    const tokenControls = pauseHeld ? controls.map(c => ["take-over", "message", "verify-and-advance", "waive-and-advance", "resume", "reply"].includes(c.name) ? { name: c.name, available: c.available } : c) : controls;
    const fingerprint = { continuation: this.record.continuation, proposal: this.record.completedPlanCheck?.result?.proposal?.id, live: live && { target: live.target, takeover: live.takeover && { kind: live.takeover.kind, state: live.takeover.state }, review: live.reviewRequired, messages: live.messages?.map(m => ({ id: m.id, delivery: m.delivery, reviewedAt: m.reviewedAt })) }, epoch: this.controlEpoch, execution: this.record.executionId, revision: this.record.controlRevision ?? 0, target, run: key ? (this.record.billing?.hold?.phaseKey === key ? this.record.billing.hold.run?.id : this.record.phases[key]?.stop?.run?.id) : undefined, controls: tokenControls, pause: this.record.pause, settings: this.record.settings, current: this.current && { key: this.current.phaseKey, session: this.current.session?.sessionId, attempt: this.current.session?.runs.length, running: this.current.processRunning }, authority: this.record.developmentAuthorization, billingHold: this.record.billing?.hold, billingApproval: this.record.billing?.approval, afterDelivery: this.record.afterDelivery && { pulls: this.record.afterDelivery.pullRequests.map(row => [row.repository, row.number, row.state, row.headSha ?? null]), merge: this.record.afterDelivery.merge && { id: this.record.afterDelivery.merge.operationId, closed: !!this.record.afterDelivery.merge.closedAt } },
      unsent: this.commands?.unsent(target).map(r => r.id) ?? [] };
    return { token: `${this.record.executionId!}:${createHash("sha256").update(JSON.stringify(fingerprint)).digest("base64url")}`, target, controls };
  }

  private reconcileControl(receipt: Receipt): Receipt | undefined {
    if (receipt.instruction.action === "folder-setup-start") {
      // Settled from its intent: completed once it activated or resumed, failed otherwise; an intent left in progress has failed (Start).
      const intent = readStartIntent(this.stateDirectory, receipt.command_id);
      // The record is saved before the intent is marked activated: a record that names the intent settles it too.
      const persisted = readJson<PrdRecord>(join(this.stateDirectory, "prd.json"));
      const activated = !!intent && persisted?.folderSetupStart?.id === intent.id;
      if (intent && activated && intent.state !== "activated") { intent.state = "activated"; writeStartIntent(this.stateDirectory, intent); }
      else if (intent?.state === "in_progress") { intent.state = "failed"; writeStartIntent(this.stateDirectory, intent); }
      const done = intent?.state === "activated" || intent?.state === "resumed";
      return { ...receipt, state: done ? "completed" : "failed", stage: "settled", outcome: done ? "folder_setup_started" : "not_applied", reason: done ? null : "Start stopped before it finished. Review the page, then press Start again." };
    }
    if (receipt.instruction.action === "continuation-grant") {
      const pending = authorityForApproval(this.stateDirectory, receipt.id);
      const proposed = readContinuationProposal(this.stateDirectory, receipt.instruction.inputs.proposal_id as string);
      const applied = pending?.completedExecutionId === receipt.execution_id && pending.scopeDigest === proposed.scopeDigest && pending.authorization.grants.some(grant => authorizationTargetKey(grant.target) === authorizationTargetKey(normalizeMergeTarget(receipt.instruction.inputs.target)));
      const currentAuthority = readPendingAuthority(this.stateDirectory, this.record);
      if (applied && currentAuthority?.id !== pending.id && (!currentAuthority || currentAuthority.state !== "pending" || currentAuthority.completedExecutionId !== this.record.executionId) && this.record.executionId === pending.completedExecutionId && pending.state === "pending" && (this.record.completedPlanCheck?.result ?? this.record.completedPlanCheck?.earlierResult)?.proposal?.scopeDigest === pending.scopeDigest) {
        // Journal reconciliation runs during construction, before commands is assigned.
        // The durable approval payload owns this reserved identity even if its pointer
        // publication was interrupted; no setup or dispatch is authorized here.
        this.record.pendingContinuationAuthority = pending.id;
        writePrdRecord(this.stateDirectory, this.record);
      }
      return { ...receipt, state: applied ? "completed" : "failed", stage: "settled", outcome: applied ? "continuation_authorized" : "not_applied", reason: applied ? null : "No retained target approval exists. Refresh the proposal before choosing again." };
    }
    if (["continuation-accept", "continuation-retry"].includes(receipt.instruction.action)) {
      const persisted = readJson<PrdRecord>(join(this.stateDirectory, "prd.json"));
      const row = persisted?.continuation?.acceptances.find(row => receipt.instruction.action === "continuation-accept" ? row.commandId === receipt.command_id || row.completedExecutionId === receipt.execution_id && row.proposalId === receipt.instruction.inputs.proposal_id : row.id === receipt.instruction.inputs.acceptance_id && row.completedExecutionId === receipt.execution_id);
      // A Continue press that opened a push of the plan applied it, though no acceptance exists yet (Kiln After Delivery AC-BACK-05).
      if (!row && receipt.instruction.action === "continuation-accept" && persisted?.afterDelivery?.planPushes?.some(push => push.operationId === receipt.id)) return { ...receipt, state: "completed", stage: "settled", outcome: "plan_push_started", reason: null };
      return { ...receipt, state: row ? "completed" : "failed", stage: "settled", outcome: row ? "continuation_accepted" : "not_applied", reason: row ? null : "No durable acceptance exists. Check the current plan before a fresh choice." };
    }
    if (receipt.instruction.action === "message-review") {
      // Constructor reconciliation precedes Engine.commands assignment. Read the
      // same authoritative journal directly, never dispatch or replay a review.
      const inputs = receipt.instruction.inputs;
      const retained = readReceipts(this.stateDirectory);
      const selected = Array.isArray(inputs.receipt_ids) ? inputs.receipt_ids.map(id => retained.find(r => (r.id === id || r.command_id === id) && sameLiveTarget(r.live_target, inputs.target as LiveTarget))) : [];
      const complete = selected.length > 0 && selected.every(r => r?.message?.delivery === "uncertain" && !!r.message.reviewedAt);
      return { ...receipt, state: complete ? "completed" : "failed", stage: "settled", outcome: complete ? "message_reviewed" : "message_review_incomplete", reason: complete ? null : "Not all acknowledgements were saved. Review the remaining messages; nothing resumed or advanced." };
    }
    if (receipt.instruction.action === "message") {
      if (receipt.message?.delivery === "uncertain") return { ...receipt, state: "indeterminate", stage: "settled", outcome: "delivery_uncertain", effects: { ...receipt.effects, message: "unknown" } };
      if (!receipt.message?.writeStartedAt) return { ...receipt, state: "failed", stage: "settled", outcome: "not_sent", ...(receipt.message ? { message: { ...receipt.message, delivery: "not_sent" } } : {}), effects: { ...receipt.effects, message: "not_sent" } };
      // Never repeat external input after a controller crash. Full replay happens once the journal exists.
      return { ...receipt, state: receipt.message.resultAt ? "completed" : "indeterminate", stage: "settled", outcome: receipt.message.resultAt ? "message_received" : "delivery_uncertain", message: { ...receipt.message, delivery: receipt.message.resultAt ? "received" : "uncertain" }, effects: { ...receipt.effects, message: receipt.message.resultAt ? "received" : "unknown" } };
    }
    if (receipt.instruction.action === "cancel-take-over" && validLiveTarget(receipt.instruction.inputs.target)) {
      // Startup settles an unsettled cancel before admitting other live actions (Kiln Pause Now, "Restart").
      const target = receipt.instruction.inputs.target; const takeoverId = receipt.instruction.inputs.takeover_instruction_id;
      const session = this.sessionRecord(target.activityKey, target.sessionId);
      const run = session?.runs.find((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session!, i)) === target.attemptId);
      const saved = this.record.liveControl?.takeover;
      const holdsIt = !!saved && saved.kind !== "delivery_recovery" && saved.instructionId === takeoverId && sameLiveTarget(saved.target, target);
      const settle = (withdrawn: boolean): Receipt => ({ ...receipt, state: withdrawn ? "completed" : "failed", stage: "settled", outcome: withdrawn ? "takeover_withdrawn" : "not_applied", reason: withdrawn ? null : ALREADY_PAUSED, effects: { ...receipt.effects, ...(withdrawn ? { takeover: "withdrawn" as const } : {}) } });
      let gateHolds = false;
      if (run?.live) { try { gateHolds = readGate(run.live.gateDirectory).held?.instructionId === takeoverId; } catch { gateHolds = true; } }
      if (run?.live) {
        if (gateHolds) return settle(false);
        if (holdsIt) this.restoreAfterCancel(saved);
        return settle(true);
      }
      if (!holdsIt) return settle(true);
      if (run && !run.endedAt) { this.restoreAfterCancel(saved); return settle(true); }
      return settle(false);
    }
    if (receipt.instruction.action === "take-over" && validLiveTarget(receipt.instruction.inputs.target)) {
      const target = receipt.instruction.inputs.target;
      const session = this.sessionRecord(target.activityKey, target.sessionId);
      const run = session?.runs.find((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session!, i)) === target.attemptId);
      const held = run?.live ? readGate(run.live.gateDirectory).held : undefined;
      const saved = this.record.liveControl?.takeover;
      if (held?.operationId === receipt.id || saved?.operationId === receipt.id || receipt.effects.takeover === "requested") {
        if (!saved) this.record.liveControl = { version: 1, revision: 1, takeover: { target, operationId: receipt.id, instructionId: receipt.command_id, requestedAt: held?.requestedAt ?? receipt.accepted_at, state: "pending", observedAt: this.now().toISOString(), reason: "Reconciling the recovered attempt." } };
        return { ...receipt, state: "completed", stage: "settled", outcome: "takeover_requested", effects: { ...receipt.effects, takeover: "requested" } };
      }
    }
    const persisted = readJson<PrdRecord>(join(this.stateDirectory, "prd.json"));
    if (!persisted || receipt.execution_id !== persisted.executionId) return undefined;
    // Feedback saved before a crash settles as sent; it is never added twice.
    if (receipt.instruction.action === "feedback" && persisted.requirements?.feedback.some(message => message.operationId === receipt.id)) return { ...receipt, state: "completed", stage: "settled", outcome: "feedback_sent" };
    const completed = Object.values(persisted.phases).find(f => f.completedByOperation === receipt.id);
    // A Mark complete that crashed after its record write settles with its real outcome.
    if (completed && receipt.instruction.action === "waive-and-advance") return { ...receipt, state: "completed", stage: "settled", outcome: completed.waiverId ? "marked_complete" : "checks_passed", effects: { ...receipt.effects, plan: "advanced" } };
    if (completed) return { ...receipt, state: "completed", stage: "settled", outcome: "advanced", effects: { ...receipt.effects, plan: "advanced" } };
    if (persisted.controlApplied?.operationId === receipt.id) {
      const outcome = persisted.controlApplied.outcome;
      return { ...receipt, ...(persisted.controlApplied.settings ? { settings: persisted.controlApplied.settings } : {}), state: "completed", stage: "settled", outcome, effects: { ...receipt.effects, ...(["advanced", "marked_complete", "continued", "checks_passed", "located_phase_starting"].includes(outcome) ? { plan: "advanced" as const } : {}), ...(outcome === "session_resumed" ? { session: "resumed" as const } : {}), ...(outcome === "session_started" ? { session: "started" as const } : {}) } };
    }
    // Mark complete saves its waiver, completion and outcome in one write; with none of them saved and
    // the stop still in place, an interrupted one applied nothing and settles so control is released.
    if (receipt.instruction.action === "waive-and-advance" && receipt.stage === "applying" && !persisted.waivers?.some(w => w.operationId === receipt.id)) {
      return { ...receipt, state: "failed", stage: "settled", outcome: "not_applied", reason: "Mark complete was interrupted before anything was saved. Check again, then choose again.", effects: { ...receipt.effects, plan: "not_advanced" } };
    }
    // Check again never directly dispatches a session. A verification interrupted
    // before settlement can fail honestly without retaining control forever.
    // Proven completion above wins; unknown plan effects are retained, not undone.
    // A starting receipt found still applying with no run started nothing (The Preflight Stop).
    if (receipt.starts_session && receipt.stage === "applying" && !receipt.session_id) return { ...receipt, state: "failed", stage: "settled", outcome: "dispatch_not_started", effects: { ...receipt.effects, session: "not_started" } };
    if (receipt.instruction.action === "check-again" && !receipt.starts_session && receipt.stage === "applying" && receipt.effects.session === "not_started" && receipt.effects.reply === "not_applicable") {
      return { ...receipt, state: "failed", stage: "settled", outcome: "check_interrupted", reason: "The completion check was interrupted before its result was settled. Request a fresh check against the current work." };
    }
    if (receipt.phase_key && receipt.session_id) {
      const session = this.sessionRecord(receipt.phase_key, receipt.session_id);
      const run = session?.runs.find(r => r.control?.operationId === receipt.id);
      if (run && (run.spawnError && !run.pid || session?.agentId === "codex" && codexNotDispatched(run))) return { ...receipt, state: "failed", stage: "settled", outcome: "dispatch_not_started", effects: { ...receipt.effects, session: "not_started", reply: receipt.reply_text === null ? "not_applicable" : "not_sent" } };
      const starting = isStartingReceipt(receipt);
      if (session && run && (run.control?.delivered || run.control?.submitted && receipt.reply_text === null && (session.agentId === "codex" ? run.codex?.turnId : runReportedInit(this.stateDirectory, session, session.runs.indexOf(run))))) return { ...receipt, state: "completed", stage: "settled", outcome: starting ? "session_started" : "session_resumed", effects: { ...receipt.effects, session: starting ? "started" : "resumed", reply: receipt.reply_text === null ? "not_applicable" : "delivered" } };
      // A carry-on or start-again whose run ended without beginning a conversation started nothing.
      if (starting && session && run?.endedAt && !(session.agentId === "codex" ? run.codex?.turnId : runReportedInit(this.stateDirectory, session, session.runs.indexOf(run)))) return { ...receipt, state: "failed", stage: "settled", outcome: "dispatch_not_started", effects: { ...receipt.effects, session: "not_started" } };
    }
    // Dispatch is saved as dispatching before spawn; completion is stamped in
    // its atomic record write. After ruling out both above, applying proves
    // only saved reviews, which survive without replaying this hand-back.
    if (["resume", "verify-and-advance", "reply", "waive-and-advance"].includes(receipt.instruction.action) && receipt.stage === "applying" && Array.isArray(receipt.instruction.inputs.reviewed_receipt_ids) && receipt.instruction.inputs.reviewed_receipt_ids.length && receipt.effects.session === "not_started" && receipt.effects.plan !== "advanced") {
      return { ...receipt, state: "failed", stage: "settled", outcome: "hand_back_not_started", reason: "Saved message acknowledgements are retained. No dispatch or completion was recorded; submit a new explicit hand-back after reviewing any remaining messages.", effects: { ...receipt.effects, session: "not_started", plan: "not_advanced" } };
    }
    return undefined;
  }

  private async applyControl(action: JournalAction, inputs: Record<string, unknown>, receipt: Receipt) {
    // Reset judges nothing and launches nothing, so no folder check runs before it (run restart "Availability").
    if (action === "reset") return this.applyReset(receipt);
    // Neither does Exit Kiln, which changes nothing but its receipt (Kiln After Delivery AC-EXIT-02).
    if (action === "exit") return this.applyExit(inputs);
    // Commands that judge or start work rerun the folder check first; the live and settings controls
    // only refuse while the mode is set (The Folder Check). Kiln's own resume at the end of a usage
    // wait is checked in its wait check, before the completion check (recheckWait).
    if (FOLDER_CHECKED_ACTIONS.has(action) && receipt.source === "automatic") {
      if (this.folderMissing) return { ok: false, code: "folder_missing", reason: FOLDER_MISSING_REASON, status: 409 };
    } else if (FOLDER_CHECKED_ACTIONS.has(action)) {
      const refused = await this.folderRefusal();
      if (refused) return refused;
    } else if (this.folderMissing && action !== "folder-setup-start" && !action.startsWith("continuation-")) return { ok: false, code: "folder_missing", reason: FOLDER_MISSING_REASON, status: 409 };
    if (action === "merge") return this.applyMerge(inputs, receipt);
    if (action === "continuation-grant") return this.grantContinuationTarget(inputs, receipt);
    if (action === "continuation-accept") return this.acceptContinuation(inputs, receipt);
    if (action === "continuation-retry") return this.retryContinuation(inputs);
    if (action === "folder-setup-start") return this.applyFolderStart(inputs, receipt);
    if (action === "cancel-take-over") return this.cancelTakeover(inputs.target, inputs.takeover_instruction_id, receipt);
    let answer: CommandResult;
    const target = this.phaseRecoveryTarget();
    const priorKey = this.stoppedPhaseKey() ?? this.waitingPhaseKey();
    const priorDone = priorKey ? this.record.phases[priorKey]?.doneAt : undefined;
    if (["reply", "resume", "verify-and-advance", "waive-and-advance", "carry-on"].includes(action) && Array.isArray(inputs.reviewed_receipt_ids) && inputs.reviewed_receipt_ids.length) { const review = this.reviewMessages(inputs.live_target, inputs.reviewed_receipt_ids); if (!review.ok) return review; }
    // The four session-starting commands catch an untouched branch up unless told to leave it (run restart AC-CURRENT-01).
    if (["reply", "resume", "carry-on", "start-again"].includes(action) && receipt.source !== "automatic") {
      this.catchUpRequest = { mode: inputs.leave_branch === true ? "leave" : inputs.bring_up_to_date === true ? "ticked" : "if_qualifies", moved: [] };
      receipt.branch_catch_up = this.catchUpRequest.moved;
    } else this.catchUpRequest = undefined;
    switch (action) {
      case "message": return this.acceptLiveMessage(inputs.target, inputs.text, receipt);
      case "message-review": return this.reviewMessages(inputs.target, inputs.receipt_ids);
      case "take-over": return this.acceptTakeover(inputs.target, receipt);
      case "model": answer = await this.changeModel(typeof inputs.phase === "string" ? { phase: inputs.phase } : "audits", inputs.use_default === true ? "default" : { agentId: inputs.agent_id as AgentId, model: inputs.model as string, ...(typeof inputs.effort === "string" ? { effort: inputs.effort } : {}) });
        break;
      case "request-pause": answer = this.pause(); break;
      case "cancel-pause": answer = this.cancelPause(); break;
      case "settings": {
        const loops = { ...(typeof inputs.delivery_audit_loops === "number" ? { deliveryLimit: inputs.delivery_audit_loops } : {}), ...(typeof inputs.test_audit_loops === "number" ? { testLimit: inputs.test_audit_loops } : {}) } as Partial<AuditLoopSettings>;
        answer = await this.changeSettings({ ...(typeof inputs.keep_awake === "boolean" ? { keepAwake: inputs.keep_awake } : {}), ...(typeof inputs.resume_after_usage_limit === "boolean" ? { resumeAfterUsageLimit: inputs.resume_after_usage_limit } : {}), ...(typeof inputs.wait_at_early_review === "boolean" ? { waitAtEarlyReview: inputs.wait_at_early_review } : {}) }, Object.keys(loops).length ? loops : undefined);
        // A limit below its floor says which, as the page's field error does (AC-CHOICE-02).
        if (!answer.ok && answer.fieldErrors) return { ok: false, code: "invalid_input", reason: Object.values(answer.fieldErrors).join(" ") };
        break;
      }
      // Removed with the loop stop; a saved instruction of either is never applied again (AC-STOP-04).
      case "allow-more-loops": case "accept-and-deliver": return { ok: false, code: "removed_command", reason: REMOVED_LOOP_COMMAND };
      case "outside-confirmation": answer = refuse("Workspace confirmations have been retired; recheck the remaining completion requirements."); break;
      case "start-build": answer = await this.startRequirementsBuild(inputs.refinement_confirmed === true); break;
      case "feedback": {
        const sent = await this.addFeedback(inputs.text, inputs.stop_again === true, receipt.id);
        if (!sent.ok) return sent;
        this.record.controlApplied = { operationId: receipt.id, outcome: sent.outcome }; this.save();
        return sent;
      }
      case "continue": answer = this.reviewStop === "early" ? await this.leaveRequirementsReview(false) : await this.start(); break;
      case "check-again":
        if (this.preflightStopKey() !== undefined) {
          // Check Preflight again starts a session: a starting receipt, recorded before any dispatch (The Preflight Stop).
          receipt.starts_session = true;
          this.commands.checkpoint(receipt);
          return this.dispatchStarting(receipt, () => this.checkAgain());
        }
        // A check that could not read its evidence reports why (check_unavailable), never a lost interruption.
        try { answer = await this.checkAgain(); }
        catch (error) { if (!(error instanceof CompletionCheckUnavailable)) throw error; return { ok: false, code: "check_unavailable", reason: error.message, status: 503 }; }
        break;
      case "verify-and-advance": answer = await this.checkAgain({ target, intent: "advance" }); break;
      case "waive-and-advance": return this.markComplete(inputs, receipt);
      case "locate-repository": {
        const located = await this.locateAtStop(String(inputs.repository), String(inputs.folder));
        if (!located.ok) return located;
        this.record.controlApplied = { operationId: receipt.id, outcome: located.outcome }; this.save();
        return located;
      }
      case "carry-on": case "start-again":
        return this.dispatchStarting(receipt, () => action === "carry-on" ? this.carryOn({ ...(target ? { target } : {}), ...(typeof inputs.message === "string" ? { note: inputs.message } : {}) }) : this.startAgain());
      case "reply": case "resume":
        this.controlDispatch = receipt;
        answer = receipt.source === "automatic" ? (await this.resumeWait(this.waitingPhaseKey()!, "limit_resume") === "folder_missing" ? { ok: false, code: "folder_missing", reason: FOLDER_MISSING_REASON, status: 409 } : { ok: true }) : await this.resume({ ...(target ? { target } : {}), ...(action === "reply" ? { note: inputs.message } : {}) });
        if (answer.ok && priorKey && !priorDone && this.record.phases[priorKey]?.doneAt) { this.controlDispatch = undefined; receipt.effects.plan = "advanced"; return { ok: true, outcome: isAfterDeliveryKey(priorKey) ? "already_done" : "advanced" }; }
        if (answer.ok && answer.noteSkipped) { this.controlDispatch = undefined; receipt.effects.plan = "advanced"; return { ok: true, outcome: "advanced_reply_not_sent" }; }
        if (answer.ok && answer.outcome === "advanced") { this.controlDispatch = undefined; receipt.effects.plan = "advanced"; return { ok: true, outcome: "advanced" }; }
        if (answer.ok && answer.outcome !== "already_complete") {
          // Let the one accepted dispatch run; its ownership persists through asynchronous preflight.
          this.controlKickPending = false; this.kick();
          while (this.controlDispatch === receipt && (this.driving || this.checking)) await new Promise(resolve => setTimeout(resolve, 20));
          if (receipt.outcome === "phase_already_complete") { this.controlDispatch = undefined; return { ok: true, outcome: "phase_already_complete" }; }
          if (this.controlDispatch === receipt) { this.controlDispatch = undefined; return { ok: false, code: "dispatch_not_started", reason: "The existing launch checks did not start a session. Inspect status for recovery." }; }
          if (receipt.effects.session === "unknown") throw new Error("Dispatch outcome is uncertain.");
          if (receipt.outcome === "phase_already_complete") return { ok: true, outcome: "phase_already_complete" };
          if (receipt.effects.session !== "resumed") return { ok: false, code: receipt.outcome ?? "dispatch_not_started", reason: receipt.reason ?? "The provider did not start the recorded attempt. Inspect the current recovery state." };
        } else this.controlDispatch = undefined;
        break;
    }
    if (!answer.ok) return answer;
    const outcome = action === "check-again" && isAfterDeliveryKey(priorKey) && !priorDone && this.record.phases[priorKey!]?.doneAt ? "already_done" : answer.outcome === "already_complete" ? "phase_already_complete" : answer.outcome === "still_stopped" ? "completion_checks_failed" : answer.outcome === "advanced" ? "advanced" : action === "reply" || action === "resume" ? "session_resumed" : "completed";
    if (action === "settings") receipt.settings = this.runtimeControlSettings();
    this.record.controlApplied = { operationId: receipt.id, outcome, ...(receipt.settings ? { settings: receipt.settings } : {}) }; this.save();
    return { ok: true, outcome };
  }

  /**
   * A command that starts a new session (carry-on, start-again, Check Preflight again): settles
   * `session_started` once the new session's prompt is submitted and it reports its start.
   */
  private async dispatchStarting(receipt: Receipt, request: () => Promise<CommandResult>) {
    this.controlDispatch = receipt;
    const answer = await request();
    if (answer.ok && answer.outcome === "already_complete") { this.controlDispatch = undefined; return { ok: true, outcome: "phase_already_complete" }; }
    if (!answer.ok) { this.controlDispatch = undefined; return answer; }
    this.controlKickPending = false; this.kick();
    while (this.controlDispatch === receipt && (this.driving || this.checking)) await new Promise(resolve => setTimeout(resolve, 20));
    if (this.controlDispatch === receipt) { this.controlDispatch = undefined; return { ok: false, code: receipt.outcome ?? "dispatch_not_started", reason: receipt.reason ?? "The existing launch checks did not start a session. Inspect status for recovery." }; }
    if (receipt.effects.session === "unknown") throw new Error("Dispatch outcome is uncertain.");
    if (receipt.effects.session !== "started") return { ok: false, code: receipt.outcome ?? "dispatch_not_started", reason: receipt.reason ?? "The new session did not start. Inspect the current recovery state." };
    this.record.controlApplied = { operationId: receipt.id, outcome: "session_started" }; this.save();
    return { ok: true, outcome: "session_started" };
  }

  private legacyAttempt(session: SessionRecord, index: number): string {
    return createHash("sha256").update(`${this.record.executionId}:${session.sessionId}:${index}`).digest("hex");
  }

  messageReceipts(target?: LiveTarget): Receipt[] {
    return this.commands.all().filter(r => r.message && (!target || sameLiveTarget(r.live_target, target)));
  }

  private projectMessage(r: Receipt, event: Record<string, unknown>, at: string): void {
    if (!r.message?.writeStartedAt || event.session_id !== r.live_target?.providerSessionId || !consumedUuids(event).includes(r.message.uuid)) return;
    const m = r.message;
    const uuids = consumedUuids(event);
    m.evidence ??= [];
    if (!m.evidence.some(e => e.result === (event.type === "result"))) m.evidence.push({ uuids, at, result: event.type === "result", ...(typeof event.uuid === "string" ? { eventUuid: event.uuid } : {}) });
    m.receivedAt ??= at;
    if (event.type === "result") m.resultAt ??= at;
    // Evidence arriving late is retained; explicit recovery still owns an uncertain receipt.
    if (m.delivery !== "uncertain") { m.delivery = "received"; r.effects.message = "received"; }
  }

  private holdMessage(r: Receipt): void {
    if (!r.live_target || r.execution_id !== this.record.executionId) return;
    const m = r.message!;
    m.delivery = "uncertain"; r.state = "indeterminate"; r.outcome = "delivery_uncertain"; r.effects.message = "unknown";
    r.reason = "Delivery uncertain. Review this exact message in the conversation; it will never be resent automatically.";
    this.record.liveControl ??= { version: 1, revision: 1, takeover: { kind: "delivery_recovery", target: r.live_target, operationId: r.id, instructionId: r.command_id, requestedAt: r.accepted_at, state: "pending", observedAt: this.now().toISOString(), reason: "Message delivery is uncertain. Review the conversation before explicit hand-back; wait for safe release before opening Claude." } };
    this.save();
  }

  private recoverLiveMessages(): void {
    const messages = this.messageReceipts().filter(r => r.live_target && r.execution_id === this.record.executionId && r.message!.writeStartedAt && !r.message!.resolvedBy);
    const targets = new Map(messages.map(r => [JSON.stringify(r.live_target), r.live_target!]));
    // Replay the attempt ledger through the same identity/order validation as live
    // callbacks, including contradictions naming an already-accounted receipt.
    for (const target of targets.values()) {
      // Reconstruct first-consumption chronology from the event stream, never
      // from receipt fields that may already contain later results after a crash.
      const consumed = new Set<string>();
      const session = this.sessionRecord(target.activityKey, target.sessionId);
      const index = session?.runs.findIndex((run, i) => (run.control?.attemptId ?? this.legacyAttempt(session!, i)) === target.attemptId);
      if (session && index !== undefined && index >= 0) for (const saved of eventsOfRun(this.stateDirectory, session, index)) this.observeLiveMessage(target, saved.event, saved.at, consumed);
    }
    for (const r of messages) {
      if (!r.message!.resultAt || r.message!.delivery === "uncertain") this.holdMessage(r);
      else { r.message!.delivery = "received"; r.effects.message = "received"; r.state = "completed"; }
      this.commands.checkpoint(r);
    }
  }

  private observeLiveMessage(target: LiveTarget, event: Record<string, unknown>, at: string, consumedBefore?: Set<string>): void {
    const messages = this.messageReceipts(target).filter(r => !r.message!.resolvedBy);
    const consumed = consumedBefore ?? new Set(messages.filter(r => r.message!.receivedAt).map(r => r.message!.uuid));
    const observed = consumedUuids(event).filter(uuid => messages.some(r => r.message!.uuid === uuid));
    const accepted = messages.filter(r => observed.includes(r.message!.uuid)).map(r => r.message!.uuid);
    const skipped = messages.filter((r, i) => r.message!.writeStartedAt && !consumed.has(r.message!.uuid) && !observed.includes(r.message!.uuid) && messages.slice(i + 1).some(later => observed.includes(later.message!.uuid)));
    if (JSON.stringify(observed) !== JSON.stringify(accepted) || observed.length && event.session_id !== target.providerSessionId) {
      for (const r of messages.filter(r => observed.includes(r.message!.uuid))) { this.holdMessage(r); this.commands.checkpoint(r); }
      return;
    }
    if (skipped.length) for (const r of messages.filter(r => skipped.includes(r) || observed.includes(r.message!.uuid))) { this.holdMessage(r); this.commands.checkpoint(r); }
    for (const r of messages) {
      if (!consumedUuids(event).includes(r.message!.uuid)) continue;
      this.projectMessage(r, event, at); this.commands.checkpoint(r);
      if (r.message!.writeStartedAt && event.session_id === target.providerSessionId) consumed.add(r.message!.uuid);
    }
    this.changed();
  }

  /**
   * Live message recognition: a receipt field in another form turns Message Claude off for the
   * rest of the attempt and writes its notice, so later attempts on this Claude Code version
   * start without it. A message awaiting its receipt shows Delivery uncertain and stops holding
   * the attempt's input open. Returns whether receipts can still be read from this event.
   */
  private async observeMessageContract(session: SessionRecord, live: LiveRunFacts, event: Record<string, unknown>): Promise<boolean> {
    if (live.messageContract === "unrecognised") return false;
    const problem = messageContractProblem(event);
    if (!problem) return true;
    live.messageContract = "unrecognised";
    writeNotice(this.record, liveNotice(live, "live_messages", problem, this.now().toISOString()));
    const target = readGate(live.gateDirectory).target;
    for (const r of this.messageReceipts(target)) if (r.message!.writeStartedAt && !r.message!.resultAt && !r.message!.resolvedBy) { this.holdMessage(r); this.commands.checkpoint(r); }
    // Recorded in the gate too, so admission refuses under the same lock that accounts the inputs.
    await withGate(live.gateDirectory, gate => {
      gate.messageContract ??= { state: "unrecognised", detail: problem, at: this.now().toISOString() };
      for (const input of Object.values(gate.inputs ?? {})) input.terminal = true;
    });
    writeSessionRecord(this.stateDirectory, session);
    this.save(); this.changed();
    return false;
  }

  /**
   * Takeover hook recognition: the checkpoint hook records input it didn't recognise in the
   * gate. That turns Pause & take over off for the rest of the attempt and writes its notice; an
   * accepted takeover keeps its hold and waits for the attempt to end.
   */
  private observeHookContract(session: SessionRecord, live: LiveRunFacts): void {
    if (live.hookContract === "unrecognised") return;
    let contract: GateState["contract"];
    try { contract = readGate(live.gateDirectory).contract; } catch { return; }
    if (!contract) return;
    live.hookContract = "unrecognised";
    writeNotice(this.record, liveNotice(live, "takeover", contract.detail, contract.at));
    writeSessionRecord(this.stateDirectory, session);
    this.save(); this.changed();
  }

  /**
   * After a restart no launching controller observes the attempt, so its checkpoint hook's
   * `gate.contract` is read here, whether the process still runs or has exited (Compatibility
   * notices row): the notice reaches the record before any later attempt launches.
   */
  private observeSavedHookContract(session: SessionRecord | undefined): void {
    const live = session?.runs.at(-1)?.live;
    if (session && live) this.observeHookContract(session, live);
  }

  /** Live launch arguments: Claude Code exited at launch naming one; both live features are off for this version. */
  private recordRejectedLiveArgument(live: LiveRunFacts, argument: string): void {
    const observedAt = this.now().toISOString();
    for (const feature of ["live_messages", "takeover"] as const) writeNotice(this.record, liveNotice(live, feature, `${argument} was rejected at launch`, observedAt));
    this.save(); this.changed();
  }

  /** While a takeover is held on an attempt whose hook contract became unrecognised: the safe checkpoint can't be used. */
  private checkpointUnavailable(hold: TakeoverHold): string | undefined {
    if (hold.kind === "delivery_recovery" || hold.state !== "pending") return undefined;
    const run = this.sessionRecord(hold.target.activityKey, hold.target.sessionId)?.runs.find(r => r.live?.attemptId === hold.target.attemptId);
    if (!run?.live) return undefined;
    let detail: string | undefined;
    try { detail = readGate(run.live.gateDirectory).contract?.detail; } catch { /* the saved contract decides */ }
    if (!detail && run.live.hookContract !== "unrecognised") return undefined;
    return `${this.takeoverNotice(run.live, detail)} The safe checkpoint can't be used, so Kiln is waiting for this attempt and its processes to end.`;
  }

  private takeoverNotice(live: LiveRunFacts, detail: string | undefined): string {
    return detail ? `${noticeText(liveNotice(live, "takeover", detail, ""))}.` : liveNoticeReason(this.record, "takeover") ?? "Pause now is unavailable for this attempt.";
  }

  private endLiveMessages(target: LiveTarget): void {
    for (const r of this.messageReceipts(target)) if (r.message!.writeStartedAt && !r.message!.resultAt) {
      this.holdMessage(r); this.commands.checkpoint(r);
    }
    if (this.record.liveControl) this.watchTakeover();
  }

  private async acceptLiveMessage(raw: unknown, text: unknown, receipt: Receipt) {
    const fail = (code: string, reason: string) => { receipt.message!.delivery = "not_sent"; receipt.effects.message = "not_sent"; return { ok: false, code, reason }; };
    if (this.requirementsOpen) return fail("input_unavailable", "During the requirements a message is feedback: send it with kiln feedback or the feedback box.");
    if (!validLiveTarget(raw) || !sameLiveTarget(raw, this.liveTarget())) return fail("stale_target", "This attempt ended or changed; the message was not sent.");
    if (messageProblem(text)) return fail("invalid_request", messageProblem(text)!);
    const run = this.latestSession(raw.activityKey)?.runs.at(-1);
    if (!run?.live?.literalInput || run.live.messageContract === "unrecognised" || !this.control?.sendMessage || !this.control.inputOpen?.() || !!this.record.liveControl || !this.current?.processRunning) return fail("input_unavailable", "This attempt no longer accepts live input. Your text was not sent.");
    const control = this.control;
    let admitted = false;
    let writing: Promise<"written" | "uncertain"> | undefined;
    try { await withGate(run.live.gateDirectory, gate => {
      if (gate.sealed || gate.held || gate.messageContract || this.record.liveControl || !sameLiveTarget(raw, this.liveTarget()) || !control.inputOpen?.()) return;
      const inputs = gate.inputs ??= {};
      if (Object.values(inputs).filter(i => !i.terminal).length >= 32) return;
      receipt.live_target = raw;
      receipt.message!.writeStartedAt = this.now().toISOString();
      receipt.effects.message = "unknown";
      this.commands.checkpoint(receipt); // fsync before any bytes can be supplied to stdin.
      inputs[receipt.message!.uuid] = { terminal: false };
      delete gate.turnEndedAt; // Newly admitted input starts a turn (Kiln Pause Now, background row).
      writeDurableMetadata(join(run.live!.gateDirectory, "gate.json"), gate);
      admitted = true;
      writing = control.sendMessage!(text as string, receipt.message!.uuid);
    }); } catch (error) {
      if (!receipt.message!.writeStartedAt) return fail("state_unavailable", `Message admission failed before writing: ${(error as Error).message}`);
      this.holdMessage(receipt); this.commands.checkpoint(receipt); this.watchTakeover();
      return { ok: true, outcome: "delivery_uncertain" };
    }
    if (!admitted) return fail("busy", "Input admission closed or reached 32 unsettled messages. Nothing was sent.");
    const outcome = await writing!;
    receipt.message!.writeSettledAt = this.now().toISOString();
    if (outcome === "uncertain") { this.holdMessage(receipt); this.watchTakeover(); }
    else {
      receipt.message!.writeCompletedAt = receipt.message!.writeSettledAt;
      if (receipt.message!.delivery === "submitting") { receipt.message!.delivery = "submitted"; receipt.effects.message = "submitted"; }
    }
    this.commands.checkpoint(receipt); this.changed();
    return { ok: true, outcome: outcome === "uncertain" ? "delivery_uncertain" : "message_submitted" };
  }

  reviewMessages(raw: unknown, ids: unknown) {
    const hold = this.record.liveControl?.takeover;
    if (!validLiveTarget(raw) || !sameLiveTarget(hold?.target, raw) || !Array.isArray(ids) || !ids.length) return { ok: false, code: "stale_target", reason: "Review belongs to another held conversation." };
    const receipts = this.messageReceipts(raw);
    const selected = ids.map(id => receipts.find(r => r.id === id || r.command_id === id));
    if (selected.some(r => !r || r.message?.delivery !== "uncertain")) return { ok: false, code: "invalid_request", reason: "A selected receipt is not an uncertain message for this attempt." };
    for (const r of selected) { r!.message!.reviewedAt ??= this.now().toISOString(); this.commands.checkpoint(r!); }
    this.changed();
    return { ok: true, outcome: "message_reviewed" };
  }

  liveTarget(): LiveTarget | undefined {
    if (this.record.liveControl) return this.record.liveControl.takeover.target;
    const current = this.current;
    const session = current?.session;
    // Final delivery and the preflight have no live controls (build preflight "The Preflight Stop").
    if (!current?.processRunning || !session || session.agentId !== "claude_code" || session.kind === "pull_request" || session.kind === "preflight" || session.kind === "merge" || session.kind === "plan_push") return undefined;
    const activity = activityHistory(this.record, this.stateDirectory).findLast(a => a.key === current.phaseKey);
    if (!activity || session.executionId !== this.record.executionId) return undefined;
    const run = session.runs.at(-1); if (!run || run.endedAt) return undefined;
    return { executionId: this.record.executionId!, activityId: activity.activityId, activityKey: current.phaseKey, sessionId: session.sessionId, providerSessionId: session.sessionId, attemptId: run.control?.attemptId ?? this.legacyAttempt(session, session.runs.length - 1) };
  }

  liveView(): LiveView | undefined {
    const target = this.liveTarget(); if (!target) return undefined;
    const audit = this.auditActivity(target.activityKey);
    const label = activityKeyKind(target.activityKey) === "requirements" ? this.titleOf(target.activityKey) : audit ? auditSentenceStart(recordedAuditName(this.record, audit)) : `Phase ${target.activityKey}`;
    const hold = this.record.liveControl?.takeover;
    const run = this.latestSession(target.activityKey)?.runs.at(-1);
    const capable = process.platform === "darwin" && (!!run?.live || this.recoveredLive);
    // An attempt launched without live control because its Claude Code version was unreadable shows that notice.
    const unreadVersion = (feature: "live_messages" | "takeover") => !run?.live && this.record.compatibility?.some(one => one.feature === feature && one.agentVersion === "unrecognised" && one.attemptId === target.attemptId) ? liveNoticeReason(this.record, feature) : undefined;
    const messages = this.messageReceipts(target);
    let sealed = true; let gate: GateState | undefined;
    try { gate = run?.live ? readGate(run.live.gateDirectory) : undefined; sealed = !gate || !!gate.sealed; } catch { /* unknown input is unavailable */ }
    // Each contract Kiln stops recognising turns its feature off for the attempt (AC-AGENT-04).
    const messageOff = run?.live?.messageContract === "unrecognised";
    const hookOff = !!run?.live && (run.live.hookContract === "unrecognised" || !!gate?.contract);
    const pending = messages.filter(r => r.message?.writeStartedAt && !r.message.resultAt).length;
    const uncertain = messages.some(r => r.message?.delivery === "uncertain");
    const submitting = messages.some(r => r.message?.delivery === "submitting");
    const inputAvailable = !submitting && !!run?.live?.literalInput && !messageOff && !!this.control?.inputOpen?.() && !hold && !sealed && pending < 32;
    // Until a carry-on's run ends the hold, the hold is the live target and the new attempt is starting (AC-CARRY-06).
    const starting = !!hold && this.returningTakeover && !!this.current?.processRunning;
    // While a launch from the paused page is starting, no Pause now state is projected (Kiln Pause Now, "The Pause Now State").
    const pauseNow = hold && hold.kind !== "delivery_recovery" && !starting ? this.pauseNowView(hold, label) : undefined;
    const inputReason = starting ? "The new session is starting." : this.recoveredLive ? "Input connection lost. Your unsent draft is retained; use Pause now to recover." : hold ? uncertain || hold.kind === "delivery_recovery" ? "Delivery uncertain. Review the message in the conversation before handing back." : "Pause now is pausing or has paused this activity." : pending >= 32 ? `Busy: ${pending} accepted messages await terminal results (limit 32).` : messageOff ? liveNoticeReason(this.record, "live_messages") ?? "Message Claude is unavailable for this attempt." : !run?.live?.literalInput ? unreadVersion("live_messages") ?? "Live messages need a supported Claude Code on macOS." : !inputAvailable ? "This attempt is starting, submitting, or no longer accepting input." : "Claude reads this at its next opportunity. The current tool may finish first.";
    return { target, label, observedAt: this.now().toISOString(), input: { available: inputAvailable && !this.requirementsOpen, reason: this.requirementsOpen ? "Send feedback instead: Kiln delivers it to this session or applies it in a fresh one." : inputReason, pending }, messages: messages.slice(-50).map(r => ({ id: r.id, instructionId: r.command_id, acceptedAt: r.accepted_at, delivery: r.message!.delivery, ...(r.message!.reviewedAt ? { reviewedAt: r.message!.reviewedAt } : {}) })), reviewRequired: messages.filter(r => r.message?.delivery === "uncertain" && !r.message.reviewedAt).map(r => r.id), available: !starting && !submitting && capable && !hookOff && (!hold || hold.kind === "delivery_recovery") && !!this.current?.processRunning, reason: (starting ? "The new session is starting." : undefined) ?? (hold && this.checkpointUnavailable(hold)) ?? hold?.reason ?? (!capable ? unreadVersion("takeover") ?? "Pause now needs a supported Claude Code on macOS. Pause after the current activity remains available." : hookOff ? this.takeoverNotice(run!.live!, gate?.contract?.detail) : this.recoveredLive ? GATELESS_PAUSE_REASON : "Finish the current operation, then stop before starting more work."), ...(hold ? { takeover: hold } : {}), ...(pauseNow ? { pauseNow } : {}) };
  }

  /** The Pause now state (Kiln Pause Now technical design, "The Pause Now State"): one projection every surface reads. */
  private pauseNowView(hold: TakeoverHold, label: string): PauseNowView {
    const session = this.sessionRecord(hold.target.activityKey, hold.target.sessionId);
    const runIndex = session ? session.runs.findIndex((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session, i)) === hold.target.attemptId) : -1;
    const run = runIndex >= 0 ? session!.runs[runIndex] : undefined;
    const attempt = this.current?.session?.runs.at(-1);
    const processRunning = !!this.current?.processRunning && this.current.session?.sessionId === hold.target.sessionId && !!attempt && (attempt.control?.attemptId ?? this.legacyAttempt(this.current.session!, this.current.session!.runs.length - 1)) === hold.target.attemptId;
    let gate: GateState | undefined;
    try { gate = run?.live ? readGate(run.live.gateDirectory) : undefined; } catch { /* an unreadable gate shows through the hold's obstacle */ }
    const gateStop = gate?.stop?.operationId === hold.operationId ? gate.stop : undefined;
    const ended = !processRunning;
    const stopped = !!gateStop || ended;
    const phase = hold.releasedAt !== undefined ? "paused" : "pausing";
    const running = gate ? runningOperations(gate) : [];
    const processes = this.pauseNowProcesses?.operationId === hold.operationId ? this.pauseNowProcesses.entries : [];
    // Kind 1 while Claude runs; once its process has exited and Kiln's last observation finished, kind 2 (processes still alive).
    const background = !gate ? [] : processRunning ? backgroundedWork(gate, stopped) : processes;
    const lastCommand = gate ? lastCommandOf(gate) : undefined;
    if (phase === "paused" && this.pauseNowSaid?.operationId !== hold.operationId && session && runIndex >= 0) {
      let text: string | undefined;
      try { text = lastSaidOf(eventsOfRun(this.stateDirectory, session, runIndex), gateStop); } catch { text = undefined; }
      this.pauseNowSaid = { operationId: hold.operationId, text };
    }
    const lastSaid = this.pauseNowSaid?.operationId === hold.operationId ? this.pauseNowSaid.text : undefined;
    const waited = hold.latestActivityAt ? Math.floor((Date.parse(hold.observedAt) - Date.parse(hold.latestActivityAt)) / 1000) : undefined;
    const cancelAvailable = phase === "pausing" && !stopped && !this.commands?.busy;
    const cancelReason = stopped ? "Claude has stopped, so the pause can no longer be cancelled. Press Resume once it’s paused to carry on." : phase === "paused" ? ALREADY_PAUSED : "Kiln is checking, dispatching or reconciling an instruction.";
    // Named as the running header names it: the leaf a split phase is working on, an audit with its loop (AC-PAUSE-03, Kiln After Delivery AC-AUDIT-01).
    const audit = activityKeyKind(hold.target.activityKey) === "audit";
    const activityKey = audit ? hold.target.activityKey : this.judgedId(hold.target.activityKey);
    return {
      phase, activityKey, label: audit ? label.toLowerCase() : `phase ${activityKey}`, requestedAt: hold.requestedAt, ...(hold.releasedAt !== undefined ? { releasedAt: hold.releasedAt } : {}),
      stopped, running: processRunning ? running : [], ...(background.length ? { background } : {}), ...(lastCommand ? { lastCommand } : {}), ...(lastSaid ? { lastSaid } : {}),
      ...(phase === "pausing" && waited !== undefined && waited >= 30 ? { waitingSeconds: waited } : {}), ...(hold.obstacle ? { obstacle: hold.obstacle } : {}),
      cancel: cancelAvailable ? { available: true } : { available: false, reason: cancelReason }, ...(run && !run.live ? { gateless: true } : {}),
    };
  }

  private async acceptTakeover(raw: unknown, receipt: Receipt) {
    if (!validLiveTarget(raw) || !sameLiveTarget(raw, this.liveTarget()) || this.record.liveControl?.takeover.kind !== "delivery_recovery" && !!this.record.liveControl || !this.current?.processRunning || !this.liveView()?.available) return { ok: false, code: "stale_target", reason: "This attempt ended or changed. Refresh the active session." };
    const session = this.latestSession(raw.activityKey)!; const run = session.runs.at(-1)!;
    const held = { operationId: receipt.id, instructionId: receipt.command_id, requestedAt: this.now().toISOString() };
    const persist = () => {
      receipt.live_target = raw; receipt.effects.takeover = "requested"; this.commands.checkpoint(receipt);
      this.record.liveControl = { version: 1, revision: 1, takeover: { ...held, target: raw, state: "pending", observedAt: this.now().toISOString(), reason: "Pause now is pausing — finishing the current operation." } };
      this.save();
    };
    if (run.live) await withGate(run.live.gateDirectory, state => {
      if (!sameLiveTarget(state.target, raw) || !sameLiveTarget(raw, this.liveTarget()) || !this.current?.processRunning) throw new Error("Attempt ended before Pause now was admitted.");
      // What can still finish after the press: the operations admitted and unsettled now (Kiln Pause Now, "lastCommand").
      state.held = { ...held, inFlight: Object.entries(state.operations).filter(([, o]) => !o.settled).map(([id]) => id) };
      writeDurableMetadata(join(run.live!.gateDirectory, "gate.json"), state);
      persist();
    });
    else persist(); // Legacy attempts wait naturally; never signal or invent a checkpoint.
    this.unwatchWait(); this.watchTakeover(); this.changed();
    return { ok: true, outcome: "takeover_requested" };
  }

  /**
   * Cancel pause and keep going (Kiln Pause Now, "Cancel"): withdraws a Pause now hold before its
   * stop. Inside the gate critical section, in one synchronous step: recheck the stop and that the
   * attempt still runs, remove the gate's hold, then replace the saved hold with the delivery
   * recovery its uncertain messages need, or nothing. Nothing is sent to the session.
   */
  private async cancelTakeover(raw: unknown, takeoverId: unknown, receipt: Receipt) {
    const hold = this.record.liveControl?.takeover;
    if (!validLiveTarget(raw) || !hold || hold.kind === "delivery_recovery" || !sameLiveTarget(hold.target, raw) || hold.instructionId !== takeoverId) return { ok: false, code: "stale_target", reason: "This pause ended or changed. Refresh the active session." };
    const alreadyPaused = { ok: false, code: "already_paused", reason: ALREADY_PAUSED };
    const session = this.sessionRecord(raw.activityKey, raw.sessionId);
    const run = session?.runs.find((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session!, i)) === raw.attemptId);
    const running = () => !!this.current?.processRunning && this.current.session?.sessionId === raw.sessionId && !run?.endedAt && sameLiveTarget(this.liveTarget(), raw);
    const withdraw = () => {
      receipt.live_target = raw; receipt.effects.takeover = "withdrawn"; this.commands.checkpoint(receipt);
      this.restoreAfterCancel(hold);
    };
    let refused = false;
    if (run?.live) {
      await withGate(run.live.gateDirectory, state => {
        if (state.stop?.operationId === hold.operationId || state.held?.operationId !== hold.operationId || !running()) { refused = true; return; }
        delete state.held;
        // The gate's hold goes first: a crash before the record write leaves a hold no hook honors, which startup finishes removing.
        writeDurableMetadata(join(run.live!.gateDirectory, "gate.json"), state);
        withdraw();
      });
    } else if (!running()) refused = true;
    else withdraw(); // An attempt without a gate has no gate hold; its only stop is its end.
    if (refused) return alreadyPaused;
    this.pauseNowProcesses = undefined; this.pauseNowSaid = undefined;
    this.changed();
    return { ok: true, outcome: "takeover_withdrawn" };
  }

  /** Step 2 of Cancel: the saved hold becomes the delivery recovery re-derived from unresolved uncertain receipts on the attempt, or nothing. */
  private restoreAfterCancel(hold: TakeoverHold): void {
    if (this.record.liveControl?.takeover.operationId === hold.operationId) delete this.record.liveControl;
    // Startup reconciliation runs before the journal is assigned, so it reads the same receipts directly.
    const receipts = this.commands ? this.commands.all() : readReceipts(this.stateDirectory);
    for (const r of receipts) if (r.message && sameLiveTarget(r.live_target, hold.target) && r.message.delivery === "uncertain" && !r.message.resolvedBy) this.holdMessage(r);
    this.save();
  }

  private async observeRecoveredLive(): Promise<void> {
    if (!this.recoveredLive || !this.current?.session) return;
    const session = this.current.session; const key = this.current.phaseKey;
    const run = session.runs.at(-1)!;
    this.observeSavedHookContract(session);
    try { await requireExited(run); }
    catch { this.changed(); return; }
    // This is an observed exit, never a success or activity completion.
    run.endedAt ??= this.now().toISOString();
    writeSessionRecord(this.stateDirectory, session);
    this.current = undefined; this.recoveredLive = false;
    clearInterval(this.recoveredTimer); this.recoveredTimer = undefined;
    this.recordStop(key, "done_check", [{ name: "Recovered conversation", passed: false, facts: ["The prior process ended after input ownership was lost. Review the saved conversation before resuming or verifying."] }]);
    if (this.record.liveControl) await this.reconcileTakeover();
  }

  private watchTakeover(): void {
    if (this.takeoverTimer || this.closed) return;
    this.takeoverTimer = setInterval(() => { void this.reconcileTakeover(); }, 1000);
    this.takeoverTimer.unref();
  }

  reconcileTakeover(): Promise<void> {
    if (this.takeoverReading) return this.takeoverReading;
    const reading = this.reconcileTakeoverOnce().finally(() => { if (this.takeoverReading === reading) this.takeoverReading = undefined; });
    this.takeoverReading = reading; return reading;
  }

  private async reconcileTakeoverOnce(): Promise<void> {
    if (!this.record.liveControl) return;
    const hold = this.record.liveControl.takeover;
    const operationId = hold.operationId;
    // A reading applies its results only while the saved hold is still the one it started with: Cancel never waits for it (Kiln Pause Now, "Cancel").
    const sameHold = () => this.record.liveControl?.takeover.operationId === operationId;
    const pauseNow = hold.kind !== "delivery_recovery";
    // A Resume or carry-on launched from the paused page is starting: its own `claude --resume` is not a terminal in use.
    const launching = () => this.returningTakeover && !!this.current?.processRunning;
    let releaseEvidence: { directory: string; state: string } | undefined;
    let gateless = false; let exited = false;
    const firstRelease = pauseNow && hold.releasedAt === undefined;
    try {
      const session = this.sessionRecord(hold.target.activityKey, hold.target.sessionId);
      const run = session?.runs.find((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session!, i)) === hold.target.attemptId);
      if (!session || !run) throw new OwnershipError("ownership_unknown", "The paused attempt's saved record is unavailable.");
      gateless = !run.live;
      const latestActivityAt = run.live ? readGate(run.live.gateDirectory).observedAt : runLastOutputAt(this.stateDirectory, session, session.runs.indexOf(run));
      if (latestActivityAt) hold.latestActivityAt = latestActivityAt;
      await requireExited(run);
      exited = true;
      // OS exit precedes adapter finalization, which awaits the last descendant
      // scan and saved-event callbacks. No readiness may race those writers.
      const running = this.current?.session; const attempt = running?.runs.at(-1);
      if (this.current?.processRunning && running?.sessionId === hold.target.sessionId && attempt && (attempt.control?.attemptId ?? this.legacyAttempt(running, running.runs.length - 1)) === hold.target.attemptId) throw new OwnershipError("takeover_pending", "Waiting for final attempt and tracked-process observations to finish.");
      // The background-process lookup runs first, because the release checks stop at the first unmet condition (Kiln Pause Now, "The Pause Now State").
      if (pauseNow && run.live) {
        const alive = await aliveTrackedProcesses(readGate(run.live.gateDirectory).tracked).catch(() => undefined);
        if (alive && sameHold()) this.pauseNowProcesses = { operationId, entries: alive };
      }
      // A pending hold whose saved conversation can't be reopened ends by a carry-on (run restart AC-CARRY-06):
      // release stops here, and the carry-on ownership check runs in its place.
      if (!this.returningTakeover) {
        const check = claudeReopenCheck(this.environment, this.stateDirectory, session, true);
        if (check.state === "unavailable") {
          const first = !hold.history;
          hold.history = check;
          try { await this.carryOnOwnership(hold, run); delete hold.carryOnObstacle; }
          catch (error) { hold.carryOnObstacle = (error as Error).message; }
          hold.state = "pending";
          if (pauseNow && sameHold()) { hold.releasedAt ??= this.now().toISOString(); delete hold.obstacle; }
          hold.reason = "Kiln can't reopen the saved conversation history. Carry on in a new session, or start a fresh session in your terminal.";
          if (first) void this.refreshStoppedWork(hold.target.activityKey);
          return;
        }
        if (hold.history) { delete hold.history; delete hold.carryOnObstacle; }
      }
      requireHistory(this.environment, hold.target.providerSessionId);
      if (run.live) {
        if (run.live.gateDirectory !== gateDirectory(this.stateDirectory, hold.target.attemptId)) throw new OwnershipError("ownership_unknown", "Attempt gate path does not match its saved identity.");
        if (resolve(run.live.configRoot) !== resolve(claudeConfigFolder(this.environment))) throw new OwnershipError("ownership_unknown", "The Claude configuration root changed; restore the attempt profile before hand-back.");
        // Rebuild the projection after a crash between event append and gate update.
        for (const saved of eventsOfRun(this.stateDirectory, session, session.runs.indexOf(run))) await observeGate(run.live.gateDirectory, saved.event, saved.at);
        const transcript = findTranscripts(run.live.configRoot, session.sessionId).main;
        if (transcript) {
          const history = readTranscriptRecords<Record<string, unknown>>(transcript);
          if (history.problem) throw new OwnershipError("history_unavailable", `Saved conversation history is unreadable: ${history.problem}. Restore its history and retry release checks.`);
          for (const row of history.records) {
            if (row.type === "user") await observeGate(run.live.gateDirectory, { ...row, tool_use_result: row.toolUseResult ?? row.tool_use_result }, typeof row.timestamp === "string" ? row.timestamp : undefined);
          }
          const read = readTranscript(transcript);
          if (read.problem) throw new Error(read.problem);
          await withGate(run.live.gateDirectory, state => {
            for (const call of read.calls) {
              const operation = call.id ? state.operations[call.id] : undefined;
              if (operation?.hookSettled && operation.name !== "Agent" && operation.name !== "Task" && call.result) operation.settled = true;
            }
          });
        }
        let gate = readGate(run.live.gateDirectory);
        hold.latestActivityAt = gate.observedAt;
        if (!sameLiveTarget(gate.target, hold.target) || hold.kind !== "delivery_recovery" && gate.held?.operationId !== hold.operationId) throw new Error("Durable checkpoint hold cannot be established.");
        if (gate.obstacle || gate.processObservations?.length) {
          await captureOwnedProcesses(run.live.gateDirectory, run.pid!, run.processStartTime!);
          gate = readGate(run.live.gateDirectory);
        }
        const pending = unsettled(gate);
        if (pending.length) throw new OwnershipError("takeover_pending", `Waiting for completed-operation evidence: ${pending.join(", ")}.`);
        for (const identity of gate.tracked) await requireExited({ pid: identity.pid, processStartTime: identity.startTime });
        releaseEvidence = { directory: run.live.gateDirectory, state: JSON.stringify(gate) };
      }
      await requireNoTerminal(this.environment, hold.target.providerSessionId);
      requireHistory(this.environment, hold.target.providerSessionId);
      if (releaseEvidence && JSON.stringify(readGate(releaseEvidence.directory)) !== releaseEvidence.state) throw new OwnershipError("takeover_pending", "Tracked-process release evidence changed during ownership checks; retry reconciliation.");
      hold.state = "released"; hold.reason = hold.kind === "delivery_recovery" ? "Conversation released. Review uncertain messages before explicit Resume or Verify." : "Paused.";
      if (pauseNow && sameHold()) { hold.releasedAt ??= this.now().toISOString(); delete hold.obstacle; }
    } catch (error) {
      hold.state = "pending";
      if (!launching()) {
        // A concrete error beats the checkpoint-unavailable text, so a checkpoint problem never hides `terminal_in_use`.
        const code = error instanceof OwnershipError ? error.code : "state_unavailable";
        const concrete = code !== "takeover_pending" ? (error as Error).message : undefined;
        const checkpoint = this.checkpointUnavailable(hold);
        hold.reason = concrete ?? checkpoint ?? (error as Error).message;
        if (pauseNow && sameHold()) {
          const unestablished = hold.releasedAt === undefined ? checkpoint ?? (gateless && !exited ? GATELESS_PAUSE_REASON : undefined) : undefined;
          if (concrete) hold.obstacle = { code, reason: concrete };
          else if (unestablished) hold.obstacle = { code: "control_unavailable", reason: unestablished };
          else delete hold.obstacle;
        }
      }
    }
    finally {
      hold.observedAt = this.now().toISOString();
      let newStop = false;
      if (sameHold() && !this.current?.processRunning && this.launchClearedStop !== hold.target.activityKey) {
        const facts = this.record.phases[hold.target.activityKey]!;
        newStop = facts.stop === undefined;
        facts.stop ??= { kind: "done_check", at: hold.requestedAt, checkedAt: hold.observedAt, checks: [] };
      }
      this.save();
      // A session's requests are asked about on the stop the hold ends at, as on any stop (AC-ASK-07).
      if (newStop) void this.refreshRequestQuestions(hold.target.activityKey);
      // This runs every second while the hold lasts, so only the stop's creation prints (AC-START-09).
      // A Pause now prints once, when the pause completes, never at the process's exit (PAUSE-009).
      if (newStop && !pauseNow) this.emitSessionEvent(hold.target.activityKey, "stopped");
      if (firstRelease && sameHold() && hold.releasedAt !== undefined) this.emitSessionEvent(hold.target.activityKey, "paused");
      this.changed();
    }
  }

  /** Synchronous final guard: controller actions cannot interleave between this read and effect admission. */
  private takeoverLocalMaterial(key: string): string {
    const values = this.setUpRepositories.map(entry => [entry.name, ...[["status", "--porcelain=v1", "--untracked-files=all"], ["rev-parse", "HEAD"], ["branch", "--show-current"], ["diff", "HEAD", "--"]].map(args => execFileSync(this.options.tools.git, args, { cwd: expandHome(entry.worktreePath), env: this.options.env, encoding: "utf8", timeout: 5000 }))]);
    const audit = this.auditActivity(key);
    let report: string | undefined;
    if (audit) { try { report = readFileSync(join(this.worktreePath, audit.reportPath), "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
    return createHash("sha256").update(JSON.stringify([values, report])).digest("hex");
  }

  private async takeoverBecameComplete(key: string): Promise<boolean> {
    if (!this.record.liveControl) return false;
    const outcome = await this.doneCheck(key);
    if (outcome === "stopping" || outcome.unavailable) throw new CompletionCheckUnavailable("Could not recheck activity completion before dispatch.");
    if (!outcome.passed) return false;
    const facts = this.record.phases[key]!;
    facts.stop ??= { kind: "done_check", at: this.record.liveControl.takeover.requestedAt, checkedAt: this.now().toISOString(), checks: [] };
    this.updateStop(key, outcome.checks, true);
    if (this.controlDispatch) { this.controlDispatch.outcome = "phase_already_complete"; this.controlDispatch.effects.session = "not_started"; this.record.controlApplied = { operationId: this.controlDispatch.id, outcome: "phase_already_complete" }; }
    this.returningTakeover = false; this.checking = false; this.save();
    return true;
  }

  private async takeoverMaterial(key: string): Promise<string> {
    const repositories = [];
    for (const entry of this.setUpRepositories) {
      const read = await runGit(this.git, expandHome(entry.worktreePath), ["status", "--porcelain=v1", "--untracked-files=all"], 5000);
      const head = await runGit(this.git, expandHome(entry.worktreePath), ["rev-parse", "HEAD"], 5000);
      const branch = await runGit(this.git, expandHome(entry.worktreePath), ["branch", "--show-current"], 5000);
      const diff = await runGit(this.git, expandHome(entry.worktreePath), ["diff", "HEAD", "--"], 5000);
      const remote = await runGit(this.git, expandHome(entry.worktreePath), ["ls-remote", "--heads", "origin", `refs/heads/${this.record.settings.featureBranch}`], 5000);
      if ([read, head, branch, diff, remote].some(r => r.exitCode !== 0 || r.failure)) throw new CompletionCheckUnavailable("Cannot revalidate completion material.");
      repositories.push([entry.name, read.stdout, head.stdout, branch.stdout, diff.stdout, remote.stdout]);
    }
    const audit = this.auditActivity(key);
    let report: string | undefined;
    if (audit) { try { report = readFileSync(join(this.worktreePath, audit.reportPath), "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
    return createHash("sha256").update(JSON.stringify({ repositories, report, authorization: this.record.developmentAuthorization, settings: this.record.settings })).digest("hex");
  }

  private resolveMessageHold(): void {
    const target = this.record.liveControl?.takeover.target;
    const operation = this.controlDispatch ?? this.commands.active;
    if (!target) return;
    const operationId = operation?.id ?? randomUUID();
    for (const r of this.messageReceipts(target)) if (r.message?.delivery === "uncertain" && r.message.reviewedAt) { r.message.resolvedBy = operationId; this.commands.checkpoint(r); }
  }

  /**
   * The carry-on ownership check (run restart "A Held Phase That Can't Be Reopened"): the attempt's
   * process has exited with its final observations saved, a fresh inventory leaves no unresolved
   * process and every tracked identity has exited, and no terminal is open on the conversation.
   * It never replays the transcript or requires settled operations.
   */
  private async carryOnOwnership(hold: TakeoverHold, run: SessionRun): Promise<void> {
    await requireExited(run);
    const running = this.current?.session; const attempt = running?.runs.at(-1);
    if (this.current?.processRunning && running?.sessionId === hold.target.sessionId && attempt && (attempt.control?.attemptId ?? this.legacyAttempt(running, running.runs.length - 1)) === hold.target.attemptId) throw new OwnershipError("ownership_unknown", "Waiting for the paused session's final observations to be saved.");
    if (run.live) {
      try { await captureOwnedProcesses(run.live.gateDirectory, run.pid!, run.processStartTime!); }
      catch (error) { throw new OwnershipError("ownership_unknown", `Kiln couldn't read the paused session's processes: ${(error as Error).message}`); }
      const gate = readGate(run.live.gateDirectory);
      if (gate.obstacle || gate.processObservations?.length) throw new OwnershipError("ownership_unknown", "Work the paused session started may still be running. Kiln can't confirm it has ended.");
      for (const identity of gate.tracked) {
        try { await requireExited({ pid: identity.pid, processStartTime: identity.startTime }); }
        catch { throw new OwnershipError("ownership_unknown", "Work the paused session started is still running."); }
      }
    }
    try { await requireNoTerminal(this.environment, hold.target.providerSessionId); }
    catch (error) {
      if (error instanceof OwnershipError && error.code === "terminal_in_use") throw new OwnershipError("terminal_in_use", "Claude is open on this conversation in a terminal. Exit it first.");
      throw error instanceof OwnershipError ? new OwnershipError("ownership_unknown", error.message) : new OwnershipError("ownership_unknown", (error as Error).message);
    }
  }

  /** Before a carry-on from a hold, or its advance: every uncertain message acknowledged, and the carry-on ownership check passing now. */
  private async requireCarryOnOwnership(): Promise<void> {
    const hold = this.record.liveControl?.takeover;
    if (!hold) return;
    if (this.messageReceipts(hold.target).some(r => r.message?.delivery === "uncertain" && !r.message.reviewedAt)) throw new OwnershipError("message_review_required", "Acknowledge each message Kiln isn't sure was delivered before carrying on.");
    if (!hold.history) await this.reconcileTakeover();
    if (!hold.history) throw new OwnershipError("takeover_pending", hold.reason);
    const session = this.sessionRecord(hold.target.activityKey, hold.target.sessionId);
    const run = session?.runs.find((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session!, i)) === hold.target.attemptId);
    if (!session || !run) throw new OwnershipError("ownership_unknown", "The paused attempt's saved record is unavailable.");
    await this.carryOnOwnership(hold, run);
  }

  private async requireTakeoverReturn(): Promise<void> {
    const hold = this.record.liveControl?.takeover;
    if (!hold) return;
    if (this.messageReceipts(hold.target).some(r => r.message?.delivery === "uncertain" && !r.message.reviewedAt)) throw new OwnershipError("message_review_required", "Review each uncertain message in the conversation before Resume or Verify.");
    await this.reconcileTakeover();
    if (hold.state !== "released") throw new OwnershipError("takeover_pending", hold.reason);
    await requireNoTerminal(this.environment, hold.target.providerSessionId);
    requireHistory(this.environment, hold.target.providerSessionId);
  }


  /** One reader per agent (Kiln Phase Model Tiers, "Agents"). */
  readonly readers: Record<AgentId, AgentInfo>;
  /** Whether Codex is installed, read when Kiln starts and at each refresh. */
  codexInstalled: boolean;
  installedAgents(): AgentId[] { return AGENT_IDS.filter(id => id === "claude_code" ? this.claudeCodeInstalled : this.codexInstalled); }
  readonly billing: BillingAuthority;
  private billingLaunch: BillingSummary | undefined;
  get billingCwd(): string { return this.isUnderway ? this.sessionFolder : this.paths.mainCheckoutPath; }
  private get billingResumesConversation(): boolean {
    const key = this.stoppedPhaseKey();
    return this.record.billing?.hold?.action === "resume" || this.waitingPhaseKey() !== undefined || key !== undefined && this.resumeOffered(key);
  }
  private billingBusy(): boolean { return !!(this.settingUp || this.checking || this.driving || this.current?.processRunning || this.deliveryBusy || this.stopping); }
  refreshBilling(): Promise<unknown> {
    // Only Claude Code has a billing reading; while no activity or fallback needs it, it isn't refreshed (AC-AGENTS-02).
    if (!this.isNeeded("claude_code") || this.currentlyComplete) return Promise.resolve();
    return this.billing.refresh(this.billingCwd, this.sessionEnv());
  }
  async billingCommand(action: "approval" | "clear", body: Record<string, unknown>) {
    if (!this.isNeeded("claude_code")) throw new BillingError("invalid_request", "No activity of this run uses Claude Code, so it has no billing approval to give.", 400);
    try { return await this.billing.command(action, body, this.billingCwd, this.sessionEnv()); }
    finally { this.changed(); }
  }

  private readonly defaultsPath: string;
  /** Whether Claude Code is installed, read when Kiln starts and at each refresh (Kiln Phase Model Tiers, "Agents"). */
  claudeCodeInstalled: boolean;

  /** What every activity's choice is resolved against now (Kiln Phase Model Tiers, "Resolving a Choice"). */
  get modelContext(): ModelContext {
    const lists: Partial<Record<AgentId, ModelList>> = {};
    for (const id of AGENT_IDS) {
      const metadata = this.readers?.[id]?.state;
      if (!metadata) continue;
      lists[id] = !this.installed(id) ? { error: `${AGENT_NAMES[id]} isn't installed.` } : { models: metadata.models, error: metadata.modelListError, pending: metadata.pending && !metadata.models };
    }
    return {
      record: this.record, plan: this.shownPlan, defaultsPath: this.defaultsPath, claudeCodeInstalled: this.claudeCodeInstalled,
      lists,
      session: (key, id) => this.sessionRecord(key, id),
      firstResponse: (key, id) => this.sessionFirstResponse(key, id),
    };
  }

  /** The plan the rows show: the recorded plan once Start saved it, before that the one Documents found shows. */
  get shownPlan(): RecordedPlanPhase[] {
    const final = this.requirementsBuildPlan;
    if (final?.ok) return recordedPlan(final.plan);
    if (this.record.plan) return this.record.plan;
    const plan = this.startPreview?.from === "existing" ? this.startPreview.plan : this.options?.startPlan;
    return plan ? recordedPlan(plan) : [];
  }

  /** A phase's tag (AC-TIER-02). */
  tierOf(phaseId: string): TierView { return tierView(this.shownPlan.find(phase => phase.id === phaseId)); }

  /** The choice an activity with no start runs on now (AC-PICK-01, AC-OTHER-01, AC-DEFAULT-04). */
  notStartedChoice(key: string): ActivityChoice { return notStartedChoice(this.modelContext, key); }

  /** The activity's fallback, when its row has one on the other agent (AC-FALLBACK-02). */
  fallbackOf(key: string): ReturnType<typeof activityFallback> { return activityFallback(this.modelContext, key, this.notStartedChoice(key)); }

  /** A row's model (AC-PICK-02): what it will run on, runs on or ran on. */
  activityModel(key: string, state: { finished: boolean; liveSession?: SessionRecord | undefined; current?: boolean }): ModelView {
    // From the moment a launch saves its decision, the row shows the decided choice (Kiln Phase Model Tiers, "When an Activity Starts", the row table).
    const decided = this.decisions.get(key);
    if (decided && !state.finished && !state.liveSession && !this.startedSessionOf(key)) {
      const saved = decided.launch.fallback;
      return { state: "will_run_on", choice: choiceView(decided.choice), ...launchMarks(decided.launch, true), ...(saved && (saved.used || state.current) ? { fallback: fallbackView(saved, decided.launch.from) } : {}) };
    }
    return modelView(this.modelContext, key, state);
  }

  /**
   * The planned Preflight row on a finished run's Continue offer (Kiln Phase Model Tiers, "The
   * planned Preflight row"): the choice the continuation will resolve, so a kept choice equal to
   * Kiln's current default is dropped as the continuation drops it (AC-KEEP-02, KEEP-003).
   */
  continuationPreflightModel(): ModelView {
    const context = this.modelContext;
    const settings = { ...context.record.settings, modelChoices: continuedModelChoices(context.record.settings.modelChoices) };
    return modelView({ ...context, record: { ...context.record, settings } }, PLANNED_PREFLIGHT_KEY, { finished: false });
  }

  /**
   * A phase finished in an earlier execution (Kiln Phase Model Tiers, "A phase finished in an
   * earlier execution"): Ran on with the latest of its sessions in the retained executions that got
   * a response, else No model recorded, with the read's reason when an archive can't be read.
   * Each retained execution is read once per process and kept in memory; archives never change.
   */
  earlierExecutionModel(phaseId: string): ModelView {
    const executions = this.record.continuation?.executions ?? [];
    const key = executions.map(row => row.executionId).join(",");
    if (this.earlierModels?.key !== key) {
      const models = new Map<string, ModelView>();
      let unreadable = false;
      for (const summary of executions) {
        let archived: PrdRecord;
        try { archived = readExecution(this.stateDirectory, summary).record; } catch { unreadable = true; continue; }
        const plan = archived.plan ?? [];
        for (const phase of plan) {
          if (phase.splitInto !== undefined) continue;
          const entries = Object.entries(archived.phases).filter(([launched]) => judgedPhase(plan, launched)?.id === phase.id);
          // An earlier execution's sessions are read from its state directly: inspection's reader admits only this execution's.
          const sessions = entries.flatMap(([launched, facts]) => facts.sessionIds.map(id => { try { return readSessionRecord(this.stateDirectory, launched, id); } catch { return undefined; } })).filter((one): one is SessionRecord => !!one);
          for (const one of sessions) { const at = one.firstResponseAt ?? firstResponseInSavedEvents(this.stateDirectory, one); if (at) one.firstResponseAt = at; }
          const ran = sessions.filter(one => one.firstResponseAt).sort((a, b) => (a.runs.at(-1)?.startedAt ?? a.createdAt).localeCompare(b.runs.at(-1)?.startedAt ?? b.createdAt)).at(-1);
          // The session that started the activity the latest one belongs to gives its Fallback tag (AC-FALLBACK-03).
          const ranFacts = ran ? entries.find(([, facts]) => facts.sessionIds.includes(ran.sessionId))?.[1] : undefined;
          const own = sessions.filter(one => ranFacts?.sessionIds.includes(one.sessionId));
          const started = own.find(one => one.sessionId === ranFacts?.startedSessionId) ?? own.find(one => one.firstResponseAt);
          // A later execution's sessions decide over an earlier one's.
          if (ran) models.set(phase.id, ranOnView(ran, started));
          else if (!models.has(phase.id)) models.set(phase.id, { state: "none_recorded" });
        }
      }
      this.earlierModels = { key, models, unreadable };
    }
    return this.earlierModels.models.get(phaseId) ?? { state: "none_recorded", ...(this.earlierModels.unreadable ? { problem: "Historical execution is unavailable or damaged." } : {}) };
  }
  private earlierModels: { key: string; models: Map<string, ModelView>; unreadable: boolean } | undefined;

  /** The session that started the activity, once one got a response (AC-PICK-04). */
  startedSessionOf(key: string): SessionRecord | undefined { return startedSession(this.modelContext, key); }

  /**
   * The keys of every activity not yet finished that Kiln will run: each leaf phase not closed,
   * then the audits' choice, standing for the preflight, the audits and the pull request session
   * until the run completes.
   */
  private unfinishedChoiceKeys(): string[] {
    const plan = this.shownPlan;
    const keys = plan.filter(phase => phase.splitInto === undefined && !phaseFinished(this.record, phase, phase.id)).map(phase => phase.id);
    if (!this.record.completedAt) keys.push(PR_PHASE_KEY);
    return keys;
  }

  /** The agent an activity runs on: what it started on, else its current choice's. */
  agentOf(key: string): AgentId {
    return this.startedSessionOf(key)?.agentId ?? this.decisions.get(key)?.choice.agentId ?? this.notStartedChoice(key).agentId;
  }

  /** The agent of the Audits choice, which the preflight, the audits and the pull request session run on (AC-OTHER-01); their skills are looked up for it. */
  get auditsAgent(): AgentId { return this.notStartedChoice(PR_PHASE_KEY).agentId; }

  /**
   * What an activity's next session launches on (AC-PICK-01, AC-PICK-04): a started activity's
   * every later session runs on what it started on, Claude Code's concrete model ID from that
   * session's init included, so no newer version runs in its place; otherwise its current choice.
   */
  launchChoice(key: string): ModelChoice & { modelName: string } {
    const started = this.startedSessionOf(key);
    if (started) {
      const agentId = started.agentId ?? "claude_code";
      return { agentId, model: agentId === "claude_code" ? started.initModel ?? started.model : started.model, modelName: started.modelDisplayName, ...(started.effort ? { effort: started.effort } : {}) };
    }
    const decided = this.decisions.get(key);
    if (decided) return decided.choice;
    const choice = this.notStartedChoice(key);
    if (!choice.model || choice.problem) throw new Error(choiceStopFact(choice, key));
    return { agentId: choice.agentId, model: choice.model, modelName: choice.modelName, ...(choice.effort ? { effort: choice.effort } : {}) };
  }

  /** Each activity's launch decision, from its launch checks until its launch ends. */
  private readonly decisions = new Map<string, LaunchDecision>();

  /**
   * The launch decision (Kiln Phase Model Tiers AC-FALLBACK-02, "The launch decision"), for an
   * activity that hasn't started, run immediately before the existing launch checks. Undefined
   * when the first choice can't be used, known before launch: the `selection` stop that follows
   * applies, and the fallback never replaces it. With the switch off, or no fallback, the first
   * choice. Otherwise both agents' usage is read for this launch, and the fallback's launch checks
   * run only when a counted limit on the first choice's account reads at or above the threshold.
   * `endsWait`: an automatic launch ending a wait, bounded by the activity's one-attempt record.
   */
  private async decideLaunch(key: string, endsWait: boolean): Promise<LaunchDecision | undefined> {
    const first = this.notStartedChoice(key);
    if (!first.model || first.problem) return undefined;
    const firstChoice = toDecisionChoice(first);
    const base = { from: first.from, ...(first.claudeCodeMissing ? { claudeCodeMissing: true as const } : {}) };
    const settings = readModelDefaults(this.defaultsPath);
    const fallback = this.fallbackOf(key);
    if (!settings.ok || !settings.defaults.fallback.enabled || !fallback) return { choice: firstChoice, launch: base, read: false };
    const threshold = settings.defaults.fallback.threshold;
    const [firstAccount, fallbackAccount] = await Promise.all([this.readUsageForLaunch(first.agentId), this.readUsageForLaunch(fallback.agentId)]);
    const fallbackChoice = toDecisionChoice(fallback);
    const firstUsage = this.usageSide(key, firstChoice, firstAccount, endsWait);
    const fallbackUsage = this.usageSide(key, fallbackChoice, fallbackAccount, endsWait);
    let checks: { problem?: string; skill?: LaunchDecision["skill"] } = {};
    if (firstOverThreshold(firstUsage, threshold)) checks = await this.fallbackLaunchChecks(key, fallback, fallbackAccount, endsWait);
    const result = decideLaunch({ threshold, first: firstChoice, fallback: fallbackChoice, firstUsage, fallbackUsage, fallbackProblem: checks.problem });
    const launch = { ...base, ...(result.fallback ? { fallback: result.fallback } : {}) };
    if (result.on === "fallback") return { choice: fallbackChoice, launch, read: true, ...(checks.skill ? { skill: checks.skill } : {}) };
    return { choice: firstChoice, launch, read: true };
  }

  /**
   * Runs the launch decision for an activity that hasn't started, unless this launch already has
   * one: once its histories have been read, so a start found there binds instead ("When an
   * Activity Starts"), then saves it with the skill for the agent it named. Every launch path
   * reaches it: the loop's and a wait's launch checks, Start again, a carry-on and Check
   * Preflight again. False when the activity stopped or Kiln is stopping.
   */
  private async ensureDecision(key: string, endsWait: boolean): Promise<boolean> {
    if (this.decisions.has(key) || !this.choiceActivity(key) || this.startedSessionOf(key)) return !this.stopping;
    if (this.record.phases[key]?.sessionIds.length) {
      const start = await this.readStart(key);
      if (this.stopping) return false;
      if (start === "unknown") { this.stopOnUnknownStart(key); return false; }
      if (start === "started") return true;
    }
    const decided = await this.decideLaunch(key, endsWait);
    if (this.stopping) return false;
    if (!decided) return true;
    this.decisions.set(key, decided);
    this.changed();
    return this.skillForDecision(key, decided);
  }

  /** One agent's usage, read for this launch and awaited up to the existing reading limit; an earlier reading is never used. */
  private async readUsageForLaunch(agentId: AgentId): Promise<AgentAccount | undefined> {
    if (!this.installed(agentId)) return undefined;
    if (agentId === "codex") {
      const read = await raceTimeout(this.readers.codex.refresh([this.sessionFolder, ...this.sessionRepositories.map((entry) => expandHome(entry.worktreePath))]), RESUME_READING_MS);
      return read && !this.readers.codex.state.pending ? this.readers.codex.state.account : undefined;
    }
    const claude = this.claude;
    if (!claude) return undefined;
    // The model list is read again too, as every launch's checks read it (AC-WATCH-09).
    const [read] = await Promise.all([raceTimeout(claude.refreshAccount(), RESUME_READING_MS), this.readers.claude_code.refreshClaudeModels()]);
    return read && claude.account ? { ...claude.account, agentId: "claude_code" } : undefined;
  }

  /** One side of the decision; in a wait, a Codex choice whose one automatic attempt is used up counts as blocked. */
  private usageSide(key: string, choice: DecisionChoice, account: AgentAccount | undefined, endsWait: boolean): UsageSide {
    return { agentId: choice.agentId, model: choice.model, account, models: this.readers[choice.agentId]?.state.models, ...(endsWait && choice.agentId === "codex" && this.attemptUsed(key, choice, account) ? { attemptUsed: true } : {}) };
  }

  /** Whether the activity's one-attempt record has used up the automatic attempt for this Codex choice on this reading, read without changing the record. */
  private attemptUsed(key: string, choice: DecisionChoice, account: AgentAccount | undefined): boolean {
    const recovery = this.record.phases[key]?.codexUsageRecovery;
    const refused = this.refusedRun(key);
    if (!recovery || !refused || !account) return false;
    const release = activityUsageRelease(structuredClone(recovery), { model: choice.model, effort: choice.effort }, refused.refusal.at, account);
    return release.state === "blocked" && release.suppressed === true;
  }

  /**
   * The fallback's launch checks (technical design, "The fallback's launch checks"), read for
   * this launch: the agent is ready, its model list offers the model and effort, Claude Code's
   * billing approval is given, the activity's own skill resolves on that agent, Codex's launch
   * settings pass, and a prerequisite-preparation turn's permission read passes. The first that
   * fails is the reason the fallback wasn't used. `forecast`: the heads-up's run, which reads
   * nothing and leaves out the checks that need a launch.
   */
  private async fallbackLaunchChecks(key: string, fallback: ResolvedChoice, account: AgentAccount | undefined, endsWait: boolean): Promise<{ problem?: string; skill?: LaunchDecision["skill"] }> {
    const quick = this.fallbackReadyProblem(key, fallback, account, endsWait);
    if (quick !== undefined) return { problem: quick };
    const choice = toDecisionChoice(fallback);
    let skill: LaunchDecision["skill"];
    const skillOptions = { agent: fallback.agentId, claude: this.options.tools.claude, ...(this.options.tools.codex ? { codex: this.options.tools.codex } : {}), cwd: this.sessionFolder, env: this.options.env, signal: this.abort.signal };
    const audit = this.auditActivity(key);
    if (audit) {
      try { skill = await resolveAuditSkill({ ...skillOptions, kind: audit.kind }); }
      catch (error) { return { problem: (error as Error).message }; }
    } else if (isPreflightKey(key)) {
      const resolved = await resolveSkill({ ...skillOptions, name: PREFLIGHT_SKILL });
      if (resolved.kind !== "found") return { problem: resolved.message };
      skill = resolved.skill;
    }
    if (fallback.agentId === "codex") {
      try { await prepareCodexLaunch({ ...this.codexLaunchOptions(this.sessionFolder), choice }); }
      catch (error) { return { problem: (error as Error).message }; }
    }
    if (this.record.preparation?.phaseId === key) {
      try { await preparationPermissions({ ...this.preparationContext(), agentId: fallback.agentId }, true); }
      catch (error) { return { problem: (error as Error).message }; }
    }
    return skill ? { skill } : {};
  }

  /** The fallback's checks that need no launch: readiness, the model list, Claude Code's billing approval, and in a wait a Codex reading naming a stable account. */
  private fallbackReadyProblem(key: string, fallback: ResolvedChoice, account: AgentAccount | undefined, endsWait: boolean): string | undefined {
    const agent = this.agentProblem(fallback.agentId);
    if (agent) return agent;
    if (fallback.problem) return fallback.problem;
    const listError = this.readers[fallback.agentId].state.modelListError;
    if (listError) return listError;
    if (!fallback.model) return `${AGENT_NAMES[fallback.agentId]}'s model list doesn't offer ${fallback.modelName}.`;
    if (fallback.agentId === "claude_code") {
      const view = this.billing?.view;
      if (!view?.next || view.pending) return "Claude Code's billing setup hasn't been read yet.";
      const billing = this.billingNotApproved();
      if (billing) return billing;
    }
    // No attempt could be saved for a Codex fallback whose reading names no stable account (Kiln Phase Model Tiers, "A Wait Before the Start").
    if (endsWait && fallback.agentId === "codex" && !account?.accountId?.trim()) return "Codex's reading names no stable account, so no automatic attempt could be saved for it.";
    if (isPreflightKey(key) && !this.readers[fallback.agentId].state.optionalSkills?.buildPreflight && this.readers[fallback.agentId].state.optionalSkills) return `Enable exactly one ${PREFLIGHT_SKILL} skill for ${AGENT_NAMES[fallback.agentId]}.`;
    return undefined;
  }

  /**
   * The decision run against the latest scheduled readings, reading nothing, as the heads-up and
   * a wait's readings use it (AC-FALLBACK-04, "A Wait Before the Start"): the fallback it would
   * launch on, or undefined. It leaves out Codex's launch-settings check and the
   * preparation-permissions read, which need a launch.
   */
  private forecastDecision(key: string, endsWait: boolean): { choice: DecisionChoice; fallback: LaunchFallback } | undefined {
    const settings = readModelDefaults(this.defaultsPath);
    if (!settings.ok || !settings.defaults.fallback.enabled) return undefined;
    const first = this.notStartedChoice(key);
    if (!first.model || first.problem) return undefined;
    const fallback = this.fallbackOf(key);
    if (!fallback) return undefined;
    const threshold = settings.defaults.fallback.threshold;
    const latest = (agentId: AgentId): AgentAccount | undefined => {
      if (!this.installed(agentId)) return undefined;
      if (agentId === "codex") return this.readers.codex.state.account;
      return this.claude?.account ? { ...this.claude.account, agentId: "claude_code" } : undefined;
    };
    const firstChoice = toDecisionChoice(first);
    const fallbackChoice = toDecisionChoice(fallback);
    const firstUsage = this.usageSide(key, firstChoice, latest(first.agentId), endsWait);
    const fallbackUsage = this.usageSide(key, fallbackChoice, latest(fallback.agentId), endsWait);
    if (!firstOverThreshold(firstUsage, threshold)) return undefined;
    const result = decideLaunch({ threshold, first: firstChoice, fallback: fallbackChoice, firstUsage, fallbackUsage, fallbackProblem: this.fallbackReadyProblem(key, fallback, fallbackUsage.account, endsWait) });
    return result.on === "fallback" && result.fallback ? { choice: fallbackChoice, fallback: result.fallback } : undefined;
  }

  /**
   * The heads-up (AC-FALLBACK-04): the activity Kiln will launch next, when the decision on the
   * latest readings would launch it on the fallback. That is the current activity when it has no
   * start and no session of it is launching or running, otherwise the first activity after it with
   * no start. No row carries it while the start of the one Kiln would launch next is unknown.
   *
   *   engine.headsUp()  // { key: "2", forecast: { choice: { agent: "Codex", modelName: "GPT Astra 1", … }, limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95 } }
   */
  headsUp(): { key: string; forecast: NonNullable<ModelView["forecast"]> } | undefined {
    const settings = readModelDefaults(this.defaultsPath);
    if (!settings.ok || !settings.defaults.fallback.enabled || this.record.completedAt) return undefined;
    const keys = [...new Set(this.unfinishedActivityKeys().map(row => row.key))].filter(key => this.choiceActivity(key));
    const currentKey = this.current?.phaseKey ?? this.waitingPhaseKey() ?? this.stoppedPhaseKey();
    const from = currentKey === undefined ? 0 : Math.max(0, keys.indexOf(currentKey));
    for (const key of keys.slice(from)) {
      if (this.unknownStarts.has(key)) return undefined;
      if (this.startedSessionOf(key) || this.sessionBusy(key)) continue;
      const forecast = this.forecastDecision(key, this.record.phases[key]?.wait !== undefined);
      if (!forecast) return undefined;
      const { agentId, ...limit } = forecast.fallback.limit;
      return { key, forecast: { choice: choiceView(forecast.choice), limit: { agent: AGENT_NAMES[agentId], ...limit }, threshold: forecast.fallback.threshold } };
    }
    return undefined;
  }

  /** The fallback facts an activity's phase detail keeps (AC-FALLBACK-03): the decision of the session that started it, or of the latest session while none has. */
  detailsFallback(key: string): FallbackView | undefined {
    const session = this.startedSessionOf(key) ?? this.latestSession(key);
    const saved = session?.launch?.fallback;
    return saved ? fallbackView(saved, session!.launch!.from) : undefined;
  }

  /**
   * Every agent the run needs (Kiln Phase Model Tiers AC-AGENTS-01, "Agents"): each one an
   * unfinished activity runs on, by plan row, and with the fallback switch on each one only an
   * unfinished activity's fallback names. An agent that isn't installed is needed by the same rule.
   *
   *   engine.neededBy()  // { claude_code: { activities: ["Phase 1", "the pull request session"], fallbackOnly: false }, codex: { activities: [], fallbackOnly: true } }
   */
  neededBy(): Partial<Record<AgentId, AgentNeed>> {
    const needs: Partial<Record<AgentId, AgentNeed>> = {};
    const add = (agentId: AgentId, row?: string) => {
      const need = needs[agentId] ??= { activities: [], fallbackOnly: true };
      if (row !== undefined) { need.fallbackOnly = false; if (!need.activities.includes(row)) need.activities.push(row); }
    };
    const keys = this.unfinishedActivityKeys();
    for (const { key, row } of keys) add(this.agentOf(key), row);
    const read = readModelDefaults(this.defaultsPath);
    if (read.ok && read.defaults.fallback.enabled) {
      for (const { key } of keys) {
        if (this.startedSessionOf(key)) continue;
        const fallback = this.fallbackOf(key);
        if (fallback) add(fallback.agentId);
      }
    }
    return needs;
  }
  /** Each installed agent with its readiness, for the Model defaults page beside its model list ("Agents"). */
  modelDefaultsAgents(): { agentId: AgentId; installed: boolean; readinessKnown: boolean; readinessErrors?: string[] }[] {
    // Claude Code's readiness is read only while the run needs it; Codex's one metadata read always carries it.
    return this.installedAgents().map(agentId => { const blockers = this.readers[agentId].state.blockers; return { agentId, installed: true, readinessKnown: agentId === "codex" || this.isNeeded(agentId), ...(blockers.length ? { readinessErrors: blockers } : {}) }; });
  }

  /** Where Model defaults is kept, read on every resolution. */
  get modelDefaultsFile(): string { return this.defaultsPath; }

  /** The agent the current activity runs on, else the next activity's, which the account panel marks in use (AC-AGENTS-03). */
  inUseAgent(currentKey: string | undefined): AgentId | undefined {
    const key = (currentKey === undefined ? undefined : this.factsKeyOf(currentKey)) ?? this.current?.phaseKey ?? this.unfinishedActivityKeys()[0]?.key;
    return key === undefined ? undefined : this.agentOf(key);
  }

  /**
   * Agent information read again (`POST /api/metadata/refresh`, `kiln account --refresh`, which
   * then read billing): every installed agent's model list, and every needed agent's readiness,
   * account and usage.
   */
  async refreshAgents(): Promise<void> {
    this.claudeCodeInstalled = executableAvailable(this.options.tools.claude, this.options.env);
    this.codexInstalled = !!this.options.tools.codex && executableAvailable(this.options.tools.codex, this.options.env);
    this.startReaders();
    await Promise.all(this.installedAgents().map(id => this.isNeeded(id) ? this.readers[id].refresh() : this.readers[id].refreshModels()));
  }

  /** Puts each installed agent's reader on the existing schedule, once, including an agent installed after Kiln started. */
  private startReaders(): void {
    for (const id of this.installedAgents()) {
      if (this.scheduledReaders.has(id)) continue;
      this.scheduledReaders.add(id);
      // A needed agent's schedule starts with a full read, so it isn't read again as newly needed.
      if (this.isNeeded(id)) this.readAgents.add(id);
      this.readers[id].start(() => this.isNeeded(id));
    }
  }
  private readonly scheduledReaders = new Set<AgentId>();

  /** Stops every reader's schedule. */
  closeReaders(): void { for (const id of AGENT_IDS) this.readers[id].close(); }

  /** Whether the run needs the agent now: an unfinished activity or, with the switch on, a fallback names it. */
  isNeeded(agentId: AgentId): boolean { return this.neededBy()[agentId] !== undefined; }
  /** Whether the agent is installed, read when Kiln starts and at each refresh. */
  installed(agentId: AgentId): boolean { return agentId === "claude_code" ? this.claudeCodeInstalled : this.codexInstalled; }

  /**
   * Every activity not yet finished that Kiln will run, with the plan row Start's reason names it
   * by: the preflight while planned or allocated and unfinished, each leaf phase not finished,
   * each allocated audit not finished, then the audit kinds still expected and the pull request
   * session, which stand on the Audits choice until the pull request session finishes.
   */
  private unfinishedActivityKeys(): { key: string; row: string }[] {
    if (this.requirementsOpen) return this.isUnderway ? [{ key: this.current?.phaseKey ?? "req-next", row: "Requirements stages" }] : [{ key: "req-next", row: "Requirements stages" }, { key: "req-design", row: "Refining the design" }];
    const rows: { key: string; row: string }[] = [];
    const finished = (key: string) => !!this.record.phases[key]?.doneAt;
    const preflight = latestPreflight(this.record);
    if (preflight && !finished(preflightKeyOf(preflight))) rows.push({ key: preflightKeyOf(preflight), row: "the preflight" });
    else if (!this.record.completedAt && this.readers[this.auditsAgent].state.optionalSkills?.buildPreflight && (!this.isUnderway || this.record.preflight?.due)) rows.push({ key: PLANNED_PREFLIGHT_KEY, row: "the preflight" });
    for (const phase of this.shownPlan) {
      if (phase.splitInto !== undefined) continue;
      const key = this.factsKeyOf(phase.id);
      if (!phaseFinished(this.record, phase, key)) rows.push({ key, row: `Phase ${phase.id}` });
    }
    for (const activity of this.record.completionAudits?.activities ?? []) {
      const key = auditKey(activity);
      if (!finished(key)) rows.push({ key, row: `the ${auditLabel(activity.kind).toLowerCase()}` });
    }
    if (!this.record.completedAt) {
      const expected = this.isUnderway ? this.expectedAuditKinds() : ["delivery_audit", "test_audit"];
      const open = (kind: AuditActivity["kind"]) => (this.record.completionAudits?.activities ?? []).some(a => a.kind === kind && !finished(auditKey(a)));
      for (const kind of ["delivery_audit", "test_audit"] as const) if (expected.includes(kind) && !open(kind)) rows.push({ key: PLANNED_AUDITS_KEY, row: `the ${auditLabel(kind).toLowerCase()}` });
      rows.push({ key: PR_PHASE_KEY, row: "the pull request session" });
    }
    // An open merge or push after delivery runs its own session, on the agent it names.
    const afterDelivery = openAfterDeliveryKey(this.record);
    if (afterDelivery !== undefined) rows.push({ key: afterDelivery, row: afterDelivery === MERGE_KEY ? "the merge session" : "the push session" });
    return rows;
  }

  /**
   * The key that holds a plan row's facts. Kiln keys facts by the leaf it launched, so after a
   * session splits its phase the launched phase holds the facts its first child is shown with,
   * as the snapshot's rows read them ("Agents", AC-AGENTS-03).
   *
   *   engine.factsKeyOf("2a")  // "2", while Phase 2's session split it into 2a and 2b
   *   engine.factsKeyOf("3")   // "3"
   */
  factsKeyOf(rowId: string): string {
    if (this.record.phases[rowId]) return rowId;
    for (const key of Object.keys(this.record.phases)) {
      if (key !== PR_PHASE_KEY && !isPreflightKey(key) && this.judgedId(key) === rowId) return key;
    }
    return rowId;
  }

  /**
   * Why the agent keeps an activity on it from launching (AC-AGENTS-01, AC-AGENTS-02): still being
   * read, not installed, a readiness problem, or a missing Claude Code billing approval.
   */
  agentProblem(agentId: AgentId, ignorePending = false): string | undefined {
    if (!this.installed(agentId)) return installRemedy(agentId);
    const metadata = this.readers[agentId].state;
    if (metadata.pending && !ignorePending && !metadata.models) return `Reading ${AGENT_NAMES[agentId]} models and readiness…`;
    if (metadata.blockers.length) return metadata.blockers.join(" ");
    return undefined;
  }

  /** What Start's reason says about an agent an activity needs: the agent, what to do, and the activities that need it. */
  private neededAgentReason(agentId: AgentId, problem: string, need: AgentNeed): string {
    return `${AGENT_NAMES[agentId]} isn't ready: ${problem} Needed by ${listWords(need.activities)}.`;
  }

  /**
   * The warning for an agent only a fallback names that isn't ready (AC-AGENTS-01): Start stays
   * available, and the run waits at a usage limit as if the fallback were off.
   */
  fallbackWarning(): { agent: string; agentId: AgentId; problem: string; remedy: string } | undefined {
    for (const [agentId, need] of Object.entries(this.neededBy()) as [AgentId, AgentNeed][]) {
      if (!need.fallbackOnly) continue;
      const modelList = this.installed(agentId) ? this.readers[agentId].state.modelListError : undefined;
      const problem = this.agentProblem(agentId) ?? modelList ?? (agentId === "claude_code" ? this.billingNotApproved() : undefined);
      if (problem === undefined || problem.startsWith("Reading ")) continue;
      return { agent: AGENT_NAMES[agentId], agentId, problem, remedy: agentId === "claude_code" && problem === this.billingNotApproved() ? "Review and approve the Claude Code billing setup below." : this.installed(agentId) ? `Fix it in a terminal, then press Refresh agent information.` : `Install ${AGENT_NAMES[agentId]}, then press Refresh agent information.` };
    }
    return undefined;
  }

  /** The billing reason a launch on Claude Code would stop for, when one is due (Kiln Billing Safeguards). */
  private billingNotApproved(): string | undefined {
    const view = this.billing?.view;
    if (!view?.next || view.canLaunch || view.pending) return undefined;
    return view.next.readinessError ?? "Claude Code's billing setup isn't approved.";
  }

  /** Reads each needed agent again when the set of needed agents grows, and Claude Code's billing when it becomes needed. */
  private syncNeededAgents(): void {
    if (!this.readers || this.syncingAgent) return;
    this.syncingAgent = true;
    try {
      const needed = new Set(Object.keys(this.neededBy()) as AgentId[]);
      for (const id of this.installedAgents()) {
        if (needed.has(id) && !this.readAgents.has(id)) {
          void this.readers[id].refresh();
          if (id === "claude_code") void this.refreshBilling().catch(() => this.changed());
        }
      }
      this.readAgents = needed;
    } finally { this.syncingAgent = false; }
  }
  private readAgents = new Set<AgentId>();
  private syncingAgent = false;
  private defaultsWatch: FSWatcher | undefined;

  /**
   * Model defaults reach every activity that hasn't started, in runs underway too: each Kiln
   * watches the state root for the file's name, since an atomic write replaces the file, and
   * republishes its page (Kiln Phase Model Tiers, "Model defaults across running Kilns").
   */
  private watchModelDefaults(): void {
    try {
      mkdirSync(dirname(this.defaultsPath), { recursive: true });
      this.defaultsWatch = watch(dirname(this.defaultsPath), (_event, name) => {
        if (this.closed || name !== basename(this.defaultsPath)) return;
        this.modelChoicesChanged();
      });
      this.defaultsWatch.on("error", () => { this.defaultsWatch?.close(); this.defaultsWatch = undefined; });
      this.defaultsWatch.unref();
    } catch { this.defaultsWatch = undefined; }
  }

  /**
   * Saves the activity's start once one of its sessions got its first response (Kiln Phase Model
   * Tiers, "When an Activity Starts"): the first of its sessions, in the order they were created,
   * that has one. A saved start is only ever added.
   */
  private noteStart(key: string, session: SessionRecord): void {
    const facts = this.record.phases[key];
    if (!facts || facts.startedSessionId || !session.firstResponseAt) return;
    facts.startedSessionId = facts.sessionIds.find(id => id === session.sessionId || this.sessionFirstResponse(key, id)) ?? session.sessionId;
    // Once the activity starts, on either agent, its one-attempt record goes; a later refusal uses the started session's own.
    delete facts.codexUsageRecovery;
    this.save();
    // The terminal prints one line when an activity starts on the fallback (AC-FALLBACK-03).
    const started = this.sessionRecord(key, facts.startedSessionId);
    const fallback = started?.launch?.fallback;
    if (started && fallback?.used) this.emit({ kind: "message", text: fallbackStartLine(this.activityName(key), started, fallback) });
  }

  /** Whether a launch of the activity is under way or a process of its session runs, one Kiln launched or adopted. */
  sessionBusy(key: string): boolean {
    return this.launching.has(key) || this.decisions.has(key) || this.current?.phaseKey === key && this.current.processRunning;
  }

  /**
   * Why an activity's own choice can't be changed now (AC-PICK-03, "Change while a launch of the
   * activity is under way"): it is finished, has started, its start is unknown, or a launch of it
   * is under way or its session's process runs. Undefined when Change is available.
   */
  modelChangeRefusal(key: string, label: string): string | undefined {
    const plan = this.shownPlan.find(phase => phase.id === key);
    // A phase its session split is judged by the launched phase that holds its facts (AC-PICK-05).
    const facts = this.factsKeyOf(key);
    if (this.record.phases[facts]?.doneAt || plan && phaseFinished(this.record, plan, facts)) return `${label} is finished; there is nothing to change.`;
    if (this.startedSessionOf(facts)) return `${label} has started, so it keeps the agent, model and effort it started on.`;
    const unknown = this.unknownStarts.get(facts);
    if (unknown !== undefined) return `Kiln can't tell whether ${label.charAt(0).toLowerCase()}${label.slice(1)} has started, so its model can't be changed yet. ${unknown}`.trim();
    if (this.sessionBusy(facts)) return `${label} is launching or running on its saved choice. Change it once that session ends.`;
    return undefined;
  }

  /** What a row offers (AC-PICK-03, AC-OTHER-01): Change, and Use the default while its choice is Changed by you. */
  modelControls(key: string, label: string, view: ModelView): Pick<ModelView, "change" | "useDefault"> {
    if (view.state !== "will_run_on") return {};
    const reason = this.modelChangeRefusal(key, label);
    return { change: reason === undefined ? { available: true } : { available: false, reason }, ...(reason === undefined && view.from === "changed" ? { useDefault: true as const } : {}) };
  }

  /**
   * A change of model for one phase, or for this PRD's Audits activities (AC-PICK-03, AC-OTHER-01,
   * `POST /api/model`): the choice checked against its agent's list with its effort filled in, then
   * the phase's state, read after its sessions' histories. "default" returns the row to its tier's
   * choice, or the Audits row's. The Audits entry is never refused for an activity's state: an
   * activity launching or running keeps its saved decision and takes the new choice only if it
   * ends with no response.
   */
  checkModelChange(target: { phase: string } | "audits", choice: ModelChoice | "default"): { ok: true; key: string; choice: ModelChoice | "default" } | Extract<CommandResult, { ok: false }> {
    let key: string = PR_PHASE_KEY;
    if (target !== "audits") {
      const leaves = this.shownPlan.filter(phase => phase.splitInto === undefined);
      if (!leaves.some(phase => phase.id === target.phase)) return { ok: false, status: 422, reason: `${target.phase} isn't a phase Kiln builds in this plan. Phases: ${leaves.map(phase => phase.id).join(", ")}.` };
      key = target.phase;
    }
    if (choice === "default") return { ok: true, key, choice };
    const checked = checkModelChoice(choice, this.modelContext.lists);
    return checked.ok ? { ok: true, key, choice: checked.choice } : { ok: false, status: checked.status as 400 | 422, reason: checked.reason };
  }

  /** Applies a checked change (before Start directly, in a run through the instruction journal). */
  async changeModel(target: { phase: string } | "audits", choice: ModelChoice | "default"): Promise<CommandResult> {
    const checked = this.checkModelChange(target, choice);
    if (!checked.ok) return checked;
    const choices = this.record.settings.modelChoices;
    if (target !== "audits") {
      const label = `Phase ${target.phase}`;
      // Change reads the phase's histories first: a terminal that already answered has started it.
      if (!this.startedSessionOf(checked.key) && !this.sessionBusy(checked.key) && this.record.phases[checked.key]?.sessionIds.length) await this.readStart(checked.key);
      const refused = this.modelChangeRefusal(checked.key, label);
      if (refused) return { ok: false, status: 409, reason: refused };
      choices.phases[target.phase] = checked.choice;
    } else choices.audits = checked.choice;
    this.save();
    this.modelChoicesChanged();
    return { ok: true };
  }

  /**
   * Model defaults or this PRD's model choices changed: the run reads the agent its activities
   * now resolve to, and the page is republished (Kiln Phase Model Tiers AC-PICK-01).
   */
  modelChoicesChanged(): void {
    this.syncNeededAgents();
    this.changed();
  }

  /**
   * Why Start is unavailable for the models (AC-AGENTS-01, AC-PICK-06): an agent an activity will
   * run on isn't ready, naming the agent, what to do and the activities that need it; or an
   * activity's choice can't be used. An agent only a fallback names never blocks Start.
   */
  get modelsProblem(): string | undefined {
    for (const [agentId, need] of Object.entries(this.neededBy()) as [AgentId, AgentNeed][]) {
      if (need.fallbackOnly) continue;
      const problem = this.agentProblem(agentId);
      if (problem) return problem.startsWith("Reading ") ? problem : this.neededAgentReason(agentId, problem, need);
    }
    for (const { key } of this.unfinishedActivityKeys()) {
      if (this.startedSessionOf(key)) continue;
      const choice = this.notStartedChoice(key);
      if (choice.problem) return choiceStopFact(choice, key);
    }
    return undefined;
  }

  get claude(): ClaudeInfoSource | undefined {
    return this.readers.claude_code.claude;
  }

  /** The model list's entry for a model on an agent, when the list has loaded and offers it. */
  modelEntry(value: string, agentId: AgentId = "claude_code"): ModelEntry | undefined {
    return this.readers[agentId].state.models?.find((entry) => entry.value === value);
  }

  /** Every field message now: the last field check's, and Model's when its model can't run in auto mode. */
  get currentFieldErrors(): FieldErrors {
    const errors = { ...this.fieldErrors };
    const issue = this.isUnderway ? undefined : this.modelsProblem;
    if (issue) errors.model = issue;
    return errors;
  }

  /** Why nothing can launch now: the next activity's agent isn't ready, or its choice can't be used. */
  get selectionError(): string | undefined { return this.selectionIssue(undefined); }
  /**
   * Why an activity can't launch on its choice (AC-PICK-06, AC-AGENTS-04, "A choice that can't be
   * used, known before launch"): the agent it launches on isn't ready, or, for an activity with no
   * start, its choice names a model or effort its agent doesn't offer. A started activity skips the
   * model-list and effort checks, like a resume (AC-PICK-04). With no key, the activity Kiln launches next.
   */
  private selectionIssue(key: string | undefined, ignorePending = false): string | undefined {
    const target = key ?? this.current?.phaseKey ?? this.unfinishedActivityKeys()[0]?.key;
    const agentId = target === undefined ? (this.claudeCodeInstalled ? "claude_code" : "codex") : this.agentOf(target);
    const problem = this.agentProblem(agentId, ignorePending);
    if (problem) return problem;
    if (target === undefined || this.startedSessionOf(target)) return undefined;
    const choice = this.notStartedChoice(target);
    return choice.problem === undefined ? undefined : choiceStopFact(choice, target);
  }
  private modelsChanged(): void {
    if (this.observedClaude !== this.claude) {
      this.offUsage?.(); this.observedClaude = this.claude;
      this.offUsage = this.claude?.onChange(() => {
        if (this.claude?.account !== this.lastReading) this.freshReading = this.claude?.account;
        this.modelsChanged();
      });
    }
    // Each agent's reading reaches the wait or stop it is about (AC-AGENTS-04).
    const codex = this.readers.codex.state;
    if (!codex.pending && codex.account && codex.account !== this.lastCodexReading) {
      this.lastCodexReading = codex.account;
      this.codexReadingArrived(codex.account);
    }
    const reading = this.claude?.account;
    if (reading !== undefined && reading !== this.lastReading) {
      this.lastReading = reading;
      this.readingArrived(reading);
    }
    this.changed();
  }

  get paths() {
    const dir = this.record.origin && this.record.prdDirectory;
    return dir ? { ...this.options.paths, prdDirectoryFromRoot: dir, folderName: basename(dir) } : this.options.paths;
  }

  /** Provider metadata reads use the controller's original environment. */
  get environment(): NodeJS.ProcessEnv { return this.options.env; }
  get gitExecutable(): string { return this.options.tools.git; }

  get stateDirectory(): string {
    return this.options.stateDirectory;
  }

  /** The PRD's repository's worktree, where the phase documents are read. */
  get worktreePath(): string {
    const entry = this.record.repositories.find((candidate) => candidate.kind === "prd");
    if (entry) return expandHome(entry.worktreePath);
    return worktreePathFor(this.paths.repositoryName, "prd", this.record.settings, this.multiRepository);
  }

  get workspaceFolder(): string {
    return expandHome(this.record.settings.workspaceFolder);
  }

  /** The PRD's repositories that are set up, in list order: the PRD's repository first. */
  get setUpRepositories(): RepositoryEntry[] {
    return this.record.repositories.filter((entry) => entry.setupCompletedAt !== undefined);
  }

  /**
   * The repositories a session is given (its added directories, Codex's roots and assigned worktrees,
   * and the agent readiness read): every set-up one, or, while the merge activity is open, only those
   * whose pull request the latest delivery reading does not show merged, so a worktree removed after
   * its pull request merged never stops the merge session (Kiln After Delivery, "Gates").
   */
  get sessionRepositories(): RepositoryEntry[] {
    // A push session is given the main checkout alone, never the run's worktrees (Kiln After Delivery, "Gates").
    if (openPlanPush(this.record)) return [];
    if (!openMerge(this.record)) return this.setUpRepositories;
    const readings = this.record.afterDelivery?.pullRequests ?? [];
    const toMerge = (this.record.pullRequests ?? []).filter(pull => readings.find(row => row.repository === pull.repository && row.number === pull.number)?.state !== "merged");
    return this.setUpRepositories.filter(entry => toMerge.some(pull => pull.repository === entry.name));
  }

  /**
   * The PRD's repositories as Documents found shows them before Start: those already set up,
   * then the PRD's repository and the named repositories the start checks found, each with any
   * entry an earlier Start left. After Start, the set-up entries.
   */
  get plannedRepositories(): PlannedRepository[] {
    const { record } = this;
    // With an existing branch chosen, the repositories are those Start will set up (run restart "Which repositories").
    const preview = this.startPreview;
    if (record.startedAt === undefined && preview?.from === "existing" && this.startChoice.from === "existing") {
      return preview.repositories.map(repository => { const entry = record.repositories.find(one => one.name === repository.name); return { name: repository.name, ...(repository.shortName === undefined ? {} : { shortName: repository.shortName }), kind: repository.kind, mainCheckoutPath: repository.mainCheckoutPath, github: repository.github, ...(entry ? { entry } : {}) }; });
    }
    return this.checkoutRepositories;
  }

  /** The repositories the checkout's plan gives before Start: those already set up, the PRD's, then the named ones found. */
  private get checkoutRepositories(): PlannedRepository[] {
    const { record } = this;
    if (record.startedAt !== undefined) {
      return record.repositories.filter((entry) => entry.setupCompletedAt !== undefined || entry.baseCommit !== undefined).map((entry) => ({ ...entry, entry }));
    }
    const list: PlannedRepository[] = record.repositories.filter((entry) => entry.setupCompletedAt !== undefined).map((entry) => ({ ...entry, entry }));
    const add = (name: string, kind: "prd" | "named", mainCheckoutPath: string, github: string, shortName?: string) => {
      if (list.some((candidate) => candidate.name === name)) return;
      const entry = record.repositories.find((candidate) => candidate.name === name);
      list.push({ name, kind, mainCheckoutPath, github, ...(shortName === undefined ? {} : { shortName }), ...(entry ? { entry } : {}) });
    };
    add(this.paths.repositoryName, "prd", this.paths.mainCheckoutPath, record.repository.github);
    // The named repositories found, in plan order; one asked about has no checkout yet (AC-ASK-01).
    const found = this.options.named ? this.options.named.flatMap((row) => (row.found ? [row.found] : [])) : this.options.namedRepositories ?? [];
    for (const repository of found) add(repository.name, "named", repository.mainCheckoutPath, repository.github, repository.shortName);
    // The PRD's repository is listed first.
    list.sort((a, b) => (a.kind === "prd" ? -1 : b.kind === "prd" ? 1 : 0));
    return list;
  }

  /** More than one repository: from the plan before Start, from the set-up repositories after (multi-repo AC-SPACE-03). */
  get multiRepository(): boolean {
    if (this.record.startedAt === undefined && this.record.setupCompletedAt === undefined) return this.plannedRepositories.length + this.locatingRepositories.length > 1;
    // An entry left holding only Kiln's branch, which the plan no longer names, isn't one of them.
    return this.record.repositories.filter((entry) => entry.setupCompletedAt !== undefined || (entry.kind !== "added" && entry.baseCommit !== undefined)).length > 1;
  }

  /** The named repositories Documents found asks about, in plan order (AC-ASK-01); none once Start is pressed. */
  get locatingRepositories(): NamedRepositoryRow[] {
    if (this.record.startedAt !== undefined) return [];
    // With an existing branch chosen, the start commit's plan gives the repositories (run restart "Which repositories").
    if (this.startPreview?.from === "existing" && this.startChoice.from === "existing") return this.startPreview.asking ?? [];
    return (this.options.named ?? []).filter((row) => row.question !== undefined);
  }

  /** Every named repository before Start, in plan order: found, or asked about (find repositories anywhere "Snapshot"). */
  get namedRows(): NamedRepositoryRow[] {
    // With an existing branch chosen, the start commit's plan gives them (run restart "Which repositories").
    if (this.record.startedAt === undefined && this.startPreview?.from === "existing" && this.startChoice.from === "existing") return this.startPreview.named ?? [];
    return this.options.named ?? [];
  }

  /** Why Start is unavailable while a row asks (find repositories anywhere "Asking Before Start"). */
  get startBlockedBy(): string | undefined {
    // A named repository Kiln couldn't check holds Start, named on the page as a failed check.
    if (this.record.startedAt === undefined && (this.repositoryProblems.length > 0 || this.resetCheckFailing)) return FIX_WHAT_FAILED;
    const asking = this.locatingRepositories;
    if (asking.length === 0) return undefined;
    if (asking.length > 1) return `Tell Kiln where ${asking.length} repositories are to start.`;
    const question = asking[0]!.question!;
    return question.kind === "which" ? `Tell Kiln which checkout of ${question.repository} to use to start.` : `Tell Kiln where ${question.repository} is to start.`;
  }

  /** The workspace folder and feature branch are fixed once any repository is set up. */
  get workspaceFixed(): boolean {
    return this.record.repositories.some((entry) => entry.setupCompletedAt !== undefined);
  }

  /** Where the PRD's sessions start: the workspace folder for a multi-repository PRD, else the PRD's worktree. */
  get sessionFolder(): string {
    // A push of the plan works in the person's main checkout alone (Kiln After Delivery, "Gates").
    if (openPlanPush(this.record)) return expandHome(this.record.repository.mainCheckoutPath);
    return this.multiRepository ? this.workspaceFolder : this.worktreePath;
  }

  /** The folder the PRD's repositories sit in. */
  get parentFolder(): string {
    return repositoriesParent(this.paths.mainCheckoutPath);
  }

  get isUnderway(): boolean {
    return this.record.startedAt !== undefined && this.record.setupCompletedAt !== undefined;
  }

  /** Why keep-awake can't work, shown with the setting. */
  get keepAwakeError(): string | undefined {
    return this.options.keepAwake?.error;
  }

  /** Called on every change, so a server can push a fresh snapshot. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** New output lines of a working session, for the live view. */
  onOutput(listener: (sessionId: string, lines: OutputLine[]) => void): () => void {
    this.outputListeners.add(listener);
    return () => this.outputListeners.delete(listener);
  }

  /** Exit Kiln, told to every open page before the run ends (Kiln After Delivery, "Exit Kiln"). */
  onExited(listener: (exit: ExitNotice) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  /** Live text of a working session as it is written, replaced in the view by the finished line (AC-WATCH-05). */
  onPartial(listener: (sessionId: string, partial: PartialText) => void): () => void {
    this.partialListeners.add(listener);
    return () => this.partialListeners.delete(listener);
  }

  /** Resolves once the engine has nothing left to do until a command arrives. */
  async settled(): Promise<void> {
    while (this.driving || this.stoppedCommitsReading) await (this.driving ?? this.stoppedCommitsReading);
  }

  // ---- Commands --------------------------------------------------------------------------

  /**
   * Start: before the first phase, `{ refinementConfirmed: true }` runs the field checks,
   * records Start, sets up the worktree and starts the first phase (AC-START-05, AC-START-07).
   * When paused, no body: the next phase starts (AC-VIEW-03).
   */
  async start(body: { refinementConfirmed?: boolean; previewId?: string } = {}): Promise<CommandResult> {
    const { record } = this;
    if (this.isUnderway) { const refused = await this.folderRefusal(); if (refused) return refused; }
    if (this.currentlyComplete) return refuse("The feature is complete.");
    if (this.billing.busy) return refuse("Billing approval is being saved.");
    if (!this.restartReview || this.restartReview.action === "start") {
      // Before Start every needed agent is checked (AC-AGENTS-01); a resume checks the agent its next activity launches on.
      const problem = this.record.startedAt === undefined ? this.modelsProblem : this.selectionError;
      if (problem) return refuse(problem);
    }
    if (this.restartReview) {
      // The work may have changed in a terminal while the overview was open.
      this.pendingResume = undefined;
      await this.decide({ review: true });
      // Resume runs a preflight first while none has settled (build preflight AC-PREFLIGHT-01, `resume`).
      this.markResumePreflight();
      this.restartReview = undefined;
      this.reviewingRestart = false;
      this.changed();
      this.kick();
      return { ok: true };
    }
    if (record.pause.activeSince !== undefined) {
      record.pause = {};
      // Every Start that ends a pause runs a preflight first, in the write that clears it (RUN-003).
      setPreflightDue(record, "unpause", this.now().toISOString());
      this.save();
      this.kick();
      return { ok: true };
    }
    if (record.startedAt !== undefined || this.settingUp) return refuse("Kiln isn't waiting for Start.");
    if (!this.requirementsOpen && body.refinementConfirmed !== true) return { ok: false, status: 400, reason: "Confirm the documents have been through requirements refinement first." };
    if (record.origin && !record.prdDirectory && this.requirementsOpen) {
      const input = await inspectSource(this.git, record.repository.mainCheckoutPath, record.origin.path);
      if ("problem" in input) return refuse(input.problem);
      record.origin = input.origin;
      record.featureName = input.origin.title;
    }
    // A page a reset built keeps Start unavailable while a start check fails (run restart AC-RESET-04), as does a row that asks.
    if (this.startBlockedBy) return refuse(this.startBlockedBy);
    if (this.baseCheck === "checking") return refuse(`Kiln is checking ${record.settings.baseBranch || "the base branch"} on origin.`);
    // Every activity's choice must be usable, on one agent until Kiln checks both (AC-PICK-06; Phase 2 of Kiln Phase Model Tiers).
    const modelsProblem = this.modelsProblem;
    if (modelsProblem !== undefined) return refuse(modelsProblem);

    this.settingUp = true;
    this.startError = undefined;
    this.changed();
    let repositoryCount: number;
    try {
      // The names are reached again at Start; a row that asks holds it (find repositories anywhere AC-ASK-01).
      if (!(this.startPreview?.from === "existing" && this.startChoice.from === "existing") && planNames(this.options.startPlan?.phases ?? [], this.paths.repositoryName).length > 0) {
        await this.resolveNamesNow();
        if (this.startBlockedBy) return refuse(this.startBlockedBy);
        if (this.repositoryProblems.length > 0) return refuse(this.repositoryProblems.join(" "));
      }
      // Billing is read fresh for Claude Code whenever it is needed (AC-AGENTS-02). A missing approval
      // stops Start only when an activity runs on Claude Code; one only a fallback needs leaves Start available.
      const claudeNeed = this.neededBy().claude_code;
      if (claudeNeed) {
        try { await this.billing.refresh(this.billingCwd, this.sessionEnv(), [], true); }
        catch { if (!claudeNeed.fallbackOnly) return refuse("Start could not be saved: billing state could not be saved. No AI work was authorized."); }
        // A readiness blocker read at launch (an outdated Claude Code, AC-AGENT-05) is the reason, not billing.
        // The reason names the agent, what to do and the activities that need it (AC-AGENTS-02 with AC-AGENTS-01's table).
        if (!claudeNeed.fallbackOnly && !this.billing.view.canLaunch) return refuse(this.neededAgentReason("claude_code", this.billing.view.next?.readinessError ?? this.agentProblem("claude_code", true) ?? "its billing setup isn't approved. Review and approve it, or change its source and recheck.", claudeNeed));
      }
      const fields = await this.runFieldChecks();
      const preview = this.startPreview;
      // Start acts on what the page showed (run restart "Start"): a preview that changed is refused with the refreshed page.
      if (body.previewId !== undefined && preview && body.previewId !== preview.previewId) return { ok: false, status: 409, code: "start_changed", reason: "What Start would do has changed. Review the refreshed page, then press Start again." };
      const existing = preview?.from === "existing";
      const repositories: PlannedRepository[] = existing
        ? preview!.repositories.map(repository => { const entry = record.repositories.find(one => one.name === repository.name); return { name: repository.name, ...(repository.shortName === undefined ? {} : { shortName: repository.shortName }), kind: repository.kind, mainCheckoutPath: repository.mainCheckoutPath, github: repository.github, ...(entry ? { entry } : {}) }; })
        : this.plannedRepositories;
      const pending = repositories.filter((repository) => repository.entry?.setupCompletedAt === undefined);
      if (Object.keys(fields.errors).length > 0 || Object.keys(fields.baseErrors).length > 0 || pending.some((repository) => fields.startCommits[repository.name] === undefined)) {
        return { ok: false, status: 409, reason: "The settings don't pass their checks.", fieldErrors: fields.errors, baseErrors: fields.baseErrors };
      }
      // One save records Start and the whole list, each entry with the commit its branch starts from.
      const beforeStart = structuredClone(record);
      const multi = repositories.length > 1;
      const branchFixed = this.workspaceFixed;
      const choice = this.startChoice;
      const folders = { workspaceFolder: record.settings.workspaceFolder, worktreePath: record.settings.worktreePath };
      if (existing) {
        // Existing worktrees fix the workspace folder, or a one-repository PRD's worktree (AC-FROM-03, AC-FROM-05).
        if (preview!.workspaceFolder) record.settings.workspaceFolder = preview!.workspaceFolder;
        const adopted = preview!.repositories[0]!.worktree;
        if (!multi && adopted) record.settings.worktreePath = adopted.path;
      }
      const list: RepositoryEntry[] = [];
      for (const repository of repositories) {
        const entry: RepositoryEntry = repository.entry ?? { name: repository.name, kind: repository.kind, mainCheckoutPath: repository.mainCheckoutPath, github: repository.github, baseBranch: "", worktreePath: "" };
        if (entry.setupCompletedAt === undefined) {
          entry.kind = repository.kind;
          // The name is given once; a whole-path form keeps its short name beside it (AC-FOLDER-01).
          if (repository.shortName !== undefined && repository.shortName !== entry.name) entry.shortName = repository.shortName;
          entry.mainCheckoutPath = repository.mainCheckoutPath;
          entry.github = repository.github;
          const read = existing ? preview!.repositories.find(one => one.name === repository.name) : undefined;
          entry.baseBranch = read ? read.baseBranch : baseFor(repository, record.settings, branchFixed);
          entry.worktreePath = read?.worktree?.path ?? worktreePathFor(repository.name, repository.kind, record.settings, multi);
          entry.baseCommit = fields.startCommits[repository.name]!;
          // An existing-branch entry: the merge base, where the run began, an adopted worktree and a ticked catch-up (run restart "Start").
          if (read?.hasBranch) {
            entry.runStartCommit = read.tip!;
            if (read.worktree) entry.adoptedWorktree = true;
            if (choice.bringUpToDate && read.qualifies) entry.catchUp = { from: read.tip!, to: read.baseTip! };
            delete entry.createdBranch;
          }
        }
        list.push(entry);
      }
      record.start = { from: choice.from, bringUpToDate: choice.bringUpToDate };
      // Entries the plan no longer names are kept only while they hold Kiln's branch.
      const leftOut = record.repositories.filter((entry) => !list.includes(entry) && entry.createdBranch !== undefined);
      record.repositories = [...list, ...leftOut];
      repositoryCount = list.length;
      const at = this.now().toISOString();
      try {
        const choices = record.settings.developmentDeployments;
        if (choices?.enabled && choices.targets.length === 0) {
          // The current checkbox covers the displayed repository/base pairs.
          // Nonempty older selections retain their complete narrower scope.
          choices.targets = list.map(repository => ({ target: normalizeMergeTarget({ repository: `github.com/${repository.github}`, baseBranch: repository.baseBranch }) }));
        }
        validateStartTargets(record, list);
      } catch (error) { return { ok: false, status: 422, reason: (error as Error).message }; }
      record.executionId ??= randomUUID();
      if (!record.startedAt) record.developmentAuthorization = { revision: 1, enabled: record.settings.developmentDeployments?.enabled === true, grants: record.settings.developmentDeployments?.enabled ? record.settings.developmentDeployments.targets.map(candidate => ({ target: candidate.target, confirmedAt: at, source: "start" as const })) : [] };
      record.developmentDelivery ??= emptyDevelopmentLedger();
      // The loop counts start at zero (AC-LAST-02).
      if (!record.startedAt) {
        record.auditLoops = startedLedger(at);
        record.settings.auditLoops = loopSettings(record.settings);
      }
      record.startedAt = at;
      if (!this.requirementsOpen) record.refinementConfirmedAt = at;
      // The browser's Start runs a preflight before anything else, a Start with every phase closed included (AC-PREFLIGHT-01).
      setPreflightDue(record, "start", at);
      // The plan as Documents found showed it, until the worktree's own copy is read.
      const shownPlan = existing ? preview!.plan : this.options.startPlan;
      if (!this.requirementsOpen && shownPlan) { record.plan = recordedPlan(shownPlan); record.planReadAt = at; }
      try { this.save(); } catch (error) {
        for (const key of Object.keys(record)) Reflect.deleteProperty(record, key);
        Object.assign(record, beforeStart);
        return refuse(`Start could not be saved: ${(error as Error).message}`);
      }
      const setup = await this.finishSetup();
      if (this.stopping) return refuse("Kiln is stopping.");
      if (!setup.ok) {
        // An adopted folder belongs to the branch this Start chose; a failed Start gives the fields back as they were.
        if (existing && !this.workspaceFixed) { Object.assign(record.settings, folders); this.save(); }
        return { ok: false, status: 409, reason: this.startError ?? setup.error };
      }
    } finally {
      this.settingUp = false;
      this.changed();
    }
    this.emit({ kind: "prd_started", at: this.now(), branch: record.settings.featureBranch, baseBranch: record.settings.baseBranch, repositoryCount });
    this.kick();
    return { ok: true };
  }

  /**
   * A pending pause request is due unless it names a phase still to run: a leaf of the plan just
   * read that is not closed, not waiver-closed and has no `doneAt` (missing worktree recovery,
   * "Pause state at Start"). A request without `requestedFor` is due at once, as before.
   */
  get pauseDue(): boolean {
    const { requestedAt, requestedFor } = this.record.pause;
    if (requestedAt === undefined) return false;
    if (requestedFor === undefined) return true;
    const leaf = recordedLeaves(this.record.plan ?? []).find(candidate => candidate.id === requestedFor);
    return !(leaf && !leaf.closed && !this.waiverClosed(leaf.id) && !this.record.phases[leaf.id]?.doneAt);
  }

  /** Pause after this phase (AC-VIEW-03); not offered during the pull-request session (AC-PR-05). */
  pause(): CommandResult {
    const { record } = this;
    if (!this.isUnderway || this.currentlyComplete) return refuse("Nothing is running to pause after.");
    if (this.stoppedPhaseKey() !== undefined) return refuse("Kiln is stopped at Needs you, which offers no pause.");
    if (this.waitingPhaseKey() !== undefined) return refuse("Kiln is waiting for usage, which offers no pause.");
    if (this.reviewStop) return refuse("Kiln is waiting at the stakeholder review.");
    if (record.pause.activeSince !== undefined) return refuse("Kiln is already paused.");
    if (record.pause.requestedAt !== undefined) return refuse("A pause is already requested.");
    if (this.current?.phaseKey === PR_PHASE_KEY && this.current.session !== undefined) return refuse("Pause after this phase isn't offered during the pull-request session.");
    if (isPreflightKey(this.current?.phaseKey) || this.record.preflight?.due) return refuse(PREFLIGHT_PAUSE_REASON);
    record.pause.requestedAt = this.now().toISOString();
    this.save();
    return { ok: true };
  }

  /** Keep going: cancels a pending pause; refused once the pause is active (UI-002). */
  cancelPause(): CommandResult {
    if (this.record.pause.activeSince !== undefined) return refuse("Kiln is paused; press Start to go on.");
    if (this.record.pause.requestedAt === undefined) return refuse("No pause is requested.");
    if (this.waitingPhaseKey() !== undefined) return refuse("Kiln is waiting for usage; the pause stays pending through the wait.");
    delete this.record.pause.requestedAt;
    delete this.record.pause.requestedFor;
    this.save();
    return { ok: true };
  }

  phaseRecoveryTarget(): PhaseRecoveryTarget | undefined {
    const phaseKey = this.stoppedPhaseKey();
    if (!phaseKey || phaseKey === PR_PHASE_KEY || isPreflightKey(phaseKey) || this.auditActivity(phaseKey) && !this.record.liveControl) return undefined;
    const facts = this.record.phases[phaseKey];
    const hold = this.record.billing?.hold?.phaseKey === phaseKey ? this.record.billing.hold : undefined;
    if (!hold && facts?.stop?.kind !== "done_check" && facts?.stop?.kind !== "not_resumable") return undefined;
    // The target names the latest conversation, or the latest launch when none began (run restart "A session record with no run").
    const session = this.recoverySession(phaseKey);
    if (!session || session.kind !== "phase" && !this.record.liveControl || !session?.runs.some(run => run.pid !== undefined)) return undefined;
    return { executionId: this.record.executionId!, phaseKey, sessionId: session.sessionId, stoppedAt: hold?.at ?? facts!.stop!.at, ...(this.record.liveControl ? { live: this.record.liveControl.takeover.target } : {}) };
  }

  phaseRecoveryView(): PhaseRecoveryView | undefined {
    const target = this.phaseRecoveryTarget();
    if (!target) return undefined;
    const error = sameRecoveryTarget(target, this.phaseCheckError?.target) ? this.phaseCheckError : undefined;
    const stop = this.record.phases[target.phaseKey]?.stop;
    const attemptStartedAt = this.latestSession(target.phaseKey)?.runs.at(-1)?.startedAt;
    return { target, ...(attemptStartedAt ? { attemptStartedAt } : {}), completion: error || !stop?.checks.length ? "unknown" : stop.checks.every(check => check.passed) ? "complete" : "incomplete", ...(error ? { checkError: { reason: error.reason, attemptedAt: error.attemptedAt } } : {}) };
  }

  private async recoverPhase(action: "resume" | "verify" | "carry_on", body: Record<string, unknown>, waive?: WaiveRequest): Promise<CommandResult | WaiveAnswer> {
    const fail = (code: PhaseRecoveryCode, reason: string, status: 400 | 409 | 500 | 503 = 409): CommandResult => ({ ok: false, code, reason, status });
    const allowed = action === "verify" ? ["target", "intent"] : ["target", "note"];
    if (Object.keys(body).some(key => !allowed.includes(key)) || (body.target !== undefined && !validRecoveryTarget(body.target))) return fail("invalid_request", "Submit a valid recovery target and only the fields for this action.", 400);
    if (action === "verify" && body.intent !== undefined && body.intent !== "verify" && body.intent !== "advance") return fail("invalid_request", "Choose verify or advance.", 400);
    if (body.note !== undefined && typeof body.note !== "string") return fail("invalid_request", "The note must be text.", 400);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > NOTE_LIMIT) return fail("invalid_request", `The note can be at most ${NOTE_LIMIT.toLocaleString("en-US")} characters.`, 400);
    const target = this.phaseRecoveryTarget();
    if (!validRecoveryTarget(body.target) || !sameRecoveryTarget(target, body.target)) return fail("stale_target", "This stopped conversation has changed. Reload the current state before trying again.");
    if (action === "verify" && body.intent === undefined) return fail("invalid_request", "Choose verify or advance.", 400);
    if (this.billing.busy || this.deliveryBusy || this.checking || this.driving || this.settingUp || this.current || this.stopping) return fail("busy", "Kiln is already checking or starting work.");
    const key = target!.phaseKey;
    if (action === "verify" && body.intent === "verify" && this.record.liveControl?.takeover.history) return fail("recovery_unavailable", "Verify stays unavailable until the paused conversation is released; carry on in a new session instead.");
    if (action === "resume" && !this.resumeOffered(key)) return fail("recovery_unavailable", "The saved conversation cannot be resumed. Use the available terminal recovery instructions.");
    // Resume on an activity that hasn't started launches a new session, under Start again's limits (AC-PICK-07).
    if (action === "resume" && this.launchesNewSession(key)) { const limit = this.launchRestriction(key); if (limit) return fail("recovery_unavailable", limit); }
    if (action === "carry_on") { const control = this.carryOnControl(true); if (!control.offered || control.reason && !control.reason.startsWith("Kiln is checking")) return fail("recovery_unavailable", control.reason ?? "Carry on isn't offered here."); }
    this.checking = true;
    this.changed();
    let queued = false;
    try {
      const latest = this.latestSession(key)!;
      // A hold whose conversation can't be reopened ends by a carry-on, on the carry-on ownership check (run restart AC-CARRY-06).
      if (this.record.liveControl) await (action === "carry_on" || this.record.liveControl.takeover.history ? this.requireCarryOnOwnership() : this.requireTakeoverReturn());
      if (latest.agentId === "codex") await this.stopLiveProcess(latest);
      if (activityKeyKind(key) === "requirements") {
        if (action === "verify") {
          const verdict = await this.judgeRequirements(key, true);
          if (verdict.kind !== "done") return { ok: true, outcome: "still_stopped", target: target! };
          this.resolveMessageHold();
          delete this.record.liveControl;
          this.save();
          this.kick();
          return { ok: true, outcome: "advanced", target: target! };
        }
        this.returningTakeover = !!this.record.liveControl;
        await this.catchUpAtStop(key);
        if (action === "carry_on") this.requestedLaunch = { phaseKey: key, kind: "carry_on", ...(note ? { note } : {}) };
        else this.requestedResume = { phaseKey: key, cause: "person_resume", ...(note ? { note } : {}) };
        queued = true;
        return { ok: true, outcome: "resume_requested", target: target! };
      }
      const evaluatedMaterial = this.record.liveControl ? await this.takeoverMaterial(key) : undefined;
      const outcome = await this.doneCheck(key);
      if (outcome === "stopping" || this.stopping) throw new CompletionCheckUnavailable("The completion check was interrupted. No work was started.");
      if (outcome.unavailable) throw new CompletionCheckUnavailable(outcome.unavailable);
      if (!outcome.plan.ok && outcome.plan.unavailable) throw new CompletionCheckUnavailable(outcome.plan.problem);
      // A plan that does not read or reconcile is a failing row for Verify and Mark complete, but never lets Resume dispatch.
      if (!outcome.plan.ok && action !== "verify") throw new ResumeHeld(outcome.plan.problem);
      // A hold may precede a normal stop. Save actual completion evidence separately from billing.
      const facts = this.record.phases[key]!;
      const previousStop = structuredClone(facts.stop);
      if (!facts.stop) facts.stop = { kind: "done_check", at: target!.stoppedAt, checks: [], checkedAt: this.now().toISOString() };
      try { this.updateStop(key, outcome.checks, true); }
      catch (error) { if (previousStop) facts.stop = previousStop; else delete facts.stop; throw error; }
      this.phaseCheckError = undefined;
      if (outcome.passed) {
        if (action === "carry_on" && this.record.liveControl?.takeover.history) this.heldAdvance = this.record.liveControl.takeover.operationId;
        if (action !== "verify") return { ok: true, outcome: "already_complete", target: target! };
        // No completion state is observable before its atomic write succeeds.
        const before = structuredClone(this.record);
        try {
          if (this.record.liveControl) await (this.record.liveControl.takeover.history ? this.requireCarryOnOwnership() : this.requireTakeoverReturn());
          await this.recordDone(key, outcome, true, true, evaluatedMaterial);
          if (this.record.liveControl) { this.resolveMessageHold(); delete this.record.liveControl; this.save(); }
        } catch (error) {
          Object.assign(this.record, before);
          throw error;
        }
        return { ok: true, outcome: "advanced", target: target! };
      }
      // Mark complete's act runs inside the same checking boundary, on this rerun (waivers "Mark Complete").
      if (waive) return await this.waiveStopped(key, waive, outcome, evaluatedMaterial);
      if (action === "verify") {
        return { ok: true, outcome: "still_stopped", target: target! };
      }
      if (action === "resume" && !this.resumeOffered(key)) return fail("recovery_unavailable", "The saved conversation is unavailable after checking. Use the terminal recovery instructions.");
      // Catch the branch up when it applies, once nothing else can refuse, before any session starts (run restart AC-CURRENT-01).
      await this.catchUpAtStop(key);
      if (action === "carry_on") {
        // A carry-on from a hold reuses the hand-back's return; the hold ends when the new run reports init (AC-CARRY-06).
        this.returningTakeover = !!this.record.liveControl;
        this.requestedLaunch = { phaseKey: key, kind: "carry_on", ...(note ? { note } : {}) };
        queued = true;
        return { ok: true, outcome: "resume_requested", target: target! };
      }
      if (!this.resumeOffered(key)) return fail("recovery_unavailable", "The saved conversation is unavailable after checking. Use the terminal recovery instructions.");
      this.returningTakeover = !!this.record.liveControl;
      this.requestedResume = { phaseKey: key, cause: "person_resume", ...(note ? { note } : {}) };
      queued = true;
      return { ok: true, outcome: "resume_requested", target: target! };
    } catch (error) {
      const reason = (error as Error).message;
      if (error instanceof OwnershipError && error.code === "message_review_required") return fail("message_review_required", reason);
      if (error instanceof CatchUpFailure) return fail(error.code, reason);
      if (error instanceof OwnershipError && (error.code === "terminal_in_use" || error.code === "ownership_unknown") && this.record.liveControl?.takeover.history) return fail(error.code, reason);
      if (error instanceof CompletionCheckUnavailable && !(error instanceof ResumeHeld)) this.unfinishedRecheck(key);
      this.phaseCheckError = { target: target!, reason, attemptedAt: this.now().toISOString() };
      return fail(error instanceof RecoveryStateWriteFailed ? "state_write_failed" : "check_unavailable", reason, error instanceof RecoveryStateWriteFailed ? 500 : 503);
    } finally {
      if (!queued || this.stopping) this.checking = false;
      this.changed();
      if (queued || this.record.phases[key]?.doneAt && !this.record.phases[key]?.stop && !this.record.billing?.hold) this.kick();
    }
  }

  /** Check again: runs the stopped phase's check, or reads the plan again at a `plan` stop (AC-STOP-07). */
  async checkAgain(body: Record<string, unknown> = {}): Promise<CommandResult> {
    if (this.phaseRecoveryTarget() || "target" in body || "intent" in body) {
      const stopped = this.stoppedPhaseKey();
      const answer = await (this.recoverPhase("verify", body) as Promise<CommandResult>);
      // Check again searches again for the phase's requests on a hand-back stop too (find repositories anywhere, "The stops that ask").
      if (stopped !== undefined && this.stoppedPhaseKey() === stopped) void this.refreshRequestQuestions(stopped);
      return answer;
    }
    const key = this.stoppedPhaseKey();
    if (key === undefined) return refuse("No phase is waiting for Check again.");
    if (this.billing.busy || this.deliveryBusy || this.checking || this.driving) return refuse("Kiln is already checking.");
    if (this.preflightStopKey() === key) return this.checkPreflightAgain(key);
    this.checking = true;
    this.changed();
    let verdict: Awaited<ReturnType<Engine["recheckStop"]>>;
    try {
      verdict = await this.recheckStop(key);
    } finally {
      this.checking = false;
      this.changed();
    }
    // Check again searches again for the phase's requests (find repositories anywhere, "The stops that ask").
    if (this.stoppedPhaseKey() === key) void this.refreshRequestQuestions(key);
    this.kick();
    // A recheck that still fails settles as completion_checks_failed, so its receipt carries the Mark complete preview (AC-WAIVE-05).
    return { ok: true, ...(verdict === "still_stopped" && this.stoppedPhaseKey() === key ? { outcome: "still_stopped" as const } : {}) };
  }

  /** The stop's latest check run and its rows: a billing hold's own while it names the activity (waivers "Check Runs"). */
  private stopRun(key: string): { run: CheckRun | undefined; checks: CheckResult[] } {
    const hold = this.record.billing?.hold;
    if (hold?.phaseKey === key && hold.checks) return { run: hold.run, checks: hold.checks };
    const stop = this.record.phases[key]?.stop;
    return { run: stop?.run, checks: stop?.checks ?? [] };
  }

  /** Whether the stopped activity ran: a session of it dispatched a run. */
  private activityRan(key: string): boolean {
    return (this.record.phases[key]?.sessionIds ?? []).some(id => this.sessionRecord(key, id)?.runs.some(run => run.pid !== undefined && !codexNotDispatched(run)));
  }

  /** "Phase 3", "Delivery audit", "Final delivery". */
  private activityName(key: string): string {
    const audit = this.auditActivity(key);
    return key === PR_PHASE_KEY ? "Final delivery" : key === MERGE_KEY ? "The merge session" : isPlanPushKey(key) ? "The push session" : audit ? recordedAuditName(this.record, audit).title : isPreflightKey(key) ? PREFLIGHT_TITLE : `Phase ${this.judgedId(key)}`;
  }

  /** A Done activity, or a leaf closed outside Kiln, which no session of Kiln's ran: a development check can still stop it. */
  private alreadyComplete(key: string): boolean {
    if (key === PR_PHASE_KEY) return !!this.record.completedAt;
    if (this.record.phases[key]?.doneAt) return true;
    if (this.auditActivity(key) || this.activityRan(key)) return false;
    const leaf = judgedPhase(this.record.plan ?? [], key);
    return !!leaf && !leaf.splitInto && (leaf.closed || this.waiverClosed(leaf.id));
  }

  /** The key of a stop of kind `preflight`, the stop a preflight's reported items make (The Preflight Stop). */
  preflightStopKey(): string | undefined {
    const key = this.stoppedPhaseKey();
    return key !== undefined && isPreflightKey(key) && this.record.billing?.hold?.phaseKey !== key && this.record.phases[key]?.stop?.kind === "preflight" ? key : undefined;
  }

  /**
   * The activity a preflight comes before, read from the record alone (Interfaces): its recorded
   * `before`; else the pending audit; else the first open leaf; else final delivery on a completed
   * legacy run; else the step after the last settled audit. A display prediction only.
   *
   *   engine.preflightNextActivity()  // { kind: "phase", key: "1", title: "Phase 1 · Carrier account", name: "Phase 1" }
   */
  preflightNextActivity(activity: PreflightActivity | undefined = latestPreflight(this.record)): { kind: "phase" | "audit" | "final_delivery"; key?: string; title: string; name: string } {
    // The recorded plan, or before the first read saves one, the plan the start checks read.
    const leaves = this.record.plan ? recordedLeaves(this.record.plan) : this.plan ? leavesOf(this.plan) : [];
    const phase = (id: string) => { const judged = this.judgedId(id); const title = leaves.find(p => p.id === judged)?.title; return { kind: "phase" as const, key: judged, title: `Phase ${judged}${title ? ` · ${title}` : ""}`, name: `Phase ${judged}` }; };
    const audit = (label: string, key?: string) => ({ kind: "audit" as const, ...(key ? { key } : {}), title: label, name: `the ${label.toLowerCase()}` });
    const final = { kind: "final_delivery" as const, key: PR_PHASE_KEY, title: "Final delivery", name: "final delivery" };
    const before = activity && !this.record.phases[preflightKeyOf(activity)]?.doneAt ? activity.before : undefined;
    if (before) {
      const kind = activityKeyKind(before);
      if (kind === "phase") return phase(before);
      if (kind === "final_delivery") return final;
      const recorded = this.auditActivity(before);
      if (recorded) return audit(recordedAuditName(this.record, recorded).title, before);
    }
    const pending = this.record.completionAudits?.activities.findLast(a => !this.record.phases[auditKey(a)]?.doneAt);
    if (pending) return audit(recordedAuditName(this.record, pending).title, auditKey(pending));
    const leaf = leaves.find(candidate => !candidate.closed && !this.waiverClosed(candidate.id) && !this.record.phases[candidate.id]?.doneAt);
    if (leaf) return phase(leaf.id);
    if (this.record.completionAudits?.policy === "legacy_complete" && this.record.completedAt) return final;
    const step = this.auditStepAfterSettled();
    return step === "final_delivery" ? final : audit(step === "delivery_audit" ? "Delivery audit" : "Test audit");
  }

  /** Whether a preflight stop's next activity resumes work it came before, or starts it. */
  preflightVerb(key: string): "resumes" | "starts" {
    return this.preflightActivity(key)?.before ? "resumes" : "starts";
  }

  /** Mark complete at a preflight stop: offered as soon as the stop exists, with no recheck (The Preflight Stop). */
  private preflightOffer(key: string): MarkCompleteOffer {
    const { run, checks } = this.stopRun(key);
    const next = this.preflightNextActivity(this.preflightActivity(key));
    return {
      offered: true, label: "Mark complete", heading: "", continueInOrder: false, checkRunId: run!.id, items: unmetItems(checks), failingChecks: 1,
      nextActivity: { kind: next.kind, key: next.key ?? "", title: next.title }, resultingLabel: completeLabel(1), noReport: false,
      sentence: [`Check Preflight again runs a fresh preflight. Mark complete ${this.preflightVerb(key)} ${next.name} with the items as they are, and the Preflight row shows it was marked complete.`],
    };
  }

  /** Saves the stop's own items as the waiver and finishes the preflight, which settles it, in one record write. */
  private markPreflightComplete(key: string, request: WaiveRequest): { ok: true; outcome: "marked_complete"; waiver_id: string } {
    const activity = this.preflightActivity(key)!;
    const { checks } = this.stopRun(key);
    const at = this.now().toISOString();
    const waiver: Waiver = { waiverId: randomUUID(), at, activityKey: key, activityKind: "preflight", effect: "completed", source: request.source, operationId: request.operationId, checkRun: request.offeredRun, items: unmetItems(checks), checks: [] };
    const ref = { waiverId: waiver.waiverId, activityKey: key, at, ...request.source };
    // Marked with the waiver they rest on, never passed through the coverage rule: no later check reads them.
    waiver.checks = structuredClone(checks).map(check => check.passed ? check : { ...check, passed: true, waived: true as const, items: (check.items ?? []).map(item => ({ ...item, waiver: ref })) });
    const before = structuredClone(this.record);
    try { this.finishPreflight(activity, undefined, waiver); }
    catch (error) { this.restoreRecord(before); throw error; }
    return { ok: true, outcome: "marked_complete", waiver_id: waiver.waiverId };
  }

  /**
   * Mark complete at a launch-check or done-check stop on a preflight key: a launch check's waiver
   * finishes the preflight, which settles it; a Codex safety check's waiver is followed by the
   * report line's read in the same write (Reading the Result).
   */
  private waivePreflightCheck(key: string, waiver: Waiver): WaiveAnswer {
    const activity = this.preflightActivity(key)!;
    const stop = this.record.phases[key]?.stop;
    if (stop?.kind === "done_check" && this.activityRan(key)) {
      const read = this.latestPreflightReport(key);
      waiver.effect = read.report.outcome === "items" ? "continued" : "completed";
      this.applyPreflightReport(activity, read.report, read.sessionId, read.run, waiver);
      return { ok: true, outcome: waiver.effect === "continued" ? "continued" : "marked_complete", waiver_id: waiver.waiverId };
    }
    waiver.effect = "completed";
    this.finishPreflight(activity, undefined, waiver);
    return { ok: true, outcome: "marked_complete", waiver_id: waiver.waiverId };
  }

  /** Check Preflight again: a fresh preflight session under the same activity (The Preflight Stop). */
  private checkPreflightAgain(key: string): CommandResult {
    const busy = this.commands?.active?.instruction.action === "check-again" ? this.current?.processRunning || this.checking || this.driving || this.stopping : this.launchBusy();
    if (busy) return refuse("Kiln is checking or starting work. Try again when it has finished.");
    const blocked = this.launchRestriction();
    if (blocked) return refuse(blocked);
    this.checking = true;
    this.requestedLaunch = { phaseKey: key, kind: "start_again" };
    this.changed();
    this.kick();
    return { ok: true, outcome: "resume_requested" };
  }

  /**
   * Whether Mark complete is offered at the current stop, and what it would do (AC-WAIVE-02,
   * AC-WAIVE-03): the one predicate the snapshot, CLI and server share. Offered exactly when the
   * activity holds a Needs you stop whose latest run is a finished recheck with an unmet check, and
   * nothing is checking, dispatching or writing. When only that finished recheck is missing, the
   * refusal carries `awaitingRecheck`, the wording the page shows on the unusable button.
   * `admitting`: the journal's own instruction is the one in progress.
   */
  markCompleteOffer(admitting = false): MarkCompleteOffer {
    const key = this.stoppedPhaseKey();
    if (key === undefined || this.current?.processRunning) return { offered: false, reason: this.current?.processRunning ? `${this.activityName(this.current.phaseKey)} is running, not at Needs you. There is nothing to mark complete.` : "Nothing is waiting at Needs you. There is nothing to mark complete." };
    // GitHub decides whether a merge is done, so a merge stop offers no Mark complete (AC-MERGE-06).
    if (key === MERGE_KEY) return { offered: false, reason: "GitHub decides whether the merge is done. Press Check again once the pull requests are merged." };
    if (isPlanPushKey(key)) return { offered: false, reason: `origin/${this.planPushBase} decides whether the plan is pushed. Press Check again once it holds this PRD's documents.` };
    const name = this.activityName(key);
    // A loop stop saved by Kiln 1.3.0 is not a failing check; Check again clears it (technical design, "Upgrade").
    if (this.record.phases[key]?.stop?.kind === "loop_limit") return { offered: false, reason: LOOP_STOP_LINE };
    if (this.checking || this.driving || this.settingUp || this.deliveryBusy || this.stopping || this.billing.busy || !admitting && this.commands?.busy) return { offered: false, reason: "Kiln is checking, dispatching or writing. Try again when it has finished." };
    if (this.preflightStopKey() === key) return this.preflightOffer(key);
    const { run, checks } = this.stopRun(key);
    const failing = checks.filter(check => !check.passed);
    const { label, heading, continueInOrder } = this.offerWording(key, failing);
    const hold = failing.some(check => check.name === HOLD_CHECK) ? this.record.phases[key]?.stop?.holdLeadsTo ?? "pull_request_session" : undefined;
    // Where only the description fails, Check again starts the pull request session rather than keeping the stop, so the stop's own run is offered (AC-LEFT-01).
    const ownRun = key === PR_PHASE_KEY && this.onlyDescriptionFails(checks);
    // Only a finished recheck is missing when the stop's checks still fail, or none has run yet.
    const awaiting = !run || failing.length ? { awaitingRecheck: { label, heading } } : {};
    if (!run || run.origin !== "recheck" && !ownRun) return { offered: false, reason: `No check has run since ${name} stopped. Run without --confirm to check again first.`, ...awaiting };
    if (!run.finished) return { offered: false, reason: "The last check could not finish. Check again when its evidence can be read.", ...awaiting };
    if (!failing.length) return { offered: false, reason: "Every check passed. Check again advances without a waiver." };
    const items = unmetItems(checks);
    const complete = this.alreadyComplete(key);
    const audit = this.auditActivity(key);
    const preview = audit && !complete ? this.auditWaiverPreview(audit) : undefined;
    const nextActivity = continueInOrder || complete ? null : this.forecastNext(key, preview?.countedOutcome);
    const counted = preview ? `counts the audit as ${preview.report === "none" ? "passed" : "its report says"} and ` : "";
    const next = key === PR_PHASE_KEY ? "moves to Complete"
      : preview && !this.record.auditLoops ? `${counted}moves to the next step`
      : preview ? `${counted}${nextActivity?.kind === "audit" ? `moves on to the ${nextActivity.title.toLowerCase()}` : nextActivity?.kind === "final_delivery" ? "moves on to final delivery" : nextActivity?.kind === "phase" ? "runs the completion phases it added first" : "moves to the next step"}`
      : "moves to the next step";
    const resultingLabel = completeLabel(failing.length + checkCounts(checks).waived + (complete ? this.waivedCount(key) : 0));
    // Each repository by its label (find repositories anywhere AC-FOLDER-02); an item's subject is Kiln's name.
    const repositoryWork = [...new Set(items.filter(item => item.kind === "repository_work").map(item => this.labelOf(item.subject)))];
    const work = this.stoppedPhase() === key ? this.workOf(key) : undefined;
    const builtNothing = !!work && !("unknown" in work) && work.builtNothing;
    return {
      offered: true,
      label, heading, continueInOrder, checkRunId: run.id, items, failingChecks: failing.length, nextActivity, resultingLabel, noReport: preview?.report === "none",
      sentence: previewSentence({ activity: name, failingChecks: failing.length, next, resultingLabel, repositoryWork, resumeOffered: this.resumeOffered(key), noReport: preview?.report === "none", continueInOrder, builtNothing, ...(hold ? { hold } : {}) }),
      ...(builtNothing ? { builtNothing: true as const } : {}), ...(hold ? { hold } : {}),
    };
  }

  /** Mark complete's button and heading: Continue in normal order for a plan or readiness problem on an activity that has not started (AC-WAIVE-04). */
  private offerWording(key: string, failing: readonly CheckResult[]): { label: string; heading: string; continueInOrder: boolean } {
    const name = this.activityName(key);
    const stopKind = this.record.phases[key]?.stop?.kind;
    const problemStop = (stopKind === "plan" || stopKind === "selection") && failing.some(check => KNOWN_PROBLEM_CHECKS.includes(check.name));
    const continueInOrder = problemStop && !(this.activityRan(key) || this.alreadyComplete(key));
    const lower = name.charAt(0).toLowerCase() + name.slice(1);
    // The hold stop's offer follows its row, whether or not a pull request session has run (AC-ITEM-01).
    if (failing.some(check => check.name === HOLD_CHECK)) return { label: "Continue anyway", heading: "You’ve provided what’s listed above, and want Kiln to deliver?", continueInOrder: true };
    return {
      label: continueInOrder ? "Continue in normal order" : `Mark ${lower} complete`,
      heading: continueInOrder ? "Kiln can’t work out the next step, and you want it to carry on?" : `${name} is done, and Kiln’s check is wrong?`,
      continueInOrder,
    };
  }

  /** Checks an activity completed with that waivers met: its own waiver's run, else its completion run, plus continued waivers on it. */
  private waivedCount(key: string): number {
    const facts = this.record.phases[key];
    const own = facts?.waiverId ? this.record.waivers?.find(w => w.waiverId === facts.waiverId)?.checks : facts?.completionChecks;
    const continued = (this.record.waivers ?? []).filter(w => w.activityKey === key && w.effect === "continued" && w.waiverId !== facts?.waiverId).flatMap(w => w.checks);
    return checkCounts([...(own ?? []), ...continued]).waived;
  }

  /**
   * The next activity Kiln would choose with the waiver in place, forecast from the saved record
   * and the latest run, never by the live choice, so offering Mark complete writes nothing.
   */
  private forecastNext(key: string, countedOutcome?: string): NonNullable<Extract<MarkCompleteOffer, { offered: true }>["nextActivity"]> {
    if (key === PR_PHASE_KEY) return { kind: "complete", key: PR_PHASE_KEY, title: "Complete" };
    const audit = this.auditActivity(key);
    const stopped = audit ? undefined : this.judgedId(key);
    const leaf = recordedLeaves(this.record.plan ?? []).find(phase => phase.id !== stopped && !phase.closed && !this.waiverClosed(phase.id) && !this.record.phases[phase.id]?.doneAt);
    if (leaf) return { kind: "phase", key: leaf.id, title: `Phase ${leaf.id} · ${leaf.title}` };
    // A closed kind gets no new audit (AC-LAST-03); saved test work is still worked through.
    const closed = closedKinds(this.record);
    const testAudit = { kind: "audit" as const, key: "", title: "Test audit" };
    const finalDelivery = { kind: "final_delivery" as const, key: PR_PHASE_KEY, title: "Final delivery" };
    const afterDelivery = () => !closed.test || latestTestContinues(this.gateContext) ? testAudit : finalDelivery;
    if (!audit) return closed.delivery ? afterDelivery() : { kind: "audit", key: "", title: "Delivery audit" };
    if (countedOutcome === "continue_test") return testAudit;
    return audit.kind === "delivery_audit" ? afterDelivery() : finalDelivery;
  }

  /** How a waived audit would count (AC-WAIVE-12). */
  private auditWaiverPreview(activity: AuditActivity): { report: "accepted" | "valid" | "none"; countedOutcome: string } {
    return previewAuditWaiver(this.stateDirectory, activity);
  }

  /**
   * Mark complete (AC-WAIVE-03, AC-WAIVE-04), applied by the control journal as `waive-and-advance`:
   * reruns the stop's own check under the exclusive checking boundary, and only when its unmet
   * items equal the offered run's saves the waiver with the completion it grants in one record write.
   *
   *   inputs: { check_run_id, via: "browser" | "command_line", by?, live_target?, reviewed_receipt_ids?, without_sending_reply? }
   *   → { ok: true, outcome: "marked_complete", waiver_id } | { ok: true, outcome: "check_results_changed", changes } | …
   */
  private async markComplete(inputs: Record<string, unknown>, receipt: Receipt): Promise<{ ok: boolean; outcome?: MarkCompleteOutcome | string; reason?: string; code?: string; status?: number; waiver_id?: string; changes?: ItemChange[] }> {
    const offer = this.markCompleteOffer(true);
    if (!offer.offered) return { ok: false, code: "mark_complete_not_offered", reason: offer.reason, status: 409 };
    if (inputs.check_run_id !== offer.checkRunId) return { ok: false, code: "stale_check_run", reason: "The checks have run again since this was offered. Review the latest results, then choose again.", status: 409 };
    const key = this.stoppedPhaseKey()!;
    const offered = structuredClone(this.stopRun(key).checks);
    const source: WaiverSource = { via: inputs.via === "command_line" ? "command_line" : "browser", account: userInfo().username, ...(typeof inputs.by === "string" ? { by: inputs.by } : {}) };
    const request = { offered, offeredRun: { id: offer.checkRunId, at: this.stopRun(key).run!.at }, source, operationId: receipt.id, continueInOrder: offer.continueInOrder };
    if (this.preflightStopKey() === key) {
      // At a preflight stop Mark complete reruns nothing: the waiver is the stop's own items (The Preflight Stop).
      this.checking = true; this.changed();
      let answer: Awaited<ReturnType<Engine["markComplete"]>>;
      try { answer = this.markPreflightComplete(key, request); }
      finally { this.checking = false; this.changed(); }
      receipt.effects.plan = "advanced";
      this.kick();
      return answer;
    }
    const handBack = this.phaseRecoveryTarget();
    let answer: WaiveAnswer;
    if (handBack) answer = await this.recoverPhase("verify", { target: handBack, intent: "advance" }, request);
    else {
      this.checking = true; this.changed();
      try {
        const verdict = await this.recheckStop(key, { routeAudits: false });
        // A stop during the rerun means it did not run: nothing is compared or saved.
        if (this.stopping) throw new CompletionCheckUnavailable("The completion check was interrupted. Nothing was marked complete.");
        answer = verdict === "still_stopped" ? await this.waiveStopped(key, request) : { ok: true, outcome: "checks_passed" };
      } catch (error) {
        if (refusedWhileFrozen(error) || this.commands.fault) throw error;
        // waiveStopped restores the record before rethrowing, so a failure here saved nothing: settle it rather than hold control.
        answer = error instanceof CompletionCheckUnavailable ? { ok: false, code: "check_unavailable", reason: error.message, status: 503 } : { ok: false, code: "mark_complete_failed", reason: `Nothing was marked complete: ${(error as Error).message}`, status: 500 };
      } finally { this.checking = false; this.changed(); }
    }
    if (answer.ok && answer.outcome !== "check_results_changed") {
      if (answer.outcome === "checks_passed" || answer.outcome === "advanced") answer = { ...answer, outcome: "checks_passed" };
      receipt.effects.plan = "advanced";
      if (this.record.controlApplied?.operationId !== receipt.id) { this.record.controlApplied = { operationId: receipt.id, outcome: answer.outcome! }; this.save(); }
      this.kick();
    }
    return answer;
  }

  /**
   * The act half of Mark complete, once the rerun still fails: compares its unmet items with the
   * offered run's and, on an exact match, saves the waiver with the completion it grants.
   */
  private async waiveStopped(key: string, request: WaiveRequest, outcome?: DoneCheckOutcome, takeoverMaterial?: string): Promise<WaiveAnswer> {
    const rerun = this.stopRun(key);
    // A rerun that could not finish, such as GitHub being unreadable, is never waived on (AC-WAIVE-02, AC-WAIVE-04).
    if (rerun.run && !rerun.run.finished) return { ok: false, code: "check_unavailable", reason: "The completion check could not read its evidence. Nothing was marked complete; check again when it can be read.", status: 503 };
    const changes = changedItems(request.offered, rerun.checks);
    if (changes.length) return { ok: true, outcome: "check_results_changed", changes };
    const items = unmetItems(rerun.checks);
    const audit = this.auditActivity(key);
    const complete = this.alreadyComplete(key);
    const effect: Waiver["effect"] = request.continueInOrder || complete ? "continued" : "completed";
    const waiver: Waiver = {
      waiverId: randomUUID(), at: this.now().toISOString(), activityKey: key,
      activityKind: key === PR_PHASE_KEY ? "final_delivery" : audit ? audit.kind : "implementation",
      effect, source: request.source, operationId: request.operationId, checkRun: request.offeredRun, items, checks: [],
    };
    // The rerun's rows, marked with the waiver they now rest on.
    const checks = applyWaivers([...(this.record.waivers ?? []), waiver], structuredClone(rerun.checks), { isLeaf: id => this.isLeaf(id) });
    waiver.checks = checks;
    const before = structuredClone(this.record);
    if (isPreflightKey(key)) {
      waiver.activityKind = "preflight";
      try { return this.waivePreflightCheck(key, waiver); }
      catch (error) { this.restoreRecord(before); throw error; }
    }
    try {
      if (effect === "continued") {
        (this.record.waivers ??= []).push(waiver);
        const facts = this.record.phases[key];
        if (facts) { delete facts.stop; if (!facts.sessionIds.length && !facts.doneAt && !audit) delete this.record.phases[key]; }
        if (this.record.billing?.hold?.phaseKey === key) delete this.record.billing.hold;
        this.record.controlApplied = { operationId: request.operationId, outcome: "continued" };
        if (this.record.liveControl) { this.resolveMessageHold(); delete this.record.liveControl; }
        this.save();
        return { ok: true, outcome: "continued", waiver_id: waiver.waiverId };
      }
      if (key === PR_PHASE_KEY) {
        const final = this.lastFinalCheck;
        const heads = await this.waivedWorkHeads(checks);
        this.complete(final?.pullRequests ?? [], true, final?.mergedBranches ?? [], checks, waiver, heads);
      } else if (audit) {
        await this.completeWaivedAudit(audit, waiver, checks, takeoverMaterial);
      } else {
        const done = outcome ?? (this.lastDoneCheck?.key === key ? this.lastDoneCheck.outcome : undefined);
        if (!done) throw new CompletionCheckUnavailable("The completion check's result is no longer available. Check again, then mark complete.");
        await this.recordDone(key, { ...done, checks, passed: true }, true, true, takeoverMaterial, waiver);
      }
      if (this.record.liveControl) { this.resolveMessageHold(); delete this.record.liveControl; this.save(); }
    } catch (error) {
      this.restoreRecord(before);
      throw error;
    }
    return { ok: true, outcome: "marked_complete", waiver_id: waiver.waiverId };
  }

  /** An audit marked complete: its waiver result, measured from a snapshot captured now, saved with the waiver and its completion (AC-WAIVE-12). */
  private async completeWaivedAudit(audit: AuditActivity, waiver: Waiver, checks: CheckResult[], takeoverMaterial?: string): Promise<void> {
    const key = auditKey(audit);
    const done = this.lastDoneCheck?.key === key ? this.lastDoneCheck.outcome : undefined;
    if (!done) throw new CompletionCheckUnavailable("The completion check's result is no longer available. Check again, then mark complete.");
    const snapshot = await captureSnapshot({ ...this.admissionContext(waiver), activity: audit, now: waiver.at });
    const recorded = waiveAudit(this.stateDirectory, audit, { waiverId: waiver.waiverId, snapshot });
    waiver.audit = { report: recorded.report, countedOutcome: recorded.countedOutcome, ...(recorded.countedChangedImplementation !== undefined ? { countedChangedImplementation: recorded.countedChangedImplementation } : {}), resultRef: recorded.resultRef };
    this.record.completionAudits!.revision++;
    await this.recordDone(key, { ...done, checks, passed: true }, true, true, takeoverMaterial, waiver);
  }

  /**
   * An audit that cannot start on a waived readiness problem: allocated without a session and
   * completed at once on that waiver with no report, carrying both warnings (AC-WAIVE-04, AC-WAIVE-12).
   */
  private async completeAuditAtOnce(kind: AuditKind, continuation: boolean, waiver: Waiver): Promise<void> {
    const before = structuredClone(this.record);
    const activity = await this.allocateAudit(kind, continuation, true);
    try {
      waiveUnstartedAudit(this.stateDirectory, activity, waiver.waiverId);
      const facts = this.record.phases[auditKey(activity)]!;
      facts.doneAt = this.now().toISOString(); facts.finishedByPerson = false;
      // Its one row is the carried Completion audit readiness row, read from the originating waiver.
      facts.waiverId = waiver.waiverId; facts.waiverWarning = { kind: "audit", waiverId: waiver.waiverId };
      this.record.completionAudits!.revision++;
      this.save();
    } catch (error) { this.restoreRecord(before); this.save(); throw error; }
    this.emitAudit(activity, "done");
  }

  /** The activity's facts, made empty when it has none yet. */
  private phaseFacts(key: string): PhaseFacts {
    return this.record.phases[key] ??= { sessionIds: [], finishedByPerson: false, repositories: {} };
  }

  /** Puts the record back exactly as `before`, dropping fields added since, after a write that must leave nothing behind. */
  private restoreRecord(before: PrdRecord): void {
    for (const field of Object.keys(this.record)) delete (this.record as unknown as Record<string, unknown>)[field];
    Object.assign(this.record, before);
  }

  /** Each repository whose uncommitted or unpushed work a check run waived, with its feature head. */
  private async waivedWorkHeads(checks: CheckResult[]): Promise<Record<string, string>> {
    const names = new Set(checks.flatMap(check => (check.items ?? []).filter(item => item.kind === "repository_work" && item.waiver).map(item => item.subject)));
    const heads: Record<string, string> = {};
    for (const entry of this.setUpRepositories.filter(one => names.has(one.name))) {
      const head = await localBranchCommit(this.git, expandHome(entry.worktreePath), this.record.settings.featureBranch);
      if (head) heads[entry.name] = head;
    }
    return heads;
  }

  /**
   * Resume at Needs you (usage-limit recovery AC-RESUME-01 to 03): the stop's check first, honoring
   * the confirmation as Check again does. A pass is Done, finished by the person, and the note is
   * dropped; a failure resumes that same session, the note first, and Kiln carries on as after any
   * session. From the press until the session runs again or the result is recorded, `checking`
   * stays set, so Resume and Check again are refused (AC-RESUME-02).
   *
   *   await engine.resume({ note: "Renumber the migration to 0043, then carry on." })  // { ok: true }
   *
   * During a wait it is Resume now (AC-LIMIT-02), which takes no note: the wait's check first,
   * then the same session on whichever account is signed in, without waiting for a reading.
   */
  async resume(body: Record<string, unknown> = {}): Promise<CommandResult> {
    if (this.reviewStop) return this.leaveRequirementsReview(true);
    if (this.restartReview) return refuse("Review the phase plan and use Continue to resume Kiln.");
    if (this.phaseRecoveryTarget() || "target" in body) return this.recoverPhase("resume", body) as Promise<CommandResult>;
    const waiting = this.record.billing?.hold ? undefined : this.waitingPhaseKey();
    if (waiting !== undefined) {
      // An empty note counts as none.
      if (body.note !== undefined && !(typeof body.note === "string" && body.note.trim() === "")) return refuse("Resume now takes no note.");
      if (this.billing.busy || this.deliveryBusy || this.checking || this.driving) return refuse("Kiln is already checking.");
      await this.resumeWait(waiting, "person_resume");
      return { ok: true };
    }
    const key = this.stoppedPhaseKey();
    if (key !== undefined && this.preflightStopKey() === key) return refuse(PREFLIGHT_STOP_REASON);
    if (key === undefined || !this.resumeOffered(key)) return refuse("Resume isn't offered here.");
    if (this.billing.busy || this.deliveryBusy || this.checking || this.driving) return refuse("Kiln is already checking.");
    // Resume on an activity that hasn't started launches a new session, under Start again's limits (AC-PICK-07).
    if (this.launchesNewSession(key)) { const limit = this.launchBusy() ?? this.launchRestriction(key); if (limit) return refuse(limit); }
    if (body.note !== undefined && typeof body.note !== "string") return { ok: false, status: 400, reason: "The note must be text." };
    const note = (body.note ?? "").trim();
    if (note.length > NOTE_LIMIT) return { ok: false, status: 400, reason: `The note can be at most ${NOTE_LIMIT.toLocaleString("en-US")} characters.` };
    this.checking = true;
    this.changed();
    let verdict: "done" | "complete" | "cleared" | "still_stopped" | undefined;
    try {
      // Resume reopens the stopped conversation, so an out-of-date description resumes that session rather than starting a new one (AC-LEFT-01).
      verdict = await this.recheckStop(key, { resuming: true });
    } catch (error) {
      // A reading that could not finish decides nothing: nothing resumes and the stop names why (AC-MERGE-06).
      if (!(error instanceof CompletionCheckUnavailable) || !isAfterDeliveryKey(key)) throw error;
      return { ok: false, code: "check_unavailable", reason: error.message, status: 503 };
    } finally {
      // Held on through the resume only when the check failed; the run's start releases it.
      if (verdict !== "still_stopped" || this.stopping) {
        this.checking = false;
        this.changed();
      }
    }
    if (verdict === "still_stopped" && !this.stopping && isAfterDeliveryKey(key)) {
      // Resume at a merge or push stop is refused, naming the folder, when it is not ready (technical design, "Gates").
      const folder = await this.afterDeliveryOps(key).folder();
      if (folder) { this.checking = false; this.changed(); return { ok: false, code: key === MERGE_KEY ? "merge_folder_not_ready" : "plan_push_folder_not_ready", reason: folder.facts[0]!, status: 409 }; }
    }
    if (verdict === "still_stopped" && !this.stopping) this.requestedResume = { phaseKey: key, cause: "person_resume", ...(note === "" ? {} : { note }) };
    // At a requirements activity's Needs you, a reply given when the checks pass becomes feedback (AC-TALK-02).
    if (verdict === "done" && note !== "" && activityKeyKind(key) === "requirements" && this.requirementsOpen) { await this.addFeedback(note); return { ok: true }; }
    this.kick();
    // A stop whose recheck cleared it, such as a loop stop saved by Kiln 1.3.0, resumes no conversation: the run carries on and the note is not delivered.
    if (verdict === "cleared") return { ok: true, ...(note !== "" ? { noteSkipped: true as const } : { outcome: "advanced" as const }) };
    return { ok: true, ...(note !== "" && (verdict === "done" || verdict === "complete") ? { noteSkipped: true as const } : {}) };
  }

  /**
   * Check again on the carry-on card (AC-CARRY-02): on a held page, takeover reconciliation on the
   * hold's conversation; for Codex, one evidence-only read of the latest conversation's thread;
   * then republish. Claude's check reads the saved file at each snapshot build anyway.
   */
  async reopenCheckAgain(): Promise<void> {
    if (this.record.liveControl) { await this.reconcileTakeover(); await this.refreshStoppedWork(); this.changed(); return; }
    const key = this.stoppedPhase();
    const session = key === undefined ? undefined : this.recoverySession(key);
    if (session?.agentId === "codex" && this.options.tools.codex) await this.readCodexAvailability(session);
    if (key !== undefined) await this.refreshStoppedWork(key);
    this.changed();
  }

  /**
   * Send reply & continue (AC-CARRY-05): the completion check first, as resuming does, with the
   * already-complete choice; otherwise a new session for the phase that is given the person's
   * reply, the agent's last message and the phase's work.
   *
   *   await engine.carryOn({ target, note: "The import work is merged now." })  // { ok: true, outcome: "resume_requested" }
   */
  carryOn(body: Record<string, unknown> = {}): Promise<CommandResult> {
    return this.recoverPhase("carry_on", body) as Promise<CommandResult>;
  }

  /**
   * Whether Needs you offers Resume (usage-limit recovery AC-RESUME-01): at a done-check or
   * pull-request-check stop, an interrupted one included (multi-repo AC-OUTSIDE-04), whose session
   * has a run that started, and never when Claude Code holds no transcript for it (multi-repo
   * AC-OUTSIDE-01). It reads only the record and the transcripts, so a restarted Kiln offers it the same way.
   */
  resumeOffered(phaseKey: string): boolean {
    if (this.record.liveControl && this.record.liveControl.takeover.state !== "released") return false;
    // Kiln never resumes a preflight session with a person's words (The Preflight Stop).
    if (isPreflightKey(phaseKey)) return false;
    const kind = this.record.phases[phaseKey]?.stop?.kind;
    if (kind !== "done_check" && kind !== "pull_request_check" && kind !== "merge_check" && kind !== "plan_push_check" && kind !== "not_resumable" && this.record.billing?.hold?.phaseKey !== phaseKey) return false;
    const session = this.recoverySession(phaseKey);
    if (!session || !session.runs.some((run) => run.pid !== undefined)) return false;
    // An activity that hasn't started reopens nothing: Resume launches a new session, under Start again's limits (Kiln Phase Model Tiers AC-PICK-07).
    // Run restart's "a conversation began" still decides which cards the stopped-phase page offers.
    if (this.choiceActivity(phaseKey) && !this.startedSessionOf(phaseKey)) return !this.unknownStarts.has(phaseKey) && this.conversationBegan(phaseKey);
    // Resume goes by the reopen check, never by the stop's kind (run restart "Whether the conversation can be reopened").
    if (kind === "not_resumable" && !this.conversationBegan(phaseKey)) return false;
    return this.reopenCheck(phaseKey).state === "available";
  }

  /** A billing restriction that would stop a launch, as the launch path's own check reads it (run restart AC-CARRY-03). */
  private launchRestriction(key: string | undefined = this.stoppedPhaseKey() ?? this.heldHistoryKey()): string | undefined {
    // The check uses the agent of the activity about to launch (AC-AGENTS-02).
    if ((key === undefined ? this.auditsAgent : this.agentOf(key)) === "codex") return undefined;
    const view = this.billing.view;
    if (!view.next || view.canLaunch) return undefined;
    return view.next.readinessError ?? "Billing restrictions would stop a launch. Review and approve this billing setup, or change its source and recheck.";
  }

  /** The limits both session-starting buttons share (AC-CARRY-03): a session running, or Kiln checking or dispatching. */
  private launchBusy(): string | undefined {
    if (this.current?.processRunning) return "A session for this PRD is running.";
    if (this.checking || this.driving || this.settingUp || this.deliveryBusy || this.stopping || this.billing.busy || this.commands?.busy) return "Kiln is checking or starting work. Try again when it has finished.";
    return undefined;
  }

  /**
   * Send reply & continue (AC-CARRY-01, AC-CARRY-03, AC-CARRY-06): offered when a stopped phase
   * began a conversation whose reopen check is unavailable, or on a held page whose conversation
   * can't be reopened; unavailable, with the reason, under the shared limits. The page's button also waits for each uncertain message to be
   * acknowledged; a command takes its acknowledgements with it, as `kiln resume` does, so command
   * admission passes `acknowledging` and the carry-on ownership check refuses whatever is still
   * unacknowledged (run restart AC-CARRY-06).
   *
   *   engine.carryOnControl()      // the page's button: { offered: true, available: false, reason: "Acknowledge each message …" }
   *   engine.carryOnControl(true)  // admission of `kiln carry-on --message-reviewed <id>`: { offered: true, available: true }
   */
  carryOnControl(acknowledging = false): { offered: boolean; available: boolean; reason?: string } {
    const held = this.heldHistoryKey();
    const key = held ?? this.stoppedPhase();
    // Nothing starts a second merge or push session (AC-MERGE-06).
    if (key === undefined || isPreflightKey(key) || isAfterDeliveryKey(key)) return { offered: false, available: false };
    if (!held && (!this.conversationBegan(key) || this.reopenCheck(key).state !== "unavailable")) return { offered: false, available: false };
    const hold = this.record.liveControl?.takeover;
    const reason = (held && (hold?.carryOnObstacle ?? (!acknowledging && this.liveView()?.reviewRequired?.length ? "Acknowledge each message Kiln isn't sure was delivered first." : undefined))) || this.launchBusy() || this.launchRestriction();
    return { offered: true, available: !reason, ...(reason ? { reason } : {}) };
  }

  /** Start Phase N again (AC-CASE-02, AC-CARRY-03): offered when no session of a stopped phase began a conversation. */
  startAgainControl(): { offered: boolean; available: boolean; reason?: string } {
    const stopped = this.stoppedPhaseKey();
    if (isAfterDeliveryKey(stopped)) return { offered: false, available: false };
    const key = isPreflightKey(stopped) ? stopped : this.stoppedPhase();
    // On a preflight key: offered at a launch-check or done-check stop, never at the preflight stop itself.
    if (key !== undefined && isPreflightKey(key)) {
      const kind = this.record.phases[key]?.stop?.kind;
      if (kind !== "selection" && kind !== "done_check" || this.record.billing?.hold?.phaseKey === key) return { offered: false, available: false };
    } else if (key === undefined || this.conversationBegan(key)) return { offered: false, available: false };
    const safety = this.codexSafetyProblems(key, false);
    const reason = this.launchBusy() || this.launchRestriction() || (safety.length ? `Kiln found a Codex safety problem: ${safety.join(" ")}` : undefined);
    return { offered: true, available: !reason, ...(reason ? { reason } : {}) };
  }

  /**
   * Start again (AC-CASE-02): launches the stopped phase's first session again with the ordinary
   * phase prompt. It takes no reply and runs no completion check first.
   *
   *   await engine.startAgain()  // { ok: true, outcome: "resume_requested" }
   */
  /**
   * Reset's availability on every screen of a started PRD (run restart AC-RESET-01, 02; "Availability"):
   * unavailable while a session is working or Kiln's own work is under way, with the first matching
   * sentence of the `reset.reason` table.
   */
  resetControl(): { available: boolean; reason?: string } {
    if (this.record.startedAt === undefined) return { available: false, reason: "Not started; there is nothing to reset." };
    const session = !!this.current?.processRunning || !!this.orphanStop;
    const kilnWork = !!(this.checking || this.driving || this.settingUp || this.deliveryBusy || this.completedPlanReading || this.deliveryReading || this.billing.busy || this.stopping || this.commands?.busy || this.folderStartProgress && !this.folderStartProgress.error);
    if (!session && !kilnWork) return { available: true };
    const paused = !!this.record.pause.activeSince || !!this.restartReview;
    // Pause after is never offered for an after-delivery activity, so its reset line is the session's or Kiln's own (Kiln After Delivery, "No live controls").
    const pauseAfter = this.isUnderway && !this.currentlyComplete && !openAfterDeliveryKey(this.record) && !this.stoppedPhaseKey() && !this.waitingPhaseKey() && !paused && !this.record.pause.requestedAt && this.current !== undefined && this.current.phaseKey !== PR_PHASE_KEY && !isPreflightKey(this.current.phaseKey) && !this.commands?.busy && !this.folderMissing;
    if (session) {
      const takeOver = !!this.liveView()?.available && !this.commands?.busy;
      if (takeOver && pauseAfter) return { available: false, reason: "Reset isn't available while a session is working. Stop it now with Pause now above, or pause after the current phase or audit and reset once it ends." };
      if (pauseAfter) return { available: false, reason: "Reset isn't available while a session is working. Pause after the current phase or audit and reset once it ends." };
      return { available: false, reason: "A session is still running. Reset becomes available when it ends." };
    }
    if (pauseAfter) return { available: false, reason: "Reset isn't available while Kiln is working. Pause after the current phase or audit and reset once it ends." };
    return { available: false, reason: "Kiln is still working. Reset becomes available when that work ends." };
  }

  /**
   * Exit Kiln's availability (Kiln After Delivery AC-EXIT-01, "Exit Kiln"): on a finished run
   * whenever no session process is running and Kiln is not starting one. A plan check or delivery
   * reading in progress is abandoned, unless a journalled command or a push past Done waits on it.
   * `applying` leaves out the exit's own receipt, which is the command applying.
   */
  exitControl(applying = false): { available: boolean; reason?: string } {
    if (!this.finished) return { available: false, reason: "Exit Kiln is offered once every phase is done. Ctrl+C stops Kiln now." };
    if (this.exiting) return { available: false, reason: "Kiln is exiting." };
    if (openPlanPush(this.record)?.doneAt) return { available: false, reason: "Kiln is checking for new phases after pushing the plan. Exit Kiln returns once Kiln has started the build or shown what it found." };
    if (this.current?.processRunning || this.orphanStop || this.driving) return { available: false, reason: "Exit Kiln returns once the session ends, or once Kiln has started it. Ctrl+C still stops everything, the session included." };
    if (this.settingUp || this.pendingContinuation()) return { available: false, reason: "Kiln is setting up the build Continue started. Exit Kiln returns once it has started." };
    if (this.stopping) return { available: false, reason: "Kiln is stopping." };
    if (!applying && this.commands?.busy) return { available: false, reason: "Kiln is applying a command. Exit Kiln returns once it is done." };
    return { available: true };
  }

  /** The command that opens this PRD in Kiln again, as Exit Kiln says it. */
  get reopenCommand(): string { return `kiln run ${this.paths.prdDirectoryFromRoot}`; }

  /**
   * Exit Kiln (Kiln After Delivery "Exit Kiln"): the receipt completes and is flushed and the caller
   * gets its answer; then every open page is told, and after the delay a reset already uses the run
   * ends through the ordinary stop path with exit code 0. Nothing but the receipt is written.
   */
  private applyExit(inputs: Record<string, unknown>): { ok: boolean; outcome?: string; reason?: string; code?: string; status?: number } {
    const control = this.exitControl(true);
    if (!control.available) return { ok: false, code: "exit_unavailable", reason: control.reason!, status: 409 };
    const exit: ExitNotice = { at: this.now().toISOString(), via: inputs.via === "command_line" ? "command_line" : "browser", command: this.reopenCommand };
    this.exiting = exit;
    void this.commands.settled().then(() => {
      for (const listener of this.exitListeners) listener(exit);
      setTimeout(() => this.options.onExit?.(exit), EXIT_DELAY_MS).unref();
    });
    return { ok: true, outcome: "exited" };
  }

  /** Settles with what `POST /api/reset` answers, once a reset this engine admitted is over. */
  resetOutcome: Promise<ResetOutcome> | undefined;

  /**
   * Steps 1 to 4 of a reset, inside the journal's apply (run restart "Doing it"): stop the engine,
   * checkpoint what it forgets and the new execution ID, write a fresh not-started record, then
   * discard the rest of the PRD's state. Nothing in any repository is touched (AC-RESET-05).
   */
  private async applyReset(receipt: Receipt): Promise<{ ok: true; outcome: string }> {
    const finish = () => {
      // Step 5 is the run's, once the old journal has settled this receipt.
      const settled = this.commands.settled().then(() => receipt);
      this.resetOutcome = this.options.onReset ? settled.then(done => this.options.onReset!(done)) : settled.then(done => done.state === "completed" ? { ok: true as const, controlToken: "" } : { ok: false as const, reason: done.reason ?? "The reset didn't finish." });
    };
    try {
      await this.stop("sigterm");
      const executionId = randomUUID();
      receipt.reset = { forgets: resetForgets(this.record), new_execution_id: executionId };
      // A checkpoint that wasn't saved recorded nothing to finish, so the receipt must not claim one.
      try { this.commands.checkpoint(receipt); } catch (error) { delete receipt.reset; throw error; }
      writePrdRecord(this.options.stateDirectory, freshResetRecord(this.record, executionId));
      discardResetState(this.options.stateDirectory);
    } catch (error) {
      finish();
      throw new ControlFailure("reset_incomplete", resetFailureReason(error));
    }
    finish();
    return { ok: true, outcome: "reset" };
  }

  /**
   * The confirmation's facts, read when it opens (run restart AC-RESET-03, "The confirmation"): the
   * counts Kiln forgets, and per repository the branch and its commits of its own, the worktree and
   * its uncommitted files, open pull requests and the leaves closed in the plan on the branch.
   */
  async resetPreview(): Promise<ResetPreview> {
    const branch = this.record.settings.featureBranch;
    // A Start that stopped before setup has no entries yet: the PRD's repository, as settings name it.
    const entries: Pick<RepositoryEntry, "name" | "kind" | "mainCheckoutPath" | "github" | "baseBranch" | "worktreePath">[] = this.record.repositories.length ? this.record.repositories : [{ name: this.record.repository.name, kind: "prd", mainCheckoutPath: this.record.repository.mainCheckoutPath, github: this.record.repository.github, baseBranch: this.record.settings.baseBranch, worktreePath: this.record.settings.worktreePath }];
    let closedOnBranch: number | undefined;
    const stays = await Promise.all(entries.map(async entry => {
      const main = expandHome(entry.mainCheckoutPath);
      const unknown: string[] = [];
      const out: ResetPreview["stays"][number] = { repository: entry.name, label: this.labelOf(entry.name), branch, pullRequests: [], unknown };
      const tipRead = await runGit(this.git, main, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]);
      const tip = tipRead.exitCode === 0 ? tipRead.stdout.trim() : undefined;
      const own = tip ? await runGit(this.git, main, ["rev-list", "--count", `refs/remotes/origin/${entry.baseBranch}..${tip}`]) : undefined;
      if (own?.exitCode === 0) out.ownCommits = Number(own.stdout.trim()); else unknown.push("ownCommits");
      const worktree = expandHome(entry.worktreePath);
      if (existsSync(worktree)) {
        out.worktree = displayPath(worktree);
        const files = await uncommittedFiles(this.git, worktree);
        if (files) out.uncommittedFiles = files.length; else unknown.push("uncommittedFiles");
      }
      const pull = await openPullRequest(this.options.tools.gh, this.options.env, main, entry.github, branch, entry.baseBranch, this.abort.signal);
      if (pull && "unknown" in pull) unknown.push("pullRequests"); else if (pull) out.pullRequests.push(pull);
      if (entry.kind === "prd") {
        try { closedOnBranch = tip ? leavesOf((await observeGitPlan(this.git, main, writtenDirectory(this.record), tip)).plan).filter(leaf => leaf.closed).length : undefined; }
        catch { closedOnBranch = undefined; }
        if (closedOnBranch === undefined) unknown.push("closedOnBranch");
      }
      return out;
    }));
    return { forgets: resetForgets(this.record), stays, ...(closedOnBranch === undefined ? {} : { closedOnBranch }) };
  }

  /** Set on an engine a reset built: the latest start-check step (AC-RESET-04). */
  resetStart: ResetStartChecks | undefined;

  /**
   * Documents found on a page a reset built, for the current selection: the uncommitted-files check
   * gives way when the selection adopts the checkout `kiln run` was run from (A reset run from the adopted worktree).
   */
  resetDocuments(): DocumentsFound | undefined {
    if (!this.resetStart || this.record.startedAt !== undefined) return undefined;
    const checkout = this.paths.suppliedCheckoutPath ?? this.paths.mainCheckoutPath;
    return startCheckDocuments(join(checkout, this.paths.prdDirectoryFromRoot), this.paths.folderName, this.resetStart.report, this.labelOf(this.paths.repositoryName), this.paths.prdDirectoryFromRoot, this.resetAdoptsCheckout());
  }

  /** Whether the selection adopts the checkout `kiln run` was run from, so its uncommitted files don't fail a check. */
  private resetAdoptsCheckout(): boolean {
    const checkout = this.paths.suppliedCheckoutPath ?? this.paths.mainCheckoutPath;
    const real = (path: string) => { try { return realpathSync.native(expandHome(path)); } catch { return path; } };
    const prd = this.startPreview?.from === "existing" ? this.startPreview.repositories.find(repository => repository.kind === "prd") : undefined;
    return !!prd?.worktree?.adopted && real(prd.worktree.path) === real(checkout);
  }

  /**
   * A start check failing on a page a reset built, as `resetDocuments` counts them: Kiln reports
   * it, and asks about no repository until a reload finds every check passing (AC-ASK-01).
   */
  get resetCheckFailing(): boolean {
    const report = this.resetStart?.report;
    if (!report || this.record.startedAt !== undefined) return false;
    if (report.missingDocuments.length > 0) return true;
    return report.problems.some((problem) => problem !== report.uncommitted || !this.resetAdoptsCheckout());
  }

  /**
   * An engine built by a reset reruns the start-check step before Start, on each event-stream
   * connection, and replaces its report, PRD tree, plan and named repositories (Start checks on the page).
   */
  async rerunStartChecks(): Promise<boolean> {
    if (this.reviewStop === "final") { await this.readFinalStartChecks(); return true; }
    if (!this.options.startChecks || this.record.startedAt !== undefined || this.settingUp) return false;
    const checks = await this.options.startChecks();
    for (const line of checks.report.lines) this.repositoryLine(line);
    this.resetStart = checks;
    if (checks.prdTree === undefined) delete this.options.prdTree; else this.options.prdTree = checks.prdTree;
    if (checks.report.plan === undefined) delete this.options.startPlan; else this.options.startPlan = checks.report.plan;
    // A tier line read again can move an activity to the other agent (Kiln Phase Model Tiers AC-TIER-01, AC-PICK-01).
    this.syncNeededAgents();
    this.options.namedRepositories = checks.report.repositories;
    if (checks.report.plan) this.plan = checks.report.plan;
    this.setNamedRows(checks.report.named);
    return true;
  }

  async startAgain(): Promise<CommandResult> {
    const stopped = this.stoppedPhaseKey();
    const key = isPreflightKey(stopped) ? stopped : this.stoppedPhase();
    if (key === undefined || !this.startAgainControl().offered) return refuse(key !== undefined && this.preflightStopKey() === key ? PREFLIGHT_STOP_REASON : "Start again isn't offered here.");
    if (this.commands.active?.instruction.action === "start-again" ? this.current?.processRunning || this.checking || this.driving || this.stopping : this.launchBusy()) return refuse("Kiln is checking or starting work. Try again when it has finished.");
    const blocked = this.launchRestriction() ?? (this.codexSafetyProblems(key, false).length ? "Kiln found a Codex safety problem." : undefined);
    if (blocked) return refuse(blocked);
    this.checking = true;
    this.changed();
    // The preflight changes nothing in the repositories, so its Start again catches no branch up.
    try { if (!isPreflightKey(key)) await this.catchUpAtStop(key); }
    catch (error) {
      this.checking = false;
      this.changed();
      if (error instanceof CatchUpFailure) return { ok: false, status: 409, code: error.code, reason: error.message };
      throw error;
    }
    this.requestedLaunch = { phaseKey: key, kind: "start_again" };
    this.changed();
    this.kick();
    return { ok: true, outcome: "resume_requested" };
  }

  /**
   * The field errors for the two limits (AC-CHOICE-02): a whole number of 1 or more, never below the
   * runs of that audit already made in this execution, the one under way included (the floor).
   */
  loopLimitErrors(loops: Partial<AuditLoopSettings>): FieldErrors {
    const fieldErrors: FieldErrors = {};
    for (const [field, kind] of [["deliveryLimit", "delivery"], ["testLimit", "test"]] as const) {
      const value = loops[field];
      if (value === undefined) continue;
      const floor = limitFloor(this.record, kind);
      if (!validLimit(value)) fieldErrors[field] = "Enter a whole number of 1 or more.";
      else if (value < floor) fieldErrors[field] = `Enter ${floor} or more: this run has already made ${floor} ${kind} audit ${floor === 1 ? "loop" : "loops"}.`;
    }
    return fieldErrors;
  }

  /**
   * Changes settings: keep-awake and the loop limits at any time (AC-VIEW-08); the worktree and
   * branches only before Start (AC-START-06). Models are chosen for each activity, not here
   * (Kiln Phase Model Tiers AC-KEEP-01).
   */
  async changeSettings(change: Partial<Settings>, loops?: Partial<AuditLoopSettings>): Promise<CommandResult> {
    let pendingLoops: AuditLoopSettings | undefined;
    if (this.settingUp) return refuse("Kiln is preparing the accepted workspace. Wait before changing settings.");
    if (change.auditLoops !== undefined) { loops = change.auditLoops; change = { ...change }; delete change.auditLoops; }
    if (loops) {
      // The two limits, before Start as a draft and during a run from the page or `kiln settings` (AC-CHOICE-01, AC-CHOICE-02).
      // A limit cannot be set below the runs of that audit already made, the one under way included.
      const fieldErrors = this.loopLimitErrors(loops);
      if (Object.keys(fieldErrors).length) return { ok: false, status: 422, reason: "The audit loop settings don't pass their checks.", fieldErrors };
      const current = loopSettings(this.record.settings);
      const next: AuditLoopSettings = { ...current, ...(loops.deliveryLimit !== undefined ? { deliveryLimit: loops.deliveryLimit } : {}), ...(loops.testLimit !== undefined ? { testLimit: loops.testLimit } : {}) };
      if (!Object.keys(change).length) { this.record.settings.auditLoops = next; this.save(); this.changed(); return { ok: true }; }
      // With other settings in the same change, the loop settings are saved with them, once nothing refuses.
      pendingLoops = next;
    }
    if (this.checking && this.phaseRecoveryTarget()) return refuse("Kiln is checking or resuming this phase. Wait before changing settings.");
    if (change.waitAtEarlyReview !== undefined) {
      const wait = this.waitAtEarlyReviewSetting();
      if (!wait) return refuse("This run has no early review.");
      if (!wait.canChange) return refuse("Wait for me at the early review can be changed only until the PRD's refinement finishes.");
    }
    if (this.billing.busy) return refuse("Billing approval is being saved.");
    if (change.developmentDeployments !== undefined && (this.record.startedAt || this.settingUp)) return refuse("Development targets are fixed for this execution after Start.");
    const fixedFields = (["workspaceFolder", "worktreePath", "featureBranch", "baseBranch", "bases"] as const).filter((field) => change[field] !== undefined);
    if (fixedFields.length > 0 && (this.record.startedAt !== undefined || this.settingUp)) {
      return refuse(
        this.multiRepository
          ? "The workspace folder, feature branch and every repository's base branch are fixed once Start is pressed."
          : "The worktree, feature branch and base branch are fixed once Start is pressed.",
      );
    }
    // A one-repository PRD's workspace folder is the default, where a repository a session adds goes (AC-SPACE-03).
    if (change.workspaceFolder !== undefined && !this.multiRepository) return { ok: false, status: 400, reason: "A one-repository PRD's workspace folder is the default." };
    // After a Start that failed partway: the workspace folder and feature branch, and each set-up repository's base, stay as set up.
    if (this.workspaceFixed && (["workspaceFolder", "worktreePath", "featureBranch"] as const).some((field) => change[field] !== undefined)) {
      return refuse("The workspace folder and feature branch are fixed once a repository is set up.");
    }
    if (change.bases !== undefined && change.bases[this.paths.repositoryName] !== undefined) {
      return { ok: false, status: 400, reason: "Set the PRD's repository's base with baseBranch." };
    }
    const fixedBase = (name: string) => {
      const entry = this.record.repositories.find((candidate) => candidate.name === name);
      return entry !== undefined && (entry.setupCompletedAt !== undefined || (this.workspaceFixed && entry.createdBranch !== undefined));
    };
    const fixedBases = [...(change.baseBranch !== undefined ? [this.paths.repositoryName] : []), ...Object.keys(change.bases ?? {})].filter(fixedBase);
    if (fixedBases.length > 0) return refuse(`The base of ${fixedBases.join(" and ")} is fixed: Kiln already made its branch.`);
    // Paths are stored absolute (technical design, "Paths shown"); a leading ~ is expanded.
    if (change.worktreePath !== undefined) change = { ...change, worktreePath: expandHome(change.worktreePath) };
    if (change.workspaceFolder !== undefined) change = { ...change, workspaceFolder: expandHome(change.workspaceFolder) };
    if (change.bases !== undefined) change = { ...change, bases: { ...this.record.settings.bases, ...change.bases } };
    for (const [field, value] of Object.entries(change)) {
      if (value !== undefined && field !== "modelChoices") (this.record.settings as unknown as Record<string, unknown>)[field] = value;
    }

    // A feature branch chosen or typed keeps the starting point it was chosen under (run restart "The starting point").
    if (change.featureBranch !== undefined && this.record.startedAt === undefined) this.record.start ??= { ...this.startChoice };
    if (pendingLoops) this.record.settings.auditLoops = pendingLoops;
    this.save();
    if (change.keepAwake !== undefined) this.updateKeepAwake();
    // Switched off during a wait, the phase goes to Needs you; once the end of the wait's resume
    // has begun, its failing check is that stop instead (usage-limit recovery AC-AUTO-04).
    const waiting = this.waitingPhaseKey();
    if (change.resumeAfterUsageLimit === false && waiting !== undefined && !this.checking) {
      const wait = this.record.phases[waiting]!.wait!;
      this.waitToStop(waiting, wait.checks, wait.checkedAt);
    }
    // Only a base change makes the view say Kiln is checking the base on origin (UI-010 item 4).
    if (fixedFields.length > 0) await this.runFieldChecks(change.baseBranch !== undefined || change.bases !== undefined);
    this.changed();
    return { ok: true };
  }

  /** A grant is a separate human action, never a settings change or Resume side effect. */
  authorizeDevelopmentTarget(body: Record<string, unknown>): CommandResult {
    if (!body || typeof body.executionId !== "string" || !Number.isSafeInteger(body.authorizationRevision)) return { ok: false, status: 400, reason: "Submit executionId, authorizationRevision and the repository branch to authorize." };
    let target: MergeTarget;
    try { target = normalizeMergeTarget(body.target); } catch (error) { return { ok: false, status: 400, reason: (error as Error).message }; }
    const phaseKey = this.stoppedPhaseKey();
    if (!phaseKey || !this.record.startedAt || this.deliveryBusy || this.checking || this.driving || this.current || this.stopping || this.settingUp) return refuse("Authorize a development target only while Needs you is stopped and idle.");
    const authority = this.record.developmentAuthorization!;
    if (body.executionId !== this.record.executionId) return refuse("Wrong execution.");
    if (!this.setUpRepositories.some(repo => target.repository === `github.com/${repo.github}`.toLowerCase() && target.baseBranch === repo.baseBranch)) return { ok: false, status: 422, reason: "The target must match an assigned repository and its configured base branch." };
    // A retry after lost acknowledgement is idempotent, even with its earlier revision.
    if (authority.grants.some(grant => authorizationTargetKey(grant.target) === authorizationTargetKey(target))) return { ok: true };
    if (body.authorizationRevision !== authority.revision) return refuse("Stale authorization revision; read the current targets again.");
    const before = structuredClone(authority); const beforeLedger = structuredClone(this.record.developmentDelivery);
    try {
      if (!authority.enabled) {
        const leaves = recordedLeaves(this.record.plan ?? []);
        const owner = this.deliveryOwnerFor(phaseKey);
        const stopId = phaseKey === PR_PHASE_KEY || owner.kind === "audit" ? PR_PHASE_KEY : this.judgedId(phaseKey);
        const stopIndex = stopId === PR_PHASE_KEY ? leaves.length : leaves.findIndex(leaf => leaf.id === stopId);
        if (stopIndex < 0) return refuse("Read the current stopped phase plan before granting authority.");
        const phaseIds = leaves.filter((leaf, index) => index <= stopIndex && (leaf.id === stopId || leaf.closed || this.record.phases[leaf.id]?.doneAt)).map(leaf => leaf.id);
        const owners = orderedRecoveryOwners(this.record, this.stateDirectory, phaseIds, owner, id => {
          const facts = this.record.phases[id];
          const first = facts?.sessionIds[0]; return first ? this.sessionRecord(id, first)?.createdAt : undefined;
        }, this.record.phases[phaseKey]!.stop!.at);
        authority.activationRecovery = { ...(owner.kind === "phase" ? { stoppedPhaseId: phaseKey } : {}), stoppedOwner: owner, phaseIds, owners, repositoryNames: this.setUpRepositories.map(repo => repo.name) };
      }
      authority.enabled = true; authority.grants.push({ target, confirmedAt: this.now().toISOString(), source: "needs_you" }); authority.revision++;
      ledger(this.record).currentComplete = false;
      assertDevelopmentState(this.record); this.save(); this.changed(); return { ok: true };
    } catch (error) {
      this.record.developmentAuthorization = before; if (beforeLedger) this.record.developmentDelivery = beforeLedger; else delete this.record.developmentDelivery;
      return refuse(`Development authorization could not be saved: ${(error as Error).message}`);
    }
  }

  private activationChecks(): CheckResult[] {
    const recovery = this.record.developmentAuthorization?.activationRecovery;
    return recovery ? recoveryOwners(recovery).map(owner => ownerDeliveryCheck(this.deliveryContext(), owner)) : [];
  }

  /** Complete, apart from an open after-delivery activity, which reopens the run while it is open (Kiln After Delivery, "While open"). */
  get finished(): boolean { return this.record.completedAt !== undefined && (!deliveryEnabled(this.record) || this.record.developmentDelivery?.currentComplete === true); }
  get currentlyComplete(): boolean { return this.finished && !openAfterDeliveryKey(this.record); }

  /** Audits have activity storage keys, never synthetic implementation phase IDs. */
  auditRecoveryTask(key: string, folder: string): AuditRecoveryTask | undefined {
    const activity = this.record.completionAudits?.activities.find(one => `audit-${one.activityId}` === key);
    if (!activity) return undefined;
    const refusal = latestAuditRefusal(this.stateDirectory, activity);
    return { label: activity.kind === "delivery_audit" ? "Delivery audit" : "Test audit", prdFile: this.pathFrom(folder, this.prdFile()), activityId: activity.activityId, round: activity.round, reportPath: activity.reportPath, skillPath: runnableSkill(activity).path, instructions: this.auditPrompt(activity), ...(refusal ? { lastRefusal: { at: refusal.at, text: `${refusal.code}: ${refusal.reason}${refusal.criteria.length ? ` Criteria: ${refusal.criteria.join(", ")}.` : ""}` } } : {}) };
  }

  deliveryOwnerFor(key: string): DeliveryOwner {
    const audit = this.record.completionAudits?.activities.find(one => `audit-${one.activityId}` === key);
    if (audit) return { kind: "audit", activityId: audit.activityId };
    if (key.startsWith("audit-")) throw new DeliveryRefusal("Unknown assigned audit activity.");
    return { kind: "phase", phaseId: key };
  }

  private deliveryContext(phaseId?: string): DeliveryContext {
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    return { record: this.record, stateDirectory: this.stateDirectory, prdWorktree: this.worktreePath, prdDirectory: this.paths.prdDirectoryFromRoot, git: { ...this.git, signal }, gh: this.options.tools.gh, env: this.options.env, ...(phaseId ? { ...(this.deliveryOwnerFor(phaseId).kind === "phase" ? { phaseId } : {}), owner: this.deliveryOwnerFor(phaseId) } : {}), signal, now: () => this.now().toISOString(), commands: (id, deadline) => this.deliveryCommands(id, deadline), label: (name) => this.labelOf(name) };
  }

  deliveryStatus() {
    const state = ledger(this.record);
    const phaseId = this.current?.phaseKey ?? this.stoppedPhaseKey();
    const owner = phaseId ? this.deliveryOwnerFor(phaseId) : undefined;
    let binding: { documentsDigest: string; requirementManifestDigest?: string } | undefined;
    if (owner && !(owner.kind === "phase" && owner.phaseId === PR_PHASE_KEY)) { try { binding = ownerDocuments(this.deliveryContext(phaseId), owner); } catch { /* The corresponding completion check names unreadable documents. */ } }
    const recovery = this.record.developmentAuthorization?.activationRecovery;
    return { ...(recovery ? { activationRecovery: recoveryOwners(recovery).map(owner => {
      let binding: { documentsDigest: string; requirementManifestDigest?: string } | undefined;
      try { binding = ownerDocuments(this.deliveryContext(), owner); } catch { /* Failed check below names the source. */ }
      return { ...ownerFields(owner), ...(binding ? { documentsDigest: binding.documentsDigest, ...(binding.requirementManifestDigest ? { requirementManifestDigest: binding.requirementManifestDigest } : {}) } : {}), ...ownerDeliveryCheck(this.deliveryContext(), owner) };
    }) } : {}), executionId: this.record.executionId, authorization: this.record.developmentAuthorization ?? restrictedAuthorization(), ...state, repositoryResults: state.repositoryResults.map((result): typeof result & { label?: string } => ({ ...result, label: this.labelOf(result.repository) })), ...(binding ? { documentsDigest: binding.documentsDigest, ...(binding.requirementManifestDigest ? { requirementManifestDigest: binding.requirementManifestDigest } : {}) } : {}), ...(owner ? ownerFields(owner) : {}) };
  }

  async deliveryReadStatus() {
    const status = this.deliveryStatus();
    const ids = [...new Set([...Object.values(this.record.phases).flatMap(one => one.sessionIds), ...(this.record.completionAudits?.activities ?? []).flatMap(one => one.sessionIds)])];
    const availableCommandEvidence: { sessionId: string; id: string; command: string; cwd: string; calledAt: string; resultAt?: string }[] = [];
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    const readings: CodexHistoryReading[] = [];
    try {
      if (deliveryEnabled(this.record)) for (const id of ids) {
        try { for (const command of await this.deliveryCommands(id, signal, readings)) availableCommandEvidence.push({ sessionId: id, id: command.callId, command: command.command, cwd: command.cwd, calledAt: command.calledAt, ...(command.resultAt ? { resultAt: command.resultAt } : {}) }); }
        catch (error) { return { ...status, availableCommandEvidence, commandEvidenceError: (error as Error).message }; }
      }
      return { ...status, availableCommandEvidence };
    } finally { this.recordCodexHistoryCompatibility(readings); }
  }

  /** Uses the same serialization boundary as development mutations and done checks. */
  async auditCommand(action: "status" | "snapshot" | "result", body: Record<string, unknown> = {}): Promise<unknown> {
    if (this.deliveryBusy || this.checking || this.activeCheck || this.stopping || this.settingUp) throw new AuditRefusal("busy", "Kiln is checking or changing execution state.", 409);
    this.deliveryBusy = true;
    let release!: () => void; this.deliveryPending = new Promise<void>(resolve => { release = resolve; });
    const before = structuredClone(this.record.completionAudits); const beforeDelivery = structuredClone(this.record.developmentDelivery);
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    try {
      const context: AdmissionContext = { ...(deliveryEnabled(this.record) ? { developmentChecks: () => [ownerDeliveryCheck(this.deliveryContext(), { kind: "audit", activityId: this.record.completionAudits!.activities.at(-1)!.activityId })] } : {}), record: this.record, stateDirectory: this.stateDirectory, git: { ...this.git, signal }, signal, label: (name) => this.labelOf(name) };
      if (action === "result" && deliveryEnabled(this.record)) await reconcileDelivery(this.deliveryContext());
      const result = action === "status" ? auditStatus(context) : action === "snapshot" ? issueSnapshot() : await submitAudit(context, body);
      signal.throwIfAborted();
      // Direct write: stop cannot silently turn persistence into a no-op.
      writePrdRecord(this.stateDirectory, this.record); this.changed(); return result;
    } catch (error) {
      if (before) this.record.completionAudits = before; else delete this.record.completionAudits;
      if (beforeDelivery) this.record.developmentDelivery = beforeDelivery; else delete this.record.developmentDelivery;
      throw error;
    } finally { this.deliveryBusy = false; release(); this.deliveryPending = undefined; }
  }

  async deliveryCommand(action: "assessment" | "prepare" | "evidence", body: Record<string, unknown>): Promise<CommandResult & { delivery?: unknown }> {
    if (this.deliveryBusy || this.checking || this.activeCheck || this.stopping || this.settingUp) return refuse("Kiln is checking or changing execution state.");
    if (!this.record.executionId || body.executionId !== this.record.executionId || body.revision !== ledger(this.record).revision) return refuse("Wrong execution or stale delivery revision; read kiln delivery status again.");
    const phaseId = this.current?.phaseKey ?? this.stoppedPhaseKey();
    if (!phaseId || !deliveryEnabled(this.record)) return refuse("No authorized development-delivery session is active or stopped.");
    const activeOwner = this.deliveryOwnerFor(phaseId);
    if (action !== "assessment") {
      try { if (body.owner !== undefined || activeOwner.kind === "audit") { const requested = deliveryOwner({ owner: body.owner as DeliveryOwner }); if (ownerKey(requested) !== ownerKey(activeOwner)) return refuse("Delivery request belongs to another active owner."); } }
      catch { return { ok: false, status: 400, reason: "Audit delivery requests require the exact active owner." }; }
    }
    this.deliveryBusy = true;
    let release!: () => void; this.deliveryPending = new Promise<void>(resolve => { release = resolve; });
    const before = structuredClone(this.record.developmentDelivery);
    try {
      const context = this.deliveryContext(phaseId);
      let result: unknown;
      if (action === "assessment") await recordAssessment(context, body);
      else if (action === "prepare") result = await prepareOperation(context, body);
      else await submitEvidence(context, body);
      context.signal?.throwIfAborted();
      ledger(this.record).revision++; ledger(this.record).currentComplete = false;
      assertDevelopmentState(this.record); writePrdRecord(this.stateDirectory, this.record); this.changed(); this.announceDelivery();
      return { ok: true, delivery: { ...this.deliveryStatus(), ...(result ? { result } : {}) } };
    } catch (error) {
      if (before) this.record.developmentDelivery = before; else delete this.record.developmentDelivery;
      return { ok: false, status: error instanceof DeliveryRefusal ? error.status : 409, reason: (error as Error).message };
    } finally { this.deliveryBusy = false; release(); this.deliveryPending = undefined; }
  }

  /** `readings` collects a multi-session pass's Codex readings so the pass records its notice once. */
  private async deliveryCommands(id: string, deadline?: AbortSignal, readings?: CodexHistoryReading[]): Promise<CommandEvidence[]> {
    const signal = deadline ? AbortSignal.any([this.abort.signal, deadline]) : this.abort.signal; signal.throwIfAborted();
    const audit = this.record.completionAudits?.activities.find(one => one.sessionIds.includes(id));
    const phaseKey = audit ? `audit-${audit.activityId}` : Object.entries(this.record.phases).find(([, facts]) => facts.sessionIds.includes(id))?.[0];
    const session = phaseKey ? this.sessionRecord(phaseKey, id) : undefined;
    if (!session) throw new DeliveryRefusal("The command session does not belong to this execution.");
    if (session.agentId === "codex") {
      if (!session.conversation?.threadId || !session.conversation.codexHome || !this.options.tools.codex) throw new DeliveryRefusal("Codex command history is unavailable.");
      const audit = await auditCodexConversation({ threadId: session.conversation.threadId, codexHome: session.conversation.codexHome, worktrees: this.setUpRepositories.map(one => one.worktreePath), cwd: this.workingDirectoryOf(session), executable: this.options.tools.codex, env: this.options.env, signal, commandProjection: true });
      if (readings) readings.push({ session, compatibility: audit.compatibility });
      else this.recordCodexHistoryCompatibility([{ session, compatibility: audit.compatibility }]);
      if (audit.coverage !== "complete") throw new DeliveryRefusal(`Codex command evidence is incomplete: ${audit.problems.join(" ")}`);
      return audit.commands ?? [];
    }
    const files = findTranscripts(claudeConfigFolder(this.options.env), id);
    if (!files.main) throw new DeliveryRefusal("Claude command transcript is unavailable.");
    const calls: CommandEvidence[] = [];
    for (const file of [files.main, ...files.subagents]) {
      signal.throwIfAborted(); const transcript = readTranscript(file); signal.throwIfAborted(); if (transcript.problem) throw new DeliveryRefusal(`Unreadable Claude command history: ${file}: ${transcript.problem}`);
      for (const call of transcript.calls) if (call.name === "Bash" && call.id && typeof call.input.command === "string" && call.at && call.cwd) calls.push({ source: file, callId: call.id, command: call.input.command, cwd: call.cwd, calledAt: call.at, ...(call.result?.at ? { resultAt: call.result.at, outcome: call.result.isError ? "error" : "success", output: call.result.text } : {}) });
    }
    return calls;
  }

  /**
   * A schema failure in Codex history writes a `codex_history` notice naming the read session's latest
   * launch profile version; a read on another Codex version that finds none clears it (AC-AGENT-04).
   */
  private recordCodexHistoryCompatibility(readings: CodexHistoryReading[]): void {
    if (readings.length && applyCodexHistoryReadings(this.record, readings, this.now().toISOString())) { this.save(); this.changed(); }
  }

  private announceDelivery(): void {
    for (const checkpoint of ledger(this.record).checkpoints) {
      const outcomes = [
        { stage: "Merge", outcome: checkpoint.merge ? `confirmed ${checkpoint.merge.url} (${checkpoint.merge.resultSha})` : "unresolved" },
        ...["deployment", "verification"].map(purpose => ({ stage: purpose === "deployment" ? "Deployment" : "Verification", outcome: checkpoint.requirements.filter(one => one.purpose === purpose).every(one => !checkpoint.unresolvedRequirements?.[one.id] && !checkpoint.unresolvedRequirements?.["*"] && checkpoint.evidence.some(fact => fact.requirementId === one.id && fact.status === "success")) ? "confirmed" : "unresolved" })),
      ];
      for (const one of outcomes) {
        const key = JSON.stringify([checkpoint.id, one, checkpoint.unresolvedReason]); if (this.announcedDelivery.has(key)) continue;
        this.announcedDelivery.add(key); this.emit({ kind: "delivery", at: this.now(), repository: checkpoint.target.repository, environment: checkpoint.target.environment, stage: one.stage, outcome: `${one.outcome}${checkpoint.unresolvedReason ? `: ${checkpoint.unresolvedReason}` : ""}` });
      }
    }
  }

  deliveryAuthority(): string | undefined {
    if (!deliveryEnabled(this.record)) return undefined;
    return JSON.stringify({ cli: { executable: process.execPath, script: fileURLToPath(new URL("../cli.js", import.meta.url)) }, executionId: this.record.executionId, featureBranch: this.record.settings.featureBranch, owner: this.current?.phaseKey || this.stoppedPhaseKey() ? this.deliveryOwnerFor((this.current?.phaseKey ?? this.stoppedPhaseKey())!) : undefined, grants: this.record.developmentAuthorization!.grants.map(one => one.target), ledgerRevision: ledger(this.record).revision, activationRecovery: this.record.developmentAuthorization?.activationRecovery, unresolved: ledger(this.record).checkpoints.filter(one => one.unresolvedReason).map(one => ({ id: one.id, reason: one.unresolvedReason })), confirmedMerges: ledger(this.record).checkpoints.flatMap(one => one.merge ? [{ id: one.id, url: one.merge.url, head: one.merge.sourceHead, result: one.merge.resultSha }] : []) }, null, 2);
  }

  /**
   * The plan as read; while a problem a waiver covers stops it from reading, the order Normal
   * Order takes instead: the readable phases in plan order, a leaf whose own document does not
   * read skipped under the waiver, with the plan warning for what Kiln reaches (AC-WAIVE-04).
   */
  private async planOrWaivedOrder(): Promise<{ ok: true; plan: PhasePlan; warning?: { kind: "plan"; waiverId: string } } | { ok: false; problem: string }> {
    const read = await this.readPlan();
    if (read.ok) return read;
    const waiver = !read.unavailable && knownProblemWaiver(this.record.waivers, read.problem);
    if (!waiver) return read;
    const phases = this.orderSource();
    for (const leaf of recordedLeaves(this.record.plan ?? [])) {
      // A recorded leaf missing from the readable phases, its document gone or unreadable, cannot start: skipped under the waiver.
      if (phases.some(phase => phase.id === leaf.id) || leaf.closed || this.record.phases[leaf.id]?.doneAt || this.record.phases[leaf.id]?.skippedByWaiver) continue;
      const facts = this.phaseFacts(leaf.id);
      facts.skippedByWaiver = waiver.waiverId; facts.waiverWarning = { kind: "plan", waiverId: waiver.waiverId };
    }
    this.save();
    return { ok: true, plan: { phases, problems: [] }, warning: { kind: "plan", waiverId: waiver.waiverId } };
  }

  /** A grant may precede the stopped leaf's very first provider session (plan/readiness stop). */
  private nextExecutionLeaf(plan: PhasePlan): PlannedPhase | undefined {
    const activation = this.record.developmentAuthorization?.activationRecovery;
    // A waived missing activation-recovery phase lifts the recovery gate (AC-WAIVE-04).
    const recoveryWaived = knownProblemWaiver(this.record.waivers, ACTIVATION_MISSING);
    if (activation && !recoveryWaived && !this.record.phases[recoveryStopKey(activation)]?.sessionIds.length && this.activationChecks().some(check => !check.passed)) return judgedPhase(plan.phases, recoveryStopKey(activation));
    const leaf = nextLeaf(effectivePlan(plan, this.record, this.carriedClosed()).plan);
    if (leaf && activation && recoveryWaived && !this.record.phases[leaf.id]?.waiverWarning) { this.phaseFacts(leaf.id).waiverWarning = { kind: "plan", waiverId: recoveryWaived.waiverId }; }
    return leaf;
  }

  private async unresolvedDeliveryLeaf(): Promise<string | undefined> {
    if (!deliveryEnabled(this.record)) return undefined;
    await reconcileDelivery(this.deliveryContext());
    const activation = this.record.developmentAuthorization?.activationRecovery;
    // Under a waived missing recovery phase, unmet recovery obligations stop Kiln only as their own failing development checks.
    if (activation && !knownProblemWaiver(this.record.waivers, ACTIVATION_MISSING)) {
      const failed = this.activationChecks().filter(check => !check.passed);
      if (failed.length && !this.record.phases[recoveryStopKey(activation)]?.sessionIds.length) {
        // Launch the authorized stopped leaf once its original blocker clears. Its first
        // session supplies the historical assessments; no future leaf can overtake it.
        if (recoveryStopKey(activation) === PR_PHASE_KEY || this.auditActivity(recoveryStopKey(activation)) || judgedPhase(this.record.plan ?? [], recoveryStopKey(activation))) return undefined;
        this.recordStop(recoveryStopKey(activation), "plan", [{ name: CHECK_NAMES.plan, passed: false, facts: [ACTIVATION_MISSING] }]); return recoveryStopKey(activation);
      }
      if (failed.length && !await this.markChecks(recoveryStopKey(activation), failed)) { this.recordStop(recoveryStopKey(activation), recoveryStopKey(activation) === PR_PHASE_KEY ? "pull_request_check" : "done_check", failed); return recoveryStopKey(activation); }
    }
    const closedAtBase = await leavesClosedAtRunBase(this.deliveryContext());
    for (const leaf of recordedLeaves(this.record.plan ?? [])) {
      if (!leaf.closed && !this.waiverClosed(leaf.id)) break;
      // A skipped phase was not built; its delivery obligations are not asked for (AC-WAIVE-04).
      if (this.record.phases[leaf.id]?.skippedByWaiver) continue;
      // A phase Closed before this run began that nothing in the run touched owes no development evidence (AC-DEV-03).
      if (!owesDevelopmentEvidence(this.record, leaf.id, closedAtBase.has(leaf.id))) continue;
      const accepted = this.record.planReconciliation?.baselineId ? readBaseline(this.stateDirectory, this.record.planReconciliation.baselineId) : undefined;
      if ((this.record.continuation?.acceptances.some(row => row.state === "active" && row.newExecutionId === this.record.executionId) || this.record.folderSetupStart) && !this.record.phases[leaf.id] && (accepted?.completions[leaf.id] || this.record.preparation?.bindings.some(binding => preparesPhase(binding, leaf.id)))) continue;
      // A finished leaf the loop never bound, before later phases changed the shared documents, is bound from the commit its session finished on.
      await bindAtFinish(this.deliveryContext(leaf.id), leaf.id);
      const check = phaseDeliveryCheck(this.deliveryContext(leaf.id), leaf.id);
      if (!await this.markChecks(leaf.id, [check])) { this.recordStop(leaf.id, "done_check", [check]); return leaf.id; }
      // Finished and met: from here only a change to its own phase document asks for its assessment again.
      acceptPhaseDocuments(this.deliveryContext(leaf.id), leaf.id);
    }
    this.save(); return undefined;
  }

  // ---- Stopping: Ctrl+C, a closed terminal and signals -----------------------------------

  /**
   * The stop sequence (AC-KEEP-02; technical design, "Stopping a session"): marks a live run
   * interrupted first, so the record is right even if Kiln is killed partway; sends the session
   * the interrupt request; waits up to 30 seconds for it to exit; then ends its whole tree; and
   * releases keep-awake. From the first step on, nothing is judged. A second call (a second
   * Ctrl+C) skips the rest of the wait.
   *
   *   const report = await engine.stop("sigint");
   *   report.text  // "Interrupted phase 2b, Store credit."
   */
  stop(cause: InterruptCause): Promise<StopReport> {
    if (this.stopPromise) {
      this.skipStopWait?.();
      return this.stopPromise;
    }
    this.stopPromise = this.runStop(cause);
    return this.stopPromise;
  }

  private async runStop(cause: InterruptCause): Promise<StopReport> {
    // Exit Kiln stops as SIGTERM does, with its own last line (Kiln After Delivery AC-EXIT-02); no session runs to record it.
    const report = this.exiting && cause === "sigterm" ? { text: `Kiln exited from ${this.exiting.via === "browser" ? "the page" : "the command line"}.`, grey: `Run ${this.exiting.command} to open it again.` } : this.describeStop();
    this.stopping = cause;

    // 1. The interruption is written on the live run before anything else.
    const session = this.current?.session;
    const run = session?.runs.at(-1);
    if (session && run && run.endedAt === undefined) {
      run.interruptedBy = cause;
      run.interruptedAt = this.now().toISOString();
      writeSessionRecord(this.options.stateDirectory, session);
    }

    // 2. Every git and gh call still running ends; the session gets the interrupt request.
    this.abort.abort();
    const control = this.control;
    if (session?.agentId !== "codex") control?.interrupt();

    // 3 and 4. Up to 30 seconds for it to exit, then its whole tree is ended.
    if (control) {
      const skipped = new Promise<void>((resolve) => (this.skipStopWait = resolve));
      const exited = await raceTimeout(control.closed, this.options.stopWaitMs ?? STOP_WAIT_MS, skipped);
      if (!exited) {
        control.endTree("SIGTERM");
        if (process.platform !== "win32" && !(await raceTimeout(control.closed, this.options.killGraceMs ?? KILL_GRACE_MS))) control.endTree("SIGKILL");
      }
    }
    // A left-over process being stopped is seen through, so none is left behind (AC-KEEP-02).
    if (this.orphanStop) await this.orphanStop;
    // The engine loop winds down, recording the run's end and judging nothing.
    await raceTimeout(this.settled(), 10_000);

    // 5. Keep-awake is released; the caller closes the rest and prints the line.
    this.close();
    return report;
  }

  /** A paused Pause now's current obstacle, the reason its Resume is refused. */
  private pausedObstacle(): string | undefined {
    const hold = this.record.liveControl?.takeover;
    return hold && hold.kind !== "delivery_recovery" && hold.releasedAt !== undefined && hold.state !== "released" ? hold.obstacle?.reason ?? hold.reason : undefined;
  }

  /** Where a Pause now hold stands, read from the record alone: the activity and whether it has released (Kiln Pause Now, "kiln run terminal lines"). */
  pauseNowPhase(): { key: string; phase: "pausing" | "paused" } | undefined {
    const hold = this.record.liveControl?.takeover;
    if (!hold || hold.kind === "delivery_recovery") return undefined;
    return { key: hold.target.activityKey, phase: hold.releasedAt !== undefined ? "paused" : "pausing" };
  }

  /** The line a stop prints, for what Kiln is doing as it begins (UI-010 item 3). */
  private describeStop(): StopReport {
    const { record } = this;
    const name = (key: string) => (key === PR_PHASE_KEY ? "the pull request" : this.auditActivity(key) ? this.auditName(key)!.sentence : isPreflightKey(key) ? "the preflight" : `phase ${this.judgedId(key)}`);
    const pause = this.pauseNowPhase();
    if (pause) return { text: pause.phase === "paused" ? `Kiln stopped while paused in ${name(pause.key)}.` : `Kiln stopped while ${name(pause.key)} was pausing.`, grey: "kiln run picks it back up." };
    const run = this.current?.session?.runs.at(-1);
    // A live run, or an interrupted session about to be resumed: either way its phase is interrupted.
    const interrupted = this.current?.session && run && run.endedAt === undefined ? this.current.phaseKey : this.interruptedKey;
    if (interrupted !== undefined) {
      const kept = "Its session and uncommitted work are kept." + (this.current?.session?.agentId === "codex" ? ` ${CODEX_NATIVE_CLEANUP_WARNING}` : "");
      if (interrupted === PR_PHASE_KEY) return { text: "Interrupted the pull-request session.", grey: kept };
      const judged = this.judgedId(interrupted);
      return { text: `Interrupted phase ${judged}, ${this.titleOf(judged)}.`, grey: kept };
    }
    if (this.activeCheck !== undefined) return { text: `Kiln stopped while checking ${name(this.activeCheck)}.`, grey: "kiln run checks it again." };
    // Setup is under way once Start is recorded; a stop during the base check before that recorded nothing.
    if (record.startedAt !== undefined && record.setupCompletedAt === undefined) {
      return { text: `Kiln stopped before ${name(this.nextKeyFromRecordedPlan())} started.`, grey: "kiln run picks it back up." };
    }
    if (record.startedAt === undefined) return { text: "Kiln stopped.", grey: "Nothing was started." };
    if (this.currentlyComplete) return { text: "Kiln stopped.", grey: `${this.paths.featureName} is complete.` };
    const waiting = this.waitingPhaseKey();
    if (waiting !== undefined) {
      const subject = waiting === PR_PHASE_KEY ? "the pull-request session" : `phase ${this.judgedId(waiting)}`;
      return { text: `Kiln stopped while ${subject} waited for usage.`, grey: "kiln run checks it and waits again." };
    }
    const stopped = this.stoppedPhaseKey();
    if (stopped !== undefined) {
      const subject = stopped === PR_PHASE_KEY ? "The pull request" : isPreflightKey(stopped) ? "The preflight" : `Phase ${this.judgedId(stopped)}`;
      return { text: "Kiln stopped.", grey: `${subject} still needs you; kiln run checks it again.` };
    }
    if (record.pause.activeSince !== undefined) return { text: `Kiln stopped while paused before ${name(this.nextKeyFromRecordedPlan())}.` };
    // Between phases: the moment after a Done and before the next session spawns.
    return { text: `Kiln stopped before ${name(this.nextKeyFromRecordedPlan())} started.`, grey: "kiln run picks it back up." };
  }

  /**
   * Never two processes on one session: when the session's latest run is still alive (the same
   * PID and process start time), it is stopped before anything else touches the session. Its
   * stdin closed with the Kiln that started it, so it can't be sent the interrupt request; on
   * macOS and Linux it gets SIGINT to its group, the stop proof gate 1 showed leaves it
   * resumable, then the same wait and forced end as a stop.
   */
  private async stopLiveProcess(session: SessionRecord): Promise<void> {
    this.orphanStop = this.stopLeftOverProcess(session);
    try {
      await this.orphanStop;
    } finally {
      this.orphanStop = undefined;
    }
  }

  private async stopLeftOverProcess(session: SessionRecord): Promise<void> {
    const run = session.runs.at(-1);
    if (session.agentId === "codex" && run?.codex) {
      if (!run.endedAt || run.codex.cleanup !== "tracked_processes_stopped" || run.codex.reconciliation === "ambiguous") {
        try { await reconcileCodexAttempt({ executable: this.options.tools.codex!, env: this.options.env, record: session, stateDirectory: this.options.stateDirectory }); }
        catch { /* The durable cleanup failure is shown by the checks; never resume blindly. */ }
      }
      return;
    }
    if (run?.pid === undefined || !(await isProcessLive(run.pid, run.processStartTime))) return;
    const pid = run.pid;
    const gone = async (ms: number) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if (!(await isProcessLive(pid, run.processStartTime))) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return !(await isProcessLive(pid, run.processStartTime));
    };
    if (process.platform !== "win32") endProcessTree(pid, "SIGINT");
    if (await gone(this.options.stopWaitMs ?? STOP_WAIT_MS)) return;
    endProcessTree(pid, "SIGTERM");
    if (process.platform !== "win32" && !(await gone(this.options.killGraceMs ?? KILL_GRACE_MS))) endProcessTree(pid, "SIGKILL");
  }

  /**
   * Releases keep-awake, stops reading sleep and ends every helper call still running; for when
   * Kiln exits, or drops this engine for another (a Start whose setup couldn't finish). A closed
   * engine starts no helper and leaves none running, so a later Ctrl+C has none left to end.
   * A live Codex session listens on the same signal and is interrupted; a Claude session isn't.
   */
  close(): void {
    this.closed = true;
    this.abort.abort();
    this.defaultsWatch?.close();
    if (this.takeoverTimer) clearInterval(this.takeoverTimer);
    if (this.recoveredTimer) clearInterval(this.recoveredTimer);
    this.offClaude?.();
    this.offUsage?.();
    for (const id of AGENT_IDS) this.readers[id].close();
    if (this.sleepTimer) clearInterval(this.sleepTimer);
    this.sleepTimer = undefined;
    this.unwatchWait();
    this.updateKeepAwake();
  }

  /**
   * Keep-awake is held while a session's process runs or a wait is recorded and the setting is
   * on, and released otherwise (usage-limit recovery AC-AUTO-03).
   */
  private updateKeepAwake(): void {
    const working = this.current?.processRunning === true || this.waitingPhaseKey() !== undefined;
    const on = !this.closed && this.stopping === undefined && this.record.settings.keepAwake && working;
    this.options.keepAwake?.set(on);
  }

  /** Reads the suspend record every 10 seconds from the first session or check on. */
  private watchSleep(): void {
    if (this.sleepTimer || this.closed) return;
    this.sleepTimer = setInterval(() => void this.readSleep(true), this.options.sleepCheckMs ?? SLEEP_CHECK_MS);
    this.sleepTimer.unref();
  }

  /**
   * Takes a sleep reading and records each sleep found on the run still working, so it belongs
   * to that run and never to a run started later. A reading already under way is joined.
   * `save` is false at the start of handling a process's end, whose one write carries it.
   */
  private readSleep(save: boolean): Promise<void> {
    this.sleepReading ??= (async () => {
      try {
        if (this.stopping) return;
        const sleeps = await this.sleepReader.next();
        if (sleeps.length === 0) return;
        this.lastWakeAt = Date.now();
        // During a wait, waking asks for a reading, and the reset reading is armed again (AC-AUTO-03).
        if (this.waitWatch !== undefined) {
          this.armResetReading();
          this.askReading();
        }
        const detectedAt = this.now().toISOString();
        const session = this.current?.session;
        const runIndex = (session?.runs.length ?? 0) - 1;
        if (!session || runIndex < 0 || session.runs[runIndex]!.endedAt !== undefined) return;
        for (const sleep of sleeps) session.sleeps.push({ at: sleep.at, seconds: sleep.seconds, detectedAt, run: runIndex });
        if (save) writeSessionRecord(this.options.stateDirectory, session);
      } finally {
        this.sleepReading = undefined;
      }
    })();
    return this.sleepReading;
  }

  private emitSessionEvent(phaseKey: string, event: "interrupted" | "resumed" | "stopped" | "paused" | "waiting", limit?: { label: string; resetsAt?: string }): void {
    const extra = limit === undefined ? {} : { limit };
    if (phaseKey === PR_PHASE_KEY) this.emit({ kind: "pull_request", at: this.now(), event, ...extra });
    else if (phaseKey === MERGE_KEY) this.emit({ kind: "merge", at: this.now(), event, ...extra });
    else if (isPlanPushKey(phaseKey)) this.emit({ kind: "plan_push", at: this.now(), event, ...extra });
    else if (this.auditActivity(phaseKey)) this.emitAudit(this.auditActivity(phaseKey)!, event, limit);
    else if (this.preflightActivity(phaseKey)) this.emitPreflight(this.preflightActivity(phaseKey)!, event, limit);
    else {
      const judged = this.judgedId(phaseKey);
      this.emit({ kind: "phase", at: this.now(), phaseId: judged, title: this.titleOf(judged), event, ...extra });
    }
  }

  private continuationReference(action: JournalAction, inputs: Record<string, unknown>, execution?: string) {
    return this.record.continuation?.acceptances.find(row => (execution === undefined || row.completedExecutionId === execution) && (action === "continuation-accept" ? row.proposalId === inputs.proposal_id : row.id === inputs.acceptance_id));
  }

  /**
   * The finished page's Check for new phases and Continue with N phases as `kiln status` controls
   * (AC-BOT-01), each with whether it is available and why not. Authorize early merges stays in the browser.
   */
  newPhaseControls(): { name: "check-for-new-phases" | "continue-with-phases"; available: boolean; reason: string | null }[] {
    const idle = !this.checking && !this.driving && !this.settingUp && !this.deliveryBusy && !this.stopping && !this.billing.busy && !this.commands?.busy;
    const finished = this.currentlyComplete;
    const proposal = this.record.completedPlanCheck?.result?.proposal;
    const needsAuthorization = !!proposal?.authorization?.targets.some(target => !target.granted);
    // A missing grant also blocks readiness, so it is named first: that authorization stays in the browser.
    const notFinished = openPlanPush(this.record) ? "Continue is pushing the plan first. Kiln starts the build, or shows what it found, once origin holds the plan." : "The run isn't finished, so there is nothing to check for new phases.";
    const busy = "Kiln is checking, starting work or preparing a continuation. Try again when it is idle.";
    const offer = !finished ? notFinished : !idle ? busy : !proposal || !proposal.added.length ? "No new phases are offered. Check for new phases first." : needsAuthorization ? "This offer needs Authorize early merges, which stays in the browser." : proposal.readiness !== "ready" ? `The offer to continue isn't ready: ${proposal.problems.join(" ") || "run kiln check-for-new-phases for its problems."}` : null;
    return [
      { name: "check-for-new-phases", available: finished && idle, reason: !finished ? notFinished : !idle ? busy : null },
      { name: "continue-with-phases", available: offer === null, reason: offer },
    ];
  }

  private continuationControl(instruction: import("../control/commands.js").Instruction) {
    // Start on the Folder missing page is offered while the mode is set; its own checks say why it can't act.
    if (instruction.action === "folder-setup-start") return { available: !!this.folderMissing, reason: this.folderMissing ? null : "The run’s folders are in place; there is nothing to set up again." };
    // Cancel is admitted wherever a Pause now hold exists; its own step decides stale target or already paused.
    if (instruction.action === "cancel-take-over") { const held = !!this.record.liveControl && this.record.liveControl.takeover.kind !== "delivery_recovery"; return { available: held, reason: held ? null : "No Pause now is pending." }; }
    const known = instruction.action === "continuation-grant" ? undefined : this.continuationReference(instruction.action, instruction.inputs, instruction.execution_id);
    if (known && (instruction.action === "continuation-accept" || known.state === "active" || known.state === "superseded" || known.state === "preparing" && !!this.driving)) return { available: true, reason: null, alreadyApplied: true };
    // Kiln's own acceptance after a push runs while the push is `accepting`, from the loop (Kiln After Delivery AC-BACK-05).
    if (instruction.action === "continuation-accept" && typeof instruction.inputs.plan_push === "string") {
      const push = openPlanPush(this.record);
      const available = !!push?.doneAt && planPushKey(push.operationId) === instruction.inputs.plan_push && !this.settingUp && !this.stopping;
      return { available, reason: available ? null : "The push of the plan this acceptance follows is not waiting for its check." };
    }
    const available = this.currentlyComplete && !this.checking && !this.driving && !this.settingUp && !this.deliveryBusy && !this.stopping && !this.billing.busy && !this.billing.pending;
    return { available, reason: available ? null : "Wait for the current operation and billing read to settle before continuing." };
  }

  async authorizeContinuationTarget(body: Record<string, unknown>) {
    if (Object.keys(body).sort().join() !== "authorizationRevision,commandId,executionId,proposalId,statusToken,target" || typeof body.commandId !== "string" || typeof body.executionId !== "string" || typeof body.statusToken !== "string" || typeof body.proposalId !== "string" || !Number.isSafeInteger(body.authorizationRevision)) return { ok: false, status: 400 as const, reason: "Use the displayed proposal, exact target, authorization revision and command identity." };
    let target: MergeTarget;
    try { target = normalizeMergeTarget(body.target); } catch (error) { return { ok: false, status: 400 as const, reason: (error as Error).message }; }
    const answer = this.commands.submitInternal({ command_id: body.commandId, execution_id: body.executionId, status_token: body.statusToken, action: "continuation-grant", inputs: { authorization_revision: body.authorizationRevision, proposal_id: body.proposalId, target } });
    if (!answer.ok) return { ok: false, status: 409 as const, reason: answer.errors[0]?.message ?? "The target grant was refused." };
    await this.commands.settled();
    if (this.commands.fault) return { ok: false, status: 503 as const, code: "state_write_failed", reason: this.commands.fault };
    const receipt = this.commands.lookup(body.commandId).operation as Receipt;
    if (receipt.state !== "completed") return { ok: false, status: 409 as const, reason: receipt.reason ?? "The grant could not be settled.", code: receipt.outcome };
    const approved = authorityForApproval(this.stateDirectory, receipt.id);
    return { ok: true, status: 200 as const, grant: approved ? { executionId: approved.executionId, valid: approved.state !== "superseded" && (approved.state === "adopted" || approved.executionId === this.record.executionId ? approved.executionId === this.record.executionId : this.record.completedPlanCheck?.result?.proposal?.scopeDigest === approved.scopeDigest) } : undefined, authorization: approved?.authorization, proposal: this.record.completedPlanCheck?.result?.proposal };
  }

  private async grantContinuationTarget(inputs: Record<string, unknown>, receipt: Receipt) {
    const check = await this.checkCompletedPlanOwned();
    const proposal = check.result?.proposal;
    if (!proposal || check.status === "failed") return { ok: false, code: "proposal_changed", reason: "The proposal changed. Review the refreshed exact targets before granting authority." };
    const displayed = readContinuationProposal(this.stateDirectory, inputs.proposal_id as string);
    if (displayed.scopeDigest !== proposal.scopeDigest || displayed.completedExecutionId !== proposal.completedExecutionId) return { ok: false, code: "proposal_changed", reason: "The plan or target changed. Earlier approval is superseded; review the refreshed offer." };
    const target = normalizeMergeTarget(inputs.target);
    const required = proposal.authorization?.targets.find(row => authorizationTargetKey(row.target) === authorizationTargetKey(target));
    if (!proposal.grantEligible || !required || target.environment !== undefined) return { ok: false, code: "prerequisite_blocked", reason: "Read and reconcile the complete preparation scope before authorizing its exact configured target." };
    let pending = pendingForProposal(readPendingAuthority(this.stateDirectory, this.record), proposal);
    if (required.granted && pending) {
      this.writeContinuationMetadata(() => writeDurableMetadata(join(this.stateDirectory, "continuation-approval-links", `${receipt.id}.json`), { formatVersion: 1, authorityId: pending!.id }));
      return { ok: true };
    }
    if (inputs.authorization_revision !== (pending?.authorization.revision ?? 0)) return { ok: false, code: "proposal_changed", reason: "The authorization revision changed. Refresh before granting authority." };
    pending ??= reserveAuthority(proposal);
    pending.authorization.grants.push({ target, confirmedAt: this.now().toISOString(), source: "continuation" });
    pending.authorization.revision++;
    pending.approvals.push({ operationId: receipt.id, commandId: receipt.command_id, target });
    this.commands.enableExecutionIndex();
    this.writeContinuationMetadata(() => writePendingAuthority(this.stateDirectory, pending!));
    this.record.pendingContinuationAuthority = pending.id;
    this.writeContinuationMetadata(() => this.save());
    await this.checkCompletedPlanOwned();
    return { ok: true };
  }

  continuationAcceptance(id?: string) {
    const row = this.record.continuation?.acceptances.find(row => row.id === (id ?? this.record.continuation?.currentAcceptanceId));
    if (!row) return undefined;
    const acceptance = readAcceptance(this.stateDirectory, row.id);
    return { ...row, repositories: acceptance.repositories.map(repo => ({ name: repo.name, label: labelAmong({ shortName: shortNameOf(repo), addressPath: repo.github }, this.labelSet()), worktreePath: repo.worktreePath, baseBranch: repo.baseBranch, baseRevision: repo.baseCommit, ready: !!repo.setupCompletedAt })), branch: acceptance.settings.featureBranch };
  }

  async continuationCommand(action: "accept" | "retry", body: Record<string, unknown>) {
    const key = action === "accept" ? "proposalId" : "acceptanceId";
    if (Object.keys(body).sort().join() !== [key, "commandId", "executionId", "statusToken"].sort().join() || typeof body[key] !== "string" || typeof body.commandId !== "string" || typeof body.executionId !== "string" || typeof body.statusToken !== "string") return { ok: false, status: 400 as const, code: "malformed_request", reason: "Use the displayed proposal/acceptance, execution, command ID and status token." };
    const kind = action === "accept" ? "continuation-accept" : "continuation-retry";
    const inputs = { [action === "accept" ? "proposal_id" : "acceptance_id"]: body[key] };
    const replay = !!this.continuationReference(kind, inputs, body.executionId);
    const answer = this.commands.submitInternal({ command_id: body.commandId, execution_id: body.executionId, status_token: body.statusToken, action: kind, inputs });
    if (!answer.ok) return { ok: false, status: 409 as const, code: answer.errors[0]?.code ?? "wrong_state", reason: answer.errors[0]?.message ?? "The instruction was refused.", check: this.record.completedPlanCheck };
    await this.commands.settled();
    const settled = this.commands.lookup(body.commandId).operation as Receipt;
    const row = this.continuationReference(kind, inputs, body.executionId);
    // Continue on an offer read from the main checkout pushes the plan first; the acceptance follows the push (AC-BACK-05).
    if (settled.state === "completed" && settled.outcome === "plan_push_started") return { ok: true, status: replay ? 200 as const : 202 as const, planPush: planPushKey(settled.id) };
    if (settled.state !== "completed" || !row) return { ok: false, status: (settled.state === "indeterminate" || settled.outcome === "source_unavailable" ? 503 : ["prerequisite_blocked", "preparation_unverified"].includes(settled.outcome ?? "") ? 422 : 409) as 409 | 422 | 503, code: settled.outcome ?? "state_unavailable", reason: settled.reason ?? "The accepted instruction could not be settled; inspect the retained result before retrying.", check: this.record.completedPlanCheck };
    return { ok: true, status: replay ? 200 as const : 202 as const, acceptance: this.continuationAcceptance(row.id) };
  }

  private saveContinuation(acceptance: ContinuationAcceptance): void {
    this.writeContinuationMetadata(() => writeAcceptance(this.stateDirectory, acceptance));
    const state = this.record.continuation!;
    const row = acceptanceSummary(acceptance);
    const index = state.acceptances.findIndex(value => value.id === row.id);
    if (index < 0) state.acceptances.push(row); else state.acceptances[index] = row;
    this.writeContinuationMetadata(() => this.save());
  }

  private writeContinuationMetadata<T>(write: () => T): T {
    if (this.commands?.fault) throw new ControllerFrozen(this.commands.fault);
    try { return write(); }
    catch (error) { if (error instanceof PlanCapacityError) throw error; this.commands.fault = "Continuation metadata could not be durably saved. Restart to reconcile before changing work."; throw error; }
  }

  private async acceptContinuation(inputs: Record<string, unknown>, receipt: Receipt): Promise<Omit<Extract<CommandResult, { ok: true }>, "outcome"> & { outcome?: string } | (Omit<Extract<CommandResult, { ok: false }>, "code"> & { code?: string })> {
    const check = await this.checkCompletedPlanOwned();
    const proposal = check.result?.proposal;
    if (check.status === "failed") return { ok: false, status: 503, code: "source_unavailable", reason: check.errors.join(" ") || "Required plan sources are unavailable. Restore them and retry the check." };
    if (!proposal || proposal.id !== inputs.proposal_id) return { ok: false, status: 409, code: "proposal_changed", reason: "The plan or delivery prerequisites changed. Review the refreshed offer and choose Continue again." };
    if (check.status !== "available" || proposal.readiness !== "ready" || !proposal.added.length) return { ok: false, status: 422, code: "prerequisite_blocked", reason: proposal.problems.join(" ") || "No ready additional work is available." };
    if (proposal.prerequisites.some(row => !["integrated_verified", "preparation_available"].includes(row.status))) return { ok: false, status: 422, code: "preparation_unverified", reason: "Required prerequisites are unresolved." };
    // The automatic acceptance after a push (AC-BACK-05) accepts only the offer the push was opened for.
    const push = typeof inputs.plan_push === "string" ? this.planPushEntry(inputs.plan_push) : undefined;
    if (inputs.plan_push !== undefined && (!push || !push.doneAt || push.closedAt || !this.pushMatches(push, check))) return { ok: false, status: 409, code: "proposal_changed", reason: "The offer changed after the plan was pushed. Review the refreshed offer and choose Continue again." };
    // An offer read from the main checkout is pushed first: the press opens the push activity, and the acceptance waits for it.
    if (proposal.source?.kind === "main_checkout") return this.openPlanPushActivity(inputs, receipt, proposal, check.result!.candidateId);
    const previous = this.record.continuation?.acceptances.find(row => row.completedExecutionId === this.record.executionId && row.state !== "superseded");
    if (previous) {
      if (previous.state !== "blocked") return refuse("An accepted continuation already owns preparation.");
      const old = readAcceptance(this.stateDirectory, previous.id);
      for (const repo of old.repositories) await validatePreparedWorkspace(this.git, old, repo.name);
      old.state = "superseded"; this.saveContinuation(old);
    }
    bindLegacySessions(this);
    // The push closes in the same record save that adds the acceptance row, and the archive taken for the acceptance shows it closed.
    if (push) { push.closedAt = this.now().toISOString(); if (proposal.scopeDigest) push.refreshedScope = proposal.scopeDigest; }
    let acceptance: ContinuationAcceptance;
    try { acceptance = this.writeContinuationMetadata(() => newAcceptance(this.record, this.stateDirectory, proposal, check.result!.candidateId, receipt, this.now().toISOString())); }
    catch (error) { if (push) { delete push.closedAt; delete push.refreshedScope; } throw error; }
    // The build that follows a push shows its Push the plan row (technical design, "Activation and the row").
    const followsPush = push ? planPushKey(push.operationId) : check.result!.followsPush;
    if (followsPush) acceptance.planPushKey = followsPush;
    this.commands.enableExecutionIndex();
    this.record.continuation ??= { formatVersion: 1, journalIndexed: true, currentAcceptanceId: acceptance.id, acceptances: [], executions: [] };
    this.record.continuation.currentAcceptanceId = acceptance.id;
    this.saveContinuation(acceptance);
    this.controlKickPending = true;
    return { ok: true };
  }

  private async retryContinuation(inputs: Record<string, unknown>): Promise<Extract<CommandResult, { ok: true }> | (Omit<Extract<CommandResult, { ok: false }>, "code"> & { code?: string })> {
    const row = this.record.continuation?.acceptances.find(row => row.id === inputs.acceptance_id && row.completedExecutionId === this.record.executionId && ["preparing", "blocked"].includes(row.state));
    if (!row || row.id !== this.record.continuation?.currentAcceptanceId) return { ok: false, status: 409, code: "stale_acceptance", reason: "Select the current retained continuation preparation." };
    const acceptance = readAcceptance(this.stateDirectory, row.id);
    acceptance.state = "preparing"; delete acceptance.reason; this.saveContinuation(acceptance);
    this.controlKickPending = true;
    return { ok: true };
  }

  private pendingContinuation(): ContinuationAcceptance | undefined {
    const state = this.record.continuation;
    const row = state?.acceptances.find(row => row.id === state.currentAcceptanceId);
    return row && row.completedExecutionId === this.record.executionId && row.state === "preparing" ? readAcceptance(this.stateDirectory, row.id) : undefined;
  }

  private async prepareContinuation(acceptance: ContinuationAcceptance): Promise<void> {
    this.settingUp = true; this.changed();
    acceptance.state = "preparing"; delete acceptance.activatedAt;
    try {
      const revalidate = async () => {
        const check = await this.checkCompletedPlanOwned();
        if (check.status !== "available" || check.result?.proposal?.id !== acceptance.proposalId) throw new Error("The accepted plan, source, settings or delivery base changed. Review the refreshed offer for a fresh choice; retained workspaces remain intact.");
      };
      await revalidate();
      await prepareWorkspaces(this.git, acceptance, () => this.saveContinuation(acceptance), () => this.now().toISOString(), (name) => this.labelOf(name));
      await revalidate();
      for (const repo of acceptance.repositories) if (!await validatePreparedWorkspace(this.git, acceptance, repo.name)) throw new Error(`Prepared workspace disappeared: ${repo.worktreePath}. Retry its recorded setup.`);
      const prd = acceptance.repositories.find(repo => repo.kind === "prd")!;
      const source = observePlan(prd.worktreePath, writtenDirectory(this.record));
      if (source.digest !== acceptance.proposal.candidateDigest) throw new Error("The fresh workspace does not contain the accepted complete document set.");
      const candidate = readBaseline(this.stateDirectory, acceptance.candidateId);
      const accounting = this.record.completedPlanCheck?.result?.leaves ?? [];
      const completions = { ...candidate.completions };
      for (const row of accounting.filter(row => row.classification === "externally_verified")) completions[row.id] = { kind: "external", scopeRepositories: phaseRepositories(source, row.id), ...(row.completedAt ? { doneAt: row.completedAt } : {}), revision: row.repositories.find(repo => repo.repository === this.record.repository.name)!.revision, repositories: Object.fromEntries(row.repositories.map(repo => [repo.repository, { identity: repo.identity, revision: repo.revision! }])) };
      // Preserve verified introduction across squash/rebase deliveries without inventing
      // a phase/provider receipt. The immutable baseline binds source and accepted base.
      for (const [id, completion] of Object.entries(completions)) {
        if (!acceptance.proposal.prerequisites.some(row => row.phaseId === id && row.status === "integrated_verified")) continue;
        const names = [...new Set([this.record.repository.name, ...(completion.scopeRepositories ?? phaseRepositories(candidate.active, id)).map(name => recordedName(this.record, name))])];
        completion.repositories = { ...completion.repositories };
        for (const name of names) {
          const repo = acceptance.proposal.repositories.find(repo => repo.name === name);
          const revision = completion.repositories[name]?.revision ?? (name === this.record.repository.name ? completion.revision : undefined);
          if (!repo || !revision) throw new Error(`Verified completion ${id} lost its ${name} identity.`);
          completion.repositories[name] = { identity: repo.identity, revision, integration: { sourceRevision: revision, baseRevision: repo.baseRevision } };
        }
      }
      const { id: _candidateId, ...candidateBody } = candidate; void _candidateId;
      const baseline = this.writeContinuationMetadata(() => retainBaseline(this.stateDirectory, { ...candidateBody, active: source, completions }));
      const old = this.record;
      const authority = readPendingAuthority(this.stateDirectory, old);
      if (acceptance.pendingAuthorityId) {
        if (!authority || authority.id !== acceptance.pendingAuthorityId || authority.executionId !== acceptance.newExecutionId || authority.scopeDigest !== acceptance.proposal.scopeDigest || authority.state === "superseded") throw new Error("The accepted target authority is unavailable; no work can start.");

      }
      const archiveRow = { executionId: acceptance.completedExecutionId, archiveId: acceptance.archiveId, ...(old.startedAt ? { startedAt: old.startedAt } : {}), completedAt: old.completedAt!, branch: old.settings.featureBranch, deliveries: executionDeliveries(old), ...this.executionRunningMs(acceptance.acceptedAt) };
      acceptance.state = "active"; acceptance.activatedAt = this.now().toISOString(); delete acceptance.reason;
      this.writeContinuationMetadata(() => writeAcceptance(this.stateDirectory, acceptance));
      const continuation = structuredClone(old.continuation!);
      continuation.acceptances = continuation.acceptances.map(row => row.id === acceptance.id ? acceptanceSummary(acceptance) : row);
      this.activateExecution({ archiveRow, continuation, newExecutionId: acceptance.newExecutionId, operationId: acceptance.operationId, plan: source.plan, baselineId: baseline.id, at: acceptance.activatedAt,
        fields: { settings: acceptance.settings, repositories: acceptance.repositories, pause: {}, developmentAuthorization: acceptance.authorization ?? restrictedAuthorization(), ...(old.pendingContinuationAuthority ? { pendingContinuationAuthority: old.pendingContinuationAuthority } : {}), ...(acceptance.proposal.preparation.length ? { preparation: newPreparationState(acceptance.proposal) } : {}), ...(old.branchStem ? { branchStem: old.branchStem } : {}), continuationBaselineId: baseline.id, startedAt: acceptance.acceptedAt, refinementConfirmedAt: acceptance.acceptedAt, setupCompletedAt: acceptance.activatedAt },
        afterSave: () => { if (authority && acceptance.pendingAuthorityId === authority.id) { authority.state = "adopted"; authority.acceptanceId = acceptance.id; this.writeContinuationMetadata(() => writePendingAuthority(this.stateDirectory, authority)); } } });
    } catch (error) {
      if (this.commands.fault || this.stopping || this.record.executionId === acceptance.newExecutionId) {
        this.commands.fault ??= "Activation metadata is unresolved. Restart Kiln to rebuild inspection before dispatch.";
        throw error;
      }
      acceptance.state = "blocked"; acceptance.reason = (error as Error).message; this.saveContinuation(acceptance);
    } finally { this.settingUp = false; this.changed(); }
  }

  /**
   * The activation core continuations and a base-branch start from the Folder missing page share
   * (missing worktree recovery, "Existing Code"): the archived execution's summary appended, the
   * new record assembled and saved, the control epoch and the command journal's execution rotated,
   * aliases and legacy sessions rebound, and the inspection snapshot cached.
   */
  private activateExecution(input: { archiveRow: ExecutionSummary; continuation: ContinuationState; newExecutionId: string; operationId: string; plan: PhasePlan; baselineId: string; at: string; fields: Pick<PrdRecord, "settings" | "repositories" | "pause" | "developmentAuthorization" | "startedAt" | "refinementConfirmedAt" | "setupCompletedAt"> & Partial<Pick<PrdRecord, "pendingContinuationAuthority" | "preparation" | "branchStem" | "folderSetupStart" | "continuationBaselineId">>; afterSave?: () => void }): void {
    const old = this.record;
    const { continuation, archiveRow } = input;
    if (!continuation.executions.some(row => row.executionId === archiveRow.executionId)) continuation.executions.push(archiveRow);
    const active: PrdRecord = { schemaVersion: SCHEMA_VERSION, executionId: input.newExecutionId, token: old.token, repository: old.repository, prdDirectory: writtenDirectory(old), ...(old.origin ? { origin: old.origin } : {}), featureName: old.featureName, continuation, phases: {}, plan: recordedPlan(input.plan), planReadAt: input.at, planReconciliation: { baselineId: input.baselineId }, billing: newBillingState(input.newExecutionId), developmentDelivery: emptyDevelopmentLedger(), completionAudits: { revision: 0, policy: "required" as const, activities: [], evidence: [] }, ...input.fields };
    // Every activation of a fresh execution sets the preflight's mark in its one write (build preflight "When the Preflight Is Due").
    setPreflightDue(active, input.fields.folderSetupStart ? "start" : "continue", input.at);
    // A continued run, or a base-branch start from Folder missing, counts its loops from zero (AC-LOOP-04, RUN-003).
    active.auditLoops = startedLedger(active.startedAt ?? input.at);
    this.billing.invalidate(false);
    for (const key of Object.keys(old)) Reflect.deleteProperty(old, key);
    Object.assign(old, active);
    this.controlEpoch = randomUUID(); this.record.controlEpoch = this.controlEpoch;
    this.plan = input.plan; this.current = undefined; this.pendingResume = undefined; this.requestedResume = undefined; this.restartReview = undefined; this.reviewingRestart = false; this.stoppedCommits = undefined; this.lastPullRequestRepositories = undefined; this.pullRequestPrecheckDone = false;
    this.save();
    input.afterSave?.();
    this.commands.rotateExecution(input.newExecutionId, input.operationId);
    bindExecutionAliases(this);
    bindLegacySessions(this);
    cacheSnapshot(this, inspectionSnapshot(this));
  }

  historicalExecution(id: string) {
    if (id === this.record.executionId) return { record: this.record };
    const summary = this.record.continuation?.executions.find(row => row.executionId === id);
    return summary ? readExecution(this.stateDirectory, summary) : undefined;
  }

  // ---- `kiln run` on a feature underway --------------------------------------------------

  /**
   * Read current scope without changing the completed execution or authorizing work.
   * Concurrent refreshes share this read under the existing command admission.
   */
  /**
   * `press`: a person asked, by Check now, Check for new phases or `kiln check-for-new-phases`; only
   * such a reading lets a closed pull request stop the delivery waiting (Kiln After Delivery AC-WAIT-01).
   */
  checkCompletedPlan(options: { press?: boolean } = {}): Promise<CompletedPlanCheck> {
    // A press that arrives during a page load's reading is not lost: it reads again, as a press, once that one ends.
    if (this.completedPlanReading) return options.press && !this.completedPlanPress ? this.completedPlanReading.catch(() => undefined).then(() => this.checkCompletedPlan(options)) : this.completedPlanReading;
    if (this.commands.blocked) return Promise.reject(new AuditRefusal("busy", this.commands.fault ?? "Reconcile the retained command owner before another plan check.", 409));
    // While the merge activity is open a page or button occasion only saves the pull request states
    // the card shows; it never closes the activity, whatever it reads (Kiln After Delivery, "While open").
    if (openMerge(this.record)) return this.readDeliveryNow(options.press === true).then(() => Promise.reject(new AuditRefusal("busy", "Kiln checks for new phases once it confirms the merge.", 409)));
    if (openPlanPush(this.record)) return Promise.reject(new AuditRefusal("busy", "Kiln checks for new phases once the plan is pushed.", 409));
    if (!this.currentlyComplete) return Promise.reject(new AuditRefusal("wrong_activity", "Only a completed feature can check for added phases.", 409));
    if (this.commands.busy || this.checking || this.driving || this.settingUp || this.deliveryBusy || this.stopping) return Promise.reject(new AuditRefusal("busy", "Kiln is already checking or changing work.", 409));
    return this.checkCompletedPlanOwned(options);
  }

  /**
   * The delivery reading before the check (Kiln After Delivery, "The Delivery Reading"): each of the
   * delivery's pull requests from GitHub, saved, then what the check needs from it. Once every pull
   * request reads `merged`, nothing is read from GitHub again.
   */
  private async deliveryDecision(press: boolean, signal: AbortSignal): Promise<DeliveryDecision> {
    const record = this.record;
    const merged = (pull: { repository: string; number: number }) => record.afterDelivery?.pullRequests.find(row => row.repository === pull.repository && row.number === pull.number)?.state === "merged";
    let failed: { repository: string; number: number }[] = [];
    if (!(record.pullRequests ?? []).every(merged)) failed = (await this.readDeliveryNow(press, signal)).failed;
    const readings = record.afterDelivery?.pullRequests ?? [];
    const prd = prdPullRequest(record);
    // A reading of the PRD's pull request that failed now decides nothing: the check fails with the failure, never shows an earlier waiting state.
    const waiting = prd && failed.some(row => row.repository === prd.repository && row.number === prd.number) ? undefined : deliveryWaiting(record);
    const prdReading = prd && readings.find(row => row.repository === prd.repository && row.number === prd.number);
    return {
      waiting,
      ...(waiting && prd ? { awaiting: { repository: prd.repository, number: prd.number, url: prd.url, baseBranch: prd.base, closed: prdReading?.state === "closed" } } : {}),
      ...(record.afterDelivery?.readError ? { failure: record.afterDelivery.readError.problem } : {}),
      merged: Object.fromEntries(readings.flatMap(row => row.state === "merged" && row.mergeCommit ? [[row.repository, row.mergeCommit]] : [])),
      closed: readings.filter(row => row.state === "closed").map(row => ({ repository: row.repository, number: row.number })),
    };
  }

  /**
   * The local base branch after the merge (Kiln After Delivery AC-MERGE-09, "The Local Base
   * Branch"): once every pull request reads merged, each repository's main checkout gets the full
   * step once, and a repository left as it was is retried against the commit fetched then.
   */
  private async bringBaseBranchesUpToDate(signal: AbortSignal): Promise<void> {
    const record = this.record;
    if (!record.afterDelivery || openMerge(record) || mergeOffer(record).kind !== "all_merged") return;
    const previous = record.afterDelivery.baseBranches ?? [];
    const next: BaseBranchEntry[] = [];
    for (const pull of record.pullRequests ?? []) {
      if (next.some(row => row.repository === pull.repository)) continue;
      const before = previous.find(row => row.repository === pull.repository);
      if (before && before.outcome !== "left") { next.push(before); continue; }
      const entry = record.repositories.find(one => one.name === pull.repository);
      const github = entry?.github ?? record.repository.github;
      const after = await syncBaseBranch({ git: { ...this.git, signal }, repository: pull.repository, checkout: entry?.mainCheckoutPath ?? record.repository.mainCheckoutPath, github, base: pull.base, now: () => this.now().toISOString(), ...(before?.fetched ? { fetched: before.fetched } : {}) });
      // An unchanged retry keeps its first time, so the record moves only when something did.
      next.push(before && JSON.stringify({ ...before, at: "" }) === JSON.stringify({ ...after, at: "" }) ? before : after);
    }
    // Saved while stopping too: a fast-forward that happened is recorded, so its line is not lost.
    if (this.closed || JSON.stringify(next) === JSON.stringify(previous)) return;
    record.afterDelivery.baseBranches = next;
    this.save();
    this.changed();
  }

  // ---- Merge with the agent (Kiln After Delivery, "The Merge Session") --------------------

  /**
   * The delivery reading, one at a time: an occasion that arrives while one is in flight waits
   * for its result instead of starting another. A failed read keeps the previous reading.
   */
  private async readDeliveryNow(press: boolean, signal?: AbortSignal, fresh = false): Promise<{ failed: { repository: string; number: number }[] }> {
    // The merge activity's own occasions (the press, the session's end, its stop's controls) need a
    // reading started after them: one already in flight may predate the session's merge.
    if (fresh) while (this.afterDeliveryReading) await this.afterDeliveryReading.catch(() => undefined);
    if (this.afterDeliveryReading) return this.afterDeliveryReading;
    return this.startDeliveryReading(press, signal);
  }

  private startDeliveryReading(press: boolean, signal?: AbortSignal): Promise<{ failed: { repository: string; number: number }[] }> {
    const reading = (async () => {
      const abort = signal ?? AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
      const read = await readDelivery({ record: this.record, git: { ...this.git, signal: abort }, gh: this.options.tools.gh, now: () => this.now().toISOString(), signal: abort, press });
      // The merge activity may have changed while GitHub was read; the reading never replaces it.
      const merge = this.record.afterDelivery?.merge;
      this.record.afterDelivery = { ...read.state, ...(merge ? { merge } : {}) };
      if (!merge) delete this.record.afterDelivery.merge;
      this.save();
      return { failed: read.failed };
    })().finally(() => { this.afterDeliveryReading = undefined; this.changed(); });
    this.afterDeliveryReading = reading;
    return reading;
  }

  /**
   * Merge with {agent} (AC-MERGE-01, AC-MERGE-07): offered from the saved reading while no merge
   * activity exists for this execution. Its reasons never carry a reading's failure text or time,
   * so the status token stays still between readings.
   */
  mergeControl(): { offered: boolean; available: boolean; reason?: string } {
    const record = this.record;
    if (!this.finished) return { offered: false, available: false, reason: "Merge with the agent is offered once every phase is done and its pull requests are open." };
    if (record.afterDelivery?.merge) return { offered: false, available: false, reason: "A merge session was already started for this delivery." };
    const offer = mergeOffer(record);
    if (offer.kind === "nothing") return { offered: false, available: false, reason: "This delivery has no pull request to merge." };
    if (offer.kind === "all_merged") return { offered: false, available: false, reason: "Every pull request of this delivery is merged." };
    if (offer.kind === "closed") return { offered: false, available: false, reason: "A pull request of this delivery was closed on GitHub without merging." };
    if (offer.kind === "unreadable") return { offered: false, available: false, reason: "GitHub could not be read for this delivery's pull requests." };
    if (this.mergeBusy(false)) return { offered: true, available: false, reason: MERGE_BUSY };
    return { offered: true, available: true };
  }

  /** Whether the press must wait: a session, a stop or wait, a check or another command is under way. */
  private mergeBusy(applying: boolean): boolean {
    return !!(this.current?.processRunning || this.stoppedPhaseKey() !== undefined || this.waitingPhaseKey() !== undefined || this.pendingContinuation() || this.checking || this.driving || this.settingUp || this.deliveryBusy || this.stopping || !applying && this.commands?.busy || this.completedPlanReading);
  }

  /** The delivery's pull requests the merge session works on, in its order, with the latest reading (AC-MERGE-02). */
  private mergePullRequests(only?: { repository: string; number: number }[]): MergePullRequest[] {
    const recorded = this.record.pullRequests ?? [];
    const readings = this.record.afterDelivery?.pullRequests ?? [];
    const rows = recorded.filter(pull => !only || only.some(row => row.repository === pull.repository && row.number === pull.number)).map(pull => ({ pull, reading: readings.find(row => row.repository === pull.repository && row.number === pull.number) }));
    return orderedForMerge(rows.map(({ pull, reading }) => ({ repository: pull.repository, number: pull.number, ...(reading?.order ? { order: reading.order } : {}), pull, reading })), recorded).map(({ pull, reading }) => {
      const entry = this.record.repositories.find(one => one.name === pull.repository);
      return { repository: pull.repository, github: entry?.github ?? this.record.repository.github, number: pull.number, featureBranch: pull.head, baseBranch: pull.base, worktreePath: expandHome(entry?.worktreePath ?? this.worktreePath), ...(reading ? { state: reading.state } : {}) };
    });
  }

  /**
   * The press (technical design, "The Merge Session"): a fresh reading, then every pull request
   * merged completes as `already_merged`; any closed or unknown is refused; otherwise each
   * worktree still to merge is checked and the merge activity opens. The accepted receipt for this
   * execution is the whole permission (AC-MERGE-02): nothing is written to settings or a grant.
   */
  private async applyMerge(inputs: Record<string, unknown>, receipt: Receipt): Promise<{ ok: boolean; outcome?: string; reason?: string; code?: string; status?: number }> {
    // The press decides on a fresh reading, so a saved closed, unknown or merged state refuses only after it.
    const control = this.mergeControl();
    if (!this.finished || this.record.afterDelivery?.merge || mergeOffer(this.record).kind === "nothing") return { ok: false, code: "merge_unavailable", reason: control.reason!, status: 409 };
    if (this.mergeBusy(true)) return { ok: false, code: "busy", reason: MERGE_BUSY, status: 409 };
    this.checking = true;
    this.changed();
    try {
      await this.readDeliveryNow(false, undefined, true);
      if (this.stopping) return { ok: false, code: "merge_unavailable", reason: "Kiln is stopping.", status: 409 };
      const offer = mergeOffer(this.record);
      if (offer.kind === "all_merged") {
        this.record.controlApplied = { operationId: receipt.id, outcome: "already_merged" };
        this.save();
        this.confirmedMerge();
        return { ok: true, outcome: "already_merged" };
      }
      if (offer.kind === "closed") return { ok: false, code: "pull_request_closed", reason: closedOfferLine({ multi: (this.record.pullRequests ?? []).length > 1, ...offer }), status: 409 };
      if (offer.kind === "unreadable") return { ok: false, code: "github_unreadable", reason: unreadableLine(offer.problem), status: 503 };
      if (offer.kind !== "offered") return { ok: false, code: "merge_unavailable", reason: "This delivery has no pull request to merge.", status: 409 };
      const pressHeads: { repository: string; sha: string }[] = [];
      for (const row of offer.toMerge) {
        const ready = await this.mergeFolderReady(row.repository, row.number, row.headSha!);
        if (!ready.ok) return { ok: false, code: "merge_folder_not_ready", reason: ready.reason, status: 409 };
        pressHeads.push({ repository: row.repository, sha: ready.head });
      }
      const at = this.now().toISOString();
      this.record.afterDelivery!.merge = { operationId: receipt.id, requestedAt: at, via: inputs.via === "command_line" ? "command_line" : "browser", pullRequests: offer.toMerge.map(row => ({ repository: row.repository, number: row.number })), pressHeads };
      this.record.controlApplied = { operationId: receipt.id, outcome: "merge_started" };
      this.save();
    } finally {
      this.checking = false;
      this.changed();
    }
    // Every path that did not open the activity returned above.
    this.kick();
    return { ok: true, outcome: "merge_started" };
  }

  /**
   * A pull request's worktree at the press (technical design, "Gates"): there, on the feature
   * branch, with no uncommitted work and no merge in progress; the pull request's head brought in
   * from the main checkout with no ref written; and the worktree's head at, ahead of or behind it.
   * A Git read that fails refuses the press and names the failure; it is never read as behind.
   */
  private async mergeFolderReady(repository: string, number: number, headSha: string): Promise<{ ok: true; head: string } | { ok: false; reason: string }> {
    const entry = this.record.repositories.find(one => one.name === repository);
    const folder = entry?.worktreePath ?? this.record.settings.worktreePath;
    const cwd = expandHome(folder);
    const main = expandHome(entry?.mainCheckoutPath ?? this.paths.mainCheckoutPath);
    const branch = this.record.settings.featureBranch;
    const refuse = (what: string) => ({ ok: false as const, reason: `Kiln can't start the merge in ${repository}'s worktree, ${folder}: ${what}` });
    try { if (!statSync(cwd).isDirectory()) return refuse("it is not a folder."); }
    catch { return refuse("it is not there."); }
    const [top, current, status, merging] = await Promise.all([
      runGit(this.git, cwd, ["rev-parse", "--show-toplevel"]), runGit(this.git, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
      runGit(this.git, cwd, ["status", "--porcelain", "--untracked-files=all"]), runGit(this.git, cwd, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]),
    ]);
    if (top.exitCode !== 0 || comparable(realPathOfNearestAncestor(top.stdout.trim())) !== comparable(realPathOfNearestAncestor(cwd))) return refuse("it is not a Git worktree of the repository.");
    if (current.exitCode !== 0 || current.stdout.trim() !== branch) return refuse(`it is not on ${branch}.`);
    if (status.exitCode !== 0) return refuse(`Git could not read it: ${status.stderr.trim()}`);
    if (status.stdout.trim()) return refuse("it has uncommitted work. Commit or remove it, then press Merge again.");
    if (merging.exitCode === 0) return refuse("a merge is in progress there. Finish or abort it, then press Merge again.");
    const fetched = await runGit(this.git, main, ["fetch", "--no-tags", "--no-write-fetch-head", "origin", headSha]);
    if (fetched.exitCode !== 0) return refuse(`Git could not bring in pull request #${number}'s head ${headSha.slice(0, 7)}: ${fetched.stderr.trim()}`);
    const head = await runGit(this.git, cwd, ["rev-parse", "HEAD"]);
    if (head.exitCode !== 0) return refuse(`Git could not read its head: ${head.stderr.trim()}`);
    const sha = head.stdout.trim();
    if (sha === headSha) return { ok: true, head: sha };
    const ancestor = async (a: string, b: string) => (await runGit(this.git, cwd, ["merge-base", "--is-ancestor", a, b])).exitCode;
    const behind = await ancestor(sha, headSha);
    const ahead = behind === 0 ? 1 : await ancestor(headSha, sha);
    if (behind !== 0 && behind !== 1 || ahead !== 0 && ahead !== 1) return refuse("Git could not compare it with the pull request's head.");
    if (behind === 0 || ahead === 0) return { ok: true, head: sha };
    return { ok: false, reason: `${repository}'s worktree, ${folder}, and pull request #${number} each have commits the other lacks. Bring them together, then press Merge again.` };
  }

  /**
   * The merge activity's folders before a launch or resume (technical design, "Gates"): each pull
   * request still to merge has its run worktree, on the feature branch, whose head descends from the
   * head recorded at the press. Uncommitted work or a merge in progress is left for the resumed
   * session. A check row naming the repository and folder when one is not ready; none when all are.
   */
  private async mergeFolderProblem(): Promise<CheckResult | undefined> {
    const merge = this.record.afterDelivery?.merge;
    if (!merge) return undefined;
    const readings = this.record.afterDelivery!.pullRequests;
    const branch = this.record.settings.featureBranch;
    for (const pull of merge.pullRequests) {
      if (readings.find(row => row.repository === pull.repository && row.number === pull.number)?.state === "merged") continue;
      const entry = this.record.repositories.find(one => one.name === pull.repository);
      const folder = entry?.worktreePath ?? this.record.settings.worktreePath;
      const cwd = expandHome(folder);
      const problem = (what: string): CheckResult => ({ name: `${pull.repository} worktree`, passed: false, facts: [`Kiln can't carry on the merge in ${pull.repository}'s worktree, ${folder}: ${what}`] });
      try { if (!statSync(cwd).isDirectory()) return problem("it is not a folder."); }
      catch { return problem("it is not there."); }
      const [top, current] = await Promise.all([runGit(this.git, cwd, ["rev-parse", "--show-toplevel"]), runGit(this.git, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])]);
      if (top.exitCode !== 0 || comparable(realPathOfNearestAncestor(top.stdout.trim())) !== comparable(realPathOfNearestAncestor(cwd))) return problem("it is not a Git worktree of the repository.");
      if (current.exitCode !== 0 || current.stdout.trim() !== branch) return problem(`it is not on ${branch}.`);
      const pressed = merge.pressHeads.find(one => one.repository === pull.repository)?.sha;
      if (!pressed) continue;
      const descends = await runGit(this.git, cwd, ["merge-base", "--is-ancestor", pressed, "HEAD"]);
      if (descends.exitCode === 1) return problem(`its head no longer contains ${pressed.slice(0, 7)}, the head it had when Merge was pressed.`);
      if (descends.exitCode !== 0) return problem(`Git could not compare its head with ${pressed.slice(0, 7)}: ${descends.stderr.trim()}`);
    }
    return undefined;
  }

  /**
   * Check again at a billing hold on the merge or push session (Kiln After Delivery AC-MERGE-05): the
   * activity's own reading first, as its stop takes it, then the hold's own rows. Done ends the
   * activity without resuming.
   */
  private async recheckAfterDeliveryHold(key: string, hold: NonNullable<NonNullable<PrdRecord["billing"]>["hold"]>): Promise<"complete" | "cleared" | "still_stopped"> {
    const ops = this.afterDeliveryOps(key);
    const result = await ops.read();
    if (this.stopping) return "still_stopped";
    if (result.done) { ops.done(); return "complete"; }
    if (result.unreadable) { hold.checks = markReasonRows(result.checks); hold.run = this.newRun("recheck"); this.save(); throw new CompletionCheckUnavailable(result.unreadable); }
    const ran = !!(hold.sessionId ? this.sessionRecord(key, hold.sessionId) : this.latestSession(key))?.runs.length;
    if (!ran) {
      await this.billing.refresh(this.billingCwd, this.sessionEnv(), [], true);
      if (this.billing.view.canLaunch) { delete this.record.billing!.hold; this.save(); return "cleared"; }
    }
    // The run's rows only once it ran; Billing approval beside them for a launch hold (waivers "Check Runs").
    hold.checks = markReasonRows(ran ? result.checks : [...result.checks, { name: "Billing approval", passed: false, facts: [hold.reason] }]);
    if (ran) hold.rowsAreCompletionChecks = true; else delete hold.rowsAreCompletionChecks;
    hold.run = this.newRun("recheck");
    this.save();
    return "still_stopped";
  }

  /**
   * Whether the merge is done (AC-MERGE-04): every pull request of the delivery read `merged`,
   * never the session's word. One check row per pull request; `unreadable` when a pull request not
   * already merged could not be read, which decides nothing.
   */
  private mergeResult(): { done: boolean; unreadable?: string; checks: CheckResult[] } {
    const state = this.record.afterDelivery;
    const failed = (pull: { repository: string; number: number }) => state?.readError?.pullRequests?.some(row => row.repository === pull.repository && row.number === pull.number);
    let unreadable: string | undefined;
    const checks: CheckResult[] = (this.record.pullRequests ?? []).map(pull => {
      const reading = state?.pullRequests.find(row => row.repository === pull.repository && row.number === pull.number);
      const name = `${pull.repository} #${pull.number}`;
      if (reading?.state === "merged") return { name, passed: true, facts: [`Merged into ${pull.base} at ${reading.mergedAt} · merge ${reading.mergeCommit?.slice(0, 7)}`] };
      if (!reading || failed(pull)) { unreadable = state?.readError?.problem ?? "GitHub has not been read yet."; return { name, passed: false, facts: [unreadable] }; }
      if (reading.state === "closed") return { name, passed: false, facts: [closedAtStopLine(pull)] };
      return { name, passed: false, facts: [`Open on GitHub and not merged into ${pull.base}.${reading.conflicts ? ` GitHub shows it conflicts with ${pull.base}.` : ""}`] };
    });
    return { done: checks.length > 0 && checks.every(check => check.passed), ...(unreadable ? { unreadable } : {}), checks };
  }

  /**
   * Closes the merge activity once every pull request reads merged, then runs the check for new
   * phases unasked (AC-WAIT-03). The summary is saved only when a merge session's own end closed it.
   */
  private closeMerge(summary?: string): void {
    const merge = this.record.afterDelivery?.merge;
    if (!merge || merge.closedAt) return;
    const at = this.now().toISOString();
    merge.doneAt = at; merge.closedAt = at;
    if (summary !== undefined) merge.summary = summary;
    const facts = this.phaseFacts(MERGE_KEY);
    delete facts.stop; delete facts.wait;
    if (this.record.billing?.hold?.phaseKey === MERGE_KEY) delete this.record.billing.hold;
    facts.doneAt = at;
    this.current = undefined;
    this.save();
    this.emit({ kind: "merge", at: this.now(), event: "merged", summary: (this.record.pullRequests ?? []).map(pull => `${this.record.pullRequests!.length > 1 ? `${pull.repository} ` : ""}#${pull.number} merged`).join(" · ") });
    this.confirmedMerge();
  }

  /** Kiln confirmed the merge: the check for new phases runs unasked (AC-WAIT-03). */
  private confirmedMerge(): void {
    if (this.stopping || !this.currentlyComplete) return;
    void this.checkCompletedPlanOwned().catch(() => undefined);
  }

  /** The closing summary: the final message of the run that just ended, when it ended on its own with no error (AC-MERGE-04). */
  private mergeSummary(): string | undefined {
    const run = this.latestSession(MERGE_KEY)?.runs.at(-1);
    if (!run || run.limitRefusal || run.interruptedBy || run.spawnError || run.result?.isError) return undefined;
    return run.result?.text?.trim() ? run.result.text : undefined;
  }

  /**
   * The loop's turn while an after-delivery activity is open: launch its one session, or resume it
   * when Kiln's own recovery asked; then settle it by the reading its end takes. A push of the plan
   * past Done has no session: its turn is the re-check and the acceptance it may lead to.
   */
  private async driveAfterDelivery(key: string): Promise<"closed" | "stopped"> {
    if (isPlanPushKey(key) && this.planPushEntry(key)?.doneAt) return this.acceptAfterPush(key);
    const ops = this.afterDeliveryOps(key);
    this.phaseFacts(key);
    // Every launch and resume checks the activity's folders first (technical design, "Gates").
    const resuming = this.pendingResume === key;
    const folder = resuming || !this.latestSession(key)?.runs.some(run => run.pid !== undefined) ? await ops.folder() : undefined;
    if (this.stopping) return "stopped";
    if (folder) {
      this.pendingResume = undefined;
      this.recordStop(key, ops.stopKind, [...(key === MERGE_KEY ? this.mergeResult().checks : []), folder]);
      return "stopped";
    }
    if (this.pendingResume === key) {
      this.pendingResume = undefined;
      await this.resumeSession(key);
    } else {
      // Once per activity: the one session is only ever resumed, never launched again.
      // A session that never started (a failed spawn) is not a second session: launching again is allowed.
      if (this.latestSession(key)?.runs.some(run => run.pid !== undefined)) return "stopped";
      this.current = { phaseKey: key, commits: [], processRunning: false };
      this.changed();
      if (!await this.launchReadiness(key)) return "stopped";
      const prompt = key === MERGE_KEY ? this.mergePrompt(this.sessionFolder) : this.planPushPrompt(key);
      if (key === MERGE_KEY) this.emit({ kind: "merge", at: this.now(), event: "started" });
      else this.emit({ kind: "plan_push", at: this.now(), event: "started" });
      await this.launchSession(key, key === MERGE_KEY ? "merge" : "plan_push", prompt);
    }
    const verdict = await this.settleSession(key);
    return verdict.kind === "complete" || verdict.kind === "done" ? "closed" : "stopped";
  }

  /**
   * `kiln run` on a finished run whose after-delivery activity is open: its stop is checked again, an
   * interrupted session takes its reading before anything resumes, and one that ended unjudged is
   * judged. A push past Done goes straight to its plan check (technical design, "Ctrl+C and restart").
   */
  private async decideAfterDelivery(key: string): Promise<UnderwayDecision> {
    const pushed = () => isPlanPushKey(key) && !!this.planPushEntry(key)?.doneAt && !this.planPushEntry(key)?.closedAt;
    if (pushed()) return { kind: "plan_push_accepting" };
    const finished = (verdict: string) => verdict === "complete" || verdict === "done" ? pushed() ? { kind: "plan_push_accepting" as const } : { kind: "complete" as const } : undefined;
    if (this.record.billing?.hold?.phaseKey === key) return { kind: "needs_you", phaseKey: key, again: true };
    if (this.waitingPhaseKey() === key) {
      const verdict = await this.recheckWait(key, "restart");
      const done = finished(verdict); if (done) return done;
      if (verdict === "stopped" || verdict === "stopping") return { kind: "needs_you", phaseKey: key, again: false };
      return { kind: "waiting", phaseKey: key, limit: this.waitLimit(key) };
    }
    if (this.record.phases[key]?.stop) {
      try { const done = finished(await this.recheckStop(key)); if (done) return done; }
      catch (error) { if (!(error instanceof CompletionCheckUnavailable)) throw error; }
      return { kind: "needs_you", phaseKey: key, again: true };
    }
    const session = this.latestSession(key);
    const run = session?.runs.at(-1);
    if (!session || !run) return key === MERGE_KEY ? { kind: "start_merge" } : { kind: "start_plan_push" };
    this.interruptedKey = key;
    await this.stopLiveProcess(session);
    const verdict = run.endedAt === undefined || run.interruptedBy !== undefined ? await this.checkInterrupted(key) : await this.judgeEndedSession(key, false);
    this.interruptedKey = undefined;
    const done = finished(verdict.kind); if (done) return done;
    if (verdict.kind === "resume") { this.interruptedKey = key; this.pendingResume = key; return { kind: "resume", phaseKey: key, sessionId: session.sessionId }; }
    if (verdict.kind === "waiting") return { kind: "waiting", phaseKey: key, limit: this.waitLimit(key) };
    return { kind: "needs_you", phaseKey: key, again: false };
  }

  /** The merge session's first message, for the pull requests the press opened it for (AC-MERGE-03). */
  mergePrompt(folder: string): string {
    const pulls = this.mergePullRequests(this.record.afterDelivery?.merge?.pullRequests);
    return mergeSessionPrompt({ featureName: this.paths.featureName, prdFile: this.pathFrom(folder, this.prdFile()), agent: AGENT_NAMES[this.agentOf(MERGE_KEY)], pullRequests: pulls });
  }

  /** The merge or push session ended (technical design, "Ending"): its reading decides, never its word. */
  private async judgeAfterDelivery(key: string, notResumable: boolean): Promise<Verdict> {
    const ops = this.afterDeliveryOps(key);
    const result = await ops.read();
    if (this.stopping) return { kind: "stopping" };
    if (result.done) return ops.done(key === MERGE_KEY ? this.mergeSummary() : undefined);
    const session = this.latestSession(key);
    const runIndex = (session?.runs.length ?? 0) - 1;
    if (!result.unreadable && !notResumable && session?.runs[runIndex]?.limitRefusal !== undefined) return this.settleRefused(key, session, runIndex, result.checks);
    this.recordStop(key, notResumable ? "not_resumable" : ops.stopKind, result.checks);
    return { kind: "stopped" };
  }

  /** The activity's own reading, folder check and Done (Kiln After Delivery, "After-Delivery Activities"). */
  private afterDeliveryOps(key: string): { stopKind: StopKind; read(): Promise<{ done: boolean; unreadable?: string; checks: CheckResult[] }>; done(summary?: string): Verdict; folder(): Promise<CheckResult | undefined> } {
    if (key === MERGE_KEY) return {
      stopKind: "merge_check",
      read: async () => { await this.readDeliveryNow(false, undefined, true); return this.mergeResult(); },
      done: summary => { this.closeMerge(summary); return { kind: "complete" }; },
      folder: () => this.mergeFolderProblem(),
    };
    return { stopKind: "plan_push_check", read: () => this.planPushReading(key), done: () => { this.planPushDone(key); return { kind: "done", judgedId: key }; }, folder: () => this.planPushFolderProblem(key) };
  }

  // ---- Continue pushes the plan first (Kiln After Delivery, "Continue and the Push Session") ----

  /** The branch the push session pushes this PRD's documents to: the PRD repository's base. */
  get planPushBase(): string { return this.record.repositories.find(entry => entry.kind === "prd")?.baseBranch ?? this.record.settings.baseBranch; }

  private planPushEntry(key: string): PlanPushActivity | undefined {
    return this.record.afterDelivery?.planPushes?.find(push => planPushKey(push.operationId) === key);
  }

  /**
   * Accepting an offer read from the main checkout (AC-BACK-05): checks the main checkout, then
   * opens a push activity under its own key, bound to the offer's ordered unfinished phases with
   * each phase's scope digest. The acceptance waits for the push.
   */
  private async openPlanPushActivity(inputs: Record<string, unknown>, receipt: Receipt, proposal: ContinuationProposal, candidateId: string): Promise<{ ok: true; outcome: string } | { ok: false; status: 409; code: string; reason: string }> {
    const problem = await this.planPushCheckoutProblem(proposal.source!.revision, true);
    if (problem) return { ok: false, status: 409, code: "plan_push_folder_not_ready", reason: problem };
    const scopes = readBaseline(this.stateDirectory, candidateId).active.scopes;
    const at = this.now().toISOString();
    const push: PlanPushActivity = { operationId: receipt.id, requestedAt: at, via: inputs.via === "command_line" ? "command_line" : "browser", proposalId: proposal.id, offered: proposal.added.map(phase => ({ id: phase.id, phaseScopeDigest: scopes[phase.id]! })) };
    this.record.afterDelivery ??= { pullRequests: [] };
    (this.record.afterDelivery.planPushes ??= []).push(push);
    this.record.controlApplied = { operationId: receipt.id, outcome: "plan_push_started" };
    this.save();
    this.controlKickPending = true;
    return { ok: true, outcome: "plan_push_started" };
  }

  /**
   * The main checkout the push session works in (technical design, "Gates"): found, on the base
   * branch, and at the press at the commit the offer was read from; on a resume its tip descends
   * from that commit. Undefined when it is ready.
   */
  private async planPushCheckoutProblem(revision: string, atPress: boolean): Promise<string | undefined> {
    const branch = this.planPushBase;
    const saved = this.record.repository.mainCheckoutPath;
    const found = await findMainCheckout(this.git, saved, this.record.repository.github);
    if (!found.ok) return found.problem;
    const refuse = (what: string) => `Kiln can't push the plan from the main checkout at ${saved}: ${what}`;
    const current = await runGit(this.git, found.path, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    if (current.exitCode !== 0 || current.stdout.trim() !== branch) return refuse(`it is on ${current.exitCode === 0 ? current.stdout.trim() : "a detached HEAD"}, not ${branch}. Switch it back to ${branch}, then ${atPress ? "press Continue again" : "press Resume"}.`);
    const tip = await runGit(this.git, found.path, ["rev-parse", "HEAD"]);
    if (tip.exitCode !== 0) return refuse(`Git could not read its head: ${tip.stderr.trim()}`);
    if (atPress) return tip.stdout.trim() === revision ? undefined : refuse(`its ${branch} moved since Kiln read the offer. Check for new phases again.`);
    const descends = await runGit(this.git, found.path, ["merge-base", "--is-ancestor", revision, "HEAD"]);
    if (descends.exitCode === 1) return refuse(`its ${branch} no longer contains ${revision.slice(0, 7)}, the commit the offer was read from.`);
    if (descends.exitCode !== 0) return refuse(`Git could not compare its head with ${revision.slice(0, 7)}: ${descends.stderr.trim()}`);
    return undefined;
  }

  /** The push activity's folder before a launch or resume: a check row naming the main checkout, or none when it is ready. */
  private async planPushFolderProblem(key: string): Promise<CheckResult | undefined> {
    const push = this.planPushEntry(key);
    const revision = push ? readContinuationProposal(this.stateDirectory, push.proposalId).source?.revision : undefined;
    if (!revision) return undefined;
    const problem = await this.planPushCheckoutProblem(revision, false);
    return problem ? { name: "Main checkout", passed: false, facts: [problem] } : undefined;
  }

  /**
   * Whether the push is done (technical design, "Continue and the Push Session", "Done"), read from
   * the remote base, never the session's word: its plan has a phase with every offered id, or it
   * contains the main checkout's base-branch tip as it stands now. Both read the revision just
   * fetched, never `origin/<base>`. A remote that cannot be reached decides nothing.
   */
  private async planPushReading(key: string): Promise<{ done: boolean; unreadable?: string; checks: CheckResult[] }> {
    const push = this.planPushEntry(key)!;
    const branch = this.planPushBase;
    const name = `origin/${branch}`;
    const failed = (problem: string) => ({ done: false, unreadable: problem, checks: [{ name, passed: false, facts: [problem] }] });
    const found = await findMainCheckout(this.git, this.record.repository.mainCheckoutPath, this.record.repository.github);
    if (!found.ok) return failed(found.problem);
    const git = { ...this.git, signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]) };
    let revision: string;
    try { revision = await remoteBase(git, found.path, branch, true); }
    catch (error) { return failed(`Kiln could not read ${name}: ${(error as Error).message}`); }
    let holdsPlan = false;
    try {
      const ids = new Set((await observeGitPlan(git, found.path, writtenDirectory(this.record), revision)).plan.phases.map(phase => phase.id));
      holdsPlan = push.offered.every(row => ids.has(row.id));
    } catch { /* A remote plan that cannot be read leaves the second clause to decide. */ }
    let holdsTip = false;
    const tip = await runGit(git, found.path, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]);
    if (tip.exitCode === 0) {
      const contains = await runGit(git, found.path, ["merge-base", "--is-ancestor", tip.stdout.trim(), revision]);
      if (contains.exitCode !== 0 && contains.exitCode !== 1) return failed(`Git could not compare this machine's ${branch} with ${name}: ${contains.stderr.trim()}`);
      holdsTip = contains.exitCode === 0;
    }
    const done = holdsPlan || holdsTip;
    const phases = push.offered.map(row => row.id).join(", ");
    return { done, checks: [{ name, passed: done, facts: [done ? `${name} holds this PRD's documents.` : `${name} does not hold ${push.offered.length === 1 ? "phase" : "phases"} ${phases} yet. Nothing Kiln can see was pushed.`] }] };
  }

  /** The push is done: the activity moves to `accepting` until its re-check decides (technical design, "Ending"). */
  private planPushDone(key: string): void {
    const push = this.planPushEntry(key);
    if (!push || push.doneAt) return;
    const at = this.now().toISOString();
    push.doneAt = at;
    const facts = this.phaseFacts(key);
    delete facts.stop; delete facts.wait;
    if (this.record.billing?.hold?.phaseKey === key) delete this.record.billing.hold;
    facts.doneAt = at;
    this.current = undefined;
    this.save();
    this.emit({ kind: "plan_push", at: this.now(), event: "pushed" });
  }

  /** The push session's first message (AC-BACK-05): the main checkout, the base branch and the commits beyond the remote. */
  planPushPrompt(key: string): string {
    const push = this.planPushEntry(key)!;
    const proposal = readContinuationProposal(this.stateDirectory, push.proposalId);
    const checkout = expandHome(this.record.repository.mainCheckoutPath);
    return planPushPrompt({ featureName: this.paths.featureName, prdFile: this.prdFile(), prdDirectory: writtenDirectory(this.record), checkout, baseBranch: this.planPushBase, commits: proposal.commits ?? [] });
  }

  /**
   * After the push (technical design, "Continue and the Push Session"): the plan check runs again.
   * When the new offer's ordered unfinished phases match the offered ones by id and phase scope
   * digest and it is ready, Kiln accepts it itself, as an instruction linked to the original press,
   * and Continue goes on as today. Otherwise the push closes with what the check found shown.
   */
  private async acceptAfterPush(key: string): Promise<"closed" | "stopped"> {
    const push = this.planPushEntry(key)!;
    let check: CompletedPlanCheck;
    try { check = await this.checkCompletedPlanOwned(); }
    catch (error) { if (this.stopping) return "stopped"; throw error; }
    if (this.stopping || this.closed) return "stopped";
    const proposal = check.result?.proposal;
    if (proposal && this.pushMatches(push, check)) {
      const answer = this.commands.submitInternal({ command_id: `plan-push-accept-${randomUUID()}`, execution_id: this.record.executionId!, status_token: this.controlView().token, action: "continuation-accept", inputs: { proposal_id: proposal.id, plan_push: key } });
      if (answer.ok) await this.commands.settled();
      if (this.stopping) return "stopped";
    }
    // No acceptance followed: the push closes as the result is shown.
    if (!push.closedAt) this.closePlanPush(push, this.record.completedPlanCheck);
    return "closed";
  }

  /** Whether the check's offer is the one the push was opened for: the same ordered phases, by id and phase scope digest, and ready. */
  private pushMatches(push: PlanPushActivity, check: CompletedPlanCheck): boolean {
    const proposal = check.result?.proposal;
    if (check.status !== "available" || !proposal || proposal.readiness !== "ready" || proposal.added.length !== push.offered.length) return false;
    const scopes = readBaseline(this.stateDirectory, check.result!.candidateId).active.scopes;
    return proposal.added.every((phase, index) => phase.id === push.offered[index]!.id && scopes[phase.id] === push.offered[index]!.phaseScopeDigest);
  }

  /** Closes a push past Done; when its re-check found an offer, records that offer's scope (technical design, "Data Models"). */
  private closePlanPush(push: PlanPushActivity, check: CompletedPlanCheck | undefined): void {
    push.closedAt = this.now().toISOString();
    const scope = check?.result?.proposal?.added.length ? check.result.proposal.scopeDigest : undefined;
    if (scope) { push.refreshedScope = scope; check!.result!.followsPush = planPushKey(push.operationId); }
    this.save();
  }

  private checkCompletedPlanOwned(options: { press?: boolean } = {}): Promise<CompletedPlanCheck> {
    if (this.completedPlanReading) return this.completedPlanReading;
    this.completedPlanPress = options.press === true;
    const previous = this.record.completedPlanCheck;
    this.checking = true;
    const attemptedAt = this.now().toISOString();
    this.record.completedPlanCheck = { status: "checking", attemptedAt, errors: [], ...(previous?.lastSuccessfulAt ? { lastSuccessfulAt: previous.lastSuccessfulAt } : {}), ...(previous?.result ?? previous?.earlierResult ? { earlierResult: previous?.result ?? previous?.earlierResult } : {}) };
    this.changed();
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    const reading = Promise.resolve().then(async () => {
      const authority = readPendingAuthority(this.stateDirectory, this.record);
      const priorProposal = previous?.result?.proposal ?? previous?.earlierResult?.proposal;
      const approvalProposalId = authority?.state === "pending" && !authority.proposalId && authority.approvals[0]
        ? lookupReceipt(this.stateDirectory, authority.approvals[0].commandId).instruction.inputs.proposal_id : undefined;
      const originalProposalId = authority?.proposalId ?? (typeof approvalProposalId === "string" ? approvalProposalId : undefined);
      const approved = authority?.state === "pending" && authority.completedExecutionId === this.record.executionId
        ? originalProposalId ? readContinuationProposal(this.stateDirectory, originalProposalId) : priorProposal?.scopeDigest === authority.scopeDigest ? priorProposal : undefined
        : undefined;
      if (authority?.state === "pending" && authority.completedExecutionId === this.record.executionId && (!approved || approved.scopeDigest !== authority.scopeDigest)) return Promise.reject(new Error("Restore the original continuation offer and approval receipt before checking its authority."));
      const observeInput = (observation: ContinuationInputObservation) => {
        if (!authority || authority.state !== "pending" || !approved || !changesContinuationScope(approved, observation)) return;
        authority.state = "superseded";
        try { this.writeContinuationMetadata(() => writePendingAuthority(this.stateDirectory, authority)); }
        catch (error) { throw new DiscoveryWriteFailure(`Observed continuation scope changed but authority publication needs restart: ${(error as Error).message}`, { cause: error }); }
      };
      const delivery = await this.deliveryDecision(options.press === true, signal);
      await this.bringBaseBranchesUpToDate(signal);
      return discoverCompletedPlan({ agentId: this.auditsAgent, codex: this.options.tools.codex, record: this.record, directory: this.stateDirectory, shared: expandHome(this.paths.mainCheckoutPath), git: { ...this.git, signal }, attemptedAt, delivery, observeInput, label: (name) => this.labelOf(name) });
    }).then(check => {
      if (this.stopping || this.closed) return check;
      const pendingAuthority = readPendingAuthority(this.stateDirectory, this.record);
      if (pendingAuthority?.state === "pending" && pendingAuthority.completedExecutionId === this.record.executionId && check.result?.proposal?.grantEligible && check.result.proposal.scopeDigest && pendingAuthority.scopeDigest !== check.result.proposal.scopeDigest) {
        pendingAuthority.state = "superseded";
        this.writeContinuationMetadata(() => writePendingAuthority(this.stateDirectory, pendingAuthority));
      }
      // A result whose offer has the scope the latest push's re-check found follows that push (technical design, "Data Models").
      const latest = latestPlanPush(this.record);
      if (check.result && latest?.refreshedScope && check.result.proposal?.scopeDigest === latest.refreshedScope) check.result.followsPush = planPushKey(latest.operationId);
      this.record.completedPlanCheck = check;
      // The accepted historical pointer is immutable. Recovery may establish it once.
      if (!this.record.planReconciliation?.baselineId && check.result) this.record.planReconciliation = { ...this.record.planReconciliation, baselineId: check.result.baselineId };
      try { this.save(); }
      catch (error) { this.commands.fault = "Plan check could not be durably saved. Restart Kiln before changing work."; throw error; }
      return check;
    }).catch(error => {
      if (error instanceof DiscoveryWriteFailure) this.commands.fault = error.message;
      // An uncertain record/sidecar write is not an acknowledged successful check.
      // Keep disk reconciliation faulted; only the public observation becomes unknown.
      this.record.completedPlanCheck = {
        status: "failed", attemptedAt,
        errors: [this.commands.fault ?? (error as Error).message],
        ...(previous?.lastSuccessfulAt ? { lastSuccessfulAt: previous.lastSuccessfulAt } : {}),
        ...(previous?.result ?? previous?.earlierResult ? { earlierResult: previous?.result ?? previous?.earlierResult } : {}),
      };
      throw error;
    }).finally(() => {
      this.checking = false; this.completedPlanReading = undefined;
      if (!this.stopping && !this.closed) this.emit({ kind: "completed_plan_checked", check: this.record.completedPlanCheck! });
      this.changed();
    });
    this.completedPlanReading = reading;
    return reading;
  }

  /**
   * The folder guard (missing worktree recovery, "The Folder Check"): true when every set-up
   * repository's saved folder is the run's worktree. A failing check sets Folder missing, gathering
   * the facts on entry or when asked (Check again); a passing one, with `mayLeave`, leaves the mode
   * and replays `kiln run`'s startup checks with the restart review. It writes nothing.
   */
  folderGuard(options: { gather?: boolean; mayLeave?: boolean } = {}): Promise<boolean> {
    const mayLeave = options.mayLeave !== false;
    // Only a check that may leave the mode is shared: a caller that must not replay startup
    // (a session being settled, the dispatch path) never joins one that does.
    if (this.folderChecking && mayLeave && !options.gather && !this.leavingFolderMissing) return this.folderChecking;
    const checking = this.runFolderGuard(options.gather === true, mayLeave).finally(() => { if (this.folderChecking === checking) this.folderChecking = undefined; });
    if (mayLeave) this.folderChecking = checking;
    return checking;
  }

  private async runFolderGuard(gather: boolean, mayLeave: boolean): Promise<boolean> {
    if (!checkedEntries(this.record).length || this.closed) return true;
    const folders = await checkFolders(this.git, this.record, this.now());
    if (this.stopping || this.closed) return !this.folderMissing;
    if (folders.passed) {
      // The replay's own checks pass while the mode is being left.
      if (this.leavingFolderMissing) return true;
      // While a Start in this engine holds its intent, that Start ends the mode (The Folder Check).
      if (this.folderStarting) return !this.folderMissing;
      if (this.folderMissing && mayLeave) await this.leaveFolderMissing();
      if (!this.folderMissing) this.supersedeStartIntents();
      return !this.folderMissing;
    }
    const entering = !this.folderMissing;
    const changedStates = this.folderMissing && JSON.stringify(this.folderMissing.folders.repositories.map(r => [r.name, r.state, r.holds])) !== JSON.stringify(folders.repositories.map(r => [r.name, r.state, r.holds]));
    if (entering || gather || changedStates) {
      const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
      const view = await gatherFolderFacts({ git: { ...this.git, signal }, record: this.record, check: folders, prdDirectoryFromRoot: this.paths.prdDirectoryFromRoot, now: this.now(), ...this.startFolders(), label: (name) => this.labelOf(name) });
      this.folderMissing = { ...view, folders };
      await this.refreshFolderPanel();
    } else this.folderMissing = { ...this.folderMissing!, folders: { ...folders, checkedAt: this.folderMissing!.folders.checkedAt } };
    if (entering) {
      // No restart review, wait watcher or dispatch while a folder is missing.
      this.restartReview = undefined; this.reviewingRestart = false; this.pendingResume = undefined; this.requestedResume = undefined;
      this.unwatchWait(); this.updateKeepAwake();
      if (this.announceFolderMissing) this.emit({ kind: "folder_missing", view: this.folderMissing, folders });
    }
    this.changed();
    return false;
  }

  /**
   * Every folder passes again: replay the startup sequence `kiln run` uses, then clear the mode, so
   * nothing acts in between. A session this Kiln started that is still working, or still being
   * settled, needs no replay: its own loop judges it once it ends, as if the folder never went.
   */
  private async leaveFolderMissing(): Promise<void> {
    if (this.driving || this.current?.processRunning) { this.folderMissing = undefined; this.folderPanel = undefined; this.folderDraft = emptyDraft(); this.folderDraftSeeded = false; this.changed(); return; }
    this.leavingFolderMissing = true;
    try {
      const prepared = await this.prepare();
      if (prepared.ok) await this.decide({ review: true });
    } finally { this.folderMissing = undefined; this.folderPanel = undefined; this.folderDraft = emptyDraft(); this.folderDraftSeeded = false; this.leavingFolderMissing = false; this.changed(); }
  }

  /** A command refused while a folder is missing, after the guard ran; undefined when the folders pass. */
  private async folderRefusal(): Promise<{ ok: false; code: "folder_missing" | "folder_missing_resolved"; reason: string; status: 409 } | undefined> {
    const wasMissing = !!this.folderMissing;
    if (await this.folderGuard()) return wasMissing ? { ok: false, code: "folder_missing_resolved", reason: "The run's folders are back, and Kiln checked the run again. Review the page before acting.", status: 409 } : undefined;
    return { ok: false, code: "folder_missing", reason: FOLDER_MISSING_REASON, status: 409 };
  }

  /** Check again on the Folder missing page: the folder check, the facts and, once every folder passes, leaving the mode. */
  async checkFoldersAgain(): Promise<{ ok: true; folderMissing: boolean }> {
    await this.folderGuard({ gather: true });
    return { ok: true, folderMissing: !!this.folderMissing };
  }

  // ---- Setting the run up again (missing worktree recovery, "The Setup Panel", "Start") ----------

  /** The one panel draft per PRD, held in memory until Start succeeds (AC-SAFE-01). */
  private folderDraft: PanelDraft = emptyDraft();
  /** The setup panel last built for the Folder missing page. */
  folderPanel: PanelView | undefined;
  /** What a failed Start did and what remains (AC-SAFE-01). */
  folderStartProgress: { done: string[]; remaining: string[]; error: string } | undefined;
  /** The start intent `folderStartProgress` describes. */
  private folderStartProgressOf: string | undefined;
  /** A Start in this engine holds an intent `in_progress`; a passing check does not end the mode meanwhile. */
  private folderStarting = false;
  /** Whether a failed or interrupted start intent may still be open: checked once at startup, then after each failed Start. */
  private startIntentsMayBeOpen = true;
  /** The draft has taken a failed intent's kind, names and settings (The Setup Panel, The draft). */
  private folderDraftSeeded = false;

  /** The start intent the draft starts from: this execution's latest failed one; one left `in_progress` by an earlier Kiln is failed. */
  private failedStartIntent(): FolderSetupStart | undefined {
    if (!this.record.executionId) return undefined;
    const intents = startIntents(this.stateDirectory, this.record.executionId);
    for (const intent of intents) if (intent.state === "in_progress" && !this.folderStarting) { intent.state = "failed"; writeStartIntent(this.stateDirectory, intent); }
    const failed = intents.filter(intent => intent.state === "failed").at(-1);
    if (failed) this.startIntentsMayBeOpen = true;
    return failed;
  }

  /** The folders a failed existing-branch start made, which the facts and the next Start recognize as its own (AC-SAFE-01). */
  private startFolders(): { startFolders?: Record<string, string> } {
    const intent = this.failedStartIntent();
    if (intent?.kind !== "branch") return {};
    return { startFolders: Object.fromEntries(intent.repositories.map(repository => [repository.name, expandHome(repository.worktreePath)])) };
  }

  /** Every folder passes: a failed or interrupted start intent is superseded, its artifacts left in place (The Folder Check). */
  private supersedeStartIntents(): void {
    if (this.folderStarting || !this.record.executionId || !this.startIntentsMayBeOpen) return;
    this.startIntentsMayBeOpen = false;
    for (const intent of startIntents(this.stateDirectory, this.record.executionId)) {
      if (intent.state === "failed" || intent.state === "in_progress") { intent.state = "superseded"; writeStartIntent(this.stateDirectory, intent); }
    }
    this.folderStartProgress = undefined; this.folderStartProgressOf = undefined;
  }

  /** A Codex or pull-request process an earlier Kiln left running, which Start stops before any Git write. */
  private async leftOverSession(): Promise<SessionRecord | undefined> {
    if (this.current) return undefined;
    const latest = this.latestSessionOverall();
    const run = latest?.session.runs.at(-1);
    if (!latest || !run || run.endedAt || run.pid === undefined) return undefined;
    if (latest.session.agentId === "claude_code" && latest.session.kind !== "pull_request") return undefined;
    return await isProcessLive(run.pid, run.processStartTime) ? latest.session : undefined;
  }

  /** Why Start is refused as busy right now, for the line under the button; read at each snapshot, so it clears when the session ends (AC-SAFE-01). */
  folderBusy(): string | undefined {
    if (!(this.current?.processRunning || this.driving)) return undefined;
    const pid = this.current?.session?.runs.at(-1)?.pid;
    return this.recoveredLive ? `A session started by an earlier Kiln is still running${pid ? ` (process ${pid})` : ""}. Start becomes available when it ends.` : "A session is still running. Start becomes available when it ends, or when you stop Kiln in the terminal.";
  }

  /**
   * The phase the run was on when its folder went missing (AC-SAFE-02): stopped at Needs you, waiting for usage, working
   * (a live session, or one whose folder went missing while it worked), never the pull request or an audit.
   */
  private folderRunPhaseKey(): string | undefined {
    const leaf = (key: string | undefined) => key !== undefined && activityKeyKind(key) === "phase";
    const stopped = this.stoppedPhaseKey();
    if (stopped !== undefined) return leaf(stopped) ? stopped : undefined;
    const key = this.waitingPhaseKey() ?? this.current?.phaseKey ?? this.latestSessionOverall()?.phaseKey;
    return leaf(key) && !this.record.phases[key!]?.doneAt ? key : undefined;
  }

  private async folderPanelContext(view: FolderMissingView): Promise<PanelContext> {
    // Leaves this run completed, with the commit each repository's Done recorded there: pushed, or the waived head (AC-SAFE-02).
    const completedByRun = new Map<string, { doneAt: string; commits: Record<string, string>; waived?: string[] }>();
    for (const [key, facts] of Object.entries(this.record.phases).filter(([, facts]) => facts.doneAt).sort(([, a], [, b]) => a.doneAt!.localeCompare(b.doneAt!))) {
      if (activityKeyKind(key) !== "phase") continue;
      const commits: Record<string, string> = {}; const waived: string[] = [];
      for (const [name, repository] of Object.entries(facts.repositories)) { const sha = repository.pushedSha ?? repository.waivedHead; if (sha) commits[name] = sha; if (!repository.pushedSha && repository.waivedHead) waived.push(name); }
      completedByRun.set(this.judgedId(key), { doneAt: facts.doneAt!, commits, ...(waived.length ? { waived } : {}) });
    }
    const stoppedKey = this.stoppedPhaseKey();
    const onKey = this.folderRunPhaseKey();
    const stoppedPhaseId = onKey !== undefined ? this.judgedId(onKey) : undefined;
    const stoppedStarts = onKey !== undefined ? Object.fromEntries(Object.entries(this.record.phases[onKey]?.repositories ?? {}).map(([name, repository]) => [name, repository.startCommit])) : undefined;
    const pausePhaseId = (stoppedKey !== undefined ? (stoppedPhaseId ?? stoppedKey) : undefined) ?? recordedLeaves(this.record.plan ?? []).find(leaf => !leaf.closed && !this.waiverClosed(leaf.id) && !this.record.phases[leaf.id]?.doneAt)?.id;
    const leftOver = await this.leftOverSession();
    const intent = this.failedStartIntent();
    const busy = this.folderBusy();
    return {
      git: this.git, record: this.record, view, prdDirectoryFromRoot: this.paths.prdDirectoryFromRoot, prdFolder: this.paths.folderName,
      completedByRun, ...(stoppedPhaseId ? { stoppedPhaseId } : {}), ...(stoppedStarts ? { stoppedStarts } : {}),
      mergeAgent: AGENT_NAMES[this.agentOf(MERGE_KEY)], judgedId: id => this.judgedId(id), label: name => this.labelOf(name), labelWritten: name => this.labelOfWritten(name),
      ...(pausePhaseId ? { pausePhaseId } : {}), ...(intent ? { intent } : {}),
      ...(leftOver?.runs.at(-1)?.pid !== undefined ? { stopsLeftOver: leftOver.runs.at(-1)!.pid! } : {}), ...(busy ? { busy } : {}),
      originIdentity: async path => { const origin = parseGithubOrigin((await runGit(this.git, path, ["config", "--get", "remote.origin.url"])).stdout); return origin ? `${origin.owner}/${origin.name}` : undefined; },
    };
  }

  /** Rebuilds the panel from the current facts and draft, and publishes it. */
  private async refreshFolderPanel(): Promise<void> {
    const view = this.folderMissing;
    if (!view) { this.folderPanel = undefined; return; }
    const context = await this.folderPanelContext(view);
    if (!this.folderDraftSeeded && context.intent) {
      // The draft starts from a failed start's kind, names and settings, including after a restart.
      const intent = context.intent;
      const prd = intent.repositories.find(row => row.kind === "prd") ?? intent.repositories[0];
      this.folderDraft.selected = intent.kind;
      this.folderDraft.edits[intent.kind] = { ...(intent.kind === "base" ? { featureBranch: intent.settings.featureBranch, workspaceFolder: intent.settings.workspaceFolder, baseBranch: intent.settings.baseBranch, bases: intent.settings.bases } : {}), ...(prd && intent.repositories.length === 1 ? { worktreePath: prd.worktreePath } : {}), keepAwake: intent.settings.keepAwake, resumeAfterUsageLimit: intent.settings.resumeAfterUsageLimit };
    }
    this.folderDraftSeeded = true;
    // A Start that failed, or stopped with Kiln, says what it did and what remains, from its durable intent, including after a restart (AC-SAFE-01).
    if (!this.folderStarting && context.intent?.id !== this.folderStartProgressOf) {
      this.folderStartProgress = context.intent ? progressOf(context.intent) : undefined;
      this.folderStartProgressOf = context.intent?.id;
    }
    try {
      const built = await buildPanel(context, this.folderDraft);
      // A build that started before a later change, and finished after it was shown, would show an older panel as the latest (AC-SETUP-03).
      const shown = this.folderPanel && !("blocked" in this.folderPanel) ? this.folderPanel.draftRevision : undefined;
      if ("blocked" in built || shown === undefined || built.draftRevision >= shown) this.folderPanel = built;
    }
    catch (error) { this.folderPanel = { blocked: `Kiln couldn’t prepare the setup: ${(error as Error).message}. Check again.` }; }
    this.changed();
  }

  private applyFolderDraft(start: StartKind, fields: Partial<PanelFields>): void {
    this.folderDraft.selected = start;
    // Rising across restarts too, so the page can tell a panel built from its latest edit (AC-SETUP-01, AC-SETUP-03).
    this.folderDraft.revision = Math.max((this.folderDraft.revision ?? 0) + 1, this.now().getTime());
    for (const [key, value] of Object.entries(fields) as [keyof PanelFields, PanelFields[keyof PanelFields]][]) {
      if (["keepAwake", "resumeAfterUsageLimit"].includes(key)) { (this.folderDraft.edits.base as Record<string, unknown>)[key] = value; (this.folderDraft.edits.branch as Record<string, unknown>)[key] = value; }
      else if (key === "bases") this.folderDraft.edits[start].bases = { ...this.folderDraft.edits[start].bases, ...(value as Record<string, string>) };
      else (this.folderDraft.edits[start] as Record<string, unknown>)[key] = value;
    }
  }

  /** Reads a posted draft change; undefined with the reason when it is malformed or changes a fixed field. */
  private folderChange(body: Record<string, unknown>): { start: StartKind; fields: Partial<PanelFields> } | { reason: string } {
    const start = body.start;
    if (start !== "base" && start !== "branch") return { reason: "Choose a starting point." };
    const raw = body.fields;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "Send the panel's fields." };
    const fields: Partial<PanelFields> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (["worktreePath", "workspaceFolder", "featureBranch", "baseBranch"].includes(key) && typeof value === "string") (fields as Record<string, unknown>)[key] = value;
      else if (["keepAwake", "resumeAfterUsageLimit"].includes(key) && typeof value === "boolean") (fields as Record<string, unknown>)[key] = value;
      else if (key === "bases" && value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(base => typeof base === "string")) fields.bases = value as Record<string, string>;
      else return { reason: `Unknown or malformed field ${key}.` };
    }
    // Starting from the existing branch fixes the branch, each repository's base and, for several repositories, the workspace folder.
    if (start === "branch") {
      const saved = this.record.settings;
      const changed = (fields.featureBranch !== undefined && fields.featureBranch !== saved.featureBranch) || (fields.baseBranch !== undefined && fields.baseBranch !== this.setUpRepositories[0]?.baseBranch) || (fields.bases !== undefined && Object.entries(fields.bases).some(([name, base]) => this.setUpRepositories.find(entry => entry.name === name)?.baseBranch !== base)) || (this.multiRepository && fields.workspaceFolder !== undefined && expandHome(fields.workspaceFolder) !== expandHome(saved.workspaceFolder));
      if (changed) return { reason: "That field is fixed when starting from the run’s existing branch." };
    }
    return { start, fields };
  }

  /** `POST /api/folder-setup/panel`: one draft change, checked and previewed, published by SSE. */
  async changeFolderPanel(body: Record<string, unknown>): Promise<{ ok: true; panel: PanelView | undefined } | { ok: false; status: 400 | 409; code: string; reason: string }> {
    if (!this.folderMissing) return { ok: false, status: 409, code: "wrong_activity", reason: "The run’s folders are in place; there is nothing to set up again." };
    const change = this.folderChange(body);
    if ("reason" in change) return { ok: false, status: 400, code: "invalid_input", reason: change.reason };
    this.applyFolderDraft(change.start, change.fields);
    await this.refreshFolderPanel();
    return { ok: true, panel: this.folderPanel };
  }

  /** `POST /api/folder-setup/start`, under the command journal like continuation acceptance (missing worktree recovery, "Start"). */
  async folderSetupStartCommand(body: Record<string, unknown>): Promise<{ ok: true; status: 200 } | { ok: false; status: 400 | 409 | 500 | 503; code: string; reason: string; done?: string[]; remaining?: string[] }> {
    if (Object.keys(body).sort().join() !== "commandId,factsId,fields,previewId,start" || typeof body.commandId !== "string" || typeof body.factsId !== "string" || typeof body.previewId !== "string") return { ok: false, status: 400, code: "malformed_request", reason: "Use the displayed facts, preview and a command ID." };
    let answer;
    try { answer = this.commands.submitInternal({ command_id: body.commandId, execution_id: this.record.executionId, status_token: this.controlView().token, action: "folder-setup-start", inputs: { facts_id: body.factsId, preview_id: body.previewId, start: body.start, fields: body.fields } }); }
    catch (error) { return { ok: false, status: 400, code: "invalid_input", reason: (error as Error).message }; }
    if (!answer.ok) return { ok: false, status: 409, code: answer.errors[0]?.code ?? "busy", reason: answer.errors[0]?.message ?? "Start was refused." };
    await this.commands.settled();
    const settled = this.commands.lookup(body.commandId).operation as Receipt;
    if (settled.state === "completed") return { ok: true, status: 200 };
    const code = settled.outcome ?? "not_applied";
    const status = code === "folder_missing_check_failed" ? 503 : code === "folder_setup_failed" ? 500 : 409;
    return { ok: false, status, code, reason: settled.reason ?? "Start didn’t finish.", ...(code === "folder_setup_failed" && this.folderStartProgress ? { done: this.folderStartProgress.done, remaining: this.folderStartProgress.remaining } : {}) };
  }

  /** Start's work, run by the command journal: recheck, intent, steps, then the fresh execution or the explicit Resume. */
  private async applyFolderStart(inputs: Record<string, unknown>, receipt: Receipt): Promise<{ ok: boolean; code?: string; reason?: string; status?: number }> {
    if (!this.folderMissing) return { ok: false, code: "wrong_activity", reason: "The run’s folders are in place; there is nothing to set up again.", status: 409 };
    if (this.current?.processRunning || this.driving || this.settingUp) {
      const context = await this.folderPanelContext(this.folderMissing);
      return { ok: false, code: "busy", reason: context.busy ?? "Kiln is busy. Try again when it settles.", status: 409 };
    }
    const change = this.folderChange({ start: inputs.start, fields: inputs.fields });
    if ("reason" in change) return { ok: false, code: "invalid_input", reason: change.reason, status: 400 };
    // Start acts on the panel the engine last showed: a starting point it names that differs from the draft's is a changed page, not an edit (AC-SETUP-03).
    if (Object.keys(change.fields).length) this.applyFolderDraft(change.start, change.fields);
    const kind = change.start;

    // Start rechecks the facts and the plan it showed before acting (AC-SAFE-01).
    const folders = await checkFolders(this.git, this.record, this.now());
    if (folders.passed) { await this.leaveFolderMissing(); return { ok: false, code: "folder_missing_resolved", reason: "The run’s folders are back, and Kiln checked the run again. Nothing was set up.", status: 409 }; }
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    const view = await gatherFolderFacts({ git: { ...this.git, signal }, record: this.record, check: folders, prdDirectoryFromRoot: this.paths.prdDirectoryFromRoot, now: this.now(), ...this.startFolders(), label: (name) => this.labelOf(name) });
    this.folderMissing = { ...view, folders };
    const context = await this.folderPanelContext(view);
    const panel = await buildPanel(context, this.folderDraft);
    this.folderPanel = panel; this.changed();
    if ("blocked" in panel) return { ok: false, code: "folder_missing_check_failed", reason: panel.blocked, status: 503 };
    const choice = panel.choices[kind];
    if ("unavailable" in choice) return choice.unavailable.startsWith("Couldn’t check") ? { ok: false, code: "folder_missing_check_failed", reason: choice.unavailable, status: 503 } : { ok: false, code: "folder_setup_changed", reason: choice.unavailable, status: 409 };
    if (view.factsId !== inputs.facts_id || panel.previewId !== inputs.preview_id || panel.selected !== kind) return { ok: false, code: "folder_setup_changed", reason: "What Kiln found changed since the page was shown. Review the refreshed page, then press Start again.", status: 409 };
    if (Object.keys(panel.fieldErrors).length) return { ok: false, code: "folder_setup_fields", reason: Object.values(panel.fieldErrors).join(" "), status: 409 };
    const build = await buildStart(context, this.folderDraft, kind);
    if ("unavailable" in build) return { ok: false, code: "folder_setup_changed", reason: build.unavailable, status: 409 };
    if (kind === "branch" && this.record.liveControl) {
      // Start is the explicit hand-back that ends a takeover hold, with that Resume's checks (AC-SAFE-03).
      try { await this.requireTakeoverReturn(); }
      catch (error) { if (!(error instanceof OwnershipError)) throw error; return { ok: false, code: error.code, reason: error.message, status: 409 }; }
    }

    // The start intent, written before any Git write: a failed one with the same kind and names is resumed.
    const repositories: FolderSetupRepository[] = build.repositories.filter(repository => build.folders[repository.name] !== undefined).map(repository => ({
      name: repository.name, ...(repository.shortName === undefined ? {} : { shortName: repository.shortName }), kind: repository.kind, github: repository.github, mainCheckoutPath: repository.mainCheckoutPath, baseBranch: repository.baseBranch, branch: build.fields.featureBranch, worktreePath: build.folders[repository.name]!,
      ...(build.baseCommits[repository.name] ? { baseCommit: build.baseCommits[repository.name]! } : {}),
      ...(build.createLocal[repository.name] ? { createLocalFromOrigin: build.createLocal[repository.name]! } : {}),
      ...(build.clearRecords.find(path => this.record.repositories.find(entry => entry.name === repository.name && comparable(expandHome(entry.worktreePath)) === comparable(path))) ? { clearStaleRecord: build.clearRecords.find(path => this.record.repositories.find(entry => entry.name === repository.name && comparable(expandHome(entry.worktreePath)) === comparable(path)))! } : {}),
    }));
    const names = (intent: FolderSetupStart) => JSON.stringify(intent.repositories.map(r => [r.name, r.branch, comparable(expandHome(r.worktreePath))]));
    const labels = this.labelSet();
    const stepLabel = (repository: FolderSetupRepository) => labelAmong({ shortName: repository.shortName ?? repository.name, addressPath: repository.github }, labels);
    const settings = this.folderSettings(build.fields);
    const earlier = this.failedStartIntent();
    let intent: FolderSetupStart;
    if (earlier && earlier.kind === kind && names(earlier) === JSON.stringify(repositories.map(r => [r.name, r.branch, comparable(expandHome(r.worktreePath))]))) {
      // The steps follow the new build (a clear it now needs is added), keeping what the earlier attempt did.
      const steps = plannedSteps(kind, repositories, build.repositories.length > 1, stepLabel).map(planned => earlier.steps.find(row => row.name === planned.name) ?? planned);
      intent = { ...earlier, settings, steps, factsId: view.factsId, previewId: panel.previewId, state: "in_progress", repositories: earlier.repositories.map((row, index) => ({ ...repositories[index]!, ...(row.baseCommit && earlier.steps.some(s => s.name === `worktree:${row.name}` && s.state === "done") ? { baseCommit: row.baseCommit } : {}) })) };
    } else {
      if (earlier) {
        // A different start first checks that each artifact the earlier one created is still its own and untouched.
        const occupied = await stillOwnArtifacts(this.git, earlier);
        if (occupied) return { ok: false, code: "folder_setup_work_present", reason: `${displayPath(occupied)} holds work Start did not make. Nothing was removed; move or commit it, then press Start again.`, status: 409 };
        earlier.state = "superseded"; writeStartIntent(this.stateDirectory, earlier);
      }
      intent = { formatVersion: 1, id: randomUUID(), commandId: receipt.command_id, executionId: this.record.executionId!, kind, factsId: view.factsId, previewId: panel.previewId, createdAt: this.now().toISOString(), settings, repositories, steps: plannedSteps(kind, repositories, build.repositories.length > 1, stepLabel), state: "in_progress", ...(kind === "base" ? { newExecutionId: randomUUID() } : {}) };
    }
    const save = () => writeStartIntent(this.stateDirectory, intent);
    this.folderStarting = true;
    delete intent.error;
    this.folderStartProgress = undefined; this.folderStartProgressOf = undefined;
    try {
      save();
      // A Codex or pull-request process an earlier Kiln left running is stopped before any Git write.
      const leftOver = await this.leftOverSession();
      if (leftOver) await this.stopLiveProcess(leftOver);
      if (kind === "base") await this.runBaseStart(intent, build, save, receipt);
      else await this.runBranchStart(intent, build, save);
    } catch (error) {
      this.folderStarting = false;
      if (this.record.executionId === intent.newExecutionId) { this.commands.fault ??= "Activation metadata is unresolved. Restart Kiln to rebuild inspection before dispatch."; throw error; }
      intent.state = error instanceof FolderSetupChanged ? "superseded" : "failed"; save();
      this.startIntentsMayBeOpen = true;
      this.folderStartProgress = progressOf(intent); this.folderStartProgressOf = intent.id;
      if (error instanceof FolderSetupChanged) { this.folderStartProgress = undefined; await this.folderGuard({ gather: true, mayLeave: false }); await this.refreshFolderPanel(); return { ok: false, code: "folder_setup_changed", reason: error.message, status: 409 }; }
      // An error outside a step is saved with the intent, so the page still says it after a restart (AC-SAFE-01).
      if (!(error instanceof StartStepFailure)) { intent.error = (error as Error).message; save(); this.folderStartProgress = { ...this.folderStartProgress, error: intent.error }; }
      // The page is republished with the facts and preview recomputed (Start).
      await this.folderGuard({ gather: true });
      if (this.folderMissing) await this.refreshFolderPanel();
      return { ok: false, code: "folder_setup_failed", reason: (error as Error).message, status: 500 };
    }
    this.folderStarting = false;
    return { ok: true };
  }

  /** The panel's fields as the run's settings: the editable ones and, for the start's folder and branch, its names. */
  private folderSettings(fields: PanelFields): Settings {
    const settings = structuredClone(this.record.settings);
    Object.assign(settings, { workspaceFolder: fields.workspaceFolder, worktreePath: expandHome(fields.worktreePath), featureBranch: fields.featureBranch, baseBranch: fields.baseBranch, bases: fields.bases, keepAwake: fields.keepAwake, resumeAfterUsageLimit: fields.resumeAfterUsageLimit });
    return settings;
  }

  /** From the base branch (AC-SETUP-04): branch and folder per repository, the plan, preparation, then the fresh execution. */
  private async runBaseStart(intent: FolderSetupStart, build: StartBuild, save: () => void, receipt: Receipt): Promise<void> {
    for (const repository of intent.repositories.filter(row => row.clearStaleRecord)) await step(intent, `clear:${repository.name}`, save, () => clearStaleRecord(this.git, repository));
    for (const repository of intent.repositories) await step(intent, `worktree:${repository.name}`, save, () => createBranchAndFolder(this.git, repository, this.labelOf(repository.name)));
    const prd = intent.repositories.find(repository => repository.kind === "prd")!;
    let source: PlanSource | undefined;
    await step(intent, "plan", save, async () => {
      const observed = observeActivePlan(expandHome(prd.worktreePath), this.paths.prdDirectoryFromRoot);
      source = observed.source; this.unfollowedLinks = observed.unfollowed;
      if (source.digest !== build.plan!.digest) throw new FolderSetupChanged("The plan in the new folder isn’t the one the page showed. Review the refreshed page, then press Start again.");
    });
    source ??= observePlan(expandHome(prd.worktreePath), this.paths.prdDirectoryFromRoot);
    if (source.digest !== build.plan!.digest) throw new FolderSetupChanged("The plan in the new folder isn’t the one the page showed. Review the refreshed page, then press Start again.");
    const preparation = await this.folderStartPreparation(source, intent, intent.previewId);
    await step(intent, "activate", save, async () => this.activateFolderStart(intent, source!, preparation, receipt));
    this.folderMissing = undefined; this.folderPanel = undefined; this.folderDraft = emptyDraft(); this.folderDraftSeeded = false;
    this.emit({ kind: "message", text: `Set the run up again from ${prd.baseBranch}: ${prd.branch} in ${displayPath(this.multiRepository ? expandHome(intent.settings.workspaceFolder) : expandHome(prd.worktreePath))}.` });
    this.changed();
    this.kick();
  }

  /** Step 3 of a base-branch start: the first leaf's preparation, bound exactly as continuation readiness binds it. */
  private async folderStartPreparation(source: PlanSource, intent: FolderSetupStart, previewId: string): Promise<PrdRecord["preparation"]> {
    const first = leavesOf(source.plan).find(leaf => !leaf.closed);
    const problems: string[] = [];
    const repositories = intent.repositories.map(repository => ({ name: repository.name, identity: repository.github, path: expandHome(repository.mainCheckoutPath), baseBranch: repository.baseBranch, baseRevision: repository.baseCommit! }));
    const bound = await bindPreparation({ git: this.git, record: this.record, candidate: source, first, repositories, problems, label: (name) => this.labelOf(name), labelWritten: (name) => this.labelOfWritten(name) });
    if (problems.length) throw new Error(problems.join(" "));
    if (!bound.preparation.length) return undefined;
    return newPreparationState({ firstEligiblePhase: first!.id, preparation: bound.preparation, id: previewId } as unknown as Parameters<typeof newPreparationState>[0]);
  }

  /** Step 4: the unfinished execution archived, the fresh one activated through the shared core (Start, From the base branch). */
  private activateFolderStart(intent: FolderSetupStart, source: PlanSource, preparation: PrdRecord["preparation"], receipt: Receipt): void {
    const old = this.record;
    const at = this.now().toISOString();
    const archiveId = retainExecution(this.stateDirectory, old);
    const archiveRow: ExecutionSummary = { executionId: old.executionId!, archiveId, ...(old.startedAt ? { startedAt: old.startedAt } : {}), branch: old.settings.featureBranch, deliveries: executionDeliveries(old), endedAt: at, ending: "folder_missing_setup", ...this.executionRunningMs(at) };
    // Each done leaf's receipt, built as plan reconciliation builds it; no completion revision is re-read (AC-SETUP-04).
    const earlier = old.planReconciliation?.baselineId ? readBaseline(this.stateDirectory, old.planReconciliation.baselineId) : undefined;
    const prd = intent.repositories.find(repository => repository.kind === "prd")!;
    const completions: PlanBaseline["completions"] = {};
    for (const leaf of leavesOf(source.plan).filter(candidate => candidate.closed)) {
      const scopeRepositories = phaseRepositories(source, leaf.id);
      const carried = earlier?.completions[leaf.id];
      if (carried) { completions[leaf.id] = { ...carried, scopeRepositories: carried.scopeRepositories ?? scopeRepositories }; continue; }
      const owner = Object.entries(old.phases).find(([key, facts]) => facts.doneAt && activityKeyKind(key) === "phase" && this.judgedId(key) === leaf.id)?.[1];
      if (owner) {
        const revision = owner.repositories[prd.name]?.pushedSha ?? owner.repositories[prd.name]?.waivedHead;
        completions[leaf.id] = { kind: "kiln", scopeRepositories, doneAt: owner.doneAt!, ...(owner.waiverId ? { waiverId: owner.waiverId } : {}), ...(revision ? { revision } : {}), repositories: Object.fromEntries(Object.entries(owner.repositories).flatMap(([name, facts]) => { const identity = old.repositories.find(entry => entry.name === name)?.github ?? ""; return facts.pushedSha ? [[name, { identity, revision: facts.pushedSha }]] : facts.waivedHead ? [[name, { identity, revision: facts.waivedHead, waived: true as const }]] : []; })) };
        continue;
      }
      completions[leaf.id] = { kind: "external", scopeRepositories, revision: prd.baseCommit!, repositories: Object.fromEntries(intent.repositories.map(repository => [repository.name, { identity: repository.github, revision: repository.baseCommit! }])) };
    }
    const baseline = this.writeContinuationMetadata(() => retainBaseline(this.stateDirectory, { formatVersion: 1, normalizerVersion: PLAN_NORMALIZER_VERSION, prdDirectory: this.paths.prdDirectoryFromRoot, active: source, sources: [], completions }));
    // A pending pause request carries only when its phase is still to run (Pause state at Start).
    const remaining = leavesOf(source.plan).filter(leaf => !leaf.closed).map(leaf => leaf.id);
    const pausePhase = this.stoppedPhaseKey() !== undefined ? this.judgedId(this.stoppedPhaseKey()!) : recordedLeaves(old.plan ?? []).find(leaf => !leaf.closed && !this.waiverClosed(leaf.id) && !old.phases[leaf.id]?.doneAt)?.id;
    const pause = old.pause.requestedAt && !old.pause.activeSince && pausePhase && remaining.includes(pausePhase) ? { requestedAt: old.pause.requestedAt, requestedFor: pausePhase } : {};
    const repositories: RepositoryEntry[] = intent.repositories.map(repository => ({ name: repository.name, ...(repository.shortName === undefined ? {} : { shortName: repository.shortName }), kind: repository.kind, mainCheckoutPath: repository.mainCheckoutPath, github: repository.github, baseBranch: repository.baseBranch, worktreePath: expandHome(repository.worktreePath), baseCommit: repository.baseCommit!, setupCompletedAt: at }));
    const continuation: ContinuationState = old.continuation ? structuredClone(old.continuation) : { formatVersion: 1, journalIndexed: true, acceptances: [], executions: [] };
    delete continuation.currentAcceptanceId;
    this.commands.enableExecutionIndex();
    this.activateExecution({ archiveRow, continuation, newExecutionId: intent.newExecutionId!, operationId: receipt.id, plan: source.plan, baselineId: baseline.id, at,
      fields: { settings: intent.settings, repositories, pause, developmentAuthorization: old.developmentAuthorization ?? restrictedAuthorization(), ...(old.pendingContinuationAuthority ? { pendingContinuationAuthority: old.pendingContinuationAuthority } : {}), ...(preparation ? { preparation } : {}), startedAt: at, refinementConfirmedAt: old.refinementConfirmedAt ?? at, setupCompletedAt: at, branchStem: old.branchStem ?? old.settings.featureBranch, folderSetupStart: { id: intent.id, commandId: intent.commandId, fromExecutionId: old.executionId! } },
      afterSave: () => { intent.state = "activated"; writeStartIntent(this.stateDirectory, intent); } });
  }

  /** From the existing feature branch (AC-SETUP-05): the failing repositories' worktrees, then the explicit Resume. */
  private async runBranchStart(intent: FolderSetupStart, build: StartBuild, save: () => void): Promise<void> {
    let unpaused = false;
    for (const repository of intent.repositories.filter(row => row.createLocalFromOrigin)) await step(intent, `branch:${repository.name}`, save, () => createLocalBranch(this.git, repository));
    for (const repository of intent.repositories.filter(row => row.clearStaleRecord)) await step(intent, `clear:${repository.name}`, save, () => clearStaleRecord(this.git, repository));
    for (const repository of intent.repositories) await step(intent, `worktree:${repository.name}`, save, () => addWorktreeOnBranch(this.git, repository));
    await step(intent, "save", save, async () => {
      const at = this.now().toISOString();
      const single = this.record.repositories.filter(entry => entry.setupCompletedAt !== undefined).length === 1;
      for (const repository of intent.repositories) {
        const entry = this.record.repositories.find(candidate => candidate.name === repository.name)!;
        const before = expandHome(entry.worktreePath);
        const after = expandHome(repository.worktreePath);
        // A single-repository session moves with its folder; Claude Code resumes from another folder (WTR-004).
        if (single && comparable(resolve(before)) !== comparable(resolve(after))) this.moveSessionFolders(before, after);
        entry.worktreePath = after; entry.setupCompletedAt = at;
      }
      const settings = intent.settings;
      // A start from the panel keeps the PRD's model choices (Kiln Phase Model Tiers, "Changes to Earlier Designs").
      Object.assign(this.record.settings, { worktreePath: settings.worktreePath, workspaceFolder: settings.workspaceFolder, keepAwake: settings.keepAwake, resumeAfterUsageLimit: settings.resumeAfterUsageLimit });
      // Start is the person's explicit go: it ends an active pause and a released takeover hold (AC-SAFE-03).
      // A Start that ends a pause runs a preflight first, in the same write (RUN-003).
      // The pause's request was consumed when it became active, so it goes with it, as Start's own clear does.
      if (this.record.pause.activeSince !== undefined) { unpaused = true; setPreflightDue(this.record, "unpause", at); this.record.pause = {}; }
      if (this.record.liveControl) { this.resolveMessageHold(); delete this.record.liveControl; }
      this.save();
      intent.state = "resumed";
    });
    // Run the restart decision with the review released, as an explicit Resume (AC-SETUP-05).
    this.folderStarting = false;
    this.folderMissing = undefined; this.folderPanel = undefined; this.folderDraft = emptyDraft(); this.folderDraftSeeded = false;
    this.changed();
    const prepared = await this.prepare();
    if (!prepared.ok) return;
    if (this.folderMissing) return;
    this.pendingResume = undefined;
    await this.decide({ review: true });
    if (!unpaused) this.markResumePreflight();
    this.restartReview = undefined; this.reviewingRestart = false;
    this.changed();
    this.kick();
  }

  /** Rewrites this execution's Claude Code sessions recorded in the old folder to the new one, before the run's record is saved. */
  private moveSessionFolders(before: string, after: string): void {
    for (const [key, facts] of Object.entries(this.record.phases)) {
      for (const id of facts.sessionIds) {
        const session = this.sessionRecord(key, id);
        if (!session || session.agentId === "codex" || !session.workingDirectory) continue;
        if (comparable(resolve(expandHome(session.workingDirectory))) !== comparable(resolve(before))) continue;
        session.workingDirectory = after;
        writeSessionRecord(this.stateDirectory, session);
      }
    }
  }

  /** Called once `kiln run` has printed its startup lines; later entries print through a terminal event. */
  startupFinished(): void { this.announceFolderMissing = true; }

  async prepare(): Promise<{ ok: true } | { ok: false; error: string }> {
    const authority = readPendingAuthority(this.stateDirectory, this.record);
    const active = this.record.continuation?.acceptances.find(row => row.id === this.record.continuation?.currentAcceptanceId && row.state === "active" && row.newExecutionId === this.record.executionId);
    if (authority?.state === "pending" && authority.executionId === this.record.executionId && active && readAcceptance(this.stateDirectory, active.id).pendingAuthorityId === authority.id) { authority.state = "adopted"; authority.acceptanceId = active.id; this.writeContinuationMetadata(() => writePendingAuthority(this.stateDirectory, authority)); }
    const pending = this.pendingContinuation();
    if (pending) await this.prepareContinuation(pending);
    if (this.record.completedAt) { if (this.currentlyComplete) await this.checkCompletedPlan(); return { ok: true }; }
    if (this.record.setupCompletedAt === undefined) {
      const setup = await this.finishSetup();
      if (!setup.ok) return setup;
    }
    // A catch-up Kiln stopped in the middle of is settled before the folder check (run restart "Catching a Branch Up").
    await this.settleCatchUps();
    // A missing folder is the answer: no plan read, progress or judgement (AC-GONE-01).
    if (!this.leavingFolderMissing && !await this.folderGuard()) return { ok: true };
    if (!this.requirementsOpen) await this.readPlan();
    return { ok: true };
  }

  /**
   * The second half: judges a session whose verdict was never recorded, re-checks a stop, and
   * says what Kiln does next (the ● line). An interrupted session is left untouched for a Kiln
   * that can resume it.
   */
  async decide(options: { review?: boolean; resume?: boolean } = {}): Promise<UnderwayDecision> {
    if (options.review) this.reviewingRestart = true;
    // The ● line says what these checks found, so their own terminal lines would repeat it.
    this.quiet = true;
    try {
      // The history read on load runs in the startup step, before Kiln serves the page or launches anything (Kiln Phase Model Tiers, "When an Activity Starts").
      await this.readStartsOnLoad();
      const decision = await this.decideQuietly();
      if (decision.kind === "folder_missing") { this.restartReview = undefined; this.reviewingRestart = false; this.changed(); return decision; }
      if (options.review) {
        this.restartReview = decision.kind === "start_stage" ? { activityKey: "req-next", action: "start" } : decision.kind === "start_phase" ? { activityKey: decision.phaseId, action: "start" }
          : decision.kind === "start_audit" ? { activityKey: decision.phaseKey, action: "start" }
          : decision.kind === "start_pull_request" ? { activityKey: PR_PHASE_KEY, action: "start" }
          : decision.kind === "resume" ? { activityKey: decision.phaseKey, action: "resume" }
          : decision.kind === "waiting" ? { activityKey: decision.phaseKey, action: "wait" } : undefined;
        // An allocated, unfinished preflight is what Resume runs first (Display Contract, "Preflight as the next activity").
        const preflight = unfinishedPreflight(this.record);
        if (this.restartReview && preflight && !this.record.phases[preflightKeyOf(preflight)]?.stop) this.restartReview = { activityKey: preflightKeyOf(preflight), action: this.latestSession(preflightKeyOf(preflight))?.runs.length ? "resume" : "start" };
        this.reviewingRestart = !!this.restartReview;
        this.changed();
      }
      // `kiln run <path> --resume` skips the review and resumes as its Resume would (AC-PREFLIGHT-01, `resume`).
      if (options.resume && ["start_phase", "start_audit", "start_pull_request", "resume", "waiting"].includes(decision.kind)) this.markResumePreflight(true);
      return decision;
    } finally {
      this.quiet = false;
    }
  }

  /** Exact retained completion/synchronization heads, never today's source as history. */
  private async completedDeliveryHeadUnchanged(entry: RepositoryEntry, revision: string, cwd: string): Promise<boolean> {
    const state = this.record.developmentDelivery;
    const result = state?.repositoryResults.find(row => row.repository === entry.name);
    if (!result || result.state === "unresolved") return false;
    if (result.remainingHeadSha) return result.remainingHeadSha === revision;
    if (result.state === "unchanged") return entry.baseCommit === revision;
    const checkpoints = result.deliveredCheckpointIds.map(id => state!.checkpoints.find(checkpoint => checkpoint.id === id));
    if (!checkpoints.length || checkpoints.some(checkpoint => !checkpoint?.merge)) return false;
    const synchronized = checkpoints.flatMap(checkpoint => checkpoint!.operations.filter(operation => operation.kind === "synchronize" && operation.state === "observed" && operation.synchronized));
    const latest = Math.max(...synchronized.map(operation => Date.parse(operation.preparedAt)));
    const latestHeads = synchronized.filter(operation => Date.parse(operation.preparedAt) === latest).map(operation => operation.synchronized!.featureHead);
    if (!latestHeads.length || latestHeads.some(head => head !== revision)) return false;
    for (const checkpoint of checkpoints) if ((await runGit(this.git, cwd, ["merge-base", "--is-ancestor", checkpoint!.headSha, revision])).exitCode !== 0) return false;
    return true;
  }

  /** Historical absence can skip old delivery checks only without hiding available work. */
  private async obsoleteCompletedDeliveryArtifacts(): Promise<boolean> {
    let missing = false;
    for (const entry of this.setUpRepositories) {
      const main = expandHome(entry.mainCheckoutPath); const cwd = expandHome(entry.worktreePath);
      // A review pull request GitHub shows merged is delivered whatever its worktree holds: nothing is read from the worktree, which
      // may be gone or part-way through a merge, and its files are not audited again (Kiln After Delivery, "Under early merges").
      if (finishedReviewMerged(this.record, entry.name)) { missing = true; continue; }
      const published = await runGit(this.git, main, ["ls-remote", "origin", `refs/heads/${this.record.settings.featureBranch}`]);
      if (published.exitCode !== 0) return false;
      let publishedHead: string | undefined;
      if (!published.stdout.trim()) missing = true;
      else {
        const [revision, ref, ...extra] = published.stdout.trim().split(/\s+/);
        if (extra.length || ref !== `refs/heads/${this.record.settings.featureBranch}` || !/^[a-f0-9]{40,64}$/.test(revision!)) return false;
        publishedHead = revision;
      }
      try { if (!lstatSync(cwd).isDirectory()) return false; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
        missing = true;
        if (publishedHead && !await this.completedDeliveryHeadUnchanged(entry, publishedHead, main)) return false;
        continue;
      }
      const [top, branch, status, head] = await Promise.all([
        runGit(this.git, cwd, ["rev-parse", "--show-toplevel"]),
        runGit(this.git, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
        runGit(this.git, cwd, ["status", "--porcelain", "--untracked-files=all"]), runGit(this.git, cwd, ["rev-parse", "HEAD"]),
      ]);
      if ([top, branch, status, head].some(read => read.exitCode !== 0) || branch.stdout.trim() !== this.record.settings.featureBranch || comparable(top.stdout.trim()) !== comparable(realPathOfNearestAncestor(cwd)) || status.stdout.trim()) return false;
      const revision = head.stdout.trim();
      if (publishedHead && publishedHead !== revision || !await this.completedDeliveryHeadUnchanged(entry, revision, cwd)) return false;
    }
    return missing;
  }

  /**
   * Adopts a live Claude phase, audit or takeover session an earlier Kiln left as `current` (recovered live), watched
   * until it ends and never interrupted; its end is recorded when it comes. Runs at every startup, including one that
   * finds a folder missing, so Start stays busy while that process runs (AC-SAFE-01). Returns the adopted session's activity.
   */
  async adoptLeftOverLive(): Promise<string | undefined> {
    const adopt = async (phaseKey: string, session: SessionRecord) => {
      this.current = { phaseKey, session, processRunning: true, commits: [] };
      this.recoveredLive = true;
      this.recoveredTimer ??= setInterval(() => { void this.observeRecoveredLive(); }, 1000);
      this.recoveredTimer.unref();
      // The panel names the phase that session is on (AC-SAFE-02).
      if (this.folderMissing) { await this.refreshFolderPanel(); this.changed(); }
    };
    if (this.record.liveControl) {
      const target = this.record.liveControl.takeover.target;
      const session = this.sessionRecord(target.activityKey, target.sessionId);
      const run = session?.runs.at(-1);
      if (!session || !run || run.endedAt || (run.control?.attemptId ?? this.legacyAttempt(session, session.runs.length - 1)) !== target.attemptId) return undefined;
      try { await requireExited(run); return undefined; }
      catch { await adopt(target.activityKey, session); return target.activityKey; }
    }
    const previous = this.latestSessionOverall();
    const previousRun = previous?.session.runs.at(-1);
    if (!previous || !previousRun || previousRun.endedAt || previous.session.agentId !== "claude_code" || previous.session.kind === "pull_request") return undefined;
    try { await requireExited(previousRun); return undefined; } catch { /* Live or ambiguous input ownership must wait safely. */ }
    await adopt(previous.phaseKey, previous.session);
    await this.observeRecoveredLive();
    return previous.phaseKey;
  }

  private async decideQuietly(): Promise<UnderwayDecision> {
    if (!this.current) this.observeSavedHookContract(this.latestSessionOverall()?.session);
    // A preparation whose phase was marked complete holds nothing (waivers "Mark Complete").
    if (this.record.pause.activeSince && this.record.preparation?.verifiedCheckpoint && this.record.preparation.stage !== "implementation" && !this.record.phases[this.record.preparation.phaseId]?.doneAt && this.latestSession(this.record.preparation.phaseId)?.runs.at(-1)?.endedAt) return { kind: "paused", beforePhaseKey: this.record.preparation.phaseId };
    if (this.record.liveControl) {
      await this.adoptLeftOverLive();
      if (!await this.folderGuard({ mayLeave: false })) return { kind: "folder_missing" };
      await this.reconcileTakeover();
      return { kind: "needs_you", phaseKey: this.record.liveControl.takeover.target.activityKey, again: true };
    }
    const adopted = await this.adoptLeftOverLive();
    if (adopted !== undefined) return { kind: "needs_you", phaseKey: adopted, again: true };
    if (!await this.folderGuard({ mayLeave: false })) return { kind: "folder_missing" };
    if (this.commands.blocked) return { kind: "needs_you", phaseKey: this.stoppedPhaseKey() ?? this.nextKeyFromRecordedPlan(), again: true };
    const { record } = this;
    // An open merge activity is handled before anything else `kiln run` does for a finished run (Kiln After Delivery, "Ctrl+C and restart").
    if (openAfterDeliveryKey(record)) return this.decideAfterDelivery(openAfterDeliveryKey(record)!);
    if (deliveryEnabled(record) && record.completedAt && !await this.obsoleteCompletedDeliveryArtifacts()) {
      await this.readPlan();
      const earlier = await this.unresolvedDeliveryLeaf();
      if (earlier) { record.completionAudits!.policy = "required"; this.save(); return { kind: "needs_you", phaseKey: earlier, again: true }; }
      const result = await this.pullRequestCheck(PR_PHASE_KEY);
      if (result.passed) return { kind: "complete" };
      record.completionAudits!.policy = "required";
      this.recordStop(PR_PHASE_KEY, "pull_request_check", result.checks);
      return { kind: "needs_you", phaseKey: PR_PHASE_KEY, again: true };
    }
    if (this.currentlyComplete) return { kind: "complete" };
    if (record.billing?.hold) return { kind: "needs_you", phaseKey: record.billing.hold.phaseKey, again: true };
    if (record.completionAudits?.policy === "legacy_complete") { record.completionAudits.policy = "required"; this.save(); }

    let doneFirst: DoneFirst | undefined;
    const waiting = this.waitingPhaseKey();
    if (waiting !== undefined) {
      // A wait reconciles like a stop: its check, then the wait again (AC-AUTO-03).
      const verdict = await this.recheckWait(waiting, "restart");
      if (verdict === "complete") return { kind: "complete" };
      if (verdict === "stopped" || verdict === "stopping") return { kind: "needs_you", phaseKey: waiting, again: false };
      if (verdict === "failed") return { kind: "waiting", phaseKey: waiting, limit: this.waitLimit(waiting) };
      doneFirst = { phaseId: this.judgedId(waiting), byPerson: true };
    }
    const stopped = doneFirst === undefined ? this.stoppedPhaseKey() : undefined;
    const latest = stopped === undefined && doneFirst === undefined ? this.latestSessionOverall() : undefined;
    if (stopped !== undefined) {
      const kind = record.phases[stopped]!.stop!.kind;
      if (activityKeyKind(stopped) === "requirements" && kind === "done_check") return { kind: "needs_you", phaseKey: stopped, again: true };
      let verdict: Awaited<ReturnType<Engine["recheckStop"]>>;
      try { verdict = await this.recheckStop(stopped); }
      catch (error) {
        if (!(error instanceof CompletionCheckUnavailable)) throw error;
        return { kind: "needs_you", phaseKey: stopped, again: true };
      }
      if (verdict === "still_stopped") return kind === "plan" ? { kind: "plan_stop", phaseKey: stopped } : { kind: "needs_you", phaseKey: stopped, again: true };
      if (verdict === "complete") return { kind: "complete" };
      if (verdict === "done") doneFirst = { phaseId: this.judgedId(stopped), byPerson: true };
    } else if (latest && !this.isPhaseDone(latest.phaseKey)) {
      const run = latest.session.runs.at(-1);
      // A session with no run never started; the loop launches it as planned, with the same session ID.
      if (run !== undefined) {
        if (run.endedAt === undefined || run.interruptedBy !== undefined) {
          this.interruptedKey = latest.phaseKey;
          // Never two processes on one session: one a killed Kiln left running is stopped first.
          await this.stopLiveProcess(latest.session);
          // Interrupted: the check first; only a failing check resumes it (AC-KEEP-04).
          const verdict = latest.session.agentId === "codex" && run.limitRefusal?.codex && !run.interruptedBy
            ? await this.judgeEndedSession(latest.phaseKey, false)
            : await this.checkInterrupted(latest.phaseKey);
          if (verdict.kind === "complete") return { kind: "complete" };
          if (verdict.kind === "stopping") return { kind: "needs_you", phaseKey: latest.phaseKey, again: false };
          if (verdict.kind === "resume") {
            this.pendingResume = latest.phaseKey;
            return { kind: "resume", phaseKey: latest.phaseKey, sessionId: latest.session.sessionId };
          }
          this.interruptedKey = undefined;
          if (verdict.kind === "waiting") return { kind: "waiting", phaseKey: latest.phaseKey, limit: this.waitLimit(latest.phaseKey) };
          // Retain independent runtime and recovery failures.
          if (verdict.kind === "stopped") return { kind: "needs_you", phaseKey: latest.phaseKey, again: false };
          if (verdict.kind === "done") doneFirst = { phaseId: verdict.judgedId, byPerson: false };
        } else {
          // It ended on its own, and Kiln stopped before recording the verdict: judged as after any session.
          this.current = { phaseKey: latest.phaseKey, session: latest.session, commits: [], processRunning: false };
          const verdict = await this.judgeEndedSession(latest.phaseKey, false);
          if (verdict.kind === "complete") return { kind: "complete" };
          if (verdict.kind === "stopping") return { kind: "needs_you", phaseKey: latest.phaseKey, again: false };
          if (verdict.kind === "stopped") return { kind: "needs_you", phaseKey: latest.phaseKey, again: false };
          if (verdict.kind === "waiting") return { kind: "waiting", phaseKey: latest.phaseKey, limit: this.waitLimit(latest.phaseKey) };
          if (verdict.kind === "done") doneFirst = { phaseId: verdict.judgedId, byPerson: false };
        }
      }
    }
    const withDone = <T extends object>(decision: T) => (doneFirst ? { ...decision, doneFirst } : decision);

    if (record.pause.activeSince !== undefined) return withDone({ kind: "paused" as const, beforePhaseKey: this.nextKeyFromRecordedPlan() });
    if (this.reviewStop) return { kind: "requirements_review", review: this.reviewStop };
    if (this.requirementsOpen) return { kind: "start_stage" };
    // What the engine loop does next, in its order.
    const read = await this.planOrWaivedOrder();
    if (!read.ok) return withDone(this.recordPlanStop(read.problem));
    const unresolved = await this.unresolvedDeliveryLeaf();
    if (unresolved) return withDone({ kind: "needs_you" as const, phaseKey: unresolved, again: true });
    const next = await this.nextActivity(read.plan);
    if (next.kind === "stopped") return withDone({ kind: "needs_you" as const, phaseKey: next.key, again: true });
    if (next.kind === "audit") {
      if (this.pauseDue) { this.activatePause(); return withDone({ kind: "paused" as const, beforePhaseKey: next.key }); }
      return withDone({ kind: "start_audit" as const, phaseKey: next.key, name: recordedAuditName(this.record, next.activity).sentence });
    }
    const leaf = next.leaf;
    if (!leaf && await this.holdStops()) return withDone({ kind: "needs_you" as const, phaseKey: PR_PHASE_KEY, again: true });
    if (!leaf) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (deliveryEnabled(record) && check.ghError) { this.recordStop(PR_PHASE_KEY, "pull_request_check", check.checks); return withDone({ kind: "needs_you" as const, phaseKey: PR_PHASE_KEY, again: true }); }
      if (check.passed && !this.stopping) {
        this.complete(check.pullRequests ?? [], false, check.mergedBranches, check.checks);
        return withDone({ kind: "complete" as const });
      }
    }
    if (this.pauseDue) {
      // Start after the pause goes round again, so a pull request opened meanwhile completes the feature.
      this.activatePause();
      return withDone({ kind: "paused" as const, beforePhaseKey: leaf?.id ?? PR_PHASE_KEY });
    }
    if (!leaf) this.pullRequestPrecheckDone = true;
    return leaf ? withDone({ kind: "start_phase" as const, phaseId: leaf.id }) : withDone({ kind: "start_pull_request" as const });
  }

  /** Runs the engine loop until it waits for a command. */
  continue(): Promise<void> {
    this.kick();
    return this.settled();
  }

  // ---- The engine loop -------------------------------------------------------------------

  private kick(): void {
    if (this.driving) return;
    if (this.commands?.busy && !(this.controlDispatch && (this.requestedResume || this.requestedLaunch))) { this.controlKickPending = true; return; }
    // A write refused after a durable control write failed mid-drive ends it as a blocked controller does; restart reconciles.
    this.driving = this.drive().catch((error: unknown) => { if (!refusedWhileFrozen(error)) throw error; }).finally(() => {
      this.driving = undefined;
      this.changed();
    });
  }

  private async drive(): Promise<void> {
    const { record } = this;
    for (;;) {
      const continuation = this.pendingContinuation();
      if (continuation && !this.commands.blocked && !this.stopping) { await this.prepareContinuation(continuation); if (this.record.executionId === continuation.completedExecutionId) return; }
      if (this.reviewingRestart || this.recoveredLive || this.record.liveControl && !this.requestedResume && !this.requestedLaunch) return;
      if (this.commands.blocked || this.stopping || this.exiting || !this.isUnderway || this.currentlyComplete || this.record.billing?.hold && !this.requestedResume && !this.requestedLaunch) return;
      if (this.folderMissing) return;
      if (!this.requirementsOpen && this.requestedResume !== undefined && this.requestedResume.cause === "limit_resume" && this.record.preflight?.due) {
        // A wait that held when the mark was set: the preflight comes before the waiting session is resumed.
        if (await this.drivePreflight() !== "go_on") { this.requestedResume = undefined; this.checking = false; this.changed(); return; }
      }
      if (this.requestedResume !== undefined) {
        // The one dispatch path: every launch and resume checks the folders first (AC-GONE-01).
        if (!await this.folderGuard({ mayLeave: false })) return;
        const request = this.requestedResume;
        this.requestedResume = undefined;
        const runCount = this.phaseRunCount(request.phaseKey);
        await this.resumeSession(request.phaseKey, request);
        if (this.phaseRunCount(request.phaseKey) === runCount) { this.current = undefined; return; }
        if ((await this.settleSession(request.phaseKey)).kind !== "done") return;
        continue;
      }
      if (this.requestedLaunch !== undefined) {
        const request = this.requestedLaunch;
        this.requestedLaunch = undefined;
        if (!await this.folderGuard({ mayLeave: false })) { this.checking = false; this.changed(); return; }
        const runCount = this.phaseRunCount(request.phaseKey);
        // Start again, a carry-on and Check Preflight again on an activity that hasn't started run the
        // launch checks a new session's launch runs, so a choice that can't be used stops it on the
        // `selection` stop, naming the choice (Kiln Phase Model Tiers AC-PICK-06).
        if (this.choiceActivity(request.phaseKey) && !this.startedSessionOf(request.phaseKey)) {
          this.current = { phaseKey: request.phaseKey, commits: [], processRunning: false };
          if (!await this.launchReadiness(request.phaseKey)) { this.current = undefined; this.checking = false; this.returningTakeover = false; this.changed(); return; }
        }
        await this.launchAtStop(request);
        // A launch that ended before its session was launched leaves no decision behind for the next one.
        this.decisions.delete(request.phaseKey);
        if (this.phaseRunCount(request.phaseKey) === runCount) {
          this.current = undefined; this.checking = false; this.changed();
          // A fresh preflight whose skill no longer resolves finished as no report, and the run goes on.
          if (isPreflightKey(request.phaseKey) && this.record.phases[request.phaseKey]?.doneAt) continue;
          return;
        }
        if ((await this.settleSession(request.phaseKey)).kind !== "done") return;
        continue;
      }
      if (this.stoppedPhaseKey() !== undefined) return;
      // No other phase starts during a wait; its readings, not the loop, end it.
      if (this.waitingPhaseKey() !== undefined) {
        this.watchWait();
        return;
      }
      // An open merge activity is the loop's next activity ahead of anything else; the plan, the
      // audits, the preflight and the completion step never run for it (Kiln After Delivery, "While open").
      const afterDelivery = openAfterDeliveryKey(record);
      if (afterDelivery !== undefined) {
        if (await this.driveAfterDelivery(afterDelivery) === "closed") continue;
        return;
      }
      // Checked after a wait's watch starts, so the watch begins before this loop first waits on Git.
      if (!await this.folderGuard({ mayLeave: false })) return;
      // The preflight comes before anything else the run starts or resumes (AC-PREFLIGHT-01).
      if (!this.requirementsOpen && await this.drivePreflight() !== "go_on") return;
      if (this.stoppedPhaseKey() !== undefined) return;
      const after = await this.resumeAfterPreflight();
      if (after === "stopped") return;
      if (after === "done") continue;
      if (this.pendingResume !== undefined) {
        const key = this.pendingResume;
        this.pendingResume = undefined;
        await this.resumeSession(key);
        if ((await this.settleSession(key)).kind !== "done") return;
        continue;
      }
      if (record.pause.activeSince !== undefined) return;

      if (this.requirementsOpen) { if (await this.driveRequirements()) continue; return; }
      const preparation = record.preparation;
      if (preparation && !record.phases[preparation.phaseId]?.doneAt && this.latestSession(preparation.phaseId)?.runs.length && (preparation.stage !== "implementation" || !this.latestSession(preparation.phaseId)?.runs[preparation.implementationRun!])) {
        const verdict = await this.advancePreparation();
        if (verdict.kind !== "done") return;
        continue;
      }
      const read = await this.planOrWaivedOrder();
      if (!read.ok) {
        this.recordPlanStop(read.problem);
        return;
      }
      if (await this.unresolvedDeliveryLeaf()) return;
      const next = await this.nextActivity(read.plan);
      if (next.kind === "stopped") return;
      const audit = next.kind === "audit" ? next.activity : undefined;
      const leaf = next.kind === "phase" ? next.leaf : undefined;
      const nextKey = audit ? auditKey(audit) : leaf?.id ?? PR_PHASE_KEY;
      this.current = { phaseKey: nextKey, commits: [], processRunning: false };
      this.changed();
      // A repository the next phase names that the workspace lacks is added before it starts (multi-repo AC-ADD-04).
      if (leaf) {
        const added = await this.addNamedRepositories(leaf, read.plan);
        if (this.stopping) return;
        const skip = !added.ok && knownProblemWaiver(this.record.waivers, added.facts.join(" "));
        if (skip) {
          // A phase whose start fails on a waived problem is skipped and counts as closed (AC-WAIVE-04).
          this.current = undefined;
          const facts = this.phaseFacts(leaf.id);
          facts.skippedByWaiver = skip.waiverId; facts.waiverWarning = { kind: "plan", waiverId: skip.waiverId };
          this.save();
          continue;
        }
        if (read.warning) { this.phaseFacts(leaf.id).waiverWarning = read.warning; this.save(); }
        if (!added.ok) {
          this.current = undefined;
          this.recordStop(leaf.id, "plan", [{ name: CHECK_NAMES.plan, passed: false, facts: added.facts }], undefined, undefined, undefined, added.locate);
          return;
        }
      }
      // Every arrival at final delivery checks that nothing holds the run, before anything that can complete it (AC-ITEM-01).
      if (!leaf && !audit && await this.holdStops()) { this.current = undefined; this.pullRequestPrecheckDone = false; return; }
      if (!leaf && !audit && !this.pullRequestPrecheckDone) {
        // A gh error here starts the pull-request session without showing it; that session's own check decides.
        const check = await this.pullRequestCheck(PR_PHASE_KEY);
        if (deliveryEnabled(record) && check.ghError) { this.current = undefined; this.recordStop(PR_PHASE_KEY, "pull_request_check", check.checks); return; }
        if (this.stopping) return;
        if (check.passed) {
          this.complete(check.pullRequests ?? [], false, check.mergedBranches, check.checks);
          return;
        }
      }
      this.pullRequestPrecheckDone = false;
      if (this.pauseDue) {
        this.activatePause();
        return;
      }
      if (!await this.launchReadiness(nextKey)) return;
      if (audit) {
        if ((await this.runAuditSession(audit)) !== "done") return;
        continue;
      }
      if (!leaf) {
        const verdict = await this.runPullRequestSession();
        if (verdict.kind === "done") continue;
        return;
      }
      const verdict = await this.runPhaseSession(leaf.id);
      if (verdict !== "done") return;
    }
  }

  /**
   * The launch checks every launch shares, just before a session starts (AC-WATCH-09): the account
   * read, agent selection and readiness, and Codex launch settings. False when one stopped the
   * activity on its key, or Kiln is stopping.
   */
  private async launchReadiness(nextKey: string, options: { endsWait?: boolean } = {}): Promise<boolean> {
    const ready = await this.launchReadinessNow(nextKey, options);
    if (!ready) { this.decisions.delete(nextKey); this.changed(); }
    return ready;
  }

  private async launchReadinessNow(nextKey: string, options: { endsWait?: boolean }): Promise<boolean> {
    // Every launch of an activity that hasn't started runs the launch decision first (Kiln Phase Model Tiers AC-FALLBACK-02).
    this.decisions.delete(nextKey);
    if (!await this.ensureDecision(nextKey, !!options.endsWait)) return false;
    const decided = this.decisions.get(nextKey);
    // Each launch checks the agent of the activity about to launch (Kiln Phase Model Tiers AC-AGENTS-04).
    const agentId = this.agentOf(nextKey);
    const reader = this.readers[agentId];
    // Just before each phase starts, so the panel shows the account the next session will use (AC-WATCH-09); the decision may already have read it.
    if (!decided?.read) {
      if (agentId === "codex") await reader.refresh([this.sessionFolder, ...this.sessionRepositories.map((entry) => expandHome(entry.worktreePath))]);
      else { void this.claude?.refreshAccount(); await reader.refreshClaudeModels(); }
    }
    if (this.stopping) return false;
    const selectionError = this.selectionIssue(nextKey, agentId === "claude_code");
    if (selectionError) {
      this.current = undefined;
      this.recordStop(nextKey, "selection", [{ name: "Agent selection and readiness", passed: false, facts: [this.launchStopFact(nextKey, selectionError)] }]);
      return false;
    }
    if (agentId === "codex") {
      if (!openPlanPush(this.record)) mkdirSync(this.workspaceFolder, { recursive: true });
      try { await prepareCodexLaunch({ ...this.codexLaunchOptions(this.sessionFolder), choice: this.launchChoice(nextKey) }); }
      catch (error) {
        if (this.stopping) return false;
        this.current = undefined;
        this.recordStop(nextKey, "selection", [{ name: "Agent selection and readiness", passed: false, facts: [this.launchStopFact(nextKey, (error as Error).message)] }]);
        return false;
      }
    }
    return true;
  }

  /**
   * A launch check that failed after the decision, as its stop names it (AC-PICK-06, "found at
   * launch"): the check's message, then the choice the decision named, where it came from (the
   * fallback included) and where to change it. Read before the stop drops the decision.
   *
   *   this.launchStopFact("2", "Codex is not signed in.")
   *   // "Codex is not signed in. This launch was on Codex · GPT Sol · xhigh. Chosen from: The fallback, from Model defaults' Fallback column. Change it in Model defaults."
   *
   * A launch the agent refused once its process ran passes that session, whose saved decision names the choice.
   */
  private launchStopFact(key: string, message: string, launched?: SessionRecord): string {
    if (!this.choiceActivity(key)) return message;
    const named = (choice: { agentId?: AgentId | undefined; modelName?: string | undefined; modelDisplayName?: string | undefined; effort?: string | undefined }) => [AGENT_NAMES[choice.agentId ?? "claude_code"], choice.modelName ?? choice.modelDisplayName, choice.effort].filter(Boolean).join(" · ");
    // A started activity names what it started on, and no place to change it ("A choice that can't be used").
    const started = this.startedSessionOf(key);
    if (started) return `${message} It started on ${named(started)}, which it finishes on.`;
    if (launched?.launch) return `${message} This launch was on ${named({ agentId: launched.agentId, modelDisplayName: launched.modelDisplayName, effort: launched.effort })}. Chosen from: ${launchSource(key, launched.launch)}`;
    const decided = this.decisions.get(key);
    if (decided) return `${message} This launch was on ${named(decided.choice)}. Chosen from: ${launchSource(key, decided.launch)}`;
    // At Check again no launch has decided yet: its next launch starts from its current choice.
    const choice = this.notStartedChoice(key);
    if (!choice.modelName || choice.problem) return message;
    return `${message} Its next launch runs on ${named(choice)}. Chosen from: ${launchSource(key, { from: choice.from })}`;
  }



  /**
   * The audit or preflight skill for the agent the decision named (technical design, "Skills"):
   * the fallback's, resolved by its launch checks, replaces one resolved for the other agent; a
   * launch back on the first choice after a launch on the other agent resolves it again, today's
   * outcome applying when it doesn't resolve. False when that stopped the activity.
   */
  private async skillForDecision(key: string, decided: LaunchDecision): Promise<boolean> {
    const audit = this.auditActivity(key);
    const preflight = audit ? undefined : this.preflightActivity(key);
    const activity = audit ?? preflight;
    if (!activity) return true;
    if (decided.skill) { activity.skill = decided.skill; this.save(); return true; }
    const sessions = (this.record.phases[key]?.sessionIds ?? []).map(id => this.sessionRecord(key, id));
    if (!activity.skill || !sessions.some(session => session && (session.agentId ?? "claude_code") !== decided.choice.agentId)) return true;
    if (preflight) { delete preflight.skill; this.save(); return true; }
    try { audit!.skill = await resolveAuditSkill({ kind: audit!.kind, agent: decided.choice.agentId, claude: this.options.tools.claude, ...(this.options.tools.codex ? { codex: this.options.tools.codex } : {}), cwd: this.sessionFolder, env: this.options.env, signal: this.abort.signal }); this.save(); return true; }
    catch (error) {
      if (this.stopping) return false;
      this.current = undefined;
      // The decision names the choice the skill didn't resolve on (AC-PICK-06); read before the stop drops it.
      this.recordStop(key, "selection", [{ name: READINESS_CHECK, passed: false, facts: [this.launchStopFact(key, (error as Error).message)] }]);
      return false;
    }
  }

  /**
   * The items for a person at a Needs you stop (AC-ITEM-02): on an audit, each entry of its latest
   * report, with the kind and what waits on it it gives or keeps; at the hold stop, each holding
   * item. Undefined elsewhere. Each says what it does, and an item a waiver covers carries its tag.
   */
  stopItems(store?: Pick<AuditStore, "read">): PersonItemView[] | undefined {
    const key = this.stoppedPhaseKey();
    if (key === undefined) return undefined;
    const view = (item: Omit<PersonItemView, "words" | "effect">): PersonItemView => ({ ...item, words: kindWords(item.kind), effect: itemEffect(item.kind) });
    if (key === PR_PHASE_KEY && this.record.phases[key]?.stop?.checks.some(check => check.name === HOLD_CHECK)) {
      return personItems(this.stateDirectory, this.record, Infinity, store).outstanding.filter(item => itemEffect(item.kind) === "holds").map(item => {
        const waiver = itemWaiver(item, this.record.waivers);
        return view({ id: item.id, kind: item.kind, problem: item.problem, action: item.action, ...optionalField("waitsOn", item.waitsOn), ...optionalField("criterion", item.criterion), ...(waiver ? { waiver } : {}) });
      });
    }
    const activity = this.auditActivity(key);
    const latest = activity?.attempts.at(-1);
    if (!activity || !latest || hasEffectiveResult(activity)) return undefined;
    const auditStore = store ?? new AuditStore(this.stateDirectory);
    const attempt = auditStore.read<AuditResult>(latest);
    if (attempt.refusal || !attempt.reportBytes) return undefined;
    const report = JSON.parse(attempt.reportBytes) as AuditReport;
    if (report.schemaVersion !== 2 || !report.needsYou.length) return undefined;
    const known = new Map(personItems(this.stateDirectory, this.record, activity.sequence, auditStore).outstanding.map(item => [item.id, item]));
    return report.needsYou.map(entry => {
      const kept = entry.id ? known.get(entry.id) : undefined;
      const waiver = kept ? itemWaiver(kept, this.record.waivers) : undefined;
      return view({ ...(entry.id ? { id: entry.id } : {}), problem: entry.problem, action: entry.action, ...keptFields(entry, kept), ...(waiver ? { waiver } : {}) });
    });
  }

  /** **For you** on a finished run (AC-ITEM-03). */
  deliveredForYou(store?: Pick<AuditStore, "read">): ForYou | undefined {
    return this.record.completedAt ? forYou(this.stateDirectory, this.record, store) : undefined;
  }

  auditActivity(key: string): AuditActivity | undefined { return this.record.completionAudits?.activities.find(a => auditKey(a) === key); }
  /** An audit activity's name, title, line and sentence (Kiln After Delivery AC-AUDIT-01), or undefined for any other key. */
  auditName(key: string): AuditName | undefined { const audit = this.auditActivity(key); return audit ? recordedAuditName(this.record, audit) : undefined; }

  // ---- Build preflight (build preflight technical design) ---------------------------------

  preflightActivity(key: string): PreflightActivity | undefined { return preflightActivity(this.record, key); }

  finalStartProblems: string[] = [];
  finalStartReport: StartCheckReport | undefined;

  private async readFinalStartChecks() {
    const dir = this.record.prdDirectory!;
    const location = await resolvePrdPath(join(this.worktreePath, dir), this.worktreePath, this.git.git, this.git.env);
    if ("problem" in location) { this.finalStartReport = undefined; this.finalStartProblems = [location.problem]; return; }
    const report = await runStartChecks(location.location, this.options.tools, this.git.env);
    this.finalStartReport = report;
    this.finalStartProblems = [...report.missingDocuments.map(m => m.name), ...report.problems];
    return report;
  }

  get requirementsBuildPlan(): PlanRead | undefined {
    if (this.reviewStop !== "final" || !this.record.prdDirectory) return undefined;
    return readPlanAt(this.worktreePath, this.record.prdDirectory);
  }

  get needsRefinementConfirmation(): boolean {
    const state = this.record.requirements;
    if (!state?.standing || !("milestones" in state.standing)) return false;
    return state.standing.milestones.some(m => (m.name === "prd_refined" || m.name === "design_ready") && !state.reachedByKiln.includes(m.name));
  }

  async startRequirementsBuild(confirmed: boolean): Promise<CommandResult> {
    if (this.reviewStop !== "final") return refuse("Start the build is available only at the final review.");
    const dir = this.record.prdDirectory;
    const plan = this.requirementsBuildPlan;
    if (!dir || !plan?.ok) return refuse(plan && !plan.ok ? plan.problem : "No phase documents. Kiln builds from phase documents.");
    if (this.needsRefinementConfirmation && !confirmed) return { ok: false, status: 400, reason: "Confirm the documents have been through requirements refinement first." };
    const report = await this.readFinalStartChecks();
    if (!report?.plan || !startChecksPassed(report)) { this.changed(); return refuse(this.finalStartProblems.join("\n")); }
    const review = await reviewState(this.git, this.worktreePath, dir);
    if (!review.current) return refuse("The stakeholder review needs refreshing. Press Resume.");
    const committed = await this.requirementsCommitted();
    if (!committed.passed) return refuse(committed.facts.join("\n"));
    const at = this.now().toISOString();
    const baseline = await this.readPlan();
    if (!baseline.ok) return refuse(baseline.problem);
    this.record.requirements!.phase = "closed";
    this.record.refinementConfirmedAt = at;
    setPreflightDue(this.record, "start", at);
    this.save();
    this.kick();
    return { ok: true };
  }

  private async leaveRequirementsReview(resume: boolean): Promise<CommandResult> {
    const kind = this.reviewStop;
    if (!kind || !resume && kind !== "early") return refuse("Continue is available at the early review.");
    const state = this.record.requirements!;
    if (resume) {
      const committed = await this.requirementsCommitted();
      if (!committed.passed) return refuse(committed.facts.join("\n"));
      const dir = this.record.prdDirectory;
      if (!dir) return refuse("The PRD directory is missing.");
      const review = await reviewState(this.git, this.worktreePath, dir);
      if (kind === "final" && review.current) { await this.readFinalStartChecks(); this.changed(); return { ok: true, outcome: "advanced" }; }
      if (kind === "early" && !review.current) state.refreshAsked = true;
    }
    state.phase = "stages";
    this.save();
    this.kick();
    return { ok: true, outcome: "advanced" };
  }

  get requirementsOpen(): boolean { return !!this.record.requirements && this.record.requirements.phase !== "closed"; }
  get reviewStop(): "early" | "final" | undefined {
    const phase = this.record.requirements?.phase;
    return phase === "early_review" ? "early" : phase === "final_review" ? "final" : undefined;
  }

  private hasRequirementsDesign(): boolean {
    const dir = this.record.prdDirectory;
    return !!dir && ["technical-design.md", `${basename(dir)}-technical-design.md`].some(file => existsSync(join(this.worktreePath, dir, file)));
  }

  private async driveRequirements(): Promise<boolean> {
    const state = this.record.requirements!;
    if (this.reviewStop) return false;
    const last = state.stages.at(-1);
    const pending = last && !this.record.phases[`req-${last.activityId}`]?.doneAt ? last : undefined;
    const milestones = state.standing && "milestones" in state.standing ? state.standing.milestones : [];
    // Feedback waiting is applied before the next stage and before either stop (technical design, "The driver").
    const waiting = pending ? [] : state.feedback.filter(message => message.state === "waiting");
    const due = waiting.length ? undefined : reviewDue(milestones, state, this.hasRequirementsDesign());
    let task: RequirementsStage["task"] = waiting.length ? "feedback" : "stage";
    if (!pending && due) {
      const dir = this.record.prdDirectory;
      const review = dir && await reviewState(this.git, this.worktreePath, dir);
      if (!review || !review.current) task = "review";
      else {
        const at = this.now().toISOString();
        // A stop reached again after feedback keeps its one review row; the feedback session's refresh is listed on it (AC-TALK-04).
        if (last?.task !== "review" && !state.stages.some(stage => stage.key === `kiln:${due}`)) {
          const ready: RequirementsStage = { activityId: randomUUID(), key: `kiln:${due}`, task: "review", reaches: ["review_made"], ran: [], startedAt: at, pushedSha: review.commit };
          state.stages.push(ready);
          this.phaseFacts(`req-${ready.activityId}`).doneAt = at;
        }
        state.review = this.readyReview(due, review.file, review.commit, at);
        if (due === "early") state.earlyReviewHeld = true;
        const stopAgain = due === "early" && !!state.stopAgain;
        // With the wait off, or after a refresh asked at Resume, the early review is made and Kiln carries on (AC-EARLY-05).
        if (due === "early" && (state.refreshAsked || this.record.settings.waitAtEarlyReview === false) && !stopAgain) {
          delete state.refreshAsked;
          this.save();
        } else {
          delete state.refreshAsked;
          delete state.stopAgain;
          state.phase = due === "final" ? "final_review" : "early_review";
          this.record.pause = {};
          if (due === "final") await this.readFinalStartChecks();
          this.save();
          this.changed();
          await this.options.openStakeholderReview?.();
          return false;
        }
      }
    }
    if (this.pauseDue) { this.activatePause(); return false; }
    const expected = task === "stage" ? expectedStage(state) : undefined;
    const stage: RequirementsStage = pending ?? {
      activityId: randomUUID(), task, key: task === "review" ? `kiln:${due}` : task === "feedback" ? nextStageKey(state, "kiln:feedback") : expected ? nextStageKey(state, expected.skill) : "kiln:next",
      ...(expected ? { expected } : {}), reaches: expected?.reaches ?? [], ran: [], startedAt: this.now().toISOString(),
      ...(task === "feedback" ? { messageIds: waiting.map(message => message.id) } : {}),
    };
    const key = `req-${stage.activityId}`;
    if (!pending) {
      if (stage.reaches.includes("design_ready")) state.designSpan = true;
      state.stages.push(stage);
      this.phaseFacts(key);
      this.save();
    }
    this.current = { phaseKey: key, commits: [], processRunning: false };
    this.changed();
    if (!await this.launchReadiness(key)) return false;
    await this.recordStartCommits(key);
    await this.launchRequirementStage(stage);
    if (!this.latestSession(key)?.runs.length) { this.current = undefined; this.changed(); return false; }
    return (await this.settleSession(key)).kind === "done";
  }

  /**
   * The review as ready at a stop (technical design, "The Two Reviews"). Returning to the stop the
   * person sent feedback at, it keeps when it was first ready and shows what the feedback changed.
   */
  private readyReview(kind: "early" | "final", file: string, commit: string, at: string): NonNullable<RequirementsState["review"]> {
    const state = this.record.requirements!;
    const prior = state.review?.kind === kind ? state.review : undefined;
    // Feedback sent at this stop, or applied on the way to it since the latest stage, comes back with what it changed.
    const lastStage = state.stages.findLast(stage => stage.task === "stage" && stage.pushedSha);
    const since = prior?.feedbackSentAt ?? lastStage?.startedAt;
    if (!since) return { kind, file, commit, readySince: at };
    const applied = state.stages.filter(stage => stage.task === "feedback" && stage.pushedSha && stage.startedAt >= since);
    const items = applied.flatMap(stage => stage.report?.changes ?? []);
    const changed = applied.at(-1)?.pushedSha;
    if (!prior?.feedbackSentAt) return { kind, file, commit, readySince: at, ...(changed ? { whatChanged: { items, commit: changed } } : {}) };
    return { kind, file, commit, readySince: prior.readySince, refreshedAt: at, ...(changed ? { whatChanged: { items, commit: changed } } : {}) };
  }

  /**
   * Feedback (AC-TALK-01 to 04), from the feedback box, `kiln feedback`, Message Claude to a
   * requirements session and a reply at Resume that finds the work committed. It never pauses,
   * holds or stops anything. At a review it is the stop's Send feedback: the stop ends and a
   * feedback session applies it, then Kiln stops there again only when asked to, or always at the
   * final review (technical design, "The Two Reviews").
   *
   *   await engine.addFeedback("Store staff need to look up a balance too.")   // { ok: true, outcome: "feedback_sent" }
   */
  async addFeedback(text: unknown, stopAgain = false, operationId?: string): Promise<FeedbackAnswer> {
    const problem = feedbackProblem(text);
    if (problem) return { ok: false, status: typeof text === "string" && Buffer.byteLength(text, "utf8") > FEEDBACK_LIMIT_BYTES ? 413 : 400, code: "invalid_input", reason: problem };
    const unavailable = (reason: string): FeedbackAnswer => ({ ok: false, status: 409, code: "feedback_unavailable", reason });
    if (!this.record.requirements || this.record.startedAt === undefined) return unavailable("Feedback is taken once Start is pressed.");
    if (!this.requirementsOpen) return unavailable("The build has started. Feedback goes to the requirements before the build.");
    if (stopAgain && this.reviewStop !== "early") return unavailable("Stop here again is offered only at the early review.");
    const state = this.record.requirements;
    const at = this.now().toISOString();
    const message: FeedbackMessage = { id: `m-${state.feedback.length + 1}`, text: text as string, at, state: "waiting", ...(operationId ? { operationId } : {}) };
    state.feedback.push(message);
    if (this.reviewStop) {
      if (state.review) state.review.feedbackSentAt = at;
      if (stopAgain) state.stopAgain = true;
      state.phase = "stages";
      this.save();
      this.changed();
      this.kick();
      return { ok: true, outcome: "feedback_sent" };
    }
    this.save();
    await this.deliverFeedback(message);
    this.changed();
    this.kick();
    return { ok: true, outcome: message.state === "waiting" ? "feedback_sent" : "feedback_delivered" };
  }

  /**
   * Delivers a message to the running stage or feedback session through Message Claude's path,
   * after one line naming its id. A message too long for a live message, a review session, Codex,
   * a session without live input, or a delivery that settles as uncertain leaves it waiting, with
   * no hold, for a feedback session (technical design, "Feedback").
   */
  private async deliverFeedback(message: FeedbackMessage): Promise<void> {
    const session = this.current?.session;
    const run = session?.runs.at(-1);
    const control = this.control;
    if (message.text.length > LIVE_LIMIT_CHARACTERS || !this.feedbackGoesLive() || !session || !run?.live || !control?.sendMessage) return;
    const uuid = randomUUID();
    let writing: Promise<"written" | "uncertain"> | undefined;
    try {
      await withGate(run.live.gateDirectory, gate => {
        if (gate.sealed || gate.held || gate.messageContract || this.record.liveControl || !control.inputOpen?.()) return;
        const inputs = gate.inputs ??= {};
        if (Object.values(inputs).filter(input => !input.terminal).length >= 32) return;
        Object.assign(message, { state: "sent", sessionId: session.sessionId, uuid, sentAt: this.now().toISOString() });
        delete message.readAt;
        this.save();
        inputs[uuid] = { terminal: false };
        delete gate.turnEndedAt;
        writeDurableMetadata(join(run.live!.gateDirectory, "gate.json"), gate);
        writing = control.sendMessage!(`Kiln feedback ${message.id}:\n${message.text}`, uuid);
      });
    } catch { /* Delivery could not begin, or its outcome is unknown: the message waits for a feedback session. */ }
    const outcome = writing ? await writing.catch(() => "uncertain" as const) : undefined;
    if (outcome === "written" || message.state !== "sent") return;
    this.unsendFeedback(message);
    this.save();
  }

  /** Whether a message sent now would be delivered to the running session (technical design, "Feedback"). */
  feedbackGoesLive(): boolean {
    const key = this.current?.phaseKey;
    const stage = key && this.record.requirements?.stages.find(one => `req-${one.activityId}` === key);
    const run = this.current?.session?.runs.at(-1);
    return !!stage && stage.task !== "review" && this.current?.session?.agentId === "claude_code" && !!run && !run.endedAt && !!run.live?.literalInput
      && run.live.messageContract !== "unrecognised" && !!this.control?.sendMessage && !!this.control.inputOpen?.() && !this.record.liveControl && !!this.current?.processRunning;
  }

  private unsendFeedback(message: FeedbackMessage): void {
    message.state = "waiting";
    for (const field of ["sessionId", "uuid", "sentAt", "readAt"] as const) delete message[field];
  }

  /** The existing receipt makes a delivered message read, with the time (AC-TALK-02). */
  private observeFeedbackReceipt(sessionId: string, event: Record<string, unknown>, at: string): void {
    const uuids = consumedUuids(event);
    if (!uuids.length) return;
    let changed = false;
    for (const message of this.record.requirements?.feedback ?? []) {
      if (message.state !== "sent" || message.sessionId !== sessionId || !message.uuid || !uuids.includes(message.uuid)) continue;
      message.state = "read";
      message.readAt = at;
      changed = true;
    }
    if (changed) { this.save(); this.changed(); }
  }

  /**
   * Settles the feedback a requirements session read or was sent when it ends (technical design,
   * "Feedback"). `done`: the session is recorded finished, at `commit`. Any `worked_in` makes a
   * message applied; a feedback session's prompt messages, which it read, are applied when it is
   * recorded finished and otherwise stay read for its Needs you; every other message of the
   * session that wasn't worked in waits again for a feedback session.
   */
  private settleFeedback(key: string, stage: RequirementsStage, report: StageReport | undefined, done: false): void;
  private settleFeedback(key: string, stage: RequirementsStage, report: StageReport | undefined, done: true, commit: string, at: string): void;
  private settleFeedback(key: string, stage: RequirementsStage, report: StageReport | undefined, done: boolean, commit?: string, at?: string): void {
    const sessions = new Set(this.record.phases[key]?.sessionIds ?? []);
    const worked = new Set(stage.task === "review" ? [] : (report?.messages ?? []).filter(m => m.outcome === "worked_in").map(m => m.id));
    for (const message of this.record.requirements?.feedback ?? []) {
      if (message.state === "applied") continue;
      const ours = !!message.sessionId && sessions.has(message.sessionId);
      const given = ours && stage.task === "feedback" && !!message.readAt;
      if (done && (worked.has(message.id) || given)) {
        Object.assign(message, { state: "applied", appliedAt: at, appliedCommit: commit, appliedBy: stage.activityId });
        delete message.uuid;
      } else if (ours && !given && (done || !worked.has(message.id))) this.unsendFeedback(message);
    }
  }

  /** The messages a feedback session read and left without `worked_in` (technical design, "How a stage ends"). */
  private feedbackNotWorkedIn(key: string, stage: RequirementsStage, report: StageReport): FeedbackMessage[] {
    if (stage.task !== "feedback") return [];
    const sessions = new Set(this.record.phases[key]?.sessionIds ?? []);
    const worked = new Set((report.messages ?? []).filter(m => m.outcome === "worked_in").map(m => m.id));
    return (this.record.requirements?.feedback ?? []).filter(m => m.state !== "applied" && !!m.sessionId && sessions.has(m.sessionId) && !!m.readAt && !worked.has(m.id));
  }

  private async launchRequirementStage(stage: RequirementsStage, options: { started?: () => boolean; relaunchOf?: SessionRecord["relaunchOf"]; carryOn?: { note?: string } } = {}): Promise<void> {
    const key = `req-${stage.activityId}`;
    const found = await resolveSkill({ name: "using-the-enso-method", agent: this.agentOf(key), cwd: this.sessionFolder, claude: this.options.tools.claude, ...(this.options.tools.codex ? { codex: this.options.tools.codex } : {}), env: this.options.env, signal: this.abort.signal });
    if (found.kind !== "found") {
      this.current = undefined;
      this.recordStop(key, "selection", [{ name: "Installed Enso Method", passed: false, facts: [found.message] }]);
      return;
    }
    const origin = this.record.origin!;
    const state = this.record.requirements!;
    const work = this.record.prdDirectory ?? `${origin.title}\n${origin.files.join("\n")} at ${origin.commit}`;
    const given = (stage.messageIds ?? []).map(id => state.feedback.find(message => message.id === id)).filter((message): message is FeedbackMessage => !!message && message.state !== "applied");
    let prompt = requirementsPrompt(stage.task, { work, worktree: this.worktreePath, branch: this.record.settings.featureBranch, skillPath: found.skill.path,
      holds: state.earlyReviewHeld ? "requirements_finished" : "prd_refined without a technical design, and requirements_finished",
      messages: given.map(message => `Message ${message.id}:\n${message.text}`).join("\n\n") });
    if (options.carryOn) {
      const prior = this.recoverySession(key);
      const lastMessage = prior && lastRecordedRun(prior)?.result?.text;
      prompt = carryOnPrompt({ freshSession: prompt, ...options.carryOn, ...(lastMessage ? { lastMessage } : {}), work: [], multiRepository: this.setUpRepositories.length > 1 });
    }
    await this.launchSession(key, "requirements", prompt, options);
    // A feedback session's prompt messages are read once its session starts; one whose session fails to start stays waiting.
    const session = this.latestSession(key);
    if (stage.task === "feedback" && session?.runs.some(run => run.pid !== undefined)) {
      const at = this.now().toISOString();
      for (const message of given) if (!message.readAt || message.sessionId !== session.sessionId) Object.assign(message, { state: "read", sessionId: session.sessionId, readAt: at });
      this.save();
      this.changed();
    }
  }

  private async requirementsCommitted(): Promise<CheckResult> {
    const facts: string[] = [];
    for (const entry of this.setUpRepositories) {
      const cwd = expandHome(entry.worktreePath);
      const branch = await gitText(this.git, cwd, ["branch", "--show-current"]);
      if (branch !== this.record.settings.featureBranch) facts.push(`${cwd} must be on ${this.record.settings.featureBranch}.`);
      const changes = await gitText(this.git, cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
      if (changes) facts.push(...changes.split("\n").map(change => change.endsWith("-prd-refinement-state.md") ? `${change.slice(3)}: finish or stop the PRD refinement. This file is never committed.` : `${entry.name}: ${change}`));
    }
    return { name: CHECK_NAMES.committed, passed: !facts.length, facts };
  }

  private async judgeRequirements(key: string, byHand = false): Promise<Verdict> {
    const state = this.record.requirements!;
    const stage = state.stages.find(one => `req-${one.activityId}` === key)!;
    const run = this.latestSession(key)?.runs.at(-1);
    const report = readStageReport(run?.result?.text ?? "", stage.task);
    const safety = await this.preflightSafety(key);
    const stop = (checks: CheckResult[]): Verdict => { this.settleFeedback(key, stage, report, false); this.current = undefined; this.recordStop(key, "done_check", checks); return { kind: "stopped" }; };
    if (safety) return stop([safety]);
    const committed = await this.requirementsCommitted();
    if (report) stage.report = report;
    if (report?.next?.kind === "before_prd") return stop([{ name: report.next.title, passed: false, facts: [`Run ${report.next.skill} in your own session, then reset Kiln for this PRD.`] }]);
    // A feedback session gives every message it was given or read an outcome; one left out stops it, so no message goes to a second feedback session.
    const left = !byHand && report?.next ? this.feedbackNotWorkedIn(key, stage, report) : [];
    if (left.length) return stop([committed, { name: "Feedback worked in", passed: false, facts: left.map(message => `${message.id} was not worked in: ${message.text.length > 120 ? `${message.text.slice(0, 117)}...` : message.text}`) }]);
    const prior = this.record.prdDirectory;
    const found = await locateWrittenPrd(this.git, this.worktreePath, this.record.repositories[0]!.baseCommit!, prior, report?.prdDirectory);
    const stopAt = reviewDue(report?.milestones ?? [], state, this.hasRequirementsDesign());
    const acceptable = !!report?.finished && (stage.task !== "stage" || report.ran.length > 0 || !!stopAt);
    if (stage.task === "review") {
      const review = prior && await reviewState(this.git, this.worktreePath, prior);
      if (!review || !review.current) return stop([committed, { name: "Review current", passed: false, facts: [review ? `${review.file} needs refreshing${review.changed ? ` after ${review.changed}` : ""}.` : "A committed stakeholder review is missing."] }]);
    }
    if (!committed.passed || !byHand && (!!found.missing || !acceptable)) {
      if (found.missing) committed.facts.push(found.missing);
      else if (report?.finished && !report.ran.length && !stopAt) committed.facts.push("The session ran no stage, and the work stands at no stop Kiln makes.");
      else if (!acceptable && !committed.facts.length) committed.facts.push("The session did not report a finished stage.");
      return stop([{ ...committed, passed: false }]);
    }
    const branch = this.record.settings.featureBranch;
    for (const entry of this.setUpRepositories) {
      const pushed = await runGit(this.git, expandHome(entry.worktreePath), ["push", "origin", `refs/heads/${branch}:refs/heads/${branch}`]);
      if (pushed.exitCode !== 0) return stop([committed, { name: CHECK_NAMES.pushed, passed: false, facts: [gitError(pushed)] }]);
    }
    const at = this.now().toISOString();
    if (found.directory) this.record.prdDirectory = found.directory;
    if (stage.task !== "review") {
      if (acceptable && report?.next && !found.missing) {
        state.standing = { next: report.next, milestones: report.milestones!, at };
        for (const m of report.milestones!) {
          if (m.name === "design_ready") state.designSpan = false;
          if (m.by === "this_session" && !state.reachedByKiln.includes(m.name)) state.reachedByKiln.push(m.name);
        }
        if (!prior && found.directory && report.draft) state.draftNote = report.draft;
        delete this.record.settings.modelChoices.stages?.["kiln:next"];
      } else state.standing = { unknown: true, at };
    }
    stage.ran = report?.ran ?? [];
    const firstSkill = stage.ran[0]?.skill;
    if (stage.task === "stage" && firstSkill && stage.expected?.skill !== firstSkill) stage.key = nextStageKey(state, firstSkill);
    stage.pushedSha = await gitText(this.git, this.worktreePath, ["rev-parse", "HEAD"]);
    this.settleFeedback(key, stage, report?.next || stage.task === "review" ? report : undefined, true, stage.pushedSha, at);
    const facts = this.phaseFacts(key);
    facts.doneAt = at;
    delete facts.stop;
    delete facts.wait;
    this.current = undefined;
    this.save();
    this.changed();
    return { kind: "done", judgedId: key };
  }

  private resolvePreflightSkill(agent: AgentId = this.auditsAgent): Promise<SkillResolution> {
    return resolveSkill({ name: PREFLIGHT_SKILL, agent, claude: this.options.tools.claude, ...(this.options.tools.codex ? { codex: this.options.tools.codex } : {}), cwd: this.sessionFolder, env: this.options.env, signal: this.abort.signal });
  }

  /**
   * Resume, `kiln continue` at the restart review, `kiln run --resume` and a Folder missing Start
   * from the existing feature branch set the mark only while no preflight has settled and the run
   * would otherwise start or resume work (AC-PREFLIGHT-01, `resume`). `decided`: the decision
   * itself said it starts or resumes work, with no review showing.
   */
  private markResumePreflight(decided = false): void {
    if (!decided && !this.restartReview) return;
    // An open after-delivery activity never marks a preflight (Kiln After Delivery, "Ctrl+C and restart").
    if (openAfterDeliveryKey(this.record)) return;
    if (this.stoppedPhaseKey() !== undefined || this.record.pause.activeSince !== undefined || this.currentlyComplete) return;
    if (preflightSettled(this.record) || this.record.preflight?.due) return;
    setPreflightDue(this.record, "resume", this.now().toISOString());
    this.save();
  }

  /**
   * The mark, consumed before anything else the loop would launch or resume ("When the Preflight
   * Is Due", steps 1 to 4), then the unfinished preflight itself. `go_on`: the loop carries on
   * with its ordinary next-activity choice.
   */
  private async drivePreflight(): Promise<"go_on" | "stopped"> {
    const state = this.record.preflight;
    let activity = unfinishedPreflight(this.record);
    if (state?.due) {
      if (activity) { delete state.due; this.save(); }
      else {
        const trigger = state.due.trigger;
        const resolved = await this.resolvePreflightSkill();
        if (this.stopping) return "stopped";
        if (resolved.kind === "absent") { delete state.due; this.save(); return "go_on"; }
        activity = this.allocatePreflight(trigger, resolved.kind === "found" ? resolved.skill : undefined);
        if (resolved.kind === "unresolvable") {
          // A sign-in or readiness problem can make discovery fail: it stops on the preflight's key as a launch check, never as no report.
          if (!await this.launchReadiness(preflightKeyOf(activity))) return "stopped";
          // A launch the decision sent to the fallback, whose skill resolves there, goes on to run (Kiln Phase Model Tiers, "Skills").
          if (!activity.skill) {
            this.decisions.delete(preflightKeyOf(activity));
            this.current = undefined;
            this.finishPreflight(activity, { outcome: "no_report", reason: resolved.message });
            return "go_on";
          }
        }
      }
    }
    if (!activity) return "go_on";
    const key = preflightKeyOf(activity);
    if (this.record.pause.activeSince !== undefined || this.pendingResume === key) return "go_on";
    const run = this.latestSession(key)?.runs.at(-1);
    if (run && (run.endedAt === undefined || run.interruptedBy !== undefined)) { this.pendingResume ??= key; return "go_on"; }
    const verdict = run ? (await this.settleSession(key)).kind : await this.runPreflightSession(activity);
    return verdict === "done" ? "go_on" : "stopped";
  }

  /**
   * The interrupted session a finished preflight ran ahead of (its saved `before`), when nothing in
   * memory already holds it, as after a restart at the preflight stop: checked first, as any
   * interrupted session is, then resumed. `done`: its check passed and it was recorded done.
   */
  private async resumeAfterPreflight(): Promise<"none" | "resume" | "done" | "stopped"> {
    const preflight = latestPreflight(this.record);
    const before = preflight?.before;
    if (!before || !this.record.phases[preflightKeyOf(preflight)]?.doneAt || this.pendingResume !== undefined || this.requestedResume !== undefined || this.isPhaseDone(before) || this.record.phases[before]?.stop || this.record.phases[before]?.wait) return "none";
    const run = this.latestSession(before)?.runs.at(-1);
    if (!run || run.endedAt !== undefined && run.interruptedBy === undefined) return "none";
    const verdict = await this.checkInterrupted(before);
    if (verdict.kind === "resume") { this.pendingResume = before; return "resume"; }
    return verdict.kind === "done" ? "done" : "stopped";
  }

  /** Allocates the preflight and clears the mark in one write; `before` names an interrupted or waiting session it runs ahead of. */
  private allocatePreflight(trigger: PreflightTrigger, skill: PreflightActivity["skill"]): PreflightActivity {
    const state = this.record.preflight ??= { activities: [] };
    const id = randomUUID(); const at = this.now().toISOString(); const key = preflightKeyOf({ activityId: id });
    const before = this.pendingResume ?? this.requestedResume?.phaseKey ?? this.waitingPhaseKey();
    const observed = observeActivity(this.record, this.stateDirectory, key, "preflight", at, id);
    const activity: PreflightActivity = { activityId: id, sequence: observed.sequence, createdAt: at, trigger, ...(before ? { before } : {}), ...(skill ? { skill } : {}) };
    state.activities.push(activity);
    delete state.due;
    this.record.phases[key] = { sessionIds: [], finishedByPerson: false, repositories: {} };
    this.save();
    return activity;
  }

  /** Finishes the preflight: a read result, or a waiver that marked it complete, in one record write. */
  private finishPreflight(activity: PreflightActivity, result?: { outcome: "ready" | "no_report"; reason?: string; sessionId?: string; run?: number }, waiver?: Waiver): void {
    const key = preflightKeyOf(activity);
    const facts = this.phaseFacts(key);
    const at = this.now().toISOString();
    if (result) activity.result = { outcome: result.outcome, at, ...(result.sessionId ? { sessionId: result.sessionId, run: result.run! } : {}), ...(result.reason ? { reason: result.reason } : {}) };
    facts.doneAt = at; facts.finishedByPerson = !!waiver;
    delete facts.stop; delete facts.wait;
    if (this.record.billing?.hold?.phaseKey === key) delete this.record.billing.hold;
    if (waiver) { (this.record.waivers ??= []).push(waiver); facts.waiverId = waiver.waiverId; this.record.controlApplied = { operationId: waiver.operationId, outcome: "marked_complete" }; }
    if (this.commands?.active) facts.completedByOperation = this.commands.active.id;
    this.save();
    this.emitPreflight(activity, "done");
  }

  preflightPrompt(activity: PreflightActivity, folder = this.sessionFolder): string {
    return preflightSessionPrompt({ skillName: activity.skill?.name ?? PREFLIGHT_SKILL, skillPath: activity.skill?.path ?? PREFLIGHT_SKILL, prdFile: this.pathFrom(folder, this.prdFile()), repositories: this.promptRepositories(this.setUpRepositories), branch: this.record.settings.featureBranch });
  }

  private emitPreflight(activity: PreflightActivity, event: "started" | "stopped" | "paused" | "done" | "interrupted" | "resumed" | "waiting", limit?: { label: string; resetsAt?: string }): void {
    const result = activity.result;
    this.emit({ kind: "audit", at: this.now(), activityId: activity.activityId, title: PREFLIGHT_TITLE, event, preflight: { ...(event === "done" && result && result.outcome !== "items" ? { outcome: result.outcome } : {}), ...(event === "done" && result?.reason ? { reason: result.reason } : {}) }, ...(limit ? { limit } : {}) });
  }

  /** The preflight's first launch, under the launch checks every launch shares. */
  private async runPreflightSession(activity: PreflightActivity): Promise<"done" | "stopped"> {
    const key = preflightKeyOf(activity);
    this.current = { phaseKey: key, commits: [], processRunning: false };
    this.changed();
    if (!await this.launchReadiness(key)) return "stopped";
    if (!activity.skill) {
      // Allocated while the skill could not be resolved, then held by a launch check: resolved again now.
      const resolved = await this.resolvePreflightSkill();
      if (this.stopping) return "stopped";
      if (resolved.kind !== "found") { this.current = undefined; this.finishPreflight(activity, { outcome: "no_report", reason: resolved.message }); return "done"; }
      activity.skill = resolved.skill; this.save();
    }
    this.emitPreflight(activity, "started");
    await this.launchSession(key, "preflight", this.preflightPrompt(activity));
    if (!this.latestSession(key)?.runs.length) { this.current = undefined; this.changed(); return "stopped"; }
    return (await this.settleSession(key)).kind === "done" ? "done" : "stopped";
  }

  /**
   * Check Preflight again, and Start again at a launch-check or done-check stop on a preflight key:
   * a fresh session under the same activity, its skill resolved again. The stop, and an items
   * result, clear in the write that starts it (The Preflight Stop).
   */
  private async launchPreflightAtStop(key: string, launch: { started?: () => boolean; relaunchOf?: SessionRecord["relaunchOf"] } = {}): Promise<void> {
    const activity = this.preflightActivity(key)!;
    const facts = this.phaseFacts(key);
    // The launch decision comes first, so the skill is resolved for the agent it names (Kiln Phase Model Tiers, "Skills").
    if (!await this.ensureDecision(key, !!launch.relaunchOf)) { this.checking = false; return; }
    const resolved = await this.resolvePreflightSkill(this.agentOf(key));
    if (this.stopping) { this.checking = false; return; }
    if (resolved.kind !== "found") {
      this.checking = false;
      // No session started: a Check Preflight again receipt settles as such, and never claims the next activity's launch.
      const receipt = this.controlDispatch;
      if (receipt) { receipt.outcome = "dispatch_not_started"; receipt.reason = `The preflight could not start: ${resolved.message} It ended as No report and the run went on.`; this.controlDispatch = undefined; }
      this.finishPreflight(activity, { outcome: "no_report", reason: resolved.message });
      return;
    }
    activity.skill = resolved.skill;
    this.save();
    const started = () => {
      if (launch.started && !launch.started()) return false;
      delete facts.stop;
      if (activity.result?.outcome === "items") delete activity.result;
      this.checking = false;
      return true;
    };
    this.emitPreflight(activity, "started");
    await this.launchSession(key, "preflight", this.preflightPrompt(activity), { started, ...(launch.relaunchOf ? { relaunchOf: launch.relaunchOf } : {}) });
  }

  /**
   * A preflight run that ended (Reading the Result): the Codex safety check, then a usage-limit wait
   * when Kiln will resume it, then the report's first line. Only `items` stops the run.
   */
  private async judgePreflight(key: string): Promise<Verdict> {
    const activity = this.preflightActivity(key)!;
    // Only the report's first line, no report or Mark complete finishes a preflight, once.
    if (this.record.phases[key]?.doneAt) return { kind: "done", judgedId: key };
    const session = this.latestSession(key);
    const runIndex = (session?.runs.length ?? 0) - 1;
    const run = session?.runs[runIndex];
    if (!session || !run) { this.finishPreflight(activity, { outcome: "no_report", reason: "No preflight session ran." }); return { kind: "done", judgedId: key }; }
    if (run.spawnError && run.pid === undefined) { this.finishPreflight(activity, { outcome: "no_report", reason: run.spawnError.message }); return { kind: "done", judgedId: key }; }
    const safety = await this.preflightSafety(key);
    if (safety) { this.recordStop(key, "done_check", [safety]); return { kind: "stopped" }; }
    if (run.limitRefusal !== undefined && this.record.settings.resumeAfterUsageLimit && !this.transcriptMissing(session) && !(run.cause === "limit_resume" && this.refusedAgain(session, runIndex))) {
      this.recordWait(key, session, runIndex, []);
      return { kind: "waiting" };
    }
    return this.applyPreflightReport(activity, readPreflightReport(run.result?.text), session.sessionId, runIndex);
  }

  /** The Codex safety check's failing row on a preflight key, unless a waiver covers it; undefined when it passes. */
  private async preflightSafety(key: string): Promise<CheckResult | undefined> {
    await this.refreshCodexConversations(key);
    const problems = this.codexSafetyProblems(key);
    if (!problems.length) return undefined;
    const checks: CheckResult[] = [{ name: "Codex process cleanup and dispatch", passed: false, facts: problems }];
    return await this.markChecks(key, checks) ? undefined : checks[0];
  }

  /** `ready` and `no_report` finish the preflight and go on; `items` stops on its key with the numbered items. */
  private applyPreflightReport(activity: PreflightActivity, report: PreflightReport, sessionId?: string, run?: number, waiver?: Waiver): Verdict {
    const key = preflightKeyOf(activity);
    if (report.outcome !== "items") {
      this.finishPreflight(activity, { outcome: report.outcome, ...(sessionId ? { sessionId, run: run! } : {}) }, waiver);
      return { kind: "done", judgedId: key };
    }
    activity.result = { outcome: "items", at: this.now().toISOString(), ...(sessionId ? { sessionId, run: run! } : {}), headline: report.headline, items: report.items };
    if (waiver) { (this.record.waivers ??= []).push(waiver); this.record.controlApplied = { operationId: waiver.operationId, outcome: "continued" }; }
    this.recordStop(key, "preflight", [{ name: PREFLIGHT_CHECK, passed: false, facts: report.items, reason: true }]);
    return { kind: "stopped" };
  }

  /** The latest preflight run's report, as `judgePreflight` reads it. */
  private latestPreflightReport(key: string): { report: PreflightReport; sessionId?: string; run?: number } {
    const session = this.latestSession(key);
    const runIndex = (session?.runs.length ?? 0) - 1;
    const run = session?.runs[runIndex];
    return { report: readPreflightReport(run?.result?.text), ...(session && run ? { sessionId: session.sessionId, run: runIndex } : {}) };
  }

  /**
   * Check again at a stop on a preflight key (Reading the Result): a billing hold rechecks billing
   * only and never finishes the preflight; a done-check stop reruns only the Codex safety check and,
   * once it passes, reads the report line. Undefined for a launch-check or plan stop, which recheck as on any key.
   */
  private async recheckPreflight(key: string): Promise<"cleared" | "still_stopped" | undefined> {
    const hold = this.record.billing?.hold;
    if (hold?.phaseKey === key) {
      await this.billing.refresh(this.billingCwd, this.sessionEnv(), [], true);
      if (this.billing.view.canLaunch) { delete this.record.billing!.hold; this.save(); return "cleared"; }
      hold.checks = markReasonRows([{ name: "Billing approval", passed: false, facts: [hold.reason] }]); delete hold.rowsAreCompletionChecks; hold.run = this.newRun("recheck"); this.save();
      return "still_stopped";
    }
    const stop = this.record.phases[key]?.stop;
    if (!stop || stop.kind === "preflight") return stop ? "still_stopped" : undefined;
    if (stop.kind !== "done_check" && stop.kind !== "not_resumable") return undefined;
    const latest = this.latestSession(key);
    if (latest?.agentId === "codex") await this.stopLiveProcess(latest);
    const safety = await this.preflightSafety(key);
    if (this.stopping) return "still_stopped";
    if (safety) { this.updateStop(key, [safety], false); return "still_stopped"; }
    const read = this.latestPreflightReport(key);
    const verdict = this.applyPreflightReport(this.preflightActivity(key)!, read.report, read.sessionId, read.run);
    return verdict.kind === "done" ? "cleared" : "still_stopped";
  }


  // ---- Audit loops (Kiln Deliver When Audit Loops Run Out) -----------------------------------

  private get gateContext() { return { record: this.record, stateDirectory: this.stateDirectory }; }

  /**
   * Writes `atPullRequest` once, from `Settings`, so the rest of the execution reads the limits it
   * had when its first pull request session launched or the run completed ("Loops and the Ledger").
   * Not saved here: the caller's write saves it.
   */
  private freezeLimits(): void {
    const ledger = this.record.auditLoops;
    if (!ledger || ledger.atPullRequest) return;
    const limits = loopSettings(this.record.settings);
    ledger.atPullRequest = { at: this.now().toISOString(), deliveryLimit: limits.deliveryLimit, testLimit: limits.testLimit };
  }

  private admissionContext(extra?: Waiver): AdmissionContext {
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    const planPhases = this.waivedOrderPhases(extra);
    return { record: this.record, stateDirectory: this.stateDirectory, git: { ...this.git, signal }, signal, closed: closedKinds(this.record), ...(planPhases ? { planPhases } : {}), label: (name) => this.labelOf(name) };
  }

  /** While a waived plan problem stops the documents from reading, the phases Normal Order uses, so audits can snapshot the work (AC-WAIVE-04). */
  private waivedOrderPhases(extra?: Waiver): PlannedPhase[] | undefined {
    const read = readPlanAt(this.worktreePath, this.paths.prdDirectoryFromRoot);
    if (read.ok || read.unavailable) return undefined;
    return knownProblemWaiver([...(this.record.waivers ?? []), ...(extra ? [extra] : [])], read.problem) ? this.orderSource() : undefined;
  }

  private async nextActivity(plan: PhasePlan): Promise<{ kind: "audit"; key: string; activity: AuditActivity } | { kind: "phase"; leaf: PlannedPhase } | { kind: "final"; leaf?: undefined } | { kind: "stopped"; key: string }> {
    await this.deliveryPending;
    const pending = this.record.completionAudits?.activities.findLast(a => !this.record.phases[auditKey(a)]?.doneAt);
    if (pending) { this.record.nextActivityKey = auditKey(pending); this.save(); return { kind: "audit", key: auditKey(pending), activity: pending }; }
    const leaf = this.nextExecutionLeaf(plan);
    // Every phase an audit appended is built, whatever the loop counts (AC-LAST-01).
    if (leaf) { this.record.nextActivityKey = leaf.id; this.save(); return { kind: "phase", leaf }; }
    let kind: Awaited<ReturnType<typeof auditNext>> | undefined;
    try {
      // Finished audit origins retain their development obligations after a first grant.
      if (deliveryEnabled(this.record)) for (const activity of this.record.completionAudits?.activities ?? []) {
        const check = ownerDeliveryCheck(this.deliveryContext(auditKey(activity)), { kind: "audit", activityId: activity.activityId });
        if (!await this.markChecks(auditKey(activity), [check])) { this.recordStop(auditKey(activity), "done_check", [check]); return { kind: "stopped", key: auditKey(activity) }; }
        // Bound when it finished; this covers an audit finished by an earlier Kiln and later marked complete.
        if (acceptAuditDocuments(this.deliveryContext(auditKey(activity)), activity.activityId)) this.save();
      }
      // A kind whose loops reach its limit in force is closed: `auditNext` allocates no new audit of that kind (AC-LAST-03).
      kind = await auditNext(this.admissionContext());
      if (kind === "final_delivery") { this.record.nextActivityKey = PR_PHASE_KEY; this.save(); return { kind: "final" }; }
      const activity = await this.allocateAudit(kind === "continue_test" ? "test_audit" : kind, kind === "continue_test");
      return { kind: "audit", key: auditKey(activity), activity };
    } catch (error) {
      const key = this.record.completionAudits?.activities.at(-1) ? auditKey(this.record.completionAudits.activities.at(-1)!) : PR_PHASE_KEY;
      const fact = this.readinessFact(error);
      const waiver = !this.stopping && knownProblemWaiver(this.record.waivers, fact);
      if (!waiver) {
        this.recordStop(key, "selection", [{ name: READINESS_CHECK, passed: false, facts: [fact] }]);
        return { kind: "stopped", key };
      }
      // A waived readiness problem: the step the saved audit record gives, judged without the step that failed (AC-WAIVE-04).
      const step = kind ?? this.auditStepAfterSettled();
      if (step === "final_delivery") {
        this.phaseFacts(PR_PHASE_KEY).waiverWarning = { kind: "audit", waiverId: waiver.waiverId };
        this.record.nextActivityKey = PR_PHASE_KEY; this.save(); return { kind: "final" };
      }
      // An audit that cannot start on the waived problem counts as marked complete with no report (AC-WAIVE-12).
      try { await this.completeAuditAtOnce(step === "continue_test" ? "test_audit" : step, step === "continue_test", waiver); }
      catch (failure) {
        // An audit that cannot even be allocated, such as when no work snapshot can be read, stops on that problem.
        if (this.stopping) throw failure;
        this.recordStop(key, "selection", [{ name: READINESS_CHECK, passed: false, facts: [(failure as Error).message] }]);
        return { kind: "stopped", key };
      }
      return this.nextActivity(plan);
    }
  }

  /**
   * The hold check's one row (Items for a Person, "The hold stop"): one `other` item per outstanding
   * item that holds the run, keyed by its ledger id so a waiver keeps covering it whatever the feature
   * heads. An item the waiver of an audit marked complete covers is left out; waivers are applied by
   * the caller.
   */
  private holdRow(): CheckResult {
    const waivers = this.record.waivers ?? [];
    const holding = personItems(this.stateDirectory, this.record).outstanding.filter(item => itemEffect(item.kind) === "holds" && !(item.auditWaiverId && waivers.some(w => w.waiverId === item.auditWaiverId)));
    if (!holding.length) return { name: HOLD_CHECK, passed: true, facts: ["No item for a person holds the run."] };
    const text = (item: typeof holding[number]) => `${item.kind === null ? "Listed before item kinds: " : ""}${itemLine(item)}${item.waitsOn ? ` Waits on: ${item.waitsOn}` : ""}`;
    const items = holding.map(item => ({ kind: "other" as const, subject: item.id, text: text(item), against: item.id }));
    return { name: HOLD_CHECK, passed: false, facts: items.map(item => item.text), items };
  }

  /** At an arrival at final delivery: true, with the hold stop recorded, while an item no waiver covers holds the run. */
  private async holdStops(): Promise<boolean> {
    const row = this.holdRow();
    if (await this.markChecks(PR_PHASE_KEY, [row])) return false;
    this.recordStop(PR_PHASE_KEY, "selection", [row]);
    return true;
  }

  /**
   * Check again at the hold stop: routing on the limits in force, then the hold check. An audit or
   * a phase still to run clears the stop, since its work can settle the item; otherwise the stop is
   * kept with the new run, which makes Continue anyway usable, and remembers whether Continue
   * anyway would complete the run with no pull request session.
   */
  private async recheckHold(phaseKey: string, routeAudits = true): Promise<"cleared" | "still_stopped"> {
    // Continue anyway's rerun (`routeAudits: false`) never routes to work: it only rechecks the row it would waive.
    if (routeAudits) {
      let next: Awaited<ReturnType<typeof auditNext>> | undefined;
      try { next = await auditNext(this.admissionContext()); }
      catch { return this.clearStop(phaseKey); }
      const read = await this.readPlan();
      if (next !== "final_delivery" || read.ok && this.nextExecutionLeaf(read.plan)) return this.clearStop(phaseKey);
    }
    const row = this.holdRow();
    if (await this.markChecks(phaseKey, [row])) return this.clearStop(phaseKey);
    const final = await this.pullRequestCheck(PR_PHASE_KEY);
    if (this.stopping) return "still_stopped";
    this.updateStop(phaseKey, [row], false);
    this.record.phases[phaseKey]!.stop!.holdLeadsTo = final.passed && !final.ghError ? "complete" : "pull_request_session";
    this.save();
    return "still_stopped";
  }

  /**
   * Where the record cannot tell: the next of delivery audit, test audit, final delivery after the
   * last settled audit, with a closed kind's audit skipped as `auditNext` skips it (AC-LAST-03).
   */
  /**
   * The audit kinds the routing still expects after the last settled audit, in the order Kiln
   * allocates them, for the planned rows (Kiln Phase Model Tiers, "Planned rows").
   */
  expectedAuditKinds(): ("delivery_audit" | "test_audit")[] {
    const step = this.auditStepAfterSettled();
    if (step === "final_delivery") return [];
    if (step === "delivery_audit") return closedKinds(this.record).test ? ["delivery_audit"] : ["delivery_audit", "test_audit"];
    return ["test_audit"];
  }

  private auditStepAfterSettled(): "delivery_audit" | "test_audit" | "continue_test" | "final_delivery" {
    const closed = closedKinds(this.record);
    const activities = this.record.completionAudits?.activities ?? [];
    const settled = activities.findLast(a => this.record.phases[auditKey(a)]?.doneAt);
    const testContinues = latestTestContinues(this.gateContext);
    // After a delivery audit, or none: the test audit while one is left, else saved test work, else final delivery.
    const afterDelivery = () => !closed.test ? "test_audit" : testContinues ? "continue_test" : "final_delivery";
    if (!settled) return closed.delivery ? afterDelivery() : "delivery_audit";
    // A settled test audit that counts as continue_test still gets its continuation, whatever the counts.
    if (settled.kind === "test_audit") return testContinues ? "continue_test" : "final_delivery";
    return afterDelivery();
  }

  /** The audit skill on the Audits choice's agent; one that doesn't resolve throws an `AuditSkillUnresolved`. */
  private async auditsSkill(kind: AuditKind): Promise<NonNullable<AuditActivity["skill"]>> {
    try { return await resolveAuditSkill({ kind, agent: this.auditsAgent, claude: this.options.tools.claude, ...(this.options.tools.codex ? { codex: this.options.tools.codex } : {}), cwd: this.sessionFolder, env: this.options.env, signal: this.abort.signal }); }
    catch (error) { throw new AuditSkillUnresolved((error as Error).message); }
  }

  /**
   * A readiness-check failure as its stop names it. An audit skill that doesn't resolve names the
   * Audits choice as it is now, where it came from and where to change it (AC-PICK-06), since the
   * stop's key can be an earlier, finished audit; any other failure keeps its own message.
   *
   *   this.readinessFact(new AuditSkillUnresolved("Enable exactly one delivery-audit skill in …"))
   *   // "The audits, preflight and pull request session run on Codex · GPT Sol · high from Model defaults (Audits row): Enable exactly one delivery-audit skill in … Change the Audits row in Model defaults, or …"
   */
  private readinessFact(error: unknown): string {
    const message = (error as Error).message;
    return error instanceof AuditSkillUnresolved ? choiceStopFact({ ...this.notStartedChoice(PR_PHASE_KEY), problem: message }, PR_PHASE_KEY) : message;
  }

  private async allocateAudit(kind: AuditKind, continuation = false, withoutSkill = false): Promise<AuditActivity> {
    const skill = withoutSkill ? undefined : await this.auditsSkill(kind);
    this.activeCheck = "audit-allocation";
    const before = structuredClone(this.record);
    try {
      const state = this.record.completionAudits!;
      const predecessor = continuation ? state.activities.findLast(a => a.kind === "test_audit") : undefined;
      if (continuation && (!predecessor || continuablePredecessor({ record: this.record, stateDirectory: this.stateDirectory }) !== predecessor)) throw new Error("A test continuation requires its settled accepted predecessor.");
      const id = randomUUID(); const at = this.now().toISOString();
      const observed = observeActivity(this.record, this.stateDirectory, `audit-${id}`, kind, at, id);
      const activity: AuditActivity = { activityId: id, sequence: observed.sequence, kind, round: predecessor?.round ?? Math.max(0, ...state.activities.filter(a => a.kind === kind).map(a => a.round)) + 1, continuationIndex: predecessor ? predecessor.continuationIndex + 1 : 1, createdAt: at, sessionIds: [], reportPath: `${writtenDirectory(this.record)}/kiln-audit-${id}.json`, ...(skill ? { skill } : {}), snapshots: [], attempts: [] };
      state.activities.push(activity); this.record.nextActivityKey = auditKey(activity);
      this.record.phases[auditKey(activity)] = { sessionIds: [], finishedByPerson: false, repositories: {} };
      const context = this.admissionContext();
      const initial = await captureSnapshot({ ...context, activity, now: at });
      activity.snapshots.push(new AuditStore(this.stateDirectory).put(initial));
      if (predecessor) assignAuditObligations(this.deliveryContext(auditKey(activity)), predecessor.activityId, { kind: "audit", activityId: activity.activityId });
      state.revision++;
      // A loop is one run of an audit: counted in the write that allocates an audit Kiln will launch, never
      // for a continuation (a session of test fixes) or an audit completed at once with no session (AC-LAST-02).
      if (!continuation && !withoutSkill && this.record.auditLoops) appendLoop(this.record.auditLoops, { kind: kind === "delivery_audit" ? "delivery" : "test", startedAt: at, activityKey: auditKey(activity) });
      this.save(); return activity;
    } catch (error) { this.restoreRecord(before); throw error; }
    finally { this.activeCheck = undefined; }
  }

  private async runAuditSession(activity: AuditActivity): Promise<"done" | "stopped"> {
    const key = auditKey(activity);
    await this.recordStartCommits(key);
    const prompt = this.auditPrompt(activity);
    this.emitAudit(activity, "started");
    await this.launchSession(key, activity.kind, prompt);
    return (await this.settleSession(key)).kind === "done" ? "done" : "stopped";
  }

  /**
   * The audit prompt, with `{{nextSteps}}` forecast from the ledger and the limits in force as the
   * prompt is built, so a relaunch after a restart rebuilds the same prompt ("Prompts").
   */
  auditPrompt(activity: AuditActivity): string {
    // Include the latest test record even when a delivery reassessment intervened.
    // Grades remain history: this activity independently reassesses all current rows.
    const history = this.record.completionAudits!.activities.filter(a => a.sequence < activity.sequence && hasEffectiveResult(a) && effectiveAudit(this.stateDirectory, a)?.reportBytes);
    const previous = [history.findLast(a => a.kind === "delivery_audit"), history.findLast(a => a.kind === "test_audit")].filter((a): a is AuditActivity => !!a).sort((a, b) => a.sequence - b.sequence);
    const nextSteps = nextStepsForecast({ kind: activity.kind, fixing: activity.continuationIndex > 1, closed: closedKinds(this.record), latestTestContinues: latestTestContinues(this.gateContext) });
    return auditSessionPrompt({ label: auditLabel(activity.kind), skillName: runnableSkill(activity).name, skillPath: runnableSkill(activity).path, executionId: this.record.executionId!, activityId: activity.activityId, round: activity.round, continuationIndex: activity.continuationIndex, reportPath: activity.reportPath, prdFile: this.pathFrom(this.sessionFolder, this.prdFile()), repositories: this.promptRepositories(this.setUpRepositories), branch: this.record.settings.featureBranch, cli: `${JSON.stringify(process.execPath)} ${JSON.stringify(fileURLToPath(new URL("../cli.js", import.meta.url)))}`, deliveryAuthority: this.deliveryAuthority(), ...(previous.length ? { previous: previous.map(a => effectiveAudit(this.stateDirectory, a)!.reportBytes!).join("\n\n") } : {}), outstanding: outstandingLines(personItems(this.stateDirectory, this.record, activity.sequence).outstanding, this.record.waivers), nextSteps });
  }

  private emitAudit(activity: AuditActivity, event: "started" | "stopped" | "paused" | "done" | "interrupted" | "resumed" | "waiting", limit?: { label: string; resetsAt?: string }): void {
    const name = recordedAuditName(this.record, activity);
    this.emit({ kind: "audit", at: this.now(), activityId: activity.activityId, title: name.title, ...(name.line ? { line: name.line } : {}), event, ...(limit ? { limit } : {}) });
  }

  private async auditDoneCheck(key: string): Promise<DoneCheckOutcome> {
    await this.deliveryPending; await this.additionChain; this.activeCheck = key;
    let before: PrdRecord | undefined;
    try {
      const plan = await this.readPlan();
      if (!plan.ok && plan.unavailable) throw new CompletionCheckUnavailable(plan.problem);
      before = structuredClone(this.record);
      await this.refreshCodexConversations(key);
      const activity = this.auditActivity(key)!; const context = this.admissionContext();
      if (deliveryEnabled(this.record)) context.developmentChecks = () => [ownerDeliveryCheck(this.deliveryContext(key), { kind: "audit", activityId: activity.activityId })];
      const checks: CheckResult[] = [];
      if (deliveryEnabled(this.record)) {
        await reconcileDelivery(this.deliveryContext(key));
        if (ledger(this.record).sourceUnavailable) throw new CompletionCheckUnavailable(ledger(this.record).lastReadError ?? "Required development-delivery evidence is unavailable.");
      }
      try {
        if (!hasEffectiveResult(activity)) {
          const result = await submitAudit(context, { executionId: this.record.executionId, activityId: activity.activityId, revision: this.record.completionAudits!.revision, reportPath: activity.reportPath });
          if (result.refusal && (result.refusal.status === 503 || result.refusal.code === "evidence_unavailable")) throw new CompletionCheckUnavailable(result.refusal.reason);
          checks.push(...result.checks);
        } else {
          let accepted: NonNullable<ReturnType<typeof effectiveAudit>>;
          try { accepted = effectiveAudit(this.stateDirectory, activity)!; }
          catch (error) { throw new CompletionCheckUnavailable((error as Error).message); }
          checks.push({ name: "Audit result recorded", passed: true, facts: [accepted.source === "waiver" ? `Marked complete ${activity.reportPath}: counted as ${accepted.countedOutcome}.` : `Accepted ${activity.reportPath}: ${accepted.outcome}.`] });
          try {
            const current = await auditCurrentness(context, activity);
            checks.push({ name: "Audit evidence is current", passed: current.deliveryCurrent && (activity.kind !== "test_audit" || current.testsCurrent), facts: [current.deliveryCurrent && (activity.kind !== "test_audit" || current.testsCurrent) ? "Assigned audit evidence matches current work." : "Checked audit work changed; recover the assigned result before continuing."] });
          } catch (error) {
            if (!(error instanceof AuditRefusal) || error.code !== "stale_snapshot") throw new CompletionCheckUnavailable((error as Error).message);
            checks.push({ name: "Audit evidence is current", passed: false, facts: [error.message] });
          }
        }
      } catch (error) {
        if (error instanceof CompletionCheckUnavailable) throw error;
        if (!(error instanceof AuditRefusal) || error.status === 503 || error.code === "evidence_unavailable") throw new CompletionCheckUnavailable((error as Error).message);
        checks.push({ name: "Audit result recorded", passed: false, facts: [error.message] });
      }
      checks.push(...await repositoryChecks(context));
      if (deliveryEnabled(this.record)) checks.push(ownerDeliveryCheck(this.deliveryContext(key), { kind: "audit", activityId: activity.activityId }), ...this.activationChecks().filter(c => !c.passed));
      if (!plan.ok) checks.push(planCheck(plan));
      this.save();
      const outcome = this.withCodexSafety<DoneCheckOutcome>(key, { passed: false, checks: oneRowPerCheck(checks), plan, judgedLeafId: key });
      outcome.passed = await this.markChecks(key, outcome.checks);
      this.lastDoneCheck = { key, outcome };
      return outcome;
    } catch (error) { if (before && !this.commands.fault) Object.assign(this.record, before); throw error; }
    finally { this.activeCheck = undefined; }
  }

  private finalNeedsAudits(outcome: { checks: CheckResult[] }): boolean {
    if (!outcome.checks.some(c => c.name === "Current completion audits" && !c.passed) || outcome.checks.some(c => c.name !== "Current completion audits" && !c.passed)) return false;
    const facts = this.record.phases[PR_PHASE_KEY]; if (facts) { delete facts.stop; delete facts.wait; }
    if (this.record.completionAudits) this.record.completionAudits.policy = "required";
    this.save(); return true;
  }

  private async requireCurrentAudits(outcome: { passed: boolean; checks: CheckResult[] }): Promise<void> {
    // Under a waived plan problem the audits are still judged, against the phases Normal Order uses (AC-WAIVE-04, AC-WAIVE-09).
    const planRow = (read: PlanRead) => { if (read.ok) return false; outcome.checks.push(planCheck(read)); outcome.passed = false; return !!read.unavailable || !knownProblemWaiver(this.record.waivers, read.problem); };
    let leaves: PhasePlan | undefined = this.plan;
    if (!this.record.completedAt) {
      const read = await this.readPlan();
      if (planRow(read)) return;
      leaves = read.ok ? read.plan : { phases: this.orderSource(), problems: [] };
    }
    if (this.record.completedAt && this.record.completionAudits?.policy === "legacy_complete") return;
    try {
      const baseline = this.record.planReconciliation?.baselineId;
      const next = await auditNext(this.admissionContext());
      if (!this.record.completedAt) {
        const read = await this.readPlan();
        if (!read.ok && !outcome.checks.some(check => check.name === CHECK_NAMES.plan) && planRow(read)) return;
        if (!read.ok && !read.unavailable) leaves = { phases: this.orderSource(), problems: [] };
        else if (read.ok) leaves = read.plan;
      }
      leaves ??= { phases: this.orderSource(), problems: [] };
      if (next === "final_delivery" && !nextLeaf(effectivePlan(leaves, this.record, this.carriedClosed()).plan) && baseline === this.record.planReconciliation?.baselineId) {
        // Met only because an audit counts on its waiver: a met row marked Waived, tagged with that audit's waiver (AC-WAIVE-10, AC-WAIVE-12).
        const audits = this.record.completionAudits?.activities ?? [];
        const relied = [audits.findLast(a => a.kind === "delivery_audit"), audits.findLast(a => a.kind === "test_audit")].filter((a): a is AuditActivity => !!a?.waivedResult);
        const items = relied.flatMap(audit => {
          const waiver = this.record.waivers?.find(w => w.waiverId === this.record.phases[auditKey(audit)]?.waiverId);
          if (!waiver) return [];
          const text = `${auditSentenceStart(recordedAuditName(this.record, audit))} was marked complete`;
          return [{ kind: "other" as const, subject: auditKey(audit), text, against: audit.waivedResult!, waiver: { waiverId: waiver.waiverId, activityKey: waiver.activityKey, at: waiver.at, ...waiver.source } }];
        });
        if (items.length) outcome.checks.push({ name: "Current completion audits", passed: true, waived: true, facts: items.map(item => item.text), items });
        return;
      }
      outcome.checks.push({ name: "Current completion audits", passed: false, facts: [`${next === "final_delivery" ? "Implementation" : next === "continue_test" ? "Fixing tests" : auditLabel(next)} is required before final completion.`] });
    } catch (error) {
      const text = (error as Error).message;
      // The same plan or audit-readiness problem, raised again here, carries its waiver (AC-WAIVE-04).
      outcome.checks.push({ name: "Current completion audits", passed: false, facts: [text], ...(knownProblemWaiver(this.record.waivers, text) ? { items: [{ kind: "known_problem" as const, subject: text, text, against: text }] } : {}) });
    }
    outcome.passed = false;
  }

  private async runPhaseSession(leafId: string): Promise<"done" | "stopped"> {
    this.phaseFacts(leafId);
    // The prompt lists the workspace as it stands once any addition under way has ended.
    await this.additionChain;
    await this.recordStartCommits(leafId);
    const leaf = this.plan?.phases.find((phase) => phase.id === leafId);
    if (this.record.preparation?.phaseId === leafId) {
      if (!await this.preparePolicyForTurn(leafId)) return "stopped";
    }
    const prompt = this.record.preparation?.phaseId === leafId ? this.preparationTask() : phaseSessionPrompt(this.phasePromptValues(leaf?.fileName ?? "", this.sessionFolder));
    if (this.stopping) return "stopped";
    this.emit({ kind: "phase", at: this.now(), phaseId: leafId, title: leaf?.title ?? leafId, event: "started" });
    await this.launchSession(leafId, "phase", prompt);
    const verdict = await this.settleSession(leafId);
    return verdict.kind === "done" ? "done" : "stopped";
  }

  /**
   * Start again (AC-CASE-02) or Carry on (AC-CARRY-05): a session record for the phase, new or its
   * last one when that has no run, launched through the ordinary launch path in the phase's
   * worktree. Start again sends the ordinary phase prompt; Carry on sends the carry-on prompt; on
   * the prerequisite-preparation phase each is built on the preparation task.
   * The phase's stop clears just before dispatch, after the billing check, as a resumed run's does.
   */
  private async launchAtStop(request: NonNullable<Engine["requestedLaunch"]>, launch: { started?: () => boolean; relaunchOf?: SessionRecord["relaunchOf"] } = {}): Promise<void> {
    const key = request.phaseKey;
    const requirements = this.record.requirements?.stages.find(stage => key === `req-${stage.activityId}`);
    if (requirements) return this.launchRequirementStage(requirements, request.kind === "carry_on" ? { carryOn: request.note ? { note: request.note } : {} } : {});
    if (isPreflightKey(key)) return this.launchPreflightAtStop(key);
    const facts = this.record.phases[key]!;
    await this.additionChain;
    await this.recordStartCommits(key);
    const leaf = this.plan?.phases.find(phase => phase.id === key) ?? judgedPhase(this.record.plan ?? [], key);
    const fileName = (leaf && "fileName" in leaf ? leaf.fileName : undefined) ?? this.fileOf(key) ?? "";
    const values = this.phasePromptValues(fileName, this.sessionFolder);
    // The prerequisite-preparation phase gets its own task and policy read, as its first launch and a resume do.
    const preparing = this.preparingTurn(key);
    if (preparing && !await this.restartPreparationTurn(key)) return;
    // Once the preparation phase's implementation stage has begun, a carry-on's new session holds that
    // stage from its first run, admitted on the verified checkpoint as the stage's first run is.
    if (request.kind === "carry_on" && !preparing && this.record.preparation?.phaseId === key) this.record.preparation.implementationRun = 0;
    let prompt: string;
    if (request.kind === "start_again") prompt = preparing ? this.preparationTask() : phaseSessionPrompt(values);
    else {
      const work = await this.refreshStoppedWork(key);
      const earlier = this.recoverySession(key);
      const lastMessage = earlier && lastRecordedRun(earlier)?.result?.text;
      prompt = carryOnPrompt({ freshSession: preparing ? this.preparationTask() : freshSessionPrompt(values, true), ...(request.note ? { note: request.note } : {}), ...(lastMessage ? { lastMessage } : {}), work: work && !("unknown" in work) ? work.repositories : [], multiRepository: this.setUpRepositories.length > 1 });
    }
    if (this.stopping) { this.checking = false; return; }
    this.emit({ kind: "phase", at: this.now(), phaseId: key, title: this.titleOf(key), event: "started" });
    const started = launch.started ?? (() => {
      delete facts.stop;
      this.checking = false;
      this.stoppedWork = undefined;
      return true;
    });
    await this.launchSession(key, "phase", prompt, { started, ...(request.kind === "carry_on" ? { startedAs: "carry_on" as const } : {}), ...(launch.relaunchOf ? { relaunchOf: launch.relaunchOf } : {}) });
    // A launch that ended before reporting init leaves the hold pending (AC-CARRY-06).
    if (this.record.liveControl) this.returningTakeover = false;
  }

  private async preparePolicyForTurn(key: string): Promise<boolean> {
    let digest: string;
    try { digest = await preparationPermissions(this.preparationContext(), true); }
    catch (error) {
      this.record.preparation!.reason = (error as Error).message;
      this.recordStop(key, this.latestSession(key)?.runs.length ? "done_check" : "selection", [{ name: "Preparation permissions", passed: false, facts: [this.record.preparation!.reason] }]);
      this.current = undefined; this.checking = false; this.changed(); return false;
    }
    this.record.preparation!.providerPolicyDigest = digest;
    this.writeContinuationMetadata(() => this.save()); return true;
  }

  /** Whether the phase's next turn is prerequisite preparation rather than its implementation stage. */
  private preparingTurn(key: string): boolean {
    return this.record.preparation?.phaseId === key && this.record.preparation.stage !== "implementation";
  }

  /**
   * Explicit preparation recovery before a new turn of the preparation phase (a resume, Start again
   * or Carry on): settles any attempt left unfinished, returns to the preparation stage and reads the
   * policy again. False when the policy read stopped the phase.
   */
  private async restartPreparationTurn(key: string): Promise<boolean> {
    const state = this.record.preparation!;
    for (const attempt of state.attempts.filter(preparationAttemptNeedsReconciliation)) { await reconcilePreparationAttempt(attempt); attempt.outcome = "interrupted"; attempt.reason = "Explicit preparation recovery; investigate external effects before a new submission."; }
    state.stage = "preparation"; state.submissions = []; delete state.verifiedCheckpoint;
    if (!await this.preparePolicyForTurn(key)) return false;
    this.save();
    return true;
  }

  private preparationTask(note?: string): string {
    const state = this.record.preparation!;
    return preparationPrompt({ phaseId: state.phaseId, featureName: this.record.featureName, branch: this.record.settings.featureBranch, bindings: JSON.stringify(state.bindings.map(binding => ({ ...binding, worktree: this.record.repositories.find(repo => repo.name === binding.repository)?.worktreePath })), null, 2), cli: `${JSON.stringify(process.execPath)} ${JSON.stringify(fileURLToPath(new URL("../cli.js", import.meta.url)))}`, executionId: this.record.executionId!, recovery: [state.reason, note].filter(Boolean).join("\n") });
  }

  preparationStatus(executionId: unknown, phaseId: unknown) {
    const state = typeof executionId === "string" ? this.historicalExecution(executionId)?.record.preparation : undefined;
    if (!state || phaseId !== state.phaseId) return undefined;
    return { executionId, phaseId, stage: state.stage, bindings: state.bindings, checks: state.attempts.map(({ gateDirectory: _gate, output: _output, ...attempt }) => { void _gate; void _output; return { ...attempt, output: `/api/preparation/output/${attempt.id}?executionId=${executionId}` }; }), reason: state.reason, checkpoint: state.verifiedCheckpoint?.id };
  }

  async preparationReadStatus(executionId: unknown, phaseId: unknown) {
    const status = this.preparationStatus(executionId, phaseId);
    if (!status) return undefined;
    const session = executionId === this.record.executionId && this.record.preparation ? this.latestSession(this.record.preparation.phaseId) : undefined;
    let commands: CommandEvidence[] = [];
    if (session?.runs.some(run => run.pid)) { try { commands = await this.deliveryCommands(session.sessionId); } catch (error) { return { ...status, availableCommandEvidence: [], commandEvidenceError: (error as Error).message }; } }
    return { ...status, availableCommandEvidence: commands.filter(command => command.resultAt).map(command => ({ sessionId: session!.sessionId, callId: command.callId, command: command.command, cwd: command.cwd, outcome: command.outcome, resultAt: command.resultAt })) };
  }

  private async authorizePreparationCommands(): Promise<void> {
    const state = this.record.preparation!; const session = this.latestSession(state.phaseId);
    if (!session) throw new Error("No current preparation conversation can establish existing command permissions.");
    const commands = await this.deliveryCommands(session.sessionId);
    for (const binding of state.bindings) for (const check of binding.checks) {
      const refs = state.submissions.filter(row => row.bindingId === binding.id && row.run === session.runs.length - 1 && row.sessionId === session.sessionId).flatMap(row => row.references);
      const cwd = resolve(this.record.repositories.find(repo => repo.name === binding.repository)!.worktreePath, check.directory);
      if (!refs.some(ref => ref.kind === "command" && commands.some(command => command.callId === ref.callId && command.command.trim() === check.command && resolve(command.cwd) === cwd && command.resultAt && command.outcome === "success" && Date.parse(command.calledAt) >= Date.parse(session.runs.at(-1)!.startedAt)))) throw new Error(`Existing Claude tool controls require a retained successful ${check.command} command from this preparation turn. Run it through the provider, submit its command reference, then return; Kiln still verifies independently.`);
    }
  }

  async submitPreparation(body: Record<string, unknown>) {
    const state = this.record.preparation;
    if (Object.keys(body).sort().join() !== "bindingId,executionId,phaseId,references" || !Array.isArray(body.references) || !body.references.length || body.references.length > 100) return { ok: false, status: 400 as const, reason: "Submit the exact preparation binding and typed source references." };
    if (!state || body.executionId !== this.record.executionId || body.phaseId !== state.phaseId) return { ok: false, status: 403 as const, reason: "Preparation belongs to another execution or phase." };
    const binding = state.bindings.find(binding => binding.id === body.bindingId);
    const session = this.latestSession(state.phaseId); const runIndex = (session?.runs.length ?? 0) - 1;
    if (!binding || !session || runIndex < 0) return { ok: false, status: 409 as const, reason: "No owning preparation turn is available." };
    const references = body.references as PreparationReference[];
    const digest = preparationDigest(references);
    const retained = state.submissions.find(row => row.bindingId === binding.id && row.sessionId === session.sessionId && row.digest === digest);
    if (retained && (state.stage !== "preparation" || retained.run === runIndex)) return { ok: true, status: 200 as const, disposition: state.verifiedCheckpoint && !state.reason ? "verified" : "submitted", checks: this.preparationStatus(body.executionId, body.phaseId)?.checks };
    if (this.commands.blocked || this.stopping) return { ok: false, status: 503 as const, code: "state_write_failed", reason: this.commands.fault ?? "Preparation ownership needs recovery before another submission." };
    for (const reference of references) {
      if (!reference || typeof reference !== "object") return { ok: false, status: 400 as const, reason: "Use typed preparation references." };
      if (reference.kind === "git_revision") {
        if (Object.keys(reference).sort().join() !== "commit,kind,repository" || reference.repository !== binding.repository || reference.commit !== binding.sourceRevision) return { ok: false, status: 400 as const, reason: "The Git reference must identify this binding's pinned repository/source revision." };
      } else if (reference.kind === "command") {
        if (Object.keys(reference).sort().join() !== "callId,kind,sessionId" || reference.sessionId !== session.sessionId || typeof reference.callId !== "string") return { ok: false, status: 403 as const, reason: "Command references must belong to the current preparation turn." };
        const command = (await this.deliveryCommands(session.sessionId)).find(command => command.callId === reference.callId);
        if (!command?.resultAt || Date.parse(command.calledAt) < Date.parse(session.runs[runIndex]!.startedAt)) return { ok: false, status: 422 as const, reason: "The current preparation command has no retained terminal result." };
      } else return { ok: false, status: 400 as const, reason: "Unknown preparation reference kind." };
    }
    const previous = state.submissions.find(row => row.bindingId === binding.id && row.sessionId === session.sessionId && row.run === runIndex);
    if (previous && previous.digest !== digest) return { ok: false, status: 409 as const, code: "result_conflict", reason: "This preparation turn already submitted different references." };
    if (!previous) {
      if (state.stage !== "preparation" || !this.current?.processRunning || this.current.session?.sessionId !== session.sessionId) return { ok: false, status: 409 as const, reason: "Only the current preparation turn can submit new references." };
      if (this.commands.blocked || this.stopping) return { ok: false, status: 503 as const, code: "state_write_failed", reason: this.commands.fault ?? "Preparation ownership needs recovery." };
      state.submissions.push({ bindingId: binding.id, sessionId: session.sessionId, run: runIndex, references, digest });
      this.writeContinuationMetadata(() => this.save());
    }
    return { ok: true, status: 200 as const, disposition: state.verifiedCheckpoint ? "verified" : "submitted", checks: this.preparationStatus(body.executionId, body.phaseId)?.checks };
  }

  private preparationContext() {
    return { agentId: this.record.preparation ? this.agentOf(this.record.preparation.phaseId) : this.auditsAgent, record: this.record, stateDirectory: this.stateDirectory, git: this.git, env: this.options.env, signal: this.abort.signal, codex: this.options.tools.codex, sessionId: this.record.preparation && this.latestSession(this.record.preparation.phaseId)?.sessionId, transcriptPath: this.record.preparation ? findTranscripts(claudeConfigFolder(this.options.env), this.latestSession(this.record.preparation.phaseId)?.sessionId ?? "").main : undefined, authorizeCommands: () => this.authorizePreparationCommands(), save: () => { this.writeContinuationMetadata(() => this.save()); this.changed(); }, now: () => this.now().toISOString(), label: (name: string) => this.labelOf(name) };
  }

  /** Adapter shutdown has drained the scanner; every retained owner must also exit. */
  private async requirePreparationRelease(key: string, session: SessionRecord): Promise<void> {
    if (session.agentId === "codex") {
      const problems = this.codexSafetyProblems(key);
      if (problems.length) throw new Error(problems.join(" "));
      return;
    }
    const preparationRuns = this.record.preparation?.implementationRun ?? session.runs.length;
    for (const [index, run] of session.runs.slice(0, preparationRuns).entries()) {
      if (!run.live) continue; // Older adapters retain no descendant ownership evidence.
      const live = run.live;
      if (live.gateDirectory !== gateDirectory(this.stateDirectory, live.attemptId) || live.attemptId !== run.control?.attemptId || resolve(live.configRoot) !== resolve(claudeConfigFolder(this.environment))) throw new OwnershipError("ownership_unknown", "Restore the preparation attempt's process gate and Claude profile before retrying verification.");
      await requireExited(run);
      const target = readGate(live.gateDirectory).target;
      if (target.executionId !== this.record.executionId || target.activityKey !== key || target.sessionId !== session.sessionId || target.providerSessionId !== session.sessionId || target.attemptId !== live.attemptId) throw new OwnershipError("ownership_unknown", "Preparation process evidence belongs to another attempt.");
      for (const saved of eventsOfRun(this.stateDirectory, session, index)) await observeGate(live.gateDirectory, saved.event, saved.at);
      const transcript = findTranscripts(live.configRoot, session.sessionId).main;
      if (transcript) {
        const history = readTranscriptRecords<Record<string, unknown>>(transcript);
        const read = readTranscript(transcript);
        if (history.problem || read.problem) throw new OwnershipError("history_unavailable", "Restore readable preparation history before retrying verification.");
        for (const row of history.records) if (row.type === "user") await observeGate(live.gateDirectory, { ...row, tool_use_result: row.toolUseResult ?? row.tool_use_result }, typeof row.timestamp === "string" ? row.timestamp : undefined);
        await withGate(live.gateDirectory, state => {
          for (const call of read.calls) {
            const operation = call.id ? state.operations[call.id] : undefined;
            if (operation?.hookSettled && operation.name !== "Agent" && operation.name !== "Task" && call.result) operation.settled = true;
          }
        });
      }
      let gate = readGate(live.gateDirectory);
      if (gate.obstacle || gate.processObservations?.length) {
        await captureOwnedProcesses(live.gateDirectory, run.pid!, run.processStartTime!);
        gate = readGate(live.gateDirectory);
      }
      const pending = unsettled(gate);
      if (pending.length) throw new OwnershipError("takeover_pending", `Preparation still has unsettled work: ${pending.join(", ")}. Retry after it settles.`);
      for (const identity of gate.tracked) await requireExited({ pid: identity.pid, processStartTime: identity.startTime });
      await requireNoTerminal(this.environment, session.sessionId);
      if (JSON.stringify(readGate(live.gateDirectory)) !== JSON.stringify(gate)) throw new OwnershipError("takeover_pending", "Preparation process evidence changed during release checks; retry verification.");
    }
  }

  private async recheckPreparationAdmission(key: string, session: SessionRecord): Promise<void> {
    const state = this.record.preparation;
    if (!state || state.phaseId !== key || state.stage !== "implementation" || session.runs.length !== state.implementationRun) return;
    const read = await this.readPlan();
    if (!read.ok) throw new Error(read.problem);
    await this.requirePreparationRelease(key, session);
    if (!state.verifiedCheckpoint || (await preparationCheckpoint(this.preparationContext())).id !== state.verifiedCheckpoint.id) throw new Error("Prepared source/configuration moved after verification; dependent implementation remains held.");
    if (this.pauseDue || this.record.pause.activeSince) throw new Error("The pause control holds dependent implementation.");
  }

  private async advancePreparation(): Promise<Verdict> {
    const state = this.record.preparation!; const key = state.phaseId; const session = this.latestSession(key)!;
    this.checking = true; this.changed();
    try {
      const run = session.runs.at(-1)!;
      if (!run?.endedAt || run.interruptedAt || run.spawnError) throw new Error("The preparation provider has not settled. Resume it before verification.");
      await this.requirePreparationRelease(key, session);
      const read = await this.readPlan();
      if (!read.ok) throw new Error(read.problem);
      await this.refreshCodexConversations(key);
      if (this.codexSafetyProblems(key).length) throw new Error(this.codexSafetyProblems(key).join(" "));
      if (state.bindings.some(binding => !state.submissions.some(row => row.bindingId === binding.id && row.sessionId === session.sessionId && row.run === session.runs.length - 1))) throw new Error("Submit the pinned source references for every preparation binding, then return from the preparation turn.");
      const preparedPlan = readBaseline(this.stateDirectory, this.record.planReconciliation!.baselineId!).active;
      for (const binding of state.bindings.filter(binding => binding.repository === this.paths.repositoryName)) {
        const source = await observeGitPlan(this.git, this.worktreePath, this.paths.prdDirectoryFromRoot, binding.sourceRevision);
        const descendants = leavesOf(read.plan).filter(leaf => preparesPhase(binding, leaf.id));
        if (!descendants.length || descendants.some(leaf => !leaf.closed || !source.plan.phases.some(original => original.id === leaf.id && original.closed && !original.splitInto) || !completedPhaseScopeUnchanged(source, preparedPlan, leaf.id))) throw new Error("The pinned preparation source must still contain every prerequisite leaf's unchanged Closed scope. Reconcile the prerequisite documents before verification.");
      }
      await verifyPreparation(this.preparationContext());
      if (this.stopping || this.commands.blocked) return { kind: "stopped" };
      if (this.pauseDue || this.record.pause.activeSince) { if (!this.record.pause.activeSince) this.activatePause(); return { kind: "stopped" }; }
      if ((await preparationCheckpoint(this.preparationContext())).id !== state.verifiedCheckpoint!.id) throw new Error("The prepared checkpoint changed before implementation admission.");
      // Mark prerequisite receipts only after independent integration and project checks.
      const baseline = readBaseline(this.stateDirectory, this.record.planReconciliation!.baselineId!);
      const { id: _id, ...body } = baseline; void _id;
      for (const binding of state.bindings) for (const { id } of leavesOf(read.plan).filter(leaf => preparesPhase(binding, leaf.id))) {
        const receipt = body.completions[id] ??= { kind: "external", revision: binding.sourceRevision, repositories: {} };
        receipt.repositories ??= {};
        receipt.repositories[binding.repository] = { identity: binding.repositoryIdentity, revision: binding.sourceRevision };
      }
      for (const { id } of leavesOf(read.plan).filter(leaf => state.bindings.some(binding => preparesPhase(binding, leaf.id)))) if (!body.completions[id]!.scopeRepositories) {
        const binding = state.bindings.find(binding => binding.repository === this.paths.repositoryName && preparesPhase(binding, id));
        if (!binding) throw new Error(`Restore the PRD source binding for prerequisite ${id} before recording completed scope.`);
        const source = await observeGitPlan(this.git, this.worktreePath, this.paths.prdDirectoryFromRoot, binding.sourceRevision);
        body.completions[id]!.scopeRepositories = phaseRepositories(source, id);
      }
      const retained = this.writeContinuationMetadata(() => retainBaseline(this.stateDirectory, body));
      this.record.planReconciliation!.baselineId = retained.id;
      state.stage = "implementation"; state.implementationRun = session.runs.length; delete state.reason;
      this.writeContinuationMetadata(() => this.save());
      const cwd = this.workingDirectoryOf(session);
      const implementationId = this.judgedId(key);
      const prompt = preparationImplementationPrompt({ phaseId: implementationId, checkpoint: state.verifiedCheckpoint!.id, phasePrompt: phaseSessionPrompt(this.phasePromptValues(this.fileOf(implementationId) ?? "", cwd)) });
      const args = session.agentId === "codex" ? [] : resumeArguments(session.sessionId, session.initModel ?? session.model, session.effort, this.addDirs(cwd));
      this.checking = false;
      await this.runProcess(key, session, args, prompt, "resume", cwd, undefined, () => {
        // runProcess's billing/provider read precedes this final dispatch hook.
        if (this.pauseDue || this.record.pause.activeSince || this.stopping) return false;
        delete this.record.phases[key]!.stop; return true;
      });
      if (session.runs.length <= state.implementationRun) return { kind: "stopped" };
      return this.settleSession(key);
    } catch (error) {
      if (this.commands.fault) throw error;
      state.reason = (error as Error).message;
      if (!this.stopping) this.recordStop(key, "done_check", [{ name: "Prerequisite preparation", passed: false, facts: [state.reason] }]);
      return { kind: "stopped" };
    } finally { this.checking = false; this.current = undefined; this.changed(); }
  }

  private async runPullRequestSession(): Promise<Verdict> {
    this.phaseFacts(PR_PHASE_KEY);
    // The prompt and saved block read the limits in force, the same as the ones frozen next.
    const values = await this.pullRequestPromptValues(this.sessionFolder);
    const prompt = pullRequestSessionPrompt(values);
    // The limits are held from the first pull request session on; the launch's own write saves them (AC-CHOICE-02).
    this.freezeLimits();
    this.emit({ kind: "pull_request", at: this.now(), event: "started" });
    await this.launchSession(PR_PHASE_KEY, "pull_request", prompt, { deliveryBlock: values.deliveryBlock });
    return this.settleSession(PR_PHASE_KEY);
  }

  /**
   * Launches one session for a phase. The session record is written before spawning; a session
   * recorded but never started (Kiln stopped in between) is launched as planned, same ID.
   */
  private async launchSession(phaseKey: string, kind: SessionRecord["kind"], prompt: string, options: { started?: () => boolean; startedAs?: "carry_on"; deliveryBlock?: string; relaunchOf?: SessionRecord["relaunchOf"] } = {}): Promise<void> {
    // Change is unavailable from the launch's decision until the launch ends (Kiln Phase Model Tiers, "Change while a launch of the activity is under way").
    this.launching.add(phaseKey);
    try { await this.launchSessionNow(phaseKey, kind, prompt, options); }
    finally { this.launching.delete(phaseKey); this.decisions.delete(phaseKey); this.changed(); }
  }

  /** The activities a launch is under way for, from its decision until it ends. */
  private readonly launching = new Set<string>();

  private async launchSessionNow(phaseKey: string, kind: SessionRecord["kind"], prompt: string, options: { started?: () => boolean; startedAs?: "carry_on"; deliveryBlock?: string; relaunchOf?: SessionRecord["relaunchOf"] }): Promise<void> {
    const facts = this.record.phases[phaseKey]!;
    const audit = this.auditActivity(phaseKey) ?? this.preflightActivity(phaseKey);
    const auditRecord = this.auditActivity(phaseKey);
    observeActivity(this.record, this.stateDirectory, phaseKey, auditRecord?.kind ?? (kind === "requirements" ? "requirements" : kind === "preflight" ? "preflight" : kind === "pull_request" ? "final_delivery" : kind === "merge" ? "merge" : kind === "plan_push" ? "plan_push" : "implementation"), this.now().toISOString(), audit?.activityId);
    // A session launch waits for an addition under way, so it gets the workspace as it ends.
    await this.additionChain;
    // The launch decision reads the activity's histories first while it has no saved start; one whose start is unknown launches nothing (Kiln Phase Model Tiers, "When an Activity Starts").
    if (this.choiceActivity(phaseKey) && !this.startedSessionOf(phaseKey) && facts.sessionIds.length && await this.readStart(phaseKey) === "unknown") { this.stopOnUnknownStart(phaseKey); return; }
    // A launch that didn't come through the launch checks (Start again, a carry-on) decides here (AC-FALLBACK-02).
    if (!await this.ensureDecision(phaseKey, !!options.relaunchOf)) return;
    // Only the next launch reads the phase's last record, reusing it when it has no run (run restart "A session record with no run").
    let session = this.lastRecord(phaseKey);
    // Each launch runs on its activity's own choice: what it started on, else its current one (Kiln Phase Model Tiers AC-PICK-01, AC-PICK-04).
    const choice = this.launchChoice(phaseKey);
    const { model, effort } = choice;
    if (session && session.runs.length === 0 && (session.agentId !== choice.agentId || session.model !== model || session.effort !== effort)) {
      // A record with no run takes the choice of the launch that reuses it.
      session.agentId = choice.agentId; session.model = model; session.modelDisplayName = choice.modelName;
      if (effort === undefined) delete session.effort; else session.effort = effort;
      writeSessionRecord(this.options.stateDirectory, session);
    }
    if (!session || session.runs.length > 0) {
      session = {
        schemaVersion: SCHEMA_VERSION,
        executionId: this.record.executionId!,
        outputGeneration: randomUUID(),
        agentId: choice.agentId,
        sessionId: randomUUID(),
        phaseId: audit ? "" : phaseKey,
        ...(audit ? { activityId: audit.activityId } : {}),
        kind,
        createdAt: this.now().toISOString(),
        model,
        modelDisplayName: choice.modelName,
        ...(effort === undefined ? {} : { effort }),
        workingDirectory: this.sessionFolder,
        runs: [],
        sleeps: [],
        steps: [],
      };
      writeSessionRecord(this.options.stateDirectory, session);
      facts.sessionIds.push(session.sessionId);
      if (auditRecord) auditRecord.sessionIds.push(session.sessionId);
      this.save();
    }
    // The launch decision is saved on the session before its process starts (Kiln Phase Model Tiers, "The launch decision").
    const decided = this.decisions.get(phaseKey);
    if (decided || session.launch) {
      if (decided) session.launch = decided.launch; else delete session.launch;
      writeSessionRecord(this.options.stateDirectory, session);
    }
    // Every launch says how its run started, including a reused record a carry-on left (run restart "A session record with no run").
    if (session.startedAs !== options.startedAs) {
      if (options.startedAs) session.startedAs = options.startedAs; else delete session.startedAs;
      writeSessionRecord(this.options.stateDirectory, session);
    }
    // A launch at the end of a wait records the refused run it follows (Kiln Phase Model Tiers, "A Wait Before the Start").
    if (options.relaunchOf || session.relaunchOf) {
      if (options.relaunchOf) session.relaunchOf = options.relaunchOf; else delete session.relaunchOf;
      writeSessionRecord(this.options.stateDirectory, session);
    }
    // A pull request session's block is saved before its process starts, as the block it was given (AC-LEFT-01).
    if (options.deliveryBlock !== undefined) { session.deliveryBlock = { block: options.deliveryBlock, run: session.runs.length }; writeSessionRecord(this.options.stateDirectory, session); }
    const cwd = this.workingDirectoryOf(session);
    await this.runProcess(phaseKey, session, launchArguments(session.sessionId, session.model, session.effort, this.addDirs(cwd)), prompt, "launch", cwd, undefined, options.started);
  }

  /** An activity whose model choice binds when it starts: anything but a merge or a push after delivery. */
  choiceActivity(key: string): boolean { return !isAfterDeliveryKey(key); }

  /** Whether the next session of an activity is a new one: it hasn't started, so nothing is reopened (AC-PICK-07). */
  launchesNewSession(key: string): boolean { return this.choiceActivity(key) && !this.startedSessionOf(key) && (this.record.phases[key]?.sessionIds.length ?? 0) > 0; }

  /** Why an activity's start is unknown: a session's history exists but couldn't be read (Kiln Phase Model Tiers, "When an Activity Starts"). */
  readonly unknownStarts = new Map<string, string>();

  /**
   * Reads the agents' own histories for an unfinished activity with no saved start (Kiln Phase
   * Model Tiers, "When an Activity Starts"), once each session's last process has ended: Claude
   * Code's saved conversation file, or the Codex thread's turns, by the same test as the saved
   * events. A start found is saved on its session, and the activity's start with it; only after
   * every read succeeded does the activity count as not started. A finished activity is never read.
   */
  async readStart(key: string): Promise<"started" | "not_started" | "unknown"> {
    if (this.startedSessionOf(key)) { this.unknownStarts.delete(key); return "started"; }
    const facts = this.record.phases[key];
    if (!facts || facts.doneAt || !this.choiceActivity(key)) return "not_started";
    let unreadable: string | undefined;
    for (const id of facts.sessionIds) {
      const session = this.sessionRecord(key, id);
      // A session no run of which was dispatched has no history to read.
      if (!session || session.firstResponseAt || !session.runs.some(run => run.pid !== undefined && !codexNotDispatched(run))) continue;
      if (this.current?.phaseKey === key && this.current.processRunning) continue;
      const found = session.agentId === "codex"
        ? await codexHistoryStart({ executable: this.options.tools.codex, cwd: this.workingDirectoryOf(session), env: this.options.env, session, signal: this.abort.signal })
        : claudeHistoryStart(claudeConfigFolder(this.options.env), session.sessionId);
      if (found.state === "unreadable") { unreadable ??= found.reason; continue; }
      if (found.state === "responded") {
        session.firstResponseAt = found.at;
        writeSessionRecord(this.options.stateDirectory, session);
        this.noteStart(key, session);
        this.unknownStarts.delete(key);
        this.changed();
        return "started";
      }
    }
    if (unreadable !== undefined) { this.unknownStarts.set(key, unreadable); this.changed(); return "unknown"; }
    this.unknownStarts.delete(key);
    return "not_started";
  }

  /** The history read at load, for every unfinished activity with sessions and no saved start, before anything launches. */
  private async readStartsOnLoad(): Promise<void> {
    for (const [key, facts] of Object.entries(this.record.phases)) {
      if (facts.doneAt || facts.startedSessionId || !facts.sessionIds.length || !this.choiceActivity(key)) continue;
      await this.readStart(key);
    }
  }

  /** Kiln launches nothing for an activity whose start is unknown; the stop gives the reason, with Check again. */
  private stopOnUnknownStart(key: string): void {
    const facts = this.record.phases[key]!;
    this.checking = false;
    if (facts.wait) { delete facts.wait; this.unwatchWait(); }
    this.current = undefined;
    this.recordStop(key, "selection", [{ name: START_CHECK, passed: false, facts: [`Kiln can't tell whether this activity has started, so it launches nothing for it. ${this.unknownStarts.get(key) ?? ""}`.trim()] }]);
    this.changed();
  }

  /**
   * An activity that hasn't started goes on in a new session on its current choice (AC-PICK-07):
   * the person's Resume or reply, `kiln resume` or `kiln reply`, Kiln's own resume after an
   * interruption, or the end of a wait. With a reply, the new session gets the carry-on prompt
   * carrying it, the last recorded message and the phase's work; without one, the activity's
   * ordinary prompt. A launch ending a wait records the refused run it follows. The stop or the
   * wait ends as the run starts.
   */
  private async launchFresh(key: string, request: ResumeRequest | undefined): Promise<void> {
    const facts = this.record.phases[key]!;
    const note = request?.note;
    const refused = request?.cause === "limit_resume" ? this.refusedRun(key) : undefined;
    const relaunchOf = refused ? { sessionId: refused.session.sessionId, run: refused.runIndex } : undefined;
    const started = () => {
      if (request?.cause === "limit_resume" && facts.wait !== undefined && !this.record.settings.resumeAfterUsageLimit) {
        this.waitToStop(key, facts.wait.checks, facts.wait.checkedAt);
        this.checking = false;
        this.changed();
        return false;
      }
      delete facts.stop;
      if (facts.wait !== undefined) { delete facts.wait; this.unwatchWait(); }
      this.checking = false;
      this.stoppedWork = undefined;
      return true;
    };
    this.current = { phaseKey: key, commits: [], processRunning: false };
    this.changed();
    // A new session runs the launch checks for the agent its current choice names (AC-AGENTS-04).
    const waiting = facts.wait;
    if (!await this.launchReadiness(key, { endsWait: request?.cause === "limit_resume" })) {
      if (waiting && facts.stop) { delete facts.wait; this.unwatchWait(); this.save(); }
      this.checking = false;
      this.changed();
      return;
    }
    const requirements = this.record.requirements?.stages.find(stage => key === `req-${stage.activityId}`);
    if (requirements) { await this.launchRequirementStage(requirements, { started, ...(relaunchOf ? { relaunchOf } : {}) }); return; }
    if (isPreflightKey(key)) { await this.launchPreflightAtStop(key, { started, ...(relaunchOf ? { relaunchOf } : {}) }); return; }
    const audit = this.auditActivity(key);
    if (!audit && key !== PR_PHASE_KEY) {
      await this.launchAtStop({ phaseKey: key, kind: note ? "carry_on" : "start_again", ...(note ? { note } : {}) }, { started, ...(relaunchOf ? { relaunchOf } : {}) });
      return;
    }
    await this.recordStartCommits(key);
    const carry = async (fresh: string) => {
      if (!note) return fresh;
      const earlier = this.recoverySession(key);
      const lastMessage = earlier && lastRecordedRun(earlier)?.result?.text;
      return carryOnPrompt({ freshSession: fresh, note, ...(lastMessage ? { lastMessage } : {}), work: [], multiRepository: this.setUpRepositories.length > 1 });
    };
    if (audit) {
      const prompt = await carry(this.auditPrompt(audit));
      if (this.stopping) { this.checking = false; return; }
      this.emitAudit(audit, "started");
      await this.launchSession(key, audit.kind, prompt, { started, ...(relaunchOf ? { relaunchOf } : {}) });
      return;
    }
    const values = await this.pullRequestPromptValues(this.sessionFolder);
    const prompt = await carry(pullRequestSessionPrompt(values));
    if (this.stopping) { this.checking = false; return; }
    this.freezeLimits();
    this.emit({ kind: "pull_request", at: this.now(), event: "started" });
    await this.launchSession(PR_PHASE_KEY, "pull_request", prompt, { started, deliveryBlock: values.deliveryBlock, ...(relaunchOf ? { relaunchOf } : {}) });
  }

  /**
   * Whether a command that reopens one of the activity's saved conversations may be offered
   * (AC-PICK-07): always for a started activity; for one that hasn't started, only while its
   * current choice is the agent, model and effort that session ran on. Otherwise the terminal gets
   * the command for a fresh session on its current choice's agent.
   */
  reopenMatchesChoice(key: string, session: SessionRecord): boolean {
    if (!this.choiceActivity(key) || this.startedSessionOf(key)) return true;
    const choice = this.notStartedChoice(key);
    return choice.agentId === (session.agentId ?? "claude_code") && choice.model === session.model && (choice.effort ?? undefined) === (session.effort ?? undefined);
  }

  /**
   * The agent whose account a wait or usage-limit stop watches (AC-AGENTS-04): a started activity's
   * refused session's; for one that hasn't started, the agent of the choice its next launch runs on.
   */
  waitAgent(key: string): AgentId {
    if (!this.choiceActivity(key) || this.startedSessionOf(key)) return this.refusedRun(key)?.session.agentId ?? "claude_code";
    return this.agentOf(key);
  }

  /**
   * Resumes a session with its full history (AC-KEEP-04): the same session ID, its own concrete
   * model and recorded effort, and the resume prompt as its first message. An interrupted session
   * Kiln resumes by itself gets v1's openings. With `request`, the stopped session the person
   * pressed Resume for (usage-limit recovery AC-RESUME-02, 03): the opening for a session that
   * ended on its own, or an interruption's after multi-repo delivery's interrupted Needs you; any
   * note first. The end of a wait is the same, with `limit_resume` (usage-limit recovery
   * AC-AUTO-02); after a usage limit the opening says so. Before any of these, the account is
   * read again (awaited, 30 seconds at most) and the run records it. Its stop or wait, and
   * `checking`, are cleared as the run starts.
   */
  private async resumeSession(phaseKey: string, request?: ResumeRequest): Promise<void> {
    // The person's resume reopens the latest conversation; Kiln's own resumes the attempt that just ended (run restart "Resuming after a failed launch").
    const session = request ? this.recoverySession(phaseKey) : this.latestSession(phaseKey);
    if (!session) return;
    // The one place the engine dispatches a session: an activity that hasn't started has no
    // conversation to pick up, so it goes on in a new session on its current choice (AC-PICK-07).
    if (this.choiceActivity(phaseKey) && !this.startedSessionOf(phaseKey)) {
      if (this.record.liveControl) {
        try { await this.requireTakeoverReturn(); }
        catch (error) { this.checking = false; this.record.liveControl.takeover.reason = (error as Error).message; this.save(); return; }
      } else await this.stopLiveProcess(session);
      if (this.stopping) return;
      const start = await this.readStart(phaseKey);
      if (this.stopping) return;
      if (start === "unknown") { this.stopOnUnknownStart(phaseKey); return; }
      if (start === "not_started") { await this.launchFresh(phaseKey, request); return; }
    }
    const priorInspectionOwner = this.inspectionResumingSession;
    this.inspectionResumingSession = session.sessionId;
    try {
    if (this.record.liveControl) {
      try { await this.requireTakeoverReturn(); }
      catch (error) { this.checking = false; this.record.liveControl.takeover.reason = (error as Error).message; this.save(); return; }
    } else await this.stopLiveProcess(session);
    if (this.stopping) return;
    const reconciled: PlanRead = isAfterDeliveryKey(phaseKey) || activityKeyKind(phaseKey) === "requirements" ? { ok: true } as PlanRead : await this.readPlan();
    if (!reconciled.ok) {
      this.checking = false;
      if (!this.record.phases[phaseKey]?.stop && !this.record.phases[phaseKey]?.wait) this.recordStop(phaseKey, phaseKey === PR_PHASE_KEY ? "pull_request_check" : "done_check", [planCheck(reconciled)]);
      this.current = undefined; this.changed(); return;
    }
    // A preflight whose conversation cannot be reopened has ended: it is read as any ended run, never stopped as not resumable (Reading the Result).
    if (this.preflightActivity(phaseKey) && !request) {
      if (session.agentId === "codex") await this.readCodexAvailability(session);
      if (this.transcriptMissing(session)) { this.checking = false; return; }
    }
    if (session.agentId === "codex") {
      await this.readCodexAvailability(session);
      if (this.codexSafetyProblems(phaseKey, false).length || this.transcriptMissing(session)) {
        this.checking = false;
        this.recordStop(phaseKey, this.transcriptMissing(session) ? "not_resumable" : phaseKey === PR_PHASE_KEY ? "pull_request_check" : "done_check", [{ name: "Codex recovery", passed: false, facts: [...this.codexSafetyProblems(phaseKey), ...(session.codex?.resumeError ? [session.codex.resumeError] : [])] }]);
        return;
      }
    }
    if (session.agentId !== "codex" && this.transcriptMissing(session)) {
      this.checking = false;
      this.recordStop(phaseKey, "not_resumable", [{ name: "Claude recovery", passed: false, facts: ["The saved conversation has no usable history. Use the fresh-session recovery instructions."] }]);
      return;
    }
    const facts = this.record.phases[phaseKey]!;
    const account = request === undefined || session.agentId === "codex" ? undefined : await this.readAccountBeforeResume();
    if (this.stopping) return;
    const runIndex = session.runs.length - 1;
    const run = session.runs[runIndex]!;
    const endedOnItsOwn = request !== undefined && facts.stop?.interrupted === undefined;
    const refusal = request === undefined ? undefined : run.limitRefusal;
    const recorded = run.interruptedBy !== undefined && run.interruptedAt !== undefined;
    const time = endedOnItsOwn ? (run.endedAt ?? run.startedAt) : recorded ? run.interruptedAt! : (runLastOutputAt(this.options.stateDirectory, session, runIndex) ?? run.startedAt);
    const cwd = this.workingDirectoryOf(session);
    const multi = cwd !== this.worktreePath;
    const label = facts.stop?.limit?.label ?? refusal?.label;
    const auditTask = this.auditRecoveryTask(phaseKey, cwd);
    // Every resume of a pull request session carries the block Kiln would give now, saved on the session before its process starts (AC-LEFT-01).
    const block = phaseKey === PR_PHASE_KEY ? this.deliveryBlockNow() : undefined;
    const prompt = resumePrompt({
      deliveryAuthority: this.deliveryAuthority(),
      agentId: session.agentId ?? "claude_code",
      ...(refusal !== undefined && endedOnItsOwn ? { usageLimit: label === UNKNOWN_LIMIT_LABEL || label === undefined ? "" : limitSentence(label) } : {}),
      ...(endedOnItsOwn ? { endedOnItsOwn: true } : recorded ? { cause: run.interruptedBy! } : {}),
      time: time.replace(/\.\d+Z$/, "Z"),
      ...(activityKeyKind(phaseKey) === "requirements" ? { requirementsStage: true } : phaseKey === MERGE_KEY ? { mergeTask: { pullRequests: this.mergePullRequests(this.record.afterDelivery?.merge?.pullRequests) } } : isPlanPushKey(phaseKey) ? { planPushTask: { checkout: cwd, baseBranch: this.planPushBase } } : auditTask ? { auditTask } : this.preflightActivity(phaseKey) ? { preflightTask: { prdFile: this.pathFrom(cwd, this.prdFile()), skillPath: this.preflightActivity(phaseKey)!.skill?.path ?? PREFLIGHT_SKILL } } : phaseKey === PR_PHASE_KEY ? {} : { phaseDoc: this.pathFrom(cwd, `${this.paths.prdDirectoryFromRoot}/${this.fileOf(phaseKey) ?? ""}`) }),
      multiRepository: phaseKey === PR_PHASE_KEY ? this.pullRequestRepositories().length > 1 : multi,
      ...(request?.note === undefined ? {} : { note: request.note }),
      ...(block === undefined ? {} : { deliveryBlock: block }),
    });
    if (block !== undefined) { session.deliveryBlock = { block, run: session.runs.length }; writeSessionRecord(this.options.stateDirectory, session); }
    if (!request) this.emitSessionEvent(phaseKey, "resumed");
    // The stop or wait ends as the run starts, and with it the hold on Resume, Resume now and Check
    // again; the end of a wait switched off by then is that stop instead, and nothing runs (AC-AUTO-04).
    const started = request
      ? () => {
          if (request.cause === "limit_resume" && facts.wait !== undefined && !this.record.settings.resumeAfterUsageLimit) {
            this.waitToStop(phaseKey, facts.wait.checks, facts.wait.checkedAt);
            this.checking = false;
            this.changed();
            return false;
          }
          this.emitSessionEvent(phaseKey, "resumed");
          delete facts.stop;
          if (facts.wait !== undefined) {
            delete facts.wait;
            this.unwatchWait();
          }
          this.checking = false;
          return true;
        }
      : undefined;
    // A resumed run gets the flags for the workspace as it now stands.
    const args = session.agentId === "codex" ? [] : resumeArguments(session.sessionId, session.initModel ?? session.model, session.effort, this.addDirs(cwd));
    const preparing = this.preparingTurn(phaseKey);
    if (preparing && !await this.restartPreparationTurn(phaseKey)) return;
    const actualPrompt = preparing ? this.preparationTask(request?.note) : prompt;
    await this.runProcess(phaseKey, session, args, actualPrompt, request?.cause ?? "resume", cwd, request?.note, started, account);
    } catch (error) {
      if (this.record.preparation?.phaseId !== phaseKey || this.commands.fault || this.stopping) throw error;
      this.record.preparation.reason = (error as Error).message;
      this.recordStop(phaseKey, "done_check", [{ name: "Preparation recovery", passed: false, facts: [(error as Error).message] }]); this.current = undefined; this.checking = false; this.changed();
    } finally { this.inspectionResumingSession = priorInspectionOwner; }
  }

  /**
   * The account and usage read again just before a resume (usage-limit recovery "Resume"),
   * awaited for 30 seconds at most: the account it found signed in, which the run records.
   */
  private async readAccountBeforeResume(): Promise<AccountIdentity | undefined> {
    const claude = this.claude;
    if (!claude) return undefined;
    const returned = await raceTimeout(claude.refreshAccount(), RESUME_READING_MS);
    const reading = claude.account;
    return returned && reading !== undefined ? readingAccount(reading) : undefined;
  }

  /** Set while a process run that cleared its phase's stop has not yet returned, so a takeover reconciliation doesn't record the stop again (run restart AC-CARRY-06). */
  private launchClearedStop: string | undefined;

  /**
   * Runs one process of a session, holding keep-awake while it runs and reading sleep around it;
   * `started` runs just before it becomes the current phase's, and returning false stops it there.
   */
  private async runProcess(
    phaseKey: string,
    session: SessionRecord,
    args: string[],
    prompt: string,
    cause: SessionRun["cause"],
    cwd: string,
    note?: string,
    started?: () => boolean,
    account?: AccountIdentity,
  ): Promise<void> {
    try { await this.runProcessOnce(phaseKey, session, args, prompt, cause, cwd, note, started, account); }
    finally { if (this.launchClearedStop === phaseKey) this.launchClearedStop = undefined; }
  }

  private async runProcessOnce(
    phaseKey: string,
    session: SessionRecord,
    args: string[],
    prompt: string,
    cause: SessionRun["cause"],
    cwd: string,
    note?: string,
    started?: () => boolean,
    account?: AccountIdentity,
  ): Promise<void> {
    if (this.stopping) return;
    this.watchSleep();
    await this.readSleep(true);
    if (this.stopping) return;
    mkdirSync(this.workspaceFolder, { recursive: true });
    let launchEnv = this.sessionEnv();
    if (session.agentId !== "codex") {
      try {
        const inspection = await this.billing.refresh(cwd, launchEnv, args, true);
        launchEnv = inspection.launchEnv;
        if (this.stopping) return;
        const reason = inspection.readinessError ?? (cause === "launch" ? this.selectionIssue(phaseKey, true) : this.readers.claude_code.state.blockers.length ? this.readers.claude_code.state.blockers.join(" ") : undefined) ?? (inspection.summary.route === "metered" && !inspection.summary.approved ? "Review and approve this billing setup, or change its source and recheck." : undefined);
        if (reason) { this.holdBilling(phaseKey, session, cause, inspection.summary, reason); return; }
        this.billingLaunch = structuredClone(inspection.summary);
        // Each agent's billing shows its own latest launch (Kiln Phase Model Tiers, "Billing state").
        this.record.billing!.lastLaunch = { ...this.record.billing!.lastLaunch, [this.billingLaunch.agentId]: this.billingLaunch };
        delete this.record.billing!.hold;
        this.save();
      } catch (error) {
        if (this.stopping) return;
        const observed = this.billing.view.next ?? this.record.billing!.current?.summary;
        if (observed) this.holdBilling(phaseKey, session, cause, observed, error instanceof BillingError ? error.message : "Billing inspection failed. Recheck Claude settings.");
        else throw error;
        return;
      }
    }
    if (this.record.liveControl && this.returningTakeover && await this.takeoverBecameComplete(phaseKey)) return;
    // Both additions go at the end of every launch and resume prompt, after the billing check (run restart "Catching a Branch Up").
    // Awaited only when there is something to add, so an ordinary launch reaches dispatch without yielding.
    const additions = this.hasPromptAdditions() ? await this.promptAdditions(session.sessionId) : (this.pendingTell = undefined, "");
    if (additions) prompt = `${prompt}\n\n${additions}`;
    if (this.commands.blocked || this.stopping || session.agentId !== "codex" && started?.() === false) return;
    if (started && session.agentId !== "codex") this.launchClearedStop = phaseKey;
    if (!this.controlDispatch) this.controlDispatch = this.commands.beginAutomatic(`${this.record.executionId}:${phaseKey}:${session.sessionId}:${session.runs.length}`);
    const dispatchedControl = this.controlDispatch;
    if (dispatchedControl) {
      dispatchedControl.stage = "dispatching"; dispatchedControl.session_id = session.sessionId; dispatchedControl.phase_key = phaseKey; dispatchedControl.attempt_id = randomUUID();
      dispatchedControl.effects.session = "starting";
      try { this.commands.checkpoint(dispatchedControl); }
      catch (error) {
        // No provider was started. Retain the journal fault and report this
        // failed dispatch without letting its rejected write kill inspection.
        dispatchedControl.effects.session = "not_started";
        if (dispatchedControl.reply_text !== null) dispatchedControl.effects.reply = "not_sent";
        try { this.commands.finishAutomatic(dispatchedControl); } catch { /* Journal fault keeps dispatch blocked. */ }
        this.controlDispatch = undefined;
        this.emit({ kind: "message", text: (error as Error).message });
        return;
      }
    }
    let live: SessionRun["live"];
    if (session.agentId !== "codex" && phaseKey !== PR_PHASE_KEY && process.platform === "darwin") {
      // Live control eligibility: every Claude Code at or above the minimum on macOS. The
      // version is recorded for diagnostics and notices, never compared for equality.
      const version = await runHelper(this.options.tools.claude, ["--version"], { cwd, env: launchEnv, timeoutMs: 5000 });
      const reading = version.exitCode === 0 ? compareToMinimum("claudeCode", version.stdout) : undefined;
      if (reading?.state === "supported") {
        const agentVersion = reading.version!;
        const message = liveContractAtLaunch(this.record, "live_messages", agentVersion);
        const hook = liveContractAtLaunch(this.record, "takeover", agentVersion);
        if (message.changed || hook.changed) { this.save(); this.changed(); }
        const attemptId = dispatchedControl!.attempt_id!;
        const activity = activityHistory(this.record, this.stateDirectory).findLast(a => a.key === phaseKey)!;
        const target: LiveTarget = { executionId: this.record.executionId!, activityId: activity.activityId, activityKey: phaseKey, sessionId: session.sessionId, providerSessionId: session.sessionId, attemptId };
        const directory = gateDirectory(this.stateDirectory, attemptId);
        createGate(directory, target);
        live = { attemptId, gateDirectory: directory, configRoot: claudeConfigFolder(launchEnv), profile: `claude-code-${agentVersion}/darwin`, agentVersion, literalInput: message.contract === "unproven", messageContract: message.contract, hookContract: hook.contract };
        // A contract a notice already names for this version launches without its argument.
        if (message.contract === "unproven") args = [...args, "--replay-user-messages"];
        if (hook.contract === "unproven") {
          const hooks = Object.fromEntries(["PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch"].map(event => [event, [{ hooks: [{ type: "command", command: process.execPath, args: [fileURLToPath(new URL("../live/checkpoint-hook.js", import.meta.url)), directory], timeout: 10, onFailure: "block" }] }]]));
          args = [...args, "--settings", JSON.stringify({ hooks })];
        }
      } else if (reading?.state !== "below_minimum") {
        // Version comparison: a version Kiln can't read turns live control off for this attempt
        // with a notice for each feature, giving the version as `unrecognised` (AC-AGENT-04).
        const detail = version.exitCode === 0 ? "its --version output is not a version Kiln recognises" : "claude --version failed";
        const unread = { agentVersion: "unrecognised", attemptId: dispatchedControl!.attempt_id! };
        const observedAt = this.now().toISOString();
        let changed = false;
        for (const feature of ["live_messages", "takeover"] as const) changed = writeNotice(this.record, liveNotice(unread, feature, detail, observedAt)) || changed;
        if (changed) { this.save(); this.changed(); }
      }
    }
    if (this.record.liveControl) {
      const carryOn = !!this.record.liveControl.takeover.history;
      try { await (carryOn ? this.requireCarryOnOwnership() : this.requireTakeoverReturn()); }
      catch (error) {
        this.checking = false;
        if (carryOn) {
          // A carry-on from a hold that fails its ownership check fails the command and starts nothing (AC-CARRY-06).
          if (dispatchedControl) { dispatchedControl.effects.session = "not_started"; dispatchedControl.outcome = error instanceof OwnershipError ? error.code : "ownership_unknown"; dispatchedControl.reason = (error as Error).message; this.commands.checkpoint(dispatchedControl); }
          this.controlDispatch = undefined;
          this.returningTakeover = false;
        } else this.record.liveControl.takeover.reason = (error as Error).message;
        this.save(); this.changed(); return;
      }
    }
    if (cause !== "launch" && session.agentId !== "codex" && this.transcriptMissing(session)) {
      this.checking = false;
      this.recordStop(phaseKey, "not_resumable", [{ name: "Claude recovery", passed: false, facts: ["The saved conversation has no usable history. Use the fresh-session recovery instructions."] }]);
      if (dispatchedControl) {
        dispatchedControl.effects.session = "not_started";
        if (dispatchedControl.reply_text !== null) dispatchedControl.effects.reply = "not_sent";
        this.commands.checkpoint(dispatchedControl);
        this.commands.finishAutomatic(dispatchedControl);
      }
      this.controlDispatch = undefined;
      return;
    }
    const current: CurrentPhase = { phaseKey, session, commits: [], processRunning: true };
    this.current = current;
    this.interruptedKey = undefined;
    if (started && session.agentId !== "codex") this.save();
    this.updateKeepAwake();
    this.changed();
    // A missing folder given with --add-dir is silently dropped, so the workspace folder is made first; it is outside every checkout.
    mkdirSync(this.workspaceFolder, { recursive: true });
    const liveExitTarget = live ? readGate(live.gateDirectory).target : undefined;
    let dispatchFailed = false;
    try {
      await this.recheckPreparationAdmission(phaseKey, session);
      if (session.agentId === "codex") {
      await this.runCodexProcess(current, session, prompt, cause, cwd, note, started);
    } else await runSessionProcess({
      claude: this.options.tools.claude,
      args,
      cwd,
      env: launchEnv,
      ...(this.billingLaunch ? { billing: this.billingLaunch } : {}),
      prompt,
      cause,
      ...(note === undefined ? {} : { note }),
      ...(account === undefined ? {} : { account }),
      stateDirectory: this.options.stateDirectory,
      record: session,
      ...(live ? { live,
        onLiveEvent: async (event: Record<string, unknown>, at: string) => { if (await this.observeMessageContract(session, live, event)) { this.observeLiveMessage(readGate(live.gateDirectory).target, event, at); this.observeFeedbackReceipt(session.sessionId, event, at); } this.observeHookContract(session, live); },
        onLiveExit: () => { this.observeHookContract(session, live); this.endLiveMessages(liveExitTarget!); },
        onLiveArgumentRejected: (argument: string) => this.recordRejectedLiveArgument(live, argument) } : {}),
      ...(this.record.liveControl ? { beforePrompt: async (identity: { pid: number; startTime: string }) => {
        const local = this.takeoverLocalMaterial(phaseKey);
        if (await this.takeoverBecameComplete(phaseKey)) throw new TakeoverAlreadyComplete();
        // A carry-on from a hold checks the hold's conversation, and reads no history of either conversation (AC-CARRY-06).
        const carryOn = !!this.record.liveControl?.takeover.history;
        // Only a launch that reopens the conversation reads its history; a fresh session for an
        // activity that hasn't started has none before its first prompt, so it checks the held
        // conversation for a terminal instead, as a carry-on does (AC-PICK-07).
        const reopens = args.includes("--resume");
        const conversation = carryOn || !reopens ? this.record.liveControl!.takeover.target.providerSessionId : session.sessionId;
        try { await requireNoTerminal(launchEnv, conversation, identity); }
        catch (error) { if (carryOn && error instanceof OwnershipError && error.code !== "terminal_in_use") throw new OwnershipError("ownership_unknown", error.message); throw error; }
        if (local !== this.takeoverLocalMaterial(phaseKey)) {
          if (await this.takeoverBecameComplete(phaseKey)) throw new TakeoverAlreadyComplete();
          throw new CompletionCheckUnavailable("Activity material changed before the first prompt. Retry hand-back.");
        }
        // Final synchronous admission after the async checks, using this dispatch's profile.
        if (!carryOn && reopens) requireHistory(launchEnv, session.sessionId);
      } } : {}),
      ...(dispatchedControl ? { control: { operationId: dispatchedControl.id, attemptId: dispatchedControl.attempt_id!, promptDigest: createHash("sha256").update(prompt).digest("hex") } } : {}),
      now: this.now,
      exitGraceMs: this.options.exitGraceMs ?? (process.platform === "win32" ? WINDOWS_EXIT_GRACE_MS : 0),
      onReader: (reader) => (current.reader = reader),
      onSpawned: (control) => {
        this.control = control;
        // A stop that began while the process was being started still reaches it.
        if (this.stopping) control.interrupt();
      },
      beforeEnd: () => this.readSleep(false),
      stopping: () => this.stopping !== undefined,
      onOutput: (lines) => {
        current.latestLine = lines[lines.length - 1]!;
        for (const listener of this.outputListeners) listener(session.sessionId, lines);
        void this.refreshCommits(current, false);
        this.changed();
      },
      onPartial: (partial) => {
        for (const listener of this.partialListeners) listener(session.sessionId, partial);
      },
      onRecordChange: () => { this.observeControlDispatch(session); this.markTold(session); this.noteStart(phaseKey, session); this.changed(); },
    });
    } catch (error) {
      if (error instanceof TakeoverAlreadyComplete) { this.controlDispatch = undefined; }
      else if (this.record.preparation?.phaseId === phaseKey && session.runs.length === this.record.preparation.implementationRun) {
        this.record.preparation.stage = "verification"; this.record.preparation.reason = (error as Error).message; this.recordStop(phaseKey, "done_check", [{ name: "Prepared checkpoint", passed: false, facts: [(error as Error).message] }]);
        if (dispatchedControl) { dispatchedControl.effects.session = "not_started"; dispatchedControl.reason = (error as Error).message; }
      }
      else if (error instanceof OwnershipError && session.runs.at(-1)?.control?.submitted !== true && dispatchedControl) {
        dispatchedControl.effects.session = "not_started"; dispatchedControl.outcome = error.code; dispatchedControl.reason = error.message;
      } else {
      if (!dispatchedControl) throw error;
      dispatchFailed = true;
      dispatchedControl.effects.session = "unknown";
      if (dispatchedControl.reply_text !== null) dispatchedControl.effects.reply = "unknown";
      dispatchedControl.reason = "The correlated provider attempt could not be durably recorded. Inspect its receipt before continuing.";
      }
    }
    if (!dispatchFailed) this.observeControlDispatch(session);
    this.markTold(session);
    if (this.pendingTell?.sessionId === session.sessionId) this.pendingTell = undefined;
    if (this.controlDispatch === dispatchedControl && dispatchedControl) {
      const run = session.runs.find(r => r.control?.operationId === dispatchedControl.id);
      const neverStarted = !run || !!run.spawnError && !run.pid || !dispatchFailed && !!run.endedAt && (session.agentId === "codex"
        ? codexNotDispatched(run)
        : !runReportedInit(this.stateDirectory, session, session.runs.indexOf(run)));
      dispatchedControl.effects.session = neverStarted ? "not_started" : "unknown";
      if (dispatchedControl.reply_text !== null) dispatchedControl.effects.reply = dispatchedControl.effects.session === "unknown" ? "unknown" : "not_sent";
      try { this.commands.finishAutomatic(dispatchedControl); } catch { /* Journal fault keeps dispatch blocked. */ }
      this.controlDispatch = undefined;
    }
    this.control = undefined;
    current.processRunning = false;
    this.updateKeepAwake();
    if (!this.stopping) await this.refreshCommits(current, true);
  }

  private observeControlDispatch(session: SessionRecord): void {
    const receipt = this.controlDispatch;
    if (!receipt) return;
    const run = session.runs.find(r => r.control?.operationId === receipt.id);
    if (!run?.control?.submitted || !(session.agentId === "codex" ? run.codex?.turnId : runReportedInit(this.stateDirectory, session, session.runs.indexOf(run)))) return;
    if (this.returningTakeover && this.record.liveControl) { this.resolveMessageHold(); delete this.record.liveControl; this.returningTakeover = false; this.save(); }
    receipt.effects.session = isStartingReceipt(receipt) ? "started" : "resumed";
    if (receipt.reply_text !== null) receipt.effects.reply = run.control.delivered ? "delivered" : "submitted";
    this.commands.checkpoint(receipt);
    this.commands.finishAutomatic(receipt);
    this.controlDispatch = undefined;
  }

  private holdBilling(phaseKey: string, session: SessionRecord, cause: SessionRun["cause"], observed: BillingSummary, reason: string): void {
    const facts = this.record.phases[phaseKey];
    // The retained stop's or wait's rows, plus Billing approval inside the run only for an activity that has not run (waivers "Check Runs").
    const rows = structuredClone(facts?.stop?.checks ?? facts?.wait?.checks ?? []);
    // A hold reaches Needs you without recordStop, so it prints its own line, unless the person was already there.
    const alreadyNeedsYou = facts?.stop !== undefined || this.record.billing!.hold !== undefined;
    this.record.billing!.hold = { phaseKey, action: cause === "launch" ? "launch" : "resume", sessionId: session.sessionId, reason, observed: structuredClone(observed), at: this.now().toISOString(), run: this.newRun("stop"), checks: markReasonRows(cause === "launch" ? [...rows, { name: "Billing approval", passed: false, facts: [reason] }] : rows) };
    this.checking = false; this.current = undefined; this.unwatchWait();
    this.save(); this.updateKeepAwake(); this.changed();
    void this.refreshRequestQuestions(phaseKey);
    if (!alreadyNeedsYou) this.emitSessionEvent(phaseKey, "stopped");
    this.emit({ kind: "message", text: `Billing hold: ${reason} Open Kiln's browser address above to review billing and continue.` });
  }

  private codexLaunchOptions(cwd: string) {
    const candidates = [cwd, ...this.addDirs(cwd)];
    // Codex removes nested grants from its effective profile. Request the same minimal
    // roots: the workspace and only assigned worktrees outside it, never their checkouts.
    const writableRoots = candidates.filter((path, index) => !candidates.some((other, otherIndex) => index !== otherIndex && isWithin(comparable(realPathOfNearestAncestor(path)), comparable(realPathOfNearestAncestor(other)))));
    return {
      executable: this.options.tools.codex!, cwd, writableRoots,
      // A push session's one assigned checkout is the main checkout, on the base branch it pushes (Kiln After Delivery, "Gates").
      repositories: openPlanPush(this.record) ? [{ path: expandHome(this.record.repository.mainCheckoutPath), branch: this.planPushBase }] : this.sessionRepositories.map(entry => ({ path: expandHome(entry.worktreePath), branch: this.record.settings.featureBranch })),
      env: this.sessionEnv(), signal: this.abort.signal,
    };
  }

  /**
   * An automatic launch on Codex that ends a wait for an activity that hasn't started saves its
   * attempt on the activity's own record before the process starts (Kiln Phase Model Tiers, "A Wait
   * Before the Start"). A launch the person asks for records no relaunch and isn't bounded by it.
   */
  private automaticAttempt(key: string, session: SessionRecord, cause: SessionRun["cause"]): { automaticAttempt?: { recovery: CodexUsageRecovery; refusalAt: string; save: () => void } } {
    if (cause !== "launch" || !session.relaunchOf || session.runs.length || this.startedSessionOf(key)) return {};
    const refused = this.sessionRecord(key, session.relaunchOf.sessionId)?.runs[session.relaunchOf.run]?.limitRefusal;
    const facts = this.record.phases[key];
    if (!refused || !facts) return {};
    return { automaticAttempt: { recovery: facts.codexUsageRecovery ??= { generation: 0 }, refusalAt: refused.at, save: () => this.save() } };
  }

  private async runCodexProcess(current: CurrentPhase, session: SessionRecord, prompt: string, cause: SessionRun["cause"], cwd: string, note?: string, started?: () => boolean): Promise<void> {
    const files = sessionFiles(this.options.stateDirectory, session);
    const previous = readJsonLines<OutputLine>(files.output);
    const reader = new CodexOutputReader(session, previous.length, previous);
    const save = (lines: OutputLine[]) => {
      if (!lines.length) return;
      for (const line of lines) appendJsonLine(files.output, line);
      current.latestLine = lines.at(-1)!;
      for (const listener of this.outputListeners) listener(session.sessionId, lines);
      void this.refreshCommits(current, false);
      this.changed();
    };
    save([reader.line("out", CODEX_CHILD_OUTPUT_NOTICE, this.now().toISOString())]);
    const priorRunCount = session.runs.length;
    try {
      await runCodexSession({
        ...this.codexLaunchOptions(cwd), ...(this.controlDispatch ? { control: { operationId: this.controlDispatch.id, attemptId: this.controlDispatch.attempt_id!, promptDigest: createHash("sha256").update(prompt).digest("hex") } } : {}), record: session, stateDirectory: this.options.stateDirectory, prompt, cause, ...(note ? { note } : {}),
        ...this.automaticAttempt(current.phaseKey, session, cause),
        beforeStart: async () => {
          await this.recheckPreparationAdmission(current.phaseKey, session);
          if (this.stopping || started?.() === false) throw new CodexLaunchCancelled("Codex launch authorization was withdrawn.");
          if (started) this.save();
        },
        onBilling: summary => {
          this.record.billing!.lastLaunch = { ...this.record.billing!.lastLaunch, [summary.agentId]: structuredClone(summary) };
          this.save();
        },
        onSpawned: control => { this.control = control; },
        onWarning: text => { this.emit({ kind: "message", text }); save([reader.line("out", text, this.now().toISOString())]); },
        onStderr: (text, at) => save([reader.line("stderr", text, at)]),
        onEvent: (message, at) => {
          if (cause === "launch" && session.kind === "phase" && message.method === "turn/started" && message.params?.threadId === session.conversation?.threadId) reader.start("Build", at);
          const output = reader.read(message, at); save(output.lines);
          if (output.partial) for (const listener of this.partialListeners) listener(session.sessionId, output.partial);
        },
        onHistory: (threadId, turns) => {
          for (const turn of turns) for (const item of turn.items ?? []) {
            const at = typeof turn.startedAt === "number" ? new Date(turn.startedAt * 1000).toISOString() : this.now().toISOString();
            save(reader.read({ method: "item/completed", params: { threadId, turnId: turn.id, item } }, at, typeof turn.startedAt === "number" ? "turn" : "recovery").lines);
          }
        },
        onRecordChange: () => { this.observeControlDispatch(session); this.markTold(session); this.noteStart(current.phaseKey, session); this.changed(); },
        beforeEnd: () => this.readSleep(false),
      });
    } catch (error) {
      if (session.runs.length !== priorRunCount) throw error;
      if (this.stopping || error instanceof CodexUsageRecoveryUnavailable || error instanceof CodexLaunchCancelled) {
        this.checking = false;
        const wait = this.record.phases[current.phaseKey]?.wait;
        if (wait && error instanceof CodexUsageRecoveryUnavailable) {
          if (!this.record.settings.resumeAfterUsageLimit || error.release.state === "unknown" || error.release.administrative) this.waitToStop(current.phaseKey, wait.checks, wait.checkedAt);
          else this.askReading();
        }
        this.changed();
        return;
      }
      // The runner's launch preflight creates no run. Preserve its refusal and the same
      // conversation, rather than leaking a rejected engine loop or selecting another agent.
      const at = this.now().toISOString();
      const run: SessionRun = { startedAt: at, endedAt: at, cause, spawnError: { code: "CODEX_PREFLIGHT", message: (error as Error).message } };
      session.runs.push(run); save([reader.line("stderr", (error as Error).message, at)]);
    }
    const run = session.runs.at(-1)!;
    const sleep = sleepInterruption(session.sleeps, session.runs.length - 1, run.codex?.modelActivityAt ?? []);
    if (sleep && !run.interruptedBy) { run.interruptedBy = "sleep"; run.interruptedAt = sleep.at; }
    if (run.interruptedBy) delete run.limitRefusal;
    for (const request of run.codex?.humanRequests ?? []) save([reader.line("stderr", `Codex request ${request.method}: ${JSON.stringify(request.request)}; client decision: ${JSON.stringify(request.decision)}`, request.at)]);
    if (run.codex?.failure) save([reader.line("stderr", run.codex.failure, run.endedAt!)]);
    if (run.codex?.cleanupFailure) save([reader.line("stderr", `Cleanup failed: ${run.codex.cleanupFailure}`, run.endedAt!)]);
    if (run.codex?.terminal) save([reader.line("exit", `Codex turn ${run.codex.terminal.status}${run.codex.terminal.error ? `: ${JSON.stringify(run.codex.terminal.error)}` : ""}`, run.endedAt!)]);
    writeSessionRecord(this.options.stateDirectory, session);
  }

  /**
   * After a session's process ended: a run a sleep cut off is checked and, when the check fails,
   * resumed, until a run ends on its own; that run is judged by its check alone.
   */
  private async settleSession(phaseKey: string): Promise<Verdict> {
    for (;;) {
      if (this.record.liveControl) {
        this.current = undefined;
        await this.reconcileTakeover(); this.watchTakeover(); this.changed();
        return { kind: "stopped" };
      }
      if (this.commands.blocked) return { kind: "stopped" };
      if (this.stopping) return { kind: "stopping" };
      // A session whose folder went missing while it worked is judged only after recovery.
      if (!await this.folderGuard({ mayLeave: false })) { this.current = undefined; this.changed(); return { kind: "stopped" }; }
      if (this.record.billing?.hold?.phaseKey === phaseKey) return { kind: "stopped" };
      const run = this.latestSession(phaseKey)?.runs.at(-1);
      if (run?.interruptedBy !== "sleep") return this.judgeEndedSession(phaseKey, false);
      this.emitSessionEvent(phaseKey, "interrupted");
      this.interruptedKey = phaseKey;
      const verdict = await this.checkInterrupted(phaseKey);
      if (verdict.kind !== "resume") {
        this.interruptedKey = undefined;
        this.current = undefined;
        this.changed();
        return verdict;
      }
      await this.resumeSession(phaseKey);
    }
  }

  /** Reads the current phase's commits from Git in every set-up repository while it works, at most every 5 seconds. */
  private async refreshCommits(current: CurrentPhase, force: boolean): Promise<void> {
    if (current.phaseKey === PR_PHASE_KEY) return;
    if (!force && Date.now() - this.lastCommitRefresh < 5_000) return;
    this.lastCommitRefresh = Date.now();
    current.commits = await this.phaseCommits(current.phaseKey);
    this.changed();
  }

  /** A phase's commits in each set-up repository, from its start commit there, leaving out repositories with none. */
  private async phaseCommits(phaseKey: string): Promise<RepositoryCommits[]> {
    const facts = this.record.phases[phaseKey];
    const reads = this.setUpRepositories.map(async (entry) => {
      const start = facts?.repositories[entry.name]?.startCommit;
      if (start === undefined) return { name: entry.name, commits: [] };
      const commits = await firstParentCommits(this.git, expandHome(entry.worktreePath), start, `refs/heads/${this.record.settings.featureBranch}`);
      return { name: entry.name, commits };
    });
    return (await Promise.all(reads)).filter((read) => read.commits.length > 0);
  }

  /** Records each set-up repository's start commit for the phase, once: its feature branch's tip, or its base commit when added during the phase. */
  private async recordStartCommits(phaseKey: string): Promise<void> {
    const facts = this.record.phases[phaseKey]!;
    let changed = false;
    for (const entry of this.setUpRepositories) {
      if (facts.repositories[entry.name] !== undefined) continue;
      const tip = await localBranchCommit(this.git, expandHome(entry.worktreePath), this.record.settings.featureBranch);
      if (tip !== undefined) {
        facts.repositories[entry.name] = { startCommit: tip };
        changed = true;
      }
    }
    if (changed) this.save();
  }

  // ---- Verdicts --------------------------------------------------------------------------

  /**
   * Judges a phase after its session ended on its own: its check alone decides (AC-DONE-02,
   * AC-STOP-01). A resumed run, Kiln's or the person's, that started and ended without its stream
   * reporting the session's `init` couldn't resume it (AC-KEEP-05, usage-limit recovery
   * AC-RESUME-04): a failing check is then `not_resumable`.
   */
  private async judgeEndedSession(phaseKey: string, byPerson: boolean): Promise<Verdict> {
    try {
      const session = this.latestSession(phaseKey);
      const runIndex = (session?.runs.length ?? 0) - 1;
      const run = session?.runs[runIndex];
      if (run?.cause === "launch" && session?.runs.length === 1 && run.codex?.verificationFailure && codexNotDispatched(run)) {
        // A rejected first launch has no materialized provider history to audit.
        // This also handles a restart after an older Kiln left it implementing.
        this.recordStop(phaseKey, "selection", [{ name: "Codex launch settings", passed: false, facts: [this.launchStopFact(phaseKey, run.codex.verificationFailure, session)] }]);
        return { kind: "stopped" };
      }
      if (activityKeyKind(phaseKey) === "requirements") {
        if (run?.limitRefusal && session) return this.settleRefused(phaseKey, session, runIndex, [{ name: "Requirements stage", passed: false, facts: ["The agent reached its usage limit."] }]);
        return await this.judgeRequirements(phaseKey);
      }
      if (isPreflightKey(phaseKey)) return await this.judgePreflight(phaseKey);
      if (this.record.preparation?.phaseId === phaseKey && (this.record.preparation.stage !== "implementation" || !session?.runs[this.record.preparation.implementationRun!])) {
        if (!session || !run || run.interruptedAt || run.spawnError || !run.endedAt || run.exitCode !== 0) {
          this.recordStop(phaseKey, "done_check", [{ name: "Prerequisite preparation", passed: false, facts: ["The preparation turn did not settle successfully. Resume this preparation conversation; dependent implementation remains held."] }]);
          return { kind: "stopped" };
        }
        return this.advancePreparation();
      }
      const notResumable = session !== undefined && run !== undefined && run.cause !== "launch" && run.pid !== undefined && (session.agentId === "codex" ? this.transcriptMissing(session) : !runReportedInit(this.options.stateDirectory, session, runIndex));
      if (isAfterDeliveryKey(phaseKey)) return await this.judgeAfterDelivery(phaseKey, notResumable);
      if (phaseKey === PR_PHASE_KEY) {
        const check = await this.pullRequestCheck(PR_PHASE_KEY);
        if (this.stopping) return { kind: "stopping" };
        if (check.passed) {
          this.complete(check.pullRequests ?? [], byPerson, check.mergedBranches, check.checks);
          return { kind: "complete" };
        }
        if (this.finalNeedsAudits(check)) return { kind: "done", judgedId: PR_PHASE_KEY };
        if (!notResumable && run?.limitRefusal !== undefined) return this.settleRefused(PR_PHASE_KEY, session!, runIndex, check.checks);
        this.recordStop(PR_PHASE_KEY, notResumable ? "not_resumable" : "pull_request_check", check.checks);
        return { kind: "stopped" };
      }
      const outcome = await this.doneCheck(phaseKey);
      if (this.record.liveControl) { await this.reconcileTakeover(); return { kind: "stopped" }; }
      if (outcome === "stopping" || this.stopping) return { kind: "stopping" };
      if (outcome.passed) {
        await this.recordDone(phaseKey, outcome, byPerson);
        return { kind: "done", judgedId: outcome.judgedLeafId };
      }
      if (!outcome.unavailable && !notResumable && run?.limitRefusal !== undefined) return this.settleRefused(phaseKey, session!, runIndex, outcome.checks);
      this.recordStop(phaseKey, notResumable ? "not_resumable" : "done_check", outcome.checks);
      return { kind: "stopped" };
    } finally {
      if (!this.stopping) {
        this.current = undefined;
        this.changed();
      }
    }
  }

  /**
   * An interrupted session's check, before any resume (AC-KEEP-04, AC-DONE-03): a pass is Done
   * (or the PRD complete) and nothing is resumed; a failure means resume it, unless the session
   * cannot safely resume under the runtime and conversation recovery requirements.
   */
  private async checkInterrupted(phaseKey: string): Promise<Verdict | { kind: "resume" }> {
    if (isPreflightKey(phaseKey) || activityKeyKind(phaseKey) === "requirements") {
      // An interrupted preflight has not ended: it is resumed, unless its conversation cannot be reopened, when it has ended and is read.
      const session = this.latestSession(phaseKey);
      const safety = await this.preflightSafety(phaseKey);
      if (safety) return this.stopInterrupted(phaseKey, "done_check", [safety]);
      if (session && !this.transcriptMissing(session) && this.canResumeCodex(phaseKey)) return { kind: "resume" };
      return isPreflightKey(phaseKey) ? this.judgePreflight(phaseKey) : this.judgeRequirements(phaseKey);
    }
    if (isAfterDeliveryKey(phaseKey)) {
      // An interrupted merge or push session takes its own reading first; only work still to do resumes it.
      const ops = this.afterDeliveryOps(phaseKey);
      const result = await ops.read();
      if (this.stopping) return { kind: "stopping" };
      if (result.done) return ops.done();
      return !result.unreadable && !this.codexSafetyProblems(phaseKey).length && this.canResumeCodex(phaseKey) ? { kind: "resume" } : this.stopInterrupted(phaseKey, ops.stopKind, result.checks);
    }
    if (phaseKey === PR_PHASE_KEY) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return { kind: "stopping" };
      if (this.finalNeedsAudits(check)) return { kind: "done", judgedId: PR_PHASE_KEY };
      if (!check.passed) return !this.codexSafetyProblems(phaseKey).length && this.canResumeCodex(phaseKey) ? { kind: "resume" } : this.stopInterrupted(PR_PHASE_KEY, "pull_request_check", check.checks);
      this.complete(check.pullRequests ?? [], false, check.mergedBranches, check.checks);
      return { kind: "complete" };
    }
    const outcome = await this.doneCheck(phaseKey);
    if (outcome === "stopping" || this.stopping) return { kind: "stopping" };
    if (!outcome.passed) return !outcome.unavailable && !this.codexSafetyProblems(phaseKey).length && this.canResumeCodex(phaseKey) ? { kind: "resume" } : this.stopInterrupted(phaseKey, "done_check", outcome.checks);
    await this.recordDone(phaseKey, outcome, false);
    return { kind: "done", judgedId: outcome.judgedLeafId };
  }

  /**
   * Records an interrupted session's stop in place of resuming it, with when it was interrupted:
   * the time Kiln recorded, or its last output when Kiln recorded none (multi-repo AC-OUTSIDE-04).
   */
  private stopInterrupted(phaseKey: string, kind: StopKind, checks: CheckResult[]): Verdict {
    const session = this.latestSession(phaseKey);
    const runIndex = (session?.runs.length ?? 0) - 1;
    const run = session?.runs[runIndex];
    const recorded = run?.interruptedAt;
    const at = recorded ?? (session && run ? (runLastOutputAt(this.options.stateDirectory, session, runIndex) ?? run.startedAt) : this.now().toISOString());
    this.recordStop(phaseKey, kind, checks, { at, atIsLastOutput: recorded === undefined });
    return { kind: "stopped" };
  }

  /**
   * Whether Check again at this stop runs the activity's completion checks (AC-STOPCHECK-02). The
   * hand-back page's Check again is recoverPhase, which always runs the done check; elsewhere it is
   * recheckStop, read from the same branches. A launch, plan or readiness problem reruns its own
   * check, and a development check on an activity already complete reruns only that check.
   */
  recheckRunsCompletion(phaseKey: string): boolean {
    if (this.phaseRecoveryTarget()?.phaseKey === phaseKey) return true;
    const hold = this.record.billing?.hold;
    if (hold?.phaseKey === phaseKey) return !!(hold.sessionId ? this.sessionRecord(phaseKey, hold.sessionId) : this.latestSession(phaseKey))?.runs.length;
    const stop = this.record.phases[phaseKey]?.stop;
    if (!stop || stop.kind === "selection" || stop.kind === "plan" || stop.kind === "loop_limit") return false;
    // Where only the description fails, Check again starts the pull request session, so the line saying what it runs is left out (AC-LEFT-01).
    if (phaseKey === PR_PHASE_KEY && this.onlyDescriptionFails(stop.checks)) return false;
    const activation = this.record.developmentAuthorization?.activationRecovery;
    if (activation && recoveryStopKey(activation) === phaseKey && this.record.phases[phaseKey]!.sessionIds.length === 0) return false;
    return phaseKey === PR_PHASE_KEY || !(stop.kind === "done_check" && this.alreadyComplete(phaseKey) && stop.checks.every(check => check.passed || check.name === DELIVERY_CHECK));
  }

  /**
   * Check again, or `kiln run` on a stopped phase: the stop's own check, run again. It keeps the
   * stop, with a new check run, while that check still fails, and clears it only when it passes
   * (waivers "Check Runs"). `routeAudits: false` is Mark complete's rerun, which never routes a
   * final delivery whose only failing check is Current completion audits to the audits.
   */
  private async recheckStop(phaseKey: string, options: { routeAudits?: boolean; resuming?: boolean } = {}): Promise<"done" | "complete" | "cleared" | "still_stopped"> {
    const routeAudits = options.routeAudits !== false;
    if (activityKeyKind(phaseKey) === "requirements" && !this.record.billing?.hold && this.record.phases[phaseKey]?.stop?.kind === "done_check") return (await this.judgeRequirements(phaseKey, true)).kind === "done" ? "done" : "still_stopped";
    if (isPreflightKey(phaseKey)) { const preflight = await this.recheckPreflight(phaseKey); if (preflight) return preflight; }
    const facts = this.record.phases[phaseKey]!;
    const hold = this.record.billing?.hold;
    if (hold?.phaseKey === phaseKey && isAfterDeliveryKey(phaseKey)) return this.recheckAfterDeliveryHold(phaseKey, hold);
    if (hold?.phaseKey === phaseKey) {
      // A billing hold's recheck reads the hold's own session, so a launch hold is rechecked as a launch (run restart "A session record with no run").
      if ((hold.sessionId ? this.sessionRecord(phaseKey, hold.sessionId) : this.latestSession(phaseKey))?.runs.length) {
        const outcome = phaseKey === PR_PHASE_KEY ? await this.pullRequestCheck(phaseKey) : await this.doneCheck(phaseKey);
        if (outcome !== "stopping" && "ghError" in outcome && outcome.ghError && !outcome.passed) { this.unfinishedRecheck(phaseKey); return "still_stopped"; }
        const unreadable = outcome !== "stopping" && "unavailable" in outcome ? outcome.unavailable : undefined;
        if (outcome !== "stopping" && unreadable) {
          if (!facts.stop) this.recordStop(phaseKey, "done_check", outcome.checks);
          this.unfinishedRecheck(phaseKey);
          throw new CompletionCheckUnavailable(unreadable);
        }
        if (outcome !== "stopping" && outcome.passed) {
          delete this.record.billing!.hold;
          if (phaseKey === PR_PHASE_KEY) { const final = outcome as Awaited<ReturnType<Engine["pullRequestCheck"]>>; this.complete(final.pullRequests ?? [], true, final.mergedBranches, final.checks); return "complete"; }
          await this.recordDone(phaseKey, outcome as DoneCheckOutcome, true); return "done";
        }
        // The run's rows only: the Billing approval row is shown beside them, outside the run, and is never waivable.
        if (outcome !== "stopping") { hold.checks = markReasonRows(outcome.checks); hold.rowsAreCompletionChecks = true; hold.run = this.newRun("recheck"); this.save(); }
        return "still_stopped";
      }
      await this.billing.refresh(this.billingCwd, this.sessionEnv(), [], true);
      if (this.billing.view.canLaunch) { delete this.record.billing!.hold; this.save(); return "cleared"; }
      // An activity that has not run: the launch check, then its own completion check, in one run.
      const rows = await this.completionRows(phaseKey);
      const checks = [...rows, { name: "Billing approval", passed: false, facts: [hold.reason] }];
      await this.markChecks(phaseKey, checks);
      // A launch hold on an activity that has not run keeps the Why Kiln stopped label (AC-STOPCHECK-02, 03).
      hold.checks = markReasonRows(checks); delete hold.rowsAreCompletionChecks; hold.run = this.newRun("recheck"); this.save();
      return "still_stopped";
    }
    const stop = facts.stop!;
    if (isAfterDeliveryKey(phaseKey) && stop.kind !== "merge_check" && stop.kind !== "plan_push_check" && stop.kind !== "not_resumable") {
      // A merge or push stop that never reached the session (a launch check) takes its own reading first too (AC-MERGE-06).
      const ops = this.afterDeliveryOps(phaseKey);
      const result = await ops.read();
      if (this.stopping) return "still_stopped";
      if (result.done) { ops.done(); return "complete"; }
    }
    // A loop stop saved by Kiln 1.3.0: Kiln no longer stops at a limit, so its recheck always clears it and routing goes on (technical design, "Upgrade").
    if (stop.kind === "loop_limit") return this.clearStop(phaseKey);
    const latest = this.latestSession(phaseKey);
    if (latest?.agentId === "codex") await this.stopLiveProcess(latest);
    if (stop.kind === "selection" && stop.checks.some(check => check.name === HOLD_CHECK)) return this.recheckHold(phaseKey, routeAudits);
    if (stop.kind === "selection" && stop.checks.some(check => check.name === READINESS_CHECK)) {
      // The scheduling decision and, when the next step is an audit, its skill resolution, without allocating an activity.
      try {
        const kind = await auditNext(this.admissionContext());
        if (kind !== "final_delivery") {
          await this.auditsSkill(kind === "continue_test" ? "test_audit" : kind);
          // What allocation needs beyond the skill: a continuation's predecessor and a work snapshot, read but never saved.
          if (kind === "continue_test" && !continuablePredecessor({ record: this.record, stateDirectory: this.stateDirectory })) throw new Error("A test continuation requires its settled accepted predecessor.");
          await captureSnapshot({ ...this.admissionContext(), activity: { activityId: "readiness-check", sequence: 0, kind: kind === "continue_test" ? "test_audit" : kind, round: 0, continuationIndex: 0, createdAt: this.now().toISOString(), sessionIds: [], reportPath: `${writtenDirectory(this.record)}/kiln-audit-readiness-check.json`, snapshots: [], attempts: [] }, now: this.now().toISOString() });
        }
      } catch (error) {
        if (this.stopping) return "still_stopped";
        const checks: CheckResult[] = [{ name: READINESS_CHECK, passed: false, facts: [this.readinessFact(error)] }];
        if (!await this.markChecks(phaseKey, checks)) { this.updateStop(phaseKey, checks, false); return "still_stopped"; }
      }
      return this.clearStop(phaseKey);
    }
    if (stop.kind === "selection" && stop.checks.some(check => check.name === "Preparation permissions") && this.record.preparation) {
      // A Preparation permissions stop on an activity that has not run reruns the permission read.
      try { await preparationPermissions(this.preparationContext(), true); }
      catch (error) {
        if (this.stopping) return "still_stopped";
        const checks = [{ name: "Preparation permissions", passed: false, facts: [(error as Error).message] }, ...await this.completionRows(phaseKey)];
        await this.markChecks(phaseKey, checks);
        this.updateStop(phaseKey, checks, false);
        return "still_stopped";
      }
      return this.clearStop(phaseKey);
    }
    if (stop.kind === "selection") {
      // A start Kiln couldn't tell is settled by Check again's own history read (Kiln Phase Model Tiers, "When an Activity Starts").
      if (stop.checks.some(check => check.name === START_CHECK)) {
        const start = await this.readStart(phaseKey);
        if (this.stopping) return "still_stopped";
        if (start === "unknown") {
          const checks = [{ name: START_CHECK, passed: false, facts: [`Kiln can't tell whether this activity has started, so it launches nothing for it. ${this.unknownStarts.get(phaseKey) ?? ""}`.trim()] }];
          await this.markChecks(phaseKey, checks);
          this.updateStop(phaseKey, checks, false);
          return "still_stopped";
        }
      }
      // Check again resolves the stopped activity's choice again (AC-PICK-06), on the agent it now names.
      this.syncNeededAgents();
      await this.readers[this.agentOf(phaseKey)].refresh([this.sessionFolder, ...this.sessionRepositories.map((entry) => expandHome(entry.worktreePath))]);
      if (this.stopping) return "still_stopped";
      const issue = this.selectionIssue(phaseKey);
      const probe = !issue && stop.checks.some(check => check.name === "Codex launch settings") ? await this.probeCodexLaunch(phaseKey) : undefined;
      if (issue || probe) {
        const launch: CheckResult = issue ? { name: "Agent selection and readiness", passed: false, facts: [this.launchStopFact(phaseKey, issue)] } : { ...probe!, facts: probe!.facts.map(fact => typeof fact === "string" ? this.launchStopFact(phaseKey, fact) : fact) };
        // An activity that has not run: its own completion rows beside the launch check (waivers "Check Runs").
        // An activity that has not run: its own completion rows beside the launch check, still labelled Why Kiln stopped (AC-STOPCHECK-02, 03).
        const checks = [launch, ...(this.activityRan(phaseKey) ? [] : await this.completionRows(phaseKey))];
        await this.markChecks(phaseKey, checks);
        this.updateStop(phaseKey, checks, false);
        return "still_stopped";
      }
      return this.clearStop(phaseKey);
    }
    if (stop.kind === "plan") {
      const read = await this.readPlan();
      if (!read.ok) {
        if (read.unavailable) { this.unfinishedRecheck(phaseKey); throw new CompletionCheckUnavailable(read.problem); }
        // A phase that ran and is not complete is rechecked by its done check, which carries the plan row (waivers "Mark Complete").
        const checks = this.activityRan(phaseKey) && !this.alreadyComplete(phaseKey) ? await this.completionRows(phaseKey) : [planCheck(read)];
        // A problem a waiver already covers no longer stops Kiln: it follows its normal order (AC-WAIVE-04).
        if (await this.markChecks(phaseKey, checks)) return this.clearStop(phaseKey);
        // A plan problem is why Kiln stopped, whichever rows carry it (AC-STOPCHECK-02, 03).
        this.updateStop(phaseKey, checks, false);
        return "still_stopped";
      }
      // A repository the phase names that the workspace lacks is tried again (multi-repo AC-ADD-04).
      const leaf = this.nextExecutionLeaf(read.plan);
      if (leaf && leaf.id === phaseKey) {
        const added = await this.addNamedRepositories(leaf, read.plan);
        if (!added.ok) {
          const checks = [{ name: CHECK_NAMES.plan, passed: false, facts: added.facts }];
          if (await this.markChecks(phaseKey, checks)) return this.clearStop(phaseKey);
          // The plan stop's questions come from the additions' own search; a request's questions stay (find repositories anywhere, "The stops that ask").
          const planStop = this.record.phases[phaseKey]!.stop!;
          const asked = [...(planStop.locate ?? []).filter(question => question.phaseFile === undefined), ...added.locate];
          if (asked.length) planStop.locate = asked; else delete planStop.locate;
          this.updateStop(phaseKey, checks, false);
          return "still_stopped";
        }
      }
      const activation = this.record.developmentAuthorization?.activationRecovery;
      if (activation && recoveryStopKey(activation) === phaseKey && stop.checks.some(check => check.facts.includes(ACTIVATION_MISSING)) && !judgedPhase(this.record.plan ?? [], phaseKey)) {
        this.updateStop(phaseKey, [{ name: CHECK_NAMES.plan, passed: false, facts: [ACTIVATION_MISSING] }], false);
        return "still_stopped";
      }
      // The plan reads again. Nothing ran, so nothing is marked Done; the loop goes round again.
      return this.clearStop(phaseKey);
    }
    const activation = this.record.developmentAuthorization?.activationRecovery;
    if (activation && recoveryStopKey(activation) === phaseKey && facts.sessionIds.length === 0) {
      // There is no conversation to resume yet. After the original plan/readiness
      // blocker clears, the ordinary launch supplies the bounded recovery session.
      delete facts.stop; this.save(); return "cleared";
    }
    if (phaseKey !== PR_PHASE_KEY && stop.kind === "done_check" && this.alreadyComplete(phaseKey) && stop.checks.every(check => check.passed || check.name === DELIVERY_CHECK)) {
      // A development check that stopped an already-complete activity reruns only that check (waivers "Check Runs").
      await reconcileDelivery(this.deliveryContext(phaseKey));
      if (ledger(this.record).sourceUnavailable) { this.unfinishedRecheck(phaseKey); throw new CompletionCheckUnavailable("Required development-delivery evidence is unavailable. Retry when the source can be read."); }
      const audit = this.auditActivity(phaseKey);
      // A stop saved on a phase Closed before this run began, which owes no development evidence (AC-DEV-03), clears.
      if (!audit && !owesDevelopmentEvidence(this.record, phaseKey, (await leavesClosedAtRunBase(this.deliveryContext(phaseKey))).has(phaseKey))) return this.clearStop(phaseKey);
      const checks = [audit ? ownerDeliveryCheck(this.deliveryContext(phaseKey), { kind: "audit", activityId: audit.activityId }) : phaseDeliveryCheck(this.deliveryContext(phaseKey), phaseKey)];
      if (!await this.markChecks(phaseKey, checks)) { this.updateStop(phaseKey, checks, false); return "still_stopped"; }
      return this.clearStop(phaseKey);
    }
    if (isAfterDeliveryKey(phaseKey)) {
      // Check again, Resume and Send and resume take the activity's own reading first (AC-MERGE-06):
      // done ends the activity without resuming; a reading that could not finish decides nothing.
      const ops = this.afterDeliveryOps(phaseKey);
      const result = await ops.read();
      if (this.stopping) return "still_stopped";
      if (result.done) { ops.done(); return "complete"; }
      this.updateStop(phaseKey, result.checks, true);
      if (result.unreadable) throw new CompletionCheckUnavailable(result.unreadable);
      // No session ever started: the stop clears, and the loop launches the session it never had.
      if (!this.latestSession(phaseKey)?.runs.some(run => run.pid !== undefined)) return this.clearStop(phaseKey);
      return "still_stopped";
    }
    if (phaseKey === PR_PHASE_KEY) {
      // A holding item no waiver covers stops the run before anything completes it, such as an item with no kind on a stop saved by Kiln 1.3.0 (AC-ITEM-01, "Upgrade").
      if (routeAudits && await this.holdStops()) return "still_stopped";
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return "still_stopped";
      // GitHub or the delivery source could not be read: a check that could not finish, so Mark complete is not offered on it (AC-WAIVE-02).
      // Resume and Check again carry on as before; the run is only marked unfinished.
      if (!check.passed && check.ghError) { this.unfinishedRecheck(phaseKey); return "still_stopped"; }
      if (check.passed) {
        this.complete(check.pullRequests ?? [], true, check.mergedBranches, check.checks);
        return "complete";
      }
      if (routeAudits && this.finalNeedsAudits(check)) return "done";
      // Only an out-of-date description stops final delivery: Check again clears the stop and a pull request session starts (AC-LEFT-01). Mark complete's rerun keeps it.
      if (routeAudits && !options.resuming && this.onlyDescriptionFails(check.checks)) return this.clearStop(phaseKey);
      this.updateStop(phaseKey, check.checks, true);
      return "still_stopped";
    }
    const outcome = await this.doneCheck(phaseKey);
    if (outcome === "stopping" || this.stopping) return "still_stopped";
    if (outcome.unavailable) { this.unfinishedRecheck(phaseKey); throw new CompletionCheckUnavailable(outcome.unavailable); }
    if (!outcome.passed) {
      this.updateStop(phaseKey, outcome.checks, true);
      return "still_stopped";
    }
    if (!this.auditActivity(phaseKey)) delete facts.stop;
    await this.recordDone(phaseKey, outcome, true);
    return "done";
  }

  /** A stop whose check now passes: cleared, and a facts entry the stop itself created removed. */
  private clearStop(phaseKey: string): "cleared" {
    const facts = this.record.phases[phaseKey]!;
    delete facts.stop;
    if (facts.sessionIds.length === 0 && !facts.doneAt && !this.auditActivity(phaseKey) && !isPreflightKey(phaseKey)) delete this.record.phases[phaseKey];
    this.save();
    return "cleared";
  }

  /** An activity's own completion check, for a launch-check stop on an activity that has not run. */
  private async completionRows(phaseKey: string): Promise<CheckResult[]> {
    // A preflight has no completion rows (Reading the Result).
    if (isPreflightKey(phaseKey)) return [];
    if (phaseKey === PR_PHASE_KEY) return (await this.pullRequestCheck(PR_PHASE_KEY)).checks;
    if (phaseKey === MERGE_KEY) return this.mergeResult().checks;
    if (isPlanPushKey(phaseKey)) return (await this.planPushReading(phaseKey)).checks;
    const outcome = await this.doneCheck(phaseKey);
    if (outcome === "stopping") throw new CompletionCheckUnavailable("The completion check was interrupted.");
    if (outcome.unavailable) { this.unfinishedRecheck(phaseKey); throw new CompletionCheckUnavailable(outcome.unavailable); }
    return outcome.checks;
  }

  /** The Codex launch-settings probe a Codex launch settings stop reruns: its failing row, or undefined when it passes. */
  private async probeCodexLaunch(key: string): Promise<CheckResult | undefined> {
    if (!openPlanPush(this.record)) mkdirSync(this.workspaceFolder, { recursive: true });
    let prepared: Awaited<ReturnType<typeof prepareCodexLaunch>>;
    try { prepared = await prepareCodexLaunch({ ...this.codexLaunchOptions(this.sessionFolder), choice: this.launchChoice(key) }); }
    catch (error) { return { name: "Agent selection and readiness", passed: false, facts: [(error as Error).message] }; }
    // A probe that could not finish (Codex did not start, a deadline, an abort) is a check that could not finish.
    try {
      const probe = await probeCodexLaunchSettings({ executable: this.options.tools.codex!, env: this.sessionEnv(), prepared, signal: this.abort.signal });
      return probe.ok ? undefined : { name: "Codex launch settings", passed: false, facts: [probe.message] };
    } catch (error) { throw new CompletionCheckUnavailable((error as Error).message); }
  }

  private canResumeCodex(phaseKey: string): boolean {
    const session = this.latestSession(phaseKey);
    return session?.agentId !== "codex" || !this.transcriptMissing(session);
  }

  private codexSafetyProblems(phaseKey: string, includeVerification = true): string[] {
    return (this.record.phases[phaseKey]?.sessionIds ?? []).flatMap(id => {
      const session = this.sessionRecord(phaseKey, id);
      if (codexSessionNotDispatched(session)) return [];
      const run = session?.runs.at(-1);
      if (!run?.codex) return [];
      return [
        ...(includeVerification && run.codex.verificationFailure ? [run.codex.verificationFailure] : []),
        ...(run.codex.cleanup !== "tracked_processes_stopped" ? [`Codex cleanup unresolved: ${run.codex.cleanupFailure ?? "tracked process cleanup is unknown"}`] : []),
        ...(run.codex.reconciliation === "ambiguous" ? ["Codex dispatch is ambiguous; inspect authoritative history before resuming."] : []),
      ];
    });
  }

  private withCodexSafety<T extends { passed: boolean; checks: CheckResult[] }>(phaseKey: string, outcome: T): T {
    const problems = this.codexSafetyProblems(phaseKey);
    if (problems.length) { outcome.passed = false; outcome.checks.push({ name: "Codex process cleanup and dispatch", passed: false, facts: problems }); }
    return outcome;
  }

  /** Refresh recovery/output facts independently of the retired confinement audit. */
  private async refreshCodexConversations(phaseKey: string): Promise<void> {
    for (const id of this.record.phases[phaseKey]?.sessionIds ?? []) {
      const session = this.sessionRecord(phaseKey, id);
      if (session?.agentId === "codex" && !codexSessionNotDispatched(session)) await this.readCodexAvailability(session, true);
    }
  }

  private async readCodexAvailability(session: SessionRecord, hydrate = false): Promise<void> {
    if (!session.codex || !session.conversation?.threadId || !this.options.tools.codex) return;
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(30_000)]);
    const rpc = new CodexHistoryRpc(this.options.tools.codex, this.workingDirectoryOf(session), { ...this.options.env, CODEX_HOME: session.conversation.codexHome }, signal);
    try {
      await rpc.initialize();
      const response = await rpc.call<{ thread: { id: string; path?: string | null } }>("thread/read", { threadId: session.conversation.threadId, includeTurns: false });
      if (response.thread.id !== session.conversation.threadId) throw new Error("Saved Codex conversation identity differs.");
      session.codex.conversationUnavailable = false;
      delete session.codex.resumeError;
      if (hydrate) {
        const files = sessionFiles(this.options.stateDirectory, session);
        try {
          await recoverCodexOutput({ rpc, session, path: response.thread.path, previous: readJsonLines<OutputLine>(files.output), signal, save: lines => {
            for (const line of lines) appendJsonLine(files.output, line);
            if (lines.length) for (const listener of this.outputListeners) listener(session.sessionId, lines);
          } });
          delete session.codex.historyError;
        } catch (error) { session.codex.historyError = `Saved Codex output could not be fully refreshed: ${(error as Error).message}`; }
      }
    } catch (error) {
      session.codex.conversationUnavailable = true;
      session.codex.resumeError = `Codex conversation cannot be opened: ${(error as Error).message}`;
    } finally { await rpc.close(); }
    writeSessionRecord(this.options.stateDirectory, session);
  }

  private async doneCheck(phaseKey: string): Promise<DoneCheckOutcome | "stopping"> {
    // A done check that comes while an addition is under way waits for it to end first.
    if (this.auditActivity(phaseKey)) {
      try { return await this.auditDoneCheck(phaseKey); }
      catch (error) {
        // Every entry point uses this boundary: normal completion, interruption,
        // Check again and usage recovery all abandon only explicitly stopped reads.
        if (this.stopping) return "stopping";
        if (!(error instanceof CompletionCheckUnavailable)) throw error;
        const problem = error.message;
        return this.withCodexSafety<DoneCheckOutcome>(phaseKey, { passed: false, unavailable: problem, checks: [{ name: "Audit completion evidence", passed: false, facts: [problem] }], plan: { ok: false, problem, unavailable: true }, judgedLeafId: phaseKey });
      }
    }
    this.activeCheck = phaseKey;
    await this.deliveryPending;
    await this.additionChain;
    // A wake during the check restarts its origin retry, so the sleep watch runs through it.
    this.watchSleep();
    try {
      const beforePlan = await this.readPlan();
      await this.refreshCodexConversations(phaseKey);
      const beforeBaseline = this.record.planReconciliation?.baselineId;
      const outcome = await runDoneCheck({
        git: this.git,
        prdWorktreePath: this.worktreePath,
        repositories: this.setUpRepositories.map((entry) => this.checkedRepository(entry)),
        prdDirectoryFromRoot: this.paths.prdDirectoryFromRoot,
        branch: this.record.settings.featureBranch,
        launchedLeafId: phaseKey,
        orderSource: () => this.orderSource(),
        lastWakeAt: () => this.lastWakeAt,
        ...(this.options.originRetryMs === undefined ? {} : { originRetryMs: this.options.originRetryMs }),
      });
      if (deliveryEnabled(this.record)) {
        await reconcileDelivery(this.deliveryContext(phaseKey));
        if (ledger(this.record).sourceUnavailable) outcome.unavailable = "Required development-delivery evidence is unavailable. Retry when the source can be read.";
        const delivery = phaseDeliveryCheck(this.deliveryContext(phaseKey), outcome.judgedLeafId);
        outcome.checks.push(delivery, ...this.activationChecks().filter(check => !check.passed)); outcome.passed = outcome.passed && outcome.checks.every(check => check.passed); this.save(); this.announceDelivery();
      }
      if (!this.stopping) {
        const reconciled = await this.readPlan();
        if (!reconciled.ok) { outcome.passed = false; outcome.checks.push(planCheck(reconciled)); }
        else if (!beforePlan.ok || beforeBaseline !== this.record.planReconciliation?.baselineId) {
          outcome.passed = false;
          outcome.checks.push({ name: CHECK_NAMES.plan, passed: false, facts: [!beforePlan.ok ? beforePlan.problem : "source_changed: the plan changed during completion checks. Retry Verify or Resume."] });
        }
        outcome.plan = reconciled;
      }
      if (this.record.preparation?.phaseId === phaseKey && !this.record.phases[phaseKey]?.doneAt && (this.record.preparation.stage !== "implementation" || !this.latestSession(phaseKey)?.runs[this.record.preparation.implementationRun!])) { outcome.passed = false; outcome.checks.push({ name: "Prerequisite preparation", passed: false, facts: [this.record.preparation.reason ?? "Preparation and the engine-owned verification checkpoint must pass before dependent implementation."] }); }
      this.withCodexSafety(phaseKey, outcome);
      outcome.passed = await this.markChecks(phaseKey, outcome.checks) && !outcome.unavailable;
      this.lastDoneCheck = { key: phaseKey, outcome };
      return outcome;
    } finally {
      this.activeCheck = undefined;
    }
  }

  /**
   * The pull-request check, per repository whose feature branch has commits of its own
   * (multi-repo AC-PRS-05), each with its own `--repo`, head and base.
   */
  private async pullRequestCheck(phaseKey?: string) {
    if (phaseKey !== undefined) this.activeCheck = phaseKey;
    await this.deliveryPending;
    try {
      if (!this.record.completedAt) await this.readPlan();
      await this.refreshCodexConversations(PR_PHASE_KEY);
      if (deliveryEnabled(this.record)) {
        const result = await evaluateRepositories(this.deliveryContext(phaseKey)); this.announceDelivery();
        const check = result.checks[0]!;
        const outcome = this.withCodexSafety(PR_PHASE_KEY, { passed: result.passed, check, checks: result.checks, pullRequests: result.pullRequests, mergedBranches: [] as MergedBranchFacts[], ghError: ledger(this.record).sourceUnavailable === true });
        await this.requireCurrentAudits(outcome); outcome.passed = await this.markChecks(PR_PHASE_KEY, outcome.checks); this.addDescriptionRow(outcome); ledger(this.record).currentComplete = outcome.passed; this.save();
        this.lastFinalCheck = { pullRequests: outcome.pullRequests, mergedBranches: outcome.mergedBranches }; return outcome;
      }
      const repositories = await this.pullRequestRepositoriesNow();
      const outcome = await runPullRequestChecks(
        repositories.map((entry) => ({
          gh: this.options.tools.gh,
          env: this.options.env,
          mainCheckoutPath: entry.mainCheckoutPath,
          github: entry.github,
          branch: this.record.settings.featureBranch,
          baseBranch: entry.baseBranch,
          repository: entry.name,
          label: this.labelOf(entry.name),
          git: this.git,
          worktreePath: expandHome(entry.worktreePath),
          completedCommits: Object.entries(this.record.phases).filter(([key, facts]) => activityKeyKind(key) !== "final_delivery" && activityKeyKind(key) !== "preflight" && facts.doneAt).flatMap(([, facts]) => facts.repositories[entry.name]?.pushedSha ? [facts.repositories[entry.name]!.pushedSha!] : []),
          signal: this.abort.signal,
        })),
      );
      await this.requireCurrentAudits(outcome);
      const marked = this.withCodexSafety(PR_PHASE_KEY, outcome);
      marked.passed = await this.markChecks(PR_PHASE_KEY, marked.checks);
      this.addDescriptionRow(marked);
      this.lastFinalCheck = { pullRequests: marked.pullRequests, mergedBranches: marked.mergedBranches };
      return marked;
    } finally {
      if (phaseKey !== undefined) this.activeCheck = undefined;
    }
  }

  /**
   * Done for a phase or audit, in one record write. With `waiver`, the waiver is saved in that same
   * write (AC-WAIVE-08); a completing run that any waiver met is kept as `completionChecks` (AC-WAIVE-10).
   */
  private async recordDone(phaseKey: string, outcome: DoneCheckOutcome, byPerson: boolean, acceptManual = false, takeoverMaterial?: string, waiver?: Waiver): Promise<void> {
    if (this.record.liveControl && !acceptManual) throw new CompletionCheckUnavailable("A pause holds completion until explicit hand-back.");
    const facts = this.record.phases[phaseKey]!;
    const finalTakeoverCheck = async () => {
      if (!this.record.liveControl || !acceptManual) return;
      if (takeoverMaterial === undefined || takeoverMaterial !== await this.takeoverMaterial(phaseKey)) throw new CompletionCheckUnavailable("Completion evidence changed during hand-back. Retry Verify for fresh results.");
      const local = this.takeoverLocalMaterial(phaseKey);
      // A hold whose conversation can't be reopened advances on the carry-on ownership check, in place of release (AC-CARRY-06).
      await (this.record.liveControl.takeover.history ? this.requireCarryOnOwnership() : this.requireTakeoverReturn());
      if (local !== this.takeoverLocalMaterial(phaseKey)) throw new CompletionCheckUnavailable("Local completion evidence changed during final ownership admission. Retry Verify.");
    };
    const clearManualStop = () => {
      if (!acceptManual) return;
      delete facts.stop;
      delete facts.wait;
      if (this.record.billing?.hold?.phaseKey === phaseKey) delete this.record.billing.hold;
    };
    const waivedFacts = () => {
      // The receipt's outcome is saved in the same write as the waiver and its completion.
      if (waiver) { (this.record.waivers ??= []).push(waiver); facts.waiverId = waiver.waiverId; this.record.controlApplied = { operationId: waiver.operationId, outcome: "marked_complete" }; }
      else if (outcome.checks.some(check => check.waived)) facts.completionChecks = structuredClone(outcome.checks);
    };
    // Backfilling development assessments does not rewrite historical completion/push facts.
    if (facts.doneAt && this.record.developmentAuthorization?.activationRecovery && !this.auditActivity(phaseKey)) { clearManualStop(); this.save(); return; }
    const audit = this.auditActivity(phaseKey);
    // A repository whose uncommitted or unpushed work was waived records its head as waived, never as pushed (AC-WAIVE-09).
    const waivedWork = new Set(outcome.checks.flatMap(check => (check.items ?? []).filter(item => item.kind === "repository_work" && item.waiver).map(item => item.subject)));
    if (audit) {
      if (facts.doneAt) { const stop = facts.stop; delete facts.stop; try { this.save(); } catch (error) { if (stop) facts.stop = stop; throw error; } return; }
      const before = structuredClone(this.record);
      try {
        const accepted = effectiveAudit(this.stateDirectory, audit)!;
        if (outcome.plan.ok) { this.record.plan = recordedPlan(outcome.plan.plan); this.record.planReadAt = this.now().toISOString(); this.syncNeededAgents(); }
        for (const phaseId of accepted.completionPhases()) assignAuditObligations(this.deliveryContext(phaseKey), audit.activityId, { kind: "phase", phaseId });
        for (const entry of this.setUpRepositories) {
          const head = await localBranchCommit(this.git, expandHome(entry.worktreePath), this.record.settings.featureBranch);
          if (!head) throw new Error(`Cannot record settled audit head for ${this.labelOf(entry.name)}.`);
          const repository = facts.repositories[entry.name] ??= { startCommit: head };
          if (waivedWork.has(entry.name)) { delete repository.pushedSha; repository.waivedHead = head; } else repository.pushedSha = head;
          const count = await firstParentCount(this.git, expandHome(entry.worktreePath), repository.startCommit, head);
          if (count !== undefined) repository.commitCount = count;
        }
        await finalTakeoverCheck();
        facts.doneAt ??= this.now().toISOString(); facts.finishedByPerson = byPerson; delete facts.stop; waivedFacts();
        // Its delivery check just passed against these documents; the completion phases it added will edit them.
        if (deliveryEnabled(this.record)) acceptAuditDocuments(this.deliveryContext(phaseKey), audit.activityId);
        if (acceptManual && this.record.billing?.hold?.phaseKey === phaseKey) delete this.record.billing.hold;
        if (this.commands?.active) facts.completedByOperation = this.commands.active.id;
        this.save();
      } catch (error) { Object.assign(this.record, before); throw error; }
      this.emitAudit(audit, "done"); return;
    }
    const shas = outcome.pushedShas ?? {};
    const repositories = structuredClone(facts.repositories);
    const pushes: { name: string; sha: string }[] = [];
    for (const entry of this.setUpRepositories) {
      if (waivedWork.has(entry.name)) {
        const head = await localBranchCommit(this.git, expandHome(entry.worktreePath), this.record.settings.featureBranch);
        if (!head) throw new CompletionCheckUnavailable(`Cannot read ${this.labelOf(entry.name)}'s feature head to record its waived work.`);
        const repository = (repositories[entry.name] ??= { startCommit: head });
        delete repository.pushedSha; repository.waivedHead = head;
        continue;
      }
      const sha = shas[entry.name];
      if (sha === undefined) continue;
      const repository = (repositories[entry.name] ??= { startCommit: sha });
      repository.pushedSha = sha;
      const count = await firstParentCount(this.git, expandHome(entry.worktreePath), repository.startCommit, sha);
      if (count !== undefined) repository.commitCount = count;
      if (repository.startCommit !== sha) pushes.push({ name: entry.name, sha });
    }
    if (this.stopping) throw new CompletionCheckUnavailable("Completion acceptance was interrupted.");
    await finalTakeoverCheck();
    // A refused or failed save leaves no completion in memory that the saved record lacks.
    const before = structuredClone(this.record);
    facts.repositories = repositories;
    facts.doneAt ??= this.now().toISOString();
    facts.finishedByPerson = byPerson;
    if (this.commands?.active) facts.completedByOperation = this.commands.active.id;
    clearManualStop();
    waivedFacts();
    try { this.save(); } catch (error) { Object.assign(this.record, before); throw error; }
    // Waived work was not pushed, so the done line names no pushed commit for it.
    const prdSha = waivedWork.has(this.paths.repositoryName) ? undefined : shas[this.paths.repositoryName];
    // The done line lists the code repositories in list order, then the PRD's repository.
    const ordered = [...pushes.filter((push) => push.name !== this.paths.repositoryName), ...pushes.filter((push) => push.name === this.paths.repositoryName)];
    this.emit({
      kind: "phase",
      at: this.now(),
      phaseId: outcome.judgedLeafId,
      title: this.titleOf(outcome.judgedLeafId),
      event: "done",
      ...(prdSha ? { pushedSha: prdSha } : {}),
      ...(this.setUpRepositories.length > 1 ? { pushes: ordered } : {}),
    });
  }

  /** Auxiliary evidence never changes completion or launches a session. */
  refreshDeliveryHistory(): Promise<void> {
    if (!this.record.completedAt || this.stopping || this.closed) return Promise.resolve();
    if (this.deliveryReading) return this.deliveryReading;
    this.deliveryHistoryPending = true;
    this.deliveryHistoryError = undefined;
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(45_000)]);
    const executionId = this.record.executionId;
    const reading = Promise.resolve().then(async () => {
      const repositories: NonNullable<PrdRecord["deliveryHistory"]>["repositories"] = [];
      for (const entry of this.setUpRepositories) {
        const merged = this.record.mergedBranches?.find(branch => branch.repository === entry.name);
        const missingRanges: string[] = [];
        const history = await readDeliveryHistory({
          repository: entry.name, github: entry.github, cwd: entry.mainCheckoutPath,
          git: { ...this.git, signal }, gh: this.options.tools.gh,
          ranges: Object.entries(this.record.phases).filter(([key, facts]) => activityKeyKind(key) !== "final_delivery" && activityKeyKind(key) !== "preflight" && facts.doneAt).flatMap(([key, facts]) => {
            const receipt = facts.repositories[entry.name];
            if (receipt && (!receipt.startCommit || !receipt.pushedSha)) missingRanges.push(`Phase ${key} has an incomplete recorded commit range.`);
            return receipt?.startCommit && receipt.pushedSha ? [{ start: receipt.startCommit, end: receipt.pushedSha }] : [];
          }),
          ...(entry.baseCommit && merged ? { baseHistory: { start: entry.runStartCommit ?? entry.baseCommit, end: merged.baseCommit, branch: entry.baseBranch } } : {}),
        });
        history.problems.push(...missingRanges);
        repositories.push(history);
      }
      if (this.closed || this.stopping || this.record.executionId !== executionId) return;
      this.record.deliveryHistory = { checkedAt: this.now().toISOString(), repositories };
      this.save();
    }).catch(error => { if (!this.closed && !this.stopping) this.deliveryHistoryError = `Delivery history unavailable: ${(error as Error).message}`; }).finally(() => {
      this.deliveryReading = undefined; this.deliveryHistoryPending = false; this.changed();
    });
    this.deliveryReading = reading;
    this.changed();
    return reading;
  }

  private complete(pullRequests: PullRequestFacts[], byPerson: boolean, mergedBranches: MergedBranchFacts[] = [], checks: CheckResult[] = [], waiver?: Waiver, waivedHeads: Record<string, string> = {}): void {
    const { record } = this;
    const facts = this.phaseFacts(PR_PHASE_KEY);
    const at = this.now().toISOString();
    delete facts.stop;
    if (waiver) { (record.waivers ??= []).push(waiver); facts.waiverId = waiver.waiverId; record.controlApplied = { operationId: waiver.operationId, outcome: "marked_complete" }; }
    else if (checks.some(check => check.waived)) facts.completionChecks = structuredClone(checks);
    for (const [name, head] of Object.entries(waivedHeads)) (facts.repositories[name] ??= { startCommit: head }).waivedHead = head;
    facts.doneAt ??= at;
    facts.finishedByPerson = byPerson;
    record.pullRequests = pullRequests;
    if (mergedBranches.length) record.mergedBranches = mergedBranches;
    else delete record.mergedBranches;
    record.completedAt ??= at;
    // A run completed with no pull request session holds its limits from now (AC-LAST-03, "Loops and the Ledger").
    this.freezeLimits();
    if (record.planReconciliation) delete record.planReconciliation.handback;
    if (record.billing) { delete record.billing.approval; delete record.billing.current; delete record.billing.hold; }
    // A pending pause is dropped, since nothing would start (UI-008).
    record.pause = {};
    this.current = undefined;
    this.save();
    this.emit({
      kind: "pull_request",
      at: this.now(),
      event: deliveryEnabled(record) || mergedBranches.length ? "completed" : "opened",
      ...(pullRequests[0] ? { number: pullRequests[0].number } : {}),
      ...(deliveryEnabled(record) ? { summary: developmentDeliverySummary(record, (name) => this.labelOf(name)) } : {}),
      ...(mergedBranches.length ? { summary: [...pullRequests.map(pull => `${this.labelOf(pull.repository)} #${pull.number} ready`), ...mergedBranches.map(branch => `${this.labelOf(branch.repository)} already merged into ${branch.base}`)].join(" · ") } : {}),
      ...(this.setUpRepositories.length > 1 ? { opened: pullRequests.map((pull) => ({ repository: pull.repository, number: pull.number })) } : {}),
    });
  }

  private activatePause(): void {
    this.record.pause.activeSince = this.now().toISOString();
    this.current = undefined;
    this.save();
  }

  private recordStop(phaseKey: string, kind: StopKind, checks: CheckResult[], interrupted?: PhaseStop["interrupted"], limit?: StopLimit, checkedAt?: string, locate?: SavedQuestion[]): void {
    // A real stop replaces the overview with its own recovery controls.
    if (this.restartReview) { this.restartReview = undefined; this.reviewingRestart = false; }
    // A merge or push stop leaves the early-merge ledger's completion result as it was (Kiln After Delivery, "Ending").
    if (deliveryEnabled(this.record) && !isAfterDeliveryKey(phaseKey)) ledger(this.record).currentComplete = false;
    this.decisions.delete(phaseKey);
    const at = this.now().toISOString();
    const facts = this.phaseFacts(phaseKey);
    const alreadyStopped = facts.stop !== undefined || this.record.billing?.hold?.phaseKey === phaseKey;
    facts.stop = { kind, at, checks: markReasonRows(itemize(checks, phaseKey)), checkedAt: checkedAt ?? at, run: this.newRun("stop"), ...(interrupted === undefined ? {} : { interrupted }), ...(limit === undefined ? {} : { limit }), ...(locate?.length ? { locate } : {}) };
    this.save();
    // A session's requests are asked about on any stop its phase reaches, once the search finishes (AC-ASK-07).
    void this.refreshRequestQuestions(phaseKey);
    this.readStoppedCommits(phaseKey);
    // The one place a stop prints its line (AC-START-09). Replacing a retained stop or a hold is the same Needs you, already said.
    if (!alreadyStopped) this.emitSessionEvent(phaseKey, "stopped");
    // The account card shows a reading taken after the refusal (usage-limit recovery AC-LIMIT-03).
    if (limit !== undefined) this.askReading();
  }

  /**
   * A recheck of the stop: its rows and a new check run, `finished: false` when it could not finish (waivers "Check Runs").
   * `completion` says whether the rows are the activity's completion checks or only the check that stopped Kiln (AC-STOPCHECK-03).
   */
  private updateStop(phaseKey: string, checks: CheckResult[], completion: boolean, finished = true): void {
    const stop = this.record.phases[phaseKey]!.stop!;
    if (finished) {
      stop.checks = markReasonRows(itemize(checks, phaseKey));
      if (completion) stop.rowsAreCompletionChecks = true; else delete stop.rowsAreCompletionChecks;
    }
    stop.checkedAt = this.now().toISOString();
    stop.run = this.newRun("recheck", finished);
    this.save();
    this.readStoppedCommits(phaseKey);
  }

  /** A recheck that could not finish: a new unfinished run, the earlier rows kept with their own time. */
  private unfinishedRecheck(phaseKey: string): void {
    const hold = this.record.billing?.hold;
    if (hold?.phaseKey === phaseKey) { hold.run = this.newRun("recheck", false); this.save(); return; }
    const stop = this.record.phases[phaseKey]?.stop;
    if (!stop) return;
    stop.run = this.newRun("recheck", false);
    this.save();
  }

  private newRun(origin: CheckRun["origin"], finished = true): CheckRun {
    return { id: randomUUID(), at: this.now().toISOString(), origin, finished };
  }

  // ---- Waivers (waivers technical design) ---------------------------------------------------

  /**
   * A leaf closed by waiver or skipped under a plan waiver counts as closed (waivers "Effective plan"),
   * and so does a phase finished before an execution Continue created (Kiln After Delivery AC-BACK-01).
   */
  private waiverClosed(phaseId: string): boolean {
    return !!this.record.phases[phaseId]?.skippedByWaiver || !!closedWaiver(this.record.waivers, phaseId) || this.carriedWaived().has(phaseId) || this.carriedFinished().has(phaseId);
  }

  /** Leaves an earlier execution completed or skipped on a waiver, carried through the plan baseline (waivers "Continuation executions"). */
  private carriedWaived(): Set<string> {
    const id = this.record.continuation ? this.record.planReconciliation?.baselineId : undefined;
    if (!id) return new Set();
    if (this.carriedWaivedCache?.id !== id) {
      let ids: string[] = [];
      try { ids = Object.entries(readBaseline(this.stateDirectory, id).completions).filter(([, receipt]) => receipt.waiverId).map(([phaseId]) => phaseId); } catch { /* An unreadable baseline stops at the plan read, not here. */ }
      this.carriedWaivedCache = { id, ids: new Set(ids) };
    }
    return this.carriedWaivedCache.ids;
  }
  private carriedWaivedCache: { id: string; ids: Set<string> } | undefined;
  /** Every carried leaf that counts as closed: carried on a waiver, or finished before Continue (Kiln After Delivery AC-BACK-01). */
  private carriedClosed(): Set<string> { return new Set([...this.carriedWaived(), ...this.carriedFinished()]); }

  /**
   * The carried-finished set (Kiln After Delivery "The Plan Check", step 3): the completions with no
   * waiver in the baseline Continue activated this execution with. Each counts as closed whatever its
   * document now says; an execution a folder start created has none.
   */
  private carriedFinished(): Set<string> {
    const id = this.record.continuationBaselineId;
    if (!id) return new Set();
    if (this.carriedFinishedCache?.id !== id) {
      let ids: string[] = [];
      try { ids = Object.entries(readBaseline(this.stateDirectory, id).completions).filter(([, receipt]) => !receipt.waiverId).map(([phaseId]) => phaseId); } catch { /* An unreadable baseline stops at the plan read, not here. */ }
      this.carriedFinishedCache = { id, ids: new Set(ids) };
    }
    return this.carriedFinishedCache.ids;
  }
  private carriedFinishedCache: { id: string; ids: Set<string> } | undefined;
  /** A plan with every carried-finished leaf closed, as the execution reads it (AC-BACK-01); the documents are untouched. */
  private withCarriedFinished(plan: PhasePlan): PhasePlan {
    const carried = this.carriedFinished();
    return carried.size ? { ...plan, phases: plan.phases.map(phase => phase.splitInto === undefined && !phase.closed && carried.has(phase.id) ? { ...phase, closed: true } : phase) } : plan;
  }

  /**
   * The phases Normal Order takes its order from while the plan does not read: the readable
   * phases the parser returns, otherwise the plan Kiln last recorded (AC-WAIVE-04).
   */
  private orderSource(): PlannedPhase[] {
    try {
      const directory = join(this.worktreePath, ...this.paths.prdDirectoryFromRoot.split("/"));
      const files = readdirSync(directory).filter(isPhaseFileName).map(fileName => ({ fileName, markdown: readFileSync(join(directory, fileName), "utf8") }));
      const readable = readPhasePlan(files).phases;
      if (readable.length) return readable;
    } catch { /* Unreadable: the recorded plan is the order source. */ }
    const directory = join(this.worktreePath, ...this.paths.prdDirectoryFromRoot.split("/"));
    return (this.record.plan ?? []).filter(phase => existsSync(join(directory, phase.file))).map(phase => ({ id: phase.id, fileName: phase.file, title: phase.title, closed: phase.closed, repositories: phase.repositories, ...(phase.attended === undefined ? {} : { attended: phase.attended }), ...(phase.earlyMerge === undefined ? {} : { earlyMerge: phase.earlyMerge }), ...(phase.modelTier === undefined ? {} : { modelTier: phase.modelTier }), splitInto: phase.splitInto, citedCriteria: [], dependenciesText: undefined }));
  }

  /** The leaves a Closed-line item is judged against: the plan as read, else the order source. */
  private isLeaf(phaseId: string): boolean {
    const read = readPlanAt(this.worktreePath, this.paths.prdDirectoryFromRoot);
    const phases = read.ok ? read.plan.phases : this.orderSource();
    return phases.some(phase => phase.id === phaseId && phase.splitInto === undefined);
  }

  /**
   * Items, their fingerprints and waiver coverage for a check run that decides what happens next
   * (waivers "Coverage"): every caller reads `passed` only after this.
   */
  private async markChecks(activityKey: string, checks: CheckResult[]): Promise<boolean> {
    itemize(checks, activityKey);
    if (checks.some(check => check.items?.some(item => !item.against))) {
      const fingerprints = await readRepositoryFingerprints(this.git, this.setUpRepositories.map(entry => ({ name: entry.name, mainCheckoutPath: entry.mainCheckoutPath, worktreePath: expandHome(entry.worktreePath) })), this.record.settings.featureBranch);
      fillAgainst(checks, fingerprints);
    }
    applyWaivers(this.record.waivers ?? [], checks, { isLeaf: id => this.isLeaf(id) });
    return checks.every(check => check.passed);
  }

  private readStoppedCommits(phaseKey: string): void {
    const reading = this.refreshStoppedCommits(phaseKey).finally(() => {
      if (this.stoppedCommitsReading === reading) this.stoppedCommitsReading = undefined;
    });
    this.stoppedCommitsReading = reading;
  }

  /** The stopped phase's commits so far, read from Git when it stops and on each check, for Full session output (AC-WATCH-06). */
  private async refreshStoppedCommits(phaseKey: string): Promise<void> {
    if (phaseKey === PR_PHASE_KEY || this.stopping) return;
    try {
      const commits = await this.phaseCommits(phaseKey);
      this.stoppedCommits = { phaseKey, commits };
      this.changed();
    } catch {
      // The worktree may be gone; the stop's own checks already say so, and Commits shows none.
    }
    await this.refreshStoppedWork(phaseKey);
  }

  /**
   * Reads a stopped or held phase's work (run restart "Work"): when the stop is recorded, at each
   * recheck, when the page is opened, and before a session starts. A read that fails is kept as
   * unknown, naming the read.
   */
  async refreshStoppedWork(phaseKey = this.stoppedPhase() ?? this.heldHistoryKey()): Promise<WorkRead | undefined> {
    if (phaseKey === undefined || activityKeyKind(phaseKey) !== "phase" || this.stopping) return undefined;
    const facts = this.record.phases[phaseKey];
    let read: WorkRead;
    try {
      read = await readPhaseWork(this.git, this.setUpRepositories.map(entry => ({ name: entry.name, label: this.labelOf(entry.name), worktreePath: expandHome(entry.worktreePath), baseBranch: entry.baseBranch, startCommit: facts?.repositories[entry.name]?.startCommit })), this.record.settings.featureBranch);
    } catch (error) { read = { unknown: `Kiln couldn't read the phase's work: ${(error as Error).message}` }; }
    // The catch-up offer is read with Work, at Work's moments; a read that fails gives no offer and the page names it through Work (AC-CURRENT-01).
    let offer: CatchUpOffer | undefined;
    // Only a stopped phase gets the offer: a held phase, a wait and every other page get none.
    if (!("unknown" in read) && this.stoppedPhase() === phaseKey) {
      try { offer = await this.readStoppedCatchUp(); }
      catch (error) { read = { unknown: (error as Error).message }; }
    }
    this.stoppedCatchUp = { phaseKey, offer };
    this.stoppedWork = { phaseKey, read };
    this.changed();
    return read;
  }

  /**
   * The phase at Needs you when it is a stopped phase (run restart "A Stopped Phase's Facts"): an
   * implementation leaf that is not held, one of whose sessions has a run, with a `done_check` or
   * `not_resumable` stop or a billing hold on a resume. A launch hold is not one while it lasts.
   */
  stoppedPhase(): string | undefined {
    const key = this.stoppedPhaseKey();
    if (key === undefined || key === PR_PHASE_KEY || activityKeyKind(key) === "requirements" || this.auditActivity(key) || isPreflightKey(key) || this.record.liveControl) return undefined;
    const hold = this.record.billing?.hold?.phaseKey === key ? this.record.billing.hold : undefined;
    if (hold && hold.action !== "resume") return undefined;
    const kind = this.record.phases[key]?.stop?.kind;
    if (!hold && kind !== "done_check" && kind !== "not_resumable") return undefined;
    return this.phaseRunCount(key) > 0 ? key : undefined;
  }

  /** The held phase whose saved conversation can't be reopened (run restart AC-CARRY-06), if any. */
  heldHistoryKey(): string | undefined {
    const hold = this.record.liveControl?.takeover;
    return hold?.history ? hold.target.activityKey : undefined;
  }

  /** The work last read for the phase, or undefined before the first read finishes. */
  workOf(phaseKey: string): WorkRead | undefined {
    return this.stoppedWork?.phaseKey === phaseKey ? this.stoppedWork.read : undefined;
  }

  /** A stopped phase's case (AC-CASE-01): no conversation began, one began and the phase built nothing, or today's page. */
  stoppedCase(phaseKey: string): "could_not_start" | "built_nothing" | "needs_input" {
    if (!this.conversationBegan(phaseKey)) return "could_not_start";
    const work = this.workOf(phaseKey);
    return work && !("unknown" in work) && work.builtNothing ? "built_nothing" : "needs_input";
  }

  /**
   * A plan that doesn't read when no session has run since the last read: a `plan` stop on the
   * first leaf not closed in the recorded plan, or on the pull request when every leaf there is.
   */
  private recordPlanStop(problem: string): { kind: "plan_stop"; phaseKey: string } {
    const key = this.nextKeyFromRecordedPlan();
    this.current = undefined;
    this.recordStop(key, "plan", [{ name: CHECK_NAMES.plan, passed: false, facts: [problem] }]);
    return { kind: "plan_stop", phaseKey: key };
  }


  // ---- Waiting out a usage limit (usage-limit recovery technical design, "The Wait") ------

  /** The phase waiting for usage, if any. */
  waitingPhaseKey(): string | undefined {
    return Object.entries(this.record.phases).find(([, facts]) => facts.wait !== undefined)?.[0];
  }

  /**
   * The refused run a wait or a usage-limit stop is about: the wait's own run, or the stopped
   * session's latest run.
   */
  refusedRun(phaseKey: string): { session: SessionRecord; runIndex: number; refusal: LimitRefusal } | undefined {
    const facts = this.record.phases[phaseKey];
    if (!facts) return undefined;
    const session = facts.wait ? this.sessionRecord(phaseKey, facts.wait.sessionId) : this.latestSession(phaseKey);
    const runIndex = facts.wait ? facts.wait.run : (session?.runs.length ?? 0) - 1;
    const refusal = session?.runs[runIndex]?.limitRefusal;
    return session && refusal ? { session, runIndex, refusal } : undefined;
  }

  /** A wait's limit as its terminal lines name it. */
  private waitLimit(phaseKey: string): { label: string; resetsAt?: string } {
    const refusal = this.refusedRun(phaseKey)?.refusal;
    return { label: refusal?.label ?? UNKNOWN_LIMIT_LABEL, ...(refusal?.resetsAt === undefined ? {} : { resetsAt: refusal.resetsAt }) };
  }

  /**
   * A session that ended on its own refused by a usage limit, its check failed (AC-AUTO-01,
   * AC-AUTO-05): Needs you when Kiln's own resume was refused again by the same limit on the same
   * account; a wait while the setting is on and its
   * transcript is there; otherwise Needs you with the limit's facts.
   */
  private settleRefused(phaseKey: string, session: SessionRecord, runIndex: number, checks: CheckResult[]): Verdict {
    const run = session.runs[runIndex]!;
    const limit = stopLimit(run.limitRefusal!);
    const kind: StopKind = phaseKey === PR_PHASE_KEY ? "pull_request_check" : "done_check";
    // An activity that hasn't started needs no saved conversation to wait (Kiln Phase Model Tiers, "A Wait Before the Start").
    const notStarted = this.choiceActivity(phaseKey) && !this.startedSessionOf(phaseKey);
    if (session.agentId === "codex") {
      if (this.record.settings.resumeAfterUsageLimit && !this.codexSafetyProblems(phaseKey).length && (notStarted || !this.transcriptMissing(session))) {
        this.recordWait(phaseKey, session, runIndex, checks);
        return { kind: "waiting" };
      }
      this.recordStop(phaseKey, kind, checks, undefined, limit);
      return { kind: "stopped" };
    }
    if (run.cause === "limit_resume" && this.refusedAgain(session, runIndex) || run.cause === "launch" && this.refusedAgainAcross(phaseKey, session, runIndex)) {
      this.recordStop(phaseKey, kind, checks, undefined, { ...limit, refusedAgainAt: run.startedAt });
      return { kind: "stopped" };
    }
    if (this.record.settings.resumeAfterUsageLimit && (notStarted || !this.transcriptMissing(session))) {
      this.recordWait(phaseKey, session, runIndex, checks);
      return { kind: "waiting" };
    }
    this.recordStop(phaseKey, kind, checks, undefined, limit);
    return { kind: "stopped" };
  }

  /**
   * Kiln's own resume was refused before the session got any response, by the same limit on the
   * same account as the run it resumed (AC-AUTO-05): a type missing on both counts as equal, an
   * unknown account as the same.
   */
  private refusedAgain(session: SessionRecord, runIndex: number): boolean {
    const run = session.runs[runIndex]!;
    const previous = session.runs[runIndex - 1]?.limitRefusal;
    if (previous === undefined || run.limitRefusal === undefined) return false;
    if (eventsOfRun(this.options.stateDirectory, session, runIndex).some((saved) => isModelResponse(saved.event))) return false;
    return sameAccount(run.account, previous.account) && run.limitRefusal.rateLimitType === previous.rateLimitType;
  }

  /**
   * AC-AUTO-05's rule across two sessions (Kiln Phase Model Tiers, "A Wait Before the Start"): a
   * launch that ended a wait was refused in turn before any response, by the same limit on the same
   * account as the refused run it follows.
   */
  private refusedAgainAcross(key: string, session: SessionRecord, runIndex: number): boolean {
    const run = session.runs[runIndex]!;
    const follows = session.relaunchOf;
    if (runIndex !== 0 || !follows || run.limitRefusal === undefined) return false;
    const previous = this.sessionRecord(key, follows.sessionId)?.runs[follows.run]?.limitRefusal;
    if (previous === undefined || previous.agentId === "codex") return false;
    if (eventsOfRun(this.options.stateDirectory, session, runIndex).some((saved) => isModelResponse(saved.event))) return false;
    return sameAccount(run.account, previous.account) && run.limitRefusal.rateLimitType === previous.rateLimitType;
  }

  /** Records the wait, prints its line, and only then asks for a reading. */
  private recordWait(phaseKey: string, session: SessionRecord, runIndex: number, checks: CheckResult[]): void {
    const facts = this.record.phases[phaseKey]!;
    const at = this.now().toISOString();
    facts.wait = { since: at, sessionId: session.sessionId, run: runIndex, checks, checkedAt: at };
    this.save();
    this.readStoppedCommits(phaseKey);
    this.emitSessionEvent(phaseKey, "waiting", this.waitLimit(phaseKey));
    this.watchWait();
  }

  /**
   * Turns the wait into Needs you (the setting switched off, a check that fails Stayed in the
   * workspace, a reading with nothing to wait for): the check's results, `at` now, the limit
   * from the refusal.
   */
  private waitToStop(phaseKey: string, checks: CheckResult[], checkedAt?: string): void {
    const facts = this.record.phases[phaseKey]!;
    if (isPreflightKey(phaseKey) && !this.codexSafetyProblems(phaseKey).length) {
      // A preflight's refused run that Kiln will not resume has ended, so it is read (Reading the Result).
      delete facts.wait;
      this.unwatchWait();
      const read = this.latestPreflightReport(phaseKey);
      this.applyPreflightReport(this.preflightActivity(phaseKey)!, read.report, read.sessionId, read.run);
      this.updateKeepAwake();
      return;
    }
    const refusal = this.refusedRun(phaseKey)?.refusal;
    delete facts.wait;
    this.unwatchWait();
    this.recordStop(phaseKey, phaseKey === PR_PHASE_KEY ? "pull_request_check" : isAfterDeliveryKey(phaseKey) ? this.afterDeliveryOps(phaseKey).stopKind : "done_check", checks, undefined, refusal ? stopLimit(refusal) : undefined, checkedAt);
    this.updateKeepAwake();
  }

  /**
   * The wait's check: at `kiln run` (`restart`), at the end of a wait (`limit_resume`) or at
   * Resume now (`person_resume`). A pass is Done, finished by the person. A failure keeps the
   * wait, with these results, unless its transcript
   * is gone, or (except at Resume now) the setting is off: then it is Needs you.
   */
  private async recheckWait(phaseKey: string, mode: "restart" | ResumeRequest["cause"]): Promise<"done" | "complete" | "stopped" | "failed" | "stopping" | "folder_missing"> {
    // The end of a wait checks the run's folders before its completion check (AC-GONE-01); the
    // wait stays as it is, judged again after recovery.
    if (mode === "limit_resume" && !await this.folderGuard({ mayLeave: false })) return "folder_missing";
    const facts = this.record.phases[phaseKey]!;
    let checks: CheckResult[];
    if (isPreflightKey(phaseKey) || activityKeyKind(phaseKey) === "requirements") {
      // A waiting stage or preflight has not ended: its result is read once the resumed run ends (Reading the Result).
      checks = [];
    } else if (phaseKey === PR_PHASE_KEY) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return "stopping";
      if (check.passed) {
        delete facts.wait;
        this.unwatchWait();
        this.complete(check.pullRequests ?? [], true, check.mergedBranches, check.checks);
        this.updateKeepAwake();
        return "complete";
      }
      if (this.finalNeedsAudits(check)) { delete facts.wait; this.unwatchWait(); return "done"; }
      checks = check.checks;
    } else if (isAfterDeliveryKey(phaseKey)) {
      // The resume after a usage-limit wait takes the activity's own reading first (Kiln After Delivery, "At the stop"):
      // done ends the activity without resuming; a reading that failed, or a folder not ready, resumes nothing.
      const ops = this.afterDeliveryOps(phaseKey);
      const result = await ops.read();
      if (this.stopping) return "stopping";
      if (result.done) { this.unwatchWait(); ops.done(); this.updateKeepAwake(); return "complete"; }
      const folder = result.unreadable ? undefined : await ops.folder();
      if (this.stopping) return "stopping";
      if (result.unreadable || folder) { this.waitToStop(phaseKey, folder ? [...result.checks, folder] : result.checks); return "stopped"; }
      checks = result.checks;
    } else {
      const outcome = await this.doneCheck(phaseKey);
      if (outcome === "stopping" || this.stopping) return "stopping";
      if (outcome.passed) {
        delete facts.wait;
        this.unwatchWait();
        await this.recordDone(phaseKey, outcome, true);
        this.updateKeepAwake();
        return "done";
      }
      if (outcome.unavailable) { this.waitToStop(phaseKey, outcome.checks); return "stopped"; }
      checks = outcome.checks;
    }
    const session = this.latestSession(phaseKey);
    const settingOff = mode !== "person_resume" && !this.record.settings.resumeAfterUsageLimit;
    const notStarted = this.choiceActivity(phaseKey) && !this.startedSessionOf(phaseKey);
    if (settingOff || this.codexSafetyProblems(phaseKey).length || (!notStarted && session !== undefined && this.transcriptMissing(session))) {
      this.waitToStop(phaseKey, checks);
      return "stopped";
    }
    facts.wait!.checks = checks;
    facts.wait!.checkedAt = this.now().toISOString();
    this.save();
    this.readStoppedCommits(phaseKey);
    // A restarted wait keeps nothing derived from earlier readings.
    if (mode === "restart") this.unwatchWait();
    return "failed";
  }

  /**
   * Resume now, or the end of a wait: `checking` is held from here until the resumed run starts
   * or a stop or Done is recorded (AC-RESUME-02); the wait's check first, then the resume.
   */
  private async resumeWait(phaseKey: string, cause: ResumeRequest["cause"]): Promise<Awaited<ReturnType<Engine["recheckWait"]>> | undefined> {
    if (this.reviewingRestart) return;
    if (cause === "limit_resume" && !this.commands.active) {
      if (this.commands.busy || this.checking || this.driving) return;
      const view = this.controlView();
      this.commands.submit({ command_id: `auto-${createHash("sha256").update(view.target).digest("hex")}`, execution_id: this.record.executionId!, status_token: view.token, action: "resume", inputs: {} }, "automatic");
      return;
    }
    if (this.record.billing?.hold && cause === "limit_resume") return;
    this.checking = true;
    this.changed();
    let verdict: Awaited<ReturnType<Engine["recheckWait"]>> | undefined;
    try {
      verdict = await this.recheckWait(phaseKey, cause);
    } finally {
      if (verdict !== "failed" || this.stopping) {
        this.checking = false;
        this.changed();
      }
    }
    if (verdict === "failed" && !this.stopping) this.requestedResume = { phaseKey, cause };
    this.kick();
    return verdict;
  }

  /** Starts watching the recorded wait in this run of Kiln: sleep, keep-awake, the reset reading and a reading now. */
  private watchWait(): void {
    // A wait neither resumes nor stops while a folder is missing; it is checked again after recovery.
    if (this.folderMissing) return;
    const key = this.waitingPhaseKey();
    if (this.reviewingRestart || key === undefined || this.record.billing?.hold || this.closed || this.stopping || this.waitWatch?.phaseKey === key) return;
    this.unwatchWait();
    this.waitWatch = { phaseKey: key, readings: 0 };
    this.watchSleep();
    this.updateKeepAwake();
    this.armResetReading();
    // Startup metadata can finish while the restart checks run. A fresh post-refusal
    // reading from this metadata generation must reach the wait once it exists.
    const reading = this.freshReading;
    const refusal = this.refusedRun(key)?.refusal;
    if (refusal && this.waitAgent(key) === "codex") {
      const codexReading = this.readers.codex.state.pending ? undefined : this.readers.codex.state.account;
      if (codexReading && Date.parse(codexReading.startedAt) >= Date.parse(refusal.at)) this.codexReadingArrived(codexReading);
    } else if (reading && refusal && Date.parse(reading.startedAt) >= Date.parse(refusal.at)) this.readingArrived(reading);
    if (!this.checking && this.waitingPhaseKey() === key) this.askReading();
    this.changed();
  }

  private unwatchWait(): void {
    if (this.waitWatch?.resetTimer) clearTimeout(this.waitWatch.resetTimer);
    this.waitWatch = undefined;
  }

  /**
   * A reading at the limit's reset time plus 60 seconds, armed from the wall clock, since a
   * timer doesn't count time asleep; re-armed until the reset when that is beyond one timer's reach.
   */
  private armResetReading(): void {
    const watch = this.waitWatch;
    if (!watch) return;
    if (watch.resetTimer) clearTimeout(watch.resetTimer);
    delete watch.resetTimer;
    const found = this.refusedRun(watch.phaseKey);
    if (!found || found.session.agentId === "codex") return;
    const schedule = automaticResumeSchedule(found.refusal, this.claude?.account, found.session.initModel ?? found.session.model);
    if (schedule.at === undefined) return;
    const due = Date.parse(schedule.at) - this.now().getTime();
    if (due <= 0) return;
    const delay = Math.min(due, LONGEST_TIMER_MS);
    watch.resetTimer = setTimeout(() => {
      if (delay < due) return this.armResetReading();
      this.changed();
      this.askReading();
    }, delay);
    watch.resetTimer.unref();
  }

  /** Asks for a reading; one already under way is joined. */
  private askReading(): void {
    const key = this.waitingPhaseKey() ?? this.limitStopKey();
    // A wait on an activity that hasn't started reads its sessions' histories at each reading (Kiln Phase Model Tiers, "When an Activity Starts").
    if (key !== undefined && this.waitsBeforeStart(key)) { if (this.stopWaitOnUnusableChoice(key)) return; void this.readStart(key); }
    if (key !== undefined && this.waitAgent(key) === "codex") void this.readers.codex.refresh();
    else void this.claude?.refreshAccount();
  }

  private codexReadingArrived(reading: AgentAccount): void {
    // A wait neither resumes nor stops while a folder is missing; it is checked again after recovery.
    if (this.folderMissing) return;
    if (this.stopping || this.checking) return;
    const key = this.waitingPhaseKey() ?? this.limitStopKey();
    if (key === undefined) return;
    if (this.fallbackEndsWait(key, reading.startedAt)) return;
    const found = this.refusedRun(key);
    if (!found || this.waitAgent(key) !== "codex") return;
    if (Date.parse(reading.startedAt) < Date.parse(found.refusal.at)) { this.askReading(); return; }
    if (this.waitsBeforeStart(key)) { this.codexReadingBeforeStart(key, found.refusal.at, reading); return; }
    if (found.session.agentId !== "codex") return;
    const release = codexUsageRelease(found.session, found.refusal, reading);
    writeSessionRecord(this.options.stateDirectory, found.session);
    const facts = this.record.phases[key]!;
    if (!facts.wait || this.waitWatch?.phaseKey !== key) return;
    if (release.state === "allowed") void this.resumeWait(key, "limit_resume");
    else if (release.state === "unknown" || release.administrative) this.waitToStop(key, facts.wait.checks, facts.wait.checkedAt);
  }

  /**
   * A new account reading (technical design, "While it lasts"). One that started before the
   * refusal is ignored and another asked for. The first signed-in reading after it records the
   * refused account, and the first with the limit's row its label. While a wait is watched and
   * no resume holds the lock, the reading decides: usage left resumes; no usage left waits; one
   * that fails or can't decide resumes past the reset time, and goes to Needs you when there is
   * no reset time and it is the wait's first reading.
   */
  private readingArrived(reading: AccountView): void {
    // A wait neither resumes nor stops while a folder is missing; it is checked again after recovery.
    if (this.folderMissing) return;
    if (this.record.billing?.hold) return;
    if (this.stopping || this.checking) return;
    const key = this.waitingPhaseKey() ?? this.limitStopKey();
    if (key === undefined) return;
    if (this.fallbackEndsWait(key, reading.startedAt)) return;
    const found = this.refusedRun(key);
    if (!found || this.waitAgent(key) !== "claude_code") return;
    const { session, refusal } = found;
    if (Date.parse(reading.startedAt) < Date.parse(refusal.at)) {
      this.askReading();
      return;
    }
    // A wait whose activity hasn't started watches the account its current choice runs on; a
    // different choice than the one refused ends once no counted limit reads 100% (AC-PICK-07).
    if (this.waitsBeforeStart(key) && !this.sameAsRefused(key, session)) { this.claudeReadingForOtherChoice(key, reading); return; }
    const facts = this.record.phases[key]!;
    let changed = false;
    const account = readingAccount(reading);
    if (refusal.account === undefined && account !== undefined) {
      refusal.account = account;
      changed = true;
    }
    const row = limitRow(refusal.rateLimitType, reading.limits);
    if (row !== undefined && refusal.label !== row.label) {
      refusal.label = row.label;
      changed = true;
      if (facts.stop?.limit) {
        facts.stop.limit.label = row.label;
        this.save();
      }
    }
    if (changed) writeSessionRecord(this.options.stateDirectory, session);

    const watch = this.waitWatch;
    if (facts.wait === undefined || watch?.phaseKey !== key) return;
    const first = watch.readings === 0;
    watch.readings++;
    this.armResetReading();
    const verdict = judgeReading(reading, refusal, session.initModel ?? session.model);
    if (verdict === "no_usage_left") return;
    const schedule = automaticResumeSchedule(refusal, reading, session.initModel ?? session.model);
    const resetPassed = schedule.at !== undefined && this.now().getTime() >= Date.parse(schedule.at);
    if (verdict === "usage_left" || resetPassed) void this.resumeWait(key, "limit_resume");
    else if (refusal.resetsAt === undefined && first) this.waitToStop(key, facts.wait.checks, facts.wait.checkedAt);
  }

  /**
   * A reading whose decision finds the current choice can't be used, or its agent isn't ready, ends
   * the wait: the activity stops with the `selection` stop, as at a launch (Kiln Phase Model Tiers, "A Wait Before the Start").
   */
  private stopWaitOnUnusableChoice(key: string): boolean {
    const facts = this.record.phases[key];
    if (!facts?.wait || !this.waitsBeforeStart(key)) return false;
    const choice = this.notStartedChoice(key);
    const problem = !this.installed(choice.agentId) ? choiceStopFact({ ...choice, problem: installRemedy(choice.agentId) }, key) : choice.problem && !choice.problem.startsWith("Reading ") ? choiceStopFact(choice, key) : undefined;
    if (problem === undefined) return false;
    delete facts.wait;
    this.unwatchWait();
    this.current = undefined;
    this.recordStop(key, "selection", [{ name: "Agent selection and readiness", passed: false, facts: [problem] }]);
    this.updateKeepAwake();
    this.changed();
    return true;
  }

  /**
   * A reading, of either agent, taken after the refusal of an activity that hasn't started runs
   * the launch decision (Kiln Phase Model Tiers, "A Wait Before the Start", the fallback row): one
   * naming the fallback ends the wait now, and the launch that ends it decides again on readings
   * taken for it. True when it ended the wait.
   */
  private fallbackEndsWait(key: string, readingStartedAt: string): boolean {
    if (this.record.phases[key]?.wait === undefined || this.waitWatch?.phaseKey !== key || !this.waitsBeforeStart(key)) return false;
    const refused = this.refusedRun(key);
    if (!refused || Date.parse(readingStartedAt) < Date.parse(refused.refusal.at)) return false;
    if (!this.forecastDecision(key, true)) return false;
    this.waitWatch.readings++;
    // The launch-only checks run before the wait ends, so a launch that ends it isn't reversed onto the refused choice.
    if (this.fallbackWaitCheck === key) return true;
    this.fallbackWaitCheck = key;
    void this.decideLaunch(key, true).then(decided => {
      if (this.fallbackWaitCheck === key) this.fallbackWaitCheck = undefined;
      if (decided?.launch.fallback?.used && this.waitsBeforeStart(key) && this.waitWatch?.phaseKey === key && !this.stopping) void this.resumeWait(key, "limit_resume");
    }, () => { if (this.fallbackWaitCheck === key) this.fallbackWaitCheck = undefined; });
    return true;
  }
  private fallbackWaitCheck: string | undefined;

  /** A wait on an activity that hasn't started (Kiln Phase Model Tiers, "A Wait Before the Start"). */
  private waitsBeforeStart(key: string): boolean {
    return this.choiceActivity(key) && !this.startedSessionOf(key) && this.record.phases[key]?.wait !== undefined;
  }

  /** Whether the activity's current choice is the agent, model and effort the refused session ran on. */
  private sameAsRefused(key: string, session: SessionRecord): boolean {
    const choice = this.notStartedChoice(key);
    return choice.agentId === (session.agentId ?? "claude_code") && choice.model === session.model && (choice.effort ?? undefined) === (session.effort ?? undefined);
  }

  /**
   * A Claude Code reading for a wait whose choice changed since the refusal (the person changed it,
   * or Model defaults changed): the refusal says nothing about that choice, so the wait ends once a
   * reading shows no counted limit at 100%, or can't be read. A limit at 100% keeps the wait, with
   * a reading at that limit's reset.
   */
  private claudeReadingForOtherChoice(key: string, reading: AccountView): void {
    const watch = this.waitWatch;
    if (this.record.phases[key]?.wait === undefined || watch?.phaseKey !== key) return;
    watch.readings++;
    if (this.stopWaitOnUnusableChoice(key)) return;
    const model = this.notStartedChoice(key).model ?? "";
    const full = reading.error || reading.limitsError ? [] : reading.limits.filter(limit => countedFor(limit, model) && limit.percent !== undefined && limit.percent >= 100);
    if (!full.length) { void this.resumeWait(key, "limit_resume"); return; }
    const reset = full.map(limit => limit.resetsAt).filter((at): at is string => !!at).sort().at(-1);
    if (watch.resetTimer) clearTimeout(watch.resetTimer);
    delete watch.resetTimer;
    if (!reset) return;
    const due = Date.parse(reset) + 60_000 - this.now().getTime();
    if (due <= 0) return;
    watch.resetTimer = setTimeout(() => { this.changed(); this.askReading(); }, Math.min(due, LONGEST_TIMER_MS));
    watch.resetTimer.unref();
  }

  /**
   * A Codex reading for a wait whose activity hasn't started: today's release rules on that
   * choice's account, bounded by the activity's own one-attempt record (Kiln Phase Model Tiers, "A
   * Wait Before the Start"). A reading naming no stable account can't release it.
   */
  private codexReadingBeforeStart(key: string, refusalAt: string, reading: AgentAccount): void {
    const facts = this.record.phases[key]!;
    if (!facts.wait || this.waitWatch?.phaseKey !== key) return;
    const choice = this.notStartedChoice(key);
    if (this.stopWaitOnUnusableChoice(key)) return;
    if (!choice.model) return;
    const release = activityUsageRelease(facts.codexUsageRecovery ??= { generation: 0 }, { model: choice.model, effort: choice.effort }, refusalAt, reading);
    this.save();
    if (release.state === "allowed") void this.resumeWait(key, "limit_resume");
    else if (release.state === "unknown" || release.administrative) this.waitToStop(key, facts.wait.checks, facts.wait.checkedAt);
  }

  /** The phase stopped at Needs you after a usage limit, if any. */
  private limitStopKey(): string | undefined {
    const key = this.stoppedPhaseKey();
    return key !== undefined && this.record.phases[key]!.stop!.limit !== undefined ? key : undefined;
  }

  /** The clock the engine judges by, for the snapshot's reset and countdown. */
  clock(): Date {
    return this.now();
  }

  // ---- Setup -----------------------------------------------------------------------------

  /**
   * The base check, before Start, whenever a view connects to the event stream, unless a check
   * or setup is already running (technical design, "Worktree and Branch Setup").
   */
  /** What the search and the remembered answers said in this `kiln run`, each once. */
  readonly repositoryLinesSaid = new Set<string>();
  /** Address paths whose remembered answer Change is asking about again, lower-cased (AC-ASK-05). */
  private readonly changingLocations = new Set<string>();
  /** A refused answer's message, beside its row's field, by lower-cased address path (AC-ASK-03). */
  private readonly locationErrors = new Map<string, string>();
  /** Problems the latest resolution before Start found: a remembered folder Kiln couldn't check, a folder name gone. */
  repositoryProblems: string[] = [];
  private resolveRun = 0;

  /** One line about finding a repository, in the terminal. */
  private repositoryLine(text: string, rest?: string): void {
    this.emit({ kind: "repository_line", at: this.now(), text, ...(rest === undefined ? {} : { rest }) });
  }

  /**
   * Before Start, reaches the plan's names again: when a view connects, at Start and after an
   * answer or a Change (find repositories anywhere "Finding a Checkout"). A view connecting puts
   * a row being changed back to its remembered answer (`resetChanges`).
   */
  async resolveRepositoriesBeforeStart(resetChanges = false): Promise<void> {
    if (this.record.startedAt !== undefined || this.settingUp || !this.options.startPlan) return;
    // A view connecting asks again from the store: a row being changed returns to its answer, and a refused answer's message goes.
    if (resetChanges) { this.changingLocations.clear(); this.locationErrors.clear(); }
    await this.resolveNamesNow();
  }

  /** Reaches the start plan's names; at Start too, while setup holds the page. */
  private async resolveNamesNow(): Promise<void> {
    if (!this.options.startPlan) return;
    const run = ++this.resolveRun;
    const result = await resolvePlanRepositories({
      git: this.git,
      env: this.options.env,
      prd: { name: this.paths.repositoryName, mainCheckoutPath: this.paths.mainCheckoutPath, github: this.record.repository.github },
      entries: this.record.repositories,
      phases: this.options.startPlan.phases,
      say: (line) => this.repositoryLine(line),
      said: this.repositoryLinesSaid,
      changing: [...this.changingLocations],
    });
    if (run !== this.resolveRun) return;
    this.setNamedRows(result.named, result.problems);
  }

  /** The named rows the start checks or a resolution gave, with any field message a refused answer left. */
  setNamedRows(named: NamedRepositoryRow[], problems: string[] = []): void {
    for (const row of named) {
      const error = row.question ? this.locationErrors.get(row.question.repository.toLowerCase()) : undefined;
      if (row.question && error !== undefined) row.question.fieldError = error;
    }
    this.options.named = named;
    this.options.namedRepositories = named.flatMap((row) => (row.found ? [row.found] : []));
    this.repositoryProblems = problems;
    this.changed();
  }

  /**
   * `POST /api/repository-location` before Start: the answer to a row's question (AC-ASK-03,
   * AC-ASK-04). An accepted folder is remembered on this computer and the names are reached again.
   *
   *   await engine.locateRepository("acme-labs/storefront", "/Volumes/work/storefront")
   *   // { ok: true, repository: "acme-labs/storefront", folder: "/Volumes/work/storefront" }
   */
  async locateRepository(repository: string, folder: string): Promise<{ ok: true; repository: string; folder: string } | { ok: false; status: 409 | 422; reason: string }> {
    if (this.record.startedAt !== undefined || this.settingUp) return { ok: false, status: 409, reason: `No stop is asking where ${repository} is.` };
    // A failing start check on a page a reset built is reported first; the question waits until it passes (AC-ASK-01).
    if (this.resetCheckFailing) return { ok: false, status: 409, reason: FIX_WHAT_FAILED };
    const row = this.locatingRepositories.find((one) => sameAddressPath(one.question!.repository, repository));
    if (!row) return { ok: false, status: 409, reason: `Documents found isn’t asking where ${repository} is.` };
    const question = row.question!;
    const key = question.repository.toLowerCase();
    const check = await checkAnswer(this.git, folder, question.repository);
    if (!check.ok) {
      const reason = "message" in check ? check.message : `Couldn't read ${folder}'s checkout: ${check.unavailable}`;
      this.locationErrors.set(key, reason);
      question.fieldError = reason;
      this.changed();
      return { ok: false, status: 422, reason };
    }
    rememberLocation(this.options.env, question.repository, check.folder, this.now());
    this.locationErrors.delete(key);
    this.changingLocations.delete(key);
    this.repositoryLine(`Located ${question.repository}`, ` at ${displayPath(check.folder)}. Kiln will remember that on this computer.`);
    await this.resolveRepositoriesBeforeStart();
    if (this.startPreview?.from === "existing") await this.refreshStartPreview();
    this.checkBase();
    return { ok: true, repository: question.repository, folder: check.folder };
  }

  /** `POST /api/repository-location/change`: puts a row whose checkout came from a remembered answer back to asking, before Start (AC-ASK-05). */
  async changeRepositoryLocation(repository: string): Promise<CommandResult> {
    if (this.record.startedAt !== undefined || this.settingUp) return refuse("A repository's checkout is fixed once Start is pressed.");
    if (this.resetCheckFailing) return refuse(FIX_WHAT_FAILED);
    const row = this.namedRows.find((one) => one.found?.located === "answer" && sameAddressPath(one.addressPath, repository));
    if (!row) return refuse(`Kiln isn’t using a remembered answer for ${repository}.`);
    this.changingLocations.add(row.addressPath.toLowerCase());
    await this.resolveRepositoriesBeforeStart();
    if (this.startPreview?.from === "existing") await this.refreshStartPreview();
    return { ok: true };
  }

  /**
   * The PRD's repositories, for a label (AC-FOLDER-02): every entry, the PRD's repository, and
   * every repository the plan as it stands names, each counted once; one asked about counts by
   * the plan's name for it.
   */
  labelSet(): (Labelled & { name?: string })[] {
    const set: (Labelled & { name?: string })[] = [];
    const add = (one: Labelled & { name?: string }) => {
      if (set.some((other) => (one.name !== undefined && other.name === one.name) || sameAddressPath(other.addressPath, one.addressPath))) return;
      set.push(one);
    };
    add({ name: this.paths.repositoryName, shortName: this.paths.repositoryName, addressPath: this.record.repository.github });
    for (const entry of this.record.repositories) add({ name: entry.name, shortName: shortNameOf(entry), addressPath: entry.github });
    if (this.record.startedAt === undefined) {
      for (const row of this.namedRows) add({ name: row.name, shortName: row.found?.shortName ?? row.shortName, addressPath: row.addressPath });
      return set;
    }
    return recordLabelSet(this.record, this.plan?.phases ?? []);
  }

  /**
   * The label a repository is shown by, given Kiln's name for it. A name as a phase document
   * writes it goes through {@link labelOfWritten}, since Kiln's names are matched first here.
   */
  labelOf(name: string): string {
    const set = this.labelSet();
    const read = readRepositoryName(name);
    const byPath = (addressPath: string | undefined) => addressPath === undefined ? undefined : set.find((repository) => sameAddressPath(repository.addressPath, addressPath));
    const one = set.find((repository) => repository.name === name)
      ?? (read.kind === "folder" ? this.folderLabelled(name, set, byPath) : undefined)
      ?? (read.kind === "path" ? byPath(read.addressPath) : undefined);
    return one ? labelAmong(one, set) : name;
  }

  /**
   * The label of a name as a phase document writes it (AC-FOLDER-02): the repository it reaches,
   * so a folder name is never taken for an entry Kiln named the same whose checkout is elsewhere.
   *
   *   labelOfWritten("admin")  // "acme/admin", the folder beside the PRD's repository, though the entry `admin` is acme-labs/admin
   */
  labelOfWritten(name: string): string {
    const read = readRepositoryName(name);
    if (read.kind === "problem" || name === this.paths.repositoryName) return this.labelOf(name);
    const set = this.labelSet();
    const byPath = (addressPath: string | undefined) => addressPath === undefined ? undefined : set.find((repository) => sameAddressPath(repository.addressPath, addressPath));
    const one = read.kind === "path" ? byPath(read.addressPath) : this.folderLabelled(name, set, byPath);
    // A name that reaches nothing Kiln knows is shown as written, never as an entry Kiln named the same.
    return one ? labelAmong(one, set) : name;
  }

  /**
   * The repository a plan folder name reaches, for its label (AC-FOLDER-02): by the address path
   * its folder beside the PRD's repository has, never another repository sharing its short name.
   */
  private folderLabelled<T extends Labelled & { name?: string }>(name: string, set: T[], byPath: (addressPath: string | undefined) => T | undefined): T | undefined {
    if (this.record.startedAt === undefined) {
      const row = this.namedRows.find((one) => one.written.includes(name));
      if (row) return set.find((repository) => repository.name === row.name) ?? byPath(row.addressPath);
    }
    const mainCheckoutPath = this.record.repository.mainCheckoutPath;
    const reached = mainCheckoutPath === undefined ? undefined : byPath(besideAddressPath(mainCheckoutPath, name));
    if (reached) return reached;
    // A folder Kiln can't read or that is gone: the entry recorded at it, else the plan's own name for it.
    const beside = join(this.parentFolder, name);
    const recorded = this.record.repositories.find((entry) => entry.name === name && expandHome(entry.mainCheckoutPath) === beside);
    if (recorded) return set.find((repository) => repository.name === recorded.name);
    const unnamed = set.filter((repository) => repository.name === undefined && repository.shortName === name);
    return unnamed.length === 1 ? unnamed[0] : undefined;
  }

  checkBase(): void {
    if (this.record.startedAt !== undefined || this.settingUp || this.fieldChecksRunning > 0 || this.stopping) return;
    void this.runFieldChecks(true);
  }

  /**
   * The field checks, the base check among them, asking each repository's origin directly, in
   * parallel. Only the latest run's result is shown; while any runs, Start is unavailable.
   */
  private async runFieldChecks(announce = true) {
    const run = ++this.fieldCheckRun;
    this.fieldChecksRunning++;
    if (announce) {
      this.baseCheck = "checking";
      this.changed();
    }
    try {
      const { settings } = this.record;
      const repositories = this.plannedRepositories;
      const reads = await Promise.all(repositories.map((repository) => originBranches(this.git, repository.mainCheckoutPath)));
      const origins = new Map<string, OriginRead>(repositories.map((repository, index) => [repository.name, reads[index]!]));
      if (run === this.fieldCheckRun) {
        repositories.forEach((repository, index) => {
          const origin = reads[index]!;
          const isPrd = repository.kind === "prd";
          const current = isPrd ? settings.baseBranch : (settings.bases[repository.name] ?? "");
          const choices = origin.ok ? baseBranchChoices(origin.value) : current === "" ? [] : [current];
          if (isPrd) this.baseBranches = choices;
          else this.repositoryBaseBranches[repository.name] = choices;
          // A base left empty, because origin couldn't be read when it was first shown, is chosen now.
          if (!origin.ok || current !== "" || this.record.startedAt !== undefined || repository.entry?.setupCompletedAt !== undefined) return;
          const base = defaultBaseBranch(origin.value);
          if (base === "") return;
          if (isPrd) settings.baseBranch = base;
          else settings.bases[repository.name] = base;
          this.save();
        });
      }
      // Documents found is computed for the starting point (run restart "The preview").
      const preview = await this.refreshStartPreview();
      // A repository the preview found through the start commit's plan gets its base list now, not at the next check.
      if (preview?.from === "existing") {
        const found = preview.repositories.filter(repository => repository.kind === "named" && !repositories.some(one => one.name === repository.name));
        const lists = await Promise.all(found.map(repository => originBranches(this.git, repository.mainCheckoutPath)));
        found.forEach((repository, index) => { const origin = lists[index]!; if (origin.ok) this.repositoryBaseBranches[repository.name] = baseBranchChoices(origin.value); });
      }
      const outcome = preview?.from === "existing" ? await this.existingBranchFields(preview) : await checkFields({
        git: this.git,
        paths: this.paths,
        settings,
        prdTree: this.options.prdTree ?? "",
        ...(this.requirementsOpen && this.record.origin ? { source: this.record.origin } : {}),
        repositories: repositories.map(repository => ({ ...repository, label: this.labelOf(repository.name) })),
        origins,
        multiRepository: repositories.length > 1,
        workspaceFixed: this.workspaceFixed,
      });
      if (run === this.fieldCheckRun) {
        this.fieldErrors = outcome.errors;
        this.baseErrors = outcome.baseErrors;
        // A PRD repository already set up is checked against its feature branch, not the base, so that match doesn't count.
        const prdSetUp = this.record.repositories.some(entry => entry.kind === "prd" && entry.setupCompletedAt !== undefined);
        this.baseDocumentsMatched = preview?.from === "new" && !prdSetUp && outcome.errors.baseBranch === undefined ? preview.previewId : undefined;
        this.baseCheck = outcome.errors.baseBranch === undefined && Object.keys(outcome.baseErrors).length === 0 ? "ok" : "error";
      }
      return outcome;
    } finally {
      this.fieldChecksRunning--;
      if (run === this.fieldCheckRun && this.baseCheck === "checking") this.baseCheck = undefined;
      this.changed();
    }
  }

  /**
   * Adds each repository's worktree in list order, the PRD's repository first, or finishes a
   * setup that was interrupted (multi-repo technical design, "Setup at Start"). A failure stops
   * at the failing repository: its entry gets v1's undo, those after it lose their start commit,
   * an entry left holding nothing is removed, and Start is cleared so `kiln run` shows Documents
   * found again.
   */
  private async finishSetup(): Promise<{ ok: true } | { ok: false; error: string }> {
    const { record } = this;
    const branch = record.settings.featureBranch;
    const list = record.repositories.filter((entry) => entry.setupCompletedAt !== undefined || entry.baseCommit !== undefined);
    for (const entry of list) {
      if (entry.setupCompletedAt !== undefined) continue;
      const outcome = entry.runStartCommit !== undefined ? await this.setUpExistingEntry(entry, branch) : await addEntryWorktree(this.git, entry, branch, "then press Start again.", true, this.labelOf(entry.name));
      // A step stopped by Ctrl+C, a closed terminal or a signal hasn't failed: the record is kept.
      if (this.stopping) return { ok: false, error: "Kiln is stopping." };
      if (outcome.ok) {
        entry.setupCompletedAt = this.now().toISOString();
        delete entry.createdBranch;
        this.save();
        continue;
      }
      if (entry.runStartCommit === undefined) await undoEntry(this.git, entry, branch);
      for (const later of list.slice(list.indexOf(entry) + 1)) if (later.runStartCommit === undefined) delete later.baseCommit;
      // Every existing-branch entry loses what this Start gave it, set up or not; Kiln removes nothing in git (run restart "Failure").
      for (const one of list.filter(candidate => candidate.runStartCommit !== undefined)) {
        delete one.baseCommit; delete one.runStartCommit; delete one.adoptedWorktree; delete one.catchUp; delete one.setupCompletedAt;
      }
      const startedAt = record.startedAt ?? "";
      if (record.branchCatchUps) { record.branchCatchUps = record.branchCatchUps.filter(row => row.at < startedAt); if (!record.branchCatchUps.length) delete record.branchCatchUps; }
      record.repositories = record.repositories.filter((candidate) => !entryHoldsNothing(candidate));
      delete record.startedAt;
      delete record.refinementConfirmedAt;
      this.save();
      this.startError = "catchUp" in outcome ? (list.length > 1 ? `Couldn’t bring ${this.labelOf(entry.name)}’s branch up to date: ${outcome.error}` : `Couldn’t bring the branch up to date: ${outcome.error}`)
        : list.length > 1 ? `Couldn’t set up ${this.labelOf(entry.name)}’s worktree: ${outcome.error}` : `Couldn’t set up the worktree: ${outcome.error}`;
      this.emit({ kind: "message", text: this.startError });
      return outcome;
    }
    record.setupCompletedAt = this.now().toISOString();
    this.save();
    return { ok: true };
  }

  // ---- Starting from a branch, and catching an untouched branch up (run restart) -----------

  /**
   * The starting point (run restart "The starting point"): the saved choice, else computed at
   * each preview: `existing` when a branch named `settings.featureBranch` exists in any of the
   * PRD's repositories, local or on origin. A started record without one started on a new branch.
   */
  get startChoice(): { from: "new" | "existing"; bringUpToDate: boolean } {
    if (this.record.start) return this.record.start;
    if (this.record.startedAt !== undefined) return { from: "new", bringUpToDate: true };
    return { from: this.featureBranchExists ? "existing" : "new", bringUpToDate: true };
  }

  /** Today's repositories as the branch list reads them: the PRD's first, each with the base it would use. */
  private startRepositories(): StartRepository[] {
    return this.checkoutRepositories.map(repository => ({ name: repository.name, kind: repository.kind, mainCheckoutPath: repository.mainCheckoutPath, github: repository.github, baseBranch: baseFor(repository, this.record.settings, this.workspaceFixed), ...(repository.entry?.setupCompletedAt !== undefined ? { setUp: true as const } : {}), label: this.labelOf(repository.name) }));
  }

  /**
   * Recomputes the branch list and the preview for the chosen starting point (run restart "The
   * preview"): when a view connects, when the settings change the start, feature branch or a base,
   * and at Start. Nothing watches refs. Only the latest run's result is kept.
   */
  async refreshStartPreview(): Promise<StartPreview | undefined> {
    if (this.record.startedAt !== undefined) return undefined;
    const run = ++this.previewRun;
    const repositories = this.startRepositories();
    const refs = new Map(await Promise.all(repositories.map(async repository => [repository.name, await readRepositoryRefs(this.git, repository.mainCheckoutPath)] as const)));
    const others = otherStartedBranches(this.stateDirectory);
    const choices = await branchList(this.git, repositories, refs, others);
    const branch = this.record.settings.featureBranch;
    const exists = repositories.some(repository => refs.get(repository.name)!.local.has(branch) || refs.get(repository.name)!.origin?.branches.has(branch) === true);
    if (run !== this.previewRun) return this.startPreview;
    this.branchChoices = choices;
    this.featureBranchExists = exists;
    let choice = this.startChoice;
    // Switching to an existing branch while the name isn't listed selects the list's first available name.
    if (choice.from === "existing" && !choices.some(one => one.name === branch)) {
      const first = choices.find(one => one.available);
      if (first) { this.record.settings.featureBranch = first.name; this.save(); }
      choice = this.startChoice;
    }
    const prd = repositories[0]!;
    let preview: StartPreview;
    if (choice.from === "existing") {
      preview = await existingBranchPreview({
        git: this.git, gh: this.options.tools.gh, env: this.options.env, prdDirectoryFromRoot: this.paths.prdDirectoryFromRoot,
        branch: this.record.settings.featureBranch, bringUpToDate: choice.bringUpToDate, repositories, refs, others,
        resolve: (phases) => resolvePlanRepositories({ git: this.git, env: this.options.env, prd: { name: this.paths.repositoryName, mainCheckoutPath: this.paths.mainCheckoutPath, github: this.record.repository.github }, entries: this.record.repositories, phases, say: (line) => this.repositoryLine(line), said: this.repositoryLinesSaid, changing: [...this.changingLocations] }),
        baseOf: name => this.record.settings.bases[name] ?? "",
        label: name => this.labelOf(name),
      });
    } else preview = newBranchPreview(branch, repositories, refs.get(prd.name)!.origin?.branches.get(prd.baseBranch), this.options.startPlan);
    if (run !== this.previewRun) return this.startPreview;
    this.startPreview = preview;
    // A repository only the start commit's plan names keeps the base the preview gave it, shown in its row.
    let based = false;
    for (const repository of preview.repositories) {
      if (repository.kind === "named" && this.record.settings.bases[repository.name] === undefined && repository.baseBranch !== "") { this.record.settings.bases[repository.name] = repository.baseBranch; based = true; }
    }
    if (based) this.save();
    this.changed();
    return preview;
  }

  /**
   * `POST /api/settings`'s `start`: saved whenever it changes the start or the feature branch.
   * Switching to `new` keeps the name, so today's "That branch already exists" shows until a new
   * name is typed.
   *
   *   await engine.changeStart({ from: "existing", bringUpToDate: true })  // { ok: true }
   */
  async changeStart(start: { from: "new" | "existing"; bringUpToDate: boolean }): Promise<CommandResult> {
    if (this.requirementsOpen && start.from === "existing" && !this.record.prdDirectory) return refuse("Source material starts on a new feature branch.");
    if (this.record.startedAt !== undefined || this.settingUp) return refuse("Where Kiln starts from is fixed once Start is pressed.");
    if (this.workspaceFixed) return refuse("The workspace folder and feature branch are fixed once a repository is set up.");
    this.record.start = { from: start.from, bringUpToDate: start.bringUpToDate };
    this.save();
    await this.runFieldChecks(false);
    return { ok: true };
  }

  /** The field checks for an existing-branch start: the folders the selection still needs, and the preview's own messages. */
  private async existingBranchFields(preview: StartPreview): Promise<{ errors: FieldErrors; baseErrors: Record<string, string>; startCommits: Record<string, string> }> {
    const { settings } = this.record;
    const errors: FieldErrors = {};
    const baseErrors: Record<string, string> = {};
    const startCommits: Record<string, string> = {};
    const multi = preview.repositories.length > 1;
    if (!multi) {
      const prd = preview.repositories[0]!;
      if (!prd.worktree) { const error = await checkWorktreePath(this.git, prd.mainCheckoutPath, settings.worktreePath); if (error) errors.worktreePath = error; }
    } else {
      if (!preview.workspaceFolder) { const error = await checkWorkspaceFolder(this.git, preview.repositories, settings.workspaceFolder); if (error) errors.workspaceFolder = error; }
      const folder = preview.workspaceFolder ?? expandHome(settings.workspaceFolder);
      if (!errors.workspaceFolder) for (const repository of preview.repositories.filter(one => !one.worktree)) {
        const error = await checkWorktreePath(this.git, repository.mainCheckoutPath, join(folder, repository.name));
        if (error) { errors.workspaceFolder = error; break; }
      }
    }
    if (preview.fieldError) errors.featureBranch = preview.fieldError;
    for (const repository of preview.repositories) {
      if (repository.hasBranch) { if (repository.mergeBase) startCommits[repository.name] = repository.mergeBase; continue; }
      if (!repository.baseTip) continue;
      // A repository that doesn't have the branch is cut from its base, with today's reads and, for the PRD's repository, its document check.
      const fetched = await fetchIfMissing(this.git, repository.mainCheckoutPath, repository.baseBranch, repository.baseTip);
      let message = fetched;
      if (!message && repository.kind === "prd") {
        const tree = await runGit(this.git, repository.mainCheckoutPath, ["rev-parse", `${repository.baseTip}:${this.paths.prdDirectoryFromRoot}`]);
        if (tree.exitCode !== 0 || tree.stdout.trim() !== (this.options.prdTree ?? "")) message = `${repository.baseBranch} on origin has different PRD documents from this checkout. Push them to ${repository.baseBranch} first; every session starts from there.`;
      }
      if (message) { if (repository.kind === "prd") errors.baseBranch = message; else baseErrors[repository.name] = message; }
      else startCommits[repository.name] = repository.baseTip;
    }
    return { errors, baseErrors, startCommits };
  }

  /**
   * One existing-branch entry's setup at Start (run restart "Start"), each step skipped when its
   * effect is already there: the local branch, the branch check and the worktree, then the
   * catch-up while one is saved or this Start's is not yet pushed.
   */
  private async setUpExistingEntry(entry: RepositoryEntry, branch: string): Promise<{ ok: true } | { ok: false; error: string; catchUp?: true }> {
    const main = expandHome(entry.mainCheckoutPath);
    const path = expandHome(entry.worktreePath);
    const expected = new Set([entry.runStartCommit!, ...(entry.catchUp ? [entry.catchUp.to] : [])]);
    try {
      const origin = await originBranches(this.git, main);
      if (!origin.ok) return { ok: false, error: `Couldn’t reach origin: ${origin.error}` };
      const originTip = origin.value.branches.get(branch);
      let local = await localBranchCommit(this.git, main, branch);
      if (local === undefined) {
        if (originTip === undefined || !expected.has(originTip)) return { ok: false, error: `${branch} on origin moved since Kiln read it${originTip ? `: it is now at ${shortSha(originTip)}` : ""}. Reload to see it as it stands.` };
        const failed = await ensureObjects(this.git, main, originTip, SETUP_TIMEOUT_MS);
        if (failed) return { ok: false, error: `Couldn’t fetch ${branch} from origin: ${gitError(failed)}` };
        const made = await runGit(this.git, main, ["branch", "--no-track", branch, originTip]);
        if (made.exitCode !== 0) return { ok: false, error: gitError(made) };
        for (const [key, value] of [[`branch.${branch}.remote`, "origin"], [`branch.${branch}.merge`, `refs/heads/${branch}`]] as const) {
          const set = await runGit(this.git, main, ["config", key, value]);
          if (set.exitCode !== 0) return { ok: false, error: gitError(set) };
        }
        local = originTip;
      }
      if (!expected.has(local)) return { ok: false, error: `${branch} moved since Kiln read it: it is now at ${shortSha(local)}. Reload to see it as it stands.` };
      if (originTip !== undefined && originTip !== local) {
        const present = await runGit(this.git, main, ["cat-file", "-e", `${originTip}^{commit}`]);
        if (present.exitCode !== 0 || !await isAncestor(this.git, main, originTip, local)) return { ok: false, error: `${branch} on origin moved ahead of, or away from, the local branch. Kiln never resets or force-pushes; reload to see it as it stands.` };
      }
      const worktrees = await listWorktrees(this.git, main);
      if (!worktrees.ok) return { ok: false, error: worktrees.error };
      const at = worktrees.worktrees.find(worktree => comparable(worktree.path) === comparable(realPathOfNearestAncestor(resolve(path))));
      if (at?.locked === "initializing") return { ok: false, error: halfMadeMessage(entry, "then press Start again.", this.labelOf(entry.name)) };
      if (at && at.branch === branch) {
        const check = await checkFolder(this.git, entry);
        if (check.state !== "in_place") return { ok: false, error: `${displayPath(path)} isn’t a worktree of ${this.labelOf(entry.name)} on ${branch}.` };
      } else if (entry.adoptedWorktree) return { ok: false, error: `The worktree at ${displayPath(path)} is no longer on ${branch}. Reload to see it as it stands.` };
      else {
        const added = await runGit(this.git, main, ["worktree", "add", path, branch], SETUP_TIMEOUT_MS);
        if (added.exitCode !== 0) return { ok: false, error: gitError(added) };
      }
      const pushPending = (this.record.branchCatchUps ?? []).some(row => row.repository === entry.name && row.to === local && row.at >= (this.record.startedAt ?? ""));
      if (entry.catchUp || pushPending) {
        const to = entry.catchUp?.to ?? local;
        if (entry.catchUp && local !== to) {
          // A fast-forward that has not landed runs only while the branch still qualifies against the saved target (§Start, Interruption).
          const files = await uncommittedFiles(this.git, path);
          const behind = await isAncestor(this.git, main, local, to);
          if (files === undefined || files.length > 0 || !behind) return { ok: false, error: `${branch} can no longer be brought up to date safely: it has commits of its own or uncommitted files now. Reload to see it as it stands.` };
        }
        try { await catchUpRepository(this.git, entry, branch, to, { save: () => this.save(), record: (from, moved, commits) => this.recordCatchUp(entry, branch, from, moved, commits, undefined), label: this.labelOf(entry.name) }); }
        catch (error) { return { ok: false, error: (error as Error).message, catchUp: true }; }
      }
    } catch (error) { return { ok: false, error: (error as Error).message }; }
    return { ok: true };
  }

  /**
   * Step 3 of a catch-up (run restart "Catching a Branch Up"): one save records the fast-forward
   * and removes `catchUp`. At Start, `runStartCommit` and `baseCommit` become `to`; at a stop,
   * `runStartCommit` takes the entry's `baseCommit` when it has none, then `baseCommit` and the
   * stopped phase's start commit become `to`.
   */
  private recordCatchUp(entry: RepositoryEntry, branch: string, from: string, to: string, commits: number, phaseKey: string | undefined): void {
    if (from !== to) (this.record.branchCatchUps ??= []).push({ at: this.now().toISOString(), repository: entry.name, branch, from, to, commits });
    if (phaseKey === undefined) { entry.runStartCommit = to; entry.baseCommit = to; }
    else {
      if (entry.runStartCommit === undefined && entry.baseCommit !== undefined) entry.runStartCommit = entry.baseCommit;
      entry.baseCommit = to;
      const facts = this.record.phases[phaseKey]?.repositories[entry.name];
      if (facts) facts.startCommit = to;
    }
    delete entry.catchUp;
    this.save();
    if (from !== to) this.catchUpRequest?.moved.push({ repository: entry.name, branch, from, to, commits });
  }

  /**
   * Settles a `catchUp` still saved on a set-up entry, as `kiln run` prepares (run restart "When a
   * saved catchUp is settled"): the local tip read in the main checkout; a fast-forward that
   * landed is recorded, one that didn't is forgotten. A read that fails ends `kiln run`.
   */
  private async settleCatchUps(): Promise<void> {
    const branch = this.record.settings.featureBranch;
    const atStop = Object.values(this.record.phases).some(facts => facts.sessionIds.length > 0);
    for (const entry of this.setUpRepositories) {
      const saved = entry.catchUp;
      if (!saved) continue;
      const main = expandHome(entry.mainCheckoutPath);
      const tip = await runGit(this.git, main, ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`]);
      if (tip.exitCode !== 0) throw new Error(`Kiln couldn't read ${branch} in ${this.labelOf(entry.name)} to settle a catch-up: ${gitError(tip)}`);
      const local = tip.stdout.trim();
      let landed = local === saved.to;
      if (!landed) {
        const ancestor = await runGit(this.git, main, ["merge-base", "--is-ancestor", saved.to, local]);
        if (ancestor.exitCode !== 0 && ancestor.exitCode !== 1) throw new Error(`Kiln couldn't read ${this.labelOf(entry.name)}'s history to settle a catch-up: ${gitError(ancestor)}`);
        landed = ancestor.exitCode === 0;
      }
      if (landed) {
        const counted = await runGit(this.git, main, ["rev-list", "--count", `${saved.from}..${saved.to}`]);
        this.recordCatchUp(entry, branch, saved.from, saved.to, counted.exitCode === 0 ? Number.parseInt(counted.stdout.trim(), 10) : 0, atStop ? this.stoppedPhaseKey() ?? this.nextKeyFromRecordedPlan() : undefined);
      } else { delete entry.catchUp; this.save(); }
    }
  }

  /** The stopped phase's catch-up offer, read with its work (run restart "Catching a Branch Up"); a held phase gets none. */
  private async readStoppedCatchUp(): Promise<CatchUpOffer | undefined> {
    if (this.record.liveControl) return undefined;
    const branch = this.record.settings.featureBranch;
    const readings = await Promise.all(this.setUpRepositories.map(entry => readCatchUp(this.git, { name: entry.name, label: this.labelOf(entry.name), mainCheckoutPath: entry.mainCheckoutPath, worktreePath: entry.worktreePath, baseBranch: entry.baseBranch }, branch)));
    return stoppedCatchUpOffer(readings, branch);
  }

  /**
   * Before a session starts at a stopped phase (run restart AC-CURRENT-01): catches each qualifying
   * repository's branch up, read again now. Ticked on the page but no longer qualifying is
   * `branch_changed`; a command that isn't told to leave the branch proceeds when none qualifies.
   * Never for a held phase.
   */
  private async catchUpAtStop(phaseKey: string): Promise<void> {
    const request = this.catchUpRequest;
    if (!request || request.mode === "leave" || this.record.liveControl) return;
    const branch = this.record.settings.featureBranch;
    let readings;
    try { readings = await Promise.all(this.setUpRepositories.map(async entry => ({ entry, reading: await readCatchUp(this.git, { name: entry.name, label: this.labelOf(entry.name), mainCheckoutPath: entry.mainCheckoutPath, worktreePath: entry.worktreePath, baseBranch: entry.baseBranch }, branch) }))); }
    catch (error) { throw new CatchUpFailure("branch_catch_up_failed", (error as Error).message); }
    const qualifying = readings.filter(one => one.reading.qualifies);
    if (qualifying.length === 0) {
      if (request.mode === "ticked") throw new CatchUpFailure("branch_changed", "The branch changed since the page was read, so Kiln won't bring it up to date. Review the refreshed page.");
      return;
    }
    for (const { entry, reading } of qualifying) {
      try { await catchUpRepository(this.git, entry, branch, reading.baseTip, { save: () => this.save(), record: (from, to, commits) => this.recordCatchUp(entry, branch, from, to, commits, phaseKey), label: this.labelOf(entry.name) }); }
      catch (error) { throw new CatchUpFailure("branch_catch_up_failed", `Kiln couldn't bring the branch up to date, so nothing started: ${(error as Error).message}`); }
    }
    this.stoppedCatchUp = { phaseKey, offer: undefined };
  }

  /**
   * What every prompt Kiln sends at a launch or resume carries at its end (run restart "Sessions
   * are told" and "Catching a Branch Up"): each catch-up not yet told, one sentence each, and,
   * while an adopted worktree has uncommitted files and no run has begun a conversation, how many.
   */
  private async promptAdditions(sessionId: string): Promise<string> {
    const rows = (this.record.branchCatchUps ?? []).map((row, index) => ({ row, index })).filter(({ row }) => row.toldSessionId === undefined);
    const multi = this.setUpRepositories.length > 1;
    const parts = rows.map(({ row }) => catchUpSentence(row, multi));
    let files = false;
    const adopted = this.setUpRepositories.filter(entry => entry.adoptedWorktree);
    if (adopted.length && !this.anyConversationBegan()) {
      const counts = await Promise.all(adopted.map(async entry => ({ entry, files: await uncommittedFiles(this.git, expandHome(entry.worktreePath)) })));
      const lines = counts.filter(one => one.files?.length).map(one => `${displayPath(expandHome(one.entry.worktreePath))} has ${one.files!.length} uncommitted ${one.files!.length === 1 ? "file" : "files"}`);
      if (lines.length) { files = true; parts.push(`This run started in a worktree that already existed, and ${lines.join("; ")}. Look at them before building: they may be work someone began.`); }
    }
    this.pendingTell = rows.length || files ? { sessionId, rows: rows.map(({ index }) => index), files } : undefined;
    return parts.join("\n\n");
  }

  /** Whether a prompt would carry anything: a catch-up not yet told, or an adopted worktree before any conversation began. */
  private hasPromptAdditions(): boolean {
    if ((this.record.branchCatchUps ?? []).some(row => row.toldSessionId === undefined)) return true;
    return this.setUpRepositories.some(entry => entry.adoptedWorktree) && !this.anyConversationBegan();
  }

  /** Whether any run of the PRD's sessions has reported Claude `init` or a Codex turn. */
  private anyConversationBegan(): boolean {
    for (const key of Object.keys(this.record.phases)) if (this.conversationBegan(key)) return true;
    return false;
  }

  /** Marks the catch-ups a prompt carried as told, once that session's run reports init or a turn. */
  private markTold(session: SessionRecord): void {
    const tell = this.pendingTell;
    if (!tell || tell.sessionId !== session.sessionId) return;
    const runIndex = session.runs.length - 1;
    if (runIndex < 0 || !sessionBegan(this.stateDirectory, { ...session, runs: [session.runs[runIndex]!] })) return;
    for (const index of tell.rows) { const row = this.record.branchCatchUps?.[index]; if (row && row.toldSessionId === undefined) row.toldSessionId = session.sessionId; }
    this.pendingTell = undefined;
    if (tell.rows.length) this.save();
  }

  // ---- Adding a repository after Start (multi-repo AC-ADD-01 to AC-ADD-04) -------------------

  /**
   * `kiln add-repository <name>`: allowed while a phase, not the pull-request session, is in
   * progress or stopped at Needs you. Requests run one at a time; one for a repository already
   * set up answers with its path, and one for a repository being set up waits for that setup.
   *
   *   await engine.addRepository("notifications")
   *   // { ok: true, name: "notifications", worktreePath: "/home/a/acme/.worktrees/customer-returns/notifications", … }
   */
  addRepository(name: string): Promise<AddRepositoryResult> {
    if (this.checking) return Promise.resolve({ ok: false, status: 409, reason: "Kiln is checking or resuming. Add the repository after this action settles." });
    const phaseKey = this.current?.session !== undefined ? this.current.phaseKey : this.stoppedPhaseKey();
    const refused = { ok: false as const, status: 409 as const, reason: "Kiln adds a repository only while a phase is running or stopped at Needs you." };
    if (!this.isUnderway || this.currentlyComplete || phaseKey === undefined || phaseKey === PR_PHASE_KEY || this.stopping) return Promise.resolve(refused);
    const underway = this.additionsUnderway.get(name);
    if (underway) return underway;
    const addition = this.additionChain.then(async () => {
      const reached = await this.reachForAddition(name, phaseKey, this.plan?.phases ?? []);
      if ("question" in reached) return this.requestAsks(phaseKey, reached.question);
      return "result" in reached ? reached.result : this.addOne(reached.name, phaseKey, reached.found);
    });
    this.additionsUnderway.set(name, addition);
    this.additionChain = addition.then(
      () => this.additionsUnderway.delete(name),
      () => this.additionsUnderway.delete(name),
    );
    return addition;
  }

  /** Adds the repositories a phase about to start, or a split record above it, names that the workspace doesn't have (AC-ADD-04). */
  private async addNamedRepositories(leaf: PlannedPhase, plan: PhasePlan): Promise<{ ok: true } | { ok: false; facts: string[]; locate: SavedQuestion[] }> {
    const naming = plan.phases.filter((phase) => phase.id === leaf.id || isAncestorOf(phase.id, leaf.id));
    const names = namedRepositories(naming, this.paths.repositoryName);
    // A repository that ends in a question doesn't end the additions: the stop asks every question at once (find repositories anywhere, "The stops that ask").
    const facts: string[] = [];
    const locate: SavedQuestion[] = [];
    for (const name of names) {
      const addition = this.additionChain.then(async (): Promise<AddRepositoryResult | { ask: Question }> => {
        const reached = await this.reachForAddition(name, leaf.id, plan.phases);
        if ("question" in reached) return { ask: reached.question };
        return "result" in reached ? reached.result : this.addOne(reached.name, leaf.id, reached.found);
      });
      this.additionChain = addition.catch(() => undefined);
      const result = await addition;
      if (this.stopping) return { ok: true };
      if ("ask" in result) {
        const phaseFile = naming.find((phase) => phase.repositories.includes(name))?.fileName ?? leaf.fileName;
        if (locate.some((question) => sameAddressPath(question.repository, result.ask.repository))) continue;
        locate.push(savedQuestion(result.ask, phaseFile));
        facts.push(planStopFact(phaseFile, result.ask));
        continue;
      }
      if (!result.ok) return { ok: false, facts: [...facts, `${name}: ${result.reason}`], locate };
    }
    return locate.length ? { ok: false, facts, locate } : { ok: true };
  }

  /**
   * A session's request that ends in a question (AC-SESSION-01): recorded on its phase once per
   * address path, and nothing added. A stop already open on that phase gains the question at once.
   */
  private requestAsks(phaseKey: string, question: Question): AddRepositoryResult {
    const facts = this.phaseFacts(phaseKey);
    const requests = (facts.repositoryRequests ??= []);
    if (!requests.some((request) => sameAddressPath(request.addressPath, question.repository))) requests.push({ addressPath: question.repository, at: this.now().toISOString() });
    let reason = requestRefusal(question);
    const holder = this.stoppedPhaseKey() === phaseKey ? this.questionHolder(phaseKey) : undefined;
    if (holder) {
      holder.locate = withQuestion(holder.locate, savedQuestion(question));
      reason = `${reason} ${stopNowAsks(question)}`;
    }
    this.save();
    return { ok: false, status: 422, reason, asked: true };
  }

  /** Where a stopped phase's questions are saved: its retained stop, else the billing hold on it. */
  private questionHolder(phaseKey: string): { locate?: SavedQuestion[] } | undefined {
    const stop = this.record.phases[phaseKey]?.stop;
    if (stop) return stop;
    const hold = this.record.billing?.hold;
    return hold?.phaseKey === phaseKey ? hold : undefined;
  }

  /** The check run a stopped phase's search belongs to: the billing hold's while it has rows, else the stop's. */
  private questionRun(phaseKey: string): string | undefined {
    const hold = this.record.billing?.hold;
    if (hold?.phaseKey === phaseKey && hold.checks) return hold.run?.id;
    return this.record.phases[phaseKey]?.stop?.run?.id;
  }

  private requestSearchesBegun = 0;
  private requestSearchSaved = 0;

  /**
   * Searches again for a stopped phase's recorded requests, without holding the stop up (technical
   * design, "The stops that ask"): each request that still ends in a question is asked on the
   * stop, and one that now resolves is dropped without a word. The result is saved only while the
   * stop is open with the run it had when the search began, and no search begun later has saved.
   */
  private refreshRequestQuestions(phaseKey: string): Promise<void> {
    const requests = this.record.phases[phaseKey]?.repositoryRequests;
    if (!requests?.length || !this.questionHolder(phaseKey)) return Promise.resolve();
    const run = this.questionRun(phaseKey);
    const order = ++this.requestSearchesBegun;
    const searched = resolveNames({
      git: this.git,
      env: this.options.env,
      prd: { name: this.paths.repositoryName, mainCheckoutPath: this.paths.mainCheckoutPath, github: this.record.repository.github },
      entries: this.record.repositories,
      names: requests.map((request) => ({ name: request.addressPath, namedIn: phaseKey })),
      say: (line) => this.repositoryLine(line),
      said: this.repositoryLinesSaid,
    });
    const work = searched.then((resolution) => {
      const facts = this.record.phases[phaseKey];
      const holder = this.questionHolder(phaseKey);
      if (this.stopping || !facts || !holder || this.questionRun(phaseKey) !== run || order < this.requestSearchSaved) return;
      this.requestSearchSaved = order;
      const keep: { addressPath: string; at: string }[] = [];
      let locate = (holder.locate ?? []).filter((question) => question.phaseFile !== undefined);
      for (const request of facts.repositoryRequests ?? []) {
        const reached = resolution.byName.get(request.addressPath);
        const asked = reached?.kind === "repository" ? reached.repository.question : undefined;
        if (asked) { keep.push(request); locate = withQuestion(locate, savedQuestion(asked)); continue; }
        // A request made after the search began, or one Kiln couldn't check, keeps what the stop already asks.
        if (reached === undefined || reached.kind === "problem") {
          keep.push(request);
          const before = holder.locate?.find((question) => question.phaseFile === undefined && sameAddressPath(question.repository, request.addressPath));
          if (before) locate = withQuestion(locate, before);
        }
      }
      if (keep.length) facts.repositoryRequests = keep; else delete facts.repositoryRequests;
      if (locate.length) holder.locate = locate; else delete holder.locate;
      this.save();
    });
    return work.catch(() => undefined);
  }

  /** Why `locate-repository` for this address path is refused at admission, or undefined (find repositories anywhere, "The command"). */
  private locateAdmission(repository: string): string | undefined {
    if (this.record.startedAt === undefined) return `${this.paths.featureName} hasn’t started. Tell Kiln where ${repository} is on Documents found, in the browser.`;
    const key = this.stoppedPhaseKey();
    const asks = key !== undefined && this.questionHolder(key)?.locate?.some((question) => sameAddressPath(question.repository, repository));
    return asks ? undefined : `No stop is asking where ${repository} is.`;
  }

  /**
   * `kiln locate-repository`, or the stop page's Use this folder, after Start (AC-ASK-06, AC-ASK-07):
   * an answer to a question an open stop asks. An accepted folder is remembered on this computer;
   * at the plan stop it is then checked as Check again checks it, which adds the repository.
   */
  async locateAtStop(repository: string, folder: string): Promise<LocateAnswer> {
    const key = this.stoppedPhaseKey();
    const holder = key === undefined ? undefined : this.questionHolder(key);
    const question = holder?.locate?.find((one) => sameAddressPath(one.repository, repository));
    if (key === undefined || !question) return { ok: false, code: "control_unavailable", reason: `No stop is asking where ${repository} is.`, status: 409 };
    const check = await checkAnswer(this.git, folder, question.repository);
    if (!check.ok && "unavailable" in check) return { ok: false, code: "check_unavailable", reason: `Couldn't read ${folder}'s checkout: ${check.unavailable}`, status: 503 };
    if (!check.ok) return { ok: true, outcome: "folder_not_accepted", reason: check.message, located: { repository: question.repository, folder } };
    // The plan stop's answer is checked as Check again checks the stop: refused before anything is remembered while a check runs.
    if (question.phaseFile !== undefined && (this.billing.busy || this.deliveryBusy || this.checking || this.driving)) return { ok: false, code: "control_unavailable", reason: "Kiln is already checking. Answer again once it finishes.", status: 409 };
    rememberLocation(this.options.env, question.repository, check.folder, this.now());
    this.repositoryLine(`Located ${question.repository}`, ` at ${displayPath(check.folder)}. Kiln will remember that on this computer.`);
    const located: LocatedFacts = { repository: question.repository, folder: check.folder };
    if (question.phaseFile === undefined) {
      const facts = this.record.phases[key];
      if (facts?.repositoryRequests) {
        facts.repositoryRequests = facts.repositoryRequests.filter((request) => !sameAddressPath(request.addressPath, question.repository));
        if (!facts.repositoryRequests.length) delete facts.repositoryRequests;
      }
      holder!.locate = holder!.locate!.filter((one) => one !== question);
      if (!holder!.locate.length) delete holder!.locate;
      this.save();
      void this.refreshRequestQuestions(key);
      return { ok: true, outcome: "located", located };
    }
    // The plan stop: checked as Check again checks it, which adds the repository and starts the phase once nothing else holds the stop.
    let answer: CommandResult;
    try { answer = await this.checkAgain(); }
    catch (error) { if (!(error instanceof CompletionCheckUnavailable)) throw error; return { ok: false, code: "check_unavailable", reason: error.message, status: 503 }; }
    if (!answer.ok) return { ok: false, code: "control_unavailable", reason: answer.reason ?? "Kiln couldn't check the stop again.", status: 409 };
    const phase = `Phase ${this.judgedId(key)} · ${this.record.plan?.find((one) => one.id === this.judgedId(key))?.title ?? ""}`.replace(/ · $/, "");
    const stillStopped = this.stoppedPhaseKey() === key;
    if (stillStopped) {
      const remaining = (this.record.phases[key]?.stop?.checks ?? []).filter((one) => !one.passed).flatMap((one) => one.facts);
      return { ok: true, outcome: "located_still_stopped", located: { ...located, phase, facts: remaining } };
    }
    return { ok: true, outcome: "located_phase_starting", located: { ...located, label: this.labelOf(question.repository), phase } };
  }

  /**
   * Reaches a name for an addition as the plan's names are reached (find repositories anywhere
   * "Names"): an entry Kiln recorded keeps its checkout; a repository found gets its name, given
   * once against the entries; a question is the caller's to ask (find repositories anywhere AC-ASK-07, AC-SESSION-01).
   */
  private async reachForAddition(written: string, phaseKey: string, planPhases: { fileName: string; repositories: string[] }[]): Promise<{ name: string; found?: FoundRepository } | { result: AddRepositoryResult } | { question: Question }> {
    const refuse422 = (reason: string) => ({ result: { ok: false as const, status: 422 as const, reason } });
    const read = readRepositoryName(written);
    if (read.kind === "problem") return refuse422(read.problem());
    const { record } = this;
    // Reached together with the plan's folder names, so an address path a folder name of the plan
    // reaches is that folder's repository, with no search (find repositories anywhere AC-NAME-02, "Names" step 4).
    // In plan order, so of two folder names with one address path the first is its checkout.
    const folderNames = planNames(planPhases, this.paths.repositoryName).filter((one) => one.name === written || readRepositoryName(one.name).kind === "folder").map((one) => (one.name === written ? { name: written, namedIn: phaseKey } : one));
    if (!folderNames.some((one) => one.name === written)) folderNames.push({ name: written, namedIn: phaseKey });
    const resolution = await resolveNames({
      git: this.git,
      env: this.options.env,
      prd: { name: this.paths.repositoryName, mainCheckoutPath: this.paths.mainCheckoutPath, github: record.repository.github },
      entries: record.repositories,
      names: folderNames,
      say: (line) => this.repositoryLine(line),
      said: this.repositoryLinesSaid,
    });
    const reached = resolution.byName.get(written)!;
    if (reached.kind === "problem") {
      // A folder name keeps today's wording, without a phase file.
      return refuse422(read.kind === "folder" ? reached.problem.replace(`${phaseKey} names ${written}, which`, `${written}`) : reached.problem);
    }
    if (reached.kind === "entry") return { name: reached.name };
    // The PRD's own repository, by a name that reaches it: already in the workspace.
    if (reached.kind === "prd") {
      const prd = record.repositories.find((entry) => entry.kind === "prd");
      return prd ? { result: { ok: true, name: prd.name, worktreePath: expandHome(prd.worktreePath), branch: record.settings.featureBranch, baseBranch: prd.baseBranch, added: false } } : refuse422(`${written} is the PRD's own repository.`);
    }
    const { repository } = reached;
    if (repository.question) return { question: repository.question };
    const given = giveNames(record.repositories, [{ shortName: repository.shortName, addressPath: repository.addressPath }]);
    if (!given.ok) return refuse422(given.problem);
    const name = given.names[0]!;
    return { name, found: { ...repository.found!, name, ...(name !== repository.shortName ? { shortName: repository.shortName } : {}) } };
  }

  private async addOne(name: string, phaseKey: string, reached?: FoundRepository): Promise<AddRepositoryResult> {
    const { record } = this;
    const branch = record.settings.featureBranch;
    const answer = (entry: RepositoryEntry, added: boolean): AddRepositoryResult => ({
      ok: true,
      name: entry.name,
      worktreePath: expandHome(entry.worktreePath),
      branch,
      baseBranch: entry.baseBranch,
      added,
    });
    const refuse422 = (reason: string): AddRepositoryResult => ({ ok: false, status: 422, reason });

    const existing = record.repositories.find((entry) => entry.name === name);
    if (existing?.setupCompletedAt !== undefined) return answer(existing, false);

    // Check 1: reached as the start checks reach a named one; an entry's checkout is its own, never searched for again.
    const found = { repository: reached ?? (existing ? { name, mainCheckoutPath: existing.mainCheckoutPath, github: existing.github } : undefined) };
    if (!found.repository) return refuse422(`${name} isn’t one of the PRD's repositories.`);
    const worktreePath = join(this.workspaceFolder, name);
    // Its messages name it by its label (find repositories anywhere AC-FOLDER-02), worked out before it is an entry.
    const label = labelAmong({ shortName: existing ? shortNameOf(existing) : (reached?.shortName ?? name), addressPath: found.repository.github }, this.labelSet());

    // An unfinished entry: what Git has at its worktree path decides first.
    if (existing !== undefined) {
      const worktrees = await listWorktrees(this.git, existing.mainCheckoutPath);
      if (!worktrees.ok) return refuse422(worktrees.error);
      const target = comparable(realPathOfNearestAncestor(expandHome(existing.worktreePath)));
      const there = worktrees.worktrees.find((worktree) => comparable(worktree.path) === target);
      // Git refuses another add at a worktree left half made, even after its folder is deleted; Kiln removes nothing.
      if (there?.locked === "initializing") return refuse422(halfMadeMessage(existing, "then ask again.", label));
      if (there && there.branch === branch) {
        // The phase's commits there start where the branch was made.
        const start = existing.baseCommit ?? existing.createdBranch?.commit ?? (await localBranchCommit(this.git, existing.mainCheckoutPath, branch));
        if (start !== undefined) existing.baseCommit = start;
        return this.finishAdd(existing, phaseKey, answer);
      }
    }

    let entry: RepositoryEntry;
    const interrupted = existing?.baseCommit !== undefined;
    if (existing?.baseCommit !== undefined) {
      // An interrupted add: finished from its recorded base and commit, without asking origin.
      entry = existing;
    } else {
      const origin = await originBranches(this.git, found.repository.mainCheckoutPath);
      // Kiln's own branch is told apart from another only on origin, so check 2 can't judge it unreached.
      if (
        !origin.ok &&
        existing?.createdBranch?.name === branch &&
        (await localBranchCommit(this.git, found.repository.mainCheckoutPath, branch)) === existing.createdBranch.commit
      ) {
        return refuse422(`Couldn’t reach origin: ${origin.error}`);
      }
      const ownBranch =
        existing?.createdBranch !== undefined &&
        existing.createdBranch.name === branch &&
        (await isOwnBranchAt(this.git, found.repository.mainCheckoutPath, branch, existing.createdBranch.commit, origin.ok ? origin.value : undefined, undefined));
      // Check 2: the feature branch is free there, apart from Kiln's own branch.
      if (!ownBranch) {
        const local = await localBranchCommit(this.git, found.repository.mainCheckoutPath, branch);
        if (local !== undefined || (origin.ok && origin.value.branches.has(branch))) {
          return refuse422(`That branch already exists in ${label}. Kiln adds a repository only where ${branch} is free.`);
        }
      }
      // Check 3: the worktree path is new or empty, and not inside a checkout, this repository's or any of the PRD's.
      const pathError =
        (await checkWorktreePath(this.git, found.repository.mainCheckoutPath, worktreePath)) ??
        (await checkWorkspaceFolderPlacement(this.git, this.setUpRepositories.map((one) => ({ name: one.name, mainCheckoutPath: one.mainCheckoutPath, label: this.labelOf(one.name) })), worktreePath));
      if (pathError) return refuse422(`Kiln can't make ${label}'s worktree at ${displayPath(worktreePath)}: ${pathError.replace(/ Choose (a new one|one outside it)\.$/, "")}`);
      let baseBranch: string;
      let baseCommit: string;
      if (ownBranch) {
        // A failed add's branch takes the place of check 4: its base is fixed.
        baseBranch = existing!.baseBranch;
        baseCommit = existing!.createdBranch!.commit;
      } else {
        // Check 4: develop on its origin, else origin's default branch (REPO-003).
        if (!origin.ok) return refuse422(`Couldn’t reach origin: ${origin.error}`);
        baseBranch = defaultBaseBranch(origin.value);
        if (baseBranch === "") return refuse422(`${label}'s origin has no develop and no default branch.`);
        baseCommit = origin.value.branches.get(baseBranch)!;
        const fetched = await fetchIfMissing(this.git, found.repository.mainCheckoutPath, baseBranch, baseCommit);
        if (fetched) return refuse422(fetched);
      }
      entry = existing ?? { name, kind: "added", mainCheckoutPath: found.repository.mainCheckoutPath, github: found.repository.github, ...(found.repository.shortName === undefined ? {} : { shortName: found.repository.shortName }), baseBranch, worktreePath };
      Object.assign(entry, {
        kind: "added",
        mainCheckoutPath: found.repository.mainCheckoutPath,
        github: found.repository.github,
        baseBranch,
        worktreePath,
        addedInPhase: phaseKey,
        addedAt: this.now().toISOString(),
        baseCommit,
      });
      if (!existing) record.repositories.push(entry);
      // Recorded before the worktree is added, as setup at Start records first.
      this.save();
    }

    // An interrupted add (an entry that already held its commit) is finished without asking origin.
    const outcome = await addEntryWorktree(this.git, entry, branch, "then ask again.", !interrupted, label);
    if (this.stopping) return { ok: false, status: 409, reason: "Kiln is stopping." };
    if (!outcome.ok) {
      // A worktree Git left half made changes nothing: the person removes it as the message says.
      if (outcome.error !== halfMadeMessage(entry, "then ask again.", label)) {
        await undoEntry(this.git, entry, branch);
        record.repositories = record.repositories.filter((candidate) => !entryHoldsNothing(candidate));
        this.save();
      }
      return refuse422(outcome.error);
    }
    return this.finishAdd(entry, phaseKey, answer);
  }

  /** An added repository's worktree is there: it joins the PRD's repositories from this phase on. */
  private finishAdd(entry: RepositoryEntry, phaseKey: string, answer: (entry: RepositoryEntry, added: boolean) => AddRepositoryResult): AddRepositoryResult {
    const name = entry.name;
    entry.setupCompletedAt = this.now().toISOString();
    delete entry.createdBranch;
    // The finishing request's phase is the first whose session has the repository.
    entry.addedInPhase = phaseKey;
    entry.addedAt = this.now().toISOString();
    const facts = this.phaseFacts(phaseKey);
    facts.repositories[name] = { startCommit: entry.baseCommit! };
    this.save();
    // The added line names the session's judged leaf, from the latest read of the plan.
    const read = readPlanAt(this.worktreePath, this.paths.prdDirectoryFromRoot);
    const judged = read.ok ? judgedPhase(read.plan.phases, phaseKey)?.id ?? phaseKey : this.judgedId(phaseKey);
    this.emit({ kind: "repository_added", at: this.now(), phaseId: judged, title: this.titleOf(judged), name });
    return answer(entry, true);
  }

  // ---- Sessions across the workspace (multi-repo technical design, "Sessions") ------------------

  /** The folder a session runs in, launched and resumed: recorded at launch; a schema 1 session's is the PRD's worktree. */
  workingDirectoryOf(session: SessionRecord): string {
    return session.workingDirectory ?? this.worktreePath;
  }

  /**
   * `--add-dir` for the workspace folder when the session doesn't start there, so a worktree
   * added mid-phase is writable by mode, and for every worktree of the workspace outside both.
   */
  private addDirs(cwd: string): string[] {
    // The push session's only folder is the main checkout it starts in (Kiln After Delivery, "Gates").
    if (openPlanPush(this.record)) return [];
    const inside = (path: string, folder: string) => isWithin(comparable(realPathOfNearestAncestor(path)), comparable(realPathOfNearestAncestor(folder)));
    const dirs: string[] = [];
    const folder = this.workspaceFolder;
    if (comparable(realPathOfNearestAncestor(cwd)) !== comparable(realPathOfNearestAncestor(folder))) dirs.push(folder);
    for (const entry of this.sessionRepositories) {
      const path = expandHome(entry.worktreePath);
      if (!inside(path, cwd) && !inside(path, folder)) dirs.push(path);
    }
    return dirs;
  }

  /** The session's environment: the directory of the `kiln` the person ran first on PATH, so `kiln add-repository` reaches this Kiln. */
  private sessionEnv(): NodeJS.ProcessEnv {
    const bin = this.options.kilnBinDirectory;
    if (bin === undefined) return this.options.env;
    const key = Object.keys(this.options.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
    const path = this.options.env[key];
    return { ...this.options.env, [key]: path ? `${bin}${delimiter}${path}` : bin };
  }

  /** A path from the PRD's repository's root, as seen from the folder a session starts in. */
  pathFrom(folder: string, fromPrdRoot: string): string {
    const absolute = join(this.worktreePath, ...fromPrdRoot.split("/"));
    const rel = relative(folder, absolute);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return rel === "" ? "." : absolute;
    return rel.split(sep).join("/");
  }

  /** The PRD's repositories as a prompt lists them, in list order. */
  private promptRepositories(entries: RepositoryEntry[]): PromptRepository[] {
    return entries.map((entry) => ({
      name: entry.name,
      label: this.labelOf(entry.name),
      checkout: displayPath(expandHome(entry.mainCheckoutPath)),
      github: entry.github,
      worktreePath: expandHome(entry.worktreePath),
      baseBranch: entry.baseBranch,
      isPrd: entry.kind === "prd",
    }));
  }

  /**
   * The phase prompt's values for a session starting in `folder`. The workspace form once the PRD
   * has more than one repository, so the fresh-session prompt of a one-repository PRD's session
   * that added one names it too (AC-SPACE-04), with paths still from the folder it started in.
   */
  phasePromptValues(fileName: string, folder: string): PhasePromptValues {
    const workspace = this.multiRepository || folder !== this.worktreePath;
    return {
      phaseDoc: this.pathFrom(folder, `${this.paths.prdDirectoryFromRoot}/${fileName}`),
      deliveryAuthority: this.deliveryAuthority(),
      featureName: this.paths.featureName,
      prdFile: this.pathFrom(folder, this.prdFile()),
      worktreePath: this.worktreePath,
      branch: this.record.settings.featureBranch,
      parentFolder: displayPath(this.parentFolder),
      ...(workspace ? { workspace: { folder: this.workspaceFolder, repositories: this.promptRepositories(this.setUpRepositories) } } : {}),
      unfollowedLinks: this.unfollowedLinks,
    };
  }

  /**
   * The repositories that get a pull request, for a snapshot: as the last pull-request check read
   * them from Git, else those whose recorded pushed commit differs from their base commit.
   */
  pullRequestRepositories(): RepositoryEntry[] {
    if (this.lastPullRequestRepositories) return this.lastPullRequestRepositories;
    return this.setUpRepositories.filter(
      (entry) => entry.kind === "prd" || Object.values(this.record.phases).some((facts) => {
        const repository = facts.repositories[entry.name];
        return repository?.pushedSha !== undefined && repository.pushedSha !== entry.baseCommit;
      }),
    );
  }

  /** The repositories that get a pull request, read from Git now: every one whose local branch tip differs from its base commit (AC-PRS-05). */
  private async pullRequestRepositoriesNow(): Promise<RepositoryEntry[]> {
    const tips = await Promise.all(this.setUpRepositories.map((entry) => localBranchCommit(this.git, entry.mainCheckoutPath, this.record.settings.featureBranch)));
    this.lastPullRequestRepositories = this.setUpRepositories.filter((entry, index) => entry.kind === "prd" || (tips[index] !== undefined && tips[index] !== entry.baseCommit) || Object.values(this.record.phases).some(facts => {
      const pushed = facts.repositories[entry.name]?.pushedSha;
      return pushed !== undefined && pushed !== entry.baseCommit;
    }));
    return this.lastPullRequestRepositories;
  }

  /** The pull-request prompt's values for a session starting in `folder`. */
  async pullRequestPromptValues(folder: string) {
    return {
      deliveryAuthority: this.deliveryAuthority(),
      featureName: this.paths.featureName,
      prdFile: this.pathFrom(folder, this.prdFile()),
      branch: this.record.settings.featureBranch,
      repositories: this.promptRepositories(await this.pullRequestRepositoriesNow()),
      deliveryBlock: this.deliveryBlockNow(),
    };
  }

  /**
   * The block each pull request's description opens with (AC-LEFT-01, AC-ITEM-03): **For you**, each
   * item's line with its Waived tag, then the after-delivery actions; **Closing audits** from the
   * ledger and the limits in force; then **Settled during the build**. Built only from saved facts.
   */
  deliveryBlockNow(): string {
    const tag = (ref: WaiverRef) => waivedTagText(ref, this.activityName(ref.activityKey));
    return deliveryBlock(forYou(this.stateDirectory, this.record), personItems(this.stateDirectory, this.record).settled, tag, closingAudits(this.record));
  }

  /**
   * The pull request check's **Pull request description** row (AC-LEFT-01), added after waivers are
   * applied, only while the run is not complete, every other row passes and at least one pull request
   * is open: it passes only when the latest pull request session in this execution that delivered its
   * block was given the block Kiln would give now.
   */
  private addDescriptionRow(outcome: { passed: boolean; checks: CheckResult[]; pullRequests?: PullRequestFacts[] }): void {
    if (this.record.completedAt || !outcome.passed || !outcome.pullRequests?.length) return;
    const sessions = (this.record.phases[PR_PHASE_KEY]?.sessionIds ?? []).flatMap(id => { const one = this.sessionRecord(PR_PHASE_KEY, id); return one && (!one.executionId || one.executionId === this.record.executionId) ? [one] : []; });
    const row = descriptionRow(sessions, this.deliveryBlockNow(), outcome.pullRequests.length);
    outcome.checks.push(row);
    outcome.passed = row.passed;
  }

  /** A stop on final delivery whose only failing row is **Pull request description**: Check again starts the pull request session, and Mark final delivery complete needs no recheck first (AC-LEFT-01). */
  private onlyDescriptionFails(checks: readonly CheckResult[]): boolean {
    const failing = checks.filter(check => !check.passed);
    return failing.length > 0 && failing.every(check => check.name === DESCRIPTION_CHECK);
  }

  private checkedRepository(entry: RepositoryEntry): CheckedRepository {
    return {
      name: entry.name,
      label: this.labelOf(entry.name),
      github: entry.github,
      baseBranch: entry.baseBranch,
      mainCheckoutPath: entry.mainCheckoutPath,
      worktreePath: expandHome(entry.worktreePath),
      baseCommit: entry.baseCommit,
    };
  }

  // ---- Reading the record and the plan ---------------------------------------------------

  /** Whether a session ran and Claude Code holds no transcript for it, so it can't be resumed (OUT-003). */
  transcriptMissing(session: SessionRecord): boolean {
    if (session.agentId === "codex") {
      if (!session.conversation?.threadId) return true;
      if (this.codexFolderMoved(session)) return true;
      return session.codex?.conversationUnavailable === true;
    }
    return !claudeHistoryAvailability(this.options.env, session.sessionId).available;
  }

  /** A Codex conversation resumes only in its recorded folder: one that is neither the session folder nor a set-up worktree, as after a Folder missing recovery moved it, can't be resumed (WTR-004). */
  private codexFolderMoved(session: SessionRecord): boolean {
    if (session.workingDirectory === undefined || !this.isUnderway || this.record.completedAt) return false;
    const recorded = comparable(realPathOfNearestAncestor(resolve(expandHome(session.workingDirectory))));
    const current = [this.sessionFolder, ...this.setUpRepositories.map(entry => expandHome(entry.worktreePath))].map(path => comparable(realPathOfNearestAncestor(resolve(path))));
    return !current.includes(recorded);
  }

  sessionRecord(phaseKey: string, sessionId: string): SessionRecord | undefined {
    return readSessionRecord(this.options.stateDirectory, phaseKey, sessionId);
  }

  /** The phase's session records, in the order they were made. */
  phaseSessions(phaseKey: string): SessionRecord[] {
    return (this.record.phases[phaseKey]?.sessionIds ?? []).flatMap(id => { const session = this.sessionRecord(phaseKey, id); return session ? [session] : []; });
  }

  /** The phase's last session record, which the next launch reuses when it has no run (run restart "A session record with no run"). */
  lastRecord(phaseKey: string): SessionRecord | undefined {
    const id = this.record.phases[phaseKey]?.sessionIds.at(-1);
    return id === undefined ? undefined : this.sessionRecord(phaseKey, id);
  }

  /**
   * What session selection needs of one session record, read one record at a time and kept until
   * the record's file changes, so selection never holds every record of a long phase at once.
   */
  private sessionSummary(phaseKey: string, sessionId: string): { stamp: string; lastStartedAt?: string; runs: number; began: boolean; firstResponseAt?: string } | undefined {
    let stamp: string;
    try { const stat = statSync(join(this.stateDirectory, phaseKey, sessionId, "session.json")); stamp = `${stat.mtimeMs}:${stat.size}`; }
    catch { return undefined; }
    const key = `${phaseKey}/${sessionId}`;
    const cached = this.sessionSummaries.get(key);
    if (cached?.stamp === stamp) return cached;
    const session = this.sessionRecord(phaseKey, sessionId);
    if (!session) return undefined;
    const summary = { stamp, ...(session.runs.length ? { lastStartedAt: session.runs.at(-1)!.startedAt } : {}), runs: session.runs.length, began: sessionBegan(this.stateDirectory, session), ...(session.firstResponseAt ? { firstResponseAt: session.firstResponseAt } : {}) };
    this.sessionSummaries.set(key, summary);
    return summary;
  }
  private readonly sessionSummaries = new Map<string, { stamp: string; lastStartedAt?: string; runs: number; began: boolean; firstResponseAt?: string }>();

  /** A session's first model response, read once per change to its record (Kiln Phase Model Tiers, "When an Activity Starts"). */
  sessionFirstResponse(phaseKey: string, sessionId: string): string | undefined { return this.sessionSummary(phaseKey, sessionId)?.firstResponseAt; }

  /**
   * The phase's latest launch: the session whose latest run started last. Everything about an
   * attempt reads it. With no run anywhere, the last record (run restart "Latest launch").
   */
  latestSession(phaseKey: string): SessionRecord | undefined {
    const ids = this.record.phases[phaseKey]?.sessionIds ?? [];
    let chosen: string | undefined; let at: string | undefined;
    for (const id of ids) {
      const started = this.sessionSummary(phaseKey, id)?.lastStartedAt;
      if (started !== undefined && (at === undefined || started >= at)) { chosen = id; at = started; }
    }
    return this.lastRecordOr(phaseKey, chosen);
  }

  /** What resume, reply, the terminal command and the reopen check read: the latest conversation, or the latest launch when none began. */
  recoverySession(phaseKey: string): SessionRecord | undefined {
    const ids = this.record.phases[phaseKey]?.sessionIds ?? [];
    const began = ids.findLast(id => this.sessionSummary(phaseKey, id)?.began);
    return began ? this.sessionRecord(phaseKey, began) : this.latestSession(phaseKey);
  }

  private lastRecordOr(phaseKey: string, id: string | undefined): SessionRecord | undefined {
    return id === undefined ? this.lastRecord(phaseKey) : this.sessionRecord(phaseKey, id);
  }

  /** Whether any session of the phase began a conversation (run restart AC-CASE-01). */
  conversationBegan(phaseKey: string): boolean {
    return (this.record.phases[phaseKey]?.sessionIds ?? []).some(id => this.sessionSummary(phaseKey, id)?.began);
  }

  /** Every run of the phase's sessions, counted. */
  private phaseRunCount(phaseKey: string): number {
    return (this.record.phases[phaseKey]?.sessionIds ?? []).reduce((sum, id) => sum + (this.sessionSummary(phaseKey, id)?.runs ?? 0), 0);
  }

  /**
   * Whether the phase's latest conversation can be reopened, and why not (run restart "Whether the
   * conversation can be reopened"). Claude reads the saved file at each call; Codex reads only
   * recorded facts and starts no process.
   */
  reopenCheck(phaseKey: string): ReopenCheck {
    const session = this.recoverySession(phaseKey);
    if (!session) return { state: "unavailable", reason: "missing" };
    if (session.agentId === "codex") {
      const problems = this.codexSafetyProblems(phaseKey, false);
      if (problems.length) return { state: "safety", problems };
      if (!this.transcriptMissing(session)) return { state: "available" };
      const detail = this.codexFolderMoved(session) ? `Codex reopens this conversation only in ${session.workingDirectory}, which is no longer this run's folder.` : session.codex?.resumeError ?? "Codex conversation cannot be opened.";
      return { state: "unavailable", reason: "codex", detail };
    }
    // A held phase's check reads the saved file alone, as release does (run restart "Whether the conversation can be reopened", row 6).
    return claudeReopenCheck(this.options.env, this.stateDirectory, session, this.record.liveControl?.takeover.target.activityKey === phaseKey);
  }

  /** A run's last output time: its last saved event's arrival, or its start when it saved none. */
  runLastOutputAt(session: SessionRecord, runIndex: number): string | undefined {
    return runLastOutputAt(this.options.stateDirectory, session, runIndex);
  }

  /**
   * The recorded runs of the sessions under `keys`, a run Kiln is no longer running closed at its
   * last output, and whether one is running now (Kiln v1 AC-WATCH-01; time totals AC-TOTAL-02).
   */
  sessionRuns(keys: string[]): { runs: Pick<SessionRun, "startedAt" | "endedAt" | "interruptedAt">[]; running: boolean } {
    let running = false;
    const runs = keys.flatMap(key => (this.record.phases[key]?.sessionIds ?? []).flatMap(id => {
      const session = this.sessionRecord(key, id);
      if (!session) return [];
      return session.runs.map((run, index) => {
        const live = this.current?.session?.sessionId === id && this.current.processRunning && index === session.runs.length - 1 && !run.endedAt && !run.interruptedAt;
        running ||= live;
        return { ...run, ...(!live && !run.endedAt && !run.interruptedAt ? { endedAt: this.runLastOutputAt(session, index) ?? run.startedAt } : {}) };
      });
    }));
    return { runs, running };
  }

  /** This execution's running time up to `until`, saved on its row when it is archived (time totals AC-TOTAL-02). */
  private executionRunningMs(until: string): { runningMs?: number } {
    if (!this.record.startedAt) return {};
    return { runningMs: runTiming(this.sessionRuns(Object.keys(this.record.phases)).runs, this.record.startedAt, until).runningMs };
  }

  /** Every output line of a session saved so far. */
  outputLines(session: SessionRecord): OutputLine[] {
    return readOutputLines(this.options.stateDirectory, session);
  }

  /** The phase that holds a Needs you stop, if any. */
  stoppedPhaseKey(): string | undefined {
    if (this.recoveredLive && this.current?.processRunning) return undefined;
    // A hold is a stop only while its stop is recorded: a launch from the hold clears the stop before its process runs (run restart AC-CARRY-06).
    const held = this.record.liveControl && !this.current?.processRunning ? this.record.liveControl.takeover.target.activityKey : undefined;
    if (held !== undefined && this.record.phases[held]?.stop !== undefined) return held;
    return this.record.billing?.hold?.phaseKey ?? Object.entries(this.record.phases).find(([, facts]) => facts.stop !== undefined)?.[0];
  }

  isPhaseDone(phaseKey: string): boolean {
    return phaseKey === PR_PHASE_KEY ? this.record.completedAt !== undefined : this.record.phases[phaseKey]?.doneAt !== undefined;
  }

  /** The first leaf not closed in the recorded plan, or `pr` when every leaf there is closed. */
  nextKeyFromRecordedPlan(): string {
    const pending = this.record.completionAudits?.activities.findLast(a => !this.record.phases[auditKey(a)]?.doneAt);
    return pending ? auditKey(pending) : recordedLeaves(this.record.plan ?? []).find((phase) => !phase.closed && !this.waiverClosed(phase.id))?.id ?? this.record.nextActivityKey ?? PR_PHASE_KEY;
  }

  /** The leaf a launched leaf's session is shown as: its first leaf after a split, else itself. */
  judgedId(launchedId: string): string {
    if (launchedId === PR_PHASE_KEY || isAfterDeliveryKey(launchedId)) return launchedId;
    return judgedPhase(this.record.plan ?? [], launchedId)?.id ?? launchedId;
  }

  titleOf(phaseId: string): string {
    const stage = this.record.requirements?.stages.find(s => phaseId === `req-${s.activityId}`);
    if (stage) return stage.ran[0]?.title ?? stage.expected?.title ?? (stage.task === "review" ? "Stakeholder review" : "Next requirements stage");
    const audit = this.auditActivity(phaseId);
    if (isPreflightKey(phaseId)) return PREFLIGHT_TITLE;
    if (isPlanPushKey(phaseId)) return "Push the plan";
    return audit ? recordedAuditName(this.record, audit).title : this.record.plan?.find((phase) => phase.id === phaseId)?.title ?? phaseId;
  }

  fileOf(phaseId: string): string | undefined {
    return this.record.plan?.find((phase) => phase.id === phaseId)?.file;
  }

  prdFile(): string {
    return `${this.paths.prdDirectoryFromRoot}/${this.paths.folderName}-prd.md`;
  }

  private async readPlan(): Promise<PlanRead> {
    // Completed-run discovery belongs to a separate, explicit observation path.
    if (this.record.completedAt) {
      const read = readPlanAt(this.worktreePath, this.paths.prdDirectoryFromRoot);
      if (read.ok) this.plan = read.plan;
      return read;
    }
    const attemptedAt = this.now().toISOString();
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    const git = { ...this.git, signal };
    let baseline: Omit<PlanBaseline, "id">;
    let added: string[];
    try {
      const previous = this.record.planReconciliation?.baselineId ? await comparisonBaseline(this.stateDirectory, this.record.planReconciliation.baselineId, { repositoryName: this.paths.repositoryName, read: revision => observeGitPlan(git, this.worktreePath, this.paths.prdDirectoryFromRoot, revision) }) : undefined;
      const observed = observeActivePlan(this.worktreePath, this.paths.prdDirectoryFromRoot);
      const active = observed.source;
      this.unfollowedLinks = observed.unfollowed;
      // Once set up, the assigned worktree owns this execution's documents.
      // Other checkouts are considered only by completed-run discovery.
      if (!previous) for (const [key, facts] of Object.entries(this.record.phases)) {
        if (!facts.doneAt || !facts.sessionIds.length || activityKeyKind(key) !== "phase") continue;
        const recorded = judgedPhase(this.record.plan ?? [], key);
        const current = recorded && active.plan.phases.find(p => p.id === recorded.id);
        if (!recorded || !current || !current.closed && !this.waiverClosed(current.id) || current.splitInto) throw new Error(`baseline_unavailable: Phase ${recorded?.id ?? key} was previously completed but is now removed, reopened or split. Reconcile that historical completion before returning control.`);
      }
      if (previous) {
        // A carried-finished phase is never compared: it stays finished whatever its document says (AC-BACK-01).
        const carried = this.carriedFinished();
        const completed = new Set([...Object.keys(previous.completions), ...Object.entries(this.record.phases).filter(([, f]) => f.doneAt).map(([key]) => this.judgedId(key))].filter(id => !carried.has(id)));
        const problems = completedScopeProblems({ ...previous.active, plan: { ...previous.active.plan, phases: previous.active.plan.phases.map(p => ({ ...p, closed: p.closed && completed.has(p.id) })) } }, active, previous.completions);
        if (problems.length) throw new Error(problems.join(" ") + " Reconcile earlier completed work before returning control.");
      }
      const completions = { ...previous?.completions };
      let closedAtStart: Set<string> | undefined;
      for (const phase of active.plan.phases.filter(p => (p.closed || this.waiverClosed(p.id)) && !p.splitInto)) {
        const owner = Object.entries(this.record.phases).find(([key, facts]) => judgedPhase(active.plan.phases, key)?.id === phase.id && (facts.sessionIds.length || facts.waiverId || facts.skippedByWaiver));
        // Completed or skipped on a waiver: carried by its waiver, never by evidence it does not have (waivers "Continuation executions").
        const waiverId = owner?.[1].waiverId ?? owner?.[1].skippedByWaiver ?? closedWaiver(this.record.waivers, phase.id)?.waiverId;
        if (owner && !owner[1].doneAt && owner[1].skippedByWaiver) {
          // A skipped phase records an address path that reaches no entry lower-cased (find repositories anywhere, "Names").
          completions[phase.id] ??= { kind: "kiln", waiverId: owner[1].skippedByWaiver, scopeRepositories: phaseRepositories(active, phase.id).map(scopeKey) };
          continue;
        }
        if (owner) {
          if (owner[1].doneAt) {
            const revision = owner[1].repositories[this.paths.repositoryName]?.pushedSha ?? owner[1].repositories[this.paths.repositoryName]?.waivedHead;
            let scopeRepositories = completions[phase.id]?.scopeRepositories;
            if (!scopeRepositories) {
              if (!revision && waiverId) scopeRepositories = phaseRepositories(active, phase.id);
              else {
                if (!revision) throw new Error(`baseline_unavailable: Phase ${phase.id} has no retained scope or recorded published document revision. Restore that receipt/revision before returning control.`);
                const original = await observeGitPlan(git, this.worktreePath, this.paths.prdDirectoryFromRoot, revision!);
                if (!original.plan.phases.find(p => p.id === phase.id)?.closed && !this.waiverClosed(phase.id) || !completedPhaseScopeUnchanged(original, active, phase.id)) throw new Error(`baseline_unavailable: Phase ${phase.id} differs from, or cannot be read at, its recorded completion revision ${revision}. Reconcile the earlier completed scope or restore that revision; today's document cannot prove yesterday's work.`);
                scopeRepositories = phaseRepositories(original, phase.id);
              }
            }
            completions[phase.id] = { scopeRepositories, kind: "kiln", ...(waiverId ? { waiverId } : {}), doneAt: owner[1].doneAt, ...(revision ? { revision } : {}), repositories: Object.fromEntries(Object.entries(owner[1].repositories).flatMap(([name, facts]) => facts.pushedSha ? [[name, { identity: this.record.repositories.find(entry => entry.name === name)!.github, revision: facts.pushedSha }]] : facts.waivedHead ? [[name, { identity: this.record.repositories.find(entry => entry.name === name)!.github, revision: facts.waivedHead, waived: true as const }]] : [])) };
          }
          continue;
        }
        if (completions[phase.id]) continue;
        if (this.record.preparation?.stage !== "implementation" && this.record.preparation?.bindings.some(binding => preparesPhase(binding, phase.id))) continue;
        const affectedNames = [...new Set(namedRepositories(active.plan.phases.filter(p => p.id === phase.id || isAncestorOf(p.id, phase.id)), this.paths.repositoryName).map(name => recordedName(this.record, name)))].filter(name => name !== this.paths.repositoryName);
        const missing = affectedNames.filter(name => !this.setUpRepositories.some(entry => entry.name === name));
        if (missing.length) throw new Error(`Externally closed Phase ${phase.id} needs completion evidence in repositories not set up: ${missing.join(", ")}. Reconcile their workspace and published work before returning control.`);
        // On a start from an existing branch, the first plan read accepts a leaf Closed at the PRD
        // repository's start commit on its Closed line alone (run restart AC-FROM-02, "After Start"):
        // its runStartCommit, or its baseCommit when its branch is cut new (AC-FROM-05).
        const prdEntry = this.setUpRepositories.find(entry => entry.kind === "prd");
        const prdStartCommit = prdEntry?.runStartCommit ?? prdEntry?.baseCommit;
        if (!previous && prdStartCommit && this.record.start?.from === "existing") {
          closedAtStart ??= new Set((await observeGitPlan(git, this.worktreePath, this.paths.prdDirectoryFromRoot, prdStartCommit)).plan.phases.filter(p => p.closed && !p.splitInto).map(p => p.id));
          if (closedAtStart.has(phase.id)) {
            completions[phase.id] = { kind: "external", scopeRepositories: phaseRepositories(active, phase.id), revision: prdStartCommit, repositories: Object.fromEntries(this.setUpRepositories.map(entry => [entry.name, { identity: entry.github, revision: entry.runStartCommit ?? entry.baseCommit! }])) };
            continue;
          }
        }
        // A Closed phase already published on the setup base needs no feature-branch push.
        // Prove exact document bytes, clean assigned workspace and published base independently.
        if (!previous) {
          const file = `${this.paths.prdDirectoryFromRoot}/${phase.fileName}`;
          const entries = this.setUpRepositories;
          const proofs = await Promise.all(entries.map(async entry => {
            const cwd = expandHome(entry.worktreePath);
            const [status, head, branch, published] = await Promise.all([
              runGit(git, cwd, ["status", "--porcelain"]), runGit(git, cwd, ["rev-parse", "HEAD"]),
              runGit(git, cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]), runGit(git, cwd, ["ls-remote", "origin", `refs/heads/${entry.baseBranch}`]),
            ]);
            return [status, head, branch, published].every(result => result.exitCode === 0) && !status.stdout.trim() && head.stdout.trim() === entry.baseCommit && branch.stdout.trim() === this.record.settings.featureBranch && published.stdout.trim().split(/\s/)[0] === entry.baseCommit;
          }));
          const prd = entries.find(entry => entry.kind === "prd");
          const blob = prd?.baseCommit ? await runGit(git, this.worktreePath, ["show", `${prd.baseCommit}:${file}`]) : undefined;
          if (entries.length && proofs.every(Boolean) && blob?.exitCode === 0 && blob.stdout === active.documents[file]) {
            completions[phase.id] = { kind: "external", scopeRepositories: phaseRepositories(active, phase.id), revision: prd!.baseCommit!, repositories: Object.fromEntries(entries.map(entry => [entry.name, { identity: entry.github, revision: entry.baseCommit! }])) }; continue;
          }
        }
        const outcome = await runDoneCheck({ git, prdWorktreePath: this.worktreePath, prdDirectoryFromRoot: this.paths.prdDirectoryFromRoot,
          repositories: this.setUpRepositories.map(entry => this.checkedRepository(entry)), branch: this.record.settings.featureBranch, launchedLeafId: phase.id,
          ...(this.options.originRetryMs === undefined ? {} : { originRetryMs: this.options.originRetryMs }) });
        if (!outcome.passed) throw new Error(`Externally closed Phase ${phase.id} needs completion evidence: ${outcome.checks.filter(c => !c.passed).flatMap(c => c.facts).join(" ")}`);
        if (deliveryEnabled(this.record)) {
          const delivery = phaseDeliveryCheck(this.deliveryContext(phase.id), phase.id);
          if (!delivery.passed) throw new Error(`Externally closed Phase ${phase.id}: ${delivery.facts.join(" ")}`);
        }
        completions[phase.id] = { kind: "external", scopeRepositories: phaseRepositories(active, phase.id), revision: outcome.pushedShas![this.paths.repositoryName]!, repositories: Object.fromEntries(this.setUpRepositories.map(entry => [entry.name, { identity: entry.github, revision: outcome.pushedShas![entry.name]! }])) };
      }
      signal.throwIfAborted();
      // Remote/provenance checks can take time. Recheck the assigned document set.
      if (observePlan(active.path, this.paths.prdDirectoryFromRoot).digest !== active.digest) throw new Error(`source_changed: ${active.path} changed during plan reconciliation. Retry the handback.`);
      added = addedLeaves(previous ? recordedPlan(previous.active.plan) : this.record.plan, active.plan);
      // Publish sidecar before its record pointer; never roll back an uncertain durable write.
      baseline = { formatVersion: 1, normalizerVersion: PLAN_NORMALIZER_VERSION, prdDirectory: this.paths.prdDirectoryFromRoot, active, sources: [], completions };
      if (Buffer.byteLength(JSON.stringify({ ...baseline, id: "0".repeat(64) }, null, 2)) + 1 > BASELINE_LIMIT) throw new Error(`plan_too_large: maximum ${BASELINE_LIMIT} retained baseline bytes.`);
    } catch (error) {
      if (error instanceof PlanBaselineWriteFailure) { this.commands.fault = error.message; throw error; }
      const problem = (error as Error).message;
      this.record.planReconciliation = { ...this.record.planReconciliation, check: { status: "failed", attemptedAt, problem } };
      this.save();
      // Only a read that could not happen is a check that could not finish; a structural or
      // reconciliation problem is a failing Phase plan reads row, which can be waived (waivers "Failing Items").
      const io = typeof (error as NodeJS.ErrnoException).code === "string" || (error as Error).name === "AbortError" || signal.aborted;
      return { ok: false, problem, ...(io ? { unavailable: true as const } : {}) };
    }
    const retained = this.writeContinuationMetadata(() => retainBaseline(this.stateDirectory, baseline));
    const earlier = this.record.planReconciliation;
    this.record.planReconciliation = { baselineId: retained.id, check: { status: "accepted", attemptedAt },
      ...(added.length ? { handback: { source: baseline.active.path, addedPhaseIds: added, remainingCount: baseline.active.plan.phases.filter(p => !p.splitInto && !p.closed).length, acceptedAt: attemptedAt } } : earlier?.handback ? { handback: { ...earlier.handback, remainingCount: baseline.active.plan.phases.filter(p => !p.splitInto && !p.closed).length } } : {}) };
    this.plan = this.withCarriedFinished(baseline.active.plan);
    this.record.plan = recordedPlan(this.plan);
    this.syncNeededAgents();
    this.record.planReadAt = attemptedAt;
    try { this.save(); }
    catch (error) { this.commands.fault = "Accepted plan could not be durably saved. Restart Kiln to reconcile before advancing."; throw error; }
    if (added.length) this.emit({ kind: "plan_updated", at: this.now(), addedPhaseIds: added, remainingCount: this.record.planReconciliation.handback!.remainingCount, source: baseline.active.path });
    return { ok: true, plan: baseline.active.plan };
  }

  /** The latest session across every phase: the greatest `createdAt`. */
  private latestSessionOverall(): { phaseKey: string; session: SessionRecord } | undefined {
    let latest: { phaseKey: string; session: SessionRecord } | undefined;
    for (const [phaseKey, facts] of Object.entries(this.record.phases)) {
      for (const sessionId of facts.sessionIds) {
        const session = this.sessionRecord(phaseKey, sessionId);
        if (session && (!latest || session.createdAt > latest.session.createdAt)) latest = { phaseKey, session };
      }
    }
    return latest;
  }

  private runtimeControlSettings() {
    const loops = loopSettings(this.record.settings);
    const wait = this.waitAtEarlyReviewSetting();
    return { keep_awake: this.record.settings.keepAwake, resume_after_usage_limit: this.record.settings.resumeAfterUsageLimit, delivery_audit_loops: loops.deliveryLimit, test_audit_loops: loops.testLimit, ...(wait ? { wait_at_early_review: wait.value } : {}) };
  }

  /**
   * Wait for me at the early review (AC-EARLY-05): on unless turned off, set before Start and
   * changeable until a report says the PRD is refined. Absent for a run with no requirements side.
   */
  waitAtEarlyReviewSetting(): { value: boolean; canChange: boolean } | undefined {
    const state = this.record.requirements;
    if (!state) return undefined;
    const refined = !!state.standing && "milestones" in state.standing && state.standing.milestones.some(m => m.name === "prd_refined")
      || state.stages.some(stage => stage.report?.milestones?.some(m => m.name === "prd_refined"));
    return { value: this.record.settings.waitAtEarlyReview !== false, canChange: state.phase !== "closed" && !refined };
  }

  private save(): void {
    // Once a stop begins, nothing is judged: the next `kiln run` judges from the record.
    if (this.stopping) return;
    if (this.commands?.fault) throw new FrozenStateWrite(this.commands.fault);
    const previousControl = { controlRevision: this.record.controlRevision, controlFingerprint: this.record.controlFingerprint, controlApplied: this.record.controlApplied };
    const fingerprint = createHash("sha256").update(JSON.stringify({
      execution: this.record.executionId, pause: this.record.pause, settings: this.record.settings, completed: this.record.completedAt,
      phases: Object.fromEntries(Object.entries(this.record.phases).map(([key, facts]) => [key, { sessions: facts.sessionIds, doneAt: facts.doneAt, stop: facts.stop?.at, wait: facts.wait, locate: facts.stop?.locate?.map(question => question.repository.toLowerCase()) }])),
      next: this.record.nextActivityKey, authorization: this.record.developmentAuthorization, billingHold: this.record.billing?.hold,
    })).digest("hex");
    if (this.record.controlFingerprint !== fingerprint) { this.record.controlRevision = (this.record.controlRevision ?? 0) + 1; this.record.controlFingerprint = fingerprint; }
    const instruction = this.commands?.active;
    if (instruction && ["request-pause", "cancel-pause", "settings", "outside-confirmation", "continue"].includes(instruction.instruction.action)) this.record.controlApplied = { operationId: instruction.id, outcome: "completed", ...(instruction.instruction.action === "settings" ? { settings: this.runtimeControlSettings() } : {}) };
    try { writePrdRecord(this.options.stateDirectory, this.record); }
    catch (error) { Object.assign(this.record, previousControl); if (this.commands?.active) this.commands.fault = "Execution state could not be saved. Restart to reconcile before changing work."; throw new RecoveryStateWriteFailed(`Kiln could not save execution state: ${(error as Error).message}`); }
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  private emit(event: TerminalEvent): void {
    // The ● line doesn't mention an addition, so its line is printed while deciding too (AC-ADD-03).
    if (!this.quiet || event.kind === "repository_added" || event.kind === "repository_line" || event.kind === "plan_updated" || event.kind === "folder_missing") this.options.onTerminal?.(event);
  }
}

/** Model defaults' row names, as a stop names where a choice came from. */
const ROW_NAMES = { demanding: "Demanding", standard: "Standard", mechanical: "Mechanical", audits: "Audits", requirements: "Requirements stages", refining_design: "Refining the design" } as const;

/** An audit skill that doesn't resolve on the Audits choice's agent, carrying the resolver's message. */
class AuditSkillUnresolved extends Error {}

/**
 * A choice that can't be used, as its stop names it (AC-PICK-06): the choice, where it came from
 * and where to change it, then why.
 *
 *   choiceStopFact(choice, "2")  // "Phase 2 runs on Claude Code · Fable · high from Model defaults (Demanding row): Claude Code doesn't offer Fable on this account. Change the Demanding row in Model defaults."
 *   choiceStopFact(choice, "pr") // "The audits, preflight and pull request session run on Claude Code · Opus · high from Model defaults (Audits row): …"
 */
export function choiceStopFact(choice: ActivityChoice, key: string): string {
  const who = key === PR_PHASE_KEY || !isPhaseKey(key) ? "The audits, preflight and pull request session" : `Phase ${key}`;
  const named = [AGENT_NAMES[choice.agentId], choice.modelName, choice.effort].filter(Boolean).join(" · ");
  const row = choice.row ? ROW_NAMES[choice.row] : undefined;
  const from = choice.from === "changed" ? "a change for this PRD" : `Model defaults${row ? ` (${row} row)` : ""}`;
  const where = !who.startsWith("Phase") ? auditsChangePlace(choice.from) : choice.from === "changed" ? "Change it on its row in the phase plan." : `Change ${row ? `the ${row} row` : "it"} in Model defaults.`;
  return `${who} ${who.startsWith("Phase") ? "runs" : "run"} on ${named || "a choice"} from ${from}: ${choice.problem} ${where}`;
}

function codexNotDispatched(run: SessionRun): boolean {
  return !!run.endedAt && !!run.codex && !run.codex.dispatch && run.codex.reconciliation !== "ambiguous" && run.codex.cleanup === "tracked_processes_stopped";
}

function codexSessionNotDispatched(session: SessionRecord | undefined): boolean {
  return session?.agentId === "codex" && session.runs.length > 0 && session.runs.every(codexNotDispatched);
}

/** A refusal's facts as a stop carries them. */
function stopLimit(refusal: LimitRefusal): StopLimit {
  return {
    ...(refusal.rateLimitType === undefined ? {} : { rateLimitType: refusal.rateLimitType }),
    label: refusal.label,
    ...(refusal.resetsAt === undefined ? {} : { resetsAt: refusal.resetsAt }),
  };
}

/** A finished check whose plan problem holds Resume back, reported as check_unavailable as before. */
class ResumeHeld extends CompletionCheckUnavailable {}
/** A catch-up before a session at a stop that could not happen; nothing starts (run restart AC-CURRENT-01). */
class CatchUpFailure extends Error { constructor(readonly code: "branch_changed" | "branch_catch_up_failed", message: string) { super(message); } }

const ACTIVATION_MISSING = "The activation-recovery phase is missing from the current plan.";
const DELIVERY_CHECK = "Required development delivery verified";
/** The check a stop names when an activity's start is unknown (Kiln Phase Model Tiers, "When an Activity Starts"). */
const START_CHECK = "Whether the activity has started";

/** How a waived audit would count (AC-WAIVE-12). */
function previewAuditWaiver(stateDirectory: string, activity: AuditActivity): { report: "accepted" | "valid" | "none"; countedOutcome: string } {
  return classifyAuditReport(stateDirectory, activity);
}

/** An audit that runs a session always resolved its skill; only one completed at once under a waived readiness problem has none. */
function runnableSkill(activity: AuditActivity): NonNullable<AuditActivity["skill"]> {
  if (!activity.skill) throw new Error(`Audit ${activity.activityId} has no resolved skill; it was completed under a waiver and never runs.`);
  return activity.skill;
}

function refuse(reason: string): CommandResult {
  return { ok: false, status: 409, reason };
}

/** A resolved choice as the launch decision takes it. */
function toDecisionChoice(choice: ResolvedChoice): DecisionChoice {
  return { agentId: choice.agentId, model: choice.model ?? "", modelName: choice.modelName, ...(choice.effort ? { effort: choice.effort } : {}) };
}

/**
 * The terminal's line when an activity starts on the fallback (AC-FALLBACK-03).
 *
 *   fallbackStartLine("Phase 2", session, fallback)
 *   // "Phase 2 started on the fallback, Codex · GPT Astra 1 · high: Claude Code's Weekly read 97%, at or above the 95% threshold, so it didn't start on Claude Code · Fable 5 · high. It finishes on Codex."
 */
export function fallbackStartLine(name: string, session: SessionRecord, fallback: LaunchFallback): string {
  const ran = { agentId: session.agentId ?? "claude_code", modelName: session.modelDisplayName, ...(session.effort ? { effort: session.effort } : {}) };
  const limit = fallback.limit.percent === undefined ? limitWords(fallback.limit) : `${limitWords(fallback.limit)}, at or above the ${fallback.threshold}% threshold`;
  return `${name} started on the fallback, ${choiceWords(ran)}: ${limit}${fallback.first ? `, so it didn't start on ${choiceWords(fallback.first)}` : ""}. It finishes on ${AGENT_NAMES[ran.agentId]}.`;
}

/** True when `promise` settles within `ms`; false on the timeout or when `skip` resolves first. */
async function raceTimeout(promise: Promise<unknown>, ms: number, skip?: Promise<void>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), ms)));
  try {
    return await Promise.race([promise.then(() => true), timeout, ...(skip ? [skip.then(() => false)] : [])]);
  } finally {
    clearTimeout(timer);
  }
}

/** One item for a person as the page and `kiln status` show it (AC-ITEM-02). */
export interface PersonItemView {
  /** Absent only on a new entry of an unaccepted needs_you report. */
  id?: string;
  kind: import("../audit/contracts.js").PersonItemKind | null;
  words: string | null;
  problem: string; action: string;
  waitsOn?: string; criterion?: string;
  waiver?: WaiverRef;
  effect: "stops" | "holds" | "goes_on";
}
const optionalField = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
