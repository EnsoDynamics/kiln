// Development delivery under completion waivers (AC-WAIVE-09/11, WAIVE-004), on real temporary Git repositories
// and the captured GitHub contract. Waivers are saved records; nothing here writes evidence from one.
import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../test-support/git-repositories.js";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { DELIVERY_CHECK, checkpointResolved, checkpointSatisfied, evaluateRepositories, phaseDeliveryCheck, prepareOperation, reconcileDelivery } from "./development-delivery.js";
import { applyWaivers, unmetItems, type Waiver } from "./waivers.js";
import type { DeliveryCheckpoint } from "../state/development-delivery.js";

type Fixture = Awaited<ReturnType<typeof deliveryFixture>>;
let fixtures: Fixture[] = [];
afterEach(async () => { await Promise.all(fixtures.map(f => f.h.cleanup())); fixtures = []; });

/** A saved waiver of development items, as Mark complete would save it. */
function waiver(items: { subject: string; against: string }[]): Waiver {
  const at = new Date().toISOString();
  return { waiverId: randomUUID(), at, activityKey: "1", activityKind: "implementation", effect: "completed", source: { via: "command_line", account: "tester", by: "release-bot" }, operationId: randomUUID(), checkRun: { id: randomUUID(), at }, items: items.map(item => ({ check: DELIVERY_CHECK, kind: "development_requirement", subject: item.subject, text: item.subject, against: item.against })), checks: [] };
}

/**
 * A prerequisite whose deployment failed, and dependents of it on the same target, each with its own successful
 * deployment and a verification not yet run. Dependents are added before synchronizing, so their merge is unsynchronized.
 */
async function prerequisiteWithDependents(ids: string[]) {
  const f = await deliveryFixture(); fixtures.push(f);
  const state = f.h.engine.record.developmentDelivery!; const prerequisite = f.checkpoint;
  const dependents = ids.map(id => {
    const dependent: DeliveryCheckpoint = structuredClone(prerequisite);
    Object.assign(dependent, { id, dependsOn: [prerequisite.id], evidence: [], references: [{ requirementId: "deploy", kind: "github_deployment", id: "15" }] });
    dependent.requirements[1] = { id: "verify", purpose: "verification", source: dependent.workflowSource, match: { kind: "command", invocation: "node verify.mjs {{mergeRevision}} {{environment}}", cwd: f.context.prdWorktree, fields: { "/revision": "$mergeRevision" } } };
    state.checkpoints.push(dependent); return dependent;
  });
  f.synchronize();
  f.responses["repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1"] = { body: [{ ...f.status, state: "failure" }] };
  f.responses["repos/acme/acme-shop/deployments/15"] = { body: { ...f.deployment, id: 15 } };
  f.responses["repos/acme/acme-shop/deployments/15/statuses?per_page=100&page=1"] = { body: [f.status] };
  f.save(); await reconcileDelivery(f.context);
  return { f, state, prerequisite, dependents };
}

const marked = (f: Fixture) => applyWaivers(f.h.engine.record.waivers ?? [], [phaseDeliveryCheck(f.context, "1")])[0]!;
const subjects = (items: { subject: string }[]) => items.map(item => item.subject);

