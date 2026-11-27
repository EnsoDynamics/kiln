// An activity's choice when Model defaults can't be read, and how a stop names a choice (Kiln Phase Model Tiers AC-PICK-06);
// each activity's row and entry, the settings in force, and what a row that hasn't started shows (Kiln Model Modes AC-MODE-02,
// AC-MODE-03, AC-WHEN-02, AC-WHEN-03, AC-ROW-01; "Resolving a Choice").

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelEntry } from "../account/model-list.js";
import type { PrdRecord } from "../state/records.js";
import { activityFallback, activityGroup, choiceOrigin, launchSource, modelView, notStartedChoice, rowOfActivity, type ModelContext } from "./activity-models.js";
import { choiceStopFact } from "./engine.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kiln-activity-models-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const opus: ModelEntry = { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5", description: "", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high"], supportsAutoMode: true };
const entry = (value: string, displayName: string): ModelEntry => ({ ...opus, value, resolvedModel: value, displayName });
const CLAUDE = [opus, entry("fable", "Fable 5.2"), entry("sonnet", "Sonnet 5.5")];
const CODEX = [entry("gpt-6.2-sol", "GPT-6.2-Sol"), entry("gpt-6-astra", "GPT-6-Astra")];
const context = (modelChoices: PrdRecord["settings"]["modelChoices"], over: Partial<ModelContext> = {}): ModelContext => ({
  record: { settings: { modelChoices }, phases: {} } as unknown as PrdRecord, plan: [{ id: "1", title: "One", file: "phase-1-one.md", closed: false, repositories: [] }, { id: "2", title: "Two", file: "phase-2-two.md", closed: false, repositories: [], modelTier: { tier: "demanding", reason: "Hard to get right." } }],
  defaultsPath: join(dir, "model-defaults.json"), settingsPath: join(dir, "prd-state", "model-settings.json"), claudeCodeInstalled: true, lists: { claude_code: { models: CLAUDE }, codex: { models: CODEX } }, session: () => undefined, ...over,
});
const writeDefaults = (value: unknown) => writeFileSync(join(dir, "model-defaults.json"), JSON.stringify(value));
const writeOwn = (value: unknown) => { mkdirSync(join(dir, "prd-state"), { recursive: true }); writeFileSync(join(dir, "prd-state", "model-settings.json"), typeof value === "string" ? value : JSON.stringify(value)); };
/** Every kind of activity that isn't a phase or an audit: the preflight, planned and allocated, the pull request session, the merge and a plan push. */
const PREFLIGHT_PR_KEYS = ["preflight-planned", "preflight-7f3a", "pr", "merge", "plan-push-op-1"];

describe("Model defaults that can't be read", () => {
  it("make every choice unusable with the file's reason, a choice of the PRD's own included, which keeps its mark", () => {
    writeFileSync(join(dir, "model-defaults.json"), "{ broken");
    const file = join(dir, "model-defaults.json");
    expect(notStartedChoice(context({ phases: {} }), "1")).toMatchObject({ from: "model_defaults", problem: expect.stringContaining(file) });
    // Before a fallback could be used for everything, a kept or changed choice launched without the file. The unread
    // file may now say it gives way to its fallback, so it can't be used either (Kiln Model Modes, "Settings in Force").
    const kept = notStartedChoice(context({ phases: {}, kept: { agentId: "claude_code", model: "opus", effort: "high" } }), "1");
    expect(kept).toEqual({ agentId: "claude_code", model: "opus", modelName: "Opus 5.5", effort: "high", from: "changed", settingsUnreadable: true, problem: `Model defaults at ${file} isn't valid JSON. Restore Kiln's defaults, or fix the file. Until it reads, Kiln can't tell whether the fallback is used for everything, so nothing launches.` });
    expect(notStartedChoice(context({ phases: { "1": { agentId: "claude_code", model: "opus", effort: "low" } } }), "1")).toMatchObject({ effort: "low", from: "changed", settingsUnreadable: true, problem: expect.stringContaining(file) });
    expect(notStartedChoice(context({ phases: { "1": "default" }, kept: { agentId: "claude_code", model: "opus", effort: "high" } }), "1").problem).toContain("model-defaults.json");
    // The stop names the choice and the file, and no place to change the choice: changing it isn't the remedy.
    expect(choiceStopFact(kept, "1")).toBe(`Phase 1 runs on Claude Code · Opus 5.5 · high from a change for this PRD: Model defaults at ${file} isn't valid JSON. Restore Kiln's defaults, or fix the file. Until it reads, Kiln can't tell whether the fallback is used for everything, so nothing launches.`);
  });
});

