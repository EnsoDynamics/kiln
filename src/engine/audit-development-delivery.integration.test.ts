import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import * as admission from "../audit/admission.js";
import * as owners from "./development-owners.js";
// Real assigned Git workspaces, private state and HTTP/CLI; captured GitHub contracts
// supplement the existing actual-provider provenance proofs, without any remote mutation.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Engine } from "./engine.js";
import { documentsDigest, evaluateRepositories, ownerDeliveryCheck, ownerDocuments, phaseDeliveryCheck, prepareOperation, recordAssessment, reconcileDelivery, type DeliveryContext } from "./development-delivery.js";
import { assignAuditObligations } from "./development-owners.js";
import { deliveryFixture } from "../test-support/development-delivery-fixture.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { deliveryOwner, ownerFields, type DeliveryOwner } from "../state/development-delivery.js";
import { readPrdRecord, SCHEMA_VERSION, writePrdRecord, writeSessionRecord, type SessionRecord } from "../state/records.js";
import { captureSnapshot } from "../audit/snapshots.js";
import { AuditStore, hashBytes } from "../audit/storage.js";
import type { AuditActivity, AuditReport, AuditResult } from "../audit/contracts.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { runDelivery } from "../delivery-command.js";
import { buildSnapshot } from "./snapshot.js";
import { git } from "../test-support/git-repositories.js";
import { launchChrome } from "../test-support/headless-chrome.js";
import { commandContracts } from "../control/help.js";

const directory = "docs/prds/customer-returns";
const prd = "# PRD: Audit development proof\n\n## Acceptance Criteria\n\n- [ ] **AC-RET-01 — Verify the value.** The return value is checked in development.\n- [ ] **AC-RET-02 — Preserve other work.** The unrelated requirement stays separate.\n";
const design = "# Technical Design\nDelivery workflow .github/workflows/deploy.yml with deploy and verify jobs.\n";
type Fixture = Awaited<ReturnType<typeof fixture>>;
let cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); cleanups = []; });
async function fixture() {
  const f = await deliveryFixture("squash", { "customer-returns-prd.md": prd, "technical-design.md": design });
  cleanups.push(() => f.h.cleanup());
  const record = f.h.engine.record;
  const activity: AuditActivity = { activityId: randomUUID(), kind: "delivery_audit", sequence: 1, round: 1, continuationIndex: 1, createdAt: new Date().toISOString(), sessionIds: [], reportPath: "", skill: { name: "delivery-audit", path: join(f.h.sandbox.root, "skill.md"), digest: hashBytes("skill") }, snapshots: [], attempts: [] };
  activity.reportPath = `${directory}/kiln-audit-${activity.activityId}.json`;
  record.completionAudits!.activities.push(activity);
  const store = new AuditStore(f.h.stateDirectory);
  const snapshot = await captureSnapshot({ record, activity, git: f.context.git, now: new Date().toISOString() });
  activity.snapshots.push(store.put(snapshot));
  const owner: DeliveryOwner = { kind: "audit", activityId: activity.activityId };
  const criteria = snapshot.requirements.criteria.map(one => one.key);
  const context: DeliveryContext = { ...f.context, owner }; delete context.phaseId;
  const checkpoint = f.checkpoint;
  delete checkpoint.phaseId; checkpoint.owner = owner; checkpoint.requirementManifestDigest = snapshot.requirements.id; checkpoint.criteria = [criteria[0]!];
  checkpoint.requirements[1]!.source = { path: `${directory}/technical-design.md`, revision: f.head };
  record.developmentDelivery!.assessments = [{ phaseId: "1", owner: { kind: "phase", phaseId: "1" }, documentsDigest: documentsDigest(context, "1"), required: false, criteria: ["AC-RET-01"], reason: "The original phase needed no delivery", checkpointIds: [] }];
  record.phases = { [`audit-${activity.activityId}`]: { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [], stop: { kind: "done_check", at: activity.createdAt, checkedAt: activity.createdAt, checks: [{ name: "Required development delivery verified", passed: false, facts: ["Audit assessment required"] }] } } };
  const read = readPlanAt(f.h.engine.worktreePath, directory); if (!read.ok) throw new Error(read.problem); record.plan = recordedPlan(read.plan);
  const declaration = { ...checkpoint }; delete declaration.references;
  const assess = (change: Record<string, unknown> = {}) => ({ ...ownerFields(owner), ...ownerDocuments(context, owner), executionId: record.executionId, revision: record.developmentDelivery!.revision, required: true, criteria, reason: "Whole-PRD development assessment", checkpoints: [declaration], ...change });
  return { ...f, record, activity, owner, context, criteria, store, snapshot, assess };
}
function acceptRepair(f: Fixture, criterionKeys = [f.criteria[0]!]) {
  const file = "phase-2-repair.md";
  writeFileSync(join(f.h.engine.worktreePath, directory, file), `# Phase 2: Repair\n\n**Added by delivery audit:** ${f.activity.activityId}\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n1\n`);
  const read = readPlanAt(f.h.engine.worktreePath, directory); if (!read.ok) throw new Error(read.problem); f.record.plan = recordedPlan(read.plan);
  // This accepted result is an admission-boundary fixture. Report validation/provenance
  // are proved in admission.integration.test.ts and the actual-provider proof.
  const report = { outcome: "completion_phases", completionPhases: [{ id: "2", criterionKeys }], nextTestBatch: undefined } as unknown as AuditReport;
  const result = { activityId: f.activity.activityId, disposition: "recorded", reportBytes: JSON.stringify(report) } as AuditResult;
  f.activity.acceptedResult = f.store.put(result);
}

