import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { afterEach, test } from 'node:test';
import { parse } from 'yaml';
import { checkRelease, compareVersions, installHooks, metadata, packageName, prepareRelease, publishedVersions, publishingReadiness, releaseNotes, versionParts } from './release.mjs';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

test('workflow policy keeps development cheap and gates release jobs and the exact archive', () => {
  const ci = parse(readFileSync(join(sourceRoot, '.github/workflows/ci.yml'), 'utf8'));
  const release = parse(readFileSync(join(sourceRoot, '.github/workflows/release.yml'), 'utf8'));
  const evaluate = (expression, context) => runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), context, { timeout: 100 });
  const ancestors = (jobs, name) => {
    const direct = [jobs[name].needs ?? []].flat();
    return [...new Set(direct.flatMap(parent => [parent, ...ancestors(jobs, parent)]))];
  };
  assert.deepEqual(ci.on.push.branches, ['develop']);
  assert.deepEqual(release.on.push.branches, ['main']);
  assert.equal(release.on.push.tags, undefined, 'generated tags must not rerun the release');
  const scope = ci.jobs.preflight.steps.find(step => step.id === 'scope').env.FULL_CHECKS;
  for (const [fullInput, baseRef, expected] of [[false, '', false], [false, 'develop', false], [false, 'main', true], [true, '', true]]) {
    const full = evaluate(scope, { inputs: { full: fullInput }, github: { base_ref: baseRef } });
    assert.equal(full, expected);
    const context = { needs: { preflight: { outputs: { full: String(full) } } } };
    const runners = Object.entries(ci.jobs).filter(([name, job]) => name !== 'preflight' && (!job.if || evaluate(job.if, context))).map(([, job]) => job['runs-on']).sort();
    assert.deepEqual(runners, expected ? ['macos-latest', 'macos-latest', 'ubuntu-latest', 'windows-latest'] : ['ubuntu-latest', 'ubuntu-latest']);
  }
  // npm run verify is verify:development plus the integration suite, which four shards split on each platform.
  const scripts = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8')).scripts;
  assert.equal(scripts.verify, `${scripts['verify:development']} && npm run test:integration`);
  const developmentPackage = ci.jobs.build.steps.find(step => step.run === 'npm run test:package');
  assert.ok(ci.jobs.build.steps.some(step => step.run === 'npm run verify:development' && !step.if), 'every build runs everything but the integration suite');
  assert.ok(developmentPackage);
  for (const [name, runner, full] of [['integration', 'ubuntu-latest', 'false'], ['macos-integration', 'macos-latest', 'true']]) {
    const job = ci.jobs[name];
    assert.equal(job['runs-on'], runner);
    assert.equal(evaluate(job.if, { needs: { preflight: { outputs: { full } } } }), true, 'development runs the integration suite on Ubuntu; main keeps it on macOS');
    assert.deepEqual(job.strategy.matrix.shard, [1, 2, 3, 4]);
    assert.equal(job.strategy['fail-fast'], false);
    assert.ok(job.steps.some(step => step.run === 'npm run test:integration -- --shard=${{ matrix.shard }}/4'), 'the shards together run every integration file');
  }
  for (const full of ['false', 'true']) {
    const context = { needs: { preflight: { outputs: { full } } } };
    assert.equal(evaluate(developmentPackage.if, context), full === 'false');
  }
  const developmentPackIndex = ci.jobs.build.steps.findIndex(step => step.id === 'pack');
  assert.ok(developmentPackIndex >= 0 && developmentPackIndex < ci.jobs.build.steps.indexOf(developmentPackage));
  assert.equal(developmentPackage.env.KILN_PACKAGE_TARBALL, '${{ runner.temp }}/kiln-package/${{ steps.pack.outputs.filename }}');
  assert.equal(ci.jobs.build['timeout-minutes'], 20);
  assert.ok(ci.jobs.macos.steps.some(step => step.run === 'npm run verify:development'));
  assert.ok(ci.jobs.windows.steps.some(step => step.run === 'npm run build'));
  assert.ok(ci.jobs.windows.steps.some(step => step.run === 'npm pack --ignore-scripts'));
  for (const name of Object.keys(ci.jobs).filter(name => name !== 'preflight')) assert.ok(ancestors(ci.jobs, name).includes('preflight'), `${name} must wait for package/version checks`);
  assert.ok(ancestors(ci.jobs, 'macos').includes('build'), 'macOS must wait for the candidate archive');
  for (const name of ['verify', 'publish']) assert.ok(ancestors(release.jobs, name).includes('preflight'));
  assert.ok(ancestors(release.jobs, 'publish').includes('verify'));
  assert.ok(release.jobs.preflight.steps.some(step => step.run === 'node scripts/release.mjs preflight'));
  const candidate = ci.jobs.preflight.steps.find(step => step.run === 'node scripts/release.mjs candidate');
  assert.ok(candidate);
  assert.equal(evaluate(candidate.if, { steps: { scope: { outputs: { full: 'true' } } } }), true);
  assert.equal(release.jobs.verify.uses, './.github/workflows/ci.yml');
  assert.equal(release.jobs.verify.with.full, true);
  assert.equal(release.jobs.publish.if, undefined, 'every push to main that passes verification publishes');
  assert.deepEqual(release.jobs.publish.needs, ['preflight', 'verify']);
  assert.equal(release.concurrency['cancel-in-progress'], false);
  assert.equal(evaluate(ci.concurrency['cancel-in-progress'], { github: { event_name: 'push', ref: 'refs/heads/main' } }), false);

  const upload = ci.jobs.build.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  const macDownload = ci.jobs.macos.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  const publishDownload = release.jobs.publish.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.ok(upload && macDownload && publishDownload);
  assert.equal(macDownload.with.name, upload.with.name);
  assert.equal(publishDownload.with.name, upload.with.name);
  assert.equal(ci.on.workflow_call.outputs.filename.value, '${{ jobs.build.outputs.filename }}');
  const installed = ci.jobs.macos.steps.find(step => step.run === 'npm run test:package');
  // Candidate archives are release builds, and the installed candidate must print the plain version (AC-HELP-03).
  assert.equal(ci.jobs.build.env.KILN_RELEASE_BUILD, '${{ needs.preflight.outputs.full }}');
  assert.equal(ci.jobs.macos.env.KILN_RELEASE_BUILD, 'true');
  const published = release.jobs.publish.steps.find(step => step.run?.startsWith('npm publish '));
  assert.equal(installed.env.KILN_PACKAGE_TARBALL, '${{ runner.temp }}/kiln-package/${{ needs.build.outputs.filename }}');
  assert.equal(published.env.PACKAGE_FILE, '${{ runner.temp }}/kiln-package/${{ needs.verify.outputs.filename }}');
  assert.match(published.run, /npm publish "\$PACKAGE_FILE"/);
  assert.match(published.run, /--ignore-scripts/);
  assert.ok(!release.jobs.publish.steps.some(step => /npm (?:run build|ci)/.test(step.run ?? '')), 'publishing cannot rebuild a different archive');
  for (const [steps, operation, checksum] of [[ci.jobs.macos.steps, installed, 'shasum -a 256 -c SHA256SUMS'], [release.jobs.publish.steps, published, 'sha256sum --check SHA256SUMS']]) {
    const check = steps.findIndex(step => step.run === checksum);
    assert.ok(check >= 0 && check < steps.indexOf(operation), 'checksum must be checked before installation/publication');
  }
});

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function writeVersion(root, version, notes = `What changed in ${version}.`, unreleased = '') {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: packageName, version, publishConfig: { access: 'public' }, repository: { url: 'git+https://github.com/EnsoDynamics/kiln.git' } }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ name: packageName, version, lockfileVersion: 3, packages: { '': { name: packageName, version } } }));
  if (notes === null) return ['package.json', 'package-lock.json'];
  writeFileSync(join(root, 'CHANGELOG.md'), `# Changelog\n\n## [Unreleased]\n\n${unreleased}\n\n## [${version}] - 2026-11-01\n\n${notes}\n\n## [0.9.0] - 2026-10-01\n\nAn older release.\n`);
  return ['package.json', 'package-lock.json', 'CHANGELOG.md'];
}

