// Reading Model defaults (Kiln Phase Model Tiers AC-DEFAULT-01; technical design "Model defaults file")
// and the settings in force (Kiln Model Modes AC-ROW-01, AC-CARRY-01; "Settings in Force", "Settings files").

import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateRoot } from "../state/state-files.js";
import { fallbackInForce, modelDefaultsPath, oneModelOf, prdSettingsPath, readModelDefaults, settingsInForce, settingsRevision, shippedDefaults, shippedOneModel, SHIPPED_DEFAULTS } from "./model-defaults.js";

let dir: string; let path: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kiln-defaults-")); path = join(dir, "model-defaults.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const write = (value: unknown) => writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));

describe("Model defaults", () => {
  it("ships AC-DEFAULT-01's table with AC-ROW-01's fifth row, the recommended mode, and the fallback never used at 95", () => {
    expect(SHIPPED_DEFAULTS).toEqual({
      demanding: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "astra", effort: "high" } },
      standard: { first: { agentId: "claude_code", family: "opus", effort: "medium" }, fallback: { agentId: "codex", family: "sol", effort: "high" } },
      mechanical: { first: { agentId: "claude_code", family: "sonnet", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } },
      audits: { first: { agentId: "claude_code", family: "opus", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "xhigh" } },
      preflight_pr: { first: { agentId: "claude_code", family: "opus", effort: "medium" }, fallback: { agentId: "codex", family: "sol", effort: "medium" } },
    });
    expect(shippedDefaults().fallback).toEqual({ use: "never", threshold: 95, useSet: false, thresholdSet: false });
    expect(shippedDefaults()).toMatchObject({ mode: "recommended", modeSet: false });
    expect(shippedDefaults().oneModel).toBeUndefined();
  });

  it("reads a missing file as all defaults, none of them set by the person", () => {
    const read = readModelDefaults(path);
    expect(read).toEqual({ ok: true, defaults: shippedDefaults() });
    expect(read.ok && Object.values(read.defaults.rows).every(row => !row.firstSet && !row.fallbackSet)).toBe(true);
  });

  it("holds only what the person set: a missing side is Kiln's default", () => {
    write({ schemaVersion: 1, rows: { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } }, fallback: { enabled: true, threshold: 90 } });
    const read = readModelDefaults(path);
    if (!read.ok) throw new Error(read.reason);
    expect(read.defaults.rows.standard).toEqual({ first: { agentId: "claude_code", family: "sonnet", effort: "low" }, fallback: SHIPPED_DEFAULTS.standard.fallback, firstSet: true, fallbackSet: false });
    expect(read.defaults.rows.demanding.first).toEqual(SHIPPED_DEFAULTS.demanding.first);
    expect(read.defaults.fallback).toEqual({ use: "threshold", threshold: 90, useSet: true, thresholdSet: true });
  });

  it("reads the file as it is now, every time", () => {
    write({ schemaVersion: 1, rows: { mechanical: { first: { agentId: "claude_code", family: "haiku", effort: "low" } } } });
    expect(readModelDefaults(path).ok && (readModelDefaults(path) as { ok: true; defaults: ReturnType<typeof shippedDefaults> }).defaults.rows.mechanical.first.family).toBe("haiku");
    write({ schemaVersion: 1, rows: { mechanical: { first: { agentId: "claude_code", family: "sonnet", effort: "medium" } } }, fallback: {} });
    const read = readModelDefaults(path);
    expect(read.ok && read.defaults.rows.mechanical.first).toEqual({ agentId: "claude_code", family: "sonnet", effort: "medium" });
  });

  it("is an error naming the file, never Kiln's defaults, when the file doesn't parse or fit schema 1", () => {
    for (const bad of ["{not json", [], { rows: {} }, { schemaVersion: 1, rows: { premium: {} } }, { schemaVersion: 1, rows: { standard: { first: { agentId: "gemini", family: "x" } } } }, { schemaVersion: 1, rows: { standard: { first: { agentId: "claude_code", family: "" } } } }, { schemaVersion: 1, fallback: { threshold: 0 } }, { schemaVersion: 1, fallback: { threshold: 95.5 } }, { schemaVersion: 1, fallback: { enabled: "yes" } }, { schemaVersion: 1, extra: true }]) {
      write(bad);
      const read = readModelDefaults(path);
      expect(read.ok, JSON.stringify(bad)).toBe(false);
      if (!read.ok) { expect(read.reason).toContain(path); expect(read.path).toBe(path); expect(read.canRestore).toBe(true); }
    }
  });

  it("refuses a row whose first choice and fallback are on the same agent", () => {
    write({ schemaVersion: 1, rows: { audits: { fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } } });
    const read = readModelDefaults(path);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toContain("same agent");
  });

  it("says a file a newer Kiln wrote needs a newer Kiln, and can't be restored over", () => {
    write({ schemaVersion: 3, rows: {} });
    expect(readModelDefaults(path)).toEqual({ ok: false, reason: `Model defaults at ${path} was written by a newer Kiln; update Kiln.`, path, canRestore: false });
  });

  // AC-DEFAULT-02: "kept for every PRD in every repository on the computer, across restarts and upgrades".
  it("lives in Kiln's state directory, one file for the computer, outside the installed package", () => {
    const env = { ...process.env, XDG_STATE_HOME: join(dir, "state") };
    expect(modelDefaultsPath(env)).toBe(join(stateRoot(env), "model-defaults.json"));
    if (process.platform !== "win32") expect(modelDefaultsPath(env)).toBe(join(dir, "state", "kiln", "model-defaults.json"));
    // Not inside the package an upgrade replaces, nor tied to a repository or the working directory.
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    expect(relative(packageRoot, modelDefaultsPath(env)).startsWith("..")).toBe(true);
    expect(modelDefaultsPath(env)).not.toContain(process.cwd());
  });
});

