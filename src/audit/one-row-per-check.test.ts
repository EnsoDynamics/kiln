import { describe, expect, it } from "vitest";
import type { CheckItem } from "../engine/waivers.js";
import { applyWaivers, itemize, type Waiver } from "../engine/waivers.js";
import type { CheckResult } from "../state/records.js";
import { oneRowPerCheck } from "./admission.js";

const item = (subject: string): CheckItem => ({ kind: "other", subject, text: `${subject} is not delivered.`, against: "documents:abc" });
const failing = (name: string, ...subjects: string[]): CheckResult => ({ name, passed: false, facts: subjects.map(subject => `${subject} is not delivered.`), items: subjects.map(item) });

describe("oneRowPerCheck", () => {
  it("keeps first-seen order and leaves distinct names alone", () => {
    const rows = [failing("A", "a"), { name: "B", passed: true, facts: ["fine"] }];
    expect(oneRowPerCheck([...rows, { name: "A", passed: false, facts: ["a is not delivered."], items: [item("a")] }])).toEqual(rows);
  });

  it("fails a name when any read of it failed, whichever came first", () => {
    const passing: CheckResult = { name: "Pushed", passed: true, facts: ["matches origin"] };
    const failed = failing("Pushed", "api");
    expect(oneRowPerCheck([passing, failed])).toEqual([failed]);
    expect(oneRowPerCheck([failed, passing])).toEqual([failed]);
  });

  it("lists every distinct failing fact and item across delivery owners, once each", () => {
    expect(oneRowPerCheck([failing("Delivery", "merge"), failing("Delivery", "merge", "deploy"), failing("Delivery", "verify")])).toEqual([failing("Delivery", "merge", "deploy", "verify")]);
  });

  it("keeps a fact from a read with no items coverable by itemizing every fact", () => {
    const rows = oneRowPerCheck([failing("Delivery", "merge"), { name: "Delivery", passed: false, facts: ["plain problem"] }]);
    itemize(rows, "audit-1");
    expect(rows[0]!.items!.map(one => one.text)).toEqual(["merge is not delivered.", "plain problem"]);
  });

  it("a waiver over one item leaves the merged row failing", () => {
    const rows = oneRowPerCheck([failing("Delivery", "merge"), failing("Delivery", "deploy")]);
    const waiver = { waiverId: "w1", activityKey: "audit-1", at: "2026-11-08T00:00:00Z", via: "browser", account: "a", items: [{ check: "Delivery", kind: "other", subject: "merge", text: "merge is not delivered.", against: "documents:abc" }] } as unknown as Waiver;
    applyWaivers([waiver], rows);
    expect(rows[0]!.items!.map(one => !!one.waiver)).toEqual([true, false]);
    expect(rows[0]!.passed).toBe(false);
  });
});
