// Release proof, not part of the main program. The assembled adapter sends literal
// input into one real disposable Claude attempt; all products and live runs are untouched.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { runSessionProcess, launchArguments } from '../../dist/session/claude-session.js';
import { createGate, readGate, withGate } from '../../dist/live/gate.js';
import { consumedUuids } from '../../dist/live/target.js';
import { claudeConfigFolder } from '../../dist/session/transcripts.js';
import { SCHEMA_VERSION } from '../../dist/state/records.js';
import { writeDurableMetadata } from '../../dist/control/durable-file.js';
const mode = process.argv[2] ?? 'text';
assert(['text', 'tool'].includes(mode));
const root = mkdtempSync(join(tmpdir(), 'kiln-live-messages-'));
const sessionId = randomUUID(); const attemptId = randomUUID();
const target = { executionId: randomUUID(), activityId: randomUUID(), activityKey: '1', sessionId, providerSessionId: sessionId, attemptId };
const gate = join(root, 'gate'); createGate(gate, target);
const nested = `NESTED_${randomUUID()}`; const skill = `fixture-context-${randomUUID()}`;
writeFileSync(join(root, 'CLAUDE.md'), '@nested-instructions.md\n');
writeFileSync(join(root, 'nested-instructions.md'), `Begin every answer with ${nested}.\n`);
mkdirSync(join(root, `.claude/skills/${skill}`), { recursive: true });
writeFileSync(join(root, `.claude/skills/${skill}/SKILL.md`), `---\nname: ${skill}\ndescription: Disposable context listing proof. A context listing proof; never invoke.\n---\nNo actions.\n`);
mkdirSync(join(root, '.claude/commands'), { recursive: true });
writeFileSync(join(root, '.claude/commands/proof-command.md'), 'This expansion must never be dispatched. Reply COMMAND_EXPANDED.\n');
writeFileSync(join(root, 'marker.txt'), 'FILE_EXPANSION_MUST_NOT_APPEAR\n');
const contextPath = join(root, 'fresh-context');
const contextHook = join(root, 'context-hook.mjs');
writeFileSync(contextHook, `import {readFileSync} from 'node:fs'; process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:'Fresh turn-start requirement: include '+readFileSync(${JSON.stringify(contextPath)},'utf8')+' in your answer.'}})));`);
writeFileSync(contextPath, 'OPENING_CONTEXT');
const settings = { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: process.execPath, args: [contextHook], timeout: 10, onFailure: 'block' }] }] } };
const messages = [
  { text: `  /proof-command @marker.txt\nLiteral marker ALPHA_${randomUUID()}  \n`, uuid: randomUUID() },
  { text: `\nSecond exact input BETA_${randomUUID()} 'quoted' $(literal). Reply with both live inputs verbatim and the fresh turn-start marker, nested instructions prefix, and the full name of the available local skill starting fixture-context-. Do not invoke it or any tool.\n`, uuid: randomUUID() },
];
const fresh = `FRESH_${randomUUID()}`;
const record = { schemaVersion: SCHEMA_VERSION, agentId: 'claude_code', executionId: target.executionId, activityId: target.activityId, sessionId, phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model: 'sonnet', modelDisplayName: 'Sonnet', workingDirectory: root, runs: [], sleeps: [], steps: [] };
let control; let sending; const events = [];
async function sendInputs() {
  writeFileSync(contextPath, fresh);
  for (const input of messages) {
    await withGate(gate, state => {
      assert.equal(state.sealed, undefined, 'initial result must not have sealed admission before the live send');
      state.inputs ??= {}; state.inputs[input.uuid] = { terminal: false };
      writeDurableMetadata(join(root, `${input.uuid}.json`), { target, ...input, writeStartedAt: new Date().toISOString() });
      writeDurableMetadata(join(gate, 'gate.json'), state);
      input.write = control.sendMessage(input.text, input.uuid);
    });
    assert.equal(await input.write, 'written');
  }
}
const run = await runSessionProcess({ claude: 'claude', args: [...launchArguments(sessionId, 'sonnet', undefined), '--replay-user-messages', '--tools', mode === 'tool' ? 'Bash,Skill' : 'Skill', '--allowedTools', 'Bash', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--settings', JSON.stringify(settings), '--append-system-prompt', mode === 'tool' ? 'Disposable protocol proof. Only the one requested Bash sleep is permitted. Never invoke skills, delegate or perform other tool calls. Obey already-loaded instructions.' : 'Disposable protocol proof. Do not invoke skills, delegate, call tools or inspect any files. Obey the already-loaded instructions.'], cwd: root, env: process.env,
  prompt: mode === 'tool' ? 'Use exactly one Bash call: echo TOOL_STARTED > operation-started.txt; sleep 4; echo TOOL_FINISHED > operation-finished.txt. Let it finish naturally. Then answer any live instruction. No other tools or skills.' : 'Generate 160 numbered lines about counting, long enough to exercise streamed text. Never call tools. Later messages may arrive while streaming.', cause: 'launch', stateDirectory: root, record,
  live: { attemptId, gateDirectory: gate, configRoot: claudeConfigFolder(process.env), profile: '2.1.311/darwin', literalInput: true },
  onSpawned: value => { control = value; }, onPartial: () => { if (mode === 'text' && !sending && control?.inputOpen()) sending = sendInputs(); },
  onLiveEvent: (event, at) => { events.push({ event, at }); if (mode === 'tool' && !sending && event.type === 'assistant' && event.message?.content?.some(b => b.type === 'tool_use' && b.name === 'Bash')) sending = (async () => { const until = Date.now() + 15000; while (!existsSync(join(root, 'operation-started.txt')) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20)); assert(existsSync(join(root, 'operation-started.txt')) && !existsSync(join(root, 'operation-finished.txt')), 'send must occur during the admitted operation'); await sendInputs(); })(); },
});
await sending;
writeFileSync(join(root, 'proof.json'), JSON.stringify({ target, messages: messages.map(({text, uuid}) => ({text, uuid})), events, run, fresh, nested, skill }, null, 2));
console.log(JSON.stringify({ evidence: join(root, 'proof.json') }));
assert.equal(run.exitCode, 0); assert.equal(run.signal, undefined);
const results = events.filter(e => e.event.type === 'result');
assert.equal(run.claudeResults.count, results.length);
assert.equal(run.claudeResults.cumulativeCostUsd, results.at(-1).event.total_cost_usd);
assert(results.length >= (mode === 'text' ? 2 : 1), 'the first result must not close input while additional messages await a later result');
for (const input of messages) {
  assert(results.some(e => consumedUuids(e.event).includes(input.uuid)), 'each live input needs a correlated terminal result');
  assert.equal(readGate(gate).inputs[input.uuid].terminal, true);
}
const replay = events.filter(e => e.event.type === 'user' && messages.some(m => m.uuid === e.event.uuid));
assert(replay.length > 0, 'provider replay must retain input identity');
for (const input of messages) assert(replay.some(({event}) => event.uuid === input.uuid && event.message.content === input.text), 'exact original whitespace and UUID must survive the provider replay');
// CLI may coalesce two messages into the last UUID; independent text sidecars preserve each original.
assert(replay.every(({event}) => !JSON.stringify(event.message).includes('FILE_EXPANSION_MUST_NOT_APPEAR')));
const output = events.filter(e => e.event.type === 'assistant').map(e => JSON.stringify(e.event.message)).join('\n');
const tools = events.filter(e => e.event.type === 'assistant').flatMap(e => e.event.message?.content?.filter(b => b.type === 'tool_use') ?? []);
assert.equal(tools.length, mode === 'tool' ? 1 : 0, 'only the deliberately requested operation is permitted');
if (mode === 'tool') { assert.equal(tools[0].name, 'Bash'); assert(existsSync(join(root, 'operation-finished.txt')), 'the in-flight operation must finish naturally'); }
assert(output.includes(fresh), 'fresh hook context must survive literal input');
assert(output.includes(nested), 'nested CLAUDE instructions must survive literal input');
assert(output.includes(skill), 'fixture skill listing must survive literal input');
assert(!output.includes('FILE_EXPANSION_MUST_NOT_APPEAR'), 'literal file syntax must not expand');
writeFileSync(join(root, 'proof.json'), JSON.stringify({ target, messages: messages.map(({text, uuid}) => ({text, uuid})), events, run, fresh, nested, skill }, null, 2));
console.log(JSON.stringify({ passed: true, mode, evidence: join(root, 'proof.json'), results: results.length, literalInput: true, freshContext: true, noSignal: true }));
