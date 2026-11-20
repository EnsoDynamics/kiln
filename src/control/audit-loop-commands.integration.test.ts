// Kiln Deliver When Audit Loops Run Out through the built CLI: `kiln settings` reads and changes the
// two limits on a real controller (AC-CHOICE-01, AC-CHOICE-02), `kiln status` carries the counts and
// the controls (AC-BOT-01), the removed loop stop commands and setting are refused before anything is
// read (AC-STOP-04), and a controller without `loop_limits_move_on` is refused before anything is
// sent. Needs `dist/` (npm run build).
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { FOLDER } from "../test-support/fixture-documents.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { processStartTime } from "../platform/process-start-time.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { writeSessionRecord } from "../state/records.js";

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

it("reads and changes the two limits during a run, refusing a limit below the runs already made", async () => {
  await stopped();
  const read = await cli(["settings", target(), "--json"]);
  expect(read.code, read.stdout).toBe(0);
  expect(read.json().data).toMatchObject({ keep_awake: expect.any(Boolean), resume_after_usage_limit: expect.any(Boolean), delivery_audit_loops: 4, test_audit_loops: 4 });
  expect(read.json().data).not.toHaveProperty("after_last_test_audit_loop");
  expect((await cli(["settings", target()])).stdout).toMatch(/^Max delivery audit loops: 4 · Max test audit loops: 4\n/);

  // A loop flag makes settings a changing command, and a limit outside 1 or more is invalid_input with nothing sent.
  expect((await cli(["settings", target(), "--test-audit-loops", "2", "--json"])).code).toBe(2);
  const zero = await cli(["settings", target(), "--test-audit-loops", "0", "--only-if-status-matches", await token(), "--command-id", "zero-loops", "--json"]);
  expect(zero.code).toBe(2); expect(zero.json().errors).toEqual([expect.objectContaining({ code: "invalid_input" })]);

  const changed = await cli(["settings", target(), "--delivery-audit-loops", "6", "--test-audit-loops", "5", "--only-if-status-matches", await token(), "--command-id", "loops-1", "--json"]);
  expect(changed.code, changed.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.auditLoops).toEqual({ deliveryLimit: 6, testLimit: 5 });

  // Below the floor: two delivery audits already made in this execution, so 1 is refused at admission with the floor named.
  const at = new Date().toISOString();
  h.engine.record.auditLoops!.loops.push({ kind: "delivery", number: 1, startedAt: at, activityKey: "audit-a" }, { kind: "delivery", number: 2, startedAt: at, activityKey: "audit-b" });
  const below = await cli(["settings", target(), "--delivery-audit-loops", "1", "--only-if-status-matches", await token(), "--command-id", "below-floor", "--json"]);
  expect(below.code, below.stdout).toBe(2);
  expect(below.json().errors).toEqual([expect.objectContaining({ code: "invalid_input", message: "Enter 2 or more: this run has already made 2 delivery audit loops." })]);
  // At the floor: accepted, which makes the audit already run the last of its kind.
  expect((await cli(["settings", target(), "--delivery-audit-loops", "2", "--only-if-status-matches", await token(), "--command-id", "at-floor", "--json"])).code).toBe(0);
  await h.engine.commands.settled();
  expect(h.engine.record.settings.auditLoops).toEqual({ deliveryLimit: 2, testLimit: 5 });

  // kiln status: the counts, closure and floors in JSON and on one line of text, and no stop page.
  const status = await cli(["status", target(), "--json"]);
  expect(status.json().audit_loops).toEqual({ settings: { deliveryLimit: 2, testLimit: 5 }, delivery: { used: 2, limit: 2, closed: true, floor: 2 }, test: { used: 0, limit: 5, closed: false, floor: 1 }, position: { audit: "delivery", loop: 2, limit: 2 } });
  const text = await cli(["status", target()]);
  expect(text.stdout).toContain("Delivery audit loop 2 of 2\nAudit loops: delivery 2 of 2 · test 0 of 5\n");
  const full = await cli(["status", target(), "--detail", "full", "--json"]);
  expect(full.json().settings).toMatchObject({ delivery_audit_loops: 2, test_audit_loops: 5 });
  expect(full.json().settings).not.toHaveProperty("after_last_test_audit_loop");

  // The finished page's controls are listed with why they are unavailable on a run that isn't finished (AC-BOT-01).
  const controls = status.json().controls as { name: string; available: boolean; reason: string | null; invocation: string[] | null; required_inputs: string[] }[];
  expect(controls.map(c => c.name)).not.toContain("allow-more-loops");
  expect(controls.map(c => c.name)).not.toContain("accept-and-deliver");
  expect(controls.find(c => c.name === "check-for-new-phases")).toMatchObject({ available: false, reason: "The run isn't finished, so there is nothing to check for new phases.", invocation: ["kiln", "check-for-new-phases", target()], required_inputs: ["PRD-path"] });
  expect(controls.find(c => c.name === "continue-with-phases")).toMatchObject({ available: false, reason: "The run isn't finished, so there is nothing to check for new phases.", required_inputs: ["PRD-path", "--proposal", "--only-if-status-matches", "--command-id"] });
  const check = await cli(["check-for-new-phases", target(), "--json"]);
  expect(check.code, check.stdout).toBe(3);
  expect(check.json().errors).toEqual([expect.objectContaining({ code: "wrong_activity" })]);
  const proposal = "a".repeat(64);
  const go = await cli(["continue-with-phases", target(), "--proposal", proposal, "--only-if-status-matches", await token(), "--command-id", "continue-early", "--json"]);
  expect(go.code, go.stdout).toBe(3);
  expect(go.json()).toMatchObject({ ok: false, operation: { state: "refused", action: "continuation-accept" } });

  // Opening the stopped session in a terminal is listed too, available, and the command it names opens that session (AC-BOT-01).
  const sessionId = h.engine.record.phases["1"]!.sessionIds.at(-1);
  expect(controls.find(c => c.name === "handoff")).toEqual({ name: "handoff", available: true, reason: null, required_inputs: ["PRD-path"], invocation: ["kiln", "handoff", target()] });
  expect(text.stdout).toMatch(/name: handoff\n\s+available: true\n\s+reason: unknown\n/);
  const handoff = await cli(["handoff", target(), "--json"]);
  expect((handoff.json().data as Record<string, unknown>).session_id).toBe(sessionId);
  // With the controller gone the other controls can't run, but kiln handoff reads saved sessions itself, so it stays available.
  await server!.close(); server = undefined;
  const disconnected = (await cli(["status", target(), "--json"])).json().controls as typeof controls;
  expect(disconnected.find(c => c.name === "settings")).toMatchObject({ available: false, invocation: null });
  expect(disconnected.find(c => c.name === "handoff")).toEqual({ name: "handoff", available: true, reason: null, required_inputs: ["PRD-path"], invocation: ["kiln", "handoff", target()] });
  // A conversation still live when the controller went away can't be released safely, so it isn't offered.
  const session = h.engine.latestSession("1")!; session.runs.at(-1)!.live = { attemptId: "held", gateDirectory: h.stateDirectory, configRoot: h.stateDirectory, profile: "test" }; delete session.runs.at(-1)!.endedAt;
  writeSessionRecord(h.stateDirectory, session);
  const live = (await cli(["status", target(), "--json"])).json().controls as typeof controls;
  expect(live.find(c => c.name === "handoff")).toMatchObject({ available: false, reason: "Controller disconnected; reconnect to establish safe terminal release." });
});

