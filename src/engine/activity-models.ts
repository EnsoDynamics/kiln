// Each activity's tier and model choice as the plan rows, the card, the launch and `kiln status`
// see them (Kiln Phase Model Tiers, technical design "Resolving a Choice" and "When an Activity
// Starts"). Every row and every launch asks here, so they can't disagree.

import type { Tier } from "../plan/phase-document.js";
import { defaultsRowFor, resolveModel, resolveNotStarted, fallbackFor, type ActivityChoice, type ChoiceSource, type ModelList, type ResolvedChoice } from "../models/resolver.js";
import { readModelDefaults, type DefaultsRow, type ModelDefaults } from "../models/model-defaults.js";
import { AGENT_NAMES, PR_PHASE_KEY, type AgentId, type PrdRecord, type RecordedPlanPhase, type SessionRecord } from "../state/records.js";
import { activityKeyKind, isPhaseKey } from "../state/activity-keys.js";
import { startingSession } from "../models/start-line.js";
import { effectiveRecordedClosed } from "./waivers.js";
import { requirement } from "../agents/tooling-minimums.js";

/** The key a planned row resolves its choice under: an audit key with no facts, so the Audits choice (AC-OTHER-01). */
export const PLANNED_AUDITS_KEY = "audit-planned";
/** The key the planned Preflight row resolves its choice under: a preflight key with no facts. */
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
  /** The launch decision a session of it ran on, when a limit read at or above the threshold (AC-FALLBACK-03). */
  fallback?: FallbackView;
  /** The heads-up (AC-FALLBACK-04): the next activity would launch on this fallback on the latest readings. */
  forecast?: { choice: ChoiceView; limit: LimitView; threshold: number };
}

/** A decision's recorded limit as a row shows it: the agent's name, the window or block, its percent. */
export interface LimitView { agent: string; label: string; percent?: number }

/** `model.fallback` (technical design, "Snapshot"). */
export interface FallbackView { used: boolean; limit: LimitView; threshold: number; first?: ChoiceView; reason?: string; /** Where the first choice came from: Model defaults, or a change for this PRD. */ from?: ChoiceSource }

type SavedFallback = NonNullable<NonNullable<SessionRecord["launch"]>["fallback"]>;

/** A recorded agent, model and effort as a row names it. */
export function choiceView(choice: { agentId: AgentId; model: string; modelName: string; effort?: string | undefined }): ChoiceView {
  return { agentId: choice.agentId, agent: AGENT_NAMES[choice.agentId], model: choice.model, modelName: choice.modelName, ...(choice.effort ? { effort: choice.effort } : {}) };
}

