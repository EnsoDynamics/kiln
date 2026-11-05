// A real disposable development-artifact verification command. It downloads and checks the deployed bytes.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const [revision, environment] = process.argv.slice(2);
assert.match(revision ?? '', /^[0-9a-f]{40}$/); assert.equal(environment, 'kiln-disposable-development');
const repository = 'EnsoDynamics/kiln-proof-development-delivery-20261024';
const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--repo', repository, '--commit', revision, '--workflow', 'development-proof.yml', '--json', 'databaseId,status,conclusion'], { encoding: 'utf8', timeout: 30000 }));
assert.equal(runs.length, 1); assert.equal(runs[0].status, 'completed'); assert.equal(runs[0].conclusion, 'success');
const folder = mkdtempSync(join(tmpdir(), 'kiln-development-artifact-'));
try {
  execFileSync('gh', ['run', 'download', String(runs[0].databaseId), '--repo', repository, '--name', `development-${revision}`, '--dir', folder], { timeout: 30000 });
  const deployed = JSON.parse(readFileSync(join(folder, 'delivery.json'), 'utf8'));
  assert.equal(deployed.revision, revision); assert.equal(deployed.environment, environment);
  assert.equal(typeof deployed.value, 'string'); assert.ok(deployed.value.length > 0);
  console.log(JSON.stringify({ revision: deployed.revision, environment: deployed.environment, artifactContentsChecked: true }));
} finally { rmSync(folder, { recursive: true }); }
