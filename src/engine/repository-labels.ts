// A repository's worktree folder name, given once, and the label it is shown by, worked out each
// time (find repositories anywhere AC-FOLDER-01, AC-FOLDER-02; technical design, "Worktree
// Folders and Labels").

import { wholePathForm } from "../plan/repository-names.js";

const key = (text: string) => text.toLowerCase();

/** An entry Kiln already wrote: its name, and its short name when that differs. */
export interface NamedEntry {
  name: string;
  shortName?: string;
}

export const shortNameOf = (entry: NamedEntry): string => entry.shortName ?? entry.name;

/** A repository about to be given a name, at Start or at an addition. */
export interface Newcomer {
  shortName: string;
  addressPath: string;
  /** The PRD's repository, which always keeps its short name. */
  prd?: boolean;
}

export type GivenNames = { ok: true; names: string[] } | { ok: false; problem: string };

/**
 * Names for repositories set up together, against the entries already written: the short name
 * when nothing already written has it as short name or name and no other newcomer shares it;
 * otherwise the whole-path form. A whole-path form an entry already has refuses, in one line.
 *
 *   giveNames([], [{ shortName: "product", addressPath: "acme/product", prd: true }, { shortName: "admin", addressPath: "acme/admin" }, { shortName: "admin", addressPath: "acme-labs/admin" }])
 *   // { ok: true, names: ["product", "acme+admin", "acme-labs+admin"] }
 */
export function giveNames(entries: (NamedEntry & { github?: string })[], newcomers: Newcomer[]): GivenNames {
  const names: string[] = [];
  for (const newcomer of newcomers) {
    if (newcomer.prd) { names.push(newcomer.shortName); continue; }
    const short = key(newcomer.shortName);
    const taken = entries.some((entry) => key(shortNameOf(entry)) === short || key(entry.name) === short)
      || newcomers.some((other) => other !== newcomer && key(other.shortName) === short);
    if (!taken) { names.push(newcomer.shortName); continue; }
    const whole = wholePathForm(newcomer.addressPath);
    const holder = entries.find((entry) => key(entry.name) === key(whole));
    if (holder) return { ok: false, problem: `Kiln can’t set up ${newcomer.addressPath}: its worktree folder would be ${whole}, which ${holder.github ?? holder.name} already has.` };
    names.push(whole);
  }
  return { ok: true, names };
}

/** One of the PRD's repositories, for its label. */
export interface Labelled {
  shortName: string;
  addressPath: string;
}

/**
 * Each repository's label: its short name while no other of the PRD's repositories has that
 * short name, its address path while one does.
 *
 *   labelsOf([{ shortName: "admin", addressPath: "acme/admin" }, { shortName: "admin", addressPath: "acme-labs/admin" }, { shortName: "storefront", addressPath: "acme/storefront" }])
 *   // ["acme/admin", "acme-labs/admin", "storefront"]
 */
export function labelsOf(repositories: Labelled[]): string[] {
  return repositories.map((repository) => labelAmong(repository, repositories));
}

/** One repository's label among the PRD's repositories (the list may hold it or not). */
export function labelAmong(repository: Labelled, repositories: Labelled[]): string {
  const clash = repositories.some((other) => key(other.shortName) === key(repository.shortName) && key(other.addressPath) !== key(repository.addressPath));
  return clash ? repository.addressPath : repository.shortName;
}
