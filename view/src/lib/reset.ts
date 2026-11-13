// Reset Kiln for this PRD's line and confirmation (run restart AC-RESET-01 to 03; technical design
// "Availability" and "The confirmation"): the footer's text, and the confirmation's two columns
// from the preview, each line shown only when it names something.
import type { ResetPreview } from "../../../src/engine/reset.js";

/** The footer's text while reset is available. */
export const RESET_LINE = "In a state nothing above fixes? Reset makes Kiln forget its progress on this PRD and takes you back to the first screen. Your branch, worktree and commits are kept.";

/** One line of the confirmation; `code` is shown in monospace before `text`. */
export interface ResetLine { code?: string; text: string; href?: string }

/**
 * What Kiln forgets, leaving out the lines with nothing to name.
 *
 *   forgetLines({ phaseResults: 1, sessions: 1, stops: 1, waivers: 0, audits: 0, deliveries: 0 })
 *   // ["Which phase it was on, and each phase's result", "Its 1 session and its output", "Stops, completion waivers and audit results", "Its settings for this PRD, which you choose again on the first screen"]
 */
export function forgetLines(forgets: ResetPreview["forgets"]): string[] {
  return [
    "Which phase it was on, and each phase's result",
    ...(forgets.sessions > 0 ? [forgets.sessions === 1 ? "Its 1 session and its output" : `Its ${forgets.sessions} sessions and their output`] : []),
    ...(forgets.stops + forgets.waivers + forgets.audits > 0 ? ["Stops, completion waivers and audit results"] : []),
    "Its settings for this PRD, which you choose again on the first screen",
    ...(forgets.deliveries > 0 ? ["Its record of earlier deliveries"] : []),
  ];
}

const commits = (count: number) => count === 0 ? "no commits of its own" : `${count} ${count === 1 ? "commit" : "commits"} of its own`;
const files = (count: number) => count === 0 ? "no uncommitted files" : `${count} uncommitted ${count === 1 ? "file" : "files"}`;

/**
 * What stays exactly as it is: per repository the branch and the worktree, both named even at zero,
 * its pull requests, then the phases closed on the feature branch. A count Kiln couldn't read says so.
 */
export function stayLines(preview: ResetPreview): ResetLine[] {
  const multi = preview.stays.length > 1;
  const lines: ResetLine[] = [];
  for (const stay of preview.stays) {
    const where = multi ? `In ${stay.repository}, ` : "";
    lines.push({ ...(multi ? {} : { code: stay.branch }), text: multi ? `${where}${stay.branch}${stay.ownCommits === undefined ? ", whose commits of its own Kiln couldn't count" : `, which has ${commits(stay.ownCommits)}`}` : stay.ownCommits === undefined ? ", whose commits of its own Kiln couldn't count" : `, which has ${commits(stay.ownCommits)}` });
    if (stay.worktree !== undefined) lines.push({ text: `${where}${multi ? "the" : "The"} worktree folder, ${stay.uncommittedFiles === undefined ? "whose uncommitted files Kiln couldn't count" : `with ${files(stay.uncommittedFiles)}`}` });
    if (stay.unknown.includes("pullRequests")) lines.push({ text: `${where}${multi ? "any" : "Any"} pull request; Kiln couldn't read them` });
    for (const pull of stay.pullRequests) lines.push({ text: `${where}${multi ? "pull" : "Pull"} request #${pull.number}`, href: pull.url });
  }
  const prd = preview.stays.find(stay => stay.unknown.includes("closedOnBranch"));
  if (preview.closedOnBranch !== undefined && preview.closedOnBranch > 0) lines.push({ text: "The phases closed in the plan on the feature branch" });
  else if (prd) lines.push({ text: "The phases closed in the plan on the feature branch, which Kiln couldn't count" });
  return lines;
}
