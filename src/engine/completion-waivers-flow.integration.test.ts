// Mark complete through whole runs of the engine (waivers PRD AC-WAIVE-04, 10, 12), against real
// Git with the stand-in claude and gh: a waived broken plan followed in normal order, a launch
// stop on an unstarted phase marked complete, final delivery marked complete, and a delivery
// audit with no report marked complete before the test audit runs.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditKey } from "../audit/workflow.js";
import { readWork } from "../control/private-state.js";
import { statusProjection } from "../control/projection.js";
import { readPrdRecord } from "../state/records.js";
import { stateRoot } from "../state/state-files.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import type { Engine } from "./engine.js";
import { formatTerminalEvent } from "../kiln-command.js";
import { formatSummaryLine } from "../underway-output.js";
import { buildSnapshot } from "./snapshot.js";
import { checkCounts, countsText, NO_REPORT_WARNING, PLAN_WARNING } from "./waivers.js";

const plain = { green: (s: string) => s, amber: (s: string) => s, red: (s: string) => s, grey: (s: string) => s, bold: (s: string) => s } as unknown as Parameters<typeof formatTerminalEvent>[2];
let harness: Harness | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; });

let commandCount = 0;
/** Submits one journal instruction as a caller does, against the current status token, and waits for it to settle. */
async function submit(engine: Engine, action: string, inputs: Record<string, unknown> = {}) {
  const id = `waiver-flow-${++commandCount}`;
  engine.commands.submit({ command_id: id, execution_id: engine.record.executionId, status_token: engine.controlView().token, action, inputs }, "caller", true);
  await engine.commands.settled();
  return engine.commands.all().find(r => r.command_id === id)!;
}

/** Check again, then Mark complete on the run it left; returns the receipt. */
async function recheckAndMarkComplete(engine: Engine, via: "browser" | "command_line" = "browser") {
  expect(await engine.checkAgain(recoveryRequest(engine, "verify"))).toMatchObject({ ok: true });
  await engine.settled();
  const offer = engine.markCompleteOffer();
  if (!offer.offered) throw new Error(`Mark complete not offered: ${offer.reason}`);
  return { offer, receipt: await submit(engine, "waive-and-advance", { check_run_id: offer.checkRunId, via }) };
}

const status = (h: Harness) => statusProjection(readWork(stateRoot(h.env), h.stateDirectory), h.engine) as unknown as { progress: { key: string; waived_checks: number; warnings: { kind: string; text: string }[] }[] };

describe("a waived broken plan: Kiln follows its normal order (AC-WAIVE-04)", () => {
  it("skips the phase whose document is missing, completes the next with the plan warning, and never stops on the same problem again", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, landingSession("src/dashboard.txt"), pullRequestSession()] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();

    // While paused, 2b's document goes; Start stops on 2b with the plan's problem.
    rmSync(join(h.engine.worktreePath, "docs", "prds", "customer-returns", "phase-2b-store-credit.md"));
    await h.engine.start();
    await h.engine.settled();
    const problem = "phase-2-refunds.md lists 2b, which has no file.";
    expect(h.engine.record.phases["2b"]!.stop).toMatchObject({ kind: "plan", checks: [{ name: "Phase plan reads", passed: false, facts: [problem] }] });

    // 2b never started: Continue in normal order, once a recheck still fails.
    const { offer, receipt } = await recheckAndMarkComplete(h.engine);
    expect(offer).toMatchObject({ label: "Continue in normal order", heading: "Kiln can’t work out the next step, and you want it to carry on?", continueInOrder: true, items: [{ check: "Phase plan reads", kind: "known_problem", text: problem }] });
    expect(receipt.outcome).toBe("continued");
    await h.engine.settled();

    const saved = readPrdRecord(h.stateDirectory)!;
    expect(saved.waivers).toHaveLength(1);
    const waiver = saved.waivers![0]!;
    expect(waiver).toMatchObject({ activityKey: "2b", effect: "continued" });
    // 2b is skipped, not built: no session, not done, and it carries the plan warning.
    expect(saved.phases["2b"]).toMatchObject({ skippedByWaiver: waiver.waiverId, waiverWarning: { kind: "plan", waiverId: waiver.waiverId }, sessionIds: [] });
    expect(saved.phases["2b"]!.doneAt).toBeUndefined();
    // Phase 3 (which depends on 2b) ran next, wrote its Closed line and completed with the plan warning.
    expect(h.claudeCalls()[1]!.prompt).toContain("phase-3-returns-dashboard.md");
    expect(h.claudeCalls().some(call => call.prompt.includes("phase-2b-store-credit.md"))).toBe(false);
    expect(saved.phases["3"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: false, waiverWarning: { kind: "plan", waiverId: waiver.waiverId } });
    expect(saved.phases["3"]!.waiverId).toBeUndefined();
    // The same problem text never stopped Kiln again: final delivery ran and completed on the one waiver.
    expect(saved.completedAt).toEqual(expect.any(String));
    expect(Object.values(saved.phases).filter(facts => facts.stop)).toEqual([]);
    expect(h.claudeCalls()).toHaveLength(3);

    // The warning beside each activity's status, in the snapshot and the status JSON.
    const rows = buildSnapshot(h.engine).phases;
    expect(rows.find(row => row.id === "3")).toMatchObject({ state: "done", warnings: [{ kind: "plan_problem_waived", text: PLAN_WARNING }] });
    expect(rows.find(row => row.id === "2b")?.warnings).toEqual([{ kind: "plan_problem_waived", text: PLAN_WARNING }]);
    expect(status(h).progress.find(row => row.key === "3")?.warnings).toEqual([expect.objectContaining({ kind: "plan_problem_waived", text: PLAN_WARNING })]);

    // A restarted Kiln reads the same problem and still does not stop on it.
    const reopened = h.reopenFromDisk();
    await reopened.prepare();
    expect(reopened.record.waivers).toHaveLength(1);
    expect(Object.values(reopened.record.phases).filter(facts => facts.stop)).toEqual([]);
  });
});

