/**
 * **For you** (Kiln Deliver When Audit Loops Run Out AC-ITEM-03, "For you"): every item outstanding
 * at delivery, critical findings first, then the rest in listing order, then the person actions the
 * requirements place after delivery. Each item's line is built here once and copied word for word
 * into each pull request's description, the finished page and `kiln status`; the Waived tag of an
 * item a waiver covers is rendered after its line from `waiver`.
 *
 *   const block = forYou(stateDirectory, record);
 *   // { items: [{ id: "item-2", kind: "critical", words: "Critical finding", line: "Critical finding: …", … }], afterDelivery: ["Release to production."] }
 */
import type { PrdRecord } from "../state/records.js";
import type { AuditWaiverResult, WaiverRef } from "../engine/waivers.js";
import type { AuditActivity, AuditReport } from "./contracts.js";
import { acceptedAudit } from "./effective-result.js";
import { itemLine, itemWaiver, kindWords, personItems, settledLines, type PersonItem } from "./person-items.js";
import { AuditStore } from "./storage.js";

export interface ForYouItem extends PersonItem { line: string; words: string | null; waiver?: WaiverRef }
export interface ForYou { items: ForYouItem[]; afterDelivery: string[] }

export function forYou(stateDirectory: string, record: Pick<PrdRecord, "completionAudits" | "waivers">, store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): ForYou {
  const activities = record.completionAudits?.activities ?? [];
  const ledger = personItems(stateDirectory, activities, Infinity, store);
  const items = ledger.outstanding.map(item => {
    const waiver = itemWaiver(item, record.waivers);
    return { ...item, line: itemLine(item), words: kindWords(item.kind), ...(waiver ? { waiver } : {}) };
  });
  const critical = (item: ForYouItem) => item.kind === "critical_next_step" || item.kind === "critical";
  return { items: [...items.filter(critical), ...items.filter(item => !critical(item))], afterDelivery: afterDeliveryActions(stateDirectory, activities, store) };
}

/**
 * The after-delivery actions on the latest accepted report of each kind, whatever its outcome, once
 * each. An audit marked complete with a valid report counts as accepted, as it does for items.
 */
export function afterDeliveryActions(stateDirectory: string, activities: AuditActivity[], store: Pick<AuditStore, "read"> = new AuditStore(stateDirectory)): string[] {
  const reportOf = (activity: AuditActivity): AuditReport | undefined => {
    if (activity.waivedResult && !activity.itemsUnread) {
      const waiver = store.read<AuditWaiverResult>(activity.waivedResult);
      return waiver.reportBytes !== undefined ? JSON.parse(waiver.reportBytes) as AuditReport : undefined;
    }
    return acceptedAudit(stateDirectory, activity, store)?.report;
  };
  const latest = (["delivery_audit", "test_audit"] as const).flatMap(kind => {
    for (const activity of activities.filter(a => a.kind === kind).sort((a, b) => b.sequence - a.sequence)) {
      const report = reportOf(activity);
      if (report) return [{ activity, report }];
    }
    return [];
  }).sort((a, b) => a.activity.sequence - b.activity.sequence);
  const actions = latest.flatMap(({ report }) => report.schemaVersion === 2 ? report.afterDeliveryActions ?? [] : report.pendingHumanActions.filter(action => action.beyondDelivery && !action.result).map(action => action.action));
  return [...new Set(actions)];
}

/**
 * The block each pull request's description opens with: **For you** when it lists anything, then
 * **Settled during the build**. `tag` renders an item's Waived tag.
 */
export function deliveryBlock(block: ForYou, settled: ReturnType<typeof personItems>["settled"], tag: (ref: WaiverRef) => string): string {
  const lines = [...block.items.map(item => `- ${item.line}${item.waiver ? ` (Waived: ${tag(item.waiver)})` : ""}`), ...block.afterDelivery.map(action => `- ${action}`)];
  return [
    ...(lines.length ? [`## For you\n\n${lines.join("\n")}`] : []),
    ...(settled.length ? [`## Settled during the build\n\n${settledLines(settled)}`] : []),
  ].join("\n\n");
}