it("lists the handoff as unavailable, with why, while its session is running under Kiln (AC-BOT-01)", async () => {
  h = await createHarness({ sessions: [{ actions: [{ waitForFile: "never-created" }] }] });
  await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => !!h.engine.current?.processRunning && !!h.engine.current.session);
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: FOLDER, featureName: "Returns", token: h.engine.record.token });
  await lockOn(boundPort(server.address));
  const controls = (await cli(["status", target(), "--json"])).json().controls as { name: string; available: boolean; reason: string | null }[];
  expect(controls.find(c => c.name === "handoff")).toMatchObject({ available: false, reason: "This conversation is currently running under Kiln; a concurrent manual resume is unavailable." });
  expect((await cli(["status", target()])).stdout).toMatch(/name: handoff\n\s+available: false\n\s+reason: This conversation is currently running under Kiln; a concurrent manual resume is unavailable\.\n/);
});

it("refuses the removed loop stop commands and setting before reading any flag or the controller (AC-STOP-04)", async () => {
  await stopped();
  for (const args of [["allow-more-loops", target(), "--loops", "2"], ["accept-and-deliver", target()], ["allow-more-loops"], ["accept-and-deliver", "--nonsense"]]) {
    const refused = await cli([...args, "--json"]);
    expect(refused.code, args.join(" ")).toBe(2);
    expect(refused.json().errors).toEqual([expect.objectContaining({ code: "removed_command", message: "Kiln no longer stops at a loop limit. Change the limits with kiln settings." })]);
  }
  const setting = await cli(["settings", target(), "--after-last-test-audit-loop", "ask", "--json"]);
  expect(setting.code).toBe(2);
  expect(setting.json().errors).toEqual([expect.objectContaining({ code: "removed_command", message: expect.stringContaining("After the last test audit loop was removed") })]);
  // The control journal refuses them from an older script too, and nothing is recorded.
  for (const action of ["allow-more-loops", "accept-and-deliver"]) {
    expect(() => h.engine.commands.submit({ command_id: `old-${action}`, execution_id: h.engine.record.executionId, status_token: h.engine.controlView().token, action, inputs: {} })).toThrow("Kiln no longer stops at a loop limit. Change the limits with kiln settings.");
  }
  expect(() => h.engine.commands.submit({ command_id: "old-setting", execution_id: h.engine.record.executionId, status_token: h.engine.controlView().token, action: "settings", inputs: { after_last_test_audit_loop: "stop_and_ask", via: "command_line" } })).toThrow(/After the last test audit loop was removed/);
  expect(h.engine.commands.all().map(r => r.command_id)).not.toContain("old-allow-more-loops");
  // An older CLI posting either straight to the control route is refused there too.
  const origin = new URL(server!.address).origin;
  for (const action of ["allow-more-loops", "accept-and-deliver"]) {
    const posted = await fetch(`${origin}/api/control/v1/commands`, { method: "POST", headers: { "X-Kiln-Token": h.engine.record.token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ command_id: `raw-${action}`, execution_id: h.engine.record.executionId, status_token: h.engine.controlView().token, action, inputs: {} }) });
    expect(posted.status).toBe(400);
    expect(((await posted.json()) as { errors: unknown[] }).errors).toEqual([expect.objectContaining({ code: "removed_command", message: "Kiln no longer stops at a loop limit. Change the limits with kiln settings." })]);
  }
  // Their help is gone; the new commands have help of their own.
  expect((await cli(["--help"])).stdout).not.toContain("allow-more-loops");
  expect((await cli(["check-for-new-phases", "--help"])).code).toBe(0);
  expect((await cli(["continue-with-phases", "--help"])).stdout).toContain("--proposal");
});

