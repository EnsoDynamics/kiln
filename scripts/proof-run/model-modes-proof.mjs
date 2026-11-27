// Opt-in, authenticated proof: npm run build && node scripts/proof-run/model-modes-proof.mjs
// Kiln Model Modes, Phase 1 (technical design, Delivery), with the actual installed Claude Code
// and Codex and disposable state. Two short sessions, each resolved and decided by the production
// Engine from settings files written as this version saves them:
//   1. A phase whose first choice is on Claude Code starts on its Codex fallback while the
//      fallback is used for everything, and reports there: the launch decision, the row, the
//      phase detail and the terminal's line give the setting as the reason (AC-WHEN-02, AC-WHEN-03).
//   2. A phase starts on the one model, from this PRD's own settings, whatever its tier's row
//      says, with no fallback (AC-MODE-02, AC-MODE-03).
// The drive loop around these boundaries is proven by src/engine/model-modes.integration.test.ts.
// Sessions are told to use no tools and answer in one word; the driver owns every change.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../dist/engine/engine.js';
import { defaultSettings } from '../../dist/engine/worktree-setup.js';
import { prdSettingsPath } from '../../dist/models/model-defaults.js';
import { launchArguments, runSessionProcess } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readSessionRecord, SCHEMA_VERSION, writeSessionRecord } from '../../dist/state/records.js';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'kiln-model-modes-')));
const repository = join(root, 'proof'); const stateDirectory = join(root, 'state');
mkdirSync(repository); mkdirSync(stateDirectory);
const env = { ...process.env, XDG_STATE_HOME: join(root, 'xdg') };
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
git('init', '-q', '--bare', join(root, 'origin.git')); git('init', '-q', '-b', 'develop');
git('config', 'user.name', 'Kiln Model Modes Proof'); git('config', 'user.email', 'proof@example.invalid');
git('remote', 'add', 'origin', join(root, 'origin.git'));
const directory = 'docs/prds/model-modes-proof'; mkdirSync(join(repository, directory), { recursive: true });
const instructions = 'This is a disposable Kiln proof, not an implementation task. Do not run skills or tools, change files, commit or push. Answer with the single word OK and stop.';
writeFileSync(join(repository, 'AGENTS.md'), `${instructions}\n`); writeFileSync(join(repository, 'CLAUDE.md'), `${instructions}\n`);
writeFileSync(join(repository, directory, 'model-modes-proof-prd.md'), '# PRD: Disposable model modes proof\n\n## Acceptance Criteria\n\n- [ ] **AC-PROOF-01** Answer.\n- [ ] **AC-PROOF-02** Answer again.\n');
writeFileSync(join(repository, directory, 'phase-1-answer.md'), '# Phase 1: Answer\n\n**Model tier:** mechanical — one word.\n\n## Acceptance criteria covered\nAC-PROOF-01\n');
writeFileSync(join(repository, directory, 'phase-2-answer-again.md'), '# Phase 2: Answer again\n\n**Model tier:** mechanical — one word.\n\n## Acceptance criteria covered\nAC-PROOF-02\n');
git('add', '.'); git('commit', '-qm', 'test(proof): seed disposable model modes proof'); git('push', '-qu', 'origin', 'develop');
console.log(JSON.stringify({ root }));
const results = {};

const defaultsFile = join(root, 'xdg', 'kiln', 'model-defaults.json');
mkdirSync(join(root, 'xdg', 'kiln'), { recursive: true });
const paths = { mainCheckoutPath: repository, repositoryName: 'proof', folderName: 'model-modes-proof', prdDirectoryFromRoot: directory, featureName: 'Disposable model modes proof' };
const settings = defaultSettings(paths, { branches: new Map([['develop', git('rev-parse', 'HEAD')]]), defaultBranch: 'develop' });
const record = newPrdRecord({ ...paths, github: 'proof/disposable', settings });
const mechanical = { tier: 'mechanical', reason: 'one word.' };
record.plan = [{ id: '1', title: 'Answer', fileName: 'phase-1-answer.md', closed: false, modelTier: mechanical }, { id: '2', title: 'Answer again', fileName: 'phase-2-answer-again.md', closed: false, modelTier: mechanical }];
const terminal = [];
const engine = new Engine({ paths, record, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env, stateDirectory, sleepReader: { next: async () => [] }, onTerminal: event => terminal.push(event) });

