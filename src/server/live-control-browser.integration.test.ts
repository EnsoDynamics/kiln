// Built Svelte view in real Chrome; HTTP engine safety is covered by takeover.integration.
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runningSnapshot, needsYouMessageSnapshot, PHASE_DETAIL_LINES } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import type { LiveTarget } from "../live/target.js";
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
const target: LiveTarget = { executionId: "execution", activityId: "activity", activityKey: "2b", sessionId: "session", providerSessionId: "session", attemptId: "attempt" };
it.each([1200, 390])("shows paired timing, exact target and pending/disconnected safety at width %i", async width => {
  const snapshot = runningSnapshot();
  snapshot.liveControl = { target, label: "Phase 2b", observedAt: new Date().toISOString(), available: true, reason: "Ready" };
  let server = await serveViewFixture({ port: width === 1200 ? 42051 : 42052, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
  const page = await chrome.open(server.address, { width, height: 1000 });
  try {
    await page.waitFor(`document.body.textContent.includes('When should Kiln pause?')`);
    const text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain("At the next safe stopping point."); expect(text).toContain("After the whole phase.");
    expect(text.indexOf("Take over this session")).toBeLessThan(text.indexOf("Let Phase 2b finish first"));
    await page.evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Pause & take over').click()`);
    await page.waitFor(`!Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Pause & take over').disabled`);
    expect(server.commands.find(c => c.startsWith("POST /api/live/take-over"))).toContain(JSON.stringify(target));
    snapshot.pause.pending = true;
    snapshot.liveControl.takeover = { target, instructionId: "i", operationId: "o", requestedAt: new Date().toISOString(), state: "pending", observedAt: new Date().toISOString(), reason: "The first tool is still running." };
    server.send("snapshot", snapshot);
    await page.waitFor(`document.body.innerText.includes('Wait before opening Claude')`);
    expect(await page.evaluate("document.body.innerText")).toContain("Cancel end-of-phase pause");
    writeFileSync(`/tmp/kiln-live-pausing-${width}.png`, await page.screenshot());
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    await page.evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Cancel end-of-phase pause').click()`);
    await page.waitFor(`!Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Cancel end-of-phase pause').disabled`);
    expect(server.commands).toContain("DELETE /api/pause");
    snapshot.pause.pending = false; server.send("snapshot", snapshot);
    await page.waitFor(`!document.body.innerText.includes('Cancel end-of-phase pause')`);
    expect(await page.evaluate("document.body.innerText")).toContain("Pausing for takeover");
    await server.close();
    await page.waitFor(`document.body.innerText.includes('Disconnected from Kiln')`, 20000);
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent.includes('Pause & take over')&&!e.disabled)`)).toBe(false);
    server = await serveViewFixture({ port: width === 1200 ? 42051 : 42052, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
    await page.waitFor(`document.body.innerText.includes('Connected to Kiln')`, 20000);
    expect(await page.evaluate("document.body.innerText")).toContain("Wait before opening Claude");
  } finally { await page.close(); await server.close(); }
});
it.each([{ label: "Delivery audit · Round 3", width: 1200 }, { label: "Delivery audit · Round 3", width: 390 }, { label: "Test audit · Round 2", width: 1200 }, { label: "Test audit · Round 2", width: 390 }])("names $label throughout terminal hand-back at $width and suppresses commands until released", async ({ label, width }) => {
  const snapshot = needsYouMessageSnapshot(); const stop = snapshot.needsYou!;
  const auditTarget = { ...target, activityKey: "audit-activity", sessionId: stop.sessionId! };
  stop.phaseId = auditTarget.activityKey;
  stop.phaseRecovery = { target: { executionId: "execution", phaseKey: auditTarget.activityKey, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt, live: auditTarget }, completion: "incomplete" };
  snapshot.liveControl = { target: auditTarget, label, observedAt: stop.stoppedAt, available: false, reason: "Released", takeover: { target: auditTarget, instructionId: "i", operationId: "o", requestedAt: stop.stoppedAt, state: "released", observedAt: stop.stoppedAt, reason: "Paused for terminal takeover." } };
  const server = await serveViewFixture({ port: 42053, folder: "customer-returns", snapshot });
  const page = await chrome.open(server.address, { width, height: 1000 });
  try {
    await page.waitFor(`document.body.innerText.includes(${JSON.stringify(`Resume ${label} in Kiln`)})`);
    const text = await page.evaluate<string>("document.body.innerText");
    for (const expected of [
      `Then choose who finishes ${label}.`, `Verify ${label} & advance`,
      `${label} can still be unfinished, with uncommitted or unpushed work. Kiln finishes ${label} before following the rest of the plan.`,
      "Exit the Claude Code session first.", "No special handoff phrase is needed.", "record those decisions in the requirements before you exit",
    ]) expect(text).toContain(expected);
    expect(await page.evaluate(`document.querySelector('ul.checks').getAttribute('aria-label')`)).toBe(`${label} completion requirements`);
    expect(text).not.toMatch(/finishes the phase|finish the phase|phase was already complete|The phase can still/);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    snapshot.unsentReplies = [{ id: "saved", text: "retained instruction" }];
    server.send("snapshot", snapshot);
    await page.waitFor(`document.body.innerText.includes(${JSON.stringify(`because ${label} was already complete`)})`);
    stop.resumeOffered = false;
    server.send("snapshot", snapshot);
    await page.waitFor(`document.body.innerText.includes(${JSON.stringify(`Use the terminal recovery instructions to finish ${label}, then verify it.`)})`);
    expect(await page.evaluate("document.body.innerText")).not.toContain("finish the phase");
    snapshot.liveControl.takeover!.state = "pending";
    snapshot.liveControl.takeover!.reason = "The saved Claude conversation is missing or unreadable.";
    server.send("snapshot", snapshot);
    await page.waitFor(`document.body.innerText.includes('Wait before opening Claude')`);
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent.includes('Copy resume command'))`)).toBe(false);
    expect(await page.evaluate("document.body.innerText")).toContain("Saved conversation recovery");
    writeFileSync(`/tmp/kiln-live-audit-pending-${label.startsWith("Delivery") ? "delivery" : "test"}-${width}.png`, await page.screenshot());
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it("uses a new instruction after a conclusive busy refusal while preserving the exact target", async () => {
  const snapshot = runningSnapshot(); snapshot.liveControl = { target, label: "Phase 2b", observedAt: new Date().toISOString(), available: true, reason: "Ready" };
  let attempts = 0;
  const server = await serveViewFixture({ port: 42054, folder: "customer-returns", snapshot, respond: async () => ++attempts === 1 ? { status: 409, body: { ok: false, reason: "Another request is busy." } } : { status: 202, body: { ok: true } } });
  const page = await chrome.open(server.address);
  try {
    await page.waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Pause & take over')`);
    const click = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Pause & take over').click()`;
    await page.evaluate(click); await page.waitFor(`document.body.innerText.includes('Another request is busy.')`);
    await page.evaluate(click); await page.waitFor(`!document.body.innerText.includes('Another request is busy.')`);
    const requests = server.commands.map(c => JSON.parse(c.slice(c.indexOf('{'))) as { instructionId: string; target: LiveTarget });
    expect(requests).toHaveLength(2); expect(requests[0]!.instructionId).not.toBe(requests[1]!.instructionId); expect(requests.map(r => r.target)).toEqual([target, target]);
  } finally { await page.close(); await server.close(); }
});

it("explains Claude-only live controls for running Codex while preserving deferred pause", async () => {
  const snapshot = runningSnapshot();
  snapshot.current!.agent = "Codex";
  snapshot.settings.agent = "Codex";
  delete snapshot.liveControl;
  const server = await serveViewFixture({ port: 42055, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
  const page = await chrome.open(`${server.address}/phase/2b`, { width: 390, height: 1000 });
  try {
    await page.waitFor(`document.querySelector('#pause-h')`);
    const text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain("Codex");
    expect(text).toContain("Live messages and terminal takeover are available for supported Claude phase and audit attempts.");
    expect(text).toContain("Live takeover is available for running Claude phases and audits.");
    expect(await page.evaluate(`document.querySelector('#live-message')`)).toBeNull();
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Pause & take over').disabled`)).toBe(true);
    const pause = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Pause after this phase')`;
    expect(await page.evaluate(`${pause}.disabled`)).toBe(false);
    await page.evaluate(`${pause}.click()`);
    await page.waitFor(`!${pause}.disabled`);
    expect(server.commands).toEqual(["POST /api/pause"]);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
