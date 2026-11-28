// Opt-in, authenticated proof (Kiln Planned Test Fix Batches technical design, "Delivery"):
//   npm run build && node scripts/proof-run/planned-test-fix-batches-provider-proof.mjs claude_code|codex
// Runs one real test audit session with the installed agent and its installed test-audit skill,
// on Kiln's own audit prompt, against a disposable repository whose criteria are all built and
// only weakly tested, so the audit cannot end completion_phases. The session submits through the
// built command line to a real local controller. Proves what scripted sessions cannot: the report
// Kiln accepts lists `fixBatches` matching the batches the skill's own record lists (AC-BATCH-01).
// All Git writes go to the disposable repository and its local bare origin.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../dist/engine/engine.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { writePrdRecord, writeSessionRecord } from '../../dist/state/records.js';
import { readPlanAt, recordedPlan } from '../../dist/engine/plan-reading.js';
import { prdStateDirectory, stateRoot } from '../../dist/state/state-files.js';
import { takeInstanceLock } from '../../dist/state/instance-lock.js';
import { startLocalServer } from '../../dist/server/local-server.js';
import { captureSnapshot } from '../../dist/audit/snapshots.js';
import { AuditStore } from '../../dist/audit/storage.js';
import { acceptedAudit, resolveAuditSkill } from '../../dist/audit/workflow.js';
import { startedLedger } from '../../dist/state/audit-loops.js';
import { launchArguments, runSessionProcess } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { readCodexMetadata } from '../../dist/agents/codex-metadata.js';
import { readModelList } from '../../dist/account/model-list.js';
import { SHIPPED_DEFAULTS } from '../../dist/models/model-defaults.js';
import { newestOfFamily } from '../../dist/models/resolver.js';

