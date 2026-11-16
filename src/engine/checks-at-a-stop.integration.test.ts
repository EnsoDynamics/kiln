// Kiln Checks at a Stop (docs/changes/kiln-checks-at-a-stop/kiln-checks-at-a-stop-prd.md), through
// the engine against real Git with the stand-in claude: what the Needs you rows are (Why Kiln
// stopped, or the completion checks once a check of them has run) and whether Check again at the
// stop runs the activity's completion checks. The pages' wording is proved in the view's tests.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readPrdRecord } from "../state/records.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import type { Engine } from "./engine.js";
import { buildSnapshot } from "./snapshot.js";
import { DELIVERY_CHECK } from "./development-delivery.js";

let harness: Harness | undefined;
afterEach(async () => { vi.restoreAllMocks(); await harness?.cleanup(); });

/** A phase session that closes and commits its work, then ends without pushing: Kiln stops on Pushed. */
const unpushedSession = (): ScenarioSession => ({
  actions: [{ skill: "enso-method:implement-from-requirements" }, { write: { path: "src/intake.txt", content: "intake\n" } }, { close: true }, { commit: "feat: intake" }, { result: "Done; the push is blocked here." }, { exit: 0 }],
});

const needsYou = (engine: Engine) => buildSnapshot(engine).needsYou!;

async function stoppedOnPush(): Promise<Harness> {
  harness = await createHarness({ sessions: [unpushedSession(), landingSession("src/credit.txt")] });
  await harness.engine.start({ refinementConfirmed: true });
  await harness.engine.settled();
  expect(harness.engine.record.phases["1"]!.stop!.kind).toBe("done_check");
  return harness;
}

describe("a done-check stop's rows, before and after Check again (AC-STOPCHECK-01 to 03)", () => {
  it("reads Why Kiln stopped with Check again running the completion checks, then the completion checks once that check has run, across a restart", async () => {
    const h = await stoppedOnPush();
    const atStop = needsYou(h.engine);
    expect(atStop.rowsAreCompletionChecks).toBeUndefined();
    expect(atStop.recheckRunsAll).toBe(true);
    expect(atStop.checkRun).toMatchObject({ origin: "stop" });

    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true, outcome: "still_stopped" });
    const checked = needsYou(h.engine);
    expect(checked.rowsAreCompletionChecks).toBe(true);
    expect(checked.checkRun).toMatchObject({ origin: "recheck", finished: true });
    expect(checked.checks.map(check => check.name)).toEqual(expect.arrayContaining(["Everything committed", "Pushed"]));
    // Saved with the stop, so the next `kiln run` reads it the same way.
    expect(readPrdRecord(h.stateDirectory)!.phases["1"]!.stop!.rowsAreCompletionChecks).toBe(true);
    expect(needsYou(h.reopenFromDisk()).rowsAreCompletionChecks).toBe(true);
  });

  it("keeps the rows, their time and their label when a check could not finish", async () => {
    const h = await stoppedOnPush();
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    const before = h.engine.record.phases["1"]!.stop!;
    const { checks, checkedAt } = structuredClone(before);
    vi.spyOn(h.engine as unknown as { doneCheck: () => Promise<unknown> }, "doneCheck").mockResolvedValue({ unavailable: "origin is unreachable." });
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: false });
    const after = needsYou(h.engine);
    expect(after.checkRun).toMatchObject({ origin: "recheck", finished: false });
    expect(after.rowsAreCompletionChecks).toBe(true);
    expect(h.engine.record.phases["1"]!.stop!).toMatchObject({ checks, checkedAt });
  });

  it("an unfinished check before any finished one keeps the Why Kiln stopped label", async () => {
    const h = await stoppedOnPush();
    vi.spyOn(h.engine as unknown as { doneCheck: () => Promise<unknown> }, "doneCheck").mockResolvedValue({ unavailable: "origin is unreachable." });
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    const after = needsYou(h.engine);
    expect(after.checkRun).toMatchObject({ origin: "recheck", finished: false });
    expect(after.rowsAreCompletionChecks).toBeUndefined();
  });

  it("labels the rows as the completion checks after the check Kiln runs when it is started again on the stopped phase", async () => {
    const h = await stoppedOnPush();
    const reopened = h.reopenFromDisk();
    await reopened.agents.refresh();
    await reopened.prepare();
    expect(await reopened.decide()).toMatchObject({ kind: "needs_you", phaseKey: "1" });
    expect(reopened.record.phases["1"]!.stop).toMatchObject({ run: { origin: "recheck", finished: true }, rowsAreCompletionChecks: true });
    expect(needsYou(reopened).rowsAreCompletionChecks).toBe(true);
  });
});

