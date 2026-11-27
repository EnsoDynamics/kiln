// Changing a model choice (Kiln Phase Model Tiers AC-PICK-03, AC-OTHER-01, AC-DEFAULT-02,
// AC-DEFAULT-05, AC-FALLBACK-01; technical design "Model defaults file", "HTTP" and "Command
// line"): one module behind the page, `POST /api/model-defaults`, `kiln model-defaults`, the row
// Change and `kiln model`, so every surface applies the same omitted-effort rule and refusals.
// A save is a set of changes for every PRD or for one (Kiln Model Modes, "Saving"; AC-SAVE-01 to
// AC-SAVE-05): every write re-reads the file, applies the changes and replaces it atomically.

import { rmSync } from "node:fs";
import { autoModeError, type ModelEntry } from "../account/model-list.js";
import { AGENT_NAMES, type AgentId } from "../state/records.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { DEFAULTS_ROWS, MODEL_DEFAULTS_SCHEMA, readModelDefaults, oneModelOf, ROW_NAMES, settingsInForce, shippedDefaults, type DefaultsRow, type FallbackUse, type FamilyChoice, type ModelChoice, type ModelDefaults, type ModelDefaultsRead, type ModelMode, type SettingsPaths } from "./model-defaults.js";
import { codexFamilyOf, familyName, newestOfFamily, type ModelList } from "./resolver.js";
import type { SaveTarget, SettingsChange } from "./settings-change.js";

/**
 * A refusal: 400 malformed, 409 the settings in force can't be read (`source` says which file,
 * and `canRestore` whether its one write is allowed: Restore over Model defaults, Use my defaults
 * here over a PRD's own settings), 422 a choice or value Kiln won't save, 500 a save to two files
 * whose second write failed.
 */
export interface Refusal { ok: false; status: 400 | 409 | 422 | 500; reason: string; path?: string; canRestore?: boolean; source?: "defaults" | "prd" }

export { ROW_NAMES };

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

/** A settings file as written: schema 2, holding only what the person set. */
type RawFile = { schemaVersion: number; mode?: ModelMode; oneModel?: FamilyChoice; rows?: Partial<Record<DefaultsRow, { first?: FamilyChoice; fallback?: FamilyChoice }>>; fallback?: { use?: FallbackUse; threshold?: number } };

type Lists = Partial<Record<AgentId, ModelList>>;

/** What each settings file is called in a refusal that has to say which of two refused. */
const FILE_NAMES = { defaults: "Model defaults", prd: "This PRD's own settings" } as const;

/**
 * One settings file with a change in place (Kiln Model Modes, "Saving"): Restore first, which
 * clears every field the file holds, then the rest. Each side and the one model pass the checks a
 * choice passes anywhere, and a row's two sides can't end on one agent. Nothing is written here,
 * so a save to two files checks both before it writes either.
 *
 *   withChange(shippedDefaults(), { fallback: { use: "everything" } }, lists)  // { ok: true, raw: { schemaVersion: 2, fallback: { use: "everything" } } }
 */
function withChange(held: ModelDefaults, change: SettingsChange, lists: Lists): { ok: true; raw: RawFile } | Refusal {
  const settings = change.restore ? shippedDefaults() : held;
  const raw = heldFields(settings);
  if (change.mode !== undefined) raw.mode = change.mode;
  if (change.oneModel) {
    const checked = checkFamilyChoice(change.oneModel, lists);
    if (!checked.ok) return checked;
    raw.oneModel = checked.choice;
  }
  for (const row of DEFAULTS_ROWS) {
    const given = change.rows?.[row];
    if (!given) continue;
    const sides: { first?: FamilyChoice; fallback?: FamilyChoice } = {};
    for (const side of ["first", "fallback"] as const) {
      if (!given[side]) continue;
      const checked = checkFamilyChoice(given[side], lists);
      if (!checked.ok) return checked;
      sides[side] = checked.choice;
    }
    const current = settings.rows[row];
    const agent = (sides.first ?? current.first).agentId;
    if (agent === (sides.fallback ?? current.fallback).agentId) return { ok: false, status: 422, reason: `The ${ROW_NAMES[row]} row's first choice and fallback would both be on ${AGENT_NAMES[agent]}. To move the row to ${AGENT_NAMES[agent]}, change both sides in one save.` };
    raw.rows = { ...raw.rows, [row]: { ...raw.rows?.[row], ...sides } };
  }
  if (change.fallback) {
    const { use, threshold } = change.fallback;
    if (threshold !== undefined && !(Number.isInteger(threshold) && threshold >= 1 && threshold <= 100)) return { ok: false, status: 422, reason: "The threshold is a whole-number percent from 1 to 100." };
    raw.fallback = { ...raw.fallback, ...(use === undefined ? {} : { use }), ...(threshold === undefined ? {} : { threshold }) };
  }
  return { ok: true, raw };
}

