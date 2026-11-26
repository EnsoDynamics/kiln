// Opt-in, authenticated proof: npm run build && node scripts/proof-run/phase-model-tiers-both-agents-proof.mjs
// Kiln Phase Model Tiers, Phase 2 (technical design, Delivery), with the actual installed Claude
// Code and Codex and disposable state: an activity that hasn't started goes on in a new session on
// a changed choice, on the other agent included (AC-PICK-07). The agents' own histories decide
// the start line (Claude Code's saved conversation, the Codex thread's turns); a phase refused
// before any response, whose choice then moves to Codex, launches a new Codex session that
// responds, and its old Claude Code conversation is no longer offered for reopening. The drive
// loop around these boundaries is proven by src/engine/both-agents.integration.test.ts.
// Sessions are told to use no tools and answer in one word; the driver owns every change.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../dist/engine/engine.js';
import { defaultSettings } from '../../dist/engine/worktree-setup.js';
import { claudeHistoryStart, codexHistoryStart } from '../../dist/models/history-start.js';
import { launchArguments, runSessionProcess } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { claudeConfigFolder } from '../../dist/session/transcripts.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readSessionRecord, writeSessionRecord } from '../../dist/state/records.js';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'kiln-both-agents-')));
const repository = join(root, 'proof'); const stateDirectory = join(root, 'state');
mkdirSync(repository); mkdirSync(stateDirectory);
const env = { ...process.env, XDG_STATE_HOME: join(root, 'xdg') };
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
git('init', '-q', '--bare', join(root, 'origin.git')); git('init', '-q', '-b', 'develop');
git('config', 'user.name', 'Kiln Both Agents Proof'); git('config', 'user.email', 'proof@example.invalid');
git('remote', 'add', 'origin', join(root, 'origin.git'));
const directory = 'docs/prds/both-agents-proof'; mkdirSync(join(repository, directory), { recursive: true });
const instructions = 'This is a disposable Kiln proof, not an implementation task. Do not run skills or tools, change files, commit or push. Answer with the single word OK and stop.';
writeFileSync(join(repository, 'AGENTS.md'), `${instructions}\n`); writeFileSync(join(repository, 'CLAUDE.md'), `${instructions}\n`);
writeFileSync(join(repository, directory, 'both-agents-proof-prd.md'), '# PRD: Disposable both-agents proof\n\n## Acceptance Criteria\n\n- [ ] **AC-PROOF-01** Answer.\n');
writeFileSync(join(repository, directory, 'phase-1-answer.md'), '# Phase 1: Answer\n\n**Model tier:** mechanical — one word.\n\n## Acceptance criteria covered\nAC-PROOF-01\n');
git('add', '.'); git('commit', '-qm', 'test(proof): seed disposable both-agents proof'); git('push', '-qu', 'origin', 'develop');
console.log(JSON.stringify({ root }));
const results = {};

const sessionFor = (agentId, model, effort) => ({ schemaVersion: 26, agentId, sessionId: randomUUID(), phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model, modelDisplayName: model, ...(effort ? { effort } : {}), workingDirectory: repository, runs: [], sleeps: [], steps: [] });
const claudeRun = (session, prompt = 'Reply OK.') => { writeSessionRecord(stateDirectory, session); return runSessionProcess({ claude: 'claude', args: launchArguments(session.sessionId, session.model, session.effort), cwd: repository, env, prompt, cause: 'launch', stateDirectory, record: session }); };
const codexRun = (session, prompt = 'Reply OK.') => { writeSessionRecord(stateDirectory, session); return runCodexSession({ executable: 'codex', cwd: repository, writableRoots: [root], repositories: [{ path: repository, branch: 'develop' }], env, record: session, stateDirectory, prompt, cause: 'launch' }).catch(error => ({ error: error.message })); };

