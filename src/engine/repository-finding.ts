// Which repository each name on the plan reaches, and where its checkout is (find repositories
// anywhere AC-NAME-02, AC-FIND-01 to AC-FIND-04, AC-ASK-01 to AC-ASK-04; technical design,
// "Names", "Finding a Checkout", "The answer"). A name reaches the PRD's repository, an entry
// Kiln recorded, a folder beside the PRD's repository, or a checkout found by its `origin`; when
// Kiln can't tell which checkout, the result is a question for the person.

import { existsSync, lstatSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseGithubOrigin } from "../github-origin.js";
import { lastPart, parseRemoteAddress, readRepositoryName, sameAddressPath } from "../plan/repository-names.js";
import { forgetLocation, readRememberedLocation } from "../state/repository-locations.js";
import type { RepositoryEntry } from "../state/records.js";
import { findRepository, repositoriesParent, type FoundRepository } from "./repositories.js";
import { homeFolder, readOrigin, readOwnCheckout, searchCheckouts, type SearchResult } from "./repository-search.js";
import type { GitContext } from "./git-reads.js";
import { displayPath, expandHome } from "./worktree-setup.js";

/** How a found repository's checkout was found, as Documents found says (technical design, "Snapshot"). */
export type Located = "beside" | "search" | "answer";

/** What Kiln asks about a repository it can't place (technical design, "Snapshot"'s Question). */
export interface Question {
  kind: "where" | "which";
  /** The address path, as the plan or the request writes it. */
  repository: string;
  searchedFrom: string;
  /** The topmost root when the search didn't reach the home folder. */
  searchedTo?: string;
  checkouts: { folder: string; remote: string; pickable: boolean; remembered?: true }[];
  /** How many checkouts the search itself found (a remembered folder it didn't reach isn't counted). */
  found: number;
  /** Change, when the search found nothing: the remembered folder, already in the field. */
  field?: string;
  /** The answer's failed check, beside the field. */
  fieldError?: string;
}

/** A repository a plan name reached, not set up: found, or asked about. */
export interface NamedRepository {
  /** The names on the plan that reach it, as written, first first. */
  written: string[];
  /** Its short name: the folder name it was reached by, else the address path's last part. */
  shortName: string;
  /** Its address path: the origin's spelling once found, the plan's while it asks. */
  addressPath: string;
  found?: FoundRepository & { located: Located };
  question?: Question;
}

/** What one name as written reached. */
export type Reached =
  | { kind: "prd" }
  | { kind: "entry"; name: string }
  | { kind: "repository"; repository: NamedRepository }
  | { kind: "problem"; problem: string; unavailable?: true };

export interface Resolution {
  /** Each name as written, and what it reached. */
  byName: Map<string, Reached>;
  /** The repositories the names reach that aren't the PRD's or an entry's, in first-mention plan order. */
  repositories: NamedRepository[];
  /** Names reaching an entry Kiln recorded, by entry name. */
  entries: string[];
  /** Start problems: a folder name not found as today, a check Kiln couldn't run. */
  problems: string[];
}

export interface ResolveInput {
  git: GitContext;
  env: NodeJS.ProcessEnv;
  prd: { name: string; mainCheckoutPath: string; github: string };
  /** The record's repository entries: set up, or with setup unfinished. */
  entries: RepositoryEntry[];
  /** The plan's names, other than the PRD's own folder name, in first-mention plan order, with the first phase file naming each. */
  names: { name: string; namedIn: string }[];
  /** Address paths whose remembered answer is being changed (AC-ASK-05): asked as if nothing were remembered. */
  changing?: string[];
  /** One line for the terminal: a forgotten answer, an unreadable candidate, a newer store file. */
  say?: (text: string) => void;
  /** What has been said in this `kiln run`, so a line is said once. */
  said?: Set<string>;
  home?: string;
}

const real = (path: string) => { try { return realpathSync.native(path); } catch { return resolve(path); } };
const samePath = (a: string, b: string) => (process.platform === "linux" ? real(a) === real(b) : real(a).toLowerCase() === real(b).toLowerCase());

