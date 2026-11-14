// A stopped phase says what happened and can carry on (Kiln Run Restart, Phase 1: AC-CASE-01 to
// 04, AC-CARRY-01 to 05), through the engine and its command journal against real Git with the
// stand-in claude: which kind of stop it is, What Kiln found, Start Phase N again, Nothing to check
// yet, and carrying on in a new session when the earlier conversation can't be reopened.

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "../control/commands.js";
import { findTranscripts } from "../session/transcripts.js";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { existsSync } from "node:fs";
import { writeSessionRecord } from "../state/records.js";
import { git } from "../test-support/git-repositories.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import type { Engine } from "./engine.js";
import { buildSnapshot } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

const PHASE_1 = "docs/prds/customer-returns/phase-1-return-intake.md";
/** A launch whose process exits before it begins a conversation, as a resume with no transcript does. */
const exitsBeforeInit: ScenarioSession = { noInit: true, actions: [] };
/** A session that began a conversation and stopped before building anything. */
const blocked = (message = "Blocked before any code. Merge the import work into develop, then have me continue.", extra: Partial<ScenarioSession> = {}): ScenarioSession => ({ ...extra, actions: [{ skill: "enso-method:implement-from-requirements" }, { result: message }] });

let commandNumber = 0;
/** Submits a journal instruction as the browser and command line do, then waits for it to settle. */
async function submit(engine: Engine, action: "carry-on" | "start-again", inputs: Record<string, unknown> = {}): Promise<Receipt> {
  const id = `restart-${++commandNumber}`;
  const view = engine.controlView();
  const answer = engine.commands.submit({ command_id: id, execution_id: engine.record.executionId!, status_token: view.token, action, inputs }, "caller", true);
  expect(answer.ok, JSON.stringify(answer.errors)).toBe(true);
  await engine.commands.settled();
  await engine.settled();
  return engine.commands.lookup(id).operation as Receipt;
}
const control = (engine: Engine, name: string) => engine.controlView().controls.find(one => one.name === name)!;

/** Finishes phase 1 by hand in the worktree: its Closed line, committed and pushed. */
function finishByHand(h: Harness) {
  const worktree = h.engine.worktreePath;
  const doc = join(worktree, PHASE_1);
  const lines = readFileSync(doc, "utf8").split("\n");
  lines.splice(1, 0, "", "**Closed:** 2026-11-12");
  writeFileSync(doc, lines.join("\n"));
  git(h.sandbox, worktree, "add", "-A");
  git(h.sandbox, worktree, "commit", "-q", "-m", "feat: intake, finished by hand");
  git(h.sandbox, worktree, "push", "-q", "-u", "origin", "feature/customer-returns");
}

