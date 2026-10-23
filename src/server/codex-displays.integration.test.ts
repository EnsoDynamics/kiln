// Real browser rendering of Phase 6's presentation gaps (AC-VIEW-01/04, AC-USAGE-03).
// Snapshot fixtures inject missing metadata; provider/protocol behavior is proved elsewhere.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Snapshot } from "../engine/snapshot.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { completeRepositoriesSnapshot, completeSnapshot, documentsFoundSnapshot, needsYouUsageLimitSnapshot, USAGE_LIMIT_NOW, waitingSnapshot } from "../test-support/sample-snapshots.js";

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
const codex = (snapshot: Snapshot): Snapshot => {
  snapshot.settings.agentId = "codex";
  snapshot.settings.agent = "Codex";
  return snapshot;
};

it("Complete shows the selected agent in single and multiple repositories, including when disconnected", async () => {
  for (const width of [360, 1280]) {
    const server = await serveViewFixture({ port: 41477, folder: "customer-returns", snapshot: codex(completeSnapshot()) });
    const page = await chrome.open(server.address, { width, clock: USAGE_LIMIT_NOW });
    try {
      for (const make of [completeSnapshot, completeRepositoriesSnapshot]) {
        for (const agent of ["Codex", "Claude Code"]) {
          const snapshot = make(); snapshot.settings.agent = agent; snapshot.settings.agentId = agent === "Codex" ? "codex" : "claude_code";
          server.send("snapshot", snapshot);
          await page.waitFor(`document.querySelector('.pr') && [...document.querySelectorAll('dl > div')].some(row => row.querySelector('dt')?.textContent === 'Agent' && row.querySelector('.value')?.textContent === ${JSON.stringify(agent)})`);
          // Scope the layout assertion to the changed settings card, not the existing phase rows.
          expect(await page.evaluate(`(() => { const card = document.querySelector('.column-side .card'); return card.scrollWidth <= card.clientWidth && card.getBoundingClientRect().right <= innerWidth; })()`)).toBe(true);
        }
      }
      // A stopped server retains the completed PRD's recorded agent.
      server.send("snapshot", codex(completeSnapshot()));
      await page.waitFor(`document.querySelector('dd.value')?.textContent === 'Codex'`);
      expect(page.problems).toEqual([]);
      await server.close();
      await page.waitFor(`document.body.textContent.includes('Disconnected from Kiln')`);
      expect(await page.evaluate(`document.querySelector('dd.value')?.textContent`)).toBe("Codex");
    } finally { await page.close(); await server.close(); }
  }
});

it("Documents found and both recovery screens explicitly label each missing Codex account field", async () => {
  const identities = [
    { email: "display@example.test", expected: "display@example.test · Plan unavailable" },
    { plan: "pro", expected: "Account identity unavailable · pro" },
    { expected: "Account identity unavailable · Plan unavailable" },
    { email: "display@example.test", plan: "pro", expected: "display@example.test · pro" },
  ];
  for (const width of [360, 1280]) {
    const server = await serveViewFixture({ port: 41478, folder: "customer-returns", snapshot: codex(documentsFoundSnapshot()) });
    const page = await chrome.open(server.address, { width, clock: USAGE_LIMIT_NOW, timeZone: "America/New_York" });
    try {
      await page.waitFor(`document.querySelector('#agent')`);
      for (const make of [documentsFoundSnapshot, waitingSnapshot, needsYouUsageLimitSnapshot]) {
        for (const { email, plan, expected } of identities) {
          const snapshot = codex(make());
          const account = { ...(email ? { email } : {}), ...(plan ? { plan } : {}), at: new Date(USAGE_LIMIT_NOW).toISOString() };
          let selector: string;
          if (snapshot.feature.state === "not_started") {
            snapshot.account = { ...account, agentId: "codex", startedAt: account.at, updatedAt: account.at, limits: [] };
            selector = ".agent .sub";
          } else {
            const recovery = snapshot.waiting ?? snapshot.needsYou!;
            recovery.agent = "Codex"; recovery.agentId = "codex";
            recovery.limit = { ...recovery.limit!, agentId: "codex", account };
            selector = ".account .who";
          }
          server.send("snapshot", snapshot);
          await page.waitFor(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() === ${JSON.stringify(expected)}`);
          expect(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
        }
      }
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  }
});
