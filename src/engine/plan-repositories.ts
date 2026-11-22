// The plan's named repositories before Start, each with the name Kiln gives it: found, or asked
// about (find repositories anywhere AC-FIND-01, AC-ASK-01, AC-FOLDER-01; technical design,
// "Names", "Worktree Folders and Labels"). The start checks, the engine before Start and the
// additions before a phase all read the plan's names through here.

import type { RepositoryEntry } from "../state/records.js";
import type { GitContext } from "./git-reads.js";
import type { FoundRepository } from "./repositories.js";
import { questionSentence, resolveNames, searchedSentence, type Located, type NamedRepository, type Reached } from "./repository-finding.js";
import { giveNames, labelAmong, shortNameOf, type Labelled } from "./repository-labels.js";
import { lastPart, readRepositoryName, sameAddressPath } from "../plan/repository-names.js";

/** A named repository with its name: found (its checkout known), or asking. */
export interface NamedRepositoryRow extends Omit<NamedRepository, "found"> {
  /** Kiln's name for it: its short name, or the whole-path form when that is taken. */
  name: string;
  found?: FoundRepository & { located: Located };
}

export interface PlanRepositoriesInput {
  git: GitContext;
  env: NodeJS.ProcessEnv;
  prd: { name: string; mainCheckoutPath: string; github: string };
  entries: RepositoryEntry[];
  /** The phases whose names count, in plan order. */
  phases: { fileName: string; repositories: string[] }[];
  say?: (line: string) => void;
  said?: Set<string>;
  changing?: string[];
  home?: string;
}

/**
 * The plan's names, other than the PRD's own folder name, each once, with the first phase file
 * naming it, in first-mention plan order.
 *
 *   planNames([{ fileName: "phase-1-intake.md", repositories: ["returns-api"] }], "product")
 *   // [{ name: "returns-api", namedIn: "phase-1-intake.md" }]
 */
export function planNames(phases: { fileName: string; repositories: string[] }[], prdName: string): { name: string; namedIn: string }[] {
  const names: { name: string; namedIn: string }[] = [];
  for (const phase of phases) {
    for (const name of phase.repositories) if (name !== prdName && !names.some((one) => one.name === name)) names.push({ name, namedIn: phase.fileName });
  }
  return names;
}

/**
 * Resolves the plan's names and gives each repository not yet set up its name, the PRD's
 * repository and the entries already written counted first.
 */
export async function resolvePlanRepositories(input: PlanRepositoriesInput): Promise<{ named: NamedRepositoryRow[]; problems: string[]; entries: string[]; byName: Map<string, PlanReach> }> {
  const names = planNames(input.phases, input.prd.name);
  const resolution = await resolveNames({
    git: input.git,
    env: input.env,
    prd: input.prd,
    entries: input.entries,
    names,
    ...(input.say ? { say: input.say } : {}),
    ...(input.said ? { said: input.said } : {}),
    ...(input.changing ? { changing: input.changing } : {}),
    ...(input.home ? { home: input.home } : {}),
  });
  const written = input.entries.filter((entry) => entry.name !== input.prd.name);
  const given = giveNames(written, [
    { shortName: input.prd.name, addressPath: input.prd.github, prd: true },
    ...resolution.repositories.map((repository) => ({ shortName: repository.shortName, addressPath: repository.addressPath })),
  ]);
  if (!given.ok) return { named: [], problems: [...resolution.problems, given.problem], entries: resolution.entries, byName: new Map() };
  const rows = resolution.repositories.map((repository, index): NamedRepositoryRow => {
    const name = given.names[index + 1]!;
    const { found, ...rest } = repository;
    return { ...rest, name, ...(found ? { found: { ...found, name, ...(name !== repository.shortName ? { shortName: repository.shortName } : {}) } } : {}) };
  });
  // In plan order: each repository not set up, an entry whose setup an earlier Start left unfinished included, with its own checkout.
  const named: NamedRepositoryRow[] = [];
  const byName = new Map<string, PlanReach>();
  for (const { name: writtenName } of names) {
    const reached = resolution.byName.get(writtenName);
    if (!reached) continue;
    if (reached.kind !== "repository") {
      byName.set(writtenName, reached);
      const entry = reached.kind === "entry" ? input.entries.find((one) => one.name === reached.name) : undefined;
      if (entry && entry.setupCompletedAt === undefined && entry.kind !== "prd" && !named.some((row) => row.name === entry.name)) {
        named.push({ written: [writtenName], name: entry.name, shortName: entry.shortName ?? entry.name, addressPath: entry.github, found: { name: entry.name, mainCheckoutPath: entry.mainCheckoutPath, github: entry.github, ...(entry.shortName === undefined ? {} : { shortName: entry.shortName }), located: "beside" } });
      }
      continue;
    }
    const row = rows[resolution.repositories.indexOf(reached.repository)]!;
    byName.set(writtenName, { kind: "repository", row });
    if (!named.includes(row)) named.push(row);
  }
  return { named, problems: resolution.problems, entries: resolution.entries, byName };
}

