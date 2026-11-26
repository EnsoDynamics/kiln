// Preparation execution: the native check's own processes, including detached descendants, are
// retained across failures and restarts until they exit. The shared fixture is
// src/test-support/preparation-execution-fixture.ts.
import { once } from "node:events";
import { afterEach, expect, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { writePrdRecord } from "../state/records.js";
import { waitFor } from "../test-support/engine-harness.js";
import { cleanUpPreparation, fixture, h, nativeIt, resumePreparation } from "../test-support/preparation-execution-fixture.js";
afterEach(cleanUpPreparation);

nativeIt.each(["inventory", "identity", "checkpoint_read", "checkpoint_changed"].flatMap(mode => [false, true].map(legacyFailed => ({ mode, legacyFailed }))))("retains and recovers native ownership across $mode failure and restart (legacy failed=$legacyFailed)", async ({ mode, legacyFailed }) => {
  const f = await fixture(); await f.accept();
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0))"], { stdio: ["pipe", "ignore", "ignore"] }); const exit = once(child, "exit");
  const identities = await import("../platform/process-start-time.js"); const helpers = await import("../platform/helper-process.js");
  const { readGate, withGate } = await import("../live/gate.js"); const { LiveOwnedProcesses } = await import("../live/owned-processes.js");
  const permissions = await import("./preparation-permissions.js");
  const ownership = await import("../live/ownership.js"); const exited = ownership.requireExited;
  const close = LiveOwnedProcesses.prototype.close; const identity = identities.processStartTime; const helper = helpers.runHelper; const permission = permissions.preparationPermissions;
  let observed = false;
  try {
    const start = await identities.processStartTime(child.pid!); expect(start).toBeTruthy();
    vi.spyOn(ownership, "requireExited").mockImplementation(async identity => {
      try { await exited(identity); }
      catch (error) { if (mode === "checkpoint_changed" && identity.pid === child.pid) h.env.KILN_FICTIONAL_CHECKPOINT_MOVE = "changed"; throw error; }
    });
    vi.spyOn(LiveOwnedProcesses.prototype, "close").mockImplementation(async function(this: InstanceType<typeof LiveOwnedProcesses>) {
      await close.call(this);
      const attempt = h.engine.record.preparation?.attempts.at(-1);
      if (!observed && attempt?.pid) {
        observed = true;
        await withGate(attempt.gateDirectory, gate => { gate.processObservations = mode === "identity" ? [child.pid!] : []; if (mode !== "identity") gate.tracked.push({ pid: child.pid!, startTime: start! }); if (mode === "inventory") gate.obstacle = "Retry native inventory"; });
      }
    });
    vi.spyOn(identities, "processStartTime").mockImplementation((pid, options) => mode === "identity" && pid === child.pid ? Promise.resolve(undefined) : identity(pid, options));
    vi.spyOn(helpers, "runHelper").mockImplementation((command, args, options) => mode === "inventory" && observed && command === "/bin/ps" && args.includes("pid=,ppid=") ? Promise.reject(new Error("Transient native inventory failure")) : helper(command, args, options));
    vi.spyOn(permissions, "preparationPermissions").mockImplementation(async (...args) => {
      if (observed && h.engine.record.preparation?.attempts.at(-1)?.outcome === "unresolved") {
        if (mode === "checkpoint_read") throw new Error("Transient post-check permission read failed");
      }
      return permission(...args);
    });
    await f.submit();
    expect(observed).toBe(true); expect(h.engine.record.preparation?.attempts).toMatchObject([{ outcome: "unresolved" }]);
    if (legacyFailed) {
      const attempt = h.engine.record.preparation!.attempts[0]!;
      expect(attempt.endedAt).toBeUndefined(); expect(attempt.outputDigest).toBeUndefined();
      attempt.outcome = "failed"; // The retained state written by the original G8 bug.
      writePrdRecord(h.stateDirectory, h.engine.record);
    }
    expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
    vi.restoreAllMocks();
    h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
    expect(h.engine.record.preparation?.attempts).toHaveLength(1); expect(h.engine.record.preparation?.attempts[0]?.outcome).toBe(legacyFailed ? "failed" : "unresolved");
    expect(h.claudeCalls()).toHaveLength(1);
    const { verifyPreparation } = await import("./preparation-verifier.js");
    await expect(verifyPreparation({ agentId: "claude_code", record: h.engine.record, stateDirectory: h.stateDirectory, git: { git: h.tools.git, env: h.env }, env: h.env, signal: new AbortController().signal, save: () => writePrdRecord(h.stateDirectory, h.engine.record), now: () => new Date().toISOString() })).rejects.toThrow(/owns|identity|inventory|unresolved/i);
    expect(h.engine.record.preparation?.attempts).toHaveLength(1);
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    await h.engine.resume({ target: h.engine.phaseRecoveryTarget() }); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.preparation?.stage).not.toBe("implementation");
    // Supported observations may refresh, but the real surviving owner is never released.
    expect(readGate(h.engine.record.preparation!.attempts[0]!.gateDirectory).tracked.some(row => row.pid === child.pid)).toBe(true);
    child.stdin.end(); await exit;
    h.engine.close(); h.engine = f.make(); await h.engine.prepare();
    await resumePreparation();
    expect(h.engine.record.preparation?.stage, JSON.stringify(h.engine.record.preparation)).toBe("implementation");
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["interrupted", "succeeded"]);
    expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
  } finally { vi.restoreAllMocks(); child.stdin.end(); await exit; }
}, 120_000);

