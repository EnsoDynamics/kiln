// The PRD's repositories beside its own: finding each named or added repository as the folder
// of that name next to the PRD's repository, and the four checks it must pass (multi-repo PRD
// AC-REPO-02, AC-ADD-02; technical design, "Found beside the PRD's repository").

import { lstatSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseGithubOrigin } from "../github-origin.js";
import { runGit, type GitContext } from "./git-reads.js";
import { displayPath } from "./worktree-setup.js";

export interface FoundRepository {
  name: string;
  mainCheckoutPath: string;
  /** `<owner>/<name>`. */
  github: string;
}

export type RepositoryLookup = { ok: true; repository: FoundRepository } | { ok: false; problem: string };

/** The folder the PRD's repositories sit in: the real parent of the PRD's main checkout. */
export function repositoriesParent(prdMainCheckoutPath: string): string {
  return dirname(realpathSync.native(prdMainCheckoutPath));
}

/**
 * Finds a repository by folder name beside the PRD's repository, with the four checks: Found
 * (an entry of exactly that name in the parent folder's listing, case included), Not a link,
 * A checkout (its own top level), On GitHub. `namedIn` is the first phase file naming it, for
 * the start checks' wording; without it the wording is `kiln add-repository`'s.
 *
 *   await findRepository(git, "/home/a/acme", "storefront", "phase-2b-store-credit.md")
 *   // { ok: true, repository: { name: "storefront", mainCheckoutPath: "/home/a/acme/storefront", github: "acme/storefront" } }
 */
export async function findRepository(git: GitContext, parent: string, name: string, namedIn?: string): Promise<RepositoryLookup> {
  const shownParent = displayPath(parent);
  let entries: string[];
  try {
    entries = readdirSync(parent);
  } catch (error) {
    return { ok: false, problem: `Couldn't read ${shownParent}/: ${(error as Error).message}` };
  }
  // The listing, never an exists check: on macOS and Windows that ignores case.
  if (!entries.includes(name)) {
    return { ok: false, problem: namedIn === undefined ? `${name} isn’t in ${shownParent}/.` : `${namedIn} names ${name}, which isn’t in ${shownParent}/.` };
  }
  const folder = join(parent, name);
  if (lstatSync(folder).isSymbolicLink()) {
    let target: string;
    try {
      target = readlinkSync(folder);
    } catch {
      target = "another folder";
    }
    return { ok: false, problem: `${name} in ${shownParent}/ is a link to ${displayPath(resolve(parent, target))}; Kiln needs the checkout itself there.` };
  }
  const notCheckout = { ok: false as const, problem: `${name} in ${shownParent}/ isn’t a Git checkout.` };
  const toplevel = await runGit(git, folder, ["rev-parse", "--show-toplevel"]);
  if (toplevel.exitCode !== 0) return notCheckout;
  let top: string;
  try {
    top = realpathSync.native(resolve(toplevel.stdout.trim()));
  } catch {
    return notCheckout;
  }
  if (comparable(top) !== comparable(realpathSync.native(folder))) return notCheckout;
  const origin = await runGit(git, folder, ["remote", "get-url", "origin"]);
  if (origin.exitCode !== 0) return { ok: false, problem: `${name} in ${shownParent}/ has no origin remote.` };
  const github = parseGithubOrigin(origin.stdout);
  if (!github) return { ok: false, problem: `${name}: origin isn’t on GitHub: ${origin.stdout.trim()}` };
  return { ok: true, repository: { name, mainCheckoutPath: folder, github: `${github.owner}/${github.name}` } };
}

function comparable(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
