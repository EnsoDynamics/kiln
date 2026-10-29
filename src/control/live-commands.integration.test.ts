// Built CLI + authenticated real controller + durable files + disposable Git.
// Provider events are deterministic; the portable live-messages/takeover proofs
// separately cover the validated real Claude adapter and checkpoint contract.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { processStartTime } from "../platform/process-start-time.js";
import { isPortFree } from "../state/instance-lock.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { cacheSnapshot } from "./projection.js";
import { newPrdRecord } from "../state/new-record.js";
import { writePrdRecord } from "../state/records.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { readReceipts, type Receipt } from "./commands.js";
import type { Result } from "./result.js";
let h: Harness; let server: LocalServer | undefined; let origin: string;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });
const path = () => join(h.repository, h.engine.record.prdDirectory);
const receipt = (id: string) => h.engine.commands.lookup(id).operation as Receipt;
const input = () => existsSync(`${h.scenarioPath}.live-inputs.jsonl`) ? readFileSync(`${h.scenarioPath}.live-inputs.jsonl`, "utf8").trim().split("\n").map(s => JSON.parse(s) as { message: { content: string } }) : [];
async function serve() {
  let port = 43210; while (!await isPortFree(port)) port++;
  origin = `http://127.0.0.1:${port}`;
  server = await startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });
}
async function setup(actions: object[]) {
  h = await createHarness({ sessions: [] }); h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "ready");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, ...actions.map(a => Object.fromEntries(Object.entries(a).map(([key, value]) => [key, ["waitForFile", "touch"].includes(key) && typeof value === "string" && !isAbsolute(value) ? join(h.sandbox.root, value) : value])))] }, { actions: [{ result: "Continued." }] }] }));
  await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready));
  await waitFor(() => h.engine.liveView()?.input?.available === true); await serve();
  return h.engine.liveTarget()!;
}
async function cli(args: string[], bytes?: Buffer, json = true): Promise<{ code: number | null; body: Result; text: string }> {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args, ...(json ? ["--json"] : [])], { cwd: h.sandbox.root, env: h.env, stdio: ["pipe", "pipe", "pipe"] });
  let text = ""; let error = ""; child.stdout.on("data", b => text += String(b)); child.stderr.on("data", b => error += String(b)); child.stdin.on("error", () => {}); child.stdin.end(bytes);
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  expect(error).toBe(""); return { code, body: json ? JSON.parse(text) as Result : {} as Result, text };
}
async function status() { const s = await cli(["status", path()]); expect(s.code, s.text).toBe(0); return s.body; }
const args = (action: string, id: string, token = h.engine.controlView().token) => [action, path(), "--command-id", id, "--only-if-status-matches", token];
async function post(route: string, body: unknown, authenticated = true) {
  const response = await fetch(`${origin}/api/${route}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": authenticated ? h.engine.record.token : "wrong", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Result };
}
async function release() { await h.engine.settled(); await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; }); }

it.skipIf(process.platform !== "darwin")("sends exact file/stdin bytes once, preserves correlated receipts and retries across restart/execution replacement", async () => {
  const target = await setup([{ liveMessages: 1 }]);
  const text = "\ufeff  /literal @file 'quotes'\n$(touch forbidden) `pwd` 🐦\n "; const file = join(h.sandbox.root, "message with spaces.txt"); writeFileSync(file, text);
  const before = await status(); const command = args("message", "non.uuid-command_1", String(before.status_token));
  expect((before.live_control as { target: unknown }).target).toEqual(h.engine.liveTarget());
  expect((before.controls as { name: string; available: boolean }[]).find(c => c.name === "message")?.available).toBe(true);
  const sent = await cli([...command, "--message-file", file]); expect(sent.code, sent.text).toBe(0);
  await h.engine.commands.settled(); await h.engine.settled();
  expect(input().map(i => i.message.content)).toEqual([text]);
  expect(receipt("non.uuid-command_1")).toMatchObject({ message: { text, delivery: "received", resultAt: expect.any(String) }, effects: { message: "received", session: "not_started", plan: "not_advanced" } });
  const receiptJson = await cli(["command-status", path(), "--command-id", "non.uuid-command_1"]);
  expect(receiptJson.body.message_receipt).toBe("Received by Claude");
  const receiptText = await cli(["command-status", path(), "--command-id", "non.uuid-command_1"], undefined, false);
  expect(receiptText.code).toBe(0); expect(receiptText.text).toContain("Received by Claude"); expect(receiptText.text).toContain(text); expect(receiptText.text).toContain("plan: not_advanced");
  const ended = await post("control/v1/commands", { command_id: "late-explicit", execution_id: target.executionId, status_token: h.engine.controlView().token, action: "message", inputs: { target, text: "Never send to a successor" } });
  expect(ended.status).toBe(409); expect(receipt("late-explicit")).toMatchObject({ state: "refused", message: { delivery: "not_sent" } });
  const savedId = receipt("non.uuid-command_1").id;
  const retry = await cli([...command, "--message-from-stdin"], Buffer.from(text)); expect(retry.code).toBe(0); expect(retry.body.operation).toMatchObject({ id: savedId });
  const conflict = await cli([...command, "--message-from-stdin"], Buffer.from(text + "different")); expect(conflict.code).toBe(2);
  expect(conflict.body.errors[0]?.code).toBe("command_id_conflict");
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare(); await serve();
  expect((await cli([...command, "--message-file", file])).body.operation).toMatchObject({ id: savedId });
  await server!.close(); server = undefined; h.engine.close();
  const old = h.engine.record;
  writePrdRecord(h.stateDirectory, newPrdRecord({ mainCheckoutPath: h.repository, repositoryName: old.repository.name, github: old.repository.github, prdDirectoryFromRoot: old.prdDirectory, featureName: old.featureName, settings: old.settings }));
  h.engine = h.reopenFromDisk(); await h.engine.prepare(); await serve();
  const replacementRetry = await cli([...command, "--message-from-stdin"], Buffer.from(text));
  expect(replacementRetry.code, replacementRetry.text).toBe(0); expect(replacementRetry.body.operation).toMatchObject({ id: savedId });
  expect(input()).toHaveLength(1); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin")("guards material settings changes even with the same exact attempt, and rejects malformed/oversize input without effects", async () => {
  await setup([{ waitForFile: "output-release" }, { text: "Ordinary streamed observation." }, { touch: "output-seen" }, { waitForFile: "release" }, { result: "Natural ending." }]);
  const first = await status();
  writeFileSync(join(h.sandbox.root, "output-release"), "observe output"); await waitFor(() => existsSync(join(h.sandbox.root, "output-seen")));
  expect((await status()).status_token).toBe(first.status_token);
  const stale = args("message", "stale-settings", String(first.status_token));
  const changed = await cli([...args("settings", "set-usage"), "--resume-after-usage-limit", "off"]); expect(changed.code).toBe(0); await h.engine.commands.settled();
  expect((await cli([...stale, "--message-from-stdin"], Buffer.from("must not send"))).body.errors[0]?.code).toBe("stale_status_token");
  const token = String((await status()).status_token);
  const reused = await cli([...args("message", "set-usage", token), "--message-from-stdin"], Buffer.from("different intention"));
  expect(reused.code, reused.text).toBe(2); expect(reused.body.errors[0]?.code).toBe("command_id_conflict");
  for (const bytes of [Buffer.from([0xff]), Buffer.from("\0bad"), Buffer.from(" "), Buffer.from(" " + "x".repeat(4000)), Buffer.alloc(32769, 120)]) {
    const bad = await cli([...args("message", "bad", token), "--message-from-stdin"], bytes); expect(bad.code).toBe(2); expect(bad.body.errors[0]?.code).toBe("invalid_input");
  }
  expect((await cli([...args("message", "both", token), "--message-file", "absent", "--message-from-stdin"])).code).toBe(2);
  expect((await cli(args("message", "none", token))).code).toBe(2);
  expect((await post("control/v1/commands", { command_id: "auth", execution_id: h.engine.record.executionId, status_token: token, action: "message", inputs: { text: "not sent" } }, false)).status).toBe(403);
  expect(input()).toHaveLength(0); expect(readReceipts(h.stateDirectory).filter(r => r.message)).toMatchObject([{ command_id: "stale-settings", state: "refused", message: { delivery: "not_sent" } }]);
  writeFileSync(join(h.sandbox.root, "release"), "finish naturally");
});

it.skipIf(process.platform !== "darwin")("uses one admission authority for browser/bot races, defers terminal instructions until release and preserves independent pause", async () => {
  const target = await setup([{ waitForFile: "release" }, { result: "End under hold." }]);
  const request = args("take-over", "bot-race");
  const [bot, browser] = await Promise.all([cli(request), post("live/message", { instructionId: "browser-race", target, text: "only this attempt" })]);
  expect([0, 3]).toContain(bot.code); expect([202, 409]).toContain(browser.status); await h.engine.commands.settled();
  if (!h.engine.record.liveControl) { expect((await cli(args("take-over", "after-race"))).code).toBe(0); await h.engine.commands.settled(); }
  h.engine.record.pause.requestedAt = new Date().toISOString();
  const handoff = await cli(["handoff", path()]); expect(handoff.body.data).toMatchObject({ resumable: false, resume_command: null, resume_argv: null, fresh_session_instructions: null });
  const pendingStatus = await status();
  expect(pendingStatus.pause_status).toContain("Pausing for takeover");
  expect(pendingStatus.pause_status).toContain("Will pause after Phase 1 finishes. Current work continues.");
  expect((pendingStatus.controls as { name: string; available: boolean; reason: string }[]).find(c => c.name === "verify-and-advance")).toMatchObject({ available: false, reason: expect.any(String) });
  expect((await cli(["status", path()], undefined, false)).text).toContain("Will pause after Phase 1 finishes. Current work continues.");
  expect((await cli([...args("message", "after-takeover"), "--message-from-stdin"], Buffer.from("not sent"))).code).toBe(3);
  writeFileSync(join(h.sandbox.root, "release"), "finish naturally");
  await release();
  const ready = await cli(["handoff", path()]); expect(ready.code, ready.text).toBe(0);
  expect(ready.body.data).toMatchObject({ resumable: true, resume_argv: ["claude", "--resume", target.providerSessionId], terminal_readiness: { ready: true } });
  expect((await status()).pause_status).toBe("Paused for terminal takeover. Will pause after Phase 1 finishes. Current work continues.");
  expect(h.engine.record.pause.requestedAt).toBeDefined(); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin").each(["resume", "verify-and-advance"])("requires per-message review for explicit %s and retains uncertainty after acknowledgement", async action => {
  const target = await setup([{ liveMessages: 2, uncorrelated: true, exitAfter: true }]);
  for (const id of ["uncertain-one", "uncertain-two"]) {
    const sent = await cli([...args("message", id), "--message-from-stdin"], Buffer.from("  exact " + id + "\n")); expect(sent.code, sent.text).toBe(0); await h.engine.commands.settled();
    if (id === "uncertain-one") expect((await cli(["command-status", path(), "--command-id", id])).body.message_receipt).toBe("Sent to session — not confirmed read");
  }
  await release();
  const ids = [receipt("uncertain-one").id, receipt("uncertain-two").id];
  // Late provider evidence must survive restart without removing either review.
  const { sessionFiles } = await import("../session/claude-session.js");
  const { appendJsonLine } = await import("../state/state-files.js");
  const at = new Date().toISOString();
  appendJsonLine(sessionFiles(h.stateDirectory, h.engine.latestSession("1")!).events, { at, event: { type: "result", session_id: target.providerSessionId, user_message_uuids: ["uncertain-one", "uncertain-two"].map(id => receipt(id).message!.uuid) } });
  for (const id of ["uncertain-one", "uncertain-two"]) { const r = h.engine.commands.all().find(r => r.command_id === id)!; r.message!.resultAt = at; h.engine.commands.checkpoint(r); }
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare(); await serve();
  const uncertain = await status();
  expect(uncertain.live_control).toMatchObject({ reviewRequired: ids, messages: ids.map(id => ({ id, receipt: "Delivery uncertain" })) });
  expect((uncertain.controls as { name: string; available: boolean; reason: string | null }[]).find(c => c.name === "message")).toMatchObject({ available: false, reason: expect.stringContaining("Delivery uncertain") });
  const uncertainText = await cli(["status", path()], undefined, false); expect(uncertainText.text).toContain("Delivery uncertain");
  expect((await cli(args(action, "no-review"))).code).toBe(0); await h.engine.commands.settled();
  expect(receipt("no-review").state).toBe("failed"); expect(h.claudeCalls()).toHaveLength(1);
  const partial = await cli([...args(action, "partial"), "--message-reviewed", ids[0]!]); expect(partial.code, partial.text).toBe(0); await h.engine.commands.settled();
  expect(receipt("partial").state).toBe("failed"); expect(receipt("uncertain-one").message!.reviewedAt).toBeDefined(); expect(h.engine.record.liveControl).toBeDefined();
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare(); await serve();
  expect(receipt("uncertain-one").message).toMatchObject({ delivery: "uncertain", reviewedAt: expect.any(String), resultAt: expect.any(String) });
  expect(receipt("uncertain-two").message?.reviewedAt).toBeUndefined();
  expect(h.engine.liveView()?.reviewRequired).toEqual([ids[1]]);
  h.engine.record.pause.requestedAt = new Date().toISOString();
  if (action === "verify-and-advance") {
    const file = join(h.engine.worktreePath, h.engine.record.prdDirectory, "phase-1-return-intake.md"); writeFileSync(file, readFileSync(file, "utf8").replace("\n", "\n\n**Closed:** 2026-10-27\n"));
    git(h.sandbox, h.engine.worktreePath, "add", `${h.engine.record.prdDirectory}/phase-1-return-intake.md`); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: finish disposable phase"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  }
  await h.engine.reconcileTakeover();
  const returnArgs = args(action, "explicit-return");
  const final = await cli([...returnArgs, "--message-reviewed", ids[0]!, "--message-reviewed", ids[1]!]); expect(final.code, final.text).toBe(0);
  await h.engine.commands.settled(); await h.engine.settled();
  expect(receipt("explicit-return").state, JSON.stringify(receipt("explicit-return"))).toBe("completed"); expect(h.engine.record.liveControl).toBeUndefined();
  for (const id of ["uncertain-one", "uncertain-two"]) expect(receipt(id).message).toMatchObject({ delivery: "uncertain", reviewedAt: expect.any(String), resolvedBy: expect.any(String) });
  expect(input()).toHaveLength(2); expect(h.claudeCalls()).toHaveLength(action === "resume" ? 2 : 1);
  if (action === "verify-and-advance") expect(h.engine.record.pause.activeSince).toBeDefined();
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare(); await serve();
  expect(h.engine.record.liveControl).toBeUndefined();
  for (const id of ["uncertain-one", "uncertain-two"]) expect(receipt(id).message).toMatchObject({ delivery: "uncertain", reviewedAt: expect.any(String), resolvedBy: expect.any(String) });
  const retried = await cli([...returnArgs, "--message-reviewed", ids[0]!, "--message-reviewed", ids[1]!]);
  expect(retried.code, retried.text).toBe(0); expect(retried.body.operation).toMatchObject({ id: receipt("explicit-return").id });
});

it.skipIf(process.platform !== "darwin")("refuses older-controller capabilities before sending either live command or a review flag", async () => {
  await setup([{ waitForFile: "release" }, { result: "Ended naturally." }]);
  await server!.close(); server = undefined;
  const help = await cli(["message", "--help"], undefined, false);
  expect(help.text).toContain("current tool may finish first"); expect(help.text).toContain("outer whitespace is preserved");
  expect(help.text).toContain("--message-file"); expect(help.text).toContain("--message-from-stdin"); expect(help.text).toContain("kiln message");
  const takeoverHelp = await cli(["take-over", "--help"], undefined, false);
  expect(takeoverHelp.text).toContain("next safe stopping point"); expect(takeoverHelp.text).toContain("whole phase/audit");
  const reviewHelp = await cli(["resume", "--help"]);
  expect((reviewHelp.body.command as { flags: Record<string, unknown> }).flags["message-reviewed"]).toMatchObject({ repeatable: true });
  let posts = 0; const start = await processStartTime(process.pid);
  const legacy = createServer((req, res) => {
    if (req.method === "POST") posts++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ protocol_major: 1, execution_id: h.engine.record.executionId, prd_path: path(), instance: { pid: process.pid, process_start_time: start }, features: ["commands", "command_status"] }));
  });
  await new Promise<void>(resolve => legacy.listen(0, "127.0.0.1", resolve));
  try {
    const port = (legacy.address() as { port: number }).port;
    writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: start, port });
    for (const command of [[...args("message", "old-message"), "--message-from-stdin"], args("take-over", "old-takeover"), [...args("resume", "old-review"), "--message-reviewed", "receipt"]]) {
      const answer = await cli(command, Buffer.from("literal")); expect(answer.code, answer.text).toBe(4); expect(answer.body.errors[0]?.code).toBe("instance_incompatible");
    }
    expect(posts).toBe(0); expect(input()).toHaveLength(0);
  } finally { await new Promise<void>(resolve => legacy.close(() => resolve())); writeFileSync(join(h.sandbox.root, "release"), "finish"); }
});

describe.skipIf(process.platform !== "darwin").each([
  { kind: "delivery_audit", action: "resume" }, { kind: "test_audit", action: "verify-and-advance" },
] as const)("assigned $kind round via $action", ({ kind, action }) => {
  let target: NonNullable<ReturnType<Harness["engine"]["liveTarget"]>>;
  let audit: NonNullable<ReturnType<Harness["engine"]["auditActivity"]>>;
  let end: string;
  // Preparing a real prior delivery audit is fixture work. Keep the controls'
  // workflow test deadline separate from this prerequisite setup.
  beforeEach(async () => {
  const files = {
    "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
    "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
    "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
    "value.mjs": "export const value = () => 42;\n",
    "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
  };
  h = await createHarness({ folder: "proof", files, sessions: [], auditCycles: true }); h.env.KILN_STANDIN_VERSION = "2.1.311";
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
  git(h.sandbox, h.repository, "add", ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test: ignore disposable audit requests"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "audit-ready"); end = join(h.sandbox.root, "audit-release");
  const ordinary = { actions: [{ auditReport: {} }, { result: "Audit recorded." }] };
  const held = { actions: [{ touch: ready }, { waitForFile: end }, ...(action === "verify-and-advance" ? [{ auditReport: {} }] : []), { result: "Audit yielded." }] };
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [], auditSessions: kind === "delivery_audit" ? [held, ordinary] : [ordinary, held, ordinary] }));
  await serve(); await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready), 30000);
  target = h.engine.liveTarget()!; audit = h.engine.auditActivity(target.activityKey)!;
  });
  // Verify rejects the changed report, then rechecks the restored real audit and
  // completes its ownership handback. Budget that whole workflow separately from
  // the unchanged request, ownership-read and process-stop deadlines.
  it("takes over and returns the same audit using its real completion evidence", { timeout: action === "verify-and-advance" ? 120_000 : 60_000 }, async () => {
  const observed = await status(); expect(observed.live_control).toMatchObject({ label: `${kind === "delivery_audit" ? "Delivery audit" : "Test audit"} · Round ${audit.round}`, target });
  expect((await cli(args("take-over", "audit-takeover", String(observed.status_token)))).code).toBe(0); await h.engine.commands.settled();
  writeFileSync(end, "finish naturally"); await release();
  if (action === "verify-and-advance") {
    const report = join(h.engine.worktreePath, audit.reportPath); const original = readFileSync(report, "utf8"); writeFileSync(report, original + "\n");
    const invalid = await cli(args(action, "changed-report")); expect(invalid.code, invalid.text).toBe(0); await h.engine.commands.settled();
    expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined(); expect(h.engine.record.liveControl).toBeDefined();
    expect(h.engine.record.phases[target.activityKey]!.stop!.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Audit evidence is current", passed: false })]));
    writeFileSync(report, original);
  }
  h.engine.record.pause.requestedAt = new Date().toISOString(); await h.engine.reconcileTakeover();
  const label = `${kind === "delivery_audit" ? "Delivery audit" : "Test audit"} · Round ${audit.round}`;
  expect((await status()).pause_status).toBe(`Paused for terminal takeover. Will pause after ${label} finishes. Current work continues.`);
  expect((await cli(["status", path()], undefined, false)).text).toContain(`Will pause after ${label} finishes. Current work continues.`);
  const returned = await cli(args(action, "audit-return")); expect(returned.code, returned.text).toBe(0); await h.engine.commands.settled(); await h.engine.settled();
  expect(receipt("audit-return").state, JSON.stringify(receipt("audit-return"))).toBe("completed");
  expect(h.engine.auditActivity(target.activityKey)).toMatchObject({ activityId: audit.activityId, round: audit.round });
  expect(h.engine.latestSession(target.activityKey)!.runs).toHaveLength(action === "resume" ? 2 : 1);
  expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeDefined(); expect(h.engine.record.liveControl).toBeUndefined(); expect(h.engine.record.pause.activeSince).toBeDefined();
  expect((await status()).pause_status).toBe(`${label} finished. Paused before the next activity.`);
  expect((await cli(["status", path()], undefined, false)).text).toContain(`${label} finished. Paused before the next activity.`);
});
});

it.skipIf(process.platform !== "darwin")("labels disconnected live facts stale and offers no executable controls or terminal instructions", async () => {
  await setup([{ waitForFile: "release" }, { result: "Natural ending." }]);
  cacheSnapshot(h.engine, buildSnapshot(h.engine));
  await server!.close(); server = undefined; rmSync(join(h.stateDirectory, "instance.lock"));
  const last = await status();
  expect(last.status_token).toBeNull(); expect(last.live_control).toMatchObject({ state: "stale", available: false, input: { available: false, reason: expect.stringContaining("disconnected") } });
  for (const name of ["message", "take-over"]) expect((last.controls as { name: string }[]).find(c => c.name === name)).toMatchObject({ available: false, reason: expect.stringContaining("disconnected"), invocation: null });
  const handoff = await cli(["handoff", path()]);
  expect(handoff.body.data).toMatchObject({ resumable: false, resume_command: null, resume_argv: null, fresh_session_instructions: null, terminal_readiness: { ready: false } });
  expect(h.claudeCalls()).toHaveLength(1); writeFileSync(join(h.sandbox.root, "release"), "finish naturally");
});

it.skipIf(process.platform !== "darwin")("keeps B-before-A correlation uncertain through CLI retries, restart and reviewed Resume", async () => {
  const target = await setup([{ waitForFile: "release" }, { liveMessages: 2, consumptionEvents: [{ type: "result", indices: [1] }, { type: "result", indices: [0] }], exitAfter: true }]);
  const commands: string[][] = [];
  for (const id of ["order-A", "order-B"]) {
    const command = [...args("message", id), "--message-from-stdin"]; commands.push(command);
    const sent = await cli(command, Buffer.from(`  exact ${id}\n`)); expect(sent.code, sent.text).toBe(0); await h.engine.commands.settled();
  }
  writeFileSync(join(h.sandbox.root, "release"), "emit separate B/A results"); await release();
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare(); await serve();
  for (const [i, id] of ["order-A", "order-B"].entries()) {
    expect(receipt(id)).toMatchObject({ live_target: target, message: { text: `  exact ${id}\n`, delivery: "uncertain", resultAt: expect.any(String) }, effects: { message: "unknown", plan: "not_advanced", session: "not_started" } });
    const retried = await cli(commands[i]!, Buffer.from(`  exact ${id}\n`)); expect(retried.body.operation).toMatchObject({ id: receipt(id).id });
    expect((await cli(["command-status", path(), "--command-id", id])).body.message_receipt).toBe("Delivery uncertain");
  }
  expect((await cli(args("resume", "review-none"))).code).toBe(0); await h.engine.commands.settled();
  expect(receipt("review-none").state).toBe("failed");
  expect((await cli([...args("resume", "review-one"), "--message-reviewed", receipt("order-A").id])).code).toBe(0); await h.engine.commands.settled();
  expect(receipt("review-one").state).toBe("failed");
  expect(receipt("order-A").message?.reviewedAt).toBeDefined(); expect(receipt("order-B").message?.reviewedAt).toBeUndefined();
  expect(h.engine.record.liveControl).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1); expect(input()).toHaveLength(2);
  const resumed = await cli([...args("resume", "review-both"), "--message-reviewed", receipt("order-B").id]); expect(resumed.code, resumed.text).toBe(0);
  await h.engine.commands.settled(); await h.engine.settled(); expect(h.engine.record.liveControl).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(2); expect(input()).toHaveLength(2);
  for (const id of ["order-A", "order-B"]) expect(receipt(id).message).toMatchObject({ delivery: "uncertain", reviewedAt: expect.any(String), resolvedBy: expect.any(String) });
  expect(h.claudeCalls()[1]!.args).toContain(target.providerSessionId);
  await server!.close(); server = undefined; h.engine = h.reopenFromDisk(); await h.engine.prepare(); expect(h.engine.record.liveControl).toBeUndefined();
});
