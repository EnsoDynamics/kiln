// Changing Model defaults and a model choice (Kiln Phase Model Tiers AC-DEFAULT-02, AC-DEFAULT-05,
// AC-FALLBACK-01; technical design "Model defaults file" and the omitted-effort rule in "Command line").

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelEntry } from "../account/model-list.js";
import { checkModelChoice, editModelDefaults, effortToSave, familyOptions } from "./model-defaults-edit.js";

let dir: string; let path: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kiln-defaults-edit-")); path = join(dir, "model-defaults.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const entry = (value: string, displayName: string, over: Partial<ModelEntry> = {}): ModelEntry => ({ value, resolvedModel: value, displayName, description: "", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "xhigh"] as never, supportsAutoMode: true, ...over });
const claude = [entry("opus", "Opus 5.5"), entry("haiku", "Haiku 5.5", { supportsEffort: false, supportedEffortLevels: [] })];
const codex = [entry("gpt-6.1-sol", "GPT-6.1-Sol", { defaultEffort: "medium" }), entry("gpt-6.2-sol", "GPT-6.2-Sol", { defaultEffort: "medium" }), entry("gpt-6-astra", "GPT-6-Astra", { defaultEffort: "ultra" })];
const lists = { claude_code: { models: claude }, codex: { models: codex } };
const file = () => JSON.parse(readFileSync(path, "utf8")) as unknown;

describe("the omitted-effort rule", () => {
  it("fills in the agent's default when the model offers it, saves none for a model that takes none, and refuses otherwise", () => {
    expect(effortToSave(codex[1]!, undefined)).toEqual({ effort: "medium" });
    expect(effortToSave(codex[2]!, undefined)).toEqual({ problem: "Choose an effort for GPT-6-Astra; no supported default was reported." });
    expect(effortToSave(claude[0]!, undefined)).toEqual({ problem: "Choose an effort for Opus 5.5; no supported default was reported." });
    expect(effortToSave(claude[1]!, undefined)).toEqual({});
    expect(effortToSave(claude[1]!, "high")).toEqual({ problem: "Haiku 5.5 takes no effort; leave the effort out." });
    expect(checkModelChoice({ agentId: "codex", model: "gpt-6.1-sol" }, lists)).toEqual({ ok: true, choice: { agentId: "codex", model: "gpt-6.1-sol", effort: "medium" } });
  });
});

