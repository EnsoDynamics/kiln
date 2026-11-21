// Built Svelte view in real Chrome; HTTP engine safety is covered by takeover.integration.
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runningSnapshot, needsYouMessageSnapshot, PHASE_DETAIL_LINES } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import type { LiveTarget } from "../live/target.js";
import { ALREADY_PAUSED } from "../live/pause-now.js";
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
const waitForCommand = async (server: { commands: string[] }, prefix: string) => { for (let i = 0; i < 100 && !server.commands.some(c => c.startsWith(prefix)); i++) await new Promise(r => setTimeout(r, 50)); expect(server.commands.some(c => c.startsWith(prefix))).toBe(true); };
const target: LiveTarget = { executionId: "execution", activityId: "activity", activityKey: "2b", sessionId: "session", providerSessionId: "session", attemptId: "attempt" };
it.each([1200, 390])("shows the Now and After choices, exact target, and the pausing panel's safety while pending and disconnected at width %i", async width => {
  const snapshot = runningSnapshot();
  snapshot.liveControl = { target, label: "Phase 2b", observedAt: new Date().toISOString(), available: true, reason: "Ready" };
  let server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
  const page = await chrome.open(server.address, { width, height: 1000 });
  const button = (label: string) => `Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()===${JSON.stringify(label)})`;
  try {
    await page.waitFor(`document.querySelector('#pause-h')?.textContent==='Pause'`);
    const text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain("Stops after the command it is running"); expect(text).toContain("Lets the phase finish.");
    // Now comes first in reading order, so it is first on narrow screens too (AC-PAUSE-01).
    expect(await page.evaluate<string[]>(`Array.from(document.querySelectorAll('.choices > section > h3')).map(h=>h.textContent)`)).toEqual(["Now", "After phase 2b"]);
    await page.evaluate(`${button("Pause now")}.click()`);
    await page.waitFor(`!${button("Pause now")}.disabled`);
    expect(server.commands.find(c => c.startsWith("POST /api/live/take-over"))).toContain(JSON.stringify(target));
    snapshot.pause.pending = true;
    snapshot.liveControl.takeover = { target, instructionId: "i", operationId: "o", requestedAt: new Date().toISOString(), state: "pending", observedAt: new Date().toISOString(), reason: "Pause now is pausing — finishing the current operation." };
    snapshot.liveControl.pauseNow = { phase: "pausing", activityKey: "2b", label: "phase 2b", requestedAt: snapshot.liveControl.takeover.requestedAt, stopped: false, running: [{ tool: "Bash", input: "npm test" }], cancel: { available: true } };
    server.send("snapshot", snapshot);
    await page.waitFor(`document.body.innerText.includes('Pausing — finishing the command it is running.')`);
    let pausing = await page.evaluate<string>("document.body.innerText");
    expect(pausing).toContain("● Bash(npm test)");
    expect(pausing).toContain("Will pause after Phase 2b finishes.");
    expect(pausing).not.toContain("Wait before opening Claude");
    // No Pause after or Pause now is offered while pausing (AC-PAUSE-03).
    expect(await page.evaluate(`!${button("Pause now")} && !${button("Pause after phase 2b")}`)).toBe(true);
    expect(await page.evaluate(`${button("Cancel pause and keep going")}.disabled`)).toBe(false);
    writeFileSync(`/tmp/kiln-live-pausing-${width}.png`, await page.screenshot());
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    await page.evaluate(`${button("Cancel end-of-phase pause")}.click()`);
    await page.waitFor(`!${button("Cancel end-of-phase pause")}.disabled`);
    expect(server.commands).toContain("DELETE /api/pause");
    snapshot.pause.pending = false; server.send("snapshot", snapshot);
    await page.waitFor(`!document.body.innerText.includes('Cancel end-of-phase pause')`);
    expect(await page.evaluate("document.body.innerText")).toContain("Pausing phase 2b");
    await server.close();
    await page.waitFor(`document.body.innerText.includes('Disconnected from Kiln')`, 20000);
    expect(await page.evaluate("document.body.innerText")).toContain("Last known: Pausing phase 2b");
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).some(e=>(e.textContent.includes('Pause now')||e.textContent.includes('Cancel pause'))&&!e.disabled)`)).toBe(false);
    server = await serveViewFixture({ port: boundPort(server.address), folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
    await page.waitFor(`document.body.innerText.includes('Connected to Kiln')`, 20000);
    pausing = await page.evaluate<string>("document.body.innerText");
    expect(pausing).toContain("Pausing — finishing the command it is running.");
    expect(pausing).not.toContain("Wait before opening Claude");
    await page.waitFor(`!${button("Cancel pause and keep going")}.disabled`);
    await page.evaluate(`${button("Cancel pause and keep going")}.click()`);
    await waitForCommand(server, "POST /api/live/cancel-take-over");
    expect(JSON.parse(server.commands.find(c => c.startsWith("POST /api/live/cancel-take-over"))!.slice("POST /api/live/cancel-take-over ".length))).toMatchObject({ target, takeoverInstructionId: "i" });
  } finally { await page.close(); await server.close(); }
});
it.each([{ label: "Delivery audit · Round 3", width: 1200 }, { label: "Delivery audit · Round 3", width: 390 }, { label: "Test audit · Round 2", width: 1200 }, { label: "Test audit · Round 2", width: 390 }])("names $label throughout the paused page at $width and keeps its command once paused, whatever later readings find", async ({ label, width }) => {
  const snapshot = needsYouMessageSnapshot(); const stop = snapshot.needsYou!;
  const auditTarget = { ...target, activityKey: "audit-activity", sessionId: stop.sessionId! };
  const [title, round] = label.split(" · Round ") as [string, string];
  const name = title.toLowerCase();
  // Only the held audit is stopped; the fixture's stopped phase 2b is otherwise unfinished, as it would be.
  snapshot.phases = snapshot.phases.map(p => p.id === "2b" ? { ...p, state: "planned" } : p);
  snapshot.activities = [...snapshot.phases, { ...snapshot.phases.find(p => p.id === "2b")!, id: auditTarget.activityKey, kind: title.startsWith("Delivery") ? "delivery_audit" : "test_audit", title, round: Number(round), state: "needs_you" }];
  stop.phaseId = auditTarget.activityKey;
  stop.phaseRecovery = { target: { executionId: "execution", phaseKey: auditTarget.activityKey, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt, live: auditTarget }, completion: "incomplete" };
  snapshot.liveControl = { target: auditTarget, label, observedAt: stop.stoppedAt, available: false, reason: "Paused.",
    takeover: { target: auditTarget, instructionId: "i", operationId: "o", requestedAt: stop.stoppedAt, releasedAt: stop.stoppedAt, state: "released", observedAt: stop.stoppedAt, reason: "Paused." },
    pauseNow: { phase: "paused", activityKey: auditTarget.activityKey, label: label.toLowerCase(), requestedAt: stop.stoppedAt, releasedAt: stop.stoppedAt, stopped: true, running: [], cancel: { available: false, reason: ALREADY_PAUSED } } };
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  const page = await chrome.open(server.address, { width, height: 1000 });
  const copy = `Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Copy')`;
  try {
    await page.waitFor(`document.body.innerText.includes(${JSON.stringify(`Resume ${name}`)})`);
    const text = await page.evaluate<string>("document.querySelector('main').innerText");
    for (const expected of [
      `Paused in ${name}`, "Kiln stopped before Claude's next command. Nothing is running.",
      "Open the same conversation in your terminal. Kiln waits while you work.", stop.resumeCommand!,
      `When you’re done, exit Claude and press Resume. If you finished ${name} there, Kiln sees that and offers to move on instead.`,
      "No special handoff phrase is needed.", "record those decisions in the requirements before you exit",
    ]) expect(text).toContain(expected);
    expect(await page.evaluate("document.querySelector('.paused-card .eyebrow').textContent")).toBe(`Paused partway · ${name} · round ${round}`);
    expect(await page.evaluate(copy)).toBe(true);
    // No checks on the paused page (PAUSE-004).
    expect(await page.evaluate(`document.querySelector('ul.checks')`)).toBeNull();
    expect(text).not.toMatch(/Needs you|Check .* again|Why Kiln stopped|Wait before opening Claude/);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    // A later reading that finds the conversation unreadable records an obstacle: the page stays paused, shows it, and keeps the command.
    snapshot.liveControl.takeover!.state = "pending";
    snapshot.liveControl.takeover!.reason = "The saved Claude conversation is missing or unreadable.";
    snapshot.liveControl.takeover!.obstacle = { code: "history_unavailable", reason: "The saved Claude conversation is missing or unreadable." };
    snapshot.liveControl.pauseNow!.obstacle = snapshot.liveControl.takeover!.obstacle;
    server.send("snapshot", snapshot);
    await page.waitFor(`document.querySelector('.paused-card .warning')?.textContent==='The saved Claude conversation is missing or unreadable.'`);
    const held = await page.evaluate<string>("document.querySelector('main').innerText");
    expect(held).toContain(`Paused in ${name}`); expect(held).toContain(stop.resumeCommand!);
    expect(held).not.toContain("Wait before opening Claude");
    expect(await page.evaluate(copy)).toBe(true);
    writeFileSync(`/tmp/kiln-live-audit-pending-${label.startsWith("Delivery") ? "delivery" : "test"}-${width}.png`, await page.screenshot());
    expect(server.commands).toEqual([]);
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it("uses a new instruction after a conclusive busy refusal while preserving the exact target", async () => {
  const snapshot = runningSnapshot(); snapshot.liveControl = { target, label: "Phase 2b", observedAt: new Date().toISOString(), available: true, reason: "Ready" };
  let attempts = 0;
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot, respond: async () => ++attempts === 1 ? { status: 409, body: { ok: false, reason: "Another request is busy." } } : { status: 202, body: { ok: true } } });
  const page = await chrome.open(server.address);
  try {
    await page.waitFor(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Pause now')`);
    const click = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Pause now').click()`;
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
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
  const page = await chrome.open(`${server.address}/phase/2b`, { width: 390, height: 1000 });
  try {
    await page.waitFor(`document.querySelector('#pause-h')`);
    const text = await page.evaluate<string>("document.body.innerText");
    expect(text).toContain("Codex");
    expect(text).toContain("Live messages and Pause now are available for supported Claude phase and audit attempts.");
    expect(text).toContain("Pause now is available for running Claude phases and audits.");
    expect(await page.evaluate(`document.querySelector('#live-message')`)).toBeNull();
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Pause now').disabled`)).toBe(true);
    const pause = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Pause after phase 2b')`;
    expect(await page.evaluate(`${pause}.disabled`)).toBe(false);
    await page.evaluate(`${pause}.click()`);
    await page.waitFor(`!${pause}.disabled`);
    expect(server.commands).toEqual(["POST /api/pause"]);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it.each(["Phase 2b", "Delivery audit · Round 3", "Test audit · Round 2"].flatMap(label => [1200, 390].map(width => ({ label, width }))))("explains the deferred pause under a released delivery-recovery hold for $label at $width and retains separate cancellation", async ({ label, width }) => {
  const snapshot = needsYouMessageSnapshot(); const stop = snapshot.needsYou!;
  const audit = label.includes("audit");
  const liveTarget = { ...target, activityKey: audit ? "audit-activity" : "2b", sessionId: stop.sessionId! };
  snapshot.pause.pending = false;
  stop.phaseRecovery = { target: { executionId: "execution", phaseKey: liveTarget.activityKey, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt, live: liveTarget }, completion: "incomplete" };
  snapshot.liveControl = { target: liveTarget, label, available: false, reason: "Released", observedAt: stop.stoppedAt, takeover: { kind: "delivery_recovery", target: liveTarget, instructionId: "i", operationId: "o", requestedAt: stop.stoppedAt, observedAt: stop.stoppedAt, state: "released", reason: "Conversation released. Review uncertain messages before explicit Resume or Verify." } };
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  const page = await chrome.open(server.address, { width, height: 1100 });
  const choice = `Array.from(document.querySelectorAll('.choices > section')).find(s => s.querySelector('h3')?.textContent.startsWith('After '))`;
  const explanation = `This session is already stopped. Hand it back to Kiln before requesting an end-of-${audit ? "audit" : "phase"} pause.`;
  try {
    await page.waitFor(`${choice}?.textContent.includes(${JSON.stringify(explanation)})`);
    expect(await page.evaluate(`${choice}.querySelector('button').disabled`)).toBe(true);
    expect(await page.evaluate(`${choice}.querySelector('button').nextElementSibling.textContent`)).toBe(explanation);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    writeFileSync(`/tmp/kiln-phase9-paused-${audit ? label.split(' ')[0] : 'phase'}-${width}.png`, await page.screenshot());
    snapshot.pause.pending = true; server.send("snapshot", snapshot);
    await page.waitFor(`${choice}.querySelector('button').textContent.includes('Cancel end-of-') && !${choice}.querySelector('button').disabled`);
    expect(await page.evaluate(`${choice}.textContent`)).not.toContain(explanation);
    await page.evaluate(`${choice}.querySelector('button').click()`);
    await page.waitFor(`!${choice}.querySelector('button').disabled`);
    expect(server.commands).toEqual(["DELETE /api/pause"]);
    expect(snapshot.liveControl.takeover?.state).toBe("released");
    snapshot.pause.pending = false; server.send("snapshot", snapshot);
    await page.waitFor(`${choice}.textContent.includes(${JSON.stringify(explanation)})`);
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it.each(["Phase 2b", "Delivery audit · Round 3", "Test audit · Round 2"].flatMap(label => [1200, 390].map(width => ({ label, width }))))("shows only a pending end-of-activity pause and its cancel once Pause now has paused $label at $width", async ({ label, width }) => {
  const snapshot = needsYouMessageSnapshot(); const stop = snapshot.needsYou!;
  const audit = label.includes("audit");
  const [title, round] = label.split(" · Round ") as [string, string | undefined];
  const key = audit ? "audit-activity" : "2b";
  // The pause panel names an audit with its round (AC-PAUSE-01).
  const name = audit ? label.toLowerCase() : "phase 2b";
  const liveTarget = { ...target, activityKey: key, sessionId: stop.sessionId! };
  if (audit) snapshot.activities = [...snapshot.phases, { ...snapshot.phases.find(p => p.id === "2b")!, id: key, kind: title.startsWith("Delivery") ? "delivery_audit" : "test_audit", title, round: Number(round), state: "needs_you" }];
  stop.phaseId = key;
  snapshot.pause.pending = false;
  stop.phaseRecovery = { target: { executionId: "execution", phaseKey: key, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt, live: liveTarget }, completion: "incomplete" };
  snapshot.liveControl = { target: liveTarget, label, available: false, reason: "Paused.", observedAt: stop.stoppedAt,
    takeover: { target: liveTarget, instructionId: "i", operationId: "o", requestedAt: stop.stoppedAt, releasedAt: stop.stoppedAt, observedAt: stop.stoppedAt, state: "released", reason: "Paused." },
    pauseNow: { phase: "paused", activityKey: key, label: label.toLowerCase(), requestedAt: stop.stoppedAt, releasedAt: stop.stoppedAt, stopped: true, running: [], cancel: { available: false, reason: ALREADY_PAUSED } } };
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  const page = await chrome.open(server.address, { width, height: 1100 });
  const card = `document.querySelector(${JSON.stringify(`section[aria-label="Pause after ${name}"]`)})`;
  const cancel = audit ? "Cancel end-of-audit pause" : "Cancel end-of-phase pause";
  try {
    await page.waitFor(`document.querySelector('.paused-card')`);
    // Once paused, the pause panel is not shown at all: no Pause now, no Pause after, no stopped-session explanation (AC-PAUSE-03).
    expect(await page.evaluate(`document.querySelector('#pause-h')`)).toBeNull();
    expect(await page.evaluate(`${card}`)).toBeNull();
    expect(await page.evaluate("document.body.innerText")).not.toMatch(/Pause now|Pause after|Hand it back to Kiln/);
    snapshot.pause.pending = true; server.send("snapshot", snapshot);
    await page.waitFor(`${card}?.querySelector('button') && !${card}.querySelector('button').disabled`);
    expect(await page.evaluate(`${card}.innerText`)).toContain(`Will pause after ${label} finishes.`);
    expect(await page.evaluate(`${card}.querySelector('button').textContent.trim()`)).toBe(cancel);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    await page.evaluate(`${card}.querySelector('button').click()`);
    await page.waitFor(`!${card}.querySelector('button').disabled`);
    expect(server.commands).toEqual(["DELETE /api/pause"]);
    snapshot.pause.pending = false; server.send("snapshot", snapshot);
    await page.waitFor(`!${card}`);
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
