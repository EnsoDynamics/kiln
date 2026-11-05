// Restart only a disposable fixture made by bot-control-provider-fixture.mjs.
// node scripts/proof-run/bot-control-controller.mjs <fixture-manifest.json> <XDG_STATE_HOME>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Engine } from '../../dist/engine/engine.js';
import { readPrdRecord } from '../../dist/state/records.js';
import { stateRoot } from '../../dist/state/state-files.js';
import { takeInstanceLock } from '../../dist/state/instance-lock.js';
import { startLocalServer } from '../../dist/server/local-server.js';
const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(fixture.root.includes('/kiln-bot-control-') && fixture.repository === `${fixture.root}/proof`);
process.env.XDG_STATE_HOME = process.argv[3];
const record = readPrdRecord(fixture.stateDirectory); assert.ok(record);
const paths = { mainCheckoutPath: fixture.repository, repositoryName: 'proof', folderName: 'handoff-proof', prdDirectoryFromRoot: record.prdDirectory, featureName: 'Disposable bot proof' };
const lock = await takeInstanceLock(stateRoot(process.env), fixture.stateDirectory, { range: { first: 41960, last: 41979 } }); assert.ok(lock.taken);
const engine = new Engine({ paths, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env: process.env, stateDirectory: fixture.stateDirectory, record, sleepReader: { next: async () => [] }, originRetryMs: 0 });
assert.equal((await engine.prepare()).ok, true);
for (let i = 0; i < 240 && (engine.agents.state.pending || engine.billing.busy); i++) await delay(250);
const server = await startLocalServer({ engine, port: lock.port, folderName: 'handoff-proof', featureName: 'Bot control proof', token: record.token });
console.log(JSON.stringify({ ready: true, agentId: fixture.agentId, port: lock.port }));
const close = async () => { await server.close(); await engine.stop('sigint'); lock.release(); process.exit(0); };
process.on('SIGTERM', close); process.on('SIGINT', close);
await new Promise(() => {});
