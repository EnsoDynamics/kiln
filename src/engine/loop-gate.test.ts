// Which phases a recorded audit attempt counts as appended (AC-TEST-02's first row): only an
// admitted report's, never a refused one whose claims Kiln did not validate.
import { describe, expect, it } from "vitest";
import { attemptPhases } from "./loop-gate.js";
import type { AuditResult } from "../audit/contracts.js";

const attempt = (report: unknown, refusal?: AuditResult["refusal"]): AuditResult => ({
  id: "r1", activityId: "a1", reportDigest: "d", reportBytes: JSON.stringify(report), at: "2026-11-15T00:00:00Z", revision: 1,
  disposition: "unresolved", checks: [], nextAction: "needs_you", ...(refusal ? { refusal } : {}),
});

describe("attemptPhases", () => {
  it("reads the phases an admitted needs_you report appended", () => {
    expect(attemptPhases(attempt({ schemaVersion: 2, outcome: "needs_you", completionPhases: ["3"], needsYou: [] }))).toEqual(["3"]);
  });
  it("counts none from a refused report, even one malformed or claiming phases", () => {
    const refusal = { code: "invalid_report" as const, status: 422 as const, reason: "Bad report.", criteria: [] };
    expect(attemptPhases(attempt({}, refusal))).toEqual([]);
    expect(attemptPhases(attempt({ schemaVersion: 2, outcome: "needs_you", completionPhases: ["9"] }, { ...refusal, code: "inconsistent_plan" }))).toEqual([]);
  });
  it("counts none with no attempt", () => expect(attemptPhases(undefined)).toEqual([]));
});
