// Kiln Deliver When Audit Loops Run Out, Phase 3 (report the delivered run) with real Git, scripted
// provider sessions writing version-2 reports, the gh stand-in and the control journal. No paid
// model calls. Each pull request's description opens with For you and Closing audits; a pull
// request already open, even one opened outside Kiln, gets this run's block from a pull request
// session before the run completes; the finished page and kiln status show the same loop counts.
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHarness, landingSession, pullRequestSession, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { buildSnapshot } from "./snapshot.js";
import { DESCRIPTION_CHECK, HOLD_CHECK } from "./waivers.js";
import { cacheSnapshot, statusProjection } from "../control/projection.js";
import { deliveredText } from "../control/delivered-facts.js";
import { readWork } from "../control/private-state.js";
import { previewLines } from "../control/waiver-facts.js";
import { readSessionRecord } from "../state/records.js";
import { stateRoot } from "../state/state-files.js";
import type { Receipt } from "../control/commands.js";
import type { LocalServer } from "../server/local-server.js";

let h: Harness | undefined; let server: LocalServer | undefined; let release: (() => void) | undefined;
afterEach(async () => { await server?.close(); server = undefined; release?.(); release = undefined; await h?.cleanup(); h = undefined; });
const files = {
  "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
  "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
  "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
  "value.mjs": "export const value = () => 42;\n",
  "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
};
type Sessions = NonNullable<Parameters<typeof createHarness>[0]>["sessions"];
async function fixture(auditSessions: unknown[], sessions: Sessions) {
  h = await createHarness({ folder: "proof", files, sessions, auditCycles: true });
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions }));
  const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
  server = hosted.server; release = hosted.release;
  return h;
}
const audit = (behavior: Record<string, unknown> = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
const other = { kind: "other", problem: "Logging changed outside the requirements.", action: "Record the change in the PRD." };
const blocker = { kind: "blocker", problem: "The sandbox API key is not set.", action: "Add SANDBOX_KEY to the repository secrets.", waitsOn: "Delivery: the pull request's checks need it." };
/** A pull request session that finds the pull request already open and edits its description. */
const editingSession = (exit = 0) => ({ actions: [{ result: "Edited #214's description." }, { exit }] });
const prompts = (current: Harness) => current.claudeCalls().map(call => call.prompt);
const pullRequestPrompts = (current: Harness) => prompts(current).filter(prompt => prompt.includes("Open each pull request's description with the block below"));
const CLOSING = "## Closing audits\n\nDelivery audit: 1 of 4 loops. Test audit: 1 of 4 loops.";
/** A pull request opened before the run reaches final delivery, as a person or another tool would. */
function openOutsideKiln(current: Harness, number = 214): void {
  const github = current.engine.record.repository.github;
  current.setPulls([{ number, title: "Audit value", url: `https://github.com/${github}/pull/${number}`, isDraft: false, isCrossRepository: false, headRefName: current.engine.record.settings.featureBranch, baseRefName: "develop", additions: 1, deletions: 0, commits: [], repo: github }]);
}
let commands = 0;
async function control(current: Harness, action: string, inputs: Record<string, unknown> = {}): Promise<Receipt> {
  const command_id = `delivered-${++commands}`;
  const answer = current.engine.commands.submit({ command_id, execution_id: current.engine.record.executionId!, status_token: current.engine.controlView().token, action, inputs });
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await current.engine.commands.settled(); await current.engine.settled();
  return current.engine.commands.lookup(command_id).operation as Receipt;
}
const prSessions = (current: Harness) => current.engine.record.phases.pr!.sessionIds.map(id => readSessionRecord(current.stateDirectory, "pr", id)!);
const status = (current: Harness) => statusProjection(readWork(stateRoot(current.env), current.stateDirectory), current.engine) as unknown as Record<string, unknown>;

describe("the pull request description opens with For you and Closing audits (AC-LEFT-01)", () => {
  it("gives the pull request session the block with Closing audits and no acceptance line, saves it on the session, and completes once it delivers", { timeout: 180_000 }, async () => {
    const current = await fixture([audit(), audit()], [pullRequestSession()]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    const [prompt] = pullRequestPrompts(current);
    expect(pullRequestPrompts(current)).toHaveLength(1);
    // Nothing for a person: no For you, only Closing audits, and no line quoting an acceptance sentence.
    expect(prompt).toContain(`with the block below, word for word, before anything else you write there. Where a pull request is already open, edit its description (\`gh pr edit\`) so this block replaces any block an earlier session wrote, keeping the rest.\n\n${CLOSING}`);
    expect(prompt).not.toContain("## For you");
    expect(prompt).not.toMatch(/accept/i);
    // The block was saved on the session before it ran, for its first run.
    expect(prSessions(current).map(session => session.deliveryBlock)).toEqual([{ block: CLOSING, run: 0 }]);
  });

  it("puts For you first, then Closing audits, then Settled during the build", { timeout: 180_000 }, async () => {
    const current = await fixture([audit({ items: [other] }), audit({ settle: "Recorded in the PRD.", items: [{ kind: "other", problem: "The README lags the change.", action: "Update the README." }] })], [pullRequestSession()]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const [prompt] = pullRequestPrompts(current);
    const block = prSessions(current)[0]!.deliveryBlock!.block;
    expect(prompt).toContain(block);
    const heads = ["## For you", "## Closing audits", "## Settled during the build"].map(head => block.indexOf(head));
    expect(heads.every(index => index >= 0), block).toBe(true);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
    expect(block.indexOf("## For you")).toBe(0);
  });
});

describe("a pull request already open gets this run's block before the run completes (AC-LEFT-01, AC-ITEM-01)", () => {
  it("starts a pull request session for a pull request opened outside Kiln, rather than completing at the precheck", { timeout: 180_000 }, async () => {
    const current = await fixture([audit({ items: [other] }), audit({ relist: true })], [editingSession()]);
    openOutsideKiln(current);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(pullRequestPrompts(current)).toHaveLength(1);
    const prompt = pullRequestPrompts(current)[0]!;
    expect(prompt).toContain("edit its description (`gh pr edit`) so this block replaces any block an earlier session wrote");
    expect(prompt).toContain(`## For you\n\n- ${other.problem}`);
    expect(prompt).toContain(CLOSING);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(current.engine.record.pullRequests!.map(pull => pull.number)).toEqual([214]);
    expect(prSessions(current).map(session => session.deliveryBlock)).toEqual([{ block: current.engine.deliveryBlockNow(), run: 0 }]);
  });

  it("at a hold stop with a pull request opened outside Kiln, Continue anyway starts the pull request session and the precheck does not complete the run", { timeout: 240_000 }, async () => {
    const current = await fixture([audit({ gap: true, items: [blocker] }), audit({ relist: true })], [landingSession("docs/prds/proof/value.mjs", files["value.mjs"]), editingSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1 } })).ok).toBe(true);
    openOutsideKiln(current);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    expect(current.engine.record.phases.pr!.stop!.checks.map(check => check.name)).toEqual([HOLD_CHECK]);
    await control(current, "check-again");
    const offer = current.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, label: "Continue anyway", hold: "pull_request_session",
      sentence: ["Continue anyway. Kiln records each item above as waived, never as settled, and starts the pull request session. The items stay open and are listed under For you, each marked Waived."] });
    const preview = previewLines((status(current).stop as { mark_complete: Record<string, unknown> }).mark_complete, new Date().toISOString());
    expect(preview).toContain("Kiln would then start the pull request session, with each item under For you as still open and marked Waived.");
    if (!offer.offered) throw new Error(offer.reason);
    expect(pullRequestPrompts(current)).toEqual([]);
    expect((await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).outcome).toBe("continued");
    // The waived item is in the block the session was given; only then does the run complete.
    expect(pullRequestPrompts(current)).toHaveLength(1);
    expect(pullRequestPrompts(current)[0]).toMatch(/## For you\n\n- Blocker: .* \(Waived: waived at Final delivery, /);
    expect(current.engine.record.completedAt).toBeTruthy();
  });
});

