// Completion waivers as `kiln status`, receipts and the terminal show them (waivers "Snapshot and
// `kiln status`", AC-WAIVE-05, AC-WAIVE-10). Everything here reads the saved record and the
// marked check results; nothing decides coverage, which belongs to `applyWaivers` alone.

import type { AuditActivity } from "../audit/contracts.js";
import type { CheckResult, PrdRecord } from "../state/records.js";
import { AUDIT_WARNING, checkCounts, checksWord, completeLabel, countsText, NO_REPORT_WARNING, PLAN_WARNING, READINESS_CHECK, type AuditWaiverResult, type CheckItem, type MarkCompleteOffer, type Waiver, type WaiverRef } from "../engine/waivers.js";
import { commandText } from "./result.js";

export type CheckState = "passed" | "waived" | "failed";
/** A check item as status shows it: the saved item's own fields plus `waived` in snake case. */
export interface ProjectedItem { kind: CheckItem["kind"] | null; subject: string | null; text: string; against?: string; waived?: { waiver_id: string; activity: string; at: string; via: string; account: string; by: string | null } }
export interface ProjectedCheck { name: string; passed: boolean; state: CheckState; facts: string[]; items: ProjectedItem[] }
export interface WaiverWarning { kind: "plan_problem_waived" | "audit_problem_waived" | "no_audit_report"; text: string; waiver_id: string | null }
export interface ProjectedWaiver { waiver_id: string; at: string; effect: Waiver["effect"]; activity: string; source: { via: Waiver["source"]["via"]; account: string; by: string | null }; operation_id: string; items: { check: string; kind: CheckItem["kind"]; subject: string; text: string }[] }
/** One activity's waiver facts (waivers "Snapshot and `kiln status`": per activity). */
export interface ActivityWaivers {
  waived_checks: number;
  /** The waiver this activity was marked complete on, when it has one of its own. */
  waiver_id: string | null;
  counts: { passed: number; waived: number; failed: number } | null;
  checks: ProjectedCheck[] | null;
  waivers: ProjectedWaiver[];
  warnings: WaiverWarning[];
}
/** A row of the activity progress `kiln status` prints (the mockup's terminal blocks). */
export interface ProgressRow extends ActivityWaivers {
  key: string; kind: string; label: string; title: string;
  state: "complete" | "running" | "needs_you" | "waiting" | "skipped" | "not_finished";
  status_label: string | null;
}

export const checkState = (check: CheckResult): CheckState => check.passed ? check.waived ? "waived" : "passed" : "failed";

function projectRef(ref: WaiverRef): NonNullable<ProjectedItem["waived"]> {
  return { waiver_id: ref.waiverId, activity: ref.activityKey, at: ref.at, via: ref.via, account: ref.account, by: ref.by ?? null };
}

/** A check with its state and items (`state: passed | waived | failed`, per item `{ text, waived? }`). */
export function projectCheck(check: CheckResult): ProjectedCheck {
  const items: ProjectedItem[] = check.items?.length
    ? check.items.map(item => ({ ...item, ...(item.waiver ? { waived: projectRef(item.waiver) } : {}) }))
    : check.passed ? [] : check.facts.map(text => ({ kind: null, subject: null, text }));
  return { name: check.name, passed: check.passed, state: checkState(check), facts: check.facts, items };
}

/** A check run with its counts (`counts: { passed, waived, failed }`). */
export function projectRun(checks: readonly CheckResult[]): { counts: ReturnType<typeof checkCounts>; checks: ProjectedCheck[] } {
  return { counts: checkCounts(checks), checks: checks.map(projectCheck) };
}

const refOf = (waiver: Waiver): WaiverRef => ({ waiverId: waiver.waiverId, activityKey: waiver.activityKey, at: waiver.at, ...waiver.source });

/**
 * A waiver's saved rerun, with the items that waiver waived tagged as covered by it: the rerun ran
 * before the waiver existed, so its own items are still failing there. Idempotent.
 */
export function markedByOwnWaiver(waiver: Waiver, checks: readonly CheckResult[] = waiver.checks): CheckResult[] {
  const waived = new Set(waiver.items.map(item => JSON.stringify([item.check, item.kind, item.subject, item.text])));
  return checks.map(check => {
    if (check.passed) return structuredClone(check);
    const items = (check.items ?? []).map(item => item.waiver || !waived.has(JSON.stringify([check.name, item.kind, item.subject, item.text])) ? { ...item } : { ...item, waiver: refOf(waiver) });
    const covered = items.length > 0 && items.every(item => item.waiver);
    return covered ? { ...check, passed: true, waived: true, items } : { ...check, items };
  });
}

