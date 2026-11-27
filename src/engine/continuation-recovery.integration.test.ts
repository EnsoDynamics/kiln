// Continue with N phases across a moved base, restart, controller death and uncertain writes, with real
// Git/worktrees and durable engine commands. The shared fixture is src/test-support/continuation-execution-fixture.ts.
import { afterEach, expect, it, vi } from "vitest";
import * as durable from "../control/durable-file.js";
import { once } from "node:events";
import type { Harness } from "../test-support/engine-harness.js";
import { landingSession, waitFor } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { readPrdRecord } from "../state/records.js";
import { continuationFixture } from "../test-support/continuation-execution-fixture.js";
let h: Harness;
afterEach(async () => { vi.restoreAllMocks(); await h?.engine.stop("sigint"); await h?.cleanup(); });
const { fixture, request } = continuationFixture(() => h, next => { h = next; });

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
