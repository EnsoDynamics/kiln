// Real-install proof of the Codex launch settings probe (kiln-completion-waivers, AC-WAIVE-02).
// Run after npm run build: node scripts/proof-run/codex-launch-probe-proof.mjs
// Prepares the launch from the installed Codex and your signed-in Codex home, exactly as Kiln
// does before every launch (read-only metadata). The probe itself then runs against the
// installed Codex under an isolated CODEX_HOME in a temporary directory, which configures one
// trivial local MCP server. No credentials are copied, so nothing there can reach the model.
// Writes results.json in the printed proof directory. Exits 1 on any failed claim.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearInterval } from 'node:timers';
import { latestSol, readCodexMetadata } from '../../dist/agents/codex-metadata.js';
import { prepareCodexLaunch } from '../../dist/session/codex-launch-profile.js';
import { probeCodexLaunchSettings } from '../../dist/session/codex-launch-probe.js';
import { CodexHistoryRpc } from '../../dist/session/codex-history-rpc.js';

const { AbortSignal } = globalThis;
if (process.platform === 'win32') throw new Error('This proof uses POSIX process inventory; run it on macOS or Linux.');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'kiln-codex-launch-probe-proof-')));
console.log('Proof directory:', root);
const workspace = join(root, 'workspace'); mkdirSync(workspace);
execFileSync('git', ['init', '-b', 'kiln-launch-probe-proof'], { cwd: workspace, stdio: 'pipe' });
const home = join(root, 'codex-home'); mkdirSync(home);
const codex = execFileSync('which', ['codex'], { encoding: 'utf8' }).trim();
const version = execFileSync(codex, ['--version'], { encoding: 'utf8' }).trim();

// A trivial MCP server that records each start and, unlike most servers, keeps running after
// its stdin closes and ignores SIGHUP, so only the probe's own cleanup can end it.
const mcpStarts = join(root, 'mcp-starts.jsonl');
const mcp = join(root, 'probe-mcp.mjs');
writeFileSync(mcp, `import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
appendFileSync(${JSON.stringify(mcpStarts)}, JSON.stringify({ pid: process.pid, ppid: process.ppid, at: new Date().toISOString() }) + '\\n');
process.on('SIGHUP', () => {}); setInterval(() => {}, 1000);
createInterface({ input: process.stdin }).on('line', line => {
  const m = JSON.parse(line); if (m.id === undefined) return;
  const result = m.method === 'initialize' ? { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'kiln-probe-mcp', version: '1.0.0' } } : m.method === 'tools/list' ? { tools: [] } : {};
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
});
`);
writeFileSync(join(home, 'config.toml'), `[mcp_servers.kiln_probe_mcp]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(mcp)}]\n`);

// Records the probe's wire traffic without changing it: the probe starts this in place of
// `codex`, and it runs the installed Codex with the same arguments, environment and pipes.
const wire = join(root, 'wire.jsonl');
const tee = join(root, 'codex-tee.mjs');
writeFileSync(tee, `import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const log = value => appendFileSync(${JSON.stringify(wire)}, JSON.stringify({ at: new Date().toISOString(), ...value }) + '\\n');
const child = spawn(${JSON.stringify(codex)}, process.argv.slice(2), { stdio: ['pipe', 'pipe', 'inherit'] });
log({ codexPid: child.pid, teePid: process.pid, args: process.argv.slice(2) });
createInterface({ input: process.stdin }).on('line', line => { log({ sent: JSON.parse(line) }); child.stdin.write(line + '\\n'); }).on('close', () => child.stdin.end());
createInterface({ input: child.stdout }).on('line', line => { log({ received: JSON.parse(line) }); process.stdout.write(line + '\\n'); });
child.on('exit', (code, signal) => { log({ codexExit: { code, signal } }); process.exit(code ?? 1); });
`);
const executable = join(root, 'codex');
writeFileSync(executable, `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${tee}' "$@"\n`); chmodSync(executable, 0o755);

