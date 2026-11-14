// The reset confirmation's lines (run restart AC-RESET-03): each shown only when it names
// something, counts per repository with several, and a count Kiln couldn't read said so.
import { describe, expect, it } from "vitest";
import { forgetLines, stayLines } from "./reset.js";

const none = { phaseResults: 1, sessions: 0, stops: 0, waivers: 0, audits: 0, deliveries: 0 };

describe("the reset confirmation", () => {
  it("lists what Kiln forgets, leaving out lines with nothing to name", () => {
    expect(forgetLines(none)).toEqual(["Which phase it was on, and each phase's result", "Its settings for this PRD, which you choose again on the first screen"]);
    expect(forgetLines({ ...none, sessions: 3, waivers: 1, deliveries: 2 })).toEqual([
      "Which phase it was on, and each phase's result",
      "Its 3 sessions and their output",
      "Stops, completion waivers and audit results",
      "Its settings for this PRD, which you choose again on the first screen",
      "Its record of earlier deliveries",
    ]);
  });

  it("names the branch and worktree even at zero, each pull request, and the phases closed on the branch", () => {
    const lines = stayLines({ forgets: none, closedOnBranch: 2, stays: [{ repository: "acme-shop", branch: "feature/returns", ownCommits: 1, worktree: "~/w/acme-shop", uncommittedFiles: 0, pullRequests: [{ number: 12, url: "https://github.com/acme/acme-shop/pull/12" }], unknown: [] }] });
    expect(lines).toEqual([
      { code: "feature/returns", text: ", which has 1 commit of its own" },
      { text: "The worktree folder, with no uncommitted files" },
      { text: "Pull request #12", href: "https://github.com/acme/acme-shop/pull/12" },
      { text: "The phases closed in the plan on the feature branch" },
    ]);
  });

  it("gives counts per repository with several, and says which counts Kiln couldn't read", () => {
    const lines = stayLines({ forgets: none, stays: [
      { repository: "acme-shop", branch: "feature/returns", ownCommits: 0, worktree: "~/w/acme-shop", uncommittedFiles: 3, pullRequests: [], unknown: ["closedOnBranch"] },
      { repository: "acme-api", branch: "feature/returns", worktree: "~/w/acme-api", pullRequests: [], unknown: ["ownCommits", "uncommittedFiles", "pullRequests"] },
    ] }).map(line => line.text);
    expect(lines).toEqual([
      "In acme-shop, feature/returns, which has no commits of its own",
      "In acme-shop, the worktree folder, with 3 uncommitted files",
      "In acme-api, feature/returns, whose commits of its own Kiln couldn't count",
      "In acme-api, the worktree folder, whose uncommitted files Kiln couldn't count",
      "In acme-api, any pull request; Kiln couldn't read them",
      "The phases closed in the plan on the feature branch, which Kiln couldn't count",
    ]);
  });
});
