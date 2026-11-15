/**
 * The audit loop settings and ledger (Kiln Audit Loop Limits technical design, "Settings" and
 * "The Loop Ledger"). Settings say how many delivery and test audit loops Kiln makes on its own
 * and what happens after the last test audit loop; the ledger, append-only on the PRD record,
 * counts the loops Kiln has started since each count last began.
 *
 *   loopSettings(record.settings)        // { deliveryLimit: 3, testLimit: 3, afterLastTest: "deliver_unless_serious" }
 *   loopsUsed(record.auditLoops, "test") // 2
 */

import { isAncestorOf } from "../plan/phase-ids.js";

export type AfterLastTest = "deliver_unless_serious" | "stop_and_ask";
export type LoopKind = "delivery" | "test";

/** What made `afterLastTest` what it is: the person, where and when, or Kiln for a run begun before the setting (AC-LOOP-07). */
export type AfterLastTestSource =
  | { kind: "person"; at: string; where: "documents_found" | "run_page" | "command_line" }
  | { kind: "kiln_for_earlier_run" };

export interface AuditLoopSettings {
  deliveryLimit: number;
  testLimit: number;
  afterLastTest: AfterLastTest;
  afterLastTestSource?: AfterLastTestSource;
}

export const DEFAULT_LOOP_LIMIT = 3;

export function defaultLoopSettings(): AuditLoopSettings {
  return { deliveryLimit: DEFAULT_LOOP_LIMIT, testLimit: DEFAULT_LOOP_LIMIT, afterLastTest: "deliver_unless_serious" };
}

/** A record's loop settings; a record that has none (not started, from before the feature) reads the defaults. */
export function loopSettings(settings: { auditLoops?: AuditLoopSettings }): AuditLoopSettings {
  return settings.auditLoops ?? defaultLoopSettings();
}

/** A limit is a whole number of 1 or more; nothing is clamped (technical design, "Settings"). */
export const validLimit = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
export const validAfterLastTest = (value: unknown): value is AfterLastTest => value === "deliver_unless_serious" || value === "stop_and_ask";

export interface AuditLoopEpoch {
  kind: LoopKind;
  at: string;
  cause: "start" | "allowed" | "upgrade";
  /** Allowed: the limit the person set. */
  limit?: number;
  /** Allowed: the held audit key of the stop it cleared. */
  heldAuditKey?: string;
  /** How many loops of this kind the ledger held when the epoch opened; the count is those after it. */
  loopsBefore: number;
}

export interface AuditLoop {
  kind: LoopKind;
  /** 1-based within its epoch. */
  number: number;
  /** The limit in force when it started. */
  limitAtStart: number;
  /** `number === limitAtStart`; false on an observed loop. */
  last: boolean;
  startedAt: string;
  /** The audit whose report this loop acts on. */
  sourceAuditId: string;
  /** Delivery: the leaves built in the loop; test: the audit activity. */
  activityKeys: string[];
  /** Test: the session that is the loop. */
  sessionId?: string;
  /** Test: the activity's `attempts.length` when the loop started. */
  firstAttempt?: number;
  /** Reconstructed at upgrade (AC-LOOP-07, RUN-002). */
  observed?: true;
}

export interface AcceptedItem { id?: string; criterion?: string; name: string; problem: string; action: string }

/** One per Accept the person gave (AC-STOP-02). */
export interface Acceptance {
  at: string;
  via: "browser" | "command_line";
  heldAuditKey: string;
  sentence: string;
  items: AcceptedItem[];
  /** The test audit it started; unused while absent. */
  activityKey?: string;
  sessionId?: string;
  firstAttempt?: number;
}

export interface AuditLoopLedger {
  epochs: AuditLoopEpoch[];
  loops: AuditLoop[];
  acceptances: Acceptance[];
  /** Audit keys of each `items_listed` stop on an accepted report. */
  itemsListedStops: string[];
}

export function emptyLedger(): AuditLoopLedger {
  return { epochs: [], loops: [], acceptances: [], itemsListedStops: [] };
}

/** A new execution's ledger: one `start` epoch per kind (AC-LOOP-04). */
export function startedLedger(at: string): AuditLoopLedger {
  return { ...emptyLedger(), epochs: [{ kind: "delivery", at, cause: "start", loopsBefore: 0 }, { kind: "test", at, cause: "start", loopsBefore: 0 }] };
}

/** The latest epoch of a kind, if any. */
export function latestEpoch(ledger: AuditLoopLedger | undefined, kind: LoopKind): AuditLoopEpoch | undefined {
  return ledger?.epochs.findLast(epoch => epoch.kind === kind);
}

