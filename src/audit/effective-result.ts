/**
 * One reading of an audit's result for every reader that routes on it (waivers "Audits Marked
 * Complete", AC-WAIVE-12): the accepted result, or the audit-waiver result an audit marked
 * complete was given. Scheduling, currentness, continuation admission, completion, prompt
 * history and display read this instead of the accepted result alone.
 *
 *   const effective = effectiveAudit(stateDirectory, activity);
 *   // { source: "waiver", report: "none", outcome: "passed", countedOutcome: "passed", changedImplementation: false, … }
 */
import type { AuditCountedOutcome, AuditWaiverResult } from "../engine/waivers.js";
import { AuditRefusal, completionPhaseIds, requireAudit, type AuditActivity, type AuditReport, type AuditResult, type WorkSnapshot } from "./contracts.js";
import { AuditStore } from "./storage.js";

export function acceptedAudit(stateDirectory: string, activity: AuditActivity, store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): { result: AuditResult; report: AuditReport } | undefined {
  if (!activity.acceptedResult) return undefined;
  const result = store.read<AuditResult>(activity.acceptedResult);
  if (result.activityId !== activity.activityId || result.disposition !== "recorded") throw new AuditRefusal("missing_evidence", `Invalid accepted audit result for ${activity.reportPath}.`);
  return { result, report: JSON.parse(result.reportBytes) as AuditReport };
}

/** Whether an audit has a result to route on, accepted or waived, without reading the store. */
export const hasEffectiveResult = (activity: Pick<AuditActivity, "acceptedResult" | "waivedResult">): boolean => !!(activity.acceptedResult || activity.waivedResult);

export interface EffectiveAudit {
  source: "accepted" | "waiver";
  /** Which report the result rests on: an accepted one, a valid one that was not accepted, or none usable. */
  report: "accepted" | "valid" | "none";
  /**
   * What routing reads, exactly as an accepted outcome routes today: an accepted result's own
   * outcome (a version-1 `blocked` included), a waiver result's counted outcome.
   */
  outcome: AuditReport["outcome"];
  countedOutcome: AuditCountedOutcome;
  /** Test audits that state it: whether the audit changed anything other than tests and records. Undefined for delivery audits and version-1 results. */
  changedImplementation?: boolean;
  /** The report's bytes and digest when there is one; the portable report must still match the digest. */
  reportBytes?: string;
  reportDigest?: string;
  parsed?: AuditReport;
  result?: AuditResult;
  waiver?: AuditWaiverResult;
  /** The snapshot currentness is measured from: the accepted snapshot, or the waiver's `snapshotRef`. */
  snapshot(): WorkSnapshot;
  /** The completion phases the audit appended: its report's, or with no usable report, those its waiver snapshot's plan holds beyond its initial snapshot. */
  completionPhases(): string[];
}

/** Needing a person (and a version-1 blocker) counts as passed once a person marks the audit complete (AC-WAIVE-12). */
export function countedOutcome(outcome: AuditReport["outcome"]): AuditCountedOutcome {
  return outcome === "completion_phases" || outcome === "continue_test" ? outcome : "passed";
}

/**
 * The accepted result, or the audit-waiver result when the audit was marked complete. A waiver
 * result takes precedence: an audit is waived only while not complete, and its waiver snapshot,
 * not the earlier accepted one, is what a waived "Audit evidence is current" was judged against.
 */
