// The header's PRD total line in a real browser (time totals AC-TOTAL-01 to 04): served by the
// real local server from an engine whose only session so far is a delivery audit, so the audit's
// running time is in the total; then from fixture snapshots, for the counter going up without a
// reload, the mockup's wording and order, and phone width.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildSnapshot } from "../engine/snapshot.js";
import { createHarness, landingSession, pullRequestSession, type Harness } from "../test-support/engine-harness.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { git } from "../test-support/git-repositories.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { completeSnapshot, runningSnapshot, RUNNING_NOW } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import type { LocalServer } from "./local-server.js";

const MOCKUP = new URL("../../docs/changes/kiln-prd-time-totals/mockups/kiln-prd-time-totals.html", import.meta.url).href;
const TIME_ZONE = "America/New_York";
/** The line's parts as written (innerText would give the label's uppercase styling). */
const lineOf = (selector: string) => `([...(document.querySelector(${JSON.stringify(selector)})?.children ?? [])].map(e => e.textContent).join(" ").replace(/\\s+/g, " ").trim())`;
const TOTALS = lineOf("p.totals");

let chrome: HeadlessChrome;
let h: Harness | undefined;
let server: LocalServer | undefined;
let release: (() => void) | undefined;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
afterEach(async () => { await server?.close(); server = undefined; release?.(); release = undefined; await h?.cleanup(); h = undefined; });

const files = {
  "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
  "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
  "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
  "value.mjs": "export const value = () => 42;\n",
  "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
};

