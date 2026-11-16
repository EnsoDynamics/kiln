// Kiln Audit Loop Limits AC-STOP-03 on the command line: the `kiln settings` loop flags become the
// `settings` control's inputs, and `kiln status` prints the counts and a loop stop's page
// (AC-STOP-01, AC-SHOW-01) with the controls available there.
import { describe, expect, it } from "vitest";
import { afterLastTestFacts, afterLastTestText, auditLoopsText, durationText, loopCount, loopSettingInputs, type AuditLoopsView } from "./loop-text.js";
import { commandContracts, commandHelp, parseCommand } from "./help.js";

const counts: AuditLoopsView = { settings: { deliveryLimit: 3, testLimit: 3, afterLastTest: "deliver_unless_serious" }, delivery: { used: 1, limit: 3 }, test: { used: 0, limit: 3 } };
const testStop: AuditLoopsView = {
  settings: { deliveryLimit: 3, testLimit: 3, afterLastTest: "stop_and_ask" }, delivery: { used: 1, limit: 3 }, test: { used: 3, limit: 3 },
  stop: {
    kind: "test", reason: "items_listed", heldAuditKey: "audit-t3", holds: false, heading: "Test audit loops used: 3 of 3",
    loops: [
      { label: "Loop 1 of 3", activity: "Test audit", did: "Saved test work · Added tests for refunds", durationMs: 12 * 60_000 },
      { label: "Last loop", activity: "Test audit", durationMs: 65 * 60_000 },
      { label: "Delivery audit", activity: "Delivery audit", did: "passed", durationMs: 45_000 },
    ],
    audit: { summary: "Two criteria are still weak.", items: [{ name: "AC-REFUND-04", problem: "Only a mocked test covers the refund.", action: "Accept it or add a real test." }] },
    afterLastTest: "stop_and_ask", acceptSentence: "I accept AC-REFUND-04.",
  },
};
const controls = [
  { name: "allow-more-loops", available: true, reason: null, invocation: ["kiln", "allow-more-loops", "/work/shop/docs/prds/orders"] },
  { name: "accept-and-deliver", available: true, reason: null, invocation: ["kiln", "accept-and-deliver", "/work/shop/docs/prds/orders"] },
  { name: "reply", available: false, reason: "Resume isn't offered here.", invocation: ["kiln", "reply", "/work/shop/docs/prds/orders"] },
];

describe("kiln settings loop flags", () => {
  it("turn into the settings control's inputs, deliver and ask into their saved values, with no via", () => {
    expect(loopSettingInputs({ "delivery-audit-loops": "4", "test-audit-loops": "5", "after-last-test-audit-loop": "ask" })).toEqual({ delivery_audit_loops: 4, test_audit_loops: 5, after_last_test_audit_loop: "stop_and_ask" });
    expect(loopSettingInputs({ "after-last-test-audit-loop": "deliver" })).toEqual({ after_last_test_audit_loop: "deliver_unless_serious" });
    expect(loopSettingInputs({ "keep-awake": "on" })).toEqual({});
  });

  it("refuse a limit that is not a whole number of 1 or more, and any other choice, as invalid_input with nothing clamped", () => {
    for (const value of ["0", "-1", "1.5", "two", "01", "9007199254740993"]) {
      expect(() => loopSettingInputs({ "test-audit-loops": value }), value).toThrow(expect.objectContaining({ code: "invalid_input", exit: 2 }));
      expect(() => loopCount(value, "--loops"), value).toThrow(/--loops takes a whole number of 1 or more/);
    }
    expect(() => loopSettingInputs({ "after-last-test-audit-loop": "deliver_unless_serious" })).toThrow(expect.objectContaining({ code: "invalid_input" }));
    expect(loopCount("12", "--loops")).toBe(12);
  });
});

