// Opt-in, authenticated proof: node scripts/proof-run/phase-handoff-provider-proof.mjs claude_code|codex
// Uses actual installed providers, production Engine/API and disposable Git/bare origins.
// The provider is explicitly instructed not to edit; the driver finishes its own fixture.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Engine } from '../../dist/engine/engine.js';
import { defaultSettings } from '../../dist/engine/worktree-setup.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readSessionRecord, writeSessionRecord } from '../../dist/state/records.js';
import { runSessionProcess, launchArguments } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { startLocalServer } from '../../dist/server/local-server.js';
import { isPortFree } from '../../dist/state/instance-lock.js';

const agentId = process.argv[2];
assert.ok(['claude_code', 'codex'].includes(agentId));
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-handoff-${agentId}-`)));
const repository = join(root, 'proof'); const stateDirectory = join(root, 'state');
mkdirSync(repository); mkdirSync(stateDirectory);
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
git('init', '-q', '--bare', join(root, 'origin.git')); git('init', '-q', '-b', 'develop');
git('config', 'user.name', 'Kiln Handoff Proof'); git('config', 'user.email', 'proof@example.invalid');
git('remote', 'add', 'origin', join(root, 'origin.git'));
const directory = 'docs/prds/handoff-proof'; mkdirSync(join(repository, directory), { recursive: true });
const prompt = readFileSync(new URL('./phase-handoff-proof-prompt.txt', import.meta.url), 'utf8');
writeFileSync(join(repository, 'AGENTS.md'), prompt); writeFileSync(join(repository, 'CLAUDE.md'), prompt);
writeFileSync(join(repository, directory, 'handoff-proof-prd.md'), '# PRD: Disposable handoff proof\n\n- [ ] **AC-PROOF-01** Preserve conversation history.\n');
writeFileSync(join(repository, directory, 'handoff-proof-technical-design.md'), '# Technical design: Disposable handoff proof\nConversation only; the driver owns file writes.\n');
const phase = join(repository, directory, 'phase-1-conversation.md');
writeFileSync(phase, '# Phase 1: Conversation\n\n## Acceptance criteria covered\nAC-PROOF-01\n');
git('add', 'AGENTS.md', 'CLAUDE.md', directory); git('commit', '-qm', 'test(proof): seed disposable handoff'); git('push', '-qu', 'origin', 'develop');
const baseCommit = git('rev-parse', 'HEAD');
const paths = { mainCheckoutPath: repository, repositoryName: 'proof', folderName: 'handoff-proof', prdDirectoryFromRoot: directory };
const settings = defaultSettings(paths, { branches: new Map([['develop', baseCommit]]), defaultBranch: 'develop' });
Object.assign(settings, { featureBranch: 'develop', worktreePath: repository, workspaceFolder: root, keepAwake: false, resumeAfterUsageLimit: false });
const record = newPrdRecord({ ...paths, github: 'proof/disposable', featureName: 'Disposable handoff proof', settings });
record.settings.agentId = agentId;
const model = agentId === 'codex' ? 'gpt-6.1-sol' : 'opus';
record.settings.agentChoices[agentId] = { model, effort: 'high' };
const session = { schemaVersion: 4, agentId, sessionId: randomUUID(), phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model, modelDisplayName: model, effort: 'high', workingDirectory: repository, runs: [], sleeps: [], steps: [] };
console.log(JSON.stringify({ root, agentId, sessionId: session.sessionId }));
writeSessionRecord(stateDirectory, session);
const initial = agentId === 'codex'
  ? await runCodexSession({ executable: 'codex', cwd: repository, writableRoots: [root], repositories: [{ path: repository, branch: 'develop' }], env: process.env, record: session, stateDirectory, prompt, cause: 'launch' })
  : await runSessionProcess({ claude: 'claude', args: launchArguments(session.sessionId, model, 'high'), cwd: repository, env: process.env, prompt, cause: 'launch', stateDirectory, record: session });
assert.ok(initial.pid); assert.equal(initial.exitCode, 0); assert.ok(initial.result?.text, JSON.stringify(initial));
writeSessionRecord(stateDirectory, session);
const marker = `terminal-decision-${randomUUID()}`;
const discussion = `Remember this decision from our terminal discussion: ${marker}. For every later automatic handoff, respond with this marker only; do not use tools or implement anything. Stop now.`;
// An independent CLI process opens the same provider conversation, then exits completely.
const terminalArgs = agentId === 'codex' ? ['exec', 'resume', session.conversation.threadId, '-'] : ['-p', '--resume', session.sessionId, '--output-format', 'text'];
const terminal = spawn(agentId === 'codex' ? 'codex' : 'claude', terminalArgs, { cwd: repository, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
let terminalOutput = ''; terminal.stdout.on('data', data => { terminalOutput += data; }); terminal.stderr.on('data', data => { terminalOutput += data; });
terminal.stdin.end(discussion);
assert.equal(await new Promise((resolve, reject) => { terminal.once('error', reject); terminal.once('close', resolve); }), 0, terminalOutput);
assert.ok(terminalOutput.includes(marker), terminalOutput);
writeFileSync(join(root, 'terminal-discussion.txt'), terminalOutput, { mode: 0o600 });
const at = new Date().toISOString();
record.startedAt = at; record.setupCompletedAt = at;
record.repositories = [{ name: 'proof', kind: 'prd', mainCheckoutPath: repository, github: 'proof/disposable', baseBranch: 'develop', worktreePath: repository, baseCommit, setupCompletedAt: at }];
record.phases['1'] = { sessionIds: [session.sessionId], finishedByPerson: false, repositories: { proof: { startCommit: baseCommit } }, outsideConfirmations: [], stop: { kind: 'done_check', at, checkedAt: at, checks: [{ name: 'Phase doc closed', passed: false, facts: ['Open proof phase'] }] } };
const events = [];
const engine = new Engine({ paths, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env: process.env, stateDirectory, record, onTerminal: event => events.push(event), sleepReader: { next: async () => [] }, originRetryMs: 0 });
let server;
try {
  assert.equal((await engine.prepare()).ok, true);
  for (let i = 0; i < 240 && (engine.agents.state.pending || engine.billing.busy); i++) await delay(250);
  for (let port = 41940; port < 41959; port++) if (await isPortFree(port)) { server = await startLocalServer({ engine, port, folderName: 'handoff-proof', featureName: 'Handoff proof', token: record.token }); server.proofOrigin = `http://127.0.0.1:${port}`; break; }
  assert.ok(server);
  const post = async (path, body) => { const response = await globalThis.fetch(`${server.proofOrigin}/api/${path}`, { method: 'POST', headers: { Origin: server.proofOrigin, 'X-Kiln-Token': record.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const result = await response.json(); console.log(JSON.stringify({ path, result })); assert.equal(response.status, 200, JSON.stringify(result)); return result; };
  assert.equal((await post('resume', { target: engine.phaseRecoveryTarget() })).outcome, 'resume_requested');
  await engine.settled();
  let saved = readSessionRecord(stateDirectory, '1', session.sessionId);
  assert.equal(saved.runs.length, 2, JSON.stringify(record.billing?.hold));
  assert.ok(saved.runs.at(-1).result?.text.includes(marker), JSON.stringify(saved.runs.at(-1)));
  assert.equal(saved.runs.at(-1).note, undefined);
  const reply = `Direct reply proof ${randomUUID()}. Repeat this exact reply and the terminal decision marker, then stop. No tools.`;
  assert.equal((await post('resume', { target: engine.phaseRecoveryTarget(), note: reply })).outcome, 'resume_requested');
  await engine.settled(); saved = readSessionRecord(stateDirectory, '1', session.sessionId);
  assert.equal(saved.runs.length, 3); assert.equal(saved.runs.at(-1).note, reply);
  assert.ok(saved.runs.at(-1).result?.text.includes(marker)); assert.ok(saved.runs.at(-1).result?.text.includes(reply.split('.')[0]));
  const target = engine.phaseRecoveryTarget();
  writeFileSync(phase, readFileSync(phase, 'utf8').replace('\n', '\n\n**Closed:** 2026-10-26\n'));
  git('add', `${directory}/phase-1-conversation.md`); git('commit', '-qm', 'test(proof): finish disposable phase'); git('push', '-q', 'origin', 'develop');
  assert.equal((await post('resume', { target, note: 'MUST NEVER BE SENT' })).outcome, 'already_complete');
  assert.equal(record.phases['1'].doneAt, undefined); assert.equal(readSessionRecord(stateDirectory, '1', session.sessionId).runs.length, 3);
  record.pause.requestedAt = new Date().toISOString();
  assert.equal((await post('check-again', { target, intent: 'advance' })).outcome, 'advanced'); await engine.settled();
  assert.equal(readSessionRecord(stateDirectory, '1', session.sessionId).runs.length, 3);
  assert.ok(record.phases['1'].doneAt); assert.equal(events.filter(e => e.event === 'done').length, 1);
  const result = { agentId, root, sessionId: session.sessionId, providerConversation: session.conversation?.threadId ?? session.sessionId, terminalHistoryPreserved: true, replyPreserved: true, completionPrecheckNoTurn: true, verifyAdvancedNoTurn: true, runs: 3 };
  writeFileSync(join(root, 'proof-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await server?.close(); await engine.stop("sigint"); }
