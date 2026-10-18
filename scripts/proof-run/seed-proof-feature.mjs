// Seeds the proof feature, Word tally, into a repository checkout for the end-to-end proof run
// (PRD AC-PROOF-01; steps in docs/design/kiln-proof-run-steps.md). It copies the refined PRD,
// technical design and three-phase plan in ./word-tally/ to docs/prds/word-tally/, and writes a
// CLAUDE.md telling every session to work directly on the checked-out branch and never create a
// feature branch or worktree: the instruction AC-PROOF-02 says Kiln's sessions must not follow.
// It commits both on that branch and pushes nothing: the steps push it.
//
// Usage: node scripts/proof-run/seed-proof-feature.mjs <repository checkout>

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/proof-run/seed-proof-feature.mjs <repository checkout>");
  process.exit(2);
}
const repository = resolve(target);
const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();

if (git("status", "--porcelain") !== "") {
  console.error(`${repository} has uncommitted changes; seed a clean checkout.`);
  process.exit(1);
}
const destination = join(repository, "docs", "prds", "word-tally");
const instructions = join(repository, "CLAUDE.md");
for (const path of [destination, instructions]) {
  if (existsSync(path)) {
    console.error(`${path} already exists; seed a repository that doesn't have the proof feature yet.`);
    process.exit(1);
  }
}
const branch = git("branch", "--show-current");

const source = fileURLToPath(new URL("./word-tally/", import.meta.url));
mkdirSync(destination, { recursive: true });
for (const file of readdirSync(source)) copyFileSync(join(source, file), join(destination, file));
writeFileSync(instructions, `# Working in this repository\n\nAlways work directly on the \`${branch}\` branch in this checkout. Never create feature branches or worktrees.\n`);
git("add", "docs/prds/word-tally", "CLAUDE.md");
git("commit", "-q", "-m", "docs(word-tally): PRD, technical design, phase plan and working instructions");

console.log(`Committed docs/prds/word-tally/ and CLAUDE.md on ${branch} (${git("rev-parse", "--short", "HEAD")}).`);
console.log(`Next: git push origin ${branch}, then kiln run docs/prds/word-tally`);
