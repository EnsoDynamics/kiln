// Real Git/worktrees and durable engine commands; provider fixtures supplement actual-provider proof.
import { afterEach, expect, it, vi } from "vitest";
import * as durable from "../control/durable-file.js";
import { once } from "node:events";
import { Engine } from "./engine.js";
import { createCometContinuation } from "../test-support/comet-continuation-fixture.js";
import type { Harness } from "../test-support/engine-harness.js";
import { landingSession, pullRequestSession, waitFor } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { readPrdRecord } from "../state/records.js";
let h: Harness;
afterEach(async () => { vi.restoreAllMocks(); await h?.engine.stop("sigint"); await h?.cleanup(); });
async function fixture(integrate = true) {
  const f = await createCometContinuation(); h = f.h; if (integrate) f.integrate();
  h.engine.close();
  const make = () => new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
  h.engine = make();
  await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  return { ...f, make };
}
function request(proposalId: string, commandId: string) { return { proposalId, commandId, executionId: h.engine.record.executionId!, statusToken: h.engine.controlView().token }; }
it("accepts once from current bases, archives earlier completion and starts a fresh phase conversation", async () => {
  await fixture();
  const old = structuredClone(h.engine.record);
  let settingsChange: ReturnType<Engine["changeSettings"]> | undefined;
  const off = h.engine.onChange(() => { if (h.engine.settingUp && !settingsChange) settingsChange = h.engine.changeSettings({ keepAwake: !old.settings.keepAwake }); });
  const check = await h.engine.checkCompletedPlan();
  expect(check.status).toBe("available");
  const body = request(check.result!.proposal!.id, "continue-once");
  const answer = await h.engine.continuationCommand("accept", body);
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await h.engine.settled();
  off(); expect(await settingsChange).toMatchObject({ ok: false, reason: expect.stringContaining("preparing") });
  expect(h.engine.record.settings.keepAwake).toBe(old.settings.keepAwake);
  expect(h.engine.record.executionId).not.toBe(old.executionId);
  expect(h.engine.record.completedAt).toBeUndefined();
  expect(h.engine.record.continuation?.executions).toHaveLength(1);
  expect(h.engine.historicalExecution(old.executionId!)?.record.completedAt).toBe(old.completedAt);
  expect(h.engine.historicalExecution(old.executionId!)?.record.pullRequests).toEqual(old.pullRequests);
  expect(h.engine.historicalExecution(old.executionId!)?.record.developmentAuthorization).toEqual(old.developmentAuthorization);
  expect(h.engine.record.phases.pr).toBeUndefined();
  expect(h.engine.record.completionAudits).toMatchObject({ policy: "required", activities: [] });
  expect(h.engine.record.developmentAuthorization).toMatchObject({ enabled: false, grants: [] });
  expect(git(h.sandbox, h.engine.record.settings.worktreePath, "rev-parse", "HEAD").trim()).toBe(check.result!.proposal!.repositories[0]!.baseRevision);
  expect(h.claudeCalls()).toHaveLength(1);
  expect(h.engine.record.phases["9"]?.sessionIds).toHaveLength(1);
  expect((await h.engine.continuationCommand("accept", body)).ok).toBe(true);
  expect((await h.engine.continuationCommand("accept", { ...body, commandId: "same-proposal-second-id" })).ok).toBe(true);
  expect(h.engine.record.continuation?.executions).toHaveLength(1); expect(h.claudeCalls()).toHaveLength(1);
});

