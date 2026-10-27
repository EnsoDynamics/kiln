import { claudeConfigFolder, findTranscripts } from "../session/transcripts.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startLocalServer } from "../server/local-server.js";
import { processStartTime } from "../platform/process-start-time.js";
import { isPortFree } from "../state/instance-lock.js";
import { writeJsonAtomically } from "../state/state-files.js";
import * as durable from "./durable-file.js";
import * as records from "../state/records.js";
// Real engine, provider subprocess stand-in, HTTP, durable files and disposable Git origins.
// Actual provider delivery and the local bot workflow have separate release evidence.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { readReceipts, type Receipt } from "./commands.js";
let h: Harness;
afterEach(async () => { vi.restoreAllMocks(); await h?.cleanup(); });
async function setup() {
  h = await createHarness({ sessions: [{ actions: [{ result: "Use the blue option?" }] }, { actions: [{ result: "Reply received." }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
}
function instruction(action: string, id: string, inputs: Record<string, unknown> = {}, token = h.engine.controlView().token) { return { command_id: id, execution_id: h.engine.record.executionId!, status_token: token, action, inputs }; }
async function submit(action: string, id: string, inputs: Record<string, unknown> = {}) {
  const body = instruction(action, id, inputs); const answer = h.engine.commands.submit(body);
  await h.engine.commands.settled(); return { body, answer, receipt: h.engine.commands.lookup(id).operation as Receipt };
}
function finish() {
  const file = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
  git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md");
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: finish disposable phase");
  git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
}
it("delivers a literal reply once and replays the durable receipt after the stop changes", async () => {
  await setup();
  const { body, answer, receipt } = await submit("reply", "reply-1", { message: 'Blue "quoted"\n$(touch do-not-execute) 🐦' });
  expect(answer.ok).toBe(true); expect(receipt.state).toBe("completed"); expect(receipt.effects.session).toBe("resumed"); expect(receipt.effects.reply).toBe("submitted");
  await h.engine.settled();
  expect(h.claudeCalls()).toHaveLength(2);
  expect(h.engine.commands.submit(body).operation).toEqual(expect.objectContaining({ id: receipt.id, state: "completed" }));
  expect(h.claudeCalls()).toHaveLength(2);
  expect(() => h.engine.commands.submit({ ...body, inputs: { message: "different" } })).toThrow(/different inputs/);
  expect(readReceipts(h.stateDirectory).find(r => r.command_id === "reply-1")?.reply_text).toBe(body.inputs.message);
  const stale = h.engine.commands.submit(instruction("reply", "old-stop", { message: "Never to the later stop" }, body.status_token));
  expect(stale.errors[0]?.code).toBe("stale_status_token"); expect(h.claudeCalls()).toHaveLength(2);
});
it("preserves a complete phase's unsent text and requires explicit acknowledgement before advancing", async () => {
  await setup(); finish();
  const { receipt } = await submit("reply", "complete-reply", { message: "Unsent reply" });
  expect(receipt.outcome).toBe("phase_already_complete"); expect(receipt.effects.reply).toBe("not_sent"); expect(h.claudeCalls()).toHaveLength(1);
  const refused = h.engine.commands.submit(instruction("verify-and-advance", "no-ack"));
  expect(refused.errors[0]?.code).toBe("unsent_reply_acknowledgement_required");
  h.engine.record.pause.requestedAt = new Date().toISOString();
  const advanced = await submit("verify-and-advance", "advance", { without_sending_reply: true });
  await h.engine.settled();
  expect(advanced.receipt.effects.plan).toBe("advanced"); expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.pause.activeSince).toBeDefined();
  expect((h.engine.commands.lookup("complete-reply").operation as Receipt).acknowledged_by).toBe(advanced.receipt.id);
});
it("serializes distinct concurrent requests and rejects input ambiguity before effects", async () => {
  await setup();
  const body = instruction("verify-and-advance", "first");
  expect(h.engine.commands.submit(body).ok).toBe(true);
  expect(h.engine.commands.submit(instruction("reply", "competing", { message: "no" })).errors[0]?.code).toBe("busy");
  expect(h.engine.commands.submit(body).command_id).toBe("first");
  await h.engine.commands.settled();
  expect((h.engine.commands.lookup("first").operation as Receipt).outcome).toBe("completion_checks_failed");
  expect(() => h.engine.commands.submit(instruction("settings", "invalid", { keep_awake: "on" }))).toThrow(/boolean/);
  expect(h.claudeCalls()).toHaveLength(1);
});

it("keeps receipts across restart and rejects an unaccepted token from the previous controller", async () => {
  await setup();
  const change = await submit("settings", "settings-restart", { keep_awake: false });
  expect(change.receipt.settings).toMatchObject({ keep_awake: false, resume_after_usage_limit: h.engine.record.settings.resumeAfterUsageLimit });
  const oldToken = h.engine.controlView().token;
  h.engine.close(); h.engine = h.reopenFromDisk();
  expect(h.engine.commands.submit(change.body).operation).toEqual(expect.objectContaining({ id: change.receipt.id, state: "completed" }));
  expect(h.engine.commands.submit(instruction("settings", "late-after-restart", { keep_awake: true }, oldToken)).errors[0]?.code).toBe("stale_status_token");
  expect(h.engine.record.settings.keepAwake).toBe(false); expect(h.claudeCalls()).toHaveLength(1);
});
it("a failed durable admission starts no effect and leaves no accepted receipt", async () => {
  await setup();
  const write = durable.writeDurableMetadata;
  vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => { if (path.includes("/controls/")) throw new Error("injected disk failure"); write(path, value); });
  expect(() => h.engine.commands.submit(instruction("reply", "disk-refusal", { message: "Not delivered" }))).toThrow(/durable control write failed/);
  expect(h.claudeCalls()).toHaveLength(1); expect(readReceipts(h.stateDirectory).filter(r => r.source === "caller")).toHaveLength(0);
});
it("reconciles a persisted effect before considering a different instruction", async () => {
  await setup();
  h.engine.commands.submit(instruction("settings", "proven-setting", { keep_awake: false }));
  const pending = h.engine.commands.active!;
  await h.engine.commands.settled();
  // Retain an interrupted receipt while the correlated PRD effect is durable.
  pending.state = "indeterminate"; pending.stage = "applying"; h.engine.commands.checkpoint(pending);
  const next = h.engine.commands.submit(instruction("settings", "next-setting", { keep_awake: true }));
  expect(next.errors.map(error => error.code)).not.toContain("busy");
  expect(readReceipts(h.stateDirectory).find(receipt => receipt.command_id === "proven-setting")).toMatchObject({ state: "completed", settings: { keep_awake: false } });
  await h.engine.commands.settled(); expect(h.claudeCalls()).toHaveLength(1);
});
it("reconciles a settlement-write failure from the correlated effect without a second turn", async () => {
  await setup();
  const write = durable.writeDurableMetadata;
  const failure = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    const receipt = (value as { receipt?: Receipt }).receipt;
    if (receipt?.command_id === "settlement-failure" && receipt.stage === "settled") throw new Error("settlement write interrupted");
    write(path, value);
  });
  const body = instruction("reply", "settlement-failure", { message: "Exactly once" });
  h.engine.commands.submit(body); await h.engine.commands.settled(); await h.engine.settled();
  expect(h.claudeCalls()).toHaveLength(2); expect(h.engine.commands.blocked).toBe(true);
  failure.mockRestore(); h.engine.close(); h.engine = h.reopenFromDisk();
  expect(h.engine.commands.submit(body).operation).toEqual(expect.objectContaining({ state: "completed", outcome: "session_resumed" }));
  expect(h.claudeCalls()).toHaveLength(2);
});
it("a failed completion acceptance preserves the stop and starts no following activity", async () => {
  await setup(); finish();
  const write = records.writePrdRecord;
  vi.spyOn(records, "writePrdRecord").mockImplementation((directory, record) => { if (record.phases["1"]?.doneAt) throw new Error("completion write failed"); write(directory, record); });
  const attempt = await submit("verify-and-advance", "completion-write-failure");
  expect(attempt.receipt.state).toBe("failed"); expect(attempt.receipt.outcome).toBe("state_write_failed");
  expect(h.engine.record.phases["1"]?.doneAt).toBeUndefined(); expect(h.engine.record.phases["1"]?.stop).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
});

it("the built CLI transports file/stdin literally, replays through HTTP, and refuses malformed inputs before dispatch", async () => {
  await setup();
  let port = 41820; while (!(await isPortFree(port))) port++;
  const server = await startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
  try {
    writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });
    const path = join(h.repository, h.engine.record.prdDirectory);
    const message = 'Literal "quotes"\n$(touch forbidden) `pwd` 🐦';
    const file = join(h.sandbox.root, "reply with spaces.txt"); writeFileSync(file, `  ${message}\n`);
    const status = await cli(["status", path, "--json"]); const token = status.body.status_token;
    const args = ["reply", path, "--command-id", "http-literal", "--only-if-status-matches", String(token), "--json"];
    const first = await cli([...args, "--message-file", file]); expect(first.code).toBe(0);
    await h.engine.commands.settled(); await h.engine.settled();
    const replay = await cli([...args, "--message-from-stdin"], Buffer.from(`${message}\n`));
    expect(replay.code).toBe(0); expect(replay.body.operation).toMatchObject({ reply_text: message, state: "completed" }); expect(h.claudeCalls()).toHaveLength(2);
    expect(h.claudeCalls().at(-1)?.prompt).toContain(message);
    const conflict = await cli([...args, "--message-from-stdin"], Buffer.from("other")); expect(conflict.code).toBe(2); expect(conflict.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "command_id_conflict" })]));
    for (const bytes of [Buffer.from([0xff]), Buffer.from("\0bad"), Buffer.alloc(32769, 120), Buffer.from(" ")]) {
      const invalid = await cli([...args, "--message-from-stdin"], bytes); expect(invalid.code).toBe(2); expect(invalid.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid_input" })]));
    }
    const duplicate = await fetch(`http://127.0.0.1:${port}/api/control/v1/commands`, { method: "POST", headers: { Origin: `http://127.0.0.1:${port}`, "X-Kiln-Token": h.engine.record.token }, body: '{"command_id":"a","command_id":"b"}' });
    expect(duplicate.status).toBe(400); expect(h.claudeCalls()).toHaveLength(2);
    const missing = await cli(["command-status", path, "--command-id", "missing", "--json"]); expect(missing.code).toBe(2);
    const statusReceipt = await cli(["command-status", path, "--command-id", "http-literal", "--json"]); expect(statusReceipt.body.operation).toMatchObject({ state: "completed" });
  } finally { await server.close(); }
});
async function cli(args: string[], input?: Buffer): Promise<{ code: number | null; body: Record<string, unknown> }> {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; let error = ""; child.stdout.on("data", b => output += String(b)); child.stderr.on("data", b => error += String(b)); child.stdin.on("error", () => {}); child.stdin.end(input);
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  expect(error).toBe(""); return { code, body: JSON.parse(output) as Record<string, unknown> };
}

