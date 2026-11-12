// Completion waivers (waivers technical design): the failing items a check reports, the one
// coverage rule that decides which of them an unexpired waiver covers, and the saved waiver
// record. Every check result that decides what happens next passes through `applyWaivers`
// before `passed` is read, so the browser, terminal and status JSON read the same marked rows.

// No Node imports: the browser view uses these display helpers too.

import type { PhasePlan } from "../plan/phase-plan.js";
import type { CheckResult, PrdRecord } from "../state/records.js";

const joinNames = (names: string[]) => names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export type CheckItemKind = "phase_closed" | "repository_work" | "development_requirement" | "known_problem" | "other";

/** Where a waiver came from (AC-WAIVE-08). */
export interface WaiverSource {
  via: "browser" | "command_line";
  /** The operating-system user name of the Kiln controller process, read when the waiver is saved. */
  account: string;
  /** The optional `--by` name, 1 to 64 printable characters, stored verbatim. */
  by?: string;
}

/** The waiver covering an item, set only by {@link applyWaivers}. */
export interface WaiverRef extends WaiverSource {
  waiverId: string;
  activityKey: string;
  at: string;
}

/**
 * One failing thing a check found (AC-WAIVE-11), matched across activities by its kind and
 * subject (AC-WAIVE-09's "Matched by") while `against` is unchanged.
 *
 *   { kind: "repository_work", subject: "example-app", text: "4c1a9e0 isn't on origin yet", against: "<head>:<dirty digest>" }
 */
export interface CheckItem {
  kind: CheckItemKind;
  /** Phase id | repository name | `<checkpointId>/<requirementId>` | failure text | item key. */
  subject: string;
  /** The failure text, shown as its fact line. */
  text: string;
  /** Canonical fingerprint of what it was checked against; empty until {@link fillAgainst} runs. */
  against: string;
  waiver?: WaiverRef;
}

/** A waived item as the waiver saves it. */
export interface WaivedItem {
  check: string;
  kind: CheckItemKind;
  subject: string;
  text: string;
  against: string;
}

export type ActivityKind = "implementation" | "delivery_audit" | "test_audit" | "final_delivery";

/** The saved, append-only waiver (AC-WAIVE-08). */
export interface Waiver {
  waiverId: string;
  at: string;
  /** The stop's key: a phase id, `audit-<activityId>` or `pr`. */
  activityKey: string;
  activityKind: ActivityKind;
  /** `continued` for a plan or readiness stop on an activity that had not started, or any stop on one already complete. */
  effect: "completed" | "continued";
  source: WaiverSource;
  /** The control receipt that applied it. */
  operationId: string;
  /** The run Mark complete was offered on; the rerun's id is in the receipt. */
  checkRun: { id: string; at: string };
  /** From the rerun: every unmet item. */
  items: WaivedItem[];
  /** The rerun's full marked results, kept because completion deletes the stop. */
  checks: CheckResult[];
  audit?: { report: "accepted" | "valid" | "none"; countedOutcome: AuditCountedOutcome; countedChangedImplementation?: boolean; resultRef: string };
}

export type AuditCountedOutcome = "passed" | "completion_phases" | "continue_test";

/** An audit marked complete, stored in the audit store and referenced by `activity.waivedResult` (AC-WAIVE-12). */
export interface AuditWaiverResult {
  kind: "audit_waiver";
  activityId: string;
  waiverId: string;
  report: "accepted" | "valid" | "none";
  reportBytes?: string;
  reportDigest?: string;
  countedOutcome: AuditCountedOutcome;
  countedChangedImplementation?: boolean;
  /** A work snapshot captured during the rerun; currentness is measured from it. */
  snapshotRef: string;
}

export const PLAN_CHECK = "Phase plan reads";
export const READINESS_CHECK = "Completion audit readiness";
/** Checks whose one item is their joined failure text, matched under either check (AC-WAIVE-09). */
export const KNOWN_PROBLEM_CHECKS: readonly string[] = [PLAN_CHECK, READINESS_CHECK];
/** Checks that can stop an activity before it runs; their item key also names the stopped activity. */
export const LAUNCH_CHECKS: readonly string[] = ["Billing approval", "Agent selection and readiness", "Codex launch settings", "Preparation permissions"];

export const PLAN_WARNING = "plan problem waived: Kiln followed its normal order";
export const AUDIT_WARNING = "audit problem waived: Kiln followed its normal order";
export const NO_REPORT_WARNING = "no audit report: Kiln couldn’t tell what this audit found";

