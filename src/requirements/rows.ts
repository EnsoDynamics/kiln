// The plan a PRD shows (Kiln Requirements Stages, technical design "Rows"): done rows from its
// recorded stages, the current row, then the plan's entries from the cursor, with Kiln's own
// review rows and the Build row. Built on every snapshot, never stored. The cursor moves only when
// a stage or feedback report sets the standing, or the plan changes.

import { planKeys, type PlanStage, type RequirementsPlan } from "./plan.js";
import type { MilestoneName, NextStage, RequirementsState, StageReport } from "./stages.js";

/** A row Kiln inserted for a stage the method put next that the plan doesn't have there. */
export interface InsertedRow { skill: string; title: string; reaches: MilestoneName[]; key: string }

/** The entry a stage session is expected to run next (technical design, "What a session is told"), with its key. */
export function plannedNext(plan: RequirementsPlan | undefined, state: RequirementsState): { stage: PlanStage; key: string } | undefined {
  if (!plan || state.standing && "unknown" in state.standing || state.cursorLost) return undefined;
  if (state.inserted) return { stage: state.inserted, key: state.inserted.key };
  const stage = plan.stages[state.cursor];
  return stage && { stage, key: planKeys(plan.stages)[state.cursor]! };
}

/** The lowest `<skill>#<n>` that neither the plan nor this PRD's recorded stages use. */
export function freeKey(plan: RequirementsPlan | undefined, state: RequirementsState, skill: string): string {
  const used = new Set([...planKeys(plan?.stages ?? []), ...state.stages.map(stage => stage.key)]);
  let n = 1;
  while (used.has(`${skill}#${n}`)) n++;
  return `${skill}#${n}`;
}

const indexFrom = (stages: PlanStage[], from: number, skill: string) => {
  for (let i = Math.max(0, from); i < stages.length; i++) if (stages[i]!.skill === skill) return i;
  return -1;
};

/**
 * Moves the cursor for a stage or feedback report that set the standing (technical design,
 * "Rows"), and says what changed when the report passed an entry that didn't run, ran a stage the
 * plan didn't have next, or made Kiln insert a row. `atStop`: the standing is one the driver
 * stops at, so the report's `next` names that stop's review, not a stage.
 */
export function advanceCursor(plan: RequirementsPlan, state: RequirementsState, task: "stage" | "feedback", report: StageReport, atStop: boolean): string[] {
  const stages = plan.stages;
  const pos = state.cursor;
  const expected = plannedNext(plan, state);
  // From an unknown standing the files can't say which entries are behind, so the notice names where Kiln goes on from (AC-BEGIN-04).
  const unknown = !!state.standing && "unknown" in state.standing;
  delete state.inserted;
  delete state.cursorLost;
  const changes: string[] = [];
  const ran = task === "stage" ? report.ran[0] : undefined;
  // What ran ends at the last plan entry its skills reach in order, so a session that ran several stages passes none of them (AC-PLAN-06).
  let ranAt = -1;
  let firstRanAt = -1;
  // Entries between two that ran didn't run: they are named as passed.
  const skipped: string[] = [];
  if (task === "stage") for (const one of report.ran) {
    const at = indexFrom(stages, ranAt >= 0 ? ranAt + 1 : pos, one.skill);
    if (at < 0) continue;
    if (ranAt >= 0) skipped.push(...stages.slice(ranAt + 1, at).map(stage => stage.title));
    else firstRanAt = at;
    ranAt = at;
  }
  if (ran && expected && ran.skill !== expected.stage.skill) changes.push(`The session ran ${ran.title} where the plan had ${expected.stage.title} next.`);
  const next = report.next as NextStage;
  if (atStop) {
    // The entry right after the one that reached the stop is the stop's review when it makes one; otherwise Kiln's row stays.
    if (ranAt < 0) { if (ran || task === "stage") state.cursorLost = true; return changes; }
    // Every entry the cursor moves past that didn't run is named, as away from a stop (AC-PLAN-06).
    const passed = [...(firstRanAt > pos ? stages.slice(pos, firstRanAt).map(stage => stage.title) : []), ...skipped];
    if (!unknown && passed.length) changes.push(`Passed ${passed.join(", ")}, which the method didn't run for this PRD.`);
    state.cursor = stages[ranAt + 1]?.reaches.includes("review_made") ? ranAt + 2 : ranAt + 1;
    return changes;
  }
  if (next.kind !== "requirements") return changes;
  const from = ranAt >= 0 ? ranAt + 1 : pos;
  // The cursor is the first entry at or after its last position whose skill is the standing's next.
  const found = indexFrom(stages, pos, next.skill);
  if (found >= 0) {
    const passed = [...skipped, ...(found > from ? stages.slice(from, found).map(stage => stage.title) : [])];
    if (unknown) changes.push(`Kiln continues from ${stages[found]!.title}, where the method found this PRD stands.`);
    else if (passed.length) changes.push(`Passed ${passed.join(", ")}, which the method didn't run for this PRD.`);
    state.cursor = found;
    return changes;
  }
  state.cursor = Math.min(from, stages.length);
  state.inserted = { skill: next.skill, title: next.title, reaches: next.reaches, key: freeKey(plan, state, next.skill) };
  changes.push(`Kiln added ${next.title}, which the method put next and the plan didn't have here.`);
  return changes;
}