describe("the PRD total line from the real local server (AC-TOTAL-01, AC-TOTAL-02)", () => {
  it("counts a delivery audit's session as running time and shows the line on the page", async () => {
    const sessions = [pullRequestSession()];
    h = await createHarness({ folder: "proof", files, sessions, auditCycles: true });
    writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
    git(h.sandbox, h.repository, "add", "--", ".gitignore");
    git(h.sandbox, h.repository, "commit", "-m", "test(totals): ignore transient requests");
    git(h.sandbox, h.repository, "push", "origin", "develop");
    // The audit ends without its report, so the PRD stops at Needs you with the audit as its only session.
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions: [{ actions: [{ auditReport: { noReport: true } }, { result: "Audit ended." }, { exit: 0 }] }] }));
    const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
    server = hosted.server; release = hosted.release;

    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const engine = h.engine;
    const snapshot = buildSnapshot(engine);
    expect(snapshot.feature.state).toBe("needs_you");
    const auditKeys = Object.keys(engine.record.phases).filter(key => key.startsWith("audit-"));
    const auditRuns = auditKeys.flatMap(key => (engine.record.phases[key]!.sessionIds ?? []).flatMap(id => engine.sessionRecord(key, id)?.runs ?? []));
    expect(auditRuns.length).toBeGreaterThan(0);
    const auditRunning = auditRuns.reduce((sum, run) => sum + Date.parse(run.endedAt ?? run.interruptedAt!) - Date.parse(run.startedAt), 0);
    // No phase session ran (phase 1 was closed before Kiln started), so the audit is the whole running total.
    expect(snapshot.feature.timing).toMatchObject({ runningMs: auditRunning, advancing: "waiting" });

    // Delivery reopening a completed PRD leaves completedAt set while the PRD is no longer currently
    // complete (Engine.currentlyComplete, with development delivery's ledger reopened): the totals still count (AC-TOTAL-03).
    engine.record.completedAt = engine.record.startedAt!;
    Object.defineProperty(engine, "currentlyComplete", { configurable: true, get: () => false });
    const reopened = buildSnapshot(engine);
    expect(reopened.feature.state).toBe("needs_you");
    expect(reopened.feature.timing).toMatchObject({ runningMs: auditRunning, advancing: "waiting" });
    expect(Date.parse(reopened.feature.timing!.asOf)).toBeGreaterThan(Date.parse(engine.record.startedAt!));
    delete engine.record.completedAt;
    delete (engine as { currentlyComplete?: boolean }).currentlyComplete;

    const page = await chrome.open(server.address, { timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.querySelector("p.totals")`);
      const line = await page.evaluate<string>(TOTALS);
      expect(line).toMatch(/^PRD total \d+m running · \d+m waiting · since \d{1,2}:\d{2} [AP]M$/);
      // A scripted audit runs for seconds, so its running total rounds to whole minutes under an hour.
      expect(auditRunning).toBeLessThan(59 * 60_000);
      expect(line).toContain(`PRD total ${Math.round(auditRunning / 60_000)}m running`);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); }
  });
});

describe("the PRD total over a whole run (AC-TOTAL-02)", () => {
  it("sums every phase session and the pull-request session as running, and counts the rest since the start as waiting", async () => {
    h = await createHarness({ sessions: [landingSession("src/a.txt"), landingSession("src/b.txt"), landingSession("src/c.txt"), pullRequestSession(218)] });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const engine = h.engine;
    expect(engine.record.completedAt).toBeDefined();
    const snapshot = buildSnapshot(engine);
    const keys = Object.keys(engine.record.phases);
    expect(keys).toEqual(expect.arrayContaining(["1", "2b", "3", "pr"]));
    const runs = keys.flatMap(key => (engine.record.phases[key]!.sessionIds ?? []).flatMap(id => engine.sessionRecord(key, id)?.runs ?? []));
    expect(runs.length).toBeGreaterThanOrEqual(4);
    // Sessions run one after another, so their running time is the plain sum of their runs.
    const running = runs.reduce((sum, run) => sum + Date.parse(run.endedAt ?? run.interruptedAt!) - Date.parse(run.startedAt), 0);
    const elapsed = Date.parse(engine.record.completedAt!) - Date.parse(engine.record.startedAt!);
    expect(snapshot.feature.timing).toEqual({ runningMs: running, waitingMs: elapsed - running, asOf: engine.record.completedAt });
    // The gaps before and between sessions count as waiting, which the phase rows' own waiting leaves out.
    const rowsWaiting = snapshot.phases.reduce((sum, row) => sum + (row.timing?.waitingMs ?? 0), 0);
    expect(snapshot.feature.timing!.waitingMs).toBeGreaterThanOrEqual(rowsWaiting);
    expect(elapsed - running).toBeGreaterThan(0);
  });
});

describe("the PRD total line against its mockup (AC-TOTAL-03, AC-TOTAL-04)", () => {
  // Just under 100 minutes, so the running total turns from 1h 39m to 1h 40m a second or so after the page opens.
  const ticking = () => {
    const snapshot = runningSnapshot();
    snapshot.feature.timing = { runningMs: 99 * 60_000 + 29_000, waitingMs: 30 * 60_000, asOf: new Date(RUNNING_NOW).toISOString(), advancing: "running" };
    return snapshot;
  };

  it("goes up while the page stays open, with no reload", async () => {
    const fixture = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: ticking() });
    const page = await chrome.open(fixture.address, { clock: RUNNING_NOW, timeZone: TIME_ZONE });
    try {
      await page.waitFor(`document.querySelector("p.totals")`);
      expect(await page.evaluate<string>(TOTALS)).toBe("PRD total 1h 39m running · 30m waiting · since 9:17 AM");
      await page.waitFor(`${TOTALS}.includes("1h 40m running")`, 10_000);
      expect(await page.evaluate<string>(TOTALS)).toBe("PRD total 1h 40m running · 30m waiting · since 9:17 AM");
    } finally { await page.close(); await fixture.close(); }
  });

  it("matches the mockup's label, order and hairline, on its own line, and wraps without overflow at phone width", async () => {
    const fixture = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: ticking() });
    const page = await chrome.open(fixture.address, { clock: RUNNING_NOW, timeZone: TIME_ZONE, width: 390 });
    const drawn = await chrome.open(MOCKUP, { width: 390 });
    try {
      await page.waitFor(`document.querySelector("p.totals")`);
      // The mockup's Implementing line, with its sample times and start in place of the page's.
      const shape = (text: string) => text.replace(/\d+h \d+m|\d+h|\d+m/g, "<time>").replace(/since .*$/, "since <start>");
      const drawnLine = await drawn.evaluate<string>(lineOf("section:nth-of-type(2) .totals"));
      expect(shape(await page.evaluate<string>(TOTALS))).toBe(shape(drawnLine));
      expect(await page.evaluate<string>(`getComputedStyle(document.querySelector("p.totals")).borderTopStyle`)).toBe("solid");
      // Under the state row, not beside it, and inside the window.
      const layout = await page.evaluate<{ pillBottom: number; totalsTop: number; right: number; scroll: number; width: number }>(`(() => {
        const pill = document.querySelector("p.totals").parentElement.querySelector(".pill").getBoundingClientRect();
        const totals = document.querySelector("p.totals").getBoundingClientRect();
        return { pillBottom: pill.bottom, totalsTop: totals.top, right: totals.right, scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth };
      })()`);
      expect(layout.totalsTop).toBeGreaterThanOrEqual(layout.pillBottom);
      expect(layout.right).toBeLessThanOrEqual(layout.width);
      expect(layout.scroll).toBeLessThanOrEqual(layout.width);
      // At phone width the line wraps onto more than one row, and no two of its parts overlap.
      const parts = await page.evaluate<{ top: number; bottom: number; left: number; right: number }[]>(`[...document.querySelector("p.totals").children].map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })`);
      expect(new Set(parts.map(part => Math.round(part.top))).size).toBeGreaterThan(1);
      for (const [i, a] of parts.entries()) for (const b of parts.slice(i + 1)) expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await drawn.close(); await fixture.close(); }
  });

  it("matches the mockup's Complete line: the span in place of since", async () => {
    const done = completeSnapshot();
    done.feature.timing = { runningMs: 280 * 60_000, waitingMs: 58 * 60_000, asOf: done.feature.completedAt! };
    const fixture = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: done });
    const page = await chrome.open(fixture.address, { clock: RUNNING_NOW, timeZone: TIME_ZONE });
    const drawn = await chrome.open(MOCKUP);
    try {
      await page.waitFor(`document.querySelector("p.totals")`);
      expect(await page.evaluate<string>(TOTALS)).toBe("PRD total 4h 40m running · 58m waiting · 9:17 AM to 2:55 PM");
      const shape = (text: string) => text.replace(/\d+h \d+m|\d+h|\d+m/g, "<time>").replace(/(?:[A-Z][a-z]{2} )?\d{1,2}:\d{2} [AP]M/g, "<clock>");
      expect(shape(await page.evaluate<string>(TOTALS))).toBe(shape(await drawn.evaluate<string>(lineOf("section:nth-of-type(6) .totals"))));
    } finally { await page.close(); await drawn.close(); await fixture.close(); }
  });
});
