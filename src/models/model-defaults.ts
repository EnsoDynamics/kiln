// Model settings (Kiln Phase Model Tiers, technical design "Model defaults file"; Kiln Model
// Modes, "Settings in Force" and "Settings files"): how models are picked, the one model, the
// choice for each tier, for audits and for the preflight and pull request, and when the fallback
// is used. Model defaults are one owner-only file at the state root, for every PRD on the
// computer; a PRD's own settings are a second file of the same schema in its state directory.
// A file holds only what the person set; every missing field is Kiln's shipped choice
// (AC-DEFAULT-01, AC-ROW-01). Every resolution reads the files as they are.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../state/records.js";
import { stateRoot } from "../state/state-files.js";

export const MODEL_DEFAULTS_FILE = "model-defaults.json";
/** A PRD's own settings, in that PRD's state directory (Kiln Model Modes, "Storage"). */
export const MODEL_SETTINGS_FILE = "model-settings.json";
export const MODEL_DEFAULTS_SCHEMA = 2;

export type DefaultsRow = "demanding" | "standard" | "mechanical" | "audits" | "preflight_pr";
export const DEFAULTS_ROWS: DefaultsRow[] = ["demanding", "standard", "mechanical", "audits", "preflight_pr"];
/** The rows as the page, the stops and the refusals name them. */
export const ROW_NAMES: Record<DefaultsRow, string> = { demanding: "Demanding", standard: "Standard", mechanical: "Mechanical", audits: "Audits", preflight_pr: "Preflight and pull request" };

/** The two ways of picking models (AC-MODE-01). */
export type ModelMode = "recommended" | "one_model";
/** When the fallback is used (AC-WHEN-01). */
export type FallbackUse = "never" | "threshold" | "everything";

/** A Model defaults side: a model family, resolved to the newest version its agent offers at launch. */
export interface FamilyChoice { agentId: AgentId; family: string; effort?: string }
/** A choice for one activity: the agent's model-list value. */
export interface ModelChoice { agentId: AgentId; model: string; effort?: string }

/** AC-DEFAULT-01's table (DEF-001, DEF-002) with AC-ROW-01's fifth row. */
export const SHIPPED_DEFAULTS: Record<DefaultsRow, { first: FamilyChoice; fallback: FamilyChoice }> = {
  demanding: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "astra", effort: "high" } },
  standard: { first: { agentId: "claude_code", family: "opus", effort: "medium" }, fallback: { agentId: "codex", family: "sol", effort: "high" } },
  mechanical: { first: { agentId: "claude_code", family: "sonnet", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } },
  audits: { first: { agentId: "claude_code", family: "opus", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "xhigh" } },
  preflight_pr: { first: { agentId: "claude_code", family: "opus", effort: "medium" }, fallback: { agentId: "codex", family: "sol", effort: "medium" } },
};
export const SHIPPED_FALLBACK: { use: FallbackUse; threshold: number } = { use: "never", threshold: 95 };

/**
 * The one model until the person picks one (AC-MODE-02), decided when read, never saved by itself.
 *
 *   shippedOneModel(true)   // { agentId: "claude_code", family: "opus", effort: "high" }
 *   shippedOneModel(false)  // { agentId: "codex", family: "sol", effort: "high" }
 */
export function shippedOneModel(claudeCodeInstalled: boolean): FamilyChoice {
  return claudeCodeInstalled ? { agentId: "claude_code", family: "opus", effort: "high" } : { agentId: "codex", family: "sol", effort: "high" };
}

export interface DefaultsRowView { first: FamilyChoice; fallback: FamilyChoice; firstSet: boolean; fallbackSet: boolean }
/** One settings file as read, shipped choices filled in, with whether the file holds each field. */
export interface ModelDefaults {
  mode: ModelMode; modeSet: boolean;
  /** The one model the file holds; absent until the person picks one, when `oneModelOf` decides it. */
  oneModel?: FamilyChoice;
  rows: Record<DefaultsRow, DefaultsRowView>;
  fallback: { use: FallbackUse; threshold: number; useSet: boolean; thresholdSet: boolean };
}
export type ModelDefaultsRead = { ok: true; defaults: ModelDefaults } | { ok: false; reason: string; path: string; canRestore: boolean };

/** `<state root>/model-defaults.json`. */
export function modelDefaultsPath(env: NodeJS.ProcessEnv): string {
  return join(stateRoot(env), MODEL_DEFAULTS_FILE);
}

/** `<PRD state directory>/model-settings.json`: the PRD has its own settings while this file exists. */
export function prdSettingsPath(stateDirectory: string): string {
  return join(stateDirectory, MODEL_SETTINGS_FILE);
}

/** Kiln's shipped choices, as a missing file reads. */
export function shippedDefaults(): ModelDefaults {
  const rows = Object.fromEntries(DEFAULTS_ROWS.map(row => [row, { first: { ...SHIPPED_DEFAULTS[row].first }, fallback: { ...SHIPPED_DEFAULTS[row].fallback }, firstSet: false, fallbackSet: false }])) as Record<DefaultsRow, DefaultsRowView>;
  return { mode: "recommended", modeSet: false, rows, fallback: { ...SHIPPED_FALLBACK, useSet: false, thresholdSet: false } };
}

