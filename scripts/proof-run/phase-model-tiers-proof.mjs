// Opt-in, authenticated proof: npm run build && node scripts/proof-run/phase-model-tiers-proof.mjs
// Kiln Phase Model Tiers, Phase 1 (technical design, Delivery), with the actual installed Claude
// Code and Codex and disposable state: each Model defaults family resolves to the newest version
// its agent offers (AC-DEFAULT-01); a session's first model response starts its activity and a
// session refused before any response doesn't, on each agent (AC-PICK-02, AC-PICK-04, AC-PICK-06);
// and a carry-on of a started Claude Code activity launches on the concrete model ID it started on
// (AC-PICK-04). Sessions are told to use no tools and answer in one word; the driver owns every change.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readModelList } from '../../dist/account/model-list.js';
import { readCodexMetadata } from '../../dist/agents/codex-metadata.js';
import { Engine } from '../../dist/engine/engine.js';
import { defaultSettings } from '../../dist/engine/worktree-setup.js';
import { SHIPPED_DEFAULTS } from '../../dist/models/model-defaults.js';
import { codexFamilyOf, newestOfFamily } from '../../dist/models/resolver.js';
import { startingSession } from '../../dist/models/start-line.js';
import { launchArguments, runSessionProcess } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readSessionRecord, writeSessionRecord } from '../../dist/state/records.js';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'kiln-model-tiers-')));
const repository = join(root, 'proof'); const stateDirectory = join(root, 'state');
mkdirSync(repository); mkdirSync(stateDirectory);
const env = { ...process.env, XDG_STATE_HOME: join(root, 'xdg') };
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
git('init', '-q', '--bare', join(root, 'origin.git')); git('init', '-q', '-b', 'develop');
git('config', 'user.name', 'Kiln Tiers Proof'); git('config', 'user.email', 'proof@example.invalid');
git('remote', 'add', 'origin', join(root, 'origin.git'));
const directory = 'docs/prds/tiers-proof'; mkdirSync(join(repository, directory), { recursive: true });
const instructions = 'This is a disposable Kiln proof, not an implementation task. Do not run skills or tools, change files, commit or push. Answer with the single word OK and stop.';
writeFileSync(join(repository, 'AGENTS.md'), `${instructions}\n`); writeFileSync(join(repository, 'CLAUDE.md'), `${instructions}\n`);
writeFileSync(join(repository, directory, 'tiers-proof-prd.md'), '# PRD: Disposable tiers proof\n\n## Acceptance Criteria\n\n- [ ] **AC-PROOF-01** Answer.\n');
writeFileSync(join(repository, directory, 'phase-1-answer.md'), '# Phase 1: Answer\n\n**Model tier:** mechanical — one word.\n\n## Acceptance criteria covered\nAC-PROOF-01\n');
git('add', '.'); git('commit', '-qm', 'test(proof): seed disposable tiers proof'); git('push', '-qu', 'origin', 'develop');
console.log(JSON.stringify({ root }));
const results = {};

// 1. Each family resolves to the newest version its agent offers (AC-DEFAULT-01). No model request is made.
const claudeList = await readModelList({ claude: 'claude', cwd: stateDirectory, env });
assert.ok(claudeList.ok, JSON.stringify(claudeList));
const codexRead = await readCodexMetadata({ executable: 'codex', cwd: repository, cwds: [repository], env });
assert.ok(codexRead.models, codexRead.modelListError);
for (const [row, sides] of Object.entries(SHIPPED_DEFAULTS)) {
  for (const choice of [sides.first, sides.fallback]) {
    const models = choice.agentId === 'codex' ? codexRead.models : claudeList.models;
    const found = newestOfFamily(choice, models);
    assert.ok(found.entry, `${row} ${choice.agentId} ${choice.family}: ${found.problem}`);
    if (choice.agentId === 'codex') {
      const versions = models.map(entry => codexFamilyOf(entry.value)).filter(one => one?.family === choice.family).map(one => one.version.join('.'));
      const newest = codexFamilyOf(found.entry.value).version.join('.');
      for (const version of versions) assert.ok(version.split('.').map(Number).every((part, i, all) => { const best = newest.split('.').map(Number); for (let j = 0; j < Math.max(all.length, best.length); j++) { const d = (best[j] ?? 0) - (all[j] ?? 0); if (d) return d > 0; } return true; }), `${found.entry.value} is not the newest ${choice.family} (${versions})`);
    }
    if (choice.effort && found.entry.supportsEffort) assert.ok(found.entry.supportedEffortLevels.includes(choice.effort), `${found.entry.value} lacks ${choice.effort}`);
    results[`${row}.${choice.agentId}.${choice.family}`] = choice.agentId === "codex" ? found.entry.value : `${found.entry.value} → ${found.entry.resolvedModel}`;
  }
}

