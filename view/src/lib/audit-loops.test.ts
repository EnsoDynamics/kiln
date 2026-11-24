import { describe, expect, it } from "vitest";
import { LOOP_STOP_LINE, loopSettingsHelp, parsedLimit, positionText, refusalShown } from "./audit-loops.js";
import { positionText as enginePositionText } from "../../../src/engine/loop-view.js";

describe("the two limits' help text, from the numbers shown (Kiln Deliver When Audit Loops Run Out AC-CHOICE-01)", () => {
  it("words the defaults as mockup screen 1 draws them", () => {
    const help = loopSettingsHelp({ deliveryLimit: 4, testLimit: 4 });
    expect(help.intro).toBe("After the planned phases close, two audits check the work. Each run of an audit is one loop; Kiln builds or fixes whatever it finds. These set how many loops of each Kiln makes. After the last one, Kiln moves on without auditing again.");
    expect(help.delivery).toBe("The delivery audit checks that every acceptance criterion is built, and Kiln builds the phases it adds. Each run of the audit is one loop. After the phases from loop 4 are built, Kiln goes on to the test audit.");
    expect(help.test).toBe("The test audit checks that the tests would notice if a criterion broke, and Kiln builds or fixes what it finds. Each run of the audit is one loop. After the work from loop 4 is done, Kiln opens the pull request, after a delivery audit if one is left.");
    expect(help.changeable).toBe("Both can be changed while Kiln runs, from the page or the command line.");
  });

  it("follows other numbers, in the full and the short words", () => {
    expect(loopSettingsHelp({ deliveryLimit: 2, testLimit: 7 }).delivery).toContain("After the phases from loop 2 are built");
    expect(loopSettingsHelp({ deliveryLimit: 2, testLimit: 7 }, true).test).toBe("After the work from loop 7 is done, Kiln opens the pull request, after a delivery audit if one is left.");
  });

  it("offers no sentence accepting Weak rows", () => {
    for (const short of [false, true]) expect(Object.values(loopSettingsHelp({ deliveryLimit: 4, testLimit: 4 }, short)).join(" ")).not.toMatch(/\baccept\b|Weak rows/i);
  });

  it("takes only a whole number of 1 or more", () => {
    expect(parsedLimit("2")).toBe(2);
    expect(["0", "-1", "1.5", "", "two"].map(parsedLimit)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe("the loop an audit row is, and where the run is (AC-STOP-05)", () => {
  it("words the position as the engine and kiln status do", () => {
    const positions = [
      { audit: "delivery", loop: 2, limit: 4 },
      { audit: "test", loop: 2, limit: 4, fixing: true },
      { audit: "test", loop: 4, limit: 4 },
    ] as const;
    expect(positions.map(positionText)).toEqual(["Delivery audit loop 2 of 4", "Fixing tests from test audit loop 2 of 4", "Test audit loop 4 of 4"]);
    for (const position of positions) expect(positionText(position)).toBe(enginePositionText(position));
  });

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
