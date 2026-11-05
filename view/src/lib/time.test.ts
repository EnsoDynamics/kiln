// Times as the screens show them, with a day when not today (assumptions UI-010 item 8).
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import { ago, clockTime, countdown, earlier, elapsed, limitTime, outputTime, resetsIn, shortDuration, stepTime, timeSpan, timingText } from "./time.js";

const now = new Date("2026-10-17T15:47:00Z"); // Saturday 11:47 AM in New York

describe("a time on screen", () => {
  it("is drawn as the clock today, and carries its day otherwise (UI-010 item 8)", () => {
    expect(clockTime("2026-10-17T15:52:00Z", now)).toBe("11:52 AM");
    expect(clockTime("2026-10-17T03:52:00Z", now, { afterWord: true })).toBe("yesterday 11:52 PM");
    expect(clockTime("2026-10-17T03:52:00Z", now)).toBe("Yesterday 11:52 PM");
    expect(clockTime("2026-10-12T13:17:00Z", now)).toBe("Mon 9:17 AM");
    expect(clockTime("2026-10-02T13:17:00Z", now)).toBe("Oct 2, 9:17 AM");
  });

  it("gives a span's shared day and AM or PM once", () => {
    expect(timeSpan("2026-10-17T13:17:00Z", "2026-10-17T14:09:00Z", now)).toBe("9:17 to 10:09 AM");
    expect(timeSpan("2026-10-17T14:58:00Z", "2026-10-17T16:17:00Z", now)).toBe("10:58 AM to 12:17 PM");
    expect(timeSpan("2026-10-17T03:20:00Z", "2026-10-17T04:40:00Z", now)).toBe("Yesterday 11:20 PM to 12:40 AM");
    expect(timeSpan("2026-10-12T13:17:00Z", "2026-10-12T14:09:00Z", now)).toBe("Mon 9:17 to 10:09 AM");
  });

  it("keeps the output and step columns to the clock, with a day when not today", () => {
    expect(outputTime("2026-10-17T17:20:51Z", now)).toBe("13:20:51");
    expect(outputTime("2026-10-16T17:20:51Z", now)).toBe("Yesterday 13:20:51");
    expect(stepTime("2026-10-17T14:58:00Z", now)).toBe("10:58");
  });

  it("words spans and distances as drawn", () => {
    expect(shortDuration(52 * 60_000)).toBe("52m");
    expect(shortDuration(338 * 60_000)).toBe("5h 38m");
    expect(shortDuration(120 * 60_000)).toBe("2h");
    expect(elapsed(49 * 60_000 + 30_000)).toBe("49 min");
    expect(elapsed(72 * 60_000)).toBe("1h 12m");
    expect(ago("2026-10-17T15:45:00Z", now)).toBe("2 min ago");
    expect(ago("2026-10-17T15:46:40Z", now)).toBe("just now");
    expect(earlier("2026-10-17T15:44:00Z", "2026-10-17T15:52:00Z")).toBe("8 min earlier");
    expect(resetsIn("2026-10-17T16:59:00Z", now)).toBe("Resets in 1h 12m");
    expect(resetsIn("2026-10-21T16:00:00Z", now)).toBe("Resets in 4d");
    expect(resetsIn("2026-10-17T16:00:00Z", now)).toBe("Resets in 13m");
  });
});

describe("a usage limit's times (usage-limit recovery AC-LIMIT-01)", () => {
  it("rounds to the nearest minute, and gives the weekday for a later day", () => {
    expect(limitTime("2026-10-17T16:58:59.700Z", now)).toBe("12:59 PM");
    expect(limitTime("2026-10-17T16:58:20Z", now)).toBe("12:58 PM");
    expect(limitTime("2026-10-21T12:00:00Z", now)).toBe("Wed 8:00 AM");
    expect(limitTime("2026-10-30T12:00:00Z", now)).toBe("Oct 30, 8:00 AM");
    expect(limitTime("2026-10-17T03:52:00Z", now)).toBe("yesterday 11:52 PM");
  });

  it("counts down in minutes, hours and minutes, or days and hours", () => {
    expect(countdown("2026-10-17T16:59:00Z", now)).toBe("1h 12m");
    expect(countdown("2026-10-17T16:00:00Z", now)).toBe("13m");
    expect(countdown("2026-10-19T19:47:00Z", now)).toBe("2d 4h");
    expect(countdown("2026-10-19T15:47:00Z", now)).toBe("2d");
  });
});

describe("running and waiting clocks", () => {
  it("ticks only the active clock, freezes at disconnect, and never advances completed totals", () => {
    const asOf = "2026-10-24T12:00:00Z";
    const now = Date.parse(asOf);
    const timing = { runningMs: 90 * 60_000, waitingMs: 9 * 3_600_000, asOf };
    expect(timingText({ ...timing, advancing: "running" }, now + 30 * 60_000)).toBe("2h running · 9h waiting");
    expect(timingText({ ...timing, advancing: "waiting" }, now + 30 * 60_000)).toBe("1h 30m running · 9h 30m waiting");
    expect(timingText({ ...timing, advancing: "running" }, now)).toBe("1h 30m running · 9h waiting");
    expect(timingText(timing, now + 3_600_000)).toBe("1h 30m running · 9h waiting");
  });
});
