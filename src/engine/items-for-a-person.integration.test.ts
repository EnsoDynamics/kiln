// Kiln Deliver When Audit Loops Run Out, Phase 2 (items for a person) with real Git, scripted
// provider sessions writing version-2 reports and the packaged CLI submitting them. No paid model
// calls. Each item an audit lists gives its kind; only a critical finding the next step would worsen
// stops at once, a blocker or business question holds the run short of the pull request until a
// person presses Continue anyway, and everything else goes on and is listed under For you.
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHarness, landingSession, pullRequestSession, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { buildSnapshot } from "./snapshot.js";
import { headerState } from "../../view/src/lib/progress.js";
import { auditKey } from "../audit/workflow.js";
import { HOLD_CHECK } from "./waivers.js";
import { statusProjection } from "../control/projection.js";
import { personItemsText } from "../control/waiver-facts.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";
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
const blocker = { kind: "blocker", problem: "The sandbox API key is not set.", action: "Add SANDBOX_KEY to the repository secrets.", waitsOn: "Delivery: the pull request's checks need it." };
const prompts = (current: Harness) => current.claudeCalls().map(call => call.prompt);
const pullRequests = (current: Harness) => prompts(current).filter(prompt => prompt.includes("Open each pull request's description with the block below"));
// The pull request session's prompt: the one that carries the block each description opens with.
const pullRequestPrompt = (current: Harness) => { const found = prompts(current).filter(prompt => prompt.includes("Open each pull request's description with the block below")); expect(found).toHaveLength(1); return found[0]!; };
let commands = 0;
async function control(current: Harness, action: string, inputs: Record<string, unknown> = {}): Promise<Receipt> {
  const command_id = `items-${++commands}`;
  const answer = current.engine.commands.submit({ command_id, execution_id: current.engine.record.executionId!, status_token: current.engine.controlView().token, action, inputs });
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await current.engine.commands.settled(); await current.engine.settled();
  return current.engine.commands.lookup(command_id).operation as Receipt;
}

