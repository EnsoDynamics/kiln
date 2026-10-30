import { startFixtureController } from "../test-support/controller-server.js";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { writeSessionRecord } from "../state/records.js";
// Terminal readiness is certified on macOS; other runtimes explain unavailability.
// Real engine, journal, authenticated HTTP and disposable Git origins. Scripted provider
// cases complement scripts/proof-run/live-takeover.mjs's real Claude boundary proof.
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, chmodSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { git } from "../test-support/git-repositories.js";
import { isPortFree } from "../state/instance-lock.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { readGate, createGate, withGate, unsettled, observeGate } from "./gate.js";
import type { LiveTarget } from "./target.js";
let h: Harness; let server: LocalServer | undefined; let origin: string;
afterEach(async () => { vi.restoreAllMocks(); await server?.close(); server = undefined; await h?.cleanup(); });
async function setup(version = "2.1.311") {
  h = await createHarness({ sessions: [] });
  h.env.KILN_STANDIN_VERSION = version;
  const ready = join(h.sandbox.root, "ready"); const release = join(h.sandbox.root, "release");
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { waitForFile: release }, { result: "Yielded with unfinished work." }] }, { actions: [{ result: "Continued the same activity." }] }] }));
  await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => existsSync(ready));
  for (let port = 42030; port < 42050; port++) if (await isPortFree(port)) {
    origin = `http://127.0.0.1:${port}`;
    server = await startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token }); break;
  }
  return { release, target: h.engine.liveTarget()! };
}
async function waitForRelease(): Promise<void> {
  try { await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; }, 10000); }
  catch (error) { throw new Error(`Release obstacle: ${JSON.stringify(h.engine.record.liveControl?.takeover)}`, { cause: error }); }
}
async function post(path: string, body: unknown, token = h.engine.record.token) {
  const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
it.skipIf(process.platform !== "darwin")("holds before completion, deduplicates HTTP retries, preserves deferred pause, and refuses successor targets", async () => {
  const { release, target } = await setup(); expect(target).toBeDefined();
  expect((await post("live/take-over", { instructionId: "same.id-1", target }, "wrong")).status).toBe(403);
  expect((await post("live/take-over", { instructionId: "bad/id", target })).status).toBe(400);
  expect(h.engine.pause().ok).toBe(true);
  const accepted = await post("live/take-over", { instructionId: "same.id-1", target }); expect(accepted.status).toBe(202);
  expect(h.engine.record.liveControl?.takeover.state).toBe("pending");
  expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toBeUndefined();
  expect((await post("live/take-over", { instructionId: "same.id-1", target })).status).toBe(202);
  expect((await post("live/take-over", { instructionId: "late", target: { ...target, attemptId: "stale" } })).status).toBe(409);
  writeFileSync(release, "done"); await h.engine.settled(); await waitForRelease();
  expect(h.engine.record.liveControl?.takeover).toMatchObject({ state: "released", target });
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
  const view = buildSnapshot(h.engine); expect(view.feature.state).toBe("needs_you"); expect(view.needsYou?.resumeCommand).toContain(target.sessionId);
  // Pin the assembled snapshot and bot handoff, not just their quoting helper.
  const session = h.engine.latestSession("1")!; const originalFolder = session.workingDirectory;
  const folder = join(h.sandbox.root, "quoted folder with 'apostrophe\nand newline"); mkdirSync(folder);
  const bin = join(h.sandbox.root, "copy-command-bin"); mkdirSync(bin);
  const observed = join(h.sandbox.root, "copied-command.json");
  writeFileSync(join(bin, "claude"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.KILN_TEST_OUTPUT,JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));`, { mode: 0o755 });
  session.workingDirectory = folder; writeSessionRecord(h.stateDirectory, session);
  try {
    const copied = buildSnapshot(h.engine).needsYou!.resumeCommand!;
    const handoff = await (await fetch(`${origin}/api/control/v1/handoff`, { headers: { "X-Kiln-Token": h.engine.record.token } })).json() as { data: { resume_command: string; working_directory: string } };
    expect(handoff.data.resume_command).toBe(copied); expect(handoff.data.working_directory).toBe(folder);
    execFileSync("/bin/sh", ["-c", copied], { env: { ...h.env, PATH: `${bin}:${h.env.PATH}`, KILN_TEST_OUTPUT: observed } });
    expect(JSON.parse(readFileSync(observed, "utf8"))).toEqual({ cwd: folder, args: ["--resume", target.providerSessionId] });
  } finally { if (originalFolder === undefined) delete session.workingDirectory; else session.workingDirectory = originalFolder; writeSessionRecord(h.stateDirectory, session); }
  const recovery = view.needsYou!.phaseRecovery!.target;
  expect((await post("check-again", { target: recovery, intent: "verify" })).body.outcome).toBe("still_stopped");
  expect(h.engine.record.liveControl).toBeDefined();
  // Dirty work alone must allow continuing this same saved conversation.
  writeFileSync(join(h.engine.worktreePath, "unfinished.txt"), "unfinished");
  expect((await post("resume", { target: recovery })).body.outcome).toBe("resume_requested");
  await h.engine.settled();
  expect(h.engine.record.liveControl).toBeUndefined(); expect(h.engine.record.pause.requestedAt).toBeDefined();
  expect(h.claudeCalls()).toHaveLength(2); expect(h.claudeCalls()[1]!.args).toContain(target.sessionId);
});
it.skipIf(process.platform !== "darwin")("retains the hold over restart, does no automatic recovery, and verifies finished work before honoring the deferred pause", async () => {
  const { release, target } = await setup();
  await post("live/take-over", { instructionId: "restart", target });
  writeFileSync(release, "done"); await h.engine.settled();
  await server!.close(); server = undefined;
  h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect((await h.engine.decide()).kind).toBe("needs_you"); expect(h.claudeCalls()).toHaveLength(1);
  const path = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
  git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md");
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: finish takeover work");
  git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  const recovery = h.engine.phaseRecoveryTarget()!;
  expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: true, outcome: "already_complete" });
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
  h.engine.record.pause.requestedAt = new Date().toISOString();
  expect(await h.engine.checkAgain({ target: recovery, intent: "advance" })).toMatchObject({ ok: true, outcome: "advanced" });
  await h.engine.settled(); expect(h.engine.record.pause.activeSince).toBeDefined(); expect(h.engine.record.liveControl).toBeUndefined();
  expect(h.claudeCalls()).toHaveLength(1);
});
it("preserves unresolved task evidence across reused task identifiers", async () => {
  h = await createHarness({ sessions: [] }); const directory = join(h.sandbox.root, "gate");
  const target: LiveTarget = { executionId: "e", activityId: "a", activityKey: "1", sessionId: "s", providerSessionId: "s", attemptId: "t" }; createGate(directory, target);
  await withGate(directory, state => { state.operations.tool = { name: "Agent", admittedAt: new Date().toISOString(), hookSettled: true, response: { agentId: "agent", status: "async_launched" } }; state.held = { instructionId: "i", operationId: "o", requestedAt: new Date().toISOString() }; });
  await observeGate(directory, { type: "system", subtype: "task_started", task_id: "agent", run_id: "run1", tool_use_id: "tool" }, new Date().toISOString());
  await observeGate(directory, { type: "system", subtype: "task_notification", task_id: "agent", run_id: "run0", tool_use_id: "tool", status: "completed" }, new Date().toISOString());
  expect(unsettled(readGate(directory))).toContain("task agent:run1");
  await observeGate(directory, { type: "system", subtype: "task_notification", task_id: "agent", run_id: "run1", tool_use_id: "tool", status: "completed" }, new Date().toISOString());
  expect(unsettled(readGate(directory))).toEqual([]);
});

describe.skipIf(process.platform !== "darwin").each([{ kind: "delivery_audit", handBack: "resume" }, { kind: "test_audit", handBack: "resume" }, { kind: "delivery_audit", handBack: "verify" }, { kind: "test_audit", handBack: "verify" }] as const)("assigned $kind return via $handBack", ({ kind, handBack }) => {
  let release: string;
  let releaseLock: (() => void) | undefined;
  // Prior-audit setup has its own unchanged hook limit, as in the recovery matrices below.
  beforeEach(async () => {
  const files = {
    "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
    "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
    "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
    "value.mjs": "export const value = () => 42;\n",
    "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
  };
  h = await createHarness({ folder: "proof", files, sessions: [], auditCycles: true });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
  git(h.sandbox, h.repository, "add", ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test(audit): ignore transient proof requests"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  const lock = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit proof", token: h.engine.record.token }); server = lock.server; releaseLock = lock.release;
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "audit-ready"); release = join(h.sandbox.root, "audit-release");
    const ordinary = { actions: [{ auditReport: {} }, { result: "Audit recorded." }] };
    const paused = { actions: [{ touch: ready }, { waitForFile: release }, ...(handBack === "verify" ? [{ auditReport: {} }] : []), { result: "Audit stopped." }] };
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [], auditSessions: kind === "delivery_audit" ? [paused, ordinary] : [ordinary, paused, ordinary] }));
    origin = `http://127.0.0.1:${lock.port}`;
    await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready), 30000);
  });
  afterEach(() => { releaseLock?.(); });
  it("holds and returns the assigned round without a phase Closed line", async () => {
    const target = h.engine.liveTarget()!; const audit = h.engine.auditActivity(target.activityKey)!;
    expect(audit.kind).toBe(kind);
    expect((await post("live/take-over", { instructionId: "audit-takeover", target })).status).toBe(202);
    writeFileSync(release, "done"); await h.engine.settled(); await waitForRelease();
    const recovery = h.engine.phaseRecoveryTarget()!;
    expect(recovery.live).toEqual(target);
    if (handBack === "verify") {
      const report = join(h.engine.worktreePath, audit.reportPath); const original = readFileSync(report, "utf8");
      writeFileSync(report, `${original}\n`);
      expect(await h.engine.checkAgain({ target: recovery, intent: "verify" })).toMatchObject({ ok: true, outcome: "still_stopped" });
      expect(h.engine.record.phases[target.activityKey]!.stop!.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Audit evidence is current", passed: false })]));
      expect(h.engine.record.liveControl).toBeDefined();
      writeFileSync(report, original);
      h.engine.record.pause.requestedAt = new Date().toISOString();
      expect(await h.engine.checkAgain({ target: recovery, intent: "verify" })).toMatchObject({ ok: true, outcome: "advanced" });
      await h.engine.settled();
      expect(h.engine.latestSession(target.activityKey)!.runs).toHaveLength(1);
      expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeDefined();
      expect(h.engine.record.pause.activeSince).toBeDefined(); expect(h.engine.record.liveControl).toBeUndefined();
      return;
    }
    expect(await h.engine.checkAgain({ target: recovery, intent: "verify" })).toMatchObject({ ok: true, outcome: "still_stopped" });
    expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined();
    h.engine.record.pause.requestedAt = new Date().toISOString();
    expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: true, outcome: "resume_requested" });
    await h.engine.settled();
    expect(h.engine.record.liveControl).toBeUndefined();
    expect(h.engine.auditActivity(target.activityKey)!.activityId).toBe(audit.activityId);
    expect(h.engine.auditActivity(target.activityKey)!.round).toBe(audit.round);
    expect(h.engine.latestSession(target.activityKey)!.runs).toHaveLength(2);
    expect(h.engine.record.phases[target.activityKey]!.doneAt, JSON.stringify(h.engine.record.phases[target.activityKey])).toBeDefined();
    expect(h.engine.record.pause.activeSince).toBeDefined();
  });
});

