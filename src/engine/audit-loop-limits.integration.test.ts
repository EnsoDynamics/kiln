// Audit loop limits (Kiln Audit Loop Limits PRD) with real Git, scripted provider sessions writing
// version-2 reports, the packaged CLI submitting them, and the control journal applying the stop
// controls. No paid model calls.
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { vi } from "vitest";
import { join } from "node:path";
import { createHarness, landingSession, pullRequestSession, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { buildSnapshot } from "./snapshot.js";
import { auditKey } from "../audit/workflow.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
import type { Receipt } from "../control/commands.js";
import type { LocalServer } from "../server/local-server.js";

let h: Harness | undefined; let server: LocalServer | undefined; let release: (() => void) | undefined;
afterEach(async () => { await server?.close(); server = undefined; release?.(); release = undefined; await h?.cleanup(); h = undefined; });
const directory = "docs/prds/proof";
const files = {
  "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
  "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
  "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
  "value.mjs": "export const value = () => 42;\n",
  "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
};
async function fixture(auditSessions: unknown[], sessions = [pullRequestSession()]) {
  h = await createHarness({ folder: "proof", files, sessions, auditCycles: true });
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions }));
  const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
  server = hosted.server; release = hosted.release;
  return h;
}
const auditSession = (behavior: Record<string, unknown> = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
const landing = () => landingSession(`${directory}/value.mjs`, files["value.mjs"]);
let commandCount = 0;
async function control(current: Harness, action: string, inputs: Record<string, unknown> = {}): Promise<Receipt> {
  const command_id = `loop-control-${++commandCount}`;
  const answer = current.engine.commands.submit({ command_id, execution_id: current.engine.record.executionId!, status_token: current.engine.controlView().token, action, inputs });
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await current.engine.commands.settled(); await current.engine.settled();
  return current.engine.commands.lookup(command_id).operation as Receipt;
}
const auditPrompts = (current: Harness) => current.claudeCalls().filter(call => /^Run (Delivery|Test) audit/.test(call.prompt));

describe("delivery audit loops (AC-LOOP-02, AC-DELIV-01, AC-STOP-01, AC-STOP-02, AC-SHOW-01)", () => {
  it("stops instead of building past the limit, then builds after Allow N more loops", { timeout: 180_000 }, async () => {
    const current = await fixture([auditSession({ gap: true }), auditSession({ gap: true }), auditSession(), auditSession()], [landing(), landing(), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 3, afterLastTest: "deliver_unless_serious" } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const audits = current.engine.record.completionAudits!.activities;
    const held = auditKey(audits[1]!);
    // The second audit's phase stays in the plan, open and not started.
    expect(current.engine.record.phases[held]!.stop).toMatchObject({ kind: "loop_limit", checks: [], loop: { kind: "delivery", reason: "phases_added", heldAuditKey: held } });
    expect(current.engine.record.phases["3"]).toBeUndefined();
    expect(current.claudeCalls().filter(call => call.prompt.includes("phase-3"))).toHaveLength(0);
    const snapshot = buildSnapshot(current.engine);
    expect(snapshot.feature.state).toBe("needs_you");
    expect(snapshot.auditLoops).toMatchObject({ delivery: { used: 1, limit: 1 }, stop: { kind: "delivery", holds: true, heading: "Delivery audit loops used: 1 of 1", loops: [{ label: "Last loop", activity: "Phase 2", did: "Phase 2 built" }, { label: "Delivery audit", did: "added Phase 3" }], audit: { summary: "One criterion is not delivered; added a completion phase.", items: [] } } });
    expect(snapshot.activities!.find(row => row.id === "2")!.loops).toEqual([expect.objectContaining({ number: 1, limit: 1, last: true })]);
    // No Mark complete at a hold, and a held Check again stays held without rerunning completion checks.
    expect(snapshot.needsYou!.markComplete).toEqual({ offered: false, reason: "Kiln is holding because no delivery audit loop is left, not because a check failed. Allow more loops, or raise the limit and Check again." });
    expect(snapshot.needsYou!.recheckRunsAll).toBeUndefined();
    const check = await control(current, "check-again");
    expect(check).toMatchObject({ state: "completed", outcome: "completion_checks_failed" });
    expect(current.engine.record.phases[held]!.stop).toMatchObject({ kind: "loop_limit", checks: [], run: { origin: "recheck", finished: true } });
    // Allow 2 more: the limit is 2, the count restarts, and the held phase is built as loop 1 of 2.
    const allowed = await control(current, "allow-more-loops", { count: 2 });
    expect(allowed).toMatchObject({ state: "completed", outcome: "loops_allowed", effects: { session: "not_started", plan: "not_advanced" } });
    await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    expect(current.engine.record.settings.auditLoops).toMatchObject({ deliveryLimit: 2 });
    expect(current.engine.record.auditLoops!.epochs.at(-1)).toMatchObject({ kind: "delivery", cause: "allowed", limit: 2, heldAuditKey: held });
    const rows = buildSnapshot(current.engine).activities!;
    expect(rows.find(row => row.id === "3")!.loops).toEqual([expect.objectContaining({ number: 1, limit: 2, last: false })]);
  });

  it("starts the held loop at Check again once the limit is raised in the settings (AC-LOOP-05)", { timeout: 180_000 }, async () => {
    const current = await fixture([auditSession({ gap: true }), auditSession({ gap: true }), auditSession(), auditSession()], [landing(), landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 3, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const held = auditKey(current.engine.record.completionAudits!.activities[1]!);
    expect(current.engine.record.phases[held]!.stop!.kind).toBe("loop_limit");
    // Raising the limit starts nothing by itself.
    expect((await control(current, "settings", { delivery_audit_loops: 2 })).state).toBe("completed");
    expect(current.engine.record.phases[held]!.stop!.kind).toBe("loop_limit");
    expect(current.engine.record.settings.auditLoops!.afterLastTestSource).toMatchObject({ kind: "person", where: "documents_found" });
    await control(current, "check-again");
    await current.engine.settled();
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "delivery").map(loop => [loop.number, loop.limitAtStart, loop.last])).toEqual([[1, 1, true], [2, 2, true]]);
  });
});

describe("phases a test audit adds (AC-DELIV-01, AC-TEST-02 first row, AC-LOOP-02)", () => {
  it("a last-loop test audit that adds phases and lists a decision stops for a delivery loop, and Allow builds them as a loop sourced from that test audit", { timeout: 240_000 }, async () => {
    const decision = "AC-PROOF-01 names a file the design kept.";
    const current = await fixture([auditSession({ gap: true }), auditSession(), auditSession({ continueTest: true }), auditSession({ gap: true, decision }), auditSession({ relist: true }), auditSession({ settle: "Kept." })], [landing(), landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const audits = current.engine.record.completionAudits!.activities;
    expect(audits.map(a => a.kind)).toEqual(["delivery_audit", "delivery_audit", "test_audit", "test_audit"]);
    const held = auditKey(audits[3]!);
    // No test loop is left and the report also lists a decision: the first row wins, so Kiln
    // stops for a delivery loop, not for the listed item, and phase 3 stays open and not started.
    expect(current.engine.record.phases[held]!.stop).toMatchObject({ kind: "loop_limit", loop: { kind: "delivery", reason: "phases_added", heldAuditKey: held } });
    expect(current.engine.record.phases["3"]).toBeUndefined();
    expect(current.claudeCalls().filter(call => call.prompt.includes("phase-3"))).toHaveLength(0);
    expect(buildSnapshot(current.engine).auditLoops).toMatchObject({ delivery: { used: 1, limit: 1 }, test: { used: 1, limit: 1 }, stop: { kind: "delivery", holds: true, heading: "Delivery audit loops used: 1 of 1", audit: { items: [{ problem: decision }] } } });
    // Allow 1 more: phase 3 is built as a delivery loop whose source is the test audit.
    expect(await control(current, "allow-more-loops", { count: 1 })).toMatchObject({ state: "completed", outcome: "loops_allowed" });
    await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    const fromTest = current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "delivery" && loop.sourceAuditId === audits[3]!.activityId);
    expect(fromTest.map(loop => [loop.number, loop.limitAtStart, loop.activityKeys])).toEqual([[1, 1, ["3"]]]);
  });

  it("an audit with no report whose session appended a phase: Mark complete forecasts the loop stop, and the phase is not started (AC-WAIVE-12 in part)", { timeout: 180_000 }, async () => {
    const phase = `# Phase 3: Repair value\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Summary\nReturn the required value.\n\n## Phase dependencies\nNone.\n`;
    const noReport = { actions: [{ write: { path: `${directory}/phase-3-repair.md`, content: phase } }, { commit: "docs(audit): add a completion phase" }, { push: true }, { result: "Audit ended." }, { exit: 0 }] };
    const current = await fixture([auditSession({ gap: true }), noReport, auditSession(), auditSession()], [landing(), landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 3, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const activity = current.engine.record.completionAudits!.activities[1]!;
    const key = auditKey(activity);
    expect(current.engine.record.phases[key]!.stop!.kind).toBe("done_check");
    await control(current, "check-again");
    const offer = current.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    expect(offer.nextActivity).toEqual({ kind: "loop_stop", key, title: "Delivery audit loop stop" });
    expect(current.engine.record.phases["3"]).toBeUndefined();
    expect(current.claudeCalls().filter(call => call.prompt.includes("phase-3-repair"))).toHaveLength(0);
  });
});

describe("test audit loops (AC-LOOP-03, AC-TEST-01, AC-TEST-02, AC-TEST-03, AC-STOP-02)", () => {
  it("tells the last loop no more follow, stops on saved test work, and Accept records the person's words through delivery", { timeout: 180_000 }, async () => {
    const current = await fixture([auditSession(), auditSession({ continueTest: true }), auditSession({ continueTest: true }), auditSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const audits = current.engine.record.completionAudits!.activities;
    expect(audits.map(a => [a.kind, a.continuationIndex])).toEqual([["delivery_audit", 1], ["test_audit", 1], ["test_audit", 2]]);
    const prompts = auditPrompts(current);
    // The first test audit is not a loop and is told nothing; the continuation is the last loop.
    expect(prompts[1]!.prompt).not.toContain("No more test audit loops follow");
    expect(prompts[2]!.prompt).toContain("No more test audit loops follow this session: the limit is 1 test audit loops");
    expect(prompts[2]!.prompt).toContain("The person's choice for after the last test audit loop: Deliver, unless something serious is left.");
    expect(prompts[2]!.prompt).toMatch(/The person's own words, chosen on Documents found at \d{4}-\d\d-\d\d \d\d:\d\d UTC: "I accept the remaining Weak rows after the last test audit loop\."/);
    const held = auditKey(audits[2]!);
    expect(current.engine.record.phases[held]!.stop).toMatchObject({ kind: "loop_limit", loop: { kind: "test", reason: "test_work_saved" } });
    const snapshot = buildSnapshot(current.engine);
    expect(snapshot.auditLoops!.stop).toMatchObject({ heading: "Test audit loops used: 1 of 1", holds: true, afterLastTest: "deliver_unless_serious", acceptSentence: "I accept the remaining Weak rows." });
    const lastRow = snapshot.activities!.find(row => row.id === held)!;
    expect(lastRow.loops).toEqual([expect.objectContaining({ number: 1, limit: 1, last: true, did: "Saved test work · Test work remains for another session." })]);
    expect(lastRow.carried).toEqual([{ sentence: "I accept the remaining Weak rows after the last test audit loop.", source: expect.stringMatching(/^chosen on Documents found at /) }]);
    // Accept: one more session that fixes nothing and is not a loop, quoting the sentence as the person's.
    const accepted = await control(current, "accept-and-deliver", { via: "browser" });
    expect(accepted).toMatchObject({ state: "completed", outcome: "acceptance_recorded" });
    await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    const after = auditPrompts(current);
    expect(after).toHaveLength(4);
    expect(after[3]!.prompt).toContain("The person pressed Accept what is left and deliver. Their words, given on the run's page at");
    expect(after[3]!.prompt).toContain('"I accept the remaining Weak rows."');
    expect(after[3]!.prompt).toContain("Fix nothing in this session. Record what those words accept, and list by name every row or item they do not:");
    expect(current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "test")).toHaveLength(1);
    expect(current.engine.record.auditLoops!.acceptances[0]).toMatchObject({ via: "browser", heldAuditKey: held, activityKey: auditKey(current.engine.record.completionAudits!.activities[3]!) });
    const pr = current.claudeCalls().at(-1)!.prompt;
    expect(pr).toContain('"I accept the remaining Weak rows after the last test audit loop." (the person\'s words, chosen on Documents found at');
    expect(pr).toContain('"I accept the remaining Weak rows." (the person\'s words, given on the run\'s page at');
    expect(pr).toContain("- The last session's summary: Fixture audit found nothing left.");
  });

  it("Allow at a stop holding saved test work starts the next test loop, which quotes the earlier Accept sentence", { timeout: 240_000 }, async () => {
    const current = await fixture([auditSession(), auditSession({ continueTest: true }), auditSession({ continueTest: true }), auditSession({ continueTest: true }), auditSession(), auditSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "stop_and_ask" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    // Accept at the first stop; that session saves test work again, so Kiln stops holding it.
    expect((await control(current, "accept-and-deliver", { via: "browser" })).outcome).toBe("acceptance_recorded");
    await current.engine.settled();
    const audits = current.engine.record.completionAudits!.activities;
    expect(audits).toHaveLength(4);
    const held = auditKey(audits[3]!);
    expect(current.engine.record.phases[held]!.stop).toMatchObject({ kind: "loop_limit", loop: { kind: "test", reason: "test_work_saved", heldAuditKey: held } });
    expect(buildSnapshot(current.engine).auditLoops!.stop).toMatchObject({ holds: true, heading: "Test audit loops used: 1 of 1" });
    // Allow 1: the limit is 1 again, the count restarts, and the next test audit is a loop on the held report.
    expect(await control(current, "allow-more-loops", { count: 1 })).toMatchObject({ state: "completed", outcome: "loops_allowed" });
    await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    expect(current.engine.record.auditLoops!.epochs.at(-1)).toMatchObject({ kind: "test", cause: "allowed", limit: 1, heldAuditKey: held });
    const after = current.engine.record.completionAudits!.activities;
    expect(after).toHaveLength(5);
    const loops = current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "test");
    expect(loops.map(loop => [loop.number, loop.limitAtStart, loop.activityKeys])).toEqual([[1, 1, [auditKey(audits[2]!)]], [1, 1, [auditKey(after[4]!)]]]);
    const prompt = auditPrompts(current).at(-1)!.prompt;
    expect(prompt).toContain("Earlier in this run the person accepted what was left, in their own words:");
    expect(prompt).toContain('"I accept the remaining Weak rows."');
    expect(prompt).not.toContain("The person pressed Accept what is left and deliver.");
  });

  it("a limit raised in the settings starts the held test loop at the next kiln run, not by itself", { timeout: 240_000 }, async () => {
    const current = await fixture([auditSession(), auditSession({ continueTest: true }), auditSession({ continueTest: true }), auditSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "stop_and_ask" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const held = auditKey(current.engine.record.completionAudits!.activities[2]!);
    expect(current.engine.record.phases[held]!.stop!.kind).toBe("loop_limit");
    expect((await control(current, "settings", { test_audit_loops: 2 })).state).toBe("completed");
    await current.engine.settled();
    expect(current.engine.record.completionAudits!.activities).toHaveLength(3);
    // The run is stopped and reopened, as a fresh `kiln run` would.
    current.engine.close();
    const again = current.reopenFromDisk(); await again.agents.refresh();
    await server!.close(); release?.(); const hosted = await startFixtureController({ engine: again, folderName: "proof", featureName: "Audit value", token: again.record.token }); server = hosted.server; release = hosted.release;
    expect(await again.decide({ review: true })).toMatchObject({ kind: "start_audit", label: "Test audit" });
    expect(await again.start()).toEqual({ ok: true }); await again.settled();
    expect(again.record.completedAt, JSON.stringify(again.record.phases)).toBeTruthy();
    expect(again.record.auditLoops!.loops.filter(loop => loop.kind === "test").map(loop => [loop.number, loop.limitAtStart, loop.last])).toEqual([[1, 1, true], [2, 2, true]]);
  });

  it("a limit lowered while a test loop runs stops the run at the next decision, and the reopened run reads the same stop", { timeout: 180_000 }, async () => {
    const current = await fixture([auditSession(), auditSession({ continueTest: true }), auditSession({ continueTest: true }), auditSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 2, afterLastTest: "stop_and_ask" } });
    let lowered = false;
    const off = current.engine.onChange(() => {
      if (!lowered && current.engine.current?.session?.kind === "test_audit" && current.engine.record.completionAudits!.activities.length === 3) { lowered = true; void current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "stop_and_ask" } }); }
    });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled(); off();
    expect(lowered).toBe(true);
    const audits = current.engine.record.completionAudits!.activities;
    expect(audits).toHaveLength(3);
    expect(current.engine.record.phases[auditKey(audits[2]!)]!.stop).toMatchObject({ kind: "loop_limit", loop: { reason: "test_work_saved" } });
    const prompt = auditPrompts(current)[2]!.prompt;
    expect(prompt).not.toContain("No more test audit loops follow");
    // Reopened: the record reads back the same stop.
    const again = h!.reopenFromDisk(); await again.agents.refresh();
    expect((await again.decide()).kind).toBe("needs_you");
    expect(again.loopStopOf(auditKey(audits[2]!))).toMatchObject({ kind: "test", reason: "test_work_saved" });
  });
});

describe("loop stops that hold nothing (AC-TEST-02, AC-STOP-02)", () => {
  it("a needs_you test report with no loop left is a loop stop, and Allow starts a counted session on that audit", { timeout: 180_000 }, async () => {
    const current = await fixture([auditSession(), auditSession({ continueTest: true }), auditSession({ blocked: true }), auditSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "stop_and_ask" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const audits = current.engine.record.completionAudits!.activities;
    const stopped = auditKey(audits[2]!);
    expect(current.engine.record.phases[stopped]!.stop!.kind).toBe("done_check");
    expect(current.engine.loopStopOf(stopped)).toEqual({ kind: "test", reason: "items_listed", heldAuditKey: stopped });
    const snapshot = buildSnapshot(current.engine);
    expect(snapshot.auditLoops!.stop).toMatchObject({ heading: "Test audit loops used: 1 of 1", holds: false, audit: { items: [{ name: "Required evidence is unavailable", problem: "Required evidence is unavailable.", action: "Restore the named evidence." }] }, acceptSentence: "I accept the remaining Weak rows, and Required evidence is unavailable." });
    // Mark complete stays offered where a check fails; a raised limit removes the loop page at once.
    expect(current.engine.controlView().controls.find(c => c.name === "allow-more-loops")!.available).toBe(true);
    await current.engine.changeSettings({ auditLoops: { testLimit: 2 } as never });
    expect(current.engine.loopStopOf(stopped)).toBeUndefined();
    expect(current.engine.controlView().controls.find(c => c.name === "allow-more-loops")).toMatchObject({ available: false, reason: "Kiln isn't stopped because its audit loops are used up." });
    await current.engine.changeSettings({ auditLoops: { testLimit: 1 } as never });
    const allowed = await control(current, "allow-more-loops", { count: 1 });
    expect(allowed).toMatchObject({ state: "completed", outcome: "session_started", effects: { session: "started" } });
    await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    // The same activity holds both loops: the one that wrote the report, then the one Allow started.
    const activity = current.engine.record.completionAudits!.activities[2]!;
    expect(activity.sessionIds).toHaveLength(2);
    const loops = current.engine.record.auditLoops!.loops.filter(loop => loop.activityKeys.includes(stopped));
    expect(loops.map(loop => [loop.number, loop.limitAtStart, loop.last, loop.sessionId])).toEqual([[1, 1, true, activity.sessionIds[0]], [1, 1, true, activity.sessionIds[1]]]);
    const prompt = auditPrompts(current).at(-1)!.prompt;
    expect(prompt).toContain("The person allowed more test audit loops to fix what the previous test audit listed:\n- Required evidence is unavailable. Restore the named evidence.");
    expect(prompt).toContain("No more test audit loops follow this session");
    const row = buildSnapshot(current.engine).activities!.find(r => r.id === stopped)!;
    expect(row.loops!.map(loop => loop.sessionId)).toEqual(activity.sessionIds);
  });
});

describe("items listed on a passing report (AC-TEST-02, AC-STOP-02)", () => {
  it("stops once with the items, then Check again runs the delivery audit and an uncounted test round", { timeout: 240_000 }, async () => {
    const decision = "AC-PROOF-01 names a file the design kept.";
    const current = await fixture([auditSession({ gap: true, decision }), auditSession({ relist: true }), auditSession({ continueTest: true, relist: true }), auditSession({ relist: true, directFix: true }), auditSession({ relist: true }), auditSession({ settle: "The person kept the design's file." })], [landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const audits = current.engine.record.completionAudits!.activities;
    expect(audits.map(a => a.kind)).toEqual(["delivery_audit", "delivery_audit", "test_audit", "test_audit"]);
    const held = auditKey(audits[3]!);
    expect(current.engine.record.phases[held]!.doneAt).toBeDefined();
    expect(current.engine.record.phases[held]!.stop).toMatchObject({ kind: "loop_limit", loop: { kind: "test", reason: "items_listed", heldAuditKey: held } });
    expect(current.engine.record.auditLoops!.itemsListedStops).toEqual([held]);
    const snapshot = buildSnapshot(current.engine);
    expect(snapshot.auditLoops!.stop).toMatchObject({ holds: false, audit: { items: [{ problem: expect.stringContaining(decision) }] } });
    // No disabled Mark complete: today's refusal with no awaitingRecheck.
    expect(snapshot.needsYou!.markComplete).toMatchObject({ offered: false });
    expect(snapshot.needsYou!.markComplete).not.toHaveProperty("awaitingRecheck");
    await control(current, "check-again");
    await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    expect(current.engine.record.completionAudits!.activities.map(a => a.kind)).toEqual(["delivery_audit", "delivery_audit", "test_audit", "test_audit", "delivery_audit", "test_audit"]);
    // The new round is not a loop, and its prompt still says no test loop follows.
    expect(current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "test")).toHaveLength(1);
    expect(auditPrompts(current).at(-1)!.prompt).toContain("No more test audit loops follow this session");
  });

  it("an uncounted test round that saves test work once no test loop is left stops at Needs you instead of going on", { timeout: 240_000 }, async () => {
    const decision = "AC-PROOF-01 names a file the design kept.";
    const current = await fixture([auditSession({ gap: true, decision }), auditSession({ relist: true }), auditSession({ continueTest: true, relist: true }), auditSession({ relist: true, directFix: true }), auditSession({ relist: true }), auditSession({ continueTest: true, settle: "Kept." }), auditSession()], [landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    await control(current, "check-again");
    await current.engine.settled();
    const audits = current.engine.record.completionAudits!.activities;
    expect(audits.map(a => a.kind)).toEqual(["delivery_audit", "delivery_audit", "test_audit", "test_audit", "delivery_audit", "test_audit"]);
    const held = auditKey(audits[5]!);
    expect(current.engine.record.completedAt).toBeUndefined();
    expect(current.engine.record.phases[held]!.stop, JSON.stringify(current.engine.record.phases[held]!.stop)).toMatchObject({ kind: "loop_limit", loop: { kind: "test", reason: "test_work_saved", heldAuditKey: held } });
    // The round was not a loop, and no continuation was started for its saved work.
    expect(current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "test")).toHaveLength(1);
    expect(auditPrompts(current)).toHaveLength(6);
    expect(buildSnapshot(current.engine).auditLoops!.stop).toMatchObject({ kind: "test", holds: true, heading: "Test audit loops used: 1 of 1" });
  });

  it("an uncounted test round whose report needs a person once no test loop is left is a loop stop listing every item", { timeout: 240_000 }, async () => {
    const decision = "AC-PROOF-01 names a file the design kept.";
    const current = await fixture([auditSession({ gap: true, decision }), auditSession({ relist: true }), auditSession({ continueTest: true, relist: true }), auditSession({ relist: true, directFix: true }), auditSession({ relist: true }), auditSession({ blocked: true, relist: true }), auditSession()], [landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    await control(current, "check-again");
    await current.engine.settled();
    const audits = current.engine.record.completionAudits!.activities;
    expect(audits.map(a => a.kind)).toEqual(["delivery_audit", "delivery_audit", "test_audit", "test_audit", "delivery_audit", "test_audit"]);
    const held = auditKey(audits[5]!);
    expect(current.engine.record.completedAt).toBeUndefined();
    expect(current.engine.record.phases[held]!.stop!.kind).toBe("done_check");
    expect(current.engine.loopStopOf(held)).toEqual({ kind: "test", reason: "items_listed", heldAuditKey: held });
    expect(current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "test")).toHaveLength(1);
    expect(buildSnapshot(current.engine).auditLoops!.stop).toMatchObject({ kind: "test", holds: false, audit: { items: [{ problem: "Required evidence is unavailable." }, { problem: expect.stringContaining(decision) }] } });
  });
});

describe("upgrade (AC-LOOP-07, RUN-002) and continuation (AC-LOOP-04, RUN-003)", () => {
  it("a schema-21 run counts the loops it made, runs under Always stop and ask me, and stops at its first decision", { timeout: 180_000 }, async () => {
    const current = await fixture([auditSession(), ...Array.from({ length: 5 }, () => auditSession({ continueTest: true })), auditSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 10, afterLastTest: "deliver_unless_serious" } });
    // Pause during the fourth continuation, so the run is "upgraded" from schema 21 with a fifth allocated and pending.
    let paused = false;
    const off = current.engine.onChange(() => { if (!paused && current.engine.record.completionAudits!.activities.length === 5 && current.engine.current?.session?.kind === "test_audit") { paused = true; current.engine.pause(); } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled(); off();
    expect(current.engine.record.completionAudits!.activities).toHaveLength(6);
    current.engine.close();
    const saved = readPrdRecord(current.stateDirectory)!;
    delete saved.auditLoops; delete saved.settings.auditLoops; saved.schemaVersion = 21;
    writePrdRecord(current.stateDirectory, saved);
    const again = current.reopenFromDisk(); await again.agents.refresh();
    expect(again.record.settings.auditLoops).toEqual({ deliveryLimit: 3, testLimit: 3, afterLastTest: "stop_and_ask", afterLastTestSource: { kind: "kiln_for_earlier_run" } });
    // The pending fifth continuation was allocated before the upgrade, so it is already counted.
    expect(again.record.auditLoops!.loops.map(loop => [loop.kind, loop.number, loop.observed, loop.last])).toEqual([1, 2, 3, 4].map(n => ["test", n, true, false]));
    expect(buildSnapshot(again).auditLoops).toMatchObject({ test: { used: 4, limit: 3 } });
    // It runs, and its prompt carries the Kiln-applied choice.
    await again.start(); await again.settled();
    const last = auditPrompts(current).at(-1)!.prompt;
    expect(last).toContain("Always stop and ask me (applied by Kiln because this run began before the setting existed)");
    expect(last).not.toContain("I accept the remaining Weak rows");
    const audits = again.record.completionAudits!.activities;
    expect(again.record.phases[auditKey(audits.at(-1)!)]!.stop).toMatchObject({ kind: "loop_limit", loop: { reason: "test_work_saved" } });
    expect(buildSnapshot(again).auditLoops!.stop!.heading).toBe("Test audit loops used: 4 of 3");
    const rows = buildSnapshot(again).activities!.filter(row => row.kind === "test_audit");
    expect(rows.map(row => row.loops?.at(-1)?.number)).toEqual([undefined, 1, 2, 3, 4]);
    expect(rows.at(-1)!.loops!.at(-1)).toMatchObject({ number: 4, limit: 3, last: false, observed: true });
    expect(rows.every(row => !row.loops?.some(loop => loop.last))).toBe(true);
    expect(rows[1]!.loops![0]!.did).toContain("counted from this run's history when Kiln was upgraded");
  });
});

describe("Documents found and Start (AC-LOOP-01, AC-LOOP-04, AC-EFFORT-01)", () => {
  it("a new PRD starts with the defaults and Claude Code at Medium; Start opens both counts and records the person's choice", async () => {
    h = await createHarness({ folder: "proof", files, sessions: [pullRequestSession()] });
    expect(h.engine.record.settings.auditLoops).toEqual({ deliveryLimit: 3, testLimit: 3, afterLastTest: "deliver_unless_serious" });
    expect(h.engine.record.settings.agentChoices.claude_code?.effort).toBe("medium");
    expect(buildSnapshot(h.engine).auditLoops).toMatchObject({ settings: { deliveryLimit: 3, testLimit: 3, afterLastTest: "deliver_unless_serious" }, delivery: { used: 0, limit: 3 }, test: { used: 0, limit: 3 } });
    expect(await h.engine.changeSettings({ auditLoops: { deliveryLimit: 0 } as never })).toMatchObject({ ok: false, status: 422, fieldErrors: { deliveryLimit: "Enter a whole number of 1 or more." } });
    expect((await h.engine.changeSettings({ auditLoops: { testLimit: 5, afterLastTest: "stop_and_ask" } as never })).ok).toBe(true);
    expect(h.engine.record.settings.auditLoops!.afterLastTestSource).toBeUndefined();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.settings.auditLoops).toMatchObject({ deliveryLimit: 3, testLimit: 5, afterLastTest: "stop_and_ask", afterLastTestSource: { kind: "person", where: "documents_found", at: h.engine.record.startedAt } });
    expect(h.engine.record.auditLoops!.epochs.map(e => [e.kind, e.cause])).toEqual([["delivery", "start"], ["test", "start"]]);
    const saved = readPrdRecord(h.stateDirectory)!;
    expect(saved.schemaVersion).toBe(22);
  });
});

describe("the stop controls through every entry (AC-STOP-02, AC-STOP-03, AC-LOOP-06, RUN-001)", () => {
  it("Accept at a needs_you stop starts an uncounted session on the stopped audit that quotes the sentence naming the criterion", { timeout: 180_000 }, async () => {
    const current = await fixture([auditSession(), auditSession({ continueTest: true }), auditSession({ blocked: true, criterion: "AC-PROOF-01" }), auditSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "stop_and_ask" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const stopped = auditKey(current.engine.record.completionAudits!.activities[2]!);
    // The person's own choice of Always stop and ask me is said on the last loop, with no sentence quoted.
    const last = auditPrompts(current)[2]!.prompt;
    expect(last).toContain("The person's choice for after the last test audit loop: Always stop and ask me.");
    expect(last).not.toContain("I accept the remaining Weak rows");
    expect(buildSnapshot(current.engine).auditLoops!.stop).toMatchObject({ acceptSentence: "I accept the remaining Weak rows, and AC-PROOF-01.", audit: { items: [{ name: "AC-PROOF-01" }] } });
    const accepted = await control(current, "accept-and-deliver", { via: "command_line" });
    expect(accepted).toMatchObject({ state: "completed", outcome: "session_started", effects: { session: "started" } });
    await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    const activity = current.engine.record.completionAudits!.activities[2]!;
    expect(current.engine.record.completionAudits!.activities).toHaveLength(3);
    expect(current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "test")).toHaveLength(1);
    expect(current.engine.record.auditLoops!.acceptances).toEqual([expect.objectContaining({ via: "command_line", heldAuditKey: stopped, sentence: "I accept the remaining Weak rows, and AC-PROOF-01.", activityKey: stopped, sessionId: activity.sessionIds[1], firstAttempt: expect.any(Number), items: [expect.objectContaining({ criterion: "AC-PROOF-01", name: "AC-PROOF-01", problem: "Required evidence is unavailable." })] })]);
    const prompt = auditPrompts(current).at(-1)!.prompt;
    expect(prompt).toMatch(/The person pressed Accept what is left and deliver\. Their words, given with the command line at [^:]+:\d\d UTC:\n"I accept the remaining Weak rows, and AC-PROOF-01\."/);
    expect(prompt).toContain("- AC-PROOF-01 · Required evidence is unavailable. Restore the named evidence.");
    expect(prompt).toContain("Fix nothing in this session.");
    // Both sessions on the activity show what they carried.
    expect(buildSnapshot(current.engine).activities!.find(row => row.id === stopped)!.carried).toEqual([{ sentence: "I accept the remaining Weak rows, and AC-PROOF-01.", source: expect.stringMatching(/^given with the command line at /) }]);
  });

  it("Accept after a passing report that changed implementation runs the delivery audit first, then an uncounted round quoting the criterion kept through relisting", { timeout: 240_000 }, async () => {
    const decision = "AC-PROOF-01 names a file the design kept.";
    const current = await fixture([auditSession({ gap: true, decision, criterion: "AC-PROOF-01" }), auditSession({ relist: true }), auditSession({ continueTest: true, relist: true }), auditSession({ relist: true, directFix: true }), auditSession({ relist: true }), auditSession({ settle: "Accepted by the person." })], [landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const held = auditKey(current.engine.record.completionAudits!.activities[3]!);
    expect(current.engine.record.phases[held]!.stop).toMatchObject({ kind: "loop_limit", loop: { reason: "items_listed" } });
    expect(buildSnapshot(current.engine).auditLoops!.stop!.acceptSentence).toBe("I accept the remaining Weak rows, and AC-PROOF-01.");
    expect((await control(current, "accept-and-deliver", { via: "browser" })).outcome).toBe("acceptance_recorded");
    await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    const audits = current.engine.record.completionAudits!.activities;
    expect(audits.map(a => a.kind)).toEqual(["delivery_audit", "delivery_audit", "test_audit", "test_audit", "delivery_audit", "test_audit"]);
    expect(current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "test")).toHaveLength(1);
    expect(current.engine.record.auditLoops!.acceptances[0]).toMatchObject({ heldAuditKey: held, activityKey: auditKey(audits[5]!), items: [{ id: "item-1", criterion: "AC-PROOF-01" }] });
    const prompts = auditPrompts(current);
    // The delivery audit in between is not given the Accept; the round after it is.
    expect(prompts[4]!.prompt).not.toContain("The person pressed Accept");
    expect(prompts[5]!.prompt).toContain("The person pressed Accept what is left and deliver.");
    expect(prompts[5]!.prompt).toContain("- item-1: AC-PROOF-01 · ");
    expect(prompts[5]!.prompt).toContain("listed by Delivery audit round 1; criterion AC-PROOF-01");
    expect(current.claudeCalls().at(-1)!.prompt).toContain('"I accept the remaining Weak rows, and AC-PROOF-01."');
  });

  it("a reply at a stop on items listed clears it with no conversation resumed, and the run carries on uncounted", { timeout: 240_000 }, async () => {
    const decision = "AC-PROOF-01 names a file the design kept.";
    const current = await fixture([auditSession({ gap: true, decision }), auditSession({ relist: true }), auditSession({ continueTest: true, relist: true }), auditSession({ relist: true, directFix: true }), auditSession({ relist: true }), auditSession({ settle: "Kept." })], [landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 1, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const calls = current.claudeCalls().length;
    const reply = await control(current, "reply", { message: "Leave it for now." });
    expect(reply).toMatchObject({ state: "completed", outcome: "advanced_reply_not_sent" });
    await current.engine.settled();
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(current.claudeCalls().slice(calls).some(call => call.args.includes("--resume"))).toBe(false);
    expect(current.claudeCalls().slice(calls).some(call => call.prompt.includes("Leave it for now."))).toBe(false);
    expect(current.engine.record.auditLoops!.loops.filter(loop => loop.kind === "test")).toHaveLength(1);
  });

  it("the page's routes allow more loops and record a choice as the run page's, and a control interrupted before its write settles not_applied", { timeout: 180_000 }, async () => {
    const current = await fixture([auditSession({ gap: true }), auditSession({ gap: true }), auditSession(), auditSession()], [landing(), landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 3, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const held = auditKey(current.engine.record.completionAudits!.activities[1]!);
    const origin = new URL(server!.address).origin;
    const headers = () => ({ "X-Kiln-Token": current.engine.record.token, Origin: new URL(origin).origin, "Content-Type": "application/json", "X-Kiln-Status": current.engine.controlView().token });
    // A choice changed on the run's page is the person's, from the run's page.
    const changed = await fetch(`${origin}/api/settings`, { method: "POST", headers: headers(), body: JSON.stringify({ auditLoops: { afterLastTest: "stop_and_ask" } }) });
    expect(changed.status).toBe(200);
    expect(current.engine.record.settings.auditLoops).toMatchObject({ afterLastTest: "stop_and_ask", afterLastTestSource: { kind: "person", where: "run_page" } });
    expect((await fetch(`${origin}/api/settings`, { method: "POST", headers: headers(), body: JSON.stringify({ auditLoops: { testLimit: 0 } }) })).status).toBe(422);
    // Accept is refused at a delivery loop stop.
    const refused = await fetch(`${origin}/api/accept-and-deliver`, { method: "POST", headers: { ...headers(), "X-Kiln-Command-Id": "page-accept" }, body: "{}" });
    expect(await refused.json()).toMatchObject({ ok: false, code: "not_at_loop_stop" });
    // Allow interrupted before its record write: a restarted Kiln settles it not_applied and the stop stays.
    let unblock!: () => void;
    const hold = new Promise<void>(resolve => { unblock = resolve; });
    const engine = current.engine as unknown as { loopControl: (...args: unknown[]) => Promise<unknown> };
    const spy = vi.spyOn(engine, "loopControl").mockImplementation(async () => { await hold; return { ok: false, code: "busy" }; });
    current.engine.commands.submit({ command_id: "crash-allow", execution_id: current.engine.record.executionId!, status_token: current.engine.controlView().token, action: "allow-more-loops", inputs: { count: 2 } }, "caller", true);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(spy).toHaveBeenCalledOnce();
    const reopened = current.reopenFromDisk(); await reopened.agents.refresh();
    expect(reopened.commands.all().find(r => r.command_id === "crash-allow")).toMatchObject({ state: "failed", stage: "settled", outcome: "not_applied", effects: { session: "not_started", plan: "not_advanced" } });
    expect(reopened.record.phases[held]!.stop!.kind).toBe("loop_limit");
    expect(reopened.record.settings.auditLoops!.deliveryLimit).toBe(1);
    unblock(); spy.mockRestore();
    await server!.close(); release?.(); const hosted = await startFixtureController({ engine: reopened, folderName: "proof", featureName: "Audit value", token: reopened.record.token }); server = hosted.server; release = hosted.release;
    // The page's Allow, with its status token and command id.
    const page = new URL(server!.address).origin;
    const allowed = await fetch(`${page}/api/allow-more-loops`, { method: "POST", headers: { "X-Kiln-Token": reopened.record.token, Origin: new URL(page).origin, "Content-Type": "application/json", "X-Kiln-Status": reopened.controlView().token, "X-Kiln-Command-Id": "page-allow" }, body: JSON.stringify({ count: 2 }) });
    expect(await allowed.json()).toMatchObject({ ok: true, outcome: "loops_allowed" });
    await reopened.settled();
    expect(reopened.record.completedAt, JSON.stringify(reopened.record.phases)).toBeTruthy();
  });

  it("Mark complete at a failing check forecasts the loop stop, then holds there without allowing a loop (RUN-001)", { timeout: 180_000 }, async () => {
    const stray = { actions: [{ auditReport: { gap: true } }, { write: { path: "stray.txt", content: "stray\n" } }, { result: "Audit ended." }, { exit: 0 }] };
    const current = await fixture([auditSession({ gap: true }), stray, auditSession(), auditSession()], [landing(), landing(), pullRequestSession()]);
    await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 3, afterLastTest: "deliver_unless_serious" } });
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const key = auditKey(current.engine.record.completionAudits!.activities[1]!);
    expect(current.engine.record.phases[key]!.stop!.kind).toBe("done_check");
    await control(current, "check-again");
    const offer = current.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    expect(offer.nextActivity).toEqual({ kind: "loop_stop", key, title: "Delivery audit loop stop" });
    expect(offer.sentence.join(" ")).toContain("then stops at Needs you because no delivery audit loop is left to build the phases it added");
    const marked = await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" });
    expect(marked.outcome).toBe("marked_complete");
    expect(current.engine.record.phases[key]).toMatchObject({ doneAt: expect.any(String), stop: { kind: "loop_limit", loop: { kind: "delivery", reason: "phases_added" } } });
    expect(current.engine.record.settings.auditLoops!.deliveryLimit).toBe(1);
  });
});
