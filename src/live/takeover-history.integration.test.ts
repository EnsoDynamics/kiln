// Phase 10: real provider files, controller/HTTP, built browser and CLI, disposable Git.
// Scripted provider output creates deterministic history faults; no new provider qualification.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { launchChrome, type BrowserPage, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { findTranscripts } from "../session/transcripts.js";
import type { LiveTarget } from "./target.js";
import type { Receipt } from "../control/commands.js";
import * as ownership from "./ownership.js";
import * as ownedProcesses from "./owned-processes.js";
/** An activity's name mid-sentence, as the hand-back page writes it: "Phase 2b", "delivery audit · Round 3". */
const inSentence = (label: string) => /^Phase /.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);

let h: Harness;
let server: LocalServer | undefined;
let page: BrowserPage | undefined;
let chrome: HeadlessChrome;
let origin: string;
let target: LiveTarget;
let historyFile: string;
let originalHistory: string;
let uncertain: Receipt | undefined;
let originalCalls: number;
let releaseLock: (() => void) | undefined;
let proofStage = "preparing fixture";
let prerequisiteId: string | undefined;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
afterEach(async ({ task }) => {
  if (task.result?.state === "fail") {
    process.stderr.write(`History proof stopped at: ${proofStage}\n`);
    const observation = await page?.evaluate<{ commandId?: string }>("window.__historyVerifyObservation ?? null").catch(() => undefined);
    if (observation) process.stderr.write(`Browser Verify: ${JSON.stringify(observation)}; receipt: ${JSON.stringify(observation.commandId ? h.engine.commands.lookup(observation.commandId) : null)}\n`);
  }
  vi.restoreAllMocks(); await page?.close(); page = undefined; await server?.close(); server = undefined; releaseLock?.(); releaseLock = undefined; await h?.cleanup(); uncertain = undefined;
});

const button = (text: string) => `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
async function post(route: string, body: unknown) {
  const response = await fetch(`${origin}/api/${route}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
