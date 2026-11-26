/**
 * What the pull request card says about the merge (Kiln After Delivery AC-MERGE-01, AC-MERGE-07,
 * mockup states 1 to 3), shared by the page, `kiln status` and `kiln merge --help`. Free of Node
 * imports: the page renders it too.
 */

export interface MergeNoteRow { repository: string; number: number; base: string; ordered: boolean }

const name = (row: MergeNoteRow, multi: boolean) => multi ? `${row.repository} #${row.number}` : `#${row.number}`;
const joined = (items: string[]) => items.length <= 1 ? items.join("") : items.length === 2 ? `${items[0]} first and then ${items[1]}` : `${items.slice(0, -1).join(", ")} and then ${items.at(-1)}`;

/**
 * The note beside Merge with {agent}: what pressing it does, that each merge may start the base's
 * CI or deployment, and, with more than one pull request, any order the descriptions state.
 *
 *   mergeNote({ agent: "Claude Code", multi: false, toMerge: [{ repository: "acme-shop", number: 218, base: "develop", ordered: false }], merged: [] })
 *   // "Merge with Claude Code starts one more session in this PRD’s worktree. It brings develop into the branch, resolves any conflicts, runs the tests, pushes, waits for the required checks and merges #218 into develop. Merging into develop may start its CI or deployment. To review it yourself first, open it on GitHub."
 */
export function mergeNote(input: { agent: string; multi: boolean; toMerge: MergeNoteRow[]; merged: { repository: string; number: number }[] }): string {
  const { agent, multi, toMerge, merged } = input;
  const place = multi ? "workspace" : "worktree";
  const lead = merged.length ? `${joined(merged.map(row => `${row.repository} #${row.number}`)).replace(" first and then ", " and ")} ${merged.length === 1 ? "is" : "are"} already merged, so Merge with ${agent} merges only ${joined(toMerge.map(row => name(row, true))).replace(" first and then ", " and ")}. It starts one more session in this PRD’s ${place}` : `Merge with ${agent} starts one more session in this PRD’s ${place}`;
  if (toMerge.length === 1) {
    const [only] = toMerge as [MergeNoteRow];
    return `${lead}. It brings ${only.base} into the branch, resolves any conflicts, runs the tests, pushes, waits for the required checks and merges ${name(only, multi)} into ${only.base}. Merging into ${only.base} may start its CI or deployment.${merged.length ? "" : " To review it yourself first, open it on GitHub."}`;
  }
  const bases = [...new Set(toMerge.map(row => row.base))];
  const base = bases.length === 1 ? bases[0]! : "each base branch";
  const order = toMerge.every(row => row.ordered) ? `It merges ${joined(toMerge.map(row => name(row, true)))}, the order the pull requests state` : `It merges ${toMerge.map(row => name(row, true)).join(", ").replace(/, ([^,]*)$/, " and $1")}, following any order their descriptions state`;
  return `${lead}. ${order}, bringing ${base} into each branch, resolving any conflicts, running the tests and waiting for the required checks before each merge. If one can’t be merged, it stops there and leaves the ${toMerge.length === 2 ? "other" : "rest"} open. Each merge into ${base} may start that repository’s CI or deployment.`;
}

/**
 * The card's line while a pull request is closed and no merge session has started (AC-MERGE-07).
 *
 *   closedLine({ multi: true, closed: [{ repository: "acme-api", number: 57 }], open: [{ repository: "acme-shop", number: 218 }] })
 *   // "acme-api #57 was closed without merging, so Kiln doesn’t offer to merge this delivery. Reopen #57 on GitHub and the merge comes back, or merge acme-shop #218 there yourself."
 */
export function closedLine(input: { multi: boolean; closed: { repository: string; number: number }[]; open: { repository: string; number: number }[] }): string {
  const { multi, closed, open } = input;
  if (!multi) return `Pull request #${closed[0]!.number} was closed without merging, so Kiln doesn’t offer to merge it. Reopen it on GitHub and the merge comes back.`;
  const names = closed.map(row => `${row.repository} #${row.number}`).join(" and ");
  const numbers = closed.map(row => `#${row.number}`).join(" and ");
  return `${names} ${closed.length === 1 ? "was" : "were"} closed without merging, so Kiln doesn’t offer to merge this delivery. Reopen ${numbers} on GitHub and the merge comes back${open.length ? `, or merge ${open.map(row => `${row.repository} #${row.number}`).join(" and ")} there yourself` : ""}.`;
}

/** The card's line when GitHub could not be read (AC-MERGE-07). */
export const unreadableLine = (problem: string): string => `GitHub could not be read, so Kiln doesn’t offer the merge. ${problem}`;

/**
 * Beside the closed line, when another of the delivery's pull requests could not be read (AC-MERGE-07).
 *
 *   unreadableBesideClosedLine([{ repository: "acme-web", number: 12 }], "HTTP 502")
 *   // "GitHub could not be read for acme-web #12. HTTP 502"
 */
export const unreadableBesideClosedLine = (pullRequests: { repository: string; number: number }[], problem: string): string =>
  `GitHub could not be read for ${pullRequests.map(row => `${row.repository} #${row.number}`).join(" and ")}. ${problem}`;

/** The closed row's whole line (AC-MERGE-07): the closed line, then the unreadable one when another could not be read. */
export function closedOfferLine(input: Parameters<typeof closedLine>[0] & { unreadable?: { pullRequests: { repository: string; number: number }[]; problem: string } }): string {
  const closed = closedLine(input);
  return input.unreadable ? `${closed} ${unreadableBesideClosedLine(input.unreadable.pullRequests, input.unreadable.problem)}` : closed;
}

/** Said wherever a running merge session offers no message box, pause or takeover (AC-MERGE-05, MERGE-001). */
export const MERGE_LIVE_REASON = "Like the pull request session, the merge session can’t be messaged, paused or taken over while it runs.";

/** At a merge stop, a pull request read `closed` (Display Contract). */
export const closedAtStopLine = (row: { repository: string; number: number }): string => `${row.repository} #${row.number} was closed on GitHub without merging. Reopen it there, then press Resume.`;

/** Said wherever a running push session offers no message box, pause or takeover (AC-MERGE-05, mockup state 5). */
export const PLAN_PUSH_LIVE_REASON = "Like the pull request session, the push session can’t be messaged, paused or taken over while it runs.";
