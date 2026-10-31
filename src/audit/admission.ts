import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PrdRecord, SessionRecord, CheckResult } from "../state/records.js";
import type { GitContext } from "../engine/git-reads.js";
import { AuditRefusal, requireAudit, type AuditActivity, type AuditReport, type AuditResult, type EvidenceEntry, type FileReference, type TestPath, type WorkSnapshot } from "./contracts.js";
import { AuditStore, hashBytes, hashValue, REPORT_LIMIT, strictJson } from "./storage.js";
import { assignedPath, captureSnapshot, compareSnapshots, gitText, repositoryFor, phaseScope, staleSnapshotReason } from "./snapshots.js";
import { collectProviderEvidence } from "./provider-evidence.js";
import { validateReport } from "./validate-report.js";

export interface AdmissionContext {
  record: PrdRecord; stateDirectory: string; git: GitContext; env: NodeJS.ProcessEnv; codex: string; signal: AbortSignal;
  session(activity: AuditActivity, id: string): SessionRecord | undefined;
  developmentChecks?(): CheckResult[];
}
export function activeAudit(record: PrdRecord): AuditActivity {
  const activity = record.completionAudits?.activities.at(-1);
  if (!activity) throw new AuditRefusal("wrong_activity", "No audit activity is assigned to this execution.", 409);
  return activity;
}
export function auditEvidence(context: AdmissionContext): EvidenceEntry[] {
  const store = new AuditStore(context.stateDirectory);
  return (context.record.completionAudits?.evidence ?? []).map(id => store.read<EvidenceEntry>(id));
}
export async function refreshAuditEvidence(context: AdmissionContext): Promise<EvidenceEntry[]> {
  const state = context.record.completionAudits!; const activity = activeAudit(context.record); const store = new AuditStore(context.stateDirectory);
  const found = auditEvidence(context); const ids = new Set(found.map(e => e.evidenceId));
  requireAudit(activity.sessionIds.length, "Audit has no assigned provider session.", "missing_evidence");
  for (const id of activity.sessionIds) {
    const session = context.session(activity, id); requireAudit(session && session.activityId === activity.activityId && session.kind === activity.kind, `Audit session ${id} is missing or belongs to other work.`, "missing_evidence");
    for (const entry of await collectProviderEvidence({ ...context, activity, session })) if (!ids.has(entry.evidenceId)) { state.evidence.push(store.put(entry)); ids.add(entry.evidenceId); found.push(entry); }
  }
  return found;
}
function request(context: AdmissionContext, body: Record<string, unknown>): AuditActivity {
  if (typeof body.executionId !== "string" || typeof body.activityId !== "string" || !Number.isSafeInteger(body.revision)) throw new AuditRefusal("malformed_request", "Supply executionId, activityId and integer revision.", 400);
  const activity = activeAudit(context.record);
  if (body.executionId !== context.record.executionId) throw new AuditRefusal("outside_execution", "Request belongs to another execution.", 403);
  if (body.activityId !== activity.activityId) throw new AuditRefusal("wrong_activity", "Request belongs to another activity.", 409);
  return activity;
}
function revision(context: AdmissionContext, body: Record<string, unknown>) {
  if (body.revision !== context.record.completionAudits!.revision) throw new AuditRefusal("stale_revision", "Read kiln audit status for the current revision.", 409);
}
export async function auditStatus(context: AdmissionContext, cursor?: string) {
  const activity = activeAudit(context.record); const state = context.record.completionAudits!;
  const entries = await refreshAuditEvidence(context); const store = new AuditStore(context.stateDirectory);
  let offset = 0;
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { activity: string; offset: number };
      requireAudit(decoded.activity === activity.activityId && Number.isSafeInteger(decoded.offset) && decoded.offset >= 0 && decoded.offset <= entries.length, "Invalid evidence cursor."); offset = decoded.offset;
    } catch { throw new AuditRefusal("malformed_request", "Invalid evidence cursor.", 400); }
  }
  const latest = activity.snapshots.at(-1); const snapshot = latest ? store.read<WorkSnapshot>(latest) : undefined;
  return { executionId: context.record.executionId, activityId: activity.activityId, kind: activity.kind, round: activity.round, continuationIndex: activity.continuationIndex, revision: state.revision, requiredReportPath: activity.reportPath, currentSnapshot: snapshot, acceptedResults: state.activities.flatMap(a => a.acceptedResult ? [{ activityId: a.activityId, resultId: a.acceptedResult }] : []), outstandingChecks: activity.acceptedResult ? [] : ["Audit result recorded"], evidence: entries.slice(offset, offset + 100).map(({ command, assessment, ...entry }) => ({ ...entry, retainedSource: undefined, ...(command ? { command: { ...command, output: undefined } } : {}), ...(assessment ? { assessment: { ...assessment, task: undefined, response: undefined } } : {}) })), ...(offset + 100 < entries.length ? { nextCursor: Buffer.from(JSON.stringify({ activity: activity.activityId, offset: offset + 100 })).toString("base64url") } : {}) };
}

