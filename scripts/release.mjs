import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const packageName = '@ensodynamics/kiln';
const registry = 'https://registry.npmjs.org';
const zero = /^0+$/;

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

export function versionParts(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected a stable major.minor.patch version, received ${JSON.stringify(version)}.`);
  }
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version numbers exceed the supported integer range.');
  return parts;
}

export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

function commit(root, ref) {
  return git(root, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`);
}

export function metadata(root, ref) {
  const sha = ref ? commit(root, ref) : undefined;
  const read = file => JSON.parse(sha ? git(root, 'show', `${sha}:${file}`) : readFileSync(join(root, file), 'utf8'));
  const pkg = read('package.json'), lock = read('package-lock.json');
  versionParts(pkg.version);
  if (pkg.name !== packageName || lock.name !== packageName || lock.packages?.['']?.name !== packageName) {
    throw new Error(`Package and lockfile must name ${packageName}.`);
  }
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error('package.json and both package-lock.json root versions must agree.');
  }
  if (pkg.private === true || pkg.publishConfig?.access !== 'public' || pkg.repository?.url !== 'git+https://github.com/EnsoDynamics/kiln.git') {
    throw new Error('Expected a public @ensodynamics/kiln package from EnsoDynamics/kiln.');
  }
  return { pkg, lock, version: pkg.version, sha };
}

function baseVersion(root, ref) {
  if (!ref || zero.test(ref)) return undefined;
  const sha = commit(root, ref);
  // main predates the application before the first release; a missing package is valid there.
  if (!git(root, 'ls-tree', '--name-only', sha, '--', 'package.json')) return undefined;
  const pkg = JSON.parse(git(root, 'show', `${sha}:package.json`));
  versionParts(pkg.version);
  return pkg.version;
}

async function registryRequest(path, registryUrl, token, method = 'GET') {
  const response = await globalThis.fetch(`${registryUrl}${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  // Never include response bodies in errors: authentication responses may contain sensitive data.
  let body;
  try { body = await response.json(); } catch { throw new Error(`npm registry returned invalid JSON (HTTP ${response.status}).`); }
  return { response, body };
}

export async function publishedVersions(registryUrl = registry) {
  const { response, body } = await registryRequest(`/${encodeURIComponent(packageName)}`, registryUrl);
  if (response.status === 404 && body?.error === 'Not found') return [];
  if (!response.ok) throw new Error(`Cannot read npm package metadata (HTTP ${response.status}).`);
  if (body?.name !== packageName || !body.versions || typeof body.versions !== 'object' || Array.isArray(body.versions)) {
    throw new Error('npm registry returned an unexpected package metadata contract.');
  }
  return Object.keys(body.versions);
}

/** Where each version's written release notes live; the release publishes them on its GitHub Release. */
export const releaseNotesPath = version => `docs/release/notes/kiln-release-notes-${version}.md`;

/** Every release needs written notes at the candidate commit (AC-NOTES-02), read from Git objects as the hook checks. */
function requireReleaseNotes(root, { version, sha }) {
  const path = releaseNotesPath(version);
  const listed = git(root, 'ls-tree', '--name-only', sha ?? commit(root, 'HEAD'), '--', path);
  const notes = listed ? git(root, 'show', `${sha ?? commit(root, 'HEAD')}:${path}`) : '';
  if (!notes.trim()) throw new Error(`Release ${version} has no written release notes. Write ${path} and commit it.`);
  return path;
}

export async function checkRelease({ root, ref = 'HEAD', base, registryUrl = registry, tag }) {
  const current = metadata(root, ref);
  current.notesPath = requireReleaseNotes(root, current);
  const previous = baseVersion(root, base);
  if (previous && compareVersions(current.version, previous) <= 0) {
    throw new Error(`Release version ${current.version} must be greater than main's ${previous}. Run npm run release:prepare and commit both package files.`);
  }
  if (tag && tag !== `v${current.version}`) throw new Error(`Tag ${tag} must match v${current.version}.`);
  if (!tag && git(root, 'tag', '--list', `v${current.version}`)) throw new Error(`Tag v${current.version} already exists; choose a new release version.`);
  const versions = await publishedVersions(registryUrl);
  if (versions.includes(current.version)) throw new Error(`${packageName}@${current.version} is already published; run npm run release:prepare.`);
  const stable = versions.filter(v => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v));
  if (stable.some(v => compareVersions(current.version, v) <= 0)) throw new Error('Release version must be newer than every published stable version.');
  return current;
}

