// Mark complete (waivers PRD AC-WAIVE-01 to 04, 08 to 10), through the engine and its control
// journal against real Git with the stand-in claude: a phase that Kiln refuses although the
// person says it is done is marked complete only after a failed recheck, only on exactly the
// items it showed, and the waiver is saved with the completion and never reads as passed.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readPrdRecord, type CheckResult } from "../state/records.js";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import type { Engine } from "./engine.js";
import { checkCounts } from "./waivers.js";
import { statusProjection } from "../control/projection.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";

let harness: Harness | undefined;
afterEach(async () => { vi.restoreAllMocks(); await harness?.cleanup(); });

/** A phase session that closes and commits its work, then ends without pushing: Kiln stops on Pushed. */
const unpushedSession = (): ScenarioSession => ({
  actions: [{ skill: "enso-method:implement-from-requirements" }, { write: { path: "src/intake.txt", content: "intake\n" } }, { close: true }, { commit: "feat: intake" }, { result: "Done; the push is blocked here." }, { exit: 0 }],
});

let commandCount = 0;
/** Submits one journal instruction as a caller does, against the current status token, and waits for it to settle. */
async function submit(engine: Engine, action: string, inputs: Record<string, unknown> = {}) {
  const id = `waiver-test-${++commandCount}`;
  engine.commands.submit({ command_id: id, execution_id: engine.record.executionId, status_token: engine.controlView().token, action, inputs }, "caller", true);
  await engine.commands.settled();
  return engine.commands.all().find(r => r.command_id === id)!;
}

async function stoppedOnPush(): Promise<Harness> {
  harness = await createHarness({ sessions: [unpushedSession(), landingSession("src/credit.txt")] });
  await harness.engine.start({ refinementConfirmed: true });
  await harness.engine.settled();
  const stop = harness.engine.record.phases["1"]!.stop!;
  expect(stop.kind).toBe("done_check");
  expect(stop.checks.find(c => c.name === "Pushed")).toMatchObject({ passed: false, items: [{ kind: "repository_work", subject: expect.any(String) }] });
  return harness;
}

