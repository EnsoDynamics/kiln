import { posix } from "node:path";
import { gitError, runGit, type GitContext } from "../engine/git-reads.js";

export function validPrdDirectory(path: unknown): path is string {
  return typeof path === "string" && /^docs\/(?:prds|changes)\/[^/\\]+$/.test(path) && [...path].every(c => c.charCodeAt(0) >= 32) && ![".", ".."].includes(posix.basename(path));
}

export const prdFile = (directory: string) => `${directory}/${posix.basename(directory)}-prd.md`;
export const reviewFile = (directory: string) => `${directory}/${posix.basename(directory)}-stakeholder-review.html`;

export async function gitText(git: GitContext, cwd: string, args: string[]): Promise<string> {
  const result = await runGit(git, cwd, args);
  if (result.exitCode !== 0) throw new Error(gitError(result));
  return result.stdout.trimEnd();
}

export async function reviewState(git: GitContext, cwd: string, directory: string): Promise<{ current: boolean; file: string; commit: string; changed?: string }> {
  const file = reviewFile(directory);
  const commit = await gitText(git, cwd, ["log", "-1", "--format=%H", "HEAD", "--", file]);
  if (!commit || !(await gitText(git, cwd, ["ls-tree", "HEAD", "--", file])).startsWith("100")) return { current: false, file, commit };
  // A changed-and-later-restored input still makes the review stale. Only inputs present at its commit count.
  const files = (await gitText(git, cwd, ["ls-tree", "-r", "--name-only", "-z", commit, "--", directory])).split("\0").filter(Boolean);
  const changed = await gitText(git, cwd, ["--literal-pathspecs", "log", "-1", "--format=%H", `${commit}..HEAD`, "--", ...files]);
  return { current: !changed, file, commit, ...(changed ? { changed } : {}) };
}

export async function locateWrittenPrd(git: GitContext, cwd: string, base: string, prior?: string, reported?: string): Promise<{ directory?: string; missing?: string }> {
  const held = async (ref: string, file: string) => (await gitText(git, cwd, ["--literal-pathspecs", "ls-tree", ref, "--", file])).startsWith("100");
  if (prior) {
    const file = prdFile(prior);
    if (await held("HEAD", file)) return { directory: prior };
    const removed = await gitText(git, cwd, ["log", "-1", "--no-renames", "--diff-filter=D", "--format=%H", "HEAD", "--", file]);
    if (removed) {
      const names = (await gitText(git, cwd, ["diff", "--name-status", "-z", "--find-renames", `${removed}^`, "HEAD", "--", "docs/prds", "docs/changes"])).split("\0");
      for (let i = 0; i < names.length && names[i];) {
        const status = names[i++]!;
        const from = names[i++]!;
        if (!status.startsWith("R")) continue;
        const to = names[i++]!;
        if (from === file && validPrdDirectory(posix.dirname(to)) && prdFile(posix.dirname(to)) === to) return { directory: posix.dirname(to) };
      }
    }
  }
  if (validPrdDirectory(reported) && await held("HEAD", prdFile(reported)) && !await held(base, prdFile(reported))) return { directory: reported };
  if (prior) return { missing: `Kiln can't find ${prdFile(prior)} or the PRD that replaced it.` };
  const added = (await gitText(git, cwd, ["diff", "--no-renames", "--diff-filter=A", "--name-only", "-z", base, "HEAD", "--", "docs/prds", "docs/changes"])).split("\0");
  if (added.some(f => validPrdDirectory(posix.dirname(f)) && f === prdFile(posix.dirname(f)))) return { missing: "Kiln can't tell which PRD this session wrote." };
  return {};
}
