import { recoveryRequest } from "../test-support/phase-recovery-request.js";
// Automatic routing with real Git, packaged CLI/HTTP, persisted state and scripted provider
// transcripts. Both actual providers are separately exercised by the installed-package proof.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as auditAdmission from "../audit/admission.js";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { launchChrome } from "../test-support/headless-chrome.js";
import { writePrdRecord } from "../state/records.js";
import { ownerDocuments, type DeliveryContext } from "./development-delivery.js";
import { buildSnapshot } from "./snapshot.js";
import { AuditStore } from "../audit/storage.js";
import type { AuditResult } from "../audit/contracts.js";
import { auditKey } from "../audit/workflow.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import type { EngineOptions } from "./engine.js";

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
async function fixture(auditSessions?: unknown[], sessions = [pullRequestSession()], documentFiles = files, engineOptions: Partial<EngineOptions> = {}) {
  h = await createHarness({ folder: "proof", files: documentFiles, sessions, auditCycles: true, engineOptions });
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
  if (auditSessions) writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions }));
  const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
  server = hosted.server; release = hosted.release;
  return h;
}
const auditSession = (behavior: Record<string, unknown> = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
// Multi-cycle scenarios below run several real provider/Git/audit boundaries. Their
// two-minute budgets cover that complete workflow, not an individual operation.
describe("automatic completion activities", () => {
  it("retains a failed handback observation when an audit completion read is unavailable", async () => {
    const current = await fixture([auditSession({ noReport: true })]);
    await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
    const activity = current.engine.record.completionAudits!.activities.at(-1)!;
    const key = auditKey(activity);
    const stop = structuredClone(current.engine.record.phases[key]);
    const baseline = current.engine.record.planReconciliation!.baselineId;
    rmSync(join(current.repository, "docs/prds/proof/technical-design.md"));
    await expect(current.engine.checkAgain()).rejects.toThrow("Missing technical design");
    expect(current.engine.record.planReconciliation!.check).toMatchObject({ status: "failed", problem: expect.stringContaining("Missing technical design") });
    expect(buildSnapshot(current.engine).continuation!.planCheck!.problem).toContain("Missing technical design");
    expect(current.engine.record.planReconciliation!.baselineId).toBe(baseline);
    expect(current.engine.record.phases[key]).toEqual(stop);
    expect(current.engine.record.completedAt).toBeUndefined();
  });
  it.each([
    { entry: "completed", stopping: true },
    { entry: "completed", stopping: false },
    { entry: "interrupted", stopping: true },
    { entry: "stopped", stopping: true },
    { entry: "waiting", stopping: true },
  ])("abandons a rejected audit read only during shutdown ($entry, stopping=$stopping)", async ({ entry, stopping }) => {
    const current = await fixture(entry === "waiting"
      ? [{ actions: [{ skill: "delivery-audit" }, { refuse: { rateLimitType: "five_hour" } }] }]
      : [auditSession({ noReport: entry === "stopped" })]);
    if (entry === "interrupted") {
      const marker = join(current.sandbox.root, "audit-working");
      writeFileSync(current.scenarioPath, JSON.stringify({ sessions: [], auditSessions: [{ actions: [{ touch: marker }, { work: "audit verification" }] }] }));
      await current.engine.start({ refinementConfirmed: true });
      await waitFor(() => existsSync(marker));
      await current.engine.stop("sigint");
      current.reopenFromDisk();
      await current.engine.agents.refresh();
    } else if (entry !== "completed") {
      await current.engine.start({ refinementConfirmed: true });
      await current.engine.settled();
      const activity = current.engine.record.completionAudits!.activities.at(-1)!;
      if (entry === "waiting") expect(current.engine.record.phases[auditKey(activity)]?.wait).toBeDefined();
      else expect(current.engine.record.phases[auditKey(activity)]?.stop).toBeDefined();
    }
    const repositoryChecks = auditAdmission.repositoryChecks;
    let checking = false;
    let rejectCheck: ((error: Error) => void) | undefined;
    // Failure injection is limited to the cancelled/read-error boundary. Audit setup,
    // provider sessions and ordinary repository checks retain their real Git tree.
    const probe = vi.spyOn(auditAdmission, "repositoryChecks").mockImplementation(async context => {
      const activity = current.engine.record.completionAudits?.activities.at(-1);
      if (!checking && activity && current.engine.latestSession(auditKey(activity))?.runs.at(-1)?.endedAt) {
        checking = true;
        await new Promise<void>((_, reject) => {
          rejectCheck = reject;
          context.git.signal!.addEventListener("abort", () => reject(new Error("Cancelled audit Git read.")), { once: true });
        });
      }
      return repositoryChecks(context);
    });
    try {
      if (entry === "completed") await current.engine.start({ refinementConfirmed: true });
      const operation = entry === "interrupted" ? current.engine.decide()
        : entry === "stopped" ? current.engine.checkAgain(recoveryRequest(current.engine, "verify"))
        : entry === "waiting" ? current.engine.resume(recoveryRequest(current.engine)) : current.engine.settled();
      // Observe rejections before releasing the gate; an ordinary failure must remain
      // visible and must not turn into a passing or stopping verdict.
      const observed = operation.then(() => ({ ok: true as const }), error => ({ ok: false as const, error }));
      await waitFor(() => checking);
      const activity = current.engine.record.completionAudits!.activities.at(-1)!;
      const before = structuredClone(current.engine.record.phases[auditKey(activity)]);
      if (stopping) {
        await current.engine.stop("sigint");
        expect(await observed).toEqual({ ok: true });
        await expect(current.engine.settled()).resolves.toBeUndefined();
      } else {
        const error = new Error("Audit repository read failed.");
        rejectCheck!(error);
        const result = await observed;
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toBe(error);
      }
      expect(current.engine.record.phases[auditKey(activity)]).toEqual(before);
      expect(current.engine.record.completedAt).toBeUndefined();
    } finally { probe.mockRestore(); }
  });
  it.each([
    { beyondDelivery: true, recordedHumanResult: false },
    { beyondDelivery: false, recordedHumanResult: false },
    { beyondDelivery: true, recordedHumanResult: true },
  ])("keeps human work behind the completion boundary and discloses allowed actions in the browser (%j)", { timeout: 120_000 }, async ({ beyondDelivery, recordedHumanResult }) => {
    const action = "Approve and perform the separately authorized production release.";
    const documentFiles = { ...files, "proof-prd.md": files["proof-prd.md"] + "  - Production release is a separate human action after Kiln delivery.\n" };
    const h = await fixture([auditSession({ humanAction: action, beyondDelivery }), auditSession({ humanAction: action, beyondDelivery, recordedHumanResult })], [pullRequestSession()], documentFiles);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const snapshot = buildSnapshot(h.engine);
    if (!beyondDelivery) {
      expect(snapshot.feature.state).toBe("needs_you");
      expect(h.engine.record.completedAt).toBeUndefined();
      expect(h.claudeCalls()).toHaveLength(1);
      expect(snapshot.activities!.find(row => row.audit)?.audit?.remainingAfterDeliveryActions).toBeUndefined();
      return;
    }
    expect(snapshot.feature.state, JSON.stringify(h.engine.record.phases)).toBe("complete");
    const remaining = recordedHumanResult ? [] : [action];
    const latest = snapshot.activities!.findLast(row => row.kind === "test_audit")!.audit!;
    expect(latest.pendingActions).toEqual([action]);
    expect(latest.remainingAfterDeliveryActions).toEqual(remaining);
    const chrome = await launchChrome();
    try {
      const page = await chrome.open(server!.address);
      const section = `document.querySelector('[aria-labelledby="human-actions-heading"]')`;
      await page.waitFor(`document.body.innerText.includes('PR ready for review')`);
      if (recordedHumanResult) {
        expect(await page.evaluate(section)).toBeNull();
        expect(await page.evaluate(`document.body.innerText`)).not.toContain(action);
      } else {
        expect(await page.evaluate(`${section}.innerText`)).toContain("Kiln has not performed them.");
        expect(await page.evaluate(`${section}.querySelectorAll('li').length`)).toBe(1);
        expect(await page.evaluate(`${section}.querySelector('li').innerText`)).toBe(action);
        await page.evaluate(`location.reload()`);
        await page.waitFor(`document.getElementById('human-actions-heading')`);
        expect(await page.evaluate(`${section}.querySelector('li').innerText`)).toBe(action);
      }
      expect(page.problems).toEqual([]);
      if (process.env.KILN_SCREENSHOTS && !recordedHumanResult) {
        mkdirSync(process.env.KILN_SCREENSHOTS, { recursive: true });
        writeFileSync(join(process.env.KILN_SCREENSHOTS, "completion-human-actions.png"), await page.screenshot());
      }
    } finally { await chrome.close(); }
    const again = h.reopenFromDisk(); await again.agents.refresh();
    expect((await again.decide()).kind).toBe("complete");
    expect(buildSnapshot(again).activities!.findLast(row => row.kind === "test_audit")!.audit!.remainingAfterDeliveryActions).toEqual(remaining);
  });
  it("audits a closed-at-start plan through both gates before final delivery without another Start", async () => {
    const h = await fixture();
    // AC-BILL-05 covers actual audit routing as well as implementation phases.
    // The synthetic model process is paired with the real passive SDK/auth proof.
    h.env.ANTHROPIC_API_KEY = "synthetic-audit-billing-canary";
    await h.engine.refreshBilling(); await waitFor(() => !h.engine.agents.state.pending);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false });
    expect(h.claudeCalls()).toHaveLength(0);
    await h.engine.billingCommand("approval", { executionId: h.engine.record.executionId, selectionGeneration: h.engine.record.settings.selectionGeneration ?? 0, readingId: h.engine.billing.view.next!.readingId, approved: true });
    expect(h.claudeCalls()).toHaveLength(0);
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities.map(a => a.kind)).toEqual(["delivery_audit", "test_audit"]);
    expect(h.engine.record.completionAudits!.activities.every(a => a.acceptedResult && h.engine.record.phases[auditKey(a)]?.doneAt)).toBe(true);
    expect(h.claudeCalls().map(c => /^Run (Delivery audit|Test audit)/.exec(c.prompt)?.[1] ?? "Final delivery")).toEqual(["Delivery audit", "Test audit", "Final delivery"]);
    for (const key of [...h.engine.record.completionAudits!.activities.map(auditKey), "pr"]) {
      expect(h.engine.latestSession(key)!.runs[0]!.billing).toMatchObject({ route: "metered", approved: true });
    }
    expect(h.engine.record.billing!.approval).toBeUndefined(); // Completion cannot carry the grant to another execution.
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.feature.phasesTotal).toBe(1); expect(snapshot.feature.phasesDone).toBe(1);
    expect(snapshot.activities!.map(a => a.title)).toEqual(["Return value", "Delivery audit", "Test audit", "Final pull request"]);
    expect(snapshot.activities!.filter(a => a.audit).every(a => a.audit!.criteria.length === 1)).toBe(true);
    const audit = h.engine.record.completionAudits!.activities[0]!;
    const store = new AuditStore(h.stateDirectory); const original = store.read<AuditResult>(audit.acceptedResult!);
    expect(original.checks.some(check => check.name === "Stayed in the workspace")).toBe(false);
    const historical = { ...original, checks: [...original.checks, { name: "Stayed in the workspace", passed: true, facts: ["Legacy scan"] }] };
    audit.acceptedResult = store.put(historical);
    expect(buildSnapshot(h.engine).activities!.find(a => a.kind === "delivery_audit")!.audit!.checks).toEqual(original.checks);
    expect(store.read<AuditResult>(audit.acceptedResult).checks).toEqual(historical.checks);
    const again = h.reopenFromDisk(); await again.agents.refresh(); expect((await again.decide()).kind).toBe("complete");
    expect(h.claudeCalls()).toHaveLength(3);
  });
  it("reinspects changed billing between delivery audit, test audit and final delivery", async () => {
    const current = await fixture(); current.env.ANTHROPIC_API_KEY = "initial-audit-context";
    await current.engine.refreshBilling(); await waitFor(() => !current.engine.agents.state.pending);
    const approve = () => current.engine.billingCommand("approval", { executionId: current.engine.record.executionId, selectionGeneration: current.engine.record.settings.selectionGeneration ?? 0, readingId: current.engine.billing.view.next!.readingId, approved: true });
    await approve(); let accepted = 0;
    const off = current.engine.onChange(() => {
      const count = current.engine.record.completionAudits?.activities.filter(activity => activity.acceptedResult && current.engine.record.phases[auditKey(activity)]?.doneAt).length ?? 0;
      if (count > accepted) { accepted = count; current.env.ANTHROPIC_API_KEY = `changed-after-audit-${count}`; }
    });
    try {
      await current.engine.start({ refinementConfirmed: true }); await current.engine.settled();
      for (const [index, kind] of ["test_audit", "pull_request"].entries()) {
        expect(current.claudeCalls()).toHaveLength(index + 1);
        const hold = current.engine.record.billing!.hold!;
        expect(hold).toMatchObject({ action: "launch" });
        expect(current.engine.latestSession(hold.phaseKey)!.kind).toBe(kind);
        expect(current.engine.latestSession(hold.phaseKey)!.runs).toHaveLength(0);
        expect(current.engine.record.billing!.approval).toBeUndefined();
        await approve(); expect(current.claudeCalls()).toHaveLength(index + 1);
        await current.engine.checkAgain(recoveryRequest(current.engine, "verify")); await current.engine.settled();
      }
      expect(current.engine.record.completedAt).toBeDefined(); expect(current.claudeCalls()).toHaveLength(3);
    } finally { off(); }
  });
  it("implements two appended repair rounds including split children before the clean test audit", { timeout: 120_000 }, async () => {
    const firstRepair=landingSession(`${directory}/value.mjs`,files["value.mjs"]);
    firstRepair.actions.splice(1,0,{split:[{id:"2a",slug:"first",title:"First repair",closed:true,criteria:"AC-PROOF-01"},{id:"2b",slug:"second",title:"Second repair",criteria:"AC-PROOF-01"}]});
    const h = await fixture([auditSession({ gap: true }), auditSession({ gap: true }), auditSession(), auditSession()], [firstRepair,landingSession(`${directory}/value.mjs`, files["value.mjs"]), landingSession(`${directory}/value.mjs`, files["value.mjs"]), pullRequestSession()]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities.map(a => [a.kind, a.round])).toEqual([["delivery_audit", 1], ["delivery_audit", 2], ["delivery_audit", 3], ["test_audit", 1]]);
    expect(buildSnapshot(h.engine).activities!.map(a => a.title)).toEqual(["Return value", "Delivery audit", "Repair value", "First repair", "Second repair", "Delivery audit", "Repair value", "Delivery audit", "Test audit", "Final pull request"]);
    expect(readFileSync(join(h.engine.worktreePath, directory, "phase-1-value.md"), "utf8")).toBe(files["phase-1-value.md"]);
    expect(h.events.flatMap(e=>e.kind==="audit"&&e.event==="started"?[`${e.label} round ${e.round}`]:e.kind==="phase"&&e.event==="started"?[`Phase ${e.phaseId}`]:[])).toEqual(["Delivery audit round 1","Phase 2","Phase 2b","Delivery audit round 2","Phase 3","Delivery audit round 3","Test audit round 1"]);
  // Eight real process sessions plus Git/audit handoffs have a whole-workflow budget.
  });
  it("continues test-only work in a fresh conversation in the same round and retains both immutable records", { timeout: 120_000 }, async () => {
    const h = await fixture([auditSession(), auditSession({ continueTest: true }), auditSession()]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    const activities = h.engine.record.completionAudits!.activities;
    expect(activities.map(a => [a.kind, a.round, a.continuationIndex])).toEqual([["delivery_audit",1,1],["test_audit",1,1],["test_audit",1,2]]);
    expect(new Set(activities.flatMap(a => a.sessionIds)).size).toBe(3);
    expect(activities.every(a => a.acceptedResult && h.engine.record.phases[auditKey(a)]?.doneAt)).toBe(true);
    expect(h.claudeCalls()[2]!.prompt).toContain('Add the remaining value edge assertion.');
    expect(buildSnapshot(h.engine).activities!.filter(a => a.kind === "test_audit").map(a => a.file)).toEqual(["Round 1", "Round 1 · Continuation 2"]);
    expect(h.events.filter(e => e.kind === "audit" && e.event === "started").at(-1)).toMatchObject({ continuationIndex: 2 });
    const again = h.reopenFromDisk(); await again.agents.refresh(); expect((await again.decide()).kind).toBe("complete");
    expect(h.claudeCalls()).toHaveLength(4);
  // Four sessions include full test-audit red/restore evidence and real Git work.
  });

  it.each([undefined, "Reworded missing assertion, with no changed evidence."])("stops unfinished test work without substantive progress (%s)", async findingText => {
    const h = await fixture([auditSession(), auditSession({ continueTest: true }), auditSession({ continueTest: true, findingText })]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const activities = h.engine.record.completionAudits!.activities; const last = activities.at(-1)!;
    expect(activities.map(a => a.continuationIndex)).toEqual([1,1,2]);
    expect(last.acceptedResult).toBeUndefined(); expect(h.engine.record.completedAt).toBeUndefined();
    expect(h.engine.record.phases[auditKey(last)]!.stop!.checks.flatMap(c => c.facts).join(" ")).toContain("no recorded progress");
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")); await h.engine.settled(); expect(h.claudeCalls()).toHaveLength(3);
  });

  it.each(["completion phase", "direct fix"])("returns a test-discovered %s through delivery and whole-test reassessment", { timeout: 120_000 }, async mode => {
    const h = await fixture([auditSession(), auditSession(mode === "direct fix" ? { directFix: true } : { gap: true }), auditSession(), auditSession()], mode === "direct fix" ? [pullRequestSession()] : [landingSession(`${directory}/value.mjs`, files["value.mjs"]), pullRequestSession()]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities.map(a => [a.kind,a.round])).toEqual([["delivery_audit",1],["test_audit",1],["delivery_audit",2],["test_audit",2]]);
    const calls = h.claudeCalls(); const lastTest = calls.findLast(c => c.prompt.startsWith("Run Test audit"))!;
    expect(lastTest.prompt).toContain('"kind": "test_audit"');
    expect(lastTest.prompt).toContain('"kind": "delivery_audit"');
    expect(readFileSync(join(h.engine.worktreePath,directory,"phase-1-value.md"),"utf8")).toBe(files["phase-1-value.md"]);
    expect(buildSnapshot(h.engine).feature.phasesTotal).toBe(mode === "direct fix" ? 1 : 2);
  });

  it("persists the pending continuation across a boundary pause and restart without a duplicate activity", { timeout: 120_000 }, async () => {
    const h = await fixture([auditSession(),auditSession({ continueTest:true }),auditSession()]); let requested=false;
    const off=h.engine.onChange(()=>{if(!requested&&h.engine.current?.session?.kind==="test_audit"){requested=true;h.engine.pause();}});
    await h.engine.start({refinementConfirmed:true});await h.engine.settled();off();
    const pending=h.engine.record.completionAudits!.activities.at(-1)!;
    expect(pending).toMatchObject({kind:"test_audit",round:1,continuationIndex:2,sessionIds:[]});
    expect(h.engine.record.nextActivityKey).toBe(auditKey(pending));expect(h.claudeCalls()).toHaveLength(2);
    const port=Number(new URL(server!.address).port);await server!.close();const again=h.reopenFromDisk();await again.agents.refresh();
    server=await startLocalServer({engine:again,port,folderName:"proof",featureName:"Audit value",token:again.record.token});
    expect((await again.decide()).kind).toBe("paused");await again.start();await again.settled();
    expect(again.record.completedAt,JSON.stringify(again.record.phases)).toBeTruthy();expect(again.record.completionAudits!.activities).toHaveLength(3);
    expect(again.record.completionAudits!.activities.at(-1)!.activityId).toBe(pending.activityId);
  });

  it("shows and opens the fresh test continuation in the real browser", { timeout: 120_000 }, async () => {
    const h=await fixture();const marker=join(h.sandbox.root,"test-continuation-ready");
    writeFileSync(h.scenarioPath,JSON.stringify({sessions:[pullRequestSession()],auditSessions:[auditSession(),auditSession({continueTest:true}),auditSession({beforeSubmitFile:marker})]}));
    const chrome=await launchChrome();
    try {
      // The marker follows three real audit turns and their committed/pushed reports.
      await h.engine.start({refinementConfirmed:true});await waitFor(()=>existsSync(marker), 60_000);
      const activity=h.engine.record.completionAudits!.activities.at(-1)!;const key=auditKey(activity);
      expect(activity).toMatchObject({round:1,continuationIndex:2});
      const page=await chrome.open(server!.address);await page.waitFor(`document.body.innerText.includes('Continuation 2')`);
      expect(await page.evaluate(`document.querySelector('li[data-phase="${key}"]').innerText`)).toContain("Test audit");
      await page.evaluate(`document.querySelector('li[data-phase="${key}"] a').click()`);
      await page.waitFor(`document.body.innerText.includes('Continuation 2') && document.body.innerText.includes('Pause after this audit')`);
      expect(await page.evaluate(`document.body.innerText`)).not.toContain("Phase audit-");
      writeFileSync(marker,"continue");await h.engine.settled();expect(h.engine.record.completedAt).toBeTruthy();
      await page.evaluate(`location.href=${JSON.stringify(server!.address)}`);await page.waitFor(`document.body.innerText.includes('PR ready for review')`);
      await page.evaluate(`document.querySelector('li[data-phase="${key}"] a').click()`);await page.waitFor(`document.body.innerText.includes('Outcome: passed')`);
      expect(page.problems).toEqual([]);
    } finally {writeFileSync(marker,"continue");await chrome.close();}
  });

  it.each(["open PR", "already merged"])("keeps existing %s evidence behind audits at startup, Check again and Resume", async existing => {
    const h=await fixture([auditSession({noReport:true}),auditSession(),auditSession()]);
    const branch=h.engine.record.settings.featureBranch;
    if(existing==="open PR")h.setPulls([{repo:"acme/acme-shop",number:7,title:"Existing review",url:"https://github.com/acme/acme-shop/pull/7",headRefName:branch,baseRefName:"develop",isDraft:false,isCrossRepository:false,additions:1,deletions:0,commits:[]}]);
    let integrated="";
    const off=h.engine.onChange(()=>{
      if(existing!=="already merged"||!h.engine.record.setupCompletedAt)return;
      const sha=git(h.sandbox,h.engine.worktreePath,"rev-parse","HEAD").trim();
      if(sha!==integrated){git(h.sandbox,h.engine.worktreePath,"push","origin",`${branch}:develop`);integrated=sha;}
    });
    try {
      await h.engine.start({refinementConfirmed:true});await h.engine.settled();
      expect(h.engine.record.completedAt).toBeUndefined();expect(h.claudeCalls()).toHaveLength(1);
      expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ok:true});await h.engine.settled();
      expect(h.engine.record.completedAt).toBeUndefined();expect(h.claudeCalls()).toHaveLength(1);
      expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ok:true});await h.engine.settled();
      expect(h.engine.record.completedAt,JSON.stringify(h.engine.record.phases)).toBeTruthy();
      expect(h.engine.record.completionAudits!.activities.map(a=>a.kind)).toEqual(["delivery_audit","test_audit"]);
      expect(h.claudeCalls()).toHaveLength(3);expect(h.claudeCalls().some(c=>c.prompt.includes("Open one pull request"))).toBe(false);
      if(existing==="open PR")expect(h.engine.record.pullRequests?.[0]?.number).toBe(7);
    } finally {off();}
  });

  it("stops a normal audit exit without a report and keeps its identity for Check again", async () => {
    const h = await fixture([auditSession({ noReport: true })]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const activity = h.engine.record.completionAudits!.activities[0]!; const key = auditKey(activity);
    expect(h.engine.stoppedPhaseKey()).toBe(key); expect(h.engine.record.phases[key]!.stop!.checks.some(c => c.name === "missing_evidence" && !c.passed)).toBe(true);
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.completionAudits!.activities).toHaveLength(1); expect(h.engine.record.completedAt).toBeUndefined();
  });
  it("recovers a committed report without submission and pauses at the audit boundary", { timeout: 120_000 }, async () => {
    const h = await fixture([auditSession({ skipSubmit: true })]);
    let requested = false;
    const off = h.engine.onChange(() => { if (!requested && h.engine.current?.session?.kind === "delivery_audit") { requested = true; h.engine.pause(); } });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); off();
    expect(h.engine.record.pause.activeSince).toBeTruthy(); expect(h.claudeCalls()).toHaveLength(1);
    const activity = h.engine.record.completionAudits!.activities[0]!; expect(activity.acceptedResult).toBeTruthy();
    expect(h.engine.record.phases[auditKey(activity)]!.doneAt).toBeTruthy();
    await h.engine.start(); await h.engine.settled(); expect(h.engine.record.completedAt).toBeTruthy(); expect(h.claudeCalls()).toHaveLength(3);
  });

  // The complete browser workflow spans both audits, a pause/restart and the final PR.
  it("shows audit rows and findings in the real browser, with pause and immediate continuation", { timeout: 120_000 }, async () => {
    const h = await fixture(); const marker = join(h.sandbox.root, "audit-ready");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [pullRequestSession()], auditSessions: [auditSession({ beforeSubmitFile: marker })] }));
    const chrome = await launchChrome();
    try {
      await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(marker));
      const page = await chrome.open(server!.address);
      await page.waitFor(`document.body.innerText.includes('Pause after this audit')`);
      const key = auditKey(h.engine.record.completionAudits!.activities[0]!);
      expect(await page.evaluate(`document.querySelector('li[data-phase="${key}"]').innerText`)).toContain("Delivery audit");
      await page.evaluate(`document.querySelector('li[data-phase="${key}"] a').click()`);
      await page.waitFor(`document.body.innerText.includes('Delivery audit · Round 1')`);
      expect(await page.evaluate(`document.body.innerText`)).not.toContain("Phase audit-");
      await page.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Pause after this audit')).click()`);
      await waitFor(() => !!h.engine.record.pause.requestedAt);
      writeFileSync(marker, "continue"); await h.engine.settled();
      expect(h.engine.record.pause.activeSince).toBeTruthy();
      await h.engine.start(); await h.engine.settled();
      await page.evaluate(`location.href=${JSON.stringify(server!.address)}`);
      await page.waitFor(`document.body.innerText.includes('Test audit') && document.body.innerText.includes('No new phases found')`);
      expect(await page.evaluate(`document.querySelector('a[href="${h.engine.record.pullRequests![0]!.url}"]')?.href`)).toBe(h.engine.record.pullRequests![0]!.url);
      await page.evaluate(`document.querySelector('li[data-phase="${key}"] a').click()`);
      await page.waitFor(`document.body.innerText.includes('Outcome: passed')`);
      expect(await page.evaluate(`document.body.innerText`)).toContain("AC-PROOF-01");
      expect(page.problems).toEqual([]);
    } finally { writeFileSync(marker, "continue"); await chrome.close(); }
  });

  it("executes persisted upgrades: preserves historical completion and audits unfinished old records", async () => {
    const h = await fixture([auditSession({ noReport: true })]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const timestamp = "2026-10-01T12:00:00Z";
    const old = structuredClone(h.engine.record); old.schemaVersion = 5; old.completedAt = timestamp; old.phases = {};
    delete old.completionAudits; delete old.activities; delete old.nextActivityKey;
    writeFileSync(join(h.stateDirectory,"prd.json"), JSON.stringify(old));
    const historical = h.reopenFromDisk(); await historical.agents.refresh();
    expect((await historical.decide()).kind).toBe("complete");
    expect(historical.record.completedAt).toBe(timestamp); expect(historical.record.completionAudits!.policy).toBe("legacy_complete");
    expect(buildSnapshot(historical).auditHistoryUnavailable).toBe(true);
    expect(buildSnapshot(historical).activities!.some(row => row.kind?.endsWith("audit"))).toBe(false);
    expect(h.claudeCalls()).toHaveLength(1);
    // An unfinished saved execution is migrated and driven, not a fresh unrelated record.
    delete old.completedAt; writeFileSync(join(h.stateDirectory,"prd.json"), JSON.stringify(old));
    const port=Number(new URL(server!.address).port); await server!.close();
    const unfinished=h.reopenFromDisk(); await unfinished.agents.refresh();
    server=await startLocalServer({engine:unfinished,port,folderName:"proof",featureName:"Audit value",token:unfinished.record.token});
    expect(unfinished.record.completionAudits!.policy).toBe("required");
    expect((await unfinished.decide()).kind).toBe("start_audit"); await unfinished.continue();
    expect(unfinished.record.completedAt).toBeTruthy();
    expect(unfinished.record.completionAudits!.activities.map(a=>a.kind)).toEqual(["delivery_audit","test_audit"]);
  });

  it("accepts a committed report after interruption without resuming or duplicating its provider session", async () => {
    const h = await fixture(); const marker = join(h.sandbox.root, "crash-before-submit");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [pullRequestSession()], auditSessions: [auditSession({ beforeSubmitFile: marker, skipSubmit: true })] }));
    await h.engine.start({ refinementConfirmed: true }); await waitFor(() => existsSync(marker));
    const port = Number(new URL(server!.address).port);
    const original = h.engine.record.completionAudits!.activities[0]!;
    const stopped = h.engine.stop("sigint"); writeFileSync(marker, "continue"); await stopped;
    await server!.close(); server = undefined;
    const again = h.reopenFromDisk(); await again.agents.refresh();
    server = await startLocalServer({ engine: again, port, folderName: "proof", featureName: "Audit value", token: again.record.token });
    const decision = await again.decide();
    expect(decision.kind).toBe("start_audit");
    expect(again.record.completionAudits!.activities[0]!.sessionIds).toEqual(original.sessionIds);
    expect(again.record.completionAudits!.activities[0]!.acceptedResult).toBeTruthy();
    await again.continue(); expect(again.record.completedAt).toBeTruthy();
    expect(h.claudeCalls()).toHaveLength(3);
  });

  it("requires fresh audits when development reconciliation reopens a historical completion (AC-RUN-06)", async () => {
    const h = await fixture([auditSession({ noReport: true }), auditSession({ noReport: true })]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    git(h.sandbox, h.engine.worktreePath, "push", "-u", "origin", h.engine.record.settings.featureBranch);
    const historicalAt = "2026-10-01T12:00:00Z";
    const old = structuredClone(h.engine.record);
    old.schemaVersion = 5; old.completedAt = historicalAt;
    old.phases = { "1": old.phases["1"]! };
    delete old.completionAudits; delete old.activities; delete old.nextActivityKey;
    old.developmentAuthorization = { revision: 1, enabled: true, grants: [{ target: { repository: "github.com/acme/acme-shop", baseBranch: "develop", environment: "audit-fixture-dev" }, confirmedAt: historicalAt, source: "start" }] };
    writeFileSync(join(h.stateDirectory, "prd.json"), JSON.stringify(old));
    const port = Number(new URL(server!.address).port); await server!.close();
    const again = h.reopenFromDisk(); await again.agents.refresh();
    server = await startLocalServer({ engine: again, port, folderName: "proof", featureName: "Audit value", token: again.record.token });
    expect(again.record.completionAudits!.policy).toBe("legacy_complete");
    expect(await again.decide()).toMatchObject({ kind: "needs_you", phaseKey: "1" });
    expect(again.currentlyComplete).toBe(false);
    expect(again.record.completedAt).toBe(historicalAt);
    expect(again.record.completionAudits!.policy).toBe("required");
    expect(JSON.parse(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")).completionAudits.policy).toBe("required");
    const context: DeliveryContext = { record: again.record, stateDirectory: h.stateDirectory, prdWorktree: again.worktreePath, prdDirectory: directory, git: { git: h.tools.git, env: h.env }, gh: h.tools.gh, env: h.env, phaseId: "1", now: () => new Date().toISOString(), commands: async () => [] };
    expect(await again.deliveryCommand("assessment", { executionId: again.record.executionId, revision: again.record.developmentDelivery!.revision, phaseId: "1", ...ownerDocuments(context, { kind: "phase", phaseId: "1" }), required: false, criteria: ["AC-PROOF-01"], reason: "The fixture's original phase needs no development deployment.", checkpoints: [] })).toMatchObject({ ok: true });
    await again.checkAgain(recoveryRequest(again, "verify")); await again.settled();
    expect(again.record.completionAudits!.activities.map(activity => activity.kind), JSON.stringify(buildSnapshot(again).needsYou?.checks)).toEqual(["delivery_audit"]);
    const audit = again.record.completionAudits!.activities[0]!;
    expect(again.stoppedPhaseKey()).toBe(auditKey(audit));
    expect(again.currentlyComplete).toBe(false);
    expect(h.claudeCalls()).toHaveLength(2);
    expect(h.claudeCalls().at(-1)!.prompt).toContain("Run Delivery audit");
    expect(again.record.completedAt).toBe(historicalAt);
  });

  it("resumes usage-limited audit work in its original activity and conversation with current task and user note", async () => {
    const h = await fixture([{ actions: [{ skill: "delivery-audit" }, { refuse: { rateLimitType: "five_hour" } }] }, auditSession()]);
    h.engine.record.settings.resumeAfterUsageLimit = false;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const original = h.engine.record.completionAudits!.activities[0]!; const key = auditKey(original);
    expect(h.engine.record.phases[key]!.stop?.limit).toBeTruthy();
    expect(await h.engine.resume({ ...recoveryRequest(h.engine), note: "Check the value before continuing." })).toMatchObject({ ok: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities[0]!.activityId).toBe(original.activityId);
    const calls = h.claudeCalls(); expect(calls[1]!.args).toContain("--resume"); expect(calls[1]!.args).toContain(original.sessionIds[0]);
    expect(calls[1]!.prompt.indexOf("Check the value")).toBeLessThan(calls[1]!.prompt.indexOf("Carry on with the assigned Delivery audit"));
    expect(calls[1]!.prompt).toContain(original.reportPath);
  });

  it.each(["automatic", "Resume now"])("recovers the recorded weekly refusal through %s after switching accounts, with no reply required", { timeout: 120_000 }, async mode => {
    const started = Date.now();
    const now = () => new Date(Date.parse("2026-10-26T09:30:00Z") + Date.now() - started);
    const claude = new ScriptedClaude(now);
    const full = signedIn([usageRow("weekly_all", 100, "2026-10-28T12:00:00Z")]);
    claude.queue(full, full);
    const h = await fixture([{ actions: [{ skill: "delivery-audit" }, { replay: "usage-limit/weekly-refusal-with-subagents.jsonl" }, { exit: 1 }] }, auditSession(), auditSession()], [pullRequestSession()], files, { claude, now });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const original = h.engine.record.completionAudits!.activities[0]!;
    const key = auditKey(original);
    expect(h.engine.waitingPhaseKey()).toBe(key);
    claude.deliver(full);
    await waitFor(() => buildSnapshot(h.engine).waiting?.limit.account?.percent === 100);
    expect(buildSnapshot(h.engine).waiting?.limit).toMatchObject({ label: "Weekly", resetsAt: "2026-10-28T12:00:00.000Z" });
    expect(h.claudeCalls()).toHaveLength(1);
    const fresh = signedIn([usageRow("weekly_all", 5)], { email: "fresh@example.test", orgId: "org-fresh" });
    const chrome = await launchChrome();
    try {
      const page = await chrome.open(server!.address, { clock: Date.parse("2026-10-26T09:30:00Z"), timeZone: "America/New_York" });
      await page.waitFor(`document.body.innerText.includes('This audit is waiting for the weekly usage limit to reset.')`);
      const words = await page.evaluate<string>("document.body.innerText");
      expect(words).toContain("Resets Wed 8:00 AM, in 2d 2h");
      expect(words).toContain("Kiln resumes this session by itself");
      expect(words).not.toContain("Check again");
      expect(words).not.toContain("Phase audit-");
      if (process.env.KILN_SCREENSHOTS) {
        mkdirSync(process.env.KILN_SCREENSHOTS, { recursive: true });
        writeFileSync(join(process.env.KILN_SCREENSHOTS, `weekly-limit-${mode === "automatic" ? "automatic" : "manual"}.png`), await page.screenshot());
      }
      claude.queue(...Array.from({ length: 8 }, () => fresh));
      if (mode === "automatic") await claude.refreshAccount();
      else await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Resume now')).click()`);
      // Recovery still completes the remaining audits and final pull request.
      await waitFor(() => !!h.engine.record.completedAt, 60_000); await h.engine.settled();
      const calls = h.claudeCalls();
      expect(calls[1]!.args).toContain("--resume");
      expect(calls[1]!.args).toContain(original.sessionIds[0]);
      expect(calls[1]!.prompt).toContain("the weekly usage limit");
      expect(calls[1]!.prompt).toContain("Carry on with the assigned Delivery audit");
      expect(h.engine.latestSession(key)!.runs[1]).toMatchObject({ cause: mode === "automatic" ? "limit_resume" : "person_resume", account: { email: "fresh@example.test" } });
      expect(h.engine.record.completionAudits!.activities.filter(a => a.kind === "delivery_audit")).toHaveLength(1);
      expect(page.problems).toEqual([]);
    } finally { await chrome.close(); }
  });

  it("automatically reaudits material finalization changes and reuses the existing final pull request", { timeout: 120_000 }, async () => {
    const final = pullRequestSession(); final.actions.unshift({ write: { path: `${directory}/value.mjs`, content: files["value.mjs"] + "// Finalization changed tracked implementation.\n" } }, { commit: "fix(value): retain final source update" }, { push: true });
    const h = await fixture(undefined, [final]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities.map(a => [a.kind, a.round])).toEqual([["delivery_audit",1],["test_audit",1],["delivery_audit",2],["test_audit",2]]);
    expect(h.claudeCalls().filter(c => c.prompt.includes("Open one pull request"))).toHaveLength(1);
    expect(h.engine.record.pullRequests).toHaveLength(1);
  });

  it("retains affected criteria and required action for a valid blocked audit report", async () => {
    const h = await fixture([auditSession({ blocked: true })]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const snapshot = buildSnapshot(h.engine); const activity = snapshot.activities!.find(row => row.kind === "delivery_audit")!;
    expect(activity.state).toBe("needs_you"); expect(activity.audit!.outcome).toBe("blocked");
    expect(activity.audit!.criteria.map(c => c.key)).toEqual([`acme-shop:${directory}/proof-prd.md#AC-PROOF-01`]);
    expect(activity.audit!.blockers).toEqual(["Required evidence is unavailable. Restore the named evidence."]);
    expect(snapshot.needsYou!.checks.flatMap(c => c.facts).join(" ")).toContain("AC-PROOF-01");
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("shows a durable next final-delivery row when paused after the clean test audit", { timeout: 120_000 }, async () => {
    const h = await fixture(); let requested = false;
    const off = h.engine.onChange(() => { if (!requested && h.engine.current?.session?.kind === "test_audit") { requested = true; h.engine.pause(); } });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); off();
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.feature.state).toBe("paused"); expect(snapshot.activities!.at(-1)).toMatchObject({ id: "pr", state: "next", title: "Final pull request" });
    expect(h.engine.nextKeyFromRecordedPlan()).toBe("pr");
    await h.engine.start(); await h.engine.settled(); expect(h.engine.record.completedAt).toBeTruthy();
  });

  it("rechecks an already accepted audit under its first development grant before consuming the gate", async () => {
    const h=await fixture(); let requested=false;
    const off=h.engine.onChange(()=>{if(!requested&&h.engine.current?.session?.kind==="delivery_audit"){requested=true;h.engine.pause();}});
    await h.engine.start({refinementConfirmed:true});await h.engine.settled();off();
    const audit=h.engine.record.completionAudits!.activities[0]!;const key=auditKey(audit);const accepted=audit.acceptedResult;
    const at=new Date().toISOString();h.engine.record.phases[key]!.stop={kind:"done_check",at,checkedAt:at,checks:[]};writePrdRecord(h.stateDirectory,h.engine.record);
    const target={repository:"github.com/acme/acme-shop",baseBranch:"develop",environment:"audit-fixture-dev"};
    expect(h.engine.authorizeDevelopmentTarget({executionId:h.engine.record.executionId,authorizationRevision:h.engine.record.developmentAuthorization!.revision,target,confirmedNonProduction:true})).toEqual({ok:true});
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe(key);expect(h.engine.record.phases[key]!.stop!.checks.some(c=>c.name==="Required development delivery verified"&&!c.passed)).toBe(true);
    expect(buildSnapshot(h.engine).needsYou!.resumePrompt).toContain("audit-fixture-dev");
    const context:DeliveryContext={record:h.engine.record,stateDirectory:h.stateDirectory,prdWorktree:h.engine.worktreePath,prdDirectory:directory,git:{git:h.tools.git,env:h.env},gh:h.tools.gh,env:h.env,owner:{kind:"audit",activityId:audit.activityId},now:()=>new Date().toISOString(),commands:async()=>[]};
    for(const item of h.engine.deliveryStatus().activationRecovery!){
      expect(item.owner).toBeDefined();const owner=item.owner!;const binding=ownerDocuments(context,owner);
      const body={executionId:h.engine.record.executionId,revision:h.engine.record.developmentDelivery!.revision,...(owner.kind==="phase"?{phaseId:owner.phaseId}:{owner}),...binding,required:false,criteria:owner.kind==="audit"?[`acme-shop:${directory}/proof-prd.md#AC-PROOF-01`]:[],reason:"The fixture needs no development delivery.",checkpoints:[]};
      expect(await h.engine.deliveryCommand("assessment",body)).toMatchObject({ok:true});
    }
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBeUndefined();expect(h.engine.record.pause.activeSince).toBeTruthy();
    expect(audit.acceptedResult).toBe(accepted);expect(h.claudeCalls()).toHaveLength(1);
    expect(h.engine.record.completionAudits!.activities[0]!.sessionIds).toEqual(audit.sessionIds);
  });

  it("keeps an allocated audit with no session through readiness refusal and Check again", async () => {
    const h=await fixture();const original={...h.engine.record.settings.agentChoices.claude_code!};let changed=false;
    const off=h.engine.onChange(()=>{if(!changed&&h.engine.record.completionAudits!.activities.length){changed=true;h.engine.record.settings.agentChoices.claude_code={model:"unavailable-model",effort:"high"};}});
    await h.engine.start({refinementConfirmed:true});await h.engine.settled();off();
    const audit=h.engine.record.completionAudits!.activities[0]!;const key=auditKey(audit);
    expect(h.engine.record.phases[key]!.stop!.kind).toBe("selection");expect(audit.sessionIds).toEqual([]);expect(h.claudeCalls()).toEqual([]);
    expect(await h.engine.changeSettings({agentId:h.engine.record.settings.agentId,selectionGeneration:h.engine.record.settings.selectionGeneration??0,model:original.model,effort:original.effort!})).toEqual({ok:true});
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify"));await h.engine.settled();
    expect(h.engine.record.completedAt).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities[0]!.activityId).toBe(audit.activityId);
    expect(h.engine.record.completionAudits!.activities).toHaveLength(2);
    expect(h.claudeCalls()).toHaveLength(3);
  });

  it("settles an upgraded active implementation with its original settings before adopting audit tasks", async () => {
    const open={...files,"phase-1-value.md":files["phase-1-value.md"].replace("**Closed:** 2026-10-24\n","")};
    const h=await fixture(undefined,[],open);const marker=join(h.sandbox.root,"active-phase");const finish=marker+"-finish";
    const first=landingSession(`${directory}/value.mjs`,files["value.mjs"]);first.actions.splice(1,0,{touch:marker},{waitForFile:finish});
    writeFileSync(h.scenarioPath,JSON.stringify({sessions:[first,landingSession(`${directory}/value.mjs`,files["value.mjs"]),pullRequestSession()]}));
    await h.engine.start({refinementConfirmed:true});await waitFor(()=>existsSync(marker));
    const original=h.engine.latestSession("1")!;
    expect(await h.engine.changeSettings({agentId:"claude_code",selectionGeneration:h.engine.record.settings.selectionGeneration??0,model:"sonnet",effort:"high"})).toEqual({ok:true});
    const stopping=h.engine.stop("sigint");writeFileSync(finish,"continue");await stopping;
    const path=join(h.stateDirectory,"prd.json");const old=JSON.parse(readFileSync(path,"utf8"));old.schemaVersion=5;delete old.completionAudits;delete old.activities;delete old.nextActivityKey;writeFileSync(path,JSON.stringify(old));
    const port=Number(new URL(server!.address).port);await server!.close();const again=h.reopenFromDisk();await again.agents.refresh();
    server=await startLocalServer({engine:again,port,folderName:"proof",featureName:"Audit value",token:again.record.token});
    expect(await again.decide()).toMatchObject({kind:"resume",phaseKey:"1",sessionId:original.sessionId});
    expect(again.record.completionAudits!.activities).toEqual([]);await again.continue();
    expect(again.record.completedAt,JSON.stringify(again.record.phases)).toBeTruthy();
    expect(again.record.phases["1"]!.sessionIds).toEqual([original.sessionId]);
    expect(again.latestSession("1")!.model).toBe(original.model);
    expect(again.latestSession(auditKey(again.record.completionAudits!.activities[0]!))!.model).toBe("sonnet");
  });

});