describe("only an item the work cannot go on without stops the run (AC-ITEM-01, AC-ITEM-02)", () => {
  it("stops at once for a critical finding the next step would worsen, showing each item's kind, effect and what waits on it", { timeout: 180_000 }, async () => {
    const critical = { kind: "critical_next_step", problem: "The pull request would publish the production key.", action: "Rotate the key and remove it from config.mjs.", waitsOn: "The pull request." };
    const current = await fixture([audit({ outcome: "needs_you", items: [critical, { kind: "other", problem: "Logging changed outside the requirements.", action: "Record the change." }] })]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const key = auditKey(current.engine.record.completionAudits!.activities[0]!);
    expect(current.engine.stoppedPhaseKey()).toBe(key);
    expect(current.engine.record.pullRequests ?? []).toEqual([]);
    const snapshot = buildSnapshot(current.engine);
    expect(snapshot.items).toEqual([
      { kind: "critical_next_step", words: "Critical finding", problem: critical.problem, action: critical.action, waitsOn: critical.waitsOn, effect: "stops" },
      { kind: "other", words: null, problem: "Logging changed outside the requirements.", action: "Record the change.", effect: "goes_on" },
    ]);
    // kiln status shows the same items, in JSON and in text (AC-ITEM-02).
    const status = statusProjection(readWork(stateRoot(current.env), current.stateDirectory), current.engine) as unknown as { items: Record<string, unknown>[] };
    expect(status.items).toEqual([
      { id: null, kind: "critical_next_step", words: "Critical finding", problem: critical.problem, action: critical.action, waits_on: critical.waitsOn, criterion: null, effect: "stops" },
      { id: null, kind: "other", words: null, problem: "Logging changed outside the requirements.", action: "Record the change.", waits_on: null, criterion: null, effect: "goes_on" },
    ]);
    // The status line names the step that listed the items: the audit and its loop (AC-ITEM-02, AC-STOP-05).
    expect(headerState(snapshot, true, new Date())).toMatchObject({ label: "Needs you", facts: ["Delivery audit loop 1 of 4", expect.stringMatching(/^Stopped /)] });
    expect(personItemsText(status.items)).toBe(`Kiln needs you for 2 things:\n  Critical finding (stops the run): ${critical.problem} ${critical.action}\n    What waits on it: ${critical.waitsOn}\n  Other (Kiln goes on): Logging changed outside the requirements. Record the change.`);
  });

  it("builds the phases a blocker sits beside, holds the run before the pull request, and goes on only after Check again and Continue anyway", { timeout: 240_000 }, async () => {
    // Delivery audit 1 of 1 adds a phase and lists a blocker its phase does not need; the test audit relists it by id alone.
    const current = await fixture([audit({ gap: true, items: [blocker] }), audit({ relist: true })], [landing(), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    // The phase was built and the test audit ran; the hold stop is on the pull request step, before any pull request.
    expect(current.engine.record.phases["2"]?.doneAt).toBeTruthy();
    expect(current.engine.record.completionAudits!.activities.map(a => a.kind)).toEqual(["delivery_audit", "test_audit"]);
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    const stop = current.engine.record.phases.pr!.stop!;
    expect(stop.kind).toBe("selection");
    expect(stop.checks).toMatchObject([{ name: HOLD_CHECK, passed: false, items: [{ kind: "other", subject: "item-1", against: "item-1", // The fixture relists with the item's whole line as its problem and "Still open." as its action.
      text: `Blocker: ${blocker.problem} ${blocker.action} Still open. Waits on: ${blocker.waitsOn}` }] }]);
    expect(current.engine.record.pullRequests ?? []).toEqual([]);
    expect(prompts(current).some(prompt => /Opened #/.test(prompt))).toBe(false);
    // The status line names the pull request step, which listed the items at the hold stop (AC-ITEM-02).
    const held = buildSnapshot(current.engine);
    expect(headerState(held, true, new Date()).facts[0]).toBe(`PR · ${held.phases.find(row => row.id === "pr")!.title}`);
    // The relisting kept the kind and what waits on it (AC-ITEM-02).
    expect(buildSnapshot(current.engine).items).toEqual([{ id: "item-1", kind: "blocker", words: "Blocker", problem: expect.stringContaining(blocker.problem), action: "Still open.", waitsOn: blocker.waitsOn, effect: "holds" }]);
    // Continue anyway is offered with its own heading, unusable until a Check again (AC-WAIVE-02 as AC-ITEM-01 replaces it).
    const before = current.engine.markCompleteOffer();
    expect(before).toMatchObject({ offered: false, awaitingRecheck: { label: "Continue anyway", heading: "You’ve provided what’s listed above, and want Kiln to deliver?" } });
    await control(current, "check-again");
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    const offer = current.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, label: "Continue anyway", continueInOrder: true, hold: "pull_request_session", nextActivity: null,
      sentence: ["Continue anyway. Kiln records each item above as waived, never as settled, and starts the pull request session. The items stay open and are listed under For you, each marked Waived."] });
    if (!offer.offered) throw new Error("not offered");
    const receipt = await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "command_line", by: "ops-bot" });
    expect(receipt).toMatchObject({ outcome: "continued" });
    // The pull request session ran and the run completed; the item stays open, marked Waived, never settled.
    expect(current.engine.record.completedAt).toBeTruthy();
    const waiver = current.engine.record.waivers!.at(-1)!;
    expect(waiver).toMatchObject({ activityKey: "pr", effect: "continued", items: [{ check: HOLD_CHECK, subject: "item-1", against: "item-1" }] });
    expect(current.engine.record.phases.pr?.waiverWarning).toBeUndefined();
    const forYou = buildSnapshot(current.engine).delivered!.forYou;
    expect(forYou.items).toMatchObject([{ id: "item-1", kind: "blocker", line: expect.stringMatching(/^Blocker: /), waiver: { waiverId: waiver.waiverId, activityKey: "pr", via: "command_line", by: "ops-bot" } }]);
    const block = pullRequestPrompt(current);
    expect(block).toContain(`## For you\n\n- ${forYou.items[0]!.line} (Waived: waived at Final delivery, `);
    expect(block).not.toContain("Settled during the build");
    // It does not stop on the waived item again.
    expect(Object.values(current.engine.record.phases).filter(facts => facts.stop)).toEqual([]);
  });
});

describe("Continue anyway when the work is already delivered (AC-ITEM-01)", () => {
  it("completes the run with no pull request session, in its own words, with the item under For you marked Waived", { timeout: 240_000 }, async () => {
    const current = await fixture([audit({ gap: true, items: [blocker] }), audit({ relist: true })], [landing(), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    // The feature branch is merged into its base while the run waits at the hold stop.
    git(current.sandbox, current.engine.worktreePath, "push", "origin", `${current.engine.record.settings.featureBranch}:develop`);
    await control(current, "check-again");
    const offer = current.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, label: "Continue anyway", hold: "complete",
      sentence: ["Continue anyway. Kiln records each item above as waived, never as settled, and completes the run, because the work is already delivered. The items stay open and are listed under For you, each marked Waived."] });
    if (!offer.offered) throw new Error(offer.reason);
    expect((await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).outcome).toBe("continued");
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(pullRequests(current)).toEqual([]);
    expect(buildSnapshot(current.engine).delivered!.forYou.items).toMatchObject([{ id: "item-1", kind: "blocker", waiver: { activityKey: "pr" } }]);
  });
});

describe("a waived item holds nothing again; a new one stops the run on its own (AC-ITEM-01)", () => {
  it("after Continue anyway reaches another audit, its prompt marks the item waived, a relisting with another kind stays covered, and a new item stops the run alone", { timeout: 300_000 }, async () => {
    const second = { kind: "business_question", problem: "Which refund rate applies?", action: "Choose the rate.", waitsOn: "Delivery." };
    const current = await fixture([audit({ gap: true, items: [blocker] }), audit({ relist: true }), audit({ relist: true, relistKind: "business_question", items: [second] })], [landing(), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    await control(current, "check-again");
    const first = current.engine.markCompleteOffer();
    if (!first.offered) throw new Error(first.reason);
    // A delivery loop raised before the pull request session starts reopens the kind: the phase built since its latest run is audited (AC-CHOICE-02).
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 2, testLimit: 1 } })).ok).toBe(true);
    expect((await control(current, "waive-and-advance", { check_run_id: first.checkRunId, via: "browser" })).outcome).toBe("continued");
    // Delivery audit loop 2 ran after the waiver and listed a new item; no pull request session has started.
    expect(current.engine.record.completionAudits!.activities.map(a => a.kind)).toEqual(["delivery_audit", "test_audit", "delivery_audit"]);
    expect(pullRequests(current)).toEqual([]);
    const resent = prompts(current).filter(prompt => prompt.startsWith("Run Delivery audit")).at(-1)!;
    expect(resent).toMatch(/- item-1 \(blocker; listed by Delivery audit round 1; waits on: [^)]*\): .* \(waived at final delivery: settle it if it is done, otherwise list it again by its id; it holds nothing and is never a reason for `needs_you`\. A need it does not name is a new entry with no id\.\)/);
    // The second arrival stops on the new item alone; the earlier one keeps its Waived tag though relisted as a business question.
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    expect(current.engine.record.completedAt).toBeUndefined();
    const row = current.engine.record.phases.pr!.stop!.checks[0]!;
    expect(row).toMatchObject({ name: HOLD_CHECK, passed: false });
    expect(row.items!.map(item => [item.subject, !!item.waiver])).toEqual([["item-1", true], ["item-2", false]]);
    expect(buildSnapshot(current.engine).items!.map(item => [item.id, item.kind, !!item.waiver])).toEqual([["item-1", "business_question", true], ["item-2", "business_question", false]]);
    // The offer follows the row: Continue anyway on the new item alone.
    await control(current, "check-again");
    expect(current.engine.markCompleteOffer()).toMatchObject({ offered: true, label: "Continue anyway", items: [{ check: HOLD_CHECK, subject: "item-2" }] });
  });
});

