/**
 * Every closing-audit name a person reads (Kiln After Delivery AC-AUDIT-01, technical design
 * "Closing-Audit Names"; Kiln Planned Test Fix Batches, "Names"): a row title, the line beneath it
 * and a sentence form for prose, plus the status-line text and the loops a run used. A loop is one
 * audit plus the work it finds, and its limit is a maximum, so a loop reads "Loop 2 · max 4" and
 * never "of" its limit; a batch of test fixes keeps "of", since every planned batch is worked. A
 * session of test fixes is no loop and names the test audit loop that started its chain. "Round"
 * and "Continuation" never appear: they stay in the audit prompt and the JSON identifiers only. The
 * page imports this module, so it reads nothing from disk.
 *
 *   auditName({ kind: "delivery_audit", loop: { number: 2, limit: 4 } })
 *   // { title: "Delivery audit", line: "Loop 2 · max 4", sentence: "delivery audit loop 2" }
 *   auditName({ kind: "test_audit", fixing: { loop: 1, session: 2 } })
 *   // { title: "Fixing tests", line: "From test audit loop 1 · session 2", sentence: "fixing tests from test audit loop 1, session 2" }
 *   auditName({ kind: "test_audit", fixing: { loop: 1, session: 1, batch: { number: 1, of: 2, gaps: 17 } } })
 *   // { title: "Fixing tests", line: "Batch 1 of 2 from test audit loop 1 · 17 gaps", sentence: "fixing tests, batch 1 of 2 from test audit loop 1" }
 *   positionText({ audit: "delivery", loop: 2, limit: 4 })   // "Delivery audit loop 2 · max 4"
 *   loopsUsedText({ delivery: { used: 4, limit: 4 }, test: { used: 1, limit: 4 } })
 *   // "Delivery audit: 4 loops (max 4). Test audit: 1 loop (max 4)."
 */
import type { AuditActivity, AuditKind } from "./contracts.js";
import { countedLoops, limitOf, limitsInForce, type AuditLoopLedger, type AuditLoopSettings, type ClosingAudits, type LoopKind } from "../state/audit-loops.js";
import { auditFound, sessionBatch, type BatchFacts, type ChainActivity, type FoundFacts } from "./fix-plan.js";

export interface AuditNameFacts {
  kind: AuditKind;
  /** The loop the ledger counted for this audit, with the limit in force; absent when it counted none. */
  loop?: { number: number; limit: number };
  /** A test audit that planned batches of test fixes: what it found and planned (AC-BATCH-02). */
  found?: FoundFacts;
  /**
   * A session of test fixes: the loop of the test audit that started its chain (absent when that
   * one counted none), its place in the chain, from 1, and the batch it took, when it took one.
   */
  fixing?: { loop?: number; session: number; batch?: BatchFacts };
}

export interface AuditName {
  /** The row title: Delivery audit, Test audit or Fixing tests. */
  title: string;
  /** The line beneath the title, absent for an audit the ledger did not count as a loop that planned no batches. */
  line?: string;
  /** The name in a sentence, lower case: "delivery audit loop 2". */
  sentence: string;
}

