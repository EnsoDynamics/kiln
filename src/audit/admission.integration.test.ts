// Real Git, filesystem, HTTP and CLI; fabricated transcripts exercise refusal cases beside
// the actual-provider proof in scripts/proof-run/completion-audit-proof.mjs.
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, renameSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createBareOrigin, createRepository, createSandbox, commitFiles, git, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { newPrdRecord } from "../state/new-record.js";
import { readPrdRecord, SCHEMA_VERSION, writePrdRecord, writeSessionRecord, type SessionRecord } from "../state/records.js";
import { prdStateDirectory, stateRoot } from "../state/state-files.js";
import { ownerDeliveryCheck, ownerDocuments, recordAssessment, type DeliveryContext } from "../engine/development-delivery.js";
import { Engine } from "../engine/engine.js";
import { startLocalServer, TOKEN_HEADER, type LocalServer } from "../server/local-server.js";
import { takeInstanceLock } from "../state/instance-lock.js";
import { runAudit } from "../audit-command.js";
import { auditCurrentness, auditEvidence, issueSnapshot, refreshAuditEvidence, submitAudit, type AdmissionContext } from "./admission.js";
import { validateReport } from "./validate-report.js";
import { AuditStore, hashBytes, strictJson } from "./storage.js";
import { captureSnapshot, compareSnapshots, requirementManifest, phaseScope } from "./snapshots.js";
import type { AuditActivity, AuditReport, EvidenceEntry, WorkSnapshot } from "./contracts.js";
import { commandContracts } from "../control/help.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(f => f())); });
const directory = "docs/prds/proof";
const prd = "# PRD: Audit proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return the value.** The function returns 42.\n  - The exported function is reachable.\n";
async function fixture(kind: "delivery_audit" | "test_audit" = "delivery_audit", options: { source?: string; companion?: boolean; openPhase?: boolean } = {}) {
  const sandbox = createSandbox(); cleanups.push(() => sandbox.cleanup());
  const origin = createBareOrigin(sandbox, "proof"); const root = createRepository(sandbox, "proof", origin);
  commitFiles(sandbox, root, directory, { "proof-prd.md": options.source ?? prd, "technical-design.md": "# Design\nExport value from value.mjs.\n", "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n" });
  if (options.openPhase) {
    const path = join(root, directory, "phase-1-value.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("**Closed:** 2026-10-24\n", ""));
    commit(sandbox, root, [`${directory}/phase-1-value.md`]);
  }
  writeFileSync(join(root, "value.mjs"), "export const value = () => 42;\n");
  writeFileSync(join(root, "value.test.mjs"), "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n");
  writeFileSync(join(root, "package.json"), '{"type":"module","scripts":{"test":"node value.test.mjs"}}');
  commit(sandbox, root, ["value.mjs", "value.test.mjs", "package.json"]);
  const record = newPrdRecord({ mainCheckoutPath: root, repositoryName: "proof", github: "example/proof", prdDirectoryFromRoot: directory, featureName: "Audit proof", settings: { workspaceFolder: sandbox.root, worktreePath: root, featureBranch: "develop", baseBranch: "develop", bases: {}, model: "sonnet", effort: "low", keepAwake: false, resumeAfterUsageLimit: false } });
  const started = new Date(Date.now() - 60_000).toISOString(); record.startedAt = started; record.setupCompletedAt = started;
  record.repositories = [{ name: "proof", kind: "prd", mainCheckoutPath: root, github: "example/proof", baseBranch: "develop", worktreePath: root, setupCompletedAt: started }];
  if (options.companion) {
    const other = createRepository(sandbox, "companion", createBareOrigin(sandbox, "companion"));
    writeFileSync(join(other, "companion.mjs"), "export const value = 42;\n"); commit(sandbox, other, ["companion.mjs"]);
    record.repositories.push({ name: "companion", kind: "named", mainCheckoutPath: other, github: "example/companion", baseBranch: "develop", worktreePath: other, setupCompletedAt: started });
  }
  const skillName = kind === "delivery_audit" ? "delivery-audit" : "test-audit";
  const skillPath = join(sandbox.root, `${skillName}-SKILL.md`); const skillText = "# delivery-audit\nFixture skill source.\n"; writeFileSync(skillPath, skillText);
  const activity: AuditActivity = { activityId: randomUUID(), sequence: 1, kind, round: 1, continuationIndex: 1, createdAt: started, sessionIds: [randomUUID()], reportPath: "", skill: { name: skillName, path: skillPath, digest: hashBytes(skillText) }, snapshots: [], attempts: [] };
  activity.reportPath = `${directory}/kiln-audit-${activity.activityId}.json`; record.completionAudits!.activities.push(activity);
  const session: SessionRecord = { schemaVersion: SCHEMA_VERSION, agentId: "claude_code", sessionId: activity.sessionIds[0]!, activityId: activity.activityId, phaseId: "", kind: activity.kind, createdAt: started, model: "sonnet", modelDisplayName: "Sonnet", workingDirectory: root, runs: [{ cause: "launch", startedAt: started }], sleeps: [], steps: [] };
  const stateDirectory = prdStateDirectory(stateRoot(sandbox.env), root, "proof", directory);
  writePrdRecord(stateDirectory, record); writeSessionRecord(stateDirectory, session);
  const transcriptFolder = join(sandbox.env.CLAUDE_CONFIG_DIR!, "projects", "proof"); mkdirSync(transcriptFolder, { recursive: true });
  const transcript = join(transcriptFolder, `${session.sessionId}.jsonl`);
  const rows: unknown[] = [];
  const call = (id: string, name: string, input: unknown, text: string, at = new Date().toISOString(), isError = false) => {
    rows.push({ type: "assistant", timestamp: at, cwd: root, message: { content: [{ type: "tool_use", id, name, input }] } }, { type: "user", timestamp: at, message: { content: [{ type: "tool_result", tool_use_id: id, content: text, is_error: isError }] } });
    writeFileSync(transcript, rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  };
  call("skill", "Skill", { skill: `enso-method:${skillName}` }, "Skill loaded");
  const context: AdmissionContext = { record, stateDirectory, git: { git: "git", env: sandbox.env }, env: sandbox.env, codex: "codex", signal: AbortSignal.timeout(120_000), session: () => session };
  const body = () => ({ executionId: record.executionId, activityId: activity.activityId, revision: record.completionAudits!.revision });
  const snapshotExample = commandContracts.find(c => c.path.join(" ") === "audit snapshot")!.examples[0]!;
  const snapshotRequest = structuredClone(Object.values(snapshotExample.files!)[0]) as Record<string, unknown>;
  Object.assign(snapshotRequest, body());
  const snap = await issueSnapshot(context, snapshotRequest);
  const store = new AuditStore(stateDirectory); const checked = store.read<WorkSnapshot>(activity.snapshots[0]!);
  const criterion = checked.requirements.criteria[0]!;
  const assess = (purpose: "assessment" | "review" | "regrade" | "test_classification", id: string, verificationEvidenceIds: string[] = [], extra: Partial<NonNullable<EvidenceEntry["assessment"]>> = {}) => {
    const task = `Assess snapshot ${extra.snapshotId ?? snap.snapshotId} criteria ${(extra.criterionKeys ?? checked.requirements.criteria.map(c => c.key)).join(" ")} parts ${(extra.partIds ?? ["value"]).join(" ")}`;
    const text = `<kiln-assessment>${JSON.stringify({ snapshotId: snap.snapshotId, criterionKeys: [criterion.key], partIds: ["value"], purpose, testPaths: [], verificationEvidenceIds, ...extra })}</kiln-assessment>`;
    call(id, "Agent", { prompt: task }, `Completed agentId: ${id}`);
    const childFolder = join(transcriptFolder, session.sessionId, "subagents"); mkdirSync(childFolder, { recursive: true });
    writeFileSync(join(childFolder, `agent-${id}.jsonl`), JSON.stringify({ type: "assistant", timestamp: new Date().toISOString(), cwd: root, message: { content: [{ type: "text", text }] } }) + "\n");
  };
  assess("assessment", "assessor"); assess("review", "reviewer");
  const evidence = await refreshAuditEvidence(context);
  const observed = (kind: EvidenceEntry["kind"], purpose?: string) => evidence.find(e => e.kind === kind && (!purpose || e.assessment?.purpose === purpose))!.evidenceId;
  const report: AuditReport = { schemaVersion: 1, executionId: record.executionId!, activityId: activity.activityId, kind: activity.kind, round: 1, continuationIndex: 1, scope: { repository: "proof", path: `${directory}/proof-prd.md`, kind: "whole_prd", manifestId: checked.requirements.id, criterionKeys: [criterion.key] }, checkedSnapshotId: checked.id, criteria: [{ criterionKey: criterion.key, parts: [{ id: "value", quote: criterion.content, startLine: criterion.startLine, endLine: criterion.endLine, applicability: "current", code: [{ repository: "proof", path: "value.mjs", blob: checked.repositories[0]!.files["value.mjs"]!.blob }], tests: [] }], assessmentEvidenceIds: [observed("assessment", "assessment")], findings: [], blockerIds: [], deliveryStatus: "implemented" }], methodEvidence: { skillEvidenceId: observed("skill"), assessmentEvidenceIds: [observed("assessment", "assessment")], reviewEvidenceIds: [observed("assessment", "review")] }, completionPhases: [], pendingHumanActions: [], blockers: [], outcome: "passed" };
  const saveReport = (bytes = JSON.stringify(report)) => { writeFileSync(join(root, activity.reportPath), bytes); commit(sandbox, root, [activity.reportPath]); };
  return { sandbox, root, origin, record, activity, session, context, body, checked, report, saveReport, call, assess, transcript, store, stateDirectory };
}
function commit(sandbox: Sandbox, root: string, paths: string[]) { git(sandbox, root, "add", "--", ...paths); git(sandbox, root, "commit", "--allow-empty", "-qm", "test(audit): fixture work"); git(sandbox, root, "push", "-qu", "origin", "develop"); }

describe("audit evidence admission", () => {
  it("accepts an aliased workspace root without accepting writes to another checkout", async () => {
    const f = await fixture();
    const alias = join(f.sandbox.root, "worktree-alias");
    symlinkSync(f.root, alias, "junction");
    f.record.repositories[0]!.worktreePath = alias;
    const inside = join(f.root, "value.mjs");
    f.call("inside-write", "Write", { file_path: inside }, "Written");
    const evidence = await refreshAuditEvidence(f.context);
    expect(evidence.find(entry => entry.locator === "inside-write")?.mutation?.paths).toEqual([inside]);
    const outside = createRepository(f.sandbox, "outside");
    f.call("outside-write", "Write", { file_path: join(outside, "value.mjs") }, "Written");
    await expect(refreshAuditEvidence(f.context)).rejects.toMatchObject({ code: "outside_execution" });
  });
  it("accepts current whole-PRD evidence, survives a lost response, and preserves immutable result history", async () => {
    const f = await fixture(); f.saveReport(); const request = { ...f.body(), reportPath: f.activity.reportPath };
    const result = await submitAudit(f.context, request); expect(result.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Audit result recorded", passed: true })])); expect(result.disposition).toBe("recorded"); expect(result.nextAction).toBe("test_audit");
    writePrdRecord(f.stateDirectory, f.record); const recovered = readPrdRecord(f.stateDirectory)!;
    expect(await submitAudit({ ...f.context, record: recovered }, request)).toEqual(result);
    f.report.outcome = "blocked"; f.saveReport(); await expect(submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath })).rejects.toMatchObject({ code: "result_conflict" });
    expect(f.store.read< { reportBytes: string }>(f.activity.acceptedResult!).reportBytes).toBe(result.reportBytes);
  });
  it.each(["missing row", "wrong identity", "invented evidence", "wrong kind", "unknown status", "contradictory blocker", "duplicate keys", "stale source", "contradictory finding", "unreferenced human action", "old session evidence"])("refuses %s without advancing", async mode => {
    const f = await fixture();
    if (mode === "contradictory finding") f.report.criteria[0]!.findings = [{ partIds: ["value"], missing: "Required return value is absent", evidenceIds: [] }];
    if (mode === "unreferenced human action") f.report.pendingHumanActions = [{ id: "human", criterionKey: f.report.scope.criterionKeys[0]!, action: "Verify delivery", requirementQuote: "returns 42", beyondDelivery: false }];
    if (mode === "old session evidence") { const old = auditEvidence(f.context).find(e => e.kind === "skill")!; const changed = { ...old, evidenceId: "old-skill", sessionId: "other-session" }; f.record.completionAudits!.evidence.push(f.store.put(changed)); f.report.methodEvidence.skillEvidenceId = "old-skill"; }
    if (mode === "missing row") f.report.criteria = [];
    if (mode === "wrong identity") f.report.executionId = "other";
    if (mode === "invented evidence") f.report.methodEvidence.skillEvidenceId = "invented";
    if (mode === "wrong kind") f.report.criteria[0]!.testAssessment = { grade: "adequate" };
    if (mode === "unknown status") (f.report.criteria[0] as unknown as Record<string, unknown>).deliveryStatus = "done";
    if (mode === "contradictory blocker") { f.report.blockers = [{ id: "blocked", criterionKeys: f.report.scope.criterionKeys, problem: "No evidence", requiredAction: "Supply evidence" }]; f.report.criteria[0]!.blockerIds = ["blocked"]; }
    if (mode === "stale source") { writeFileSync(join(f.root, "value.mjs"), "export const value = () => 0;\n"); commit(f.sandbox, f.root, ["value.mjs"]); }
    f.saveReport(mode === "duplicate keys" ? '{"schemaVersion":1,"schemaVersion":1}' : undefined);
    const result = await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(result.disposition).toBe("unresolved"); expect(result.nextAction).toBe("needs_you"); expect(result.checks.some(c => !c.passed)).toBe(true); expect(f.activity.acceptedResult).toBeUndefined(); expect(f.activity.attempts).toHaveLength(1);
  });
  it("keeps a valid audit report correctable until its development owner assessment passes", async () => {
    const f = await fixture(); f.saveReport();
    const owner = { kind: "audit" as const, activityId: f.activity.activityId };
    const delivery: DeliveryContext = { record: f.record, stateDirectory: f.stateDirectory, prdWorktree: f.root, prdDirectory: directory, git: f.context.git, env: f.context.env, gh: "unused", owner, now: () => new Date().toISOString(), commands: async () => [] };
    const context = { ...f.context, developmentChecks: () => [ownerDeliveryCheck(delivery, owner)] };
    const first = await submitAudit(context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(first.disposition).toBe("unresolved"); expect(f.activity.acceptedResult).toBeUndefined();
    expect(first.checks).toContainEqual(expect.objectContaining({ name: "Required development delivery verified", passed: false }));
    await recordAssessment(delivery, { owner, ...ownerDocuments(delivery, owner), required: false, criteria: f.checked.requirements.criteria.map(one => one.key), reason: "No PRD criterion requires development delivery.", checkpoints: [] });
    const next = await submitAudit(context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(next.disposition).toBe("recorded"); expect(f.activity.attempts).toHaveLength(2);
  });
  it("retains missing reports and permits corrected blocked submissions in the same activity", async () => {
    const f = await fixture(); const missing = await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(missing.disposition).toBe("unresolved"); expect(missing.refusal?.code).toBe("missing_evidence");
    f.report.outcome = "blocked"; f.report.blockers = [{ id: "decision", criterionKeys: f.report.scope.criterionKeys, problem: "A decision is missing", requiredAction: "Record it" }]; f.report.criteria[0]!.blockerIds = ["decision"]; f.saveReport();
    expect((await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath })).disposition).toBe("unresolved"); expect(f.activity.acceptedResult).toBeUndefined();
    f.report.outcome = "passed"; f.report.blockers = []; f.report.criteria[0]!.blockerIds = []; f.saveReport();
    expect((await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath })).disposition).toBe("recorded"); expect(f.activity.attempts).toHaveLength(3);
  });
  it("blocks dirty/unpushed work, stale revisions and report/symlink escapes", async () => {
    const f = await fixture(); f.saveReport();
    writeFileSync(join(f.root, "untracked.txt"), "unknown implementation");
    expect((await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath })).disposition).toBe("unresolved");
    await expect(issueSnapshot(f.context, { ...f.body(), revision: -1, testPaths: [], evidencePaths: [] })).rejects.toMatchObject({ code: "stale_revision" });
    await expect(submitAudit(f.context, { ...f.body(), reportPath: "../outside.json" })).rejects.toMatchObject({ code: "outside_execution" });
    if (process.platform !== "win32") { symlinkSync(f.transcript, join(f.root, "escape.json")); await expect(captureSnapshot({ ...f.context, activity: f.activity, evidence: auditEvidence(f.context), now: new Date().toISOString() }, [], [])).rejects.toMatchObject({ code: "outside_execution" }); }
  });
  it("invalidates material content while record-only commits and parsed phase status terminate", async () => {
    const f = await fixture(); f.saveReport(); expect((await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath })).disposition).toBe("recorded");
    const phase = `${directory}/phase-1-value.md`; writeFileSync(join(f.root, phase), readFileSync(join(f.root, phase), "utf8").replace("2026-10-24", "2026-10-25")); commit(f.sandbox, f.root, [phase]);
    expect(await auditCurrentness(f.context, f.activity)).toEqual({ deliveryCurrent: true, testsCurrent: true });
    writeFileSync(join(f.root, `${directory}/test-audit.md`), "# Test audit\nNew independent record\n"); commit(f.sandbox, f.root, [`${directory}/test-audit.md`]);
    expect(await auditCurrentness(f.context, f.activity)).toEqual({ deliveryCurrent: true, testsCurrent: true });
    writeFileSync(join(f.root, phase), readFileSync(join(f.root, phase), "utf8") + "\nRequire another behavior.\n"); commit(f.sandbox, f.root, [phase]);
    expect((await auditCurrentness(f.context, f.activity)).deliveryCurrent).toBe(false);
  });
  it("does not exclude arbitrary evidence declarations or unsupported test-only helpers", async () => {
    const f = await fixture(); const current = await captureSnapshot({ ...f.context, activity: f.activity, evidence: auditEvidence(f.context), now: new Date().toISOString() }, [], []);
    expect(compareSnapshots(f.checked, current).testsCurrent).toBe(true);
    await expect(issueSnapshot(f.context, { ...f.body(), testPaths: [{ repository: "proof", path: "value.mjs", blob: f.checked.repositories[0]!.files["value.mjs"]!.blob }], evidencePaths: [] })).rejects.toMatchObject({ code: "invalid_report" });
  });
  it("uses real authenticated HTTP and the CLI, with rollback when state persistence fails", async () => {
    const f = await fixture(); f.saveReport(); writePrdRecord(f.stateDirectory, f.record);
    // Account/model discovery is outside this HTTP test; use the existing process fixture
    // so an installed Claude process cannot keep writing after sandbox cleanup starts.
    const tools = { git: "git", ...installStandIns(join(f.sandbox.root, "bin")) };
    const engine = new Engine({ paths: { mainCheckoutPath: f.root, repositoryName: "proof", folderName: "proof", prdDirectoryFromRoot: directory, featureName: "Audit proof" }, tools, env: f.sandbox.env, stateDirectory: f.stateDirectory, record: f.record });
    await engine.agents.refresh();
    const lock = await takeInstanceLock(stateRoot(f.sandbox.env), f.stateDirectory); if (!lock.taken) throw new Error("No instance lock");
    let server: LocalServer | undefined;
    try {
      server = await startLocalServer({ engine, port: lock.port, folderName: "proof", featureName: "Audit proof", token: f.record.token });
      const address = new URL(server.address).origin;
      expect((await fetch(`${address}/api/audit`)).status).toBe(403);
      expect((await fetch(`${address}/api/audit/result`, { method: "POST", headers: { [TOKEN_HEADER]: f.record.token, Origin: "http://evil.invalid" }, body: "{}" })).status).toBe(403);
      // AC-ACT-01: the shipped example is a real request contract once its documented
      // status-sourced values are bound; it must reach successful admission unchanged.
      const example = commandContracts.find(c => c.path.join(" ") === "audit submit")!.examples[0]!;
      const request = structuredClone(Object.values(example.files!)[0]) as Record<string, unknown>;
      Object.assign(request, f.body(), { reportPath: f.activity.reportPath });
      const requestFile = join(f.sandbox.root, "request.json"); writeFileSync(requestFile, JSON.stringify(request));
      let out = ""; let err = "";
      expect(await runAudit(["submit", requestFile], { cwd: f.root, env: f.sandbox.env, stdout: { write: s => out += s }, stderr: { write: s => err += s } })).toBe(0);
      expect(err).toBe(""); expect(JSON.parse(out).disposition).toBe("recorded");
      const before = JSON.stringify(f.record.completionAudits);
      // A real filesystem failure, not a mocked save, must not advance in-memory state.
      const recordPath = join(f.stateDirectory, "prd.json"); const backupPath = join(f.stateDirectory, "prd-backup.json");
      renameSync(recordPath, backupPath); mkdirSync(recordPath);
      try { await expect(engine.auditCommand("status")).rejects.toThrow(); expect(JSON.stringify(f.record.completionAudits)).toBe(before); }
      finally { rmdirSync(recordPath); renameSync(backupPath, recordPath); }
    } finally { await server?.close(); lock.release(); engine.close(); }
  });
});

