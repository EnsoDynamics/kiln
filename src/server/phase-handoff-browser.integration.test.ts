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
    expect(JSON.parse(server.commands.at(-1)!.split(" /api/check-again ")[1]!)).toEqual({ target, intent: "advance" });
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
