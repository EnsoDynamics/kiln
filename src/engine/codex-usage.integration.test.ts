import { recoveryRequest } from "../test-support/phase-recovery-request.js";
// Real engine/Git/disk/process boundaries; verified protocol failure injection is not quota proof.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { Engine } from "./engine.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { buildSnapshot, type LimitView } from "./snapshot.js";
import { git } from "../test-support/git-repositories.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { writePrdRecord, writeSessionRecord } from "../state/records.js";
import { releaseResult } from "../control/spool.js";
import { cacheSnapshot, handoffProjection, inspectionSnapshot, statusProjection } from "../control/projection.js";
import { readWork } from "../control/private-state.js";
import { stateRoot, writeJsonAtomically } from "../state/state-files.js";

let h: Harness;
let f: ReturnType<typeof codexWorkFixture>;
let server: LocalServer | undefined;
let chrome: HeadlessChrome | undefined;
afterEach(async () => { await chrome?.close(); chrome = undefined; await server?.close(); server = undefined; await h?.cleanup(); await f?.sandbox.cleanup(); });
const set = (value: Record<string, unknown>) => f.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usageRefusal: true, ordinaryUsageAllowed: false, ...value });
const dispatches = () => f.calls().filter(call => call.method === "turn/start");
async function setup(value: Record<string, unknown> = {}) {
  h = await createHarness({ sessions: [], claude: join("missing", "claude") }); f = codexWorkFixture();
  Object.assign(h.tools, { codex: f.options.executable }); f.configureEnvironment(h.env);
  set(value); h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  await h.engine.changeSettings({ agentId: "codex" }); await h.engine.agents.refresh();
  await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
  await h.engine.agents.refresh(); await h.engine.settled();
}
async function refresh(value: Record<string, unknown>) {
  set(value); await h.engine.agents.refresh(); await h.engine.settled();
}

it("waits on explicit blocked permission, resumes once with the original pair, persists repeat-refusal suppression, and releases after a blocked-to-allowed transition", async () => {
  await setup();
  const original = h.engine.latestSession("1")!;
  expect(buildSnapshot(h.engine).feature.state).toBe("waiting");
  expect(original.runs[0]).toMatchObject({ limitRefusal: { agentId: "codex", codex: { code: "usageLimitExceeded", accountId: "proof-account" } }, codex: { errors: [{ willRetry: false }], terminal: { status: "failed" } } });
  expect(original.runs[0]?.limitRefusal?.resetsAt).toBeUndefined();
  await h.engine.changeSettings({ agentId: "codex", selectionGeneration: h.engine.agents.state.generation, effort: "low" });
  await refresh({ ordinaryUsageAllowed: true });
  await waitFor(() => h.engine.latestSession("1")?.runs.length === 2 && h.engine.latestSession("1")?.runs[1]?.endedAt !== undefined);
  await h.engine.agents.refresh(); await h.engine.settled();
  expect(h.engine.latestSession("1")?.runs[1]).toMatchObject({ cause: "limit_resume", codex: { automaticUsageEvidence: { accountId: "proof-account" }, requested: { effort: "high" }, modelActivityAt: [] } });
  const automaticPrompt = JSON.stringify(dispatches()[1]?.params?.input);
  expect(automaticPrompt).toContain("because Codex's usage limit refused its request. Kiln has resumed it on the Codex account signed in now.");
  expect(automaticPrompt).toContain("Carry on with `docs/prds/customer-returns/phase-1-return-intake.md`");
  expect(automaticPrompt).not.toContain("Claude");
  expect(buildSnapshot(h.engine).waiting?.limit.recovery?.reason).toContain("Unchanged permission");
  const consumed = h.engine.latestSession("1")?.codex?.usageRecovery?.consumed;
  h.reopenFromDisk(); await h.engine.agents.refresh(); expect((await h.engine.decide()).kind).toBe("waiting"); await h.engine.continue();
  await refresh({ ordinaryUsageAllowed: true });
  expect(dispatches()).toHaveLength(2);
  expect(h.engine.latestSession("1")?.codex?.usageRecovery?.consumed).toEqual(consumed);
  await refresh({ ordinaryUsageAllowed: false });
  await refresh({ ordinaryUsageAllowed: true, usageRefusal: false });
  await waitFor(() => h.engine.latestSession("1")?.runs[2]?.endedAt !== undefined); await h.engine.settled();
  const recovered = h.engine.latestSession("1")!;
  expect(recovered.conversation?.threadId).toBe(original.conversation?.threadId);
  expect(recovered.runs[2]).toMatchObject({ cause: "limit_resume", codex: { requested: { model: original.model, effort: "high" }, terminal: { status: "completed" } } });
  expect(h.claudeCalls()).toEqual([]);
});