nativeIt.each(["checkpoint_read", "checkpoint_changed"])("discovers a real detached native descendant before %s failure and recovers safely", async mode => {
  const descendant = "const fs=require('node:fs');setInterval(()=>{if(fs.existsSync(process.env.KILN_FICTIONAL_NATIVE_RELEASE)||!fs.existsSync(require('node:path').dirname(process.env.KILN_FICTIONAL_NATIVE_RELEASE)))process.exit(0)},25)";
  const program = `const fs=require('node:fs');const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'});child.unref();fs.writeFileSync(process.env.KILN_FICTIONAL_NATIVE_PID,String(child.pid));setInterval(()=>{if(fs.existsSync(process.env.KILN_FICTIONAL_CHECK_RETURN))process.exit(0)},25)`;
  const f = await fixture(`node -e '${program.replaceAll("'", "'\\''")}'`, "this phase's branch", 30);
  const pidFile = join(h.sandbox.root, "native-descendant.pid"); const release = join(h.sandbox.root, "release-native-descendant"); const checkReturn = join(h.sandbox.root, "return-native-check");
  Object.assign(h.env, { KILN_FICTIONAL_NATIVE_PID: pidFile, KILN_FICTIONAL_NATIVE_RELEASE: release, KILN_FICTIONAL_CHECK_RETURN: checkReturn });
  const { readGate } = await import("../live/gate.js"); const ownership = await import("../live/ownership.js"); const requireExited = ownership.requireExited;
  const permissions = await import("./preparation-permissions.js"); const permission = permissions.preparationPermissions;
  let owner: { pid: number; processStartTime: string } | undefined;
  try {
    await f.accept();
    vi.spyOn(ownership, "requireExited").mockImplementation(async identity => {
      try { await requireExited(identity); }
      catch (error) { if (mode === "checkpoint_changed" && owner?.pid === identity.pid) h.env.KILN_FICTIONAL_DESCENDANT_CHECKPOINT = "changed"; throw error; }
    });
    vi.spyOn(permissions, "preparationPermissions").mockImplementation(async (...args) => {
      if (h.engine.record.preparation?.attempts.at(-1)?.outcome === "unresolved") {
        if (mode === "checkpoint_read") throw new Error("Synthetic post-check checkpoint read failure beside real descendant");
      }
      return permission(...args);
    });
    const returned = f.submit();
    await waitFor(() => existsSync(pidFile));
    const pid = Number(readFileSync(pidFile, "utf8"));
    await waitFor(() => {
      const attempt = h.engine.record.preparation?.attempts.at(-1); if (!attempt) return false;
      const tracked = readGate(attempt.gateDirectory).tracked.find(row => row.pid === pid);
      if (tracked) owner = { pid, processStartTime: tracked.startTime };
      return !!owner;
    });
    // The real native scanner, not this test, recorded the detached child.
    expect(owner?.pid).toBe(pid); expect(owner?.processStartTime).toBeTruthy();
    writeFileSync(checkReturn, "return project check while descendant lives"); await returned;
    vi.restoreAllMocks();
    const attempt = h.engine.record.preparation!.attempts[0]!;
    expect(attempt.outcome).toBe("unresolved"); expect(attempt.reason).toContain("Source/configuration changed");
    expect(readGate(attempt.gateDirectory).tracked).toContainEqual({ pid, startTime: owner!.processStartTime });
    expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
    if (mode === "checkpoint_changed") { attempt.outcome = "failed"; writePrdRecord(h.stateDirectory, h.engine.record); }
    h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget(), intent: "verify" });
    await h.engine.resume({ target: h.engine.phaseRecoveryTarget() }); await h.engine.settled();
    expect(h.engine.record.preparation?.attempts).toHaveLength(1); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
    await expect(requireExited(owner!)).rejects.toThrow("still owns");
    writeFileSync(release, "release descendant");
    await waitFor(async () => { try { await requireExited(owner!); return true; } catch { return false; } });
    h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await resumePreparation();
    expect(h.engine.record.preparation?.stage, JSON.stringify(h.engine.record.preparation)).toBe("implementation");
    expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["interrupted", "succeeded"]);
    expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
  } finally {
    vi.restoreAllMocks(); writeFileSync(checkReturn, "return for cleanup"); writeFileSync(release, "release for cleanup");
    if (owner) await waitFor(async () => { try { await requireExited(owner!); return true; } catch { return false; } });
  }
}, 120_000);