/**
 * Resolves the plan's names as the design's five steps give, searching once for every address
 * path that needs it.
 *
 *   const { repositories } = await resolveNames({ git, env, prd, entries: [], names: [{ name: "acme-labs/storefront", namedIn: "phase-3-dashboard.md" }] });
 *   repositories[0]  // { written: ["acme-labs/storefront"], shortName: "storefront", addressPath: "acme-labs/storefront", found: { …, located: "search" } }
 */
export async function resolveNames(input: ResolveInput): Promise<Resolution> {
  const parent = repositoriesParent(input.prd.mainCheckoutPath);
  const said = input.said ?? new Set<string>();
  const sayOnce = (text: string) => { if (said.has(text)) return; said.add(text); input.say?.(text); };
  const repositories: NamedRepository[] = [];
  const entries: string[] = [];
  const problems: string[] = [];
  const byName = new Map<string, Reached>();
  const order = new Map<NamedRepository | string, number>();
  let current = "";
  const reachEntry = (entry: RepositoryEntry, index: number) => {
    byName.set(current, { kind: "entry", name: entry.name });
    if (!entries.includes(entry.name)) { entries.push(entry.name); order.set(entry.name, index); }
  };
  const problem = (text: string, unavailable?: true) => { problems.push(text); byName.set(current, { kind: "problem", problem: text, ...(unavailable ? { unavailable } : {}) }); };
  const reachPrd = () => byName.set(current, { kind: "prd" });
  const reachRepository = (repository: NamedRepository) => byName.set(current, { kind: "repository", repository });

  // Folder names first, so an address path a folder name reaches is that repository (step 4).
  const paths: { name: string; addressPath: string; index: number }[] = [];
  for (const [index, { name, namedIn }] of input.names.entries()) {
    current = name;
    const read = readRepositoryName(name);
    if (read.kind === "problem") { problem(read.problem(namedIn)); continue; }
    if (read.kind === "path") { paths.push({ name, addressPath: read.addressPath, index }); continue; }
    if (name === input.prd.name) { reachPrd(); continue; }
    // Step 2: a folder beside the PRD's repository that is an entry's own checkout. A folder name
    // reaches only the folder beside the PRD's repository (AC-FIND-04): an entry whose checkout is
    // elsewhere, such as one set up from a search under that short name, is never reached by it.
    const besideFolder = join(parent, name);
    const besideEntry = input.entries.find((entry) => samePath(besideFolder, expandHome(entry.mainCheckoutPath)));
    if (besideEntry) { reachEntry(besideEntry, index); continue; }
    // Step 3: today's four checks beside the PRD's repository.
    const lookup = await findRepository(input.git, parent, name, namedIn);
    if (!lookup.ok) { problem(lookup.problem, lookup.unavailable); continue; }
    if (sameAddressPath(lookup.repository.github, input.prd.github)) { reachPrd(); continue; }
    const setUp = input.entries.find((entry) => entry.setupCompletedAt !== undefined && sameAddressPath(entry.github, lookup.repository.github));
    if (setUp) { reachEntry(setUp, index); continue; }
    const same = repositories.find((repository) => sameAddressPath(repository.addressPath, lookup.repository.github));
    if (same) { same.written.push(name); reachRepository(same); continue; }
    const repository: NamedRepository = { written: [name], shortName: name, addressPath: lookup.repository.github, found: { ...lookup.repository, located: "beside" } };
    repositories.push(repository);
    reachRepository(repository);
    order.set(repository, index);
  }

  let search: Promise<SearchResult> | undefined;
  const searched = () => (search ??= searchCheckouts({ git: input.git, prdMainCheckoutPath: input.prd.mainCheckoutPath, home: input.home ?? homeFolder(input.env) }).then((result) => {
    for (const unreadable of result.unreadable) sayOnce(`Kiln couldn’t read ${displayPath(unreadable.folder)} while searching for checkouts (${unreadable.error}).`);
    return result;
  }));

  for (const { name, addressPath, index } of paths) {
    current = name;
    // Step 1: the PRD's repository.
    if (sameAddressPath(addressPath, input.prd.github)) { reachPrd(); continue; }
    // Step 2: an entry Kiln recorded, set up or not.
    const entry = input.entries.find((one) => sameAddressPath(one.github, addressPath));
    if (entry) { reachEntry(entry, index); continue; }
    // Step 4: a repository a folder name, or an earlier spelling, already reaches.
    const same = repositories.find((repository) => sameAddressPath(repository.addressPath, addressPath));
    if (same) { same.written.push(name); reachRepository(same); continue; }
    // Step 5: found by its origin.
    const changing = input.changing?.some((one) => sameAddressPath(one, addressPath)) === true;
    const found = await findByAddressPath(input, addressPath, searched, sayOnce, changing);
    if ("problem" in found) { problem(found.problem, true); continue; }
    const repository: NamedRepository = { written: [name], shortName: lastPart(addressPath), addressPath: "found" in found ? found.found.github : addressPath, ...found };
    repositories.push(repository);
    reachRepository(repository);
    order.set(repository, index);
  }

  repositories.sort((a, b) => order.get(a)! - order.get(b)!);
  entries.sort((a, b) => order.get(a)! - order.get(b)!);
  return { byName, repositories, entries, problems };
}

