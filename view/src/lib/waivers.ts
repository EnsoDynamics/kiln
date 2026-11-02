// How the screens show completion waivers (waivers technical design, "Display Contract"): a
// check met only through a waiver reads Waived, never Passed, each covered item carries its own
// Waived tag with the activity, time and source of its waiver, and counts report waived checks
// separately (AC-WAIVE-10). The counts and their wording are the engine's own.

import type { CheckCounts, Snapshot, WaiverView } from "../../../src/engine/snapshot.js";
import { checkCounts, checksWord, countsText, type CheckItem, type ItemChange, type WaiverRef, type WaiverSource } from "../../../src/engine/waivers.js";
import type { CheckResult } from "../../../src/state/records.js";
import { checkpointAgainst, type DeliveryCheckpoint } from "../../../src/state/development-delivery.js";

export { checksWord };
/** "3 passed · 1 waived", with failing checks counted when there are any. */
export const countsLine: (counts: CheckCounts) => string = countsText;
export const countsOf: (checks: readonly CheckResult[]) => CheckCounts = checkCounts;

/**
 * A check count where the hand-back page shows one: "3 of 4 passed" with nothing waived,
 * otherwise "3 passed · 1 waived" (AC-WAIVE-10).
 */
export function passedOf(counts: CheckCounts): string {
  return counts.waived ? countsLine(counts) : `${counts.passed} of ${counts.passed + counts.failed} passed`;
}

export type Verdict = "passed" | "waived" | "failed";
export function verdict(check: CheckResult): Verdict {
  return check.passed ? (check.waived ? "waived" : "passed") : "failed";
}

/** "Browser · alex · grokbot". */
export function sourceText(source: WaiverSource): string {
  return [source.via === "browser" ? "Browser" : "Command line", source.account, ...(source.by ? [source.by] : [])].join(" · ");
}

/** "11/1/2026, 7:16 PM". */
export function shortDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "7:16:20 PM". */
export function secondsTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** A development requirement's subject reads "checkpoint / requirement"; any other item, its failure text. */
export function itemName(item: Pick<CheckItem, "kind" | "subject" | "text">): string {
  return item.kind === "development_requirement" ? item.subject.replace("/", " / ") : item.text;
}

/** The activity a waiver came from, by name, from the snapshot's waivers. */
export function waiverActivity(snapshot: Snapshot, ref: Pick<WaiverRef, "waiverId" | "activityKey">): string {
  const found = snapshot.waivers?.find(one => one.id === ref.waiverId)?.activity;
  if (found) return found;
  if (ref.activityKey === "pr") return "Final delivery";
  return ref.activityKey.startsWith("audit-") ? (snapshot.activities?.find(row => row.id === ref.activityKey)?.title ?? "an audit") : `Phase ${ref.activityKey}`;
}

/** "waived at Phase 3, 11/1/2026, 7:16 PM · browser · alex". */
export function waiverTag(snapshot: Snapshot, ref: WaiverRef): string {
  return [`waived at ${waiverActivity(snapshot, ref)}, ${shortDateTime(ref.at)}`, ref.via === "browser" ? "browser" : "command line", ref.account, ...(ref.by ? [ref.by] : [])].join(" · ");
}

export interface FactLine {
  text: string;
  item?: CheckItem;
  change?: "new" | "changed";
}

/**
 * A check's fact lines with the items behind them: each failing item is one fact line, in the
 * same order (AC-WAIVE-11); an item no fact shows is listed after them. `changes` marks the items
 * a refused Mark complete reported as changed.
 */
export function factLines(check: CheckResult, changes: readonly ItemChange[] = []): FactLine[] {
  const items = [...(check.items ?? [])];
  const changeOf = (item: CheckItem | undefined): FactLine["change"] => {
    const found = item && changes.find(one => one.check === check.name && one.subject === item.subject);
    return found?.change === "newly_failing" ? "new" : found?.change === "text_changed" ? "changed" : undefined;
  };
  const lines: FactLine[] = check.facts.map(text => {
    const at = items.findIndex(item => item.text === text);
    const item = at === -1 ? undefined : items.splice(at, 1)[0];
    const change = changeOf(item);
    return { text, ...(item ? { item } : {}), ...(change ? { change } : {}) };
  });
  for (const item of items) { const change = changeOf(item); lines.push({ text: item.text, item, ...(change ? { change } : {}) }); }
  return lines;
}

/**
 * The note after a refused Mark complete (AC-WAIVE-04):
 * "The results changed since your last check. Nothing was marked complete. A new item, marked New above, is failing under Pushed. Review it, then choose again."
 */
export function changedNote(changes: readonly ItemChange[]): string {
  const under = (kind: ItemChange["change"]) => [...new Set(changes.filter(one => one.change === kind).map(one => one.check))];
  const list = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  const added = changes.filter(one => one.change === "newly_failing").length;
  const changed = changes.filter(one => one.change === "text_changed").length;
  const passing = changes.filter(one => one.change === "newly_passing").length;
  const parts = ["Nothing was marked complete."];
  if (added) parts.push(added === 1 ? `A new item, marked New above, is failing under ${list(under("newly_failing"))}.` : `${added} new items, marked New above, are failing under ${list(under("newly_failing"))}.`);
  if (changed) parts.push(changed === 1 ? `An item under ${list(under("text_changed"))}, marked Changed above, now fails differently.` : `${changed} items under ${list(under("text_changed"))}, marked Changed above, now fail differently.`);
  if (passing) parts.push(passing === 1 ? `An item under ${list(under("newly_passing"))} now passes.` : `${passing} items under ${list(under("newly_passing"))} now pass.`);
  parts.push(changes.length === 1 ? "Review it, then choose again." : "Review them, then choose again.");
  return parts.join(" ");
}

