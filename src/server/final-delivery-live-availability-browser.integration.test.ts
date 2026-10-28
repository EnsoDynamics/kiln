// AC-LIVE-02/SCOPE-001: prove availability copy in the built view. The snapshot
// fixture supplies presentation states; provider execution is not under test here.
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runningSnapshot, PHASE_DETAIL_LINES } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

it.each([
  { agent: "Claude", width: 1200 }, { agent: "Claude", width: 390 },
  { agent: "Codex", width: 1200 }, { agent: "Codex", width: 390 },
] as const)("explains final-delivery availability in overview/detail and through disconnection for $agent at $width", async ({ agent, width }) => {
  const snapshot = runningSnapshot();
  snapshot.settings.agent = agent;
  snapshot.current = { ...snapshot.current!, phaseId: "pr", agent, sessionId: "final-delivery-session", steps: [], latestLine: { line: 1283, source: "out", text: "Preparing the final review pull request.", at: "2026-10-27T20:00:00Z" } };
  delete snapshot.current.seenInSession;
  snapshot.feature.currentPhaseId = "pr";
  snapshot.phases.push({ id: "pr", title: "Open pull request", file: "", state: "implementing", finishedByPerson: false });
  const port = 44260 + (agent === "Codex" ? 2 : 0) + (width === 390 ? 1 : 0);
  const options = { port, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES };
  let server = await serveViewFixture(options);
  const page = await chrome.open(server.address, { width, height: 1000 });
  const explanation = "Live messages and terminal takeover are unavailable during final delivery. Live controls support Claude phases and audits.";
  const forbidden = `document.querySelector('#live-message, #pause-h') || Array.from(document.querySelectorAll('button')).some(b => /Send message|Pause & take over|Pause after/.test(b.textContent))`;
  try {
    await page.waitFor(`document.body.innerText.includes('Watch live')`);
    expect(await page.evaluate("document.body.innerText")).toContain(explanation);
    expect(await page.evaluate("document.body.innerText")).toContain("Preparing the final review pull request.");
    expect(await page.evaluate(forbidden)).toBe(false);
    expect(await page.evaluate("document.body.innerText")).toContain("SETTINGS FOR THIS PRD");
    writeFileSync(`/tmp/kiln-final-delivery-overview-${agent}-${width}.png`, await page.screenshot());
    await page.evaluate(`Array.from(document.querySelectorAll('a')).find(a => a.textContent === 'Watch live').click()`);
    await page.waitFor(`document.body.innerText.includes('Read(src/returns/models.py)')`);
    let text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain(explanation);
    expect(text).toContain("final-delivery-session");
    expect(text).toContain(agent);
    expect(await page.evaluate(forbidden)).toBe(false);
    expect(text.indexOf("Read(src/returns/models.py)")).toBeLessThan(text.indexOf(explanation));
    expect(text.indexOf(explanation)).toBeLessThan(text.indexOf("Session ID"));
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    writeFileSync(`/tmp/kiln-final-delivery-detail-${agent}-${width}.png`, await page.screenshot());
    expect(server.commands).toEqual([]);
    expect(page.problems).toEqual([]);
    await server.close();
    await page.waitFor(`document.body.innerText.includes('Connection to Kiln lost')`, 20000);
    text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain(explanation);
    expect(text).toContain("Last-known state, observed at");
    expect(text).toContain("Work may still be running.");
    expect(text).toContain("Read(src/returns/models.py)");
    expect(text).not.toMatch(/Kiln isn’t running|Nothing is being worked on|Interrupted|kiln run docs/);
    expect(await page.evaluate(forbidden)).toBe(false);
    writeFileSync(`/tmp/kiln-final-delivery-disconnected-detail-${agent}-${width}.png`, await page.screenshot());
    await page.evaluate(`Array.from(document.querySelectorAll('a')).find(a => a.textContent === 'All phases').click()`);
    await page.waitFor(`document.querySelector('.now.lost')`);
    text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain(explanation);
    expect(text).toContain("Last-known state, observed at");
    expect(text).toContain("Preparing the final review pull request.");
    expect(text).not.toMatch(/Kiln isn’t running|Nothing is being worked on|Interrupted|kiln run docs/);
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button,input,select,textarea')).every(e => e.disabled)`)).toBe(true);
    expect(await page.evaluate(forbidden)).toBe(false);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    writeFileSync(`/tmp/kiln-final-delivery-disconnected-overview-${agent}-${width}.png`, await page.screenshot());
    server = await serveViewFixture(options);
    await page.waitFor(`document.body.innerText.includes('Connected to Kiln')`, 20000);
    expect(await page.evaluate("document.body.innerText")).toContain(explanation);
    expect(await page.evaluate(`Array.from(document.querySelectorAll('a')).some(a => a.textContent === 'Watch live')`)).toBe(true);
    expect(server.commands).toEqual([]);
    // Closing the fixture deliberately breaks SSE; only that network fault is expected.
    expect(page.problems.every(problem => /^Failed to load resource: net::ERR_(INCOMPLETE_CHUNKED_ENCODING|CONNECTION_REFUSED) http:\/\/127\.0\.0\.1:\d+\/api\/events\?/.test(problem))).toBe(true);
  } finally { await page.close(); await server.close(); }
});