describe("audit development owners", () => {
  it("binds full audit assessments to the current manifest, retains immutable origins, and cannot erase checkpoints", async () => {
    const f = await fixture();
    await recordAssessment(f.context, f.assess());
    const saved = f.record.developmentDelivery!.assessments.at(-1)!;
    expect(saved.owner).toEqual(f.owner); expect(saved.phaseId).toBeUndefined(); expect(saved.requirementManifestDigest).toBe(f.snapshot.requirements.id);
    await recordAssessment(f.context, f.assess({ required: false, checkpoints: [] }));
    expect(f.record.developmentDelivery!.assessments.at(-1)).toMatchObject({ required: true, checkpointIds: [f.checkpoint.id] });
    expect(ownerDeliveryCheck(f.context, f.owner).passed).toBe(false);
    const before = structuredClone(f.record.developmentDelivery);
    await expect(recordAssessment(f.context, f.assess({ requirementManifestDigest: "0".repeat(64) }))).rejects.toThrow(/manifest changed/);
    await expect(recordAssessment(f.context, f.assess({ criteria: [f.criteria[0]!] }))).rejects.toThrow(/every exact criterion/);
    await expect(recordAssessment(f.context, f.assess({ owner: { kind: "audit", activityId: "other" } }))).rejects.toThrow(/current unfinished audit/);
    expect(f.record.developmentDelivery).toEqual(before);
    await expect(recordAssessment(f.context, f.assess({ checkpoints: [{ ...f.checkpoint, phaseId: "1" }] }))).rejects.toThrow();
    writeFileSync(join(f.h.engine.worktreePath, directory, "customer-returns-prd.md"), prd.replace("return value", "new return value"));
    // Every failing item is listed (AC-WAIVE-11): the stale assessment, and the unmet obligations beside it.
    expect(ownerDeliveryCheck(f.context, f.owner)).toMatchObject({ passed: false, facts: expect.arrayContaining([expect.stringContaining("needs a current development-delivery assessment")]) });
  });

  it("migrates schema-6 phase origins without rewriting history and refuses ambiguous audit origins", async () => {
    const f = await fixture();
    f.record.schemaVersion = 6;
    delete f.checkpoint.owner; delete f.checkpoint.requirementManifestDigest; f.checkpoint.phaseId = "1";
    for (const assessment of f.record.developmentDelivery!.assessments) delete assessment.owner;
    const path = join(f.h.stateDirectory, "prd.json"); const bytes = JSON.stringify(f.record); writeFileSync(path, bytes);
    const migrated = readPrdRecord(f.h.stateDirectory)!;
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION); expect(migrated.executionId).toBe(f.record.executionId);
    expect(migrated.developmentDelivery!.checkpoints[0]?.owner).toEqual({ kind: "phase", phaseId: "1" });
    expect(migrated.developmentDelivery!.checkpoints[0]?.operations).toEqual(f.checkpoint.operations);
    expect(readFileSync(path, "utf8")).toBe(bytes);
    const retained = JSON.parse(readFileSync(join(f.h.stateDirectory, "audit-migration.json"), "utf8")) as { original: string };
    expect(f.store.bytes(retained.original)).toBe(bytes);
    f.record.schemaVersion = 7; f.checkpoint.owner = f.owner; // Both owner kinds cannot share a fabricated phaseId.
    writeFileSync(path, JSON.stringify(f.record)); expect(() => readPrdRecord(f.h.stateDirectory)).toThrow(/owner|checkpoint/);
    delete f.checkpoint.phaseId; f.checkpoint.owner = { kind: "audit", activityId: "foreign" }; f.checkpoint.requirementManifestDigest = f.snapshot.requirements.id;
    writeFileSync(path, JSON.stringify(f.record)); expect(() => readPrdRecord(f.h.stateDirectory)).toThrow(/checkpoint/);
  });

  it("checks actual temporary Git source coverage and captured deployment/job observations for an audit origin", async () => {
    const f = await fixture(); await recordAssessment(f.context, f.assess());
    await reconcileDelivery(f.context);
    expect(f.checkpoint.merge?.resultSha).toBe(f.merged);
    expect(f.checkpoint.evidence.map(one => [one.requirementId, one.status])).toEqual([["deploy", "success"], ["verify", "success"]]);
    expect(ownerDeliveryCheck(f.context, f.owner).passed).toBe(false); // synchronization is independently required
    f.synchronize(); await reconcileDelivery(f.context);
    expect(ownerDeliveryCheck(f.context, f.owner).passed).toBe(true);
    const result = await evaluateRepositories(f.context);
    expect(result.passed, JSON.stringify(result.checks)).toBe(true);
    const origin = structuredClone(deliveryOwner(f.checkpoint));
    const observed = structuredClone(f.checkpoint.evidence.find(one => one.requirementId === "verify")!);
    f.jobs.jobs[1]!.conclusion = "failure"; f.save();
    expect((await evaluateRepositories(f.context)).passed).toBe(false);
    expect(deliveryOwner(f.checkpoint)).toEqual(origin);
    expect([...f.checkpoint.evidence, ...(f.checkpoint.evidenceHistory ?? [])]).toContainEqual(observed);
    expect(readFileSync(observed.rawPath, "utf8")).toContain("verify");
  });

  it("assigns only matching audit obligations to a repair and preserves requiredMerge through a split", async () => {
    const f = await fixture(); f.checkpoint.criteria.push(f.criteria[1]!); await recordAssessment(f.context, f.assess());
    const other = { ...structuredClone(f.checkpoint), id: "other-criterion", criteria: [f.criteria[1]!] }; f.record.developmentDelivery!.checkpoints.push(other);
    acceptRepair(f);
    const repair: DeliveryOwner = { kind: "phase", phaseId: "2" };
    const revision = f.record.developmentDelivery!.revision;
    assignAuditObligations(f.context, f.activity.activityId, repair);
    assignAuditObligations(f.context, f.activity.activityId, repair);
    expect(f.record.developmentDelivery!.revision).toBe(revision + 1);
    const entries = f.record.developmentDelivery!.assignments!;
    expect(entries).toHaveLength(3); expect(entries.map(one => one.requirementId).sort()).toEqual(["deploy", "requiredMerge", "verify"]);
    expect(entries.every(one => one.checkpointId === f.checkpoint.id && one.criteria.join() === f.criteria[0])).toBe(true);
    const context = { ...f.context, owner: repair, phaseId: "2" };
    await recordAssessment(context, { phaseId: "2", documentsDigest: documentsDigest(context, "2"), required: false, criteria: ["AC-RET-01"], reason: "Repair inherits existing obligations", checkpoints: [] });
    expect(phaseDeliveryCheck(context, "2").passed).toBe(false);
    await expect(prepareOperation({ ...f.context, owner: { kind: "audit", activityId: "unassigned" } }, { checkpointId: f.checkpoint.id, operation: { kind: "verify" } })).rejects.toThrow(/current unfinished audit/);
    expect(() => assignAuditObligations(f.context, f.activity.activityId, { kind: "phase", phaseId: "1" })).toThrow(/matching open completion phase/);
    const parent = join(f.h.engine.worktreePath, directory, "phase-2-repair.md");
    writeFileSync(parent, "# Phase 2: Repair — split\n\n## Split into\n| Phase | What |\n|---|---|\n| [2a](phase-2a-first.md) | First |\n| [2b](phase-2b-second.md) | Second |\n");
    for (const id of ["2a", "2b"]) writeFileSync(join(f.h.engine.worktreePath, directory, `phase-${id}-${id === "2a" ? "first" : "second"}.md`), `# Phase ${id}: Child\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\n1\n`);
    const child = { ...context, phaseId: "2a", owner: { kind: "phase" as const, phaseId: "2a" } };
    expect(phaseDeliveryCheck(child, "2a").facts.join()).toContain("Assign the retained obligations");
    const split = { phaseId: "2", documentsDigest: documentsDigest(context, "2"), assignments: entries.map(one => ({ checkpointId: one.checkpointId, requirementId: one.requirementId, originOwner: f.owner, criteria: one.criteria, leafIds: ["2a"] })) };
    await recordAssessment(child, { phaseId: "2a", documentsDigest: documentsDigest(child, "2a"), required: false, criteria: ["AC-RET-01"], reason: "First child completes this obligation", checkpoints: [], split });
    expect(phaseDeliveryCheck(child, "2a").facts.join()).toContain("requiredMerge");
    expect(f.checkpoint.owner).toEqual(f.owner); expect(f.checkpoint.phaseId).toBeUndefined();
    const widened = structuredClone(split); widened.assignments[0]!.criteria.push(f.criteria[1]!);
    await expect(recordAssessment(child, { phaseId: "2a", documentsDigest: documentsDigest(child, "2a"), required: false, criteria: ["AC-RET-01"], reason: "Must not acquire the sibling criterion", checkpoints: [], split: widened })).rejects.toThrow(/invalid descendant or criterion assignment/);
  });

  it("gives a repair named by a version-2 report every criterion of its audit's obligations (AC-NEUTRAL-04)", async () => {
    const f = await fixture(); f.checkpoint.criteria.push(f.criteria[1]!); await recordAssessment(f.context, f.assess());
    acceptRepair(f);
    const v2 = { schemaVersion: 2, executionId: f.record.executionId, activityId: f.activity.activityId, kind: "delivery_audit", outcome: "completion_phases", summary: "One gap.", completionPhases: ["2"], needsYou: [] };
    f.activity.acceptedResult = f.store.put({ activityId: f.activity.activityId, disposition: "recorded", reportBytes: JSON.stringify(v2) });
    assignAuditObligations(f.context, f.activity.activityId, { kind: "phase", phaseId: "2" });
    const assigned = f.record.developmentDelivery!.assignments!;
    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned.every(one => [...one.criteria].sort().join() === [...f.criteria].sort().join())).toBe(true);
    expect(() => assignAuditObligations(f.context, f.activity.activityId, { kind: "phase", phaseId: "1" })).toThrow(/matching open completion phase/);
  });

  it("refuses checkpoint replacement by a partial owner and allows the full assigned owner without changing the original origin", async () => {
    const f = await fixture(); await recordAssessment(f.context, f.assess()); acceptRepair(f);
    const repair: DeliveryOwner = { kind: "phase", phaseId: "2" };
    f.record.developmentDelivery!.assignments = [{ checkpointId: f.checkpoint.id, requirementId: "verify", owner: repair, criteria: [f.criteria[0]!] }];
    writeFileSync(join(f.h.engine.worktreePath, "repair.txt"), "Corrected source work\n");
    git(f.h.sandbox, f.h.engine.worktreePath, "add", "--", "repair.txt"); git(f.h.sandbox, f.h.engine.worktreePath, "commit", "-m", "test(repair): correct disposable source");
    const headSha = git(f.h.sandbox, f.h.engine.worktreePath, "rev-parse", "HEAD").trim();
    const checkpoint = { ...f.checkpoint, id: "corrected-checkpoint", ...ownerFields(repair), headSha, replaces: f.checkpoint.id }; delete checkpoint.references; delete checkpoint.requirementManifestDigest;
    const context = { ...f.context, owner: repair, phaseId: "2" };
    const body = { phaseId: "2", documentsDigest: documentsDigest(context, "2"), required: true, criteria: [f.criteria[0]!], reason: "Corrected development delivery", checkpoints: [checkpoint] };
    await expect(recordAssessment(context, body)).rejects.toThrow(/all retained merge\/evidence obligations and criteria/);
    expect(f.checkpoint.supersededBy).toBeUndefined(); expect(f.checkpoint.owner).toEqual(f.owner);
    assignAuditObligations(f.context, f.activity.activityId, repair);
    await recordAssessment(context, body);
    expect(f.checkpoint.supersededBy).toBe(checkpoint.id);
    expect(f.record.developmentDelivery!.checkpoints.find(one => one.id === checkpoint.id)?.owner).toEqual(repair);
    expect(f.checkpoint.owner).toEqual(f.owner);
  });

  it("preserves a continuation's per-requirement criterion scope when assigning a later repair", async () => {
    const f = await fixture(); f.checkpoint.criteria.push(f.criteria[1]!); await recordAssessment(f.context, f.assess());
    f.activity.kind = "test_audit";
    f.activity.acceptedResult = f.store.put({ activityId: f.activity.activityId, disposition: "recorded", reportBytes: JSON.stringify({ outcome: "continue_test", nextTestBatch: { criterionKeys: [f.criteria[0]!] }, completionPhases: [] }) });
    const next: AuditActivity = { ...f.activity, activityId: randomUUID(), sequence: 2, continuationIndex: 2, snapshots: [], attempts: [] }; delete next.acceptedResult;
    next.reportPath = `${directory}/kiln-audit-${next.activityId}.json`; f.record.completionAudits!.activities.push(next);
    const snapshot = await captureSnapshot({ record: f.record, activity: next, git: f.context.git, now: new Date().toISOString() }); next.snapshots.push(f.store.put(snapshot));
    const owner: DeliveryOwner = { kind: "audit", activityId: next.activityId };
    assignAuditObligations(f.context, f.activity.activityId, owner);
    acceptRepair({ ...f, activity: next }, f.criteria);
    assignAuditObligations(f.context, next.activityId, { kind: "phase", phaseId: "2" });
    const assigned = f.record.developmentDelivery!.assignments!.filter(one => one.owner.kind === "phase");
    expect(assigned).toHaveLength(3); expect(assigned.every(one => one.criteria.length === 1 && one.criteria[0] === f.criteria[0])).toBe(true);
  });

  it("recovers phase, audit and repair owners in observed order from both repair-phase and later-audit stops", async () => {
    const f = await fixture(); acceptRepair(f);
    const firstAudit = f.activity;
    // The repair has no recorded run yet: its accepted audit origin still places it after that audit.
    const path = join(f.h.engine.worktreePath, directory, "phase-2-repair.md"); writeFileSync(path, readFileSync(path, "utf8").replace("## Acceptance", "**Closed:** 2026-10-24\n\n## Acceptance"));
    const plan = readPlanAt(f.h.engine.worktreePath, directory); if (!plan.ok) throw new Error(plan.problem); f.record.plan = recordedPlan(plan.plan);
    const repair: DeliveryOwner = { kind: "phase", phaseId: "2" }; const at = new Date(Date.parse(firstAudit.createdAt) + 1_000).toISOString();
    f.record.phases = { "2": { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [], stop: { kind: "done_check", at, checkedAt: at, checks: [] } } };
    f.record.developmentAuthorization = { revision: 1, enabled: false, grants: [] };
    const engine = new Engine({ record: f.record, stateDirectory: f.h.stateDirectory, paths: f.h.engine.paths, tools: f.h.tools, env: f.h.env }); cleanups.push(async () => engine.close()); await engine.agents.refresh();
    expect(engine.authorizeDevelopmentTarget({ executionId: f.record.executionId, authorizationRevision: 1, target: f.checkpoint.target, confirmedNonProduction: true })).toEqual({ ok: true });
    expect(f.record.developmentAuthorization.activationRecovery?.owners).toEqual([{ kind: "phase", phaseId: "1" }, f.owner, repair]);
    f.record.developmentAuthorization = { revision: 1, enabled: false, grants: [] };
    const later: AuditActivity = { ...firstAudit, activityId: randomUUID(), sequence: 2, round: 2, createdAt: at, snapshots: [], attempts: [] }; delete later.acceptedResult;
    f.record.completionAudits!.activities.push(later); const key = `audit-${later.activityId}`;
    f.record.phases = { [key]: { sessionIds: [], finishedByPerson: false, repositories: {}, outsideConfirmations: [], stop: { kind: "done_check", at, checkedAt: at, checks: [] } } };
    expect(engine.authorizeDevelopmentTarget({ executionId: f.record.executionId, authorizationRevision: 1, target: f.checkpoint.target, confirmedNonProduction: true })).toEqual({ ok: true });
    expect(f.record.developmentAuthorization.activationRecovery?.owners).toEqual([{ kind: "phase", phaseId: "1" }, f.owner, repair, { kind: "audit", activityId: later.activityId }]);
  });

  it("authenticates the delivery CLI, persists owner/revision before acknowledgement, and rolls back real save failures", async () => {
    const f = await fixture();
    const engine = new Engine({ record: f.record, stateDirectory: f.h.stateDirectory, paths: f.h.engine.paths, tools: { ...f.h.tools, gh: f.context.gh }, env: f.context.env });
    cleanups.push(async () => engine.close()); await engine.agents.refresh(); writePrdRecord(f.h.stateDirectory, f.record);
    const hosted = await startFixtureController({ engine, folderName: "customer-returns", featureName: "Audit development proof", token: f.record.token });
    const server = hosted.server; cleanups.push(async () => hosted.release()); cleanups.push(() => server.close());
    const address = new URL(server.address).origin;
    expect((await fetch(`${address}/api/delivery`, { headers: { Origin: address } })).status).toBe(403);
    const status = engine.deliveryStatus(); expect(status.owner).toEqual(f.owner); expect(status.phaseId).toBeUndefined(); expect(status.requirementManifestDigest).toBe(f.snapshot.requirements.id);
    // AC-ACT-01: construct real helper requests from the shipped file examples,
    // substituting the documented status/provider values, then use the actual CLI.
    const exampleInput = (command: string, index = 0) => structuredClone(Object.values(commandContracts.find(c => c.path.join(" ") === `delivery ${command}`)!.examples[index]!.files!)[0]) as Record<string, unknown>;
    const file = join(f.h.sandbox.root, "assess.json"); writeFileSync(file, JSON.stringify(f.assess()));
    let stdout = ""; let stderr = "";
    expect(await runDelivery(["assess", file], { cwd: engine.worktreePath, env: f.context.env, stdout: { write: text => stdout += text }, stderr: { write: text => stderr += text } })).toBe(0);
    expect(stderr).toBe(""); expect(JSON.parse(stdout).owner).toEqual(f.owner);
    const saved = readPrdRecord(f.h.stateDirectory)!; expect(saved.developmentDelivery!.assessments.at(-1)?.owner).toEqual(f.owner);
    expect(saved.developmentDelivery!.revision).toBe(status.revision + 1);
    expect(await engine.deliveryCommand("prepare", { executionId: saved.executionId, revision: saved.developmentDelivery!.revision, checkpointId: f.checkpoint.id, operation: { kind: "verify" } })).toMatchObject({ ok: false, status: 400 });
    const beforeWrongOwner = structuredClone(f.record.developmentDelivery);
    expect(await engine.deliveryCommand("prepare", { executionId: saved.executionId, revision: saved.developmentDelivery!.revision, owner: { kind: "audit", activityId: "another-audit" }, checkpointId: f.checkpoint.id, operation: { kind: "verify" } })).toMatchObject({ ok: false, status: 409 });
    expect(f.record.developmentDelivery).toEqual(beforeWrongOwner);
    // Discovery has not supplied the known verification run yet; submit its exact
    // immutable provider reference through the real client after preparing the operation.
    f.checkpoint.references = f.checkpoint.references!.filter(one => one.requirementId !== "verify");
    f.responses[`repos/acme/acme-shop/actions/workflows/${encodeURIComponent(".github/workflows/deploy.yml")}/runs?head_sha=${f.merged}&per_page=100&page=1`] = { body: { workflow_runs: [] } }; f.save();
    const prepareInput = exampleInput("prepare");
    Object.assign(prepareInput, { executionId: f.record.executionId, revision: f.record.developmentDelivery!.revision, owner: f.owner, checkpointId: f.checkpoint.id });
    (prepareInput.operation as { requirementIds: string[] }).requirementIds = ["verify"];
    writeFileSync(file, JSON.stringify(prepareInput));
    stdout = "";
    expect(await runDelivery(["prepare", file], { cwd: engine.worktreePath, env: f.context.env, stdout: { write: text => stdout += text }, stderr: { write: text => stderr += text } })).toBe(0);
    const prepared = JSON.parse(stdout) as { revision: number; result: { operationId: string; disposition: string } };
    expect(prepared.result.disposition).toBe("proceed");
    expect(readPrdRecord(f.h.stateDirectory)!.developmentDelivery!.checkpoints[0]!.operations.at(-1)).toMatchObject({ id: prepared.result.operationId, kind: "verify", requirementIds: ["verify"], state: "prepared" });
    const evidenceInput = exampleInput("evidence", 1);
    Object.assign(evidenceInput, { executionId: f.record.executionId, revision: prepared.revision, owner: f.owner, checkpointId: f.checkpoint.id, operationId: prepared.result.operationId });
    Object.assign((evidenceInput.references as Record<string, unknown>[])[0]!, { requirementId: "verify", id: "21" });
    writeFileSync(file, JSON.stringify(evidenceInput));
    stdout = "";
    expect(await runDelivery(["evidence", file], { cwd: engine.worktreePath, env: f.context.env, stdout: { write: text => stdout += text }, stderr: { write: text => stderr += text } })).toBe(0);
    const observed = readPrdRecord(f.h.stateDirectory)!;
    expect(observed.developmentDelivery!.revision).toBe(prepared.revision + 1);
    expect(observed.developmentDelivery!.checkpoints[0]!.operations.at(-1)).toMatchObject({ id: prepared.result.operationId, state: "observed", references: [{ requirementId: "verify", kind: "github_workflow", id: "21" }] });
    expect(observed.developmentDelivery!.checkpoints[0]!.owner).toEqual(f.owner);
    const before = structuredClone(f.record.developmentDelivery); const path = join(f.h.stateDirectory, "prd.json"); renameSync(path, `${path}.saved`); mkdirSync(path);
    try { expect(await engine.deliveryCommand("assessment", f.assess({ checkpoints: [], required: false }))).toMatchObject({ ok: false }); expect(f.record.developmentDelivery).toEqual(before); }
    finally { rmSync(path, { recursive: true }); renameSync(`${path}.saved`, path); }
  });

  it("shows the stopped audit's retained owner in the real first-grant browser control", async () => {
    const f = await fixture(); f.record.developmentAuthorization = { revision: 1, enabled: false, grants: [] }; f.record.developmentDelivery!.assessments = [];
    const engine = new Engine({ record: f.record, stateDirectory: f.h.stateDirectory, paths: f.h.engine.paths, tools: f.h.tools, env: f.h.env }); cleanups.push(async () => engine.close()); await engine.agents.refresh(); writePrdRecord(f.h.stateDirectory, f.record);
    const hosted = await startFixtureController({ engine, folderName: "customer-returns", featureName: "Audit development proof", token: f.record.token });
    const server = hosted.server; cleanups.push(async () => hosted.release()); cleanups.push(() => server.close());
    const chrome = await launchChrome(); cleanups.push(() => chrome.close()); const page = await chrome.open(server.address);
    await page.waitFor(`document.querySelector('article[aria-label="Early merges for acme-shop"] button')`);
    await page.evaluate(`document.querySelector('article[aria-label="Early merges for acme-shop"] button').click()`);
    await page.waitFor(`document.body.innerText.includes('audit ${f.activity.activityId}')`);
    expect(engine.record.developmentAuthorization?.activationRecovery?.stoppedOwner).toEqual(f.owner);
    expect(engine.record.developmentAuthorization?.grants.map(one => one.target)).toEqual([{ repository: f.checkpoint.target.repository, baseBranch: f.checkpoint.target.baseBranch }]);
    expect(page.problems).toEqual([]); expect(engine.current).toBeUndefined();
  });

  it("activates earlier phase/audit assessments in order and retains current authority in the manual audit recovery prompt", async () => {
    const f = await fixture();
    f.record.developmentAuthorization = { revision: 1, enabled: false, grants: [] };
    f.record.developmentDelivery!.assessments = [];
    const sessionId = randomUUID(); const key = `audit-${f.activity.activityId}`;
    const session: SessionRecord = { schemaVersion: SCHEMA_VERSION, sessionId, activityId: f.activity.activityId, phaseId: "", kind: "delivery_audit", agentId: "claude_code", createdAt: f.activity.createdAt, model: "sonnet", modelDisplayName: "Sonnet", runs: [{ cause: "launch", pid: 99999999, startedAt: f.activity.createdAt, endedAt: f.activity.createdAt }], sleeps: [], steps: [] };
    f.record.phases[key]!.sessionIds = [sessionId]; f.activity.sessionIds = [sessionId]; writeSessionRecord(f.h.stateDirectory, session);
    // This case exercises a resumable conversation's authority prompt. Keep
    // actual usable provider history; a PID alone cannot establish resumption.
    const history = join(f.h.env.CLAUDE_CONFIG_DIR!, "projects", "manual-audit-authority"); mkdirSync(history, { recursive: true, mode: 0o700 });
    writeFileSync(join(history, `${sessionId}.jsonl`), JSON.stringify({ type: "user", sessionId, uuid: randomUUID(), parentUuid: null, timestamp: session.createdAt, message: { role: "user", content: "Review the recorded audit with current authority." } }) + "\n", { mode: 0o600 });
    const engine = new Engine({ record: f.record, stateDirectory: f.h.stateDirectory, paths: f.h.engine.paths, tools: f.h.tools, env: f.h.env }); cleanups.push(async () => engine.close()); await engine.agents.refresh();
    const authority = { executionId: f.record.executionId, authorizationRevision: 1, target: f.checkpoint.target, confirmedNonProduction: true };
    expect(engine.authorizeDevelopmentTarget(authority)).toEqual({ ok: true });
    expect(engine.deliveryStatus().activationRecovery?.map(one => one.owner)).toEqual([{ kind: "phase", phaseId: "1" }, f.owner]);
    expect(f.record.developmentAuthorization.activationRecovery?.stoppedPhaseId).toBeUndefined();
    expect(f.record.developmentAuthorization.activationRecovery?.stoppedOwner).toEqual(f.owner);
    expect(await engine.deliveryCommand("assessment", f.assess())).toMatchObject({ ok: false, reason: expect.stringContaining("leaf 1") });
    const phaseStatus = engine.deliveryStatus().activationRecovery![0]!;
    expect(await engine.deliveryCommand("assessment", { executionId: f.record.executionId, revision: f.record.developmentDelivery!.revision, phaseId: "1", documentsDigest: phaseStatus.documentsDigest, required: false, criteria: [], reason: "Historical phase needed no development work", checkpoints: [] })).toMatchObject({ ok: true });
    expect(await engine.deliveryCommand("assessment", f.assess({ checkpoints: [] , required: false }))).toMatchObject({ ok: true });
    const recovery = buildSnapshot(engine).needsYou!;
    expect(recovery.resumeOffered).toBe(true);
    expect(recovery.resumePrompt).toContain("Delivery audit"); expect(recovery.resumePrompt).toContain(f.activity.reportPath); expect(recovery.resumePrompt).toContain("current saved authority".replace("current", "Current"));
    expect(recovery.resumePrompt).not.toContain("Carry on opening"); expect(recovery.resumePrompt).not.toContain("Carry on with `docs/prds/customer-returns/`");
    const state = readPrdRecord(f.h.stateDirectory)!;
    expect(state.developmentAuthorization).toEqual(f.record.developmentAuthorization);
    expect(engine.authorizeDevelopmentTarget(authority)).toEqual({ ok: true });
  });
  it("allocates test continuation identity and retained obligations in one rollback-safe state write", async () => {
    const f=await fixture();await recordAssessment(f.context,f.assess());
    f.activity.kind="test_audit";
    f.activity.acceptedResult=f.store.put({activityId:f.activity.activityId,disposition:"recorded",reportBytes:JSON.stringify({outcome:"continue_test",nextTestBatch:{criterionKeys:[f.criteria[0]!]},completionPhases:[]})});
    f.record.phases[`audit-${f.activity.activityId}`]!.doneAt=new Date().toISOString();
    const allocate=f.h.engine as unknown as {allocateAudit(kind:"test_audit",continuation:boolean):Promise<AuditActivity>};
    const path=join(f.h.stateDirectory,"prd.json"),held=path+".held";
    writePrdRecord(f.h.stateDirectory,f.record);const before=structuredClone(f.record);
    const originalAssign=owners.assignAuditObligations;let failOnce=true;
    const assign=vi.spyOn(owners,"assignAuditObligations").mockImplementation((...args)=>{originalAssign(...args);if(failOnce){failOnce=false;renameSync(path,held);mkdirSync(path);}});
    try {
      await expect(allocate.allocateAudit("test_audit",true)).rejects.toThrow();
      expect(f.h.engine.record).toEqual(before);
      rmSync(path,{recursive:true});renameSync(held,path);
      expect(readPrdRecord(f.h.stateDirectory)!.completionAudits!.activities).toHaveLength(1);
      const next=await allocate.allocateAudit("test_audit",true);const saved=readPrdRecord(f.h.stateDirectory)!;
      expect(next).toMatchObject({kind:"test_audit",round:1,continuationIndex:2,sessionIds:[]});
      expect(saved.nextActivityKey).toBe(`audit-${next.activityId}`);expect(saved.completionAudits!.activities).toHaveLength(2);
      expect(saved.developmentDelivery!.assignments!.map(a=>[a.requirementId,a.owner,a.criteria])).toEqual(expect.arrayContaining(["requiredMerge","deploy","verify"].map(id=>[id,{kind:"audit",activityId:next.activityId},[f.criteria[0]!]])));
      expect(saved.developmentDelivery!.checkpoints[0]!.owner).toEqual(f.owner);expect(f.h.claudeCalls()).toHaveLength(1);
    } finally {assign.mockRestore();if(existsSync(held)){rmSync(path,{recursive:true,force:true});renameSync(held,path);}}
  });

  it("settles audit repair assignments atomically and rolls back a real state-write failure", async () => {
    const f = await fixture();
    await recordAssessment(f.context, f.assess()); f.synchronize(); await reconcileDelivery(f.context);
    expect(ownerDeliveryCheck(f.context, f.owner).passed).toBe(true);
    acceptRepair(f);
    git(f.h.sandbox, f.h.engine.worktreePath, "add", "--", `${directory}/phase-2-repair.md`);
    git(f.h.sandbox, f.h.engine.worktreePath, "commit", "-m", "test(audit): append owned repair fixture");
    git(f.h.sandbox, f.h.engine.worktreePath, "push", "origin", f.record.settings.featureBranch);
    f.h.tools.gh = f.context.gh; Object.assign(f.h.env, f.context.env);
    // Admission/currentness are separately proved from actual provider histories. This
    // accepted fixture isolates the engine's assignment/persistence boundary, not provenance.
    const current = vi.spyOn(admission, "auditCurrentness").mockResolvedValue({ deliveryCurrent: true, testsCurrent: true });
    const originalAssign = owners.assignAuditObligations; let failOnce = true;
    const path = join(f.h.stateDirectory, "prd.json"); const saved = path + ".held";
    f.record.pause.requestedAt = new Date().toISOString(); writePrdRecord(f.h.stateDirectory, f.record);
    const before = structuredClone(f.record.developmentDelivery!);
    const assign = vi.spyOn(owners, "assignAuditObligations").mockImplementation((...args) => {
      originalAssign(...args);
      if (failOnce) { failOnce = false; renameSync(path, saved); mkdirSync(path); }
    });
    try {
      await expect(f.h.engine.checkAgain(recoveryRequest(f.h.engine, "verify"))).rejects.toThrow();
      const rolledBack = structuredClone(f.h.engine.record.developmentDelivery!);
      // Reconciliation legitimately refreshes observation timestamps before assignment.
      rolledBack.checkedAt = before.checkedAt!;
      for (const checkpoint of rolledBack.checkpoints) checkpoint.checkedAt = before.checkpoints.find(c => c.id === checkpoint.id)!.checkedAt!;
      expect(rolledBack).toEqual(before);
      expect(f.h.engine.record.phases[`audit-${f.activity.activityId}`]!.doneAt).toBeUndefined();
      expect(f.h.claudeCalls()).toHaveLength(1);
      rmSync(path, { recursive: true }); renameSync(saved, path);
      expect(readPrdRecord(f.h.stateDirectory)!.developmentDelivery!.assignments ?? []).toEqual([]);
      await f.h.engine.checkAgain(recoveryRequest(f.h.engine, "verify")); await f.h.engine.settled();
      const persisted = readPrdRecord(f.h.stateDirectory)!;
      expect(persisted.developmentDelivery!.assignments!.map(a => [a.requirementId,a.owner,a.criteria])).toEqual(expect.arrayContaining(["requiredMerge","deploy","verify"].map(id => [id,{kind:"phase",phaseId:"2"},[f.criteria[0]!]])));
      expect(persisted.developmentDelivery!.assignments).toHaveLength(3);
      expect(persisted.developmentDelivery!.revision).toBe(before.revision + 1);
      expect(persisted.developmentDelivery!.checkpoints[0]!.owner).toEqual(f.owner);
      expect(persisted.phases[`audit-${f.activity.activityId}`]!.doneAt).toBeTruthy();
      expect(f.h.claudeCalls()).toHaveLength(1); // pause prevents repair dispatch until persisted
    } finally { current.mockRestore(); assign.mockRestore(); if (existsSync(saved)) { rmSync(path,{recursive:true,force:true}); renameSync(saved,path); } }
  });

});
