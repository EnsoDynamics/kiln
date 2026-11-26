// The repository search (find repositories anywhere AC-FIND-01, AC-FIND-02, AC-FIND-05;
// technical design, "The search"): one bounded walk of the folders around the PRD's repository
// that lists every repository's own checkout with its `origin`, without entering a checkout,
// following a link, crossing to another disk or listing a folder the operating system guards.

import { lstatSync, readdirSync, readFileSync, realpathSync, statSync, type Stats } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
import { parseGithubOrigin } from "../github-origin.js";
import { parseRemoteAddress } from "../plan/repository-names.js";
import { gitError, runGit, type GitContext } from "./git-reads.js";

/** How far down from each root the search goes, a root's own entries being level one. */
export const SEARCH_DEPTH = 4;
/** How many candidates' `origin` Git reads at once. */
const READS_AT_ONCE = 8;

/** Folders named directly in the home folder that the search passes over, by system (compared without case). */
export const GUARDED_FOLDERS: Record<string, string[]> = {
  darwin: ["desktop", "documents", "downloads", "library", "pictures", "music", "movies"],
  win32: ["appdata"],
  linux: [],
};

/** The person's home folder, from the environment Kiln runs with. */
export function homeFolder(env: NodeJS.ProcessEnv): string {
  const fromEnv = process.platform === "win32" ? env.USERPROFILE : env.HOME;
  const home = fromEnv !== undefined && fromEnv !== "" ? fromEnv : homedir();
  try { return realpathSync.native(home); } catch { return resolve(home); }
}

export interface SearchRoots {
  /** Innermost first: the PRD's main checkout's real parent, then each folder above it. */
  roots: string[];
  /** The folder the question says Kiln searched from. */
  searchedFrom: string;
  /** The topmost root when it isn't the home folder, which the question then names. */
  searchedTo?: string;
}

const comparable = (path: string) => (process.platform === "win32" || process.platform === "darwin" ? path.toLowerCase() : path);
const samePath = (a: string, b: string) => comparable(resolve(a)) === comparable(resolve(b));
const isInside = (path: string, folder: string) => samePath(path, folder) || comparable(resolve(path)).startsWith(comparable(resolve(folder)).replace(/[\\/]+$/, "") + sep);

/**
 * The search roots: the real parent folder of the PRD's main checkout and each folder above it up
 * to and including the home folder; outside the home folder, that parent and the two above it,
 * stopping below the top of a disk and below a folder that holds the home folder.
 *
 *   searchRoots("/home/a/code/acme/product", "/home/a")
 *   // { roots: ["/home/a/code/acme", "/home/a/code", "/home/a"], searchedFrom: "/home/a/code/acme" }
 */
export function searchRoots(prdMainCheckoutPath: string, home: string): SearchRoots {
  const parent = dirname(realpathSync.native(prdMainCheckoutPath));
  const roots = [parent];
  if (isInside(parent, home) && !samePath(parent, home)) {
    let folder = parent;
    while (!samePath(folder, home)) {
      folder = dirname(folder);
      roots.push(folder);
    }
    return { roots, searchedFrom: parent };
  }
  if (samePath(parent, home)) return { roots, searchedFrom: parent };
  let folder = parent;
  for (let climbed = 0; climbed < 2; climbed++) {
    const above = dirname(folder);
    // Never above the home folder: a folder that holds it would walk into it and other people's folders.
    if (above === folder || topOfDisk(above) || differentDevice(folder, above) || isInside(home, above)) break;
    roots.push(above);
    folder = above;
  }
  return { roots, searchedFrom: parent, searchedTo: roots.at(-1)! };
}

/** The file system's root or a drive's root. */
function topOfDisk(folder: string): boolean {
  return parse(folder).root === folder || dirname(folder) === folder;
}

function differentDevice(folder: string, parent: string): boolean {
  try { return statSync(folder).dev !== statSync(parent).dev; } catch { return true; }
}

/** A repository's own checkout the search found, with its `origin`. */
export interface FoundCheckout {
  /** The checkout's real path. */
  folder: string;
  /** Its `origin`, as Git reads it. */
  remote: string;
  host: string;
  addressPath: string;
  /** `<owner>/<name>` when the origin is on GitHub by today's check (AC-FIND-03). */
  github?: string;
}

export interface SearchResult extends SearchRoots {
  checkouts: FoundCheckout[];
  /** Candidates Git couldn't read, each with Git's error. */
  unreadable: { folder: string; error: string }[];
  /** Every folder the walk listed, for the no-permission-prompt test (AC-FIND-05). */
  listed: string[];
}

export interface SearchOptions {
  git: GitContext;
  prdMainCheckoutPath: string;
  home: string;
  platform?: NodeJS.Platform;
}

/**
 * Walks every root in full (ASK-004) and reads each candidate's `origin`.
 *
 *   const result = await searchCheckouts({ git, prdMainCheckoutPath: "/home/a/code/acme/product", home: "/home/a" });
 *   result.checkouts.filter((checkout) => sameAddressPath(checkout.addressPath, "acme-labs/storefront"))
 */
