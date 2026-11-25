// Reading Model defaults (Kiln Phase Model Tiers AC-DEFAULT-01; technical design "Model defaults file").

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateRoot } from "../state/state-files.js";
import { modelDefaultsPath, readModelDefaults, shippedDefaults, SHIPPED_DEFAULTS } from "./model-defaults.js";

let dir: string; let path: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kiln-defaults-")); path = join(dir, "model-defaults.json"); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const write = (value: unknown) => writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));

describe("Model defaults", () => {
  it("ships AC-DEFAULT-01's table, with the fallback off at 95", () => {
    expect(SHIPPED_DEFAULTS).toEqual({
      demanding: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "astra", effort: "high" } },
      standard: { first: { agentId: "claude_code", family: "opus", effort: "medium" }, fallback: { agentId: "codex", family: "sol", effort: "high" } },
      mechanical: { first: { agentId: "claude_code", family: "sonnet", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } },
      audits: { first: { agentId: "claude_code", family: "opus", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "xhigh" } },
    });
    expect(shippedDefaults().fallback).toEqual({ enabled: false, threshold: 95 });
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
    expect(read.defaults.fallback).toEqual({ enabled: true, threshold: 90 });
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
    write({ schemaVersion: 2, rows: {} });
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
