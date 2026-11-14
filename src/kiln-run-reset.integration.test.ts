// Reset Kiln for a PRD through a real `kiln run` (run restart AC-RESET-01 to 06): the footer and
// its confirmation on the open page, the engine the run swaps in without restarting, a failing
// start check on Documents found afterwards, `kiln reset` and `kiln status` from a bot, git left
// exactly as it was, and a reset a step left unfinished being finished by the next `kiln run`.

import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import type { Receipt } from "./control/commands.js";
import { writeDurableMetadata } from "./control/durable-file.js";
import { recoverReset } from "./engine/reset.js";
import { runKilnCommand } from "./kiln-command.js";
import { readPrdRecord, writePrdRecord, type PrdRecord } from "./state/records.js";
import { createHarness, waitFor, type Harness } from "./test-support/engine-harness.js";
import { launchChrome, type HeadlessChrome } from "./test-support/headless-chrome.js";
import { reservePortRange } from "./test-support/os-ports.js";
import { createGithubOrigin } from "./test-support/git-repositories.js";

const cliPath = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
const PRD = "docs/prds/customer-returns";
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

/** A started PRD whose Phase 1 stopped before building anything. */
async function stoppedPrd(): Promise<Harness> {
  harness = await createHarness({ sessions: [{ actions: [{ result: "Waiting for a decision." }] }] });
  await harness.engine.start({ refinementConfirmed: true });
  await harness.engine.settled();
  harness.engine.close();
  // The start checks a reset reruns need origin on GitHub: the same refs, reached as github.com through the SSH stand-in.
  const { url, bare } = createGithubOrigin(harness.sandbox, "acme", "acme-shop");
  const run = (cwd: string, args: string[]) => expect(spawnSync(harness!.tools.git, args, { cwd, env: harness!.sandbox.env, encoding: "utf8" }).status).toBe(0);
  run(harness.origin, ["push", "-q", "--mirror", bare]);
  run(harness.repository, ["remote", "set-url", "origin", url]);
  run(harness.repository, ["fetch", "-q", "origin"]);
  harness.env.GIT_SSH_COMMAND = harness.sandbox.env.GIT_SSH_COMMAND;
  return harness;
}