describe("a pull request session that did not deliver its block (AC-LEFT-01)", () => {
  async function stoppedOnDescription() {
    // The session opens the pull request, then exits non-zero: it did not finish its work.
    const current = await fixture([audit(), audit()], [{ actions: [{ openPullRequest: { number: 218, isDraft: false } }, { result: "Opened #218." }, { exit: 1 }] }, editingSession()]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    const stop = current.engine.record.phases.pr!.stop!;
    expect(stop.kind).toBe("pull_request_check");
    expect(stop.checks.filter(check => !check.passed).map(check => check.name)).toEqual([DESCRIPTION_CHECK]);
    expect(stop.checks.at(-1)).toMatchObject({ name: DESCRIPTION_CHECK, items: [{ kind: "other", subject: DESCRIPTION_CHECK, text: "No pull request session in this run has written this run’s For you and Closing audits into the open pull request’s description." }] });
    expect(current.engine.record.completedAt).toBeUndefined();
    return current;
  }

  it("offers Mark final delivery complete on the stop's own check, leaves out the line by Check again, and Check again starts a new session", { timeout: 180_000 }, async () => {
    const current = await stoppedOnDescription();
    const offer = current.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, label: "Mark final delivery complete", checkRunId: current.engine.record.phases.pr!.stop!.run!.id });
    expect(current.engine.record.phases.pr!.stop!.run!.origin).not.toBe("recheck");
    expect(buildSnapshot(current.engine).needsYou?.recheckRunsAll).toBeUndefined();
    await control(current, "check-again");
    expect(pullRequestPrompts(current)).toHaveLength(2);
    expect(current.engine.record.phases.pr!.sessionIds).toHaveLength(2);
    expect(current.engine.record.completedAt).toBeTruthy();
  });

  it("Mark final delivery complete completes with the row Waived and no session; a changed rerun is refused", { timeout: 180_000 }, async () => {
    const current = await stoppedOnDescription();
    const offer = current.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    const receipt = await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "command_line", by: "ops-bot" });
    expect(receipt).toMatchObject({ outcome: "marked_complete" });
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(pullRequestPrompts(current)).toHaveLength(1);
    expect(current.engine.record.auditLoops?.atPullRequest).toBeTruthy();
    const waiver = current.engine.record.waivers!.at(-1)!;
    expect(waiver).toMatchObject({ activityKey: "pr", effect: "completed", items: [{ check: DESCRIPTION_CHECK, subject: DESCRIPTION_CHECK }] });
    expect(waiver.checks.find(check => check.name === DESCRIPTION_CHECK)).toMatchObject({ passed: true, waived: true });
    // Restarting the finished run adds no description row: it stays complete and starts no session.
    const engine = current.reopenFromDisk();
    await engine.prepare();
    expect(await engine.decide()).toEqual({ kind: "complete" });
    expect(engine.record.phases.pr?.stop).toBeUndefined();
    expect(pullRequestPrompts(current)).toHaveLength(1);
  });

  it("Mark final delivery complete is refused as check_results_changed when the rerun differs from the offered check", { timeout: 180_000 }, async () => {
    const current = await stoppedOnDescription();
    const offer = current.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    // The pull request is closed meanwhile: the rerun fails Pull request open and has no description row.
    current.setPulls([]);
    const receipt = await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" });
    expect(receipt).toMatchObject({ outcome: "check_results_changed" });
    expect(current.engine.record.completedAt).toBeUndefined();
    expect(current.engine.record.waivers ?? []).toEqual([]);
  });

  it("a person's Resume carries the current block in place of the first message's, saves it for that run, and completes when the resumed run delivers", { timeout: 180_000 }, async () => {
    const current = await stoppedOnDescription();
    await control(current, "resume");
    const resumed = prompts(current).at(-1)!;
    expect(resumed).toContain(`Use this block in place of the one in the first message:\n\n${CLOSING}`);
    expect(prSessions(current)).toHaveLength(1);
    expect(prSessions(current)[0]!.deliveryBlock).toEqual({ block: CLOSING, run: 1 });
    expect(current.engine.record.completedAt).toBeTruthy();
  });
});

