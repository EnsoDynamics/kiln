// A row's Change offers both agents (Kiln Phase Model Tiers AC-PICK-03: "the agent, model and
// effort choices Kiln offers today"): with Claude Code and Codex installed, the editor a row's
// Change opens lists both agents, shows the chosen agent's own models and efforts, and a phase
// changed to Codex reads as Codex on its row, Changed by you with Use the default.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { AgentView, PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { claudeAgent, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import ModelEditor from "../components/ModelEditor.svelte";
import { rowEditorAgents } from "../lib/models.js";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** Codex installed beside Claude Code, listing the one model the Codex stand-in offers. */
const CODEX: AgentView = { agentId: "codex", agent: "Codex", installed: true, pending: false, neededBy: { activities: ["2b"], fallbackOnly: false }, models: [{ value: "gpt-6.1-sol", displayName: "GPT-6.1-Sol", efforts: ["high", "low"], defaultEffort: "low" }] };
const bothAgents = (): Snapshot["agents"] => [claudeAgent(undefined), CODEX];

const editor = (agentId: string, value: string, effort: string) => strip(render(ModelEditor, { props: { agents: rowEditorAgents(bothAgents()), agentId, value, effort, label: "Phase 2b model", onchange: () => {} } }).body);

describe("a row's Change with both agents installed (AC-PICK-03)", () => {
  it("offers both agents, with the chosen agent's own models and efforts", () => {
    expect(rowEditorAgents(bothAgents()).map(agent => [agent.agentId, agent.agent, agent.options.map(option => option.name)])).toEqual([
      ["claude_code", "Claude Code", ["Opus 5.5", "Fable 5.1", "Sonnet 5.5"]],
      ["codex", "Codex", ["GPT-6.1-Sol"]],
    ]);
    const onCodex = editor("codex", "gpt-6.1-sol", "low");
    // Both agents are offered as radio choices, Codex the checked one.
    expect([...onCodex.matchAll(/<input type="radio"[^>]*value="([^"]+)"[^>]*>/g)].map(match => [match[1], /checked/.test(match[0])])).toEqual([["claude_code", false], ["codex", true]]);
    expect(text(onCodex)).toBe("Agent Claude Code Codex Model GPT-6.1-Sol Effort High Low");
    expect([...onCodex.matchAll(/<option value="([^"]+)"/g)].map(match => match[1])).toEqual(["gpt-6.1-sol", "high", "low"]);
    // The editor opens on the row's own choice: GPT-6.1-Sol at low.
    expect([...onCodex.matchAll(/<option value="([^"]+)"[^>]*selected/g)].map(match => match[1])).toEqual(["gpt-6.1-sol", "low"]);
    // On Claude Code, the same editor lists Claude Code's models and not Codex's.
    expect(text(editor("claude_code", "sonnet", "high"))).toBe("Agent Claude Code Codex Model Opus 5.5 Fable 5.1 Sonnet 5.5 Effort Low Medium High Extra high Max");
  });

  it("shows a phase changed to Codex as Codex on its row, Changed by you with Use the default", () => {
    const snapshot = runningSnapshot();
    snapshot.agents = bothAgents();
    snapshot.phases = snapshot.phases.map(row => row.id === "3" ? { ...row, model: { state: "will_run_on", choice: { agentId: "codex", agent: "Codex", model: "gpt-6.1-sol", modelName: "GPT-6.1-Sol", effort: "low" }, from: "changed", change: { available: true }, useDefault: true } } as PhaseView : row);
    const page = strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
    const row = text(/<li data-phase="3"[\s\S]*?<\/li>/.exec(page)?.[0] ?? "");
    expect(row).toContain("Will run on Codex · GPT-6.1-Sol · low Changed by you · Use the default Change");
  });
});
