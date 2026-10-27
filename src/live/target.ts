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
  target: LiveTarget; operationId: string; instructionId: string; requestedAt: string;
  state: "pending" | "released"; latestActivityAt?: string; observedAt: string; reason: string; handBackOperationId?: string;
}
export interface LiveView {
  target: LiveTarget; label: string; observedAt: string; available: boolean; reason: string;
  takeover?: TakeoverHold;
}

export function canonicalLiveTarget(target: LiveTarget): LiveTarget {
  return { executionId: target.executionId, activityId: target.activityId, activityKey: target.activityKey, sessionId: target.sessionId, providerSessionId: target.providerSessionId, attemptId: target.attemptId };
}
