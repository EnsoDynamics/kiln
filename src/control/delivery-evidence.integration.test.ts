// AC-ACT-05: real Codex-shaped dispatch/journal, then evidence-only RPC queries.
// The protocol peer is covered by the separately recorded actual-provider proof.
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { Engine } from '../engine/engine.js';
import { prdTreeAtHead } from '../engine/worktree-setup.js';
import { createHarness, type Harness } from '../test-support/engine-harness.js';
import { codexWorkFixture } from '../test-support/codex-work-fixture.js';
import { historyFixture } from '../test-support/codex-history-fixture.js';
import type { Receipt } from './commands.js';
import { deliveredInHistory } from './delivery-evidence.js';

let h: Harness;
let work: ReturnType<typeof codexWorkFixture>;
let history: ReturnType<typeof historyFixture>;
afterEach(async () => { await h?.engine.stop('sigint'); await h?.cleanup(); await work?.sandbox.cleanup(); await history?.sandbox.cleanup(); });

it('requires the exact Codex thread, turn and user text before recording delivered, without redispatch or session writes', async () => {
  h = await createHarness({ sessions: [], claude: join('missing', 'claude') });
  work = codexWorkFixture(); Object.assign(h.tools, { codex: work.options.executable }); work.configureEnvironment(h.env);
  work.set({ dynamicRecord: true, stateDirectory: h.stateDirectory }); h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  await h.engine.changeSettings({ agentId: 'codex' }); await h.engine.agents.refresh();
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  const input = { command_id: 'codex-history-proof', execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: 'reply', inputs: { message: 'Literal "quoted" reply\n$(echo data) 🐦' } };
  expect(h.engine.commands.submit(input).ok).toBe(true); await h.engine.commands.settled(); await h.engine.settled();
  const receipt = h.engine.commands.lookup(input.command_id).operation as Receipt;
  expect(receipt).toMatchObject({ state: 'completed', effects: { reply: 'submitted', session: 'resumed', plan: 'not_advanced' } });
  const session = h.engine.latestSession('1')!; const threadId = session.conversation!.threadId!; const run = session.runs.at(-1)!;
  expect(session.runs).toHaveLength(2); expect(run.control?.operationId).toBe(receipt.id);
  const dispatch = work.calls().filter(call => call.method === 'turn/start').at(-1)!;
  const prompt = (dispatch.params!.input as { type: string; text: string }[]).map(item => item.text).join('');
  expect(prompt).toContain(input.inputs.message);
  const sessionFile = join(h.stateDirectory, '1', session.sessionId, 'session.json'); const before = readFileSync(sessionFile);
  const turnCount = work.calls().filter(call => call.method === 'turn/start').length;
  history = historyFixture(); const thread = history.addThread(threadId);
  const executable = join(history.sandbox.root, process.platform === 'win32' ? 'codex.cmd' : 'codex'); copyFileSync(history.options.executable!, executable); chmodSync(executable, 0o755);
  h.env.PATH = history.sandbox.root + delimiter + (h.env.PATH ?? ''); h.env.KILN_CODEX_HISTORY_FIXTURE = history.options.env!.KILN_CODEX_HISTORY_FIXTURE;
  const user = { type: 'userMessage', content: [{ type: 'text', text: prompt }] };
  const set = (id: string, turns: unknown[]) => { Object.assign(thread.metadata, { id, turns }); history.save(); };
  for (const [id, turns] of [
    ['wrong-thread', [{ id: run.codex!.turnId, items: [user] }]],
    [threadId, [{ id: 'wrong-turn', items: [user] }]],
    [threadId, [{ id: run.codex!.turnId, items: [{ type: 'userMessage', content: [{ type: 'text', text: 'different reply' }] }] }]],
    [threadId, [{ id: run.codex!.turnId, items: [{ ...user, type: 'agentMessage' }] }]],
    [threadId, []],
  ] as [string, unknown[]][]) {
    set(id, turns); expect((await h.engine.refreshCommand(input.command_id)).operation).toMatchObject({ id: receipt.id, effects: { reply: 'submitted' } });
  }
  set(threadId, [{ id: run.codex!.turnId, items: [user] }]);
  for (let query = 0; query < 2; query++) expect((await h.engine.refreshCommand(input.command_id)).operation).toMatchObject({ id: receipt.id, state: 'completed', effects: { reply: 'delivered', session: 'resumed', plan: 'not_advanced' } });
  expect(readFileSync(sessionFile)).toEqual(before); expect(work.calls().filter(call => call.method === 'turn/start')).toHaveLength(turnCount);
  expect(history.calls().every(call => ['initialize', 'thread/read'].includes(call.method))).toBe(true);
});

it('finds a delivered Claude prompt in a real transcript file whose earlier records contain raw U+2028/U+2029', async () => {
  const config = mkdtempSync(join(tmpdir(), 'kiln-claude-')); const sessionId = '4d9a2c7e-0000-4000-8000-000000000001';
  try {
    mkdirSync(join(config, 'projects', 'project'), { recursive: true });
    const prompt = 'Resume the audit.'; const startedAt = '2026-11-01T12:00:00.000Z';
    // JSON.stringify leaves U+2028/U+2029 unescaped, as Claude's transcripts do.
    const rows = [{ type: 'assistant', sessionId, timestamp: startedAt, message: { content: 'scraped text here' } }, { type: 'user', sessionId, timestamp: '2026-11-01T12:00:01.000Z', message: { content: prompt } }];
    writeFileSync(join(config, 'projects', 'project', `${sessionId}.jsonl`), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    const session = { agentId: 'claude', sessionId } as unknown as Parameters<typeof deliveredInHistory>[0];
    const run = { startedAt, control: { operationId: 'operation', attemptId: 'attempt', promptDigest: createHash('sha256').update(prompt).digest('hex') } } as unknown as Parameters<typeof deliveredInHistory>[1];
    expect(await deliveredInHistory(session, run, { ...process.env, CLAUDE_CONFIG_DIR: config })).toBe(true);
  } finally { rmSync(config, { recursive: true, force: true }); }
});
