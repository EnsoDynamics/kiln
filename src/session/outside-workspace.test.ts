import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { displayPath } from "../engine/worktree-setup.js";
import { bashPath, gitChange, gitCommandsIn, OUTSIDE_NOTE, stayedInWorkspace, STAYED_CHECK_NAME, type PathContext, type StayedSession } from "./outside-workspace.js";

const WINDOWS: PathContext = { platform: "win32", home: "C:\\home\\me" };
const POSIX: PathContext = { platform: "darwin", home: "/home/me" };

describe("gitCommandsIn", () => {
  const places = (command: string, cwd = "/w/product", context = POSIX) => gitCommandsIn(command, cwd, context).map((seen) => [seen.subcommand, seen.place]);

  it.each([
    ["git commit -m x", [["commit", "/w/product"]]],
    ["cd ../design-system && git commit -m x", [["commit", "/w/design-system"]]],
    ["cd /o/design-system; git add -A; cd -; git push", [["add", "/o/design-system"], ["push", undefined]]],
    ["pushd /o/ds && git stash && popd && git status", [["stash", "/o/ds"], ["status", "/w/product"]]],
    ["popd; git status", [["status", undefined]]],
    ["cd $(git rev-parse --show-toplevel) && git commit", [["rev-parse", "/w/product"], ["commit", undefined]]],
    ["cd && git commit", [["commit", undefined]]],
    ["cd ~/acme/ds && git commit", [["commit", "/home/me/acme/ds"]]],
    ["cd $HOME/acme/ds && git commit", [["commit", "/home/me/acme/ds"]]],
    ["git -C ../ds -C sub commit", [["commit", "/w/ds/sub"]]],
    ["GIT_DIR=/o/ds/.git git commit", [["commit", "/o/ds/.git"]]],
    ["GIT_WORK_TREE=/o/ds GIT_DIR=/o/ds/.git git commit", [["commit", "/o/ds"]]],
    ["export GIT_DIR=/o/ds/.git; git commit; unset GIT_DIR; git push", [["commit", "/o/ds/.git"], ["push", "/w/product"]]],
    ["GIT_DIR=/o/a/.git git --git-dir=/o/b/.git commit", [["commit", "/o/b/.git"]]],
    ["git --work-tree ../ds commit", [["commit", "/w/ds"]]],
    ["env GIT_DIR=/o/ds/.git git commit", [["commit", "/o/ds/.git"]]],
    ["/usr/bin/git -C /o/ds commit", [["commit", "/o/ds"]]],
    ["command git -C /o/ds commit", [["commit", "/o/ds"]]],
    ["nice -n 5 git -C /o/ds commit", [["commit", "/o/ds"]]],
    ["timeout 60s git -C /o/ds push", [["push", "/o/ds"]]],
    ["if ! git -C /o/ds diff --quiet; then git -C /o/ds stash; fi", [["diff", "/o/ds"], ["stash", "/o/ds"]]],
    ["sudo -u bob git -C /o/ds commit", []],
    ["bash -c 'git -C /o/ds commit'", []],
    ["(cd /o/ds && git commit) && git push", [["commit", "/o/ds"], ["push", "/o/ds"]]],
    ["git --version", [[undefined, "/w/product"]]],
  ])("places %j", (command, expected) => {
    expect(places(command)).toEqual(expected);
  });

  it("places Windows-form paths the way Claude Code does", () => {
    const cwd = "C:\\home\\me\\acme\\.worktrees\\returns\\product";
    expect(places("cd /c/home/me/acme/ds && git commit", cwd, WINDOWS)).toEqual([["commit", "C:\\home\\me\\acme\\ds"]]);
    expect(places("cd /cygdrive/d/ds && git commit", cwd, WINDOWS)).toEqual([["commit", "D:\\ds"]]);
    expect(places("git -C C:/home/me/acme/ds commit", cwd, WINDOWS)).toEqual([["commit", "C:\\home\\me\\acme\\ds"]]);
    expect(places('git -C "C:\\home\\me\\acme\\ds" commit', cwd, WINDOWS)).toEqual([["commit", "C:\\home\\me\\acme\\ds"]]);
    expect(places("git -C ~/acme/ds commit", cwd, WINDOWS)).toEqual([["commit", "C:\\home\\me\\acme\\ds"]]);
    expect(places("git -C ../../ds commit", cwd, WINDOWS)).toEqual([["commit", "C:\\home\\me\\acme\\.worktrees\\ds"]]);
    expect(places("git -C //server/share/ds commit", cwd, WINDOWS)).toEqual([["commit", "\\\\server\\share\\ds"]]);
    expect(places("git -C /tmp/ds commit", cwd, WINDOWS)).toEqual([["commit", undefined]]);
  });

  it("reads a path word as Bash would", () => {
    expect(bashPath("ds", "/w", POSIX)).toBe("/w/ds");
    expect(bashPath("$(pwd)/ds", "/w", POSIX)).toBeUndefined();
    expect(bashPath("${HOME}/ds", "/w", POSIX)).toBe("/home/me/ds");
    expect(bashPath("/c", "C:\\w", WINDOWS)).toBe("C:\\");
  });
});