it.skipIf(process.platform !== "darwin")("replays durable completion evidence after restart and rejects completion changed during final ownership checks", async () => {
  const { release, target } = await setup();
  await post("live/take-over", { instructionId: "material-race", target });
  writeFileSync(release, "done"); await h.engine.settled();
  const session = h.engine.latestSession("1")!; const run = session.runs.at(-1)!;
  // Deterministic crash-window injection: the provider record is durable, but its
  // projection into the gate was not applied. Real wire shape is exercised by the CLI proof.
  const { appendJsonLine } = await import("../state/state-files.js");
  const { sessionFiles } = await import("../session/claude-session.js");
  await withGate(run.live!.gateDirectory, state => { state.operations.saved = { name: "Read", admittedAt: run.startedAt, hookSettled: true }; });
  appendJsonLine(sessionFiles(h.stateDirectory, session).events, { at: run.endedAt, event: { type: "user", session_id: session.sessionId, message: { content: [{ type: "tool_result", tool_use_id: "saved", content: "read finished" }] } } });
  await h.engine.reconcileTakeover();
  expect(unsettled(readGate(run.live!.gateDirectory))).toEqual([]);
  expect(h.engine.record.liveControl!.takeover.state).toBe("released");
  const phase = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
  writeFileSync(phase, readFileSync(phase, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
  git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md"); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: finish phase"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  const ownership = await import("./ownership.js"); const real = ownership.requireNoTerminal;
  const material = h.engine as unknown as { takeoverLocalMaterial(key: string): string };
  const capture = material.takeoverLocalMaterial.bind(h.engine); let armed = false; let changed = false;
  // Periodic reconciliation also reads terminal ownership. Bind this mutation to
  // the final acceptance snapshot, not an ordinal that the timer can consume.
  const captured = vi.spyOn(material, "takeoverLocalMaterial").mockImplementation(key => { const value = capture(key); if (!changed) armed = true; return value; });
  const race = vi.spyOn(ownership, "requireNoTerminal").mockImplementation(async (...args) => {
    await real(...args);
    if (armed && !changed) { changed = true; writeFileSync(join(h.engine.worktreePath, "changed-during-ownership.txt"), "completion is no longer current"); }
  });
  const answer = await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget()!, intent: "advance" });
  expect(changed).toBe(true);
  expect(answer, JSON.stringify(answer)).toMatchObject({ ok: false, code: "check_unavailable" });
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.engine.record.liveControl).toBeDefined();
  race.mockRestore(); captured.mockRestore();
});

