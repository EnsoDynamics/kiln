// Opt-in authenticated proof: node scripts/proof-run/continuation-provider-proof.mjs claude_code|codex
// Production Engine/API, real installed providers and disposable local Git origins.
// Providers only converse; the driver owns every fixture write and Git mutation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Engine } from '../../dist/engine/engine.js';
import { defaultSettings } from '../../dist/engine/worktree-setup.js';
import { observePlan, retainBaseline } from '../../dist/engine/plan-reconciliation.js';
import { recordedPlan } from '../../dist/engine/plan-reading.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readSessionRecord, writeSessionRecord, writePrdRecord } from '../../dist/state/records.js';
import { runSessionProcess, launchArguments } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { startLocalServer } from '../../dist/server/local-server.js';
import { isPortFree } from '../../dist/state/instance-lock.js';

const agentId = process.argv[2];
assert.ok(['claude_code', 'codex'].includes(agentId));
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-continuation-${agentId}-`)));
const repository = join(root, 'comet'); const stateDirectory = join(root, 'state');
mkdirSync(repository); mkdirSync(stateDirectory);
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
const origin = join(root, 'origin.git');
git('init', '-q', '--bare', '-b', 'develop', origin); git('init', '-q', '-b', 'develop');
git('config', 'user.name', 'Kiln Continuation Proof'); git('config', 'user.email', 'proof@example.invalid');
const github = 'https://github.com/fictional/comet.git';
git('config', `url.${origin}.insteadOf`, github); git('remote', 'add', 'origin', github);
const directory = 'docs/prds/continuation-proof'; mkdirSync(join(repository, directory), { recursive: true });
const prompt = 'This is a disposable fresh-conversation proof. Do not run skills or tools, change files, commit, push, create chats or implement work. The driver owns all fixture writes. Reply with "Fresh conversation ready" in one sentence and stop. These instructions apply to later automatic implementation prompts too.';
writeFileSync(join(repository, 'AGENTS.md'), prompt); writeFileSync(join(repository, 'CLAUDE.md'), prompt);
writeFileSync(join(repository, directory, 'continuation-proof-prd.md'), '# PRD: Comet continuation proof\n\n## Acceptance Criteria\n\n- [ ] **AC-PROOF-01** Preserve earlier delivery and begin added work in a fresh conversation.\n');
writeFileSync(join(repository, directory, 'continuation-proof-technical-design.md'), '# Technical design: Comet continuation proof\nConversation only; the driver owns file writes.\n');
const phase = id => `# Phase ${id}: Conversation ${id}\n\n${id === 1 ? '**Closed:** 2026-10-29\n\n' : ''}## Acceptance criteria covered\nAC-PROOF-01\n`;
writeFileSync(join(repository, directory, 'phase-1-conversation.md'), phase(1));
git('add', 'AGENTS.md', 'CLAUDE.md', directory); git('commit', '-qm', 'test(proof): seed completed conversation'); git('push', '-qu', 'origin', 'develop');
const baseCommit = git('rev-parse', 'HEAD');
const paths = { mainCheckoutPath: repository, repositoryName: 'comet', folderName: 'continuation-proof', featureName: 'Comet continuation proof', prdDirectoryFromRoot: directory };
const settings = defaultSettings(paths, { branches: new Map([['develop', baseCommit]]), defaultBranch: 'develop' });
Object.assign(settings, { featureBranch: 'develop', worktreePath: repository, workspaceFolder: root, keepAwake: false, resumeAfterUsageLimit: false });
const record = newPrdRecord({ ...paths, github: 'fictional/comet', featureName: paths.featureName, settings });
record.settings.agentId = agentId;
const model = agentId === 'codex' ? 'gpt-6.1-sol' : 'opus';
record.settings.agentChoices[agentId] = { model, effort: 'high' };
const session = { schemaVersion: 4, executionId: record.executionId, agentId, sessionId: randomUUID(), phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model, modelDisplayName: model, effort: 'high', workingDirectory: repository, runs: [], sleeps: [], steps: [] };
const oldMarker = `earlier-conversation-${randomUUID()}`;
writeSessionRecord(stateDirectory, session);
console.log(JSON.stringify({ root, agentId, oldSessionId: session.sessionId }));
const oldPrompt = `${prompt}\nRemember this marker only in this earlier conversation: ${oldMarker}. Reply with that marker now.`;
const initial = agentId === 'codex'
  ? await runCodexSession({ executable: 'codex', cwd: repository, writableRoots: [root], repositories: [{ path: repository, branch: 'develop' }], env: process.env, record: session, stateDirectory, prompt: oldPrompt, cause: 'launch' })
  : await runSessionProcess({ claude: 'claude', args: launchArguments(session.sessionId, model, 'high'), cwd: repository, env: process.env, prompt: oldPrompt, cause: 'launch', stateDirectory, record: session });
