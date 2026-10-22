// Exploration script — not part of the main program.
// The proof runs of Kiln multi-repo delivery (PRD AC-PROOF-01) on macOS, with the built
// `kiln run`, the real Claude Code and real GitHub repositories: the four EnsoDynamics/kiln-proof-*
// repositories, checked out side by side in one folder and seeded by
// scripts/proof-run/seed-multi-repo-proof.mjs. Nothing is stood in for. It drives Kiln through its
// local HTTP API, as the browser view does, and records what it saw.
//
// --run greeting-card: the PRD in kiln-proof-plans (no code). Phase 1 changes kiln-proof-api;
//   phase 2 names kiln-proof-api and kiln-proof-web, and its technical design puts the name helper
//   in kiln-proof-shared, which no phase names, so the session adds it. Runs to Complete, then
//   checks on GitHub that every repository that changed has its own open pull request.
// --run slugify: the one-repository PRD in kiln-proof-api, whose session adds kiln-proof-shared.
//   kiln-proof-api's push URL points at a repository that doesn't exist, so phase 1 stops at
//   Needs you. The driver unsets the push URL; the person's resume turn (`claude -p --resume`, with
//   acceptEdits and kiln-proof-shared's own checkout added) pushes and, asked to, writes a file in
//   that checkout with the Write tool (Kiln doesn't judge other shell commands; PRD OUT-002's table).
//   Check again then fails Stayed in the workspace. The person removes that file, ticks the
//   confirmation and presses Check again (AC-OUTSIDE-03); the run carries on to Complete.
//
// Kiln's state goes under <out>/state, apart from the person's own. A `kiln` on PATH runs this
// checkout's build, so the sessions' `kiln add-repository` reaches the Kiln under test.
//
// Usage: npm run build && node scripts/exploration/proof-multi-repo-real-runs.mjs --run greeting-card|slugify --checkouts <folder> [--branch feature/<run>] [--out <folder>] [--model sonnet] [--effort medium]
// Writes to <out>: kiln.log, snapshot-*.json, *.png, resume.jsonl, results.json.

/* global fetch, WritableStream */
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const run = opt("run");
if (run !== "greeting-card" && run !== "slugify") throw new Error("--run greeting-card or --run slugify");
const checkouts = resolve(opt("checkouts", join(process.env.HOME, "devel", "kiln-proof")));
const out = resolve(opt("out") ?? mkdtempSync(join(tmpdir(), `kiln-proof-${run}-`)));
mkdirSync(out, { recursive: true });
const model = opt("model", "sonnet");
const effort = opt("effort", "medium");
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const cli = here("../../dist/cli.js");
if (!existsSync(cli)) throw new Error("Build Kiln first: npm run build");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const log = (line) => console.log(`${new Date().toISOString()}  ${line}`);
const results = { run, model, effort, claude: execFileSync("claude", ["--version"], { encoding: "utf8" }).trim(), steps: {} };
const record = (name, value) => {
  results.steps[name] = value;
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
};

