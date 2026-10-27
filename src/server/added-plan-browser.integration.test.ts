import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { needsYouMessageSnapshot } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
it("shows accepted additions and a recoverable source discrepancy without launching work", async () => {
  const snapshot = needsYouMessageSnapshot();
  snapshot.continuation = { handback: { source: "/fictional/comet-library/.worktrees/catalog/comet-library", addedPhaseIds: ["9", "10"], remainingCount: 2, acceptedAt: "2026-10-27T15:00:00Z" } };
  const server = await serveViewFixture({ port: 41987, folder: "customer-returns", snapshot });
  try {
    for (const width of [1200, 390]) {
      delete snapshot.continuation.planCheck;
      const page = await chrome.open(server.address, { width, height: 900 });
      try {
        await page.waitFor("document.body.innerText.includes('Added work accepted')");
        expect(await page.evaluate("document.body.innerText")).toContain("Phases 9, 10 added · 2 unfinished phases remain.");
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        writeFileSync(`/tmp/kiln-added-plan-${width}.png`, await page.screenshot());
        snapshot.continuation.planCheck = { status: "failed", attemptedAt: "2026-10-27T15:01:00Z", problem: "Plan discrepancy in /fictional/comet-library: Phase 11 differs from the active workspace. Reconcile the documents into the active workspace, commit/push, then use Verify or Resume." };
        server.send("snapshot", snapshot);
        await page.waitFor("document.body.innerText.includes('Plan needs reconciliation')");
        expect(await page.evaluate("document.body.innerText")).not.toContain("Added work accepted");
        expect(await page.evaluate("document.querySelector('[role=alert]').innerText")).toContain("Phase 11");
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        writeFileSync(`/tmp/kiln-plan-discrepancy-${width}.png`, await page.screenshot());
        expect(page.problems).toEqual([]);
      } finally { await page.close(); }
    }
    expect(server.commands).toEqual([]);
  } finally { await server.close(); }
});
