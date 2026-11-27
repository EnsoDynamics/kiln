// Preparation execution: a preparation conversation's live processes (Claude and Codex) and the
// controller's own death hold the phase until ownership is settled. The shared fixture is
// src/test-support/preparation-execution-fixture.ts.
import { once } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
import { git } from "../test-support/git-repositories.js";
import { landingSession, waitFor } from "../test-support/engine-harness.js";
import { CODEX_CHOICE } from "../test-support/model-choices.js";
import { cleanUpPreparation, codexDefaults, fixture, h, nativeIt } from "../test-support/preparation-execution-fixture.js";
afterEach(cleanUpPreparation);

nativeIt.each(["alive", "inventory", "identity", "operation", "takeover"])("holds ordinary Claude preparation on %s process evidence through restart, then retries safely", async obstacle => {
  const f = await fixture(); h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0))"], { stdio: ["pipe", "ignore", "ignore"] });
  const exit = once(child, "exit");
  const identities = await import("../platform/process-start-time.js");
  const inventory = await import("../platform/helper-process.js");
  const { readGate, withGate } = await import("../live/gate.js");
  try {
    const startTime = await identities.processStartTime(child.pid!); expect(startTime).toBeTruthy();
    await f.accept(); const session = h.engine.latestSession("9")!; const gate = session.runs[0]!.live!.gateDirectory;
    await withGate(gate, state => {
      if (obstacle === "identity") state.processObservations = [child.pid!];
      else state.tracked.push({ pid: child.pid!, startTime: startTime! });
      if (obstacle === "inventory") { state.obstacle = "Retry inventory"; state.processObservations = []; }
    });
    const ownership = await import("../live/ownership.js"); const requireExited = ownership.requireExited;
    let insertedOperation = false;
    const operationFault = obstacle === "operation" ? vi.spyOn(ownership, "requireExited").mockImplementation(async identity => {
      await requireExited(identity);
      if (!insertedOperation && identity.pid === session.runs[0]!.pid) { insertedOperation = true; await withGate(gate, state => { state.operations.pending = { name: "Bash", admittedAt: new Date().toISOString(), hookSettled: false, settled: false }; }); }
    }) : undefined;
    const readIdentity = identities.processStartTime;
    const identityFault = obstacle === "identity" ? vi.spyOn(identities, "processStartTime").mockImplementation((pid, options) => pid === child.pid ? Promise.resolve(undefined) : readIdentity(pid, options)) : undefined;
    const helper = inventory.runHelper;
    const inventoryFault = obstacle === "inventory" ? vi.spyOn(inventory, "runHelper").mockImplementation((command, args, options) => command === "/bin/ps" && args.includes("pid=,ppid=") ? Promise.reject(new Error("Tracked inventory unavailable")) : helper(command, args, options)) : undefined;
    if (obstacle === "takeover") {
      // PID publication precedes launch settlement; wait for actual control admission.
      await waitFor(() => h.engine.controlView().controls.find(control => control.name === "take-over")?.available === true);
      const target = h.engine.liveTarget()!;
      expect(h.engine.commands.submit({ command_id: "takeover-preparation", execution_id: target.executionId, status_token: JSON.stringify(target), action: "take-over", inputs: { target } })).toMatchObject({ ok: true });
      await h.engine.commands.settled();
    }
    await f.submit();
    if (obstacle === "takeover") { await h.engine.reconcileTakeover(); expect(h.engine.record.liveControl?.takeover.state).toBe("pending"); }
    else expect(h.engine.record.preparation?.reason).toMatch(/process|inventory|unsettled/i);
    if (obstacle === "operation") { expect(insertedOperation).toBe(true); expect(h.engine.record.preparation?.reason).toContain("unsettled"); }
    expect(h.engine.record.preparation?.attempts).toHaveLength(0); expect(session.runs).toHaveLength(1);
    h.engine.close(); h.engine = f.make(); await h.engine.prepare();
    // Restart decision retries the returned preparation; it cannot run checks or a turn.
    await h.engine.decide(); expect(h.engine.record.preparation?.attempts).toHaveLength(0); expect(h.claudeCalls()).toHaveLength(1);
    identityFault?.mockRestore(); inventoryFault?.mockRestore(); operationFault?.mockRestore();
    child.stdin.end(); await exit;
    if (obstacle === "takeover") await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; });
    if (obstacle === "operation") await withGate(gate, state => { state.operations.pending!.hookSettled = true; state.operations.pending!.settled = true; });
    expect(readGate(gate).tracked.length + (readGate(gate).processObservations?.length ?? 0)).toBeGreaterThan(0);
    const releaseAgain = join(h.sandbox.root, "release-process-recovery");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [] }, { actions: [{ waitForFile: releaseAgain }, { result: "Preparation recovered." }, { exit: 0 }] }, landingSession(), { actions: [{ result: "Next phase needs work." }, { exit: 0 }] }] }));
    // Explicit Resume retains the conversation and earlier attempt evidence.
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget() })).toMatchObject({ ok: true, outcome: "resume_requested" });
    await waitFor(() => h.engine.latestSession("9")!.runs.length === 2 && !!h.engine.latestSession("9")!.runs.at(-1)?.pid);
    for (const binding of h.engine.record.preparation!.bindings) expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: binding.repository, commit: binding.sourceRevision }] })).toMatchObject({ ok: true });
    writeFileSync(releaseAgain, "release"); await h.engine.settled();
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
    expect(h.engine.latestSession("9")!.sessionId).toBe(session.sessionId); expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
  } finally { vi.restoreAllMocks(); child.stdin.end(); await exit; }
}, 120_000);

