// Changing a model choice (Kiln Phase Model Tiers AC-PICK-03, AC-OTHER-01, AC-DEFAULT-02,
// AC-DEFAULT-05, AC-FALLBACK-01; technical design "Model defaults file", "HTTP" and "Command
// line"): one module behind the page, `POST /api/model-defaults`, `kiln model-defaults`, the row
// Change and `kiln model`, so every surface applies the same omitted-effort rule and refusals.
// Every write re-reads the file, applies one change and replaces it atomically.

import { readFileSync } from "node:fs";
import { autoModeError, type ModelEntry } from "../account/model-list.js";
import { AGENT_NAMES, type AgentId } from "../state/records.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { DEFAULTS_ROWS, MODEL_DEFAULTS_SCHEMA, readModelDefaults, SHIPPED_FALLBACK, type DefaultsRow, type FamilyChoice, type ModelChoice, type ModelDefaults } from "./model-defaults.js";
import { codexFamilyOf, familyName, newestOfFamily, type ModelList } from "./resolver.js";

/** A refusal: 400 malformed, 409 the file can't be read, 422 a choice or value Kiln won't save. */
export interface Refusal { ok: false; status: 400 | 409 | 422; reason: string; path?: string; canRestore?: boolean }

/** The names of the four rows as the page and the refusals say them. */
export const ROW_NAMES: Record<DefaultsRow, string> = { demanding: "Demanding", standard: "Standard", mechanical: "Mechanical", audits: "Audits" };

/**
 * The one omitted-effort rule (technical design, "Command line"): a model that takes no effort
 * saves none, and an effort given for it is refused; for one that takes effort, a given effort must
 * be one it offers, and an omitted one is the default its agent reports when the model's list of
 * efforts includes it. Claude Code reports no default, so its choices name their effort.
 *
 *   effortToSave(gptSol, undefined)   // { effort: "medium" } when Codex reports medium as Sol's default
 *   effortToSave(opus, undefined)     // { problem: "Choose an effort for Opus 5.5; no supported default was reported." }
 */
export function effortToSave(entry: ModelEntry, effort: string | undefined): { effort?: string } | { problem: string } {
  if (!entry.supportsEffort) return effort === undefined ? {} : { problem: `${entry.displayName} takes no effort; leave the effort out.` };
  if (effort !== undefined) return entry.supportedEffortLevels.includes(effort as never) ? { effort } : { problem: `${entry.displayName} doesn't offer ${effort} effort.` };
  if (entry.defaultEffort && entry.supportedEffortLevels.includes(entry.defaultEffort as never)) return { effort: entry.defaultEffort };
  return { problem: `Choose an effort for ${entry.displayName}; no supported default was reported.` };
}

function listRefusal(agentId: AgentId, list: ModelList | undefined): string | undefined {
  if (list?.models) return undefined;
  if (list?.pending) return `Reading ${AGENT_NAMES[agentId]} models… Try again in a moment.`;
  return list?.error ?? `${AGENT_NAMES[agentId]}'s model list can't be read.`;
}

/**
 * A choice for one activity, checked against its agent's model list now, with its effort filled
 * in by the omitted-effort rule (`POST /api/model`, `kiln model`).
 *
 *   checkModelChoice({ agentId: "claude_code", model: "sonnet", effort: "low" }, lists)  // { ok: true, choice: { agentId: "claude_code", model: "sonnet", effort: "low" } }
 */
export function checkModelChoice(choice: ModelChoice, lists: Partial<Record<AgentId, ModelList>>): { ok: true; choice: ModelChoice } | Refusal {
  const list = lists[choice.agentId];
  const unreadable = listRefusal(choice.agentId, list);
  if (unreadable) return { ok: false, status: 422, reason: unreadable };
  const entry = list!.models!.find(one => one.value === choice.model);
  if (!entry) return { ok: false, status: 422, reason: `${AGENT_NAMES[choice.agentId]} doesn't offer ${choice.model} on this account.` };
  const effort = effortToSave(entry, choice.effort);
  if ("problem" in effort) return { ok: false, status: 422, reason: effort.problem };
  const auto = choice.agentId === "claude_code" ? autoModeError(entry) : undefined;
  if (auto) return { ok: false, status: 422, reason: auto };
  return { ok: true, choice: { agentId: choice.agentId, model: entry.value, ...effort } };
}

