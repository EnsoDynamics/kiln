// Sleep detection over recorded sequences of each operating system's suspend readings
// (technical design, "Testing Approach": sleep detection), including a clock change that isn't
// a sleep.

import { describe, expect, it } from "vitest";
import { linuxOffset, linuxSleepSince, macSleepSince, parseMacSleepWake, parsePowerEvents, windowsSleepsSince } from "./sleep-readings.js";

// Read on this Mac on 2026-10-17: it last slept 11:05:24 UTC and woke 11:07:03 UTC.
const MAC_READING = "{ sec = 1792249524, usec = 371856 } Sat Oct 17 11:05:24 2026\n{ sec = 1792249623, usec = 975601 } Sat Oct 17 11:07:03 2026\n";
const MAC_NEVER_SLEPT = "{ sec = 0, usec = 0 } Thu Jan  1 00:00:00 1970\n{ sec = 0, usec = 0 } Thu Jan  1 00:00:00 1970\n";

describe("macOS: kern.sleeptime and kern.waketime", () => {
  it("parses both timevals", () => {
    expect(parseMacSleepWake(MAC_READING)).toEqual({ sleep: 1792249524.371856, wake: 1792249623.975601 });
    expect(parseMacSleepWake("sysctl: unknown oid")).toBeUndefined();
  });

  it("finds a sleep only when the wake time changes from the last reading", () => {
    const before = parseMacSleepWake(MAC_READING)!;
    // The first reading is only the baseline: that sleep happened before Kiln was looking.
    expect(macSleepSince(undefined, before)).toBeUndefined();
    expect(macSleepSince(before, before)).toBeUndefined();
    expect(macSleepSince(parseMacSleepWake(MAC_NEVER_SLEPT)!, parseMacSleepWake(MAC_NEVER_SLEPT)!)).toBeUndefined();

    const after = { sleep: 1792260000.5, wake: 1792260300.25 };
    expect(macSleepSince(before, after)).toEqual({ at: "2026-10-17T18:00:00.500Z", seconds: 300 });
  });
});

describe("Linux: /proc/uptime against the monotonic clock", () => {
  it("reads the offset between time since boot with suspend and without", () => {
    expect(linuxOffset("12345.67 54321.00\n", 12000.5)).toBeCloseTo(345.17);
    expect(linuxOffset("garbage", 1)).toBeUndefined();
  });

  it("counts growth of more than 2 seconds as a sleep that began after the last reading", () => {
    const first = { offset: 345.1, at: "2026-10-17T14:00:00.000Z" };
    expect(linuxSleepSince(undefined, first)).toBeUndefined();
    // Drift between the two clocks over 10 seconds is milliseconds, never a sleep.
    expect(linuxSleepSince(first, { offset: 345.15, at: "2026-10-17T14:00:10.000Z" })).toBeUndefined();
    expect(linuxSleepSince(first, { offset: 347.0, at: "2026-10-17T14:00:10.000Z" })).toBeUndefined();
    expect(linuxSleepSince(first, { offset: 945.1, at: "2026-10-17T14:10:10.000Z" })).toEqual({ at: "2026-10-17T14:00:00.000Z", seconds: 600 });
  });

  it("isn't fooled by the wall clock jumping, which moves neither clock it compares", () => {
    // NTP steps the wall clock back an hour between readings: the readings' times jump, the offset doesn't.
    const first = { offset: 345.1, at: "2026-10-17T14:00:00.000Z" };
    expect(linuxSleepSince(first, { offset: 345.11, at: "2026-10-17T13:00:10.000Z" })).toBeUndefined();
  });
});

describe("Windows: Kernel-Power events 42 and 107", () => {
  const events = parsePowerEvents(
    JSON.stringify([
      { id: 107, recordId: 9012, time: "2026-10-17T14:10:05.0000000Z" },
      { id: 42, recordId: 9010, time: "2026-10-17T14:00:01.0000000Z" },
      { id: 107, recordId: 8800, time: "2026-10-16T08:00:00.0000000Z" },
      { id: 42, recordId: 8790, time: "2026-10-16T01:00:00.0000000Z" },
    ]),
  );

  it("parses PowerShell's JSON, one event or many, in record order", () => {
    expect(events.map((event) => event.recordId)).toEqual([8790, 8800, 9010, 9012]);
    expect(parsePowerEvents(JSON.stringify({ id: 42, recordId: 1, time: "2026-10-17T14:00:01Z" }))).toHaveLength(1);
    expect(parsePowerEvents("")).toEqual([]);
    expect(parsePowerEvents("not json")).toEqual([]);
  });

  it("pairs each resume newer than the last reading with the sleep before it", () => {
    expect(windowsSleepsSince(undefined, events)).toEqual([]);
    expect(windowsSleepsSince(8800, events)).toEqual([{ at: "2026-10-17T14:00:01.000Z", seconds: 604 }]);
    expect(windowsSleepsSince(9012, events)).toEqual([]);
    // A resume with no sleep logged before it isn't counted.
    expect(windowsSleepsSince(0, parsePowerEvents(JSON.stringify([{ id: 107, recordId: 5, time: "2026-10-17T14:10:05Z" }])))).toEqual([]);
  });
});