type Finding = { found: FoundRepository & { located: Located } } | { question: Question } | { problem: string };

async function findByAddressPath(
  input: ResolveInput,
  addressPath: string,
  searched: () => Promise<SearchResult>,
  sayOnce: (text: string) => void,
  changing: boolean,
): Promise<Finding> {
  const remembered = readRememberedLocation(input.env, addressPath);
  let rememberedFolder: string | undefined;
  if (remembered.kind === "remembered") {
    const check = await checkAnswer(input.git, remembered.location.folder, addressPath);
    if (check.ok) {
      if (!changing) return { found: { name: lastPart(check.github), mainCheckoutPath: check.folder, github: check.github, located: "answer" } };
      rememberedFolder = check.folder;
    } else if ("unavailable" in check) {
      return { problem: `Couldn't read ${displayPath(remembered.location.folder)}'s checkout: ${check.unavailable}` };
    } else {
      forgetLocation(input.env, addressPath);
      input.say?.(`Kiln no longer remembers ${addressPath} at ${displayPath(remembered.location.folder)}. ${check.message}`);
    }
  } else if (remembered.kind === "unreadable" && remembered.kept) {
    sayOnce(`Kiln couldn’t read what it remembers about ${addressPath} (${remembered.error}).`);
  } else if (remembered.kind === "unreadable") {
    input.say?.(`Kiln no longer remembers ${addressPath}: it couldn’t read its record (${remembered.error}).`);
  } else if (remembered.kind === "newer") {
    sayOnce(`Kiln can’t use what a newer Kiln remembers about ${addressPath}. Update Kiln to use it.`);
  }

  const result = await searched();
  const matches = result.checkouts.filter((checkout) => sameAddressPath(checkout.addressPath, addressPath));
  const deliverable = matches.filter((checkout) => checkout.github !== undefined);
  if (!changing && matches.length === 1 && deliverable.length === 1) {
    const only = deliverable[0]!;
    return { found: { name: lastPart(only.github!), mainCheckoutPath: only.folder, github: only.github!, located: "search" } };
  }
  const where = { searchedFrom: result.searchedFrom, ...(result.searchedTo === undefined ? {} : { searchedTo: result.searchedTo }) };
  const listed: Question["checkouts"] = matches.map((checkout) => ({
    folder: checkout.folder,
    remote: checkout.remote,
    pickable: checkout.github !== undefined,
    ...(rememberedFolder !== undefined && samePath(checkout.folder, rememberedFolder) ? { remembered: true as const } : {}),
  }));
  // Change asks about one checkout on GitHub too, and lists the remembered folder, pickable, even when the search didn't reach it.
  if (deliverable.length === 0) {
    return { question: { kind: "where", repository: addressPath, ...where, checkouts: listed, found: matches.length, ...(rememberedFolder !== undefined ? { field: rememberedFolder } : {}) } };
  }
  if (rememberedFolder !== undefined && !listed.some((checkout) => checkout.remembered)) {
    const origin = await readOrigin(input.git, rememberedFolder);
    listed.push({ folder: rememberedFolder, remote: origin.kind === "url" ? origin.url : "", pickable: true, remembered: true });
  }
  return { question: { kind: "which", repository: addressPath, ...where, checkouts: listed, found: matches.length } };
}