const processes = () => execFileSync('/bin/ps', ['-A', '-o', 'pid=,ppid=,pgid=,command='], { encoding: 'utf8' }).split('\n').filter(Boolean).map(line => { const [, pid, ppid, pgid, command] = /^\s*(\d+)\s+(\d+)\s+(\d+)\s(.*)$/.exec(line); return { pid: +pid, ppid: +ppid, pgid: +pgid, command }; });
const descendants = (rows, ancestor) => { const found = new Set([ancestor]); for (let changed = true; changed;) { changed = false; for (const row of rows) if (found.has(row.ppid) && !found.has(row.pid)) { found.add(row.pid); changed = true; } } return rows.filter(row => row.pid !== ancestor && found.has(row.pid) && !row.command.startsWith('/bin/ps')); };
const live = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
const jsonLines = path => existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
const files = (dir, out = []) => { if (!existsSync(dir)) return out; for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) files(path, out); else out.push(path); } return out; };

// 1. Prepare the next launch exactly as the engine does, from the signed-in Codex home.
const metadata = await readCodexMetadata({ executable: codex, cwd: workspace, cwds: [workspace], env: process.env });
if (metadata.blockers.length) throw new Error(`Codex is not ready for a launch: ${metadata.blockers.join('; ')}`);
const model = latestSol(metadata.models ?? []);
if (!model) throw new Error('No unique latest GPT Sol model in the installed Codex catalog.');
const prepared = await prepareCodexLaunch({ executable: codex, cwd: workspace, writableRoots: [workspace], repositories: [{ path: workspace, branch: 'kiln-launch-probe-proof' }], choice: { model, effort: 'high' }, env: process.env });

// 2. Probe under the isolated home, watching the probe's process tree while it runs.
const before = descendants(processes(), process.pid);
const seen = new Map();
const watch = setInterval(() => { for (const row of descendants(processes(), process.pid)) if (!seen.has(row.pid)) seen.set(row.pid, row); }, 50);
const started = Date.now();
let result, probeError = null;
try { result = await probeCodexLaunchSettings({ executable, env: { ...process.env, CODEX_HOME: home }, prepared }); }
catch (error) { probeError = error.message; }
finally { clearInterval(watch); }
const elapsedMs = Date.now() - started;

// 3. What remains of the probe's processes, the MCP server included.
const after = processes();
const leftover = descendants(after, process.pid);
const mcpStarted = jsonLines(mcpStarts);
const wireLog = jsonLines(wire);
const launch = wireLog.find(entry => entry.codexPid);
// The probe's server tree: the launched executable and everything under it, seen while it ran.
// The proof's own `ps` calls and Kiln's ownership helper are not part of it.
const tree = new Set(launch ? [launch.teePid] : []);
for (let changed = true; changed;) { changed = false; for (const row of seen.values()) if (tree.has(row.ppid) && !tree.has(row.pid)) { tree.add(row.pid); changed = true; } }
const tracked = [...seen.values()].filter(row => tree.has(row.pid)).map(row => ({ ...row, aliveAfter: live(row.pid) }));
const mentioningProof = after.filter(row => row.command.includes(root) && !row.command.startsWith('/bin/ps'));
for (const entry of mcpStarted) if (live(entry.pid)) process.kill(entry.pid, 'SIGKILL'); // Never leave the proof's server running.

// 4. The wire: what the probe sent and what Codex answered.
const sent = wireLog.filter(entry => entry.sent).map(entry => entry.sent);
const start = sent.find(message => message.method === 'thread/start');
const answer = start && wireLog.find(entry => entry.received?.id === start.id && !entry.received.method)?.received;
const threadId = answer?.result?.thread?.id;
const notifications = wireLog.filter(entry => entry.received?.method).map(entry => entry.received.method);