export async function searchCheckouts(options: SearchOptions): Promise<SearchResult> {
  const where = searchRoots(options.prdMainCheckoutPath, options.home);
  const guarded = new Set(GUARDED_FOLDERS[options.platform ?? process.platform] ?? []);
  const rootSet = where.roots.map((root) => comparable(root));
  const listed: string[] = [];
  const candidates: string[] = [];

  const walk = (folder: string, level: number, folderStat: Stats) => {
    let entries: string[];
    try { entries = readdirSync(folder); } catch { return; }
    listed.push(folder);
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const path = join(folder, name);
      let entry: Stats;
      try { entry = lstatSync(path); } catch { continue; }
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      if (entry.dev !== folderStat.dev) continue;
      if (samePath(folder, options.home) && guarded.has(name.toLowerCase())) continue;
      const git = gitEntry(path);
      if (git === "checkout") { candidates.push(path); continue; }
      if (git === "worktree") continue;
      // An inner root's own walk reaches everything below it, more deeply.
      if (rootSet.includes(comparable(path))) continue;
      if (level < SEARCH_DEPTH) walk(path, level + 1, entry);
    }
  };
  for (const root of where.roots) {
    let rootStat: Stats;
    try { rootStat = statSync(root); } catch { continue; }
    walk(root, 1, rootStat);
  }

  const checkouts: FoundCheckout[] = [];
  const unreadable: SearchResult["unreadable"] = [];
  const unique = [...new Set(candidates)];
  for (let index = 0; index < unique.length; index += READS_AT_ONCE) {
    const reads = await Promise.all(unique.slice(index, index + READS_AT_ONCE).map((folder) => readCandidate(options.git, folder)));
    for (const read of reads) {
      if (read.kind === "checkout") checkouts.push(read.checkout);
      else if (read.kind === "unreadable") unreadable.push({ folder: read.folder, error: read.error });
    }
  }
  return { ...where, checkouts, unreadable, listed };
}

/**
 * What a folder's `.git` entry makes it: a `.git` folder, or a `.git` file that isn't a
 * worktree's, is a candidate; a worktree's `.git` file is passed over without running Git.
 */
function gitEntry(folder: string): "checkout" | "worktree" | "none" {
  const dotGit = join(folder, ".git");
  let stat: Stats;
  try { stat = lstatSync(dotGit); } catch { return "none"; }
  if (stat.isDirectory() || stat.isSymbolicLink()) return "checkout";
  if (!stat.isFile()) return "none";
  try {
    const line = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim() ?? "";
    return /[\\/]worktrees[\\/][^\\/]+[\\/]?$/.test(line) ? "worktree" : "checkout";
  } catch { return "checkout"; }
}

type CandidateRead = { kind: "checkout"; checkout: FoundCheckout } | { kind: "left_out" } | { kind: "unreadable"; folder: string; error: string };

async function readCandidate(git: GitContext, folder: string): Promise<CandidateRead> {
  const own = await readOwnCheckout(git, folder);
  if (own.kind === "unavailable") return { kind: "unreadable", folder, error: own.error };
  if (own.kind !== "own") return { kind: "left_out" };
  const origin = await readOrigin(git, folder);
  if (origin.kind === "unavailable") return { kind: "unreadable", folder, error: origin.error };
  if (origin.kind === "none") return { kind: "left_out" };
  const address = parseRemoteAddress(origin.url);
  if (!address) return { kind: "left_out" };
  const github = parseGithubOrigin(origin.url);
  return { kind: "checkout", checkout: { folder: own.folder, remote: origin.url, host: address.host, addressPath: address.addressPath, ...(github ? { github: `${github.owner}/${github.name}` } : {}) } };
}

export type OwnCheckoutRead =
  | { kind: "own"; folder: string }
  | { kind: "not_checkout" }
  | { kind: "inside"; topLevel: string }
  | { kind: "worktree"; mainCheckout: string }
  | { kind: "submodule"; parent: string }
  | { kind: "unavailable"; error: string };

/**
 * Whether a folder is its repository's own checkout, by one Git read: Git's top level is the
 * folder itself, its Git directory is its common directory, and it has no superproject.
 */
export async function readOwnCheckout(git: GitContext, folder: string): Promise<OwnCheckoutRead> {
  const read = await runGit(git, folder, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir", "--show-superproject-working-tree"]);
  if (read.exitCode !== 0) {
    if (!read.failure && read.exitCode === 128 && /not a git repository/i.test(read.stderr)) return { kind: "not_checkout" };
    if (!read.failure && read.exitCode === 128 && /must be run in a work tree|bare repository/i.test(read.stderr)) return { kind: "not_checkout" };
    return { kind: "unavailable", error: gitError(read) };
  }
  const [topLevel, gitDir, commonDir, superproject] = read.stdout.split(/\r?\n/).map((line) => line.trim());
  if (!topLevel || !gitDir || !commonDir || !isAbsolute(topLevel)) return { kind: "not_checkout" };
  const real = (path: string) => { try { return realpathSync.native(path); } catch { return resolve(path); } };
  const here = real(folder);
  if (!samePath(real(topLevel), here)) return { kind: "inside", topLevel: real(topLevel) };
  if (!samePath(real(gitDir), real(commonDir))) {
    const common = real(commonDir);
    return { kind: "worktree", mainCheckout: /[\\/]\.git$/.test(common) ? dirname(common) : common };
  }
  if (superproject) return { kind: "submodule", parent: real(superproject) };
  return { kind: "own", folder: here };
}

export type OriginRead = { kind: "url"; url: string } | { kind: "none" } | { kind: "unavailable"; error: string };

/** A checkout's `origin`, read by Git so the person's URL rewrites apply. */
export async function readOrigin(git: GitContext, folder: string): Promise<OriginRead> {
  const origin = await runGit(git, folder, ["remote", "get-url", "origin"]);
  if (origin.exitCode === 0) return { kind: "url", url: origin.stdout.trim() };
  if (!origin.failure && origin.exitCode === 2 && /No such remote ['"]origin['"]/i.test(origin.stderr)) return { kind: "none" };
  return { kind: "unavailable", error: gitError(origin) };
}
