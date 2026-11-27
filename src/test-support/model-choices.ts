// Model choices for tests (Kiln Phase Model Tiers): a whole PRD runs on one choice, as a PRD
// saved before per-activity choices keeps its old one (AC-KEEP-02), or Model defaults are written
// for every PRD on the test's computer.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Engine } from "../engine/engine.js";
import { modelDefaultsPath, type FamilyChoice, type ModelChoice } from "../models/model-defaults.js";

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
export function writeModelDefaults(env: NodeJS.ProcessEnv, rows: Partial<Record<"demanding" | "standard" | "mechanical" | "audits" | "requirements" | "refining_design", { first?: FamilyChoice; fallback?: FamilyChoice }>>, fallback?: { enabled?: boolean; threshold?: number }): string {
  const path = modelDefaultsPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, rows, ...(fallback ? { fallback } : {}) }));
  return path;
}
