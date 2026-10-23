// Direct production-adapter proof in disposable linked Git worktrees with local bare origins.
// No normal Kiln execution, network push, method edit, merge or deployment.
// seed | run <folder> | interrupt <folder> | background <folder> | orphan <folder> | resume <folder> | audit <folder>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearInterval, clearTimeout, setTimeout as schedule } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { isProcessLive, processStartTime } from '../../dist/platform/process-start-time.js';
import { endProcessTree } from '../../dist/platform/helper-process.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { auditCodexConversation } from '../../dist/session/codex-evidence.js';
import { readSessionRecord, writeSessionRecord } from '../../dist/state/records.js';
const [mode, folder] = process.argv.slice(2);
if (!['seed','run','interrupt','background','orphan','resume','audit'].includes(mode) || mode !== 'seed' && !folder) throw new Error('seed | run <folder> | interrupt <folder> | background <folder> | orphan <folder> | resume <folder> | audit <folder>');
const root = mode === 'seed' ? realpathSync(mkdtempSync(join(tmpdir(), 'kiln-codex-conversation-'))) : realpathSync(folder);
const workspace = join(root, 'workspace');
const stateDirectory = join(root, 'state');
const manifestPath = join(root, 'conversation-proof.json');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
if (mode === 'seed') {
  mkdirSync(workspace);
  for (const name of ['proof-a','proof-b']) {
    const source = join(root, name); mkdirSync(source);
    git(root, 'init', '--bare', join(root, name + '.git')); git(source, 'init', '-b', 'develop');
    git(source, 'config', 'user.name', 'Kiln Conversation Proof'); git(source, 'config', 'user.email', 'kiln-proof@example.invalid');
    writeFileSync(join(source, 'AGENTS.md'), '# Disposable runner proof\nWork only in assigned linked worktrees on kiln-conversation-proof. Commits and pushes to local bare origins are authorized for this proof. Do not modify other branches or checkouts, merge, deploy, or change method skills. Read this file and CLAUDE.md before editing.\n');
    writeFileSync(join(source, 'CLAUDE.md'), '# Proof instructions\nFollow AGENTS.md.\n');
    git(source, 'add', 'AGENTS.md', 'CLAUDE.md'); git(source, 'commit', '-m', 'test(proof): seed conversation fixture');
    git(source, 'remote', 'add', 'origin', join(root, name + '.git')); git(source, 'worktree', 'add', '-b', 'kiln-conversation-proof', join(workspace, name));
  }
  writeFileSync(manifestPath, JSON.stringify({ purpose: 'Kiln production Codex runner proof', root, workspace, stateDirectory }), { mode: 0o600 });
  console.log(root);
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.root !== root || manifest.purpose !== 'Kiln production Codex runner proof') throw new Error('Not an owned proof folder');
  const repositories = ['proof-a','proof-b'].map(name => ({ path: join(workspace, name), branch: 'kiln-conversation-proof' }));
  const record = readSessionRecord(stateDirectory, '1', 'conversation-proof') ?? { schemaVersion: 4, agentId: 'codex', sessionId: 'conversation-proof', phaseId: '1', kind: 'phase', createdAt: new Date().toISOString(), model: 'gpt-6.1-sol', modelDisplayName: 'GPT-6.1-Sol', effort: 'high', runs: [], sleeps: [], steps: [] };
  const options = { executable: 'codex', cwd: repositories[0].path, writableRoots: [workspace], repositories, env: process.env, record, stateDirectory };
  if (mode === 'audit') {
    const result = await auditCodexConversation({ executable: 'codex', cwd: options.cwd, codexHome: record.conversation.codexHome, threadId: record.conversation.threadId, knownThreadIds: record.conversation.knownThreadIds, worktrees: repositories.map(repository => repository.path), env: process.env });
    writeFileSync(join(root, 'runner-audit.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ coverage: result.coverage, problems: result.problems, findings: result.findings.length, operations: result.operationsChecked }));
  } else {
    const interruptFile = ['interrupt','background','orphan'].includes(mode) ? `${mode}-ready-${record.runs.length + 1}.txt` : manifest.interruptFile;
    if (['interrupt','background','orphan'].includes(mode)) writeFileSync(manifestPath, JSON.stringify({ ...manifest, interruptFile }), { mode: 0o600 });
    const prompt = readFileSync(new URL(`./codex-conversation-${mode}-prompt.txt`, import.meta.url), 'utf8').replaceAll('{{WORKSPACE}}', workspace).replaceAll('{{INTERRUPT_FILE}}', interruptFile ?? 'interrupt-ready.txt');
    const controller = new globalThis.AbortController();
    let timer;
    let abortTimer;
    let checkingMarker = false;
    let markerCheck;
    let fixtureError;
    let lastTurn;
    let orphan;
    let cleanupResult = { exercised: false };
    if (['interrupt','background','orphan'].includes(mode)) timer = setInterval(() => {
      if (checkingMarker || !existsSync(join(repositories[0].path, interruptFile))) return;
      checkingMarker = true;
      clearInterval(timer);
      markerCheck = (async () => {
        if (['background','orphan'].includes(mode)) {
          const pid = Number(readFileSync(join(repositories[0].path, interruptFile), 'utf8').trim());
          if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid orphan fixture PID');
          const startTime = await processStartTime(pid);
          if (!startTime || !await isProcessLive(pid, startTime)) throw new Error('Orphan fixture process did not start');
          orphan = { pid, startTime };
        }
        if (mode !== 'background') abortTimer = schedule(() => controller.abort(), 1000);
      })().catch(error => { fixtureError = error; controller.abort(); });
    }, 250);
    try {
      const run = await runCodexSession({ ...options, prompt, cause: mode === 'run' ? 'launch' : 'person_resume', signal: controller.signal, onWarning: text => console.warn(text), onRecordChange: () => { const r = record.runs.at(-1); if (r?.codex?.turnId && r.codex.turnId !== lastTurn) { lastTurn = r.codex.turnId; console.log('TURN', lastTurn); } }, onEvent: event => { if (event.method === 'item/completed') console.log('ITEM', event.params.item.type); } });
      writeSessionRecord(stateDirectory, record);
      console.log(JSON.stringify({ threadId: record.conversation?.threadId, status: run.codex?.terminal?.status, failure: run.codex?.failure, cleanup: run.codex?.cleanup, observed: run.codex?.observed?.length, interrupted: run.interruptedBy }));
      if (fixtureError) throw fixtureError;
      if (['interrupt','orphan'].includes(mode) && (!controller.signal.aborted || run.interruptedBy !== 'sigint' || run.codex?.terminal?.status !== 'interrupted')) throw new Error('Proof did not exercise an interrupted turn');
      if (['background','orphan'].includes(mode)) {
        if (!orphan) throw new Error('Proof did not capture a live orphan fixture');
        if (!run.codex?.cleanupWarning?.includes('Independently detached programs may keep running')) throw new Error('Missing native-cleanup limitation guidance');
        if (mode === 'background' && (run.codex?.terminal?.status !== 'completed' || !run.codex?.backgroundTerminals?.length)) throw new Error('Proof did not exercise registered background-terminal cleanup');
        const survived = await isProcessLive(orphan.pid, orphan.startTime);
        cleanupResult = { exercised: true, survived, ...orphan, recordedCleanup: run.codex?.cleanup, interruptedBy: run.interruptedBy, terminalStatus: run.codex?.terminal?.status };
        console.log(JSON.stringify({ orphanSurvived: survived, recordedCleanup: run.codex?.cleanup }));
        // Orphan mode characterizes the approved native limitation. It must not claim
        // full containment; the proof driver separately removes the escaped fixture.
        if (survived && mode === 'background') process.exitCode = 1;
      }
      if (run.codex?.failure || run.codex?.cleanup !== 'tracked_processes_stopped') process.exitCode = 1;
    } finally {
      clearInterval(timer); await markerCheck; clearTimeout(abortTimer);
      if (orphan) {
        // Driver cleanup is separate from the runner's acceptance result, including on exceptions.
        if (await isProcessLive(orphan.pid, orphan.startTime)) await endProcessTree(orphan.pid, 'SIGKILL');
        for (let i = 0; i < 20 && await isProcessLive(orphan.pid, orphan.startTime); i++) await delay(50);
        const driverCleanupComplete = !await isProcessLive(orphan.pid, orphan.startTime);
        writeFileSync(join(root, `${mode}-cleanup-result-run-${record.runs.length}.json`), JSON.stringify({ ...cleanupResult, ...orphan, driverCleanupComplete }), { mode: 0o600 });
        if (!driverCleanupComplete) { console.error('Proof driver could not clean its exact fixture process'); process.exitCode = 1; }
      } else if (['background','orphan'].includes(mode)) writeFileSync(join(root, `${mode}-cleanup-result-run-${record.runs.length}.json`), JSON.stringify(cleanupResult), { mode: 0o600 });
    }
  }
}
