// The commands that start a stopped phase's session, through the built CLI against a live
// controller (run restart AC-CARRY-04), and the couldn't-start page drawn from a real engine
// snapshot (AC-CASE-01, AC-CASE-02, AC-LOOK-01).

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Receipt } from "../control/commands.js";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import type { LocalServer } from "./local-server.js";

let h: Harness | undefined;
let server: LocalServer | undefined;
let release: (() => void) | undefined;
let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });
afterEach(async () => { await server?.close(); server = undefined; release?.(); release = undefined; await h?.cleanup(); h = undefined; });

const exitsBeforeInit: ScenarioSession = { noInit: true, actions: [] };
const blocked: ScenarioSession = { noTranscript: true, actions: [{ result: "Blocked before any code." }] };

async function cli(args: string[], stdin?: string) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), args[0]!, join(h!.repository, h!.engine.record.prdDirectory), ...args.slice(1), "--json"], { cwd: h!.sandbox.root, env: h!.env, stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; let error = "";
  child.stdout.on("data", b => { output += String(b); }); child.stderr.on("data", b => { error += String(b); });
  child.stdin.end(stdin ?? "");
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  return { code, error, body: JSON.parse(output) as Record<string, unknown> };
}
async function host(sessions: ScenarioSession[]) {
  h = await createHarness({ sessions });
  const hosted = await startFixtureController({ engine: h.engine, folderName: h.engine.paths.folderName, featureName: "Customer returns", token: h.engine.record.token });
  server = hosted.server; release = hosted.release;
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
}
const token = async () => String((await cli(["status"])).body.status_token);
const settledReceipt = async (id: string) => { await waitFor(async () => !["accepted", "in_progress"].includes((h!.engine.commands.lookup(id).operation as Receipt).state)); await h!.engine.settled(); return h!.engine.commands.lookup(id).operation as Receipt; };

it("kiln start-again starts the first session again, is refused where the button isn't offered, and the page drawn from the real snapshot offers only it", async () => {
  await host([exitsBeforeInit, landingSession("src/intake.txt")]);
  // The real page, from the engine's own snapshot.
  const page = await chrome.open(server!.address, { width: 1200, height: 1000 });
  try {
    await page.waitFor("document.body.innerText.includes(\"Kiln couldn't start Phase 1.\")");
    const body = await page.evaluate<string>("document.querySelector('main').innerText");
    expect(body).toContain("Start Phase 1 again");
    expect(body).toContain("Nothing to check yet.");
    expect(body).toContain("exited with code 1 before beginning a conversation");
    expect(page.problems).toEqual([]);
  } finally { await page.close(); }
  // carry-on isn't offered where no conversation began.
  const refused = await cli(["carry-on", "--only-if-status-matches", await token(), "--command-id", "cli-carry-refused"]);
  expect(refused.code).toBe(3);
  expect((refused.body.operation as Receipt).state).toBe("refused");
  const started = await cli(["start-again", "--only-if-status-matches", await token(), "--command-id", "cli-start"]);
  expect(started.code, started.error).toBe(0);
  const receipt = await settledReceipt("cli-start");
  expect(receipt).toMatchObject({ state: "completed", outcome: "session_started", effects: { session: "started" } });
  expect(h!.claudeCalls()[1]!.prompt).toBe(h!.claudeCalls()[0]!.prompt);
  // A stale status token changes nothing.
  const stale = await cli(["start-again", "--only-if-status-matches", "stale:token", "--command-id", "cli-stale"]);
  expect(stale.code).toBe(3);
});

it("kiln carry-on takes its reply from a file or standard input, and start-again is refused once a conversation began", async () => {
  await host([blocked, landingSession("src/intake.txt")]);
  const refused = await cli(["start-again", "--only-if-status-matches", await token(), "--command-id", "cli-start-refused"]);
  expect(refused.code).toBe(3);
  const status = await cli(["status"]);
  expect((status.body.controls as { name: string; available: boolean }[]).find(c => c.name === "carry-on")).toMatchObject({ available: true });
  const file = join(h!.sandbox.root, "reply.txt"); writeFileSync(file, "  Merged now; $(not a command) carry on.\n");
  // At most one reply source, as kiln reply takes them: both together are refused and start nothing.
  const both = await cli(["carry-on", "--message-file", file, "--message-from-stdin", "--only-if-status-matches", String(status.body.status_token), "--command-id", "cli-carry-both"], "From stdin.\n");
  expect(both.code).toBe(2);
  expect(JSON.stringify(both.body)).toContain("At most one of --message-file, --message-from-stdin");
  expect(h!.claudeCalls()).toHaveLength(1);
  const carried = await cli(["carry-on", "--message-file", file, "--only-if-status-matches", String(status.body.status_token), "--command-id", "cli-carry"]);
  expect(carried.code, carried.error).toBe(0);
  const receipt = await settledReceipt("cli-carry");
  expect(receipt).toMatchObject({ state: "completed", outcome: "session_started", effects: { session: "started" }, reply_text: null });
  expect(h!.claudeCalls()[1]!.prompt).toContain("The person running Kiln says:\n\nMerged now; $(not a command) carry on.");
  expect(h!.claudeCalls()[1]!.prompt).toContain("Blocked before any code.");
});