/** The key an item matches by across activities (AC-WAIVE-09's "Matched by"). */
export function matchKey(check: string, item: Pick<CheckItem, "kind" | "subject">): string {
  return item.kind === "other" ? `other\u0000${check}\u0000${item.subject}` : `${item.kind}\u0000${item.subject}`;
}

/**
 * Gives every failing check without structured items one item per fact (a producer with no
 * structured subject), and clears the items of a passing one. A Phase plan reads or Completion
 * audit readiness row is one `known_problem` item of its joined text; a launch check's item key
 * names the stopped activity, so it never stands in for a later launch.
 */
export function itemize(checks: CheckResult[], activityKey: string): CheckResult[] {
  for (const check of checks) {
    if (check.passed) { if (!check.waived) delete check.items; continue; }
    if (check.items?.length) continue;
    if (KNOWN_PROBLEM_CHECKS.includes(check.name)) {
      const text = check.facts.join(" ");
      check.items = [{ kind: "known_problem", subject: text, text, against: text }];
    } else if (LAUNCH_CHECKS.includes(check.name)) {
      check.items = (check.facts.length ? check.facts : [check.name]).map(fact => ({ kind: "other" as const, subject: `${activityKey}: ${fact}`, text: fact, against: "" }));
    } else {
      check.items = (check.facts.length ? check.facts : [check.name]).map(fact => ({ kind: "other" as const, subject: fact, text: fact, against: "" }));
    }
  }
  return checks;
}

/** A set-up repository's feature head and a digest of its uncommitted changes, what head-bound items are checked against (read by `waiver-fingerprints.ts`). */
export interface RepositoryFingerprint { name: string; head: string; dirty: string }

/** Fills the empty `against` of head-bound items: a repository's work by its head and changes, any other item by every feature head. */
export function fillAgainst(checks: CheckResult[], fingerprints: RepositoryFingerprint[]): CheckResult[] {
  const heads = fingerprints.map(one => `${one.name}=${one.head}`).join(",");
  for (const check of checks) for (const item of check.items ?? []) {
    if (item.against) continue;
    if (item.kind === "repository_work") {
      const one = fingerprints.find(f => f.name === item.subject);
      // A repository with no fingerprint never matches anything saved.
      item.against = one ? `${one.head}:${one.dirty}` : `unknown:${Date.now()}:${Math.random()}`;
    } else item.against = heads;
  }
  return checks;
}

/** The latest waiver item with the same match key and an equal `against`. */
function coveringWaiver(waivers: readonly Waiver[], check: string, item: CheckItem): WaiverRef | undefined {
  const key = matchKey(check, item);
  for (let index = waivers.length - 1; index >= 0; index--) {
    const waiver = waivers[index]!;
    if (waiver.items.some(saved => matchKey(saved.check, saved) === key && saved.against === item.against)) {
      return { waiverId: waiver.waiverId, activityKey: waiver.activityKey, at: waiver.at, ...waiver.source };
    }
  }
  return undefined;
}

export interface CoverageOptions {
  /** A `phase_closed` item is covered only while its phase is a leaf of the current plan, or of the order source Normal Order uses. */
  isLeaf?: (phaseId: string) => boolean;
}

/**
 * The only place coverage is decided (AC-WAIVE-09): marks each failing item an unexpired waiver
 * covers. A check whose failing items are all covered becomes `passed: true, waived: true`; one
 * with some uncovered items stays failing, its covered items tagged. Mutates and returns `checks`.
 *
 *   applyWaivers(record.waivers ?? [], outcome.checks, { isLeaf: id => leafIds.has(id) })
 *   // [{ name: "Pushed", passed: true, waived: true, items: [{ …, waiver: { waiverId, … } }] }]
 */
export function applyWaivers(waivers: readonly Waiver[], checks: CheckResult[], options: CoverageOptions = {}): CheckResult[] {
  for (const check of checks) {
    // A passing row, or one already met by a waiver it names (such as a waived audit's Current completion audits row), stays as it is.
    if (check.passed) continue;
    const items = check.items ?? [];
    for (const item of items) {
      delete item.waiver;
      if (item.kind === "phase_closed" && options.isLeaf && !options.isLeaf(item.subject)) continue;
      const ref = coveringWaiver(waivers, check.name, item);
      if (ref) item.waiver = ref;
    }
    if (items.length > 0 && items.every(item => item.waiver)) { check.passed = true; check.waived = true; }
    else { check.passed = false; delete check.waived; }
  }
  return checks;
}

