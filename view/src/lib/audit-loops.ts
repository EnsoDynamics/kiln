// What the screens say about the audit loops (Kiln Deliver When Audit Loops Run Out technical
// design, "Settings" and "The Status Line"; mockup docs/changes/kiln-deliver-when-audit-loops-run-out/
// mockups/kiln-deliver-when-audit-loops-run-out.html): the two limits' help text, worked out from
// the numbers shown (AC-CHOICE-01, AC-CHOICE-02), an audit row's loop label and the status line's
// position (AC-STOP-05). Nothing marks a last loop; the numbers show it.
//
//   loopSettingsHelp({ deliveryLimit: 4, testLimit: 4 }).delivery
//   // "The delivery audit checks that every acceptance criterion is built, … After the phases from loop 4 are built, Kiln goes on to the test audit."
//   positionText({ audit: "test", loop: 2, limit: 4, fixing: true })   // "Fixing tests from test audit loop 2 of 4"

import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import type { LoopPosition } from "../../../src/engine/loop-view.js";
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
  const afterDelivery = `After the phases from loop ${d} are built, Kiln goes on to the test audit.`;
  const afterTest = `After the work from loop ${t} is done, Kiln opens the pull request, after a delivery audit if one is left.`;
  if (short) {
    return {
      intro: "Each run of an audit is one loop; Kiln builds or fixes whatever it finds. After the last one, Kiln moves on without auditing again.",
      delivery: afterDelivery,
      test: afterTest,
      changeable: "A change applies from Kiln’s next decision whether to run that audit.",
    };
  }
  return {
    intro: "After the planned phases close, two audits check the work. Each run of an audit is one loop; Kiln builds or fixes whatever it finds. These set how many loops of each Kiln makes. After the last one, Kiln moves on without auditing again.",
    delivery: `The delivery audit checks that every acceptance criterion is built, and Kiln builds the phases it adds. Each run of the audit is one loop. ${afterDelivery}`,
    test: `The test audit checks that the tests would notice if a criterion broke, and Kiln builds or fixes what it finds. Each run of the audit is one loop. ${afterTest}`,
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

/** An audit row's loop: "loop 2 of 4" (AC-STOP-05); phase rows and sessions of test fixes carry none. */
export function rowLoopLabel(row: Pick<PhaseView, "loops">): string | undefined {
  const latest = row.loops?.at(-1);
  return latest ? `loop ${latest.number} of ${latest.limit}` : undefined;
}

/** "Delivery audit loop 2 of 4", "Fixing tests from test audit loop 2 of 4", as `kiln status` says it (AC-STOP-05). */
export function positionText(position: LoopPosition): string {
  const name = `${position.audit} audit loop ${position.loop} of ${position.limit}`;
  return position.fixing ? `Fixing tests from ${name}` : `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}
