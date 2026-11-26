// The audit prompt's {{nextSteps}} forecast (Kiln Deliver When Audit Loops Run Out, "Prompts";
// AC-LAST-03): the step each outcome leads to, by "Routing After the Last Loop", with no loop number and no "last".
import { describe, expect, it } from "vitest";
import { nextStepsForecast, stepsAfter } from "./next-steps.js";

const open = { delivery: false, test: false };
const HOLD = " Kiln stops before the pull request while a blocker or business question not marked waived is open.";
const ROWS = " List each test row still missing, failing or Weak as a `test` item with its criterion.";
const full = (text: string, outcome: string) => text.split("\n").find(one => one.startsWith(`- ${outcome}:`))!;
// The step each outcome leads to; the hold and test-row sentences are pinned in their own test.
const line = (text: string, outcome: string) => full(text, outcome).replace(HOLD, "").replace(ROWS, "");

describe("nextStepsForecast", () => {
  it("a delivery audit: the test audit while one is left; its phases, then another delivery audit while one is left", () => {
    const text = nextStepsForecast({ kind: "delivery_audit", fixing: false, closed: open, latestTestContinues: false });
    expect(line(text, "passed")).toBe("- passed: Kiln runs the test audit.");
    expect(line(text, "completion_phases")).toBe("- completion_phases: Kiln builds the phases you added, then runs the delivery audit.");
    expect(line(text, "needs_you")).toBe("- needs_you: Kiln stops at Needs you.");
  });

  it("a delivery audit at its kind's limit: its phases are built, then the test audit, with no delivery audit after", () => {
    const text = nextStepsForecast({ kind: "delivery_audit", fixing: false, closed: { delivery: true, test: false }, latestTestContinues: false });
    expect(line(text, "completion_phases")).toBe("- completion_phases: Kiln builds the phases you added, then runs the test audit.");
  });

  it("a delivery audit with the test kind closed: saved test work is worked through, otherwise the pull request", () => {
    expect(line(nextStepsForecast({ kind: "delivery_audit", fixing: false, closed: { delivery: false, test: true }, latestTestContinues: true }), "passed")).toBe("- passed: Kiln starts a session of test fixes.");
    expect(line(nextStepsForecast({ kind: "delivery_audit", fixing: false, closed: { delivery: true, test: true }, latestTestContinues: false }), "completion_phases")).toBe("- completion_phases: Kiln builds the phases you added, then goes on to the pull request.");
  });

  it("a test audit with both kinds open", () => {
    const text = nextStepsForecast({ kind: "test_audit", fixing: false, closed: open, latestTestContinues: false });
    expect(line(text, "passed")).toBe("- passed: Kiln goes on to the pull request; with changedImplementation true, Kiln runs the delivery audit, then runs the test audit.");
    expect(line(text, "completion_phases")).toBe("- completion_phases: Kiln builds the phases you added, then runs the delivery audit, then runs the test audit.");
    expect(line(text, "continue_test")).toBe("- continue_test: Kiln starts a session of test fixes; with changedImplementation true, Kiln runs the delivery audit, then runs the test audit.");
  });

  it("a session of test fixes with both kinds closed: test fixes again on continue_test, otherwise the pull request", () => {
    const text = nextStepsForecast({ kind: "test_audit", fixing: true, closed: { delivery: true, test: true }, latestTestContinues: true });
    expect(line(text, "passed")).toBe("- passed: Kiln goes on to the pull request; with changedImplementation true, Kiln goes on to the pull request.");
    expect(line(text, "completion_phases")).toBe("- completion_phases: Kiln builds the phases you added, then goes on to the pull request.");
    expect(line(text, "continue_test")).toBe("- continue_test: Kiln starts a session of test fixes; with changedImplementation true, Kiln starts a session of test fixes.");
  });

  it("a test audit with only delivery open: changed implementation runs the delivery audit, then the test work or the pull request", () => {
    const text = nextStepsForecast({ kind: "test_audit", fixing: false, closed: { delivery: false, test: true }, latestTestContinues: false });
    expect(line(text, "continue_test")).toBe("- continue_test: Kiln starts a session of test fixes; with changedImplementation true, Kiln runs the delivery audit, then starts a session of test fixes.");
    expect(line(text, "completion_phases")).toBe("- completion_phases: Kiln builds the phases you added, then runs the delivery audit, then goes on to the pull request.");
  });

  it("a test audit with delivery closed and test open: its phases, then the test audit again", () => {
    expect(line(nextStepsForecast({ kind: "test_audit", fixing: false, closed: { delivery: true, test: false }, latestTestContinues: false }), "completion_phases")).toBe("- completion_phases: Kiln builds the phases you added, then runs the test audit.");
  });

  it("a line that leads only to the pull request says Kiln stops there for a holding item; a test audit's also asks for each row left as a test item (AC-ITEM-01, AC-LAST-05)", () => {
    const delivery = nextStepsForecast({ kind: "delivery_audit", fixing: false, closed: { delivery: true, test: true }, latestTestContinues: false });
    expect(full(delivery, "passed")).toBe(`- passed: Kiln goes on to the pull request.${HOLD}`);
    expect(full(nextStepsForecast({ kind: "delivery_audit", fixing: false, closed: open, latestTestContinues: false }), "passed")).toBe("- passed: Kiln runs the test audit.");
    const test = nextStepsForecast({ kind: "test_audit", fixing: false, closed: open, latestTestContinues: false });
    expect(full(test, "passed")).toBe(`- passed: Kiln goes on to the pull request; with changedImplementation true, Kiln runs the delivery audit, then runs the test audit.${HOLD}${ROWS}`);
    expect(full(test, "completion_phases")).toBe("- completion_phases: Kiln builds the phases you added, then runs the delivery audit, then runs the test audit.");
    expect(full(test, "continue_test")).not.toContain(HOLD);
    expect(full(test, "needs_you")).toBe("- needs_you: Kiln stops at Needs you.");
  });

  it("a session of test fixes is told that raising no row ends the test work (AC-LAST-01)", () => {
    const sentence = "If you raised none of the rows you took, do not report continue_test: report passed and list each row left as a `test` item. That ends the test work.";
    expect(nextStepsForecast({ kind: "test_audit", fixing: true, closed: open, latestTestContinues: false })).toContain(sentence);
    expect(nextStepsForecast({ kind: "test_audit", fixing: false, closed: open, latestTestContinues: false })).not.toContain(sentence);
  });

  it("never gives a loop number or says last", () => {
    for (const kind of ["delivery_audit", "test_audit"] as const) for (const delivery of [true, false]) for (const test of [true, false]) for (const fixing of [true, false]) for (const latestTestContinues of [true, false]) {
      const text = nextStepsForecast({ kind, fixing, closed: { delivery, test }, latestTestContinues });
      expect(text).not.toMatch(/\d|last/i);
    }
  });
});

