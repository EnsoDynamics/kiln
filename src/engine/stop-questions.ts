// What Kiln says about a repository it can't place after Start (find repositories anywhere
// AC-ASK-07, AC-SESSION-01; technical design, "A session's request", "The stops that ask", "A
// continuation and a base-branch start"): the words a session's refused request ends with, the
// plan stop's fact, a readiness problem's words, and a question as a stop saves it.

import type { SavedQuestion } from "../state/records.js";
import { displayPath } from "./worktree-setup.js";
import { questionSentence, searchedSentence, type Question } from "./repository-finding.js";

/**
 * A question as a stop saves it: whole, without the field and its message, which belong to one answer.
 *
 *   savedQuestion(question, "phase-4-restock-check-in.md")
 *   // { kind: "where", repository: "acme-labs/inventory", searchedFrom: "/home/a/code/acme", checkouts: [], found: 0, phaseFile: "phase-4-restock-check-in.md" }
 */
export function savedQuestion(question: Question | SavedQuestion, phaseFile?: string): SavedQuestion {
  return {
    kind: question.kind,
    repository: question.repository,
    searchedFrom: question.searchedFrom,
    ...(question.searchedTo === undefined ? {} : { searchedTo: question.searchedTo }),
    checkouts: question.checkouts.map((checkout) => ({ folder: checkout.folder, remote: checkout.remote, pickable: checkout.pickable, ...(checkout.remembered ? { remembered: true as const } : {}) })),
    found: question.found,
    ...(phaseFile === undefined ? {} : { phaseFile }),
  };
}

/**
 * The plan stop's Phase plan reads fact for a question (technical design, "The stops that ask").
 *
 *   planStopFact("phase-4-restock-check-in.md", question)
 *   // "phase-4-restock-check-in.md names acme-labs/inventory, and Kiln couldn’t find a checkout of it"
 */
export function planStopFact(phaseFile: string, question: Pick<SavedQuestion, "kind" | "repository" | "checkouts" | "found">): string {
  const lead = `${phaseFile} names ${question.repository}, and Kiln`;
  if (question.kind === "which") return `${lead} found ${question.found} checkouts of it`;
  return question.checkouts.length > 0 ? `${lead} couldn’t find a checkout of it that it can deliver to` : `${lead} couldn’t find a checkout of it`;
}

/** "a, b and c", as English lists them. */
export function englishList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * What `kiln add-repository` answers a session when finding ends in a question; nothing is added
 * (technical design, "A session's request").
 *
 *   requestRefusal(question)
 *   // "Kiln couldn’t find a checkout of acme-labs/ledger. It searched outward from ~/code/acme/, never above your home folder. Nothing was added."
 */
export function requestRefusal(question: Pick<SavedQuestion, "kind" | "repository" | "checkouts" | "found" | "searchedFrom" | "searchedTo">): string {
  if (question.kind === "which") {
    return `Kiln found ${question.found} checkouts of ${question.repository} and needs a person to say which to use: ${englishList(question.checkouts.map((checkout) => displayPath(checkout.folder)))}. Nothing was added.`;
  }
  if (question.checkouts.length === 0) return `Kiln couldn’t find a checkout of ${question.repository}. ${searchedSentence(question)} Nothing was added.`;
  const listed = question.checkouts.map((checkout) => `${displayPath(checkout.folder)} (${checkout.remote})`);
  const found = listed.length === 1 ? `It found ${listed[0]}, which isn’t on GitHub.` : `It found ${englishList(listed)}, none of them on GitHub.`;
  return `Kiln couldn’t find a checkout of ${question.repository} that it can deliver to. ${found} Nothing was added.`;
}

/** The sentence a refused request's answer ends with when a stop is open, once the stop has the question. */
export function stopNowAsks(question: Pick<SavedQuestion, "kind">): string {
  return question.kind === "which" ? "The stop in Kiln now asks which checkout to use." : "The stop in Kiln now asks where it is.";
}

/**
 * A repository a start after Start must read that still ends in a question stays a problem: the
 * question's first sentence, then what clears it on Check again (technical design, "A
 * continuation and a base-branch start").
 *
 *   readinessProblem(question)
 *   // "Kiln couldn’t find a checkout of acme-labs/inventory. Check again once a checkout of it is where the search reaches."
 */
export function readinessProblem(question: Question | SavedQuestion): string {
  const first = questionSentence({ ...question, found: question.found } as Question);
  if (question.kind === "which") return `${first} Check again once only one checkout of it is where the search reaches.`;
  if (question.checkouts.length > 0) return `${first} Check again once a checkout of it whose origin is on GitHub is where the search reaches.`;
  return `${first} Check again once a checkout of it is where the search reaches.`;
}

/**
 * The questions with one about a repository put in place of any about the same repository that
 * came from a request; a plan stop's question for it stays.
 */
export function withQuestion(questions: SavedQuestion[] | undefined, question: SavedQuestion): SavedQuestion[] {
  const list = questions ?? [];
  if (question.phaseFile === undefined && list.some((one) => one.phaseFile !== undefined && one.repository.toLowerCase() === question.repository.toLowerCase())) return list;
  return [...list.filter((one) => one.repository.toLowerCase() !== question.repository.toLowerCase() || one.phaseFile !== question.phaseFile), question];
}
