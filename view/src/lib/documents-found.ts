// What Documents found says, worked out from the snapshot: the found lines (PRD AC-START-04),
// the phase plan as drawn, and whether Start is available with the note under it (AC-START-05,
// AC-START-06; assumptions UI-010 items 4 and 12, UI-011).

import { fiveHourNotReported, FIVE_HOUR_NOT_REPORTED } from "./claude-usage.js";
import type { Snapshot } from "../../../src/engine/snapshot.js";
import type { Effort } from "../../../src/state/records.js";

type Documents = NonNullable<Snapshot["documents"]>;
type Settings = Snapshot["settings"];

export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "14 acceptance criteria, AC-RET-01 to AC-RET-14" */
export function prdLine(prd: Documents["prd"]): string {
  const range = prd.firstLabel === undefined ? "" : prd.firstLabel === prd.lastLabel ? `, ${prd.firstLabel}` : `, ${prd.firstLabel} to ${prd.lastLabel}`;
  return `${plural(prd.criteriaCount, "acceptance criterion", "acceptance criteria")}${range}`;
}

/** "Cites all 14 criteria", or "Cites 12 of 14 criteria" */
export function designLine(design: Documents["design"], criteriaCount: number): string {
  if (criteriaCount > 0 && design.criteriaCited === criteriaCount) return `Cites all ${plural(criteriaCount, "criterion", "criteria")}`;
  return `Cites ${design.criteriaCited} of ${plural(criteriaCount, "criterion", "criteria")}`;
}

/** "11 assumptions, 2 not yet confirmed. They’re green lights; nothing waits on them." */
export function assumptionsLine(assumptions: Documents["assumptions"]): string {
  if (assumptions === null) return "No assumptions document.";
  return `${plural(assumptions.total, "assumption", "assumptions")}, ${assumptions.notYetConfirmed} not yet confirmed. They’re green lights; nothing waits on them.`;
}

/** The Linked documents line (Kiln Linked Documents AC-LINK-04): "1 not followed. Kiln starts anyway and tells the agent." */
export function linkedDocumentsLine(count: number): string {
  return `${count} not followed. Kiln starts anyway and tells the agent.`;
}

/**
 * The count above the phase list (UI-010 item 12): only the phases left to implement, with the
 * closed ones after it.
 *
 *   planCountLine({ leafCount: 5, closedCount: 1 })  // "4 phases to implement, in this order · 1 already closed"
 */
export function planCountLine(plan: Pick<Documents["plan"], "leafCount" | "closedCount">): string {
  const left = plan.leafCount - plan.closedCount;
  const closed = plan.closedCount > 0 ? ` · ${plan.closedCount} already closed` : "";
  if (left === 0) return `No phases left to implement · all ${plan.leafCount} already closed`;
  if (left === 1) return `1 phase to implement${closed}`;
  return `${left} phases to implement, in this order${closed}`;
}

/** Where What Kiln found read the plan, as AC-FROM-02 says it: the base branch, the chosen branch, or the base's latest commit after a catch-up. */
export function planSourceLine(start: NonNullable<Documents["start"]>): { lead: string; code: string; tail?: string } | undefined {
  const source = start.planSource;
  if (!source) return undefined;
  if (source.kind === "base_after_catch_up") return { lead: "Read from the latest commit on ", code: source.branch, tail: ", because the branch is brought up to date first" };
  return { lead: "Read from ", code: source.branch };
}

/** Where the closed marks were read: "that branch" for the chosen branch, else the base branch by name. */
function closedWhere(start: NonNullable<Documents["start"]>): { count: string; line: string } {
  const source = start.planSource;
  if (!source || source.kind === "branch") return { count: "that branch", line: "the branch" };
  return { count: source.branch, line: source.branch };
}

/** The count line with phases closed where the plan was read: "3 of 7 phases are already closed on that branch. Kiln starts at Phase 4." */
export function startCountLine(plan: Pick<Documents["plan"], "leafCount" | "closedCount">, start: Documents["start"]): string {
  if (start?.startAt && plan.closedCount > 0) return `${plan.closedCount} of ${plan.leafCount} phases ${plan.closedCount === 1 ? "is" : "are"} already closed on ${closedWhere(start).count}. Kiln starts at Phase ${start.startAt.id}.`;
  return planCountLine(plan);
}

/** The line beside Start naming the closed phases that won't run: "Phases 1–3 are closed on the branch and won't run." */
export function closedPhasesLine(phases: Documents["plan"]["phases"], start: Documents["start"]): string | undefined {
  if (!start?.startAt) return undefined;
  const closed = phases.filter(phase => phase.closed && !phase.splitInto).map(phase => phase.id);
  if (closed.length === 0) return undefined;
  const numbers = closed.map(Number);
  const consecutive = closed.length > 2 && numbers.every((value, index) => Number.isInteger(value) && (index === 0 || value === numbers[index - 1]! + 1));
  const named = consecutive ? `${closed[0]}–${closed.at(-1)}` : joinAnd(closed);
  const where = closedWhere(start).line;
  return closed.length === 1 ? `Phase ${named} is closed on ${where} and won't run.` : `Phases ${named} are closed on ${where} and won't run.`;
}