it("holds an accepted workspace when its base moves during setup and requires a new explicit choice", async () => {
  const f = await fixture();
  const { writeFileSync, existsSync } = await import("node:fs"); const { join } = await import("node:path");
  const check = await h.engine.checkCompletedPlan(); let moved = false; let retainedPath = "";
  const original = (h.engine as unknown as { save(): void }).save.bind(h.engine);
  const probe = vi.spyOn(h.engine as unknown as { save(): void }, "save").mockImplementation(() => {
    original();
    const acceptance = h.engine.continuationAcceptance();
    if (!moved && acceptance?.state === "preparing" && acceptance.repositories.some(repo => repo.ready)) {
      moved = true; retainedPath = acceptance.repositories[0]!.worktreePath;
      writeFileSync(join(h.repository, "new-integrated-base.txt"), "Later integrated work.\n");
      git(h.sandbox, h.repository, "add", "new-integrated-base.txt"); git(h.sandbox, h.repository, "commit", "-qm", "test: advance base during accepted setup"); f.publish();
    }
  });
  try { expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "base-moves-during-setup"))).ok).toBe(true); await h.engine.settled(); }
  finally { probe.mockRestore(); }
  const accepted = h.engine.continuationAcceptance()!; expect(accepted.state).toBe("blocked"); expect(moved).toBe(true); expect(h.claudeCalls()).toHaveLength(0);
  const pinned = git(h.sandbox, retainedPath, "rev-parse", "HEAD").trim();
  expect((await h.engine.continuationCommand("retry", { acceptanceId: accepted.id, commandId: "retry-moved-base", executionId: accepted.completedExecutionId, statusToken: h.engine.controlView().token })).ok).toBe(true);
  await h.engine.settled(); expect(h.engine.continuationAcceptance()).toMatchObject({ state: "blocked", id: accepted.id, newExecutionId: accepted.newExecutionId });
  expect(git(h.sandbox, retainedPath, "rev-parse", "HEAD").trim()).toBe(pinned); expect(h.claudeCalls()).toHaveLength(0);
  const fresh = await h.engine.checkCompletedPlan(); expect(fresh.result!.proposal!.id).not.toBe(check.result!.proposal!.id);
  expect((await h.engine.continuationCommand("accept", request(fresh.result!.proposal!.id, "fresh-choice-after-base-movement"))).ok).toBe(true);
  await h.engine.settled(); expect(h.engine.record.executionId).not.toBe(accepted.newExecutionId); expect(h.claudeCalls()).toHaveLength(1);
  expect(h.engine.record.continuation!.acceptances.find(row => row.id === accepted.id)!.state).toBe("superseded"); expect(existsSync(retainedPath)).toBe(true);
  expect(git(h.sandbox, retainedPath, "rev-parse", "HEAD").trim()).toBe(pinned);
});

it("refreshes a moved delivery base without setup or provider dispatch", async () => {
  const f = await fixture(); const old = h.engine.record.executionId;
  const check = await h.engine.checkCompletedPlan(); const body = request(check.result!.proposal!.id, "stale-offer");
  const { writeFileSync } = await import("node:fs"); const { join } = await import("node:path");
  writeFileSync(join(h.repository, "base-moved.txt"), "another integrated change\n");
  git(h.sandbox, h.repository, "add", "base-moved.txt"); git(h.sandbox, h.repository, "commit", "-qm", "test: advance current base"); f.publish();
  const answer = await h.engine.continuationCommand("accept", body);
  expect(answer).toMatchObject({ ok: false, status: 409, code: "proposal_changed" });
  expect(h.engine.record.completedPlanCheck?.result?.proposal?.id).not.toBe(body.proposalId);
  expect(h.engine.record.continuation).toBeUndefined(); expect(h.engine.record.executionId).toBe(old); expect(h.claudeCalls()).toHaveLength(0);
});

it("replays accepted work after restart, keeps current inspection scoped and refuses public internal actions", async () => {
  const f = await fixture(); const oldId = h.engine.record.executionId!;
  const check = await h.engine.checkCompletedPlan(); const body = request(check.result!.proposal!.id, "restart-continuation");
  const accepted = await h.engine.continuationCommand("accept", body); expect(accepted.ok).toBe(true); await h.engine.settled();
  const execution = h.engine.record.executionId; const count = h.claudeCalls().length;
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  expect((await h.engine.continuationCommand("accept", body)).ok).toBe(true);
  expect((await h.engine.continuationCommand("accept", { ...body, commandId: "new-id-after-restart" })).ok).toBe(true);
  expect(h.engine.record.executionId).toBe(execution); expect(h.claudeCalls()).toHaveLength(count);
  const { validateInstruction } = await import("../control/commands.js");
  expect(() => validateInstruction({ command_id: "bot-must-not-accept", execution_id: execution, status_token: h.engine.controlView().token, action: "continuation-accept", inputs: { proposal_id: body.proposalId } })).toThrow("Invalid command");
  expect(h.engine.historicalExecution(oldId)?.record.phases.pr?.doneAt).toBeDefined();
  const { readHistory } = await import("../control/history.js"); const { readWork } = await import("../control/private-state.js"); const { dirname } = await import("node:path");
  const history = readHistory(readWork(dirname(dirname(h.stateDirectory)), h.stateDirectory));
  try { expect(history.complete).toBe(true); expect(history.sessions.every(row => row.record.executionId === execution)).toBe(true); }
  finally { history.dispose(); }
  await expect(h.engine.continuationCommand("accept", { ...body, proposalId: "f".repeat(64) })).rejects.toThrow("Command ID already belongs");
});

