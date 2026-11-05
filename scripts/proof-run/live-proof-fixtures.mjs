// Release proof helper, not part of the main program. The live proofs run on any Claude Code at
// or above the minimum (AC-AGENT-01) and record the contracts they observed as fixtures named for
// that version, which CI replays through the real adapter and the packaged hook.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compareToMinimum, requirement } from '../../dist/agents/tooling-minimums.js';

/**
 * The Claude Code the proofs run: `claude` from PATH, or KILN_LIVE_PROOF_CLAUDE. Under `npm run`
 * PATH starts with node_modules/.bin, whose `claude` is the development dependency pinned to the
 * minimum, so proving the newest installed Claude Code names it here.
 */
export const proofClaude = process.env.KILN_LIVE_PROOF_CLAUDE || 'claude';

/** The proof Claude Code's version, refused below the minimum or when Kiln can't read it. */
export function claudeProofVersion() {
  const reading = compareToMinimum('claudeCode', execFileSync(proofClaude, ['--version'], { encoding: 'utf8', timeout: 10000 }));
  if (reading.state !== 'supported') throw new Error(`Use ${requirement('claudeCode')} for provider proof.`);
  return reading.version;
}

/**
 * Writes `test/fixtures/live-control/<name>` once: an existing fixture is recorded evidence and is
 * never overwritten. Local paths (the proof folder, the temporary folder, the home folder) are
 * replaced so the fixture names no machine. Returns the fixture's path.
 */
export function recordFixture(name, { cliVersion, command, script, root, projection, body }) {
  const path = fileURLToPath(new URL(`../../test/fixtures/live-control/${name}`, import.meta.url));
  if (existsSync(path)) return path;
  const provenance = { capturedAt: new Date().toISOString(), cliVersion, platform: process.platform, command, scriptSha256: createHash('sha256').update(readFileSync(fileURLToPath(script))).digest('hex'), projection };
  writeFileSync(path, `${redact(JSON.stringify({ provenance, ...body }, null, 2), root)}\n`);
  return path;
}

function redact(text, root) {
  const real = (path) => { try { return realpathSync(path); } catch { return path; } };
  // Claude Code also names a project folder after its path, with every other character a hyphen.
  const mangled = (path) => path.replace(/[^A-Za-z0-9]/g, '-');
  const replacements = [[root, '<proof-root>'], [real(root), '<proof-root>'], [mangled(root), '<proof-root>'], [mangled(real(root)), '<proof-root>'], [tmpdir(), '<tmp>'], [real(tmpdir()), '<tmp>'], [homedir(), '~']]
    .sort((a, b) => b[0].length - a[0].length);
  for (const [path, placeholder] of replacements) text = text.split(path).join(placeholder);
  return text;
}