const RESTORED_NOTICE = "Kiln's defaults are restored, and the fallback is now off.";

/** A settings file that can't be read, as the refusal every surface gives for it. */
function unreadable(source: "defaults" | "prd", read: Extract<ModelDefaultsRead, { ok: false }>): Refusal {
  return { ok: false, status: 409, reason: read.reason, path: read.path, canRestore: read.canRestore, source };
}

/**
 * Saves a set of changes for every PRD on this computer or for one PRD only (AC-SAVE-01,
 * AC-SAVE-03, AC-SAVE-04; Kiln Model Modes, "Saving"). Where they go follows the PRD the save
 * comes from, which is the one `paths.settingsPath` belongs to; a save with no such path is a
 * command for Model defaults alone.
 *
 *   The PRD follows the defaults, every PRD    → Model defaults
 *   The PRD follows the defaults, this PRD     → new own settings: what Model defaults holds, with the changes
 *   The PRD has its own settings, this PRD     → its own settings
 *   The PRD has its own settings, every PRD    → Model defaults and its own settings (SAVE-004)
 *
 * The last row is checked against both files before either is written, and is safe to repeat. With
 * Restore in it, the PRD's own settings are removed, since they would hold exactly what Model
 * defaults then holds (SAVE-008). A file that can't be read refuses every save over it; Restore for
 * every PRD is the one write allowed over Model defaults that don't parse.
 *
 *   saveSettings({ defaultsPath }, "every_prd", { fallback: { use: "everything" } }, lists)  // { ok: true }
 */
export function saveSettings(paths: SettingsPaths, target: SaveTarget, change: SettingsChange, lists: Lists): { ok: true; notice?: string } | Refusal {
  const inForce = settingsInForce(paths);
  const own = inForce.source === "prd";
  if (target === "this_prd" && paths.settingsPath === undefined) throw new Error("A save for one PRD needs that PRD's state directory.");
  // The settings in force can't be read: only Restore for every PRD, over Model defaults that don't parse, is allowed.
  if (!inForce.read.ok && (own || !(target === "every_prd" && change.restore && inForce.read.canRestore))) return unreadable(inForce.source, inForce.read);
  if (own && target === "this_prd") return write(paths.settingsPath!, inForce.read, change, lists);

  const defaults = own ? readModelDefaults(paths.defaultsPath) : inForce.read;
  const restoringUnread = !defaults.ok;
  if (!defaults.ok && !(change.restore && defaults.canRestore)) return { ok: false, status: 422, reason: defaults.reason };
  if (!own && target === "this_prd") return write(paths.settingsPath!, defaults, change, lists);

  const forDefaults = withChange(defaults.ok ? defaults.defaults : shippedDefaults(), change, lists);
  if (!forDefaults.ok) return own ? named("defaults", forDefaults) : forDefaults;
  const notice = restoringUnread ? { notice: RESTORED_NOTICE } : {};
  if (!own) { writeJsonAtomically(paths.defaultsPath, forDefaults.raw); return { ok: true, ...notice }; }

  // Both files: the same changes can pass in one and fail in the other, so both are checked before either is written.
  const forOwn = change.restore ? undefined : withChange((inForce.read as Extract<ModelDefaultsRead, { ok: true }>).defaults, change, lists);
  if (forOwn && !forOwn.ok) return named("prd", forOwn);
  writeJsonAtomically(paths.defaultsPath, forDefaults.raw);
  try {
    if (forOwn) writeJsonAtomically(paths.settingsPath!, forOwn.raw); else rmSync(paths.settingsPath!, { force: true });
  } catch (error) {
    return { ok: false, status: 500, reason: `Model defaults were saved, but this PRD's own settings at ${paths.settingsPath!} were not: ${(error as Error).message} Save again to finish.` };
  }
  return { ok: true, ...notice };
}

