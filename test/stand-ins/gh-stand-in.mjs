// A stand-in for the `gh` executable in Kiln's tests, not part of the main program. It answers
// `gh auth status`, `gh pr view` and `gh pr list` from KILN_STANDIN_GH_STATE, a JSON file of pull requests
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
// `gh pr view <n> --repo github.com/<owner>/<name> --json <fields>`: the pull request's answer from
// the state's "views", keyed "<owner>/<name>#<n>", or an open answer for one in "pulls", in the shape recorded from GitHub
// (test/fixtures/gh/pr-view-states-recorded-2026-11-21.json); { "error": "…" } fails the call, and "viewDelayMs" delays the answer.
if (args[0] === "pr" && args[1] === "view") {
  const state = statePath && existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  // "viewDelayMs" holds the answer that long, so a test can act while a reading is in flight.
  if (state.viewDelayMs) await new Promise((resolve) => setTimeout(resolve, state.viewDelayMs));
  if (state.fail) { process.stderr.write(`${state.fail}\n`); process.exit(1); }
  const key = `${option("--repo")?.replace(/^github\.com\//, "")}#${args[2]}`;
  // A pull request a stand-in session opened, with no recorded answer set, reads as GitHub shows a new one: open.
  const opened = (state.pulls ?? []).find((pull) => `${pull.repo ?? "acme/acme-shop"}#${pull.number}` === key);
  const view = state.views?.[key] ?? (opened && { number: opened.number, state: "OPEN", mergedAt: null, mergeCommit: null, headRefOid: "0".repeat(40), baseRefName: opened.baseRefName, mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN", body: "", url: opened.url, closed: false });
  if (!view) { process.stderr.write(`GraphQL: Could not resolve to a PullRequest with the number of ${args[2]}. (repository.pullRequest)\n`); process.exit(1); }
  if (view.error) { process.stderr.write(`${view.error}\n`); process.exit(1); }
  const fields = option("--json")?.split(",");
  process.stdout.write(`${JSON.stringify(fields ? Object.fromEntries(fields.filter((field) => field in view).map((field) => [field, view[field]])) : view)}\n`);
  process.exit(0);
}
// Paginated commit associations; payload shape is recorded from the real GitHub endpoint.
const endpoint = args.find(arg => arg.startsWith("repos/"));
if (args[0] === "api" && /\/commits\/[0-9a-f]+\/pulls/.test(endpoint ?? "")) {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const historyEvents = process.env.KILN_STANDIN_HISTORY_EVENTS;
  if (historyEvents) appendFileSync(historyEvents, `${JSON.stringify({ event: "start", endpoint })}\n`);
  if (state.historyDelayMs) await new Promise(resolve => setTimeout(resolve, state.historyDelayMs));
  if (historyEvents) appendFileSync(historyEvents, `${JSON.stringify({ event: "end", endpoint })}\n`);
  if (state.historyError) { process.stderr.write(state.historyError); process.exit(1); }
  if (state.rawHistory !== undefined) { process.stdout.write(state.rawHistory); process.exit(0); }
  const sha = endpoint.split("/commits/")[1].split("/")[0];
  const pages = state.commitPullPages?.[sha] ?? [state.commitPulls?.[sha] ?? []];
  process.stdout.write(JSON.stringify(args.includes("--slurp") ? pages : pages[0]));
  process.exit(0);
}

// GitHub compare's recorded contract, computed against the real local bare origin.
// Failure/invalid-response overrides exercise conditions that cannot be requested from GitHub.
if (args[0] === "api" && /^repos\/[^/]+\/[^/]+\/compare\//.test(endpoint ?? "")) {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (state.compareWriteFile) writeFileSync(state.compareWriteFile.path, state.compareWriteFile.content);
  if (state.compareError) { process.stderr.write(state.compareError); process.exit(1); }
  if (state.comparison !== undefined) { process.stdout.write(typeof state.comparison === "string" ? state.comparison : JSON.stringify(state.comparison)); process.exit(0); }
  try {
    const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const origin = git("remote", "get-url", "origin");
    const [base, tip] = endpoint.split("/compare/")[1].split("...").map(decodeURIComponent);
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
