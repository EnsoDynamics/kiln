import { describe, expect, it } from "vitest";
import { runTiming } from "./timing.js";

const at = (hours: number) => new Date(Date.UTC(2026, 9, 24) + hours * 3_600_000).toISOString();
const hour = 3_600_000;

describe("running and waiting time", () => {
  it("excludes an overnight stop from running time after resume", () => {
    const timing = runTiming([{ startedAt: at(0), endedAt: at(2) }, { startedAt: at(11) }], at(0), at(11.5), "running");
    expect(timing.runningMs).toBe(2.5 * hour);
    expect(timing.waitingMs).toBe(9 * hour);
    expect(timing.advancing).toBe("running");
  });

  it("counts waiting while stopped and fixes both totals once complete", () => {
    const runs = [{ startedAt: at(0), endedAt: at(2) }];
    expect(runTiming(runs, at(0), at(3), "waiting")).toEqual({ runningMs: 2 * hour, waitingMs: hour, asOf: at(3), advancing: "waiting" });
    expect(runTiming(runs, at(0), at(3))).toEqual({ runningMs: 2 * hour, waitingMs: hour, asOf: at(3) });
  });

  it("caps a sleeping run at interruption, ignores zero-length failed starts and unions overlapping intervals", () => {
    const timing = runTiming([
      { startedAt: at(0), endedAt: at(10), interruptedAt: at(2) },
      { startedAt: at(11), endedAt: at(11) },
      { startedAt: at(12), endedAt: at(14) },
      { startedAt: at(13), endedAt: at(15) },
    ], at(0), at(16));
    expect(timing.runningMs).toBe(5 * hour);
    expect(timing.waitingMs).toBe(11 * hour);
  });
});
