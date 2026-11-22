// `kiln status` text for a finished run (Kiln Deliver When Audit Loops Run Out AC-LEFT-02, AC-BOT-02):
// the loop line and each pull request, For you after them or first when it lists a critical
// finding, and the check for new phases with its offer.
import { describe, expect, it } from "vitest";
import { continuationFacts, continuationText, deliveredText } from "./delivered-facts.js";

const loops = { delivery: { used: 4, limit: 4 }, test: { used: 2, limit: 4 } };
const pullRequests = [{ repository: "product", number: 214, url: "https://github.com/acme/product/pull/214" }, { repository: "returns-api", number: 31, url: "https://github.com/acme/returns-api/pull/31" }];

describe("a finished run in kiln status text (AC-LEFT-02)", () => {
  it("prints the loop line and each pull request, then For you with Waived tags and the after-delivery actions", () => {
    const text = deliveredText({ loops, pullRequests, forYou: { items: [{ kind: "test", line: "Test gap: AC-1 has no test. Write one.", waived_tag: "waived at Final delivery, 2026-11-19 10:00 UTC · browser · alex" }], afterDelivery: ["Release to production."] } }, true);
    expect(text).toBe([
      "Closing audits: Delivery audit: 4 of 4 loops. Test audit: 2 of 4 loops.",
      "Pull request (product): https://github.com/acme/product/pull/214",
      "Pull request (returns-api): https://github.com/acme/returns-api/pull/31",
      "For you:",
      "  - Test gap: AC-1 has no test. Write one. (Waived: waived at Final delivery, 2026-11-19 10:00 UTC · browser · alex)",
      "  - Release to production.",
    ].join("\n"));
  });
  it("prints For you first when it lists a critical finding, and leaves it out when empty", () => {
    const critical = deliveredText({ loops, pullRequests: pullRequests.slice(0, 1), forYou: { items: [{ kind: "critical", line: "Critical finding: Keys are logged. Rotate them." }], afterDelivery: [] } }, false)!;
    expect(critical.split("\n")).toEqual(["For you:", "  - Critical finding: Keys are logged. Rotate them.", "Closing audits: Delivery audit: 4 of 4 loops. Test audit: 2 of 4 loops.", "Pull request: https://github.com/acme/product/pull/214"]);
    expect(deliveredText({ loops, pullRequests: [], forYou: { items: [], afterDelivery: [] } }, false)).toBe("Closing audits: Delivery audit: 4 of 4 loops. Test audit: 2 of 4 loops.");
    expect(deliveredText(null, false)).toBeUndefined();
  });
});

describe("the offer to continue in kiln status text (AC-BOT-02)", () => {
  it("prints the latest check's status and time, and the offer's phases, readiness, problems and proposal id", () => {
    expect(continuationText({ check: { status: "available", attemptedAt: "2026-11-20T01:00:00Z", lastSuccessfulAt: "2026-11-20T01:00:00Z", errors: [] }, proposal: { id: "p-1", readiness: "blocked", phases: [{ id: "4", title: "Refund reports" }], problems: ["Phase 4 needs Authorize early merges."] } })).toBe([
      "Check for new phases: available at 2026-11-20T01:00:00Z",
      "Continue with 1 phase (blocked), proposal p-1:",
      "  - Phase 4: Refund reports",
      "  Problem: Phase 4 needs Authorize early merges.",
    ].join("\n"));
    expect(continuationText({ check: { status: "unchanged", attemptedAt: "2026-11-20T01:00:00Z", lastSuccessfulAt: null, errors: [] } })).toBe("Check for new phases: unchanged at 2026-11-20T01:00:00Z");
    // The terminal's words for the answer, waiting to merge included (Kiln After Delivery AC-BOT-02).
    const waiting = continuationFacts({ status: "awaiting_merge", attemptedAt: "2026-11-20T01:00:00Z", errors: [], awaitingMerge: { repository: "acme-shop", number: 218, url: "https://github.com/acme/acme-shop/pull/218", baseBranch: "develop", closed: false } });
    expect(continuationText(waiting as unknown as Parameters<typeof continuationText>[0])).toBe("Check for new phases: awaiting_merge at 2026-11-20T01:00:00Z\n  New phases: Kiln can check for them once #218 has merged into develop. It checks as soon as it confirms the merge.");
    expect(continuationText(null)).toBeUndefined();
  });
});
