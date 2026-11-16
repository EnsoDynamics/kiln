// The build preflight's report line and saved state (build preflight "Reading the Result", "When the Preflight Is Due").
import { describe, expect, it } from "vitest";
import { preflightSettled, readPreflightReport, setPreflightDue } from "./preflight.js";
import { activityKeyKind, isPreflightKey, preflightKey } from "../state/activity-keys.js";
import type { PrdRecord } from "../state/records.js";

describe("reading a preflight's report (AC-PREFLIGHT-02, AC-PREFLIGHT-03, AC-PREFLIGHT-06)", () => {
  it("reads the first non-blank line, trimmed, as ready", () => {
    expect(readPreflightReport("\n  Preflight: ready  \n\n5 phases. The build runs to the end without stopping.")).toEqual({ outcome: "ready" });
  });

  it("reads items with their headline verbatim, each item without its marker, continuation lines joined, inline markdown kept", () => {
    const report = [
      "Preflight: 2 items need you",
      "",
      "1. The cloud sign-in for the development account expires in 8 hours.",
      "   Run `aws sso login --profile app-dev-longlived`.",
      "2. The repository's instructions say to ask before spending past the limit, and phase 4 will pass it.",
      "Nothing in the requirements authorizes that.",
      "",
      "**The build will stop** at phase 1, which needs you at the vendor's console (marked Attended).",
    ].join("\n");
    expect(readPreflightReport(report)).toEqual({
      outcome: "items",
      headline: "Preflight: 2 items need you",
      items: [
        "The cloud sign-in for the development account expires in 8 hours. Run `aws sso login --profile app-dev-longlived`.",
        "The repository's instructions say to ask before spending past the limit, and phase 4 will pass it. Nothing in the requirements authorizes that.",
      ],
    });
  });

  it("reads the singular form, keeps the session's order and duplicates, and never extracts the stop lines", () => {
    expect(readPreflightReport("Preflight: 1 item needs you\n\n1. Run `gh auth login`.\n\nThe build will stop at phase 2.")).toEqual({ outcome: "items", headline: "Preflight: 1 item needs you", items: ["Run `gh auth login`."] });
    expect(readPreflightReport("Preflight: 3 items need you\n\n1. B\n2. A\n3. B")).toMatchObject({ items: ["B", "A", "B"] });
    // A real session wrote the count with the plural verb; the line still reads as items.
    expect(readPreflightReport("Preflight: 1 item need you\n\n1. Set `TOKEN`.")).toMatchObject({ outcome: "items", items: ["Set `TOKEN`."] });
  });

  it("keeps the opening line and one item saying the items are in the full report when no numbered item is found", () => {
    expect(readPreflightReport("Preflight: 2 items need you\n\nSee above.")).toEqual({ outcome: "items", headline: "Preflight: 2 items need you", items: ["The items are in the full report."] });
  });

  it("reads anything else, a zero count or no final message as no report", () => {
    for (const text of [undefined, "", "   \n", "I could not finish the preflight.", "Preflight: 0 items need you", "preflight: ready", "Here is the report:\nPreflight: ready"]) expect(readPreflightReport(text)).toEqual({ outcome: "no_report" });
  });
});

describe("the preflight's saved state (When the Preflight Is Due)", () => {
  const record = (preflight: PrdRecord["preflight"], phases: PrdRecord["phases"] = {}) => ({ preflight, phases }) as unknown as PrdRecord;
  const facts = (doneAt?: string) => ({ sessionIds: [], finishedByPerson: false, repositories: {}, ...(doneAt ? { doneAt } : {}) });
  const activity = (id: string, outcome?: "ready" | "items" | "no_report") => ({ activityId: id, sequence: 1, createdAt: "2026-11-15T10:00:00Z", trigger: "start" as const, ...(outcome ? { result: { outcome, at: "2026-11-15T10:05:00Z" } } : {}) });

  it("is settled by a finished preflight that reported ready or was marked complete, never by no report", () => {
    expect(preflightSettled(record(undefined))).toBe(false);
    expect(preflightSettled(record({ activities: [activity("a", "ready")] }, { [preflightKey("a")]: facts("2026-11-15T10:05:00Z") }))).toBe(true);
    expect(preflightSettled(record({ activities: [activity("a")] }, { [preflightKey("a")]: facts("2026-11-15T10:05:00Z") }))).toBe(true);
    expect(preflightSettled(record({ activities: [activity("a", "no_report")] }, { [preflightKey("a")]: facts("2026-11-15T10:05:00Z") }))).toBe(false);
    expect(preflightSettled(record({ activities: [activity("a", "items")] }, { [preflightKey("a")]: facts() }))).toBe(false);
  });

  it("sets the due mark with its trigger", () => {
    const one = record(undefined);
    setPreflightDue(one, "unpause", "2026-11-15T10:00:00Z");
    expect(one.preflight).toEqual({ due: { trigger: "unpause", at: "2026-11-15T10:00:00Z" }, activities: [] });
  });
});

describe("the shared key classifier (build preflight \"Data Models\")", () => {
  it("never classifies a phase as a preflight or a preflight as a phase", () => {
    expect(activityKeyKind("preflight-0b1c")).toBe("preflight");
    expect(activityKeyKind("audit-0b1c")).toBe("audit");
    expect(activityKeyKind("pr")).toBe("final_delivery");
    for (const phase of ["1", "2a", "2a1", "10", "pre", "preflight"]) expect(activityKeyKind(phase)).toBe("phase");
    expect(isPreflightKey(preflightKey("x"))).toBe(true);
    expect(isPreflightKey(undefined)).toBe(false);
  });
});