it("allows a fresh changed stable account while preserving original and attempt account provenance", async () => {
  await setup(); const original = h.engine.latestSession("1")!;
  await refresh({ accountId: "second-account", ordinaryUsageAllowed: true, usageRefusal: false });
  await waitFor(() => h.engine.latestSession("1")?.runs[1]?.endedAt !== undefined); await h.engine.settled();
  const session = h.engine.latestSession("1")!;
  expect(session.codex?.originalAccount.accountId).toBe("proof-account");
  expect(session.runs[1]?.codex?.account.accountId).toBe("second-account");
  expect(session.runs[1]?.codex?.automaticUsageEvidence?.accountId).toBe("second-account");
  expect(session.conversation?.threadId).toBe(original.conversation?.threadId);
});

it.each(["blocked", "off", "blocked_off"])("rechecks %s at fresh launch preflight without dispatching or fabricating an attempt", async mode => {
  await setup();
  const before = f.calls().filter(call => call.method === "account/rateLimits/read").length;
  set({ ordinaryUsageAllowed: true, usageDelayMs: 500 });
  await h.engine.agents.refresh();
  await waitFor(() => f.calls().filter(call => call.method === "account/rateLimits/read").length >= before + 2);
  if (mode !== "blocked") await h.engine.changeSettings({ resumeAfterUsageLimit: false });
  if (mode !== "off") set({ ordinaryUsageAllowed: false });
  await waitFor(() => !h.engine.checking); await h.engine.settled();
  await h.engine.agents.refresh();
  expect(dispatches()).toHaveLength(1);
  expect(h.engine.latestSession("1")?.runs).toHaveLength(1);
  expect(buildSnapshot(h.engine).feature.state).toBe(mode === "blocked" ? "waiting" : "needs_you");
  expect(h.engine.latestSession("1")?.runs[0]?.limitRefusal?.codex).toBeDefined();
});

it.each(["off", "blocked", "unknown", "suppressed"])("reconciles a crashed quota terminal through usage policy (%s), never ordinary interruption resume", async mode => {
  await setup();
  if (mode === "suppressed") {
    await refresh({ ordinaryUsageAllowed: true });
    await waitFor(() => h.engine.latestSession("1")?.runs[1]?.endedAt !== undefined); await h.engine.settled();
  }
  const before = dispatches().length;
  const session = h.engine.latestSession("1")!; const run = session.runs.at(-1)!;
  delete run.endedAt; delete run.limitRefusal;
  delete h.engine.record.phases["1"]!.wait;
  if (mode === "off") h.engine.record.settings.resumeAfterUsageLimit = false;
  writeSessionRecord(h.stateDirectory, session); writePrdRecord(h.stateDirectory, h.engine.record);
  set({ ordinaryUsageAllowed: mode === "suppressed" ? true : mode === "unknown" ? null : false });
  h.reopenFromDisk(); await h.engine.agents.refresh();
  const decision = await h.engine.decide();
  expect(decision.kind).not.toBe("resume");
  await h.engine.continue(); await h.engine.agents.refresh(); await h.engine.settled();
  expect(dispatches()).toHaveLength(before);
  expect(buildSnapshot(h.engine).feature.state).toBe(mode === "off" || mode === "unknown" ? "needs_you" : "waiting");
  expect(h.engine.latestSession("1")?.runs.at(-1)?.limitRefusal?.codex?.code).toBe("usageLimitExceeded");
});

