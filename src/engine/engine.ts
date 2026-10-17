// The engine: works out where a feature stands, picks the next phase, runs its session, runs
// the done check, and owns Kiln's record (technical design, "Workload Type and Starting Point",
// "Where a Feature Stands", engine loop). The server and view reach it only through its
// commands (start, pause, cancel a pause, check again, change settings) and its snapshots. State
// is kept per phase and per session; the next phase is chosen in one function, `nextLeaf`.

import { randomUUID } from "node:crypto";
import type { PhasePlan } from "../plan/phase-plan.js";
import { launchArguments, modelNameFromId, readOutputLines, runSessionProcess } from "../session/claude-session.js";
import { phaseSessionPrompt, pullRequestSessionPrompt } from "../session/prompts.js";
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
  type PrdRecord,
  type PullRequestFacts,
  type SessionRecord,
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
  | { kind: "phase"; at: Date; phaseId: string; title: string; event: "started" | "stopped" | "done"; pushedSha?: string }
  | { kind: "pull_request"; at: Date; event: "started" | "stopped" | "opened"; number?: number }
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
}

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
  | { kind: "interrupted"; phaseKey: string; sessionId: string }
  | { kind: "setup_failed"; error: string };

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

  constructor(options: EngineOptions) {
    this.options = options;
    this.record = options.record;
    this.now = options.now ?? (() => new Date());
    this.git = { git: options.tools.git, env: options.env };
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
    if (fixedFields.length > 0) await this.runFieldChecks();
    this.changed();
    return { ok: true };
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
          return { kind: "interrupted", phaseKey: latest.phaseKey, sessionId: latest.session.sessionId };
        }
        // It ended on its own, and Kiln stopped before recording the verdict: judged as after any session.
        this.current = { phaseKey: latest.phaseKey, session: latest.session, commits: [], processRunning: false };
        const verdict = await this.judgeEndedSession(latest.phaseKey, false);
        if (verdict.kind === "complete") return { kind: "complete" };
        if (verdict.kind === "stopped") return { kind: "needs_you", phaseKey: latest.phaseKey, again: false };
        doneFirst = { phaseId: verdict.judgedId, byPerson: false };
      }
    }
    const withDone = <T extends object>(decision: T) => (doneFirst ? { ...decision, doneFirst } : decision);

    if (record.pause.activeSince !== undefined) return withDone({ kind: "paused" as const, beforePhaseKey: this.nextKeyFromRecordedPlan() });
    // What the engine loop does next, in its order.
    const read = this.readPlan();
    if (!read.ok) return withDone(this.recordPlanStop(read.problem));
    const leaf = nextLeaf(read.plan);
    if (!leaf) {
      const check = await this.pullRequestCheck();
      if (check.passed) {
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
      if (!this.isUnderway || record.completedAt) return;
      if (this.stoppedPhaseKey() !== undefined) return;
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
        const check = await this.pullRequestCheck();
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
    this.emit({ kind: "phase", at: this.now(), phaseId: leafId, title: leaf?.title ?? leafId, event: "started" });
    await this.runSession(leafId, "phase", prompt);
    const verdict = await this.judgeEndedSession(leafId, false);
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
    await this.runSession(PR_PHASE_KEY, "pull_request", prompt);
    await this.judgeEndedSession(PR_PHASE_KEY, false);
  }

  /**
   * Runs one session for a phase. The session record is written before spawning; a session
   * recorded but never started (Kiln stopped in between) is launched as planned, same ID.
   */
  private async runSession(phaseKey: string, kind: SessionRecord["kind"], prompt: string): Promise<void> {
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

    const current: CurrentPhase = { phaseKey, session, commits: [], processRunning: true };
    this.current = current;
    this.changed();
    await runSessionProcess({
      claude: this.options.tools.claude,
      args: launchArguments(session.sessionId, session.model, session.effort),
      cwd: this.worktreePath,
      env: this.options.env,
      prompt,
      cause: "launch",
      stateDirectory: this.options.stateDirectory,
      record: session,
      now: this.now,
      onReader: (reader) => (current.reader = reader),
      onOutput: (lines) => {
        current.latestLine = lines[lines.length - 1]!;
        for (const listener of this.outputListeners) listener(session.sessionId, lines);
        void this.refreshCommits(current, false);
        this.changed();
      },
      onRecordChange: () => this.changed(),
    });
    current.processRunning = false;
    await this.refreshCommits(current, true);
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

  /** Judges a phase after its session ended on its own: its check alone decides (AC-DONE-02, AC-STOP-01). */
  private async judgeEndedSession(phaseKey: string, byPerson: boolean): Promise<{ kind: "done"; judgedId: string } | { kind: "complete" } | { kind: "stopped" }> {
    try {
      if (phaseKey === PR_PHASE_KEY) {
        const check = await this.pullRequestCheck();
        if (check.passed) {
          this.complete(check.pullRequest!, byPerson);
          return { kind: "complete" };
        }
        this.recordStop(PR_PHASE_KEY, "pull_request_check", [check.check]);
        this.emit({ kind: "pull_request", at: this.now(), event: "stopped" });
        return { kind: "stopped" };
      }
      const outcome = await this.doneCheck(phaseKey);
      if (outcome.passed) {
        await this.recordDone(phaseKey, outcome, byPerson);
        return { kind: "done", judgedId: outcome.judgedLeafId };
      }
      this.recordStop(phaseKey, "done_check", outcome.checks);
      this.emit({ kind: "phase", at: this.now(), phaseId: outcome.judgedLeafId, title: this.titleOf(outcome.judgedLeafId), event: "stopped" });
      return { kind: "stopped" };
    } finally {
      this.current = undefined;
      this.changed();
    }
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
      const check = await this.pullRequestCheck();
      if (check.passed) {
        this.complete(check.pullRequest!, true);
        return "complete";
      }
      this.updateStop(phaseKey, [check.check]);
      return "still_stopped";
    }
    const outcome = await this.doneCheck(phaseKey);
    if (!outcome.passed) {
      this.updateStop(phaseKey, outcome.checks);
      return "still_stopped";
    }
    delete facts.stop;
    await this.recordDone(phaseKey, outcome, true);
    return "done";
  }

  private async doneCheck(phaseKey: string): Promise<DoneCheckOutcome> {
    const outcome = await runDoneCheck({
      git: this.git,
      mainCheckoutPath: this.paths.mainCheckoutPath,
      worktreePath: this.worktreePath,
      prdDirectoryFromRoot: this.paths.prdDirectoryFromRoot,
      branch: this.record.settings.featureBranch,
      launchedLeafId: phaseKey,
      ...(this.options.originRetryMs === undefined ? {} : { originRetryMs: this.options.originRetryMs }),
    });
    if (outcome.plan.ok) this.acceptPlan(outcome.plan.plan);
    return outcome;
  }

  private pullRequestCheck() {
    return runPullRequestCheck({
      gh: this.options.tools.gh,
      env: this.options.env,
      mainCheckoutPath: this.paths.mainCheckoutPath,
      github: this.record.repository.github,
      branch: this.record.settings.featureBranch,
      baseBranch: this.record.settings.baseBranch,
    });
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
    if (outcome.ok) return outcome;
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
