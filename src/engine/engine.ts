// The engine: works out where a feature stands, picks the next phase, runs its session, runs
// the done check, and owns Kiln's record (technical design, "Workload Type and Starting Point",
// "Where a Feature Stands", engine loop). The server and view reach it only through its
// commands (start, pause, cancel a pause, check again, change settings) and its snapshots. State
// is kept per phase and per session; the next phase is chosen in one function, `nextLeaf`.

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, sep } from "node:path";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import { autoModeError, effortFor, effortLevelsFor, type ModelEntry } from "../account/model-list.js";
import { isAncestorOf } from "../plan/phase-ids.js";
import { namedRepositories, type PhasePlan, type PlannedPhase } from "../plan/phase-plan.js";
import { endProcessTree } from "../platform/helper-process.js";
import type { KeepAwakeHolder } from "../platform/keep-awake.js";
import { isProcessLive } from "../platform/process-start-time.js";
import { platformSleepReader, type SleepReader } from "../platform/sleep-readings.js";
import {
  launchArguments,
  modelNameFromId,
  readOutputLines,
  resumeArguments,
  runLastOutputAt,
  runReportedInit,
  runSessionProcess,
  type SessionControl,
} from "../session/claude-session.js";
import { phaseSessionPrompt, pullRequestSessionPrompt, resumePrompt, type PhasePromptValues, type PromptRepository } from "../session/prompts.js";
import type { OutputLine, PartialText, SessionOutputReader } from "../session/session-output.js";
import {
  EFFORT_LEVELS,
  PR_PHASE_KEY,
  readSessionRecord,
  SCHEMA_VERSION,
  writePrdRecord,
  writeSessionRecord,
  type CheckResult,
  type Effort,
  type InterruptCause,
  type PrdRecord,
  type PullRequestFacts,
  type RepositoryEntry,
  type SessionRecord,
  type SessionRun,
  type Settings,
  type StopKind,
} from "../state/records.js";
import { CHECK_NAMES, planCheck, runDoneCheck, runPullRequestChecks, type CheckedRepository, type DoneCheckOutcome } from "./checks.js";
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
}

/** What the terminal prints while Kiln works (AC-START-09): one line per event. */
export type TerminalEvent =
  | { kind: "prd_started"; at: Date; branch: string; baseBranch: string; repositoryCount: number }
  | {
      kind: "phase";
      at: Date;
      phaseId: string;
      title: string;
      event: "started" | "stopped" | "done" | "interrupted" | "resumed";
      pushedSha?: string;
      /** A multi-repository PRD's Done: each repository the phase pushed to, as the done line lists them. */
      pushes?: { name: string; sha: string }[];
    }
  | { kind: "repository_added"; at: Date; phaseId: string; title: string; name: string }
  | {
      kind: "pull_request";
      at: Date;
      event: "started" | "stopped" | "opened" | "interrupted" | "resumed";
      number?: number;
      /** A multi-repository PRD's pull requests, in list order. */
      opened?: { repository: string; number: number }[];
    }
  | { kind: "message"; text: string };

export type CommandResult =
  | { ok: true }
  | { ok: false; status: 400 | 409; reason: string; fieldErrors?: FieldErrors; baseErrors?: Record<string, string> };

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
  | { kind: "start_phase"; phaseId: string; doneFirst?: DoneFirst }
  | { kind: "start_pull_request"; doneFirst?: DoneFirst }
  | { kind: "needs_you"; phaseKey: string; again: boolean; doneFirst?: DoneFirst }
  | { kind: "plan_stop"; phaseKey: string; doneFirst?: DoneFirst }
  | { kind: "paused"; beforePhaseKey: string; doneFirst?: DoneFirst }
  | { kind: "complete"; doneFirst?: DoneFirst }
  | { kind: "resume"; phaseKey: string; sessionId: string }
  | { kind: "setup_failed"; error: string };

type Verdict = { kind: "done"; judgedId: string } | { kind: "complete" } | { kind: "stopped" } | { kind: "stopping" };