const sessionFor = (agentId, model, effort) => ({ schemaVersion: 26, agentId, sessionId: randomUUID(), phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model, modelDisplayName: model, ...(effort ? { effort } : {}), workingDirectory: repository, runs: [], sleeps: [], steps: [] });
const claudeRun = (session, prompt = 'Reply OK.') => { writeSessionRecord(stateDirectory, session); return runSessionProcess({ claude: 'claude', args: launchArguments(session.sessionId, session.model, session.effort), cwd: repository, env, prompt, cause: 'launch', stateDirectory, record: session }); };
const codexRun = (session, prompt = 'Reply OK.') => { writeSessionRecord(stateDirectory, session); return runCodexSession({ executable: 'codex', cwd: repository, writableRoots: [root], repositories: [{ path: repository, branch: 'develop' }], env, record: session, stateDirectory, prompt, cause: 'launch' }).catch(error => ({ error: error.message })); };

// 2. Claude Code: a first response starts the activity; a session refused before any response doesn't.
const claudeStarted = sessionFor('claude_code', 'haiku', undefined);
await claudeRun(claudeStarted);
const savedStarted = readSessionRecord(stateDirectory, '1', claudeStarted.sessionId);
assert.ok(savedStarted.firstResponseAt, 'Claude Code session got no first response');
assert.match(savedStarted.initModel ?? '', /^claude-haiku-/);
const claudeRefused = sessionFor('claude_code', 'claude-proof-no-such-model-1', 'low');
await claudeRun(claudeRefused);
assert.equal(readSessionRecord(stateDirectory, '1', claudeRefused.sessionId).firstResponseAt, undefined, 'a refused Claude Code session counted as started');
// The activity started on the first of its sessions, in creation order, that got a response.
assert.equal(startingSession({ sessionIds: [claudeRefused.sessionId, claudeStarted.sessionId] }, id => readSessionRecord(stateDirectory, '1', id))?.sessionId, claudeStarted.sessionId);
results.claude = { started: savedStarted.firstResponseAt, initModel: savedStarted.initModel, refusedFirstResponse: null };

// 3. A carry-on of the started Claude Code activity launches on the concrete model ID it started on, through the production Engine.
const paths = { mainCheckoutPath: repository, repositoryName: 'proof', folderName: 'tiers-proof', prdDirectoryFromRoot: directory, featureName: 'Disposable tiers proof' };
const settings = defaultSettings(paths, { branches: new Map([['develop', git('rev-parse', 'HEAD')]]), defaultBranch: 'develop' });
const record = newPrdRecord({ ...paths, github: 'proof/disposable', settings });
record.phases['1'] = { sessionIds: [claudeRefused.sessionId, claudeStarted.sessionId], finishedByPerson: false, repositories: {} };
const engine = new Engine({ paths, record, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env, stateDirectory, sleepReader: { next: async () => [] } });
try {
  // Model defaults now name another model for mechanical phases; the started activity ignores them.
  mkdirSync(join(root, 'xdg', 'kiln'), { recursive: true });
  writeFileSync(join(root, 'xdg', 'kiln', 'model-defaults.json'), JSON.stringify({ schemaVersion: 1, rows: { mechanical: { first: { agentId: 'claude_code', family: 'sonnet', effort: 'low' } } } }));
  const launch = engine.launchChoice('1');
  assert.deepEqual(launch, { agentId: 'claude_code', model: savedStarted.initModel, modelName: savedStarted.modelDisplayName });
  const carryOn = sessionFor('claude_code', launch.model, launch.effort);
  await claudeRun(carryOn, 'Continue: reply OK.');
  const savedCarryOn = readSessionRecord(stateDirectory, '1', carryOn.sessionId);
  assert.equal(savedCarryOn.initModel, savedStarted.initModel, 'the carry-on ran on another version');
  assert.ok(savedCarryOn.firstResponseAt);
  results.carryOn = { launchedWith: launch.model, initModel: savedCarryOn.initModel };
} finally { engine.close(); }

// 4. Codex: a first response starts the activity; a session refused before any response doesn't.
const sol = newestOfFamily({ agentId: 'codex', family: 'sol' }, codexRead.models).entry.value;
const codexStarted = sessionFor('codex', sol, 'low');
const ran = await codexRun(codexStarted);
const savedCodex = readSessionRecord(stateDirectory, '1', codexStarted.sessionId);
assert.ok(savedCodex.firstResponseAt, `Codex session got no first response: ${JSON.stringify(ran.error ?? savedCodex.runs.at(-1)?.codex?.terminal)}`);
assert.equal(savedCodex.runs.at(-1).codex.firstResponseAt, savedCodex.firstResponseAt);
const codexRefused = sessionFor('codex', 'gpt-0-proof-no-such-model', 'low');
const refused = await codexRun(codexRefused);
assert.equal(readSessionRecord(stateDirectory, '1', codexRefused.sessionId)?.firstResponseAt, undefined, 'a refused Codex session counted as started');
results.codex = { started: savedCodex.firstResponseAt, model: sol, refused: refused.error ?? readSessionRecord(stateDirectory, '1', codexRefused.sessionId)?.runs.at(-1)?.codex?.verificationFailure ?? 'no response' };

console.log(JSON.stringify({ ok: true, results }, null, 2));
