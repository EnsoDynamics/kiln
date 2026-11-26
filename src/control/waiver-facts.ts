// Completion waivers as `kiln status`, receipts and the terminal show them (waivers "Snapshot and
// `kiln status`", AC-WAIVE-05, AC-WAIVE-10). Everything here reads the saved record and the
// marked check results; nothing decides coverage, which belongs to `applyWaivers` alone.

import { displayPath } from "../engine/worktree-setup.js";
import { auditName, auditNameFacts } from "../audit/audit-names.js";
import { activityKeyKind } from "../state/activity-keys.js";
import type { AuditActivity } from "../audit/contracts.js";
import type { CheckResult, PrdRecord } from "../state/records.js";
import { AUDIT_WARNING, checkCounts, checksWord, completeLabel, countsText, NO_REPORT_WARNING, PLAN_WARNING, READINESS_CHECK, type AuditWaiverResult, type CheckItem, type MarkCompleteOffer, type Waiver, type WaiverRef } from "../engine/waivers.js";
import { commandText } from "./result.js";
import { repositoryDetails } from "../engine/plan-repositories.js";
import { terminalColors, type TerminalColors } from "../terminal-output.js";

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
  /** A session of test fixes: the test audit loop it works from and its session (Kiln After Delivery AC-AUDIT-01). */
  fixing?: { loop?: number; session: number };
  state: "complete" | "running" | "needs_you" | "waiting" | "skipped" | "not_finished";
  status_label: string | null;
}

export const checkState = (check: CheckResult): CheckState => check.passed ? check.waived ? "waived" : "passed" : "failed";

