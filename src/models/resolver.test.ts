// Resolving a choice (Kiln Phase Model Tiers AC-PICK-01, AC-DEFAULT-01, AC-DEFAULT-04, AC-OTHER-01, AC-KEEP-02; technical design "Resolving a Choice";
// Kiln Model Modes AC-MODE-02, AC-MODE-03, AC-WHEN-02, AC-ROW-01, steps 4 and 5).

import { describe, expect, it } from "vitest";
import type { ModelEntry } from "../account/model-list.js";
import { codexModels } from "../agents/codex-metadata.js";
import { shippedDefaults, type ModelDefaults } from "./model-defaults.js";
import { defaultsRowFor, familyName, fallbackFor, newestOfFamily, resolveFamily, resolveModel, resolveNotStarted } from "./resolver.js";

const claude = (value: string, resolved: string, displayName: string, levels = ["low", "medium", "high", "xhigh", "max"], autoMode = true): ModelEntry => ({ value, resolvedModel: resolved, displayName, description: "", supportsEffort: levels.length > 0, supportedEffortLevels: levels, supportsAutoMode: autoMode });
const CLAUDE = [claude("opus", "claude-opus-5-5", "Opus 5.5"), claude("fable", "claude-fable-5-2", "Fable 5.2"), claude("sonnet", "claude-sonnet-5-5", "Sonnet 5.5"), claude("haiku", "claude-haiku-5-5", "Haiku 5.5", [])];
const efforts = ["low", "medium", "high", "xhigh"].map(reasoningEffort => ({ reasoningEffort }));
const CODEX = codexModels([
  { model: "gpt-6.1-sol", displayName: "GPT-6.1-Sol", description: "", supportedReasoningEfforts: efforts },
  { model: "gpt-6.2-sol", displayName: "GPT-6.2-Sol", description: "", supportedReasoningEfforts: efforts },
  { model: "gpt-6-astra", displayName: "GPT-6-Astra", description: "", supportedReasoningEfforts: efforts },
  { model: "gpt-5.9-astra", displayName: "GPT-5.9-Astra", description: "", supportedReasoningEfforts: efforts },
]);
const lists = { claude_code: { models: CLAUDE }, codex: { models: CODEX } };

describe("families", () => {
  it("names them as a person reads them", () => {
    expect(familyName({ agentId: "claude_code", family: "opus" })).toBe("Opus");
    expect(familyName({ agentId: "codex", family: "sol" })).toBe("GPT Sol");
  });

  it("resolves each family to the newest version its agent offers (AC-DEFAULT-01)", () => {
    expect(newestOfFamily({ agentId: "claude_code", family: "fable" }, CLAUDE).entry?.resolvedModel).toBe("claude-fable-5-2");
    expect(newestOfFamily({ agentId: "codex", family: "sol" }, CODEX).entry?.value).toBe("gpt-6.2-sol");
    expect(newestOfFamily({ agentId: "codex", family: "astra" }, CODEX).entry?.value).toBe("gpt-6-astra");
  });

  it("finds no single newest when two models share the newest version, and names a family the agent doesn't offer", () => {
    const tied = codexModels([{ model: "gpt-7-sol", displayName: "a", description: "", supportedReasoningEfforts: efforts }, { model: "gpt-7.0-sol", displayName: "b", description: "", supportedReasoningEfforts: efforts }]);
    expect(newestOfFamily({ agentId: "codex", family: "sol" }, tied).problem).toContain("more than one newest GPT Sol");
    expect(newestOfFamily({ agentId: "claude_code", family: "mythos" }, CLAUDE).problem).toBe("Claude Code doesn't offer Mythos on this account.");
  });

  it("drops the effort of a model that takes none, and flags an effort or auto mode the model lacks", () => {
    expect(resolveFamily({ agentId: "claude_code", family: "haiku", effort: "high" }, { models: CLAUDE })).toEqual({ agentId: "claude_code", model: "haiku", modelName: "Haiku 5.5" });
    expect(resolveFamily({ agentId: "codex", family: "sol", effort: "max" }, { models: CODEX }).problem).toBe("GPT-6.2-Sol doesn't offer max effort.");
    expect(resolveFamily({ agentId: "claude_code", family: "opus" }, { models: CLAUDE }).problem).toBe("Choose an effort for Opus 5.5.");
    const noAuto = [claude("opus", "claude-opus-5-5", "Opus 5.5", ["high"], false)];
    expect(resolveFamily({ agentId: "claude_code", family: "opus", effort: "high" }, { models: noAuto }).problem).toContain("needs auto mode");
  });

  it("keeps the family's name and the list's message while the list can't be read", () => {
    expect(resolveFamily({ agentId: "codex", family: "sol", effort: "high" }, { error: "Could not read Codex models." })).toEqual({ agentId: "codex", modelName: "GPT Sol", effort: "high", problem: "Could not read Codex models." });
    expect(resolveFamily({ agentId: "claude_code", family: "opus", effort: "high" }, { pending: true }).problem).toBe("Reading Claude Code models…");
  });
});

