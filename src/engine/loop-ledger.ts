/**
 * The loop ledger of a run carried over from schema 21 (Kiln Audit Loop Limits technical design,
 * "Upgrade"; AC-LOOP-07, RUN-002): rebuilt from the run's own execution's saved audit history,
 * never an archived execution's, with one `upgrade` epoch per kind at the run's start. Every
 * loop is `observed`, takes the migrated limit 3 and is never the last.
 *
 *   record.auditLoops = reconstructLedger({ record, stateDirectory });
 */
import { auditKey, effectiveAudit } from "../audit/workflow.js";
import { hasEffectiveResult } from "../audit/effective-result.js";
import { AuditStore } from "../audit/storage.js";
import { recordedLeaves } from "./plan-reading.js";
import { atOrUnder, DEFAULT_LOOP_LIMIT, emptyLedger, type AfterLastTestSource, type AuditLoop, type AuditLoopLedger } from "../state/audit-loops.js";
import type { GateContext } from "./loop-gate.js";

export function reconstructLedger(context: GateContext): AuditLoopLedger {
  const { record, stateDirectory } = context;
  const at = record.startedAt ?? new Date().toISOString();
  const ledger = emptyLedger();
  ledger.epochs.push({ kind: "delivery", at, cause: "upgrade", loopsBefore: 0 }, { kind: "test", at, cause: "upgrade", loopsBefore: 0 });
  const store = new AuditStore(stateDirectory);
  const activities = [...(record.completionAudits?.activities ?? [])].sort((a, b) => a.sequence - b.sequence);
  const settled = activities.filter(a => record.phases[auditKey(a)]?.doneAt && hasEffectiveResult(a));
  const leaves = recordedLeaves(record.plan ?? []);
  const loops: AuditLoop[] = [];
  const observed = (loop: Omit<AuditLoop, "number" | "limitAtStart" | "last" | "observed">) => {
    loops.push({ ...loop, number: loops.filter(one => one.kind === loop.kind).length + 1, limitAtStart: DEFAULT_LOOP_LIMIT, last: false, observed: true });
  };
  for (const activity of activities) {
    // A delivery loop for each audit whose effective result appended phases a leaf of which has a session or is done.
    if (settled.includes(activity)) {
      const phases = effectiveAudit(stateDirectory, activity, store)!.completionPhases();
      const built = leaves.filter(leaf => phases.some(phase => atOrUnder(leaf.id, phase)) && (record.phases[leaf.id]?.sessionIds.length || record.phases[leaf.id]?.doneAt)).map(leaf => leaf.id);
      if (built.length) observed({ kind: "delivery", startedAt: record.phases[auditKey(activity)]!.doneAt!, sourceAuditId: activity.activityId, activityKeys: built });
    }
    // A test loop for each test audit activity whose latest settled test predecessor counts as continue_test, and
    // whose session ran or is still to run: one completed at once under a waived readiness problem ran none (AC-LOOP-03).
    if (activity.kind === "test_audit" && (activity.sessionIds.length || !settled.includes(activity))) {
      const predecessor = settled.findLast(a => a.kind === "test_audit" && a.sequence < activity.sequence);
      if (predecessor && effectiveAudit(stateDirectory, predecessor, store)?.countedOutcome === "continue_test") observed({ kind: "test", startedAt: activity.createdAt, sourceAuditId: predecessor.activityId, activityKeys: [auditKey(activity)], firstAttempt: 0, ...(activity.sessionIds[0] ? { sessionId: activity.sessionIds[0] } : {}) });
    }
  }
  ledger.loops = loops;
  return ledger;
}

/** Where and when the person chose, for a quoted sentence: "chosen on Documents found, 2026-11-13 09:12 UTC". */
export function sourceText(source: AfterLastTestSource | { via: "browser" | "command_line"; at: string; accept: true } | undefined): string {
  if (!source) return "chosen on Documents found";
  if ("accept" in source) return `given ${source.via === "browser" ? "on the run's page" : "with the command line"} at ${stamp(source.at)}`;
  if (source.kind === "kiln_for_earlier_run") return "applied by Kiln because this run began before the setting existed";
  const where = source.where === "documents_found" ? "on Documents found" : source.where === "run_page" ? "on the run's page" : "with kiln settings";
  return `chosen ${where} at ${stamp(source.at)}`;
}

const stamp = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