it("preserves the original wait when Ctrl+C cancels a launch preflight before allocation", async () => {
  await setup(); const before = f.calls().filter(call => call.method === "account/rateLimits/read").length;
  set({ ordinaryUsageAllowed: true, usageDelayMs: 500 }); await h.engine.agents.refresh();
  await waitFor(() => f.calls().filter(call => call.method === "account/rateLimits/read").length >= before + 2);
  await h.engine.stop("sigint"); await h.engine.settled();
  expect(h.engine.latestSession("1")?.runs).toHaveLength(1);
  expect(h.engine.record.phases["1"]?.wait?.run).toBe(0); expect(dispatches()).toHaveLength(1);
});

it.each([
  { ordinaryUsageAllowed: null },
  { usageError: true },
  { usage: { accountId: "conflicting", ordinaryUsageAllowed: true, rateLimits: {} } },
  { usage: { ordinaryUsageAllowed: true, rateLimits: {} } },
  { usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: { spendControlReached: true } } },
  { usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: { rateLimitReachedType: "workspace_owner_credits_depleted" } } },
])("goes to Needs you without inventing a reset or retry for unknown/admin evidence %j", async value => {
  await setup(value);
  const snapshot = buildSnapshot(h.engine);
  expect(snapshot.feature.state).toBe("needs_you"); expect(snapshot.needsYou?.limit?.agentId).toBe("codex");
  expect(snapshot.needsYou?.limit?.resetsAt).toBeUndefined(); expect(snapshot.needsYou?.resumeOffered).toBe(true);
  expect(dispatches()).toHaveLength(1);
  await h.engine.agents.refresh(); expect(dispatches()).toHaveLength(1);
});

it("does not classify a transient retry or generic rate failure as an exhausted allowance", async () => {
  await setup({ usageRefusal: false, retryError: { codexErrorInfo: "usageLimitExceeded", message: "Transient retry" } });
  expect(h.engine.latestSession("1")?.runs[0]?.limitRefusal).toBeUndefined();
  expect(h.engine.latestSession("1")?.runs[0]?.codex?.errors?.[0]?.willRetry).toBe(true);
  expect(buildSnapshot(h.engine).needsYou?.limit).toBeUndefined();
});

it("retains manual Resume now and setting-off behavior and does not gate usage recovery on confinement history", async () => {
  await setup();
  await h.engine.changeSettings({ resumeAfterUsageLimit: false });
  expect(buildSnapshot(h.engine).feature.state).toBe("needs_you");
  await h.engine.changeSettings({ resumeAfterUsageLimit: true }); await refresh({ ordinaryUsageAllowed: true });
  expect(dispatches()).toHaveLength(1); // Turning the setting on never launches from Needs you.
  set({ ordinaryUsageAllowed: false }); await h.engine.resume({ ...recoveryRequest(h.engine), note: "Keep the original settings." }); await h.engine.settled();
  await h.engine.agents.refresh();
  expect(dispatches()).toHaveLength(2);
  const manualPrompt = JSON.stringify(dispatches()[1]?.params?.input);
  expect(manualPrompt).toContain("because Codex's usage limit refused its request. Kiln has resumed it on the Codex account signed in now.");
  expect(manualPrompt).toContain("Keep the original settings.");
  expect(manualPrompt.indexOf("Keep the original settings.")).toBeLessThan(manualPrompt.indexOf("This session stopped"));
  expect(manualPrompt).not.toContain("Claude");
  const session = h.engine.latestSession("1")!;
  appendFileSync(join(f.home, "sessions", session.conversation!.threadId + ".jsonl"), "{broken}\n");
  await refresh({ ordinaryUsageAllowed: true });
  await waitFor(() => dispatches().length === 3);
  expect(dispatches()).toHaveLength(3);
});

