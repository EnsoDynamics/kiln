// Deterministic failure injection over the verified 0.162.1 work protocol; not inference proof.
import { randomUUID } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const file = process.env.KILN_CODEX_WORK_FIXTURE;
const read = () => JSON.parse(readFileSync(file, 'utf8'));
const log = value => appendFileSync(file + '.calls', JSON.stringify(value) + '\n');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
if (process.argv.includes('--version')) { console.log('codex-cli ' + (read().version ?? '0.162.1')); process.exit(0); }
if (process.argv.includes('sandbox')) { console.log('MXC_OK'); process.exit(0); }
let threadId = 'work-parent';
let turnId;
let tool;
let backgroundCleaned = false;
const threadPath = () => join(read().home, 'sessions', `${threadId}.jsonl`);
const raw = (type, payload) => appendFileSync(threadPath(), JSON.stringify({ type, timestamp: new Date().toISOString(), payload }) + '\n');
const historyFile = () => file + (read().dynamicRecord ? '.' + threadId : '') + '.history';
const history = () => existsSync(historyFile()) ? JSON.parse(readFileSync(historyFile(), 'utf8')) : [];
const complete = (status, error) => {
  const turns = history(); const turn = turns.find(turn => turn.id === turnId); if (!turn) return;
  turn.status = status; if (error) turn.error = error; writeFileSync(historyFile(), JSON.stringify(turns)); raw('event_msg', { type: 'task_complete', turn_id: turnId });
  send({ method: 'turn/completed', params: { threadId, turn } });
};
const saved = () => {
  const fixture = read();
  if (!fixture.dynamicRecord) return JSON.parse(readFileSync(fixture.recordPath, 'utf8'));
  const prd = JSON.parse(readFileSync(join(fixture.stateDirectory, 'prd.json'), 'utf8'));
  for (const [key, facts] of Object.entries(prd.phases).reverse()) {
    for (const id of [...facts.sessionIds].reverse()) {
      const record = JSON.parse(readFileSync(join(fixture.stateDirectory, key, id, 'session.json'), 'utf8'));
      if (!record.runs.at(-1)?.endedAt) return record;
    }
  }
  throw new Error('No active durable record');
};
createInterface({ input: process.stdin }).on('line', async line => {
  const message = JSON.parse(line); log(message);
  if (!message.method) return;
  if (message.method === 'account/rateLimits/read' && read().usageDelayMs) await new Promise(resolve => setTimeout(resolve, read().usageDelayMs));
  if (message.method === 'thread/read' && read().historyReadWait) {
    const gate = read().historyReadWait;
    let claimed = false; try { writeFileSync(gate + '.claimed', '', { flag: 'wx' }); claimed = true; } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (claimed) while (!existsSync(gate)) await new Promise(resolve => setTimeout(resolve, 25));
  }
  const fixture = read(); const params = message.params ?? {};
  let result;
  const model = { model: 'gpt-6.1-sol', displayName: 'GPT-6.1-Sol', description: 'Verified contract fixture', supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'low' }], defaultReasoningEffort: 'low' };
  switch (message.method) {
    case 'initialize': result = { codexHome: fixture.home, platformOs: process.platform === 'win32' ? 'windows' : 'macos', platformFamily: process.platform === 'win32' ? 'windows' : 'unix', userAgent: 'codex-cli/0.162.1' }; break;
    case 'model/list': result = { data: [model], nextCursor: null }; break;
    case 'account/read': result = { account: fixture.signedOut ? null : { type: fixture.apiKey ? 'apiKey' : 'chatgpt', email: fixture.email ?? 'proof@example.invalid', planType: 'pro' }, workspaceRouting: { chatgptAccountId: fixture.accountId ?? 'proof-account' } }; break;
    case 'account/rateLimits/read':
      if (fixture.usageError) { send({ id: message.id, error: { code: -32603, message: 'Fixture usage unavailable' } }); return; }
      result = fixture.usage ?? { accountId: fixture.accountId ?? 'proof-account', ordinaryUsageAllowed: fixture.ordinaryUsageAllowed ?? null, rateLimits: {}, rateLimitsByLimitId: {} }; break;
    case 'configRequirements/read': result = { requirements: fixture.requirements ?? null }; break;
    case 'config/read': if (fixture.configError) break; result = { config: { model_provider: fixture.provider ?? null, hooks: null } }; break;
    case 'skills/list': result = { data: params.cwds.map(cwd => ({ cwd, skills: ['implement-from-requirements','deliverable-review','test-hardening','refactor-pass','implementation-lifecycle','engineering-principles','pre-commit-validation','continuation-prompt','phase-split', ...(fixture.additionalSkills ?? [])].map(name => ({ name: 'enso-method:' + name, path: fixture.skill, enabled: true })) })) }; break;
    case 'windowsSandbox/readiness': result = { status: fixture.windowsReadiness ?? 'ready' }; break;
    case 'thread/start': case 'thread/resume': {
      if (fixture.missingThread && message.method === 'thread/resume') break;
      if (message.method === 'thread/start' && !saved().runs.at(-1)?.codex?.intentAt) throw new Error('No durable launch intent');
      threadId = params.threadId ?? (fixture.dynamicRecord ? randomUUID() : threadId);
      mkdirSync(join(fixture.home, 'sessions'), { recursive: true });
      if (!existsSync(threadPath())) { raw('session_meta', { id: threadId }); raw('world_state', { full: true, state: { environments: { environments: { local: { shell: 'sh' } } } } }); }
      const sandbox = { type: 'workspaceWrite', writableRoots: params.config.sandbox_workspace_write.writable_roots, networkAccess: true };
      result = { model: fixture.mismatch ? 'different-model' : params.model, reasoningEffort: params.config.model_reasoning_effort, modelProvider: 'openai', cwd: params.cwd, approvalPolicy: 'on-request', approvalsReviewer: fixture.badReviewer ? 'user' : 'auto_review', sandbox, instructionSources: [fixture.skill], thread: { id: threadId, sessionId: 'tree-parent', ephemeral: false, path: threadPath() } };
      if (fixture.badRoots) result.sandbox.writableRoots = [fixture.home];
      break;
    }
    case 'thread/turns/list': threadId = params.threadId; if (history().length) result = { data: history(), nextCursor: null }; break;
    case 'thread/list': result = { data: [], nextCursor: null }; break;
    case 'thread/loaded/list': result = { data: fixture.loadedThreads ?? [threadId], nextCursor: fixture.loadedCursor ?? null }; break;
    case 'thread/backgroundTerminals/list':
      if (fixture.backgroundListHang) return;
      if (fixture.backgroundListError) { send({ id: message.id, error: { code: -32603, message: 'Fixture background inventory failure' } }); return; }
      result = { data: fixture.backgroundTerminals && (!backgroundCleaned || fixture.backgroundSurvivesClean) ? [{ processId: 'terminal-1', osPid: tool?.pid ?? null }] : [], nextCursor: null }; break;
    case 'thread/backgroundTerminals/clean':
      if (fixture.backgroundCleanError) { send({ id: message.id, error: { code: -32603, message: 'Fixture background cleanup failure' } }); return; }
      backgroundCleaned = true;
      if (tool && !fixture.backgroundSurvivesClean) { try { tool.kill(); } catch { /* Already gone. */ } }
      result = {}; break;
    case 'thread/read': threadId = params.threadId; if (fixture.missingThread || !existsSync(threadPath())) break; result = { thread: { id: threadId, path: threadPath(), status: { type: 'idle' } } }; break;
    case 'turn/start': {
      const record = saved();
      if (record.conversation?.threadId !== threadId || !record.runs.at(-1).codex.dispatch) throw new Error('Identity and dispatch intent must be saved before work');
      const attempt = record.runs.at(-1);
      if (attempt.cause === 'limit_resume') {
        const consumed = record.codex?.usageRecovery?.consumed;
        if (!consumed?.fingerprint || consumed.fingerprint !== attempt.codex.automaticUsageEvidence?.fingerprint || consumed.accountId !== attempt.codex.account.accountId) throw new Error('Automatic usage permission must be durably consumed before dispatch');
      }
      turnId = `turn-${history().length + 1}`;
      const turn = { id: turnId, status: 'inProgress', items: [], itemsView: 'full' };
      writeFileSync(historyFile(), JSON.stringify([...history(), turn]));
      raw('event_msg', { type: 'task_started', turn_id: turnId });
      raw('turn_context', { turn_id: turnId, model: fixture.observedMismatch ? 'observed-other' : params.model, effort: params.effort, cwd: process.cwd() });
      send({ method: 'turn/started', params: { threadId, turn } });
      if (fixture.dropDispatch) { process.exit(1); }
      result = { turn: { ...turn } };
      const finish = () => {
        const error = fixture.usageRefusal ? { message: 'Allowance exhausted; prose reset is not structured evidence.', codexErrorInfo: 'usageLimitExceeded', additionalDetails: 'Try again tomorrow.' } : fixture.terminalError;
        if (error || fixture.retryError) send({ method: 'error', params: { threadId, turnId, error: error ?? fixture.retryError, willRetry: !error } });
        if (fixture.command) {
          const command = fixture.command;
          const callId = 'command-' + turnId;
          raw('response_item', { type: 'function_call', name: 'exec_command', call_id: callId, arguments: JSON.stringify({ cmd: command, workdir: process.cwd() }) });
          const item = { type: 'commandExecution', id: callId, command, cwd: process.cwd(), status: 'inProgress', aggregatedOutput: null, exitCode: null };
          send({ method: 'item/started', params: { threadId, turnId, item } });
          // Fixture programs and retained command evidence use POSIX shell syntax on every host.
          const result = spawnSync('sh', ['-c', command], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
          Object.assign(item, { status: result.status === 0 ? 'completed' : 'failed', aggregatedOutput: result.stdout + result.stderr, exitCode: result.status });
          const turns = history(); turns.find(turn => turn.id === turnId).items.push(item); writeFileSync(historyFile(), JSON.stringify(turns));
          raw('response_item', { type: 'function_call_output', call_id: callId, output: result.stdout + result.stderr });
          raw('event_msg', { type: 'item_completed', thread_id: threadId, turn_id: turnId, item: { type: 'CommandExecution', id: callId, command: ['/bin/sh', '-c', command], cwd: process.cwd(), status: item.status } });
          send({ method: 'item/completed', params: { threadId, turnId, item } });
        }
        if ((!error || fixture.modelBeforeRefusal) && !(fixture.toolOnlyFirst && history().length === 1)) {
          if (fixture.deltas) send({ method: 'item/agentMessage/delta', params: { threadId, turnId, itemId: 'final-' + turnId, delta: 'Fixture streaming' } });
          const item = { id: 'final-' + turnId, type: 'agentMessage', phase: 'final_answer', text: 'Fixture final ' + turnId, ...(fixture.asyncQuestions ? { questions: [{ question: 'Need a person' }] } : {}) };
          send({ method: 'item/completed', params: { threadId, turnId, item, completedAtMs: Date.now() } });
        }
        complete(error || fixture.terminalFailure ? 'failed' : 'completed', error);
      };
      if (fixture.request) send({ id: 'human-request', method: fixture.request, params: { threadId, turnId, itemId: 'approval', questions: [{ question: 'Need a person' }] } });
      if (fixture.toolProcess) {
        const program = fixture.doubleFork
          ? `const {spawn}=require('node:child_process'); const {writeFileSync}=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:process.platform!=='win32',stdio:${fixture.inheritPipes ? "['ignore','inherit','inherit']" : "'ignore'"}}); writeFileSync(${JSON.stringify(file + '.tool')},String(child.pid)); child.unref();`
          : 'setInterval(()=>{},1000)';
        tool = spawn(process.execPath, ['-e', program], { detached: process.platform !== 'win32', stdio: fixture.inheritPipes ? ['ignore', 'inherit', 'inherit'] : 'ignore' });
        if (!fixture.doubleFork) writeFileSync(file + '.tool', String(tool.pid));
        tool.unref();
      }
      if (fixture.earlyTerminal) finish();
      else if (!fixture.hang) setTimeout(finish, fixture.delayMs ?? 50);
      break;
    }
    case 'turn/interrupt': complete('interrupted'); result = {}; break;
    default: if (message.id === undefined) return;
  }
  if (message.id !== undefined) send(result === undefined ? { id: message.id, error: { code: -32601, message: 'Fixture refusal ' + message.method } } : { id: message.id, result });
});
process.stdin.on('end', () => process.exit(0));
