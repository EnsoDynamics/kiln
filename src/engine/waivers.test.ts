// The coverage rule for a phase's waived Closed line (waivers PRD AC-WAIVE-09): it covers the
// phase only while the phase is a leaf of the plan, so splitting the phase ends it.
import { describe, expect, it } from "vitest";
import type { PhasePlan, PlannedPhase } from "../plan/phase-plan.js";
import type { CheckResult } from "../state/records.js";
import { applyWaivers, effectivePlan, type Waiver } from "./waivers.js";

const at = "2026-11-02T12:00:00.000Z";
const closedWaiver: Waiver = {
  waiverId: "w-closed-1", at, activityKey: "1", activityKind: "implementation", effect: "completed",
  source: { via: "browser", account: "tester" }, operationId: "op-1", checkRun: { id: "run-1", at },
  items: [{ check: "Phase doc closed", kind: "phase_closed", subject: "1", text: "No Closed line in phase-1-intake.md", against: "1" }], checks: [],
};
const closedRow = (): CheckResult[] => [{ name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-1-intake.md"], items: [{ kind: "phase_closed", subject: "1", text: "No Closed line in phase-1-intake.md", against: "1" }] }];
const phase = (id: string, splitInto?: string[]): PlannedPhase => ({ id, fileName: `phase-${id}.md`, title: `Phase ${id}`, closed: false, repositories: [], splitInto, citedCriteria: [], dependenciesText: undefined });

describe("a waived Closed line ends when its phase is split (AC-WAIVE-09)", () => {
  it("covers the phase's Closed item while it is a leaf, and not once it is split", () => {
    expect(applyWaivers([closedWaiver], closedRow(), { isLeaf: () => true })[0]).toMatchObject({ passed: true, waived: true, items: [{ waiver: { waiverId: "w-closed-1", activityKey: "1" } }] });
    const split = applyWaivers([closedWaiver], closedRow(), { isLeaf: id => id !== "1" })[0]!;
    expect(split.passed).toBe(false);
    expect(split.waived).toBeUndefined();
    expect(split.items![0]!.waiver).toBeUndefined();
  });

  it("counts the leaf as closed in the effective plan, but neither the split record nor its new children", () => {
    const record = { waivers: [closedWaiver], phases: {} };
    const asLeaf: PhasePlan = { phases: [phase("1"), phase("2")], problems: [] };
    const leaf = effectivePlan(asLeaf, record);
    expect([...leaf.closedByWaiver]).toEqual(["1"]);
    expect(leaf.plan.phases.map(p => [p.id, p.closed])).toEqual([["1", true], ["2", false]]);

    const asSplit: PhasePlan = { phases: [phase("1", ["1a", "1b"]), phase("1a"), phase("1b"), phase("2")], problems: [] };
    const split = effectivePlan(asSplit, record);
    expect([...split.closedByWaiver]).toEqual([]);
    expect(split.plan.phases.map(p => [p.id, p.closed])).toEqual([["1", false], ["1a", false], ["1b", false], ["2", false]]);
  });
});