it.skipIf(process.platform !== "darwin")("refuses unreadable registry ownership and preserves the hold until recovery succeeds", async () => {
  const { release, target } = await setup(); await post("live/take-over", { instructionId: "ownership-error", target });
  writeFileSync(release, "done"); await h.engine.settled();
  const registry = join(h.env.CLAUDE_CONFIG_DIR!, "sessions", "broken.json");
  writeFileSync(registry, "{"); await h.engine.reconcileTakeover();
  expect(h.engine.record.liveControl!.takeover.state).toBe("pending");
  expect(buildSnapshot(h.engine).needsYou!.resumeCommand).toBeUndefined();
  expect(h.claudeCalls()).toHaveLength(1);
  const { unlinkSync } = await import("node:fs"); unlinkSync(registry);
  await waitForRelease(); expect(h.engine.record.liveControl!.takeover.state).toBe("released");
});

it.skipIf(process.platform !== "darwin")("returns an explicit already-complete choice when work finishes during billing preparation", async () => {
  const { release, target } = await setup(); await post("live/take-over", { instructionId: "late-complete", target });
  writeFileSync(release, "done"); await h.engine.settled(); await waitForRelease();
  const billing = h.engine.billing.refresh.bind(h.engine.billing);
  const preflight = vi.spyOn(h.engine.billing, "refresh").mockImplementationOnce(async (...args) => {
    const phase = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
    writeFileSync(phase, readFileSync(phase, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
    git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md"); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: complete during preflight"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
    return billing(...args);
  });
  const answer = await post("resume", { instructionId: "late-resume", target });
  expect(answer.body.outcome).toBe("already_complete");
  expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.engine.record.liveControl).toBeDefined();
  preflight.mockRestore();
});

it.skipIf(process.platform !== "darwin")("withholds terminal readiness for a real tracked child until its natural exit and for missing history", async () => {
  const { release, target } = await setup(); await post("live/take-over", { instructionId: "tracked-child", target });
  const { spawn } = await import("node:child_process"); const { processStartTime } = await import("../platform/process-start-time.js");
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0));"], { stdio: ["pipe", "ignore", "ignore"] });
  const exit = once(child, "exit");
  const session = h.engine.latestSession("1")!; const directory = session.runs.at(-1)!.live!.gateDirectory;
  const startTime = await processStartTime(child.pid!); expect(startTime).toBeDefined();
  await withGate(directory, state => { state.tracked.push({ pid: child.pid!, startTime: startTime! }); });
  try {
    writeFileSync(release, "done"); await h.engine.settled(); await h.engine.reconcileTakeover();
    expect(h.engine.record.liveControl!.takeover.state).toBe("pending"); expect(buildSnapshot(h.engine).needsYou!.resumeCommand).toBeUndefined();
    expect(await processStartTime(child.pid!)).toBe(startTime); // no signal was used to speed release
    child.stdin!.end(); expect((await exit)[0]).toBe(0);
    await waitForRelease(); expect(h.engine.record.liveControl!.takeover.state).toBe("released");
    const { findTranscripts } = await import("../session/transcripts.js"); const { renameSync } = await import("node:fs");
    const history = findTranscripts(h.env.CLAUDE_CONFIG_DIR!, target.sessionId).main!;
    renameSync(history, `${history}.unavailable`);
    try { await h.engine.reconcileTakeover(); expect(h.engine.record.liveControl!.takeover.state).toBe("pending"); expect(h.engine.record.liveControl!.takeover.reason).toContain("missing or unreadable"); expect(buildSnapshot(h.engine).needsYou!.resumeCommand).toBeUndefined(); }
    finally { renameSync(`${history}.unavailable`, history); }
    await waitForRelease(); expect(h.engine.record.liveControl!.takeover.state).toBe("released");
  } finally { child.stdin!.end(); await exit; }
});

