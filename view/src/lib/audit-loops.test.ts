import { describe, expect, it } from "vitest";
import { LOOP_STOP_LINE, loopSettingsHelp, parsedLimit, refusalShown } from "./audit-loops.js";

describe("the two limits' help text, from the numbers shown (Kiln Deliver When Audit Loops Run Out AC-CHOICE-01)", () => {
  it("says a loop is one audit plus its work and each limit the most a run makes, in both forms (Kiln Planned Test Fix Batches AC-MAX-02)", () => {
    const help = loopSettingsHelp({ deliveryLimit: 4, testLimit: 4 });
    expect(help.intro).toBe("After the planned phases close, two audits check the work. Each loop is one audit plus the work it finds. A run makes only the loops it needs; these are the most it will make.");
    expect(help.delivery).toBe("The delivery audit checks that every acceptance criterion is built, and Kiln builds the phases it adds. If a run reaches loop 4, Kiln builds the phases from it and goes on to the test audit.");
    expect(help.test).toBe("The test audit checks that the tests would notice if a criterion broke, and Kiln builds or fixes what it finds. If a run reaches loop 4, Kiln finishes the work from it and opens the pull request, after a delivery audit if one is left.");
    expect(help.changeable).toBe("Both can be changed while Kiln runs, from the page or the command line.");
    const short = loopSettingsHelp({ deliveryLimit: 4, testLimit: 4 }, true);
    expect(short.intro).toBe("Each loop is one audit plus the work it finds. A run makes only the loops it needs; these are the most it will make.");
    for (const form of [help, short]) expect(Object.values(form).join(" ")).not.toMatch(/Each run of (an|the) audit is one loop|These set how many loops|After the last one|After the (phases|work) from loop/);
  });

  it("follows other numbers, in the full and the short words", () => {
    expect(loopSettingsHelp({ deliveryLimit: 2, testLimit: 7 }).delivery).toContain("If a run reaches loop 2, Kiln builds the phases from it");
    expect(loopSettingsHelp({ deliveryLimit: 2, testLimit: 7 }, true).delivery).toBe("If a run reaches loop 2, Kiln builds the phases from it and goes on to the test audit.");
    expect(loopSettingsHelp({ deliveryLimit: 2, testLimit: 7 }, true).test).toBe("If a run reaches loop 7, Kiln finishes the work from it and opens the pull request, after a delivery audit if one is left.");
    expect(loopSettingsHelp({ deliveryLimit: 1, testLimit: 12 }).test).toContain("If a run reaches loop 12, Kiln finishes the work from it");
  });

  it("offers no sentence accepting Weak rows", () => {
    for (const short of [false, true]) expect(Object.values(loopSettingsHelp({ deliveryLimit: 4, testLimit: 4 }, short)).join(" ")).not.toMatch(/\baccept\b|Weak rows/i);
  });

  it("takes only a whole number of 1 or more", () => {
    expect(parsedLimit("2")).toBe(2);
    expect(["0", "-1", "1.5", "", "two"].map(parsedLimit)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("the stored loop stop (AC-STOP-05)", () => {
  it("gives a stored loop stop the engine's one line", () => {
    expect(LOOP_STOP_LINE).toBe("Kiln no longer stops at a loop limit. Check again to go on.");
  });
});

describe("a refused limit (AC-CHOICE-02)", () => {
  it("shows the server's floor message on its field", () => {
    const floor = "Enter 2 or more: this run has already made 2 delivery audit loops.";
    expect(refusalShown({ reason: "Invalid settings.", fieldErrors: { deliveryLimit: floor } })).toEqual({ fields: { deliveryLimit: floor } });
    expect(refusalShown({ reason: "Invalid settings.", fieldErrors: { testLimit: "Enter a whole number of 1 or more." } })).toEqual({ fields: { testLimit: "Enter a whole number of 1 or more." } });
  });
  it("shows the reason when no limit's field is named", () => {
    expect(refusalShown({ reason: "Kiln is busy." })).toEqual({ fields: {}, reason: "Kiln is busy." });
  });
});
