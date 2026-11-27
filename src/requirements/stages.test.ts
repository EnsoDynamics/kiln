import { expect, it } from "vitest";
import { FEEDBACK_LIMIT_BYTES, feedbackProblem, newRequirements, readStageReport, reviewDue } from "./stages.js";

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

it("reads each message's outcome and what changed, and refuses a report whose message outcomes don't read", () => {
  const parsed = readStageReport(block({ ...report, messages: [{ id: "m-1", outcome: "worked_in" }, { id: "m-2", outcome: "not_worked_in" }], changes: ["Staff can look up a balance."] }), "feedback");
  expect(parsed?.messages).toEqual([{ id: "m-1", outcome: "worked_in" }, { id: "m-2", outcome: "not_worked_in" }]);
  expect(parsed?.changes).toEqual(["Staff can look up a balance."]);
  expect(readStageReport(block({ ...report, messages: [{ id: "m-1", outcome: "maybe" }] }), "feedback")).toBeUndefined();
  expect(readStageReport(block({ ...report, messages: "m-1" }), "stage")).toBeUndefined();
  // A review session takes no messages, so they are not read from its report.
  expect(readStageReport(block({ ...report, messages: [{ id: "m-1", outcome: "worked_in" }] }), "review")?.messages).toBeUndefined();
});

it("takes feedback up to 32 KiB of well-formed text", () => {
  expect(feedbackProblem("x".repeat(FEEDBACK_LIMIT_BYTES))).toBeUndefined();
  expect(feedbackProblem("é".repeat(FEEDBACK_LIMIT_BYTES / 2 + 1))).toMatch(/32 KiB/);
  for (const bad of ["", "  \n", "a\0b", "\ud800", 7]) expect(feedbackProblem(bad)).toBeDefined();
});