export function effectiveAudit(stateDirectory: string, activity: AuditActivity, store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): EffectiveAudit | undefined {
  if (activity.waivedResult) {
    const waiver = store.read<AuditWaiverResult>(activity.waivedResult);
    if (waiver.kind !== "audit_waiver" || waiver.activityId !== activity.activityId) throw new AuditRefusal("missing_evidence", `Invalid audit waiver result for ${activity.reportPath}.`);
    const parsed = waiver.reportBytes !== undefined ? JSON.parse(waiver.reportBytes) as AuditReport : undefined;
    return {
      source: "waiver", report: waiver.report, outcome: waiver.countedOutcome, countedOutcome: waiver.countedOutcome,
      ...(waiver.countedChangedImplementation !== undefined ? { changedImplementation: waiver.countedChangedImplementation } : {}),
      ...(waiver.reportBytes !== undefined ? { reportBytes: waiver.reportBytes, reportDigest: waiver.reportDigest! } : {}),
      ...(parsed ? { parsed } : {}), waiver,
      snapshot: () => store.read<WorkSnapshot>(waiver.snapshotRef),
      completionPhases: () => parsed ? completionPhaseIds(parsed) : phasesBeyondInitial(stateDirectory, activity, store.read<WorkSnapshot>(waiver.snapshotRef).plan, store),
    };
  }
  const accepted = acceptedAudit(stateDirectory, activity, store);
  if (!accepted) return undefined;
  const { result, report } = accepted;
  return {
    source: "accepted", report: "accepted", outcome: report.outcome, countedOutcome: countedOutcome(report.outcome),
    ...(report.schemaVersion === 2 && report.changedImplementation !== undefined ? { changedImplementation: report.changedImplementation } : {}),
    reportBytes: result.reportBytes, reportDigest: result.reportDigest, parsed: report, result,
    snapshot: () => {
      const checked = activity.snapshots.map(id => store.read<WorkSnapshot>(id)).find(s => s.id === result.snapshotId);
      requireAudit(checked, "Accepted snapshot is missing.", "missing_evidence");
      return checked;
    },
    completionPhases: () => completionPhaseIds(report),
  };
}

/** The snapshot an audit's currentness is measured from (AC-NEUTRAL-06, AC-WAIVE-12). */
export function effectiveSnapshot(stateDirectory: string, activity: AuditActivity, store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): WorkSnapshot {
  const effective = effectiveAudit(stateDirectory, activity, store);
  requireAudit(effective, "Audit result has not been accepted.", "missing_evidence");
  return effective.snapshot();
}

/**
 * With no usable report, the completion phases an audit appended are those a plan holds beyond
 * the audit's initial snapshot, in that plan's order (AC-WAIVE-12).
 *
 *   phasesBeyondInitial(stateDirectory, activity, plan.phases)   // ["4", "5"]
 */
export function phasesBeyondInitial(stateDirectory: string, activity: AuditActivity, plan: readonly { id: string }[], store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): string[] {
  requireAudit(activity.snapshots[0], `Audit ${activity.reportPath} has no initial snapshot.`, "missing_evidence");
  const initial = new Set(store.read<WorkSnapshot>(activity.snapshots[0]).plan.map(phase => phase.id));
  return plan.filter(phase => !initial.has(phase.id)).map(phase => phase.id);
}

/** How an audit's report counts at a waiver (waivers "Audits Marked Complete" table). */
export interface AuditReportClass {
  report: "accepted" | "valid" | "none";
  countedOutcome: AuditCountedOutcome;
  countedChangedImplementation?: boolean;
  reportBytes?: string;
  reportDigest?: string;
  /** With no usable report: the latest attempt's refusal, or why there is none. */
  reason?: string;
}

/**
 * Classifies the report as it stands at the waiver: accepted; valid but not accepted (the latest
 * attempt passed report validation and failed on Audit work resolved, repository or development
 * checks); or none usable (no attempt, or one refused: missing, unreadable, invalid, a no-progress
 * continuation, a plan that disagrees). The Mark complete preview reads this for its no-report
 * warning and the next step; {@link waiveAudit} saves it.
 */
export function classifyAuditReport(stateDirectory: string, activity: AuditActivity, store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): AuditReportClass {
  const counted = (report: AuditReport, kind: "accepted" | "valid", bytes: string, digest: string): AuditReportClass => {
    const changed = activity.kind === "test_audit" && report.schemaVersion === 2 ? report.changedImplementation : undefined;
    return { report: kind, countedOutcome: countedOutcome(report.outcome), ...(changed !== undefined ? { countedChangedImplementation: changed } : {}), reportBytes: bytes, reportDigest: digest };
  };
  const none = (reason: string): AuditReportClass => ({ report: "none", countedOutcome: "passed", ...(activity.kind === "test_audit" ? { countedChangedImplementation: false } : {}), reason });
  const accepted = acceptedAudit(stateDirectory, activity, store);
  if (accepted) return counted(accepted.report, "accepted", accepted.result.reportBytes, accepted.result.reportDigest);
  const latest = activity.attempts.at(-1);
  if (!latest) return none(`No audit report was submitted at ${activity.reportPath}.`);
  const attempt = store.read<AuditResult>(latest);
  if (attempt.refusal || !attempt.reportBytes) return none(attempt.refusal?.reason ?? `No audit report was read from ${activity.reportPath}.`);
  return counted(JSON.parse(attempt.reportBytes) as AuditReport, "valid", attempt.reportBytes, attempt.reportDigest);
}