it("holds planned preparation without starting dependent work", async () => {
  const f = await fixture(false);
  const { writeFileSync, chmodSync } = await import("node:fs"); const { join } = await import("node:path");
  const { COMET_DIRECTORY, cometPhase } = await import("../test-support/comet-continuation-fixture.js");
  git(h.sandbox, h.repository, "checkout", "-q", "wt/catalog-accessibility");
  writeFileSync(join(h.repository, "validate"), "#!/bin/sh\nexit 0\n"); chmodSync(join(h.repository, "validate"), 0o755);
  git(h.sandbox, h.repository, "add", "validate"); git(h.sandbox, h.repository, "commit", "-qm", "test: validation script");
  const sha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
  git(h.sandbox, h.repository, "checkout", "-q", "develop");
  f.write("phase-9-catalog.md", cometPhase(9) + `\n## Phase dependencies\n8.\n\n## Phase-specific notes\nFirst step: merge Phase 8. Merge the local branch \`wt/catalog-accessibility\` at \`${sha}\` into this phase's branch before building.\n\nVerify before building: run \`./validate\`.\n`);
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: planned preparation"); f.publish();
  const check = await h.engine.checkCompletedPlan(); expect(check.status).toBe("available");
  expect(check.result!.proposal!.prerequisites.find(row => row.phaseId === "8")?.status).toBe("preparation_available");
  expect(await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "prep-not-yet-verified"))).toMatchObject({ ok: false, status: 422, code: "preparation_unverified" });
  expect(h.engine.record.continuation).toBeUndefined(); expect(h.claudeCalls()).toHaveLength(0);
});

it("prepares every repository from its current base and retains a collision for an exact retry", async () => {
  const f = await fixture();
  const { createGithubOrigin, createRepository } = await import("../test-support/git-repositories.js");
  const { writeFileSync, mkdirSync, renameSync, readFileSync } = await import("node:fs"); const { join } = await import("node:path");
  const { COMET_DIRECTORY } = await import("../test-support/comet-continuation-fixture.js");
  const origin = createGithubOrigin(h.sandbox, "fictional", "lending-api"); const repository = createRepository(h.sandbox, "lending-api", origin.url);
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
  git(h.sandbox, repository, "push", "-q", "origin", "develop");
  const path = join(h.repository, COMET_DIRECTORY, "phase-9-catalog.md"); writeFileSync(path, readFileSync(path, "utf8").replace("\n\n## Acceptance", "\n\n**Repositories:** lending-api\n\n## Acceptance"));
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: add lending repository"); f.publish();
  writeFileSync(join(h.repository, "unrelated-user-work.txt"), "Keep this unrelated user work.\n");
  const check = await h.engine.checkCompletedPlan(); expect(check.status, JSON.stringify(check)).toBe("available");
  expect(check.result!.proposal!.repositories).toHaveLength(2);
  // Inject a real occupied path after durable acceptance, before setup. No Git result is faked.
  const { vi } = await import("vitest");
  const save = (h.engine as unknown as { save(): void }).save.bind(h.engine);
  let occupied: string | undefined;
  const checkpoint = vi.spyOn(h.engine as unknown as { save(): void }, "save").mockImplementation(() => {
    save();
    const row = h.engine.record.continuation?.acceptances.at(-1);
    if (row && !occupied && h.engine.continuationAcceptance(row.id)!.repositories.some(repo => repo.name === "comet-library" && repo.ready)) {
      const { repositories } = h.engine.continuationAcceptance(row.id)!;
      occupied = repositories.find(repo => repo.name === "lending-api")!.worktreePath;
      mkdirSync(occupied, { recursive: true }); writeFileSync(join(occupied, "user.txt"), "Do not replace me.\n");
    }
  });
  try { expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "multi-collision"))).ok).toBe(true); await h.engine.settled(); }
  finally { checkpoint.mockRestore(); }
  const acceptance = h.engine.continuationAcceptance()!;
  expect(acceptance.state, JSON.stringify({ acceptance, fault: h.engine.commands.fault, events: h.events })).toBe("blocked"); expect(h.claudeCalls()).toHaveLength(0);
  expect(readFileSync(join(occupied!, "user.txt"), "utf8")).toBe("Do not replace me.\n");
  renameSync(occupied!, `${occupied!}-preserved-user-work`);
  const answer = await h.engine.continuationCommand("retry", { acceptanceId: acceptance.id, commandId: "retry-owned-setup", executionId: acceptance.completedExecutionId, statusToken: h.engine.controlView().token });
  expect(answer.ok, JSON.stringify(answer)).toBe(true); await h.engine.settled();
  expect(h.engine.record.executionId).toBe(acceptance.newExecutionId); expect(h.engine.record.repositories).toHaveLength(2); expect(h.claudeCalls()).toHaveLength(1);
  for (const repo of h.engine.record.repositories) expect(git(h.sandbox, repo.worktreePath, "rev-parse", "HEAD").trim()).toBe(check.result!.proposal!.repositories.find(row => row.name === repo.name)!.baseRevision);
  expect(readFileSync(join(h.repository, "unrelated-user-work.txt"), "utf8")).toBe("Keep this unrelated user work.\n");
});

