// The Snapshot every screen renders from (technical design, "Snapshot"), built from the
// engine's record, the plan as last read, what the engine is doing, and the account and model
// list once they have arrived.

import { readFileSync } from "node:fs";
import type { AccountView } from "../account/claude-account.js";
import { effortLevelsFor } from "../account/model-list.js";
import { join } from "node:path";
import { countAssumptions, countDesignCitations, countPrdCriteria } from "../plan/document-counts.js";
import { leavesOf, type PhasePlan } from "../plan/phase-plan.js";
import { STAYED_CHECK_NAME } from "../session/outside-workspace.js";
import { freshSessionOutsideNote, freshSessionPrompt, pullRequestSessionPrompt } from "../session/prompts.js";
import { stepStates, type OutputLine } from "../session/session-output.js";
import { blockingRow, limitRow } from "../session/usage-limit.js";
import type { StartCheckReport } from "../start-checks.js";
import { PR_PHASE_KEY, type CheckResult, type Effort, type PullRequestFacts, type RecordedPlanPhase, type RepositoryKind, type SessionRecord, type StopKind, type StopLimit } from "../state/records.js";
import type { Engine, RepositoryCommits } from "./engine.js";
import { judgedPhase, recordedLeaves } from "./plan-reading.js";
import { baseFor, displayPath, expandHome, type FieldErrors } from "./worktree-setup.js";

export const PR_TITLE = "Final pull request";

export type FeatureState = "not_started" | "implementing" | "paused" | "needs_you" | "waiting" | "complete";

/**
 * A usage limit as the waiting screen and a usage-limit Needs you show it (usage-limit recovery
 * AC-LIMIT-01 to 03, technical design "Snapshot"). `account` is the reading the Claude account
 * panel holds, once one started after the refusal; `percent` the stopping limit's row in it;
 * `atLimitUntil` that row's reset while it reads 100%; `blockingLimit`, on the waiting screen once
 * the reset has passed, another row at 100% that still keeps the account from having usage left.
 */
export interface LimitView {
  label: string;
  resetsAt?: string;
  resetPassed: boolean;
  account?: { email?: string; plan?: string; error?: string; percent?: number; at: string; atLimitUntil?: string };
  blockingLimit?: { label: string; resetsAt?: string };
}
type StepView = { name: string; state: "finished" | "current" | "unreached"; startedAt?: string };

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
  checks: { name: string; passed: boolean }[];
}

