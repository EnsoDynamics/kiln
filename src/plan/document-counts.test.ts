import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSUMPTIONS, DESIGN, PRD } from "../test-support/fixture-documents.js";
import { citedLabels, countAssumptions, countDesignCitations, countPrdCriteria } from "./document-counts.js";

describe("countPrdCriteria", () => {
  it("counts bold-label list items, leaving out retired and fully superseded criteria and labels elsewhere", () => {
    expect(countPrdCriteria(PRD)).toEqual({
      labels: ["AC-RET-01", "AC-RET-02", "AC-RET-03", "AC-DASH-01"],
      count: 4,
      firstLabel: "AC-RET-01",
      lastLabel: "AC-DASH-01",
    });
  });

  it("has no first or last label for a PRD without criteria", () => {
    expect(countPrdCriteria("# PRD\n\nNo criteria yet.\n")).toEqual({ labels: [], count: 0, firstLabel: undefined, lastLabel: undefined });
  });
});

describe("citedLabels", () => {
  it.each([
    ["AC-START-01 to 09", ["AC-START-01", "AC-START-02", "AC-START-03", "AC-START-04", "AC-START-05", "AC-START-06", "AC-START-07", "AC-START-08", "AC-START-09"]],
    ["AC-START-01–03", ["AC-START-01", "AC-START-02", "AC-START-03"]],
    ["AC-START-01 to AC-START-02", ["AC-START-01", "AC-START-02"]],
    ["AC-CLI-01, 02; AC-VIEW-01 to 03", ["AC-CLI-01", "AC-CLI-02", "AC-VIEW-01", "AC-VIEW-02", "AC-VIEW-03"]],
    ["(AC-KEEP-02), AC-RUN-05.", ["AC-KEEP-02", "AC-RUN-05"]],
  ])("reads %j", (text, expected) => {
    expect([...citedLabels(text)].sort()).toEqual([...expected].sort());
  });
});

describe("countDesignCitations", () => {
  it("counts the PRD's criteria the design cites, by range", () => {
    expect(countDesignCitations(DESIGN, countPrdCriteria(PRD).labels)).toBe(4);
    expect(countDesignCitations("Only AC-RET-02 and AC-OTHER-01.", countPrdCriteria(PRD).labels)).toBe(1);
  });
});

describe("countAssumptions", () => {
  it("counts entries and validated rows, and the entries not yet confirmed", () => {
    expect(countAssumptions(ASSUMPTIONS)).toEqual({ total: 4, notYetConfirmed: 2 });
  });
});

describe("the Kiln v1 PRD's own documents", () => {
  const read = (name: string) => readFileSync(new URL(`../../docs/prds/kiln-v1/${name}`, import.meta.url), "utf8");

  // Real documents written by the skills, checked for what holds however they are edited: the
  // design cites every criterion (its coverage table) and the criteria run START to PROOF.
  it("count every criterion, all of them cited by the design, and the assumptions", () => {
    const criteria = countPrdCriteria(read("kiln-v1-prd.md"));
    expect(criteria.count).toBeGreaterThan(0);
    expect(criteria.firstLabel).toBe("AC-START-01");
    expect(criteria.lastLabel).toBe("AC-PROOF-02");
    expect(countDesignCitations(read("technical-design.md"), criteria.labels)).toBe(criteria.count);
    const assumptions = countAssumptions(read("assumptions.md"));
    expect(assumptions.total).toBeGreaterThan(assumptions.notYetConfirmed);
  });
});
