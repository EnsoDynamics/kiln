// The planned test fix batches read from the record (Kiln Planned Test Fix Batches, "Reading the
// Plan"; AC-BATCH-01, AC-BATCH-02, AC-BATCH-04, AC-BATCH-05).
import { describe, expect, it } from "vitest";
import { appendLoop, startedLedger } from "../state/audit-loops.js";
import { auditFound, sessionBatch, waitingBatches, type ChainActivity, type FixPlanRecord } from "./fix-plan.js";
import { auditHeading, recordedAuditName } from "./audit-names.js";
import { testWorkOf } from "./effective-result.js";

const batches = (...sizes: number[]) => sizes.map((size, b) => ({ criteria: Array.from({ length: size }, (_, i) => `AC-${b}-${i}`) }));
type Step = { batches?: number[]; changed?: boolean; result?: boolean };
/** A chain: the test audit, then each session of test fixes; `batches` is what each left (continue_test), absent when its result counted anything else. */
function record(steps: Step[], limits = { deliveryLimit: 4, testLimit: 4 }, extra: ChainActivity[] = []): FixPlanRecord & { completionAudits: { activities: ChainActivity[] } } {
  const ledger = startedLedger("2026-11-20T00:00:00.000Z");
  appendLoop(ledger, { kind: "test", startedAt: "2026-11-20T00:01:00.000Z", activityKey: "audit-t1" });
  const activities: ChainActivity[] = steps.map((step, index) => ({
    activityId: index ? `t1-${index + 1}` : "t1", kind: "test_audit", round: 1, continuationIndex: index + 1,
    ...(step.result !== false ? { acceptedResult: `result-${index}` } : {}),
    ...(step.batches ? { testWork: { batches: batches(...step.batches), changedImplementation: step.changed ?? false } } : {}),
  }));
  return { settings: { auditLoops: limits }, auditLoops: ledger, completionAudits: { activities: [...activities, ...extra] } };
}
const row = (r: ReturnType<typeof record>, index: number) => auditHeading(recordedAuditName(r, r.completionAudits.activities[index]!));

describe("rows for every planned batch as soon as the audit ends (AC-BATCH-01)", () => {
  it("lists two batches, in the audit's order, before any starts", () => {
    const r = record([{ batches: [17, 14] }]);
    expect(waitingBatches(r)).toEqual({ audit: r.completionAudits.activities[0], batches: [{ number: 1, of: 2, gaps: 17 }, { number: 2, of: 2, gaps: 14 }] });
  });

  it("drops the first once its session is allocated, numbering the rest on from it", () => {
    const r = record([{ batches: [17, 14] }, { result: false }]);
    expect(waitingBatches(r)?.batches).toEqual([{ number: 2, of: 2, gaps: 14 }]);
    expect(row(r, 1)).toBe("Fixing tests · Batch 1 of 2 from test audit loop 1 · 17 gaps");
  });
});

describe("what the audit found and planned (AC-BATCH-02)", () => {
  it("is the sum of its batches' criteria and their count, in the singular for one", () => {
    expect(auditFound(record([{ batches: [13] }]).completionAudits.activities[0]!)).toEqual({ gaps: 13, batches: 1 });
    expect(row(record([{ batches: [13] }]), 0)).toBe("Test audit · Loop 1 · max 4 · found 13 test gaps and planned them as 1 batch");
    expect(row(record([{ batches: [17, 14] }]), 0)).toBe("Test audit · Loop 1 · max 4 · found 31 test gaps and planned them as 2 batches");
    expect(row(record([{ batches: [1] }]), 0)).toBe("Test audit · Loop 1 · max 4 · found 1 test gap and planned them as 1 batch");
  });

  it("never changes when a later session re-cuts what it left", () => {
    expect(row(record([{ batches: [17, 14] }, { batches: [5, 5, 4] }]), 0)).toBe("Test audit · Loop 1 · max 4 · found 31 test gaps and planned them as 2 batches");
  });

  it("names no loop for an audit the ledger did not count, in its own row and its batches'", () => {
    const r = record([{ batches: [13] }, { result: false }]);
    r.auditLoops = startedLedger("2026-11-20T00:00:00.000Z");
    expect(row(r, 0)).toBe("Test audit · Found 13 test gaps and planned them as 1 batch");
    expect(row(r, 1)).toBe("Fixing tests · Batch 1 of 1 from test audit · 13 gaps");
  });
});