describe("a send-back to the audits (AC-LEFT-01)", () => {
  it("sends the run back with no description row when the pull request session changed the work and did not deliver", { timeout: 300_000 }, async () => {
    // The session commits after the audits, opens the pull request, then exits non-zero: Current completion audits fails, the description too.
    const changing = { actions: [{ write: { path: "docs/prds/proof/value.mjs", content: "export const value = () => 42; // reviewed\n" } }, { commit: "fix: value after the audits" }, { push: true }, { openPullRequest: { number: 218, isDraft: false } }, { result: "Opened #218." }, { exit: 1 }] };
    const current = await fixture([audit(), audit(), audit(), audit()], [changing, editingSession()]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    // Sent back rather than stopped on two failing rows: a second round of audits ran, then a session delivered the new block.
    expect(current.engine.record.completionAudits!.activities.map(a => [a.kind, a.round])).toEqual([["delivery_audit", 1], ["test_audit", 1], ["delivery_audit", 2], ["test_audit", 2]]);
    expect(pullRequestPrompts(current)).toHaveLength(2);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(prSessions(current).at(-1)!.deliveryBlock!.block).toContain("Delivery audit: 2 of 4 loops. Test audit: 2 of 4 loops.");
  });
});

describe("a hold stop after a pull request session already ran (AC-ITEM-01, AC-LEFT-01)", () => {
  it("offers Continue anyway, never Mark final delivery complete, and neither the waiver nor the earlier pull request completes the run", { timeout: 300_000 }, async () => {
    // The first pull request session changes the work after the audits, so its check sends the run back; the second round's delivery audit lists a blocker.
    const changing = { actions: [{ write: { path: "docs/prds/proof/value.mjs", content: "export const value = () => 42; // reviewed\n" } }, { commit: "fix: value after the audits" }, { push: true }, ...pullRequestSession().actions] };
    const current = await fixture([audit(), audit(), audit({ items: [blocker] }), audit({ relist: true })], [changing, editingSession()]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.record.completionAudits!.activities.map(a => a.kind)).toEqual(["delivery_audit", "test_audit", "delivery_audit", "test_audit"]);
    expect(pullRequestPrompts(current)).toHaveLength(1);
    // Pull request #218 is open, yet the run stops on the holding item rather than completing on it.
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    expect(current.engine.record.completedAt).toBeUndefined();
    expect(current.engine.record.phases.pr!.stop!.checks.map(check => check.name)).toEqual([HOLD_CHECK]);
    expect(current.engine.markCompleteOffer()).toMatchObject({ offered: false, awaitingRecheck: { label: "Continue anyway" } });
    await control(current, "check-again");
    const offer = current.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, label: "Continue anyway", hold: "pull_request_session" });
    if (!offer.offered) throw new Error(offer.reason);
    expect((await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).outcome).toBe("continued");
    // A second pull request session wrote the block with the waived blocker; only then did the run complete.
    expect(pullRequestPrompts(current)).toHaveLength(2);
    expect(pullRequestPrompts(current)[1]).toMatch(/## For you\n\n- Blocker: .* \(Waived: waived at Final delivery, [^\n]*\n\n## Closing audits\n\nDelivery audit: 2 of 4 loops\. Test audit: 2 of 4 loops\./);
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(current.engine.record.waivers!.map(waiver => waiver.effect)).toEqual(["continued"]);
  });
});

