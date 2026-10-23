// Local PR peer for the isolated real-Codex proof. Never invokes GitHub.
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const file = process.env.KILN_WORKFLOW_PR_STATE;
const state = JSON.parse(readFileSync(file, 'utf8'));
const option = name => args[args.indexOf(name) + 1];
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'pr' && args[1] === 'create') {
  const pull = { number: 1, title: option('--title') ?? 'Codex workflow proof', url: 'https://github.com/local-proof/proof-app/pull/1', isDraft: args.includes('--draft'), isCrossRepository: false, headRefName: option('--head'), baseRefName: option('--base'), additions: 1, deletions: 0, commits: [{ oid: 'local-only-proof' }] };
  state.pulls = [pull]; writeFileSync(file, JSON.stringify(state)); console.log(pull.url); process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'list') { console.log(JSON.stringify(state.pulls.filter(p => p.headRefName === option('--head') && p.baseRefName === option('--base')))); process.exit(0); }
console.error('Local proof gh peer does not support: ' + args.join(' ')); process.exit(1);
