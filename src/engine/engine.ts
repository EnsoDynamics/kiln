// The engine: works out where a feature stands, picks the next phase, runs its session, runs
// the done check, and owns Kiln's record (technical design, "Workload Type and Starting Point",
// "Where a Feature Stands", engine loop). The server and view reach it only through its
// commands (start, pause, cancel a pause, check again, change settings) and its snapshots. State
// is kept per phase and per session; the next phase is chosen in one function, `nextLeaf`.

import { randomUUID } from "node:crypto";
import type { PhasePlan } from "../plan/phase-plan.js";
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
import { phaseSessionPrompt, pullRequestSessionPrompt, resumePrompt } from "../session/prompts.js";
import type { OutputLine, SessionOutputReader } from "../session/session-output.js";
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
  type SessionRecord,
  type SessionRun,
  type Settings,
  type StopKind,
} from "../state/records.js";
import { CHECK_NAMES, planCheck, runDoneCheck, runPullRequestCheck, type DoneCheckOutcome } from "./checks.js";
import { firstParentCommits, firstParentCount, localBranchCommit, originBranches, type GitContext } from "./git-reads.js";
import { judgedPhase, nextLeaf, readPlanAt, recordedLeaves, recordedPlan, type PlanRead } from "./plan-reading.js";
import { addWorktree, checkFields, expandHome, undoFailedSetup, type FieldErrors, type RepositoryPaths } from "./worktree-setup.js";

export interface EngineTools {
  git: string;
  gh: string;
  claude: string;
}

/** What the terminal prints while Kiln works (AC-START-09): one line per event. */
export type TerminalEvent =
  | { kind: "prd_started"; at: Date; branch: string; baseBranch: string }
  | { kind: "phase"; at: Date; phaseId: string; title: string; event: "started" | "stopped" | "done" | "interrupted" | "resumed"; pushedSha?: string }
  | { kind: "pull_request"; at: Date; event: "started" | "stopped" | "opened" | "interrupted" | "resumed"; number?: number }
  | { kind: "message"; text: string };

export type CommandResult = { ok: true } | { ok: false; status: 400 | 409; reason: string; fieldErrors?: FieldErrors };

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
  commits: { sha: string; subject: string }[];
  processRunning: boolean;
  reader?: SessionOutputReader;
}

