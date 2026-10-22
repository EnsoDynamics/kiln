// What the progress screens say, worked out from the snapshot: the header's state (PRD
// AC-WATCH-02), how a phase is named (AC-PR-05), each plan row's facts (AC-WATCH-01), and the
// Needs you screen's copy for every kind of stop (AC-STOP-02, AC-STOP-03; assumptions UI-007).
// The view derives "Interrupted" itself: Kiln is never running while a phase is interrupted, so
// a snapshot never says it (technical design, "Snapshot").

import type { PhaseView, RepositoryDetails, RepositoryRow, Snapshot } from "../../../src/engine/snapshot.js";
import type { Effort } from "../../../src/state/records.js";
import { EFFORT_LABELS, joinAnd, plural } from "./documents-found.js";
import { clockTime, shortDuration, timeSpan } from "./time.js";

export const PR_ID = "pr";
type NeedsYou = NonNullable<Snapshot["needsYou"]>;

/** "phase 2b", or "the pull request" (AC-PR-05). */
export function phaseName(id: string): string {
  return id === PR_ID ? "the pull request" : `phase ${id}`;
}

/** "Phase 2b", or "The pull request". */
export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "phase 2b of 5", or "the pull request", which isn't counted (AC-PR-05). */
export function phaseOfTotal(snapshot: Snapshot, id: string): string {
  return id === PR_ID ? "the pull request" : `phase ${id} of ${snapshot.feature.phasesTotal}`;
}

/** "Opus 5.5 · high effort", or the model alone when it takes no effort (UI-011 item 2). */
export function modelAndEffort(model: string, effort: Effort | undefined): string {
  return effort === undefined ? model : `${model} · ${EFFORT_LABELS[effort].toLowerCase()} effort`;
}

/** The settings' model and effort: no effort when the chosen model takes none. */
export function settingsModel(settings: Snapshot["settings"]): string {
  return modelAndEffort(settings.model.displayName, settings.effortLevels?.length === 0 ? undefined : settings.effort);
}

export type HeaderKind = "implementing" | "interrupted" | "paused" | "needs_you" | "complete";

/** The pill under the feature name and the facts beside it (AC-WATCH-02). */
export function headerState(snapshot: Snapshot, connected: boolean, now: Date): { kind: HeaderKind; label: string; facts: string[] } {
  const { feature } = snapshot;
  const done = `${feature.phasesDone} of ${feature.phasesTotal} phases done`;
  const current = feature.currentPhaseId ?? snapshot.current?.phaseId;
  switch (feature.state) {
    case "needs_you": {
      const stopped = snapshot.needsYou!;
      const row = snapshot.phases.find((phase) => phase.id === stopped.phaseId);
      const which = stopped.phaseId === PR_ID ? "PR" : `Phase ${stopped.phaseId}`;
      return { kind: "needs_you", label: "Needs you", facts: [`${which} · ${row?.title ?? ""}`, `Stopped ${clockTime(stopped.stoppedAt, now, { afterWord: true })}`] };
    }
    case "paused":
      return { kind: "paused", label: "Paused", facts: [done] };
    case "complete": {
      const facts = [done];
      if (feature.startedAt && feature.completedAt) facts.push(shortDuration(Date.parse(feature.completedAt) - Date.parse(feature.startedAt)));
      if (feature.completedAt) facts.push(`Finished ${clockTime(feature.completedAt, now, { afterWord: true })}`);
      return { kind: "complete", label: "PR ready for review", facts };
    }
    default:
      if (!connected) return { kind: "interrupted", label: `Interrupted in ${phaseName(current ?? "")}`, facts: [done] };
      return { kind: "implementing", label: `Implementing ${phaseName(current ?? "")}`, facts: [done] };
  }
}

export type RowState = PhaseView["state"] | "interrupted";

/** A row's state as drawn: an Implementing phase shows as Interrupted once the view has lost Kiln (AC-WATCH-01). */
export function rowState(row: PhaseView, connected: boolean): RowState {
  return row.state === "implementing" && !connected ? "interrupted" : row.state;
}

/**
 * The pull-request session's Done pill: v1's "Opened #218" for one repository, and the count of
 * pull requests for more than one (multi-repo AC-PRS-03).
 */
export function openedLabel(snapshot: Snapshot): string | undefined {
  const pullRequests = snapshot.pullRequests ?? [];
  if (pullRequests.length === 0) return undefined;
  if (!snapshot.feature.multiRepository) return `Opened #${pullRequests[0]!.number}`;
  return `Opened ${plural(pullRequests.length, "pull request", "pull requests")}`;
}

