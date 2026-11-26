import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autoModeError, effortFor, effortLevelsFor, modelEntries, modelListErrorMessage, type ModelEntry } from "./model-list.js";
import type { ModelInfo } from "@anthropic-ai/claude-agent-sdk";

const recorded = JSON.parse(readFileSync(new URL("../../test/fixtures/proof-gate-1/supported-models.json", import.meta.url), "utf8")).models;
const entry = (overrides: Partial<ModelEntry>): ModelEntry => ({
  value: "opus",
  resolvedModel: "claude-opus-5-5",
  displayName: "Opus 5.5",
  description: "",
  supportsEffort: true,
  supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
  supportsAutoMode: true,
  ...overrides,
});

describe("the Model list", () => {
  it("lists the family aliases from a recorded list, named from their model IDs, with the latest Opus first", () => {
    const entries = modelEntries(recorded);
    expect(entries.map((model) => [model.value, model.displayName])).toEqual([
      ["opus", "Opus 5.5"],
      ["fable", "Fable 5.1"],
      ["sonnet", "Sonnet 5.5"],
      ["haiku", "Haiku 5.5"],
    ]);
  });

  it("leaves out disabled entries and keeps one entry per resolved model", () => {
    const entries = modelEntries([
      { value: "fable", resolvedModel: "claude-fable-5-1", displayName: "Fable (disabled)", description: "", disabled: true },
      { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus", description: "" },
      { value: "best", resolvedModel: "claude-opus-5-5", displayName: "Best", description: "" },
    ]);
    expect(entries.map((model) => model.value)).toEqual(["opus"]);
    // The SDK's own display name isn't used; the model ID names what runs.
    expect(entries[0]!.displayName).toBe("Opus 5.5");
  });

  it("keeps a family Claude Code lists only by full ID before its model catalog loads, under its alias", () => {
    // The rows Claude Code 2.1.332 returned with no model catalog cached and none reachable.
    const efforts: Pick<ModelInfo, "supportsEffort" | "supportedEffortLevels" | "supportsAutoMode"> = { supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"], supportsAutoMode: true };
    const entries = modelEntries([
      { value: "default", resolvedModel: "claude-opus-5-5", displayName: "Default (recommended)", description: "", ...efforts },
      { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus", description: "", ...efforts },
      { value: "claude-fable-5-2[1m]", resolvedModel: "claude-fable-5-2", displayName: "Fable", description: "Fable 5.2 · Most capable for your hardest and longest-running tasks", ...efforts },
      { value: "sonnet", resolvedModel: "claude-sonnet-5-5", displayName: "Sonnet", description: "", ...efforts },
      { value: "haiku", resolvedModel: "claude-haiku-5-5", displayName: "Haiku", description: "", ...efforts },
    ]);
    expect(entries.map((model) => [model.value, model.resolvedModel, model.displayName])).toEqual([
      ["opus", "claude-opus-5-5", "Opus 5.5"],
      ["fable", "claude-fable-5-2", "Fable 5.2"],
      ["sonnet", "claude-sonnet-5-5", "Sonnet 5.5"],
      ["haiku", "claude-haiku-5-5", "Haiku 5.5"],
    ]);
    expect(entries[1]!.supportsAutoMode).toBe(true);
  });

  it("names an alias-less family from its newest variant row, and never from an older ID alone", () => {
    const entries = modelEntries([
      { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus", description: "" },
      { value: "claude-opus-4-8[1m]", resolvedModel: "claude-opus-4-8", displayName: "Opus 4.8", description: "" },
      { value: "claude-fable-5-1[1m]", resolvedModel: "claude-fable-5-1", displayName: "Fable", description: "" },
      { value: "claude-fable-5-2[1m]", resolvedModel: "claude-fable-5-2", displayName: "Fable", description: "" },
      { value: "claude-fable-5", resolvedModel: "claude-fable-5", displayName: "Fable 5", description: "" },
      // Sonnet's alias is gone and only an older ID remains: Sonnet is not offered.
      { value: "claude-sonnet-5", resolvedModel: "claude-sonnet-5", displayName: "Sonnet 5", description: "" },
    ]);
    expect(entries.map((model) => [model.value, model.displayName])).toEqual([["opus", "Opus 5.5"], ["fable", "Fable 5.2"]]);
  });
});

describe("effort and auto mode", () => {
  it("offers the model's supported levels, none for a model without effort, and all five without an entry", () => {
    expect(effortLevelsFor(entry({ supportedEffortLevels: ["low", "high", "medium"] }))).toEqual(["low", "medium", "high"]);
    expect(effortLevelsFor(entry({ supportsEffort: false, supportedEffortLevels: [] }))).toEqual([]);
    expect(effortLevelsFor(undefined)).toBeNull();
  });

  it("moves a saved effort the model doesn't take to the highest supported level below it, else the lowest", () => {
    const upToHigh = entry({ supportedEffortLevels: ["low", "medium", "high"] });
    expect(effortFor("max", upToHigh)).toBe("high");
    expect(effortFor("medium", upToHigh)).toBe("medium");
    expect(effortFor("low", entry({ supportedEffortLevels: ["high", "max"] }))).toBe("high");
    // A model that takes no effort keeps the saved one for the next model that does.
    expect(effortFor("xhigh", entry({ supportsEffort: false, supportedEffortLevels: [] }))).toBe("xhigh");
    expect(effortFor("xhigh", undefined)).toBe("xhigh");
  });

  it("flags a loaded model that can't run in auto mode, naming it, and nothing without an entry", () => {
    expect(autoModeError(entry({ displayName: "Haiku 4.5", supportsAutoMode: false }))).toBe("Haiku 4.5 can’t run unattended on this account; it needs auto mode.");
    expect(autoModeError(entry({}))).toBeUndefined();
    expect(autoModeError(undefined)).toBeUndefined();
  });

  it("words the list's own failure as the mockup's source gives it", () => {
    expect(modelListErrorMessage("timed out after 120 seconds")).toBe("Couldn’t load Claude Code’s models: timed out after 120 seconds");
  });
});
