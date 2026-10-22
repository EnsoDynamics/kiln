// A stand-in for the `gh` executable in Kiln's tests, not part of the main program. It answers
// `gh auth status` and `gh pr list` from KILN_STANDIN_GH_STATE, a JSON file of pull requests
// ({ "pulls": [ … ] }, or { "fail": "message" } to fail), and logs every call's arguments to
// <state>.calls.jsonl so a test can check each carries --repo.

import { appendFileSync, existsSync, readFileSync } from "node:fs";

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
process.stderr.write(`gh stand-in: unsupported ${args.join(" ")}\n`);
process.exit(2);
