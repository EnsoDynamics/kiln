/**
 * Items an audit left for a person while Kiln carried on (AC-NEUTRAL-03). Derived, never stored:
 * the ledger is recomputed in activity order from each audit's effective version-2 report, the
 * accepted one or, for an audit marked complete with a valid report, its waiver's (Kiln Deliver
 * When Audit Loops Run Out, "What each kind does"). A new needsYou entry becomes `item-<n>`; an
 * entry naming an outstanding `id` keeps that item open with its latest wording, and keeps its
 * kind, what waits on it and its criterion unless it gives new ones; a `settled` entry closes it.
 * Each item a marked-complete audit's report listed is covered by that audit's waiver, and stays
 * covered when listed again. An audit marked complete with no usable report neither adds nor
 * settles, so what was outstanding carries to the next audit.
 *
 *   const ledger = personItems(stateDirectory, record.completionAudits!.activities, activity.sequence);
 *   ledger.outstanding // [{ id: "item-1", kind: "blocker", problem, action, waitsOn, listedBy: "Delivery audit round 1", … }]
 */
import { PERSON_ITEM_KINDS, type AuditActivity, type AuditReport, type PersonItemKind } from "./contracts.js";
import { acceptedAudit } from "./effective-result.js";
import { AuditStore } from "./storage.js";
import type { AuditWaiverResult, Waiver, WaiverRef } from "../engine/waivers.js";
import { HOLD_CHECK } from "../engine/waivers.js";

export interface PersonItem {
  id: string; problem: string; action: string; listedBy: string; listedByActivityId: string; criterion?: string;
  /** Null only for an item listed before kinds existed (Upgrade); it holds the run. */
  kind: PersonItemKind | null;
  waitsOn?: string;
  /** The waiver of the audit marked complete whose report listed this item, which covers it (AC-ITEM-01). */
  auditWaiverId?: string;
  /** The name of that audit, for the audit prompt's mark. */
  auditWaivedBy?: string;
}
export interface SettledPersonItem extends PersonItem { settledBy: string; settledByActivityId: string; how: string }
export interface PersonItemLedger { outstanding: PersonItem[]; settled: SettledPersonItem[] }

export const auditName = (activity: Pick<AuditActivity, "kind" | "round" | "continuationIndex">) =>
  `${activity.kind === "delivery_audit" ? "Delivery audit" : "Test audit"} round ${activity.round}${activity.continuationIndex > 1 ? ` continuation ${activity.continuationIndex}` : ""}`;

/** The report an audit's items are read from, and the audit waiver that covers them when it was marked complete. */
function itemsReport(stateDirectory: string, activity: AuditActivity, store: Pick<AuditStore, "read">): { report: AuditReport; waiverId?: string } | undefined {
  if (activity.waivedResult && !activity.itemsUnread) {
    const waiver = store.read<AuditWaiverResult>(activity.waivedResult);
    return waiver.reportBytes !== undefined ? { report: JSON.parse(waiver.reportBytes) as AuditReport, waiverId: waiver.waiverId } : undefined;
  }
  const accepted = acceptedAudit(stateDirectory, activity, store);
  return accepted ? { report: accepted.report } : undefined;
}

/** The ledger after every settled audit sequenced before `before` (all of them when omitted). */
export function personItems(stateDirectory: string, activities: AuditActivity[], before = Infinity, store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): PersonItemLedger {
  const outstanding = new Map<string, PersonItem>(); const settled: SettledPersonItem[] = []; let next = 1;
  for (const activity of [...activities].filter(a => a.sequence < before).sort((a, b) => a.sequence - b.sequence)) {
    const read = itemsReport(stateDirectory, activity, store);
    if (read?.report.schemaVersion !== 2) continue;
    const name = auditName(activity);
    for (const entry of read.report.settled ?? []) {
      const item = outstanding.get(entry.id); if (!item) continue;
      outstanding.delete(entry.id); settled.push({ ...item, settledBy: name, settledByActivityId: activity.activityId, how: entry.how });
    }
    for (const entry of read.report.needsYou) {
      const item = entry.id ? outstanding.get(entry.id) : undefined;
      const kind = entry.kind && PERSON_ITEM_KINDS.includes(entry.kind) ? entry.kind : item?.kind ?? null;
      const criterion = entry.criterion ?? item?.criterion; const waitsOn = entry.waitsOn ?? item?.waitsOn;
      const waived = item?.auditWaiverId ? { auditWaiverId: item.auditWaiverId, auditWaivedBy: item.auditWaivedBy! } : read.waiverId ? { auditWaiverId: read.waiverId, auditWaivedBy: name } : {};
      const kept = { problem: entry.problem, action: entry.action, kind, ...(criterion ? { criterion } : {}), ...(waitsOn ? { waitsOn } : {}), ...waived };
      if (item) outstanding.set(item.id, { id: item.id, listedBy: item.listedBy, listedByActivityId: item.listedByActivityId, ...kept });
      else { const id = `item-${next++}`; outstanding.set(id, { id, listedBy: name, listedByActivityId: activity.activityId, ...kept }); }
    }
  }
  return { outstanding: [...outstanding.values()], settled };
}

