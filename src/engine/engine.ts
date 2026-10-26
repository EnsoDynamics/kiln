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
import { preferenceGroup, preferencePath, readDevelopmentPreference, saveDevelopmentPreference, type DevelopmentPreference } from "../state/development-preferences.js";
import { auditStatus, issueSnapshot, submitAudit, auditCurrentness, repositoryChecks, type AdmissionContext } from "../audit/admission.js";
import { AuditRefusal } from "../audit/contracts.js";
import { normalizeMergeTarget, authorizationTargetKey, type MergeTarget } from "../state/development-delivery.js";
import { fileURLToPath } from "node:url";
import { DeliveryRefusal, deliveryEnabled, ledger, validateStartTargets, recordAssessment, prepareOperation, submitEvidence, reconcileDelivery, phaseDeliveryCheck, evaluateRepositories, type DeliveryContext } from "./development-delivery.js";
import { emptyDevelopmentLedger, restrictedAuthorization, developmentDeliverySummary, assertDevelopmentState, type CommandEvidence } from "../state/development-delivery.js";
import { readTranscript } from "../session/transcripts.js";
import { readDeliveryHistory } from "./delivery-history.js";
import { appendJsonLine, readJsonLines } from "../state/state-files.js";
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

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { basename, delimiter, isAbsolute, join, relative, sep } from "node:path";
import type { AccountView } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import { autoModeError, type ModelEntry } from "../account/model-list.js";
import { isAncestorOf } from "../plan/phase-ids.js";
import { namedRepositories, type PhasePlan, type PlannedPhase } from "../plan/phase-plan.js";
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
  outsideWorkspacePrompt,
  phaseSessionPrompt,
  pullRequestSessionPrompt,
  resumePrompt,
  type OutsideCheckout,
  type PhasePromptValues,
  type AuditRecoveryTask,
  type PromptRepository,
} from "../session/prompts.js";
import { isModelResponse } from "../session/run-verdict.js";
import type { OutputLine, PartialText, SessionOutputReader } from "../session/session-output.js";
import { judgeReading, limitRow, limitSentence, readingAccount, sameAccount, UNKNOWN_LIMIT_LABEL } from "../session/usage-limit.js";
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
import { auditCodexConversation, codexStayedOutcome, type CodexAudit } from "../session/codex-evidence.js";
import { stayedInWorkspace, STAYED_CHECK_NAME, STAYED_PASSED_FACT, type StayedOutcome } from "../session/outside-workspace.js";
import { claudeConfigFolder, findTranscripts } from "../session/transcripts.js";
import { firstParentCommits, firstParentCount, listWorktrees, localBranchCommit, originBranches, type GitContext } from "./git-reads.js";
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