it("sends continue-with-phases with its proposal and the loop limits, and refuses both against a controller without loop_limits_move_on", async () => {
  await stopped();
  await server!.close(); server = undefined;
  const safety = (id: string) => ["--only-if-status-matches", `${h.engine.record.executionId}:token`, "--command-id", id, "--json"];
  const proposal = "b".repeat(64);
  const current = await standIn(["status", "commands", "command_status", "settings", "loop_limits_move_on"]);
  try {
    expect((await cli(["continue-with-phases", target(), "--proposal", proposal, ...safety("continue-1")])).code).toBe(0);
    expect((await cli(["settings", target(), "--test-audit-loops", "6", ...safety("settings-1")])).code).toBe(0);
    expect(current.posted).toEqual([
      { command_id: "continue-1", execution_id: h.engine.record.executionId, status_token: `${h.engine.record.executionId}:token`, action: "continue-with-phases", inputs: { proposal_id: proposal } },
      { command_id: "settings-1", execution_id: h.engine.record.executionId, status_token: `${h.engine.record.executionId}:token`, action: "settings", inputs: { test_audit_loops: 6 } },
    ]);
  } finally { await current.close(); }
  const older = await standIn(["status", "commands", "command_status", "settings", "carry_on", "start_again", "reset", "audit_loops"]);
  try {
    for (const args of [["continue-with-phases", target(), "--proposal", proposal, ...safety("old-continue")], ["settings", target(), "--delivery-audit-loops", "4", ...safety("old-loops")], ["check-for-new-phases", target(), "--json"]]) {
      const answer = await cli(args);
      expect(answer.code, args.join(" ")).toBe(4);
      expect(answer.json().errors).toEqual([expect.objectContaining({ code: "instance_incompatible", message: "This controller does not support the new audit loop limits. Restart it with updated Kiln." })]);
    }
    // The older settings still reach it.
    expect((await cli(["settings", target(), "--keep-awake", "on", ...safety("old-keep-awake")])).code).toBe(0);
    expect(older.posted.map(one => one.action)).toEqual(["settings"]);
  } finally { await older.close(); }
});