async function cli(args: string[], json = true) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args, join(h.repository, h.engine.record.prdDirectory), ...(json ? ["--json"] : [])], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; let error = "";
  child.stdout.on("data", b => { output += String(b); }); child.stderr.on("data", b => { error += String(b); });
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  expect(error).toBe(""); return { code, output, body: json ? JSON.parse(output) as Record<string, unknown> : {} };
}
async function reconcile() {
  const hold = h.engine.record.liveControl!.takeover;
  expect((await post("live/reconcile", { instructionId: hold.instructionId, target })).status).toBe(200);
}
async function released() {
  await waitFor(async () => { await reconcile(); return h.engine.record.liveControl?.takeover.state === "released"; }, 10000);
}
function assertHeld() {
  expect(h.engine.record.liveControl?.takeover).toMatchObject({ target, state: "pending", reason: expect.stringMatching(/history|conversation/i) });
  // Once the attempt has ended, a conversation that can't be reopened is recorded on the hold, which then ends by a carry-on
  // (run restart AC-CARRY-06); history that breaks during a release's own final read is refused as before.
  const hold = h.engine.record.liveControl!.takeover;
  expect(hold.history?.state === "unavailable" || hold.reason.includes("retry release checks"), hold.reason).toBe(true);
  expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toBeUndefined();
  expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined();
  expect(h.engine.record.pause.requestedAt).toBeDefined();
  expect(h.claudeCalls()).toHaveLength(originalCalls);
  expect(h.engine.latestSession(target.activityKey)!.runs.at(-1)!.signal).toBeUndefined();
  if (uncertain) {
    const saved = h.engine.commands.lookup("uncertain-history").operation as Receipt;
    expect(saved.message).toMatchObject({ delivery: "uncertain", reviewedAt: expect.any(String) });
    expect(saved.message?.resolvedBy).toBeUndefined();
  }
}
async function prepareActivity(kind: "phase" | "delivery_audit" | "test_audit", recovery: "takeover" | "delivery_recovery") {
  proofStage = "preparing the assigned activity";
  prerequisiteId = undefined;
  const audit = kind !== "phase";
  h = await createHarness({ sessions: [], ...(audit ? { folder: "proof", auditCycles: true, files: {
    "proof-prd.md": "# PRD: History proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Value.** Return 42.\n",
    "technical-design.md": "# Design\nExport value from value.mjs.\n",
    "phase-1-value.md": "# Phase 1: Value\n\n**Closed:** 2026-10-28\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
    "value.mjs": "export const value = () => 42;\n",
    "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
  } } : {}) });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  if (audit) {
    writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
    git(h.sandbox, h.repository, "add", ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test(history): ignore transient audit requests"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  }
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const started = join(h.sandbox.root, "history-started"); const ready = join(h.sandbox.root, "history-ready"); const release = join(h.sandbox.root, "history-release");
  const paused = { actions: [{ touch: started }, ...(audit ? [{ auditReport: {} }] : []), { touch: ready }, ...(recovery === "takeover" ? [{ waitForFile: release }, { result: "Completed the operation; activity held." }] : [{ liveMessages: 1, uncorrelated: true, exitAfter: true }])] };
  const priorStarted = join(h.sandbox.root, "prior-audit-started"); const priorRelease = join(h.sandbox.root, "prior-audit-release");
  const ordinary = { actions: [{ touch: priorStarted }, { waitForFile: priorRelease }, { auditReport: {} }, { result: "Prior audit recorded." }] };
  writeFileSync(h.scenarioPath, JSON.stringify(audit ? { sessions: [], auditSessions: kind === "test_audit" ? [ordinary, paused] : [paused] } : { sessions: [paused] }));
  const hosted = await startFixtureController({ engine: h.engine, folderName: h.engine.paths.folderName, featureName: "History proof", token: h.engine.record.token });
  server = hosted.server; releaseLock = hosted.release; origin = new URL(server.address).origin;
  await h.engine.start({ refinementConfirmed: true });
  if (kind === "test_audit") {
    // Complete the real prerequisite delivery audit in its own bounded hook,
    // using the normal deferred pause before starting the assigned test audit.
    await waitFor(() => existsSync(priorStarted), 30000);
    prerequisiteId = h.engine.auditActivity(h.engine.liveTarget()!.activityKey)!.activityId;
    expect(h.engine.pause().ok).toBe(true); writeFileSync(priorRelease, "finish the prerequisite");
  }
}
async function settlePrerequisite(kind: "phase" | "delivery_audit" | "test_audit") {
  if (kind === "test_audit") {
    proofStage = "settling the exact prerequisite delivery audit";
    await h.engine.settled(); expect(h.engine.record.pause.activeSince).toBeDefined();
    const prior = h.engine.record.completionAudits!.activities.find(activity => activity.activityId === prerequisiteId)!;
    expect(prior.kind).toBe("delivery_audit"); expect(prior.acceptedResult).toBeDefined();
    expect(h.engine.record.phases[`audit-${prior.activityId}`]!.doneAt).toBeDefined();
  }
}
async function prepareAssignedReport(kind: "phase" | "delivery_audit" | "test_audit") {
  proofStage = "waiting for the assigned report command to finish";
  if (kind === "test_audit") expect(await h.engine.start()).toEqual({ ok: true });
  await waitFor(() => existsSync(join(h.sandbox.root, "history-started")), 30000);
  target = h.engine.liveTarget()!; expect(target).toBeDefined();
  const audit = kind !== "phase";
  // Report generation is fixture preparation, bounded by this hook's existing
  // 60-second limit, separate from each history test's declared runner allowance.
  await waitFor(() => existsSync(join(h.sandbox.root, "history-ready")), 50000);
  if (audit) expect(h.engine.auditActivity(target.activityKey)).toMatchObject({ kind, acceptedResult: expect.any(String) });
}
async function prepareHeldRecovery(kind: "phase" | "delivery_audit" | "test_audit", recovery: "takeover" | "delivery_recovery") {
  const audit = kind !== "phase";
  proofStage = "holding the completed operation";
  expect(h.engine.pause().ok).toBe(true);
  if (recovery === "takeover") {
    expect((await post("live/take-over", { instructionId: "history-takeover", target })).status).toBe(202);
    writeFileSync(join(h.sandbox.root, "history-release"), "finish naturally");
  } else {
    await waitFor(() => h.engine.liveView()?.input?.available === true);
    expect((await post("live/message", { instructionId: "uncertain-history", target, text: "  Inspect this exact uncertain instruction.\n " })).status).toBe(202);
    await h.engine.commands.settled();
  }
  await h.engine.settled(); await released();
  expect(h.engine.record.liveControl?.takeover).toMatchObject({ state: "released", ...(recovery === "delivery_recovery" ? { kind: recovery } : {}) });
  if (recovery === "delivery_recovery") {
    uncertain = h.engine.commands.lookup("uncertain-history").operation as Receipt;
    expect(uncertain.message?.delivery).toBe("uncertain");
    expect((await post("live/message-review", { instructionId: "review-history", target, receiptIds: [uncertain.id] })).status).toBe(200);
  }
  if (!audit) {
    const phase = `${h.engine.record.prdDirectory}/phase-1-return-intake.md`;
    writeFileSync(join(h.engine.worktreePath, phase), readFileSync(join(h.engine.worktreePath, phase), "utf8").replace("\n", "\n\n**Closed:** 2026-10-28\n"));
    git(h.sandbox, h.engine.worktreePath, "add", phase); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(history): complete disposable phase"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  }
  // Prove the ordinary completion material passes before removing history.
  proofStage = "proving the real completion material passes";
  const complete = await post("resume", { target: h.engine.phaseRecoveryTarget() });
  expect(complete.body.outcome, JSON.stringify(complete)).toBe("already_complete");
  expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined();
  historyFile = findTranscripts(h.env.CLAUDE_CONFIG_DIR!, target.providerSessionId).main!;
  originalHistory = readFileSync(historyFile, "utf8");
  originalCalls = h.claudeCalls().length;
  proofStage = "history assertions";
}

const invalidHistory = [
  { name: "metadata-only", bytes: JSON.stringify({ type: "file-history-snapshot" }) + "\n" },
  { name: "empty-object", bytes: "{}\n" },
  { name: "partial-only", bytes: '{"type":' },
  { name: "wrong-conversation", bytes: JSON.stringify({ type: "user", sessionId: "another-conversation", message: { content: "Not the saved conversation" } }) + "\n" },
  { name: "missing", bytes: undefined },
  { name: "corrupt", bytes: "garbage\n" },
  { name: "empty-file", bytes: "" },
];

describe.skipIf(process.platform !== "darwin").each(["phase", "delivery_audit", "test_audit"] as const)("usable history for $0", kind => {
  describe.each(["takeover", "delivery_recovery"] as const)("under %s", recovery => {
    beforeEach(async () => { await prepareActivity(kind, recovery); });
    beforeEach(async () => { await settlePrerequisite(kind); });
    beforeEach(async () => { await prepareAssignedReport(kind); });
    beforeEach(async () => { await prepareHeldRecovery(kind, recovery); });
    it("keeps unusable exact history pending through HTTP/browser/bot and accepts only a fresh explicit return after restoration", async () => {
      const testStarted = Date.now();
      const label = h.engine.liveView()!.label;
      const calls = h.claudeCalls().length;
      const auditIdentity = h.engine.auditActivity(target.activityKey);
      for (const [index, fixture] of invalidHistory.entries()) {
        if (fixture.bytes === undefined) rmSync(historyFile); else writeFileSync(historyFile, fixture.bytes);
        await reconcile(); assertHeld();
        const refused = await post("check-again", { target: h.engine.phaseRecoveryTarget(), intent: "verify" });
        expect(refused.status, JSON.stringify(refused)).toBe(409); expect(refused.body.reason).toContain("history"); expect(refused.body.outcome).not.toBe("advanced"); assertHeld();
        // Actual Svelte page receives the authoritative pending state, never a ready fixture.
        page = await chrome.open(server!.address, { width: index % 2 ? 390 : 1200, height: 1100 });
        // The held page offers carry-on and a fresh terminal session in place of the wait text (run restart AC-CARRY-06).
        await page.waitFor(`document.body.innerText.includes('Reply here and let Kiln carry on')`);
        const body = await page.evaluate<string>("document.body.innerText");
        expect(body, fixture.name).not.toContain("Paused for terminal takeover.");
        expect(body).toContain("Why the earlier conversation can't be reopened"); expect(body).toContain("Start a fresh session in your terminal");
        expect(body).not.toContain("Wait before opening Claude");
        if (recovery === "takeover") expect(body).toContain("Pausing for takeover — finishing the current operation.");
        expect(await page.evaluate(`Boolean(${button("Copy resume command")})`)).toBe(false);
        expect(await page.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>/^(Have Kiln resume |Check .* again)/.test(b.textContent.trim())&&!b.disabled)`)).toBe(false);
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        expect(page.problems).toEqual([]); await page.close(); page = undefined;
      }
      // The built CLI must project the same pending reason and refuse explicit Verify.
      const status = await cli(["status"]); expect(status.code).toBe(0);
      expect(status.body.live_control).toMatchObject({ target, takeover: { state: "pending" } });
      expect((status.body.controls as { name: string; available: boolean; reason: string }[]).find(control => control.name === "verify-and-advance")).toMatchObject({ available: false, reason: expect.stringContaining("history") });
      // Bots see the carry-on the page offers (AC-CARRY-04, AC-CARRY-06).
      expect((status.body.controls as { name: string; available: boolean; reason: string | null }[]).find(control => control.name === "carry-on"), JSON.stringify(status.body.controls)).toMatchObject({ available: true });
      const text = await cli(["status"], false); expect(text.output).not.toContain("Paused for terminal takeover."); expect(text.output).toContain("can't reopen the saved conversation history");
      const handoff = await cli(["handoff"]); expect(handoff.body.data).toMatchObject({ resumable: false, resume_command: null, resume_argv: null });
      const command = "history-refused";
      await cli(["verify-and-advance", "--command-id", command, "--only-if-status-matches", String(status.body.status_token)]); await h.engine.commands.settled();
      const receipt = h.engine.commands.lookup(command).operation as Receipt;
      expect(receipt.state, JSON.stringify(receipt)).toBe("refused"); expect(receipt.reason).toContain("history"); expect(receipt.effects.plan).toBe("not_advanced"); assertHeld();
      // Restart while unavailable must preserve the hold and original activity/round.
      await server!.close(); server = undefined;
      h.engine = h.reopenFromDisk(); await h.engine.prepare(); await h.engine.reconcileTakeover(); assertHeld();
      expect((await h.engine.decide()).kind).toBe("needs_you");
      if (auditIdentity) expect(h.engine.auditActivity(target.activityKey)).toMatchObject({ activityId: auditIdentity.activityId, kind: auditIdentity.kind, round: auditIdentity.round });
      server = await startLocalServer({ engine: h.engine, port: Number(new URL(origin).port), folderName: h.engine.paths.folderName, featureName: "History proof", token: h.engine.record.token });
      // Legacy records and a partial trailing row remain supported at release and return.
      const legacy = JSON.stringify({ type: "user", message: { content: "Saved legacy continuation" } }) + '\n{"type":';
      for (const bytes of [legacy, originalHistory + '{"type":']) { writeFileSync(historyFile, bytes); await released(); expect(h.engine.record.liveControl?.takeover.state).toBe("released"); }
      expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(calls);
      page = await chrome.open(server.address, { width: 390, height: 1100 });
      await page.waitFor(`${button(`Check ${inSentence(label)} again`)} && !${button(`Check ${inSentence(label)} again`)}.disabled`);
      expect(await page.evaluate(`Boolean(${button("Copy resume command")})`)).toBe(true);
      // Observe the real Verify response rather than impose a separate 20-second
      // polling deadline on the full report/currentness/ownership evaluation.
      await page.evaluate(`(() => {
        const original = window.fetch.bind(window); let finish;
        const observation = window.__historyVerifyObservation = {clickAt: Date.now()};
        window.__historyVerifyDone = new Promise(resolve => { finish = resolve; });
        window.fetch = async (...args) => {
          const observing = String(args[0]).includes('/api/check-again');
          if (observing) {
            observation.requestedAt = Date.now();
            const body = JSON.parse(args[1].body);
            observation.commandId = body.instructionId ?? args[1].headers['X-Kiln-Command-Id'];
          }
          try {
            const response = await original(...args);
            if (observing) {
              observation.respondedAt = Date.now(); observation.status = response.status;
              const body = await response.clone().json(); finish({status: response.status, body});
            }
            return response;
          } catch (error) {
            if (observing) { observation.error = String(error); finish({error: String(error)}); }
            throw error;
          }
        };
      })()`);
      proofStage = `awaiting the browser Verify response, clicked after ${Date.now() - testStarted} ms of assertions`;
      await page.evaluate(`${button(`Check ${inSentence(label)} again`)}.click()`);
      const answer = await page.evaluate<{ status: number; body: { ok: boolean; outcome?: string } }>("window.__historyVerifyDone");
      expect(answer).toMatchObject({ status: 200, body: { ok: true, outcome: "advanced" } });
      expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeDefined();
      proofStage = "settling the explicit browser return";
      await h.engine.settled();
      expect(h.engine.record.liveControl).toBeUndefined(); expect(h.engine.record.pause.activeSince).toBeDefined(); expect(h.claudeCalls()).toHaveLength(calls);
      if (uncertain) expect(h.engine.commands.lookup("uncertain-history").operation).toMatchObject({ message: { delivery: "uncertain", reviewedAt: expect.any(String), resolvedBy: expect.any(String) } });
    // This journey includes eight real browser views, four CLI invocations,
    // restart and real audit completion checks; it has no product timing promise.
    }, 120000);
    if (kind === "phase" && recovery === "takeover") it("carries on from a hold whose conversation can't be reopened: already complete advances, and a new session's init ends the hold (run restart AC-CARRY-06)", async () => {
      const carryOn = async (commandId: string, body: Record<string, unknown>) => {
        const response = await fetch(`${origin}/api/carry-on`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "X-Kiln-Status": h.engine.controlView().token, "X-Kiln-Command-Id": commandId, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() as Record<string, unknown> };
      };
      rmSync(historyFile); await reconcile();
      expect(h.engine.record.liveControl!.takeover).toMatchObject({ state: "pending", history: { state: "unavailable", reason: "missing" } });
      expect(h.engine.record.liveControl!.takeover.carryOnObstacle).toBeUndefined();
      const stop = buildSnapshot(h.engine).needsYou!;
      expect(stop).toMatchObject({ carryOn: { available: true, endsHold: "takeover" }, reopen: { reason: "missing" }, work: { builtNothing: false } });
      expect(stop.case).toBeUndefined();
      // kiln handoff gives the fresh-session instructions the terminal card shows, and no resume command.
      const handoff = await cli(["handoff"]);
      expect(handoff.body.data, JSON.stringify(handoff.body)).toMatchObject({ resumable: false, resume_command: null, resume_argv: null, fresh_session_instructions: { command: stop.freshSessionCommand, prompt: stop.freshSessionPrompt } });
      // The phase was finished by hand: carry-on checks completion first and starts nothing.
      const complete = await carryOn("held-carry-complete", { target: h.engine.phaseRecoveryTarget(), note: "Never sent." });
      expect(complete.body, JSON.stringify(complete)).toMatchObject({ ok: true, outcome: "already_complete" });
      expect(h.claudeCalls()).toHaveLength(originalCalls); expect(h.engine.record.liveControl).toBeDefined();
      // The reply is kept unsent, as a reply's is (AC-CARRY-05).
      expect(h.engine.commands.unsent(h.engine.controlView().target).map(r => r.reply_text)).toEqual(["Never sent."]);
      // Undo the hand finish, so the carry-on starts a session; it lands the phase.
      git(h.sandbox, h.engine.worktreePath, "revert", "--no-edit", "HEAD"); git(h.sandbox, h.engine.worktreePath, "push", "-q", "origin", h.engine.record.settings.featureBranch);
      const scenario = JSON.parse(readFileSync(h.scenarioPath, "utf8")) as { sessions: unknown[] };
      scenario.sessions.push({ actions: [{ close: true }, { commit: "feat: carried on" }, { push: true }, { result: "Carried on and landed." }, { exit: 0 }] });
      writeFileSync(h.scenarioPath, JSON.stringify(scenario));
      const started = await carryOn("held-carry-start", { target: h.engine.phaseRecoveryTarget(), note: "Carry on from the hold." });
      expect(started.body, JSON.stringify(started)).toMatchObject({ ok: true, outcome: "session_started", operation: { effects: { session: "started" } } });
      await h.engine.settled();
      // The new run reported init: the hold ended without its release, and the phase was judged by its checks.
      expect(h.engine.record.liveControl).toBeUndefined();
      expect(h.claudeCalls()).toHaveLength(originalCalls + 1);
      expect(h.claudeCalls().at(-1)!.prompt).toContain("Carry on from the hold.");
      expect(h.engine.phaseSessions(target.activityKey).at(-1)!.startedAs).toBe("carry_on");
      expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeDefined();
    }, 120000);
    if (kind === "phase" && recovery === "delivery_recovery") it("kiln carry-on --message-reviewed acknowledges the uncertain message and carries on from a hold that can't be reopened (run restart AC-CARRY-06)", async () => {
      rmSync(historyFile); await reconcile();
      expect(h.engine.record.liveControl!.takeover).toMatchObject({ state: "pending", history: { state: "unavailable", reason: "missing" } });
      // The fixture acknowledged the message so its release proof could run; take that back, as a message nobody has acknowledged yet.
      const saved = h.engine.commands.lookup("uncertain-history").operation as Receipt;
      delete saved.message!.reviewedAt; h.engine.commands.checkpoint(saved);
      expect(h.engine.liveView()!.reviewRequired).toEqual([saved.id]);
      // The page's button waits for the acknowledgement; the command line takes it with the command, as kiln resume does.
      expect(buildSnapshot(h.engine).needsYou!.carryOn).toMatchObject({ available: false, reason: expect.stringContaining("Acknowledge each message") });
      const status = await cli(["status"]);
      expect((status.body.controls as { name: string; available: boolean }[]).find(control => control.name === "carry-on"), JSON.stringify(status.body.controls)).toMatchObject({ available: true });
      // Without the acknowledgement the command starts nothing.
      expect((await cli(["carry-on", "--command-id", "held-carry-unreviewed", "--only-if-status-matches", String(status.body.status_token)])).code).toBe(0);
      await h.engine.commands.settled(); await h.engine.settled();
      expect(h.engine.commands.lookup("held-carry-unreviewed").operation).toMatchObject({ state: "failed", outcome: "message_review_required", effects: { session: "not_started" } });
      expect((h.engine.commands.lookup("uncertain-history").operation as Receipt).message?.reviewedAt).toBeUndefined();
      // With it, the acknowledgement is applied first and the carry-on runs: the phase was finished by hand, so it checks completion and starts nothing.
      const again = await cli(["status"]);
      const carried = await cli(["carry-on", "--message-reviewed", saved.id, "--command-id", "held-carry-reviewed", "--only-if-status-matches", String(again.body.status_token)]);
      expect(carried.code, JSON.stringify(carried.body)).toBe(0);
      await h.engine.commands.settled(); await h.engine.settled();
      expect(h.engine.commands.lookup("held-carry-reviewed").operation, JSON.stringify(h.engine.commands.lookup("held-carry-reviewed").operation)).toMatchObject({ state: "completed", outcome: "phase_already_complete" });
      expect((h.engine.commands.lookup("uncertain-history").operation as Receipt).message).toMatchObject({ delivery: "uncertain", reviewedAt: expect.any(String) });
      expect(h.engine.liveView()!.reviewRequired).toEqual([]);
      // The browser's /api/carry-on takes the acknowledgements the same way (reviewedReceiptIds).
      delete saved.message!.reviewedAt; h.engine.commands.checkpoint(saved);
      expect(h.engine.liveView()!.reviewRequired).toEqual([saved.id]);
      const response = await fetch(`${origin}/api/carry-on`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "X-Kiln-Status": h.engine.controlView().token, "X-Kiln-Command-Id": "held-carry-browser", "Content-Type": "application/json" }, body: JSON.stringify({ target: h.engine.phaseRecoveryTarget(), reviewedReceiptIds: [saved.id] }) });
      const browser = await response.json() as Record<string, unknown>;
      expect(browser, JSON.stringify(browser)).toMatchObject({ ok: true, outcome: "already_complete" });
      expect((h.engine.commands.lookup("uncertain-history").operation as Receipt).message?.reviewedAt).toEqual(expect.any(String));
      expect(h.claudeCalls()).toHaveLength(originalCalls);
    }, 120000);
    if (kind === "phase" && recovery === "takeover") it("advances from the carry-on's already-complete choice on a hold that can't be reopened, ending it without release (run restart AC-CARRY-06)", async () => {
      rmSync(historyFile); await reconcile();
      expect(h.engine.controlView().controls.find(c => c.name === "verify-and-advance")).toMatchObject({ available: false });
      const response = await fetch(`${origin}/api/carry-on`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "X-Kiln-Status": h.engine.controlView().token, "X-Kiln-Command-Id": "held-advance-carry", "Content-Type": "application/json" }, body: JSON.stringify({ target: h.engine.phaseRecoveryTarget() }) });
      expect(await response.json()).toMatchObject({ ok: true, outcome: "already_complete" });
      const advanced = await post("check-again", { target: h.engine.phaseRecoveryTarget(), intent: "advance" });
      expect(advanced.body, JSON.stringify(advanced)).toMatchObject({ outcome: "advanced" });
      await h.engine.settled();
      expect(h.engine.record.liveControl).toBeUndefined();
      expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeDefined();
      expect(h.claudeCalls()).toHaveLength(originalCalls);
    }, 120000);
    if (kind === "phase" && recovery === "takeover") it("keeps carry-on and the terminal copy buttons unavailable, saying why, while Claude is open on the conversation (run restart AC-CARRY-06)", async () => {
      const open = vi.spyOn(ownership, "requireNoTerminal").mockRejectedValue(new ownership.OwnershipError("terminal_in_use", "Exit Claude in your terminal before handing this conversation back to Kiln."));
      rmSync(historyFile); await reconcile();
      const hold = h.engine.record.liveControl!.takeover;
      expect(hold.history).toMatchObject({ state: "unavailable" });
      expect(hold.carryOnObstacle).toBe("Claude is open on this conversation in a terminal. Exit it first.");
      expect(buildSnapshot(h.engine).needsYou!.carryOn).toMatchObject({ available: false, reason: hold.carryOnObstacle });
      // kiln handoff gives no fresh-session instructions while Claude is open on the conversation.
      const handoff = await cli(["handoff"]);
      expect(handoff.body.data, JSON.stringify(handoff.body)).toMatchObject({ resume_command: null, fresh_session_instructions: null });
      page = await chrome.open(server!.address, { width: 1200, height: 1100 });
      await page.waitFor(`document.body.innerText.includes('Reply here and let Kiln carry on')`);
      expect(await page.evaluate(`${button(`Send reply & continue ${inSentence(h.engine.liveView()!.label)}`)}.disabled`)).toBe(true);
      expect(await page.evaluate(`Boolean(${button("Copy terminal command")})`)).toBe(false);
      expect(await page.evaluate<string>("document.body.innerText")).toContain("Claude is open on this conversation in a terminal. Exit it first.");
      // Once it exits, the next reconciliation clears the obstacle.
      open.mockRestore(); await reconcile();
      expect(h.engine.record.liveControl!.takeover.carryOnObstacle).toBeUndefined();
      expect(h.claudeCalls()).toHaveLength(originalCalls);
    }, 120000);
    if (kind === "phase" && recovery === "takeover") it("keeps today's wait text until the attempt ends, keeps carry-on unavailable while its work may still run, and Check again clears the card once the history is back (run restart AC-CARRY-06, AC-CARRY-02)", async () => {
      // The attempt hasn't ended: the hold keeps today's wait text, though the history is gone, and carry-on isn't offered.
      const running = vi.spyOn(ownership, "requireExited").mockRejectedValue(new ownership.OwnershipError("takeover_pending", "Waiting for the paused attempt to exit."));
      rmSync(historyFile); await reconcile();
      expect(h.engine.record.liveControl!.takeover).toMatchObject({ state: "pending", reason: "Waiting for the paused attempt to exit." });
      expect(h.engine.record.liveControl!.takeover.history).toBeUndefined();
      expect(buildSnapshot(h.engine).needsYou?.carryOn).toBeUndefined();
      page = await chrome.open(server!.address, { width: 1200, height: 1100 });
      await page.waitFor(`document.body.innerText.includes('Wait before opening Claude')`);
      let body = await page.evaluate<string>("document.body.innerText");
      expect(body).toContain("Waiting for the paused attempt to exit.");
      expect(body).not.toContain("Reply here and let Kiln carry on");
      await page.close(); page = undefined;
      const waiting = await cli(["status"]);
      expect((waiting.body.controls as { name: string; available: boolean }[]).find(control => control.name === "carry-on")).toMatchObject({ available: false });
      await cli(["carry-on", "--command-id", "held-carry-running", "--only-if-status-matches", String(waiting.body.status_token)]);
      await h.engine.commands.settled(); await h.engine.settled();
      expect(h.engine.commands.lookup("held-carry-running").operation, JSON.stringify(h.engine.commands.lookup("held-carry-running"))).toMatchObject({ state: expect.stringMatching(/^(refused|failed)$/), effects: { session: "not_started" } });
      expect(h.claudeCalls()).toHaveLength(originalCalls);

      // The attempt has ended, but Kiln can't confirm the work it started has: carry-on and the terminal card are unavailable, saying why.
      running.mockRestore();
      const work = vi.spyOn(ownedProcesses, "captureOwnedProcesses").mockRejectedValue(new Error("the process table can't be read"));
      await reconcile();
      const hold = h.engine.record.liveControl!.takeover;
      expect(hold).toMatchObject({ state: "pending", history: { state: "unavailable", reason: "missing" }, carryOnObstacle: "Kiln couldn't read the paused session's processes: the process table can't be read" });
      expect(buildSnapshot(h.engine).needsYou!.carryOn).toMatchObject({ available: false, reason: hold.carryOnObstacle });
      page = await chrome.open(server!.address, { width: 1200, height: 1100 });
      await page.waitFor(`document.body.innerText.includes('Reply here and let Kiln carry on')`);
      expect(await page.evaluate(`${button(`Send reply & continue ${inSentence(h.engine.liveView()!.label)}`)}.disabled`)).toBe(true);
      expect(await page.evaluate(`Boolean(${button("Copy terminal command")})`)).toBe(false);
      expect(await page.evaluate<string>("document.body.innerText")).toContain("Kiln couldn't read the paused session's processes: the process table can't be read");
      await page.close(); page = undefined;
      const blocked = await cli(["status"]);
      await cli(["carry-on", "--command-id", "held-carry-work", "--only-if-status-matches", String(blocked.body.status_token)]);
      await h.engine.commands.settled(); await h.engine.settled();
      expect(h.engine.commands.lookup("held-carry-work").operation).toMatchObject({ state: expect.stringMatching(/^(refused|failed)$/), effects: { session: "not_started" } });
      expect(h.claudeCalls()).toHaveLength(originalCalls);
      work.mockRestore(); await reconcile();
      expect(h.engine.record.liveControl!.takeover.carryOnObstacle).toBeUndefined();

      // The card names the reason from AC-CARRY-02's table; with the history back, Check again clears it.
      // Stop the once-a-second reconciliation so only the button can notice.
      clearInterval((h.engine as unknown as { takeoverTimer: NodeJS.Timeout }).takeoverTimer);
      page = await chrome.open(server!.address, { width: 1200, height: 1100 });
      await page.waitFor(`document.body.innerText.includes('Reply here and let Kiln carry on')`);
      body = await page.evaluate<string>("document.body.innerText");
      expect(body).toContain("Claude Code has no saved conversation for this session.");
      expect(await page.evaluate(`${button(`Send reply & continue ${inSentence(h.engine.liveView()!.label)}`)}.disabled`)).toBe(false);
      writeFileSync(historyFile, originalHistory);
      expect(h.engine.record.liveControl!.takeover.history).toBeDefined();
      await page.evaluate(`${button("Check again")}.click()`);
      await page.waitFor(`!document.body.innerText.includes('Reply here and let Kiln carry on')`);
      expect(h.engine.record.liveControl!.takeover.history).toBeUndefined();
      expect(h.engine.record.liveControl!.takeover.state).toBe("released");
      expect(h.claudeCalls()).toHaveLength(originalCalls);
    }, 120000);
    if (kind === "phase" && recovery === "delivery_recovery") it("shows the uncertain message above the cards, holds the button until it is acknowledged, and sends it on only if the reply includes it (run restart AC-CARRY-06)", async () => {
      rmSync(historyFile); await reconcile();
      expect(h.engine.record.liveControl!.takeover).toMatchObject({ state: "pending", history: { state: "unavailable", reason: "missing" } });
      const saved = h.engine.commands.lookup("uncertain-history").operation as Receipt;
      delete saved.message!.reviewedAt; h.engine.commands.checkpoint(saved);
      expect(h.engine.liveView()!.reviewRequired).toEqual([saved.id]);
      // Undo the hand finish, so the carry-on starts a session.
      git(h.sandbox, h.engine.worktreePath, "revert", "--no-edit", "HEAD"); git(h.sandbox, h.engine.worktreePath, "push", "-q", "origin", h.engine.record.settings.featureBranch);
      const scenario = JSON.parse(readFileSync(h.scenarioPath, "utf8")) as { sessions: unknown[] };
      scenario.sessions.push({ actions: [{ result: "Carried on." }, { exit: 0 }] });
      writeFileSync(h.scenarioPath, JSON.stringify(scenario));
      page = await chrome.open(server!.address, { width: 1200, height: 1100 });
      await page.waitFor(`document.body.innerText.includes('Reply here and let Kiln carry on') && document.body.innerText.includes('Inspect this exact uncertain instruction.')`);
      const send = button(`Send reply & continue ${inSentence(h.engine.liveView()!.label)}`);
      const acknowledge = button("I reviewed this message in the conversation");
      // The message and its acknowledgement come before both cards.
      expect(await page.evaluate(`(() => { const ack = ${acknowledge}; const carry = ${send}; const terminal = Array.from(document.querySelectorAll('h2,h3')).find(h => h.textContent.includes('Start a fresh session in your terminal')); return !!ack && !!carry && !!terminal && !!(ack.compareDocumentPosition(carry) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(ack.compareDocumentPosition(terminal) & Node.DOCUMENT_POSITION_FOLLOWING); })()`)).toBe(true);
      expect(await page.evaluate(`${send}.disabled`)).toBe(true);
      await page.evaluate(`${acknowledge}.click()`);
      await page.waitFor(`!${send}.disabled`);
      expect((h.engine.commands.lookup("uncertain-history").operation as Receipt).message?.reviewedAt).toEqual(expect.any(String));
      // A reply without the message: the new session is given the reply and not the uncertain message.
      await page.evaluate(`(() => { const box = document.querySelector('textarea'); box.value = 'Carry on from the review.'; box.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await page.evaluate(`${send}.click()`);
      await waitFor(() => h.claudeCalls().length === originalCalls + 1, 30000);
      await h.engine.settled();
      const prompt = h.claudeCalls().at(-1)!.prompt;
      expect(prompt).toContain("Carry on from the review.");
      expect(prompt).not.toContain("Inspect this exact uncertain instruction.");
      expect(h.engine.phaseSessions(target.activityKey).at(-1)!.startedAs).toBe("carry_on");
      expect(h.engine.record.liveControl).toBeUndefined();
    }, 120000);
    if (recovery === "takeover") it("rechecks history after the terminal ownership read before publishing release", async () => {
      const real = ownership.requireNoTerminal;
      let mutate = true;
      const fault = vi.spyOn(ownership, "requireNoTerminal").mockImplementation(async (...args) => {
        await real(...args);
        if (mutate) { mutate = false; writeFileSync(historyFile, "{}\n"); }
      });
      // An earlier periodic reconciliation may already have passed the wrapped
      // read. Observe this actual mutation, rather than assume the next call is new.
      await waitFor(async () => { await reconcile(); return !mutate; }, 10000);
      expect(mutate).toBe(false); assertHeld();
      fault.mockRestore(); writeFileSync(historyFile, originalHistory); await released();
      expect(h.engine.record.liveControl?.takeover.state).toBe("released");
      expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(originalCalls);
    });
    if (recovery === "takeover") it("rechecks history after the final terminal ownership read before accepting otherwise complete work", async () => {
      const real = ownership.requireNoTerminal;
      // Bind the otherwise nondeterministic history replacement to recordDone's
      // final synchronous material capture, after ordinary completion checks pass.
      const material = h.engine as unknown as { takeoverLocalMaterial(key: string): string };
      const capture = material.takeoverLocalMaterial.bind(h.engine);
      let armed = false; let changed = false;
      const captured = vi.spyOn(material, "takeoverLocalMaterial").mockImplementation(key => { const value = capture(key); armed = true; return value; });
      const race = vi.spyOn(ownership, "requireNoTerminal").mockImplementation(async (...args) => {
        await real(...args);
        if (armed && !changed) { changed = true; writeFileSync(historyFile, "{}\n"); }
      });
      proofStage = "awaiting final-acceptance history refusal";
      const refused = await post("check-again", { target: h.engine.phaseRecoveryTarget(), intent: "advance" });
      expect(changed).toBe(true); expect(refused.status, JSON.stringify(refused)).toBe(503);
      expect(refused.body.outcome).not.toBe("advanced");
      proofStage = "confirming the failed final return stays held";
      captured.mockRestore(); race.mockRestore(); await reconcile(); assertHeld();
      writeFileSync(historyFile, originalHistory); await released();
      expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined();
      proofStage = "awaiting restored explicit acceptance";
      const accepted = await post("check-again", { target: h.engine.phaseRecoveryTarget(), intent: "advance" });
      expect(accepted.body.outcome, JSON.stringify(accepted)).toBe("advanced"); proofStage = "settling restored explicit acceptance"; await h.engine.settled();
      expect(h.engine.record.liveControl).toBeUndefined(); expect(h.engine.record.pause.activeSince).toBeDefined(); expect(h.claudeCalls()).toHaveLength(originalCalls);
    // Both refusal and restored acceptance perform real completion/currentness
    // evaluation; the allowance covers this pair, not a product safety deadline.
    }, 120000);
  });
});