/** A saved decision as the row, card and phase detail show it. */
export function fallbackView(saved: SavedFallback, from?: ChoiceSource): FallbackView {
  const { agentId, ...limit } = saved.limit;
  return {
    ...(from ? { from } : {}),
    used: saved.used, limit: { agent: AGENT_NAMES[agentId], ...limit }, threshold: saved.threshold,
    ...(saved.first ? { first: choiceView(saved.first) } : {}),
    ...(saved.reason ? { reason: saved.reason } : {}),
  };
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

/** What the resolver reads for every activity: Model defaults now, whether Claude Code is installed, each agent's model list. */
export interface ModelContext {
  record: PrdRecord;
  /** The plan the rows show: the recorded plan, or before Start the one Documents found shows. */
  plan: RecordedPlanPhase[];
  defaultsPath: string;
  claudeCodeInstalled: boolean;
  lists: Partial<Record<AgentId, ModelList>>;
  session(key: string, id: string): SessionRecord | undefined;
  /** A session's first response without reading the whole record each time; defaults to reading it. */
  firstResponse?(key: string, id: string): string | undefined;
}

/** Whether the activity is a phase, whose own row offers Change; every other activity runs on the Audits choice (AC-OTHER-01). */
export function isPhaseActivity(key: string): boolean { return isPhaseKey(key) && key !== PR_PHASE_KEY; }

/**
 * Where a person changes the Audits choice that the preflight, the audits and the pull request
 * session run on (AC-PICK-06 with AC-OTHER-01): neither the Preflight row nor the pull request row
 * offers Change, so the Audits line, or Model defaults' Audits row for a Model defaults choice.
 *
 *   auditsChangePlace("changed")         // "Change it on the Audits line, in Documents found's delivery panel or the run's settings."
 *   auditsChangePlace("model_defaults")  // "Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings."
 */
export function auditsChangePlace(from: ChoiceSource): string {
  return from === "changed"
    ? "Change it on the Audits line, in Documents found's delivery panel or the run's settings."
    : "Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings.";
}

/**
 * Where a launch's choice came from and where to change it (AC-PICK-06): the fallback, a change
 * for this PRD, or Model defaults, from the decision saved for the launch.
 *
 *   launchSource("2", { from: "changed" })  // "A change for this PRD. Change it on its row in the phase plan."
 */
export function launchSource(key: string, launch: Pick<NonNullable<SessionRecord["launch"]>, "from" | "fallback">): string {
  if (launch.fallback?.used) return "The fallback, from Model defaults' Fallback column. Change it in Model defaults.";
  if (!isPhaseActivity(key)) return launch.from === "changed" ? `A change for this PRD. ${auditsChangePlace("changed")}` : `Model defaults. ${auditsChangePlace("model_defaults")}`;
  return launch.from === "changed" ? "A change for this PRD. Change it on its row in the phase plan." : "Model defaults. Change it in Model defaults, or on its row in the phase plan.";
}

/** A phase's tag: its tier line's tier and reason, or Not rated (AC-TIER-01). */
export function tierView(phase: Pick<RecordedPlanPhase, "modelTier"> | undefined): TierView {
  const tier = phase?.modelTier;
  return tier ? { value: tier.tier, ...(tier.reason ? { reason: tier.reason } : {}) } : { value: "not_rated" };
}

/** The Model defaults row an activity uses: a phase's tier's, Not rated as Standard; every other activity Audits. */
export function rowOfActivity(plan: RecordedPlanPhase[], key: string, record?: PrdRecord): DefaultsRow {
  if (activityKeyKind(key) === "requirements") {
    // A feedback session always runs on Requirements stages, inside the design span too (Kiln Requirements Stages, "Models").
    if (record?.requirements?.stages.some(stage => key === `req-${stage.activityId}` && stage.task === "feedback")) return "requirements";
    return key === "req-design" || key !== "req-next" && record?.requirements?.designSpan ? "refining_design" : "requirements";
  }
  if (!isPhaseKey(key) || key === PR_PHASE_KEY) return defaultsRowFor("audits");
  return defaultsRowFor(plan.find(phase => phase.id === key)?.modelTier?.tier);
}

/** The activity's own entry: a phase's, by its id, or the PRD's one Audits entry. */
function entryOf(record: PrdRecord, key: string) {
  const choices = record.settings.modelChoices;
  if (activityKeyKind(key) === "requirements") {
    const stage = record.requirements?.stages.find(stage => key === `req-${stage.activityId}`);
    return choices.stages?.[stage?.key ?? "kiln:next"];
  }
  return isPhaseKey(key) && key !== PR_PHASE_KEY ? choices.phases[key] : choices.audits;
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

/** Model defaults as the file says now; a file that can't be read gives its reason in place of a choice. */
export function defaultsNow(context: Pick<ModelContext, "defaultsPath">): { defaults: ModelDefaults } | { problem: string } {
  const read = readModelDefaults(context.defaultsPath);
  return read.ok ? { defaults: read.defaults } : { problem: read.reason };
}

/**
 * The choice an activity with no start runs on (resolver steps 2 to 4), with its problem when it
 * can't be used. Model defaults that can't be read make every Model defaults choice unusable,
 * with the file's reason; Kiln never falls back to its shipped defaults over it.
 */
export function notStartedChoice(context: ModelContext, key: string): ActivityChoice {
  const entry = entryOf(context.record, key);
  const now = defaultsNow(context);
  const row = rowOfActivity(context.plan, key, context.record);
  if ("problem" in now) {
    // A choice of the PRD's own needs no Model defaults; only a Model defaults choice takes the file's reason.
    const kept = activityKeyKind(key) === "requirements" ? undefined : context.record.settings.modelChoices.kept;
    const own = entry && entry !== "default" ? entry : entry === undefined ? kept : undefined;
    if (own) return { ...resolveModel(own, context.lists[own.agentId] ?? { pending: true }), from: "changed" };
    return { agentId: context.claudeCodeInstalled ? "claude_code" : "codex", modelName: "", problem: now.problem, from: "model_defaults", row };
  }
  return resolveNotStarted({ defaults: now.defaults, entry, kept: activityKeyKind(key) === "requirements" ? undefined : context.record.settings.modelChoices.kept, row, claudeCodeInstalled: context.claudeCodeInstalled, lists: context.lists });
}

/** The activity's fallback (AC-FALLBACK-02), none when it is on the choice's own agent or Model defaults can't be read. */
export function activityFallback(context: ModelContext, key: string, choice: Pick<ResolvedChoice, "agentId">): ResolvedChoice | undefined {
  const now = defaultsNow(context);
  if ("problem" in now) return undefined;
  return fallbackFor({ defaults: now.defaults, row: rowOfActivity(context.plan, key, context.record), lists: context.lists }, choice);
}

/** A session's recorded agent, model and effort, with the model named as its agent reported it. */
export function sessionChoice(session: SessionRecord): ChoiceView {
  const agentId = session.agentId ?? "claude_code";
  return { agentId, agent: AGENT_NAMES[agentId], model: session.initModel ?? session.model, modelName: session.modelDisplayName, ...(session.effort ? { effort: session.effort } : {}) };
}

function resolvedView(choice: ActivityChoice): ChoiceView | undefined {
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
  return { state: "will_run_on", ...(view ? { choice: view } : {}), from: choice.from, ...(choice.claudeCodeMissing ? { claudeCodeMissing: true as const } : {}), ...(choice.problem ? { problem: choice.problem } : {}) };
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
