// Whole-PRD test audit: complete visible contracts at the built-browser boundary.
import { afterAll, beforeAll, expect, it } from "vitest";
import { runningSnapshot, pausedSnapshot, needsYouMessageSnapshot, PHASE_DETAIL_LINES } from "../test-support/sample-snapshots.js";
import { serveViewFixture } from "../test-support/view-fixture-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

const cases = [
  { label: "Phase 2b", key: "2b", kind: "implementation" as const },
  { label: "Delivery audit · Round 3", key: "audit-delivery-3", kind: "delivery_audit" as const },
  { label: "Test audit · Round 2", key: "audit-test-2", kind: "test_audit" as const },
].flatMap(activity => [1200, 390].map(width => ({ ...activity, width })));

it.each(cases)("pins the released takeover headline, exact last message and ending facts for $label at $width", async ({ label, key, width }) => {
  const snapshot = needsYouMessageSnapshot(); const stop = snapshot.needsYou!;
  const target = { executionId: "execution", activityId: key, activityKey: key, sessionId: stop.sessionId!, providerSessionId: stop.sessionId!, attemptId: "attempt" };
  stop.phaseId = key; stop.agent = "Claude Code"; stop.finalMessage = "The first operation finished. The remaining work is unfinished.";
  stop.phaseRecovery = { target: { executionId: "execution", phaseKey: key, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt, live: target }, completion: "incomplete" };
  snapshot.liveControl = { target, label, available: false, reason: "Released", observedAt: stop.stoppedAt, takeover: { target, instructionId: "held", operationId: "hold", requestedAt: stop.stoppedAt, observedAt: stop.stoppedAt, state: "released", reason: "Paused for terminal takeover." } };
  const server = await serveViewFixture({ port: 44952, folder: "customer-returns", snapshot });
  const page = await chrome.open(server.address, { width, height: 1100 });
  try {
    await page.waitFor(`document.querySelector('.handoff > h1')`);
    expect(await page.evaluate("document.querySelector('.handoff > h1').textContent")).toBe("Paused for terminal takeover.");
    expect(await page.evaluate(`document.querySelector('section[aria-label="Stopped session"] .final').textContent.trim()`)).toBe(stop.finalMessage);
    expect(await page.evaluate(`document.querySelector('section[aria-label="Stopped session"] .facts').textContent`)).toContain("Claude Code · exit 0");
    expect(await page.evaluate(`document.querySelector('section[aria-label="Stopped session"] a').getAttribute('href')`)).toBe(`/customer-returns/phase/${key}`);
    expect(await page.evaluate("document.body.innerText")).toContain(`Is ${label} already done?`);
    expect(server.commands).toEqual([]); expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it.each(cases)("pins output/composer/facts order and both complete pause consequences for $label at $width", async ({ label, key, kind, width }) => {
  const snapshot = runningSnapshot(); const current = snapshot.current!; current.phaseId = key;
  snapshot.activities = [{ ...snapshot.phases.find(p => p.id === "2b")!, id: key, title: label, kind, state: "implementing" }];
  snapshot.liveControl = { target: { executionId: "execution", activityId: key, activityKey: key, sessionId: current.sessionId!, providerSessionId: current.sessionId!, attemptId: "attempt" }, label, observedAt: new Date().toISOString(), available: true, reason: "Ready", input: { available: true, reason: "Ready", pending: 0 } };
  const server = await serveViewFixture({ port: 44950, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES });
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
    expect(choices[0]!.text).toContain("At the next safe stopping point. Finish the current operation, then stop before starting more work. Open the same conversation in your terminal; the phase/audit can remain unfinished.");
    expect(choices[0]!.action).toBe("Pause & take over");
    expect(choices[1]!.text).toContain(`Let ${label} finish first`);
    expect(choices[1]!.text).toContain(`After the whole ${kind === "implementation" ? "phase" : "audit"}. Kiln finishes its work, commits, pushes and required completion checks, then waits before starting the next activity. No terminal takeover is needed.`);
    expect(choices[1]!.action).toBe(kind === "implementation" ? "Pause after this phase" : "Pause after this audit");
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true); expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it.each(["Delivery audit · Round 3", "Test audit · Round 2"])("names the finished %s and next activity after deferred pause without resuming the finished session", async label => {
  const snapshot = pausedSnapshot();
  const key = label.startsWith("Delivery") ? "audit-delivery-3" : "audit-test-2";
  snapshot.activities = [{ ...snapshot.phases[0]!, id: key, kind: label.startsWith("Delivery") ? "delivery_audit" : "test_audit", title: label, state: "done", doneAt: new Date().toISOString() }, { ...snapshot.phases.find(p => p.id === "2b")!, state: "next" }];
  const server = await serveViewFixture({ port: 44951, folder: "customer-returns", snapshot });
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
