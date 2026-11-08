// The Folder missing page's words (missing worktree recovery AC-FACTS-02, AC-FACTS-03, AC-SETUP-06),
// from the mockup's sample cases with the facts a failed read leaves out.

import { describe, expect, it } from "vitest";
import { folderMissingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { baseCard, day, factRows, restoreText, waitedChecks } from "./folder-missing.js";

const view = (which: Parameters<typeof folderMissingSnapshot>[0]) => folderMissingSnapshot(which).folderMissing!;
const text = (parts: { text: string }[]) => parts.map((part) => part.text).join("");

describe("the base branch's plan card (AC-FACTS-02)", () => {
  it("always names the next unfinished phase, and then the phases whose work is only on the feature branch", () => {
    expect(baseCard(view("merged")).note).toBe("origin/develop at 0a3d75d · next is Phase 10, Duplicate invoice guard");
    expect(baseCard(view("unmerged")).note).toBe("origin/develop at 7e21b90 · next is Phase 4, Run reports and alerts · Phase 4’s work is only on the feature branch");
  });

  it("names the next phase when the run's work is on the branch but no phase is newly closed there", () => {
    const facts = view("unmerged");
    delete facts.plans.branchOnly;
    expect(baseCard(facts).note).toBe("origin/develop at 7e21b90 · next is Phase 4, Run reports and alerts");
  });
});

describe("what couldn't be checked (AC-FACTS-03)", () => {
  it("says inside the last pushed commit's row which half it couldn't check, without a second row for it", () => {
    const facts = view("unmerged");
    const repository = facts.repositories[0]!;
    repository.lastPushed = { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: true };
    repository.unknown = ["whether this run’s last pushed commit is in develop"];
    const rows = factRows(facts).map((row) => [text(row.label), text(row.value)]);
    expect(rows).toContainEqual(["Last commit this run pushed", "bec1115 (Phase 4) · on origin · in develop: couldn’t check"]);
    expect(rows.filter(([label]) => label!.startsWith("Whether this run’s last pushed commit"))).toEqual([]);
    repository.lastPushed = { sha: "bec1115".padEnd(40, "0"), phaseId: "4", inBase: false };
    repository.unknown = ["whether this run’s last pushed commit is on origin"];
    expect(factRows(facts).map((row) => text(row.value))).toContain("bec1115 (Phase 4) · not in develop · on origin: couldn’t check");
    repository.lastPushed = { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: false };
    repository.unknown = ["whether this run’s last pushed commit is in develop"];
    expect(factRows(facts).map((row) => text(row.value))).toContain("bec1115 (Phase 4) · not on origin · in develop: couldn’t check");
  });

  it("names every other failed read as its own row", () => {
    const facts = view("unmerged");
    facts.repositories[0]!.unknown = ["the date of commit bec1115", "how many commits on feature/invoice-evidence-collection aren’t in develop"];
    const rows = factRows(facts).map((row) => [text(row.label), text(row.value)]);
    expect(rows).toContainEqual(["The date of commit bec1115", "Couldn’t check"]);
    expect(rows).toContainEqual(["How many commits on feature/invoice-evidence-collection aren’t in develop", "Couldn’t check"]);
  });
});

describe("putting the folder back (AC-SETUP-06)", () => {
  it("says it can't yet tell, rather than that the folder can't be put back, while a read about the branch failed", () => {
    const facts = view("unmerged");
    Object.assign(facts, { restoreCommands: [], restoreUnknown: true });
    expect(restoreText(facts)).toBe("Moved or removed the folder on purpose? Kiln can say whether it can be put back once it can read what it needs about the branch.");
    // Only origin's own branch read failing means origin couldn't be reached.
    facts.repositories[0]!.unknown = ["whether this run’s last pushed commit is on origin"];
    expect(restoreText(facts)).toBe("Moved or removed the folder on purpose? Kiln can say whether it can be put back once it can read what it needs about the branch.");
    expect(restoreText(view("unknown"))).toBe("Moved or removed the folder on purpose? Kiln can say whether it can be put back once it can reach origin.");
  });
});

describe("the feature branch's facts (Phase 5 of missing worktree recovery: AC-FACTS-01, AC-FACTS-03)", () => {
  it("says whether the branch is in the base branch when origin couldn't be reached, naming the checkout's base branch it was compared with", () => {
    const facts = view("unknown");
    const featureRow = () => factRows(facts).map((row) => text(row.value))[0];
    expect(featureRow()).toBe("In your checkout · last commit 4c80c80, Oct 24 · on origin: couldn’t check · fully merged into your checkout’s develop");
    facts.repositories[0]!.featureBranch = { ...facts.repositories[0]!.featureBranch, inBase: false, notInBaseCount: 3 };
    expect(featureRow()).toBe("In your checkout · last commit 4c80c80, Oct 24 · on origin: couldn’t check · 3 commits not in your checkout’s develop");
  });

  it("names the checkout's branch it couldn't read inside the branch's row when only origin's was read, never saying the branch is only on origin", () => {
    const facts = view("unmerged");
    const repository = facts.repositories[0]!;
    const origin = repository.featureBranch.local!;
    repository.featureBranch = { origin };
    repository.unknown = [`your checkout’s ${repository.branch}`, `whether ${repository.branch} is in develop`];
    const rows = factRows(facts).map((row) => [text(row.label), text(row.value)]);
    expect(rows[0]![1]).toBe(`On origin · last commit ${origin.sha.slice(0, 7)}, ${day(origin.date!)} · in your checkout: couldn’t check`);
    expect(rows.filter(([label]) => label === `Your checkout’s ${repository.branch}`)).toEqual([]);
    expect(rows).toContainEqual([`Whether ${repository.branch} is in develop`, "Couldn’t check"]);
  });
});

describe("the folder facts' remaining wording (Phase 8 of missing worktree recovery: AC-FACTS-01, AC-FACTS-03)", () => {
  const rowsOf = (facts: ReturnType<typeof view>) => factRows(facts).map((row) => [text(row.label), text(row.value)]);

  it("says the branch is not in the checkout, or not on origin, when the other side's read failed, and names that side in the row", () => {
    for (const which of ["unmerged", "multi"] as const) {
      const facts = view(which);
      const repository = facts.repositories.find((one) => one.state === "missing")!;
      const label = which === "multi" ? `harbor-portal · feature branch ${repository.branch}` : `Feature branch ${repository.branch}`;
      repository.featureBranch = {};
      repository.unknown = [`${repository.branch} on origin`, `whether ${repository.branch} is in develop`];
      expect(rowsOf(facts)).toContainEqual([label, "Not in your checkout · on origin: couldn’t check"]);
      repository.unknown = [`your checkout’s ${repository.branch}`, `whether ${repository.branch} is in develop`];
      expect(rowsOf(facts)).toContainEqual([label, "Not on origin · in your checkout: couldn’t check"]);
      repository.unknown = [`your checkout’s ${repository.branch}`, `${repository.branch} on origin`];
      expect(rowsOf(facts)).toContainEqual([label, "In your checkout: couldn’t check · on origin: couldn’t check"]);
      // The row names both reads, so neither is repeated as a row of its own, in either kind of run.
      expect(rowsOf(facts).filter(([row]) => /on origin$|your checkout’s feature/i.test(row!))).toEqual([]);
    }
  });

  it("says the checkout's branch is ahead of origin's", () => {
    const facts = view("unmerged");
    const repository = facts.repositories[0]!;
    repository.featureBranch = { ...repository.featureBranch, origin: { sha: "aaaaaaa".padEnd(40, "0"), date: repository.featureBranch.local!.date! }, relation: "ahead" };
    expect(rowsOf(facts)[0]![1]).toContain("· your checkout’s is ahead of origin’s ·");
    repository.featureBranch.relation = "behind";
    expect(rowsOf(facts)[0]![1]).toContain("· your checkout’s is behind origin’s ·");
    repository.featureBranch.relation = "diverged";
    expect(rowsOf(facts)[0]![1]).toContain("· your checkout’s is diverged from origin’s ·");
  });

  it("words each repository's facts against its own base branch and where it was read", () => {
    const facts = view("multi");
    const portal = facts.repositories[1]!;
    portal.baseBranch = "main";
    expect(rowsOf(facts)).toContainEqual([`harbor-portal · feature branch ${portal.branch}`, "In your checkout and on origin, both at 91c4e02, Oct 24 · 2 commits not in main"]);
    expect(rowsOf(facts)).toContainEqual(["harbor-portal · last commit this run pushed", "91c4e02 (Phase 4) · on origin · not in main"]);
    expect(rowsOf(facts)).toContainEqual(["harbor-ledger · last commit this run pushed", "bec1115 (Phase 4) · on origin · not in develop"]);
    // Only the repository whose origin couldn't be reached was compared with its checkout's own base branch.
    portal.baseSource = "local";
    expect(rowsOf(facts)).toContainEqual(["harbor-portal · is this run’s pushed work in origin’s main?", "Couldn’t check"]);
    expect(rowsOf(facts)).toContainEqual(["harbor-ledger · last commit this run pushed", "bec1115 (Phase 4) · on origin · not in develop"]);
    expect(rowsOf(facts)).toContainEqual([`harbor-ledger · feature branch ${portal.branch}`, "In your checkout and on origin, both at bec1115, Oct 24 · 3 commits not in develop"]);
    expect(rowsOf(facts)).toContainEqual([`harbor-portal · feature branch ${portal.branch}`, "In your checkout and on origin, both at 91c4e02, Oct 24 · 2 commits not in your checkout’s main"]);
  });

  it("names a failed on-origin read of the last pushed commit even when that commit is in the base branch", () => {
    const facts = view("merged");
    const repository = facts.repositories[0]!;
    repository.lastPushed = { sha: "bec1115".padEnd(40, "0"), phaseId: "4", inBase: true };
    repository.unknown = ["whether this run’s last pushed commit is on origin"];
    expect(rowsOf(facts)).toContainEqual(["Last commit this run pushed", "bec1115 (Phase 4) · in develop · on origin: couldn’t check"]);
    expect(rowsOf(facts).filter(([label]) => label!.startsWith("Whether this run’s last pushed commit"))).toEqual([]);
  });

  it("says Couldn't check, not No, for another folder when a folder git records the branch at couldn't be checked, and names that read", () => {
    const facts = view("merged");
    const repository = facts.repositories[0]!;
    repository.unknown = [`the folder git records ${repository.branch} at, ~/devel/locked/ledger (EACCES: permission denied)`];
    repository.featureBranch = { ...repository.featureBranch, elsewhereUnknown: true };
    const rows = rowsOf(facts);
    expect(rows).toContainEqual(["Checked out in another folder?", "Couldn’t check"]);
    expect(rows).toContainEqual([`The folder git records ${repository.branch} at, ~/devel/locked/ledger (EACCES: permission denied)`, "Couldn’t check"]);
  });
});

describe("a waiting phase's recorded results in the run's history (AC-GONE-02)", () => {
  it("words the checks that failed or passed", () => {
    expect(waitedChecks({ passed: 1, failed: 2 })).toBe("2 of 3 completion checks failed");
    expect(waitedChecks({ passed: 3, failed: 0 })).toBe("all 3 completion checks passed");
    expect(waitedChecks({ passed: 1, failed: 0 })).toBe("the completion check passed");
    expect(waitedChecks({ passed: 0, failed: 0 })).toBe("no completion checks recorded");
  });
});
