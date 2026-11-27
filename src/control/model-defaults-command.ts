// `kiln model-defaults` (Kiln Phase Model Tiers AC-DEFAULT-05; Kiln Model Modes AC-CLI-01,
// "Command line"): prints Model defaults and changes them for every PRD on this computer, or with
// `--prd` prints the settings in force for one PRD and saves for that PRD only, through the same
// module as the page and with the same refusals. It changes a settings file, not a run, so it
// needs no controller and neither safety flag. Each installed agent's model list and readiness are
// read on demand, as the page reads them.

import { basename } from "node:path";
import { AgentInfo } from "../agents/metadata.js";
import { ROW_NAMES, saveSettings, settingsView, useDefaults, type DefaultsSideView, type ModelDefaultsView, type Refusal } from "../models/model-defaults-edit.js";
import { DEFAULTS_ROWS, modelDefaultsPath, prdSettingsPath, type DefaultsRow, type FamilyChoice, type SettingsPaths } from "../models/model-defaults.js";
import type { ModelList } from "../models/resolver.js";
import { carried, type SettingsChange } from "../models/settings-change.js";
import { executableAvailable, findExecutable } from "../platform/helper-process.js";
import { featureNameFor } from "../prd-location.js";
import { AGENT_IDS, type AgentId } from "../state/records.js";
import { stateRoot } from "../state/state-files.js";
import type { ParsedCommand } from "./help.js";
import { targetWork, type SavedWork } from "./private-state.js";
import { ControlFailure, errorFact, result, type Result } from "./result.js";

/** Each installed agent's model list and readiness, read now. */
async function readAgents(env: NodeJS.ProcessEnv, cwd: string): Promise<{ lists: Partial<Record<AgentId, ModelList>>; agents: { agentId: AgentId; installed: boolean; readinessErrors?: string[] }[] }> {
  const claude = findExecutable("claude", env); const codex = findExecutable("codex", env);
  const installed = AGENT_IDS.filter(id => id === "claude_code" ? !!claude && executableAvailable(claude, env) : !!codex && executableAvailable(codex, env));
  const executable = { claude: claude ?? "claude", ...(codex ? { codex } : {}) };
  const readers = installed.map(agentId => new AgentInfo({ agentId, executable, cwd, claudeCwd: stateRoot(env), env }));
  try {
    await Promise.all(readers.map(reader => reader.refresh()));
    const lists: Partial<Record<AgentId, ModelList>> = {};
    for (const reader of readers) lists[reader.state.agentId] = { models: reader.state.models, error: reader.state.modelListError };
    return { lists, agents: readers.map(reader => ({ agentId: reader.state.agentId, installed: true, ...(reader.state.blockers.length ? { readinessErrors: reader.state.blockers } : {}) })) };
  } finally { for (const reader of readers) reader.close(); }
}

/** A side's words: "Claude Code · Opus · medium (Opus 5.5)". */
function sideLine(side: DefaultsSideView): string {
  return `${[side.agent, side.familyName, side.effort].filter(Boolean).join(" · ")}${side.modelName ? ` (${side.modelName})` : ""}${side.set ? "" : ", Kiln's default"}${side.problem ? `. ${side.problem}` : ""}`;
}

/** The fallback setting in the page's words (AC-WHEN-01). */
function fallbackWords(fallback: ModelDefaultsView["fallback"]): string {
  if (fallback.use === "threshold") return `when the first choice's usage reaches ${fallback.threshold}% of a limit`;
  return `${fallback.use === "everything" ? "for everything, until you change this" : "never"} (threshold ${fallback.threshold}%)`;
}

/**
 * The text `kiln model-defaults` prints before its result: what the page shows, for the defaults
 * or for one PRD (AC-CLI-01). Both ways of picking models keep their settings, so both print, and
 * the first lines say which is in force.
 *
 *   Model defaults, for every PRD on this computer
 *   How Kiln picks a model: Recommended model for each phase
 *   Demanding: Claude Code · Fable · high (Fable 5.2), Kiln's default; fallback Codex · GPT Astra · high (GPT-6-Astra), Kiln's default
 *   …
 *   Use the fallback: never (threshold 95%)
 *   One model for everything, not selected: Claude Code · Opus · high (Opus 5.5), Kiln's default
 */
