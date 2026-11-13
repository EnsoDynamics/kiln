// The commands that start a stopped phase's session, through the built CLI against a live
// controller (run restart AC-CARRY-04), and the couldn't-start page drawn from a real engine
// snapshot (AC-CASE-01, AC-CASE-02, AC-LOOK-01).

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import type { Receipt } from "../control/commands.js";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
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
