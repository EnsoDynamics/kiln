// Real separate Node helpers contend on the packaged cross-process gate.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { processStartTime } from "../platform/process-start-time.js";
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

it("retains an accepted hold behind a lock directory with no owner identity, which only Kiln 1.5.1 or earlier could leave", async () => {
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

it("recovers the lock a Kiln 1.5.1 helper left when it died writing its owner, keeping the hold", async () => {
  // The layout a killed hook left in a real run: the lock directory holding only the owner
  // write's temporary file, whose PID is gone.
  const root = mkdtempSync(join(tmpdir(), "kiln-gate-stranded-owner-")); createGate(root, target);
  try {
    await withGate(root, state => { state.held = { instructionId: "held", operationId: "hold", requestedAt: new Date().toISOString() }; });
    const lock = join(root, "admission.lock"); mkdirSync(lock, { mode: 0o700 });
    writeFileSync(join(lock, `owner.json.${randomUUID()}.tmp`), JSON.stringify(await deadIdentity()));
    expect(await withGate(root, state => state.held?.instructionId)).toBe("held");
    expect(existsSync(lock)).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("recovers when the helper taking over a dead holder's lock is itself killed before freeing it", async () => {
  // Both dead: the lock still points at the first holder's claim, which now sits inside the
  // claim of the helper that took it over.
  const root = mkdtempSync(join(tmpdir(), "kiln-gate-taker-killed-")); createGate(root, target);
  try {
    await withGate(root, state => { state.held = { instructionId: "held", operationId: "hold", requestedAt: new Date().toISOString() }; });
    const [first, taker] = [await deadIdentity(), await deadIdentity()];
    const takerClaim = join(root, `admission.owner.${taker.generation}`); const firstClaim = join(takerClaim, `admission.owner.${first.generation}`);
    mkdirSync(firstClaim, { recursive: true, mode: 0o700 });
    writeFileSync(join(takerClaim, "holder.json"), JSON.stringify(taker)); writeFileSync(join(firstClaim, "holder.json"), JSON.stringify(first));
    symlinkSync(`admission.owner.${first.generation}`, join(root, "admission.lock"));
    expect(await withGate(root, state => state.held?.instructionId)).toBe("held");
    expect(lstatExists(join(root, "admission.lock"))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("never wedges when real helpers are killed at any point while taking, holding or releasing the lock", async () => {
  // The hook processes of a stopped workflow are killed wherever they happen to be.
  const root = mkdtempSync(join(tmpdir(), "kiln-gate-kill-anywhere-")); createGate(root, target);
  const lock = join(root, "admission.lock");
  try {
    await withGate(root, state => { state.held = { instructionId: "held", operationId: "hold", requestedAt: new Date().toISOString() }; });
    const code = `import {withGate} from ${JSON.stringify(module)}; process.stdout.write('go\\n'); for (let i = 0; ; i++) await withGate(${JSON.stringify(root)}, s => { s.operations['op-' + process.pid + '-' + i] = { name: 'Bash', admittedAt: new Date().toISOString(), settled: true }; });`;
    const once1 = `import {withGate} from ${JSON.stringify(module)}; await withGate(${JSON.stringify(root)}, s => { s.operations['one-' + process.pid] = { name: 'Bash', admittedAt: new Date().toISOString(), settled: true }; });`;
    let lockLeft = 0; const admittedOnce: string[] = [];
    for (let round = 0; round < 25; round++) {
      // Helpers recover from each other's deaths and are themselves killed, mid-recovery included.
      const helpers = [0, 1, 2].map(() => spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "ignore"] }));
      await Promise.all(helpers.map(helper => once(helper.stdout!, "data")));
      // Contenders that are never killed race the helpers' deaths and the recoveries after them.
      // Each must be admitted, and its admission must survive: two holders at once would lose one.
      const contenders = [0, 1, 2].map(() => {
        const child = spawn(process.execPath, ["--input-type=module", "-e", once1], { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = ""; child.stderr!.on("data", chunk => { stderr += String(chunk); });
        return once(child, "exit").then(([exitCode]) => ({ exitCode, stderr, id: `one-${child.pid}` }));
      });
      await new Promise(resolve => setTimeout(resolve, Math.random() * 40));
      await Promise.all(helpers.map(async helper => { const exited = once(helper, "exit"); helper.kill("SIGKILL"); await exited; }));
      if (lstatExists(lock)) lockLeft++;
      const finished = await Promise.all(contenders);
      expect(finished.map(({ exitCode, stderr }) => ({ exitCode, stderr }))).toEqual([0, 1, 2].map(() => ({ exitCode: 0, stderr: "" })));
      admittedOnce.push(...finished.map(({ id }) => id));
      expect(await withGate(root, state => state.held?.instructionId)).toBe("held");
      expect(lstatExists(lock)).toBe(false);
    }
    // Some kills landed while a helper held the lock, so recovery was exercised, not only a free lock.
    expect(lockLeft).toBeGreaterThan(0);
    expect(admittedOnce.filter(id => !readGate(root).operations[id])).toEqual([]);
    expect(readdirSync(root).filter(name => name.startsWith("admission.") && !/^admission\.owner\.[0-9a-f-]+$/.test(name))).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 60_000);

/** The identity of a real process that has exited. */
async function deadIdentity(): Promise<{ pid: number; start: string; generation: string }> {
  const helper = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const exited = once(helper, "exit");
  const start = await processStartTime(helper.pid!); expect(start).toBeDefined();
  helper.kill("SIGKILL"); await exited;
  return { pid: helper.pid!, start: start!, generation: randomUUID() };
}
function lstatExists(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}
