// The plan rows, the card and Documents found with each activity's tier and model (Kiln Phase
// Model Tiers AC-TIER-02, AC-PICK-02, AC-PICK-06, AC-DEFAULT-04, AC-KEEP-01; mockups 1, 2 and 5).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { ModelView } from "../../../src/engine/activity-models.js";
import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { documentsFoundSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { choiceLine, rowModelLine, tierCountsLine, tierExplanation } from "../lib/models.js";
import DocumentsFound from "./DocumentsFound.svelte";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const documentsFound = (snapshot: Snapshot) => strip(render(DocumentsFound, { props: { snapshot, config: { token: "t", base: "" }, connected: true, now: RUNNING_NOW } }).body);

const choice = (agent: "Claude Code" | "Codex", modelName: string, effort?: string) => ({ agentId: agent === "Codex" ? "codex" as const : "claude_code" as const, agent, model: modelName.toLowerCase(), modelName, ...(effort ? { effort } : {}) });
const OPUS: ModelView = { state: "will_run_on", choice: choice("Claude Code", "Opus 5.5", "medium"), from: "model_defaults" };

describe("what a row says", () => {
  it("names the choice by agent, model as its agent reports it, and effort", () => {
    expect(choiceLine(choice("Claude Code", "Opus 5.5", "medium"))).toBe("Claude Code · Opus 5.5 · medium");
    expect(choiceLine(choice("Claude Code", "Haiku 5.5"))).toBe("Claude Code · Haiku 5.5");
  });

  it("follows AC-PICK-02's table", () => {
    expect(rowModelLine(OPUS, false)).toBe("Claude Code · Opus 5.5 · medium");
    expect(rowModelLine(OPUS, true)).toBe("Will run on Claude Code · Opus 5.5 · medium");
    expect(rowModelLine({ ...OPUS, state: "running_on" }, true)).toBe("Running on Claude Code · Opus 5.5 · medium");
    expect(rowModelLine({ ...OPUS, state: "ran_on" }, true)).toBe("Ran on Claude Code · Opus 5.5 · medium");
    expect(rowModelLine({ state: "none_recorded" }, true)).toBe("No model recorded");
  });

  it("explains each tag as AC-TIER-02's table says", () => {
    expect(tierExplanation({ value: "demanding", reason: "AC-REF-04 requires one refund when the provider retries." })).toEqual({ heading: "Why this phase is demanding", body: "AC-REF-04 requires one refund when the provider retries.", source: "From the phase document's Model tier line." });
    expect(tierExplanation({ value: "mechanical" })).toEqual({ heading: "Why this phase is mechanical", body: "The phase document's Model tier line gives no reason.", source: "From the phase document's Model tier line." });
    expect(tierExplanation({ value: "standard", reason: "ignored" }).body).toBe("Each phase document rates how capable a model its build needs. Standard is the usual rating, and the model for it is set in Model defaults.");
    expect(tierExplanation({ value: "not_rated" }).body).toBe("This phase document has no Model tier line, so Kiln treats the phase as standard.");
  });

  it("counts the tiers in Documents found's delivery panel, leaving out a tier with none", () => {
    expect(tierCountsLine({ demanding: 1, standard: 2, mechanical: 1, notRated: 1 })).toBe("1 demanding, 2 standard, 1 mechanical, 1 not rated.");
    expect(tierCountsLine({ demanding: 0, standard: 3, mechanical: 0, notRated: 0 })).toBe("3 standard.");
  });
});

/** The running sample with tiers and models on its rows, as the engine sends them. */
function tiered(): Snapshot {
  const snapshot = runningSnapshot();
  const model: Record<string, ModelView> = {
    "1": { state: "ran_on", choice: choice("Claude Code", "Opus 5.5", "medium") },
    "2a": { state: "ran_on", choice: choice("Claude Code", "Fable 5.2", "high") },
    "2b": { state: "running_on", choice: choice("Claude Code", "Opus 5.5", "medium") },
    "3": { state: "will_run_on", choice: choice("Claude Code", "Sonnet 5.5", "high"), from: "model_defaults" },
    "4": { state: "will_run_on", choice: choice("Codex", "GPT-6-Astra", "high"), from: "model_defaults", claudeCodeMissing: true },
  };
  const tiers: Record<string, PhaseView["tier"]> = { "1": { value: "standard" }, "2a": { value: "demanding", reason: "Money moves on retries." }, "2b": { value: "standard" }, "3": { value: "mechanical", reason: "Repeats phase 1's builder." }, "4": { value: "not_rated" } };
  snapshot.phases = snapshot.phases.map(row => row.state === "split" ? row : { ...row, tier: tiers[row.id], model: model[row.id] } as PhaseView);
  snapshot.activities = [...snapshot.phases, { id: "planned-delivery-audit", kind: "delivery_audit", title: "Delivery audit", file: "", state: "planned", plannedActivity: true, finishedByPerson: false, model: { state: "will_run_on", choice: choice("Claude Code", "Opus 5.5", "high"), from: "model_defaults" } }, { id: "planned-pull-request", kind: "final_delivery", title: "Pull request", file: "", state: "planned", plannedActivity: true, finishedByPerson: false, model: { state: "will_run_on", choice: choice("Claude Code", "Opus 5.5", "high"), from: "model_defaults" } }];
  snapshot.current = { ...snapshot.current!, tier: { value: "standard" }, choice: choice("Claude Code", "Opus 5.5", "medium") };
  return snapshot;
}

describe("the running plan (AC-TIER-02, AC-PICK-02)", () => {
  it("tags every phase with its tier and says what each row ran on, runs on or will run on", () => {
    const words = text(running(tiered()));
    // Each tag is followed by its explanation's text, which the page hides until the control is used.
    expect(words).toMatch(/Return intake Standard What standard means [^]*? phase-1-return-intake\.md Ran on Claude Code · Opus 5\.5 · medium 52m/);
    expect(words).toMatch(/Card refunds Demanding Why this phase is demanding Money moves on retries\. From the phase document's Model tier line\. phase-2a-card-refunds\.md Ran on Claude Code · Fable 5\.2 · high 48m/);
    expect(words).toMatch(/Store credit Standard What standard means [^]*? phase-2b-store-credit\.md Running on Claude Code · Opus 5\.5 · medium 49m/);
    expect(words).toMatch(/Returns dashboard Mechanical Why this phase is mechanical [^]*? phase-3-returns-dashboard\.md Will run on Claude Code · Sonnet 5\.5 · high Planned/);
    expect(words).toMatch(/Restock check-in Not rated What not rated means This phase document has no Model tier line, so Kiln treats the phase as standard\. phase-4-restock-check-in\.md Will run on Codex · GPT-6-Astra · high Claude Code isn't installed, so this runs on its Codex choice\./);
  });

  it("puts a planned Delivery audit and pull request row after the last row, each on the Audits choice", () => {
    const words = text(running(tiered()));
    expect(words).toMatch(/Planned DA Delivery audit Will run on Claude Code · Opus 5\.5 · high Planned PR Pull request Will run on Claude Code · Opus 5\.5 · high Planned Claude account/);
    expect(running(tiered())).toMatch(/>PR<\/span>/);
  });

  it("offers Change on a Delivery audit and a Test audit row that hasn't started, and on the pull request row only where the snapshot gives it one (AC-OTHER-01; Kiln Model Modes AC-ROW-01)", () => {
    const snapshot = tiered();
    const audits: ModelView = { state: "will_run_on", choice: choice("Claude Code", "Opus 5.5", "high"), from: "model_defaults", change: { available: true } };
    // A finished run's pull request row carries no change: only the merge and a plan push could still take the choice.
    const noChange: ModelView = { state: "will_run_on", choice: choice("Claude Code", "Opus 5.5", "medium"), from: "model_defaults" };
    const planned = (id: string, kind: PhaseView["kind"], title: string): PhaseView => ({ id, kind, title, file: "", state: "planned", plannedActivity: true, finishedByPerson: false, model: kind === "final_delivery" ? noChange : audits });
    snapshot.activities = [...snapshot.phases, planned("planned-delivery-audit", "delivery_audit", "Delivery audit"), planned("planned-test-audit", "test_audit", "Test audit"), planned("planned-pull-request", "final_delivery", "Pull request")];
    const page = running(snapshot);
    const rowOf = (id: string) => text(page.split(`data-phase="${id}"`)[1]!.split("</li>")[0]!);
    expect(rowOf("planned-delivery-audit")).toMatch(/Delivery audit Will run on Claude Code · Opus 5\.5 · high Change/);
    expect(rowOf("planned-test-audit")).toMatch(/Test audit Will run on Claude Code · Opus 5\.5 · high Change/);
    expect(rowOf("planned-pull-request")).not.toContain("Change");
  });

  it("keeps the explanation out of sight until the information control is pointed at, focused or pressed", () => {
    const page = running(tiered());
    // The explanation is in the page for the control to show, styled hidden until hover, focus or press.
    expect(page).toMatch(/<button type="button" class="info[^"]*" aria-label="Why this phase is demanding" aria-expanded="false"/);
    expect(page).toMatch(/role="tooltip" class="explanation[^"]*"><span class="heading[^"]*">Why this phase is mechanical<\/span><span class="body[^"]*">Repeats phase 1's builder\.<\/span><span class="source[^"]*">From the phase document's Model tier line\.<\/span>/);
    // Rows that aren't phases carry no tag.
    expect(page.match(/data-tier=/g)).toHaveLength(5);
  });

  it("gives the current card the row's choice and the phase's tier", () => {
    expect(text(running(tiered()))).toContain("Claude Code · Opus 5.5 · medium effort Standard phase · started");
  });

  it("drops the run's settings' Model and effort for one line saying models are chosen for each phase (AC-KEEP-01)", () => {
    const words = text(running(tiered()));
    expect(words).toContain("Settings for this PRD A phase that has started keeps the model it started with. Models Chosen for each phase");
    expect(words).not.toMatch(/Agent fixed for this PRD|Model and effort Opus/);
  });
});

describe("Documents found's plan (AC-PICK-01, AC-PICK-06, AC-KEEP-01)", () => {
  function found(change: (phases: NonNullable<NonNullable<Snapshot["documents"]>["plan"]>["phases"]) => void, settings: Partial<Snapshot["settings"]> = {}): string {
    const base = documentsFoundSnapshot({ settings });
    const plan = structuredClone(base.documents!.plan!);
    change(plan.phases);
    return documentsFound(documentsFoundSnapshot({ documents: { plan }, settings }));
  }

  it("shows each phase's tag and the model it will run on, with no Will run on before Start", () => {
    const words = text(found(phases => { for (const phase of phases) if (!phase.splitInto) Object.assign(phase, { tier: { value: phase.id === "2a" ? "demanding" : "standard", ...(phase.id === "2a" ? { reason: "Money." } : {}) }, model: phase.id === "2a" ? { state: "will_run_on", choice: choice("Claude Code", "Fable 5.2", "high") } : OPUS }); }));
    expect(words).toContain("1 Return intake Standard What standard means");
    expect(words).toMatch(/2a Card refunds Demanding Why this phase is demanding Money\. From the phase document's Model tier line\. Claude Code · Fable 5\.2 · high/);
    expect(words).not.toContain("Will run on");
  });

  it("carries a choice that can't be used on its row, and holds Start with the reason", () => {
    const problem = "Phase 2a runs on Claude Code · Fable · high from Model defaults (Demanding row): Claude Code doesn't offer Fable on this account. Change the Demanding row in Model defaults.";
    const page = found(phases => { const phase = phases.find(one => one.id === "2a")!; Object.assign(phase, { tier: { value: "demanding" }, model: { state: "will_run_on", choice: choice("Claude Code", "Fable", "high"), problem: "Claude Code doesn't offer Fable on this account." } }); }, { models: { ...documentsFoundSnapshot().settings.models, tiers: { demanding: 1, standard: 0, mechanical: 0, notRated: 3 }, problem } });
    expect(text(page)).toContain("Claude Code · Fable · high Claude Code doesn't offer Fable on this account.");
    expect(text(page)).toContain(problem);
    expect(page).toMatch(/<button type="button" class="start[^"]*"[^>]* disabled/);
  });
});