export interface AuditWaiverRecorded {
  report: AuditWaiverResult["report"];
  countedOutcome: AuditCountedOutcome;
  countedChangedImplementation?: boolean;
  resultRef: string;
}

function recordWaiverResult(activity: AuditActivity, store: AuditStore, result: Omit<AuditWaiverResult, "kind" | "activityId">): AuditWaiverRecorded {
  if (activity.waivedResult) throw new AuditRefusal("result_conflict", `${activity.reportPath} was already marked complete.`, 409);
  const saved: AuditWaiverResult = { kind: "audit_waiver", activityId: activity.activityId, ...result };
  const resultRef = store.put(saved);
  activity.waivedResult = resultRef;
  return { report: saved.report, countedOutcome: saved.countedOutcome, ...(saved.countedChangedImplementation !== undefined ? { countedChangedImplementation: saved.countedChangedImplementation } : {}), resultRef };
}

/**
 * Marks a stopped audit complete (AC-WAIVE-12): classifies its report, stores the audit-waiver
 * result with `snapshot` (captured during Mark complete's rerun) as the snapshot its currentness
 * is measured from, and sets `activity.waivedResult`. The return value is the waiver's `audit` field.
 * Mutates `activity`; the caller's one record write saves it with the waiver.
 *
 *   waiveAudit(stateDirectory, activity, { waiverId, snapshot: await captureSnapshot({ ...context, activity, now }) })
 *   // { report: "none", countedOutcome: "passed", countedChangedImplementation: false, resultRef: "…" }
 */
export function waiveAudit(stateDirectory: string, activity: AuditActivity, input: { waiverId: string; snapshot: WorkSnapshot }): AuditWaiverRecorded {
  requireAudit(input.snapshot.activityId === activity.activityId, "The waiver snapshot belongs to another audit activity.", "wrong_activity");
  const store = new AuditStore(stateDirectory);
  const classified = classifyAuditReport(stateDirectory, activity, store);
  const snapshotRef = store.put(input.snapshot);
  const recorded = recordWaiverResult(activity, store, {
    waiverId: input.waiverId, report: classified.report, countedOutcome: classified.countedOutcome,
    ...(classified.countedChangedImplementation !== undefined ? { countedChangedImplementation: classified.countedChangedImplementation } : {}),
    ...(classified.reportBytes !== undefined ? { reportBytes: classified.reportBytes, reportDigest: classified.reportDigest! } : {}),
    snapshotRef,
  });
  if (!activity.snapshots.includes(snapshotRef)) activity.snapshots.push(snapshotRef);
  return recorded;
}

/**
 * Completes, with no report, an audit Kiln allocates and completes at once under a waived
 * readiness problem (waivers "Normal Order Under a Waived Problem"). Its currentness is measured
 * from its own initial snapshot, captured at allocation.
 */
export function waiveUnstartedAudit(stateDirectory: string, activity: AuditActivity, waiverId: string): AuditWaiverRecorded {
  requireAudit(activity.snapshots[0], `Audit ${activity.reportPath} has no initial snapshot.`, "missing_evidence");
  requireAudit(!activity.acceptedResult && !activity.attempts.length, "Only an audit that has not submitted a report completes with none.", "result_conflict");
  return recordWaiverResult(activity, new AuditStore(stateDirectory), {
    waiverId, report: "none", countedOutcome: "passed",
    ...(activity.kind === "test_audit" ? { countedChangedImplementation: false } : {}),
    snapshotRef: activity.snapshots[0],
  });
}
