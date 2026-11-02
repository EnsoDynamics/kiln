// Real Git, filesystem, HTTP and CLI: Kiln admits the version-2 report on its own facts
// (method-neutral audits, AC-NEUTRAL-01..10), never on how the audit was conducted.
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, renameSync, rmdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createBareOrigin, createRepository, createSandbox, commitFiles, git, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { newPrdRecord } from "../state/new-record.js";
import { readPrdRecord, writePrdRecord } from "../state/records.js";
import { prdStateDirectory, stateRoot } from "../state/state-files.js";
import { ownerDeliveryCheck, ownerDocuments, recordAssessment, type DeliveryContext } from "../engine/development-delivery.js";
import { Engine } from "../engine/engine.js";
import { TOKEN_HEADER, type LocalServer } from "../server/local-server.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { runAudit } from "../audit-command.js";
import { auditCurrentness, auditStatus, issueSnapshot, latestAuditRefusal, submitAudit, type AdmissionContext } from "./admission.js";
import { AuditStore, hashBytes, strictJson } from "./storage.js";
import { captureSnapshot, requirementManifest, phaseScope } from "./snapshots.js";
import { AuditRefusal, type AuditActivity, type AuditReportV2 } from "./contracts.js";
import { commandContracts } from "../control/help.js";
import { auditNext } from "./workflow.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(f => f())); });
const directory = "docs/prds/proof";
const prd = "# PRD: Audit proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return the value.** The function returns 42.\n  - The exported function is reachable.\n";
const closedPhase = "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n";
async function fixture(kind: "delivery_audit" | "test_audit" = "delivery_audit", options: { openPhase?: boolean; companion?: boolean } = {}) {
  const sandbox = createSandbox(); cleanups.push(() => sandbox.cleanup());
  const origin = createBareOrigin(sandbox, "proof"); const root = createRepository(sandbox, "proof", origin);
  // No technical design: method documents are neither required nor traversed (AC-NEUTRAL-02).
  commitFiles(sandbox, root, directory, { "proof-prd.md": prd, "phase-1-value.md": options.openPhase ? closedPhase.replace("**Closed:** 2026-10-24\n\n", "") : closedPhase });
  writeFileSync(join(root, "value.mjs"), "export const value = () => 42;\n");
  writeFileSync(join(root, "value.test.mjs"), "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n");
  commit(sandbox, root, ["value.mjs", "value.test.mjs"]);
  const record = newPrdRecord({ mainCheckoutPath: root, repositoryName: "proof", github: "example/proof", prdDirectoryFromRoot: directory, featureName: "Audit proof", settings: { workspaceFolder: sandbox.root, worktreePath: root, featureBranch: "develop", baseBranch: "develop", bases: {}, model: "sonnet", effort: "low", keepAwake: false, resumeAfterUsageLimit: false } });
  const started = new Date(Date.now() - 60_000).toISOString(); record.startedAt = started; record.setupCompletedAt = started;
  record.repositories = [{ name: "proof", kind: "prd", mainCheckoutPath: root, github: "example/proof", baseBranch: "develop", worktreePath: root, setupCompletedAt: started }];
  if (options.companion) {
    const other = createRepository(sandbox, "companion", createBareOrigin(sandbox, "companion"));
    writeFileSync(join(other, "companion.mjs"), "export const value = 42;\n"); commit(sandbox, other, ["companion.mjs"]);
    record.repositories.push({ name: "companion", kind: "named", mainCheckoutPath: other, github: "example/companion", baseBranch: "develop", worktreePath: other, setupCompletedAt: started });
  }
  const skillName = kind === "delivery_audit" ? "delivery-audit" : "test-audit";
  const skillPath = join(sandbox.root, `${skillName}-SKILL.md`); const skillText = `# ${skillName}\nFixture skill source.\n`; writeFileSync(skillPath, skillText);
  const activity: AuditActivity = { activityId: randomUUID(), sequence: 1, kind, round: 1, continuationIndex: 1, createdAt: started, sessionIds: [randomUUID()], reportPath: "", skill: { name: skillName, path: skillPath, digest: hashBytes(skillText) }, snapshots: [], attempts: [] };
  activity.reportPath = `${directory}/kiln-audit-${activity.activityId}.json`; record.completionAudits!.activities.push(activity);
  const stateDirectory = prdStateDirectory(stateRoot(sandbox.env), root, "proof", directory);
  const context: AdmissionContext = { record, stateDirectory, git: { git: "git", env: sandbox.env }, signal: AbortSignal.timeout(120_000) };
  // As allocation does: Kiln captures the work the audit starts from.
  const store = new AuditStore(stateDirectory);
  activity.snapshots.push(store.put(await captureSnapshot({ ...context, activity, now: started })));
  writePrdRecord(stateDirectory, record);
  const body = () => ({ executionId: record.executionId, activityId: activity.activityId, revision: record.completionAudits!.revision });
  const report: AuditReportV2 = { schemaVersion: 2, executionId: record.executionId!, activityId: activity.activityId, kind, outcome: "passed", summary: "Every criterion is delivered.", completionPhases: [], needsYou: [], ...(kind === "test_audit" ? { changedImplementation: false } : {}) };
  const saveReport = (bytes = JSON.stringify(report)) => { writeFileSync(join(root, activity.reportPath), bytes); commit(sandbox, root, [activity.reportPath]); };
  const submit = () => submitAudit(context, { ...body(), reportPath: activity.reportPath });
  return { sandbox, root, origin, record, activity, context, body, report, saveReport, submit, store, stateDirectory, skillPath };
}
function commit(sandbox: Sandbox, root: string, paths: string[]) { git(sandbox, root, "add", "--", ...paths); git(sandbox, root, "commit", "--allow-empty", "-qm", "test(audit): fixture work"); git(sandbox, root, "push", "-qu", "origin", "develop"); }
function appendPhase(f: Awaited<ReturnType<typeof fixture>>, id: string, closed = false) {
  const file = `${directory}/phase-${id}-completion.md`;
  writeFileSync(join(f.root, file), `# Phase ${id}: Completion\n\n${closed ? "**Closed:** 2026-11-01\n\n" : ""}## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\n1.\n`);
  commit(f.sandbox, f.root, [file]);
}

