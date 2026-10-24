// Real Git/workspace/state boundaries; remote failures supplement the separately recorded live GitHub/provider proofs.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHarness, landingSession, type Harness } from "../test-support/engine-harness.js";
import { createGithubOrigin, createRepository, git } from "../test-support/git-repositories.js";
import { readPrdRecord, migrateRecord } from "../state/records.js";
import { assertDevelopmentState, type DeliveryCheckpoint } from "../state/development-delivery.js";
import { documentsDigest, phaseDeliveryCheck, validateStartTargets, recordAssessment, validateSplits, checkpointSatisfied, prepareOperation, type DeliveryContext } from "./development-delivery.js";
import { buildSnapshot } from "./snapshot.js";
import { codexSessionPrompt, phaseSessionPrompt, freshSessionPrompt, resumePrompt, pullRequestSessionPrompt } from "../session/prompts.js";
let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });
const target = { repository: "github.com/acme/acme-shop", baseBranch: "develop", environment: "test-development" };
async function setup() {
  h = await createHarness({ sessions: [landingSession()] });
  await h.engine.changeSettings({ developmentDeployments: { enabled: true, targets: [{ target, confirmedTarget: target, confirmedNonProduction: true }] } });
  return h;
}
function context(h: Harness, phaseId = "1"): DeliveryContext { return { record: h.engine.record, stateDirectory: h.stateDirectory, prdWorktree: h.engine.worktreePath, prdDirectory: h.engine.paths.prdDirectoryFromRoot, git: { git: h.tools.git, env: h.env }, gh: h.tools.gh, env: h.env, phaseId, now: () => new Date().toISOString(), commands: () => Promise.resolve([]) }; }

