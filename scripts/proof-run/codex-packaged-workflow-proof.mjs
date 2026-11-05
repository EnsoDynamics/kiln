// Real installed-entry-point proof for Phase 5 of Codex support for Kiln.
// `seed` creates only a local disposable repository and temporary package installation.
// Publish that fixture only with the operator's separate GitHub write authorization.
// `run` then starts real Codex inference and actual GitHub delivery through installed Kiln.
// It never imports the source Engine, substitutes gh, merges or deploys.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { fetch, AbortSignal } = globalThis;

const source = fileURLToPath(new URL('../../', import.meta.url));
const folderName = 'codex-packaged-workflow';
const purpose = 'installed Kiln two-phase actual-GitHub Codex proof';
const [mode, argument] = process.argv.slice(2);
const command = (program, args, cwd) => execFileSync(program, args, { cwd, encoding: 'utf8', timeout: 240_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const save = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });

if (mode === 'seed') {
  if (!/^EnsoDynamics\/kiln-proof-codex-[a-z0-9-]+$/.test(argument ?? '')) throw new Error('Use a new disposable EnsoDynamics/kiln-proof-codex-<name> repository.');
  const github = argument;
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kiln-codex-package-')));
  chmodSync(root, 0o700);
  const repository = join(root, github.split('/')[1]);
  mkdirSync(repository);
  command('git', ['init', '-b', 'main'], repository);
  command('git', ['config', 'user.name', 'Kiln Codex Package Proof'], repository);
  command('git', ['config', 'user.email', 'kiln-proof@example.invalid'], repository);
  command('git', ['remote', 'add', 'origin', `https://github.com/${github}.git`], repository);
  const files = JSON.parse(readFileSync(new URL('./codex-packaged-workflow-files.json', import.meta.url), 'utf8'));
  for (const [path, body] of Object.entries(files)) {
    const target = join(repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  command('git', ['add', ...Object.keys(files)], repository);
  command('git', ['commit', '-m', 'test(proof): seed two-phase installed Codex workflow'], repository);
  const pack = JSON.parse(command('npm', ['pack', '--json', '--pack-destination', root], source))[0];
  const prefix = join(root, 'prefix');
  command('npm', ['install', '--global', '--prefix', prefix, '--no-audit', '--no-fund', join(root, pack.filename)], root);
  const installed = join(prefix, 'lib/node_modules/@ensodynamics/kiln');
  const kiln = join(prefix, 'bin/kiln');
  assert.match(command(kiln, ['--help'], root), /^Usage: kiln run /);
  const manifest = { purpose, root, repository, github, prefix, installed, kiln, seededCommit: command('git', ['rev-parse', 'HEAD'], repository), sourceCommit: command('git', ['rev-parse', 'HEAD'], source), createdAt: new Date().toISOString() };
  save(join(root, 'packaged-proof.json'), manifest);
  console.log(JSON.stringify(manifest));
} else if (mode === 'run') {
  if (process.platform !== 'darwin') throw new Error('This proof is scoped to the available Mac.');
  const root = realpathSync(argument);
  const manifest = JSON.parse(readFileSync(join(root, 'packaged-proof.json'), 'utf8'));
  assert.equal(manifest.root, root); assert.equal(manifest.purpose, purpose);
  assert.equal(command('git', ['remote', 'get-url', 'origin'], manifest.repository), `https://github.com/${manifest.github}.git`);
  assert.equal(command('git', ['ls-remote', 'origin', 'refs/heads/main'], manifest.repository).split(/\s/)[0], manifest.seededCommit, 'Publish only the fixture seed to its new GitHub repository before running.');
  const env = { ...process.env, PATH: join(manifest.prefix, 'bin') + delimiter + process.env.PATH, XDG_STATE_HOME: join(root, 'state'), KILN_NO_BROWSER: '1', KILN_PORT_RANGE: '41470-41479' };
  const log = [];
  let output = '', exited = false;
  const child = spawn(manifest.kiln, ['run', `docs/prds/${folderName}`], { cwd: manifest.repository, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = new Promise(resolve => child.once('close', code => { exited = true; resolve(code); }));
  child.on('error', error => { output += String(error); });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    output += chunk.toString();
    writeFileSync(join(root, 'kiln-terminal.log'), output, { mode: 0o600 });
  });
  const deadline = Date.now() + 30 * 60_000;
  const pause = () => new Promise(resolve => setTimeout(resolve, 1000));
  const alive = () => { if (exited || Date.now() >= deadline) throw new Error('Installed proof stopped or exceeded its deadline; inspect owner-only kiln-terminal.log.'); };
  let latest, workFailure, stopFailure;
  try {
    while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) { alive(); await pause(); }
    const address = /http:\/\/127\.0\.0\.1:\d+/.exec(output)[0] + '/' + folderName;
    const origin = new URL(address).origin;
    const page = await (await fetch(address, { signal: AbortSignal.timeout(30_000) })).text();
    const token = /<meta name="kiln-token" content="([^"]+)"/.exec(page)?.[1];
    assert.ok(token, 'Installed page must supply its normal local API token.');
    save(join(root, 'local-view.json'), { address });
    console.log('BROWSER', address);
    const api = async (path, body) => {
      const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Kiln-Token': token, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(40_000) });
      const value = await response.json();
      assert.equal(response.ok, true, JSON.stringify(value));
      return value;
    };
    latest = await api('/api/snapshot');
    const starting = !latest.feature.startedAt;
    if (starting) await api('/api/settings', { agentId: 'codex' });
    await api('/api/metadata/refresh', {});
    latest = await api('/api/snapshot');
    assert.equal(latest.settings.agentId, 'codex');
    assert.equal(latest.settings.effort, 'high');
    assert.match(latest.settings.model.value, /^gpt-\d+(?:\.\d+)*-sol$/);
    assert.deepEqual(latest.settings.readinessErrors ?? [], []);
    if (starting) {
      save(join(root, 'documents-found.json'), latest);
      await api('/api/start', { refinementConfirmed: true });
    }
    let prior;
    while (true) {
      alive();
      latest = await api('/api/snapshot');
      save(join(root, 'latest-snapshot.json'), latest);
      const status = { at: new Date().toISOString(), state: latest.feature.state, phase: latest.feature.currentPhaseId, done: latest.feature.phasesDone };
      const key = JSON.stringify([status.state, status.phase, status.done]);
      if (key !== prior) { log.push(status); save(join(root, 'transitions.json'), log); console.log(JSON.stringify(status)); prior = key; }
      if (latest.feature.state === 'complete') break;
      if (latest.feature.state === 'needs_you' || latest.needsYou) throw new Error('Proof needs attention: ' + JSON.stringify({ phase: latest.needsYou?.phaseId, kind: latest.needsYou?.kind, checks: latest.needsYou?.checks }));
      await pause();
    }
    assert.equal(latest.feature.phasesDone, 2); assert.equal(latest.feature.phasesTotal, 2);
    const { stateRoot, prdStateDirectory } = await import(pathToFileURL(join(manifest.installed, 'dist/state/state-files.js')));
    const { readPrdRecord, readSessionRecord } = await import(pathToFileURL(join(manifest.installed, 'dist/state/records.js')));
    const stateDirectory = prdStateDirectory(stateRoot(env), manifest.repository, manifest.github.split('/')[1], `docs/prds/${folderName}`);
    const record = readPrdRecord(stateDirectory);
    const sessions = ['1', '2', 'pr'].map(key => {
      const facts = record.phases[key];
      assert.equal(facts.sessionIds.length, 1, `Phase ${key} must have its own fresh conversation.`);
      const session = readSessionRecord(stateDirectory, key, facts.sessionIds[0]);
      assert.equal(session.agentId, 'codex');
      assert.equal(session.kind, key === 'pr' ? 'pull_request' : 'phase');
      assert.ok(session.conversation?.threadId);
      assert.equal(session.model, latest.settings.model.value);
      assert.equal(session.effort, 'high');
      const attempt = session.runs.at(-1);
      for (const pair of [attempt.codex.requested, attempt.codex.effective, ...attempt.codex.observed]) {
        assert.equal(pair.model, session.model); assert.equal(pair.effort, session.effort);
      }
      assert.ok(attempt.codex.observed.length > 0);
      assert.equal(attempt.codex.terminal.status, 'completed');
      assert.equal(attempt.codex.cleanup, 'tracked_processes_stopped');
      const audit = facts.codexAudits[session.sessionId];
      assert.equal(audit.coverage, 'complete');
      assert.deepEqual(audit.problems, []); assert.deepEqual(audit.findings, []);
      assert.ok(audit.operationsChecked > 0);
      return { key, session, doneAt: facts.doneAt, repositories: facts.repositories, audit };
    });
    assert.equal(new Set(sessions.map(item => item.session.conversation.threadId)).size, 3);
    for (const { session } of sessions) {
      const output = await api(`/api/sessions/${session.sessionId}/output?limit=1000`);
      assert.ok(output.total > 0 && output.lines.some(line => line.source === 'codex' && Number.isFinite(Date.parse(line.at))), 'Each stopped conversation must retain timestamped Codex output through the installed API.');
    }
    for (let index = 1; index < sessions.length; index++) {
      assert.ok(Date.parse(sessions[index - 1].doneAt) <= Date.parse(sessions[index].session.runs[0].startedAt), 'Each conversation must start after the preceding phase passed.');
    }
    const pushes = sessions.slice(0, 2).map(item => item.repositories[manifest.github.split('/')[1]].pushedSha);
    assert.ok(pushes.every(Boolean)); assert.notEqual(pushes[0], pushes[1]);
    const worktree = latest.settings.worktreePath;
    command('git', ['merge-base', '--is-ancestor', pushes[0], pushes[1]], worktree);
    const firstTree = command('git', ['ls-tree', '-r', '--name-only', pushes[0]], worktree).split('\n');
    const secondTree = command('git', ['ls-tree', '-r', '--name-only', pushes[1]], worktree).split('\n');
    for (const file of ['greeting.js', 'greeting.test.js']) assert.ok(firstTree.includes(file), `Phase 1 must deliver ${file}.`);
    for (const file of ['loud-greeting.js', 'loud-greeting.test.js']) assert.equal(firstTree.includes(file), false, `Phase 1 must not deliver ${file} early.`);
    for (const file of ['greeting.js', 'greeting.test.js', 'loud-greeting.js', 'loud-greeting.test.js']) assert.ok(secondTree.includes(file), `Phase 2 must deliver ${file}.`);
    const firstCode = mkdtempSync(join(root, 'phase-one-acceptance-'));
    writeFileSync(join(firstCode, 'package.json'), '{"type":"module"}');
    writeFileSync(join(firstCode, 'greeting.js'), command('git', ['show', `${pushes[0]}:greeting.js`], worktree));
    // Independent expected values belong to the driver, not model-authored tests.
    const cases = [['Doug', 'Hello, Doug!', 'HELLO, DOUG!'], ['', 'Hello, !', 'HELLO, !'], ['Zoë 😀', 'Hello, Zoë 😀!', 'HELLO, ZOË 😀!'], ['Hi?!', 'Hello, Hi?!!', 'HELLO, HI?!!']];
    const proveBehavior = (directory, loud) => {
      const script = `import assert from 'node:assert/strict'; import {greeting} from ${JSON.stringify(pathToFileURL(join(directory, 'greeting.js')).href)}; ${loud ? `import {loudGreeting} from ${JSON.stringify(pathToFileURL(join(directory, 'loud-greeting.js')).href)};` : ''} for(const [name,plain,upper] of ${JSON.stringify(cases)}) {assert.equal(greeting(name),plain); ${loud ? 'assert.equal(loudGreeting(name),upper);' : ''}} console.log('DRIVER_ACCEPTANCE_PASS');`;
      assert.equal(command(process.execPath, ['--input-type=module', '--eval', script], directory), 'DRIVER_ACCEPTANCE_PASS');
    };
    proveBehavior(firstCode, false);
    proveBehavior(worktree, true);
    command('npm', ['test'], worktree);
    assert.equal(command('git', ['status', '--porcelain'], worktree), '');
    const head = command('git', ['rev-parse', 'HEAD'], worktree);
    const remoteHead = command('git', ['ls-remote', 'origin', `refs/heads/${latest.settings.featureBranch}`], worktree).split(/\s/)[0];
    assert.equal(head, remoteHead);
    assert.equal(head, pushes[1]);
    const pulls = JSON.parse(command('gh', ['pr', 'list', '--repo', manifest.github, '--head', latest.settings.featureBranch, '--base', 'main', '--state', 'open', '--json', 'number,url,isDraft,headRefOid,mergeable'], worktree));
    assert.equal(pulls.length, 1); assert.equal(pulls[0].isDraft, false); assert.equal(pulls[0].headRefOid, head);
    assert.notEqual(pulls[0].mergeable, 'CONFLICTING');
    assert.equal(command('git', ['ls-remote', 'origin', 'refs/heads/main'], worktree).split(/\s/)[0], manifest.seededCommit, 'The proof must never change main.');
    save(join(root, 'packaged-workflow-result.json'), { recordedAt: new Date().toISOString(), installedEntryPoint: manifest.kiln, sourceCommit: manifest.sourceCommit, head, pulls, sessions, snapshot: latest, transitions: log });
    console.log('RESULT', JSON.stringify({ root, state: latest.feature.state, phases: latest.feature.phasesDone, head, pulls }));
  } catch (error) {
    workFailure = error;
  } finally {
    // The normal installed CLI stop path owns stopping Codex and its tracked commands.
    if (!exited) child.kill('SIGINT');
    const stopped = await Promise.race([exit.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 30_000).unref())]);
    if (!stopped) {
      stopFailure = new Error('Installed Kiln did not finish its native stop; inspect the retained proof before resuming.');
      save(join(root, 'stop-failure.json'), { at: new Date().toISOString(), problem: stopFailure.message });
    }
  }
  if (workFailure || stopFailure) throw new AggregateError([workFailure, stopFailure].filter(Boolean), 'Packaged workflow proof failed; retained evidence describes the separate work and stop outcomes.');
} else {
  throw new Error('Usage: node scripts/proof-run/codex-packaged-workflow-proof.mjs seed EnsoDynamics/kiln-proof-codex-<name> | run <owned-folder>');
}
