/**
 * Version-2 report validation (method-neutral audits, AC-NEUTRAL-01..05): Kiln checks its own facts,
 * the outcome the audit reached and whether the phase plan routes with it. How the audit was done
 * belongs to the installed skill and is never inspected here.
 */
import type { PrdRecord } from "../state/records.js";
import { AuditRefusal, requireAudit, type AuditActivity, type AuditReportV2, type AuditResult, type WorkSnapshot } from "./contracts.js";
import { requirementsDocumentFilter } from "./snapshots.js";
import { effectiveRecordedClosed } from "../engine/waivers.js";
import type { PersonItem } from "./person-items.js";

const OUTCOMES = ["passed", "completion_phases", "continue_test", "needs_you"];
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonempty);
export const REPORT_FIELDS = "schemaVersion 2, executionId, activityId, kind, outcome (passed, completion_phases, continue_test or needs_you), summary, completionPhases (appended phase IDs), needsYou ({id?, problem, action}[]; with passed, only outstanding items listed again by id, and none when final delivery follows), settled ({id, how}[], optional), changedImplementation (test audits) and optional afterDeliveryActions";
export interface ValidationContext { record: PrdRecord; activity: AuditActivity; initial: WorkSnapshot; current: WorkSnapshot; outstanding: PersonItem[] }

export function validateReport(raw: unknown, context: ValidationContext): { report: AuditReportV2; nextAction: AuditResult["nextAction"] } {
  try { return validate(raw as AuditReportV2, context); }
  catch (error) { if (error instanceof AuditRefusal) throw error; throw new AuditRefusal("invalid_report", `Malformed audit report: ${(error as Error).message}`); }
}