/** A Model defaults side, checked the same way against the newest model of its family. */
export function checkFamilyChoice(choice: FamilyChoice, lists: Partial<Record<AgentId, ModelList>>): { ok: true; choice: FamilyChoice } | Refusal {
  const list = lists[choice.agentId];
  const unreadable = listRefusal(choice.agentId, list);
  if (unreadable) return { ok: false, status: 422, reason: unreadable };
  const found = newestOfFamily(choice, list!.models!);
  if (!found.entry) return { ok: false, status: 422, reason: found.problem! };
  const effort = effortToSave(found.entry, choice.effort);
  if ("problem" in effort) return { ok: false, status: 422, reason: effort.problem };
  const auto = choice.agentId === "claude_code" ? autoModeError(found.entry) : undefined;
  if (auto) return { ok: false, status: 422, reason: auto };
  return { ok: true, choice: { agentId: choice.agentId, family: choice.family.toLowerCase(), ...effort } };
}

/** One change to Model defaults: a row's sides, restoring Kiln's defaults, or the fallback switch and threshold. */
export type DefaultsChange =
  | { set: { row: DefaultsRow; first?: FamilyChoice; fallback?: FamilyChoice } }
  | { restore: true }
  | { fallback: { enabled?: boolean; threshold?: number } };

type RawFile = { schemaVersion: number; rows?: Partial<Record<DefaultsRow, { first?: FamilyChoice; fallback?: FamilyChoice }>>; fallback?: { enabled?: boolean; threshold?: number } };

/**
 * Applies one change to Model defaults and replaces the file (AC-DEFAULT-02, AC-DEFAULT-05,
 * AC-FALLBACK-01). A file that doesn't parse refuses every save; Restore is the one write allowed
 * over it, and is refused too over a newer schema version. The file keeps only what the person
 * set: Restore clears the four rows and keeps the switch and threshold.
 *
 *   editModelDefaults(path, { fallback: { enabled: true } }, lists)  // { ok: true, defaults: { …, fallback: { enabled: true, threshold: 95 } } }
 */
export function editModelDefaults(path: string, change: DefaultsChange, lists: Partial<Record<AgentId, ModelList>>): { ok: true; defaults: ModelDefaults; fallbackTurnedOff?: true } | Refusal {
  const read = readModelDefaults(path);
  if (!read.ok) {
    if (!("restore" in change) || !read.canRestore) return { ok: false, status: 409, reason: read.reason, path: read.path, canRestore: read.canRestore };
    // Over a file that doesn't parse, Restore writes every row at its default and the fallback off at 95.
    writeJsonAtomically(path, { schemaVersion: MODEL_DEFAULTS_SCHEMA, fallback: { ...SHIPPED_FALLBACK } });
    return { ...settled(path), fallbackTurnedOff: true };
  }
  const raw = rawFile(path);
  if ("restore" in change) {
    writeJsonAtomically(path, { schemaVersion: MODEL_DEFAULTS_SCHEMA, ...(raw.fallback ? { fallback: raw.fallback } : {}) });
    return settled(path);
  }
  if ("fallback" in change) {
    const { enabled, threshold } = change.fallback;
    if (threshold !== undefined && !(Number.isInteger(threshold) && threshold >= 1 && threshold <= 100)) return { ok: false, status: 422, reason: "The threshold is a whole-number percent from 1 to 100." };
    raw.fallback = { ...raw.fallback, ...(enabled === undefined ? {} : { enabled }), ...(threshold === undefined ? {} : { threshold }) };
    writeJsonAtomically(path, raw);
    return settled(path);
  }
  const { row, first, fallback } = change.set;
  const sides: { first?: FamilyChoice; fallback?: FamilyChoice } = {};
  for (const [side, given] of [["first", first], ["fallback", fallback]] as const) {
    if (!given) continue;
    const checked = checkFamilyChoice(given, lists);
    if (!checked.ok) return checked;
    sides[side] = checked.choice;
  }
  const current = read.defaults.rows[row];
  const firstAgent = (sides.first ?? current.first).agentId; const fallbackAgent = (sides.fallback ?? current.fallback).agentId;
  if (firstAgent === fallbackAgent) return { ok: false, status: 422, reason: `The ${ROW_NAMES[row]} row's first choice and fallback would both be on ${AGENT_NAMES[firstAgent]}. To move the row to ${AGENT_NAMES[firstAgent]}, change both sides in one save.` };
  raw.rows = { ...raw.rows, [row]: { ...raw.rows?.[row], ...sides } };
  writeJsonAtomically(path, raw);
  return settled(path);
}

