// Kiln Deliver When Audit Loops Run Out, Phase 1 (move on at the loop limits) with real Git, scripted
// provider sessions writing version-2 reports and the packaged CLI submitting them. No paid model calls.
// A loop is one run of an audit; every finding is built; a kind whose runs reach its limit gets no
// further audit, and the run goes on instead of stopping to ask.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { buildSnapshot } from "./snapshot.js";
import { auditKey, effectiveAudit } from "../audit/workflow.js";
import { LOOP_STOP_LINE } from "../state/audit-loops.js";
import { auditLoopsText } from "../control/loop-text.js";
import { headerState } from "../../view/src/lib/progress.js";
import type { Receipt } from "../control/commands.js";
import type { LocalServer } from "../server/local-server.js";

let h: Harness | undefined; let server: LocalServer | undefined; let release: (() => void) | undefined; let markers: string[] = [];
afterEach(async () => {
  for (const marker of markers) if (existsSync(marker)) writeFileSync(marker, "continue");
  markers = [];
  await server?.close(); server = undefined; release?.(); release = undefined; await h?.cleanup(); h = undefined;
});
const directory = "docs/prds/proof";
const files = {
  "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
  "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
  "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
  "value.mjs": "export const value = () => 42;\n",
  "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
};
async function fixture(auditSessions: unknown[], sessions: NonNullable<Parameters<typeof createHarness>[0]>["sessions"] = [pullRequestSession()]) {
  h = await createHarness({ folder: "proof", files, sessions, auditCycles: true });
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions }));
  const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
  server = hosted.server; release = hosted.release;
  return h;
}
const audit = (behavior: Record<string, unknown> = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
const landing = () => landingSession(`${directory}/value.mjs`, files["value.mjs"]);
/** A marker an audit session waits on before submitting, so the test can look at the run while that audit runs. */
function marker(current: Harness, name: string): string { const path = join(current.sandbox.root, name); markers.push(path); return path; }
const reached = (path: string) => waitFor(() => existsSync(path) && readFileSync(path, "utf8") === "ready", 90_000);
const go = (path: string) => writeFileSync(path, "continue");
const kinds = (current: Harness) => current.engine.record.completionAudits!.activities.map(a => a.continuationIndex > 1 ? "fix" : a.kind === "delivery_audit" ? "delivery" : "test");
const loops = (current: Harness) => current.engine.record.auditLoops!.loops.map(loop => `${loop.kind} ${loop.number}`);
const stops = (current: Harness) => Object.entries(current.engine.record.phases).filter(([, facts]) => facts.stop).map(([key, facts]) => `${key}: ${facts.stop!.kind}`);
const auditPrompts = (current: Harness) => current.claudeCalls().filter(call => /^Run (Delivery|Test) audit/.test(call.prompt)).map(call => call.prompt);
let commands = 0;
async function control(current: Harness, action: string, inputs: Record<string, unknown> = {}): Promise<Receipt> {
  const command_id = `move-on-${++commands}`;
  const answer = current.engine.commands.submit({ command_id, execution_id: current.engine.record.executionId!, status_token: current.engine.controlView().token, action, inputs });
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await current.engine.commands.settled(); await current.engine.settled();
  return current.engine.commands.lookup(command_id).operation as Receipt;
}

describe("a loop is one run of an audit (AC-CHOICE-01, AC-LAST-02)", () => {
  it("defaults both limits to 4 and counts a first delivery audit that passes as delivery 1 of 4", { timeout: 180_000 }, async () => {
    const current = await fixture([audit(), audit()]);
    expect(current.engine.record.settings.auditLoops).toEqual({ deliveryLimit: 4, testLimit: 4 });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(stops(current))).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test"]);
    expect(current.engine.record.auditLoops!.loops).toEqual(current.engine.record.completionAudits!.activities.map((a, i) => ({ kind: i === 0 ? "delivery" : "test", number: 1, startedAt: a.createdAt, activityKey: auditKey(a) })));
    const snapshot = buildSnapshot(current.engine);
    expect(snapshot.auditLoops).toMatchObject({ settings: { deliveryLimit: 4, testLimit: 4 }, delivery: { used: 1, limit: 4, closed: false }, test: { used: 1, limit: 4, closed: false }, frozen: { at: expect.any(String) } });
    // Each audit row carries its loop label with the limit in force; nothing marks a last loop (AC-STOP-05).
    const [delivery, test] = current.engine.record.completionAudits!.activities;
    expect(snapshot.activities!.find(row => row.id === auditKey(delivery!))!.loops).toEqual([{ kind: "delivery", number: 1, limit: 4 }]);
    expect(snapshot.activities!.find(row => row.id === auditKey(test!))!.loops).toEqual([{ kind: "test", number: 1, limit: 4 }]);
    // The prompt names the step each outcome leads to, with no loop number and no acceptance sentence.
    const [deliveryPrompt, testPrompt] = auditPrompts(current);
    expect(deliveryPrompt).toContain("- passed: Kiln runs the test audit.");
    expect(deliveryPrompt).toContain("- completion_phases: Kiln builds the phases you added, then runs the delivery audit.");
    expect(testPrompt).toContain("- continue_test: Kiln starts a session of test fixes; with changedImplementation true, Kiln runs the delivery audit, then runs the test audit.");
    for (const prompt of [deliveryPrompt!, testPrompt!]) { expect(prompt).not.toMatch(/last (test )?audit loop|I accept|loop \d/i); }
    // No session is given a sentence accepting Weak rows, the pull request session included (AC-CHOICE-01).
    const pullRequest = current.claudeCalls().map(call => call.prompt).filter(prompt => !/^Run (Delivery|Test) audit/.test(prompt));
    expect(pullRequest.length).toBeGreaterThan(0);
    for (const prompt of pullRequest) expect(prompt).not.toMatch(/I accept|Weak rows/);
  });
});

