// What the plan rows and the card say about each activity's tier and model (Kiln Phase Model
// Tiers AC-TIER-02, AC-PICK-02, AC-KEEP-01; mockups 1, 2 and 5).

import type { ChoiceView, ModelView, TierView } from "../../../src/engine/activity-models.js";
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
