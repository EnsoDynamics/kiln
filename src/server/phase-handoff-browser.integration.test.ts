import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { needsYouMessageSnapshot, PHASE_DETAIL_LINES } from "../test-support/sample-snapshots.js";
import { serveViewFixture, type ViewFixtureServer } from "../test-support/view-fixture-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
const click = (page: BrowserPage, label: string) => page.evaluate(`[...document.querySelectorAll('button,a')].find(e => e.textContent.trim() === ${JSON.stringify(label)}).click()`);
const words = (page: BrowserPage, text: string) => page.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`);
const draft = (page: BrowserPage, text: string) => page.evaluate(`(() => { const input = document.querySelector('textarea'); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
function fixture(agent: "Claude Code" | "Codex") {
  const snapshot = needsYouMessageSnapshot();
  const stop = snapshot.needsYou!;
  stop.agent = agent; stop.agentId = agent === "Codex" ? "codex" : "claude_code";
  stop.phaseRecovery = { target: { executionId: "execution", phaseKey: stop.phaseId, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt }, completion: "incomplete", attemptStartedAt: "2026-10-17T14:58:00Z" };
  stop.freshSessionCommand = `cd '/saved worktree' && ${agent === "Codex" ? "codex" : "claude"}`;
  stop.finalMessage = "Should I keep <optional> exactly as written?\n\nNo changes yet.";
  stop.resumePrompt = "Retired saved-conversation recovery instructions.";
  stop.resumeCommand = agent === "Codex" ? "cd '/saved worktree' && codex resume 'saved-thread'" : "cd '/saved worktree' && claude --resume 'saved-session'";
  snapshot.settings.agentId = stop.agentId;
  snapshot.billing = { executionId: "fixture", selectionGeneration: 0, pending: false, canLaunch: true, lastLaunch: { agentId: stop.agentId, route: "subscription", email: "fixture@example.test", observedAt: stop.stoppedAt, approved: true, sources: [], diagnostics: [] } };
  return snapshot;
}

it.each(["Claude Code", "Codex"] as const)("preserves %s drafts, separates payloads, focuses completion choice and retries Verify", async agent => {
  const snapshot = fixture(agent); const stop = snapshot.needsYou!; const target = stop.phaseRecovery!.target;
  let outcome = "already_complete"; let failed = false; let gate: Promise<void> | undefined;
  const options = { port: 0, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES, respond: async () => { await gate; return { status: failed ? 503 : 200, body: failed ? { ok: false, reason: "Repository unavailable" } : { ok: true, outcome, target } }; } };
  let server: ViewFixtureServer = await serveViewFixture(options);
  const page = await chrome.open(server.address, { width: 1200, height: 1000 });
  try {
    await words(page, "Reply here and let Kiln finish");
    expect(await page.evaluate("!!(document.querySelector('.return').compareDocumentPosition(document.querySelector('.billing')) & Node.DOCUMENT_POSITION_FOLLOWING)")).toBe(true);
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-desktop.png`, await page.screenshot());
    expect(await page.evaluate("document.querySelector('.message .final').textContent")).toContain("Should I keep <optional> exactly as written?");
    const labels = await page.evaluate<string[]>("[...document.querySelectorAll('main h2, main h3')].map(e => e.textContent)");
    expect(labels.indexOf("Reply here and let Kiln finish")).toBeLessThan(labels.indexOf("Talk it through in your terminal"));
    expect(labels.indexOf("Talk it through in your terminal")).toBeLessThan(labels.indexOf(`Is Phase ${stop.phaseId} already done?`));
    expect(await page.evaluate("[...document.querySelectorAll('button')].some(e => e.textContent.trim() === 'Check again')")).toBe(false);
    const reply = "  Preserve my exact draft.\nDo not send on Verify.  "; await draft(page, reply);
    await page.evaluate("Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedCommand = text; } } })");
    await click(page, "Copy resume command"); expect(server.commands).toHaveLength(0);
    expect(await page.evaluate("window.copiedCommand")).toBe(stop.resumeCommand);
    const terminal = await page.evaluate<string>("document.querySelector('.handoff details').parentElement.textContent");
    expect(terminal).not.toContain(stop.resumePrompt);
    expect(terminal).not.toMatch(/Send this recovery prompt|Copy recovery prompt/);
    await page.evaluate("document.querySelector('.handoff details').open = true");
    await click(page, "Copy fresh-session prompt");
    expect(await page.evaluate("window.copiedCommand")).toBe(stop.freshSessionPrompt);
    expect(server.commands).toHaveLength(0);
    await page.evaluate("document.querySelector('.handoff details').open = false");
    const output = await page.evaluate<string>("[...document.querySelectorAll('a')].find(e => e.textContent.includes('Full session output')).textContent");
    await click(page, output.trim()); await words(page, "Session output");
    await page.evaluate("history.back()"); await words(page, "Reply here and let Kiln finish");
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    await click(page, `Have Kiln resume Phase ${stop.phaseId}`); await words(page, "already complete");
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/resume ")[1]!)).toEqual({ target, bringUpToDate: false });
    expect(await page.evaluate("document.activeElement.textContent")).toContain("already complete");
    await words(page, "Advance without sending reply");
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-choice-desktop.png`, await page.screenshot());
    await click(page, "Back to recovery page"); await words(page, "Your reply has not been sent");
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    const previousTime = await page.evaluate<string>("document.querySelector('.return .between [role=status]').textContent");
    failed = true;
    await click(page, `Check Phase ${stop.phaseId} again`); await words(page, "Repository unavailable");
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/check-again ")[1]!)).toEqual({ target, intent: "verify" });
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    expect(await page.evaluate("document.querySelector('.return .between [role=status]').textContent")).toBe(previousTime);
    failed = false; outcome = "still_stopped";
    let release!: () => void; gate = new Promise<void>(resolve => { release = resolve; });
    await click(page, `Check Phase ${stop.phaseId} again`); await words(page, "Checking…");
    expect(await page.evaluate("[...document.querySelectorAll('main button')].filter(e => /^(Send reply|Have Kiln resume Phase|Check Phase|Checking)/.test(e.textContent.trim())).every(e => e.disabled)")).toBe(true);
    stop.checkedAt = new Date("2026-10-26T20:01:02Z").toISOString();
    stop.checks.push({ name: "Required delivery", passed: true, facts: ["Delivery receipt confirmed"] });
    // The recheck ran the completion checks, so its rows read as them, with the passed count (checks at a stop AC-STOPCHECK-03).
    stop.rowsAreCompletionChecks = true;
    server.send("snapshot", snapshot); release(); gate = undefined;
    await words(page, "failing check"); await words(page, `of ${stop.checks.length} passed`);
    expect(await page.evaluate("document.querySelector('.return .between [role=status]').textContent")).not.toBe(previousTime);
    expect(await page.evaluate("document.querySelector('.return .between [role=status]').textContent")).toContain(await page.evaluate(`new Date(${JSON.stringify(stop.checkedAt)}).toLocaleTimeString()`));
    outcome = "already_complete";
    await click(page, `Send reply & resume Phase ${stop.phaseId}`); await words(page, "already complete");
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/resume ")[1]!)).toEqual({ target, note: reply, bringUpToDate: false });
    outcome = "still_stopped";
    await click(page, "Advance without sending reply"); await words(page, "failing check");
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/check-again ")[1]!)).toEqual({ target, intent: "advance", withoutSendingReply: true });
    await server.close(); await words(page, "Disconnected");
    expect(await page.evaluate("document.querySelector('textarea') === null")).toBe(true);
    server = await serveViewFixture({ ...options, port: boundPort(server.address) }); await words(page, "Reply here and let Kiln finish");
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    // Deferred launch refusal changes the target but never started a new provider turn.
    stop.phaseRecovery!.target = { ...target, stoppedAt: "2026-10-26T21:01:00Z" };
    server.send("snapshot", snapshot); await words(page, "Your reply has not been sent");
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    // A late response for the old target cannot reopen its choice on a new stopped turn.
    outcome = "already_complete";
    gate = new Promise<void>(resolve => { release = resolve; });
    await click(page, `Have Kiln resume Phase ${stop.phaseId}`);
    await page.waitFor("[...document.querySelectorAll('button')].find(e => e.textContent.startsWith('Have Kiln resume Phase')).disabled");
    // A new actual turn in the same conversation must not inherit an old reply.
    stop.phaseRecovery!.target = { ...target, stoppedAt: "2026-10-26T21:02:00Z" };
    stop.phaseRecovery!.attemptStartedAt = "2026-10-26T21:01:30Z";
    server.send("snapshot", snapshot); await page.waitFor("document.querySelector('textarea').value === ''");
    release(); gate = undefined;
    await page.evaluate("new Promise(resolve => setTimeout(resolve, 200))");
    expect(await page.evaluate("document.querySelector('.choice') === null")).toBe(true);
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe("");
    stop.resumeOffered = false; delete stop.resumeCommand; delete stop.finalMessage;
    stop.resumeError = "Saved history is unavailable."; stop.lastLines = PHASE_DETAIL_LINES.slice(-3);
    server.send("snapshot", snapshot); await words(page, "Saved history is unavailable.");
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-unavailable-desktop.png`, await page.screenshot());
    expect(page.problems.filter(problem => !problem.includes('status of 503 (Service Unavailable)') && !problem.includes('net::ERR_INCOMPLETE_CHUNKED_ENCODING') && !problem.includes('net::ERR_CONNECTION_REFUSED'))).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it.each(["Claude Code", "Codex"] as const)("stacks %s choices on narrow screens and retains fresh-session recovery with no history", async agent => {
  const snapshot = fixture(agent); const stop = snapshot.needsYou!;
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot, respond: async () => ({ status: 200, body: { ok: true, outcome: "already_complete", target: stop.phaseRecovery!.target } }) });
  const page = await chrome.open(server.address, { width: 390, height: 844 });
  try {
    await words(page, `Is Phase ${stop.phaseId} already done?`);
    expect(await page.evaluate("!!(document.querySelector('.return').compareDocumentPosition(document.querySelector('.billing')) & Node.DOCUMENT_POSITION_FOLLOWING)")).toBe(true);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    const positions = await page.evaluate<number[]>("[...document.querySelector('.peer-choices').children].map(e => e.getBoundingClientRect().top)");
    expect(positions[1]!).toBeGreaterThan(positions[0]!);
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-narrow.png`, await page.screenshot());
    await click(page, `Have Kiln resume Phase ${stop.phaseId}`); await words(page, "already complete");
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-choice-narrow.png`, await page.screenshot());
    await click(page, "Back to recovery page");
    stop.resumeOffered = false; delete stop.resumeCommand; delete stop.finalMessage;
    stop.resumeError = "Saved history is unavailable."; stop.lastLines = PHASE_DETAIL_LINES.slice(-3);
    server.send("snapshot", snapshot); await words(page, "Saved history is unavailable."); await words(page, "Start a fresh session in your terminal");
    expect(await page.evaluate("[...document.querySelectorAll('button')].some(e => /resume Phase|Resume Phase/.test(e.textContent))")).toBe(false);
    await words(page, "LAST OUTPUT FROM");
    await words(page, `Check Phase ${stop.phaseId} again`);
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-unavailable-narrow.png`, await page.screenshot());
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it("reuses the same browser instruction after an accepted response is lost and the token changes", async () => {
  const snapshot = fixture("Claude Code"); snapshot.controlToken = "execution:original-token";
  const requests: { id: string; token: string }[] = []; const effects = new Set<string>();
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot, respond: async (_command, _body, headers) => {
    const request = { id: String(headers["x-kiln-command-id"]), token: String(headers["x-kiln-status"]) }; requests.push(request); effects.add(request.id);
    return { status: 200, body: { ok: true, outcome: "already_complete", target: snapshot.needsYou!.phaseRecovery!.target } };
  } });
  const page = await chrome.open(server.address);
  try {
    await words(page, "Reply here and let Kiln finish"); await draft(page, "One literal reply");
    await page.evaluate(`(() => { const original = window.fetch; let dropped = false; window.fetch = async (...args) => { const response = await original(...args); if (args[0] === '/api/resume' && !dropped) { dropped = true; throw new Error('Simulated lost response after acceptance'); } return response; }; })()`);
    await click(page, `Send reply & resume Phase ${snapshot.needsYou!.phaseId}`); await words(page, "may have been accepted");
    snapshot.controlToken = "execution:new-token"; snapshot.needsYou!.finalMessage = "Refreshed observation"; server.send("snapshot", snapshot); await words(page, "Refreshed observation");
    await click(page, `Send reply & resume Phase ${snapshot.needsYou!.phaseId}`); await words(page, "already complete");
    expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]); expect(requests[0]!.token).toBe("execution:original-token"); expect(requests[0]!.id).toMatch(/^[a-f0-9-]{36}$/); expect(effects.size).toBe(1);
  } finally { await server.close(); }
});

