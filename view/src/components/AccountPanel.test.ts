import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import AccountPanel from "./AccountPanel.svelte";

const at = "2026-10-26T18:00:00Z";
const limits = [
  { kind: "session", label: "5-hour window", shortLabel: "5-hour", percent: 42, nearLimit: false },
  { kind: "weekly_all", label: "Weekly", shortLabel: "weekly", percent: 18, nearLimit: false },
  { kind: "weekly_fable", label: "Weekly · Fable", shortLabel: "Fable", percent: 9, nearLimit: false },
];

describe("account usage beside billing (AC-BILL-07)", () => {
  it.each([true, false])("preserves every reported gauge value with account details available=%s", identified => {
    const account = { agentId: "claude_code" as const, startedAt: at, updatedAt: at, limits,
      ...(identified ? { email: "fixture@example.test", plan: "Max plan" } : {}) };
    const { body } = render(AccountPanel, { props: { account, paused: false, now: Date.parse(at) } });
    const words = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    // Values come from the requirements example, independently of renderer calculations.
    for (const text of ["5-hour window 42%", "Weekly 18%", "Weekly · Fable 9% "]) expect(words).toContain(text);
    for (const percent of [42, 18, 9]) expect(body).toContain(`aria-valuenow="${percent}"`);
    expect(body.match(/role="meter"/g)).toHaveLength(3);
    if (!identified) expect(words).toContain("Account identity unavailable");
  });
});
