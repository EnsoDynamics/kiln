/**
 * The one classifier for an activity key (build preflight technical design, "Data Models"):
 * every reader that tells a key's kind apart uses it, so a preflight is never read as a phase
 * and a later activity kind is added here alone. No Node imports: the browser view uses it too.
 *
 *   activityKeyKind("2a")             // "phase"
 *   activityKeyKind("audit-<id>")     // "audit"
 *   activityKeyKind("preflight-<id>") // "preflight"
 *   activityKeyKind("pr")             // "final_delivery"
 *   activityKeyKind("merge")          // "merge"
 */
export type ActivityKeyKind = "phase" | "audit" | "preflight" | "final_delivery" | "merge";

export const FINAL_DELIVERY_KEY = "pr";
/** The merge activity of a finished execution (Kiln After Delivery, "After-Delivery Activities"). */
export const MERGE_KEY = "merge";
export const PREFLIGHT_KEY_PREFIX = "preflight-";
export const AUDIT_KEY_PREFIX = "audit-";

export function activityKeyKind(key: string): ActivityKeyKind {
  if (key === FINAL_DELIVERY_KEY) return "final_delivery";
  if (key === MERGE_KEY) return "merge";
  if (key.startsWith(AUDIT_KEY_PREFIX)) return "audit";
  if (key.startsWith(PREFLIGHT_KEY_PREFIX)) return "preflight";
  return "phase";
}

export const isPreflightKey = (key: string | undefined): boolean => key !== undefined && activityKeyKind(key) === "preflight";
export const isAuditKey = (key: string | undefined): boolean => key !== undefined && activityKeyKind(key) === "audit";
/** A phase's key: neither an audit, a preflight, final delivery nor an after-delivery activity. */
export const isPhaseKey = (key: string | undefined): boolean => key !== undefined && activityKeyKind(key) === "phase";
export const preflightKey = (activityId: string): string => `${PREFLIGHT_KEY_PREFIX}${activityId}`;