/** What a kind does (AC-ITEM-01): a kind-less item from before kinds holds, since Kiln cannot sort it. */
export function itemEffect(kind: PersonItemKind | null): "stops" | "holds" | "goes_on" {
  return kind === "critical_next_step" ? "stops" : kind === "blocker" || kind === "business_question" || kind === null ? "holds" : "goes_on";
}

/**
 * The waiver covering an item, if any: the latest **Nothing holds the run** waiver whose item
 * names it by ledger id, or the waiver of the audit marked complete whose report listed it.
 */
export function itemWaiver(item: Pick<PersonItem, "id" | "auditWaiverId">, waivers: readonly Waiver[] | undefined): WaiverRef | undefined {
  const ref = (waiver: Waiver): WaiverRef => ({ waiverId: waiver.waiverId, activityKey: waiver.activityKey, at: waiver.at, ...waiver.source });
  const hold = (waivers ?? []).findLast(waiver => waiver.items.some(saved => saved.check === HOLD_CHECK && saved.subject === item.id && saved.against === item.id));
  if (hold) return ref(hold);
  const audit = item.auditWaiverId ? (waivers ?? []).find(waiver => waiver.waiverId === item.auditWaiverId) : undefined;
  return audit ? ref(audit) : undefined;
}

/** The words a kind opens its line with under **For you** (AC-ITEM-03); none for `other` or no kind. */
export function kindWords(kind: PersonItemKind | null): string | null {
  return kind === "critical_next_step" || kind === "critical" ? "Critical finding" : kind === "blocker" ? "Blocker" : kind === "business_question" ? "Business question" : kind === "test" ? "Test gap" : null;
}

/** One item's line under **For you**, built once and copied word for word everywhere it is shown. */
export function itemLine(item: Pick<PersonItem, "kind" | "problem" | "action">): string {
  const words = kindWords(item.kind);
  return `${words ? `${words}: ` : ""}${item.problem} ${item.action}`;
}

/**
 * The audit prompt's list of outstanding items, one per line, with each item's kind and what waits
 * on it, and the mark on an item a waiver covers.
 */
export function outstandingLines(items: PersonItem[], waivers?: readonly Waiver[]): string {
  return items.map(item => {
    const kind = item.kind ?? "no kind: give one when you list it again";
    const covered = itemWaiver(item, waivers);
    const how = covered ? (covered.waiverId === item.auditWaiverId ? `waived when ${item.auditWaivedBy} was marked complete` : "waived at final delivery") : undefined;
    const mark = how ? ` (${how}: settle it if it is done, otherwise list it again by its id; it holds nothing and is never a reason for \`needs_you\`. A need it does not name is a new entry with no id.)` : "";
    return `- ${item.id} (${kind}; listed by ${item.listedBy}${item.criterion ? `; criterion ${item.criterion}` : ""}${item.waitsOn ? `; waits on: ${item.waitsOn}` : ""}): ${item.problem} ${item.action}${mark}`;
  }).join("\n");
}
/** The final-delivery prompt's list of settled items, one per line. */
export const settledLines = (items: SettledPersonItem[]) => items.map(item => `- ${item.problem} Listed by ${item.listedBy}, settled by ${item.settledBy}: ${item.how}`).join("\n");
