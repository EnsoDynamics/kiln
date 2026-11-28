/**
 * The audit loop settings and ledger (Kiln Deliver When Audit Loops Run Out technical design,
 * "Settings" and "Loops and the Ledger"). A loop is one run of an audit: the ledger, append-only
 * on the PRD record, counts each delivery audit and each test audit that is not a continuation
 * when Kiln allocates it. Nothing stops for a count; a kind whose runs reach its limit in force
 * is closed, and routing allocates no new audit of that kind.
 *
 *   loopSettings(record.settings)               // { deliveryLimit: 4, testLimit: 4 }
 *   loopsUsed(record.auditLoops, "test")        // 2
 *   closedKinds(record)                         // { delivery: true, test: false }
 */

export type LoopKind = "delivery" | "test";

export interface AuditLoopSettings {
  /** Max delivery audit loops. */
  deliveryLimit: number;
  /** Max test audit loops. */
  testLimit: number;
}

export const DEFAULT_LOOP_LIMIT = 4;

export function defaultLoopSettings(): AuditLoopSettings {
  return { deliveryLimit: DEFAULT_LOOP_LIMIT, testLimit: DEFAULT_LOOP_LIMIT };
}

/** A record's loop settings; a record that has none (not started, from before the feature) reads the defaults. */
export function loopSettings(settings: { auditLoops?: AuditLoopSettings }): AuditLoopSettings {
  const saved = settings.auditLoops;
  return saved ? { deliveryLimit: saved.deliveryLimit, testLimit: saved.testLimit } : defaultLoopSettings();
}

/** A limit is a whole number of 1 or more; nothing is clamped (technical design, "Settings"). */
export const validLimit = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;

export interface AuditLoopEpoch {
  kind: LoopKind;
  at: string;
  /** Only `start` epochs are written: the first Start, a continuation's activation and a base-branch Start. */
  cause: "start";
  /** How many loops of this kind the ledger held when the epoch opened; the count is those after it. */
  loopsBefore: number;
}

/** One run of an audit. */
export interface AuditLoop {
  kind: LoopKind;
  /** 1-based within its epoch. */
  number: number;
  startedAt: string;
  /** The audit activity that is this run. */
  activityKey: string;
}

export interface AuditLoopLedger {
  epochs: AuditLoopEpoch[];
  loops: AuditLoop[];
  /** The limits held for the rest of the execution, written once when the first pull request session launches or the run completes. */
  atPullRequest?: { at: string; deliveryLimit: number; testLimit: number };
}

export function emptyLedger(): AuditLoopLedger {
  return { epochs: [], loops: [] };
}

/** A new execution's ledger: one `start` epoch per kind (AC-LAST-02). */
export function startedLedger(at: string): AuditLoopLedger {
  return { epochs: [{ kind: "delivery", at, cause: "start", loopsBefore: 0 }, { kind: "test", at, cause: "start", loopsBefore: 0 }], loops: [] };
}

/** The loops of a kind counted since its latest epoch. */
export function countedLoops(ledger: AuditLoopLedger | undefined, kind: LoopKind): AuditLoop[] {
  if (!ledger) return [];
  const all = ledger.loops.filter(loop => loop.kind === kind);
  return all.slice(ledger.epochs.findLast(epoch => epoch.kind === kind)?.loopsBefore ?? 0);
}

export const loopsUsed = (ledger: AuditLoopLedger | undefined, kind: LoopKind): number => countedLoops(ledger, kind).length;

export function limitOf(settings: AuditLoopSettings, kind: LoopKind): number {
  return kind === "delivery" ? settings.deliveryLimit : settings.testLimit;
}

/** The limits every decision and display of the run reads: `atPullRequest` once written, otherwise `Settings`. */
export function limitsInForce(record: { settings: { auditLoops?: AuditLoopSettings }; auditLoops?: AuditLoopLedger }): AuditLoopSettings {
  const frozen = record.auditLoops?.atPullRequest;
  return frozen ? { deliveryLimit: frozen.deliveryLimit, testLimit: frozen.testLimit } : loopSettings(record.settings);
}

/** Whether a kind's loops have reached its limit in force; a kind with no loop is never closed. */
export function kindClosed(record: Parameters<typeof limitsInForce>[0], kind: LoopKind): boolean {
  return loopsUsed(record.auditLoops, kind) >= limitOf(limitsInForce(record), kind);
}

export function closedKinds(record: Parameters<typeof limitsInForce>[0]): { delivery: boolean; test: boolean } {
  return { delivery: kindClosed(record, "delivery"), test: kindClosed(record, "test") };
}

