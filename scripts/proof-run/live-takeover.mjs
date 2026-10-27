// Exploration/release proof, not part of the main program. Runs the assembled Claude
// adapter and packaged gate in a disposable folder; never operates on a product repo.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { clearInterval } from 'node:timers';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runSessionProcess, launchArguments } from '../../dist/session/claude-session.js';
import { createGate, readGate, withGate, unsettled } from '../../dist/live/gate.js';
import { requireExited, requireHistory, requireNoTerminal } from '../../dist/live/ownership.js';
import { claudeConfigFolder } from '../../dist/session/transcripts.js';
const requestedMode = process.argv[2] ?? 'foreground';
if (requestedMode === 'terminal' && !process.env.KILN_PROOF_TERMINAL_CWD) throw new Error('Set KILN_PROOF_TERMINAL_CWD to an already trusted disposable directory for the ordinary-terminal proof.');
const root = mkdtempSync(join(tmpdir(), 'kiln-live-takeover-'));
const sessionId = randomUUID(); const attemptId = randomUUID();
const target = { executionId: randomUUID(), activityId: randomUUID(), activityKey: '1', sessionId, providerSessionId: sessionId, attemptId };
const gate = join(root, 'gate'); createGate(gate, target);
const mode = requestedMode;
const command = `sleep 4; echo FIRST > first.txt${mode === 'failed' ? '; exit 7' : ''}`;
const settings = { hooks: Object.fromEntries(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch'].map(event => [event, [{ hooks: [{ type: 'command', command: process.execPath, args: [fileURLToPath(new URL('../../dist/live/checkpoint-hook.js', import.meta.url)), gate], timeout: 10, onFailure: 'block' }] }]])) };
const agents = { 'probe-worker': { description: 'Disposable safe checkpoint probe', prompt: `Use a first Bash call for ${JSON.stringify(command)}. Then a SECOND separate Bash call for 'echo SECOND > second.txt'. Both operations are mandatory unless a hook stops you.`, tools: ['Bash'], model: 'sonnet' } };
const record = { schemaVersion: 11, agentId: 'claude_code', executionId: target.executionId, activityId: target.activityId, sessionId, phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model: 'sonnet', modelDisplayName: 'Sonnet', workingDirectory: root, runs: [], sleeps: [], steps: [] };
let held = false;
const polling = setInterval(() => {
  if (held || !Object.values(readGate(gate).operations).some(o => o.name === 'Bash')) return;
  held = true;
  void withGate(gate, state => { state.held = { operationId: 'proof', instructionId: 'proof', requestedAt: new Date().toISOString() }; });
}, 50);
const run = await runSessionProcess({ claude: 'claude', args: [...launchArguments(sessionId, 'sonnet', undefined), '--tools', mode.includes('agent') ? 'Agent,Bash' : 'Bash', '--allowedTools', 'Bash', 'Agent', ...(mode.includes('agent') ? ['--agents', JSON.stringify(agents)] : []), '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--settings', JSON.stringify(settings), '--system-prompt', 'Follow the disposable probe instructions. Work only in cwd. No skills or delegation.'], cwd: root, env: process.env, prompt: mode.includes("agent") ? `Use Agent with subagent_type probe-worker${mode === "background-agent" ? " and run_in_background true" : ""}. Its task is both mandatory operations in its instructions. Do no other work.` : mode === "background" ? `Use Bash for ${JSON.stringify(command)} with run_in_background true. Then a SECOND SEPARATE Bash call for echo SECOND > second.txt. Do not combine.` : `Disposable safe-yield proof. Use one Bash call for ${JSON.stringify(command)}. Then a SECOND SEPARATE Bash call for 'echo SECOND > second.txt', even if the first fails. Do not combine calls. Both operations are mandatory unless a hook stops you.`, cause: 'launch', stateDirectory: root, record, live: { attemptId, gateDirectory: gate, configRoot: claudeConfigFolder(process.env), profile: '2.1.311/darwin' } });
clearInterval(polling);
assert.equal(held, true); assert.equal(existsSync(join(root, 'first.txt')), true); assert.equal(existsSync(join(root, 'second.txt')), false);
assert.equal(run.signal, undefined); assert.equal(run.exitCode, 0);
assert.deepEqual(unsettled(readGate(gate)), []);
await requireExited(run); requireHistory(process.env, sessionId); await requireNoTerminal(process.env, sessionId);
let terminalProof;
if (mode === 'terminal') {
  const stopFile = join(root, 'terminal-exit');
  const terminal = spawn('python3', [fileURLToPath(new URL('./live-terminal-owner.py', import.meta.url)), process.env.KILN_PROOF_TERMINAL_CWD ?? root, sessionId, stopFile], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exit = once(terminal, 'exit');
  let refused = false;
  const until = Date.now() + 10000;
  while (Date.now() < until) {
    try { await requireNoTerminal(process.env, sessionId); }
    catch (error) { if (error.code === 'terminal_in_use') { refused = true; break; } throw error; }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(refused, true, 'ordinary terminal must block hand-back');
  await new Promise(resolve => setTimeout(resolve, 1500));
  writeFileSync(stopFile, 'exit');
  const [code] = await exit; assert.equal(code, 0);
  await requireNoTerminal(process.env, sessionId);
  terminalProof = { cwd: process.env.KILN_PROOF_TERMINAL_CWD, existingOrPendingOwnerRefused: true, cleanExitCode: code, noOwnerAfterExit: true };
}
const evidence = { root, mode, ...(terminalProof ? { terminalProof } : {}), target, run, gate: readGate(gate), first: readFileSync(join(root, 'first.txt'), 'utf8'), secondExists: false, checkedAt: new Date().toISOString() };
writeFileSync(join(root, 'proof.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ passed: true, evidence: resolve(root, 'proof.json'), unfinishedWorkPreserved: true, noSignal: true }));