/** One file written with the change in place, from how it reads now. */
function write(path: string, read: ModelDefaultsRead, change: SettingsChange, lists: Lists): { ok: true } | Refusal {
  if (!read.ok) throw new Error(read.reason);
  const next = withChange(read.defaults, change, lists);
  if (!next.ok) return next;
  writeJsonAtomically(path, next.raw);
  return { ok: true };
}

/** A refusal from one of two files, saying which. */
function named(file: keyof typeof FILE_NAMES, refusal: Refusal): Refusal {
  return { ...refusal, reason: `${FILE_NAMES[file]}: ${refusal.reason} Nothing was saved.` };
}

/**
 * Use my defaults here (AC-SAVE-05): removes the PRD's own settings, so it follows Model defaults
 * again, whether or not Model defaults can be read. It is the one write allowed over own settings
 * that don't parse, and is refused over a file a newer Kiln wrote. A PRD with none is left as it is.
 *
 *   useDefaults({ defaultsPath, settingsPath })  // { ok: true }
 */
export function useDefaults(paths: SettingsPaths): { ok: true } | Refusal {
  if (paths.settingsPath === undefined) throw new Error("Use my defaults here needs the PRD's state directory.");
  const inForce = settingsInForce(paths);
  if (inForce.source !== "prd") return { ok: true };
  if (!inForce.read.ok && !inForce.read.canRestore) return unreadable("prd", inForce.read);
  rmSync(paths.settingsPath, { force: true });
  return { ok: true };
}

/**
 * The fields a settings file holds, as schema 2 writes them, from how it read: only what the
 * person set, with a schema 1 file's switch and carried Preflight and pull request row included.
 *
 *   heldFields(shippedDefaults())  // { schemaVersion: 2 }
 */
export function heldFields(settings: ModelDefaults): RawFile {
  const rows: NonNullable<RawFile["rows"]> = {};
  for (const row of DEFAULTS_ROWS) {
    const one = settings.rows[row];
    if (one.firstSet || one.fallbackSet) rows[row] = { ...(one.firstSet ? { first: one.first } : {}), ...(one.fallbackSet ? { fallback: one.fallback } : {}) };
  }
  const { use, threshold, useSet, thresholdSet } = settings.fallback;
  return {
    schemaVersion: MODEL_DEFAULTS_SCHEMA,
    ...(settings.modeSet ? { mode: settings.mode } : {}),
    ...(settings.oneModel ? { oneModel: settings.oneModel } : {}),
    ...(Object.keys(rows).length ? { rows } : {}),
    ...(useSet || thresholdSet ? { fallback: { ...(useSet ? { use } : {}), ...(thresholdSet ? { threshold } : {}) } } : {}),
  };
}

/** A side as the page shows it: its agent, family, effort, the model it resolves to now, and whether the person set it. */
export interface DefaultsSideView { agentId: AgentId; agent: string; family: string; familyName: string; effort?: string; modelName?: string; problem?: string; set: boolean }

/** A family an agent offers, for the page's editor: its newest model and the efforts it takes. */
export interface FamilyOption { family: string; familyName: string; modelName: string; efforts: string[]; defaultEffort?: string }

/** The settings a page or command shows, each choice with the model it resolves to now. */
export interface SettingsValuesView {
  mode: ModelMode;
  /** The one model: the one the person picked, else Kiln's for this computer. */
  oneModel: DefaultsSideView;
  rows: Record<DefaultsRow, { first: DefaultsSideView; fallback: DefaultsSideView }>;
  /** `enabled` is true unless the setting is Never, so a reader of the switch keeps its meaning. */
  fallback: { use: FallbackUse; threshold: number; enabled: boolean };
}

/**
 * `GET /api/model-defaults` and `kiln model-defaults` (Kiln Model Modes, "HTTP"): the settings in
 * force for a PRD, its own when `source` is `prd`, or Model defaults alone for a command given no
 * PRD. Each choice's `set` says whether the file in force holds it.
 */
