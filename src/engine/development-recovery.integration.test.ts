import { recoveryRequest } from "../test-support/phase-recovery-request.js";
// Real synchronized Git work plus the captured GitHub contract; live provider/browser
// handoff proofs cover the external conversation and artifact boundaries separately.
import { afterEach, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { join } from "node:path";
import { git } from "../test-support/git-repositories.js";
import { landingSession } from "../test-support/engine-harness.js";
import { evaluateRepositories } from "./development-delivery.js";
import { buildSnapshot } from "./snapshot.js";
let fixture: Awaited<ReturnType<typeof deliveryFixture>> | undefined;
afterEach(async () => { await fixture?.h.cleanup(); fixture = undefined; });

// Budget the complete real Git/provider workflow spanning initial delivery,
// description repair, historical reopening and later review.
it("resumes only description repair after every source change is delivered, then completes without a duplicate PR", { timeout: 120_000 }, async () => {
  fixture = await deliveryFixture();
  const f = fixture;
  f.synchronize();
  expect(await evaluateRepositories(f.context)).toMatchObject({ passed: true, pullRequests: [] });
  f.pull.body = ""; f.save();
  const missing = await evaluateRepositories(f.context);
  expect(missing).toMatchObject({ passed: false, pullRequests: [] });
  expect(missing.checks.filter(check => !check.passed).flatMap(check => check.facts)).toEqual(["acme-shop: unresolved — acme-shop #1: add the PRD reference to the description."]);
  // Reopen the same real engine with the captured GitHub reader. Provider calls are
  // deterministic here; the actual provider continuation is proved by the kept runner.
  f.h.tools.gh = f.context.gh;
  Object.assign(f.h.env, f.context.env);
  writeFileSync(f.h.scenarioPath, JSON.stringify({ sessions: [landingSession(), { actions: [] }, { actions: [] }] }));
  const engine = f.h.reopen(); await engine.agents.refresh();
  await engine.checkAgain(recoveryRequest(engine, "verify")); await engine.settled();
  expect(engine.stoppedPhaseKey()).toBe("pr");
  const session = engine.latestSession("pr")!;
  const stop = buildSnapshot(engine).needsYou!;
  expect(stop.checks.filter(check => !check.passed).flatMap(check => check.facts)).toEqual(["acme-shop: unresolved — acme-shop #1: add the PRD reference to the description."]);
  expect(stop.resumePrompt).toContain("description links");
  const historicalMerge = structuredClone(engine.record.developmentDelivery!.checkpoints[0]!.merge);
  expect(await engine.resume({ ...recoveryRequest(engine), note: "Repair the missing description reference." })).toMatchObject({ ok: true });
  await engine.settled();
  const calls = f.h.claudeCalls();
  expect(calls.at(-1)!.args).toContain(session.sessionId);
  expect(calls.at(-1)!.prompt).toContain("saved early-merge authority");
  expect(calls.at(-1)!.prompt).toContain("Carry on finalizing delivery");
  expect(calls.at(-1)!.prompt).not.toContain("Carry on opening");
  expect(engine.record.completedAt).toBeUndefined();
  expect(engine.record.developmentDelivery!.checkpoints[0]!.merge).toEqual(historicalMerge);
  f.pull.body = `PRD: ${f.context.prdDirectory}/customer-returns-prd.md`; f.save();
  await engine.checkAgain(recoveryRequest(engine, "verify")); await engine.settled();
  expect(engine.record.completedAt).toBeDefined();
  expect(f.h.claudeCalls()).toHaveLength(calls.length);
  expect(engine.record.pullRequests ?? []).toEqual([]);
  expect(engine.record.developmentDelivery!.repositoryResults).toMatchObject([{ state: "delivered", deliveredCheckpointIds: [f.checkpoint.id] }]);
  expect(buildSnapshot(engine).phases.find(phase => phase.id === "pr")).toMatchObject({ title: "Finalize delivery", state: "done" });

  // AC-RECOVERY-03: completedAt is historical; reopening and Resume must inspect new work.
  const completedAt=engine.record.completedAt; const phaseDoneAt=engine.record.phases["1"]!.doneAt;
  writeFileSync(join(f.context.prdWorktree,"later.txt"),"Later review work after recorded completion\n");
  git(f.h.sandbox,f.context.prdWorktree,"add","later.txt"); git(f.h.sandbox,f.context.prdWorktree,"commit","-m","Later review work"); git(f.h.sandbox,f.context.prdWorktree,"push","origin",f.checkpoint.featureBranch);
  const currentHead=git(f.h.sandbox,f.context.prdWorktree,"rev-parse","HEAD").trim();
  const review={...structuredClone(f.pull),number:2,state:"open",merged_at:null,html_url:"https://github.com/acme/acme-shop/pull/2",body:`PRD: ${f.context.prdDirectory}\nEarlier delivery: ${f.pull.html_url}`};
  // This is a real current remote branch with an older PR head, not an unpushed workspace.
  review.head.sha=f.head;
  f.pull.body+=`\nReview: ${review.html_url}`;
  f.responses[`repos/acme/acme-shop/pulls?state=open&head=${encodeURIComponent("acme:"+f.checkpoint.featureBranch)}&base=develop&per_page=100&page=1`]={body:[review]};
  f.responses["repos/acme/acme-shop/pulls/2"]={body:review}; f.save();
  const reopened=f.h.reopenFromDisk(); await reopened.agents.refresh();
  expect(await reopened.decide()).toMatchObject({kind:"needs_you",phaseKey:"pr"});
  expect(reopened.currentlyComplete).toBe(false);
  expect(reopened.record.completedAt).toBe(completedAt);
  expect(reopened.record.phases["1"]!.doneAt).toBe(phaseDoneAt);
  expect(reopened.record.developmentDelivery!.checkpoints[0]!.merge).toEqual(historicalMerge);
  expect(f.h.claudeCalls()).toHaveLength(calls.length);
  writeFileSync(f.h.scenarioPath, JSON.stringify({sessions:[landingSession(),{actions:[]},{actions:[]},{actions:[]}]}));
  expect(await reopened.resume({ ...recoveryRequest(reopened),note:"Keep this reply: include the later review work."})).toMatchObject({ok:true});
  await reopened.settled();
  const resumed=f.h.claudeCalls();
  expect(resumed).toHaveLength(calls.length+1);
  expect(resumed.at(-1)!.args).toContain(session.sessionId);
  expect(resumed.at(-1)!.prompt).toContain("Keep this reply: include the later review work.");
  expect(reopened.currentlyComplete).toBe(false);
  review.head.sha=currentHead; f.save();
  await reopened.checkAgain(recoveryRequest(reopened, "verify")); await reopened.settled();
  expect(reopened.currentlyComplete).toBe(true);
  expect(reopened.record.completedAt).toBe(completedAt);
  expect(f.h.claudeCalls()).toHaveLength(resumed.length);
  expect(reopened.record.developmentDelivery!.repositoryResults).toMatchObject([{state:"mixed",remainingHeadSha:currentHead,reviewPullRequest:{number:2}}]);
});

it("completes delivered work without inventing a finalization session or row", async () => {
  const f=fixture=await deliveryFixture(); f.synchronize();
  f.h.tools.gh=f.context.gh; Object.assign(f.h.env,f.context.env);
  const engine=f.h.reopen(); await engine.agents.refresh();
  const calls=f.h.claudeCalls().length;
  await engine.checkAgain(recoveryRequest(engine, "verify")); await engine.settled();
  expect(engine.currentlyComplete).toBe(true);
  expect(engine.latestSession("pr")).toBeUndefined();
  expect(buildSnapshot(engine).phases.some(phase=>phase.id==="pr")).toBe(false);
  expect(f.h.claudeCalls()).toHaveLength(calls);
});
