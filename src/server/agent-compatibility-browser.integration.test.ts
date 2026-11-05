// Real browser rendering of the Agent compatibility panel (AC-AGENT-04): the record's compatibility
// notices show on every screen, one line each, with no dismiss, until the record drops them.
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Snapshot } from "../engine/snapshot.js";
import { noticeLines } from "../engine/compatibility-notices.js";
import type { PrdRecord } from "../state/records.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { completeSnapshot, documentsFoundSnapshot, pausedSnapshot, runningSnapshot } from "../test-support/sample-snapshots.js";

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

const lines = noticeLines({ compatibility: [
  { feature: "codex_history", agentId: "codex", agentVersion: "0.167.0", detail: "exec_command parameter environment_id is not recognised, so that command has no receipt", observedAt: "2026-11-03T20:00:00Z" },
  { feature: "takeover", agentId: "claude_code", agentVersion: "2.1.320", detail: "hook input has no tool_use_id", attemptId: "attempt-2", observedAt: "2026-11-03T20:05:00Z" },
] } as PrdRecord);
const panel = `[...document.querySelectorAll('.command-notice')].find(notice => notice.querySelector('strong')?.textContent === 'Agent compatibility')`;

it("shows each compatibility notice on every screen without a dismiss, and removes the panel when the record drops it", async () => {
  expect(lines).toEqual(["Codex command evidence unavailable with Codex 0.167.0: exec_command parameter environment_id is not recognised, so that command has no receipt", "Pause & take over unavailable with Claude Code 2.1.320: hook input has no tool_use_id"]);
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: runningSnapshot() });
  const page = await chrome.open(server.address, { width: 360 });
  try {
    for (const make of [documentsFoundSnapshot, runningSnapshot, pausedSnapshot, completeSnapshot] as (() => Snapshot)[]) {
      server.send("snapshot", { ...make(), compatibility: lines });
      await page.waitFor(`!!${panel}`);
      expect(await page.evaluate(`[...${panel}.querySelectorAll('p')].map(p => p.textContent)`)).toEqual(lines);
      expect(await page.evaluate(`${panel}.querySelector('button')`)).toBeNull();
      expect(await page.evaluate(`${panel}.getBoundingClientRect().right <= innerWidth`)).toBe(true);
    }
    server.send("snapshot", runningSnapshot());
    await page.waitFor(`!${panel}`);
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
