// Recovery is a local controller/Git/state contract. Recorded command/provider results
// exercise success and failure; this does not claim to test a cloud deployment.
import { afterEach, describe, expect, it } from "vitest";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { git } from "../test-support/git-repositories.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
import type { CommandEvidence, DeliveryCheckpoint } from "../state/development-delivery.js";
import { checkpointSatisfied, phaseDeliveryCheck, prepareOperation, reconcileDelivery, submitEvidence } from "./development-delivery.js";

let fixture: Awaited<ReturnType<typeof deliveryFixture>> | undefined;
afterEach(async () => { await fixture?.h.cleanup(); fixture = undefined; });
const invocation = "node status.mjs {{mergeRevision}} {{environment}}";
async function setup() {
  const f = fixture = await deliveryFixture("squash", { "delivery-workflow.md": `# Delivery checks\n${invocation}\n.github/workflows/deploy.yml deploy verify\n` });
  const original = f.checkpoint;
  original.owner = { kind: "phase", phaseId: "1" };
  const source = { path: "docs/prds/customer-returns/delivery-workflow.md", revision: f.head };
  original.workflowSource = source;
  original.requirements = ["deploy", "verify"].map(id => ({ id, purpose: id === "deploy" ? "deployment" : "verification", source, match: { kind: "command", invocation, cwd: f.context.prdWorktree, fields: { "/revision": "$mergeRevision", "/labels/0/value": "$environment", "/ready": true } } }));
  original.references = [];
  const calls: CommandEvidence[] = [];
  f.context.commands = async () => calls;
  const call = (id: string, seconds: number, outcome: "success" | "error" = "success") => {
    calls.push({ source: "recorded-session", callId: id, command: invocation.replace("{{mergeRevision}}", f.merged).replace("{{environment}}", original.target.environment), cwd: f.context.prdWorktree, calledAt: f.at(seconds), resultAt: f.at(seconds + 1), outcome, exitCode: outcome === "success" ? 0 : 1, output: JSON.stringify({ revision: f.merged, environment: original.target.environment, labels: [{ value: "other-label" }, { value: original.target.environment }], ready: true }) });
    return { kind: "command" as const, requirementId: "deploy", id, sessionId: "recorded-session" };
  };
  const replacement = (): DeliveryCheckpoint & { replaces: string } => ({ ...structuredClone(original), id: "corrected-checkpoint", replaces: original.id, references: [], requirements: original.requirements.map(requirement => ({ ...requirement, match: { kind: "command", invocation, cwd: f.context.prdWorktree, fields: { "/revision": "$mergeRevision", "/environment": "$environment", "/ready": true } } })) });
  const assess = (candidate: ReturnType<typeof replacement>) => {
    const status = f.h.engine.deliveryStatus();
    return f.h.engine.deliveryCommand("assessment", { executionId: status.executionId, revision: status.revision, phaseId: "1", documentsDigest: status.documentsDigest, required: true, criteria: original.criteria, reason: "Correct the positional lookup; named environment output identifies the intended target.", checkpoints: [candidate] });
  };
  // The replacement can independently rediscover the already-merged PR at this source head.
  f.responses[`repos/acme/acme-shop/pulls?state=all&head=${encodeURIComponent(`acme:${original.featureBranch}`)}&base=develop&per_page=100&page=1`] = { body: [f.pull] };
  f.save();
  return { f, original, calls, call, replacement, assess };
}