describe("editing Model defaults", () => {
  it("saves only what the person set, the family's newest model deciding the default effort", () => {
    expect(editModelDefaults(path, { set: { row: "standard", fallback: { agentId: "codex", family: "sol" } } }, lists)).toMatchObject({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, rows: { standard: { fallback: { agentId: "codex", family: "sol", effort: "medium" } } } });
  });

  it("refuses a row on one agent unless both sides move in one save", () => {
    expect(editModelDefaults(path, { set: { row: "audits", first: { agentId: "codex", family: "sol", effort: "high" } } }, lists)).toMatchObject({ ok: false, status: 422, reason: expect.stringContaining("would both be on Codex") });
    expect(editModelDefaults(path, { set: { row: "audits", first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "opus", effort: "high" } } }, lists)).toMatchObject({ ok: true, defaults: { rows: { audits: { first: { agentId: "codex" }, fallback: { agentId: "claude_code" } } } } });
  });

  it("switches the fallback, refuses a threshold outside 1 to 100, and keeps the switch over Restore", () => {
    expect(editModelDefaults(path, { fallback: { threshold: 101 } }, lists)).toMatchObject({ ok: false, status: 422 });
    expect(editModelDefaults(path, { fallback: { threshold: 0 } }, lists)).toMatchObject({ ok: false, status: 422 });
    expect(editModelDefaults(path, { fallback: { threshold: 1 } }, lists)).toMatchObject({ ok: true, defaults: { fallback: { threshold: 1 } } });
    expect(editModelDefaults(path, { fallback: { threshold: 100 } }, lists)).toMatchObject({ ok: true, defaults: { fallback: { threshold: 100 } } });
    // Today's switch writes the threshold setting or Never (Kiln Model Modes, phase 1; AC-CLI-01's meaning for the commands that exist today).
    expect(editModelDefaults(path, { fallback: { enabled: true, threshold: 80 } }, lists)).toMatchObject({ ok: true, defaults: { fallback: { use: "threshold", threshold: 80 } } });
    editModelDefaults(path, { set: { row: "demanding", first: { agentId: "claude_code", family: "opus", effort: "high" } } }, lists);
    expect(editModelDefaults(path, { restore: true }, lists)).toMatchObject({ ok: true, defaults: { fallback: { use: "threshold", threshold: 80 }, rows: { demanding: { firstSet: false } } } });
    expect(file()).toEqual({ schemaVersion: 2, fallback: { use: "threshold", threshold: 80 } });
    expect(editModelDefaults(path, { fallback: { enabled: false } }, lists)).toMatchObject({ ok: true, defaults: { fallback: { use: "never", threshold: 80 } } });
    expect(file()).toEqual({ schemaVersion: 2, fallback: { use: "never", threshold: 80 } });
  });

  it("changes the fifth row like the others, and refuses both of its sides on one agent (AC-ROW-01)", () => {
    expect(editModelDefaults(path, { set: { row: "preflight_pr", first: { agentId: "claude_code", family: "opus", effort: "low" } } }, lists)).toMatchObject({ ok: true, defaults: { rows: { preflight_pr: { first: { agentId: "claude_code", family: "opus", effort: "low" }, firstSet: true, fallbackSet: false } } } });
    expect(file()).toEqual({ schemaVersion: 2, rows: { preflight_pr: { first: { agentId: "claude_code", family: "opus", effort: "low" } } } });
    expect(editModelDefaults(path, { set: { row: "preflight_pr", fallback: { agentId: "claude_code", family: "opus", effort: "high" } } }, lists)).toMatchObject({ ok: false, status: 422, reason: expect.stringContaining("The Preflight and pull request row's first choice and fallback would both be on Claude Code") });
  });

  it("stores schema 2 on the first write over a schema 1 file, keeping the carried row and the switch as they read (AC-CARRY-01)", () => {
    const audits = { first: { agentId: "claude_code", family: "opus", effort: "low" } };
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, rows: { audits }, fallback: { enabled: true, threshold: 90 } }));
    expect(editModelDefaults(path, { set: { row: "standard", fallback: { agentId: "codex", family: "sol", effort: "high" } } }, lists)).toMatchObject({ ok: true });
    const carried = { first: audits.first, fallback: { agentId: "codex", family: "sol", effort: "xhigh" } };
    expect(file()).toEqual({ schemaVersion: 2, rows: { standard: { fallback: { agentId: "codex", family: "sol", effort: "high" } }, audits, preflight_pr: carried }, fallback: { use: "threshold", threshold: 90 } });
    // A later change to the Audits row no longer reaches the row it was carried into.
    editModelDefaults(path, { set: { row: "audits", first: { agentId: "claude_code", family: "opus", effort: "high" } } }, lists);
    expect((file() as { rows: { preflight_pr: unknown } }).rows.preflight_pr).toEqual(carried);
  });

  it("keeps a mode, a one model and a fallback used for everything that the file holds across a change to a row", () => {
    writeFileSync(path, JSON.stringify({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "codex", family: "sol", effort: "low" }, fallback: { use: "everything" } }));
    expect(editModelDefaults(path, { set: { row: "standard", first: { agentId: "claude_code", family: "opus", effort: "high" } } }, lists)).toMatchObject({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "codex", family: "sol", effort: "low" }, rows: { standard: { first: { agentId: "claude_code", family: "opus", effort: "high" } } }, fallback: { use: "everything" } });
  });

  it("refuses a save while the model list can't be read", () => {
    expect(editModelDefaults(path, { set: { row: "standard", first: { agentId: "claude_code", family: "opus", effort: "high" } } }, { claude_code: { error: "Couldn’t load Claude Code’s models." } })).toEqual({ ok: false, status: 422, reason: "Couldn’t load Claude Code’s models." });
  });

  it("lists each agent's families at their newest version", () => {
    expect(familyOptions("codex", codex).map(one => [one.family, one.modelName])).toEqual([["sol", "GPT-6.2-Sol"], ["astra", "GPT-6-Astra"]]);
    expect(familyOptions("claude_code", claude).map(one => [one.family, one.efforts])).toEqual([["opus", ["low", "medium", "high", "xhigh"]], ["haiku", []]]);
  });
});
