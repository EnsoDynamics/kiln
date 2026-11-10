/**
 * Items an audit left for a person while Kiln carried on (AC-NEUTRAL-03). Derived, never stored:
 * the ledger is recomputed in activity order from immutable accepted version-2 results. A new
 * needsYou entry becomes `item-<n>`; an entry naming an outstanding `id` keeps that item open with
 * its latest wording; a `settled` entry closes it. An audit marked complete without an accepted
 * report neither adds nor settles, so what was outstanding carries to the next audit.
 *
 *   const ledger = personItems(stateDirectory, record.completionAudits!.activities, activity.sequence);
 *   ledger.outstanding // [{ id: "item-1", problem, action, listedBy: "Delivery audit round 1", … }]
 */
import type { AuditActivity } from "./contracts.js";
import { acceptedAudit } from "./effective-result.js";
import type { AuditStore } from "./storage.js";

export interface PersonItem { id: string; problem: string; action: string; listedBy: string; listedByActivityId: string }
export interface SettledPersonItem extends PersonItem { settledBy: string; settledByActivityId: string; how: string }
export interface PersonItemLedger { outstanding: PersonItem[]; settled: SettledPersonItem[] }

export const auditName = (activity: Pick<AuditActivity, "kind" | "round" | "continuationIndex">) =>
  `${activity.kind === "delivery_audit" ? "Delivery audit" : "Test audit"} round ${activity.round}${activity.continuationIndex > 1 ? ` continuation ${activity.continuationIndex}` : ""}`;

/** The ledger after every accepted audit sequenced before `before` (all of them when omitted). */
export function personItems(stateDirectory: string, activities: AuditActivity[], before = Infinity, store?: Pick<AuditStore, "read">): PersonItemLedger {
  const outstanding = new Map<string, PersonItem>(); const settled: SettledPersonItem[] = []; let next = 1;
  for (const activity of [...activities].filter(a => a.sequence < before).sort((a, b) => a.sequence - b.sequence)) {
    const accepted = acceptedAudit(stateDirectory, activity, store);
    if (accepted?.report.schemaVersion !== 2) continue;
    const name = auditName(activity);
    for (const entry of accepted.report.settled ?? []) {
      const item = outstanding.get(entry.id); if (!item) continue;
      outstanding.delete(entry.id); settled.push({ ...item, settledBy: name, settledByActivityId: activity.activityId, how: entry.how });
    }
    for (const entry of accepted.report.needsYou) {
      const item = entry.id ? outstanding.get(entry.id) : undefined;
      if (item) outstanding.set(item.id, { ...item, problem: entry.problem, action: entry.action });
      else { const id = `item-${next++}`; outstanding.set(id, { id, problem: entry.problem, action: entry.action, listedBy: name, listedByActivityId: activity.activityId }); }
    }
  }
  return { outstanding: [...outstanding.values()], settled };
}

/** The audit prompt's list of outstanding items, one per line. */
export const outstandingLines = (items: PersonItem[]) => items.map(item => `- ${item.id} (listed by ${item.listedBy}): ${item.problem} ${item.action}`).join("\n");
/** The final-delivery prompt's list of settled items, one per line. */
export const settledLines = (items: SettledPersonItem[]) => items.map(item => `- ${item.problem} Listed by ${item.listedBy}, settled by ${item.settledBy}: ${item.how}`).join("\n");
