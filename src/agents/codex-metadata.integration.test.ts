import { afterEach, describe, expect, it, vi } from "vitest";
import { createSandbox, type Sandbox } from "../test-support/git-repositories.js";
import { installCodexMetadataFixture } from "../test-support/codex-metadata-fixture.js";
import { readCodexMetadata } from "./codex-metadata.js";
import { CodexMetadataRpc } from "./codex-metadata-rpc.js";
import { AgentInfo } from "./metadata.js";
import { waitFor } from "../test-support/engine-harness.js";
let sandbox: Sandbox;
let info: AgentInfo | undefined;
afterEach(() => { info?.close(); info = undefined; vi.useRealTimers(); return sandbox?.cleanup(); });
describe("Codex metadata over real process pipes", () => {
  it("refreshes the selected Codex account every five minutes and stops the scheduler on close", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    // Accelerate only scheduling: process pipes, deadlines and response parsing remain real.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    info = new AgentInfo({ agentId: "codex", executable: { claude: "unused", codex: f.executable }, cwd: sandbox.root, claudeCwd: sandbox.root, env: f.env });
    info.start(); await info.refresh();
    const readings = () => f.calls().filter(c => c.method === "account/rateLimits/read").length;
    expect(readings()).toBe(1);
    vi.advanceTimersByTime(299_999); expect(readings()).toBe(1);
    f.set({ percent: 32 }); vi.advanceTimersByTime(1);
    await waitFor(() => !info!.state.pending && readings() === 2);
    expect(readings()).toBe(2); expect(info.state.account?.limits[0]?.percent).toBe(32);
    f.set({ percent: 19 }); vi.advanceTimersByTime(300_000);
    await waitFor(() => !info!.state.pending && readings() === 3);
    expect(readings()).toBe(3); expect(info.state.account?.limits[0]?.percent).toBe(19);
    expect(f.calls().filter(c => c.method === "account/read")).toHaveLength(3);
    info.close(); vi.advanceTimersByTime(600_000); expect(readings()).toBe(3);
    expect(f.calls().every(c => !/^(thread|turn)\//.test(c.method))).toBe(true);
  });
  it("exhausts model cursors, inspects every launch directory, reads account windows, and cannot dispatch work", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    const result = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root, "/added-worktree"] });
    expect(result.blockers).toEqual([]); expect(result.models?.map(m => m.value)).toEqual(["gpt-6-sol", "gpt-6.1-sol", "gpt-6-luna"]);
    expect(result.account.limits).toHaveLength(3); expect(result.account.limits[1]!.percent).toBeUndefined();
    expect(result.skills).toHaveLength(2); expect(f.calls().some(c => c.method.startsWith("thread/") || c.method.startsWith("turn/"))).toBe(false);
    const rpc = new CodexMetadataRpc(f.executable, sandbox.root, f.env);
    try { await expect(rpc.call("turn/start")).rejects.toThrow("Work dispatch unavailable"); } finally { await rpc.close(); }
  });
  it("settles failed metadata process creation without leaving close waiting for a nonexistent exit", async () => {
    sandbox = createSandbox();
    const rpc = new CodexMetadataRpc("/nonexistent/kiln-codex", sandbox.root, sandbox.env);
    await expect(rpc.initialize()).rejects.toThrow("Could not start Codex");
    await rpc.close();
  });
  it("reports real adapter version, authentication, disabled-skill and policy failures without starting a turn", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    for (const [fixture, message] of [[{ version: "99.0.0" }, "incompatible"], [{ apiKey: true }, "ChatGPT"], [{ provider: "custom" }, "OpenAI"], [{ hooks: { interactive: true } }, "hook configuration"], [{ disabledSkill: "deliverable-review" }, "deliverable-review"], [{ requirements: { unknownMandatoryRestriction: true } }, "managed requirement"]] as const) {
      f.set(fixture); const r = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
      expect(r.blockers.join(" ")).toContain(message);
    }
    const absent = await readCodexMetadata({ executable: undefined, cwd: sandbox.root, cwds: [sandbox.root], env: f.env });
    expect(absent.blockers[0]).toContain("not on PATH");
    expect(f.calls().every(c => !c.method.startsWith("turn/") && !c.method.startsWith("thread/"))).toBe(true);
  });
});
