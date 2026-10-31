// Real HTTP, engine, disk records and Git/bare origins. Model calls use the established
// stand-in; actual provider conversation evidence is recorded separately in the PRD.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as records from "../state/records.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { createHarness, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { isPortFree } from "../state/instance-lock.js";
import { startLocalServer, type LocalServer } from "./local-server.js";

let h: Harness;
let server: LocalServer;
let origin: string;
afterEach(async () => { vi.restoreAllMocks(); await server?.close(); await h?.cleanup(); });
async function setup() {
  h = await createHarness({ sessions: [{ actions: [{ result: "Use the blue option?" }] }, { actions: [{ result: "Resumed with the answer." }] }] });
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  for (let port = 41960; port < 41980; port++) if (await isPortFree(port)) {
    origin = `http://127.0.0.1:${port}`;
    server = await startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token }); break;
  }
}
const target = () => buildSnapshot(h.engine).needsYou!.phaseRecovery!.target;
async function post(path: string, body: unknown, raw = false) {
  const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: raw ? String(body) : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
function finish() {
  const file = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
  writeFileSync(file, readFileSync(file, "utf8").replace("\n", "\n\n**Closed:** 2026-10-26\n"));
  git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md");
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "test: finish phase");
  git(h.sandbox, h.engine.worktreePath, "push", "-qu", "origin", h.engine.record.settings.featureBranch);
}

it("rejects malformed, old, stale and competing clients before any check or model request", async () => {
  await setup();
  for (const body of ["{", "null", "[]"]) expect((await post("resume", body, true)).body.code).toBe("invalid_request");
  for (const body of [{ target: {} }, { target: target(), note: 9 }, { target: target(), note: "x".repeat(4001) }, { target: target(), other: true }]) expect((await post("resume", body)).status).toBe(400);
  expect((await post("check-again", { target: target(), intent: "verify", note: "must not send" })).body.code).toBe("invalid_request");
  expect((await post("check-again", { target: target() })).status).toBe(400);
  expect((await post("resume", {})).body.code).toBe("stale_target");
  expect((await post("check-again", {})).body.code).toBe("stale_target");
  for (const field of ["executionId", "phaseKey", "sessionId", "stoppedAt"]) expect((await post("resume", { target: { ...target(), [field]: "old" } })).body.code).toBe("stale_target");
  const real = h.engine["readPlan"].bind(h.engine);
  let release!: () => void; let entered!: () => void;
  const inside = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(h.engine, "readPlan").mockImplementationOnce(async () => { entered(); await gate; return real(); });
  const first = post("check-again", { target: target(), intent: "verify" }); await inside;
  expect(buildSnapshot(h.engine).needsYou!.checking).toBe(true);
  expect((await post("resume", { target: target(), note: "competing" })).body.code).toBe("busy");
  expect((await post("check-again", { target: target(), intent: "advance" })).body.code).toBe("busy");
  expect((await h.engine.addRepository("other")).ok).toBe(false);
  expect((await h.engine.changeSettings({ resumeAfterUsageLimit: false })).ok).toBe(false);
  release(); expect((await first).body.outcome).toBe("still_stopped");
  expect(h.claudeCalls()).toHaveLength(1);
});

