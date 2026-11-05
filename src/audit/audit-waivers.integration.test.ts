// Real Git and filesystem: an audit marked complete counts as its report allows (completion
// waivers AC-WAIVE-11, AC-WAIVE-12), is measured for currentness from its waiver snapshot, and
// a leaf closed or skipped by waiver counts as closed for audit routing (AC-NEUTRAL-04).
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createBareOrigin, createRepository, createSandbox, commitFiles, git, type Sandbox } from "../test-support/git-repositories.js";
import { newPrdRecord } from "../state/new-record.js";
import { prdStateDirectory, stateRoot } from "../state/state-files.js";
import type { Waiver } from "../engine/waivers.js";
import { auditCurrentness, repositoryChecks, submitAudit, type AdmissionContext } from "./admission.js";
import { AuditStore, hashBytes } from "./storage.js";
import { captureSnapshot } from "./snapshots.js";
import type { AuditActivity, AuditKind, AuditReportV2 } from "./contracts.js";
import { auditKey, auditNext, classifyAuditReport, continuablePredecessor, effectiveAudit, phasesBeyondInitial, waiveAudit, waiveUnstartedAudit } from "./workflow.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(f => f())); });
const directory = "docs/prds/proof";
const prd = "# PRD: Audit proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return the value.** The function returns 42.\n";
const phaseOne = (closed: boolean) => `# Phase 1: Return value\n\n${closed ? "**Closed:** 2026-10-24\n\n" : ""}## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n`;

function commit(sandbox: Sandbox, root: string, paths: string[], push = true) {
  git(sandbox, root, "add", "--", ...paths); git(sandbox, root, "commit", "--allow-empty", "-qm", "test(audit): fixture work");
  if (push) git(sandbox, root, "push", "-qu", "origin", "develop");
}

