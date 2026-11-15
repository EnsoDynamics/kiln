/**
 * What the screens and `kiln status` show of the audit loops (Kiln Audit Loop Limits technical
 * design, "Display Contract" and "Snapshot and `kiln status`"): the settings and counts, each
 * activity's loops, and a loop stop's page, with no judgment of Kiln's about which items matter.
 *
 *   auditLoopsView(engine).stop?.heading   // "Delivery audit loops used: 3 of 3"
 */
import { auditKey, auditLabel, effectiveAudit, hasEffectiveResult } from "../audit/workflow.js";
import type { AuditActivity, AuditReport, AuditResult } from "../audit/contracts.js";
import { AuditStore } from "../audit/storage.js";
import { countedLoops, limitOf, loopSettings, loopsUsed, acceptSentence, type AuditLoop, type AuditLoopSettings, type LoopKind } from "../state/audit-loops.js";
import { PR_PHASE_KEY, type SessionRecord } from "../state/records.js";
import { runTiming } from "../session/timing.js";
import { heldReport, listedItems } from "./loop-gate.js";
import type { Engine } from "./engine.js";

export interface ActivityLoopView {
  number: number;
  limit: number;
  last: boolean;
  sessionId?: string;
  observed?: true;
  startedAt: string;
  durationMs: number;
  /** The outcome in words, then the report's summary; a delivery loop names the phases it built. */
  did?: string;
}

export interface AuditLoopsView {
  settings: AuditLoopSettings;
  delivery: { used: number; limit: number };
  test: { used: number; limit: number };
  stop?: {
    kind: LoopKind;
    reason: "phases_added" | "test_work_saved" | "items_listed";
    heldAuditKey: string;
    /** A hold: the report added phases or saved test work (AC-STOP-02). */
    holds: boolean;
    heading: string;
    loops: { label: string; activity: string; did?: string; durationMs: number; observed?: true }[];
    audit: { summary?: string; items: { name: string; problem: string; action: string }[] };
    afterLastTest?: AuditLoopSettings["afterLastTest"];
    acceptSentence?: string;
  };
}

const OBSERVED = "counted from this run's history when Kiln was upgraded";

/** "loop 2 of 3", or "last loop". */
export const loopLabel = (loop: Pick<AuditLoop, "number" | "limitAtStart" | "last">) => loop.last ? "last loop" : `loop ${loop.number} of ${loop.limitAtStart}`;

function sessionsOf(engine: Engine, key: string): SessionRecord[] {
  return (engine.record.phases[key]?.sessionIds ?? []).map(id => engine.sessionRecord(key, id)).filter((s): s is SessionRecord => !!s);
}

function durationOf(engine: Engine, keys: string[], sessionFilter?: (session: SessionRecord, key: string) => boolean): number {
  const runs = keys.flatMap(key => sessionsOf(engine, key).filter(session => !sessionFilter || sessionFilter(session, key)).flatMap(session => session.runs));
  if (!runs.length) return 0;
  const from = runs.map(run => run.startedAt).sort()[0]!;
  const until = runs.map(run => run.endedAt ?? run.interruptedAt ?? new Date().toISOString()).sort().at(-1)!;
  return runTiming(runs, from, until).runningMs;
}

function outcomeWords(outcome: string | undefined): string | undefined {
  return outcome === "passed" ? "Passed" : outcome === "completion_phases" ? "Added phases" : outcome === "continue_test" ? "Saved test work" : outcome === "needs_you" ? "Needs you" : undefined;
}

/** The sessions a test loop owns on its activity: from its own marker up to the next loop's on the same activity. */
function loopSessions(engine: Engine, loop: AuditLoop, key: string): Set<string> {
  const ids = engine.record.phases[key]?.sessionIds ?? [];
  const markers = (engine.record.auditLoops?.loops ?? []).filter(one => one.kind === "test" && one.activityKeys.includes(key) && one.sessionId).map(one => ids.indexOf(one.sessionId!)).filter(i => i >= 0).sort((a, b) => a - b);
  const start = loop.sessionId ? ids.indexOf(loop.sessionId) : 0;
  const end = markers.find(i => i > start) ?? ids.length;
  return new Set(ids.slice(Math.max(0, start), end));
}

/** What a loop did: a delivery loop's phases, a test loop's latest report in words. */
function loopDid(engine: Engine, loop: AuditLoop): string | undefined {
  if (loop.kind === "delivery") return `${loop.activityKeys.map(key => `Phase ${engine.judgedId(key)}`).join(", ")} built`;
  const key = loop.activityKeys[0]!;
  const activity = engine.auditActivity(key);
  if (!activity) return undefined;
  // The loop's latest attempt holding a report: an attempt after its first.
  const attempts = activity.attempts.slice(loop.firstAttempt ?? 0);
  const next = (engine.record.auditLoops?.loops ?? []).filter(one => one.kind === "test" && one.activityKeys.includes(key) && one !== loop && (one.firstAttempt ?? 0) > (loop.firstAttempt ?? 0)).map(one => one.firstAttempt!).sort((a, b) => a - b)[0];
  const mine = next === undefined ? attempts : activity.attempts.slice(loop.firstAttempt ?? 0, next);
  return latestReportDid(engine, mine);
}

