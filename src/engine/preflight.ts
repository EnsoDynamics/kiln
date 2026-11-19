/**
 * The build preflight's saved state and how a preflight session's report is read (build
 * preflight technical design, "When the Preflight Is Due", "Reading the Result", "Data Models").
 * Kiln reads only the report's first line and, for items, its numbered list; it never reads the
 * report's stop lines and never parses what an item means.
 */
import type { PrdRecord } from "../state/records.js";
import { preflightKey } from "../state/activity-keys.js";

export type PreflightTrigger = "start" | "unpause" | "continue" | "resume";
export type PreflightOutcome = "ready" | "items" | "no_report";

export interface PreflightResult {
  outcome: PreflightOutcome;
  at: string;
  /** The session and run whose final message was read. */
  sessionId?: string;
  run?: number;
  /** The opening line, verbatim, for items. */
  headline?: string;
  items?: string[];
  /** For no_report when its last attempt launched no session. */
  reason?: string;
}

export interface PreflightActivity {
  activityId: string;
  sequence: number;
  createdAt: string;
  trigger: PreflightTrigger;
  /** The activity it came before, when the mark was consumed ahead of an interrupted or waiting session. */
  before?: string;
  /** Replaced at each fresh session's launch; absent when it could not be resolved. */
  skill?: { name: string; path: string; digest: string };
  /** Only what a session's run produced; absent when Kiln marked it complete before any report was read. */
  result?: PreflightResult;
}

export interface PreflightState {
  due?: { trigger: PreflightTrigger; at: string };
  activities: PreflightActivity[];
}

export const PREFLIGHT_SKILL = "build-preflight";
export const PREFLIGHT_CHECK = "Preflight";
export const PREFLIGHT_TITLE = "Preflight";
/** The preflight's full name, where a page has room for it: the running card's and its session page's heading. */
export const PREFLIGHT_HEADING = "Preflight check";
export const PREFLIGHT_STOP_REASON = "At a preflight stop, use Check Preflight again or Mark complete.";
export const PREFLIGHT_PAUSE_REASON = "Pause after this activity isn't offered during the preflight.";
export const PREFLIGHT_LIVE_REASON = "Live messages, terminal takeover and a pause are unavailable during the preflight. Wait for its result; if it reports items, reopen its session in a terminal from the preflight stop.";

const TRIGGERS: readonly PreflightTrigger[] = ["start", "unpause", "continue", "resume"];
const OUTCOMES: readonly PreflightOutcome[] = ["ready", "items", "no_report"];

export function assertPreflightState(state: unknown): asserts state is PreflightState | undefined {
  if (state === undefined) return;
  const bad = () => { throw new Error("Malformed preflight state."); };
  if (!state || typeof state !== "object" || !Array.isArray((state as PreflightState).activities)) bad();
  const { due, activities } = state as PreflightState;
  if (due !== undefined && (!TRIGGERS.includes(due.trigger) || !Number.isFinite(Date.parse(due.at)))) bad();
  for (const activity of activities) {
    if (!activity || typeof activity.activityId !== "string" || !/^[a-zA-Z0-9-]+$/.test(activity.activityId) || !Number.isSafeInteger(activity.sequence) || !TRIGGERS.includes(activity.trigger) || !Number.isFinite(Date.parse(activity.createdAt))) bad();
    if (activity.before !== undefined && typeof activity.before !== "string") bad();
    const result = activity.result;
    if (result !== undefined && (!OUTCOMES.includes(result.outcome) || !Number.isFinite(Date.parse(result.at)) || result.items !== undefined && !(Array.isArray(result.items) && result.items.every(item => typeof item === "string")))) bad();
  }
}

/** The preflight activity's key in the activity facts and session folders. */
export const keyOf = (activity: Pick<PreflightActivity, "activityId">): string => preflightKey(activity.activityId);

export function preflightActivity(record: PrdRecord, key: string): PreflightActivity | undefined {
  return record.preflight?.activities.find(activity => keyOf(activity) === key);
}

export function latestPreflight(record: PrdRecord): PreflightActivity | undefined {
  return record.preflight?.activities.at(-1);
}

/** The latest preflight when it is still unfinished: running, waiting or stopped. */
export function unfinishedPreflight(record: PrdRecord): PreflightActivity | undefined {
  const latest = latestPreflight(record);
  return latest && !record.phases[keyOf(latest)]?.doneAt ? latest : undefined;
}

/**
 * Settled: one of the execution's preflights finished with no `no_report` result. It reported
 * ready, or Mark complete finished it before a report was read ("When the Preflight Is Due").
 */
export function preflightSettled(record: PrdRecord): boolean {
  return (record.preflight?.activities ?? []).some(activity => !!record.phases[keyOf(activity)]?.doneAt && activity.result?.outcome !== "no_report");
}

/** Sets the due mark; the caller saves it in the write that records the person's action. */
export function setPreflightDue(record: PrdRecord, trigger: PreflightTrigger, at: string): void {
  record.preflight ??= { activities: [] };
  record.preflight.due = { trigger, at };
}

/** The Found line beneath a finished row. */
export function preflightFound(outcome: PreflightOutcome | undefined): string | undefined {
  return outcome === "ready" ? "Nothing to settle" : outcome === "no_report" ? "Ended without a report" : undefined;
}

export type PreflightReport = { outcome: "ready" } | { outcome: "items"; headline: string; items: string[] } | { outcome: "no_report" };

const ITEMS_LINE = /^Preflight: ([1-9]\d*) items? needs? you$/;
const ITEM_START = /^ {0,3}(\d+)\.\s+(.*)$/;

/**
 * Reads a preflight session's final message: its first non-blank line, trimmed, decides.
 *
 *   readPreflightReport("Preflight: ready\n\n3 phases.")  // { outcome: "ready" }
 *   readPreflightReport("Preflight: 1 item needs you\n\n1. Run `aws sso login`.")
 *     // { outcome: "items", headline: "Preflight: 1 item needs you", items: ["Run `aws sso login`."] }
 *   readPreflightReport("I could not finish.")  // { outcome: "no_report" }
 */
export function readPreflightReport(finalMessage: string | undefined): PreflightReport {
  const lines = (finalMessage ?? "").split(/\r?\n/);
  const first = lines.findIndex(line => line.trim() !== "");
  if (first === -1) return { outcome: "no_report" };
  const headline = lines[first]!.trim();
  if (headline === "Preflight: ready") return { outcome: "ready" };
  if (!ITEMS_LINE.test(headline)) return { outcome: "no_report" };
  const items = extractItems(lines.slice(first + 1));
  return { outcome: "items", headline, items: items.length ? items : ["The items are in the full report."] };
}

/**
 * The numbered list after the opening line: an item starts at a line beginning with a number
 * and a period and runs until the next one; the list ends at the first later paragraph that is
 * neither an item nor an indented continuation. Continuation lines are trimmed and joined with
 * single spaces; inline markdown is kept.
 */
function extractItems(lines: string[]): string[] {
  const items: string[][] = [];
  let gap = false;
  for (const line of lines) {
    if (line.trim() === "") { gap = true; continue; }
    const start = ITEM_START.exec(line);
    if (start) { items.push([start[2]!.trim()]); gap = false; continue; }
    if (!items.length) continue;
    // An indented line continues the item; so does a line that follows it in the same paragraph.
    if (/^\s/.test(line) || !gap) { items.at(-1)!.push(line.trim()); gap = false; continue; }
    break;
  }
  return items.map(parts => parts.filter(part => part !== "").join(" ")).filter(text => text !== "");
}
