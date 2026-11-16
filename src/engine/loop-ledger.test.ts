// The two sentences Kiln quotes as the person's words, and where and when it says the person chose
// them (Kiln Audit Loop Limits AC-LOOP-06).
import { describe, expect, it } from "vitest";
import { sourceText } from "./loop-ledger.js";
import { acceptSentence, itemName } from "../state/audit-loops.js";

describe("the Accept sentence (AC-LOOP-06)", () => {
  it("names each listed item, joined as the requirements write it", () => {
    expect(acceptSentence([])).toBe("I accept the remaining Weak rows.");
    expect(acceptSentence([{ name: "AC-REFUND-04" }])).toBe("I accept the remaining Weak rows, and AC-REFUND-04.");
    expect(acceptSentence([{ name: "AC-REFUND-04" }, { name: "AC-APPROVAL-01" }, { name: "AC-RETURNS-03" }])).toBe("I accept the remaining Weak rows, and AC-REFUND-04, AC-APPROVAL-01 and AC-RETURNS-03.");
  });

  it("names a row by its criterion's ID, anything else in the audit's own words", () => {
    expect(itemName({ criterion: "AC-REFUND-04", problem: "Only a mocked test covers the refund." })).toBe("AC-REFUND-04");
    expect(itemName({ problem: "The carrier has no sandbox." })).toBe("The carrier has no sandbox");
  });
});

describe("where and when the person chose a sentence (AC-LOOP-06)", () => {
  const at = "2026-11-15T14:05:09.000Z";
  it("says each place the default's sentence can be chosen, with its time", () => {
    expect(sourceText({ kind: "person", where: "documents_found", at })).toBe("chosen on Documents found at 2026-11-15 14:05 UTC");
    expect(sourceText({ kind: "person", where: "run_page", at })).toBe("chosen on the run's page at 2026-11-15 14:05 UTC");
    expect(sourceText({ kind: "person", where: "command_line", at })).toBe("chosen with kiln settings at 2026-11-15 14:05 UTC");
  });

  it("says where an Accept was given, with its time", () => {
    expect(sourceText({ via: "browser", at, accept: true })).toBe("given on the run's page at 2026-11-15 14:05 UTC");
    expect(sourceText({ via: "command_line", at, accept: true })).toBe("given with the command line at 2026-11-15 14:05 UTC");
  });
});