/** The help under an adopted worktree (AC-FROM-03 row 6): Kiln works there, with its count of uncommitted files. */
export function adoptedWorktreeHelp(uncommittedFiles: number | undefined): string {
  const files = uncommittedFiles === undefined ? "" : uncommittedFiles === 0 ? " It has no uncommitted files." : ` It has ${uncommittedFiles} uncommitted ${uncommittedFiles === 1 ? "file" : "files"}; the first session is told about them.`;
  return `The branch is checked out in this folder, so Kiln works here.${files} The branch and PR into are set once, before the first phase; model, effort and keep-awake can be changed later.`;
}

export interface PlanRow {
  id: string;
  title: string;
  closed: boolean;
  /** The repositories its document names (multi-repo AC-REPO-03). */
  repositories: string[];
  /** "split into 2a and 2b" for a split phase; its children follow nested under it. */
  splitNote?: string;
  children: PlanRow[];
}

/** The plan as drawn: every phase in order, a split phase's children nested under it. */
export function planRows(phases: Documents["plan"]["phases"]): PlanRow[] {
  const byId = new Map(phases.map((phase) => [phase.id, phase]));
  const childIds = new Set(phases.flatMap((phase) => phase.splitInto ?? []));
  const row = (id: string): PlanRow => {
    const phase = byId.get(id)!;
    const children = (phase.splitInto ?? []).filter((child) => byId.has(child)).map(row);
    return {
      id: phase.id,
      title: phase.title,
      closed: phase.closed,
      repositories: phase.repositories,
      ...(phase.splitInto ? { splitNote: `split into ${joinAnd(phase.splitInto)}` } : {}),
      children,
    };
  };
  return phases.filter((phase) => !childIds.has(phase.id)).map((phase) => row(phase.id));
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export const EFFORT_LABELS: Record<Effort, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
export const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** An effort button is disabled when the chosen model doesn't take that level (UI-011). */
export function effortDisabled(settings: Pick<Settings, "effortLevels">, effort: Effort): boolean {
  return settings.effortLevels !== null && !settings.effortLevels.includes(effort);
}

/** The Model list: the account's models, plus the saved model when the list doesn't offer it, named as saved. */
export function modelOptions(snapshot: Snapshot): { value: string; displayName: string }[] {
  const models = snapshot.models ?? [];
  const saved = snapshot.settings.model;
  return models.some((model) => model.value === saved.value) ? models : [...models, saved];
}

export interface StartState {
  enabled: boolean;
  /** The grey note under Start, when one applies. */
  note?: string;
}

/**
 * Whether Start can be pressed, and the note under it: unavailable until refinement is
 * confirmed, while any field message that holds Start shows, a repository row's included
 * (multi-repo AC-REPO-03), while setup or a base check runs, and while the view isn't connected.
 */
export function startState(snapshot: Snapshot, refinementConfirmed: boolean, connected: boolean): StartState {
  const { settings, documents, repositories } = snapshot;
  const multi = snapshot.feature.multiRepository;
  if (documents?.starting) return { enabled: false, note: multi ? "Setting up the worktrees…" : "Setting up the worktree…" };
  if (multi && (settings.baseCheck === "checking" || repositories.some((row) => row.baseCheck === "checking"))) return { enabled: false, note: "Checking the base branches on origin…" };
  if (settings.baseCheck === "checking") return { enabled: false, note: `Checking ${settings.baseBranch || "the base branch"} on origin…` };
  if (snapshot.billing?.pending) return { enabled: false, note: snapshot.settings.agentId === "codex" ? "Checking Codex information…" : "Checking Claude settings…" };
  if (snapshot.billing && !snapshot.billing.canLaunch) return { enabled: false, note: snapshot.billing.next?.readinessError ?? "Review billing before starting." };
  if (settings.metadataPending) return { enabled: false, note: "Reading agent information…" };
  if (!refinementConfirmed) return { enabled: false, note: "Confirm refinement to start." };
  const held = Object.values(settings.fieldErrors).some((message) => message !== undefined) || repositories.some((row) => row.fieldErrors.baseBranch !== undefined);
  return { enabled: connected && !held };
}

/** Documents found's account lines under Agent: the email and plan, then the usage line. */
export function accountLines(account: Snapshot["account"]): { line?: string; usage?: string; error?: string; usageError?: string } {
  if (account === undefined) return {};
  if (account.error !== undefined) return { error: account.error };
  const line = account.agentId === "codex"
    ? `${account.email ?? "Account identity unavailable"} · ${account.plan ?? "Plan unavailable"}`
    : [account.email, account.plan].filter((part) => part !== undefined).join(" · ") || undefined;
  const parts = account.limits.map((limit) => `${limit.shortLabel} ${limit.percent === undefined ? "unknown" : `${limit.percent}%`}`);
  if (fiveHourNotReported(account)) parts.push(FIVE_HOUR_NOT_REPORTED);
  const usage = parts.length === 0 ? undefined : `Used: ${parts.join(" · ")}`;
  return { ...(line ? { line } : {}), ...(usage ? { usage } : {}), ...(account.limitsError ? { usageError: account.limitsError } : {}) };
}
