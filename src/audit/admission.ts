import { readFileSync, statSync } from "node:fs";
import type { PrdRecord, CheckResult } from "../state/records.js";
import type { GitContext } from "../engine/git-reads.js";
import { AuditRefusal, requireAudit, type AuditActivity, type AuditResult, type WorkSnapshot } from "./contracts.js";
import { AuditStore, hashBytes, hashValue, REPORT_LIMIT, strictJson } from "./storage.js";
import { assignedPath, captureSnapshot, compareSnapshots, gitText, repositoryFor } from "./snapshots.js";
import { REPORT_FIELDS, validateReport } from "./validate-report.js";

export const RESULT_CHECK = "Audit result recorded";
export interface AdmissionContext {
  record: PrdRecord; stateDirectory: string; git: GitContext; signal: AbortSignal;
  developmentChecks?(): CheckResult[];
}
export function activeAudit(record: PrdRecord): AuditActivity {
  const activity = record.completionAudits?.activities.at(-1);
  if (!activity) throw new AuditRefusal("wrong_activity", "No audit activity is assigned to this execution.", 409);
  return activity;
}
export interface AuditProblem { code: string; reason: string; criteria: string[]; at: string }
/**
 * What a resumed audit must correct: the latest attempt's refusal, or its failed checks when the report
 * validated but delivery checks did not pass, while nothing has been accepted.
 */
