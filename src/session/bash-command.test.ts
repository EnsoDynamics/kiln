import { describe, expect, it } from "vitest";
import { gitSubcommands, runsGitCommit, runsGitPush, simpleCommands } from "./bash-command.js";

describe("gitSubcommands", () => {
  it.each([
    ["git commit -m 'x'", ["commit"]],
    ["git add -A && git commit -q -m x && git push -u origin feature/x", ["add", "commit", "push"]],
    ["git -C ../worktree commit -m x", ["commit"]],
    ["git -c user.name=Kiln --git-dir=.git --no-pager push", ["push"]],
    ["GIT_EDITOR=true HUSKY=0 git commit --amend", ["commit"]],
    ["for f in a b; do git add $f; done", ["add"]],
    ["if true; then git push; else echo no; fi", ["push"]],
    ["{ git commit -m x; }", ["commit"]],
    ["(cd wt && git push)", ["push"]],
    ["git log --oneline | head -3 || git status", ["log", "status"]],
    ["git commit-tree HEAD^{tree} -m x", ["commit-tree"]],
    ["echo $(git rev-parse HEAD) `git push`", ["rev-parse", "push"]],
  ])("reads %j", (command, expected) => {
    expect(gitSubcommands(command)).toEqual(expected);
  });

  it("treats a heredoc body as data, so words in a commit message aren't commands", () => {
    const command = [
      "git add src/greet.js && git commit -q -F - -- src/greet.js <<'EOF'",
      "feat: add greet",
      "",
      "Run git push after this; && git push --force",
      "EOF",
      "git log --oneline -1",
    ].join("\n");
    expect(gitSubcommands(command)).toEqual(["add", "commit", "log"]);
    expect(runsGitPush(command)).toBe(false);
  });

  it("reads a tab-stripped heredoc and a heredoc inside a quoted substitution", () => {
    expect(gitSubcommands("cat <<-EOF\n\tgit push\n\tEOF\ngit status")).toEqual(["status"]);
    const quoted = `git commit -m "$(cat <<'EOF'\nfix "quoted" words; git push\nEOF\n)" && git push origin x`;
    expect(gitSubcommands(quoted)).toEqual(["commit", "push"]);
  });

  it("treats quoted text as data and doesn't read bash -c strings", () => {
    expect(gitSubcommands(`echo "git push" 'git commit'`)).toEqual([]);
    expect(gitSubcommands(`bash -c 'git push'`)).toEqual([]);
    expect(gitSubcommands("# git push\ngit status")).toEqual(["status"]);
  });

  it("drops redirection targets and file descriptors", () => {
    expect(simpleCommands("git push 2>&1 > out.txt | tail -3")).toEqual([["git", "push"], ["tail", "-3"]]);
    expect(gitSubcommands("cat CLAUDE.md 2>/dev/null; git push")).toEqual(["push"]);
  });

  it("reads the commit and push calls proof gate 2's real session made", () => {
    const commit =
      "git add src/greet.js test/greet.test.js && git diff --cached --name-only && git diff --cached | grep -nE '^\\+.*(sk-|AKIA|token)'; git commit -q -F - -- src/greet.js test/greet.test.js <<'EOF'\nfeat(greeting-cli): add greet(name)\n\ngreet(\"Ada\") returns \"Hello, Ada!\".\nEOF";
    expect(runsGitCommit(commit)).toBe(true);
    expect(runsGitPush(commit)).toBe(false);
    const push = "git log --oneline HEAD --not --remotes && git push -u origin feature/greeting-cli 2>&1 | tail -3 && git status -sb | head -1 && git log --oneline @{u}..";
    expect(runsGitPush(push)).toBe(true);
    expect(runsGitCommit(push)).toBe(false);
  });
});
