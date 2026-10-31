// Fixed local ownership probe. Only matching numeric PIDs leave stdout; diagnostic stderr
// is bounded. Command lines, other environment fields and account data are never logged.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import process from 'node:process';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { owner } = JSON.parse(input);
if (typeof owner !== 'string' || !/^[a-f0-9-]{36}$/.test(owner)) throw new Error('Invalid process owner');
const child = spawn('/bin/ps', ['eww', '-A', '-o', 'pid=,command='], { stdio: ['ignore','pipe','pipe'] });
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
  child.once('error', error => resolve({ code: null, failure: error.message }));
  child.once('close', (code, signal) => resolve({ code, failure: signal ? `ended by ${signal}` : undefined }));
});
const token = `KILN_CODEX_PROCESS_OWNER=${owner}`;
const found = [];
const lines = createInterface({ input: child.stdout });
for await (const line of lines) {
  if (!line.split(/\s+/).includes(token)) continue;
  const match = /^\s*(\d+)\s/.exec(line);
  if (match) found.push(Number(match[1]));
  if (found.length > 4096) throw new Error('Owned process bound exceeded');
}
const result = await completion;
if (result.code !== 0) {
  const reason = result.code === null ? result.failure : `exit ${result.code}`;
  // Only stderr from the fixed ps command is diagnostic; its stdout stays private.
  process.stderr.write(`\nProcess ownership query failed: /bin/ps ${reason}\n`);
  process.exitCode = 1;
} else process.stdout.write(JSON.stringify(found));
