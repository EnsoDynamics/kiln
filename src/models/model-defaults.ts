// Model defaults (Kiln Phase Model Tiers, technical design "Model defaults file"): the choice for
// each tier and for audits, and the fallback switch, kept in one owner-only file at the state
// root so they apply to every PRD on the computer. The file holds only what the person set; every
// missing side is Kiln's shipped default (AC-DEFAULT-01). Every resolution reads the file as it is.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../state/records.js";
import { stateRoot } from "../state/state-files.js";

export const MODEL_DEFAULTS_FILE = "model-defaults.json";
export const MODEL_DEFAULTS_SCHEMA = 2;

export type DefaultsRow = "demanding" | "standard" | "mechanical" | "audits" | "requirements" | "refining_design";
export const DEFAULTS_ROWS: DefaultsRow[] = ["demanding", "standard", "mechanical", "audits", "requirements", "refining_design"];

/** A Model defaults side: a model family, resolved to the newest version its agent offers at launch. */
export interface FamilyChoice { agentId: AgentId; family: string; effort?: string }
/** A choice for one activity: the agent's model-list value. */
export interface ModelChoice { agentId: AgentId; model: string; effort?: string }

/** AC-DEFAULT-01's table (DEF-001, DEF-002). */
export const SHIPPED_DEFAULTS: Record<DefaultsRow, { first: FamilyChoice; fallback: FamilyChoice }> = {
  demanding: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "astra", effort: "high" } },
  standard: { first: { agentId: "claude_code", family: "opus", effort: "medium" }, fallback: { agentId: "codex", family: "sol", effort: "high" } },
  mechanical: { first: { agentId: "claude_code", family: "sonnet", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } },
  requirements: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "astra", effort: "high" } },
  refining_design: { first: { agentId: "claude_code", family: "opus", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "xhigh" } },
  audits: { first: { agentId: "claude_code", family: "opus", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "xhigh" } },
};
export const SHIPPED_FALLBACK = { enabled: false, threshold: 95 };

export interface DefaultsRowView { first: FamilyChoice; fallback: FamilyChoice; firstSet: boolean; fallbackSet: boolean }
export interface ModelDefaults { skills: Record<string, FamilyChoice | ModelChoice>; rows: Record<DefaultsRow, DefaultsRowView>; fallback: { enabled: boolean; threshold: number } }
export type ModelDefaultsRead = { ok: true; defaults: ModelDefaults } | { ok: false; reason: string; path: string; canRestore: boolean };

/** `<state root>/model-defaults.json`. */
export function modelDefaultsPath(env: NodeJS.ProcessEnv): string {
  return join(stateRoot(env), MODEL_DEFAULTS_FILE);
}

/** Kiln's shipped defaults, as a missing file reads. */
export function shippedDefaults(): ModelDefaults {
  const rows = Object.fromEntries(DEFAULTS_ROWS.map(row => [row, { first: { ...SHIPPED_DEFAULTS[row].first }, fallback: { ...SHIPPED_DEFAULTS[row].fallback }, firstSet: false, fallbackSet: false }])) as Record<DefaultsRow, DefaultsRowView>;
  return { rows, skills: Object.create(null), fallback: { ...SHIPPED_FALLBACK } };
}

const cache = new Map<string, { key: string; read: ModelDefaultsRead }>();

/**
 * Model defaults as the file now says. A missing file is all defaults; a file that doesn't parse,
 * or doesn't fit schema 1, is an error naming the file, never Kiln's defaults in its place.
 *
 *   readModelDefaults(modelDefaultsPath(process.env))  // { ok: true, defaults: { rows: { standard: { first: { agentId: "claude_code", family: "opus", effort: "medium" }, … } }, fallback: { enabled: false, threshold: 95 } } }
 */
export function readModelDefaults(path: string): ModelDefaultsRead {
  let key: string;
  try { const stat = statSync(path); key = `${stat.mtimeMs}:${stat.size}:${stat.ino}`; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, defaults: shippedDefaults() };
    return { ok: false, reason: `Model defaults can't be read: ${(error as Error).message}`, path, canRestore: false };
  }
  const cached = cache.get(path);
  if (cached?.key === key) return cached.read;
  const read = parse(path);
  cache.set(path, { key, read });
  return read;
}

