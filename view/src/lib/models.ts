// What the plan rows and the card say about each activity's tier and model (Kiln Phase Model
// Tiers AC-TIER-02, AC-PICK-02, AC-KEEP-01; mockups 1, 2 and 5).

import type { ChoiceView, FallbackView, LimitView, ModelView, TierView } from "../../../src/engine/activity-models.js";
import type { Snapshot } from "../../../src/engine/snapshot.js";

/** A tag's words. */
export const TIER_LABELS: Record<TierView["value"], string> = { demanding: "Demanding", standard: "Standard", mechanical: "Mechanical", not_rated: "Not rated" };

/**
 * A model choice as a row names it: agent, the model as its agent reports it, and effort.
 *
 *   choiceLine({ agent: "Claude Code", modelName: "Opus 5.5", effort: "medium", … })  // "Claude Code · Opus 5.5 · medium"
 */
export function choiceLine(choice: Pick<ChoiceView, "agent" | "modelName" | "effort">): string {
  return [choice.agent, choice.modelName, choice.effort].filter(Boolean).join(" · ");
}

/**
 * A row's model line (AC-PICK-02's table): the choice alone before Start, Will run on in a run
 * underway, Running on once the activity started, Ran on once it finished, or No model recorded.
 *
 *   rowModelLine({ state: "will_run_on", choice }, true)   // "Will run on Claude Code · Sonnet 5.5 · high"
 *   rowModelLine({ state: "none_recorded" }, true)         // "No model recorded"
 */
export function rowModelLine(model: ModelView, underway: boolean): string | undefined {
  if (model.state === "none_recorded") return "No model recorded";
  if (!model.choice) return undefined;
  const line = choiceLine(model.choice);
  if (model.state === "ran_on") return `Ran on ${line}`;
  if (model.state === "running_on") return `Running on ${line}`;
  return underway ? `Will run on ${line}` : line;
}

/** The note beside a choice Kiln filled in from the Fallback column because Claude Code isn't installed (AC-DEFAULT-04). */
export const CLAUDE_CODE_MISSING_NOTE = "Claude Code isn't installed, so this runs on its Codex choice.";

/** What an information control shows (AC-TIER-02's table). */
export interface TierExplanation { heading: string; body: string; source?: string }

const FROM_LINE = "From the phase document's Model tier line.";

/**
 * A tag's explanation: why a demanding or mechanical phase got its tier, in the line's own words;
 * what standard means; or that the document has no Model tier line.
 *
 *   tierExplanation({ value: "mechanical", reason: "Repeats phase 1's label builder." })
 *   // { heading: "Why this phase is mechanical", body: "Repeats phase 1's label builder.", source: "From the phase document's Model tier line." }
 */
export function tierExplanation(tier: TierView): TierExplanation {
  switch (tier.value) {
    case "demanding":
    case "mechanical":
      return { heading: `Why this phase is ${tier.value}`, body: tier.reason ?? "The phase document's Model tier line gives no reason.", source: FROM_LINE };
    case "standard":
      return { heading: "What standard means", body: "Each phase document rates how capable a model its build needs. Standard is the usual rating, and the model for it is set in Model defaults." };
    case "not_rated":
      return { heading: "What not rated means", body: "This phase document has no Model tier line, so Kiln treats the phase as standard." };
  }
}

/**
 * Documents found's "Chosen for each phase" counts, in tier order, leaving out a tier with none.
 *
 *   tierCountsLine({ demanding: 1, standard: 2, mechanical: 1, notRated: 1 })  // "1 demanding, 2 standard, 1 mechanical, 1 not rated."
 */
export function tierCountsLine(tiers: Snapshot["settings"]["models"]["tiers"]): string | undefined {
  const parts = [[tiers.demanding, "demanding"], [tiers.standard, "standard"], [tiers.mechanical, "mechanical"], [tiers.notRated, "not rated"]] as const;
  const shown = parts.filter(([count]) => count > 0).map(([count, word]) => `${count} ${word}`);
  return shown.length ? `${shown.join(", ")}.` : undefined;
}

/** One choice an editor offers: a model (a row's Change) or a family (Model defaults). */
export interface EditorOption { value: string; name: string; efforts: string[]; defaultEffort?: string | undefined }
/** An agent's choices in an editor; none while its list can't be read, with the reason. */
export interface EditorAgent { agentId: AgentId; agent: string; options: EditorOption[]; problem?: string | undefined }
type AgentId = "claude_code" | "codex";

const EFFORT_WORDS: Record<string, string> = { low: "low", medium: "medium", high: "high", xhigh: "extra high", max: "max", ultra: "ultra" };

/**
 * An effort as a person reads it.
 *
 *   effortWord("xhigh")  // "extra high"
 */
export function effortWord(effort: string): string {
  return EFFORT_WORDS[effort] ?? effort;
}