// 5. Codex history in the isolated home, read back by a fresh evidence-only server.
const history = new CodexHistoryRpc(codex, workspace, { ...process.env, CODEX_HOME: home }, AbortSignal.timeout(30_000));
let listed = [], readBack;
try {
  await history.initialize();
  for (const archived of [false, true]) listed.push(...(await history.call('thread/list', { archived, limit: 100 })).data.map(thread => thread.id));
  if (threadId) readBack = await history.call('thread/read', { threadId, includeTurns: false }).then(value => ({ found: true, path: value.thread?.path ?? null }), error => ({ found: false, error: error.message }));
} finally { await history.close(); }
const historyFiles = [...files(join(home, 'sessions')), ...files(join(home, 'archived_sessions'))];
const naming = threadId ? files(home).filter(path => !/logs_\d+\.sqlite/.test(path) && readFileSync(path).includes(threadId)) : [];

const claims = {
  probeAnswered: !probeError && result?.ok === true,
  sentOnlyInitializeAndThreadStart: JSON.stringify(sent.map(message => message.method)) === JSON.stringify(['initialize', 'initialized', 'thread/start']),
  noTurnDispatched: !sent.some(message => message.method === 'turn/start') && !notifications.some(method => method.startsWith('turn/') || method.startsWith('item/')),
  requestedEphemeralWithoutFallback: start?.params?.ephemeral === true && start?.params?.allowProviderModelFallback === false,
  codexKeptThreadEphemeral: answer?.result?.thread?.ephemeral === true && answer?.result?.thread?.path === null,
  noThreadInHistory: !!threadId && !listed.includes(threadId) && readBack?.found === false && historyFiles.length === 0 && naming.length === 0,
  mcpServerStartedByThreadStart: mcpStarted.length > 0 && mcpStarted.every(entry => tracked.some(row => row.pid === entry.ppid)),
  mcpServerGone: mcpStarted.length > 0 && tracked.filter(row => mcpStarted.some(entry => entry.pid === row.pid)).length === mcpStarted.length && mcpStarted.every(entry => !tracked.find(row => row.pid === entry.pid).aliveAfter),
  noProcessLeft: before.length === 0 && leftover.length === 0 && tracked.length > 0 && tracked.every(row => !row.aliveAfter) && mentioningProof.length === 0,
};
const evidence = {
  at: new Date().toISOString(), codexVersion: version, prepared: { model: prepared.choice.model, effort: prepared.choice.effort, cwd: prepared.profile.cwd, writableRoots: prepared.profile.writableRoots },
  result, probeError, elapsedMs, sentMethods: sent.map(message => message.method), threadStartParams: start?.params, notifications,
  effective: answer?.result && { model: answer.result.model, reasoningEffort: answer.result.reasoningEffort, modelProvider: answer.result.modelProvider, cwd: answer.result.cwd, approvalPolicy: answer.result.approvalPolicy, approvalsReviewer: answer.result.approvalsReviewer, sandbox: answer.result.sandbox, thread: { id: threadId, ephemeral: answer.result.thread.ephemeral, path: answer.result.thread.path } },
  codexPid: launch?.codexPid, teePid: launch?.teePid, trackedProcesses: tracked, mcpStarts: mcpStarted, leftoverDescendants: leftover, processesNamingProofDirectory: mentioningProof,
  history: { listedThreadIds: listed, readBack, historyFiles, filesNamingThread: naming }, claims,
};
writeFileSync(join(root, 'results.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ result, probeError, claims, effective: evidence.effective, trackedProcesses: tracked.map(({ pid, ppid, pgid, command, aliveAfter }) => ({ pid, ppid, pgid, command: command.slice(0, 120), aliveAfter })) }, null, 2));
const failed = Object.entries(claims).filter(([, passed]) => !passed).map(([claim]) => claim);
if (failed.length) { console.log(`FAIL: ${failed.join(', ')}. Evidence: ${join(root, 'results.json')}`); process.exit(1); }
console.log(`PASS: real Codex ${version} answered an ephemeral thread/start with matching settings; no turn dispatched, no thread in history, no process left (MCP server included). Evidence: ${join(root, 'results.json')}`);