async function fixture(options: { openPhase?: boolean; companion?: boolean } = {}) {
  const sandbox = createSandbox(); cleanups.push(() => sandbox.cleanup());
  const origin = createBareOrigin(sandbox, "proof"); const root = createRepository(sandbox, "proof", origin);
  commitFiles(sandbox, root, directory, { "proof-prd.md": prd, "phase-1-value.md": phaseOne(!options.openPhase) });
  writeFileSync(join(root, "value.mjs"), "export const value = () => 42;\n"); commit(sandbox, root, ["value.mjs"]);
  const record = newPrdRecord({ mainCheckoutPath: root, repositoryName: "proof", github: "example/proof", prdDirectoryFromRoot: directory, featureName: "Audit proof", settings: { workspaceFolder: sandbox.root, worktreePath: root, featureBranch: "develop", baseBranch: "develop", bases: {}, model: "sonnet", effort: "low", keepAwake: false, resumeAfterUsageLimit: false } });
  const started = new Date(Date.now() - 60_000).toISOString(); record.startedAt = started; record.setupCompletedAt = started;
  record.repositories = [{ name: "proof", kind: "prd", mainCheckoutPath: root, github: "example/proof", baseBranch: "develop", worktreePath: root, setupCompletedAt: started }];
  let companion: string | undefined;
  if (options.companion) {
    companion = createRepository(sandbox, "companion", createBareOrigin(sandbox, "companion"));
    writeFileSync(join(companion, "companion.mjs"), "export const value = 42;\n"); commit(sandbox, companion, ["companion.mjs"]);
    record.repositories.push({ name: "companion", kind: "named", mainCheckoutPath: companion, github: "example/companion", baseBranch: "develop", worktreePath: companion, setupCompletedAt: started });
  }
  const stateDirectory = prdStateDirectory(stateRoot(sandbox.env), root, "proof", directory);
  const context: AdmissionContext = { record, stateDirectory, git: { git: "git", env: sandbox.env }, signal: AbortSignal.timeout(120_000) };
  const store = new AuditStore(stateDirectory);
  /** As allocation does: the activity, with Kiln's snapshot of the work it starts from. */
  const allocate = async (kind: AuditKind, continuationIndex = 1): Promise<AuditActivity> => {
    const activities = record.completionAudits!.activities;
    const activity: AuditActivity = { activityId: randomUUID(), sequence: activities.length + 1, kind, round: 1, continuationIndex, createdAt: new Date().toISOString(), sessionIds: [], reportPath: "", skill: { name: kind, path: "/fixture/SKILL.md", digest: hashBytes("fixture") }, snapshots: [], attempts: [] };
    activity.reportPath = `${directory}/kiln-audit-${activity.activityId}.json`; activities.push(activity);
    record.phases[auditKey(activity)] = { sessionIds: [], finishedByPerson: false, repositories: {} };
    activity.snapshots.push(store.put(await captureSnapshot({ ...context, activity, now: new Date().toISOString() })));
    return activity;
  };
  const report = (activity: AuditActivity, change: Partial<AuditReportV2> = {}): AuditReportV2 => ({ schemaVersion: 2, executionId: record.executionId!, activityId: activity.activityId, kind: activity.kind, outcome: "passed", summary: "Every criterion is delivered.", completionPhases: [], needsYou: [], ...(activity.kind === "test_audit" ? { changedImplementation: false } : {}), ...change });
  const saveReport = (activity: AuditActivity, change: Partial<AuditReportV2> = {}, push = true) => { writeFileSync(join(root, activity.reportPath), JSON.stringify(report(activity, change))); commit(sandbox, root, [activity.reportPath], push); };
  const submit = (activity: AuditActivity) => submitAudit(context, { executionId: record.executionId, activityId: activity.activityId, revision: record.completionAudits!.revision, reportPath: activity.reportPath });
  const snapshot = (activity: AuditActivity) => captureSnapshot({ ...context, activity, now: new Date().toISOString() });
  /** Mark complete: the waiver result with a snapshot captured during the rerun, and the completion the engine writes. */
  const markComplete = async (activity: AuditActivity) => {
    const recorded = waiveAudit(stateDirectory, activity, { waiverId: randomUUID(), snapshot: await snapshot(activity) });
    settle(activity); return recorded;
  };
  const settle = (activity: AuditActivity) => { record.phases[auditKey(activity)]!.doneAt = new Date().toISOString(); };
  const change = (file = "value.mjs", text = "export const value = () => 43;\n") => { writeFileSync(join(root, file), text); commit(sandbox, root, [file]); };
  return { sandbox, root, companion, record, context, store, stateDirectory, allocate, saveReport, submit, markComplete, settle, change, snapshot };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function appendPhase(f: Fixture, id: string) {
  const file = `${directory}/phase-${id}-completion.md`;
  writeFileSync(join(f.root, file), `# Phase ${id}: Completion\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\n1.\n`);
  commit(f.sandbox, f.root, [file]);
}
const waiverOf = (items: Waiver["items"]): Waiver => ({ waiverId: randomUUID(), at: new Date().toISOString(), activityKey: "1", activityKind: "implementation", effect: "completed", source: { via: "command_line", account: "tester" }, operationId: randomUUID(), checkRun: { id: randomUUID(), at: new Date().toISOString() }, items, checks: [] });

describe("an audit marked complete counts as its report allows (AC-WAIVE-12)", () => {
  type Row = [string, AuditKind, (f: Fixture, audit: AuditActivity) => Promise<void>, { report: "accepted" | "valid" | "none"; countedOutcome: string; countedChangedImplementation?: boolean }];
  it.each<Row>([
    ["an accepted delivery report, its own outcome", "delivery_audit", async (f, a) => { f.saveReport(a); expect((await f.submit(a)).disposition).toBe("recorded"); }, { report: "accepted", countedOutcome: "passed" }],
    ["an accepted test report, its own changedImplementation", "test_audit", async (f, a) => { f.change("value.mjs", "export const value = () => 42; // fixed\n"); f.saveReport(a, { changedImplementation: true }); expect((await f.submit(a)).disposition).toBe("recorded"); }, { report: "accepted", countedOutcome: "passed", countedChangedImplementation: true }],
    ["a valid report that needs a person, counted as passed", "delivery_audit", async (f, a) => { f.saveReport(a, { outcome: "needs_you", needsYou: [{ problem: "Needs a login.", action: "Grant it." }] }); expect((await f.submit(a)).refusal).toBeUndefined(); }, { report: "valid", countedOutcome: "passed" }],
    ["a valid report whose repository check failed, its own outcome", "delivery_audit", async (f, a) => { appendPhase(f, "2"); f.saveReport(a, { outcome: "completion_phases", completionPhases: ["2"] }, false); expect(await f.submit(a)).toMatchObject({ disposition: "unresolved" }); }, { report: "valid", countedOutcome: "completion_phases" }],
    ["a valid test report, changedImplementation from the report", "test_audit", async (f, a) => { f.change("value.mjs", "export const value = () => 42; // fixed\n"); writeFileSync(join(f.root, "dirty.txt"), "x"); f.saveReport(a, { changedImplementation: true }); expect((await f.submit(a)).refusal).toBeUndefined(); }, { report: "valid", countedOutcome: "passed", countedChangedImplementation: true }],
    ["no report submitted", "delivery_audit", async () => {}, { report: "none", countedOutcome: "passed" }],
    ["a missing report, refused", "test_audit", async (f, a) => { expect((await f.submit(a)).refusal?.code).toBe("missing_evidence"); }, { report: "none", countedOutcome: "passed", countedChangedImplementation: false }],
    ["an invalid report", "delivery_audit", async (f, a) => { f.saveReport(a, { summary: "" }); expect((await f.submit(a)).refusal?.code).toBe("invalid_report"); }, { report: "none", countedOutcome: "passed" }],
    ["a report the plan disagrees with", "delivery_audit", async (f, a) => { appendPhase(f, "2"); f.saveReport(a, { outcome: "completion_phases", completionPhases: [] }); expect((await f.submit(a)).refusal?.code).toBe("inconsistent_plan"); }, { report: "none", countedOutcome: "passed" }],
    ["a test continuation that made no progress", "test_audit", async (f, a) => { f.saveReport(a, { outcome: "continue_test" }); expect((await f.submit(a)).refusal?.reason).toContain("made no progress"); }, { report: "none", countedOutcome: "passed", countedChangedImplementation: false }],
  ])("%s", async (_name, kind, arrange, expected) => {
    const f = await fixture(); const audit = await f.allocate(kind);
    await arrange(f, audit);
    expect(classifyAuditReport(f.stateDirectory, audit)).toMatchObject(expected);
    const recorded = await f.markComplete(audit);
    expect(recorded).toEqual({ ...expected, resultRef: audit.waivedResult });
    const effective = effectiveAudit(f.stateDirectory, audit)!;
    expect(effective).toMatchObject({ source: "waiver", report: expected.report, outcome: expected.countedOutcome, countedOutcome: expected.countedOutcome });
    expect(effective.changedImplementation).toBe(expected.countedChangedImplementation);
    expect(effective.parsed === undefined).toBe(expected.report === "none");
    // The waiver result is immutable: a second waiver, or a report afterwards, is refused.
    expect(() => waiveAudit(f.stateDirectory, audit, { waiverId: randomUUID(), snapshot: effective.snapshot() })).toThrow(expect.objectContaining({ code: "result_conflict" }));
    if (expected.report !== "accepted") { f.saveReport(audit); await expect(f.submit(audit)).rejects.toMatchObject({ code: "result_conflict" }); }
  });

  it("moves from a no-report delivery audit to the test audit, and from a no-report test audit to final delivery", async () => {
    const f = await fixture();
    const delivery = await f.allocate("delivery_audit");
    expect((await f.submit(delivery)).refusal?.code).toBe("missing_evidence");
    await f.markComplete(delivery);
    expect(await auditNext(f.context)).toBe("test_audit");
    const tests = await f.allocate("test_audit");
    // The test audit changed implementation without saying so; with no report it counts as having changed only tests.
    writeFileSync(join(f.root, "value.mjs"), "export const value = () => 42; // tidied\n"); writeFileSync(join(f.root, tests.reportPath), "not json"); commit(f.sandbox, f.root, ["value.mjs", tests.reportPath]);
    expect((await f.submit(tests)).refusal?.code).toBe("invalid_report");
    await f.markComplete(tests);
    expect(effectiveAudit(f.stateDirectory, tests)?.changedImplementation).toBe(false);
    expect(await auditNext(f.context)).toBe("final_delivery");
  });

  it("keeps a waived audit current while the work is unchanged, measured from its waiver snapshot, and not once it changes", async () => {
    const f = await fixture(); const delivery = await f.allocate("delivery_audit");
    f.saveReport(delivery); expect((await f.submit(delivery)).disposition).toBe("recorded");
    // Work changed after acceptance: the accepted snapshot is no longer current (a failing Audit evidence is current).
    f.change();
    expect((await auditCurrentness(f.context, delivery)).deliveryCurrent).toBe(false);
    await f.markComplete(delivery);
    // Waived, it is current from its waiver snapshot, so Kiln does not send the person back to the same audit.
    expect(await auditCurrentness(f.context, delivery)).toEqual({ deliveryCurrent: true, testsCurrent: true });
    expect(await auditNext(f.context)).toBe("test_audit");
    f.change("value.mjs", "export const value = () => 44;\n");
    expect((await auditCurrentness(f.context, delivery)).deliveryCurrent).toBe(false);
    expect(await auditNext(f.context)).toBe("delivery_audit");
  });

  it("runs completion phases a no-report audit appended first, then audits the work they add afresh", async () => {
    const f = await fixture(); const delivery = await f.allocate("delivery_audit");
    appendPhase(f, "2"); f.saveReport(delivery, { outcome: "completion_phases", completionPhases: [] });
    expect((await f.submit(delivery)).refusal?.code).toBe("inconsistent_plan");
    await f.markComplete(delivery);
    const effective = effectiveAudit(f.stateDirectory, delivery)!;
    expect(effective).toMatchObject({ report: "none", countedOutcome: "passed" });
    expect(effective.completionPhases()).toEqual(["2"]);
    expect(phasesBeyondInitial(f.stateDirectory, delivery, effective.snapshot().plan)).toEqual(["2"]);
    // Phase 2 is built and closed: the work changed since the waiver, so the next delivery audit is a fresh round.
    f.change(); const file = `${directory}/phase-2-completion.md`;
    writeFileSync(join(f.root, file), `# Phase 2: Completion\n\n**Closed:** 2026-11-02\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\n1.\n`); commit(f.sandbox, f.root, [file]);
    expect(await auditNext(f.context)).toBe("delivery_audit");
  });

  it("admits a continuation after a waived continue_test, and moves on after a no-progress one (AC-NEUTRAL-05)", async () => {
    const f = await fixture(); const delivery = await f.allocate("delivery_audit");
    f.saveReport(delivery); expect((await f.submit(delivery)).disposition).toBe("recorded"); f.settle(delivery);
    const tests = await f.allocate("test_audit");
    // Progress made, but left unpushed: a valid continue_test report that was not accepted.
    writeFileSync(join(f.root, directory, "test-audit.md"), "# Test audit\nNext batch: AC-PROOF-01.\n");
    git(f.sandbox, f.root, "add", "--", `${directory}/test-audit.md`); git(f.sandbox, f.root, "commit", "-qm", "test(audit): local record");
    f.saveReport(tests, { outcome: "continue_test" }, false);
    const unaccepted = await f.submit(tests);
    expect(unaccepted.disposition).toBe("unresolved"); expect(unaccepted.refusal).toBeUndefined();
    expect(continuablePredecessor(f.context)).toBeUndefined();
    await f.markComplete(tests);
    expect(continuablePredecessor(f.context)).toBe(tests);
    expect(await auditNext(f.context)).toBe("continue_test");

    const continuation = await f.allocate("test_audit", 2);
    f.saveReport(continuation, { outcome: "continue_test" });
    expect((await f.submit(continuation)).refusal?.reason).toContain("made no progress");
    await f.markComplete(continuation);
    expect(continuablePredecessor(f.context)).toBeUndefined();
    expect(await auditNext(f.context)).toBe("final_delivery");
  });

  it("completes at once with no report an audit allocated under a waived readiness problem", async () => {
    const f = await fixture(); const delivery = await f.allocate("delivery_audit");
    delete delivery.skill;
    const waiverId = randomUUID();
    expect(waiveUnstartedAudit(f.stateDirectory, delivery, waiverId)).toEqual({ report: "none", countedOutcome: "passed", resultRef: delivery.waivedResult });
    f.settle(delivery);
    const effective = effectiveAudit(f.stateDirectory, delivery)!;
    expect(effective.waiver).toMatchObject({ waiverId, report: "none", snapshotRef: delivery.snapshots[0] });
    expect(effective.completionPhases()).toEqual([]);
    expect(await auditNext(f.context)).toBe("test_audit");
    const tests = await f.allocate("test_audit");
    expect(waiveUnstartedAudit(f.stateDirectory, tests, waiverId)).toMatchObject({ report: "none", countedChangedImplementation: false });
    f.settle(tests);
    expect(await auditNext(f.context)).toBe("final_delivery");
    const submitted = await f.allocate("test_audit"); await f.submit(submitted);
    expect(() => waiveUnstartedAudit(f.stateDirectory, submitted, waiverId)).toThrow(expect.objectContaining({ code: "result_conflict" }));
  });
});

describe("audit items and waived plan closures", () => {
  it("lists each repository's uncommitted, unpushed and branch problems as their own items (AC-WAIVE-11)", async () => {
    const f = await fixture({ companion: true });
    writeFileSync(join(f.root, "untracked.txt"), "x");
    writeFileSync(join(f.companion!, "companion.mjs"), "export const value = 43;\n"); git(f.sandbox, f.companion!, "commit", "-qam", "local only");
    git(f.sandbox, f.companion!, "checkout", "-qb", "elsewhere");
    const [committed, pushed] = await repositoryChecks(f.context);
    expect(committed).toEqual({ name: "Everything committed", passed: false, facts: ["proof: uncommitted or untracked work remains.", "companion: assigned branch changed."], items: [
      { kind: "repository_work", subject: "proof", text: "proof: uncommitted or untracked work remains.", against: "" },
      { kind: "other", subject: "companion", text: "companion: assigned branch changed.", against: "" },
    ] });
    expect(pushed).toEqual({ name: "Pushed", passed: false, facts: ["companion: current head is not pushed to its assigned branch."], items: [{ kind: "repository_work", subject: "companion", text: "companion: current head is not pushed to its assigned branch.", against: "" }] });
    git(f.sandbox, f.companion!, "checkout", "-q", "develop"); git(f.sandbox, f.companion!, "push", "-q", "origin", "develop"); git(f.sandbox, f.root, "clean", "-qfd");
    expect(await repositoryChecks(f.context)).toEqual([{ name: "Everything committed", passed: true, facts: ["Every assigned worktree is clean."] }, { name: "Pushed", passed: true, facts: ["Every assigned head matches origin."] }]);
  });

  it.each([
    ["closed by waiver", (f: Fixture) => { f.record.waivers = [waiverOf([{ check: "Phase doc closed", kind: "phase_closed", subject: "1", text: "No Closed line in phase-1-value.md", against: "1" }])]; }],
    ["skipped under a waived plan problem", (f: Fixture) => { f.record.phases["1"] = { sessionIds: [], finishedByPerson: false, repositories: {}, skippedByWaiver: randomUUID() }; }],
  ])("treats a leaf %s as closed in the no-open-phase rule (AC-NEUTRAL-04)", async (_name, waive) => {
    const f = await fixture({ openPhase: true }); const delivery = await f.allocate("delivery_audit");
    f.saveReport(delivery);
    expect((await f.submit(delivery)).refusal?.reason).toContain("A passing audit leaves no open phase; open: 1");
    waive(f);
    expect(await f.submit(delivery)).toMatchObject({ disposition: "recorded", nextAction: "test_audit" });
  });

  it("keeps comparing the documents' own Closed lines for original phases under a Closed waiver", async () => {
    const f = await fixture({ openPhase: true }); const delivery = await f.allocate("delivery_audit");
    f.record.waivers = [waiverOf([{ check: "Phase doc closed", kind: "phase_closed", subject: "1", text: "No Closed line in phase-1-value.md", against: "1" }])];
    // Writing the Closed line the waiver stood in for still rewrites an original phase.
    const file = `${directory}/phase-1-value.md`; writeFileSync(join(f.root, file), phaseOne(true)); commit(f.sandbox, f.root, [file]);
    f.saveReport(delivery);
    expect((await f.submit(delivery)).refusal).toMatchObject({ code: "inconsistent_plan", reason: expect.stringContaining("changed an original phase") });
  });
});