/** The pill's words for a row; `opened` is the pull-request session's, from `openedLabel`. */
export function rowPill(row: PhaseView, state: RowState, opened: string | undefined): string {
  switch (state) {
    case "done":
      return row.id === PR_ID && opened !== undefined ? opened : "Done";
    case "split":
      return `Split into ${(row.splitInto ?? []).join(", ")}`;
    case "implementing":
      return "Implementing";
    case "interrupted":
      return "Interrupted";
    case "needs_you":
      return "Needs you";
    case "next":
      return "Next";
    default:
      return "Planned";
  }
}

/**
 * The facts beside a row's pill: a Done phase's time and pushed commit, or for a
 * multi-repository PRD how many repositories it pushed to (multi-repo AC-PRS-03); an
 * Implementing phase's time since its session started, and an Interrupted one's time until the
 * view lost Kiln.
 *
 *   rowFacts(done, "done", now)  // "52m · pushed a1c4e09", or "1h 19m · finished by you · pushed to 4 repositories"
 */
export function rowFacts(row: PhaseView, state: RowState, now: number): string | undefined {
  if (state === "done") {
    if (row.sessionStartedAt === undefined || row.doneAt === undefined) return undefined;
    const parts = [shortDuration(Date.parse(row.doneAt) - Date.parse(row.sessionStartedAt))];
    if (row.finishedByPerson) parts.push("finished by you");
    if (row.pushedRepositoryCount !== undefined) {
      if (row.pushedRepositoryCount > 0) parts.push(`pushed to ${plural(row.pushedRepositoryCount, "repository", "repositories")}`);
    } else if (row.pushedSha) parts.push(`pushed ${row.pushedSha.slice(0, 7)}`);
    return parts.join(" · ");
  }
  if ((state === "implementing" || state === "interrupted") && row.sessionStartedAt !== undefined) {
    return shortDuration(now - Date.parse(row.sessionStartedAt));
  }
  return undefined;
}

/** The phase's commits in one repository, as a current-phase panel lists them. */
export interface RepositoryCommitsView {
  name: string;
  addedInPhase?: string;
  commits: { sha: string; subject: string }[];
}

/** A Details row: a term and its value, and under a multi-repository PRD's Commits, the repositories it counts. */
export interface DetailRow {
  term: string;
  value: string;
  mono?: true;
  /** Each repository's worktree, branch, commit count and latest commit (Complete's Details). */
  repositories?: RepositoryDetails[];
  /** Each repository's commits, `sha subject` (the current-phase panel). */
  commits?: RepositoryCommitsView[];
}

/**
 * A phase's Details rows (AC-WATCH-01): when it ran, the model and effort, its worktree, branch,
 * commits and session. A multi-repository PRD's Details give each repository's worktree, branch
 * and commits under Commits in place of the one worktree and branch (multi-repo AC-PRS-03).
 */
export function detailRows(details: NonNullable<PhaseView["details"]>, now: Date): DetailRow[] {
  const rows: DetailRow[] = [];
  if (details.to !== undefined) rows.push({ term: "Ran", value: timeSpan(details.from, details.to, now) });
  rows.push({ term: "Model", value: modelAndEffort(details.model, details.effort) });
  if (details.repositories !== undefined) {
    const total = details.repositories.reduce((sum, repository) => sum + repository.commitCount, 0);
    rows.push({ term: "Commits", value: commitsAcross(total, details.repositories.length), ...(total > 0 ? { repositories: details.repositories } : {}) });
    rows.push({ term: "Session", value: details.sessionId, mono: true });
    return rows;
  }
  rows.push({ term: "Worktree", value: details.worktree, mono: true });
  rows.push({ term: "Branch", value: details.branch, mono: true });
  if (details.commitCount !== undefined) rows.push({ term: "Commits", value: commitsLine(details.commitCount, details.latestCommit) });
  rows.push({ term: "Session", value: details.sessionId, mono: true });
  return rows;
}

/** "3 in 2 repositories", or "None yet for this phase" (multi-repo AC-PRS-03). */
export function commitsAcross(count: number, repositoryCount: number): string {
  if (count === 0) return "None yet for this phase";
  return `${count} in ${plural(repositoryCount, "repository", "repositories")}`;
}

