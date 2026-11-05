// Intentional controller-death fixture. Every filesystem and Git target is disposable.
import { readFileSync, writeFileSync } from 'node:fs';
import { Engine } from '../../dist/engine/engine.js';
import { CommandJournal } from '../../dist/control/commands.js';
import { bindExecutionAliases } from '../../dist/control/projection.js';
const { boundary, marker, bodyPath, options } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const oldId = options.record.executionId;
let stopped = false;
function stop() { if (stopped) return; stopped = true; writeFileSync(marker, 'durable boundary'); process.kill(process.pid, 'SIGSTOP'); }
const save = Engine.prototype.save;
Engine.prototype.save = function () {
  const value = save.call(this);
  const acceptance = this.record.continuation?.acceptances.at(-1);
  if (boundary === 'acceptance' && acceptance && this.record.executionId === oldId && !this.continuationAcceptance()?.repositories.some(row => row.ready)
    || boundary === 'workspace' && acceptance && this.record.executionId === oldId && this.continuationAcceptance()?.repositories.some(row => row.ready)
    || boundary === 'activation' && this.record.executionId !== oldId) stop();
  return value;
};
const journalSave = CommandJournal.prototype.save;
CommandJournal.prototype.save = function (receipt) {
  const value = journalSave.call(this, receipt);
  if (boundary === 'intent' && receipt.instruction.action === 'continuation-accept' && receipt.stage === 'intent') stop();
  return value;
};
const engine = new Engine({ ...options, env: process.env, sleepReader: { next: async () => [] } });
await engine.agents.refresh();
bindExecutionAliases(engine);
const check = await engine.checkCompletedPlan();
if (check.status !== 'available') throw Error(JSON.stringify(check));
const body = { proposalId: check.result.proposal.id, commandId: `crash-${boundary}`, executionId: oldId, statusToken: engine.controlView().token };
writeFileSync(bodyPath, JSON.stringify(body));
const result = await engine.continuationCommand('accept', body);
if (!result.ok) throw Error(JSON.stringify(result));
await engine.settled();
setInterval(() => {}, 1000);
