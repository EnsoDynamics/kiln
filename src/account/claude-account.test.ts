import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOT_SIGNED_IN, parseAuthStatus, parseUsage } from "./claude-account.js";

const recorded = readFileSync(new URL("../../test/fixtures/proof-gate-1/usage-report-idle.jsonl", import.meta.url), "utf8");
const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: "" });

/** A /usage output whose report holds these limits. */
const usageWith = (limits: unknown) => `{"type":"system","subtype":"init"}\n${JSON.stringify({ type: "assistant", usage_report: { rate_limits: { limits } } })}\n{"type":"result"}\n`;

describe("the account (claude auth status --json)", () => {
  it("names the email and the plan, its first letter capitalized", () => {
    expect(parseAuthStatus(ok('{"loggedIn":true,"email":"alex@acme-shop.dev","subscriptionType":"max"}'))).toEqual({ email: "alex@acme-shop.dev", plan: "Max plan" });
  });

  it("keeps the organization, which tells one email's personal plan from its Team seat (usage-limit recovery)", () => {
    expect(parseAuthStatus(ok('{"loggedIn":true,"email":"alex@acme-shop.dev","orgId":"5f1c-org","subscriptionType":"team"}'))).toEqual({ email: "alex@acme-shop.dev", orgId: "5f1c-org", plan: "Team plan" });
  });

  it("leaves the plan out when there is none, as with an API-key login", () => {
    expect(parseAuthStatus(ok('{"loggedIn":true,"email":"alex@acme-shop.dev"}'))).toEqual({ email: "alex@acme-shop.dev" });
  });

  it("is not signed in when loggedIn is false, whatever the exit code", () => {
    expect(parseAuthStatus({ exitCode: 1, stdout: '{"loggedIn":false}', stderr: "" })).toEqual({ error: NOT_SIGNED_IN });
    expect(NOT_SIGNED_IN).toBe("Not signed in to Claude Code. Run `claude auth login`.");
  });

  it("sanitizes unreadable authentication output (AC-RUN-06)", () => {
    expect(parseAuthStatus({ exitCode: 1, stdout: "", stderr: "claude: unknown command auth\n" })).toEqual({ error: "Could not read Claude Code account information. Check `claude auth status` in a terminal, then recheck." });
    expect(parseAuthStatus({ exitCode: null, stdout: "", stderr: "", failure: "timed out after 120 seconds" })).toEqual({ error: "Could not read Claude Code account information. Check `claude auth status` in a terminal, then recheck." });
  });
});

describe("the usage limits (headless /usage)", () => {
  it("reads a recorded report in the server's order, with long and short labels, each row keeping its kind and scope (usage-limit recovery)", () => {
    const reading = parseUsage(recorded, true);
    expect(reading.limitsError).toBeUndefined();
    expect(reading.limits).toEqual([
      { kind: "session", label: "5-hour window", shortLabel: "5-hour", percent: 5, resetsAt: "2026-10-17T18:59:59.628228+00:00", nearLimit: false },
      { kind: "weekly_all", label: "Weekly", shortLabel: "weekly", percent: 42, resetsAt: "2026-10-21T11:59:59.628252+00:00", nearLimit: false },
      { kind: "weekly_scoped", scope: { by: "model", name: "Fable" }, label: "Weekly · Fable", shortLabel: "Fable", percent: 0, resetsAt: "2026-10-21T12:00:00+00:00", nearLimit: false },
    ]);
  });

  it("names a scoped row by its surface when it has no model, and leaves out unknown kinds and nameless scoped rows", () => {
    const reading = parseUsage(
      usageWith([
        { kind: "weekly_all", percent: 80 },
        { kind: "weekly_scoped", percent: 10, scope: { model: null, surface: { display_name: "Claude Code" } } },
        { kind: "monthly_overage", percent: 3 },
        { kind: "weekly_scoped", percent: 4, scope: { model: null, surface: null } },
        { kind: "session", percent: 79.5 },
      ]),
      true,
    );
    expect(reading.limits.map((limit) => [limit.label, limit.shortLabel, limit.nearLimit])).toEqual([
      ["Weekly", "weekly", true],
      ["Weekly · Claude Code", "Claude Code", false],
      ["5-hour window", "5-hour", false],
    ]);
  });

  it("shows no limits and no message for an empty list", () => {
    expect(parseUsage(usageWith([]), true)).toEqual({ limits: [] });
  });

  it("reads boolean overflow independently of absent usage rows in SDKUsageReport", () => {
    for (const limits of [null, undefined, []]) for (const enabled of [true, false, undefined, "true"]) {
      const stdout = JSON.stringify({ usage_report: { rate_limits: { limits, extra_usage: { is_enabled: enabled } } } });
      const reading = parseUsage(stdout, true);
      expect(reading.limits).toEqual([]);
      expect(reading.extraUsageEnabled).toBe(typeof enabled === "boolean" ? enabled : undefined);
      expect(reading.limitsError).toBe(limits === null || limits === undefined ? "Claude Code didn't report this plan's usage limits." : undefined);
    }
  });

  it("says Claude Code didn't report a plan's limits when the report or its limits are missing, and nothing without a plan", () => {
    const missing = "Claude Code didn't report this plan's usage limits.";
    expect(parseUsage('{"type":"result"}\n', true)).toEqual({ limits: [], limitsAvailable: false, limitsError: missing });
    expect(parseUsage(`${JSON.stringify({ type: "assistant", usage_report: { rate_limits: null } })}\n`, true)).toEqual({ limits: [], limitsAvailable: false, limitsError: missing });
    expect(parseUsage(usageWith(null), true)).toEqual({ limits: [], limitsAvailable: false, limitsError: missing });
    expect(parseUsage('{"type":"result"}\n', false)).toEqual({ limits: [], limitsAvailable: false });
  });

  it("gives an error in place of guessed numbers for a shape it doesn't recognize", () => {
    const unrecognized = { limits: [], limitsError: "Claude Code reported its usage limits in a shape Kiln doesn't recognize." };
    expect(parseUsage(usageWith([{ percent: 4 }]), true)).toEqual(unrecognized);
    expect(parseUsage(usageWith([{ kind: "session", percent: "4%" }]), true)).toEqual(unrecognized);
    expect(parseUsage(usageWith({ session: 4 }), true)).toEqual(unrecognized);
  });
});
