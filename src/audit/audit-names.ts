/**
 * Every closing-audit name a person reads (Kiln After Delivery AC-AUDIT-01, technical design
 * "Closing-Audit Names"): a row title, the line beneath it and a sentence form for prose. A loop is
 * one run of an audit as the ledger counted it; a session of test fixes is no loop and names the
 * test audit loop that started its chain. "Round" and "Continuation" never appear: they stay in the
 * audit prompt and the JSON identifiers only. The page imports this module, so it reads nothing
 * from disk.
 *
 *   auditName({ kind: "delivery_audit", loop: { number: 2, limit: 4 } })
 *   // { title: "Delivery audit", line: "Loop 2 of 4", sentence: "delivery audit loop 2" }
 *   auditName({ kind: "test_audit", fixing: { loop: 1, session: 2 } })
 *   // { title: "Fixing tests", line: "From test audit loop 1 · session 2", sentence: "fixing tests from test audit loop 1, session 2" }
 */
import type { AuditActivity, AuditKind } from "./contracts.js";
import { countedLoops, limitOf, limitsInForce, type AuditLoopLedger, type AuditLoopSettings } from "../state/audit-loops.js";

export interface AuditNameFacts {
  kind: AuditKind;
  /** The loop the ledger counted for this audit, with the limit in force; absent when it counted none. */
  loop?: { number: number; limit: number };
  /** A session of test fixes: the loop of the test audit that started its chain (absent when that one counted none) and its place in the chain, from 1. */
  fixing?: { loop?: number; session: number };
}

export interface AuditName {
  /** The row title: Delivery audit, Test audit or Fixing tests. */
  title: string;
  /** The line beneath the title, absent for an audit the ledger did not count as a loop. */
  line?: string;
  /** The name in a sentence, lower case: "delivery audit loop 2". */
  sentence: string;
}

export function auditName(facts: AuditNameFacts): AuditName {
  if (facts.fixing) {
    const from = facts.fixing.loop === undefined ? "test audit" : `test audit loop ${facts.fixing.loop}`;
    return { title: "Fixing tests", line: `From ${from} · session ${facts.fixing.session}`, sentence: `fixing tests from ${from}, session ${facts.fixing.session}` };
  }
  const title = facts.kind === "delivery_audit" ? "Delivery audit" : "Test audit";
  if (!facts.loop) return { title, sentence: title.toLowerCase() };
  return { title, line: `Loop ${facts.loop.number} of ${facts.loop.limit}`, sentence: `${title.toLowerCase()} loop ${facts.loop.number}` };
}

/** "Delivery audit · Loop 2 of 4": the title and its line, where one name has to fit on one line. */
export const auditHeading = (name: AuditName): string => name.line ? `${name.title} · ${name.line}` : name.title;

/** A sentence form at the start of a sentence: "Delivery audit loop 2". */
export const auditSentenceStart = (name: AuditName): string => `${name.sentence.charAt(0).toUpperCase()}${name.sentence.slice(1)}`;

export type NamingRecord = { settings: { auditLoops?: AuditLoopSettings }; auditLoops?: AuditLoopLedger; completionAudits?: { activities: Pick<AuditActivity, "activityId" | "kind" | "round" | "continuationIndex">[] } };

/** The facts of one recorded audit activity, read from the record's loop ledger and the limits in force. */
export function auditNameFacts(record: NamingRecord, activity: Pick<AuditActivity, "activityId" | "kind" | "round" | "continuationIndex">): AuditNameFacts {
  const ledger = record.auditLoops;
  const counted = (activityId: string) => {
    const loop = ledger?.loops.findLast(one => one.activityKey === `audit-${activityId}`);
    return loop && countedLoops(ledger, loop.kind).includes(loop) ? loop : undefined;
  };
  if (activity.kind === "test_audit" && activity.continuationIndex > 1) {
    const start = record.completionAudits?.activities.find(one => one.kind === "test_audit" && one.round === activity.round && one.continuationIndex === 1);
    const loop = start ? counted(start.activityId) : undefined;
    return { kind: activity.kind, fixing: { ...(loop ? { loop: loop.number } : {}), session: activity.continuationIndex - 1 } };
  }
  const loop = counted(activity.activityId);
  return { kind: activity.kind, ...(loop ? { loop: { number: loop.number, limit: limitOf(limitsInForce(record), loop.kind) } } : {}) };
}

/** The name of one recorded audit activity. */
export const recordedAuditName = (record: NamingRecord, activity: Pick<AuditActivity, "activityId" | "kind" | "round" | "continuationIndex">): AuditName => auditName(auditNameFacts(record, activity));
