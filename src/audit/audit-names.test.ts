import { describe, expect, it } from "vitest";
import { auditHeading, auditName, recordedAuditName } from "./audit-names.js";
import { appendLoop, startedLedger } from "../state/audit-loops.js";

describe("closing-audit names (Kiln After Delivery AC-AUDIT-01)", () => {
  it("titles each audit for what it does, with its loop beneath, and never says round or continuation", () => {
    expect(auditName({ kind: "delivery_audit", loop: { number: 2, limit: 4 } })).toEqual({ title: "Delivery audit", line: "Loop 2 of 4", sentence: "delivery audit loop 2" });
    expect(auditName({ kind: "test_audit", loop: { number: 4, limit: 4 } })).toEqual({ title: "Test audit", line: "Loop 4 of 4", sentence: "test audit loop 4" });
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
      "Delivery audit · Loop 1 of 3",
      "Test audit · Loop 1 of 5",
      "Fixing tests · From test audit loop 1 · session 1",
      "Fixing tests · From test audit loop 1 · session 2",
      "Test audit · Loop 2 of 5",
      "Fixing tests · From test audit loop 2 · session 1",
      "Delivery audit",
    ]);
    for (const name of names) expect(name).not.toMatch(/round|continuation/i);
  });
});
