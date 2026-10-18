// The Snapshot every screen renders from (technical design, "Snapshot"), built from the
// engine's record, the plan as last read, what the engine is doing, and the account and model
// list once they have arrived.

import { readFileSync } from "node:fs";
import type { AccountView } from "../account/claude-account.js";
import { effortLevelsFor } from "../account/model-list.js";
import { join } from "node:path";
import { countAssumptions, countDesignCitations, countPrdCriteria } from "../plan/document-counts.js";
import { leavesOf, type PhasePlan } from "../plan/phase-plan.js";
import { freshSessionPrompt, pullRequestSessionPrompt } from "../session/prompts.js";
import { stepStates, type OutputLine } from "../session/session-output.js";
import { PR_PHASE_KEY, type CheckResult, type Effort, type PullRequestFacts, type RecordedPlanPhase, type SessionRecord, type StopKind } from "../state/records.js";
import type { Engine } from "./engine.js";
import { judgedPhase, recordedLeaves } from "./plan-reading.js";
import { displayPath, type FieldErrors } from "./worktree-setup.js";

export const PR_TITLE = "Final pull request";

export type FeatureState = "not_started" | "implementing" | "paused" | "needs_you" | "complete";
type StepView = { name: string; state: "finished" | "current" | "unreached"; startedAt?: string };

export interface DocumentsFound {
  prd: { file: string; criteriaCount: number; firstLabel?: string; lastLabel?: string };
  design: { file: string; criteriaCited: number };
  assumptions: { file: string; total: number; notYetConfirmed: number } | null;
  plan: { phaseDocCount: number; leafCount: number; closedCount: number; phases: { id: string; title: string; splitInto?: string[]; closed: boolean }[] };
  checks: { name: string; passed: boolean }[];
}

export interface PhaseView {
  id: string;
  title: string;
  file: string;
  state: "planned" | "next" | "implementing" | "needs_you" | "done" | "split";
  splitInto?: string[];
  sessionStartedAt?: string;
  doneAt?: string;
  pushedSha?: string;
  finishedByPerson: boolean;
  details?: { from: string; to?: string; model: string; effort?: Effort; worktree: string; branch: string; commitCount?: number; latestCommit?: string; sessionId: string };
}

