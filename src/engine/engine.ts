import { preparationPermissions } from "./preparation-permissions.js";
import { readContinuationProposal } from "./continuation-readiness.js";
import { preparationPrompt, preparationImplementationPrompt } from "../session/prompts.js";
import { newPreparationState, preparationAttemptNeedsReconciliation, preparationDigest, preparesPhase, type PreparationReference } from "./preparation-state.js";
import { verifyPreparation, preparationCheckpoint, reconcilePreparationAttempt } from "./preparation-verifier.js";
import { bindExecutionAliases, bindLegacySessions, cacheSnapshot, inspectionSnapshot } from "../control/projection.js";
import { newAcceptance, prepareWorkspaces, validatePreparedWorkspace } from "./continuation-setup.js";
import { authorityForApproval, changesContinuationScope, readPendingAuthority, writePendingAuthority, pendingForProposal, reserveAuthority, type ContinuationInputObservation } from "./continuation-authority.js";
import { acceptanceSummary, executionDeliveries, readAcceptance, writeAcceptance, readExecution, type ContinuationAcceptance } from "./continuation-state.js";
import { DiscoveryWriteFailure, discoverCompletedPlan, type CompletedPlanCheck } from "./completed-plan-discovery.js";
import { captureOwnedProcesses } from "../live/owned-processes.js";
import { execFileSync } from "node:child_process";
import { createGate, gateDirectory, readGate, withGate, unsettled, observeGate } from "../live/gate.js";
import { sameLiveTarget, validLiveTarget, consumedUuids, messageProblem, type LiveTarget, type LiveView } from "../live/target.js";
import { OwnershipError, requireExited, requireHistory, requireNoTerminal } from "../live/ownership.js";
import { writeDurableMetadata } from "../control/durable-file.js";
import { runHelper } from "../platform/helper-process.js";
import { runGit } from "./git-reads.js";
import { deliveredInHistory } from "../control/delivery-evidence.js";
import { resolve } from "node:path";
import { CommandJournal, ACTIONS, lookupReceipt, readReceipts, type Receipt, type Action, type JournalAction, type ControlView } from "../control/commands.js";
import { CompletionCheckUnavailable, RecoveryStateWriteFailed, sameRecoveryTarget, validRecoveryTarget, type PhaseRecoveryTarget, type PhaseRecoveryView, type PhaseRecoveryOutcome, type PhaseRecoveryCode } from "./phase-recovery.js";
import { BillingAuthority, BillingError, newBillingState } from "../billing/authority.js";
import { classify, readInventory, type BillingSummary } from "../billing/inspection.js";
import { activityHistory, observeActivity, auditKey, auditLabel, auditNext, acceptedAudit, resolveAuditSkill } from "../audit/workflow.js";
import { AuditStore } from "../audit/storage.js";
import { captureSnapshot } from "../audit/snapshots.js";
import { auditSessionPrompt } from "../session/prompts.js";
import { assignAuditObligations } from "./development-owners.js";
import type { AuditActivity, AuditKind } from "../audit/contracts.js";
import { orderedRecoveryOwners } from "./development-owners.js";
import { ownerDocuments, ownerDeliveryCheck } from "./development-delivery.js";
import { deliveryOwner, ownerKey, ownerFields, recoveryOwners, recoveryStopKey, type DeliveryOwner } from "../state/development-delivery.js";
import { auditStatus, issueSnapshot, submitAudit, auditCurrentness, repositoryChecks, latestAuditRefusal, type AdmissionContext } from "../audit/admission.js";
import { AuditRefusal } from "../audit/contracts.js";
import { normalizeMergeTarget, authorizationTargetKey, type MergeTarget } from "../state/development-delivery.js";
import { fileURLToPath } from "node:url";
import { DeliveryRefusal, deliveryEnabled, ledger, validateStartTargets, recordAssessment, prepareOperation, submitEvidence, reconcileDelivery, phaseDeliveryCheck, evaluateRepositories, type DeliveryContext } from "./development-delivery.js";
import { emptyDevelopmentLedger, restrictedAuthorization, developmentDeliverySummary, assertDevelopmentState, type CommandEvidence } from "../state/development-delivery.js";
import { readTranscript } from "../session/transcripts.js";
import { readDeliveryHistory } from "./delivery-history.js";
import { appendJsonLine, readJson, readJsonLines } from "../state/state-files.js";
import { runCodexSession, reconcileCodexAttempt } from "../session/codex-session.js";
import { CodexHistoryRpc } from "../session/codex-history-rpc.js";
import { recoverCodexOutput } from "../session/codex-recovery-output.js";
import { prepareCodexLaunch } from "../session/codex-launch-profile.js";
import { CodexOutputReader, CODEX_CHILD_OUTPUT_NOTICE } from "../session/codex-output.js";
import { CODEX_NATIVE_CLEANUP_WARNING } from "../session/codex-background-terminals.js";
import { sleepInterruption } from "../session/run-verdict.js";
import { ensurePrivateDirectory } from "../state/state-files.js";
import { AgentInfo } from "../agents/metadata.js";
import { latestSol } from "../agents/codex-metadata.js";
import { AGENT_NAMES, assertAgent } from "../state/records.js";
import { selectedChoice } from "../state/records.js";
// The engine: works out where a feature stands, picks the next phase, runs its session, runs
// the done check, and owns Kiln's record (technical design, "Workload Type and Starting Point",
// "Where a Feature Stands", engine loop). The server and view reach it only through its
// commands (start, pause, cancel a pause, check again, resume, change settings) and its snapshots. State
// is kept per phase and per session; the next phase is chosen in one function, `nextLeaf`.

import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, sep } from "node:path";
import type { AccountView } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import { autoModeError, type ModelEntry } from "../account/model-list.js";
import { isAncestorOf } from "../plan/phase-ids.js";
import { leavesOf, namedRepositories, type PhasePlan, type PlannedPhase } from "../plan/phase-plan.js";
import { endProcessTree } from "../platform/helper-process.js";
import type { KeepAwakeHolder } from "../platform/keep-awake.js";
import { isProcessLive } from "../platform/process-start-time.js";
import { platformSleepReader, type SleepReader } from "../platform/sleep-readings.js";
import {
  sessionFiles,
  launchArguments,
  modelNameFromId,
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
  resumePrompt,
  type PhasePromptValues,
  type AuditRecoveryTask,
  type PromptRepository,
} from "../session/prompts.js";
import { isModelResponse } from "../session/run-verdict.js";
import type { OutputLine, PartialText, SessionOutputReader } from "../session/session-output.js";
import { automaticResumeSchedule, judgeReading, limitRow, limitSentence, readingAccount, sameAccount, UNKNOWN_LIMIT_LABEL } from "../session/usage-limit.js";
import { CodexLaunchCancelled, CodexUsageRecoveryUnavailable, codexUsageRelease } from "../session/codex-usage.js";
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
  type Settings,
  type PhaseStop,
  type StopKind,
  type StopLimit,
} from "../state/records.js";
import { CHECK_NAMES, planCheck, runDoneCheck, runPullRequestChecks, type CheckedRepository, type DoneCheckOutcome } from "./checks.js";
import { auditCodexConversation } from "../session/codex-evidence.js";
import { claudeConfigFolder, findTranscripts, claudeHistoryAvailability, readTranscriptRecords } from "../session/transcripts.js";
import { firstParentCommits, firstParentCount, listWorktrees, localBranchCommit, originBranches, type GitContext } from "./git-reads.js";
import { observeGitPlan } from "./completed-plan-sources.js";
import { PLAN_NORMALIZER_VERSION, PlanBaselineWriteFailure, PlanCapacityError, phaseRepositories, completedPhaseScopeUnchanged, comparisonBaseline, PLAN_LIMIT, addedLeaves, completedScopeProblems, observePlan, readBaseline, retainBaseline, type PlanBaseline } from "./plan-reconciliation.js";
import { judgedPhase, nextLeaf, readPlanAt, recordedLeaves, recordedPlan, type PlanRead } from "./plan-reading.js";
import { findRepository, repositoriesParent, type FoundRepository } from "./repositories.js";
import {
  addEntryWorktree,
  baseBranchChoices,
  baseFor,
  checkFields,
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
  undoEntry,
  worktreePathFor,
  type FieldErrors,
  type OriginRead,
  type PlannedRepository,
  type RepositoryPaths,
} from "./worktree-setup.js";

export interface EngineTools {
  git: string;
  gh: string;
  claude: string;
  codex?: string;
}

/** What the terminal prints while Kiln works (AC-START-09): one line per event. */
export type TerminalEvent =
  | { kind: "completed_plan_checked"; check: CompletedPlanCheck }
  | { kind: "plan_updated"; at: Date; addedPhaseIds: string[]; remainingCount: number; source: string }
  | { kind: "audit"; at: Date; activityId: string; label: string; round: number; continuationIndex?: number; event: "started" | "stopped" | "done" | "interrupted" | "resumed" | "waiting"; limit?: { label: string; resetsAt?: string } }
  | { kind: "prd_started"; at: Date; branch: string; baseBranch: string; repositoryCount: number }
  | {
      kind: "phase";
      at: Date;
      phaseId: string;
      title: string;
      event: "started" | "stopped" | "done" | "interrupted" | "resumed" | "waiting";
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
      event: "started" | "stopped" | "opened" | "completed" | "interrupted" | "resumed" | "waiting";
      summary?: string;
      number?: number;
      limit?: { label: string; resetsAt?: string };
      /** A multi-repository PRD's pull requests, in list order. */
      opened?: { repository: string; number: number }[];
    }
  | { kind: "delivery"; at: Date; repository: string; environment: string; stage: string; outcome: string }
  | { kind: "message"; text: string };

class TakeoverAlreadyComplete extends Error {}

export type CommandResult =
  | { ok: true; noteSkipped?: true; outcome?: PhaseRecoveryOutcome; target?: PhaseRecoveryTarget }
  | { ok: false; status: 400 | 409 | 422 | 500 | 503; reason: string; code?: PhaseRecoveryCode; fieldErrors?: FieldErrors; baseErrors?: Record<string, string> };

/** What `kiln add-repository` gets back (multi-repo AC-ADD-01). */
export type AddRepositoryResult =
  | { ok: true; name: string; worktreePath: string; branch: string; baseBranch: string; added: boolean }
  | { ok: false; status: 409 | 422; reason: string };

export interface EngineOptions {
  paths: RepositoryPaths & { featureName: string };
  tools: EngineTools;
  env: NodeJS.ProcessEnv;
  stateDirectory: string;
  record: PrdRecord;
  /** The PRD directory's tree as this `kiln run` read it, for the base check before Start. */
  prdTree?: string;
  onTerminal?: (event: TerminalEvent) => void;
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
  /** The plan the start checks read in the checkout, recorded when Start is pressed (not started only). */
  startPlan?: PhasePlan;
  /** The named repositories the start checks found beside the PRD's repository (not started only). */
  namedRepositories?: FoundRepository[];
  /**
   * Put first on each session's PATH, so `kiln add-repository` reaches this Kiln: the directory
   * of the `kiln` the person ran, on macOS and Linux (multi-repo technical design, "The command").
   */
  kilnBinDirectory?: string;
}

/** What a stop leaves to print (UI-010 item 3): the first sentence, then the grey rest. */
export interface StopReport {
  text: string;
  grey?: string;
}

const STOP_WAIT_MS = 30_000;
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
  commits: { sha: string; subject: string }[];
}

/** What `kiln run` decided for a feature underway: the ● line's subject (UI-010 item 5). */
export type UnderwayDecision =
  | { kind: "start_audit"; phaseKey: string; label: string; round: number; doneFirst?: DoneFirst }
  | { kind: "start_phase"; phaseId: string; doneFirst?: DoneFirst }
  | { kind: "start_pull_request"; doneFirst?: DoneFirst }
  | { kind: "needs_you"; phaseKey: string; again: boolean; doneFirst?: DoneFirst }
  | { kind: "plan_stop"; phaseKey: string; doneFirst?: DoneFirst }
  | { kind: "paused"; beforePhaseKey: string; doneFirst?: DoneFirst }
  | { kind: "complete"; doneFirst?: DoneFirst }
  | { kind: "resume"; phaseKey: string; sessionId: string }
  | { kind: "waiting"; phaseKey: string; limit: { label: string; resetsAt?: string }; doneFirst?: DoneFirst }
  | { kind: "setup_failed"; error: string };

type Verdict = { kind: "done"; judgedId: string } | { kind: "complete" } | { kind: "stopped" } | { kind: "waiting" } | { kind: "stopping" };

