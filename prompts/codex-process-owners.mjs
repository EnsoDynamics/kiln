// Fixed local ownership probe. Only numeric process identities leave stdout; diagnostic stderr
// is bounded. Command lines, other environment fields and account data are never logged.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { owner } = JSON.parse(input);
if (typeof owner !== 'string' || !/^[a-f0-9-]{36}$/.test(owner)) throw new Error('Invalid process owner');
const child = spawn('/bin/ps', ['eww', '-A', '-o', 'pid=,ppid=,command='], { stdio: ['ignore','pipe','pipe'] });
// The query's own process owns its deadline. Controller-side synchronous evidence
// reads can delay pipe callbacks long after a healthy query has already finished.
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 5000);
let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', text => {
  const excerpt = text.slice(0, Math.max(0, 1024 - stderr.length));
  stderr += excerpt;
  // Forward only bounded stderr so a timeout also preserves the underlying diagnostic.
  process.stderr.write(excerpt);
});
// Subscribe before draining stdout: a signalled child has no exitCode, even after close.
const completion = new Promise(resolve => {
  child.once('error', error => { clearTimeout(timer); resolve({ code: null, failure: error.message }); });
  child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, failure: signal ? `ended by ${signal}` : undefined }); });
});
const token = `KILN_CODEX_PROCESS_OWNER=${owner}`;
const found = [];
const processes = [];
let invalidInventory = false;
const lines = createInterface({ input: child.stdout });
for await (const line of lines) {
  if (!line.trim()) continue;
  const match = /^\s*(\d+)\s+(\d+)\s/.exec(line);
  if (!match) { invalidInventory = true; continue; }
  const pid = Number(match[1]); processes.push([pid, Number(match[2])]);
  if (line.split(/\s+/).includes(token)) found.push(pid);
  if (found.length > 4096) throw new Error('Owned process bound exceeded');
  if (processes.length > 65536) throw new Error('Process inventory bound exceeded');
}
const result = await completion;
if (result.code !== 0) {
  const reason = timedOut ? 'query timed out after 5 seconds' : result.code === null ? result.failure : `exit ${result.code}`;
  // Only stderr from the fixed ps command is diagnostic; its stdout stays private.
  process.stderr.write(`\nProcess ownership query failed: /bin/ps ${reason}\n`);
  process.exitCode = 1;
} else if (invalidInventory || !processes.length) {
  process.stderr.write('\nInvalid or empty process inventory.\n');
  process.exitCode = 1;
} else process.stdout.write(JSON.stringify({ processes, owned: found }));