/** Actual Node executions support the deterministic transcript boundary fixture. */
async function testAuditFixture(source?: string, openPhase = false) {
  const f = await fixture("test_audit", { ...(source ? { source } : {}), openPhase });
  writeFileSync(join(f.root, `${directory}/test-audit.md`), "# Test audit\nAC-PROOF-01: Strong; two assertion failures then restored pass.\n");
  const run = async (id: string) => {
    const at = new Date().toISOString(); let output: string; let failed = false;
    try { output = execFileSync(process.execPath, ["value.test.mjs"], { cwd: f.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { failed = true; output = String((error as { stderr: unknown }).stderr); }
    f.call(id, "Bash", { command: "node value.test.mjs" }, output, at, failed);
    return (await refreshAuditEvidence(f.context)).find(e => e.locator === id)!.evidenceId;
  };
  const baseline = await run("baseline");
  writeFileSync(join(f.root, "value.mjs"), "export const value = () => 0;\n");
  f.call("break", "Write", { file_path: join(f.root, "value.mjs") }, "Written");
  const red1 = await run("red1"); const red2 = await run("red2");
  writeFileSync(join(f.root, "value.mjs"), "export const value = () => 42;\n");
  f.call("restore", "Write", { file_path: join(f.root, "value.mjs") }, "Written");
  const green = await run("green");
  f.assess("assessment", "test-assessor", [baseline, red1, red2, green]); f.assess("review", "test-reviewer", [baseline, red1, red2, green]); f.assess("regrade", "test-regrader", [green]);
  const evidence = await refreshAuditEvidence(f.context);
  const id = (locator: string) => evidence.find(e => e.locator === locator)!.evidenceId;
  const report = f.report; const row = report.criteria[0]!;
  delete row.deliveryStatus; row.testAssessment = { grade: "strong" }; row.assessmentEvidenceIds = [id("test-assessor")];
  row.parts[0]!.tests = [{ file: { repository: "proof", path: "value.test.mjs", blob: f.checked.repositories[0]!.files["value.test.mjs"]!.blob }, selector: "value.test.mjs", runEvidenceIds: [green], runtime: { kind: "checkout" } }];
  report.methodEvidence = { skillEvidenceId: id("skill"), assessmentEvidenceIds: [id("test-assessor")], reviewEvidenceIds: [id("test-reviewer")], regradeEvidenceIds: [id("test-regrader")], baselineRunEvidenceIds: [baseline], finalRunEvidenceIds: [green], redChecks: [{ partIds: ["value"], mutationEvidenceIds: [id("break")], restorationEvidenceIds: [id("restore")], failingRunEvidenceIds: [red1, red2], passingRunEvidenceId: green }] };
  commit(f.sandbox, f.root, [`${directory}/test-audit.md`]);
  return f;
}
describe("typed test-audit evidence", () => {
  it.each(["missing", "weak", "unowned open phase", "owned open phase"])("refuses a passed test audit with unresolved work: %s (AC-TEST-04)", async mode => {
    const f = await testAuditFixture(undefined, mode === "owned open phase");
    const row = f.report.criteria[0]!;
    if (mode === "missing" || mode === "weak") {
      row.testAssessment = { grade: mode };
      row.findings = [{ partIds: ["value"], missing: "Required assertion still absent.", evidenceIds: [] }];
    } else {
      row.testAssessment = { status: "not_built_yet" };
      row.parts[0]!.openPhaseId = mode === "owned open phase" ? "1" : "99";
    }
    f.saveReport();
    const result = await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(result.disposition).toBe("unresolved");
    expect(result.nextAction).toBe("needs_you");
    expect(f.activity.acceptedResult).toBeUndefined();
    expect(result.refusal?.reason).toContain(mode === "unowned open phase" ? "no owning open phase" : "passing audit still has unresolved work");
  });

  it.each(["parent regrader", "writer regrader", "missing affected part", "same reviewer"])("refuses non-independent or incomplete assessment: %s (AC-TEST-01)", async mode => {
    const f = await testAuditFixture();
    const evidence = await refreshAuditEvidence(f.context);
    const current = await captureSnapshot({ ...f.context, activity: f.activity, evidence, now: new Date().toISOString() }, [], []);
    const context = { record: f.record, activity: f.activity, checked: f.checked, initial: f.checked, current, evidence };
    // Establish that the otherwise identical real-node red/restore evidence is admissible.
    expect(validateReport(f.report, context).nextAction).toBe("final_delivery");
    const regrade = evidence.find(entry => entry.evidenceId === f.report.methodEvidence.regradeEvidenceIds![0])!;
    if (mode === "parent regrader") regrade.conversationId = evidence.find(entry => entry.kind === "skill")!.conversationId;
    if (mode === "writer regrader") {
      const writer = evidence.find(entry => entry.kind === "mutation")!;
      writer.conversationId = "separate-writer"; regrade.conversationId = writer.conversationId;
    }
    if (mode === "missing affected part") regrade.assessment!.partIds = [];
    if (mode === "same reviewer") evidence.find(entry => entry.evidenceId === f.report.methodEvidence.reviewEvidenceIds[0])!.conversationId = evidence.find(entry => entry.evidenceId === f.report.methodEvidence.assessmentEvidenceIds[0])!.conversationId;
    expect(() => validateReport(f.report, context)).toThrow(mode === "missing affected part" ? "does not cover every potentially affected part" : mode === "same reviewer" ? "distinct assessor conversation" : "independent of its writer");
  });

  it("admits actual failing mapped runs followed by restoration, passing suite and independent regrade", async () => {
    const f = await testAuditFixture(); f.saveReport(); const result = await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(result.checks.filter(c => !c.passed)).toEqual([]); expect(result.disposition).toBe("recorded"); expect(result.nextAction).toBe("final_delivery");
    writeFileSync(join(f.root, `${directory}/test-audit.md`), "Changed accepted method record"); commit(f.sandbox, f.root, [`${directory}/test-audit.md`]);
    await expect(auditCurrentness(f.context, f.activity)).rejects.toMatchObject({ code: "stale_snapshot" });
  });
  it.each(["omitted", "duplicated", "complete"])("accounts for every remaining Weak criterion in a continuation (%s)", async mode => {
    const f=await testAuditFixture(prd+"- [ ] **AC-PROOF-02 — Check another call.** The next function call also returns 42.\n");
    const sources=f.checked.requirements.criteria;const keys=sources.map(c=>c.key);const row=f.report.criteria[0]!;
    row.testAssessment={grade:"weak"};row.findings=[{partIds:["value"],missing:"An assertion is still needed.",evidenceIds:[]}];
    const second=structuredClone(row);second.criterionKey=keys[1]!;second.parts[0]!.id="next-call";second.parts[0]!.quote=sources[1]!.content;second.parts[0]!.startLine=sources[1]!.startLine;second.parts[0]!.endLine=sources[1]!.endLine;second.findings[0]!.partIds=["next-call"];
    f.report.criteria.push(second);f.report.scope.criterionKeys=keys;
    const runs=f.report.methodEvidence.baselineRunEvidenceIds!.concat(f.report.methodEvidence.finalRunEvidenceIds!,f.report.methodEvidence.redChecks![0]!.failingRunEvidenceIds);
    const scope={criterionKeys:keys,partIds:["value","next-call"]};
    for(const purpose of ["assessment","review","regrade"] as const)f.assess(purpose,"batch-"+purpose,runs,scope);
    const evidence=await refreshAuditEvidence(f.context);const id=(purpose:string)=>evidence.find(e=>e.locator==="batch-"+purpose)!.evidenceId;
    f.report.methodEvidence.assessmentEvidenceIds=[id("assessment")];f.report.methodEvidence.reviewEvidenceIds=[id("review")];f.report.methodEvidence.regradeEvidenceIds=[id("regrade")];f.report.criteria.forEach(r=>r.assessmentEvidenceIds=[id("assessment")]);
    const nextBatch="Add assertions for both remaining call cases.";f.report.outcome="continue_test";f.report.nextTestBatch={criterionKeys:mode==="omitted"?[keys[0]!]:mode==="duplicated"?[...keys,keys[0]!]:keys,recordPath:`${directory}/test-audit.md`,nextBatch};
    writeFileSync(join(f.root,`${directory}/test-audit.md`),"# Test audit\n"+nextBatch+"\n");commit(f.sandbox,f.root,[`${directory}/test-audit.md`]);f.saveReport();
    const result=await submitAudit(f.context,{...f.body(),reportPath:f.activity.reportPath});
    expect(result.disposition,result.refusal?.reason).toBe(mode==="complete"?"recorded":"unresolved");
    if(mode!=="complete")expect(result.refusal?.reason).toContain("Next batch must name remaining Missing/Weak criteria");
  });
  it.each([true, false])("permits a pending human action only beyond the delivery boundary (%s)", async beyondDelivery => {
    const f = await testAuditFixture(prd + "  - Production release is a separate human action after Kiln delivery.\n"); const row = f.report.criteria[0]!;
    row.testAssessment = { status: "person_checked" }; row.parts[0]!.humanActionId = "later-release";
    f.report.pendingHumanActions = [{ id: "later-release", criterionKey: row.criterionKey, action: "Perform the separately authorized later release.", requirementQuote: "Production release is a separate human action after Kiln delivery.", beyondDelivery }];
    f.saveReport(); const result = await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(result.disposition).toBe(beyondDelivery ? "recorded" : "unresolved");
    if (beyondDelivery) expect(result.nextAction).toBe("final_delivery");
    else expect(result.checks.some(c => !c.passed)).toBe(true);
  });
  it.each(["missing red checks", "missing regrade", "wrong runtime", "reused red run", "unrelated final command", "mutation after passing run"])("refuses %s", async mode => {
    const f = await testAuditFixture();
    if (mode === "mutation after passing run") { writeFileSync(join(f.root, "value.mjs"), "export const value = () => 0;\n"); writeFileSync(join(f.root, "value.mjs"), "export const value = () => 42;\n"); }
    if (mode === "missing red checks") f.report.methodEvidence.redChecks = [];
    if (mode === "missing regrade") delete f.report.methodEvidence.regradeEvidenceIds;
    if (mode === "wrong runtime") f.report.criteria[0]!.parts[0]!.tests[0]!.runtime = { kind: "artifact", repository: "proof", revision: f.checked.repositories[0]!.head, checkpointId: "unobserved", requirementId: "unobserved" };
    if (mode === "reused red run") f.report.methodEvidence.redChecks![0]!.failingRunEvidenceIds[1] = f.report.methodEvidence.redChecks![0]!.failingRunEvidenceIds[0]!;
    if (mode === "unrelated final command") {
      f.call("echo", "Bash", { command: "echo value.test.mjs" }, "value.test.mjs");
      const evidence = await refreshAuditEvidence(f.context); const echo = evidence.find(e => e.locator === "echo")!.evidenceId;
      f.report.methodEvidence.finalRunEvidenceIds = [echo];
      f.assess("assessment", "echo-assessor", [...evidence.filter(e => e.kind === "command").map(e => e.evidenceId)]);
      const updated = await refreshAuditEvidence(f.context); f.report.methodEvidence.assessmentEvidenceIds = [updated.find(e => e.locator === "echo-assessor")!.evidenceId];
    }
    f.saveReport(); const result = await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath }); expect(result.disposition).toBe("unresolved"); expect(f.activity.acceptedResult).toBeUndefined();
    if (mode === "unrelated final command") expect(result.refusal?.reason).toContain("Final suite must rerun each baseline command");
    if (mode === "mutation after passing run") expect(result.refusal?.code).toBe("stale_snapshot");
  });
});

describe("completion phase admission (AC-LOOP-01)", () => {
  it.each(["valid", "original closure", "original scope", "foreign origin", "wrong audit kind", "missing origin marker", "missing criterion", "new criterion", "no implementation gap", "dependency mismatch", "forward dependency", "unreported phase"])("admits only matching append-only completion work: %s", async mode => {
    const f = await fixture();
    const phase = (id: string, dependencies: string) => `# Phase ${id}: Repair value\n\n**Added by delivery audit:** 2026-10-25 ${f.activity.activityId}\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\n${dependencies}\n`;
    const second = `${directory}/phase-2-repair.md`; const third = `${directory}/phase-3-repair.md`;
    writeFileSync(join(f.root, second), phase("2", "1")); writeFileSync(join(f.root, third), phase("3", "2"));
    const paths = [second, third];
    const row = f.report.criteria[0]!;
    row.deliveryStatus = "partly_implemented";
    row.findings = [{ partIds: ["value"], missing: "The existing required return value needs repair.", evidenceIds: [] }];
    f.report.outcome = "completion_phases";
    f.report.completionPhases = [{ id: "2", path: second, originKind: "delivery_audit", originActivityId: f.activity.activityId, criterionKeys: [row.criterionKey], missingBehavior: "Restore the required return value.", dependencies: ["1"] }, { id: "3", path: third, originKind: "delivery_audit", originActivityId: f.activity.activityId, criterionKeys: [row.criterionKey], missingBehavior: "Complete the same existing return-value requirement.", dependencies: ["2"] }];
    let reason = "";
    if (mode === "original closure" || mode === "original scope") {
      const path = `${directory}/phase-1-value.md`; paths.push(path);
      const text = readFileSync(join(f.root, path), "utf8");
      writeFileSync(join(f.root, path), mode === "original closure" ? text.replace("**Closed:** 2026-10-24\n", "") : text.replace("AC-PROOF-01", "AC-PROOF-01\nAdded unrelated scope."));
      reason = "changed original plan";
    }
    if (mode === "foreign origin") { f.report.completionPhases[0]!.originActivityId = "another-audit"; reason = "disagrees with the plan"; }
    if (mode === "wrong audit kind") { f.report.completionPhases[0]!.originKind = "test_audit"; reason = "disagrees with the plan"; }
    if (mode === "missing origin marker") { writeFileSync(join(f.root, second), phase("2", "1").replace("**Added by delivery audit:**", "Added by someone:")); reason = "lacks method origin"; }
    if (mode === "missing criterion") { writeFileSync(join(f.root, second), phase("2", "1").replace("AC-PROOF-01", "No affected criterion named.")); reason = "lacks method origin"; }
    if (mode === "new criterion") { f.report.completionPhases[0]!.criterionKeys = ["proof:new-scope#AC-NEW-01"]; reason = "disagrees with the plan"; }
    if (mode === "no implementation gap") { row.deliveryStatus = "implemented"; row.findings = []; reason = "without implementation gaps"; }
    if (mode === "dependency mismatch") { f.report.completionPhases[0]!.dependencies = []; reason = "dependencies disagree"; }
    if (mode === "forward dependency") { f.report.completionPhases[0]!.dependencies = ["3"]; writeFileSync(join(f.root, second), phase("2", "3")); reason = "dependencies disagree"; }
    if (mode === "unreported phase") { const path = `${directory}/phase-4-unreported.md`; paths.push(path); writeFileSync(join(f.root, path), phase("4", "3")); reason = "exactly the appended plan entries"; }
    commit(f.sandbox, f.root, paths);
    const snapshot = await issueSnapshot(f.context, { ...f.body(), testPaths: [], evidencePaths: [] });
    f.report.checkedSnapshotId = snapshot.snapshotId;
    f.assess("assessment", "repair-assessor", [], { snapshotId: snapshot.snapshotId });
    f.assess("review", "repair-reviewer", [], { snapshotId: snapshot.snapshotId });
    const evidence = await refreshAuditEvidence(f.context);
    row.assessmentEvidenceIds = [evidence.find(entry => entry.locator === "repair-assessor")!.evidenceId];
    f.report.methodEvidence.assessmentEvidenceIds = row.assessmentEvidenceIds;
    f.report.methodEvidence.reviewEvidenceIds = [evidence.find(entry => entry.locator === "repair-reviewer")!.evidenceId];
    f.saveReport();
    const result = await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath });
    expect(result.disposition, result.refusal?.reason).toBe(mode === "valid" ? "recorded" : "unresolved");
    expect(result.nextAction).toBe(mode === "valid" ? "implementation" : "needs_you");
    if (mode !== "valid") { expect(result.refusal?.code).toBe("inconsistent_plan"); expect(result.refusal?.reason).toContain(reason); expect(f.activity.acceptedResult).toBeUndefined(); }
    else expect(readFileSync(join(f.root, directory, "phase-1-value.md"), "utf8")).toContain("**Closed:** 2026-10-24");
  });
});

