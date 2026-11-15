// What the screens say about the audit loops (Kiln Audit Loop Limits technical design, "Display
// Contract"; mockup docs/changes/kiln-audit-loop-limits/mockups/kiln-audit-loop-limits.html):
// the three settings' help text, worked out from the numbers shown (AC-LOOP-01), an activity
// row's loop label and carried sentence (AC-SHOW-01, AC-TEST-03), and a loop stop's words
// (AC-STOP-01, AC-STOP-02), with no judgment of Kiln's about which items matter.
//
//   loopSettingsHelp({ deliveryLimit: 3, testLimit: 3, afterLastTest: "stop_and_ask" }).test
//   // "After the test audit, Kiln runs up to 3 sessions of test fixes, each one a loop, and tells the 3rd it is the last. …"

import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import type { AuditLoopsView } from "../../../src/engine/loop-view.js";
import type { AuditLoopSettings } from "../../../src/state/audit-loops.js";
import { clockTime, shortDuration } from "./time.js";

export type LoopStopView = NonNullable<AuditLoopsView["stop"]>;

/** The default's sentence (AC-LOOP-06), as `src/state/audit-loops.ts` holds it. */
export const SETTING_SENTENCE = "I accept the remaining Weak rows after the last test audit loop.";
export const DEFAULT_LOOP_SETTINGS: AuditLoopSettings = { deliveryLimit: 3, testLimit: 3, afterLastTest: "deliver_unless_serious" };
export const AFTER_LAST_TEST_LABELS = { deliver_unless_serious: "Deliver, unless something serious is left", stop_and_ask: "Always stop and ask me" } as const;
export const LIMIT_ERROR = "Enter a whole number of 1 or more.";

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** The settings a snapshot shows: the snapshot's, or the defaults before it carries any. */
export const shownLoopSettings = (snapshot: Snapshot): AuditLoopSettings => snapshot.auditLoops?.settings ?? DEFAULT_LOOP_SETTINGS;

