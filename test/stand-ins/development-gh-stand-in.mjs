// Replays captured GitHub shapes with controlled failure injection; live proofs cover the real boundary.
import { readFileSync, appendFileSync } from 'node:fs';
const state = JSON.parse(readFileSync(process.env.KILN_DELIVERY_GH_RESPONSES, 'utf8'));
const args = process.argv.slice(2);
if (state.log) appendFileSync(state.log, JSON.stringify(args) + '\n');
let key;
if (args[0] === 'api') key = args.at(-1);
else if (args[0] === 'pr' && args[1] === 'view') key = 'pr-view';
else throw new Error(`Unexpected proof GitHub command: ${JSON.stringify(args)}`);
const reply = state.responses[key];
if (!reply) { process.stderr.write(`No captured contract for ${key}\n`); process.exit(2); }
if (reply.error) { process.stderr.write(reply.error); process.exit(1); }
process.stdout.write(typeof reply.raw === 'string' ? reply.raw : JSON.stringify(reply.body));