it.skipIf(process.platform !== "darwin").each(["complete", "terminal"] as const)("revalidates %s at the new process's first-prompt boundary without submitting input", async change => {
  const { release, target } = await setup(); await post("live/take-over", { instructionId: "first-prompt", target });
  writeFileSync(release, "done"); await h.engine.settled(); await waitForRelease();
  const ownership = await import("./ownership.js"); const real = ownership.requireNoTerminal;
  let changed = false;
  const injected = vi.spyOn(ownership, "requireNoTerminal").mockImplementation(async (...args) => {
    await real(...args); if (!args[2] || changed) return; changed = true;
    if (change === "terminal") throw new ownership.OwnershipError("terminal_in_use", "A terminal appeared before the first prompt.");
    const phase = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
    writeFileSync(phase, readFileSync(phase, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
    git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md"); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: complete at prompt admission"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  });
  const answer = await post("resume", { instructionId: "first-prompt-resume", target });
  expect(changed).toBe(true);
  if (change === "complete") expect(answer.body.outcome).toBe("already_complete");
  else { expect(answer.status).toBe(409); expect(answer.body.code).toBe("terminal_in_use"); }
  expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.latestSession("1")!.runs.at(-1)!.control!.submitted).not.toBe(true);
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.engine.record.liveControl).toBeDefined();
  injected.mockRestore();
});

it.skipIf(process.platform !== "darwin")("explains unsupported new CLI profiles and refuses checkpoint takeover before any hold", async () => {
  const { release, target } = await setup("2.1.999");
  expect(h.engine.liveView()).toMatchObject({ available: false }); expect(h.engine.liveView()!.reason).toContain("unavailable");
  expect((await post("live/take-over", { instructionId: "unsupported", target })).status).toBe(409);
  expect(h.engine.record.liveControl).toBeUndefined();
  writeFileSync(release, "done"); await h.engine.settled();
});

