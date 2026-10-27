import type { Snapshot } from "../engine/snapshot.js";
import type { History } from "./history.js";
import { recentSavedOutput } from "./logs.js";
import { deadlineCheck, type SavedWork } from "./private-state.js";
import { errorFact, type ControlError } from "./result.js";

export interface ActivityObservation {
  observed_at: string | null;
  description: string | null;
  fragment?: unknown;
}

/** Dated saved facts survive clearing the current view at pause/completion. Reads never migrate. */
export function latestActivity(work: SavedWork, history: History, view?: Snapshot, retained?: ActivityObservation, deadline = Date.now() + 5000): { activity: ActivityObservation; errors: ControlError[] } {
  let activity: ActivityObservation = { observed_at: null, description: null };
  const errors = [...history.errors];
  const observe = (at: string | undefined | null, description: string | null, fragment?: unknown) => {
    if (at && Number.isFinite(Date.parse(at)) && (!activity.observed_at || Date.parse(at) >= Date.parse(activity.observed_at))) activity = { observed_at: at, description, ...(fragment ? { fragment } : {}) };
  };
  const record = work.record;
  observe(record.startedAt, "Run started.");
  observe(retained?.observed_at, retained?.description ?? null, retained?.fragment);
  for (const { phase, id, record: session } of history.sessions) {
    for (const run of session.runs) {
      observe(run.startedAt, "Session attempt started.");
      observe(run.endedAt, run.result?.text ?? "Session attempt ended.");
      observe(run.interruptedAt, "Session attempt interrupted.");
    }
    for (const step of session.steps) observe(step.startedAt, `${step.name} started.`);
    observe(session.lastSkill?.at, session.lastSkill ? `${session.lastSkill.name} skill started.` : null);
    try {
      deadlineCheck(deadline);
      for (const line of recentSavedOutput(work, phase, id, 1, deadline)) observe(line.at, line.text, line.fragment);
    } catch { errors.push(errorFact("state_unavailable", `Latest saved output for ${phase}/${id} is unavailable.`)); }
  }
  observe(view?.current?.seenInSession?.at, view?.current?.seenInSession?.text ?? null);
  observe(view?.current?.latestLine?.at, view?.current?.latestLine?.text ?? null);
  for (const facts of Object.values(record.phases)) {
    observe(facts.doneAt, "Activity completed.");
    observe(facts.stop?.at, "Activity needs you.");
    observe(facts.wait?.since, "Waiting for usage.");
  }
  observe(record.pause.activeSince, "Run paused.");
  observe(record.completedAt, "Run completed.");
  return { activity, errors };
}
