// Recorded-protocol peer for adverse history conditions. It never executes a model turn.
import { readFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
if (process.argv.includes('--version')) { console.log('codex-cli 0.162.1'); process.exit(0); }
let calls = 0;
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.id === undefined) continue;
  const state = JSON.parse(readFileSync(process.env.KILN_CODEX_HISTORY_FIXTURE, 'utf8'));
  if (state.log) appendFileSync(state.log, JSON.stringify(request) + '\n');
  if (request.method === state.hang) continue;
  let result;
  const p = request.params;
  if (request.method === 'initialize') result = { userAgent: 'codex-history-fixture' };
  else if (request.method === 'thread/read') {
    result = { thread: state.threads[p.threadId]?.metadata };
    if (!result.thread) { console.log(JSON.stringify({ id: request.id, error: { code: -32602, message: 'No saved thread' } })); continue; }
  } else if (request.method === 'thread/list') {
    const ids = p.archived ? (state.archived ?? []) : (state.listed ?? []);
    const all = ids.map(id => state.threads[id].metadata);
    calls++;
    if (state.changedTree && calls > 2) all.push({ id: 'new-child' });
    const start = Number(p.cursor ?? 0);
    result = { data: all.slice(start, start + p.limit), nextCursor: start + p.limit < all.length ? String(start + p.limit) : null };
  } else if (request.method === 'thread/turns/list') {
    const all = state.threads[p.threadId]?.turns;
    if (!all) { console.log(JSON.stringify({ id: request.id, error: { code: -32602, message: 'No saved turns' } })); continue; }
    const start = Number(p.cursor ?? 0);
    result = { data: all.slice(start, start + p.limit), nextCursor: state.repeatCursor ? 'repeat' : start + p.limit < all.length ? String(start + p.limit) : null };
    if (state.changeRawOnRead && p.cursor === null) appendFileSync(state.threads[p.threadId].metadata.path, state.changeRawOnRead);
  } else { console.log(JSON.stringify({ id: request.id, error: { code: -32601, message: 'History-only peer' } })); continue; }
  console.log(JSON.stringify({ id: request.id, result }));
}