it.skipIf(process.platform !== "darwin")("keeps an accepted takeover through actual controller death while the old operation remains running", async () => {
  h = await createHarness({ sessions: [] }); h.engine.close(); h.env.KILN_STANDIN_VERSION = "2.1.311";
  // The provider must survive the killed controller, but not its owning test worker.
  h.env.KILN_STANDIN_OWNER_PID = String(process.pid);
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "crash-operation-ready"); const release = join(h.sandbox.root, "crash-operation-release");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { waitForFile: release }, { result: "Operation finished after controller death." }] }] }));
  const { spawn } = await import("node:child_process"); const { fileURLToPath } = await import("node:url");
  const { isProcessLive } = await import("../platform/process-start-time.js");
  const port = 42061;
  const optionsPath = join(h.sandbox.root, "controller-options.json");
  writeFileSync(optionsPath, JSON.stringify({ paths: h.engine.paths, tools: h.tools, record: h.engine.record, stateDirectory: h.stateDirectory, prdTree: git(h.sandbox, h.repository, "rev-parse", "HEAD:docs/prds/customer-returns").trim() }), { mode: 0o600 });
  const enginePath = fileURLToPath(new URL("../../dist/engine/engine.js", import.meta.url)); const serverPath = fileURLToPath(new URL("../../dist/server/local-server.js", import.meta.url));
  const code = `import{readFileSync}from'node:fs';import{Engine}from${JSON.stringify(enginePath)};import{startLocalServer}from${JSON.stringify(serverPath)};const options=JSON.parse(readFileSync(process.argv[1],'utf8'));const engine=new Engine({...options,env:process.env,sleepReader:{next:async()=>[]}});await engine.agents.refresh();await startLocalServer({engine,port:${port},folderName:'customer-returns',featureName:'Crash proof',token:engine.record.token});const result=await engine.start({refinementConfirmed:true});if(!result.ok)throw new Error(JSON.stringify(result));`;
  const controller = spawn(process.execPath, ["--input-type=module", "-e", code, optionsPath], { env: h.env, stdio: ["ignore", "pipe", "pipe"] }); const exited = once(controller, "exit");
  let diagnostic = ""; controller.stderr!.on("data", chunk => { diagnostic += String(chunk); });
  try {
    await waitFor(() => { if (controller.exitCode !== null) throw new Error(diagnostic || `Controller exited ${controller.exitCode}`); return existsSync(ready); }, 30000);
    origin = `http://127.0.0.1:${port}`;
    const { readPrdRecord } = await import("../state/records.js");
    const onDisk = readPrdRecord(h.stateDirectory)!;
    const key = onDisk.activities!.find(a => a.kind === "implementation")!.key;
    const session = h.engine.sessionRecord(key, onDisk.phases[key]!.sessionIds.at(-1)!)!; const run = session.runs.at(-1)!;
    const target: LiveTarget = { executionId: onDisk.executionId!, activityId: onDisk.activities!.find(a => a.key === key)!.activityId, activityKey: key, sessionId: session.sessionId, providerSessionId: session.sessionId, attemptId: run.live!.attemptId };
    expect((await post("live/take-over", { instructionId: "controller-crash", target })).status).toBe(202);
    // Select a recoverable crash boundary. An ownerless mkdir is intentionally
    // unidentifiable and must stay held; gate-process tests prove that other boundary.
    const { execFileSync } = await import("node:child_process");
    await waitFor(async () => {
      controller.kill("SIGSTOP");
      await waitFor(() => execFileSync("/bin/ps", ["-o", "state=", "-p", String(controller.pid)], { encoding: "utf8" }).trim().startsWith("T"), 5000);
      const lock = join(run.live!.gateDirectory, "admission.lock");
      if (!existsSync(lock) || existsSync(join(lock, "owner.json"))) return true;
      controller.kill("SIGCONT");
      await new Promise(resolve => setTimeout(resolve, 25));
      return false;
    }, 10000);
    controller.kill("SIGKILL"); await exited;
    h.engine = h.reopenFromDisk(); await h.engine.prepare();
    expect((await h.engine.decide()).kind).toBe("needs_you"); await h.engine.continue();
    expect(await isProcessLive(run.pid!, run.processStartTime)).toBe(true);
    expect(h.engine.record.liveControl!.takeover.state).toBe("pending"); expect(h.claudeCalls()).toHaveLength(1);
    writeFileSync(release, "finish naturally"); await waitFor(async () => !await isProcessLive(run.pid!, run.processStartTime));
    await waitForRelease(); expect(h.engine.record.liveControl!.takeover.state, h.engine.record.liveControl!.takeover.reason).toBe("released");
    expect(h.engine.record.phases[key]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
  } finally { if (controller.exitCode === null && controller.signalCode === null) controller.kill("SIGKILL"); await exited; }
});

it.skipIf(process.platform !== "darwin")("explains a known finished exact takeover target without asserting that unknown or unfinished targets finished", async () => {
  const { release, target } = await setup();
  const phase = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
  writeFileSync(phase, readFileSync(phase, "utf8").replace("\n", "\n\n**Closed:** 2026-10-28\n"));
  git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md"); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: finish first activity"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  writeFileSync(release, "finish"); await h.engine.settled();
  expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  for (const versioned of [false, true]) {
    const id = `finished-${versioned}`;
    const response = versioned ? await post("control/v1/commands", { command_id: id, execution_id: target.executionId, status_token: h.engine.controlView().token, action: "take_over", inputs: { target } }) : await post("live/take-over", { instructionId: id, target });
    expect(response.status).toBe(409);
    const receipt = h.engine.commands.lookup(id).operation;
    expect(receipt).toMatchObject({ state: "refused", reason: "The targeted activity finished before takeover was accepted. Its successor was not paused." });
  }
  await post("live/take-over", { instructionId: "unknown-finished", target: { ...target, activityId: "unknown" } });
  expect(h.engine.commands.lookup("unknown-finished").operation).toMatchObject({ state: "refused", reason: "The observed execution or control state changed. Refresh status." });
  expect(h.engine.record.liveControl).toBeUndefined();
});

