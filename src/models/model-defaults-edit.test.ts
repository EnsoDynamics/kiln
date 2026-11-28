// Changing Model defaults and a model choice (Kiln Phase Model Tiers AC-DEFAULT-02, AC-DEFAULT-05,
// AC-FALLBACK-01; technical design "Model defaults file" and the omitted-effort rule in "Command
// line"), and saving a set of changes for every PRD or for one PRD against real settings files
// (Kiln Model Modes AC-SAVE-03, AC-SAVE-04, AC-SAVE-05; technical design "Saving").

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelEntry } from "../account/model-list.js";
import { checkModelChoice, effortToSave, familyOptions, saveSettings, settingsView, useDefaults } from "./model-defaults-edit.js";
import type { SettingsChange } from "./settings-change.js";

let dir: string; let path: string; let own: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kiln-defaults-edit-")); path = join(dir, "model-defaults.json"); mkdirSync(join(dir, "prd")); own = join(dir, "prd", "model-settings.json"); });
afterEach(() => { chmodSync(join(dir, "prd"), 0o700); rmSync(dir, { recursive: true, force: true }); });

const entry = (value: string, displayName: string, over: Partial<ModelEntry> = {}): ModelEntry => ({ value, resolvedModel: value, displayName, description: "", supportsEffort: true, supportedEffortLevels: ["low", "medium", "high", "xhigh"] as never, supportsAutoMode: true, ...over });
const claude = [entry("opus", "Opus 5.5"), entry("haiku", "Haiku 5.5", { supportsEffort: false, supportedEffortLevels: [] })];
const codex = [entry("gpt-6.1-sol", "GPT-6.1-Sol", { defaultEffort: "medium" }), entry("gpt-6.2-sol", "GPT-6.2-Sol", { defaultEffort: "medium" }), entry("gpt-6-astra", "GPT-6-Astra", { defaultEffort: "ultra" })];
const lists = { claude_code: { models: claude }, codex: { models: codex } };
const json = (at: string) => JSON.parse(readFileSync(at, "utf8")) as unknown;
const file = () => json(path);
const ownFile = () => json(own);
const write = (at: string, settings: object) => writeFileSync(at, JSON.stringify({ schemaVersion: 2, ...settings }));
/** A save for every PRD with no PRD in hand, as a command without --prd makes it. */
const forEveryPrd = (change: SettingsChange, withLists: Parameters<typeof saveSettings>[3] = lists) => saveSettings({ defaultsPath: path }, "every_prd", change, withLists);
/** A save from the page of the PRD whose own settings would be at `own`. */
const fromPrd = (target: "every_prd" | "this_prd", change: SettingsChange) => saveSettings({ defaultsPath: path, settingsPath: own }, target, change, lists);
const opus = (effort: string) => ({ agentId: "claude_code" as const, family: "opus", effort });
const sol = (effort: string) => ({ agentId: "codex" as const, family: "sol", effort });

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