it("shows no workspace controls in either recovery layout", async () => {
  for (const handoff of [true, false]) {
    const snapshot = fixture("Codex"); const stop = snapshot.needsYou!;
    if (!handoff) delete stop.phaseRecovery;
    const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
    const page = await chrome.open(server.address, { width: 390, height: 900 });
    try {
      await words(page, "Everything committed");
      expect(await page.evaluate("document.body.innerText")).not.toMatch(/Stayed in the workspace|Accept workspace uncertainty|Workspace evidence details|changes outside the workspace/);
      expect(await page.evaluate("document.querySelectorAll('.accept-uncertainty, .confirmation, #outside-dealt-with').length")).toBe(0);
      expect(server.commands).toEqual([]);
      writeFileSync(`/tmp/kiln-completion-checks-${handoff ? "handoff" : "recovery"}.png`, await page.screenshot());
      expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  }
});

it("advances without creating a persistent verification success notice", async () => {
  const snapshot = fixture("Claude Code");
  const target = snapshot.needsYou!.phaseRecovery!.target;
  snapshot.billing!.executionId = target.executionId;
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot, respond: async () => ({ status: 200, body: { ok: true, outcome: "advanced", target } }) });
  const page = await chrome.open(server.address, { width: 1200, height: 900 });
  try {
    await words(page, "Check Phase 2b again");
    await click(page, "Check Phase 2b again");
    await page.waitFor("!document.querySelector('.return .actions button').disabled");
    expect(server.commands).toHaveLength(1);
    expect(await page.evaluate("document.body.innerText")).not.toContain("verified and accepted");
    expect(await page.evaluate("document.querySelector('.command-notice')?.textContent ?? ''")).not.toContain("Dismiss");
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});


it.each(["Claude Code", "Codex"] as const)("opens legacy %s terminal recovery without a second prompt and preserves fresh-session setup", async agent => {
  const snapshot = fixture(agent); const stop = snapshot.needsYou!;
  delete stop.phaseRecovery;
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
  const page = await chrome.open(server.address);
  try {
    await words(page, `Open the same ${agent} session in a terminal`);
    const terminal = await page.evaluate<string>("document.querySelector('.pick').textContent");
    expect(terminal).not.toContain(stop.resumePrompt);
    expect(terminal).not.toMatch(/Send this recovery prompt|Copy recovery prompt/);
    await page.evaluate("Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedCommand = text; } } })");
    await page.evaluate("document.querySelector('.pick .block button').click()");
    expect(await page.evaluate("window.copiedCommand")).toBe(stop.resumeCommand);
    await page.evaluate("document.querySelector('.fresh-link').click()");
    expect(await page.evaluate("window.copiedCommand")).toBe(stop.freshSessionPrompt);
    expect(server.commands).toHaveLength(0);
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});
