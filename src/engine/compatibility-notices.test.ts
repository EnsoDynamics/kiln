import { expect, it } from "vitest";
import type { CompatibilityNotice, PrdRecord } from "../state/records.js";
import { applyCodexHistoryReading, applyCodexHistoryReadings, clearNoticeForOtherVersion, liveContractAtLaunch, liveNoticeReason, noticeLines, statusCompatibility, writeNotice } from "./compatibility-notices.js";
import type { SessionRecord } from "../state/records.js";

const notice = (overrides: Partial<CompatibilityNotice> = {}): CompatibilityNotice => ({ feature: "codex_history", agentId: "codex", agentVersion: "0.167.0", detail: "record type future_record is not recognised", observedAt: "2026-11-03T20:00:00Z", ...overrides });

it("keeps at most one notice per feature, replacing it on a later failure", () => {
  const record = {} as PrdRecord;
  expect(writeNotice(record, notice())).toBe(true);
  expect(writeNotice(record, notice({ feature: "takeover", agentId: "claude_code", agentVersion: "2.1.320", detail: "hook input has no tool_use_id", attemptId: "a1" }))).toBe(true);
  expect(writeNotice(record, notice({ agentVersion: "0.168.0" }))).toBe(true);
  expect(record.compatibility!.map(one => [one.feature, one.agentVersion])).toEqual([["takeover", "2.1.320"], ["codex_history", "0.168.0"]]);
  expect(writeNotice(record, notice({ agentVersion: "0.168.0" }))).toBe(false);
});

it("drops a notice only on a use with a different version of that agent", () => {
  const record = {} as PrdRecord; writeNotice(record, notice());
  expect(clearNoticeForOtherVersion(record, "codex_history", "0.167.0")).toBe(false);
  expect(clearNoticeForOtherVersion(record, "takeover", "0.166.0")).toBe(false);
  expect(record.compatibility).toHaveLength(1);
  expect(clearNoticeForOtherVersion(record, "codex_history", "0.166.0")).toBe(true);
  expect(record.compatibility).toBeUndefined();
});

it("words each notice as `<feature> unavailable with <agent> <version>: <detail>` and projects status fields", () => {
  const record = { compatibility: [notice(), notice({ feature: "live_messages", agentId: "claude_code", agentVersion: "unrecognised", detail: "user_message_uuids is not an array of strings", attemptId: "a2" })] } as PrdRecord;
  expect(noticeLines(record)).toEqual([
    "Codex command evidence unavailable with Codex 0.167.0: record type future_record is not recognised",
    "Message Claude unavailable with Claude Code unrecognised: user_message_uuids is not an array of strings",
  ]);
  expect(statusCompatibility(record)).toEqual([
    { feature: "codex_history", agent: "codex", agent_version: "0.167.0", detail: "record type future_record is not recognised", attempt_id: null, observed_at: "2026-11-03T20:00:00Z" },
    { feature: "live_messages", agent: "claude_code", agent_version: "unrecognised", detail: "user_message_uuids is not an array of strings", attempt_id: "a2", observed_at: "2026-11-03T20:00:00Z" },
  ]);
  expect(statusCompatibility({} as PrdRecord)).toEqual([]);
});

it("records a Codex evidence read's schema failures against the session's latest launch profile version, and clears them only on another version", () => {
  const profile = (version: string) => ({ codex: { profile: { version } } });
  const session = (versions: string[]) => ({ runs: [{}, ...versions.map(profile)], codex: { launchIntent: { version: "0.162.1" } } }) as unknown as SessionRecord;
  const record = {} as PrdRecord; const at = "2026-11-03T21:00:00Z";
  expect(applyCodexHistoryReading(record, session(["0.166.0", "0.167.0"]), ["history record type future_record is not recognised"], at)).toBe(true);
  expect(record.compatibility).toEqual([{ feature: "codex_history", agentId: "codex", agentVersion: "0.167.0", detail: "history record type future_record is not recognised", observedAt: at }]);
  expect(applyCodexHistoryReading(record, session(["0.167.0"]), undefined, at)).toBe(false);
  expect(record.compatibility).toHaveLength(1);
  expect(applyCodexHistoryReading(record, session([]), undefined, at)).toBe(true);
  expect(record.compatibility).toBeUndefined();
  applyCodexHistoryReading(record, { runs: [] } as unknown as SessionRecord, ["agent message content block type audio is not recognised"], at);
  expect(record.compatibility![0]!.agentVersion).toBe("unrecognised");
});

it("keeps a notice one session in a multi-session pass writes, however the sessions are ordered", () => {
  const session = (version: string) => ({ runs: [{ codex: { profile: { version } } }] }) as unknown as SessionRecord;
  const at = "2026-11-03T21:00:00Z"; const detail = ["exec_command parameter environment_id is not recognised, so that command has no receipt"];
  for (const order of [[0, 1], [1, 0]]) {
    const record = {} as PrdRecord;
    const readings = [{ session: session("0.167.0"), compatibility: detail }, { session: session("0.168.0"), compatibility: undefined }];
    expect(applyCodexHistoryReadings(record, order.map(i => readings[i]!), at)).toBe(true);
    expect(record.compatibility).toEqual([{ feature: "codex_history", agentId: "codex", agentVersion: "0.167.0", detail: detail[0], observedAt: at }]);
  }
  const record = { compatibility: [{ feature: "codex_history", agentId: "codex", agentVersion: "0.167.0", detail: detail[0]!, observedAt: at }] } as PrdRecord;
  expect(applyCodexHistoryReadings(record, [{ session: session("0.167.0"), compatibility: undefined }, { session: session("0.168.0"), compatibility: undefined }], at)).toBe(true);
  expect(record.compatibility).toBeUndefined();
});

it("starts a live contract unrecognised on the Claude Code version its notice names, and drops a notice naming another version", () => {
  const record = {} as PrdRecord;
  writeNotice(record, notice({ feature: "live_messages", agentId: "claude_code", agentVersion: "2.1.320", detail: "user_message_uuids was not a list of message IDs" }));
  writeNotice(record, notice({ feature: "takeover", agentId: "claude_code", agentVersion: "2.1.320", detail: "PreToolUse hook input had no tool_use_id" }));
  expect(liveContractAtLaunch(record, "live_messages", "2.1.320")).toEqual({ contract: "unrecognised", changed: false });
  expect(liveNoticeReason(record, "live_messages")).toBe("Message Claude unavailable with Claude Code 2.1.320: user_message_uuids was not a list of message IDs.");
  expect(liveContractAtLaunch(record, "takeover", "2.1.321")).toEqual({ contract: "unproven", changed: true });
  expect(record.compatibility!.map(one => one.feature)).toEqual(["live_messages"]);
  expect(liveContractAtLaunch(record, "takeover", "2.1.321")).toEqual({ contract: "unproven", changed: false });
  expect(liveNoticeReason(record, "takeover")).toBeUndefined();
});
