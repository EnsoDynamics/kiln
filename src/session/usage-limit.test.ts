// Recognizing a usage limit from a run's saved events, its label, and whether a reading after
// the refusal shows usage left (usage-limit recovery technical design, "Recognizing a Usage
// Limit", "Design Decisions"; AC-AUTO-01, AC-AUTO-02, AC-LIMIT-01). The refusal events follow the
// Agent SDK's typed `rate_limit_event`; the readings are built from the shape of a recorded `/usage`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseUsage, type AccountView, type UsageLimit } from "../account/claude-account.js";
import type { LimitRefusal } from "../state/records.js";
import type { SavedEvent } from "./run-verdict.js";
import { automaticResumeSchedule, blockingRow, judgeReading, labelForType, limitRow, limitSentence, sameAccount, usageLimitRefusal } from "./usage-limit.js";

const RESET = 1792699200; // 2026-10-22T20:00:00Z
const rateLimit = (at: string, status: string, extra: Record<string, unknown> = {}): SavedEvent => ({
  at,
  event: { type: "rate_limit_event", rate_limit_info: { status, resetsAt: RESET, rateLimitType: "five_hour", ...extra } },
});
const assistant = (at: string, model = "claude-opus-5-5"): SavedEvent => ({ at, event: { type: "assistant", message: { model, content: [{ type: "text", text: "Working." }] } } });
const synthetic = (at: string): SavedEvent => ({ at, event: { type: "assistant", error: "rate_limit", message: { model: "<synthetic>", content: [{ type: "text", text: "You've hit your limit" }] } } });
const result = (at: string): SavedEvent => ({ at, event: { type: "result", subtype: "success", is_error: true, result: "You've hit your limit" } });

/** A real run's events (proof gate 1), with a refusal placed at its end. */
function recordedRun(): SavedEvent[] {
  const lines = readFileSync(new URL("../../test/fixtures/proof-gate-1/resume-headless-after-interrupt.jsonl", import.meta.url), "utf8").split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => JSON.parse(line) as SavedEvent);
}

