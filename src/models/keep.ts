// A choice saved before this change (Kiln Phase Model Tiers AC-KEEP-02, KEEP-001, KEEP-003;
// technical design "Data Models"): the migration to schema 27 and the continuation's conversion.

import type { ModelChoice } from "./model-defaults.js";
import { codexFamilyOf } from "./resolver.js";
import { firstResponseInSavedEvents, startingSession } from "./start-line.js";
import { readSessionRecord, writeSessionRecord, type ModelChoices, type PrdRecord, type SessionRecord } from "../state/records.js";

/**
 * Whether a saved choice is one Kiln fills in today: Claude Code · Opus · medium, or Codex · any
 * GPT Sol version · high (the KEEP-001 decision). The value is the only evidence of who set it.
 */
export function isCurrentDefault(choice: ModelChoice): boolean {
  if (choice.agentId === "claude_code") return choice.model === "opus" && choice.effort === "medium";
  return codexFamilyOf(choice.model)?.family === "sol" && choice.effort === "high";
}

/** The PRD-wide choice a record saved before schema 27 held; undefined when it held none with a model. */
export function legacyChoice(settings: Record<string, unknown>): ModelChoice | undefined {
  const agentId = settings.agentId === "codex" ? "codex" : "claude_code";
  const choices = settings.agentChoices as Record<string, { model?: unknown; effort?: unknown } | undefined> | undefined;
  const saved = choices ? choices[agentId] : { model: settings.model, effort: settings.effort };
  if (!saved || typeof saved.model !== "string" || saved.model === "") return undefined;
  return { agentId, model: saved.model, ...(typeof saved.effort === "string" && saved.effort !== "" ? { effort: saved.effort } : {}) };
}

/** Removes the fields one choice for the whole PRD kept. */
function retire(settings: Record<string, unknown>): void {
  for (const field of ["agentId", "selectionGeneration", "agentChoices", "model", "effort"]) delete settings[field];
}

/**
 * Migration to schema 27, steps 1 to 4: each saved session's first response from what is already
 * saved, each activity's starting session, the KEEP table applied to the saved choice, billing's
 * last launch keyed by agent, and the retired fields removed. Without a state directory (a saved
 * record read for status), no session can be read, so no activity counts as started.
 */
export function migrateModelChoices(record: PrdRecord, stateDirectory: string | undefined): void {
  const settings = record.settings as unknown as Record<string, unknown>;
  const saved = legacyChoice(settings);
  let anyStarted = false;
  if (stateDirectory) {
    for (const [key, facts] of Object.entries(record.phases ?? {})) {
      const sessions = new Map<string, SessionRecord | undefined>();
      const read = (id: string) => {
        if (!sessions.has(id)) {
          let one: SessionRecord | undefined;
          try { one = readSessionRecord(stateDirectory, key, id); } catch { one = undefined; }
          if (one && !one.firstResponseAt) {
            const at = firstResponseInSavedEvents(stateDirectory, one);
            if (at) { one.firstResponseAt = at; try { writeSessionRecord(stateDirectory, one); } catch { /* Derived again on the next load. */ } }
          }
          sessions.set(id, one);
        }
        return sessions.get(id);
      };
      // Every session gets its first response derived, so a finished row reads its latest session's.
      for (const id of facts.sessionIds) read(id);
      const starting = startingSession(facts, read);
      if (starting) { facts.startedSessionId ??= starting.sessionId; anyStarted = true; }
    }
  }
  // Settings already holding model choices have nothing PRD-wide left to apply.
  const existing = settings.modelChoices as ModelChoices | undefined;
  const choices: ModelChoices = existing ?? { phases: {} };
  if (!existing && saved && (anyStarted || !isCurrentDefault(saved))) choices.kept = saved;
  retire(settings);
  record.settings.modelChoices = choices;
  const billing = record.billing as unknown as { lastLaunch?: Record<string, unknown> } | undefined;
  const last = billing?.lastLaunch;
  if (last && typeof last.route === "string") billing!.lastLaunch = { [typeof last.agentId === "string" ? last.agentId : "claude_code"]: last };
}

/**
 * A continuation acceptance saved before schema 27 (technical design, "Settings saved outside the
 * PRD record"): migration step 2 with no activity taken as started, then step 4.
 */
export function convertAcceptanceSettings(settings: Record<string, unknown>): void {
  if (settings.modelChoices !== undefined) return;
  const saved = legacyChoice(settings);
  retire(settings);
  settings.modelChoices = { phases: {}, ...(saved && !isCurrentDefault(saved) ? { kept: saved } : {}) } satisfies ModelChoices;
}

/**
 * Migration to schema 28 (Kiln Model Modes, "Data Models"; AC-CARRY-01's last row): the Preflight
 * and pull request entry starts as a copy of the Audits entry, a choice or `"default"` alike, so
 * the preflight, the pull request session, the merge and the plan push resolve after the upgrade
 * as they did before it. Settings that already hold the entry are left as they are.
 *
 *   migratePreflightPrChoice({ phases: {}, audits: { agentId: "codex", model: "gpt-6.2-sol", effort: "high" } })
 *   // the choices now also hold preflightPr: { agentId: "codex", model: "gpt-6.2-sol", effort: "high" }
 */
export function migratePreflightPrChoice(choices: ModelChoices | undefined): void {
  if (!choices || choices.preflightPr !== undefined || choices.audits === undefined) return;
  choices.preflightPr = choices.audits === "default" ? "default" : { ...choices.audits };
}

/** A continuation's new settings drop a kept choice equal to Kiln's current default (KEEP-003). */
export function continuedModelChoices(choices: ModelChoices): ModelChoices {
  const next: ModelChoices = structuredClone(choices);
  if (next.kept && isCurrentDefault(next.kept)) delete next.kept;
  return next;
}

function validChoice(value: unknown): value is ModelChoice {
  if (typeof value !== "object" || value === null) return false;
  const choice = value as Record<string, unknown>;
  return (choice.agentId === "claude_code" || choice.agentId === "codex") && typeof choice.model === "string" && choice.model !== "" && (choice.effort === undefined || typeof choice.effort === "string" && choice.effort !== "") && Object.keys(choice).every(key => ["agentId", "model", "effort"].includes(key));
}

export function assertModelChoices(value: ModelChoices | undefined): void {
  if (!value || typeof value !== "object" || typeof value.phases !== "object" || value.phases === null) throw new Error("Malformed model choices.");
  for (const entry of Object.values(value.phases)) if (entry !== "default" && !validChoice(entry)) throw new Error("Malformed model choice for a phase.");
  if (value.audits !== undefined && value.audits !== "default" && !validChoice(value.audits)) throw new Error("Malformed Audits model choice.");
  if (value.preflightPr !== undefined && value.preflightPr !== "default" && !validChoice(value.preflightPr)) throw new Error("Malformed Preflight and pull request model choice.");
  if (value.kept !== undefined && !validChoice(value.kept)) throw new Error("Malformed kept model choice.");
}