describe("execution development authorization", () => {
  it("keeps an old execution restricted, and rejects changed, empty and unconfirmed targets", async () => {
    const h = await setup(); const r = structuredClone(h.engine.record); r.schemaVersion = 4;
    r.startedAt = "2026-10-01T00:00:00Z"; migrateRecord(r);
    expect(r.developmentAuthorization).toEqual({ revision: 0, enabled: false, grants: [] });
    const repos = [{ github: "acme/acme-shop", baseBranch: "develop" }];
    for (const value of [
      { enabled: true, targets: [] },
      { enabled: true, targets: [{ target, confirmedNonProduction: false }] },
      { enabled: true, targets: [{ target: { ...target, environment: "different" }, confirmedTarget: target, confirmedNonProduction: true }] },
      { enabled: true, targets: [{ target: { ...target, baseBranch: "main" }, confirmedTarget: { ...target, baseBranch: "main" }, confirmedNonProduction: true }] },
    ]) { r.settings.developmentDeployments = value; expect(() => validateStartTargets(r, repos)).toThrow(); }
  });
  it("keeps a repository added after authorized Start restricted across restart and names its exact missing target", async () => {
    const h = await setup();
    const origin = createGithubOrigin(h.sandbox, "acme", "returns-api");
    const checkout = createRepository(h.sandbox, "returns-api", origin.url);
    git(h.sandbox, checkout, "push", "origin", "develop");
    h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled();
    const authority = structuredClone(h.engine.record.developmentAuthorization);
    expect(await h.engine.addRepository("returns-api")).toMatchObject({ ok: true, added: true, baseBranch: "develop" });
    expect(h.engine.record.developmentAuthorization).toEqual(authority);
    expect(readPrdRecord(h.stateDirectory)!.developmentAuthorization).toEqual(authority);
    const again = h.reopenFromDisk(); await again.agents.refresh();
    expect(again.record.developmentAuthorization).toEqual(authority);
    expect(JSON.parse(again.deliveryAuthority()!).grants).toEqual([target]);
    const added = again.record.repositories.find(repo => repo.name === "returns-api")!;
    expect(added.setupCompletedAt).toBeDefined();
    expect(git(h.sandbox, added.worktreePath, "branch", "--show-current").trim()).toBe(again.record.settings.featureBranch);
    const lateTarget = { repository: "github.com/acme/returns-api", baseBranch: "develop", environment: "returns-api-dev" };
    const late = { ...checkpoint(h), id: "added-repository-checkpoint", target: lateTarget, headSha: git(h.sandbox, added.worktreePath, "rev-parse", "HEAD").trim(), baseSha: added.baseCommit! };
    again.record.developmentDelivery!.checkpoints.push(late);
    const status = again.deliveryStatus();
    expect(await again.deliveryCommand("prepare", { executionId: status.executionId, revision: status.revision, checkpointId: late.id, operation: { kind: "merge" } })).toEqual({ ok: false, status: 409, reason: "Authorize this development target: github.com/acme/returns-api / develop / returns-api-dev." });
    expect(late.operations).toEqual([]);
    expect(again.record.developmentAuthorization).toEqual(authority);
  });
  it("atomically retains exact Start authority across restart, refuses setting changes and does not let Closed bypass assessment", async () => {
    const h = await setup(); expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true }); await h.engine.settled();
    expect(h.engine.record.phases["1"]?.stop?.checks).toContainEqual(expect.objectContaining({ name: "Required development delivery verified", passed: false }));
    const saved = readPrdRecord(h.stateDirectory)!;
    expect(saved.executionId).toBeTruthy(); expect(saved.developmentAuthorization?.grants[0]?.target).toEqual(target);
    const again = h.reopenFromDisk(); await again.agents.refresh();
    expect(again.record.executionId).toBe(saved.executionId);
    expect(await again.changeSettings({ developmentDeployments: { enabled: false, targets: [] } })).toMatchObject({ ok: false, status: 409 });
    expect(await again.deliveryCommand("assessment", { executionId: "wrong", revision: 0 })).toMatchObject({ ok: false, status: 409 });
    const status = again.deliveryStatus(); expect(status.documentsDigest).toMatch(/^[a-f0-9]{64}$/);
    const payload = { executionId: saved.executionId, revision: status.revision, phaseId: "1", documentsDigest: status.documentsDigest, required: false, criteria: [], reason: "This phase needs no development deployment.", checkpoints: [] };
    expect(await again.deliveryCommand("assessment", payload)).toMatchObject({ ok: true });
    expect(await again.deliveryCommand("assessment", payload)).toMatchObject({ ok: false, status: 409 });
    expect(phaseDeliveryCheck(context(h), "1").passed).toBe(true);
    expect(buildSnapshot(again).developmentDelivery?.authorization.grants[0]?.target).toEqual(target);
  });
});