it("requires fresh billing authority and carries no earlier paid approval into the new execution", async () => {
  await fixture();
  h.env.ANTHROPIC_API_KEY = "synthetic-continuation-billing-canary";
  await h.engine.refreshBilling(); await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending);
  const { BILLING_CONTRACT } = await import("../billing/contract.js");
  const { writePrdRecord } = await import("../state/records.js");
  const oldId = h.engine.record.executionId!;
  h.engine.record.billing!.approval = { executionId: oldId, contextFingerprint: h.engine.record.billing!.current!.fingerprint, approvedAt: "2026-10-01T10:00:00Z", contractVersion: BILLING_CONTRACT };
  h.engine.record.billing!.current!.summary.approved = true;
  writePrdRecord(h.stateDirectory, h.engine.record);
  const check = await h.engine.checkCompletedPlan();
  expect(h.engine.record.billing!.approval).toBeDefined();
  expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "fresh-billing"))).ok).toBe(true);
  await h.engine.settled();
  expect(h.engine.record.billing?.approval).toBeUndefined(); expect(h.engine.record.billing?.hold).toBeDefined(); expect(h.claudeCalls()).toHaveLength(0);
  expect(h.engine.historicalExecution(oldId)!.record.billing!.approval!.executionId).toBe(oldId);
  expect(h.engine.latestSession("9")?.runs).toHaveLength(0);
});

it("keeps a requested pause across fresh-execution restart and resumes only the next unfinished phase", async () => {
  const f = await fixture(); const oldId = h.engine.record.executionId;
  const { existsSync, writeFileSync } = await import("node:fs"); const { join } = await import("node:path");
  const marker = join(h.sandbox.root, "continued-phase-working"); const release = join(h.sandbox.root, "continued-phase-release");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: marker }, { waitForFile: release }, ...landingSession("capability-9.txt").actions] }] }));
  const check = await h.engine.checkCompletedPlan();
  expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "pause-continued-work"))).ok).toBe(true);
  await waitFor(() => existsSync(marker)); expect(h.engine.pause()).toEqual({ ok: true }); writeFileSync(release, "finish phase nine\n");
  await h.engine.settled(); expect(h.engine.record.phases["9"]?.doneAt).toBeDefined(); expect(h.engine.record.phases["10"]).toBeUndefined();
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  expect(await h.engine.decide()).toMatchObject({ kind: "paused", beforePhaseKey: "10" });
  expect(h.engine.record.executionId).not.toBe(oldId); expect(h.claudeCalls()).toHaveLength(1);
  await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.claudeCalls()).toHaveLength(2); expect(h.engine.record.phases["10"]?.sessionIds).toHaveLength(1);
  expect(h.engine.record.phases["9"]?.sessionIds).toHaveLength(1);
});