it("finishes passing checks before any automatic retry", async () => {
  await setup(); const path = join(h.engine.worktreePath, "docs/prds/customer-returns/phase-1-return-intake.md");
  writeFileSync(path, readFileSync(path, "utf8").replace(/^(#.*)\n/, "$1\n**Closed:** 2026-10-23\n"));
  git(h.sandbox, h.engine.worktreePath, "add", "docs/prds/customer-returns/phase-1-return-intake.md");
  git(h.sandbox, h.engine.worktreePath, "commit", "-m", "feat(proof): finish during wait");
  git(h.sandbox, h.engine.worktreePath, "push", "-u", "origin", "feature/customer-returns");
  h.engine.pause();
  await refresh({ ordinaryUsageAllowed: true });
  await waitFor(() => h.engine.isPhaseDone("1")); await h.engine.settled();
  expect(h.engine.latestSession("1")?.runs).toHaveLength(1);
});

it("preserves independent allowance observations through waiting, failed refresh, full status and retained stop facts", async () => {
  const usage = { accountId: "proof-account", ordinaryUsageAllowed: false, rateLimitsByLimitId: { codex: { primary: { usedPercent: 85 } } } };
  await setup({ usage });
  const initial = buildSnapshot(h.engine).waiting!.limit;
  const usageAt = h.engine.agents.state.account!.limitsObservedAt!;
  expect(initial.allowancesObservation).toEqual({ observedAt: usageAt, state: "current", reason: null });
  expect(initial.allowances).toEqual([expect.objectContaining({ percent: 85 })]);
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
  const status = async () => {
    const response = await fetch(`${new URL(server!.address).origin}/api/control/v1/status?detail=full`, { headers: { "X-Kiln-Token": h.engine.record.token } });
    expect(response.status).toBe(200);
    return await response.json() as { usage_wait: { limit: LimitView } | null; stop: { limit: LimitView } | null };
  };
  const unknownUsage = { resetsAt: null, durationMinutes: null, scope: null, availability: { state: 'partial', reason: expect.any(String), unknown_fields: ['scope', 'resetsAt', 'durationMinutes'] } };
  const waitingStatus = (await status()).usage_wait!.limit;
  expect(waitingStatus.allowancesObservation).toEqual(initial.allowancesObservation);
  expect(waitingStatus.allowances).toEqual([expect.objectContaining(unknownUsage)]);
  const saved = readWork(stateRoot(h.env), h.stateDirectory);
  const cachePath = join(h.stateDirectory, "inspection-view.json");
  const retained = (field: "usage_wait" | "stop") => {
    const before = readFileSync(cachePath, "utf8");
    const answer = statusProjection(saved, undefined, true);
    const projected = answer[field] as { limit: LimitView };
    releaseResult(answer);
    expect(readFileSync(cachePath, "utf8")).toBe(before);
    return projected.limit;
  };
  const legacy = (field: "waiting" | "needsYou") => {
    const cache = JSON.parse(readFileSync(cachePath, "utf8"));
    delete cache.snapshot[field].limit.allowancesObservation;
    writeJsonAtomically(cachePath, cache);
  };
  cacheSnapshot(h.engine, inspectionSnapshot(h.engine));
  expect(retained("usage_wait").allowancesObservation).toMatchObject({ observedAt: usageAt, state: "stale" });
  expect(retained("usage_wait").allowances).toEqual([expect.objectContaining(unknownUsage)]);
  legacy("waiting");
  expect(retained("usage_wait")).toMatchObject({ allowances: [], allowancesObservation: { observedAt: null, state: "unavailable" } });

  await refresh({ usageError: true });
  const stopped = buildSnapshot(h.engine).needsYou!.limit!;
  expect(stopped.allowancesObservation).toMatchObject({ observedAt: usageAt, state: "stale", reason: expect.any(String) });
  expect(stopped.allowances).toEqual(initial.allowances);
  expect(Date.parse(stopped.account!.at)).toBeGreaterThan(Date.parse(initial.account!.at));
  const stopStatus = (await status()).stop!.limit;
  expect(stopStatus.allowancesObservation).toEqual(stopped.allowancesObservation);
  expect(stopStatus.allowances).toEqual([expect.objectContaining(unknownUsage)]);
  cacheSnapshot(h.engine, inspectionSnapshot(h.engine));
  await server.close(); server = undefined;
  expect((statusProjection(saved, undefined, true).stop as { limit: typeof stopped }).limit.allowancesObservation).toEqual(stopped.allowancesObservation);
  await refresh({ usage: { ...usage, ordinaryUsageAllowed: null } });
  const freshStop = buildSnapshot(h.engine).needsYou!.limit!;
  expect(freshStop.allowancesObservation!.state).toBe("current");
  cacheSnapshot(h.engine, inspectionSnapshot(h.engine));
  expect(retained("stop").allowancesObservation).toMatchObject({ observedAt: freshStop.allowancesObservation!.observedAt, state: "stale" });
  expect(retained("stop").allowances).toEqual([expect.objectContaining(unknownUsage)]);
  legacy("needsYou");
  expect(retained("stop")).toMatchObject({ allowances: [], allowancesObservation: { observedAt: null, state: "unavailable" } });
  // Legacy retained gauges have no independent date. Their nearby auth timestamp
  // cannot supply one or make the gauges current in another status projection.
  delete h.engine.agents.state.account!.limitsObservedAt;
  const undated = buildSnapshot(h.engine).needsYou!.limit!;
  expect(undated.allowancesObservation).toMatchObject({ observedAt: null, state: "unavailable" });
  expect(undated.allowances).toEqual([]); expect(dispatches()).toHaveLength(1);
});

it("shows Codex wait and unknown recovery, account allowances and native cleanup guidance in the real browser", async () => {
  const usage = { accountId: "proof-account", ordinaryUsageAllowed: false, rateLimits: {}, rateLimitsByLimitId: { codex: { limitName: "Ordinary allowance", primary: { usedPercent: 85, resetsAt: 1793000000 }, secondary: { usedPercent: 12 } } } };
  await setup({ usage });
  const usageAt = h.engine.agents.state.account!.limitsObservedAt;
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token }); chrome = await launchChrome();
  for (const state of ["waiting", "unknown"]) {
    if (state === "unknown") await refresh({ ordinaryUsageAllowed: null });
    for (const width of [360, 1280]) {
      const page = await chrome.open(server.address, { width, timeZone: "America/New_York" });
      await page.waitFor(`document.body.textContent.includes('No applicable reset')`);
      const text = await page.evaluate<string>("document.body.textContent");
      for (const expected of ["Codex", "codex login", "Independently detached", "Resume"]) expect(text).toContain(expected);
      if (state === "waiting") for (const expected of ["ordinary included usage is blocked", "Ordinary allowance [codex] · primary", "85% used", "reset unknown", "not usage solely from this PRD"]) expect(text).toContain(expected);
      else { expect(text).toContain("ordinary-usage permission is unavailable"); expect(text).toContain("Stale usage last updated");
        expect(buildSnapshot(h.engine).needsYou?.limit?.allowancesObservation).toMatchObject({ observedAt: usageAt, state: "stale" }); expect(text).not.toContain("Wait for the reset"); }
      expect(text).not.toContain("claude auth login");
      expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true); expect(page.problems).toEqual([]);
      if (process.env.KILN_SCREENSHOTS) writeFileSync(join(process.env.KILN_SCREENSHOTS, `codex-usage-${state}-${width}.png`), await page.screenshot());
      await page.close();
    }
  }
});