const bin = join(out, "bin");
mkdirSync(bin, { recursive: true });
writeFileSync(join(bin, "kiln"), `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
chmodSync(join(bin, "kiln"), 0o755);
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, XDG_STATE_HOME: join(out, "state"), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: "41330-41339" };
delete env.CLAUDE_CODE_SKIP_PROMPT_HISTORY;
const git = (cwd, ...gitArgs) => execFileSync("git", gitArgs, { cwd, env, encoding: "utf8" }).trim();
const prdRepository = join(checkouts, run === "greeting-card" ? "kiln-proof-plans" : "kiln-proof-api");
const prdPath = `docs/prds/${run}`;
const branch = opt("branch", `feature/${run}`);
const repositoryNames = ["kiln-proof-plans", "kiln-proof-api", "kiln-proof-web", "kiln-proof-shared"];
const mainAtStart = Object.fromEntries(repositoryNames.map((name) => [name, git(join(checkouts, name), "rev-parse", "origin/main")]));

// ---- Running kiln (as the v1 rehearsal does) ---------------------------------------------------
const startKiln = () => {
  const output = createWriteStream(join(out, "kiln.log"));
  const child = spawn(process.execPath, [cli, "run", prdPath], { cwd: prdRepository, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  const kiln = { child, text: "", exit: new Promise((done) => child.once("exit", (code, signal) => done({ code, signal }))) };
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
    await new Promise((done) => setTimeout(done, 3000));
  }
};
const connect = async (kiln) => {
  const address = await until("Kiln's address", () => new RegExp(`http://127\\.0\\.0\\.1:\\d+/${run}`).exec(kiln.text)?.[0], 120_000, kiln);
  const origin = new URL(address).origin;
  const page = await (await fetch(address)).text();
  const token = /<meta name="kiln-token" content="([^"]+)">/.exec(page)[1];
  const api = async (method, path, body) => {
    const response = await fetch(`${origin}${path}`, { method, headers: { "X-Kiln-Token": token, Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const view = await fetch(`${origin}/api/events?token=${encodeURIComponent(token)}`);
  view.body.pipeTo(new WritableStream()).catch(() => undefined);
  return { address, api, snapshot: async () => (await api("GET", "/api/snapshot")).body };
};
const screenshot = (address, file) => {
  if (!existsSync(chrome)) return;
  // The view's live event stream never lets the page go idle, so Chrome gets a hard deadline.
  try {
    execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${join(out, file)}`, "--window-size=1280,2000", "--timeout=8000", address], { stdio: "ignore", timeout: 60_000 });
  } catch (error) {
    log(`screenshot ${file} failed: ${error.message.split("\n")[0]}`);
  }
};
const save = (name, snapshot) => writeFileSync(join(out, `snapshot-${name}.json`), JSON.stringify(snapshot, null, 2));
const failWith = (view, name, snapshot) => {
  save(name, snapshot);
  screenshot(view.address, `${name}.png`);
  record("unexpected", { at: name, state: snapshot.feature.state, needsYou: snapshot.needsYou });
  throw new Error(`Unexpected ${snapshot.feature.state} at ${name}; see ${out}`);
};
const pullRequestsOnGitHub = () =>
  Object.fromEntries(
    repositoryNames.map((name) => [
      name,
      JSON.parse(execFileSync("gh", ["pr", "list", "--repo", `EnsoDynamics/${name}`, "--head", branch, "--state", "all", "--json", "number,state,isDraft,url,baseRefName,title"], { encoding: "utf8" })),
    ]),
  );
const commitsOnBranch = () =>
  Object.fromEntries(
    repositoryNames.map((name) => {
      const repository = join(checkouts, name);
      git(repository, "fetch", "-q", "origin");
      const exists = git(repository, "ls-remote", "--heads", "origin", branch) !== "";
      return [name, exists ? Number(git(repository, "rev-list", "--count", `origin/main..origin/${branch}`)) : 0];
    }),
  );

// ---- Documents found, then Start ---------------------------------------------------------------
if (run === "slugify") {
  git(prdRepository, "config", "remote.origin.pushurl", "https://github.com/EnsoDynamics/kiln-proof-missing.git");
  // Never leave the person's own checkout pushing nowhere, however the run ends.
  process.on("exit", () => {
    try {
      git(prdRepository, "config", "--unset", "remote.origin.pushurl");
    } catch {
      // Already unset.
    }
  });
}
const kiln = startKiln();
const view = await connect(kiln);
log(`Kiln is at ${view.address}`);
const found = await until("the base check", async () => {
  const now = await view.snapshot();
  return now.settings.baseCheck === "ok" ? now : undefined;
}, 120_000, kiln);
save("documents-found", found);
screenshot(view.address, "documents-found.png");
record("documentsFound", { plan: found.documents.plan, checks: found.documents.checks, repositories: found.repositories, terminal: kiln.text.trim().split("\n").slice(0, 3) });
log(`settings: ${(await view.api("POST", "/api/settings", { model, effort, featureBranch: branch })).status}`);
// A settings change checks the base branch again, and Start is refused until that check ends.
await until("the base check after the settings change", async () => ((await view.snapshot()).settings.baseCheck === "ok" ? true : undefined), 120_000, kiln);
log(`start: ${JSON.stringify(await view.api("POST", "/api/start", { refinementConfirmed: true }))}`);

// ---- slugify: the stop, the outside edit, and clearing it ---------------------------------------
if (run === "slugify") {
  const stopped = await until("phase 1 to stop at Needs you", async () => {
    const now = await view.snapshot();
    if (now.feature.state === "complete") return failWith(view, "phase-1-unexpected", now);
    return now.feature.state === "needs_you" ? now : undefined;
  }, 45 * 60_000, kiln);
  save("needs-you-push", stopped);
  screenshot(view.address, "needs-you-push.png");
  record("stop", { phaseId: stopped.needsYou.phaseId, checks: stopped.needsYou.checks, finalMessage: stopped.needsYou.finalMessage, resumeCommand: stopped.needsYou.resumeCommand, repositories: stopped.repositories });
  log(`Needs you: ${JSON.stringify(stopped.needsYou.checks)}`);

  git(prdRepository, "config", "--unset", "remote.origin.pushurl");
  const sharedCheckout = join(checkouts, "kiln-proof-shared");
  const notes = join(sharedCheckout, "NOTES.md");
  const sessionFolder = stopped.needsYou.resumeCommand.split("\n")[0].replace(/^cd /, "").replace(/^'(.*)'$/, "$1").replace(/^~/, process.env.HOME);
  const resumeOut = createWriteStream(join(out, "resume.jsonl"));
  const resume = spawn(
    "claude",
    [
      // The prompt comes before --add-dir, which takes every folder after it.
      "-p", "--resume", stopped.needsYou.sessionId, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
      `The push failed because origin's push URL pointed at a repository that doesn't exist; that is fixed now. Finish the phase: push the feature branch to origin in every repository you changed, and make sure everything is committed and pushed. Then one more thing I'm asking for myself, separate from the phase: with your Write tool, not a shell command, create the file ${notes} in kiln-proof-shared's own checkout (not its worktree in the Kiln workspace) containing the one line "slugify: phase 1 finished by hand", and leave it uncommitted.`,
      "--add-dir", sharedCheckout,
    ],
    { cwd: sessionFolder, env, stdio: ["ignore", "pipe", "inherit"] },
  );
  resume.stdout.pipe(resumeOut);
  const resumeExit = await new Promise((done) => resume.once("exit", (code) => done(code)));
  log(`claude --resume exited ${resumeExit}; NOTES.md in the own checkout: ${existsSync(notes)}`);
  log(`check again: ${JSON.stringify(await view.api("POST", "/api/check-again"))}`);
  const outside = await until("Needs you again after Check again", async () => {
    const now = await view.snapshot();
    return now.feature.state === "needs_you" ? now : undefined;
  }, 120_000, kiln);
  save("needs-you-outside", outside);
  screenshot(view.address, "needs-you-outside.png");
  record("outside", { resumeExit, notesWritten: existsSync(notes), checks: outside.needsYou.checks, outside: outside.needsYou.outside ?? null });
  log(`Needs you: ${JSON.stringify(outside.needsYou.checks)}`);

  // The person deals with it: their checkout gets its file removed, then tick and Check again.
  rmSync(notes, { force: true });
  log(`confirmation: ${JSON.stringify(await view.api("POST", "/api/outside-confirmation"))}`);
  log(`check again: ${JSON.stringify(await view.api("POST", "/api/check-again"))}`);
  const cleared = await until("phase 1 to be Done", async () => {
    const now = await view.snapshot();
    if (now.feature.state === "needs_you") return failWith(view, "after-clear-unexpected", now);
    const phase = now.phases.find((row) => row.id === "1");
    return phase?.state === "done" ? now : undefined;
  }, 120_000, kiln);
  record("cleared", { phase1: cleared.phases.find((row) => row.id === "1"), sharedOwnCheckoutStatus: git(sharedCheckout, "status", "--porcelain") });
}

// ---- To Complete, and the pull requests on GitHub ----------------------------------------------
const complete = await until("Complete", async () => {
  const now = await view.snapshot();
  if (now.feature.state === "needs_you" || now.feature.state === "paused") return failWith(view, "before-complete-unexpected", now);
  return now.feature.state === "complete" ? now : undefined;
}, 120 * 60_000, kiln);
save("complete", complete);
screenshot(view.address, "complete.png");
const commits = commitsOnBranch();
const pulls = pullRequestsOnGitHub();
record("complete", {
  phases: complete.phases,
  repositories: complete.repositories,
  pullRequests: complete.pullRequests ?? null,
  terminal: kiln.text.trim().split("\n"),
});
record("onGitHub", {
  commitsOnFeatureBranch: commits,
  pullRequests: pulls,
  everyChangedRepositoryHasOneOpenReadyPullRequest: repositoryNames.every((name) => (commits[name] === 0 ? pulls[name].length === 0 : pulls[name].length === 1 && pulls[name][0].state === "OPEN" && !pulls[name][0].isDraft)),
  mainUnchanged: Object.fromEntries(repositoryNames.map((name) => [name, git(join(checkouts, name), "rev-parse", "origin/main") === mainAtStart[name]])),
  ownCheckouts: Object.fromEntries(repositoryNames.map((name) => [name, { branch: git(join(checkouts, name), "branch", "--show-current"), status: git(join(checkouts, name), "status", "--porcelain") }])),
});
log(`pull requests: ${JSON.stringify(Object.fromEntries(Object.entries(pulls).map(([name, list]) => [name, list.map((pull) => pull.url)])))}`);

process.kill(-kiln.child.pid, "SIGINT");
record("kilnExitAtEnd", await kiln.exit);
log(`done; results in ${out}`);
