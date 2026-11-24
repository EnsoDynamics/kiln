// Opt-in, authenticated proof (Kiln After Delivery AC-MERGE-03, AC-MERGE-04):
//   node scripts/proof-run/merge-with-agent-provider-proof.mjs claude_code|codex conflict|update-branch|review-required
// Uses the actual installed provider, production Engine and journal, and the temporary GitHub test
// repository the design's "Delivery" names, whose `main` a ruleset protects with the required check
// `check`. Each run opens its own pull request from a fresh feature branch, makes the case on
// GitHub, presses Merge with the agent and records what GitHub then shows. Needs `dist/` (npm run build).
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
assert.ok(['claude_code', 'codex'].includes(agentId) && ['conflict', 'update-branch', 'review-required'].includes(scenario), 'usage: <claude_code|codex> <conflict|update-branch|review-required>');
const GITHUB = 'EnsoDynamics/kiln-proof-after-delivery-temp-20261122';
const RULESET = 27844662;
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-merge-${agentId}-${scenario}-`)));
const repository = join(root, 'kiln-proof-after-delivery-temp-20261122');
const run = (cwd, command, args) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (...args) => run(repository, 'git', args);
const gh = (...args) => run(root, 'gh', args);
/** The ruleset on main: the required check `check`, and `reviews` approving reviews. */
const ruleset = (reviews) => execFileSync('gh', ['api', '-X', 'PUT', `repos/${GITHUB}/rulesets/${RULESET}`, '--input', '-'], { input: JSON.stringify({ name: 'main needs check', target: 'branch', enforcement: 'active', conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, rules: [{ type: 'pull_request', parameters: { required_approving_review_count: reviews, dismiss_stale_reviews_on_push: false, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false } }, { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: false, required_status_checks: [{ context: 'check' }] } }] }), encoding: 'utf8' });
run(root, 'git', ['clone', '-q', `https://github.com/${GITHUB}.git`, repository]);
git('config', 'user.name', 'Kiln proof'); git('config', 'user.email', 'proof@example.invalid');
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const branch = `feature/merge-proof-${agentId}-${scenario}-${stamp}`;
const names = `${agentId}-${scenario}-${stamp}`;
const base = git('rev-parse', 'HEAD');

// The feature work: a sorted list the base branch also adds to, so the conflict has one right answer.
const list = (entries) => `# One name per line, sorted. Keep every name both sides add.\n${[...entries].sort().join('\n')}\n`;
const worktree = join(root, 'worktree');
git('worktree', 'add', '-q', '-b', branch, worktree, base);
const inWorktree = (...args) => run(worktree, 'git', args);
writeFileSync(join(worktree, `names-${names}.txt`), list(['bravo']));
inWorktree('add', '-A'); inWorktree('commit', '-qm', `test(proof): add the ${names} list`); inWorktree('push', '-q', '-u', 'origin', branch);
const created = gh('pr', 'create', '--repo', GITHUB, '--base', 'main', '--head', branch, '--title', `Merge proof: ${names}`, '--body', 'Opened by a Kiln merge proof. Merge order: 1 of 1');
const number = Number(created.split('/').at(-1));
assert.ok(number > 0, created);

// The case on GitHub before the press.
if (scenario === 'conflict') {
  // develop's counterpart: main gains its own entry in the same list (merged through a pull request, as the ruleset requires).
  const other = `${branch}-base`;
  git('checkout', '-q', '-b', other, base);
  writeFileSync(join(repository, `names-${names}.txt`), list(['alpha']));
  git('add', '-A'); git('commit', '-qm', `test(proof): the base adds to the ${names} list`); git('push', '-q', '-u', 'origin', other);
  const baseNumber = Number(gh('pr', 'create', '--repo', GITHUB, '--base', 'main', '--head', other, '--title', `Merge proof base change: ${names}`, '--body', 'The base change a merge proof brings in.').split('/').at(-1));
  for (let i = 0; i < 60 && !/^SUCCESS$/m.test(gh('pr', 'view', String(baseNumber), '--repo', GITHUB, '--json', 'statusCheckRollup', '--jq', '.statusCheckRollup[].conclusion')); i++) await new Promise(resolve => setTimeout(resolve, 10_000));
  gh('pr', 'merge', String(baseNumber), '--repo', GITHUB, '--merge');
  git('checkout', '-q', '--detach', 'origin/main');
}
if (scenario === 'update-branch') {
  // An unrelated change lands on main, then GitHub's Update branch adds a merge commit the worktree has never fetched.
  const other = `${branch}-base`;
  git('checkout', '-q', '-b', other, base);
  writeFileSync(join(repository, `other-${names}.txt`), 'unrelated\n');
  git('add', '-A'); git('commit', '-qm', `test(proof): an unrelated change for ${names}`); git('push', '-q', '-u', 'origin', other);
  const baseNumber = Number(gh('pr', 'create', '--repo', GITHUB, '--base', 'main', '--head', other, '--title', `Merge proof base change: ${names}`, '--body', 'An unrelated base change.').split('/').at(-1));
  for (let i = 0; i < 60 && !/^SUCCESS$/m.test(gh('pr', 'view', String(baseNumber), '--repo', GITHUB, '--json', 'statusCheckRollup', '--jq', '.statusCheckRollup[].conclusion')); i++) await new Promise(resolve => setTimeout(resolve, 10_000));
  gh('pr', 'merge', String(baseNumber), '--repo', GITHUB, '--merge');
  gh('api', '-X', 'PUT', `repos/${GITHUB}/pulls/${number}/update-branch`);
  git('checkout', '-q', '--detach', 'origin/main');
}
if (scenario === 'review-required') ruleset(1);