/** Every failing item no waiver covers, as a waiver would save it. */
export function unmetItems(checks: readonly CheckResult[]): WaivedItem[] {
  return checks.filter(check => !check.passed).flatMap(check => (check.items ?? []).filter(item => !item.waiver).map(item => ({ check: check.name, kind: item.kind, subject: item.subject, text: item.text, against: item.against })));
}

export interface ItemChange { check: string; subject: string; change: "newly_failing" | "newly_passing" | "text_changed"; before?: string; after?: string }

/**
 * Compares the uncovered failing items of the offered run with the rerun's, as sets of
 * (check, match key, text) (waivers "Mark Complete", step 3). Empty when they are the same.
 */
export function changedItems(offered: readonly CheckResult[], rerun: readonly CheckResult[]): ItemChange[] {
  // One repository can fail twice in one check (uncommitted and unpushed) under one match key, so the text is part of identity.
  const identity = (item: WaivedItem) => `${item.check}\u0000${matchKey(item.check, item)}\u0000${item.text}`;
  const before = unmetItems(offered); const after = unmetItems(rerun);
  const was = new Set(before.map(identity)); const is = new Set(after.map(identity));
  const failing = after.filter(item => !was.has(identity(item)));
  const passing = before.filter(item => !is.has(identity(item)));
  const changes: ItemChange[] = [];
  for (const item of failing) {
    const index = passing.findIndex(old => old.check === item.check && matchKey(old.check, old) === matchKey(item.check, item));
    if (index >= 0) { const [old] = passing.splice(index, 1); changes.push({ check: item.check, subject: item.subject, change: "text_changed", before: old!.text, after: item.text }); }
    else changes.push({ check: item.check, subject: item.subject, change: "newly_failing", after: item.text });
  }
  for (const item of passing) changes.push({ check: item.check, subject: item.subject, change: "newly_passing", before: item.text });
  return changes;
}

/** Check counts with waived checks reported separately (AC-WAIVE-10): `3 passed · 1 waived`. */
export function checkCounts(checks: readonly CheckResult[]): { passed: number; waived: number; failed: number } {
  return {
    passed: checks.filter(check => check.passed && !check.waived).length,
    waived: checks.filter(check => check.passed && check.waived).length,
    failed: checks.filter(check => !check.passed).length,
  };
}

export function countsText(counts: { passed: number; waived: number; failed: number }): string {
  return [`${counts.passed} passed`, ...(counts.waived ? [`${counts.waived} waived`] : []), ...(counts.failed ? [`${counts.failed} failing`] : [])].join(" · ");
}

export const checksWord = (count: number) => `${count} check${count === 1 ? "" : "s"}`;
export const completeLabel = (waived: number) => waived ? `Complete · ${checksWord(waived)} waived` : "Complete";

/** Whether a waiver covers this plan or audit-readiness problem text, under either check (AC-WAIVE-04). */
export function knownProblemWaiver(waivers: readonly Waiver[] | undefined, text: string): Waiver | undefined {
  return (waivers ?? []).findLast(waiver => waiver.items.some(item => item.kind === "known_problem" && item.against === text));
}

/** The waiver whose Closed-line item covers this phase, while it is a leaf (AC-WAIVE-09). */
export function closedWaiver(waivers: readonly Waiver[] | undefined, phaseId: string): Waiver | undefined {
  return (waivers ?? []).findLast(waiver => waiver.items.some(item => item.kind === "phase_closed" && item.subject === phaseId && item.against === phaseId));
}

/**
 * The plan as read, with each leaf whose Closed line a waiver covers or that was skipped under
 * a plan waiver counting as closed (waivers "Effective plan"). Derived on every read, never
 * written into the recorded plan; the documents' own Closed lines are untouched.
 */
export function effectivePlan(plan: PhasePlan, record: Pick<PrdRecord, "waivers" | "phases">, carried: ReadonlySet<string> = new Set()): { plan: PhasePlan; closedByWaiver: Set<string>; skippedByWaiver: Set<string> } {
  const closedByWaiver = new Set<string>(); const skippedByWaiver = new Set<string>();
  const phases = plan.phases.map(phase => {
    if (phase.splitInto !== undefined || phase.closed) return phase;
    if (record.phases[phase.id]?.skippedByWaiver) { skippedByWaiver.add(phase.id); return { ...phase, closed: true }; }
    // `carried`: leaves an earlier execution completed on a waiver, from the plan baseline.
    if (closedWaiver(record.waivers, phase.id) || carried.has(phase.id)) { closedByWaiver.add(phase.id); return { ...phase, closed: true }; }
    return phase;
  });
  return { plan: { ...plan, phases }, closedByWaiver, skippedByWaiver };
}

