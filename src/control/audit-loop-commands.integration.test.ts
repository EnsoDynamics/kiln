// Kiln Audit Loop Limits AC-STOP-03 through the built CLI: `kiln settings` reads and changes the
// three loop settings on a real controller, `kiln status` carries the counts, the stop commands
// send the instructions the control route expects (never a `via`), and a controller without the
// `audit_loops` feature is refused before anything is sent. Needs `dist/` (npm run build).
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
async function token(): Promise<string> {
  const status = await cli(["status", target(), "--json"]); expect(status.code, status.stdout).toBe(0);
  return status.json().status_token as string;
}
const body = (request: IncomingMessage) => new Promise<string>(resolve => { let text = ""; request.on("data", chunk => text += String(chunk)); request.on("end", () => resolve(text)); });

/** A stand-in controller for this execution advertising `features`; it records each instruction posted and accepts it. */
async function standIn(features: string[]) {
  const posted: Record<string, unknown>[] = [];
  const canonical = target(); const execution = h.engine.record.executionId;
  const fake = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
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

it("reads and changes the three loop settings during a run, recording the command line as where the choice was made", async () => {
  await stopped();
  const read = await cli(["settings", target(), "--json"]);
  expect(read.code, read.stdout).toBe(0);
  expect(read.json().data).toMatchObject({ keep_awake: expect.any(Boolean), resume_after_usage_limit: expect.any(Boolean), delivery_audit_loops: 3, test_audit_loops: 3, after_last_test_audit_loop: "deliver_unless_serious" });

  // A loop flag makes settings a changing command, and a limit outside 1 or more is invalid_input with nothing sent.
  expect((await cli(["settings", target(), "--test-audit-loops", "2", "--json"])).code).toBe(2);
  const zero = await cli(["settings", target(), "--test-audit-loops", "0", "--only-if-status-matches", await token(), "--command-id", "zero-loops", "--json"]);
  expect(zero.code).toBe(2); expect(zero.json().errors).toEqual([expect.objectContaining({ code: "invalid_input" })]);
  expect((await cli(["settings", target(), "--after-last-test-audit-loop", "never", "--only-if-status-matches", await token(), "--command-id", "bad-choice", "--json"])).code).toBe(2);

  const changed = await cli(["settings", target(), "--delivery-audit-loops", "4", "--test-audit-loops", "5", "--after-last-test-audit-loop", "ask", "--only-if-status-matches", await token(), "--command-id", "loops-1", "--json"]);
  expect(changed.code, changed.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.auditLoops).toMatchObject({ deliveryLimit: 4, testLimit: 5, afterLastTest: "stop_and_ask", afterLastTestSource: { kind: "person", where: "command_line" } });

  // A limit alone needs no via and leaves the source alone.
  const limitOnly = await cli(["settings", target(), "--delivery-audit-loops", "2", "--only-if-status-matches", await token(), "--command-id", "loops-2", "--json"]);
  expect(limitOnly.code, limitOnly.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.auditLoops).toMatchObject({ deliveryLimit: 2, testLimit: 5, afterLastTest: "stop_and_ask", afterLastTestSource: { where: "command_line" } });

  const after = await cli(["settings", target(), "--json"]);
  expect(after.json().data).toMatchObject({ delivery_audit_loops: 2, test_audit_loops: 5, after_last_test_audit_loop: "stop_and_ask" });

  // kiln status: the counts in JSON and on one line of text, and the two stop controls with their reasons.
  const status = await cli(["status", target(), "--json"]);
  expect(status.json().audit_loops).toMatchObject({ settings: { deliveryLimit: 2, testLimit: 5, afterLastTest: "stop_and_ask" }, delivery: { used: 0, limit: 2 }, test: { used: 0, limit: 5 } });
  expect(status.json().audit_loops).not.toHaveProperty("stop");
  const controls = status.json().controls as { name: string; available: boolean; reason: string | null; invocation: string[] | null }[];
  for (const name of ["allow-more-loops", "accept-and-deliver"]) expect(controls.find(c => c.name === name)).toMatchObject({ available: false, reason: "Kiln isn't stopped because its audit loops are used up.", invocation: ["kiln", name, target()] });
  const text = await cli(["status", target()]);
  expect(text.stdout).toContain("Audit loops: delivery 0 of 2 · test 0 of 5 · after the last test audit loop: always stop and ask me\n");
  expect(text.stdout).not.toContain("Controls available at this stop");
  const full = await cli(["status", target(), "--detail", "full", "--json"]);
  expect(full.json().settings).toMatchObject({ delivery_audit_loops: 2, test_audit_loops: 5, after_last_test_audit_loop: "stop_and_ask" });

  // Away from a loop stop both stop commands are refused, and nothing changes.
  for (const [name, extra] of [["allow-more-loops", ["--loops", "2"]], ["accept-and-deliver", []]] as const) {
    const refused = await cli([name, target(), ...extra, "--only-if-status-matches", await token(), "--command-id", `${name}-here`, "--json"]);
    expect(refused.code, refused.stdout).toBe(3);
    expect(refused.json()).toMatchObject({ ok: false, errors: [{ code: "not_at_loop_stop" }], operation: { state: "refused", outcome: "not_at_loop_stop", action: name, reason: "Kiln isn't stopped because its audit loops are used up." } });
  }
  expect(h.engine.record.settings.auditLoops).toMatchObject({ deliveryLimit: 2, testLimit: 5 });
});

it("sends allow-more-loops with its count, and accept-and-deliver and an After the last test audit loop change without a via", async () => {
  await stopped();
  await server!.close(); server = undefined;
  const controller = await standIn(["status", "commands", "command_status", "audit_loops"]);
  try {
    const safety = (id: string) => ["--only-if-status-matches", `${h.engine.record.executionId}:token`, "--command-id", id, "--json"];
    expect((await cli(["allow-more-loops", target(), "--loops", "3", ...safety("allow-1")])).code).toBe(0);
    expect((await cli(["accept-and-deliver", target(), ...safety("accept-1")])).code).toBe(0);
    expect((await cli(["settings", target(), "--after-last-test-audit-loop", "deliver", "--test-audit-loops", "4", ...safety("settings-1")])).code).toBe(0);
    // An invalid count never reaches the controller.
    expect((await cli(["allow-more-loops", target(), "--loops", "0", ...safety("allow-0")])).code).toBe(2);
    expect(controller.posted).toEqual([
      { command_id: "allow-1", execution_id: h.engine.record.executionId, status_token: `${h.engine.record.executionId}:token`, action: "allow-more-loops", inputs: { count: 3 } },
      { command_id: "accept-1", execution_id: h.engine.record.executionId, status_token: `${h.engine.record.executionId}:token`, action: "accept-and-deliver", inputs: {} },
      { command_id: "settings-1", execution_id: h.engine.record.executionId, status_token: `${h.engine.record.executionId}:token`, action: "settings", inputs: { test_audit_loops: 4, after_last_test_audit_loop: "deliver_unless_serious" } },
    ]);
  } finally { await controller.close(); }
});

it("refuses the stop commands and the loop settings with instance_incompatible against a controller without audit loops, sending nothing", async () => {
  await stopped();
  await server!.close(); server = undefined;
  const controller = await standIn(["status", "commands", "command_status", "settings", "carry_on", "start_again", "reset"]);
  try {
    const safety = (id: string) => ["--only-if-status-matches", `${h.engine.record.executionId}:token`, "--command-id", id, "--json"];
    for (const args of [["allow-more-loops", target(), "--loops", "2"], ["accept-and-deliver", target()], ["settings", target(), "--test-audit-loops", "4"], ["settings", target(), "--after-last-test-audit-loop", "ask"]]) {
      const answer = await cli([...args, ...safety(`old-${args[0]}-${args.length}`)]);
      expect(answer.code, args.join(" ")).toBe(4);
      expect(answer.json().errors).toEqual([expect.objectContaining({ code: "instance_incompatible", message: "This controller does not support audit loop limits. Restart it with updated Kiln." })]);
    }
    // The older settings still reach it.
    expect((await cli(["settings", target(), "--keep-awake", "on", ...safety("old-keep-awake")])).code).toBe(0);
    expect(controller.posted.map(one => one.action)).toEqual(["settings"]);
  } finally { await controller.close(); }
});
