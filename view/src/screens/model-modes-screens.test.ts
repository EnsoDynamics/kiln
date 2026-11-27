// What the plan rows, the card, the Models card and the model lines say while one model runs
// everything or the fallback is used for everything, and where the Preflight and pull request rows
// offer Change (Kiln Model Modes AC-MODE-02, AC-MODE-03, AC-WHEN-02, AC-WHEN-03, AC-ROW-01;
// mockup 7, states B and E).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { FallbackView, ModelView } from "../../../src/engine/activity-models.js";
import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { documentsFoundSnapshot, needsYouCrashedSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { fallbackLine, fallbackStory, modelsLine, noFallbackNote, rowModelTarget, thresholdInForce, tierExplanation } from "../lib/models.js";
import DocumentsFound from "./DocumentsFound.svelte";
import NeedsYou from "./NeedsYou.svelte";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const documentsFound = (snapshot: Snapshot) => strip(render(DocumentsFound, { props: { snapshot, config: { token: "t", base: "" }, connected: true, now: RUNNING_NOW } }).body);
const needsYou = (snapshot: Snapshot) => strip(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
/** A row's words, from its `data-phase` attribute to the end of its list item. */
const rowText = (page: string, id: string) => text(`<li data-phase="${id}"${page.split(`data-phase="${id}"`)[1]?.split("</li>")[0] ?? ""}`);

const choice = (agent: "Claude Code" | "Codex", modelName: string, effort?: string) => ({ agentId: agent === "Codex" ? "codex" as const : "claude_code" as const, agent, model: modelName.toLowerCase(), modelName, ...(effort ? { effort } : {}) });
const FABLE = choice("Claude Code", "Fable 5.2", "high");
const ASTRA = choice("Codex", "GPT Astra", "high");
/** A decision, or a row before any launch, on the fallback because it is used for everything: no limit, no threshold. */
const FOR_EVERYTHING: FallbackView = { used: true, forEverything: true, first: FABLE, from: "model_defaults" };
type Models = Snapshot["settings"]["models"];
const settings = (snapshot: Snapshot, over: Partial<Models>): Snapshot => { snapshot.settings.models = { ...snapshot.settings.models, ...over }; return snapshot; };
const EVERYTHING: Partial<Models> = { fallback: { use: "everything", threshold: 95, enabled: true } };
const ONE_MODEL: Partial<Models> = { mode: "one_model", oneModel: { agentId: "claude_code", agent: "Claude Code", family: "opus", familyName: "Opus", modelName: "Opus 5.5", effort: "high" } };

describe("an activity that started on its fallback because the fallback is used for everything (AC-WHEN-03; mockup 7, state E)", () => {
  it("gives the setting as the reason, in place of a limit reading, with the first choice and where it finishes", () => {
    expect(fallbackStory(FOR_EVERYTHING, "phase", "Codex")).toEqual({ heading: "This phase started on the fallback", body: "The fallback is set to be used for everything, so the phase began on it without reading usage. The first choice was Claude Code · Fable 5.2 · high. The phase finishes on Codex." });
    expect(fallbackStory({ ...FOR_EVERYTHING, from: "changed" }, "audit", "Codex")?.body).toBe("The fallback is set to be used for everything, so the audit began on it without reading usage. The first choice was Claude Code · Fable 5.2 · high, which you chose. The audit finishes on Codex.");
  });

  it("shows that on the card, and the Fallback tag on its row", () => {
    const snapshot = runningSnapshot();
    snapshot.phases = snapshot.phases.map(row => row.id === "2b" ? { ...row, model: { state: "running_on", choice: ASTRA, from: "model_defaults", fallback: FOR_EVERYTHING } } as PhaseView : row);
    snapshot.current = { ...snapshot.current!, choice: ASTRA, fallback: FOR_EVERYTHING };
    const page = running(snapshot);
    expect(text(page.split("data-fallback-story")[1]!.split("</div>")[0]!)).toContain("This phase started on the fallback The fallback is set to be used for everything, so the phase began on it without reading usage. The first choice was Claude Code · Fable 5.2 · high. The phase finishes on Codex.");
    expect(text(page)).not.toContain("at or above your");
    expect(rowText(page, "2b")).toContain("Running on Codex · GPT Astra · high Fallback");
  });
});

describe("the plan before Start while the fallback is used for everything (AC-WHEN-02, AC-WHEN-03; mockup 7, state B)", () => {
  function plan(): Snapshot {
    const snapshot = settings(documentsFoundSnapshot(), EVERYTHING);
    const rows: Record<string, ModelView> = {
      "1": { state: "will_run_on", choice: choice("Codex", "GPT Sol", "high"), from: "model_defaults", fallback: { ...FOR_EVERYTHING, first: choice("Claude Code", "Opus 5.5", "medium") }, change: { available: true } },
      "2a": { state: "will_run_on", choice: ASTRA, from: "model_defaults", fallback: FOR_EVERYTHING, change: { available: true } },
      // Changed by the person to a model on the fallback's own agent: it has no fallback and says so.
      "3": { state: "will_run_on", choice: choice("Codex", "GPT Sol", "low"), from: "changed", noFallback: true, change: { available: true }, useDefault: true },
    };
    snapshot.documents!.plan!.phases = snapshot.documents!.plan!.phases.map(phase => rows[phase.id] ? { ...phase, model: rows[phase.id] } : phase);
    snapshot.preflight = { planned: { before: "1", model: { state: "will_run_on", choice: choice("Codex", "GPT Sol", "medium"), from: "model_defaults", fallback: { ...FOR_EVERYTHING, first: choice("Claude Code", "Opus 5.5", "medium") }, change: { available: true } } } };
    return snapshot;
  }

  it("shows each row's fallback as its model choice, with the Fallback tag and its Change", () => {
    const page = documentsFound(plan());
    expect(rowText(page, "1")).toContain("Codex · GPT Sol · high Fallback Change");
    expect(rowText(page, "2a")).toContain("Codex · GPT Astra · high Fallback Change");
    expect(rowText(page, "1")).not.toContain("Claude Code");
  });

  it("says a row has no fallback, and why, where the model the person picked is on its fallback's agent", () => {
    const row = rowText(documentsFound(plan()), "3");
    expect(row).toContain("Codex · GPT Sol · low Changed by you · Use the default Change No fallback: the model you picked is on the same agent as its fallback.");
    expect(row).not.toContain(" Fallback ");
  });

  it("offers Change on the Preflight row, for this PRD's Preflight and pull request choice", () => {
    const page = documentsFound(plan());
    const preflight = text(page.split("preflight-row")[1]!.split("</li>")[0]!);
    expect(preflight).toContain("PF Preflight checks access and stops, then goes straight on Codex · GPT Sol · medium Fallback Change");
  });

  it("drops AC-FALLBACK-04's warning line and the over-threshold marks, and says the fallback is used for everything", () => {
    const snapshot = plan();
    const account = snapshot.agents[0]!.account!;
    snapshot.agents[0]!.account = { ...account, limits: account.limits.map(limit => ({ ...limit, overThreshold: true as const })) };
    const words = text(documentsFound(snapshot));
    expect(words).not.toContain("above your");
    expect(words).not.toMatch(/Or on .* if .* when it launches/);
    expect(words).toContain("If usage is nearly out The fallback is used for everything Every phase runs on its fallback for now. Change it in Model defaults .");
  });

  it("explains a row with no fallback because Claude Code isn't installed, in place of the usual note that it runs on Codex", () => {
    expect(noFallbackNote({ noFallback: true, claudeCodeMissing: true })).toBe("No fallback: Claude Code isn't installed, so this already runs on its Codex choice.");
    expect(noFallbackNote({ noFallback: true })).toBe("No fallback: the model you picked is on the same agent as its fallback.");
    expect(noFallbackNote({})).toBeUndefined();
    const snapshot = plan();
    snapshot.documents!.plan!.phases = snapshot.documents!.plan!.phases.map(phase => phase.id === "1" ? { ...phase, model: { state: "will_run_on", choice: choice("Codex", "GPT Sol", "high"), from: "model_defaults", claudeCodeMissing: true, noFallback: true } } : phase);
    const row = rowText(documentsFound(snapshot), "1");
    expect(row).toContain("No fallback: Claude Code isn't installed, so this already runs on its Codex choice.");
    expect(row).not.toContain("so this runs on its Codex choice.");
  });
});

describe("the model lines (AC-MODE-02, AC-MODE-03, AC-WHEN-03, AC-ROW-01)", () => {
  it("say one model runs everything, name it, and leave out the Audits line unless the audits' choice was changed for this PRD", () => {
    expect(modelsLine({ mode: "one_model", oneModel: ONE_MODEL.oneModel! })).toBe("One model for everything: Claude Code · Opus 5.5 · high");
    expect(modelsLine({ mode: "recommended", oneModel: ONE_MODEL.oneModel! })).toBe("Chosen for each phase");
    const words = text(documentsFound(settings(documentsFoundSnapshot(), ONE_MODEL)));
    expect(words).toContain("Models One model for everything: Claude Code · Opus 5.5 · high Every phase, both audits, the preflight, and the pull request, merge and push sessions.");
    expect(words).not.toContain("Audits Claude Code");
    expect(words).not.toContain("Not a tier: they check the whole PRD.");
    const changed = settings(documentsFoundSnapshot(), { ...ONE_MODEL, audits: { choice: choice("Claude Code", "Sonnet 5.5", "low"), changedByYou: true, change: { available: true }, useDefault: true } });
    expect(text(documentsFound(changed))).toContain("Audits Claude Code · Sonnet 5.5 · low Changed by you · Use the default Change The delivery audit and the test audit. Not a tier: they check the whole PRD.");
  });

  it("say one model has no fallback, whatever the fallback setting says, and mark no limit as above a threshold", () => {
    expect(fallbackLine({ mode: "one_model", fallback: { use: "threshold", threshold: 90 } })).toEqual({ value: "Wait for the limit", help: "One model runs everything, and it has no fallback. Change it in" });
    expect(thresholdInForce({ mode: "one_model", fallback: { use: "threshold", threshold: 90, enabled: true } })).toBeUndefined();
    expect(thresholdInForce({ mode: "recommended", fallback: { use: "everything", threshold: 90, enabled: true } })).toBeUndefined();
    expect(thresholdInForce({ mode: "recommended", fallback: { use: "never", threshold: 90, enabled: false } })).toBeUndefined();
    expect(thresholdInForce({ mode: "recommended", fallback: { use: "threshold", threshold: 90, enabled: true } })).toBe(90);
    const snapshot = settings(documentsFoundSnapshot(), { ...ONE_MODEL, fallback: { use: "threshold", threshold: 10, enabled: true } });
    const account = snapshot.agents[0]!.account!;
    snapshot.agents[0]!.account = { ...account, limits: account.limits.map(limit => ({ ...limit, overThreshold: true as const })) };
    const words = text(documentsFound(snapshot));
    expect(words).not.toContain("above your");
    expect(words).toContain("If usage is nearly out Wait for the limit One model runs everything, and it has no fallback. Change it in Model defaults .");
  });

  it("show the audits' fallback on the Audits line while the fallback is used for everything, and say when a PRD has its own settings", () => {
    const snapshot = settings(documentsFoundSnapshot(), { ...EVERYTHING, source: "prd", audits: { choice: choice("Codex", "GPT Sol", "extra high"), changedByYou: false, change: { available: true }, fallback: { ...FOR_EVERYTHING, first: choice("Claude Code", "Opus 5.5", "high") } } });
    const words = text(documentsFound(snapshot));
    expect(words).toContain("Audits Codex · GPT Sol · extra high Fallback Change The delivery audit and the test audit. Not a tier: they check the whole PRD.");
    expect(words).toContain("This PRD has its own settings.");
    expect(text(documentsFound(documentsFoundSnapshot()))).not.toContain("This PRD has its own settings.");
  });

  it("say where a standard phase's model is set: Model defaults, this PRD's own settings, or the one model", () => {
    expect(tierExplanation({ value: "standard" }, { mode: "recommended", source: "defaults" }).body).toBe("Each phase document rates how capable a model its build needs. Standard is the usual rating, and the model for it is set in Model defaults.");
    expect(tierExplanation({ value: "standard" }, { mode: "recommended", source: "prd" }).body).toBe("Each phase document rates how capable a model its build needs. Standard is the usual rating, and the model for it is set in this PRD's own settings.");
    expect(tierExplanation({ value: "standard" }, { mode: "one_model", source: "defaults" }).body).toBe("Each phase document rates how capable a model its build needs. Standard is the usual rating. One model runs everything for now, and it is set in Model defaults.");
    expect(tierExplanation({ value: "standard" }, { mode: "one_model", source: "prd" }).body).toContain("it is set in this PRD's own settings.");
  });
});

describe("Change on the Preflight and pull request rows (AC-ROW-01)", () => {
  it("targets the Preflight and pull request choice from a Preflight or pull request row, whatever phase id it carries", () => {
    expect(rowModelTarget({ id: "pr", kind: "final_delivery" })).toBe("preflight_pr");
    expect(rowModelTarget({ id: "planned-pull-request", kind: "final_delivery", plannedActivity: true })).toBe("preflight_pr");
    expect(rowModelTarget({ id: "preflight-7f3a", kind: "preflight" })).toBe("preflight_pr");
    expect(rowModelTarget({ id: "preflight-planned", kind: "preflight" })).toBe("preflight_pr");
    expect(rowModelTarget({ id: "planned-test-audit", kind: "test_audit", plannedActivity: true })).toBe("audits");
    expect(rowModelTarget({ id: "3" })).toEqual({ phase: "3" });
    // The merge and a plan push run once the run is complete: their rows offer no Change.
    expect(rowModelTarget({ id: "merge", kind: "merge" })).toBeUndefined();
    expect(rowModelTarget({ id: "plan-push-op-1", kind: "plan_push" })).toBeUndefined();
  });

  it("offers it on the pull request row of a run underway, and Use the default once changed", () => {
    const snapshot = runningSnapshot();
    snapshot.phases.push({ id: "planned-pull-request", kind: "final_delivery", title: "Pull request", file: "", state: "planned", plannedActivity: true, finishedByPerson: false, model: { state: "will_run_on", choice: choice("Claude Code", "Sonnet 5.5", "low"), from: "changed", change: { available: true }, useDefault: true } });
    expect(rowText(running(snapshot), "planned-pull-request")).toContain("Will run on Claude Code · Sonnet 5.5 · low Changed by you · Use the default Change");
  });

  it("lists the planned Preflight row and the pull request row on a stop's Models card, each with its Change", () => {
    const snapshot = needsYouCrashedSnapshot();
    const model: ModelView = { state: "will_run_on", choice: choice("Claude Code", "Opus 5.5", "medium"), from: "model_defaults", change: { available: true } };
    snapshot.preflight = { planned: { before: "end", model } };
    snapshot.phases.push({ id: "planned-pull-request", kind: "final_delivery", title: "Pull request", file: "", state: "planned", plannedActivity: true, finishedByPerson: false, model });
    // Needs you shows no phase plan: these rows are the Models card's.
    const card = needsYou(snapshot);
    expect(rowText(card, "preflight-planned")).toContain("PF Preflight Will run on Claude Code · Opus 5.5 · medium Change");
    expect(rowText(card, "planned-pull-request")).toContain("PR Pull request Will run on Claude Code · Opus 5.5 · medium Change");
  });
});
