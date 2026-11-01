import { dependencyIds } from "../plan/phase-plan.js";
import { readFileSync } from "node:fs";
import type { PrdRecord } from "../state/records.js";
import { AuditRefusal, requireAudit, type AuditActivity, type AuditReport, type AuditResult, type EvidenceEntry, type FileReference, type WorkSnapshot, type CriterionSource } from "./contracts.js";
import { assignedPath, insideRepository, fileInSnapshot, repositoryFor, requirementManifest, requirementsDocumentFilter } from "./snapshots.js";
import { hashValue } from "./storage.js";

const DELIVERY = ["implemented", "partly_implemented", "not_implemented", "waiting_human", "superseded", "changed_outside_requirements", "not_built_yet"];
const TEST_STATUS = ["not_implemented", "person_checked", "not_built_yet", "superseded", "changed_outside_requirements"];
const GRADES = ["missing", "weak", "adequate", "strong"];
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string" && x.length > 0);
const unique = (values: string[], what: string) => requireAudit(new Set(values).size === values.length, `Duplicate ${what}.`);
const nonempty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
export interface ValidationContext { record: PrdRecord; activity: AuditActivity; checked: WorkSnapshot; initial?: WorkSnapshot; current: WorkSnapshot; evidence: EvidenceEntry[] }

export function validateReport(raw: unknown, context: ValidationContext): { report: AuditReport; nextAction: AuditResult["nextAction"] } {
  try { return validate(raw as AuditReport, context); }
  catch (error) { if (error instanceof AuditRefusal) throw error; throw new AuditRefusal("invalid_report", `Malformed audit report: ${(error as Error).message}`); }
}