// A finished Kiln run of the merge-proof PRD, delivered as this pull request.
const directory = 'docs/prds/merge-proof';
const paths = { mainCheckoutPath: repository, repositoryName: 'kiln-proof-after-delivery-temp-20261122', folderName: 'merge-proof', featureName: 'Merge proof', prdDirectoryFromRoot: directory };
const settings = defaultSettings(paths, { branches: new Map([['main', base]]), defaultBranch: 'main' });
Object.assign(settings, { featureBranch: branch, baseBranch: 'main', worktreePath: worktree, workspaceFolder: root, keepAwake: false, resumeAfterUsageLimit: false });
const record = newPrdRecord({ ...paths, github: GITHUB, featureName: 'Merge proof', settings });
record.settings.modelChoices.kept = { agentId, model: agentId === 'codex' ? 'gpt-6.1-sol' : 'opus', effort: 'high' };
const at = new Date().toISOString();
const head = inWorktree('rev-parse', 'HEAD');
Object.assign(record, { startedAt: at, setupCompletedAt: at, completedAt: at, plan: recordedPlan(observePlan(repository, directory).plan) });
record.repositories = [{ name: paths.repositoryName, kind: 'prd', mainCheckoutPath: repository, github: GITHUB, baseBranch: 'main', worktreePath: worktree, baseCommit: base, setupCompletedAt: at }];
record.phases['1'] = { doneAt: at, sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { [paths.repositoryName]: { startCommit: base, pushedSha: head } } };
record.phases.pr = { doneAt: at, sessionIds: [], finishedByPerson: true, outsideConfirmations: [], repositories: { [paths.repositoryName]: { startCommit: base, pushedSha: head } } };
record.pullRequests = [{ repository: paths.repositoryName, number, title: `Merge proof: ${names}`, url: created, head: branch, base: 'main', commits: 1, additions: 2, deletions: 0 }];
// Kiln's private state, under a state root of this run's own (owner-only, as Kiln requires).
const env = { ...process.env, XDG_STATE_HOME: join(root, 'state-home') };
const stateDirectory = prdStateDirectory(stateRoot(env), repository, paths.repositoryName, directory); mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
const events = [];
const engine = new Engine({ paths, tools: { git: 'git', gh: 'gh', claude: 'claude', codex: 'codex' }, env, stateDirectory, record, onTerminal: event => events.push(event), sleepReader: { next: async () => [] }, originRetryMs: 0 });
try {
  assert.equal((await engine.prepare()).ok, true);
  await engine.checkCompletedPlan().catch(error => console.log(JSON.stringify({ check: String(error) })));
  const offer = engine.mergeControl();
  console.log(JSON.stringify({ root, agentId, scenario, number, offer, reading: record.afterDelivery?.pullRequests }));
  assert.equal(offer.available, true, JSON.stringify(offer));
  const answer = engine.commands.submit({ command_id: `proof-${stamp}`, execution_id: record.executionId, status_token: engine.controlView().token, action: 'merge', inputs: { via: 'command_line' } });
  assert.equal(answer.ok, true, JSON.stringify(answer));
  await engine.commands.settled(); await engine.settled();
  const session = engine.latestSession('merge');
  const view = JSON.parse(gh('pr', 'view', String(number), '--repo', GITHUB, '--json', 'state,mergeCommit,mergedAt'));
  const result = {
    agentId, scenario, pullRequest: created, sessionId: session?.sessionId, model: session?.model, runs: session?.runs.length,
    githubState: view.state, mergeCommit: view.mergeCommit?.oid ?? null,
    kilnMerge: record.afterDelivery?.merge, stop: record.phases.merge?.stop && { kind: record.phases.merge.stop.kind, checks: record.phases.merge.stop.checks },
    lastMessage: session?.runs.at(-1)?.result?.text ?? null, check: record.completedPlanCheck?.status ?? null,
  };
  writeFileSync(join(root, 'proof-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await engine.stop('sigint');
  if (scenario === 'review-required') ruleset(0);
}
