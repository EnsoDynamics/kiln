import { describe, expect, it } from "vitest";
import { auditHeading, auditName, loopsUsedText, recordedAuditName } from "./audit-names.js";
import { appendLoop, startedLedger } from "../state/audit-loops.js";

describe("closing-audit names (Kiln After Delivery AC-AUDIT-01)", () => {
  it("titles each audit for what it does, with its loop beneath, and never says round or continuation", () => {
    expect(auditName({ kind: "delivery_audit", loop: { number: 2, limit: 4 } })).toEqual({ title: "Delivery audit", line: "Loop 2 · max 4", sentence: "delivery audit loop 2" });
    expect(auditName({ kind: "test_audit", loop: { number: 4, limit: 4 } })).toEqual({ title: "Test audit", line: "Loop 4 · max 4", sentence: "test audit loop 4" });
    expect(auditName({ kind: "test_audit", fixing: { loop: 1, session: 2 } })).toEqual({ title: "Fixing tests", line: "From test audit loop 1 · session 2", sentence: "fixing tests from test audit loop 1, session 2" });
    expect(auditName({ kind: "delivery_audit" })).toEqual({ title: "Delivery audit", sentence: "delivery audit" });
    expect(auditHeading(auditName({ kind: "delivery_audit" }))).toBe("Delivery audit");
    // A session of test fixes whose chain's test audit counted no loop still names its session, never a round.
    expect(auditName({ kind: "test_audit", fixing: { session: 1 } })).toEqual({ title: "Fixing tests", line: "From test audit · session 1", sentence: "fixing tests from test audit, session 1" });
  });

  it("reads loops from the ledger: a session of test fixes takes its chain's loop and counts its sessions from 1", () => {
    const ledger = startedLedger("2026-11-22T00:00:00.000Z");
    appendLoop(ledger, { kind: "delivery", startedAt: "2026-11-22T00:01:00.000Z", activityKey: "audit-d1" });
    appendLoop(ledger, { kind: "test", startedAt: "2026-11-22T00:02:00.000Z", activityKey: "audit-t1" });
    appendLoop(ledger, { kind: "test", startedAt: "2026-11-22T00:05:00.000Z", activityKey: "audit-t2" });
    const activities = [
      { activityId: "d1", kind: "delivery_audit" as const, round: 1, continuationIndex: 1 },
      { activityId: "t1", kind: "test_audit" as const, round: 1, continuationIndex: 1 },
      { activityId: "t1-2", kind: "test_audit" as const, round: 1, continuationIndex: 2 },
      { activityId: "t1-3", kind: "test_audit" as const, round: 1, continuationIndex: 3 },
      { activityId: "t2", kind: "test_audit" as const, round: 2, continuationIndex: 1 },
      { activityId: "t2-2", kind: "test_audit" as const, round: 2, continuationIndex: 2 },
      { activityId: "uncounted", kind: "delivery_audit" as const, round: 2, continuationIndex: 1 },
    ];
    const record = { settings: { auditLoops: { deliveryLimit: 3, testLimit: 5 } }, auditLoops: ledger, completionAudits: { activities } };
    const names = activities.map(activity => auditHeading(recordedAuditName(record, activity)));
    expect(names).toEqual([
      "Delivery audit · Loop 1 · max 3",
      "Test audit · Loop 1 · max 5",
      "Fixing tests · From test audit loop 1 · session 1",
      "Fixing tests · From test audit loop 1 · session 2",
      "Test audit · Loop 2 · max 5",
      "Fixing tests · From test audit loop 2 · session 1",
      "Delivery audit",
    ]);
    for (const name of names) expect(name).not.toMatch(/round|continuation/i);
  });
});

describe("planned batches and loops named with their maximum (Kiln Planned Test Fix Batches AC-BATCH-03, AC-MAX-01)", () => {
  it("names a batch by its number of the plan's count, its loop and its gaps, keeping \"of\", and a session with no batch as today", () => {
    expect(auditName({ kind: "test_audit", fixing: { loop: 1, session: 2, batch: { number: 2, of: 3, gaps: 14 } } })).toEqual({ title: "Fixing tests", line: "Batch 2 of 3 from test audit loop 1 · 14 gaps", sentence: "fixing tests, batch 2 of 3 from test audit loop 1" });
    expect(auditName({ kind: "test_audit", fixing: { loop: 1, session: 1, batch: { number: 1, of: 1, gaps: 1 } } }).line).toBe("Batch 1 of 1 from test audit loop 1 · 1 gap");
    expect(auditName({ kind: "test_audit", fixing: { session: 1, batch: { number: 1, of: 2, gaps: 5 } } }).line).toBe("Batch 1 of 2 from test audit · 5 gaps");
  });

  it("gives a test audit that planned batches its found-and-planned clause after the loop, and names the loop alone before it has a result", () => {
    expect(auditName({ kind: "test_audit", loop: { number: 1, limit: 4 }, found: { gaps: 31, batches: 2 } })).toEqual({ title: "Test audit", line: "Loop 1 · max 4 · found 31 test gaps and planned them as 2 batches", sentence: "test audit loop 1" });
    expect(auditName({ kind: "test_audit", loop: { number: 1, limit: 4 } }).line).toBe("Loop 1 · max 4");
  });

  it("says the loops a delivered run used with their maximum, singular for one", () => {
    expect(loopsUsedText({ delivery: { used: 4, limit: 4 }, test: { used: 1, limit: 4 } })).toBe("Delivery audit: 4 loops (max 4). Test audit: 1 loop (max 4).");
  });
});