const agentId = process.argv[2];
assert.ok(['claude_code', 'codex'].includes(agentId), 'usage: <claude_code|codex>');
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-fix-batches-${agentId}-`)));
const repository = join(root, 'tally'); mkdirSync(repository);
const env = { ...process.env, XDG_STATE_HOME: join(root, 'state-home'), LOCALAPPDATA: join(root, 'state-home') };
const git = (...args) => execFileSync('git', args, { cwd: repository, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git('init', '-q', '--bare', '-b', 'proof', join(root, 'origin.git')); git('init', '-q', '-b', 'proof');
git('config', 'user.name', 'Kiln Fix Batches Proof'); git('config', 'user.email', 'proof@example.invalid');
git('remote', 'add', 'origin', join(root, 'origin.git'));

// Four built criteria; the tests only check that each function exists, so every row is Weak or Missing.
const directory = 'docs/prds/tally'; mkdirSync(join(repository, directory), { recursive: true });
writeFileSync(join(repository, 'tally.mjs'), [
  'export const words = (text) => text.split(/\\s+/).filter(Boolean);',
  'export const count = (text) => words(text).length;',
  'export const longest = (text) => words(text).reduce((best, word) => word.length > best.length ? word : best, "");',
  'export const frequency = (text) => { const seen = new Map(); for (const word of words(text.toLowerCase())) seen.set(word, (seen.get(word) ?? 0) + 1); return seen; };',
  '',
].join('\n'));
writeFileSync(join(repository, 'tally.test.mjs'), "import assert from 'node:assert/strict';\nimport * as tally from './tally.mjs';\nfor (const name of ['words', 'count', 'longest', 'frequency']) assert.equal(typeof tally[name], 'function');\nconsole.log('ok');\n");
writeFileSync(join(repository, 'package.json'), JSON.stringify({ name: 'tally', private: true, type: 'module', scripts: { test: 'node tally.test.mjs' } }, null, 2) + '\n');
writeFileSync(join(repository, 'README.md'), '# Tally\n\nRun the tests with `npm test`. No credentials or services are needed.\n');
writeFileSync(join(repository, directory, 'tally-prd.md'), [
  '# PRD: Tally', '', '## Acceptance Criteria', '',
  '- [ ] **AC-TALLY-01 — Splits words.** `words("a  b\\nc")` returns `["a", "b", "c"]`; blank input returns `[]`.',
  '- [ ] **AC-TALLY-02 — Counts words.** `count("one two three")` returns 3; blank input returns 0.',
  '- [ ] **AC-TALLY-03 — Finds the longest word.** `longest("a bbb cc")` returns `"bbb"`; the first wins a tie; blank input returns `""`.',
  '- [ ] **AC-TALLY-04 — Counts each word, ignoring case.** `frequency("A a b")` maps `a` to 2 and `b` to 1.', '',
].join('\n'));
writeFileSync(join(repository, directory, 'tally-technical-design.md'), '# Technical design: Tally\n\nPlain functions in `tally.mjs`, tested with `npm test` (`node tally.test.mjs`). No external access.\n');
writeFileSync(join(repository, directory, 'phase-1-tally.md'), '# Phase 1: Tally\n\n**Closed:** 2026-11-20\n\n## Acceptance criteria covered\nAC-TALLY-01, AC-TALLY-02, AC-TALLY-03, AC-TALLY-04\n\n## Phase dependencies\nNone.\n');
git('add', '-A'); git('commit', '-qm', 'docs(tally): seed disposable fix batches proof'); git('push', '-qu', 'origin', 'proof');

// A run whose only phase is closed and whose test audit is allocated, as Kiln allocates it.
const at = new Date().toISOString();
const paths = { mainCheckoutPath: repository, repositoryName: 'tally', folderName: 'tally', prdDirectoryFromRoot: directory, featureName: 'Tally' };
const record = newPrdRecord({ mainCheckoutPath: repository, repositoryName: 'tally', github: 'example/tally', prdDirectoryFromRoot: directory, featureName: 'Tally', settings: { workspaceFolder: root, worktreePath: repository, featureBranch: 'proof', baseBranch: 'proof', bases: {}, keepAwake: false, resumeAfterUsageLimit: false } });
Object.assign(record, { startedAt: at, setupCompletedAt: at, auditLoops: startedLedger(at) });
record.settings.auditLoops = { deliveryLimit: 4, testLimit: 4 };
record.repositories = [{ name: 'tally', kind: 'prd', github: 'example/tally', mainCheckoutPath: repository, worktreePath: repository, baseBranch: 'proof', baseCommit: git('rev-parse', 'HEAD'), setupCompletedAt: at }];
const plan = readPlanAt(repository, directory); if (!plan.ok) throw new Error(plan.problem); record.plan = recordedPlan(plan.plan);
const skill = await resolveAuditSkill({ kind: 'test_audit', agent: agentId, claude: 'claude', codex: 'codex', cwd: repository, env, signal: globalThis.AbortSignal.timeout(120_000) });
const activity = { activityId: randomUUID(), sequence: 1, kind: 'test_audit', round: 1, continuationIndex: 1, createdAt: at, sessionIds: [], reportPath: '', skill, snapshots: [], attempts: [] };
activity.reportPath = `${directory}/kiln-audit-${activity.activityId}.json`; record.completionAudits.activities.push(activity);
const key = `audit-${activity.activityId}`;
record.phases[key] = { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [] };
record.auditLoops.loops.push({ kind: 'test', number: 1, startedAt: at, activityKey: key });
const stateDirectory = prdStateDirectory(stateRoot(env), repository, 'tally', directory); mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
activity.snapshots.push(new AuditStore(stateDirectory).put(await captureSnapshot({ record, activity, git: { git: 'git', env }, evidence: [], now: at }, [], [])));
writePrdRecord(stateDirectory, record);

const engine = new Engine({ record, stateDirectory, paths, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env });
// Each agent's run takes its own ports, so the two can run at once.
const lock = await takeInstanceLock(stateRoot(env), stateDirectory, { range: agentId === 'codex' ? { first: 4770, last: 4779 } : { first: 4760, last: 4769 } }); if (!lock.taken) throw new Error('No proof instance lock');
let server;
try {
  await engine.refreshAgents();
  server = await startLocalServer({ engine, port: lock.port, folderName: 'tally', featureName: 'Tally', token: record.token });
  const prompt = engine.auditPrompt(activity);
  // The Audits row's shipped choice on this agent, resolved to the newest version it offers.
  const choice = SHIPPED_DEFAULTS.audits.first.agentId === agentId ? SHIPPED_DEFAULTS.audits.first : SHIPPED_DEFAULTS.audits.fallback;
  const models = agentId === 'codex' ? (await readCodexMetadata({ executable: 'codex', cwd: repository, cwds: [repository], env })).models : (await readModelList({ claude: 'claude', cwd: stateDirectory, env })).models;
  const model = newestOfFamily(choice, models).entry.value;
  const session = { schemaVersion: 26, agentId, sessionId: randomUUID(), phaseId: key, activityId: activity.activityId, kind: 'test_audit', createdAt: new Date().toISOString(), model, modelDisplayName: model, effort: choice.effort, workingDirectory: repository, runs: [], sleeps: [], steps: [] };
  activity.sessionIds.push(session.sessionId); record.phases[key].sessionIds.push(session.sessionId);
  writeSessionRecord(stateDirectory, session);
  console.log(JSON.stringify({ root, agentId, model, effort: choice.effort, skill: skill.path }));
  const run = agentId === 'codex'
    ? await runCodexSession({ executable: 'codex', cwd: repository, writableRoots: [root], repositories: [{ path: repository, branch: 'proof' }], env, record: session, stateDirectory, prompt, cause: 'launch' })
    : await runSessionProcess({ claude: 'claude', args: launchArguments(session.sessionId, model, choice.effort), cwd: repository, env, prompt, cause: 'launch', stateDirectory, record: session });

  const accepted = acceptedAudit(stateDirectory, engine.record.completionAudits.activities[0]);
  const record_ = readFileSync(join(repository, directory, 'test-audit.md'), 'utf8');
  // The skill's own batch lines: "**Batch 1 of 2:** AC-…".
  const listed = [...record_.matchAll(/\*\*Batch (\d+) of (\d+):\*\*([^\n]*)/g)].map(match => ({ number: Number(match[1]), of: Number(match[2]), criteria: [...match[3].matchAll(/AC-[A-Z]+-\d+/g)].map(one => one[0]) }));
  const result = { agentId, model, exit: run?.exitCode ?? run?.error ?? null, accepted: !!accepted, outcome: accepted?.report.outcome, fixBatches: accepted?.report.fixBatches ?? null, listed, testWork: engine.record.completionAudits.activities[0].testWork ?? null, lastMessage: (run?.result?.text ?? '').slice(-600) };
  writeFileSync(join(root, 'proof-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  assert.ok(accepted, 'Kiln accepted the real session\'s report.');
  assert.equal(accepted.report.outcome, 'continue_test', 'Built, weakly tested criteria leave test work.');
  assert.ok(listed.length > 0, 'The skill listed its batches in test-audit.md.');
  assert.deepEqual(accepted.report.fixBatches.map(batch => [...batch.criteria].sort()), listed.map(batch => [...batch.criteria].sort()), 'fixBatches matches the batches the skill listed, in order.');
  assert.deepEqual(result.testWork.batches, accepted.report.fixBatches, 'The plan is on the activity.');
  console.log('planned test fix batches provider proof passed');
} finally { await server?.close(); lock.release(); engine.close(); }