describe("the finished page and kiln status say the same (AC-LEFT-02, AC-BOT-02)", () => {
  it("shows each kind's loops used and limit, For you and the pull request, unchanged by a later settings change", { timeout: 180_000 }, async () => {
    const current = await fixture([audit({ items: [other] }), audit({ relist: true })], [pullRequestSession()]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.record.completedAt).toBeTruthy();
    const github = current.engine.record.repository.github;
    const expected = { loops: { delivery: { used: 1, limit: 4 }, test: { used: 1, limit: 4 } }, pullRequests: [{ repository: current.engine.record.repository.name, number: 218, url: `https://github.com/${github}/pull/218` }] };
    expect(buildSnapshot(current.engine).delivered).toMatchObject({ ...expected, forYou: { items: [{ id: "item-1", kind: "other", words: null }], afterDelivery: [] } });
    const answer = status(current);
    expect(answer.delivered).toEqual({ ...expected, forYou: { items: [{ id: "item-1", kind: "other", words: null, line: `${other.problem} ${other.action} Still open.`, problem: `${other.problem} ${other.action}`, action: "Still open.", waits_on: null, criterion: null }], afterDelivery: [] } });
    const text = deliveredText(answer.delivered as Parameters<typeof deliveredText>[0], false)!;
    expect(text.split("\n").slice(0, 3)).toEqual(["Closing audits: Delivery audit: 1 of 4 loops. Test audit: 1 of 4 loops.", `Pull request: https://github.com/${github}/pull/218`, "For you:"]);
    // The block the pull request was given carries the same line.
    expect(pullRequestPrompts(current)[0]).toContain(`- ${(answer.delivered as { forYou: { items: { line: string }[] } }).forYou.items[0]!.line}`);
    // A later settings change does not rewrite what the run had at delivery.
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 9, testLimit: 9 } })).ok).toBe(true);
    expect(buildSnapshot(current.engine).delivered!.loops).toEqual(expected.loops);
    expect((status(current).delivered as { loops: unknown }).loops).toEqual(expected.loops);
    // With the controller stopped, kiln status reads the same facts from the saved view.
    cacheSnapshot(current.engine, buildSnapshot(current.engine));
    const offline = statusProjection(readWork(stateRoot(current.env), current.stateDirectory)) as unknown as Record<string, unknown>;
    expect(offline.delivered).toEqual(status(current).delivered);
  });

  it("counts each kind on its own: different loops used and limits reach the finished page and kiln status unswapped", { timeout: 240_000 }, async () => {
    const current = await fixture([audit({ gap: true }), audit(), audit()], [landingSession("docs/prds/proof/value.mjs", files["value.mjs"]), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 3, testLimit: 5 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.record.completedAt).toBeTruthy();
    const loops = { delivery: { used: 2, limit: 3 }, test: { used: 1, limit: 5 } };
    expect(buildSnapshot(current.engine).delivered!.loops).toEqual(loops);
    const answer = status(current);
    expect((answer.delivered as { loops: unknown }).loops).toEqual(loops);
    expect(deliveredText(answer.delivered as Parameters<typeof deliveredText>[0], false)!.split("\n")[0]).toBe("Closing audits: Delivery audit: 2 of 3 loops. Test audit: 1 of 5 loops.");
  });

  it("shows For you and Closing audits for a run completed with no pull request session, its work already merged", { timeout: 240_000 }, async () => {
    const current = await fixture([audit({ gap: true, items: [blocker] }), audit({ relist: true })], [landingSession("docs/prds/proof/value.mjs", files["value.mjs"]), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    // The feature branch is merged into its base while the run waits at the hold stop.
    git(current.sandbox, current.engine.worktreePath, "push", "origin", `${current.engine.record.settings.featureBranch}:develop`);
    await control(current, "check-again");
    const offer = current.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    expect((await control(current, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).outcome).toBe("continued");
    expect(current.engine.record.completedAt).toBeTruthy();
    expect(pullRequestPrompts(current)).toEqual([]);
    expect(current.engine.record.auditLoops?.atPullRequest).toBeTruthy();
    const answer = status(current);
    expect(answer.delivered).toMatchObject({ loops: { delivery: { used: 1, limit: 1 }, test: { used: 1, limit: 1 } }, forYou: { items: [{ id: "item-1", kind: "blocker", waived: { activity: "pr" }, waived_tag: expect.stringMatching(/^waived at Final delivery, .* UTC · browser · /) }] }, pullRequests: [] });
    const text = deliveredText(answer.delivered as Parameters<typeof deliveredText>[0], false)!;
    expect(text).toMatch(/^Closing audits: Delivery audit: 1 of 1 loops\. Test audit: 1 of 1 loops\.\nFor you:\n {2}- Blocker: .* \(Waived: waived at Final delivery, /);
  });
});
