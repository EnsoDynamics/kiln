// Closing audits and For you on the finished page (Kiln Deliver When Audit Loops Run Out AC-LEFT-02,
// AC-ITEM-03, mockup screens 3 and 3b): each kind's loops used and limit after the pull request
// section; each item still open at delivery as Kiln built its line, kind words bold, Waived tags,
// then the after-delivery actions; a critical finding moves For you below the state header.
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { ForYou } from "../../../src/audit/for-you.js";
import { closingAuditsSnapshot, completeSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import Complete from "./Complete.svelte";
import { headerState } from "../lib/progress.js";

const item = (id: string, kind: ForYouItemKind, words: string | null, problem: string, extra: Partial<ForYou["items"][number]> = {}): ForYou["items"][number] =>
  ({ id, kind, words, problem, action: "Act on it.", line: `${words ? `${words}: ` : ""}${problem} Act on it.`, listedBy: "Delivery audit round 1", listedByActivityId: "a1", ...extra });
type ForYouItemKind = ForYou["items"][number]["kind"];
const LOOPS = { delivery: { used: 4, limit: 4 }, test: { used: 2, limit: 4 } };
function page(forYou?: ForYou, connected = true) {
  const snapshot = completeSnapshot();
  if (forYou) snapshot.delivered = { loops: LOOPS, forYou, pullRequests: [] };
  return render(Complete, { props: { snapshot, connected, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body.replace(/<!--[^>]*-->/g, "");
}
const renderComplete = (snapshot: ReturnType<typeof completeSnapshot>) => render(Complete, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body.replace(/<!--[^>]*-->/g, "");
const section = (html: string) => /<section[^>]*id="for-you"[\s\S]*?<\/section>/.exec(html)?.[0];

describe("For you on the finished page (AC-ITEM-03)", () => {
  it.each([true, false])("lists each open item's line, its kind words bold and its Waived tag, then the after-delivery actions, with no human-actions card, connected=%s", connected => {
    const html = page({ items: [
      item("item-2", "test", "Test gap", "AC-RET-04 has no test."),
      item("item-3", "blocker", "Blocker", "The sandbox key is missing.", { waitsOn: "Delivery.", waiver: { waiverId: "w1", activityKey: "pr", at: "2026-11-19T10:00:00.000Z", via: "command_line", account: "alex" } }),
      item("item-4", "other", null, "Behavior changed outside the requirements."),
    ], afterDelivery: ["Release to production."] }, connected);
    const block = section(html)!;
    expect(block).toContain("For you");
    expect(block).toContain("<strong>Test gap:</strong> AC-RET-04 has no test. Act on it.");
    expect(block).toMatch(/<strong>Blocker:<\/strong> The sandbox key is missing\. Act on it\.[\s\S]*Waived[\s\S]*waived at Final delivery[\s\S]*command line · alex/);
    expect(block).toMatch(/<li[^>]*>Behavior changed outside the requirements\. Act on it\.<\/li>/);
    expect(block.indexOf("Release to production.")).toBeGreaterThan(block.indexOf("Behavior changed"));
    expect(html).not.toContain("Remaining human actions");
    // After the pull request section, before the plan.
    expect(html).toContain('<section class="pr');
    expect(html.indexOf('id="for-you"')).toBeGreaterThan(html.indexOf('<section class="pr'));
  });

  it("names an audit that waived an item by what it does, never by round or continuation (Kiln After Delivery AC-AUDIT-01)", () => {
    const snapshot = completeSnapshot();
    snapshot.activities = closingAuditsSnapshot().activities;
    snapshot.delivered = { loops: LOOPS, pullRequests: [], forYou: { items: [item("item-2", "test", "Test gap", "AC-RET-04 is Weak.", { waiver: { waiverId: "w9", activityKey: "audit-ta1-2", at: "2026-11-22T10:00:00.000Z", via: "browser", account: "alex" } })], afterDelivery: [] } };
    const block = section(renderComplete(snapshot))!;
    expect(block).toMatch(/Waived[\s\S]*waived at Fixing tests,[\s\S]*browser · alex/);
    expect(block).not.toMatch(/Round|Continuation/);
  });
  it("moves For you directly below the state header when it lists a critical finding (mockup screen 3b)", () => {
    const html = page({ items: [item("item-1", "critical", "Critical finding", "Card numbers are logged.")], afterDelivery: [] });
    expect(html.indexOf('id="for-you"')).toBeLessThan(html.indexOf('<section class="pr'));
    expect(section(html)).toContain("<strong>Critical finding:</strong> Card numbers are logged.");
  });

  it("shows no For you when nothing is left for a person", () => {
    for (const forYou of [undefined, { items: [], afterDelivery: [] }]) expect(page(forYou)).not.toContain('id="for-you"');
  });
});

describe("Closing audits on the finished page (AC-LEFT-02)", () => {
  const closing = (html: string) => /<section[^>]*id="closing-audits"[\s\S]*?<\/section>/.exec(html)?.[0];
  it.each([true, false])("shows each kind's loops used and limit after the pull request section, before For you and Delivery history, connected=%s", connected => {
    const html = page({ items: [item("item-2", "test", "Test gap", "AC-RET-04 has no test.")], afterDelivery: [] }, connected);
    const block = closing(html)!;
    expect(block).toMatch(/Delivery audit<\/dt><dd[^>]*>4 of 4 loops<\/dd>/);
    expect(block).toMatch(/Test audit<\/dt><dd[^>]*>2 of 4 loops<\/dd>/);
    expect(html.indexOf('id="closing-audits"')).toBeGreaterThan(html.indexOf('<section class="pr'));
    expect(html.indexOf('id="closing-audits"')).toBeLessThan(html.indexOf('id="for-you"'));
    if (html.includes('id="delivery-history"')) expect(html.indexOf('id="closing-audits"')).toBeLessThan(html.indexOf('id="delivery-history"'));
  });

  it("keeps its place, and shows with nothing for a person, when a critical finding moves For you up", () => {
    const critical = page({ items: [item("item-1", "critical", "Critical finding", "Card numbers are logged.")], afterDelivery: [] });
    expect(critical.indexOf('id="closing-audits"')).toBeGreaterThan(critical.indexOf('<section class="pr'));
    expect(critical.indexOf('id="for-you"')).toBeLessThan(critical.indexOf('id="closing-audits"'));
    expect(closing(page({ items: [], afterDelivery: [] }))).toContain("4 of 4 loops");
  });
});

describe("the finished page's heading on a delivered run (AC-LEFT-02)", () => {
  it("is unchanged: the same state header with and without the delivered facts", () => {
    const plain = completeSnapshot();
    const delivered = completeSnapshot(); delivered.delivered = { loops: LOOPS, forYou: { items: [], afterDelivery: [] }, pullRequests: [] };
    const now = new Date(RUNNING_NOW);
    expect(headerState(delivered, true, now)).toEqual(headerState(plain, true, now));
    expect(headerState(delivered, true, now).label).toBe("PR ready for review");
    const header = (html: string) => /<div class="state[^"]*">[\s\S]*?<\/div>/.exec(html)?.[0];
    const render = (snapshot: ReturnType<typeof completeSnapshot>) => renderComplete(snapshot);
    expect(header(render(delivered))).toBe(header(render(plain)));
    expect(header(render(delivered))).toContain("PR ready for review");
  });
});
