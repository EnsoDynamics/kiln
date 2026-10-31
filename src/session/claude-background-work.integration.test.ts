import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runSessionProcess, type SessionControl } from "./claude-session.js";
import { SCHEMA_VERSION, type SessionRecord } from "../state/records.js";
import { createGate, observeGate, readGate, unsettled } from "../live/gate.js";
import { waitFor } from "../test-support/engine-harness.js";

// Real child pipes with recorded provider event shapes. File latches avoid a
// wall-clock race; live inference is a separate, explicitly reported proof.
it.each([false, true])("keeps required work alive after an intermediate result (live input: %s)", async live => {
  const root = mkdtempSync(join(tmpdir(), "kiln-required-work-"));
  const id = randomUUID(); const gate = join(root, "gate");
  const target = { executionId: "proof", activityId: "activity", activityKey: "1", sessionId: id, providerSessionId: id, attemptId: "attempt" };
  createGate(gate, target);
  const record: SessionRecord = { schemaVersion: SCHEMA_VERSION, agentId: "claude_code", sessionId: id, phaseId: "1", kind: "phase", createdAt: new Date().toISOString(), model: "fixture", modelDisplayName: "Fixture", runs: [], sleeps: [], steps: [] };
  const script = join(root, "provider.mjs"); const release = join(root, "release"); const wire = join(root, "wire.json");
  writeFileSync(script, `import{createInterface}from'node:readline';import{existsSync,writeFileSync}from'node:fs';
const send=e=>process.stdout.write(JSON.stringify(e)+'\\n');let finished=false;
createInterface({input:process.stdin}).once('line',line=>{
writeFileSync(${JSON.stringify(wire)},JSON.stringify({input:JSON.parse(line),ceiling:process.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS}));
send({type:'system',subtype:'task_started',task_id:'review',run_id:'run'});
send({type:'system',subtype:'background_tasks_changed',tasks:[{task_id:'review',run_id:'run'}]});
send({type:'result',subtype:'success',result:'Waiting for review'});
const timer=setInterval(()=>{if(!existsSync(${JSON.stringify(release)}))return;clearInterval(timer);finished=true;
send({type:'system',subtype:'task_notification',task_id:'review',run_id:'run',status:'completed'});
send({type:'system',subtype:'background_tasks_changed',tasks:[]});
send({type:'result',subtype:'success',result:'Review read; remaining work finished'});},10);});
process.stdin.on('end',()=>process.exit(finished?0:7));`);
  let control: SessionControl | undefined;
  const running = runSessionProcess({ claude: process.execPath, args: [script], cwd: root, env: { ...process.env, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: "1" }, prompt: "Finish assigned task", control: { operationId: "operation", attemptId: target.attemptId, promptDigest: "unexpanded-prompt" }, stateDirectory: root, record, cause: "launch", ...(live ? { live: { attemptId: target.attemptId, gateDirectory: gate, configRoot: root, profile: "fixture", literalInput: true } } : {}), onSpawned: value => { control = value; } });
  try {
    await waitFor(() => record.runs[0]?.result?.text === "Waiting for review");
    expect(record.runs[0]?.endedAt).toBeUndefined();
    const submitted = JSON.parse(readFileSync(wire, "utf8"));
    expect(submitted.ceiling).toBe("0");
    expect(submitted.input.message.content).toContain("wait for its outcome and then continue the remaining work in this same session");
    expect(record.runs[0]?.control?.promptDigest).toBe(createHash("sha256").update(submitted.input.message.content).digest("hex"));
    expect(existsSync(release)).toBe(false);
    writeFileSync(release, "review finished");
    const run = await running;
    expect(run.exitCode).toBe(0); expect(run.signal).toBeUndefined();
    expect(run.result?.text).toBe("Review read; remaining work finished");
    expect(record.runs).toHaveLength(1);
  } finally {
    control?.endTree("SIGKILL"); await running;
    rmSync(root, { recursive: true, force: true });
  }
});

