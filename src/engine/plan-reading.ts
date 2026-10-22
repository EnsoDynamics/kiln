// Reading the phase plan once the feature is underway, from the worktree, where the sessions
// write the Closed lines (PRD AC-RUN-01, AC-RUN-04; technical design, "A plan that breaks
// after Start"). Only the structural checks apply after Start.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAncestorOf, isPhaseFileName } from "../plan/phase-ids.js";
import { leavesOf, readPhasePlan, type PhasePlan, type PlannedPhase } from "../plan/phase-plan.js";
import type { RecordedPlanPhase } from "../state/records.js";

export type PlanRead = { ok: true; plan: PhasePlan } | { ok: false; problem: string };

/**
 * Reads the plan in a PRD directory. A missing worktree or directory, no phase documents, an
 * unreadable file or a structural problem is a plan problem, with its fact; an empty plan never
 * reads as "no leaf left".
 */
export function readPlanAt(worktreePath: string, prdDirectoryFromRoot: string): PlanRead {
  const prdDirectory = join(worktreePath, ...prdDirectoryFromRoot.split("/"));
  for (const path of [worktreePath, prdDirectory]) {
    if (!existsSync(path)) return { ok: false, problem: `Couldn't read the phase plan: ${path} doesn't exist` };
  }
  try {
    const fileNames = readdirSync(prdDirectory).filter(isPhaseFileName);
    if (fileNames.length === 0) return { ok: false, problem: `No phase documents in ${prdDirectory}` };
    const plan = readPhasePlan(fileNames.map((fileName) => ({ fileName, markdown: readFileSync(join(prdDirectory, fileName), "utf8") })));
    if (plan.problems.length > 0) return { ok: false, problem: plan.problems.join(" ") };
    return { ok: true, plan };
  } catch (error) {
    return { ok: false, problem: (error as Error).message };
  }
}

/** The next phase to implement: the first leaf without a Closed line, in plan order. */
export function nextLeaf(plan: PhasePlan): PlannedPhase | undefined {
  return leavesOf(plan).find((phase) => !phase.closed);
}

/**
 * The leaf a session's done check judges: the launched leaf, or, when the plan now shows it as
 * a split record, the first leaf below it in plan order. Undefined when no document in the plan
 * has the launched leaf's id.
 */
export function judgedLeaf(plan: PhasePlan, launchedId: string): PlannedPhase | undefined {
  return judgedPhase(plan.phases, launchedId);
}

/** {@link judgedLeaf} over any plan-ordered phase list, the recorded plan included. */
export function judgedPhase<T extends { id: string; splitInto?: string[] | undefined }>(phases: T[], launchedId: string): T | undefined {
  const launched = phases.find((phase) => phase.id === launchedId);
  if (!launched || launched.splitInto === undefined) return launched;
  return phases.find((phase) => phase.splitInto === undefined && isAncestorOf(launchedId, phase.id));
}

export function recordedPlan(plan: PhasePlan): RecordedPlanPhase[] {
  return plan.phases.map((phase) => ({
    id: phase.id,
    title: phase.title,
    file: phase.fileName,
    ...(phase.splitInto === undefined ? {} : { splitInto: phase.splitInto }),
    closed: phase.closed,
    repositories: phase.repositories,
  }));
}

/** The leaves of a recorded plan, in plan order. */
export function recordedLeaves(plan: RecordedPlanPhase[]): RecordedPlanPhase[] {
  return plan.filter((phase) => phase.splitInto === undefined);
}
