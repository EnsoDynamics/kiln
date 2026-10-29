// Claude usage limits (usage-limit recovery technical design, "Recognizing a Usage Limit",
// "Design Decisions"): whether a run was refused by one, judged only from Claude Code's
// structured rate reports and tagged synthetic errors, never from the session's words; the limit's label; and whether a usage
// reading taken after the refusal shows the signed-in account has usage left.

import type { AccountView, UsageLimit } from "../account/claude-account.js";
import type { AccountIdentity, LimitRefusal } from "../state/records.js";
import { isModelResponse, type SavedEvent } from "./run-verdict.js";

/** The refusal's type, as the Agent SDK's `rate_limit_info.rateLimitType` names it, to its label (AC-LIMIT-01). */
const TYPE_LABELS: Record<string, string> = {
  five_hour: "5-hour window",
  seven_day: "Weekly",
  seven_day_opus: "Weekly · Opus",
  seven_day_sonnet: "Weekly · Sonnet",
};

/** The label of a type with no reading row: "A usage limit". */
export const UNKNOWN_LIMIT_LABEL = "A usage limit";

/** Allow the provider's window a minute to roll over before a reset-based retry. */
export const RESET_READING_DELAY_MS = 60_000;

/** The same reset-based schedule drives the engine's reading and the waiting screen. */
export function automaticResumeSchedule(refusal: LimitRefusal, reading: AccountView | undefined, model: string): { label: string; at?: string } {
  let label = refusal.label;
  let reset = refusal.resetsAt;
  if (reading && Date.parse(reading.startedAt) >= Date.parse(refusal.at) && readingAccount(reading) && !reading.limitsError) {
    const own = limitRow(refusal.rateLimitType, reading.limits);
    const other = blockingRow(reading, refusal, model);
    const decided = judgeReading(reading, refusal, model) !== "undecided";
    if (decided) {
      // A released stopping limit (or another account without that limit) no longer
      // constrains this wait. An exhausted row without a reset remains unknown.
      label = own && own.percent >= 100 ? own.label : other?.label ?? refusal.label;
      reset = own && own.percent >= 100 ? own.resetsAt ?? (sameAccount(readingAccount(reading), refusal.account) ? refusal.resetsAt : undefined) : other?.resetsAt;
    }
    if (other && (other.resetsAt === undefined || reset !== undefined && Date.parse(other.resetsAt) > Date.parse(reset))) {
      label = other.label;
      reset = other.resetsAt;
    }
  }
  return { label, ...(reset === undefined ? {} : { at: new Date(Date.parse(reset) + RESET_READING_DELAY_MS).toISOString() }) };
}

export function labelForType(rateLimitType: string | undefined): string {
  return (rateLimitType !== undefined && TYPE_LABELS[rateLimitType]) || UNKNOWN_LIMIT_LABEL;
}

/**
 * A label in a sentence (technical design, "Screens"): "the 5-hour usage limit", "the weekly
 * usage limit", "the weekly Fable usage limit", or "a usage limit".
 */
export function limitSentence(label: string): string {
  if (label === "5-hour window") return "the 5-hour usage limit";
  if (label === "Weekly") return "the weekly usage limit";
  if (label.startsWith("Weekly · ")) return `the weekly ${label.slice("Weekly · ".length)} usage limit`;
  return "a usage limit";
}

interface RateLimitInfo {
  status?: unknown;
  resetsAt?: unknown;
  rateLimitType?: unknown;
}

/**
 * The unresolved structured refusal at the end of a run. Tagged synthetic errors establish
 * refusal again after buffered subagent responses, preserving the latest rejected report's
 * type/reset. A later allowed report or model response clears it. `resetsAt` is Unix
 * seconds in the event and ISO here; `at` is the event's arrival, by Kiln's clock.
 *
 *   usageLimitRefusal([{ at: "2026-10-22T19:00:01.000Z", event: { type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1792699200, rateLimitType: "five_hour" } } }])
 *   // { rateLimitType: "five_hour", label: "5-hour window", resetsAt: "2026-10-22T20:00:00.000Z", at: "2026-10-22T19:00:01.000Z" }
 */
export function usageLimitRefusal(events: SavedEvent[]): LimitRefusal | undefined {
  let report: LimitRefusal | undefined;
  let refusal: LimitRefusal | undefined;
  for (const saved of events) {
    const event = saved.event;
    if (event.type === "rate_limit_event") {
      const info = (event.rate_limit_info ?? {}) as RateLimitInfo;
      report = info.status === "rejected" ? reportRefusal(info, saved.at) : undefined;
      refusal = report;
    } else if (event.type === "assistant" && event.message?.model === "<synthetic>" && event.error === "rate_limit") {
      refusal = report ?? { label: UNKNOWN_LIMIT_LABEL, at: saved.at };
    } else if (isModelResponse(event)) {
      refusal = undefined;
    }
  }
  return refusal;
}

