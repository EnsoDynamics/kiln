// Exit Kiln through a real `kiln run` on a finished PRD (Kiln After Delivery AC-EXIT-01, AC-EXIT-02,
// AC-BOT-01): the button on the open page, the page's Kiln has exited state with no disconnected
// banner, `kiln exit` from a bot, exit code 0, the terminal's last line, the instance lock
// released, and the pull request, branch, worktree and record left as they were.

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { runKilnCommand } from "./kiln-command.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "./test-support/engine-harness.js";
import { git } from "./test-support/git-repositories.js";
import { launchChrome, type HeadlessChrome } from "./test-support/headless-chrome.js";
import { reservePortRange } from "./test-support/os-ports.js";
import { recordedPullRequest } from "./test-support/recorded-pull-requests.js";

const cliPath = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const PRD = "docs/prds/customer-returns";
const KEY = "acme/acme-shop#218";
const text = "document.body.innerText";
let harness: Harness | undefined;
let chrome: HeadlessChrome;
let ports = "";
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
beforeEach(async () => { ports = await reservePortRange(); });
afterEach(async () => { await harness?.cleanup(); harness = undefined; });

function kilnEnv(h: Harness): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(h.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: [join(h.sandbox.root, "bin"), h.env.PATH ?? h.env.Path ?? ""].join(delimiter), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: ports };
}

/** A finished PRD whose pull request #218 GitHub shows open. */
async function finishedPrd(): Promise<Harness> {
  harness = await createHarness({ sessions: [landingSession("src/intake.txt"), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), pullRequestSession(218)] });
  harness.useGithubOrigin();
  await harness.engine.start({ refinementConfirmed: true });
  await harness.engine.settled();
  expect(harness.engine.record.completedAt).toBeDefined();
  const head = git(harness.sandbox, harness.engine.worktreePath, "rev-parse", "HEAD").trim();
  harness.setPullRequestViews({ [KEY]: recordedPullRequest("open", { number: 218, base: "develop", url: "https://github.com/acme/acme-shop/pull/218", head }) });
  await harness.engine.stop("sigterm");
  return harness;
}

/** `kiln run` in this process: its view's address once served, what it printed and its exit code. */
async function withKilnRun(h: Harness, body: (run: { address: string; stdout: () => string; ended: () => number | undefined; done: Promise<number> }) => Promise<void>) {
  let stdout = ""; let stderr = ""; let address: string | undefined; let exit: number | undefined;
  const signals = new EventEmitter();
  const done = runKilnCommand(["run", PRD], { cwd: h.repository, env: kilnEnv(h), signals, stdout: { write: (chunk: string) => (stdout += chunk) }, stderr: { write: (chunk: string) => (stderr += chunk) }, openBrowser: async (served) => { address = served; return { kind: "opened" }; } });
  void done.then(code => { exit = code; });
  try {
    await waitFor(() => address !== undefined || exit !== undefined, 40_000);
    expect(address, `${stdout}${stderr}`).toBeDefined();
    await body({ address: address!, stdout: () => stdout, ended: () => exit, done });
  } finally {
    if (exit === undefined) signals.emit("SIGINT");
    await done;
  }
}

