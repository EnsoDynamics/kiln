// An activity's choice when Model defaults can't be read, and how a stop names a choice (Kiln Phase Model Tiers AC-PICK-06).

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelEntry } from "../account/model-list.js";
import type { PrdRecord } from "../state/records.js";
import { launchSource, notStartedChoice, rowOfActivity, type ModelContext } from "./activity-models.js";
import { choiceStopFact } from "./engine.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kiln-activity-models-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const opus: ModelEntry = { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high"], supportsAutoMode: true };
const context = (modelChoices: PrdRecord["settings"]["modelChoices"]): ModelContext => ({
  record: { settings: { modelChoices }, phases: {} } as unknown as PrdRecord, plan: [{ id: "1", title: "One", file: "phase-1-one.md", closed: false, repositories: [] }],
  defaultsPath: join(dir, "model-defaults.json"), claudeCodeInstalled: true, lists: { claude_code: { models: [opus] } }, session: () => undefined,
});

describe("Model defaults that can't be read", () => {
  it("make every Model defaults choice unusable with the file's reason, and leave the PRD's own choices usable", () => {
    writeFileSync(join(dir, "model-defaults.json"), "{ broken");
    expect(notStartedChoice(context({ phases: {} }), "1")).toMatchObject({ from: "model_defaults", problem: expect.stringContaining(join(dir, "model-defaults.json")) });
    expect(notStartedChoice(context({ phases: {}, kept: { agentId: "claude_code", model: "opus", effort: "high" } }), "1")).toEqual({ agentId: "claude_code", model: "opus", modelName: "Opus 5.5", effort: "high", from: "changed" });
    expect(notStartedChoice(context({ phases: { "1": { agentId: "claude_code", model: "opus", effort: "low" } } }), "1")).toMatchObject({ effort: "low", from: "changed" });
    expect(notStartedChoice(context({ phases: { "1": "default" }, kept: { agentId: "claude_code", model: "opus", effort: "high" } }), "1").problem).toContain("model-defaults.json");
  });
});

describe("where a stopped launch's choice came from (AC-PICK-06)", () => {
  it("names the Audits line for the preflight and the pull request session, whose rows offer no Change", () => {
    expect(launchSource("pr", { from: "model_defaults" })).toBe("Model defaults. Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings.");
    expect(launchSource("preflight-1", { from: "changed" })).toBe("A change for this PRD. Change it on the Audits line, in Documents found's delivery panel or the run's settings.");
    expect(launchSource("2", { from: "model_defaults" })).toBe("Model defaults. Change it in Model defaults, or on its row in the phase plan.");
    expect(launchSource("pr", { from: "model_defaults", fallback: { used: true, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95 } })).toBe("The fallback, from Model defaults' Fallback column. Change it in Model defaults.");
  });
});

describe("a stop's words for a choice that can't be used", () => {
  it("name the choice, where it came from and where to change it, for a phase and for the audits", () => {
    expect(choiceStopFact({ agentId: "claude_code", model: "claude-opus-4-1", modelName: "claude-opus-4-1", effort: "high", from: "changed", problem: "Claude Code doesn't offer claude-opus-4-1 on this account." }, "3"))
      .toBe("Phase 3 runs on Claude Code · claude-opus-4-1 · high from a change for this PRD: Claude Code doesn't offer claude-opus-4-1 on this account. Change it on its row in the phase plan.");
    expect(choiceStopFact({ agentId: "codex", modelName: "GPT Sol", effort: "xhigh", from: "model_defaults", row: "audits", problem: "Codex's model list can't be read." }, "pr"))
      .toBe("The audits, preflight and pull request session run on Codex · GPT Sol · xhigh from Model defaults (Audits row): Codex's model list can't be read. Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings.");
    // Neither the Preflight row nor the pull request row offers Change, so a changed Audits choice names the Audits line (AC-PICK-06 with AC-OTHER-01).
    expect(choiceStopFact({ agentId: "codex", modelName: "GPT Sol", effort: "xhigh", from: "changed", problem: "Codex's model list can't be read." }, "preflight-1"))
      .toBe("The audits, preflight and pull request session run on Codex · GPT Sol · xhigh from a change for this PRD: Codex's model list can't be read. Change it on the Audits line, in Documents found's delivery panel or the run's settings.");
    // A requirements stage is named by its row and points to the requirements plan and its own Model defaults row (Kiln Requirements Stages AC-MODEL-06).
    expect(choiceStopFact({ agentId: "claude_code", modelName: "Fable", effort: "high", from: "model_defaults", row: "requirements", problem: "Claude Code doesn't offer Fable on this account." }, "req-abc", "Write the PRD"))
      .toBe("Write the PRD runs on Claude Code · Fable · high from Model defaults (Requirements stages row): Claude Code doesn't offer Fable on this account. Change the Requirements stages row in Model defaults, or this stage on its row in the requirements plan.");
    expect(choiceStopFact({ agentId: "claude_code", modelName: "Sonnet", effort: "low", from: "saved", problem: "Claude Code doesn't offer Sonnet on this account." }, "req-row:review-technical-design#1", "Design review"))
      .toBe("Design review runs on Claude Code · Sonnet · low from a choice saved for every PRD for this stage's skill: Claude Code doesn't offer Sonnet on this account. Change it on its row in the requirements plan.");
  });
});

describe("the Model defaults row a requirements stage uses", () => {
  it("puts the Next stage row on Refining the design while the design span is open, as its launch is (Kiln Requirements Stages AC-MODEL-01)", () => {
    const record = (designSpan: boolean) => ({ requirements: { designSpan, stages: [] } }) as unknown as PrdRecord;
    expect(rowOfActivity([], "req-next", record(false))).toBe("requirements");
    expect(rowOfActivity([], "req-next", record(true))).toBe("refining_design");
  });
});