it('keeps the waiting conversation owned during delayed Resume completion checks', async () => {
  await setup(); const session = h.engine.latestSession('1')!;
  let release!: () => void; let entered = false; const gate = new Promise<void>(resolve => { release = resolve; });
  // Scheduling injection only: the original real Git completion check still runs after release.
  const checks = h.engine as unknown as { doneCheck(phase: string): Promise<unknown> };
  const original = checks.doneCheck.bind(h.engine);
  const delayed = vi.spyOn(checks, 'doneCheck').mockImplementation(async phase => { entered = true; await gate; return original(phase); });
  try {
    const view = h.engine.controlView(); expect(JSON.parse(view.target)).not.toHaveProperty('sessionId');
    const accepted = h.engine.commands.submit({ command_id: 'waiting-resume-ownership', execution_id: h.engine.record.executionId, status_token: view.token, action: 'resume', inputs: {} }, 'caller', true);
    expect(accepted.ok).toBe(true); await waitFor(() => entered);
    expect(h.engine.current).toBeUndefined();
    const handoff = await handoffProjection(readWork(stateRoot(h.env), h.stateDirectory), session.sessionId, h.env, h.engine);
    expect(handoff.ok).toBe(false); expect(handoff.data).toMatchObject({ session_id: session.sessionId, active_under_kiln: true, resumable: false, resume_command: null, resume_argv: null });
    expect(dispatches()).toHaveLength(1);
  } finally { release(); await h.engine.commands.settled(); await h.engine.settled(); delayed.mockRestore(); }
});