export function latestAuditRefusal(stateDirectory: string, activity: AuditActivity, store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): AuditProblem | undefined {
  const latest = activity.attempts.at(-1);
  if (activity.acceptedResult || !latest) return undefined;
  const result = store.read<AuditResult>(latest);
  if (result.refusal) return { code: result.refusal.code, reason: result.refusal.reason, criteria: result.refusal.criteria ?? [], at: result.at };
  const failed = result.checks.filter(check => !check.passed);
  return failed.length ? { code: "unresolved_checks", reason: failed.map(check => `${check.name}: ${check.facts.join(" ")}`).join("; "), criteria: [], at: result.at } : undefined;
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
export function auditStatus(context: AdmissionContext) {
  const activity = activeAudit(context.record); const state = context.record.completionAudits!;
  const latestRefusal = latestAuditRefusal(context.stateDirectory, activity);
  return { executionId: context.record.executionId, activityId: activity.activityId, kind: activity.kind, round: activity.round, continuationIndex: activity.continuationIndex, revision: state.revision, requiredReportPath: activity.reportPath, reportContract: REPORT_FIELDS, acceptedResults: state.activities.flatMap(a => a.acceptedResult ? [{ activityId: a.activityId, resultId: a.acceptedResult }] : []), outstandingChecks: activity.acceptedResult ? [] : [RESULT_CHECK], ...(latestRefusal ? { latestRefusal } : {}) };
}

/** Retired (AC-NEUTRAL-10): Kiln captures snapshots itself, so a request changes nothing. */
export function issueSnapshot(): never {
  throw new AuditRefusal("malformed_request", "kiln audit snapshot is retired: Kiln captures the work itself when the report is submitted. Commit and push the report, then run kiln audit submit.", 400);
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
    const missing = error instanceof AuditRefusal ? error.code === "missing_evidence" : (error as NodeJS.ErrnoException).code === "ENOENT";
    const refused = missing ? new AuditRefusal("missing_evidence", `No audit report at ${activity.reportPath} yet. The audit session writes, commits and pushes it when the audit ends.`) : error instanceof AuditRefusal ? error : new AuditRefusal("evidence_unavailable", `Cannot read the audit report at ${activity.reportPath}: ${(error as Error).message}`, 503);
    const result: AuditResult = { id: "", activityId: activity.activityId, reportDigest: hashBytes(""), reportBytes: "", at: new Date().toISOString(), revision: state.revision + 1, disposition: "unresolved", nextAction: "needs_you", checks: [{ name: RESULT_CHECK, passed: false, facts: [refused.message] }], refusal: { code: refused.code, status: refused.status, reason: refused.message, criteria: refused.criteria } };
    result.id = hashValue({ ...result, id: undefined }); activity.attempts.push(store.put(result)); state.revision = result.revision; return result;
  }
  const reportDigest = hashBytes(bytes);
  const attempts = activity.attempts.map(id => store.read<AuditResult>(id));
  const identical = attempts.findLast(a => a.reportDigest === reportDigest && a.disposition === "recorded");
  if (identical) return identical;
  if (activity.acceptedResult) throw new AuditRefusal("result_conflict", "A different result is already accepted for this activity.", 409);
  revision(context, body);
  const checks: CheckResult[] = []; let refusal: AuditResult["refusal"]; let nextAction: AuditResult["nextAction"] = "needs_you"; let snapshotId: string | undefined;
  try {
    const raw = strictJson(bytes);
    // Kiln captures what the audit left behind; the session never declares a snapshot (AC-NEUTRAL-02).
    const current = await captureSnapshot({ ...context, activity, now: new Date().toISOString() });
    activity.snapshots.push(store.put(current)); snapshotId = current.id;
    const validated = validateReport(raw, { record: context.record, activity, initial: store.read<WorkSnapshot>(activity.snapshots[0]!), current });
    checks.push({ name: RESULT_CHECK, passed: true, facts: [`Outcome ${validated.report.outcome}: ${validated.report.summary}`.slice(0, 600)] });
    checks.push(...await repositoryChecks(context));
    checks.push(...context.developmentChecks?.() ?? []);
    nextAction = validated.nextAction;
    if (nextAction === "needs_you") checks.push({ name: "Audit work resolved", passed: false, facts: validated.report.needsYou.map(item => `${item.problem} ${item.action}`) });
    // Re-read after remote work: changes while admission runs cannot be accepted.
    const final = await captureSnapshot({ ...context, activity, now: new Date().toISOString() });
    requireAudit(hashValue(current.repositories) === hashValue(final.repositories) && hashBytes(readFileSync(path, "utf8")) === reportDigest, "Work or report changed during admission.", "stale_snapshot");
  } catch (error) {
    if (!(error instanceof AuditRefusal)) throw error;
    refusal = { code: error.code, status: error.status, reason: error.message, criteria: error.criteria };
    // Shown under "Kiln continues when": the unmet condition, with the refusal as its reason.
    for (let i = checks.length - 1; i >= 0; i--) if (checks[i]!.name === RESULT_CHECK) checks.splice(i, 1);
    checks.push({ name: RESULT_CHECK, passed: false, facts: [error.message] });
  }
  const disposition = checks.every(c => c.passed) ? "recorded" : "unresolved";
  const revisionNumber = state.revision + 1;
  const result: AuditResult = { id: "", activityId: activity.activityId, reportDigest, reportBytes: bytes, ...(snapshotId ? { snapshotId } : {}), ...(refusal ? { refusal } : {}), at: new Date().toISOString(), revision: revisionNumber, disposition, checks, nextAction: disposition === "recorded" ? nextAction : "needs_you" };
  result.id = hashValue({ ...result, id: undefined });
  const reference = store.put(result); activity.attempts.push(reference); if (disposition === "recorded") activity.acceptedResult = reference;
  state.revision = revisionNumber; return result;
}

/** The snapshot Kiln took when it accepted the activity's result. */
export function acceptedSnapshot(stateDirectory: string, activity: AuditActivity): WorkSnapshot {
  const store = new AuditStore(stateDirectory); requireAudit(activity.acceptedResult, "Audit result has not been accepted.", "missing_evidence");
  const result = store.read<AuditResult>(activity.acceptedResult);
  const checked = activity.snapshots.map(id => store.read<WorkSnapshot>(id)).find(s => s.id === result.snapshotId); requireAudit(checked, "Accepted snapshot is missing.", "missing_evidence");
  return checked;
}

/** The scheduler calls this for the latest gate only. */
export async function auditCurrentness(context: AdmissionContext, activity: AuditActivity) {
  const store = new AuditStore(context.stateDirectory); const checked = acceptedSnapshot(context.stateDirectory, activity);
  const result = store.read<AuditResult>(activity.acceptedResult!);
  const portable = readFileSync(assignedPath(repositoryFor(context.record, context.record.repository.name), activity.reportPath), "utf8");
  requireAudit(hashBytes(portable) === result.reportDigest, "Latest portable audit report changed.", "stale_snapshot");
  const current = await captureSnapshot({ ...context, activity, now: new Date().toISOString(), retainedClassification: true }, checked.testPaths);
  return compareSnapshots(context.record, checked, current);
}