async function cli(h: Harness, args: string[]) {
  const child = spawn(process.execPath, [cliPath, args[0]!, join(h.repository, PRD), ...args.slice(1), "--json"], { cwd: h.sandbox.root, env: kilnEnv(h), stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; let error = "";
  child.stdout.on("data", chunk => { output += String(chunk); }); child.stderr.on("data", chunk => { error += String(chunk); });
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  return { code, error, body: JSON.parse(output) as Record<string, unknown> };
}

/** What Exit must leave as it was: refs, worktrees, every status, and the saved record. */
const kept = (h: Harness) => [
  git(h.sandbox, h.repository, "show-ref"), git(h.sandbox, h.repository, "worktree", "list", "--porcelain"),
  git(h.sandbox, h.repository, "status", "--porcelain"), git(h.sandbox, h.origin, "show-ref"),
  readFileSync(join(h.stateDirectory, "prd.json"), "utf8"),
].join("\n");

it("Exit Kiln on the finished page ends kiln run with code 0 and its last line, and the page says Kiln has exited", { timeout: 120_000 }, async () => {
  const h = await finishedPrd();
  await withKilnRun(h, async ({ address, stdout, done }) => {
    const page = await chrome.open(address, { width: 1280, height: 1100 });
    try {
      await page.waitFor(`[...document.querySelectorAll("button")].some(b => b.innerText === "Exit Kiln" && !b.disabled)`, 30_000);
      expect(await page.evaluate<string>(text)).toContain("Stops Kiln in its terminal. The pull request and the worktree stay.");
      // The page's own load reads GitHub first; Exit leaves what that saved, and changes nothing after.
      await page.waitFor(`${text}.includes("Merged it yourself?")`, 30_000);
      const before = kept(h);
      await page.evaluate(`[...document.querySelectorAll("button")].find(b => b.innerText === "Exit Kiln").click()`);
      await page.waitFor(`${text}.includes("Kiln has exited")`, 15_000);
      const shown = await page.evaluate<string>(text);
      expect(shown).toMatch(/You exited Kiln from this page at \d{1,2}:\d{2} [AP]M\. Nothing is running\. The pull request and the worktree stay as they are, and this page no longer updates\./);
      expect(shown).toContain("To open this PRD in Kiln again:");
      expect(shown).toContain("kiln run docs/prds/customer-returns");
      expect(await done).toBe(0);
      expect(stdout().trimEnd().split("\n").at(-1)).toBe("Kiln exited from the page. Run kiln run docs/prds/customer-returns to open it again.");
      // Kiln is gone, and the page never shows the disconnected banner, even after the 15-second heartbeat watchdog would have fired.
      await new Promise(resolve => setTimeout(resolve, 16_000));
      const after = await page.evaluate<string>(text);
      expect(after).toContain("Kiln has exited");
      expect(after).not.toMatch(/Disconnected|cannot reach Kiln/);
      expect(page.problems.filter(problem => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(problem))).toEqual([]);
      expect(kept(h)).toBe(before);
    } finally { await page.close(); }
  });
  // The instance lock is released: kiln status finds no running Kiln.
  expect((await cli(h, ["status"])).body.status_token).toBeNull();
});

it("kiln exit ends kiln run from the command line, with the same end", { timeout: 120_000 }, async () => {
  const h = await finishedPrd();
  await withKilnRun(h, async ({ stdout, done }) => {
    const status = await cli(h, ["status"]);
    const exit = (status.body.controls as { name: string; available: boolean }[]).find(one => one.name === "exit");
    expect(exit).toMatchObject({ available: true });
    const stale = await cli(h, ["exit", "--only-if-status-matches", "stale:token", "--command-id", "bot-exit-stale"]);
    expect(stale.code).toBe(3);
    const before = kept(h);
    const answer = await cli(h, ["exit", "--only-if-status-matches", String(status.body.status_token), "--command-id", "bot-exit"]);
    expect(answer.code, answer.error).toBe(0);
    // The answer is the accepted receipt; it completes before Kiln ends (read below with command-status).
    expect(answer.body.operation).toMatchObject({ command_id: "bot-exit" });
    expect(await done).toBe(0);
    expect(stdout().trimEnd().split("\n").at(-1)).toBe("Kiln exited from the command line. Run kiln run docs/prds/customer-returns to open it again.");
    expect(kept(h)).toBe(before);
  });
  expect((await cli(h, ["status"])).body.status_token).toBeNull();
  // The receipt stays readable once Kiln has ended.
  expect((await cli(h, ["command-status", "--command-id", "bot-exit"])).body.operation).toMatchObject({ state: "completed", outcome: "exited" });
});
