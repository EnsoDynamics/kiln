import { sameLiveTarget, validLiveTarget } from "../live/target.js";
/** Identity of one stopped implementation attempt; provider IDs never cross this boundary. */
export interface PhaseRecoveryTarget {
  live?: import("../live/target.js").LiveTarget;
  executionId: string;
  phaseKey: string;
  sessionId: string;
  stoppedAt: string;
}

export type PhaseRecoveryOutcome = "resume_requested" | "already_complete" | "advanced" | "still_stopped";
export type PhaseRecoveryCode = "invalid_request" | "stale_target" | "busy" | "recovery_unavailable" | "message_review_required" | "check_unavailable" | "state_write_failed" | "folder_missing" | "folder_missing_resolved" | "terminal_in_use" | "ownership_unknown" | "branch_changed" | "branch_catch_up_failed" | "start_changed";
export interface PhaseRecoveryView {
  target: PhaseRecoveryTarget;
  /** Identifies the last actual turn; a refused launch can change the stop without a new turn. */
  attemptStartedAt?: string;
  completion: "complete" | "incomplete" | "unknown";
  checkError?: { reason: string; attemptedAt: string };
}

export function sameRecoveryTarget(a: PhaseRecoveryTarget | undefined, b: PhaseRecoveryTarget | undefined): boolean {
  return !!a && !!b && a.executionId === b.executionId && a.phaseKey === b.phaseKey && a.sessionId === b.sessionId && a.stoppedAt === b.stoppedAt && (!a.live && !b.live || sameLiveTarget(a.live, b.live));
}

export function validRecoveryTarget(value: unknown): value is PhaseRecoveryTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = ["executionId", "phaseKey", "sessionId", "stoppedAt"];
  return Object.keys(value).length === fields.length + ((value as PhaseRecoveryTarget).live ? 1 : 0) && (!(value as PhaseRecoveryTarget).live || validLiveTarget((value as PhaseRecoveryTarget).live)) && fields.every(key => typeof (value as Record<string, unknown>)[key] === "string" && (value as Record<string, string>)[key]!.trim() !== "");
}

/** A source read failed, as distinct from a completed check reporting unfinished work. */
export class CompletionCheckUnavailable extends Error {}
export class RecoveryStateWriteFailed extends Error {}