describe("after a kind's last loop, no audit of that kind runs again (AC-LAST-03, AC-STOP-04)", () => {
  it("builds the phases delivery audit loop 1 of 1 adds, then goes on to the test audit and the pull request", { timeout: 180_000 }, async () => {
    const current = await fixture([audit({ gap: true }), audit()], [landing(), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 4 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test"]);
    expect(current.engine.record.phases["2"]!.doneAt).toBeTruthy();
    expect(loops(current)).toEqual(["delivery 1", "test 1"]);
    expect(auditPrompts(current)[0]).toContain("- completion_phases: Kiln builds the phases you added, then runs the test audit.");
    expect(buildSnapshot(current.engine).auditLoops).toMatchObject({ delivery: { used: 1, limit: 1, closed: true } });
  });

  it("works through saved test work after test audit loop 1 of 1 in as many sessions of test fixes as it takes, with no test audit after", { timeout: 240_000 }, async () => {
    const current = await fixture([]);
    const path = marker(current, "fix-session-paused");
    writeFileSync(current.scenarioPath, JSON.stringify({ sessions: [pullRequestSession()], auditSessions: [audit(), audit({ continueTest: true, findingText: "Batch one left." }), audit({ continueTest: true, findingText: "Batch two left." }), audit({ findingText: "Every criterion is adequate.", beforeSubmitFile: path })] }));
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 4, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true });
    await reached(path);
    // While a session of test fixes runs, the status line names the latest test loop (AC-STOP-05).
    expect(buildSnapshot(current.engine).auditLoops!.position).toEqual({ audit: "test", loop: 1, limit: 1, fixing: true });
    go(path); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test", "fix", "fix"]);
    // A session of test fixes is never a loop.
    expect(loops(current)).toEqual(["delivery 1", "test 1"]);
    expect(auditPrompts(current).at(-1)).toContain("- continue_test: Kiln starts a session of test fixes; with changedImplementation true, Kiln runs the delivery audit, then starts a session of test fixes.");
    const fixRow = buildSnapshot(current.engine).activities!.find(row => row.id === auditKey(current.engine.record.completionAudits!.activities.at(-1)!))!;
    expect(fixRow.loops).toBeUndefined();
  });

  it("after the last test audit's phases, runs a delivery audit while a delivery loop is left, then goes to the pull request", { timeout: 240_000 }, async () => {
    const current = await fixture([audit(), audit({ gap: true }), audit()], [landing(), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 4, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test", "delivery"]);
    expect(loops(current)).toEqual(["delivery 1", "test 1", "delivery 2"]);
    // The delivery audit after the closed test kind forecasts the pull request.
    expect(auditPrompts(current).at(-1)).toContain("- passed: Kiln goes on to the pull request.");
    // The pull request session has started: a later change is saved but runs nothing, and the floor is 1 (AC-CHOICE-02).
    const frozen = structuredClone(current.engine.record.auditLoops!.atPullRequest);
    expect(frozen).toMatchObject({ deliveryLimit: 4, testLimit: 1 });
    expect(await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 9 } })).toEqual({ ok: true });
    await current.engine.settled();
    expect(kinds(current)).toEqual(["delivery", "test", "delivery"]);
    expect(current.engine.record.auditLoops!.atPullRequest).toEqual(frozen);
    expect(buildSnapshot(current.engine).auditLoops).toMatchObject({ settings: { deliveryLimit: 1, testLimit: 9 }, delivery: { used: 2, limit: 4, floor: 1 }, test: { used: 1, limit: 1, closed: true, floor: 1 } });
  });

  it("a test audit's phases get no delivery audit once delivery is closed: the test audit runs again while one is left", { timeout: 240_000 }, async () => {
    const current = await fixture([audit(), audit({ gap: true }), audit()], [landing(), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 4 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test", "test"]);
    expect(loops(current)).toEqual(["delivery 1", "test 1", "test 2"]);
  });

  it("a test audit that changed implementation runs a delivery audit while one is left, counted as a loop, then the test audit again", { timeout: 240_000 }, async () => {
    const current = await fixture([audit(), audit({ directFix: true }), audit(), audit()]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test", "delivery", "test"]);
    expect(loops(current)).toEqual(["delivery 1", "test 1", "delivery 2", "test 2"]);
  });

  it("saved test work that changed implementation, with test closed and delivery open: a delivery audit, then a session of test fixes", { timeout: 240_000 }, async () => {
    const current = await fixture([audit(), audit({ continueTest: true, directFix: true, findingText: "Batch one left." }), audit(), audit({ findingText: "Every criterion is adequate." })]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 4, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test", "delivery", "fix"]);
    expect(loops(current)).toEqual(["delivery 1", "test 1", "delivery 2"]);
  });

  it("a test audit that changed implementation goes to the pull request with no delivery audit once delivery is closed", { timeout: 180_000 }, async () => {
    const current = await fixture([audit(), audit({ directFix: true })]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 4 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(effectiveAudit(current.stateDirectory, current.engine.record.completionAudits!.activities[1]!)!.changedImplementation).toBe(true);
    expect(kinds(current)).toEqual(["delivery", "test"]);
  });
});

describe("a limit changed during a run (AC-CHOICE-02, AC-STOP-05)", () => {
  it("refuses a limit below the runs already made, accepts the floor, and still builds the phases the last audit adds", { timeout: 240_000 }, async () => {
    const current = await fixture([], [landing(), landing(), pullRequestSession()]);
    const path = marker(current, "second-delivery-audit");
    writeFileSync(current.scenarioPath, JSON.stringify({ sessions: [landing(), landing(), pullRequestSession()], auditSessions: [audit({ gap: true }), audit({ gap: true, beforeSubmitFile: path }), audit()] }));
    await current.engine.start({ refinementConfirmed: true });
    await reached(path);
    expect(buildSnapshot(current.engine).auditLoops).toMatchObject({ delivery: { used: 2, limit: 4, floor: 2 }, position: { audit: "delivery", loop: 2, limit: 4 } });
    expect(await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 4 } })).toMatchObject({ ok: false, status: 422, fieldErrors: { deliveryLimit: "Enter 2 or more: this run has already made 2 delivery audit loops." } });
    // The page's own route refuses it the same way, as a field error (AC-CHOICE-02).
    const origin = new URL(server!.address).origin;
    const page = await fetch(`${origin}/api/settings`, { method: "POST", headers: { "X-Kiln-Token": current.engine.record.token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ auditLoops: { deliveryLimit: 1 } }) });
    expect(page.status).toBe(422);
    expect(await page.json()).toMatchObject({ fieldErrors: { deliveryLimit: "Enter 2 or more: this run has already made 2 delivery audit loops." } });
    // The floor is accepted through the page's route too, and saved for Kiln's next decision.
    const accepted = await fetch(`${origin}/api/settings`, { method: "POST", headers: { "X-Kiln-Token": current.engine.record.token, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ auditLoops: { deliveryLimit: 2 } }) });
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    expect(current.engine.record.settings.auditLoops).toMatchObject({ deliveryLimit: 2, testLimit: 4 });
    expect(buildSnapshot(current.engine).auditLoops!.position).toEqual({ audit: "delivery", loop: 2, limit: 2 });
    go(path); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    // The second audit's phase is built; no third delivery audit runs.
    expect(current.engine.record.phases["3"]!.doneAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "delivery", "test"]);
  });

  it("a raise after delivery's last loop runs a delivery audit when phases were built since, then the test audit while one is left", { timeout: 240_000 }, async () => {
    const current = await fixture([], [landing(), pullRequestSession()]);
    const path = marker(current, "first-test-audit");
    writeFileSync(current.scenarioPath, JSON.stringify({ sessions: [landing(), pullRequestSession()], auditSessions: [audit({ gap: true }), audit({ beforeSubmitFile: path }), audit(), audit()] }));
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 4 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true });
    await reached(path);
    expect(buildSnapshot(current.engine).auditLoops).toMatchObject({ delivery: { closed: true }, position: { audit: "test", loop: 1, limit: 4 } });
    expect(await current.engine.changeSettings({ auditLoops: { deliveryLimit: 2, testLimit: 4 } })).toEqual({ ok: true });
    go(path); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test", "delivery", "test"]);
    expect(loops(current)).toEqual(["delivery 1", "test 1", "delivery 2", "test 2"]);
  });

  it("a delivery raise after its last loop, with test closed, audits the test audit's phases once and goes on to the pull request", { timeout: 240_000 }, async () => {
    const current = await fixture([], [landing(), pullRequestSession()]);
    const path = marker(current, "test-audit-with-gap");
    writeFileSync(current.scenarioPath, JSON.stringify({ sessions: [landing(), pullRequestSession()], auditSessions: [audit(), audit({ gap: true, beforeSubmitFile: path }), audit()] }));
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true });
    await reached(path);
    expect(buildSnapshot(current.engine).auditLoops).toMatchObject({ delivery: { used: 1, limit: 1, closed: true }, position: { audit: "test", loop: 1, limit: 1 } });
    expect(await current.engine.changeSettings({ auditLoops: { deliveryLimit: 2, testLimit: 1 } })).toEqual({ ok: true });
    go(path); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test", "delivery"]);
    expect(loops(current)).toEqual(["delivery 1", "test 1", "delivery 2"]);
  });

  it("a raise of the test limit after test's last loop runs a test audit when work changed since it", { timeout: 240_000 }, async () => {
    const current = await fixture([]);
    const path = marker(current, "delivery-after-test-fix");
    writeFileSync(current.scenarioPath, JSON.stringify({ sessions: [pullRequestSession()], auditSessions: [audit(), audit({ directFix: true }), audit({ beforeSubmitFile: path }), audit()] }));
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 4, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true });
    await reached(path);
    expect(buildSnapshot(current.engine).auditLoops).toMatchObject({ test: { used: 1, limit: 1, closed: true, floor: 1 } });
    expect(await current.engine.changeSettings({ auditLoops: { deliveryLimit: 4, testLimit: 2 } })).toEqual({ ok: true });
    go(path); await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test", "delivery", "test"]);
  });

  it("a raise after delivery's last loop with nothing unchecked changes nothing", { timeout: 180_000 }, async () => {
    const current = await fixture([]);
    const path = marker(current, "test-audit-nothing-unchecked");
    writeFileSync(current.scenarioPath, JSON.stringify({ sessions: [pullRequestSession()], auditSessions: [audit(), audit({ beforeSubmitFile: path })] }));
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 4 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true });
    await reached(path);
    expect(await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 4 } })).toEqual({ ok: true });
    go(path); await current.engine.settled();
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(kinds(current)).toEqual(["delivery", "test"]);
  });
});

