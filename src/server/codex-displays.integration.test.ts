// Real browser rendering of Phase 6's presentation gaps (AC-VIEW-01/04, AC-USAGE-03).
// Snapshot fixtures inject missing metadata; provider/protocol behavior is proved elsewhere.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Snapshot } from "../engine/snapshot.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { completeRepositoriesSnapshot, completeSnapshot, documentsFoundSnapshot, runningSnapshot, pausedSnapshot, needsYouUsageLimitSnapshot, USAGE_LIMIT_NOW, waitingSnapshot } from "../test-support/sample-snapshots.js";

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

// AC-AGENT-02, AC-VIEW-01/02/04: actual built screens, including live/saved source labels.
it("keeps Codex session facts, next choices and account guidance distinct across running, paused and disconnected screens", async () => {
  const running = codex(runningSnapshot());
  running.settings.model = { value: "gpt-6-luna", displayName: "GPT-6-Luna" }; running.settings.effort = "low";
  running.account = { agentId: "codex", startedAt: "2026-10-17T15:40:00Z", updatedAt: "2026-10-17T15:40:00Z", email: "codex-screen@example.test", plan: "pro", limits: [] };
  Object.assign(running.current!, { agentId: "codex", agent: "Codex", model: "GPT-6.1-Sol", effort: "high", sessionId: "codex-local-screen", providerSessionId: "codex-native-screen", requested: { model: "gpt-6.1-sol", effort: "high" }, effective: { model: "gpt-6.1-sol", effort: "high" }, observed: [{ turnId: "screen-turn", model: "gpt-6.1-sol", effort: "high", cwd: "/assigned" }], latestLine: { line: 4, at: "2026-10-17T15:46:00Z", source: "codex", text: "Codex screen final" } });
  const output = [
    { line: 1, at: "2026-10-17T15:45:00Z", source: "claude" as const, text: "Historical Claude output" },
    { line: 2, at: "2026-10-17T15:45:20Z", source: "stderr" as const, text: "Provider error detail" },
    { line: 3, at: "2026-10-17T15:45:40Z", source: "out" as const, text: "Expected command output; exit 0" },
    { line: 4, at: "2026-10-17T15:46:00Z", source: "codex" as const, text: "Codex screen final" },
  ];
  for (const width of [360, 1280]) {
    const server = await serveViewFixture({ port: 41479, folder: "customer-returns", snapshot: running, output });
    const page = await chrome.open(server.address, { width, clock: USAGE_LIMIT_NOW, timeZone: "America/New_York" });
    try {
      await page.waitFor(`document.querySelector('.now .meta')?.textContent.includes('Codex')`);
      expect(await page.evaluate(`document.querySelector('.now .meta').textContent`)).toContain("GPT-6.1-Sol · high effort");
      const settings = await page.evaluate<string>(`[...document.querySelectorAll('dl > div')].find(r=>r.querySelector('dt')?.textContent === 'Model and effort').textContent`);
      expect(settings).toContain("GPT-6-Luna · low effort"); expect(settings).toContain("Codex · Agent fixed for this PRD.");
      expect(await page.evaluate(`document.querySelector('#acct-h').textContent`)).toBe("Codex account");
      const detail = await chrome.open(server.address + "/phase/2b", { width, clock: USAGE_LIMIT_NOW, timeZone: "America/New_York" });
      try {
        await detail.waitFor(`document.querySelectorAll('.output [data-source]').length === 4`);
        expect(await detail.evaluate(`Array.from(document.querySelectorAll('.output [data-source]'),e=>e.dataset.source)`)).toEqual(["claude", "stderr", "out", "codex"]);
        expect(await detail.evaluate(`Array.from(document.querySelectorAll('.output [data-source]'),e=>e.getAttribute('aria-label'))`)).toEqual(["Claude entry", "stderr entry", "out entry", "Codex entry"]);
        const text = await detail.evaluate<string>(`document.body.textContent`);
        for (const expected of ["codex-local-screen", "codex-native-screen", "GPT-6.1-Sol · high effort", "Requested: gpt-6.1-sol · high effort", "Effective configuration: gpt-6.1-sol · high effort", "Observed turn screen-turn: gpt-6.1-sol · high effort", "10:58 AM", "Provider error detail", "Expected command output; exit 0"]) expect(text).toContain(expected);
        expect(text).not.toContain("GPT-6-Luna");
        server.send("output", { sessionId: "codex-local-screen", lines: [{ line: 5, at: "2026-10-17T15:47:00Z", source: "codex", text: "Live Codex result" }] });
        await detail.waitFor(`document.body.textContent.includes('Live Codex result')`);
        expect(await detail.evaluate(`Array.from(document.querySelectorAll('.output [data-source]'),e=>e.getAttribute('aria-label')).at(-1)`)).toBe("Codex entry");
        expect(detail.problems).toEqual([]);
      } finally { await detail.close(); }
      const paused = codex(pausedSnapshot()); paused.account = running.account; paused.settings.model = running.settings.model; paused.settings.effort = "low";
      server.send("snapshot", paused);
      const held = await chrome.open(server.address, { width, clock: USAGE_LIMIT_NOW });
      try {
        await held.waitFor(`document.querySelector('.account .switch')`);
        expect(await held.evaluate(`document.querySelector('.account .switch').textContent`)).toContain("codex login");
        expect(await held.evaluate(`document.querySelector('#acct-h').textContent`)).toBe("Codex account");
        expect(await held.evaluate(`document.querySelector('.account').textContent`)).not.toContain("claude auth login");
        expect(await held.evaluate(`document.body.textContent`)).toContain("Nothing is running.");
        // Finish the page's asset loads before deliberately taking its server down.
        await held.evaluate(`document.fonts.ready.then(() => true)`);
        expect(held.problems).toEqual([]);
        // Ending this fixture's SSE stream deliberately produces a browser network error.
        await server.close(); await held.waitFor(`document.body.textContent.includes('Disconnected from Kiln')`);
        expect(await held.evaluate(`document.body.textContent`)).toContain("Codex · Agent fixed for this PRD.");
        expect(await held.evaluate(`document.querySelector('button.start').disabled`)).toBe(true);
        expect(held.problems.filter(problem => !problem.includes("ERR_INCOMPLETE_CHUNKED_ENCODING") || !problem.includes("/api/events"))).toEqual([]);
      } finally { await held.close(); }
    } finally { await page.close(); await server.close(); }
  }
});
