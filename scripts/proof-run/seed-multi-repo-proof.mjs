// Seeds the multi-repository proof features into the four proof checkouts for the proof runs
// (Kiln multi-repo delivery PRD AC-PROOF-01; results in docs/design/kiln-multi-repo-proof-run-results.md).
// The checkouts sit side by side in one folder, each on `main` and clean: kiln-proof-plans,
// kiln-proof-api, kiln-proof-web and kiln-proof-shared. It copies ./greeting-card/ (a PRD in a
// repository holding no code, whose phases change kiln-proof-api and kiln-proof-web) to
// kiln-proof-plans/docs/prds/greeting-card/, and ./slugify/ (a one-repository PRD) to
// kiln-proof-api/docs/prds/slugify/. Both technical designs put code in kiln-proof-shared, which no
// phase names, so a session has to add it. It commits each on `main` and pushes nothing.
//
// Usage: node scripts/proof-run/seed-multi-repo-proof.mjs <folder holding the four checkouts>

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/proof-run/seed-multi-repo-proof.mjs <folder holding the four checkouts>");
  process.exit(2);
}
const folder = resolve(target);
const git = (repository, ...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();

const features = [
  { feature: "greeting-card", repository: "kiln-proof-plans" },
  { feature: "slugify", repository: "kiln-proof-api" },
];
for (const name of ["kiln-proof-plans", "kiln-proof-api", "kiln-proof-web", "kiln-proof-shared"]) {
  const repository = join(folder, name);
  if (!existsSync(join(repository, ".git"))) {
    console.error(`${repository} isn't a checkout; clone the four proof repositories into ${folder} first.`);
    process.exit(1);
  }
  if (git(repository, "status", "--porcelain") !== "") {
    console.error(`${repository} has uncommitted changes; seed clean checkouts.`);
    process.exit(1);
  }
  if (git(repository, "branch", "--show-current") !== "main") {
    console.error(`${repository} isn't on main; the proof runs start each feature branch from main.`);
    process.exit(1);
  }
}
for (const { feature, repository: name } of features) {
  const repository = join(folder, name);
  const destination = join(repository, "docs", "prds", feature);
  if (existsSync(destination)) {
    console.error(`${destination} already exists; seed repositories that don't have the proof features yet.`);
    process.exit(1);
  }
  const source = fileURLToPath(new URL(`./${feature}/`, import.meta.url));
  mkdirSync(destination, { recursive: true });
  for (const file of readdirSync(source)) copyFileSync(join(source, file), join(destination, file));
  git(repository, "add", join("docs", "prds", feature));
  git(repository, "commit", "-q", "-m", `docs(${feature}): PRD, technical design and phase plan for the Kiln multi-repo proof`);
  console.log(`Committed docs/prds/${feature}/ in ${name} on main (${git(repository, "rev-parse", "--short", "HEAD")}).`);
}
console.log("Next: git push origin main in kiln-proof-plans and kiln-proof-api.");
