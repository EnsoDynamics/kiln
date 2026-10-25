import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { PhaseView } from "../../../src/engine/snapshot.js";
import { completeSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import Complete from "./Complete.svelte";

function audit(id: string, kind: "delivery_audit" | "test_audit", actions: string[]): PhaseView {
  return { id, kind, title: kind === "test_audit" ? "Test audit" : "Delivery audit", file: "Round 1", state: "done", finishedByPerson: false,
    audit: { outcome: "passed", checks: [], criteria: [], repositories: [], blockers: [], pendingActions: actions, remainingAfterDeliveryActions: actions } };
}
function page(activities?: PhaseView[], connected = true) {
  const snapshot = completeSnapshot();
  if (activities) snapshot.activities = activities;
  return render(Complete, { props: { snapshot, connected, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body;
}

describe("completion human actions (AC-TEST-04)", () => {
  it.each([true, false])("lists the latest test audit's remaining actions without claiming completion, connected=%s", connected => {
    const html = page([
      audit("old-tests", "test_audit", ["Obsolete release action"]),
      audit("delivery", "delivery_audit", ["Earlier delivery action"]),
      audit("current-tests", "test_audit", ["Approve the production release", "Announce availability"]),
    ], connected);
    const section = /<section[^>]*aria-labelledby="human-actions-heading"[\s\S]*?<\/section>/.exec(html)![0];
    expect(section).toContain("Remaining human actions");
    expect(section).toContain("Kiln has not performed them.");
    expect(section).toMatch(/<li[^>]*>Approve the production release<\/li>/);
    expect(section).toMatch(/<li[^>]*>Announce availability<\/li>/);
    expect(section).not.toContain("Obsolete release action");
    expect(section).not.toContain("Earlier delivery action");
    expect(html).toContain("PR ready for review");
  });

  it("shows no action section for empty or historical completions, without reviving old actions", () => {
    for (const activities of [undefined, [], [audit("old", "test_audit", ["Obsolete action"]), audit("latest", "test_audit", [])]]) {
      expect(page(activities)).not.toContain('aria-labelledby="human-actions-heading"');
    }
  });
});