describe("saving for every PRD (AC-SAVE-03)", () => {
  it("saves only what the person set, the family's newest model deciding the default effort", () => {
    expect(forEveryPrd({ rows: { standard: { fallback: { agentId: "codex", family: "sol" } } } })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, rows: { standard: { fallback: sol("medium") } } });
  });

  it("refuses a row on one agent unless both sides move in one save", () => {
    expect(forEveryPrd({ rows: { audits: { first: sol("high") } } })).toMatchObject({ ok: false, status: 422, reason: expect.stringContaining("would both be on Codex") });
    expect(existsSync(path)).toBe(false);
    expect(forEveryPrd({ rows: { audits: { first: sol("high"), fallback: opus("high") } } })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, rows: { audits: { first: sol("high"), fallback: opus("high") } } });
  });

  it("saves each of the three fallback settings and a threshold from 1 to 100 (AC-WHEN-01)", () => {
    for (const threshold of [101, 0, 1.5]) expect(forEveryPrd({ fallback: { threshold } })).toEqual({ ok: false, status: 422, reason: "The threshold is a whole-number percent from 1 to 100." });
    expect(existsSync(path)).toBe(false);
    for (const threshold of [1, 100]) { expect(forEveryPrd({ fallback: { threshold } })).toEqual({ ok: true }); expect(file()).toEqual({ schemaVersion: 2, fallback: { threshold } }); }
    for (const use of ["threshold", "everything", "never"] as const) { expect(forEveryPrd({ fallback: { use } })).toEqual({ ok: true }); expect(file()).toEqual({ schemaVersion: 2, fallback: { use, threshold: 100 } }); }
  });

  it("saves the mode with its one model, checked as a row's side is, and keeps each mode's settings while the other is selected (AC-MODE-01)", () => {
    write(path, { rows: { standard: { first: opus("high") } }, fallback: { use: "everything" } });
    expect(forEveryPrd({ mode: "one_model", oneModel: { agentId: "codex", family: "sol" } })).toEqual({ ok: true });
    // The rows and the fallback setting stay in the file under one model, and return when Recommended is selected again.
    expect(file()).toEqual({ schemaVersion: 2, mode: "one_model", oneModel: sol("medium"), rows: { standard: { first: opus("high") } }, fallback: { use: "everything" } });
    expect(forEveryPrd({ mode: "recommended" })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, mode: "recommended", oneModel: sol("medium"), rows: { standard: { first: opus("high") } }, fallback: { use: "everything" } });
    expect(forEveryPrd({ oneModel: { agentId: "claude_code", family: "opus" } })).toEqual({ ok: false, status: 422, reason: "Choose an effort for Opus 5.5; no supported default was reported." });
  });

  it("changes the fifth row like the others, and refuses both of its sides on one agent (AC-ROW-01)", () => {
    expect(forEveryPrd({ rows: { preflight_pr: { first: opus("low") } } })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, rows: { preflight_pr: { first: opus("low") } } });
    expect(forEveryPrd({ rows: { preflight_pr: { fallback: opus("high") } } })).toMatchObject({ ok: false, status: 422, reason: expect.stringContaining("The Preflight and pull request row's first choice and fallback would both be on Claude Code") });
  });

  it("stores schema 2 on the first write over a schema 1 file, keeping the carried row and the switch as they read (AC-CARRY-01)", () => {
    const audits = { first: opus("low") };
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, rows: { audits }, fallback: { enabled: true, threshold: 90 } }));
    expect(forEveryPrd({ rows: { standard: { fallback: sol("high") } } })).toEqual({ ok: true });
    const carried = { first: audits.first, fallback: sol("xhigh") };
    expect(file()).toEqual({ schemaVersion: 2, rows: { standard: { fallback: sol("high") }, audits, preflight_pr: carried }, fallback: { use: "threshold", threshold: 90 } });
    // A later change to the Audits row no longer reaches the row it was carried into.
    forEveryPrd({ rows: { audits: { first: opus("high") } } });
    expect((file() as { rows: { preflight_pr: unknown } }).rows.preflight_pr).toEqual(carried);
  });

  it("restores all of the defaults, the mode, the one model and the fallback setting with its threshold included, then applies the rest (SAVE-008)", () => {
    write(path, { mode: "one_model", oneModel: sol("low"), rows: { demanding: { first: opus("high") } }, fallback: { use: "everything", threshold: 80 } });
    expect(forEveryPrd({ restore: true })).toEqual({ ok: true });
    // Clearing the fields, not writing Kiln's values, keeps the file holding only what the person set.
    expect(file()).toEqual({ schemaVersion: 2 });
    write(path, { mode: "one_model", rows: { demanding: { first: opus("high") } }, fallback: { use: "everything", threshold: 80 } });
    expect(forEveryPrd({ restore: true, fallback: { use: "threshold", threshold: 90 } })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, fallback: { use: "threshold", threshold: 90 } });
    // After Restore a row is checked against Kiln's sides, not the ones the file held.
    write(path, { rows: { standard: { first: sol("high"), fallback: opus("high") } } });
    expect(forEveryPrd({ restore: true, rows: { standard: { fallback: opus("high") } } })).toMatchObject({ ok: false, status: 422, reason: expect.stringContaining("would both be on Claude Code") });
  });

  it("refuses a save while the model list can't be read", () => {
    expect(forEveryPrd({ rows: { standard: { first: opus("high") } } }, { claude_code: { error: "Couldn’t load Claude Code’s models." } })).toEqual({ ok: false, status: 422, reason: "Couldn’t load Claude Code’s models." });
  });

  it("refuses every save over Model defaults that don't parse but Restore, which leaves every setting at Kiln's choice and says the fallback is now off", () => {
    writeFileSync(path, "{ broken");
    expect(forEveryPrd({ fallback: { use: "everything" } })).toMatchObject({ ok: false, status: 409, source: "defaults", path, canRestore: true, reason: expect.stringContaining("isn't valid JSON") });
    expect(readFileSync(path, "utf8")).toBe("{ broken");
    expect(forEveryPrd({ restore: true })).toEqual({ ok: true, notice: "Kiln's defaults are restored, and the fallback is now off." });
    expect(file()).toEqual({ schemaVersion: 2 });
    // A file a newer Kiln wrote isn't Kiln's to rewrite.
    writeFileSync(path, JSON.stringify({ schemaVersion: 99 }));
    expect(forEveryPrd({ restore: true })).toMatchObject({ ok: false, status: 409, source: "defaults", canRestore: false });
    expect(file()).toEqual({ schemaVersion: 99 });
  });

  it("lists each agent's families at their newest version", () => {
    expect(familyOptions("codex", codex).map(one => [one.family, one.modelName])).toEqual([["sol", "GPT-6.2-Sol"], ["astra", "GPT-6-Astra"]]);
    expect(familyOptions("claude_code", claude).map(one => [one.family, one.efforts])).toEqual([["opus", ["low", "medium", "high", "xhigh"]], ["haiku", []]]);
  });
});

