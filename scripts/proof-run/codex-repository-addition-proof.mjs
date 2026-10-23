// Serves only the existing repository-addition command for the disposable Codex proof.
// It never starts a Kiln implementation session or connects a Codex executor to the engine.
// node scripts/proof-run/codex-repository-addition-proof.mjs <owned proof folder>
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../../dist/engine/engine.js';
import { newPrdRecord } from '../../dist/state/new-record.js';
import { writePrdRecord } from '../../dist/state/records.js';
import { stateRoot, prdStateDirectory } from '../../dist/state/state-files.js';
import { takeInstanceLock } from '../../dist/state/instance-lock.js';
import { startLocalServer } from '../../dist/server/local-server.js';

const root = resolve(process.argv[2]), manifestPath = join(root, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.root !== root || manifest.purpose !== 'Kiln Codex gate 1 only') throw new Error('Not an owned proof folder');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const source = fileURLToPath(new URL('./', import.meta.url));
const extra = join(root, 'kiln-proof-extra'), bare = extra + '.git';
if (!existsSync(extra)) {
  mkdirSync(extra);
  git(root, 'init', '--bare', '-b', 'main', bare);
  git(extra, 'init', '-b', 'main');
  git(extra, 'config', 'user.name', 'Kiln Audit Proof'); git(extra, 'config', 'user.email', 'kiln-proof@example.invalid');
  writeFileSync(join(extra, 'README.md'), '# Disposable repository added during Codex work\n');
  for (const [from, to] of [['codex-proof-instructions.txt', 'AGENTS.md']]) copyFileSync(join(source, from), join(extra, to));
  writeFileSync(join(extra, 'CLAUDE.md'), '# Proof repository\nFollow AGENTS.md.\n');
  git(extra, 'add', 'README.md', 'AGENTS.md', 'CLAUDE.md'); git(extra, 'commit', '-m', 'test(proof): seed repository for live addition');
  git(extra, 'remote', 'add', 'origin', bare); git(extra, 'push', 'origin', 'main');
  git(extra, 'remote', 'set-url', 'origin', 'git@github.com:kiln-proof-fixture/kiln-proof-extra.git');
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  git(extra, 'config', 'core.sshCommand', [process.execPath, join(source, 'codex-local-git-ssh.mjs'), root].map(quote).join(' '));
}
const env = { ...process.env, XDG_STATE_HOME: join(root, 'addition-state') };
const workspace = realpathSync(join(root, 'workspace')), main = realpathSync(join(root, 'kiln-proof-api'));
const now = new Date().toISOString();
const paths = { mainCheckoutPath: main, repositoryName: 'kiln-proof-api', folderName: 'slugify', prdDirectoryFromRoot: 'docs/prds/slugify', featureName: 'Disposable Codex addition proof' };
const record = newPrdRecord({ ...paths, github: 'kiln-proof-fixture/kiln-proof-api', settings: { workspaceFolder: workspace, worktreePath: join(workspace, 'kiln-proof-api'), featureBranch: 'kiln-audit-proof', baseBranch: 'main', bases: {}, model: 'opus', effort: 'high', keepAwake: false, resumeAfterUsageLimit: false } });
record.startedAt = now; record.setupCompletedAt = now;
record.repositories = ['kiln-proof-api', 'kiln-proof-shared'].map(name => ({ name, kind: name === 'kiln-proof-api' ? 'prd' : 'named', mainCheckoutPath: realpathSync(join(root, name)), github: `kiln-proof-fixture/${name}`, baseBranch: 'main', worktreePath: join(workspace, name), setupCompletedAt: now }));
record.phases['1'] = { sessionIds: [], finishedByPerson: false, stop: { kind: 'done_check', at: now, checkedAt: now, checks: [] }, repositories: {}, outsideConfirmations: [] };
record.plan = [{ id: '1', title: 'Disposable Codex addition proof', file: 'phase-1-slugify.md', closed: false, repositories: [] }];
const stateDirectory = prdStateDirectory(stateRoot(env), main, paths.repositoryName, paths.prdDirectoryFromRoot);
writePrdRecord(stateDirectory, record);
const lock = await takeInstanceLock(stateRoot(env), stateDirectory);
if (!lock.taken) throw new Error('Cannot acquire disposable addition receiver');
const engine = new Engine({ paths, record, stateDirectory, env, tools: { git: '/usr/bin/git', gh: 'unused-no-gh-command', claude: 'unused-no-session-launch' } });
engine.onChange(() => {
  const added = record.repositories.find(repository => repository.name === 'kiln-proof-extra' && repository.setupCompletedAt);
  if (added) {
    manifest.worktrees = record.repositories.map(repository => repository.worktreePath);
    manifest.repositoryAddedAt = added.addedAt;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  }
});
const server = await startLocalServer({ engine, port: lock.port, folderName: 'slugify', featureName: paths.featureName, token: record.token });
console.log('ADDITION_RECEIVER', server.address, 'XDG_STATE_HOME', env.XDG_STATE_HOME);
async function close() { await server.close(); lock.release(); process.exit(0); }
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