it("kiln carry-on reads its reply from standard input", async () => {
  await host([blocked, landingSession("src/intake.txt")]);
  const carried = await cli(["carry-on", "--message-from-stdin", "--only-if-status-matches", await token(), "--command-id", "cli-carry-stdin"], "From stdin.\n");
  expect(carried.code, carried.error).toBe(0);
  expect(await settledReceipt("cli-carry-stdin")).toMatchObject({ outcome: "session_started" });
  expect(h!.claudeCalls()[1]!.prompt).toContain("The person running Kiln says:\n\nFrom stdin.");
});

/** A commit on develop, pushed: the stopped phase's untouched branch falls one behind its base. */
function advanceDevelop(name: string): string {
  writeFileSync(join(h!.repository, name), `${name}\n`);
  git(h!.sandbox, h!.repository, "add", name);
  git(h!.sandbox, h!.repository, "commit", "-q", "-m", `chore: ${name}`);
  git(h!.sandbox, h!.repository, "push", "-q", "origin", "develop");
  return git(h!.sandbox, h!.repository, "rev-parse", "HEAD").trim();
}
const worktreeHead = () => git(h!.sandbox, h!.engine.worktreePath, "rev-parse", "HEAD").trim();

it("kiln start-again --leave-branch-as-is leaves an untouched branch behind its base, and without it catches the branch up (run restart AC-CURRENT-01)", async () => {
  await host([exitsBeforeInit, exitsBeforeInit, exitsBeforeInit]);
  const before = worktreeHead();
  const developTip = advanceDevelop("merged-elsewhere.txt");
  const left = await cli(["start-again", "--leave-branch-as-is", "--only-if-status-matches", await token(), "--command-id", "cli-leave"]);
  expect(left.code, left.error).toBe(0);
  expect(await settledReceipt("cli-leave")).toMatchObject({ branch_catch_up: [] });
  expect(worktreeHead()).toBe(before);
  const caught = await cli(["start-again", "--only-if-status-matches", await token(), "--command-id", "cli-catch"]);
  expect(caught.code, caught.error).toBe(0);
  expect(await settledReceipt("cli-catch")).toMatchObject({ branch_catch_up: [{ repository: "acme-shop", from: before, to: developTip, commits: 1 }] });
  expect(worktreeHead()).toBe(developTip);
});

it("kiln carry-on --leave-branch-as-is leaves the branch as it is (run restart AC-CURRENT-01)", async () => {
  await host([blocked, exitsBeforeInit]);
  git(h!.sandbox, h!.engine.worktreePath, "push", "-q", "origin", h!.engine.record.settings.featureBranch);
  const before = worktreeHead();
  advanceDevelop("merged-elsewhere.txt");
  const left = await cli(["carry-on", "--leave-branch-as-is", "--only-if-status-matches", await token(), "--command-id", "cli-carry-leave"]);
  expect(left.code, left.error).toBe(0);
  expect(await settledReceipt("cli-carry-leave")).toMatchObject({ state: expect.stringMatching(/^(completed|failed)$/), branch_catch_up: [] });
  expect(h!.claudeCalls()).toHaveLength(2);
  expect(worktreeHead()).toBe(before);
  expect(h!.engine.record.branchCatchUps).toBeUndefined();
});

/** The built CLI in text mode: no --json. */
async function cliText(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), args[0]!, join(h!.repository, h!.engine.record.prdDirectory), ...args.slice(1)], { cwd: h!.sandbox.root, env: h!.env, stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; let error = "";
  child.stdout.on("data", b => { output += String(b); }); child.stderr.on("data", b => { error += String(b); });
  child.stdin.end("");
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  return { code, output, error };
}
/** A billing reading that says Kiln can't launch, as the launch path's own check reads it. */
function restrictBilling() {
  const view = h!.engine.billing.view;
  return vi.spyOn(h!.engine.billing, "view", "get").mockReturnValue({ ...view, canLaunch: false, next: { ...(view.next ?? { route: "metered", sources: [], diagnostics: [] }), route: "metered", approved: false } as NonNullable<typeof view.next> });
}

it("kiln carry-on is refused where the conversation can be reopened (run restart AC-CARRY-04)", async () => {
  const reopenable: ScenarioSession = { actions: [{ skill: "enso-method:implement-from-requirements" }, { result: "Blocked before any code." }] };
  await host([reopenable]);
  const refused = await cli(["carry-on", "--only-if-status-matches", await token(), "--command-id", "cli-carry-reopenable"]);
  expect(refused.code).toBe(3);
  expect((refused.body.operation as Receipt).state).toBe("refused");
  expect(h!.claudeCalls()).toHaveLength(1);
});