describe("Mark complete after a failed recheck (AC-WAIVE-01 to 04)", () => {
  it("is not offered before a recheck, is offered after one fails, and checking again never waives anything", async () => {
    const h = await stoppedOnPush();
    expect(h.engine.markCompleteOffer()).toMatchObject({ offered: false, reason: expect.stringMatching(/No check has run since Phase 1 stopped/) });
    const refused = await submit(h.engine, "waive-and-advance", { check_run_id: h.engine.record.phases["1"]!.stop!.run!.id, via: "command_line" });
    expect(refused).toMatchObject({ state: expect.stringMatching(/refused|failed/) });
    expect(refused.outcome).toBe("mark_complete_not_offered");

    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true, outcome: "still_stopped" });
    const offer = h.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, label: "Mark phase 1 complete", heading: "Phase 1 is done, and Kiln’s check is wrong?", failingChecks: 1, resultingLabel: "Complete · 1 check waived" });
    if (!offer.offered) throw new Error("not offered");
    expect(offer.items).toEqual([expect.objectContaining({ check: "Pushed", kind: "repository_work" })]);
    expect(offer.sentence[0]).toBe("Mark it complete. Kiln skips the 1 failing check above, records it as waived, never as passed, and moves to the next step. Phase 1 will show as “Complete · 1 check waived”.");
    expect(offer.sentence[1]).toMatch(/will be missing from the final pull request\. To push it instead, have Kiln resume Phase 1\.$/);
    // Rechecking is not waiving (AC-WAIVE-01).
    expect(h.engine.record.waivers ?? []).toEqual([]);
  });

  it("saves the waiver with the completion in one write and advances, the waived check never reading as passed (AC-WAIVE-04, 08, 10)", async () => {
    const h = await stoppedOnPush();
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    const offer = h.engine.markCompleteOffer();
    if (!offer.offered) throw new Error("not offered");
    const head = git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim();

    const receipt = await submit(h.engine, "waive-and-advance", { check_run_id: offer.checkRunId, via: "command_line", by: "grokbot" });
    expect(receipt.outcome).toBe("marked_complete");
    expect(receipt.effects.plan).toBe("advanced");
    await h.engine.settled();

    const saved = readPrdRecord(h.stateDirectory)!;
    const waiver = saved.waivers![0]!;
    expect(saved.waivers).toHaveLength(1);
    expect(waiver).toMatchObject({ activityKey: "1", activityKind: "implementation", effect: "completed", source: { via: "command_line", by: "grokbot", account: expect.any(String) }, checkRun: { id: offer.checkRunId } });
    expect(waiver.items).toEqual([expect.objectContaining({ check: "Pushed", kind: "repository_work", against: expect.stringContaining(head) })]);
    // The phase is complete on the waiver; its work is recorded as waived, never as pushed.
    const phase = saved.phases["1"]!;
    expect(phase).toMatchObject({ doneAt: expect.any(String), finishedByPerson: true, waiverId: waiver.waiverId });
    expect(phase.stop).toBeUndefined();
    const repository = Object.values(phase.repositories)[0]!;
    expect(repository.waivedHead).toBe(head);
    expect(repository.pushedSha).toBeUndefined();
    // Waived, never passed: 3 passed · 1 waived.
    const pushed = waiver.checks.find(c => c.name === "Pushed")!;
    expect(pushed).toMatchObject({ passed: true, waived: true });
    expect(pushed.items![0]!.waiver).toMatchObject({ waiverId: waiver.waiverId, activityKey: "1", via: "command_line", by: "grokbot" });
    expect(checkCounts(waiver.checks)).toMatchObject({ waived: 1, failed: 0 });
    // Kiln moved on to the next phase.
    expect(h.claudeCalls()[1]!.prompt).toContain("phase-2b-store-credit.md");
  });

  it("repeats Mark complete in status with --without-sending-reply while a reply was kept unsent at the stop (AC-WAIVE-05)", async () => {
    const h = await stoppedOnPush();
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    const preview = () => (statusProjection(readWork(stateRoot(h.env), h.stateDirectory), h.engine) as unknown as { stop: { mark_complete: { next_argv: string[] } } }).stop.mark_complete;
    expect(preview().next_argv).not.toContain("--without-sending-reply");
    // A reply kept unsent at this stop, as Resume at an already-complete phase leaves it.
    h.engine.commands.submit({ command_id: "kept", execution_id: h.engine.record.executionId, status_token: "stale", action: "reply", inputs: { message: "Keep going" } }, "caller", true);
    Object.assign(h.engine.commands.all().find(r => r.command_id === "kept")!, { state: "completed", outcome: "phase_already_complete", target: h.engine.controlView().target });
    const argv = preview().next_argv;
    expect(argv.slice(0, 4)).toEqual(["kiln", "waive-and-advance", expect.any(String), "--confirm"]);
    expect(argv).toContain("--without-sending-reply");
    // Following it, the acknowledgement is what lets Mark complete through.
    const offer = h.engine.markCompleteOffer();
    if (!offer.offered) throw new Error("not offered");
    expect((await submit(h.engine, "waive-and-advance", { check_run_id: offer.checkRunId, via: "command_line" })).outcome).toBe("unsent_reply_acknowledgement_required");
    expect((await submit(h.engine, "waive-and-advance", { check_run_id: offer.checkRunId, via: "command_line", without_sending_reply: true })).outcome).toBe("marked_complete");
  });

  it("advances without a waiver when the rerun passes, and saves nothing when the results changed (AC-WAIVE-04)", async () => {
    const h = await stoppedOnPush();
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    const first = h.engine.markCompleteOffer();
    if (!first.offered) throw new Error("not offered");

    // A new uncommitted file: Everything committed newly fails, so nothing is waived and nothing advances.
    writeFileSync(join(h.engine.worktreePath, "stray.txt"), "stray\n");
    const changed = await submit(h.engine, "waive-and-advance", { check_run_id: first.checkRunId, via: "browser" });
    expect(changed.outcome).toBe("check_results_changed");
    expect(h.engine.record.waivers ?? []).toEqual([]);
    expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
    // Offered again at once on the new run; the old run id is stale.
    const second = h.engine.markCompleteOffer();
    expect(second).toMatchObject({ offered: true, failingChecks: 2 });
    if (!second.offered) throw new Error("not offered");
    expect(second.checkRunId).not.toBe(first.checkRunId);
    expect((await submit(h.engine, "waive-and-advance", { check_run_id: first.checkRunId, via: "browser" })).outcome).toBe("stale_check_run");

    // Pushing everything by hand: the rerun passes and Kiln advances as Check again would, with no waiver.
    git(h.sandbox, h.engine.worktreePath, "add", "-A");
    git(h.sandbox, h.engine.worktreePath, "commit", "-q", "-m", "chore: stray");
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    const passed = await submit(h.engine, "waive-and-advance", { check_run_id: second.checkRunId, via: "browser" });
    expect(passed.outcome).toBe("checks_passed");
    expect(h.engine.record.waivers ?? []).toEqual([]);
    expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String) });
    expect(h.engine.record.phases["1"]!.waiverId).toBeUndefined();
  });
});

