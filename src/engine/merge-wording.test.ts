// The pull request card's words for the merge and the offer table (Kiln After Delivery AC-MERGE-01,
// AC-MERGE-07, mockup state 1), and the order the merge session is given (SCOPE-001).
import { describe, expect, it } from "vitest";
import { closedLine, closedOfferLine, mergeNote } from "./merge-wording.js";
import { mergeOffer, orderedForMerge, type PullRequestReading } from "./delivery-reading.js";
import type { PrdRecord } from "../state/records.js";

const api = { repository: "acme-api", number: 57, base: "develop", ordered: true };
const shop = { repository: "acme-shop", number: 218, base: "develop", ordered: true };

describe("the note beside Merge with {agent} (AC-MERGE-01)", () => {
  it("names the order the pull requests state, and that each merge may start CI or a deployment", () => {
    expect(mergeNote({ agent: "Claude Code", multi: true, toMerge: [api, shop], merged: [] })).toBe("Merge with Claude Code starts one more session in this PRD’s workspace. It merges acme-api #57 first and then acme-shop #218, the order the pull requests state, bringing develop into each branch, resolving any conflicts, running the tests and waiting for the required checks before each merge. If one can’t be merged, it stops there and leaves the other open. Each merge into develop may start that repository’s CI or deployment.");
  });
  it("says it follows any order the descriptions state when none has the Merge order line", () => {
    const note = mergeNote({ agent: "Codex", multi: true, toMerge: [{ ...api, ordered: false }, { ...shop, ordered: false }], merged: [] });
    expect(note).toContain("It merges acme-api #57 and acme-shop #218, following any order their descriptions state");
    expect(note).toContain("may start that repository’s CI or deployment");
  });
  it("says which are already merged and merges only the rest", () => {
    expect(mergeNote({ agent: "Claude Code", multi: true, toMerge: [shop], merged: [{ repository: "acme-api", number: 57 }] })).toBe("acme-api #57 is already merged, so Merge with Claude Code merges only acme-shop #218. It starts one more session in this PRD’s workspace. It brings develop into the branch, resolves any conflicts, runs the tests, pushes, waits for the required checks and merges acme-shop #218 into develop. Merging into develop may start its CI or deployment.");
  });
  it("says the closed one can be reopened, or the others merged on GitHub", () => {
    expect(closedLine({ multi: true, closed: [{ repository: "acme-api", number: 57 }], open: [{ repository: "acme-shop", number: 218 }] })).toBe("acme-api #57 was closed without merging, so Kiln doesn’t offer to merge this delivery. Reopen #57 on GitHub and the merge comes back, or merge acme-shop #218 there yourself.");
  });
});

const reading = (repository: string, number: number, state: PullRequestReading["state"], order?: number): PullRequestReading => ({ repository, number, state, readAt: "2026-11-22T10:00:00Z", ...(order ? { order: { position: order, of: 2 } } : {}) });
const pull = (repository: string, number: number) => ({ repository, number, title: "", url: "", head: "feature/x", base: "develop", commits: 1, additions: 1, deletions: 0 });
const record = (rows: PullRequestReading[], failed: { repository: string; number: number }[] = []) => ({ pullRequests: [pull("acme-shop", 218), pull("acme-api", 57)], afterDelivery: { pullRequests: rows, ...(failed.length ? { readError: { at: "2026-11-22T10:01:00Z", problem: "HTTP 502", pullRequests: failed } } : {}) } }) as unknown as Pick<PrdRecord, "pullRequests" | "afterDelivery">;

describe("the offer table (AC-MERGE-07)", () => {
  it("offers every open one, stated positions first, then only the rest once some merged", () => {
    const offer = mergeOffer(record([reading("acme-shop", 218, "open", 2), reading("acme-api", 57, "open", 1)]));
    expect(offer.kind === "offered" && offer.toMerge.map(row => row.number)).toEqual([57, 218]);
    const some = mergeOffer(record([reading("acme-shop", 218, "open"), reading("acme-api", 57, "merged")]));
    expect(some.kind === "offered" && [some.toMerge.map(row => row.number), some.merged.map(row => row.number)]).toEqual([[218], [57]]);
  });
  it("is Merged when every one merged, closed when any closed, and unreadable when one not merged could not be read", () => {
    expect(mergeOffer(record([reading("acme-shop", 218, "merged"), reading("acme-api", 57, "merged")])).kind).toBe("all_merged");
    expect(mergeOffer(record([reading("acme-shop", 218, "open"), reading("acme-api", 57, "closed")])).kind).toBe("closed");
    expect(mergeOffer(record([reading("acme-shop", 218, "open"), reading("acme-api", 57, "open")], [{ repository: "acme-api", number: 57 }]))).toEqual({ kind: "unreadable", problem: "HTTP 502" });
    expect(mergeOffer(record([reading("acme-shop", 218, "open"), reading("acme-api", 57, "merged")], [{ repository: "acme-api", number: 57 }])).kind).toBe("offered");
    expect(mergeOffer(record([reading("acme-shop", 218, "open")])).kind).toBe("unreadable");
  });
  it("is closed, and also says GitHub could not be read and why, when one is closed and another could not be read", () => {
    const offer = mergeOffer(record([reading("acme-shop", 218, "open"), reading("acme-api", 57, "closed")], [{ repository: "acme-shop", number: 218 }]));
    expect(offer).toMatchObject({ kind: "closed", closed: [{ number: 57 }], unreadable: { pullRequests: [{ repository: "acme-shop", number: 218 }], problem: "HTTP 502" } });
    expect(mergeOffer(record([reading("acme-shop", 218, "open"), reading("acme-api", 57, "closed")]))).not.toHaveProperty("unreadable");
    // The one that could not be read is never named as one to merge by hand.
    expect(offer.kind === "closed" && closedOfferLine({ multi: true, ...offer })).toBe("acme-api #57 was closed without merging, so Kiln doesn’t offer to merge this delivery. Reopen #57 on GitHub and the merge comes back. GitHub could not be read for acme-shop #218. HTTP 502");
  });
  it("keeps the recorded order for pull requests that state none", () => {
    expect(orderedForMerge([{ repository: "b", number: 2 }, { repository: "a", number: 1 }], [{ repository: "a", number: 1 }, { repository: "b", number: 2 }]).map(row => row.repository)).toEqual(["a", "b"]);
  });
});
