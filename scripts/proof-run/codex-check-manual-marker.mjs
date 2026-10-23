// Inspect the specific recorded negative patch using Kiln's existing checkout policy.
// This is one witness, not complete Codex evidence. Run npm run build first.
// node scripts/proof-run/codex-check-manual-marker.mjs <proof folder>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { outsideChanges } from '../../dist/session/outside-workspace.js';

const root = resolve(process.argv[2]);
const report = JSON.parse(readFileSync(join(root, 'evidence-report.json'), 'utf8'));
const matches = report.threads[0].calls.filter(call => call.operations.some(operation => operation.name === 'apply_patch' && typeof operation.input === 'string' && operation.input.includes('manual-audit-marker.txt')));
if (matches.length !== 1) throw new Error('Expected exactly one recorded manual marker patch');
const call = matches[0];
if (call.coverage !== 'complete') throw new Error('Manual patch wrapper is not fully decoded');
const patch = call.operations.find(operation => operation.name === 'apply_patch').input;
const destination = /^\*\*\* Add File: (.+)$/m.exec(patch)?.[1];
if (!destination || destination !== join(root, 'outside-sentinel/manual-audit-marker.txt')) throw new Error('Unexpected negative patch destination');
const findings = outsideChanges({ calls: [{ name: 'Write', input: { file_path: destination }, at: call.at, cwd: join(root, 'workspace/kiln-proof-api') }] }, [join(root, 'workspace/kiln-proof-api'), join(root, 'workspace/kiln-proof-shared')]);
if (findings.length !== 1 || findings[0].repository !== 'outside-sentinel') throw new Error('Negative marker escaped policy detection');
const result = { callId: call.callId, findings };
writeFileSync(join(root, 'manual-negative-finding.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(result));