/** What one name as written on the plan reached, with Kiln's name for a repository not set up. */
export type PlanReach = Exclude<Reached, { kind: "repository" }> | { kind: "repository"; row: NamedRepositoryRow };

/**
 * A reader's names after Start (a continuation's readiness, a base-branch start, external
 * completion evidence): what each name as written reaches, against the PRD's record, so each
 * reader works with Kiln's name for a repository (find repositories anywhere "Where names are compared").
 */
export async function reachRecordNames(git: GitContext, record: { repository: { name: string; github: string }; repositories: RepositoryEntry[] }, prdCheckout: string, phases: { fileName: string; repositories: string[] }[]): Promise<Map<string, PlanReach>> {
  const result = await resolvePlanRepositories({ git, env: git.env, prd: { name: record.repository.name, mainCheckoutPath: prdCheckout, github: record.repository.github }, entries: record.repositories, phases });
  return result.byName;
}

/** Kiln's name for what a name reached, or what to report instead: a problem, or the question's words while Kiln would ask (Phase 2 asks). */
export function reachedName(written: string, prdName: string, reached: PlanReach | undefined): { name: string; row?: NamedRepositoryRow } | { problem: string; unavailable?: true } {
  if (written === prdName || reached === undefined || reached.kind === "prd") return { name: prdName };
  if (reached.kind === "entry") return { name: reached.name };
  if (reached.kind === "problem") return { problem: reached.problem, ...(reached.unavailable ? { unavailable: true as const } : {}) };
  if (!reached.row.found) return { problem: `${questionSentence(reached.row.question!)} ${searchedSentence(reached.row.question!)}` };
  return { name: reached.row.name, row: reached.row };
}

/**
 * Kiln's name for a name a recorded scope or a plan line holds, from the record alone: an entry's
 * name, the entry or PRD's repository an address path reaches, else the name itself (an address
 * path lower-cased). A completed phase's recorded scope keeps the names as written; its readers
 * compare them with revisions, keyed by name, through this (find repositories anywhere "Names").
 *
 *   recordedName(record, "Acme-Labs/Admin")  // "admin", when an entry named admin has github acme-labs/admin
 */
export function recordedName(record: { repository: { name: string; github: string }; repositories: RepositoryEntry[] }, written: string): string {
  if (written === record.repository.name || record.repositories.some((entry) => entry.name === written)) return written;
  const read = readRepositoryName(written);
  if (read.kind !== "path") return written;
  if (sameAddressPath(read.addressPath, record.repository.github)) return record.repository.name;
  return record.repositories.find((entry) => sameAddressPath(entry.github, read.addressPath))?.name ?? read.addressPath.toLowerCase();
}

/**
 * The PRD's repositories for a label once Start is pressed (AC-FOLDER-02), from the record alone:
 * the PRD's repository, every entry, and every repository the plan as it stands names that no
 * entry is, by the plan's name for it.
 */
export function recordLabelSet(record: { repository: { name: string; github: string }; repositories: RepositoryEntry[] }, phases: { repositories: string[] }[]): (Labelled & { name?: string })[] {
  const set: (Labelled & { name?: string })[] = [];
  const add = (one: Labelled & { name?: string }) => {
    if (set.some((other) => (one.name !== undefined && other.name === one.name) || sameAddressPath(other.addressPath, one.addressPath))) return;
    set.push(one);
  };
  add({ name: record.repository.name, shortName: record.repository.name, addressPath: record.repository.github });
  for (const entry of record.repositories) add({ name: entry.name, shortName: shortNameOf(entry), addressPath: entry.github });
  for (const written of phases.flatMap((phase) => phase.repositories)) {
    const read = readRepositoryName(written);
    if (read.kind === "folder") {
      if (written === record.repository.name || record.repositories.some((entry) => entry.name === written || shortNameOf(entry) === written)) continue;
      add({ shortName: written, addressPath: written });
    } else if (read.kind === "path") add({ shortName: lastPart(read.addressPath), addressPath: read.addressPath });
  }
  return set;
}

/** Each entry's name, label and address path, for \x60kiln status --json\x60's \x60repository_details\x60 (in \x60repositories\x60' order). */
export function repositoryDetails(record: { repository: { name: string; github: string }; repositories: RepositoryEntry[]; plan?: { repositories: string[] }[] }): { name: string; label: string; address_path: string }[] {
  const set = recordLabelSet(record, record.plan ?? []);
  const entries = record.repositories.length ? record.repositories.map((entry) => ({ name: entry.name, shortName: shortNameOf(entry), addressPath: entry.github })) : [{ name: record.repository.name, shortName: record.repository.name, addressPath: record.repository.github }];
  return entries.map((entry) => ({ name: entry.name, label: labelAmong(entry, set), address_path: entry.addressPath }));
}
