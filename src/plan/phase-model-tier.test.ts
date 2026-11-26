// The Model tier line (Kiln Phase Model Tiers AC-TIER-01; technical design "The Tier Line").

import { describe, expect, it } from "vitest";
import { readModelTierLine, readPhaseDocument } from "./phase-document.js";
import { readPhasePlan } from "./phase-plan.js";
import { planStructure, recordedPlan } from "../engine/plan-reading.js";

const doc = (preamble: string, body = "") => `# Phase 1: Card refunds\n\n**Parent PRD:** [x](x-prd.md)\n${preamble}\n\n## Summary\nText.\n${body}\n## Acceptance criteria covered\nAC-REF-01\n`;

describe("the Model tier line", () => {
  it("reads the tier, any case, and the reason after a hyphen, an em dash or a colon, or after the tier word", () => {
    expect(readModelTierLine("**Model tier:** demanding — AC-REF-04 requires one refund when the provider retries")).toEqual({ tier: "demanding", reason: "AC-REF-04 requires one refund when the provider retries" });
    expect(readModelTierLine("**Model tier:** Mechanical - repeats phase 1's builder")).toEqual({ tier: "mechanical", reason: "repeats phase 1's builder" });
    expect(readModelTierLine("**Model tier:** STANDARD: the usual")).toEqual({ tier: "standard", reason: "the usual" });
    expect(readModelTierLine("**Model tier:** mechanical repeats the importer")).toEqual({ tier: "mechanical", reason: "repeats the importer" });
    expect(readModelTierLine("**Model tier:** standard")).toEqual({ tier: "standard", reason: "" });
  });

  it("gives nothing for a line naming none of the three tiers, or no line", () => {
    expect(readModelTierLine("**Model tier:** premium — the best")).toBeUndefined();
    expect(readModelTierLine("**Model tier:**")).toBeUndefined();
    expect(readModelTierLine(undefined)).toBeUndefined();
  });

  it("reads only the first line above the first ## heading and outside a code fence", () => {
    expect(readPhaseDocument("phase-1-card-refunds.md", doc("**Model tier:** demanding — money\n**Model tier:** mechanical — later")).modelTier).toEqual({ tier: "demanding", reason: "money" });
    expect(readPhaseDocument("phase-1-card-refunds.md", doc("", "**Model tier:** demanding — below the heading\n")).modelTier).toBeUndefined();
    expect(readPhaseDocument("phase-1-card-refunds.md", doc("```\n**Model tier:** demanding — fenced\n```")).modelTier).toBeUndefined();
  });

  it("never makes a plan fail to read, and is left out of plan comparisons", () => {
    const rated = readPhasePlan([{ fileName: "phase-1-card-refunds.md", markdown: doc("**Model tier:** demanding — money") }]);
    const unrated = readPhasePlan([{ fileName: "phase-1-card-refunds.md", markdown: doc("**Model tier:** nonsense") }]);
    expect(rated.problems).toEqual([]); expect(unrated.problems).toEqual([]);
    expect(recordedPlan(rated)[0]!.modelTier).toEqual({ tier: "demanding", reason: "money" });
    expect(recordedPlan(unrated)[0]!.modelTier).toBeUndefined();
    // A plan record saved before Kiln read the line still matches its plan read back from Git.
    expect(planStructure(recordedPlan(rated))).toEqual(planStructure(recordedPlan(unrated)));
  });
});
