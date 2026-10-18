// What the progress screens say, worked out from the snapshot: the header's state (PRD
// AC-WATCH-02), how a phase is named (AC-PR-05), each plan row's facts (AC-WATCH-01), and the
// Needs you screen's copy for every kind of stop (AC-STOP-02, AC-STOP-03; assumptions UI-007).
// The view derives "Interrupted" itself: Kiln is never running while a phase is interrupted, so
// a snapshot never says it (technical design, "Snapshot").

import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import type { Effort } from "../../../src/state/records.js";
import { EFFORT_LABELS } from "./documents-found.js";
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

/** The pill's words for a row. */
export function rowPill(row: PhaseView, state: RowState, pullRequestNumber: number | undefined): string {
  switch (state) {
    case "done":
      return row.id === PR_ID && pullRequestNumber !== undefined ? `Opened #${pullRequestNumber}` : "Done";
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
 * The facts beside a row's pill: a Done phase's time and pushed commit, an Implementing phase's
 * time since its session started, and an Interrupted one's time until the view lost Kiln.
 *
 *   rowFacts(done, "done", now)  // "52m · pushed a1c4e09", or "1h 19m · finished by you · pushed 7f3a91c"
 */
export function rowFacts(row: PhaseView, state: RowState, now: number): string | undefined {
  if (state === "done") {
    if (row.sessionStartedAt === undefined || row.doneAt === undefined) return undefined;
    const parts = [shortDuration(Date.parse(row.doneAt) - Date.parse(row.sessionStartedAt))];
    if (row.finishedByPerson) parts.push("finished by you");
    if (row.pushedSha) parts.push(`pushed ${row.pushedSha.slice(0, 7)}`);
    return parts.join(" · ");
  }
  if ((state === "implementing" || state === "interrupted") && row.sessionStartedAt !== undefined) {
    return shortDuration(now - Date.parse(row.sessionStartedAt));
  }
  return undefined;
}

/** A phase's Details rows (AC-WATCH-01): when it ran, the model and effort, its worktree, branch, commits and session. */
export function detailRows(details: NonNullable<PhaseView["details"]>, now: Date): { term: string; value: string; mono?: true }[] {
  const rows: { term: string; value: string; mono?: true }[] = [];
  if (details.to !== undefined) rows.push({ term: "Ran", value: timeSpan(details.from, details.to, now) });
  rows.push({ term: "Model", value: modelAndEffort(details.model, details.effort) });
  rows.push({ term: "Worktree", value: details.worktree, mono: true });
  rows.push({ term: "Branch", value: details.branch, mono: true });
  if (details.commitCount !== undefined) rows.push({ term: "Commits", value: commitsLine(details.commitCount, details.latestCommit) });
  rows.push({ term: "Session", value: details.sessionId, mono: true });
  return rows;
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
}

/**
 * The Needs you screen's copy for the stop: as drawn for a phase that failed the done check,
 * and with UI-007's lines for the pull request, a session that can't be resumed, a broken plan,
 * and a session Kiln couldn't start or restart.
 */
export function needsYouCopy(stop: NeedsYou, settings: Snapshot["settings"], now: Date): NeedsYouCopy {
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
      ? `Open it however you like. Kiln only looks for an open pull request from ${settings.featureBranch} into ${settings.baseBranch} that isn’t a draft, so it doesn’t matter who opens it.`
      : "Finish it however you like. Kiln only looks at the three checks on the right, so it doesn’t matter how the phase gets closed, committed and pushed.",
    checkAgainText: isPr
      ? "Kiln re-checks GitHub. If the pull request is open and ready for review, the feature is complete."
      : "Kiln re-checks Git. If the phase is done, it starts the next one, or pauses first if you pressed Pause after this phase.",
    sideHeading: isPr ? "Kiln finishes when" : "Kiln continues when",
    footnote: isPr ? "This is the check Kiln runs after the pull-request session." : "This is the same check Kiln runs after every phase. Later phases wait until it passes.",
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
  if (stop.kind === "not_resumable") {
    const when = clockTime(stop.stoppedAt, now, { afterWord: true });
    return {
      ...copy,
      line: `Kiln was interrupted ${stop.stoppedAtIsLastOutput ? "" : `at ${when} `}while this session was working, and couldn’t resume it.${stop.stoppedAtIsLastOutput ? ` Its last output was at ${when}.` : ""} These are the last lines it wrote.`,
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
