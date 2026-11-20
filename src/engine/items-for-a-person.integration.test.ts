// Kiln Deliver When Audit Loops Run Out, Phase 2 (items for a person) with real Git, scripted
// provider sessions writing version-2 reports and the packaged CLI submitting them. No paid model
// calls. Each item an audit lists gives its kind; only a critical finding the next step would worsen
// stops at once, a blocker or business question holds the run short of the pull request until a
// person presses Continue anyway, and everything else goes on and is listed under For you.
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { ownerDocuments, type DeliveryContext } from "./development-delivery.js";
import type { DeliveryCheckpoint, DeliveryOwner } from "../state/development-delivery.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
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
    // At this Needs you stop after the audits, the latest audit is test audit loop 1 of 1, and the status line names it (AC-STOP-05).
    expect(held.auditLoops!.position).toEqual({ audit: "test", loop: 1, limit: 1 });
    expect(headerState(held, true, new Date()).facts[1]).toBe("Test audit loop 1 of 1");
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
  it("completes the run with no pull request session when every repository's work was confirmed delivered early through development delivery", { timeout: 240_000 }, async () => {
    // Development delivery is on; the delivery audit lists a blocker and the test audit, which owns an early delivery of every commit, relists it.
    h = await createHarness({ folder: "proof", files, sessions: [pullRequestSession()], auditCycles: true });
    const current = h;
    writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [pullRequestSession()], auditSessions: [audit({ items: [blocker] }), audit({ relist: true })] }));
    const target = { repository: "github.com/acme/acme-shop", baseBranch: "develop", environment: "test-development" };
    expect((await h.engine.changeSettings({ developmentDeployments: { enabled: true, targets: [{ target, confirmedTarget: target, confirmedNonProduction: true }] } })).ok).toBe(true);
    expect((await h.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1 } })).ok).toBe(true);
    // The captured GitHub contract, read through the development-delivery gh stand-in.
    const responses: Record<string, { body?: unknown }> = {};
    const statePath = join(h.sandbox.root, "delivery-responses.json");
    const save = () => writeFileSync(statePath, JSON.stringify({ responses, log: join(h!.sandbox.root, "delivery-gh-calls.jsonl") })); save();
    const peer = fileURLToPath(new URL("../../test/stand-ins/development-gh-stand-in.mjs", import.meta.url));
    const executable = join(h.sandbox.root, "delivery-gh");
    writeFileSync(executable, `#!/bin/sh\nexec '${process.execPath}' '${peer}' "$@"\n`); chmodSync(executable, 0o755);
    h.tools.gh = executable; h.env.KILN_DELIVERY_GH_RESPONSES = statePath;
    const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
    server = hosted.server; release = hosted.release;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const repo = h.engine.record.repositories[0]!;
    const context = (owner: DeliveryOwner): DeliveryContext => ({ record: current.engine.record, stateDirectory: current.stateDirectory, prdWorktree: repo.worktreePath, prdDirectory: current.engine.paths.prdDirectoryFromRoot, git: { git: current.tools.git, env: current.env }, gh: executable, env: current.env, owner, commands: () => Promise.resolve([]), now: () => new Date().toISOString() });
    // The delivery audit needs no development delivery.
    const delivery = h.engine.record.completionAudits!.activities.at(-1)!; const deliveryOwner: DeliveryOwner = { kind: "audit", activityId: delivery.activityId };
    expect(h.engine.stoppedPhaseKey()).toBe(auditKey(delivery));
    h.engine.record.developmentDelivery!.assessments.push({ owner: deliveryOwner, ...ownerDocuments(context(deliveryOwner), deliveryOwner), required: false, criteria: ["AC-PROOF-01"], reason: "The audit needs no development delivery", checkpointIds: [] });
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")); await h.engine.settled();
    // The test audit's checkpoint: its head squash-merged into develop, deployed and verified there, and synchronized back.
    const testAudit = h.engine.record.completionAudits!.activities.at(-1)!; const testOwner: DeliveryOwner = { kind: "audit", activityId: testAudit.activityId };
    expect(testAudit.kind).toBe("test_audit");
    const featureBranch = h.engine.record.settings.featureBranch;
    const head = git(h.sandbox, repo.worktreePath, "rev-parse", "HEAD").trim();
    git(h.sandbox, h.repository, "fetch", "origin", featureBranch); git(h.sandbox, h.repository, "merge", "--squash", "FETCH_HEAD"); git(h.sandbox, h.repository, "commit", "-m", "Squash the early delivery"); git(h.sandbox, h.repository, "push", "origin", "develop");
    const merged = git(h.sandbox, h.repository, "rev-parse", "HEAD").trim();
    const capture = JSON.parse(readFileSync(fileURLToPath(new URL("../../test/fixtures/development-delivery/github-contract.json", import.meta.url)), "utf8")) as { pull: Record<string, unknown>; deployment: Record<string, unknown>; statuses: Record<string, unknown>[]; run: Record<string, unknown>; jobs: { jobs: Record<string, unknown>[] } };
    const now = Date.now() - 120_000; const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
    const jobUrl = "https://github.com/acme/acme-shop/actions/runs/21/job/31";
    const deployment = { ...capture.deployment, id: 11, sha: merged, environment: target.environment, created_at: at(11) };
    Object.assign(responses, {
      "repos/acme/acme-shop/pulls/1": { body: { ...capture.pull, number: 1, html_url: "https://github.com/acme/acme-shop/pull/1", state: "closed", draft: false, body: `PRD: ${directory}/proof-prd.md`, merged_at: at(10), merge_commit_sha: merged, head: { sha: head, ref: featureBranch, repo: { full_name: "acme/acme-shop" } }, base: { ref: "develop", repo: { full_name: "acme/acme-shop" } } } },
      [`repos/acme/acme-shop/compare/${merged}...develop`]: { body: { status: "identical", merge_base_commit: { sha: merged } } },
      "repos/acme/acme-shop/deployments/11": { body: deployment },
      "repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1": { body: [{ ...capture.statuses[0], state: "success", environment: target.environment, log_url: jobUrl, created_at: at(20) }] },
      "repos/acme/acme-shop/actions/runs/21/attempts/1": { body: { ...capture.run, id: 21, head_sha: merged, path: ".github/workflows/deploy.yml", run_attempt: 1, status: "completed", conclusion: "success", created_at: at(10) } },
      "repos/acme/acme-shop/actions/runs/21/attempts/1/jobs?per_page=100&page=1": { body: { jobs: [{ ...capture.jobs.jobs[1], id: 31, name: "deploy", status: "completed", conclusion: "success", html_url: jobUrl, started_at: at(11), completed_at: at(20) }, { ...capture.jobs.jobs[2], id: 32, name: "verify", status: "completed", conclusion: "success", html_url: `${jobUrl}-verify`, started_at: at(21), completed_at: at(30) }] } },
      "repos/acme/acme-shop/deployments?environment=test-development&per_page=100&page=1": { body: [deployment] },
    }); save();
    const source = { path: "README.md", revision: head };
    const binding = ownerDocuments(context(testOwner), testOwner);
    const checkpoint: DeliveryCheckpoint = { id: "early-delivery", owner: testOwner, executionId: h.engine.record.executionId!, target, featureBranch, headSha: head, baseSha: repo.baseCommit!, criteria: ["AC-PROOF-01"], ...(binding.requirementManifestDigest ? { requirementManifestDigest: binding.requirementManifestDigest } : {}), dependsOn: [], workflowSource: source, requirements: [{ id: "deploy", purpose: "deployment", source, match: { kind: "github_deployment" } }, { id: "verify", purpose: "verification", source, match: { kind: "github_workflow", path: ".github/workflows/deploy.yml", jobs: ["verify"], deploymentJob: "deploy", attempt: 1 } }], requiredChecks: ["required-check"], requireReview: false, createdAt: at(0), operations: [{ id: "merge-intent", kind: "merge", state: "prepared", preparedAt: at(1), references: [], pullRequest: 1 }], references: [{ requirementId: "deploy", kind: "github_deployment", id: "11" }, { requirementId: "verify", kind: "github_workflow", id: "21" }], evidence: [] };
    h.engine.record.developmentDelivery!.checkpoints.push(checkpoint);
    h.engine.record.developmentDelivery!.assessments.push({ owner: testOwner, ...binding, required: true, criteria: ["AC-PROOF-01"], reason: "Deploy and verify the early delivery", checkpointIds: [checkpoint.id] });
    git(h.sandbox, repo.worktreePath, "fetch", "origin", "develop"); git(h.sandbox, repo.worktreePath, "merge", "--no-edit", "origin/develop"); git(h.sandbox, repo.worktreePath, "push", "origin", featureBranch);
    checkpoint.operations.push({ id: "sync-intent", kind: "synchronize", sourceHead: head, intendedBaseSha: merged, state: "prepared", preparedAt: at(40), references: [] });
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")); await h.engine.settled();
    // The relisted blocker holds the run at the pull request step, with no pull request.
    expect(h.engine.stoppedPhaseKey()).toBe("pr");
    expect(h.engine.record.phases.pr!.stop!.checks).toMatchObject([{ name: HOLD_CHECK, passed: false, items: [{ subject: "item-1" }] }]);
    await control(h, "check-again");
    // Every repository is delivered early, not merged as a whole, so Continue anyway completes the run.
    expect(h.engine.record.developmentDelivery!.repositoryResults).toMatchObject([{ state: "delivered", deliveredCheckpointIds: [checkpoint.id] }]);
    const offer = h.engine.markCompleteOffer();
    expect(offer).toMatchObject({ offered: true, label: "Continue anyway", hold: "complete",
      sentence: ["Continue anyway. Kiln records each item above as waived, never as settled, and completes the run, because the work is already delivered. The items stay open and are listed under For you, each marked Waived."] });
    if (!offer.offered) throw new Error(offer.reason);
    expect((await control(h, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).outcome).toBe("continued");
    expect(h.engine.record.completedAt).toBeTruthy();
    expect(pullRequests(h)).toEqual([]);
    expect(h.engine.record.pullRequests ?? []).toEqual([]);
    expect(buildSnapshot(h.engine).delivered!.forYou.items).toMatchObject([{ id: "item-1", kind: "blocker", waiver: { activityKey: "pr" } }]);
  });
});

