// Each agent the run can use (Kiln Phase Model Tiers AC-AGENTS-01 to 04): which ones are needed,
// which one is in use, and which one a given activity launches on next.
import type { AgentView, Snapshot } from "../../../src/engine/snapshot.js";
import type { AgentId } from "../../../src/state/records.js";

/** An agent an activity runs on, or a fallback names. */
export function needed(agent: AgentView): boolean {
  return agent.neededBy.activities.length > 0 || agent.neededBy.fallbackOnly;
}

export function neededAgents(snapshot: Snapshot): AgentView[] {
  return snapshot.agents.filter(needed);
}

/** The agent the current activity runs on, else the next one's; else the first needed or installed one. */
export function inUseAgent(snapshot: Snapshot): AgentView | undefined {
  return snapshot.agents.find((agent) => agent.inUse) ?? neededAgents(snapshot)[0] ?? snapshot.agents[0];
}

/** The in-use agent's account first, then each other needed agent's (AC-AGENTS-03). */
export function accountsShown(snapshot: Snapshot): { agent: AgentView; account: NonNullable<AgentView["account"]> }[] {
  const inUse = inUseAgent(snapshot);
  const ordered = [...neededAgents(snapshot)].sort((a, b) => Number(b === inUse) - Number(a === inUse));
  return ordered.flatMap((agent) => (agent.account ? [{ agent, account: agent.account }] : []));
}

/**
 * The agent an activity's next session launches on: its row's current choice, else the in-use agent.
 *
 *   activityAgent(snapshot, "2b") // { agentId: "codex", agent: "Codex" } when phase 2b's row runs on Codex
 */
export function activityAgent(snapshot: Snapshot, phaseId: string | undefined): { agentId: AgentId; agent: string } {
  const row = phaseId === undefined ? undefined : [...(snapshot.activities ?? []), ...snapshot.phases].find((one) => one.id === phaseId);
  const choice = row?.model?.choice;
  if (choice) return { agentId: choice.agentId, agent: choice.agent };
  const inUse = inUseAgent(snapshot);
  return inUse ? { agentId: inUse.agentId, agent: inUse.agent } : { agentId: "claude_code", agent: "Claude Code" };
}

/** Whether billing holds a launch on this agent: only Claude Code's billing restricts launches; Codex's is a summary. */
export function billingHolds(snapshot: Snapshot, agentId: AgentId): boolean {
  if (agentId !== "claude_code") return false;
  const billing = snapshot.agents.find((agent) => agent.agentId === agentId)?.billing;
  return !!billing && !billing.canLaunch;
}

/** "Claude" for Claude Code, else the agent's own name, as the account panel and switch-account copy say it. */
export function shortAgentName(agent: string): string {
  return agent === "Claude Code" ? "Claude" : agent;
}

/** The agents this run's sessions ran on, in plan order, else the in-use agent: "Claude Code and Codex". */
export function agentsThatRan(snapshot: Snapshot): string {
  const names = new Set<string>();
  for (const row of snapshot.activities ?? snapshot.phases) {
    const agent = row.details?.agent ?? (row.model?.state === "ran_on" || row.model?.state === "running_on" ? row.model.choice?.agent : undefined);
    if (agent) names.add(agent);
  }
  const list = names.size ? [...names] : [inUseAgent(snapshot)?.agent ?? "Claude Code"];
  return list.length === 1 ? list[0]! : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

/** The merge session's agent: the one it ran on, else its row's choice, else the in-use agent. */
export function mergeAgent(snapshot: Snapshot): string {
  const row = (snapshot.activities ?? snapshot.phases).find((one) => one.kind === "merge");
  return row?.details?.agent ?? row?.model?.choice?.agent ?? inUseAgent(snapshot)?.agent ?? "Claude Code";
}

/**
 * A stop's line naming where its choice came from and where to change it (Kiln Phase Model Tiers
 * AC-PICK-06), from the snapshot's `choiceSource`; a started activity's says what it started on.
 *
 *   choiceSourceLine("Model defaults. Change it in Model defaults.")  // "Chosen from Model defaults. Change it in Model defaults."
 *   choiceSourceLine("Started on Codex · GPT Sol, which it finishes on.")  // unchanged
 */
export function choiceSourceLine(source: string): string {
  if (source.startsWith("Started on ")) return source;
  // "The fallback, …" and "A change for this PRD." read on in lower case; "Model defaults" is a name.
  return `Chosen from ${/^(The|A) /.test(source) ? source.charAt(0).toLowerCase() + source.slice(1) : source}`;
}
