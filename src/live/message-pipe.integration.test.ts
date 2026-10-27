// A real blocked pipe and real subprocess exercise the adapter's timeout and late
// callback path without spending model usage to induce an operating-system fault.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { launchArguments, runSessionProcess, type SessionControl } from "../session/claude-session.js";
import { createGate } from "./gate.js";
import { SCHEMA_VERSION, type SessionRecord } from "../state/records.js";
import { waitFor } from "../test-support/engine-harness.js";
it("bounds a blocked live write to five seconds, observes the later pipe failure, and sends no retry", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-message-pipe-"));
  const id = randomUUID(); const attemptId = randomUUID(); const gate = join(root, "gate");
  const target = { executionId: "e", activityId: "a", activityKey: "1", sessionId: id, providerSessionId: id, attemptId }; createGate(gate, target);
  const script = join(root, "blocked-input.mjs");
  // Never read stdin; the large opening input fills the pipe. Later end proves no
  // timeout cancellation. The terminal event carries no live-message consumption.
  writeFileSync(script, `process.stdout.write(JSON.stringify({type:'system',subtype:'init',session_id:${JSON.stringify(id)}})+'\\n'); setTimeout(()=>process.exit(0),6500);`);
  const record = { schemaVersion: SCHEMA_VERSION, agentId: "claude_code", executionId: "e", phaseId: "1", kind: "phase", sessionId: id, createdAt: new Date().toISOString(), model: "test", modelDisplayName: "Test", workingDirectory: root, runs: [], sleeps: [], steps: [] } as SessionRecord;
  let control: SessionControl | undefined;
  try {
    const running = runSessionProcess({ claude: process.execPath, args: [script, ...launchArguments(id, "test", undefined)], cwd: root, env: process.env, prompt: "x".repeat(1024 * 1024), stateDirectory: root, record, cause: "launch", live: { attemptId, gateDirectory: gate, configRoot: root, profile: "fixture", literalInput: true }, onSpawned: c => { control = c; } });
    await waitFor(() => !!control?.inputOpen?.());
    const started = Date.now();
    expect(await control!.sendMessage!("exact live instruction", randomUUID())).toBe("uncertain");
    expect(Date.now() - started).toBeGreaterThanOrEqual(4900);
    const run = await running;
    expect(run.signal).toBeUndefined(); expect(run.exitCode).toBe(0); expect(control!.inputOpen!()).toBe(false);
    expect(record.runs).toHaveLength(1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