describe("a Mark complete interrupted before its write (design §Interfaces, AC-WAIVE-08)", () => {
  it("settles as not_applied at restart with nothing saved, releasing control so the stop can be marked complete again", async () => {
    const h = await stoppedOnPush();
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    const offer = h.engine.markCompleteOffer();
    if (!offer.offered) throw new Error("not offered");

    // The process dies after admission and the rerun, before the record write: the act never returns.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const crashing = h.engine as unknown as { waiveStopped: (...args: unknown[]) => Promise<unknown> };
    const act = vi.spyOn(crashing, "waiveStopped").mockImplementation(async () => { await held; return { ok: true, outcome: "check_results_changed", changes: [] }; });
    const id = "crash-mid-mark";
    h.engine.commands.submit({ command_id: id, execution_id: h.engine.record.executionId, status_token: h.engine.controlView().token, action: "waive-and-advance", inputs: { check_run_id: offer.checkRunId, via: "command_line" } }, "caller", true);
    await waitFor(() => act.mock.calls.length === 1);
    expect(h.engine.commands.all().find(r => r.command_id === id)).toMatchObject({ state: "in_progress", stage: "applying" });

    try {
      // A restarted Kiln reads the receipt left applying with no waiver carrying its operation id.
      const reopened = h.reopenFromDisk();
      await reopened.agents.refresh();
      const receipt = reopened.commands.all().find(r => r.command_id === id)!;
      expect(receipt).toMatchObject({ state: "failed", stage: "settled", outcome: "not_applied", effects: { plan: "not_advanced" } });
      expect(receipt.reason).toMatch(/interrupted before anything was saved/);
      const saved = readPrdRecord(h.stateDirectory)!;
      expect(saved.waivers ?? []).toEqual([]);
      expect(saved.phases["1"]!.doneAt).toBeUndefined();
      expect(saved.phases["1"]!.stop).toMatchObject({ kind: "done_check" });
      // Control is released: nothing holds the journal, and the same command id replays the settled receipt.
      expect(reopened.commands.busy).toBe(false);
      expect((reopened.commands.lookup(id) as unknown as { operation: { outcome: string } }).operation.outcome).toBe("not_applied");

      // Check again, then choose again: Mark complete goes through on the fresh run.
      await reopened.prepare();
      await recheck(reopened);
      const again = reopened.markCompleteOffer();
      if (!again.offered) throw new Error(`not offered after restart: ${again.reason}`);
      expect((await submit(reopened, "waive-and-advance", { check_run_id: again.checkRunId, via: "command_line" })).outcome).toBe("marked_complete");
      expect(readPrdRecord(h.stateDirectory)!.waivers).toHaveLength(1);
    } finally { release(); }
  });
});

/** A phase session that leaves Kiln to judge what is already there: no work, no Closed line. */
const idleSession = (): ScenarioSession => ({ actions: [{ result: "Nothing left to do here." }, { exit: 0 }] });

/** Check again at the current hand-back stop and returns that stop's rows. */
async function recheck(engine: Engine) {
  await engine.checkAgain(recoveryRequest(engine, "verify"));
  await engine.settled();
  return engine.record.phases[engine.stoppedPhaseKey()!]!.stop!.checks;
}

