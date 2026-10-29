// Authenticated provider proof. Writes only disposable local repositories; no Git delivery.
// Run after npm run build: node scripts/proof-run/codex-launch-profile-proof.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { SCHEMA_VERSION } from '../../dist/state/records.js';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'kiln-codex-launch-proof-')));
const workspace = join(root, 'workspace'); mkdirSync(workspace);
const paths = [join(workspace, 'first'), join(workspace, 'second'), join(root, 'added')];
for (const path of paths) {
  mkdirSync(path);
  execFileSync('git', ['init', '-b', 'kiln-launch-proof'], { cwd: path, stdio: 'pipe' });
}
const record = { schemaVersion: SCHEMA_VERSION, agentId: 'codex', sessionId: randomUUID(), phaseId: 'pr', kind: 'pull_request', createdAt: new Date().toISOString(), model: 'gpt-6.1-sol', modelDisplayName: 'GPT-6.1-Sol', effort: 'high', runs: [], sleeps: [], steps: [] };
const options = { executable: 'codex', cwd: workspace, env: process.env, record, stateDirectory: join(root, 'state') };
const repositories = paths.map(path => ({ path, branch: 'kiln-launch-proof' }));
const results = [];
console.log('Proof directory:', root);
for (const [index, cause] of ['launch', 'person_resume'].entries()) {
  const assigned = index === 0 ? paths.slice(0, 2) : paths;
  const content = index === 0 ? 'KILN_CODEX_LAUNCH_OK' : 'KILN_CODEX_RESUME_OK';
  const run = await runCodexSession({ ...options, cause, writableRoots: index === 0 ? [workspace] : [workspace, paths[2]], repositories: repositories.slice(0, assigned.length), prompt: `This is a disposable local provider integration test, not a pull-request task. Use a shell or file tool to write ${JSON.stringify(content + '\n')} to a file named launch-proof.txt in each of these assigned directories: ${assigned.map(path => JSON.stringify(path)).join(', ')}. Read the files back and reply with ${content}. Do not commit, push, open pull requests, deploy, or change any other files.`, onEvent: event => { if (event.method === 'item/completed') console.log('Completed item:', event.params.item.type); } });
  for (const path of assigned) if (readFileSync(join(path, 'launch-proof.txt'), 'utf8') !== content + '\n') throw new Error(`Wrong proof content in ${path}`);
  if (run.codex?.failure || run.codex?.terminal?.status !== 'completed' || run.codex?.cleanup !== 'tracked_processes_stopped' || !run.codex.turnId || run.codex.observed?.at(-1)?.model !== record.model) throw new Error(run.codex?.failure ?? 'Incomplete provider execution proof');
  results.push({ cause, threadId: record.conversation.threadId, turnId: run.codex.turnId, terminal: run.codex.terminal.status, cleanup: run.codex.cleanup, observed: run.codex.observed, filesChecked: assigned.length });
  writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(results.at(-1)));
}
if (new Set(results.map(result => result.threadId)).size !== 1) throw new Error('Resume changed the conversation');
console.log('PASS: real launch, file tools across repositories, same-conversation resume and added writable root.');