/** A resume Kiln does on someone's word: the person's Resume or Resume now, or the end of a wait. */
type ResumeRequest = { phaseKey: string; cause: "person_resume" | "limit_resume"; note?: string };

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
  /** The last successful read of the plan in this run. */
  plan: PhasePlan | undefined;
  /** Set once a stop begins (Ctrl+C, a closed terminal, a signal); from then on nothing is judged. */
  stopping: InterruptCause | undefined;

  private readonly options: EngineOptions;
  private readonly now: () => Date;
  private readonly git: GitContext;
  private driving: Promise<void> | undefined;
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
  private recoveredLive = false;
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
    this.agents = new AgentInfo({ agentId: this.record.settings.agentId, generation: this.record.settings.selectionGeneration ?? 0, ...(options.claude ? { claude: options.claude } : {}), executable: options.tools, cwd: options.paths.mainCheckoutPath, claudeCwd: options.stateDirectory, env: options.env });
    this.offClaude = this.agents.onChange(() => this.modelsChanged());
    this.record.executionId ??= randomUUID();
    this.record.billing ??= newBillingState(this.record.executionId);
    this.billing = new BillingAuthority({
      state: () => this.record.billing!, generation: () => this.record.settings.selectionGeneration ?? 0,
      save: () => this.save(), changed: () => this.changed(), busy: () => this.billingBusy(),
      cancelled: () => this.abort.signal.aborted || this.closed, readiness: () => this.billingResumesConversation ? this.agents.state.blockers.length === 0 : !this.selectionError,
      completed: () => this.currentlyComplete, now: () => this.now().toISOString(),
      inspect: async (cwd, env, args) => {
        const read = await readInventory({ executable: this.options.tools.claude, cwd, env, args, signal: this.abort.signal });
        this.abort.signal.throwIfAborted();
        const auth = await this.agents.refreshClaudeForLaunch(cwd, read.projected, this.abort.signal);
        const result = classify({ cwd, env, read, auth, at: this.now().toISOString() });
        const overflow = this.claude?.account?.extraUsage;
        if (result.summary.route === "subscription" && overflow && Date.parse(result.summary.observedAt) - Date.parse(overflow.observedAt) <= 5 * 60_000 && (overflow.email || overflow.orgId) && overflow.email === result.summary.email && overflow.orgId === result.summary.orgId) result.summary.overflow = { enabled: overflow.enabled, observedAt: overflow.observedAt };
        return result;
      },
    });
    this.commands = new CommandJournal(this.stateDirectory, resolve(this.record.repository.mainCheckoutPath, this.record.prdDirectory), {
      journalScope: () => this.record.continuation ? { execution: this.record.executionId!, commandIds: this.record.continuation.acceptances.filter(row => row.id === this.record.continuation!.currentAcceptanceId).map(row => row.commandId) } : undefined,
      internalControl: instruction => this.continuationControl(instruction),
      execution: () => this.record.executionId!, view: () => this.controlView(), runState: () => this.controlRunState(),
      staleReason: instruction => {
        const target = instruction.inputs.target;
        if (instruction.action !== "take-over" || !validLiveTarget(target) || target.executionId !== this.record.executionId || !this.record.phases[target.activityKey]?.doneAt) return undefined;
        const activity = activityHistory(this.record, this.stateDirectory).find(a => a.key === target.activityKey && a.activityId === target.activityId);
        const session = this.sessionRecord(target.activityKey, target.sessionId);
        if (activity && session?.executionId === target.executionId && session.sessionId === target.providerSessionId && session.runs.some((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session, i)) === target.attemptId)) return "The targeted activity finished before takeover was accepted. Its successor was not paused.";
        return undefined;
      },
      apply: (action, inputs, receipt) => this.applyControl(action, inputs, receipt),
      reconcile: receipt => this.reconcileControl(receipt), changed: () => { this.changed(); if (this.controlKickPending && !this.commands.busy) { this.controlKickPending = false; this.kick(); } },
    });
    this.recoverLiveMessages();
    this.record.controlEpoch = this.controlEpoch;
    this.save();
    if (this.record.liveControl) this.watchTakeover();
    this.agents.start();
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
    const target = JSON.stringify(this.phaseRecoveryTarget() ?? { live: this.liveTarget(), execution: this.record.executionId, key: key ?? wait ?? this.current?.phaseKey ?? this.record.nextActivityKey, stop: key ? this.record.phases[key]?.stop?.at : wait ? this.record.phases[wait]?.wait : null });
    const busy = !!(this.checking || this.driving || this.settingUp || this.deliveryBusy || this.stopping || this.commands?.busy);
    const paused = !!this.record.pause.activeSince || !!this.restartReview;
    const releasePending = !!this.current || this.record.liveControl?.takeover.state === "pending";
    const available: Record<Action, boolean> = {
      message: !!this.liveView()?.input?.available && !this.commands?.busy,
      "message-review": !!this.record.liveControl && !this.commands?.busy,
      "take-over": !!this.liveView()?.available && !this.commands?.busy,
      reply: !!key && this.resumeOffered(key) && !busy,
      resume: !this.restartReview && !!(wait || key && this.resumeOffered(key)) && !busy,
      "verify-and-advance": !!this.phaseRecoveryTarget() && !busy && !releasePending,
      "request-pause": this.isUnderway && !this.currentlyComplete && !key && !wait && !paused && !this.record.pause.requestedAt && this.current?.phaseKey !== PR_PHASE_KEY && !this.commands?.busy,
      "cancel-pause": !!this.record.pause.requestedAt && !paused && !wait && !this.commands?.busy,
      continue: paused && !busy,
      "check-again": !!key && !this.phaseRecoveryTarget() && !busy,
      settings: !this.settingUp && !this.completedPlanReading && !this.commands?.busy && !this.billing.busy && !(this.checking && this.phaseRecoveryTarget()),
      "outside-confirmation": false,
    };
    const unavailable: Partial<Record<Action, string>> = {
      "take-over": this.liveView()?.reason ?? "Live takeover requires an active supported Claude phase or audit.",
      message: this.liveView()?.input?.reason ?? "No active supported Claude input is available.",
      "request-pause": !this.isUnderway || this.currentlyComplete ? "Nothing is running to pause after." : "A pause is already requested or this activity cannot pause.",
      "cancel-pause": "No pause is requested.", resume: "Resume isn't offered here.", reply: "Resume isn't offered here.",
      "outside-confirmation": "Workspace confirmations have been retired; recheck the remaining completion requirements.",
      "verify-and-advance": releasePending ? this.record.liveControl?.takeover.reason ?? "Wait for the current attempt and tracked work to be released." : "No stopped activity is available to verify.",
    };
    const controls = ACTIONS.filter(name => name !== "outside-confirmation").map(name => ({ name, available: available[name], reason: available[name] ? null : busy ? "Kiln is checking, dispatching or reconciling an instruction." : unavailable[name] ?? "The current browser recovery rules do not offer this control." }));
    const live = this.liveView();
    const fingerprint = { continuation: this.record.continuation, proposal: this.record.completedPlanCheck?.result?.proposal?.id, live: live && { target: live.target, takeover: live.takeover && { kind: live.takeover.kind, state: live.takeover.state }, review: live.reviewRequired, messages: live.messages?.map(m => ({ id: m.id, delivery: m.delivery, reviewedAt: m.reviewedAt })) }, epoch: this.controlEpoch, execution: this.record.executionId, revision: this.record.controlRevision ?? 0, target, controls, pause: this.record.pause, settings: this.record.settings, current: this.current && { key: this.current.phaseKey, session: this.current.session?.sessionId, attempt: this.current.session?.runs.length, running: this.current.processRunning }, authority: this.record.developmentAuthorization, billingHold: this.record.billing?.hold, billingApproval: this.record.billing?.approval,
      unsent: this.commands?.unsent(target).map(r => r.id) ?? [] };
    return { token: `${this.record.executionId!}:${createHash("sha256").update(JSON.stringify(fingerprint)).digest("base64url")}`, target, controls };
  }

  private reconcileControl(receipt: Receipt): Receipt | undefined {
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
    if (receipt.instruction.action === "take-over" && validLiveTarget(receipt.instruction.inputs.target)) {
      const target = receipt.instruction.inputs.target;
      const session = this.sessionRecord(target.activityKey, target.sessionId);
      const run = session?.runs.find((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session!, i)) === target.attemptId);
      const held = run?.live ? readGate(run.live.gateDirectory).held : undefined;
      const saved = this.record.liveControl?.takeover;
      if (held?.operationId === receipt.id || saved?.operationId === receipt.id || receipt.effects.takeover === "requested") {
        if (!saved) this.record.liveControl = { version: 1, revision: 1, takeover: { target, operationId: receipt.id, instructionId: receipt.command_id, requestedAt: held?.requestedAt ?? receipt.accepted_at, state: "pending", observedAt: this.now().toISOString(), reason: "Reconciling recovered attempt before terminal use." } };
        return { ...receipt, state: "completed", stage: "settled", outcome: "takeover_requested", effects: { ...receipt.effects, takeover: "requested" } };
      }
    }
    const persisted = readJson<PrdRecord>(join(this.stateDirectory, "prd.json"));
    if (!persisted || receipt.execution_id !== persisted.executionId) return undefined;
    if (Object.values(persisted.phases).some(f => f.completedByOperation === receipt.id)) return { ...receipt, state: "completed", stage: "settled", outcome: "advanced", effects: { ...receipt.effects, plan: "advanced" } };
    if (persisted.controlApplied?.operationId === receipt.id) {
      const outcome = persisted.controlApplied.outcome;
      return { ...receipt, ...(persisted.controlApplied.settings ? { settings: persisted.controlApplied.settings } : {}), state: "completed", stage: "settled", outcome, effects: { ...receipt.effects, ...(outcome === "advanced" ? { plan: "advanced" as const } : {}), ...(outcome === "session_resumed" ? { session: "resumed" as const } : {}) } };
    }
    // Check again never directly dispatches a session. A verification interrupted
    // before settlement can fail honestly without retaining control forever.
    // Proven completion above wins; unknown plan effects are retained, not undone.
    if (receipt.instruction.action === "check-again" && receipt.stage === "applying" && receipt.effects.session === "not_started" && receipt.effects.reply === "not_applicable") {
      return { ...receipt, state: "failed", stage: "settled", outcome: "check_interrupted", reason: "The completion check was interrupted before its result was settled. Request a fresh check against the current work." };
    }
    if (receipt.phase_key && receipt.session_id) {
      const session = this.sessionRecord(receipt.phase_key, receipt.session_id);
      const run = session?.runs.find(r => r.control?.operationId === receipt.id);
      if (run && (run.spawnError && !run.pid || session?.agentId === "codex" && codexNotDispatched(run))) return { ...receipt, state: "failed", stage: "settled", outcome: "dispatch_not_started", effects: { ...receipt.effects, session: "not_started", reply: receipt.reply_text === null ? "not_applicable" : "not_sent" } };
      if (session && run && (run.control?.delivered || run.control?.submitted && receipt.reply_text === null && (session.agentId === "codex" ? run.codex?.turnId : runReportedInit(this.stateDirectory, session, session.runs.indexOf(run))))) return { ...receipt, state: "completed", stage: "settled", outcome: "session_resumed", effects: { ...receipt.effects, session: "resumed", reply: receipt.reply_text === null ? "not_applicable" : "delivered" } };
    }
    // Dispatch is saved as dispatching before spawn; completion is stamped in
    // its atomic record write. After ruling out both above, applying proves
    // only saved reviews, which survive without replaying this hand-back.
    if (["resume", "verify-and-advance", "reply"].includes(receipt.instruction.action) && receipt.stage === "applying" && Array.isArray(receipt.instruction.inputs.reviewed_receipt_ids) && receipt.instruction.inputs.reviewed_receipt_ids.length && receipt.effects.session === "not_started" && receipt.effects.plan !== "advanced") {
      return { ...receipt, state: "failed", stage: "settled", outcome: "hand_back_not_started", reason: "Saved message acknowledgements are retained. No dispatch or completion was recorded; submit a new explicit hand-back after reviewing any remaining messages.", effects: { ...receipt.effects, session: "not_started", plan: "not_advanced" } };
    }
    return undefined;
  }

  private async applyControl(action: JournalAction, inputs: Record<string, unknown>, receipt: Receipt) {
    if (action === "continuation-grant") return this.grantContinuationTarget(inputs, receipt);
    if (action === "continuation-accept") return this.acceptContinuation(inputs, receipt);
    if (action === "continuation-retry") return this.retryContinuation(inputs);
    let answer: CommandResult;
    const target = this.phaseRecoveryTarget();
    const priorKey = this.stoppedPhaseKey() ?? this.waitingPhaseKey();
    const priorDone = priorKey ? this.record.phases[priorKey]?.doneAt : undefined;
    if (["reply", "resume", "verify-and-advance"].includes(action) && Array.isArray(inputs.reviewed_receipt_ids) && inputs.reviewed_receipt_ids.length) { const review = this.reviewMessages(inputs.live_target, inputs.reviewed_receipt_ids); if (!review.ok) return review; }
    switch (action) {
      case "message": return this.acceptLiveMessage(inputs.target, inputs.text, receipt);
      case "message-review": return this.reviewMessages(inputs.target, inputs.receipt_ids);
      case "take-over": return this.acceptTakeover(inputs.target, receipt);
      case "request-pause": answer = this.pause(); break;
      case "cancel-pause": answer = this.cancelPause(); break;
      case "settings": answer = await this.changeSettings({ ...(typeof inputs.keep_awake === "boolean" ? { keepAwake: inputs.keep_awake } : {}), ...(typeof inputs.resume_after_usage_limit === "boolean" ? { resumeAfterUsageLimit: inputs.resume_after_usage_limit } : {}) }); break;
      case "outside-confirmation": answer = refuse("Workspace confirmations have been retired; recheck the remaining completion requirements."); break;
      case "continue": answer = await this.start(); break;
      case "check-again": answer = await this.checkAgain(); break;
      case "verify-and-advance": answer = await this.checkAgain({ target, intent: "advance" }); break;
      case "reply": case "resume":
        this.controlDispatch = receipt;
        answer = receipt.source === "automatic" ? (await this.resumeWait(this.waitingPhaseKey()!, "limit_resume"), { ok: true }) : await this.resume({ ...(target ? { target } : {}), ...(action === "reply" ? { note: inputs.message } : {}) });
        if (answer.ok && priorKey && !priorDone && this.record.phases[priorKey]?.doneAt) { this.controlDispatch = undefined; receipt.effects.plan = "advanced"; return { ok: true, outcome: "advanced" }; }
        if (answer.ok && answer.noteSkipped) { this.controlDispatch = undefined; receipt.effects.plan = "advanced"; return { ok: true, outcome: "advanced_reply_not_sent" }; }
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
    const outcome = answer.outcome === "already_complete" ? "phase_already_complete" : answer.outcome === "still_stopped" ? "completion_checks_failed" : answer.outcome === "advanced" ? "advanced" : action === "reply" || action === "resume" ? "session_resumed" : "completed";
    if (action === "settings") receipt.settings = this.runtimeControlSettings();
    this.record.controlApplied = { operationId: receipt.id, outcome, ...(receipt.settings ? { settings: receipt.settings } : {}) }; this.save();
    return { ok: true, outcome };
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

  private endLiveMessages(target: LiveTarget): void {
    for (const r of this.messageReceipts(target)) if (r.message!.writeStartedAt && !r.message!.resultAt) {
      this.holdMessage(r); this.commands.checkpoint(r);
    }
    if (this.record.liveControl) this.watchTakeover();
  }

  private async acceptLiveMessage(raw: unknown, text: unknown, receipt: Receipt) {
    const fail = (code: string, reason: string) => { receipt.message!.delivery = "not_sent"; receipt.effects.message = "not_sent"; return { ok: false, code, reason }; };
    if (!validLiveTarget(raw) || !sameLiveTarget(raw, this.liveTarget())) return fail("stale_target", "This attempt ended or changed; the message was not sent.");
    if (messageProblem(text)) return fail("invalid_request", messageProblem(text)!);
    const run = this.latestSession(raw.activityKey)?.runs.at(-1);
    if (!run?.live?.literalInput || !this.control?.sendMessage || !this.control.inputOpen?.() || !!this.record.liveControl || !this.current?.processRunning) return fail("input_unavailable", "This attempt no longer accepts live input. Your text was not sent.");
    const control = this.control;
    let admitted = false;
    let writing: Promise<"written" | "uncertain"> | undefined;
    try { await withGate(run.live.gateDirectory, gate => {
      if (gate.sealed || gate.held || this.record.liveControl || !sameLiveTarget(raw, this.liveTarget()) || !control.inputOpen?.()) return;
      const inputs = gate.inputs ??= {};
      if (Object.values(inputs).filter(i => !i.terminal).length >= 32) return;
      receipt.live_target = raw;
      receipt.message!.writeStartedAt = this.now().toISOString();
      receipt.effects.message = "unknown";
      this.commands.checkpoint(receipt); // fsync before any bytes can be supplied to stdin.
      inputs[receipt.message!.uuid] = { terminal: false };
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
    if (!current?.processRunning || !session || session.agentId !== "claude_code" || session.kind === "pull_request") return undefined;
    const activity = activityHistory(this.record, this.stateDirectory).findLast(a => a.key === current.phaseKey);
    if (!activity || session.executionId !== this.record.executionId) return undefined;
    const run = session.runs.at(-1); if (!run || run.endedAt) return undefined;
    return { executionId: this.record.executionId!, activityId: activity.activityId, activityKey: current.phaseKey, sessionId: session.sessionId, providerSessionId: session.sessionId, attemptId: run.control?.attemptId ?? this.legacyAttempt(session, session.runs.length - 1) };
  }

  liveView(): LiveView | undefined {
    const target = this.liveTarget(); if (!target) return undefined;
    const audit = this.auditActivity(target.activityKey);
    const label = audit ? `${auditLabel(audit.kind)} · Round ${audit.round}` : `Phase ${target.activityKey}`;
    const hold = this.record.liveControl?.takeover;
    const run = this.latestSession(target.activityKey)?.runs.at(-1);
    const capable = process.platform === "darwin" && (!!run?.live || this.recoveredLive);
    const messages = this.messageReceipts(target);
    let sealed = true;
    try { sealed = !run?.live || !!readGate(run.live.gateDirectory).sealed; } catch { /* unknown input is unavailable */ }
    const pending = messages.filter(r => r.message?.writeStartedAt && !r.message.resultAt).length;
    const uncertain = messages.some(r => r.message?.delivery === "uncertain");
    const submitting = messages.some(r => r.message?.delivery === "submitting");
    const inputAvailable = !submitting && !!run?.live?.literalInput && !!this.control?.inputOpen?.() && !hold && !sealed && pending < 32;
    const inputReason = this.recoveredLive ? "Input connection lost. Your unsent draft is retained; use safe takeover to recover." : hold ? uncertain ? "Delivery uncertain. Review the message in the conversation before handing back." : "Pausing or paused for terminal takeover." : pending >= 32 ? `Busy: ${pending} accepted messages await terminal results (limit 32).` : !run?.live?.literalInput ? "Live messages require the validated Claude Code 2.1.311/macOS profile." : !inputAvailable ? "This attempt is starting, submitting, or no longer accepting input." : "Claude reads this at its next opportunity. The current tool may finish first.";
    return { target, label, observedAt: this.now().toISOString(), input: { available: inputAvailable, reason: inputReason, pending }, messages: messages.slice(-50).map(r => ({ id: r.id, instructionId: r.command_id, acceptedAt: r.accepted_at, delivery: r.message!.delivery, ...(r.message!.reviewedAt ? { reviewedAt: r.message!.reviewedAt } : {}) })), reviewRequired: messages.filter(r => r.message?.delivery === "uncertain" && !r.message.reviewedAt).map(r => r.id), available: !submitting && capable && (!hold || hold.kind === "delivery_recovery") && !!this.current?.processRunning, reason: hold?.reason ?? (!capable ? "Safe checkpoint takeover is unavailable for this Claude CLI/profile. Existing end-of-activity pause remains available." : this.recoveredLive ? "Input connection lost. Takeover waits for safe release; no forced interruption." : "Finish the current operation, then stop before starting more work."), ...(hold ? { takeover: hold } : {}) };
  }

  private async acceptTakeover(raw: unknown, receipt: Receipt) {
    if (!validLiveTarget(raw) || !sameLiveTarget(raw, this.liveTarget()) || this.record.liveControl?.takeover.kind !== "delivery_recovery" && !!this.record.liveControl || !this.current?.processRunning || !this.liveView()?.available) return { ok: false, code: "stale_target", reason: "This attempt ended or changed. Refresh the active session." };
    const session = this.latestSession(raw.activityKey)!; const run = session.runs.at(-1)!;
    const held = { operationId: receipt.id, instructionId: receipt.command_id, requestedAt: this.now().toISOString() };
    const persist = () => {
      receipt.live_target = raw; receipt.effects.takeover = "requested"; this.commands.checkpoint(receipt);
      this.record.liveControl = { version: 1, revision: 1, takeover: { ...held, target: raw, state: "pending", observedAt: this.now().toISOString(), reason: "Pausing for takeover — finishing the current operation. Wait before opening Claude." } };
      this.save();
    };
    if (run.live) await withGate(run.live.gateDirectory, state => {
      if (!sameLiveTarget(state.target, raw) || !sameLiveTarget(raw, this.liveTarget()) || !this.current?.processRunning) throw new Error("Attempt ended before takeover admission.");
      state.held = held;
      writeDurableMetadata(join(run.live!.gateDirectory, "gate.json"), state);
      persist();
    });
    else persist(); // Legacy attempts wait naturally; never signal or invent a checkpoint.
    this.unwatchWait(); this.watchTakeover(); this.changed();
    return { ok: true, outcome: "takeover_requested" };
  }

  private async observeRecoveredLive(): Promise<void> {
    if (!this.recoveredLive || !this.current?.session) return;
    const session = this.current.session; const key = this.current.phaseKey;
    const run = session.runs.at(-1)!;
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
    let releaseEvidence: { directory: string; state: string } | undefined;
    try {
      const session = this.sessionRecord(hold.target.activityKey, hold.target.sessionId);
      const run = session?.runs.find((r, i) => (r.control?.attemptId ?? this.legacyAttempt(session!, i)) === hold.target.attemptId);
      if (!session || !run) throw new OwnershipError("ownership_unknown", "Saved takeover attempt is unavailable.");
      const latestActivityAt = run.live ? readGate(run.live.gateDirectory).observedAt : runLastOutputAt(this.stateDirectory, session, session.runs.indexOf(run));
      if (latestActivityAt) hold.latestActivityAt = latestActivityAt;
      await requireExited(run);
      // OS exit precedes adapter finalization, which awaits the last descendant
      // scan and saved-event callbacks. No readiness may race those writers.
      const running = this.current?.session; const attempt = running?.runs.at(-1);
      if (this.current?.processRunning && running?.sessionId === hold.target.sessionId && attempt && (attempt.control?.attemptId ?? this.legacyAttempt(running, running.runs.length - 1)) === hold.target.attemptId) throw new OwnershipError("takeover_pending", "Waiting for final attempt and tracked-process observations to finish.");
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
      hold.state = "released"; hold.reason = hold.kind === "delivery_recovery" ? "Conversation released. Review uncertain messages before explicit Resume or Verify." : "Paused for terminal takeover.";
    } catch (error) { hold.state = "pending"; hold.reason = (error as Error).message; }
    finally {
      hold.observedAt = this.now().toISOString();
      if (!this.current?.processRunning) {
        const facts = this.record.phases[hold.target.activityKey]!;
        facts.stop ??= { kind: "done_check", at: hold.requestedAt, checkedAt: hold.observedAt, checks: [] };
      }
      this.save(); this.changed();
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
    this.updateStop(key, outcome.checks);
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

  private async requireTakeoverReturn(): Promise<void> {
    const hold = this.record.liveControl?.takeover;
    if (!hold) return;
    if (this.messageReceipts(hold.target).some(r => r.message?.delivery === "uncertain" && !r.message.reviewedAt)) throw new OwnershipError("message_review_required", "Review each uncertain message in the conversation before Resume or Verify.");
    await this.reconcileTakeover();
    if (hold.state !== "released") throw new OwnershipError("takeover_pending", hold.reason);
    await requireNoTerminal(this.environment, hold.target.providerSessionId);
    requireHistory(this.environment, hold.target.providerSessionId);
  }


  readonly agents: AgentInfo;
  readonly billing: BillingAuthority;
  private billingLaunch: BillingSummary | undefined;
  get billingCwd(): string { return this.isUnderway ? this.sessionFolder : this.paths.mainCheckoutPath; }
  private get billingResumesConversation(): boolean {
    const key = this.stoppedPhaseKey();
    return this.record.billing?.hold?.action === "resume" || this.waitingPhaseKey() !== undefined || key !== undefined && this.resumeOffered(key);
  }
  private billingBusy(): boolean { return !!(this.settingUp || this.checking || this.driving || this.current?.processRunning || this.deliveryBusy || this.stopping); }
  refreshBilling(): Promise<unknown> {
    if (this.record.settings.agentId !== "claude_code" || this.currentlyComplete) return Promise.resolve();
    return this.billing.refresh(this.billingCwd, this.sessionEnv());
  }
  async billingCommand(action: "approval" | "clear", body: Record<string, unknown>) {
    if (this.record.settings.agentId !== "claude_code") throw new BillingError("invalid_request", "Codex has no API billing approval.", 400);
    try { return await this.billing.command(action, body, this.billingCwd, this.sessionEnv()); }
    finally { this.changed(); }
  }

  choiceNotice: string | undefined;

  get claude(): ClaudeInfoSource | undefined {
    return this.agents.claude;
  }

  /** The model list's entry for a model, when the list has loaded and offers it. */
  modelEntry(value: string): ModelEntry | undefined {
    return this.agents.state.models?.find((entry) => entry.value === value);
  }

  /** Every field message now: the last field check's, and Model's when its model can't run in auto mode. */
  get currentFieldErrors(): FieldErrors {
    const errors = { ...this.fieldErrors };
    const issue = this.selectionError;
    if (issue) errors.model = issue;
    return errors;
  }

  get agentFixed(): boolean { return this.record.startedAt !== undefined || this.settingUp || this.record.repositories.some((entry) => entry.setupCompletedAt !== undefined || entry.createdBranch !== undefined); }
  get selectionError(): string | undefined { return this.selectionIssue(); }
  private selectionIssue(ignorePending = false): string | undefined {
    const metadata = this.agents.state;
    if (metadata.pending && !ignorePending) return `Reading ${AGENT_NAMES[metadata.agentId]} models and readiness…`;
    if (metadata.blockers.length) return metadata.blockers.join(" ");
    if (!metadata.models) return metadata.modelListError ?? "Model catalogue unavailable. Refresh before starting a new session.";
    const choice = selectedChoice(this.record.settings);
    const entry = this.modelEntry(choice.model);
    if (!entry) return `Choose an available ${AGENT_NAMES[metadata.agentId]} model. Saved choice: ${choice.model || "none"}.`;
    if (entry.supportsEffort && (!choice.effort || !entry.supportedEffortLevels.includes(choice.effort))) return `Choose a supported effort for ${entry.displayName}. Saved effort: ${choice.effort || "none"}.`;
    return metadata.agentId === "claude_code" ? autoModeError(entry) : undefined;
  }
  private modelsChanged(): void {
    if (this.observedClaude !== this.claude) {
      this.offUsage?.(); this.observedClaude = this.claude;
      this.offUsage = this.claude?.onChange(() => {
        if (this.claude?.account !== this.lastReading) this.freshReading = this.claude?.account;
        this.modelsChanged();
      });
    }
    const metadata = this.agents.state;
    if (metadata.agentId === "codex" && !metadata.pending && metadata.models && !this.record.settings.agentChoices.codex) {
      const model = latestSol(metadata.models);
      this.record.settings.agentChoices.codex = model ? { model, effort: "high" } : { model: "" };
      this.choiceNotice = model ? undefined : "Could not establish a unique latest GPT Sol with High effort. Choose model and effort explicitly.";
      this.save();
    }
    const reading = this.claude?.account;
    if (metadata.agentId === "codex" && !metadata.pending && metadata.account && metadata.account !== this.lastCodexReading) {
      this.lastCodexReading = metadata.account;
      this.codexReadingArrived(metadata.account);
    }
    if (this.record.settings.agentId === "claude_code" && reading !== undefined && reading !== this.lastReading) {
      this.lastReading = reading;
      this.readingArrived(reading);
    }
    this.changed();
  }

  get paths() {
    return this.options.paths;
  }

  /** Provider metadata reads use the controller's original environment. */
  get environment(): NodeJS.ProcessEnv { return this.options.env; }

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
   * The PRD's repositories as Documents found shows them before Start: those already set up,
   * then the PRD's repository and the named repositories the start checks found, each with any
   * entry an earlier Start left. After Start, the set-up entries.
   */
  get plannedRepositories(): PlannedRepository[] {
    const { record } = this;
    if (record.startedAt !== undefined) {
      return record.repositories.filter((entry) => entry.setupCompletedAt !== undefined || entry.baseCommit !== undefined).map((entry) => ({ ...entry, entry }));
    }
    const list: PlannedRepository[] = record.repositories.filter((entry) => entry.setupCompletedAt !== undefined).map((entry) => ({ ...entry, entry }));
    const add = (name: string, kind: "prd" | "named", mainCheckoutPath: string, github: string) => {
      if (list.some((candidate) => candidate.name === name)) return;
      const entry = record.repositories.find((candidate) => candidate.name === name);
      list.push({ name, kind, mainCheckoutPath, github, ...(entry ? { entry } : {}) });
    };
    add(this.paths.repositoryName, "prd", this.paths.mainCheckoutPath, record.repository.github);
    const named = this.options.namedRepositories ?? [];
    const planNames = this.options.startPlan ? namedRepositories(this.options.startPlan.phases, this.paths.repositoryName) : named.map((repository) => repository.name);
    for (const name of planNames) {
      const found = named.find((repository) => repository.name === name);
      if (found) add(found.name, "named", found.mainCheckoutPath, found.github);
    }
    // The PRD's repository is listed first.
    list.sort((a, b) => (a.kind === "prd" ? -1 : b.kind === "prd" ? 1 : 0));
    return list;
  }

  /** More than one repository: from the plan before Start, from the set-up repositories after (multi-repo AC-SPACE-03). */
  get multiRepository(): boolean {
    if (this.record.startedAt === undefined && this.record.setupCompletedAt === undefined) return this.plannedRepositories.length > 1;
    // An entry left holding only Kiln's branch, which the plan no longer names, isn't one of them.
    return this.record.repositories.filter((entry) => entry.setupCompletedAt !== undefined || (entry.kind !== "added" && entry.baseCommit !== undefined)).length > 1;
  }

  /** The workspace folder and feature branch are fixed once any repository is set up. */
  get workspaceFixed(): boolean {
    return this.record.repositories.some((entry) => entry.setupCompletedAt !== undefined);
  }

  /** Where the PRD's sessions start: the workspace folder for a multi-repository PRD, else the PRD's worktree. */
  get sessionFolder(): string {
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
  async start(body: { refinementConfirmed?: boolean } = {}): Promise<CommandResult> {
    const { record } = this;
    if (this.currentlyComplete) return refuse("The feature is complete.");
    if (this.billing.busy) return refuse("Billing approval is being saved.");
    if (!this.restartReview || this.restartReview.action === "start") {
      if (this.agents.state.pending) return refuse("Agent metadata is still loading.");
      if (this.selectionError) return refuse(this.selectionError);
    }
    if (this.restartReview) {
      // The work may have changed in a terminal while the overview was open.
      this.pendingResume = undefined;
      await this.decide({ review: true });
      this.restartReview = undefined;
      this.reviewingRestart = false;
      this.changed();
      this.kick();
      return { ok: true };
    }
    if (record.pause.activeSince !== undefined) {
      record.pause = {};
      this.save();
      this.kick();
      return { ok: true };
    }
    if (record.startedAt !== undefined || this.settingUp) return refuse("Kiln isn't waiting for Start.");
    if (body.refinementConfirmed !== true) return { ok: false, status: 400, reason: "Confirm the documents have been through requirements refinement first." };
    if (this.baseCheck === "checking") return refuse(`Kiln is checking ${record.settings.baseBranch || "the base branch"} on origin.`);
    const modelError = this.currentFieldErrors.model;
    if (modelError !== undefined) return { ok: false, status: 409, reason: modelError, fieldErrors: { model: modelError } };

    this.settingUp = true;
    this.startError = undefined;
    this.changed();
    let repositoryCount: number;
    try {
      if (record.settings.agentId === "claude_code") {
        try { await this.billing.refresh(this.billingCwd, this.sessionEnv(), [], true); }
        catch { return refuse("Start could not be saved: billing state could not be saved. No AI work was authorized."); }
        if (!this.billing.view.canLaunch) return refuse(this.billing.view.next?.readinessError ?? "Review and approve the detected billing setup, or change its source and recheck.");
      }
      const repositories = this.plannedRepositories;
      const fields = await this.runFieldChecks();
      const pending = repositories.filter((repository) => repository.entry?.setupCompletedAt === undefined);
      if (Object.keys(fields.errors).length > 0 || Object.keys(fields.baseErrors).length > 0 || pending.some((repository) => fields.startCommits[repository.name] === undefined)) {
        return { ok: false, status: 409, reason: "The settings don't pass their checks.", fieldErrors: fields.errors, baseErrors: fields.baseErrors };
      }
      // One save records Start and the whole list, each entry with the commit its branch starts from.
      const beforeStart = structuredClone(record);
      const multi = repositories.length > 1;
      const branchFixed = this.workspaceFixed;
      const list: RepositoryEntry[] = [];
      for (const repository of repositories) {
        const entry: RepositoryEntry = repository.entry ?? { name: repository.name, kind: repository.kind, mainCheckoutPath: repository.mainCheckoutPath, github: repository.github, baseBranch: "", worktreePath: "" };
        if (entry.setupCompletedAt === undefined) {
          entry.kind = repository.kind;
          entry.mainCheckoutPath = repository.mainCheckoutPath;
          entry.github = repository.github;
          entry.baseBranch = baseFor(repository, record.settings, branchFixed);
          entry.worktreePath = worktreePathFor(repository.name, repository.kind, record.settings, multi);
          entry.baseCommit = fields.startCommits[repository.name]!;
        }
        list.push(entry);
      }
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
      record.startedAt = at;
      record.refinementConfirmedAt = at;
      // The plan as Documents found showed it, until the worktree's own copy is read.
      if (this.options.startPlan) record.plan = recordedPlan(this.options.startPlan);
      try { this.save(); } catch (error) {
        for (const key of Object.keys(record)) Reflect.deleteProperty(record, key);
        Object.assign(record, beforeStart);
        return refuse(`Start could not be saved: ${(error as Error).message}`);
      }
      const setup = await this.finishSetup();
      if (this.stopping) return refuse("Kiln is stopping.");
      if (!setup.ok) return { ok: false, status: 409, reason: this.startError ?? setup.error };
    } finally {
      this.settingUp = false;
      this.changed();
    }
    this.emit({ kind: "prd_started", at: this.now(), branch: record.settings.featureBranch, baseBranch: record.settings.baseBranch, repositoryCount });
    this.kick();
    return { ok: true };
  }

  /** Pause after this phase (AC-VIEW-03); not offered during the pull-request session (AC-PR-05). */
  pause(): CommandResult {
    const { record } = this;
    if (!this.isUnderway || this.currentlyComplete) return refuse("Nothing is running to pause after.");
    if (this.stoppedPhaseKey() !== undefined) return refuse("Kiln is stopped at Needs you, which offers no pause.");
    if (this.waitingPhaseKey() !== undefined) return refuse("Kiln is waiting for usage, which offers no pause.");
    if (record.pause.activeSince !== undefined) return refuse("Kiln is already paused.");
    if (record.pause.requestedAt !== undefined) return refuse("A pause is already requested.");
    if (this.current?.phaseKey === PR_PHASE_KEY && this.current.session !== undefined) return refuse("Pause after this phase isn't offered during the pull-request session.");
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
    this.save();
    return { ok: true };
  }

  phaseRecoveryTarget(): PhaseRecoveryTarget | undefined {
    const phaseKey = this.stoppedPhaseKey();
    if (!phaseKey || phaseKey === PR_PHASE_KEY || this.auditActivity(phaseKey) && !this.record.liveControl) return undefined;
    const facts = this.record.phases[phaseKey];
    const hold = this.record.billing?.hold?.phaseKey === phaseKey ? this.record.billing.hold : undefined;
    if (!hold && facts?.stop?.kind !== "done_check" && facts?.stop?.kind !== "not_resumable") return undefined;
    const session = this.latestSession(phaseKey);
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

  private async recoverPhase(action: "resume" | "verify", body: Record<string, unknown>): Promise<CommandResult> {
    const fail = (code: PhaseRecoveryCode, reason: string, status: 400 | 409 | 500 | 503 = 409): CommandResult => ({ ok: false, code, reason, status });
    const allowed = action === "resume" ? ["target", "note"] : ["target", "intent"];
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
    if (action === "resume" && !this.resumeOffered(key)) return fail("recovery_unavailable", "The saved conversation cannot be resumed. Use the available terminal recovery instructions.");
    this.checking = true;
    this.changed();
    let queued = false;
    try {
      const latest = this.latestSession(key)!;
      if (this.record.liveControl) await this.requireTakeoverReturn();
      if (latest.agentId === "codex") await this.stopLiveProcess(latest);
      const evaluatedMaterial = this.record.liveControl ? await this.takeoverMaterial(key) : undefined;
      const outcome = await this.doneCheck(key);
      if (outcome === "stopping" || this.stopping) throw new CompletionCheckUnavailable("The completion check was interrupted. No work was started.");
      if (outcome.unavailable) throw new CompletionCheckUnavailable(outcome.unavailable);
      if (!outcome.plan.ok) throw new CompletionCheckUnavailable(outcome.plan.problem);
      // A hold may precede a normal stop. Save actual completion evidence separately from billing.
      const facts = this.record.phases[key]!;
      const previousStop = structuredClone(facts.stop);
      if (!facts.stop) facts.stop = { kind: "done_check", at: target!.stoppedAt, checks: [], checkedAt: this.now().toISOString() };
      try { this.updateStop(key, outcome.checks); }
      catch (error) { if (previousStop) facts.stop = previousStop; else delete facts.stop; throw error; }
      this.phaseCheckError = undefined;
      if (outcome.passed) {
        if (action === "resume") return { ok: true, outcome: "already_complete", target: target! };
        // No completion state is observable before its atomic write succeeds.
        const before = structuredClone(this.record);
        try {
          if (this.record.liveControl) await this.requireTakeoverReturn();
          await this.recordDone(key, outcome, true, true, evaluatedMaterial);
          if (this.record.liveControl) { this.resolveMessageHold(); delete this.record.liveControl; this.save(); }
        } catch (error) {
          Object.assign(this.record, before);
          throw error;
        }
        return { ok: true, outcome: "advanced", target: target! };
      }
      if (action === "verify") return { ok: true, outcome: "still_stopped", target: target! };
      if (!this.resumeOffered(key)) return fail("recovery_unavailable", "The saved conversation is unavailable after checking. Use the terminal recovery instructions.");
      this.returningTakeover = !!this.record.liveControl;
      this.requestedResume = { phaseKey: key, cause: "person_resume", ...(note ? { note } : {}) };
      queued = true;
      return { ok: true, outcome: "resume_requested", target: target! };
    } catch (error) {
      const reason = (error as Error).message;
      if (error instanceof OwnershipError && error.code === "message_review_required") return fail("message_review_required", reason);
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
    if (this.phaseRecoveryTarget() || "target" in body || "intent" in body) return this.recoverPhase("verify", body);
    const key = this.stoppedPhaseKey();
    if (key === undefined) return refuse("No phase is waiting for Check again.");
    if (this.billing.busy || this.deliveryBusy || this.checking || this.driving) return refuse("Kiln is already checking.");
    this.checking = true;
    this.changed();
    try {
      await this.recheckStop(key);
    } finally {
      this.checking = false;
      this.changed();
    }
    this.kick();
    return { ok: true };
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
    if (this.restartReview) return refuse("Review the phase plan and use Continue to resume Kiln.");
    if (this.phaseRecoveryTarget() || "target" in body) return this.recoverPhase("resume", body);
    const waiting = this.record.billing?.hold ? undefined : this.waitingPhaseKey();
    if (waiting !== undefined) {
      // An empty note counts as none.
      if (body.note !== undefined && !(typeof body.note === "string" && body.note.trim() === "")) return refuse("Resume now takes no note.");
      if (this.billing.busy || this.deliveryBusy || this.checking || this.driving) return refuse("Kiln is already checking.");
      await this.resumeWait(waiting, "person_resume");
      return { ok: true };
    }
    const key = this.stoppedPhaseKey();
    if (key === undefined || !this.resumeOffered(key)) return refuse("Resume isn't offered here.");
    if (this.billing.busy || this.deliveryBusy || this.checking || this.driving) return refuse("Kiln is already checking.");
    if (body.note !== undefined && typeof body.note !== "string") return { ok: false, status: 400, reason: "The note must be text." };
    const note = (body.note ?? "").trim();
    if (note.length > NOTE_LIMIT) return { ok: false, status: 400, reason: `The note can be at most ${NOTE_LIMIT.toLocaleString("en-US")} characters.` };
    this.checking = true;
    this.changed();
    let verdict: "done" | "complete" | "cleared" | "still_stopped" | undefined;
    try {
      verdict = await this.recheckStop(key);
    } finally {
      // Held on through the resume only when the check failed; the run's start releases it.
      if (verdict !== "still_stopped" || this.stopping) {
        this.checking = false;
        this.changed();
      }
    }
    if (verdict === "still_stopped" && !this.stopping) this.requestedResume = { phaseKey: key, cause: "person_resume", ...(note === "" ? {} : { note }) };
    this.kick();
    return { ok: true, ...(note !== "" && (verdict === "done" || verdict === "complete") ? { noteSkipped: true as const } : {}) };
  }

  /**
   * Whether Needs you offers Resume (usage-limit recovery AC-RESUME-01): at a done-check or
   * pull-request-check stop, an interrupted one included (multi-repo AC-OUTSIDE-04), whose session
   * has a run that started, and never when Claude Code holds no transcript for it (multi-repo
   * AC-OUTSIDE-01). It reads only the record and the transcripts, so a restarted Kiln offers it the same way.
   */
  resumeOffered(phaseKey: string): boolean {
    if (this.record.liveControl && this.record.liveControl.takeover.state !== "released") return false;
    const kind = this.record.phases[phaseKey]?.stop?.kind;
    if (kind !== "done_check" && kind !== "pull_request_check" && this.record.billing?.hold?.phaseKey !== phaseKey) return false;
    const session = this.latestSession(phaseKey);
    if (!session || !session.runs.some((run) => run.pid !== undefined)) return false;
    return !this.transcriptMissing(session) && this.codexSafetyProblems(phaseKey, false).length === 0;
  }

  /**
   * Changes settings: model, effort and keep-awake at any time, applying to sessions started
   * after it (AC-VIEW-08); the worktree and branches only before Start (AC-START-06).
   */
  async changeSettings(change: Partial<Settings>): Promise<CommandResult> {
    if (this.settingUp) return refuse("Kiln is preparing the accepted workspace. Wait before changing settings.");
    if (this.checking && this.phaseRecoveryTarget()) return refuse("Kiln is checking or resuming this phase. Wait before changing settings.");
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
    if (change.agentId !== undefined) {
      try { assertAgent(change.agentId); } catch { return { ok: false, status: 400, reason: "Unknown agent." }; }
    }
    const hasPair = change.model !== undefined || change.effort !== undefined;
    if (hasPair && (change.agentId !== this.record.settings.agentId || change.selectionGeneration !== this.agents.state.generation)) return refuse("The selected agent changed. Use the current model editor.");
    if (change.agentId !== undefined && change.agentId !== this.record.settings.agentId) {
      if (this.agentFixed) return refuse("The agent is fixed after Start or repository setup.");
      this.record.settings.agentId = change.agentId;
      this.record.settings.selectionGeneration = this.agents.state.generation + 1;
      this.choiceNotice = undefined;
      this.save();
      this.agents.select(change.agentId);
      this.billing.invalidate();
      void this.refreshBilling().catch(() => this.changed());
    }
    if (hasPair) {
      if (this.agents.state.pending || !this.agents.state.models) return refuse("Wait for a current model catalogue before changing choices.");
      const saved = selectedChoice(this.record.settings);
      const choice = { ...saved };
      if (change.model !== undefined) {
        if (!change.model.trim()) return { ok: false, status: 400, reason: "Choose a model." };
        choice.model = change.model;
      }
      const entry = this.modelEntry(choice.model);
      if (!entry) return { ok: false, status: 422, reason: "This model is not selectable.", fieldErrors: { model: "Choose a model from the current catalogue." } };
      if (change.effort !== undefined) {
        if (!change.effort.trim()) return { ok: false, status: 400, reason: "Effort must be nonempty." };
        if (!entry.supportedEffortLevels.includes(change.effort)) return { ok: false, status: 422, reason: "Unsupported effort.", fieldErrors: { model: "Choose a supported effort." } };
        choice.effort = change.effort;
      } else if (!entry.supportsEffort) {
        delete choice.effort;
      } else if (change.model !== undefined && (!choice.effort || !entry.supportedEffortLevels.includes(choice.effort))) {
        if (entry.defaultEffort && entry.supportedEffortLevels.includes(entry.defaultEffort)) {
          choice.effort = entry.defaultEffort;
          this.choiceNotice = `Effort changed to ${choice.effort} for ${entry.displayName}.`;
        } else { delete choice.effort; this.choiceNotice = `Choose an effort for ${entry.displayName}; no supported default was reported.`; }
      }
      this.record.settings.agentChoices[this.record.settings.agentId] = choice;
    }
    // Paths are stored absolute (technical design, "Paths shown"); a leading ~ is expanded.
    if (change.worktreePath !== undefined) change = { ...change, worktreePath: expandHome(change.worktreePath) };
    if (change.workspaceFolder !== undefined) change = { ...change, workspaceFolder: expandHome(change.workspaceFolder) };
    if (change.bases !== undefined) change = { ...change, bases: { ...this.record.settings.bases, ...change.bases } };
    for (const [field, value] of Object.entries(change)) {
      if (value !== undefined && !["model", "effort", "agentId", "selectionGeneration"].includes(field)) (this.record.settings as unknown as Record<string, unknown>)[field] = value;
    }

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

  get currentlyComplete(): boolean { return this.record.completedAt !== undefined && (!deliveryEnabled(this.record) || this.record.developmentDelivery?.currentComplete === true); }

  /** Audits have activity storage keys, never synthetic implementation phase IDs. */
  auditRecoveryTask(key: string, folder: string): AuditRecoveryTask | undefined {
    const activity = this.record.completionAudits?.activities.find(one => `audit-${one.activityId}` === key);
    if (!activity) return undefined;
    const refusal = latestAuditRefusal(this.stateDirectory, activity);
    return { label: activity.kind === "delivery_audit" ? "Delivery audit" : "Test audit", prdFile: this.pathFrom(folder, this.prdFile()), activityId: activity.activityId, round: activity.round, reportPath: activity.reportPath, skillPath: activity.skill.path, instructions: this.auditPrompt(activity), ...(refusal ? { lastRefusal: { at: refusal.at, text: `${refusal.code}: ${refusal.reason}${refusal.criteria.length ? ` Criteria: ${refusal.criteria.join(", ")}.` : ""}` } } : {}) };
  }

  deliveryOwnerFor(key: string): DeliveryOwner {
    const audit = this.record.completionAudits?.activities.find(one => `audit-${one.activityId}` === key);
    if (audit) return { kind: "audit", activityId: audit.activityId };
    if (key.startsWith("audit-")) throw new DeliveryRefusal("Unknown assigned audit activity.");
    return { kind: "phase", phaseId: key };
  }

  private deliveryContext(phaseId?: string): DeliveryContext {
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    return { record: this.record, stateDirectory: this.stateDirectory, prdWorktree: this.worktreePath, prdDirectory: this.paths.prdDirectoryFromRoot, git: { ...this.git, signal }, gh: this.options.tools.gh, env: this.options.env, ...(phaseId ? { ...(this.deliveryOwnerFor(phaseId).kind === "phase" ? { phaseId } : {}), owner: this.deliveryOwnerFor(phaseId) } : {}), signal, now: () => this.now().toISOString(), commands: (id, deadline) => this.deliveryCommands(id, deadline) };
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
    }) } : {}), executionId: this.record.executionId, authorization: this.record.developmentAuthorization ?? restrictedAuthorization(), ...state, ...(binding ? { documentsDigest: binding.documentsDigest, ...(binding.requirementManifestDigest ? { requirementManifestDigest: binding.requirementManifestDigest } : {}) } : {}), ...(owner ? ownerFields(owner) : {}) };
  }

  async deliveryReadStatus() {
    const status = this.deliveryStatus();
    const ids = [...new Set([...Object.values(this.record.phases).flatMap(one => one.sessionIds), ...(this.record.completionAudits?.activities ?? []).flatMap(one => one.sessionIds)])];
    const availableCommandEvidence: { sessionId: string; id: string; command: string; cwd: string; calledAt: string; resultAt?: string }[] = [];
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    if (deliveryEnabled(this.record)) for (const id of ids) {
      try { for (const command of await this.deliveryCommands(id, signal)) availableCommandEvidence.push({ sessionId: id, id: command.callId, command: command.command, cwd: command.cwd, calledAt: command.calledAt, ...(command.resultAt ? { resultAt: command.resultAt } : {}) }); }
      catch (error) { return { ...status, availableCommandEvidence, commandEvidenceError: (error as Error).message }; }
    }
    return { ...status, availableCommandEvidence };
  }

  /** Uses the same serialization boundary as development mutations and done checks. */
  async auditCommand(action: "status" | "snapshot" | "result", body: Record<string, unknown> = {}, cursor?: string): Promise<unknown> {
    if (this.deliveryBusy || this.checking || this.activeCheck || this.stopping || this.settingUp) throw new AuditRefusal("busy", "Kiln is checking or changing execution state.", 409);
    this.deliveryBusy = true;
    let release!: () => void; this.deliveryPending = new Promise<void>(resolve => { release = resolve; });
    const before = structuredClone(this.record.completionAudits); const beforeDelivery = structuredClone(this.record.developmentDelivery);
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    try {
      const context: AdmissionContext = { ...(deliveryEnabled(this.record) ? { developmentChecks: () => [ownerDeliveryCheck(this.deliveryContext(), { kind: "audit", activityId: this.record.completionAudits!.activities.at(-1)!.activityId })] } : {}), record: this.record, stateDirectory: this.stateDirectory, git: { ...this.git, signal }, env: this.options.env, codex: this.options.tools.codex ?? "codex", signal, session: (activity, id) => this.sessionRecord(`audit-${activity.activityId}`, id) };
      if (action === "result" && deliveryEnabled(this.record)) await reconcileDelivery(this.deliveryContext());
      const result = action === "status" ? await auditStatus(context, cursor) : action === "snapshot" ? await issueSnapshot(context, body) : await submitAudit(context, body);
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

  private async deliveryCommands(id: string, deadline?: AbortSignal): Promise<CommandEvidence[]> {
    const signal = deadline ? AbortSignal.any([this.abort.signal, deadline]) : this.abort.signal; signal.throwIfAborted();
    const audit = this.record.completionAudits?.activities.find(one => one.sessionIds.includes(id));
    const phaseKey = audit ? `audit-${audit.activityId}` : Object.entries(this.record.phases).find(([, facts]) => facts.sessionIds.includes(id))?.[0];
    const session = phaseKey ? this.sessionRecord(phaseKey, id) : undefined;
    if (!session) throw new DeliveryRefusal("The command session does not belong to this execution.");
    if (session.agentId === "codex") {
      if (!session.conversation?.threadId || !session.conversation.codexHome || !this.options.tools.codex) throw new DeliveryRefusal("Codex command history is unavailable.");
      const audit = await auditCodexConversation({ threadId: session.conversation.threadId, codexHome: session.conversation.codexHome, worktrees: this.setUpRepositories.map(one => one.worktreePath), cwd: this.workingDirectoryOf(session), executable: this.options.tools.codex, env: this.options.env, signal, commandProjection: true });
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

  /** A grant may precede the stopped leaf's very first provider session (plan/readiness stop). */
  private nextExecutionLeaf(plan: PhasePlan): PlannedPhase | undefined {
    const activation = this.record.developmentAuthorization?.activationRecovery;
    if (activation && !this.record.phases[recoveryStopKey(activation)]?.sessionIds.length && this.activationChecks().some(check => !check.passed)) return judgedPhase(plan.phases, recoveryStopKey(activation));
    return nextLeaf(plan);
  }

  private async unresolvedDeliveryLeaf(): Promise<string | undefined> {
    if (!deliveryEnabled(this.record)) return undefined;
    await reconcileDelivery(this.deliveryContext());
    const activation = this.record.developmentAuthorization?.activationRecovery;
    if (activation) {
      const failed = this.activationChecks().filter(check => !check.passed);
      if (failed.length && !this.record.phases[recoveryStopKey(activation)]?.sessionIds.length) {
        // Launch the authorized stopped leaf once its original blocker clears. Its first
        // session supplies the historical assessments; no future leaf can overtake it.
        if (recoveryStopKey(activation) === PR_PHASE_KEY || this.auditActivity(recoveryStopKey(activation)) || judgedPhase(this.record.plan ?? [], recoveryStopKey(activation))) return undefined;
        this.recordStop(recoveryStopKey(activation), "plan", [{ name: CHECK_NAMES.plan, passed: false, facts: ["The activation-recovery phase is missing from the current plan."] }]); return recoveryStopKey(activation);
      }
      if (failed.length) { this.recordStop(recoveryStopKey(activation), recoveryStopKey(activation) === PR_PHASE_KEY ? "pull_request_check" : "done_check", failed); return recoveryStopKey(activation); }
    }
    for (const leaf of recordedLeaves(this.record.plan ?? [])) {
      if (!leaf.closed) break;
      const accepted = this.record.planReconciliation?.baselineId ? readBaseline(this.stateDirectory, this.record.planReconciliation.baselineId) : undefined;
      if (this.record.continuation?.acceptances.some(row => row.state === "active" && row.newExecutionId === this.record.executionId) && !this.record.phases[leaf.id] && (accepted?.completions[leaf.id] || this.record.preparation?.bindings.some(binding => preparesPhase(binding, leaf.id)))) continue;
      const check = phaseDeliveryCheck(this.deliveryContext(leaf.id), leaf.id);
      if (!check.passed) { this.recordStop(leaf.id, "done_check", [check]); return leaf.id; }
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
    const report = this.describeStop();
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

  /** The line a stop prints, for what Kiln is doing as it begins (UI-010 item 3). */
  private describeStop(): StopReport {
    const { record } = this;
    const name = (key: string) => (key === PR_PHASE_KEY ? "the pull request" : this.auditActivity(key) ? auditLabel(this.auditActivity(key)!.kind).toLowerCase() : `phase ${this.judgedId(key)}`);
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
      const subject = stopped === PR_PHASE_KEY ? "The pull request" : `Phase ${this.judgedId(stopped)}`;
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

  /** Releases keep-awake and stops reading sleep; for when Kiln exits. */
  close(): void {
    this.closed = true;
    if (this.takeoverTimer) clearInterval(this.takeoverTimer);
    if (this.recoveredTimer) clearInterval(this.recoveredTimer);
    this.offClaude?.();
    this.offUsage?.();
    this.agents.close();
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

  private emitSessionEvent(phaseKey: string, event: "interrupted" | "resumed" | "stopped" | "waiting", limit?: { label: string; resetsAt?: string }): void {
    const extra = limit === undefined ? {} : { limit };
    if (phaseKey === PR_PHASE_KEY) this.emit({ kind: "pull_request", at: this.now(), event, ...extra });
    else if (this.auditActivity(phaseKey)) this.emitAudit(this.auditActivity(phaseKey)!, event, limit);
    else {
      const judged = this.judgedId(phaseKey);
      this.emit({ kind: "phase", at: this.now(), phaseId: judged, title: this.titleOf(judged), event, ...extra });
    }
  }

  private continuationReference(action: JournalAction, inputs: Record<string, unknown>, execution?: string) {
    return this.record.continuation?.acceptances.find(row => (execution === undefined || row.completedExecutionId === execution) && (action === "continuation-accept" ? row.proposalId === inputs.proposal_id : row.id === inputs.acceptance_id));
  }

  private continuationControl(instruction: import("../control/commands.js").Instruction) {
    const known = instruction.action === "continuation-grant" ? undefined : this.continuationReference(instruction.action, instruction.inputs, instruction.execution_id);
    if (known && (instruction.action === "continuation-accept" || known.state === "active" || known.state === "superseded" || known.state === "preparing" && !!this.driving)) return { available: true, reason: null, alreadyApplied: true };
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
    return { ...row, repositories: acceptance.repositories.map(repo => ({ name: repo.name, worktreePath: repo.worktreePath, baseBranch: repo.baseBranch, baseRevision: repo.baseCommit, ready: !!repo.setupCompletedAt })), branch: acceptance.settings.featureBranch };
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
    if (this.commands?.fault) throw new Error(this.commands.fault);
    try { return write(); }
    catch (error) { if (error instanceof PlanCapacityError) throw error; this.commands.fault = "Continuation metadata could not be durably saved. Restart to reconcile before changing work."; throw error; }
  }

  private async acceptContinuation(inputs: Record<string, unknown>, receipt: Receipt): Promise<Extract<CommandResult, { ok: true }> | (Omit<Extract<CommandResult, { ok: false }>, "code"> & { code?: string })> {
    const check = await this.checkCompletedPlanOwned();
    const proposal = check.result?.proposal;
    if (check.status === "failed") return { ok: false, status: 503, code: "source_unavailable", reason: check.errors.join(" ") || "Required plan sources are unavailable. Restore them and retry the check." };
    if (!proposal || proposal.id !== inputs.proposal_id) return { ok: false, status: 409, code: "proposal_changed", reason: "The plan or delivery prerequisites changed. Review the refreshed offer and choose Continue again." };
    if (check.status !== "available" || proposal.readiness !== "ready" || !proposal.added.length) return { ok: false, status: 422, code: "prerequisite_blocked", reason: proposal.problems.join(" ") || "No ready additional work is available." };
    if (proposal.prerequisites.some(row => !["integrated_verified", "preparation_available"].includes(row.status))) return { ok: false, status: 422, code: "preparation_unverified", reason: "Required prerequisites are unresolved." };
    const previous = this.record.continuation?.acceptances.find(row => row.completedExecutionId === this.record.executionId && row.state !== "superseded");
    if (previous) {
      if (previous.state !== "blocked") return refuse("An accepted continuation already owns preparation.");
      const old = readAcceptance(this.stateDirectory, previous.id);
      for (const repo of old.repositories) await validatePreparedWorkspace(this.git, old, repo.name);
      old.state = "superseded"; this.saveContinuation(old);
    }
    bindLegacySessions(this);
    const acceptance = this.writeContinuationMetadata(() => newAcceptance(this.record, this.stateDirectory, proposal, check.result!.candidateId, receipt, this.now().toISOString()));
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
      await prepareWorkspaces(this.git, acceptance, () => this.saveContinuation(acceptance), () => this.now().toISOString());
      await revalidate();
      for (const repo of acceptance.repositories) if (!await validatePreparedWorkspace(this.git, acceptance, repo.name)) throw new Error(`Prepared workspace disappeared: ${repo.worktreePath}. Retry its recorded setup.`);
      const prd = acceptance.repositories.find(repo => repo.kind === "prd")!;
      const source = observePlan(prd.worktreePath, this.record.prdDirectory);
      if (source.digest !== acceptance.proposal.candidateDigest) throw new Error("The fresh workspace does not contain the accepted complete document set.");
      const candidate = readBaseline(this.stateDirectory, acceptance.candidateId);
      const accounting = this.record.completedPlanCheck?.result?.leaves ?? [];
      const completions = { ...candidate.completions };
      for (const row of accounting.filter(row => row.classification === "externally_verified")) completions[row.id] = { kind: "external", scopeRepositories: phaseRepositories(source, row.id), ...(row.completedAt ? { doneAt: row.completedAt } : {}), revision: row.repositories.find(repo => repo.repository === this.record.repository.name)!.revision, repositories: Object.fromEntries(row.repositories.map(repo => [repo.repository, { identity: repo.identity, revision: repo.revision! }])) };
      // Preserve verified introduction across squash/rebase deliveries without inventing
      // a phase/provider receipt. The immutable baseline binds source and accepted base.
      for (const [id, completion] of Object.entries(completions)) {
        if (!acceptance.proposal.prerequisites.some(row => row.phaseId === id && row.status === "integrated_verified")) continue;
        const names = [...new Set([this.record.repository.name, ...(completion.scopeRepositories ?? phaseRepositories(candidate.active, id))])];
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
      const archiveRow = { executionId: acceptance.completedExecutionId, archiveId: acceptance.archiveId, ...(old.startedAt ? { startedAt: old.startedAt } : {}), completedAt: old.completedAt!, branch: old.settings.featureBranch, deliveries: executionDeliveries(old) };
      acceptance.state = "active"; acceptance.activatedAt = this.now().toISOString(); delete acceptance.reason;
      this.writeContinuationMetadata(() => writeAcceptance(this.stateDirectory, acceptance));
      const continuation = structuredClone(old.continuation!);
      continuation.acceptances = continuation.acceptances.map(row => row.id === acceptance.id ? acceptanceSummary(acceptance) : row);
      if (!continuation.executions.some(row => row.executionId === archiveRow.executionId)) continuation.executions.push(archiveRow);
      const active = { schemaVersion: SCHEMA_VERSION, executionId: acceptance.newExecutionId, token: old.token, repository: old.repository, prdDirectory: old.prdDirectory, featureName: old.featureName, settings: acceptance.settings, repositories: acceptance.repositories, continuation, phases: {}, plan: recordedPlan(source.plan), planReconciliation: { baselineId: baseline.id }, pause: {}, billing: newBillingState(acceptance.newExecutionId), developmentAuthorization: acceptance.authorization ?? restrictedAuthorization(), ...(old.pendingContinuationAuthority ? { pendingContinuationAuthority: old.pendingContinuationAuthority } : {}), ...(acceptance.proposal.preparation.length ? { preparation: newPreparationState(acceptance.proposal) } : {}), developmentDelivery: emptyDevelopmentLedger(), completionAudits: { revision: 0, policy: "required" as const, activities: [], evidence: [] }, startedAt: acceptance.acceptedAt, refinementConfirmedAt: acceptance.acceptedAt, setupCompletedAt: acceptance.activatedAt };
      this.billing.invalidate(false);
      for (const key of Object.keys(old)) Reflect.deleteProperty(old, key);
      Object.assign(old, active);
      this.controlEpoch = randomUUID(); this.record.controlEpoch = this.controlEpoch;
      this.plan = source.plan; this.current = undefined; this.pendingResume = undefined; this.requestedResume = undefined; this.restartReview = undefined; this.reviewingRestart = false; this.stoppedCommits = undefined; this.lastPullRequestRepositories = undefined; this.pullRequestPrecheckDone = false;
      this.save();
      if (authority && acceptance.pendingAuthorityId === authority.id) { authority.state = "adopted"; authority.acceptanceId = acceptance.id; this.writeContinuationMetadata(() => writePendingAuthority(this.stateDirectory, authority)); }
      this.commands.rotateExecution(acceptance.newExecutionId, acceptance.operationId);
      bindExecutionAliases(this);
      bindLegacySessions(this);
      cacheSnapshot(this, inspectionSnapshot(this));
    } catch (error) {
      if (this.commands.fault || this.stopping || this.record.executionId === acceptance.newExecutionId) {
        this.commands.fault ??= "Activation metadata is unresolved. Restart Kiln to rebuild inspection before dispatch.";
        throw error;
      }
      acceptance.state = "blocked"; acceptance.reason = (error as Error).message; this.saveContinuation(acceptance);
    } finally { this.settingUp = false; this.changed(); }
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
  checkCompletedPlan(): Promise<CompletedPlanCheck> {
    if (this.completedPlanReading) return this.completedPlanReading;
    if (this.commands.blocked) return Promise.reject(new AuditRefusal("busy", this.commands.fault ?? "Reconcile the retained command owner before another plan check.", 409));
    if (!this.currentlyComplete) return Promise.reject(new AuditRefusal("wrong_activity", "Only a completed feature can check for added phases.", 409));
    if (this.commands.busy || this.checking || this.driving || this.settingUp || this.deliveryBusy || this.stopping) return Promise.reject(new AuditRefusal("busy", "Kiln is already checking or changing work.", 409));
    return this.checkCompletedPlanOwned();
  }

  private checkCompletedPlanOwned(): Promise<CompletedPlanCheck> {
    if (this.completedPlanReading) return this.completedPlanReading;
    const previous = this.record.completedPlanCheck;
    this.checking = true;
    const attemptedAt = this.now().toISOString();
    this.record.completedPlanCheck = { status: "checking", attemptedAt, sources: [], errors: [], ...(previous?.lastSuccessfulAt ? { lastSuccessfulAt: previous.lastSuccessfulAt } : {}), ...(previous?.result ?? previous?.earlierResult ? { earlierResult: previous?.result ?? previous?.earlierResult } : {}) };
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
      return discoverCompletedPlan({ codex: this.options.tools.codex, record: this.record, directory: this.stateDirectory, shared: expandHome(this.paths.mainCheckoutPath), git: { ...this.git, signal }, attemptedAt, observeInput });
    }).then(check => {
      if (this.stopping || this.closed) return check;
      const pendingAuthority = readPendingAuthority(this.stateDirectory, this.record);
      if (pendingAuthority?.state === "pending" && pendingAuthority.completedExecutionId === this.record.executionId && check.result?.proposal?.grantEligible && check.result.proposal.scopeDigest && pendingAuthority.scopeDigest !== check.result.proposal.scopeDigest) {
        pendingAuthority.state = "superseded";
        this.writeContinuationMetadata(() => writePendingAuthority(this.stateDirectory, pendingAuthority));
      }
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
        status: "failed", attemptedAt, sources: this.record.completedPlanCheck?.sources ?? [],
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
    await this.readPlan();
    return { ok: true };
  }

  /**
   * The second half: judges a session whose verdict was never recorded, re-checks a stop, and
   * says what Kiln does next (the ● line). An interrupted session is left untouched for a Kiln
   * that can resume it.
   */
  async decide(options: { review?: boolean } = {}): Promise<UnderwayDecision> {
    if (options.review) this.reviewingRestart = true;
    // The ● line says what these checks found, so their own terminal lines would repeat it.
    this.quiet = true;
    try {
      const decision = await this.decideQuietly();
      if (options.review) {
        this.restartReview = decision.kind === "start_phase" ? { activityKey: decision.phaseId, action: "start" }
          : decision.kind === "start_audit" ? { activityKey: decision.phaseKey, action: "start" }
          : decision.kind === "start_pull_request" ? { activityKey: PR_PHASE_KEY, action: "start" }
          : decision.kind === "resume" ? { activityKey: decision.phaseKey, action: "resume" }
          : decision.kind === "waiting" ? { activityKey: decision.phaseKey, action: "wait" } : undefined;
        this.reviewingRestart = !!this.restartReview;
        this.changed();
      }
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

  private async decideQuietly(): Promise<UnderwayDecision> {
    if (this.record.pause.activeSince && this.record.preparation?.verifiedCheckpoint && this.record.preparation.stage !== "implementation" && this.latestSession(this.record.preparation.phaseId)?.runs.at(-1)?.endedAt) return { kind: "paused", beforePhaseKey: this.record.preparation.phaseId };
    if (this.record.liveControl) {
      const target = this.record.liveControl.takeover.target;
      const session = this.sessionRecord(target.activityKey, target.sessionId);
      const run = session?.runs.at(-1);
      if (session && run && !run.endedAt && (run.control?.attemptId ?? this.legacyAttempt(session, session.runs.length - 1)) === target.attemptId) {
        try { await requireExited(run); }
        catch {
          this.current = { phaseKey: target.activityKey, session, processRunning: true, commits: [] };
          this.recoveredLive = true;
          this.recoveredTimer ??= setInterval(() => { void this.observeRecoveredLive(); }, 1000);
          this.recoveredTimer.unref();
        }
      }
      await this.reconcileTakeover();
      return { kind: "needs_you", phaseKey: target.activityKey, again: true };
    }
    const previous = this.latestSessionOverall();
    const previousRun = previous?.session.runs.at(-1);
    if (previous && previousRun && !previousRun.endedAt && previous.session.agentId === "claude_code" && previous.session.kind !== "pull_request") {
      let released = false;
      try { await requireExited(previousRun); released = true; } catch { /* Live or ambiguous input ownership must wait safely. */ }
      if (!released) {
      this.current = { phaseKey: previous.phaseKey, session: previous.session, processRunning: true, commits: [] };
      this.recoveredLive = true;
      this.recoveredTimer ??= setInterval(() => { void this.observeRecoveredLive(); }, 1000);
      this.recoveredTimer.unref();
      await this.observeRecoveredLive();
      return { kind: "needs_you", phaseKey: previous.phaseKey, again: true };
      }
    }
    if (this.commands.blocked) return { kind: "needs_you", phaseKey: this.stoppedPhaseKey() ?? this.nextKeyFromRecordedPlan(), again: true };
    const { record } = this;
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
    // What the engine loop does next, in its order.
    const read = await this.readPlan();
    if (!read.ok) return withDone(this.recordPlanStop(read.problem));
    const unresolved = await this.unresolvedDeliveryLeaf();
    if (unresolved) return withDone({ kind: "needs_you" as const, phaseKey: unresolved, again: true });
    const next = await this.nextActivity(read.plan);
    if (next.kind === "stopped") return withDone({ kind: "needs_you" as const, phaseKey: next.key, again: true });
    if (next.kind === "audit") {
      if (record.pause.requestedAt) { this.activatePause(); return withDone({ kind: "paused" as const, beforePhaseKey: next.key }); }
      return withDone({ kind: "start_audit" as const, phaseKey: next.key, label: auditLabel(next.activity.kind), round: next.activity.round });
    }
    const leaf = next.leaf;
    if (!leaf) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (deliveryEnabled(record) && check.ghError) { this.recordStop(PR_PHASE_KEY, "pull_request_check", check.checks); return withDone({ kind: "needs_you" as const, phaseKey: PR_PHASE_KEY, again: true }); }
      if (check.passed && !this.stopping) {
        this.complete(check.pullRequests!, false, check.mergedBranches);
        return withDone({ kind: "complete" as const });
      }
    }
    if (record.pause.requestedAt !== undefined) {
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
    if (this.commands?.busy && !(this.controlDispatch && this.requestedResume)) { this.controlKickPending = true; return; }
    this.driving = this.drive().finally(() => {
      this.driving = undefined;
      this.changed();
    });
  }

  private async drive(): Promise<void> {
    const { record } = this;
    for (;;) {
      const continuation = this.pendingContinuation();
      if (continuation && !this.commands.blocked && !this.stopping) { await this.prepareContinuation(continuation); if (this.record.executionId === continuation.completedExecutionId) return; }
      if (this.reviewingRestart || this.recoveredLive || this.record.liveControl && !this.requestedResume) return;
      if (this.commands.blocked || this.stopping || !this.isUnderway || this.currentlyComplete || this.record.billing?.hold && !this.requestedResume) return;
      if (this.requestedResume !== undefined) {
        const request = this.requestedResume;
        this.requestedResume = undefined;
        const runCount = this.latestSession(request.phaseKey)?.runs.length;
        await this.resumeSession(request.phaseKey, request);
        if (this.latestSession(request.phaseKey)?.runs.length === runCount) { this.current = undefined; return; }
        if ((await this.settleSession(request.phaseKey)).kind !== "done") return;
        continue;
      }
      if (this.stoppedPhaseKey() !== undefined) return;
      // No other phase starts during a wait; its readings, not the loop, end it.
      if (this.waitingPhaseKey() !== undefined) {
        this.watchWait();
        return;
      }
      if (this.pendingResume !== undefined) {
        const key = this.pendingResume;
        this.pendingResume = undefined;
        await this.resumeSession(key);
        if ((await this.settleSession(key)).kind !== "done") return;
        continue;
      }
      if (record.pause.activeSince !== undefined) return;

      const preparation = record.preparation;
      if (preparation && !record.phases[preparation.phaseId]?.doneAt && this.latestSession(preparation.phaseId)?.runs.length && (preparation.stage !== "implementation" || !this.latestSession(preparation.phaseId)?.runs[preparation.implementationRun!])) {
        const verdict = await this.advancePreparation();
        if (verdict.kind !== "done") return;
        continue;
      }
      const read = await this.readPlan();
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
        if (!added.ok) {
          this.current = undefined;
          this.recordStop(leaf.id, "plan", [{ name: CHECK_NAMES.plan, passed: false, facts: added.facts }]);
          this.emit({ kind: "phase", at: this.now(), phaseId: leaf.id, title: leaf.title, event: "stopped" });
          return;
        }
      }
      if (!leaf && !audit && !this.pullRequestPrecheckDone) {
        // A gh error here starts the pull-request session without showing it; that session's own check decides.
        const check = await this.pullRequestCheck(PR_PHASE_KEY);
        if (deliveryEnabled(record) && check.ghError) { this.current = undefined; this.recordStop(PR_PHASE_KEY, "pull_request_check", check.checks); return; }
        if (this.stopping) return;
        if (check.passed) {
          this.complete(check.pullRequests!, false, check.mergedBranches);
          return;
        }
      }
      this.pullRequestPrecheckDone = false;
      if (record.pause.requestedAt !== undefined) {
        this.activatePause();
        return;
      }
      // Just before each phase starts, so the panel shows the account the next session will use (AC-WATCH-09).
      if (this.record.settings.agentId === "codex") await this.agents.refresh([this.sessionFolder, ...this.setUpRepositories.map((entry) => expandHome(entry.worktreePath))]);
      else { void this.claude?.refreshAccount(); await this.agents.refreshClaudeModels(); }
      if (this.stopping) return;
      const selectionError = this.record.settings.agentId === "claude_code" ? this.selectionIssue(true) : this.selectionError;
      if (selectionError) {
        this.current = undefined;
        this.recordStop(nextKey, "selection", [{ name: "Agent selection and readiness", passed: false, facts: [selectionError] }]);
        return;
      }
      if (this.record.settings.agentId === "codex") {
        mkdirSync(this.workspaceFolder, { recursive: true });
        try { await prepareCodexLaunch({ ...this.codexLaunchOptions(this.sessionFolder), choice: selectedChoice(this.record.settings) }); }
        catch (error) {
          if (this.stopping) return;
          this.current = undefined;
          this.recordStop(nextKey, "selection", [{ name: "Agent selection and readiness", passed: false, facts: [(error as Error).message] }]);
          return;
        }
      }
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

  auditActivity(key: string): AuditActivity | undefined { return this.record.completionAudits?.activities.find(a => auditKey(a) === key); }

  private admissionContext(): AdmissionContext {
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    return { record: this.record, stateDirectory: this.stateDirectory, git: { ...this.git, signal }, env: this.options.env, codex: this.options.tools.codex ?? "codex", signal, session: (activity, id) => this.sessionRecord(auditKey(activity), id) };
  }

  private async nextActivity(plan: PhasePlan): Promise<{ kind: "audit"; key: string; activity: AuditActivity } | { kind: "phase"; leaf: PlannedPhase } | { kind: "final"; leaf?: undefined } | { kind: "stopped"; key: string }> {
    await this.deliveryPending;
    const pending = this.record.completionAudits?.activities.findLast(a => !this.record.phases[auditKey(a)]?.doneAt);
    if (pending) { this.record.nextActivityKey = auditKey(pending); this.save(); return { kind: "audit", key: auditKey(pending), activity: pending }; }
    const leaf = this.nextExecutionLeaf(plan);
    if (leaf) { this.record.nextActivityKey = leaf.id; this.save(); return { kind: "phase", leaf }; }
    let kind: Awaited<ReturnType<typeof auditNext>>;
    try {
      // Finished audit origins retain their development obligations after a first grant.
      if (deliveryEnabled(this.record)) for (const activity of this.record.completionAudits?.activities ?? []) {
        const check = ownerDeliveryCheck(this.deliveryContext(auditKey(activity)), { kind: "audit", activityId: activity.activityId });
        if (!check.passed) { this.recordStop(auditKey(activity), "done_check", [check]); return { kind: "stopped", key: auditKey(activity) }; }
      }
      kind = await auditNext(this.admissionContext());
      if (kind === "final_delivery") { this.record.nextActivityKey = PR_PHASE_KEY; this.save(); return { kind: "final" }; }
      const activity = await this.allocateAudit(kind === "continue_test" ? "test_audit" : kind, kind === "continue_test");
      return { kind: "audit", key: auditKey(activity), activity };
    } catch (error) {
      const key = this.record.completionAudits?.activities.at(-1) ? auditKey(this.record.completionAudits.activities.at(-1)!) : PR_PHASE_KEY;
      this.recordStop(key, "selection", [{ name: "Completion audit readiness", passed: false, facts: [(error as Error).message] }]);
      return { kind: "stopped", key };
    }
  }

  private async allocateAudit(kind: AuditKind, continuation = false): Promise<AuditActivity> {
    const skill = await resolveAuditSkill({ kind, agent: this.record.settings.agentId, claude: this.options.tools.claude, ...(this.options.tools.codex ? { codex: this.options.tools.codex } : {}), cwd: this.sessionFolder, env: this.options.env, signal: this.abort.signal });
    this.activeCheck = "audit-allocation";
    const before = structuredClone(this.record);
    try {
      const state = this.record.completionAudits!;
      const predecessor = continuation ? state.activities.findLast(a => a.kind === "test_audit") : undefined;
      if (continuation && (!predecessor || acceptedAudit(this.stateDirectory, predecessor)?.report.outcome !== "continue_test" || !this.record.phases[auditKey(predecessor)]?.doneAt)) throw new Error("A test continuation requires its settled accepted predecessor.");
      const id = randomUUID(); const at = this.now().toISOString();
      const observed = observeActivity(this.record, this.stateDirectory, `audit-${id}`, kind, at, id);
      const activity: AuditActivity = { activityId: id, sequence: observed.sequence, kind, round: predecessor?.round ?? Math.max(0, ...state.activities.filter(a => a.kind === kind).map(a => a.round)) + 1, continuationIndex: predecessor ? predecessor.continuationIndex + 1 : 1, createdAt: at, sessionIds: [], reportPath: `${this.record.prdDirectory}/kiln-audit-${id}.json`, skill, snapshots: [], attempts: [] };
      state.activities.push(activity); this.record.nextActivityKey = auditKey(activity);
      this.record.phases[auditKey(activity)] = { sessionIds: [], finishedByPerson: false, repositories: {} };
      const context = this.admissionContext();
      const initial = await captureSnapshot({ ...context, activity, evidence: [], now: at }, [], []);
      activity.snapshots.push(new AuditStore(this.stateDirectory).put(initial));
      if (predecessor) assignAuditObligations(this.deliveryContext(auditKey(activity)), predecessor.activityId, { kind: "audit", activityId: activity.activityId }, acceptedAudit(this.stateDirectory, predecessor)!.report.nextTestBatch!.criterionKeys);
      state.revision++;
      this.save(); return activity;
    } catch (error) { for (const key of Object.keys(this.record)) delete (this.record as unknown as Record<string, unknown>)[key]; Object.assign(this.record, before); throw error; }
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

  auditPrompt(activity: AuditActivity): string {
    // Include the latest test record even when a delivery reassessment intervened.
    // Grades remain history: this activity independently reassesses all current rows.
    const history = this.record.completionAudits!.activities.filter(a => a.sequence < activity.sequence && a.acceptedResult);
    const previous = [history.findLast(a => a.kind === "delivery_audit"), history.findLast(a => a.kind === "test_audit")].filter((a): a is AuditActivity => !!a).sort((a, b) => a.sequence - b.sequence);
    return auditSessionPrompt({ label: auditLabel(activity.kind), skillName: activity.skill.name, skillPath: activity.skill.path, executionId: this.record.executionId!, activityId: activity.activityId, round: activity.round, continuationIndex: activity.continuationIndex, reportPath: activity.reportPath, prdFile: this.pathFrom(this.sessionFolder, this.prdFile()), repositories: this.promptRepositories(this.setUpRepositories), branch: this.record.settings.featureBranch, cli: `${JSON.stringify(process.execPath)} ${JSON.stringify(fileURLToPath(new URL("../cli.js", import.meta.url)))}`, deliveryAuthority: this.deliveryAuthority(), ...(previous.length ? { previous: previous.map(a => acceptedAudit(this.stateDirectory, a)!.result.reportBytes).join("\n\n") } : {}) });
  }

  private emitAudit(activity: AuditActivity, event: "started" | "stopped" | "done" | "interrupted" | "resumed" | "waiting", limit?: { label: string; resetsAt?: string }): void {
    this.emit({ kind: "audit", at: this.now(), activityId: activity.activityId, label: auditLabel(activity.kind), round: activity.round, continuationIndex: activity.continuationIndex, event, ...(limit ? { limit } : {}) });
  }

  private async auditDoneCheck(key: string): Promise<DoneCheckOutcome> {
    await this.deliveryPending; await this.additionChain; this.activeCheck = key;
    let before: PrdRecord | undefined;
    try {
      const plan = await this.readPlan();
      if (!plan.ok) throw new CompletionCheckUnavailable(plan.problem);
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
        if (!activity.acceptedResult) {
          const result = await submitAudit(context, { executionId: this.record.executionId, activityId: activity.activityId, revision: this.record.completionAudits!.revision, reportPath: activity.reportPath });
          if (result.refusal && (result.refusal.status === 503 || result.refusal.code === "evidence_unavailable")) throw new CompletionCheckUnavailable(result.refusal.reason);
          checks.push(...result.checks);
        } else {
          let accepted: NonNullable<ReturnType<typeof acceptedAudit>>;
          try { accepted = acceptedAudit(this.stateDirectory, activity)!; }
          catch (error) { throw new CompletionCheckUnavailable((error as Error).message); }
          checks.push({ name: "Audit result recorded", passed: true, facts: [`Accepted ${activity.reportPath}: ${accepted.report.outcome}.`] });
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
      this.save();
      return this.withCodexSafety(key, { passed: checks.every(c => c.passed), checks, plan, judgedLeafId: key });
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
    if (!this.record.completedAt) {
      const read = await this.readPlan();
      if (!read.ok) { outcome.checks.push(planCheck(read)); outcome.passed = false; return; }
    }
    if (this.record.completedAt && this.record.completionAudits?.policy === "legacy_complete") return;
    try {
      const baseline = this.record.planReconciliation?.baselineId;
      const next = await auditNext(this.admissionContext());
      if (!this.record.completedAt) {
        const read = await this.readPlan();
        if (!read.ok) { outcome.checks.push(planCheck(read)); outcome.passed = false; return; }
      }
      if (next === "final_delivery" && !nextLeaf(this.plan!) && baseline === this.record.planReconciliation?.baselineId) return;
      outcome.checks.push({ name: "Current completion audits", passed: false, facts: [`${next === "final_delivery" ? "Implementation" : auditLabel(next === "continue_test" ? "test_audit" : next)} is required before final completion.`] });
    } catch (error) { outcome.checks.push({ name: "Current completion audits", passed: false, facts: [(error as Error).message] }); }
    outcome.passed = false;
  }

  private async runPhaseSession(leafId: string): Promise<"done" | "stopped"> {
    const { record } = this;
    record.phases[leafId] ??= { sessionIds: [], finishedByPerson: false, repositories: {} };
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
    return { record: this.record, stateDirectory: this.stateDirectory, git: this.git, env: this.options.env, signal: this.abort.signal, codex: this.options.tools.codex, sessionId: this.record.preparation && this.latestSession(this.record.preparation.phaseId)?.sessionId, transcriptPath: this.record.preparation ? findTranscripts(claudeConfigFolder(this.options.env), this.latestSession(this.record.preparation.phaseId)?.sessionId ?? "").main : undefined, authorizeCommands: () => this.authorizePreparationCommands(), save: () => { this.writeContinuationMetadata(() => this.save()); this.changed(); }, now: () => this.now().toISOString() };
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
    if (this.record.pause.requestedAt || this.record.pause.activeSince) throw new Error("The pause control holds dependent implementation.");
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
      if (this.record.pause.requestedAt || this.record.pause.activeSince) { if (!this.record.pause.activeSince) this.activatePause(); return { kind: "stopped" }; }
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
        if (this.record.pause.requestedAt || this.record.pause.activeSince || this.stopping) return false;
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
    this.record.phases[PR_PHASE_KEY] ??= { sessionIds: [], finishedByPerson: false, repositories: {} };
    const prompt = pullRequestSessionPrompt(await this.pullRequestPromptValues(this.sessionFolder));
    this.emit({ kind: "pull_request", at: this.now(), event: "started" });
    await this.launchSession(PR_PHASE_KEY, "pull_request", prompt);
    return this.settleSession(PR_PHASE_KEY);
  }

  /**
   * Launches one session for a phase. The session record is written before spawning; a session
   * recorded but never started (Kiln stopped in between) is launched as planned, same ID.
   */
  private async launchSession(phaseKey: string, kind: SessionRecord["kind"], prompt: string): Promise<void> {
    const facts = this.record.phases[phaseKey]!;
    const audit = this.auditActivity(phaseKey);
    observeActivity(this.record, this.stateDirectory, phaseKey, audit?.kind ?? (kind === "pull_request" ? "final_delivery" : "implementation"), this.now().toISOString(), audit?.activityId);
    // A session launch waits for an addition under way, so it gets the workspace as it ends.
    await this.additionChain;
    let session = this.latestSession(phaseKey);
    if (!session || session.runs.length > 0) {
      const { model } = selectedChoice(this.record.settings);
      const entry = this.modelEntry(model);
      // A model that takes no effort gets no --effort, and its record says so (UI-011).
      const effort = entry !== undefined && !entry.supportsEffort ? undefined : selectedChoice(this.record.settings).effort;
      session = {
        schemaVersion: SCHEMA_VERSION,
        executionId: this.record.executionId!,
        outputGeneration: randomUUID(),
        agentId: this.record.settings.agentId,
        sessionId: randomUUID(),
        phaseId: audit ? "" : phaseKey,
        ...(audit ? { activityId: audit.activityId } : {}),
        kind,
        createdAt: this.now().toISOString(),
        model,
        modelDisplayName: entry?.displayName ?? modelNameFromId(model),
        ...(effort === undefined ? {} : { effort }),
        workingDirectory: this.sessionFolder,
        runs: [],
        sleeps: [],
        steps: [],
      };
      writeSessionRecord(this.options.stateDirectory, session);
      facts.sessionIds.push(session.sessionId);
      if (audit) audit.sessionIds.push(session.sessionId);
      this.save();
    }
    const cwd = this.workingDirectoryOf(session);
    await this.runProcess(phaseKey, session, launchArguments(session.sessionId, session.model, session.effort, this.addDirs(cwd)), prompt, "launch", cwd);
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
    const session = this.latestSession(phaseKey);
    if (!session) return;
    const priorInspectionOwner = this.inspectionResumingSession;
    this.inspectionResumingSession = session.sessionId;
    try {
    if (this.record.liveControl) {
      try { await this.requireTakeoverReturn(); }
      catch (error) { this.checking = false; this.record.liveControl.takeover.reason = (error as Error).message; this.save(); return; }
    } else await this.stopLiveProcess(session);
    if (this.stopping) return;
    const reconciled = await this.readPlan();
    if (!reconciled.ok) {
      this.checking = false;
      if (!this.record.phases[phaseKey]?.stop && !this.record.phases[phaseKey]?.wait) this.recordStop(phaseKey, phaseKey === PR_PHASE_KEY ? "pull_request_check" : "done_check", [planCheck(reconciled)]);
      this.current = undefined; this.changed(); return;
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
    const prompt = resumePrompt({
      deliveryAuthority: this.deliveryAuthority(),
      agentId: session.agentId ?? "claude_code",
      ...(refusal !== undefined && endedOnItsOwn ? { usageLimit: label === UNKNOWN_LIMIT_LABEL || label === undefined ? "" : limitSentence(label) } : {}),
      ...(endedOnItsOwn ? { endedOnItsOwn: true } : recorded ? { cause: run.interruptedBy! } : {}),
      time: time.replace(/\.\d+Z$/, "Z"),
      ...(auditTask ? { auditTask } : phaseKey === PR_PHASE_KEY ? {} : { phaseDoc: this.pathFrom(cwd, `${this.paths.prdDirectoryFromRoot}/${this.fileOf(phaseKey) ?? ""}`) }),
      multiRepository: phaseKey === PR_PHASE_KEY ? this.pullRequestRepositories().length > 1 : multi,
      ...(request?.note === undefined ? {} : { note: request.note }),
    });
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
    if (this.record.preparation?.phaseId === phaseKey && this.record.preparation.stage !== "implementation") {
      for (const attempt of this.record.preparation.attempts.filter(preparationAttemptNeedsReconciliation)) { await reconcilePreparationAttempt(attempt); attempt.outcome = "interrupted"; attempt.reason = "Explicit preparation recovery; investigate external effects before a new submission."; }
      this.record.preparation.stage = "preparation"; this.record.preparation.submissions = []; delete this.record.preparation.verifiedCheckpoint; if (!await this.preparePolicyForTurn(phaseKey)) return; this.save();
    }
    const actualPrompt = this.record.preparation?.phaseId === phaseKey && this.record.preparation.stage !== "implementation" ? this.preparationTask(request?.note) : prompt;
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
        const reason = inspection.readinessError ?? (cause === "launch" ? this.selectionIssue(true) : this.agents.state.blockers.length ? this.agents.state.blockers.join(" ") : undefined) ?? (inspection.summary.route === "metered" && !inspection.summary.approved ? "Review and approve this billing setup, or change its source and recheck." : undefined);
        if (reason) { this.holdBilling(phaseKey, session, cause, inspection.summary, reason); return; }
        this.billingLaunch = structuredClone(inspection.summary);
        this.record.billing!.lastLaunch = this.billingLaunch;
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
    if (this.commands.blocked || this.stopping || session.agentId !== "codex" && started?.() === false) return;
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
      const version = await runHelper(this.options.tools.claude, ["--version"], { cwd, env: launchEnv, timeoutMs: 5000 });
      if (version.exitCode === 0 && /^2\.1\.311(?:\s|$)/.test(version.stdout)) {
        const attemptId = dispatchedControl!.attempt_id!;
        const activity = activityHistory(this.record, this.stateDirectory).findLast(a => a.key === phaseKey)!;
        const target: LiveTarget = { executionId: this.record.executionId!, activityId: activity.activityId, activityKey: phaseKey, sessionId: session.sessionId, providerSessionId: session.sessionId, attemptId };
        const directory = gateDirectory(this.stateDirectory, attemptId);
        createGate(directory, target);
        live = { attemptId, gateDirectory: directory, configRoot: claudeConfigFolder(launchEnv), profile: "2.1.311/darwin", literalInput: true };
        const hooks = Object.fromEntries(["PreToolUse", "PostToolUse", "PostToolUseFailure", "PostToolBatch"].map(event => [event, [{ hooks: [{ type: "command", command: process.execPath, args: [fileURLToPath(new URL("../live/checkpoint-hook.js", import.meta.url)), directory], timeout: 10, onFailure: "block" }] }]]));
        args = [...args, "--replay-user-messages", "--settings", JSON.stringify({ hooks })];
      }
    }
    if (this.record.liveControl) {
      try { await this.requireTakeoverReturn(); }
      catch (error) { this.checking = false; this.record.liveControl.takeover.reason = (error as Error).message; this.save(); return; }
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
      ...(live ? { live, onLiveEvent: (event: Record<string, unknown>, at: string) => this.observeLiveMessage(readGate(live.gateDirectory).target, event, at), onLiveExit: () => this.endLiveMessages(liveExitTarget!) } : {}),
      ...(this.record.liveControl ? { beforePrompt: async (identity: { pid: number; startTime: string }) => {
        const local = this.takeoverLocalMaterial(phaseKey);
        if (await this.takeoverBecameComplete(phaseKey)) throw new TakeoverAlreadyComplete();
        await requireNoTerminal(launchEnv, session.sessionId, identity);
        if (local !== this.takeoverLocalMaterial(phaseKey)) {
          if (await this.takeoverBecameComplete(phaseKey)) throw new TakeoverAlreadyComplete();
          throw new CompletionCheckUnavailable("Activity material changed before the first prompt. Retry hand-back.");
        }
        // Final synchronous admission after the async checks, using this dispatch's profile.
        requireHistory(launchEnv, session.sessionId);
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
      onRecordChange: () => { this.observeControlDispatch(session); this.changed(); },
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
    receipt.effects.session = "resumed";
    if (receipt.reply_text !== null) receipt.effects.reply = run.control.delivered ? "delivered" : "submitted";
    this.commands.checkpoint(receipt);
    this.commands.finishAutomatic(receipt);
    this.controlDispatch = undefined;
  }

  private holdBilling(phaseKey: string, session: SessionRecord, cause: SessionRun["cause"], observed: BillingSummary, reason: string): void {
    this.record.billing!.hold = { phaseKey, action: cause === "launch" ? "launch" : "resume", sessionId: session.sessionId, reason, observed: structuredClone(observed), at: this.now().toISOString() };
    this.checking = false; this.current = undefined; this.unwatchWait();
    this.save(); this.updateKeepAwake(); this.changed();
    this.emit({ kind: "message", text: `Billing hold: ${reason} Open Kiln's browser address above to review billing and continue.` });
  }

  private codexLaunchOptions(cwd: string) {
    const candidates = [cwd, ...this.addDirs(cwd)];
    // Codex removes nested grants from its effective profile. Request the same minimal
    // roots: the workspace and only assigned worktrees outside it, never their checkouts.
    const writableRoots = candidates.filter((path, index) => !candidates.some((other, otherIndex) => index !== otherIndex && isWithin(comparable(realPathOfNearestAncestor(path)), comparable(realPathOfNearestAncestor(other)))));
    return {
      executable: this.options.tools.codex!, cwd, writableRoots,
      repositories: this.setUpRepositories.map(entry => ({ path: expandHome(entry.worktreePath), branch: this.record.settings.featureBranch })),
      env: this.sessionEnv(), signal: this.abort.signal,
    };
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
        beforeStart: async () => {
          await this.recheckPreparationAdmission(current.phaseKey, session);
          if (this.stopping || started?.() === false) throw new CodexLaunchCancelled("Codex launch authorization was withdrawn.");
          if (started) this.save();
        },
        onBilling: summary => {
          this.record.billing!.lastLaunch = structuredClone(summary);
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
        onRecordChange: () => { this.observeControlDispatch(session); this.changed(); },
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
        this.recordStop(phaseKey, "selection", [{ name: "Codex launch settings", passed: false, facts: [run.codex.verificationFailure] }]);
        this.emitSessionEvent(phaseKey, "stopped");
        return { kind: "stopped" };
      }
      if (this.record.preparation?.phaseId === phaseKey && (this.record.preparation.stage !== "implementation" || !session?.runs[this.record.preparation.implementationRun!])) {
        if (!session || !run || run.interruptedAt || run.spawnError || !run.endedAt || run.exitCode !== 0) {
          this.recordStop(phaseKey, "done_check", [{ name: "Prerequisite preparation", passed: false, facts: ["The preparation turn did not settle successfully. Resume this preparation conversation; dependent implementation remains held."] }]);
          return { kind: "stopped" };
        }
        return this.advancePreparation();
      }
      const notResumable = session !== undefined && run !== undefined && run.cause !== "launch" && run.pid !== undefined && (session.agentId === "codex" ? this.transcriptMissing(session) : !runReportedInit(this.options.stateDirectory, session, runIndex));
      if (phaseKey === PR_PHASE_KEY) {
        const check = await this.pullRequestCheck(PR_PHASE_KEY);
        if (this.stopping) return { kind: "stopping" };
        if (check.passed) {
          this.complete(check.pullRequests!, byPerson, check.mergedBranches);
          return { kind: "complete" };
        }
        if (this.finalNeedsAudits(check)) return { kind: "done", judgedId: PR_PHASE_KEY };
        if (!notResumable && run?.limitRefusal !== undefined) return this.settleRefused(PR_PHASE_KEY, session!, runIndex, check.checks);
        this.recordStop(PR_PHASE_KEY, notResumable ? "not_resumable" : "pull_request_check", check.checks);
        this.emit({ kind: "pull_request", at: this.now(), event: "stopped" });
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
      this.emitSessionEvent(phaseKey, "stopped");
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
    if (phaseKey === PR_PHASE_KEY) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return { kind: "stopping" };
      if (this.finalNeedsAudits(check)) return { kind: "done", judgedId: PR_PHASE_KEY };
      if (!check.passed) return !this.codexSafetyProblems(phaseKey).length && this.canResumeCodex(phaseKey) ? { kind: "resume" } : this.stopInterrupted(PR_PHASE_KEY, "pull_request_check", check.checks);
      this.complete(check.pullRequests!, false, check.mergedBranches);
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
    if (phaseKey === PR_PHASE_KEY) this.emit({ kind: "pull_request", at: this.now(), event: "stopped" });
    else if (this.auditActivity(phaseKey)) this.emitAudit(this.auditActivity(phaseKey)!, "stopped");
    else {
      const judged = this.judgedId(phaseKey);
      this.emit({ kind: "phase", at: this.now(), phaseId: judged, title: this.titleOf(judged), event: "stopped" });
    }
    return { kind: "stopped" };
  }

  /** Check again, or `kiln run` on a stopped phase: the stop's own check, run again. */
  private async recheckStop(phaseKey: string): Promise<"done" | "complete" | "cleared" | "still_stopped"> {
    const facts = this.record.phases[phaseKey]!;
    const hold = this.record.billing?.hold;
    if (hold?.phaseKey === phaseKey) {
      if (this.latestSession(phaseKey)?.runs.length) {
        const outcome = phaseKey === PR_PHASE_KEY ? await this.pullRequestCheck(phaseKey) : await this.doneCheck(phaseKey);
        if (outcome !== "stopping" && "unavailable" in outcome && outcome.unavailable) {
          if (facts.stop) this.updateStop(phaseKey, outcome.checks); else this.recordStop(phaseKey, "done_check", outcome.checks);
          throw new CompletionCheckUnavailable(outcome.unavailable);
        }
        if (outcome !== "stopping" && outcome.passed) {
          delete this.record.billing!.hold;
          if (phaseKey === PR_PHASE_KEY) { const final = outcome as Awaited<ReturnType<Engine["pullRequestCheck"]>>; this.complete(final.pullRequests!, true, final.mergedBranches); return "complete"; }
          await this.recordDone(phaseKey, outcome as DoneCheckOutcome, true); return "done";
        }
        return "still_stopped";
      }
      await this.billing.refresh(this.billingCwd, this.sessionEnv(), [], true);
      if (!this.billing.view.canLaunch) return "still_stopped";
      delete this.record.billing!.hold; this.save(); return "cleared";
    }
    const stop = facts.stop!;
    const latest = this.latestSession(phaseKey);
    if (latest?.agentId === "codex") await this.stopLiveProcess(latest);
    if (stop.kind === "selection") {
      await this.agents.refresh([this.sessionFolder, ...this.setUpRepositories.map((entry) => expandHome(entry.worktreePath))]);
      if (this.stopping) return "still_stopped";
      const issue = this.selectionError;
      if (issue) {
        this.updateStop(phaseKey, [{ name: "Agent selection and readiness", passed: false, facts: [issue] }]);
        return "still_stopped";
      }
      delete facts.stop;
      if (facts.sessionIds.length === 0 && !this.auditActivity(phaseKey)) delete this.record.phases[phaseKey];
      this.save();
      return "cleared";
    }
    if (stop.kind === "plan") {
      const read = await this.readPlan();
      if (!read.ok) {
        this.updateStop(phaseKey, [planCheck(read)]);
        return "still_stopped";
      }
      // A repository the phase names that the workspace lacks is tried again (multi-repo AC-ADD-04).
      const leaf = this.nextExecutionLeaf(read.plan);
      if (leaf && leaf.id === phaseKey) {
        const added = await this.addNamedRepositories(leaf, read.plan);
        if (!added.ok) {
          this.updateStop(phaseKey, [{ name: CHECK_NAMES.plan, passed: false, facts: added.facts }]);
          return "still_stopped";
        }
      }
      // The plan reads again. Nothing ran, so nothing is marked Done; the loop goes round again.
      delete facts.stop;
      if (facts.sessionIds.length === 0 && !this.auditActivity(phaseKey)) delete this.record.phases[phaseKey];
      this.save();
      return "cleared";
    }
    const activation = this.record.developmentAuthorization?.activationRecovery;
    if (activation && recoveryStopKey(activation) === phaseKey && facts.sessionIds.length === 0) {
      // There is no conversation to resume yet. After the original plan/readiness
      // blocker clears, the ordinary launch supplies the bounded recovery session.
      delete facts.stop; this.save(); return "cleared";
    }
    if (phaseKey === PR_PHASE_KEY) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return "still_stopped";
      if (check.passed) {
        this.complete(check.pullRequests!, true, check.mergedBranches);
        return "complete";
      }
      if (this.finalNeedsAudits(check)) return "done";
      this.updateStop(phaseKey, check.checks);
      return "still_stopped";
    }
    const outcome = await this.doneCheck(phaseKey);
    if (outcome === "stopping" || this.stopping) return "still_stopped";
    if (outcome.unavailable) { this.updateStop(phaseKey, outcome.checks); throw new CompletionCheckUnavailable(outcome.unavailable); }
    if (!outcome.passed) {
      this.updateStop(phaseKey, outcome.checks);
      return "still_stopped";
    }
    if (!this.auditActivity(phaseKey)) delete facts.stop;
    await this.recordDone(phaseKey, outcome, true);
    return "done";
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
      if (this.record.preparation?.phaseId === phaseKey && (this.record.preparation.stage !== "implementation" || !this.latestSession(phaseKey)?.runs[this.record.preparation.implementationRun!])) { outcome.passed = false; outcome.checks.push({ name: "Prerequisite preparation", passed: false, facts: [this.record.preparation.reason ?? "Preparation and the engine-owned verification checkpoint must pass before dependent implementation."] }); }
      return this.withCodexSafety(phaseKey, outcome);
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
        await this.requireCurrentAudits(outcome); ledger(this.record).currentComplete = outcome.passed; this.save(); return outcome;
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
          git: this.git,
          worktreePath: expandHome(entry.worktreePath),
          completedCommits: Object.entries(this.record.phases).filter(([key, facts]) => key !== PR_PHASE_KEY && facts.doneAt).flatMap(([, facts]) => facts.repositories[entry.name]?.pushedSha ? [facts.repositories[entry.name]!.pushedSha!] : []),
          signal: this.abort.signal,
        })),
      );
      await this.requireCurrentAudits(outcome);
      return this.withCodexSafety(PR_PHASE_KEY, outcome);
    } finally {
      if (phaseKey !== undefined) this.activeCheck = undefined;
    }
  }

  private async recordDone(phaseKey: string, outcome: DoneCheckOutcome, byPerson: boolean, acceptManual = false, takeoverMaterial?: string): Promise<void> {
    if (this.record.liveControl && !acceptManual) throw new CompletionCheckUnavailable("Takeover holds completion until explicit hand-back.");
    const facts = this.record.phases[phaseKey]!;
    const finalTakeoverCheck = async () => {
      if (!this.record.liveControl || !acceptManual) return;
      if (takeoverMaterial === undefined || takeoverMaterial !== await this.takeoverMaterial(phaseKey)) throw new CompletionCheckUnavailable("Completion evidence changed during hand-back. Retry Verify for fresh results.");
      const local = this.takeoverLocalMaterial(phaseKey);
      await this.requireTakeoverReturn();
      if (local !== this.takeoverLocalMaterial(phaseKey)) throw new CompletionCheckUnavailable("Local completion evidence changed during final ownership admission. Retry Verify.");
    };
    const clearManualStop = () => {
      if (!acceptManual) return;
      delete facts.stop;
      delete facts.wait;
      if (this.record.billing?.hold?.phaseKey === phaseKey) delete this.record.billing.hold;
    };
    // Backfilling development assessments does not rewrite historical completion/push facts.
    if (facts.doneAt && this.record.developmentAuthorization?.activationRecovery && !this.auditActivity(phaseKey)) { clearManualStop(); this.save(); return; }
    const audit = this.auditActivity(phaseKey);
    if (audit) {
      if (facts.doneAt) { const stop = facts.stop; delete facts.stop; try { this.save(); } catch (error) { if (stop) facts.stop = stop; throw error; } return; }
      const before = structuredClone(this.record);
      try {
        const accepted = acceptedAudit(this.stateDirectory, audit)!;
        if (outcome.plan.ok) this.record.plan = recordedPlan(outcome.plan.plan);
        for (const phase of accepted.report.completionPhases) assignAuditObligations(this.deliveryContext(phaseKey), audit.activityId, { kind: "phase", phaseId: phase.id }, phase.criterionKeys);
        for (const entry of this.setUpRepositories) {
          const head = await localBranchCommit(this.git, expandHome(entry.worktreePath), this.record.settings.featureBranch);
          if (!head) throw new Error(`Cannot record settled audit head for ${entry.name}.`);
          const repository = facts.repositories[entry.name] ??= { startCommit: head };
          repository.pushedSha = head;
          const count = await firstParentCount(this.git, expandHome(entry.worktreePath), repository.startCommit, head);
          if (count !== undefined) repository.commitCount = count;
        }
        await finalTakeoverCheck();
        facts.doneAt ??= this.now().toISOString(); facts.finishedByPerson = byPerson; delete facts.stop;
        if (this.commands?.active) facts.completedByOperation = this.commands.active.id;
        this.save();
      } catch (error) { Object.assign(this.record, before); throw error; }
      this.emitAudit(audit, "done"); return;
    }
    const shas = outcome.pushedShas!;
    const repositories = structuredClone(facts.repositories);
    const pushes: { name: string; sha: string }[] = [];
    for (const entry of this.setUpRepositories) {
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
    facts.repositories = repositories;
    facts.doneAt ??= this.now().toISOString();
    facts.finishedByPerson = byPerson;
    if (this.commands?.active) facts.completedByOperation = this.commands.active.id;
    clearManualStop();
    this.save();
    const prdSha = shas[this.paths.repositoryName]!;
    // The done line lists the code repositories in list order, then the PRD's repository.
    const ordered = [...pushes.filter((push) => push.name !== this.paths.repositoryName), ...pushes.filter((push) => push.name === this.paths.repositoryName)];
    this.emit({
      kind: "phase",
      at: this.now(),
      phaseId: outcome.judgedLeafId,
      title: this.titleOf(outcome.judgedLeafId),
      event: "done",
      pushedSha: prdSha,
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
          ranges: Object.entries(this.record.phases).filter(([key, facts]) => key !== PR_PHASE_KEY && facts.doneAt).flatMap(([key, facts]) => {
            const receipt = facts.repositories[entry.name];
            if (receipt && (!receipt.startCommit || !receipt.pushedSha)) missingRanges.push(`Phase ${key} has an incomplete recorded commit range.`);
            return receipt?.startCommit && receipt.pushedSha ? [{ start: receipt.startCommit, end: receipt.pushedSha }] : [];
          }),
          ...(entry.baseCommit && merged ? { baseHistory: { start: entry.baseCommit, end: merged.baseCommit, branch: entry.baseBranch } } : {}),
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

  private complete(pullRequests: PullRequestFacts[], byPerson: boolean, mergedBranches: MergedBranchFacts[] = []): void {
    const { record } = this;
    const facts = (record.phases[PR_PHASE_KEY] ??= { sessionIds: [], finishedByPerson: false, repositories: {} });
    const at = this.now().toISOString();
    delete facts.stop;
    facts.doneAt ??= at;
    facts.finishedByPerson = byPerson;
    record.pullRequests = pullRequests;
    if (mergedBranches.length) record.mergedBranches = mergedBranches;
    else delete record.mergedBranches;
    record.completedAt ??= at;
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
      ...(deliveryEnabled(record) ? { summary: developmentDeliverySummary(record) } : {}),
      ...(mergedBranches.length ? { summary: [...pullRequests.map(pull => `${pull.repository} #${pull.number} ready`), ...mergedBranches.map(branch => `${branch.repository} already merged into ${branch.base}`)].join(" · ") } : {}),
      ...(this.setUpRepositories.length > 1 ? { opened: pullRequests.map((pull) => ({ repository: pull.repository, number: pull.number })) } : {}),
    });
  }

  private activatePause(): void {
    this.record.pause.activeSince = this.now().toISOString();
    this.current = undefined;
    this.save();
  }

  private recordStop(phaseKey: string, kind: StopKind, checks: CheckResult[], interrupted?: PhaseStop["interrupted"], limit?: StopLimit, checkedAt?: string): void {
    // A real stop replaces the overview with its own recovery controls.
    if (this.restartReview) { this.restartReview = undefined; this.reviewingRestart = false; }
    if (deliveryEnabled(this.record)) ledger(this.record).currentComplete = false;
    const at = this.now().toISOString();
    const facts = (this.record.phases[phaseKey] ??= { sessionIds: [], finishedByPerson: false, repositories: {} });
    facts.stop = { kind, at, checks, checkedAt: checkedAt ?? at, ...(interrupted === undefined ? {} : { interrupted }), ...(limit === undefined ? {} : { limit }) };
    this.save();
    this.readStoppedCommits(phaseKey);
    // The account card shows a reading taken after the refusal (usage-limit recovery AC-LIMIT-03).
    if (limit !== undefined) this.askReading();
  }

  private updateStop(phaseKey: string, checks: CheckResult[]): void {
    const stop = this.record.phases[phaseKey]!.stop!;
    stop.checks = checks;
    stop.checkedAt = this.now().toISOString();
    this.save();
    this.readStoppedCommits(phaseKey);
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
  }

  /**
   * A plan that doesn't read when no session has run since the last read: a `plan` stop on the
   * first leaf not closed in the recorded plan, or on the pull request when every leaf there is.
   */
  private recordPlanStop(problem: string): { kind: "plan_stop"; phaseKey: string } {
    const key = this.nextKeyFromRecordedPlan();
    this.current = undefined;
    this.recordStop(key, "plan", [{ name: CHECK_NAMES.plan, passed: false, facts: [problem] }]);
    if (key === PR_PHASE_KEY) this.emit({ kind: "pull_request", at: this.now(), event: "stopped" });
    else this.emit({ kind: "phase", at: this.now(), phaseId: key, title: this.titleOf(key), event: "stopped" });
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
    if (session.agentId === "codex") {
      if (this.record.settings.resumeAfterUsageLimit && !this.codexSafetyProblems(phaseKey).length && !this.transcriptMissing(session)) {
        this.recordWait(phaseKey, session, runIndex, checks);
        return { kind: "waiting" };
      }
      this.recordStop(phaseKey, kind, checks, undefined, limit);
      this.emitSessionEvent(phaseKey, "stopped");
      return { kind: "stopped" };
    }
    if (run.cause === "limit_resume" && this.refusedAgain(session, runIndex)) {
      this.recordStop(phaseKey, kind, checks, undefined, { ...limit, refusedAgainAt: run.startedAt });
      this.emitSessionEvent(phaseKey, "stopped");
      return { kind: "stopped" };
    }
    if (this.record.settings.resumeAfterUsageLimit && !this.transcriptMissing(session)) {
      this.recordWait(phaseKey, session, runIndex, checks);
      return { kind: "waiting" };
    }
    this.recordStop(phaseKey, kind, checks, undefined, limit);
    this.emitSessionEvent(phaseKey, "stopped");
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
    const refusal = this.refusedRun(phaseKey)?.refusal;
    delete facts.wait;
    this.unwatchWait();
    this.recordStop(phaseKey, phaseKey === PR_PHASE_KEY ? "pull_request_check" : "done_check", checks, undefined, refusal ? stopLimit(refusal) : undefined, checkedAt);
    this.emitSessionEvent(phaseKey, "stopped");
    this.updateKeepAwake();
  }

  /**
   * The wait's check: at `kiln run` (`restart`), at the end of a wait (`limit_resume`) or at
   * Resume now (`person_resume`). A pass is Done, finished by the person. A failure keeps the
   * wait, with these results, unless its transcript
   * is gone, or (except at Resume now) the setting is off: then it is Needs you.
   */
  private async recheckWait(phaseKey: string, mode: "restart" | ResumeRequest["cause"]): Promise<"done" | "complete" | "stopped" | "failed" | "stopping"> {
    const facts = this.record.phases[phaseKey]!;
    let checks: CheckResult[];
    if (phaseKey === PR_PHASE_KEY) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return "stopping";
      if (check.passed) {
        delete facts.wait;
        this.unwatchWait();
        this.complete(check.pullRequests!, true, check.mergedBranches);
        this.updateKeepAwake();
        return "complete";
      }
      if (this.finalNeedsAudits(check)) { delete facts.wait; this.unwatchWait(); return "done"; }
      checks = check.checks;
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
    if (settingOff || this.codexSafetyProblems(phaseKey).length || (session !== undefined && this.transcriptMissing(session))) {
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
  private async resumeWait(phaseKey: string, cause: ResumeRequest["cause"]): Promise<void> {
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
  }

  /** Starts watching the recorded wait in this run of Kiln: sleep, keep-awake, the reset reading and a reading now. */
  private watchWait(): void {
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
    if (refusal?.agentId === "codex") {
      const codexReading = this.agents.state.pending ? undefined : this.agents.state.account;
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
    if (this.record.settings.agentId === "codex") void this.agents.refresh();
    else void this.claude?.refreshAccount();
  }

  private codexReadingArrived(reading: AgentAccount): void {
    if (this.stopping || this.checking) return;
    const key = this.waitingPhaseKey() ?? this.limitStopKey();
    if (key === undefined) return;
    const found = this.refusedRun(key);
    if (!found || found.session.agentId !== "codex") return;
    if (Date.parse(reading.startedAt) < Date.parse(found.refusal.at)) { this.askReading(); return; }
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
    if (this.record.billing?.hold) return;
    if (this.stopping || this.checking) return;
    const key = this.waitingPhaseKey() ?? this.limitStopKey();
    if (key === undefined) return;
    const found = this.refusedRun(key);
    if (!found) return;
    const { session, refusal } = found;
    if (Date.parse(reading.startedAt) < Date.parse(refusal.at)) {
      this.askReading();
      return;
    }
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
      const outcome = await checkFields({
        git: this.git,
        paths: this.paths,
        settings,
        prdTree: this.options.prdTree ?? "",
        repositories,
        origins,
        multiRepository: repositories.length > 1,
        workspaceFixed: this.workspaceFixed,
      });
      if (run === this.fieldCheckRun) {
        this.fieldErrors = outcome.errors;
        this.baseErrors = outcome.baseErrors;
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
      const outcome = await addEntryWorktree(this.git, entry, branch, "then press Start again.");
      // A step stopped by Ctrl+C, a closed terminal or a signal hasn't failed: the record is kept.
      if (this.stopping) return { ok: false, error: "Kiln is stopping." };
      if (outcome.ok) {
        entry.setupCompletedAt = this.now().toISOString();
        delete entry.createdBranch;
        this.save();
        continue;
      }
      await undoEntry(this.git, entry, branch);
      for (const later of list.slice(list.indexOf(entry) + 1)) delete later.baseCommit;
      record.repositories = record.repositories.filter((candidate) => !entryHoldsNothing(candidate));
      delete record.startedAt;
      delete record.refinementConfirmedAt;
      this.save();
      this.startError = list.length > 1 ? `Couldn’t set up ${entry.name}’s worktree: ${outcome.error}` : `Couldn’t set up the worktree: ${outcome.error}`;
      this.emit({ kind: "message", text: this.startError });
      return outcome;
    }
    record.setupCompletedAt = this.now().toISOString();
    this.save();
    return { ok: true };
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
    const addition = this.additionChain.then(() => this.addOne(name, phaseKey));
    this.additionsUnderway.set(name, addition);
    this.additionChain = addition.then(
      () => this.additionsUnderway.delete(name),
      () => this.additionsUnderway.delete(name),
    );
    return addition;
  }

  /** Adds the repositories a phase about to start, or a split record above it, names that the workspace doesn't have (AC-ADD-04). */
  private async addNamedRepositories(leaf: PlannedPhase, plan: PhasePlan): Promise<{ ok: true } | { ok: false; facts: string[] }> {
    const names = namedRepositories(
      plan.phases.filter((phase) => phase.id === leaf.id || isAncestorOf(phase.id, leaf.id)),
      this.paths.repositoryName,
    ).filter((name) => !this.setUpRepositories.some((entry) => entry.name === name));
    for (const name of names) {
      const addition = this.additionChain.then(() => this.addOne(name, leaf.id));
      this.additionChain = addition.catch(() => undefined);
      const result = await addition;
      if (this.stopping) return { ok: true };
      if (!result.ok) return { ok: false, facts: [`${name}: ${result.reason}`] };
    }
    return { ok: true };
  }

  private async addOne(name: string, phaseKey: string): Promise<AddRepositoryResult> {
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

    // Check 1: found beside the PRD's repository, as the start checks find a named one.
    const found = await findRepository(this.git, this.parentFolder, name);
    if (!found.ok) return refuse422(found.problem);
    const worktreePath = join(this.workspaceFolder, name);

    // An unfinished entry: what Git has at its worktree path decides first.
    if (existing !== undefined) {
      const worktrees = await listWorktrees(this.git, existing.mainCheckoutPath);
      if (!worktrees.ok) return refuse422(worktrees.error);
      const target = comparable(realPathOfNearestAncestor(expandHome(existing.worktreePath)));
      const there = worktrees.worktrees.find((worktree) => comparable(worktree.path) === target);
      // Git refuses another add at a worktree left half made, even after its folder is deleted; Kiln removes nothing.
      if (there?.locked === "initializing") return refuse422(halfMadeMessage(existing, "then ask again."));
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
          return refuse422(`That branch already exists in ${name}. Kiln adds a repository only where ${branch} is free.`);
        }
      }
      // Check 3: the worktree path is new or empty, and not inside a checkout, this repository's or any of the PRD's.
      const pathError =
        (await checkWorktreePath(this.git, found.repository.mainCheckoutPath, worktreePath)) ??
        (await checkWorkspaceFolderPlacement(this.git, this.setUpRepositories, worktreePath));
      if (pathError) return refuse422(`Kiln can't make ${name}'s worktree at ${displayPath(worktreePath)}: ${pathError.replace(/ Choose (a new one|one outside it)\.$/, "")}`);
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
        if (baseBranch === "") return refuse422(`${name}'s origin has no develop and no default branch.`);
        baseCommit = origin.value.branches.get(baseBranch)!;
        const fetched = await fetchIfMissing(this.git, found.repository.mainCheckoutPath, baseBranch, baseCommit);
        if (fetched) return refuse422(fetched);
      }
      entry = existing ?? { name, kind: "added", mainCheckoutPath: found.repository.mainCheckoutPath, github: found.repository.github, baseBranch, worktreePath };
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
    const outcome = await addEntryWorktree(this.git, entry, branch, "then ask again.", !interrupted);
    if (this.stopping) return { ok: false, status: 409, reason: "Kiln is stopping." };
    if (!outcome.ok) {
      // A worktree Git left half made changes nothing: the person removes it as the message says.
      if (outcome.error !== halfMadeMessage(entry, "then ask again.")) {
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
    const { record } = this;
    const name = entry.name;
    entry.setupCompletedAt = this.now().toISOString();
    delete entry.createdBranch;
    // The finishing request's phase is the first whose session has the repository.
    entry.addedInPhase = phaseKey;
    entry.addedAt = this.now().toISOString();
    const facts = (record.phases[phaseKey] ??= { sessionIds: [], finishedByPerson: false, repositories: {} });
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
    const inside = (path: string, folder: string) => isWithin(comparable(realPathOfNearestAncestor(path)), comparable(realPathOfNearestAncestor(folder)));
    const dirs: string[] = [];
    const folder = this.workspaceFolder;
    if (comparable(realPathOfNearestAncestor(cwd)) !== comparable(realPathOfNearestAncestor(folder))) dirs.push(folder);
    for (const entry of this.setUpRepositories) {
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
    };
  }

  private checkedRepository(entry: RepositoryEntry): CheckedRepository {
    return {
      name: entry.name,
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
      return session.codex?.conversationUnavailable === true;
    }
    return !claudeHistoryAvailability(this.options.env, session.sessionId).available;
  }

  sessionRecord(phaseKey: string, sessionId: string): SessionRecord | undefined {
    return readSessionRecord(this.options.stateDirectory, phaseKey, sessionId);
  }

  latestSession(phaseKey: string): SessionRecord | undefined {
    const id = this.record.phases[phaseKey]?.sessionIds.at(-1);
    return id === undefined ? undefined : this.sessionRecord(phaseKey, id);
  }

  /** A run's last output time: its last saved event's arrival, or its start when it saved none. */
  runLastOutputAt(session: SessionRecord, runIndex: number): string | undefined {
    return runLastOutputAt(this.options.stateDirectory, session, runIndex);
  }

  /** Every output line of a session saved so far. */
  outputLines(session: SessionRecord): OutputLine[] {
    return readOutputLines(this.options.stateDirectory, session);
  }

  /** The phase that holds a Needs you stop, if any. */
  stoppedPhaseKey(): string | undefined {
    if (this.recoveredLive && this.current?.processRunning) return undefined;
    return this.record.liveControl && !this.current?.processRunning ? this.record.liveControl.takeover.target.activityKey : this.record.billing?.hold?.phaseKey ?? Object.entries(this.record.phases).find(([, facts]) => facts.stop !== undefined)?.[0];
  }

  isPhaseDone(phaseKey: string): boolean {
    return phaseKey === PR_PHASE_KEY ? this.record.completedAt !== undefined : this.record.phases[phaseKey]?.doneAt !== undefined;
  }

  /** The first leaf not closed in the recorded plan, or `pr` when every leaf there is closed. */
  nextKeyFromRecordedPlan(): string {
    const pending = this.record.completionAudits?.activities.findLast(a => !this.record.phases[auditKey(a)]?.doneAt);
    return pending ? auditKey(pending) : recordedLeaves(this.record.plan ?? []).find((phase) => !phase.closed)?.id ?? this.record.nextActivityKey ?? PR_PHASE_KEY;
  }

  /** The leaf a launched leaf's session is shown as: its first leaf after a split, else itself. */
  judgedId(launchedId: string): string {
    if (launchedId === PR_PHASE_KEY) return launchedId;
    return judgedPhase(this.record.plan ?? [], launchedId)?.id ?? launchedId;
  }

  titleOf(phaseId: string): string {
    const audit = this.auditActivity(phaseId);
    return audit ? auditLabel(audit.kind) : this.record.plan?.find((phase) => phase.id === phaseId)?.title ?? phaseId;
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
      const active = observePlan(this.worktreePath, this.paths.prdDirectoryFromRoot);
      // Once set up, the assigned worktree owns this execution's documents.
      // Other checkouts are considered only by completed-run discovery.
      if (!previous) for (const [key, facts] of Object.entries(this.record.phases)) {
        if (!facts.doneAt || !facts.sessionIds.length || key === PR_PHASE_KEY || this.auditActivity(key)) continue;
        const recorded = judgedPhase(this.record.plan ?? [], key);
        const current = recorded && active.plan.phases.find(p => p.id === recorded.id);
        if (!recorded || !current || !current.closed || current.splitInto) throw new Error(`baseline_unavailable: Phase ${recorded?.id ?? key} was previously completed but is now removed, reopened or split. Reconcile that historical completion before returning control.`);
      }
      if (previous) {
        const completed = new Set([...Object.keys(previous.completions), ...Object.entries(this.record.phases).filter(([, f]) => f.doneAt).map(([key]) => this.judgedId(key))]);
        const problems = completedScopeProblems({ ...previous.active, plan: { ...previous.active.plan, phases: previous.active.plan.phases.map(p => ({ ...p, closed: p.closed && completed.has(p.id) })) } }, active, previous.completions);
        if (problems.length) throw new Error(problems.join(" ") + " Reconcile earlier completed work before returning control.");
      }
      const completions = { ...previous?.completions };
      for (const phase of active.plan.phases.filter(p => p.closed && !p.splitInto)) {
        const owner = Object.entries(this.record.phases).find(([key, facts]) => judgedPhase(active.plan.phases, key)?.id === phase.id && facts.sessionIds.length);
        if (owner) {
          if (owner[1].doneAt) {
            const revision = owner[1].repositories[this.paths.repositoryName]?.pushedSha;
            let scopeRepositories = completions[phase.id]?.scopeRepositories;
            if (!scopeRepositories) {
              if (!revision) throw new Error(`baseline_unavailable: Phase ${phase.id} has no retained scope or recorded published document revision. Restore that receipt/revision before returning control.`);
              const original = await observeGitPlan(git, this.worktreePath, this.paths.prdDirectoryFromRoot, revision);
              if (!original.plan.phases.find(p => p.id === phase.id)?.closed || !completedPhaseScopeUnchanged(original, active, phase.id)) throw new Error(`baseline_unavailable: Phase ${phase.id} differs from, or cannot be read at, its recorded completion revision ${revision}. Reconcile the earlier completed scope or restore that revision; today's document cannot prove yesterday's work.`);
              scopeRepositories = phaseRepositories(original, phase.id);
            }
            completions[phase.id] = { scopeRepositories, kind: "kiln", doneAt: owner[1].doneAt, ...(revision ? { revision } : {}), repositories: Object.fromEntries(Object.entries(owner[1].repositories).flatMap(([name, facts]) => facts.pushedSha ? [[name, { identity: this.record.repositories.find(entry => entry.name === name)!.github, revision: facts.pushedSha }]] : [])) };
          }
          continue;
        }
        if (completions[phase.id]) continue;
        if (this.record.preparation?.stage !== "implementation" && this.record.preparation?.bindings.some(binding => preparesPhase(binding, phase.id))) continue;
        const affectedNames = namedRepositories(active.plan.phases.filter(p => p.id === phase.id || isAncestorOf(p.id, phase.id)), this.paths.repositoryName);
        const missing = affectedNames.filter(name => !this.setUpRepositories.some(entry => entry.name === name));
        if (missing.length) throw new Error(`Externally closed Phase ${phase.id} needs completion evidence in repositories not set up: ${missing.join(", ")}. Reconcile their workspace and published work before returning control.`);
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
      if (Buffer.byteLength(JSON.stringify({ ...baseline, id: "0".repeat(64) }, null, 2)) + 1 > PLAN_LIMIT) throw new Error(`plan_too_large: maximum ${PLAN_LIMIT} retained baseline bytes.`);
    } catch (error) {
      if (error instanceof PlanBaselineWriteFailure) { this.commands.fault = error.message; throw error; }
      const problem = (error as Error).message;
      this.record.planReconciliation = { ...this.record.planReconciliation, check: { status: "failed", attemptedAt, problem } };
      this.save();
      return { ok: false, problem, unavailable: true };
    }
    const retained = this.writeContinuationMetadata(() => retainBaseline(this.stateDirectory, baseline));
    const earlier = this.record.planReconciliation;
    this.record.planReconciliation = { baselineId: retained.id, check: { status: "accepted", attemptedAt },
      ...(added.length ? { handback: { source: baseline.active.path, addedPhaseIds: added, remainingCount: baseline.active.plan.phases.filter(p => !p.splitInto && !p.closed).length, acceptedAt: attemptedAt } } : earlier?.handback ? { handback: { ...earlier.handback, remainingCount: baseline.active.plan.phases.filter(p => !p.splitInto && !p.closed).length } } : {}) };
    this.plan = baseline.active.plan;
    this.record.plan = recordedPlan(baseline.active.plan);
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

  private runtimeControlSettings() { return { keep_awake: this.record.settings.keepAwake, resume_after_usage_limit: this.record.settings.resumeAfterUsageLimit }; }

  private save(): void {
    // Once a stop begins, nothing is judged: the next `kiln run` judges from the record.
    if (this.stopping) return;
    if (this.commands?.fault) throw new RecoveryStateWriteFailed(this.commands.fault);
    const previousControl = { controlRevision: this.record.controlRevision, controlFingerprint: this.record.controlFingerprint, controlApplied: this.record.controlApplied };
    const fingerprint = createHash("sha256").update(JSON.stringify({
      execution: this.record.executionId, pause: this.record.pause, settings: this.record.settings, completed: this.record.completedAt,
      phases: Object.fromEntries(Object.entries(this.record.phases).map(([key, facts]) => [key, { sessions: facts.sessionIds, doneAt: facts.doneAt, stop: facts.stop?.at, wait: facts.wait }])),
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
    if (!this.quiet || event.kind === "repository_added" || event.kind === "plan_updated") this.options.onTerminal?.(event);
  }
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

function refuse(reason: string): CommandResult {
  return { ok: false, status: 409, reason };
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
