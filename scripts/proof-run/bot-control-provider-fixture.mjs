// Opt-in, authenticated proof: node scripts/proof-run/bot-control-provider-fixture.mjs claude_code|codex <XDG_STATE_HOME>
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
import { writePrdRecord, writeSessionRecord } from '../../dist/state/records.js';
import { runSessionProcess, launchArguments } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { startLocalServer } from '../../dist/server/local-server.js';
import { takeInstanceLock } from '../../dist/state/instance-lock.js';

import { prdStateDirectory, stateRoot } from '../../dist/state/state-files.js';
const agentId = process.argv[2];
assert.ok(['claude_code', 'codex'].includes(agentId));
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-bot-control-${agentId}-`)));
process.env.XDG_STATE_HOME = process.argv[3];
const repository = join(root, 'proof');
const stateDirectory = prdStateDirectory(stateRoot(process.env), repository, 'proof', 'docs/prds/handoff-proof');
mkdirSync(repository); mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
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
const model = agentId === 'codex' ? 'gpt-6.1-sol' : 'haiku';
record.settings.agentChoices[agentId] = { model, effort: 'high' };
const session = { schemaVersion: 10, executionId: record.executionId, agentId, sessionId: randomUUID(), phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model, modelDisplayName: model, effort: 'high', workingDirectory: repository, runs: [], sleeps: [], steps: [] };
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
writePrdRecord(stateDirectory, record);
const engine = new Engine({ paths, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env: process.env, stateDirectory, record, onTerminal: event => events.push(event), sleepReader: { next: async () => [] }, originRetryMs: 0 });

assert.equal((await engine.prepare()).ok, true);
for (let i = 0; i < 240 && (engine.agents.state.pending || engine.billing.busy); i++) await delay(250);
const lock = await takeInstanceLock(stateRoot(process.env), stateDirectory, { range: { first: 41960, last: 41979 } });
assert.ok(lock.taken);
const server = await startLocalServer({ engine, port: lock.port, folderName: 'handoff-proof', featureName: 'Bot control proof', token: record.token });
const manifest = { agentId, root, repository, phase, stateDirectory, prd: join(repository, directory), terminalMarker: marker, sessionId: session.sessionId, port: lock.port };
writeFileSync(join(process.env.XDG_STATE_HOME, `${agentId}-fixture.json`), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ready: manifest }));
const close = async () => { await server.close(); await engine.stop('sigint'); lock.release(); process.exit(0); };
process.on('SIGINT', close); process.on('SIGTERM', close);
await new Promise(() => {});