describe("the run's page names a phase an audit added, with no loop (AC-STOP-05)", () => {
  it("while the phase delivery audit loop 1 added is built, the status line and kiln status name the phase and no loop", { timeout: 240_000 }, async () => {
    const current = await fixture([], [landing(), pullRequestSession()]);
    const path = marker(current, "added-phase-building");
    const held = landing(); held.actions.splice(1, 0, { waitForFile: path });
    writeFileSync(current.scenarioPath, JSON.stringify({ sessions: [held, pullRequestSession()], auditSessions: [audit({ gap: true }), audit(), audit()] }));
    await current.engine.start({ refinementConfirmed: true });
    await waitFor(() => current.engine.record.phases["2"]?.sessionIds.length === 1 && buildSnapshot(current.engine).current?.phaseId === "2", 90_000);
    const snapshot = buildSnapshot(current.engine);
    expect(snapshot.auditLoops!.position).toBeUndefined();
    expect(headerState(snapshot, true, new Date())).toMatchObject({ label: "Implementing phase 2" });
    expect(JSON.stringify(headerState(snapshot, true, new Date()))).not.toMatch(/loop \d+ of/i);
    expect(auditLoopsText(snapshot.auditLoops)).toBe("Audit loops: delivery 1 of 4 · test 0 of 4");
    go(path); await current.engine.settled();
    expect(current.engine.record.completedAt).toBeTruthy();
  });
});

