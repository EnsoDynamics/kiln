/**
 * The loop gate (Kiln Audit Loop Limits technical design, "The Loop Gate"): every decision to
 * start work after an audit passes through it. Its decisions are pure functions of the record,
 * the settings and the audits' effective results; the engine applies them and writes the loop or
 * the stop. Nothing is remembered between decisions except the ledger.
 *
 *   deliveryDecision(context, "4")   // { kind: "stop", audit } when no delivery audit loop is left
 */
import { auditKey } from "../audit/workflow.js";
import { effectiveAudit, hasEffectiveResult } from "../audit/effective-result.js";
import { AuditStore } from "../audit/storage.js";
import { completionPhaseIds, type AuditActivity, type AuditReport, type AuditResult } from "../audit/contracts.js";
import { personItems } from "../audit/person-items.js";
import { readSessionRecord, type LoopStop, type PrdRecord } from "../state/records.js";
import {
  atOrUnder, countedLoops, itemName, latestEpoch, loopLeft, loopSettings,
  type Acceptance, type AcceptedItem, type AuditLoop, type AuditLoopLedger,
} from "../state/audit-loops.js";

export interface GateContext { record: PrdRecord; stateDirectory: string }

const settled = (context: GateContext, activity: AuditActivity) => !!context.record.phases[auditKey(activity)]?.doneAt && hasEffectiveResult(activity);

/** The audits whose effective result appended phases, latest first. */
function appendingAudits(context: GateContext): { audit: AuditActivity; phases: string[] }[] {
  const store = new AuditStore(context.stateDirectory);
  return (context.record.completionAudits?.activities ?? []).filter(a => settled(context, a)).map(audit => ({ audit, phases: effectiveAudit(context.stateDirectory, audit, store)!.completionPhases() })).filter(entry => entry.phases.length).reverse();
}

/** The audit that appended the phase a leaf is at or under, if any (AC-LOOP-02). */
export function appendingAudit(context: GateContext, leafId: string): AuditActivity | undefined {
  return appendingAudits(context).find(entry => entry.phases.some(phase => atOrUnder(leafId, phase)))?.audit;
}

export type DeliveryDecision =
  | { kind: "none" }
  | { kind: "join"; loop: AuditLoop }
  | { kind: "count"; audit: AuditActivity }
  | { kind: "stop"; audit: AuditActivity };

/** What the gate does before Kiln launches a leaf (the table's first row). */
export function deliveryDecision(context: GateContext, leafId: string): DeliveryDecision {
  const audit = appendingAudit(context, leafId);
  if (!audit) return { kind: "none" };
  const loop = context.record.auditLoops?.loops.find(one => one.kind === "delivery" && one.sourceAuditId === audit.activityId);
  if (loop) return { kind: "join", loop };
  return loopLeft(context.record.auditLoops, loopSettings(context.record.settings), "delivery") ? { kind: "count", audit } : { kind: "stop", audit };
}

/** The latest settled test audit, if no delivery audit was allocated after it. */
export function latestTestWithoutLaterDelivery(context: GateContext): AuditActivity | undefined {
  const activities = context.record.completionAudits?.activities ?? [];
  const test = activities.findLast(a => a.kind === "test_audit" && settled(context, a));
  if (!test || activities.some(a => a.kind === "delivery_audit" && a.sequence > test.sequence)) return undefined;
  return test;
}

/** The latest settled test audit. */
export function latestSettledTest(context: GateContext): AuditActivity | undefined {
  return (context.record.completionAudits?.activities ?? []).findLast(a => a.kind === "test_audit" && settled(context, a));
}

export const unusedAcceptance = (ledger: AuditLoopLedger | undefined, heldAuditKey: string | undefined): Acceptance | undefined =>
  heldAuditKey === undefined ? undefined : ledger?.acceptances.find(a => a.heldAuditKey === heldAuditKey && a.activityKey === undefined);

