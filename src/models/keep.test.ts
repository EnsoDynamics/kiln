// A choice saved before per-activity choices (Kiln Phase Model Tiers AC-KEEP-02, KEEP-001,
// KEEP-003; technical design "Migration to schema 27" and "Settings saved outside the PRD record").

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionFiles } from "../session/claude-session.js";
import { appendJsonLine } from "../state/state-files.js";
import { migrateRecord, readSessionRecord, SCHEMA_VERSION, writeSessionRecord, type PrdRecord, type SessionRecord } from "../state/records.js";
import { newPrdRecord } from "../state/new-record.js";
import { continuedModelChoices, convertAcceptanceSettings, isCurrentDefault } from "./keep.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kiln-keep-")); mkdirSync(dir, { recursive: true }); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A schema 25 record with one PRD-wide choice. */
function schema25(agentId: "claude_code" | "codex", choice: { model: string; effort?: string }, phases: PrdRecord["phases"] = {}): PrdRecord {
  const record = newPrdRecord({ mainCheckoutPath: "/work/acme-shop", repositoryName: "acme-shop", github: "acme/acme-shop", prdDirectoryFromRoot: "docs/prds/customer-returns", featureName: "Customer returns", settings: { workspaceFolder: "/work/.worktrees/customer-returns", worktreePath: "/work/.worktrees/customer-returns/acme-shop", featureBranch: "feature/customer-returns", baseBranch: "develop", bases: {}, keepAwake: true, resumeAfterUsageLimit: true, auditLoops: { deliveryLimit: 4, testLimit: 4 }, modelChoices: { phases: {} } } });
  const settings = record.settings as unknown as Record<string, unknown>;
  delete settings.modelChoices;
  Object.assign(settings, { agentId, selectionGeneration: 3, agentChoices: { [agentId]: choice } });
  return Object.assign(record, { schemaVersion: 25, phases });
}
function session(id: string, phaseId: string, events: object[]): SessionRecord {
  const record: SessionRecord = { schemaVersion: SCHEMA_VERSION, agentId: "claude_code", sessionId: id, phaseId, kind: "phase", createdAt: "2026-11-01T10:00:00.000Z", model: "opus", modelDisplayName: "Opus 5.5", effort: "high", runs: [{ startedAt: "2026-11-01T10:00:00.000Z", endedAt: "2026-11-01T10:05:00.000Z", cause: "launch" }], sleeps: [], steps: [] };
  writeSessionRecord(dir, record);
  for (const [index, event] of events.entries()) appendJsonLine(sessionFiles(dir, record).events, { at: `2026-11-01T10:0${index}:00.000Z`, event });
  return record;
}
const facts = (ids: string[]) => ({ sessionIds: ids, finishedByPerson: false, repositories: {} });
const RESPONSE = { type: "assistant", message: { model: "claude-opus-5-5", content: [] } };
const INIT = { type: "system", subtype: "init", model: "claude-opus-5-5" };
const REFUSED = { type: "assistant", message: { model: "<synthetic>", content: [] }, error: "rate_limit" };

describe("Kiln's current default (KEEP-001)", () => {
  it("is Claude Code · Opus · medium, or Codex · any GPT Sol version · high, and nothing else", () => {
    expect(isCurrentDefault({ agentId: "claude_code", model: "opus", effort: "medium" })).toBe(true);
    expect(isCurrentDefault({ agentId: "codex", model: "gpt-6.1-sol", effort: "high" })).toBe(true);
    expect(isCurrentDefault({ agentId: "codex", model: "gpt-7-sol", effort: "high" })).toBe(true);
    expect(isCurrentDefault({ agentId: "claude_code", model: "opus", effort: "high" })).toBe(false);
    expect(isCurrentDefault({ agentId: "codex", model: "gpt-6.1-sol", effort: "medium" })).toBe(false);
    expect(isCurrentDefault({ agentId: "codex", model: "gpt-6-astra", effort: "high" })).toBe(false);
  });
});