/**
 * What a waived item was checked against, in words (AC-WAIVE-09's "Checked against", waivers
 * mockup state 6), never a raw fingerprint: a development requirement by its checkpoint's
 * repository, environment and merge, repository work by its repository and short head.
 *
 *   againstText(item, check, checkpoints)  // "example-app · dev · merge eae98b13", "example-app · head 4c1a9e07"
 */
export function againstText(item: Pick<CheckItem, "kind" | "subject" | "against">, check: string, checkpoints: readonly Pick<DeliveryCheckpoint, "id" | "target">[] = []): string {
  const short = (sha: string) => /^[0-9a-f]{12,}$/.test(sha) ? sha.slice(0, 8) : sha;
  const heads = (against: string) => against.split(",").map(pair => { const [name = "", head = ""] = pair.split("="); return `${name} · head ${short(head)}`; }).join(", ");
  switch (item.kind) {
    case "phase_closed": return `Phase ${item.subject}, as a leaf of the plan`;
    case "repository_work": {
      const [head = "", dirty = ""] = item.against.split(":");
      return `${item.subject} · head ${short(head)}${dirty && dirty !== "clean" ? " with uncommitted changes" : ""}`;
    }
    case "known_problem": return check === "Completion audit readiness" ? "The saved completion audit state" : "The phase plan";
    case "development_requirement": {
      const at = item.against.lastIndexOf("@");
      const id = at < 0 ? item.against : item.against.slice(0, at);
      const result = at < 0 ? "unmerged" : item.against.slice(at + 1);
      const target = checkpoints.find(one => one.id === id)?.target;
      const where = target ? [target.repository.split("/").pop(), ...(target.environment ? [target.environment] : [])].join(" · ") : id;
      return `${where} · ${result === "unmerged" ? "not merged" : `merge ${short(result)}`}`;
    }
    case "other": return item.against.includes("=") ? heads(item.against) : "The saved audit result";
  }
}

/** A waived item's own words, without the subject its name already gives ("…: /deployed_sha does not match…"). */
export function waivedText(item: Pick<CheckItem, "kind" | "subject" | "text">): string {
  const prefix = `${itemName(item)}: `;
  return item.kind === "development_requirement" && item.text.startsWith(prefix) ? item.text.slice(prefix.length) : item.text;
}

/** When the waiver's coverage ends, by the kinds of item it waived (AC-WAIVE-09). */
export function coverageNote(items: readonly Pick<CheckItem, "kind">[]): string {
  const one = items.length === 1;
  const kinds = [...new Set(items.map(item => item.kind))];
  const ends: Record<CheckItem["kind"], string> = {
    development_requirement: "a replaced checkpoint, a new merge",
    repository_work: "a new commit, a change to uncommitted work",
    phase_closed: "a split of the phase",
    known_problem: "a change to the problem’s text",
    other: "a change to any feature branch",
  };
  return `Covers only ${one ? "this item" : "these items"} as checked. ${kinds.map(kind => ends[kind]).join(", ").replace(/^./, c => c.toUpperCase())} or any other failure needs its own check or waiver.`;
}

/** The waivers that waived something in a list of checks, oldest first. */
export function ownWaivers(views: readonly WaiverView[] | undefined): WaiverView[] {
  return [...(views ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * A checkpoint's requirements met by waiver, each with its latest waiver, for the delivery
 * panel's "verification (id): waived · time" lines (waivers mockup, "After marking complete").
 * A waiver counts only while its item's `against` is the checkpoint as it stands now (its merge
 * result, or a prerequisite's), so a waiver a new merge or a replaced checkpoint ended no longer
 * reads waived. A waiver is never evidence of a deployment or verification (AC-WAIVE-09).
 */
export function waivedRequirements(snapshot: Snapshot, checkpoint: Pick<DeliveryCheckpoint, "id" | "merge">, checkpoints: readonly Pick<DeliveryCheckpoint, "id" | "merge">[] = []): Map<string, WaiverView> {
  const found = new Map<string, WaiverView>();
  const current = (requirementId: string) => {
    const prerequisite = /^prerequisite:(.+)$/.exec(requirementId)?.[1];
    if (prerequisite === undefined) return checkpointAgainst(checkpoint);
    const owner = checkpoints.find(one => one.id === prerequisite);
    return owner ? checkpointAgainst(owner) : `${prerequisite}@unmerged`;
  };
  for (const waiver of snapshot.waivers ?? []) for (const item of waiver.items) {
    if (item.kind !== "development_requirement" || !item.subject.startsWith(`${checkpoint.id}/`)) continue;
    const requirementId = item.subject.slice(checkpoint.id.length + 1);
    if (item.against === current(requirementId)) found.set(requirementId, waiver);
  }
  return found;
}