describe("Mark complete's next step respects a closed kind (AC-LAST-03)", () => {
  it("a delivery audit marked complete with the test kind closed moves on to final delivery, not a test audit", { timeout: 240_000 }, async () => {
    const current = await fixture([audit(), audit({ directFix: true }), audit({ blocked: true })]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 4, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const stopped = current.engine.record.completionAudits!.activities.at(-1)!;
    expect(stopped.kind).toBe("delivery_audit");
    expect(current.engine.stoppedPhaseKey()).toBe(auditKey(stopped));
    await control(current, "check-again");
    const offer = current.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, nextActivity: { kind: "final_delivery", title: "Final delivery" } });
  });
});

describe("a loop stop saved by Kiln 1.3.0 (Upgrade, AC-STOP-04, AC-STOP-05)", () => {
  it("shows its one line with Check again only, and Check again clears it and the run goes on", { timeout: 240_000 }, async () => {
    const current = await fixture([audit({ blocked: true }), audit(), audit()]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const key = auditKey(current.engine.record.completionAudits!.activities[0]!);
    expect(current.engine.stoppedPhaseKey()).toBe(key);
    // At a Needs you stop the status line keeps the latest loop.
    expect(buildSnapshot(current.engine).auditLoops!.position).toEqual({ audit: "delivery", loop: 1, limit: 4 });
    // As Kiln 1.3.0 saved it: a loop stop on that audit.
    const at = new Date().toISOString();
    current.engine.record.phases[key]!.stop = { kind: "loop_limit", at, checks: [], checkedAt: at, run: { id: "00000000-0000-4000-8000-000000000001", at, origin: "stop", finished: true }, loop: { kind: "test", reason: "items_listed", heldAuditKey: key } };
    const snapshot = buildSnapshot(current.engine);
    expect(snapshot.needsYou!.checks).toEqual([expect.objectContaining({ passed: false, facts: [LOOP_STOP_LINE] })]);
    expect(snapshot.needsYou!.markComplete).toEqual({ offered: false, reason: LOOP_STOP_LINE });
    expect(snapshot.needsYou!.resumeOffered).toBe(false);
    const available = current.engine.controlView().controls.filter(c => c.available).map(c => c.name);
    expect(available).toContain("check-again");
    for (const name of ["reply", "resume", "waive-and-advance"]) expect(available).not.toContain(name);
    expect(await control(current, "check-again")).toMatchObject({ state: "completed" });
    await current.engine.settled();
    expect(stops(current)).toEqual([]);
    expect(current.engine.record.completedAt).toBeTruthy();
    // The relaunch on the same audit is not counted again.
    expect(loops(current)).toEqual(["delivery 1", "test 1"]);
  });
});
