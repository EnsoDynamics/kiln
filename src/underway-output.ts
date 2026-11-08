import { developmentDeliverySummary } from "./state/development-delivery.js";
// What `kiln run` prints for a feature already underway (PRD AC-START-09; assumptions UI-010
// item 5): the summary line, saying where Kiln left the feature, and the ● line, saying what
// it does next. Every part comes from Kiln's own record and checks, never a guessed cause.

import type { Engine, UnderwayDecision } from "./engine/engine.js";
import type { FolderMissingView } from "./engine/folder-facts.js";
import { recordedLeaves } from "./engine/plan-reading.js";
import { effectiveRecordedClosed } from "./engine/waivers.js";
import { PR_PHASE_KEY } from "./state/records.js";
import { resetClock, type TerminalColors } from "./terminal-output.js";

const phaseName = (key: string, engine?: Engine) => (key === PR_PHASE_KEY ? "the pull request" : engine?.auditActivity(key) ? engine.titleOf(key).toLowerCase() : `phase ${key}`);
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Where Kiln left the feature, read from its record before any check runs: "phase 2b was
 * interrupted", "phase 2b needs you", "phase 2b is waiting for usage", "paused before phase 3",
 * "phase 3 is next" or "complete".
 */
export function whereItStands(engine: Engine): string {
  const { record } = engine;
  if (engine.currentlyComplete) return engine.record.completedPlanCheck ? "earlier delivery complete; current plan checked" : "complete";
  if (record.completedAt && record.developmentAuthorization?.enabled) return "previously complete; current delivery is being reconciled";
  const waiting = engine.waitingPhaseKey();
  if (waiting !== undefined) return `${phaseName(engine.judgedId(waiting), engine)} is waiting for usage`;
  const stopped = engine.stoppedPhaseKey();
  if (stopped !== undefined) return `${phaseName(engine.judgedId(stopped), engine)} needs you`;
  for (const [key, facts] of Object.entries(record.phases)) {
    const session = engine.latestSession(key);
    const run = session?.runs.at(-1);
    if (!engine.isPhaseDone(key) && facts.stop === undefined && run && (run.endedAt === undefined || run.interruptedBy !== undefined)) {
      return `${phaseName(engine.judgedId(key), engine)} was interrupted`;
    }
  }
  const next = engine.nextKeyFromRecordedPlan();
  if (record.pause.activeSince !== undefined) return `paused before ${phaseName(next, engine)}`;
  return `${phaseName(next, engine)} is next`;
}

/** `Customer returns  ·  2 of 5 phases done  ·  phase 2b was interrupted` */
export function formatSummaryLine(engine: Engine, colors: TerminalColors): string {
  const leaves = recordedLeaves(engine.record.plan ?? []);
  const done = leaves.filter(leaf => effectiveRecordedClosed(engine.record, leaf) && (!engine.record.developmentAuthorization?.enabled || !engine.record.phases[leaf.id]?.stop && !engine.record.phases[leaf.id]?.wait && engine.current?.phaseKey !== leaf.id)).length;
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
    case "start_audit": text = `Starting ${decision.label.toLowerCase()}, round ${decision.round}.`; break;
    case "start_phase":
      text = `Starting ${titled(decision.phaseId)}.`;
      break;
    case "start_pull_request":
      text = "Starting the pull-request session.";
      break;
    case "needs_you": {
      const judged = engine.judgedId(decision.phaseKey);
      text = `${capitalized(phaseName(judged, engine))} ${decision.again ? "still needs you" : "needs you"}.`;
      break;
    }
    case "plan_stop":
      text = `${capitalized(phaseName(decision.phaseKey))} hasn’t started: the phase plan doesn’t read.`;
      break;
    case "paused": {
      const next = phaseName(decision.beforePhaseKey, engine);
      text = `Paused before ${next}. Press Start ${next} to go on.`;
      break;
    }
    case "complete":
      if (engine.record.completedPlanCheck) {
        text = formatCompletedPlanCheck(engine.record.completedPlanCheck);
        break;
      }
      text = engine.record.developmentAuthorization?.enabled ? developmentDeliverySummary(engine.record) : engine.record.mergedBranches?.length
        ? `${engine.record.pullRequests?.length ? pullRequestsReady(engine.record.pullRequests) + " " : ""}Already merged: ${engine.record.mergedBranches.map(branch => `${branch.repository} into ${branch.base}`).join(" · ")}.`
        : pullRequestsReady(engine.record.pullRequests ?? []);
      break;
    case "resume":
      text =
        decision.phaseKey === PR_PHASE_KEY
          ? `Resuming the pull-request session ${decision.sessionId.slice(0, 8)}.`
          : `Resuming ${phaseName(engine.judgedId(decision.phaseKey), engine)}’s session ${decision.sessionId.slice(0, 8)}.`;
      break;
    case "setup_failed":
      text = decision.error;
      break;
    case "folder_missing":
      text = "This run’s folder is missing; nothing has run.";
      break;
    case "waiting": {
      const subject = decision.phaseKey === PR_PHASE_KEY ? "The pull-request session" : capitalized(phaseName(engine.judgedId(decision.phaseKey), engine));
      const reset = decision.limit.resetsAt === undefined ? "" : `, resets ${resetClock(new Date(decision.limit.resetsAt), engine.clock())}`;
      text = `${subject} is waiting for usage (${decision.limit.label}${reset}).`;
      break;
    }
  }
  if (engine.restartReview) text = "Ready to resume. Review the phase plan and press Resume in Kiln, or use kiln run <path> --resume on the next launch.";
  const doneFirst = "doneFirst" in decision ? decision.doneFirst : undefined;
  if (doneFirst) text = `${capitalized(phaseName(doneFirst.phaseId, engine))} is done${doneFirst.byPerson ? ", finished by you" : ""}. ${text}`;
  return `${colors.red("●")} ${text}${openedAddress === undefined ? "" : ` Opened ${colors.red(openedAddress)}`}`;
}

