// How the view shows times and spans, in the person's local time (technical design, "HTTP API").
// A time that isn't today carries its day (assumptions UI-010 item 8): "Yesterday 11:52 PM",
// "Mon 9:17 AM" within the last week, "Oct 12, 9:17 AM" before that.

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The day part a time needs beside "now", or none for today. */
function dayOf(time: Date, now: Date): "today" | "yesterday" | { weekday: string } | { date: string } {
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return { weekday: time.toLocaleDateString("en-US", { weekday: "short" }) };
  return { date: time.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
}

function dayPrefix(time: Date, now: Date, lowercase: boolean): string {
  const day = dayOf(time, now);
  if (day === "today") return "";
  if (day === "yesterday") return lowercase ? "yesterday " : "Yesterday ";
  return "weekday" in day ? `${day.weekday} ` : `${day.date}, `;
}

/** "11:52 AM" */
function clockOf(time: Date): string {
  return time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * A time as the screens show it, with its day when it isn't today.
 *
 *   clockTime("2026-10-17T15:52:00Z", now)                    // "11:52 AM" (today, in New York)
 *   clockTime(yesterday, now, { afterWord: true })            // "yesterday 11:52 PM", as in "Stopped yesterday 11:52 PM"
 */
export function clockTime(iso: string, now: Date, options: { afterWord?: boolean } = {}): string {
  const time = new Date(iso);
  return `${dayPrefix(time, now, options.afterWord === true)}${clockOf(time)}`;
}

/**
 * "9:17 to 10:09 AM": each end follows the day rule on its own, and the day and the AM or PM a
 * span's ends share are given once.
 *
 *   timeSpan("…T13:17Z", "…T14:09Z", now)   // "9:17 to 10:09 AM"
 *   timeSpan(yesterday 11:20 PM, today 12:40 AM, now)  // "Yesterday 11:20 PM to 12:40 AM"
 */
export function timeSpan(fromIso: string, toIso: string, now: Date): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const fromDay = dayPrefix(from, now, false);
  const toDay = dayPrefix(to, now, true);
  const sameDay = startOfDay(from) === startOfDay(to);
  const fromClock = clockOf(from);
  const toClock = clockOf(to);
  const fromHalf = fromClock.slice(-2);
  const shortFrom = sameDay && fromHalf === toClock.slice(-2) ? fromClock.slice(0, -3) : fromClock;
  return `${fromDay}${shortFrom} to ${sameDay ? "" : toDay}${toClock}`;
}

/** "11:44:02", the session-output time column, with its day when it isn't today. */
export function outputTime(iso: string, now: Date): string {
  const time = new Date(iso);
  const clock = time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${dayPrefix(time, now, false)}${clock}`;
}

/** "10:58", a progress step's start beside it on Phase detail, with its day when it isn't today. */
export function stepTime(iso: string, now: Date): string {
  const time = new Date(iso);
  const clock = time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dayPrefix(time, now, false)}${clock}`;
}

/** A span in a phase row: "52m", "5h 38m". */
export function shortDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** An elapsed time beside "Started": "49 min", "1h 12m". */
export function elapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return minutes < 60 ? `${minutes} min` : shortDuration(minutes * 60_000);
}

/** "2 min ago", "just now", "1h 5m ago". */
export function ago(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  return minutes < 60 ? `${minutes} min ago` : `${shortDuration(minutes * 60_000)} ago`;
}

/** "8 min earlier": how long before a stop something was seen. */
export function earlier(iso: string, beforeIso: string): string {
  const minutes = Math.max(0, Math.floor((new Date(beforeIso).getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "moments earlier";
  return minutes < 60 ? `${minutes} min earlier` : `${shortDuration(minutes * 60_000)} earlier`;
}

/** "Resets in 1h 12m", "Resets in 4d". */
export function resetsIn(iso: string, now: Date): string {
  const ms = new Date(iso).getTime() - now.getTime();
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes >= 24 * 60) return `Resets in ${Math.floor(minutes / (24 * 60))}d`;
  if (minutes >= 60) return `Resets in ${shortDuration(minutes * 60_000)}`;
  return `Resets in ${minutes}m`;
}