export interface PhaseView {
  id: string;
  title: string;
  file: string;
  state: "planned" | "next" | "implementing" | "needs_you" | "waiting" | "done" | "split";
  splitInto?: string[];
  sessionStartedAt?: string;
  doneAt?: string;
  pushedSha?: string;
  finishedByPerson: boolean;
  /** A multi-repository PRD's Done: how many repositories the phase pushed to, in place of its pushed commit (AC-PRS-03). */
  pushedRepositoryCount?: number;
  details?: {
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
    stoppedAt?: string;
  };
  documents?: DocumentsFound & { starting?: true; startError?: string };
  settings: {
    agent: "Claude Code";
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
  current?: {
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
  };
  needsYou?: {
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
    checks: CheckResult[];
    checkedAt: string;
    checking?: true;
    /** Resume, with its note, is offered (usage-limit recovery AC-RESUME-01). */
    resumeOffered: boolean;
    resumeCommand?: string;
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
     * While Stayed in the workspace fails (multi-repo AC-OUTSIDE-02, 03): each uncovered change's
     * fact; each uncovered missing or unreadable transcript's; the changed checkouts' folder names;
     * the prompt for the reopened session, when there are changes; and the confirmation.
     */
    outside?: {
      changes: string[];
      missingTranscripts: string[];
      checkouts: string[];
      prompt?: string;
      confirmation: { offered: boolean; ticked: boolean };
    };
    /** Kiln stopped this interrupted session instead of resuming it, since it worked outside the workspace (AC-OUTSIDE-04). */
    interrupted?: { at: string; atIsLastOutput: boolean };
    /** The stopped session hit a usage limit (usage-limit recovery AC-LIMIT-01 to 03); `refusedAgainAt` when Kiln's own resume was refused again (AC-AUTO-05). */
    limit?: LimitView & { refusedAgainAt?: string };
  };
  /**
   * Waiting for usage (usage-limit recovery AC-LIMIT-04): the limit, how the session ended
   * (AC-STOP-02) and Full session output's fields; `checking` while Resume now or the end of the
   * wait holds the lock.
   */
  waiting?: {
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
  /** The signed-in account and its usage, once the first calls return (Startup order). */
  account?: AccountView;
  /** Every pull request, in list order, once the PRD is complete (multi-repo AC-PRS-03). */
  pullRequests?: PullRequestFacts[];
}

/**
 * Builds the snapshot from the engine's state now.
 *
 *   const snapshot = buildSnapshot(engine, documentsFound);
 *   snapshot.feature.state  // "implementing"
 */
export function buildSnapshot(engine: Engine, documents?: DocumentsFound): Snapshot {
  const { record } = engine;
  const plan = record.plan ?? [];
  const leaves = recordedLeaves(plan);
  const stoppedKey = engine.stoppedPhaseKey();
  const waitingKey = engine.waitingPhaseKey();
  const state: FeatureState = !engine.isUnderway
    ? "not_started"
    : record.completedAt
      ? "complete"
      : stoppedKey !== undefined
        ? "needs_you"
        : waitingKey !== undefined
          ? "waiting"
          : record.pause.activeSince !== undefined
          ? "paused"
          : "implementing";

  const needsYou = stoppedKey === undefined ? undefined : needsYouView(engine, stoppedKey);
  const waiting = state === "waiting" ? waitingView(engine, waitingKey!) : undefined;
  const current = state === "implementing" ? currentView(engine) : undefined;
  const settings = record.settings;
  const entry = engine.modelEntry(settings.model);
  const claude = engine.claude;

  const snapshot: Snapshot = {
    feature: {
      name: engine.paths.featureName,
      repositoryName: engine.paths.repositoryName,
      multiRepository: engine.multiRepository,
      prdFolder: `${engine.paths.prdDirectoryFromRoot}/`,
      state,
      phasesDone: leaves.filter((leaf) => leaf.closed).length,
      phasesTotal: leaves.length,
      ...optional("currentPhaseId", needsYou?.phaseId ?? waiting?.phaseId ?? current?.phaseId),
      ...optional("startedAt", record.startedAt),
      ...optional("completedAt", record.completedAt),
      ...optional("stoppedAt", needsYou?.stoppedAt),
    },
    settings: {
      agent: "Claude Code",
      // A saved alias the list doesn't offer, or any model before the list loads, is named as saved.
      model: { value: settings.model, displayName: entry?.displayName ?? settings.model },
      effort: settings.effort,
      effortLevels: effortLevelsFor(entry),
      ...optional("modelListError", claude?.modelListError),
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
    ...optional("models", claude?.models?.map((model) => ({ value: model.value, displayName: model.displayName }))),
    phases: phaseViews(engine, state),
    pause: { pending: record.pause.requestedAt !== undefined && record.pause.activeSince === undefined, active: record.pause.activeSince !== undefined },
    ...optional("account", claude?.account),
    ...optional("pullRequests", record.pullRequests),
    ...optional("current", current),
    ...optional("needsYou", needsYou),
    ...optional("waiting", waiting),
  };
  if (state === "not_started" && documents) {
    snapshot.documents = { ...documents, ...(engine.settingUp ? { starting: true as const } : {}), ...optional("startError", engine.startError) };
  }
  return snapshot;
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

function currentView(engine: Engine): Snapshot["current"] {
  const current = engine.current;
  if (!current) return undefined;
  const plan = engine.record.plan ?? [];
  const session = current.session;
  const settings = engine.record.settings;
  if (!session) {
    return { phaseId: current.phaseKey, model: settings.model, effort: settings.effort, steps: stepStates([]), repositories: [] };
  }
  const steps = stepStates(session.steps);
  const latestStep = [...session.steps].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)).at(-1);
  let seen: { text: string; at: string } | undefined;
  if (latestStep) seen = { text: stepLine(latestStep.name), at: latestStep.startedAt };
  if (session.lastSkill && (!seen || session.lastSkill.at > seen.at)) seen = { text: `${session.lastSkill.name} skill started`, at: session.lastSkill.at };
  return {
    phaseId: judgedKeyFor(plan, current.phaseKey),
    sessionId: session.sessionId,
    model: session.modelDisplayName,
    ...optional("effort", session.effort),
    ...optional("startedAt", session.runs[0]?.startedAt),
    steps,
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
  const stop = record.phases[phaseKey]!.stop!;
  const plan = record.plan ?? [];
  const isPr = phaseKey === PR_PHASE_KEY;
  const judged = judgedKeyFor(plan, phaseKey);
  const outside = outsideView(engine, phaseKey);
  const base = {
    phaseId: judged,
    kind: stop.kind,
    checks: stop.checks,
    checkedAt: stop.checkedAt,
    ...(engine.checking ? { checking: true as const } : {}),
    resumeOffered: engine.resumeOffered(phaseKey),
    ...optional("outside", outside?.view),
    ...optional("limit", stop.limit === undefined ? undefined : { ...limitView(engine, phaseKey, stop.limit, false), ...optional("refusedAgainAt", stop.limit.refusedAgainAt) }),
  };
  const session = stop.kind === "plan" ? undefined : sessionFor(engine, phaseKey);
  // The folder the session started in; with no session, the one the phase's next session would start in (AC-SPACE-04).
  const folder = session ? engine.workingDirectoryOf(session) : engine.sessionFolder;
  // The fresh-session prompt carries the changes outside the workspace too (AC-OUTSIDE-02).
  const withOutside = (prompt: string) => (outside?.note === undefined ? prompt : `${prompt}\n\n${outside.note}`);
  const prompts = (ran: boolean) =>
    withOutside(
      isPr
        ? pullRequestSessionPrompt({
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
        : freshSessionPrompt(engine.phasePromptValues(engine.fileOf(judged) ?? "", folder), ran),
    );

  const freshSessionCommand = claudeCommand(folder);
  if (!session) return { ...base, stoppedAt: stop.at, freshSessionPrompt: prompts(false), freshSessionCommand };

  const run = session.runs.at(-1);
  const sessionFacts = {
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
      steps: stepStates(session.steps),
    };
  }
  // An interrupted session Kiln stopped instead of resuming shows when it was interrupted and its last lines (AC-OUTSIDE-04).
  const interrupted = stop.interrupted;
  const finalMessage = interrupted === undefined && run?.result?.text?.trim() ? run.result.text : undefined;
  // `claude --resume` needs the transcript Kiln couldn't find (OUT-003).
  const resumable = everStarted && !engine.transcriptMissing(session);
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
    ...(resumable ? { resumeCommand: resumeCommand(folder, session.sessionId) } : {}),
    freshSessionPrompt: prompts(everStarted),
    freshSessionCommand,
    outputLineCount: lines.length,
    sessionEndedAt: endedAt,
    steps: stepStates(session.steps),
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
    model: session?.modelDisplayName ?? engine.record.settings.model,
    ...optional("effort", session?.effort),
    ...optional("sessionStartedAt", session?.runs[0]?.startedAt),
    ...optional("sessionEndedAt", run?.endedAt),
    ...(session ? { steps: stepStates(session.steps) } : {}),
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
  const reading = engine.claude?.account;
  if (!found || !refusal || reading === undefined || Date.parse(reading.startedAt) < Date.parse(refusal.at)) return view;
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
 * Needs you's part for Stayed in the workspace while it fails (multi-repo AC-OUTSIDE-02, 03):
 * the facts and checkouts from the phase's latest check, the prompt for the reopened session,
 * the fresh-session prompt's addition, and whether the confirmation is ticked: a tick made
 * since the stop was last checked.
 */
function outsideView(engine: Engine, phaseKey: string): { view: NonNullable<Snapshot["needsYou"]>["outside"]; note?: string } | undefined {
  const facts = engine.record.phases[phaseKey]!;
  const stop = facts.stop!;
  if (!stop.checks.some((check) => check.name === STAYED_CHECK_NAME && !check.passed)) return undefined;
  const outcome = engine.latestStayed(phaseKey);
  const { changes, checkouts, prompt } = engine.uncoveredOutside(phaseKey);
  const multi = engine.multiRepository;
  const ticked = facts.outsideConfirmations.some((confirmation) => Date.parse(confirmation.at) > Date.parse(stop.checkedAt));
  return {
    view: {
      changes,
      missingTranscripts: outcome.transcripts.map((problem) => problem.fact),
      checkouts: [...new Set(checkouts.map((checkout) => checkout.name))],
      ...optional("prompt", prompt),
      confirmation: { offered: true, ticked },
    },
    ...(changes.length === 0 ? {} : { note: freshSessionOutsideNote(changes, checkouts.length, multi) }),
  };
}

/**
 * The command that reopens a stopped session in a terminal (AC-STOP-05): `cd <worktree>` then
 * `claude --resume <id>`, the path shown under `~/` and quoted only where the shell needs it.
 * On Windows, the PowerShell form.
 */
export function resumeCommand(worktreePath: string, sessionId: string, platform: NodeJS.Platform = process.platform): string {
  return claudeCommand(worktreePath, `--resume ${sessionId}`, platform);
}

/** `cd <worktree>` then `claude`, with any arguments: the path quoted as `resumeCommand` gives. */
export function claudeCommand(worktreePath: string, args?: string, platform: NodeJS.Platform = process.platform): string {
  const claude = args === undefined ? "claude" : `claude ${args}`;
  if (platform === "win32") return `cd '${worktreePath.replace(/'/g, "''")}'; ${claude}`;
  const shown = displayPath(worktreePath);
  const quote = (text: string) => (text === "" || /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`);
  const path = shown === "~" ? "~" : shown.startsWith("~/") ? `~/${quote(shown.slice(2))}` : quote(shown);
  return `cd ${path}\n${claude}`;
}

function phaseViews(engine: Engine, state: FeatureState): PhaseView[] {
  const { record } = engine;
  const plan = record.plan ?? [];
  // Kiln's facts are keyed by the leaf it launched; rows follow the plan as last read.
  const factsByRow = new Map<string, string>();
  for (const key of Object.keys(record.phases)) {
    if (key !== PR_PHASE_KEY) factsByRow.set(judgedKeyFor(plan, key), key);
  }
  const nextLeaf = recordedLeaves(plan).find((leaf) => !leaf.closed);
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
    if (facts?.doneAt) {
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
      // Done records its count and pushed commit; a stopped row has the commits Kiln read for the stop, newest first.
      const read = engine.stoppedCommits;
      const stopped = (view.state === "needs_you" || view.state === "waiting") && read?.phaseKey === key ? read?.commits : undefined;
      const prdStopped = stopped?.find((repository) => repository.name === engine.paths.repositoryName)?.commits;
      view.details = {
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
    return view;
  });

  if (recordedLeaves(plan).length > 0 && recordedLeaves(plan).every((leaf) => leaf.closed)) {
    const facts = record.phases[PR_PHASE_KEY];
    const session = sessionFor(engine, PR_PHASE_KEY);
    const startedAt = session?.runs[0]?.startedAt;
    const row: PhaseView = { id: PR_PHASE_KEY, title: PR_TITLE, file: "pull request session", state: "planned", finishedByPerson: facts?.finishedByPerson ?? false };
    if (record.completedAt) Object.assign(row, { state: "done", ...optional("doneAt", facts?.doneAt) });
    else if (facts?.stop) row.state = "needs_you";
    else if (facts?.wait) row.state = "waiting";
    else if (state === "implementing" && engine.current?.phaseKey === PR_PHASE_KEY) row.state = "implementing";
    else if (state === "paused") row.state = "next";
    if (startedAt) row.sessionStartedAt = startedAt;
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
