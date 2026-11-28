// Each activity's tier and model choice as the plan rows, the card, the launch and `kiln status`
// see them (Kiln Phase Model Tiers, technical design "Resolving a Choice" and "When an Activity
// Starts"). Every row and every launch asks here, so they can't disagree.

import type { Tier } from "../plan/phase-document.js";
import { defaultsRowFor, resolveModel, resolveNotStarted, fallbackFor, type ActivityChoice, type ChoiceSource, type ModelList, type ResolvedChoice } from "../models/resolver.js";
import { ROW_NAMES, settingsInForce, type DefaultsRow, type ModelDefaults } from "../models/model-defaults.js";
import { AGENT_NAMES, PR_PHASE_KEY, type AgentId, type PrdRecord, type RecordedPlanPhase, type SessionRecord } from "../state/records.js";
import { isAfterDeliveryKey, isAuditKey, isPhaseKey } from "../state/activity-keys.js";
import { startingSession } from "../models/start-line.js";
import { effectiveRecordedClosed } from "./waivers.js";
import { requirement } from "../agents/tooling-minimums.js";

/** The key a planned row resolves its choice under: an audit key with no facts, so the Audits choice (AC-OTHER-01). */
export const PLANNED_AUDITS_KEY = "audit-planned";
/** The key the planned Preflight row resolves its choice under: a preflight key with no facts, so the Preflight and pull request choice (AC-ROW-01). */
export const PLANNED_PREFLIGHT_KEY = "preflight-planned";

/** Why an agent is needed (Kiln Phase Model Tiers, "Agents"): the plan rows that run on it, and whether only a fallback names it. */
export interface AgentNeed { activities: string[]; fallbackOnly: boolean }

/** What a person does about an agent that isn't installed: today's Codex message, and Claude Code's. */
export function installRemedy(agentId: AgentId): string {
  return agentId === "codex" ? `Codex is not on PATH. Install ${requirement("codex")} and sign in with codex login.` : `Claude Code is not on PATH. Install ${requirement("claudeCode")} and sign in.`;
}