/** The same closures over a recorded plan's leaves. */
export function effectiveRecordedClosed(record: Pick<PrdRecord, "waivers" | "phases">, phase: { id: string; closed: boolean }): boolean {
  // A Done leaf counts too: under a waived plan problem the recorded plan cannot be re-read, so its Closed lines go stale.
  return phase.closed || !!record.phases[phase.id]?.doneAt || !!record.phases[phase.id]?.skippedByWaiver || !!closedWaiver(record.waivers, phase.id);
}

export interface PreviewWording {
  /** The activity's name in a sentence, such as "Phase 3", "Final delivery" or "Delivery audit". */
  activity: string;
  failingChecks: number;
  /** What Kiln does next: "moves to the next step", "moves to Complete", "counts the audit as passed and moves on to the test audit". */
  next: string;
  resultingLabel: string;
  /** Repositories with waived uncommitted or unpushed work (AC-WAIVE-03). */
  repositoryWork: string[];
  /** Where resuming is offered, the resume sentence's activity name. */
  resumeOffered: boolean;
  noReport: boolean;
  continueInOrder: boolean;
  /** The phase has built nothing: no commits and no uncommitted changes (run restart AC-CASE-03). */
  builtNothing?: boolean;
}

/**
 * The sentence above Mark complete (AC-WAIVE-03), the same text the CLI prints.
 *
 *   previewSentence({ activity: "Phase 3", failingChecks: 1, next: "moves to the next step", resultingLabel: "Complete · 1 check waived", … })
 *   // "Mark it complete. Kiln skips the 1 failing check above, records it as waived, never as passed, and moves to the next step. Phase 3 will show as “Complete · 1 check waived”."
 */
export function previewSentence(wording: PreviewWording): string[] {
  const n = wording.failingChecks; const them = n === 1 ? "it" : "them";
  const lines: string[] = [];
  if (wording.noReport) lines.push("No audit report. Kiln couldn’t read a report from this audit, so it can’t tell what the audit found.");
  if (wording.continueInOrder) {
    lines.push(`Continue anyway. Kiln records the problem above as waived, never as passed, and follows its normal order. Each step it reaches this way shows a warning.`);
  } else {
    if (wording.builtNothing) lines.push(`${wording.activity} has built nothing: no commits and no uncommitted changes.`);
    lines.push(`Mark it complete. Kiln skips the ${n} failing check${n === 1 ? "" : "s"} above, records ${them} as waived, never as passed, and ${wording.next}. ${wording.activity} will show as “${wording.resultingLabel}”${wording.noReport ? " with a warning: no audit report" : ""}.`);
  }
  if (wording.repositoryWork.length) {
    lines.push(`${joinNames(wording.repositoryWork)} ${wording.repositoryWork.length === 1 ? "has" : "have"} work that is not committed and pushed. Work that is not committed and pushed will be missing from the final pull request.${wording.resumeOffered ? ` To push it instead, have Kiln resume ${wording.activity}.` : ""}`);
  }
  return lines;
}

/** What Mark complete would do at the current stop, from the one offered predicate the snapshot, CLI and server share (waivers "Check Runs"). */
export type MarkCompleteOffer = {
  offered: true;
  /** "Mark Phase 3 complete", or "Continue in normal order" for a plan or readiness stop on an activity that has not started. */
  label: string;
  /** "Phase 3 is done, and Kiln’s check is wrong?", or "Kiln can’t work out the next step, and you want it to carry on?". */
  heading: string;
  continueInOrder: boolean;
  checkRunId: string;
  /** Every unmet item the waiver would save. */
  items: WaivedItem[];
  failingChecks: number;
  nextActivity: { kind: "phase" | "audit" | "final_delivery" | "complete"; key: string; title: string } | null;
  resultingLabel: string;
  /** The sentence above the button, one paragraph per entry (AC-WAIVE-03). */
  sentence: string[];
  noReport: boolean;
  /** The phase has built nothing, so the sentence says so (run restart AC-CASE-03). */
  builtNothing?: true;
} | { offered: false; reason: string };

export type MarkCompleteOutcome = "marked_complete" | "continued" | "checks_passed" | "check_results_changed" | "check_unavailable";
