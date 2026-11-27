import { expect, it } from "vitest";
import { newRequirements, readStageReport, reviewDue } from "./stages.js";

const block = (data: unknown) => "```kiln-report\n" + JSON.stringify(data) + "\n```";
const report = { kilnReport: 1, ran: [], finished: true, next: { kind: "build", skill: "build", title: "Build", reaches: [] }, milestones: [] };

it("uses only the last report and treats build next as a final-review milestone", () => {
  const parsed = readStageReport(block(report), "stage");
  expect(parsed?.milestones).toEqual([{ name: "requirements_finished", by: "earlier" }]);
  expect(reviewDue(parsed!.milestones!, newRequirements(), false)).toBe("final");
  expect(readStageReport(block(report) + "\n" + block({ ...report, next: { ...report.next, kind: "unexpected" } }), "stage")).toBeUndefined();
  expect(readStageReport(JSON.stringify(report), "stage")).toBeUndefined();
});

it("uses the stage standing, design presence, prior review and refresh request to select the early stop", () => {
  const state = newRequirements();
  const refined = [{ name: "prd_refined", by: "earlier" }] as const;
  expect(reviewDue([...refined], state, true)).toBeUndefined();
  expect(reviewDue([...refined], state, false)).toBe("early");
  state.earlyReviewHeld = true;
  expect(reviewDue([...refined], state, false)).toBeUndefined();
  state.refreshAsked = true;
  expect(reviewDue([...refined], state, false)).toBe("early");
  expect(reviewDue([...refined, { name: "requirements_finished", by: "this_session" }], state, false)).toBe("final");
});