describe("a schema 2 settings file (Kiln Model Modes, \"Settings files\")", () => {
  it("holds the mode, the one model, the fifth row and the three-way fallback setting, and says which fields it holds", () => {
    write({ schemaVersion: 2, mode: "one_model", oneModel: { agentId: "codex", family: "sol", effort: "low" }, rows: { preflight_pr: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } }, fallback: { use: "everything" } });
    const read = readModelDefaults(path);
    if (!read.ok) throw new Error(read.reason);
    expect(read.defaults).toMatchObject({ mode: "one_model", modeSet: true, oneModel: { agentId: "codex", family: "sol", effort: "low" }, fallback: { use: "everything", threshold: 95, useSet: true, thresholdSet: false } });
    expect(read.defaults.rows.preflight_pr).toEqual({ first: { agentId: "claude_code", family: "sonnet", effort: "low" }, fallback: SHIPPED_DEFAULTS.preflight_pr.fallback, firstSet: true, fallbackSet: false });
    // The fallback setting is in force only while models are picked for each phase (AC-MODE-03).
    expect(fallbackInForce(read.defaults)).toBe("never");
    expect(fallbackInForce({ ...read.defaults, mode: "recommended" })).toBe("everything");
  });

  it("reads a missing field as Kiln's choice, and decides the one model from whether Claude Code is installed until the person picks one (AC-MODE-02)", () => {
    write({ schemaVersion: 2, mode: "one_model" });
    const read = readModelDefaults(path);
    if (!read.ok) throw new Error(read.reason);
    expect(read.defaults.oneModel).toBeUndefined();
    expect(oneModelOf(read.defaults, true)).toEqual({ agentId: "claude_code", family: "opus", effort: "high" });
    expect(oneModelOf(read.defaults, false)).toEqual({ agentId: "codex", family: "sol", effort: "high" });
    expect(shippedOneModel(true)).toEqual({ agentId: "claude_code", family: "opus", effort: "high" });
    expect(read.defaults.fallback).toEqual({ use: "never", threshold: 95, useSet: false, thresholdSet: false });
  });

  it("is an error naming the file for a mode, a one model or a fallback setting Kiln can't read, and for schema 1's switch in a schema 2 file", () => {
    for (const bad of [{ schemaVersion: 2, mode: "fast" }, { schemaVersion: 2, oneModel: { agentId: "claude_code" } }, { schemaVersion: 2, fallback: { use: "sometimes" } }, { schemaVersion: 2, fallback: { enabled: true } }, { schemaVersion: 1, mode: "one_model" }, { schemaVersion: 1, rows: { preflight_pr: {} } }]) {
      write(bad);
      const read = readModelDefaults(path);
      expect(read.ok, JSON.stringify(bad)).toBe(false);
      if (!read.ok) expect(read.reason).toContain(path);
    }
  });
});

