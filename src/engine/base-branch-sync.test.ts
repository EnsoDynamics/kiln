// The commands and lines Kiln gives for a local base branch it left as it was (Kiln After Delivery
// AC-MERGE-09, technical design "What it says"). The Git behaviour is proved against real
// repositories in base-branch-after-merge.integration.test.ts.
import { describe, expect, it } from "vitest";
import { baseBranchCommand, baseBranchLine, type BaseBranchEntry } from "./base-branch-sync.js";

const left = (fields: Partial<BaseBranchEntry>): BaseBranchEntry => ({ repository: "acme-shop", checkout: "~/code/acme-shop", base: "develop", at: "2026-11-25T20:00:00Z", outcome: "left", fetched: "8e41c0d9aa", from: "1111111", behind: 4, ahead: 0, ...fields });

describe("the command that brings the local base branch up to date", () => {
  it("is run where the base branch is checked out, fast-forward only unless it has diverged", () => {
    expect(baseBranchCommand(left({ reason: "uncommitted", checkoutBranch: "develop" }))).toBe("git -C ~/code/acme-shop pull --ff-only origin develop");
    expect(baseBranchCommand(left({ reason: "diverged", checkoutBranch: "develop", ahead: 2 }))).toBe("git -C ~/code/acme-shop pull origin develop");
    expect(baseBranchCommand(left({ reason: "checked_out_elsewhere", checkoutBranch: "spike", elsewhere: "/work/acme-develop" }))).toBe("git -C /work/acme-develop pull --ff-only origin develop");
    expect(baseBranchCommand(left({ reason: "refused", checkoutBranch: "spike" }))).toBe("git -C ~/code/acme-shop fetch origin develop:develop");
    expect(baseBranchCommand(left({ reason: "diverged", detached: true, ahead: 1 }))).toBe("git -C ~/code/acme-shop switch develop && git -C ~/code/acme-shop pull origin develop");
  });

  it("quotes a path the shell would split, and has none when the checkout was not found", () => {
    expect(baseBranchCommand(left({ reason: "uncommitted", checkoutBranch: "develop", checkout: "/work/My Code/it's" }))).toBe(`git -C '/work/My Code/it'\\''s' pull --ff-only origin develop`);
    expect(baseBranchCommand(left({ reason: "not_read", problem: "Kiln could not find the main checkout at ~/code/acme-shop: nothing is there." }))).toBeUndefined();
  });
});

describe("the line", () => {
  it("says nothing for a branch that already holds the merge, and names the repository when the delivery has several", () => {
    expect(baseBranchLine({ ...left({}), outcome: "current" }, true)).toBeUndefined();
    expect(baseBranchLine({ ...left({ checkoutBranch: "develop" }), outcome: "fast_forwarded", behind: 1 }, true)).toEqual({ line: "acme-shop: Kiln brought develop in ~/code/acme-shop up to date with origin: 1 commit, to 8e41c0d." });
    expect(baseBranchLine({ ...left({ detached: true }), outcome: "branch_moved" }, false)).toEqual({ line: "Kiln moved develop in ~/code/acme-shop up to origin/develop (4 commits, to 8e41c0d). The checkout stays where it is." });
  });

  it("gives Git's refusal and a failed read in its own words", () => {
    expect(baseBranchLine(left({ reason: "refused", checkoutBranch: "develop", problem: "error: The following untracked working tree files would be overwritten by merge: src/intake.txt." }), false)).toEqual({ line: "develop in ~/code/acme-shop is 4 commits behind origin/develop. Kiln left it as it is because Git refused: error: The following untracked working tree files would be overwritten by merge: src/intake.txt.", command: "git -C ~/code/acme-shop pull --ff-only origin develop" });
    expect(baseBranchLine(left({ reason: "not_read", problem: "Kiln could not find the main checkout at ~/code/acme-shop: nothing is there. Put it back at that path, then check for new phases again." }), false)).toEqual({ line: "Kiln could not bring develop in ~/code/acme-shop up to date: Kiln could not find the main checkout at ~/code/acme-shop: nothing is there. Put it back at that path, then check for new phases again. Kiln tries again at the next check." });
  });
});
