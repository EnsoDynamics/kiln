// The stopped-phase pages Kiln Run Restart draws (AC-LOOK-01 for Phase 1, with AC-CASE-01 to 04,
// AC-CARRY-01, 02, 05, 06): each is today's screen with the drawn change, in the built view
// against a fixture server, at desktop and phone widths.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Snapshot } from "../engine/snapshot.js";
import { needsYouMessageSnapshot } from "../test-support/sample-snapshots.js";
import { serveViewFixture, type ViewFixtureServer } from "../test-support/view-fixture-server.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { waitFor } from "../test-support/engine-harness.js";

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

const words = (page: BrowserPage, text: string) => page.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`);
/** Clicks the button once it is enabled: a button pressed while an earlier request is still settling does nothing. */
const click = async (page: BrowserPage, label: string) => {
  const button = `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(label)})`;
  await page.waitFor(`${button} && !${button}.disabled`);
  await page.evaluate(`${button}.click()`);
};
const text = (page: BrowserPage) => page.evaluate<string>("document.querySelector('main').innerText");
/** The page's headings and card labels, in the order they read. */
const order = (page: BrowserPage) => page.evaluate<string[]>("[...document.querySelectorAll('main h1, main h2, main section[aria-label], main .eyebrow')].map(e => e.getAttribute('aria-label') ?? e.textContent.trim())");
const WORK = { repositories: [{ name: "acme-shop", commits: [], uncommittedFiles: 0 }], builtNothing: true };
const PATH = "/home/dev/.claude/projects/-home-dev-work--worktrees-customer-returns-acme-shop";

/** Phase 2b stopped, as Kiln's stopped-phase snapshot would show it, with a recovery target unless `noTarget`. */
function stopped(change: Partial<NonNullable<Snapshot["needsYou"]>>, noTarget = false, without: ("finalMessage" | "resumeCommand")[] = []): Snapshot {
  const snapshot = needsYouMessageSnapshot();
  const stop = snapshot.needsYou!;
  for (const field of without) delete stop[field];
  Object.assign(stop, { agent: "Claude Code", agentId: "claude_code", work: WORK, checks: [{ name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-2b-store-credit.md"] }], checkRun: { id: "run-1", at: stop.stoppedAt, origin: "stop", finished: true }, markComplete: { offered: false, reason: "No check has run since Phase 2b stopped." } }, change);
  if (!noTarget) stop.phaseRecovery = { target: { executionId: "execution", phaseKey: stop.phaseId, sessionId: stop.sessionId!, stoppedAt: stop.stoppedAt }, completion: "incomplete" };
  snapshot.billing = { executionId: "fixture", selectionGeneration: 0, pending: false, canLaunch: true, lastLaunch: { agentId: "claude_code", route: "subscription", email: "fixture@example.test", observedAt: stop.stoppedAt, approved: true, sources: [], diagnostics: [] } };
  return snapshot;
}
const launchFailure = { ran: "claude" as const, folder: "/w", sentence: "Kiln ran `claude` in the worktree, and the computer couldn't start it.", error: "Couldn't start claude in ~/work/.worktrees/customer-returns/acme-shop: spawn claude EAGAIN", at: "2026-10-17T15:52:00Z" };

async function open(snapshot: Snapshot, width = 1200, carryOutcome = "session_started"): Promise<{ server: ViewFixtureServer; page: BrowserPage }> {
  const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot, respond: async command => ({ status: 200, body: command.includes("carry-on") ? { ok: true, outcome: carryOutcome } : command.includes("start-again") ? { ok: true, outcome: "session_started" } : { ok: true } }) });
  return { server, page: await chrome.open(server.address, { width, height: 1100 }) };
}

describe.each([1200, 390])("at %ipx wide", width => {
  it("draws Kiln couldn't start Phase N with What Kiln found, Start Phase N again and Nothing to check yet, on either page", async () => {
    for (const noTarget of [false, true]) {
      const { server, page } = await open(stopped({ case: "could_not_start", launchFailure, startAgain: { available: true }, nothingToCheck: true, resumeOffered: false, checks: [{ name: "Phase doc closed", passed: false, facts: ["No Closed line in phase-2b-store-credit.md"] }, { name: "Claude recovery", passed: false, facts: ["The saved conversation has no usable history."], reason: true }] }, noTarget, ["finalMessage", "resumeCommand"]), width);
      try {
        await words(page, "Kiln couldn't start Phase 2b.");
        const body = await text(page);
        expect(body).toContain("Claude Code never began a conversation, so there is nothing to reply to.");
        expect(body).toContain("Kiln ran claude in the worktree, and the computer couldn't start it.");
        expect(body).toContain("spawn claude EAGAIN");
        expect(body).toMatch(/Kiln · launch failed · .+ · no conversation/);
        expect(body).toContain("Fix that, then have Kiln try again");
        expect(body).toContain("Phase 2b's work so far");
        expect(body).toContain("No commits · no uncommitted changes");
        expect(body).toContain("There is no reply box here: there is no conversation to reply to.");
        expect(body).toContain("Nothing to check yet.");
        expect(body).toContain("Kiln checks only this worktree, so bring the work here first.");
        // A row giving the stop's own reason still shows; the completion checks don't (AC-CASE-03).
        expect(body).toContain("The saved conversation has no usable history.");
        expect(body).not.toContain("No Closed line in phase-2b-store-credit.md");
        // One way to start the phase: no reply box, no terminal instructions, no completion checks.
        expect(await page.evaluate("document.querySelectorAll('main textarea').length")).toBe(0);
        expect(body).not.toContain("Talk it through in your terminal");
        expect(body).not.toContain("Start a fresh session in your terminal");
        expect(body).not.toContain("already done?");
        const labels = await order(page);
        expect(labels.indexOf("What Kiln found")).toBeLessThan(labels.indexOf("Start Phase 2b again"));
        expect(labels.indexOf("Start Phase 2b again")).toBeLessThan(labels.indexOf("Nothing to check yet"));
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        await click(page, "Start Phase 2b again");
        // No catch-up offer on the page, so the branch is left as it is (AC-CURRENT-01).
        await waitFor(() => server.commands.includes('POST /api/start-again {"bringUpToDate":false}'));
        await click(page, "Check Phase 2b anyway");
        await waitFor(() => server.commands.some(command => command.startsWith("POST /api/check-again")));
        expect(page.problems).toEqual([]);
      } finally { await page.close(); await server.close(); }
    }
  });

  it("draws Phase N stopped before building anything with today's reply and terminal cards, and Nothing to check yet", async () => {
    const { server, page } = await open(stopped({ case: "built_nothing", conversationRanMs: 120_000, nothingToCheck: true, reopen: { state: "available" }, finalMessage: "Blocked before any code. Merge the import work, then have me continue." }), width);
    try {
      await words(page, "Phase 2b stopped before building anything.");
      const body = await text(page);
      expect(body).toContain("Claude Code's latest conversation ran for 2 minutes. No commits, no uncommitted changes.");
      expect(body).toMatch(/last message from claude code/i);
      expect(body).toContain("Reply here and let Kiln finish");
      expect(body).toContain("Talk it through in your terminal");
      expect(body).toContain("Nothing to check yet.");
      expect(body).not.toContain("already done?");
      expect(body).not.toContain("Reply here and let Kiln carry on");
      expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  });

  it("draws the carry-on card, its reason with the command that clears it, and the fresh terminal card, and sends the reply", async () => {
    const { server, page } = await open(stopped({ case: "built_nothing", conversationRanMs: 120_000, nothingToCheck: true, resumeOffered: false, reopen: { state: "unavailable", reason: "unsafe", path: PATH, defects: ["writable_by_others"], fixCommand: `chmod o-w ${PATH}` }, carryOn: { available: true } }, false, ["resumeCommand"]), width);
    try {
      await words(page, "Reply here and let Kiln carry on");
      const body = await text(page);
      expect(body).toContain("Kiln can't reopen the earlier conversation, so it starts a new Claude Code session for Phase 2b. The new session gets your reply, Claude Code's last message and Phase 2b's work so far, and picks up from there.");
      expect(body).toContain("Your reply to Claude Code Optional");
      expect(body).toContain("Why the earlier conversation can't be reopened");
      expect(body).toContain(`Kiln won't hand the saved conversation back to an agent to act on unattended, because ${PATH} can be changed by other accounts on this computer. To remove their access, run this, then check again:`);
      expect(body).toContain(`chmod o-w ${PATH}`);
      expect(body).toContain("Start a fresh session in your terminal");
      expect(body).toContain("Copy terminal command"); expect(body).toContain("Copy recovery prompt");
      expect(body).not.toContain("Reply here and let Kiln finish");
      expect(body).not.toContain("Copy resume command");
      const labels = await order(page);
      expect(labels.indexOf("Reply here and let Kiln carry on")).toBeLessThan(labels.indexOf("Start a fresh session in your terminal"));
      expect(labels.indexOf("Start a fresh session in your terminal")).toBeLessThan(labels.indexOf("Nothing to check yet"));
      expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
      await page.evaluate(`(() => { const input = document.querySelector('#carry-reply'); input.value = 'The import work is merged now.'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await click(page, "Send reply & continue Phase 2b");
      await waitFor(() => server.commands.some(command => command.startsWith("POST /api/carry-on ")));
      const sent = server.commands.find(command => command.startsWith("POST /api/carry-on "));
      expect(JSON.parse(sent!.slice("POST /api/carry-on ".length))).toMatchObject({ note: "The import work is merged now.", target: { phaseKey: "2b" } });
      await click(page, "Check again");
      await waitFor(() => server.commands.includes("POST /api/reopen-check"));
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  });

  it("draws a held page whose conversation can't be reopened: today's headline and pause panel, the carry-on card that ends the pause, and no wait text", async () => {
    const snapshot = stopped({ resumeOffered: false, reopen: { state: "unavailable", reason: "missing" }, carryOn: { available: true, endsHold: "takeover" }, work: { repositories: [{ name: "acme-shop", commits: [{ sha: "a1b2c3d", subject: "x" }, { sha: "d4e5f6a", subject: "y" }], uncommittedFiles: 3 }], builtNothing: false } }, false, ["resumeCommand"]);
    const target = { executionId: "execution", activityId: "act", activityKey: "2b", sessionId: snapshot.needsYou!.sessionId!, providerSessionId: snapshot.needsYou!.sessionId!, attemptId: "attempt" };
    snapshot.needsYou!.phaseRecovery!.target.live = target;
    snapshot.liveControl = { target, label: "Phase 2b", observedAt: "2026-10-17T15:52:00Z", available: false, reason: "Kiln can't reopen the saved conversation history.", messages: [], reviewRequired: [], takeover: { target, operationId: "op", instructionId: "take", requestedAt: "2026-10-17T15:50:00Z", state: "pending", observedAt: "2026-10-17T15:52:00Z", reason: "Kiln can't reopen the saved conversation history.", history: { state: "unavailable", reason: "missing" } } };
    const { server, page } = await open(snapshot, width);
    try {
      await words(page, "Reply here and let Kiln carry on");
      const body = await text(page);
      expect(body).toContain("Pausing for takeover — finishing the current operation.");
      expect(body).toMatch(/when should kiln pause\?/i);
      expect(body).toContain("Exit Claude Code first if it is open on this conversation.");
      expect(body).toContain("picks up from there. Starting it ends the takeover pause.");
      expect(body).toContain("2 commits · 3 uncommitted files");
      expect(body).toContain("Claude Code has no saved conversation for this session.");
      expect(body).toContain("Start a fresh session in your terminal");
      expect(body).not.toContain("Wait before opening Claude");
      expect(body).not.toContain("Finished Phase 2b there?");
      expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  });

  it("advances from the carry-on's already-complete choice on a held page whose conversation can't be reopened (AC-CARRY-06)", async () => {
    const snapshot = stopped({ resumeOffered: false, reopen: { state: "unavailable", reason: "missing" }, carryOn: { available: true, endsHold: "takeover" } }, false, ["resumeCommand"]);
    const target = { executionId: "execution", activityId: "act", activityKey: "2b", sessionId: snapshot.needsYou!.sessionId!, providerSessionId: snapshot.needsYou!.sessionId!, attemptId: "attempt" };
    snapshot.needsYou!.phaseRecovery!.target.live = target;
    snapshot.liveControl = { target, label: "Phase 2b", observedAt: "2026-10-17T15:52:00Z", available: false, reason: "Kiln can't reopen the saved conversation history.", messages: [], reviewRequired: [], takeover: { target, operationId: "op", instructionId: "take", requestedAt: "2026-10-17T15:50:00Z", state: "pending", observedAt: "2026-10-17T15:52:00Z", reason: "Kiln can't reopen the saved conversation history.", history: { state: "unavailable", reason: "missing" } } };
    const { server, page } = await open(snapshot, width, "already_complete");
    try {
      await words(page, "Reply here and let Kiln carry on");
      await page.evaluate(`(() => { const input = document.querySelector('#carry-reply'); input.value = 'Carry on.'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await click(page, "Send reply & continue Phase 2b");
      // The hold stays pending with its history, yet the choice shows in place of the wait text, and its advance is sent.
      await words(page, "Phase 2b is already complete.");
      const body = await text(page);
      expect(body).toContain("Your reply has not been sent.");
      expect(body).not.toContain("Wait before opening Claude");
      await click(page, "Advance without sending reply");
      await waitFor(() => server.commands.some(command => command.startsWith("POST /api/check-again ")));
      const sent = server.commands.find(command => command.startsWith("POST /api/check-again "));
      expect(JSON.parse(sent!.slice("POST /api/check-again ".length))).toMatchObject({ intent: "advance", withoutSendingReply: true, target: { activityKey: "2b" } });
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  });

  it("names a failed work read on today's reply and resume page (AC-CASE-01)", async () => {
    const { server, page } = await open(stopped({ case: "needs_input", reopen: { state: "available" }, work: { unknown: "Kiln couldn't read the phase's work: fatal: bad object 0000000" } }), width);
    try {
      await words(page, "Reply here and let Kiln finish");
      const body = await text(page);
      expect(body).toContain("Phase 2b needs your input.");
      expect(body).toContain("Kiln couldn't read the phase's work: fatal: bad object 0000000");
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  });

  it("draws What Kiln found before the earlier conversation's last message after a carry-on that never began (AC-CASE-04)", async () => {
    const { server, page } = await open(stopped({ case: "built_nothing", conversationRanMs: 60_000, nothingToCheck: true, resumeOffered: false, launchFailure: { ...launchFailure, sentence: "Kiln ran `claude` in the worktree, and it exited with code 1 before beginning a conversation." }, conversationMessage: { finalMessage: "Earlier: blocked before any code.", endedAt: "2026-10-17T15:40:00Z" }, reopen: { state: "unavailable", reason: "missing" }, carryOn: { available: true } }, false, ["finalMessage", "resumeCommand"]), width);
    try {
      await words(page, "Earlier: blocked before any code.");
      const body = await text(page);
      expect(body.indexOf("exited with code 1 before beginning a conversation")).toBeLessThan(body.indexOf("Earlier: blocked before any code."));
      expect(body.indexOf("Earlier: blocked before any code.")).toBeLessThan(body.indexOf("Reply here and let Kiln carry on"));
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  });
});

describe.each([1200, 390])("the catch-up offer at %ipx wide (AC-CURRENT-01, AC-LOOK-01)", width => {
  const catchUp = { base: "develop", repositories: [{ name: "acme-shop", branch: "feature/customer-returns", behind: 4 }] };
  it("shows once, above the ways to resolve the stop, ticked, and the buttons send it", async () => {
    const { server, page } = await open(stopped({ case: "could_not_start", launchFailure, startAgain: { available: true }, nothingToCheck: true, resumeOffered: false, catchUp }, false, ["finalMessage", "resumeCommand"]), width);
    try {
      await words(page, "This branch is 4 commits behind develop.");
      const body = await text(page);
      expect(body).toContain("Bring the branch up to date with develop first");
      expect(body).toContain("Offered because the branch has no commits of its own and nothing uncommitted, so nothing can be lost or overwritten. Kiln does this when a button below starts or resumes Phase 2b.");
      expect(body.split("Bring the branch up to date with develop first").length).toBe(2);
      expect(body.indexOf("This branch is 4 commits behind")).toBeLessThan(body.indexOf("Fix that, then have Kiln try again"));
      expect(await page.evaluate("document.querySelector('main input[type=checkbox]').checked")).toBe(true);
      expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
      await click(page, "Start Phase 2b again");
      await waitFor(() => server.commands.includes('POST /api/start-again {"bringUpToDate":true}'));
      // Unticked, the same button leaves the branch as it is.
      await page.waitFor("!document.querySelector('main input[type=checkbox]').disabled");
      await page.evaluate("document.querySelector('main input[type=checkbox]').click()");
      await page.waitFor("!document.querySelector('main input[type=checkbox]').checked");
      await click(page, "Start Phase 2b again");
      await waitFor(() => server.commands.includes('POST /api/start-again {"bringUpToDate":false}'));
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  });

  it("covers reply and resume on the handoff page", async () => {
    const { server, page } = await open(stopped({ case: "needs_input", resumeOffered: true, reopen: { state: "available" }, catchUp }), width);
    try {
      await words(page, "This branch is 4 commits behind develop.");
      const body = await text(page);
      expect(body.indexOf("How would you like to resolve this?")).toBeLessThan(body.indexOf("This branch is 4 commits behind"));
      expect(body.indexOf("This branch is 4 commits behind")).toBeLessThan(body.indexOf("Reply here and let Kiln finish"));
      await click(page, "Have Kiln resume Phase 2b");
      await waitFor(() => server.commands.some(command => command.startsWith("POST /api/resume ") && command.includes('"bringUpToDate":true')));
      expect(page.problems).toEqual([]);
    } finally { await page.close(); await server.close(); }
  });
});