describe("version-2 audit admission", () => {
  it("routes each natural end and records Kiln's own snapshot (AC-NEUTRAL-01, AC-NEUTRAL-03)", async () => {
    const delivery = await fixture(); delivery.saveReport();
    const passed = await delivery.submit();
    expect(passed.disposition).toBe("recorded"); expect(passed.nextAction).toBe("test_audit");
    expect(passed.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Audit result recorded", passed: true, facts: ["Outcome passed: Every criterion is delivered."] }), expect.objectContaining({ name: "Everything committed", passed: true }), expect.objectContaining({ name: "Pushed", passed: true })]));
    expect(delivery.activity.snapshots).toHaveLength(2); expect(passed.snapshotId).toBe(delivery.store.read<{ id: string }>(delivery.activity.snapshots[1]!).id);

    const tests = await fixture("test_audit"); tests.saveReport();
    expect((await tests.submit()).nextAction).toBe("final_delivery");

    const fixed = await fixture("test_audit"); fixed.report.changedImplementation = true;
    writeFileSync(join(fixed.root, "value.mjs"), "export const value = () => 42; // fixed\n"); commit(fixed.sandbox, fixed.root, ["value.mjs"]); fixed.saveReport();
    expect((await fixed.submit())).toMatchObject({ disposition: "recorded", nextAction: "delivery_audit" });
  });
  it("adds completion phases only when the plan appends exactly the named open phases (AC-NEUTRAL-04)", async () => {
    const f = await fixture(); appendPhase(f, "2");
    f.report.outcome = "completion_phases"; f.report.completionPhases = []; f.saveReport();
    expect((await f.submit()).refusal).toMatchObject({ code: "inconsistent_plan", reason: expect.stringContaining("exactly the phases this audit appended (2)") });
    f.report.completionPhases = ["2"]; f.saveReport();
    expect(await f.submit()).toMatchObject({ disposition: "recorded", nextAction: "implementation" });
  });
  it.each([
    ["a passing report with an open phase", (f: Awaited<ReturnType<typeof fixture>>) => { appendPhase(f, "2"); f.report.completionPhases = ["2"]; }, "A passing audit leaves no open phase"],
    ["a completion report that appends nothing", (f: Awaited<ReturnType<typeof fixture>>) => { f.report.outcome = "completion_phases"; }, "must append at least one phase"],
    ["an appended phase already closed", (f: Awaited<ReturnType<typeof fixture>>) => { appendPhase(f, "2", true); f.report.outcome = "completion_phases"; f.report.completionPhases = ["2"]; }, "already closed"],
    ["a rewritten original phase", (f: Awaited<ReturnType<typeof fixture>>) => { const path = join(f.root, directory, "phase-1-value.md"); writeFileSync(path, readFileSync(path, "utf8") + "\nAlso export a second value.\n"); commit(f.sandbox, f.root, [`${directory}/phase-1-value.md`]); }, "changed an original phase"],
    ["a reopened original phase", (f: Awaited<ReturnType<typeof fixture>>) => { const path = join(f.root, directory, "phase-1-value.md"); writeFileSync(path, readFileSync(path, "utf8").replace("**Closed:** 2026-10-24\n\n", "")); commit(f.sandbox, f.root, [`${directory}/phase-1-value.md`]); }, "changed an original phase"],
  ])("refuses %s without advancing (AC-NEUTRAL-04)", async (_name, arrange, reason) => {
    const f = await fixture(); arrange(f); f.saveReport();
    const result = await f.submit();
    expect(result).toMatchObject({ disposition: "unresolved", nextAction: "needs_you", refusal: { code: "inconsistent_plan", reason: expect.stringContaining(reason) } });
    expect(f.activity.acceptedResult).toBeUndefined();
  });
  it("needs a person when the audit says so, showing each problem and action (AC-NEUTRAL-03)", async () => {
    const f = await fixture(); f.report.outcome = "needs_you"; f.report.needsYou = [{ problem: "AC-PROOF-01 needs a staging login.", action: "Grant the staging role." }]; f.saveReport();
    const result = await f.submit();
    expect(result.refusal).toBeUndefined(); expect(result).toMatchObject({ disposition: "unresolved", nextAction: "needs_you" });
    expect(result.checks).toContainEqual({ name: "Audit work resolved", passed: false, facts: ["AC-PROOF-01 needs a staging login. Grant the staging role."] });
    expect(latestAuditRefusal(f.stateDirectory, f.activity)).toMatchObject({ code: "unresolved_checks", reason: expect.stringContaining("Grant the staging role.") });
  });
  it.each([
    ["a version-1 report", (r: Record<string, unknown>) => { r.schemaVersion = 1; }, "Write the version-2 report"],
    ["another activity", (r: Record<string, unknown>) => { r.activityId = "other"; }, "Report identity differs"],
    ["an unknown outcome", (r: Record<string, unknown>) => { r.outcome = "blocked"; }, "Unknown audit outcome"],
    ["an empty summary", (r: Record<string, unknown>) => { r.summary = " "; }, "non-empty summary"],
    ["needsYou on a passing report", (r: Record<string, unknown>) => { r.needsYou = [{ problem: "x", action: "y" }]; }, "Only a needs_you report lists needsYou"],
    ["needs_you without needsYou", (r: Record<string, unknown>) => { r.outcome = "needs_you"; }, "must say what a person must decide"],
    ["changedImplementation on a delivery audit", (r: Record<string, unknown>) => { r.changedImplementation = false; }, "Only a test audit reports changedImplementation"],
    ["a malformed needsYou entry", (r: Record<string, unknown>) => { r.outcome = "needs_you"; r.needsYou = [{ problem: "x" }]; }, "needsYou must be a list"],
  ])("refuses %s with a reason the session can act on (AC-NEUTRAL-01, AC-NEUTRAL-10)", async (_name, change, reason) => {
    const f = await fixture(); const raw = structuredClone(f.report) as unknown as Record<string, unknown>; change(raw); f.saveReport(JSON.stringify(raw));
    const result = await f.submit();
    expect(result.refusal).toMatchObject({ code: "invalid_report", reason: expect.stringContaining(reason) });
    expect(f.activity.acceptedResult).toBeUndefined();
  });
  it("requires a test audit to say whether it changed implementation", async () => {
    const f = await fixture("test_audit"); delete f.report.changedImplementation; f.saveReport();
    expect((await f.submit()).refusal?.reason).toContain("needs changedImplementation");
  });
  it("accepts a test continuation only when the work changed (AC-NEUTRAL-05)", async () => {
    const f = await fixture("test_audit"); f.report.outcome = "continue_test"; f.saveReport();
    expect((await f.submit()).refusal?.reason).toContain("Test continuation made no progress");
    writeFileSync(join(f.root, directory, "test-audit.md"), "# Test audit\nNext batch: AC-PROOF-01.\n"); commit(f.sandbox, f.root, [`${directory}/test-audit.md`]);
    expect(await f.submit()).toMatchObject({ disposition: "recorded", nextAction: "continue_test" });
    const delivery = await fixture(); delivery.report.outcome = "continue_test"; writeFileSync(join(delivery.root, "note.txt"), "x"); commit(delivery.sandbox, delivery.root, ["note.txt"]); delivery.saveReport();
    expect((await delivery.submit()).refusal?.reason).toContain("Only a test audit");
  });
  it("ignores a skill that changed while the audit ran (AC-NEUTRAL-08)", async () => {
    const f = await fixture(); writeFileSync(f.skillPath, "# delivery-audit\nRewritten this afternoon.\n"); f.saveReport();
    expect((await f.submit()).disposition).toBe("recorded");
  });
  it("tells a resumed audit why its last submission was refused until a result is recorded (AC-RUN-02)", async () => {
    const f = await fixture();
    expect(latestAuditRefusal(f.stateDirectory, f.activity)).toBeUndefined();
    f.saveReport(JSON.stringify({ ...f.report, summary: "" }));
    await f.submit();
    expect(auditStatus(f.context)).toMatchObject({ latestRefusal: { code: "invalid_report", reason: expect.stringContaining("summary") }, reportContract: expect.stringContaining("needsYou") });
    f.saveReport(); expect((await f.submit()).disposition).toBe("recorded");
    expect(auditStatus(f.context).latestRefusal).toBeUndefined();
  });
  it("survives a lost response, refuses a different report afterwards and preserves the accepted bytes", async () => {
    const f = await fixture(); f.saveReport();
    const result = await f.submit(); expect(result.disposition).toBe("recorded");
    writePrdRecord(f.stateDirectory, f.record); const recovered = readPrdRecord(f.stateDirectory)!;
    expect(await submitAudit({ ...f.context, record: recovered }, { ...f.body(), reportPath: f.activity.reportPath })).toEqual(result);
    f.report.summary = "Changed after acceptance."; f.saveReport();
    await expect(f.submit()).rejects.toMatchObject({ code: "result_conflict" });
    expect(f.store.read<{ reportBytes: string }>(f.activity.acceptedResult!).reportBytes).toBe(result.reportBytes);
  });
  it("keeps a valid audit report correctable until its development owner assessment passes (AC-NEUTRAL-07)", async () => {
    const f = await fixture(); f.saveReport();
    const owner = { kind: "audit" as const, activityId: f.activity.activityId };
    const delivery: DeliveryContext = { record: f.record, stateDirectory: f.stateDirectory, prdWorktree: f.root, prdDirectory: directory, git: f.context.git, env: f.sandbox.env, gh: "unused", owner, now: () => new Date().toISOString(), commands: async () => [] };
    const context = { ...f.context, developmentChecks: () => [ownerDeliveryCheck(delivery, owner)] };
    const first = await submitAudit(context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(first.disposition).toBe("unresolved");
    expect(first.checks).toContainEqual(expect.objectContaining({ name: "Required development delivery verified", passed: false }));
    const manifest = f.store.read<{ requirements: { criteria: { key: string }[] } }>(f.activity.snapshots[0]!).requirements;
    await recordAssessment(delivery, { owner, ...ownerDocuments(delivery, owner), required: false, criteria: manifest.criteria.map(one => one.key), reason: "No PRD criterion requires development delivery.", checkpoints: [] });
    expect((await submitAudit(context, { ...f.body(), reportPath: f.activity.reportPath })).disposition).toBe("recorded");
  });
  it.skipIf(process.platform === "win32")("retains an unavailable report read as a retryable source error", async () => {
    const f = await fixture(); f.saveReport();
    const path = join(f.root, f.activity.reportPath); chmodSync(path, 0);
    try { expect((await f.submit()).refusal).toMatchObject({ code: "evidence_unavailable", status: 503 }); }
    finally { chmodSync(path, 0o644); }
    expect((await f.submit()).disposition).toBe("recorded");
  });
  it("refuses a missing report, then accepts the corrected one in the same activity", async () => {
    const f = await fixture();
    expect((await f.submit()).refusal?.code).toBe("missing_evidence");
    f.saveReport(); expect((await f.submit()).disposition).toBe("recorded"); expect(f.activity.attempts).toHaveLength(2);
  });
  it("blocks dirty, unpushed and companion work, stale revisions and path escapes (AC-NEUTRAL-07)", async () => {
    const f = await fixture("delivery_audit", { companion: true }); f.saveReport();
    writeFileSync(join(f.root, "untracked.txt"), "unknown implementation");
    expect((await f.submit()).checks).toContainEqual(expect.objectContaining({ name: "Everything committed", passed: false }));
    git(f.sandbox, f.root, "add", "untracked.txt"); git(f.sandbox, f.root, "commit", "-qm", "local only");
    expect((await f.submit()).checks).toContainEqual(expect.objectContaining({ name: "Pushed", passed: false }));
    git(f.sandbox, f.root, "push", "-q", "origin", "develop");
    const companion = f.record.repositories[1]!.worktreePath; writeFileSync(join(companion, "companion.mjs"), "export const value = 43;\n");
    expect((await f.submit()).checks).toContainEqual(expect.objectContaining({ name: "Everything committed", passed: false, facts: expect.arrayContaining(["companion: uncommitted or untracked work remains."]) }));
    await expect(submitAudit(f.context, { ...f.body(), revision: -1, reportPath: f.activity.reportPath })).rejects.toMatchObject({ code: "stale_revision" });
    await expect(submitAudit(f.context, { ...f.body(), reportPath: "../outside.json" })).rejects.toMatchObject({ code: "outside_execution" });
    if (process.platform !== "win32") { symlinkSync(f.skillPath, join(f.root, "escape.json")); await expect(captureSnapshot({ ...f.context, activity: f.activity, now: new Date().toISOString() })).rejects.toMatchObject({ code: "outside_execution" }); }
  });
  it("refuses a retired snapshot request without changing state (AC-NEUTRAL-10)", async () => {
    const f = await fixture(); const before = JSON.stringify(f.record.completionAudits);
    expect(() => issueSnapshot()).toThrow(expect.objectContaining({ code: "malformed_request", message: expect.stringContaining("retired") }));
    expect(JSON.stringify(f.record.completionAudits)).toBe(before);
  });
  it("keeps an accepted audit current through record-only edits and invalidates it on material change", async () => {
    const f = await fixture(); f.saveReport(); expect((await f.submit()).disposition).toBe("recorded");
    const phase = `${directory}/phase-1-value.md`; writeFileSync(join(f.root, phase), readFileSync(join(f.root, phase), "utf8").replace("2026-10-24", "2026-10-25")); commit(f.sandbox, f.root, [phase]);
    writeFileSync(join(f.root, `${directory}/test-audit.md`), "# Test audit\nAny record the skill keeps\n"); commit(f.sandbox, f.root, [`${directory}/test-audit.md`]);
    expect(await auditCurrentness(f.context, f.activity)).toEqual({ deliveryCurrent: true, testsCurrent: true });
    writeFileSync(join(f.root, "value.test.mjs"), "// changed test\n"); commit(f.sandbox, f.root, ["value.test.mjs"]);
    expect(await auditCurrentness(f.context, f.activity)).toEqual({ deliveryCurrent: false, testsCurrent: false });
  });
  it.each([false, true])("trusts a test audit's test-only changes only when nothing changed before it started (edited between audits: %s) (AC-NEUTRAL-06)", async editedBetween => {
    const f = await fixture(); f.saveReport(); expect((await f.submit()).nextAction).toBe("test_audit");
    f.record.phases[`audit-${f.activity.activityId}`] = { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: new Date().toISOString() };
    if (editedBetween) { writeFileSync(join(f.root, "value.mjs"), "export const value = () => 42; // a person's edit\n"); commit(f.sandbox, f.root, ["value.mjs"]); }
    const tests: AuditActivity = { ...f.activity, activityId: randomUUID(), sequence: 2, kind: "test_audit", snapshots: [], attempts: [] }; delete tests.acceptedResult;
    tests.reportPath = `${directory}/kiln-audit-${tests.activityId}.json`; f.record.completionAudits!.activities.push(tests);
    tests.snapshots.push(f.store.put(await captureSnapshot({ ...f.context, activity: tests, now: new Date().toISOString() })));
    writeFileSync(join(f.root, "value.test.mjs"), "// a test the audit strengthened\n");
    const report: AuditReportV2 = { ...f.report, activityId: tests.activityId, kind: "test_audit", changedImplementation: false };
    writeFileSync(join(f.root, tests.reportPath), JSON.stringify(report)); commit(f.sandbox, f.root, ["value.test.mjs", tests.reportPath]);
    expect((await submitAudit(f.context, { ...f.body(), activityId: tests.activityId, reportPath: tests.reportPath })).disposition).toBe("recorded");
    f.record.phases[`audit-${tests.activityId}`] = { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: new Date().toISOString() };
    expect(await auditNext(f.context)).toBe(editedBetween ? "delivery_audit" : "final_delivery");
  });
  it("keeps a version-1 result accepted before the upgrade as a valid gate (AC-NEUTRAL-10)", async () => {
    const f = await fixture();
    const accept = async (activity: AuditActivity, kind: "delivery_audit" | "test_audit") => {
      const snapshot = await captureSnapshot({ ...f.context, activity, now: new Date().toISOString() }); activity.snapshots.push(f.store.put(snapshot));
      const report = { schemaVersion: 1, executionId: f.record.executionId, activityId: activity.activityId, kind, outcome: "passed", criteria: [], completionPhases: [], pendingHumanActions: [], blockers: [] };
      writeFileSync(join(f.root, activity.reportPath), JSON.stringify(report)); commit(f.sandbox, f.root, [activity.reportPath]);
      const bytes = readFileSync(join(f.root, activity.reportPath), "utf8");
      activity.acceptedResult = f.store.put({ id: randomUUID(), activityId: activity.activityId, reportDigest: hashBytes(bytes), reportBytes: bytes, snapshotId: snapshot.id, at: new Date().toISOString(), revision: 1, disposition: "recorded", checks: [], nextAction: kind === "delivery_audit" ? "test_audit" : "final_delivery" });
      f.record.phases[`audit-${activity.activityId}`] = { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: new Date().toISOString() };
    };
    await accept(f.activity, "delivery_audit");
    const tests: AuditActivity = { ...f.activity, activityId: randomUUID(), sequence: 2, kind: "test_audit", snapshots: [], attempts: [] }; delete tests.acceptedResult;
    tests.reportPath = `${directory}/kiln-audit-${tests.activityId}.json`; f.record.completionAudits!.activities.push(tests);
    await accept(tests, "test_audit");
    expect(await auditNext(f.context)).toBe("final_delivery");
    // A version-1 test result keeps the earlier gate: a later change still reaches the delivery audit.
    writeFileSync(join(f.root, "value.mjs"), "export const value = () => 43;\n"); commit(f.sandbox, f.root, ["value.mjs"]);
    expect(await auditNext(f.context)).toBe("delivery_audit");
  });
  it("refuses a claimed implementation change that changed nothing outside its records (AC-NEUTRAL-06)", async () => {
    const f = await fixture("test_audit"); f.report.changedImplementation = true;
    writeFileSync(join(f.root, directory, "test-audit.md"), "# Test audit\n"); commit(f.sandbox, f.root, [`${directory}/test-audit.md`]); f.saveReport();
    expect((await f.submit()).refusal?.reason).toContain("changedImplementation is true, but nothing outside Markdown");
  });
  it("titles every refusal with the unmet condition once, its reason beneath (AC-NEUTRAL-03)", async () => {
    const f = await fixture();
    const missing = await f.submit();
    // One judgment, one waivable item naming the one report and its refusal (AC-WAIVE-11).
    const reason = `No audit report at ${f.activity.reportPath} yet. The audit session writes, commits and pushes it when the audit ends.`;
    expect(missing.checks).toEqual([{ name: "Audit result recorded", passed: false, facts: [reason], items: [{ kind: "other", subject: f.activity.reportPath, text: reason, against: "" }] }]);
    f.saveReport();
    // A refusal raised after the report itself validated replaces the passing row rather than adding a second one.
    const late = await submitAudit({ ...f.context, developmentChecks: () => { throw new AuditRefusal("evidence_unavailable", "Development ledger unreadable."); } }, { ...f.body(), reportPath: f.activity.reportPath });
    expect(late.checks.filter(check => check.name === "Audit result recorded")).toEqual([{ name: "Audit result recorded", passed: false, facts: ["Development ledger unreadable."], items: [{ kind: "other", subject: f.activity.reportPath, text: "Development ledger unreadable.", against: "" }] }]);
  });
  it("uses real authenticated HTTP and the CLI, with rollback when state persistence fails", async () => {
    const f = await fixture(); f.saveReport(); writePrdRecord(f.stateDirectory, f.record);
    const tools = { git: "git", ...installStandIns(join(f.sandbox.root, "bin")) };
    const engine = new Engine({ paths: { mainCheckoutPath: f.root, repositoryName: "proof", folderName: "proof", prdDirectoryFromRoot: directory, featureName: "Audit proof" }, tools, env: f.sandbox.env, stateDirectory: f.stateDirectory, record: f.record });
    await engine.agents.refresh();
    let server: LocalServer | undefined; let release: (() => void) | undefined;
    try {
      const hosted = await startFixtureController({ engine, folderName: "proof", featureName: "Audit proof", token: f.record.token });
      server = hosted.server; release = hosted.release;
      const address = new URL(server.address).origin;
      expect((await fetch(`${address}/api/audit`)).status).toBe(403);
      expect((await fetch(`${address}/api/audit/result`, { method: "POST", headers: { [TOKEN_HEADER]: f.record.token, Origin: "http://evil.invalid" }, body: "{}" })).status).toBe(403);
      const retired = await fetch(`${address}/api/audit/snapshot`, { method: "POST", headers: { [TOKEN_HEADER]: f.record.token, Origin: address, "Content-Type": "application/json" }, body: JSON.stringify(f.body()) });
      expect(retired.status).toBe(400); expect(await retired.json()).toMatchObject({ code: "malformed_request" });
      // AC-ACT-01: the shipped example is a real request contract once its status-sourced values are bound.
      const example = commandContracts.find(c => c.path.join(" ") === "audit submit")!.examples[0]!;
      const request = structuredClone(Object.values(example.files!)[0]) as Record<string, unknown>;
      Object.assign(request, f.body(), { reportPath: f.activity.reportPath });
      const requestFile = join(f.sandbox.root, "request.json"); writeFileSync(requestFile, JSON.stringify(request));
      let out = ""; let err = "";
      expect(await runAudit(["submit", requestFile], { cwd: f.root, env: f.sandbox.env, stdout: { write: s => out += s }, stderr: { write: s => err += s } })).toBe(0);
      expect(err).toBe(""); expect(JSON.parse(out).disposition).toBe("recorded");
      const before = JSON.stringify(f.record.completionAudits);
      const recordPath = join(f.stateDirectory, "prd.json"); const backupPath = join(f.stateDirectory, "prd-backup.json");
      renameSync(recordPath, backupPath); mkdirSync(recordPath);
      try { await expect(engine.auditCommand("status")).rejects.toThrow(); expect(JSON.stringify(f.record.completionAudits)).toBe(before); }
      finally { rmdirSync(recordPath); renameSync(backupPath, recordPath); }
    } finally { await server?.close(); release?.(); engine.close(); }
  });
});

describe("audit source and serialization contracts", () => {
  it("preserves exact pre-migration bytes and reuses the execution UUID across repeated reads", async () => {
    const f = await fixture(); const old = structuredClone(f.record) as unknown as Record<string, unknown>; old.schemaVersion = 5; delete old.executionId; delete old.completionAudits; delete old.startedAt;
    const path = join(f.stateDirectory, "prd.json"); const bytes = JSON.stringify(old, null, 3) + "\n"; writeFileSync(path, bytes);
    const first = readPrdRecord(f.stateDirectory)!; const second = readPrdRecord(f.stateDirectory)!;
    expect(first.executionId).toMatch(/^[0-9a-f-]{36}$/); expect(second.executionId).toBe(first.executionId); expect(first.completionAudits?.policy).toBe("required");
    expect(readFileSync(path, "utf8")).toBe(bytes);
    const migration = JSON.parse(readFileSync(join(f.stateDirectory, "audit-migration.json"), "utf8")) as { original: string }; expect(f.store.bytes(migration.original)).toBe(bytes);
  });
  it("rejects escaped duplicate keys and oversized reports", () => {
    expect(() => strictJson('{"key":1,"\\u006bey":2}')).toThrow("Duplicate JSON key");
    expect(() => strictJson('"12345"', 3)).toThrow("3 bytes");
    expect(strictJson(String.raw`{"a":[true,false,null,2e3,{"x":"escaped\"text"}]}`)).toMatchObject({ a: [true, false, null, 2000, { x: 'escaped"text' }] });
  });
  it("keeps nested requirements, supports unlabeled titles, and refuses duplicate identities", () => {
    const source = requirementManifest("r", "p.md", "blob", prd); expect(source.criteria[0]!.content).toContain("exported function");
    expect(requirementManifest("r", "p.md", "blob", prd.replace("AC-PROOF-01 — ", "")).criteria[0]!.label).toBe("Return the value.");
    expect(() => requirementManifest("r", "p.md", "blob", prd + "- [ ] **AC-PROOF-01 — Duplicate.**\n")).toThrow("Duplicate criterion");
    expect(phaseScope("# Phase\n**Closed:** today\n## Body\n**Closed:** meaningful\n")).toContain("**Closed:** meaningful");
  });
});
