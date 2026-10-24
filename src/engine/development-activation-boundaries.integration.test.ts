/** Activation must retain the same dependency probes and split assignments as initial delivery. */
import { afterEach, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { documentsDigest, phaseDeliveryCheck, prepareOperation, reconcileDelivery, recordAssessment, submitEvidence } from "./development-delivery.js";
let f: Awaited<ReturnType<typeof deliveryFixture>> | undefined;
afterEach(async () => { await f?.h.cleanup(); f = undefined; });
const later = { "phase-2-recover.md": "# Phase 2: Recover\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n1\n", "phase-3-stopped.md": "# Phase 3: Stopped work\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n2\n" };
it("accepts fresh prerequisite probes for an earlier dependent leaf in the stopped activation conversation", async () => {
  f = await deliveryFixture("squash", later); f.synchronize();
  const { context, checkpoint, h } = f; const state = h.engine.record.developmentDelivery!;
  const dependent = structuredClone(checkpoint); dependent.id = "earlier-dependent"; dependent.phaseId = "2"; dependent.dependsOn = [checkpoint.id];
  dependent.requirements[1] = { id: "verify", purpose: "verification", source: dependent.workflowSource, match: { kind: "command", invocation: "node verify.mjs {{mergeRevision}} {{environment}}", cwd: context.prdWorktree, fields: { "/dependency": `$dependency:${checkpoint.id}` } } };
  dependent.references = dependent.references!.filter(one => one.requirementId !== "verify");
  checkpoint.requirements.push({ id: "current", purpose: "current_artifact", source: checkpoint.workflowSource, match: { kind: "github_deployment" } });
  state.checkpoints.push(dependent); state.assessments.push({ phaseId: "2", documentsDigest: documentsDigest(context, "2"), required: true, criteria: ["AC-RET-01"], reason: "Recover dependent artifact verification", checkpointIds: [dependent.id] });
  h.engine.record.developmentAuthorization!.activationRecovery = { stoppedPhaseId: "3", phaseIds: ["1", "2", "3"], repositoryNames: ["acme-shop"] }; context.phaseId = "3";
  await reconcileDelivery(context); expect(phaseDeliveryCheck(context, "1").passed).toBe(true);
  expect(await prepareOperation(context, { checkpointId: dependent.id, operation: { kind: "verify" } })).toMatchObject({ disposition: "unresolved", operationId: "current-artifact" });
  await submitEvidence(context, { checkpointId: checkpoint.id, operationId: "current-artifact", references: [{ requirementId: "current", kind: "github_deployment", id: "11" }] });
  expect(await prepareOperation(context, { checkpointId: dependent.id, operation: { kind: "verify" } })).toMatchObject({ disposition: "proceed" });
  expect(checkpoint.evidence.find(one => one.requirementId === "current")).toMatchObject({ revision: f.merged, environment: checkpoint.target.environment });
});
it("prepares an ancestor-origin obligation assigned to the first unresolved historical descendant, while denying later scope", async () => {
  f = await deliveryFixture("squash", later); f.synchronize(); const { context, checkpoint, h } = f; const state = h.engine.record.developmentDelivery!;
  const directory = join(context.prdWorktree, context.prdDirectory);
  writeFileSync(join(directory, "phase-1-return-intake.md"), "# Phase 1: Split historical delivery\n\n## Split into\n| Phase | What | Depends on |\n|---|---|---|\n| [1a First](phase-1a-first.md) | First | None |\n| [1b Delivery](phase-1b-delivery.md) | Delivery | 1a |\n");
  for (const id of ["1a", "1b"]) writeFileSync(join(directory, id === "1a" ? "phase-1a-first.md" : "phase-1b-delivery.md"), `# Phase ${id}: Historical descendant\n\n**Closed:** 2026-10-24\n`);
  checkpoint.requirements[1] = { id: "verify", purpose: "verification", source: checkpoint.workflowSource, match: { kind: "command", invocation: "node verify.mjs {{mergeRevision}} {{environment}}", cwd: context.prdWorktree, fields: {} } }; checkpoint.references = checkpoint.references!.filter(one => one.requirementId !== "verify");
  state.splits = [{ phaseId: "1", documentsDigest: documentsDigest(context, "1"), revision: state.revision, assignments: ["requiredMerge", ...checkpoint.requirements.map(one => one.id)].map(requirementId => ({ checkpointId: checkpoint.id, requirementId, originPhaseId: "1", criteria: checkpoint.criteria, leafIds: ["1b"] })) }];
  state.assessments = [{ phaseId: "1a", documentsDigest: documentsDigest(context, "1a"), required: false, criteria: [], reason: "Later descendant owns delivery", checkpointIds: [] }, { phaseId: "1b", documentsDigest: documentsDigest(context, "1b"), required: false, criteria: [], reason: "Retain inherited delivery obligations", checkpointIds: [] }];
  h.engine.record.developmentAuthorization!.activationRecovery = { stoppedPhaseId: "3", phaseIds: ["1a", "1b", "2", "3"], repositoryNames: ["acme-shop"] }; context.phaseId = "3";
  expect(phaseDeliveryCheck(context, "1a").passed).toBe(true);
  expect(await prepareOperation(context, { checkpointId: checkpoint.id, operation: { kind: "verify" } })).toMatchObject({ disposition: "proceed" });
  await expect(recordAssessment(context, { phaseId: "2", documentsDigest: documentsDigest(context, "2"), required: false, criteria: [], reason: "Must not skip earlier descendant", checkpoints: [] })).rejects.toThrow("leaf 1b");
});

it("allows only historical activation checkpoint preparation at a finalization stop and retains the final-remainder merge refusal", async () => {
  f = await deliveryFixture(); f.synchronize(); const { context, checkpoint, h } = f;
  h.engine.record.developmentDelivery!.assessments = [];
  h.engine.record.developmentAuthorization!.activationRecovery = { stoppedPhaseId: "pr", phaseIds: ["1"], repositoryNames: ["acme-shop"] }; context.phaseId = "pr";
  expect(await prepareOperation(context, { checkpointId: checkpoint.id, operation: { kind: "merge" } })).toMatchObject({ disposition: "already_observed" });
  await recordAssessment(context, { phaseId: "1", documentsDigest: documentsDigest(context, "1"), required: false, criteria: [], reason: "Reconcile and reuse the confirmed historical delivery", checkpoints: [] });
  expect(phaseDeliveryCheck(context, "1").passed).toBe(true);
  await expect(prepareOperation(context, { checkpointId: checkpoint.id, operation: { kind: "merge" } })).rejects.toThrow("Finalization does not authorize");
});
it("retains required checks and human review for an unmerged historical checkpoint recovered from finalization", async () => {
  f = await deliveryFixture("none"); const { context, checkpoint, h } = f;
  h.engine.record.developmentDelivery!.assessments = [];
  h.engine.record.developmentAuthorization!.activationRecovery = { stoppedPhaseId: "pr", phaseIds: ["1"], repositoryNames: ["acme-shop"] }; context.phaseId = "pr";
  f.pull.state = "open"; f.pull.merged_at = null; f.pull.merge_commit_sha = "";
  checkpoint.operations[0]!.state = "failed"; checkpoint.requireReview = true;
  const checks = `repos/acme/acme-shop/commits/${f.head}/check-runs?per_page=100&page=1`;
  f.responses[checks] = { body: { check_runs: [{ id: 1, name: "required-check", status: "completed", conclusion: "failure" }] } };
  f.responses[`repos/acme/acme-shop/commits/${f.head}/statuses?per_page=100&page=1`] = { body: [] };
  f.responses["pr-view"] = { body: { headRefOid: f.head, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "REVIEW_REQUIRED" } }; f.save();
  await expect(prepareOperation(context, { checkpointId: checkpoint.id, operation: { kind: "merge" } })).rejects.toThrow("Required pre-merge check");
  expect(checkpoint.operations).toHaveLength(1);
  f.responses[checks] = { body: { check_runs: [{ id: 1, name: "required-check", status: "completed", conclusion: "success" }] } }; f.save();
  await expect(prepareOperation(context, { checkpointId: checkpoint.id, operation: { kind: "merge" } })).rejects.toThrow("Required review");
  expect(checkpoint.operations).toHaveLength(1);
  f.responses["pr-view"] = { body: { headRefOid: f.head, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED" } }; f.save();
  expect(await prepareOperation(context, { checkpointId: checkpoint.id, operation: { kind: "merge" } })).toMatchObject({ disposition: "proceed" });
  expect(checkpoint.operations.at(-1)).toMatchObject({ kind: "merge", sourceHead: f.head, pullRequest: 1, state: "prepared" });
});
