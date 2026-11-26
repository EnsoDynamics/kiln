// Preparation execution: recovering a stopped preparation through Verify, Resume, pause, restart,
// Start again and Carry on. The shared fixture is src/test-support/preparation-execution-fixture.ts.
import { afterEach, expect, vi } from "vitest";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writePrdRecord } from "../state/records.js";
import { git } from "../test-support/git-repositories.js";
import { landingSession, waitFor } from "../test-support/engine-harness.js";
import { cleanUpPreparation, fixture, h, nativeIt, restartCommand, resumePreparation } from "../test-support/preparation-execution-fixture.js";
afterEach(cleanUpPreparation);

nativeIt("retains the verified checkpoint across pause/restart and admits implementation once", async () => {
  const f = await fixture(); await f.accept(); expect(h.engine.pause()).toMatchObject({ ok: true }); await f.submit();
  expect(h.engine.record.preparation!.stage).toBe("verification"); expect(h.engine.record.preparation!.verifiedCheckpoint).toBeDefined();
  expect(h.engine.record.pause.activeSince).toBeDefined(); expect(h.claudeCalls()).toHaveLength(1);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.decide()).toMatchObject({ kind: "paused" });
  expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.engine.record.preparation!.attempts).toHaveLength(1); expect(h.engine.latestSession("9")!.runs).toHaveLength(2); expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
}, 120_000);

nativeIt("holds a changed pinned source after successful verification and pause", async () => {
  const f = await fixture(); await f.accept(); h.engine.pause(); await f.submit();
  const attempt = h.engine.record.preparation!.attempts[0]!.id;
  git(h.sandbox, h.repository, "branch", "-f", "wt/catalog-accessibility", "develop");
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.busy && !h.engine.billing.pending);
  expect(await h.engine.start()).toMatchObject({ ok: true }); await h.engine.settled();
  expect(h.engine.latestSession("9")!.runs).toHaveLength(1); expect(h.engine.record.preparation!.reason).toContain("moved");
  expect(h.engine.record.preparation!.attempts.map(row => row.id)).toEqual([attempt]); expect(h.engine.record.phases["9"]?.doneAt).toBeUndefined();
});

nativeIt("reuses an allocated zero-run preparation session after a fresh billing hold clears", async () => {
  // 2.1.312 offers live control (AC-AGENT-03), whose preparation ownership check reads Claude's session registry, as a real install has.
  const f = await fixture(); mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true }); h.env.KILN_STANDIN_VERSION = "2.1.312"; h.env.ANTHROPIC_API_KEY = "synthetic-preparation-billing-canary"; await h.engine.refreshBilling(); await waitFor(() => !h.engine.billing.busy && !h.engine.billing.pending);
  const check = await h.engine.checkCompletedPlan(); expect(await h.engine.continuationCommand("accept", { executionId: h.engine.record.executionId!, proposalId: check.result!.proposal!.id, commandId: "preparation-billing-hold", statusToken: h.engine.controlView().token })).toMatchObject({ ok: true }); await h.engine.settled();
  const id = h.engine.latestSession("9")!.sessionId; expect(h.engine.latestSession("9")!.runs).toHaveLength(0); expect(h.claudeCalls()).toHaveLength(0);
  delete h.env.ANTHROPIC_API_KEY; await h.engine.refreshBilling(); await waitFor(() => !h.engine.billing.busy && !h.engine.billing.pending);
  expect(await h.engine.checkAgain()).toMatchObject({ ok: true }); await waitFor(() => !!h.engine.latestSession("9")?.runs[0]?.pid && h.claudeCalls().length === 1).catch(error => { throw new Error(JSON.stringify({ error: error.message, billing: h.engine.record.billing, phase: h.engine.record.phases["9"], commands: h.engine.commands.all() })); }); await f.submit();
  expect(h.engine.latestSession("9")!.sessionId).toBe(id); expect(h.engine.latestSession("9")!.runs).toHaveLength(2); expect(h.engine.record.preparation!.stage).toBe("implementation");
}, 120_000);

