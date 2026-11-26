// Resolving a choice (Kiln Phase Model Tiers AC-PICK-01, AC-DEFAULT-01, AC-DEFAULT-04, AC-OTHER-01, AC-KEEP-02; technical design "Resolving a Choice").

import { describe, expect, it } from "vitest";
import type { ModelEntry } from "../account/model-list.js";
import { codexModels } from "../agents/codex-metadata.js";
import { shippedDefaults } from "./model-defaults.js";
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