/** The one model in force: the one the file holds, else Kiln's for this computer. */
export function oneModelOf(settings: Pick<ModelDefaults, "oneModel">, claudeCodeInstalled: boolean): FamilyChoice {
  return settings.oneModel ?? shippedOneModel(claudeCodeInstalled);
}

/**
 * The fallback setting in force (Kiln Model Modes, "Settings in Force"): the file's, only while
 * the mode is the recommended model for each phase; one model has no fallback (AC-MODE-03).
 *
 *   fallbackInForce({ mode: "one_model", fallback: { use: "everything", … } })  // "never"
 */
export function fallbackInForce(settings: Pick<ModelDefaults, "mode" | "fallback">): FallbackUse {
  return settings.mode === "one_model" ? "never" : settings.fallback.use;
}

/** Which file a read is of, for its messages: what it is called, and what a person does about one that can't be read. */
type FileKind = "defaults" | "prd";
const NOUN: Record<FileKind, string> = { defaults: "Model defaults", prd: "This PRD's own settings" };
const REMEDY: Record<FileKind, string> = { defaults: "Restore Kiln's defaults, or fix the file.", prd: "Fix the file, or delete it so this PRD follows Model defaults again." };

const cache = new Map<string, { key: string; read: ModelDefaultsRead }>();

function statKey(path: string): string {
  const stat = statSync(path);
  return `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
}

/** One settings file as it is now; `missing` when there is none. */
function readSettingsFile(path: string, kind: FileKind): ModelDefaultsRead | "missing" {
  let key: string;
  try { key = statKey(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return { ok: false, reason: `${NOUN[kind]} can't be read: ${(error as Error).message}`, path, canRestore: false };
  }
  const cached = cache.get(path);
  if (cached?.key === key) return cached.read;
  const read = parse(path, kind);
  if (read === "missing") return read;
  cache.set(path, { key, read });
  return read;
}

/**
 * Model defaults as the file now says. A missing file is all of Kiln's choices; a file that
 * doesn't parse, or fits neither schema 1 nor 2, is an error naming the file, never Kiln's
 * choices in its place.
 *
 *   readModelDefaults(modelDefaultsPath(process.env))  // { ok: true, defaults: { mode: "recommended", rows: { standard: { first: { agentId: "claude_code", family: "opus", effort: "medium" }, … } }, fallback: { use: "never", threshold: 95, … } } }
 */
export function readModelDefaults(path: string): ModelDefaultsRead {
  const read = readSettingsFile(path, "defaults");
  return read === "missing" ? { ok: true, defaults: shippedDefaults() } : read;
}

/** Where the settings an activity resolves against live: Model defaults, and the PRD's own settings when its state directory is known. */
export interface SettingsPaths { defaultsPath: string; settingsPath?: string | undefined }

/** The settings in force for a PRD, with where they came from. */
export interface SettingsInForce { source: "defaults" | "prd"; path: string; read: ModelDefaultsRead }

/**
 * The settings in force for a PRD (Kiln Model Modes, "Settings in Force"): its own when
 * `model-settings.json` exists in its state directory, otherwise Model defaults. Own settings that
 * can't be read are an error with that file's path; Kiln never reads Model defaults over them.
 *
 *   settingsInForce({ defaultsPath, settingsPath })  // { source: "prd", path: "…/model-settings.json", read: { ok: true, defaults: { mode: "one_model", … } } }
 */
export function settingsInForce(paths: SettingsPaths): SettingsInForce {
  if (paths.settingsPath !== undefined) {
    const own = readSettingsFile(paths.settingsPath, "prd");
    if (own !== "missing") return { source: "prd", path: paths.settingsPath, read: own };
  }
  return { source: "defaults", path: paths.defaultsPath, read: readModelDefaults(paths.defaultsPath) };
}

/**
 * Both files' stat keys, `missing` for an absent one, so creating, changing or removing either
 * changes it (Kiln Model Modes, "Snapshot" `revision`).
 *
 *   settingsRevision({ defaultsPath, settingsPath })  // "1764214500000:212:8841|missing"
 */
export function settingsRevision(paths: SettingsPaths): string {
  const one = (path: string | undefined) => { if (path === undefined) return "missing"; try { return statKey(path); } catch { return "missing"; } };
  return `${one(paths.defaultsPath)}|${one(paths.settingsPath)}`;
}