describe("retained-state and operation evidence contracts", () => {
  it("rejects damaged checkpoint identities, empty requirements and fabricated merge records on read", async () => {
    const h = await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    h.engine.record.developmentDelivery!.checkpoints.push(checkpoint(h));
    expect(() => assertDevelopmentState(h.engine.record)).not.toThrow();
    for (const change of [ { requirements: [] }, { headSha: "" }, { merge: {} }, { createdAt: "not-a-timestamp" }, { requireReview: undefined }, { workflowSource: {} } ]) {
      const corrupt = structuredClone(h.engine.record); Object.assign(corrupt.developmentDelivery!.checkpoints[0]!, change);
      expect(() => assertDevelopmentState(corrupt)).toThrow("Invalid schema-5");
    }
    const corruptGrant = structuredClone(h.engine.record); corruptGrant.developmentAuthorization!.grants[0]!.confirmedAt = "yesterday"; expect(() => assertDevelopmentState(corruptGrant)).toThrow("target grant");
  });
  it("rejects print/extraction wrappers and heredoc claims before they can become checkpoint evidence", async () => {
    const h = await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); const c = context(h);
    for (const invocation of ["echo claimed", "/bin/echo claimed", "env printf claimed", "sh -c 'printf claimed'", "node -e'console.log(1)'", "python3.13 -c 'print(1)'", "gh api repos/test/test --jq '{claimed:true}'", "tee <<'PROOF'\n{\"environment\":\"test-development\"}\nPROOF"]) {
      const candidate = checkpoint(h); candidate.requirements[1] = { id: "verify", purpose: "verification", source: candidate.workflowSource, match: { kind: "command", invocation, cwd: c.prdWorktree, fields: { "/environment": target.environment, "/revision": "$mergeRevision" } } };
      await expect(recordAssessment(c, { phaseId: "1", documentsDigest: documentsDigest(c,"1"), required: true, criteria: ["AC-RET-01"], reason: "Required development proof", checkpoints: [candidate] })).rejects.toThrow();
    }
    expect(h.engine.record.developmentDelivery!.checkpoints).toEqual([]);
  });
  it("accepts a documented command whose exact arguments bind target/revision without demanding JSON test output", async () => {
    const h = await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); const c = context(h);
    const invocation = "node verify.mjs {{mergeRevision}} test-development";
    writeFileSync(join(c.prdWorktree, "README.md"), `# Workflow\n${invocation}\n`); git(h.sandbox,c.prdWorktree,"add","README.md"); git(h.sandbox,c.prdWorktree,"commit","-m","Document the real verification invocation");
    const candidate = checkpoint(h); candidate.workflowSource.revision = candidate.headSha;
    candidate.requirements[1] = { id:"verify",purpose:"verification",source:candidate.workflowSource,match:{kind:"command",invocation,cwd:c.prdWorktree,fields:{}} };
    await expect(recordAssessment(c,{phaseId:"1",documentsDigest:documentsDigest(c,"1"),required:true,criteria:["AC-RET-01"],reason:"Verify the target-bound deployed artifact",checkpoints:[candidate]})).resolves.toBeUndefined();
  });
});

describe("one saved authority across provider entry points", () => {
  it.each(["claude_code", "codex"] as const)("preserves every excluded permission in %s launch, fresh, finalization and resume prompts", agentId => {
    const values = { phaseDoc: "docs/prds/feature/phase-1-build.md", featureName: "Feature", prdFile: "docs/prds/feature/feature-prd.md", worktreePath: "/assigned/feature", branch: "feature/test", parentFolder: "/assigned", deliveryAuthority: JSON.stringify({ executionId: "this-execution", grants: [target] }) };
    const prompts = [phaseSessionPrompt(values), freshSessionPrompt(values, true), pullRequestSessionPrompt({ ...values, repositories: [] }), ...[{}, { cause: "sleep" as const }, { cause: "sigint" as const }, { usageLimit: "usage limit" }, { endedOnItsOwn: true }].map(cause => resumePrompt({ ...cause, agentId, time: "2026-10-24T12:00:00Z", phaseDoc: values.phaseDoc, deliveryAuthority: values.deliveryAuthority, note: "Keep my reply first." }))];
    for (const basePrompt of prompts) {
      const prompt = agentId === "codex" ? codexSessionPrompt(basePrompt, [{ name: "enso-method:implement-from-requirements", path: "/skills/implement-from-requirements/SKILL.md" }]) : basePrompt;
      expect(prompt).toContain(JSON.stringify(target));
      expect(prompt).toContain('"executionId":"this-execution"');
      expect(prompt).toContain("ONLY for its exact approved targets");
      expect(prompt).toContain("It grants no authority for other targets or future executions");
      expect(prompt).toContain("Stay in the assigned feature branches and worktrees");
      expect(prompt).toContain("Never grant yourself permission through Kiln's browser or API");
      expect(prompt).toContain("Never bypass protections, use administrator overrides or force-push");
      expect(prompt).toContain("Production, destructive actions, unrelated infrastructure/data access and other people's checkouts remain unauthorized");
      expect(prompt).toContain("An approval rejection is still a rejection");
      expect(prompt).not.toContain("You are not authorized to open a pull request, merge, deploy");
    }
    expect(resumePrompt({ agentId, time: "2026-10-24T12:00:00Z", deliveryAuthority: values.deliveryAuthority, note: "Keep my reply first." }).indexOf("Keep my reply first.")).toBeLessThan(resumePrompt({ agentId, time: "2026-10-24T12:00:00Z", deliveryAuthority: values.deliveryAuthority, note: "Keep my reply first." }).indexOf("saved development-delivery authority"));
    expect(phaseSessionPrompt({ ...values, deliveryAuthority: undefined })).toContain("You are not authorized to open a pull request, merge, deploy");
  });
});