describe("a launch stop on a phase that has not run (AC-WAIVE-02, AC-WAIVE-04, AC-WAIVE-09)", () => {
  it("marks the unstarted phase complete with its Closed item waived, never launches it, and still holds the next launch", async () => {
    const first = landingSession();
    harness = await createHarness({ sessions: [{ actions: [{ sleepFor: 1000 }, ...first.actions] }, landingSession("src/dashboard.txt"), pullRequestSession()] });
    const h = harness;
    const modelsPath = join(h.sandbox.root, "current-models.json");
    const recorded = JSON.parse(readFileSync(new URL("../../test/fixtures/proof-gate-1/supported-models.json", import.meta.url), "utf8")) as { models: { value: string }[] };
    writeFileSync(modelsPath, JSON.stringify(recorded));
    h.env.KILN_STANDIN_MODELS = modelsPath;
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    // The selected model is retired while phase 1 runs: 2b stops before launch.
    writeFileSync(modelsPath, JSON.stringify({ models: recorded.models.filter(m => m.value !== "opus") }));
    await h.engine.settled();
    expect(h.engine.record.phases["2b"]!.stop!.kind).toBe("selection");
    expect(h.engine.record.phases["2b"]!.sessionIds).toEqual([]);

    const { offer, receipt } = await recheckAndMarkComplete(h.engine, "command_line");
    // The recheck carries the phase's own completion rows beside the launch check.
    expect(offer).toMatchObject({ label: "Mark phase 2b complete", continueInOrder: false });
    expect(offer.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ check: "Agent selection and readiness", kind: "other", subject: expect.stringMatching(/^2b: /) }),
      expect.objectContaining({ check: "Phase doc closed", kind: "phase_closed", subject: "2b" }),
    ]));
    expect(receipt.outcome).toBe("marked_complete");
    await h.engine.settled();

    const saved = readPrdRecord(h.stateDirectory)!;
    const waiver = saved.waivers!.find(w => w.activityKey === "2b")!;
    expect(waiver).toMatchObject({ effect: "completed", activityKind: "implementation" });
    expect(saved.phases["2b"]).toMatchObject({ doneAt: expect.any(String), finishedByPerson: true, waiverId: waiver.waiverId, sessionIds: [] });
    expect(saved.phases["2b"]!.stop).toBeUndefined();
    // Never launched: the only provider session is phase 1's.
    expect(h.claudeCalls()).toHaveLength(1);
    expect(h.claudeCalls().some(call => call.prompt.includes("phase-2b-store-credit.md"))).toBe(false);
    // The waiver never makes a later launch eligible: phase 3 stops on its own selection check.
    expect(saved.phases["3"]!.stop).toMatchObject({ kind: "selection", checks: [expect.objectContaining({ name: "Agent selection and readiness", passed: false })] });
    expect(saved.phases["3"]!.stop!.checks[0]!.items?.[0]?.waiver).toBeUndefined();

    // After a restart, 2b stays complete and is not relaunched once a model is chosen again.
    writeFileSync(modelsPath, JSON.stringify(recorded));
    const reopened = h.reopenFromDisk();
    await reopened.agents.refresh();
    await reopened.prepare();
    expect(await reopened.decide()).toEqual({ kind: "start_phase", phaseId: "3" });
    // 2b, closed only by its waiver, counts as done in the terminal summary and in a disconnected status.
    expect(formatSummaryLine(reopened, plain)).toContain("3 of 4 phases done");
    const disconnected = statusProjection(readWork(stateRoot(h.env), h.stateDirectory)) as unknown as { phases: { completed: number; total: number } };
    expect(disconnected.phases).toEqual({ completed: 3, total: 4 });
    expect(reopened.record.phases["2b"]).toMatchObject({ doneAt: saved.phases["2b"]!.doneAt, waiverId: waiver.waiverId });

    // 2b's document never gets a Closed line; closed by its waiver, it still lets final delivery show and run.
    await reopened.continue();
    await reopened.settled();
    expect(reopened.record.plan!.find(phase => phase.id === "2b")!.closed).toBe(false);
    expect(reopened.record.completedAt).toEqual(expect.any(String));
    expect(buildSnapshot(reopened).phases.find(row => row.id === "pr")).toMatchObject({ state: "done" });
  });
});

