// The Folder missing page's words (missing worktree recovery AC-FACTS-02, AC-FACTS-03, AC-SETUP-06),
// from the mockup's sample cases with the facts a failed read leaves out.

import { describe, expect, it } from "vitest";
import { folderMissingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { baseCard, factRows, restoreText } from "./folder-missing.js";

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
    const rows = factRows(facts, "develop").map((row) => [text(row.label), text(row.value)]);
    expect(rows).toContainEqual(["Last commit this run pushed", "bec1115 (Phase 4) · on origin · in develop: couldn’t check"]);
    expect(rows.filter(([label]) => label!.startsWith("Whether this run’s last pushed commit"))).toEqual([]);
    repository.lastPushed = { sha: "bec1115".padEnd(40, "0"), phaseId: "4", inBase: false };
    repository.unknown = ["whether this run’s last pushed commit is on origin"];
    expect(factRows(facts, "develop").map((row) => text(row.value))).toContain("bec1115 (Phase 4) · not in develop · on origin: couldn’t check");
    repository.lastPushed = { sha: "bec1115".padEnd(40, "0"), phaseId: "4", onOrigin: false };
    repository.unknown = ["whether this run’s last pushed commit is in develop"];
    expect(factRows(facts, "develop").map((row) => text(row.value))).toContain("bec1115 (Phase 4) · not on origin · in develop: couldn’t check");
  });

  it("names every other failed read as its own row", () => {
    const facts = view("unmerged");
    facts.repositories[0]!.unknown = ["the date of commit bec1115", "how many commits on feature/invoice-evidence-collection aren’t in develop"];
    const rows = factRows(facts, "develop").map((row) => [text(row.label), text(row.value)]);
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
