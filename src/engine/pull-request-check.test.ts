import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readPullRequestList } from "./checks.js";

// A real `gh pr list --json number,title,url,isDraft,isCrossRepository,headRefName,baseRefName,
// additions,deletions,commits` answer from github.com/cli/cli on 2026-10-17, its commits trimmed
// to oid and headline: #14727 comes from a fork, #14719 from the repository itself.
const recorded = readFileSync(new URL("../../test/fixtures/gh/pr-list-open-recorded-2026-10-17.json", import.meta.url), "utf8");
type Row = { number: number; isCrossRepository: boolean; isDraft: boolean };
const rows = JSON.parse(recorded) as Row[];

describe("readPullRequestList over real gh output", () => {
  it("passes on the repository's own open pull request and records its facts", () => {
    expect(readPullRequestList(recorded, "bagtoad/fix-help-text-flag-references", "trunk")).toEqual({
      passed: true,
      ghError: false,
      check: { name: "Pull request open", passed: true, fact: "#14719 open" },
      pullRequest: {
        number: 14719,
        title: "Fix help text that references nonexistent flags",
        url: "https://github.com/cli/cli/pull/14719",
        head: "bagtoad/fix-help-text-flag-references",
        base: "trunk",
        commits: 1,
        additions: 3,
        deletions: 3,
      },
    });
  });

  it("doesn't count a fork's pull request from a branch of the same name", () => {
    const forkOnly = JSON.stringify(rows.filter((row) => row.isCrossRepository));
    expect(readPullRequestList(forkOnly, "fix/issue-create-resolve-type-before-create", "trunk").check).toEqual({
      name: "Pull request open",
      passed: false,
      fact: "No open pull request from fix/issue-create-resolve-type-before-create into trunk",
    });
  });

  it("fails on a draft with its number (WORK-001), and on output it can't read", () => {
    const draft = JSON.stringify(rows.filter((row) => !row.isCrossRepository).map((row) => ({ ...row, isDraft: true })));
    expect(readPullRequestList(draft, "x", "trunk")).toMatchObject({ passed: false, ghError: false, check: { fact: "#14719 is a draft" } });
    expect(readPullRequestList("not json", "x", "trunk")).toMatchObject({ passed: false, ghError: true });
    expect(readPullRequestList("[]", "feature/x", "develop").check.fact).toBe("No open pull request from feature/x into develop");
  });
});
