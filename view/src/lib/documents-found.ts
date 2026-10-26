// What Documents found says, worked out from the snapshot: the found lines (PRD AC-START-04),
// the phase plan as drawn, and whether Start is available with the note under it (AC-START-05,
// AC-START-06; assumptions UI-010 items 4 and 12, UI-011).

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
export function effortDisabled(settings: Settings, effort: Effort): boolean {
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
  const usage = account.limits.length === 0 ? undefined : `Used: ${account.limits.map((limit) => `${limit.shortLabel} ${limit.percent === undefined ? "unknown" : `${limit.percent}%`}`).join(" · ")}`;
  return { ...(line ? { line } : {}), ...(usage ? { usage } : {}), ...(account.limitsError ? { usageError: account.limitsError } : {}) };
}