describe("a file saved before the upgrade keeps its meaning (AC-CARRY-01's table)", () => {
  const read = (value: unknown) => { write(value); const got = readModelDefaults(path); if (!got.ok) throw new Error(got.reason); return got.defaults; };

  it("reads the fallback on, with its threshold, as the threshold setting; off or never set as Never; and the mode as recommended", () => {
    expect(read({ schemaVersion: 1, fallback: { enabled: true, threshold: 88 } })).toMatchObject({ mode: "recommended", modeSet: false, fallback: { use: "threshold", threshold: 88 } });
    expect(read({ schemaVersion: 1, fallback: { enabled: false, threshold: 88 } }).fallback).toMatchObject({ use: "never", threshold: 88 });
    expect(read({ schemaVersion: 1, fallback: { threshold: 70 } }).fallback).toEqual({ use: "never", threshold: 70, useSet: false, thresholdSet: true });
    expect(read({ schemaVersion: 1 }).fallback).toEqual({ use: "never", threshold: 95, useSet: false, thresholdSet: false });
  });

  it("keeps a row's first choice and fallback", () => {
    const standard = { first: { agentId: "claude_code", family: "sonnet", effort: "low" }, fallback: { agentId: "codex", family: "astra", effort: "high" } };
    expect(read({ schemaVersion: 1, rows: { standard } }).rows.standard).toEqual({ ...standard, firstSet: true, fallbackSet: true });
  });

  it("starts the new row from both of a changed Audits row's sides, whichever side was changed (CARRY-001)", () => {
    const first = { agentId: "claude_code", family: "sonnet", effort: "high" };
    const one = read({ schemaVersion: 1, rows: { audits: { first } } });
    expect(one.rows.preflight_pr).toEqual({ first, fallback: SHIPPED_DEFAULTS.audits.fallback, firstSet: true, fallbackSet: true });
    const fallback = { agentId: "codex", family: "astra", effort: "high" };
    const other = read({ schemaVersion: 1, rows: { audits: { fallback } } });
    expect(other.rows.preflight_pr).toEqual({ first: SHIPPED_DEFAULTS.audits.first, fallback, firstSet: true, fallbackSet: true });
  });

  it("starts the new row at Kiln's choices when the Audits row was never changed, and never carries in a file this version wrote", () => {
    expect(read({ schemaVersion: 1, rows: { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } } }).rows.preflight_pr).toEqual({ ...SHIPPED_DEFAULTS.preflight_pr, firstSet: false, fallbackSet: false });
    expect(read({ schemaVersion: 2, rows: { audits: { first: { agentId: "claude_code", family: "sonnet", effort: "high" } } } }).rows.preflight_pr).toEqual({ ...SHIPPED_DEFAULTS.preflight_pr, firstSet: false, fallbackSet: false });
  });
});

describe("the settings in force (Kiln Model Modes, \"Settings in Force\")", () => {
  const paths = () => ({ defaultsPath: path, settingsPath: prdSettingsPath(join(dir, "prd-state")) });
  const own = (value: unknown) => { const file = paths().settingsPath; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); return file; };

  it("are Model defaults while the PRD has no file of its own, and none of the after-upgrade state gives it one", () => {
    write({ schemaVersion: 1, fallback: { enabled: true } });
    const inForce = settingsInForce(paths());
    expect(inForce).toMatchObject({ source: "defaults", path, read: { ok: true, defaults: { fallback: { use: "threshold" } } } });
    expect(settingsInForce({ defaultsPath: path }).source).toBe("defaults");
  });

  it("are the PRD's own once model-settings.json exists in its state directory, whatever Model defaults say", () => {
    write({ schemaVersion: 2, fallback: { use: "threshold", threshold: 80 } });
    const file = own({ schemaVersion: 2, fallback: { use: "everything" } });
    expect(file).toBe(join(dir, "prd-state", "model-settings.json"));
    expect(settingsInForce(paths())).toMatchObject({ source: "prd", path: file, read: { ok: true, defaults: { fallback: { use: "everything", threshold: 95 } } } });
    unlinkSync(file);
    expect(settingsInForce(paths())).toMatchObject({ source: "defaults", read: { ok: true, defaults: { fallback: { use: "threshold", threshold: 80 } } } });
  });

  it("are an error with the PRD's file's path when its own settings can't be read, never Model defaults in their place", () => {
    write({ schemaVersion: 2, fallback: { use: "never" } });
    const file = own("{ broken");
    const inForce = settingsInForce(paths());
    expect(inForce.source).toBe("prd");
    expect(inForce.read).toMatchObject({ ok: false, path: file, reason: expect.stringContaining(file) });
    expect(!inForce.read.ok && inForce.read.reason).toContain("This PRD's own settings");
    own({ schemaVersion: 3 });
    expect(settingsInForce(paths()).read).toMatchObject({ ok: false, canRestore: false, reason: expect.stringContaining("newer Kiln") });
  });

  it("has a revision that changes when either file is written, and when the PRD gains or loses its own settings", () => {
    const none = settingsRevision(paths());
    expect(none).toBe("missing|missing");
    write({ schemaVersion: 2 });
    const defaultsOnly = settingsRevision(paths());
    expect(defaultsOnly).not.toBe(none);
    expect(defaultsOnly.endsWith("|missing")).toBe(true);
    const file = own({ schemaVersion: 2, mode: "one_model" });
    const both = settingsRevision(paths());
    expect(both).not.toBe(defaultsOnly);
    unlinkSync(file);
    expect(settingsRevision(paths())).toBe(defaultsOnly);
  });
});