/** An Allow at a test stop whose report saved no test work: its first test audit allocated after is the loop it allowed. */
export function pendingAllow(ledger: AuditLoopLedger | undefined): boolean {
  const epoch = latestEpoch(ledger, "test");
  return epoch?.cause === "allowed" && countedLoops(ledger, "test").length === 0;
}

const countsContinue = (context: GateContext, activity: AuditActivity | undefined) => !!activity && effectiveAudit(context.stateDirectory, activity)?.countedOutcome === "continue_test";

/** An accepted `passed` report that still lists items for a person. */
function passedWithItems(context: GateContext, activity: AuditActivity): boolean {
  const effective = effectiveAudit(context.stateDirectory, activity);
  if (!effective || effective.source !== "accepted" || effective.outcome !== "passed") return false;
  const parsed = effective.parsed;
  return parsed?.schemaVersion === 2 && parsed.needsYou.length > 0;
}

/**
 * The test rows the gate checks before asking `auditNext` (the table's third and fourth rows): a
 * stop on the latest settled test audit when no test loop is left.
 */
export function testHold(context: GateContext): LoopStop | undefined {
  const ledger = context.record.auditLoops;
  if (!ledger || loopLeft(ledger, loopSettings(context.record.settings), "test")) return undefined;
  const test = latestTestWithoutLaterDelivery(context);
  if (!test) return undefined;
  const key = auditKey(test);
  if (unusedAcceptance(ledger, key)) return undefined;
  if (countsContinue(context, test)) return { kind: "test", reason: "test_work_saved", heldAuditKey: key };
  if (passedWithItems(context, test) && !ledger.itemsListedStops.includes(key)) return { kind: "test", reason: "items_listed", heldAuditKey: key };
  return undefined;
}

export type TestDecision =
  | { kind: "loop"; predecessor: AuditActivity | undefined }
  | { kind: "accept"; acceptance: Acceptance }
  | { kind: "plain" }
  | { kind: "stop"; stop: LoopStop };

/** What the gate does when `auditNext` asks for a test audit (the table's fifth row). */
export function testDecision(context: GateContext): TestDecision {
  const ledger = context.record.auditLoops;
  const predecessor = latestSettledTest(context);
  const acceptance = unusedAcceptance(ledger, predecessor && auditKey(predecessor));
  if (acceptance) return { kind: "accept", acceptance };
  const isLoop = countsContinue(context, predecessor) || pendingAllow(ledger);
  if (!isLoop || !ledger) return { kind: "plain" };
  if (loopLeft(ledger, loopSettings(context.record.settings), "test")) return { kind: "loop", predecessor };
  const held = predecessor ? auditKey(predecessor) : "";
  return { kind: "stop", stop: { kind: "test", reason: countsContinue(context, predecessor) ? "test_work_saved" : "items_listed", heldAuditKey: held } };
}

/** The result an audit's latest recorded attempt holds, if any. */
export function latestAttempt(context: GateContext, activity: AuditActivity): AuditResult | undefined {
  const ref = activity.attempts.at(-1);
  return ref ? new AuditStore(context.stateDirectory).read<AuditResult>(ref) : undefined;
}

/**
 * A `done_check` stop on a test audit whose latest attempt is an admitted report with the outcome
 * `needs_you` is also a loop stop while no test loop is left (technical design, "`needs_you` loop
 * stops"). A refused or missing report, or one stopped only by a failing repository or development
 * check, stays the ordinary failing-check stop.
 */