/** The cheapest choice an agent's list offers for a family: its lowest effort, or none for a model that takes none. */
function cheapest(agentId, family) {
  const models = engine.modelContext.lists[agentId]?.models;
  assert.ok(models, `${agentId}'s model list wasn't read: ${engine.modelContext.lists[agentId]?.error}`);
  const entry = agentId === 'claude_code' ? models.find(one => one.value === family) : models.filter(one => one.value.endsWith(`-${family}`)).sort((a, b) => b.value.localeCompare(a.value, undefined, { numeric: true }))[0];
  assert.ok(entry, `${agentId} offers no ${family} model: ${models.map(one => one.value).join(', ')}`);
  const effort = entry.supportsEffort ? (entry.supportedEffortLevels.includes('low') ? 'low' : entry.supportedEffortLevels[0]) : undefined;
  return { agentId, family, ...(effort ? { effort } : {}) };
}
/** A new session record on the choice the Engine decided, with the decision it saved. */
const sessionFor = (phaseId, decided) => ({ schemaVersion: SCHEMA_VERSION, agentId: decided.choice.agentId, sessionId: randomUUID(), phaseId, kind: 'phase', createdAt: new Date().toISOString(), model: decided.choice.model, modelDisplayName: decided.choice.modelName, ...(decided.choice.effort ? { effort: decided.choice.effort } : {}), launch: decided.launch, workingDirectory: repository, runs: [], sleeps: [], steps: [] });
/** Records the session on its activity as the Engine's launch does, and notes its start once it responded. */
function started(phaseId, session) {
  const saved = readSessionRecord(stateDirectory, phaseId, session.sessionId);
  engine.record.phases[phaseId] = { sessionIds: [session.sessionId], finishedByPerson: false, repositories: {} };
  engine.noteStart(phaseId, saved);
  return saved;
}