describe("each activity's row and entry (Kiln Model Modes AC-ROW-01, ROW-002)", () => {
  it("puts an audit on the Audits row, and the preflight, the pull request session, the merge and a plan push on the Preflight and pull request row", () => {
    const plan = context({ phases: {} }).plan;
    expect(rowOfActivity(plan, "1")).toBe("standard");
    expect(rowOfActivity(plan, "2")).toBe("demanding");
    for (const key of ["audit-planned", "audit-7f3a"]) expect(rowOfActivity(plan, key), key).toBe("audits");
    for (const key of PREFLIGHT_PR_KEYS) expect(rowOfActivity(plan, key), key).toBe("preflight_pr");
    expect(["1", "audit-7f3a", "pr", "preflight-7f3a", "merge", "plan-push-op-1"].map(activityGroup)).toEqual(["phase", "audits", "preflight_pr", "preflight_pr", "after_delivery", "after_delivery"]);
  });

  it("runs them on that row's choice until changed: Opus high for the audits, Opus medium for the rest", () => {
    const shipped = context({ phases: {} });
    expect(notStartedChoice(shipped, "audit-planned")).toMatchObject({ agentId: "claude_code", model: "opus", effort: "high", from: "model_defaults", row: "audits" });
    for (const key of PREFLIGHT_PR_KEYS) {
      expect(notStartedChoice(shipped, key), key).toMatchObject({ agentId: "claude_code", model: "opus", effort: "medium", from: "model_defaults", row: "preflight_pr" });
      expect(activityFallback(shipped, key, notStartedChoice(shipped, key)), key).toMatchObject({ agentId: "codex", model: "gpt-6.2-sol", effort: "medium" });
    }
  });

  it("reads the Audits entry for an audit only, and the Preflight and pull request entry for every other activity that isn't a phase", () => {
    const audits = { agentId: "claude_code" as const, model: "sonnet", effort: "low" };
    const preflightPr = { agentId: "codex" as const, model: "gpt-6.2-sol", effort: "low" };
    const both = context({ phases: {}, audits, preflightPr });
    expect(notStartedChoice(both, "audit-7f3a")).toMatchObject({ model: "sonnet", effort: "low", from: "changed" });
    for (const key of PREFLIGHT_PR_KEYS) expect(notStartedChoice(both, key), key).toMatchObject({ agentId: "codex", model: "gpt-6.2-sol", effort: "low", from: "changed" });
    // A change to the Audits entry alone no longer reaches the preflight or the pull request session, nor the reverse.
    const auditsOnly = context({ phases: {}, audits });
    for (const key of PREFLIGHT_PR_KEYS) expect(notStartedChoice(auditsOnly, key), key).toMatchObject({ model: "opus", effort: "medium", from: "model_defaults" });
    expect(notStartedChoice(context({ phases: {}, preflightPr }), "audit-planned")).toMatchObject({ model: "opus", effort: "high", from: "model_defaults" });
    // Use the default on the row returns it to its row over a kept choice.
    const kept = { agentId: "claude_code" as const, model: "sonnet", effort: "high" };
    expect(notStartedChoice(context({ phases: {}, kept }), "pr")).toMatchObject({ model: "sonnet", from: "changed" });
    expect(notStartedChoice(context({ phases: {}, kept, preflightPr: "default" }), "pr")).toMatchObject({ model: "opus", effort: "medium", from: "model_defaults" });
  });

  it("starts the new row from a changed Audits row of a file saved before the upgrade, and from Kiln's choices otherwise (AC-CARRY-01)", () => {
    writeDefaults({ schemaVersion: 1, rows: { audits: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } } });
    for (const key of ["audit-planned", ...PREFLIGHT_PR_KEYS]) expect(notStartedChoice(context({ phases: {} }), key), key).toMatchObject({ model: "sonnet", effort: "low", from: "model_defaults" });
    writeDefaults({ schemaVersion: 1, rows: { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } } });
    expect(notStartedChoice(context({ phases: {} }), "pr")).toMatchObject({ model: "opus", effort: "medium" });
  });
});

