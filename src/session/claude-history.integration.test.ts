// Read-only installed SDK and real provider-owned JSONL contract. No model request.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { createSandbox, type Sandbox } from '../test-support/git-repositories.js';
import { claudeHistoryAvailability } from './transcripts.js';
let sandbox: Sandbox;
afterEach(async () => { await sandbox?.cleanup(); });
it('agrees with installed Claude SDK metadata for usable, partial and corrupt history without starting a turn', () => {
  sandbox = createSandbox(); const id = randomUUID(); const folder = join(sandbox.env.CLAUDE_CONFIG_DIR!, 'projects', '-disposable'); mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = join(folder, `${id}.jsonl`);
  const row = JSON.stringify({ type: 'user', sessionId: id, uuid: randomUUID(), parentUuid: null, timestamp: new Date().toISOString(), cwd: sandbox.root, message: { role: 'user', content: 'Disposable metadata contract message' } }) + '\n';
  const sdk = () => {
    const script = `import { getSessionInfo, getSessionMessages } from '@anthropic-ai/claude-agent-sdk'; const info = await getSessionInfo(${JSON.stringify(id)}); const messages = await getSessionMessages(${JSON.stringify(id)}); console.log(JSON.stringify({ info: !!info, messages: messages.length }));`;
    const read = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: sandbox.env, encoding: 'utf8' });
    expect(read.status, read.stderr).toBe(0); return JSON.parse(read.stdout) as { info: boolean; messages: number };
  };
  for (const bytes of [row, row + '{"type":']) {
    writeFileSync(file, bytes, { mode: 0o600 }); expect(sdk()).toEqual({ info: true, messages: 1 }); expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(true);
  }
  writeFileSync(file, 'garbage\n'); expect(sdk()).toEqual({ info: false, messages: 0 }); expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(false);
  writeFileSync(file, JSON.stringify({ type: 'user', message: { content: 'Legacy user record' } }) + '\n'); expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(true);
  writeFileSync(file, row); chmodSync(file, 0o000); expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(false); chmodSync(file, 0o600);
  expect(claudeHistoryAvailability(sandbox.env, id, Date.now() - 1).available).toBe(false);
  writeFileSync(file, 'x'.repeat(16 * 1024 * 1024 + 1)); expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(false);
  symlinkSync(file, join(folder, 'symlink.jsonl')); expect(claudeHistoryAvailability(sandbox.env, 'symlink').available).toBe(false);
});