export type CommandResult =
  | { ok: true; noteSkipped?: true }
  | { ok: false; status: 400 | 409 | 422; reason: string; fieldErrors?: FieldErrors; baseErrors?: Record<string, string> };

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
/** A reading is taken this long after a limit's reset time, since the server's window may roll over a little late. */
const RESET_READING_DELAY_MS = 60_000;
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
  readonly record: PrdRecord;
  current: CurrentPhase | undefined;
  /** True while Start's worktree setup runs. */
  settingUp = false;
  /** True while Check again's check runs. */
  checking = false;
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
  /** Each phase's latest Stayed in the workspace, which Needs you shows without reading the transcripts again. */
  private readonly stayedOutcomes = new Map<string, StayedOutcome>();
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
    this.agents.start();
    void this.refreshBilling().catch(() => this.changed());
  }

  get savedDevelopmentTargets(): DevelopmentPreference | undefined {
    if (this.record.startedAt) return undefined;
    return readDevelopmentPreference(preferencePath(this.stateDirectory), preferenceGroup(this.record.repository.github, this.paths.mainCheckoutPath));
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
    return this.billing.command(action, body, this.billingCwd, this.sessionEnv());
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
    if (this.agents.state.pending) return refuse("Agent metadata is still loading.");
    if (this.selectionError) return refuse(this.selectionError);
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
      try { validateStartTargets(record, list); } catch (error) { return { ok: false, status: 422, reason: (error as Error).message }; }
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

  /** Check again: runs the stopped phase's check, or reads the plan again at a `plan` stop (AC-STOP-07). */
  async checkAgain(): Promise<CommandResult> {
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
  async resume(body: { note?: unknown } = {}): Promise<CommandResult> {
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
    const kind = this.record.phases[phaseKey]?.stop?.kind;
    if (kind !== "done_check" && kind !== "pull_request_check" && this.record.billing?.hold?.phaseKey !== phaseKey) return false;
    const session = this.latestSession(phaseKey);
    if (!session || !session.runs.some((run) => run.pid !== undefined)) return false;
    return !this.transcriptMissing(session) && this.codexSafetyProblems(phaseKey, false).length === 0;
  }

  /**
   * Ticks or unticks Needs you's confirmation that the changes outside the workspace have been
   * dealt with (multi-repo AC-OUTSIDE-03, OUT-001). Offered only while Stayed in the workspace
   * has failed; a tick covers every change recorded up to it, and unticking before the next
   * check takes it back.
   */
  setOutsideConfirmation(ticked: boolean): CommandResult {
    const key = this.stoppedPhaseKey();
    const facts = key === undefined ? undefined : this.record.phases[key];
    const stop = facts?.stop;
    if (!facts || !stop || !stop.checks.some((check) => check.name === STAYED_CHECK_NAME && !check.passed)) {
      return refuse("Stayed in the workspace hasn't failed, so there is nothing to confirm.");
    }
    // A tick during a check would land after it and show unticked, so the box waits for the check to end.
    if (this.deliveryBusy || this.checking || this.driving) return refuse("Kiln is checking. Tick it once the check ends.");
    if (this.record.settings.agentId === "codex") {
      const audits = facts.codexAudits ?? {};
      const complete = Object.values(audits).filter(audit => audit.coverage === "complete" && audit.findings.length);
      if (!complete.length) return refuse("Missing or unreadable Codex evidence cannot be confirmed. Recover its history and Check again.");
      if (!ticked) facts.codexConfirmations = [];
      else facts.codexConfirmations = [{ at: this.now().toISOString(), fingerprints: Object.fromEntries(Object.entries(audits).filter(([, audit]) => audit.coverage === "complete").map(([id, audit]) => [id, audit.fingerprint])) }];
      this.save(); this.changed(); return { ok: true };
    }
    const sinceCheck = (confirmation: { at: string }) => Date.parse(confirmation.at) > Date.parse(stop.checkedAt);
    if (!ticked) facts.outsideConfirmations = facts.outsideConfirmations.filter((confirmation) => !sinceCheck(confirmation));
    else if (!facts.outsideConfirmations.some(sinceCheck)) facts.outsideConfirmations.push({ at: this.now().toISOString() });
    this.save();
    this.changed();
    return { ok: true };
  }

  /**
   * Changes settings: model, effort and keep-awake at any time, applying to sessions started
   * after it (AC-VIEW-08); the worktree and branches only before Start (AC-START-06).
   */
  async changeSettings(change: Partial<Settings>): Promise<CommandResult> {
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
    if (change.developmentDeployments) {
      const candidate = structuredClone(change.developmentDeployments);
      const preference = this.savedDevelopmentTargets!;
      if (candidate.useSavedTargetsForThisPrd) {
        if (readDevelopmentPreference(preferencePath(this.stateDirectory), preference.group).revision !== preference.revision || candidate.preferenceRevision !== preference.revision) return refuse("Saved targets changed; reload Documents found before reuse.");
        // The displayed exact saved identities are accepted only by this explicit choice.
        if (!this.record.settings.developmentDeployments?.useSavedTargetsForThisPrd) {
          candidate.enabled = preference.enabled;
          candidate.targets = preference.targets.filter(target => this.plannedRepositories.some(repo => target.repository === `github.com/${repo.github}`.toLowerCase() && target.baseBranch === baseFor(repo, this.record.settings, this.workspaceFixed))).map(target => target.environment === undefined ? { target } : { target, confirmedTarget: target, confirmedNonProduction: true });
        }
      }
      if (candidate.rememberForPrdRepository) {
        if (candidate.preferenceRevision !== preference.revision) return refuse("Saved targets changed; reload Documents found before saving.");
        try {
          validateStartTargets({ ...this.record, settings: { ...this.record.settings, developmentDeployments: candidate } }, this.plannedRepositories.map(repo => ({ github: repo.github, baseBranch: baseFor(repo, this.record.settings, this.workspaceFixed) })));
          const savedPreference = saveDevelopmentPreference(preferencePath(this.stateDirectory), { ...preference, enabled: candidate.enabled, targets: candidate.enabled ? candidate.targets.map(one => normalizeMergeTarget(one.target)) : [] }, candidate.preferenceRevision);
          candidate.preferenceRevision = savedPreference.revision;
        } catch (error) { return { ok: false, status: error instanceof DeliveryRefusal ? error.status : 409, reason: (error as Error).message }; }
      }
      change = { ...change, developmentDeployments: candidate };
    }
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
    return activity ? { label: activity.kind === "delivery_audit" ? "Delivery audit" : "Test audit", prdFile: this.pathFrom(folder, this.prdFile()), activityId: activity.activityId, round: activity.round, reportPath: activity.reportPath, skillPath: activity.skill.path, instructions: this.auditPrompt(activity) } : undefined;
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

  // ---- `kiln run` on a feature underway --------------------------------------------------

  /**
   * The first half of `kiln run` for a feature underway: finishes an interrupted setup and
   * reads the plan, so the summary line can be printed before any check runs.
   */
  async prepare(): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.record.completedAt) return { ok: true };
    if (this.record.setupCompletedAt === undefined) {
      const setup = await this.finishSetup();
      if (!setup.ok) return setup;
    }
    this.readPlan();
    return { ok: true };
  }

  /**
   * The second half: judges a session whose verdict was never recorded, re-checks a stop, and
   * says what Kiln does next (the ● line). An interrupted session is left untouched for a Kiln
   * that can resume it.
   */
  async decide(): Promise<UnderwayDecision> {
    // The ● line says what these checks found, so their own terminal lines would repeat it.
    this.quiet = true;
    try {
      return await this.decideQuietly();
    } finally {
      this.quiet = false;
    }
  }

  private async decideQuietly(): Promise<UnderwayDecision> {
    const { record } = this;
    if (deliveryEnabled(record) && record.completedAt) {
      this.readPlan();
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
      const verdict = await this.recheckStop(stopped);
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
          if (verdict.kind === "resume") {
            this.pendingResume = latest.phaseKey;
            return { kind: "resume", phaseKey: latest.phaseKey, sessionId: latest.session.sessionId };
          }
          if (verdict.kind !== "stopping") this.interruptedKey = undefined;
          if (verdict.kind === "waiting") return { kind: "waiting", phaseKey: latest.phaseKey, limit: this.waitLimit(latest.phaseKey) };
          // It worked outside the workspace: Needs you, never resumed (multi-repo AC-OUTSIDE-04).
          if (verdict.kind === "stopped") return { kind: "needs_you", phaseKey: latest.phaseKey, again: false };
          if (verdict.kind === "done") doneFirst = { phaseId: verdict.judgedId, byPerson: false };
        } else {
          // It ended on its own, and Kiln stopped before recording the verdict: judged as after any session.
          this.current = { phaseKey: latest.phaseKey, session: latest.session, commits: [], processRunning: false };
          const verdict = await this.judgeEndedSession(latest.phaseKey, false);
          if (verdict.kind === "complete") return { kind: "complete" };
          if (verdict.kind === "stopped") return { kind: "needs_you", phaseKey: latest.phaseKey, again: false };
          if (verdict.kind === "waiting") return { kind: "waiting", phaseKey: latest.phaseKey, limit: this.waitLimit(latest.phaseKey) };
          if (verdict.kind === "done") doneFirst = { phaseId: verdict.judgedId, byPerson: false };
        }
      }
    }
    const withDone = <T extends object>(decision: T) => (doneFirst ? { ...decision, doneFirst } : decision);

    if (record.pause.activeSince !== undefined) return withDone({ kind: "paused" as const, beforePhaseKey: this.nextKeyFromRecordedPlan() });
    // What the engine loop does next, in its order.
    const read = this.readPlan();
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
    this.driving = this.drive().finally(() => {
      this.driving = undefined;
      this.changed();
    });
  }

  private async drive(): Promise<void> {
    const { record } = this;
    for (;;) {
      if (this.stopping || !this.isUnderway || this.currentlyComplete || this.record.billing?.hold && !this.requestedResume) return;
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

      const read = this.readPlan();
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
      this.record.phases[auditKey(activity)] = { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [] };
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
    const before = structuredClone(this.record);
    try {
      const activity = this.auditActivity(key)!; const context = this.admissionContext();
      if (deliveryEnabled(this.record)) context.developmentChecks = () => [ownerDeliveryCheck(this.deliveryContext(key), { kind: "audit", activityId: activity.activityId })];
      const stayed = await this.readWorkspaceEvidence(key);
      const plan = this.readPlan(); const checks: CheckResult[] = [];
      if (!plan.ok) checks.push(planCheck(plan));
      if (deliveryEnabled(this.record)) await reconcileDelivery(this.deliveryContext(key));
      try {
        if (!activity.acceptedResult) {
          const result = await submitAudit(context, { executionId: this.record.executionId, activityId: activity.activityId, revision: this.record.completionAudits!.revision, reportPath: activity.reportPath });
          checks.push(...result.checks);
        } else {
          const accepted = acceptedAudit(this.stateDirectory, activity)!;
          const current = await auditCurrentness(context, activity);
          checks.push({ name: "Audit result recorded", passed: true, facts: [current.deliveryCurrent && (activity.kind !== "test_audit" || current.testsCurrent) ? `Accepted ${activity.reportPath}: ${accepted.report.outcome}.` : "Checked audit work changed; recover the assigned result before continuing."] });
        }
      } catch (error) { checks.push({ name: "Audit result recorded", passed: false, facts: [(error as Error).message] }); }
      checks.push(...await repositoryChecks(context), ...(stayed.passed ? [] : [stayed.check]));
      if (deliveryEnabled(this.record)) checks.push(ownerDeliveryCheck(this.deliveryContext(key), { kind: "audit", activityId: activity.activityId }), ...this.activationChecks().filter(c => !c.passed));
      this.save();
      return this.withCodexSafety(key, { passed: checks.every(c => c.passed), checks, plan, judgedLeafId: key, stayed });
    } catch (error) { Object.assign(this.record, before); throw error; }
    finally { this.activeCheck = undefined; }
  }

  private finalNeedsAudits(outcome: { checks: CheckResult[] }): boolean {
    if (!outcome.checks.some(c => c.name === "Current completion audits" && !c.passed) || outcome.checks.some(c => c.name !== "Current completion audits" && !c.passed)) return false;
    const facts = this.record.phases[PR_PHASE_KEY]; if (facts) { delete facts.stop; delete facts.wait; }
    if (this.record.completionAudits) this.record.completionAudits.policy = "required";
    this.save(); return true;
  }

  private async requireCurrentAudits(outcome: { passed: boolean; checks: CheckResult[] }): Promise<void> {
    if (this.record.completedAt && this.record.completionAudits?.policy === "legacy_complete") return;
    try {
      const next = await auditNext(this.admissionContext());
      if (next === "final_delivery" && !nextLeaf(this.plan!)) return;
      outcome.checks.push({ name: "Current completion audits", passed: false, facts: [`${next === "final_delivery" ? "Implementation" : auditLabel(next === "continue_test" ? "test_audit" : next)} is required before final completion.`] });
    } catch (error) { outcome.checks.push({ name: "Current completion audits", passed: false, facts: [(error as Error).message] }); }
    outcome.passed = false;
  }

  private async runPhaseSession(leafId: string): Promise<"done" | "stopped"> {
    const { record } = this;
    record.phases[leafId] ??= { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [] };
    // The prompt lists the workspace as it stands once any addition under way has ended.
    await this.additionChain;
    await this.recordStartCommits(leafId);
    const leaf = this.plan?.phases.find((phase) => phase.id === leafId);
    const prompt = phaseSessionPrompt(this.phasePromptValues(leaf?.fileName ?? "", this.sessionFolder));
    if (this.stopping) return "stopped";
    this.emit({ kind: "phase", at: this.now(), phaseId: leafId, title: leaf?.title ?? leafId, event: "started" });
    await this.launchSession(leafId, "phase", prompt);
    const verdict = await this.settleSession(leafId);
    return verdict.kind === "done" ? "done" : "stopped";
  }

  private async runPullRequestSession(): Promise<Verdict> {
    this.record.phases[PR_PHASE_KEY] ??= { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [] };
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
   * note first, then AC-OUTSIDE-02's prompt while Stayed in the workspace fails (multi-repo
   * AC-OUTSIDE-04). The end of a wait is the same, with `limit_resume` (usage-limit recovery
   * AC-AUTO-02); after a usage limit the opening says so. Before any of these, the account is
   * read again (awaited, 30 seconds at most) and the run records it. Its stop or wait, and
   * `checking`, are cleared as the run starts.
   */
  private async resumeSession(phaseKey: string, request?: ResumeRequest): Promise<void> {
    const session = this.latestSession(phaseKey);
    if (!session) return;
    await this.stopLiveProcess(session);
    if (this.stopping) return;
    if (session.agentId === "codex") {
      await this.readCodexAvailability(session);
      if (this.codexSafetyProblems(phaseKey, false).length || this.transcriptMissing(session)) {
        this.checking = false;
        this.recordStop(phaseKey, this.transcriptMissing(session) ? "not_resumable" : phaseKey === PR_PHASE_KEY ? "pull_request_check" : "done_check", [{ name: "Codex recovery", passed: false, facts: [...this.codexSafetyProblems(phaseKey), ...(session.codex?.resumeError ? [session.codex.resumeError] : [])] }]);
        return;
      }
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
    const checks = facts.stop?.checks ?? facts.wait?.checks ?? [];
    const outsideFailed = request !== undefined && checks.some((check) => check.name === STAYED_CHECK_NAME && !check.passed);
    const outside = outsideFailed ? this.uncoveredOutside(phaseKey).prompt ?? (session.agentId === "codex" ? `The workspace check is inconclusive. Recover the missing or unreadable evidence below; resuming does not clear this obligation:\n${checks.filter(check => check.name === STAYED_CHECK_NAME && !check.passed).flatMap(check => check.facts).join("\n")}` : undefined) : undefined;
    const cwd = this.workingDirectoryOf(session);
    const multi = cwd !== this.worktreePath;
    const label = facts.stop?.limit?.label ?? refusal?.label;
    const prompt = resumePrompt({
      deliveryAuthority: this.deliveryAuthority(),
      agentId: session.agentId ?? "claude_code",
      ...(refusal !== undefined && endedOnItsOwn ? { usageLimit: label === UNKNOWN_LIMIT_LABEL || label === undefined ? "" : limitSentence(label) } : {}),
      ...(endedOnItsOwn ? { endedOnItsOwn: true } : recorded ? { cause: run.interruptedBy! } : {}),
      time: time.replace(/\.\d+Z$/, "Z"),
      ...(this.auditRecoveryTask(phaseKey, cwd) ? { auditTask: this.auditRecoveryTask(phaseKey, cwd)! } : phaseKey === PR_PHASE_KEY ? {} : { phaseDoc: this.pathFrom(cwd, `${this.paths.prdDirectoryFromRoot}/${this.fileOf(phaseKey) ?? ""}`) }),
      multiRepository: phaseKey === PR_PHASE_KEY ? this.pullRequestRepositories().length > 1 : multi,
      ...(request?.note === undefined ? {} : { note: request.note }),
      ...(outside === undefined ? {} : { outside }),
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
    await this.runProcess(phaseKey, session, args, prompt, request?.cause ?? "resume", cwd, request?.note, started, account);
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
    if (this.stopping || session.agentId !== "codex" && started?.() === false) return;
    const current: CurrentPhase = { phaseKey, session, commits: [], processRunning: true };
    this.current = current;
    this.interruptedKey = undefined;
    if (started && session.agentId !== "codex") this.save();
    this.updateKeepAwake();
    this.changed();
    // A missing folder given with --add-dir is silently dropped, so the workspace folder is made first; it is outside every checkout.
    mkdirSync(this.workspaceFolder, { recursive: true });
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
      onRecordChange: () => this.changed(),
    });
    this.control = undefined;
    current.processRunning = false;
    this.updateKeepAwake();
    if (!this.stopping) await this.refreshCommits(current, true);
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
        ...this.codexLaunchOptions(cwd), record: session, stateDirectory: this.options.stateDirectory, prompt, cause, ...(note ? { note } : {}),
        beforeStart: () => {
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
        onRecordChange: () => this.changed(),
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
      const notResumable = session !== undefined && run !== undefined && run.cause !== "launch" && run.pid !== undefined && (session.agentId === "codex" ? this.transcriptMissing(session) : !runReportedInit(this.options.stateDirectory, session, runIndex));
      if (phaseKey === PR_PHASE_KEY) {
        const check = await this.pullRequestCheck(PR_PHASE_KEY);
        if (this.stopping) return { kind: "stopping" };
        if (check.passed) {
          this.complete(check.pullRequests!, byPerson, check.mergedBranches);
          return { kind: "complete" };
        }
        if (this.finalNeedsAudits(check)) return { kind: "done", judgedId: PR_PHASE_KEY };
        if (!notResumable && run?.limitRefusal !== undefined) return this.settleRefused(PR_PHASE_KEY, session!, runIndex, check.checks, check.stayed.passed);
        this.recordStop(PR_PHASE_KEY, notResumable ? "not_resumable" : "pull_request_check", check.checks);
        this.emit({ kind: "pull_request", at: this.now(), event: "stopped" });
        return { kind: "stopped" };
      }
      const outcome = await this.doneCheck(phaseKey);
      if (outcome === "stopping" || this.stopping) return { kind: "stopping" };
      if (outcome.passed) {
        await this.recordDone(phaseKey, outcome, byPerson);
        return { kind: "done", judgedId: outcome.judgedLeafId };
      }
      if (!notResumable && run?.limitRefusal !== undefined) return this.settleRefused(phaseKey, session!, runIndex, outcome.checks, outcome.stayed.passed);
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
   * worked outside the workspace, which only the person can deal with (multi-repo AC-OUTSIDE-04).
   */
  private async checkInterrupted(phaseKey: string): Promise<Verdict | { kind: "resume" }> {
    if (phaseKey === PR_PHASE_KEY) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return { kind: "stopping" };
      if (this.finalNeedsAudits(check)) return { kind: "done", judgedId: PR_PHASE_KEY };
      if (!check.passed) return check.stayed.passed && !this.codexSafetyProblems(phaseKey).length && this.canResumeCodex(phaseKey) ? { kind: "resume" } : this.stopInterrupted(PR_PHASE_KEY, "pull_request_check", check.checks);
      this.complete(check.pullRequests!, false, check.mergedBranches);
      return { kind: "complete" };
    }
    const outcome = await this.doneCheck(phaseKey);
    if (outcome === "stopping" || this.stopping) return { kind: "stopping" };
    if (!outcome.passed) return outcome.stayed.passed && !this.codexSafetyProblems(phaseKey).length && this.canResumeCodex(phaseKey) ? { kind: "resume" } : this.stopInterrupted(phaseKey, "done_check", outcome.checks);
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
      const read = this.readPlan();
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
      const run = this.sessionRecord(phaseKey, id)?.runs.at(-1);
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
        throw error;
      }
    }
    this.activeCheck = phaseKey;
    await this.deliveryPending;
    await this.additionChain;
    // A wake during the check restarts its origin retry, so the sleep watch runs through it.
    this.watchSleep();
    try {
      const outcome = await runDoneCheck({
        stayed: await this.readWorkspaceEvidence(phaseKey),
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
        const delivery = phaseDeliveryCheck(this.deliveryContext(phaseKey), outcome.judgedLeafId);
        outcome.checks.push(delivery, ...this.activationChecks().filter(check => !check.passed)); outcome.passed = outcome.passed && outcome.checks.every(check => check.passed); this.save(); this.announceDelivery();
      }
      if (outcome.plan.ok && !this.stopping) this.acceptPlan(outcome.plan.plan);
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
      if (deliveryEnabled(this.record)) {
        const result = await evaluateRepositories(this.deliveryContext(phaseKey)); this.announceDelivery();
        const histories = await Promise.all(Object.keys(this.record.phases).map(key => this.readWorkspaceEvidence(key)));
        const finalStayed = await this.readWorkspaceEvidence(PR_PHASE_KEY);
        const failed = histories.filter(one => !one.passed);
        const stayed = failed.length ? { ...finalStayed, passed: false, check: { name: STAYED_CHECK_NAME, passed: false, facts: failed.flatMap(one => one.check.facts) }, changes: failed.flatMap(one => one.changes), transcripts: failed.flatMap(one => one.transcripts) } : finalStayed;
        const check = result.checks[0]!;
        const outcome = this.withCodexSafety(PR_PHASE_KEY, { passed: result.passed && stayed.passed, check, checks: [...result.checks, ...(stayed.passed ? [] : [stayed.check])], stayed, pullRequests: result.pullRequests, mergedBranches: [] as MergedBranchFacts[], ghError: ledger(this.record).sourceUnavailable === true });
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
        await this.readWorkspaceEvidence(PR_PHASE_KEY),
      );
      await this.requireCurrentAudits(outcome);
      return this.withCodexSafety(PR_PHASE_KEY, outcome);
    } finally {
      if (phaseKey !== undefined) this.activeCheck = undefined;
    }
  }

  private async recordDone(phaseKey: string, outcome: DoneCheckOutcome, byPerson: boolean): Promise<void> {
    const facts = this.record.phases[phaseKey]!;
    // Backfilling development assessments does not rewrite historical completion/push facts.
    if (facts.doneAt && this.record.developmentAuthorization?.activationRecovery && !this.auditActivity(phaseKey)) { this.save(); return; }
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
        facts.doneAt ??= this.now().toISOString(); facts.finishedByPerson = byPerson; delete facts.stop;
        this.save();
      } catch (error) { Object.assign(this.record, before); throw error; }
      this.emitAudit(audit, "done"); return;
    }
    const shas = outcome.pushedShas!;
    facts.doneAt ??= this.now().toISOString();
    facts.finishedByPerson = byPerson;
    const pushes: { name: string; sha: string }[] = [];
    for (const entry of this.setUpRepositories) {
      const sha = shas[entry.name];
      if (sha === undefined) continue;
      const repository = (facts.repositories[entry.name] ??= { startCommit: sha });
      repository.pushedSha = sha;
      const count = await firstParentCount(this.git, expandHome(entry.worktreePath), repository.startCommit, sha);
      if (count !== undefined) repository.commitCount = count;
      if (repository.startCommit !== sha) pushes.push({ name: entry.name, sha });
    }
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
      if (this.closed || this.stopping) return;
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
    const facts = (record.phases[PR_PHASE_KEY] ??= { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [] });
    const at = this.now().toISOString();
    delete facts.stop;
    facts.doneAt ??= at;
    facts.finishedByPerson = byPerson;
    record.pullRequests = pullRequests;
    if (mergedBranches.length) record.mergedBranches = mergedBranches;
    else delete record.mergedBranches;
    record.completedAt ??= at;
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
    if (deliveryEnabled(this.record)) ledger(this.record).currentComplete = false;
    const at = this.now().toISOString();
    const facts = (this.record.phases[phaseKey] ??= { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [] });
    facts.stop = { kind, at, checks, checkedAt: checkedAt ?? at, ...(interrupted === undefined ? {} : { interrupted }), ...(limit === undefined ? {} : { limit }) };
    this.save();
    this.readStoppedCommits(phaseKey);
    // The account card shows a reading taken after the refusal (usage-limit recovery AC-LIMIT-03).
    if (limit !== undefined) this.askReading();
  }

  private updateStop(phaseKey: string, checks: CheckResult[]): void {
    const stop = this.record.phases[phaseKey]!.stop!;
    // Stayed in the workspace stays listed, as passed, once it has failed in this stop (multi-repo AC-OUTSIDE-01).
    const listed = stop.checks.some((check) => check.name === STAYED_CHECK_NAME);
    if (listed && !checks.some((check) => check.name === STAYED_CHECK_NAME)) checks = [...checks, { name: STAYED_CHECK_NAME, passed: true, facts: [STAYED_PASSED_FACT] }];
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
   * account; a wait while the setting is on, the session stayed in the workspace and its
   * transcript is there; otherwise Needs you with the limit's facts.
   */
  private settleRefused(phaseKey: string, session: SessionRecord, runIndex: number, checks: CheckResult[], stayedPassed: boolean): Verdict {
    const run = session.runs[runIndex]!;
    const limit = stopLimit(run.limitRefusal!);
    const kind: StopKind = phaseKey === PR_PHASE_KEY ? "pull_request_check" : "done_check";
    if (session.agentId === "codex") {
      if (this.record.settings.resumeAfterUsageLimit && stayedPassed && !this.codexSafetyProblems(phaseKey).length && !this.transcriptMissing(session)) {
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
    if (this.record.settings.resumeAfterUsageLimit && stayedPassed && !this.transcriptMissing(session)) {
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
   * wait, with these results, unless the session worked outside the workspace, its transcript
   * is gone, or (except at Resume now) the setting is off: then it is Needs you.
   */
  private async recheckWait(phaseKey: string, mode: "restart" | ResumeRequest["cause"]): Promise<"done" | "complete" | "stopped" | "failed" | "stopping"> {
    const facts = this.record.phases[phaseKey]!;
    let checks: CheckResult[];
    let stayedPassed: boolean;
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
      stayedPassed = check.stayed.passed;
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
      checks = outcome.checks;
      stayedPassed = outcome.stayed.passed;
    }
    const session = this.latestSession(phaseKey);
    const settingOff = mode !== "person_resume" && !this.record.settings.resumeAfterUsageLimit;
    if (!stayedPassed || settingOff || this.codexSafetyProblems(phaseKey).length || (session !== undefined && this.transcriptMissing(session))) {
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
    if (key === undefined || this.record.billing?.hold || this.closed || this.stopping || this.waitWatch?.phaseKey === key) return;
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
    const resetsAt = this.refusedRun(watch.phaseKey)?.refusal.resetsAt;
    if (resetsAt === undefined) return;
    const due = Date.parse(resetsAt) + RESET_READING_DELAY_MS - this.now().getTime();
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
    const verdict = judgeReading(reading, refusal, session.initModel ?? session.model);
    if (verdict === "no_usage_left") return;
    const resetPassed = refusal.resetsAt !== undefined && this.now().getTime() >= Date.parse(refusal.resetsAt);
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
    const facts = (record.phases[phaseKey] ??= { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [] });
    facts.repositories[name] = { startCommit: entry.baseCommit! };
    this.save();
    // The added line names the session's judged leaf, from the latest read of the plan.
    const read = readPlanAt(this.worktreePath, this.paths.prdDirectoryFromRoot);
    if (read.ok) this.acceptPlan(read.plan);
    const judged = this.judgedId(phaseKey);
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

  /**
   * Stayed in the workspace for the sessions Kiln recorded for a phase, or for the pull-request
   * session (multi-repo AC-OUTSIDE-01, AC-PRS-06), read from its recorded agent's evidence.
   * Completion/PR verdicts always read fresh provider history; cached scans are display only.
   */
  async readWorkspaceEvidence(phaseKey: string): Promise<StayedOutcome> {
    if (this.record.settings.agentId !== "codex") return this.stayedInWorkspace(phaseKey);
    const facts = this.record.phases[phaseKey];
    if (!facts) return this.stayedInWorkspace(phaseKey);
    facts.codexAudits = {};
    const scanSignal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(120_000)]);
    for (const sessionId of facts.sessionIds) {
      const session = this.sessionRecord(phaseKey, sessionId);
      if (session?.agentId === "codex") await this.readCodexAvailability(session, true);
      const conversation = session?.agentId === "codex" ? session.conversation : undefined;
      if (!conversation?.threadId || !conversation.codexHome || !this.options.tools.codex) {
        facts.codexAudits[sessionId] = this.missingCodexAudit("Codex conversation identity, home or executable is unavailable.");
      } else {
        facts.codexAudits[sessionId] = await auditCodexConversation({
          threadId: conversation.threadId, codexHome: conversation.codexHome,
          worktrees: this.setUpRepositories.map(entry => expandHome(entry.worktreePath)),
          cwd: session?.workingDirectory ?? this.worktreePath, executable: this.options.tools.codex,
          env: this.options.env, signal: scanSignal,
          ...(conversation.knownThreadIds ? { knownThreadIds: conversation.knownThreadIds } : {}),
        });
      }
    }
    this.save();
    return this.stayedInWorkspace(phaseKey);
  }

  private missingCodexAudit(reason: string): CodexAudit {
    return { profile: "codex-0.162.1-static-v1", coverage: "inconclusive", at: this.now().toISOString(), fingerprint: "", frontiers: [], findings: [], problems: [reason], operationsChecked: 0 };
  }

  stayedInWorkspace(phaseKey: string): StayedOutcome {
    if (this.record.settings.agentId === "codex") {
      const facts = this.record.phases[phaseKey];
      const results = (facts?.sessionIds ?? []).map(id => codexStayedOutcome(id,
        facts?.codexAudits?.[id] ?? this.missingCodexAudit("Codex history has not been checked."),
        (facts?.codexConfirmations ?? []).flatMap(confirmation => confirmation.fingerprints[id] ? [confirmation.fingerprints[id]!] : [])));
      // Before the final session exists there are no final-session operations to audit.
      // Any recorded session, including one with a missing file, is still checked above.
      if (!results.length && phaseKey !== PR_PHASE_KEY) results.push(codexStayedOutcome("unknown", this.missingCodexAudit("No Codex session record is available."), []));
      const changes = results.flatMap(result => result.changes);
      const transcripts = results.flatMap(result => result.transcripts);
      const passed = results.every(result => result.passed);
      const outcome: StayedOutcome = { passed, changes, transcripts, check: { name: STAYED_CHECK_NAME, passed, facts: passed ? [STAYED_PASSED_FACT] : results.filter(result => !result.passed).flatMap(result => result.check.facts) } };
      this.stayedOutcomes.set(phaseKey, outcome);
      return outcome;
    }
    const facts = this.record.phases[phaseKey];
    const sessions = (facts?.sessionIds ?? []).flatMap((sessionId) => {
      const session = this.sessionRecord(phaseKey, sessionId);
      if (!session) return [];
      const endedAt = session.runs.at(-1)?.endedAt;
      return [{ sessionId, reportedInit: session.initModel !== undefined, ...(endedAt === undefined ? {} : { endedAt }) }];
    });
    const outcome = stayedInWorkspace({
      sessions,
      worktrees: this.setUpRepositories.map((entry) => expandHome(entry.worktreePath)),
      configFolder: claudeConfigFolder(this.options.env),
      confirmations: facts?.outsideConfirmations ?? [],
      ...(facts?.stop === undefined ? {} : { stopAt: facts.stop.at }),
    });
    this.stayedOutcomes.set(phaseKey, outcome);
    return outcome;
  }

  /**
   * The changes outside the workspace Stayed in the workspace found uncovered at the phase's latest
   * check (multi-repo AC-OUTSIDE-02): each change's fact, each changed checkout as the prompt names
   * it (a subagent's worktree by its main checkout's repository), and the prompt when there are changes.
   */
  uncoveredOutside(phaseKey: string): { changes: string[]; checkouts: OutsideCheckout[]; prompt?: string } {
    const outcome = this.latestStayed(phaseKey);
    const repositories = new Set(this.setUpRepositories.map((entry) => entry.name));
    // Each checkout once, named by its repository: a subagent's worktree by its main checkout's.
    const seen = new Map<string, string>();
    for (const change of outcome.changes) if (change.checkout !== undefined) seen.set(change.checkout, change.repository ?? basename(change.checkout));
    const checkouts = [...seen].map(([path, name]) => ({ shownPath: displayPath(path), name, inWorkspace: repositories.has(name) }));
    const changes = outcome.changes.map((change) => change.fact);
    if (changes.length === 0) return { changes, checkouts };
    const isPr = phaseKey === PR_PHASE_KEY;
    const prompt = outsideWorkspacePrompt({
      ...(isPr ? { pullRequests: this.pullRequestRepositories().length > 1 ? ("several" as const) : ("one" as const) } : { phaseName: `phase ${this.judgedId(phaseKey)}` }),
      facts: changes,
      checkouts,
      branch: this.record.settings.featureBranch,
      multiRepository: this.multiRepository,
    });
    return { changes, checkouts, prompt };
  }

  /** Stayed in the workspace as the phase's latest check found it, for Needs you; read again only when Kiln has none in memory. */
  latestStayed(phaseKey: string): StayedOutcome {
    return this.stayedOutcomes.get(phaseKey) ?? this.stayedInWorkspace(phaseKey);
  }

  /** Whether a session ran and Claude Code holds no transcript for it, so it can't be resumed (OUT-003). */
  transcriptMissing(session: SessionRecord): boolean {
    if (session.agentId === "codex") {
      if (!session.conversation?.threadId) return true;
      return session.codex?.conversationUnavailable === true;
    }
    return session.initModel !== undefined && findTranscripts(claudeConfigFolder(this.options.env), session.sessionId).main === undefined;
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
    return this.record.billing?.hold?.phaseKey ?? Object.entries(this.record.phases).find(([, facts]) => facts.stop !== undefined)?.[0];
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

  private readPlan(): PlanRead {
    const read = readPlanAt(this.worktreePath, this.paths.prdDirectoryFromRoot);
    if (read.ok) this.acceptPlan(read.plan);
    return read;
  }

  private acceptPlan(plan: PhasePlan): void {
    this.plan = plan;
    this.record.plan = recordedPlan(plan);
    this.save();
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

  private save(): void {
    // Once a stop begins, nothing is judged: the next `kiln run` judges from the record.
    if (this.stopping) return;
    writePrdRecord(this.options.stateDirectory, this.record);
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  private emit(event: TerminalEvent): void {
    // The ● line doesn't mention an addition, so its line is printed while deciding too (AC-ADD-03).
    if (!this.quiet || event.kind === "repository_added") this.options.onTerminal?.(event);
  }
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
