// The audit loops on the command line (Kiln Deliver When Audit Loops Run Out AC-CHOICE-01, AC-STOP-05).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commandContracts } from "./help.js";
import { auditLoopsText, loopSettingInputs, SETTING_FLAGS } from "./loop-text.js";
import type { AuditLoopsView } from "../engine/loop-view.js";
import { positionText } from "../audit/audit-names.js";

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
  it("names each row of the status line table with its maximum, and never marks a last loop (Kiln Planned Test Fix Batches AC-MAX-01)", () => {
    expect(positionText({ audit: "delivery", loop: 2, limit: 4 })).toBe("Delivery audit loop 2 · max 4");
    expect(positionText({ audit: "test", loop: 1, limit: 4, fixing: true, batch: { number: 1, of: 2 } })).toBe("Fixing tests · batch 1 of 2 from test audit loop 1");
    expect(positionText({ audit: "test", loop: 1, limit: 4, fixing: true })).toBe("Fixing tests from test audit loop 1");
    expect(positionText({ audit: "test", loop: 4, limit: 4 })).toBe("Test audit loop 4 · max 4");
    const text = auditLoopsText(view({ position: { audit: "test", loop: 4, limit: 4 } }))!;
    expect(text).toBe("Test audit loop 4 · max 4\nAudit loops: delivery 2 (max 4) · test 0 (max 4)");
    expect(text).not.toMatch(/\d+ of \d+/);
    expect(text).not.toMatch(/last/i);
  });

  it("prints only the counts outside the closing audits, and says a change applies to a continuation once frozen", () => {
    expect(auditLoopsText(view())).toBe("Audit loops: delivery 2 (max 4) · test 0 (max 4)");
    expect(auditLoopsText(view({ frozen: { at: "2026-11-19T10:00:00.000Z" } }))).toContain("a change to either limit applies to a continuation of it");
    expect(auditLoopsText(undefined)).toBeUndefined();
  });
});

describe("the loop limits' wording outside the browser (Kiln Planned Test Fix Batches AC-MAX-02, AC-BOT-01)", () => {
  const contracts = JSON.stringify(commandContracts);
  it("says in each kiln settings flag that a loop is one audit plus the work it finds, and the limit the most a run makes", () => {
    const flags = commandContracts.find(c => c.path.join(" ") === "settings")!;
    const sources = JSON.stringify(flags).match(/Max (delivery|test) audit loops: [^"]*/g)!;
    expect(sources).toHaveLength(2);
    for (const source of sources) expect(source).toMatch(/^Max (delivery|test) audit loops: A loop is one audit plus the work it finds\. The most (delivery|test) audits the run makes/);
  });
  it("describes audit_loops with a loop's meaning, each limit as a maximum, and the batch in its position", () => {
    expect(contracts).toContain("A loop is one audit plus the work it finds, and each limit is the most loops of that audit a run makes; Kiln never stops at a limit.");
    expect(contracts).toContain("position {audit delivery | test, loop, limit, fixing, batch {number, of}}");
    expect(contracts).not.toContain("A loop is one run of an audit");
  });
  it("opens the guide's Audit loop limits section with the settings' two sentences and names a loop with its maximum", () => {
    const guide = readFileSync(new URL("../../docs/kiln-command-line-and-bot-control.md", import.meta.url), "utf8");
    const section = /## Audit loop limits\n\n([\s\S]*?)(?=\n## )/.exec(guide)![1]!;
    expect(section.startsWith("Each loop is one audit plus the work it finds. A run makes only the loops it needs; these are the most it will make.")).toBe(true);
    expect(section).toContain("`Delivery audit loop 2 · max 4`");
    expect(section).not.toMatch(/loop \d+ of \d+/);
  });
});