describe("an activity that hasn't started", () => {
  const defaults = shippedDefaults();
  const base = { defaults, row: "standard" as const, claudeCodeInstalled: true, lists };

  it("runs on its Model defaults row's first choice: its tier's, Not rated as Standard, Audits for the rest", () => {
    expect(defaultsRowFor(undefined)).toBe("standard");
    expect(defaultsRowFor("audits")).toBe("audits");
    expect(defaultsRowFor("preflight_pr")).toBe("preflight_pr");
    // The preflight and the pull request session run on a lighter row than the audits (AC-ROW-01's table).
    expect(resolveNotStarted({ ...base, row: "preflight_pr" })).toMatchObject({ agentId: "claude_code", model: "opus", effort: "medium", from: "model_defaults", row: "preflight_pr" });
    expect(fallbackFor({ defaults, row: "preflight_pr", lists }, { agentId: "claude_code" })).toMatchObject({ agentId: "codex", model: "gpt-6.2-sol", effort: "medium" });
    expect(resolveNotStarted({ ...base, row: "demanding" })).toMatchObject({ agentId: "claude_code", model: "fable", modelName: "Fable 5.2", effort: "high", from: "model_defaults", row: "demanding" });
    expect(resolveNotStarted(base)).toMatchObject({ model: "opus", effort: "medium", from: "model_defaults" });
    expect(resolveNotStarted({ ...base, row: "mechanical" })).toMatchObject({ model: "sonnet", effort: "high" });
    expect(resolveNotStarted({ ...base, row: "audits" })).toMatchObject({ model: "opus", effort: "high" });
  });

  it("takes its own entry first, then the PRD's kept choice, marked Changed by you; Use the default skips a kept choice", () => {
    const kept = { agentId: "claude_code" as const, model: "opus", effort: "high" };
    expect(resolveNotStarted({ ...base, entry: { agentId: "codex", model: "gpt-6.1-sol", effort: "low" }, kept })).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", modelName: "GPT-6.1-Sol", effort: "low", from: "changed" });
    expect(resolveNotStarted({ ...base, kept })).toMatchObject({ model: "opus", effort: "high", from: "changed" });
    expect(resolveNotStarted({ ...base, entry: "default", kept })).toMatchObject({ model: "opus", effort: "medium", from: "model_defaults" });
  });

  it("names a saved choice its agent doesn't offer as saved, as a choice that can't be used", () => {
    expect(resolveModel({ agentId: "claude_code", model: "claude-opus-4-1", effort: "high" }, { models: CLAUDE })).toEqual({ agentId: "claude_code", model: "claude-opus-4-1", modelName: "claude-opus-4-1", effort: "high", problem: "Claude Code doesn't offer claude-opus-4-1 on this account." });
  });

  it("runs on its row's Codex choice from the Fallback column when Claude Code isn't installed (AC-DEFAULT-04)", () => {
    const missing = { ...base, claudeCodeInstalled: false };
    expect(resolveNotStarted({ ...missing, row: "demanding" })).toMatchObject({ agentId: "codex", model: "gpt-6-astra", effort: "high", claudeCodeMissing: true, from: "model_defaults" });
    expect(resolveNotStarted({ ...missing, row: "audits" })).toMatchObject({ agentId: "codex", model: "gpt-6.2-sol", effort: "xhigh", claudeCodeMissing: true });
    // A choice the person made on Claude Code is theirs: it isn't substituted.
    expect(resolveNotStarted({ ...missing, entry: { agentId: "claude_code", model: "opus", effort: "high" } })).toMatchObject({ agentId: "claude_code", from: "changed" });
    expect(resolveNotStarted({ ...missing, entry: { agentId: "claude_code", model: "opus", effort: "high" } }).claudeCodeMissing).toBeUndefined();
  });

  it("has a fallback on the other agent, and none when its row's fallback is on its own agent", () => {
    expect(fallbackFor({ defaults, row: "standard", lists }, { agentId: "claude_code" })).toMatchObject({ agentId: "codex", model: "gpt-6.2-sol", effort: "high" });
    expect(fallbackFor({ defaults, row: "standard", lists }, { agentId: "codex" })).toBeUndefined();
  });
});