it("prints the loop lines and a finished run's facts only from a controller that moves on at the limits (Compatibility, AC-BOT-02)", async () => {
  await stopped();
  await server!.close(); server = undefined;
  const answer = {
    state: "complete",
    audit_loops: { settings: { deliveryLimit: 4, testLimit: 4 }, delivery: { used: 4, limit: 4, closed: true, floor: 1 }, test: { used: 2, limit: 4, closed: false, floor: 1 } },
    delivered: { loops: { delivery: { used: 4, limit: 4 }, test: { used: 2, limit: 4 } }, forYou: { items: [{ kind: "test", line: "Test gap: AC-1 has no test. Write one." }], afterDelivery: [] }, pullRequests: [{ repository: "acme-shop", number: 214, url: "https://github.com/acme/acme-shop/pull/214" }] },
    continuation: { check: { status: "unchanged", attemptedAt: "2026-11-20T01:00:00Z", lastSuccessfulAt: null, errors: [] } },
  };
  const current = await standIn(["status", "commands", "loop_limits_move_on"], answer);
  try {
    const text = await cli(["status", target()]);
    expect(text.stdout).not.toContain("Audit loops:");
    expect(text.stdout).toContain("Closing audits: Delivery audit: 4 of 4 loops. Test audit: 2 of 4 loops.\nPull request: https://github.com/acme/acme-shop/pull/214\nFor you:\n  - Test gap: AC-1 has no test. Write one.\nCheck for new phases: unchanged at 2026-11-20T01:00:00Z\n");
    // A critical finding puts For you first, ahead of the loop counts.
    const critical = await standIn(["status", "commands", "loop_limits_move_on"], { ...answer, delivered: { ...answer.delivered, forYou: { items: [{ kind: "critical", line: "Critical finding: Keys are logged. Rotate them." }], afterDelivery: [] } } });
    try { expect((await cli(["status", target()])).stdout).toMatch(/For you:\n {2}- Critical finding: Keys are logged\. Rotate them\.\nClosing audits:/); } finally { await critical.close(); }
  } finally { await current.close(); }
  const older = await standIn(["status", "commands", "audit_loops"], answer);
  try {
    const text = await cli(["status", target()]);
    expect(text.stdout).not.toContain("Audit loops:");
    expect(text.stdout).not.toContain("Closing audits:");
    expect(text.stdout).not.toContain("For you:");
  } finally { await older.close(); }
});