describe("saving for this PRD only (AC-SAVE-04)", () => {
  it("gives a PRD that follows the defaults its own settings: what Model defaults holds, with the change, and nothing Kiln chose", () => {
    write(path, { rows: { standard: { first: opus("high") } }, fallback: { threshold: 90 } });
    expect(fromPrd("this_prd", { fallback: { use: "everything" } })).toEqual({ ok: true });
    // The copy holds only what the person set, so a row nobody set still follows Kiln's current choice (SAVE-006).
    expect(ownFile()).toEqual({ schemaVersion: 2, rows: { standard: { first: opus("high") } }, fallback: { use: "everything", threshold: 90 } });
    // The defaults and every other PRD are unchanged.
    expect(file()).toEqual({ schemaVersion: 2, rows: { standard: { first: opus("high") } }, fallback: { threshold: 90 } });
  });

  it("copies a schema 1 file as it reads: the switch as the threshold setting and the row carried from a changed Audits row", () => {
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, rows: { audits: { first: opus("low") } }, fallback: { enabled: true, threshold: 90 } }));
    expect(fromPrd("this_prd", { mode: "one_model", oneModel: sol("high") })).toEqual({ ok: true });
    expect(ownFile()).toEqual({ schemaVersion: 2, mode: "one_model", oneModel: sol("high"), rows: { audits: { first: opus("low") }, preflight_pr: { first: opus("low"), fallback: sol("xhigh") } }, fallback: { use: "threshold", threshold: 90 } });
    // The schema 1 file is read, never rewritten, by a save that doesn't go to it.
    expect(file()).toEqual({ schemaVersion: 1, rows: { audits: { first: opus("low") } }, fallback: { enabled: true, threshold: 90 } });
  });

  it("changes only its own settings once it has them, and a later save for every PRD from elsewhere doesn't reach them", () => {
    write(own, { fallback: { use: "everything" } });
    expect(fromPrd("this_prd", { rows: { mechanical: { first: opus("low") } } })).toEqual({ ok: true });
    expect(ownFile()).toEqual({ schemaVersion: 2, rows: { mechanical: { first: opus("low") } }, fallback: { use: "everything" } });
    expect(existsSync(path)).toBe(false);
    expect(forEveryPrd({ fallback: { use: "threshold", threshold: 70 } })).toEqual({ ok: true });
    expect(ownFile()).toEqual({ schemaVersion: 2, rows: { mechanical: { first: opus("low") } }, fallback: { use: "everything" } });
  });

  it("empties the PRD's own settings on Restore, which remain its own", () => {
    write(path, { fallback: { use: "threshold" } });
    write(own, { mode: "one_model", fallback: { use: "everything" } });
    expect(fromPrd("this_prd", { restore: true })).toEqual({ ok: true });
    expect(ownFile()).toEqual({ schemaVersion: 2 });
    expect(file()).toEqual({ schemaVersion: 2, fallback: { use: "threshold" } });
    expect(settingsView({ defaultsPath: path, settingsPath: own }, { lists, agents: [] })).toMatchObject({ ok: true, view: { source: "prd", mode: "recommended", fallback: { use: "never", threshold: 95 } } });
  });

  it("refuses to create own settings while Model defaults can't be read, and refuses every save over own settings that can't be read", () => {
    writeFileSync(path, "{ broken");
    expect(fromPrd("this_prd", { fallback: { use: "everything" } })).toMatchObject({ ok: false, status: 409, source: "defaults", path });
    expect(fromPrd("this_prd", { restore: true })).toMatchObject({ ok: false, status: 409, source: "defaults" });
    expect(existsSync(own)).toBe(false);
    // Rewriting the PRD's file from Kiln's choices would quietly end a setting such as For everything, so Restore is refused too.
    rmSync(path); writeFileSync(own, "{ broken");
    for (const target of ["this_prd", "every_prd"] as const) expect(fromPrd(target, { restore: true })).toMatchObject({ ok: false, status: 409, source: "prd", path: own, canRestore: true });
    expect(readFileSync(own, "utf8")).toBe("{ broken");
    expect(existsSync(path)).toBe(false);
  });

  it("writes own settings as usual while Model defaults can't be read: a PRD with its own settings needs nothing from them", () => {
    writeFileSync(path, "{ broken");
    write(own, { mode: "one_model" });
    expect(fromPrd("this_prd", { mode: "recommended" })).toEqual({ ok: true });
    expect(ownFile()).toEqual({ schemaVersion: 2, mode: "recommended" });
    expect(settingsView({ defaultsPath: path, settingsPath: own }, { lists, agents: [] })).toMatchObject({ ok: true, view: { source: "prd", holdsSettings: true } });
  });
});

