// Simulates uncommon provider requests over a real child-process pipe. No inference.
// Fixtures are validated against the installed CLI's generated pinned schemas by tests.
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { setTimeout, clearTimeout } from 'node:timers';
const [fixturePath, name] = process.argv.slice(2);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')).cases.find(row => row.name === name);
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
let started, deadline;
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') send({ id: message.id, result: {} });
  else if (message.method === 'initialized') {
    started = Date.now();
    deadline = setTimeout(() => process.exit(2), 5000);
    if (['async-question', 'direct-question'].includes(name)) send({ method: 'item/completed', params: { threadId: 'proof-thread', turnId: 'proof-turn', item: { type: 'agentMessage', id: 'proof-item', ...(name === 'direct-question' ? { text: '{}', questions: [{ question: 'Direct proof consent?' }] } : { text: JSON.stringify({ questions: [{ question: 'Proof consent?' }] }) }) } } });
    else if (name === 'unknown') send({ id: 9001, method: 'future/request', params: { threadId: 'proof-thread', turnId: 'proof-turn' } });
    else send({ id: 9001, method: fixture.method, params: fixture.params });
  } else if (message.id === 9001 && !message.method) {
    clearTimeout(deadline);
    send({ method: 'proof/settled', params: { response: message, elapsed: Date.now() - started } });
  } else if (message.method === 'turn/interrupt') {
    clearTimeout(deadline);
    send({ id: message.id, result: {} });
    send({ method: 'proof/interrupted', params: { threadId: message.params.threadId, turnId: message.params.turnId, elapsed: Date.now() - started } });
  }
});
