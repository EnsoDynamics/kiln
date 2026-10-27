import { describe, expect, it } from "vitest";
import type { LimitView } from "../../../src/engine/snapshot.js";
import { limitStopCopy, waitingCopy } from "./usage-limit.js";

process.env.TZ = "America/New_York";
const now = new Date("2026-10-26T18:06:00Z");
const limit: LimitView = { agentId: "codex", label: "A usage limit", resetPassed: false, account: { email: "fixture@example.invalid", at: "2026-10-26T18:05:00Z" } };
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