export interface Snapshot {
  feature: {
    name: string;
    repositoryName: string;
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
    worktreePath: string;
    featureBranch: string;
    baseBranch: string;
    /** Not started only: the base field's list and whether the base check is running. */
    baseBranches?: string[];
    baseCheck?: "checking" | "ok" | "error";
    fixed: boolean;
    fieldErrors: FieldErrors;
  };
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
    commits: { sha: string; subject: string }[];
    reviewerWorking?: boolean;
  };
  needsYou?: {
    phaseId: string;
    kind: StopKind;
    stoppedAt: string;
    /** `stoppedAt` is the interrupted run's last output, since Kiln recorded no interruption time. */
    stoppedAtIsLastOutput?: true;
    finalMessage?: string;
    exitCode?: number;
    signal?: string;
    spawnError?: { code: string; message: string };
    lastSkill?: { name: string; at: string };
    lastLines?: OutputLine[];
    checks: CheckResult[];
    checkedAt: string;
    checking?: true;
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
    commits?: { sha: string; subject: string }[];
  };
  pause: { pending: boolean; active: boolean };
  /** The signed-in account and its usage, once the first calls return (Startup order). */
  account?: AccountView;
  pullRequest?: PullRequestFacts;
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
  const state: FeatureState = !engine.isUnderway
    ? "not_started"
    : record.completedAt
      ? "complete"
      : stoppedKey !== undefined
        ? "needs_you"
        : record.pause.activeSince !== undefined
          ? "paused"
          : "implementing";

  const needsYou = stoppedKey === undefined ? undefined : needsYouView(engine, stoppedKey);
  const current = state === "implementing" ? currentView(engine) : undefined;
  const settings = record.settings;
  const entry = engine.modelEntry(settings.model);
  const claude = engine.claude;

  const snapshot: Snapshot = {
    feature: {
      name: engine.paths.featureName,
      repositoryName: engine.paths.repositoryName,
      prdFolder: `${engine.paths.prdDirectoryFromRoot}/`,
      state,
      phasesDone: leaves.filter((leaf) => leaf.closed).length,
      phasesTotal: leaves.length,
      ...optional("currentPhaseId", needsYou?.phaseId ?? current?.phaseId),
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
      worktreePath: displayPath(settings.worktreePath),
      featureBranch: settings.featureBranch,
      baseBranch: settings.baseBranch,
      ...(state === "not_started" ? { ...optional("baseBranches", engine.baseBranches), ...optional("baseCheck", engine.baseCheck) } : {}),
      fixed: engine.isUnderway,
      fieldErrors: engine.currentFieldErrors,
    },
    ...optional("models", claude?.models?.map((model) => ({ value: model.value, displayName: model.displayName }))),
    phases: phaseViews(engine, state),
    pause: { pending: record.pause.requestedAt !== undefined && record.pause.activeSince === undefined, active: record.pause.activeSince !== undefined },
    ...optional("account", claude?.account),
    ...optional("pullRequest", record.pullRequest),
    ...optional("current", current),
    ...optional("needsYou", needsYou),
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
    return { phaseId: current.phaseKey, model: settings.model, effort: settings.effort, steps: stepStates([]), commits: [] };
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
    commits: current.commits,
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
  const base = {
    phaseId: judged,
    kind: stop.kind,
    checks: stop.checks,
    checkedAt: stop.checkedAt,
    ...(engine.checking ? { checking: true as const } : {}),
  };
  const phaseDoc = `${engine.paths.prdDirectoryFromRoot}/${engine.fileOf(judged) ?? ""}`;
  const prompts = (ran: boolean) =>
    isPr
      ? pullRequestSessionPrompt({
          featureName: engine.paths.featureName,
          prdFile: engine.prdFile(),
          branch: record.settings.featureBranch,
          baseBranch: record.settings.baseBranch,
          github: record.repository.github,
        })
      : freshSessionPrompt(
          { phaseDoc, featureName: engine.paths.featureName, prdFile: engine.prdFile(), worktreePath: engine.worktreePath, branch: record.settings.featureBranch },
          ran,
        );

  const freshSessionCommand = claudeCommand(engine.worktreePath);
  const session = stop.kind === "plan" ? undefined : sessionFor(engine, phaseKey);
  if (!session) return { ...base, stoppedAt: stop.at, freshSessionPrompt: prompts(false), freshSessionCommand };

  const run = session.runs.at(-1);
  const sessionFacts = {
    sessionId: session.sessionId,
    model: session.modelDisplayName,
    ...optional("effort", session.effort),
    ...optional("sessionStartedAt", session.runs[0]?.startedAt),
    commits: engine.stoppedCommits?.phaseKey === phaseKey ? engine.stoppedCommits.commits : [],
  };
  const everStarted = session.runs.some((candidate) => candidate.pid !== undefined);
  const lines = engine.outputLines(session);
  const endedAt = run?.endedAt ?? stop.at;
  if (stop.kind === "not_resumable") {
    // In place of AC-STOP-02's list: when the session was interrupted, its last lines, and the
    // fresh session with no resume command (AC-KEEP-05). The interrupted run is the one before the failed resume.
    const interruptedIndex = session.runs.length - 2;
    const interrupted = session.runs[interruptedIndex];
    const lastOutput = interrupted?.interruptedAt === undefined;
    const stoppedAt = interrupted?.interruptedAt ?? (interrupted ? engine.runLastOutputAt(session, interruptedIndex) : undefined) ?? endedAt;
    return {
      ...base,
      ...sessionFacts,
      stoppedAt,
      ...(lastOutput ? { stoppedAtIsLastOutput: true as const } : {}),
      lastLines: lines.slice(-10),
      freshSessionPrompt: prompts(true),
      freshSessionCommand,
      outputLineCount: lines.length,
      sessionEndedAt: endedAt,
      steps: stepStates(session.steps),
    };
  }
  const finalMessage = run?.result?.text?.trim() ? run.result.text : undefined;
  return {
    ...base,
    ...sessionFacts,
    stoppedAt: endedAt,
    ...optional("finalMessage", finalMessage),
    ...optional("exitCode", run?.exitCode),
    ...optional("signal", run?.signal),
    ...optional("spawnError", run?.spawnError),
    ...(everStarted ? optional("lastSkill", session.lastSkill) : {}),
    ...(finalMessage === undefined ? { lastLines: lines.slice(-10) } : {}),
    ...(everStarted ? { resumeCommand: resumeCommand(engine.worktreePath, session.sessionId) } : {}),
    freshSessionPrompt: prompts(everStarted),
    freshSessionCommand,
    outputLineCount: lines.length,
    sessionEndedAt: endedAt,
    steps: stepStates(session.steps),
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
  const currentRow = engine.current ? judgedKeyFor(plan, engine.current.phaseKey) : undefined;

  const rows: PhaseView[] = plan.map((phase) => {
    const base = { id: phase.id, title: phase.title, file: phase.file, finishedByPerson: false };
    if (phase.splitInto !== undefined) return { ...base, state: "split" as const, splitInto: phase.splitInto };
    const key = factsByRow.get(phase.id);
    const facts = key === undefined ? undefined : record.phases[key];
    const session = key === undefined ? undefined : sessionFor(engine, key);
    const view: PhaseView = { ...base, state: "planned" };
    if (facts?.doneAt) Object.assign(view, { state: "done", doneAt: facts.doneAt, finishedByPerson: facts.finishedByPerson }, optional("pushedSha", facts.pushedSha));
    else if (facts?.stop) view.state = "needs_you";
    else if (state === "implementing" && currentRow === phase.id) view.state = "implementing";
    else if (phase.closed) view.state = "done";
    else if (state === "paused" && nextLeaf?.id === phase.id) view.state = "next";
    const firstSession = key === undefined ? undefined : engine.sessionRecord(key, facts!.sessionIds[0] ?? "");
    const startedAt = firstSession?.runs[0]?.startedAt;
    if (startedAt && session) {
      view.sessionStartedAt = startedAt;
      view.details = {
        from: startedAt,
        ...optional("to", facts?.doneAt ?? session.runs.at(-1)?.endedAt),
        model: session.modelDisplayName,
        ...optional("effort", session.effort),
        worktree: displayPath(record.settings.worktreePath),
        branch: record.settings.featureBranch,
        ...optional("commitCount", facts?.commitCount),
        ...optional("latestCommit", facts?.pushedSha),
        sessionId: session.sessionId,
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
export function documentsFound(prdDirectory: string, folderName: string, plan: PhasePlan, phaseDocCount: number, hasAssumptions: boolean): DocumentsFound {
  const read = (name: string) => readFileSync(join(prdDirectory, name), "utf8");
  const prdFile = `${folderName}-prd.md`;
  const criteria = countPrdCriteria(read(prdFile));
  const leaves = leavesOf(plan);
  return {
    prd: { file: prdFile, criteriaCount: criteria.count, ...optional("firstLabel", criteria.firstLabel), ...optional("lastLabel", criteria.lastLabel) },
    design: { file: "technical-design.md", criteriaCited: countDesignCitations(read("technical-design.md"), criteria.labels) },
    assumptions: hasAssumptions ? { file: "assumptions.md", ...countAssumptions(read("assumptions.md")) } : null,
    plan: {
      phaseDocCount,
      leafCount: leaves.length,
      closedCount: leaves.filter((leaf) => leaf.closed).length,
      phases: plan.phases.map((phase) => ({ id: phase.id, title: phase.title, ...optional("splitInto", phase.splitInto), closed: phase.closed })),
    },
    checks: [
      { name: "Every phase cites its criteria", passed: true },
      { name: "Dependencies point backward", passed: true },
      { name: "Working tree is clean", passed: true },
    ],
  };
}
