// The saved plan's label (missing worktree recovery AC-FACTS-02): the first row of the PRD's
// table that applies, comparing leaf ids and closed state with the plan where the run's latest
// work now lives.

import { describe, expect, it } from "vitest";
import { savedLabel } from "./folder-facts.js";

const saved = (entries: [string, boolean][]) => new Map(entries);
const leaves = (entries: [string, boolean][]) => entries.map(([id, closed]) => ({ id, closed }));

describe("the saved plan's label", () => {
  it("is Out of date when the saved plan lacks phases or closed phases that plan has (the 2026-11-06 case)", () => {
    expect(savedLabel(saved([["1", true], ["5", true]]), leaves([["1", true], ["5", true], ["6", false]]), "base")).toEqual({ label: "out_of_date" });
    expect(savedLabel(saved([["1", true], ["2", false]]), leaves([["1", true], ["2", true]]), "branch")).toEqual({ label: "out_of_date" });
  });

  it("Matches the branch or the base branch when they agree", () => {
    expect(savedLabel(saved([["1", true], ["2", false]]), leaves([["1", true], ["2", false]]), "branch")).toEqual({ label: "matches_branch" });
    expect(savedLabel(saved([["1", true]]), leaves([["1", true]]), "base")).toEqual({ label: "matches_base" });
  });

  it("is Ahead of that plan when it records closed phases that plan lacks, naming them", () => {
    expect(savedLabel(saved([["3", true], ["4", true], ["5", false]]), leaves([["3", true], ["4", false], ["5", false]]), "base")).toEqual({ label: "ahead", aheadPhases: ["4"] });
  });

  it("puts Out of date first when both apply, as the table's first row", () => {
    expect(savedLabel(saved([["4", true]]), leaves([["4", false], ["5", true]]), "base")).toEqual({ label: "out_of_date" });
  });

  it("counts leaves only, never a split record", () => {
    expect(savedLabel(saved([["2a", true]]), [{ id: "2", closed: false, splitInto: ["2a"] }, { id: "2a", closed: true }], "base")).toEqual({ label: "matches_base" });
  });

  it("labels a saved plan that differs only by unclosed phases the compared plan lacks Out of date, as no row of the table applies", () => {
    expect(savedLabel(saved([["1", true], ["9", false]]), leaves([["1", true]]), "base")).toEqual({ label: "out_of_date" });
  });
});