describe("retained delivery obligations", () => {
  it("binds assessment to meaningful documents while excluding only completion metadata", async () => {
    const h = await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); const c = context(h);
    const before = documentsDigest(c, "1"); const dir = join(c.prdWorktree, c.prdDirectory); const prd = join(dir, "customer-returns-prd.md");
    const original = readFileSync(prd, "utf8"); writeFileSync(prd, original.replace("- [ ]", "- [x]")); expect(documentsDigest(c, "1")).toBe(before);
    writeFileSync(prd, original + "\nA new acceptance requirement.\n"); expect(documentsDigest(c, "1")).not.toBe(before);
    await expect(recordAssessment(c, { phaseId: "1", documentsDigest: before, required: false, criteria: [], reason: "No deployment", checkpoints: [] })).rejects.toThrow("changed");
    await expect(recordAssessment(c, { phaseId: "2b", documentsDigest: before, required: false, criteria: [], reason: "No deployment", checkpoints: [] })).rejects.toThrow("current judged leaf");
  });
  it("does not erase a required checkpoint through an empty reassessment and names missing split assignments", async () => {
    const h = await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); const c = context(h); const state = h.engine.record.developmentDelivery!;
    const cp = checkpoint(h); state.checkpoints.push(cp); state.assessments.push({ phaseId: "1", documentsDigest: documentsDigest(c, "1"), required: true, criteria: cp.criteria, reason: "Acceptance depends on development", checkpointIds: [cp.id] });
    await recordAssessment(c, { phaseId: "1", documentsDigest: documentsDigest(c, "1"), required: false, criteria: [], reason: "No new checkpoint", checkpoints: [] });
    expect(state.assessments[0]?.checkpointIds).toEqual([cp.id]); expect(state.assessments[0]?.required).toBe(true); expect(phaseDeliveryCheck(c, "1").passed).toBe(false);
    const dir = join(c.prdWorktree, c.prdDirectory);
    writeFileSync(join(dir, "phase-1-return-intake.md"), "# Phase 1: Return intake\n\n## Split into\n| Phase | What | Depends on |\n|---|---|---|\n| [1a First](phase-1a-first.md) | First | None |\n| [1b Delivery](phase-1b-delivery.md) | Delivery | 1a |\n");
    writeFileSync(join(dir, "phase-1a-first.md"), "# Phase 1a: First\n\n**Closed:** 2026-10-24\n"); writeFileSync(join(dir, "phase-1b-delivery.md"), "# Phase 1b: Delivery\n");
    expect(() => validateSplits(c)).toThrow("Assign the retained obligations");
    state.splits.push({ phaseId: "1", documentsDigest: documentsDigest(c, "1"), revision: 1, assignments: ["requiredMerge", ...cp.requirements.map(one => one.id)].map(requirementId => ({ checkpointId: cp.id, requirementId, originPhaseId: "1", criteria: cp.criteria, leafIds: ["1b"] })) });
    expect(() => validateSplits(c)).not.toThrow();
    const dependent = structuredClone(cp); dependent.id = "dependent-checkpoint"; dependent.dependsOn = [cp.id]; state.checkpoints.push(dependent);
    state.splits[0]!.assignments.push(...["requiredMerge", ...dependent.requirements.map(one => one.id)].map(requirementId => ({ checkpointId: dependent.id, requirementId, originPhaseId: "1", criteria: dependent.criteria, leafIds: ["1a"] })));
    expect(() => validateSplits(c)).toThrow("before prerequisite");
    state.checkpoints.pop(); state.splits[0]!.assignments = state.splits[0]!.assignments.filter(one => one.checkpointId !== dependent.id);
    state.assessments.push({ phaseId: "1a", documentsDigest: documentsDigest(c, "1a"), required: false, criteria: [], reason: "Delivery belongs to 1b", checkpointIds: [] });
    expect(phaseDeliveryCheck(c, "1a").passed).toBe(true);
    expect(checkpointSatisfied(state, cp)).toBe(false);
    // Re-splitting the later owner cannot lose the retained obligations or contradict its parent.
    writeFileSync(join(dir,"phase-1b-delivery.md"),"# Phase 1b: Delivery\n\n## Split into\n| Phase | What | Depends on |\n|---|---|---|\n| [1b1 Prepare](phase-1b1-prepare.md) | Prepare | None |\n| [1b2 Deliver](phase-1b2-deliver.md) | Deliver | 1b1 |\n");
    writeFileSync(join(dir,"phase-1b1-prepare.md"),"# Phase 1b1: Prepare\n\n**Closed:** 2026-10-24\n");writeFileSync(join(dir,"phase-1b2-deliver.md"),"# Phase 1b2: Deliver\n");
    for(const assignment of state.splits[0]!.assignments)assignment.leafIds=["1b2"];
    expect(()=>validateSplits(c)).toThrow("current split 1b");
    state.splits.push({phaseId:"1b",documentsDigest:documentsDigest(c,"1b"),revision:1,assignments:structuredClone(state.splits[0]!.assignments)});expect(()=>validateSplits(c)).not.toThrow();
    state.splits[1]!.assignments[0]!.leafIds=["1b1"];expect(()=>validateSplits(c)).toThrow(/contradicts|before its required merge/);state.splits[1]!.assignments[0]!.leafIds=["1b2"];
    const status=h.engine.deliveryStatus();expect(await h.engine.deliveryCommand("assessment",{executionId:status.executionId,revision:status.revision,phaseId:"1a",documentsDigest:documentsDigest(c,"1a"),required:false,criteria:[],reason:"Later descendants own the retained delivery",checkpoints:[]})).toMatchObject({ok:true});
    const reopened=h.reopenFromDisk();await reopened.agents.refresh();expect(reopened.record.developmentDelivery!.splits.map(one=>one.phaseId)).toEqual(["1","1b"]);expect(phaseDeliveryCheck(context(h,"1a"),"1a").passed).toBe(true);
  });
  it("retains failed obligations in a corrected checkpoint and never grants a late target implicitly",async()=>{
    const h=await setup();await h.engine.start({refinementConfirmed:true});await h.engine.settled();const c=context(h);const state=h.engine.record.developmentDelivery!;
    writeFileSync(join(c.prdWorktree,"README.md"),"# Delivery workflow\n.github/workflows/deploy.yml verify deploy\n");git(h.sandbox,c.prdWorktree,"add","README.md");git(h.sandbox,c.prdWorktree,"commit","-m","Document required delivery evidence");
    const original=checkpoint(h);original.requiredChecks=["required-tests"];original.requireReview=true;
    const assessment={phaseId:"1",documentsDigest:documentsDigest(c,"1"),required:true,criteria:original.criteria,reason:"Acceptance requires a verified development artifact",checkpoints:[original]};await recordAssessment(c,assessment);
    const saved=state.checkpoints[0]!;saved.operations.push({id:"failed-deployment",kind:"deploy",state:"failed",preparedAt:new Date().toISOString(),references:[],reason:"Actual deployment failed"});
    writeFileSync(join(c.prdWorktree,"correction.txt"),"Correct the failed deployment source\n");git(h.sandbox,c.prdWorktree,"add","correction.txt");git(h.sandbox,c.prdWorktree,"commit","-m","Correct the deployment source");
    const replacement={...checkpoint(h),id:"corrected-delivery",replaces:saved.id,requiredChecks:saved.requiredChecks,requireReview:true};
    await expect(recordAssessment(c,{...assessment,checkpoints:[{...replacement,requiredChecks:[]}]})).rejects.toThrow("Replacement must retain");expect(saved.supersededBy).toBeUndefined();
    await expect(recordAssessment(c,{...assessment,checkpoints:[{...replacement,requireReview:false}]})).rejects.toThrow("Replacement must retain");
    await recordAssessment(c,{...assessment,checkpoints:[replacement]});expect(saved.supersededBy).toBe(replacement.id);expect(saved.operations[0]?.reason).toBe("Actual deployment failed");expect(checkpointSatisfied(state,saved)).toBe(false);
    const late={...checkpoint(h),id:"late-repository",target:{...target,repository:"github.com/acme/later-api"}};state.checkpoints.push(late);
    await expect(prepareOperation(c,{checkpointId:late.id,operation:{kind:"merge"}})).rejects.toThrow(/approval|approved|authoriz/i);expect(late.operations).toEqual([]);
  });
  it.each(["merge", "squash", "rebase"] as const)("retains source work after a real %s merge and advances the same feature branch", async method => {
    const h = await setup(); await h.engine.start({ refinementConfirmed: true }); await h.engine.settled(); const worktree = h.engine.worktreePath;
    const feature = h.engine.record.settings.featureBranch; const source = git(h.sandbox, worktree, "rev-parse", "HEAD").trim();
    if (method === "merge") git(h.sandbox, h.repository, "merge", "--no-ff", "-m", "Merge delivery", feature);
    if (method === "squash") { git(h.sandbox, h.repository, "merge", "--squash", feature); git(h.sandbox, h.repository, "commit", "-m", "Squash delivery"); }
    if (method === "rebase") { const base = h.engine.record.repositories[0]!.baseCommit!; for (const commit of git(h.sandbox, worktree, "rev-list", "--reverse", `${base}..${source}`).trim().split("\n")) git(h.sandbox, h.repository, "cherry-pick", commit); }
    git(h.sandbox, h.repository, "push", "origin", "develop");
    git(h.sandbox, worktree, "fetch", "origin", "develop"); git(h.sandbox, worktree, "merge", "--no-edit", "origin/develop");
    expect(git(h.sandbox, worktree, "merge-base", "--is-ancestor", source, "HEAD")).toBe("");
    git(h.sandbox, worktree, "push", "origin", "--delete", feature); git(h.sandbox, worktree, "push", "origin", feature);
    mkdirSync(join(worktree, "src"), { recursive: true }); writeFileSync(join(worktree, "src", "later.txt"), "later work\n"); git(h.sandbox, worktree, "add", "src/later.txt"); git(h.sandbox, worktree, "commit", "-m", "Later work");
    expect(git(h.sandbox, worktree, "diff", "--name-only", "origin/develop...HEAD").trim()).toBe("src/later.txt");
  });
});
function checkpoint(h: Harness): DeliveryCheckpoint {
  const repo = h.engine.record.repositories[0]!; const source = git(h.sandbox, repo.worktreePath, "rev-parse", "HEAD").trim();
  return { id: "acceptance-development", executionId: h.engine.record.executionId!, phaseId: "1", target, featureBranch: h.engine.record.settings.featureBranch, headSha: source, baseSha: repo.baseCommit!, criteria: ["AC-RET-01"], dependsOn: [], workflowSource: { path: "README.md", revision: source }, requirements: [{ id: "deploy", purpose: "deployment", source: { path: "README.md", revision: source }, match: { kind: "github_deployment" } }, { id: "verify", purpose: "verification", source: { path: "README.md", revision: source }, match: { kind: "github_workflow", path: ".github/workflows/deploy.yml", jobs: ["verify"], deploymentJob: "deploy", attempt: 1 } }], requiredChecks: [], requireReview: false, createdAt: new Date().toISOString(), operations: [], evidence: [] };
}
