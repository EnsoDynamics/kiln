// Authenticated provider tier: synthetic conversations and disposable local Git only.
// Offline contract, hook, process, HTTP and browser tests remain in npm run verify.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const cliVersion = execFileSync('claude', ['--version'], { encoding: 'utf8', timeout: 10000 });
assert.equal(process.platform, 'darwin', 'Live controls are qualified on macOS only.');
assert.match(cliVersion, /^2\.1\.311 /, 'Use the qualified Claude CLI for provider proof.');

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