try {
  await engine.refreshAgents();
  const haiku = cheapest('claude_code', 'haiku'); const sol = cheapest('codex', 'sol');

  // 1. For everything: the mechanical row's first choice is on Claude Code, its fallback on Codex.
  writeFileSync(defaultsFile, JSON.stringify({ schemaVersion: 2, rows: { mechanical: { first: haiku, fallback: sol } }, fallback: { use: 'everything' } }));
  engine.modelChoicesChanged();
  const resolved = engine.notStartedChoice('1');
  assert.equal(resolved.agentId, 'codex', JSON.stringify(resolved));
  assert.equal(resolved.problem, undefined, resolved.problem);
  assert.equal(resolved.everything?.first.agentId, 'claude_code');
  // Before any launch the row shows the fallback, tagged, with the first choice it skips.
  const before = engine.activityModel('1', { finished: false });
  assert.deepEqual([before.state, before.choice.agent, before.fallback.used, before.fallback.forEverything, before.fallback.first.agent], ['will_run_on', 'Codex', true, true, 'Claude Code']);
  assert.equal(engine.fallbackOf('1'), undefined, 'an activity on its fallback has no further fallback');
  assert.equal(engine.fallbackThreshold, undefined, 'no usage is read against a threshold');
  assert.equal(engine.headsUp(), undefined);
  const decided = await engine.decideLaunch('1', false);
  assert.equal(decided.read, false, 'the decision read usage though the fallback is used for everything');
  assert.deepEqual(decided.launch.fallback, { used: true, forEverything: true, first: { agentId: 'claude_code', model: resolved.everything.first.model, modelName: resolved.everything.first.modelName, ...(haiku.effort ? { effort: haiku.effort } : {}) } });
  assert.equal(decided.choice.agentId, 'codex');
  const onFallback = sessionFor('1', decided);
  writeSessionRecord(stateDirectory, onFallback);
  const ran = await runCodexSession({ executable: 'codex', cwd: repository, writableRoots: [root], repositories: [{ path: repository, branch: 'develop' }], env, record: onFallback, stateDirectory, prompt: 'Reply OK.', cause: 'launch' }).catch(error => ({ error: error.message }));
  const savedFallback = started('1', onFallback);
  assert.ok(savedFallback.firstResponseAt, `the Codex session got no first response: ${JSON.stringify(ran.error ?? savedFallback.runs.at(-1)?.codex?.terminal)}`);
  assert.equal(engine.startedSessionOf('1')?.sessionId, onFallback.sessionId);
  assert.equal(engine.agentOf('1'), 'codex');
  // It reports there: the row, the phase detail and the terminal give the setting as the reason, with no limit reading.
  const running = engine.activityModel('1', { finished: false, current: true });
  assert.deepEqual([running.state, running.choice.agent, running.fallback.used, running.fallback.forEverything, running.fallback.limit, running.fallback.threshold], ['running_on', 'Codex', true, true, undefined, undefined]);
  assert.deepEqual(engine.detailsFallback('1'), running.fallback);
  const line = terminal.filter(event => event.kind === 'message' && event.text.includes('started on the fallback')).map(event => event.text);
  assert.equal(line.length, 1, JSON.stringify(terminal));
  assert.match(line[0], /^Phase 1 started on the fallback, Codex · .*: the fallback is used for everything, so it didn't start on Claude Code · .*\. It finishes on Codex\.$/);
  results.forEverything = { firstChoice: resolved.everything.first, launchedOn: decided.choice, launch: decided.launch, firstResponseAt: savedFallback.firstResponseAt, terminal: line[0] };

  // 2. One model, from this PRD's own settings, over Model defaults that still use the fallback for everything.
  writeFileSync(prdSettingsPath(stateDirectory), JSON.stringify({ schemaVersion: 2, mode: 'one_model', oneModel: haiku, rows: { mechanical: { first: sol, fallback: haiku } }, fallback: { use: 'everything' } }));
  engine.modelChoicesChanged();
  assert.equal(engine.settingsInForce.source, 'prd');
  // The phase that started keeps what it started on; the one that hasn't runs on the one model, not on its row.
  assert.equal(engine.agentOf('1'), 'codex');
  const one = engine.notStartedChoice('2');
  assert.deepEqual([one.agentId, one.from, one.ownSettings, one.problem, one.everything, one.noFallback], ['claude_code', 'one_model', true, undefined, undefined, undefined], JSON.stringify(one));
  assert.equal(engine.fallbackOf('2'), undefined, 'one model has no fallback');
  const oneDecided = await engine.decideLaunch('2', false);
  assert.deepEqual(oneDecided.launch, { from: 'one_model', ownSettings: true });
  assert.equal(oneDecided.read, false);
  const onOneModel = sessionFor('2', oneDecided);
  writeSessionRecord(stateDirectory, onOneModel);
  await runSessionProcess({ claude: 'claude', args: launchArguments(onOneModel.sessionId, onOneModel.model, onOneModel.effort), cwd: repository, env, prompt: 'Reply OK.', cause: 'launch', stateDirectory, record: onOneModel });
  const savedOne = started('2', onOneModel);
  assert.ok(savedOne.firstResponseAt, `the Claude Code session got no first response: ${JSON.stringify(savedOne.runs.at(-1))}`);
  assert.equal(engine.startedSessionOf('2')?.sessionId, onOneModel.sessionId);
  const ranOn = engine.activityModel('2', { finished: false, current: true });
  assert.deepEqual([ranOn.state, ranOn.choice.agent, ranOn.from, ranOn.fallback], ['running_on', 'Claude Code', 'one_model', undefined]);
  assert.equal(terminal.filter(event => event.kind === 'message' && event.text.includes('started on the fallback')).length, 1, 'the one model started on a fallback');
  results.oneModel = { oneModel: haiku, rowFirstChoice: sol, launchedOn: oneDecided.choice, launch: oneDecided.launch, firstResponseAt: savedOne.firstResponseAt, ranOn: savedOne.initModel ?? savedOne.model };
} finally { engine.close(); }

console.log(JSON.stringify({ ok: true, results }, null, 2));