// 1. Claude Code's own saved conversation decides the start line: a refused session has no response in it, an answered one has.
const refused = sessionFor('claude_code', 'claude-proof-no-such-model-1', 'low');
await claudeRun(refused);
assert.equal(readSessionRecord(stateDirectory, '1', refused.sessionId).firstResponseAt, undefined);
const refusedHistory = claudeHistoryStart(claudeConfigFolder(env), refused.sessionId);
assert.equal(refusedHistory.state, 'none', JSON.stringify(refusedHistory));
const answered = sessionFor('claude_code', 'haiku', undefined);
await claudeRun(answered);
const answeredHistory = claudeHistoryStart(claudeConfigFolder(env), answered.sessionId);
assert.equal(answeredHistory.state, 'responded', JSON.stringify(answeredHistory));
results.claudeHistory = { refused: refusedHistory.state, answered: answeredHistory };

// 2. Through the production Engine: the refused phase hasn't started; its choice moves to Codex, so
// the old conversation isn't offered for reopening and the next launch is a Codex choice.
const paths = { mainCheckoutPath: repository, repositoryName: 'proof', folderName: 'both-agents-proof', prdDirectoryFromRoot: directory, featureName: 'Disposable both-agents proof' };
const settings = defaultSettings(paths, { branches: new Map([['develop', git('rev-parse', 'HEAD')]]), defaultBranch: 'develop' });
const record = newPrdRecord({ ...paths, github: 'proof/disposable', settings });
record.plan = [{ id: '1', title: 'Answer', fileName: 'phase-1-answer.md', closed: false, modelTier: { tier: 'mechanical', reason: 'one word.' } }];
record.phases['1'] = { sessionIds: [refused.sessionId], finishedByPerson: false, repositories: {} };
mkdirSync(join(root, 'xdg', 'kiln'), { recursive: true });
writeFileSync(join(root, 'xdg', 'kiln', 'model-defaults.json'), JSON.stringify({ schemaVersion: 1, rows: { mechanical: { first: { agentId: 'codex', family: 'sol', effort: 'low' }, fallback: { agentId: 'claude_code', family: 'haiku', effort: 'low' } } } }));
const engine = new Engine({ paths, record, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env, stateDirectory, sleepReader: { next: async () => [] } });
let fresh;
try {
  await engine.refreshAgents();
  assert.equal(await engine.readStart('1'), 'not_started');
  assert.equal(engine.reopenMatchesChoice('1', refused), false, 'the old Claude Code conversation is still offered after the choice moved to Codex');
  assert.deepEqual(Object.keys(engine.neededBy()).sort(), ['claude_code', 'codex']);
  const launch = engine.launchChoice('1');
  assert.equal(launch.agentId, 'codex');
  // 3. The new session on the changed choice, on the other agent, responds, and Codex's own thread history agrees.
  fresh = sessionFor('codex', launch.model, launch.effort);
  const ran = await codexRun(fresh);
  const saved = readSessionRecord(stateDirectory, '1', fresh.sessionId);
  assert.ok(saved.firstResponseAt, `Codex session got no first response: ${JSON.stringify(ran.error ?? saved.runs.at(-1)?.codex?.terminal)}`);
  const codexHistory = await codexHistoryStart({ executable: 'codex', cwd: repository, env, session: saved, signal: globalThis.AbortSignal.timeout(60_000) });
  assert.equal(codexHistory.state, 'responded', JSON.stringify(codexHistory));
  // Once recorded on the activity, it has started on the Codex session: from here on it keeps that choice.
  engine.record.phases['1'].sessionIds.push(fresh.sessionId);
  assert.equal(await engine.readStart('1'), 'started');
  assert.equal(engine.startedSessionOf('1')?.sessionId, fresh.sessionId);
  assert.equal(engine.agentOf('1'), 'codex');
  results.relaunch = { launchedOn: launch, firstResponseAt: saved.firstResponseAt, codexHistory };
} finally { engine.close(); }

console.log(JSON.stringify({ ok: true, results }, null, 2));