export function needsYouLoopStop(context: GateContext, key: string): LoopStop | undefined {
  const stop = context.record.phases[key]?.stop;
  if (stop?.kind === "loop_limit") return stop.loop;
  if (stop?.kind !== "done_check" || !context.record.auditLoops) return undefined;
  const activity = context.record.completionAudits?.activities.find(a => auditKey(a) === key);
  if (!activity || activity.kind !== "test_audit" || hasEffectiveResult(activity)) return undefined;
  if (loopLeft(context.record.auditLoops, loopSettings(context.record.settings), "test")) return undefined;
  let attempt: AuditResult | undefined;
  try { attempt = latestAttempt(context, activity); } catch { return undefined; }
  // Only while that report is the latest session's own: a stop after a later session that wrote none is an ordinary stop.
  const sessionId = context.record.phases[key]?.sessionIds.at(-1);
  const session = sessionId ? readSessionRecord(context.stateDirectory, key, sessionId) : undefined;
  const lastRun = session?.runs.at(-1);
  if (attempt && lastRun && Date.parse(attempt.at) < Date.parse(lastRun.startedAt)) return undefined;
  if (!ownNeedsYou(attempt)) return undefined;
  // A report that also adds phases fits AC-TEST-02's first row: it stops as a delivery audit's
  // `needs_you` report with phases does, and its phases then go through the delivery loop gate.
  return attemptPhases(attempt).length ? undefined : { kind: "test", reason: "items_listed", heldAuditKey: key };
}

/** Whether a recorded attempt is an admitted, unrefused report whose own outcome is `needs_you`. */
function ownNeedsYou(attempt: AuditResult | undefined): boolean {
  if (!attempt?.reportBytes || attempt.refusal) return false;
  return (JSON.parse(attempt.reportBytes) as AuditReport).outcome === "needs_you";
}

/** The phases a recorded attempt's admitted report appended; none for a refused report, whose claims were not validated. */
export function attemptPhases(attempt: AuditResult | undefined): string[] {
  if (!attempt?.reportBytes || attempt.refusal) return [];
  return completionPhaseIds(JSON.parse(attempt.reportBytes) as AuditReport);
}

/** A loop stop holds when the report added phases or saved test work (AC-STOP-02). */
export const holds = (loop: LoopStop | undefined) => !!loop && loop.reason !== "items_listed";

/** The report a stop's held audit wrote: its accepted one, or the latest attempt's at a `needs_you` stop. */
export function heldReport(context: GateContext, key: string): AuditReport | undefined {
  const activity = context.record.completionAudits?.activities.find(a => auditKey(a) === key);
  if (!activity) return undefined;
  const effective = effectiveAudit(context.stateDirectory, activity);
  if (effective?.parsed) return effective.parsed;
  try { const attempt = latestAttempt(context, activity); return attempt?.reportBytes ? JSON.parse(attempt.reportBytes) as AuditReport : undefined; } catch { return undefined; }
}

/**
 * The items an Accept at this stop would name, as the audit wrote them (technical design, "Item
 * ids"): an accepted report's entries take the outstanding ledger's ids; a `needs_you` report's
 * only their own.
 */
export function listedItems(context: GateContext, key: string): AcceptedItem[] {
  const report = heldReport(context, key);
  if (report?.schemaVersion !== 2) return [];
  const activity = context.record.completionAudits!.activities.find(a => auditKey(a) === key)!;
  const accepted = hasEffectiveResult(activity) && effectiveAudit(context.stateDirectory, activity)?.source === "accepted";
  const ledger = accepted ? personItems(context.stateDirectory, context.record.completionAudits!.activities, activity.sequence + 1) : undefined;
  const before = personItems(context.stateDirectory, context.record.completionAudits!.activities, activity.sequence);
  const fresh = ledger?.outstanding.filter(item => item.listedByActivityId === activity.activityId) ?? [];
  let next = 0;
  return report.needsYou.map(entry => {
    const known = entry.id ? before.outstanding.find(item => item.id === entry.id) : undefined;
    const id = entry.id ?? (accepted ? fresh[next++]?.id : undefined);
    const criterion = entry.criterion ?? known?.criterion;
    return { ...(id ? { id } : {}), ...(criterion ? { criterion } : {}), name: itemName({ ...(criterion ? { criterion } : {}), problem: entry.problem }), problem: entry.problem, action: entry.action };
  });
}