nativeIt.each(["environment", "output", "hooks", "spawn", "spawn_throw"])("recovers a positively known no-launch %s failure through ordinary controls", async mode => {
  const f = await fixture(); await f.accept();
  const permissions = await import("./preparation-permissions.js");
  const helpers = await import("../platform/helper-process.js");
  const environment = permissions.preparationEnvironment; const hooks = permissions.preparationHooks; const launch = helpers.spawnDetached;
  let injected = false;
  const pending = () => h.engine.record.preparation?.attempts.at(-1)?.outcome === "running" && !h.engine.record.preparation.attempts.at(-1)?.pid;
  const envFailure = vi.spyOn(permissions, "preparationEnvironment").mockImplementation(async (context, cwd) => {
    const value = await environment(context, cwd);
    if (!injected && pending() && ["environment", "output"].includes(mode)) {
      injected = true;
      if (mode === "environment") throw new Error("Synthetic no-launch environment projection unavailable");
      mkdirSync(context.record.preparation!.attempts.at(-1)!.output);
    }
    return value;
  });
  const hookFailure = vi.spyOn(permissions, "preparationHooks").mockImplementation(async (context, cwd) => { if (!injected && pending() && mode === "hooks") { injected = true; throw new Error("Synthetic no-launch hook read unavailable"); } return hooks(context, cwd); });
  const spawnFailure = vi.spyOn(helpers, "spawnDetached").mockImplementation((executable, args, options) => {
    if (!injected && pending() && args.some(arg => arg.endsWith("preparation-check-runner.mjs")) && mode.startsWith("spawn")) {
      injected = true;
      if (mode === "spawn_throw") throw new Error("Synthetic synchronous spawn refusal");
      return launch(join(h.sandbox.root, "missing-native-runner"), args, options);
    }
    return launch(executable, args, options);
  });
  await f.submit(); envFailure.mockRestore(); hookFailure.mockRestore(); spawnFailure.mockRestore();
  expect(injected).toBe(true);
  expect(h.engine.record.preparation?.attempts).toMatchObject([{ outcome: "failed", launchFailure: "not_launched" }]);
  expect(h.engine.record.preparation!.attempts[0]!.pid).toBeUndefined(); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare();
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  expect(await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget(), intent: "verify" })).toMatchObject({ ok: true, outcome: "still_stopped" });
  expect(h.engine.record.preparation?.attempts).toHaveLength(1);
  await resumePreparation();
  expect(h.engine.record.preparation?.stage, JSON.stringify(h.engine.record.preparation)).toBe("implementation");
  expect(h.engine.record.preparation?.attempts.map(row => row.outcome)).toEqual(["failed", "succeeded"]);
  expect(h.engine.latestSession("9")!.runs).toHaveLength(3);
}, 120_000);

nativeIt.each(["legacy_obstacle", "unknown_start"].flatMap(mode => [false, true].map(legacyFailed => ({ mode, legacyFailed }))))("holds unreconstructible native $mode evidence through Verify and Resume (legacy failed=$legacyFailed)", async ({ mode, legacyFailed }) => {
  const f = await fixture("exit 4"); await f.accept(); await f.submit();
  const attempt = h.engine.record.preparation!.attempts[0]!;
  const { withGate } = await import("../live/gate.js");
  // Retain the supported old-format/unknown-identity state at a real native boundary.
  attempt.outcome = legacyFailed ? "failed" : "unresolved";
  delete attempt.endedAt; delete attempt.outputDigest;
  if (mode === "unknown_start") delete attempt.processStartTime;
  else await withGate(attempt.gateDirectory, gate => { gate.version = 1; delete gate.processObservations; gate.obstacle = "Legacy inventory cannot reconstruct missing observations"; });
  writePrdRecord(h.stateDirectory, h.engine.record);
  h.engine.close(); h.engine = f.make(); await h.engine.prepare(); await h.engine.decide();
  await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
  await h.engine.checkAgain({ target: h.engine.phaseRecoveryTarget(), intent: "verify" });
  await h.engine.resume({ target: h.engine.phaseRecoveryTarget() }); await h.engine.settled();
  expect(h.engine.record.preparation?.stage).not.toBe("implementation");
  expect(h.engine.record.preparation?.attempts).toHaveLength(1);
  expect(h.engine.record.preparation?.attempts[0]?.outcome).toBe(legacyFailed ? "failed" : "unresolved");
  expect(h.engine.record.preparation?.reason).toMatch(mode === "unknown_start" ? /ownership is unresolved/ : /Legacy inventory/);
  expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.latestSession("9")!.runs).toHaveLength(1);
}, 120_000);

