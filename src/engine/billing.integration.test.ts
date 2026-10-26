import { recoveryRequest } from "../test-support/phase-recovery-request.js";
// Dispatch proofs use real temporary Git and scripted model processes; passive-boundary.integration
// separately proves the real provider SDK/auth contract. No paid inference is used here.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { readPrdRecord } from "../state/records.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import { buildSnapshot } from "./snapshot.js";
let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });
const approval = (h: Harness) => ({ executionId: h.engine.record.executionId, selectionGeneration: h.engine.record.settings.selectionGeneration ?? 0, readingId: h.engine.billing.view.next!.readingId, approved: true });
async function ready() { await h!.engine.refreshBilling(); await waitFor(() => !h!.engine.agents.state.pending); }
describe("Claude billing at the common dispatch boundary", () => {
  it("dispatches nothing before API approval, retains the grant after restart, then gates every phase and finalization", async () => {
    h = await createHarness({ sessions: [landingSession("one"), landingSession("two"), landingSession("three"), pullRequestSession()] });
    h.env.ANTHROPIC_API_KEY = "private-credential-canary"; await ready();
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false });
    expect(h.claudeCalls()).toHaveLength(0); expect(h.engine.record.startedAt).toBeUndefined();
    await h.engine.billingCommand("approval", approval(h)); expect(h.claudeCalls()).toHaveLength(0);
    const approved = h.engine.record.billing!.approval;
    h.engine = h.reopenFromDisk(); await h.engine.agents.refresh(); await ready();
    expect(h.engine.record.billing!.approval).toEqual(approved); expect(h.engine.billing.view.canLaunch).toBe(true);
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(4); expect(h.engine.record.completedAt).toBeDefined(); expect(h.engine.record.billing!.approval).toBeUndefined(); expect(h.engine.billing.view.canLaunch).toBe(false);
    for (const key of ["1", "2b", "3", "pr"]) expect(h.engine.latestSession(key)!.runs[0]!.billing).toMatchObject({ route: "metered", approved: true });
    const serialized = JSON.stringify(buildSnapshot(h.engine)) + readFileSync(join(h.stateDirectory, "prd.json"), "utf8");
    expect(serialized).not.toContain("private-credential-canary"); expect(JSON.stringify(buildSnapshot(h.engine))).not.toContain(h.engine.record.billing!.key);
  });
  it("holds changed post-setup settings before any model run, survives restart, and approval alone cannot continue", async () => {
    h = await createHarness({ sessions: [landingSession()] }); await ready();
    // An ordinary engine listener changes the impending launch environment as setup finishes.
    const off = h.engine.onChange(() => { if (h!.engine.record.setupCompletedAt) h!.env.ANTHROPIC_API_KEY = "new-post-setup-canary"; });
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled(); off();
    expect(h.claudeCalls()).toHaveLength(0); expect(h.engine.record.billing!.hold).toMatchObject({ phaseKey: "1", action: "launch" });
    expect(h.engine.latestSession("1")!.runs).toHaveLength(0); expect(buildSnapshot(h.engine).feature.state).toBe("needs_you");
    h.engine = h.reopenFromDisk(); await h.engine.agents.refresh(); await ready();
    expect((await h.engine.decide()).kind).toBe("needs_you"); expect(h.claudeCalls()).toHaveLength(0);
    await h.engine.billingCommand("approval", approval(h)); await h.engine.settled(); expect(h.claudeCalls()).toHaveLength(0);
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true }); await h.engine.settled(); expect(h.claudeCalls().length).toBeGreaterThan(0);
  });
  it("preserves the stopped conversation and checks, holds a changed credential on manual Resume, then resumes explicitly", async () => {
    h = await createHarness({ sessions: [{ actions: [{ write: { path: "partial", content: "saved" } }, { result: "Please finish the mapping." }] }, landingSession()] }); await ready();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const session = h.engine.latestSession("1")!; const checks = structuredClone(h.engine.record.phases["1"]!.stop!.checks);
    const attempt = buildSnapshot(h.engine).needsYou!.phaseRecovery!;
    h.env.ANTHROPIC_AUTH_TOKEN = "changed-credential-canary";
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.latestSession("1")!.runs).toHaveLength(1);
    expect(h.engine.record.phases["1"]!.stop!.checks).toEqual(checks); expect(h.engine.record.billing!.hold?.sessionId).toBe(session.sessionId);
    expect(buildSnapshot(h.engine).needsYou!.phaseRecovery!.attemptStartedAt).toBe(attempt.attemptStartedAt);
    expect(buildSnapshot(h.engine).needsYou!.phaseRecovery!.target.stoppedAt).not.toBe(attempt.target.stoppedAt);
    expect(existsSync(join(h.engine.worktreePath, "partial"))).toBe(true);
    await h.engine.billingCommand("approval", approval(h)); expect(h.claudeCalls()).toHaveLength(1);
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.claudeCalls()[1]!.args).toContain("--resume"); expect(h.engine.latestSession("1")!.sessionId).toBe(session.sessionId); expect(h.engine.latestSession("1")!.runs[1]!.billing?.approved).toBe(true);
  });
  it("serializes approval against Start/clear and prevents stale credential replacement from inheriting a click", async () => {
    h = await createHarness({ sessions: [] }); h.env.ANTHROPIC_API_KEY = "A"; await ready();
    const old = approval(h); h.env.ANTHROPIC_API_KEY = "B";
    await expect(h.engine.billingCommand("approval", old)).rejects.toMatchObject({ code: "stale_billing_reading" });
    expect(readPrdRecord(h.stateDirectory)?.billing?.approval).toBeUndefined();
    const command = h.engine.billingCommand("approval", approval(h));
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false });
    await expect(h.engine.billingCommand("clear", approval(h))).rejects.toMatchObject({ code: "invalid_request" });
    await command; expect(h.claudeCalls()).toHaveLength(0);
  });
  it("suspends automatic usage recovery at a billing hold, retaining the refusal and requiring explicit Resume after approval", async () => {
    const claude = new ScriptedClaude(() => new Date());
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
    h = await createHarness({ sessions: [{ actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3600 } }, { exit: 1 }] }, landingSession()], engineOptions: { claude } }); await ready();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1"); const wait = structuredClone(h.engine.record.phases["1"]!.wait);
    const refusal = structuredClone(h.engine.latestSession("1")!.runs[0]!.limitRefusal);
    h.env.ANTHROPIC_API_KEY = "auto-recovery-canary";
    claude.queue(signedIn([usageRow("session", 10)]), signedIn([usageRow("session", 10)]));
    await waitFor(() => !!h!.engine.record.billing!.hold); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.phases["1"]!.wait).toMatchObject({ since: wait!.since, sessionId: wait!.sessionId, run: wait!.run });
    expect(h.engine.latestSession("1")!.runs[0]!.limitRefusal).toEqual({ ...refusal, account: { email: "alex@acme-shop.dev", orgId: "org-alex" } });
    await h.engine.billingCommand("approval", approval(h)); claude.queue(signedIn([usageRow("session", 1)]));
    await h.engine.settled(); expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.record.billing!.hold).toBeDefined();
    claude.queue(signedIn([usageRow("session", 10)])); await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.engine.latestSession("1")!.runs[1]).toMatchObject({ cause: "person_resume", billing: { route: "metered", approved: true } });
  });

  it("resumes the saved model when a different next-session choice was retired, while still checking billing", async () => {
    h = await createHarness({ sessions: [{ actions: [{ result: "Need a mapping answer." }] }, landingSession()] }); await ready();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); const original = h.engine.latestSession("1")!;
    expect(await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, model: "sonnet" })).toEqual({ ok: true });
    const file = join(h.sandbox.root, "retired-next-model.json");
    const catalogue = JSON.parse(readFileSync(new URL("../../test/fixtures/proof-gate-1/supported-models.json", import.meta.url), "utf8"));
    writeFileSync(file, JSON.stringify({ models: catalogue.models.filter((m: { value: string }) => m.value !== "sonnet") })); h.env.KILN_STANDIN_MODELS = file;
    await h.engine.agents.refresh(); await h.engine.refreshBilling();
    expect(h.engine.selectionError).toContain("sonnet"); expect(h.engine.billing.view.canLaunch).toBe(true);
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.claudeCalls()[1]!.args).toEqual(expect.arrayContaining(["--resume", original.sessionId, "--model", "claude-opus-5-5"]));
    expect(h.engine.latestSession("1")!.runs).toHaveLength(2); expect(h.engine.record.phases["1"]!.doneAt).toBeDefined();
    expect(h.engine.record.phases["2b"]!.stop?.kind).toBe("selection");
  });

  it.each(["stale", "mismatched", "unattributed", "missing"])("omits %s overflow without blocking subscription access or hiding usage rows", async kind => {
    const claude = new ScriptedClaude(() => new Date());
    const overflow = { enabled: true, observedAt: new Date(Date.now() - (kind === "stale" ? 6 * 60_000 : 0)).toISOString(), ...(kind === "unattributed" ? {} : { email: kind === "mismatched" ? "other@example.test" : "alex@acme-shop.dev", orgId: "org-alex" }) };
    claude.queue(signedIn([usageRow("session", 42)], kind === "missing" ? {} : { extraUsage: overflow }));
    h = await createHarness({ sessions: [], engineOptions: { claude } });
    h.env.KILN_STANDIN_VERSION = "2.1.307"; const account = join(h.sandbox.root, "attributed-account.json");
    writeFileSync(account, JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "alex@acme-shop.dev", orgId: "org-alex", subscriptionType: "max" })); h.env.KILN_STANDIN_ACCOUNT = account;
    await h.engine.refreshBilling();
    expect(h.engine.billing.view.next).toMatchObject({ route: "subscription", approved: false });
    expect(h.engine.billing.view.next?.overflow).toBeUndefined(); expect(h.engine.billing.view.canLaunch).toBe(true);
    expect(h.engine.agents.state.account?.limits).toMatchObject([{ kind: "session", percent: 42 }]);
    expect(h.engine.record.billing?.hold).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(0);
  });

});