describe("checking, resuming and restarting never waive anything (AC-WAIVE-01)", () => {
  it("leaves waivers empty through Verify, a restart's recovery and Resume, even with Mark complete on offer", async () => {
    harness = await createHarness({ sessions: [unpushedSession(), { actions: [{ push: true }, { result: "Pushed now." }, { exit: 0 }] }, landingSession("src/credit.txt")] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop!.kind).toBe("done_check");

    // `kiln verify-and-advance`, through the control journal: still failing, nothing waived.
    expect((await submit(h.engine, "verify-and-advance")).outcome).toBe("completion_checks_failed");
    expect(h.engine.markCompleteOffer().offered).toBe(true);
    expect(h.engine.record.waivers ?? []).toEqual([]);

    // A restart's recovery reads the stop again and waives nothing.
    const reopened = h.reopenFromDisk();
    await reopened.agents.refresh();
    await reopened.prepare();
    await reopened.decide();
    await reopened.settled();
    expect(reopened.record.phases["1"]!.stop).toBeDefined();
    expect(reopened.record.waivers ?? []).toEqual([]);

    // `kiln resume`: the session pushes, the next check passes on its own, and still no waiver.
    expect((await submit(reopened, "resume")).outcome).toBe("session_resumed");
    await reopened.settled();
    const saved = readPrdRecord(h.stateDirectory)!;
    expect(saved.phases["1"]).toMatchObject({ doneAt: expect.any(String) });
    expect(saved.phases["1"]!.waiverId).toBeUndefined();
    expect(saved.phases["1"]!.completionChecks).toBeUndefined();
    expect(saved.waivers ?? []).toEqual([]);
  });
});

describe("a waiver covers its items while they are unchanged (AC-WAIVE-09, AC-WAIVE-08)", () => {
  it("meets phase 1's waived unpushed work at the next phase's check while the head is unchanged, across a restart, and not after a new commit", async () => {
    harness = await createHarness({ sessions: [unpushedSession(), idleSession()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    await recheck(h.engine);
    const offer = h.engine.markCompleteOffer();
    if (!offer.offered) throw new Error("not offered");
    expect((await submit(h.engine, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).outcome).toBe("marked_complete");
    await h.engine.settled();
    const waiverId = h.engine.record.waivers![0]!.waiverId;

    // 2b ran and changed nothing: its Pushed row is the same repository at the same head, met by phase 1's waiver.
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    const pushedAt2b = (checks: CheckResult[]) => checks.find(c => c.name === "Pushed")!;
    const stop = h.engine.record.phases["2b"]!.stop!.checks;
    expect(pushedAt2b(stop)).toMatchObject({ passed: true, waived: true, items: [{ waiver: { waiverId, activityKey: "1" } }] });
    expect(stop.find(c => c.name === "Phase doc closed")).toMatchObject({ passed: false });

    // The waiver survives a restart and still covers the unchanged item.
    h.reopenFromDisk();
    await h.engine.agents.refresh();
    await h.engine.prepare();
    expect(h.engine.record.waivers!.map(w => w.waiverId)).toEqual([waiverId]);
    expect(pushedAt2b(await recheck(h.engine))).toMatchObject({ passed: true, waived: true });

    // A new commit changes the head: the item needs its own passing check or its own waiver.
    writeFileSync(join(h.engine.worktreePath, "src", "later.txt"), "later\n");
    git(h.sandbox, h.engine.worktreePath, "add", "-A");
    git(h.sandbox, h.engine.worktreePath, "commit", "-q", "-m", "feat: later");
    const after = pushedAt2b(await recheck(h.engine));
    expect(after.passed).toBe(false);
    expect(after.waived).toBeUndefined();
    expect(after.items!.every(item => !item.waiver)).toBe(true);
    // A waiver ending never reopens the completed activity.
    expect(h.engine.record.phases["1"]).toMatchObject({ doneAt: expect.any(String), waiverId });
  });

  it.each([
    ["a tracked file", "src/intake.txt"],
    ["an untracked file", "src/stray.txt"],
  ])("ends an uncommitted-work waiver when %s that was already dirty is edited again", async (_name, path) => {
    // Phase 1 lands its work, then leaves `path` dirty: Kiln stops on Everything committed.
    const dirty: ScenarioSession = { actions: [...landingSession("src/intake.txt", "intake\n").actions.filter(a => !("result" in a) && !("exit" in a)), { write: { path, content: "dirty once\n" } }, { result: "Done; one edit left uncommitted." }, { exit: 0 }] };
    harness = await createHarness({ sessions: [dirty, idleSession()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop!.checks.find(c => c.name === "Everything committed")).toMatchObject({ passed: false, items: [{ kind: "repository_work" }] });
    await recheck(h.engine);
    const offer = h.engine.markCompleteOffer();
    if (!offer.offered) throw new Error("not offered");
    expect(offer.items).toEqual([expect.objectContaining({ check: "Everything committed", kind: "repository_work" })]);
    expect((await submit(h.engine, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).outcome).toBe("marked_complete");
    await h.engine.settled();

    // Unchanged at 2b's check: met by phase 1's waiver.
    const committed = (checks: CheckResult[]) => checks.find(c => c.name === "Everything committed")!;
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    expect(committed(h.engine.record.phases["2b"]!.stop!.checks)).toMatchObject({ passed: true, waived: true });

    // The same path, still dirty, with different content: the same status line, but no longer the waived work.
    writeFileSync(join(h.engine.worktreePath, path), "dirty twice\n");
    const after = committed(await recheck(h.engine));
    expect(after.passed).toBe(false);
    expect(after.waived).toBeUndefined();
    expect(after.items!.every(item => !item.waiver)).toBe(true);
  });
});