describe("the rows that have not started are the work still planned (AC-BATCH-04)", () => {
  it("changes N on every row, the finished one included, when a session re-cuts what it left", () => {
    const r = record([{ batches: [10, 4] }, { batches: [2, 1, 1] }]);
    expect(row(r, 1)).toBe("Fixing tests · Batch 1 of 4 from test audit loop 1 · 10 gaps");
    expect(waitingBatches(r)?.batches).toEqual([{ number: 2, of: 4, gaps: 2 }, { number: 3, of: 4, gaps: 1 }, { number: 4, of: 4, gaps: 1 }]);
    expect(sessionBatch(r, r.completionAudits.activities[1]!)).toEqual({ number: 1, of: 4, gaps: 10 });
  });

  it("removes them when a session's result counts anything but continue_test, and the finished batch keeps its N", () => {
    // A session that passed, added phases, or was marked complete with no report has no testWork.
    const r = record([{ batches: [10, 4] }, {}]);
    expect(waitingBatches(r)).toBeUndefined();
    expect(row(r, 1)).toBe("Fixing tests · Batch 1 of 2 from test audit loop 1 · 10 gaps");
  });

  it("removes them when the result changed implementation while both kinds have a loop left, and keeps them once either is closed", () => {
    expect(waitingBatches(record([{ batches: [3, 3], changed: true }]))).toBeUndefined();
    expect(waitingBatches(record([{ batches: [3, 3], changed: true }], { deliveryLimit: 4, testLimit: 1 }))?.batches).toHaveLength(2);
    expect(waitingBatches(record([{ batches: [3, 3], changed: true }], { deliveryLimit: 0, testLimit: 4 }))?.batches).toHaveLength(2);
  });

  it("removes them when a session of test fixes changed implementation while both kinds are open, and keeps them once the test kind is closed", () => {
    expect(waitingBatches(record([{ batches: [3, 3] }, { batches: [2], changed: true }]))).toBeUndefined();
    expect(waitingBatches(record([{ batches: [3, 3] }, { batches: [2], changed: true }], { deliveryLimit: 4, testLimit: 1 }))?.batches).toEqual([{ number: 2, of: 2, gaps: 2 }]);
  });

  it("removes them once a later test audit is allocated", () => {
    const later: ChainActivity = { activityId: "t2", kind: "test_audit", round: 2, continuationIndex: 1 };
    expect(waitingBatches(record([{ batches: [3, 3] }], undefined, [later]))).toBeUndefined();
  });

  it("stay through a delivery audit allocated between two sessions", () => {
    const delivery: ChainActivity = { activityId: "d2", kind: "delivery_audit", round: 2, continuationIndex: 1 };
    expect(waitingBatches(record([{ batches: [3, 3] }], { deliveryLimit: 4, testLimit: 1 }, [delivery]))?.batches).toHaveLength(2);
  });
});

describe("an audit with no batch plan shows as today (AC-BATCH-05)", () => {
  it("reads each session as session k, with no rows waiting, for no list and for an empty one", () => {
    for (const r of [record([{ batches: [] }, { batches: [] }, { result: false }]), record([{}])]) {
      expect(waitingBatches(r)).toBeUndefined();
      if (r.completionAudits.activities.length > 1) expect(row(r, 2)).toBe("Fixing tests · From test audit loop 1 · session 2");
      expect(row(r, 0)).toBe("Test audit · Loop 1 · max 4");
    }
  });

  it("reads a session after a plan's last batch as session k", () => {
    const r = record([{ batches: [3] }, { batches: [] }, { result: false }]);
    expect(row(r, 1)).toBe("Fixing tests · Batch 1 of 1 from test audit loop 1 · 3 gaps");
    expect(row(r, 2)).toBe("Fixing tests · From test audit loop 1 · session 2");
  });

  it("reads a record from before the upgrade, with no testWork anywhere, as sessions", () => {
    const r = record([{}, {}, { result: false }]);
    r.completionAudits.activities[0]!.acceptedResult = "pre-upgrade";
    expect(waitingBatches(r)).toBeUndefined();
    expect(row(r, 1)).toBe("Fixing tests · From test audit loop 1 · session 1");
  });
});

describe("the plan a result leaves on the record (AC-BATCH-05)", () => {
  it("is no batches for a version-1 continue_test result, and nothing for any other counted outcome", () => {
    const v1 = { schemaVersion: 1, outcome: "continue_test" } as unknown as Parameters<typeof testWorkOf>[0];
    expect(testWorkOf(v1, "continue_test", undefined)).toEqual({ batches: [], changedImplementation: false });
    expect(testWorkOf(v1, "passed", undefined)).toBeUndefined();
  });
});