describe("gitChange", () => {
  const changes = (command: string) => {
    const [seen] = gitCommandsIn(command, "/w", POSIX);
    return gitChange(seen!.subcommand, seen!.args) !== undefined;
  };

  it.each([
    "git commit -m x", "git push", "git add -A", "git rm a", "git mv a b", "git restore a", "git checkout main", "git switch -c x", "git stash",
    "git stash pop", "git reset --hard", "git merge x", "git rebase main", "git pull", "git cherry-pick a1", "git revert a1", "git am x.patch",
    "git apply x.patch", "git clean -fd", "git commit-tree a -m x", "git gc", "git frobnicate",
    "git branch new", "git branch -D old", "git branch -m a b", "git branch --set-upstream-to=origin/x", "git branch -u origin/x", "git branch --list -d x",
    "git tag v1", "git tag -a v1 -m x", "git tag -d v1", "git tag -f v1",
    "git fetch origin main:main", "git fetch origin +refs/heads/*:refs/remotes/o/*",
    "git worktree add ../x", "git worktree remove ../x", "git worktree move a b", "git worktree prune",
    "git config user.email a@b.c", "git config --add x.y z", "git config --unset x.y", "git config set x.y z", "git config --global x.y z",
    "git symbolic-ref HEAD refs/heads/x", "git symbolic-ref -d HEAD",
    "git reflog expire --all", "git notes add -m x", "git submodule update", "git remote add o url", "git remote set-url origin x",
  ])("%s changes the checkout", (command) => {
    expect(changes(command)).toBe(true);
  });

  it.each([
    "git status", "git log --oneline", "git --no-pager log", "git diff --cached", "git show HEAD", "git blame a", "git grep x", "git ls-files",
    "git rev-parse HEAD", "git describe", "git cat-file -p HEAD", "git for-each-ref", "git help", "git --version", "git --help",
    "git fetch", "git fetch origin", "git fetch origin main", "git fetch git@github.com:a/b.git main",
    "git reflog", "git reflog show", "git stash list", "git stash show -p", "git worktree list", "git notes", "git notes list", "git notes show",
    "git submodule", "git submodule status", "git submodule summary", "git remote", "git remote -v", "git remote show origin", "git remote get-url origin",
    "git config get user.email", "git config list", "git config --get user.email", "git config --get-all x", "git config --get-regexp x",
    "git config --get-urlmatch x y", "git config --list", "git config -l", "git config user.email", "git config --global user.email",
    "git symbolic-ref --short HEAD", "git symbolic-ref HEAD",
    "git branch", "git branch -vv", "git branch --show-current", "git branch -a", "git branch -r", "git branch --list 'f*'", "git branch --contains a1",
    "git branch --merged main", "git branch --no-merged", "git branch --points-at HEAD", "git branch -l",
    "git fetch --depth 1 git@github.com:a/b.git", "git fetch -j 4 origin main", "git branch --format '%(refname)'", "git branch --sort -committerdate",
    "git tag", "git tag -l 'v*'", "git tag -n5", "git tag --contains a1", "git tag --merged", "git tag --points-at HEAD", "git tag -v v1",
  ])("%s doesn't", (command) => {
    expect(changes(command)).toBe(false);
  });
});

