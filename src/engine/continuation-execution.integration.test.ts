// Real Git/worktrees and durable engine commands; provider fixtures supplement actual-provider proof.
import { afterEach, expect, it, vi } from "vitest";
import * as durable from "../control/durable-file.js";
import { once } from "node:events";
import { Engine } from "./engine.js";
import { createCometContinuation } from "../test-support/comet-continuation-fixture.js";
import { effectiveAudit } from "../audit/workflow.js";
import type { Harness } from "../test-support/engine-harness.js";
import { landingSession, pullRequestSession, waitFor } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { recordedPullRequest } from "../test-support/recorded-pull-requests.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
let h: Harness;
afterEach(async () => { vi.restoreAllMocks(); await h?.engine.stop("sigint"); await h?.cleanup(); });
async function fixture(integrate = true) {
  const f = await createCometContinuation(); h = f.h; if (integrate) f.integrate();
  h.engine.close();
  const make = () => new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
  h.engine = make();
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
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

it("withholds Exit Kiln while Continue sets up its build, saying why, and refuses a press made anyway (Kiln After Delivery AC-EXIT-01)", async () => {
  await fixture();
  const reason = "Kiln is setting up the build Continue started. Exit Kiln returns once it has started.";
  expect(h.engine.exitControl()).toEqual({ available: true });
  let seen: { control: ReturnType<Engine["exitControl"]>; listed: unknown; press: { ok: boolean; errors?: { message: string }[] } } | undefined;
  const off = h.engine.onChange(() => {
    if (!h.engine.settingUp || seen) return;
    const control = h.engine.exitControl(); const listed = h.engine.controlView().controls.find(one => one.name === "exit");
    seen = { control, listed, press: { ok: true } };
    seen.press = h.engine.commands.submit({ command_id: "exit-during-setup", execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: "exit", inputs: { via: "command_line" } }) as { ok: boolean; errors?: { message: string }[] };
  });
  const check = await h.engine.checkCompletedPlan();
  const answer = await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "continue-exit"));
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await h.engine.settled(); off();
  expect(seen).toBeDefined();
  expect(seen!.control).toEqual({ available: false, reason });
  expect(seen!.listed).toMatchObject({ available: false, reason });
  expect(seen!.press.ok).toBe(false);
  expect(seen!.press.errors?.[0]).toMatchObject({ message: reason });
  // Nothing ended: the build Continue started runs its first phase.
  expect(h.engine.exitControl().reason).not.toBe("Kiln is exiting.");
  expect(h.engine.record.phases["9"]?.sessionIds).toHaveLength(1);
});

it("carries no merge permission into the execution Continue starts: the earlier merge stays with its own delivery (Kiln After Delivery AC-MERGE-02)", async () => {
  await fixture();
  // The finished execution's merge, pressed and done, as its record keeps it.
  const pressed = { operationId: "earlier-merge-press", requestedAt: "2026-10-02T10:00:00Z", via: "browser" as const, pullRequests: (h.engine.record.pullRequests ?? []).map(({ repository, number }) => ({ repository, number })), pressHeads: [], doneAt: "2026-10-02T10:20:00Z", closedAt: "2026-10-02T10:20:00Z" };
  h.engine.record.afterDelivery = { ...(h.engine.record.afterDelivery ?? { pullRequests: [] }), merge: pressed };
  writePrdRecord(h.stateDirectory, h.engine.record);
  const oldId = h.engine.record.executionId!;
  expect(h.engine.mergeControl().reason).toBe("A merge session was already started for this delivery.");
  const check = await h.engine.checkCompletedPlan();
  expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "continue-after-merge"))).ok).toBe(true);
  await h.engine.settled();
  expect(h.engine.record.executionId).not.toBe(oldId);
  // The new execution holds no merge activity and no press; its own finished delivery will be offered afresh.
  expect(h.engine.record.afterDelivery?.merge).toBeUndefined();
  expect(readPrdRecord(h.stateDirectory)!.afterDelivery?.merge).toBeUndefined();
  expect(h.engine.mergeControl().reason).not.toBe("A merge session was already started for this delivery.");
  expect(JSON.stringify(h.engine.record.settings)).not.toContain("merge");
  expect(h.engine.historicalExecution(oldId)!.record.afterDelivery!.merge).toEqual(pressed);
});

