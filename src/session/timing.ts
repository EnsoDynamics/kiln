import type { SessionRun } from "../state/records.js";

/** Execution time, including tools, versus time with no recorded execution. */
export interface Timing {
  runningMs: number;
  waitingMs: number;
  asOf: string;
  advancing?: "running" | "waiting";
}

export function runTiming(runs: Pick<SessionRun, "startedAt" | "endedAt" | "interruptedAt">[], from: string, until: string, advancing?: Timing["advancing"]): Timing {
  const start = Date.parse(from);
  const end = Math.max(start, Date.parse(until));
  const intervals = runs.map(run => [
    Math.max(start, Date.parse(run.startedAt)),
    Math.min(end, Date.parse(run.interruptedAt ?? run.endedAt ?? until)),
  ]).sort((a, b) => a[0]! - b[0]!);
  let through = start;
  let runningMs = 0;
  for (const [left, right] of intervals) {
    runningMs += Math.max(0, right! - Math.max(through, left!));
    through = Math.max(through, right!);
  }
  return { runningMs, waitingMs: end - start - runningMs, asOf: until, ...(advancing ? { advancing } : {}) };
}
