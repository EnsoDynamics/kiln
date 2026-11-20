// The audit loops on the command line (Kiln Deliver When Audit Loops Run Out AC-CHOICE-01, AC-STOP-05).
import { describe, expect, it } from "vitest";
import { auditLoopsText, loopSettingInputs, SETTING_FLAGS } from "./loop-text.js";
import { positionText, type AuditLoopsView } from "../engine/loop-view.js";

const view = (extra: Partial<AuditLoopsView> = {}): AuditLoopsView => ({ settings: { deliveryLimit: 4, testLimit: 4 }, delivery: { used: 2, limit: 4, closed: false, floor: 2 }, test: { used: 0, limit: 4, closed: false, floor: 1 }, ...extra });

describe("kiln settings loop flags", () => {
  it("takes the two limits as whole numbers of 1 or more, and has no third setting", () => {
    expect(loopSettingInputs({ "delivery-audit-loops": "5", "test-audit-loops": "1" })).toEqual({ delivery_audit_loops: 5, test_audit_loops: 1 });
    expect(loopSettingInputs({})).toEqual({});
    for (const bad of ["0", "-1", "2.5", "four"]) expect(() => loopSettingInputs({ "test-audit-loops": bad })).toThrow("--test-audit-loops takes a whole number of 1 or more.");
    expect(SETTING_FLAGS).not.toContain("after-last-test-audit-loop");
  });
});

describe("kiln status loop lines", () => {
  it("names each row of the status line table, and never marks a last loop", () => {
    expect(positionText({ audit: "delivery", loop: 2, limit: 4 })).toBe("Delivery audit loop 2 of 4");
    expect(positionText({ audit: "test", loop: 2, limit: 4, fixing: true })).toBe("Fixing tests from test audit loop 2 of 4");
    expect(positionText({ audit: "test", loop: 4, limit: 4 })).toBe("Test audit loop 4 of 4");
    const text = auditLoopsText(view({ position: { audit: "test", loop: 4, limit: 4 } }))!;
    expect(text).toBe("Test audit loop 4 of 4\nAudit loops: delivery 2 of 4 · test 0 of 4");
    expect(text).not.toMatch(/last/i);
  });

  it("prints only the counts outside the closing audits, and says a change applies to a continuation once frozen", () => {
    expect(auditLoopsText(view())).toBe("Audit loops: delivery 2 of 4 · test 0 of 4");
    expect(auditLoopsText(view({ frozen: { at: "2026-11-19T10:00:00.000Z" } }))).toContain("a change to either limit applies to a continuation of it");
    expect(auditLoopsText(undefined)).toBeUndefined();
  });
});