describe("the settings in force for a PRD (Kiln Model Modes, \"Settings in Force\")", () => {
  it("are its own settings in place of Model defaults once it has them, for every activity", () => {
    writeDefaults({ schemaVersion: 2, rows: { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } } });
    expect(notStartedChoice(context({ phases: {} }), "1")).toMatchObject({ model: "sonnet", from: "model_defaults" });
    expect(notStartedChoice(context({ phases: {} }), "1").ownSettings).toBeUndefined();
    writeOwn({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "codex", family: "sol", effort: "high" } });
    for (const key of ["1", "2", "audit-planned", ...PREFLIGHT_PR_KEYS]) expect(notStartedChoice(context({ phases: {} }), key), key).toEqual({ agentId: "codex", model: "gpt-6.2-sol", modelName: "GPT-6.2-Sol", effort: "high", from: "one_model", ownSettings: true });
    // A PRD with no state directory known, or another PRD, still reads Model defaults.
    expect(notStartedChoice(context({ phases: {} }, { settingsPath: undefined }), "1")).toMatchObject({ model: "sonnet", from: "model_defaults" });
    expect(notStartedChoice(context({ phases: {} }, { settingsPath: join(dir, "other-prd", "model-settings.json") }), "1")).toMatchObject({ model: "sonnet", from: "model_defaults" });
  });

  it("make every choice taken from them unusable, with the file's path, when the PRD's own settings can't be read: never Model defaults in their place", () => {
    writeDefaults({ schemaVersion: 2 });
    writeOwn("{ broken");
    const own = join(dir, "prd-state", "model-settings.json");
    expect(notStartedChoice(context({ phases: {} }), "1")).toMatchObject({ from: "model_defaults", ownSettings: true, problem: expect.stringContaining(own) });
    expect(notStartedChoice(context({ phases: {} }), "1").model).toBeUndefined();
    expect(activityFallback(context({ phases: {} }), "1", { agentId: "claude_code" })).toBeUndefined();
    // A phase changed for this PRD can't launch either: its own settings, unread, may put its fallback in its place.
    const changed = notStartedChoice(context({ phases: { "1": { agentId: "claude_code", model: "sonnet", effort: "low" } } }), "1");
    expect(changed).toMatchObject({ model: "sonnet", from: "changed", ownSettings: true, settingsUnreadable: true, problem: expect.stringContaining(own) });
  });
});

describe("one model for everything, from the saved settings (Kiln Model Modes AC-MODE-02, AC-MODE-03)", () => {
  it("runs every activity that hasn't started and wasn't changed on the one model, with no fallback, and keeps a phase's tier and its Change", () => {
    writeDefaults({ schemaVersion: 2, mode: "one_model", fallback: { use: "everything" } });
    const one = context({ phases: { "2": { agentId: "claude_code", model: "fable", effort: "high" } } });
    for (const key of ["1", "audit-planned", ...PREFLIGHT_PR_KEYS]) {
      expect(notStartedChoice(one, key), key).toEqual({ agentId: "claude_code", model: "opus", modelName: "Opus 5.5", effort: "high", from: "one_model" });
      expect(activityFallback(one, key, notStartedChoice(one, key)), key).toBeUndefined();
    }
    expect(notStartedChoice(one, "2")).toMatchObject({ model: "fable", from: "changed" });
    expect(activityFallback(one, "2", notStartedChoice(one, "2"))).toBeUndefined();
    expect(modelView(one, "1", { finished: false })).toEqual({ state: "will_run_on", choice: { agentId: "claude_code", agent: "Claude Code", model: "opus", modelName: "Opus 5.5", effort: "high" }, from: "one_model" });
  });

  it("is Codex · GPT Sol · high on a computer where Claude Code isn't installed, not each row's Codex choice", () => {
    writeDefaults({ schemaVersion: 2, mode: "one_model" });
    const missing = context({ phases: {} }, { claudeCodeInstalled: false });
    for (const key of ["2", "audit-planned", "pr"]) expect(notStartedChoice(missing, key), key).toEqual({ agentId: "codex", model: "gpt-6.2-sol", modelName: "GPT-6.2-Sol", effort: "high", from: "one_model" });
  });
});

