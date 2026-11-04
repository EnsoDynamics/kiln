// Compatibility notices (AC-AGENT-04): the PRD record's memory of the agent version on which a
// feature found the information it needs missing or changed. At most one per feature; a later
// failure replaces it, and the feature's next use on a different version of that agent removes it
// unless that use writes its own (technical design, Compatibility notices row).
import { AGENT_NAMES, type CompatibilityNotice, type CompatibilityFeature, type PrdRecord, type SessionRecord } from "../state/records.js";

const featureNames: Record<CompatibilityFeature, string> = { live_messages: "Message Claude", takeover: "Pause & take over", codex_history: "Codex command evidence" };

/** `<feature> unavailable with <agent> <version>: <detail>` */
export const noticeText = (notice: CompatibilityNotice): string =>
  `${featureNames[notice.feature]} unavailable with ${AGENT_NAMES[notice.agentId]} ${notice.agentVersion}: ${notice.detail}`;

/** Write (or replace) the feature's notice. Returns whether the record changed. */
export function writeNotice(record: PrdRecord, notice: CompatibilityNotice): boolean {
  const others = (record.compatibility ?? []).filter(one => one.feature !== notice.feature);
  const before = JSON.stringify(record.compatibility ?? []);
  record.compatibility = [...others, notice];
  return JSON.stringify(record.compatibility) !== before;
}

/** A use of the feature on `agentVersion` that wrote no notice: drop one naming another version. */
export function clearNoticeForOtherVersion(record: PrdRecord, feature: CompatibilityFeature, agentVersion: string): boolean {
  const notice = record.compatibility?.find(one => one.feature === feature);
  if (!notice || notice.agentVersion === agentVersion) return false;
  record.compatibility = record.compatibility!.filter(one => one !== notice);
  if (!record.compatibility.length) delete record.compatibility;
  return true;
}

/** The notices as the browser view shows them, one line each. */
export const noticeLines = (record: PrdRecord): string[] => (record.compatibility ?? []).map(noticeText);

/** `kiln status`'s `compatibility` field: the record's notices in the result's snake_case. */
export const statusCompatibility = (record: PrdRecord) => (record.compatibility ?? []).map(notice => ({
  feature: notice.feature, agent: notice.agentId, agent_version: notice.agentVersion, detail: notice.detail, attempt_id: notice.attemptId ?? null, observed_at: notice.observedAt,
}));

/**
 * One Codex command evidence read: schema failures write a `codex_history` notice giving the read
 * session's latest launch profile version; a read that finds none, of a session on another Codex
 * version, clears a notice naming a different version. Returns whether the record changed.
 */
export function applyCodexHistoryReading(record: PrdRecord, session: CodexReadSession, compatibility: string[] | undefined, observedAt: string): boolean {
  return applyCodexHistoryReadings(record, [{ session, compatibility }], observedAt);
}
type CodexReadSession = Pick<SessionRecord, "runs" | "codex">;
const launchVersion = (session: CodexReadSession) => session.runs.findLast(run => run.codex)?.codex?.profile.version ?? session.codex?.launchIntent.version ?? "unrecognised";

/**
 * Several sessions read in one pass: a session's clean read never clears a notice another session
 * in the same pass wrote, so one read of a run can't hide a command that had no receipt.
 */
export function applyCodexHistoryReadings(record: PrdRecord, readings: { session: CodexReadSession; compatibility: string[] | undefined }[], observedAt: string): boolean {
  const failed = readings.findLast(reading => reading.compatibility?.length);
  if (failed) return writeNotice(record, { feature: "codex_history", agentId: "codex", agentVersion: launchVersion(failed.session), detail: failed.compatibility!.join("; "), observedAt });
  let changed = false;
  for (const reading of readings) changed = clearNoticeForOtherVersion(record, "codex_history", launchVersion(reading.session)) || changed;
  return changed;
}