export interface PlannedRow {
  key: string; title: string; skill: string; reaches: MilestoneName[];
  addedByKiln?: "early" | "final"; stop?: "early" | "final"; state: "next" | "planned";
}

/**
 * The plan's rows from the cursor on, with Kiln's two review rows and each stop marked on the row
 * it follows (technical design, "Rows"). `currentKey`: the stage key the current row already
 * shows, which is left out. `next`: the first row is the one Kiln runs next, at a stop or between
 * sessions.
 */
export function plannedRows(plan: RequirementsPlan, state: RequirementsState, options: { currentKey?: string; next: boolean; fromStart?: boolean }): PlannedRow[] {
  const stages = plan.stages;
  const keys = planKeys(stages);
  const review = plan.reviewSkill;
  const start = options.fromStart ? 0 : Math.min(state.cursor, stages.length);
  const rows: PlannedRow[] = [];
  if (!options.fromStart && state.inserted && state.inserted.key !== options.currentKey) rows.push({ ...state.inserted, state: "planned" });
  for (let i = start; i < stages.length; i++) {
    if (keys[i] === options.currentKey) continue;
    rows.push({ key: keys[i]!, title: stages[i]!.title, skill: stages[i]!.skill, reaches: stages[i]!.reaches, state: "planned" });
  }
  const recorded = (key: string) => state.stages.some(stage => stage.key === key);
  const milestones = state.standing && "milestones" in state.standing ? state.standing.milestones.map(m => m.name) : [];
  // Early stakeholder review follows the first entry reaching prd_refined, unless the entry after it makes a review or it was already held.
  const refined = stages.findIndex(stage => stage.reaches.includes("prd_refined"));
  if (!state.earlyReviewHeld && !recorded("kiln:early") && (refined < 0 || !stages[refined + 1]?.reaches.includes("review_made"))) {
    const after = refined >= start && !options.fromStart ? rows.findIndex(row => row.key === keys[refined]) : options.fromStart ? refined : -1;
    // The refining entry may be the current row, which the caller shows before these rows.
    const current = refined >= 0 && keys[refined] === options.currentKey;
    const at = after >= 0 ? after + 1 : current || refined >= 0 && refined < start || milestones.includes("prd_refined") ? 0 : -1;
    if (at >= 0) {
      if (at > 0) rows[at - 1]!.stop = "early";
      rows.splice(at, 0, { key: "kiln:early", title: "Early stakeholder review", skill: review.skill, reaches: ["review_made"], addedByKiln: "early", state: "planned" });
    }
  } else if (refined >= 0 && stages[refined + 1]?.reaches.includes("review_made")) {
    const row = rows.find(one => one.key === keys[refined]);
    if (row) row.stop = "early";
  }
  const finished = stages.findIndex(stage => stage.reaches.includes("requirements_finished"));
  const finishedRow = finished >= 0 ? rows.find(one => one.key === keys[finished]) : rows.at(-1);
  if (finishedRow) finishedRow.stop = "final";
  if (!recorded("kiln:final") && (finished < 0 || !stages[finished + 1]?.reaches.includes("review_made"))) {
    rows.push({ key: "kiln:final", title: "Final stakeholder review", skill: review.skill, reaches: ["review_made"], addedByKiln: "final", state: "planned" });
  }
  if (options.next && rows[0]) rows[0].state = "next";
  return rows;
}