describe("a row that hasn't started while the fallback is used for everything (Kiln Model Modes AC-WHEN-02, AC-WHEN-03)", () => {
  it("shows its fallback as its choice with the Fallback tag and its first choice, and says when it has none", () => {
    writeDefaults({ schemaVersion: 2, fallback: { use: "everything" } });
    const plan = context({ phases: { "1": { agentId: "codex", model: "gpt-6.2-sol", effort: "low" } } });
    expect(modelView(plan, "2", { finished: false })).toEqual({
      state: "will_run_on", from: "model_defaults",
      choice: { agentId: "codex", agent: "Codex", model: "gpt-6-astra", modelName: "GPT-6-Astra", effort: "high" },
      fallback: { from: "model_defaults", used: true, forEverything: true, first: { agentId: "claude_code", agent: "Claude Code", model: "fable", modelName: "Fable 5.2", effort: "high" } },
    });
    // Phase 1 was changed to a model on its fallback's own agent: it has no fallback, keeps its mark, and says so (mockup 7, state B).
    expect(modelView(plan, "1", { finished: false })).toEqual({ state: "will_run_on", from: "changed", choice: { agentId: "codex", agent: "Codex", model: "gpt-6.2-sol", modelName: "GPT-6.2-Sol", effort: "low" }, noFallback: true });
    expect(modelView(plan, "audit-planned", { finished: false })).toMatchObject({ choice: { agent: "Codex", modelName: "GPT-6.2-Sol", effort: "xhigh" }, fallback: { used: true, forEverything: true, first: { modelName: "Opus 5.5", effort: "high" } } });
    expect(modelView(plan, "pr", { finished: false })).toMatchObject({ choice: { agent: "Codex", modelName: "GPT-6.2-Sol", effort: "medium" }, fallback: { used: true, forEverything: true, first: { modelName: "Opus 5.5", effort: "medium" } } });
    // The fallback records no limit and no threshold: no usage was read.
    expect(modelView(plan, "2", { finished: false }).fallback).not.toHaveProperty("limit");
    expect(modelView(plan, "2", { finished: false }).fallback).not.toHaveProperty("threshold");
  });

  it("keeps the mark and the first choice of a phase the person changed on the first choice's agent, which launches on its row's fallback", () => {
    writeDefaults({ schemaVersion: 2, fallback: { use: "everything" } });
    const changed = context({ phases: { "2": { agentId: "claude_code", model: "sonnet", effort: "low" } } });
    expect(modelView(changed, "2", { finished: false })).toMatchObject({ from: "changed", choice: { agent: "Codex", modelName: "GPT-6-Astra" }, fallback: { from: "changed", forEverything: true, first: { agent: "Claude Code", modelName: "Sonnet 5.5", effort: "low" } } });
  });

  it("shows nothing of the kind under Never, the threshold setting or one model", () => {
    for (const settings of [{ schemaVersion: 2 }, { schemaVersion: 2, fallback: { use: "threshold" } }, { schemaVersion: 2, mode: "one_model", fallback: { use: "everything" } }]) {
      writeDefaults(settings);
      const view = modelView(context({ phases: {} }), "2", { finished: false });
      expect(view.fallback ?? view.noFallback, JSON.stringify(settings)).toBeUndefined();
    }
  });
});