/** "1 commit · latest 3e8b2f1": one repository's line under a multi-repository PRD's Commits. */
export function repositoryCommitsLine(count: number, latest: string): string {
  return `${plural(count, "commit", "commits")} · latest ${latest.slice(0, 7)}`;
}

/** The phase's commits by repository, each with its added-in-phase label from the PRD's repositories. */
export function commitsByRepository(snapshot: Snapshot, repositories: { name: string; commits: { sha: string; subject: string }[] }[]): RepositoryCommitsView[] {
  return repositories.map((repository) => {
    const addedInPhase = snapshot.repositories.find((row) => row.name === repository.name)?.addedInPhase;
    return { name: repository.name, ...(addedInPhase === undefined ? {} : { addedInPhase }), commits: repository.commits };
  });
}

/** "added in phase 2b" (multi-repo AC-ADD-03). */
export function addedLabel(phaseId: string): string {
  return `added in phase ${phaseId}`;
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/**
 * The repositories' count under the workspace folder, with the ones sessions added (multi-repo
 * AC-SPACE-05, AC-ADD-03).
 *
 *   repositoriesLine(rows)  // "4 repositories, one added in phase 2b"
 */
export function repositoriesLine(rows: RepositoryRow[]): string {
  const count = plural(rows.length, "repository", "repositories");
  const added = rows.filter((row) => row.addedInPhase !== undefined);
  if (added.length === 0) return count;
  const phases = [...new Set(added.map((row) => row.addedInPhase!))];
  const many = COUNT_WORDS[added.length] ?? String(added.length);
  return `${count}, ${many} added in ${phases.length === 1 ? "phase" : "phases"} ${joinAnd(phases)}`;
}

/**
 * A folder as the screens show it, ending in "/", split before its last name, where the
 * multi-repo mockups let it break.
 *
 *   folderShown("~/devel/acme/.worktrees/customer-returns")  // ["~/devel/acme/.worktrees/", "customer-returns/"]
 */
export function folderShown(path: string): [string, string] {
  const folder = path.endsWith("/") ? path : `${path}/`;
  const end = folder.slice(0, -1).lastIndexOf("/") + 1;
  return [folder.slice(0, end), folder.slice(end)];
}

/** "3 · latest a1c4e09", or "None yet for this phase". */
export function commitsLine(count: number, latest: string | undefined): string {
  if (count === 0) return "None yet for this phase";
  return latest ? `${count} · latest ${latest.slice(0, 7)}` : `${count}`;
}

/** The phase Paused holds after: the Done phase that finished last, when it ran in Kiln. */
export function pausedAfter(snapshot: Snapshot): PhaseView | undefined {
  return snapshot.phases
    .filter((phase) => phase.id !== PR_ID && phase.state === "done" && phase.doneAt !== undefined)
    .sort((a, b) => Date.parse(a.doneAt!) - Date.parse(b.doneAt!))
    .at(-1);
}

/** The phase Paused starts next: the row in Next. */
export function nextPhase(snapshot: Snapshot): PhaseView | undefined {
  return snapshot.phases.find((phase) => phase.state === "next");
}

export interface NeedsYouCopy {
  headline: string;
  /** The line under the headline. */
  line: string;
  /** The facts row: the exit, the time it stopped, the last skill seen. Absent when no session ran or it can't be resumed. */
  showFacts: boolean;
  /** Step 1: the resume command, a fresh session in its place, or nothing at a broken plan. */
  firstStep: "resume" | "fresh" | "none";
  /** The "Session can't be opened?" link, left out where step 1 already offers the fresh session. */
  freshLink: boolean;
  finishTitle: string;
  finishText: string;
  checkAgainText: string;
  sideHeading: string;
  /** The line under Check again; empty when the stop shows none. */
  footnote: string;
  /**
   * Steps 2 and 3 after work outside the workspace, in place of finishing the phase (multi-repo
   * AC-OUTSIDE-02, AC-OUTSIDE-03): the prompt for the reopened session, or, when Kiln has no
   * transcript to go on, what to check by hand; then the confirmation.
   */
  outside?: { title: string; prompt?: string; text?: string; againTitle: string; againText: string };
  /** What Resume does, and the note's placeholder, when Resume is offered (usage-limit recovery AC-RESUME-01 to 03). */
  resumeText: string;
  notePlaceholder: string;
}

const MISSING_TRANSCRIPT = "No transcript found for session ";

/** `design-system’s own checkout`, `design-system’s and storefront’s own checkouts`, or `your own checkouts`. */
function ownCheckouts(names: string[]): string {
  if (names.length === 0) return "your own checkouts";
  const owned = names.map((name) => `${name}’s`);
  return `${owned.length === 1 ? owned[0] : `${owned.slice(0, -1).join(", ")} and ${owned.at(-1)}`} own checkout${names.length === 1 ? "" : "s"}`;
}

function joinedNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Steps 2 and 3 for Stayed in the workspace, as the outside-workspace mockup draws them. */
function outsideSteps(stop: NeedsYou, afterCheck: string): NeedsYouCopy["outside"] {
  const outside = stop.outside!;
  const names = outside.checkouts;
  const againTitle = "Come back, confirm and check again";
  if (outside.changes.length > 0) {
    const where = joinedNames(names);
    return {
      title: stop.phaseId === PR_ID ? `Ask it what still needs putting back in ${where || "those checkouts"}` : `Ask it to bring its ${where ? `${where} ` : ""}work into the workspace`,
      ...(outside.prompt === undefined ? {} : { prompt: outside.prompt }),
      againTitle,
      againText: `Once what’s left in ${ownCheckouts(names)} is put back, tick the confirmation on the right and press Check again. ${afterCheck}`,
    };
  }
  const missing = outside.missingTranscripts.some((fact) => fact.startsWith(MISSING_TRANSCRIPT));
  return {
    title: "Check your own checkouts for anything this session changed",
    text: `${missing ? "Kiln found no transcript for this session" : "Kiln couldn’t read this session’s transcript"}, so it can’t see what it did outside the workspace. Deal with anything it changed however you like.`,
    againTitle,
    againText: `Once your checkouts are as they should be, tick the confirmation on the right and press Check again. ${afterCheck}`,
  };
}

/**
 * The Needs you screen's copy for the stop: as drawn for a phase that failed the done check,
 * and with UI-007's lines for the pull request, a session that can't be resumed, a broken plan,
 * and a session Kiln couldn't start or restart.
 */
export function needsYouCopy(stop: NeedsYou, settings: Snapshot["settings"], now: Date, multiRepository = false): NeedsYouCopy {
  const isPr = stop.phaseId === PR_ID;
  const name = capitalized(phaseName(stop.phaseId));
  const copy: NeedsYouCopy = {
    headline: isPr ? "The pull-request session ended before it was done." : `${name} ended before it was done.`,
    line: "",
    showFacts: true,
    firstStep: "resume",
    freshLink: true,
    finishTitle: isPr ? "Open the pull request with Claude, the way you normally would" : "Finish the phase with Claude, the way you normally would",
    finishText: isPr
      ? multiRepository
        ? `Open them however you like. Kiln only looks for an open pull request from ${settings.featureBranch} into each repository’s base branch, in every repository that changed, that isn’t a draft, so it doesn’t matter who opens them.`
        : `Open it however you like. Kiln only looks for an open pull request from ${settings.featureBranch} into ${settings.baseBranch} that isn’t a draft, so it doesn’t matter who opens it.`
      : `Finish it however you like. Kiln only looks at the ${stop.checks.length === 4 ? "four" : "three"} checks on the right, so it doesn’t matter how the phase gets closed, committed and pushed.`,
    checkAgainText: isPr
      ? "Kiln re-checks GitHub. If the pull request is open and ready for review, the feature is complete."
      : "Kiln re-checks Git. If the phase is done, it starts the next one, or pauses first if you pressed Pause after this phase.",
    sideHeading: isPr ? "Kiln finishes when" : "Kiln continues when",
    footnote: isPr ? "This is the check Kiln runs after the pull-request session." : "This is the same check Kiln runs after every phase. Later phases wait until it passes.",
    // The pull-request session carries on opening the pull request in place of the phase (usage-limit recovery technical design, "Screens").
    resumeText: isPr
      ? `Kiln checks GitHub first. If ${multiRepository ? "the pull requests aren’t all open" : "the pull request isn’t open"}, it picks up the same session, with its full history, and tells it to carry on opening ${multiRepository ? "the pull requests" : "the pull request"}.`
      : `Kiln checks Git first. If the phase isn’t done, it picks up the same session, with its full history, and tells it to carry on with ${name}. Then the plan continues as usual.`,
    notePlaceholder: `It gets this in your words, then the instruction to carry on ${isPr ? `opening ${multiRepository ? "the pull requests" : "the pull request"}` : "with the phase"}.`,
  };

  if (stop.kind === "plan") {
    return {
      ...copy,
      headline: `${name} hasn’t started.`,
      line: "Kiln read the phase plan and found the problem shown on the right.",
      showFacts: false,
      firstStep: "none",
      finishTitle: "Fix the phase plan",
      finishText: "Kiln only checks that the plan reads: every phase file has its own phase number, every `## Split into` row has a file, and every phase file is listed.",
      // Nothing ran, so the screen shows only the plan problem, the fresh-session link and Check again (UI-007 item 3).
      sideHeading: "Kiln continues when",
      footnote: "",
      checkAgainText: `Kiln reads the plan again. If it reads, Kiln starts ${phaseName(stop.phaseId)}, or pauses first if you pressed Pause.`,
    };
  }
  if (stop.outside) {
    // What Check again then does, as the mockup's step 3 says it.
    const afterCheck = isPr
      ? `If ${multiRepository ? "every pull request" : "the pull request"} is open and ready for review, the feature is complete.`
      : "If the phase is done, Kiln starts the next one, or pauses first if you pressed Pause after this phase.";
    copy.outside = outsideSteps(stop, afterCheck);
  }
  // A session that ran with no resume command has no transcript for `claude --resume`: step 1 is the fresh session (OUT-003).
  if (stop.sessionId !== undefined && stop.resumeCommand === undefined && !stop.spawnError && stop.kind !== "not_resumable") {
    copy.firstStep = "fresh";
    copy.freshLink = false;
  }
  if (stop.interrupted) {
    const when = clockTime(stop.stoppedAt, now, { afterWord: true });
    // Kiln saw changes outside the workspace, or couldn't see what the session did there.
    const unseen = stop.outside !== undefined && stop.outside.changes.length === 0;
    const why = unseen ? "since it can’t see what the session did outside the workspace" : "since it worked outside the workspace";
    return {
      ...copy,
      line: `Kiln was interrupted ${stop.stoppedAtIsLastOutput ? "" : `at ${when} `}while this session was working, and didn’t resume it, ${why}.${stop.stoppedAtIsLastOutput ? ` Its last output was at ${when}.` : ""} These are the last lines it wrote.`,
      showFacts: false,
    };
  }
  if (stop.kind === "not_resumable") {
    const when = clockTime(stop.stoppedAt, now, { afterWord: true });
    // After the person's Resume nothing need have been interrupted (usage-limit recovery AC-RESUME-04).
    const line = stop.pressedResume
      ? `Kiln couldn’t resume this session when you pressed Resume. ${stop.stoppedAtIsLastOutput ? "Its last output was" : "It had stopped"} at ${when}. These are the last lines it wrote.`
      : `Kiln was interrupted ${stop.stoppedAtIsLastOutput ? "" : `at ${when} `}while this session was working, and couldn’t resume it.${stop.stoppedAtIsLastOutput ? ` Its last output was at ${when}.` : ""} These are the last lines it wrote.`;
    return {
      ...copy,
      line,
      showFacts: false,
      firstStep: "fresh",
      freshLink: false,
    };
  }
  if (stop.spawnError) {
    if (stop.resumeCommand === undefined) {
      return { ...copy, line: "Kiln couldn’t start this session. This is the error it got.", firstStep: "fresh", freshLink: false };
    }
    return { ...copy, line: "Kiln couldn’t restart this session. These are the last lines it wrote, ending with the error it got." };
  }
  if (stop.finalMessage !== undefined) return { ...copy, line: "Kiln doesn’t try to interpret why. This is how the session ended." };
  if (stop.signal !== undefined) return { ...copy, line: `The session was ended by ${stop.signal} with no final message. These are the last lines it wrote.` };
  if (stop.exitCode !== undefined && stop.exitCode !== 0) return { ...copy, line: "The session exited with an error and no final message. These are the last lines it wrote." };
  return { ...copy, line: "The session exited with no final message. These are the last lines it wrote." };
}

/** The facts row's first part: `exit <n>`, the signal's name, or the spawn error's code. */
export function endingFact(stop: NeedsYou): string | undefined {
  if (stop.spawnError) return stop.spawnError.code;
  if (stop.signal !== undefined) return stop.signal;
  if (stop.exitCode !== undefined) return `exit ${stop.exitCode}`;
  return undefined;
}
