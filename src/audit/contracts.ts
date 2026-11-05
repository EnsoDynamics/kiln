/** Portable audit contracts. Provider observations and private snapshots are engine-owned. */
import type { AgentId, CheckResult } from "../state/records.js";

export type AuditKind = "delivery_audit" | "test_audit";
export interface FileReference { repository: string; path: string; blob: string }
export interface CriterionSource extends FileReference {
  key: string; label: string; startLine: number; endLine: number; content: string; digest: string;
}
export interface RequirementManifest { id: string; repository: string; path: string; criteria: CriterionSource[] }
export interface EvidenceEntry {
  evidenceId: string; provider: AgentId; sessionId: string; run: number;
  conversationId: string; locator: string; capturedAt: string; sourceDigest: string; retainedSource: string;
  kind: "command" | "skill" | "assessment" | "file" | "mutation";
  command?: { invocation: string; cwd: string; startedAt: string; endedAt: string; outcome: "success" | "error"; exitCode?: number; output: string };
  skill?: { name: string; path: string; digest: string };
  assessment?: { task: string; response: string; snapshotId: string; criterionKeys: string[]; partIds: string[]; purpose: "assessment" | "review" | "regrade" | "test_classification"; testPaths: FileReference[]; configurationFiles?: FileReference[]; verificationEvidenceIds?: string[] };
  file?: FileReference;
  mutation?: { at: string; paths: string[] };
}
export interface TestPath extends FileReference {
  configuration: FileReference[]; selectors: string[]; runEvidenceIds: string[]; assessmentEvidenceId: string; shared: boolean;
}
export interface WorkSnapshot {
  id: string; executionId: string; activityId: string; createdAt: string;
  requirements: RequirementManifest; documents: FileReference[];
  plan: { id: string; file: string; closed: boolean; content: string; splitInto?: string[] }[];
  repositories: { repository: string; identity: string; branch: string; head: string; files: Record<string, { blob: string; digest: string; mode: string; changedAtMs: number }> }[];
  testPaths: TestPath[]; evidencePaths: FileReference[];
  deliveryFingerprint: string; testFingerprint: string;
}
export interface Part {
  id: string; quote: string; startLine: number; endLine: number;
  applicability: "current" | "superseded"; replacement?: { repository: string; path: string; criterion: string };
  code: FileReference[]; tests: { file: FileReference; selector: string; runEvidenceIds: string[]; runtime: { kind: "checkout" } | { kind: "artifact"; repository: string; revision: string; checkpointId: string; requirementId: string } }[];
  humanActionId?: string; openPhaseId?: string;
}
export interface CriterionRow {
  criterionKey: string; parts: Part[]; assessmentEvidenceIds: string[];
  findings: { partIds: string[]; missing: string; evidenceIds: string[] }[]; blockerIds: string[];
  deliveryStatus?: "implemented" | "partly_implemented" | "not_implemented" | "waiting_human" | "superseded" | "changed_outside_requirements" | "not_built_yet";
  testAssessment?: { grade: "missing" | "weak" | "adequate" | "strong" } | { status: "not_implemented" | "person_checked" | "not_built_yet" | "superseded" | "changed_outside_requirements" };
}
/** The version-1 report: retained accepted results only; new submissions use version 2. */
export interface AuditReportV1 {
  schemaVersion: 1; executionId: string; activityId: string; kind: AuditKind; round: number; continuationIndex: number;
  scope: { repository: string; path: string; kind: "whole_prd"; manifestId: string; criterionKeys: string[] };
  checkedSnapshotId: string; criteria: CriterionRow[];
  methodEvidence: {
    skillEvidenceId: string; assessmentEvidenceIds: string[]; reviewEvidenceIds: string[];
    baselineRunEvidenceIds?: string[]; finalRunEvidenceIds?: string[]; unrelatedFailures?: { evidenceId: string; reason: string; reviewEvidenceId: string }[]; regradeEvidenceIds?: string[];
    redChecks?: { partIds: string[]; mutationEvidenceIds: string[]; failingRunEvidenceIds: string[]; restorationEvidenceIds: string[]; passingRunEvidenceId?: string; impossibilityReason?: string }[];
  };
  completionPhases: { id: string; path: string; originKind: AuditKind; originActivityId: string; criterionKeys: string[]; missingBehavior: string; dependencies: string[] }[];
  nextTestBatch?: { criterionKeys: string[]; recordPath: string; nextBatch: string };
  pendingHumanActions: { id: string; criterionKey: string; action: string; requirementQuote: string; beyondDelivery: boolean; result?: FileReference }[];
  blockers: { id: string; criterionKeys: string[]; problem: string; requiredAction: string }[];
  outcome: "passed" | "completion_phases" | "continue_test" | "blocked";
}
/**
 * The Kiln-owned report (method-neutral audits, AC-NEUTRAL-01): the outcome the audit reached, never how.
 *
 *   { "schemaVersion": 2, "executionId": "…", "activityId": "…", "kind": "test_audit", "outcome": "passed",
 *     "summary": "Every criterion has adequate tests.", "completionPhases": [], "needsYou": [], "changedImplementation": false }
 */
export interface AuditReportV2 {
  schemaVersion: 2; executionId: string; activityId: string; kind: AuditKind;
  outcome: "passed" | "completion_phases" | "continue_test" | "needs_you";
  summary: string; completionPhases: string[]; needsYou: { problem: string; action: string }[];
  /** Test audits only: whether the audit changed anything other than tests and audit records. */
  changedImplementation?: boolean;
  afterDeliveryActions?: string[];
}
export type AuditReport = AuditReportV1 | AuditReportV2;
/** The phase IDs an accepted report appended, for either report version. */
export function completionPhaseIds(report: AuditReport): string[] {
  return report.schemaVersion === 2 ? report.completionPhases : report.completionPhases.map(phase => phase.id);
}
export interface AuditActivity {
  activityId: string; sequence: number; kind: AuditKind; round: number; continuationIndex: number;
  createdAt: string; sessionIds: string[]; reportPath: string;
  /** Absent only for an audit completed at once under a waived readiness problem (waivers "Audits Marked Complete"). */
  skill?: { name: string; path: string; digest: string };
  snapshots: string[]; attempts: string[]; acceptedResult?: string;
  /** The audit-waiver result in the audit store, when this audit was marked complete (AC-WAIVE-12). */
  waivedResult?: string;
}
export interface AuditState {
  revision: number; policy: "required" | "legacy_complete";
  activities: AuditActivity[]; evidence: string[];
}
export interface AuditResult {
  id: string; activityId: string; reportDigest: string; reportBytes: string; snapshotId?: string;
  artifactEvidence?: string[]; methodRecordDigest?: string; refusal?: { code: AuditRefusal["code"]; status: AuditRefusal["status"]; reason: string; criteria: string[] };
  at: string; revision: number; disposition: "recorded" | "unresolved";
  checks: CheckResult[]; nextAction: "delivery_audit" | "test_audit" | "implementation" | "continue_test" | "needs_you" | "final_delivery";
}
export class AuditRefusal extends Error {
  constructor(public code: "malformed_request" | "outside_execution" | "report_too_large" | "stale_revision" | "wrong_activity" | "busy" | "result_conflict" | "invalid_report" | "stale_snapshot" | "inconsistent_plan" | "missing_evidence" | "evidence_unavailable", message: string, public status: 400 | 403 | 409 | 413 | 422 | 503 = 422, public criteria: string[] = []) { super(message); }
}
export function requireAudit(value: unknown, reason: string, code: AuditRefusal["code"] = "invalid_report"): asserts value {
  if (!value) throw new AuditRefusal(code, reason);
}