it("offers Not now and a fresh choice in the real browser, then retains readable legacy delivery history", async () => {
  const f = await fixture();
  const { writeFileSync } = await import("node:fs"); const { join } = await import("node:path");
  const { writeSessionRecord, writePrdRecord, SCHEMA_VERSION } = await import("../state/records.js");
  const { sessionFiles } = await import("../session/claude-session.js");
  const legacy = { schemaVersion: SCHEMA_VERSION, sessionId: "historical-final-session", phaseId: "pr", kind: "pull_request" as const, agentId: "claude_code" as const, createdAt: "2026-10-01T11:00:00Z", model: "opus", modelDisplayName: "Opus", workingDirectory: h.repository, runs: [{ startedAt: "2026-10-01T11:00:00Z", endedAt: "2026-10-01T12:00:00Z", cause: "launch" as const }], sleeps: [], steps: [] };
  writeSessionRecord(h.stateDirectory, legacy); h.engine.record.phases.pr!.sessionIds.push(legacy.sessionId); writePrdRecord(h.stateDirectory, h.engine.record);
  writeFileSync(sessionFiles(h.stateDirectory, legacy).output, Array.from({ length: 205 }, (_, index) => JSON.stringify({ line: index + 1, at: legacy.createdAt, source: "claude", text: index === 0 ? "Beginning of earlier conversation." : "Earlier Comet final delivery output." })).join("\n") + "\n");
  const oldId = h.engine.record.executionId!;
  const { startFixtureController } = await import("../test-support/controller-server.js"); const { launchChrome } = await import("../test-support/headless-chrome.js");
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  const chrome = await launchChrome();
  const origin = new URL(hosted.server.address).origin;
  const get = async (path: string) => fetch(origin + path, { headers: { "X-Kiln-Token": h.engine.record.token } });
  try {
    for (const width of [1200, 390]) {
      const page = await chrome.open(hosted.server.address, { width, height: 1100 });
      try {
        const button = (label: string) => `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(label)})`;
        await page.waitFor(`${button("Continue with 7 phases")} && !${button("Continue with 7 phases")}.disabled`);
        await page.evaluate(`${button("Not now")}.click()`);
        await page.waitFor("document.body.innerText.includes('Additional work is available when you are ready.')");
        expect(h.claudeCalls()).toHaveLength(0);
        await page.evaluate(`${button("Show continuation offer")}.click()`);
        await page.waitFor(`${button("Continue with 7 phases")} && !${button("Continue with 7 phases")}.disabled`);
        expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
        writeFileSync(`/tmp/kiln-continuation-offer-${width}.png`, await page.screenshot());
        if (width === 390) {
          writeFileSync(join(h.repository, "new-base.txt"), "Fresh delivery prerequisite.\n"); git(h.sandbox, h.repository, "add", "new-base.txt"); git(h.sandbox, h.repository, "commit", "-qm", "test: stale browser offer"); f.publish();
          await page.evaluate(`${button("Continue with 7 phases")}.click()`);
          await page.waitFor("document.body.innerText.includes('Review the refreshed offer')"); expect(h.claudeCalls()).toHaveLength(0);
          await page.waitFor(`${button("Continue with 7 phases")} && !${button("Continue with 7 phases")}.disabled`);
          await page.evaluate(`${button("Continue with 7 phases")}.click()`);
          await page.waitFor("document.body.innerText.includes('Earlier deliveries') && document.body.innerText.includes('View earlier phases and sessions')");
          await h.engine.settled(); expect(h.claudeCalls()).toHaveLength(1);
          await page.evaluate(`${button("View earlier phases and sessions")}.click()`);
          await page.waitFor("document.body.innerText.includes('Read earlier session')");
          await page.evaluate(`${button("Read earlier session")}.click()`);
          await page.waitFor("document.body.innerText.includes('Earlier Comet final delivery output.')");
          await page.evaluate(`${button("Load earlier session output")}.click()`);
          await page.waitFor("document.body.innerText.includes('Beginning of earlier conversation.') && document.body.innerText.includes('Showing 205 of 205 saved lines.')");
          expect(await page.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
          writeFileSync("/tmp/kiln-continuation-history-390.png", await page.screenshot());
          expect(page.problems).toEqual([`Failed to load resource: the server responded with a status of 409 (Conflict) ${origin}/api/continuation/accept`]);
        }
      } finally { await page.close(); }
    }
    const history = await (await get("/api/executions")).json() as { executions: { executionId: string; completedAt: string }[] };
    expect(history.executions).toMatchObject([{ executionId: oldId, completedAt: "2026-10-01T12:00:00Z" }]);
    expect(JSON.stringify(history)).not.toContain(h.engine.record.token);
    expect((await get(`/api/sessions/${legacy.sessionId}/output`)).status).toBe(404);
    const old = await (await get(`/api/executions/${oldId}`)).json() as { execution: { phases: { doneAt: string }[]; sessions: { phaseKey: string; sessionId: string }[] } };
    expect(old.execution.phases[0]!.doneAt).toBe("2026-10-01T11:00:00Z");
    expect(old.execution.sessions).toContainEqual({ phaseKey: "pr", sessionId: legacy.sessionId });
    expect((await get("/api/executions/unknown-execution")).status).toBe(404);
  } finally { await chrome.close(); await hosted.server.close(); hosted.release(); }
}, 120_000);

it.each(["merge", "squash"])("finishes revised-scope audits and audit-added work, then preserves two distinct deliveries after a prior %s", async integration => {
  const f = await fixture(integration === "merge");
  const { writeFileSync, readFileSync } = await import("node:fs"); const { join } = await import("node:path");
  const { COMET_DIRECTORY, cometPhase } = await import("../test-support/comet-continuation-fixture.js");
  if (integration === "squash") {
    git(h.sandbox, h.repository, "merge", "--squash", "wt/catalog-accessibility"); git(h.sandbox, h.repository, "commit", "-qm", "test: squash previously completed work");
    const resultSha = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
    const prd = join(h.repository, COMET_DIRECTORY, "library-catalog-prd.md"); writeFileSync(prd, readFileSync(prd, "utf8").replace(f.externalRevision, resultSha));
    git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: record integrated external evidence"); f.publish();
    const { readBaseline, retainBaseline } = await import("./plan-reconciliation.js");
    const { id: _id, ...baseline } = readBaseline(h.stateDirectory, h.engine.record.planReconciliation!.baselineId!); void _id;
    baseline.completions["1"]!.revision = f.externalRevision;
    baseline.completions["1"]!.repositories = { "comet-library": { identity: "fictional/comet-library", revision: f.externalRevision } };
    h.engine.record.planReconciliation!.baselineId = retainBaseline(h.stateDirectory, baseline).id;
    const { emptyDevelopmentLedger } = await import("../state/development-delivery.js");
    h.engine.record.developmentDelivery = emptyDevelopmentLedger();
    h.engine.record.developmentDelivery.checkpoints.push({ id: "prior-squash", executionId: h.engine.record.executionId!, phaseId: "1", target: { repository: "github.com/fictional/comet-library", baseBranch: "develop", environment: "test" }, featureBranch: "wt/catalog-accessibility", headSha: f.externalRevision, baseSha: resultSha, criteria: ["AC-COMET-01"], dependsOn: [], workflowSource: { path: ".github/workflows/dev.yml", revision: f.externalRevision }, requirements: [], requiredChecks: [], requireReview: false, createdAt: "2026-10-01T11:00:00Z", operations: [], evidence: [], merge: { number: 22, url: "https://github.com/fictional/comet-library/pull/22", sourceHead: f.externalRevision, mergedHead: f.externalRevision, resultSha, method: "squash", mergedAt: "2026-10-01T11:00:00Z" } });
    h.engine.record.deliveryHistory = { checkedAt: "2026-10-01T12:00:00Z", repositories: [{ repository: "comet-library", workCommitCount: 1, unattributedCommitCount: 0, problems: [], events: [{ kind: "merge", repository: "comet-library", commit: resultSha, title: "Verified earlier introduction", target: "develop", url: "https://github.com/fictional/comet-library/commit/" + resultSha, workCommits: [f.externalRevision], broader: false }] }] };
    const { writePrdRecord } = await import("../state/records.js"); writePrdRecord(h.stateDirectory, h.engine.record);
  }
  const original = structuredClone(h.engine.record);
  const { startFixtureController } = await import("../test-support/controller-server.js");
  const audit = (behavior = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
  writeFileSync(join(h.repository, COMET_DIRECTORY, "value.mjs"), "export const value = () => 42;\n");
  writeFileSync(join(h.repository, COMET_DIRECTORY, "value.test.mjs"), "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n");
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY, ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test: seed audit evidence"); f.publish();
  const delivery = (number: number) => ({ actions: [{ openPullRequest: { number, repository: "comet-library" } }, ...pullRequestSession(number).actions.slice(1)] });
  const sessions = [...Array.from({ length: 7 }, (_, index) => landingSession(`capability-${index + 9}.txt`, `Capability ${index + 9}.\n`)), landingSession("audit-repair.txt", "Audit completion work.\n"), delivery(41)];
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions: [audit({ gap: true }), audit(), audit()] }));
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  try {
    const check = await h.engine.checkCompletedPlan();
    expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "first-full-delivery"))).ok).toBe(true);
    await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeDefined();
    expect(h.engine.record.phases["16"]?.doneAt).toBeDefined();
    expect(h.engine.record.continuation!.acceptances).toHaveLength(1);
    if (integration === "squash") expect(h.engine.record.continuation!.executions[0]!.deliveries.map(row => row.url)).toContain("https://github.com/fictional/comet-library/pull/22");
    expect(h.engine.record.completionAudits!.activities.map(row => row.kind)).toEqual(["delivery_audit", "delivery_audit", "test_audit"]);
    expect(h.engine.record.completionAudits!.activities.every(row => row.acceptedResult)).toBe(true);
    expect(h.engine.record.pullRequests?.map(row => row.number)).toEqual([41]);
    // An actual completed current scope can retain a non-empty earlier target grant.
    // All its closed work is already in the accepted baseline on the next cycle.
    h.engine.record.developmentAuthorization = { revision: 3, enabled: true, grants: [{ target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" }, confirmedAt: "2026-10-01T10:00:00Z", source: "start" }] };
    h.engine.record.developmentDelivery!.currentComplete = true;
    const { writePrdRecord } = await import("../state/records.js"); writePrdRecord(h.stateDirectory, h.engine.record);
    const first = structuredClone(h.engine.record);
    const firstCalls = h.claudeCalls().length;
    git(h.sandbox, h.repository, "merge", "--no-edit", first.settings.featureBranch);
    f.write("phase-17-catalog.md", cometPhase(17) + "\n## Phase dependencies\n16.\n");
    git(h.sandbox, h.repository, "add", COMET_DIRECTORY); git(h.sandbox, h.repository, "commit", "-qm", "test: append a second continuation"); f.publish();
    // The provider fixture tracks consumed slots, so retain its earlier slots and append.
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [...sessions, landingSession("capability-17.txt", "Capability 17.\n"), delivery(42)], auditSessions: [audit({ gap: true }), audit(), audit(), audit(), audit()] }));
    const next = await h.engine.checkCompletedPlan(); expect(next.status, JSON.stringify(next)).toBe("available");
    expect(next.result!.proposal!.added.map(row => row.id)).toEqual(["17"]);
    expect((await h.engine.continuationCommand("accept", request(next.result!.proposal!.id, "second-full-delivery"))).ok).toBe(true);
    await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeDefined();
    expect(new Set([original.executionId, first.executionId, h.engine.record.executionId]).size).toBe(3);
    expect(h.engine.record.pullRequests?.map(row => row.number)).toEqual([42]);
    expect(h.engine.record.continuation!.executions.map(row => row.executionId)).toEqual([original.executionId, first.executionId]);
    expect(h.engine.historicalExecution(first.executionId!)!.record.completedAt).toBe(first.completedAt);
    expect(h.engine.historicalExecution(first.executionId!)!.record.phases).toEqual(first.phases);
    expect(h.engine.historicalExecution(first.executionId!)!.record.developmentAuthorization).toEqual(first.developmentAuthorization);
    expect(h.engine.record.developmentAuthorization).toMatchObject({ enabled: false, grants: [] });
    expect(h.engine.historicalExecution(original.executionId!)!.record.pullRequests).toEqual(original.pullRequests);
    expect(h.engine.record.completionAudits!.activities.map(row => row.kind)).toEqual(["delivery_audit", "test_audit"]);
    expect(h.claudeCalls().slice(firstCalls).filter(row => row.prompt.includes("implement-from-requirements"))).toHaveLength(1);
    expect(readFileSync(join(h.engine.worktreePath, "audit-repair.txt"), "utf8")).toBe("Audit completion work.\n");
  } finally { await hosted.server.close(); hosted.release(); }
}, 180_000);

