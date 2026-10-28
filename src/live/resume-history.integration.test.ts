// Real controller, HTTP/built CLI, Git and disposable provider files/processes.
// Only the timing of history replacement is injected; this is not provider qualification.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { takeInstanceLock } from "../state/instance-lock.js";
import { stateRoot } from "../state/state-files.js";
import { findTranscripts } from "../session/transcripts.js";
import type { Receipt } from "../control/commands.js";
import type { LiveTarget } from "./target.js";
import * as ownership from "./ownership.js";

let h: Harness;
let server: LocalServer | undefined;
let releaseLock: (() => void) | undefined;
let origin: string;
let target: LiveTarget;
let historyFile: string;
let originalHistory: string;
let uncertainId: string | undefined;
let stage: string;
afterEach(async ({ task }) => {
  if (task.result?.state === "fail") process.stderr.write(`Resume history proof stopped at: ${stage}\n`);
  vi.restoreAllMocks(); await server?.close(); server = undefined;
  releaseLock?.(); releaseLock = undefined; await h?.cleanup();
});
async function post(route: string, body: unknown) {
  const response = await fetch(`${origin}/api/${route}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
async function cli(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args, join(h.repository, h.engine.record.prdDirectory), "--json"], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", b => { stdout += String(b); }); child.stderr.on("data", b => { stderr += String(b); });
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  expect(stderr).toBe(""); return { code, body: JSON.parse(stdout) as Record<string, unknown> };
}
async function released() {
  await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; }, 10000);
}
const reply = "Keep this stopped reply until a successful explicit retry.";
const uncertainText = "  Inspect this uncertain instruction; never resend it.\n ";
const faults = [
  { name: "missing", bytes: undefined },
  { name: "corrupt", bytes: "garbage\n" },
  { name: "metadata-only", bytes: '{"type":"file-history-snapshot"}\n' },
  { name: "wrong-conversation", bytes: JSON.stringify({ type: "user", sessionId: "another-conversation", message: { content: "Other history" } }) + "\n" },
  { name: "empty-object", bytes: "{}\n" },
  { name: "partial-only", bytes: '{"type":' },
  { name: "empty-file", bytes: "" },
];
const cases = (["phase", "delivery_audit", "test_audit"] as const).flatMap((kind, k) =>
  (["browser", "bot"] as const).flatMap((channel, c) => (["resume", "reply"] as const).map((action, a) => ({
    kind, channel, action, recovery: (c === a ? "takeover" : "delivery_recovery") as "takeover" | "delivery_recovery", fault: faults[(k * 4 + c * 2 + a) % faults.length]!,
  }))));

describe.skipIf(process.platform !== "darwin").each(cases)("$kind $channel $action under $recovery with $fault.name history", ({ kind, channel, action, recovery, fault }) => {
  beforeEach(async () => {
    stage = "preparing the real activity"; uncertainId = undefined;
    const audit = kind !== "phase";
    h = await createHarness({ sessions: [], ...(audit ? { folder: "proof", auditCycles: true, files: {
      "proof-prd.md": "# PRD: Resume history proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Value.** Return 42.\n",
      "technical-design.md": "# Design\nExport value from value.mjs.\n",
      "phase-1-value.md": "# Phase 1: Value\n\n**Closed:** 2026-10-28\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
      "value.mjs": "export const value = () => 42;\n",
      "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
    } } : {}) });
    h.env.KILN_STANDIN_VERSION = "2.1.311";
    if (audit) {
      writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
      git(h.sandbox, h.repository, "add", ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test(history): ignore transient audit requests"); git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    }
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "ready"); const release = join(h.sandbox.root, "release");
    const paused = { actions: [{ touch: ready }, ...(recovery === "takeover" ? [{ waitForFile: release }, { result: "Yielded with unfinished work." }] : [{ liveMessages: 1, uncorrelated: true, exitAfter: true }])] };
    // Only the prerequisite delivery audit completes; the assigned audit remains unfinished.
    const ordinary = { actions: [{ auditReport: {} }, { result: "Prior audit recorded." }] };
    const resumed = { actions: [{ touch: join(h.sandbox.root, "resumed") }, { result: "Continued the assigned activity, still unfinished." }] };
    writeFileSync(h.scenarioPath, JSON.stringify(audit ? { sessions: [], auditSessions: kind === "test_audit" ? [ordinary, paused, resumed] : [paused, resumed] } : { sessions: [paused, resumed] }));
    const lock = await takeInstanceLock(stateRoot(h.env), h.stateDirectory);
    if (!lock.taken) throw new Error("Disposable controller lock unavailable.");
    releaseLock = () => lock.release(); origin = `http://127.0.0.1:${lock.port}`;
    server = await startLocalServer({ engine: h.engine, port: lock.port, folderName: h.engine.paths.folderName, featureName: "Resume history proof", token: h.engine.record.token });
    await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(ready), 45000);
  });
  beforeEach(async () => {
    stage = "holding and releasing the assigned conversation";
    target = h.engine.liveTarget()!; expect(target).toBeDefined();
    if (kind !== "phase") expect(h.engine.auditActivity(target.activityKey)?.kind).toBe(kind);
    expect(h.engine.pause().ok).toBe(true);
    if (recovery === "takeover") {
      expect((await post("live/take-over", { instructionId: "resume-history-takeover", target })).status).toBe(202);
      writeFileSync(join(h.sandbox.root, "release"), "finish naturally");
    } else {
      await waitFor(() => h.engine.liveView()?.input?.available === true);
      expect((await post("live/message", { instructionId: "uncertain-history", target, text: uncertainText })).status).toBe(202);
      await h.engine.commands.settled();
      uncertainId = (h.engine.commands.lookup("uncertain-history").operation as Receipt).id;
    }
    await h.engine.settled(); await released();
    if (uncertainId) {
      const receipt = h.engine.commands.lookup("uncertain-history").operation as Receipt;
      expect(receipt.message?.delivery).toBe("uncertain"); expect(receipt.message?.reviewedAt).toBeUndefined();
    }
    historyFile = findTranscripts(h.env.CLAUDE_CONFIG_DIR!, target.providerSessionId).main!;
    originalHistory = readFileSync(historyFile, "utf8");
    // Dirty and unfinished work must still be resumable after history is restored.
    writeFileSync(join(h.engine.worktreePath, "unfinished.txt"), "unfinished work\n");
  });
  it("supplies no first input after final history loss, retains recovery, and admits only a new explicit retry after restoration", async () => {
    const originalCalls = h.claudeCalls().length;
    const runCount = h.engine.latestSession(target.activityKey)!.runs.length;
    const audit = structuredClone(h.engine.auditActivity(target.activityKey));
    const realOwnership = ownership.requireNoTerminal;
    let replaced = false;
    const injected = vi.spyOn(ownership, "requireNoTerminal").mockImplementation(async (...args) => {
      await realOwnership(...args);
      if (!args[2] || replaced) return;
      // Exclusion exists only at the new process's final input boundary, after
      // the actual async completion and PID/start ownership checks have run.
      expect(args[1]).toBe(target.providerSessionId); expect(args[2].pid).toBe(h.engine.latestSession(target.activityKey)!.runs.at(-1)!.pid);
      replaced = true;
      if (fault.bytes === undefined) rmSync(historyFile); else writeFileSync(historyFile, fault.bytes);
    });
    const tokens = new Map<string, string>();
    async function submit(id: string) {
      stage = `awaiting ${channel} ${action} ${id}`;
      if (channel === "browser") return post("resume", { instructionId: id, target, ...(action === "reply" ? { note: reply } : {}), ...(uncertainId ? { reviewedReceiptIds: [uncertainId] } : {}) });
      if (!tokens.has(id)) { const status = await cli(["status"]); expect(status.code).toBe(0); tokens.set(id, String(status.body.status_token)); }
      const args = [action, "--command-id", id, "--only-if-status-matches", tokens.get(id)!, ...(uncertainId ? ["--message-reviewed", uncertainId] : [])];
      if (action === "reply") { const file = join(h.sandbox.root, "reply.txt"); writeFileSync(file, reply); args.push("--message-file", file); }
      return cli(args);
    }
    const refused = await submit("lost-final-history");
    await h.engine.commands.settled(); await h.engine.settled();
    stage = "checking no prompt was supplied";
    const session = h.engine.latestSession(target.activityKey)!;
    expect(replaced, JSON.stringify(refused)).toBe(true);
    expect(h.claudeCalls()).toHaveLength(originalCalls);
    expect(existsSync(join(h.sandbox.root, "resumed"))).toBe(false);
    expect(session.runs).toHaveLength(runCount + 1);
    expect(session.runs.at(-1)!.endedAt).toEqual(expect.any(String));
    expect(session.runs.at(-1)!.control?.submitted).not.toBe(true);
    expect(session.runs.at(-1)!.signal).toBeUndefined();
    expect(h.engine.record.liveControl?.takeover.target).toEqual(target);
    expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined();
    expect(h.engine.record.pause.requestedAt).toBeDefined();
    const receipt = h.engine.commands.lookup("lost-final-history").operation as Receipt;
    expect(receipt).toMatchObject({ state: "failed", outcome: "history_unavailable", reason: expect.stringMatching(/history|conversation/), effects: { session: "not_started", plan: "not_advanced", reply: action === "reply" ? "not_sent" : "not_applicable" }, reply_text: action === "reply" ? reply : null });
    if (uncertainId) {
      const message = (h.engine.commands.lookup("uncertain-history").operation as Receipt).message;
      expect(message).toMatchObject({ text: uncertainText, delivery: "uncertain", reviewedAt: expect.any(String) }); expect(message?.resolvedBy).toBeUndefined();
    }
    if (audit) expect(h.engine.auditActivity(target.activityKey)).toMatchObject({ activityId: audit.activityId, kind: audit.kind, round: audit.round });
    injected.mockRestore();
    // Restoration is not an instruction to replay either the failed reply or uncertain message.
    const legacy = JSON.stringify({ type: "user", message: { content: "Saved legacy continuation" } }) + '\n{"type":';
    writeFileSync(historyFile, action === "reply" ? legacy : originalHistory + '{"type":');
    await released(); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(originalCalls);
    // Same-ID replay must remain the failed original operation, even after repair.
    await submit("lost-final-history");
    expect(h.engine.commands.lookup("lost-final-history").operation).toMatchObject({ id: receipt.id, state: "failed", outcome: "history_unavailable", effects: { session: "not_started" } });
    expect(h.claudeCalls()).toHaveLength(originalCalls);
    const accepted = await submit("restored-explicit-retry");
    await h.engine.commands.settled(); await h.engine.settled();
    stage = "checking restored explicit retry";
    expect(h.engine.commands.lookup("restored-explicit-retry").operation, JSON.stringify(accepted)).toMatchObject({ state: "completed", effects: { session: "resumed", plan: "not_advanced" } });
    expect(h.claudeCalls()).toHaveLength(originalCalls + 1);
    expect(h.claudeCalls().at(-1)!.args).toContain(target.providerSessionId);
    expect(h.claudeCalls().at(-1)!.prompt.includes(reply)).toBe(action === "reply");
    expect(h.claudeCalls().at(-1)!.prompt).not.toContain(uncertainText);
    expect(h.engine.latestSession(target.activityKey)!.runs).toHaveLength(runCount + 2);
    expect(h.engine.record.liveControl).toBeUndefined(); expect(h.engine.record.pause.requestedAt).toBeDefined();
    expect(h.engine.record.phases[target.activityKey]!.doneAt).toBeUndefined();
    if (audit) expect(h.engine.auditActivity(target.activityKey)).toMatchObject({ activityId: audit.activityId, kind: audit.kind, round: audit.round });
    if (uncertainId) expect(h.engine.commands.lookup("uncertain-history").operation).toMatchObject({ message: { delivery: "uncertain", reviewedAt: expect.any(String), resolvedBy: expect.any(String) } });
  }, 120000);
});
