// Read-only installed SDK and real provider-owned JSONL contract. No model request.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync, symlinkSync, readdirSync } from 'node:fs';
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
  writeFileSync(file, 'garbage\n'); expect(sdk()).toEqual({ info: false, messages: 0 }); expect(claudeHistoryAvailability(sandbox.env, id)).toMatchObject({ available: false, code: 'unreadable' });
  // A line that isn't JSON makes the conversation unreadable even after a usable message (run restart AC-CARRY-02 row 5).
  writeFileSync(file, row + 'garbage\n' + row); expect(claudeHistoryAvailability(sandbox.env, id)).toMatchObject({ available: false, code: 'unreadable' });
  // A line a killed process cut off, followed by a resumed run's lines, is skipped.
  writeFileSync(file, row + '{"type":"assistant","message":\n' + row); expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(true);
  writeFileSync(file, JSON.stringify({ type: 'summary', summary: 'no messages' }) + '\n'); expect(claudeHistoryAvailability(sandbox.env, id)).toMatchObject({ available: false, code: 'no_messages' });
  writeFileSync(file, JSON.stringify({ type: 'user', message: { content: 'Legacy user record' } }) + '\n'); expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(true);
  writeFileSync(file, row); chmodSync(file, 0o000); expect(claudeHistoryAvailability(sandbox.env, id)).toMatchObject({ available: false, code: 'unreadable' }); chmodSync(file, 0o600);
  expect(claudeHistoryAvailability(sandbox.env, id, Date.now() - 1)).toMatchObject({ available: false, code: 'unreadable' });
  writeFileSync(file, 'x'.repeat(16 * 1024 * 1024 + 1)); expect(claudeHistoryAvailability(sandbox.env, id)).toMatchObject({ available: false, code: 'unreadable' });
  symlinkSync(file, join(folder, 'symlink.jsonl')); expect(claudeHistoryAvailability(sandbox.env, 'symlink')).toMatchObject({ available: false, code: 'unsafe', path: join(folder, 'symlink.jsonl'), defects: ['link'], reason: `Provider history can be changed by other users: ${join(folder, 'symlink.jsonl')}.` });
  expect(claudeHistoryAvailability(sandbox.env, randomUUID())).toMatchObject({ available: false, code: 'missing' });
  expect(claudeHistoryAvailability(sandbox.env, '../x')).toMatchObject({ available: false, code: 'missing' });
  mkdirSync(join(folder, 'folder-id.jsonl')); expect(claudeHistoryAvailability(sandbox.env, 'folder-id')).toMatchObject({ available: false, code: 'not_a_file', path: join(folder, 'folder-id.jsonl') });
});
it('judges only the conversation\'s own folder, accepting group-writable folders a 0002 umask leaves and refusing ones other users can write', () => {
  sandbox = createSandbox(); const id = randomUUID(); const projects = join(sandbox.env.CLAUDE_CONFIG_DIR!, 'projects');
  const row = JSON.stringify({ type: 'user', sessionId: id, message: { role: 'user', content: 'Group-writable folder contract message' } }) + '\n';
  // Unrelated folders other sessions left behind: group-writable (a 0002 umask) and writable by anyone.
  for (const [name, mode] of [['-a-group-writable-memory-folder', 0o775], ['-another-world-writable-folder', 0o777]] as const) { const other = join(projects, name); mkdirSync(join(other, 'memory'), { recursive: true }); chmodSync(other, mode); }
  const folder = join(projects, '-the-conversations-folder'); mkdirSync(folder, { recursive: true }); chmodSync(folder, 0o700);
  writeFileSync(join(folder, `${id}.jsonl`), row); chmodSync(join(folder, `${id}.jsonl`), 0o600);
  expect(claudeHistoryAvailability(sandbox.env, id)).toEqual({ available: true, reason: 'Saved provider conversation contains usable history.' });
  chmodSync(folder, 0o775); expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(true);
  chmodSync(folder, 0o777); expect(claudeHistoryAvailability(sandbox.env, id)).toEqual({ available: false, code: 'unsafe', path: folder, defects: ['writable_by_others'], folder: true, reason: `Provider history can be changed by other users: ${folder}.` });
  const file = join(folder, `${id}.jsonl`); const changeable = { available: false, code: 'unsafe', path: file, defects: ['writable_by_others'], folder: false, reason: `Provider history can be changed by other users: ${file}.` };
  chmodSync(folder, 0o700); chmodSync(file, 0o606); expect(claudeHistoryAvailability(sandbox.env, id)).toEqual(changeable);
  chmodSync(file, 0o660); expect(claudeHistoryAvailability(sandbox.env, id)).toEqual(changeable);
  chmodSync(file, 0o600);
  // A conversation in no folder makes Kiln read every folder, so the unrelated ones above, and one this user can't search, are each passed over rather than judged.
  const locked = join(projects, '-a-folder-this-user-cannot-search'); mkdirSync(locked); chmodSync(locked, 0o000);
  try {
    if (process.getuid?.() !== 0) expect(() => readdirSync(locked)).toThrow();
    expect(claudeHistoryAvailability(sandbox.env, randomUUID())).toEqual({ available: false, code: 'missing', reason: 'Provider history is missing.' });
    expect(claudeHistoryAvailability(sandbox.env, id).available).toBe(true);
  } finally { chmodSync(locked, 0o700); }
});
