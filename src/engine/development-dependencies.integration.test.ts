// Real temporary Git/bare origins and verified GitHub contracts, with controlled provider failures.
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../test-support/git-repositories.js";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { documentsDigest, phaseDeliveryCheck, prepareOperation, reconcileDelivery, submitEvidence, evaluateRepositories } from "./development-delivery.js";
import type { CommandEvidence, EvidenceRequirement } from "../state/development-delivery.js";
let fixtures: Awaited<ReturnType<typeof deliveryFixture>>[]=[];
afterEach(async()=>{await Promise.all(fixtures.map(f=>f.h.cleanup()));fixtures=[];});
describe("ordered delivery across repositories",()=>{
  it("blocks dependent verification on failed or changed prerequisites, retains other deliveries, and reports every repository",async()=>{
    const first=await deliveryFixture("squash", {"phase-2-dependent.md":"# Phase 2: Dependent verification\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n1.\n"});fixtures.push(first);first.synchronize();
    const second=await deliveryFixture();fixtures.push(second);second.synchronize();
    const state=first.h.engine.record.developmentDelivery!;const dependency=first.checkpoint;const dependent=second.checkpoint;
    dependent.id="dependent-web";dependent.phaseId="2";dependent.executionId=first.h.engine.record.executionId!;dependent.dependsOn=[dependency.id];dependent.target={repository:"github.com/acme/returns-api",baseBranch:"develop",environment:"test-development"};
    const secondRepo={...second.h.engine.record.repositories[0]!,name:"returns-api",github:"acme/returns-api"};first.h.engine.record.repositories.push(secondRepo);first.h.engine.record.developmentAuthorization!.grants.push({target:dependent.target,confirmedAt:first.at(0),source:"start"});
    const replace=(value:unknown)=>JSON.parse(JSON.stringify(value).replaceAll("acme/acme-shop","acme/returns-api")) as unknown;
    for(const [key,value]of Object.entries(second.responses))first.responses[key.replaceAll("acme/acme-shop","acme/returns-api")]=replace(value) as typeof value;
    dependent.requirements[1]={id:"verify",purpose:"verification",source:dependent.workflowSource,match:{kind:"command",invocation:"node verify.mjs {{mergeRevision}} {{environment}}",cwd:second.context.prdWorktree,fields:{"/revision":"$mergeRevision","/environment":"$environment","/dependency":"$dependency:first-checkpoint"}}};
    dependent.references=dependent.references!.filter(ref=>ref.requirementId!=="verify");
    dependency.requirements.push({id:"current",purpose:"current_artifact",source:dependency.workflowSource,match:{kind:"github_deployment"}} satisfies EvidenceRequirement);
    state.checkpoints.push(dependent);state.assessments.push({phaseId:"2",documentsDigest:documentsDigest(first.context,"2"),required:true,criteria:dependent.criteria,reason:"Verify the dependent artifact",checkpointIds:[dependent.id]});first.context.phaseId="2";
    const commands:CommandEvidence[]=[];first.context.commands=()=>Promise.resolve(commands);first.save();
    const statusKey="repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1";
    first.responses[statusKey]={body:[{...first.status,state:"failure"}]};first.save();await reconcileDelivery(first.context);
    expect(phaseDeliveryCheck(first.context,"1").passed).toBe(false);
    await expect(prepareOperation(first.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).rejects.toThrow("unresolved");
    expect(dependent.merge?.resultSha).toBe(second.merged);expect(dependent.evidence.find(one=>one.requirementId==="deploy")?.revision).toBe(second.merged);
    first.responses[statusKey]={body:[first.status]};first.save();await reconcileDelivery(first.context);
    expect(await prepareOperation(first.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).toMatchObject({disposition:"unresolved",operationId:"current-artifact"});
    await submitEvidence(first.context,{checkpointId:dependency.id,operationId:"current-artifact",references:[{requirementId:"current",kind:"github_deployment",id:"11"}]});
    const currentKey="repos/acme/acme-shop/deployments?environment=test-development&per_page=100&page=1";
    first.responses[currentKey]={body:[{...first.deployment,id:12,sha:"a".repeat(40)},first.deployment]};first.save();
    await expect(prepareOperation(first.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).rejects.toThrow("current environment deployment changed");
    expect(dependency.evidence.find(one=>one.requirementId==="verify")?.status).toBe("success");
    const changed={...first.deployment,id:12,sha:"a".repeat(40)};
    first.responses["repos/acme/acme-shop/deployments/12"]={body:changed};first.responses["repos/acme/acme-shop/deployments/12/statuses?per_page=100&page=1"]={body:[first.status]};first.save();
    await submitEvidence(first.context,{checkpointId:dependency.id,operationId:"current-artifact",references:[{requirementId:"current",kind:"github_deployment",id:"12"}]});
    const restore=await prepareOperation(first.context,{checkpointId:dependency.id,operation:{kind:"deploy",restorationFor:dependent.id}});expect(restore.disposition).toBe("proceed");
    const deployQuery=`repos/acme/acme-shop/deployments?sha=${first.merged}&environment=test-development&per_page=100&page=1`;
    first.responses[deployQuery]={body:[]};first.save();
    expect(await prepareOperation(first.context,{checkpointId:dependency.id,operation:{kind:"deploy",restorationFor:dependent.id}})).toMatchObject({disposition:"unresolved",operationId:restore.operationId});
    // The actual redeployment is accepted remotely before its local result is saved.
    const accepted=new Date(Date.now()+1).toISOString();const restored={...first.deployment,id:13,created_at:accepted};
    first.responses[deployQuery]={body:[restored]};first.responses["repos/acme/acme-shop/deployments/13"]={body:restored};first.responses["repos/acme/acme-shop/deployments/13/statuses?per_page=100&page=1"]={body:[{...first.status,created_at:accepted,log_url:"https://github.com/acme/acme-shop/actions/runs/99/job/100"}]};first.responses[currentKey]={body:[restored,changed,first.deployment]};first.save();
    await reconcileDelivery(first.context);expect(dependency.operations.find(one=>one.id===restore.operationId)?.state).toBe("observed");
    expect(dependency.evidenceHistory?.some(one=>one.requirementId==="deploy"&&one.reference.id==="11")).toBe(true);
    await submitEvidence(first.context,{checkpointId:dependency.id,operationId:"current-artifact",references:[{requirementId:"current",kind:"github_deployment",id:"13"}]});
    const operation=await prepareOperation(first.context,{checkpointId:dependent.id,operation:{kind:"verify"}});expect(operation.disposition).toBe("proceed");
    commands.push({source:"verified Codex/Claude command contract",callId:"dependent-verify",command:`node verify.mjs ${second.merged} test-development`,cwd:second.context.prdWorktree,calledAt:new Date().toISOString(),resultAt:new Date(Date.now()+1).toISOString(),outcome:"success",output:JSON.stringify({revision:second.merged,environment:"test-development",dependency:first.merged})});
    await submitEvidence(first.context,{checkpointId:dependent.id,operationId:operation.operationId,references:[{requirementId:"verify",kind:"command",id:"dependent-verify",sessionId:"retained-session"}]});
    expect(phaseDeliveryCheck(first.context,"2").passed).toBe(true);
    expect(dependent.evidence.find(one=>one.requirementId==="verify")?.prerequisiteArtifacts).toEqual([{checkpointId:dependency.id,revision:first.merged}]);
    // Complete PR descriptions must carry reciprocal links and concrete order.
    first.pull.body+="\nThen https://github.com/acme/returns-api/pull/1";
    const secondPull=first.responses["repos/acme/returns-api/pulls/1"]!.body as {body:string};secondPull.body+="\nDepends on https://github.com/acme/acme-shop/pull/1";first.save();
    // AC-DELIVER-03: each missing reciprocal link and the declared order must fail independently.
    const firstBody=first.pull.body; const secondBody=secondPull.body;
    for (const missing of ["first link","second link","dependency order"]) {
      first.pull.body=missing==="first link" ? `PRD: ${first.context.prdDirectory}` : firstBody;
      secondPull.body=missing==="second link" ? `PRD: ${first.context.prdDirectory}` : missing==="dependency order" ? secondBody.replace("Depends on", "Related delivery") : secondBody;
      first.save();
      expect((await evaluateRepositories(first.context)).passed).toBe(false);
      const result=state.repositoryResults.find(one=>one.repository===(missing==="first link" ? "acme-shop" : "returns-api"))!;
      expect(result.state).toBe("unresolved");
      expect(result.reasons.join(" ")).toContain(missing==="dependency order" ? "state its required delivery order" : `link related delivery https://github.com/acme/${missing==="first link" ? "returns-api" : "acme-shop"}/pull/1`);
    }
    first.pull.body=firstBody; secondPull.body=secondBody; first.save();
    expect(await evaluateRepositories(first.context)).toMatchObject({passed:true,pullRequests:[]});
    expect(state.repositoryResults.map(one=>[one.repository,one.state])).toEqual([["acme-shop","delivered"],["returns-api","delivered"]]);
    // A completed historical verification retains the exact prerequisite it checked.
    first.responses[currentKey]={body:[{...first.deployment,id:12,sha:"a".repeat(40)},first.deployment]};first.save();await reconcileDelivery(first.context);
    expect(phaseDeliveryCheck(first.context,"2").passed).toBe(true);
    // A later repository's new review PR must be linked from the earlier delivered PR too.
    writeFileSync(join(second.context.prdWorktree,"later.txt"),"Review the later dependent work\n");
    git(second.h.sandbox,second.context.prdWorktree,"add","later.txt"); git(second.h.sandbox,second.context.prdWorktree,"commit","-m","Later dependent work"); git(second.h.sandbox,second.context.prdWorktree,"push","origin",dependent.featureBranch);
    const laterHead=git(second.h.sandbox,second.context.prdWorktree,"rev-parse","HEAD").trim();
    const review={...(first.responses["repos/acme/returns-api/pulls/1"]!.body as Record<string,unknown>),number:2,state:"open",merged_at:null,draft:false,html_url:"https://github.com/acme/returns-api/pull/2",head:{sha:laterHead,ref:dependent.featureBranch,repo:{full_name:"acme/returns-api"}},body:`PRD: ${first.context.prdDirectory}\nEarlier deliveries: ${first.pull.html_url} https://github.com/acme/returns-api/pull/1`};
    first.responses[`repos/acme/returns-api/pulls?state=open&head=${encodeURIComponent("acme:"+dependent.featureBranch)}&base=develop&per_page=100&page=1`]={body:[review]};
    first.responses["repos/acme/returns-api/pulls/2"]={body:review}; secondPull.body+=`\nReview: ${review.html_url}`; first.save();
    expect((await evaluateRepositories(first.context)).passed).toBe(false);
    expect(state.repositoryResults[0]).toMatchObject({state:"unresolved",reasons:[`acme-shop #1: link related review ${review.html_url}.`]});
    first.pull.body+=`\nReview: ${review.html_url}`; first.save();
    expect((await evaluateRepositories(first.context)).passed).toBe(true);
    expect(state.repositoryResults.map(one=>[one.repository,one.state])).toEqual([["acme-shop","delivered"],["returns-api","mixed"]]);
  });
  it("does not replay an old changed-artifact command probe after a successful restoration",async()=>{
    const f=await deliveryFixture();fixtures.push(f);f.synchronize();const state=f.h.engine.record.developmentDelivery!;
    const dependent=structuredClone(f.checkpoint);dependent.id="dependent";dependent.dependsOn=[f.checkpoint.id];dependent.requirements[1]={id:"verify",purpose:"verification",source:dependent.workflowSource,match:{kind:"command",invocation:"node verify.mjs {{mergeRevision}} {{environment}}",cwd:f.context.prdWorktree,fields:{"/dependency":`$dependency:${f.checkpoint.id}`}}};dependent.references=dependent.references!.filter(one=>one.requirementId!=="verify");
    f.checkpoint.requirements.push({id:"current",purpose:"current_artifact",source:f.checkpoint.workflowSource,match:{kind:"command",invocation:"node current.mjs {{environment}}",cwd:f.context.prdWorktree,fields:{"/revision":"$currentRevision","/environment":"$environment"}}});state.checkpoints.push(dependent);
    let clock=Date.now()-60_000;f.context.now=()=>new Date(clock+=1000).toISOString();const commands:CommandEvidence[]=[];f.context.commands=()=>Promise.resolve(commands);
    expect(await prepareOperation(f.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).toMatchObject({operationId:"current-artifact"});
    commands.push({source:"authoritative provider contract",callId:"changed-current",command:"node current.mjs test-development",cwd:f.context.prdWorktree,calledAt:f.context.now(),resultAt:f.context.now(),outcome:"success",output:JSON.stringify({revision:"a".repeat(40),environment:"test-development"})});
    await submitEvidence(f.context,{checkpointId:f.checkpoint.id,operationId:"current-artifact",references:[{requirementId:"current",kind:"command",id:"changed-current",sessionId:"recorded-session"}]});
    // The dependent shares its prerequisite's target, so Kiln asks whether the changed revision still carries the prerequisite.
    f.responses[`repos/acme/acme-shop/compare/${f.merged}...${"a".repeat(40)}`]={body:{status:"diverged",merge_base_commit:{sha:"b".repeat(40)}}};f.save();
    const restore=await prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"deploy",restorationFor:dependent.id}});expect(restore.disposition).toBe("proceed");
    const accepted=f.context.now();const restored={...f.deployment,id:13,created_at:accepted};f.responses[`repos/acme/acme-shop/deployments?sha=${f.merged}&environment=test-development&per_page=100&page=1`]={body:[restored]};f.responses["repos/acme/acme-shop/deployments/13"]={body:restored};f.responses["repos/acme/acme-shop/deployments/13/statuses?per_page=100&page=1"]={body:[{...f.status,created_at:accepted,log_url:"https://github.com/acme/acme-shop/actions/runs/99/job/100"}]};f.save();await reconcileDelivery(f.context);
    expect(f.checkpoint.operations.find(one=>one.id===restore.operationId)?.state).toBe("observed");
    await expect(prepareOperation(f.context,{checkpointId:f.checkpoint.id,operation:{kind:"deploy",restorationFor:dependent.id}})).rejects.toThrow("probe is stale");
  });

});

describe("cumulative deployments to one target",()=>{
  // Every push to the base branch redeploys the same service, so a later checkpoint's deployment replaces its prerequisite's artifact.
  async function laterCheckpoint(target:"same"|"other"){
    const f=await deliveryFixture();fixtures.push(f);f.synchronize();
    const {h,context}=f;const state=h.engine.record.developmentDelivery!;const prerequisite=f.checkpoint;const worktree=context.prdWorktree;
    writeFileSync(join(worktree,"publishing.txt"),"Later publishing work\n");git(h.sandbox,worktree,"add","publishing.txt");git(h.sandbox,worktree,"commit","-m","Later publishing work");git(h.sandbox,worktree,"push","origin",prerequisite.featureBranch);
    const head=git(h.sandbox,worktree,"rev-parse","HEAD").trim();
    git(h.sandbox,h.repository,"merge","--squash",prerequisite.featureBranch);git(h.sandbox,h.repository,"commit","-m","Squash the later checkpoint");git(h.sandbox,h.repository,"push","origin","develop");
    const merged=git(h.sandbox,h.repository,"rev-parse","HEAD").trim();
    expect(git(h.sandbox,h.repository,"merge-base","--is-ancestor",f.merged,merged)).toBe("");
    const environment=target==="same"?prerequisite.target.environment:"other-development";
    const dependent=structuredClone(prerequisite);
    Object.assign(dependent,{id:"later-checkpoint",headSha:head,baseSha:f.merged,dependsOn:[prerequisite.id],target:{...prerequisite.target,environment},createdAt:f.at(45),evidence:[],references:[{requirementId:"deploy",kind:"github_deployment",id:"14"}],operations:[{id:"later-merge",kind:"merge",state:"prepared",preparedAt:f.at(46),references:[],pullRequest:2}]});
    // Mirrors the stuck checkpoint: verification binds only its own merge, with no "$dependency:" field.
    dependent.requirements[1]={id:"verify",purpose:"verification",source:dependent.workflowSource,match:{kind:"command",invocation:"node verify.mjs {{mergeRevision}} {{environment}}",cwd:worktree,fields:{"/deployed_sha":"$mergeRevision",...(target==="other"?{"/prerequisite":`$dependency:${prerequisite.id}`}:{})}}};
    if(target==="other")h.engine.record.developmentAuthorization!.grants.push({target:dependent.target,confirmedAt:f.at(0),source:"start"});
    prerequisite.requirements.push({id:"current",purpose:"current_artifact",source:prerequisite.workflowSource,match:{kind:"command",invocation:"node current.mjs {{environment}}",cwd:worktree,fields:{"/deployed_sha":"$currentRevision"}}});
    const deployment={...f.deployment,id:14,sha:merged,environment,created_at:f.at(55)};
    Object.assign(f.responses,{
      "repos/acme/acme-shop/pulls/2":{body:{...f.pull,number:2,html_url:"https://github.com/acme/acme-shop/pull/2",merged_at:f.at(50),merge_commit_sha:merged,head:{...f.pull.head,sha:head}}},
      [`repos/acme/acme-shop/compare/${merged}...develop`]:{body:{status:"identical",merge_base_commit:{sha:merged}}},
      [`repos/acme/acme-shop/compare/${f.merged}...${merged}`]:{body:{status:"ahead",merge_base_commit:{sha:f.merged}}},
      "repos/acme/acme-shop/deployments/14":{body:deployment},
      "repos/acme/acme-shop/deployments/14/statuses?per_page=100&page=1":{body:[{...f.status,environment,created_at:f.at(60)}]},
    });f.save();
    git(h.sandbox,worktree,"fetch","origin","develop");git(h.sandbox,worktree,"merge","--no-edit","origin/develop");git(h.sandbox,worktree,"push","origin",prerequisite.featureBranch);
    dependent.operations.push({id:"later-sync",kind:"synchronize",sourceHead:head,intendedBaseSha:merged,state:"prepared",preparedAt:f.at(65),references:[]});
    state.checkpoints.push(dependent);state.assessments[0]!.checkpointIds.push(dependent.id);
    const commands:CommandEvidence[]=[];context.commands=()=>Promise.resolve(commands);
    let clock=Date.now();const tick=()=>new Date(clock+=1000).toISOString();context.now=tick;
    const run=(callId:string,command:string,output:unknown)=>{commands.push({source:"authoritative provider contract",callId,command,cwd:worktree,calledAt:tick(),resultAt:tick(),outcome:"success",output:JSON.stringify(output)});return {requirementId:callId.startsWith("probe")?"current":"verify",kind:"command" as const,id:callId,sessionId:"recorded-session"};};
    await reconcileDelivery(context);
    expect(dependent.merge?.resultSha).toBe(merged);expect(dependent.evidence.find(one=>one.requirementId==="deploy")?.revision).toBe(merged);
    return {f,prerequisite,dependent,merged,environment,run};
  }
  it("verifies a later checkpoint whose own deployment replaced its same-target prerequisite, without another merge or deploy",async()=>{
    const {f,prerequisite,dependent,merged,run}=await laterCheckpoint("same");
    expect(await prepareOperation(f.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).toMatchObject({disposition:"unresolved",operationId:"current-artifact"});
    // A current artifact that does not carry the prerequisite's work is still a changed artifact.
    const foreign="c".repeat(40);f.responses[`repos/acme/acme-shop/compare/${f.merged}...${foreign}`]={body:{status:"diverged",merge_base_commit:{sha:"d".repeat(40)}}};f.save();
    await submitEvidence(f.context,{checkpointId:prerequisite.id,operationId:"current-artifact",references:[run("probe-foreign","node current.mjs test-development",{deployed_sha:foreign})]});
    await expect(prepareOperation(f.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).rejects.toThrow("current artifact changed");
    // The later checkpoint's own deployment carries the prerequisite's merge, so the same service reporting it satisfies the probe.
    await submitEvidence(f.context,{checkpointId:prerequisite.id,operationId:"current-artifact",references:[run("probe-current","node current.mjs test-development",{deployed_sha:merged})]});
    const operation=await prepareOperation(f.context,{checkpointId:dependent.id,operation:{kind:"verify"}});expect(operation.disposition).toBe("proceed");
    expect(dependent.operations.filter(one=>one.kind==="merge"||one.kind==="deploy").map(one=>one.id)).toEqual(["later-merge"]);
    await submitEvidence(f.context,{checkpointId:dependent.id,operationId:operation.operationId,references:[run("verify-current",`node verify.mjs ${merged} test-development`,{deployed_sha:merged})]});
    expect(dependent.unresolvedReason).toBeUndefined();
    expect(dependent.evidence.find(one=>one.requirementId==="verify")).toMatchObject({revision:merged,prerequisiteArtifacts:[{checkpointId:prerequisite.id,revision:f.merged}]});
    expect(phaseDeliveryCheck(f.context,"1")).toMatchObject({passed:true});
  });
  it("still refuses a prerequisite on another target whose current artifact moved past it",async()=>{
    const {f,prerequisite,dependent,merged,run}=await laterCheckpoint("other");
    expect(await prepareOperation(f.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).toMatchObject({operationId:"current-artifact"});
    await submitEvidence(f.context,{checkpointId:prerequisite.id,operationId:"current-artifact",references:[run("probe-current","node current.mjs test-development",{deployed_sha:merged})]});
    await expect(prepareOperation(f.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).rejects.toThrow("Prerequisite first-checkpoint's current artifact changed");
    // Without its typed binding, a cross-target verification is refused before any probe is read.
    if(dependent.requirements[1]!.match.kind==="command")dependent.requirements[1]!.match.fields={"/deployed_sha":"$mergeRevision"};
    await expect(prepareOperation(f.context,{checkpointId:dependent.id,operation:{kind:"verify"}})).rejects.toThrow('verify has no "$dependency:first-checkpoint" field');
  });
});
