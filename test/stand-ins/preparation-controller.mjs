// Intentional controller-death proof. Targets, commands and origins are disposable.
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Engine } from '../../dist/engine/engine.js';
const { boundary, marker, release, options } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let stopped = false;
const stop = () => { if (stopped) return; stopped = true; writeFileSync(marker, boundary); process.kill(process.pid, 'SIGSTOP'); };
const save = Engine.prototype.save;
Engine.prototype.save = function () {
  const result = save.call(this); const state = this.record.preparation; const attempt = state?.attempts.at(-1);
  if (boundary === 'preparation-session' && state?.stage === 'preparation' && this.latestSession(state.phaseId)?.runs.length === 0
    || boundary === 'verification-intent' && attempt?.outcome === 'running' && !attempt.pid
    || boundary === 'verification-process' && attempt?.outcome === 'running' && attempt.processStartTime
    || boundary === 'verified-checkpoint' && state?.verifiedCheckpoint && state.stage === 'verification'
    || boundary === 'implementation-intent' && state?.stage === 'implementation' && !this.latestSession(state.phaseId)?.runs[state.implementationRun]) stop();
  return result;
};
const engine = new Engine({ ...options, env: process.env, sleepReader: { next: async () => [] } });
await engine.agents.refresh();
const check = await engine.checkCompletedPlan(); if (check.status !== 'available') throw Error(JSON.stringify(check));
const body = { proposalId: check.result.proposal.id, executionId: engine.record.executionId, commandId: `preparation-crash-${boundary}`, statusToken: engine.controlView().token };
const answer = await engine.continuationCommand('accept', body); if (!answer.ok) throw Error(JSON.stringify(answer));
while (!engine.latestSession('9')?.runs.at(-1)?.pid) await delay(20);
const state = engine.record.preparation;
for (const binding of state.bindings) {
  const cwd = engine.record.repositories.find(repo => repo.name === binding.repository).worktreePath;
  execFileSync('git', ['merge', '--no-edit', binding.sourceRevision], { cwd, env: process.env });
  const submitted = await engine.submitPreparation({ executionId: engine.record.executionId, phaseId: '9', bindingId: binding.id, references: [{ kind: 'git_revision', repository: binding.repository, commit: binding.sourceRevision }] });
  if (!submitted.ok) throw Error(JSON.stringify(submitted));
}
writeFileSync(release, 'settle preparation'); await engine.settled();
setInterval(() => {}, 1000);
