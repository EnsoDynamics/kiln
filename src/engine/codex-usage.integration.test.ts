import { recoveryRequest } from "../test-support/phase-recovery-request.js";
// Real engine/Git/disk/process boundaries; verified protocol failure injection is not quota proof.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { Engine } from "./engine.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { buildSnapshot } from "./snapshot.js";
import { git } from "../test-support/git-repositories.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { writePrdRecord, writeSessionRecord } from "../state/records.js";

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
  expect(h.engine.latestStayed("1").passed).toBe(true);
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

it("retains manual Resume now and setting-off behavior and rejects usage recovery when workspace evidence becomes incomplete", async () => {
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
  await waitFor(() => buildSnapshot(h.engine).feature.state === "needs_you");
  expect(buildSnapshot(h.engine).feature.state).toBe("needs_you");
  expect(h.engine.latestStayed("1").passed).toBe(false); expect(dispatches()).toHaveLength(2);
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

it("shows Codex wait and unknown recovery, account allowances and native cleanup guidance in the real browser", async () => {
  const usage = { accountId: "proof-account", ordinaryUsageAllowed: false, rateLimits: {}, rateLimitsByLimitId: { codex: { limitName: "Ordinary allowance", primary: { usedPercent: 85, resetsAt: 1793000000 }, secondary: { usedPercent: 12 } } } };
  await setup({ usage });
  server = await startLocalServer({ engine: h.engine, port: 41448, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token }); chrome = await launchChrome();
  for (const state of ["waiting", "unknown"]) {
    if (state === "unknown") await refresh({ ordinaryUsageAllowed: null });
    for (const width of [360, 1280]) {
      const page = await chrome.open(server.address, { width, timeZone: "America/New_York" });
      await page.waitFor(`document.body.textContent.includes('No applicable reset')`);
      const text = await page.evaluate<string>("document.body.textContent");
      for (const expected of ["Codex", "codex login", "Independently detached", "Resume"]) expect(text).toContain(expected);
      if (state === "waiting") for (const expected of ["ordinary included usage is blocked", "Ordinary allowance [codex] · primary", "85% used", "reset unknown", "not usage solely from this PRD"]) expect(text).toContain(expected);
      else { expect(text).toContain("ordinary-usage permission is unavailable"); expect(text).toContain("Usage last updated"); expect(text).not.toContain("Wait for the reset"); }
      expect(text).not.toContain("claude auth login");
      expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true); expect(page.problems).toEqual([]);
      if (process.env.KILN_SCREENSHOTS) writeFileSync(join(process.env.KILN_SCREENSHOTS, `codex-usage-${state}-${width}.png`), await page.screenshot());
      await page.close();
    }
  }
});