describe("any other item is reported with the delivery (AC-ITEM-03, AC-LAST-05)", () => {
  it("delivers with critical, test and other items open, critical first under For you in the pull request description and on the finished page", { timeout: 180_000 }, async () => {
    const items = [
      { kind: "other", problem: "Logging changed outside the requirements.", action: "Record the change in the PRD." },
      { kind: "test", problem: "AC-PROOF-01 is still Weak.", action: "Strengthen its test.", criterion: "AC-PROOF-01" },
      { kind: "critical", problem: "An old log file holds customer emails.", action: "Delete logs/2026-10.log." },
    ];
    // A test audit that changed only tests delivers with items open (the released refusal is lifted).
    const current = await fixture([audit(), audit({ items })]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    const forYou = buildSnapshot(current.engine).delivered!.forYou;
    expect(forYou.items.map(item => item.line)).toEqual([
      "Critical finding: An old log file holds customer emails. Delete logs/2026-10.log.",
      "Logging changed outside the requirements. Record the change in the PRD.",
      "Test gap: AC-PROOF-01 is still Weak. Strengthen its test.",
    ]);
    expect(forYou.items.map(item => item.words)).toEqual(["Critical finding", null, "Test gap"]);
    // Built once and copied word for word into the pull request prompt.
    expect(pullRequestPrompt(current)).toContain(`## For you\n\n${forYou.items.map(item => `- ${item.line}`).join("\n")}`);
    // No item is recorded as done that isn't: nothing settled, the test row reported (AC-LAST-05).
    expect(pullRequestPrompt(current)).not.toContain("Settled during the build");
  });
});

describe("an audit marked complete with a valid report waives the items it listed (AC-ITEM-01)", () => {
  it("lists the blocker under For you with that audit waiver's tag, marks it waived in the next audit prompt, and never holds the run on it", { timeout: 240_000 }, async () => {
    const current = await fixture([audit({ outcome: "needs_you", items: [blocker] }), audit({ relist: true })]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const deliveryKey = auditKey(current.engine.record.completionAudits!.activities[0]!);
    expect(current.engine.stoppedPhaseKey()).toBe(deliveryKey);
    await control(current, "check-again");
    const offer = current.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    expect((await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).outcome).toBe("marked_complete");
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    // The test audit's prompt marked the item waived and relisting it by id kept it covered: no hold stop.
    const testPrompt = prompts(current).find(prompt => prompt.startsWith("Run Test audit"))!;
    expect(testPrompt).toContain(`- item-1 (blocker; listed by Delivery audit round 1; waits on: ${blocker.waitsOn}): ${blocker.problem} ${blocker.action} (waived when Delivery audit round 1 was marked complete: settle it if it is done, otherwise list it again by its id; it holds nothing and is never a reason for \`needs_you\`. A need it does not name is a new entry with no id.)`);
    expect(current.engine.record.phases.pr?.stop).toBeUndefined();
    const waiver = current.engine.record.waivers!.find(one => one.activityKey === deliveryKey)!;
    expect(buildSnapshot(current.engine).delivered!.forYou.items).toMatchObject([{ id: "item-1", kind: "blocker", waiver: { waiverId: waiver.waiverId, activityKey: deliveryKey } }]);
  });
});
