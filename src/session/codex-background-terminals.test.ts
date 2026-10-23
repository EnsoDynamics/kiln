import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHelper, type HelperResult } from "../platform/helper-process.js";
import type { SessionRun } from "../state/records.js";
import { stopCodexBackgroundTerminals } from "./codex-background-terminals.js";
import type { CodexWorkRpc } from "./codex-work-rpc.js";

// Live provider and real-pipe lifecycle tests prove the API contract separately. These
// failure injections control late replies and stalled OS lookups at the cleanup deadline.
vi.mock("../platform/helper-process.js", () => ({ runHelper: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(settle => { resolve = settle; });
  return { promise, resolve };
}

function attempt(): SessionRun {
  return {
    startedAt: "2026-10-23T00:00:00.000Z", cause: "launch",
    codex: {
      intentAt: "2026-10-23T00:00:00.000Z", requested: { model: "gpt-6.1-sol", effort: "high" },
      account: { at: "2026-10-23T00:00:00.000Z" },
      profile: { version: "0.162.1", cwd: "/assigned", writableRoots: ["/assigned"], repositories: [{ path: "/assigned", branch: "develop" }], skills: [] },
      humanRequests: [], modelActivityAt: [],
    },
  };
}

const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
beforeEach(() => { vi.mocked(runHelper).mockReset(); });
afterEach(() => { Object.defineProperty(process, "platform", platformDescriptor); });

describe("bounded owned Codex background-terminal cleanup", () => {
  it("pages loaded owned threads and saves OS ownership before provider cleanup", async () => {
    Object.defineProperty(process, "platform", { ...platformDescriptor, value: "darwin" });
    vi.mocked(runHelper).mockResolvedValue({ exitCode: 0, stdout: "fixture-start\n", stderr: "" });
    const run = attempt();
    const saved: SessionRun[] = [];
    const cleanSnapshots: SessionRun[] = [];
    const listed = new Map<string, number>();
    const call = vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === "thread/loaded/list") return params.cursor === null
        ? { data: ["unrelated", "parent"], nextCursor: "loaded-page-2" }
        : { data: ["child"], nextCursor: null };
      if (method === "thread/backgroundTerminals/clean") {
        cleanSnapshots.push(structuredClone(saved.at(-1)!));
        return {};
      }
      if (method !== "thread/backgroundTerminals/list") throw new Error(`Unexpected ${method}`);
      const thread = String(params.threadId);
      const number = listed.get(thread) ?? 0; listed.set(thread, number + 1);
      if (thread === "parent" && number === 0) return { data: [{ processId: "owned-terminal", osPid: 4242 }], nextCursor: "terminal-page-2" };
      if (thread === "parent" && number === 1) return { data: [{ processId: "terminal-without-os-pid", osPid: null }], nextCursor: null };
      return { data: [], nextCursor: null };
    });
    await stopCodexBackgroundTerminals({ call } as unknown as CodexWorkRpc, ["parent", "child", "cold-owned"], run, () => { saved.push(structuredClone(run)); }, new AbortController().signal);

    const terminalCalls = call.mock.calls.filter(([method]) => method.startsWith("thread/backgroundTerminals/"));
    expect(terminalCalls.map(([method, params]) => [method, params.threadId, params.cursor])).toEqual([
      ["thread/backgroundTerminals/list", "parent", null],
      ["thread/backgroundTerminals/list", "parent", "terminal-page-2"],
      ["thread/backgroundTerminals/clean", "parent", undefined],
      ["thread/backgroundTerminals/list", "parent", null],
      ["thread/backgroundTerminals/list", "child", null],
      ["thread/backgroundTerminals/clean", "child", undefined],
      ["thread/backgroundTerminals/list", "child", null],
    ]);
    expect(saved.at(-1)?.codex?.backgroundTerminals).toEqual([
      { threadId: "parent", processId: "owned-terminal", osPid: 4242 },
      { threadId: "parent", processId: "terminal-without-os-pid" },
    ]);
    expect(cleanSnapshots[0]?.codex?.ownedProcesses).toEqual([{ pid: 4242, startTime: "fixture-start" }]);
    expect(saved).toHaveLength(2);
  });

  it("ignores a provider inventory reply arriving after cancellation", async () => {
    const reply = deferred<{ data: string[]; nextCursor: null }>();
    const call = vi.fn(() => reply.promise);
    const run = attempt(); const before = structuredClone(run); const save = vi.fn();
    const controller = new AbortController(); const reason = new Error("cleanup deadline");
    const stopped = stopCodexBackgroundTerminals({ call } as unknown as CodexWorkRpc, ["parent"], run, save, controller.signal);
    const rejected = expect(stopped).rejects.toBe(reason);
    controller.abort(reason);
    reply.resolve({ data: ["parent"], nextCursor: null });
    await rejected;
    expect(run).toEqual(before);
    expect(save).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledExactlyOnceWith("thread/loaded/list", { cursor: null, limit: 100 });
  });

  it.each(["darwin", "win32"])("cancels an in-flight %s identity lookup without later record updates", async platform => {
    Object.defineProperty(process, "platform", { ...platformDescriptor, value: platform });
    const helperStarted = deferred<void>(); const reply = deferred<HelperResult>();
    vi.mocked(runHelper).mockImplementation(() => { helperStarted.resolve(); return reply.promise; });
    const call = vi.fn(async (method: string) => {
      if (method === "thread/loaded/list") return { data: ["parent"], nextCursor: null };
      if (method === "thread/backgroundTerminals/list") return { data: [{ processId: "owned-terminal", osPid: 4242 }], nextCursor: null };
      throw new Error(`Unexpected ${method}`);
    });
    const controller = new AbortController(); const reason = new Error("cleanup deadline");
    const run = attempt(); const save = vi.fn();
    const stopped = stopCodexBackgroundTerminals({ call } as unknown as CodexWorkRpc, ["parent"], run, save, controller.signal);
    const rejected = expect(stopped).rejects.toBe(reason);
    await helperStarted.promise;
    expect(vi.mocked(runHelper).mock.calls[0]?.[2].signal).toBe(controller.signal);
    expect(vi.mocked(runHelper).mock.calls[0]?.[2].timeoutMs).toBe(10_000);
    controller.abort(reason);
    const atAbort = structuredClone(run);
    // Even a helper that returns a valid late identity must not add ownership or save.
    reply.resolve({ exitCode: 0, stdout: platform === "win32" ? "123456\n" : "fixture-start\n", stderr: "" });
    await rejected;
    expect(run).toEqual(atAbort);
    expect(run.codex?.ownedProcesses).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(call.mock.calls.map(([method]) => method)).toEqual(["thread/loaded/list", "thread/backgroundTerminals/list"]);
  });

  it.each(["darwin", "win32"])("treats a %s identity-helper timeout as cleanup failure", async platform => {
    Object.defineProperty(process, "platform", { ...platformDescriptor, value: platform });
    vi.mocked(runHelper).mockResolvedValue({ exitCode: null, stdout: "", stderr: "", failure: "timed out after 10 seconds" });
    const call = vi.fn(async (method: string) => {
      if (method === "thread/loaded/list") return { data: ["parent"], nextCursor: null };
      if (method === "thread/backgroundTerminals/list") return { data: [{ processId: "owned-terminal", osPid: 4242 }], nextCursor: null };
      throw new Error(`Unexpected ${method}`);
    });
    const run = attempt(); const save = vi.fn();
    await expect(stopCodexBackgroundTerminals({ call } as unknown as CodexWorkRpc, ["parent"], run, save, new AbortController().signal)).rejects.toThrow("Process identity lookup failed: timed out after 10 seconds");
    expect(save).not.toHaveBeenCalled();
    expect(run.codex?.ownedProcesses).toBeUndefined();
    expect(call.mock.calls.map(([method]) => method)).toEqual(["thread/loaded/list", "thread/backgroundTerminals/list"]);
  });
});
