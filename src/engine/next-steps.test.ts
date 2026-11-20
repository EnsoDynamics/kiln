// The audit prompt's {{nextSteps}} forecast (Kiln Deliver When Audit Loops Run Out, "Prompts";
// AC-LAST-03): the step each outcome leads to, by "Routing After the Last Loop", with no loop number and no "last".
import { describe, expect, it } from "vitest";
import { nextStepsForecast } from "./next-steps.js";

const open = { delivery: false, test: false };
const line = (text: string, outcome: string) => text.split("\n").find(one => one.startsWith(`- ${outcome}:`))!;

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

  it("never gives a loop number or says last", () => {
    for (const kind of ["delivery_audit", "test_audit"] as const) for (const delivery of [true, false]) for (const test of [true, false]) for (const fixing of [true, false]) for (const latestTestContinues of [true, false]) {
      const text = nextStepsForecast({ kind, fixing, closed: { delivery, test }, latestTestContinues });
      expect(text).not.toMatch(/\d|last/i);
    }
  });
});
