/**
 * The audit loops on the command line (Kiln Deliver When Audit Loops Run Out AC-CHOICE-01,
 * AC-STOP-05): the `kiln settings` loop flags as control inputs, and the lines `kiln status`
 * prints for where the run is and each kind's loops against its limit in force.
 *
 *   loopSettingInputs({ "test-audit-loops": "5" })   // { test_audit_loops: 5 }
 *   auditLoopsText(view)
 *   // "Delivery audit loop 2 of 4\nAudit loops: delivery 2 of 4 · test 0 of 4"
 */
import { ControlFailure } from "./result.js";
import { positionText, type AuditLoopsView } from "../engine/loop-view.js";

export type { AuditLoopsView };

/** Every `kiln settings` flag that changes a setting; any one makes the command a changing one. */
export const SETTING_FLAGS = ["keep-awake", "resume-after-usage-limit", "delivery-audit-loops", "test-audit-loops"];

/** A loop limit from the command line: a whole number of 1 or more, never clamped. */
export function loopCount(value: string | true | string[] | undefined, flag: string): number {
  const count = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(count)) throw new ControlFailure("invalid_input", `${flag} takes a whole number of 1 or more.`, 2);
  return count;
}

/** The `settings` control inputs for the loop flags given; empty when none is. */
export function loopSettingInputs(flags: Record<string, string | true | string[]>): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  if (flags["delivery-audit-loops"] !== undefined) inputs.delivery_audit_loops = loopCount(flags["delivery-audit-loops"], "--delivery-audit-loops");
  if (flags["test-audit-loops"] !== undefined) inputs.test_audit_loops = loopCount(flags["test-audit-loops"], "--test-audit-loops");
  return inputs;
}

/** The position line, when the run is in its closing audits, then the loop counts; nothing marks a last loop. */
export function auditLoopsText(view: AuditLoopsView | null | undefined): string | undefined {
  if (!view) return undefined;
  const lines: string[] = [];
  if (view.position) lines.push(positionText(view.position));
  lines.push(`Audit loops: delivery ${view.delivery.used} of ${view.delivery.limit} · test ${view.test.used} of ${view.test.limit}`);
  if (view.frozen) lines.push("The limits are held for the rest of this run: a change to either limit applies to a continuation of it.");
  return lines.join("\n");
}
