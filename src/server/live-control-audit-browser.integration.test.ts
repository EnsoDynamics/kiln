// Whole-PRD test audit: complete visible contracts at the built-browser boundary.
import { afterAll, beforeAll, expect, it } from "vitest";
import { runningSnapshot, pausedSnapshot, needsYouMessageSnapshot, PHASE_DETAIL_LINES } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { ALREADY_PAUSED } from "../live/pause-now.js";

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

const cases = [
  { label: "Phase 2b", key: "2b", kind: "implementation" as const },
  { label: "Delivery audit · Round 3", key: "audit-delivery-3", kind: "delivery_audit" as const },
  { label: "Test audit · Round 2", key: "audit-test-2", kind: "test_audit" as const },
].flatMap(activity => [1200, 390].map(width => ({ ...activity, width })));

it.each(cases)("pins the paused page's header, eyebrow, last command and last message, and its Resume, for $label at $width", async ({ key, kind, width }) => {
  const snapshot = needsYouMessageSnapshot(); const stop = snapshot.needsYou!;
  const audit = kind !== "implementation";
  const round = kind === "delivery_audit" ? 3 : 2;
  // An audit's row carries its title and round apart, as the plan does: "Delivery audit", round 3.
  // Only the held audit is stopped; the fixture's own stopped phase 2b is otherwise unfinished, as it would be.
  if (audit) snapshot.phases = snapshot.phases.map(p => p.id === "2b" ? { ...p, state: "planned" } : p);
  if (audit) snapshot.activities = [...snapshot.phases, { ...snapshot.phases.find(p => p.id === "2b")!, id: key, kind, round, title: kind === "delivery_audit" ? "Delivery audit" : "Test audit", state: "needs_you" }];
  const name = audit ? (kind === "delivery_audit" ? "delivery audit" : "test audit") : "phase 2b";
  const target = { executionId: "execution", activityId: key, activityKey: key, sessionId: stop.sessionId!, providerSessionId: stop.sessionId!, attemptId: "attempt" };
  stop.phaseId = key; stop.agent = "Claude Code"; stop.finalMessage = "The first operation finished. The remaining work is unfinished.";
  stop.phaseRecovery = { target: { executionId: "execution", phaseKey: key, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt, live: target }, completion: "incomplete" };
  snapshot.liveControl = { target, label: audit ? `${capitalized(name)} · Round ${round}` : "Phase 2b", available: false, reason: "Paused.", observedAt: stop.stoppedAt,
    takeover: { target, instructionId: "held", operationId: "hold", requestedAt: stop.stoppedAt, releasedAt: stop.stoppedAt, observedAt: stop.stoppedAt, state: "released", reason: "Paused." },
    pauseNow: { phase: "paused", activityKey: key, label: audit ? `${name} · round ${round}` : name, requestedAt: stop.stoppedAt, releasedAt: stop.stoppedAt, stopped: true, running: [], lastCommand: { tool: "Bash", input: "npm test" }, lastSaid: stop.finalMessage, cancel: { available: false, reason: ALREADY_PAUSED } } };
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  const page = await chrome.open(server.address, { width, height: 1100 });
  try {
    await page.waitFor(`document.querySelector('.paused-card')`);
    const body = await page.evaluate<string>("document.querySelector('main').innerText");
    expect(body).toContain(`Paused in ${name}`);
    expect(await page.evaluate("document.querySelector('.paused-card .eyebrow').textContent")).toBe(audit ? `Paused partway · ${name} · round ${round}` : `Paused partway · phase 2b of ${snapshot.feature.phasesTotal}`);
    expect(await page.evaluate("document.querySelector('.paused-card > p').textContent")).toBe(`Kiln stopped after npm test finished. Nothing is running. Last thing Claude said: “${stop.finalMessage}”`);
    expect(await page.evaluate<string[]>(`Array.from(document.querySelectorAll('.paused-card .columns > section > h3')).map(h=>h.textContent)`)).toEqual(["Let Kiln carry on", "Or take it over yourself"]);
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(`Resume ${name}`)})?.disabled`)).toBe(false);
    expect(await page.evaluate(`Array.from(document.querySelectorAll('a')).find(a=>a.textContent.startsWith('Full session output')).getAttribute('href')`)).toBe(`/customer-returns/phase/${key}`);
    // The paused page shows no checks and never says Needs you (AC-PAUSE-05, PAUSE-004).
    for (const gone of ["Why Kiln stopped", "Check again", "Mark complete", "Needs you", "takeover", "Pause now"]) expect(body).not.toContain(gone);
    expect(server.commands).toEqual([]); expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it.each(cases)("pins output/composer/facts order and both complete pause consequences for $label at $width", async ({ label, key, kind, width }) => {
  const snapshot = runningSnapshot(); const current = snapshot.current!; current.phaseId = key;
  snapshot.activities = [{ ...snapshot.phases.find(p => p.id === "2b")!, id: key, title: label, kind, state: "implementing" }];
  snapshot.liveControl = { target: { executionId: "execution", activityId: key, activityKey: key, sessionId: current.sessionId!, providerSessionId: current.sessionId!, attemptId: "attempt" }, label, observedAt: new Date().toISOString(), available: true, reason: "Ready", input: { available: true, reason: "Ready", pending: 0 } };
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
  const page = await chrome.open(`${server.address}/phase/${key}`, { width, height: 1100 });
  try {
    await page.waitFor(`document.querySelector('#live-message')`);
    const layout = await page.evaluate<{ adjacent: boolean; order: boolean; narrow: boolean }>(`(() => {
      const output=document.querySelector('section.output'), composer=document.querySelector('#live-message').closest('section'), pause=document.querySelector('#pause-h').closest('section'), facts=document.querySelector('.columns-main');
      const before=(a,b)=>!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);
      const choices=Array.from(pause.querySelectorAll('.choices>section'));
      return {adjacent:output.nextElementSibling===composer,order:before(output,composer)&&before(composer,pause)&&before(pause,facts),narrow:innerWidth>680||choices[0].getBoundingClientRect().bottom<=choices[1].getBoundingClientRect().top};
    })()`);
    expect(layout).toEqual({ adjacent: true, order: true, narrow: true });
    const body = await page.evaluate<string>("document.body.innerText");
    expect(body).toContain(label); expect(body).toContain("Claude"); expect(body).toContain(current.sessionId!); expect(body).toContain("Connected to Kiln");
    const choices = await page.evaluate<{ text: string; action: string; visible: boolean }[]>(`Array.from(document.querySelectorAll('.choices>section')).map(s=>({text:s.innerText,action:s.querySelector('button').textContent.trim(),visible:s.getBoundingClientRect().height>0&&getComputedStyle(s).visibility==='visible'}))`);
    expect(choices).toHaveLength(2); expect(choices.every(c => c.visible)).toBe(true);
    const name = kind === "implementation" ? "phase 2b" : label.toLowerCase();
    expect(choices[0]!.text).toContain(`Now\n\nStops after the command it is running, usually within seconds. ${capitalized(name)} stays open.`);
    expect(choices[0]!.text).toContain("Then either press Resume when you’re ready, or take the conversation over in your terminal. The paused page gives you the command.");
    expect(choices[0]!.action).toBe("Pause now");
    expect(choices[1]!.text).toContain(`After ${name}`);
    // The only leaf in this plan, or an audit, is followed by "the next activity" (technical design, "The Pause Now State").
    expect(choices[1]!.text).toContain(`Lets the ${kind === "implementation" ? "phase" : "audit"} finish. Kiln commits, pushes and runs the completion checks, then waits before starting the next activity.`);
    expect(choices[1]!.action).toBe(`Pause after ${name}`);
    expect(choices.map(c => c.text).join(" ")).not.toMatch(/takeover|take over this session/i);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true); expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it.each(["Delivery audit · Round 3", "Test audit · Round 2"])("names the finished %s and next activity after deferred pause without resuming the finished session", async label => {
  const snapshot = pausedSnapshot();
  const key = label.startsWith("Delivery") ? "audit-delivery-3" : "audit-test-2";
  snapshot.activities = [{ ...snapshot.phases[0]!, id: key, kind: label.startsWith("Delivery") ? "delivery_audit" : "test_audit", title: label, state: "done", doneAt: new Date().toISOString() }, { ...snapshot.phases.find(p => p.id === "2b")!, state: "next" }];
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  const page = await chrome.open(server.address, { width: 390 });
  try {
    await page.waitFor(`document.body.innerText.includes('Paused before the next activity.')`);
    expect(await page.evaluate("document.querySelector('.held').innerText")).toContain(`${label.replace("Round", "round")} finished. Paused before the next activity.`);
    expect(await page.evaluate("document.querySelector('.held h2').textContent")).toContain("Next: phase 2b");
    expect(await page.evaluate("document.querySelector('.held button').textContent.trim()")).toBe("Start phase 2b");
    expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Resume'))`)).toBe(false);
    expect(server.commands).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it("sends the Note for Claude with Resume only when the box has text (AC-PAUSE-06, PAUSE-007)", async () => {
  const { pausedHoldSnapshot } = await import("../test-support/sample-snapshots.js");
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot: pausedHoldSnapshot(), respond: async command => command.startsWith("POST /api/resume") ? { status: 202, body: { ok: true, outcome: "resume_requested" } } : null });
  const page = await chrome.open(server.address, { width: 1200, height: 1100 });
  try {
    const resume = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Resume phase 2b')`;
    await page.waitFor(`${resume} && !${resume}.disabled`);
    await page.evaluate(`${resume}.click()`);
    await page.waitFor(`document.body.innerText.includes('Resume requested')`);
    await page.evaluate(`(() => { const box = document.querySelector('#paused-note'); box.value = 'Use the new receipt template.'; box.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await page.evaluate(`${resume}.click()`);
    const until = Date.now() + 5000; while (server.commands.filter(c => c.startsWith("POST /api/resume")).length < 2 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
    const bodies = server.commands.filter(c => c.startsWith("POST /api/resume")).map(c => JSON.parse(c.slice(c.indexOf("{"))) as { note?: string });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.note).toBeUndefined();
    expect(bodies[1]!.note).toBe("Use the new receipt template.");
  } finally { await page.close(); await server.close(); }
});
