// `kiln status` text for a finished run (Kiln Deliver When Audit Loops Run Out AC-LEFT-02, AC-BOT-02):
// the loop line and each pull request, For you after them or first when it lists a critical
// finding, and the check for new phases with its offer.
import { describe, expect, it } from "vitest";
import { continuationFacts, continuationText, deliveredFacts, deliveredText } from "./delivered-facts.js";
import { appendLoop, startedLedger } from "../state/audit-loops.js";

const loops = { delivery: { used: 4, limit: 4 }, test: { used: 2, limit: 4 } };
const pullRequests = [{ repository: "product", number: 214, url: "https://github.com/acme/product/pull/214" }, { repository: "returns-api", number: 31, url: "https://github.com/acme/returns-api/pull/31" }];

describe("a finished run in kiln status text (AC-LEFT-02)", () => {
  it("prints the loop line and each pull request, then For you with Waived tags and the after-delivery actions", () => {
    const text = deliveredText({ loops, pullRequests, forYou: { items: [{ kind: "test", line: "Test gap: AC-1 has no test. Write one.", waived_tag: "waived at Final delivery, 2026-11-19 10:00 UTC · browser · alex" }], afterDelivery: ["Release to production."] } }, true);
    expect(text).toBe([
      "Closing audits: Delivery audit: 4 loops (max 4). Test audit: 2 loops (max 4).",
      "Pull request (product): https://github.com/acme/product/pull/214",
      "Pull request (returns-api): https://github.com/acme/returns-api/pull/31",
      "For you:",
      "  - Test gap: AC-1 has no test. Write one. (Waived: waived at Final delivery, 2026-11-19 10:00 UTC · browser · alex)",
      "  - Release to production.",
    ].join("\n"));
  });
  it("prints For you first when it lists a critical finding, and leaves it out when empty", () => {
    const critical = deliveredText({ loops, pullRequests: pullRequests.slice(0, 1), forYou: { items: [{ kind: "critical", line: "Critical finding: Keys are logged. Rotate them." }], afterDelivery: [] } }, false)!;
    expect(critical.split("\n")).toEqual(["For you:", "  - Critical finding: Keys are logged. Rotate them.", "Closing audits: Delivery audit: 4 loops (max 4). Test audit: 2 loops (max 4).", "Pull request: https://github.com/acme/product/pull/214"]);
    expect(deliveredText({ loops, pullRequests: [], forYou: { items: [], afterDelivery: [] } }, false)).toBe("Closing audits: Delivery audit: 4 loops (max 4). Test audit: 2 loops (max 4).");
    expect(deliveredText(null, false)).toBeUndefined();
  });
});

describe("an item waived at a closing audit, in kiln status (Kiln After Delivery AC-AUDIT-01, AC-BOT-02)", () => {
  it("names the audit by what it does in the Waived tag, in JSON and text, never by round or continuation", () => {
    const ledger = startedLedger("2026-11-22T00:00:00.000Z");
    appendLoop(ledger, { kind: "test", startedAt: "2026-11-22T00:02:00.000Z", activityKey: "audit-t1" });
    const record = { settings: { auditLoops: { deliveryLimit: 4, testLimit: 4 } }, auditLoops: ledger, completionAudits: { activities: [{ activityId: "t1", kind: "test_audit", round: 1, continuationIndex: 1 }, { activityId: "t1-2", kind: "test_audit", round: 1, continuationIndex: 2 }] } } as unknown as Parameters<typeof deliveredFacts>[1];
    const waiver = { waiverId: "w1", activityKey: "audit-t1-2", at: "2026-11-22T10:00:00.000Z", via: "browser" as const, account: "alex" };
    const item = { id: "item-2", kind: "test" as const, words: "Test gap", problem: "AC-RET-04 is Weak.", action: "Add a test.", line: "Test gap: AC-RET-04 is Weak. Add a test.", listedBy: "Test audit loop 1", listedByActivityId: "t1", waiver };
    const facts = deliveredFacts({ loops, forYou: { items: [item], afterDelivery: [] }, pullRequests: [] } as unknown as Parameters<typeof deliveredFacts>[0], record);
    const tag = "waived at Fixing tests, 2026-11-22 10:00 UTC · browser · alex";
    expect((facts.forYou as { items: { waived_tag: string }[] }).items[0]!.waived_tag).toBe(tag);
    const text = deliveredText(facts as unknown as Parameters<typeof deliveredText>[0], false)!;
    expect(text).toContain(`  - Test gap: AC-RET-04 is Weak. Add a test. (Waived: ${tag})`);
    expect(JSON.stringify(facts) + text).not.toMatch(/Round|Continuation/);
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
  it("prints the first answer, No new phases found, and the second with where its phases came from: committed here and not pushed, which Continue pushes first (Kiln After Delivery AC-BOT-02)", () => {
    const source = { kind: "main_checkout", branch: "develop", revision: "0a3d75d" };
    const unchanged = continuationFacts({ status: "unchanged", attemptedAt: "2026-11-20T01:00:00Z", lastSuccessfulAt: "2026-11-20T01:00:00Z", errors: [], result: { baselineId: "b", candidateId: "c", source, uncommitted: [], added: [], problems: [] } } as unknown as Parameters<typeof continuationFacts>[0]);
    expect(unchanged).toMatchObject({ summary: "No new phases found. Earlier delivery remains complete.", answer: { origin: null, phases: [] } });
    expect(continuationText(unchanged as unknown as Parameters<typeof continuationText>[0])).toBe("Check for new phases: unchanged at 2026-11-20T01:00:00Z\n  No new phases found. Earlier delivery remains complete.");
    const unpushed = continuationFacts({ status: "available", attemptedAt: "2026-11-20T01:00:00Z", lastSuccessfulAt: "2026-11-20T01:00:00Z", errors: [], result: { baselineId: "b", candidateId: "c", source, uncommitted: [], added: [{ id: "9", title: "Lending" }], problems: [], origin: { kind: "unpushed" } } } as unknown as Parameters<typeof continuationFacts>[0]);
    expect(unpushed).toMatchObject({ answer: { source, origin: { kind: "unpushed" }, phases: [{ id: "9", title: "Lending" }] } });
    expect(unpushed.summary).toContain("committed on this machine's develop and not pushed; Continue pushes them first");
    expect(continuationText(unpushed as unknown as Parameters<typeof continuationText>[0])).toContain("committed on this machine's develop and not pushed; Continue pushes them first");
  });
});