it("a write failure after provider stdin retains uncertainty and blocks a second dispatch", async () => {
  await setup();
  const write = records.writeSessionRecord;
  const failure = vi.spyOn(records, "writeSessionRecord").mockImplementation((directory, record) => {
    if (record.runs.at(-1)?.control?.submitted && record.runs.length > 1) throw new Error("interrupted after stdin");
    write(directory, record);
  });
  const body = instruction("reply", "stdin-interrupted", { message: "Could have arrived" });
  h.engine.commands.submit(body); await h.engine.commands.settled(); await h.engine.settled();
  expect(h.engine.commands.lookup("stdin-interrupted").operation).toMatchObject({ state: "indeterminate", effects: { reply: "unknown", session: "unknown" } });
  failure.mockRestore(); h.engine.close(); h.engine = h.reopenFromDisk();
  expect(h.engine.commands.submit(body).operation).toMatchObject({ state: "indeterminate" });
  expect(h.engine.commands.submit(instruction("resume", "new-while-unknown")).errors[0]?.code).toBe("busy");
  expect(h.engine.record.phases["1"]?.doneAt).toBeUndefined();
  expect(h.claudeCalls().length).toBeLessThanOrEqual(2);
});
it("an old command remains bound to its original execution after path reuse", async () => {
  await setup();
  const old = await submit("settings", "original-execution", { keep_awake: false });
  const original = h.engine.record.executionId;
  h.engine.record.executionId = "replacement-execution";
  const replay = h.engine.commands.submit(old.body);
  expect(replay.execution_id).toBe(original); expect(replay.operation).toMatchObject({ id: old.receipt.id });
  const stale = h.engine.commands.submit({ ...old.body, command_id: "unaccepted-old-execution" });
  expect(stale.errors[0]?.code).toBe("stale_status_token"); expect(h.claudeCalls()).toHaveLength(1);
});