/** One retained observation supplies startup and later browser-triggered terminal notices. */
export function formatCompletedPlanCheck(check: import("./engine/completed-plan-discovery.js").CompletedPlanCheck): string {
  let text: string;
  if (check.status === "failed") text = `Could not check for new phases: ${check.errors.join(" ")}`;
  else if (check.status === "checking") text = "Checking for new phases. The current phase count is unknown.";
  else if (check.status === "blocked") {
    const result = check.result;
    const coherent = result?.leaves && !result.earlierWorkChanges.length && !result.problems.some(problem => problem.includes("source_conflict"));
    text = coherent ? `${result.added.length} new unfinished ${result.added.length === 1 ? "phase" : "phases"} found. Completion or readiness evidence is unresolved. ${result.problems.join(" ")}` : `Plan needs reconciliation. The current phase count is unresolved. ${result?.problems.join(" ") ?? ""}`;
  }
  else if (check.status === "unchanged") text = "No new phases found. Earlier delivery remains complete.";
  else {
    const count = check.result!.added.length;
    text = `${count} new unfinished ${count === 1 ? "phase" : "phases"} found. Review the current plan on the feature page.`;
  }
  if (check.result?.proposal) {
    const proposal = check.result.proposal;
    text += ` Readiness: ${proposal.readiness === "ready" ? "Ready" : "Not ready"}.${proposal.firstEligiblePhase ? ` First phase to run: Phase ${proposal.firstEligiblePhase}${proposal.readiness === "blocked" ? " after resolving blockers" : ""}.` : ""} Phases: ${proposal.added.map(row => `${row.id} · ${row.title}`).join("; ")}. Review the feature page.`;
  }
  if (check.result?.leaves) {
    const external = check.result.leaves.filter(row => row.classification === "externally_verified" || row.classification === "externally_unverified");
    if (external.length) text += ` External work: ${external.map(row => `Phase ${row.id} · ${row.title} (${row.classification === "externally_verified" ? "completion and integration verified" : "completion evidence unresolved"})`).join("; ")}.`;
  }
  if (check.status === "failed" || check.status === "checking") text += " Current phase count is unknown; any retained result is earlier information.";
  if (check.lastSuccessfulAt) text += ` Last successful check: ${new Date(check.lastSuccessfulAt).toLocaleString()}.`;
  if (check.sources.length) text += ` Sources: ${check.sources.map(source => `${source.path}${source.revision ? ` at ${source.revision}` : ""}${source.error ? ` (${source.error})` : ""}`).join("; ")}.`;
  return text;
}

/** The saved plan's label as a predicate (AC-FACTS-02): "is out of date", "matches develop". */
export function savedPlanWords(saved: FolderMissingView["plans"]["saved"], baseBranch: string): string {
  const other = saved.comparedWith === "branch" ? "the branch" : baseBranch;
  switch (saved.label) {
    case "out_of_date": return "is out of date";
    case "matches_branch": return "matches the branch";
    case "matches_base": return `matches ${baseBranch}`;
    case "ahead": return `is ahead of ${other}`;
    case "not_compared": return "is not compared";
  }
}

/**
 * What `kiln run` prints for Folder missing (AC-GONE-03), in place of the summary and ● lines:
 *
 *   Folder missing · nothing has run
 *   This run’s folder no longer exists:
 *     ~/devel/.worktrees/invoice-evidence-collection/harbor-ledger  missing
 *
 *   The plan on origin/develop (0a3d75d) has 13 phases, 9 done. Kiln’s saved plan is out of date.
 *   Set the run up again: http://localhost:4317/invoice-evidence-collection
 */
export function formatFolderMissing(view: FolderMissingView, address: string | undefined, colors: TerminalColors): string {
  const failing = view.repositories.filter(repository => repository.state !== "in_place");
  const allMissing = failing.every(repository => repository.state === "missing");
  const heading = view.repositories.length > 1
    ? allMissing ? (failing.length === 1 ? "One of this run’s folders no longer exists:" : "This run’s folders no longer exist:") : "Some of this run’s folders aren’t the run’s worktrees:"
    : allMissing ? "This run’s folder no longer exists:" : failing[0]?.state === "holds_something_else" ? "This run’s folder now holds something else:" : "Kiln couldn’t check this run’s folder:";
  const state = (repository: FolderMissingView["repositories"][number]) => repository.state === "missing" ? "missing" : repository.state === "holds_something_else" ? "holds something else" : "couldn’t check";
  const base = view.plans.base;
  const plan = "error" in base
    ? `Kiln couldn’t read the plan on ${base.branch}. Kiln’s saved plan is not compared.`
    : `The plan on ${base.source === "origin" ? `origin/${base.branch}` : base.branch} (${base.sha.slice(0, 7)}) has ${base.total} phases, ${base.closed} done. Kiln’s saved plan ${savedPlanWords(view.plans.saved, base.branch)}.`;
  return [
    `${colors.amber("Folder missing")} · nothing has run`,
    heading,
    ...failing.map(repository => `  ${repository.savedFolder}  ${colors.red(state(repository))}`),
    "",
    plan,
    `Set the run up again: ${address === undefined ? "the Kiln page (the browser couldn’t be opened)" : colors.amber(address)}`,
  ].join("\n");
}