describe.skipIf(process.platform !== "darwin").each([{ kind: "delivery_audit", handBack: "resume" }, { kind: "test_audit", handBack: "resume" }, { kind: "delivery_audit", handBack: "verify" }, { kind: "test_audit", handBack: "verify" }] as const)("unavailable $kind sources through $handBack", ({ kind, handBack }) => {
  let target: LiveTarget;
  let audit: NonNullable<ReturnType<Harness["engine"]["auditActivity"]>>;
  let recovery: NonNullable<ReturnType<Harness["engine"]["phaseRecoveryTarget"]>>;
  let releaseLock: (() => void) | undefined;
  // Preparing the prior real audit is a prerequisite, not part of the unchanged
  // 60-second source-error recovery check. Hook timeout remains unchanged too.
  beforeEach(async () => {
  const files = {
    "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
    "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
    "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
    "value.mjs": "export const value = () => 42;\n",
    "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
  };
  h = await createHarness({ folder: "proof", files, sessions: [], auditCycles: true });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
  git(h.sandbox, h.repository, "add", ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test(audit): ignore transient proof requests"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  const lock = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit proof", token: h.engine.record.token }); server = lock.server; releaseLock = lock.release;
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "audit-ready"); const release = join(h.sandbox.root, "audit-release");
    const ordinary = { actions: [{ auditReport: {} }, { result: "Audit recorded." }] };
    const paused = { actions: [{ touch: ready }, { waitForFile: release }, ...(handBack === "verify" ? [{ auditReport: {} }] : []), { result: "Audit stopped." }] };
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [], auditSessions: kind === "delivery_audit" ? [paused, ordinary] : [ordinary, paused, ordinary] }));
    origin = `http://127.0.0.1:${lock.port}`;
    await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready), 30000);
    target = h.engine.liveTarget()!; audit = h.engine.auditActivity(target.activityKey)!;
    expect(audit.kind).toBe(kind);
    expect((await post("live/take-over", { instructionId: "audit-takeover", target })).status).toBe(202);
    writeFileSync(release, "done"); await h.engine.settled(); await waitForRelease();
    recovery = h.engine.phaseRecoveryTarget()!;
    expect(recovery.live).toEqual(target);
  });
  afterEach(() => { releaseLock?.(); });
  it("retains dated checks and never dispatches on unavailable sources", async () => {
    // Preserve a dated prior failure on every source/check error. Exercise both
    // browser and versioned bot admission; these faults must never dispatch Resume.
    const originalReport = join(h.engine.worktreePath, audit.reportPath);
    const originalBytes = existsSync(originalReport) ? readFileSync(originalReport, "utf8") : undefined;
    if (originalBytes) writeFileSync(originalReport, `${originalBytes}\n`);
    expect(await h.engine.checkAgain({ target: recovery, intent: "verify" })).toMatchObject({ ok: true, outcome: "still_stopped" });
    if (originalBytes) writeFileSync(originalReport, originalBytes);
    const prior = structuredClone(h.engine.record.phases[target.activityKey]!.stop!);
    const beforeCalls = h.claudeCalls().length;
    const admission = await import("../audit/admission.js");
    const workflow = await import("../audit/workflow.js");
    const development = await import("../engine/development-delivery.js");
    const reportFile = join(h.engine.worktreePath, audit.reportPath);
    const hadReport = existsSync(reportFile); const reportBytes = hadReport ? readFileSync(reportFile) : undefined;
    const faults = ["plan", "report", "provider", "retained-refusal", ...(audit.acceptedResult ? ["private-result"] : []), "development"];
    for (const [index, fault] of faults.entries()) {
      let restore: () => void;
      if (fault === "plan") {
        const directory = join(h.engine.worktreePath, h.engine.record.prdDirectory);
        renameSync(directory, `${directory}.unavailable`); restore = () => renameSync(`${directory}.unavailable`, directory);
      } else if (fault === "report") {
        if (hadReport) chmodSync(reportFile, 0);
        else { symlinkSync(reportFile, reportFile); }
        restore = () => { if (hadReport) chmodSync(reportFile, 0o644); else rmSync(reportFile); };
      } else if (fault === "private-result") {
        const privateFile = join(h.stateDirectory, "audit-evidence", `${audit.acceptedResult}.json`);
        chmodSync(privateFile, 0); restore = () => chmodSync(privateFile, 0o600);
      } else if (fault === "development") {
        h.engine.record.developmentAuthorization = { enabled: true, revision: 0, grants: [] };
        const spy = vi.spyOn(development, "reconcileDelivery").mockImplementation(async context => { development.ledger(context.record).sourceUnavailable = true; development.ledger(context.record).lastReadError = "Development source read unavailable"; });
        restore = () => { spy.mockRestore(); delete h.engine.record.developmentAuthorization; };
      } else if (audit.acceptedResult) {
        const realAccepted = workflow.acceptedAudit;
        const spy = vi.spyOn(workflow, "acceptedAudit").mockImplementation((directory, selected) => { if (selected.activityId === audit.activityId) throw new Error("Private audit source read unavailable"); return realAccepted(directory, selected); }); restore = () => { spy.mockRestore(); };
      } else {
        const spy = vi.spyOn(admission, "submitAudit").mockImplementation(async () => {
          if (fault === "provider") throw new Error("Provider evidence read unavailable");
          return { checks: [{ name: "evidence_unavailable", passed: false, facts: ["Evidence source unavailable"] }], refusal: { code: "evidence_unavailable", status: 503, reason: "Evidence source unavailable", criteria: [] } } as unknown as Awaited<ReturnType<typeof admission.submitAudit>>;
        }); restore = () => { spy.mockRestore(); };
      }
      try {
        if (index % 2 === 0) {
          const response = await post(handBack === "resume" ? "resume" : "check-again", { target: recovery, ...(handBack === "verify" ? { intent: "verify" } : {}) });
          expect(response.status, `${fault}: ${JSON.stringify(response.body)}`).toBe(503); expect(response.body.code, fault).toBe("check_unavailable");
        } else {
          const command = `audit-source-${index}`;
          await post("control/v1/commands", { command_id: command, execution_id: target.executionId, status_token: h.engine.controlView().token, action: handBack === "resume" ? "resume" : "verify-and-advance", inputs: { live_target: target } });
          await h.engine.commands.settled();
          expect(h.engine.commands.lookup(command).operation, fault).toMatchObject({ state: "failed", outcome: "check_unavailable" });
        }
        expect(h.engine.record.phases[target.activityKey]!.stop!.checks, fault).toEqual(prior.checks);
        expect(h.engine.record.phases[target.activityKey]!.stop!.checkedAt, fault).toBe(prior.checkedAt);
        expect(buildSnapshot(h.engine).needsYou?.phaseRecovery?.checkError?.reason, fault).toBeTruthy();
        expect(h.engine.record.liveControl, fault).toBeDefined(); expect(h.claudeCalls(), fault).toHaveLength(beforeCalls);
      } finally { restore(); }
    }
    if (reportBytes) expect(readFileSync(reportFile)).toEqual(reportBytes);
  });
});

