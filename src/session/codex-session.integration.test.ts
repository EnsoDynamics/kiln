import { readFileSync } from "node:fs";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { readSessionRecord, writeSessionRecord } from "../state/records.js";
import { runCodexSession, reconcileCodexAttempt } from "./codex-session.js";
import { isProcessLive, processStartTime } from "../platform/process-start-time.js";
import { endProcessTree, spawnDetached } from "../platform/helper-process.js";
import { stopCodexOwnedProcesses } from "./codex-owned-processes.js";

const fixtures: ReturnType<typeof codexWorkFixture>[] = [];
function fixture() { const f = codexWorkFixture(); fixtures.push(f); return f; }
afterEach(async () => { await Promise.all(fixtures.splice(0).map(f => f.sandbox.cleanup())); });

// Real CLI pipes, records and processes. Live inference/protection is proved separately.
describe("durable protected Codex attempts", () => {
  it("persists identity before dispatch, separates configured and observed facts, and resumes the same original pair", async () => {
    const f = fixture();
    const run = await runCodexSession(f.options);
    expect(run.codex?.failure).toBeUndefined(); expect(run.codex?.terminal?.status).toBe("completed"); expect(run.codex?.cleanup).toBe("tracked_processes_stopped");
    expect(run.codex?.observed?.[0]).toMatchObject({ model: "gpt-6.1-sol", effort: "high", turnId: "turn-1" });
    expect(f.record.conversation).toMatchObject({ threadId: "work-parent", sessionTreeId: "tree-parent", codexHome: f.home });
    expect(f.record.initModel).toBeUndefined();
    const restored = readSessionRecord(f.options.stateDirectory, "1", f.record.sessionId)!;
    expect(restored.conversation).toEqual(f.record.conversation);
    expect(restored.codex?.originalAccount.accountId).toBe("proof-account");
    f.set({ accountId: "other-account", email: "other@example.invalid" });
    const resumed = await runCodexSession({ ...f.options, record: restored, cause: "person_resume", prompt: "Person's note\n\nCarry on", note: "Person's note" });
    expect(resumed.codex?.failure).toBeUndefined(); expect(resumed.codex?.observed).toHaveLength(2);
    expect(resumed.codex?.account.accountId).toBe("other-account"); expect(f.record.codex?.originalAccount.accountId).toBe("proof-account");
    const resume = f.calls().find(call => call.method === "thread/resume"); expect(resume?.params).toMatchObject({ threadId: "work-parent", model: "gpt-6.1-sol", excludeTurns: true });
    const start = f.calls().find(call => call.method === "thread/start"); expect(start?.params).toMatchObject({ allowProviderModelFallback: false, ephemeral: false, approvalPolicy: "on-request", approvalsReviewer: "auto_review" });
    expect(start?.params).not.toHaveProperty("baseInstructions");
    const persisted = readSessionRecord(f.options.stateDirectory, "1", f.record.sessionId)!;
    expect(persisted.conversation).toMatchObject({ threadId: "work-parent", sessionTreeId: "tree-parent", codexHome: f.home });
    expect(persisted.codex?.originalAccount.accountId).toBe("proof-account");
    expect(persisted.runs).toHaveLength(2);
    for (const [index, attempt] of persisted.runs.entries()) {
      expect(attempt.codex?.account.accountId).toBe(index === 0 ? "proof-account" : "other-account");
      expect(attempt.codex?.requested).toMatchObject({ model: "gpt-6.1-sol", effort: "high" });
      expect(attempt.codex?.effective).toMatchObject({ model: "gpt-6.1-sol", effort: "high" });
      expect(attempt.codex?.observed?.at(-1)).toMatchObject({ model: "gpt-6.1-sol", effort: "high", cwd: f.root });
      expect(attempt.codex?.dispatch?.at).toBeTruthy();
      expect(attempt.codex?.turnId).toBeTruthy();
      expect(attempt.codex?.terminal?.status).toBe("completed");
    }
  });
  it.each(["mismatch", "badReviewer", "badRoots"])("records the created identity but sends no turn for %s", async mode => {
    const f = fixture(); f.set({ [mode]: true });
    const run = await runCodexSession(f.options);
    expect(run.codex?.failure).toMatch(/recorded|protected/); expect(f.record.conversation?.threadId).toBe("work-parent");
    expect(f.calls().some(call => call.method === "turn/start")).toBe(false);
  });
  it("a failed preflight allocates no attempt or conversation", async () => {
    const f = fixture(); f.set({ signedOut: true });
    await expect(runCodexSession(f.options)).rejects.toThrow(/sign in/i);
    expect(f.record.runs).toHaveLength(0); expect(f.calls().some(call => call.method === "thread/start")).toBe(false);
  });
  it("does not confuse an early terminal notification with an active turn", async () => {
    const f = fixture(); f.set({ earlyTerminal: true }); const run = await runCodexSession(f.options);
    expect(run.codex?.terminal?.status).toBe("completed"); expect(run.codex?.failure).toBeUndefined();
  });
  it("retains observed settings disagreement as a failure", async () => {
    const f = fixture(); f.set({ observedMismatch: true }); const run = await runCodexSession(f.options);
    expect(run.codex?.failure).toContain("observed turn"); expect(run.codex?.observed?.[0]?.model).toBe("observed-other");
  });
  it.each(["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/permissions/requestApproval", "mcpServer/elicitation/request"])("settles %s without granting authority", async request => {
    const f = fixture(); f.set({ request }); const run = await runCodexSession(f.options);
    expect(run.codex?.humanRequests[0]?.stopped).toBe(false);
    const answer = f.calls().find(call => call.id === "human-request" && !call.method);
    expect(answer?.result).toEqual(request.includes("permissions") ? { permissions: {}, scope: "turn" } : request.includes("elicitation") ? { action: "decline" } : { decision: "decline" });
  });
  it.each(["item/tool/requestUserInput", "unknown/request"])("interrupts %s and saves its full request", async request => {
    const f = fixture(); f.set({ request, hang: true }); const at = Date.now(); const run = await runCodexSession(f.options);
    expect(Date.now() - at).toBeLessThan(5000);
    expect(run.codex?.humanRequests[0]).toMatchObject({ method: request, stopped: true, request: { questions: [{ question: "Need a person" }] } });
    expect(f.calls().some(call => call.method === "turn/interrupt")).toBe(true);
  });
  it("interrupts structured asynchronous questions", async () => {
    const f = fixture(); f.set({ asyncQuestions: true }); const run = await runCodexSession(f.options);
    expect(run.codex?.humanRequests.some(request => request.stopped)).toBe(true);
  });
  it.each([{ inheritPipes: false, doubleFork: false }, { inheritPipes: true, doubleFork: false }, { inheritPipes: true, doubleFork: true }])("Ctrl+C cleans detached tools %j before a same-thread resume", async mode => {
    const f = fixture(); f.set({ hang: true, toolProcess: true, ...mode });
    const controller = new AbortController();
    const promise = runCodexSession({ ...f.options, signal: controller.signal, onEvent: event => { if (event.method === "turn/started") setTimeout(() => controller.abort(), 800); } });
    const run = await promise;
    const pid = Number(readFileSync(f.file + ".tool", "utf8"));
    expect(run.interruptedBy).toBe("sigint"); expect(run.codex?.cleanup).toBe("tracked_processes_stopped");
    if (process.platform === "win32") expect(run.codex?.profile.powerShell?.executable).toBeTruthy();
    else expect(run.codex?.ownedProcesses?.some(process => process.pid === pid)).toBe(true);
    expect(await processStartTime(pid)).toBeUndefined();
    f.set({}); expect((await runCodexSession({ ...f.options, cause: "resume" })).codex?.failure).toBeUndefined();
  });
  it("uses provider terminal cleanup, persists its process identity and emits truthful stop guidance", async () => {
    const f = fixture(); f.set({ backgroundTerminals: true, toolProcess: true });
    const warnings: string[] = [];
    const run = await runCodexSession({ ...f.options, onWarning: text => warnings.push(text) });
    expect(run.codex?.failure).toBeUndefined();
    expect(warnings).toEqual([run.codex?.cleanupWarning]);
    expect(warnings[0]).toContain("Independently detached programs may keep running");
    expect(run.codex?.backgroundTerminals).toEqual([{ threadId: "work-parent", processId: "terminal-1", osPid: expect.any(Number) }]);
    const pid = Number(readFileSync(f.file + ".tool", "utf8"));
    expect(run.codex?.ownedProcesses?.some(entry => entry.pid === pid)).toBe(true);
    expect(await processStartTime(pid)).toBeUndefined();
    expect(f.calls().filter(call => call.method === "thread/backgroundTerminals/list")).toHaveLength(2);
    expect(f.calls().filter(call => call.method === "thread/backgroundTerminals/clean")).toHaveLength(1);
  });
  it.each(["backgroundListError", "backgroundCleanError", "backgroundSurvivesClean"])("still ends known OS processes when %s fails", async failure => {
    const f = fixture(); f.set({ backgroundTerminals: true, toolProcess: true, [failure]: true });
    const run = await runCodexSession(f.options);
    expect(run.codex?.cleanup).toBe("unknown"); expect(run.codex?.failure).toMatch(/background/);
    const pid = Number(readFileSync(f.file + ".tool", "utf8"));
    expect(await processStartTime(pid)).toBeUndefined();
  });
  it("retains cleanup failure independently of the attempt failure", async () => {
    const f = fixture(); f.set({ observedMismatch: true, backgroundCleanError: true });
    const run = await runCodexSession(f.options);
    const saved = readSessionRecord(f.options.stateDirectory, "1", f.record.sessionId)!.runs.at(-1)!;
    expect(run.codex?.failure).toContain("observed turn");
    expect(saved.codex?.cleanup).toBe("unknown");
    expect(saved.codex?.cleanupFailure).toContain("background cleanup failure");
  });
  it("bounds a stalled provider inventory and still ends known OS processes", async () => {
    const f = fixture(); f.set({ backgroundListHang: true, toolProcess: true });
    const start = Date.now();
    const run = await runCodexSession(f.options);
    expect(Date.now() - start).toBeLessThan(20_000);
    expect(run.codex?.cleanup).toBe("unknown");
    expect(run.codex?.cleanupFailure).toContain("deadline");
    const pid = Number(readFileSync(f.file + ".tool", "utf8"));
    expect(await processStartTime(pid)).toBeUndefined();
  }, 25_000);
  it("does not clean unrelated loaded conversations", async () => {
    const f = fixture(); f.set({ loadedThreads: ["another-conversation", "work-parent"] });
    const run = await runCodexSession(f.options);
    expect(run.codex?.failure).toBeUndefined();
    for (const call of f.calls().filter(call => call.method?.startsWith("thread/backgroundTerminals/"))) expect(call.params?.threadId).toBe("work-parent");
  });
  it("fails repeated loaded-thread pagination before attempting provider cleanup", async () => {
    const f = fixture(); f.set({ loadedCursor: "repeated" });
    const run = await runCodexSession(f.options);
    expect(run.codex?.failure).toMatch(/cursor/); expect(run.codex?.cleanup).toBe("unknown");
    expect(f.calls().some(call => call.method === "thread/backgroundTerminals/clean")).toBe(false);
  });
  it("a disconnected dispatch is ambiguous across restart and never resent", async () => {
    const f = fixture(); f.set({ dropDispatch: true }); const run = await runCodexSession(f.options);
    expect(run.codex?.dispatch).toBeDefined(); expect(run.codex?.turnId).toBeUndefined(); expect(run.codex?.terminal).toBeUndefined();
    const record = readSessionRecord(f.options.stateDirectory, "1", f.record.sessionId)!;
    expect(await reconcileCodexAttempt({ ...f.options, record })).toBe("ambiguous");
    await expect(runCodexSession({ ...f.options, record, cause: "resume" })).rejects.toThrow(/ambiguous/);
    expect(f.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
  });
  it("reconciles a saved terminal turn and a pre-dispatch crash without starting work", async () => {
    const f = fixture(); const run = await runCodexSession(f.options);
    delete run.endedAt; delete run.codex!.terminal; writeSessionRecord(f.options.stateDirectory, f.record);
    expect(await reconcileCodexAttempt(f.options)).toBe("settled");
    delete run.codex!.dispatch; delete run.codex!.turnId;
    expect(await reconcileCodexAttempt(f.options)).toBe("not_dispatched");
    expect(f.calls().filter(call => call.method === "turn/start")).toHaveLength(1);
    expect(await isProcessLive(run.pid!, run.processStartTime)).toBe(false);
  });
  it("cleans remembered children even when an exited launcher's start identity was never saved", async () => {
    const f = fixture(); const run = await runCodexSession(f.options);
    delete run.processStartTime;
    const child = spawnDetached(process.execPath, ["-e", "setInterval(()=>{},1000)"], { cwd: f.root, env: f.options.env, stdin: "ignore" });
    try {
      await once(child, "spawn");
      const startTime = await processStartTime(child.pid!);
      expect(startTime).toBeTruthy();
      run.codex!.ownedProcesses = [{ pid: child.pid!, startTime: startTime! }];
      await stopCodexOwnedProcesses(run);
      expect(await isProcessLive(child.pid!, startTime)).toBe(false);
    } finally { await endProcessTree(child.pid, "SIGKILL"); }
  });
});