/** `kiln run` in this process, its view's address once served, and a Ctrl+C at the end. */
async function withKilnRun(h: Harness, body: (run: { address: string; stdout: () => string; stderr: () => string; ended: () => number | undefined }) => Promise<void>, cwd = h.repository) {
  let stdout = ""; let stderr = ""; let address: string | undefined; let exit: number | undefined;
  const signals = new EventEmitter();
  const done = runKilnCommand(["run", PRD], { cwd, env: kilnEnv(h), signals, stdout: { write: (text: string) => (stdout += text) }, stderr: { write: (text: string) => (stderr += text) }, openBrowser: async (served) => { address = served; return { kind: "opened" }; } });
  void done.then(code => { exit = code; });
  try {
    await waitFor(() => address !== undefined || exit !== undefined, 40_000);
    expect(address, `${stdout}${stderr}`).toBeDefined();
    await body({ address: address!, stdout: () => stdout, stderr: () => stderr, ended: () => exit });
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

/** Everything git knows that a reset must leave alone (AC-RESET-05): refs, worktrees, origin and each worktree's status. */
function gitState(h: Harness, record: PrdRecord): string {
  const run = (cwd: string, args: string[]) => spawnSync(h.tools.git, args, { cwd, env: h.env, encoding: "utf8" }).stdout;
  const worktree = record.repositories[0]!.worktreePath;
  return [run(h.repository, ["for-each-ref"]), run(h.repository, ["worktree", "list", "--porcelain"]), run(h.repository, ["ls-remote", "origin"]), run(worktree, ["status", "--porcelain", "--untracked-files=all"]), run(worktree, ["rev-parse", "HEAD"]), run(h.repository, ["status", "--porcelain", "--untracked-files=all"]), run(h.repository, ["rev-parse", "HEAD"]), run(h.repository, ["symbolic-ref", "-q", "HEAD"])].join("\n--\n");
}

/** A gh call that would change a pull request or anything else on GitHub (AC-RESET-05). */
const MUTATING_GH = /^(create|edit|merge|close|reopen|ready|comment|review|delete)$/;
const mutatingGhCalls = (calls: string[][]) => calls.filter(args => args.some(arg => MUTATING_GH.test(arg)) || args[0] === "api" && args.some(arg => /^(-X|--method)$/.test(arg)));

const control = (status: Record<string, unknown>, name: string) => (status.controls as { name: string; available: boolean; reason: string | null }[]).find(one => one.name === name);
const text = "document.body.innerText";

it("the open page resets through its confirmation, returns to Documents found without reconnecting, shows a failing start check until a reload finds it fixed, and git is untouched", async () => {
  const h = await stoppedPrd();
  // Settings chosen away from their defaults, which the reset forgets (AC-RESET-04).
  const chosen = readPrdRecord(h.stateDirectory)!;
  const away = { agentChoices: { claude_code: { model: "sonnet", effort: "medium" } }, keepAwake: false, resumeAfterUsageLimit: false };
  writePrdRecord(h.stateDirectory, { ...chosen, settings: { ...chosen.settings, ...away } as PrdRecord["settings"] });
  const before = readPrdRecord(h.stateDirectory)!;
  expect(before.settings).toMatchObject(away);
  const gitBefore = gitState(h, before);
  await withKilnRun(h, async ({ address, stdout }) => {
    const page = await chrome.open(address, { width: 1200, height: 1100 });
    try {
      // AC-RESET-01: the line at the bottom of a started PRD's screen.
      await page.waitFor(`${text}.includes("Reset Kiln for this PRD")`);
      expect(await page.evaluate<string>(`document.querySelector("footer.reset").innerText`)).toContain("In a state nothing above fixes? Reset makes Kiln forget its progress on this PRD and takes you back to the first screen. Your branch, worktree and commits are kept.");
      expect(await page.evaluate<boolean>(`[...document.querySelectorAll(".page > *")].at(-1).matches("footer.reset")`)).toBe(true);
      // AC-RESET-03: the confirmation lists what goes and what stays; Cancel changes nothing.
      await page.evaluate(`document.querySelector("button.open-reset").click()`);
      await page.waitFor(`${text}.includes("Stays exactly as it is") && ${text}.includes("no uncommitted files")`);
      const confirmation = await page.evaluate<string>(`document.querySelector("section.confirm").innerText`);
      expect(confirmation).toContain("Reset Kiln for this PRD?");
      expect(confirmation).toContain("Which phase it was on, and each phase's result");
      expect(confirmation).toContain("Its 1 session and its output");
      expect(confirmation).toContain("Stops, completion waivers and audit results");
      expect(confirmation).toContain("Its settings for this PRD, which you choose again on the first screen");
      expect(confirmation).not.toContain("earlier deliveries");
      expect(confirmation).toContain(`${before.settings.featureBranch}, which has no commits of its own`);
      expect(confirmation).toContain("The worktree folder, with no uncommitted files");
      expect(confirmation).not.toContain("pull request");
      expect(confirmation).toContain("This can't be undone.");
      await page.evaluate(`[...document.querySelectorAll("section.confirm button")].find(b => b.innerText === "Cancel").click()`);
      await page.waitFor(`!document.querySelector("section.confirm")`);
      expect(readPrdRecord(h.stateDirectory)!.executionId).toBe(before.executionId);

      // A change the start checks will refuse after the reset: an uncommitted file in the checkout.
      writeFileSync(join(h.repository, "scratch.txt"), "not committed\n");
      await page.evaluate(`document.querySelector("button.open-reset").click()`);
      await page.waitFor(`document.querySelector("button.confirm-reset") && !document.querySelector("button.confirm-reset").disabled`);
      await page.evaluate(`document.querySelector("button.confirm-reset").click()`);
      // AC-RESET-04: the same page, still connected, shows Documents found with the failed check named.
      await page.waitFor(`${text}.includes("Not started") && ${text}.includes("has uncommitted changes in 1 file: scratch.txt")`, 30_000);
      expect(await page.evaluate<boolean>(`!!document.querySelector("footer.reset")`)).toBe(false);
      expect(await page.evaluate<string>(text)).toContain("Fix what failed, then reload.");
      expect(await page.evaluate<boolean>(`document.querySelector("button.start").disabled`)).toBe(true);
      expect(await page.evaluate<string>(text)).toContain("Connected to Kiln");
      expect(stdout()).toMatch(/ Reset {2}· {2}back to Documents found\n/);
      // Fixed, a reload finds every check passing.
      rmSync(join(h.repository, "scratch.txt"));
      await page.evaluate("location.reload()");
      await page.waitFor(`${text}.includes("Working tree is clean") && !${text}.includes("Fix what failed")`, 30_000);
      // AC-RESET-04: with every start check passing, Start is available again.
      // As on a first visit, Start then waits only for the refinement box.
      await page.evaluate(`[...document.querySelectorAll("label")].find(l => l.innerText.includes("These documents have been through requirements refinement")).querySelector("input").click()`);
      await page.waitFor(`document.querySelector("button.start") && !document.querySelector("button.start").disabled`, 30_000);
      expect(page.problems).toEqual([]);
    } finally { await page.close(); }
  });
  // Kiln forgot everything but its instance lock, the fresh record and the reset's own receipt.
  const after = readPrdRecord(h.stateDirectory)!;
  expect(after.startedAt).toBeUndefined();
  expect(after.executionId).not.toBe(before.executionId);
  expect(after.token).toBe(before.token);
  expect(after.phases).toEqual({});
  expect(after.repositories).toEqual([]);
  // Its settings for the PRD are forgotten: back at their defaults, to be chosen again on Documents found.
  expect(after.settings).toMatchObject({ agentChoices: { claude_code: { model: "opus", effort: "high" } }, keepAwake: true, resumeAfterUsageLimit: true, featureBranch: before.settings.featureBranch });
  // The new engine writes its own inspection projection; nothing else of the old execution is left.
  expect(readdirSync(h.stateDirectory).filter(name => !["prd.json", "instance.lock", "controls", "control-index"].includes(name)).sort()).toEqual(["inspection-aliases.json", "inspection-bindings.json", "inspection-view.json"]);
  for (const name of ["inspection-aliases.json", "inspection-bindings.json", "inspection-view.json"]) expect((JSON.parse(readFileSync(join(h.stateDirectory, name), "utf8")) as { execution_id: string }).execution_id).toBe(after.executionId);
  const receipts = readdirSync(join(h.stateDirectory, "controls")).flatMap(dir => readdirSync(join(h.stateDirectory, "controls", dir)).map(file => (JSON.parse(readFileSync(join(h.stateDirectory, "controls", dir, file), "utf8")) as { receipt: Receipt }).receipt));
  expect(receipts).toEqual([expect.objectContaining({ state: "completed", outcome: "reset", reset: { forgets: { phaseResults: 1, sessions: 1, stops: 1, waivers: 0, audits: 0, deliveries: 0 }, new_execution_id: after.executionId } })]);
  // AC-RESET-05: no branch, worktree, commit or document changed.
  expect(gitState(h, before)).toBe(gitBefore);
}, 120_000);

it("kiln reset resets at once from a bot, its receipt stays queryable and retries replay it, and kiln status lists reset on started PRDs only", async () => {
  const h = await stoppedPrd();
  const record = readPrdRecord(h.stateDirectory)!;
  // Uncommitted work in the worktree, and an open pull request for the branch, that the reset must leave alone (AC-RESET-05).
  writeFileSync(join(record.repositories[0]!.worktreePath, "in-progress.txt"), "not committed\n");
  h.setPulls([{ number: 42, title: "Customer returns", url: "https://github.com/acme/acme-shop/pull/42", isDraft: false, isCrossRepository: false, headRefName: record.settings.featureBranch, baseRefName: "develop", additions: 1, deletions: 0, commits: [{}] }]);
  const gitBefore = gitState(h, record);
  const pullsBefore = readFileSync(h.ghStatePath, "utf8");
  const ghBefore = h.ghCalls().length;
  await withKilnRun(h, async () => {
    const status = await cli(h, ["status"]);
    expect(control(status.body, "reset")).toMatchObject({ available: true, reason: null });
    const stale = await cli(h, ["reset", "--only-if-status-matches", "stale:token", "--command-id", "bot-reset-stale"]);
    expect(stale.code).toBe(3);
    const reset = await cli(h, ["reset", "--only-if-status-matches", String(status.body.status_token), "--command-id", "bot-reset"]);
    expect(reset.code, reset.error).toBe(0);
    expect((reset.body.operation as Receipt).state).toBe("in_progress");
    await waitFor(async () => (await cli(h, ["status"])).body.state === "not_started", 30_000);
    const after = await cli(h, ["status"]);
    expect(control(after.body, "reset")).toMatchObject({ available: false, reason: "Not started; there is nothing to reset." });
    const receipt = await cli(h, ["command-status", "--command-id", "bot-reset"]);
    expect(receipt.code, receipt.error).toBe(0);
    expect(receipt.body.operation).toMatchObject({ action: "reset", state: "completed", outcome: "reset" });
    // The identical retry finds the kept receipt before any token check against the new execution.
    const retry = await cli(h, ["reset", "--only-if-status-matches", String(status.body.status_token), "--command-id", "bot-reset"]);
    expect(retry.code, retry.error).toBe(0);
    expect(retry.body.operation).toMatchObject({ state: "completed", outcome: "reset" });
  });
  // With no Kiln running, reset is unavailable like every control, and its receipt reads from disk.
  const stopped = await cli(h, ["status"]);
  expect(stopped.body.status_token).toBeNull();
  expect(control(stopped.body, "reset")).toMatchObject({ available: false });
  expect((await cli(h, ["command-status", "--command-id", "bot-reset"])).body.operation).toMatchObject({ state: "completed", outcome: "reset" });
  // AC-RESET-05: the branch, worktree, its uncommitted file, the checkout and the pull request are as they were.
  expect(gitState(h, record)).toBe(gitBefore);
  expect(readFileSync(join(record.repositories[0]!.worktreePath, "in-progress.txt"), "utf8")).toBe("not committed\n");
  expect(readFileSync(h.ghStatePath, "utf8")).toBe(pullsBefore);
  expect(mutatingGhCalls(h.ghCalls().slice(ghBefore))).toEqual([]);
}, 120_000);

it("a reset a step left unfinished is finished by the next kiln run before it reads the record, and one that recorded nothing is settled not_applied", async () => {
  const h = await stoppedPrd();
  const old = readPrdRecord(h.stateDirectory)!;
  await withKilnRun(h, async ({ address }) => {
    const status = await cli(h, ["status"]);
    const response = await fetch(`${address.replace(/\/[^/]+$/, "")}/api/reset`, { method: "POST", headers: { "X-Kiln-Token": old.token, Origin: new URL(address).origin, "X-Kiln-Status": String(status.body.status_token), "X-Kiln-Command-Id": "page-reset" } });
    expect(response.status).toBe(200);
    const answer = await response.json() as { ok: boolean; outcome: string; controlToken: string };
    expect(answer).toMatchObject({ ok: true, outcome: "reset" });
    expect(answer.controlToken.split(":")[0]).toBe(readPrdRecord(h.stateDirectory)!.executionId);
  });
  // As if the run stopped after step 2's checkpoint: the receipt unsettled, the old record and its files back.
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const path = join(h.stateDirectory, "controls", hash(old.executionId), `${hash("page-reset")}.json`);
  const saved = (JSON.parse(readFileSync(path, "utf8")) as { receipt: Receipt }).receipt;
  const interrupted: Receipt = { ...saved, state: "in_progress", stage: "applying", outcome: null };
  writeDurableMetadata(path, { checksum: hash(interrupted), receipt: interrupted });
  writePrdRecord(h.stateDirectory, old);
  writeFileSync(join(h.stateDirectory, "left-over.json"), "{}");
  // A second reset receipt that never checkpointed: it discarded nothing.
  const nothing: Receipt = { ...interrupted, command_id: "never-checkpointed", id: "never-checkpointed-id", sequence: interrupted.sequence + 1, instruction: { ...interrupted.instruction, command_id: "never-checkpointed" } };
  delete nothing.reset;
  nothing.digest = hash(nothing.instruction);
  writeDurableMetadata(join(h.stateDirectory, "controls", hash(old.executionId), `${hash("never-checkpointed")}.json`), { checksum: hash(nothing), receipt: nothing });

  expect(recoverReset(h.stateDirectory)).toBe(true);
  const record = readPrdRecord(h.stateDirectory)!;
  expect(record.executionId).toBe(saved.reset!.new_execution_id);
  expect(record.startedAt).toBeUndefined();
  expect(readdirSync(h.stateDirectory)).not.toContain("left-over.json");
  const finished = (JSON.parse(readFileSync(path, "utf8")) as { receipt: Receipt }).receipt;
  expect(finished).toMatchObject({ state: "completed", stage: "settled", outcome: "reset" });
  const settled = (JSON.parse(readFileSync(join(h.stateDirectory, "controls", hash(old.executionId), `${hash("never-checkpointed")}.json`), "utf8")) as { receipt: Receipt }).receipt;
  expect(settled).toMatchObject({ state: "failed", stage: "settled", outcome: "not_applied" });
  // The next kiln run is a first run: Documents found, every kept receipt settled so nothing is busy.
  await withKilnRun(h, async ({ stdout }) => {
    await waitFor(() => stdout().includes("Opened"), 20_000);
    const status = await cli(h, ["status"]);
    expect(status.body.state).toBe("not_started");
  });
}, 120_000);

it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("a step that fails after the engine stopped answers restart_required, ends the run with exit 1, and the next kiln run finishes the reset", async () => {
  const h = await stoppedPrd();
  // A folder in the state directory the discard can't remove makes step 4 throw.
  const locked = join(h.stateDirectory, "locked");
  mkdirSync(join(locked, "inner"), { recursive: true });
  chmodSync(locked, 0o500);
  try {
    await withKilnRun(h, async ({ address, stderr, ended }) => {
      const status = await cli(h, ["status"]);
      const response = await fetch(`${address.replace(/\/[^/]+$/, "")}/api/reset`, { method: "POST", headers: { "X-Kiln-Token": readPrdRecord(h.stateDirectory)!.token, Origin: new URL(address).origin, "X-Kiln-Status": String(status.body.status_token), "X-Kiln-Command-Id": "failing-reset" } });
      expect(response.status).toBe(500);
      const answer = await response.json() as { code: string; reason: string };
      expect(answer.code).toBe("restart_required");
      expect(answer.reason).toMatch(/^The reset didn't finish: .+\. Run kiln run again to finish it\.$/);
      await waitFor(() => ended() !== undefined, 10_000);
      expect(ended()).toBe(1);
      expect(stderr()).toContain(`kiln: ${answer.reason}`);
    });
    // After the exit the receipt reads from disk as indeterminate, with that reason.
    expect((await cli(h, ["command-status", "--command-id", "failing-reset"])).body.operation).toMatchObject({ state: "indeterminate" });
  } finally { chmodSync(locked, 0o755); }
  await withKilnRun(h, async () => {
    expect((await cli(h, ["status"])).body.state).toBe("not_started");
    expect((await cli(h, ["command-status", "--command-id", "failing-reset"])).body.operation).toMatchObject({ state: "completed", outcome: "reset" });
  });
  expect(readdirSync(h.stateDirectory)).not.toContain("locked");
}, 120_000);

it("a reset run from Kiln's own worktree adopts it: its uncommitted files are counted, not a failed check, while a new branch fails the check", async () => {
  const h = await stoppedPrd();
  const record = readPrdRecord(h.stateDirectory)!;
  const worktree = record.repositories[0]!.worktreePath;
  writeFileSync(join(worktree, "notes.txt"), "work in progress\n");
  await withKilnRun(h, async ({ address }) => {
    const status = await cli(h, ["status"]);
    const base = address.replace(/\/[^/]+$/, "");
    const headers = { "X-Kiln-Token": record.token, Origin: new URL(address).origin };
    expect((await fetch(`${base}/api/reset`, { method: "POST", headers: { ...headers, "X-Kiln-Status": String(status.body.status_token), "X-Kiln-Command-Id": "worktree-reset" } })).status).toBe(200);
    const page = await chrome.open(address, { width: 1200, height: 1100 });
    try {
      // The branch that exists is chosen, its worktree is the checkout kiln run was run from: counted, and Start isn't held.
      await page.waitFor(`${text}.includes("Not started") && ${text}.includes("A branch that already exists")`, 30_000);
      await page.waitFor(`!${text}.includes("has uncommitted changes") && !${text}.includes("Fix what failed")`, 30_000);
      // Counted on the page, never reported as a clean tree.
      expect(await page.evaluate<string>(text)).not.toContain("Working tree is clean");
      // A new branch would not adopt it, so the uncommitted files fail the check as kiln run says.
      const changed = await fetch(`${base}/api/settings`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ start: { from: "new", bringUpToDate: true } }) });
      expect(changed.status).toBe(200);
      await page.waitFor(`${text}.includes("has uncommitted changes in 1 file: notes.txt") && ${text}.includes("Fix what failed, then reload.")`, 30_000);
    } finally { await page.close(); }
  }, worktree);
}, 120_000);