describe("where a stopped launch's choice came from (AC-PICK-06; Kiln Model Modes, the source table)", () => {
  it("keeps the words a Model defaults choice and a change for this PRD had, and names the rows that now offer Change", () => {
    expect(launchSource("2", { from: "model_defaults" }, "demanding")).toBe("Model defaults. Change it in Model defaults, or on its row in the phase plan.");
    expect(launchSource("2", { from: "changed" }, "demanding")).toBe("A change for this PRD. Change it on its row in the phase plan.");
    expect(launchSource("audit-7f3a", { from: "model_defaults" }, "audits")).toBe("Model defaults. Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings.");
    expect(launchSource("audit-7f3a", { from: "changed" }, "audits")).toBe("A change for this PRD. Change it on the Audits line, in Documents found's delivery panel or the run's settings.");
    // The preflight and the pull request session have a row of their own, and its Change (AC-ROW-01).
    expect(launchSource("pr", { from: "model_defaults" }, "preflight_pr")).toBe("Model defaults. Change the Preflight and pull request row in Model defaults, or change it for this PRD on the Preflight row or the pull request row in the phase plan.");
    expect(launchSource("preflight-1", { from: "changed" }, "preflight_pr")).toBe("A change for this PRD. Change it on the Preflight row or the pull request row in the phase plan.");
  });

  it("names the row whose Fallback column a threshold fallback came from", () => {
    const fallback = { used: true, limit: { agentId: "claude_code" as const, label: "Weekly", percent: 97 }, threshold: 95 };
    expect(launchSource("2", { from: "model_defaults", fallback }, "demanding")).toBe("The fallback, from the Demanding row's Fallback column in Model defaults. Change it in Model defaults.");
    expect(launchSource("pr", { from: "model_defaults", fallback, ownSettings: true }, "preflight_pr")).toBe("The fallback, from the Preflight and pull request row's Fallback column in this PRD's own settings. Change it in Model defaults, opened from this PRD's page.");
    // A decision that kept the first choice names the first choice's own source.
    expect(launchSource("2", { from: "changed", fallback: { ...fallback, used: false, reason: "Codex isn't signed in." } }, "demanding")).toBe("A change for this PRD. Change it on its row in the phase plan.");
  });

  it("names the one model, the fallback used for everything, and this PRD's own settings (the source table)", () => {
    expect(launchSource("2", { from: "one_model" }, "demanding")).toBe("The one model in Model defaults. Change the one model in Model defaults, or on its row in the phase plan.");
    expect(launchSource("pr", { from: "one_model" }, "preflight_pr")).toBe("The one model in Model defaults. Change the one model in Model defaults, or on the Preflight row or the pull request row in the phase plan.");
    expect(launchSource("audit-7f3a", { from: "one_model", ownSettings: true }, "audits")).toBe("The one model in this PRD's own settings. Change the one model in Model defaults, opened from this PRD's page.");
    const everything = { used: true, forEverything: true as const, first: { agentId: "claude_code" as const, model: "fable", modelName: "Fable 5.2", effort: "high" } };
    expect(launchSource("2", { from: "model_defaults", fallback: everything }, "demanding")).toBe("The Demanding row's Fallback column in Model defaults, used for everything. Change that row's fallback, or the fallback setting, in Model defaults.");
    // A Changed by you first choice doesn't change the source: the fallback still comes from the row.
    expect(launchSource("2", { from: "changed", fallback: everything, ownSettings: true }, "demanding")).toBe("The Demanding row's Fallback column in this PRD's own settings, used for everything. Change that row's fallback, or the fallback setting, in Model defaults, opened from this PRD's page.");
    expect(launchSource("2", { from: "model_defaults", ownSettings: true }, "standard")).toBe("This PRD's own settings (Standard row). Change the Standard row in Model defaults, opened from this PRD's page.");
    expect(launchSource("audit-7f3a", { from: "model_defaults", ownSettings: true }, "audits")).toBe("This PRD's own settings (Audits row). Change the Audits row in Model defaults, opened from this PRD's page, or the Audits line in Documents found's delivery panel or the run's settings.");
  });

  it("names only the row in Model defaults for the merge and a plan push, which run once no row offers Change", () => {
    expect(choiceOrigin({ key: "merge", from: "model_defaults", row: "preflight_pr" })).toEqual({ from: "Model defaults (Preflight and pull request row)", where: "Change the Preflight and pull request row in Model defaults." });
    expect(choiceOrigin({ key: "plan-push-op-1", from: "model_defaults", row: "preflight_pr", ownSettings: true })).toEqual({ from: "this PRD's own settings (Preflight and pull request row)", where: "Change the Preflight and pull request row in Model defaults, opened from this PRD's page." });
    expect(choiceOrigin({ key: "merge", from: "changed", row: "preflight_pr" })).toEqual({ from: "a change for this PRD", where: "It can't be changed once the run is complete." });
    expect(choiceOrigin({ key: "merge", from: "one_model", row: "preflight_pr" }).where).toBe("Change the one model in Model defaults.");
  });
});

