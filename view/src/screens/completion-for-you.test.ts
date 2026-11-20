// For you on the finished page (Kiln Deliver When Audit Loops Run Out AC-ITEM-03, mockup screens 3
// and 3b): each item still open at delivery as Kiln built its line, kind words bold, Waived tags,
// then the after-delivery actions; a critical finding moves it below the state header.
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { ForYou } from "../../../src/audit/for-you.js";
import { completeSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import Complete from "./Complete.svelte";

const item = (id: string, kind: ForYouItemKind, words: string | null, problem: string, extra: Partial<ForYou["items"][number]> = {}): ForYou["items"][number] =>
  ({ id, kind, words, problem, action: "Act on it.", line: `${words ? `${words}: ` : ""}${problem} Act on it.`, listedBy: "Delivery audit round 1", listedByActivityId: "a1", ...extra });
type ForYouItemKind = ForYou["items"][number]["kind"];
function page(forYou?: ForYou, connected = true) {
  const snapshot = completeSnapshot();
  if (forYou) snapshot.delivered = { forYou };
  return render(Complete, { props: { snapshot, connected, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body.replace(/<!--[^>]*-->/g, "");
}
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

  it("moves For you directly below the state header when it lists a critical finding (mockup screen 3b)", () => {
    const html = page({ items: [item("item-1", "critical", "Critical finding", "Card numbers are logged.")], afterDelivery: [] });
    expect(html.indexOf('id="for-you"')).toBeLessThan(html.indexOf('<section class="pr'));
    expect(section(html)).toContain("<strong>Critical finding:</strong> Card numbers are logged.");
  });

  it("shows no For you when nothing is left for a person", () => {
    for (const forYou of [undefined, { items: [], afterDelivery: [] }]) expect(page(forYou)).not.toContain('id="for-you"');
  });
});
