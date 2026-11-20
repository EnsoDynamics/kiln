/**
 * The pull request check's **Pull request description** row (Kiln Deliver When Audit Loops Run Out
 * AC-LEFT-01, technical design "When an open pull request is delivered"). Kiln does not read a
 * description back: the row passes only when the latest pull request session in this execution
 * that delivered its block, by ending on its own with its work finished, was given the block Kiln
 * would give now. So a pull request already open, even one opened outside Kiln, gets this run's
 * **For you** and **Closing audits** before the run completes.
 *
 *   descriptionRow(sessions, deliveryBlock(...), 1)
 *   // { name: "Pull request description", passed: false, facts: [...], items: [{ kind: "other", subject: "Pull request description", … }] }
 */
import type { CheckResult, SessionRecord } from "../state/records.js";
import { DESCRIPTION_CHECK } from "./waivers.js";

/**
 * Whether a pull request session's latest run ended on its own and finished its work: ended, not
 * interrupted, launched and not refused by a usage limit, with a result that is not an error, and
 * exit code 0 for Claude Code or a completed turn for Codex, whatever the app server's exit code.
 */
export function deliveredItsBlock(session: SessionRecord): boolean {
  const run = session.runs.at(-1);
  if (!run?.endedAt || run.interruptedBy !== undefined || run.spawnError || run.limitRefusal) return false;
  if (run.result === undefined || run.result.isError) return false;
  return session.agentId === "codex" ? run.codex?.terminal?.status === "completed" : run.exitCode === 0;
}

/** The fixed text of the failing row's one item: no time or session in it, so two failing check runs compare equal. */
export function descriptionFailure(pullRequests: number): string {
  return pullRequests > 1
    ? "No pull request session in this run has written this run’s For you and Closing audits into the open pull requests’ descriptions."
    : "No pull request session in this run has written this run’s For you and Closing audits into the open pull request’s description.";
}

/**
 * The row for `pullRequests` open pull requests, given this execution's pull request sessions
 * oldest first and the block Kiln would give now.
 */
export function descriptionRow(sessions: readonly SessionRecord[], block: string, pullRequests: number): CheckResult {
  const latest = sessions.findLast(deliveredItsBlock);
  // The saved block counts only once the run it was given to has run: a resume that never started leaves the earlier run's block unknown.
  if (latest?.deliveryBlock?.block === block && latest.runs.length - 1 >= latest.deliveryBlock.run) {
    return { name: DESCRIPTION_CHECK, passed: true, facts: [pullRequests > 1 ? "A pull request session in this run wrote this run’s For you and Closing audits into each open pull request’s description." : "A pull request session in this run wrote this run’s For you and Closing audits into the pull request’s description."] };
  }
  const text = descriptionFailure(pullRequests);
  return { name: DESCRIPTION_CHECK, passed: false, facts: [text], items: [{ kind: "other", subject: DESCRIPTION_CHECK, text, against: DESCRIPTION_CHECK }] };
}
