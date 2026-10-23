// Real usage proof, only under natural/approved exhaustion. Never spends down allowance.
// seed | inspect <folder> | refuse <folder> | recover <folder> | suppression <folder>
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestSol, readCodexMetadata } from '../../dist/agents/codex-metadata.js';
import { runCodexSession } from '../../dist/session/codex-session.js';
import { codexUsageRelease } from '../../dist/session/codex-usage.js';
import { auditCodexConversation } from '../../dist/session/codex-evidence.js';
import { readSessionRecord, writeSessionRecord } from '../../dist/state/records.js';

const [mode, folder] = process.argv.slice(2);
if (!['seed', 'inspect', 'refuse', 'recover', 'suppression'].includes(mode) || mode !== 'seed' && !folder) throw new Error('seed | inspect/refuse/recover/suppression <owned-folder>');
const root = realpathSync(mode === 'seed' ? mkdtempSync(join(tmpdir(), 'kiln-codex-usage-')) : folder);
const manifestPath = join(root, 'usage-proof.json');
const cwd = join(root, 'assigned');
const stateDirectory = join(root, 'state');
if (mode === 'seed') {
  mkdirSync(cwd);
  execFileSync('git', ['init', '-b', 'kiln-usage-proof'], { cwd, stdio: 'pipe' });
  writeFileSync(join(cwd, 'AGENTS.md'), '# Disposable Kiln usage proof\nReply to the supplied proof message only. Do not edit files, commit, push, merge, deploy or modify method skills. No account purchases or reset redemption.\n');
  writeFileSync(join(cwd, 'CLAUDE.md'), '# Usage proof\nFollow AGENTS.md.\n');
  writeFileSync(manifestPath, JSON.stringify({ purpose: 'Kiln natural Codex usage proof', root, observations: [] }), { mode: 0o600 });
  console.log(root);
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.root !== root || manifest.purpose !== 'Kiln natural Codex usage proof') throw new Error('Not an owned usage proof folder');
  const metadata = await readCodexMetadata({ executable: 'codex', cwd, cwds: [cwd], env: process.env });
  if (metadata.blockers.length) throw new Error(metadata.blockers.join('\n'));
  const usage = metadata.account.codexUsage;
  const observation = { at: new Date().toISOString(), mode, permission: usage?.state ?? 'unknown', administrative: usage?.administrative ?? false, stableIdentity: !!metadata.account.accountId, windows: metadata.account.limits.length, modelTurnStarted: false };
  const recordObservation = () => { manifest.observations.push(observation); writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 }); console.log(JSON.stringify(observation)); };
  if (mode === 'inspect') { recordObservation(); }
  else {
    const saved = readSessionRecord(stateDirectory, 'pr', 'usage-proof');
    const model = latestSol(metadata.models ?? []);
    const record = saved ?? { schemaVersion: 4, agentId: 'codex', sessionId: 'usage-proof', phaseId: 'pr', kind: 'pull_request', createdAt: new Date().toISOString(), model, modelDisplayName: model, effort: 'high', runs: [], sleeps: [], steps: [] };
    if (!record.model) throw new Error('No unique latest GPT Sol/High choice');
    if (mode === 'refuse') {
      if (saved?.runs.length) throw new Error('A refusal proof already exists; use recover on the same conversation');
      if (usage?.state !== 'blocked' || usage.administrative) {
        recordObservation(); throw new Error('Natural ordinary-usage exhaustion is unavailable. No model turn started; leave gate 3 open.');
      }
    } else {
      const refusal = record.runs.at(-1)?.limitRefusal;
      if (!saved || !refusal?.codex || !record.conversation?.threadId) throw new Error('First capture a real structured refusal in this proof folder');
      // Fresh audit and cleanup evidence precede every recovery attempt.
      if (record.runs.at(-1)?.codex?.cleanup !== 'tracked_processes_stopped') throw new Error('Reconcile tracked process cleanup first');
      const audit = await auditCodexConversation({ executable: 'codex', cwd, codexHome: record.conversation.codexHome, threadId: record.conversation.threadId, knownThreadIds: record.conversation.knownThreadIds, worktrees: [cwd], env: process.env });
      if (audit.coverage !== 'complete' || !audit.passed) throw new Error('Complete passing workspace evidence is required before a usage attempt');
      const release = codexUsageRelease(record, refusal, metadata.account);
      writeSessionRecord(stateDirectory, record);
      observation.suppressed = release.suppressed ?? false;
      if (mode === 'suppression') {
        recordObservation();
        if (!release.suppressed || !record.codex?.usageRecovery?.consumed) throw new Error('No real repeated refusal with persisted suppression was exercised');
        process.exit(0);
      }
      if (release.state !== 'allowed') { recordObservation(); throw new Error(release.reason); }
    }
    const run = await runCodexSession({ executable: 'codex', cwd, writableRoots: [cwd], repositories: [{ path: cwd, branch: 'kiln-usage-proof' }], env: process.env, record, stateDirectory, cause: mode === 'refuse' ? 'launch' : 'limit_resume', prompt: 'Reply with KILN_USAGE_RECOVERY_OK only. Do not use tools or change files.', onWarning: text => console.warn(text) });
    Object.assign(observation, { modelTurnStarted: !!run.codex?.dispatch, threadId: record.conversation?.threadId, turnId: run.codex?.turnId, status: run.codex?.terminal?.status, structuredRefusal: !!run.limitRefusal?.codex, changedAccount: record.codex?.originalAccount.accountId !== run.codex?.account.accountId, model: record.model, effort: record.effort, cleanup: run.codex?.cleanup });
    recordObservation();
    if (run.codex?.failure || run.codex?.cleanup !== 'tracked_processes_stopped') throw new Error(run.codex?.failure ?? 'Tracked cleanup failed');
    if (mode === 'refuse' && !run.limitRefusal?.codex) throw new Error('No actual structured exhausted-allowance refusal; gate 3 remains open');
  }
}