describe("a phase Kiln couldn't start (AC-CASE-01, AC-CASE-02, AC-CASE-04)", () => {
  it("says so, shows What Kiln found, offers only Start Phase N again, and starting again launches the phase's first session once", async () => {
    harness = await createHarness({ sessions: [exitsBeforeInit, landingSession("src/intake.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    expect(h.engine.stoppedPhase()).toBe("1");
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.case).toBe("could_not_start");
    // The process started and exited before beginning a conversation (AC-CASE-04): What Kiln found, from its last output.
    expect(stop.launchFailure).toMatchObject({ ran: "claude", sentence: "Kiln ran `claude` in the worktree, and it exited with code 1 before beginning a conversation.", error: expect.stringContaining("No conversation found") });
    expect(stop.work).toEqual({ repositories: [{ name: "acme-shop", commits: [], uncommittedFiles: 0 }], builtNothing: true });
    // One way forward: no reply, resume or carry-on, and no completion checks until asked (AC-CASE-03).
    expect(stop).toMatchObject({ startAgain: { available: true }, resumeOffered: false, nothingToCheck: true });
    expect(stop.carryOn).toBeUndefined(); expect(stop.reopen).toBeUndefined(); expect(stop.resumeCommand).toBeUndefined();
    expect(control(h.engine, "start-again")).toMatchObject({ available: true });
    expect(control(h.engine, "carry-on")).toMatchObject({ available: false });
    expect(h.engine.markCompleteOffer().offered).toBe(false);

    // Pressing twice starts one session: the second instruction is refused while the first owns control (AC-CARRY-03).
    const view = h.engine.controlView();
    const first = h.engine.commands.submit({ command_id: "start-1", execution_id: h.engine.record.executionId!, status_token: view.token, action: "start-again", inputs: {} }, "caller", true);
    const second = h.engine.commands.submit({ command_id: "start-2", execution_id: h.engine.record.executionId!, status_token: view.token, action: "start-again", inputs: {} }, "caller", true);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    await h.engine.commands.settled(); await h.engine.settled();
    const receipt = h.engine.commands.lookup("start-1").operation as Receipt;
    expect(receipt).toMatchObject({ state: "completed", outcome: "session_started", effects: { session: "started" }, reply_text: null });

    // The phase's first session again, with the ordinary phase prompt, in a session record of its own; nothing resumed.
    const calls = h.claudeCalls();
    expect(calls[1]!.prompt).toBe(calls[0]!.prompt);
    expect(calls[1]!.args).not.toContain("--resume");
    const sessions = h.engine.phaseSessions("1");
    expect(sessions).toHaveLength(2);
    expect(sessions[1]!.startedAs).toBeUndefined();
    // The new session is judged by the completion checks as before: it landed the phase.
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  });
});

describe("a phase that stopped before building anything (AC-CASE-01, AC-CASE-03, AC-CARRY-01 row 1)", () => {
  it("names the case and the conversation's running time, shows Nothing to check yet until asked, then today's checks with Mark complete saying it built nothing", async () => {
    harness = await createHarness({ sessions: [blocked()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    let stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.case).toBe("built_nothing");
    expect(stop.conversationRanMs).toEqual(expect.any(Number));
    expect(stop.launchFailure).toBeUndefined();
    expect(stop.finalMessage).toContain("Blocked before any code.");
    // The conversation can be reopened: today's reply and resume, not carry-on (AC-CARRY-01 row 1).
    expect(stop.reopen).toEqual({ state: "available" });
    expect(stop).toMatchObject({ resumeOffered: true, nothingToCheck: true });
    expect(stop.resumeCommand).toContain("--resume");
    expect(stop.carryOn).toBeUndefined(); expect(stop.startAgain).toBeUndefined();
    expect(h.engine.markCompleteOffer().offered).toBe(false);

    // Check Phase N anyway is today's recheck: its rows replace the stop's, and Mark complete is offered as today.
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true, outcome: "still_stopped" });
    stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.nothingToCheck).toBeUndefined();
    expect(stop.checks.map(check => check.name)).toContain("Phase doc closed");
    const offer = h.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, builtNothing: true });
    expect(offer.offered && offer.sentence[0]).toBe("Phase 1 has built nothing: no commits and no uncommitted changes.");
    expect(stop.case).toBe("built_nothing");
  });

  it("shows today's page once the phase has built something", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ write: { path: "src/partial.txt", content: "half\n" } }, { result: "Which fields does the form need?" }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    let stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.case).toBe("needs_input");
    expect(stop.work).toMatchObject({ builtNothing: false, repositories: [{ uncommittedFiles: 1 }] });
    expect(stop.nothingToCheck).toBeUndefined();
    // A commit that came from the base branch is not the phase's work: develop gains one, the branch takes it in.
    git(h.sandbox, h.repository, "commit", "-q", "--allow-empty", "-m", "chore: develop moves on");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    const worktree = h.engine.worktreePath;
    git(h.sandbox, worktree, "fetch", "-q", "origin");
    git(h.sandbox, worktree, "merge", "-q", "--ff-only", "origin/develop");
    await h.engine.refreshStoppedWork("1");
    stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.work).toMatchObject({ repositories: [{ commits: [], uncommittedFiles: 1 }] });
  });
});