export function modelDefaultsText(view: ModelDefaultsView): string {
  const oneModel = view.mode === "one_model";
  const heading = view.prd === undefined ? "Model defaults, for every PRD on this computer"
    : view.source === "prd" ? `Models for ${view.prd}: this PRD has its own settings. Every other PRD keeps your defaults.`
      : `Models for ${view.prd}: it follows Model defaults, for every PRD on this computer.`;
  return [heading,
    `How Kiln picks a model: ${oneModel ? "One model for everything" : "Recommended model for each phase"}`,
    ...(oneModel ? [`One model: ${sideLine(view.oneModel)}`, "Kept for Recommended model for each phase, and not used while one model runs everything:"] : []),
    ...DEFAULTS_ROWS.map(row => `${ROW_NAMES[row]}: ${sideLine(view.rows[row].first)}; fallback ${sideLine(view.rows[row].fallback)}`),
    `Use the fallback: ${fallbackWords(view.fallback)}`,
    ...(oneModel ? [] : [`One model for everything, not selected: ${sideLine(view.oneModel)}`])].join("\n");
}

/** A side from `--first-agent`, `--first-model`, `--first-effort` (or the fallback's, or the one model's unprefixed flags): agent and model go together. */
function sideFlags(flags: ParsedCommand["flags"], side: "first" | "fallback" | undefined): FamilyChoice | undefined {
  const name = (flag: string) => side ? `${side}-${flag}` : flag;
  const agent = flags[name("agent")]; const model = flags[name("model")]; const effort = flags[name("effort")];
  if (agent === undefined && model === undefined && effort === undefined) return undefined;
  if (typeof agent !== "string" || typeof model !== "string") throw new ControlFailure("invalid_input", `--${name("agent")} and --${name("model")} go together.`, 2);
  if (agent !== "claude_code" && agent !== "codex") throw new ControlFailure("invalid_input", `--${name("agent")} takes claude_code or codex.`, 2);
  return { agentId: agent, family: model, ...(typeof effort === "string" ? { effort } : {}) };
}

/** `--row`'s value as a row: the flag spells the fifth row `preflight-pr`. */
function rowOfFlag(value: string): DefaultsRow { return (value === "preflight-pr" ? "preflight_pr" : value) as DefaultsRow; }

const USE_FLAGS = { never: "never", "at-threshold": "threshold", "for-everything": "everything", on: "threshold", off: "never" } as const;

/**
 * The changes a `set`, `mode`, `fallback` or `restore` subcommand asks for, before what the page
 * would send with them is added (`carried`). `--on` is `--at-threshold` and `--off` is `--never`,
 * so the commands that existed before the third setting keep their meaning (AC-CLI-01).
 *
 *   kiln model-defaults fallback --for-everything   // { fallback: { use: "everything" } }
 *   kiln model-defaults mode --one-model            // { mode: "one_model" }
 */
function changeOf(parsed: ParsedCommand): SettingsChange {
  const [, sub] = parsed.contract.path; const flags = parsed.flags;
  if (sub === "restore") return { restore: true };
  if (sub === "mode") {
    const oneModel = sideFlags(flags, undefined);
    if (flags.recommended && oneModel) throw new ControlFailure("invalid_input", "--agent, --model and --effort go with --one-model.", 2);
    return flags.recommended ? { mode: "recommended" } : { mode: "one_model", ...(oneModel ? { oneModel } : {}) };
  }
  if (sub === "fallback") {
    const given = (Object.keys(USE_FLAGS) as (keyof typeof USE_FLAGS)[]).filter(flag => flags[flag]);
    if (given.length > 1) throw new ControlFailure("invalid_input", "Give one of --never, --at-threshold, --for-everything, --on and --off.", 2);
    const threshold = flags.threshold;
    if (threshold !== undefined && !/^\d+$/.test(String(threshold))) throw new ControlFailure("invalid_input", "--threshold takes a whole-number percent from 1 to 100.", 2);
    if (!given.length && threshold === undefined) throw new ControlFailure("invalid_input", "Give --never, --at-threshold, --for-everything or --threshold.", 2);
    return { fallback: { ...(given.length ? { use: USE_FLAGS[given[0]!] } : {}), ...(threshold === undefined ? {} : { threshold: Number(threshold) }) } };
  }
  const row = flags.row;
  if (typeof row !== "string" || !DEFAULTS_ROWS.includes(rowOfFlag(row))) throw new ControlFailure("invalid_input", "--row takes demanding, standard, mechanical, audits or preflight-pr.", 2);
  const first = sideFlags(flags, "first"); const fallback = sideFlags(flags, "fallback");
  if (!first && !fallback) throw new ControlFailure("invalid_input", "Give the first choice, the fallback or both: --first-agent with --first-model, or --fallback-agent with --fallback-model.", 2);
  return { rows: { [rowOfFlag(row)]: { ...(first ? { first } : {}), ...(fallback ? { fallback } : {}) } } };
}

