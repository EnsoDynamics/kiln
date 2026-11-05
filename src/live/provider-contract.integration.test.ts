// AC-MSG-01/02/04, AC-AGENT-03: replay each recorded real-Claude message contract (2.1.311 and
// the newest version npm run test:live-proof recorded) through the real adapter. This is
// recorded contract evidence, not a claim of a new live model run.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runSessionProcess, type SessionControl } from "../session/claude-session.js";
import { type StreamEvent } from "../session/session-output.js";
import { consumedUuids } from "./target.js";
import { createGate, readGate, withGate } from "./gate.js";
import { SCHEMA_VERSION, type SessionRecord } from "../state/records.js";
import { waitFor } from "../test-support/engine-harness.js";
import { compareToMinimum, TOOLING_MINIMUMS } from "../agents/tooling-minimums.js";
import { messageContractProblem } from "./target.js";

const fixtures = new URL("../../test/fixtures/live-control/", import.meta.url);
const versions = readdirSync(fixtures).map(name => /^claude-(.+)-message-contract\.json$/.exec(name)?.[1]).filter((version): version is string => !!version);

it("has the minimum's recorded contract and one from a newer Claude Code", () => {
  expect(versions).toContain(TOOLING_MINIMUMS.claudeCode);
  expect(versions.some(version => compareToMinimum("claudeCode", version).state === "supported" && version !== TOOLING_MINIMUMS.claudeCode)).toBe(true);
});

it.each(versions)("preserves the verified literal user wire contract recorded on Claude Code %s and drains only after all its recorded Claude results", async version => {
  const fixture = readFileSync(new URL(`claude-${version}-message-contract.json`, fixtures), "utf8");
  const contract = JSON.parse(fixture) as { provenance: { cliVersion: string }; target: { executionId: string; activityId: string; activityKey: string; sessionId: string; providerSessionId: string; attemptId: string }; messages: { text: string; uuid: string }[]; events: StreamEvent[] };
  const root = mkdtempSync(join(tmpdir(), "kiln-provider-contract-"));
  const gate = join(root, "gate"); createGate(gate, contract.target);
  const transcript = join(root, "contract.json"); writeFileSync(transcript, fixture);
  const wire = join(root, "wire.json"); const drain = join(root, "drain.json"); const script = join(root, "provider.mjs");
  // Delay between the real recorded turns makes a first-result-close regression visible.
  writeFileSync(script, `import{readFileSync,writeFileSync}from'node:fs';import{createInterface}from'node:readline';
const c=JSON.parse(readFileSync(${JSON.stringify(transcript)},'utf8'));const inputs=[];let results=0;
createInterface({input:process.stdin}).on('line',line=>{inputs.push(JSON.parse(line));if(inputs.length===${contract.messages.length + 1}){writeFileSync(${JSON.stringify(wire)},JSON.stringify(inputs));void emit();}});
async function emit(){for(const event of c.events){process.stdout.write(JSON.stringify(event)+'\\n');if(event.type==='result'){results++;await new Promise(r=>setTimeout(r,150));}}}
process.stdin.on('end',()=>{writeFileSync(${JSON.stringify(drain)},JSON.stringify({results}));});`);
  const record = { schemaVersion: SCHEMA_VERSION, agentId: "claude_code", executionId: contract.target.executionId, activityId: contract.target.activityId, sessionId: contract.target.sessionId, phaseId: "1", kind: "phase", createdAt: new Date().toISOString(), model: "contract", modelDisplayName: "Contract", workingDirectory: root, runs: [], sleeps: [], steps: [] } as SessionRecord;
  let control: SessionControl | undefined; const observed: StreamEvent[] = [];
  try {
    const running = runSessionProcess({ claude: process.execPath, args: [script], cwd: root, env: process.env, prompt: "Opening fixture turn", stateDirectory: root, record, cause: "launch", live: { attemptId: contract.target.attemptId, gateDirectory: gate, configRoot: root, profile: `claude-code-${version}/darwin`, agentVersion: version, literalInput: true, messageContract: "unproven", hookContract: "unproven" }, onSpawned: c => { control = c; }, onLiveEvent: e => { observed.push(e); } });
    await waitFor(() => !!control?.inputOpen?.());
    for (const input of contract.messages) {
      await withGate(gate, state => { state.inputs ??= {}; state.inputs[input.uuid] = { terminal: false }; });
      expect(await control!.sendMessage!(input.text, input.uuid)).toBe("written");
    }
    const run = await running;
    expect(contract.provenance.cliVersion).toBe(version);
    // Every recorded receipt field is in the form Kiln recognises (Live message recognition).
    expect(contract.events.map(event => messageContractProblem(event)).filter(Boolean)).toEqual([]);
    const inputs = JSON.parse(readFileSync(wire, "utf8")) as unknown[];
    expect(inputs.slice(1)).toEqual(contract.messages.map(input => ({ type: "user", uuid: input.uuid, session_id: contract.target.providerSessionId, text_not_typed: true, message: { role: "user", content: input.text } })));
    const recordedResults = contract.events.filter(e => e.type === "result").length;
    expect(JSON.parse(readFileSync(drain, "utf8"))).toEqual({ results: recordedResults });
    expect(run.signal).toBeUndefined(); expect(run.exitCode).toBe(0); expect(record.runs).toHaveLength(1);
    expect(observed.filter(e => e.type === "result")).toHaveLength(recordedResults);
    for (const input of contract.messages) {
      expect(observed.some(e => e.type === "result" && consumedUuids(e).includes(input.uuid))).toBe(true);
      expect(observed.find(e => e.type === "user" && e.uuid === input.uuid)).toMatchObject({ session_id: contract.target.providerSessionId, message: { role: "user", content: input.text } });
      expect(readGate(gate).inputs?.[input.uuid]?.terminal).toBe(true);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