it("kiln carry-on: a stale token, a billing restriction and a running session each refuse it, and a retried command ID starts one session (run restart AC-CARRY-04)", async () => {
  await host([blocked, { actions: [] }]);
  const working = join(h!.sandbox.root, "carry-working"); const go = join(h!.sandbox.root, "carry-release");
  writeFileSync(h!.scenarioPath, JSON.stringify({ sessions: [blocked, { actions: [{ touch: working }, { waitForFile: go }, { result: "Done for now." }] }] }));
  // A stale token while carry-on is offered.
  const stale = await cli(["carry-on", "--only-if-status-matches", "stale:token", "--command-id", "cli-carry-stale"]);
  expect(stale.code).toBe(3);
  expect(h!.claudeCalls()).toHaveLength(1);
  // Billing would stop a launch.
  const restricted = restrictBilling();
  const billed = await cli(["carry-on", "--only-if-status-matches", await token(), "--command-id", "cli-carry-billing"]);
  restricted.mockRestore();
  expect(billed.code).toBe(3);
  expect(JSON.stringify(billed.body)).toContain("Billing");
  expect(h!.claudeCalls()).toHaveLength(1);
  // The same command ID sent twice starts one session; command-status reads the receipt.
  const status = await token();
  const first = await cli(["carry-on", "--only-if-status-matches", status, "--command-id", "cli-carry-once"]);
  expect(first.code, first.error).toBe(0);
  await waitFor(() => existsSync(working));
  const again = await cli(["carry-on", "--only-if-status-matches", status, "--command-id", "cli-carry-once"]);
  expect((again.body.operation as Receipt).command_id).toBe("cli-carry-once");
  // While that session runs, both commands are refused.
  const running = await token();
  expect((await cli(["carry-on", "--only-if-status-matches", running, "--command-id", "cli-carry-running"])).code).toBe(3);
  expect((await cli(["start-again", "--only-if-status-matches", running, "--command-id", "cli-start-running"])).code).toBe(3);
  writeFileSync(go, "go");
  await settledReceipt("cli-carry-once");
  expect(h!.claudeCalls()).toHaveLength(2);
  const looked = await cli(["command-status", "--command-id", "cli-carry-once"]);
  expect(looked.body.operation).toMatchObject({ command_id: "cli-carry-once", state: "completed", outcome: "session_started" });
});

it("kiln start-again is refused under a billing restriction (run restart AC-CARRY-04)", async () => {
  await host([exitsBeforeInit, exitsBeforeInit]);
  const restricted = restrictBilling();
  const billed = await cli(["start-again", "--only-if-status-matches", await token(), "--command-id", "cli-start-billing"]);
  restricted.mockRestore();
  expect(billed.code).toBe(3);
  expect(JSON.stringify(billed.body)).toContain("Billing");
  expect(h!.claudeCalls()).toHaveLength(1);
});

it("kiln start-again and kiln carry-on in text mode report the new session and never promise to resume (run restart AC-CARRY-04)", async () => {
  await host([exitsBeforeInit, blocked, blocked]);
  const started = await cliText(["start-again", "--only-if-status-matches", await token(), "--command-id", "cli-start-text"]);
  expect(started.code, started.error).toBe(0);
  expect(started.output).toMatch(/\S/);
  expect(started.output).not.toMatch(/resum/i);
  await settledReceipt("cli-start-text");
  const carried = await cliText(["carry-on", "--only-if-status-matches", await token(), "--command-id", "cli-carry-text"]);
  expect(carried.code, carried.error).toBe(0);
  expect(carried.output).toMatch(/\S/);
  expect(carried.output).not.toMatch(/resum/i);
  await settledReceipt("cli-carry-text");
  // The settled receipt, as a bot reads it back, says a session started, not that one resumed.
  for (const id of ["cli-start-text", "cli-carry-text"]) {
    const looked = await cliText(["command-status", "--command-id", id]);
    expect(looked.output).toContain("session_started");
    expect(looked.output).not.toMatch(/resum/i);
  }
});

it("kiln reply and kiln resume --leave-branch-as-is leave the branch as it is (run restart AC-CURRENT-01)", async () => {
  const reopenable = (text: string): ScenarioSession => ({ actions: [{ skill: "enso-method:implement-from-requirements" }, { result: text }] });
  await host([reopenable("Blocked."), reopenable("Still blocked."), reopenable("Blocked again.")]);
  git(h!.sandbox, h!.engine.worktreePath, "push", "-q", "origin", h!.engine.record.settings.featureBranch);
  const before = worktreeHead();
  advanceDevelop("merged-elsewhere.txt");
  const replied = await cli(["reply", "--message-from-stdin", "--leave-branch-as-is", "--only-if-status-matches", await token(), "--command-id", "cli-reply-leave"], "Carry on.\n");
  expect(replied.code, replied.error).toBe(0);
  expect(await settledReceipt("cli-reply-leave")).toMatchObject({ outcome: "session_resumed", branch_catch_up: [] });
  expect(worktreeHead()).toBe(before);
  const resumed = await cli(["resume", "--leave-branch-as-is", "--only-if-status-matches", await token(), "--command-id", "cli-resume-leave"]);
  expect(resumed.code, resumed.error).toBe(0);
  expect(await settledReceipt("cli-resume-leave")).toMatchObject({ outcome: "session_resumed", branch_catch_up: [] });
  expect(worktreeHead()).toBe(before);
  expect(h!.engine.record.branchCatchUps).toBeUndefined();
});