nativeIt("holds Codex preparation before native checks while background inventory is unknown, then resumes the same thread", async () => {
  const f = await fixture(); const { codexWorkFixture } = await import("../test-support/codex-work-fixture.js"); const codex = codexWorkFixture();
  const { posixShellPath } = await import("../test-support/git-repositories.js");
  const configure = (extra: Record<string, unknown>) => codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, ...extra });
  try {
    h.engine.close(); Object.assign(h.tools, { codex: codex.options.executable }); codex.configureEnvironment(h.env); h.env.CODEX_HOME = codex.home;
    // The PRD ran on Codex; its accepted continuation drops a kept choice equal to a current default (Kiln Phase Model Tiers KEEP-003), so this computer's Model defaults put every row on Codex.
    h.engine.record.settings.modelChoices.kept = { ...CODEX_CHOICE }; codexDefaults(h.env);
    writePrdRecord(h.stateDirectory, h.engine.record); h.engine = f.make();
    configure({ backgroundListError: true, command: `while ! test -f ${posixShellPath(f.release)}; do sleep 0.05; done` });
    await h.engine.refreshAgents(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    const check = await h.engine.checkCompletedPlan(); expect(check.status, JSON.stringify(check)).toBe("available");
    expect(await h.engine.continuationCommand("accept", { proposalId: check.result!.proposal!.id, executionId: h.engine.record.executionId, commandId: "codex-cleanup-preparation", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true });
    await waitFor(() => !!h.engine.latestSession("9")?.runs.at(-1)?.codex?.dispatch);
    git(h.sandbox, h.engine.worktreePath, "merge", "--no-edit", f.sha);
    for (const binding of h.engine.record.preparation!.bindings) expect(await h.engine.submitPreparation({ executionId: h.engine.record.executionId, phaseId: "9", bindingId: binding.id, references: [{ kind: "git_revision", repository: binding.repository, commit: binding.sourceRevision }] })).toMatchObject({ ok: true });
    writeFileSync(f.release, "return"); await h.engine.settled();
    const thread = h.engine.latestSession("9")!.conversation!.threadId;
    expect(h.engine.record.preparation?.reason).toContain("cleanup unresolved"); expect(h.engine.record.preparation?.attempts).toEqual([]);
    expect(codex.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
    h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
    expect(h.engine.record.preparation?.attempts).toEqual([]); expect(codex.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
    configure({ hang: true });
    await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget(), intent: "verify" });
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget() })).toMatchObject({ ok: true, outcome: "resume_requested" });
    await waitFor(() => codex.calls().filter(call => call.method === "turn/start").length === 2);
    expect(h.engine.latestSession("9")!.conversation!.threadId).toBe(thread); expect(h.engine.record.preparation?.stage).toBe("preparation"); expect(h.engine.record.preparation?.attempts).toEqual([]);
    // The peer deliberately holds this recovery turn. Actual Codex proof owns
    // successful native sandbox/environment and implementation admission.
  } finally { await h.engine.stop("sigint"); await codex.sandbox.cleanup(); }
}, 120_000);