function validate(report: AuditReportV2, { record, activity, initial, current, outstanding }: ValidationContext): { report: AuditReportV2; nextAction: AuditResult["nextAction"] } {
  requireAudit(report && typeof report === "object" && !Array.isArray(report), "The audit report must be a JSON object.");
  requireAudit((report.schemaVersion as number) === 2, `Unsupported audit report schemaVersion ${JSON.stringify(report.schemaVersion)}. Write the version-2 report: ${REPORT_FIELDS}.`);
  requireAudit(report.executionId === record.executionId && report.activityId === activity.activityId && report.kind === activity.kind, "Report identity differs from the assigned audit activity.");
  requireAudit(OUTCOMES.includes(report.outcome), `Unknown audit outcome ${JSON.stringify(report.outcome)}; use passed, completion_phases, continue_test or needs_you.`);
  requireAudit(nonempty(report.summary), "The report needs a non-empty summary.");
  requireAudit(strings(report.completionPhases) && new Set(report.completionPhases).size === report.completionPhases.length, "completionPhases must list distinct appended phase IDs ([] when none).");
  requireAudit(Array.isArray(report.needsYou) && report.needsYou.every(item => item && nonempty(item.problem) && nonempty(item.action) && (item.id === undefined || nonempty(item.id))), "needsYou must be a list of {problem, action}, with id when listing an outstanding item again ([] when none).");
  requireAudit(report.settled === undefined || (Array.isArray(report.settled) && report.settled.every(item => item && nonempty(item.id) && nonempty(item.how))), "settled must be a list of {id, how}.");
  requireAudit(report.afterDeliveryActions === undefined || strings(report.afterDeliveryActions), "afterDeliveryActions must be a list of strings.");
  if (activity.kind === "test_audit") requireAudit(typeof report.changedImplementation === "boolean", "A test audit report needs changedImplementation: true or false.");
  else requireAudit(report.changedImplementation === undefined, "Only a test audit reports changedImplementation.");
  if (report.outcome === "needs_you") requireAudit(report.needsYou.length > 0, "A needs_you report must say what a person must decide in needsYou.");
  // A passing report that leads to another audit carries still-open items to it, since that audit does not depend
  // on them (AC-NEUTRAL-03); one that leads to final delivery, a test audit that changed only tests, lists none.
  if (report.outcome === "passed") {
    const toFinalDelivery = activity.kind === "test_audit" && !report.changedImplementation;
    if (toFinalDelivery) requireAudit(!report.needsYou.length, "A passing test audit that changed only tests lists nothing in needsYou, since final delivery follows; use needs_you when a person is needed, or settled for an earlier item that is settled.");
    else requireAudit(report.needsYou.every(item => item.id !== undefined), "A passing report lists in needsYou only outstanding items still open, each with its id; report needs_you for a new item a person must resolve.");
  }
  // Every item an earlier audit left for a person is accounted for: open again, or settled (AC-NEUTRAL-03).
  const known = new Map(outstanding.map(item => [item.id, item]));
  const named = [...report.needsYou.flatMap(item => item.id === undefined ? [] : [item.id]), ...(report.settled ?? []).map(item => item.id)];
  const unknown = named.filter(id => !known.has(id));
  requireAudit(!unknown.length, `No outstanding item ${unknown.join(", ")}; outstanding: ${outstanding.map(item => item.id).join(", ") || "none"}.`);
  const repeated = named.filter((id, index) => named.indexOf(id) !== index);
  requireAudit(!repeated.length, `Each outstanding item is listed once, in needsYou or settled; repeated: ${[...new Set(repeated)].join(", ")}.`);
  const missing = outstanding.filter(item => !named.includes(item.id));
  requireAudit(!missing.length, `Account for every item earlier audits left for a person, in needsYou with its id when still open or in settled with how: missing ${missing.map(item => `${item.id} (${item.problem})`).join("; ")}.`);

  // The audit may append phases; it never rewrites the plan it started from (AC-NEUTRAL-04).
  requireAudit(initial.plan.every((phase, index) => { const now = current.plan[index]; return now && now.id === phase.id && now.file === phase.file && now.closed === phase.closed && now.content === phase.content && JSON.stringify(now.splitInto ?? []) === JSON.stringify(phase.splitInto ?? []); }), "The audit changed an original phase's identity, order, scope or closure; it may only append phases.", "inconsistent_plan");
  const appended = current.plan.slice(initial.plan.length);
  requireAudit(JSON.stringify(appended.map(phase => phase.id).sort()) === JSON.stringify([...report.completionPhases].sort()), `completionPhases must name exactly the phases this audit appended (${appended.map(phase => phase.id).join(", ") || "none"}).`, "inconsistent_plan");
  requireAudit(appended.every(phase => !phase.closed), "An appended completion phase is already closed.", "inconsistent_plan");
  // A leaf closed by waiver or skipped under a waived plan problem counts as closed for routing
  // (AC-WAIVE-04, AC-WAIVE-09); the immutability rule above still compares the documents' own Closed lines.
  const open = current.plan.filter(phase => !phase.splitInto && !effectiveRecordedClosed(record, phase));
  if (report.outcome === "passed") requireAudit(!appended.length && !open.length, `A passing audit leaves no open phase; open: ${open.map(phase => phase.id).join(", ")}.`, "inconsistent_plan");
  if (report.outcome === "completion_phases") requireAudit(appended.length > 0, "A completion_phases report must append at least one phase to the plan.", "inconsistent_plan");
  if (report.outcome === "continue_test") {
    requireAudit(activity.kind === "test_audit", "Only a test audit saves test work for a continuation.");
    requireAudit(!appended.length && !open.length, "A test continuation leaves no open or appended phase; report completion_phases instead.", "inconsistent_plan");
    // A continuation must change the work, or it would start an identical session forever (AC-NEUTRAL-05).
    // The first test audit may only write its record; a continuation of it must change the work itself.
    const material = activity.continuationIndex > 1 ? requirementsDocumentFilter(initial) : () => false;
    requireAudit(changedOtherThan(initial, current, (repository, path) => `${repository}:${path}` === `${record.repository.name}:${activity.reportPath}` || material(repository, path)), activity.continuationIndex > 1 ? "Test continuation made no progress: nothing but Markdown beside a PRD and this report changed since it started." : "Test continuation made no progress: no file other than this report changed since the audit started.");
  }
  // A claimed implementation change sends the work back through a delivery audit, so it must be real.
  if (report.changedImplementation) requireAudit(changedOtherThan(initial, current, (repository, path) => `${repository}:${path}` === `${record.repository.name}:${activity.reportPath}` || requirementsDocumentFilter(initial)(repository, path)), "changedImplementation is true, but nothing outside Markdown beside a PRD and this report changed since the audit started.");
  const nextAction: AuditResult["nextAction"] = report.outcome === "needs_you" ? "needs_you"
    : report.outcome === "completion_phases" ? "implementation"
    : activity.kind === "test_audit" && report.changedImplementation ? "delivery_audit"
    : report.outcome === "continue_test" ? "continue_test"
    : activity.kind === "delivery_audit" ? "test_audit" : "final_delivery";
  return { report, nextAction };
}

function changedOtherThan(before: WorkSnapshot, after: WorkSnapshot, excluded: (repository: string, path: string) => boolean): boolean {
  for (const repository of new Set([...before.repositories, ...after.repositories].map(repo => repo.repository))) {
    const old = before.repositories.find(repo => repo.repository === repository)?.files ?? {};
    const now = after.repositories.find(repo => repo.repository === repository)?.files ?? {};
    for (const path of new Set([...Object.keys(old), ...Object.keys(now)])) {
      if (excluded(repository, path)) continue;
      if (old[path]?.blob !== now[path]?.blob || old[path]?.mode !== now[path]?.mode) return true;
    }
  }
  return false;
}
