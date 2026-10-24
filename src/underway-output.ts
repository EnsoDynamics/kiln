// What `kiln run` prints for a feature already underway (PRD AC-START-09; assumptions UI-010
// item 5): the summary line, saying where Kiln left the feature, and the ● line, saying what
// it does next. Every part comes from Kiln's own record and checks, never a guessed cause.

import type { Engine, UnderwayDecision } from "./engine/engine.js";
import { recordedLeaves } from "./engine/plan-reading.js";
import { PR_PHASE_KEY } from "./state/records.js";
import { resetClock, type TerminalColors } from "./terminal-output.js";

const phaseName = (key: string) => (key === PR_PHASE_KEY ? "the pull request" : `phase ${key}`);
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Where Kiln left the feature, read from its record before any check runs: "phase 2b was
 * interrupted", "phase 2b needs you", "phase 2b is waiting for usage", "paused before phase 3",
 * "phase 3 is next" or "complete".
 */
export function whereItStands(engine: Engine): string {
  const { record } = engine;
  if (record.completedAt) return "complete";
  const waiting = engine.waitingPhaseKey();
  if (waiting !== undefined) return `${phaseName(engine.judgedId(waiting))} is waiting for usage`;
  const stopped = engine.stoppedPhaseKey();
  if (stopped !== undefined) return `${phaseName(engine.judgedId(stopped))} needs you`;
  for (const [key, facts] of Object.entries(record.phases)) {
    const session = engine.latestSession(key);
    const run = session?.runs.at(-1);
    if (!engine.isPhaseDone(key) && facts.stop === undefined && run && (run.endedAt === undefined || run.interruptedBy !== undefined)) {
      return `${phaseName(engine.judgedId(key))} was interrupted`;
    }
  }
  const next = engine.nextKeyFromRecordedPlan();
  if (record.pause.activeSince !== undefined) return `paused before ${phaseName(next)}`;
  return `${phaseName(next)} is next`;
}

/** `Customer returns  ·  2 of 5 phases done  ·  phase 2b was interrupted` */
export function formatSummaryLine(engine: Engine, colors: TerminalColors): string {
  const leaves = recordedLeaves(engine.record.plan ?? []);
  const done = leaves.filter((leaf) => leaf.closed).length;
  return engine.paths.featureName + colors.grey(`  ·  ${done} of ${leaves.length} phases done  ·  ${whereItStands(engine)}`);
}

/** "Pull request #218 is ready for review.", or with several, each by repository. */
function pullRequestsReady(pulls: { repository: string; number: number }[]): string {
  if (pulls.length <= 1) return `Pull request #${pulls[0]?.number ?? "?"} is ready for review.`;
  return `Pull requests ${pulls.map((pull) => `${pull.repository} #${pull.number}`).join(" · ")} are ready for review.`;
}

/**
 * The ● line: what Kiln does next, then "Opened <address>" with no closing period, as drawn.
 * With no address (the browser couldn't be opened) it ends at what Kiln does next.
 *
 *   ● Phase 2b is done, finished by you. Starting phase 3, Returns dashboard. Opened http://127.0.0.1:4700/customer-returns
 */
export function formatDecisionLine(decision: UnderwayDecision, engine: Engine, colors: TerminalColors, openedAddress?: string): string {
  const titled = (key: string) => `${phaseName(key)}, ${engine.titleOf(key)}`;
  let text: string;
  switch (decision.kind) {
    case "start_phase":
      text = `Starting ${titled(decision.phaseId)}.`;
      break;
    case "start_pull_request":
      text = "Starting the pull-request session.";
      break;
    case "needs_you": {
      const judged = engine.judgedId(decision.phaseKey);
      text = `${capitalized(phaseName(judged))} ${decision.again ? "still needs you" : "needs you"}.`;
      break;
    }
    case "plan_stop":
      text = `${capitalized(phaseName(decision.phaseKey))} hasn’t started: the phase plan doesn’t read.`;
      break;
    case "paused": {
      const next = decision.beforePhaseKey === PR_PHASE_KEY ? "the pull request" : `phase ${decision.beforePhaseKey}`;
      text = `Paused before ${next}. Press Start ${next} to go on.`;
      break;
    }
    case "complete":
      text = engine.record.mergedBranches?.length
        ? `${engine.record.pullRequests?.length ? pullRequestsReady(engine.record.pullRequests) + " " : ""}Already merged: ${engine.record.mergedBranches.map(branch => `${branch.repository} into ${branch.base}`).join(" · ")}.`
        : pullRequestsReady(engine.record.pullRequests ?? []);
      break;
    case "resume":
      text =
        decision.phaseKey === PR_PHASE_KEY
          ? `Resuming the pull-request session ${decision.sessionId.slice(0, 8)}.`
          : `Resuming ${phaseName(engine.judgedId(decision.phaseKey))}’s session ${decision.sessionId.slice(0, 8)}.`;
      break;
    case "setup_failed":
      text = decision.error;
      break;
    case "waiting": {
      const subject = decision.phaseKey === PR_PHASE_KEY ? "The pull-request session" : `Phase ${engine.judgedId(decision.phaseKey)}`;
      const reset = decision.limit.resetsAt === undefined ? "" : `, resets ${resetClock(new Date(decision.limit.resetsAt), engine.clock())}`;
      text = `${subject} is waiting for usage (${decision.limit.label}${reset}).`;
      break;
    }
  }
  const doneFirst = "doneFirst" in decision ? decision.doneFirst : undefined;
  if (doneFirst) text = `${capitalized(phaseName(doneFirst.phaseId))} is done${doneFirst.byPerson ? ", finished by you" : ""}. ${text}`;
  return `${colors.red("●")} ${text}${openedAddress === undefined ? "" : ` Opened ${colors.red(openedAddress)}`}`;
}