export async function issueSnapshot(context: AdmissionContext, body: Record<string, unknown>) {
  const activity = request(context, body); revision(context, body);
  if (activity.acceptedResult) throw new AuditRefusal("result_conflict", "This activity already has an accepted result.", 409);
  requireAudit(Array.isArray(body.testPaths) && Array.isArray(body.evidencePaths), "Snapshot needs exact testPaths and evidencePaths arrays.");
  const evidence = await refreshAuditEvidence(context);
  const snapshot = await captureSnapshot({ ...context, activity, evidence, now: new Date().toISOString() }, body.testPaths as TestPath[], body.evidencePaths as FileReference[]);
  activity.snapshots.push(new AuditStore(context.stateDirectory).put(snapshot));
  context.record.completionAudits!.revision++;
  return { revision: context.record.completionAudits!.revision, snapshotId: snapshot.id, requirements: snapshot.requirements, plan: snapshot.plan, repositories: snapshot.repositories };
}

export async function repositoryChecks(context: AdmissionContext): Promise<CheckResult[]> {
  const committed: string[] = []; const pushed: string[] = [];
  for (const repo of context.record.repositories) {
    const status = await gitText(context.git, repo, ["status", "--porcelain"]);
    if (status.trim()) committed.push(`${repo.name}: uncommitted or untracked work remains.`);
    const branch = (await gitText(context.git, repo, ["branch", "--show-current"])).trim();
    if (branch !== context.record.settings.featureBranch) committed.push(`${repo.name}: assigned branch changed.`);
    const head = (await gitText(context.git, repo, ["rev-parse", "HEAD"])).trim();
    const origin = await gitText(context.git, repo, ["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
    if (origin.trim().split(/\s/)[0] !== head) pushed.push(`${repo.name}: current head is not pushed to its assigned branch.`);
  }
  return [{ name: "Everything committed", passed: !committed.length, facts: committed.length ? committed : ["Every assigned worktree is clean."] }, { name: "Pushed", passed: !pushed.length, facts: pushed.length ? pushed : ["Every assigned head matches origin."] }];
}

/** Artifact assertions must resolve to retained development observations and the checked tree. */
async function checkArtifacts(context: AdmissionContext, report: AuditReport, checked: WorkSnapshot) {
  const seen = new Set<string>(); const retained: string[] = [];
  for (const test of report.criteria.flatMap(r => r.parts).flatMap(p => p.tests)) {
    if (test.runtime.kind !== "artifact") continue;
    const runtime = test.runtime; const key = hashValue(runtime);
    const repo = repositoryFor(context.record, runtime.repository);
    const checkpoint = context.record.developmentDelivery?.checkpoints.find(c => c.id === runtime.checkpointId && c.executionId === context.record.executionId && c.target.repository.toLowerCase() === `github.com/${repo.github}`.toLowerCase() && !c.supersededBy);
    const fact = checkpoint?.evidence.find(e => e.requirementId === runtime.requirementId && e.status === "success" && e.revision === runtime.revision);
    requireAudit(checkpoint && fact && checkpoint.requirements.some(r => r.id === fact.requirementId && r.purpose === "current_artifact") && fact.observedAt >= checked.createdAt && fact.occurredAt >= checked.createdAt, "Artifact needs current engine-observed development evidence.", "missing_evidence");
    for (const id of test.runEvidenceIds) {
      const command = auditEvidence(context).find(e => e.evidenceId === id)?.command;
      requireAudit(command && fact.occurredAt <= command.startedAt && checkpoint.requirements.some(r => r.purpose === "verification" && r.match.kind === "command" && r.match.invocation === command.invocation && r.match.cwd === command.cwd), "Test command is not bound to the observed artifact's configured verification target.", "missing_evidence");
    }
    if (seen.has(key)) continue; seen.add(key);
    const raw = JSON.parse(readFileSync(join(context.stateDirectory, "delivery-evidence", `${fact.rawDigest}.json`), "utf8")) as unknown;
    requireAudit(hashValue(raw) === fact.rawDigest && /^[a-f0-9]{40,64}$/.test(runtime.revision), "Artifact evidence source is missing or changed.", "missing_evidence");
    retained.push(new AuditStore(context.stateDirectory).put({ checkpointId: checkpoint.id, fact, raw }));
    const tree = await gitText(context.git, repo, ["ls-tree", "-r", "-z", runtime.revision]);
    const files = checked.repositories.find(r => r.repository === repo.name)!.files;
    const actual = new Map(tree.split("\0").filter(Boolean).map(line => { const m = /^(\d+) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(line); requireAudit(m, "Unsupported artifact source tree."); return [m[3]!, { blob: m[2]!, mode: m[1]! }] as const; }));
    const ignored = (path: string) => repo.name === context.record.repository.name && (context.record.completionAudits!.activities.some(a => a.reportPath === path) || path === `${context.record.prdDirectory}/test-audit.md`);
    for (const path of new Set([...Object.keys(files), ...actual.keys()])) {
      if (ignored(path)) continue;
      const phase = checked.plan.find(p => repo.name === context.record.repository.name && p.file === path);
      requireAudit(files[path] && actual.has(path), `Artifact source differs at ${repo.name}/${path}.`, "stale_snapshot");
      if (phase) requireAudit(phaseScope(await gitText(context.git, repo, ["show", `${runtime.revision}:${path}`])) === phase.content, "Artifact phase scope differs.", "stale_snapshot");
      else requireAudit(files[path]!.blob === actual.get(path)?.blob && files[path]!.mode === actual.get(path)?.mode, `Artifact source differs at ${repo.name}/${path}.`, "stale_snapshot");
    }
  }
  return retained;
}

/** Idempotency precedes revision checking, so a disconnected successful caller can recover. */
export async function submitAudit(context: AdmissionContext, body: Record<string, unknown>): Promise<AuditResult> {
  const activity = request(context, body); const state = context.record.completionAudits!; const store = new AuditStore(context.stateDirectory);
  if (body.reportPath !== activity.reportPath) throw new AuditRefusal("outside_execution", "Only the assigned audit report path may be submitted.", 403);
  let path: string; let bytes: string;
  try {
    path = assignedPath(repositoryFor(context.record, context.record.repository.name), activity.reportPath);
    if (statSync(path).size > REPORT_LIMIT) throw new AuditRefusal("report_too_large", `Maximum report size is ${REPORT_LIMIT} bytes.`, 413);
    bytes = readFileSync(path, "utf8");
  } catch (error) {
    if (activity.acceptedResult) throw error;
    revision(context, body);
    const refused = error instanceof AuditRefusal ? error : (error as NodeJS.ErrnoException).code === "ENOENT" ? new AuditRefusal("missing_evidence", `Cannot read assigned report: ${(error as Error).message}`) : new AuditRefusal("evidence_unavailable", `Cannot read assigned report: ${(error as Error).message}`, 503);
    const result: AuditResult = { id: "", activityId: activity.activityId, reportDigest: hashBytes(""), reportBytes: "", at: new Date().toISOString(), revision: state.revision + 1, disposition: "unresolved", nextAction: "needs_you", checks: [{ name: refused.code, passed: false, facts: [refused.message] }], refusal: { code: refused.code, status: refused.status, reason: refused.message, criteria: refused.criteria } };
    result.id = hashValue({ ...result, id: undefined }); activity.attempts.push(store.put(result)); state.revision = result.revision; return result;
  }
  const reportDigest = hashBytes(bytes);
  const attempts = activity.attempts.map(id => store.read<AuditResult>(id));
  const identical = attempts.findLast(a => a.reportDigest === reportDigest && a.disposition === "recorded");
  if (identical) return identical;
  if (activity.acceptedResult) throw new AuditRefusal("result_conflict", "A different result is already accepted for this activity.", 409);
  revision(context, body);
  const checks: CheckResult[] = []; let refusal: AuditResult["refusal"]; let methodRecordDigest: string | undefined; let artifactEvidence: string[] = []; let nextAction: AuditResult["nextAction"] = "needs_you"; let snapshotId: string | undefined;
  try {
    const raw = strictJson(bytes); const snapshotKey = (raw as { checkedSnapshotId?: unknown })?.checkedSnapshotId;
    const checked = activity.snapshots.map(id => store.read<WorkSnapshot>(id)).find(s => s.id === snapshotKey);
    requireAudit(checked, "Checked snapshot is missing or was never issued for this activity.", "stale_snapshot"); snapshotId = checked.id;
    const evidence = await refreshAuditEvidence(context);
    for (const source of new Set(evidence.map(entry => entry.retainedSource))) store.bytes(source);
    const current = await captureSnapshot({ ...context, activity, evidence, now: new Date().toISOString() }, checked.testPaths, checked.evidencePaths);
    const equality = compareSnapshots(checked, current);
    if (!equality.deliveryCurrent || activity.kind === "test_audit" && !equality.testsCurrent) throw new AuditRefusal("stale_snapshot", staleSnapshotReason(context.record, checked, current, activity.kind === "test_audit"));
    const validated = validateReport(raw, { record: context.record, activity, checked, initial: store.read<WorkSnapshot>(activity.snapshots[0]!), current, evidence });
    artifactEvidence = await checkArtifacts(context, validated.report, checked);
    if (activity.kind === "test_audit") methodRecordDigest = store.putBytes(readFileSync(assignedPath(repositoryFor(context.record, context.record.repository.name), `${context.record.prdDirectory}/test-audit.md`), "utf8"));
    checks.push({ name: "Audit result recorded", passed: true, facts: ["All manifest criteria and observed evidence references checked."] });
    checks.push(...await repositoryChecks(context));
    checks.push(...context.developmentChecks?.() ?? []);
    nextAction = validated.nextAction;
    if (nextAction === "needs_you") checks.push({ name: "Audit work resolved", passed: false, facts: [...validated.report.blockers.map(b => `${b.criterionKeys.join(", ")}: ${b.problem} ${b.requiredAction}`), ...validated.report.pendingHumanActions.filter(a => !a.beyondDelivery && !a.result).map(a => `${a.criterionKey}: ${a.action}`)] });
    if (validated.report.outcome === "continue_test") {
      const previous = state.activities.filter(a => a.kind === "test_audit" && a.round === activity.round && a.continuationIndex < activity.continuationIndex).at(-1);
      if (previous?.acceptedResult) {
        const previousReport = JSON.parse(store.read<AuditResult>(previous.acceptedResult).reportBytes) as typeof validated.report;
        const progress = (report: typeof validated.report) => report.criteria.map(row => ({ key: row.criterionKey, testAssessment: row.testAssessment, uncoveredParts: row.parts.filter(p => row.findings.some(f => f.partIds.includes(p.id))).map(p => `${p.startLine}:${p.endLine}:${p.quote}`).sort(), code: row.parts.flatMap(p => p.code).map(f => `${f.repository}:${f.path}:${f.blob}`).sort(), tests: row.parts.flatMap(p => p.tests).map(t => `${t.file.repository}:${t.file.path}:${t.file.blob}:${t.selector}`).sort() })).sort((a, b) => a.key.localeCompare(b.key));
        requireAudit(hashValue(progress(previousReport)) !== hashValue(progress(validated.report)), "Test continuation made no recorded progress.");
      }
    }
    // Re-read after remote/history work: changes while admission runs cannot be accepted.
    const final = await captureSnapshot({ ...context, activity, evidence, now: new Date().toISOString() }, checked.testPaths, checked.evidencePaths);
    requireAudit(compareSnapshots(current, final).testsCurrent && hashValue(current.repositories.map(r => r.head)) === hashValue(final.repositories.map(r => r.head)) && hashBytes(readFileSync(path, "utf8")) === reportDigest, "Work or report changed during admission.", "stale_snapshot");
  } catch (error) {
    if (!(error instanceof AuditRefusal)) throw error;
    refusal = { code: error.code, status: error.status, reason: error.message, criteria: error.criteria };
    checks.push({ name: error.code, passed: false, facts: [error.message] });
  }
  const disposition = checks.every(c => c.passed) ? "recorded" : "unresolved";
  const revisionNumber = state.revision + 1;
  const result: AuditResult = { id: "", activityId: activity.activityId, reportDigest, reportBytes: bytes, ...(snapshotId ? { snapshotId } : {}), artifactEvidence, ...(refusal ? { refusal } : {}), ...(methodRecordDigest ? { methodRecordDigest } : {}), at: new Date().toISOString(), revision: revisionNumber, disposition, checks, nextAction: disposition === "recorded" ? nextAction : "needs_you" };
  result.id = hashValue({ ...result, id: undefined });
  const reference = store.put(result); activity.attempts.push(reference); if (disposition === "recorded") activity.acceptedResult = reference;
  state.revision = revisionNumber; return result;
}

/** The scheduler calls this for the latest gate only; historical shared method records may evolve. */
export async function auditCurrentness(context: AdmissionContext, activity: AuditActivity) {
  const store = new AuditStore(context.stateDirectory); requireAudit(activity.acceptedResult, "Audit result has not been accepted.", "missing_evidence");
  const result = store.read<AuditResult>(activity.acceptedResult);
  const checked = activity.snapshots.map(id => store.read<WorkSnapshot>(id)).find(s => s.id === result.snapshotId); requireAudit(checked, "Accepted snapshot is missing.", "missing_evidence");
  const portable = readFileSync(assignedPath(repositoryFor(context.record, context.record.repository.name), activity.reportPath), "utf8");
  requireAudit(hashBytes(portable) === result.reportDigest, "Latest portable audit report changed.", "stale_snapshot");
  for (const id of result.artifactEvidence ?? []) store.bytes(id);
  if (activity.kind === "test_audit") {
    requireAudit(result.methodRecordDigest, "Accepted method record digest is missing.", "missing_evidence");
    store.bytes(result.methodRecordDigest);
    const method = readFileSync(assignedPath(repositoryFor(context.record, context.record.repository.name), `${context.record.prdDirectory}/test-audit.md`), "utf8");
    requireAudit(hashBytes(method) === result.methodRecordDigest, "Latest test-audit.md differs from its accepted record.", "stale_snapshot");
  }
  const evidence = auditEvidence(context); for (const source of new Set(evidence.map(entry => entry.retainedSource))) store.bytes(source);
  const current = await captureSnapshot({ ...context, activity, evidence, now: new Date().toISOString(), retainedClassification: true }, checked.testPaths, checked.evidencePaths);
  return compareSnapshots(checked, current);
}
