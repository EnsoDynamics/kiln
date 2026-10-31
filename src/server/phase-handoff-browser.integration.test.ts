import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vitest";
import { needsYouMessageSnapshot, PHASE_DETAIL_LINES } from "../test-support/sample-snapshots.js";
import { serveViewFixture, type ViewFixtureServer } from "../test-support/view-fixture-server.js";
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
  stop.resumeCommand = agent === "Codex" ? "cd '/saved worktree' && codex resume 'saved-thread'" : "cd '/saved worktree' && claude --resume 'saved-session'";
  snapshot.settings.agentId = stop.agentId;
  snapshot.billing = { executionId: "fixture", selectionGeneration: 0, pending: false, canLaunch: true, lastLaunch: { agentId: stop.agentId, route: "subscription", email: "fixture@example.test", observedAt: stop.stoppedAt, approved: true, sources: [], diagnostics: [] } };
  return snapshot;
}

it.each(["Claude Code", "Codex"] as const)("preserves %s drafts, separates payloads, focuses completion choice and retries Verify", async agent => {
  const snapshot = fixture(agent); const stop = snapshot.needsYou!; const target = stop.phaseRecovery!.target;
  let outcome = "already_complete"; let failed = false; let gate: Promise<void> | undefined;
  const port = agent === "Codex" ? 41982 : 41981;
  const options = { port, folder: "customer-returns", snapshot, output: PHASE_DETAIL_LINES, respond: async () => { await gate; return { status: failed ? 503 : 200, body: failed ? { ok: false, reason: "Repository unavailable" } : { ok: true, outcome, target } }; } };
  let server: ViewFixtureServer = await serveViewFixture(options);
  const page = await chrome.open(server.address, { width: 1200, height: 1000 });
  try {
    await words(page, "Reply here and let Kiln finish");
    expect(await page.evaluate("!!(document.querySelector('.return').compareDocumentPosition(document.querySelector('.billing')) & Node.DOCUMENT_POSITION_FOLLOWING)")).toBe(true);
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-desktop.png`, await page.screenshot());
    expect(await page.evaluate("document.querySelector('.message .final').textContent")).toContain("Should I keep <optional> exactly as written?");
    const labels = await page.evaluate<string[]>("[...document.querySelectorAll('main h2, main h3')].map(e => e.textContent)");
    expect(labels.indexOf("Reply here and let Kiln finish")).toBeLessThan(labels.indexOf("Open the conversation in your terminal"));
    expect(labels.indexOf("Open the conversation in your terminal")).toBeLessThan(labels.indexOf("Back from your terminal?"));
    expect(await page.evaluate("[...document.querySelectorAll('button')].some(e => e.textContent.trim() === 'Check again')")).toBe(false);
    const reply = "  Preserve my exact draft.\nDo not send on Verify.  "; await draft(page, reply);
    await page.evaluate("Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedCommand = text; } } })");
    await click(page, "Copy resume command"); expect(server.commands).toHaveLength(0);
    expect(await page.evaluate("window.copiedCommand")).toBe(stop.resumeCommand);
    const output = await page.evaluate<string>("[...document.querySelectorAll('a')].find(e => e.textContent.includes('Full session output')).textContent");
    await click(page, output.trim()); await words(page, "Session output");
    await page.evaluate("history.back()"); await words(page, "Reply here and let Kiln finish");
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    await click(page, `Resume Phase ${stop.phaseId} in Kiln`); await words(page, "already complete");
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/resume ")[1]!)).toEqual({ target });
    expect(await page.evaluate("document.activeElement.textContent")).toContain("already complete");
    await words(page, "Advance without sending reply");
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-choice-desktop.png`, await page.screenshot());
    await click(page, "Back to recovery page"); await words(page, "Your reply has not been sent");
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    const previousTime = await page.evaluate<string>("document.querySelector('.finished [role=status]').textContent");
    failed = true;
    await click(page, `Verify Phase ${stop.phaseId} & advance`); await words(page, "Repository unavailable");
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/check-again ")[1]!)).toEqual({ target, intent: "verify" });
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    expect(await page.evaluate("document.querySelector('.finished [role=status]').textContent")).toBe(previousTime);
    failed = false; outcome = "still_stopped";
    let release!: () => void; gate = new Promise<void>(resolve => { release = resolve; });
    await click(page, `Verify Phase ${stop.phaseId} & advance`); await words(page, "Checking…");
    expect(await page.evaluate("[...document.querySelectorAll('main button')].filter(e => /^(Send reply|Resume Phase|Verify Phase|Checking)/.test(e.textContent.trim())).every(e => e.disabled)")).toBe(true);
    stop.checkedAt = new Date("2026-10-26T20:01:02Z").toISOString();
    stop.checks.push({ name: "Stayed in the workspace", passed: true, facts: ["Prior repair confirmed"] });
    server.send("snapshot", snapshot); release(); gate = undefined;
    await words(page, "still unfinished"); await words(page, `of ${stop.checks.length} requirements passed`);
    expect(await page.evaluate("document.querySelector('.finished [role=status]').textContent")).not.toBe(previousTime);
    expect(await page.evaluate("document.querySelector('.finished [role=status]').textContent")).toContain(await page.evaluate(`new Date(${JSON.stringify(stop.checkedAt)}).toLocaleString()`));
    outcome = "already_complete";
    await click(page, `Send reply & resume Phase ${stop.phaseId}`); await words(page, "already complete");
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/resume ")[1]!)).toEqual({ target, note: reply });
    outcome = "still_stopped";
    await click(page, "Advance without sending reply"); await words(page, "still unfinished");
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/check-again ")[1]!)).toEqual({ target, intent: "advance", withoutSendingReply: true });
    await server.close(); await words(page, "Disconnected");
    expect(await page.evaluate("document.querySelector('textarea') === null")).toBe(true);
    server = await serveViewFixture(options); await words(page, "Reply here and let Kiln finish");
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    // Deferred launch refusal changes the target but never started a new provider turn.
    stop.phaseRecovery!.target = { ...target, stoppedAt: "2026-10-26T21:01:00Z" };
    server.send("snapshot", snapshot); await words(page, "Your reply has not been sent");
    expect(await page.evaluate("document.querySelector('textarea').value")).toBe(reply);
    // A late response for the old target cannot reopen its choice on a new stopped turn.
    outcome = "already_complete";
    gate = new Promise<void>(resolve => { release = resolve; });
    await click(page, `Resume Phase ${stop.phaseId} in Kiln`);
    await page.waitFor("[...document.querySelectorAll('button')].find(e => e.textContent.startsWith('Resume Phase')).disabled");
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
  const port = agent === "Codex" ? 41984 : 41983;
  const server = await serveViewFixture({ port, folder: "customer-returns", snapshot, respond: async () => ({ status: 200, body: { ok: true, outcome: "already_complete", target: stop.phaseRecovery!.target } }) });
  const page = await chrome.open(server.address, { width: 390, height: 844 });
  try {
    await words(page, "Back from your terminal?");
    expect(await page.evaluate("!!(document.querySelector('.return').compareDocumentPosition(document.querySelector('.billing')) & Node.DOCUMENT_POSITION_FOLLOWING)")).toBe(true);
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    const positions = await page.evaluate<number[]>("[...document.querySelector('.peer-choices').children].map(e => e.getBoundingClientRect().top)");
    expect(positions[1]!).toBeGreaterThan(positions[0]!);
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-narrow.png`, await page.screenshot());
    await click(page, `Resume Phase ${stop.phaseId} in Kiln`); await words(page, "already complete");
    expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-choice-narrow.png`, await page.screenshot());
    await click(page, "Back to recovery page");
    stop.resumeOffered = false; delete stop.resumeCommand; delete stop.finalMessage;
    stop.resumeError = "Saved history is unavailable."; stop.lastLines = PHASE_DETAIL_LINES.slice(-3);
    server.send("snapshot", snapshot); await words(page, "Saved history is unavailable."); await words(page, "Start a fresh session in your terminal");
    expect(await page.evaluate("[...document.querySelectorAll('button')].some(e => /resume Phase|Resume Phase/.test(e.textContent))")).toBe(false);
    await words(page, "LAST OUTPUT FROM");
    await words(page, `Verify Phase ${stop.phaseId} & advance`);
    writeFileSync(`/tmp/kiln-handoff-${agent === "Codex" ? "codex" : "claude"}-unavailable-narrow.png`, await page.screenshot());
    expect(page.problems).toEqual([]);
  } finally { await page.close(); await server.close(); }
});

