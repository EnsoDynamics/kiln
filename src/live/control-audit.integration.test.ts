// Test-audit gaps at real HTTP/engine/CLI boundaries; all repositories are disposable.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { processStartTime } from "../platform/process-start-time.js";
import { git } from "../test-support/git-repositories.js";
import { writeJsonAtomically } from "../state/state-files.js";

let h: Harness; let server: LocalServer | undefined; let origin: string;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });
async function setup() {
  h = await createHarness({ sessions: [] }); h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "ready"); const release = join(h.sandbox.root, "release");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { waitForFile: release }, { result: "Unfinished under takeover." }] }] }));
  await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready));
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
  const port = boundPort(server.address); origin = `http://127.0.0.1:${port}`;
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port });
  return { target: h.engine.liveTarget()!, release };
}
async function request(path: string, method: string, body?: unknown) {
  const response = await fetch(`${origin}/api/${path}`, { method, headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
async function released(release: string) {
  writeFileSync(release, "finish naturally"); await h.engine.settled();
  await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; });
}

it.skipIf(process.platform !== "darwin").each(["pending", "released"] as const)("cancels only the independent deferred pause while takeover is %s", async state => {
  const { target, release } = await setup();
  expect(h.engine.pause().ok).toBe(true);
  expect((await request("live/take-over", "POST", { instructionId: "cancel-independent", target })).status).toBe(202);
  if (state === "released") await released(release);
  const hold = h.engine.record.liveControl!.takeover;
  expect(hold.state).toBe(state); expect(h.engine.record.pause.requestedAt).toBeDefined();
  expect((await request("pause", "DELETE")).status).toBe(200);
  expect(h.engine.record.pause.requestedAt).toBeUndefined();
  expect(h.engine.record.liveControl?.takeover).toMatchObject({ instructionId: hold.instructionId, operationId: hold.operationId, target, state });
  expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
  if (state === "pending") await released(release);
  expect((await h.engine.decide()).kind).toBe("needs_you");
  expect(h.engine.record.liveControl?.takeover.state).toBe("released"); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin")("names the finished phase in text and JSON bot status after the independent pause is reached", async () => {
  const { target, release } = await setup();
  expect(h.engine.pause().ok).toBe(true);
  await request("live/take-over", "POST", { instructionId: "phase-status", target }); await released(release);
  const phase = "docs/prds/customer-returns/phase-1-return-intake.md";
  writeFileSync(join(h.engine.worktreePath, phase), readFileSync(join(h.engine.worktreePath, phase), "utf8").replace("\n", "\n\n**Closed:** 2026-10-28\n"));
  git(h.sandbox, h.engine.worktreePath, "add", phase); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(live control): finish disposable paused phase"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  const accepted = await request("check-again", "POST", { target: h.engine.phaseRecoveryTarget(), intent: "verify" });
  expect(accepted.body.outcome, JSON.stringify(accepted)).toBe("advanced"); await h.engine.settled();
  expect(h.engine.record.pause.activeSince).toBeDefined();
  const expected = "Phase 1 finished. Paused before the next activity.";
  for (const json of [true, false]) {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), "status", join(h.repository, h.engine.record.prdDirectory), ...(json ? ["--json"] : [])], { env: h.env, cwd: h.sandbox.root, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout!.on("data", chunk => { output += String(chunk); });
    expect(await new Promise(resolve => child.once("close", resolve)), output).toBe(0);
    if (json) expect(JSON.parse(output).pause_status).toBe(expected); else expect(output).toContain(expected);
  }
  expect(h.engine.record.liveControl).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin").each(["resume", "verify"] as const)("refuses explicit %s with a real registered terminal owner even when completion checks pass", async intent => {
  const { target, release } = await setup();
  await request("live/take-over", "POST", { instructionId: "owner-test", target }); await released(release);
  const phase = "docs/prds/customer-returns/phase-1-return-intake.md";
  writeFileSync(join(h.engine.worktreePath, phase), readFileSync(join(h.engine.worktreePath, phase), "utf8").replace("\n", "\n\n**Closed:** 2026-10-28\n"));
  git(h.sandbox, h.engine.worktreePath, "add", phase); git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test(live control): finish disposable owner fixture"); git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
  const recovery = buildSnapshot(h.engine).needsYou!.phaseRecovery!.target;
  const owner = spawn(process.execPath, ["-e", "process.stdout.write('ready');process.stdin.resume()"], { cwd: h.sandbox.root, stdio: ["pipe", "pipe", "pipe"] });
  const closed = once(owner, "exit"); await once(owner.stdout!, "data");
  const entry = join(h.env.CLAUDE_CONFIG_DIR!, "sessions", "terminal-owner.json");
  try {
    writeFileSync(entry, JSON.stringify({ sessionId: target.providerSessionId, pid: owner.pid, procStart: await processStartTime(owner.pid!) }));
    const answer = await request(intent === "resume" ? "resume" : "check-again", "POST", { target: recovery, ...(intent === "verify" ? { intent: "verify" } : {}) });
    expect(JSON.stringify(answer.body)).toMatch(/terminal|conversation/i);
    expect(answer.body.outcome).not.toBe("advanced"); expect(answer.body.outcome).not.toBe("resume_requested");
    expect(h.engine.record.liveControl).toBeDefined(); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
  } finally { owner.stdin!.end(); await closed; rmSync(entry); }
  await h.engine.reconcileTakeover();
  const afterExit = await request("resume", "POST", { target: h.engine.phaseRecoveryTarget() });
  expect(afterExit.body.outcome, JSON.stringify(afterExit)).toBe("already_complete");
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
});

it.skipIf(process.platform !== "darwin")("rejects each missing mandatory live-command flag before any message or takeover effect", async () => {
  const { release } = await setup();
  const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
  const receipts = h.engine.commands.all().map(r => r.id);
  for (const action of ["message", "take-over"]) for (const missing of ["--command-id", "--only-if-status-matches"]) {
    const args = [cli, action, join(h.repository, h.engine.record.prdDirectory), "--json", ...(action === "message" ? ["--message-from-stdin"] : []), ...(missing === "--command-id" ? ["--only-if-status-matches", "unused-token"] : ["--command-id", "unused-id"])];
    const child = spawn(process.execPath, args, { env: h.env, cwd: h.sandbox.root, stdio: ["pipe", "pipe", "pipe"] });
    let output = ""; child.stdout!.on("data", chunk => { output += String(chunk); }); child.stdin!.on("error", () => {});
    const exit = once(child, "exit"); child.stdin!.end("must never be sent");
    expect((await exit)[0], output).toBe(2);
    const result = JSON.parse(output) as { errors: { code: string; message: string }[] };
    expect(result.errors[0]?.code).toBe("invalid_input");
    expect(result.errors[0]?.message).toContain("--command-id"); expect(result.errors[0]?.message).toContain("--only-if-status-matches");
  }
  expect(h.engine.commands.all().map(r => r.id)).toEqual(receipts); expect(h.engine.record.liveControl).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
  expect(existsSync(`${h.scenarioPath}.live-inputs.jsonl`)).toBe(false);
  writeFileSync(release, "finish naturally");
});
