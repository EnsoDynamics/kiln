// Exploration script — not part of the main program.
// A macOS (or Linux) rehearsal of the end-to-end proof run (PRD AC-PROOF-01 and AC-PROOF-02),
// with the real Claude Code and the built `kiln run`, on the proof feature Word tally
// (scripts/proof-run/word-tally/). GitHub is stood in for: origin is
// git@github.com:kiln-proof/word-tally.git, reached through an SSH stand-in that serves a local
// bare repository, and `gh` is proof-rehearsal-gh-stand-in.mjs, which keeps pull requests in a
// file. Everything else is real. It is a rehearsal, not the proof: AC-PROOF-01 needs a real
// GitHub repository and a run on Windows (docs/design/kiln-proof-run-steps.md).
//
// What it does, as the proof run's steps do by hand:
//   1. Seeds Word tally with scripts/proof-run/seed-proof-feature.mjs and pushes it.
//   2. Points origin's push URL at a repository that doesn't exist, presses Start; phase 1's
//      push fails, so it stops at Needs you.
//   3. Fixes the push URL, finishes the phase through `claude -p --resume <session ID>` in the
//      worktree (the headless form of the resume command), and presses Check again.
//   4. Phase 2 splits itself (its phase document asks for that); Kiln follows to 2a, then 2b.
//   5. 5 seconds after the next leaf's session is seen working, Ctrl+C: SIGINT to Kiln's process
//      group, as a terminal sends it. Checks the run reads interruptedBy sigint and no claude is left.
//   6. `kiln run` again resumes that session; Kiln carries on to the pull request and Complete.
//   7. AC-PROOF-02: origin has only develop and the feature branch, develop is where it was,
//      the main checkout is untouched, and there is one Kiln worktree.
//
// Usage: npm run build && node scripts/exploration/proof-rehearsal-real-feature.mjs [--out <folder>] [--model sonnet] [--effort medium]
// Writes to <folder>: kiln-1.log, kiln-2.log, snapshot-*.json, *.png, resume.jsonl, results.json.

/* global fetch, WritableStream */
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const out = opt("out", mkdtempSync(join(tmpdir(), "kiln-rehearsal-out-")));
mkdirSync(out, { recursive: true });
const model = opt("model", "sonnet");
const effort = opt("effort", "medium");
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const cli = here("../../dist/cli.js");
if (!existsSync(cli)) throw new Error("Build Kiln first: npm run build");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const log = (line) => console.log(`${new Date().toISOString()}  ${line}`);
const results = { model, effort, steps: {} };
const record = (name, value) => {
  results.steps[name] = value;
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
};

// ---- The repository, its stand-in GitHub, and the stand-in gh ----------------------------------
const root = mkdtempSync(join(tmpdir(), "kiln-rehearsal-"));
const bin = join(root, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "gh"), `#!/bin/sh\nexec "${process.execPath}" "${here("./proof-rehearsal-gh-stand-in.mjs")}" "$@"\n`);
chmodSync(join(bin, "gh"), 0o755);
const github = join(root, "github");
const sshStandIn = join(root, "ssh-stand-in.sh");
// git runs it as `<script> [options] git@github.com "git-upload-pack 'owner/name.git'"`.
writeFileSync(sshStandIn, `#!/bin/sh\nfor last; do :; done\ncd '${github}' && eval "git \${last#git-}"\n`);
chmodSync(sshStandIn, 0o755);
const emptyConfig = join(root, "empty.gitconfig");
writeFileSync(emptyConfig, "");
const ghState = join(root, "gh-state.json");
const env = {
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  GIT_CONFIG_GLOBAL: emptyConfig,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_SSH_COMMAND: `sh '${sshStandIn}'`,
  GIT_AUTHOR_NAME: "Kiln Rehearsal",
  GIT_AUTHOR_EMAIL: "kiln-rehearsal@example.com",
  GIT_COMMITTER_NAME: "Kiln Rehearsal",
  GIT_COMMITTER_EMAIL: "kiln-rehearsal@example.com",
  XDG_STATE_HOME: join(root, "state"),
  KILN_NO_BROWSER: "1",
  KILN_PORT_RANGE: "41320-41329",
  KILN_REHEARSAL_GH_STATE: ghState,
};
const git = (cwd, ...gitArgs) => execFileSync("git", gitArgs, { cwd, env, encoding: "utf8" }).trim();
const ORIGIN = "git@github.com:kiln-proof/word-tally.git";
const bare = join(github, "kiln-proof", "word-tally.git");
mkdirSync(join(github, "kiln-proof"), { recursive: true });
git(root, "init", "-q", "--bare", "-b", "develop", bare);
const repo = join(root, "word-tally");
mkdirSync(repo);
git(repo, "init", "-q", "-b", "develop");
writeFileSync(join(repo, "README.md"), "# Word tally\n\nCounts lines, words and characters.\n");
git(repo, "add", "-A");
git(repo, "commit", "-q", "-m", "initial commit");
git(repo, "remote", "add", "origin", ORIGIN);
log(execFileSync(process.execPath, [here("../proof-run/seed-proof-feature.mjs"), repo], { env, encoding: "utf8" }).trim());
git(repo, "push", "-q", "origin", "develop");
const developAtStart = git(repo, "rev-parse", "develop");
writeFileSync(ghState, JSON.stringify({ repo: "kiln-proof/word-tally", pulls: [] }, null, 2));
log(`repository: ${repo}`);

