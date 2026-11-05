// Exploration script — not part of the main program.
// Runs proof gate 3, the stop path (docs/design/kiln-architecture-proposal.md, "Proof gates"),
// against the real Claude Code with the built `kiln run`: a one-phase PRD in a throwaway
// repository whose push needs a credential that isn't there, so the phase stops at Needs you;
// then the phase is finished by hand through `claude --resume` (headless, `-p`), and Check again
// lets Kiln continue. A pause requested while the phase works holds once it is Done, so no
// pull-request session starts (AC-VIEW-03).
//
// `origin` must be on GitHub for the start checks, so a stand-in `git` first on the PATH answers
// `git remote get-url origin` with a GitHub address; every other git call is the real one. The
// repository's `url.<bare>.insteadOf` sends fetches to a local bare repository, and its push URL
// points at a GitHub repository with no credential for it (no credential helper: the global and
// system Git configuration are left out), so `git push` fails the way a missing credential does.
//
// Usage: npm run build && node scripts/exploration/proof-gate-3-stop-path.mjs [--out <folder>] [--model sonnet] [--effort medium]
// Writes to <folder>: kiln.log, snapshot-needs-you.json, needs-you.png, resume.jsonl,
// snapshot-after-check-again.json, after-check-again.png, results.json.

/* global fetch, WritableStream */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, chmodSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const out = opt("out", mkdtempSync(join(tmpdir(), "kiln-gate-3-out-")));
mkdirSync(out, { recursive: true });
const model = opt("model", "sonnet");
const effort = opt("effort", "medium");
const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
if (!existsSync(cli)) throw new Error("Build Kiln first: npm run build");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
const GITHUB = "https://github.com/kiln-gate/greeting.git";
const MISSING = "https://github.com/kiln-gate-missing/greeting.git";
const log = (line) => console.log(`${new Date().toISOString()}  ${line}`);

// ---- The throwaway repository --------------------------------------------------------------
const root = mkdtempSync(join(tmpdir(), "kiln-gate-3-"));
const bin = join(root, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "git"), `#!/bin/sh\nif [ "$#" -eq 3 ] && [ "$1" = remote ] && [ "$2" = get-url ] && [ "$3" = origin ]; then echo ${GITHUB}; exit 0; fi\nexec ${realGit} "$@"\n`);
chmodSync(join(bin, "git"), 0o755);
const emptyConfig = join(root, "empty.gitconfig");
writeFileSync(emptyConfig, "");
const env = {
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  GIT_CONFIG_GLOBAL: emptyConfig,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Kiln Gate",
  GIT_AUTHOR_EMAIL: "kiln-gate@example.com",
  GIT_COMMITTER_NAME: "Kiln Gate",
  GIT_COMMITTER_EMAIL: "kiln-gate@example.com",
  XDG_STATE_HOME: join(root, "state"),
  KILN_NO_BROWSER: "1",
  KILN_PORT_RANGE: "41310-41319",
};
const git = (cwd, ...gitArgs) => execFileSync(realGit, gitArgs, { cwd, env, encoding: "utf8" });
const bare = join(root, "origin.git");
git(root, "init", "-q", "--bare", "-b", "develop", bare);
const repo = join(root, "greeting");
mkdirSync(repo);
git(repo, "init", "-q", "-b", "develop");
const prd = join(repo, "docs", "prds", "greeting-cli");
mkdirSync(prd, { recursive: true });
writeFileSync(join(repo, "README.md"), "# Greeting\n\nA tiny shell tool.\n");
writeFileSync(
  join(prd, "greeting-cli-prd.md"),
  `# PRD: Greeting CLI

## Summary

A shell script that greets a person by name.

## Acceptance Criteria

- [ ] **AC-GREET-01 — Greets by name.** \`./greet.sh Ada\` prints \`Hello, Ada!\` and exits 0.
- [ ] **AC-GREET-02 — Needs a name.** \`./greet.sh\` with no name prints \`Usage: greet.sh <name>\` to stderr and exits 2.

## Out of Scope

Anything else.
`,
);
writeFileSync(
  join(prd, "technical-design.md"),
  `# Technical Design: Greeting CLI

One POSIX shell script, \`greet.sh\`, at the repository root (AC-GREET-01, AC-GREET-02), tested by \`test-greet.sh\`, which runs it and checks its output and exit code.
`,
);
writeFileSync(
  join(prd, "phase-1-greet-script.md"),
  `# Phase 1: The greet script

**Parent PRD:** docs/prds/greeting-cli/greeting-cli-prd.md
**Technical design:** docs/prds/greeting-cli/technical-design.md

## Summary
The whole PRD: \`greet.sh\` and its test.

## Acceptance criteria covered
AC-GREET-01, AC-GREET-02

## Phase dependencies
None
`,
);
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "docs: greeting CLI PRD");
git(repo, "remote", "add", "origin", bare);
git(repo, "push", "-q", "origin", "develop");
// Fetches go to the bare repository; pushes to a GitHub repository nobody has a credential for.
git(repo, "remote", "set-url", "origin", GITHUB);
git(repo, "config", `url.${bare}.insteadOf`, GITHUB);
git(repo, "config", "remote.origin.pushurl", MISSING);
log(`throwaway repository: ${repo}`);