/** The agents a row's Change offers, from the snapshot: each installed agent's models, none for one whose list can't be read. */
export function rowEditorAgents(agents: Snapshot["agents"]): EditorAgent[] {
  return agents.filter(agent => agent.installed).map(agent => ({ agentId: agent.agentId, agent: agent.agent, options: (agent.models ?? []).map(model => ({ value: model.value, name: model.displayName, efforts: model.efforts, defaultEffort: model.defaultEffort })), ...(agent.models ? {} : { problem: agent.modelListError ?? `Reading ${agent.agent} models…` }) }));
}

/**
 * The effort an editor starts on for a choice: the current one when the choice offers it, else
 * the agent's default for it, else high, else the first it offers; none for a choice that takes none.
 *
 *   startingEffort({ efforts: ["low", "medium", "high"] }, "max")  // "high"
 */
export function startingEffort(option: Pick<EditorOption, "efforts" | "defaultEffort"> | undefined, current: string | undefined): string | undefined {
  if (!option || option.efforts.length === 0) return undefined;
  if (current && option.efforts.includes(current)) return current;
  if (option.defaultEffort && option.efforts.includes(option.defaultEffort)) return option.defaultEffort;
  return option.efforts.includes("high") ? "high" : option.efforts[0];
}

/**
 * The delivery panel's and the run's settings' fallback line (AC-FALLBACK-01).
 *
 *   fallbackLine({ enabled: true, threshold: 95 })  // { value: "Use the fallback at 95%" }
 *   fallbackLine({ enabled: false, threshold: 95 }) // { value: "Wait for the limit", help: "No fallback is switched on. Set one up in" }
 */
export function fallbackLine(fallback: { enabled: boolean; threshold: number }): { value: string; help?: string } {
  return fallback.enabled ? { value: `Use the fallback at ${fallback.threshold}%` } : { value: "Wait for the limit", help: "No fallback is switched on. Set one up in" };
}

/**
 * A decision's recorded limit in a sentence: a window with its percent, or a usage block or used-up attempt.
 *
 *   limitPhrase({ agent: "Claude Code", label: "Weekly", percent: 97 })   // "Claude Code's weekly limit was at 97%"
 *   limitPhrase({ agent: "Codex", label: "ordinary usage blocked" })      // "Codex reported ordinary usage blocked"
 */
export function limitPhrase(limit: LimitView): string {
  if (limit.percent === undefined) return `${limit.agent} reported ${limit.label}`;
  const name = limit.label.toLowerCase();
  return `${limit.agent}'s ${/window$/.test(name) ? name : `${name} limit`} was at ${limit.percent}%`;
}

/**
 * The row's note while the current activity's launch kept its first choice although a limit read
 * at or above the threshold (Kiln Phase Model Tiers, "The launch decision"; mockup 5, state D).
 *
 *   fallbackNotUsedNote({ used: false, limit, threshold: 95, reason: "Codex isn't signed in." })
 *   // "Claude Code's weekly limit was at 96% when this began, but the fallback wasn't used: Codex isn't signed in."
 */
export function fallbackNotUsedNote(fallback: FallbackView | undefined): string | undefined {
  if (!fallback || fallback.used) return undefined;
  return `${limitPhrase(fallback.limit)} when this began, but the fallback wasn't used: ${fallback.reason ?? "it couldn't be used."}`;
}

/**
 * The heads-up line on the next activity's row (AC-FALLBACK-04; mockup 3).
 *
 *   forecastLine({ choice, limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95 })
 *   // "Or on Codex · GPT Sol 6.2 · extra high, if Claude Code is still at or above 95% when it launches."
 */
export function forecastLine(forecast: ModelView["forecast"]): string | undefined {
  if (!forecast) return undefined;
  const still = forecast.limit.percent === undefined ? `${forecast.limit.agent} still reports ${forecast.limit.label}` : `${forecast.limit.agent} is still at or above ${forecast.threshold}%`;
  return `Or on ${choiceLine(forecast.choice)}, if ${still} when it launches.`;
}

/**
 * The card's and phase detail's account of an activity that started on the fallback
 * (AC-FALLBACK-03; mockup 3): which limit read what against which threshold when it began,
 * what the first choice was, and that it finishes on the agent it started on.
 *
 *   fallbackStory(fallback, "phase", "Codex")
 *   // { heading: "This phase started on the fallback", body: "Claude Code's weekly limit was at 97% when the phase began, at or above your 95% threshold. The first choice was Claude Code · Fable 5.2 · high, which you chose. The phase finishes on Codex." }
 */
export function fallbackStory(fallback: FallbackView | undefined, noun: string, agent: string | undefined): { heading: string; body: string } | undefined {
  if (!fallback?.used) return undefined;
  const limit = fallback.limit.percent === undefined ? `${limitPhrase(fallback.limit)} when the ${noun} began` : `${limitPhrase(fallback.limit)} when the ${noun} began, at or above your ${fallback.threshold}% threshold`;
  const first = fallback.first ? ` The first choice was ${choiceLine(fallback.first)}${fallback.from === "changed" ? ", which you chose" : ""}.` : "";
  return { heading: `This ${noun} started on the fallback`, body: `${limit}.${first}${agent ? ` The ${noun} finishes on ${agent}.` : ""}` };
}