describe("current requirements and classified content", () => {
  it("keeps delivery current for classified test edits and invalidates both when configuration changes", async () => {
    const f = await fixture(); const files = f.checked.repositories[0]!.files;
    const test = { repository: "proof", path: "value.test.mjs", blob: files["value.test.mjs"]!.blob };
    const config = { repository: "proof", path: "package.json", blob: files["package.json"]!.blob };
    const at = new Date().toISOString(); const output = execFileSync(process.execPath, ["value.test.mjs"], { cwd: f.root, encoding: "utf8" });
    f.call("collection", "Bash", { command: "node value.test.mjs" }, output, at);
    let evidence = await refreshAuditEvidence(f.context); const run = evidence.find(e => e.locator === "collection")!.evidenceId;
    f.assess("test_classification", "classifier", [run], { testPaths: [test], configurationFiles: [config] });
    evidence = await refreshAuditEvidence(f.context);
    const declared = { ...test, configuration: [config], selectors: ["value.test.mjs"], runEvidenceIds: [run], assessmentEvidenceId: evidence.find(e => e.locator === "classifier")!.evidenceId, shared: false };
    const snapshot = await issueSnapshot(f.context, { ...f.body(), testPaths: [declared], evidencePaths: [] });
    f.assess("assessment", "classified-assessment", [], { snapshotId: snapshot.snapshotId }); f.assess("review", "classified-review", [], { snapshotId: snapshot.snapshotId });
    evidence = await refreshAuditEvidence(f.context);
    f.report.checkedSnapshotId = snapshot.snapshotId;
    f.report.criteria[0]!.assessmentEvidenceIds = [evidence.find(e => e.locator === "classified-assessment")!.evidenceId];
    f.report.methodEvidence.assessmentEvidenceIds = f.report.criteria[0]!.assessmentEvidenceIds;
    f.report.methodEvidence.reviewEvidenceIds = [evidence.find(e => e.locator === "classified-review")!.evidenceId];
    f.saveReport(); expect((await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath })).disposition).toBe("recorded");
    writeFileSync(join(f.root, test.path), readFileSync(join(f.root, test.path), "utf8") + "\n// Additional test assertion\n"); commit(f.sandbox, f.root, [test.path]);
    expect(await auditCurrentness(f.context, f.activity)).toEqual({ deliveryCurrent: true, testsCurrent: false });
    writeFileSync(join(f.root, config.path), '{"type":"module","scripts":{"test":"node --test"}}'); commit(f.sandbox, f.root, [config.path]);
    expect(await auditCurrentness(f.context, f.activity)).toEqual({ deliveryCurrent: false, testsCurrent: false });
  });
  it.each([false, true])("admits supersession and post-delivery human work across repositories (partial=%s)", async partial => {
    const source = `# PRD: Audit proof\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Earlier value.** ${partial ? "The function remains exported. " : ""}Old value behavior.\n  - Superseded${partial ? " in part" : ""} by: AC-PROOF-02 in \`docs/prds/proof/proof-prd.md\`.\n- [ ] **AC-PROOF-02 — Current value.** The function returns 42 across both repositories.\n- [ ] **AC-PROOF-03 — Announce later.** After delivery, a person announces the release.\n`;
    const f = await fixture("delivery_audit", { source, companion: true });
    const criteria = f.checked.requirements.criteria; const main = f.checked.repositories.find(r => r.repository === "proof")!; const other = f.checked.repositories.find(r => r.repository === "companion")!;
    const code = [{ repository: "proof", path: "value.mjs", blob: main.files["value.mjs"]!.blob }, { repository: "companion", path: "companion.mjs", blob: other.files["companion.mjs"]!.blob }];
    const part = (index: number, id: string) => ({ id, quote: criteria[index]!.content, startLine: criteria[index]!.startLine, endLine: criteria[index]!.endLine, applicability: "current" as const, code, tests: [] });
    const retired = { ...part(0, "retired"), applicability: "superseded" as const, code: [], replacement: { repository: "proof", path: `${directory}/proof-prd.md`, criterion: "AC-PROOF-02" } };
    const parts = ["retired", ...(partial ? ["remaining"] : []), "value", "announce"];
    f.assess("assessment", "requirements-assessor", [], { criterionKeys: criteria.map(c => c.key), partIds: parts }); f.assess("review", "requirements-reviewer", [], { criterionKeys: criteria.map(c => c.key), partIds: parts });
    const evidence = await refreshAuditEvidence(f.context); const assessId = evidence.find(e => e.locator === "requirements-assessor")!.evidenceId;
    const common = { assessmentEvidenceIds: [assessId], findings: [], blockerIds: [] };
    f.report.scope.criterionKeys = criteria.map(c => c.key);
    f.report.criteria = [{ ...common, criterionKey: criteria[0]!.key, deliveryStatus: partial ? "implemented" : "superseded", parts: [retired, ...(partial ? [part(0, "remaining")] : [])] }, { ...common, criterionKey: criteria[1]!.key, deliveryStatus: "implemented", parts: [part(1, "value")] }, { ...common, criterionKey: criteria[2]!.key, deliveryStatus: "waiting_human", parts: [{ ...part(2, "announce"), code: [], humanActionId: "announcement" }] }];
    f.report.pendingHumanActions = [{ id: "announcement", criterionKey: criteria[2]!.key, action: "Announce the release", requirementQuote: "After delivery, a person announces the release.", beyondDelivery: true }];
    f.report.methodEvidence.assessmentEvidenceIds = [assessId]; f.report.methodEvidence.reviewEvidenceIds = [evidence.find(e => e.locator === "requirements-reviewer")!.evidenceId];
    f.saveReport(); const result = await submitAudit(f.context, { ...f.body(), reportPath: f.activity.reportPath }); expect(result.checks.filter(c => !c.passed)).toEqual([]); expect(result.disposition).toBe("recorded");
    const input = { record: f.record, activity: f.activity, checked: f.checked, current: f.checked, evidence };
    retired.replacement.criterion = "AC-MISSING-99"; expect(() => validateReport(f.report, input)).toThrow(); retired.replacement.criterion = "AC-PROOF-02";
    f.report.criteria[1]!.deliveryStatus = "changed_outside_requirements"; expect(() => validateReport(f.report, input)).toThrow("Changed behavior needs"); f.report.criteria[1]!.deliveryStatus = "implemented";
    if (partial) { f.report.criteria[0]!.parts = [retired]; expect(() => validateReport(f.report, input)).toThrow("Fully superseded row"); }
    writeFileSync(join(f.record.repositories.find(r => r.name === "companion")!.worktreePath, "companion.mjs"), "export const value = 0;\n");
    expect((await auditCurrentness(f.context, f.activity)).deliveryCurrent).toBe(false);
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
