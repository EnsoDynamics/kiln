// Real Codex through production Engine/API; isolated Git and local-only PR peer.
// No network push, GitHub write, merge, deployment or change to published method skills.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Engine } from '../../dist/engine/engine.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { readPrdRecord } from '../../dist/state/records.js';
import { defaultSettings, prdTreeAtHead } from '../../dist/engine/worktree-setup.js';
import { originBranches } from '../../dist/engine/git-reads.js';
import { startLocalServer } from '../../dist/server/local-server.js';
import { buildSnapshot } from '../../dist/engine/snapshot.js';
if (process.argv[2]) { await resumeExisting(process.argv[2]); process.exit(0); }
const root = realpathSync(mkdtempSync(join(tmpdir(), 'kiln-codex-workflow-')));
const repository = join(root, 'proof-app'); mkdirSync(repository);
const stateDirectory = join(root, 'state');
const bin = join(root, 'bin'); mkdirSync(bin);
const peerState = join(root, 'local-pr.json'); writeFileSync(peerState, JSON.stringify({ pulls: [] }));
const env = { ...process.env, PATH: bin + delimiter + process.env.PATH, KILN_WORKFLOW_PR_STATE: peerState };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
git(root, 'init', '--bare', join(root, 'proof-app.git'));
git(repository, 'init', '-b', 'develop');
git(repository, 'config', 'user.name', 'Kiln Codex Workflow Proof'); git(repository, 'config', 'user.email', 'kiln-proof@example.invalid');
git(repository, 'remote', 'add', 'origin', join(root, 'proof-app.git'));
const files = JSON.parse(readFileSync(new URL('./codex-workflow-proof-files.json', import.meta.url), 'utf8'));
for (const [path, content] of Object.entries(files)) { const full = join(repository, path); mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true }); writeFileSync(full, content); }
git(repository, 'add', ...Object.keys(files)); git(repository, 'commit', '-m', 'test(proof): seed local Codex workflow'); git(repository, 'push', 'origin', 'develop'); git(root, '--git-dir', join(root, 'proof-app.git'), 'symbolic-ref', 'HEAD', 'refs/heads/develop');
const shim = join(bin, 'gh');
writeFileSync(shim, `#!${process.execPath}\n` + readFileSync(new URL('./codex-workflow-proof-gh.mjs', import.meta.url), 'utf8')); chmodSync(shim, 0o755);
const paths = { mainCheckoutPath: repository, repositoryName: 'proof-app', folderName: 'codex-workflow-proof', prdDirectoryFromRoot: 'docs/prds/codex-workflow-proof', featureName: 'Codex workflow proof' };
const context = { git: 'git', env };
const branches = await originBranches(context, repository);
const settings = defaultSettings(paths, branches.ok ? branches.value : undefined);
const record = newPrdRecord({ ...paths, github: 'local-proof/proof-app', settings });
const tree = await prdTreeAtHead(context, repository, paths.prdDirectoryFromRoot);
let engine;
let stop;
let interruptionExercised = false;
const make = record => new Engine({ paths, record, tools: { git: 'git', gh: shim, claude: '/missing/claude', codex: 'codex' }, env, stateDirectory, prdTree: tree, sleepReader: { next: async () => [] }, onTerminal: event => console.log(JSON.stringify(event)) });
const serverFor = engine => startLocalServer({ engine, port: 41448, folderName: paths.folderName, featureName: paths.featureName, token: engine.record.token });
engine = make(record);
const output = (sessionId, lines) => {
  for (const line of lines) console.log(JSON.stringify({ sessionId, line: line.line, source: line.source, text: line.text.slice(0, 180) }));
  if (!interruptionExercised && lines.some(line => line.source === 'tool' && /(?:node --test|npm (?:run )?test)/.test(line.text))) {
    interruptionExercised = true;
    stop = new Promise(resolve => setTimeout(resolve, 750)).then(() => engine.stop('sigint'));
  }
};
engine.onOutput(output);
await engine.changeSettings({ agentId: 'codex' }); await engine.agents.refresh();
let server = await serverFor(engine);
writeFileSync(join(root, 'workflow-proof.json'), JSON.stringify({ root, repository, stateDirectory, address: server.address, purpose: 'isolated production Codex workflow proof' }), { mode: 0o600 });
console.log('PROOF_ROOT', root); console.log('BROWSER', server.address);
try {
  const start = await engine.start({ refinementConfirmed: true }); if (!start.ok) throw new Error(JSON.stringify(start));
  await engine.settled();
  if (!stop) throw new Error('Real command interruption was not exercised.');
  await stop; await server.close();
  const original = engine.latestSession('1');
  if (!original?.conversation?.threadId || original.runs.at(-1).interruptedBy !== 'sigint' || original.runs.at(-1).codex?.terminal?.status !== 'interrupted' || original.runs.at(-1).codex?.cleanup !== 'tracked_processes_stopped') throw new Error('Missing durable interruption identity');
  const preservedEdit = readFileSync(join(engine.worktreePath, 'greeting.js'), 'utf8');
  writeFileSync(join(root, 'interrupted-snapshot.json'), JSON.stringify(buildSnapshot(engine)), { mode: 0o600 });
  // Next-session settings differ; recovery must retain the original pair.
  const saved = readPrdRecord(stateDirectory); saved.settings.agentChoices.codex.effort = 'low';
  engine = make(saved); engine.onOutput(output); await engine.agents.refresh();
  server = await serverFor(engine);
  const decision = await engine.decide(); console.log('RESTART', JSON.stringify(decision));
  if (decision.kind !== 'resume') throw new Error('Interrupted proof could not resume: ' + JSON.stringify(buildSnapshot(engine).needsYou));
  await engine.continue();
  const resumed = engine.latestSession('1');
  const snapshot = buildSnapshot(engine);
  const result = { root, interruptionExercised, preservedEdit: readFileSync(join(engine.worktreePath, 'greeting.js'), 'utf8') === preservedEdit, sameThread: resumed?.conversation?.threadId === original.conversation.threadId, originalEffort: original.effort, resumedEffort: resumed?.runs.at(-1)?.codex?.requested.effort, state: snapshot.feature.state, phaseAudit: engine.record.phases['1']?.codexAudits, prAudit: engine.record.phases.pr?.codexAudits, pulls: engine.record.pullRequests, snapshot };
  writeFileSync(join(root, 'workflow-result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log('RESULT', JSON.stringify({ root, state: result.state, sameThread: result.sameThread, originalEffort: result.originalEffort, resumedEffort: result.resumedEffort }));
  if (!result.preservedEdit || !result.sameThread || result.resumedEffort !== result.originalEffort || result.state !== 'complete') throw new Error('Integrated workflow not complete: ' + JSON.stringify(snapshot.needsYou));
} finally { engine.close(); await server.close(); }

// Resume a prior owned proof, also useful when the driver stopped after recording a turn.
async function resumeExisting(folder) {
  const root = realpathSync(folder);
  const manifest = JSON.parse(readFileSync(join(root, 'workflow-proof.json'), 'utf8'));
  if (manifest.root !== root || manifest.purpose !== 'isolated production Codex workflow proof') throw new Error('Not an owned workflow proof folder');
  const stateDirectory = manifest.stateDirectory;
  const record = readPrdRecord(stateDirectory);
  const phaseKey = Object.entries(record.phases).find(([, facts]) => !facts.doneAt && facts.sessionIds.length)?.[0];
  if (!phaseKey) throw new Error('No interrupted proof work remains');
  const id = record.phases[phaseKey].sessionIds.at(-1);
  const original = JSON.parse(readFileSync(join(stateDirectory, phaseKey, id, 'session.json'), 'utf8'));
  if (original.runs.at(-1)?.codex?.terminal?.status !== 'interrupted' || original.runs.at(-1)?.codex?.cleanup !== 'tracked_processes_stopped') throw new Error('No qualified real interruption to recover');
  const preservedEdit = readFileSync(join(record.repositories[0].worktreePath, 'greeting.js'), 'utf8');
  record.settings.agentChoices.codex.effort = 'low';
  const env = { ...process.env, PATH: join(root, 'bin') + delimiter + process.env.PATH, KILN_WORKFLOW_PR_STATE: join(root, 'local-pr.json') };
  const paths = { mainCheckoutPath: manifest.repository, repositoryName: 'proof-app', folderName: 'codex-workflow-proof', prdDirectoryFromRoot: record.prdDirectory, featureName: record.featureName };
  const engine = new Engine({ paths, record, tools: { git: 'git', gh: join(root, 'bin', 'gh'), claude: '/missing/claude', codex: 'codex' }, env, stateDirectory, sleepReader: { next: async () => [] }, onTerminal: event => console.log(JSON.stringify(event)) });
  engine.onOutput((sessionId, lines) => { for (const line of lines) console.log(JSON.stringify({ sessionId, line: line.line, source: line.source, text: line.text.slice(0,180) })); });
  const server = await startLocalServer({ engine, port: 41448, folderName: paths.folderName, featureName: paths.featureName, token: record.token });
  try {
    await engine.agents.refresh(); await engine.prepare();
    const decision = await engine.decide(); console.log('RESTART', JSON.stringify(decision));
    let recovery;
    if (decision.kind === 'resume') { recovery = 'automatic'; await engine.continue(); }
    else if (decision.kind === 'needs_you' && buildSnapshot(engine).needsYou?.resumeOffered) {
      recovery = 'explicit';
      const response = await engine.resume({ note: 'Resume the interrupted test and complete the original greeting phase, using its saved context.' });
      if (!response.ok) throw new Error(JSON.stringify(response));
      await engine.settled();
    } else throw new Error('Proof did not require resumption: ' + JSON.stringify(buildSnapshot(engine).needsYou ?? decision));
    const session = engine.latestSession(phaseKey);
    const snapshot = buildSnapshot(engine);
    const result = { root, phaseKey, recovery, interruptionExercised: true, sameThread: session?.conversation?.threadId === original.conversation.threadId, preservedEdit: readFileSync(join(engine.worktreePath,'greeting.js'),'utf8') === preservedEdit, originalEffort: original.effort, resumedEffort: session?.runs.at(-1)?.codex?.requested.effort, state: snapshot.feature.state, snapshot, phaseAudit: record.phases['1'].codexAudits, prAudit: record.phases.pr?.codexAudits, localPrPeer: true };
    writeFileSync(join(root,'workflow-result.json'),JSON.stringify(result,null,2),{mode:0o600});
    console.log('RESULT',JSON.stringify({root,phaseKey,state:result.state,sameThread:result.sameThread,preservedEdit:result.preservedEdit,originalEffort:result.originalEffort,resumedEffort:result.resumedEffort}));
    if (result.state !== 'complete' || !result.sameThread || !result.preservedEdit || result.originalEffort !== result.resumedEffort) throw new Error('Workflow recovery not proved: '+JSON.stringify(snapshot.needsYou));
  } finally { engine.close(); await server.close(); }
}
