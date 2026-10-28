// Real subprocess tree, /bin/ps, durable gate, engine and Git. Only the
// otherwise unreliable identity-read fault is injected for one observed PID.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as identities from "../platform/process-start-time.js";
import * as ownership from "./ownership.js";
import { createHarness, waitFor } from "../test-support/engine-harness.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { LiveOwnedProcesses } from "./owned-processes.js";
import { readGate, withGate } from "./gate.js";

afterEach(() => vi.restoreAllMocks());
it.skipIf(process.platform !== "darwin").each(["throw", "blank", "delayed"])("retains partial descendant capture through reparenting, scanner close and restart after %s identity reads", async fault => {
  const h = await createHarness({ sessions: [] });
  const childrenFile = join(h.sandbox.root, "children.json");
  const endA = join(h.sandbox.root, "end-a"); const endB = join(h.sandbox.root, "end-b"); const release = join(h.sandbox.root, "release");
  const childCode = "const fs=require('node:fs');setInterval(()=>{if(fs.existsSync(process.argv[1]))process.exit(0)},30)";
  const parent = spawn(process.execPath, ["-e", `const{spawn}=require('node:child_process');const fs=require('node:fs');const a=spawn(process.execPath,['-e',${JSON.stringify(childCode)},${JSON.stringify(endA)}],{stdio:'ignore'});const b=spawn(process.execPath,['-e',${JSON.stringify(childCode)},${JSON.stringify(endB)}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(childrenFile)},JSON.stringify([a.pid,b.pid]));process.stdin.resume();process.stdin.on('end',()=>process.exit(0));`], { stdio: ["pipe", "ignore", "ignore"] });
  const parentExit = once(parent, "exit");
  let scanner: LiveOwnedProcesses | undefined;
  let late: ReturnType<typeof spawn> | undefined; let lateExit: Promise<unknown> | undefined;
  let a: number | undefined; let b: number | undefined;
  let releaseIdentity!: () => void; let identityBlocked = false; let identityReleased = false;
  const identityWait = new Promise<void>(resolve => { releaseIdentity = resolve; });
  try {
    await waitFor(() => existsSync(childrenFile));
    const { readFileSync } = await import("node:fs"); [a, b] = JSON.parse(readFileSync(childrenFile, "utf8")) as [number, number];
    const startA = await identities.processStartTime(a!); const parentStart = await identities.processStartTime(parent.pid!);
    h.env.KILN_STANDIN_VERSION = "2.1.311"; mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "ready");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { waitForFile: release }, { result: "Yielded." }] }] }));
    await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready));
    const target = h.engine.liveTarget()!; const run = h.engine.latestSession("1")!.runs[0]!; const directory = run.live!.gateDirectory;
    // A previously tracked tool owns this real subtree. Narrow failure injection
    // does not invent inventory rows, descendants or their reparenting.
    const original = identities.processStartTime;
    let inject = true;
    vi.spyOn(identities, "processStartTime").mockImplementation(async (pid, options) => {
      if (inject && pid === b) {
        if (fault === "delayed" && !identityReleased) { identityBlocked = true; await identityWait; }
        if (fault !== "blank") throw new Error(`Identity read failed for observed ${b}`);
        return undefined;
      }
      return original(pid, options);
    });
    await withGate(directory, state => { state.tracked.push({ pid: parent.pid!, startTime: parentStart! }); });
    if (fault !== "delayed") { scanner = new LiveOwnedProcesses(directory, run.pid!, run.processStartTime!); scanner.start(); }
    await waitFor(() => readGate(directory).tracked.some(p => p.pid === a) && (fault === "delayed" ? identityBlocked : !!readGate(directory).obstacle));
    await scanner?.close(); scanner = undefined;
    expect(readGate(directory).tracked).toContainEqual({ pid: a, startTime: startA });
    expect(readGate(directory).processObservations).toContain(b);
    h.engine.commands.submit({ command_id: "partial-capture", execution_id: target.executionId, status_token: JSON.stringify(target), action: "take-over", inputs: { target } }); await h.engine.commands.settled();
    parent.stdin.end(); await parentExit;
    writeFileSync(release, "attempt exits naturally");
    if (fault === "delayed") {
      // The real attempt has exited but its actual final scanner read is still
      // suspended. Readiness must return pending without racing that writer.
      await waitFor(async () => !await original(run.pid!));
      for (let i = 0; i < 2; i++) await h.engine.reconcileTakeover();
      expect(h.engine.record.liveControl?.takeover).toMatchObject({ state: "pending", reason: expect.stringContaining("final attempt") });
      expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toBeUndefined();
      identityReleased = true; releaseIdentity();
    }
    await h.engine.settled();
    for (let restart = 0; restart < 2; restart++) {
      for (let check = 0; check < 2; check++) await h.engine.reconcileTakeover();
      expect(readGate(directory).tracked).toContainEqual({ pid: a, startTime: startA }); expect(readGate(directory).processObservations).toContain(b);
      expect(h.engine.record.liveControl?.takeover.state).toBe("pending"); expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toBeUndefined();
      expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget()! })).toMatchObject({ ok: false, code: "recovery_unavailable" });
      expect(await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget()!, intent: "verify" })).toMatchObject({ ok: false, code: "check_unavailable" });
      expect(await original(a!)).toBe(startA); expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
      h.engine = h.reopenFromDisk(); await h.engine.prepare();
    }
    // Fresh identity success resolves B but A and B still own work after reparenting.
    inject = false; await h.engine.reconcileTakeover();
    expect(readGate(directory).processObservations).toEqual([]); expect(readGate(directory).tracked.some(p => p.pid === b)).toBe(true);
    expect(h.engine.record.liveControl?.takeover.state).toBe("pending");
    writeFileSync(endA, "exit A"); writeFileSync(endB, "exit B");
    await waitFor(async () => !await original(a!) && !await original(b!));
    if (fault === "throw") {
      late = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0))"], { stdio: ["pipe", "ignore", "ignore"] });
      lateExit = once(late, "exit");
      const originalNoTerminal = ownership.requireNoTerminal; let insertObservation = true;
      // A final scanner write lands during the actual terminal-inventory await.
      // The subprocess is real; only this precise durable-write timing is injected.
      vi.spyOn(ownership, "requireNoTerminal").mockImplementation(async (...args) => {
        await originalNoTerminal(...args);
        if (insertObservation) { insertObservation = false; await withGate(directory, state => { state.processObservations!.push(late!.pid!); }); }
      });
      await h.engine.reconcileTakeover();
      expect(h.engine.record.liveControl?.takeover).toMatchObject({ state: "pending", reason: expect.stringContaining("evidence changed") });
      expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toBeUndefined();
      await h.engine.reconcileTakeover();
      expect(readGate(directory).tracked.some(p => p.pid === late!.pid)).toBe(true);
      expect(h.engine.record.liveControl?.takeover.state).toBe("pending");
      expect(await h.engine.resume({ target: h.engine.phaseRecoveryTarget()! })).toMatchObject({ ok: false });
      late.stdin!.end(); await lateExit;
    }
    await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; });
    expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toContain(target.providerSessionId);
  } finally {
    identityReleased = true; releaseIdentity(); vi.restoreAllMocks(); await scanner?.close(); parent.stdin.end(); writeFileSync(endA, "cleanup"); writeFileSync(endB, "cleanup"); writeFileSync(release, "cleanup"); await parentExit; late?.stdin?.end(); await lateExit; await h.cleanup();
  }
});
