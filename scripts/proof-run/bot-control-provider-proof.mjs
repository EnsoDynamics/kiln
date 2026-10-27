// Actual provider delivery proof against disposable controllers; no production state.
// node scripts/proof-run/bot-control-provider-proof.mjs <fixture-manifest.json> <XDG_STATE_HOME>
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.ok(fixture.root.includes('/kiln-bot-control-') && fixture.repository === `${fixture.root}/proof`);
const env = { ...process.env, XDG_STATE_HOME: process.argv[3] };
const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const call = args => JSON.parse(execFileSync(process.execPath, [cli, ...args, '--json'], { cwd: '/private/tmp', env, encoding: 'utf8', timeout: 45000 }));
const status = () => call(['status', fixture.prd, '--detail', 'full']);
const savedSession = () => JSON.parse(readFileSync(join(fixture.stateDirectory, '1', fixture.sessionId, 'session.json'), 'utf8'));
async function settle(id) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const receipt = call(['command-status', fixture.prd, '--command-id', id]);
    const latest = savedSession().runs.at(-1);
    if (receipt.operation.state === 'completed' && latest.endedAt && status().state === 'needs_you') return receipt;
    assert.ok(!['failed','refused','indeterminate'].includes(receipt.operation.state), JSON.stringify(receipt));
    await delay(500);
  }
  throw new Error('Provider proof did not settle within three minutes');
}
const initial = status(); const count = savedSession().runs.length;
const resumeId = randomUUID();
call(['resume', fixture.prd, '--only-if-status-matches', initial.status_token, '--command-id', resumeId]);
await settle(resumeId);
assert.equal(savedSession().runs.length, count + 1);
assert.equal(savedSession().runs.at(-1).note, undefined);
assert.ok(savedSession().runs.at(-1).result.text.includes(fixture.terminalMarker));
const beforeReply = status(); const replyId = randomUUID();
const reply = `Provider proof ${replyId}: literal "quotes", 🐦 and $(echo literal).\nRepeat this proof ID and the terminal decision marker, then stop. Do not use tools.`;
const messageFile = join(fixture.root, 'literal reply.txt'); writeFileSync(messageFile, reply);
const replyArgs = ['reply', fixture.prd, '--only-if-status-matches', beforeReply.status_token, '--command-id', replyId, '--message-file', messageFile];
call(replyArgs); const delivered = await settle(replyId);
assert.equal(savedSession().runs.length, count + 2); assert.equal(savedSession().runs.at(-1).note, reply);
assert.ok(savedSession().runs.at(-1).result.text.includes(replyId));
assert.ok(savedSession().runs.at(-1).result.text.includes(fixture.terminalMarker));
assert.equal(delivered.operation.effects.reply, 'delivered', JSON.stringify(delivered));
const replay = call(replyArgs); assert.equal(replay.operation.id, delivered.operation.id); assert.equal(savedSession().runs.length, count + 2);
const result = { agent: fixture.agentId, root: fixture.root, sessionId: fixture.sessionId, providerId: savedSession().conversation?.threadId ?? fixture.sessionId, terminalHistoryPreserved: true, noMessageResume: true, literalReplyPreserved: true, deliveredFromProviderHistory: true, replayDidNotDispatch: true, resumeId, replyId };
writeFileSync(join(fixture.root, 'provider-control-proof-result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
