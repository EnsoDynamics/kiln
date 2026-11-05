// Captures only this disposable conversation tree. An inventory is not a passing workspace check.
// node scripts/proof-run/codex-capture-evidence.mjs <owned proof folder>
import { execFileSync } from 'node:child_process';
import { createReadStream, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { CodexRpc } from './codex-rpc.mjs';
import { decodeRawCall } from './codex-wrapper-decoder.mjs';
import { auditEntries } from './codex-evidence-policy.mjs';
import { belowMinimumProblem, compareToMinimum } from '../../dist/agents/tooling-minimums.js';

const root = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (manifest.root !== root || manifest.purpose !== 'Kiln Codex gate 1 only') throw new Error('Not an owned proof folder');
const threadId = readFileSync(join(root, 'thread-id.txt'), 'utf8').trim();
const home = realpathSync(process.env.CODEX_HOME ?? join(homedir(), '.codex'));
const deadline = Date.now() + 120_000;
const rpc = new CodexRpc(root, () => {});
const checkDeadline = () => { if (Date.now() >= deadline) throw new Error('Evidence deadline exceeded'); };
async function call(method, params) {
  checkDeadline();
  return rpc.call(method, params, Math.min(30_000, deadline - Date.now()));
}
async function pages(method, params) {
  const data = [], seen = new Set();
  let cursor;
  do {
    const page = await call(method, { ...params, limit: 100, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(page.data)) throw new Error('Missing page data');
    data.push(...page.data);
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('Repeated cursor');
    seen.add(cursor);
  } while (cursor);
  return data;
}
const kinds = ['subAgent', 'subAgentThreadSpawn', 'subAgentReview', 'subAgentOther', 'subAgentCompact'];
async function tree() {
  const ids = new Set([threadId]);
  for (const archived of [false, true]) {
    for (const child of await pages('thread/list', { ancestorThreadId: threadId, archived, sourceKinds: kinds })) ids.add(child.id);
  }
  return [...ids].sort();
}
function safeRawPath(path) {
  const actual = realpathSync(path);
  if (!['sessions', 'archived_sessions'].some(folder => {
    const part = relative(join(home, folder), actual);
    return part !== '' && !part.startsWith('..');
  })) throw new Error('Raw history outside initialized Codex history roots');
  return actual;
}
function identity(path) {
  const s = statSync(path);
  return { dev: s.dev, ino: s.ino, size: s.size, mtimeMs: s.mtimeMs };
}

// Any Codex at or above Kiln's minimum; the capture records the version that ran.
const codexVersion = execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim();
const reading = compareToMinimum('codex', codexVersion);
if (reading.state === 'below_minimum') throw new Error(belowMinimumProblem('codex', reading.version));
const report = { profile: 'static-dataflow candidate', codexVersion, gate1: 'not-evaluated-by-capture', at: new Date().toISOString(), threads: [], problems: [] };
try {
  await rpc.initialize();
  const before = await tree();
  const pending = [...before];
  for (const id of pending) {
    const metadata = (await call('thread/read', { threadId: id, includeTurns: false })).thread;
    const path = safeRawPath(metadata.path);
    const initial = identity(path);
    const turns = await pages('thread/turns/list', { threadId: id, itemsView: 'full', sortDirection: 'asc' });
    writeFileSync(join(root, `${id}-normalized.json`), JSON.stringify(turns), { mode: 0o600 });
    const entry = { id, path, initial, parentThreadId: metadata.source?.subagent?.thread_spawn?.parent_thread_id, nativeCommands: [], nativeWrites: [], delegations: [], childRefs: [], startEvidence: [], turns: turns.map(t => ({ id: t.id, status: t.status, itemsView: t.itemsView })), calls: [], contexts: [], started: [], completed: [], rawTypes: {}, normalizedTypes: {}, sha256: undefined };
    const hash = createHash('sha256');
    let lastByte;
    const stream = createReadStream(path);
    stream.on('data', chunk => { hash.update(chunk); lastByte = chunk.at(-1); });
    let metaId, position = 0, currentTurn, currentShell;
    const outcomes = new Set();
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        checkDeadline(); position++;
        const record = JSON.parse(line), payload = record.payload;
        entry.rawTypes[record.type] = (entry.rawTypes[record.type] ?? 0) + 1;
        if (record.type === 'session_meta' && metaId === undefined) { metaId = payload.id; entry.parentThreadId = payload.source?.subagent?.thread_spawn?.parent_thread_id ?? payload.forked_from_id; }
        if (record.type === 'world_state') {
          const env = payload.state?.environments?.environments?.local;
          if (env || payload.full) currentShell = env?.shell;
        }
        if (record.type === 'turn_context') { currentTurn = payload.turn_id; entry.contexts.push({ turnId: payload.turn_id, cwd: payload.cwd, model: payload.model, effort: payload.effort, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') }); }
        if (record.type === 'event_msg' && payload.type === 'task_started') entry.startEvidence.push({ turnId: payload.turn_id, sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') });
        if (record.type === 'event_msg' && payload.type === 'item_completed') {
          const item = payload.item;
          if (item.type === 'CommandExecution') entry.nativeCommands.push({ id: item.id, threadId: payload.thread_id, turnId: payload.turn_id, argv: item.command, cwd: item.cwd, status: item.status });
          if (item.type === 'SubAgentActivity') entry.childRefs.push(item.agent_thread_id);
        }
        if (record.type === 'response_item' && ['function_call_output','custom_tool_call_output'].includes(payload.type)) outcomes.add(payload.call_id);
        if (record.type === 'response_item' && payload.type?.endsWith('_call') && !['function_call', 'custom_tool_call'].includes(payload.type)) report.problems.push(`${id}: unsupported raw invocation ${payload.type}`);
        if (record.type === 'event_msg' && ['task_started', 'task_complete'].includes(payload.type)) entry[payload.type === 'task_started' ? 'started' : 'completed'].push(payload.turn_id);
        if (record.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(payload.type)) {
          const decoded = decodeRawCall(payload);
          entry.calls.push({ line: position, at: record.timestamp, turnId: payload.internal_chat_message_metadata_passthrough?.turn_id ?? currentTurn, shell: currentShell, rawType: payload.type, rawName: payload.name, rawSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), ...decoded });
        }
      }
    } finally { lines.close(); stream.destroy(); }
    entry.sha256 = hash.digest('hex');
    entry.final = identity(path);
    if (metaId !== id) report.problems.push(`${id}: raw session identity mismatch`);
    if (JSON.stringify(initial) !== JSON.stringify(entry.final)) report.problems.push(`${id}: raw source changed during scan`);
    if (initial.size && lastByte !== 10) report.problems.push(`${id}: unterminated final record`);
    for (const turn of turns) {
      if (turn.itemsView !== 'full') report.problems.push(`${id}: incomplete normalized items`);
      if (!['completed', 'interrupted', 'failed'].includes(turn.status)) report.problems.push(`${id}: unsettled normalized turn ${turn.id}`);
      for (const item of turn.items) {
        entry.normalizedTypes[item.type] = (entry.normalizedTypes[item.type] ?? 0) + 1;
        if (item.type === 'commandExecution') {
          const recorded = entry.nativeCommands.find(command => command.threadId === id && command.id === item.id);
          if (recorded && recorded.status !== item.status) report.problems.push(`${id}: command state disagrees across history views`);
          if (!['completed', 'failed', 'declined'].includes(item.status)) report.problems.push(`${id}: unfinished normalized command ${item.id}`);
          if (!recorded) report.problems.push(`${id}: normalized command has no raw command event ${item.id}`);
        }
        if (item.type === 'subAgentActivity' && item.agentThreadId) {
          entry.childRefs.push(item.agentThreadId);
          entry.delegations.push({ callId: item.id, turnId: turn.id, threadId: item.agentThreadId, kind: item.kind });
        }
        if (item.type === 'collabAgentToolCall') entry.childRefs.push(...item.receiverThreadIds);
        if (item.type === 'fileChange') {
          if (!['completed', 'failed', 'declined'].includes(item.status)) report.problems.push(`${id}: unfinished normalized file change ${item.id}`);
          for (const change of item.changes) {
            if (!['add', 'update', 'delete'].includes(change.kind.type)) report.problems.push(`${id}: unknown native file change`);
            entry.nativeWrites.push({ turnId: turn.id, path: change.path });
            if (change.kind.move_path) entry.nativeWrites.push({ turnId: turn.id, path: change.kind.move_path });
          }
        }
      }
    }
    entry.childRefs = [...new Set(entry.childRefs)];
    for (const child of entry.childRefs) if (!pending.includes(child)) pending.push(child);
    for (const decoded of entry.calls) decoded.outcome = outcomes.has(decoded.callId) ? 'recorded' : 'missing-conservative';
    report.threads.push(entry);
  }
  if (JSON.stringify(before) !== JSON.stringify(await tree())) report.problems.push('Conversation tree changed during scan');
  for (const entry of report.threads) {
    const fresh = (await call('thread/read', { threadId: entry.id, includeTurns: false })).thread;
    if (safeRawPath(fresh.path) !== entry.path || JSON.stringify(identity(entry.path)) !== JSON.stringify(entry.initial)) report.problems.push(`${entry.id}: source changed after tree scan`);
    const turns = await pages('thread/turns/list', { threadId: entry.id, itemsView: 'full', sortDirection: 'asc' });
    if (JSON.stringify(turns.map(t => ({id:t.id,status:t.status,itemsView:t.itemsView}))) !== JSON.stringify(entry.turns)) report.problems.push(`${entry.id}: normalized frontier changed`);
    if (fresh.status?.type === 'active') report.problems.push(`${entry.id}: active runtime thread`);
  }
  const roots = manifest.worktrees ?? [join(root,'workspace/kiln-proof-api'),join(root,'workspace/kiln-proof-shared')];
  report.audit = auditEntries(report.threads, roots);
  report.problems.push(...report.audit.problems);
  if (report.problems.length) { report.audit.coverage = 'inconclusive'; report.audit.passed = false; }
  report.inventoryOnly = false;
  // Never award gate 1 from this diagnostic inventory. Full semantic coverage and all
  // mandatory workflow cases must pass before a production reader can be integrated.
  report.conclusion = report.problems.length ? 'Evidence inconclusive' : `Complete operation coverage; ${report.audit.findings.length} outside changes; remaining gate cases must also pass`;
} catch (error) {
  report.problems.push(error.message);
} finally {
  await rpc.close();
  writeFileSync(join(root, 'evidence-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ codexVersion, gate1: report.gate1, threads: report.threads.length, problems: report.problems, conclusion: report.conclusion }, null, 2));
