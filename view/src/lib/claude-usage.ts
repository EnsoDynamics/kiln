// Missing Claude session meters are display information, never recovery permission.
export const FIVE_HOUR_NOT_REPORTED = "5-hour: N/A (not reported)";

export function fiveHourNotReported(reading: {
  agentId?: string;
  limits: readonly { kind: string }[];
  limitsObservedAt?: string | null | undefined;
  limitsError?: string | undefined;
  error?: string | undefined;
  stale?: boolean | undefined;
  limitsStale?: boolean | undefined;
}): boolean {
  return reading.agentId !== "codex" && !!reading.limitsObservedAt && !reading.error && !reading.limitsError
    && !reading.stale && !reading.limitsStale && !reading.limits.some((row) => row.kind === "session");
}