const projectWaiver = (waiver: Waiver): ProjectedWaiver => ({
  waiver_id: waiver.waiverId, at: waiver.at, effect: waiver.effect, activity: waiver.activityKey,
  source: { via: waiver.source.via, account: waiver.source.account, by: waiver.source.by ?? null }, operation_id: waiver.operationId,
  items: waiver.items.map(item => ({ check: item.check, kind: item.kind, subject: item.subject, text: item.text })),
});

/** Reads an audit's waiver result from the audit store; undefined when it cannot be read. */
export type AuditWaiverReader = (id: string) => AuditWaiverResult | undefined;

/**
 * One activity's waived checks, waivers and warnings. The waived count of a completed activity
 * comes from its own waiver's `checks`, otherwise its `completionChecks`; an audit completed at
 * once under a readiness waiver shows the carried Completion audit readiness row; a `continued`
 * waiver on an already-complete activity counts on that activity (waivers "Display Contract").
 */
export function activityWaivers(record: PrdRecord, key: string, readAudit?: AuditWaiverReader): ActivityWaivers {
  const facts = record.phases[key];
  const waivers = record.waivers ?? [];
  const own = facts?.waiverId ? waivers.find(w => w.waiverId === facts.waiverId) : undefined;
  const audit: AuditActivity | undefined = key.startsWith("audit-") ? record.completionAudits?.activities.find(a => `audit-${a.activityId}` === key) : undefined;
  let auditResult: AuditWaiverResult | undefined;
  if (audit?.waivedResult && readAudit) { try { auditResult = readAudit(audit.waivedResult); } catch { auditResult = undefined; } }
  let run: CheckResult[] | undefined = own ? markedByOwnWaiver(own) : facts?.completionChecks ? structuredClone(facts.completionChecks) : undefined;
  if (!run && auditResult) {
    const origin = waivers.find(w => w.waiverId === auditResult!.waiverId);
    if (origin && origin.activityKey !== key) {
      run = markedByOwnWaiver(origin, origin.checks.filter(check => check.name === READINESS_CHECK));
    }
  }
  const waivedNames = new Set((run ?? []).filter(check => check.passed && check.waived).map(check => check.name));
  const related = waivers.filter(w => w.activityKey === key);
  if (facts?.doneAt) for (const waiver of related) if (waiver.effect === "continued") for (const item of waiver.items) waivedNames.add(item.check);
  const warnings: WaiverWarning[] = [];
  const warn = (kind: WaiverWarning["kind"], text: string, waiverId: string | null) => { if (!warnings.some(w => w.kind === kind)) warnings.push({ kind, text, waiver_id: waiverId }); };
  if (facts?.waiverWarning) warn(facts.waiverWarning.kind === "plan" ? "plan_problem_waived" : "audit_problem_waived", facts.waiverWarning.kind === "plan" ? PLAN_WARNING : AUDIT_WARNING, facts.waiverWarning.waiverId);
  if (facts?.skippedByWaiver) warn("plan_problem_waived", PLAN_WARNING, facts.skippedByWaiver);
  if (auditResult ? auditResult.report === "none" : own?.audit?.report === "none") warn("no_audit_report", NO_REPORT_WARNING, auditResult?.waiverId ?? own?.waiverId ?? null);
  const projected = run ? projectRun(run) : undefined;
  return { waived_checks: waivedNames.size, waiver_id: own?.waiverId ?? null, counts: projected?.counts ?? null, checks: projected?.checks ?? null, waivers: related.map(projectWaiver), warnings };
}

function rowLabel(record: PrdRecord, key: string, kind: string): { label: string; title: string } {
  const audit = key.startsWith("audit-") ? record.completionAudits?.activities.find(a => `audit-${a.activityId}` === key) : undefined;
  if (audit) return { label: audit.kind === "delivery_audit" ? "Delivery audit" : "Test audit", title: `Round ${audit.round}${audit.continuationIndex > 1 ? ` · Continuation ${audit.continuationIndex}` : ""}` };
  if (key === "pr" || kind === "final_delivery") return { label: "Final delivery", title: "" };
  return { label: `Phase ${key}`, title: record.plan?.find(p => p.id === key)?.title ?? "" };
}

