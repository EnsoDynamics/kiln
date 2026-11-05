// Exploration script — not part of the main program.
// A stand-in `gh` for the macOS rehearsal of the proof run (proof-rehearsal-real-feature.mjs),
// where GitHub is a local bare repository: it keeps pull requests in the JSON file named by
// KILN_REHEARSAL_GH_STATE and answers the calls Kiln and its sessions make: `auth status`,
// `repo view`, `pr create`, `pr list`, `pr view` and `pr ready`. Every call is logged to
// <state>.calls.jsonl. Anything else exits 1 saying it isn't supported, as a gh error would.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const statePath = process.env.KILN_REHEARSAL_GH_STATE;
if (!statePath) {
  process.stderr.write("gh stand-in: KILN_REHEARSAL_GH_STATE isn't set\n");
  process.exit(1);
}
appendFileSync(`${statePath}.calls.jsonl`, `${JSON.stringify({ cwd: process.cwd(), args })}\n`);
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { repo: "kiln-proof/word-tally", pulls: [] };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const option = (...names) => {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index !== -1) return args[index + 1];
    const joined = args.find((arg) => arg.startsWith(`${name}=`));
    if (joined) return joined.slice(name.length + 1);
  }
  return undefined;
};
const git = (...gitArgs) => execFileSync("git", gitArgs, { encoding: "utf8" }).trim();
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};
const pick = (pull, fields) => (fields ? Object.fromEntries(fields.split(",").map((field) => [field, pull[field]])) : pull);
const [group, command] = args;

if (group === "auth" && command === "status") {
  process.stdout.write("github.com\n  ✓ Logged in to github.com account kiln-proof (stand-in)\n");
  process.exit(0);
}
if (group === "repo" && command === "view") {
  const view = { name: state.repo.split("/")[1], nameWithOwner: state.repo, url: `https://github.com/${state.repo}`, defaultBranchRef: { name: "develop" } };
  process.stdout.write(`${JSON.stringify(option("--json") ? pick(view, option("--json")) : view)}\n`);
  process.exit(0);
}
if (group === "pr" && command === "create") {
  const head = option("--head", "-H") ?? git("branch", "--show-current");
  const base = option("--base", "-B") ?? "develop";
  if (state.pulls.some((pull) => pull.headRefName === head && pull.baseRefName === base && pull.state === "OPEN")) {
    fail(`a pull request for branch "${head}" into branch "${base}" already exists`);
  }
  try {
    git("fetch", "-q", "origin");
  } catch {
    // The diff below then uses whatever origin refs the checkout already has.
  }
  const range = `origin/${base}...origin/${head}`;
  let shortstat;
  try {
    shortstat = git("diff", "--shortstat", range);
  } catch {
    fail(`pull request create failed: head branch "${head}" isn't on GitHub`);
  }
  const number = 100 + state.pulls.length + 1;
  const bodyFile = option("--body-file", "-F");
  const pull = {
    number,
    title: option("--title", "-t") ?? git("log", "-1", "--format=%s", `origin/${head}`),
    body: bodyFile ? readFileSync(bodyFile, "utf8") : (option("--body", "-b") ?? ""),
    url: `https://github.com/${state.repo}/pull/${number}`,
    state: "OPEN",
    isDraft: args.includes("--draft") || args.includes("-d"),
    isCrossRepository: false,
    headRefName: head,
    baseRefName: base,
    additions: Number(/(\d+) insertion/.exec(shortstat)?.[1] ?? 0),
    deletions: Number(/(\d+) deletion/.exec(shortstat)?.[1] ?? 0),
    commits: git("rev-list", `origin/${base}..origin/${head}`).split("\n").filter(Boolean).map((oid) => ({ oid })),
  };
  state.pulls.push(pull);
  save();
  process.stdout.write(`${pull.url}\n`);
  process.exit(0);
}
if (group === "pr" && command === "list") {
  const head = option("--head", "-H");
  const base = option("--base", "-B");
  const wanted = (option("--state", "-s") ?? "open").toUpperCase();
  const pulls = state.pulls.filter((pull) => (!head || pull.headRefName === head) && (!base || pull.baseRefName === base) && (wanted === "ALL" || pull.state === wanted));
  const fields = option("--json");
  process.stdout.write(fields ? `${JSON.stringify(pulls.map((pull) => pick(pull, fields)))}\n` : pulls.map((pull) => `${pull.number}\t${pull.title}\t${pull.headRefName}\t${pull.state}\n`).join(""));
  process.exit(0);
}
if (group === "pr" && (command === "view" || command === "ready")) {
  const target = args[2] && !args[2].startsWith("-") ? args[2] : git("branch", "--show-current");
  const pull = state.pulls.find((candidate) => String(candidate.number) === target.replace(/^#/, "") || candidate.url === target || candidate.headRefName === target);
  if (!pull) fail(`no pull requests found for branch "${target}"`);
  if (command === "ready") {
    pull.isDraft = false;
    save();
    process.stdout.write(`✓ Pull request #${pull.number} is marked as "ready for review"\n`);
    process.exit(0);
  }
  const fields = option("--json");
  process.stdout.write(fields ? `${JSON.stringify(pick(pull, fields))}\n` : `${pull.title} #${pull.number}\n${pull.state} • ${pull.headRefName} → ${pull.baseRefName}\n\n${pull.body}\n\n${pull.url}\n`);
  process.exit(0);
}
fail(`gh stand-in: "gh ${args.join(" ")}" isn't supported in this rehearsal`);