describe("one model for everything (Kiln Model Modes AC-MODE-02, AC-MODE-03)", () => {
  const settings = (over: Partial<ModelDefaults> = {}): ModelDefaults => ({ ...shippedDefaults(), mode: "one_model", modeSet: true, ...over });
  const base = { row: "demanding" as const, claudeCodeInstalled: true, lists };

  it("runs every row on the one model, whatever its tier: Opus high until the person picks, the family's newest version", () => {
    for (const row of ["demanding", "standard", "mechanical", "audits", "preflight_pr"] as const) {
      const choice = resolveNotStarted({ ...base, row, defaults: settings() });
      expect(choice, row).toEqual({ agentId: "claude_code", model: "opus", modelName: "Opus 5.5", effort: "high", from: "one_model" });
    }
    const picked = settings({ oneModel: { agentId: "codex", family: "sol", effort: "low" } });
    expect(resolveNotStarted({ ...base, defaults: picked })).toEqual({ agentId: "codex", model: "gpt-6.2-sol", modelName: "GPT-6.2-Sol", effort: "low", from: "one_model" });
  });

  it("is Codex · GPT Sol · high on a computer where Claude Code isn't installed, with no note about a Codex substitute", () => {
    const choice = resolveNotStarted({ ...base, claudeCodeInstalled: false, defaults: settings() });
    expect(choice).toEqual({ agentId: "codex", model: "gpt-6.2-sol", modelName: "GPT-6.2-Sol", effort: "high", from: "one_model" });
    // A one model the person picked on Claude Code is theirs: it isn't substituted.
    expect(resolveNotStarted({ ...base, claudeCodeInstalled: false, defaults: settings({ oneModel: { agentId: "claude_code", family: "sonnet", effort: "low" } }) })).toMatchObject({ agentId: "claude_code", model: "sonnet", from: "one_model" });
  });

  it("leaves a choice the person changed, or the PRD kept, as it is, and Use the default returns to the one model", () => {
    const kept = { agentId: "claude_code" as const, model: "sonnet", effort: "low" };
    expect(resolveNotStarted({ ...base, defaults: settings(), entry: { agentId: "codex", model: "gpt-6.1-sol", effort: "low" } })).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", from: "changed" });
    expect(resolveNotStarted({ ...base, defaults: settings(), kept })).toMatchObject({ model: "sonnet", from: "changed" });
    expect(resolveNotStarted({ ...base, defaults: settings(), entry: "default", kept })).toMatchObject({ model: "opus", effort: "high", from: "one_model" });
  });

  it("has no fallback, whatever step gave the choice and whatever the fallback setting says", () => {
    for (const use of ["never", "threshold", "everything"] as const) {
      const defaults = settings({ fallback: { use, threshold: 95, useSet: true, thresholdSet: false } });
      expect(fallbackFor({ defaults, row: "demanding", lists }, { agentId: "claude_code" }), use).toBeUndefined();
      // The fallback setting isn't in force: nothing moves to a fallback, and nothing is marked as having none.
      const own = resolveNotStarted({ ...base, defaults });
      expect(own, use).toEqual({ agentId: "claude_code", model: "opus", modelName: "Opus 5.5", effort: "high", from: "one_model" });
      const changed = resolveNotStarted({ ...base, defaults, entry: { agentId: "claude_code", model: "fable", effort: "high" } });
      expect(changed.everything ?? changed.noFallback, use).toBeUndefined();
      expect(fallbackFor({ defaults, row: "demanding", lists }, changed), use).toBeUndefined();
    }
  });
});

