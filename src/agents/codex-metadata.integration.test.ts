import { afterEach, describe, expect, it, vi } from "vitest";
import { createSandbox, type Sandbox } from "../test-support/git-repositories.js";
import { installCodexMetadataFixture } from "../test-support/codex-metadata-fixture.js";
import { prepareCodexLaunch } from "../session/codex-launch-profile.js";
import { readCodexMetadata } from "./codex-metadata.js";
import { CodexMetadataRpc } from "./codex-metadata-rpc.js";
import { codexBillingSummary } from "../billing/codex.js";
import { AgentInfo } from "./metadata.js";
import { waitFor } from "../test-support/engine-harness.js";
let sandbox: Sandbox;
let info: AgentInfo | undefined;
afterEach(() => { info?.close(); info = undefined; vi.useRealTimers(); return sandbox?.cleanup(); });
describe("Codex metadata over real process pipes", () => {
  it.each(["0.162.1", "0.165.0", "0.165.1", "1.0.0", "99.0.0"])("accepts stable %s and records the actual launch version", async version => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox); f.set({ version });
    const prepared = await prepareCodexLaunch({ ...f, cwd: sandbox.root, writableRoots: [sandbox.root], repositories: [{ path: sandbox.root, branch: "develop" }], choice: { model: "gpt-6.1-sol", effort: "high" } });
    expect(prepared.profile.version).toBe(version);
    expect(prepared.choice.model).toBe("gpt-6.1-sol");
    expect(f.calls().some(c => c.method === "configRequirements/read")).toBe(true);
    expect(f.calls().every(c => !/^(thread|turn)\//.test(c.method))).toBe(true);
  });
  it("still blocks newer releases when required metadata capabilities fail", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox); f.set({ version: "0.165.1", configError: true });
    const result = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
    expect(result.blockers.join(" ")).toContain("Could not inspect Codex provider and hooks");
    expect(f.calls().every(c => !/^(thread|turn)\//.test(c.method))).toBe(true);
  });
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
    expect(info.state.pending).toBe(true); // The scheduled read must start at the five-minute boundary.
    await waitFor(() => !info!.state.pending && readings() === 2);
    expect(readings()).toBe(2); expect(info.state.account?.limits[0]?.percent).toBe(32);
    f.set({ percent: 19 }); vi.advanceTimersByTime(300_000);
    await waitFor(() => !info!.state.pending && readings() === 3);
    expect(readings()).toBe(3); expect(info.state.account?.limits[0]?.percent).toBe(19);
    expect(f.calls().filter(c => c.method === "account/read")).toHaveLength(6);
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
  it("brackets usage with fresh account reads and rejects an authentication change without substituting email or window percentages", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    const account = { account: { type: "chatgpt", email: "same@example.invalid", planType: "pro" } };
    f.set({ accounts: [{ ...account, workspaceRouting: { chatgptAccountId: "before" } }, { ...account, workspaceRouting: { chatgptAccountId: "fixture-account" } }] });
    const changed = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
    expect(changed.account.codexUsage).toMatchObject({ state: "unknown", reason: expect.stringContaining("identity changed") });
    expect(f.calls().filter(call => call.method.startsWith("account/")).map(call => call.method)).toEqual(["account/read", "account/rateLimits/read", "account/read"]);
    f.set({ accounts: [account], usage: { accountId: "fixture-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: {} } });
    const optionalRouting = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
    expect(optionalRouting.account.codexUsage?.state).toBe("allowed");
    expect(optionalRouting.account.limits).toEqual([]); // Empty windows do not negate explicit account-wide permission.
    expect(f.calls().every(call => !/^(thread|turn)\//.test(call.method))).toBe(true);
  });
  it.each([
    ["email", { account: { type: "chatgpt", email: "other@example.invalid", planType: "pro" } }],
    ["plan", { account: { type: "chatgpt", email: "same@example.invalid", planType: "business" } }],
    ["missing identity", { account: { type: "chatgpt", planType: "pro" } }],
  ])("does not attach usage or positive permission after a changed %s without routing IDs", async (_name, after) => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    const before = { account: { type: "chatgpt", email: "same@example.invalid", planType: "pro" } };
    f.set({ accounts: [before, after] });
    const result = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
    expect(result.account.email).toBe("email" in after.account ? after.account.email : undefined);
    expect(result.account.plan).toBe(after.account.planType);
    expect(result.account.limits).toEqual([]); expect(result.account.limitsObservedAt).toBeUndefined();
    expect(result.account.limitsError).toBeTruthy(); expect(result.account.accountId).toBeUndefined();
    expect(result.account.credits).toBeUndefined(); expect(result.account.codexUsage?.state).toBe("unknown");
    expect(result.blockers).toEqual([]); // Optional usage does not become a new launch gate.
  });
  it("requires corroborated identity and preserves independent dates before unrelated metadata finishes", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    const anonymous = { account: { type: "chatgpt", planType: "pro" } };
    for (const account of [anonymous, { ...anonymous, workspaceRouting: { chatgptAccountId: "other" } }]) {
      f.set({ accounts: [account] });
      const result = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
      expect(result.account.limits).toEqual([]); expect(result.account.codexUsage?.state).toBe("unknown");
      expect(result.account.limitsObservedAt).toBeUndefined(); expect(result.account.accountId).toBeUndefined();
    }
    // Both matching routing reads can establish identity even without an email.
    f.set({ accounts: [{ ...anonymous, workspaceRouting: { chatgptAccountId: "fixture-account" } }], modelDelayMs: 100 });
    const result = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
    expect(result.account.limits).toHaveLength(3); expect(result.account.codexUsage?.state).toBe("allowed");
    expect(result.account.accountId).toBe("fixture-account");
    expect(Date.parse(result.account.limitsObservedAt!)).toBeLessThanOrEqual(Date.parse(result.account.updatedAt));
    expect(result.account.codexUsageObservedAt).toBe(result.account.updatedAt);
    expect(Date.now() - Date.parse(result.account.updatedAt)).toBeGreaterThanOrEqual(100);
  });
  it.each([{ initializeError: true }, { accountError: true }, { afterAccountError: true }, { version: "0.162.0" }])("exposes failed metadata as unavailable: %j", async fixture => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox); f.set(fixture);
    const result = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
    expect(result.account.error).toBeTruthy(); expect(result.account.limitsError).toBeTruthy();
    expect(result.account.limitsObservedAt).toBeUndefined(); expect(result.account.codexUsage).toBeUndefined();
    expect(result.blockers.length).toBeGreaterThan(0);
  });
  it("compares retained usage identity across routing and usage-ID fields, including repeated failed reads", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    const auth = { account: { type: "chatgpt", email: "same@example.invalid", planType: "pro" } };
    info = new AgentInfo({ agentId: "codex", executable: { claude: "unused", codex: f.executable }, cwd: sandbox.root, claudeCwd: sandbox.root, env: f.env });
    for (const failures of [0, 2]) {
      f.set({ accounts: [auth] }); await info.refresh();
      const original = structuredClone(info.state.account!);
      expect(original.limitsAccountId).toBe("fixture-account");
      for (let i = 0; i < failures; i++) {
        f.set({ accounts: [auth], usageError: true }); await info.refresh();
        expect(info.state.account).toMatchObject({ limits: original.limits, limitsObservedAt: original.limitsObservedAt, limitsAccountId: "fixture-account", limitsStale: true });
      }
      f.set({ accounts: [{ ...auth, workspaceRouting: { chatgptAccountId: "other-workspace" } }], usageError: true }); await info.refresh();
      expect(info.state.account).toMatchObject({ email: auth.account.email, routingAccountId: "other-workspace", limits: [], codexUsage: { state: "unknown" } });
      expect(info.state.account!.limitsObservedAt).toBeUndefined(); expect(info.state.account!.limitsAccountId).toBeUndefined();
    }
  });
  it("attributes workspace credits through real account/usage/account pipes and clears them on failed refreshes", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    const usage = { accountId: "fixture-account", ordinaryUsageAllowed: false, rateLimitsByLimitId: { codex: { credits: { balance: "50", hasCredits: true, unlimited: false }, primary: { usedPercent: 31, windowDurationMins: 1440 } }, other: { credits: { balance: "10", hasCredits: false, unlimited: true } } } };
    f.set({ usage });
    info = new AgentInfo({ agentId: "codex", executable: { claude: "unused", codex: f.executable }, cwd: sandbox.root, claudeCwd: sandbox.root, env: f.env });
    await info.refresh();
    expect(info.state.account?.credits).toMatchObject([{ balance: "50", scope: "workspace", bucketId: "codex", accountId: "fixture-account" }, { balance: "10", bucketId: "other" }]);
    expect(info.state.account?.codexUsage?.state).toBe("blocked");
    expect(info.state.account?.limits[0]).toMatchObject({ percent: 31, durationMinutes: 1440 });
    f.set({ usage: { ...usage, rateLimitsByLimitId: { codex: { credits: { balance: "75", hasCredits: true, unlimited: false } } } } }); await info.refresh();
    expect(info.state.account?.limitsStale).toBe(true);
    expect(codexBillingSummary(info.state.account)).toMatchObject({ email: "fixture@example.test", credits: [{ balance: "75" }] });
    f.set({ usage }); await info.refresh(); // Begin the refresh-failure case with a successful gauge read.
    f.set({ usageError: true }); await info.refresh();
    expect(info.state.account?.credits).toBeUndefined();
    expect(info.state.account?.limits[0]?.percent).toBe(31); // Existing stale gauges remain independent.
    f.set({ usage }); await info.refresh(); expect(info.state.account?.credits).toHaveLength(2);
    f.set({ apiKey: true }); await info.refresh();
    expect(info.state.account?.credits).toBeUndefined(); expect(info.state.blockers.join(" ")).toContain("codex login");
    const account = { account: { type: "chatgpt", email: "same@example.test", planType: "business" } };
    f.set({ usage, accounts: [{ ...account, workspaceRouting: { chatgptAccountId: "other" } }, { ...account, workspaceRouting: { chatgptAccountId: "fixture-account" } }] });
    await info.refresh(); expect(info.state.account?.credits).toBeUndefined();
    expect(f.calls().every(call => !/^(thread|turn)\//.test(call.method))).toBe(true);
  });
  it("settles failed metadata process creation without leaving close waiting for a nonexistent exit", async () => {
    sandbox = createSandbox();
    const rpc = new CodexMetadataRpc("/nonexistent/kiln-codex", sandbox.root, sandbox.env);
    await expect(rpc.initialize()).rejects.toThrow("Could not start Codex");
    await rpc.close();
  });
  it("reports real adapter version, authentication, disabled-skill and policy failures without starting a turn", async () => {
    sandbox = createSandbox(); const f = installCodexMetadataFixture(sandbox);
    for (const [fixture, message] of [[{ version: "0.162.0" }, "incompatible"], [{ apiKey: true }, "ChatGPT"], [{ provider: "custom" }, "OpenAI"], [{ configError: true }, "Could not inspect Codex provider and hooks"], [{ hooks: { interactive: true } }, "hook configuration"], [{ disabledSkill: "deliverable-review" }, "deliverable-review"], [{ requirements: { unknownMandatoryRestriction: true } }, "managed requirement"]] as const) {
      f.set(fixture); const r = await readCodexMetadata({ ...f, cwd: sandbox.root, cwds: [sandbox.root] });
      expect(r.blockers.join(" ")).toContain(message);
    }
    const absent = await readCodexMetadata({ executable: undefined, cwd: sandbox.root, cwds: [sandbox.root], env: f.env });
    expect(absent.blockers[0]).toContain("not on PATH");
    expect(absent.account.error).toContain("not on PATH"); expect(absent.account.limitsError).toBeTruthy();
    expect(absent.account.limitsObservedAt).toBeUndefined();
    expect(f.calls().every(c => !c.method.startsWith("turn/") && !c.method.startsWith("thread/"))).toBe(true);
  });
});