describe("saving for every PRD from a PRD with its own settings (AC-SAVE-03, SAVE-004)", () => {
  it("puts only what changed into the defaults and into the PRD's own settings, leaving the rest of each as it was", () => {
    write(path, { rows: { mechanical: { first: opus("low") } }, fallback: { use: "threshold", threshold: 90 } });
    write(own, { rows: { audits: { first: opus("medium") } }, fallback: { use: "everything" } });
    expect(fromPrd("every_prd", { rows: { demanding: { first: opus("xhigh") } } })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus("xhigh") }, mechanical: { first: opus("low") } }, fallback: { use: "threshold", threshold: 90 } });
    expect(ownFile()).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus("xhigh") }, audits: { first: opus("medium") } }, fallback: { use: "everything" } });
    // Saving the same changes again changes nothing: a repeat after a failed second write is safe.
    expect(fromPrd("every_prd", { rows: { demanding: { first: opus("xhigh") } } })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus("xhigh") }, mechanical: { first: opus("low") } }, fallback: { use: "threshold", threshold: 90 } });
    expect(ownFile()).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus("xhigh") }, audits: { first: opus("medium") } }, fallback: { use: "everything" } });
  });

  it("checks both files before writing either, and says which refused", () => {
    // The PRD's Standard row is on the other agents, so the same change passes in its file and fails in Model defaults, and the reverse.
    write(own, { rows: { standard: { first: sol("high"), fallback: opus("high") } } });
    const before = readFileSync(own, "utf8");
    expect(fromPrd("every_prd", { rows: { standard: { first: sol("low") } }, fallback: { use: "everything" } })).toEqual({ ok: false, status: 422, reason: "Model defaults: The Standard row's first choice and fallback would both be on Codex. To move the row to Codex, change both sides in one save. Nothing was saved." });
    expect(fromPrd("every_prd", { rows: { standard: { first: opus("low") } }, fallback: { use: "everything" } })).toEqual({ ok: false, status: 422, reason: "This PRD's own settings: The Standard row's first choice and fallback would both be on Claude Code. To move the row to Claude Code, change both sides in one save. Nothing was saved." });
    expect(existsSync(path)).toBe(false);
    expect(readFileSync(own, "utf8")).toBe(before);
  });

  it("reports a second write that failed as a failed save naming the file not written, and finishes when saved again", () => {
    write(own, { fallback: { use: "everything" } });
    // The PRD's state directory can't be written, so its file can't be replaced after Model defaults was.
    chmodSync(join(dir, "prd"), 0o500);
    const failed = fromPrd("every_prd", { rows: { demanding: { first: opus("xhigh") } } });
    expect(failed).toMatchObject({ ok: false, status: 500, reason: expect.stringMatching(new RegExp(`^Model defaults were saved, but this PRD's own settings at ${own.replace(/[.]/g, "\\.")} were not: .* Save again to finish\\.$`)) });
    expect(file()).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus("xhigh") } } });
    expect(ownFile()).toEqual({ schemaVersion: 2, fallback: { use: "everything" } });
    chmodSync(join(dir, "prd"), 0o700);
    expect(fromPrd("every_prd", { rows: { demanding: { first: opus("xhigh") } } })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus("xhigh") } } });
    expect(ownFile()).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus("xhigh") } }, fallback: { use: "everything" } });
  });

  it("restores all of the defaults and ends the PRD's own settings, so it follows the restored defaults (SAVE-008)", () => {
    write(path, { mode: "one_model", rows: { mechanical: { first: opus("low") } }, fallback: { use: "threshold", threshold: 90 } });
    write(own, { fallback: { use: "everything" } });
    expect(fromPrd("every_prd", { restore: true, rows: { demanding: { first: opus("xhigh") } } })).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, rows: { demanding: { first: opus("xhigh") } } });
    expect(existsSync(own)).toBe(false);
    expect(settingsView({ defaultsPath: path, settingsPath: own }, { lists, agents: [] })).toMatchObject({ ok: true, view: { source: "defaults", mode: "recommended", fallback: { use: "never", threshold: 95 } } });
  });

  it("is refused before either file is written while Model defaults can't be read, unless it restores them", () => {
    writeFileSync(path, "{ broken");
    write(own, { fallback: { use: "everything" } });
    expect(fromPrd("every_prd", { rows: { demanding: { first: opus("xhigh") } } })).toMatchObject({ ok: false, status: 422, reason: expect.stringContaining(`Model defaults at ${path} isn't valid JSON`) });
    expect(readFileSync(path, "utf8")).toBe("{ broken");
    expect(ownFile()).toEqual({ schemaVersion: 2, fallback: { use: "everything" } });
    expect(fromPrd("every_prd", { restore: true })).toEqual({ ok: true, notice: "Kiln's defaults are restored, and the fallback is now off." });
    expect(file()).toEqual({ schemaVersion: 2 });
    expect(existsSync(own)).toBe(false);
  });
});

