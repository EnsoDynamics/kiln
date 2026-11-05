// Prerequisite runtime proof only. Creates disposable Git repositories and local bare origins.
// Never invokes Kiln's engine, changes method skills, or pushes to a network remote.
// node scripts/proof-run/codex-audit-proof.mjs seed
// node scripts/proof-run/codex-audit-proof.mjs run /private/tmp/kiln-codex-audit-XXXXXX
// node scripts/proof-run/codex-audit-proof.mjs resume <same folder> <prompt file>
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexRpc } from './codex-rpc.mjs';
import { belowMinimumProblem, compareToMinimum } from '../../dist/agents/tooling-minimums.js';

const [mode, suppliedRoot, promptFile] = process.argv.slice(2);
if (!['seed', 'run', 'resume'].includes(mode) || mode !== 'seed' && !suppliedRoot || mode === 'resume' && !promptFile) throw new Error('Usage: seed | run <proof folder> | resume <proof folder> <prompt file>');
const root = mode === 'seed' ? mkdtempSync(join(tmpdir(), 'kiln-codex-audit-')) : resolve(suppliedRoot);
const workspace = join(root, 'workspace');
const source = fileURLToPath(new URL('./', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const save = (name, value) => writeFileSync(join(root, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });

if (mode === 'seed') {
  mkdirSync(workspace);
  for (const name of ['kiln-proof-api', 'kiln-proof-shared', 'outside-sentinel']) {
    const checkout = join(root, name);
    mkdirSync(checkout);
    git(root, 'init', '--bare', join(root, name + '.git'));
    git(checkout, 'init', '-b', 'main');
    git(checkout, 'config', 'user.name', 'Kiln Audit Proof');
    git(checkout, 'config', 'user.email', 'kiln-proof@example.invalid');
    writeFileSync(join(checkout, 'README.md'), `# ${name}\nDisposable Codex audit proof repository.\n`);
    writeFileSync(join(checkout, 'AGENTS.md'), readFileSync(join(source, 'codex-proof-instructions.txt')));
    writeFileSync(join(checkout, 'CLAUDE.md'), '# Proof repository\nFollow AGENTS.md in this checkout.\n');
    if (name === 'kiln-proof-api') {
      const docs = join(checkout, 'docs/prds/slugify');
      mkdirSync(docs, { recursive: true });
      for (const file of ['slugify-prd.md', 'technical-design.md', 'phase-1-slugify.md']) copyFileSync(join(source, 'slugify', file), join(docs, file));
    }
    git(checkout, 'add', 'README.md', 'AGENTS.md', 'CLAUDE.md', ...(name === 'kiln-proof-api' ? ['docs/prds/slugify'] : []));
    git(checkout, 'commit', '-m', 'test(proof): seed disposable Codex audit repository');
    git(checkout, 'remote', 'add', 'origin', join(root, name + '.git'));
    if (name !== 'outside-sentinel') git(checkout, 'worktree', 'add', '-b', 'kiln-audit-proof', join(workspace, name));
  }
  save('manifest.json', { root, workspace, createdAt: new Date().toISOString(), purpose: 'Kiln Codex gate 1 only' });
  console.log(root);
} else {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  if (manifest.root !== root || manifest.purpose !== 'Kiln Codex gate 1 only') throw new Error('Not an owned proof folder');
  // Any Codex at or above Kiln's minimum; the proof records the version that ran.
  const codexVersion = execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim();
  const reading = compareToMinimum('codex', codexVersion);
  if (reading.state === 'below_minimum') throw new Error(belowMinimumProblem('codex', reading.version));
  const rpc = new CodexRpc(join(workspace, 'kiln-proof-api'), event => appendFileSync(join(root, 'rpc.jsonl'), JSON.stringify(event) + '\n', { mode: 0o600 }));
  try {
    await rpc.initialize();
    const account = await rpc.call('account/read', { refreshToken: false });
    if (account.account?.type !== 'chatgpt') throw new Error('Existing ChatGPT sign-in required');
    const skills = await rpc.call('skills/list', { cwds: [join(workspace, 'kiln-proof-api')] });
    const installed = skills.data.flatMap(entry => entry.skills);
    for (const name of ['implement-from-requirements', 'deliverable-review', 'test-hardening', 'refactor-pass']) {
      if (!installed.some(skill => skill.enabled && (skill.name === name || skill.name.endsWith(':' + name)))) throw new Error(`Required skill missing: ${name}`);
    }
    save('skills.json', installed.filter(skill => skill.name.includes('enso-method')));
    const profile = { cwd: join(workspace, 'kiln-proof-api'), model: 'gpt-6.1-sol', modelProvider: 'openai', sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review', config: { model_reasoning_effort: 'high', sandbox_workspace_write: { writable_roots: [workspace], network_access: true } } };
    const result = await rpc.call(mode === 'run' ? 'thread/start' : 'thread/resume', { ...profile, ...(mode === 'run' ? { ephemeral: false, allowProviderModelFallback: false } : { threadId: readFileSync(join(root, 'thread-id.txt'), 'utf8').trim() }) });
    if (result.model !== profile.model || result.reasoningEffort !== 'high' || result.approvalPolicy !== 'on-request' || result.approvalsReviewer !== 'auto_review' || result.sandbox?.type !== 'workspaceWrite') throw new Error('Effective profile mismatch');
    const threadId = result.thread.id;
    writeFileSync(join(root, 'thread-id.txt'), threadId + '\n', { mode: 0o600 });
    save('effective-profile.json', { codexVersion, model: result.model, effort: result.reasoningEffort, sandbox: result.sandbox, approvalPolicy: result.approvalPolicy, approvalsReviewer: result.approvalsReviewer, instructionSources: result.instructionSources });
    const text = readFileSync(promptFile ?? join(source, 'codex-method-proof-prompt.txt'), 'utf8').replaceAll('{{ROOT}}', root).replaceAll('{{WORKSPACE}}', workspace).replaceAll('{{KILN_SOURCE}}', resolve(source, '../..'));
    save('dispatch-intent.json', { threadId, at: new Date().toISOString(), mode });
    const started = await rpc.call('turn/start', { threadId, model: profile.model, effort: 'high', input: [{ type: 'text', text }] });
    save('dispatch.json', { codexVersion, threadId, turnId: started.turn.id });
    console.log('CODEX', codexVersion, 'THREAD', threadId, 'ROOT', root);
    const terminal = await rpc.waitTurn(started.turn.id);
    save('terminal.json', terminal);
    if (terminal.status !== 'completed' || rpc.humanStops.length) throw new Error(`Proof turn stopped: ${terminal.status}; human requests ${rpc.humanStops.length}`);
  } finally { await rpc.close(); }
}
