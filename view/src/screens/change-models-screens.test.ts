// Changing models on the page (Kiln Phase Model Tiers AC-PICK-03, AC-OTHER-01, AC-DEFAULT-02,
// AC-FALLBACK-01; mockups 1, 2 and 4): a row that hasn't started offers Change, a changed one is
// marked Changed by you with Use the default, a started or finished one offers neither, a row whose
// Change is unavailable says why, and the run's settings carry the model lines with the Model
// defaults link, the Audits choice and the fallback.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { ModelView } from "../../../src/engine/activity-models.js";
import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { needsYouCrashedSnapshot, RUNNING_NOW, runningSnapshot, USAGE_LIMIT_NOW, waitingSnapshot } from "../../../src/test-support/sample-snapshots.js";
import NeedsYou from "./NeedsYou.svelte";
import Waiting from "./Waiting.svelte";
import { effortWord, fallbackLine, rowEditorAgents, startingEffort } from "../lib/models.js";
import { modelDefaultsPath, routeOf } from "../lib/router.svelte.js";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const choice = (modelName: string, effort: string) => ({ agentId: "claude_code" as const, agent: "Claude Code", model: modelName.split(" ")[0]!.toLowerCase(), modelName, effort });

function withModels(rows: Record<string, ModelView>, settings: Partial<Snapshot["settings"]["models"]> = {}): Snapshot {
  const snapshot = runningSnapshot();
  snapshot.phases = snapshot.phases.map(row => rows[row.id] ? { ...row, model: rows[row.id] } as PhaseView : row);
  snapshot.settings.models = { ...snapshot.settings.models, ...settings };
  return snapshot;
}
const rowText = (page: string, id: string) => text(/<li data-phase="([^"]+)"[\s\S]*?<\/li>/g.exec(page.slice(page.indexOf(`data-phase="${id}"`) - 10))?.[0] ?? "");

describe("a row's Change (AC-PICK-03)", () => {
  it("marks Changed by you on a row with no Change: a changed phase that started, and the pull request row on a kept choice (AC-PICK-03, AC-KEEP-02; mockup 3)", () => {
    const snapshot = withModels({
      "2b": { state: "running_on", choice: { agentId: "codex", agent: "Codex", model: "gpt-6.2-sol", modelName: "GPT-6.2-Sol", effort: "high" }, from: "changed", fallback: { used: true, limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95 } },
    });
    snapshot.phases.push({ id: "pr", kind: "final_delivery", title: "Pull request", file: "pull request session", state: "planned", finishedByPerson: false, model: { state: "will_run_on", choice: choice("Sonnet 5.5", "max"), from: "changed" } });
    const page = running(snapshot);
    expect(rowText(page, "2b")).toContain("Running on Codex · GPT-6.2-Sol · high Fallback Changed by you");
    expect(rowText(page, "2b")).not.toContain("Use the default");
    expect(rowText(page, "2b")).not.toContain("Change ");
    expect(rowText(page, "pr")).toContain("Will run on Claude Code · Sonnet 5.5 · max Changed by you");
    expect(rowText(page, "pr")).not.toContain("Use the default");
  });

  it("offers Change on a row that hasn't started, Changed by you with Use the default once changed, and neither once started", () => {
    const page = running(withModels({
      "2b": { state: "running_on", choice: choice("Opus 5.5", "medium") },
      "3": { state: "will_run_on", choice: choice("Sonnet 5.5", "high"), from: "model_defaults", change: { available: true } },
      "4": { state: "will_run_on", choice: choice("Fable 5.2", "high"), from: "changed", change: { available: true }, useDefault: true },
    }));
    expect(rowText(page, "3")).toContain("Will run on Claude Code · Sonnet 5.5 · high Change");
    expect(rowText(page, "3")).not.toContain("Changed by you");
    expect(rowText(page, "4")).toContain("Will run on Claude Code · Fable 5.2 · high Changed by you · Use the default Change");
    expect(rowText(page, "2b")).toContain("Running on Claude Code · Opus 5.5 · medium");
    expect(rowText(page, "2b")).not.toMatch(/Change|Use the default/);
  });

  it("disables Change with the reason while a launch is under way", () => {
    const page = running(withModels({ "3": { state: "will_run_on", choice: choice("Sonnet 5.5", "high"), from: "model_defaults", change: { available: false, reason: "Phase 3 is launching or running on its saved choice. Change it once that session ends." } } }));
    expect(rowText(page, "3")).toContain("Change Phase 3 is launching or running on its saved choice. Change it once that session ends.");
    expect(page).toMatch(/<button[^>]*disabled[^>]*>Change<\/button>/);
  });
});