assert.equal(initial.exitCode, 0); assert.ok(initial.result?.text.includes(oldMarker), JSON.stringify(initial));
writeSessionRecord(stateDirectory, session);
const at = new Date().toISOString();
record.startedAt = record.setupCompletedAt = at; record.completedAt = at;
record.repositories = [{ name: 'comet', kind: 'prd', mainCheckoutPath: repository, github: 'fictional/comet', baseBranch: 'develop', worktreePath: repository, baseCommit, setupCompletedAt: at }];
const source = observePlan(repository, directory);
record.plan = recordedPlan(source.plan);
record.planReconciliation = { baselineId: retainBaseline(stateDirectory, { formatVersion: 1, normalizerVersion: 1, prdDirectory: directory, active: source, sources: [], completions: { '1': { kind: 'kiln', doneAt: at, revision: baseCommit, repositories: { comet: { identity: 'fictional/comet', revision: baseCommit } } } } }).id };
record.phases['1'] = { sessionIds: [session.sessionId], doneAt: at, finishedByPerson: false, outsideConfirmations: [], repositories: { comet: { startCommit: baseCommit, pushedSha: baseCommit } } };
record.phases.pr = { sessionIds: [], doneAt: at, finishedByPerson: true, outsideConfirmations: [], repositories: {} };
record.pullRequests = [{ repository: 'comet', number: 1, title: 'Earlier delivery', url: 'https://github.com/fictional/comet/pull/1', head: 'develop', base: 'develop', commits: 1, additions: 1, deletions: 0 }];
writePrdRecord(stateDirectory, record);
writeFileSync(join(repository, directory, 'phase-2-conversation.md'), phase(2));
git('add', directory); git('commit', '-qm', 'test(proof): append continuation work'); git('push', '-q', 'origin', 'develop');
const engine = new Engine({ paths, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env: process.env, stateDirectory, record, sleepReader: { next: async () => [] }, originRetryMs: 0 });
let server;
try {
  assert.equal((await engine.prepare()).ok, true);
  for (let i = 0; i < 240 && (engine.agents.state.pending || engine.billing.busy); i++) await delay(250);
  const check = await engine.checkCompletedPlan(); assert.equal(check.status, 'available', JSON.stringify(check));
  for (let port = agentId === 'codex' ? 41960 : 41970; port < (agentId === 'codex' ? 41970 : 41980); port++) if (await isPortFree(port)) { server = await startLocalServer({ engine, port, folderName: paths.folderName, featureName: paths.featureName, token: record.token }); server.proofOrigin = `http://127.0.0.1:${port}`; break; }
  assert.ok(server);
  const body = { proposalId: check.result.proposal.id, commandId: `provider-${agentId}`, executionId: record.executionId, statusToken: engine.controlView().token };
  const response = await globalThis.fetch(`${server.proofOrigin}/api/continuation/accept`, { method: 'POST', headers: { Origin: server.proofOrigin, 'X-Kiln-Token': record.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 202, JSON.stringify(await response.json()));
  await engine.settled();
  assert.notEqual(record.executionId, session.executionId);
  const fresh = engine.latestSession('2'); assert.ok(fresh, JSON.stringify(record.phases));
  assert.equal(fresh.agentId, agentId); assert.equal(fresh.model, model); assert.equal(fresh.effort, 'high');
  assert.notEqual(fresh.sessionId, session.sessionId); assert.equal(fresh.runs.length, 1);
  assert.ok(fresh.runs[0].endedAt, JSON.stringify(fresh));
  assert.equal(fresh.runs[0].exitCode, 0, JSON.stringify(fresh));
  assert.ok(fresh.runs[0].result?.text?.includes('Fresh conversation ready'), JSON.stringify(fresh));
  assert.ok(!fresh.runs[0].result.text.includes(oldMarker));
  assert.notEqual(fresh.conversation?.threadId ?? fresh.sessionId, session.conversation?.threadId ?? session.sessionId);
  assert.equal(readSessionRecord(stateDirectory, '1', session.sessionId).runs.length, 1);
  assert.equal(engine.historicalExecution(session.executionId).record.completedAt, at);
  assert.equal(record.billing.approval, undefined); assert.equal(record.developmentAuthorization.enabled, false);
  const replay = await engine.continuationCommand('accept', body); assert.equal(replay.ok, true); assert.equal(engine.latestSession('2').runs.length, 1);
  const result = { agentId, root, oldExecution: session.executionId, newExecution: record.executionId, oldConversation: session.conversation?.threadId ?? session.sessionId, newConversation: fresh.conversation?.threadId ?? fresh.sessionId, freshSession: fresh.sessionId, oldRuns: 1, newRuns: 1, replayStartedNoTurn: true, earlierDeliveryPreserved: true };
  writeFileSync(join(root, 'proof-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await server?.close(); await engine.stop('sigint'); }