it("does not reconcile an unsaved settings effect from mutable memory", async () => {
  await setup();
  const prior = h.engine.record.settings.keepAwake;
  const write = records.writePrdRecord;
  const failure = vi.spyOn(records, "writePrdRecord").mockImplementation((directory, record) => {
    if (record.settings.keepAwake !== prior) throw new Error("failed settings persistence");
    write(directory, record);
  });
  const body = instruction("settings", "unsaved-setting", { keep_awake: !prior });
  h.engine.commands.submit(body); await h.engine.commands.settled();
  expect(h.engine.commands.lookup("unsaved-setting").operation).toMatchObject({ state: "indeterminate" });
  expect(records.readPrdRecord(h.stateDirectory)?.settings.keepAwake).toBe(prior);
  failure.mockRestore(); h.engine.close(); h.engine = h.reopenFromDisk();
  expect(h.engine.commands.submit(body).operation).toMatchObject({ state: "indeterminate" });
  expect(h.engine.record.settings.keepAwake).toBe(prior);
});
it("browser retries return the original receipt before evaluating the new stop", async () => {
  await setup();
  let port = 41840; while (!(await isPortFree(port))) port++;
  const server = await startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
  const target = h.engine.phaseRecoveryTarget(); const token = h.engine.controlView().token;
  const post = () => fetch(`http://127.0.0.1:${port}/api/resume`, { method: "POST", headers: { Origin: `http://127.0.0.1:${port}`, "X-Kiln-Token": h.engine.record.token, "X-Kiln-Status": token, "X-Kiln-Command-Id": "browser-retry", "Content-Type": "application/json" }, body: JSON.stringify({ target, note: "Use blue" }) });
  try {
    const first = await post(); expect(first.status).toBe(200); const answer = await first.json() as Record<string, unknown>; await h.engine.settled();
    const again = await post(); expect(again.status).toBe(200); const retried = await again.json() as Record<string, unknown>; expect(retried.operation).toEqual(answer.operation); expect(retried.target).toEqual(answer.target); expect(h.claudeCalls()).toHaveLength(2);
  } finally { await server.close(); }
});