/** "Phase 1", "Phase 1 and the test audit", "Phase 1, Phase 2 and the test audit". */
export function listWords(words: string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** What a phase row's tag says (AC-TIER-02). */
export interface TierView { value: Tier | "not_rated"; reason?: string }

/** A model choice as a row shows it (technical design, "Snapshot"). */
export interface ChoiceView { agentId: AgentId; agent: string; model: string; modelName: string; effort?: string }

/** A row's `model` (AC-PICK-02). */
export interface ModelView {
  state: "will_run_on" | "running_on" | "ran_on" | "none_recorded";
  choice?: ChoiceView;
  from?: ChoiceSource;
  claudeCodeMissing?: true;
  /** A choice that can't be used, known before launch (AC-PICK-06). */
  problem?: string;
  /** Where Change is offered (AC-PICK-03, AC-OTHER-01): whether it is available now, and why not. */
  change?: { available: boolean; reason?: string };
  /** Where Use the default is offered: the row's choice is Changed by you. */
  useDefault?: true;
  /**
   * The launch decision a session of it ran on, when a limit read at or above the threshold
   * (AC-FALLBACK-03); or, while the fallback is used for everything, that this row's choice is its
   * fallback, from the resolver before any launch (AC-WHEN-03).
   */
  fallback?: FallbackView;
  /** The fallback is used for everything and the activity has none, so it runs on its own choice (AC-WHEN-02). */
  noFallback?: true;
  /** The heads-up (AC-FALLBACK-04): the next activity would launch on this fallback on the latest readings. */
  forecast?: { choice: ChoiceView; limit: LimitView; threshold: number };
}

/** A decision's recorded limit as a row shows it: the agent's name, the window or block, its percent. */
export interface LimitView { agent: string; label: string; percent?: number }

/** `model.fallback` (technical design, "Snapshot"): `limit` and `threshold` are absent when `forEverything` is set. */
export interface FallbackView { used: boolean; forEverything?: true; limit?: LimitView; threshold?: number; first?: ChoiceView; reason?: string; /** Where the first choice came from: the settings in force, the one model, or a change for this PRD. */ from?: ChoiceSource }

type SavedFallback = NonNullable<NonNullable<SessionRecord["launch"]>["fallback"]>;

/** A recorded agent, model and effort as a row names it. */
export function choiceView(choice: { agentId: AgentId; model: string; modelName: string; effort?: string | undefined }): ChoiceView {
  return { agentId: choice.agentId, agent: AGENT_NAMES[choice.agentId], model: choice.model, modelName: choice.modelName, ...(choice.effort ? { effort: choice.effort } : {}) };
}

/** A saved decision as the row, card and phase detail show it. */
export function fallbackView(saved: SavedFallback, from?: ChoiceSource): FallbackView {
  return {
    ...(from ? { from } : {}),
    used: saved.used,
    ...(saved.forEverything ? { forEverything: true as const } : {}),
    ...(saved.limit ? { limit: limitView(saved.limit) } : {}),
    ...(saved.threshold === undefined ? {} : { threshold: saved.threshold }),
    ...(saved.first ? { first: choiceView(saved.first) } : {}),
    ...(saved.reason ? { reason: saved.reason } : {}),
  };
}

/** A decision's recorded limit with its agent named. */
export function limitView(limit: NonNullable<SavedFallback["limit"]>): LimitView {
  const { agentId, ...rest } = limit;
  return { agent: AGENT_NAMES[agentId], ...rest };
}

/**
 * What a row says of a session's decision: the Fallback tag whenever it used the fallback, and the
 * "fallback wasn't used" note only while the activity is current and the row shows the choice
 * that decision kept (Will run on during the launch, then Running on); a Ran on row drops it.
 */
function rowFallback(session: SessionRecord, current: boolean | undefined, finished: boolean): { fallback?: FallbackView } {
  const saved = session.launch?.fallback;
  if (!saved || !saved.used && (finished || !current)) return {};
  return { fallback: fallbackView(saved, session.launch?.from) };
}

/** What the resolver reads for every activity: the settings in force now, whether Claude Code is installed, each agent's model list. */
export interface ModelContext {
  record: PrdRecord;
  /** The plan the rows show: the recorded plan, or before Start the one Documents found shows. */
  plan: RecordedPlanPhase[];
  defaultsPath: string;
  /** Where this PRD's own settings are kept, in its state directory; the PRD has them while the file exists. */
  settingsPath?: string | undefined;
  claudeCodeInstalled: boolean;
  lists: Partial<Record<AgentId, ModelList>>;
  session(key: string, id: string): SessionRecord | undefined;
  /** A session's first response without reading the whole record each time; defaults to reading it. */
  firstResponse?(key: string, id: string): string | undefined;
}

/** Whether the activity is a phase, whose own row offers Change. */
export function isPhaseActivity(key: string): boolean { return isPhaseKey(key) && key !== PR_PHASE_KEY; }

/**
 * Which choice an activity that isn't a phase runs on (AC-ROW-01, ROW-002): an audit on the Audits
 * choice; the preflight and the pull request session, and the merge and plan push after delivery,
 * on the Preflight and pull request choice.
 *
 *   activityGroup("audit-7f3a")  // "audits"
 *   activityGroup("pr")          // "preflight_pr"
 *   activityGroup("merge")       // "after_delivery"
 */
export function activityGroup(key: string): "phase" | "audits" | "preflight_pr" | "after_delivery" {
  if (isPhaseActivity(key)) return "phase";
  if (isAuditKey(key)) return "audits";
  return isAfterDeliveryKey(key) ? "after_delivery" : "preflight_pr";
}

/**
 * Where a person changes the Audits choice the delivery audit and the test audit run on
 * (AC-PICK-06 with AC-OTHER-01): the Audits line, or the Audits row for a row's choice.
 *
 *   auditsChangePlace("changed")         // "Change it on the Audits line, in Documents found's delivery panel or the run's settings."
 *   auditsChangePlace("model_defaults")  // "Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings."
 */
export function auditsChangePlace(from: ChoiceSource, ownSettings = false): string {
  return from === "changed"
    ? "Change it on the Audits line, in Documents found's delivery panel or the run's settings."
    : `Change the Audits row in ${settingsPage(ownSettings)}, or the Audits line in Documents found's delivery panel or the run's settings.`;
}

/** Where the settings in force are changed: Model defaults, which shows this PRD's own settings when opened from its page. */
function settingsPage(ownSettings: boolean): string { return ownSettings ? "Model defaults, opened from this PRD's page" : "Model defaults"; }
/** What the settings in force are called where a choice came from them. */
function settingsName(ownSettings: boolean): string { return ownSettings ? "this PRD's own settings" : "Model defaults"; }

/** What a stop or a status line needs to say where a choice came from (AC-PICK-06). */
export interface ChoiceOrigin {
  key: string;
  from: ChoiceSource;
  row: DefaultsRow;
  ownSettings?: boolean | undefined;
  /** The choice is the activity's fallback: launched on a limit at the threshold, or used for everything. */
  fallback?: "threshold" | "everything" | undefined;
}

/**
 * Where an activity's choice came from, and where to change it, as a stop says them (AC-PICK-06;
 * Kiln Model Modes, "Resolving a Choice", the source table): a change for this PRD, the one model,
 * a row of the settings in force, or that row's Fallback column. The settings in force are Model
 * defaults or this PRD's own settings, which Model defaults shows when opened from this PRD's
 * page. The merge and a plan push run once the run is complete, when no row offers Change.
 *
 *   choiceOrigin({ key: "2", from: "model_defaults", row: "demanding" })
 *   // { from: "Model defaults (Demanding row)", where: "Change the Demanding row in Model defaults." }
 *   choiceOrigin({ key: "2", from: "changed", row: "demanding", fallback: "everything" })
 *   // { from: "the Demanding row's Fallback column in Model defaults, used for everything", where: "Change that row's fallback, or the fallback setting, in Model defaults." }
 */
export function choiceOrigin(origin: ChoiceOrigin): { from: string; where: string } {
  const own = origin.ownSettings === true;
  const row = ROW_NAMES[origin.row];
  const group = activityGroup(origin.key);
  if (origin.fallback === "everything") return { from: `the ${row} row's Fallback column in ${settingsName(own)}, used for everything`, where: `Change that row's fallback, or the fallback setting, in ${settingsPage(own)}.` };
  if (origin.fallback === "threshold") return { from: `the fallback, from the ${row} row's Fallback column in ${settingsName(own)}`, where: `Change it in ${settingsPage(own)}.` };
  if (origin.from === "changed") {
    const where = group === "phase" ? "Change it on its row in the phase plan." : group === "audits" ? auditsChangePlace("changed") : group === "preflight_pr" ? `Change it on ${PREFLIGHT_PR_ROWS}.` : "It can't be changed once the run is complete.";
    return { from: "a change for this PRD", where };
  }
  if (origin.from === "one_model") {
    const onRow = group === "phase" ? ", or on its row in the phase plan" : group === "preflight_pr" ? `, or on ${PREFLIGHT_PR_ROWS}` : "";
    return { from: `the one model in ${settingsName(own)}`, where: `Change the one model in ${settingsPage(own)}${onRow}.` };
  }
  const from = own ? `this PRD's own settings (${row} row)` : `Model defaults (${row} row)`;
  if (group === "audits") return { from, where: auditsChangePlace("model_defaults", own) };
  return { from, where: `Change the ${row} row in ${settingsPage(own)}${group === "preflight_pr" ? `, or change it for this PRD on ${PREFLIGHT_PR_ROWS}` : ""}.` };
}

/** The two rows whose Change sets this PRD's Preflight and pull request choice (AC-ROW-01). */
const PREFLIGHT_PR_ROWS = "the Preflight row or the pull request row in the phase plan";

/**
 * Where a launch's choice came from and where to change it, as a stopped session and the
 * terminal say them (AC-PICK-06), from the decision saved for the launch and the row the
 * activity uses.
 *
 *   launchSource("2", { from: "changed" }, "standard")  // "A change for this PRD. Change it on its row in the phase plan."
 *   launchSource("2", { from: "model_defaults", fallback: { used: true, … } }, "demanding")
 *   // "The fallback, from the Demanding row's Fallback column in Model defaults. Change it in Model defaults."
 */
export function launchSource(key: string, launch: Pick<NonNullable<SessionRecord["launch"]>, "from" | "fallback" | "ownSettings">, row: DefaultsRow): string {
  const fallback = launch.fallback?.used ? launch.fallback.forEverything ? "everything" as const : "threshold" as const : undefined;
  const origin = choiceOrigin({ key, from: launch.from, row, ownSettings: launch.ownSettings, fallback });
  // A Model defaults choice keeps the words it had before a PRD could hold its own settings.
  if (launch.from === "model_defaults" && !launch.ownSettings && !fallback) return `Model defaults. ${activityGroup(key) === "phase" ? "Change it in Model defaults, or on its row in the phase plan." : origin.where}`;
  return `${origin.from.charAt(0).toUpperCase()}${origin.from.slice(1)}. ${origin.where}`;
}

/** A phase's tag: its tier line's tier and reason, or Not rated (AC-TIER-01). */
export function tierView(phase: Pick<RecordedPlanPhase, "modelTier"> | undefined): TierView {
  const tier = phase?.modelTier;
  return tier ? { value: tier.tier, ...(tier.reason ? { reason: tier.reason } : {}) } : { value: "not_rated" };
}

/** The row an activity uses: a phase's tier's, Not rated as Standard; an audit's Audits; every other activity's Preflight and pull request (AC-ROW-01). */
export function rowOfActivity(plan: RecordedPlanPhase[], key: string): DefaultsRow {
  const group = activityGroup(key);
  if (group !== "phase") return defaultsRowFor(group === "audits" ? "audits" : "preflight_pr");
  return defaultsRowFor(plan.find(phase => phase.id === key)?.modelTier?.tier);
}

/** The activity's own entry (resolver step 2): a phase's, by its id; an audit's, the Audits entry; every other activity's, the Preflight and pull request entry. */
function entryOf(record: PrdRecord, key: string) {
  const choices = record.settings.modelChoices;
  const group = activityGroup(key);
  return group === "phase" ? choices.phases[key] : group === "audits" ? choices.audits : choices.preflightPr;
}

/** The session whose first response started the activity, when it has started (AC-PICK-04). */
export function startedSession(context: Pick<ModelContext, "record" | "session" | "firstResponse">, key: string): SessionRecord | undefined {
  const facts = context.record.phases[key];
  if (!facts) return undefined;
  if (facts.startedSessionId) return context.session(key, facts.startedSessionId);
  if (context.firstResponse) {
    const id = facts.sessionIds.find(one => context.firstResponse!(key, one));
    return id === undefined ? undefined : context.session(key, id);
  }
  return startingSession(facts, id => context.session(key, id));
}

/** The settings in force as the files say now, with their source; a file that can't be read gives its reason in place of a choice. */
export function settingsNow(context: Pick<ModelContext, "defaultsPath" | "settingsPath">): { defaults: ModelDefaults; source: "defaults" | "prd" } | { problem: string; source: "defaults" | "prd" } {
  const inForce = settingsInForce(context);
  return inForce.read.ok ? { defaults: inForce.read.defaults, source: inForce.source } : { problem: inForce.read.reason, source: inForce.source };
}

/**
 * The choice an activity with no start runs on (resolver steps 2 to 5), with its problem when it
 * can't be used. Settings in force that can't be read make every choice unusable, with the file's
 * reason: Kiln never falls back to its shipped choices over them, nor to Model defaults over a
 * PRD's own settings, and a choice of the PRD's own can't launch either, because the unread file
 * may say the fallback is used for everything, which wins over it (Kiln Model Modes, "Settings in
 * Force").
 */
export function notStartedChoice(context: ModelContext, key: string): ActivityChoice {
  const entry = entryOf(context.record, key);
  const now = settingsNow(context);
  const row = rowOfActivity(context.plan, key);
  if ("problem" in now) {
    const ownSettings = now.source === "prd" ? { ownSettings: true as const } : {};
    // A choice of the PRD's own keeps its mark and names what the person picked, with the file's reason in place of its own.
    const kept = context.record.settings.modelChoices.kept;
    const own = entry && entry !== "default" ? entry : entry === undefined ? kept : undefined;
    if (own) return { ...resolveModel(own, context.lists[own.agentId] ?? { pending: true }), from: "changed", ...ownSettings, problem: `${now.problem} Until it reads, Kiln can't tell whether the fallback is used for everything, so nothing launches.`, settingsUnreadable: true };
    return { agentId: context.claudeCodeInstalled ? "claude_code" : "codex", modelName: "", problem: now.problem, from: "model_defaults", row, ...ownSettings };
  }
  return resolveNotStarted({ defaults: now.defaults, source: now.source, entry, kept: context.record.settings.modelChoices.kept, row, claudeCodeInstalled: context.claudeCodeInstalled, lists: context.lists });
}

/** The activity's fallback (AC-FALLBACK-02), none when it has none (see `fallbackFor`) or the settings in force can't be read. */
export function activityFallback(context: ModelContext, key: string, choice: Pick<ActivityChoice, "agentId" | "everything">): ResolvedChoice | undefined {
  const now = settingsNow(context);
  if ("problem" in now) return undefined;
  return fallbackFor({ defaults: now.defaults, row: rowOfActivity(context.plan, key), lists: context.lists }, choice);
}

/** A session's recorded agent, model and effort, with the model named as its agent reported it. */
export function sessionChoice(session: SessionRecord): ChoiceView {
  const agentId = session.agentId ?? "claude_code";
  return { agentId, agent: AGENT_NAMES[agentId], model: session.initModel ?? session.model, modelName: session.modelDisplayName, ...(session.effort ? { effort: session.effort } : {}) };
}

function resolvedView(choice: ResolvedChoice): ChoiceView | undefined {
  if (!choice.modelName) return undefined;
  return { agentId: choice.agentId, agent: AGENT_NAMES[choice.agentId], model: choice.model ?? "", modelName: choice.modelName, ...(choice.effort ? { effort: choice.effort } : {}) };
}

export interface RowState {
  /** The activity finished: its facts say done, or its phase is closed. */
  finished: boolean;
  /** One of its sessions is launching or its process runs: its recorded choice shows. */
  liveSession?: SessionRecord | undefined;
  /** It is the current activity, so a "fallback wasn't used" note shows. */
  current?: boolean;
}

/**
 * What a row shows (technical design, "When an Activity Starts", the row table): the resolver's
 * choice until the activity starts, then what it started on, and once finished what its latest
 * session that got a response ran on, or No model recorded.
 */
export function modelView(context: ModelContext, key: string, state: RowState): ModelView {
  const facts = context.record.phases[key];
  if (state.finished) {
    // The latest of its sessions that got a response, read alone.
    const ids = facts?.sessionIds ?? [];
    const responded = (id: string) => context.firstResponse ? context.firstResponse(key, id) !== undefined : context.session(key, id)?.firstResponseAt !== undefined;
    const id = [...ids].reverse().find(responded);
    const ran = id === undefined ? undefined : context.session(key, id);
    return ran ? ranOnView(ran, startedSession(context, key)) : { state: "none_recorded" };
  }
  const started = startedSession(context, key);
  if (started) return { state: "running_on", choice: sessionChoice(started), ...launchMarks(started.launch, false), ...rowFallback(started, state.current, false) };
  if (state.liveSession) return { state: "will_run_on", choice: sessionChoice(state.liveSession), ...launchMarks(state.liveSession.launch, true), ...rowFallback(state.liveSession, state.current, false) };
  const choice = notStartedChoice(context, key);
  const view = resolvedView(choice);
  return {
    state: "will_run_on", ...(view ? { choice: view } : {}), from: choice.from,
    ...(choice.claudeCodeMissing ? { claudeCodeMissing: true as const } : {}),
    ...(choice.problem ? { problem: choice.problem } : {}),
    ...notStartedFallback(choice),
  };
}

/**
 * What a row that hasn't started says while the fallback is used for everything (AC-WHEN-03): its
 * choice is its fallback, tagged, with the choice it would otherwise run on as its first choice;
 * or it has no fallback and runs on its own choice.
 */
export function notStartedFallback(choice: ActivityChoice): Pick<ModelView, "fallback" | "noFallback"> {
  if (choice.noFallback) return { noFallback: true };
  if (!choice.everything) return {};
  const first = resolvedView(choice.everything.first);
  return { fallback: { from: choice.from, used: true, forEverything: true, ...(first ? { first } : {}) } };
}

/**
 * The marks a launched session's saved decision gives its row: Changed by you for a choice of the
 * PRD's own (AC-PICK-03, AC-KEEP-02), from the launch until the row reads Ran on; and, while the
 * launch is under way, the note that Claude Code isn't installed (AC-DEFAULT-04).
 */
export function launchMarks(launch: SessionRecord["launch"], launching: boolean): Pick<ModelView, "from" | "claudeCodeMissing"> {
  if (!launch) return {};
  return { from: launch.from, ...(launching && launch.claudeCodeMissing ? { claudeCodeMissing: true as const } : {}) };
}

/**
 * A finished activity's Ran on row: the latest session that got a response, with the Fallback tag
 * and Changed by you from the session that started it, which a later session may follow
 * (AC-FALLBACK-03, AC-PICK-03).
 */
export function ranOnView(ran: SessionRecord, started: SessionRecord | undefined): ModelView {
  const starting = started ?? ran;
  return { state: "ran_on", choice: sessionChoice(ran), ...launchMarks(starting.launch, false), ...rowFallback(starting.launch?.fallback?.used ? starting : ran, false, true) };
}

/** Whether a phase row has finished, as its row shows it. */
export function phaseFinished(record: PrdRecord, phase: RecordedPlanPhase, key: string | undefined): boolean {
  return !!(key && record.phases[key]?.doneAt) || effectiveRecordedClosed(record, phase);
}

export { countedFor } from "../models/launch-decision.js";
