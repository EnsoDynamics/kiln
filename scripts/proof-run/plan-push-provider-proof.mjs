// Opt-in, authenticated proof (Kiln After Delivery AC-BACK-05, AC-MERGE-05, AC-MERGE-06):
//   node scripts/proof-run/plan-push-provider-proof.mjs claude_code|codex push|refused
// Uses the actual installed provider, production Engine and journal, and the temporary GitHub test
// repository the design's "Delivery" names. A finished run of its `docs/prds/merge-proof` PRD gains
// a phase committed in the main checkout and not pushed; the run presses Continue and records what
// origin and Kiln then show. `push` uses a fresh, unprotected base branch, so the push lands and
// Kiln accepts the refreshed offer itself; the run stops Kiln as soon as that acceptance exists, so
// no build session runs. `refused` uses `main`, which a ruleset protects, so the push is refused and
// the session stops at Needs you. Needs `dist/` (npm run build).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../../dist/engine/engine.js';
import { defaultSettings } from '../../dist/engine/worktree-setup.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { observePlan } from '../../dist/engine/plan-reconciliation.js';
import { recordedPlan } from '../../dist/engine/plan-reading.js';
import { prdStateDirectory, stateRoot } from '../../dist/state/state-files.js';

const [agentId, scenario] = process.argv.slice(2);
assert.ok(['claude_code', 'codex'].includes(agentId) && ['push', 'refused'].includes(scenario), 'usage: <claude_code|codex> <push|refused>');
const GITHUB = 'EnsoDynamics/kiln-proof-after-delivery-temp-20261122';
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-plan-push-${agentId}-${scenario}-`)));
const repository = join(root, 'kiln-proof-after-delivery-temp-20261122');
const run = (cwd, command, args) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (...args) => run(repository, 'git', args);
run(root, 'git', ['clone', '-q', `https://github.com/${GITHUB}.git`, repository]);
git('config', 'user.name', 'Kiln proof'); git('config', 'user.email', 'proof@example.invalid');
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const main = git('rev-parse', 'HEAD');
// The base branch: a fresh one no ruleset covers, or main itself, which the ruleset protects.
const baseBranch = scenario === 'push' ? `plan-proof-${agentId}-${stamp}` : 'main';
if (scenario === 'push') { git('checkout', '-q', '-b', baseBranch, main); git('push', '-q', '-u', 'origin', baseBranch); }

// A finished Kiln run of the merge-proof PRD whose work is already in the base, with no pull request to wait for.
const directory = 'docs/prds/merge-proof';
const paths = { mainCheckoutPath: repository, repositoryName: 'kiln-proof-after-delivery-temp-20261122', folderName: 'merge-proof', featureName: 'Merge proof', prdDirectoryFromRoot: directory };
const settings = defaultSettings(paths, { branches: new Map([[baseBranch, main]]), defaultBranch: baseBranch });
Object.assign(settings, { featureBranch: `feature/plan-proof-${stamp}`, baseBranch, worktreePath: join(root, 'old-worktree'), workspaceFolder: join(root, 'old-workspace'), keepAwake: false, resumeAfterUsageLimit: false });
const record = newPrdRecord({ ...paths, github: GITHUB, featureName: 'Merge proof', settings });
record.settings.modelChoices.kept = { agentId, model: agentId === 'codex' ? 'gpt-6.1-sol' : 'opus', effort: 'high' };
const at = new Date().toISOString();
Object.assign(record, { startedAt: at, setupCompletedAt: at, completedAt: at, plan: recordedPlan(observePlan(repository, directory).plan) });
record.repositories = [{ name: paths.repositoryName, kind: 'prd', mainCheckoutPath: repository, github: GITHUB, baseBranch, worktreePath: join(root, 'old-worktree'), baseCommit: main, setupCompletedAt: at }];
record.phases['1'] = { doneAt: at, sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { [paths.repositoryName]: { startCommit: main, pushedSha: main } } };
record.phases.pr = { doneAt: at, sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { [paths.repositoryName]: { startCommit: main, pushedSha: main } } };
record.pullRequests = [];