/** The outcome in words, then the summary, of the latest of these attempts that holds a report. */
function latestReportDid(engine: Engine, attempts: AuditActivity["attempts"]): string | undefined {
  for (const ref of [...attempts].reverse()) {
    try {
      const result = new AuditStore(engine.stateDirectory).read<AuditResult>(ref);
      if (!result.reportBytes) continue;
      const report = JSON.parse(result.reportBytes) as AuditReport;
      const words = outcomeWords(report.outcome);
      const summary = report.schemaVersion === 2 ? report.summary : undefined;
      return [words, summary].filter(Boolean).join(" · ");
    } catch { continue; }
  }
  return undefined;
}

/** The loops an activity row holds, each with the limit in force when it started (AC-SHOW-01). */
export function activityLoops(engine: Engine, key: string): ActivityLoopView[] | undefined {
  const ledger = engine.record.auditLoops;
  if (!ledger || key === PR_PHASE_KEY) return undefined;
  const audit = engine.auditActivity(key);
  const loops = ledger.loops.filter(loop => loop.kind === (audit ? "test" : "delivery") && loop.activityKeys.includes(key));
  if (!loops.length) return undefined;
  return loops.map(loop => ({
    number: loop.number, limit: loop.limitAtStart, last: loop.last,
    ...(loop.sessionId ? { sessionId: loop.sessionId } : {}), ...(loop.observed ? { observed: true as const } : {}),
    startedAt: loop.startedAt,
    durationMs: loop.kind === "delivery" ? durationOf(engine, [key]) : durationOf(engine, [key], session => loopSessions(engine, loop, key).has(session.sessionId)),
    ...(() => { const did = loopDid(engine, loop); return did ? { did: loop.observed ? `${did} (${OBSERVED})` : did } : loop.observed ? { did: OBSERVED } : {}; })(),
  }));
}

/** The settings, the counts and, at a loop stop, its page (AC-STOP-01). */
export function auditLoopsView(engine: Engine): AuditLoopsView {
  const { record } = engine;
  const settings = loopSettings(record.settings);
  const ledger = record.auditLoops;
  const view: AuditLoopsView = {
    settings,
    delivery: { used: loopsUsed(ledger, "delivery"), limit: settings.deliveryLimit },
    test: { used: loopsUsed(ledger, "test"), limit: settings.testLimit },
  };
  const key = engine.stoppedPhaseKey();
  const loop = engine.loopStopOf(key);
  if (!key || !loop) return view;
  const used = loopsUsed(ledger, loop.kind);
  const counted = countedLoops(ledger, loop.kind);
  const lines: NonNullable<AuditLoopsView["stop"]>["loops"] = counted.map(one => {
    const did = loopDid(engine, one);
    const durationMs = one.kind === "delivery" ? durationOf(engine, one.activityKeys) : durationOf(engine, [one.activityKeys[0]!], session => loopSessions(engine, one, one.activityKeys[0]!).has(session.sessionId));
    const activity = one.kind === "delivery" ? one.activityKeys.map(k => `Phase ${engine.judgedId(k)}`).join(", ") : auditLabel("test_audit");
    return { label: `${one.last ? "Last loop" : `Loop ${one.number} of ${one.limitAtStart}`}${one.observed ? ` (${OBSERVED})` : ""}`, activity, ...(did ? { did } : {}), durationMs, ...(one.observed ? { observed: true as const } : {}) };
  });
  // Each audit session since the first counted loop started (or all after the epoch, when none was counted).
  const since = counted[0]?.startedAt ?? "";
  const countedAudits = new Set(counted.flatMap(one => one.kind === "test" ? one.activityKeys : []));
  for (const audit of record.completionAudits?.activities ?? []) {
    const akey = auditKey(audit);
    if (audit.createdAt < since || countedAudits.has(akey) || !audit.sessionIds.length) continue;
    lines.push({ label: auditLabel(audit.kind), activity: auditLabel(audit.kind), ...optionalDid(engine, audit), durationMs: durationOf(engine, [akey]) });
  }
  const report = heldReport(engine.gateContext, key);
  const items = listedItems(engine.gateContext, key);
  view.stop = {
    kind: loop.kind, reason: loop.reason, heldAuditKey: key, holds: loop.reason !== "items_listed",
    heading: `${loop.kind === "delivery" ? "Delivery" : "Test"} audit loops used: ${used} of ${limitOf(settings, loop.kind)}`,
    loops: lines,
    audit: { ...(report?.schemaVersion === 2 ? { summary: report.summary } : {}), items: items.map(item => ({ name: item.name, problem: item.problem, action: item.action })) },
    ...(loop.kind === "test" ? { afterLastTest: settings.afterLastTest, acceptSentence: acceptSentence(items) } : {}),
  };
  return view;
}

/** What an audit session since the first loop did: its effective result, or, with none accepted or waived yet, its latest report (AC-STOP-01). */
function optionalDid(engine: Engine, audit: AuditActivity): { did?: string } {
  if (!hasEffectiveResult(audit)) { const did = latestReportDid(engine, audit.attempts); return did ? { did } : {}; }
  try {
    const effective = effectiveAudit(engine.stateDirectory, audit);
    const phases = effective?.completionPhases() ?? [];
    const words = phases.length ? `added ${phases.map(id => `Phase ${id}`).join(", ")}` : outcomeWords(effective?.outcome)?.toLowerCase();
    return words ? { did: words } : {};
  } catch { return {}; }
}