describe("a stopped activity's row (AC-PICK-03; mockup 5, state E)", () => {
  it("shows the stopped phase's row with Change on Needs you while it hasn't started, and nothing once it has", () => {
    const snapshot = needsYouCrashedSnapshot();
    const id = snapshot.needsYou!.phaseId;
    const at = (model: ModelView) => { const copy = structuredClone(snapshot); copy.phases = copy.phases.map(row => row.id === id ? { ...row, model } as PhaseView : row); return text(strip(render(NeedsYou, { props: { snapshot: copy, now: RUNNING_NOW } }).body)); };
    expect(at({ state: "will_run_on", choice: choice("Fable 5.2", "high"), from: "model_defaults", change: { available: true } })).toMatch(new RegExp(`${id} .* Will run on Claude Code · Fable 5\\.2 · high Change`));
    expect(at({ state: "running_on", choice: choice("Fable 5.2", "high") })).not.toContain("Will run on Claude Code · Fable 5.2 · high Change");
    // Every other row that hasn't started is changeable there too, and so is the Audits choice.
    const words = (() => { const copy = structuredClone(snapshot); copy.phases = copy.phases.map(row => row.id === "4" ? { ...row, model: { state: "will_run_on", choice: choice("Sonnet 5.5", "high"), from: "model_defaults", change: { available: true } } } as PhaseView : row); return text(strip(render(NeedsYou, { props: { snapshot: copy, now: RUNNING_NOW } }).body)); })();
    expect(words).toMatch(/Models .*Will run on Claude Code · Sonnet 5\.5 · high Change/);
    expect(words).toContain("Audits Claude Code · Opus 5.5 · high Change The preflight and the pull request session use it too.");
  });
});

describe("the waiting page's Models card (AC-PICK-03, AC-OTHER-01)", () => {
  it("offers Change on every row that hasn't started and the Audits line, and leaves the card out once the run is complete", () => {
    const snapshot = waitingSnapshot();
    const id = snapshot.waiting!.phaseId;
    snapshot.phases = snapshot.phases.map(row => row.id === id ? { ...row, model: { state: "will_run_on", choice: choice("Opus 5.5", "medium"), from: "model_defaults", change: { available: true } } } as PhaseView : row);
    const page = (shown: Snapshot) => text(strip(render(Waiting, { props: { snapshot: shown, now: USAGE_LIMIT_NOW } }).body));
    expect(page(snapshot)).toMatch(/Models .*Will run on Claude Code · Opus 5\.5 · medium Change/);
    expect(page(snapshot)).toContain("Audits Claude Code · Opus 5.5 · high Change The preflight and the pull request session use it too.");
    const done = structuredClone(snapshot); done.feature.completedAt = "2026-10-17T18:00:00Z";
    expect(page(done)).not.toContain("The preflight and the pull request session use it too.");
  });
});

describe("the run's settings (AC-DEFAULT-02, AC-OTHER-01, AC-FALLBACK-01)", () => {
  it("say models are chosen for each phase with a Model defaults link, show the Audits choice with Change, and the fallback", () => {
    const page = running(withModels({}, { audits: { choice: choice("Sonnet 5.5", "low"), changedByYou: true, change: { available: true }, useDefault: true }, fallback: { enabled: true, threshold: 90 } }));
    const words = text(page);
    expect(words).toContain("Models Chosen for each phase Change any phase that hasn't started, in the phase plan. Model defaults");
    expect(words).toContain("Audits Claude Code · Sonnet 5.5 · low Changed by you · Use the default Change The preflight and the pull request session use it too.");
    expect(words).toContain("If usage is nearly out Use the fallback at 90% Model defaults");
    expect(page).toMatch(/<a href="[^"]*\/model-defaults"[^>]*>Model defaults<\/a>/);
    // The table itself appears only on its own page.
    expect(words).not.toContain("First choice");
  });
});

describe("the editor and the page's route", () => {
  it("starts an editor on an effort the choice offers, and names efforts as a person reads them", () => {
    expect(startingEffort({ efforts: ["low", "medium", "high"] }, "max")).toBe("high");
    expect(startingEffort({ efforts: ["low", "medium"], defaultEffort: "medium" }, undefined)).toBe("medium");
    expect(startingEffort({ efforts: [] }, "high")).toBeUndefined();
    expect(effortWord("xhigh")).toBe("extra high");
    expect(fallbackLine({ enabled: false, threshold: 95 })).toEqual({ value: "Wait for the limit", help: "No fallback is switched on. Set one up in" });
  });

  it("offers no choices on an agent whose model list can't be read", () => {
    const snapshot = runningSnapshot();
    const agents = rowEditorAgents([{ ...snapshot.agents[0]!, models: undefined as never, modelListError: "Couldn’t load Claude Code’s models." }]);
    expect(agents).toEqual([{ agentId: "claude_code", agent: "Claude Code", options: [], problem: "Couldn’t load Claude Code’s models." }]);
  });

  it("puts Model defaults beneath the PRD's view, so Back returns to the PRD", () => {
    expect(modelDefaultsPath("/customer-returns")).toBe("/customer-returns/model-defaults");
    expect(routeOf("/customer-returns/model-defaults", "/customer-returns")).toEqual({ screen: "model-defaults" });
    expect(routeOf("/customer-returns/phase/3", "/customer-returns")).toEqual({ screen: "phase", phaseId: "3" });
  });
});
