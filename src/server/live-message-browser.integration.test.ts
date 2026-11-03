// Built browser workflow proof; engine and provider effects have their own boundary tests.
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { runningSnapshot, needsYouMessageSnapshot, PHASE_DETAIL_LINES } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import type { Receipt } from "../control/commands.js";
import type { LiveTarget } from "../live/target.js";
/** An activity's name mid-sentence, as the hand-back page writes it: "Phase 2b", "delivery audit · Round 3". */
const inSentence = (label: string) => /^Phase /.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
const target = (sessionId: string, activityKey = "2b"): LiveTarget => ({ executionId: "execution", activityId: "activity", activityKey, sessionId, providerSessionId: sessionId, attemptId: "attempt" });
it.each([1200, 390])("preserves an exact attempt's draft through navigation and input loss; shows composer then pause choices at %i", async width => {
  const snapshot = runningSnapshot(); const t = target(snapshot.current!.sessionId!); const text = "  /literal @file\n$(no-shell)  ";
  snapshot.liveControl = { target: t, label: "Phase 2b", observedAt: new Date().toISOString(), available: true, reason: "Ready", input: { available: true, reason: "Ready", pending: 0 } };
  let saved: Receipt | undefined;
  const server = await serveViewFixture({ port: width === 1200 ? 43051 : 43052, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES, respond: async (command, body) => {
    if (command === "POST /api/live/message") { const request = JSON.parse(body) as { instructionId: string; text: string }; saved = { id: "receipt", command_id: request.instructionId, accepted_at: "2026-10-28T12:34:56.000Z", message: { text: request.text, uuid: "uuid", delivery: "submitted" } } as Receipt; return { status: 202, body: { ok: true, receipt: saved } }; }
    return { status: 200, body: { ok: true, receipts: saved ? [saved] : [] } };
  } });
  const page = await chrome.open(`${server.address}/phase/2b`, { width, height: 1100 });
  try {
    await page.waitFor(`document.querySelector('#live-message')`);
    expect(await page.evaluate("document.querySelector('#live-message-timing').textContent")).toBe("Claude reads this at its next opportunity. The current tool may finish first.");
    expect(await page.evaluate("document.querySelector('#live-message-limit').textContent")).toContain("0 / 4,000 UTF-16 code units");
    const body = await page.evaluate<string>("document.body.textContent");
    expect(body.indexOf("Message Claude")).toBeLessThan(body.indexOf("When should Kiln pause?")); expect(body.indexOf("When should Kiln pause?")).toBeLessThan(body.indexOf("Progress"));
    await page.evaluate(`document.querySelector('#live-message').value=${JSON.stringify(text)}; document.querySelector('#live-message').dispatchEvent(new Event('input',{bubbles:true}))`);
    await page.evaluate(`Array.from(document.querySelectorAll('a')).find(a=>a.textContent.includes('All phases')).click()`);
    await page.waitFor(`document.body.innerText.includes('Control live session')`);
    await page.evaluate(`Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='Control live session').click()`);
    await page.waitFor(`document.querySelector('#live-message')?.value===${JSON.stringify(text)}`);
    snapshot.liveControl.input = { available: false, reason: "Input connection lost. Your draft is retained.", pending: 0 }; server.send("snapshot", snapshot);
    await page.waitFor(`document.body.innerText.includes('Input connection lost')`);
    expect(await page.evaluate(`document.querySelector('#live-message').value`)).toBe(text);
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send message').disabled`)).toBe(true);
    snapshot.liveControl.input.available = true; server.send("snapshot", snapshot);
    await page.waitFor(`!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send message').disabled`);
    await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send message').click()`);
    await page.waitFor(`document.body.innerText.includes('Submission recorded')`);
    expect(JSON.parse(server.commands.find(c => c.startsWith("POST /api/live/message"))!.split("POST /api/live/message ")[1]!).text).toBe(text);
    snapshot.liveControl.messages = [{ id: saved!.id, instructionId: saved!.command_id, acceptedAt: saved!.accepted_at, delivery: "submitted" }]; server.send("snapshot", snapshot);
    await page.waitFor(`document.body.innerText.includes('Sent to session — not confirmed read')`);
    expect(await page.evaluate("document.querySelector('.messages pre').textContent")).toBe(text);
    const submittedTime = await page.evaluate<string>(`new Date(${JSON.stringify(saved!.accepted_at)}).toLocaleString()`);
    expect(await page.evaluate("document.querySelector('.messages .hint').textContent")).toBe(`Submitted ${submittedTime}`);
    expect(await page.evaluate("document.querySelector('.messages a').getAttribute('href')")).toBe('/customer-returns/phase/2b');
    for (const [delivery, label] of [["received", "Received by Claude"], ["not_sent", "Not sent"]] as const) {
      saved!.message!.delivery = delivery; snapshot.liveControl.messages[0]!.delivery = delivery; server.send("snapshot", snapshot);
      await page.waitFor(`document.querySelector('.messages article strong')?.textContent===${JSON.stringify(label)}`);
      expect(await page.evaluate("document.querySelector('.messages pre').textContent")).toBe(text);
      expect(await page.evaluate("document.querySelector('.messages .hint').textContent")).toBe(`Submitted ${submittedTime}`);
      expect(await page.evaluate("document.querySelector('.messages').textContent")).toContain("This receipt does not confirm that the requested action happened.");
    }
    expect(await page.evaluate("document.querySelector('#live-message').value")).toBe(text);
    expect(await page.evaluate("document.querySelector('#live-message').disabled")).toBe(false);
    expect(server.commands.filter(c => c.startsWith("POST /api/live/message "))).toHaveLength(1);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    writeFileSync(`/tmp/kiln-live-messages-${width}.png`, await page.screenshot());
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
it.each(["Phase 2b", "Test audit · Round 2"])("keeps %s held after uncertain-message review until explicit hand-back", async label => {
  const snapshot = needsYouMessageSnapshot(); const stop = snapshot.needsYou!; const key = label.startsWith("Test") ? "audit-test-2" : stop.phaseId; const t = target(stop.sessionId!, key);
  stop.phaseId = key; stop.phaseRecovery = { target: { executionId: "execution", phaseKey: key, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt, live: t }, completion: "incomplete" };
  const r = { id: "receipt", command_id: "message", accepted_at: stop.stoppedAt, message: { text: "  review exact instruction\n", uuid: "uuid", delivery: "uncertain" } } as Receipt;
  snapshot.liveControl = { target: t, label, observedAt: stop.stoppedAt, available: false, reason: "Review required", takeover: { kind: "delivery_recovery", target: t, operationId: "o", instructionId: "message", requestedAt: stop.stoppedAt, observedAt: stop.stoppedAt, state: "released", reason: "Released" }, reviewRequired: [r.id], messages: [{ id: r.id, instructionId: r.command_id, acceptedAt: r.accepted_at, delivery: "uncertain" }] };
  const server = await serveViewFixture({ port: label.startsWith("Test") ? 43054 : 43053, folder: "customer-returns", snapshot, respond: async command => {
    if (command === "POST /api/live/message-review") { r.message!.reviewedAt = new Date().toISOString(); snapshot.liveControl!.reviewRequired = []; snapshot.liveControl!.messages![0]!.reviewedAt = r.message!.reviewedAt; server.send("snapshot", snapshot); }
    return { status: 200, body: { ok: true, receipts: [r] } };
  } });
  const page = await chrome.open(server.address);
  try {
    await page.waitFor(`document.body.innerText.includes('I reviewed this message in the conversation')`);
    const resume = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Have Kiln resume ${inSentence(label)}')`;
    expect(await page.evaluate(`${resume}.disabled`)).toBe(true);
    await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='I reviewed this message in the conversation').click()`);
    await page.waitFor(`document.body.innerText.includes('Review acknowledged')`);
    expect(await page.evaluate("document.body.innerText")).toContain("Delivery uncertain");
    expect(server.commands).toHaveLength(1); expect(server.commands[0]).toContain("POST /api/live/message-review");
    expect(await page.evaluate(`${resume}.disabled`)).toBe(false);
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it("retains the original instruction after a lost POST and a receipt-lookup 404, then recovers the same uncertain receipt", async () => {
  const snapshot = runningSnapshot(); const t = target(snapshot.current!.sessionId!);
  snapshot.liveControl = { target: t, label: "Phase 2b", observedAt: new Date().toISOString(), available: true, reason: "Ready", input: { available: true, reason: "Ready", pending: 0 } };
  let original: { instructionId: string; text: string } | undefined; let lookups = 0;
  const r = { id: "uncertain", command_id: "", accepted_at: new Date().toISOString(), message: { text: "", uuid: "uuid", delivery: "uncertain" } } as Receipt;
  const server = await serveViewFixture({ port: 43055, folder: "customer-returns", snapshot, respond: async (command, body) => {
    if (command === "POST /api/live/message") { original = JSON.parse(body) as typeof original; r.command_id = original!.instructionId; r.message!.text = original!.text; return null; }
    if (command.startsWith("GET /api/live/instructions/")) {
      if (++lookups === 1) return { status: 404, body: { ok: false, reason: "Receipt lookup unavailable" } };
      snapshot.liveControl!.input!.available = false; snapshot.liveControl!.messages = [{ id: r.id, instructionId: r.command_id, acceptedAt: r.accepted_at, delivery: "uncertain" }]; server.send("snapshot", snapshot);
      return { status: 200, body: { ok: true, receipt: r } };
    }
    return { status: 200, body: { ok: true, receipts: original ? [r] : [] } };
  } });
  const page = await chrome.open(`${server.address}/phase/2b`);
  try {
    await page.waitFor(`document.querySelector('#live-message')`);
    await page.evaluate(`document.querySelector('#live-message').value='retain exact uncertain instruction';document.querySelector('#live-message').dispatchEvent(new Event('input',{bubbles:true}));`);
    const send = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send message')`;
    const check = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Check submission')`;
    await page.evaluate(`${send}.click()`); await page.waitFor(`${check}`);
    await page.evaluate(`${check}.click()`); await page.waitFor(`!${check}.disabled && document.body.innerText.includes('Submission outcome unknown')`);
    expect(await page.evaluate(`${send}.disabled`)).toBe(true);
    await page.evaluate(`${check}.click()`); await page.waitFor(`document.body.innerText.includes('Delivery uncertain')`);
    const sends = server.commands.filter(c => c.startsWith("POST /api/live/message "));
    // Chrome can retry a failed reused connection; every retry must retain one intention.
    expect(sends.length).toBeGreaterThan(0); expect(new Set(sends).size).toBe(1);
    expect(await page.evaluate(`document.querySelector('#live-message').value`)).toBe(original!.text);
  } finally { await page.close(); await server.close(); }
});

it("disables Send and takeover throughout a pending HTTP submission and pending provider write", async () => {
  const snapshot = runningSnapshot(); const t = target(snapshot.current!.sessionId!);
  snapshot.liveControl = { target: t, label: "Phase 2b", observedAt: new Date().toISOString(), available: true, reason: "Ready", input: { available: true, reason: "Ready", pending: 0 } };
  let release!: () => void;
  const r = { id: "pending", command_id: "pending", accepted_at: new Date().toISOString(), message: { text: "message pending", uuid: "uuid", delivery: "submitting" } } as Receipt;
  const server = await serveViewFixture({ port: 43056, folder: "customer-returns", snapshot, respond: async command => {
    if (command === "POST /api/live/message") { r.command_id = JSON.parse(server.commands.at(-1)!.split("POST /api/live/message ")[1]!).instructionId; await new Promise<void>(resolve => { release = resolve; }); return { status: 202, body: { ok: true, receipt: r } }; }
    return { status: 200, body: { ok: true, receipts: [r] } };
  } });
  const page = await chrome.open(`${server.address}/phase/2b`);
  try {
    await page.waitFor(`document.querySelector('#live-message')`);
    await page.evaluate(`document.querySelector('#live-message').value='message pending';document.querySelector('#live-message').dispatchEvent(new Event('input',{bubbles:true}));`);
    const send = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send message')`; const take = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Pause & take over')`;
    await page.evaluate(`${send}.click()`); await page.waitFor(`document.body.innerText.includes('Submitting')`);
    expect(await page.evaluate(`${send}.disabled && ${take}.disabled`)).toBe(true);
    release();
    await page.waitFor(`document.body.innerText.includes('delivery is still pending')`);
    // The HTTP receipt precedes any new snapshot: retain the same instruction.
    expect(await page.evaluate(`${send}.disabled && ${take}.disabled`)).toBe(true);
    expect(await page.evaluate(`document.querySelector('#live-message').value`)).toBe("message pending");
    snapshot.liveControl.messages = [{ id: r.id, instructionId: r.command_id, acceptedAt: r.accepted_at, delivery: "submitting" }]; snapshot.liveControl.input!.available = false; server.send("snapshot", snapshot);
    expect(await page.evaluate(`${send}.disabled && ${take}.disabled`)).toBe(true);
    r.message!.delivery = "submitted"; snapshot.liveControl.messages[0]!.delivery = "submitted"; snapshot.liveControl.input!.available = true; server.send("snapshot", snapshot);
    await page.waitFor(`!${send}.disabled && !${take}.disabled`);
    expect(server.commands.filter(c => c.startsWith("POST /api/live/take-over"))).toHaveLength(0);
  } finally { release?.(); await page.close(); await server.close(); }
});

it("shows active audit identity, gives a successor an empty draft, and excludes historical controls", async () => {
  const snapshot = runningSnapshot(); const current = snapshot.current!; const t = target(current.sessionId!, "audit-test-3");
  current.phaseId = t.activityKey;
  snapshot.activities = [{ ...snapshot.phases[0]!, id: "1", state: "done", details: { sessionId: "historical-session", from: current.startedAt!, model: "Sonnet", worktree: "/fixture/worktree", branch: "fixture" } }, { ...snapshot.phases[0]!, id: t.activityKey, kind: "test_audit", round: 3, title: "Test audit · Round 3", state: "implementing" }];
  snapshot.liveControl = { target: t, label: "Test audit · Round 3", observedAt: new Date().toISOString(), available: true, reason: "Ready", input: { available: true, reason: "Ready", pending: 0 } };
  const server = await serveViewFixture({ port: 43057, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
  const page = await chrome.open(`${server.address}/phase/${t.activityKey}`);
  try {
    await page.waitFor(`document.querySelector('#live-message')`);
    expect(await page.evaluate("document.body.textContent")).toContain("Test audit · Round 3 · Claude");
    await page.evaluate(`document.querySelector('#live-message').value='predecessor draft';document.querySelector('#live-message').dispatchEvent(new Event('input',{bubbles:true}));`);
    current.sessionId = "successor-session"; snapshot.liveControl.target = { ...t, sessionId: current.sessionId, providerSessionId: current.sessionId, attemptId: "successor" }; server.send("snapshot", snapshot);
    await page.waitFor(`document.querySelector('#live-message')?.value===''`);
    expect(await page.evaluate("document.body.textContent")).toContain("successor-session");
    // The earlier phase is historical even while another activity is live.
    await page.evaluate(`history.pushState(null,'','/customer-returns/phase/1');dispatchEvent(new PopStateEvent('popstate'))`);
    await page.waitFor(`!document.querySelector('#live-message')`);
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Pause & take over')`)).toBe(false);
  } finally { await page.close(); await server.close(); }
});