// The plan gains phase 2, committed on this machine's base branch and not pushed.
writeFileSync(join(repository, directory, 'phase-2-farewell.md'), `# Phase 2: Farewell\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\n1.\n\nAdded by a Kiln push proof (${agentId}, ${stamp}).\n`);
git('add', '-A'); git('commit', '-qm', `docs(merge proof): add the farewell phase (${agentId} ${stamp})`);
const tip = git('rev-parse', 'HEAD');

const env = { ...process.env, XDG_STATE_HOME: join(root, 'state-home') };
const stateDirectory = prdStateDirectory(stateRoot(env), repository, paths.repositoryName, directory); mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
const events = [];
const engine = new Engine({ paths, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env, stateDirectory, record, onTerminal: event => events.push(event), sleepReader: { next: async () => [] }, originRetryMs: 0 });
const remoteBase = () => run(root, 'git', ['ls-remote', `https://github.com/${GITHUB}.git`, `refs/heads/${baseBranch}`]).split(/\s+/)[0];
try {
  assert.equal((await engine.prepare()).ok, true);
  const check = await engine.checkCompletedPlan();
  const proposal = check.result?.proposal;
  console.log(JSON.stringify({ root, agentId, scenario, baseBranch, status: check.status, source: check.result?.source, commits: proposal?.commits, errors: check.errors }));
  assert.equal(check.status, 'available'); assert.equal(check.result.source.kind, 'main_checkout');
  let answer = await engine.continuationCommand('accept', { proposalId: proposal.id, executionId: record.executionId, commandId: `proof-${stamp}`, statusToken: engine.controlView().token });
  // A refreshed offer (Codex's settings read finishing after the page's first check, say) is pressed again, as a person would.
  if (!answer.ok && answer.code === 'proposal_changed') answer = await engine.continuationCommand('accept', { proposalId: answer.check.result.proposal.id, executionId: record.executionId, commandId: `proof-${stamp}-again`, statusToken: engine.controlView().token });
  assert.equal(answer.ok, true, JSON.stringify(answer));
  const key = answer.planPush;
  const finished = record.executionId;
  // Stop Kiln once the push has led somewhere: an acceptance (the build would start next), a closed push, or a stop.
  for (let i = 0; i < 1800; i++) {
    const push = engine.record.executionId === finished ? engine.record.afterDelivery?.planPushes?.find(one => `plan-push-${one.operationId}` === key) : { closedAt: 'activated' };
    if (push?.closedAt || engine.record.continuation?.acceptances?.length || engine.stoppedPhaseKey() === key) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  // Stopping while the accepted build prepares its workspace ends that preparation with an error, as Ctrl+C there does.
  await engine.stop('sigint').catch(error => console.log(JSON.stringify({ stoppedDuringPreparation: String(error) })));
  const execution = engine.record.executionId === finished ? engine.record : engine.historicalExecution(finished)?.record;
  const session = (execution.phases[key]?.sessionIds ?? []).map(id => engine.sessionRecord(key, id)).at(-1);
  const result = {
    agentId, scenario, baseBranch, key, tip, remoteBase: remoteBase(), sessionId: session?.sessionId, model: session?.model, cwd: session?.workingDirectory, runs: session?.runs.length,
    push: execution.afterDelivery?.planPushes?.at(-1), stop: execution.phases[key]?.stop && { kind: execution.phases[key].stop.kind, checks: execution.phases[key].stop.checks },
    lastMessage: session?.runs.at(-1)?.result?.text ?? null, acceptances: engine.record.continuation?.acceptances ?? [], activated: engine.record.executionId !== finished,
  };
  writeFileSync(join(root, 'proof-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await engine.stop('sigint').catch(() => undefined);
}