/** The result of the checks an answer gets (AC-ASK-03). */
export type AnswerCheck =
  | { ok: true; folder: string; github: string; remote: string }
  | { ok: false; message: string }
  /** A check Kiln couldn't run: Git failing for another reason, or timing out. */
  | { ok: false; unavailable: string };

/**
 * Checks a folder given as the answer for an address path, in the design's order; the first
 * failure is the field's message.
 *
 *   await checkAnswer(git, "~/code/archive/storefront", "acme-labs/storefront")
 *   // { ok: true, folder: "/home/a/code/archive/storefront", github: "acme-labs/storefront", remote: "git@github.com:acme-labs/storefront.git" }
 */
export async function checkAnswer(git: GitContext, given: string, addressPath: string): Promise<AnswerCheck> {
  const text = given.trim();
  const fullPath = text.startsWith("/") || text === "~" || text.startsWith("~/") || (process.platform === "win32" && (isAbsolute(text) || text.startsWith("~\\")));
  if (!fullPath) return { ok: false, message: "Enter a full path, starting with / or ~." };
  const folder = resolve(expandHome(text));
  let isLink: boolean;
  try { isLink = lstatSync(folder).isSymbolicLink(); } catch { return { ok: false, message: "That folder doesn’t exist." }; }
  if (isLink) {
    let target: string;
    try { target = displayPath(resolve(dirname(folder), readlinkSync(folder))); } catch { target = "another folder"; }
    return { ok: false, message: `That folder is a link to ${target}. Give the checkout itself.` };
  }
  try { if (!lstatSync(folder).isDirectory()) return { ok: false, message: "That folder doesn’t exist." }; } catch { return { ok: false, message: "That folder doesn’t exist." }; }
  if (!existsSync(join(folder, ".git"))) return { ok: false, message: "That folder isn’t a Git checkout." };
  const own = await readOwnCheckout(git, folder);
  switch (own.kind) {
    case "unavailable": return { ok: false, unavailable: own.error };
    case "not_checkout": return { ok: false, message: "That folder isn’t a Git checkout." };
    case "inside": return { ok: false, message: `That folder is inside the checkout ${displayPath(own.topLevel)}. Give the checkout itself.` };
    case "worktree": return { ok: false, message: `That folder is a worktree of ${displayPath(own.mainCheckout)}. Give the checkout itself.` };
    case "submodule": return { ok: false, message: `That folder is a submodule of ${displayPath(own.parent)}. Give a checkout of its own.` };
    case "own": break;
  }
  const origin = await readOrigin(git, folder);
  if (origin.kind === "unavailable") return { ok: false, unavailable: origin.error };
  if (origin.kind === "none") return { ok: false, message: "That checkout has no origin remote." };
  const address = parseRemoteAddress(origin.url);
  if (!address || !sameAddressPath(address.addressPath, addressPath)) return { ok: false, message: `That checkout’s origin is ${address?.addressPath ?? origin.url}, not ${addressPath}.` };
  const github = parseGithubOrigin(origin.url);
  if (!github) return { ok: false, message: `That checkout’s origin, ${origin.url}, isn’t on GitHub. Kiln delivers only to GitHub.` };
  return { ok: true, folder: own.folder, github: `${github.owner}/${github.name}`, remote: origin.url };
}

/**
 * The question's first sentence, as the page, the terminal and a refusal say it.
 *
 *   questionSentence({ kind: "which", repository: "acme-labs/storefront", found: 2, … })
 *   // "Kiln found 2 checkouts of acme-labs/storefront."
 */
export function questionSentence(question: Question): string {
  if (question.kind === "which") return `Kiln found ${question.found} ${question.found === 1 ? "checkout" : "checkouts"} of ${question.repository}.`;
  return question.checkouts.length > 0 ? `Kiln couldn’t find a checkout of ${question.repository} that it can deliver to.` : `Kiln couldn’t find a checkout of ${question.repository}.`;
}

/** Where the question says Kiln searched: "It searched outward from ~/code/acme/, never above your home folder." */
export function searchedSentence(question: Pick<Question, "searchedFrom" | "searchedTo">): string {
  const from = `${displayPath(question.searchedFrom)}/`;
  return question.searchedTo === undefined ? `It searched outward from ${from}, never above your home folder.` : `It searched outward from ${from}, as far as ${displayPath(question.searchedTo)}/.`;
}