function fixture(version = '1.0.0') {
  const root = mkdtempSync(join(tmpdir(), 'kiln-release-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Release fixture');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'add', '--', ...(version ? writeVersion(root, version) : (writeFileSync(join(root, 'initial.txt'), 'Before application scaffolding.'), ['initial.txt'])));
  git(root, 'commit', '-m', 'Initial release fixture');
  const base = git(root, 'rev-parse', 'HEAD');
  const save = (next, notes) => {
    git(root, 'add', '--', ...writeVersion(root, next, notes));
    git(root, 'commit', '-m', `Prepare ${next}`);
    return git(root, 'rev-parse', 'HEAD');
  };
  return { root, base, save };
}

function origin(root) {
  const remote = mkdtempSync(join(tmpdir(), 'kiln-release-origin-'));
  cleanups.push(() => rmSync(remote, { recursive: true, force: true }));
  git(remote, 'init', '--bare', '-b', 'main');
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-u', 'origin', 'main');
  return remote;
}

async function registry({ status = 200, body = { name: packageName, versions: {} } } = {}) {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    assert.equal(request.method, 'GET');
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return { url: `http://127.0.0.1:${server.address().port}`, requests: () => requests };
}

test('stable versions compare numerically and reject ambiguous versions', () => {
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  for (const value of ['1.0', '01.0.0', '1.0.0-beta.1', '1.0.0+metadata', '9007199254740992.0.0']) assert.throws(() => versionParts(value));
});

