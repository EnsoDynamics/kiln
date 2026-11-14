// Opt-in, authenticated proof: node scripts/proof-run/run-restart-provider-proof.mjs claude_code|codex
// Kiln Run Restart, Phase 1 (technical design, Delivery): with the actual installed provider, the
// production Engine and HTTP routes and disposable Git, a carry-on session receives the person's
// reply, the earlier last message and the phase's work (AC-CARRY-05) and its receipt reads
// `started`; for Claude Code, start again launches the phase's first session (AC-CASE-02) and a
// takeover hold whose conversation can't be reopened ends when the carry-on run reports `init`
// (AC-CARRY-06). The provider is told to use no tools; the driver owns every fixture change.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Engine } from '../../dist/engine/engine.js';
import { defaultSettings } from '../../dist/engine/worktree-setup.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readSessionRecord, writeSessionRecord } from '../../dist/state/records.js';
import { runSessionProcess, launchArguments } from '../../dist/session/claude-session.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { findTranscripts, claudeConfigFolder } from '../../dist/session/transcripts.js';
import { startLocalServer } from '../../dist/server/local-server.js';

const agentId = process.argv[2];
assert.ok(['claude_code', 'codex'].includes(agentId));
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-restart-${agentId}-`)));
const repository = join(root, 'proof'); const stateDirectory = join(root, 'state');
mkdirSync(repository); mkdirSync(stateDirectory);
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
git('init', '-q', '--bare', join(root, 'origin.git')); git('init', '-q', '-b', 'develop');
git('config', 'user.name', 'Kiln Restart Proof'); git('config', 'user.email', 'proof@example.invalid');
git('remote', 'add', 'origin', join(root, 'origin.git'));
const directory = 'docs/prds/restart-proof'; mkdirSync(join(repository, directory), { recursive: true });
const instructions = 'This is a disposable Kiln proof, not an implementation task. For this whole conversation, including any later message that asks you to implement or continue a phase, do not run skills or tools, change files, commit, push or implement anything. The driver owns every change. Answer in one short paragraph and stop. When a message contains proof markers (words starting with "marker-"), repeat every marker it contains, exactly, in your answer.';
writeFileSync(join(repository, 'AGENTS.md'), `${instructions}\n`); writeFileSync(join(repository, 'CLAUDE.md'), `${instructions}\n`);
writeFileSync(join(repository, directory, 'restart-proof-prd.md'), '# PRD: Disposable restart proof\n\n## Acceptance Criteria\n\n- [ ] **AC-PROOF-01** Carry on.\n');
writeFileSync(join(repository, directory, 'restart-proof-technical-design.md'), '# Technical design: Disposable restart proof\nConversation only; the driver owns file writes.\n');
writeFileSync(join(repository, directory, 'phase-1-conversation.md'), '# Phase 1: Conversation\n\n## Acceptance criteria covered\nAC-PROOF-01\n');
git('add', 'AGENTS.md', 'CLAUDE.md', directory); git('commit', '-qm', 'test(proof): seed disposable restart proof'); git('push', '-qu', 'origin', 'develop');
const baseCommit = git('rev-parse', 'HEAD');
const paths = { mainCheckoutPath: repository, repositoryName: 'proof', folderName: 'restart-proof', prdDirectoryFromRoot: directory, featureName: 'Disposable restart proof' };
const settings = defaultSettings(paths, { branches: new Map([['develop', baseCommit]]), defaultBranch: 'develop' });
Object.assign(settings, { featureBranch: 'develop', worktreePath: repository, workspaceFolder: root, keepAwake: false, resumeAfterUsageLimit: false });
const record = newPrdRecord({ ...paths, github: 'proof/disposable', featureName: 'Disposable restart proof', settings });
record.settings.agentId = agentId;
const model = agentId === 'codex' ? 'gpt-6.1-sol' : 'opus';
record.settings.agentChoices[agentId] = { model, effort: 'high' };

// The earlier conversation: one real turn whose last message carries a marker the carry-on prompt must pass on.
const earlierMarker = `marker-earlier-${randomUUID().slice(0, 8)}`;
const session = { schemaVersion: 4, agentId, sessionId: randomUUID(), phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model, modelDisplayName: model, effort: 'high', workingDirectory: repository, runs: [], sleeps: [], steps: [] };
console.log(JSON.stringify({ root, agentId, sessionId: session.sessionId }));
writeSessionRecord(stateDirectory, session);
const opening = `Reply with exactly this sentence and the marker: "Blocked before any code; continue once the import work is merged. ${earlierMarker}"`;
const initial = agentId === 'codex'
  ? await runCodexSession({ executable: 'codex', cwd: repository, writableRoots: [root], repositories: [{ path: repository, branch: 'develop' }], env: process.env, record: session, stateDirectory, prompt: opening, cause: 'launch' })
  : await runSessionProcess({ claude: 'claude', args: launchArguments(session.sessionId, model, 'high'), cwd: repository, env: process.env, prompt: opening, cause: 'launch', stateDirectory, record: session });
assert.ok(initial.pid); assert.ok(initial.result?.text?.includes(earlierMarker) || agentId === 'codex', JSON.stringify(initial));
writeSessionRecord(stateDirectory, session);

const at = new Date().toISOString();
record.startedAt = at; record.setupCompletedAt = at;
record.repositories = [{ name: 'proof', kind: 'prd', mainCheckoutPath: repository, github: 'proof/disposable', baseBranch: 'develop', worktreePath: repository, baseCommit, setupCompletedAt: at }];
record.phases['1'] = { sessionIds: [session.sessionId], finishedByPerson: false, repositories: { proof: { startCommit: baseCommit } }, stop: { kind: 'done_check', at, checkedAt: at, checks: [{ name: 'Phase doc closed', passed: false, facts: ['Open proof phase'] }] } };

// The earlier conversation can't be reopened: Claude's saved file is gone; Codex's thread read is recorded as failed.
if (agentId === 'codex') { session.codex.conversationUnavailable = true; session.codex.resumeError = 'Codex conversation cannot be opened: proof made it unavailable'; writeSessionRecord(stateDirectory, session); }
else rmSync(findTranscripts(claudeConfigFolder(process.env), session.sessionId).main);

const events = [];
const engine = new Engine({ paths, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env: process.env, stateDirectory, record, onTerminal: event => events.push(event), sleepReader: { next: async () => [] }, originRetryMs: 0 });
let server;
const result = { agentId, root };
try {
  assert.equal((await engine.prepare()).ok, true);
  for (let i = 0; i < 240 && (engine.agents.state.pending || engine.billing.busy); i++) await delay(250);
  server = await startLocalServer({ engine, port: 0, folderName: 'restart-proof', featureName: 'Restart proof', token: record.token });
  const origin = new URL(server.address).origin;
  const act = async (path, body) => {
    const response = await globalThis.fetch(`${origin}/api/${path}`, { method: 'POST', headers: { Origin: origin, 'X-Kiln-Token': record.token, 'X-Kiln-Status': engine.controlView().token, 'X-Kiln-Command-Id': randomUUID(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const answer = await response.json(); console.log(JSON.stringify({ path, status: response.status, outcome: answer.outcome, code: answer.code, reason: answer.reason }));
    return answer;
  };

  // AC-CARRY-05: carry on with a reply; the new session gets the reply, the earlier last message and the work.
  assert.equal(engine.reopenCheck('1').state, 'unavailable');
  assert.equal(engine.carryOnControl().available, true, JSON.stringify(engine.carryOnControl()));
  const replyMarker = `marker-reply-${randomUUID().slice(0, 8)}`;
  const carried = await act('carry-on', { target: engine.phaseRecoveryTarget(), note: `The import work is merged now. ${replyMarker}` });
  assert.equal(carried.ok, true, JSON.stringify(carried)); assert.equal(carried.outcome, 'session_started'); assert.equal(carried.operation.effects.session, 'started');
  await engine.settled();
  const carryOn = readSessionRecord(stateDirectory, '1', record.phases['1'].sessionIds[1]);
  assert.equal(carryOn.startedAs, 'carry_on');
  const answer = carryOn.runs.at(-1).result?.text ?? '';
  if (agentId === 'claude_code') { assert.ok(answer.includes(replyMarker), answer); assert.ok(answer.includes(earlierMarker), answer); }
  Object.assign(result, { carryOnStarted: true, carryOnSession: carryOn.sessionId, replyReceived: answer.includes(replyMarker), lastMessageReceived: answer.includes(earlierMarker), turnId: carryOn.runs.at(-1).codex?.turnId ?? null });
  if (agentId === 'codex') assert.ok(carryOn.runs.at(-1).codex?.turnId, JSON.stringify(carryOn.runs.at(-1)));

  if (agentId === 'claude_code') {
    // AC-CARRY-06: a takeover hold on the carry-on session's ended attempt, whose saved conversation is then gone, ends when the next carry-on run reports init.
    const run = carryOn.runs.at(-1);
    const target = { executionId: record.executionId, activityId: record.activities?.findLast?.(a => a.key === '1')?.activityId ?? randomUUID(), activityKey: '1', sessionId: carryOn.sessionId, providerSessionId: carryOn.sessionId, attemptId: run.control.attemptId };
    record.liveControl = { version: 1, revision: 1, takeover: { target, operationId: randomUUID(), instructionId: 'proof-hold', requestedAt: new Date().toISOString(), state: 'pending', observedAt: new Date().toISOString(), reason: 'Proof hold.' } };
    rmSync(findTranscripts(claudeConfigFolder(process.env), carryOn.sessionId).main);
    await engine.reconcileTakeover();
    assert.equal(record.liveControl.takeover.history?.state, 'unavailable', JSON.stringify(record.liveControl.takeover));
    assert.equal(engine.carryOnControl().available, true, JSON.stringify(engine.carryOnControl()));
    const held = await act('carry-on', { target: engine.phaseRecoveryTarget(), note: 'Carry on from the hold. marker-hold' });
    assert.equal(held.outcome, 'session_started', JSON.stringify(held)); await engine.settled();
    assert.equal(record.liveControl, undefined, 'The hold ended when the carry-on run reported init.');
    result.holdEndedOnInit = true;

    // AC-CASE-02: a session whose launch began no conversation leaves the phase couldn't-start; Start again launches its first session.
    const stop = record.phases['1'].stop; assert.ok(stop, 'the proof phase stopped again');
    const fresh = { schemaVersion: 4, agentId, sessionId: randomUUID(), phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model, modelDisplayName: model, effort: 'high', workingDirectory: repository, runs: [{ startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), cause: 'launch', pid: 1, exitCode: 1 }], sleeps: [], steps: [] };
    writeSessionRecord(stateDirectory, fresh);
    record.phases['1'].sessionIds = [fresh.sessionId];
    assert.equal(engine.stoppedCase('1'), 'could_not_start');
    assert.equal(engine.startAgainControl().available, true, JSON.stringify(engine.startAgainControl()));
    const again = await act('start-again', {});
    assert.equal(again.outcome, 'session_started', JSON.stringify(again)); await engine.settled();
    const restarted = readSessionRecord(stateDirectory, '1', record.phases['1'].sessionIds.at(-1));
    assert.equal(restarted.startedAs, undefined); assert.ok(restarted.runs.at(-1).pid);
    result.startAgainStarted = true;
  }
  result.passed = true;
  writeFileSync(join(root, 'proof-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await server?.close(); await engine.stop('sigint'); }