function parse(path: string): ModelDefaultsRead {
  const refuse = (reason: string, canRestore = true): ModelDefaultsRead => ({ ok: false, reason, path, canRestore });
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, defaults: shippedDefaults() };
    return refuse(`Model defaults at ${path} isn't valid JSON. Restore Kiln's defaults, or fix the file.`);
  }
  if (!isObject(raw)) return refuse(`Model defaults at ${path} isn't a settings object. Restore Kiln's defaults, or fix the file.`);
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion > MODEL_DEFAULTS_SCHEMA) return refuse(`Model defaults at ${path} was written by a newer Kiln; update Kiln.`, false);
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== MODEL_DEFAULTS_SCHEMA) return refuse(`Model defaults at ${path} has no schema version Kiln reads. Restore Kiln's defaults, or fix the file.`);
  const unknownKey = Object.keys(raw).find(one => !["schemaVersion", "rows", "fallback", "skills"].includes(one));
  if (unknownKey) return refuse(`Model defaults at ${path} has a field Kiln doesn't read: ${unknownKey}. Restore Kiln's defaults, or fix the file.`);
  const defaults = shippedDefaults();
  if (raw.skills !== undefined) {
    if (!isObject(raw.skills)) return refuse(`Model defaults at ${path} has skill choices Kiln can't read.`);
    for (const [name, value] of Object.entries(raw.skills)) {
      const choice = familyChoice(value) ?? exactChoice(value);
      if (!name.trim() || !choice) return refuse(`Model defaults at ${path} has a skill choice Kiln can't read: ${name}.`);
      defaults.skills[name] = choice;
    }
  }
  if (raw.rows !== undefined) {
    if (!isObject(raw.rows)) return refuse(`Model defaults at ${path} has rows Kiln can't read. Restore Kiln's defaults, or fix the file.`);
    for (const [name, value] of Object.entries(raw.rows)) {
      if (!DEFAULTS_ROWS.includes(name as DefaultsRow)) return refuse(`Model defaults at ${path} has a row Kiln doesn't know: ${name}. Restore Kiln's defaults, or fix the file.`);
      if (!isObject(value) || Object.keys(value).some(side => side !== "first" && side !== "fallback")) return refuse(`Model defaults at ${path} has a ${name} row Kiln can't read. Restore Kiln's defaults, or fix the file.`);
      const row = defaults.rows[name as DefaultsRow];
      for (const side of ["first", "fallback"] as const) {
        if (value[side] === undefined) continue;
        const choice = familyChoice(value[side]);
        if (!choice) return refuse(`Model defaults at ${path} has a ${name} ${side === "first" ? "first choice" : "fallback"} Kiln can't read. Restore Kiln's defaults, or fix the file.`);
        row[side] = choice;
        row[side === "first" ? "firstSet" : "fallbackSet"] = true;
      }
      if (row.first.agentId === row.fallback.agentId) return refuse(`Model defaults at ${path} has the ${name} row's first choice and fallback on the same agent. Restore Kiln's defaults, or fix the file.`);
    }
  }
  if (raw.fallback !== undefined) {
    const fallback = raw.fallback;
    if (!isObject(fallback) || Object.keys(fallback).some(one => one !== "enabled" && one !== "threshold")
      || fallback.enabled !== undefined && typeof fallback.enabled !== "boolean"
      || fallback.threshold !== undefined && !(Number.isInteger(fallback.threshold) && (fallback.threshold as number) >= 1 && (fallback.threshold as number) <= 100)) {
      return refuse(`Model defaults at ${path} has a fallback switch or threshold Kiln can't read. Restore Kiln's defaults, or fix the file.`);
    }
    if (typeof fallback.enabled === "boolean") defaults.fallback.enabled = fallback.enabled;
    if (typeof fallback.threshold === "number") defaults.fallback.threshold = fallback.threshold;
  }
  return { ok: true, defaults };
}

function familyChoice(value: unknown): FamilyChoice | undefined {
  if (!isObject(value) || Object.keys(value).some(key => !["agentId", "family", "effort"].includes(key))) return undefined;
  if (value.agentId !== "claude_code" && value.agentId !== "codex") return undefined;
  if (typeof value.family !== "string" || value.family.trim() === "") return undefined;
  if (value.effort !== undefined && (typeof value.effort !== "string" || value.effort === "")) return undefined;
  return { agentId: value.agentId, family: value.family, ...(value.effort === undefined ? {} : { effort: value.effort as string }) };
}

function exactChoice(value: unknown): ModelChoice | undefined {
  if (!isObject(value) || "family" in value || !("model" in value)) return undefined;
  const { model, ...rest } = value;
  const parsed = familyChoice({ ...rest, family: model });
  return parsed && { agentId: parsed.agentId, model: parsed.family, ...(parsed.effort ? { effort: parsed.effort } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
