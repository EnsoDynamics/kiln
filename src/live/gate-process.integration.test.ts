// Real separate Node helpers contend on the packaged cross-process gate.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createGate, readGate, withGate, unsettled } from "./gate.js";
const module = fileURLToPath(new URL("../../dist/live/gate.js", import.meta.url));
const target = { executionId: "e", activityId: "a", activityKey: "1", sessionId: "s", providerSessionId: "s", attemptId: "t" };
it("orders admitted work before a competing hold, denies later work, and recovers only a proven dead helper", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-gate-process-")); createGate(root, target);
  try {
    const code = `import {withGate} from ${JSON.stringify(module)}; await withGate(${JSON.stringify(root)}, s=>{s.operations.first={name:'Bash',admittedAt:new Date().toISOString()}; process.stdout.write('admitted\\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,300);});`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
    const exit = once(child, "exit"); await once(child.stdout!, "data");
    await withGate(root, state => { state.held = { instructionId: "i", operationId: "o", requestedAt: new Date().toISOString() }; });
    expect((await exit)[0]).toBe(0);
    const admitted = await withGate(root, state => { if (state.held) return false; state.operations.second = { name: "Write", admittedAt: new Date().toISOString() }; return true; });
    expect(admitted).toBe(false); expect(Object.keys(readGate(root).operations)).toEqual(["first"]);
    const death = `import{withGate}from ${JSON.stringify(module)};import{writeDurableMetadata}from ${JSON.stringify(fileURLToPath(new URL("../../dist/control/durable-file.js", import.meta.url)))};await withGate(${JSON.stringify(root)},s=>{s.operations.crashed={name:'Read',admittedAt:new Date().toISOString()};writeDurableMetadata(${JSON.stringify(join(root, "gate.json"))},s);process.kill(process.pid,'SIGKILL');});`;
    const crashed = spawn(process.execPath, ["--input-type=module", "-e", death], { stdio: "ignore" }); await once(crashed, "exit");
    await withGate(root, state => { expect(state.held?.instructionId).toBe("i"); });
    expect(unsettled(readGate(root))).toContain("Read crashed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("retains an accepted hold when a real helper dies before publishing its lock owner", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-gate-ownerless-")); createGate(root, target);
  try {
    await withGate(root, state => { state.held = { instructionId: "held", operationId: "hold", requestedAt: new Date().toISOString() }; });
    const lock = join(root, "admission.lock");
    const code = `import{mkdirSync}from'node:fs';mkdirSync(${JSON.stringify(lock)});process.kill(process.pid,'SIGKILL');`;
    const helper = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: "ignore" });
    const [exitCode, signal] = await once(helper, "exit");
    expect(exitCode === null || exitCode !== 0).toBe(true); expect(signal).toBe("SIGKILL");
    let admitted = false;
    await expect(withGate(root, () => { admitted = true; })).rejects.toThrow("Admission lock is unresolved");
    expect(admitted).toBe(false);
    expect(readGate(root).held?.instructionId).toBe("held");
    expect(existsSync(lock)).toBe(true); expect(existsSync(join(lock, "owner.json"))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("lets every contender through when the lock is released between seeing its owner and reading it", async () => {
  // A hook that read the owner just after its holder released the lock used to fail, so a tool's
  // PostToolUse never settled it and the session never closed.
  const root = mkdtempSync(join(tmpdir(), "kiln-gate-release-race-")); createGate(root, target);
  try {
    const rounds = 150;
    const code = (name: string) => `import {withGate} from ${JSON.stringify(module)}; for (let i = 0; i < ${rounds}; i++) await withGate(${JSON.stringify(root)}, s => { s.operations['${name}-' + i] = { name: 'Bash', admittedAt: new Date().toISOString(), settled: true }; });`;
    const helpers = ["a", "b", "c", "d"].map(name => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", code(name)], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = ""; child.stderr!.on("data", chunk => { stderr += String(chunk); });
      return once(child, "exit").then(([exitCode]) => ({ exitCode, stderr }));
    });
    expect(await Promise.all(helpers)).toEqual(["a", "b", "c", "d"].map(() => ({ exitCode: 0, stderr: "" })));
    expect(Object.keys(readGate(root).operations)).toHaveLength(4 * rounds);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60_000);
