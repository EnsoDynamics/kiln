// Stayed in the workspace, the done check's fourth part (multi-repo PRD AC-OUTSIDE-01 to 03;
// technical design, "Stayed in the workspace"): what a session's transcript shows it and its
// subagents changing in a Git checkout outside the workspace. Only the transcript is read,
// never the state of those checkouts, and no model judges it.

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, posix, relative, resolve, sep, win32 } from "node:path";
import { comparable, displayPath, expandHome, isWithin, realPathOfNearestAncestor } from "../engine/worktree-setup.js";
import type { CheckResult } from "../state/records.js";
import { simpleCommands } from "./bash-command.js";
import { findTranscripts, readTranscript, type TranscriptRead } from "./transcripts.js";

export const STAYED_CHECK_NAME = "Stayed in the workspace";

/** The line after the changes on Needs you (technical design, "The Done Check"). */
export const OUTSIDE_NOTE = "Kiln changed nothing in that checkout, since it may hold other work too.";

/** The fact a passing check shows, when it failed earlier in the same stop. */
export const STAYED_PASSED_FACT = "The changes outside the workspace have been dealt with";

const POWERSHELL_FACT = "Ran PowerShell commands Kiln can't read";

/** How a Bash path is placed: Windows form on Windows, from the user profile folder for `~`. */
export interface PathContext {
  platform: NodeJS.Platform;
  home: string;
}

const NATIVE: PathContext = { platform: process.platform, home: homedir() };

// ---- Reading a Bash call's Git commands ------------------------------------------------------

/** A Git command a Bash call ran, with the place it ran on, when Kiln can tell. */
export interface GitCommandSeen {
  /** Undefined for `git` with no subcommand (`git --version`). */
  subcommand: string | undefined;
  args: string[];
  /** The work tree, Git directory or directory it ran in, absolute; undefined when Kiln can't tell. */
  place: string | undefined;
}

const LEADING_KEYWORDS = new Set(["do", "then", "else", "{", "if", "elif", "while", "until", "!"]);
const WRAPPERS = new Set(["command", "env", "exec", "nohup", "nice", "sudo", "time", "timeout", "xargs"]);
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s;
const NUMBER_OR_DURATION = /^\d+(\.\d+)?[smhd]?$/;
/** Git's own leading options that take the next word as their value. */
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"]);

/**
 * The Git commands in a Bash call, each placed by the call's working directory, any `cd`,
 * `pushd` or `popd` before it in the call, its `-C` options, and `GIT_WORK_TREE` or `GIT_DIR`
 * (technical design, "Bash calls"). A `cd` Kiln can't follow leaves later commands unplaced.
 *
 *   gitCommandsIn("cd ../design-system && git commit -m x", "/home/alex/devel/acme/.worktrees/returns")
 *   // [{ subcommand: "commit", args: ["-m", "x"], place: "/home/alex/devel/acme/.worktrees/design-system" }]
 */
