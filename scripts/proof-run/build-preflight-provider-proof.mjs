// Opt-in, authenticated proof (build preflight technical design, "Delivery"):
//   npm run build && node scripts/proof-run/build-preflight-provider-proof.mjs [ready|items]
// Runs Kiln's own preflight prompt through the installed Claude Code and its installed
// build-preflight skill, against a disposable repository whose worktree starts with uncommitted
// changes. Proves the real session's final message opens with a line Kiln reads
// (AC-PREFLIGHT-02, AC-PREFLIGHT-03) and that it leaves HEAD, the index and the
// `git status --porcelain` output exactly as it found them (AC-PREFLIGHT-03). `items` seeds a
// requirement the machine cannot meet, so the report should list it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSessionRecord, readSessionRecord } from '../../dist/state/records.js';
import { runSessionProcess, launchArguments } from '../../dist/session/claude-session.js';
import { preflightSessionPrompt } from '../../dist/session/prompts.js';
import { resolveSkill } from '../../dist/audit/workflow.js';
import { readPreflightReport } from '../../dist/engine/preflight.js';

const scenario = process.argv[2] ?? 'ready';
assert.ok(['ready', 'items'].includes(scenario), 'Choose ready or items.');
const root = realpathSync(mkdtempSync(join(tmpdir(), `kiln-preflight-proof-${scenario}-`)));
const repository = join(root, 'shop'); const stateDirectory = join(root, 'state');
mkdirSync(repository); mkdirSync(stateDirectory);
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
git('init', '-q', '--bare', join(root, 'origin.git')); git('init', '-q', '-b', 'develop');
git('config', 'user.name', 'Kiln Preflight Proof'); git('config', 'user.email', 'proof@example.invalid');
git('remote', 'add', 'origin', join(root, 'origin.git'));
const directory = 'docs/prds/greeting'; mkdirSync(join(repository, directory), { recursive: true });
writeFileSync(join(repository, 'greeting.mjs'), 'export const greeting = (name) => `Hello, ${name}.`;\n');
writeFileSync(join(repository, 'greeting.test.mjs'), "import assert from 'node:assert/strict';\nimport { greeting } from './greeting.mjs';\nassert.equal(greeting('Ada'), 'Hello, Ada.');\nconsole.log('ok');\n");
writeFileSync(join(repository, 'package.json'), JSON.stringify({ name: 'greeting', private: true, type: 'module', scripts: { test: 'node greeting.test.mjs' } }, null, 2) + '\n');
writeFileSync(join(repository, 'README.md'), '# Greeting\n\nRun the tests with `npm test`. No credentials or services are needed.\n');
writeFileSync(join(repository, directory, 'greeting-prd.md'), '# PRD: Greeting\n\n## Acceptance Criteria\n\n- [ ] **AC-GREET-01 — Greets by name.** `greeting("Ada")` returns "Hello, Ada.".\n- [ ] **AC-GREET-02 — Greets formally.** `formalGreeting("Ada")` returns "Good day, Ada.".\n');
const design = scenario === 'items'
  ? '# Technical design: Greeting\n\nPhase 2 reads the greeting text from the vendor\'s translation API, which needs the `GREETING_VENDOR_TOKEN` environment variable on the build machine. The account owner issues the token. Tests: `npm test`.\n'
  : '# Technical design: Greeting\n\nPlain functions in `greeting.mjs`, tested with `npm test`. No external access.\n';
writeFileSync(join(repository, directory, 'greeting-technical-design.md'), design);
writeFileSync(join(repository, directory, 'phase-1-greeting.md'), '# Phase 1: Greeting\n\n## Acceptance criteria covered\nAC-GREET-01\n\n## Phase dependencies\nNone.\n');
writeFileSync(join(repository, directory, 'phase-2-formal.md'), '# Phase 2: Formal greeting\n\n## Acceptance criteria covered\nAC-GREET-02\n\n## Phase dependencies\nPhase 1.\n');
git('add', '-A'); git('commit', '-qm', 'docs(greeting): seed disposable preflight proof'); git('push', '-qu', 'origin', 'develop');
git('checkout', '-qb', 'feature/greeting'); git('push', '-qu', 'origin', 'feature/greeting');
// Uncommitted work an interrupted phase might have left: one change staged, one unstaged, one untracked.
writeFileSync(join(repository, 'greeting.mjs'), 'export const greeting = (name) => `Hello, ${name}.`;\n// work in progress\n');
git('add', 'greeting.mjs');
writeFileSync(join(repository, 'README.md'), '# Greeting\n\nRun the tests with `npm test`. No credentials or services are needed.\n\nDraft note.\n');
writeFileSync(join(repository, 'notes.txt'), 'untracked work in progress\n');

const facts = () => ({ head: git('rev-parse', 'HEAD').trim(), index: git('ls-files', '--stage'), status: git('status', '--porcelain=v1', '--untracked-files=all'), staged: git('diff', '--cached'), unstaged: git('diff'), branch: git('symbolic-ref', '--short', 'HEAD').trim() });
const before = facts();

const resolved = await resolveSkill({ name: 'build-preflight', agent: 'claude_code', claude: 'claude', cwd: repository, env: process.env, signal: globalThis.AbortSignal.timeout(120_000) });
assert.equal(resolved.kind, 'found', `build-preflight must be installed for Claude Code: ${resolved.message ?? ''}`);
const prompt = preflightSessionPrompt({ skillName: resolved.skill.name, skillPath: resolved.skill.path, prdFile: `${directory}/greeting-prd.md`, repositories: [{ name: 'shop', worktreePath: repository, baseBranch: 'develop' }], branch: 'feature/greeting' });
const activityId = randomUUID();
const session = { schemaVersion: 23, agentId: 'claude_code', sessionId: randomUUID(), phaseId: '', activityId, kind: 'preflight', createdAt: new Date().toISOString(), model: 'opus', modelDisplayName: 'opus', effort: 'medium', workingDirectory: repository, runs: [], sleeps: [], steps: [] };
writeSessionRecord(stateDirectory, session);
console.log(JSON.stringify({ root, scenario, sessionId: session.sessionId }));
const run = await runSessionProcess({ claude: 'claude', args: launchArguments(session.sessionId, 'opus', 'medium'), cwd: repository, env: process.env, prompt, cause: 'launch', stateDirectory, record: session });
const saved = readSessionRecord(stateDirectory, `preflight-${activityId}`, session.sessionId) ?? session;
const finalMessage = (saved.runs.at(-1) ?? run)?.result?.text;
const report = readPreflightReport(finalMessage);
const after = facts();
console.log(JSON.stringify({ exitCode: run.exitCode, outcome: report.outcome, firstLine: (finalMessage ?? '').split('\n').find(line => line.trim()) ?? null, items: report.outcome === 'items' ? report.items : [] }, null, 2));
assert.notEqual(report.outcome, 'no_report', `The real session's final message must open with a line Kiln reads:\n${finalMessage}`);
if (scenario === 'items') assert.equal(report.outcome, 'items', 'A requirement the machine cannot meet should be reported as an item.');
assert.deepEqual(after, before, 'The preflight session must leave HEAD, the index and the worktree status exactly as it found them.');
console.log('build preflight provider proof passed');
