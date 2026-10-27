// Real separate Node helpers contend on the packaged cross-process gate.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
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
