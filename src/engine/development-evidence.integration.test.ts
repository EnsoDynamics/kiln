// Captured/verified provider contracts supplement live Claude, Codex and GitHub proofs; source/recovery use real Git.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { buildSnapshot } from "./snapshot.js";
import { sessionFiles } from "../session/claude-session.js";
import { formatDecisionLine, formatSummaryLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import { reconcileDelivery, phaseDeliveryCheck, prepareOperation, evaluateRepositories, submitEvidence } from "./development-delivery.js";
let fixture: Awaited<ReturnType<typeof deliveryFixture>> | undefined;
afterEach(async () => { await fixture?.h.cleanup(); fixture = undefined; });
async function setup(method: "merge" | "squash" | "rebase" = "squash") { return fixture = await deliveryFixture(method); }

describe("independent delivery evidence and continuation", () => {
  it.each(["merge","squash","rebase"] as const)("recovers a remotely accepted %s after local save interruption and requires safe source synchronization", async method => {
    const f = await setup(method);
    expect(f.checkpoint.operations[0]?.state).toBe("prepared");
    await reconcileDelivery(f.context);
    expect(f.checkpoint.merge).toMatchObject({ sourceHead: f.head, mergedHead: f.head, resultSha: f.merged, number: 1 });
    expect(f.checkpoint.operations[0]?.state).toBe("observed");
    expect(f.checkpoint.evidence.map(one => [one.requirementId,one.status])).toEqual([["deploy","success"],["verify","success"]]);
    expect(phaseDeliveryCheck(f.context,"1").passed).toBe(false);
    const prepared = await prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"synchronize"}});
    expect(prepared.disposition).toBe("proceed");
    const before = f.checkpoint.operations.find(one => one.id === prepared.operationId)!;
    git(f.h.sandbox,f.context.prdWorktree,"fetch","origin","develop"); git(f.h.sandbox,f.context.prdWorktree,"merge","--no-edit","origin/develop"); git(f.h.sandbox,f.context.prdWorktree,"push","origin",f.checkpoint.featureBranch);
    await reconcileDelivery(f.context);
    expect(before).toMatchObject({state:"observed",synchronized:{baseHead:f.merged}});
    expect(phaseDeliveryCheck(f.context,"1").passed).toBe(true);
    const final=await evaluateRepositories(f.context); expect(final).toMatchObject({passed:true,pullRequests:[]});
    expect(f.h.engine.record.developmentDelivery!.repositoryResults).toMatchObject([{repository:"acme-shop",state:"delivered",deliveredCheckpointIds:[f.checkpoint.id]}]);
    const synchronized = structuredClone(before.synchronized);
    writeFileSync(join(f.context.prdWorktree,"later.txt"),"new review work\n");git(f.h.sandbox,f.context.prdWorktree,"add","later.txt");git(f.h.sandbox,f.context.prdWorktree,"commit","-m","Later content must remain review work");git(f.h.sandbox,f.context.prdWorktree,"push","origin",f.checkpoint.featureBranch);
    await reconcileDelivery(f.context);expect(before.synchronized).toEqual(synchronized);
    const head=git(f.h.sandbox,f.context.prdWorktree,"rev-parse","HEAD").trim();
    const review={...f.pull,number:2,state:"open",merged_at:null,draft:false,html_url:"https://github.com/acme/acme-shop/pull/2",body:"PRD docs/prds/customer-returns/customer-returns-prd.md\nEarlier delivery: https://github.com/acme/acme-shop/pull/1",head:{sha:head,ref:f.checkpoint.featureBranch,repo:{full_name:"acme/acme-shop"}}};
    f.pull.body+="\nRemaining review: https://github.com/acme/acme-shop/pull/2";
    const endpoint=`repos/acme/acme-shop/pulls?state=open&head=${encodeURIComponent("acme:"+f.checkpoint.featureBranch)}&base=develop&per_page=100&page=1`;
    f.responses[endpoint]={body:[review]};f.responses["repos/acme/acme-shop/pulls/2"]={body:review};f.save();
    expect(await evaluateRepositories(f.context)).toMatchObject({passed:true,pullRequests:[{number:2,url:review.html_url}]});
    expect(f.h.engine.record.developmentDelivery!.repositoryResults[0]).toMatchObject({state:"mixed",remainingHeadSha:head});
    review.head.sha=f.head;f.save();expect((await evaluateRepositories(f.context)).passed).toBe(false);
  });
  it("retains historical success when a later development deployment makes its source inactive", async () => {
    const f=await setup();f.synchronize();
    f.responses["repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1"]={body:[{...f.status,state:"inactive",created_at:f.at(60)},f.status]};f.save();
    await reconcileDelivery(f.context);expect(phaseDeliveryCheck(f.context,"1").passed).toBe(true);expect((await evaluateRepositories(f.context)).passed).toBe(true);
    expect(f.checkpoint.evidence.find(one=>one.requirementId==="deploy")?.occurredAt).toBe(f.at(20));
  });
  it.each(["wrong environment","wrong immutable artifact","skipped required job","verification started before deployment","unrelated deployment job"])("does not promote a merge to verified delivery with %s", async condition => {
    const f=await setup();f.synchronize();
    if(condition==="wrong environment")f.deployment.environment="another-environment";
    if(condition==="wrong immutable artifact") {
      f.deployment.sha="a".repeat(40);
      // Keep deployment and verification internally consistent: only source containment is wrong.
      f.run.head_sha=f.deployment.sha;
      f.responses[`repos/acme/acme-shop/compare/${f.merged}...${f.deployment.sha}`]={body:{status:"diverged",merge_base_commit:{sha:f.head}}};
    }
    if(condition==="skipped required job"){f.jobs.jobs[1]!.conclusion="skipped";}
    if(condition==="verification started before deployment")f.jobs.jobs[1]!.started_at=f.at(15);
    if(condition==="unrelated deployment job")f.jobs.jobs[0]!.html_url="https://github.com/acme/acme-shop/actions/runs/another/job/31";
    f.save();await reconcileDelivery(f.context);
    expect(f.checkpoint.merge?.resultSha).toBe(f.merged);expect(phaseDeliveryCheck(f.context,"1").passed).toBe(false);expect((await evaluateRepositories(f.context)).passed).toBe(false);
    expect(f.checkpoint.unresolvedReason).toBeTruthy();
    if(condition==="wrong immutable artifact") {
      expect(f.checkpoint.unresolvedRequirements?.deploy).toBe("Deployed revision does not demonstrably contain the merge result.");
      expect(f.checkpoint.evidence.some(fact=>fact.requirementId==="deploy"&&fact.status==="success")).toBe(false);
    }
  });
  it.each(["pending","closed unmerged"])("does not repeat an uncertain merge or accept %s as a merge", async condition => {
    const f=await setup();f.pull.merged_at=null;f.pull.state=condition==="pending"?"open":"closed";f.save();
    await reconcileDelivery(f.context);expect(f.checkpoint.merge).toBeUndefined();
    const result=await prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"merge"}});expect(result.disposition).toBe("unresolved");expect(f.checkpoint.operations).toHaveLength(1);
    expect(readFileSync(join(f.h.sandbox.root,"delivery-gh-calls.jsonl"),"utf8")).not.toContain('"merge"');
  });
  it("preserves successful facts but leaves unavailable provider evidence unresolved",async()=>{
    const f=await setup();f.synchronize();await reconcileDelivery(f.context);const prior=structuredClone(f.checkpoint.evidence);
    f.responses["repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1"]={error:"temporary provider outage"};f.save();
    await reconcileDelivery(f.context);expect(f.checkpoint.evidence).toEqual(prior);expect(f.h.engine.record.developmentDelivery!.sourceUnavailable).toBe(true);expect(phaseDeliveryCheck(f.context,"1").passed).toBe(false);
    // Manual handoff must distinguish an unavailable required source from unfinished work.
    f.h.tools.gh = f.context.gh;
    f.h.env.KILN_DELIVERY_GH_RESPONSES = f.context.env.KILN_DELIVERY_GH_RESPONSES;
    const stopped = structuredClone(f.h.engine.record.phases["1"]!.stop);
    const target = f.h.engine.phaseRecoveryTarget()!;
    const calls = f.h.claudeCalls().length;
    for (const action of ["resume", "verify"] as const) {
      const answer = action === "resume" ? await f.h.engine.resume({ target, note: "must remain unsent" }) : await f.h.engine.checkAgain({ target, intent: "verify" });
      expect(answer).toMatchObject({ ok: false, status: 503, code: "check_unavailable" });
      // The rows stay; the unfinished recheck is recorded as the stop's latest run, so Mark complete is not offered (waivers "Check Runs").
      const { run, ...kept } = f.h.engine.record.phases["1"]!.stop!;
      expect({ ...kept, run: stopped!.run }).toEqual(stopped); expect(run).toMatchObject({ origin: "recheck", finished: false });
      expect(f.h.claudeCalls()).toHaveLength(calls);
    }
    const status=f.h.engine.deliveryStatus();
    expect(await f.h.engine.deliveryCommand("assessment",{executionId:status.executionId,revision:status.revision,phaseId:"1",documentsDigest:status.documentsDigest,required:true,criteria:f.checkpoint.criteria,reason:"Retain the required delivery while its current source is unavailable",checkpoints:[]})).toMatchObject({ok:true});
    expect(f.h.events.filter(one=>one.kind==="delivery"&&one.stage==="Deployment").at(-1)).toMatchObject({outcome:expect.stringMatching(/^unresolved/)});
  });
  it.each(["failed latest local test","failed latest check run","failed legacy status","review required","queued"])("refuses merge preparation with %s",async condition=>{
    const f=await setup();f.pull.state="open";f.pull.merged_at=null;f.checkpoint.operations=[];
    f.responses[`repos/acme/acme-shop/pulls?state=all&head=${encodeURIComponent("acme:"+f.checkpoint.featureBranch)}&base=develop&per_page=100&page=1`]={body:[f.pull]};
    f.responses[`repos/acme/acme-shop/commits/${f.head}/check-runs?per_page=100&page=1`]={body:{check_runs:[{id:1,name:"required-check",status:"completed",conclusion:"success"},...(condition==="failed latest check run"?[{id:2,name:"required-check",status:"completed",conclusion:"failure"}]:[])]}};
    f.responses[`repos/acme/acme-shop/commits/${f.head}/statuses?per_page=100&page=1`]={body:condition==="failed legacy status"?[{context:"required-check",state:"failure"}]:[]};
    f.responses["pr-view"]={body:{headRefOid:f.head,mergeable:"MERGEABLE",mergeStateStatus:condition==="queued"?"BLOCKED":"CLEAN",reviewDecision:condition==="review required"?"REVIEW_REQUIRED":"APPROVED"}};
    if(condition==="failed latest local test"){
      f.checkpoint.requirements.push({id:"local-test",purpose:"pre_merge",source:f.checkpoint.workflowSource,match:{kind:"command",invocation:"node test.mjs {{sourceRevision}}",cwd:f.context.prdWorktree,fields:{}}});
      f.checkpoint.references!.push({requirementId:"local-test",kind:"command",id:"earlier-success",sessionId:"recorded-session"});
      f.context.commands=()=>Promise.resolve([{source:"actual provider contract",callId:"earlier-success",command:`node test.mjs ${f.head}`,cwd:f.context.prdWorktree,calledAt:f.at(1),resultAt:f.at(2),outcome:"success",output:"passed"},{source:"actual provider contract",callId:"later-failure",command:`node test.mjs ${f.head}`,cwd:f.context.prdWorktree,calledAt:f.at(3),resultAt:f.at(4),outcome:"error",output:"failed"}]);
      f.save();await reconcileDelivery(f.context);expect(f.checkpoint.evidence.some(one=>one.requirementId==="local-test")).toBe(true);
      f.checkpoint.references!.push({requirementId:"local-test",kind:"command",id:"later-failure",sessionId:"recorded-session"});
    }
    f.save();await expect(prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"merge"}})).rejects.toThrow();
    expect(f.checkpoint.operations).toHaveLength(0);
  });
  it("shows observed delivery separately from prepared intents, preserves Follow-up, and reopens historical Done rows",async()=>{
    const f=await setup();const engine=f.h.engine;const session=engine.latestSession("1")!;
    delete engine.record.phases["1"]!.stop;engine.current={phaseKey:"1",session,commits:[],processRunning:true};
    const file=sessionFiles(f.h.stateDirectory,session).output;const line=(text:string,at=f.at(50))=>writeFileSync(file,JSON.stringify({line:1,at,source:"tool",text})+"\n");
    line("Bash node development-driver.mjs prepare-merge");expect(buildSnapshot(engine).current?.deliveryActivity).toEqual({label:"Implementing"});
    line(`Bash gh pr merge 1 --repo github.com/acme/acme-shop --squash --match-head-commit ${f.head}`);
    expect(buildSnapshot(engine).current?.deliveryActivity).toEqual({label:"Merging",repository:f.checkpoint.target.repository,environment:"test-development"});
    f.responses["repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1"]={body:[{...f.status,state:"in_progress"}]};f.save();await reconcileDelivery(f.context);
    line("Bash gh run watch 21 --repo acme/acme-shop");expect(buildSnapshot(engine).current?.deliveryActivity?.label).toBe("Deploying");
    f.responses["repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1"]={body:[f.status]};f.run.status="in_progress";f.run.conclusion="";f.jobs.jobs[1]!.status="in_progress";f.save();await reconcileDelivery(f.context);
    expect(buildSnapshot(engine).current?.deliveryActivity?.label).toBe("Verifying");
    line("Edit src/next-step.ts",new Date(Date.now()+1000).toISOString());const before=buildSnapshot(engine).current!;expect(before.deliveryActivity?.label).toBe("Implementing");expect(before.steps.map(one=>one.name)).toEqual(["Build","Deliverable review","Test hardening","Commit","Refactor pass","Push"]);
    session.runs.push({...session.runs.at(-1)!,cause:"person_resume",note:"Continue the implementation"});const follow=buildSnapshot(engine).current!;expect(follow.followUp).toBe(true);expect(follow.steps.map(one=>one.name)).toEqual(before.steps.map(one=>one.name));expect(follow.startedAt).toBe(before.startedAt);
    engine.current=undefined;engine.record.phases["1"]!.doneAt=f.at(40);engine.record.phases["1"]!.stop={kind:"done_check",at:f.at(60),checkedAt:f.at(60),checks:[{name:"Required development delivery verified",passed:false,facts:["Deployment evidence is unresolved"]}]};
    const stopped=buildSnapshot(engine);expect(stopped.phases.find(one=>one.id==="1")?.state).toBe("needs_you");expect(stopped.feature.phasesDone).toBe(0);expect(formatSummaryLine(engine,terminalColors({isTTY:false},{}))).toContain("0 of 1 phases done");
    engine.record.developmentDelivery!.repositoryResults=[{repository:"acme-shop",state:"mixed",deliveredCheckpointIds:[f.checkpoint.id],reviewPullRequest:{number:2,url:"https://github.com/acme/acme-shop/pull/2"},reasons:[]}];
    const text=formatDecisionLine({kind:"complete"},engine,terminalColors({isTTY:false},{}));expect(text).toContain("delivered https://github.com/acme/acme-shop/pull/1");expect(text).toContain("review https://github.com/acme/acme-shop/pull/2");
  });
  it("finishes work with no early delivery using its exact open review PR, and refuses missing review",async()=>{
    const f=fixture=await deliveryFixture("none");const state=f.h.engine.record.developmentDelivery!;state.checkpoints=[];state.assessments[0]!.required=false;state.assessments[0]!.checkpointIds=[];
    f.pull.state="open";f.pull.merged_at=null;const endpoint=`repos/acme/acme-shop/pulls?state=open&head=${encodeURIComponent("acme:"+f.checkpoint.featureBranch)}&base=develop&per_page=100&page=1`;
    f.responses[endpoint]={body:[f.pull]};f.save();expect(await evaluateRepositories(f.context)).toMatchObject({passed:true,pullRequests:[{number:1}]});expect(state.repositoryResults[0]?.state).toBe("review");
    f.responses[endpoint]={body:[]};f.save();expect((await evaluateRepositories(f.context)).passed).toBe(false);expect(state.repositoryResults[0]?.state).toBe("unresolved");
  });
  // AC-DELIVER-02: exercise the delivery evaluator after deletion, not just Git's push behavior.
  it("refuses a missing or unrelated recreated remote branch without losing delivered history", async () => {
    const f=await setup(); f.synchronize();
    expect((await evaluateRepositories(f.context)).passed).toBe(true);
    const merge=structuredClone(f.checkpoint.merge);
    const feature=f.checkpoint.featureBranch;
    const localHead=git(f.h.sandbox,f.context.prdWorktree,"rev-parse","HEAD").trim();
    git(f.h.sandbox,f.context.prdWorktree,"push","origin","--delete",feature);
    const unrelated=git(f.h.sandbox,f.h.repository,"commit-tree","HEAD^{tree}","-m","Unrelated branch owner with no shared ancestry").trim();
    for (const recreated of [false,true]) {
      if (recreated) git(f.h.sandbox,f.h.repository,"push","origin",`${unrelated}:refs/heads/${feature}`);
      expect((await evaluateRepositories(f.context)).passed).toBe(false);
      expect(f.h.engine.record.developmentDelivery!.repositoryResults[0]).toMatchObject({state:"unresolved",deliveredCheckpointIds:[f.checkpoint.id],reasons:["acme-shop: current feature head is not pushed to its assigned origin branch."]});
      expect(f.checkpoint.merge).toEqual(merge);
      expect(git(f.h.sandbox,f.context.prdWorktree,"rev-parse","HEAD").trim()).toBe(localHead);
    }
  });
  it("does not manufacture delivered provenance from equal synchronized source and base trees", async () => {
    const f=await setup(); f.synchronize();
    expect((await evaluateRepositories(f.context)).passed).toBe(true);
    expect(git(f.h.sandbox,f.context.prdWorktree,"rev-parse","HEAD^{tree}").trim()).toBe(git(f.h.sandbox,f.context.prdWorktree,"rev-parse","origin/develop^{tree}").trim());
    const state=f.h.engine.record.developmentDelivery!;
    state.checkpoints=[]; state.assessments[0]!.required=false; state.assessments[0]!.checkpointIds=[];
    f.responses[`repos/acme/acme-shop/pulls?state=open&head=${encodeURIComponent("acme:"+f.checkpoint.featureBranch)}&base=develop&per_page=100&page=1`]={body:[]}; f.save();
    expect(await evaluateRepositories(f.context)).toMatchObject({passed:false,pullRequests:[]});
    expect(state.repositoryResults[0]).toMatchObject({state:"unresolved",deliveredCheckpointIds:[],reasons:["acme-shop: open, non-draft review PR must contain the exact current pushed head."]});
  });
  it.each(["draft","wrong base","fork","closed on reread","draft on reread","old head on reread"])("rejects remaining review with %s in an enabled execution", async condition => {
    const f=fixture=await deliveryFixture("none"); const state=f.h.engine.record.developmentDelivery!;
    state.checkpoints=[]; state.assessments[0]!.required=false; state.assessments[0]!.checkpointIds=[];
    f.pull.state="open"; f.pull.merged_at=null;
    const listed=structuredClone(f.pull);
    const endpoint=`repos/acme/acme-shop/pulls?state=open&head=${encodeURIComponent("acme:"+f.checkpoint.featureBranch)}&base=develop&per_page=100&page=1`;
    f.responses[endpoint]={body:[listed]}; f.save();
    expect((await evaluateRepositories(f.context)).passed).toBe(true);
    if(condition==="draft")listed.draft=true;
    if(condition==="wrong base")listed.base.ref="main";
    if(condition==="fork")listed.head.repo.full_name="someone/acme-shop";
    if(condition==="closed on reread")f.pull.state="closed";
    if(condition==="draft on reread")f.pull.draft=true;
    if(condition==="old head on reread")f.pull.head.sha=f.checkpoint.baseSha;
    f.save();
    expect(await evaluateRepositories(f.context)).toMatchObject({passed:false,pullRequests:[]});
    expect(state.repositoryResults[0]?.state).toBe("unresolved");
    expect(state.repositoryResults[0]?.reasons).toEqual([condition.endsWith("on reread") ? "The remaining review PR changed or returned incomplete facts." : "acme-shop: open, non-draft review PR must contain the exact current pushed head."]);
  });
  it.each(["revision","environment"])("rejects a successful command whose typed %s disagrees with the intended artifact", async field => {
    const f=await setup(); f.synchronize();
    f.checkpoint.requirements[1]={id:"verify",purpose:"verification",source:f.checkpoint.workflowSource,match:{kind:"command",invocation:"node verify.mjs {{mergeRevision}} {{environment}}",cwd:f.context.prdWorktree,fields:{"/revision":"$mergeRevision","/environment":"$environment"}}};
    f.checkpoint.references![1]={requirementId:"verify",kind:"command",id:"verify-result",sessionId:"recorded-session"};
    const output={revision:f.merged,environment:f.checkpoint.target.environment};
    f.context.commands=()=>Promise.resolve([{source:"verified provider contract",callId:"verify-result",command:`node verify.mjs ${f.merged} ${f.checkpoint.target.environment}`,cwd:f.context.prdWorktree,calledAt:f.at(21),resultAt:f.at(30),outcome:"success",output:JSON.stringify(output)}]);
    await reconcileDelivery(f.context); expect(phaseDeliveryCheck(f.context,"1").passed).toBe(true);
    output[field as "revision"|"environment"]=field==="revision" ? "a".repeat(40) : "another-environment";
    // A revision the provider shows does not contain the merge stays a mismatch.
    if(field==="revision"){f.responses[`repos/acme/acme-shop/compare/${f.merged}...${"a".repeat(40)}`]={body:{status:"diverged",merge_base_commit:{sha:f.head}}};f.save();}
    await reconcileDelivery(f.context);
    expect(f.checkpoint.merge?.resultSha).toBe(f.merged);
    expect(f.checkpoint.unresolvedRequirements?.verify).toBe(`verify: /${field} does not match its declared target/artifact.`);
    expect(phaseDeliveryCheck(f.context,"1").passed).toBe(false);
    expect((await evaluateRepositories(f.context)).passed).toBe(false);
  });
  it.each([["accepts","ahead"],["refuses","diverged"],["refuses","unknown to GitHub"]] as const)("%s a verification that reports a later same-target revision the provider shows is %s of the merge", async (outcome, status) => {
    // A later checkpoint deployed to the same environment replaces this one's artifact; its exact merge can never be current again.
    const f=await setup(); f.synchronize();
    f.checkpoint.requirements[1]={id:"verify",purpose:"verification",source:f.checkpoint.workflowSource,match:{kind:"command",invocation:"node verify.mjs {{mergeRevision}} {{environment}}",cwd:f.context.prdWorktree,fields:{"/revision":"$mergeRevision","/environment":"$environment"}}};
    f.checkpoint.references![1]={requirementId:"verify",kind:"command",id:"verify-result",sessionId:"recorded-session"};
    const later="b".repeat(40);
    f.responses[`repos/acme/acme-shop/compare/${f.merged}...${later}`]=status==="unknown to GitHub"?{error:"gh: Not Found (HTTP 404)\n"}:{body:{status,merge_base_commit:{sha:status==="ahead"?f.merged:f.head}}}; f.save();
    f.context.commands=()=>Promise.resolve([{source:"verified provider contract",callId:"verify-result",command:`node verify.mjs ${f.merged} ${f.checkpoint.target.environment}`,cwd:f.context.prdWorktree,calledAt:f.at(21),resultAt:f.at(30),outcome:"success",output:JSON.stringify({revision:later,environment:f.checkpoint.target.environment})}]);
    await reconcileDelivery(f.context);
    if (outcome==="accepts") {
      expect(f.checkpoint.evidence.find(one=>one.requirementId==="verify")).toMatchObject({status:"success",revision:f.merged,observedRevision:later});
      expect(phaseDeliveryCheck(f.context,"1").passed).toBe(true);
    } else {
      expect(f.checkpoint.unresolvedRequirements?.verify).toBe("verify: /revision does not match its declared target/artifact.");
      expect(phaseDeliveryCheck(f.context,"1").passed).toBe(false);
      // A refusal of this one requirement, never a provider outage that holds the whole ledger.
      expect(f.h.engine.record.developmentDelivery!.sourceUnavailable).toBeFalsy();
    }
  });
  it("records the later revision a command deployment actually reports, and binds verification of that revision to it", async () => {
    const f=await setup(); f.synchronize();
    const later="c".repeat(40);
    f.responses[`repos/acme/acme-shop/compare/${f.merged}...${later}`]={body:{status:"ahead",merge_base_commit:{sha:f.merged}}}; f.save();
    f.checkpoint.requirements[0]={id:"deploy",purpose:"deployment",source:f.checkpoint.workflowSource,match:{kind:"command",invocation:"node deploy.mjs {{mergeRevision}} {{environment}}",cwd:f.context.prdWorktree,fields:{"/revision":"$mergeRevision"}}};
    f.checkpoint.requirements[1]={id:"verify",purpose:"verification",source:f.checkpoint.workflowSource,match:{kind:"command",invocation:"node verify.mjs {{mergeRevision}} {{environment}}",cwd:f.context.prdWorktree,fields:{"/revision":"$mergeRevision"}}};
    f.checkpoint.references=[{requirementId:"deploy",kind:"command",id:"deploy-result",sessionId:"recorded-session"},{requirementId:"verify",kind:"command",id:"verify-result",sessionId:"recorded-session"}];
    const call=(id:string,command:string,from:number,to:number)=>({source:"verified provider contract",callId:id,command,cwd:f.context.prdWorktree,calledAt:f.at(from),resultAt:f.at(to),outcome:"success" as const,output:JSON.stringify({revision:later})});
    f.context.commands=()=>Promise.resolve([call("deploy-result",`node deploy.mjs ${f.merged} ${f.checkpoint.target.environment}`,11,20),call("verify-result",`node verify.mjs ${f.merged} ${f.checkpoint.target.environment}`,21,30)]);
    await reconcileDelivery(f.context);
    expect(f.checkpoint.evidence.find(one=>one.requirementId==="deploy")).toMatchObject({status:"success",revision:later,observedRevision:later});
    expect(f.checkpoint.evidence.find(one=>one.requirementId==="verify")).toMatchObject({status:"success",revision:later,observedRevision:later});
    expect(phaseDeliveryCheck(f.context,"1").passed).toBe(true);
  });
  it("allows a new intent only after confirmed deployment/verification failure and retains the failed attempt",async()=>{
    const f=await setup();f.checkpoint.references=f.checkpoint.references!.filter(one=>one.requirementId!=="verify");f.checkpoint.requirements[1]={id:"verify",purpose:"verification",source:f.checkpoint.workflowSource,match:{kind:"command",invocation:"node verify.mjs {{mergeRevision}} {{environment}}",cwd:f.context.prdWorktree,fields:{}}};
    const failedDeploy={id:"failed-deploy",kind:"deploy" as const,state:"prepared" as const,preparedAt:f.at(11),references:[{requirementId:"deploy",kind:"github_deployment" as const,id:"11"}]};f.checkpoint.operations.push(failedDeploy);
    f.responses["repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1"]={body:[{...f.status,state:"failure"}]};f.save();await reconcileDelivery(f.context);expect(failedDeploy.state).toBe("failed");
    const retry=await prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"deploy"}});expect(retry.disposition).toBe("proceed");expect(f.checkpoint.operations.at(-1)?.retryOf).toBe(failedDeploy.id);
    expect(await prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"deploy"}})).toMatchObject({disposition:"unresolved",operationId:retry.operationId});
    const at=new Date(Date.now()+1).toISOString();f.responses["repos/acme/acme-shop/deployments/13"]={body:{...f.deployment,id:13}};f.responses["repos/acme/acme-shop/deployments/13/statuses?per_page=100&page=1"]={body:[{...f.status,created_at:at}]};f.save();
    await submitEvidence(f.context,{checkpointId:f.checkpoint.id,operationId:retry.operationId,references:[{requirementId:"deploy",kind:"github_deployment",id:"13"}]});
    const verify=await prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"verify"}});expect(verify.disposition).toBe("proceed");
    const commands=[{source:"recorded provider contract",callId:"failed-verify",command:`node verify.mjs ${f.merged} test-development`,cwd:f.context.prdWorktree,calledAt:new Date(Date.now()+5).toISOString(),resultAt:new Date(Date.now()+6).toISOString(),outcome:"error" as "error"|"success",output:"artifact verification failed"}];f.context.commands=()=>Promise.resolve(commands);
    await submitEvidence(f.context,{checkpointId:f.checkpoint.id,operationId:verify.operationId,references:[{requirementId:"verify",kind:"command",id:"failed-verify",sessionId:"recorded-session"}]});expect(f.checkpoint.operations.find(one=>one.id===verify.operationId)?.state).toBe("failed");
    const verified=await prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"verify"}});expect(verified.disposition).toBe("proceed");commands.push({...commands[0]!,callId:"verified",outcome:"success",output:"artifact contents checked"});
    await submitEvidence(f.context,{checkpointId:f.checkpoint.id,operationId:verified.operationId,references:[{requirementId:"verify",kind:"command",id:"verified",sessionId:"recorded-session"}]});expect(f.checkpoint.operations.find(one=>one.id===verified.operationId)?.state).toBe("observed");expect(f.checkpoint.operations.find(one=>one.id===verify.operationId)?.failureEvidencePath).toMatch(/delivery-evidence/);
  });
  it("does not promote a provider result arriving after the shared reconciliation deadline",async()=>{
    const f=await setup();const deadline=new AbortController();f.context.signal=deadline.signal;
    f.checkpoint.requirements.push({id:"test",purpose:"pre_merge",source:f.checkpoint.workflowSource,match:{kind:"command",invocation:"node test.mjs {{sourceRevision}}",cwd:f.context.prdWorktree,fields:{}}});f.checkpoint.references!.push({requirementId:"test",kind:"command",id:"late-result",sessionId:"recorded-session"});
    let read=false;f.context.commands=async(_id,signal)=>{expect(signal?.aborted).toBe(false);read=true;deadline.abort(new Error("delivery deadline exceeded"));return[{source:"authoritative provider contract",callId:"late-result",command:`node test.mjs ${f.head}`,cwd:f.context.prdWorktree,calledAt:f.at(1),resultAt:f.at(2),outcome:"success",output:"tests passed"}];};
    await reconcileDelivery(f.context);expect(read).toBe(true);expect(f.checkpoint.evidence.some(one=>one.requirementId==="test")).toBe(false);expect(f.h.engine.record.developmentDelivery!.sourceUnavailable).toBe(true);expect(phaseDeliveryCheck(f.context,"1").passed).toBe(false);
  });
  it("does not relabel an old unbound test command as evidence for a newer source head",async()=>{
    const f=await setup();f.synchronize();
    const requirement={id:"local-tests",purpose:"pre_merge" as const,source:f.checkpoint.workflowSource,match:{kind:"command" as const,invocation:"npm test",cwd:f.context.prdWorktree,fields:{}}};
    f.checkpoint.requirements.push(requirement);f.checkpoint.references!.push({requirementId:requirement.id,kind:"command",id:"old-test",sessionId:"recorded-phase"});
    f.context.commands=()=>Promise.resolve([{source:"authoritative fixture transcript",callId:"old-test",command:"npm test",cwd:f.context.prdWorktree,calledAt:f.at(-30),resultAt:f.at(-20),outcome:"success",output:"tests passed"}]);
    await reconcileDelivery(f.context);
    expect(f.checkpoint.evidence.some(one=>one.requirementId===requirement.id&&one.status==="success")).toBe(false);
  });
});