function reportRefusal(info: RateLimitInfo, at: string): LimitRefusal {
  const rateLimitType = typeof info.rateLimitType === "string" && info.rateLimitType !== "" ? info.rateLimitType : undefined;
  const resetsAt = typeof info.resetsAt === "number" && Number.isFinite(info.resetsAt) ? new Date(info.resetsAt * 1000).toISOString() : undefined;
  return {
    ...(rateLimitType === undefined ? {} : { rateLimitType }),
    label: labelForType(rateLimitType),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    at,
  };
}

/**
 * The reading's row for the stopping limit: `five_hour` the session row, `seven_day` the weekly
 * row, `seven_day_opus` and `seven_day_sonnet` the model-scoped weekly row of that model; any
 * other type has none.
 */
export function limitRow(rateLimitType: string | undefined, limits: UsageLimit[]): UsageLimit | undefined {
  switch (rateLimitType) {
    case "five_hour":
      return limits.find((row) => row.kind === "session");
    case "seven_day":
      return limits.find((row) => row.kind === "weekly_all");
    case "seven_day_opus":
    case "seven_day_sonnet": {
      const model = rateLimitType.slice("seven_day_".length);
      return limits.find((row) => row.kind === "weekly_scoped" && row.scope?.by === "model" && row.scope.name.toLowerCase() === model);
    }
    default:
      return undefined;
  }
}

/** Two accounts are the same when both email and organization match; an unknown one counts as the same. */
export function sameAccount(a: AccountIdentity | undefined, b: AccountIdentity | undefined): boolean {
  if (a === undefined || b === undefined) return true;
  return a.email === b.email && a.orgId === b.orgId;
}

/** The account a reading belongs to, when it read one signed in. */
export function readingAccount(reading: AccountView): AccountIdentity | undefined {
  if (reading.error !== undefined || reading.email === undefined) return undefined;
  return { email: reading.email, ...(reading.orgId === undefined ? {} : { orgId: reading.orgId }) };
}

/**
 * Whether a row at 100% keeps the account from having usage left, other than the stopping
 * limit's own row: every row does, except a model-scoped weekly row for a model the session
 * isn't running (its name is not a hyphen-separated token of the session's model ID).
 */
function blocks(row: UsageLimit, sessionModel: string): boolean {
  if (row.percent < 100) return false;
  if (row.kind !== "weekly_scoped" || row.scope?.by !== "model") return true;
  return sessionModel.toLowerCase().split("-").includes(row.scope.name.toLowerCase());
}

export type ReadingVerdict = "usage_left" | "no_usage_left" | "undecided";

/**
 * What a reading taken after the refusal says (technical design, "Has usage left", "When
 * readings don't decide"): `undecided` for a failed reading, and for one of the refused account
 * with no row for the stopping limit.
 *
 *   judgeReading(reading, refusal, "claude-opus-5-5")  // "usage_left" once the 5-hour row is below 100%
 */
export function judgeReading(reading: AccountView, refusal: LimitRefusal, sessionModel: string): ReadingVerdict {
  const account = readingAccount(reading);
  if (account === undefined || reading.limitsError !== undefined) return "undecided";
  const own = limitRow(refusal.rateLimitType, reading.limits);
  if (own === undefined && sameAccount(account, refusal.account)) return "undecided";
  if (own !== undefined && own.percent >= 100) return "no_usage_left";
  return reading.limits.some((row) => row !== own && blocks(row, sessionModel)) ? "no_usage_left" : "usage_left";
}

/**
 * Another row of the reading at 100% that still keeps the account from having usage left
 * (AC-LIMIT-01's reset-passed row): of several, the one whose reset is latest, a row with no
 * reset counting as latest, ties in the server's order.
 */
export function blockingRow(reading: AccountView, refusal: LimitRefusal, sessionModel: string): UsageLimit | undefined {
  const own = limitRow(refusal.rateLimitType, reading.limits);
  let found: UsageLimit | undefined;
  for (const row of reading.limits) {
    if (row === own || !blocks(row, sessionModel)) continue;
    if (found === undefined) found = row;
    else if (found.resetsAt !== undefined && (row.resetsAt === undefined || Date.parse(row.resetsAt) > Date.parse(found.resetsAt))) found = row;
  }
  return found;
}
