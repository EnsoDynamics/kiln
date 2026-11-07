import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { metadata, packageName } from './release.mjs';

const destination = process.argv[2];
if (!destination) throw new Error('Supply the directory for the release archive and checksum.');
const root = process.cwd();
const current = metadata(root);
// The release publishes this archive without rebuilding, so a release candidate must hold a release build (AC-HELP-03).
if (process.env.KILN_RELEASE_BUILD === 'true' && JSON.parse(readFileSync(join(root, 'dist', 'build-info.json'), 'utf8')).kind !== 'release') throw new Error('KILN_RELEASE_BUILD is true, but dist/ holds a development build; build again with it set.');
mkdirSync(destination, { recursive: true });
const result = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', resolve(destination)], { cwd: root, encoding: 'utf8', timeout: 60_000 });
if (result.status !== 0) throw new Error(`npm pack failed: ${result.stderr}`);
const packed = JSON.parse(result.stdout);
const filename = `ensodynamics-kiln-${current.version}.tgz`;
if (packed.length !== 1 || packed[0].name !== packageName || packed[0].version !== current.version || packed[0].filename !== filename) throw new Error('npm packed an unexpected package.');
const digest = createHash('sha256').update(readFileSync(join(destination, filename))).digest('hex');
writeFileSync(join(destination, 'SHA256SUMS'), `${digest}  ${filename}\n`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `filename=${filename}\n`, { flag: 'a' });
console.log(`Packed ${filename}; SHA-256 ${digest}.`);
