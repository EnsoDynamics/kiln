// Whether a run that exited was cut off by a sleep (technical design, "Interruptions, sleep and
// resume"). Kiln decides this from its own record, never from what the session said: a sleep
// recorded on the run, and no model response on that run after the latest such sleep was
// detected. Both facts belong to the one run, never to the session as a whole.

import type { SessionRecord } from "../state/records.js";
import type { StreamEvent } from "./session-output.js";

/** One line of `events.jsonl`: the event exactly as received, stamped with its arrival. */
export interface SavedEvent {
  at: string;
  event: StreamEvent;
}

/**
 * A model response: an `assistant` event, top level or subagent, whose model isn't
 * `<synthetic>` (Claude Code writes synthetic assistant messages for API errors it gives up on).
 * A tool result, a system event (an API retry included) or a partial delta doesn't count: a tool
 * finishes after wake whether or not the network is back, and retries mean the session hasn't
 * got through yet.
 */
export function isModelResponse(event: StreamEvent): boolean {
  return event.type === "assistant" && event.message?.model !== "<synthetic>";
}

/**
 * The sleep that cut a run off, if one did: a sleep recorded on the run, with no model response
 * arriving after the latest such sleep was detected. Arrival stamps and `detectedAt` are both
 * Kiln's own clock.
 *
 *   sleepInterruption(record.sleeps, 0, ["2026-10-17T18:40:02.000Z"])
 *   // { at: "2026-10-17T18:41:00.000Z" } when a sleep detected at 18:43 is on run 0
 */
export function sleepInterruption(sleeps: SessionRecord["sleeps"], runIndex: number, modelResponseTimes: string[]): { at: string } | undefined {
  const onRun = sleeps.filter((sleep) => sleep.run === runIndex);
  if (onRun.length === 0) return undefined;
  const latest = onRun.reduce((a, b) => (b.detectedAt > a.detectedAt ? b : a));
  // A run that got a model response after waking survived the sleep; its later exit ended on its own.
  if (modelResponseTimes.some((at) => at > latest.detectedAt)) return undefined;
  return { at: latest.at };
}