export function gitCommandsIn(command: string, cwd: string, context: PathContext = NATIVE): GitCommandSeen[] {
  const seen: GitCommandSeen[] = [];
  let directory: string | undefined = cwd;
  const stack: (string | undefined)[] = [];
  const exported = new Map<string, string>();

  for (const words of simpleCommands(command)) {
    const assignments = new Map<string, string>();
    let index = 0;
    for (;;) {
      const word = words[index];
      if (word === undefined) break;
      if (LEADING_KEYWORDS.has(word)) index++;
      else if (ASSIGNMENT.test(word)) {
        const [, name, value] = ASSIGNMENT.exec(word)!;
        assignments.set(name!, value!);
        index++;
      } else if (WRAPPERS.has(word)) {
        index++;
        while (index < words.length && (words[index]!.startsWith("-") || ASSIGNMENT.test(words[index]!) || NUMBER_OR_DURATION.test(words[index]!))) {
          const assignment = ASSIGNMENT.exec(words[index]!);
          if (assignment) assignments.set(assignment[1]!, assignment[2]!);
          index++;
        }
      } else break;
    }
    const first = words[index];
    const rest = words.slice(index + 1);
    if (first === undefined) continue;

    if (first === "cd" || first === "pushd") {
      // `cd -`, `pushd +1` and a `cd` with no argument go somewhere Kiln can't read from the words.
      const target = rest.find((word) => !/^-[LPe@]+$/.test(word) && word !== "--");
      const before = directory;
      const literal = target !== undefined && target !== "-" && !/^[+-]\d+$/.test(target);
      directory = !literal || directory === undefined ? undefined : bashPath(target, directory, context);
      if (first === "pushd") stack.push(before);
      continue;
    }
    if (first === "popd") {
      directory = rest.length === 0 && stack.length > 0 ? stack.pop() : undefined;
      continue;
    }
    if (first === "export" || first === "unset") {
      for (const word of rest) {
        const assignment = ASSIGNMENT.exec(word);
        if (first === "export" && assignment) exported.set(assignment[1]!, assignment[2]!);
        if (first === "unset") exported.delete(word);
      }
      continue;
    }
    if (first !== "git" && !first.endsWith("/git")) continue;

    let place = directory;
    let workTree = assignments.get("GIT_WORK_TREE") ?? exported.get("GIT_WORK_TREE");
    let gitDir = assignments.get("GIT_DIR") ?? exported.get("GIT_DIR");
    let position = 0;
    while (position < rest.length && rest[position]!.startsWith("-")) {
      const option = rest[position]!;
      const [name, inline] = option.startsWith("--") && option.includes("=") ? [option.slice(0, option.indexOf("=")), option.slice(option.indexOf("=") + 1)] : [option, undefined];
      const value = inline ?? (GIT_OPTIONS_WITH_VALUE.has(name) ? rest[position + 1] : undefined);
      position += inline === undefined && GIT_OPTIONS_WITH_VALUE.has(name) ? 2 : 1;
      if (name === "-C") place = place === undefined || value === undefined ? undefined : bashPath(value, place, context);
      else if (name === "--work-tree") workTree = value;
      else if (name === "--git-dir") gitDir = value;
    }
    const pointed = workTree ?? gitDir;
    if (pointed !== undefined) place = place === undefined ? undefined : bashPath(pointed, place, context);
    seen.push({ subcommand: rest[position], args: rest.slice(position + 1), place });
  }
  return seen;
}

/**
 * A word of a Bash command as the path it names, the way Claude Code places it: `~` and
 * `$HOME` expanded; on Windows `/c/…` and `/cygdrive/c/…` as `C:\…`, `//host/share` as
 * `\\host\share`, any other POSIX path in no checkout. Undefined when the word isn't a literal path.
 *
 *   bashPath("/c/home/me/acme", "C:\\work", { platform: "win32", home: "C:\\home\\me" })  // "C:\\home\\me\\acme"
 */