describe("recognizing a usage limit from a run's events (AC-AUTO-01)", () => {
  it("keeps the weekly refusal when subagents drain buffered responses and then report their own refusals", () => {
    // Projected from the real 2026-10-26 delivery-audit stream: only consumed fields,
    // anonymous parent/message IDs, original event order and arrival timestamps retained.
    const events = readFileSync(new URL("../../test/fixtures/usage-limit/weekly-refusal-with-subagents.jsonl", import.meta.url), "utf8")
      .trim().split("\n").map(line => JSON.parse(line) as SavedEvent);
    expect(usageLimitRefusal(events)).toEqual({ rateLimitType: "seven_day", label: "Weekly", resetsAt: "2026-10-28T12:00:00.000Z", at: "2026-10-26T08:30:31.274Z" });
    expect(usageLimitRefusal([...events, assistant("2026-10-26T08:31:00.000Z")])).toBeUndefined();
  });

  it("recognizes a tagged synthetic refusal without a rate report, but never guesses reset facts from its words", () => {
    expect(usageLimitRefusal([synthetic("2026-10-22T19:00:01.000Z")])).toEqual({ label: "A usage limit", at: "2026-10-22T19:00:01.000Z" });
    expect(usageLimitRefusal([synthetic("2026-10-22T19:00:01.000Z"), assistant("2026-10-22T19:00:30.000Z")])).toBeUndefined();
  });

  it.each([undefined, "authentication_failed"])("does not infer a refusal from synthetic limit prose with error %s", error => {
    const saved = synthetic("2026-10-22T19:00:01.000Z");
    saved.event.error = error;
    expect(usageLimitRefusal([saved])).toBeUndefined();
  });

  it("is a limit when the run's last rate_limit_event is rejected and no model response follows it", () => {
    const events = [assistant("2026-10-22T19:00:00.000Z"), rateLimit("2026-10-22T19:00:01.000Z", "rejected"), synthetic("2026-10-22T19:00:01.100Z"), result("2026-10-22T19:00:01.200Z")];
    expect(usageLimitRefusal(events)).toEqual({ rateLimitType: "five_hour", label: "5-hour window", resetsAt: "2026-10-22T20:00:00.000Z", at: "2026-10-22T19:00:01.000Z" });
  });

  it("is a limit at the end of a recorded real run, and isn't one in that run as recorded", () => {
    const run = recordedRun();
    expect(usageLimitRefusal(run)).toBeUndefined();
    const last = run.at(-1)!.at;
    expect(usageLimitRefusal([...run, rateLimit(last, "rejected"), synthetic(last)])?.rateLimitType).toBe("five_hour");
  });

  it("isn't a limit when a model response arrived after the refusal: the session got past it", () => {
    expect(usageLimitRefusal([rateLimit("2026-10-22T19:00:01.000Z", "rejected"), assistant("2026-10-22T19:00:30.000Z")])).toBeUndefined();
  });

  it("isn't a limit when the last report allowed the request, even after an earlier refusal", () => {
    expect(usageLimitRefusal([rateLimit("2026-10-22T19:00:01.000Z", "rejected"), rateLimit("2026-10-22T19:05:00.000Z", "allowed")])).toBeUndefined();
    expect(usageLimitRefusal([rateLimit("2026-10-22T19:00:01.000Z", "allowed_warning")])).toBeUndefined();
    expect(usageLimitRefusal([assistant("2026-10-22T19:00:00.000Z"), result("2026-10-22T19:00:01.000Z")])).toBeUndefined();
  });

  it("isn't decided by the session's words: a final message about a limit with no refusal event is no limit", () => {
    const said: SavedEvent = { at: "2026-10-22T19:00:00.000Z", event: { type: "result", subtype: "success", result: "I hit the 5-hour usage limit." } };
    expect(usageLimitRefusal([said])).toBeUndefined();
  });

  it("labels each type, and an unknown or missing type as A usage limit with no reset when none is given", () => {
    const refusal = (extra: Record<string, unknown>) => usageLimitRefusal([rateLimit("2026-10-22T19:00:01.000Z", "rejected", extra)]);
    expect(refusal({ rateLimitType: "seven_day" })?.label).toBe("Weekly");
    expect(refusal({ rateLimitType: "seven_day_opus" })?.label).toBe("Weekly · Opus");
    expect(refusal({ rateLimitType: "seven_day_sonnet" })?.label).toBe("Weekly · Sonnet");
    expect(refusal({ rateLimitType: "overage" })).toMatchObject({ rateLimitType: "overage", label: "A usage limit" });
    expect(refusal({ rateLimitType: undefined, resetsAt: undefined })).toEqual({ label: "A usage limit", at: "2026-10-22T19:00:01.000Z" });
  });

  it("puts each label in a sentence", () => {
    expect(["5-hour window", "Weekly", "Weekly · Fable", "A usage limit"].map(limitSentence)).toEqual(["the 5-hour usage limit", "the weekly usage limit", "the weekly Fable usage limit", "a usage limit"]);
    expect(labelForType(undefined)).toBe("A usage limit");
  });
});

// ---- Readings ----------------------------------------------------------------------------

const row = (kind: string, percent: number, extra: Partial<UsageLimit> = {}): UsageLimit => ({ kind, label: kind, shortLabel: kind, percent, nearLimit: percent >= 80, ...extra });
const scoped = (name: string, percent: number, by: "model" | "surface" = "model", resetsAt?: string): UsageLimit =>
  row("weekly_scoped", percent, { label: `Weekly · ${name}`, scope: { by, name }, ...(resetsAt ? { resetsAt } : {}) });
