/**
 * A finished delivery still waiting to merge (Kiln After Delivery AC-WAIT-01, AC-WAIT-02): the pull
 * request in the PRD's repository, as the pull request card's one line names it. Free of Node
 * imports: the page renders it too.
 */
export interface AwaitingMerge { repository: string; number: number; url: string; baseBranch: string; closed: boolean }

/**
 * The card's sentence, which the terminal gives too (AC-WAIT-02). While the pull request is closed
 * Kiln cannot confirm a merge, so the second sentence is left out.
 *
 *   awaitingMergeText({ number: 218, baseBranch: "develop", closed: false, … })
 *   // "New phases: Kiln can check for them once #218 has merged into develop. It checks as soon as it confirms the merge."
 */
export function awaitingMergeText(value: AwaitingMerge): string {
  return `New phases: Kiln can check for them once #${value.number} has merged into ${value.baseBranch}.${value.closed ? "" : " It checks as soon as it confirms the merge."}`;
}

/** The card's link: "Merged it yourself? Check now", or "Check now" while the pull request is closed. */
export const checkNowLead = (value: AwaitingMerge): string | undefined => value.closed ? undefined : "Merged it yourself?";