it.skipIf(process.platform === "win32").each(["intent", "acceptance", "workspace", "activation", "provider"])("recovers actual controller death at the %s boundary without duplicate continuation or provider dispatch", async boundary => {
  const f = await fixture(); const oldId = h.engine.record.executionId!;
  const { spawn } = await import("node:child_process");
  const { existsSync, readFileSync, writeFileSync } = await import("node:fs"); const { join, dirname } = await import("node:path"); const { fileURLToPath } = await import("node:url");
  const { readWork, retainedAliases } = await import("../control/private-state.js");
  const marker = join(h.sandbox.root, "controller-boundary"); const bodyPath = join(h.sandbox.root, "accepted-body.json"); const release = join(h.sandbox.root, "release-provider");
  if (boundary === "provider") writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: marker }, { waitForFile: release }, { result: "Controller death proof finished." }, { exit: 0 }] }] }));
  const optionsPath = join(h.sandbox.root, "controller-options.json");
  writeFileSync(optionsPath, JSON.stringify({ boundary, marker, bodyPath, options: { paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, stateDirectory: h.stateDirectory, record: h.engine.record, originRetryMs: 0 } }));
  h.engine.close(); h.env.KILN_STANDIN_OWNER_PID = String(process.pid);
  const controller = spawn(process.execPath, [fileURLToPath(new URL("../../test/stand-ins/continuation-controller.mjs", import.meta.url)), optionsPath], { env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  const exited = once(controller, "exit"); let diagnostic = ""; controller.stderr!.on("data", bytes => { diagnostic += String(bytes); });
  try {
    await waitFor(() => { if (controller.exitCode !== null || controller.signalCode !== null) throw Error(diagnostic); return existsSync(marker); }, 30_000);
    const saved = readPrdRecord(h.stateDirectory)!; const allocated = saved.continuation?.acceptances.at(-1)?.newExecutionId;
    const body = JSON.parse(readFileSync(bodyPath, "utf8")) as ReturnType<typeof request>;
    controller.kill("SIGKILL"); await exited;
    if (boundary === "provider") {
      writeFileSync(release, "finish provider\n");
      const session = h.engine.sessionRecord("9", saved.phases["9"]!.sessionIds[0]!)!;
      const { processStartTime } = await import("../platform/process-start-time.js");
      await waitFor(async () => await processStartTime(session.runs[0]!.pid!) !== session.runs[0]!.processStartTime);
    }
    h.engine = f.make(); await h.engine.prepare();
    await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    const work = readWork(dirname(dirname(h.stateDirectory)), h.stateDirectory);
    expect(retainedAliases(work)).toContain(join(h.repository, h.engine.record.prdDirectory));
    expect(h.claudeCalls()).toHaveLength(boundary === "provider" ? 1 : 0);
    const replay = await h.engine.continuationCommand("accept", body);
    if (boundary === "intent") {
      expect(replay.ok).toBe(false); expect(h.engine.record.executionId).toBe(oldId); expect(h.engine.record.continuation).toBeUndefined();
      const check = await h.engine.checkCompletedPlan();
      expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "new-choice-after-unapplied-intent"))).ok).toBe(true);
      await h.engine.settled(); expect(h.claudeCalls()).toHaveLength(1);
    } else {
      expect(replay.ok, JSON.stringify(replay)).toBe(true); expect(h.engine.record.executionId).toBe(allocated);
      expect(h.engine.record.continuation!.acceptances).toHaveLength(1);
      expect(h.engine.record.continuation!.executions).toHaveLength(1);
      await h.engine.decide({ review: true });
      expect(h.claudeCalls()).toHaveLength(boundary === "provider" ? 1 : 0);
      if (boundary !== "provider") {
        expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
        expect(h.claudeCalls()).toHaveLength(1);
      }
    }
  } finally { if (controller.exitCode === null && controller.signalCode === null) controller.kill("SIGKILL"); await exited; }
}, 90_000);

