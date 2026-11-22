// Real Git, filesystem, HTTP and CLI: Kiln admits the version-2 report on its own facts
// (method-neutral audits, AC-NEUTRAL-01..10), never on how the audit was conducted.
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, renameSync, rmdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createBareOrigin, createRepository, createSandbox, commitFiles, git, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { newPrdRecord } from "../state/new-record.js";
import { appendLoop, startedLedger } from "../state/audit-loops.js";
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
import { personItems } from "./person-items.js";

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
    const f = await fixture(); f.report.outcome = "needs_you"; f.report.needsYou = [{ kind: "blocker", problem: "AC-PROOF-01 needs a staging login.", action: "Grant the staging role.", waitsOn: "The rest of the audit." }]; f.saveReport();
    const result = await f.submit();
    expect(result.refusal).toBeUndefined(); expect(result).toMatchObject({ disposition: "unresolved", nextAction: "needs_you" });
    expect(result.checks).toContainEqual({ name: "Audit work resolved", passed: false, facts: ["AC-PROOF-01 needs a staging login. Grant the staging role."] });
    expect(latestAuditRefusal(f.stateDirectory, f.activity)).toMatchObject({ code: "unresolved_checks", reason: expect.stringContaining("Grant the staging role.") });
  });
  it("builds added phases while a person settles what the audit also listed (AC-NEUTRAL-03)", async () => {
    const f = await fixture(); appendPhase(f, "2");
    f.report.outcome = "completion_phases"; f.report.completionPhases = ["2"]; f.report.needsYou = [{ kind: "other", problem: "AC-RET-04 names a file the design kept.", action: "Amend AC-RET-04 or ask for the rename." }]; f.saveReport();
    const result = await f.submit();
    expect(result).toMatchObject({ disposition: "recorded", nextAction: "implementation" });
    expect(result.checks.map(check => check.name)).not.toContain("Audit work resolved");
    expect(f.activity.acceptedResult).toBeDefined();
  });
  it("stops at Needs you when phases the audit added depend on the person's answer (AC-NEUTRAL-03)", async () => {
    const f = await fixture(); appendPhase(f, "2");
    f.report.outcome = "needs_you"; f.report.completionPhases = ["2"]; f.report.needsYou = [{ kind: "business_question", problem: "Phase 2 depends on the refund rate.", action: "Choose the rate.", waitsOn: "Phase 2." }]; f.saveReport();
    const result = await f.submit();
    expect(result.refusal).toBeUndefined();
    expect(result).toMatchObject({ disposition: "unresolved", nextAction: "needs_you" });
    expect(result.checks).toContainEqual({ name: "Audit work resolved", passed: false, facts: ["Phase 2 depends on the refund rate. Choose the rate."] });
  });
  describe("items an audit left for a person (AC-NEUTRAL-03)", () => {
    const item = { kind: "other" as const, problem: "AC-RET-04 names a file the design kept.", action: "Amend AC-RET-04 or ask for the rename." };
    /** An accepted round-1 delivery audit that added phase 2 and listed one item, then phase 2 closed and round 2 allocated. */
    async function carried() {
      const f = await fixture(); appendPhase(f, "2");
      // Each audit is a loop the ledger counted, so its items are listed and settled by "Delivery audit loop n" (Kiln After Delivery AC-AUDIT-01).
      f.record.auditLoops = startedLedger(new Date().toISOString());
      appendLoop(f.record.auditLoops, { kind: "delivery", startedAt: new Date().toISOString(), activityKey: `audit-${f.activity.activityId}` });
      f.report.outcome = "completion_phases"; f.report.completionPhases = ["2"]; f.report.needsYou = [item]; f.saveReport();
      expect(await f.submit()).toMatchObject({ disposition: "recorded", nextAction: "implementation" });
      f.record.phases[`audit-${f.activity.activityId}`] = { sessionIds: [], finishedByPerson: false, repositories: {}, doneAt: new Date().toISOString() };
      const path = join(f.root, directory, "phase-2-completion.md"); writeFileSync(path, readFileSync(path, "utf8").replace("# Phase 2: Completion\n\n", "# Phase 2: Completion\n\n**Closed:** 2026-11-02\n\n")); commit(f.sandbox, f.root, [`${directory}/phase-2-completion.md`]);
      const allocate = async (sequence: number, kind: AuditActivity["kind"] = f.activity.kind) => {
        const next: AuditActivity = { ...f.activity, kind, activityId: randomUUID(), sequence, round: sequence, snapshots: [], attempts: [] }; delete next.acceptedResult;
        next.reportPath = `${directory}/kiln-audit-${next.activityId}.json`; f.record.completionAudits!.activities.push(next);
        appendLoop(f.record.auditLoops!, { kind: kind === "delivery_audit" ? "delivery" : "test", startedAt: new Date().toISOString(), activityKey: `audit-${next.activityId}` });
        next.snapshots.push(f.store.put(await captureSnapshot({ ...f.context, activity: next, now: new Date().toISOString() })));
        const report = (change: Partial<AuditReportV2>): AuditReportV2 => ({ ...f.report, kind, activityId: next.activityId, outcome: "passed", completionPhases: [], needsYou: [], ...(kind === "test_audit" ? { changedImplementation: false } : {}), ...change });
        const submit = async (body: AuditReportV2) => { writeFileSync(join(f.root, next.reportPath), JSON.stringify(body)); commit(f.sandbox, f.root, [next.reportPath]); return submitAudit(f.context, { ...f.body(), activityId: next.activityId, reportPath: next.reportPath }); };
        return { activity: next, report, submit };
      };
      return { f, allocate };
    }
    it("refuses a later report that leaves an outstanding item out, naming it, and an unknown id", async () => {
      const { f, allocate } = await carried(); const round2 = await allocate(2);
      expect(personItems(f.stateDirectory, f.record).outstanding).toMatchObject([{ id: "item-1", ...item, listedBy: "Delivery audit loop 1" }]);
      expect((await round2.submit(round2.report({}))).refusal).toMatchObject({ code: "invalid_report", reason: expect.stringContaining(`missing item-1 (${item.problem})`) });
      expect((await round2.submit(round2.report({ settled: [{ id: "item-9", how: "x" }] }))).refusal).toMatchObject({ code: "invalid_report", reason: expect.stringContaining("No outstanding item item-9") });
      expect((await round2.submit(round2.report({ needsYou: [{ id: "item-1", ...item }], settled: [{ id: "item-1", how: "x" }] }))).refusal).toMatchObject({ reason: expect.stringContaining("repeated: item-1") });
      expect(round2.activity.acceptedResult).toBeUndefined();
    });
    it("keeps an item listed again outstanding, and records how a later audit settled it", async () => {
      const { f, allocate } = await carried(); const round2 = await allocate(2);
      // Relisted as a blocker, the item now holds the work: needs_you, with what waits on it (AC-ITEM-01).
      const relisted = await round2.submit(round2.report({ outcome: "needs_you", needsYou: [{ id: "item-1", ...item, kind: "blocker", waitsOn: "Phase 3.", action: "Decide before Phase 3." }] }));
      expect(relisted.refusal).toBeUndefined(); expect(relisted).toMatchObject({ disposition: "unresolved", nextAction: "needs_you" });
      const settled = await round2.submit(round2.report({ settled: [{ id: "item-1", how: "A person amended AC-RET-04 to keep the name." }] }));
      expect(settled).toMatchObject({ disposition: "recorded", nextAction: "test_audit" });
      const ledger = personItems(f.stateDirectory, f.record);
      expect(ledger.outstanding).toEqual([]);
      expect(ledger.settled).toMatchObject([{ id: "item-1", listedBy: "Delivery audit loop 1", settledBy: "Delivery audit loop 2", how: "A person amended AC-RET-04 to keep the name." }]);
    });
    it("lets a delivery audit that found nothing to build pass with an item relisted by id alone and a new item, keeping the kind (AC-ITEM-02)", async () => {
      const { f, allocate } = await carried(); const round2 = await allocate(2);
      // A relisting needs only id, problem and action; a passing report may list new items (Kiln Deliver When Audit Loops Run Out, "Report contract").
      const carriedOn = await round2.submit(round2.report({ needsYou: [{ id: "item-1", problem: item.problem, action: item.action }, { kind: "test", problem: "AC-PROOF-01 has no test.", action: "Add one.", criterion: "AC-PROOF-01" }] }));
      expect(carriedOn.refusal).toBeUndefined(); expect(carriedOn).toMatchObject({ disposition: "recorded", nextAction: "test_audit" });
      expect(personItems(f.stateDirectory, f.record).outstanding).toMatchObject([{ id: "item-1", kind: "other", listedBy: "Delivery audit loop 1" }, { id: "item-2", kind: "test", criterion: "AC-PROOF-01", listedBy: "Delivery audit loop 2" }]);
    });
    it("admits a passing test audit that changed only tests with an item open, leading to final delivery (AC-ITEM-03)", async () => {
      const { allocate } = await carried(); const tests = await allocate(2, "test_audit");
      const result = await tests.submit(tests.report({ needsYou: [{ id: "item-1", ...item }] }));
      expect(result.refusal).toBeUndefined(); expect(result).toMatchObject({ disposition: "recorded", nextAction: "final_delivery" });
    });
    it("lets a passing test audit that changed implementation carry an open item to the fresh delivery audit", async () => {
      const { f, allocate } = await carried(); const tests = await allocate(2, "test_audit");
      writeFileSync(join(f.root, "src-change.ts"), "export const changed = true;\n"); commit(f.sandbox, f.root, ["src-change.ts"]);
      const result = await tests.submit(tests.report({ changedImplementation: true, needsYou: [{ id: "item-1", ...item }] }));
      expect(result.refusal).toBeUndefined(); expect(result).toMatchObject({ disposition: "recorded", nextAction: "delivery_audit" });
    });
    it("reads the items and settlements of an audit marked complete with a valid report, waived by it, except one Kiln 1.3.0 marked (AC-ITEM-01, Upgrade)", async () => {
      const { f, allocate } = await carried(); const round2 = await allocate(2);
      const blocker = { kind: "blocker" as const, problem: "The key is missing.", action: "Add it.", waitsOn: "Delivery." };
      const bytes = JSON.stringify(round2.report({ outcome: "needs_you", needsYou: [blocker], settled: [{ id: "item-1", how: "Renamed." }] }));
      round2.activity.waivedResult = f.store.put({ kind: "audit_waiver", activityId: round2.activity.activityId, waiverId: "waiver-2", report: "valid", reportBytes: bytes, reportDigest: hashBytes(bytes), countedOutcome: "passed", snapshotRef: round2.activity.snapshots[0] });
      const read = personItems(f.stateDirectory, f.record);
      expect(read.settled).toMatchObject([{ id: "item-1", settledBy: "Delivery audit loop 2", how: "Renamed." }]);
      expect(read.outstanding).toMatchObject([{ id: "item-2", kind: "blocker", waitsOn: "Delivery.", auditWaiverId: "waiver-2", auditWaivedBy: "Delivery audit loop 2" }]);
      // Kiln 1.3.0 read nothing from a waiver: an upgraded audit keeps that, so later ids are unchanged.
      round2.activity.itemsUnread = true;
      expect(personItems(f.stateDirectory, f.record)).toMatchObject({ outstanding: [{ id: "item-1" }], settled: [] });
      // An upgraded audit accepted before it was marked complete is read from its accepted report, as 1.3.0 did, and its waiver covers nothing.
      f.activity.itemsUnread = true; f.activity.waivedResult = round2.activity.waivedResult;
      const upgraded = personItems(f.stateDirectory, f.record).outstanding;
      expect(upgraded).toMatchObject([{ id: "item-1", kind: "other" }]); expect(upgraded[0]!.auditWaiverId).toBeUndefined();
    });
    it("refuses needs_you whose only holding item is waived, admits a new blocker beside it, and a passing relisting of a waived critical finding (AC-ITEM-01)", async () => {
      const { f, allocate } = await carried(); const round2 = await allocate(2);
      // The item, relisted as a blocker earlier, was waived at the hold stop: matched by its ledger id.
      f.record.waivers = [{ waiverId: "hold", at: new Date().toISOString(), activityKey: "pr", activityKind: "final_delivery", effect: "continued", source: { via: "browser", account: "alex" }, operationId: "op", checkRun: { id: "r", at: new Date().toISOString() }, items: [{ check: "Nothing holds the run", kind: "other", subject: "item-1", text: "x", against: "item-1" }], checks: [] }];
      const relisted = { id: "item-1", ...item, kind: "blocker" as const, waitsOn: "Delivery." };
      expect((await round2.submit(round2.report({ outcome: "needs_you", needsYou: [relisted] }))).refusal).toMatchObject({ code: "invalid_report", reason: expect.stringContaining("A needs_you report needs an item that stops or holds the run and is not marked waived") });
      expect((await round2.submit(round2.report({ outcome: "passed", needsYou: [{ ...relisted, kind: "critical_next_step" }] }))).refusal).toBeUndefined();
    });
    it("admits needs_you for a new blocker listed beside a waived one (AC-ITEM-01)", async () => {
      const { f, allocate } = await carried(); const round2 = await allocate(2);
      f.record.waivers = [{ waiverId: "hold", at: new Date().toISOString(), activityKey: "pr", activityKind: "final_delivery", effect: "continued", source: { via: "browser", account: "alex" }, operationId: "op", checkRun: { id: "r", at: new Date().toISOString() }, items: [{ check: "Nothing holds the run", kind: "other", subject: "item-1", text: "x", against: "item-1" }], checks: [] }];
      const result = await round2.submit(round2.report({ outcome: "needs_you", needsYou: [{ id: "item-1", ...item, kind: "blocker", waitsOn: "Delivery." }, { kind: "blocker", problem: "A new key is missing.", action: "Add it.", waitsOn: "Delivery." }] }));
      expect(result.refusal).toBeUndefined(); expect(result).toMatchObject({ nextAction: "needs_you" });
    });
    it("carries items past an audit marked complete without an accepted report", async () => {
      const { f, allocate } = await carried(); const round2 = await allocate(2);
      round2.activity.waivedResult = f.store.put({ kind: "audit_waiver", activityId: round2.activity.activityId });
      expect(personItems(f.stateDirectory, f.record).outstanding.map(open => open.id)).toEqual(["item-1"]);
      const round3 = await allocate(3);
      expect((await round3.submit(round3.report({}))).refusal).toMatchObject({ reason: expect.stringContaining("missing item-1") });
      expect(await round3.submit(round3.report({ settled: [{ id: "item-1", how: "Renamed." }] }))).toMatchObject({ disposition: "recorded" });
    });
  });
  it.each([
    ["a version-1 report", (r: Record<string, unknown>) => { r.schemaVersion = 1; }, "Write the version-2 report"],
    ["another activity", (r: Record<string, unknown>) => { r.activityId = "other"; }, "Report identity differs"],
    ["an unknown outcome", (r: Record<string, unknown>) => { r.outcome = "blocked"; }, "Unknown audit outcome"],
    ["an empty summary", (r: Record<string, unknown>) => { r.summary = " "; }, "non-empty summary"],
    // Every item says why it is there, and only an item that stops or holds the run stops it (Kiln Deliver When Audit Loops Run Out AC-ITEM-01, AC-ITEM-02).
    ["a needsYou entry with no kind", (r: Record<string, unknown>) => { r.needsYou = [{ problem: "The key is missing.", action: "Add it." }]; }, "needsYou entry \"The key is missing.\" gives no kind"],
    ["an unknown kind", (r: Record<string, unknown>) => { r.needsYou = [{ kind: "fyi", problem: "x", action: "y" }]; }, "kind one of critical_next_step, critical, blocker, business_question, test, other"],
    ["a blocker with no waitsOn", (r: Record<string, unknown>) => { r.outcome = "needs_you"; r.needsYou = [{ kind: "blocker", problem: "The key is missing.", action: "Add it." }]; }, "is a blocker item, so it needs waitsOn"],
    ["a critical finding the next step would worsen with no waitsOn", (r: Record<string, unknown>) => { r.outcome = "needs_you"; r.needsYou = [{ kind: "critical_next_step", problem: "The key leaks.", action: "Rotate it." }]; }, "is a critical_next_step item, so it needs waitsOn"],
    ["a blocker with an empty problem", (r: Record<string, unknown>) => { r.outcome = "needs_you"; r.needsYou = [{ kind: "blocker", problem: " ", action: "Add it.", waitsOn: "The pull request." }]; }, "needsYou must be a list of {kind, problem, action}"],
    ["a business question with no waitsOn", (r: Record<string, unknown>) => { r.needsYou = [{ kind: "business_question", problem: "Which rate?", action: "Choose." }]; }, "is a business_question item, so it needs waitsOn"],
    ["a critical finding the next step would worsen on a passing report", (r: Record<string, unknown>) => { r.needsYou = [{ kind: "critical_next_step", problem: "The key leaks.", action: "Rotate it.", waitsOn: "The pull request." }]; }, "so the outcome is needs_you"],
    ["needs_you whose items all let the work go on", (r: Record<string, unknown>) => { r.outcome = "needs_you"; r.needsYou = [{ kind: "other", problem: "Logging changed.", action: "Record it." }, { kind: "critical", problem: "Old logs hold emails.", action: "Delete them." }]; }, "A needs_you report needs an item that stops or holds the run"],
    ["needs_you without needsYou", (r: Record<string, unknown>) => { r.outcome = "needs_you"; }, "must say what a person must decide"],
    ["changedImplementation on a delivery audit", (r: Record<string, unknown>) => { r.changedImplementation = false; }, "Only a test audit reports changedImplementation"],
    ["a malformed needsYou entry", (r: Record<string, unknown>) => { r.outcome = "needs_you"; r.needsYou = [{ problem: "x" }]; }, "needsYou must be a list"],
  ])("refuses %s with a reason the session can act on (AC-NEUTRAL-01, AC-NEUTRAL-10)", async (_name, change, reason) => {
    const f = await fixture(); const raw = structuredClone(f.report) as unknown as Record<string, unknown>; change(raw); f.saveReport(JSON.stringify(raw));
    const result = await f.submit();
    expect(result.refusal).toMatchObject({ code: "invalid_report", reason: expect.stringContaining(reason) });
    expect(f.activity.acceptedResult).toBeUndefined();
  });
  it("ends the test work when a session of test fixes raised none of its rows (Kiln Deliver When Audit Loops Run Out AC-LAST-01)", async () => {
    const f = await fixture("test_audit"); f.activity.continuationIndex = 2;
    writeFileSync(join(f.root, "value.test.mjs"), `${readFileSync(join(f.root, "value.test.mjs"), "utf8")}// stronger\n`); commit(f.sandbox, f.root, ["value.test.mjs"]);
    f.report.outcome = "continue_test"; f.saveReport();
    expect((await f.submit()).refusal).toMatchObject({ code: "invalid_report", reason: "A session of test fixes that raised none of the rows it took ends the test work: report passed and list each row left as a test item. Otherwise list the criteria whose rows it raised in raised." });
    f.report.raised = []; f.saveReport();
    expect((await f.submit()).refusal).toMatchObject({ code: "invalid_report", reason: expect.stringContaining("raised none of the rows it took") });
    f.report.raised = ["AC-PROOF-01"]; f.saveReport();
    expect(await f.submit()).toMatchObject({ disposition: "recorded", nextAction: "continue_test" });
  });
  it("lets a session of test fixes that raised none of its rows report passed with each row left as a test item (AC-LAST-01, AC-LAST-05)", async () => {
    const f = await fixture("test_audit"); f.activity.continuationIndex = 2;
    f.report.needsYou = [{ kind: "test", problem: "AC-PROOF-01 is still Weak.", action: "Strengthen its test.", criterion: "AC-PROOF-01" }]; f.saveReport();
    expect(await f.submit()).toMatchObject({ disposition: "recorded", nextAction: "final_delivery" });
    expect(personItems(f.stateDirectory, f.record).outstanding).toMatchObject([{ id: "item-1", kind: "test", criterion: "AC-PROOF-01" }]);
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