export function projectRef(ref: WaiverRef): NonNullable<ProjectedItem["waived"]> {
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

/** A key's kind as a progress row names it, from the shared key classifier. */
function activityRowKind(key: string): string {
  const kind = activityKeyKind(key);
  return kind === "phase" ? "implementation" : kind;
}

function rowLabel(record: PrdRecord, key: string, kind: string): { label: string; title: string; fixing?: { loop?: number; session: number } } {
  const audit = key.startsWith("audit-") ? record.completionAudits?.activities.find(a => `audit-${a.activityId}` === key) : undefined;
  // An audit row is named for what it does; a session of test fixes also carries its loop and session (Kiln After Delivery AC-AUDIT-01, AC-BOT-02).
  if (audit) { const facts = auditNameFacts(record, audit); const name = auditName(facts); return { label: name.title, title: name.line ?? "", ...(facts.fixing ? { fixing: facts.fixing } : {}) }; }
  if (key === "pr" || kind === "final_delivery") return { label: "Final delivery", title: "" };
  if (activityKeyKind(key) === "preflight") return { label: "Preflight", title: "" };
  // The after-delivery rows read as the screens name them (Kiln After Delivery AC-BOT-02).
  if (activityKeyKind(key) === "merge") return { label: "Merge", title: "" };
  if (activityKeyKind(key) === "plan_push") return { label: "Push the plan", title: "" };
  return { label: `Phase ${key}`, title: record.plan?.find(p => p.id === key)?.title ?? "" };
}

/** Every activity Kiln has reached or skipped, in order, with its waiver facts (AC-WAIVE-10). */
export function progressRows(record: PrdRecord, runningKey: string | undefined, readAudit?: AuditWaiverReader): ProgressRow[] {
  const activities = (record.activities ?? []).map(a => ({ key: a.key, kind: a.kind as string }));
  for (const [key, facts] of Object.entries(record.phases)) if (!activities.some(a => a.key === key) && (facts.skippedByWaiver || facts.doneAt || facts.stop)) activities.push({ key, kind: activityRowKind(key) });
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
function itemName(check: string, item: { kind: string | null; subject: string | null }, label: (name: string) => string): string {
  if (item.kind === "development_requirement" && item.subject) return item.subject.split("/").join(" / ");
  if (item.kind === "repository_work" && item.subject) return `${check} · ${label(item.subject)}`;
  return check;
}

/**
 * The detail lines under an activity's terminal line: its warnings, its counts and each waived item
 * (the mockup's `kiln status` blocks), already indented by `indent`.
 */
export function waiverDetailLines(row: Pick<ActivityWaivers, "warnings" | "counts" | "checks" | "waived_checks">, indent: string, label: (name: string) => string = (name) => name): string[] {
  if (!row.waived_checks && !row.warnings.length) return [];
  const lines = row.warnings.map(w => `${indent}! ${w.text}`);
  if (row.counts && row.waived_checks) lines.push(`${indent}${countsText(row.counts)}`);
  for (const check of row.checks ?? []) for (const item of check.items) if (item.waived) {
    lines.push(`${indent}waived  ${itemName(check.name, item, label)}`);
    lines.push(`${indent}        ${item.text}`);
  }
  return lines;
}

const STATE_WORDS: Record<ProgressRow["state"], string> = { complete: "complete", running: "running", needs_you: "needs you", waiting: "waiting", skipped: "skipped", not_finished: "not finished" };

/** "Example feature · example-app · docs/prds/example-feature", from a status result. */
export function progressHeading(answer: Record<string, unknown>): string {
  const prd = answer.prd as { name?: string; directory?: string } | undefined;
  const label = statusLabels(answer);
  return [prd?.name, ((answer.repositories ?? []) as string[]).map(label).join(", "), prd?.directory].filter(Boolean).join(" · ");
}

/**
 * The label each repository is shown by, from a status result's `repository_details`
 * (find repositories anywhere AC-FOLDER-02); a name it doesn't list is shown as it is.
 *
 *   statusLabels({ repository_details: [{ name: "acme+admin", label: "acme/admin" }] })("acme+admin")  // "acme/admin"
 */
export function statusLabels(answer: Record<string, unknown>): (name: string) => string {
  const details = (answer.repository_details ?? []) as { name: string; label: string }[];
  return (name) => details.find((one) => one.name === name)?.label ?? name;
}

/**
 * The Pause now state as `kiln status`'s progress block matches it: the hold's launched key, since
 * the progress rows are keyed by the activity Kiln launched, while `pauseNow.activityKey` names the
 * leaf a split phase works on (Kiln Pause Now AC-PAUSE-03).
 */
export function statusPause(liveControl: unknown): { activityKey: string; phase: "pausing" | "paused" } | undefined {
  const live = liveControl as { pauseNow?: { phase: "pausing" | "paused" }; takeover?: { target?: { activityKey?: string } } } | null | undefined;
  const key = live?.takeover?.target?.activityKey;
  return live?.pauseNow && key ? { activityKey: key, phase: live.pauseNow.phase } : undefined;
}

/**
 * The progress block `kiln status` prints first in text mode (the mockup's `kiln status` blocks).
 * An activity under Pause now reads "pausing" or "paused" where it says "needs you"; its JSON state stays `needs_you`.
 */
export function progressText(heading: string, rows: readonly ProgressRow[], pauseNow?: { activityKey: string; phase: "pausing" | "paused" }, stopLines: readonly string[] = [], label: (name: string) => string = (name) => name): string {
  const labelWidth = Math.max(0, ...rows.map(r => r.label.length)) + 3;
  const titleWidth = rows.some(r => r.title) ? Math.max(...rows.map(r => r.title.length)) + 3 : 0;
  const indent = " ".repeat(labelWidth + titleWidth);
  const lines = [heading];
  for (const row of rows) {
    const suffix = row.state === "complete" ? waiverSuffix(row) : undefined;
    lines.push(`${row.label.padEnd(labelWidth)}${titleWidth ? row.title.padEnd(titleWidth) : ""}${pauseNow?.activityKey === row.key && row.state === "needs_you" ? pauseNow.phase : STATE_WORDS[row.state]}${suffix ? ` ${suffix}` : ""}`.trimEnd());
    lines.push(...waiverDetailLines(row, indent, label));
    // A stop that asks where a repository is lists its questions under its row, under the title column (find repositories anywhere, mockup state 7).
    if (row.state === "needs_you") lines.push(...stopLines.map(line => `${" ".repeat(labelWidth)}${line}`));
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
    offered: true, label: offer.label, heading: offer.heading, continue_in_order: offer.continueInOrder, ...(offer.hold ? { hold: offer.hold } : {}), check_run_id: offer.checkRunId,
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
export function previewLines(preview: Record<string, unknown>, checkedAt: string, label: (name: string) => string = (name) => name): string[] {
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
      if (item.kind === "development_requirement" || item.kind === "repository_work") lines.push(`    ${item.kind === "development_requirement" ? item.subject.split("/").join(" / ") : label(item.subject)}`);
      lines.push(`    ${item.text}`);
    }
  }
  const sentence = (preview.sentence ?? []) as string[];
  for (const extra of sentence.filter(line => !/^(Mark it complete|Continue anyway)\./.test(line))) lines.push(extra);
  lines.push(preview.hold === "complete" ? "Kiln would then complete the run, with each item under For you as still open and marked Waived."
    : preview.hold === "pull_request_session" ? "Kiln would then start the pull request session, with each item under For you as still open and marked Waived."
    : preview.continue_in_order === true
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
  if (!record) return key === "pr" ? "Final delivery" : activityKeyKind(key) === "audit" ? "The audit" : activityKeyKind(key) === "preflight" ? "Preflight" : `Phase ${key}`;
  const { label } = rowLabel(record, key, activityRowKind(key));
  return label;
}

/**
 * The label each repository is shown by in a receipt (find repositories anywhere AC-FOLDER-02):
 * from the PRD's record when the CLI has it, else from the answer's `repository_details`. A
 * subject that names no repository, such as a check's own subject, is shown as it is.
 */
function receiptLabels(answer: Record<string, unknown>, record?: PrdRecord): (name: string) => string {
  if (!record?.repository || !record.repositories) return statusLabels(answer);
  const details = repositoryDetails({ repository: record.repository, repositories: record.repositories, ...(record.plan ? { plan: record.plan } : {}) });
  return (name) => details.find((one) => one.name === name)?.label ?? name;
}

const CHANGE_WORDS = { newly_failing: "now fails", newly_passing: "now passes", text_changed: "changed" } as const;

/**
 * The human lines the CLI prints before a receipt's fields in text mode, for `waive-and-advance`
 * and for a failed recheck that carries a Mark complete preview (the mockup's state 5). Undefined
 * for every other receipt, whose text output is unchanged.
 */
export function receiptLines(answer: Record<string, unknown>, record?: PrdRecord, waiveCommand = false): string[] | undefined {
  const op = answer.operation as { id: string; action?: string; state: string; outcome: string | null; reason: string | null; updated_at: string; waiver_id?: string; located?: { repository: string; folder: string; label?: string; phase?: string; facts?: string[] }; changes?: { check: string; subject: string; change: keyof typeof CHANGE_WORDS; before?: string; after?: string }[]; instruction?: unknown; target?: string } | undefined;
  const preview = answer.mark_complete as Record<string, unknown> | undefined;
  const errors = (answer.errors ?? []) as { code: string; message: string }[];
  if (!op) {
    const refusal = errors[0];
    return refusal && waiveCommand ? [refusalLine(refusal.code, refusal.message)] : undefined;
  }
  if (op.action !== "waive-and-advance" && op.action !== "locate-repository" && !preview && !waiveCommand) return undefined;
  if (op.state === "refused") return [refusalLine(op.outcome ?? "refused", op.reason ?? "Kiln refused this instruction.")];
  if (op.state === "accepted" || op.state === "in_progress") return [`Operation ${op.id} accepted.`];
  if (op.state === "indeterminate") return [`Operation ${op.id} is indeterminate. ${op.reason ?? "Inspect its receipt before retrying."}`];
  if (op.state === "failed") return [op.outcome === "check_unavailable" ? `Operation ${op.id} failed: the check could not finish. ${op.reason ?? ""}`.trim() : `Operation ${op.id} failed: ${op.outcome ?? "failed"}. ${op.reason ?? ""}`.trim()];
  if (op.action === "locate-repository") return locatedLines(op);
  const label = receiptLabels(answer, record);
  if (preview) {
    const activity = preview.offered === true ? offeredActivity(preview) : "The activity";
    return [`Operation ${op.id} completed. ${activity} is still at Needs you.`, ...previewLines(preview, op.updated_at, label)];
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
      ...(op.changes ?? []).map(c => `  ${c.check} · ${label(c.subject)}: ${CHANGE_WORDS[c.change]}${c.after ? ` — ${c.after}` : c.before ? ` — was: ${c.before}` : ""}`),
      "Read kiln status for the new check run; to mark it complete, run again with --confirm, the new status token and a new command id.",
    ];
    default: return [`Operation ${op.id} completed: ${op.outcome ?? "completed"}.`];
  }
}

/**
 * `kiln command-status` for an answer to where a repository is (find repositories anywhere, "The command").
 *
 *   locatedLines({ id: "op_61a2", outcome: "located_phase_starting", located: { repository: "acme-labs/inventory", folder: "/Volumes/work/inventory", label: "inventory", phase: "Phase 4 · Restock check-in" } })
 *   // ["Operation op_61a2 completed. acme-labs/inventory is at /Volumes/work/inventory. Kiln will remember that on this computer.",
 *   //  "Added inventory. Phase 4 · Restock check-in is starting."]
 */
export function locatedLines(op: { id: string; outcome: string | null; reason: string | null; located?: { repository: string; folder: string; label?: string; phase?: string; facts?: string[] } }): string[] {
  const located = op.located;
  if (op.outcome === "folder_not_accepted") return [`Operation ${op.id} completed. Kiln didn’t accept ${located?.folder ?? "that folder"}: ${op.reason ?? ""}`.trimEnd()];
  if (!located) return [`Operation ${op.id} completed: ${op.outcome ?? "completed"}.`];
  const lead = `Operation ${op.id} completed. ${located.repository} is at ${displayPath(located.folder)}. Kiln will remember that on this computer.`;
  if (op.outcome === "located_phase_starting") return [lead, `Added ${located.label ?? located.repository}. ${located.phase} is starting.`];
  if (op.outcome === "located_still_stopped") return [lead, `${located.phase} is still at Needs you:`, ...(located.facts ?? []).map((fact) => `  ${fact}`)];
  return [lead];
}

function refusalLine(code: string, message: string): string {
  const reason = message.replace(/\.?$/, ".");
  const hint = code === "mark_complete_not_offered" && /^no check has run since/i.test(message) ? " Run without --confirm to check again first." : "";
  // "Refused: no check has run since Phase 3 stopped." keeps an activity's name capitalized.
  const lead = /^(No|Nothing|The|This|A|An|Another|Mark)\b/.test(reason) ? `${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : reason;
  return `Refused: ${lead}${hint}`;
}

/** An item for a person as `kiln status` JSON gives it (Kiln Deliver When Audit Loops Run Out AC-ITEM-02). */
export function projectPersonItem(item: import("../engine/engine.js").PersonItemView): Record<string, unknown> {
  return { id: item.id ?? null, kind: item.kind, words: item.words, problem: item.problem, action: item.action, waits_on: item.waitsOn ?? null, criterion: item.criterion ?? null, effect: item.effect, ...(item.waiver ? { waived: projectRef(item.waiver) } : {}) };
}

const EFFECT_WORDS = { stops: "stops the run", holds: "holds the run", goes_on: "Kiln goes on" } as const;
/** `kiln status` text: a stop's items, each with its kind, what it does and what waits on it. */
export function personItemsText(items: readonly Record<string, unknown>[] | null | undefined): string | undefined {
  if (!items?.length) return undefined;
  const lines = [`Kiln needs you for ${items.length === 1 ? "one thing" : `${items.length} things`}:`];
  for (const item of items) {
    const kind = (item.words as string | null) ?? (item.kind === null ? "Listed before item kinds" : "Other");
    lines.push(`  ${kind} (${EFFECT_WORDS[item.effect as keyof typeof EFFECT_WORDS]}${item.waived ? ", waived" : ""}): ${String(item.problem)} ${String(item.action)}`);
    if (item.waits_on) lines.push(`    What waits on it: ${String(item.waits_on)}`);
  }
  return lines.join("\n");
}

/**
 * A stop's questions in `kiln status`'s text form (find repositories anywhere, "The command"):
 * each question's sentences, the checkouts found, then the controls that answer it. On a terminal the
 * questions are light grey and the Controls line grey, as mockup state 7 draws them.
 *
 *   locateText(stop)
 *   // ["Phase plan reads: Kiln couldn’t find a checkout of acme-labs/inventory.",
 *   //  "It searched outward from ~/code/acme/, never above your home folder.",
 *   //  "Controls: locate-repository (available) · waive-and-advance (once a recheck still fails)"]
 */
export function locateText(stop: Record<string, unknown> | null | undefined, colors: Pick<TerminalColors, "grey" | "lightGrey"> = terminalColors({ isTTY: false }, {})): string[] {
  const questions = (stop?.locate ?? []) as { kind: string; address_path: string; label: string; phase_file: string | null; searched_from: string; searched_to: string | null; checkouts: { folder: string; remote: string; pickable: boolean }[]; available: boolean; reason: string | null }[];
  if (!questions.length) return [];
  const lines: string[] = [];
  for (const question of questions) {
    const lead = question.phase_file !== null ? "Phase plan reads: " : `A session asked for ${question.label}: `;
    const first = question.kind === "which" ? `Kiln found ${question.checkouts.filter(one => !(one as { remembered?: boolean }).remembered).length} checkouts of ${question.address_path}.` : question.checkouts.length ? `Kiln couldn’t find a checkout of ${question.address_path} that it can deliver to.` : `Kiln couldn’t find a checkout of ${question.address_path}.`;
    lines.push(colors.lightGrey(`${lead}${first}`));
    lines.push(colors.lightGrey(question.kind === "which" ? "Which should it use?" : `It searched outward from ${displayPath(question.searched_from)}/, ${question.searched_to === null ? "never above your home folder." : `as far as ${displayPath(question.searched_to)}/.`}`));
    for (const checkout of question.checkouts) lines.push(colors.lightGrey(`  ${displayPath(checkout.folder)}  ${checkout.remote}${checkout.pickable ? "" : "  (not on GitHub)"}`));
  }
  const first = questions[0]!;
  const mark = stop?.mark_complete as { offered?: boolean; reason?: string } | undefined;
  const waive = mark?.offered ? " · waive-and-advance (available)" : mark?.reason && /no check has run since/i.test(mark.reason) ? " · waive-and-advance (once a recheck still fails)" : "";
  lines.push(colors.grey(`Controls: locate-repository (${first.available ? "available" : first.reason ?? "unavailable"})${waive}`));
  return lines;
}