it("keeps a phase finished before Continue closed in the build Continue started, while its own phases still get their checks (Kiln After Delivery AC-BACK-01)", async () => {
  await fixture();
  const { landingSession } = await import("../test-support/engine-harness.js");
  const { COMET_DIRECTORY, cometPhase } = await import("../test-support/comet-continuation-fixture.js");
  const { buildSnapshot } = await import("./snapshot.js");
  const { writeFileSync } = await import("node:fs");
  // Phase 9's session also removes finished phase 3's Closed line; phase 10's reopens phase 9, which this build finished.
  const reopen = (id: number, extra = "") => ({ write: { path: `${COMET_DIRECTORY}/phase-${id}-catalog.md`, content: cometPhase(id) + extra } });
  const landing = (file: string, write: object) => { const session = landingSession(file); session.actions.splice(1, 0, write as never); return session; };
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landing("capability-9.txt", reopen(3)), landing("capability-10.txt", reopen(9, "\n## Phase dependencies\n8.\n"))] }));
  const check = await h.engine.checkCompletedPlan();
  expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "continue-carried"))).ok).toBe(true);
  await h.engine.settled();
  expect(h.engine.record.continuationBaselineId).toMatch(/^[a-f0-9]{64}$/);
  // Phase 3 counts as closed whatever its document says: never launched, shown done, no reopened-phase stop.
  expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
  expect(h.engine.record.plan?.find(phase => phase.id === "3")?.closed).toBe(true);
  expect(buildSnapshot(h.engine).phases.find(row => row.id === "3")?.state).toBe("done");
  expect(h.engine.record.phases["3"]).toBeUndefined();
  expect(h.claudeCalls().map(call => call.prompt).filter(prompt => /Phase 3\b/.test(prompt))).toEqual([]);
  // Phase 9 was built by this execution: removing its Closed line stops the plan read as before.
  expect(h.engine.record.phases["10"]?.sessionIds.length).toBe(1);
  expect(h.engine.record.planReconciliation?.check).toMatchObject({ status: "failed", problem: expect.stringContaining("Phase 9: previously completed scope was removed, reopened, split or materially changed.") });
  expect(h.engine.record.planReconciliation?.check?.problem).not.toContain("Phase 3");
}, 120_000);

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
  expect(() => validateInstruction({ command_id: "bot-must-not-grant", execution_id: execution, status_token: h.engine.controlView().token, action: "continuation-grant", inputs: { proposal_id: body.proposalId, authorization_revision: 0, target: { repository: "github.com/fictional/comet-library", baseBranch: "develop" } } })).toThrow("Invalid command");
  expect(h.engine.historicalExecution(oldId)?.record.phases.pr?.doneAt).toBeDefined();
  const { readHistory } = await import("../control/history.js"); const { readWork } = await import("../control/private-state.js"); const { dirname } = await import("node:path");
  const history = readHistory(readWork(dirname(dirname(h.stateDirectory)), h.stateDirectory));
  try { expect(history.complete).toBe(true); expect(history.sessions.every(row => row.record.executionId === execution)).toBe(true); }
  finally { history.dispose(); }
  await expect(h.engine.continuationCommand("accept", { ...body, proposalId: "f".repeat(64) })).rejects.toThrow("Command ID already belongs");
});

