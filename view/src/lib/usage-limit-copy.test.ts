import { describe, expect, it } from "vitest";
import type { LimitView } from "../../../src/engine/snapshot.js";
import { automaticResumeStatus, limitStopCopy, waitingCopy } from "./usage-limit.js";

process.env.TZ = "America/New_York";
const now = new Date("2026-10-26T18:06:00Z");
const limit: LimitView = { agentId: "codex", label: "A usage limit", resetPassed: false, account: { email: "fixture@example.invalid", at: "2026-10-26T18:05:00Z" } };
describe("automatic resume countdown", () => {
  const since = "2026-10-26T18:00:00Z";
  const scheduled: LimitView = { label: "5-hour window", resetPassed: false, resetsAt: "2026-10-26T19:00:00Z", automaticResume: { label: "5-hour window", at: "2026-10-26T19:01:00Z" } };
  it("includes the full buffer, then replaces the bar with availability checking", () => {
    const before = automaticResumeStatus(scheduled, since, new Date("2026-10-26T19:00:00Z"), true, false);
    expect(before.headline).toBe("Will resume automatically in 1m");
    expect(before.detail).toContain("1-minute reset buffer");
    expect(before.progress).toBeCloseTo(60 / 61 * 100);
    const due = automaticResumeStatus(scheduled, since, new Date("2026-10-26T19:01:00Z"), true, false);
    expect(due.headline).toBe("Checking usage availability…");
    expect(due.progress).toBeUndefined();
  });
  it("updates remaining minutes and clamps elapsed time before a wait", () => {
    expect(automaticResumeStatus(scheduled, since, now, true, false).headline).toBe("Will resume automatically in 55m");
    expect(automaticResumeStatus(scheduled, since, new Date("2026-10-26T17:59:00Z"), true, false).progress).toBe(0);
    const weekly = { ...scheduled, automaticResume: { label: "Weekly", at: "2026-10-28T20:01:00Z" } };
    expect(automaticResumeStatus(weekly, since, now, true, false).headline).toBe("Will resume automatically in 2d 1h 55m");
  });
  it("never invents a countdown for unknown reset times or Codex permission", () => {
    for (const unknown of [limit, { ...scheduled, automaticResume: { label: "Weekly" } }]) {
      const status = automaticResumeStatus(unknown, since, now, true, false);
      expect(status.headline).toBe("Will resume automatically when usage is available");
      expect(status.progress).toBeUndefined();
    }
  });
  it("lets disabled recovery and active prechecks override the deadline", () => {
    expect(automaticResumeStatus(scheduled, since, now, false, false).headline).toBe("Automatic resume is off");
    const checking = automaticResumeStatus(scheduled, since, now, true, true);
    expect(checking.headline).toBe("Resuming automatically…");
    expect(checking.progress).toBeUndefined();
  });
});
describe("independently dated Codex allowance copy", () => {
  it.each(["waiting", "stopped"])("uses the allowance reading in %s, not nearby authentication", screen => {
    const reading: LimitView = { ...limit, allowancesObservation: { observedAt: "2026-10-26T18:00:00Z", state: "stale", reason: "Optional usage failed" } };
    const footnote = screen === "waiting" ? waitingCopy("1", reading, now).footnote : limitStopCopy("1", reading, true, now).footnote;
    expect(footnote).toContain("Stale usage last updated 2:00 PM."); expect(footnote).not.toContain("2:05 PM");
  });
  it.each(["waiting", "stopped"])("reports undated %s allowances unavailable", screen => {
    const footnote = screen === "waiting" ? waitingCopy("1", limit, now).footnote : limitStopCopy("1", limit, true, now).footnote;
    expect(footnote).toContain("Usage observation unavailable."); expect(footnote).not.toContain("2:05 PM");
  });
  it.each(["waiting", "stopped"])("shows an actual current %s usage date", screen => {
    const reading: LimitView = { ...limit, allowancesObservation: { observedAt: "2026-10-26T18:00:00Z", state: "current", reason: null } };
    const footnote = screen === "waiting" ? waitingCopy("1", reading, now).footnote : limitStopCopy("1", reading, true, now).footnote;
    expect(footnote).toContain("Usage last updated 2:00 PM."); expect(footnote).not.toContain("Stale");
  });
});
