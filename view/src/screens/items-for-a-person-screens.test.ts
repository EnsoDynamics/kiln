// The Needs you page for an audit's items and the hold stop (Kiln Deliver When Audit Loops Run Out
// AC-ITEM-01, AC-ITEM-02; mockup screens 5, 5b and 5c): Kiln needs you for one thing (or N things)
// whichever step listed them, each item's kind, problem, action and what waits on it, and the hold
// stop's Continue anyway offer in its own words.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import { finalDeliveryNeedsYouSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import NeedsYou from "./NeedsYou.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const page = (snapshot: Snapshot) => text(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
const blocker = { id: "item-3", kind: "blocker" as const, words: "Blocker", problem: "The sandbox API key is not set.", action: "Add SANDBOX_KEY to the repository secrets.", waitsOn: "Delivery: the pull request's checks need it.", effect: "holds" as const };
/** The hold stop on the pull request step, rechecked, so Continue anyway is offered (mockup screen 5c). */
function holdStop(items: NonNullable<Snapshot["items"]>): Snapshot {
  const snapshot = finalDeliveryNeedsYouSnapshot();
  const row = { name: "Nothing holds the run", passed: false, facts: items.map(item => `${item.words}: ${item.problem} ${item.action}`), items: items.map(item => ({ kind: "other" as const, subject: item.id!, text: `${item.words}: ${item.problem}`, against: item.id! })) };
  snapshot.items = items;
  snapshot.needsYou = { ...snapshot.needsYou!, kind: "selection", resumeOffered: false, checks: [row], counts: { passed: 0, waived: 0, failed: 1 }, rowsAreCompletionChecks: undefined,
    markComplete: { offered: true, label: "Continue anyway", heading: "You’ve provided what’s listed above, and want Kiln to deliver?", continueInOrder: true, hold: "pull_request_session", checkRunId: "run-pr-recheck",
      items: row.items.map(item => ({ check: row.name, ...item })), failingChecks: 1, nextActivity: null, resultingLabel: "Complete", noReport: false,
      sentence: ["Continue anyway. Kiln records each item above as waived, never as settled, and starts the pull request session. The items stay open and are listed under For you, each marked Waived."] } };
  return snapshot;
}

describe("Kiln needs you for the items an audit listed (AC-ITEM-02)", () => {
  it("opens Kiln needs you for one thing and shows the item's kind, problem, action and what waits on it, with the hold stop's own offer", () => {
    const html = page(holdStop([blocker]));
    expect(html).toContain("Kiln needs you for one thing");
    expect(html).toContain("Blocker · Holds the run The sandbox API key is not set. Add SANDBOX_KEY to the repository secrets. What waits on it: Delivery: the pull request's checks need it.");
    expect(html).toContain("You’ve provided what’s listed above, and want Kiln to deliver?");
    expect(html).toContain("Continue anyway. Kiln records each item above as waived, never as settled, and starts the pull request session.");
    expect(html).not.toContain("Model and effort");
    expect(html).not.toContain("Mark final delivery complete");
  });

  it("counts several items, and shows a waived one with its tag", () => {
    const html = page(holdStop([blocker, { id: "item-4", kind: "business_question", words: "Business question", problem: "Which refund rate applies?", action: "Choose the rate.", waitsOn: "Phase 9.", effect: "holds", waiver: { waiverId: "w", activityKey: "pr", at: "2026-10-17T15:58:22Z", via: "browser", account: "alex" } }]));
    expect(html).toContain("Kiln needs you for 2 things");
    expect(html).toMatch(/Business question · Holds the run · Waived waived at Final delivery, .* · browser · alex Which refund rate applies\?/);
  });
});
