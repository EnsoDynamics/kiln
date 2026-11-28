// Model choices for tests (Kiln Phase Model Tiers): a whole PRD runs on one choice, as a PRD
// saved before per-activity choices keeps its old one (AC-KEEP-02), or Model defaults are written
// for every PRD on the test's computer, or one PRD is given settings of its own (Kiln Model Modes).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Engine } from "../engine/engine.js";
import { modelDefaultsPath, prdSettingsPath, type DefaultsRow, type FallbackUse, type FamilyChoice, type ModelChoice, type ModelMode } from "../models/model-defaults.js";

/** The Codex choice the Codex fixtures offer: the latest GPT Sol at high. */
export const CODEX_CHOICE: ModelChoice = { agentId: "codex", model: "gpt-6.1-sol", effort: "high" };

/**
 * Runs every activity of the engine's PRD that hasn't started on one choice, marked Changed by
 * you, as a PRD whose saved choice was kept (AC-KEEP-02), and reads that choice's agent.
 *
 *   await runPrdOn(h.engine);                                          // every activity on Codex · GPT Sol · high
 *   await runPrdOn(h.engine, { agentId: "claude_code", model: "sonnet", effort: "low" });
 */
export async function runPrdOn(engine: Engine, choice: ModelChoice = CODEX_CHOICE, refresh = true): Promise<void> {
  engine.record.settings.modelChoices.kept = { ...choice };
  engine.modelChoicesChanged();
  if (refresh) await engine.refreshAgents();
}

/** Writes Model defaults for every PRD on the test's computer: the rows given, the rest Kiln's own. */
export function writeModelDefaults(env: NodeJS.ProcessEnv, rows: Partial<Record<"demanding" | "standard" | "mechanical" | "audits", { first?: FamilyChoice; fallback?: FamilyChoice }>>, fallback?: { enabled?: boolean; threshold?: number }): string {
  const path = modelDefaultsPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, rows, ...(fallback ? { fallback } : {}) }));
  return path;
}

/** What a schema 2 settings file holds: only the fields the person set (Kiln Model Modes, "Settings files"). */
export interface SavedSettings {
  mode?: ModelMode;
  oneModel?: FamilyChoice;
  rows?: Partial<Record<DefaultsRow, { first?: FamilyChoice; fallback?: FamilyChoice }>>;
  fallback?: { use?: FallbackUse; threshold?: number };
}

/**
 * Writes Model defaults as this version saves them, for every PRD on the test's computer: the
 * settings come from a written file until the page and the commands save them.
 *
 *   writeSettings(h.env, { fallback: { use: "everything" } });
 */
export function writeSettings(env: NodeJS.ProcessEnv, settings: SavedSettings): string {
  const path = modelDefaultsPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ schemaVersion: 2, ...settings }));
  return path;
}

/**
 * Gives one PRD settings of its own, in its state directory, which it then reads in place of Model defaults.
 *
 *   writePrdSettings(h.stateDirectory, { mode: "one_model" });
 */
export function writePrdSettings(stateDirectory: string, settings: SavedSettings): string {
  const path = prdSettingsPath(stateDirectory);
  writeFileSync(path, JSON.stringify({ schemaVersion: 2, ...settings }));
  return path;
}
