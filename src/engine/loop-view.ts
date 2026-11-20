/**
 * What the screens and `kiln status` show of the audit loops (Kiln Deliver When Audit Loops Run Out
 * technical design, "Interfaces" and "The Status Line"): the settings, each kind's runs against its
 * limit in force, and where the run is during the closing audits. Every limit shown is the limit in
 * force; nothing marks a last loop, the numbers show it.
 *
 *   auditLoopsView(engine).position   // { audit: "delivery", loop: 2, limit: 4 }
 */
import { auditKey } from "../audit/workflow.js";
import { closedKinds, countedLoops, limitFloor, limitOf, limitsInForce, loopSettings, loopsUsed, type AuditLoopSettings, type LoopKind } from "../state/audit-loops.js";
import type { Engine } from "./engine.js";

export interface ActivityLoopView {
  kind: LoopKind;
  number: number;
  /** The limit in force. */
  limit: number;
}

export interface LoopPosition {
  audit: LoopKind;
  loop: number;
  limit: number;
  /** A session of test fixes: the loop is the latest test loop. */
  fixing?: true;
}

export interface AuditLoopsView {
  /** The limits saved in the run's settings. */
  settings: AuditLoopSettings;
  delivery: { used: number; limit: number; closed: boolean; floor: number };
  test: { used: number; limit: number; closed: boolean; floor: number };
  /** `atPullRequest` is written: a change applies to a continuation. */
  frozen?: { at: string };
  position?: LoopPosition;
}

/** The loop an audit activity is, with the limit in force, if it is one (a continuation and an audit completed at once are not). */
export function activityLoops(engine: Engine, key: string): ActivityLoopView[] | undefined {
  const { record } = engine;
  const loop = record.auditLoops?.loops.findLast(one => one.activityKey === key);
  if (!loop || !countedLoops(record.auditLoops, loop.kind).includes(loop)) return undefined;
  return [{ kind: loop.kind, number: loop.number, limit: limitOf(limitsInForce(record), loop.kind) }];
}

/** Where the run is (AC-STOP-05): an audit's loop, a session of test fixes' latest test loop, or at a stop the latest loop counted. */
export function loopPosition(engine: Engine): LoopPosition | undefined {
  const { record } = engine;
  const ledger = record.auditLoops;
  if (!ledger) return undefined;
  const limits = limitsInForce(record);
  const at = (kind: LoopKind, number: number, fixing = false): LoopPosition => ({ audit: kind, loop: number, limit: limitOf(limits, kind), ...(fixing ? { fixing: true as const } : {}) });
  const latest = (kind?: LoopKind) => {
    const counted = [...countedLoops(ledger, "delivery"), ...countedLoops(ledger, "test")].filter(one => !kind || one.kind === kind);
    return counted.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || ledger.loops.indexOf(a) - ledger.loops.indexOf(b)).at(-1);
  };
  const stopped = engine.stoppedPhaseKey();
  if (stopped !== undefined) {
    const one = latest();
    return one ? at(one.kind, one.number) : undefined;
  }
  const key = engine.current?.phaseKey;
  const audit = key ? engine.auditActivity(key) : undefined;
  if (!audit) return undefined;
  const own = ledger.loops.findLast(one => one.activityKey === auditKey(audit));
  if (own && countedLoops(ledger, own.kind).includes(own)) return at(own.kind, own.number);
  if (audit.kind === "test_audit" && audit.continuationIndex > 1) {
    const test = latest("test");
    return test ? at("test", test.number, true) : undefined;
  }
  return undefined;
}

/** The settings, each kind's count and floor, and the position (AC-STOP-05, AC-BOT-02). */
export function auditLoopsView(engine: Engine): AuditLoopsView {
  const { record } = engine;
  const limits = limitsInForce(record);
  const closed = closedKinds(record);
  const ledger = record.auditLoops;
  const kind = (one: LoopKind) => ({ used: loopsUsed(ledger, one), limit: limitOf(limits, one), closed: closed[one], floor: limitFloor(record, one) });
  const position = loopPosition(engine);
  return {
    settings: loopSettings(record.settings),
    delivery: kind("delivery"),
    test: kind("test"),
    ...(ledger?.atPullRequest ? { frozen: { at: ledger.atPullRequest.at } } : {}),
    ...(position ? { position } : {}),
  };
}

/** "Delivery audit loop 2 of 4", "Fixing tests from test audit loop 2 of 4" (AC-STOP-05). */
export function positionText(position: LoopPosition): string {
  const name = `${position.audit === "delivery" ? "delivery" : "test"} audit loop ${position.loop} of ${position.limit}`;
  return position.fixing ? `Fixing tests from ${name}` : `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}
