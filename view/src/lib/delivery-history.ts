import type { DeliveryEvent } from "../../../src/state/records.js";

const timestamp = (event: DeliveryEvent) => event.occurredAt && Number.isFinite(Date.parse(event.occurredAt)) ? Date.parse(event.occurredAt) : Number.NEGATIVE_INFINITY;

/** Keep PRs prominent; a merge adds a main row when it carries work no verified PR represents. */
export function deliveryGroups(events: DeliveryEvent[]): { primary: DeliveryEvent[]; other: DeliveryEvent[] } {
  const sorted = [...events].sort((a, b) => timestamp(b) - timestamp(a) || (b.number ?? 0) - (a.number ?? 0) || a.commit.localeCompare(b.commit));
  const inPulls = new Set(events.filter(event => event.kind === "pull_request").flatMap(event => event.workCommits));
  const primary: DeliveryEvent[] = [], other: DeliveryEvent[] = [];
  for (const event of sorted) {
    (event.kind === "pull_request" || event.workCommits.some(sha => !inPulls.has(sha)) ? primary : other).push(event);
  }
  return { primary, other };
}

/** Relative age for scanning, with a full local timestamp including its zone and year. */
export function deliveryTime(iso: string | undefined, now: number): { relative: string; exact: string } | undefined {
  if (!iso || !Number.isFinite(Date.parse(iso))) return undefined;
  const at = new Date(iso);
  const delta = (at.getTime() - now) / 60_000;
  const unit = Math.abs(delta) >= 1440 ? "day" : Math.abs(delta) >= 60 ? "hour" : "minute";
  const value = Math.trunc(delta / (unit === "day" ? 1440 : unit === "hour" ? 60 : 1));
  return {
    relative: Math.abs(delta) < 1 ? "Just now" : new Intl.RelativeTimeFormat("en-US", { numeric: "always" }).format(value, unit),
    exact: at.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
  };
}