export async function prepareRelease(root, increment, { registryUrl = registry } = {}) {
  if (increment && !['patch', 'minor', 'major'].includes(increment)) throw new Error('Use release:prepare with patch, minor or major.');
  git(root, 'fetch', 'origin', 'main', '--tags');
  const current = metadata(root);
  const versions = await publishedVersions(registryUrl);
  const stable = versions.filter(v => /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v));
  const previous = baseVersion(root, 'origin/main');
  if (previous) stable.push(previous);
  const baseline = stable.sort(compareVersions).at(-1);
  if (baseline && compareVersions(current.version, baseline) < 0) throw new Error(`Local version ${current.version} is behind ${baseline}; update the checkout before preparing a release.`);
  let version = current.version;
  if (increment || (baseline && compareVersions(version, baseline) === 0)) {
    const parts = versionParts(version);
    const index = { major: 0, minor: 1, patch: 2 }[increment ?? 'patch'];
    parts[index]++;
    for (let i = index + 1; i < 3; i++) parts[i] = 0;
    version = parts.join('.');
    versionParts(version);
  }
  if (versions.includes(version) || git(root, 'tag', '--list', `v${version}`)) throw new Error(`Version ${version} is already used; choose a new version intentionally.`);
  if (version !== current.version) {
    current.pkg.version = current.lock.version = current.lock.packages[''].version = version;
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(current.pkg, null, 2)}\n`);
    writeFileSync(join(root, 'package-lock.json'), `${JSON.stringify(current.lock, null, 2)}\n`);
  }
  console.log(`Release version ${version}${version === current.version ? ' retained' : ' prepared'}. Review and commit both package files before releasing.`);
}

export function installHooks(root = process.cwd(), { fromWorktree = false } = {}) {
  const common = resolve(root, git(root, 'rev-parse', '--git-common-dir'));
  const directory = resolve(root, git(root, 'rev-parse', '--git-dir'));
  const linked = common !== directory;
  if (linked && !fromWorktree) throw new Error('Install from the shared checkout, or explicitly use --from-worktree and keep this worktree until the gate is reinstalled from the shared checkout.');
  const configured = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' });
  if (configured.status !== 0 && configured.status !== 1) throw new Error('Cannot inspect Git hook configuration.');
  if (configured.stdout.trim()) throw new Error('An existing core.hooksPath is configured; integrate Kiln’s pre-push gate there rather than replacing it.');
  let source = readFileSync(join(root, '.githooks', 'pre-push'), 'utf8');
  if (linked) {
    const script = `'${fileURLToPath(import.meta.url).replaceAll("'", "'\\''")}'`;
    source = source.replace('"$(git rev-parse --show-toplevel)/scripts/release.mjs"', script);
  }
  const target = join(common, 'hooks', 'pre-push');
  if (existsSync(target) && !readFileSync(target, 'utf8').startsWith('#!/bin/sh\n# Kiln release version gate\n')) throw new Error('An unrelated pre-push hook exists; it has not been overwritten.');
  writeFileSync(target, source, { mode: 0o755 });
  chmodSync(target, 0o755);
  console.log(`Installed Kiln’s local pre-push version gate${linked ? '; keep this worktree until reinstalling the gate from the landed shared checkout' : ''}.`);
}

export async function prePush(root, input) {
  for (const line of input.trim().split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4) throw new Error('Malformed Git pre-push input.');
    const [, sha, remoteRef, oldSha] = fields;
    if (zero.test(sha)) continue;
    if (!remoteRef.startsWith('refs/heads/') && !remoteRef.startsWith('refs/tags/v')) continue;
    metadata(root, sha);
    if (remoteRef === 'refs/heads/main' || remoteRef.startsWith('refs/tags/v')) {
      const tag = remoteRef.startsWith('refs/tags/') ? remoteRef.slice(10) : undefined;
      await checkRelease({ root, ref: sha, base: tag ? undefined : oldSha, tag });
    }
  }
}

export async function publishingReadiness({ enabled, mode, token, isPrivate, registryUrl = registry, oidcUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN }) {
  if (enabled !== 'true' && enabled !== 'false') throw new Error('NPM_PUBLISH_ENABLED must be true or false.');
  if (enabled === 'false') return false;
  if (isPrivate !== false) throw new Error('Provenance publishing requires the approved repository to be public.');
  if (mode === 'token') {
    if (!token) throw new Error('NPM_TOKEN is missing. Configure the restricted initial-publish secret before releasing.');
    const { response, body } = await registryRequest('/-/whoami', registryUrl, token);
    if (!response.ok || body?.username !== 'doug-ensodynamics') throw new Error(`npm token authentication for doug-ensodynamics failed (HTTP ${response.status}).`);
  } else if (mode === 'trusted') {
    if (!oidcUrl || !oidcRequestToken) throw new Error('GitHub OIDC access is unavailable; preflight requires id-token: write.');
    const requestUrl = new URL(oidcUrl);
    requestUrl.searchParams.set('audience', 'npm:registry.npmjs.org');
    const identity = await globalThis.fetch(requestUrl, { headers: { authorization: `Bearer ${oidcRequestToken}` }, signal: globalThis.AbortSignal.timeout(15_000) });
    if (!identity.ok) throw new Error(`Cannot obtain GitHub OIDC identity (HTTP ${identity.status}).`);
    const { value } = await identity.json();
    if (typeof value !== 'string' || !value) throw new Error('GitHub returned an invalid OIDC identity contract.');
    // Prove that npm accepts this workflow identity before starting the costly jobs.
    // The publish job obtains its own fresh token; this one is never saved or logged.
    const { response, body } = await registryRequest(`/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(packageName)}`, registryUrl, value, 'POST');
    if (response.status !== 201 || body?.token_type !== 'oidc' || typeof body.token !== 'string' || !body.token || !(Date.parse(body.expires) > Date.now())) {
      throw new Error(`npm trusted-publisher authentication failed (HTTP ${response.status}).`);
    }
  } else throw new Error('NPM_AUTH_MODE must explicitly select token or trusted.');
  return true;
}

async function main() {
  const root = process.cwd();
  const [command, argument] = process.argv.slice(2);
  if (command === 'metadata') console.log(`Package metadata agrees at ${metadata(root, argument ?? 'HEAD').version}.`);
  else if (command === 'prepare') await prepareRelease(root, argument);
  else if (command === 'install-hooks') installHooks(root, { fromWorktree: argument === '--from-worktree' });
  else if (command === 'pre-push') await prePush(root, readFileSync(0, 'utf8'));
  else if (command === 'candidate') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const base = event.pull_request?.base?.sha ?? event.before;
    const current = await checkRelease({ root, base });
    console.log(`Release version ${current.version} is unused and valid.`);
  } else if (command === 'preflight') {
    if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Releases run only on main.');
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const current = await checkRelease({ root, base: event.before });
    const publish = await publishingReadiness({ enabled: process.env.NPM_PUBLISH_ENABLED, mode: process.env.NPM_AUTH_MODE, token: process.env.NODE_AUTH_TOKEN, isPrivate: event.repository?.private });
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
    writeFileSync(process.env.GITHUB_OUTPUT, `version=${current.version}\npublish=${publish}\n`, { flag: 'a' });
    console.log(`Release ${current.version} preflight passed; publication ${publish ? 'enabled' : 'held'}.`);
  } else throw new Error('Use metadata, prepare, install-hooks, pre-push, candidate or preflight.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Release check failed: ${error.message}`); process.exitCode = 1; });
}
