// Real Claude/Codex restricted-conversation -> explicit HTTP grant -> recovery proof.
// Usage: node --experimental-strip-types scripts/proof-run/development-activation-proof.mjs <Phase-1-proof-root> [--terminal-recovery]
// Terminal mode sends the browser-displayed handoff to the original provider conversation.
// Reads the inherited disposable GitHub delivery; creates only private local test workspaces/state.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../../dist/engine/engine.js';
import { readPlanAt, recordedPlan } from '../../dist/engine/plan-reading.js';
import { phaseDeliveryCheck, reconcileDelivery } from '../../dist/engine/development-delivery.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readPrdRecord, SCHEMA_VERSION, writePrdRecord, writeSessionRecord } from '../../dist/state/records.js';
import { stateRoot, prdStateDirectory } from '../../dist/state/state-files.js';
import { takeInstanceLock } from '../../dist/state/instance-lock.js';
import { startLocalServer } from '../../dist/server/local-server.js';
import { buildSnapshot } from '../../dist/engine/snapshot.js';
import { launchChrome } from '../../src/test-support/headless-chrome.ts';
import { launchArguments, resumeArguments, runSessionProcess } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
const terminalRecovery = process.argv.includes('--terminal-recovery');
const inherited = realpathSync(process.argv[2]);
const manifest = JSON.parse(readFileSync(join(inherited, 'proof.json'), 'utf8'));
assert.equal(manifest.purpose, 'Kiln development delivery proof');
assert.equal(manifest.repository, 'EnsoDynamics/kiln-proof-development-delivery-20261024');
const previous = JSON.parse(readFileSync(join(inherited, 'proof-result.json'), 'utf8'));
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-activation-${manifest.provider}-`)));
const main = join(root, 'proof-main'); mkdirSync(main); const workspace = join(root, 'workspace'); mkdirSync(workspace);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git(main, 'init', '-b', 'main'); git(main, 'config', 'user.name', 'Kiln Activation Proof'); git(main, 'config', 'user.email', 'kiln-proof@example.invalid');
git(main, 'remote', 'add', 'origin', `https://github.com/${manifest.repository}.git`); git(main, 'fetch', 'origin', 'main', manifest.branch); git(main, 'reset', '--hard', 'origin/main');
const worktree = join(workspace, 'proof'); git(main, 'worktree', 'add', '-b', manifest.branch, worktree, `origin/${manifest.branch}`);
const directory = join(worktree, manifest.prdDirectory);
writeFileSync(join(directory, 'phase-2-recover.md'), '# Phase 2: Recover development verification\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\n1\n');
writeFileSync(join(directory, 'phase-3-future.md'), '# Phase 3: Future work is forbidden to activation recovery\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\n2\n');
// Both source and squash result remain available; no inherited checkout is touched.
git(worktree, 'add', manifest.prdDirectory); git(worktree, 'commit', '-m', 'test(proof): seed restricted activation recovery leaves');
const env = { ...process.env, XDG_STATE_HOME: join(root, 'state'), LOCALAPPDATA: join(root, 'state') };
const stateDirectory = prdStateDirectory(stateRoot(env), main, 'proof', manifest.prdDirectory);
const agent = manifest.provider === 'codex' ? 'codex' : 'claude_code'; const at = new Date().toISOString();
const record = newPrdRecord({ mainCheckoutPath: main, repositoryName: 'proof', github: manifest.repository, prdDirectoryFromRoot: manifest.prdDirectory, featureName: 'Disposable development activation recovery', settings: { workspaceFolder: workspace, worktreePath: worktree, featureBranch: manifest.branch, baseBranch: 'main', bases: {}, model: 'sonnet', effort: 'low', keepAwake: false, resumeAfterUsageLimit: false } });
record.settings.agentId = agent; record.settings.agentChoices[agent] = { model: agent === 'codex' ? 'gpt-6.1-sol' : 'sonnet', effort: 'low' };
record.executionId = randomUUID(); record.startedAt = at; record.setupCompletedAt = at;
record.repositories = [{ name: 'proof', kind: 'prd', mainCheckoutPath: main, github: manifest.repository, baseBranch: 'main', worktreePath: worktree, baseCommit: manifest.base, setupCompletedAt: at }];
const plan = readPlanAt(worktree, manifest.prdDirectory); assert.ok(plan.ok); record.plan = recordedPlan(plan.plan);
const checkpoint = globalThis.structuredClone(previous.ledger.checkpoints[0]); checkpoint.executionId = record.executionId;
// Seed real remotely accepted merge/deployment facts, deliberately omit historical verification.
// The grant must reconcile these facts instead of repeating a merge/deployment.
checkpoint.requirements.find(one => one.purpose === 'verification').match.cwd = worktree;
checkpoint.operations = checkpoint.operations.filter(one => one.kind !== 'verify' && one.kind !== 'deploy');
checkpoint.evidence = []; delete checkpoint.evidenceHistory; delete checkpoint.unresolvedReason; checkpoint.unresolvedRequirements = {};
record.developmentDelivery.checkpoints = [checkpoint];
record.developmentDelivery.assessments = [{ phaseId: '1', documentsDigest: '0'.repeat(64), required: true, criteria: ['AC-PROOF-01'], reason: 'Historical workflow still requires independently recovered evidence.', checkpointIds: [checkpoint.id] }];
const history = { sessionIds: [], doneAt: checkpoint.merge.mergedAt, finishedByPerson: false, repositories: { proof: { startCommit: manifest.base, pushedSha: manifest.head, commitCount: 1 } }, outsideConfirmations: [] };
record.phases['1'] = globalThis.structuredClone(history);
const session = { schemaVersion: SCHEMA_VERSION, agentId: agent, sessionId: randomUUID(), phaseId: '2', kind: 'phase', createdAt: at, model: record.settings.agentChoices[agent].model, modelDisplayName: agent, effort: 'low', workingDirectory: worktree, runs: [], sleeps: [], steps: [] };
record.phases['2'] = { sessionIds: [session.sessionId], finishedByPerson: false, repositories: { proof: { startCommit: git(worktree, 'rev-parse', 'HEAD') } }, outsideConfirmations: [] };
writePrdRecord(stateDirectory, record); writeSessionRecord(stateDirectory, session);
const options = { paths: { mainCheckoutPath: main, repositoryName: 'proof', folderName: manifest.prdDirectory.split('/').at(-1), prdDirectoryFromRoot: manifest.prdDirectory, featureName: record.featureName }, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env, stateDirectory, record, originRetryMs: 0, onTerminal: event => console.log('EVENT', JSON.stringify(event)) };
let engine = new Engine(options);
const lock = await takeInstanceLock(stateRoot(env), stateDirectory); assert.ok(lock.taken);
const server = await startLocalServer({ engine, port: lock.port, folderName: options.paths.folderName, featureName: record.featureName, token: record.token });
const cli = { executable: process.execPath, script: fileURLToPath(new URL('../../dist/cli.js', import.meta.url)) };
const folder = join(worktree, '.kiln-proof'); mkdirSync(folder, { recursive: true });
writeFileSync(join(folder, 'activation-manifest.json'), JSON.stringify({ cli, checkpointId: checkpoint.id }));
writeFileSync(join(folder, 'activation-driver.mjs'), readFileSync(new URL('./development-activation-driver.mjs', import.meta.url)));
const initial = `This is a controlled, disposable Kiln provider proof. You are in ${worktree} on ${manifest.branch}. The execution is restricted: no merges or deployments are authorized. Do not modify tracked files. Run exactly this one read-only command, then stop: ${cli.executable} ${cli.script} delivery status. State that development deployments are disabled. Do not inspect skills or perform implementation.`;
console.log('PROOF', JSON.stringify({ root, provider: agent, sessionId: session.sessionId, address: server.address }));
writeFileSync(join(root, 'activation-proof.json'), JSON.stringify({ root, inherited, provider: agent, worktree, stateDirectory, sessionId: session.sessionId, address: server.address }));
try {
  engine.current = { phaseKey: '2', session, commits: [], processRunning: true };
  if (agent === 'codex') await runCodexSession({ executable: 'codex', cwd: worktree, writableRoots: [workspace], repositories: [{ path: worktree, branch: manifest.branch }], env, record: session, stateDirectory, prompt: initial, cause: 'launch' });
  else await runSessionProcess({ claude: 'claude', args: launchArguments(session.sessionId, session.model, session.effort), cwd: worktree, env, prompt: initial, cause: 'launch', stateDirectory, record: session });
  writeSessionRecord(stateDirectory, session); engine.current = undefined;
  assert.equal(record.developmentAuthorization.enabled, false);
  record.phases['2'].stop = { kind: 'done_check', at, checkedAt: at, checks: [{ name: 'Closed', passed: false, facts: ['Controlled restricted recovery stop'] }] };
  writePrdRecord(stateDirectory, record);
  const headers = { 'X-Kiln-Token': record.token, Origin: new URL(server.address).origin, 'Content-Type': 'application/json' };
  const payload = { executionId: record.executionId, authorizationRevision: record.developmentAuthorization.revision, target: checkpoint.target, confirmedNonProduction: true };
  const grant = await globalThis.fetch(`${new URL(server.address).origin}/api/development-authorization`, { method: 'POST', headers, body: JSON.stringify(payload) }); assert.equal(grant.status, 200, await grant.text());
  assert.deepEqual(record.developmentAuthorization.activationRecovery.phaseIds, ['1', '2']);
  const historicalMerge = globalThis.structuredClone(checkpoint.merge);
  const note = readFileSync(new URL('./development-activation-provider-prompt.txt', import.meta.url), 'utf8').replaceAll('{{MERGE}}', checkpoint.merge.resultSha).replaceAll('{{ENVIRONMENT}}', checkpoint.target.environment);
  if (terminalRecovery) {
    const chrome = await launchChrome();
    let handoff;
    try {
      const page = await chrome.open(server.address);
      await page.waitFor(`document.body.innerText.includes('Copy recovery prompt')`);
      handoff = await page.evaluate(`document.querySelector('.pick pre.prompt').textContent`);
      assert.equal(handoff, buildSnapshot(engine).needsYou.resumePrompt);
      const command = await page.evaluate(`document.querySelector('.pick pre').textContent`);
      assert.equal(command, buildSnapshot(engine).needsYou.resumeCommand);
      assert.ok(command.includes(agent === 'codex' ? session.conversation.threadId : session.sessionId));
      assert.ok(handoff.includes(checkpoint.target.environment));
      writeFileSync(join(root, 'terminal-recovery.png'), await page.screenshot());
      writeFileSync(join(root, 'terminal-recovery-prompt.txt'), handoff);
      assert.deepEqual(page.problems, []);
    } finally { await chrome.close(); }
    // The person's instructions precede the copied authority/task handoff. The same native
    // conversation is continued with print/structured output so the proof can read its result.
    const prompt = `${note}\n\n${handoff}`;
    engine.current = { phaseKey: '2', session, commits: [], processRunning: true };
    try {
      if (agent === 'codex') await runCodexSession({ executable: 'codex', cwd: worktree, writableRoots: [workspace], repositories: [{ path: worktree, branch: manifest.branch }], env, record: session, stateDirectory, prompt, cause: 'person_resume' });
      else await runSessionProcess({ claude: 'claude', args: resumeArguments(session.sessionId, session.initModel ?? session.model, session.effort), cwd: worktree, env, prompt, cause: 'person_resume', stateDirectory, record: session });
      writeSessionRecord(stateDirectory, session);
    } finally { engine.current = undefined; }
  } else {
    const resumed = await engine.resume({ note }); assert.ok(resumed.ok, JSON.stringify(resumed)); await engine.settled();
  }
  const context = { record, stateDirectory, prdWorktree: worktree, prdDirectory: manifest.prdDirectory, git: { git: 'git', env }, gh: 'gh', env, phaseId: '2', now: () => new Date().toISOString(), commands: id => engine.deliveryCommands(id) };
  await reconcileDelivery(context);
  if (phaseDeliveryCheck(context, '1').passed && !phaseDeliveryCheck(context, '2').passed) {
    // A live provider log may advance during an audit. Resolve from stable authoritative
    // history, then use the same real conversation for the still-missing assessment.
    const remaining = await engine.resume({ note: 'The earlier delivery now passes a fresh authoritative reconciliation. Do not repeat verification, merging or deployment. Run only node .kiln-proof/activation-driver.mjs assess-2 and node .kiln-proof/activation-driver.mjs status, then stop. Keep the phase open.' });
    assert.ok(remaining.ok, JSON.stringify(remaining)); await engine.settled(); await reconcileDelivery(context);
  }
  const checks = ['1', '2'].map(id => phaseDeliveryCheck(context, id));
  const result = { terminalRecovery, provider: agent, sessionId: session.sessionId, conversation: engine.latestSession('2').conversation, runs: engine.latestSession('2').runs.map(run => ({ cause: run.cause, pid: run.pid, endedAt: run.endedAt, codex: run.codex })), checks, ledger: record.developmentDelivery, authorization: record.developmentAuthorization, history: record.phases['1'], expectedHistory: history, futureRefusal: JSON.parse(readFileSync(join(folder, 'activation-driver-state.json'), 'utf8')).futureRefusal };
  writeFileSync(join(root, 'activation-result.json'), JSON.stringify(result, null, 2));
  assert.ok(checks.every(one => one.passed), JSON.stringify(checks)); assert.deepEqual(record.phases['1'], history); assert.deepEqual(checkpoint.merge, historicalMerge);
  assert.equal(record.developmentDelivery.checkpoints[0].operations.filter(one => one.kind === 'merge').length, 1); assert.ok(!checkpoint.operations.some(one => one.kind === 'deploy'));
  assert.match(result.futureRefusal, /Activation recovery|current judged leaf/);
  assert.ok(engine.record.phases['2'].stop); assert.equal(engine.record.phases['3'], undefined);
  writePrdRecord(stateDirectory, record); engine.close();
  engine = new Engine({ ...options, record: readPrdRecord(stateDirectory) }); await engine.agents.refresh();
  assert.deepEqual(engine.record.phases['1'], history); assert.deepEqual(engine.record.developmentAuthorization, result.authorization);
  assert.equal(engine.authorizeDevelopmentTarget(payload).ok, true);
  assert.deepEqual(engine.record.developmentAuthorization, result.authorization);
  console.log('RESULT', JSON.stringify({ terminalRecovery, root, provider: agent, sessionId: session.sessionId, checks, historyPreserved: true, confirmedMergeReused: true, futureRefused: true, restartIdempotent: true }));
} finally { await server.close(); lock.release(); engine.close(); }