it.skipIf(process.platform !== "darwin")("starts preparation while holding dependent implementation until independent verification", async () => {
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
  expect(await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "prep-not-yet-verified"))).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.preparation?.stage).toBe("preparation"); expect(h.claudeCalls()).toHaveLength(1);
  expect(h.engine.latestSession("9")?.runs).toHaveLength(1);
  expect(h.engine.record.phases["9"]?.doneAt).toBeUndefined();
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
  await h.engine.refreshBilling(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending);
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
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
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
      const loaded = h.engine.record.completedPlanCheck?.attemptedAt;
      const page = await chrome.open(hosted.server.address, { width, height: 1100 });
      try {
        const button = (label: string) => `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(label)})`;
        // Every page load runs one check (Kiln After Delivery "The Delivery Reading"); let it finish first.
        await waitFor(() => h.engine.record.completedPlanCheck?.attemptedAt !== loaded && !h.engine.checking);
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
    // Its running time is saved with it, for the PRD total (time totals AC-TOTAL-02).
    expect(h.engine.record.continuation!.executions[0]!.runningMs).toBeGreaterThanOrEqual(0);
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
    // GitHub shows the first continuation's pull request merged, its merge commit in develop.
    h.setPullRequestViews({ "fictional/comet-library#41": recordedPullRequest("merged", { number: 41, base: "develop", mergeCommit: git(h.sandbox, h.repository, "rev-parse", "HEAD~1").trim() }) });
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
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
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
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  const answer = await h.engine.continuationCommand("accept", body);
  expect(answer.ok).toBe(boundary !== "sidecar");
  expect(h.claudeCalls()).toHaveLength(0);
  expect(h.engine.record.continuation?.acceptances.length ?? 0).toBe(boundary === "sidecar" ? 0 : 1);
});

it("starts both loop counts at zero on Continue with N phases, keeping the two limits (Kiln Deliver When Audit Loops Run Out AC-LAST-02, AC-CHOICE-02)", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  h.engine.close();
  // The finished run had used both limits.
  const saved = readPrdRecord(h.stateDirectory)!;
  saved.settings.auditLoops = { deliveryLimit: 1, testLimit: 1 };
  saved.auditLoops = { epochs: [{ kind: "delivery", at: "2026-10-01T10:00:00.000Z", cause: "start", loopsBefore: 0 }, { kind: "test", at: "2026-10-01T10:00:00.000Z", cause: "start", loopsBefore: 0 }], loops: [{ kind: "delivery", number: 1, startedAt: "2026-10-01T11:00:00.000Z", activityKey: "audit-a" }, { kind: "test", number: 1, startedAt: "2026-10-01T12:00:00.000Z", activityKey: "audit-b" }], atPullRequest: { at: "2026-10-01T13:00:00.000Z", deliveryLimit: 1, testLimit: 1 } };
  writePrdRecord(h.stateDirectory, saved);
  h.engine = new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  // A raise once the pull request session has started is saved for a continuation, below the old counts too (floor 1).
  expect(await h.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 2 } })).toEqual({ ok: true });
  const check = await h.engine.checkCompletedPlan();
  const answer = await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "continue-loops"));
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await h.engine.settled();
  expect(h.engine.record.settings.auditLoops).toEqual({ deliveryLimit: 1, testLimit: 2 });
  expect(h.engine.record.auditLoops).toEqual({ epochs: [{ kind: "delivery", at: h.engine.record.startedAt, cause: "start", loopsBefore: 0 }, { kind: "test", at: h.engine.record.startedAt, cause: "start", loopsBefore: 0 }], loops: [] });
  // The earlier run's loops stay in its archived record and are not counted again.
  expect(h.engine.historicalExecution(saved.executionId!)?.record.auditLoops?.loops).toHaveLength(2);
});