it("refreshes incomplete checks, preserves old evidence on read error, and rechecks explicit advancement", async () => {
  await setup();
  const identity = target();
  const before = buildSnapshot(h.engine).needsYou!.checkedAt!;
  expect((await post("check-again", { target: identity, intent: "verify" })).body.outcome).toBe("still_stopped");
  const completed = buildSnapshot(h.engine).needsYou!;
  expect(Date.parse(completed.checkedAt!)).toBeGreaterThan(Date.parse(before));
  expect(completed.checks).toHaveLength(3);
  const worktree = h.engine.worktreePath;
  renameSync(worktree, `${worktree}-temporarily-unavailable`);
  try {
    expect((await post("resume", { target: identity, note: "not sent" })).status).toBe(503);
    const failed = buildSnapshot(h.engine).needsYou!;
    expect(failed.phaseRecovery!.completion).toBe("unknown");
    expect(failed.checkedAt).toBe(completed.checkedAt); expect(failed.checks).toEqual(completed.checks);
  } finally { renameSync(`${worktree}-temporarily-unavailable`, worktree); }
  finish();
  expect((await post("resume", { target: identity, note: "never sent" })).body).toEqual({ ok: true, outcome: "already_complete", target: identity });
  expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
  expect(buildSnapshot(h.engine).needsYou!.phaseRecovery!.completion).toBe("complete");
  expect(buildSnapshot(h.engine).needsYou!.phaseRecovery!.checkError).toBeUndefined();
  // New dirty evidence invalidates the previous pass; Verify does not commit it.
  writeFileSync(join(worktree, "unfinished.txt"), "still unfinished");
  expect((await post("check-again", { target: identity, intent: "advance", withoutSendingReply: true })).body.outcome).toBe("still_stopped");
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
  git(h.sandbox, worktree, "add", "unfinished.txt"); git(h.sandbox, worktree, "commit", "-qm", "test: finish remaining work"); git(h.sandbox, worktree, "push", "-q", "origin", h.engine.record.settings.featureBranch);
  h.engine.record.pause.requestedAt = new Date().toISOString();
  expect((await post("check-again", { target: identity, intent: "advance", withoutSendingReply: true })).body.outcome).toBe("advanced");
  await h.engine.settled();
  expect(h.engine.record.pause.activeSince).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
  expect(h.engine.record.phases["1"]!.finishedByPerson).toBe(true);
  expect(h.events.filter(e => e.kind === "phase" && e.event === "done")).toHaveLength(1);
  expect((await post("check-again", { target: identity, intent: "advance", withoutSendingReply: true })).body.code).toBe("stale_target");
});

it("accepts billing-held completion without approval and rolls back a failed write without losing the hold", async () => {
  await setup();
  h.env.ANTHROPIC_AUTH_TOKEN = "handoff-test-changed-credential";
  expect((await post("resume", { target: target(), note: "preserve this unsent reply" })).body.outcome).toBe("resume_requested");
  await h.engine.settled();
  const hold = structuredClone(h.engine.record.billing!.hold);
  expect(hold).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
  finish();
  const identity = target();
  expect((await post("resume", { target: identity })).body.outcome).toBe("already_complete");
  const complete = buildSnapshot(h.engine).needsYou!;
  expect(complete.checks).toHaveLength(3); expect(complete.checks.every(check => check.passed)).toBe(true);
  expect(complete.checkedAt).toBe(h.engine.record.phases["1"]!.stop!.checkedAt);
  expect(complete.checkedAt).not.toBe(hold!.at);
  expect(h.engine.record.billing!.hold).toEqual(hold); expect(h.claudeCalls()).toHaveLength(1);
  const write = records.writePrdRecord;
  const failure = vi.spyOn(records, "writePrdRecord").mockImplementation((directory, record) => {
    if (record.phases["1"]?.doneAt) throw new Error("injected disk failure");
    return write(directory, record);
  });
  expect((await post("check-again", { target: identity, intent: "advance", withoutSendingReply: true })).body.code).toBe("state_write_failed");
  expect(h.engine.record.phases["1"]!.stop).toBeDefined(); expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
  expect(records.readPrdRecord(h.stateDirectory)!.phases["1"]!.stop).toBeDefined();
  expect(h.engine.record.billing!.hold).toEqual(hold);
  expect(records.readPrdRecord(h.stateDirectory)!.billing!.hold).toEqual(hold);
  expect(h.events.filter(e => e.kind === "phase" && e.event === "done")).toHaveLength(0);
  expect(h.claudeCalls()).toHaveLength(1);
  failure.mockRestore();
  // A durability failure freezes this controller even when the injected failure
  // is removed. Restart must reconcile the saved stop before another effect.
  expect((await post("check-again", { target: identity, intent: "verify" })).body.code).toBe("busy");
  await server.close(); h.engine.close(); h.engine = h.reopenFromDisk();
  server = await startLocalServer({ engine: h.engine, port: Number(new URL(origin).port), folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
  expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined(); expect(h.engine.record.billing!.hold).toEqual(hold);
  h.engine.record.pause.requestedAt = new Date().toISOString();
  expect((await post("check-again", { target: identity, intent: "verify" })).body.outcome).toBe("advanced");
  await h.engine.settled(); expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
  expect(h.engine.record.billing!.hold).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(1);
});