const reading = (limits: UsageLimit[], extra: Partial<AccountView> = {}): AccountView => ({
  email: "alex@acme-shop.dev",
  orgId: "org-1",
  plan: "Max plan",
  startedAt: "2026-10-22T19:05:00.000Z",
  updatedAt: "2026-10-22T19:05:02.000Z",
  limits,
  ...extra,
});
const refused = (extra: Partial<LimitRefusal> = {}): LimitRefusal => ({
  rateLimitType: "five_hour",
  label: "5-hour window",
  resetsAt: "2026-10-22T20:00:00.000Z",
  at: "2026-10-22T19:00:01.000Z",
  account: { email: "alex@acme-shop.dev", orgId: "org-1" },
  ...extra,
});
const OPUS = "claude-opus-5-5";

describe("the shared automatic resume schedule", () => {
  it("adds a minute to five-hour and weekly refusals", () => {
    for (const rateLimitType of ["five_hour", "seven_day"]) expect(automaticResumeSchedule(refused({ rateLimitType }), undefined, OPUS).at).toBe("2026-10-22T20:01:00.000Z");
  });
  it("uses the latest exhausted applicable reset even before the stopping reset passes", () => {
    const weekly = row("weekly_all", 100, { label: "Weekly", resetsAt: "2026-10-25T20:00:00Z" });
    expect(automaticResumeSchedule(refused(), reading([row("session", 100), weekly]), OPUS)).toEqual({ label: "Weekly", at: "2026-10-25T20:01:00.000Z" });
    expect(automaticResumeSchedule(refused(), reading([row("session", 100), scoped("Fable", 100, "model", weekly.resetsAt)]), OPUS).at).toBe("2026-10-22T20:01:00.000Z");
    expect(automaticResumeSchedule(refused(), reading([weekly], { startedAt: "2026-10-22T18:00:00Z" }), OPUS).at).toBe("2026-10-22T20:01:00.000Z");
    expect(automaticResumeSchedule(refused(), reading([weekly], { limitsError: "Unavailable" }), OPUS).at).toBe("2026-10-22T20:01:00.000Z");
  });
  it("has no timed promise for an unknown refusal or applicable blocker reset", () => {
    const unknown = refused();
    delete unknown.resetsAt;
    expect(automaticResumeSchedule(unknown, undefined, OPUS).at).toBeUndefined();
    expect(automaticResumeSchedule(unknown, reading([row("weekly_all", 100, { resetsAt: "2026-10-25T20:00:00Z" })]), OPUS).at).toBeUndefined();
    expect(automaticResumeSchedule(refused(), reading([row("weekly_all", 100, { label: "Weekly" })]), OPUS)).toEqual({ label: "Weekly" });
  });
  it("drops a released original limit and follows the new account's actual blocker", () => {
    const old = refused({ rateLimitType: "seven_day", label: "Weekly", resetsAt: "2026-11-02T20:00:00Z" });
    const current = [row("weekly_all", 10), row("session", 100, { label: "5-hour window", resetsAt: "2026-10-22T21:00:00Z" })];
    expect(automaticResumeSchedule(old, reading(current, { email: "new@example.test" }), OPUS)).toEqual({ label: "5-hour window", at: "2026-10-22T21:01:00.000Z" });
    // The same limit can be released on the original account too.
    expect(automaticResumeSchedule(old, reading(current), OPUS).at).toBe("2026-10-22T21:01:00.000Z");
    expect(automaticResumeSchedule(old, reading([row("session", 100, { label: "5-hour window" })], { email: "new@example.test" }), OPUS)).toEqual({ label: "5-hour window" });
  });
});