describe("migrating to schema 27 (AC-KEEP-02's table)", () => {
  it("keeps the saved choice when an activity had started, whatever the choice", () => {
    session("s1", "1", [INIT, RESPONSE]);
    const record = migrateRecord(schema25("claude_code", { model: "opus", effort: "medium" }, { "1": facts(["s1"]) }), dir);
    expect(record.settings.modelChoices).toEqual({ phases: {}, kept: { agentId: "claude_code", model: "opus", effort: "medium" } });
    expect(record.phases["1"]!.startedSessionId).toBe("s1");
    // The first response is derived once from the saved events and saved on the session.
    expect(readSessionRecord(dir, "1", "s1")!.firstResponseAt).toBe("2026-11-01T10:01:00.000Z");
  });

  it("drops Kiln's current default when nothing had started, so the activities take their tiers", () => {
    session("s1", "1", [INIT, REFUSED]);
    const record = migrateRecord(schema25("claude_code", { model: "opus", effort: "medium" }, { "1": facts(["s1"]) }), dir);
    expect(record.settings.modelChoices).toEqual({ phases: {} });
    expect(record.phases["1"]!.startedSessionId).toBeUndefined();
    expect(migrateRecord(schema25("codex", { model: "gpt-6.1-sol", effort: "high" }), dir).settings.modelChoices).toEqual({ phases: {} });
  });

  it("keeps any other saved choice, an earlier default such as Opus at high included", () => {
    expect(migrateRecord(schema25("claude_code", { model: "opus", effort: "high" }), dir).settings.modelChoices.kept).toEqual({ agentId: "claude_code", model: "opus", effort: "high" });
    expect(migrateRecord(schema25("codex", { model: "gpt-6-astra", effort: "high" }), dir).settings.modelChoices.kept).toEqual({ agentId: "codex", model: "gpt-6-astra", effort: "high" });
  });

  it("sets nothing for a choice with no model, and removes the retired fields", () => {
    const record = migrateRecord(schema25("codex", { model: "" }), dir);
    expect(record.settings.modelChoices).toEqual({ phases: {} });
    for (const retired of ["agentId", "selectionGeneration", "agentChoices", "model", "effort"]) expect(record.settings).not.toHaveProperty(retired);
    expect(record.schemaVersion).toBe(27);
  });

  it("starts the activity on the first of its sessions, in creation order, that got a response", () => {
    session("s1", "2", [INIT, REFUSED]); session("s2", "2", [INIT, RESPONSE]); session("s3", "2", [INIT, RESPONSE]);
    expect(migrateRecord(schema25("claude_code", { model: "opus", effort: "medium" }, { "2": facts(["s1", "s2", "s3"]) }), dir).phases["2"]!.startedSessionId).toBe("s2");
    // Every session gets its first response, so a finished row can read its latest session's.
    expect(readSessionRecord(dir, "2", "s3")!.firstResponseAt).toBeDefined();
    expect(readSessionRecord(dir, "2", "s1")!.firstResponseAt).toBeUndefined();
  });

  it("derives a Codex session's start from its saved item notifications", () => {
    const record: SessionRecord = { ...session("c1", "1", []), agentId: "codex", model: "gpt-6.1-sol" };
    writeSessionRecord(dir, record);
    appendJsonLine(sessionFiles(dir, record).events, { at: "2026-11-01T10:00:00.000Z", agentId: "codex", event: { method: "item/started", params: { item: { type: "userMessage" } } } });
    appendJsonLine(sessionFiles(dir, record).events, { at: "2026-11-01T10:00:05.000Z", agentId: "codex", event: { method: "item/started", params: { item: { type: "reasoning" } } } });
    // A started Codex PRD on Kiln's current default keeps it: it isn't taken for one not yet started.
    const migrated = migrateRecord(schema25("codex", { model: "gpt-6.1-sol", effort: "high" }, { "1": facts(["c1"]) }), dir);
    expect(migrated.phases["1"]!.startedSessionId).toBe("c1");
    expect(migrated.settings.modelChoices.kept).toEqual({ agentId: "codex", model: "gpt-6.1-sol", effort: "high" });
    expect(readSessionRecord(dir, "1", "c1")!.firstResponseAt).toBe("2026-11-01T10:00:05.000Z");
  });

  it("keys billing's last launch by its agent", () => {
    const record = schema25("claude_code", { model: "opus", effort: "medium" });
    const summary = { agentId: "claude_code", route: "subscription", sources: [], observedAt: "2026-11-01T10:00:00.000Z", approved: false, diagnostics: [] };
    (record.billing as unknown as { lastLaunch: unknown }).lastLaunch = summary;
    expect(migrateRecord(record, dir).billing!.lastLaunch).toEqual({ claude_code: summary });
  });
});

describe("a continuation (KEEP-003)", () => {
  it("drops a kept choice equal to Kiln's current default, keeping every other entry", () => {
    expect(continuedModelChoices({ phases: { "3": "default" }, audits: { agentId: "codex", model: "gpt-6.1-sol", effort: "low" }, kept: { agentId: "claude_code", model: "opus", effort: "medium" } })).toEqual({ phases: { "3": "default" }, audits: { agentId: "codex", model: "gpt-6.1-sol", effort: "low" } });
    expect(continuedModelChoices({ phases: {}, kept: { agentId: "claude_code", model: "sonnet", effort: "low" } }).kept).toEqual({ agentId: "claude_code", model: "sonnet", effort: "low" });
  });

  it("converts an acceptance saved before schema 27 with no activity taken as started", () => {
    const filled = { agentId: "claude_code", selectionGeneration: 1, agentChoices: { claude_code: { model: "opus", effort: "medium" } }, keepAwake: true };
    convertAcceptanceSettings(filled);
    expect(filled).toEqual({ keepAwake: true, modelChoices: { phases: {} } });
    const picked = { agentId: "codex", agentChoices: { codex: { model: "gpt-6-astra", effort: "xhigh" } } };
    convertAcceptanceSettings(picked);
    expect(picked).toEqual({ modelChoices: { phases: {}, kept: { agentId: "codex", model: "gpt-6-astra", effort: "xhigh" } } });
  });
});