function rawFile(path: string): RawFile {
  try { return JSON.parse(readFileSync(path, "utf8")) as RawFile; }
  catch { return { schemaVersion: MODEL_DEFAULTS_SCHEMA }; }
}

function settled(path: string): { ok: true; defaults: ModelDefaults } {
  const read = readModelDefaults(path);
  if (!read.ok) throw new Error(read.reason);
  return { ok: true, defaults: read.defaults };
}

/** A side as the page shows it: its agent, family, effort, the model it resolves to now, and whether the person set it. */
export interface DefaultsSideView { agentId: AgentId; agent: string; family: string; familyName: string; effort?: string; modelName?: string; problem?: string; set: boolean }

/** A family an agent offers, for the page's editor: its newest model and the efforts it takes. */
export interface FamilyOption { family: string; familyName: string; modelName: string; efforts: string[]; defaultEffort?: string }

/** `GET /api/model-defaults` and `kiln model-defaults`: the rows, the switch, each installed agent's families and readiness. */
export interface ModelDefaultsView {
  rows: Record<DefaultsRow, { first: DefaultsSideView; fallback: DefaultsSideView }>;
  fallback: { enabled: boolean; threshold: number };
  /** `readinessKnown` is false while Kiln hasn't read that agent's readiness; then no readiness is claimed. */
  agents: { agentId: AgentId; agent: string; installed: boolean; readinessKnown: boolean; families: FamilyOption[]; modelListError?: string; readinessErrors?: string[] }[];
}

/** The families each agent's list offers: Claude Code's aliases, Codex's `gpt-<version>-<family>` names, each at its newest version. */
export function familyOptions(agentId: AgentId, models: ModelEntry[]): FamilyOption[] {
  const families = agentId === "claude_code" ? models.map(entry => entry.value) : [...new Set(models.flatMap(entry => { const parsed = codexFamilyOf(entry.value); return parsed ? [parsed.family] : []; }))];
  return families.flatMap(family => {
    const found = newestOfFamily({ agentId, family }, models);
    if (!found.entry) return [];
    const entry = found.entry;
    return [{ family, familyName: familyName({ agentId, family }), modelName: entry.displayName, efforts: entry.supportsEffort ? [...entry.supportedEffortLevels] : [], ...(entry.defaultEffort ? { defaultEffort: entry.defaultEffort } : {}) }];
  });
}

/**
 * Model defaults as the page and `kiln model-defaults` show them, read from the file now.
 *
 *   modelDefaultsView(path, lists, agents)  // { ok: true, view: { rows: { standard: { first: { agent: "Claude Code", familyName: "Opus", modelName: "Opus 5.5", effort: "medium", set: false }, … } }, … } }
 */
export function modelDefaultsView(path: string, lists: Partial<Record<AgentId, ModelList>>, agents: { agentId: AgentId; installed: boolean; readinessKnown?: boolean; readinessErrors?: string[] }[]): { ok: true; view: ModelDefaultsView } | Refusal {
  const read = readModelDefaults(path);
  if (!read.ok) return { ok: false, status: 409, reason: read.reason, path: read.path, canRestore: read.canRestore };
  const side = (choice: FamilyChoice, set: boolean): DefaultsSideView => {
    const list = lists[choice.agentId];
    const found = list?.models ? newestOfFamily(choice, list.models) : undefined;
    return { agentId: choice.agentId, agent: AGENT_NAMES[choice.agentId], family: choice.family, familyName: familyName(choice), ...(choice.effort ? { effort: choice.effort } : {}), ...(found?.entry ? { modelName: found.entry.displayName } : {}), ...(found?.problem ? { problem: found.problem } : !list?.models ? { problem: listRefusal(choice.agentId, list)! } : {}), set };
  };
  const rows = Object.fromEntries(DEFAULTS_ROWS.map(row => { const one = read.defaults.rows[row]; return [row, { first: side(one.first, one.firstSet), fallback: side(one.fallback, one.fallbackSet) }]; })) as ModelDefaultsView["rows"];
  return { ok: true, view: { rows, fallback: read.defaults.fallback, agents: agents.map(agent => ({ agentId: agent.agentId, agent: AGENT_NAMES[agent.agentId], installed: agent.installed, readinessKnown: agent.readinessKnown ?? true, families: lists[agent.agentId]?.models ? familyOptions(agent.agentId, lists[agent.agentId]!.models!) : [], ...(lists[agent.agentId]?.error ? { modelListError: lists[agent.agentId]!.error! } : {}), ...(agent.readinessErrors?.length ? { readinessErrors: agent.readinessErrors } : {}) })) } };
}
