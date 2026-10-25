// Automatic routing with real Git, packaged CLI/HTTP, persisted state and scripted provider
// transcripts. Both actual providers are separately exercised by the installed-package proof.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { takeInstanceLock } from "../state/instance-lock.js";
import { stateRoot } from "../state/state-files.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { launchChrome } from "../test-support/headless-chrome.js";
import { writePrdRecord } from "../state/records.js";
import { ownerDocuments, type DeliveryContext } from "./development-delivery.js";
import { buildSnapshot } from "./snapshot.js";
import { auditKey } from "../audit/workflow.js";

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
async function fixture(auditSessions?: unknown[], sessions = [pullRequestSession()], documentFiles = files) {
  h = await createHarness({ folder: "proof", files: documentFiles, sessions, auditCycles: true });
  writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
  if (auditSessions) writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions }));
  const lock = await takeInstanceLock(stateRoot(h.env), h.stateDirectory); if (!lock.taken) throw new Error("Fixture lock unavailable"); release = lock.release;
  server = await startLocalServer({ engine: h.engine, port: lock.port, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
  return h;
}
const auditSession = (behavior: Record<string, unknown> = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
describe("automatic completion activities", () => {
  it("audits a closed-at-start plan through both gates before final delivery without another Start", async () => {
    const h = await fixture();
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities.map(a => a.kind)).toEqual(["delivery_audit", "test_audit"]);
    expect(h.engine.record.completionAudits!.activities.every(a => a.acceptedResult && h.engine.record.phases[auditKey(a)]?.doneAt)).toBe(true);
    expect(h.claudeCalls().map(c => /^Run (Delivery audit|Test audit)/.exec(c.prompt)?.[1] ?? "Final delivery")).toEqual(["Delivery audit", "Test audit", "Final delivery"]);
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.feature.phasesTotal).toBe(1); expect(snapshot.feature.phasesDone).toBe(1);
    expect(snapshot.activities!.map(a => a.title)).toEqual(["Return value", "Delivery audit", "Test audit", "Final pull request"]);
    expect(snapshot.activities!.filter(a => a.audit).every(a => a.audit!.criteria.length === 1)).toBe(true);
    const again = h.reopenFromDisk(); await again.agents.refresh(); expect((await again.decide()).kind).toBe("complete");
    expect(h.claudeCalls()).toHaveLength(3);
  });
  it("implements two appended repair rounds including split children before the clean test audit", async () => {
    const firstRepair=landingSession(`${directory}/value.mjs`,files["value.mjs"]);
    firstRepair.actions.splice(1,0,{split:[{id:"2a",slug:"first",title:"First repair",closed:true,criteria:"AC-PROOF-01"},{id:"2b",slug:"second",title:"Second repair",criteria:"AC-PROOF-01"}]});
    const h = await fixture([auditSession({ gap: true }), auditSession({ gap: true }), auditSession(), auditSession()], [firstRepair,landingSession(`${directory}/value.mjs`, files["value.mjs"]), landingSession(`${directory}/value.mjs`, files["value.mjs"]), pullRequestSession()]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities.map(a => [a.kind, a.round])).toEqual([["delivery_audit", 1], ["delivery_audit", 2], ["delivery_audit", 3], ["test_audit", 1]]);
    expect(buildSnapshot(h.engine).activities!.map(a => a.title)).toEqual(["Return value", "Delivery audit", "Repair value", "First repair", "Second repair", "Delivery audit", "Repair value", "Delivery audit", "Test audit", "Final pull request"]);
    expect(readFileSync(join(h.engine.worktreePath, directory, "phase-1-value.md"), "utf8")).toBe(files["phase-1-value.md"]);
    expect(h.events.flatMap(e=>e.kind==="audit"&&e.event==="started"?[`${e.label} round ${e.round}`]:e.kind==="phase"&&e.event==="started"?[`Phase ${e.phaseId}`]:[])).toEqual(["Delivery audit round 1","Phase 2","Phase 2b","Delivery audit round 2","Phase 3","Delivery audit round 3","Test audit round 1"]);
  });
  it("stops a normal audit exit without a report and keeps its identity for Check again", async () => {
    const h = await fixture([auditSession({ noReport: true })]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const activity = h.engine.record.completionAudits!.activities[0]!; const key = auditKey(activity);
    expect(h.engine.stoppedPhaseKey()).toBe(key); expect(h.engine.record.phases[key]!.stop!.checks.some(c => c.name === "missing_evidence" && !c.passed)).toBe(true);
    await h.engine.checkAgain(); await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1); expect(h.engine.record.completionAudits!.activities).toHaveLength(1); expect(h.engine.record.completedAt).toBeUndefined();
  });
  it("recovers a committed report without submission and pauses at the audit boundary", async () => {
    const h = await fixture([auditSession({ skipSubmit: true })]);
    let requested = false;
    const off = h.engine.onChange(() => { if (!requested && h.engine.current?.session?.kind === "delivery_audit") { requested = true; h.engine.pause(); } });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); off();
    expect(h.engine.record.pause.activeSince).toBeTruthy(); expect(h.claudeCalls()).toHaveLength(1);
    const activity = h.engine.record.completionAudits!.activities[0]!; expect(activity.acceptedResult).toBeTruthy();
    expect(h.engine.record.phases[auditKey(activity)]!.doneAt).toBeTruthy();
    await h.engine.start(); await h.engine.settled(); expect(h.engine.record.completedAt).toBeTruthy(); expect(h.claudeCalls()).toHaveLength(3);
  });

  it("shows audit rows and findings in the real browser, with pause and immediate continuation", async () => {
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
      await page.waitFor(`document.body.innerText.includes('Test audit') && document.body.innerText.includes('PR ready for review')`);
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

  it("resumes usage-limited audit work in its original activity and conversation with current task and user note", async () => {
    const h = await fixture([{ actions: [{ skill: "delivery-audit" }, { refuse: { rateLimitType: "five_hour" } }] }, auditSession()]);
    h.engine.record.settings.resumeAfterUsageLimit = false;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const original = h.engine.record.completionAudits!.activities[0]!; const key = auditKey(original);
    expect(h.engine.record.phases[key]!.stop?.limit).toBeTruthy();
    expect(await h.engine.resume({ note: "Check the value before continuing." })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.engine.record.completedAt, JSON.stringify(h.engine.record.phases)).toBeTruthy();
    expect(h.engine.record.completionAudits!.activities[0]!.activityId).toBe(original.activityId);
    const calls = h.claudeCalls(); expect(calls[1]!.args).toContain("--resume"); expect(calls[1]!.args).toContain(original.sessionIds[0]);
    expect(calls[1]!.prompt.indexOf("Check the value")).toBeLessThan(calls[1]!.prompt.indexOf("Carry on with the assigned Delivery audit"));
    expect(calls[1]!.prompt).toContain(original.reportPath);
  });

  it("automatically reaudits material finalization changes and reuses the existing final pull request", async () => {
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

  it("shows a durable next final-delivery row when paused after the clean test audit", async () => {
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
    await h.engine.checkAgain();await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe(key);expect(h.engine.record.phases[key]!.stop!.checks.some(c=>c.name==="Required development delivery verified"&&!c.passed)).toBe(true);
    expect(buildSnapshot(h.engine).needsYou!.resumePrompt).toContain("audit-fixture-dev");
    const context:DeliveryContext={record:h.engine.record,stateDirectory:h.stateDirectory,prdWorktree:h.engine.worktreePath,prdDirectory:directory,git:{git:h.tools.git,env:h.env},gh:h.tools.gh,env:h.env,owner:{kind:"audit",activityId:audit.activityId},now:()=>new Date().toISOString(),commands:async()=>[]};
    for(const item of h.engine.deliveryStatus().activationRecovery!){
      expect(item.owner).toBeDefined();const owner=item.owner!;const binding=ownerDocuments(context,owner);
      const body={executionId:h.engine.record.executionId,revision:h.engine.record.developmentDelivery!.revision,...(owner.kind==="phase"?{phaseId:owner.phaseId}:{owner}),...binding,required:false,criteria:owner.kind==="audit"?[`acme-shop:${directory}/proof-prd.md#AC-PROOF-01`]:[],reason:"The fixture needs no development delivery.",checkpoints:[]};
      expect(await h.engine.deliveryCommand("assessment",body)).toMatchObject({ok:true});
    }
    await h.engine.checkAgain();await h.engine.settled();
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
    await h.engine.checkAgain();await h.engine.settled();
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
