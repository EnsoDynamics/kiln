import { describe, expect, it } from "vitest";
import { carriedLabel, loopSettingsHelp, ordinal, parsedLimit, rowLoopLabel, SETTING_SENTENCE, stopLoopLine } from "./audit-loops.js";
import { SETTING_SENTENCE as ENGINE_SENTENCE } from "../../../src/state/audit-loops.js";

describe("the audit loop settings' help text, from the numbers shown (Kiln Audit Loop Limits AC-LOOP-01)", () => {
  it("words the defaults as mockup screen 1 draws them", () => {
    const help = loopSettingsHelp({ deliveryLimit: 3, testLimit: 3 });
    expect(help.delivery).toBe("Kiln builds what the audits find unfinished up to 3 times. Each loop is one audit that finds unfinished criteria, then the phases Kiln builds for them. If a 4th audit still finds something, Kiln stops at Needs you. It never delivers work the audit says is unfinished.");
    expect(help.test).toBe("After the test audit, Kiln runs up to 3 sessions of test fixes, each one a loop, and tells the 3rd it is the last. The audit itself isn’t a loop, even when it fixes a few small gaps on the spot. If a test shows a criterion was never finished, that is build work and counts as a delivery audit loop.");
    expect(help.deliver).toContain("You say: “I accept the remaining Weak rows after the last test audit loop.”");
    expect(help.ask).toBe("You accept nothing in advance. Kiln stops at Needs you with what is left.");
  });

  it("follows other numbers, with their ordinals", () => {
    expect(loopSettingsHelp({ deliveryLimit: 1, testLimit: 2 }).delivery).toContain("unfinished once. Each loop");
    expect(loopSettingsHelp({ deliveryLimit: 1, testLimit: 2 }).delivery).toContain("If a 2nd audit still finds something");
    expect(loopSettingsHelp({ deliveryLimit: 10, testLimit: 2 }).test).toContain("up to 2 sessions of test fixes, each one a loop, and tells the 2nd it is the last");
    expect(loopSettingsHelp({ deliveryLimit: 3, testLimit: 1 }).test).toContain("Kiln runs one session of test fixes, a loop, and tells it that it is the last");
    expect(loopSettingsHelp({ deliveryLimit: 3, testLimit: 4 }, true).test).toBe("Up to 4 sessions of test fixes after the test audit. The 4th is told it is the last.");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st"]);
  });

  it("takes only a whole number of 1 or more", () => {
    expect(parsedLimit("2")).toBe(2);
    expect(["0", "-1", "1.5", "", "two"].map(parsedLimit)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("quotes the engine's own sentence", () => {
    expect(SETTING_SENTENCE).toBe(ENGINE_SENTENCE);
  });
});

describe("an activity row's loop (AC-SHOW-01, AC-TEST-03)", () => {
  const loop = (number: number, last: boolean) => ({ number, limit: 3, last, startedAt: "2026-10-17T13:30:00Z", durationMs: 0 });
  it("reads by its latest loop: loop N of M, or last loop", () => {
    expect(rowLoopLabel({ loops: [loop(1, false), loop(2, false)] })).toBe("loop 2 of 3");
    expect(rowLoopLabel({ loops: [loop(2, false), loop(3, true)] })).toBe("last loop");
    expect(rowLoopLabel({})).toBeUndefined();
  });
  it("says which sentence a session carried", () => {
    expect(carriedLabel({ sentence: SETTING_SENTENCE, source: "chosen on Documents found at 2026-11-13 09:12 UTC" })).toBe("ran under your setting Deliver, unless something serious is left");
    expect(carriedLabel({ sentence: "I accept the remaining Weak rows, and AC-1.", source: "given on the run's page at 2026-11-15 14:05 UTC" })).toBe("carried your words “I accept the remaining Weak rows, and AC-1.” given on the run's page at 2026-11-15 14:05 UTC");
  });
  it("names a stop page's loop once", () => {
    expect(stopLoopLine({ label: "Loop 1 of 3", activity: "Phase 6", did: "Phase 6 built", durationMs: 0 })).toBe("Loop 1 of 3 · Phase 6 built");
    expect(stopLoopLine({ label: "Delivery audit", activity: "Delivery audit", did: "added Phase 9", durationMs: 0 })).toBe("Delivery audit · added Phase 9");
    expect(stopLoopLine({ label: "Last loop", activity: "Test audit", did: "Passed", durationMs: 0 })).toBe("Last loop · Test audit · Passed");
  });
});