function validate(report: AuditReport, context: ValidationContext): { report: AuditReport; nextAction: AuditResult["nextAction"] } {
  const { record, activity, checked, current, evidence } = context;
  requireAudit(report && report.schemaVersion === 1, "Unsupported or missing audit report schemaVersion.");
  requireAudit(report.executionId === record.executionId && report.activityId === activity.activityId && report.kind === activity.kind && report.round === activity.round && report.continuationIndex === activity.continuationIndex && Number.isSafeInteger(report.round) && report.round > 0 && Number.isSafeInteger(report.continuationIndex) && report.continuationIndex > 0, "Report identity differs from assigned audit activity.");
  requireAudit(report.checkedSnapshotId === checked.id && checked.activityId === activity.activityId, "Report snapshot is not assigned to this activity.");
  requireAudit(report.scope.kind === "whole_prd" && report.scope.repository === checked.requirements.repository && report.scope.path === checked.requirements.path && report.scope.manifestId === checked.requirements.id, "Report scope does not match the whole governing PRD.");
  requireAudit(Array.isArray(report.criteria), "Criteria must be an array.");
  if (report.criteria.length > 10_000) throw new AuditRefusal("report_too_large", "Maximum report size is 10,000 criterion rows.", 413);
  const keys = checked.requirements.criteria.map(c => c.key).sort();
  requireAudit(strings(report.scope.criterionKeys) && hashValue([...report.scope.criterionKeys].sort()) === hashValue(keys) && hashValue(report.criteria.map(r => r.criterionKey).sort()) === hashValue(keys), "Report must cover every manifest key exactly once, including superseded criteria.");
  requireAudit(["passed", "completion_phases", "continue_test", "blocked"].includes(report.outcome), "Unknown audit outcome.");
  requireAudit(Array.isArray(report.blockers) && Array.isArray(report.pendingHumanActions) && Array.isArray(report.completionPhases), "Missing blockers, pendingHumanActions or completionPhases.");
  unique(report.blockers.map(b => b.id), "blocker IDs"); unique(report.pendingHumanActions.map(a => a.id), "human action IDs"); unique(report.completionPhases.map(p => p.id), "completion phase IDs");
  const entry = (id: string, kind?: EvidenceEntry["kind"]): EvidenceEntry => {
    const found = evidence.find(e => e.evidenceId === id);
    requireAudit(found && activity.sessionIds.includes(found.sessionId) && (!kind || found.kind === kind), `Missing engine-observed ${kind ?? ""} evidence ${id}`, "missing_evidence"); return found;
  };
  const file = (ref: FileReference) => requireAudit(fileInSnapshot(checked, ref) && fileInSnapshot(current, ref), `Missing or changed referenced file ${ref?.repository}/${ref?.path}`, "missing_evidence");
  const requirementsDocument = requirementsDocumentFilter(checked);
  const command = (id: string, success: boolean): EvidenceEntry => {
    const found = entry(id, "command"); const observed = found.command!;
    requireAudit(observed && observed.startedAt >= checked.createdAt && observed.endedAt >= observed.startedAt && observed.endedAt <= current.createdAt, `Command ${id} is not bound to the checked snapshot interval.`, "missing_evidence");
    requireAudit(current.repositories.some(r => insideRepository(repositoryFor(record, r.repository), observed.cwd)), `Command ${id} ran outside an assigned repository.`, "outside_execution");
    // Equal end-point hashes alone miss a source mutation restored during a passing run.
    // ctime is observed independently; the final mapped run must start after restoration.
    if (success) for (const repository of current.repositories) for (const [path, actual] of Object.entries(repository.files)) {
      if (repository.repository === record.repository.name && ((record.completionAudits?.activities ?? []).some(a => a.reportPath === path) || path === `${record.prdDirectory}/test-audit.md`)) continue;
      if (requirementsDocument(repository.repository, path)) continue;
      const original = checked.repositories.find(r => r.repository === repository.repository)?.files[path];
      requireAudit(original, `Material content ${repository.repository}/${path} is not in the checked snapshot; take a new snapshot, then rerun the passing runs the report cites.`, "stale_snapshot");
      requireAudit(actual.changedAtMs === original.changedAtMs || Date.parse(observed.startedAt) >= actual.changedAtMs, `Material content ${repository.repository}/${path} changed at ${new Date(actual.changedAtMs).toISOString()}, after passing verification ${id} started at ${observed.startedAt}. A byte-identical restore, checkout or stash still counts as a change. Finish every red check and code or test change, then rerun the passing runs mapped to test parts and each red check's restored passing run.`, "stale_snapshot");
    }
    if (success) requireAudit(observed.outcome === "success" && (observed.exitCode === undefined || observed.exitCode === 0), `Required verification ${id} failed.`, "missing_evidence");
    return found;
  };
  const assessor = (id: string, purpose?: string): EvidenceEntry => {
    const found = entry(id, "assessment");
    requireAudit(found.assessment?.snapshotId === checked.id && (!purpose || found.assessment.purpose === purpose), `Assessment ${id} is for another snapshot or task.`, "missing_evidence"); return found;
  };
  const method = report.methodEvidence;
  const loaded = entry(method.skillEvidenceId, "skill");
  requireAudit(hashValue(loaded.skill) === hashValue(activity.skill), "The assigned installed audit skill was not loaded.", "missing_evidence");
  requireAudit(strings(method.assessmentEvidenceIds) && method.assessmentEvidenceIds.length && strings(method.reviewEvidenceIds) && method.reviewEvidenceIds.length, "Method needs assessment and independent review evidence.", "missing_evidence");
  const assessments = method.assessmentEvidenceIds.map(id => assessor(id, "assessment"));
  const reviews = method.reviewEvidenceIds.map(id => assessor(id, "review"));
  requireAudit(reviews.every(review => assessments.every(a => a.conversationId !== review.conversationId)), "Review must come from a distinct assessor conversation.", "missing_evidence");
  const verifiedByAssessor = (id: string, partId?: string) => requireAudit(assessments.some(a => a.assessment!.verificationEvidenceIds?.includes(id) && (!partId || a.assessment!.partIds.includes(partId))), `Verification ${id} is not mapped by an independent test assessor.`, "missing_evidence");
  const partIds = new Set<string>(); const gaps = new Set<string>(); const failingTestKeys = new Set<string>();
  let unresolved = false;
  // Check the enum across the whole report first: a free-text value would otherwise read as "fully superseded".
  const unknownApplicability = report.criteria.flatMap(row => (Array.isArray(row.parts) ? row.parts : []).filter(part => !["current", "superseded"].includes(part.applicability)).map(part => ({ row: row.criterionKey, part })));
  requireAudit(!unknownApplicability.length, `Part applicability must be "current" or "superseded"; ${unknownApplicability.length} part(s) in ${new Set(unknownApplicability.map(u => u.row)).size} row(s) use another value, e.g. ${unknownApplicability[0]?.part.id}: ${JSON.stringify(String(unknownApplicability[0]?.part.applicability).slice(0, 80))}. Applicability says whether the requirement text is still in force, not whether its phase is closed.`);
  for (const row of report.criteria) {
    const source = checked.requirements.criteria.find(c => c.key === row.criterionKey)!;
    requireAudit(Array.isArray(row.parts) && row.parts.length && strings(row.assessmentEvidenceIds) && row.assessmentEvidenceIds.length && Array.isArray(row.findings) && strings(row.blockerIds), `Incomplete criterion row ${row.criterionKey}`);
    unique(row.parts.map(p => p.id), `part IDs in ${row.criterionKey}`);
    requireAudit(row.assessmentEvidenceIds.every(id => assessor(id).assessment!.criterionKeys.includes(row.criterionKey)), `Assessment does not cover ${row.criterionKey}`, "missing_evidence");
    requireAudit(assessments.some(a => a.assessment!.criterionKeys.includes(row.criterionKey)) && reviews.some(a => a.assessment!.criterionKeys.includes(row.criterionKey)), `Missing independent coverage for ${row.criterionKey}`, "missing_evidence");
    const status = activity.kind === "delivery_audit" ? row.deliveryStatus : row.testAssessment && ("grade" in row.testAssessment ? row.testAssessment.grade : row.testAssessment.status);
    if (["implemented", "adequate", "strong", "superseded", "person_checked"].includes(status ?? "")) requireAudit(!row.findings.length, `Passing/excluded row ${row.criterionKey} contradicts its missing-part findings.`);
    requireAudit(row.parts.some(p => p.applicability === "current") || status === "superseded", `Fully superseded row ${row.criterionKey} needs the superseded status.`);
    if (activity.kind === "delivery_audit") requireAudit(DELIVERY.includes(String(row.deliveryStatus)) && row.testAssessment === undefined, `Invalid delivery assessment for ${row.criterionKey}`);
    else {
      requireAudit(row.deliveryStatus === undefined && row.testAssessment && Object.keys(row.testAssessment).length === 1 && ("grade" in row.testAssessment ? GRADES.includes(row.testAssessment.grade) : TEST_STATUS.includes(row.testAssessment.status)), `Invalid test assessment for ${row.criterionKey}`);
    }
    for (const part of row.parts) {
      requireAudit(nonempty(part.id) && !partIds.has(part.id), `Part ID is ambiguous: ${part.id}`); partIds.add(part.id);
      requireAudit(["current", "superseded"].includes(part.applicability) && Number.isInteger(part.startLine) && Number.isInteger(part.endLine) && part.startLine >= source.startLine && part.endLine >= part.startLine && part.endLine <= source.endLine && nonempty(part.quote), `Part ${part.id} has an invalid source span.`);
      const quote = source.content.split("\n").slice(part.startLine - source.startLine, part.endLine - source.startLine + 1).join("\n");
      requireAudit(quote.includes(part.quote), `Part ${part.id} is not quoted from the governing criterion.`);
      requireAudit(row.assessmentEvidenceIds.some(id => assessor(id).assessment!.partIds.includes(part.id)), `Part ${part.id} has no assessor support.`, "missing_evidence");
      requireAudit(Array.isArray(part.code) && Array.isArray(part.tests), `Part ${part.id} needs code/test references.`);
      part.code.forEach(file);
      if (part.applicability === "superseded") {
        requireAudit(part.replacement && /Superseded(?: in part)? by:/.test(source.content), `Part ${part.id} has no source supersession pointer.`);
        const replacement = part.replacement; const repo = repositoryFor(record, replacement.repository);
        const sourceFile = current.repositories.find(r => r.repository === repo.name)?.files[replacement.path]; requireAudit(sourceFile, "Replacement source is missing.");
        const manifest = requirementManifest(repo.name, replacement.path, sourceFile.blob, readFileSync(assignedPath(repo, replacement.path), "utf8"));
        const target = manifest.criteria.find(c => c.label === replacement.criterion || c.key === replacement.criterion);
        requireAudit(target && target.key !== row.criterionKey, `Cyclic/self replacement for ${part.id}.`);
        const seen = new Set([row.criterionKey]);
        let next: CriterionSource | undefined = target;
        while (next && /Superseded by:/.test(next.content)) {
          requireAudit(!seen.has(next.key), `Cyclic replacement chain for ${part.id}.`); seen.add(next.key);
          const pointer = /Superseded by:\s*(AC-[A-Z0-9]+-\d+)\s+in\s+`([^`]+)`/.exec(next.content);
          requireAudit(pointer, `Unresolvable replacement chain for ${part.id}.`);
          const ref = current.repositories.find(r => r.repository === repo.name)?.files[pointer[2]!]; requireAudit(ref, "Replacement source missing.");
          next = requirementManifest(repo.name, pointer[2]!, ref.blob, readFileSync(assignedPath(repo, pointer[2]!), "utf8")).criteria.find(c => c.label === pointer[1]);
          requireAudit(next, `Missing replacement criterion for ${part.id}.`);
        }
        requireAudit(target && source.content.includes(replacement.criterion) && source.content.includes(replacement.path), `Unresolvable replacement for ${part.id}.`);
      } else {
        requireAudit(status !== "superseded", "A superseded row still contains current parts.");
        if (status === "implemented") requireAudit(part.code.length > 0, `Implemented part ${part.id} needs reachable code evidence.`, "missing_evidence");
        if (["adequate", "strong"].includes(status ?? "")) {
          requireAudit(part.tests.length > 0, `Passing test part ${part.id} has no exact test selectors.`, "missing_evidence");
          for (const test of part.tests) {
            file(test.file); requireAudit(test.runtime && ["checkout", "artifact"].includes(test.runtime.kind), `Test ${test.selector} needs its checked checkout or immutable artifact source.`); requireAudit(nonempty(test.selector) && strings(test.runEvidenceIds) && test.runEvidenceIds.length, `Missing test run mapping for ${part.id}`);
            for (const id of test.runEvidenceIds) { verifiedByAssessor(id, part.id); const observed = command(id, true).command!; requireAudit(observed.invocation.includes(test.selector) || observed.output.includes(test.selector), `Run ${id} did not collect or execute selector ${test.selector}`, "missing_evidence"); }
          }
        }
        if (["waiting_human", "person_checked"].includes(status ?? "")) {
          const action = report.pendingHumanActions.find(a => a.id === part.humanActionId && a.criterionKey === row.criterionKey); requireAudit(action, `Part ${part.id} has no recorded human evidence/action.`);
          if (status === "person_checked") { requireAudit(action.result || action.beyondDelivery, "Person-checked evidence needs a recorded result unless the requirement places the action after delivery."); if (action.result) file(action.result); }
          else if (!action.beyondDelivery) unresolved = true;
        }
        if (status === "not_built_yet") { requireAudit(current.plan.some(p => p.id === part.openPhaseId && !p.closed), `Part ${part.id} has no owning open phase.`); gaps.add(row.criterionKey); }
      }
    }
    for (const finding of row.findings) { requireAudit(nonempty(finding.missing) && strings(finding.partIds) && finding.partIds.length && finding.partIds.every(id => row.parts.some(p => p.id === id)) && strings(finding.evidenceIds), "Invalid missing-part finding."); finding.evidenceIds.forEach(id => entry(id)); }
    if (["partly_implemented", "not_implemented"].includes(status ?? "")) { requireAudit(row.findings.length, "Implementation gaps need missing-part findings."); gaps.add(row.criterionKey); }
    if (["missing", "weak"].includes(status ?? "")) { requireAudit(row.findings.length, "Missing/Weak grades need absent-support findings."); failingTestKeys.add(row.criterionKey); }
    if (status === "changed_outside_requirements") { requireAudit(row.blockerIds.length, "Changed behavior needs a recorded human decision; it cannot pass."); unresolved = true; }
    for (const id of row.blockerIds) requireAudit(report.blockers.some(b => b.id === id && b.criterionKeys.includes(row.criterionKey)), `Unknown blocker ${id}`);
  }
  for (const blocker of report.blockers) requireAudit(nonempty(blocker.id) && nonempty(blocker.problem) && nonempty(blocker.requiredAction) && strings(blocker.criterionKeys) && blocker.criterionKeys.length && blocker.criterionKeys.every(k => keys.includes(k) && report.criteria.some(r => r.criterionKey === k && r.blockerIds.includes(blocker.id))), "Blocker must name its criterion rows and required action.");
  for (const action of report.pendingHumanActions) {
    requireAudit(report.criteria.some(row => row.criterionKey === action.criterionKey && row.parts.some(p => p.humanActionId === action.id)), `Unreferenced human action ${action.id}`);
    if (action.result) file(action.result);
    requireAudit(report.criteria.some(row => row.criterionKey === action.criterionKey && (row.deliveryStatus === "waiting_human" || row.testAssessment && "status" in row.testAssessment && row.testAssessment.status === "person_checked")), "Human action requires a corresponding waiting/person-checked row.");
    if (!action.beyondDelivery && !action.result) unresolved = true;
    requireAudit(nonempty(action.id) && nonempty(action.action) && typeof action.beyondDelivery === "boolean" && nonempty(action.requirementQuote) && checked.requirements.criteria.some(c => c.key === action.criterionKey && c.content.includes(action.requirementQuote)), "Human action needs its governing requirement pointer.");
  }
  const initial = context.initial ?? checked;
  // Currentness admits appended phases without a new snapshot, so every outcome must account for them.
  requireAudit(initial.plan.every((p, i) => { const actual = current.plan[i]; return actual && actual.id === p.id && actual.file === p.file && actual.closed === p.closed && actual.content === p.content; }), "Audit changed original plan ownership, scope, order or closures.", "inconsistent_plan");
  const added = current.plan.slice(initial.plan.length);
  requireAudit(hashValue(added.map(p => p.id).sort()) === hashValue(report.completionPhases.map(p => p.id).sort()), "Completion report must name exactly the appended plan entries.", "inconsistent_plan");
  for (const phase of report.completionPhases) {
    const found = current.plan.find(p => p.id === phase.id && p.file === phase.path && !p.closed);
    requireAudit(found && phase.originKind === activity.kind && phase.originActivityId === activity.activityId && nonempty(phase.missingBehavior) && strings(phase.criterionKeys) && phase.criterionKeys.length && phase.criterionKeys.every(k => keys.includes(k)) && strings(phase.dependencies), `Completion phase ${phase.id} disagrees with the plan.`, "inconsistent_plan");
    const text = readFileSync(assignedPath(repositoryFor(record, record.repository.name), phase.path), "utf8");
    const dependencySection = /## Phase dependencies\s*\n([\s\S]*?)(?=\n## |$)/i.exec(text)?.[1] ?? "";
    const actualDependencies = dependencyIds(dependencySection);
    requireAudit(actualDependencies.every(id => current.plan.some(p => p.id === id)) && hashValue([...phase.dependencies].sort()) === hashValue(actualDependencies.sort()) && phase.dependencies.every(id => current.plan.findIndex(p => p.id === id) < current.plan.findIndex(p => p.id === phase.id)), `Completion phase ${phase.id} dependencies disagree with its text or plan order.`, "inconsistent_plan");
    requireAudit(phase.criterionKeys.every(key => gaps.has(key)), `Completion phase ${phase.id} includes criteria without implementation gaps.`, "inconsistent_plan");
    const marker = activity.kind === "delivery_audit" ? "**Added by delivery audit:**" : "**Added by test audit:**";
    requireAudit(text.split("\n").some(line => line.startsWith(marker) && line.includes(activity.activityId)) && phase.criterionKeys.every(key => text.includes(checked.requirements.criteria.find(c => c.key === key)!.label)) && phase.dependencies.every(id => current.plan.some(p => p.id === id && p.id !== phase.id)), `Completion phase ${phase.id} lacks method origin, criteria or dependencies.`, "inconsistent_plan");
  }
  if (activity.kind === "test_audit") {
    requireAudit(current.repositories.find(r => r.repository === record.repository.name)?.files[`${record.prdDirectory}/test-audit.md`], "The method's test-audit.md record is missing.", "missing_evidence");
    requireAudit(strings(method.baselineRunEvidenceIds) && method.baselineRunEvidenceIds.length && strings(method.finalRunEvidenceIds) && method.finalRunEvidenceIds.length && Array.isArray(method.redChecks), "Test audit needs observed baseline, final suite and red-check evidence.");
    const baseline = method.baselineRunEvidenceIds.map(id => { verifiedByAssessor(id); return command(id, false); });
    const final = method.finalRunEvidenceIds.map(id => { verifiedByAssessor(id); return command(id, false); });
    requireAudit(baseline.every(b => final.some(f => f.command!.cwd === b.command!.cwd && f.command!.invocation === b.command!.invocation && f.command!.startedAt >= b.command!.endedAt)), "Final suite must rerun each baseline command in the same repository.", "missing_evidence");
    for (const run of final.filter(e => e.command!.outcome === "error")) requireAudit(method.unrelatedFailures?.some(f => f.evidenceId === run.evidenceId && nonempty(f.reason) && reviews.some(r => r.evidenceId === f.reviewEvidenceId && r.assessment!.verificationEvidenceIds?.includes(run.evidenceId) && r.assessment!.response.includes(f.reason))), "Final suite failure needs a named independent unrelated-failure assessment.", "missing_evidence");
    const passingRows = report.criteria.filter(row => row.testAssessment && "grade" in row.testAssessment && ["adequate", "strong"].includes(row.testAssessment.grade));
    requireAudit(!passingRows.length || method.redChecks.length > 0, "Passing test grades need sampled red checks or independently supported impossibility reasons.", "missing_evidence");
    for (const row of passingRows) if (row.testAssessment && "grade" in row.testAssessment && row.testAssessment.grade === "strong") requireAudit(row.parts.filter(p => p.applicability === "current").every(p => method.redChecks!.some(red => red.partIds.includes(p.id) && !red.impossibilityReason)), "Strong requires observed red checks for every current part.");
    for (const red of method.redChecks) {
      requireAudit(strings(red.partIds) && red.partIds.length && red.partIds.every(id => partIds.has(id)), "Red check names unknown parts.");
      if (nonempty(red.impossibilityReason)) {
        requireAudit(assessments.some(a => red.partIds.every(id => a.assessment!.partIds.includes(id)) && a.assessment!.response.includes(red.impossibilityReason!)) && reviews.some(a => a.assessment!.response.includes(red.impossibilityReason!)), "Red-check impossibility needs independent assessment and review support.", "missing_evidence");
        continue;
      }
      requireAudit(red.mutationEvidenceIds.length && red.restorationEvidenceIds.length && red.failingRunEvidenceIds.length === 2 && red.passingRunEvidenceId, "Red check needs mutation, restoration, two failing runs and restored passing run.");
      const mutations = red.mutationEvidenceIds.map(id => entry(id, "mutation")); const restored = red.restorationEvidenceIds.map(id => entry(id, "mutation"));
      const failed = red.failingRunEvidenceIds.map(id => { verifiedByAssessor(id); const e = command(id, false); requireAudit(e.command!.outcome === "error", "Red check did not fail."); return e; });
      unique(red.failingRunEvidenceIds, "red-check runs");
      const green = command(red.passingRunEvidenceId, true); verifiedByAssessor(green.evidenceId);
      for (const id of red.partIds) {
        const part = report.criteria.flatMap(row => row.parts).find(p => p.id === id)!;
        const paths = part.code.map(ref => assignedPath(repositoryFor(record, ref.repository), ref.path));
        requireAudit(paths.length && mutations.some(m => m.mutation!.paths.some(path => paths.includes(path))) && part.tests.some(t => [...failed, green].every(run => run.command!.invocation.includes(t.selector) || run.command!.output.includes(t.selector))), `Red check for ${id} does not mutate its referenced implementation or run its mapped tests.`, "missing_evidence");
      }
      requireAudit(failed.every(f => f.command!.invocation === green.command!.invocation && f.command!.cwd === green.command!.cwd) && mutations.every(m => m.mutation!.at <= failed[0]!.command!.startedAt) && failed[0]!.command!.endedAt <= failed[1]!.command!.startedAt && restored.every(r => r.mutation!.at >= failed[1]!.command!.endedAt && r.mutation!.at <= green.command!.startedAt) && mutations.every(m => m.mutation!.paths.every(path => restored.some(r => r.mutation!.paths.includes(path)))), "Red checks must fail twice after mutation and pass after restoration of the same paths.", "missing_evidence");
    }
    const changed = current.repositories.some(r => Object.entries(r.files).some(([path, f]) => initial.repositories.find(c => c.repository === r.repository)?.files[path]?.changedAtMs !== f.changedAtMs && !record.completionAudits!.activities.some(a => a.reportPath === path) && path !== `${record.prdDirectory}/test-audit.md`));
    if (changed) {
      requireAudit(method.regradeEvidenceIds?.length, "Remediation/restoration needs an independent re-grade.", "missing_evidence");
      requireAudit(report.criteria.every(row => row.parts.every(part => method.regradeEvidenceIds!.some(id => { const a = assessor(id, "regrade").assessment!; return a.criterionKeys.includes(row.criterionKey) && a.partIds.includes(part.id); }))), "Independent re-grade does not cover every potentially affected part.", "missing_evidence");
    }
    for (const id of method.regradeEvidenceIds ?? []) {
      const review = assessor(id, "regrade"); requireAudit(review.conversationId !== loaded.conversationId && evidence.filter(e => e.kind === "mutation").every(writer => writer.conversationId !== review.conversationId), "Remediation re-grade must be independent of its writer.");
    }
  }
  const open = current.plan.filter(p => !p.closed && !p.splitInto);
  if (report.outcome === "passed") requireAudit(!report.blockers.length && !unresolved && !gaps.size && !failingTestKeys.size && !open.length && !report.completionPhases.length && !report.nextTestBatch, "A passing audit still has unresolved work or open implementation phases.");
  if (report.outcome === "completion_phases") requireAudit(report.completionPhases.length && [...gaps].every(key => report.completionPhases.some(p => p.criterionKeys.includes(key))), "Every implementation gap must route to a matching completion phase.");
  if (report.outcome === "continue_test") requireAudit(activity.kind === "test_audit" && report.nextTestBatch && strings(report.nextTestBatch.criterionKeys) && report.nextTestBatch.criterionKeys.length && report.nextTestBatch.criterionKeys.every(k => keys.includes(k)) && report.nextTestBatch.recordPath === `${record.prdDirectory}/test-audit.md` && nonempty(report.nextTestBatch.nextBatch) && !gaps.size && !open.length, "Test continuation needs a saved actionable test-only batch.");
  if (report.nextTestBatch) {
    requireAudit(report.outcome === "continue_test" && new Set(report.nextTestBatch.criterionKeys).size === report.nextTestBatch.criterionKeys.length && hashValue([...report.nextTestBatch.criterionKeys].sort()) === hashValue([...failingTestKeys].sort()), "Next batch must name remaining Missing/Weak criteria.");
    const path = report.nextTestBatch.recordPath;
    const recordFile = current.repositories.find(r => r.repository === record.repository.name)?.files[path];
    requireAudit(recordFile && readFileSync(assignedPath(repositoryFor(record, record.repository.name), path), "utf8").includes(report.nextTestBatch.nextBatch), "Test continuation record is missing or disagrees with its next batch.", "missing_evidence");
  }
  if (report.outcome === "blocked") requireAudit(report.blockers.length || unresolved, "Blocked outcome must explain the action needed.");
  const nextAction: AuditResult["nextAction"] = report.blockers.length || unresolved ? "needs_you" : report.outcome === "completion_phases" ? "implementation" : report.outcome === "continue_test" ? "continue_test" : report.outcome === "passed" ? activity.kind === "delivery_audit" ? "test_audit" : "final_delivery" : "needs_you";
  return { report, nextAction };
}