describe("the fallback used for everything (Kiln Model Modes AC-WHEN-02, resolver step 5)", () => {
  const everything: ModelDefaults = { ...shippedDefaults(), fallback: { use: "everything", threshold: 95, useSet: true, thresholdSet: false } };
  const base = { defaults: everything, row: "demanding" as const, claudeCodeInstalled: true, lists };

  it("makes each row's fallback its choice, keeps what it would have run on as its first choice, and leaves it no fallback", () => {
    const choice = resolveNotStarted(base);
    expect(choice).toEqual({ agentId: "codex", model: "gpt-6-astra", modelName: "GPT-6-Astra", effort: "high", from: "model_defaults", row: "demanding", everything: { first: { agentId: "claude_code", model: "fable", modelName: "Fable 5.2", effort: "high" } } });
    expect(fallbackFor({ defaults: everything, row: "demanding", lists }, choice)).toBeUndefined();
    // Each tier keeps the fallback that fits it: the stronger one for a demanding phase, the lighter for the rest.
    expect(resolveNotStarted({ ...base, row: "standard" })).toMatchObject({ agentId: "codex", model: "gpt-6.2-sol", effort: "high", row: "standard" });
    expect(resolveNotStarted({ ...base, row: "audits" })).toMatchObject({ agentId: "codex", model: "gpt-6.2-sol", effort: "xhigh", row: "audits" });
    expect(resolveNotStarted({ ...base, row: "preflight_pr" })).toMatchObject({ agentId: "codex", model: "gpt-6.2-sol", effort: "medium", row: "preflight_pr" });
  });

  it("wins over a choice the person changed or the PRD kept on the first choice's agent, which stays as its first choice and its source", () => {
    const entry = { agentId: "claude_code" as const, model: "sonnet", effort: "low" };
    for (const inputs of [{ entry }, { kept: entry }]) {
      const choice = resolveNotStarted({ ...base, ...inputs });
      expect(choice).toEqual({ agentId: "codex", model: "gpt-6-astra", modelName: "GPT-6-Astra", effort: "high", from: "changed", row: "demanding", everything: { first: { agentId: "claude_code", model: "sonnet", modelName: "Sonnet 5.5", effort: "low" } } });
    }
  });

  it("keeps the choice of an activity with no fallback, because its own choice is on its fallback's agent, and marks it", () => {
    const choice = resolveNotStarted({ ...base, entry: { agentId: "codex", model: "gpt-6.1-sol", effort: "low" } });
    expect(choice).toEqual({ agentId: "codex", model: "gpt-6.1-sol", modelName: "GPT-6.1-Sol", effort: "low", from: "changed", noFallback: true });
  });

  it("keeps the Codex choice of a row on a computer without Claude Code, which has no fallback", () => {
    const choice = resolveNotStarted({ ...base, claudeCodeInstalled: false });
    expect(choice).toMatchObject({ agentId: "codex", model: "gpt-6-astra", from: "model_defaults", claudeCodeMissing: true, noFallback: true });
    expect(choice.everything).toBeUndefined();
  });

  it("never yields to the first choice when the fallback can't be used: the fallback, with its problem, is the choice", () => {
    const choice = resolveNotStarted({ ...base, lists: { claude_code: { models: CLAUDE }, codex: { error: "Codex isn't installed." } } });
    expect(choice).toMatchObject({ agentId: "codex", modelName: "GPT Astra", problem: "Codex isn't installed.", everything: { first: { agentId: "claude_code", model: "fable" } } });
    expect(choice.model).toBeUndefined();
  });

  it("follows a row whose sides the person swapped, and says the settings in force are the PRD's own", () => {
    const swapped: ModelDefaults = { ...everything, rows: { ...everything.rows, demanding: { first: { agentId: "codex", family: "astra", effort: "high" }, fallback: { agentId: "claude_code", family: "fable", effort: "high" }, firstSet: true, fallbackSet: true } } };
    expect(resolveNotStarted({ ...base, defaults: swapped, source: "prd" })).toMatchObject({ agentId: "claude_code", model: "fable", from: "model_defaults", ownSettings: true, everything: { first: { agentId: "codex", model: "gpt-6-astra" } } });
    expect(resolveNotStarted({ ...base, defaults: shippedDefaults(), source: "prd" })).toMatchObject({ agentId: "claude_code", model: "fable", ownSettings: true });
    expect(resolveNotStarted({ ...base, defaults: shippedDefaults() }).ownSettings).toBeUndefined();
  });

  it("does nothing while the setting is Never or the threshold setting", () => {
    for (const use of ["never", "threshold"] as const) {
      const choice = resolveNotStarted({ ...base, defaults: { ...everything, fallback: { ...everything.fallback, use } } });
      expect(choice, use).toEqual({ agentId: "claude_code", model: "fable", modelName: "Fable 5.2", effort: "high", from: "model_defaults", row: "demanding" });
    }
  });
});