describe("stayedInWorkspace", () => {
  let root: string;
  let config: string;
  let workspace: string;
  let outside: string;
  let counter = 0;

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), "kiln-outside-")));
    config = join(root, "claude");
    workspace = join(root, "acme", ".worktrees", "returns");
    outside = join(root, "acme", "design-system");
    for (const name of ["product", "storefront"]) {
      mkdirSync(join(workspace, name, "src"), { recursive: true });
      writeFileSync(join(workspace, name, ".git"), "gitdir: elsewhere\n");
    }
    mkdirSync(join(outside, ".git"), { recursive: true });
    mkdirSync(join(outside, "src", "tokens"), { recursive: true });
    // A submodule inside a worktree is part of it.
    mkdirSync(join(workspace, "storefront", "vendor", "ui"), { recursive: true });
    writeFileSync(join(workspace, "storefront", "vendor", "ui", ".git"), "gitdir: elsewhere\n");
    // A worktree Claude Code makes for a subagent, in the repository's main checkout.
    mkdirSync(join(outside, ".claude", "worktrees", "agent-a1"), { recursive: true });
    writeFileSync(join(outside, ".claude", "worktrees", "agent-a1", ".git"), "gitdir: elsewhere\n");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  interface Call {
    name: string;
    input: Record<string, unknown>;
    at: string;
    cwd?: string;
    result?: { text?: string; isError?: boolean } | "none";
  }
  /** Transcript lines in Claude Code's shape: each tool call an assistant record, its result a user record. */
  const lines = (calls: Call[], sessionId: string, extra: Record<string, unknown> = {}) =>
    calls.flatMap((call) => {
      const id = `toolu_${++counter}`;
      const common = { sessionId, timestamp: call.at, cwd: call.cwd ?? workspace, ...extra };
      const use = { ...common, type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: call.name, input: call.input }] } };
      if (call.result === "none") return [JSON.stringify(use)];
      const result = { ...common, type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: call.result?.text ?? "ok", is_error: call.result?.isError ?? false }] } };
      return [JSON.stringify(use), JSON.stringify(result)];
    });
  const transcript = (sessionId: string, content: string[], project = "-workspace") => {
    mkdirSync(join(config, "projects", project), { recursive: true });
    const path = join(config, "projects", project, `${sessionId}.jsonl`);
    writeFileSync(path, `${content.join("\n")}\n`);
    return path;
  };
  const subagent = (sessionId: string, agent: string, content: string[]) => {
    const folder = join(config, "projects", "-workspace", sessionId, "subagents");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `agent-${agent}.jsonl`), `${content.join("\n")}\n`);
  };
  const run = (sessions: StayedSession[] | string, confirmations: { at: string }[] = [], stopAt?: string) =>
    stayedInWorkspace({
      sessions: typeof sessions === "string" ? [{ sessionId: sessions, reportedInit: true, endedAt: "2026-10-17T17:30:00Z" }] : sessions,
      worktrees: [join(workspace, "product"), join(workspace, "storefront")],
      configFolder: config,
      confirmations,
      ...(stopAt === undefined ? {} : { stopAt }),
    });
  const shown = (): string => displayPath(outside);

  it("passes a session that worked only in the workspace, and reads nothing else", () => {
    transcript("s1", [
      ...lines([{ name: "Edit", input: { file_path: join(workspace, "storefront", "src", "a.ts") }, at: "2026-10-17T17:00:00Z" }], "s1"),
      ...lines([{ name: "Bash", input: { command: "cd storefront && git commit -m x && git push" }, at: "2026-10-17T17:01:00Z" }], "s1"),
      ...lines([{ name: "Edit", input: { file_path: join(workspace, "storefront", "vendor", "ui", "button.ts") }, at: "2026-10-17T17:02:00Z" }], "s1"),
      ...lines([{ name: "Bash", input: { command: `git -C ${outside} log --oneline && git -C ${outside} status` }, at: "2026-10-17T17:03:00Z" }], "s1"),
      ...lines([{ name: "Write", input: { file_path: join(outside, ".agent-sessions", "2026-10-17-claude-code-x.log") }, at: "2026-10-17T17:04:00Z" }], "s1"),
      ...lines([{ name: "Bash", input: { command: `rm -rf ${outside}/src` }, at: "2026-10-17T17:05:00Z" }], "s1"),
    ]);
    const outcome = run("s1");
    expect(outcome.passed).toBe(true);
    expect(outcome.check).toEqual({ name: STAYED_CHECK_NAME, passed: true, facts: ["The changes outside the workspace have been dealt with"] });
  });

  it("fails an edit and a commit in an outside checkout, each once, with the note after them", () => {
    transcript("s1", [
      ...lines([{ name: "Edit", input: { file_path: join(outside, "src", "tokens", "colors.ts") }, at: "2026-10-17T17:00:00Z" }], "s1"),
      ...lines([{ name: "MultiEdit", input: { file_path: join(outside, "src", "tokens", "colors.ts") }, at: "2026-10-17T17:00:30Z" }], "s1"),
      ...lines([{ name: "Bash", input: { command: `cd ${outside} && git add -A && git commit -m "fix(tokens): refunded" && npm test` }, at: "2026-10-17T17:01:00Z", result: { text: "[main 6b0d2fa9] fix(tokens): refunded\n 1 file changed\nnpm ERR! 1 failing", isError: true } }], "s1"),
    ]);
    const outcome = run("s1");
    expect(outcome.check.facts).toEqual([`Edited src/tokens/colors.ts in ${shown()}`, `Ran git add in ${shown()}`, `Committed 6b0d2fa to main in ${shown()}`, OUTSIDE_NOTE]);
    expect(outcome.passed).toBe(false);
    expect(outcome.changes.map((change) => change.checkout)).toEqual([outside, outside, outside]);
  });

  it("places a Bash call by the cwd its record carries, so a cd in an earlier call counts", () => {
    transcript("s1", lines([{ name: "Bash", input: { command: "git stash" }, at: "2026-10-17T17:00:00Z", cwd: join(outside, "src") }], "s1"));
    expect(run("s1").check.facts[0]).toBe(`Ran git stash in ${shown()}`);
  });

  it("doesn't count a file tool call that failed, but counts one cut off before its result", () => {
    transcript("s1", [
      ...lines([{ name: "Write", input: { file_path: join(outside, "a.txt") }, at: "2026-10-17T17:00:00Z", result: { isError: true } }], "s1"),
      ...lines([{ name: "Write", input: { file_path: join(outside, "b.txt") }, at: "2026-10-17T17:01:00Z", result: "none" }], "s1"),
    ]);
    expect(run("s1").check.facts).toEqual([`Wrote b.txt in ${shown()}`, OUTSIDE_NOTE]);
  });

  it("reads subagents' transcripts, a subagent worktree being outside the workspace", () => {
    transcript("s1", lines([{ name: "Agent", input: { prompt: "tidy" }, at: "2026-10-17T17:00:00Z" }], "s1"));
    const agentWorktree = join(outside, ".claude", "worktrees", "agent-a1");
    subagent("s1", "a1", lines([{ name: "Edit", input: { file_path: join(agentWorktree, "x.ts") }, at: "2026-10-17T17:00:10Z", cwd: agentWorktree }], "s1", { isSidechain: true }));
    subagent("s1", "a2", lines([{ name: "Edit", input: { file_path: join(outside, "y.ts") }, at: "2026-10-17T17:00:20Z" }], "s1", { isSidechain: true }));
    expect(run("s1").check.facts).toEqual([`Edited x.ts in ${displayPath(agentWorktree)}`, `Edited y.ts in ${shown()}`, OUTSIDE_NOTE]);
  });

  it("reads a turn a person added with claude --resume from another folder", () => {
    transcript("s1", [
      ...lines([{ name: "Edit", input: { file_path: join(workspace, "product", "a.md") }, at: "2026-10-17T17:00:00Z" }], "s1"),
      ...lines([{ name: "Bash", input: { command: "git checkout -b hotfix" }, at: "2026-10-18T09:00:00Z", cwd: outside }], "s1"),
    ]);
    expect(run("s1").check.facts[0]).toBe(`Ran git checkout in ${shown()}`);
  });

  it("fails any PowerShell call once, wherever it ran", () => {
    transcript("s1", lines([
      { name: "PowerShell", input: { command: "Remove-Item x" }, at: "2026-10-17T17:00:00Z" },
      { name: "PowerShell", input: { command: "git status" }, at: "2026-10-17T17:01:00Z", result: { isError: true } },
    ], "s1"));
    expect(run("s1").check.facts).toEqual(["Ran PowerShell commands Kiln can't read", OUTSIDE_NOTE]);
  });

  it("counts a change as dealt with once a confirmation at or after it is ticked, and fails a later one again", () => {
    transcript("s1", [
      ...lines([{ name: "Edit", input: { file_path: join(outside, "a.ts") }, at: "2026-10-17T17:00:00.000Z" }], "s1"),
      ...lines([{ name: "Edit", input: { file_path: join(outside, "a.ts") }, at: "2026-10-17T18:00:00.000Z" }], "s1"),
    ]);
    expect(run("s1", [{ at: "2026-10-17T16:00:00.000Z" }]).changes.map((change) => change.at)).toEqual(["2026-10-17T17:00:00.000Z"]);
    expect(run("s1", [{ at: "2026-10-17T17:00:00.000Z" }]).changes.map((change) => change.at)).toEqual(["2026-10-17T18:00:00.000Z"]);
    expect(run("s1", [{ at: "2026-10-17T17:00:00.000Z" }, { at: "2026-10-17T18:30:00.000Z" }]).passed).toBe(true);
  });

  it("passes a session that never reported init, and fails one that ran with no transcript until a later tick", () => {
    expect(run([{ sessionId: "never", reportedInit: false }]).passed).toBe(true);
    const missing = run([{ sessionId: "gone", reportedInit: true, endedAt: "2026-10-17T17:30:00Z" }]);
    expect(missing.check.facts).toEqual([`No transcript found for session gone in ${displayPath(join(config, "projects"))}, so Kiln can't tell what it did outside the workspace`]);
    expect(missing.transcripts).toEqual([expect.objectContaining({ sessionId: "gone", missing: true })]);
    expect(run([{ sessionId: "gone", reportedInit: true, endedAt: "2026-10-17T17:30:00Z" }], [{ at: "2026-10-17T17:20:00Z" }]).passed).toBe(false);
    expect(run([{ sessionId: "gone", reportedInit: true, endedAt: "2026-10-17T17:30:00Z" }], [{ at: "2026-10-17T17:31:00Z" }]).passed).toBe(true);
    // A session whose end Kiln didn't record is covered after the stop's own time.
    expect(run([{ sessionId: "gone", reportedInit: true }], [{ at: "2026-10-17T17:31:00Z" }], "2026-10-17T17:40:00Z").passed).toBe(false);
    expect(run([{ sessionId: "gone", reportedInit: true }], [{ at: "2026-10-17T17:41:00Z" }], "2026-10-17T17:40:00Z").passed).toBe(true);
  });

  it("skips a line cut off mid-file, and fails a corrupt line or an unreadable file, still reading the rest", () => {
    const edit = lines([{ name: "Edit", input: { file_path: join(outside, "a.ts") }, at: "2026-10-17T17:00:00Z" }], "s1");
    transcript("s1", [`{"type":"assistant","message":{"content":[{"type":"tool_use","id":"x","name":"Bash","input":{"command":"git pu`, ...edit]);
    expect(run("s1").check.facts).toEqual([`Edited a.ts in ${shown()}`, OUTSIDE_NOTE]);

    const path = transcript("s1", ["not json at all", ...edit]);
    const corrupt = run("s1");
    expect(corrupt.check.facts).toEqual([`Edited a.ts in ${shown()}`, OUTSIDE_NOTE, `Kiln couldn't read ${displayPath(path)}: line 1 isn't JSON`]);
    expect(corrupt.transcripts[0]!.missing).toBe(false);

    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      chmodSync(path, 0o000);
      expect(run("s1").check.facts[0]).toMatch(/^Kiln couldn't read .*: EACCES/);
      chmodSync(path, 0o600);
    }
  });

  it("finds a transcript in any project folder, by session ID", () => {
    transcript("s1", lines([{ name: "Edit", input: { file_path: join(outside, "a.ts") }, at: "2026-10-17T17:00:00Z" }], "s1"), "-home-alex-devel-acme-product");
    expect(run("s1").passed).toBe(false);
  });

  it("reads a real Claude Code 2.1.307 transcript: a Write, a Bash cd and commit, and a subagent's Write outside, but not a read-only git", () => {
    // Recorded 2026-10-22 with Kiln's launch flags from <root>/W/product, with an outside
    // checkout at <root>/O; trimmed to its user and assistant records' tool calls and results.
    const fixture = new URL("../../test/fixtures/transcript-outside-workspace/", import.meta.url);
    const recordedRoot = "/private/tmp/kiln-transcript";
    const sessionId = "5ce0e3ff-604c-4a93-9045-c13dc51c0c8f";
    const real = join(root, "real");
    mkdirSync(join(real, "W", "product", ".git"), { recursive: true });
    mkdirSync(join(real, "O", ".git"), { recursive: true });
    const project = join(config, "projects", "-private-tmp-kiln-transcript-W-product");
    mkdirSync(join(project, sessionId, "subagents"), { recursive: true });
    const copy = (from: string, to: string) => writeFileSync(to, readFileSync(new URL(from, fixture), "utf8").replaceAll(recordedRoot, real));
    copy(`${sessionId}.jsonl`, join(project, `${sessionId}.jsonl`));
    copy("subagents/agent-abbbe875e7acee03f.jsonl", join(project, sessionId, "subagents", "agent-abbbe875e7acee03f.jsonl"));
    const outcome = stayedInWorkspace({
      sessions: [{ sessionId, reportedInit: true, endedAt: "2026-10-22T18:36:32.712Z" }],
      worktrees: [join(real, "W", "product")],
      configFolder: config,
      confirmations: [],
    });
    const o = displayPath(join(real, "O"));
    expect(outcome.check.facts).toEqual([`Wrote notes.txt in ${o}`, `Ran git add in ${o}`, `Committed af3bed7 to main in ${o}`, `Wrote agent.txt in ${o}`, OUTSIDE_NOTE]);
  });

  it("compares paths by their real folders, so a worktree reached through a link is still the workspace", () => {
    const linked = join(root, "linked-workspace");
    symlinkSync(workspace, linked);
    const inside = join(workspace, "product", "a.md");
    transcript("s1", [
      ...lines([{ name: "Edit", input: { file_path: inside }, at: "2026-10-17T17:00:00Z" }], "s1"),
      ...lines([{ name: "Bash", input: { command: "git commit -m x" }, at: "2026-10-17T17:01:00Z", cwd: join(linked, "storefront") }], "s1"),
      ...lines([{ name: "Edit", input: { file_path: join(root, "acme", ".", "design-system", "a.ts") }, at: "2026-10-17T17:02:00Z" }], "s1"),
    ]);
    const outcome = stayedInWorkspace({
      sessions: [{ sessionId: "s1", reportedInit: true, endedAt: "2026-10-17T17:30:00Z" }],
      // The worktrees given through the link, the transcript's paths through the real folder.
      worktrees: [join(linked, "product"), join(linked, "storefront")],
      configFolder: config,
      confirmations: [],
    });
    expect(outcome.check.facts).toEqual([`Edited a.ts in ${shown()}`, OUTSIDE_NOTE]);
  });
});

