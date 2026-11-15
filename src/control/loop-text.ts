/**
 * The audit loops on the command line (Kiln Audit Loop Limits AC-STOP-03): the `kiln settings`
 * loop flags as control inputs, and the lines `kiln status` prints for the loop counts and, at a
 * loop stop, its page (AC-STOP-01, AC-SHOW-01).
 *
 *   loopSettingInputs({ "test-audit-loops": "5", "after-last-test-audit-loop": "ask" })
 *   // { test_audit_loops: 5, after_last_test_audit_loop: "stop_and_ask" }
 */
import { commandText, ControlFailure } from "./result.js";
import type { AuditLoopsView } from "../engine/loop-view.js";

export type { AuditLoopsView };
export interface StatusControl { name: string; available: boolean; reason: string | null; invocation: string[] | null }

/** Every `kiln settings` flag that changes a setting; any one makes the command a changing one. */
export const SETTING_FLAGS = ["keep-awake", "resume-after-usage-limit", "delivery-audit-loops", "test-audit-loops", "after-last-test-audit-loop"];

const AFTER_LAST_TEST: Record<string, "deliver_unless_serious" | "stop_and_ask"> = { deliver: "deliver_unless_serious", ask: "stop_and_ask" };

/** A loop count from the command line: a whole number of 1 or more, never clamped. */
export function loopCount(value: string | true | string[] | undefined, flag: string): number {
  const count = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(count)) throw new ControlFailure("invalid_input", `${flag} takes a whole number of 1 or more.`, 2);
  return count;
}

/** The `settings` control inputs for the loop flags given; empty when none is. `via` is the control route's to add. */
export function loopSettingInputs(flags: Record<string, string | true | string[]>): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};
  if (flags["delivery-audit-loops"] !== undefined) inputs.delivery_audit_loops = loopCount(flags["delivery-audit-loops"], "--delivery-audit-loops");
  if (flags["test-audit-loops"] !== undefined) inputs.test_audit_loops = loopCount(flags["test-audit-loops"], "--test-audit-loops");
  const after = flags["after-last-test-audit-loop"];
  if (after !== undefined) {
    if (typeof after !== "string" || !Object.hasOwn(AFTER_LAST_TEST, after)) throw new ControlFailure("invalid_input", "--after-last-test-audit-loop takes deliver or ask.", 2);
    inputs.after_last_test_audit_loop = AFTER_LAST_TEST[after];
  }
  return inputs;
}

const afterLastTestWords = (value: string) => value === "stop_and_ask" ? "always stop and ask me" : "deliver, unless something serious is left";

/** "45s", "12m", "1h 5m". */
export function durationText(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * The loop counts on one line and, at a loop stop, its heading, loops, the audit's own summary and
 * items, and the controls available there, with no judgment of Kiln's about which items matter.
 *
 *   Audit loops: delivery 1 of 3 · test 3 of 3 · after the last test audit loop: deliver, unless something serious is left
 *   Test audit loops used: 3 of 3
 *     Loop 1 of 3 · Test audit · Saved test work · 12m
 *   …
 */
export function auditLoopsText(view: AuditLoopsView | null | undefined, controls: readonly StatusControl[] = []): string | undefined {
  if (!view) return undefined;
  const lines = [`Audit loops: delivery ${view.delivery.used} of ${view.delivery.limit} · test ${view.test.used} of ${view.test.limit} · after the last test audit loop: ${afterLastTestWords(view.settings.afterLastTest)}`];
  const stop = view.stop;
  if (!stop) return lines.join("\n");
  lines.push("", stop.heading);
  for (const loop of stop.loops) lines.push(`  ${[loop.label, loop.activity, loop.did, durationText(loop.durationMs)].filter(Boolean).join(" · ")}`);
  if (!stop.loops.length) lines.push("  No loops in the current count.");
  lines.push("What the audit found:", `  ${stop.audit.summary ?? "The audit left no summary."}`);
  for (const item of stop.audit.items) lines.push(`  - ${item.name}: ${item.problem}${item.action ? ` Next: ${item.action}` : ""}`);
  if (stop.afterLastTest) lines.push(`After the last test audit loop: ${afterLastTestWords(stop.afterLastTest)}`);
  if (stop.acceptSentence) lines.push(`Accept what is left and deliver would record: “${stop.acceptSentence}”`);
  const available = controls.filter(control => control.available);
  lines.push("Controls available at this stop (each also takes --only-if-status-matches <status_token> --command-id <new-id>):");
  for (const control of available) lines.push(`  ${control.invocation ? commandText([...control.invocation, ...(control.name === "allow-more-loops" ? ["--loops", "N"] : [])]) : control.name}`);
  if (!available.length) lines.push("  none right now; see controls for each reason.");
  return lines.join("\n");
}