it("reuses the same browser instruction after an accepted response is lost and the token changes", async () => {
  const snapshot = fixture("Claude Code"); snapshot.controlToken = "execution:original-token";
  const requests: { id: string; token: string }[] = []; const effects = new Set<string>();
  const server = await serveViewFixture({ port: 41985, folder: "customer-returns", snapshot, respond: async (_command, _body, headers) => {
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

it("offers a distinct uncertainty acknowledgment and collapsed diagnostics in both recovery layouts", async () => {
  for (const handoff of [true, false]) {
    const snapshot = fixture("Codex"); const stop = snapshot.needsYou!;
    if (!handoff) delete stop.phaseRecovery;
    stop.checks = [{ name: "Stayed in the workspace", passed: false, facts: ["Codex evidence is incomplete: Unknown helper or dynamic call"] }];
    stop.outside = { changes: [], checkouts: [], missingTranscripts: stop.checks[0]!.facts, confirmation: { offered: false, ticked: false }, uncertainty: { offered: true, ticked: false } };
    const server = await serveViewFixture({ port: handoff ? 41983 : 41984, folder: "customer-returns", snapshot });
    const page = await chrome.open(server.address, { width: 390, height: 900 });
    try {
      await words(page, "Accept workspace uncertainty"); await words(page, "Unable to verify");
      expect(await page.evaluate("document.body.innerText.includes('Unknown helper or dynamic call')")).toBe(false);
      await page.evaluate("[...document.querySelectorAll('summary')].find(e => e.textContent.includes('Workspace evidence details')).click()");
      await words(page, "Unknown helper or dynamic call");
      await page.evaluate("document.querySelector('.accept-uncertainty input').click()");
      await page.waitFor("!document.querySelector('.accept-uncertainty input').disabled");
      expect(server.commands).toEqual(["POST /api/workspace-uncertainty"]);
      stop.outside.uncertainty!.ticked = true; server.send("snapshot", snapshot);
      await page.waitFor("document.querySelector('.accept-uncertainty input').checked");
      writeFileSync(`/tmp/kiln-workspace-uncertainty-${handoff ? "handoff" : "recovery"}.png`, await page.screenshot());
      expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  }
});