nativeIt("starts the preparation phase again with its own task and a fresh policy read (run restart AC-CASE-02)", async () => {
  const f = await fixture();
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ noInit: true, actions: [] }, { actions: [{ result: "Not prepared yet." }, { exit: 0 }] }] }));
  await f.accept(); await h.engine.settled();
  expect(h.engine.stoppedPhase()).toBe("9"); expect(h.engine.stoppedCase("9")).toBe("could_not_start");
  delete h.engine.record.preparation!.providerPolicyDigest;
  expect(await restartCommand("start-again", "prep-start-again")).toMatchObject({ outcome: "session_started" });
  const calls = h.claudeCalls();
  expect(calls).toHaveLength(2);
  expect(calls[1]!.prompt).toBe(calls[0]!.prompt); expect(calls[1]!.prompt).toContain("preparation only");
  expect(h.engine.record.preparation).toMatchObject({ stage: "preparation", providerPolicyDigest: expect.any(String) });
}, 120_000);

nativeIt("carries on the preparation phase with its own task and the carry-on facts (run restart AC-CARRY-05)", async () => {
  const f = await fixture();
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ noTranscript: true, actions: [{ result: "Blocked before preparing." }, { exit: 0 }] }, { actions: [{ result: "Still not prepared." }, { exit: 0 }] }] }));
  await f.accept(); await h.engine.settled();
  expect(h.engine.stoppedPhase()).toBe("9"); expect(h.engine.carryOnControl()).toMatchObject({ offered: true, available: true });
  delete h.engine.record.preparation!.providerPolicyDigest;
  expect(await restartCommand("carry-on", "prep-carry-on", { message: "The catalog work is merged." })).toMatchObject({ outcome: "session_started" });
  const prompt = h.claudeCalls()[1]!.prompt;
  expect(prompt.startsWith("Prepare the prerequisites for Phase 9 of Library catalog")).toBe(true); expect(prompt).toContain("preparation only");
  expect(prompt).toContain("The person running Kiln says:\n\nThe catalog work is merged.");
  expect(prompt).toContain("Blocked before preparing.");
  expect(h.engine.phaseSessions("9").at(-1)!.startedAs).toBe("carry_on");
  expect(h.engine.record.preparation).toMatchObject({ stage: "preparation", providerPolicyDigest: expect.any(String) });
}, 120_000);

nativeIt("carries on the preparation phase's implementation stage in a new session that the checks can pass (run restart AC-CARRY-05)", async () => {
  const f = await fixture(); await f.accept();
  const scenario = JSON.parse(readFileSync(h.scenarioPath, "utf8")) as { sessions: unknown[] };
  scenario.sessions[1] = { actions: [{ result: "Blocked partway through the implementation." }, { exit: 0 }] };
  scenario.sessions[2] = landingSession();
  writeFileSync(h.scenarioPath, JSON.stringify(scenario));
  const resultBody = await f.submit();
  expect(await h.engine.submitPreparation(resultBody)).toMatchObject({ ok: true, disposition: "verified" }); await h.engine.settled();
  expect(h.engine.record.preparation!.stage).toBe("implementation"); expect(h.engine.stoppedPhase()).toBe("9");
  // The saved conversation is gone, so Kiln carries on in a new session.
  const { findTranscripts } = await import("../session/transcripts.js");
  unlinkSync(findTranscripts(h.env.CLAUDE_CONFIG_DIR!, h.engine.latestSession("9")!.sessionId).main!);
  expect(h.engine.carryOnControl()).toMatchObject({ offered: true, available: true });
  expect(await restartCommand("carry-on", "prep-implementation-carry-on")).toMatchObject({ outcome: "session_started" });
  expect(h.claudeCalls()[2]!.prompt).not.toContain("preparation only");
  expect(h.claudeCalls()[2]!.prompt).toContain("Blocked partway through the implementation.");
  expect(h.engine.phaseSessions("9")).toHaveLength(2);
  expect(h.engine.record.phases["9"]?.doneAt).toBeDefined();
}, 120_000);
