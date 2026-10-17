// Resolves the path given to `kiln run` to one PRD (PRD AC-START-01; technical design,
// "Command line").

import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { runHelper } from "./platform/helper-process.js";

export interface PrdLocation {
  /** The checkout the path is in: the main checkout, or a worktree such as Kiln's own. */
  checkoutRoot: string;
  /** The repository's main working tree, the first entry of `git worktree list`. */
  mainCheckoutPath: string;
  /** The main checkout's folder name (AC-LOOK-05). */
  repositoryName: string;
  /** The PRD directory, absolute. */
  prdDirectory: string;
  /** The PRD directory's path from the checkout root, with `/` separators: `docs/prds/customer-returns`. */
  prdDirectoryFromRoot: string;
  folderName: string;
  /** `<folder name>-prd.md`, the only file Kiln reads as the PRD. */
  prdFileName: string;
  featureName: string;
}

export type PrdResolution = { location: PrdLocation } | { problem: string };

/**
 * The feature name: the PRD folder's name with hyphens read as spaces and the first letter
 * capitalized (PRD, "Terms used in this PRD").
 *
 *   featureNameFor("customer-returns")  // "Customer returns"
 */
export function featureNameFor(folderName: string): string {
  const spaced = folderName.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Resolves a `kiln run` path (a PRD directory directly under `docs/prds/` or `docs/changes/`,
 * or the `<folder name>-prd.md` file in it) against the current directory. Any other path is
 * a problem, described in one line.
 */
export async function resolvePrdPath(pathArgument: string, cwd: string, git: string, env: NodeJS.ProcessEnv): Promise<PrdResolution> {
  const absolute = resolve(cwd, pathArgument);
  let directory: string;
  let fileName: string | undefined;

  if (existsSync(absolute)) {
    if (statSync(absolute).isDirectory()) {
      directory = absolute;
    } else {
      directory = dirname(absolute);
      fileName = basename(absolute);
    }
  } else {
    const parent = dirname(absolute);
    const missingPrdFile = existsSync(parent) && statSync(parent).isDirectory() && basename(absolute) === `${basename(parent)}-prd.md`;
    if (!missingPrdFile) return { problem: `${pathArgument} doesn't exist.` };
    directory = parent;
    fileName = basename(absolute);
  }

  const realDirectory = realpathSync.native(directory);
  const toplevel = await runHelper(git, ["-C", realDirectory, "rev-parse", "--show-toplevel"], { cwd: realDirectory, env });
  if (toplevel.exitCode !== 0) return { problem: `${pathArgument} isn't in a Git repository.` };
  const checkoutRoot = realpathSync.native(resolve(toplevel.stdout.trim()));

  const parts = relative(checkoutRoot, realDirectory).split(sep);
  const [docs, kind, folderName] = parts;
  if (parts.length !== 3 || docs !== "docs" || (kind !== "prds" && kind !== "changes") || !folderName) {
    return {
      problem: `${pathArgument} isn't a PRD directory: kiln run takes one PRD's directory, docs/prds/<name>/ or docs/changes/<name>/, or the PRD file in it.`,
    };
  }
  const prdDirectoryFromRoot = `docs/${kind}/${folderName}`;
  const prdFileName = `${folderName}-prd.md`;
  if (fileName !== undefined && fileName !== prdFileName) {
    return { problem: `${pathArgument} isn't the PRD: the PRD in ${prdDirectoryFromRoot}/ is ${prdFileName}.` };
  }

  const worktrees = await runHelper(git, ["-C", realDirectory, "worktree", "list", "--porcelain"], { cwd: realDirectory, env });
  const firstWorktree = /^worktree (.+)$/m.exec(worktrees.stdout)?.[1];
  if (worktrees.exitCode !== 0 || firstWorktree === undefined) {
    return { problem: `Couldn't list the repository's worktrees: ${(worktrees.stderr || worktrees.failure || "").trim()}` };
  }
  // In a submodule the first entry is the submodule's git directory (.git/modules/<name>), not
  // its working tree; asking that entry for its top level gives the working tree in both cases.
  const mainToplevel = await runHelper(git, ["-C", firstWorktree.trim(), "rev-parse", "--show-toplevel"], { cwd: realDirectory, env });
  if (mainToplevel.exitCode !== 0) {
    return { problem: `Couldn't find the repository's main checkout: ${(mainToplevel.stderr || mainToplevel.failure || "").trim()}` };
  }
  const mainCheckoutPath = realpathSync.native(resolve(mainToplevel.stdout.trim()));

  return {
    location: {
      checkoutRoot,
      mainCheckoutPath,
      repositoryName: basename(mainCheckoutPath),
      prdDirectory: realDirectory,
      prdDirectoryFromRoot,
      folderName,
      prdFileName,
      featureName: featureNameFor(folderName),
    },
  };
}