export type DoneFirst = { phaseId: string; byPerson: boolean };

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
  /** git's message from a failed setup, held in memory only, cleared by the next Start. */
  startError: string | undefined;
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
  private lastCommitRefresh = 0;
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

  constructor(options: EngineOptions) {
    this.options = options;
    this.record = options.record;
    this.now = options.now ?? (() => new Date());
    this.git = { git: options.tools.git, env: options.env, signal: this.abort.signal };
    this.sleepReader = options.sleepReader ?? platformSleepReader();
  }

  get paths() {
    return this.options.paths;
  }

  get stateDirectory(): string {
    return this.options.stateDirectory;
  }

  get worktreePath(): string {
    return expandHome(this.record.settings.worktreePath);
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

  /** Resolves once the engine has nothing left to do until a command arrives. */
  async settled(): Promise<void> {
    while (this.driving) await this.driving;
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

    this.settingUp = true;
    this.startError = undefined;
    this.changed();
    try {
      const fields = await this.runFieldChecks();
      if (Object.keys(fields.errors).length > 0 || fields.startCommit === undefined) {
        return { ok: false, status: 409, reason: "The settings don't pass their checks.", fieldErrors: fields.errors };
      }
      const at = this.now().toISOString();
      record.startedAt = at;
      record.refinementConfirmedAt = at;
      record.baseCommit = fields.startCommit;
      this.save();
      const setup = await this.finishSetup();
      if (this.stopping) return refuse("Kiln is stopping.");
      if (!setup.ok) return { ok: false, status: 409, reason: this.startError ?? setup.error };
    } finally {
      this.settingUp = false;
      this.changed();
    }
    this.emit({ kind: "prd_started", at: this.now(), branch: record.settings.featureBranch, baseBranch: record.settings.baseBranch });
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
    const fixedFields = (["worktreePath", "featureBranch", "baseBranch"] as const).filter((field) => change[field] !== undefined);
    if (fixedFields.length > 0 && (this.record.startedAt !== undefined || this.settingUp)) {
      return refuse("The worktree, feature branch and base branch are fixed once Start is pressed.");
    }
    if (change.effort !== undefined && !EFFORT_LEVELS.includes(change.effort as Effort)) {
      return { ok: false, status: 400, reason: `Effort must be one of ${EFFORT_LEVELS.join(", ")}.` };
    }
    if (change.model !== undefined && change.model.trim() === "") return { ok: false, status: 400, reason: "Choose a model." };
    for (const [field, value] of Object.entries(change)) {
      if (value !== undefined) (this.record.settings as unknown as Record<string, unknown>)[field] = value;
    }
    this.save();
    if (change.keepAwake !== undefined) this.updateKeepAwake();
    if (fixedFields.length > 0) await this.runFieldChecks();
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
    if (this.settingUp || (record.startedAt !== undefined && record.setupCompletedAt === undefined)) {
      return { text: "Kiln stopped before phase 1 started.", grey: "kiln run picks it back up." };
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
        this.complete(check.pullRequest!, false);
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
      if (!leaf && !this.pullRequestPrecheckDone) {
        // A gh error here starts the pull-request session without showing it; that session's own check decides.
        const check = await this.pullRequestCheck(PR_PHASE_KEY);
        if (this.stopping) return;
        if (check.passed) {
          this.complete(check.pullRequest!, false);
          return;
        }
      }
      this.pullRequestPrecheckDone = false;
      if (record.pause.requestedAt !== undefined) {
        this.activatePause();
        return;
      }
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
    const facts = (record.phases[leafId] ??= { sessionIds: [], finishedByPerson: false });
    if (facts.startCommit === undefined) {
      const tip = await localBranchCommit(this.git, this.worktreePath, record.settings.featureBranch);
      if (tip !== undefined) facts.startCommit = tip;
    }
    const leaf = this.plan?.phases.find((phase) => phase.id === leafId);
    const prompt = phaseSessionPrompt({
      phaseDoc: `${this.paths.prdDirectoryFromRoot}/${leaf?.fileName ?? ""}`,
      featureName: this.paths.featureName,
      prdFile: this.prdFile(),
      worktreePath: this.worktreePath,
      branch: record.settings.featureBranch,
    });
    if (this.stopping) return "stopped";
    this.emit({ kind: "phase", at: this.now(), phaseId: leafId, title: leaf?.title ?? leafId, event: "started" });
    await this.launchSession(leafId, "phase", prompt);
    const verdict = await this.settleSession(leafId);
    return verdict.kind === "done" ? "done" : "stopped";
  }

  private async runPullRequestSession(): Promise<void> {
    const { record } = this;
    record.phases[PR_PHASE_KEY] ??= { sessionIds: [], finishedByPerson: false };
    const prompt = pullRequestSessionPrompt({
      featureName: this.paths.featureName,
      prdFile: this.prdFile(),
      branch: record.settings.featureBranch,
      baseBranch: record.settings.baseBranch,
      github: record.repository.github,
    });
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
    let session = this.latestSession(phaseKey);
    if (!session || session.runs.length > 0) {
      const { model, effort } = this.record.settings;
      session = {
        schemaVersion: SCHEMA_VERSION,
        sessionId: randomUUID(),
        phaseId: phaseKey,
        kind,
        createdAt: this.now().toISOString(),
        model,
        modelDisplayName: modelNameFromId(model),
        effort,
        runs: [],
        sleeps: [],
        steps: [],
      };
      writeSessionRecord(this.options.stateDirectory, session);
      facts.sessionIds.push(session.sessionId);
      this.save();
    }
    await this.runProcess(phaseKey, session, launchArguments(session.sessionId, session.model, session.effort), prompt, "launch");
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
    const prompt = resumePrompt({
      ...(recorded ? { cause: run.interruptedBy! } : {}),
      time: time.replace(/\.\d+Z$/, "Z"),
      ...(phaseKey === PR_PHASE_KEY ? {} : { phaseDoc: `${this.paths.prdDirectoryFromRoot}/${this.fileOf(phaseKey) ?? ""}` }),
    });
    this.emitSessionEvent(phaseKey, "resumed");
    await this.runProcess(phaseKey, session, resumeArguments(session.sessionId, session.initModel ?? session.model, session.effort), prompt, "resume");
  }

  /** Runs one process of a session, holding keep-awake while it runs and reading sleep around it. */
  private async runProcess(phaseKey: string, session: SessionRecord, args: string[], prompt: string, cause: SessionRun["cause"]): Promise<void> {
    if (this.stopping) return;
    this.watchSleep();
    await this.readSleep(true);
    if (this.stopping) return;
    const current: CurrentPhase = { phaseKey, session, commits: [], processRunning: true };
    this.current = current;
    this.interruptedKey = undefined;
    this.updateKeepAwake();
    this.changed();
    await runSessionProcess({
      claude: this.options.tools.claude,
      args,
      cwd: this.worktreePath,
      env: this.options.env,
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

  /** Reads the current phase's commits from Git while it works, at most every 5 seconds. */
  private async refreshCommits(current: CurrentPhase, force: boolean): Promise<void> {
    if (current.phaseKey === PR_PHASE_KEY) return;
    const start = this.record.phases[current.phaseKey]?.startCommit;
    if (start === undefined || (!force && Date.now() - this.lastCommitRefresh < 5_000)) return;
    this.lastCommitRefresh = Date.now();
    current.commits = await firstParentCommits(this.git, this.worktreePath, start, `refs/heads/${this.record.settings.featureBranch}`);
    this.changed();
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
          this.complete(check.pullRequest!, byPerson);
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
      this.complete(check.pullRequest!, false);
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
        this.complete(check.pullRequest!, true);
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
    this.activeCheck = phaseKey;
    // A wake during the check restarts its origin retry, so the sleep watch runs through it.
    this.watchSleep();
    try {
      const outcome = await runDoneCheck({
        git: this.git,
        mainCheckoutPath: this.paths.mainCheckoutPath,
        worktreePath: this.worktreePath,
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

  private async pullRequestCheck(phaseKey?: string) {
    if (phaseKey !== undefined) this.activeCheck = phaseKey;
    try {
      return await runPullRequestCheck({
        gh: this.options.tools.gh,
        env: this.options.env,
        mainCheckoutPath: this.paths.mainCheckoutPath,
        github: this.record.repository.github,
        branch: this.record.settings.featureBranch,
        baseBranch: this.record.settings.baseBranch,
        signal: this.abort.signal,
      });
    } finally {
      if (phaseKey !== undefined) this.activeCheck = undefined;
    }
  }

  private async recordDone(phaseKey: string, outcome: DoneCheckOutcome, byPerson: boolean): Promise<void> {
    const facts = this.record.phases[phaseKey]!;
    const sha = outcome.pushedSha!;
    facts.doneAt = this.now().toISOString();
    facts.pushedSha = sha;
    facts.finishedByPerson = byPerson;
    if (facts.startCommit !== undefined) {
      const count = await firstParentCount(this.git, this.worktreePath, facts.startCommit, sha);
      if (count !== undefined) facts.commitCount = count;
    }
    this.save();
    this.emit({ kind: "phase", at: this.now(), phaseId: outcome.judgedLeafId, title: this.titleOf(outcome.judgedLeafId), event: "done", pushedSha: sha });
  }

  private complete(pullRequest: PullRequestFacts, byPerson: boolean): void {
    const { record } = this;
    const facts = (record.phases[PR_PHASE_KEY] ??= { sessionIds: [], finishedByPerson: false });
    const at = this.now().toISOString();
    delete facts.stop;
    facts.doneAt = at;
    facts.finishedByPerson = byPerson;
    record.pullRequest = pullRequest;
    record.completedAt = at;
    // A pending pause is dropped, since nothing would start (UI-008).
    record.pause = {};
    this.current = undefined;
    this.save();
    this.emit({ kind: "pull_request", at: this.now(), event: "opened", number: pullRequest.number });
  }

  private activatePause(): void {
    this.record.pause.activeSince = this.now().toISOString();
    this.current = undefined;
    this.save();
  }

  private recordStop(phaseKey: string, kind: StopKind, checks: CheckResult[]): void {
    const at = this.now().toISOString();
    const facts = (this.record.phases[phaseKey] ??= { sessionIds: [], finishedByPerson: false });
    facts.stop = { kind, at, checks, checkedAt: at };
    this.save();
  }

  private updateStop(phaseKey: string, checks: CheckResult[]): void {
    const stop = this.record.phases[phaseKey]!.stop!;
    stop.checks = checks;
    stop.checkedAt = this.now().toISOString();
    this.save();
  }

  /**
   * A plan that doesn't read when no session has run since the last read: a `plan` stop on the
   * first leaf not closed in the recorded plan, or on the pull request when every leaf there is.
   */
  private recordPlanStop(problem: string): { kind: "plan_stop"; phaseKey: string } {
    const key = this.nextKeyFromRecordedPlan();
    this.current = undefined;
    this.recordStop(key, "plan", [{ name: CHECK_NAMES.plan, passed: false, fact: problem }]);
    if (key === PR_PHASE_KEY) this.emit({ kind: "pull_request", at: this.now(), event: "stopped" });
    else this.emit({ kind: "phase", at: this.now(), phaseId: key, title: this.titleOf(key), event: "stopped" });
    return { kind: "plan_stop", phaseKey: key };
  }

  // ---- Setup -----------------------------------------------------------------------------

  private async runFieldChecks() {
    const origin = await originBranches(this.git, this.paths.mainCheckoutPath);
    const outcome = await checkFields({
      git: this.git,
      paths: this.paths,
      settings: this.record.settings,
      prdTree: this.options.prdTree ?? "",
      origin,
      createdBranch: this.record.createdBranch,
    });
    this.fieldErrors = outcome.errors;
    return outcome;
  }

  /** Adds the worktree, or finishes an interrupted setup; a failure puts the feature back to not started. */
  private async finishSetup(): Promise<{ ok: true } | { ok: false; error: string }> {
    const input = { git: this.git, paths: this.paths, record: this.record, save: () => this.save(), now: this.now };
    const outcome = await addWorktree(input);
    // A step stopped by Ctrl+C, a closed terminal or a signal hasn't failed: the record is kept.
    if (outcome.ok || this.stopping) return outcome;
    await undoFailedSetup(input);
    this.startError = `Couldn’t set up the worktree: ${outcome.error}`;
    this.emit({ kind: "message", text: this.startError });
    return outcome;
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
