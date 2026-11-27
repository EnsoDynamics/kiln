// A feedback session runs on the Requirements stages row, inside the design span too (Kiln
// Requirements Stages, "Models"), while a stage in that span runs on Refining the design.
import { expect, it } from "vitest";
import { rowOfActivity } from "./activity-models.js";
import { newRequirements } from "../requirements/stages.js";
import type { PrdRecord } from "../state/records.js";

it("puts a feedback session on Requirements stages even while the design span is open", () => {
  const requirements = { ...newRequirements(), designSpan: true, stages: [
    { activityId: "a", key: "autonomous-design-refinement#1", task: "stage" as const, ran: [], reaches: [], startedAt: "2026-11-27T00:00:00Z" },
    { activityId: "b", key: "kiln:feedback#1", task: "feedback" as const, ran: [], reaches: [], startedAt: "2026-11-27T01:00:00Z", messageIds: ["m-1"] },
  ] };
  const record = { requirements } as unknown as PrdRecord;
  expect(rowOfActivity([], "req-a", record)).toBe("refining_design");
  expect(rowOfActivity([], "req-b", record)).toBe("requirements");
});