/** The loops of a kind counted since its latest epoch. */
export function countedLoops(ledger: AuditLoopLedger | undefined, kind: LoopKind): AuditLoop[] {
  if (!ledger) return [];
  const all = ledger.loops.filter(loop => loop.kind === kind);
  return all.slice(latestEpoch(ledger, kind)?.loopsBefore ?? 0);
}

export const loopsUsed = (ledger: AuditLoopLedger | undefined, kind: LoopKind): number => countedLoops(ledger, kind).length;

export function limitOf(settings: AuditLoopSettings, kind: LoopKind): number {
  return kind === "delivery" ? settings.deliveryLimit : settings.testLimit;
}

/** Whether one more loop of this kind may start under the current limit (AC-LOOP-05). */
export function loopLeft(ledger: AuditLoopLedger | undefined, settings: AuditLoopSettings, kind: LoopKind): boolean {
  return loopsUsed(ledger, kind) < limitOf(settings, kind);
}

/** Appends a loop counted against the current epoch, with its number and whether it is the last. */
export function appendLoop(ledger: AuditLoopLedger, settings: AuditLoopSettings, loop: Omit<AuditLoop, "number" | "limitAtStart" | "last">): AuditLoop {
  const limit = limitOf(settings, loop.kind);
  const number = loopsUsed(ledger, loop.kind) + 1;
  // At or past the limit: a loop decided on before the limit was lowered is still the last one (AC-LOOP-05).
  const added: AuditLoop = { ...loop, number, limitAtStart: limit, last: number >= limit };
  ledger.loops.push(added);
  return added;
}

/** Opens an epoch: the count of that kind starts again from zero. */
export function openEpoch(ledger: AuditLoopLedger, epoch: Omit<AuditLoopEpoch, "loopsBefore">): void {
  ledger.epochs.push({ ...epoch, loopsBefore: ledger.loops.filter(loop => loop.kind === epoch.kind).length });
}

/** Whether a phase id is the phase or one of its children under the positional scheme (`2`, `2a`, `2a1`). */
export function atOrUnder(leafId: string, phaseId: string): boolean {
  return leafId === phaseId || isAncestorOf(phaseId, leafId);
}

/** "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export const SETTING_SENTENCE = "I accept the remaining Weak rows after the last test audit loop.";

/** The Accept sentence (AC-LOOP-06): each listed item by its criterion's ID, else its outstanding id, else its problem. */
export function acceptSentence(items: Pick<AcceptedItem, "name">[]): string {
  if (!items.length) return "I accept the remaining Weak rows.";
  return `I accept the remaining Weak rows, and ${joinNames(items.map(item => item.name))}.`;
}

/** The name an Accept sentence gives an item: its criterion's ID (the entry's, else the outstanding item's), else the audit's own words. */
export function itemName(item: { criterion?: string; problem: string }): string {
  return item.criterion ?? item.problem.replace(/[.\s]+$/, "");
}

export function assertAuditLoopSettings(value: unknown): void {
  if (value === undefined) return;
  const v = value as Partial<AuditLoopSettings>;
  if (!v || typeof v !== "object" || !validLimit(v.deliveryLimit) || !validLimit(v.testLimit) || !validAfterLastTest(v.afterLastTest)) throw new Error("Malformed audit loop settings.");
  const source = v.afterLastTestSource;
  if (source !== undefined && !(source.kind === "kiln_for_earlier_run" || source.kind === "person" && Number.isFinite(Date.parse(source.at)) && ["documents_found", "run_page", "command_line"].includes(source.where))) throw new Error("Malformed audit loop setting source.");
}

export function assertLedger(value: unknown): void {
  if (value === undefined) return;
  const v = value as Partial<AuditLoopLedger>;
  if (!v || typeof v !== "object" || !Array.isArray(v.epochs) || !Array.isArray(v.loops) || !Array.isArray(v.acceptances) || !Array.isArray(v.itemsListedStops)) throw new Error("Malformed audit loop ledger.");
  for (const epoch of v.epochs) if (!["delivery", "test"].includes(epoch.kind) || !["start", "allowed", "upgrade"].includes(epoch.cause) || !Number.isSafeInteger(epoch.loopsBefore)) throw new Error("Malformed audit loop epoch.");
  for (const loop of v.loops) if (!["delivery", "test"].includes(loop.kind) || !Number.isSafeInteger(loop.number) || !Array.isArray(loop.activityKeys)) throw new Error("Malformed audit loop.");
  for (const acceptance of v.acceptances) if (typeof acceptance.sentence !== "string" || !["browser", "command_line"].includes(acceptance.via) || !Array.isArray(acceptance.items)) throw new Error("Malformed acceptance.");
}