describe("kiln status audit loop text", () => {
  it("prints the counts and the setting on one line when no loop stop is showing, with the sentence Deliver gives beside it (AC-LOOP-06)", () => {
    expect(auditLoopsText(counts)).toBe("Audit loops: delivery 1 of 3 · test 0 of 3 · after the last test audit loop: deliver, unless something serious is left; your words: “I accept the remaining Weak rows after the last test audit loop.”");
    const chosen: AuditLoopsView = { ...counts, settings: { ...counts.settings, afterLastTestSource: { kind: "person", where: "documents_found", at: "2026-11-15T14:05:09.000Z" } } };
    expect(auditLoopsText(chosen)).toBe("Audit loops: delivery 1 of 3 · test 0 of 3 · after the last test audit loop: deliver, unless something serious is left; your words: “I accept the remaining Weak rows after the last test audit loop.”, chosen on Documents found at 2026-11-15 14:05 UTC");
    expect(auditLoopsText(undefined)).toBeUndefined();
  });

  it("gives the sentence and where and when only for the choice that gives it (AC-LOOP-06)", () => {
    const at = "2026-11-15T14:05:09.000Z";
    expect(afterLastTestText("deliver_unless_serious", { kind: "person", where: "command_line", at })).toBe("deliver, unless something serious is left; your words: “I accept the remaining Weak rows after the last test audit loop.”, chosen with kiln settings at 2026-11-15 14:05 UTC");
    expect(afterLastTestText("stop_and_ask", { kind: "person", where: "run_page", at })).toBe("always stop and ask me");
    expect(afterLastTestText("stop_and_ask", { kind: "kiln_for_earlier_run" })).toBe("always stop and ask me (applied by Kiln because this run began before the setting existed)");
    expect(afterLastTestFacts("deliver_unless_serious", { kind: "person", where: "run_page", at })).toEqual({ after_last_test_audit_loop_sentence: "I accept the remaining Weak rows after the last test audit loop.", after_last_test_audit_loop_chosen: "chosen on the run's page at 2026-11-15 14:05 UTC" });
    expect(afterLastTestFacts("stop_and_ask")).toEqual({ after_last_test_audit_loop_sentence: null, after_last_test_audit_loop_chosen: null });
  });

  it("prints a loop stop's heading, loops, the audit's own summary and items, the choice, the Accept sentence and the available controls", () => {
    const text = auditLoopsText(testStop, controls)!;
    expect(text.split("\n")).toEqual([
      "Audit loops: delivery 1 of 3 · test 3 of 3 · after the last test audit loop: always stop and ask me",
      "",
      "Test audit loops used: 3 of 3",
      "  Loop 1 of 3 · Test audit · Saved test work · Added tests for refunds · 12m",
      "  Last loop · Test audit · 1h 5m",
      "  Delivery audit · Delivery audit · passed · 45s",
      "What the audit found:",
      "  Two criteria are still weak.",
      "  - AC-REFUND-04: Only a mocked test covers the refund. Next: Accept it or add a real test.",
      "After the last test audit loop: always stop and ask me",
      "Accept what is left and deliver would record: “I accept AC-REFUND-04.”",
      "Controls available at this stop (each also takes --only-if-status-matches <status_token> --command-id <new-id>):",
      "  kiln allow-more-loops /work/shop/docs/prds/orders --loops N",
      "  kiln accept-and-deliver /work/shop/docs/prds/orders",
    ]);
  });

  it("says so when the audit left no summary and no control is available", () => {
    const delivery = { ...testStop.stop! }; delete delivery.afterLastTest; delete delivery.acceptSentence;
    const text = auditLoopsText({ ...testStop, stop: { ...delivery, kind: "delivery", heading: "Delivery audit loops used: 3 of 3", audit: { items: [] } } }, [])!;
    expect(text).toContain("Delivery audit loops used: 3 of 3\n");
    expect(text).toContain("What the audit found:\n  The audit left no summary.");
    expect(text).not.toContain("Accept what is left");
    expect(text).toContain("  none right now; see controls for each reason.");
  });

  it("formats durations in seconds, minutes or hours and minutes", () => {
    expect([durationText(0), durationText(59_000), durationText(90_000), durationText(3_600_000)]).toEqual(["0s", "59s", "2m", "1h 0m"]);
  });
});