it("confirms only the exact current-attempt message without rewriting session history or dispatching", async () => {
  await setup(); const sent = await submit("reply", "history-proof", { message: "Preserve the literal reply" }); await h.engine.settled();
  const session = h.engine.latestSession("1")!; const file = findTranscripts(claudeConfigFolder(h.env), session.sessionId).main!;
  const sessionFile = join(h.stateDirectory, "1", session.sessionId, "session.json"); const before = readFileSync(sessionFile, "utf8");
  const prompt = h.claudeCalls().at(-1)!.prompt;
  writeFileSync(file, readFileSync(file, "utf8").split("\n").filter(line => !line || JSON.parse(line).message?.content !== prompt).join("\n"));
  const row = (sessionId: string, timestamp: string, content: string) => JSON.stringify({ type: "user", sessionId, timestamp, message: { content } }) + "\n";
  appendFileSync(file, row("wrong-conversation", new Date().toISOString(), prompt) + row(session.sessionId, "2000-01-01T00:00:00Z", prompt) + row(session.sessionId, new Date().toISOString(), "different reply"));
  expect((await h.engine.refreshCommand("history-proof")).operation).toMatchObject({ effects: { reply: "submitted" } });
  appendFileSync(file, row(session.sessionId, new Date().toISOString(), prompt));
  expect((await h.engine.refreshCommand("history-proof")).operation).toMatchObject({ id: sent.receipt.id, state: "completed", effects: { reply: "delivered" } });
  expect(readFileSync(sessionFile, "utf8")).toBe(before); expect(h.claudeCalls()).toHaveLength(2);
});
it("automatic restart recovery excludes browser and API resume and persists one correlated dispatch", async () => {
  h = await createHarness({ sessions: [{ actions: [{ waitForFile: "never-released" }] }, { actions: [{ result: "Recovered once" }] }] });
  await h.engine.start({ refinementConfirmed: true }); await waitFor(() => h.claudeCalls().length === 1 && h.engine.current?.processRunning === true);
  await h.engine.stop("sigint"); h.engine = h.reopenFromDisk(); await h.engine.prepare();
  expect((await h.engine.decide()).kind).toBe("resume");
  const gate = join(h.sandbox.root, "release-automatic-preflight"); h.env.KILN_STANDIN_VERSION_WAIT = gate;
  let port = 41860; while (!(await isPortFree(port))) port++;
  const server = await startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
  const origin = `http://127.0.0.1:${port}`;
  const recovery = h.engine.continue();
  try {
    await waitFor(() => h.engine.billing.view.pending);
    const headers = { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" };
    for (const [path, body] of [["resume", {}], ["control/v1/commands", instruction("resume", "competing-with-auto")]] as const) {
      const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers, body: JSON.stringify(body) }); expect(response.status).toBe(409);
    }
    writeFileSync(gate, ""); await recovery; await h.engine.settled();
    const automatic = readReceipts(h.stateDirectory).filter(r => r.source === "automatic").sort((a, b) => a.sequence - b.sequence).at(-1)!;
    expect(automatic).toMatchObject({ state: "completed", effects: { session: "resumed" } });
    expect(h.engine.latestSession("1")!.runs.at(-1)!.control?.operationId).toBe(automatic.id);
    h.engine.commands.submit(automatic.instruction); expect(h.claudeCalls()).toHaveLength(2);
  } finally { writeFileSync(gate, ""); delete h.env.KILN_STANDIN_VERSION_WAIT; await recovery; await server.close(); }
});
