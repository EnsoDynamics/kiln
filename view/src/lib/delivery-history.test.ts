process.env.TZ = "America/New_York";
import { describe, expect, it } from "vitest";
import { completeDeliveryHistorySnapshot } from "../../../src/test-support/sample-snapshots.js";
import { deliveryGroups, deliveryTime } from "./delivery-history.js";

describe("delivery history presentation", () => {
  it("keeps PRs and otherwise unrepresented merges newest first, without losing evidence", () => {
    const events = completeDeliveryHistorySnapshot().deliveryHistory!.repositories[0]!.events;
    const before = structuredClone(events);
    const { primary, other } = deliveryGroups(events);
    expect(primary.map(event => event.number ?? event.title)).toEqual([6, "Close customer returns", 5, 4, 3]);
    expect(other.map(event => event.title)).toEqual(["Merge returns into another branch"]);
    expect([...primary, ...other]).toHaveLength(events.length);
    expect(events).toEqual(before);
    expect(deliveryGroups(events.filter(event => event.kind === "merge")).primary).toHaveLength(2);
    const partial = { ...other[0]!, workCommits: ["a".repeat(40), "new-unrepresented-work"] };
    expect(deliveryGroups([...primary, partial]).primary).toContain(partial);
  });
  it("sorts undated historical entries last with stable ties", () => {
    const events = completeDeliveryHistorySnapshot().deliveryHistory!.repositories[0]!.events.filter(event => event.kind === "pull_request");
    const undated = events.map(event => ({ ...event, occurredAt: event.number === 3 ? "2026-10-17T15:00:00Z" : "invalid" }));
    expect(deliveryGroups(undated).primary.map(event => event.number)).toEqual([3, 6, 5, 4]);
    expect(deliveryGroups(undated.reverse()).primary.map(event => event.number)).toEqual([3, 6, 5, 4]);
  });
  it("pairs human ages with exact local dates, years and daylight-saving zones", () => {
    expect(deliveryTime("2026-10-23T18:20:35Z", Date.parse("2026-10-24T18:21:00Z"))).toEqual({ relative: "1 day ago", exact: "Oct 23, 2026, 2:20 PM EDT" });
    expect(deliveryTime("2026-12-01T18:20:00Z", Date.parse("2026-12-01T19:20:00Z"))).toEqual({ relative: "1 hour ago", exact: "Dec 1, 2026, 1:20 PM EST" });
    expect(deliveryTime("2026-10-23T18:20:35Z", Date.parse("2026-10-23T18:21:00Z"))?.relative).toBe("Just now");
    expect(deliveryTime("invalid", Date.now())).toBeUndefined();
    expect(deliveryTime(undefined, Date.now())).toBeUndefined();
  });
});