it("after Continue with N phases, the phases a delivery audit adds at its last loop are built and the run moves on (Kiln Deliver When Audit Loops Run Out AC-LAST-01, AC-LAST-03; AC-CONTINUE-05 in part)", async () => {
  const f = await createCometContinuation(); h = f.h; f.integrate();
  const { writeFileSync } = await import("node:fs"); const { join } = await import("node:path");
  const { COMET_DIRECTORY } = await import("../test-support/comet-continuation-fixture.js");
  writeFileSync(join(h.repository, COMET_DIRECTORY, "value.mjs"), "export const value = () => 42;\n");
  writeFileSync(join(h.repository, COMET_DIRECTORY, "value.test.mjs"), "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n");
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n");
  git(h.sandbox, h.repository, "add", COMET_DIRECTORY, ".gitignore"); git(h.sandbox, h.repository, "commit", "-qm", "test: seed audit evidence"); f.publish();
  h.engine.close();
  const saved = readPrdRecord(h.stateDirectory)!;
  saved.settings.auditLoops = { deliveryLimit: 1, testLimit: 3 };
  writePrdRecord(h.stateDirectory, saved);
  h.engine = new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  const audit = (behavior = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
  const sessions = [...Array.from({ length: 7 }, (_, index) => landingSession(`capability-${index + 9}.txt`, `Capability ${index + 9}.\n`)), landingSession("audit-repair.txt", "Audit completion work.\n"), pullRequestSession(41)];
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions: [audit({ gap: true }), audit()] }));
  const { startFixtureController } = await import("../test-support/controller-server.js");
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  try {
    const check = await h.engine.checkCompletedPlan();
    expect((await h.engine.continuationCommand("accept", request(check.result!.proposal!.id, "continue-gated"))).ok).toBe(true);
    await h.engine.settled();
    const audits = h.engine.record.completionAudits!.activities;
    // Delivery audit loop 1 of 1 adds a phase; it is built, and no delivery audit runs after it: the test audit, then the pull request.
    expect(audits.map(row => row.kind)).toEqual(["delivery_audit", "test_audit"]);
    const added = effectiveAudit(h.stateDirectory, audits[0]!)!.completionPhases();
    expect(added).toHaveLength(1);
    expect(h.engine.record.phases[added[0]!]!.doneAt).toBeTruthy();
    expect(h.engine.record.auditLoops!.loops.map(loop => [loop.kind, loop.number])).toEqual([["delivery", 1], ["test", 1]]);
    // Nothing stops at a loop limit: the run reaches final delivery (whose pull request this fixture does not open).
    expect(Object.entries(h.engine.record.phases).filter(([, facts]) => facts.stop).map(([key]) => key)).toEqual(["pr"]);
    expect(h.engine.record.auditLoops!.atPullRequest).toMatchObject({ deliveryLimit: 1, testLimit: 3 });
  } finally { await hosted.server.close(); hosted.release(); }
}, 180_000);

it("a bot sees the delivery waiting to merge and checks a closed pull request with kiln check-for-new-phases, as Check now does (Kiln After Delivery AC-BOT-01, AC-BOT-02)", async () => {
  await fixture();
  const { spawn } = await import("node:child_process"); const { fileURLToPath } = await import("node:url"); const { join } = await import("node:path");
  const { startFixtureController } = await import("../test-support/controller-server.js");
  const { COMET_DIRECTORY } = await import("../test-support/comet-continuation-fixture.js");
  h.setPullRequestViews({ "fictional/comet-library#12": recordedPullRequest("closed", { number: 12, base: "develop" }) });
  await h.engine.checkCompletedPlan();
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  const cli = async (args: string[]) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; child.stdout.on("data", data => stdout += String(data));
    const code = await new Promise<number | null>(resolve => child.once("close", resolve));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a status read the test walks freely
    return { code, stdout, json: () => JSON.parse(stdout) as Record<string, any> };
  };
  const target = join(h.repository, COMET_DIRECTORY);
  try {
    const waiting = (await cli(["status", target, "--json"])).json();
    expect(waiting.after_delivery).toMatchObject({ waiting: true, readError: null, pullRequests: [{ repository: "comet-library", number: 12, state: "closed" }] });
    expect(waiting.continuation).toMatchObject({ check: { status: "awaiting_merge" }, waiting: { repository: "comet-library", number: 12, baseBranch: "develop", closed: true }, summary: "New phases: Kiln can check for them once #12 has merged into develop." });
    expect((await cli(["status", target])).stdout).toContain("New phases: Kiln can check for them once #12 has merged into develop.");
    const check = await cli(["check-for-new-phases", target, "--json"]);
    expect(check.code, check.stdout).toBe(0);
    expect(check.json().data).toMatchObject({ check: { status: "available" }, answer: { source: { kind: "remote_base", branch: "develop" }, origin: { kind: "commit", subject: "test(comet): publish revised plan" }, phases: expect.arrayContaining([{ id: "9", title: "Catalog capability 9" }]) } });
    expect(h.engine.record.afterDelivery?.checkedWhileClosedAt).toBeDefined();
    const answered = (await cli(["status", target])).stdout;
    // The commit that added the phases, by its message too, as the page names it (Kiln After Delivery AC-BOT-02).
    expect(answered).toMatch(/7 phases were added to this PRD after Kiln finished it: 9, 10, 11, 12, 13, 14, 15, in commit [0-9a-f]{7} “test\(comet\): publish revised plan” on origin\/develop \(/);
    expect(answered).not.toContain("Plan needs reconciliation");
  } finally { await hosted.server.close(); hosted.release(); }
}, 120_000);

