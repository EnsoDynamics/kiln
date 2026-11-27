// What the screens say about the audit loops (Kiln Deliver When Audit Loops Run Out technical
// design, "Settings"; Kiln Planned Test Fix Batches, "Settings Help"): the two limits' help text,
// worked out from the numbers shown (AC-CHOICE-01, AC-CHOICE-02, AC-MAX-02). A loop is one audit
// plus the work it finds, and each limit is the most loops a run makes, never a number it always
// makes. The status line's wording lives in the names module (src/audit/audit-names.ts).
//
//   loopSettingsHelp({ deliveryLimit: 4, testLimit: 4 }).delivery
//   // "The delivery audit checks that every acceptance criterion is built, … If a run reaches loop 4, Kiln builds the phases from it and goes on to the test audit."

import type { Snapshot } from "../../../src/engine/snapshot.js";
import { defaultLoopSettings, type AuditLoopSettings } from "../../../src/state/audit-loops.js";

export { LOOP_STOP_LINE } from "../../../src/state/audit-loops.js";

export const LIMIT_ERROR = "Enter a whole number of 1 or more.";

/** The settings a snapshot shows: the snapshot's, or the defaults before it carries any. */
export const shownLoopSettings = (snapshot: Snapshot): AuditLoopSettings => snapshot.auditLoops?.settings ?? defaultLoopSettings();

/** A limit typed into its field: the whole number, or undefined when it is not one of 1 or more. */
export function parsedLimit(text: string): number | undefined {
  if (!/^\s*\d+\s*$/.test(text)) return undefined;
  const value = Number(text.trim());
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

/** The mockup's two sentences, word for word, on both forms of the help (AC-MAX-02). */
export const LOOP_SENTENCES = "Each loop is one audit plus the work it finds. A run makes only the loops it needs; these are the most it will make.";

export interface LoopSettingsHelp {
  intro: string;
  delivery: string;
  test: string;
  changeable: string;
}

/**
 * Each limit's help text from the values shown (AC-CHOICE-01): Documents found's full words
 * (mockup screen 1), or the run's settings panel's short ones.
 */
export function loopSettingsHelp(settings: AuditLoopSettings, short = false): LoopSettingsHelp {
  const { deliveryLimit: d, testLimit: t } = settings;
  const afterDelivery = `If a run reaches loop ${d}, Kiln builds the phases from it and goes on to the test audit.`;
  const afterTest = `If a run reaches loop ${t}, Kiln finishes the work from it and opens the pull request, after a delivery audit if one is left.`;
  if (short) {
    return {
      intro: LOOP_SENTENCES,
      delivery: afterDelivery,
      test: afterTest,
      changeable: "A change applies from Kiln’s next decision whether to run that audit.",
    };
  }
  return {
    intro: `After the planned phases close, two audits check the work. ${LOOP_SENTENCES}`,
    delivery: `The delivery audit checks that every acceptance criterion is built, and Kiln builds the phases it adds. ${afterDelivery}`,
    test: `The test audit checks that the tests would notice if a criterion broke, and Kiln builds or fixes what it finds. ${afterTest}`,
    changeable: "Both can be changed while Kiln runs, from the page or the command line.",
  };
}

/**
 * What a refused change shows (AC-CHOICE-02): each limit's field error as the server words it,
 * the floor's included ("Enter 2 or more: this run has already made 2 delivery audit loops."),
 * or the refusal's reason when it names no field.
 *
 *   refusalShown({ ok: false, reason: "Invalid settings.", fieldErrors: { testLimit: "Enter 3 or more: …" } })
 *   // { fields: { testLimit: "Enter 3 or more: …" } }
 */
export function refusalShown(answer: { reason: string; fieldErrors?: Record<string, string> }): { fields: Partial<Record<"deliveryLimit" | "testLimit", string>>; reason?: string } {
  const fields = Object.fromEntries((["deliveryLimit", "testLimit"] as const).filter(key => answer.fieldErrors?.[key]).map(key => [key, answer.fieldErrors![key]!]));
  return Object.keys(fields).length ? { fields } : { fields, reason: answer.reason };
}

/** Once the pull request session has started, a change is saved for a continuation only (AC-CHOICE-02). */
export const FROZEN_LINE = "The pull request session has started, so a change applies only to a continuation of this run.";
