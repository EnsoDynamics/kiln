// What Kiln says about a repository it can't place after Start (find repositories anywhere,
// "A session's request", "The stops that ask", "A continuation and a base-branch start"): each
// question form's words. The end-to-end flows are in kiln-run-ask-after-start.integration.test.ts.

import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SavedQuestion } from "../state/records.js";
import { englishList, planStopFact, readinessProblem, requestRefusal, stopNowAsks, withQuestion } from "./stop-questions.js";

const base = { repository: "acme-labs/ledger", searchedFrom: join(homedir(), "code", "acme"), found: 0 };
const where: SavedQuestion = { ...base, kind: "where", checkouts: [] };
const elsewhere = (n: number): SavedQuestion => ({ ...base, kind: "where", found: n, checkouts: Array.from({ length: n }, (_, i) => ({ folder: `/srv/ledger-${i + 1}`, remote: `git@git.example.com:acme-labs/ledger.git`, pickable: false })) });
const which: SavedQuestion = { ...base, kind: "which", found: 2, checkouts: [{ folder: "/srv/a", remote: "git@github.com:acme-labs/ledger.git", pickable: true }, { folder: "/srv/b", remote: "git@github.com:acme-labs/ledger.git", pickable: true }] };

describe("a session's refused request", () => {
  it("says where Kiln searched, the checkouts it can't deliver to, or the checkouts to choose from, and that nothing was added", () => {
    expect(requestRefusal(where)).toBe("Kiln couldn’t find a checkout of acme-labs/ledger. It searched outward from ~/code/acme/, never above your home folder. Nothing was added.");
    expect(requestRefusal(elsewhere(1))).toBe("Kiln couldn’t find a checkout of acme-labs/ledger that it can deliver to. It found /srv/ledger-1 (git@git.example.com:acme-labs/ledger.git), which isn’t on GitHub. Nothing was added.");
    expect(requestRefusal(elsewhere(3))).toBe("Kiln couldn’t find a checkout of acme-labs/ledger that it can deliver to. It found /srv/ledger-1 (git@git.example.com:acme-labs/ledger.git), /srv/ledger-2 (git@git.example.com:acme-labs/ledger.git) and /srv/ledger-3 (git@git.example.com:acme-labs/ledger.git), none of them on GitHub. Nothing was added.");
    expect(requestRefusal(which)).toBe("Kiln found 2 checkouts of acme-labs/ledger and needs a person to say which to use: /srv/a and /srv/b. Nothing was added.");
    expect(stopNowAsks(where)).toBe("The stop in Kiln now asks where it is.");
    expect(stopNowAsks(which)).toBe("The stop in Kiln now asks which checkout to use.");
    expect(englishList(["a"])).toBe("a");
  });
});

describe("the plan stop's fact", () => {
  it("names the phase file and the address path in each of its three forms", () => {
    expect(planStopFact("phase-4-restock-check-in.md", where)).toBe("phase-4-restock-check-in.md names acme-labs/ledger, and Kiln couldn’t find a checkout of it");
    expect(planStopFact("phase-4-restock-check-in.md", elsewhere(1))).toBe("phase-4-restock-check-in.md names acme-labs/ledger, and Kiln couldn’t find a checkout of it that it can deliver to");
    expect(planStopFact("phase-4-restock-check-in.md", which)).toBe("phase-4-restock-check-in.md names acme-labs/ledger, and Kiln found 2 checkouts of it");
  });
});

describe("a repository a start after Start must read", () => {
  it("is a problem: the question's first sentence, then what clears it on Check again", () => {
    expect(readinessProblem(where)).toBe("Kiln couldn’t find a checkout of acme-labs/ledger. Check again once a checkout of it is where the search reaches.");
    expect(readinessProblem(elsewhere(1))).toBe("Kiln couldn’t find a checkout of acme-labs/ledger that it can deliver to. Check again once a checkout of it whose origin is on GitHub is where the search reaches.");
    expect(readinessProblem(which)).toBe("Kiln found 2 checkouts of acme-labs/ledger. Check again once only one checkout of it is where the search reaches.");
  });
});

describe("a stop's questions", () => {
  it("keep one per repository, a request's replaced by a newer one and never by a plan stop's", () => {
    const plan = { ...where, phaseFile: "phase-4-restock-check-in.md" };
    expect(withQuestion([where], which)).toEqual([which]);
    expect(withQuestion([plan], which)).toEqual([plan]);
    expect(withQuestion(undefined, where)).toEqual([where]);
  });
});

describe("a phase skipped at a stop that asks (technical design, \"Names\")", () => {
  it("records an address path lower-cased without its host, and matches the plan's spelling of it", async () => {
    const { completedPhaseScopeUnchanged, scopeKey } = await import("./plan-reconciliation.js");
    expect(scopeKey("github.com:Acme-Labs/Ledger")).toBe("acme-labs/ledger");
    expect(scopeKey("Acme-Labs/Ledger")).toBe("acme-labs/ledger");
    expect(scopeKey("storefront")).toBe("storefront");
    const source = (repositories: string[]) => ({ scopes: { "4": "same" }, plan: { phases: [{ id: "4", repositories }] } }) as never;
    expect(completedPhaseScopeUnchanged(source(["Acme-Labs/Ledger"]), source(["Acme-Labs/Ledger"]), "4", ["acme-labs/ledger"])).toBe(true);
    expect(completedPhaseScopeUnchanged(source(["Acme-Labs/Ledger"]), source(["acme-labs/other"]), "4", ["acme-labs/ledger"])).toBe(false);
    // A folder name keeps its spelling: re-spelled, the scope reads as changed.
    expect(completedPhaseScopeUnchanged(source(["Storefront"]), source(["storefront"]), "4", ["Storefront"])).toBe(false);
  });
});