describe("the audit loop command contracts", () => {
  it("declare allow-more-loops and accept-and-deliver as changing stop commands with their outcomes, kept out of plan advancement", () => {
    for (const name of ["allow-more-loops", "accept-and-deliver"]) {
      const contract = commandContracts.find(c => c.path.join(" ") === name)!;
      expect(contract).toMatchObject({ group: "answer", side_effect: "change", implemented: true });
      expect(Object.keys(contract.flags)).toEqual(expect.arrayContaining(["only-if-status-matches", "command-id", "json", "help"]));
      expect(contract.flags).not.toHaveProperty("leave-branch-as-is");
      expect(contract.errors).toEqual(expect.arrayContaining(["stale_status_token", "instance_incompatible", "control_unavailable", "not_at_loop_stop"]));
      for (const code of contract.errors) expect(contract.error_meanings?.[code], `${name} ${code}`).toBeTruthy();
      expect(contract.result_fields["operation.outcome"]).toContain("session_started");
      expect(contract.result_fields["operation.outcome"]).toContain("dispatch_not_started");
      expect(contract.result_fields["operation.outcome"]).toContain("not_at_loop_stop");
      expect(contract.result_fields["operation.effects.plan"]).toBe("Always not_advanced: neither control advances the plan by itself.");
      for (const example of contract.examples) expect(() => parseCommand(example.argv.slice(1))).not.toThrow();
    }
    expect(commandContracts.find(c => c.path[0] === "allow-more-loops")!.result_fields["operation.outcome"]).toContain("loops_allowed");
    expect(commandContracts.find(c => c.path[0] === "accept-and-deliver")!.result_fields["operation.outcome"]).toContain("acceptance_recorded");
    // Beside the existing stop commands.
    const answer = commandContracts.filter(c => c.group === "answer").map(c => c.path.join(" "));
    expect(answer.slice(-3)).toEqual(["waive-and-advance", "allow-more-loops", "accept-and-deliver"]);
  });

  it("require --loops for allow-more-loops and the safety flags for both", () => {
    const safety = ["--only-if-status-matches", "s", "--command-id", "c"];
    expect(parseCommand(["allow-more-loops", "prd", "--loops", "2", ...safety]).flags.loops).toBe("2");
    expect(() => parseCommand(["allow-more-loops", "prd", ...safety])).toThrow(/Required flags: --loops/);
    expect(() => parseCommand(["accept-and-deliver", "prd", "--command-id", "c"])).toThrow(/--only-if-status-matches/);
    expect(() => parseCommand(["accept-and-deliver", "prd", "--loops", "2", ...safety])).toThrow(/Unknown or duplicate flag --loops/);
  });

  it("document the new settings flags in kiln settings --help, and the commands in their own help", () => {
    const settings = commandHelp(["settings"], false);
    for (const flag of ["--delivery-audit-loops <N>", "--test-audit-loops <N>", "--after-last-test-audit-loop <deliver|ask>", "--keep-awake <on|off>"]) expect(settings).toContain(flag);
    expect(parseCommand(["settings", "prd", "--after-last-test-audit-loop", "ask"]).flags["after-last-test-audit-loop"]).toBe("ask");
    // The sentence Deliver gives is shown beside the choice (AC-LOOP-06).
    expect(settings).toContain("I accept the remaining Weak rows after the last test audit loop.");
    expect(commandHelp(["allow-more-loops"], false)).toContain("kiln allow-more-loops <PRD-path> --loops <N> [options]");
    expect(commandHelp(["accept-and-deliver"], false)).toContain("kiln accept-and-deliver <PRD-path> [options]");
    expect(commandHelp([], false)).toMatch(/waive-and-advance, allow-more-loops, accept-and-deliver/);
  });
});
