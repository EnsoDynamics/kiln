// Disposable recovery client; outcomes come only from the running Kiln and provider history.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const folder = join(process.cwd(), '.kiln-proof');
const manifest = JSON.parse(readFileSync(join(folder, 'activation-manifest.json'), 'utf8'));
const path = join(folder, 'activation-driver-state.json');
const saved = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
const [action] = process.argv.slice(2);
const cli = args => JSON.parse(execFileSync(manifest.cli.executable, [manifest.cli.script, 'delivery', ...args], { encoding: 'utf8', timeout: 130000 }));
const status = cli(['status']);
function request(command, body, expectRefusal = false) {
  const file = join(folder, 'request.json'); writeFileSync(file, JSON.stringify({ executionId: status.executionId, revision: status.revision, ...body }));
  if (!expectRefusal) return cli([command, file]);
  const result = spawnSync(manifest.cli.executable, [manifest.cli.script, 'delivery', command, file], { encoding: 'utf8', timeout: 130000 }); assert.notEqual(result.status, 0);
  return result.stderr || result.stdout;
}
let result;
if (action === 'future') { saved.futureRefusal = request('assess', { phaseId: '3', documentsDigest: '0'.repeat(64), required: false, criteria: [], reason: 'This attempt must be refused.', checkpoints: [] }, true); result = saved.futureRefusal; }
else if (action === 'assess-1' || action === 'assess-2') {
  const phaseId = action.slice(-1); const phase = status.activationRecovery.find(one => one.phaseId === phaseId);
  result = request('assess', { phaseId, documentsDigest: phase.documentsDigest, required: phaseId === '1', criteria: phaseId === '1' ? ['AC-PROOF-01'] : [], reason: phaseId === '1' ? 'Recover verification of the confirmed historical delivery; do not merge or deploy again.' : 'Recovery bookkeeping requires no additional development deployment.', checkpoints: [] });
} else if (action === 'prepare-verify') { result = request('prepare', { checkpointId: manifest.checkpointId, operation: { kind: 'verify' } }); saved.verify = result.result; }
else if (action === 'record-verify') {
  const cp = status.checkpoints.find(one => one.id === manifest.checkpointId);
  const invocation = `node development-probe.mjs ${cp.merge.resultSha} ${cp.target.environment}`;
  const call = status.availableCommandEvidence.filter(one => one.command === invocation && one.resultAt).at(-1); assert.ok(call, `No authoritative result for ${invocation}: ${status.commandEvidenceError}`);
  result = request('evidence', { checkpointId: cp.id, operationId: saved.verify.operationId, references: [{ requirementId: 'verify-artifact', kind: 'command', id: call.id, sessionId: call.sessionId }] });
} else if (action === 'status') result = status;
else throw new Error('future | assess-1 | prepare-verify | record-verify | assess-2 | status');
writeFileSync(path, JSON.stringify(saved));
console.log(JSON.stringify(typeof result === 'string' ? result : { revision: result.revision, activationRecovery: result.activationRecovery, result: result.result, commandEvidenceError: result.commandEvidenceError, checkpoints: result.checkpoints?.map(one => ({ id: one.id, merge: one.merge, unresolvedReason: one.unresolvedReason, evidence: one.evidence.map(fact => ({ requirementId: fact.requirementId, status: fact.status })) })) }, null, 2));