it.skipIf(process.platform !== "darwin").each(["delivery_audit", "test_audit"] as const)("holds an unaccounted message after final observation failure despite passing %s evidence", async (kind) => {
  const files = {
    "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
    "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
    "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
    "value.mjs": "export const value = () => 42;\n",
    "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
  };
  h = await createHarness({ folder: "proof", files, sessions: [], auditCycles: true });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
  git(h.sandbox, h.repository, "add", ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test(audit): ignore transient proof requests"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  const lock = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit proof", token: h.engine.record.token }); server = lock.server;
  try {
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "audit-ready"); const release = join(h.sandbox.root, "audit-release");
    const ordinary = { actions: [{ auditReport: {} }, { result: "Audit recorded." }] };
    const paused = { actions: [{ touch: ready }, { liveMessages: 1, uncorrelated: true }, { waitForFile: release }, { auditReport: {} }, { rawEvent: { type: "result", subtype: "success", is_error: false, result: "Audit finished." } }, { exitNow: 0 }] };
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [], auditSessions: kind === "delivery_audit" ? [paused, ordinary] : [ordinary, paused, ordinary] }));
    origin = `http://127.0.0.1:${lock.port}`;
    await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready), 30000);
    await waitFor(() => h.engine.liveView()?.input?.available === true);
    await h.engine.commands.settled();
    await waitFor(() => h.engine.controlView().controls.find(c => c.name === "message")?.available === true);
    const target = h.engine.liveTarget()!;
    const command = "audit-final-input";
    const sent = kind === "delivery_audit"
      ? await post("live/message", { instructionId: command, target, text: "  unresolved audit input\n" })
      : await post("control/v1/commands", { command_id: command, execution_id: target.executionId, status_token: h.engine.controlView().token, action: "message", inputs: { target, text: "  unresolved audit input\n" } });
    expect(sent.status, JSON.stringify(sent.body)).toBe(202);
    await h.engine.commands.settled();
    expect(h.engine.commands.lookup(command).operation).toMatchObject({ message: { delivery: "submitted" } });
    const gateModule = await import("./gate.js"); const observe = gateModule.observeGate;
    vi.spyOn(gateModule, "observeGate").mockImplementation(async (...args) => { if (args[1].type === "result") throw new Error("Final audit gate observation failed"); return observe(...args); });
    writeFileSync(release, "finish audit"); await h.engine.settled();
    expect(h.engine.commands.lookup(command).operation).toMatchObject({ message: { delivery: "uncertain", text: "  unresolved audit input\n" } });
    expect(h.engine.record.liveControl).toBeDefined(); expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined();
    vi.restoreAllMocks(); await waitForRelease();
    const recovery = h.engine.phaseRecoveryTarget()!;
    expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: false, code: "message_review_required" });
    expect(h.engine.reviewMessages(target, [command])).toMatchObject({ ok: true });
    expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: true, outcome: "already_complete" });
    expect(h.engine.record.liveControl).toBeDefined(); expect(h.engine.auditActivity(target.activityKey)!.round).toBe(1);
  } finally { lock.release(); }
});

