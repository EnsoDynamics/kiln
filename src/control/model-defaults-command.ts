// `kiln model-defaults` (Kiln Phase Model Tiers AC-DEFAULT-05, "Command line"): prints Model
// defaults and changes them for every PRD on this computer, through the same module as the page
// and with the same refusals. It changes a computer setting, not a run, so it needs no PRD path,
// no controller and neither safety flag. Each installed agent's model list and readiness are read
// on demand, as the page reads them.

import { AgentInfo } from "../agents/metadata.js";
import { editModelDefaults, modelDefaultsView, ROW_NAMES, type DefaultsChange, type DefaultsSideView, type ModelDefaultsView } from "../models/model-defaults-edit.js";
import { DEFAULTS_ROWS, modelDefaultsPath, type DefaultsRow, type FamilyChoice } from "../models/model-defaults.js";
import type { ModelList } from "../models/resolver.js";
import { executableAvailable, findExecutable } from "../platform/helper-process.js";
import { AGENT_IDS, type AgentId } from "../state/records.js";
import { stateRoot } from "../state/state-files.js";
import type { ParsedCommand } from "./help.js";
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

/**
 * The text `kiln model-defaults` prints before its result.
 *
 *   Model defaults, for every PRD on this computer
 *   Demanding: Claude Code · Fable · high (Fable 5.2), Kiln's default; fallback Codex · GPT Astra · high (GPT-6-Astra), Kiln's default
 *   …
 *   Fallback when usage is nearly out: off (threshold 95%)
 */
export function modelDefaultsText(view: ModelDefaultsView): string {
  return ["Model defaults, for every PRD on this computer",
    ...DEFAULTS_ROWS.map(row => `${ROW_NAMES[row]}: ${sideLine(view.rows[row].first)}; fallback ${sideLine(view.rows[row].fallback)}`),
    `Fallback when usage is nearly out: ${view.fallback.enabled ? "on" : "off"} (threshold ${view.fallback.threshold}%)`].join("\n");
}

/** A side from `--first-agent`, `--first-model`, `--first-effort` (or the fallback's): agent and model go together. */
function sideFlags(flags: ParsedCommand["flags"], side: "first" | "fallback"): FamilyChoice | undefined {
  const agent = flags[`${side}-agent`]; const model = flags[`${side}-model`]; const effort = flags[`${side}-effort`];
  if (agent === undefined && model === undefined && effort === undefined) return undefined;
  if (typeof agent !== "string" || typeof model !== "string") throw new ControlFailure("invalid_input", `--${side}-agent and --${side}-model go together.`, 2);
  if (agent !== "claude_code" && agent !== "codex") throw new ControlFailure("invalid_input", `--${side}-agent takes claude_code or codex.`, 2);
  return { agentId: agent, family: model, ...(typeof effort === "string" ? { effort } : {}) };
}

/** The change a `set`, `restore` or `fallback` subcommand asks for. */
function changeOf(parsed: ParsedCommand): DefaultsChange {
  const [, sub] = parsed.contract.path; const flags = parsed.flags;
  if (sub === "restore") return { restore: true };
  if (sub === "fallback") {
    if (flags.on && flags.off) throw new ControlFailure("invalid_input", "Give --on or --off, not both.", 2);
    const threshold = flags.threshold;
    if (threshold !== undefined && !/^\d+$/.test(String(threshold))) throw new ControlFailure("invalid_input", "--threshold takes a whole-number percent from 1 to 100.", 2);
    if (!flags.on && !flags.off && threshold === undefined) throw new ControlFailure("invalid_input", "Give --on, --off or --threshold.", 2);
    return { fallback: { ...(flags.on ? { enabled: true } : flags.off ? { enabled: false } : {}), ...(threshold === undefined ? {} : { threshold: Number(threshold) }) } };
  }
  const row = flags.row === "refining-design" ? "refining_design" : flags.row;
  if (!DEFAULTS_ROWS.includes(row as DefaultsRow)) throw new ControlFailure("invalid_input", "--row takes demanding, standard, mechanical, audits, requirements or refining-design.", 2);
  const first = sideFlags(flags, "first"); const fallback = sideFlags(flags, "fallback");
  if (!first && !fallback) throw new ControlFailure("invalid_input", "Give the first choice, the fallback or both: --first-agent with --first-model, or --fallback-agent with --fallback-model.", 2);
  return { set: { row: row as DefaultsRow, ...(first ? { first } : {}), ...(fallback ? { fallback } : {}) } };
}

/**
 * Runs a `kiln model-defaults` command and returns its result with the text that leads it.
 *
 *   await modelDefaultsCommand(parseCommand(["model-defaults", "fallback", "--on"]), env, cwd)
 *   // { answer: { ok: true, data: { rows: …, fallback: { enabled: true, threshold: 95 }, … } }, lead: "Model defaults, …" }
 */
export async function modelDefaultsCommand(parsed: ParsedCommand, env: NodeJS.ProcessEnv, cwd: string): Promise<{ answer: Result; lead?: string }> {
  const path = modelDefaultsPath(env);
  const change = parsed.contract.path.length > 1 ? changeOf(parsed) : undefined;
  const { lists, agents } = await readAgents(env, cwd);
  let notice: string | undefined;
  if (change) {
    const edited = editModelDefaults(path, change, lists);
    if (!edited.ok) return { answer: result({ path }, [errorFact(edited.status === 409 ? "state_unavailable" : "invalid_input", edited.reason)]) };
    if (edited.fallbackTurnedOff) notice = "Kiln's defaults are restored, and the fallback is now off.";
  }
  const view = modelDefaultsView(path, lists, agents);
  if (!view.ok) return { answer: result({ path, can_restore: view.canRestore }, [errorFact("state_unavailable", view.reason, view.canRestore ? ["kiln", "model-defaults", "restore"] : null)]) };
  return { answer: result({ path, data: view.view, ...(notice ? { notice } : {}) }), lead: [notice, modelDefaultsText(view.view)].filter(Boolean).join("\n") };
}
