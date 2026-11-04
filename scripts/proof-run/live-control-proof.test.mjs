// Authenticated provider tier: synthetic conversations and disposable local Git only.
// Offline contract, hook, process, HTTP and browser tests remain in npm run verify.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repository = fileURLToPath(new URL('../../', import.meta.url));
import { claudeProofVersion } from './live-proof-fixtures.mjs';
assert.equal(process.platform, 'darwin', 'Live controls are qualified on macOS only.');
// Any Claude Code at or above the minimum (AC-AGENT-01), KILN_LIVE_PROOF_CLAUDE when set; each
// proof records the version it ran on and, the first time, its contract fixture.
process.stdout.write(`Live proof on Claude Code ${claudeProofVersion()}\n`);

for (const [script, mode] of [
  ['live-messages.mjs', 'text'], ['live-messages.mjs', 'tool'],
  ...['foreground', 'failed', 'background', 'agent', 'background-agent'].map(mode => ['live-takeover.mjs', mode]),
  ['phase-handoff-provider-proof.mjs', 'claude_code'],
]) {
  test(`${script} ${mode}`, { timeout: 300000 }, () => {
    const output = execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), mode], { cwd: repository, encoding: 'utf8', timeout: 290000, maxBuffer: 4 * 1024 * 1024 });
    assert.match(output, script === 'phase-handoff-provider-proof.mjs' ? /"terminalHistoryPreserved":true/ : /"passed":true/);
    process.stdout.write(output);
  });
}