/**
 * Kiln's record of the PRD `--prd` names, which holds its own settings: the limit the page has,
 * since a PRD has a record only once Kiln has opened it (Kiln Model Modes, "Command line").
 */
async function recordedPrd(path: string, cwd: string, env: NodeJS.ProcessEnv): Promise<SavedWork> {
  try { return await targetWork(path, cwd, env); }
  catch (error) {
    if (error instanceof ControlFailure && error.code === "target_not_found") throw new ControlFailure("target_not_found", "Kiln has no record of this PRD, so it has no settings of its own to read or save. Open it once with kiln run <PRD-path>.", 2);
    throw error;
  }
}

/**
 * Runs a `kiln model-defaults` command and returns its result with the text that leads it.
 * Without `--prd` it reads or changes Model defaults and no PRD's own settings; with it, the
 * settings in force for that PRD, saving for that PRD only, which gives it settings of its own
 * when it has none. So a save for every PRD from a PRD with its own settings is two commands.
 *
 *   await modelDefaultsCommand(parseCommand(["model-defaults", "fallback", "--for-everything", "--prd", "docs/prds/returns"]), env, cwd)
 *   // { answer: { ok: true, source: "prd", data: { rows: …, fallback: { use: "everything", enabled: true, threshold: 95 }, … } }, lead: "Models for Returns: this PRD has its own settings. …" }
 */
export async function modelDefaultsCommand(parsed: ParsedCommand, env: NodeJS.ProcessEnv, cwd: string): Promise<{ answer: Result; lead?: string }> {
  const [, sub] = parsed.contract.path;
  const prdFlag = typeof parsed.flags.prd === "string" ? parsed.flags.prd : undefined;
  // The flags are read before anything is looked up, so a malformed command changes nothing and reads nothing.
  const asked = sub && sub !== "use-defaults" ? changeOf(parsed) : undefined;
  const work = prdFlag === undefined ? undefined : await recordedPrd(prdFlag, cwd, env);
  const paths: SettingsPaths = { defaultsPath: modelDefaultsPath(env), ...(work ? { settingsPath: prdSettingsPath(work.directory) } : {}) };
  const { lists, agents } = await readAgents(env, cwd);
  const context = { ...(work ? { prd: featureNameFor(basename(work.record.prdDirectory)) } : {}), lists, agents };
  const facts = (path: string) => ({ path, ...(work ? { prd_path: work.canonical } : {}) });
  /** A refusal as the command reports it: a file that can't be read names its one allowed write as the next step. */
  const refused = (refusal: Refusal): { answer: Result } => {
    // A save with --prd goes to the PRD's own settings, so that is the file a refused save was for.
    if (refusal.status !== 409) return { answer: result(facts(paths.settingsPath ?? paths.defaultsPath), [errorFact(refusal.status === 500 ? "state_unavailable" : "invalid_input", refusal.reason)]) };
    const next = !refusal.canRestore ? null : refusal.source === "prd" ? ["kiln", "model-defaults", "use-defaults", "--prd", work!.canonical] : ["kiln", "model-defaults", "restore"];
    return { answer: result({ ...facts(refusal.path ?? paths.defaultsPath), source: refusal.source, can_restore: refusal.canRestore }, [errorFact("state_unavailable", refusal.reason, next)]) };
  };

  let notice: string | undefined;
  if (sub === "use-defaults") {
    const used = useDefaults(paths);
    if (!used.ok) return refused(used);
  } else if (asked) {
    // A change goes with what the page shows under the choice it changes: the one model with the mode, the threshold with the threshold setting.
    const shown = asked.mode === "one_model" && !asked.oneModel || asked.fallback?.use === "threshold" && asked.fallback.threshold === undefined ? settingsView(paths, context) : undefined;
    if (shown && !shown.ok) return refused(shown);
    const saved = saveSettings(paths, work ? "this_prd" : "every_prd", shown ? carried(asked, shown.view) : asked, lists);
    if (!saved.ok) return refused(saved);
    notice = saved.notice;
  }
  const view = settingsView(paths, context);
  if (!view.ok) return refused(view);
  const path = view.view.source === "prd" ? paths.settingsPath! : paths.defaultsPath;
  return { answer: result({ ...facts(path), source: view.view.source, data: view.view, ...(notice ? { notice } : {}) }), lead: [notice, modelDefaultsText(view.view)].filter(Boolean).join("\n") };
}