describe("has usage left (AC-AUTO-02)", () => {
  it("reads a recorded /usage: the 5-hour row below 100% is usage left, at 100% isn't", () => {
    const recorded = readFileSync(new URL("../../test/fixtures/proof-gate-1/usage-report-idle.jsonl", import.meta.url), "utf8");
    const limits = parseUsage(recorded, true).limits;
    expect(judgeReading(reading(limits), refused(), OPUS)).toBe("usage_left");
    const full = limits.map((limit) => (limit.kind === "session" ? { ...limit, percent: 100 } : limit));
    expect(judgeReading(reading(full), refused(), OPUS)).toBe("no_usage_left");
  });

  it("isn't usage left while another limit that applies reads 100%", () => {
    expect(judgeReading(reading([row("session", 20), row("weekly_all", 100)]), refused(), OPUS)).toBe("no_usage_left");
  });

  it("ignores a model-scoped weekly row at 100% for a model the session isn't running, but not one for its own model or a surface", () => {
    expect(judgeReading(reading([row("session", 20), scoped("Fable", 100)]), refused(), OPUS)).toBe("usage_left");
    expect(judgeReading(reading([row("session", 20), scoped("Opus", 100)]), refused(), OPUS)).toBe("no_usage_left");
    expect(judgeReading(reading([row("session", 20), scoped("Claude Code", 100, "surface")]), refused(), OPUS)).toBe("no_usage_left");
  });

  it("blocks on the stopping limit's own row whatever its model", () => {
    const weeklyOpus = refused({ rateLimitType: "seven_day_opus", label: "Weekly · Opus" });
    expect(judgeReading(reading([row("session", 10), scoped("Opus", 100)]), weeklyOpus, "claude-fable-5-1")).toBe("no_usage_left");
    expect(limitRow("seven_day_opus", [scoped("Opus", 40)])?.percent).toBe(40);
  });

  it("can't decide on the refused account with no row for the limit, and counts another account with none as usage left", () => {
    const noRow = reading([row("session", 10), row("weekly_all", 30)]);
    const weeklySonnet = refused({ rateLimitType: "seven_day_sonnet", label: "Weekly · Sonnet" });
    expect(judgeReading(noRow, weeklySonnet, OPUS)).toBe("undecided");
    expect(judgeReading({ ...noRow, email: "sam@acme-shop.dev" }, weeklySonnet, OPUS)).toBe("usage_left");
  });

  it("treats the same email under another organization as another account", () => {
    const overage = refused({ rateLimitType: "overage", label: "A usage limit" });
    const limits = [row("session", 10)];
    expect(judgeReading(reading(limits), overage, OPUS)).toBe("undecided");
    expect(judgeReading(reading(limits, { orgId: "org-team" }), overage, OPUS)).toBe("usage_left");
    expect(sameAccount({ email: "a", orgId: "1" }, { email: "a", orgId: "2" })).toBe(false);
  });

  it("counts an unknown refused account as the same, so a missing row can't decide", () => {
    const unknown = refused({ label: "A usage limit" });
    delete unknown.rateLimitType;
    delete unknown.account;
    expect(judgeReading(reading([row("session", 10)], { email: "sam@acme-shop.dev" }), unknown, OPUS)).toBe("undecided");
  });

  it("can't decide from a reading that failed: not signed in, an auth error, or limits it couldn't read", () => {
    const limits = [row("session", 10)];
    expect(judgeReading(reading(limits, { error: "Not signed in to Claude Code. Run `claude auth login`." }), refused(), OPUS)).toBe("undecided");
    expect(judgeReading({ ...reading([]), limitsError: "Claude Code didn't report this plan's usage limits." }, refused(), OPUS)).toBe("undecided");
  });
});

describe("the limit that still blocks once the reset has passed (AC-LIMIT-01)", () => {
  it("names another row at 100%, the latest reset of several, a row with no reset counting as latest", () => {
    const limits = [row("session", 100), row("weekly_all", 100, { label: "Weekly", resetsAt: "2026-10-26T04:00:00Z" }), scoped("Sonnet", 100, "model", "2026-10-25T04:00:00Z")];
    expect(blockingRow(reading(limits), refused(), "claude-sonnet-5-5")?.label).toBe("Weekly");
    expect(blockingRow(reading([...limits, scoped("Claude Code", 100, "surface")]), refused(), "claude-sonnet-5-5")?.label).toBe("Weekly · Claude Code");
    expect(blockingRow(reading([row("session", 100), scoped("Fable", 100)]), refused(), OPUS)).toBeUndefined();
  });
});