describe("every failing development item is listed (AC-WAIVE-11)", () => {
  it("lists each unmet obligation of the owner check, once in final delivery, with what it was checked against", async () => {
    const f = await deliveryFixture(); fixtures.push(f);
    f.responses["repos/acme/acme-shop/deployments/11/statuses?per_page=100&page=1"] = { body: [{ ...f.status, state: "failure" }] };
    f.save(); await reconcileDelivery(f.context);
    const check = phaseDeliveryCheck(f.context, "1");
    expect(check.passed).toBe(false);
    // Unsynchronized merge, failed deployment, and the verification that cannot link to it: three items, not the first.
    expect(check.items).toEqual([
      { kind: "development_requirement", subject: "first-checkpoint/requiredMerge", text: "first-checkpoint / requiredMerge: the confirmed merge is not yet synchronized into the feature branch", against: `first-checkpoint@${f.merged}` },
      { kind: "development_requirement", subject: "first-checkpoint/deploy", text: "first-checkpoint / deploy: Deployment 11 failed.", against: `first-checkpoint@${f.merged}` },
      { kind: "development_requirement", subject: "first-checkpoint/verify", text: expect.stringContaining("first-checkpoint / verify: ") as string, against: `first-checkpoint@${f.merged}` },
    ]);
    expect(check.facts).toEqual(check.items!.map(item => item.text));
    // The phase check and the checkpoint scan both find them; final delivery lists each once.
    const final = await evaluateRepositories(f.context);
    expect(final.passed).toBe(false);
    expect(subjects(final.checks[0]!.items!.filter(item => item.kind === "development_requirement"))).toEqual(["first-checkpoint/requiredMerge", "first-checkpoint/deploy", "first-checkpoint/verify"]);
    expect(final.checks[0]!.facts).toEqual(final.checks[0]!.items!.map(item => item.text));
  });

  it("gives every reason a repository is unresolved at final delivery, its uncommitted and unpushed work as repository items", async () => {
    const f = await deliveryFixture(); fixtures.push(f); f.synchronize();
    expect((await evaluateRepositories(f.context)).passed).toBe(true);
    writeFileSync(join(f.context.prdWorktree, "local.txt"), "Committed, never pushed\n");
    git(f.h.sandbox, f.context.prdWorktree, "add", "local.txt"); git(f.h.sandbox, f.context.prdWorktree, "commit", "-m", "Local only");
    writeFileSync(join(f.context.prdWorktree, "draft.txt"), "Never committed\n");
    const final = await evaluateRepositories(f.context);
    expect(final.passed).toBe(false);
    expect(final.checks[0]!.items).toEqual([
      { kind: "repository_work", subject: "acme-shop", text: "acme-shop: uncommitted work remains.", against: "" },
      { kind: "repository_work", subject: "acme-shop", text: "acme-shop: current feature head is not pushed to its assigned origin branch.", against: "" },
    ]);
    expect(f.h.engine.record.developmentDelivery!.repositoryResults[0]).toMatchObject({ state: "unresolved", reasons: ["acme-shop: uncommitted work remains.", "acme-shop: current feature head is not pushed to its assigned origin branch."] });
    // Listing more never makes the evaluation unfinished: no provider read was needed to fail it.
    expect(f.h.engine.record.developmentDelivery!.sourceUnavailable).toBe(false);
  });
});

