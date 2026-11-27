// A save is a set of changes (Kiln Model Modes, "Saving"): the fields a person changed, never the
// whole page. This module is what the Model defaults page and the commands share to work out those
// fields, so it reads no file and runs in the browser as it does in Node. The page holds a draft:
// the person's edits over a base, which is what was last read, or Kiln's choices once Restore is
// pending. Only what differs from the base is sent (AC-SAVE-01, AC-SAVE-03).

import type { DefaultsRow, FallbackUse, FamilyChoice, ModelMode } from "./model-defaults.js";

/** The changes a save carries; `restore` clears the file before the rest is applied (SAVE-008). */
export interface SettingsChange {
  restore?: true;
  mode?: ModelMode;
  oneModel?: FamilyChoice;
  rows?: Partial<Record<DefaultsRow, { first?: FamilyChoice; fallback?: FamilyChoice }>>;
  fallback?: { use?: FallbackUse; threshold?: number };
}
/** A person's edits to the page: every change but Restore, which the draft holds beside them. */
export type SettingsEdits = Omit<SettingsChange, "restore">;

/** Every setting on the page, filled in: what a settings file reads as, Kiln's choices where it holds none. */
export interface SettingsValues {
  mode: ModelMode;
  oneModel: FamilyChoice;
  rows: Record<DefaultsRow, { first: FamilyChoice; fallback: FamilyChoice }>;
  fallback: { use: FallbackUse; threshold: number };
}

/** Where a save goes: Model defaults, for every PRD on this computer, or one PRD's own settings (AC-SAVE-01). */
export type SaveTarget = "every_prd" | "this_prd";

const SIDES = ["first", "fallback"] as const;

/**
 * Whether two choices are the same agent, family and effort.
 *
 *   sameChoice({ agentId: "codex", family: "sol", effort: "high" }, { agentId: "codex", family: "sol" })  // false
 */
export function sameChoice(one: FamilyChoice, other: FamilyChoice): boolean {
  return one.agentId === other.agentId && one.family === other.family && one.effort === other.effort;
}

const copy = (choice: FamilyChoice): FamilyChoice => ({ agentId: choice.agentId, family: choice.family, ...(choice.effort === undefined ? {} : { effort: choice.effort }) });

/**
 * What the page shows: the base with the person's edits over it.
 *
 *   withEdits(base, { fallback: { use: "everything" } }).fallback  // { use: "everything", threshold: 95 }
 */
export function withEdits(base: SettingsValues, edits: SettingsEdits): SettingsValues {
  const rows = Object.fromEntries((Object.keys(base.rows) as DefaultsRow[]).map(row => [row, { first: copy(edits.rows?.[row]?.first ?? base.rows[row].first), fallback: copy(edits.rows?.[row]?.fallback ?? base.rows[row].fallback) }])) as SettingsValues["rows"];
  return { mode: edits.mode ?? base.mode, oneModel: copy(edits.oneModel ?? base.oneModel), rows, fallback: { use: edits.fallback?.use ?? base.fallback.use, threshold: edits.fallback?.threshold ?? base.fallback.threshold } };
}

/**
 * The edits that still differ from the base. An edit that equals what was read is no longer a
 * change, as when the same value was saved from elsewhere while the page was open.
 *
 *   differing(base, { mode: base.mode, fallback: { use: "everything" } })  // { fallback: { use: "everything" } }
 */
export function differing(base: SettingsValues, edits: SettingsEdits): SettingsEdits {
  const rows: NonNullable<SettingsEdits["rows"]> = {};
  for (const row of Object.keys(edits.rows ?? {}) as DefaultsRow[]) {
    const sides = Object.fromEntries(SIDES.flatMap(side => { const edit = edits.rows![row]![side]; return edit && !sameChoice(edit, base.rows[row][side]) ? [[side, copy(edit)]] : []; })) as { first?: FamilyChoice; fallback?: FamilyChoice };
    if (Object.keys(sides).length) rows[row] = sides;
  }
  const use = edits.fallback?.use; const threshold = edits.fallback?.threshold;
  const fallback = { ...(use !== undefined && use !== base.fallback.use ? { use } : {}), ...(threshold !== undefined && threshold !== base.fallback.threshold ? { threshold } : {}) };
  return {
    ...(edits.mode !== undefined && edits.mode !== base.mode ? { mode: edits.mode } : {}),
    ...(edits.oneModel && !sameChoice(edits.oneModel, base.oneModel) ? { oneModel: copy(edits.oneModel) } : {}),
    ...(Object.keys(rows).length ? { rows } : {}),
    ...(Object.keys(fallback).length ? { fallback } : {}),
  };
}

/**
 * A change with what the page shows under a choice it changes (AC-SAVE-03): a mode changed to one
 * model goes with the one model shown, and a fallback setting changed to the threshold goes with
 * the threshold shown. So the one model Kiln decides is saved with the mode, never by itself.
 *
 *   carried({ mode: "one_model" }, shown)  // { mode: "one_model", oneModel: { agentId: "claude_code", family: "opus", effort: "high" } }
 */
export function carried<Change extends SettingsEdits>(change: Change, shown: Pick<SettingsValues, "oneModel" | "fallback">): Change {
  return {
    ...change,
    ...(change.mode === "one_model" && !change.oneModel ? { oneModel: copy(shown.oneModel) } : {}),
    ...(change.fallback?.use === "threshold" && change.fallback.threshold === undefined ? { fallback: { ...change.fallback, threshold: shown.fallback.threshold } } : {}),
  };
}

/** The page's draft: the person's edits, and whether Restore Kiln's defaults is pending. */
export interface SettingsDraft { restore: boolean; edits: SettingsEdits }

/** What a draft is read against: the settings as loaded, Kiln's choices, and whether a file holds any field. */
export interface DraftBase { loaded: SettingsValues; kilnChoices: SettingsValues; holdsSettings: boolean }

/**
 * What the page shows for a draft and what Save would send (Kiln Model Modes, "The page holds a
 * draft"). With Restore pending the base is Kiln's choices, so the page shows them and a later
 * edit is one that differs from them. Restore is itself a change only while a file holds a field.
 *
 *   draftState({ restore: false, edits: { fallback: { use: "threshold" } } }, base)
 *   // { shown: { …, fallback: { use: "threshold", threshold: 95 } }, changes: { fallback: { use: "threshold", threshold: 95 } }, dirty: true }
 */
export function draftState(draft: SettingsDraft, base: DraftBase): { shown: SettingsValues; changes: SettingsChange; dirty: boolean } {
  const from = draft.restore ? base.kilnChoices : base.loaded;
  const shown = withEdits(from, draft.edits);
  const edits = carried(differing(from, draft.edits), shown);
  const restore = draft.restore && base.holdsSettings;
  const dirty = restore || Object.keys(edits).length > 0;
  return { shown, changes: { ...(draft.restore && dirty ? { restore: true as const } : {}), ...edits }, dirty };
}
