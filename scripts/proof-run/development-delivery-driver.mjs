// Disposable-project client used by real provider proofs, not part of Kiln's runtime.
// It invokes the installed CLI, retains opaque operation IDs, and never manufactures evidence.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [action] = process.argv.slice(2);
const folder = join(process.cwd(), '.kiln-proof'); mkdirSync(folder, { recursive: true });
const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'));
const path = join(folder, 'driver-state.json'); const saved = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
function cli(args) { return JSON.parse(execFileSync(manifest.cli.executable, [manifest.cli.script, 'delivery', ...args], { encoding: 'utf8', timeout: 130000 })); }
const status = cli(['status']);
function mutate(command, payload) { const file = join(folder, 'request.json'); writeFileSync(file, JSON.stringify({ executionId: status.executionId, revision: status.revision, ...payload })); return cli([command, file]); }
let result;
if (action === 'assess') result = mutate('assess', { phaseId: '1', documentsDigest: status.documentsDigest, required: true, criteria: ['AC-PROOF-01'], reason: 'The acceptance criterion needs the immutable development artifact deployed and verified.', checkpoints: [manifest.checkpoint] });
else if (action.startsWith('prepare-')) {
  const kind = action.slice(8); result = mutate('prepare', { checkpointId: manifest.checkpoint.id, operation: { kind } });
  saved[kind] = result.result; writeFileSync(path, JSON.stringify(saved));
} else if (action.startsWith('record-')) {
  const kind = action.slice(7); const operation = saved[kind];
  if (!operation) throw new Error(`No retained ${kind} operation`);
  if (operation.disposition === 'already_observed') result = status;
  else {
    const references = [];
    if (kind === 'verify') {
      const checkpoint = status.checkpoints.find(one => one.id === manifest.checkpoint.id);
      const invocation = `node development-probe.mjs ${checkpoint.merge.resultSha} ${checkpoint.target.environment}`;
      const call = status.availableCommandEvidence.filter(one => one.command === invocation && one.resultAt).at(-1);
      if (!call) throw new Error(`No authoritative probe result: ${status.commandEvidenceError ?? invocation}`);
      references.push({ requirementId: 'verify-artifact', kind: 'command', id: call.id, sessionId: call.sessionId });
    }
    result = mutate('evidence', { checkpointId: manifest.checkpoint.id, operationId: operation.operationId, references });
  }
} else if (action === 'status') result = status;
else throw new Error('assess | prepare/record-merge/deploy/verify/synchronize | status');
console.log(JSON.stringify({ revision: result.revision, result: result.result, checkpoints: result.checkpoints?.map(one => ({ id: one.id, merge: one.merge, operations: one.operations, evidence: one.evidence.map(fact => ({ requirementId: fact.requirementId, status: fact.status, revision: fact.revision })), unresolvedReason: one.unresolvedReason })), commandEvidenceError: result.commandEvidenceError }, null, 2));