describe("coverage-aware dependency resolution (WAIVE-004)", () => {
  it("lets a dependent's operations proceed on a prerequisite resolved only by waiver, while its own obligations still fail, until the prerequisite's merge revision changes", async () => {
    const { f, state, prerequisite, dependents: [dependent] } = await prerequisiteWithDependents(["dependent-b"]);
    const against = `first-checkpoint@${f.merged}`;
    await expect(prepareOperation(f.context, { checkpointId: dependent!.id, operation: { kind: "synchronize" } })).rejects.toThrow("Prerequisite checkpoint first-checkpoint is unresolved.");
    expect(phaseDeliveryCheck(f.context, "1").items).toContainEqual({ kind: "development_requirement", subject: "dependent-b/prerequisite:first-checkpoint", text: "dependent-b: prerequisite first-checkpoint is unresolved.", against });

    const saved = waiver([{ subject: "first-checkpoint/deploy", against }, { subject: "first-checkpoint/verify", against }]);
    f.h.engine.record.waivers = [saved];
    const operations = prerequisite.operations.length; const evidence = structuredClone(prerequisite.evidence);
    expect(checkpointResolved(state, prerequisite, f.h.engine.record.waivers)).toBe(true);
    expect(checkpointSatisfied(state, prerequisite)).toBe(false);
    // The operation gate passes on the waived prerequisite.
    expect(await prepareOperation(f.context, { checkpointId: dependent!.id, operation: { kind: "synchronize" } })).toMatchObject({ disposition: "proceed" });
    // The dependent's own obligations still need evidence; the prerequisite's waived items show as waived, not passed.
    const check = marked(f);
    expect(check.passed).toBe(false);
    expect(subjects(unmetItems([check]))).toEqual(["dependent-b/requiredMerge", "dependent-b/verify"]);
    expect(check.items!.filter(item => item.waiver).map(item => [item.subject, item.waiver!.waiverId])).toEqual([["first-checkpoint/deploy", saved.waiverId], ["first-checkpoint/verify", saved.waiverId]]);
    expect(check.items!.some(item => item.subject.includes("prerequisite"))).toBe(false);
    // The waived item was the deployment, so the dependent's verification cannot bind to an artifact.
    await expect(prepareOperation(f.context, { checkpointId: dependent!.id, operation: { kind: "verify" } })).rejects.toThrow("Prerequisite first-checkpoint has no deployed artifact.");
    // A waiver is never evidence: nothing was written for the prerequisite.
    expect(prerequisite.operations).toHaveLength(operations); expect(prerequisite.evidence).toEqual(evidence);

    // A new merge revision for the prerequisite ends the waiver.
    const remerged = "c".repeat(40);
    f.pull.merge_commit_sha = remerged;
    f.responses[`repos/acme/acme-shop/compare/${remerged}...develop`] = { body: { status: "identical", merge_base_commit: { sha: remerged } } };
    f.responses[`repos/acme/acme-shop/compare/${remerged}...${f.merged}`] = { body: { status: "diverged", merge_base_commit: { sha: f.merged } } };
    f.save(); await reconcileDelivery(f.context);
    expect(prerequisite.merge?.resultSha).toBe(remerged);
    expect(checkpointResolved(state, prerequisite, f.h.engine.record.waivers)).toBe(false);
    await expect(prepareOperation(f.context, { checkpointId: dependent!.id, operation: { kind: "deploy" } })).rejects.toThrow("Prerequisite checkpoint first-checkpoint is unresolved.");
    const ended = marked(f);
    expect(ended.items!.find(item => item.subject === "first-checkpoint/deploy")).toMatchObject({ against: `first-checkpoint@${remerged}` });
    expect(ended.items!.find(item => item.subject === "first-checkpoint/deploy")?.waiver).toBeUndefined();
    expect(ended.items!.find(item => item.subject === "dependent-b/prerequisite:first-checkpoint")).toMatchObject({ against: `first-checkpoint@${remerged}` });
  });

  it("counts a dependent's directly waived prerequisite item as met for that dependent only, and never binds its artifact", async () => {
    const { f, state, prerequisite } = await prerequisiteWithDependents(["dependent-a", "dependent-b"]);
    const saved = waiver([{ subject: "dependent-a/prerequisite:first-checkpoint", against: `first-checkpoint@${f.merged}` }]);
    f.h.engine.record.waivers = [saved];
    expect(checkpointResolved(state, prerequisite, f.h.engine.record.waivers)).toBe(false);
    // Its operation gate.
    expect(await prepareOperation(f.context, { checkpointId: "dependent-a", operation: { kind: "synchronize" } })).toMatchObject({ disposition: "proceed" });
    await expect(prepareOperation(f.context, { checkpointId: "dependent-b", operation: { kind: "synchronize" } })).rejects.toThrow("Prerequisite checkpoint first-checkpoint is unresolved.");
    // Its owner check.
    const check = marked(f);
    expect(check.items!.find(item => item.subject === "dependent-a/prerequisite:first-checkpoint")?.waiver?.waiverId).toBe(saved.waiverId);
    expect(subjects(unmetItems([check]))).toContain("dependent-b/prerequisite:first-checkpoint");
    expect(subjects(unmetItems([check]))).not.toContain("dependent-a/prerequisite:first-checkpoint");
    // Final delivery's checkpoint scan.
    const final = applyWaivers(f.h.engine.record.waivers, (await evaluateRepositories(f.context)).checks)[0]!;
    expect(final.items!.find(item => item.subject === "dependent-a/prerequisite:first-checkpoint")?.waiver?.waiverId).toBe(saved.waiverId);
    expect(final.items!.find(item => item.subject === "dependent-b/prerequisite:first-checkpoint")?.waiver).toBeUndefined();
    // Artifact binding still refuses: the prerequisite itself is unresolved.
    await expect(prepareOperation(f.context, { checkpointId: "dependent-a", operation: { kind: "verify" } })).rejects.toThrow("Prerequisite first-checkpoint is unresolved.");
  });
});