it("a bot checks a finished run for new phases and continues it from the command line (Kiln Deliver When Audit Loops Run Out AC-BOT-01)", async () => {
  await fixture();
  const { spawn } = await import("node:child_process"); const { fileURLToPath } = await import("node:url"); const { join } = await import("node:path");
  const { startFixtureController } = await import("../test-support/controller-server.js");
  const { COMET_DIRECTORY } = await import("../test-support/comet-continuation-fixture.js");
  const hosted = await startFixtureController({ engine: h.engine, folderName: "library-catalog", featureName: "Comet Library", token: h.engine.record.token });
  const cli = async (args: string[]) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; child.stdout.on("data", data => stdout += String(data));
    const code = await new Promise<number | null>(resolve => child.once("close", resolve));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a status read the test walks freely
    return { code, stdout, json: () => JSON.parse(stdout) as Record<string, any> };
  };
  const target = join(h.repository, COMET_DIRECTORY);
  const control = async (name: string) => (await cli(["status", target, "--json"])).json().controls.find((c: { name: string }) => c.name === name);
  try {
    const before = h.engine.record.executionId;
    expect(await control("check-for-new-phases")).toMatchObject({ available: true, reason: null, invocation: ["kiln", "check-for-new-phases", target] });
    expect(await control("continue-with-phases")).toMatchObject({ available: false, reason: "No new phases are offered. Check for new phases first." });
    const check = await cli(["check-for-new-phases", target, "--json"]);
    expect(check.code, check.stdout).toBe(0);
    const proposal = check.json().data.proposal;
    expect(check.json().data.check).toMatchObject({ status: "available" });
    expect(proposal).toMatchObject({ id: h.engine.record.completedPlanCheck!.result!.proposal!.id, readiness: "ready" });
    expect(proposal.phases.length).toBeGreaterThan(0);
    expect(await control("continue-with-phases")).toMatchObject({ available: true, reason: null });
    const token = (await cli(["status", target, "--json"])).json().status_token as string;
    // A stale status token is refused before anything is accepted (AC-BOT-01 targeting).
    const stale = await cli(["continue-with-phases", target, "--proposal", proposal.id, "--only-if-status-matches", `${token}-stale`, "--command-id", "bot-continue-stale", "--json"]);
    expect(stale.code, stale.stdout).toBe(3);
    expect(stale.json().errors[0].code).toBe("stale_status_token");
    expect(h.engine.record.continuation?.acceptances ?? []).toEqual([]);
    expect(h.engine.record.executionId).toBe(before);
    const go = await cli(["continue-with-phases", target, "--proposal", proposal.id, "--only-if-status-matches", token, "--command-id", "bot-continue", "--json"]);
    expect(go.code, go.stdout).toBe(0);
    await h.engine.commands.settled(); await h.engine.settled();
    expect(h.engine.commands.lookup("bot-continue").operation).toMatchObject({ state: "completed", outcome: "completed", action: "continuation-accept" });
    expect(h.engine.record.continuation?.acceptances.filter(row => row.commandId === "bot-continue")).toHaveLength(1);
    expect(h.engine.record.executionId).not.toBe(before);
  } finally { await hosted.server.close(); hosted.release(); }
}, 180_000);