export function bashPath(word: string, from: string, context: PathContext = NATIVE): string | undefined {
  const path = context.platform === "win32" ? win32 : posix;
  let text = word;
  const home = /^(~|\$HOME|\$\{HOME\})(?=$|\/)/.exec(text);
  if (home) text = context.home + text.slice(home[0].length);
  else if (text === "" || text.includes("$") || text.includes("`")) return undefined;
  if (context.platform !== "win32" || home) return path.resolve(from, text);
  const cygdrive = /^\/cygdrive\/([A-Za-z])(\/.*)?$/.exec(text) ?? /^\/([A-Za-z])(\/.*)?$/.exec(text);
  if (cygdrive) return win32.resolve(`${cygdrive[1]!.toUpperCase()}:\\`, (cygdrive[2] ?? "").replace(/^\//, ""));
  const share = /^\/\/([^/]+)\/(.+)$/.exec(text);
  if (share) return win32.resolve(`\\\\${share[1]}\\${share[2]!.replace(/\//g, "\\")}`);
  if (/^[A-Za-z]:[\\/]/.test(text)) return win32.resolve(text);
  if (text.startsWith("/")) return undefined;
  return win32.resolve(from, text);
}

// ---- What counts ------------------------------------------------------------------------------

const READ_ONLY = new Set([
  "status", "log", "whatchanged", "diff", "diff-tree", "diff-index", "diff-files", "range-diff", "show", "show-branch", "blame", "grep",
  "ls-files", "ls-remote", "ls-tree", "rev-parse", "rev-list", "merge-base", "describe", "name-rev", "cherry", "cat-file", "for-each-ref",
  "show-ref", "shortlog", "count-objects", "var", "check-ignore", "check-attr", "check-ref-format", "verify-commit", "verify-tag", "help", "version",
]);

/** The words that aren't options, everything after `--` included. */
function positionals(args: string[], withValue: Set<string> = new Set()): string[] {
  const found: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const word = args[index]!;
    if (word === "--") return [...found, ...args.slice(index + 1)];
    if (word.startsWith("-") && word !== "-") {
      if (withValue.has(word)) index++;
      continue;
    }
    found.push(word);
  }
  return found;
}

/** Whether any argument is one of the options: a long name (with or without `=…`), or a letter in a cluster of short ones. */
function hasOption(args: string[], longNames: string[], letters: string): boolean {
  return args.some((word) => {
    if (word === "--") return false;
    if (word.startsWith("--")) return longNames.includes(word.split("=")[0]!);
    if (/^-[A-Za-z]/.test(word)) return [...word.slice(1).replace(/\d.*$/, "")].some((letter) => letters.includes(letter));
    return false;
  });
}

/** Options whose value is the next word, so it isn't taken for the repository or a refspec. */
const FETCH_OPTIONS_WITH_VALUE = new Set(["--depth", "--deepen", "--shallow-since", "--shallow-exclude", "-j", "--jobs", "--upload-pack", "--refmap", "--negotiation-tip", "-o", "--server-option", "--filter", "--recurse-submodules-default"]);
const BRANCH_OR_TAG_OPTIONS_WITH_VALUE = new Set(["--format", "--sort", "--color", "--column"]);

const BRANCH_OR_TAG_CHANGES = ["--delete", "--move", "--copy", "--force", "--set-upstream-to", "--unset-upstream", "--edit-description", "--track", "--annotate", "--sign", "--local-user", "--message", "--file", "--create-reflog"];

function readOnlyBranchOrTag(kind: "branch" | "tag", given: string[]): boolean {
  // An option's value (`--sort -committerdate`) is neither an option of its own nor a positional.
  const args = given.filter((_, index) => index === 0 || !BRANCH_OR_TAG_OPTIONS_WITH_VALUE.has(given[index - 1]!));
  if (hasOption(args, BRANCH_OR_TAG_CHANGES, kind === "tag" ? "dDmMcCfutsFa" : "dDmMcCfutsF")) return false;
  const listing =
    kind === "branch"
      ? hasOption(args, ["--show-current", "--list", "--all", "--remotes", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at"], "lar")
      : hasOption(args, ["--list", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--verify"], "lnv");
  return listing || positionals(args).length === 0;
}

function readOnlyConfig(args: string[]): boolean {
  if (hasOption(args, ["--get", "--get-all", "--get-regexp", "--get-urlmatch", "--get-color", "--get-colorbool", "--list"], "l")) return true;
  const words = positionals(args, new Set(["--file", "-f", "--blob", "--type", "--default", "--comment", "-t"]));
  if (words[0] === "get" || words[0] === "list") return true;
  const action = hasOption(args, ["--add", "--unset", "--unset-all", "--replace-all", "--rename-section", "--remove-section", "--edit"], "e");
  return !action && words.length === 1;
}

export type GitChange = { kind: "commit" } | { kind: "push" } | { kind: "ran"; subcommand: string };

/**
 * Whether a Git command changes a checkout (technical design, "What counts", OUT-002): its
 * files, its staged changes or its branch; a local branch; or a push. Subcommands Kiln doesn't
 * recognize count as changes. Undefined for a read-only command.
 *
 *   gitChange("stash", ["list"])        // undefined
 *   gitChange("branch", ["-D", "old"])  // { kind: "ran", subcommand: "branch" }
 */
export function gitChange(subcommand: string | undefined, args: string[]): GitChange | undefined {
  if (subcommand === undefined || READ_ONLY.has(subcommand)) return undefined;
  const first = positionals(args)[0];
  const changed: GitChange = { kind: "ran", subcommand };
  switch (subcommand) {
    case "commit":
      return { kind: "commit" };
    case "push":
      return { kind: "push" };
    case "stash":
      return first === "list" || first === "show" ? undefined : changed;
    case "reflog":
      return first === undefined || first === "show" ? undefined : changed;
    case "worktree":
      return first === "list" ? undefined : changed;
    case "notes":
      return first === undefined || first === "list" || first === "show" ? undefined : changed;
    case "submodule":
      return first === undefined || first === "status" || first === "summary" ? undefined : changed;
    case "remote":
      return first === undefined || first === "show" || first === "get-url" ? undefined : changed;
    case "config":
      return readOnlyConfig(args) ? undefined : changed;
    case "symbolic-ref":
      return !hasOption(args, ["--delete"], "d") && positionals(args, new Set(["-m"])).length === 1 ? undefined : changed;
    case "branch":
    case "tag":
      return readOnlyBranchOrTag(subcommand, args) ? undefined : changed;
    case "fetch":
      return positionals(args, FETCH_OPTIONS_WITH_VALUE).slice(1).some((word) => word.includes(":")) ? changed : undefined;
    default:
      return changed;
  }
}

// ---- Where it happened ------------------------------------------------------------------------

/**
 * Where a path is: inside one of the workspace's worktrees (given comparable, real), in another
 * Git checkout (the nearest ancestor holding a `.git` entry), or in none. Only that entry is
 * looked for, never the checkout's status.
 */
export function placePath(path: string, worktrees: string[]): { inside: true } | { inside: false; checkout: string | undefined } {
  const real = realPathOfNearestAncestor(resolve(path));
  if (worktrees.some((worktree) => isWithin(comparable(real), worktree))) return { inside: true };
  for (let folder = real; ; folder = dirname(folder)) {
    if (existsSync(join(folder, ".git"))) return { inside: false, checkout: folder };
    if (dirname(folder) === folder) return { inside: false, checkout: undefined };
  }
}

/**
 * The repository a checkout belongs to, by folder name: its own, or for a linked worktree (a
 * subagent's under `.claude/worktrees/`, another PRD's), its main checkout's, read from the
 * `gitdir:` line of its `.git` file.
 *
 *   repositoryOf("/home/alex/devel/acme/design-system/.claude/worktrees/agent-a1")  // "design-system"
 */
export function repositoryOf(checkout: string): string {
  const dotGit = join(checkout, ".git");
  try {
    if (statSync(dotGit).isFile()) {
      const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim();
      const main = pointer === undefined ? undefined : /^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+[\\/]?$/.exec(resolve(checkout, pointer))?.[1];
      if (main !== undefined) return basename(main);
    }
  } catch {
    // Unreadable: the checkout's own folder name stands.
  }
  return basename(checkout);
}

/** A change outside the workspace, with the transcript time it was recorded at. */
export interface OutsideChange {
  at: string;
  fact: string;
  /** The checkout, as its real path; absent for a PowerShell call, which is in no known checkout. */
  checkout?: string;
  /** The repository the checkout belongs to, by folder name (`repositoryOf`). */
  repository?: string;
}

const FILE_TOOLS: Record<string, "file_path" | "notebook_path"> = { Edit: "file_path", MultiEdit: "file_path", Write: "file_path", NotebookEdit: "notebook_path" };

/**
 * The changes outside the workspace one transcript file records (technical design, "What
 * counts"). A file tool call that failed wrote nothing; every Bash call counts whatever its
 * result, and so does a call cut off before its result.
 */
export function outsideChanges(read: TranscriptRead, worktrees: string[], context: PathContext = NATIVE): OutsideChange[] {
  const changes: OutsideChange[] = [];
  for (const call of read.calls) {
    const field = FILE_TOOLS[call.name];
    if (field !== undefined) {
      const path = call.input[field];
      if (call.result?.isError || typeof path !== "string") continue;
      const place = placePath(path, worktrees);
      if (place.inside || place.checkout === undefined) continue;
      const fromCheckout = relative(place.checkout, realPathOfNearestAncestor(resolve(path)));
      if (fromCheckout === ".agent-sessions" || fromCheckout.startsWith(`.agent-sessions${sep}`)) continue;
      const verb = call.name === "Write" ? "Wrote" : "Edited";
      changes.push({ at: call.at, fact: `${verb} ${fromCheckout.split(sep).join("/")} in ${displayPath(place.checkout)}`, checkout: place.checkout, repository: repositoryOf(place.checkout) });
    } else if (call.name === "Bash" && typeof call.input.command === "string") {
      const commands = gitCommandsIn(call.input.command, call.cwd, context);
      // Each `[<branch> <sha>]` line of the result, in the order the call's commits ran.
      const commitLines = [...(call.result?.text ?? "").matchAll(/^\[(.+?) (?:\(root-commit\) )?([0-9a-f]{7,40})\]/gm)];
      let commitIndex = 0;
      for (const seen of commands) {
        const change = gitChange(seen.subcommand, seen.args);
        const line = change?.kind === "commit" ? commitLines[commitIndex++] : undefined;
        if (change === undefined || seen.place === undefined) continue;
        const place = placePath(seen.place, worktrees);
        if (place.inside || place.checkout === undefined) continue;
        const where = displayPath(place.checkout);
        const fact =
          change.kind === "commit"
            ? line
              ? `Committed ${line[2]!.slice(0, 7)} to ${line[1]} in ${where}`
              : `Ran git commit in ${where}`
            : change.kind === "push"
              ? `Pushed from ${where}`
              : `Ran git ${change.subcommand} in ${where}`;
        changes.push({ at: call.at, fact, checkout: place.checkout, repository: repositoryOf(place.checkout) });
      }
    } else if (call.name === "PowerShell") {
      changes.push({ at: call.at, fact: POWERSHELL_FACT });
    }
  }
  return changes;
}

// ---- The check --------------------------------------------------------------------------------

/** One session Kiln recorded for the phase, as the check reads it. */
export interface StayedSession {
  sessionId: string;
  /** Whether any of its runs reported `init`; a session that never did ran nothing. */
  reportedInit: boolean;
  /** Its last run's `endedAt`, when Kiln recorded it. */
  endedAt?: string;
}

export interface StayedInput {
  sessions: StayedSession[];
  /** The workspace's worktrees. */
  worktrees: string[];
  configFolder: string;
  /** The phase's confirmations; the latest covers every change recorded at or before it. */
  confirmations: { at: string }[];
  /** The phase's current stop's `at`, standing in for a session end Kiln didn't record. */
  stopAt?: string;
  context?: PathContext;
}

/** A transcript Kiln couldn't find or read, as a fact. */
export interface TranscriptProblem {
  sessionId: string;
  missing: boolean;
  fact: string;
}

export interface StayedOutcome {
  passed: boolean;
  /** The changes no confirmation covers, each fact once, in transcript order. */
  changes: OutsideChange[];
  /** The missing or unreadable transcripts no confirmation covers. */
  transcripts: TranscriptProblem[];
  /** The facts for Needs you: the changes, the note, then the transcripts. */
  check: CheckResult;
}

/**
 * Runs Stayed in the workspace over the phase's sessions (AC-OUTSIDE-01, AC-OUTSIDE-03).
 *
 *   const outcome = stayedInWorkspace({ sessions, worktrees, configFolder: "/home/alex/.claude", confirmations: [] });
 *   outcome.check  // { name: "Stayed in the workspace", passed: false, facts: ["Edited src/tokens/colors.ts in ~/devel/acme/design-system", "Kiln changed nothing…"] }
 */
export function stayedInWorkspace(input: StayedInput): StayedOutcome {
  const worktrees = input.worktrees.map((worktree) => comparable(realPathOfNearestAncestor(resolve(expandHome(worktree)))));
  const confirmedAt = Math.max(-Infinity, ...input.confirmations.map((confirmation) => Date.parse(confirmation.at)));
  const all: OutsideChange[] = [];
  const transcripts: TranscriptProblem[] = [];
  for (const session of input.sessions) {
    if (!session.reportedInit) continue;
    const endedAt = session.endedAt ?? input.stopAt;
    const covered = endedAt !== undefined && confirmedAt > Date.parse(endedAt);
    const files = findTranscripts(input.configFolder, session.sessionId);
    if (files.main === undefined) {
      if (!covered) {
        transcripts.push({
          sessionId: session.sessionId,
          missing: true,
          fact: `No transcript found for session ${session.sessionId} in ${displayPath(join(input.configFolder, "projects"))}, so Kiln can't tell what it did outside the workspace`,
        });
      }
      continue;
    }
    for (const file of [files.main, ...files.subagents]) {
      const read = readTranscript(file);
      if (read.problem !== undefined && !covered) transcripts.push({ sessionId: session.sessionId, missing: false, fact: `Kiln couldn't read ${displayPath(file)}: ${read.problem}` });
      all.push(...outsideChanges(read, worktrees, input.context));
    }
  }
  const seen = new Set<string>();
  const changes = all.filter((change) => {
    if (Date.parse(change.at) <= confirmedAt || seen.has(change.fact)) return false;
    seen.add(change.fact);
    return true;
  });
  const passed = changes.length === 0 && transcripts.length === 0;
  const facts = passed ? [STAYED_PASSED_FACT] : [...changes.map((change) => change.fact), ...(changes.length > 0 ? [OUTSIDE_NOTE] : []), ...transcripts.map((problem) => problem.fact)];
  return { passed, changes, transcripts, check: { name: STAYED_CHECK_NAME, passed, facts } };
}