describe("agent-owned delivery check recovery", () => {
  it("corrects a positional check at the same head, retries through the normal flow, and completes only after successful evidence", async () => {
    const { f, original, calls, call, replacement, assess } = await setup();
    const earlier = call("earlier-success", 30);
    calls[0]!.output = JSON.stringify({ revision: f.merged, labels: [{ value: original.target.environment }], ready: true });
    original.references = [earlier];
    await reconcileDelivery(f.context);
    expect(original.evidence).toHaveLength(1); // A previous result must not transfer to a changed check.
    const badRef = call("bad-lookup", 50);
    original.operations.push({ id: "old-deploy", kind: "deploy", state: "prepared", preparedAt: f.at(40), references: [badRef] });
    await reconcileDelivery(f.context);
    expect(await prepareOperation(f.context, { checkpointId: original.id, operation: { kind: "deploy" } })).toMatchObject({ disposition: "unresolved", facts: [expect.stringContaining("/labels/0/value")] });
    const history = structuredClone(original);

    expect(await assess(replacement())).toMatchObject({ ok: true });
    const state = f.h.engine.record.developmentDelivery!;
    const corrected = state.checkpoints.at(-1)!;
    expect(corrected.headSha).toBe(original.headSha);
    expect(corrected.operations).toEqual([]);
    expect(corrected.evidence).toEqual([]);
    expect(readPrdRecord(f.h.stateDirectory)!.developmentDelivery!.checkpoints[0]!.supersededBy).toBe(corrected.id);
    expect(phaseDeliveryCheck(f.context, "1").passed).toBe(false);
    expect(phaseDeliveryCheck(f.context, "1").items!.every(item => item.subject.startsWith(corrected.id + "/"))).toBe(true);
    await expect(prepareOperation(f.context, { checkpointId: original.id, operation: { kind: "deploy" } })).rejects.toThrow("use corrected-checkpoint");
    await expect(submitEvidence(f.context, { checkpointId: original.id, operationId: "old-deploy", references: [badRef] })).rejects.toThrow("use corrected-checkpoint");

    const deployed = await prepareOperation(f.context, { checkpointId: corrected.id, operation: { kind: "deploy" } });
    expect(deployed.disposition).toBe("proceed");
    // A real terminal failure is still a failure, even after repairing the matcher.
    await submitEvidence(f.context, { checkpointId: corrected.id, operationId: deployed.operationId, references: [call("failed-deployment", 180, "error")] });
    expect(corrected.operations.at(-1)!.state).toBe("failed");
    expect(checkpointSatisfied(state, original)).toBe(false);
    const retry = await prepareOperation(f.context, { checkpointId: corrected.id, operation: { kind: "deploy" } });
    expect(retry.disposition).toBe("proceed");
    expect(corrected.operations.at(-1)!.retryOf).toBe(deployed.operationId);
    await submitEvidence(f.context, { checkpointId: corrected.id, operationId: retry.operationId, references: [call("successful-deployment", 190)] });
    expect(corrected.evidence.map(one => one.requirementId)).toEqual(["deploy"]);
    expect(checkpointSatisfied(state, original)).toBe(false); // Runtime verification has not run.

    const verify = await prepareOperation(f.context, { checkpointId: corrected.id, operation: { kind: "verify" } });
    expect(verify.disposition).toBe("proceed");
    await submitEvidence(f.context, { checkpointId: corrected.id, operationId: verify.operationId, references: [{ ...call("successful-verification", 200), requirementId: "verify" }] });
    expect(await prepareOperation(f.context, { checkpointId: corrected.id, operation: { kind: "synchronize" } })).toMatchObject({ disposition: "proceed" });
    git(f.h.sandbox, f.context.prdWorktree, "fetch", "origin", "develop");
    git(f.h.sandbox, f.context.prdWorktree, "merge", "--no-edit", "origin/develop");
    git(f.h.sandbox, f.context.prdWorktree, "push", "origin", corrected.featureBranch);
    await reconcileDelivery(f.context);
    expect(checkpointSatisfied(state, original)).toBe(true);
    expect(phaseDeliveryCheck(f.context, "1")).toMatchObject({ passed: true });
    expect(original).toEqual({ ...history, supersededBy: corrected.id });
    writePrdRecord(f.h.stateDirectory, f.h.engine.record);
    const reopened = f.h.reopenFromDisk();
    expect(reopened.record.developmentDelivery!.checkpoints[0]).toEqual(original);
    expect(checkpointSatisfied(reopened.record.developmentDelivery!, reopened.record.developmentDelivery!.checkpoints[0]!)).toBe(true);
  });

  it("keeps required work and permission boundaries when the matcher changes", async () => {
    const { f, original, replacement, assess } = await setup();
    original.requireReview = true;
    for (const change of [
      { requiredChecks: [] }, { requireReview: false }, { criteria: [] },
      { requirements: replacement().requirements.slice(0, 1) },
      { target: { ...original.target, baseBranch: "main" } },
      { requirements: replacement().requirements.map(one => ({ ...one, source: { ...one.source, path: "README.md" } })) },
    ]) {
      expect(await assess({ ...replacement(), ...change })).toMatchObject({ ok: false });
      expect(f.h.engine.record.developmentDelivery!.checkpoints).toHaveLength(1);
      expect(f.h.engine.record.developmentDelivery!.checkpoints[0]!.supersededBy).toBeUndefined();
    }
    // A rejected request rolls the ledger back, so use its current saved authority/history.
    expect(await assess(replacement())).toMatchObject({ ok: true });
    expect(f.h.engine.record.developmentAuthorization!.grants).toHaveLength(1);
  });
});