/** A limit typed into its field: the whole number, or undefined when it is not one of 1 or more. */
export function parsedLimit(text: string): number | undefined {
  if (!/^\s*\d+\s*$/.test(text)) return undefined;
  const value = Number(text.trim());
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

export interface LoopSettingsHelp {
  intro: string;
  delivery: string;
  test: string;
  deliver: string;
  ask: string;
  changeable: string;
}

/**
 * Each setting's help text from the values shown (AC-LOOP-01): Documents found's full words
 * (mockup screen 1), or the run's settings panel's short ones (screen 0's).
 */
export function loopSettingsHelp(settings: Pick<AuditLoopSettings, "deliveryLimit" | "testLimit">, short = false): LoopSettingsHelp {
  const { deliveryLimit: d, testLimit: t } = settings;
  const times = d === 1 ? "once" : `up to ${d} times`;
  const sessions = t === 1 ? "one session of test fixes" : `up to ${t} sessions of test fixes`;
  const quote = `You say: “${SETTING_SENTENCE}”`;
  if (short) {
    return {
      intro: "After the planned phases close, the audits can send Kiln back to finish or prove acceptance criteria. Each trip back is a loop.",
      delivery: `Kiln builds what the audits find unfinished ${times}. If an audit finds more after that, Kiln stops at Needs you.`,
      test: t === 1 ? "One session of test fixes after the test audit. It is told it is the last." : `Up to ${t} sessions of test fixes after the test audit. The ${ordinal(t)} is told it is the last.`,
      deliver: `${quote} Unfinished criteria go back to building; Kiln stops if anything else is left.`,
      ask: "You accept nothing in advance.",
      changeable: "These can be changed while Kiln runs, from the page or the command line.",
    };
  }
  return {
    intro: "After the planned phases close, the audits can send Kiln back to finish or to prove acceptance criteria. Each trip back is a loop. These set how many Kiln makes on its own.",
    delivery: `Kiln builds what the audits find unfinished ${times}. Each loop is one audit that finds unfinished criteria, then the phases Kiln builds for them. If a ${ordinal(d + 1)} audit still finds something, Kiln stops at Needs you. It never delivers work the audit says is unfinished.`,
    test: `After the test audit, Kiln runs ${sessions}, ${t === 1 ? "a loop, and tells it that it is the last" : `each one a loop, and tells the ${ordinal(t)} it is the last`}. The audit itself isn’t a loop, even when it fixes a few small gaps on the spot. If a test shows a criterion was never finished, that is build work and counts as a delivery audit loop.`,
    deliver: `${quote} Kiln quotes that to the last session and to any test audit after it. It stops if anything else is left: a criterion with no test, a failing test, a high-risk criterion still Weak, or test work saved for later. A criterion found unfinished goes back to building first, while delivery audit loops remain.`,
    ask: "You accept nothing in advance. Kiln stops at Needs you with what is left.",
    changeable: "These can be changed while Kiln runs, from the page or the command line, like keep-awake.",
  };
}

/** An activity row's loop: "loop 2 of 3", or "last loop", read by its latest loop (AC-SHOW-01). */
export function rowLoopLabel(row: Pick<PhaseView, "loops">): string | undefined {
  const latest = row.loops?.at(-1);
  if (!latest) return undefined;
  return latest.last ? "last loop" : `loop ${latest.number} of ${latest.limit}`;
}

/** One loop in a row's detail: "Loop 2 of 3", or "Last loop". */
export function loopEntryLabel(loop: NonNullable<PhaseView["loops"]>[number]): string {
  return loop.last ? "Last loop" : `Loop ${loop.number} of ${loop.limit}`;
}

/** Which sentence a row's session carried, in a row's words (AC-TEST-03); a quoted sentence says where and when it was given (AC-LOOP-06). */
export function carriedLabel(carried: { sentence: string; source: string }): string {
  return carried.sentence === SETTING_SENTENCE ? `ran under your setting ${AFTER_LAST_TEST_LABELS.deliver_unless_serious}` : `carried your words “${carried.sentence}” ${carried.source}`;
}

/** "Loop 1 of 3 · Phase 6 built": a stop page's loop line, without saying a name twice. */
export function stopLoopLine(line: LoopStopView["loops"][number]): string {
  const parts = [line.label];
  if (line.activity !== line.label && !(line.did?.startsWith(line.activity))) parts.push(line.activity);
  if (line.did) parts.push(line.did);
  return parts.join(" · ");
}

/** The words of a loop stop's page (AC-STOP-01, AC-STOP-02). */
export interface LoopStopCopy {
  line: string;
  /** "What the latest delivery audit found". */
  foundHeading: string;
  nothingListed: string;
  allowText: string;
  acceptText?: string;
  /** Under Check again; absent where Check again reruns the checks as at any stop. */
  checkAgainText?: string;
  activityName: string;
  /** The Audit loop left row's fact, at a hold only. */
  loopLeftFact?: string;
}

export function loopStopCopy(stop: LoopStopView, view: AuditLoopsView, storedStop: boolean): LoopStopCopy {
  const delivery = stop.kind === "delivery";
  const kind = delivery ? "delivery" : "test";
  const count = stop.audit.items.length;
  const items = count === 1 ? "one item" : `${count} items`;
  const counts = delivery ? view.delivery : view.test;
  const reasonLine = stop.reason === "phases_added"
    ? "The audit added phases for unfinished criteria, and no delivery audit loop is left to build them, so Kiln stopped. They are in the plan, not started."
    : stop.reason === "test_work_saved"
      ? "The last test audit saved test work for another session, and no test audit loop is left, so Kiln stopped."
      : `The last test audit listed ${items} for you to decide, so Kiln stopped.`;
  const line = delivery ? reasonLine : `Your setting is ${AFTER_LAST_TEST_LABELS[stop.afterLastTest ?? view.settings.afterLastTest]}. ${reasonLine}`;
  return {
    line,
    foundHeading: `What the latest ${kind} audit found`,
    nothingListed: "Nothing listed for you.",
    allowText: delivery
      ? "Build what the audit added, then audit again. Each build and its audit is one loop."
      : stop.reason === "items_listed"
        ? `Keep fixing ${count === 1 ? "this" : "these"}. Each session of fixes is a loop. A session can’t fix a row marked stuck, or a step only you can take, until you pick it up yourself.`
        : "Carry on with the saved test work. Each session of fixes is a loop.",
    ...(delivery ? {} : { acceptText: "One more session records it and fixes nothing." }),
    ...(storedStop
      ? { checkAgainText: stop.holds ? "If you have raised the limit in the settings, the next loop starts. If not, Kiln stays here." : `Leave ${count === 1 ? "it" : "these"} undecided. Kiln runs the delivery audit, then one more test audit that doesn’t count as a loop.` }
      : {}),
    activityName: delivery ? "the delivery audit" : "the last test audit",
    ...(stop.holds ? { loopLeftFact: `No ${kind} audit loop is left: ${counts.used} of ${counts.limit} used.` } : {}),
  };
}

/**
 * A row's Details entries for its loops and carried sentences (AC-SHOW-01, AC-TEST-03): each loop
 * with its start time, how long it ran and what it did; each carried sentence quoted, with where
 * and when the person gave it.
 *
 *   loopDetailRows(row, now)  // [{ term: "Loop 1 of 3", value: "9:12 AM · 1h 52m · Phase 6 built" }, { term: "Carried", value: "“I accept …” chosen on Documents found at 2026-11-13 09:12 UTC" }]
 */
export function loopDetailRows(row: Pick<PhaseView, "loops" | "carried">, now: Date): { term: string; value: string }[] {
  const rows: { term: string; value: string }[] = [];
  const seen = new Map<string, number>();
  const unique = (term: string) => { const n = (seen.get(term) ?? 0) + 1; seen.set(term, n); return n === 1 ? term : `${term} (${n})`; };
  for (const loop of row.loops ?? []) rows.push({ term: unique(loopEntryLabel(loop)), value: loopEntryLine(loop, now) });
  for (const one of row.carried ?? []) rows.push({ term: unique("Carried"), value: carriedQuote(one) });
  return rows;
}

/** "9:12 AM · 1h 52m · Phase 6 built". */
export function loopEntryLine(loop: NonNullable<PhaseView["loops"]>[number], now: Date): string {
  return [clockTime(loop.startedAt, now), shortDuration(loop.durationMs), ...(loop.did ? [loop.did] : [])].join(" · ");
}

/** “I accept the remaining Weak rows after the last test audit loop.” chosen on Documents found at 2026-11-13 09:12 UTC */
export const carriedQuote = (carried: { sentence: string; source: string }) => `“${carried.sentence}” ${carried.source}`;