function parse(path: string, kind: FileKind): ModelDefaultsRead | "missing" {
  const noun = NOUN[kind];
  const refuse = (reason: string, canRestore = true): ModelDefaultsRead => ({ ok: false, reason, path, canRestore });
  const unreadable = (what: string) => refuse(`${noun} at ${path} ${what}. ${REMEDY[kind]}`);
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return unreadable("isn't valid JSON");
  }
  if (!isObject(raw)) return unreadable("isn't a settings object");
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion > MODEL_DEFAULTS_SCHEMA) return refuse(`${noun} at ${path} was written by a newer Kiln; update Kiln.`, false);
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== MODEL_DEFAULTS_SCHEMA) return unreadable("has no schema version Kiln reads");
  const legacy = raw.schemaVersion === 1;
  const unknownKey = Object.keys(raw).find(one => !(legacy ? ["schemaVersion", "rows", "fallback"] : ["schemaVersion", "mode", "oneModel", "rows", "fallback"]).includes(one));
  if (unknownKey) return unreadable(`has a field Kiln doesn't read: ${unknownKey}`);
  const defaults = shippedDefaults();
  if (raw.mode !== undefined) {
    if (raw.mode !== "recommended" && raw.mode !== "one_model") return unreadable("has a mode Kiln can't read");
    defaults.mode = raw.mode; defaults.modeSet = true;
  }
  if (raw.oneModel !== undefined) {
    const choice = familyChoice(raw.oneModel);
    if (!choice) return unreadable("has a one model Kiln can't read");
    defaults.oneModel = choice;
  }
  if (raw.rows !== undefined) {
    if (!isObject(raw.rows)) return unreadable("has rows Kiln can't read");
    for (const [name, value] of Object.entries(raw.rows)) {
      // Schema 1 had no Preflight and pull request row: it is carried from the Audits row below.
      if (!DEFAULTS_ROWS.includes(name as DefaultsRow) || legacy && name === "preflight_pr") return unreadable(`has a row Kiln doesn't know: ${name}`);
      if (!isObject(value) || Object.keys(value).some(side => side !== "first" && side !== "fallback")) return unreadable(`has a ${name} row Kiln can't read`);
      const row = defaults.rows[name as DefaultsRow];
      for (const side of ["first", "fallback"] as const) {
        if (value[side] === undefined) continue;
        const choice = familyChoice(value[side]);
        if (!choice) return unreadable(`has a ${name} ${side === "first" ? "first choice" : "fallback"} Kiln can't read`);
        row[side] = choice;
        row[side === "first" ? "firstSet" : "fallbackSet"] = true;
      }
      if (row.first.agentId === row.fallback.agentId) return unreadable(`has the ${name} row's first choice and fallback on the same agent`);
    }
  }
  if (raw.fallback !== undefined) {
    const fallback = raw.fallback;
    const thresholdOk = (value: unknown) => value === undefined || Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 100;
    if (legacy) {
      if (!isObject(fallback) || Object.keys(fallback).some(one => one !== "enabled" && one !== "threshold") || fallback.enabled !== undefined && typeof fallback.enabled !== "boolean" || !thresholdOk(fallback.threshold)) return unreadable("has a fallback switch or threshold Kiln can't read");
      // AC-CARRY-01: the switch on is the threshold setting with its threshold; off, or never set, is Never.
      if (typeof fallback.enabled === "boolean") { defaults.fallback.use = fallback.enabled ? "threshold" : "never"; defaults.fallback.useSet = true; }
    } else {
      if (!isObject(fallback) || Object.keys(fallback).some(one => one !== "use" && one !== "threshold") || fallback.use !== undefined && fallback.use !== "never" && fallback.use !== "threshold" && fallback.use !== "everything" || !thresholdOk(fallback.threshold)) return unreadable("has a fallback setting or threshold Kiln can't read");
      if (fallback.use !== undefined) { defaults.fallback.use = fallback.use as FallbackUse; defaults.fallback.useSet = true; }
    }
    if (typeof fallback.threshold === "number") { defaults.fallback.threshold = fallback.threshold; defaults.fallback.thresholdSet = true; }
  }
  if (legacy) carryAuditsRow(defaults);
  return { ok: true, defaults };
}

/**
 * The fifth row for someone who changed Audits before it existed (AC-CARRY-01, CARRY-001): when a
 * schema 1 file set either side of the Audits row, the Preflight and pull request row takes both
 * of the Audits row's sides, so the preflight and the pull request session keep what they ran on.
 */
function carryAuditsRow(defaults: ModelDefaults): void {
  const audits = defaults.rows.audits;
  if (!audits.firstSet && !audits.fallbackSet) return;
  defaults.rows.preflight_pr = { first: { ...audits.first }, fallback: { ...audits.fallback }, firstSet: true, fallbackSet: true };
}

function familyChoice(value: unknown): FamilyChoice | undefined {
  if (!isObject(value) || Object.keys(value).some(key => !["agentId", "family", "effort"].includes(key))) return undefined;
  if (value.agentId !== "claude_code" && value.agentId !== "codex") return undefined;
  if (typeof value.family !== "string" || value.family.trim() === "") return undefined;
  if (value.effort !== undefined && (typeof value.effort !== "string" || value.effort === "")) return undefined;
  return { agentId: value.agentId, family: value.family, ...(value.effort === undefined ? {} : { effort: value.effort as string }) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
