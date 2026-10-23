// Deterministic failure injection over the verified 0.162.1 work protocol; not inference proof.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const file = process.env.KILN_CODEX_WORK_FIXTURE;
const read = () => JSON.parse(readFileSync(file, 'utf8'));
const log = value => appendFileSync(file + '.calls', JSON.stringify(value) + '\n');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
if (process.argv.includes('--version')) { console.log('codex-cli 0.162.1'); process.exit(0); }
if (process.argv.includes('sandbox')) { console.log('MXC_OK'); process.exit(0); }
let threadId = 'work-parent';
let turnId;
let tool;
let backgroundCleaned = false;
const threadPath = () => join(read().home, 'sessions', `${threadId}.jsonl`);
const raw = (type, payload) => appendFileSync(threadPath(), JSON.stringify({ type, timestamp: new Date().toISOString(), payload }) + '\n');
const historyFile = () => file + '.history';
const history = () => existsSync(historyFile()) ? JSON.parse(readFileSync(historyFile(), 'utf8')) : [];
const complete = status => {
  const turns = history(); const turn = turns.find(turn => turn.id === turnId); if (!turn) return;
  turn.status = status; writeFileSync(historyFile(), JSON.stringify(turns)); raw('event_msg', { type: 'task_complete', turn_id: turnId });
  send({ method: 'turn/completed', params: { threadId, turn } });
};
const saved = () => JSON.parse(readFileSync(read().recordPath, 'utf8'));
createInterface({ input: process.stdin }).on('line', async line => {
  const message = JSON.parse(line); log(message);
  if (!message.method) return;
  const fixture = read(); const params = message.params ?? {};
  let result;
  const model = { model: 'gpt-6.1-sol', displayName: 'GPT-6.1-Sol', description: 'Verified contract fixture', supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'low' }], defaultReasoningEffort: 'low' };
  switch (message.method) {
    case 'initialize': result = { codexHome: fixture.home, platformOs: process.platform === 'win32' ? 'windows' : 'macos', platformFamily: process.platform === 'win32' ? 'windows' : 'unix', userAgent: 'codex-cli/0.162.1' }; break;
    case 'model/list': result = { data: [model], nextCursor: null }; break;
    case 'account/read': result = { account: fixture.signedOut ? null : { type: 'chatgpt', email: fixture.email ?? 'proof@example.invalid', planType: 'pro' }, workspaceRouting: { chatgptAccountId: fixture.accountId ?? 'proof-account' } }; break;
    case 'account/rateLimits/read': result = { accountId: fixture.accountId ?? 'proof-account', rateLimitsByLimitId: {} }; break;
    case 'configRequirements/read': result = { requirements: fixture.requirements ?? null }; break;
    case 'config/read': result = { config: { model_provider: null, hooks: null } }; break;
    case 'skills/list': result = { data: params.cwds.map(cwd => ({ cwd, skills: ['implement-from-requirements','deliverable-review','test-hardening','refactor-pass','implementation-lifecycle','engineering-principles','pre-commit-validation','continuation-prompt','phase-split'].map(name => ({ name: 'enso-method:' + name, path: fixture.skill, enabled: true })) })) }; break;
    case 'windowsSandbox/readiness': result = { status: fixture.windowsReadiness ?? 'ready' }; break;
    case 'thread/start': case 'thread/resume': {
      if (fixture.missingThread && message.method === 'thread/resume') break;
      if (message.method === 'thread/start' && !saved().runs.at(-1)?.codex?.intentAt) throw new Error('No durable launch intent');
      threadId = params.threadId ?? threadId;
      mkdirSync(join(fixture.home, 'sessions'), { recursive: true });
      if (!existsSync(threadPath())) raw('session_meta', { id: threadId });
      const sandbox = { type: 'workspaceWrite', writableRoots: params.config.sandbox_workspace_write.writable_roots, networkAccess: true };
      result = { model: fixture.mismatch ? 'different-model' : params.model, reasoningEffort: params.config.model_reasoning_effort, modelProvider: 'openai', cwd: params.cwd, approvalPolicy: 'on-request', approvalsReviewer: fixture.badReviewer ? 'user' : 'auto_review', sandbox, instructionSources: [fixture.skill], thread: { id: threadId, sessionId: 'tree-parent', ephemeral: false, path: threadPath() } };
      if (fixture.badRoots) result.sandbox.writableRoots = [fixture.home];
      break;
    }
    case 'thread/turns/list': if (history().length) result = { data: history(), nextCursor: null }; break;
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
    case 'thread/read': result = { thread: { id: threadId, path: threadPath(), status: { type: 'idle' } } }; break;
    case 'turn/start': {
      const record = saved();
      if (record.conversation?.threadId !== threadId || !record.runs.at(-1).codex.dispatch) throw new Error('Identity and dispatch intent must be saved before work');
      turnId = `turn-${history().length + 1}`;
      const turn = { id: turnId, status: 'inProgress', items: [], itemsView: 'full' };
      writeFileSync(historyFile(), JSON.stringify([...history(), turn]));
      raw('event_msg', { type: 'task_started', turn_id: turnId });
      raw('turn_context', { turn_id: turnId, model: fixture.observedMismatch ? 'observed-other' : params.model, effort: params.effort, cwd: process.cwd() });
      send({ method: 'turn/started', params: { threadId, turn } });
      if (fixture.dropDispatch) { process.exit(1); }
      result = { turn: { ...turn } };
      const finish = () => {
        const item = { id: 'final-' + turnId, type: 'agentMessage', phase: 'final_answer', text: 'Fixture final ' + turnId, ...(fixture.asyncQuestions ? { questions: [{ question: 'Need a person' }] } : {}) };
        send({ method: 'item/completed', params: { threadId, turnId, item, completedAtMs: Date.now() } });
        complete(fixture.terminalFailure ? 'failed' : 'completed');
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
