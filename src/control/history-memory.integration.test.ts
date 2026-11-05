// Run this actual CLI/HTTP memory proof in its own fresh worker without competing integration files.
import { closeSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createSandbox, type Sandbox } from "../test-support/git-repositories.js";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { stateRoot, writeJsonAtomically } from "../state/state-files.js";
import { SCHEMA_VERSION, writePrdRecord, writeSessionRecord, type SessionRecord } from "../state/records.js";
import { INSPECTION_RECORD_BYTES } from "./private-state.js";
import { processStartTime } from "../platform/process-start-time.js";

let sandbox: Sandbox; let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; await sandbox?.cleanup(); });
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Disposable TCP port unavailable.");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

it('spools complete large histories through actual CLI and HTTP text/JSON under a bounded child heap', async () => {
  sandbox = createSandbox(); h = await createHarness({ sessions: [] });
  h.engine.record.startedAt = '2026-01-01T00:00:00Z';
  h.engine.record.setupCompletedAt = h.engine.record.startedAt;
  h.engine.record.settings.worktreePath = h.repository;
  h.engine.record.plan = [{ id: '1', title: 'Large history', file: 'phase-1-return-intake.md', closed: false, repositories: [] }];
  const directory = h.stateDirectory; const path = join(h.repository, `docs/prds/${FOLDER}`);
  const email = 'large-provenance-'.padEnd(1024 * 1024, 'x');
  const skill = join(h.sandbox.root, 'fixture-SKILL.md'); writeFileSync(skill, '# Disposable recorded skill context\n');
  const profile = { version: '0.162.1' as const, cwd: h.repository, writableRoots: [h.repository], repositories: [], skills: [{ name: 'implement-from-requirements', path: skill }] };
  for (let i = 0; i < 40; i++) {
    const id = `large-${i}`; const createdAt = '2026-01-02T00:00:00Z';
    const saved: SessionRecord = { schemaVersion: SCHEMA_VERSION, executionId: h.engine.record.executionId!, sessionId: id, phaseId: '1', kind: 'phase', agentId: i % 2 ? 'codex' : 'claude_code', createdAt, model: 'saved', modelDisplayName: 'Saved', workingDirectory: h.repository, ...(i % 2 ? { conversation: { threadId: `provider-${i}` } } : {}), runs: [{ startedAt: createdAt, endedAt: createdAt, cause: 'launch', account: { email }, result: { subtype: 'success', isError: false, text: email } }], sleeps: [], steps: [] };
    if (saved.agentId === 'codex') { saved.codex = { launchIntent: profile, originalAccount: { at: createdAt } }; saved.runs[0]!.codex = { intentAt: createdAt, requested: { model: 'saved' }, account: { at: createdAt, email }, profile, humanRequests: [], modelActivityAt: [] }; }
    h.engine.record.phases['1'] ??= { sessionIds: [], repositories: {}, finishedByPerson: false, outsideConfirmations: [] };
    h.engine.record.phases['1']!.sessionIds.push(id); writeSessionRecord(directory, saved);
  }
  writePrdRecord(directory, h.engine.record);
  const run = async (json: boolean) => {
    const output = join(sandbox.root, 'large-response'); const fd = openSync(output, 'w'); let stderr = '';
    const child = spawn(process.execPath, ['--max-old-space-size=48', fileURLToPath(new URL('../../dist/cli.js', import.meta.url)), 'status', path, '--detail', 'full', ...(json ? ['--json'] : [])], { cwd: sandbox.root, env: h!.env, stdio: ['ignore', fd, 'pipe'] }); closeSync(fd);
    child.stderr!.on('data', chunk => stderr += String(chunk));
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    expect(code, stderr || (json ? JSON.stringify(JSON.parse(readFileSync(output, 'utf8')).errors) : readFileSync(output, 'utf8').slice(-3000))).toBe(0); expect(stderr).toBe(''); expect(statSync(output).size).toBeGreaterThan(40 * 1024 * 1024);
    if (json) { const answer = JSON.parse(readFileSync(output, 'utf8')); expect(answer.session_history.complete).toBe(true); expect(answer.session_history.phases.flatMap((p: { conversations: unknown[] }) => p.conversations)).toHaveLength(40); }
    else expect(readFileSync(output, 'utf8')).toContain('session_id: large-39');
  };
  await run(true); await run(false);
  const port = await freePort();
  const script = `
    import { Engine } from ${JSON.stringify(new URL('../../dist/engine/engine.js', import.meta.url).href)};
    import { startLocalServer } from ${JSON.stringify(new URL('../../dist/server/local-server.js', import.meta.url).href)};
    import { readWork } from ${JSON.stringify(new URL('../../dist/control/private-state.js', import.meta.url).href)};
    import { writePrdRecord } from ${JSON.stringify(new URL('../../dist/state/records.js', import.meta.url).href)};
    const directory = ${JSON.stringify(directory)};
    const saved = readWork(${JSON.stringify(stateRoot(h.env))}, directory);
    const engine = new Engine({ paths: ${JSON.stringify(h.engine.paths)}, tools: ${JSON.stringify(h.tools)}, env: process.env, stateDirectory: directory, record: saved.record, sleepReader: { next: async () => [] } });
    // Complete constructor metadata work before serving. Its change events would
    // otherwise queue a large cache write during the CLI's authentication probe.
    await engine.agents.refresh();
    await engine.refreshBilling();
    if (engine.agents.state.pending || engine.billing.pending || engine.billing.busy) throw new Error('Controller metadata is not ready.');
    const server = await startLocalServer({ engine, port: ${port}, folderName: ${JSON.stringify(FOLDER)}, featureName: 'Returns', token: engine.record.token });
    process.on('message', async message => {
      if(message === 'stop-record') { engine.record.phases['1'].stop = { kind: 'done_check', at: new Date().toISOString(), checkedAt: new Date().toISOString(), checks: [] }; writePrdRecord(directory, engine.record); process.send('stop-recorded'); }
      if(message === 'close') { await server.close(); engine.close(); process.exit(0); }
    });
    process.send('ready');
  `;
  const controller = spawn(process.execPath, ['--max-old-space-size=48', '--input-type=module', '-e', script], { env: h.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let controllerError = ''; controller.stderr!.on('data', chunk => controllerError += String(chunk));
  const message = (expected: string) => new Promise<void>((resolve, reject) => {
    const received = (value: unknown) => { if(value === expected) { controller.off('message', received); controller.off('exit', exited); resolve(); } };
    const exited = (code: number | null) => { controller.off('message', received); reject(new Error(`Controller exited ${code}: ${controllerError}`)); };
    controller.on('message', received); controller.once('exit', exited);
  });
  try {
    await message('ready');
    writeJsonAtomically(join(directory, 'instance.lock'), { pid: controller.pid!, processStartTime: await processStartTime(controller.pid!), port });
    await run(true); await run(false);
    // The controller AND CLI each run with48MiB heaps. A stopped oversized record
    // must fail before either snapshot or control eligibility materializes it.
    const huge = h.engine.record.phases['1']!.sessionIds.at(-1)!;
    const savedPath = join(directory, '1', huge, 'session.json');
    const saved = JSON.parse(readFileSync(savedPath, 'utf8')) as SessionRecord; saved.runs[0]!.result = { subtype: 'success', isError: false, text: 'z'.repeat(INSPECTION_RECORD_BYTES + 1) }; writeSessionRecord(directory, saved);
    const stopped = message('stop-recorded'); controller.send('stop-record'); await stopped;
    const output = join(sandbox.root, 'incomplete-response'); const fd = openSync(output, 'w'); let stderr = '';
    const child = spawn(process.execPath, ['--max-old-space-size=48', fileURLToPath(new URL('../../dist/cli.js', import.meta.url)), 'status', path, '--detail', 'full', '--json'], { cwd: sandbox.root, env: h.env, stdio: ['ignore', fd, 'pipe'] }); closeSync(fd); child.stderr!.on('data', b => stderr += String(b));
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    expect(code, stderr || controllerError).toBe(4); expect(stderr).toBe('');
    const incomplete = JSON.parse(readFileSync(output, 'utf8')); expect(incomplete.ok).toBe(false);
    expect(incomplete.errors).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('browser projection') }), expect.objectContaining({ message: expect.stringContaining('controls') })]));
    expect(incomplete.session_history).toMatchObject({ complete: false, errors: expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('16 MiB') })]) });
  } finally {
    const closed = new Promise<void>(resolve => controller.once('exit', () => resolve()));
    if(controller.exitCode === null && controller.connected) { controller.send('close'); await closed; }
  }
}, 60000);
