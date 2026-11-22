// `kiln merge` through the built CLI (Kiln After Delivery AC-BOT-01): its help carries the button's
// note, it sends the journal's `merge` action with the command line as its entry point, `kiln status`
// lists it among the controls with why it is unavailable, and a controller without `after_delivery`
// is refused before anything is sent. Needs `dist/` (npm run build).
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { processStartTime } from "../platform/process-start-time.js";
import { writeJsonAtomically } from "../state/state-files.js";

let h: Harness;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });
const target = () => join(h.repository, `docs/prds/${FOLDER}`);

/** Phase 1 stops at Needs you with its done check failing: a stop, but not a loop stop. */
async function stopped() {
  h = await createHarness({ sessions: [{ actions: [{ result: "I think this is done." }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toBe("1");
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: FOLDER, featureName: "Returns", token: h.engine.record.token });
  await lockOn(boundPort(server.address));
}
async function lockOn(port: number) {
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });
}
async function cli(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = ""; child.stdout.on("data", data => stdout += String(data)); child.stderr.on("data", data => stderr += String(data));
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 20000);
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => clearTimeout(watchdog));
  expect(stderr).toBe(""); return { code, stdout, json: () => JSON.parse(stdout) as Record<string, unknown> };
}
const body = (request: IncomingMessage) => new Promise<string>(resolve => { let text = ""; request.on("data", chunk => text += String(chunk)); request.on("end", () => resolve(text)); });

/** A stand-in controller for this execution advertising `features`; it records each instruction posted and accepts it. */
async function standIn(features: string[], status?: Record<string, unknown>) {
  const posted: Record<string, unknown>[] = [];
  const canonical = target(); const execution = h.engine.record.executionId;
  const fake = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (status && request.method === "GET" && request.url?.startsWith("/api/control/v1/status")) { response.end(JSON.stringify({ schema_version: "1", ok: true, observed_at: new Date().toISOString(), prd_path: canonical, execution_id: execution, errors: [], ...status })); return; }
    if (request.method === "GET" && request.url === "/api/control/v1/capabilities") { response.end(JSON.stringify({ protocol_major: 1, execution_id: execution, prd_path: canonical, instance: { pid: process.pid, process_start_time: null }, features })); return; }
    if (request.method === "POST" && request.url === "/api/control/v1/commands") {
      const instruction = JSON.parse(await body(request)) as Record<string, unknown>; posted.push(instruction);
      response.end(JSON.stringify({ schema_version: "1", ok: true, observed_at: new Date().toISOString(), prd_path: canonical, execution_id: execution, command_id: instruction.command_id, operation: { state: "accepted", action: instruction.action }, errors: [] })); return;
    }
    response.writeHead(404); response.end("{}");
  });
  await new Promise<void>((resolve, reject) => { fake.once("error", reject); fake.listen(0, "127.0.0.1", resolve); });
  await lockOn((fake.address() as AddressInfo).port);
  return { posted, close: () => new Promise<void>(resolve => { fake.closeAllConnections(); fake.close(() => resolve()); }) };
}


it("sends merge from the command line, lists it in kiln status, and refuses a controller without after_delivery", async () => {
  await stopped();
  // A run still at Needs you: kiln status lists merge, unavailable, with its reason.
  const status = await cli(["status", target(), "--json"]);
  expect(status.code, status.stdout).toBe(0);
  expect((status.json().controls as { name: string }[]).find(one => one.name === "merge")).toMatchObject({ available: false, reason: "Merge with the agent is offered once every phase is done and its pull requests are open.", invocation: ["kiln", "merge", target()] });
  const help = await cli(["merge", "--help"]);
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("kiln merge <PRD-path> [options]");
  expect(help.stdout).toContain("It brings each base branch into its feature branch, resolves any conflicts, runs the tests, pushes, waits for the required checks and merges the delivery’s open pull requests");
  expect(help.stdout).toContain("may start that repository’s CI or deployment");
  await server!.close(); server = undefined;
  const safety = (id: string) => ["--only-if-status-matches", `${h.engine.record.executionId}:token`, "--command-id", id, "--json"];
  const current = await standIn(["status", "commands", "command_status", "after_delivery"]);
  try {
    expect((await cli(["merge", target(), ...safety("merge-1")])).code).toBe(0);
    expect(current.posted).toEqual([{ command_id: "merge-1", execution_id: h.engine.record.executionId, status_token: `${h.engine.record.executionId}:token`, action: "merge", inputs: { via: "command_line" } }]);
  } finally { await current.close(); }
  const older = await standIn(["status", "commands", "command_status", "reset", "loop_limits_move_on"]);
  try {
    const answer = await cli(["merge", target(), ...safety("merge-old")]);
    expect(answer.code).toBe(4);
    expect(answer.json().errors).toEqual([expect.objectContaining({ code: "instance_incompatible", message: "This controller does not support merge. Restart it with updated Kiln." })]);
    expect(older.posted).toEqual([]);
  } finally { await older.close(); }
});

it("sends exit from the command line, lists it in kiln status, and refuses a controller without after_delivery (Kiln After Delivery AC-BOT-01)", async () => {
  await stopped();
  // A run still at Needs you: kiln status lists exit, unavailable, with its reason (AC-EXIT-01).
  const status = await cli(["status", target(), "--json"]);
  expect(status.code, status.stdout).toBe(0);
  expect((status.json().controls as { name: string }[]).find(one => one.name === "exit")).toMatchObject({ available: false, reason: "Exit Kiln is offered once every phase is done. Ctrl+C stops Kiln now.", invocation: ["kiln", "exit", target()] });
  const help = await cli(["exit", "--help"]);
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("kiln exit <PRD-path> [options]");
  await server!.close(); server = undefined;
  const safety = (id: string) => ["--only-if-status-matches", `${h.engine.record.executionId}:token`, "--command-id", id, "--json"];
  const current = await standIn(["status", "commands", "command_status", "after_delivery"]);
  try {
    expect((await cli(["exit", target(), ...safety("exit-1")])).code).toBe(0);
    expect(current.posted).toEqual([{ command_id: "exit-1", execution_id: h.engine.record.executionId, status_token: `${h.engine.record.executionId}:token`, action: "exit", inputs: { via: "command_line" } }]);
  } finally { await current.close(); }
  const older = await standIn(["status", "commands", "command_status", "reset", "loop_limits_move_on"]);
  try {
    const answer = await cli(["exit", target(), ...safety("exit-old")]);
    expect(answer.code).toBe(4);
    expect(answer.json().errors).toEqual([expect.objectContaining({ code: "instance_incompatible", message: "This controller does not support exit. Restart it with updated Kiln." })]);
    expect(older.posted).toEqual([]);
  } finally { await older.close(); }
});
