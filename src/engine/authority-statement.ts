/**
 * The statement of what Kiln may do after delivery (Kiln After Delivery AC-MERGE-08, mockup state
 * 8): the merge on the finished page's press and, in the PRD's repository, the plan push on
 * Continue. Shared by Documents found, the folder setup panel and the settings. Free of Node
 * imports: the page renders it too.
 *
 *   mergeAllowedLine("Claude Code")  // "Merge the delivery’s pull requests only when you press Merge with Claude Code on the finished page"
 *   pushAllowedLine("develop")       // "Push this PRD’s documents to develop only when you press Continue on the finished page"
 */
export const mergeAllowedLine = (agent: string): string => `Merge the delivery’s pull requests only when you press Merge with ${agent} on the finished page`;
export const pushAllowedLine = (base: string): string => `Push this PRD’s documents to ${base} only when you press Continue on the finished page`;
/** The forbidding line with early merges off: merging is no longer forbidden outright. */
export const NEVER_LINE = "Never deploy or touch other branches";

/** The settings' "In each repository" sentence, shown only for a run in several repositories. */
export function repositoriesStatement(agent: string, early: boolean): string {
  if (early) return `Required early merges may reach approved repository branches. Remaining work stays open for review, and Kiln merges the delivery’s pull requests only when you press Merge with ${agent} on the finished page. In the PRD’s repository, it pushes this PRD’s documents to its base only when you press Continue there.`;
  return `Kiln commits and pushes to the feature branch, and opens one pull request into that repository’s base once every phase closes, added repositories included. It merges the delivery’s pull requests only when you press Merge with ${agent} on the finished page, in the PRD’s repository pushes this PRD’s documents to its base only when you press Continue there, and never deploys or touches other branches.`;
}