export interface ModelDefaultsView extends SettingsValuesView {
  source: "defaults" | "prd";
  /** The PRD the settings are in force for; absent for Model defaults read with no PRD. */
  prd?: string;
  /** `readinessKnown` is false while Kiln hasn't read that agent's readiness; then no readiness is claimed. */
  agents: { agentId: AgentId; agent: string; installed: boolean; readinessKnown: boolean; families: FamilyOption[]; modelListError?: string; readinessErrors?: string[] }[];
  /** The settings as an empty file reads now, which Restore Kiln's defaults puts on the page. */
  kilnChoices: SettingsValuesView;
  /** Whether Model defaults or this PRD's own settings hold any field, so Restore would change something; true while Model defaults can't be read. */
  holdsSettings: boolean;
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

/** Whether a settings file holds any field. */
function holdsAny(settings: ModelDefaults): boolean {
  return Object.keys(heldFields(settings)).length > 1;
}

/**
 * The settings in force as the page and `kiln model-defaults` show them, read from the files now.
 * `prd` names the PRD they are in force for; without `paths.settingsPath` they are Model defaults.
 *
 *   settingsView({ defaultsPath, settingsPath }, { prd: "Customer returns", lists, agents })
 *   // { ok: true, view: { source: "prd", prd: "Customer returns", mode: "recommended", rows: { standard: { first: { agent: "Claude Code", familyName: "Opus", modelName: "Opus 5.5", effort: "medium", set: false }, … } }, … } }
 */
export function settingsView(paths: SettingsPaths, context: { prd?: string; lists: Lists; agents: { agentId: AgentId; installed: boolean; readinessKnown?: boolean; readinessErrors?: string[] }[]; claudeCodeInstalled?: boolean }): { ok: true; view: ModelDefaultsView } | Refusal {
  const inForce = settingsInForce(paths);
  if (!inForce.read.ok) return unreadable(inForce.source, inForce.read);
  const { lists, agents } = context;
  const claudeCodeInstalled = context.claudeCodeInstalled ?? agents.some(agent => agent.agentId === "claude_code" && agent.installed);
  const side = (choice: FamilyChoice, set: boolean): DefaultsSideView => {
    const list = lists[choice.agentId];
    const found = list?.models ? newestOfFamily(choice, list.models) : undefined;
    return { agentId: choice.agentId, agent: AGENT_NAMES[choice.agentId], family: choice.family, familyName: familyName(choice), ...(choice.effort ? { effort: choice.effort } : {}), ...(found?.entry ? { modelName: found.entry.displayName } : {}), ...(found?.problem ? { problem: found.problem } : !list?.models ? { problem: listRefusal(choice.agentId, list)! } : {}), set };
  };
  const values = (settings: ModelDefaults): SettingsValuesView => {
    const rows = Object.fromEntries(DEFAULTS_ROWS.map(row => { const one = settings.rows[row]; return [row, { first: side(one.first, one.firstSet), fallback: side(one.fallback, one.fallbackSet) }]; })) as SettingsValuesView["rows"];
    const { use, threshold } = settings.fallback;
    return { mode: settings.mode, oneModel: side(oneModelOf(settings, claudeCodeInstalled), settings.oneModel !== undefined), rows, fallback: { use, threshold, enabled: use !== "never" } };
  };
  const defaults = inForce.source === "prd" ? readModelDefaults(paths.defaultsPath) : inForce.read;
  return { ok: true, view: {
    source: inForce.source, ...(context.prd === undefined ? {} : { prd: context.prd }), ...values(inForce.read.defaults),
    agents: agents.map(agent => ({ agentId: agent.agentId, agent: AGENT_NAMES[agent.agentId], installed: agent.installed, readinessKnown: agent.readinessKnown ?? true, families: lists[agent.agentId]?.models ? familyOptions(agent.agentId, lists[agent.agentId]!.models!) : [], ...(lists[agent.agentId]?.error ? { modelListError: lists[agent.agentId]!.error! } : {}), ...(agent.readinessErrors?.length ? { readinessErrors: agent.readinessErrors } : {}) })),
    kilnChoices: values(shippedDefaults()),
    holdsSettings: holdsAny(inForce.read.defaults) || !defaults.ok || holdsAny(defaults.defaults),
  } };
}