/** Every activity Kiln has reached or skipped, in order, with its waiver facts (AC-WAIVE-10). */
export function progressRows(record: PrdRecord, runningKey: string | undefined, readAudit?: AuditWaiverReader): ProgressRow[] {
  const activities = (record.activities ?? []).map(a => ({ key: a.key, kind: a.kind as string }));
  for (const [key, facts] of Object.entries(record.phases)) if (!activities.some(a => a.key === key) && (facts.skippedByWaiver || facts.doneAt || facts.stop)) activities.push({ key, kind: key === "pr" ? "final_delivery" : key.startsWith("audit-") ? "audit" : "implementation" });
  return activities.map(({ key, kind }) => {
    const facts = record.phases[key];
    const waived = activityWaivers(record, key, readAudit);
    const state: ProgressRow["state"] = facts?.doneAt ? "complete" : facts?.skippedByWaiver ? "skipped" : facts?.stop ? "needs_you" : facts?.wait ? "waiting" : key === runningKey ? "running" : "not_finished";
    return { key, kind, ...rowLabel(record, key, kind), state, status_label: state === "complete" ? completeLabel(waived.waived_checks) : state === "skipped" ? "Skipped" : null, ...waived };
  });
}

/** "2026-11-01 19:16 EST", in the terminal's own time zone. */
export function terminalWhen(iso: string): string {
  const date = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

const viaText = (via: string) => via === "command_line" ? "command line" : via;
const sourceText = (source: { via: string; account: string; by?: string | null }) => [viaText(source.via), source.account, ...(source.by ? [source.by] : [])].join(" · ");

/**
 * What follows "complete" on an activity's terminal line (AC-WAIVE-10): "· 1 check waived", with
 * its time and source when the activity has a waiver of its own.
 *
 *   waiverSuffix(row)  // "· 1 check waived 2026-11-01 19:16 EST · browser · alex"
 */
export function waiverSuffix(row: Pick<ActivityWaivers, "waived_checks" | "waiver_id" | "waivers">): string | undefined {
  if (!row.waived_checks) return undefined;
  const own = row.waivers.find(w => w.waiver_id === row.waiver_id);
  return `· ${checksWord(row.waived_checks)} waived${own ? ` ${terminalWhen(own.at)} · ${sourceText(own.source)}` : ""}`;
}

/**
 * What Kiln's own terminal adds when an activity completes (AC-WAIVE-10's terminal summary): the
 * waived count with its time and source, and any warning markers. Empty when nothing was waived.
 *
 *   terminalWaivers(record, "3")  // { suffix: "· 1 check waived 2026-11-01 19:16 EST · browser · alex", warnings: [] }
 */
export function terminalWaivers(record: PrdRecord, key: string, readAudit?: AuditWaiverReader): { suffix: string | undefined; warnings: string[] } {
  const facts = activityWaivers(record, key, readAudit);
  return { suffix: waiverSuffix(facts), warnings: facts.warnings.map(w => `! ${w.text}`) };
}

/** The subject a waived item is named by in the terminal: a checkpoint and requirement, a repository, or its check. */
function itemName(check: string, item: { kind: string | null; subject: string | null }): string {
  if (item.kind === "development_requirement" && item.subject) return item.subject.split("/").join(" / ");
  if (item.kind === "repository_work" && item.subject) return `${check} · ${item.subject}`;
  return check;
}

/**
 * The detail lines under an activity's terminal line: its warnings, its counts and each waived item
 * (the mockup's `kiln status` blocks), already indented by `indent`.
 */
export function waiverDetailLines(row: Pick<ActivityWaivers, "warnings" | "counts" | "checks" | "waived_checks">, indent: string): string[] {
  if (!row.waived_checks && !row.warnings.length) return [];
  const lines = row.warnings.map(w => `${indent}! ${w.text}`);
  if (row.counts && row.waived_checks) lines.push(`${indent}${countsText(row.counts)}`);
  for (const check of row.checks ?? []) for (const item of check.items) if (item.waived) {
    lines.push(`${indent}waived  ${itemName(check.name, item)}`);
    lines.push(`${indent}        ${item.text}`);
  }
  return lines;
}

const STATE_WORDS: Record<ProgressRow["state"], string> = { complete: "complete", running: "running", needs_you: "needs you", waiting: "waiting", skipped: "skipped", not_finished: "not finished" };

/** "Example feature · example-app · docs/prds/example-feature", from a status result. */
export function progressHeading(answer: Record<string, unknown>): string {
  const prd = answer.prd as { name?: string; directory?: string } | undefined;
  return [prd?.name, ((answer.repositories ?? []) as string[]).join(", "), prd?.directory].filter(Boolean).join(" · ");
}

/** The progress block `kiln status` prints first in text mode (the mockup's `kiln status` blocks). */
export function progressText(heading: string, rows: readonly ProgressRow[]): string {
  const labelWidth = Math.max(0, ...rows.map(r => r.label.length)) + 3;
  const titleWidth = rows.some(r => r.title) ? Math.max(...rows.map(r => r.title.length)) + 3 : 0;
  const indent = " ".repeat(labelWidth + titleWidth);
  const lines = [heading];
  for (const row of rows) {
    const suffix = row.state === "complete" ? waiverSuffix(row) : undefined;
    lines.push(`${row.label.padEnd(labelWidth)}${titleWidth ? row.title.padEnd(titleWidth) : ""}${STATE_WORDS[row.state]}${suffix ? ` ${suffix}` : ""}`.trimEnd());
    lines.push(...waiverDetailLines(row, indent));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The stop's Mark complete offer in `kiln status` and on a failed recheck's receipt, with a
 * `next_argv` that repeats the command with `--confirm`, the new status token and a placeholder for
 * a new command id (AC-WAIVE-05).
 */
export function markCompletePreview(offer: MarkCompleteOffer, canonical: string, token: string | null, withoutSendingReply = false): Record<string, unknown> {
  if (!offer.offered) return { offered: false, reason: offer.reason };
  const argv = token ? ["kiln", "waive-and-advance", canonical, "--confirm", ...(withoutSendingReply ? ["--without-sending-reply"] : []), "--only-if-status-matches", token, "--command-id", NEW_COMMAND_ID] : null;
  return {
    offered: true, label: offer.label, heading: offer.heading, continue_in_order: offer.continueInOrder, check_run_id: offer.checkRunId,
    failing_checks: offer.failingChecks, items: offer.items.map(item => ({ check: item.check, kind: item.kind, subject: item.subject, text: item.text })),
    next_activity: offer.nextActivity, resulting_label: offer.resultingLabel, sentence: offer.sentence, no_report: offer.noReport,
    next_argv: argv, next_command: argv ? commandText(argv) : null,
  };
}
/** The placeholder `next_argv` puts where a new command id goes; a bot replaces it, never reuses an old id. */
export const NEW_COMMAND_ID = "<new-command-id>";

/** The stopped activity's name, from the offer's label ("Mark Phase 3 complete" → "Phase 3"). */
function offeredActivity(preview: Record<string, unknown>): string {
  const label = String(preview.label ?? "");
  return /^Mark (.+) complete$/.exec(label)?.[1] ?? "The activity";
}

function nextText(next: unknown): string {
  const n = next as { kind: string; key: string; title: string } | null;
  if (!n) return "follow its normal order";
  if (n.kind === "complete") return "move to Complete";
  if (n.kind === "final_delivery") return "start final delivery";
  if (n.kind === "phase") return `start Phase ${n.key}${n.title ? ` · ${n.title}` : ""}`;
  return `start the ${n.title ? n.title.charAt(0).toLowerCase() + n.title.slice(1) : "next audit"}`;
}

/**
 * What a recheck that still fails would let Mark complete waive, as the CLI prints it (the
 * mockup's "A bot doing it through the command line").
 */
export function previewLines(preview: Record<string, unknown>, checkedAt: string): string[] {
  if (preview.offered !== true) return typeof preview.reason === "string" ? [`Mark complete is not offered: ${preview.reason}`] : [];
  const activity = offeredActivity(preview);
  const items = (preview.items ?? []) as { check: string; kind: string; subject: string; text: string }[];
  const failing = Number(preview.failing_checks ?? 0);
  const lines = [`Checked again ${terminalWhen(checkedAt)}: ${checksWord(failing)} failing.`];
  lines.push(preview.continue_in_order === true ? "Continuing in normal order would waive:" : "Marking it complete would waive:");
  const byCheck = new Map<string, typeof items>();
  for (const item of items) byCheck.set(item.check, [...byCheck.get(item.check) ?? [], item]);
  for (const [check, list] of byCheck) {
    lines.push(`  ${check}`);
    for (const item of list) {
      if (item.kind === "development_requirement" || item.kind === "repository_work") lines.push(`    ${item.kind === "development_requirement" ? item.subject.split("/").join(" / ") : item.subject}`);
      lines.push(`    ${item.text}`);
    }
  }
  const sentence = (preview.sentence ?? []) as string[];
  for (const extra of sentence.filter(line => !/^(Mark it complete|Continue anyway)\./.test(line))) lines.push(extra);
  lines.push(preview.continue_in_order === true
    ? "Kiln would then follow its normal order, with a warning on each step it reaches this way."
    : `${activity} would then show as ${String(preview.resulting_label)}, and Kiln would ${nextText(preview.next_activity)}.`);
  const argv = preview.next_argv as string[] | null;
  if (argv) {
    const token = argv[argv.indexOf("--only-if-status-matches") + 1]!;
    lines.push(`To ${preview.continue_in_order === true ? "continue" : "mark it complete"}, run again with --confirm${argv.includes("--without-sending-reply") ? " --without-sending-reply" : ""} --only-if-status-matches ${commandText([token])} --command-id <a new id>.`);
  }
  return lines;
}

function activityName(record: PrdRecord | undefined, key: string): string {
  if (!record) return key === "pr" ? "Final delivery" : key.startsWith("audit-") ? "The audit" : `Phase ${key}`;
  const { label } = rowLabel(record, key, key === "pr" ? "final_delivery" : "implementation");
  return label;
}

const CHANGE_WORDS = { newly_failing: "now fails", newly_passing: "now passes", text_changed: "changed" } as const;

/**
 * The human lines the CLI prints before a receipt's fields in text mode, for `waive-and-advance`
 * and for a failed recheck that carries a Mark complete preview (the mockup's state 5). Undefined
 * for every other receipt, whose text output is unchanged.
 */
export function receiptLines(answer: Record<string, unknown>, record?: PrdRecord, waiveCommand = false): string[] | undefined {
  const op = answer.operation as { id: string; action?: string; state: string; outcome: string | null; reason: string | null; updated_at: string; waiver_id?: string; changes?: { check: string; subject: string; change: keyof typeof CHANGE_WORDS; before?: string; after?: string }[]; instruction?: unknown; target?: string } | undefined;
  const preview = answer.mark_complete as Record<string, unknown> | undefined;
  const errors = (answer.errors ?? []) as { code: string; message: string }[];
  if (!op) {
    const refusal = errors[0];
    return refusal && waiveCommand ? [refusalLine(refusal.code, refusal.message)] : undefined;
  }
  if (op.action !== "waive-and-advance" && !preview && !waiveCommand) return undefined;
  if (op.state === "refused") return [refusalLine(op.outcome ?? "refused", op.reason ?? "Kiln refused this instruction.")];
  if (op.state === "accepted" || op.state === "in_progress") return [`Operation ${op.id} accepted.`];
  if (op.state === "indeterminate") return [`Operation ${op.id} is indeterminate. ${op.reason ?? "Inspect its receipt before retrying."}`];
  if (op.state === "failed") return [op.outcome === "check_unavailable" ? `Operation ${op.id} failed: the check could not finish. ${op.reason ?? ""}`.trim() : `Operation ${op.id} failed: ${op.outcome ?? "failed"}. ${op.reason ?? ""}`.trim()];
  if (preview) {
    const activity = preview.offered === true ? offeredActivity(preview) : "The activity";
    return [`Operation ${op.id} completed. ${activity} is still at Needs you.`, ...previewLines(preview, op.updated_at)];
  }
  const waiver = op.waiver_id ? record?.waivers?.find(w => w.waiverId === op.waiver_id) : undefined;
  const name = waiver ? activityName(record, waiver.activityKey) : "The activity";
  switch (op.outcome) {
    case "marked_complete": {
      const count = waiver ? new Set(waiver.items.map(item => item.check)).size : 0;
      return [`Operation ${op.id} completed. ${name} marked complete${waiver ? ` (${checksWord(count)} waived · source: ${sourceText(waiver.source)})` : ""}.`];
    }
    case "continued": return [`Operation ${op.id} completed. Kiln continues in its normal order${waiver ? ` (problem waived · source: ${sourceText(waiver.source)})` : ""}.`];
    case "checks_passed": return [`Operation ${op.id} completed. Every check passed when Kiln checked again, so nothing was waived and Kiln advanced.`];
    case "check_results_changed": return [
      `Operation ${op.id} completed. The results changed when Kiln checked again, so nothing was waived or advanced:`,
      ...(op.changes ?? []).map(c => `  ${c.check} · ${c.subject}: ${CHANGE_WORDS[c.change]}${c.after ? ` — ${c.after}` : c.before ? ` — was: ${c.before}` : ""}`),
      "Read kiln status for the new check run; to mark it complete, run again with --confirm, the new status token and a new command id.",
    ];
    default: return [`Operation ${op.id} completed: ${op.outcome ?? "completed"}.`];
  }
}

function refusalLine(code: string, message: string): string {
  const reason = message.replace(/\.?$/, ".");
  const hint = code === "mark_complete_not_offered" && /^no check has run since/i.test(message) ? " Run without --confirm to check again first." : "";
  // "Refused: no check has run since Phase 3 stopped." keeps an activity's name capitalized.
  const lead = /^(No|Nothing|The|This|A|An|Another|Mark)\b/.test(reason) ? `${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : reason;
  return `Refused: ${lead}${hint}`;
}
