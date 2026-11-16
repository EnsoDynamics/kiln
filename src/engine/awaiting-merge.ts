/** A finished feature whose work has not reached the delivery base yet. Free of Node imports: the page renders it too. */
export interface AwaitingMerge { revision: string; baseBranch: string; branch?: string; pullRequest?: { number: number; url: string } }
/** One sentence shared by the terminal and the feature page. */
export function awaitingMergeText(value: AwaitingMerge): string {
  const where = value.branch ? `${value.branch}${value.pullRequest ? ` (pull request #${value.pullRequest.number})` : ""}` : `commit ${value.revision.slice(0, 7)}`;
  return `The feature is complete. Its work is on ${where}, which is not in origin/${value.baseBranch} yet, so Kiln has no plan there to check for new phases. Merge it, then check again.`;
}