describe("stepsAfter, the rule the forecast words (Kiln Planned Test Fix Batches, \"Reading the Plan\")", () => {
  const test = (closed: { delivery: boolean; test: boolean }, fixing = false) => ({ kind: "test_audit" as const, fixing, closed, latestTestContinues: false });
  it("leads a continue_test result to a new test audit only when it changed implementation while both kinds have a loop left", () => {
    expect(stepsAfter(test(open), "continue_test", false)).toEqual(["session of test fixes"]);
    expect(stepsAfter(test(open), "continue_test", true)).toEqual(["delivery audit", "test audit"]);
    expect(stepsAfter(test({ delivery: false, test: true }), "continue_test", true)).toEqual(["delivery audit", "session of test fixes"]);
    expect(stepsAfter(test({ delivery: true, test: false }), "continue_test", true)).toEqual(["session of test fixes"]);
  });
  it("puts a session of test fixes first after a delivery audit only when the test kind is closed and saved test work remains", () => {
    const delivery = (closed: { delivery: boolean; test: boolean }, latestTestContinues: boolean) => ({ kind: "delivery_audit" as const, fixing: false, closed, latestTestContinues });
    expect(stepsAfter(delivery({ delivery: false, test: true }, true), "passed", false)).toEqual(["session of test fixes"]);
    expect(stepsAfter(delivery({ delivery: false, test: true }, true), "completion_phases", false)).toEqual(["delivery audit"]);
    expect(stepsAfter(delivery({ delivery: true, test: true }, true), "completion_phases", false)).toEqual(["session of test fixes"]);
    expect(stepsAfter(delivery(open, true), "passed", false)).toEqual(["test audit"]);
    expect(stepsAfter(delivery(open, true), "needs_you", false)).toEqual([]);
  });
});
