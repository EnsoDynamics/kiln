// Fixed local ownership probe. Only matching numeric PIDs leave this helper; command lines,
// other environment fields and account data are never returned, persisted or logged.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import process from 'node:process';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { owner } = JSON.parse(input);
if (typeof owner !== 'string' || !/^[a-f0-9-]{36}$/.test(owner)) throw new Error('Invalid process owner');
const child = spawn('/bin/ps', ['eww', '-A', '-o', 'pid=,command='], { stdio: ['ignore','pipe','ignore'] });
const token = `KILN_CODEX_PROCESS_OWNER=${owner}`;
const found = [];
const lines = createInterface({ input: child.stdout });
for await (const line of lines) {
  if (!line.split(/\s+/).includes(token)) continue;
  const match = /^\s*(\d+)\s/.exec(line);
  if (match) found.push(Number(match[1]));
  if (found.length > 4096) throw new Error('Owned process bound exceeded');
}
const code = child.exitCode ?? await new Promise(resolve => child.once('close', resolve));
if (code !== 0) throw new Error('Process ownership query failed');
process.stdout.write(JSON.stringify(found));
