// AC-MSG-01/02/04: replay a freshly verified real-Claude contract through the real
// adapter. This is recorded contract evidence, not a claim of a new live model run.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runSessionProcess, type SessionControl } from "../session/claude-session.js";
import { type StreamEvent } from "../session/session-output.js";
import { consumedUuids } from "./target.js";
import { createGate, readGate, withGate } from "./gate.js";
import { SCHEMA_VERSION, type SessionRecord } from "../state/records.js";
import { waitFor } from "../test-support/engine-harness.js";

it("preserves the verified literal user wire contract and drains only after all three recorded Claude results", async () => {
  const fixture = readFileSync(new URL("../../test/fixtures/live-control/claude-2.1.311-message-contract.json", import.meta.url), "utf8");
  const contract = JSON.parse(fixture) as { provenance: { cliVersion: string }; target: { executionId: string; activityId: string; activityKey: string; sessionId: string; providerSessionId: string; attemptId: string }; messages: { text: string; uuid: string }[]; events: StreamEvent[] };
  const root = mkdtempSync(join(tmpdir(), "kiln-provider-contract-"));
  const gate = join(root, "gate"); createGate(gate, contract.target);
  const transcript = join(root, "contract.json"); writeFileSync(transcript, fixture);
  const wire = join(root, "wire.json"); const drain = join(root, "drain.json"); const script = join(root, "provider.mjs");
  // Delay between the real recorded turns makes a first-result-close regression visible.
  writeFileSync(script, `import{readFileSync,writeFileSync}from'node:fs';import{createInterface}from'node:readline';
const c=JSON.parse(readFileSync(${JSON.stringify(transcript)},'utf8'));const inputs=[];let results=0;
createInterface({input:process.stdin}).on('line',line=>{inputs.push(JSON.parse(line));if(inputs.length===3){writeFileSync(${JSON.stringify(wire)},JSON.stringify(inputs));void emit();}});
async function emit(){for(const event of c.events){process.stdout.write(JSON.stringify(event)+'\\n');if(event.type==='result'){results++;await new Promise(r=>setTimeout(r,150));}}}
process.stdin.on('end',()=>{writeFileSync(${JSON.stringify(drain)},JSON.stringify({results}));});`);
  const record = { schemaVersion: SCHEMA_VERSION, agentId: "claude_code", executionId: contract.target.executionId, activityId: contract.target.activityId, sessionId: contract.target.sessionId, phaseId: "1", kind: "phase", createdAt: new Date().toISOString(), model: "contract", modelDisplayName: "Contract", workingDirectory: root, runs: [], sleeps: [], steps: [] } as SessionRecord;
  let control: SessionControl | undefined; const observed: StreamEvent[] = [];
  try {
    const running = runSessionProcess({ claude: process.execPath, args: [script], cwd: root, env: process.env, prompt: "Opening fixture turn", stateDirectory: root, record, cause: "launch", live: { attemptId: contract.target.attemptId, gateDirectory: gate, configRoot: root, profile: "2.1.311/darwin", literalInput: true }, onSpawned: c => { control = c; }, onLiveEvent: e => { observed.push(e); } });
    await waitFor(() => !!control?.inputOpen?.());
    for (const input of contract.messages) {
      await withGate(gate, state => { state.inputs ??= {}; state.inputs[input.uuid] = { terminal: false }; });
      expect(await control!.sendMessage!(input.text, input.uuid)).toBe("written");
    }
    const run = await running;
    expect(contract.provenance.cliVersion).toBe("2.1.311");
    const inputs = JSON.parse(readFileSync(wire, "utf8")) as unknown[];
    expect(inputs.slice(1)).toEqual(contract.messages.map(input => ({ type: "user", uuid: input.uuid, session_id: contract.target.providerSessionId, text_not_typed: true, message: { role: "user", content: input.text } })));
    expect(JSON.parse(readFileSync(drain, "utf8"))).toEqual({ results: 3 });
    expect(run.signal).toBeUndefined(); expect(run.exitCode).toBe(0); expect(record.runs).toHaveLength(1);
    expect(observed.filter(e => e.type === "result")).toHaveLength(3);
    for (const input of contract.messages) {
      expect(observed.some(e => e.type === "result" && consumedUuids(e).includes(input.uuid))).toBe(true);
      expect(observed.find(e => e.type === "user" && e.uuid === input.uuid)).toMatchObject({ session_id: contract.target.providerSessionId, message: { role: "user", content: input.text } });
      expect(readGate(gate).inputs?.[input.uuid]?.terminal).toBe(true);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