/** A phase-pull-request session that ends without opening one: final delivery stops on Pull request open. */
const noPullRequestSession = () => ({ actions: [{ result: "Could not open the pull request here." }, { exit: 0 }] });

describe("final delivery marked complete (AC-WAIVE-10)", () => {
  it("completes with its pull request check Waived, never Passed, counted apart, before and after a restart", async () => {
    harness = await createHarness({ sessions: [landingSession(), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), noPullRequestSession()] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases.pr!.stop!.checks).toEqual([expect.objectContaining({ name: "Pull request open", passed: false })]);

    const { offer, receipt } = await recheckAndMarkComplete(h.engine, "command_line");
    expect(offer).toMatchObject({ label: "Mark final delivery complete", nextActivity: { kind: "complete" }, resultingLabel: "Complete · 1 check waived" });
    expect(offer.sentence[0]).toContain("moves to Complete");
    expect(receipt.outcome).toBe("marked_complete");
    await h.engine.settled();

    const check = (engine: Engine) => {
      const record = engine.record;
      expect(record.completedAt).toEqual(expect.any(String));
      const waiver = record.waivers!.find(w => w.activityKey === "pr")!;
      expect(waiver).toMatchObject({ activityKind: "final_delivery", effect: "completed", source: { via: "command_line" } });
      expect(record.phases.pr).toMatchObject({ doneAt: expect.any(String), finishedByPerson: true, waiverId: waiver.waiverId });
      const pullRequest = waiver.checks.find(c => c.name === "Pull request open")!;
      expect(pullRequest).toMatchObject({ passed: true, waived: true, items: [expect.objectContaining({ waiver: expect.objectContaining({ waiverId: waiver.waiverId, activityKey: "pr" }) })] });
      expect(checkCounts(waiver.checks)).toEqual({ passed: waiver.checks.length - 1, waived: 1, failed: 0 });
      // Every surface reads the same marked list: the final delivery row says Complete · 1 check waived.
      const row = buildSnapshot(engine).phases.find(r => r.id === "pr")!;
      expect(row).toMatchObject({ state: "done", waivedChecks: 1, waivedCompletion: { counts: { waived: 1, failed: 0 } } });
      expect(row.waivedCompletion!.checks.find(c => c.name === "Pull request open")).toMatchObject({ passed: true, waived: true });
      expect(countsText(row.waivedCompletion!.counts)).toMatch(/ · 1 waived$/);
      expect(status(h).progress.find(r => r.key === "pr")).toMatchObject({ waived_checks: 1 });
    };
    check(h.engine);
    // The terminal reads Final delivery complete · 1 check waived, never a pull request opened #0.
    const done = h.events.filter(event => event.kind === "pull_request").at(-1)!;
    const line = formatTerminalEvent(done, h.engine.record, plain);
    expect(line).toMatch(/Final delivery +complete · 1 check waived \d{4}-\d{2}-\d{2} \d{2}:\d{2} \S+ · command line · /);
    expect(line).not.toMatch(/opened|#0/);
    // Saved with the completion: the restarted Kiln reads the same waiver and the same counts (AC-WAIVE-08).
    const reopened = h.reopenFromDisk();
    await reopened.prepare();
    check(reopened);
  });
});

const proofFiles = {
  "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
  "technical-design.md": "# Design\nExport value from value.mjs.\n",
  "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
  "value.mjs": "export const value = () => 42;\n",
};
/** An audit session that ends without writing or submitting a report. */
const reportlessAudit = () => ({ actions: [{ result: "Audit ended without a report." }, { exit: 0 }] });

describe("an audit with no usable report marked complete (AC-WAIVE-12, AC-WAIVE-10)", () => {
  it("counts the delivery audit as passed and runs the test audit; final delivery then meets Current completion audits as Waived", { timeout: 120_000 }, async () => {
    harness = await createHarness({ folder: "proof", files: proofFiles, auditCycles: true, sessions: [pullRequestSession()] });
    const h = harness;
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [pullRequestSession()], auditSessions: [reportlessAudit(), reportlessAudit()] }));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const delivery = h.engine.record.completionAudits!.activities[0]!;
    expect(delivery.kind).toBe("delivery_audit");
    expect(h.engine.stoppedPhaseKey()).toBe(auditKey(delivery));

    const first = await recheckAndMarkComplete(h.engine);
    expect(first.offer).toMatchObject({ label: "Mark delivery audit complete", noReport: true, nextActivity: { kind: "audit", title: "Test audit" } });
    expect(first.offer.sentence[0]).toMatch(/^No audit report\./);
    expect(first.offer.sentence[1]).toContain("counts the audit as passed and moves on to the test audit");
    // No report, and the feature branch Kiln set up was never pushed: both are waived.
    expect(first.offer.items.map(item => item.check)).toEqual(["Audit result recorded", "Pushed"]);
    expect(first.receipt.outcome).toBe("marked_complete");
    await h.engine.settled();

    // The delivery audit counts as passed with no report: the test audit ran next, and the delivery audit did not run again.
    const kinds = h.engine.record.completionAudits!.activities.map(a => a.kind);
    expect(kinds).toEqual(["delivery_audit", "test_audit"]);
    expect(h.claudeCalls()).toHaveLength(2);
    const deliveryRow = buildSnapshot(h.engine).activities!.find(r => r.id === auditKey(delivery))!;
    expect(deliveryRow).toMatchObject({ state: "done", waivedChecks: 2, waivedCompletion: { counts: { waived: 2, failed: 0 } } });
    expect(deliveryRow.audit!.checks.find(c => c.name === "Audit result recorded")).toMatchObject({ passed: true, waived: true });
    expect(deliveryRow.warnings).toEqual([{ kind: "no_audit_report", text: NO_REPORT_WARNING }]);
    expect(status(h).progress.find(r => r.key === auditKey(delivery))?.warnings).toEqual([expect.objectContaining({ kind: "no_audit_report" })]);
    const tests = h.engine.record.completionAudits!.activities[1]!;
    expect(h.engine.stoppedPhaseKey()).toBe(auditKey(tests));

    // The test audit, also with no report, counts as passed and changed only tests: final delivery follows.
    const second = await recheckAndMarkComplete(h.engine);
    expect(second.offer).toMatchObject({ noReport: true, nextActivity: { kind: "final_delivery" } });
    expect(second.receipt.outcome).toBe("marked_complete");
    await h.engine.settled();
    expect(h.engine.record.completedAt).toEqual(expect.any(String));
    expect(h.engine.record.completionAudits!.activities).toHaveLength(2);

    // Final delivery met only because the audits count on their waivers: a passing Current completion audits row marked Waived.
    const completion = h.engine.record.phases.pr!.completionChecks!;
    const audits = completion.find(c => c.name === "Current completion audits")!;
    expect(audits).toMatchObject({ passed: true, waived: true });
    expect(audits.items!.map(item => item.waiver?.activityKey)).toEqual([auditKey(delivery), auditKey(tests)]);
    expect(completion.find(c => c.name === "Pull request open")).toMatchObject({ passed: true });
    expect(completion.find(c => c.name === "Pull request open")!.waived).toBeUndefined();
    expect(checkCounts(completion)).toMatchObject({ waived: 1, failed: 0 });
    const reopened = h.reopenFromDisk();
    await reopened.prepare();
    expect(buildSnapshot(reopened).phases.find(r => r.id === "pr")).toMatchObject({ state: "done", waivedChecks: 1, waivedCompletion: { counts: { waived: 1, failed: 0 } } });
  });
});
