// Real built Svelte view, SSE snapshots and browser clock. Provider refusal timing itself is
// covered by usage-limit-wait.integration.test.ts; this proves the visible automatic wait.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { launchChrome } from "../test-support/headless-chrome.js";
import { waitingSnapshot, USAGE_LIMIT_NOW } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { isPortFree } from "../state/instance-lock.js";

describe("automatic usage resume in the browser", () => {
  it("counts down live, explains checks after the deadline, and places billing last at desktop and phone widths", async () => {
    const snapshot = waitingSnapshot();
    snapshot.billing = { executionId: "fixture", selectionGeneration: 0, pending: false, canLaunch: true, lastLaunch: { agentId: "claude_code", route: "subscription", email: "fixture@example.test", observedAt: snapshot.waiting!.since, approved: true, sources: [], diagnostics: [] } };
    let port = 42160;
    while (port < 42200 && !await isPortFree(port)) port++;
    if (port === 42200) throw new Error("No free automatic-resume proof port");
    const server = await serveViewFixture({ port, folder: "customer-returns", snapshot });
    const chrome = await launchChrome();
    try {
      for (const width of [1280, 360]) {
        const page = await chrome.open(server.address, { width, clock: USAGE_LIMIT_NOW, timeZone: "America/New_York" });
        try {
          await page.waitFor(`document.querySelector('.ended h2')?.textContent === 'Will resume automatically in 1h 13m'`);
          expect(await page.evaluate(`document.querySelector('progress').getAttribute('aria-label')`)).toBe("Elapsed wait until automatic usage check");
          expect(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
          expect(await page.evaluate(`!!(document.querySelector('.settings').compareDocumentPosition(document.querySelector('[aria-label="Claude billing"]')) & Node.DOCUMENT_POSITION_FOLLOWING)`)).toBe(true);
          writeFileSync(`/tmp/kiln-usage-resume-${width}.png`, await page.screenshot());
          const halfway = structuredClone(snapshot);
          halfway.waiting!.since = new Date(USAGE_LIMIT_NOW - 60 * 60_000).toISOString();
          halfway.waiting!.limit.automaticResume!.at = new Date(USAGE_LIMIT_NOW + 60 * 60_000).toISOString();
          server.send("snapshot", halfway);
          await page.waitFor(`document.querySelector('progress')?.value > 49`);
          expect(await page.evaluate(`document.querySelector('progress').value`)).toBeCloseTo(50, 0);
          expect(await page.evaluate(`document.querySelector('progress').max`)).toBe(100);
          const live = structuredClone(snapshot);
          // Use the current browser clock so earlier assertions never consume this window.
          live.waiting!.limit.automaticResume!.at = new Date(await page.evaluate<number>("Date.now()") + 3000).toISOString();
          server.send("snapshot", live);
          await page.waitFor(`document.querySelector('.ended h2')?.textContent === 'Will resume automatically in 1m'`);
          await page.waitFor(`document.querySelector('.ended h2')?.textContent === 'Checking usage availability…'`);
          expect(await page.evaluate(`document.querySelector('.ended progress') === null`)).toBe(true);
          const checking = structuredClone(snapshot);
          checking.waiting!.checking = true;
          server.send("snapshot", checking);
          await page.waitFor(`document.querySelector('.ended h2')?.textContent === 'Resuming automatically…'`);
          expect(await page.evaluate(`document.querySelector('.ended progress') === null`)).toBe(true);
          const weekly = structuredClone(snapshot);
          weekly.waiting!.limit.automaticResume = { label: "Weekly", at: "2026-10-19T22:41:00Z" };
          server.send("snapshot", weekly);
          await page.waitFor(`document.querySelector('.ended h2')?.textContent.includes('2d 4h 13m')`);
          expect(await page.evaluate(`document.querySelector('.ended').textContent.includes('the weekly usage limit')`)).toBe(true);
          const unknown = structuredClone(snapshot);
          unknown.waiting!.limit.automaticResume = { label: "Weekly" };
          server.send("snapshot", unknown);
          await page.waitFor(`document.querySelector('.ended h2')?.textContent === 'Will resume automatically when usage is available'`);
          expect(await page.evaluate(`document.querySelector('.ended progress') === null`)).toBe(true);
          const off = structuredClone(snapshot);
          off.settings.resumeAfterUsageLimit = false;
          server.send("snapshot", off);
          await page.waitFor(`document.querySelector('.ended h2')?.textContent === 'Automatic resume is off'`);
          expect(await page.evaluate(`document.querySelector('.ended progress') === null`)).toBe(true);
          expect(page.problems).toEqual([]);
        } finally { await page.close(); server.send("snapshot", snapshot); }
      }
      expect(server.commands).toEqual([]); // Watching a countdown never manually dispatches work.
    } finally { await chrome.close(); await server.close(); }
  });
});