describe("a stop's words for a choice that can't be used", () => {
  it("name the choice, where it came from and where to change it, for a phase and for the audits", () => {
    expect(choiceStopFact({ agentId: "claude_code", model: "claude-opus-4-1", modelName: "claude-opus-4-1", effort: "high", from: "changed", problem: "Claude Code doesn't offer claude-opus-4-1 on this account." }, "3"))
      .toBe("Phase 3 runs on Claude Code · claude-opus-4-1 · high from a change for this PRD: Claude Code doesn't offer claude-opus-4-1 on this account. Change it on its row in the phase plan.");
    expect(choiceStopFact({ agentId: "claude_code", modelName: "Fable", effort: "high", from: "model_defaults", row: "demanding", problem: "Claude Code doesn't offer Fable on this account." }, "2"))
      .toBe("Phase 2 runs on Claude Code · Fable · high from Model defaults (Demanding row): Claude Code doesn't offer Fable on this account. Change the Demanding row in Model defaults.");
    expect(choiceStopFact({ agentId: "codex", modelName: "GPT Sol", effort: "xhigh", from: "model_defaults", row: "audits", problem: "Codex's model list can't be read." }, "audit-planned"))
      .toBe("The audits run on Codex · GPT Sol · xhigh from Model defaults (Audits row): Codex's model list can't be read. Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings.");
  });

  it("name the Preflight and pull request row as the subject for the preflight and the pull request session, with their rows' Change (AC-ROW-01)", () => {
    expect(choiceStopFact({ agentId: "codex", modelName: "GPT Sol", effort: "medium", from: "model_defaults", row: "preflight_pr", problem: "Codex's model list can't be read." }, "pr"))
      .toBe("The preflight and the pull request session run on Codex · GPT Sol · medium from Model defaults (Preflight and pull request row): Codex's model list can't be read. Change the Preflight and pull request row in Model defaults, or change it for this PRD on the Preflight row or the pull request row in the phase plan.");
    expect(choiceStopFact({ agentId: "codex", modelName: "GPT Sol", effort: "xhigh", from: "changed", problem: "Codex's model list can't be read." }, "preflight-1"))
      .toBe("The preflight and the pull request session run on Codex · GPT Sol · xhigh from a change for this PRD: Codex's model list can't be read. Change it on the Preflight row or the pull request row in the phase plan.");
    expect(choiceStopFact({ agentId: "codex", modelName: "GPT Sol", effort: "medium", from: "model_defaults", row: "preflight_pr", problem: "Codex is not signed in." }, "merge"))
      .toBe("The merge session runs on Codex · GPT Sol · medium from Model defaults (Preflight and pull request row): Codex is not signed in. Change the Preflight and pull request row in Model defaults.");
    expect(choiceStopFact({ agentId: "codex", modelName: "GPT Sol", effort: "medium", from: "changed", problem: "Codex is not signed in." }, "plan-push-op-1"))
      .toBe("The push session runs on Codex · GPT Sol · medium from a change for this PRD: Codex is not signed in. It can't be changed once the run is complete.");
  });

  it("name the one model, and the row's fallback while it is used for everything, as where the choice came from", () => {
    expect(choiceStopFact({ agentId: "claude_code", modelName: "Opus", effort: "high", from: "one_model", problem: "Claude Code doesn't offer Opus on this account." }, "2"))
      .toBe("Phase 2 runs on Claude Code · Opus · high from the one model in Model defaults: Claude Code doesn't offer Opus on this account. Change the one model in Model defaults, or on its row in the phase plan.");
    expect(choiceStopFact({ agentId: "codex", modelName: "GPT Astra", effort: "high", from: "changed", row: "demanding", ownSettings: true, everything: { first: { agentId: "claude_code", model: "fable", modelName: "Fable 5.2", effort: "high" } }, problem: "Codex is not on PATH." }, "2"))
      .toBe("Phase 2 runs on Codex · GPT Astra · high from the Demanding row's Fallback column in this PRD's own settings, used for everything: Codex is not on PATH. Change that row's fallback, or the fallback setting, in Model defaults, opened from this PRD's page.");
  });
});