it.each([1200, 390])("explains invalid literal drafts without rewriting them at %i", async width => {
  const snapshot = runningSnapshot(); const t = target(snapshot.current!.sessionId!);
  snapshot.liveControl = { target: t, label: "Phase 2b", observedAt: new Date().toISOString(), available: true, reason: "Ready", input: { available: true, reason: "Ready", pending: 0 } };
  const server = await serveViewFixture({ port: width === 1200 ? 44320 : 44321, folder: "customer-returns", snapshot });
  const page = await chrome.open(`${server.address}/phase/2b`, { width, height: 1100 });
  try {
    await page.waitFor(`document.querySelector('#live-message')`);
    for (const text of ["  NUL\0exact  ", "  malformed\ud800  ", "x".repeat(4001)]) {
      await page.evaluate(`document.querySelector('#live-message').value=${JSON.stringify(text)};document.querySelector('#live-message').dispatchEvent(new Event('input',{bubbles:true}));`);
      await page.waitFor(`document.querySelector('.composer [role=alert]')`);
      expect(await page.evaluate(`document.querySelector('.composer [role=alert]').textContent`)).toContain(text.length > 4000 ? "exceeds 4,000" : "NUL or malformed Unicode");
      expect(await page.evaluate(`document.querySelector('#live-message').value`)).toBe(text);
      expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send message').disabled`)).toBe(true);
    }
    expect(server.commands).toHaveLength(0); expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
  } finally { await page.close(); await server.close(); }
});