describe("Use my defaults here (AC-SAVE-05)", () => {
  const paths = () => ({ defaultsPath: path, settingsPath: own });

  it("removes the PRD's own settings, so it follows the defaults again, and leaves a PRD with none as it is", () => {
    write(path, { fallback: { use: "threshold" } });
    write(own, { fallback: { use: "everything" } });
    expect(settingsView(paths(), { lists, agents: [] })).toMatchObject({ ok: true, view: { source: "prd", fallback: { use: "everything" } } });
    expect(useDefaults(paths())).toEqual({ ok: true });
    expect(existsSync(own)).toBe(false);
    expect(settingsView(paths(), { lists, agents: [] })).toMatchObject({ ok: true, view: { source: "defaults", fallback: { use: "threshold" } } });
    expect(useDefaults(paths())).toEqual({ ok: true });
    expect(file()).toEqual({ schemaVersion: 2, fallback: { use: "threshold" } });
  });

  it("is the one write allowed over own settings that don't parse, whether or not Model defaults can be read, and is refused over a newer Kiln's file", () => {
    writeFileSync(path, "{ broken"); writeFileSync(own, "{ broken");
    expect(settingsView(paths(), { lists, agents: [] })).toMatchObject({ ok: false, status: 409, source: "prd", path: own, canRestore: true, reason: expect.stringContaining("Use my defaults here") });
    expect(useDefaults(paths())).toEqual({ ok: true });
    expect(existsSync(own)).toBe(false);
    // The PRD then follows Model defaults, whose own error shows.
    expect(settingsView(paths(), { lists, agents: [] })).toMatchObject({ ok: false, status: 409, source: "defaults", path, canRestore: true });
    writeFileSync(own, JSON.stringify({ schemaVersion: 99 }));
    expect(useDefaults(paths())).toMatchObject({ ok: false, status: 409, source: "prd", canRestore: false, reason: expect.stringContaining("was written by a newer Kiln") });
    expect(existsSync(own)).toBe(true);
  });
});