describe("a plan stop reruns only its own check (AC-STOPCHECK-02, 03)", () => {
  it("leaves out Check again's line and keeps Why Kiln stopped after the plan check runs again", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, landingSession("src/b.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();
    const prdDirectory = join(h.engine.worktreePath, "docs", "prds", "customer-returns");
    rmSync(join(prdDirectory, "phase-2b-store-credit.md"));
    await h.engine.start();
    await h.engine.settled();
    expect(h.engine.record.phases["2b"]!.stop!.kind).toBe("plan");

    const atStop = needsYou(h.engine);
    expect(atStop.recheckRunsAll).toBeUndefined();
    expect(atStop.rowsAreCompletionChecks).toBeUndefined();
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    const checked = needsYou(h.engine);
    expect(checked.checkRun).toMatchObject({ origin: "recheck", finished: true });
    expect(checked.rowsAreCompletionChecks).toBeUndefined();
    expect(checked.checks.map(check => check.name)).toEqual(["Phase plan reads"]);
  });
});

describe("Check again on the hand-back page always runs the completion checks (AC-STOPCHECK-02)", () => {
  it("says so even where the standard page's Check again would rerun only a development check on an activity already complete", async () => {
    const h = await stoppedOnPush();
    // A closed phase stopped again by its development delivery check: recheckStop reruns only that check.
    const facts = h.engine.record.phases["1"]!;
    facts.doneAt = new Date().toISOString();
    facts.stop!.checks = [{ name: DELIVERY_CHECK, passed: false, facts: ["api-checkpoint / verify: not yet verified"] }];
    expect(h.engine.phaseRecoveryTarget()?.phaseKey).toBe("1");
    expect(needsYou(h.engine).recheckRunsAll).toBe(true);
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));
    expect(needsYou(h.engine).rowsAreCompletionChecks).toBe(true);
    expect(needsYou(h.engine).checks.map(check => check.name)).toEqual(expect.arrayContaining(["Everything committed", "Pushed"]));
  });
});

describe("final delivery on the standard Needs you page (AC-STOPCHECK-02, 03)", () => {
  it("says Check again runs the completion checks, then labels the rows as them after a recheck that still fails", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), pullRequestSession(31, true)] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases.pr!.stop!.kind).toBe("pull_request_check");
    expect(h.engine.phaseRecoveryTarget()).toBeUndefined();
    const atStop = needsYou(h.engine);
    expect(atStop.recheckRunsAll).toBe(true);
    expect(atStop.rowsAreCompletionChecks).toBeUndefined();
    expect(await h.engine.checkAgain()).toMatchObject({ ok: true });
    const checked = needsYou(h.engine);
    expect(checked.checkRun).toMatchObject({ origin: "recheck", finished: true });
    expect(checked.rowsAreCompletionChecks).toBe(true);
    expect(checked.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Pull request open", passed: false, facts: ["#31 is a draft"] })]));
  });
});

describe("a launch stop on a phase that has not run reruns its launch check (AC-STOPCHECK-02, 03)", () => {
  it("shows no Check again line, and keeps Why Kiln stopped after a recheck that carries the completion rows beside the launch check", async () => {
    const first = landingSession();
    harness = await createHarness({ sessions: [{ actions: [{ sleepFor: 1000 }, ...first.actions] }, landingSession("src/dashboard.txt"), pullRequestSession()] });
    const h = harness;
    const modelsPath = join(h.sandbox.root, "current-models.json");
    const recorded = JSON.parse(readFileSync(new URL("../../test/fixtures/proof-gate-1/supported-models.json", import.meta.url), "utf8")) as { models: { value: string }[] };
    writeFileSync(modelsPath, JSON.stringify(recorded));
    h.env.KILN_STANDIN_MODELS = modelsPath;
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    writeFileSync(modelsPath, JSON.stringify({ models: recorded.models.filter(m => m.value !== "opus") }));
    await h.engine.settled();
    expect(h.engine.record.phases["2b"]!.stop!.kind).toBe("selection");

    const atStop = needsYou(h.engine);
    expect(atStop.recheckRunsAll).toBeUndefined();
    await h.engine.checkAgain();
    const checked = needsYou(h.engine);
    expect(checked.checkRun).toMatchObject({ origin: "recheck", finished: true });
    expect(checked.checks.map(check => check.name)).toEqual(expect.arrayContaining(["Agent selection and readiness", "Phase doc closed"]));
    expect(checked.rowsAreCompletionChecks).toBeUndefined();
  });
});