describe("a waived item holds nothing again; a new one stops the run on its own (AC-ITEM-01)", () => {
  it("after Continue anyway reaches another audit, its prompt marks the item waived, a relisting with another kind stays covered, and a new item stops the run alone", { timeout: 300_000 }, async () => {
    const second = { kind: "business_question", problem: "Which refund rate applies?", action: "Choose the rate.", waitsOn: "Delivery." };
    // Delivery audit loop 2 adds a phase, so a landing session moves the feature head after the waiver and before the next hold check (AC-WAIVE-09 as AC-ITEM-01 replaces it).
    const current = await fixture([audit({ gap: true, items: [blocker] }), audit({ relist: true }), audit({ gap: true, relist: true, relistKind: "business_question", items: [second] })], [landing(), landingSession(`${directory}/value.mjs`, "export const value = () => 42; // rebuilt\n"), pullRequestSession()]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 1, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.stoppedPhaseKey()).toBe("pr");
    await control(current, "check-again");
    const first = current.engine.markCompleteOffer();
    if (!first.offered) throw new Error(first.reason);
    // A delivery loop raised before the pull request session starts reopens the kind: the phase built since its latest run is audited (AC-CHOICE-02).
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 2, testLimit: 1 } })).ok).toBe(true);
    const headAtWaiver = git(current.sandbox, current.engine.worktreePath, "rev-parse", "HEAD").trim();
    expect((await control(current, "waive-and-advance", { check_run_id: first.checkRunId, via: "browser" })).outcome).toBe("continued");
    // Delivery audit loop 2 ran after the waiver and listed a new item; no pull request session has started.
    expect(current.engine.record.completionAudits!.activities.map(a => a.kind)).toEqual(["delivery_audit", "test_audit", "delivery_audit"]);
    // The phase it added was built by a session, so the feature head moved since the waiver.
    expect(current.engine.record.phases["3"]?.doneAt).toBeTruthy();
    expect(git(current.sandbox, current.engine.worktreePath, "log", "--format=%s", `${headAtWaiver}..HEAD`)).toContain("feat: the phase");
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

  it("after the last test loop's fixes leave a row Weak, marks no criterion built, closes only phases its sessions ran, and reports the row (AC-LAST-05)", { timeout: 240_000 }, async () => {
    const weak = { kind: "test", problem: "AC-PROOF-01 is still Weak.", action: "Strengthen its test.", criterion: "AC-PROOF-01" };
    // Test audit loop 1 of 1 saves test work; the session of test fixes ends with the row still Weak.
    const current = await fixture([audit(), audit({ continueTest: true, findingText: "AC-PROOF-01 is Weak." }), audit({ items: [weak], findingText: "AC-PROOF-01 is still Weak." })]);
    expect((await current.engine.changeSettings({ auditLoops: { deliveryLimit: 4, testLimit: 1 } })).ok).toBe(true);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    expect(current.engine.record.completedAt, JSON.stringify(current.engine.record.phases)).toBeTruthy();
    expect(current.engine.record.completionAudits!.activities.map(a => `${a.kind} ${a.continuationIndex}`)).toEqual(["delivery_audit 1", "test_audit 1", "test_audit 2"]);
    // Kiln marks no criterion built: the PRD Kiln delivered still has the criterion unchecked.
    expect(git(current.sandbox, current.engine.worktreePath, "show", `HEAD:${directory}/proof-prd.md`)).toContain("- [ ] **AC-PROOF-01");
    // Every phase Kiln closed, the pull request step included, was run by one of its own sessions.
    const closed = Object.entries(current.engine.record.phases).filter(([key, facts]) => facts.doneAt && !key.startsWith("audit-"));
    expect(closed.map(([key]) => key)).toEqual(["pr"]);
    for (const [key, facts] of closed) expect(facts.sessionIds, key).not.toHaveLength(0);
    // The plan's Phase 1, closed before the run, is not reopened or re-closed by Kiln.
    expect(current.engine.record.phases["1"]?.sessionIds ?? []).toEqual([]);
    // The Weak row is reported, not hidden: on the finished page and in kiln status.
    const forYou = buildSnapshot(current.engine).delivered!.forYou;
    expect(forYou.items.map(item => item.line)).toEqual(["Test gap: AC-PROOF-01 is still Weak. Strengthen its test."]);
    const status = statusProjection(readWork(stateRoot(current.env), current.stateDirectory), current.engine) as unknown as { delivered: { forYou: { items: { kind: string | null; line: string }[] } } };
    expect(status.delivered.forYou.items).toEqual([expect.objectContaining({ kind: "test", line: "Test gap: AC-PROOF-01 is still Weak. Strengthen its test." })]);
    expect(pullRequestPrompt(current)).toContain("- Test gap: AC-PROOF-01 is still Weak. Strengthen its test.");
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
