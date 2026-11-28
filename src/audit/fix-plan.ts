/**
 * The planned test fix batches, read from the record alone (Kiln Planned Test Fix Batches technical
 * design, "Reading the Plan"). A chain is a test audit and the sessions of test fixes that follow it:
 * the test audit activities of one round, the audit at continuationIndex 1 and the session at place
 * k at continuationIndex k + 1. Each activity whose effective result counts `continue_test` carries
 * `testWork`, the batches it left; Kiln numbers the batches from each session's place in its chain.
 * The rows, the status line and `kiln status` all take their batch facts from here.
 *
 *   sessionBatch(record, session)   // { number: 1, of: 2, gaps: 17 }
 *   auditFound(audit)               // { gaps: 31, batches: 2 }
 *   waitingBatches(record)          // { audit, batches: [{ number: 2, of: 2, gaps: 14 }] }
 */
import type { AuditActivity } from "./contracts.js";
import { closedKinds, type AuditLoopLedger, type AuditLoopSettings } from "../state/audit-loops.js";
import { stepsAfter } from "../engine/next-steps.js";

export type ChainActivity = Pick<AuditActivity, "activityId" | "kind" | "round" | "continuationIndex"> & Partial<Pick<AuditActivity, "testWork" | "acceptedResult" | "waivedResult">>;
export interface FixPlanRecord { settings: { auditLoops?: AuditLoopSettings }; auditLoops?: AuditLoopLedger; completionAudits?: { activities: ChainActivity[] } }

/** A batch of test fixes: k, the plan's current count N, and its number of gaps. */
export interface BatchFacts { number: number; of: number; gaps: number }
/** What a test audit that planned batches found: the sum of its batches' criteria, and how many batches. */
export interface FoundFacts { gaps: number; batches: number }

/** The test audit activities of one round, in chain order. */
export function chainOf(record: FixPlanRecord, round: number): ChainActivity[] {
  return (record.completionAudits?.activities ?? []).filter(one => one.kind === "test_audit" && one.round === round).sort((a, b) => a.continuationIndex - b.continuationIndex);
}

/** _N_: the latest activity of the chain with `testWork`, its place (0 for the audit) plus the batches it lists. */
export function planCount(chain: readonly ChainActivity[]): number | undefined {
  const latest = chain.findLast(one => one.testWork);
  return latest ? latest.continuationIndex - 1 + latest.testWork!.batches.length : undefined;
}

/**
 * The batch a session of test fixes took: batch k when the result before it in its chain listed
 * at least one batch, and that list's first batch's size is its number of gaps for good. Absent for
 * a test audit and for a session with no batch, which reads as a session (AC-BATCH-05).
 */
export function sessionBatch(record: FixPlanRecord, activity: ChainActivity): BatchFacts | undefined {
  if (activity.kind !== "test_audit" || activity.continuationIndex <= 1) return undefined;
  const chain = chainOf(record, activity.round);
  const before = chain.find(one => one.continuationIndex === activity.continuationIndex - 1);
  const first = before?.testWork?.batches[0];
  if (!first) return undefined;
  return { number: activity.continuationIndex - 1, of: planCount(chain) ?? 0, gaps: first.criteria.length };
}

/** A test audit whose own result lists at least one batch: what it found and planned, which never changes (AC-BATCH-02). */
export function auditFound(activity: ChainActivity): FoundFacts | undefined {
  if (activity.kind !== "test_audit" || activity.continuationIndex !== 1 || !activity.testWork?.batches.length) return undefined;
  return { gaps: activity.testWork.batches.reduce((sum, batch) => sum + batch.criteria.length, 0), batches: activity.testWork.batches.length };
}

const effective = (one: ChainActivity) => !!(one.acceptedResult || one.waivedResult);

/**
 * The batches that have not started (AC-BATCH-01, AC-BATCH-04), while the latest chain is open: its
 * latest effective result counts `continue_test`, no later test audit is allocated (it is the latest
 * chain), and that result does not lead to a new test audit by {@link stepsAfter}. They are the
 * batches that result lists, less the first once a later session of the chain is allocated, numbered
 * on from it. Undefined when the chain is not open or lists none.
 */
export function waitingBatches(record: FixPlanRecord): { audit: ChainActivity; batches: BatchFacts[] } | undefined {
  const tests = (record.completionAudits?.activities ?? []).filter(one => one.kind === "test_audit");
  if (!tests.length) return undefined;
  const chain = chainOf(record, Math.max(...tests.map(one => one.round)));
  const audit = chain.find(one => one.continuationIndex === 1);
  const latest = chain.findLast(effective);
  if (!audit || !latest?.testWork) return undefined;
  const steps = stepsAfter({ kind: "test_audit", fixing: latest.continuationIndex > 1, closed: closedKinds(record), latestTestContinues: false }, "continue_test", latest.testWork.changedImplementation);
  if (steps.includes("test audit")) return undefined;
  const allocated = chain.some(one => one.continuationIndex > latest.continuationIndex);
  const left = latest.testWork.batches.slice(allocated ? 1 : 0);
  if (!left.length) return undefined;
  const of = planCount(chain) ?? 0;
  const from = latest.continuationIndex + (allocated ? 1 : 0);
  return { audit, batches: left.map((batch, index) => ({ number: from + index, of, gaps: batch.criteria.length })) };
}

/** The key of a batch that has not started: an audit's key to the shared key classifier, never resolved to an activity. */
export const waitingBatchKey = (audit: Pick<AuditActivity, "activityId">, number: number): string => `audit-batch-${audit.activityId}-${number}`;