describe("carrying on when the conversation can't be reopened (AC-CARRY-01, AC-CARRY-02, AC-CARRY-04, AC-CARRY-05)", () => {
  it("offers carry-on with the reason, and the new session gets the reply, the last message and the phase's work", async () => {
    harness = await createHarness({ sessions: [{ noTranscript: true, actions: [{ write: { path: "src/partial.txt", content: "half\n" } }, { commit: "wip: intake form skeleton" }, { result: "Blocked: the import work isn't on develop." }] }, landingSession("src/intake.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();

    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.reopen).toEqual({ state: "unavailable", reason: "missing" });
    expect(stop).toMatchObject({ carryOn: { available: true }, resumeOffered: false, case: "needs_input" });
    expect(stop.resumeCommand).toBeUndefined();
    expect(control(h.engine, "carry-on")).toMatchObject({ available: true });
    expect(control(h.engine, "reply")).toMatchObject({ available: false });
    const earlier = h.engine.latestSession("1")!;
    const commit = git(h.sandbox, h.engine.worktreePath, "rev-parse", "--short=7", "HEAD").trim();

    const receipt = await submit(h.engine, "carry-on", { message: "  The import work is merged into develop now. Go ahead.\n" });
    expect(receipt).toMatchObject({ state: "completed", outcome: "session_started", effects: { session: "started" }, reply_text: null });

    // The carry-on session is the second launch; once it lands the phase, Kiln goes on to the next.
    const calls = h.claudeCalls();
    const prompt = calls[1]!.prompt;
    expect(calls[1]!.args).not.toContain("--resume");
    expect(prompt).toContain(`implement \`${PHASE_1}\``);
    expect(prompt).toContain("A previous session stopped partway through this phase");
    expect(prompt).toContain("The person running Kiln says:\n\nThe import work is merged into develop now. Go ahead.");
    expect(prompt).toContain("This session runs unattended.");
    expect(prompt).toContain("Blocked: the import work isn't on develop.");
    expect(prompt).toContain(`\`${commit}\` wip: intake form skeleton`);
    expect(prompt).toContain("No uncommitted files");
    // A new session for the same phase, marked as a carry-on; the earlier one stays in the phase's history.
    const sessions = h.engine.phaseSessions("1");
    expect(sessions.map(session => session.sessionId)).toEqual([earlier.sessionId, expect.any(String)]);
    expect(sessions[1]!.startedAs).toBe("carry_on");
    expect(sessions[1]!.workingDirectory).toBe(earlier.workingDirectory);
    // Judged by the completion checks as before.
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  });

  it("returns the carry-on card after a carry-on that never began, with What Kiln found then the earlier last message", async () => {
    harness = await createHarness({ sessions: [blocked("Blocked before any code.", { noTranscript: true }), exitsBeforeInit] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const earlier = h.engine.latestSession("1")!;

    const receipt = await submit(h.engine, "carry-on");
    expect(receipt).toMatchObject({ state: "failed", outcome: "dispatch_not_started", effects: { session: "not_started" } });
    expect(h.engine.stoppedPhase()).toBe("1");
    const stop = buildSnapshot(h.engine).needsYou!;
    // The latest launch is the failed carry-on; the latest conversation, which resume and the target read, is the earlier one.
    expect(stop.launchFailure).toMatchObject({ sentence: expect.stringContaining("before beginning a conversation") });
    expect(stop.conversationMessage).toMatchObject({ finalMessage: "Blocked before any code." });
    expect(h.engine.phaseRecoveryTarget()!.sessionId).toBe(earlier.sessionId);
    expect(stop).toMatchObject({ case: "built_nothing", carryOn: { available: true }, resumeOffered: false, nothingToCheck: true });
    expect(stop.reopen).toMatchObject({ state: "unavailable", reason: "missing" });
  });

  it("says Kiln tried to reopen the conversation when a resume stopped before it began (AC-CARRY-02 row 6)", async () => {
    harness = await createHarness({ sessions: [blocked(), exitsBeforeInit] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await h.engine.settled();
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.kind).toBe("not_resumable");
    expect(stop.reopen).toEqual({ state: "unavailable", reason: "reopen_failed" });
    expect(stop).toMatchObject({ carryOn: { available: true }, resumeOffered: false });
    expect(stop.launchFailure).toBeUndefined();
    // The first card gives the latest launch's last recorded final message, not its last lines (AC-CASE-04).
    expect(stop.finalMessage).toBe("Blocked before any code. Merge the import work into develop, then have me continue.");
    expect(stop.lastLines).toBeUndefined();
  });

  it("names a folder other accounts can change with the command that clears it, and offers reply and resume again once it reads, without restarting Kiln", async () => {
    harness = await createHarness({ sessions: [blocked()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const folder = dirname(findTranscripts(h.env.CLAUDE_CONFIG_DIR!, h.engine.latestSession("1")!.sessionId).main!);
    chmodSync(folder, 0o777);
    try {
      expect(h.engine.reopenCheck("1")).toEqual({ state: "unavailable", reason: "unsafe", path: folder, defects: ["writable_by_others"], fixCommand: `chmod o-w ${folder}` });
      expect(buildSnapshot(h.engine).needsYou).toMatchObject({ carryOn: { available: true }, resumeOffered: false });
    } finally { chmodSync(folder, 0o700); }
    // Check again needs only a fresh snapshot for Claude.
    await h.engine.reopenCheckAgain();
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.reopen).toEqual({ state: "available" });
    expect(stop.resumeOffered).toBe(true);
    expect(stop.carryOn).toBeUndefined();
  });

  it("checks completion first and starts nothing when the phase is already complete", async () => {
    harness = await createHarness({ sessions: [blocked("Blocked.", { noTranscript: true }), landingSession()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    finishByHand(h);
    const receipt = await submit(h.engine, "carry-on", { message: "Carry on." });
    expect(receipt).toMatchObject({ state: "completed", outcome: "phase_already_complete", effects: { session: "not_started", reply: "not_sent" }, reply_text: "Carry on." });
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.phaseSessions("1")).toHaveLength(1);
    expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
    // The reply is kept unsent, as a reply's is: the page and kiln status list it, and advancing must say it leaves it unsent.
    const target = h.engine.controlView().target;
    expect(h.engine.commands.unsent(target).map(one => one.reply_text)).toEqual(["Carry on."]);
    const view = h.engine.controlView();
    const refused = h.engine.commands.submit({ command_id: "advance-1", execution_id: h.engine.record.executionId!, status_token: view.token, action: "verify-and-advance", inputs: {} }, "caller", true);
    expect(refused.ok).toBe(false);
    expect(h.engine.commands.lookup("advance-1").operation).toMatchObject({ state: "refused", outcome: "unsent_reply_acknowledgement_required" });
    const advance = h.engine.commands.submit({ command_id: "advance-2", execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: "verify-and-advance", inputs: { without_sending_reply: true } }, "caller", true);
    expect(advance.ok, JSON.stringify(advance.errors)).toBe(true);
    await h.engine.commands.settled(); await h.engine.settled();
    expect(h.engine.commands.lookup("advance-2").operation).toMatchObject({ outcome: "advanced", effects: { plan: "advanced" } });
    expect((h.engine.commands.lookup(receipt.command_id).operation as Receipt).acknowledged_by).toBe((h.engine.commands.lookup("advance-2").operation as Receipt).id);
    expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  });

  it("keeps no unsent reply for a carry-on without one, and advancing needs no acknowledgement", async () => {
    harness = await createHarness({ sessions: [blocked("Blocked.", { noTranscript: true }), landingSession()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    finishByHand(h);
    const receipt = await submit(h.engine, "carry-on", { message: "   " });
    expect(receipt).toMatchObject({ outcome: "phase_already_complete", reply_text: null, effects: { reply: "not_applicable" } });
    expect(h.engine.commands.unsent(h.engine.controlView().target)).toEqual([]);
    const advance = h.engine.commands.submit({ command_id: "advance-plain", execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: "verify-and-advance", inputs: {} }, "caller", true);
    expect(advance.ok, JSON.stringify(advance.errors)).toBe(true);
    await h.engine.commands.settled(); await h.engine.settled();
    expect(h.engine.commands.lookup("advance-plain").operation).toMatchObject({ outcome: "advanced" });
  });

  it("keeps a carry-on's unsent reply once Kiln is opened again", async () => {
    harness = await createHarness({ sessions: [blocked("Blocked.", { noTranscript: true }), landingSession()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    finishByHand(h);
    const receipt = await submit(h.engine, "carry-on", { message: "Carry on." });
    expect(receipt.outcome).toBe("phase_already_complete");
    h.engine.close();
    const reopened = h.reopen();
    expect(reopened.commands.unsent(reopened.controlView().target).map(one => one.reply_text)).toEqual(["Carry on."]);
    reopened.close();
  });
});

describe("the first card after a resume that couldn't spawn (AC-CASE-04)", () => {
  it("gives the latest launch's last recorded final message, with today's spawn-error warning", async () => {
    harness = await createHarness({ sessions: [blocked("Blocked: the import work isn't on develop.")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    // A resume whose process couldn't start, as the Claude session records one: a run with only its spawn error.
    const session = h.engine.latestSession("1")!;
    const at = new Date(Date.parse(session.runs[0]!.endedAt!) + 60_000).toISOString();
    session.runs.push({ startedAt: at, endedAt: at, cause: "person_resume", spawnError: { code: "EACCES", message: "spawn claude EACCES" } });
    writeSessionRecord(h.stateDirectory, session);
    expect(h.engine.stoppedPhase()).toBe("1");
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.launchFailure).toBeUndefined();
    expect(stop.finalMessage).toBe("Blocked: the import work isn't on develop.");
    expect(stop.lastLines).toBeUndefined();
    expect(stop.spawnError).toEqual({ code: "EACCES", message: "spawn claude EACCES" });
  });
});

describe("the limits both session-starting buttons keep (AC-CARRY-03)", () => {
  it("makes them unavailable, with the reason, while a billing restriction would stop a launch and while a session runs, and a second carry-on starts nothing", async () => {
    const working = "carry-working"; const release = "carry-release";
    harness = await createHarness({ sessions: [blocked("Blocked.", { noTranscript: true }), { actions: [] }] });
    const h = harness;
    const flag = (name: string) => join(h.sandbox.root, name);
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [blocked("Blocked.", { noTranscript: true }), { actions: [{ touch: flag(working) }, { waitForFile: flag(release) }, { result: "Done for now." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(control(h.engine, "carry-on")).toMatchObject({ available: true });
    // A billing reading that says Kiln can't launch, as the launch path's own check reads it.
    const view = h.engine.billing.view;
    const restricted = vi.spyOn(h.engine.billing, "view", "get").mockReturnValue({ ...view, canLaunch: false, next: { ...(view.next ?? { route: "metered", sources: [], diagnostics: [] }), route: "metered", approved: false } as NonNullable<typeof view.next> });
    expect(h.engine.carryOnControl()).toMatchObject({ offered: true, available: false, reason: expect.stringContaining("Billing restrictions would stop a launch") });
    expect(control(h.engine, "carry-on")).toMatchObject({ available: false, reason: expect.stringContaining("Billing") });
    restricted.mockRestore();

    const token = h.engine.controlView().token;
    const first = h.engine.commands.submit({ command_id: "carry-1", execution_id: h.engine.record.executionId!, status_token: token, action: "carry-on", inputs: {} }, "caller", true);
    const second = h.engine.commands.submit({ command_id: "carry-2", execution_id: h.engine.record.executionId!, status_token: token, action: "carry-on", inputs: {} }, "caller", true);
    expect(first.ok).toBe(true); expect(second.ok).toBe(false);
    await waitFor(() => existsSync(flag(working)));
    // While the carry-on session runs, the page's buttons are refused for the running session, and bots see both unavailable with a reason.
    expect(h.engine.carryOnControl().offered).toBe(false);
    expect((h.engine as unknown as { launchBusy(): string | undefined }).launchBusy()).toBe("A session for this PRD is running.");
    for (const name of ["carry-on", "start-again"]) expect(control(h.engine, name), name).toMatchObject({ available: false, reason: expect.any(String) });
    writeFileSync(flag(release), "go");
    await h.engine.commands.settled(); await h.engine.settled();
    expect(h.engine.phaseSessions("1")).toHaveLength(2);
  });

  it("makes Start Phase N again unavailable, with the reason, while a billing restriction would stop a launch and while a session runs", async () => {
    harness = await createHarness({ sessions: [{ noInit: true, actions: [] }, { noInit: true, actions: [] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(buildSnapshot(h.engine).needsYou!.case).toBe("could_not_start");
    expect(control(h.engine, "start-again")).toMatchObject({ available: true });
    const view = h.engine.billing.view;
    const restricted = vi.spyOn(h.engine.billing, "view", "get").mockReturnValue({ ...view, canLaunch: false, next: { ...(view.next ?? { route: "metered", sources: [], diagnostics: [] }), route: "metered", approved: false } as NonNullable<typeof view.next> });
    const billing = "Billing restrictions would stop a launch. Review and approve this billing setup, or change its source and recheck.";
    expect(h.engine.startAgainControl()).toEqual({ offered: true, available: false, reason: billing });
    expect(buildSnapshot(h.engine).needsYou!.startAgain).toEqual({ available: false, reason: billing });
    expect(control(h.engine, "start-again")).toMatchObject({ available: false, reason: billing });
    const refused = h.engine.commands.submit({ command_id: "start-billing", execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: "start-again", inputs: {} }, "caller", true);
    await h.engine.commands.settled(); await h.engine.settled();
    expect(refused.ok, JSON.stringify(refused)).toBe(false);
    expect(h.engine.phaseSessions("1")).toHaveLength(1);
    restricted.mockRestore();
    // A session running for the PRD, with this stop still on record.
    const engine = h.engine as unknown as { current: unknown };
    const saved = engine.current; engine.current = { phaseKey: "1", processRunning: true };
    try {
      expect(h.engine.startAgainControl()).toEqual({ offered: true, available: false, reason: "A session for this PRD is running." });
    } finally { engine.current = saved; }
  });

  it("shows today's Conversation recovery unavailable for a Codex safety problem, whatever else holds, and refuses Start again on it (AC-CARRY-01 row 3)", async () => {
    harness = await createHarness({ sessions: [blocked("Blocked.", { noTranscript: true })] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    // The saved session, as a Codex one whose dispatch is ambiguous and whose cleanup is unresolved.
    const session = h.engine.latestSession("1")!;
    Object.assign(session, { agentId: "codex", conversation: { threadId: "thread-1" }, codex: { launchIntent: { version: "x", cwd: "", writableRoots: [], repositories: [], skills: [{ name: "implement-from-requirements", path: "/skills/implement-from-requirements/SKILL.md" }] }, originalAccount: { at: session.createdAt }, conversationUnavailable: true } });
    const facts: Record<string, unknown> = { intentAt: session.createdAt, requested: { model: "m" }, account: { at: session.createdAt }, profile: { version: "x", cwd: "", writableRoots: [], repositories: [], skills: [] }, humanRequests: [], modelActivityAt: [], cleanup: "unknown", reconciliation: "ambiguous", turnId: "turn-1" };
    session.runs[0]!.codex = facts as never;
    writeSessionRecord(h.stateDirectory, session);
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.reopen).toMatchObject({ state: "safety", problems: expect.arrayContaining([expect.stringContaining("Codex dispatch is ambiguous")]) });
    expect(stop.carryOn).toBeUndefined(); expect(stop.resumeOffered).toBe(false);
    expect(control(h.engine, "carry-on")).toMatchObject({ available: false });
    // With no conversation begun, Start again is offered but refused on the safety problem.
    delete facts.turnId; facts.reconciliation = "settled";
    writeSessionRecord(h.stateDirectory, session);
    expect(h.engine.startAgainControl()).toMatchObject({ offered: true, available: false, reason: expect.stringContaining("Codex safety problem") });
  });

  it("rechecks the conversation on Check Phase N again too (AC-CARRY-02)", async () => {
    harness = await createHarness({ sessions: [blocked()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const folder = dirname(findTranscripts(h.env.CLAUDE_CONFIG_DIR!, h.engine.latestSession("1")!.sessionId).main!);
    chmodSync(folder, 0o777);
    expect(buildSnapshot(h.engine).needsYou!.carryOn).toMatchObject({ available: true });
    chmodSync(folder, 0o700);
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true });
    expect(buildSnapshot(h.engine).needsYou).toMatchObject({ resumeOffered: true, reopen: { state: "available" } });
  });
});