// ---- Running kiln ------------------------------------------------------------------------------
const startKiln = (name) => {
  const output = createWriteStream(join(out, `${name}.log`));
  // Its own process group, so SIGINT to the group is what a terminal's Ctrl+C sends.
  const child = spawn(process.execPath, [cli, "run", "docs/prds/word-tally"], { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const kiln = { child, text: "", exit: new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal }))) };
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      kiln.text += chunk.toString();
      output.write(chunk);
    });
  }
  return kiln;
};
const until = async (what, condition, ms, kiln) => {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}. Kiln printed:\n${kiln?.text ?? ""}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
};
const connect = async (kiln) => {
  const address = await until("Kiln's address", () => /http:\/\/127\.0\.0\.1:\d+\/word-tally/.exec(kiln.text)?.[0], 120_000, kiln);
  const origin = new URL(address).origin;
  const page = await (await fetch(address)).text();
  const token = /<meta name="kiln-token" content="([^"]+)">/.exec(page)[1];
  const api = async (method, path, body) => {
    const response = await fetch(`${origin}${path}`, { method, headers: { "X-Kiln-Token": token, Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  // A view connects, as the browser would. The stream ends when Kiln stops; that is expected.
  const view = await fetch(`${origin}/api/events?token=${encodeURIComponent(token)}`);
  view.body.pipeTo(new WritableStream()).catch(() => undefined);
  return { address, api, snapshot: async () => (await api("GET", "/api/snapshot")).body };
};
const screenshot = (address, file) => {
  if (!existsSync(chrome)) return;
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${join(out, file)}`, "--window-size=1280,1800", "--timeout=5000", address], { stdio: "ignore" });
};
const save = (name, snapshot) => writeFileSync(join(out, `snapshot-${name}.json`), JSON.stringify(snapshot, null, 2));
const leftOver = (sessionId) =>
  execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.includes(sessionId) || line.includes(repo + "-kiln"))
    .filter((line) => !line.includes(" ps -axo"));
const failWith = async (view, name, snapshot) => {
  save(name, snapshot);
  screenshot(view.address, `${name}.png`);
  record("unexpected", { at: name, state: snapshot.feature.state, needsYou: snapshot.needsYou });
  throw new Error(`Unexpected ${snapshot.feature.state} at ${name}; see ${out}`);
};

// ---- 2. Start with a push that fails -----------------------------------------------------------
git(repo, "config", "remote.origin.pushurl", "git@github.com:kiln-proof/missing.git");
const first = startKiln("kiln-1");
const view1 = await connect(first);
log(`Kiln is at ${view1.address}`);
const found = await until("the base check", async () => {
  const now = await view1.snapshot();
  return now.settings.baseCheck === "ok" ? now : undefined;
}, 120_000, first);
save("documents-found", found);
screenshot(view1.address, "documents-found.png");
record("documentsFound", { plan: found.documents.plan, checks: found.documents.checks });
log(`settings: ${JSON.stringify((await view1.api("POST", "/api/settings", { model, effort })).status)}`);
log(`start: ${JSON.stringify(await view1.api("POST", "/api/start", { refinementConfirmed: true }))}`);

const stopped = await until("phase 1 to stop at Needs you", async () => {
  const now = await view1.snapshot();
  if (now.feature.state === "complete" || (now.feature.state === "needs_you" && now.needsYou.phaseId !== "1")) return failWith(view1, "phase-1-unexpected", now);
  return now.feature.state === "needs_you" ? now : undefined;
}, 45 * 60_000, first);
save("needs-you", stopped);
screenshot(view1.address, "needs-you.png");
record("stop", { phaseId: stopped.needsYou.phaseId, kind: stopped.needsYou.kind, checks: stopped.needsYou.checks, exitCode: stopped.needsYou.exitCode, finalMessage: stopped.needsYou.finalMessage, resumeCommand: stopped.needsYou.resumeCommand });
log(`Needs you: ${JSON.stringify(stopped.needsYou.checks)}`);

// ---- 3. Finished by hand through the resume command, then Check again --------------------------
git(repo, "config", "--unset", "remote.origin.pushurl");
const worktree = stopped.needsYou.resumeCommand.split("\n")[0].replace(/^cd /, "").replace(/^~/, process.env.HOME).replace(/^'(.*)'$/, "$1");
const resumeOut = createWriteStream(join(out, "resume.jsonl"));
const resume = spawn(
  "claude",
  ["-p", "--resume", stopped.needsYou.sessionId, "--output-format", "stream-json", "--verbose", "--permission-mode", "auto", "The push failed because origin's push URL pointed at a repository that doesn't exist; that is fixed now. Finish the phase: push the feature branch to origin, and make sure everything is committed and pushed."],
  { cwd: worktree, env, stdio: ["ignore", "pipe", "inherit"] },
);
resume.stdout.pipe(resumeOut);
const resumeExit = await new Promise((resolve) => resume.once("exit", (code) => resolve(code)));
log(`claude --resume exited ${resumeExit}`);
log(`check again: ${JSON.stringify(await view1.api("POST", "/api/check-again"))}`);

// ---- 4. Phase 2 splits itself; Kiln follows ----------------------------------------------------
const working = (snapshot, exclude) => snapshot.feature.state === "implementing" && snapshot.current?.sessionId && !exclude.includes(snapshot.current.phaseId);
const second = await until("the phase after 1 to start", async () => {
  const now = await view1.snapshot();
  if (now.feature.state === "needs_you" || now.feature.state === "complete") return failWith(view1, "after-check-again-unexpected", now);
  return working(now, ["1"]) ? now : undefined;
}, 10 * 60_000, first);
const phase1 = second.phases.find((phase) => phase.id === "1");
record("checkAgain", { resumeExit, phase1: { state: phase1.state, finishedByPerson: phase1.finishedByPerson, pushedSha: phase1.pushedSha }, nextPhase: second.current.phaseId });
log(`phase 1 ${phase1.state} (finished by person: ${phase1.finishedByPerson}); now phase ${second.current.phaseId}`);

const third = await until("the leaf after it to start", async () => {
  const now = await view1.snapshot();
  if (now.feature.state === "needs_you" || now.feature.state === "complete") return failWith(view1, "second-leaf-unexpected", now);
  return working(now, ["1", "2", "2a"]) ? now : undefined;
}, 60 * 60_000, first);
save("after-split", third);
screenshot(view1.address, "after-split.png");
record("split", { firstSessionPhase: second.current.phaseId, rows: third.phases.map((phase) => ({ id: phase.id, state: phase.state, splitInto: phase.splitInto })), interruptedPhase: third.current.phaseId });
log(`plan now: ${third.phases.map((phase) => `${phase.id}:${phase.state}`).join(" ")}`);

// ---- 5. Ctrl+C partway through that phase ------------------------------------------------------
// A small phase on sonnet takes about a minute, so the Ctrl+C comes 5 seconds after the session
// is first seen working (its latest line), while it is certainly mid-phase.
const before = await until("the session to be seen working", async () => {
  const now = await view1.snapshot();
  if (now.feature.state !== "implementing" || now.current?.phaseId !== third.current.phaseId) return failWith(view1, "before-ctrl-c-unexpected", now);
  return now.current.latestLine ? now : undefined;
}, 10 * 60_000, first);
await new Promise((resolve) => setTimeout(resolve, 5000));
const interruptedSession = before.current.sessionId;
log(`Ctrl+C during phase ${before.current.phaseId}, session ${interruptedSession}`);
process.kill(-first.child.pid, "SIGINT");
const firstExit = await first.exit;
await new Promise((resolve) => setTimeout(resolve, 3000));
const stateFiles = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (readFileSync(path, "utf8").includes("interruptedBy")) stateFiles.push(path);
  }
};
walk(join(root, "state"));
const interruptedBy = stateFiles.flatMap((path) => [...readFileSync(path, "utf8").matchAll(/"interruptedBy":\s*"(\w+)"/g)].map((match) => match[1]));
record("ctrlC", { phaseId: before.current.phaseId, sessionId: interruptedSession, kilnExit: firstExit, lastLines: first.text.trim().split("\n").slice(-3), interruptedBy, leftOver: leftOver(interruptedSession), worktreeStatus: git(worktree, "status", "--porcelain") });
log(`Kiln exited ${JSON.stringify(firstExit)}; interruptedBy ${JSON.stringify(interruptedBy)}; left over: ${JSON.stringify(leftOver(interruptedSession))}`);

// ---- 6. kiln run again resumes it, and carries on to Complete ----------------------------------
const again = startKiln("kiln-2");
const view2 = await connect(again);
const resumed = await until("the interrupted session to resume", async () => {
  const now = await view2.snapshot();
  return now.current?.sessionId || now.feature.state !== "implementing" ? now : undefined;
}, 5 * 60_000, again);
record("resume", { phaseId: resumed.current?.phaseId, sessionId: resumed.current?.sessionId, sameSession: resumed.current?.sessionId === interruptedSession, terminal: again.text.trim().split("\n").slice(0, 8) });
log(`resumed phase ${resumed.current?.phaseId}, same session: ${resumed.current?.sessionId === interruptedSession}`);

const complete = await until("Complete", async () => {
  const now = await view2.snapshot();
  if (now.feature.state === "needs_you" || now.feature.state === "paused") return failWith(view2, "before-complete-unexpected", now);
  return now.feature.state === "complete" ? now : undefined;
}, 120 * 60_000, again);
save("complete", complete);
screenshot(view2.address, "complete.png");
record("complete", { pullRequest: complete.pullRequest, rows: complete.phases.map((phase) => ({ id: phase.id, state: phase.state, pushedSha: phase.pushedSha, finishedByPerson: phase.finishedByPerson })) });

// ---- 7. AC-PROOF-02: every session stayed on Kiln's branch and worktree -------------------------
const branches = git(bare, "for-each-ref", "--format=%(refname:short)", "refs/heads").split("\n");
record("branches", {
  originBranches: branches,
  developUnchanged: git(bare, "rev-parse", "develop") === developAtStart,
  mainCheckout: { branch: git(repo, "branch", "--show-current"), head: git(repo, "rev-parse", "HEAD") === developAtStart, status: git(repo, "status", "--porcelain") },
  worktrees: git(repo, "worktree", "list", "--porcelain").split("\n").filter((line) => line.startsWith("worktree ") || line.startsWith("branch ")),
  pullRequests: JSON.parse(readFileSync(ghState, "utf8")).pulls.map((pull) => ({ number: pull.number, head: pull.headRefName, base: pull.baseRefName, isDraft: pull.isDraft, title: pull.title })),
  testsPass: (() => {
    try {
      execFileSync("node", ["--test"], { cwd: worktree, env, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })(),
});
log(`branches on origin: ${branches.join(", ")}`);

process.kill(-again.child.pid, "SIGINT");
record("kilnExitAtEnd", await again.exit);
log(`done; results in ${out}`);