it.each(["sidecar", "acceptance", "workspace-progress", "integration-baseline", "active-sidecar", "activation"])("fails closed on an uncertain %s write and reconciles its durable outcome on restart", async boundary => {
  const f = await fixture(); const oldId = h.engine.record.executionId;
  const check = await h.engine.checkCompletedPlan(); const body = request(check.result!.proposal!.id, `uncertain-${boundary}`);
  const original = durable.writeDurableMetadata; let injected = false;
  const probe = vi.spyOn(durable, "writeDurableMetadata").mockImplementation((path, value) => {
    original(path, value);
    const record = value as import("../state/records.js").PrdRecord;
    if (!injected && (boundary === "sidecar" && path.includes("continuation-acceptances") || boundary === "active-sidecar" && path.includes("continuation-acceptances") && (value as { state?: string }).state === "active" || boundary === "integration-baseline" && path.includes("/plans/") && JSON.stringify(value).includes('"integration"') || path.endsWith("prd.json") && (boundary === "acceptance" && record.executionId === oldId && record.continuation || boundary === "workspace-progress" && record.executionId === oldId && h.engine.continuationAcceptance()?.repositories.some(repo => repo.ready) || boundary === "activation" && record.executionId !== oldId))) {
      injected = true; throw Object.assign(new Error("Injected lost durability acknowledgement."), { code: "EIO" });
    }
  });
  await h.engine.continuationCommand("accept", body).catch(() => undefined);
  await h.engine.settled().catch(() => undefined); probe.mockRestore();
  expect(injected).toBe(true); expect(h.engine.commands.fault).toBeDefined(); expect(h.claudeCalls()).toHaveLength(0);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  const answer = await h.engine.continuationCommand("accept", body);
  expect(answer.ok).toBe(boundary !== "sidecar");
  expect(h.claudeCalls()).toHaveLength(0);
  expect(h.engine.record.continuation?.acceptances.length ?? 0).toBe(boundary === "sidecar" ? 0 : 1);
});
