/** Exact attempt identity shared by browser, journal and provider gate. */
export interface LiveTarget {
  executionId: string; activityId: string; activityKey: string;
  sessionId: string; providerSessionId: string; attemptId: string;
}
export function validLiveTarget(raw: unknown): raw is LiveTarget {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const keys = ["executionId", "activityId", "activityKey", "sessionId", "providerSessionId", "attemptId"];
  return Object.keys(raw).length === keys.length && keys.every(k => typeof (raw as Record<string, unknown>)[k] === "string" && !!(raw as Record<string, string>)[k] && (raw as Record<string, string>)[k]!.length < 256);
}
export const sameLiveTarget = (a: LiveTarget | undefined, b: LiveTarget | undefined): boolean => !!a && !!b && Object.keys(a).every(k => a[k as keyof LiveTarget] === b[k as keyof LiveTarget]);
export interface TakeoverHold {
  kind?: "delivery_recovery";
  target: LiveTarget; operationId: string; instructionId: string; requestedAt: string;
  state: "pending" | "released"; latestActivityAt?: string; observedAt: string; reason: string; handBackOperationId?: string;
}
export interface LiveView {
  target: LiveTarget; label: string; observedAt: string; available: boolean; reason: string;
  input?: { available: boolean; reason: string; pending: number };
  messages?: MessageSummary[];
  reviewRequired?: string[];
  takeover?: TakeoverHold;
}

export function canonicalLiveTarget(target: LiveTarget): LiveTarget {
  return { executionId: target.executionId, activityId: target.activityId, activityKey: target.activityKey, sessionId: target.sessionId, providerSessionId: target.providerSessionId, attemptId: target.attemptId };
}

/** Immutable text and correlated evidence live in the authoritative journal receipt. */
export interface LiveMessage {
  text: string; uuid: string;
  delivery: "submitting" | "submitted" | "received" | "not_sent" | "uncertain";
  writeStartedAt?: string; writeCompletedAt?: string; writeSettledAt?: string;
  receivedAt?: string; resultAt?: string; reviewedAt?: string; resolvedBy?: string;
  evidence?: { eventUuid?: string; uuids: string[]; at: string; result: boolean }[];
}
export interface MessageSummary { id: string; instructionId: string; acceptedAt: string; delivery: LiveMessage["delivery"]; reviewedAt?: string }
export function messageProblem(text: unknown): string | undefined {
  if (typeof text !== "string" || !text.trim()) return "Enter a nonempty plain text message.";
  if (text.length > 4000) return "The message exceeds 4,000 UTF-16 code units; nothing was truncated.";
  if (text.includes("\0") || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) return "Messages cannot contain NUL or malformed Unicode.";
  return undefined;
}
export function consumedUuids(event: Record<string, unknown>): string[] {
  if (event.type !== "assistant" && event.type !== "result") return [];
  const values = [...(typeof event.user_message_uuid === "string" ? [event.user_message_uuid] : []), ...(Array.isArray(event.user_message_uuids) ? event.user_message_uuids : [])];
  return [...new Set(values.filter((v): v is string => typeof v === "string"))];
}
