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
import { statusProjection } from "../control/projection.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";
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
    h.env.ANTHROPIC_FOUNDRY_RESOURCE = "inactive-foundry";
    h.env.ANTHROPIC_VERTEX_PROJECT_ID = "inactive-vertex";
    h.env.AWS_PROFILE = "inactive-aws-profile";
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
    // AC-RUN-05/06: terminal guidance is actionable and never carries the credential.
    const messages = h.events.flatMap(event => event.kind === "message" ? [event.text] : []);
    expect(messages).toContainEqual(expect.stringMatching(/^Billing hold: .*Open Kiln's browser address above to review billing and continue\.$/));
    expect(messages.join("\n")).not.toContain("new-post-setup-canary");
    h.engine = h.reopenFromDisk(); await h.engine.agents.refresh(); await ready();
    expect((await h.engine.decide()).kind).toBe("needs_you"); expect(h.claudeCalls()).toHaveLength(0);
    await h.engine.billingCommand("approval", approval(h)); await h.engine.settled(); expect(h.claudeCalls()).toHaveLength(0);
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true }); await h.engine.settled(); expect(h.claudeCalls().length).toBeGreaterThan(0);
  });
  it("reinspects changed billing between every phase and final delivery instead of reusing Start approval", async () => {
    h = await createHarness({ sessions: [landingSession("one"), landingSession("two"), landingSession("three"), pullRequestSession()] });
    h.env.ANTHROPIC_API_KEY = "phase-context-start"; await ready();
    await h.engine.billingCommand("approval", approval(h));
    const changed = new Set<string>();
    const off = h.engine.onChange(() => {
      for (const key of ["1", "2b", "3"]) if (h!.engine.record.phases[key]?.doneAt && !changed.has(key)) {
        changed.add(key); h!.env.ANTHROPIC_API_KEY = `changed-after-${key}`;
      }
    });
    try {
      await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
      for (const [index, next] of ["2b", "3", "pr"].entries()) {
        expect(h.claudeCalls()).toHaveLength(index + 1);
        expect(h.engine.record.billing!.hold).toMatchObject({ phaseKey: next, action: "launch" });
        expect(h.engine.record.billing!.approval).toBeUndefined();
        expect(h.engine.latestSession(next)!.runs).toHaveLength(0);
        await h.engine.billingCommand("approval", approval(h));
        expect(h.claudeCalls()).toHaveLength(index + 1);
        await h.engine.checkAgain(recoveryRequest(h.engine, "verify")); await h.engine.settled();
      }
      expect(h.claudeCalls()).toHaveLength(4); expect(h.engine.record.completedAt).toBeDefined();
    } finally { off(); }
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
    // Status reads the hold's own check run while it names the stopped phase, never the stop's earlier one (waivers "Check Runs").
    const hold = h.engine.record.billing!.hold!;
    expect(hold.run!.id).not.toBe(h.engine.record.phases["1"]!.stop!.run?.id);
    const status = statusProjection(readWork(stateRoot(h.env), h.stateDirectory), h.engine) as unknown as { stop: { check_run: { id: string } | null } };
    expect(status.stop.check_run?.id).toBe(hold.run!.id);
    expect(buildSnapshot(h.engine).needsYou!.phaseRecovery!.attemptStartedAt).toBe(attempt.attemptStartedAt);
    expect(buildSnapshot(h.engine).needsYou!.phaseRecovery!.target.stoppedAt).not.toBe(attempt.target.stoppedAt);
    expect(existsSync(join(h.engine.worktreePath, "partial"))).toBe(true);
    await h.engine.billingCommand("approval", approval(h)); expect(h.claudeCalls()).toHaveLength(1);
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.claudeCalls()[1]!.args).toContain("--resume"); expect(h.engine.latestSession("1")!.sessionId).toBe(session.sessionId); expect(h.engine.latestSession("1")!.runs[1]!.billing?.approved).toBe(true);
  });
  it("starts and resumes subscription work without approval when only inactive provider endpoints are present", async () => {
    h = await createHarness({ sessions: [{ actions: [{ result: "Saved work." }] }, landingSession()] });
    h.env.KILN_STANDIN_VERSION = "2.1.312";
    h.env.AWS_ENDPOINT_URL = "https://unrelated-aws.example.test";
    h.env.ANTHROPIC_VERTEX_BASE_URL = "https://inactive-vertex.example.test";
    await ready(); expect(h.engine.billing.view.next).toMatchObject({ route: "subscription", sources: [] });
    expect(h.engine.billing.view.canLaunch).toBe(true);
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    const first = h.engine.latestSession("1")!;
    expect(first.runs[0]!.billing).toMatchObject({ route: "subscription", approved: false });
    h.engine = h.reopenFromDisk(); await h.engine.agents.refresh(); await ready();
    expect(h.engine.billing.view.canLaunch).toBe(true);
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true, outcome: "resume_requested" }); await h.engine.settled();
    expect(h.claudeCalls()[1]!.args).toContain("--resume");
    expect(h.engine.latestSession("1")!.sessionId).toBe(first.sessionId);
    expect(h.engine.latestSession("1")!.runs[1]!.billing).toMatchObject({ route: "subscription", approved: false });
    expect(h.engine.record.billing!.approval).toBeUndefined(); expect(h.engine.record.billing!.hold).toBeUndefined();
  });
  it("requires approval for a selected provider endpoint and invalidates it when that endpoint changes", async () => {
    h = await createHarness({ sessions: [] }); h.env.KILN_STANDIN_VERSION = "2.1.312";
    h.env.CLAUDE_CODE_USE_BEDROCK = "1"; h.env.ANTHROPIC_BEDROCK_BASE_URL = "https://gateway-one.example.test";
    await ready(); expect(h.engine.billing.view.next).toMatchObject({ route: "metered", sources: expect.arrayContaining(["Kiln environment · ANTHROPIC_BEDROCK_BASE_URL"]) });
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false }); expect(h.claudeCalls()).toHaveLength(0);
    await h.engine.billingCommand("approval", approval(h)); const digest = h.engine.record.billing!.current!.fingerprint;
    h.env.ANTHROPIC_VERTEX_BASE_URL = "https://inactive.example.test"; await ready();
    expect(h.engine.billing.view.next!.approved).toBe(true); expect(h.engine.record.billing!.current!.fingerprint).toBe(digest);
    h.env.GOOGLE_APPLICATION_CREDENTIALS = "/unrelated/google.json"; h.env.ANTHROPIC_FOUNDRY_RESOURCE = "unrelated-foundry"; await ready();
    expect(h.engine.billing.view.next!.approved).toBe(true); expect(h.engine.record.billing!.current!.fingerprint).toBe(digest);
    h.env.ANTHROPIC_BEDROCK_BASE_URL = "https://gateway-two.example.test"; await ready();
    expect(h.engine.billing.view.next!.approved).toBe(false); expect(h.engine.record.billing!.current!.fingerprint).not.toBe(digest);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false }); expect(h.claudeCalls()).toHaveLength(0);
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

  // AC-RUN-01/03: use the real interrupted-session and wake paths, not a manual Resume proxy.
  it.each(["restart", "sleep"] as const)("holds a changed billing source on automatic %s recovery without losing the conversation", async mode => {
    let slept = ""; let reported = false;
    h = await createHarness({ sessions: [], engineOptions: {
      stopWaitMs: 50, killGraceMs: 50, sleepCheckMs: 20,
      sleepReader: { next: async () => {
        if (reported || !slept || !existsSync(slept)) return [];
        reported = true; writeFileSync(`${slept}.found`, "");
        return [{ at: new Date(Date.now() - 600_000).toISOString(), seconds: 600 }];
      } },
    } });
    slept = join(h.sandbox.root, "billing-sleep"); const working = join(h.sandbox.root, "billing-working");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [
      { actions: [{ skill: "enso-method:implement-from-requirements" }, { text: "Saving partial billing work." }, { write: { path: "partial-billing-work.txt", content: "retained" } }, { touch: working },
        ...(mode === "restart" ? [{ work: "npm test" }] : [{ waitForFile: `${slept}.found` }, { stderr: "API Error: Connection error." }, { exit: 1 }])] },
      { actions: [{ result: "Saved conversation still needs input." }] },
    ] }));
    await ready(); await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(working));
    const original = h.engine.latestSession("1")!;
    expect(original.runs[0]!.billing?.route).toBe("settings"); // Optional unavailable metadata did not block the first launch.
    if (mode === "restart") {
      await h.engine.stop("sigint"); h.env.ANTHROPIC_API_KEY = "recovery-secret-canary";
      h.engine = h.reopenFromDisk(); await h.engine.prepare();
      expect((await h.engine.decide()).kind).toBe("resume"); await h.engine.continue();
    } else {
      // The stand-in's file write can precede Kiln reading its stdout. A sleep
      // must begin after the last pre-sleep model response has been observed.
      await waitFor(() => h!.engine.outputLines(original).some(line => line.text === "Saving partial billing work."));
      h.env.ANTHROPIC_API_KEY = "recovery-secret-canary"; writeFileSync(slept, "");
    }
    await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.latestSession("1")!.runs).toHaveLength(1);
    expect(h.engine.latestSession("1")!.runs[0]!.interruptedBy).toBe(mode === "restart" ? "sigint" : "sleep");
    expect(h.engine.record.billing!.hold).toMatchObject({ action: "resume", sessionId: original.sessionId, phaseKey: "1" });
    expect(readFileSync(join(h.engine.worktreePath, "partial-billing-work.txt"), "utf8")).toBe("retained");
    await h.engine.billingCommand("approval", approval(h)); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(2); expect(h.claudeCalls()[1]!.args).toContain("--resume");
    expect(h.engine.latestSession("1")!.sessionId).toBe(original.sessionId);
    expect(h.engine.latestSession("1")!.runs[1]).toMatchObject({ cause: "person_resume", billing: { route: "metered", approved: true } });
  });

  it("holds Resume now at a changed billing source even when the usage percentage is only advisory", async () => {
    const claude = new ScriptedClaude(() => new Date());
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
    h = await createHarness({ sessions: [
      { actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3600 } }, { exit: 1 }] },
      { actions: [{ result: "Manual recovery still needs input." }] },
    ], engineOptions: { claude } }); await ready();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    const wait = structuredClone(h.engine.record.phases["1"]!.wait!);
    // Finish the first post-refusal attribution before taking the preservation baseline.
    claude.queue(signedIn([usageRow("session", 100)]));
    await waitFor(() => !!h!.engine.latestSession("1")!.runs[0]!.limitRefusal?.account);
    const first = structuredClone(h.engine.latestSession("1")!.runs[0]!);
    h.env.ANTHROPIC_API_KEY = "resume-now-private-canary";
    claude.queue(signedIn([usageRow("session", 100)]));
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.latestSession("1")!.runs).toHaveLength(1);
    expect(h.engine.record.billing!.hold).toMatchObject({ action: "resume", sessionId: wait.sessionId });
    expect(h.engine.record.phases["1"]!.wait).toMatchObject({ since: wait.since, run: wait.run, sessionId: wait.sessionId });
    expect(h.engine.latestSession("1")!.runs[0]!.limitRefusal).toEqual(first.limitRefusal);
    await h.engine.billingCommand("approval", approval(h)); await h.engine.settled(); expect(h.claudeCalls()).toHaveLength(1);
    claude.queue(signedIn([usageRow("session", 100)]));
    await h.engine.resume(recoveryRequest(h.engine)); await h.engine.settled();
    expect(h.engine.latestSession("1")!.runs[1]).toMatchObject({ cause: "person_resume", billing: { route: "metered", approved: true } });
    expect(h.claudeCalls()).toHaveLength(2);
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
    h.env.KILN_STANDIN_VERSION = "2.1.312"; const account = join(h.sandbox.root, "attributed-account.json");
    writeFileSync(account, JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "alex@acme-shop.dev", orgId: "org-alex", subscriptionType: "max" })); h.env.KILN_STANDIN_ACCOUNT = account;
    await h.engine.refreshBilling();
    expect(h.engine.billing.view.next).toMatchObject({ route: "subscription", approved: false });
    expect(h.engine.billing.view.next?.overflow).toBeUndefined(); expect(h.engine.billing.view.canLaunch).toBe(true);
    expect(h.engine.agents.state.account?.limits).toMatchObject([{ kind: "session", percent: 42 }]);
    expect(h.engine.record.billing?.hold).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(0);
  });

});