export class Engine {
  readonly record: PrdRecord;
  current: CurrentPhase | undefined;
  /** True while Start's worktree setup runs. */
  settingUp = false;
  /** True while Check again's check runs. */
  checking = false;
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
  /** True while `kiln run` decides; its ● line stands in for the terminal lines. */
  private quiet = false;
  /** `kiln run` already ran the check before the pull-request session and it failed. */
  private pullRequestPrecheckDone = false;
  /** Aborted when a stop begins: every git and gh call still running ends, and new ones fail at once. */
  private readonly abort = new AbortController();
  /** The live session process's controls, while one runs. */
  private control: SessionControl | undefined;
  /** An interrupted session `kiln run` decided to resume, once its ● line is printed. */
  private pendingResume: string | undefined;
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
    this.offClaude = options.claude?.onChange(() => this.modelsChanged());
  }

  get claude(): ClaudeInfoSource | undefined {
    return this.options.claude;
  }

  /** The model list's entry for a model, when the list has loaded and offers it. */
  modelEntry(value: string): ModelEntry | undefined {
    return this.options.claude?.models?.find((entry) => entry.value === value);
  }

  /** Every field message now: the last field check's, and Model's when its model can't run in auto mode. */
  get currentFieldErrors(): FieldErrors {
    const model = autoModeError(this.modelEntry(this.record.settings.model));
    return model === undefined ? this.fieldErrors : { ...this.fieldErrors, model };
  }

  /** When the model list loads, a saved effort the model doesn't take moves to one it does (UI-011). */
  private modelsChanged(): void {
    this.matchEffortToModel();
    this.changed();
  }

  private matchEffortToModel(): void {
    const { settings } = this.record;
    const effort = effortFor(settings.effort, this.modelEntry(settings.model));
    if (effort === settings.effort) return;
    settings.effort = effort;
    this.save();
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
    if (record.completedAt) return refuse("The feature is complete.");
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
      const repositories = this.plannedRepositories;
      const fields = await this.runFieldChecks();
      const pending = repositories.filter((repository) => repository.entry?.setupCompletedAt === undefined);
      if (Object.keys(fields.errors).length > 0 || Object.keys(fields.baseErrors).length > 0 || pending.some((repository) => fields.startCommits[repository.name] === undefined)) {
        return { ok: false, status: 409, reason: "The settings don't pass their checks.", fieldErrors: fields.errors, baseErrors: fields.baseErrors };
      }
      // One save records Start and the whole list, each entry with the commit its branch starts from.
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
      record.startedAt = at;
      record.refinementConfirmedAt = at;
      // The plan as Documents found showed it, until the worktree's own copy is read.
      if (this.options.startPlan) record.plan = recordedPlan(this.options.startPlan);
      this.save();
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
    if (!this.isUnderway || record.completedAt) return refuse("Nothing is running to pause after.");
    if (this.stoppedPhaseKey() !== undefined) return refuse("Kiln is stopped at Needs you, which offers no pause.");
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
    delete this.record.pause.requestedAt;
    this.save();
    return { ok: true };
  }

  /** Check again: runs the stopped phase's check, or reads the plan again at a `plan` stop (AC-STOP-07). */
  async checkAgain(): Promise<CommandResult> {
    const key = this.stoppedPhaseKey();
    if (key === undefined) return refuse("No phase is waiting for Check again.");
    if (this.checking || this.driving) return refuse("Kiln is already checking.");
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
   * Changes settings: model, effort and keep-awake at any time, applying to sessions started
   * after it (AC-VIEW-08); the worktree and branches only before Start (AC-START-06).
   */
  async changeSettings(change: Partial<Settings>): Promise<CommandResult> {
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
    if (change.effort !== undefined && !EFFORT_LEVELS.includes(change.effort as Effort)) {
      return { ok: false, status: 400, reason: `Effort must be one of ${EFFORT_LEVELS.join(", ")}.` };
    }
    if (change.model !== undefined && change.model.trim() === "") return { ok: false, status: 400, reason: "Choose a model." };
    if (change.effort !== undefined) {
      const levels = effortLevelsFor(this.modelEntry(change.model ?? this.record.settings.model));
      if (levels !== null && !levels.includes(change.effort)) {
        return { ok: false, status: 400, reason: levels.length === 0 ? "This model takes no effort setting." : `This model takes ${levels.join(", ")}.` };
      }
    }
    // Paths are stored absolute (technical design, "Paths shown"); a leading ~ is expanded.
    if (change.worktreePath !== undefined) change = { ...change, worktreePath: expandHome(change.worktreePath) };
    if (change.workspaceFolder !== undefined) change = { ...change, workspaceFolder: expandHome(change.workspaceFolder) };
    if (change.bases !== undefined) change = { ...change, bases: { ...this.record.settings.bases, ...change.bases } };
    for (const [field, value] of Object.entries(change)) {
      if (value !== undefined) (this.record.settings as unknown as Record<string, unknown>)[field] = value;
    }
    if (change.model !== undefined) this.matchEffortToModel();
    this.save();
    if (change.keepAwake !== undefined) this.updateKeepAwake();
    // Only a base change makes the view say Kiln is checking the base on origin (UI-010 item 4).
    if (fixedFields.length > 0) await this.runFieldChecks(change.baseBranch !== undefined || change.bases !== undefined);
    this.changed();
    return { ok: true };
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
    control?.interrupt();

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
    const name = (key: string) => (key === PR_PHASE_KEY ? "the pull request" : `phase ${this.judgedId(key)}`);
    const run = this.current?.session?.runs.at(-1);
    // A live run, or an interrupted session about to be resumed: either way its phase is interrupted.
    const interrupted = this.current?.session && run && run.endedAt === undefined ? this.current.phaseKey : this.interruptedKey;
    if (interrupted !== undefined) {
      const kept = "Its session and uncommitted work are kept.";
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
    if (record.completedAt) return { text: "Kiln stopped.", grey: `${this.paths.featureName} is complete.` };
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
    if (this.sleepTimer) clearInterval(this.sleepTimer);
    this.sleepTimer = undefined;
    this.updateKeepAwake();
  }

  /** Keep-awake is held while a session's process runs and the setting is on, and released otherwise. */
  private updateKeepAwake(): void {
    const on = !this.closed && this.stopping === undefined && this.record.settings.keepAwake && this.current?.processRunning === true;
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

  private emitSessionEvent(phaseKey: string, event: "interrupted" | "resumed"): void {
    if (phaseKey === PR_PHASE_KEY) this.emit({ kind: "pull_request", at: this.now(), event });
    else {
      const judged = this.judgedId(phaseKey);
      this.emit({ kind: "phase", at: this.now(), phaseId: judged, title: this.titleOf(judged), event });
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
    if (record.completedAt) return { kind: "complete" };

    let doneFirst: DoneFirst | undefined;
    const stopped = this.stoppedPhaseKey();
    const latest = stopped === undefined ? this.latestSessionOverall() : undefined;
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
          const verdict = await this.checkInterrupted(latest.phaseKey);
          if (verdict.kind === "complete") return { kind: "complete" };
          if (verdict.kind === "resume") {
            this.pendingResume = latest.phaseKey;
            return { kind: "resume", phaseKey: latest.phaseKey, sessionId: latest.session.sessionId };
          }
          if (verdict.kind !== "stopping") this.interruptedKey = undefined;
          if (verdict.kind === "done") doneFirst = { phaseId: verdict.judgedId, byPerson: false };
        } else {
          // It ended on its own, and Kiln stopped before recording the verdict: judged as after any session.
          this.current = { phaseKey: latest.phaseKey, session: latest.session, commits: [], processRunning: false };
          const verdict = await this.judgeEndedSession(latest.phaseKey, false);
          if (verdict.kind === "complete") return { kind: "complete" };
          if (verdict.kind === "stopped") return { kind: "needs_you", phaseKey: latest.phaseKey, again: false };
          if (verdict.kind === "done") doneFirst = { phaseId: verdict.judgedId, byPerson: false };
        }
      }
    }
    const withDone = <T extends object>(decision: T) => (doneFirst ? { ...decision, doneFirst } : decision);

    if (record.pause.activeSince !== undefined) return withDone({ kind: "paused" as const, beforePhaseKey: this.nextKeyFromRecordedPlan() });
    // What the engine loop does next, in its order.
    const read = this.readPlan();
    if (!read.ok) return withDone(this.recordPlanStop(read.problem));
    const leaf = nextLeaf(read.plan);
    if (!leaf) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (check.passed && !this.stopping) {
        this.complete(check.pullRequests!, false);
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
      if (this.stopping || !this.isUnderway || record.completedAt) return;
      if (this.stoppedPhaseKey() !== undefined) return;
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
      const leaf = nextLeaf(read.plan);
      this.current = { phaseKey: leaf?.id ?? PR_PHASE_KEY, commits: [], processRunning: false };
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
      if (!leaf && !this.pullRequestPrecheckDone) {
        // A gh error here starts the pull-request session without showing it; that session's own check decides.
        const check = await this.pullRequestCheck(PR_PHASE_KEY);
        if (this.stopping) return;
        if (check.passed) {
          this.complete(check.pullRequests!, false);
          return;
        }
      }
      this.pullRequestPrecheckDone = false;
      if (record.pause.requestedAt !== undefined) {
        this.activatePause();
        return;
      }
      // Just before each phase starts, so the panel shows the account the next session will use (AC-WATCH-09).
      void this.options.claude?.refreshAccount();
      if (!leaf) {
        await this.runPullRequestSession();
        return;
      }
      const verdict = await this.runPhaseSession(leaf.id);
      if (verdict !== "done") return;
    }
  }

  private async runPhaseSession(leafId: string): Promise<"done" | "stopped"> {
    const { record } = this;
    record.phases[leafId] ??= { sessionIds: [], finishedByPerson: false, repositories: {} };
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

  private async runPullRequestSession(): Promise<void> {
    this.record.phases[PR_PHASE_KEY] ??= { sessionIds: [], finishedByPerson: false, repositories: {} };
    const prompt = pullRequestSessionPrompt(await this.pullRequestPromptValues(this.sessionFolder));
    this.emit({ kind: "pull_request", at: this.now(), event: "started" });
    await this.launchSession(PR_PHASE_KEY, "pull_request", prompt);
    await this.settleSession(PR_PHASE_KEY);
  }

  /**
   * Launches one session for a phase. The session record is written before spawning; a session
   * recorded but never started (Kiln stopped in between) is launched as planned, same ID.
   */
  private async launchSession(phaseKey: string, kind: SessionRecord["kind"], prompt: string): Promise<void> {
    const facts = this.record.phases[phaseKey]!;
    // A session launch waits for an addition under way, so it gets the workspace as it ends.
    await this.additionChain;
    let session = this.latestSession(phaseKey);
    if (!session || session.runs.length > 0) {
      const { model } = this.record.settings;
      const entry = this.modelEntry(model);
      // A model that takes no effort gets no --effort, and its record says so (UI-011).
      const effort = entry !== undefined && !entry.supportsEffort ? undefined : effortFor(this.record.settings.effort, entry);
      session = {
        schemaVersion: SCHEMA_VERSION,
        sessionId: randomUUID(),
        phaseId: phaseKey,
        kind,
        createdAt: this.now().toISOString(),
        model,
        modelDisplayName: modelNameFromId(entry?.resolvedModel ?? model),
        ...(effort === undefined ? {} : { effort }),
        workingDirectory: this.sessionFolder,
        runs: [],
        sleeps: [],
        steps: [],
      };
      writeSessionRecord(this.options.stateDirectory, session);
      facts.sessionIds.push(session.sessionId);
      this.save();
    }
    const cwd = this.workingDirectoryOf(session);
    await this.runProcess(phaseKey, session, launchArguments(session.sessionId, session.model, session.effort, this.addDirs(cwd)), prompt, "launch", cwd);
  }

  /**
   * Resumes an interrupted session with its full history (AC-KEEP-04): the same session ID, its
   * own concrete model and recorded effort, and the resume prompt as its first message.
   */
  private async resumeSession(phaseKey: string): Promise<void> {
    const session = this.latestSession(phaseKey);
    if (!session) return;
    await this.stopLiveProcess(session);
    if (this.stopping) return;
    const runIndex = session.runs.length - 1;
    const run = session.runs[runIndex]!;
    const recorded = run.interruptedBy !== undefined && run.interruptedAt !== undefined;
    const time = recorded ? run.interruptedAt! : (runLastOutputAt(this.options.stateDirectory, session, runIndex) ?? run.startedAt);
    const cwd = this.workingDirectoryOf(session);
    const multi = cwd !== this.worktreePath;
    const prompt = resumePrompt({
      ...(recorded ? { cause: run.interruptedBy! } : {}),
      time: time.replace(/\.\d+Z$/, "Z"),
      ...(phaseKey === PR_PHASE_KEY ? {} : { phaseDoc: this.pathFrom(cwd, `${this.paths.prdDirectoryFromRoot}/${this.fileOf(phaseKey) ?? ""}`) }),
      multiRepository: phaseKey === PR_PHASE_KEY ? this.pullRequestRepositories().length > 1 : multi,
    });
    this.emitSessionEvent(phaseKey, "resumed");
    // A resumed run gets the flags for the workspace as it now stands.
    await this.runProcess(phaseKey, session, resumeArguments(session.sessionId, session.initModel ?? session.model, session.effort, this.addDirs(cwd)), prompt, "resume", cwd);
  }

  /** Runs one process of a session, holding keep-awake while it runs and reading sleep around it. */
  private async runProcess(phaseKey: string, session: SessionRecord, args: string[], prompt: string, cause: SessionRun["cause"], cwd: string): Promise<void> {
    if (this.stopping) return;
    this.watchSleep();
    await this.readSleep(true);
    if (this.stopping) return;
    const current: CurrentPhase = { phaseKey, session, commits: [], processRunning: true };
    this.current = current;
    this.interruptedKey = undefined;
    this.updateKeepAwake();
    this.changed();
    // A missing folder given with --add-dir is silently dropped, so the workspace folder is made first; it is outside every checkout.
    mkdirSync(this.workspaceFolder, { recursive: true });
    await runSessionProcess({
      claude: this.options.tools.claude,
      args,
      cwd,
      env: this.sessionEnv(),
      prompt,
      cause,
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

  /**
   * After a session's process ended: a run a sleep cut off is checked and, when the check fails,
   * resumed, until a run ends on its own; that run is judged by its check alone.
   */
  private async settleSession(phaseKey: string): Promise<Verdict> {
    for (;;) {
      if (this.stopping) return { kind: "stopping" };
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
   * AC-STOP-01). A resumed run that started and ended without its stream reporting the
   * session's `init` couldn't resume it (AC-KEEP-05): a failing check is then `not_resumable`.
   */
  private async judgeEndedSession(phaseKey: string, byPerson: boolean): Promise<Verdict> {
    try {
      const session = this.latestSession(phaseKey);
      const runIndex = (session?.runs.length ?? 0) - 1;
      const run = session?.runs[runIndex];
      const notResumable = session !== undefined && run?.cause === "resume" && run.pid !== undefined && !runReportedInit(this.options.stateDirectory, session, runIndex);
      if (phaseKey === PR_PHASE_KEY) {
        const check = await this.pullRequestCheck(PR_PHASE_KEY);
        if (this.stopping) return { kind: "stopping" };
        if (check.passed) {
          this.complete(check.pullRequests!, byPerson);
          return { kind: "complete" };
        }
        this.recordStop(PR_PHASE_KEY, notResumable ? "not_resumable" : "pull_request_check", [check.check]);
        this.emit({ kind: "pull_request", at: this.now(), event: "stopped" });
        return { kind: "stopped" };
      }
      const outcome = await this.doneCheck(phaseKey);
      if (this.stopping) return { kind: "stopping" };
      if (outcome.passed) {
        await this.recordDone(phaseKey, outcome, byPerson);
        return { kind: "done", judgedId: outcome.judgedLeafId };
      }
      this.recordStop(phaseKey, notResumable ? "not_resumable" : "done_check", outcome.checks);
      this.emit({ kind: "phase", at: this.now(), phaseId: outcome.judgedLeafId, title: this.titleOf(outcome.judgedLeafId), event: "stopped" });
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
   * (or the PRD complete) and nothing is resumed; a failure means resume it.
   */
  private async checkInterrupted(phaseKey: string): Promise<Verdict | { kind: "resume" }> {
    if (phaseKey === PR_PHASE_KEY) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return { kind: "stopping" };
      if (!check.passed) return { kind: "resume" };
      this.complete(check.pullRequests!, false);
      return { kind: "complete" };
    }
    const outcome = await this.doneCheck(phaseKey);
    if (this.stopping) return { kind: "stopping" };
    if (!outcome.passed) return { kind: "resume" };
    await this.recordDone(phaseKey, outcome, false);
    return { kind: "done", judgedId: outcome.judgedLeafId };
  }

  /** Check again, or `kiln run` on a stopped phase: the stop's own check, run again. */
  private async recheckStop(phaseKey: string): Promise<"done" | "complete" | "cleared" | "still_stopped"> {
    const facts = this.record.phases[phaseKey]!;
    const stop = facts.stop!;
    if (stop.kind === "plan") {
      const read = this.readPlan();
      if (!read.ok) {
        this.updateStop(phaseKey, [planCheck(read)]);
        return "still_stopped";
      }
      // A repository the phase names that the workspace lacks is tried again (multi-repo AC-ADD-04).
      const leaf = nextLeaf(read.plan);
      if (leaf && leaf.id === phaseKey) {
        const added = await this.addNamedRepositories(leaf, read.plan);
        if (!added.ok) {
          this.updateStop(phaseKey, [{ name: CHECK_NAMES.plan, passed: false, facts: added.facts }]);
          return "still_stopped";
        }
      }
      // The plan reads again. Nothing ran, so nothing is marked Done; the loop goes round again.
      delete facts.stop;
      if (facts.sessionIds.length === 0) delete this.record.phases[phaseKey];
      this.save();
      return "cleared";
    }
    if (phaseKey === PR_PHASE_KEY) {
      const check = await this.pullRequestCheck(PR_PHASE_KEY);
      if (this.stopping) return "still_stopped";
      if (check.passed) {
        this.complete(check.pullRequests!, true);
        return "complete";
      }
      this.updateStop(phaseKey, [check.check]);
      return "still_stopped";
    }
    const outcome = await this.doneCheck(phaseKey);
    if (this.stopping) return "still_stopped";
    if (!outcome.passed) {
      this.updateStop(phaseKey, outcome.checks);
      return "still_stopped";
    }
    delete facts.stop;
    await this.recordDone(phaseKey, outcome, true);
    return "done";
  }

  private async doneCheck(phaseKey: string): Promise<DoneCheckOutcome> {
    // A done check that comes while an addition is under way waits for it to end first.
    await this.additionChain;
    this.activeCheck = phaseKey;
    // A wake during the check restarts its origin retry, so the sleep watch runs through it.
    this.watchSleep();
    try {
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
      if (outcome.plan.ok && !this.stopping) this.acceptPlan(outcome.plan.plan);
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
    try {
      const repositories = await this.pullRequestRepositoriesNow();
      return await runPullRequestChecks(
        repositories.map((entry) => ({
          gh: this.options.tools.gh,
          env: this.options.env,
          mainCheckoutPath: entry.mainCheckoutPath,
          github: entry.github,
          branch: this.record.settings.featureBranch,
          baseBranch: entry.baseBranch,
          repository: entry.name,
          signal: this.abort.signal,
        })),
      );
    } finally {
      if (phaseKey !== undefined) this.activeCheck = undefined;
    }
  }

  private async recordDone(phaseKey: string, outcome: DoneCheckOutcome, byPerson: boolean): Promise<void> {
    const facts = this.record.phases[phaseKey]!;
    const shas = outcome.pushedShas!;
    facts.doneAt = this.now().toISOString();
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

  private complete(pullRequests: PullRequestFacts[], byPerson: boolean): void {
    const { record } = this;
    const facts = (record.phases[PR_PHASE_KEY] ??= { sessionIds: [], finishedByPerson: false, repositories: {} });
    const at = this.now().toISOString();
    delete facts.stop;
    facts.doneAt = at;
    facts.finishedByPerson = byPerson;
    record.pullRequests = pullRequests;
    record.completedAt = at;
    // A pending pause is dropped, since nothing would start (UI-008).
    record.pause = {};
    this.current = undefined;
    this.save();
    this.emit({
      kind: "pull_request",
      at: this.now(),
      event: "opened",
      number: pullRequests[0]!.number,
      ...(this.setUpRepositories.length > 1 ? { opened: pullRequests.map((pull) => ({ repository: pull.repository, number: pull.number })) } : {}),
    });
  }

  private activatePause(): void {
    this.record.pause.activeSince = this.now().toISOString();
    this.current = undefined;
    this.save();
  }

  private recordStop(phaseKey: string, kind: StopKind, checks: CheckResult[]): void {
    const at = this.now().toISOString();
    const facts = (this.record.phases[phaseKey] ??= { sessionIds: [], finishedByPerson: false, repositories: {} });
    facts.stop = { kind, at, checks, checkedAt: at };
    this.save();
    this.readStoppedCommits(phaseKey);
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
    if (!this.isUnderway || this.record.completedAt || phaseKey === undefined || phaseKey === PR_PHASE_KEY || this.stopping) return Promise.resolve(refused);
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

  /** The phase prompt's values for a session starting in `folder`. */
  phasePromptValues(fileName: string, folder: string): PhasePromptValues {
    const workspace = folder !== this.worktreePath;
    return {
      phaseDoc: this.pathFrom(folder, `${this.paths.prdDirectoryFromRoot}/${fileName}`),
      featureName: this.paths.featureName,
      prdFile: this.pathFrom(folder, this.prdFile()),
      worktreePath: this.worktreePath,
      branch: this.record.settings.featureBranch,
      parentFolder: displayPath(this.parentFolder),
      ...(workspace ? { workspace: { folder, repositories: this.promptRepositories(this.setUpRepositories) } } : {}),
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
    this.lastPullRequestRepositories = this.setUpRepositories.filter((entry, index) => entry.kind === "prd" || (tips[index] !== undefined && tips[index] !== entry.baseCommit));
    return this.lastPullRequestRepositories;
  }

  /** The pull-request prompt's values for a session starting in `folder`. */
  async pullRequestPromptValues(folder: string) {
    return {
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
    return Object.entries(this.record.phases).find(([, facts]) => facts.stop !== undefined)?.[0];
  }

  isPhaseDone(phaseKey: string): boolean {
    return phaseKey === PR_PHASE_KEY ? this.record.completedAt !== undefined : this.record.phases[phaseKey]?.doneAt !== undefined;
  }

  /** The first leaf not closed in the recorded plan, or `pr` when every leaf there is closed. */
  nextKeyFromRecordedPlan(): string {
    return recordedLeaves(this.record.plan ?? []).find((phase) => !phase.closed)?.id ?? PR_PHASE_KEY;
  }

  /** The leaf a launched leaf's session is shown as: its first leaf after a split, else itself. */
  judgedId(launchedId: string): string {
    if (launchedId === PR_PHASE_KEY) return launchedId;
    return judgedPhase(this.record.plan ?? [], launchedId)?.id ?? launchedId;
  }

  titleOf(phaseId: string): string {
    return this.record.plan?.find((phase) => phase.id === phaseId)?.title ?? phaseId;
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
    if (!this.quiet) this.options.onTerminal?.(event);
  }
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