/** Each kind's loops used and limit in force: what **Closing audits** shows on a delivered run (AC-LEFT-01, AC-LEFT-02). */
export interface ClosingAudits { delivery: { used: number; limit: number }; test: { used: number; limit: number } }
export function closingAudits(record: Parameters<typeof limitsInForce>[0]): ClosingAudits {
  const limits = limitsInForce(record);
  const kind = (one: LoopKind) => ({ used: loopsUsed(record.auditLoops, one), limit: limitOf(limits, one) });
  return { delivery: kind("delivery"), test: kind("test") };
}

/**
 * The lowest value a limit may be set to: the runs of that audit already made in this execution,
 * the one under way included; 1 once `atPullRequest` is written, since nothing in this execution
 * reads `Settings` again and a continuation starts with an empty ledger.
 */
export function limitFloor(record: Parameters<typeof limitsInForce>[0], kind: LoopKind): number {
  if (record.auditLoops?.atPullRequest) return 1;
  return Math.max(1, loopsUsed(record.auditLoops, kind));
}

/** Appends a loop counted against the current epoch, with its number. */
export function appendLoop(ledger: AuditLoopLedger, loop: Omit<AuditLoop, "number">): AuditLoop {
  const added: AuditLoop = { ...loop, number: loopsUsed(ledger, loop.kind) + 1 };
  ledger.loops.push(added);
  return added;
}

export function assertAuditLoopSettings(value: unknown): void {
  if (value === undefined) return;
  const v = value as Partial<AuditLoopSettings>;
  if (!v || typeof v !== "object" || !validLimit(v.deliveryLimit) || !validLimit(v.testLimit)) throw new Error("Malformed audit loop settings.");
}

export function assertLedger(value: unknown): void {
  if (value === undefined) return;
  const v = value as Partial<AuditLoopLedger>;
  if (!v || typeof v !== "object" || !Array.isArray(v.epochs) || !Array.isArray(v.loops)) throw new Error("Malformed audit loop ledger.");
  for (const epoch of v.epochs) if (!["delivery", "test"].includes(epoch.kind) || epoch.cause !== "start" || !Number.isSafeInteger(epoch.loopsBefore)) throw new Error("Malformed audit loop epoch.");
  for (const loop of v.loops) if (!["delivery", "test"].includes(loop.kind) || !Number.isSafeInteger(loop.number) || typeof loop.activityKey !== "string") throw new Error("Malformed audit loop.");
  const frozen = v.atPullRequest;
  if (frozen !== undefined && (typeof frozen.at !== "string" || !validLimit(frozen.deliveryLimit) || !validLimit(frozen.testLimit))) throw new Error("Malformed audit loop limits at the pull request.");
}

/**
 * The ledger an older record's loops rebuild into (technical design, "Upgrade"): one loop per
 * delivery audit, and per test audit that is not a continuation, of the current execution in
 * sequence order, that has a session or is not yet settled. Epochs other than `start` and the
 * released acceptances are dropped; a ledger with no `start` epoch gets one per kind at `at`.
 */
export function rebuiltLedger(
  record: { phases: Record<string, { sessionIds: string[]; doneAt?: string }>; completionAudits?: { activities: { activityId: string; sequence: number; kind: string; continuationIndex: number; sessionIds: string[]; createdAt: string }[] } },
  epochs: { kind: string; at: string; cause: string; loopsBefore: number }[] | undefined,
  at: string,
): AuditLoopLedger {
  const ledger = emptyLedger();
  for (const kind of ["delivery", "test"] as const) {
    const start = epochs?.findLast(epoch => epoch.kind === kind && epoch.cause === "start");
    ledger.epochs.push({ kind, at: start?.at ?? at, cause: "start", loopsBefore: 0 });
  }
  const activities = [...(record.completionAudits?.activities ?? [])].sort((a, b) => a.sequence - b.sequence);
  for (const activity of activities) {
    const kind: LoopKind | undefined = activity.kind === "delivery_audit" ? "delivery" : activity.kind === "test_audit" && activity.continuationIndex === 1 ? "test" : undefined;
    const key = `audit-${activity.activityId}`;
    if (!kind || !(activity.sessionIds.length || !record.phases[key]?.doneAt)) continue;
    appendLoop(ledger, { kind, startedAt: activity.createdAt, activityKey: key });
  }
  return ledger;
}

/** The one line a `loop_limit` stop saved by Kiln 1.3.0 shows; its Check again always clears it ("Upgrade"). */
export const LOOP_STOP_LINE = "Kiln no longer stops at a loop limit. Check again to go on.";

/** The refusal `kiln allow-more-loops`, `kiln accept-and-deliver` and the journal give for the removed loop stop controls (AC-STOP-04). */
export const REMOVED_LOOP_COMMAND = "Kiln no longer stops at a loop limit. Change the limits with kiln settings.";

/** The refusal for the removed After the last test audit loop setting (AC-STOP-04). */
export const REMOVED_LOOP_SETTING = "After the last test audit loop was removed: Kiln no longer stops at a loop limit. Change the limits with kiln settings.";
