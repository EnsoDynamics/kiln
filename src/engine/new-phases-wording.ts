/**
 * The words of the two answers Kiln gives when it looks for new phases on a finished run (Kiln After
 * Delivery AC-BACK-01, AC-BACK-03, AC-BACK-04; mockup state 5), shared by the page, the terminal
 * and `kiln status`. Free of Node imports: the page renders it too.
 */
import type { CompletedPlanResult } from "./completed-plan-discovery.js";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const count = (n: number) => WORDS[n] ?? String(n);
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fileName = (path: string, prdDirectory: string) => path.startsWith(`${prdDirectory}/`) ? path.slice(prdDirectory.length + 1) : path;

/** "2 phases were added to this PRD after Kiln finished it". */
export function addedHeading(n: number): string {
  return `${n} ${n === 1 ? "phase was" : "phases were"} added to this PRD after Kiln finished it`;
}

/** Where the phases came from: the commit that added them, or committed on this machine and not pushed. */
export function originLine(result: Pick<CompletedPlanResult, "origin" | "source">): string | undefined {
  const origin = result.origin;
  if (!origin) return undefined;
  if (origin.kind === "unpushed") return `These documents are committed on this machine’s ${result.source.branch} but not pushed. Continue pushes them first.`;
  return `Added on ${when(origin.committedAt).replace(", ", " at ")}, in commit ${origin.revision.slice(0, 7)} “${origin.subject}”.`;
}

/** "Last checked Dec 12 at 9:40 AM." */
export const lastCheckedLine = (iso: string): string => `Last checked ${when(iso).replace(", ", " at ")}.`;

/** What Continue does (AC-BACK-04). */
export function continueLine(n: number, baseBranch: string): string {
  return `Continue builds only ${n === 1 ? "this phase" : `these ${count(n)} phases`}, on a new branch from ${baseBranch}, and ends with a new pull request.`;
}

/** The line for a main checkout on another branch (AC-BACK-03). */
export function notReadLine(result: Pick<CompletedPlanResult, "notRead" | "source">): string | undefined {
  return result.notRead ? `The main checkout is on ${result.notRead.branch}, so Kiln read the plan from origin/${result.source.branch} only.` : undefined;
}

/** The line naming this PRD's documents with uncommitted edits, which Kiln did not read (AC-BACK-03). */
export function uncommittedLine(result: Pick<CompletedPlanResult, "uncommitted">, prdDirectory: string): string | undefined {
  const names = result.uncommitted.map(path => fileName(path, prdDirectory));
  if (!names.length) return undefined;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${list} ${names.length === 1 ? "has" : "have"} edits in your main checkout that aren’t committed. Kiln didn’t read them.`;
}

/**
 * The terminal's and `kiln status`'s sentence for unfinished phases:
 * "2 phases were added to this PRD after Kiln finished it: 5, 6, in commit a41c0d2 on origin/develop (Nov 24, 2:10 PM)."
 */
export function addedSentence(result: Pick<CompletedPlanResult, "added" | "origin" | "source">): string {
  const ids = result.added.map(phase => phase.id).join(", ");
  const origin = result.origin;
  const where = !origin ? "" : origin.kind === "unpushed" ? `, committed on this machine's ${result.source.branch} and not pushed; Continue pushes them first` : `, in commit ${origin.revision.slice(0, 7)} on origin/${result.source.branch} (${when(origin.committedAt)})`;
  return `${addedHeading(result.added.length)}: ${ids}${where}.`;
}