// ---- kiln run --------------------------------------------------------------------------------
const kilnLog = createWriteStream(join(out, "kiln.log"));
const kiln = spawn(process.execPath, [cli, "run", "docs/prds/greeting-cli"], { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
let kilnText = "";
for (const stream of [kiln.stdout, kiln.stderr]) {
  stream.on("data", (chunk) => {
    kilnText += chunk.toString();
    kilnLog.write(chunk);
  });
}
const kilnExit = new Promise((resolve) => kiln.once("exit", (code, signal) => resolve({ code, signal })));
const until = async (what, condition, ms) => {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}. Kiln printed:\n${kilnText}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};
const address = await until("Kiln's address", () => /http:\/\/127\.0\.0\.1:\d+\/greeting-cli/.exec(kilnText)?.[0], 60_000);
const origin = new URL(address).origin;
const page = await (await fetch(address)).text();
const token = /<meta name="kiln-token" content="([^"]+)">/.exec(page)[1];
const api = async (method, path, body) => {
  const response = await fetch(`${origin}${path}`, { method, headers: { "X-Kiln-Token": token, Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
};
const snapshot = async () => (await api("GET", "/api/snapshot")).body;
const screenshot = (file) => execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${join(out, file)}`, "--window-size=1280,1800", "--timeout=5000", address], { stdio: "ignore" });
log(`Kiln is at ${address}`);

// A view connects, as the browser would; its base check runs.
const view = await fetch(`${origin}/api/events?token=${encodeURIComponent(token)}`);
// The stream ends when Kiln stops at the end of the gate; that is expected, not a failure.
view.body.pipeTo(new WritableStream()).catch(() => undefined);
await until("the base check", async () => (await snapshot()).settings.baseCheck === "ok", 120_000);
log(`settings: ${JSON.stringify(await api("POST", "/api/settings", { model, effort }))}`);
log(`start: ${JSON.stringify(await api("POST", "/api/start", { refinementConfirmed: true }))}`);
const working = await until("the session to start", async () => {
  const now = await snapshot();
  return now.current?.sessionId ? now : undefined;
}, 180_000);
log(`phase ${working.current.phaseId} working, session ${working.current.sessionId}`);
log(`pause: ${JSON.stringify(await api("POST", "/api/pause"))}`);

// ---- The stop --------------------------------------------------------------------------------
const stopped = await until("Needs you", async () => {
  const now = await snapshot();
  return now.feature.state === "needs_you" ? now : undefined;
}, 30 * 60_000);
writeFileSync(join(out, "snapshot-needs-you.json"), JSON.stringify(stopped, null, 2));
screenshot("needs-you.png");
log(`Needs you: ${JSON.stringify(stopped.needsYou.checks)}`);

// ---- Finished by hand through claude --resume ------------------------------------------------
git(repo, "config", "--unset", "remote.origin.pushurl");
const worktree = stopped.needsYou.resumeCommand.split("\n")[0].replace(/^cd /, "").replace(/^~/, process.env.HOME);
const resumeOut = createWriteStream(join(out, "resume.jsonl"));
const resume = spawn(
  "claude",
  ["-p", "--resume", stopped.needsYou.sessionId, "--output-format", "stream-json", "--verbose", "--permission-mode", "auto", "The push failed because a credential was missing; that is fixed now. Finish the phase: push the branch to origin, and make sure everything is committed and pushed."],
  { cwd: worktree, env, stdio: ["ignore", "pipe", "inherit"] },
);
resume.stdout.pipe(resumeOut);
const resumed = await new Promise((resolve) => resume.once("exit", (code) => resolve(code)));
log(`claude --resume exited ${resumed}`);

// ---- Check again ----------------------------------------------------------------------------
log(`check again: ${JSON.stringify(await api("POST", "/api/check-again"))}`);
// The pause requested while the phase worked holds once it is Done (AC-VIEW-03). With no leaf
// left, Kiln first checks GitHub for a pull request (up to 2 minutes), then pauses before the
// pull-request session (UI-008).
const after = await until("Kiln to pause", async () => {
  const now = await snapshot();
  return now.feature.state === "paused" || now.feature.state === "needs_you" ? now : undefined;
}, 5 * 60_000);
writeFileSync(join(out, "snapshot-after-check-again.json"), JSON.stringify(after, null, 2));
screenshot("after-check-again.png");
log(`after Check again: state ${after.feature.state}, phase 1 ${JSON.stringify(after.phases.find((phase) => phase.id === "1"))}`);

kiln.kill("SIGINT");
const exit = await kilnExit;
writeFileSync(
  join(out, "results.json"),
  JSON.stringify({ repo, address, model, effort, stoppedChecks: stopped.needsYou.checks, finalMessage: stopped.needsYou.finalMessage, exitCode: stopped.needsYou.exitCode, resumeCommand: stopped.needsYou.resumeCommand, resumeExit: resumed, stateAfterCheckAgain: after.feature.state, phaseAfter: after.phases.find((phase) => phase.id === "1"), kilnExit: exit }, null, 2),
);
log(`done; results in ${out}`);
