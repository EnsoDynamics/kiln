// What each kind of item does and how it reads (Kiln Deliver When Audit Loops Run Out AC-ITEM-01 to
// AC-ITEM-03, "Upgrade"): a kind-less item from before kinds holds the run, and the audit prompt asks
// for its kind; each line is the kind's words, then the problem and action.
import { describe, expect, it } from "vitest";
import { itemEffect, itemLine, itemWaiver, kindWords, outstandingLines, type PersonItem } from "./person-items.js";
import type { Waiver } from "../engine/waivers.js";

const item = (extra: Partial<PersonItem>): PersonItem => ({ id: "item-1", kind: "other", problem: "The key is missing.", action: "Add it.", listedBy: "Delivery audit round 1", listedByActivityId: "a1", ...extra });
const holdWaiver = (subject: string): Waiver => ({ waiverId: "w-hold", at: "2026-11-19T10:00:00.000Z", activityKey: "pr", activityKind: "final_delivery", effect: "continued", source: { via: "browser", account: "alex" }, operationId: "op", checkRun: { id: "r", at: "2026-11-19T10:00:00.000Z" }, items: [{ check: "Nothing holds the run", kind: "other", subject, text: "x", against: subject }], checks: [] });

describe("items for a person", () => {
  it("stops, holds or goes on by kind; an item with no kind holds", () => {
    expect(["critical_next_step", "critical", "blocker", "business_question", "test", "other", null].map(kind => itemEffect(kind as PersonItem["kind"]))).toEqual(["stops", "goes_on", "holds", "holds", "goes_on", "goes_on", "holds"]);
  });

  it("opens each line with its kind's words, none for other or no kind", () => {
    expect(["critical_next_step", "critical", "blocker", "business_question", "test", "other", null].map(kind => kindWords(kind as PersonItem["kind"]))).toEqual(["Critical finding", "Critical finding", "Blocker", "Business question", "Test gap", null, null]);
    expect(itemLine(item({ kind: "blocker" }))).toBe("Blocker: The key is missing. Add it.");
    expect(itemLine(item({ kind: null }))).toBe("The key is missing. Add it.");
  });

  it("matches a hold waiver by ledger id, else the audit waiver that listed it", () => {
    expect(itemWaiver(item({}), [holdWaiver("item-1")])).toMatchObject({ waiverId: "w-hold", activityKey: "pr" });
    expect(itemWaiver(item({ id: "item-2" }), [holdWaiver("item-1")])).toBeUndefined();
    const audit = { ...holdWaiver("x"), waiverId: "w-audit", activityKey: "audit-a1", items: [] };
    expect(itemWaiver(item({ auditWaiverId: "w-audit" }), [audit])).toMatchObject({ waiverId: "w-audit" });
  });

  it("lists outstanding items for the audit prompt with kind, criterion, what waits and a waived mark, and asks for a missing kind", () => {
    const lines = outstandingLines([
      item({ kind: "blocker", waitsOn: "Delivery.", criterion: "AC-X-01" }),
      item({ id: "item-2", kind: null }),
      item({ id: "item-3", kind: "test", auditWaiverId: "w-audit", auditWaivedBy: "Test audit round 2" }),
    ], [holdWaiver("item-1"), { ...holdWaiver("x"), waiverId: "w-audit", items: [] }]).split("\n");
    expect(lines[0]).toBe("- item-1 (blocker; listed by Delivery audit round 1; criterion AC-X-01; waits on: Delivery.): The key is missing. Add it. (waived at final delivery: settle it if it is done, otherwise list it again by its id; it holds nothing and is never a reason for `needs_you`. A need it does not name is a new entry with no id.)");
    expect(lines[1]).toBe("- item-2 (no kind: give one when you list it again; listed by Delivery audit round 1): The key is missing. Add it.");
    expect(lines[2]).toMatch(/^- item-3 \(test; .*\(waived when Test audit round 2 was marked complete: settle it/);
  });
});