test('reads the pushed Git object even when the working tree contains a newer version', async () => {
  const { root, base } = fixture();
  writeVersion(root, '1.0.1');
  assert.equal(metadata(root).version, '1.0.1');
  assert.equal(metadata(root, 'HEAD').version, '1.0.0');
  await assert.rejects(checkRelease({ root, base }), /must be greater/);
});

test('lockfile disagreement fails before consulting the registry', async () => {
  const f = fixture();
  f.save('1.0.1');
  const lock = JSON.parse(readFileSync(join(f.root, 'package-lock.json'), 'utf8'));
  lock.packages[''].version = '1.0.0';
  writeFileSync(join(f.root, 'package-lock.json'), JSON.stringify(lock));
  git(f.root, 'add', '--', 'package-lock.json'); git(f.root, 'commit', '-m', 'Broken lock fixture');
  const npm = await registry();
  await assert.rejects(checkRelease({ root: f.root, base: f.base, registryUrl: npm.url }), /versions must agree/);
  assert.equal(npm.requests(), 0);
});

test('accepts the first unpublished version over the initial main scaffold', async () => {
  const f = fixture(null); f.save('1.0.0');
  const npm = await registry({ status: 404, body: { error: 'Not found' } });
  assert.equal((await checkRelease({ root: f.root, base: f.base, registryUrl: npm.url })).version, '1.0.0');
  assert.equal(npm.requests(), 1);
});

test('accepts an advanced version and rejects duplicates, regression and existing tags', async () => {
  const f = fixture(); f.save('1.0.1');
  const npm = await registry({ body: { name: packageName, versions: { '1.0.0': {} } } });
  assert.equal((await checkRelease({ root: f.root, base: f.base, registryUrl: npm.url })).version, '1.0.1');
  await assert.rejects(checkRelease({ root: f.root, tag: 'v1.0.2', registryUrl: npm.url }), /must match/);
  const duplicate = await registry({ body: { name: packageName, versions: { '1.0.1': {} } } });
  await assert.rejects(checkRelease({ root: f.root, registryUrl: duplicate.url }), /already published/);
  const later = await registry({ body: { name: packageName, versions: { '1.1.0': {} } } });
  await assert.rejects(checkRelease({ root: f.root, registryUrl: later.url }), /newer than every/);
  git(f.root, 'tag', 'v1.0.1');
  await assert.rejects(checkRelease({ root: f.root, registryUrl: npm.url }), /already exists/);
});

// AC-NOTES-02: a version without written notes is refused before the registry or any platform check.
test('rejects a version with no changelog section or an empty one before consulting the registry', async () => {
  for (const notes of [null, '', ' \n\t\n']) {
    const f = fixture(); f.save('1.0.1', notes);
    const npm = await registry({ body: { name: packageName, versions: { '1.0.0': {} } } });
    await assert.rejects(checkRelease({ root: f.root, base: f.base, registryUrl: npm.url }), /no written release notes\. Add a "## \[1\.0\.1\]" section to CHANGELOG\.md/);
    assert.equal(npm.requests(), 0);
  }
  // Notes only in the working tree do not count: the check reads the candidate commit.
  const f = fixture(); f.save('1.0.1', null);
  writeVersion(f.root, '1.0.1');
  await assert.rejects(checkRelease({ root: f.root, base: f.base, registryUrl: (await registry()).url }), /no written release notes/);
  const done = fixture(); done.save('1.0.1');
  assert.equal((await checkRelease({ root: done.root, base: done.base, registryUrl: (await registry({ body: { name: packageName, versions: { '1.0.0': {} } } })).url })).notes, 'What changed in 1.0.1.');
});