/** "1 gap", "13 gaps": a count of one is singular. */
export const counted = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : word.endsWith("ch") ? "es" : "s"}`;

/** "found 13 test gaps and planned them as 1 batch" (AC-BATCH-02). */
export const foundText = (found: FoundFacts): string => `found ${counted(found.gaps, "test gap")} and planned them as ${counted(found.batches, "batch")}`;

/** "Loop 2 · max 4": a loop named with its maximum (AC-MAX-01). */
export const loopText = (loop: { number: number; limit: number }): string => `Loop ${loop.number} · max ${loop.limit}`;

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export function auditName(facts: AuditNameFacts): AuditName {
  if (facts.fixing) {
    const from = facts.fixing.loop === undefined ? "test audit" : `test audit loop ${facts.fixing.loop}`;
    const batch = facts.fixing.batch;
    if (batch) return { title: "Fixing tests", line: `Batch ${batch.number} of ${batch.of} from ${from} · ${counted(batch.gaps, "gap")}`, sentence: `fixing tests, batch ${batch.number} of ${batch.of} from ${from}` };
    return { title: "Fixing tests", line: `From ${from} · session ${facts.fixing.session}`, sentence: `fixing tests from ${from}, session ${facts.fixing.session}` };
  }
  const title = facts.kind === "delivery_audit" ? "Delivery audit" : "Test audit";
  const sentence = facts.loop ? `${title.toLowerCase()} loop ${facts.loop.number}` : title.toLowerCase();
  const found = facts.found ? foundText(facts.found) : undefined;
  if (!facts.loop) return { title, ...(found ? { line: capital(found) } : {}), sentence };
  return { title, line: [loopText(facts.loop), ...(found ? [found] : [])].join(" · "), sentence };
}

/** "Delivery audit · Loop 2 · max 4": the title and its line, where one name has to fit on one line. */
export const auditHeading = (name: AuditName): string => name.line ? `${name.title} · ${name.line}` : name.title;

/** A sentence form at the start of a sentence: "Delivery audit loop 2". */
export const auditSentenceStart = (name: AuditName): string => capital(name.sentence);

/** Where the run is during the closing audits (Kiln Deliver When Audit Loops Run Out AC-STOP-05). */
export interface LoopPosition {
  audit: LoopKind;
  loop: number;
  limit: number;
  /** A session of test fixes: the loop is the latest test loop. */
  fixing?: true;
  /** A batch of test fixes: k of the plan's current count N (Kiln Planned Test Fix Batches AC-MAX-01). */
  batch?: { number: number; of: number };
}

/**
 * The status line (AC-MAX-01): "Delivery audit loop 2 · max 4", "Fixing tests · batch 1 of 2 from
 * test audit loop 1", "Fixing tests from test audit loop 1"; at a Needs you stop the latest loop counted.
 */
export function positionText(position: LoopPosition): string {
  const from = `${position.audit} audit loop ${position.loop}`;
  if (position.fixing) return position.batch ? `Fixing tests · batch ${position.batch.number} of ${position.batch.of} from ${from}` : `Fixing tests from ${from}`;
  return `${capital(from)} · max ${position.limit}`;
}

/** "4 loops (max 4)": one kind's loops used beside its limit in force. */
export const loopsUsed = (kind: { used: number; limit: number }): string => `${counted(kind.used, "loop")} (max ${kind.limit})`;

/** "Delivery audit: 4 loops (max 4). Test audit: 1 loop (max 4).": the loops a delivered run used (AC-LEFT-01, AC-MAX-01). */
export const loopsUsedText = (loops: ClosingAudits): string => `Delivery audit: ${loopsUsed(loops.delivery)}. Test audit: ${loopsUsed(loops.test)}.`;

/** "Audit loops: delivery 2 (max 4) · test 0 (max 4)": `kiln status`'s count line while a run is under way. */
export const loopCountLine = (counts: { delivery: { used: number; limit: number }; test: { used: number; limit: number } }): string => `Audit loops: delivery ${counts.delivery.used} (max ${counts.delivery.limit}) · test ${counts.test.used} (max ${counts.test.limit})`;

export type NamingRecord = { settings: { auditLoops?: AuditLoopSettings }; auditLoops?: AuditLoopLedger; completionAudits?: { activities: ChainActivity[] } };
type NamedActivity = Pick<AuditActivity, "activityId" | "kind" | "round" | "continuationIndex"> & Partial<Pick<AuditActivity, "testWork">>;

/** The facts of one recorded audit activity, read from the record's loop ledger and the limits in force. */
export function auditNameFacts(record: NamingRecord, activity: NamedActivity): AuditNameFacts {
  const ledger = record.auditLoops;
  const countedLoop = (activityId: string) => {
    const loop = ledger?.loops.findLast(one => one.activityKey === `audit-${activityId}`);
    return loop && countedLoops(ledger, loop.kind).includes(loop) ? loop : undefined;
  };
  if (activity.kind === "test_audit" && activity.continuationIndex > 1) {
    const start = record.completionAudits?.activities.find(one => one.kind === "test_audit" && one.round === activity.round && one.continuationIndex === 1);
    const loop = start ? countedLoop(start.activityId) : undefined;
    const batch = sessionBatch(record, activity);
    return { kind: activity.kind, fixing: { ...(loop ? { loop: loop.number } : {}), session: activity.continuationIndex - 1, ...(batch ? { batch } : {}) } };
  }
  const loop = countedLoop(activity.activityId);
  const found = auditFound(activity);
  return { kind: activity.kind, ...(loop ? { loop: { number: loop.number, limit: limitOf(limitsInForce(record), loop.kind) } } : {}), ...(found ? { found } : {}) };
}

/** The name of one recorded audit activity. */
export const recordedAuditName = (record: NamingRecord, activity: NamedActivity): AuditName => auditName(auditNameFacts(record, activity));
