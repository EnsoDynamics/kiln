// What the plan rows, the card and the phase detail say about the usage fallback (Kiln Phase
// Model Tiers AC-FALLBACK-03, AC-FALLBACK-04; mockups 3 and 5, state D).
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { FallbackView, ModelView } from "../../../src/engine/activity-models.js";
import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { handBackSnapshot, needsYouCrashedSnapshot, RUNNING_NOW, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import { fallbackNotUsedNote, fallbackStory, forecastLine, limitPhrase } from "../lib/models.js";
import NeedsYou from "./NeedsYou.svelte";
import PhaseDetail from "./PhaseDetail.svelte";
import PhaseHandoff from "./PhaseHandoff.svelte";
import Running from "./Running.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const detail = (snapshot: Snapshot, phaseId: string) => strip(render(PhaseDetail, { props: { snapshot, phaseId, connected: true, now: RUNNING_NOW, lastSeenAt: undefined } }).body);
const needsYou = (snapshot: Snapshot) => strip(render(NeedsYou, { props: { snapshot, now: RUNNING_NOW } }).body);
const handoff = (snapshot: Snapshot) => strip(render(PhaseHandoff, { props: { snapshot, now: RUNNING_NOW, page: { key: snapshot.needsYou!.phaseId, draft: "", choice: false, unsent: false } } }).body);
const running = (snapshot: Snapshot) => strip(render(Running, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);

const choice = (agent: "Claude Code" | "Codex", modelName: string, effort?: string) => ({ agentId: agent === "Codex" ? "codex" as const : "claude_code" as const, agent, model: modelName.toLowerCase(), modelName, ...(effort ? { effort } : {}) });
const FABLE = choice("Claude Code", "Fable 5.2", "high");
const SOL = choice("Codex", "GPT-6.2-Sol", "high");
const USED: FallbackView = { used: true, limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95, first: FABLE, from: "changed" };

describe("what the rows, card and phase detail say", () => {
  it("names the recorded limit, a window with its percent or a block without one", () => {
    expect(limitPhrase({ agent: "Claude Code", label: "Weekly", percent: 97 })).toBe("Claude Code's weekly limit was at 97%");
    expect(limitPhrase({ agent: "Claude Code", label: "5-hour window", percent: 100 })).toBe("Claude Code's 5-hour window was at 100%");
    expect(limitPhrase({ agent: "Codex", label: "ordinary usage blocked" })).toBe("Codex reported ordinary usage blocked");
  });

  it("tells how an activity started on the fallback: the limit against the threshold, the first choice, and where it finishes", () => {
    expect(fallbackStory(USED, "phase", "Codex")).toEqual({ heading: "This phase started on the fallback", body: "Claude Code's weekly limit was at 97% when the phase began, at or above your 95% threshold. The first choice was Claude Code · Fable 5.2 · high, which you chose. The phase finishes on Codex." });
    expect(fallbackStory({ ...USED, from: "model_defaults" }, "audit", "Codex")?.body).toContain("The first choice was Claude Code · Fable 5.2 · high. The audit finishes on Codex.");
    expect(fallbackStory({ ...USED, used: false, reason: "x" }, "phase", "Codex")).toBeUndefined();
  });

  it("says why the fallback wasn't used, and warns of the next launch", () => {
    expect(fallbackNotUsedNote({ used: false, limit: { agent: "Claude Code", label: "Weekly", percent: 96 }, threshold: 95, reason: "Codex isn't signed in." })).toBe("Claude Code's weekly limit was at 96% when this began, but the fallback wasn't used: Codex isn't signed in.");
    expect(fallbackNotUsedNote(USED)).toBeUndefined();
    expect(forecastLine({ choice: choice("Codex", "GPT-6.2-Sol", "extra high"), limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95 })).toBe("Or on Codex · GPT-6.2-Sol · extra high, if Claude Code is still at or above 95% when it launches.");
    expect(forecastLine({ choice: FABLE, limit: { agent: "Codex", label: "ordinary usage blocked" }, threshold: 95 })).toBe("Or on Claude Code · Fable 5.2 · high, if Codex still reports ordinary usage blocked when it launches.");
  });
});

/** The running sample: 2b started on the fallback, 3 next with the heads-up. */
function onTheFallback(): Snapshot {
  const snapshot = runningSnapshot();
  const model: Record<string, ModelView> = {
    "1": { state: "ran_on", choice: choice("Claude Code", "Opus 5.5", "medium") },
    "2a": { state: "ran_on", choice: choice("Claude Code", "Opus 5.5", "medium") },
    "2b": { state: "running_on", choice: SOL, fallback: USED },
    "3": { state: "will_run_on", choice: choice("Claude Code", "Sonnet 5.5", "high"), from: "model_defaults", forecast: { choice: SOL, limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95 } },
    "4": { state: "will_run_on", choice: choice("Claude Code", "Opus 5.5", "medium"), from: "model_defaults" },
  };
  snapshot.phases = snapshot.phases.map(row => row.state === "split" ? row : { ...row, model: model[row.id] } as PhaseView);
  snapshot.current = { ...snapshot.current!, choice: SOL, fallback: USED };
  return snapshot;
}

describe("the running plan with the fallback on (AC-FALLBACK-03, AC-FALLBACK-04)", () => {
  it("tags the row that started on the fallback, and puts the heads-up on the next one only", () => {
    const page = running(onTheFallback());
    const words = text(page);
    expect(words).toMatch(/Store credit [^]*?Running on Codex · GPT-6\.2-Sol · high Fallback/);
    expect(page.match(/data-fallback(="")?>Fallback/g)).toHaveLength(1);
    expect(words).toMatch(/Returns dashboard [^]*?Will run on Claude Code · Sonnet 5\.5 · high Or on Codex · GPT-6\.2-Sol · high, if Claude Code is still at or above 95% when it launches\./);
    expect(page.match(/data-forecast/g)).toHaveLength(1);
  });

  it("says on the card that the current activity started on the fallback", () => {
    expect(text(running(onTheFallback()))).toContain("This phase started on the fallback Claude Code's weekly limit was at 97% when the phase began, at or above your 95% threshold. The first choice was Claude Code · Fable 5.2 · high, which you chose. The phase finishes on Codex.");
  });

  it("shows the note on the current row whose launch kept its first choice", () => {
    const snapshot = onTheFallback();
    snapshot.phases = snapshot.phases.map(row => row.id === "2b" ? { ...row, model: { state: "running_on", choice: FABLE, fallback: { used: false, limit: { agent: "Claude Code", label: "Weekly", percent: 96 }, threshold: 95, reason: "Codex isn't signed in." } } } as PhaseView : row);
    snapshot.current = { ...snapshot.current!, choice: FABLE };
    delete snapshot.current.fallback;
    const words = text(running(snapshot));
    expect(words).toContain("Running on Claude Code · Fable 5.2 · high Claude Code's weekly limit was at 96% when this began, but the fallback wasn't used: Codex isn't signed in.");
    expect(words).not.toContain("started on the fallback");
  });
});

describe("the phase detail keeps the fallback facts (AC-FALLBACK-03) and the stop names where its choice came from (AC-PICK-06)", () => {
  it("tells how a finished phase started on the fallback, or why the fallback wasn't used", () => {
    const snapshot = runningSnapshot();
    const withFallback = (fallback: FallbackView): Snapshot => ({ ...snapshot, phases: snapshot.phases.map(row => row.id === "1" ? { ...row, model: { state: "ran_on", choice: SOL, ...(fallback.used ? { fallback } : {}) }, details: { ...row.details!, fallback } } as PhaseView : row) });
    expect(text(detail(withFallback(USED), "1"))).toContain("This phase started on the fallback Claude Code's weekly limit was at 97% when the phase began, at or above your 95% threshold. The first choice was Claude Code · Fable 5.2 · high, which you chose. The phase finishes on Codex.");
    const kept = text(detail(withFallback({ used: false, limit: { agent: "Claude Code", label: "Weekly", percent: 96 }, threshold: 95, reason: "Codex isn't signed in." }), "1"));
    expect(kept).toContain("Claude Code's weekly limit was at 96% when this began, but the fallback wasn't used: Codex isn't signed in.");
    expect(kept).not.toContain("started on the fallback");
  });

  it("shows the stopped session's Chosen from line", () => {
    const snapshot = needsYouCrashedSnapshot();
    const stopped = { ...snapshot, needsYou: { ...snapshot.needsYou!, choiceSource: "The fallback, from Model defaults' Fallback column. Change it in Model defaults." } } as Snapshot;
    expect(text(detail(stopped, stopped.needsYou!.phaseId))).toContain("Chosen from The fallback, from Model defaults' Fallback column. Change it in Model defaults.");
  });

  it("names on Needs you and the stopped-phase page where the stopped session's choice came from and where to change it", () => {
    const snapshot = needsYouCrashedSnapshot();
    const stoppedOn = (choiceSource: string) => ({ ...snapshot, needsYou: { ...snapshot.needsYou!, choiceSource } } as Snapshot);
    // The line names the choice that could not run: the stopped session's agent, model and effort.
    const fallback = { ...stoppedOn("The fallback, from Model defaults' Fallback column. Change it in Model defaults."), needsYou: { ...stoppedOn("").needsYou!, choiceSource: "The fallback, from Model defaults' Fallback column. Change it in Model defaults.", agent: "Codex", model: "GPT-6.2-Sol", effort: "xhigh" } } as Snapshot;
    expect(text(needsYou(fallback))).toContain("This launch was on Codex · GPT-6.2-Sol · xhigh, chosen from the fallback, from Model defaults' Fallback column. Change it in Model defaults.");
    const handBack = handBackSnapshot();
    expect(text(handoff({ ...handBack, needsYou: { ...handBack.needsYou!, choiceSource: "The fallback, from Model defaults' Fallback column. Change it in Model defaults.", agent: "Claude Code", model: "Sonnet 5.5", effort: "high" } } as Snapshot))).toContain("This launch was on Claude Code · Sonnet 5.5 · high, chosen from the fallback, from Model defaults' Fallback column. Change it in Model defaults.");
    const defaults = { ...snapshot, needsYou: { ...snapshot.needsYou!, choiceSource: "Model defaults. Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings.", agent: "Claude Code", model: "Opus 5.5", effort: "high" } } as Snapshot;
    expect(text(needsYou(defaults))).toContain("This launch was on Claude Code · Opus 5.5 · high, chosen from Model defaults. Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings.");
    const changed = { ...snapshot, needsYou: { ...snapshot.needsYou!, choiceSource: "A change for this PRD. Change it on its row in the phase plan.", agent: "Codex", model: "GPT-6.2-Sol", effort: undefined } } as Snapshot;
    expect(text(needsYou(changed))).toContain("This launch was on Codex · GPT-6.2-Sol, chosen from a change for this PRD. Change it on its row in the phase plan.");
    // The restart layout, for a stop found at launch, names the same choice.
    const restart = { ...snapshot, needsYou: { ...snapshot.needsYou!, case: "could_not_start", launchFailure: { ran: "claude", folder: "~/devel/acme-shop-kiln/customer-returns", sentence: "Claude Code exited before it responded.", error: "exit 1", at: snapshot.needsYou!.stoppedAt }, choiceSource: "The fallback, from Model defaults' Fallback column. Change it in Model defaults.", agent: "Claude Code", model: "Sonnet 5.5", effort: "high" } } as unknown as Snapshot;
    expect(text(needsYou(restart))).toContain("This launch was on Claude Code · Sonnet 5.5 · high, chosen from the fallback, from Model defaults' Fallback column. Change it in Model defaults.");
    // A started activity's stop names what it started on, with no place to change it.
    expect(text(needsYou(stoppedOn("Started on Codex · GPT-6.2-Sol · high, which it finishes on.")))).toContain("Started on Codex · GPT-6.2-Sol · high, which it finishes on.");
    expect(text(needsYou(snapshot))).not.toMatch(/Chosen from|This launch was on/);
  });
});