describe("the settings in force as the page and the commands show them", () => {
  it("shows a PRD's own settings in place of Model defaults, each choice saying whether that file holds it, with Kiln's choices for Restore", () => {
    write(path, { rows: { standard: { first: opus("high") } } });
    const agents = [{ agentId: "claude_code" as const, installed: true }, { agentId: "codex" as const, installed: true }];
    const defaults = settingsView({ defaultsPath: path, settingsPath: own }, { prd: "Customer returns", lists, agents });
    expect(defaults).toMatchObject({ ok: true, view: { source: "defaults", prd: "Customer returns", holdsSettings: true, mode: "recommended", oneModel: { agent: "Claude Code", familyName: "Opus", effort: "high", modelName: "Opus 5.5", set: false }, rows: { standard: { first: { effort: "high", set: true }, fallback: { set: false } } }, fallback: { use: "never", threshold: 95, enabled: false } } });
    write(own, { mode: "one_model", oneModel: sol("low"), fallback: { use: "everything" } });
    const prd = settingsView({ defaultsPath: path, settingsPath: own }, { prd: "Customer returns", lists, agents });
    expect(prd).toMatchObject({ ok: true, view: { source: "prd", mode: "one_model", oneModel: { agent: "Codex", familyName: "GPT Sol", modelName: "GPT-6.2-Sol", effort: "low", set: true }, rows: { standard: { first: { effort: "medium", set: false } } }, fallback: { use: "everything", enabled: true },
      // What an empty file reads as now: Kiln's rows, the recommended mode, Never at 95, and the one model for this computer.
      kilnChoices: { mode: "recommended", oneModel: { agentId: "claude_code", family: "opus", effort: "high", set: false }, rows: { standard: { first: { family: "opus", effort: "medium", set: false } }, preflight_pr: { fallback: { family: "sol", effort: "medium" } } }, fallback: { use: "never", threshold: 95 } } } });
    // Read with no PRD, a command sees Model defaults alone.
    expect(settingsView({ defaultsPath: path }, { lists, agents })).toMatchObject({ ok: true, view: { source: "defaults", mode: "recommended" } });
    expect((settingsView({ defaultsPath: path }, { lists, agents }) as { view: object }).view).not.toHaveProperty("prd");
  });

  it("decides the one model when read, where Claude Code isn't installed, and says a restore would change nothing while no file holds a field", () => {
    const view = settingsView({ defaultsPath: path, settingsPath: own }, { lists, agents: [{ agentId: "codex", installed: true }] });
    expect(view).toMatchObject({ ok: true, view: { holdsSettings: false, oneModel: { agentId: "codex", family: "sol", effort: "high", set: false }, kilnChoices: { oneModel: { agentId: "codex", family: "sol", effort: "high" } } } });
    // A PRD's own settings holding nothing leave Restore with nothing to change; one field in either file gives it something.
    write(own, {});
    expect(settingsView({ defaultsPath: path, settingsPath: own }, { lists, agents: [] })).toMatchObject({ ok: true, view: { source: "prd", holdsSettings: false } });
    write(path, { fallback: { threshold: 90 } });
    expect(settingsView({ defaultsPath: path, settingsPath: own }, { lists, agents: [] })).toMatchObject({ ok: true, view: { source: "prd", holdsSettings: true } });
  });
});