it.skipIf(process.platform !== "darwin").each(["verification-intent", "verification-process", "verified-checkpoint", "implementation-intent"])("reconciles actual controller death at %s without duplicate checks or turns", async boundary => {
  const f = await fixture(); const { spawn } = await import("node:child_process"); const { fileURLToPath } = await import("node:url"); const { existsSync } = await import("node:fs");
  const marker = join(h.sandbox.root, "preparation-crash-boundary"); const optionsPath = join(h.sandbox.root, "preparation-controller.json");
  writeFileSync(optionsPath, JSON.stringify({ boundary, marker, release: f.release, options: { paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, stateDirectory: h.stateDirectory, record: h.engine.record, originRetryMs: 0 } }));
  h.engine.close(); h.env.KILN_STANDIN_OWNER_PID = String(process.pid);
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../test/stand-ins/preparation-controller.mjs", import.meta.url)), optionsPath], { env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(child, "exit"); let diagnostic = ""; child.stderr!.on("data", data => { diagnostic += String(data); });
  try {
    await waitFor(() => { if (child.exitCode !== null || child.signalCode !== null) throw new Error(diagnostic); return existsSync(marker); }, 40_000);
    const saved = readPrdRecord(h.stateDirectory)!; const identity = saved.executionId; const conversation = saved.phases["9"]!.sessionIds[0];
    child.kill("SIGKILL"); await exited;
    h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.busy && !h.engine.billing.pending);
    await h.engine.decide(); await h.engine.settled();
    expect(h.engine.record.executionId).toBe(identity); expect(h.engine.record.phases["9"]!.sessionIds).toEqual([conversation]);
    expect(h.engine.record.preparation!.attempts).toHaveLength(1);
    if (boundary === "verification-intent" || boundary === "verification-process") {
      expect(h.engine.record.preparation!.stage).not.toBe("implementation"); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
      expect(h.engine.record.preparation!.reason).toMatch(/unresolved|lost|ownership/i);
      if (boundary === "verification-process") { const attempt = h.engine.record.preparation!.attempts[0]!; const { requireExited } = await import("../live/ownership.js"); await waitFor(async () => { try { await requireExited({ pid: attempt.pid!, processStartTime: attempt.processStartTime! }); return true; } catch { return false; } }); }
    } else {
      expect(h.engine.record.preparation!.attempts[0]!.outcome).toBe("succeeded");
      expect(h.engine.latestSession("9")!.runs).toHaveLength(2);
      expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
    }
  } finally { child.kill("SIGKILL"); if (child.exitCode === null && child.signalCode === null) await exited; }
}, 120_000);

nativeIt("rechecks retained process owners after native verification before implementation dispatch", async () => {
  const f = await fixture(); h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0))"], { stdio: ["pipe", "ignore", "ignore"] }); const exit = once(child, "exit");
  const { processStartTime } = await import("../platform/process-start-time.js");
  const { withGate } = await import("../live/gate.js"); const native = await import("./preparation-verifier.js"); const verify = native.verifyPreparation;
  try {
    const startTime = await processStartTime(child.pid!); expect(startTime).toBeTruthy(); await f.accept();
    const directory = h.engine.latestSession("9")!.runs[0]!.live!.gateDirectory;
    vi.spyOn(native, "verifyPreparation").mockImplementation(async context => { const checked = await verify(context); await withGate(directory, gate => { gate.tracked.push({ pid: child.pid!, startTime: startTime! }); }); return checked; });
    await f.submit();
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["succeeded"]);
    expect(h.engine.record.preparation?.reason).toContain("process still owns");
    expect(h.engine.latestSession("9")!.runs).toHaveLength(1); expect(h.claudeCalls()).toHaveLength(1);
  } finally { vi.restoreAllMocks(); child.stdin.end(); await exit; }
}, 120_000);