test('a release\'s notes are its changelog section, up to the next one', () => {
  const changelog = '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A new thing.\n\n## [1.2.0] - 2026-11-20\n\n### Fixed\n\n- A fix.\n\n## [1.1.0] - 2026-11-01\n\n- Older.\n';
  assert.equal(releaseNotes(changelog, 'Unreleased'), '### Added\n\n- A new thing.');
  assert.equal(releaseNotes(changelog, '1.2.0'), '### Fixed\n\n- A fix.');
  assert.equal(releaseNotes(changelog, '1.1.0'), '- Older.');
  assert.equal(releaseNotes(changelog, '1.1'), '', 'a version is matched whole');
  assert.equal(releaseNotes(changelog, '1.3.0'), '');
});

test('the release workflow publishes the changelog section instead of generating notes, and the changelog has a section for every published version', () => {
  const release = parse(readFileSync(join(sourceRoot, '.github/workflows/release.yml'), 'utf8'));
  const steps = release.jobs.publish.steps;
  const create = steps.find(step => step.run?.startsWith('gh release create '));
  const write = steps.find(step => step.run?.startsWith('node scripts/release.mjs notes '));
  assert.ok(create && write);
  assert.doesNotMatch(create.run, /--generate-notes/);
  assert.match(write.run, /notes "\$RELEASE_VERSION" > "\$RUNNER_TEMP\/kiln-release-notes\.md"$/);
  assert.match(create.run, /--notes-file "\$RUNNER_TEMP\/kiln-release-notes\.md"/);
  const checkout = steps.findIndex(step => step.uses?.startsWith('actions/checkout@'));
  assert.ok(checkout >= 0 && checkout < steps.indexOf(write) && steps.indexOf(write) < steps.indexOf(create), 'the notes are read from the release commit checked out before the release is created');
  const changelog = readFileSync(join(sourceRoot, 'CHANGELOG.md'), 'utf8');
  for (const version of ['1.0.0', '1.0.2', '1.0.3', '1.1.0', '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.6']) assert.ok(releaseNotes(changelog, version), version);
  assert.match(changelog, /^## \[Unreleased\]$/m);
});

test('the notes command prints a version\'s section and refuses a missing one', () => {
  const f = fixture();
  const script = join(sourceRoot, 'scripts', 'release.mjs');
  const printed = spawnSync(process.execPath, [script, 'notes', '1.0.0'], { cwd: f.root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout, 'What changed in 1.0.0.\n');
  const missing = spawnSync(process.execPath, [script, 'notes', '1.0.1'], { cwd: f.root, encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /no section for 1\.0\.1/);
});

test('registry failures and unexpected contracts never imply an unpublished version', async () => {
  for (const config of [
    { status: 401, body: { error: 'unauthorized' } },
    { status: 503, body: { error: 'unavailable' } },
    { status: 404, body: { error: 'something else' } },
    { status: 200, body: {} },
    { status: 200, body: 'not JSON' },
  ]) {
    const npm = await registry(config);
    await assert.rejects(publishedVersions(npm.url), /registry|metadata/);
  }
});

test('preparation bumps both package files once, moves Unreleased to the version, and preserves an intentional higher version', async () => {
  const f = fixture(); origin(f.root);
  writeVersion(f.root, '1.0.0', 'What changed in 1.0.0.', '### Fixed\n\n- A fix since 1.0.0.');
  const npm = await registry({ body: { name: packageName, versions: { '1.0.0': {} } } });
  await prepareRelease(f.root, undefined, { registryUrl: npm.url, today: '2026-11-20' });
  assert.equal(metadata(f.root).version, '1.0.1');
  const changelog = readFileSync(join(f.root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-11-20\n\n### Fixed/);
  assert.equal(releaseNotes(changelog, 'Unreleased'), '');
  assert.equal(releaseNotes(changelog, '1.0.1'), '### Fixed\n\n- A fix since 1.0.0.');
  assert.equal(releaseNotes(changelog, '1.0.0'), 'What changed in 1.0.0.');
  // Preparing again keeps the version and its section as they are.
  await prepareRelease(f.root, undefined, { registryUrl: npm.url, today: '2026-11-21' });
  assert.equal(metadata(f.root).version, '1.0.1');
  assert.equal(readFileSync(join(f.root, 'CHANGELOG.md'), 'utf8'), changelog);
  writeVersion(f.root, '1.1.0');
  await prepareRelease(f.root, undefined, { registryUrl: npm.url });
  assert.equal(metadata(f.root).version, '1.1.0');
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.base, 'preparation creates no commit or tag');
  assert.equal(git(f.root, 'tag', '--list'), '');
});

test('preparation refuses when Unreleased is empty and the version has no section, changing nothing', async () => {
  const f = fixture(); origin(f.root);
  const npm = await registry({ body: { name: packageName, versions: { '1.0.0': {} } } });
  const before = readFileSync(join(f.root, 'CHANGELOG.md'), 'utf8');
  await assert.rejects(prepareRelease(f.root, undefined, { registryUrl: npm.url }), /nothing under Unreleased to release as 1\.0\.1/);
  assert.equal(metadata(f.root).version, '1.0.0');
  assert.equal(readFileSync(join(f.root, 'CHANGELOG.md'), 'utf8'), before);
});

test('first preparation retains 1.0.0 and explicit minor/major choices remain deliberate', async () => {
  const f = fixture(null); origin(f.root); f.save('1.0.0');
  const npm = await registry({ status: 404, body: { error: 'Not found' } });
  await prepareRelease(f.root, undefined, { registryUrl: npm.url });
  assert.equal(metadata(f.root).version, '1.0.0');
  writeVersion(f.root, '1.0.0', 'What changed in 1.0.0.', '- New work.');
  await prepareRelease(f.root, 'minor', { registryUrl: npm.url });
  assert.equal(metadata(f.root).version, '1.1.0');
  writeFileSync(join(f.root, 'CHANGELOG.md'), readFileSync(join(f.root, 'CHANGELOG.md'), 'utf8').replace('## [Unreleased]\n', '## [Unreleased]\n\n- More work.\n'));
  await prepareRelease(f.root, 'major', { registryUrl: npm.url });
  assert.equal(metadata(f.root).version, '2.0.0');
  const changelog = readFileSync(join(f.root, 'CHANGELOG.md'), 'utf8');
  assert.equal(releaseNotes(changelog, '1.1.0'), '- New work.');
  assert.equal(releaseNotes(changelog, '2.0.0'), '- More work.');
});

test('the installed Git hook rejects a real stale-version main push and permits development', () => {
  const f = fixture(); origin(f.root);
  mkdirSync(join(f.root, '.githooks')); mkdirSync(join(f.root, 'scripts'));
  copyFileSync(join(sourceRoot, '.githooks', 'pre-push'), join(f.root, '.githooks', 'pre-push'));
  copyFileSync(join(sourceRoot, 'scripts', 'release.mjs'), join(f.root, 'scripts', 'release.mjs'));
  installHooks(f.root);
  writeFileSync(join(f.root, 'change.txt'), 'A product change without a version increase.');
  git(f.root, 'add', '--', 'change.txt'); git(f.root, 'commit', '-m', 'Unversioned change');
  const before = git(f.root, 'rev-parse', 'HEAD');
  const pushed = spawnSync('git', ['push', 'origin', 'main'], { cwd: f.root, encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(pushed.status, 0);
  assert.match(pushed.stderr, /must be greater/);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), before);
  git(f.root, 'push', 'origin', 'HEAD:refs/heads/develop');
  const remote = git(f.root, 'ls-remote', 'origin', 'refs/heads/main');
  assert.ok(remote.startsWith(f.base), 'the rejected push leaves remote main unchanged');
});

test('hook installation preserves other hooks and refuses a conflicting push hook', () => {
  const f = fixture(); mkdirSync(join(f.root, '.githooks'));
  copyFileSync(join(sourceRoot, '.githooks', 'pre-push'), join(f.root, '.githooks', 'pre-push'));
  writeFileSync(join(f.root, '.git', 'hooks', 'pre-commit'), '# Existing pre-commit\n');
  installHooks(f.root); installHooks(f.root);
  assert.equal(readFileSync(join(f.root, '.git', 'hooks', 'pre-commit'), 'utf8'), '# Existing pre-commit\n');
  writeFileSync(join(f.root, '.git', 'hooks', 'pre-push'), '# Existing push hook\n');
  assert.throws(() => installHooks(f.root), /unrelated pre-push/);
  git(f.root, 'config', 'core.hooksPath', 'custom-hooks');
  assert.throws(() => installHooks(f.root), /core.hooksPath/);
});

test('an explicit worktree installation guards shared pushes and can be replaced after landing', () => {
  const f = fixture(); origin(f.root);
  mkdirSync(join(f.root, '.githooks'));
  copyFileSync(join(sourceRoot, '.githooks', 'pre-push'), join(f.root, '.githooks', 'pre-push'));
  git(f.root, 'add', '--', '.githooks/pre-push'); git(f.root, 'commit', '-m', 'Add hook source');
  const linked = join(f.root, 'linked');
  git(f.root, 'worktree', 'add', '-b', 'parallel-fixture', linked);
  assert.throws(() => installHooks(linked), /--from-worktree/);
  assert.equal(existsSync(join(f.root, '.git', 'hooks', 'pre-push')), false);
  installHooks(linked, { fromWorktree: true });
  const pushed = spawnSync('git', ['push', 'origin', 'main'], { cwd: f.root, encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(pushed.status, 0);
  assert.match(pushed.stderr, /must be greater/);
  installHooks(f.root);
  assert.equal(readFileSync(join(f.root, '.git', 'hooks', 'pre-push'), 'utf8'), readFileSync(join(f.root, '.githooks', 'pre-push'), 'utf8'));
});

test('visibility, credential and authentication-mode checks are explicit', async () => {
  await assert.rejects(publishingReadiness({ isPrivate: true }), /public/);
  await assert.rejects(publishingReadiness({ isPrivate: false, mode: 'token' }), /NPM_TOKEN is missing/);
  await assert.rejects(publishingReadiness({ isPrivate: false, mode: 'wrong' }), /NPM_AUTH_MODE/);
  await assert.rejects(publishingReadiness({ isPrivate: false, mode: 'trusted' }), /OIDC access is unavailable/);
  const valid = await registry({ body: { username: 'doug-ensodynamics' } });
  await publishingReadiness({ isPrivate: false, mode: 'token', token: 'synthetic-token', registryUrl: valid.url });
  const invalid = await registry({ status: 401, body: { error: 'synthetic-sensitive-error' } });
  await assert.rejects(publishingReadiness({ isPrivate: false, mode: 'token', token: 'synthetic-token', registryUrl: invalid.url }), error => /authentication/.test(error.message) && !error.message.includes('synthetic-sensitive'));
});

test('trusted readiness exchanges identity over HTTP and rejects an unconfigured publisher', async () => {
  const requests = [];
  let accepted = true;
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/identity?')) {
      response.end(JSON.stringify({ value: 'synthetic-oidc-identity' }));
    } else {
      response.statusCode = accepted ? 201 : 401;
      response.end(JSON.stringify(accepted ? { token_type: 'oidc', token: 'synthetic-exchange-token', expires: new Date(Date.now() + 60_000).toISOString() } : { error: 'unconfigured publisher' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const options = { isPrivate: false, mode: 'trusted', registryUrl: url, oidcUrl: `${url}/identity`, oidcRequestToken: 'synthetic-request-token' };
  await publishingReadiness(options);
  assert.equal(requests[0].method, 'GET');
  assert.equal(new URL(`${url}${requests[0].url}`).searchParams.get('audience'), 'npm:registry.npmjs.org');
  assert.equal(requests[0].authorization, 'Bearer synthetic-request-token');
  assert.deepEqual(requests[1], { method: 'POST', url: `/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(packageName)}`, authorization: 'Bearer synthetic-oidc-identity' });
  accepted = false;
  await assert.rejects(publishingReadiness(options), /trusted-publisher authentication failed/);
});
