// A stand-in for the `gh` executable in Kiln's tests, not part of the main program. It answers
// `gh auth status` and `gh pr list` from KILN_STANDIN_GH_STATE, a JSON file of pull requests
// ({ "pulls": [ … ] }, or { "fail": "message" } to fail), and logs every call's arguments to
// <state>.calls.jsonl so a test can check each carries --repo.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const statePath = process.env.KILN_STANDIN_GH_STATE;
if (statePath) appendFileSync(`${statePath}.calls.jsonl`, `${JSON.stringify(args)}\n`);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

if (args[0] === "auth" && args[1] === "status") process.exit(0);
if (args[0] === "pr" && args[1] === "list") {
  const state = statePath && existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { pulls: [] };
  if (state.fail) {
    process.stderr.write(`${state.fail}\n`);
    process.exit(1);
  }
  const head = option("--head");
  const base = option("--base");
  // A pull request is in the repository it names, acme/acme-shop unless it says.
  const repo = option("--repo")?.replace(/^github\.com\//, "");
  // As gh does: --state filters (a pull request with no "state" is open; gh's default is open),
  // and --json prints only the fields asked for.
  const wanted = option("--state") ?? "open";
  const fields = option("--json")?.split(",");
  const pulls = state.pulls
    .filter((pull) => pull.headRefName === head && pull.baseRefName === base && (repo === undefined || (pull.repo ?? "acme/acme-shop") === repo))
    .filter((pull) => wanted === "all" || (pull.state ?? "open") === wanted)
    .map((pull) => (fields ? Object.fromEntries(fields.filter((field) => field in pull).map((field) => [field, pull[field]])) : pull));
  process.stdout.write(`${JSON.stringify(pulls)}\n`);
  process.exit(0);
}
// GitHub compare's recorded contract, computed against the real local bare origin.
// Failure/invalid-response overrides exercise conditions that cannot be requested from GitHub.
if (args[0] === "api" && /^repos\/[^/]+\/[^/]+\/compare\//.test(args[1] ?? "")) {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.compareWriteFile) writeFileSync(state.compareWriteFile.path, state.compareWriteFile.content);
  if (state.compareError) { process.stderr.write(state.compareError); process.exit(1); }
  if (state.comparison !== undefined) { process.stdout.write(typeof state.comparison === "string" ? state.comparison : JSON.stringify(state.comparison)); process.exit(0); }
  try {
    const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const origin = git("remote", "get-url", "origin");
    const [base, tip] = args[1].split("/compare/")[1].split("...").map(decodeURIComponent);
    const remoteGit = (...args) => git("--git-dir", origin, ...args);
    const baseCommit = remoteGit("rev-parse", `refs/heads/${base}`);
    const mergeBase = remoteGit("merge-base", baseCommit, tip);
    const [behind, ahead] = remoteGit("rev-list", "--left-right", "--count", `${baseCommit}...${tip}`).split(/\s+/).map(Number);
    process.stdout.write(JSON.stringify({ status: ahead ? (behind ? "diverged" : "ahead") : (behind ? "behind" : "identical"), ahead_by: ahead, behind_by: behind, base_commit: { sha: baseCommit }, merge_base_commit: { sha: mergeBase } }));
    process.exit(0);
  } catch { process.stderr.write("Comparison unavailable"); process.exit(1); }
}
process.stderr.write(`gh stand-in: unsupported ${args.join(" ")}\n`);
process.exit(2);