describe.skipIf(process.platform !== "darwin").each(["delivery_audit", "test_audit"] as const)("cross-event %s recovery", kind => {
  let target: LiveTarget;
  let release: string;
  let serve: () => Promise<void>;
  let releaseLock: (() => void) | undefined;
  // Keep real prerequisite audit preparation outside the original functional deadline.
  beforeEach(async () => {
  h = await createHarness({ folder: "proof", auditCycles: true, sessions: [], files: {
    "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
    "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
    "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
    "value.mjs": "export const value = () => 42;\n",
    "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
  } });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
  git(h.sandbox, h.repository, "add", ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test(audit): ignore proof requests"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  let port = 0;
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "chronology-ready"); release = join(h.sandbox.root, "chronology-release");
    const ordinary = { actions: [{ auditReport: {} }, { result: "Audit recorded." }] };
    const reversed = { actions: [{ touch: ready }, { waitForFile: release }, { auditReport: {} }, { liveMessages: 2, consumptionEvents: [{ type: "result", indices: [1] }, { type: "result", indices: [0] }], exitAfter: true }] };
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [], auditSessions: kind === "delivery_audit" ? [reversed, ordinary] : [ordinary, reversed, ordinary] }));
    serve = async () => { const hosted = await startFixtureController({ engine: h.engine, port, folderName: "proof", featureName: "Audit proof", token: h.engine.record.token }); server = hosted.server; port = hosted.port; releaseLock = hosted.release; origin = new URL(server.address).origin; };
    await serve(); await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready), 30000);
    await waitFor(() => h.engine.liveView()?.input?.available === true);
    await h.engine.commands.settled();
    target = h.engine.liveTarget()!;
  });
  afterEach(() => { releaseLock?.(); });
  it("retains uncertainty and original audit identity through browser/bot review and explicit return", async () => {
    const commands: Record<string, unknown>[] = [];
    expect(h.engine.pause().ok).toBe(true);
    for (const id of ["audit-A", "audit-B"]) {
      await waitFor(() => h.engine.controlView().controls.find(c => c.name === "message")?.available === true);
      const command = { command_id: id, execution_id: target.executionId, status_token: h.engine.controlView().token, action: "message", inputs: { target, text: `  exact ${id}\n` } }; commands.push(command);
      const sent = await post(kind === "delivery_audit" ? "live/message" : "control/v1/commands", kind === "delivery_audit" ? { instructionId: id, target, text: `  exact ${id}\n` } : command);
      expect(sent.status, JSON.stringify(sent.body)).toBe(202);
      await h.engine.commands.settled();
    }
    writeFileSync(release, "emit B then A"); await h.engine.settled(); await waitForRelease();
    await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare(); await serve(); await waitForRelease();
    for (const id of ["audit-A", "audit-B"]) expect(h.engine.commands.lookup(id).operation).toMatchObject({ live_target: target, message: { delivery: "uncertain", text: `  exact ${id}\n`, resultAt: expect.any(String) }, effects: { message: "unknown", session: "not_started", plan: "not_advanced" } });
    expect(h.engine.auditActivity(target.activityKey)).toMatchObject({ kind, round: 1 });
    expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined();
    const calls = h.claudeCalls().length;
    const recovery = h.engine.phaseRecoveryTarget()!;
    expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: false, code: "message_review_required" });
    expect(h.engine.reviewMessages(target, ["audit-A"]).ok).toBe(true);
    expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: false, code: "message_review_required" });
    if (kind === "test_audit") { const retry = await post("control/v1/commands", commands[1]); expect(retry.status).toBe(503); expect(retry.body.operation).toMatchObject({ id: (h.engine.commands.lookup("audit-B").operation as { id: string }).id }); }
    expect(h.engine.reviewMessages(target, ["audit-B"]).ok).toBe(true);
    expect(h.engine.record.liveControl).toBeDefined(); expect(h.claudeCalls()).toHaveLength(calls);
    expect(await h.engine.resume({ target: recovery })).toMatchObject({ ok: true, outcome: "already_complete" });
    expect(await h.engine.checkAgain({ target: recovery, intent: "advance" })).toMatchObject({ ok: true, outcome: "advanced" });
    await h.engine.settled(); expect(h.engine.record.liveControl).toBeUndefined(); expect(h.engine.record.pause.activeSince).toBeDefined();
    for (const id of ["audit-A", "audit-B"]) expect(h.engine.commands.lookup(id).operation).toMatchObject({ message: { delivery: "uncertain", reviewedAt: expect.any(String), resolvedBy: expect.any(String) } });
    expect(h.claudeCalls()).toHaveLength(calls);
    h.engine = h.reopenFromDisk(); await h.engine.prepare(); expect(h.engine.record.liveControl).toBeUndefined();
  });
});