it.each([false, true])("finishes with only an ambient watcher remaining (live input: %s)", async live => {
  const root = mkdtempSync(join(tmpdir(), "kiln-ambient-work-"));
  const id = randomUUID(); const gate = join(root, "gate");
  const target = { executionId: "proof", activityId: "activity", activityKey: "1", sessionId: id, providerSessionId: id, attemptId: "attempt" };
  createGate(gate, target);
  const record: SessionRecord = { schemaVersion: SCHEMA_VERSION, agentId: "claude_code", sessionId: id, phaseId: "1", kind: "phase", createdAt: new Date().toISOString(), model: "fixture", modelDisplayName: "Fixture", runs: [], sleeps: [], steps: [] };
  const script = join(root, "provider.mjs");
  writeFileSync(script, `import{createInterface}from'node:readline';
createInterface({input:process.stdin}).once('line',()=>{
for(const e of [
{type:'system',subtype:'task_started',task_id:'watch',run_id:'run'},
{type:'system',subtype:'background_tasks_changed',tasks:[{task_id:'watch',run_id:'run',ambient:true}]},
{type:'result',subtype:'success',result:'Assigned task finished'}])process.stdout.write(JSON.stringify(e)+'\\n');
});process.stdin.on('end',()=>process.exit(0));`);
  let control: SessionControl | undefined;
  const running = runSessionProcess({ claude: process.execPath, args: [script], cwd: root, env: process.env, prompt: "Finish assigned task", stateDirectory: root, record, cause: "launch", ...(live ? { live: { attemptId: target.attemptId, gateDirectory: gate, configRoot: root, profile: "fixture", literalInput: true } } : {}), onSpawned: value => { control = value; } });
  try {
    const run = await running;
    expect(run.exitCode).toBe(0); expect(run.result?.text).toBe("Assigned task finished");
    if (live) {
      expect(unsettled(readGate(gate))).toEqual([]);
      // A later complete snapshot can promote the same watcher into real work.
      await observeGate(gate, { type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "watch", run_id: "run", ambient: false }] }, undefined);
      expect(unsettled(readGate(gate))).toEqual(["task watch:run"]);
    }
  } finally { control?.endTree("SIGKILL"); await running; rmSync(root, { recursive: true, force: true }); }
});

it("does not reopen terminal work when a late membership snapshot arrives", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-task-settlement-"));
  createGate(root, { executionId: "proof", activityId: "activity", activityKey: "1", sessionId: "session", providerSessionId: "session", attemptId: "attempt" });
  try {
    await observeGate(root, { type: "system", subtype: "task_started", task_id: "review", run_id: "run" }, undefined);
    expect(unsettled(readGate(root))).toEqual(["task review:run"]);
    await observeGate(root, { type: "system", subtype: "task_notification", task_id: "review", run_id: "run", status: "completed" }, undefined);
    expect(unsettled(readGate(root))).toEqual([]);
    await observeGate(root, { type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "review", run_id: "run", ambient: false }] }, undefined);
    expect(readGate(root).tasks["review:run"]).toMatchObject({ settled: true, ambient: false });
    expect(unsettled(readGate(root))).toEqual([]);
    await observeGate(root, { type: "system", subtype: "background_tasks_changed", tasks: [] }, undefined);
    expect(unsettled(readGate(root))).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("surfaces unreadable live task evidence without leaving the provider awaiting input", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-invalid-work-"));
  const target = { executionId: "proof", activityId: "activity", activityKey: "1", sessionId: "session", providerSessionId: "session", attemptId: "attempt" };
  const gate = join(root, "gate"); createGate(gate, target);
  const record: SessionRecord = { schemaVersion: SCHEMA_VERSION, agentId: "claude_code", sessionId: target.sessionId, phaseId: "1", kind: "phase", createdAt: new Date().toISOString(), model: "fixture", modelDisplayName: "Fixture", runs: [], sleeps: [], steps: [] };
  const script = join(root, "provider.mjs");
  writeFileSync(script, `import{createInterface}from'node:readline';createInterface({input:process.stdin}).once('line',()=>process.stdout.write(JSON.stringify({type:'system',subtype:'background_tasks_changed',tasks:null})+'\\n'));process.stdin.on('end',()=>process.exit(0));`);
  let control: SessionControl | undefined;
  const running = runSessionProcess({ claude: process.execPath, args: [script], cwd: root, env: process.env, prompt: "Finish task", stateDirectory: root, record, cause: "launch", live: { attemptId: target.attemptId, gateDirectory: gate, configRoot: root, profile: "fixture", literalInput: true }, onSpawned: value => { control = value; } });
  try { await expect(running).rejects.toThrow("Invalid Claude background-task membership"); }
  finally { control?.endTree("SIGKILL"); await running.catch(() => {}); rmSync(root, { recursive: true, force: true }); }
});
