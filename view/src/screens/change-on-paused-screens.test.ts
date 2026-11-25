// Change on the paused pages (Kiln Phase Model Tiers AC-PICK-03): while the run is paused, after a
// phase (Paused) or by Pause now (PausedHold), each phase that hasn't started offers Change in the
// phase plan, a changed one is marked Changed by you with Use the default, and a started one offers
// neither.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import type { ModelView } from "../../../src/engine/activity-models.js";
import type { PhaseView, Snapshot } from "../../../src/engine/snapshot.js";
import { pausedHoldSnapshot, pausedSnapshot, RUNNING_NOW } from "../../../src/test-support/sample-snapshots.js";
import Paused from "./Paused.svelte";
import PausedHold from "./PausedHold.svelte";

const strip = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "");
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const choice = (modelName: string, effort: string) => ({ agentId: "claude_code" as const, agent: "Claude Code", model: modelName.split(" ")[0]!.toLowerCase(), modelName, effort });
/** The markup of the phase plan row `id`. */
const rowHtml = (page: string, id: string) => /<li data-phase="[^"]+"[\s\S]*?<\/li>/.exec(page.slice(page.indexOf(`<li data-phase="${id}"`)))?.[0] ?? "";
const changeButton = (html: string) => /<button[^>]*>Change<\/button>/.exec(html)?.[0];

function withModels(snapshot: Snapshot, rows: Record<string, ModelView>): Snapshot {
  snapshot.phases = snapshot.phases.map(row => rows[row.id] ? { ...row, model: rows[row.id] } as PhaseView : row);
  return snapshot;
}
const paused = (snapshot: Snapshot) => strip(render(Paused, { props: { snapshot, connected: true, now: RUNNING_NOW, lastSeenAt: RUNNING_NOW } }).body);
const held = (snapshot: Snapshot) => strip(render(PausedHold, { props: { snapshot, now: RUNNING_NOW, page: { key: "2b", draft: "", choice: false, unsent: false } } }).body);

describe("Change on the paused pages (AC-PICK-03)", () => {
  it("offers Change on Paused for each phase that hasn't started, marks a changed one, and offers nothing on a finished one", () => {
    // Paused after phase 2a: 2b is next and 3 planned, neither started; 1 ran.
    const page = paused(withModels(pausedSnapshot(), {
      "1": { state: "ran_on", choice: choice("Fable 5.1", "high") },
      "2b": { state: "will_run_on", choice: choice("Haiku 5.5", "low"), from: "changed", change: { available: true }, useDefault: true },
      "3": { state: "will_run_on", choice: choice("Opus 5.5", "medium"), from: "model_defaults", change: { available: true } },
    }));
    expect(text(rowHtml(page, "2b"))).toContain("Will run on Claude Code · Haiku 5.5 · low Changed by you · Use the default Change");
    expect(text(rowHtml(page, "3"))).toContain("Will run on Claude Code · Opus 5.5 · medium Change");
    expect(text(rowHtml(page, "3"))).not.toContain("Changed by you");
    // Change is pressable on the connected page.
    expect(changeButton(rowHtml(page, "2b"))).not.toMatch(/disabled/);
    expect(changeButton(rowHtml(page, "3"))).not.toMatch(/disabled/);
    expect(text(rowHtml(page, "1"))).toContain("Ran on Claude Code · Fable 5.1 · high");
    expect(changeButton(rowHtml(page, "1"))).toBeUndefined();
    expect(text(rowHtml(page, "1"))).not.toContain("Use the default");
  });

  it("offers Change on the Pause now paused page for each later phase that hasn't started, and none on the paused phase, which has", () => {
    // Paused in phase 2b by Pause now: 2b has started; 3 and 4 haven't.
    const page = held(withModels(pausedHoldSnapshot(), {
      "2b": { state: "running_on", choice: choice("Sonnet 5.5", "high"), from: "model_defaults" },
      "3": { state: "will_run_on", choice: choice("Opus 5.5", "medium"), from: "model_defaults", change: { available: true } },
      "4": { state: "will_run_on", choice: choice("Haiku 5.5", "low"), from: "changed", change: { available: true }, useDefault: true },
    }));
    expect(text(rowHtml(page, "3"))).toContain("Will run on Claude Code · Opus 5.5 · medium Change");
    expect(changeButton(rowHtml(page, "3"))).toBeDefined();
    expect(text(rowHtml(page, "4"))).toContain("Will run on Claude Code · Haiku 5.5 · low Changed by you · Use the default Change");
    expect(changeButton(rowHtml(page, "4"))).toBeDefined();
    expect(text(rowHtml(page, "2b"))).toContain("Running on Claude Code · Sonnet 5.5 · high");
    expect(changeButton(rowHtml(page, "2b"))).toBeUndefined();
    expect(text(rowHtml(page, "2b"))).not.toContain("Use the default");
  });
});
