// Opt-in real-provider proof; no inference or timing-dependent assertions in CI.
// node scripts/proof-run/required-background-work-proof.mjs claude|codex
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearTimeout } from 'node:timers';
import { launchArguments, runSessionProcess } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { SCHEMA_VERSION } from '../../dist/state/records.js';

const provider = process.argv[2];
if (!['claude', 'codex'].includes(provider)) throw new Error('Choose claude or codex');
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-required-work-${provider}-`)));
execFileSync('git', ['init', '-b', 'proof'], { cwd: root, stdio: 'ignore' });
writeFileSync(join(root, 'AGENTS.md'), '# Disposable Kiln proof\nWork only here. No commits, pushes, deployments or changes to instructions.\n');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const command = `${quote(process.execPath)} -e ${quote("setTimeout(()=>{require('node:fs').writeFileSync('worker-finished.txt','DONE');console.log('WORKER_DONE')},4000)")}`;
const finalizer = join(root, 'finish-required-work.mjs');
writeFileSync(finalizer, "import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';assert.equal(readFileSync('worker-finished.txt','utf8'),'DONE');writeFileSync('parent-finished.txt','PARENT_DONE');\n");
const finishCommand = `${quote(process.execPath)} ${quote(finalizer)}`;
const prompt = readFileSync(new URL(`./required-background-work-${provider}-prompt.txt`, import.meta.url), 'utf8').replaceAll('{{COMMAND}}', command).replaceAll('{{FINISH_COMMAND}}', finishCommand);
const sessionId = randomUUID();
const record = { schemaVersion: SCHEMA_VERSION, agentId: provider === 'claude' ? 'claude_code' : 'codex', sessionId, phaseId: 'pr', kind: 'pull_request', createdAt: new Date().toISOString(), model: provider === 'claude' ? 'sonnet' : 'gpt-6.1-sol', modelDisplayName: provider, ...(provider === 'codex' ? { effort: 'high' } : {}), workingDirectory: root, runs: [], sleeps: [], steps: [] };
const controller = new globalThis.AbortController(); let control; let killTimer;
const timer = setTimeout(() => { controller.abort(); control?.interrupt(); killTimer = setTimeout(() => control?.endTree('SIGKILL'), 30_000); }, 180_000);
try {
  const options = { cwd: root, env: process.env, record, stateDirectory: join(root, 'state'), prompt, cause: 'launch', onSpawned: value => { control = value; } };
  const run = provider === 'claude'
    ? await runSessionProcess({ ...options, claude: 'claude', env: { ...process.env, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '1' }, args: [...launchArguments(sessionId, record.model, undefined), '--tools', 'Bash,Agent', '--allowedTools', 'Bash', 'Agent', '--agents', JSON.stringify({ 'proof-reviewer': { description: 'Disposable reviewer finishing one required command', prompt: 'Run the exact assigned command in cwd, wait for its exit and report its output. No other work.', tools: ['Bash'], model: 'sonnet' } }), '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '', '--system-prompt', 'Follow this disposable integration proof. Work only in cwd. No skills, commits, pushes or deployments.'] })
    : await runCodexSession({ ...options, executable: 'codex', repositories: [{ path: root, branch: 'proof' }], writableRoots: [root], signal: controller.signal });
  assert.equal(controller.signal.aborted, false, 'Provider proof exceeded its deadline');
  assert.equal(run.interruptedBy, undefined);
  assert.equal(readFileSync(join(root, 'worker-finished.txt'), 'utf8').trim(), 'DONE');
  assert.equal(readFileSync(join(root, 'parent-finished.txt'), 'utf8').trim(), 'PARENT_DONE');
  const events = readFileSync(join(root, 'state', 'pr', sessionId, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).event);
  if (provider === 'claude') {
    assert.equal(run.exitCode, 0); assert.equal(run.result?.isError, false);
    const child = events.find(event => event.subtype === 'task_started' && event.task_type === 'local_agent' && event.is_backgrounded);
    assert(child, 'Proof did not exercise a background reviewer');
    const completed = events.findIndex(event => event.subtype === 'task_notification' && event.task_id === child.task_id && event.run_id === child.run_id && event.status === 'completed');
    const finished = events.findIndex(event => event.type === 'assistant' && !event.parent_tool_use_id && event.message?.content?.some(block => block.type === 'tool_use' && block.name === 'Bash' && block.input?.command?.includes(finalizer)));
    assert(completed >= 0 && finished > completed, 'Parent must consume native reviewer completion before finalizing');
  } else {
    assert.equal(run.codex?.failure, undefined);
    assert.equal(run.codex?.terminal?.status, 'completed');
    assert.equal(run.codex?.cleanup, 'tracked_processes_stopped');
    const completed = events.findIndex(event => event.method === 'item/completed' && event.params?.item?.type === 'commandExecution' && event.params.item.status === 'completed' && event.params.item.exitCode === 0 && event.params.item.command?.includes('worker-finished.txt'));
    const finished = events.findIndex(event => event.method === 'item/completed' && event.params?.item?.type === 'commandExecution' && event.params.item.status === 'completed' && event.params.item.exitCode === 0 && event.params.item.command?.includes(finalizer));
    assert(completed >= 0 && finished > completed, 'Parent must receive the native command outcome before finalizing');
  }
  const result = { provider, root, sessionId, passed: true, task: 'required subprocess finishes before parent completion', automaticRetries: 0 };
  writeFileSync(join(root, 'proof-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { clearTimeout(timer); clearTimeout(killTimer); }
