// The requirements plan, as the screens show it (Kiln Requirements Stages AC-PLAN-01, AC-PLAN-03
// to 05, AC-PLAN-07, AC-STAGE-03, AC-MODEL-01, AC-MODEL-03, AC-MODEL-04): where the plan came from
// and when the method was last updated, what holds while it is read or when it can't be, the
// notice after a method update, and each stage with its skill, stop, model, Change and the
// remembered and unmatched choices. The engine side is proved in src/requirements/plan.integration.test.ts.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { expect, it } from "vitest";
import type { RequirementsRow, RequirementsView, Snapshot } from "../../../src/engine/snapshot.js";
import { runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import RequirementsPlan from "../components/RequirementsPlan.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();
const choice = (model: string, effort = "high") => ({ agentId: "claude_code" as const, agent: "Claude Code", model, modelName: model.charAt(0).toUpperCase() + model.slice(1), effort });
const row = (key: string, title: string, change: Partial<RequirementsRow> = {}): RequirementsRow => ({ key, title, skill: key.split("#")[0]!, state: "planned", model: { state: "will_run_on", choice: choice("fable"), from: "model_defaults", change: { available: true } }, ...change });
const view = (change: Partial<RequirementsView> = {}): RequirementsView => ({
  origin: { kind: "brief", path: "source-material/count-boxes", title: "Count boxes", files: ["source-material/count-boxes/count-boxes-brief.md"], commit: "a".repeat(40), committedAt: "2026-11-27T13:00:00Z" },
  plan: { status: "read", agent: "Claude Code", methodUpdatedAt: "2026-11-19T15:00:00Z", readAt: "2026-11-27T13:01:00Z", canReadAgain: true },
  rows: [
    row("prd-writing-standards#1", "Write the PRD", { state: "next" }),
    row("autonomous-prd-refinement#1", "Refine the PRD", { stop: "early" }),
    row("kiln:early", "Early stakeholder review", { skill: "stakeholder-review-package", addedByKiln: "early" }),
    row("review-technical-design#1", "Design review", { model: { state: "will_run_on", choice: choice("sonnet", "medium"), from: "saved", change: { available: true } } }),
    row("phase-split#1", "Phase plan", { stop: "final" }),
    { key: "build", title: "Build", state: "planned" },
  ],
  feedback: [],
  ...change,
});
const page = (requirements: RequirementsView, state: Snapshot["feature"]["state"] = "not_started", now = Date.parse("2026-11-27T13:00:40Z")) => {
  const base = runningSnapshot();
  return text(render(RequirementsPlan, { props: { snapshot: { ...base, feature: { ...base.feature, state }, requirements: requirements }, connected: true, now } }).body);
};

it("shows every stage from the installed method with its skill, model and Change, the stops marked, then the build", () => {
  const shown = page(view());
  expect(shown).toContain("Requirements plan 5 stages · Each stage runs on the model shown");
  expect(shown).toContain("Read from the Enso Method installed on this computer, last updated Nov 19. Kiln keeps no list of its own");
  expect(shown).toContain("Read again");
  expect(shown).toMatch(/R1 Write the PRD prd-writing-standards Claude Code · Fable · high Change Next/);
  expect(shown).toMatch(/Refine the PRD autonomous-prd-refinement .* Kiln waits for you here R3 Early stakeholder review stakeholder-review-package Added by Kiln/);
  expect(shown).toMatch(/Design review review-technical-design Claude Code · Sonnet · medium Saved for every PRD Change/);
  expect(shown).toMatch(/Phase plan .* Kiln stops here, before the build B Build/);
  expect(shown).not.toContain("What Kiln already knows");
});

it("says the plan is being read and for how long, and what holds whatever it turns out to be", () => {
  const shown = page(view({ plan: { status: "reading", agent: "Claude Code", readingSince: "2026-11-27T13:00:00Z", canReadAgain: false }, rows: [{ key: "build", title: "Build", state: "planned" }] }));
  expect(shown).toContain("Reading the plan from the Enso Method installed here · 40 seconds so far");
  expect(shown).toContain("Start doesn't wait for it");
  expect(shown).toContain("It waits for you at the early stakeholder review, once the PRD is refined, unless you turn that off.");
  expect(shown).toContain("It always stops at the final stakeholder review");
  expect(shown).toContain("It never starts the build by itself.");
  expect(shown).not.toContain("Read again");
});

it("says why the plan couldn't be read, that Start still works, and offers Read again", () => {
  const shown = page(view({ plan: { status: "failed", agent: "Claude Code", failure: { reason: "The session reading the plan ended without returning a plan.", at: "2026-11-27T13:21:00Z" }, canReadAgain: true }, rows: [{ key: "build", title: "Build", state: "planned" }] }));
  expect(shown).toContain("Kiln couldn't read the plan. The session reading the plan ended without returning a plan. Read again");
  expect(shown).toContain("Start still works.");
  expect(shown).toContain("It never starts the build by itself.");
});

it("shows what a method update changed, done stages with their time and commit, the running stage, and a saved choice that no longer applies", () => {
  const shown = page(view({
    notice: { at: "2026-11-27T19:10:00Z", methodUpdatedAt: "2026-11-27T19:08:00Z", changes: ["No longer in the plan: Design review, Refine the design.", "New in the plan: Review and refine the design.", "The plan has 5 stages where it had 6."] },
    rows: [
      row("prd-writing-standards#1", "Write the PRD", { state: "done", startedAt: "2026-11-27T18:00:00Z", finishedAt: "2026-11-27T18:12:00Z", pushedSha: "7c2e4f1aaaaaaaa", model: { state: "ran_on", choice: choice("fable") } }),
      row("technical-design-writing-standards#1", "Technical design", { state: "running", startedAt: "2026-11-27T19:10:00Z", model: { state: "running_on", choice: choice("fable") } }),
      row("design-review-and-refinement#1", "Review and refine the design", { savedChoiceUnmatched: { skill: "review-technical-design" }, model: { state: "will_run_on", choice: choice("opus"), from: "model_defaults", change: { available: true } } }),
      { key: "build", title: "Build", state: "planned" },
    ],
  }), "implementing", Date.parse("2026-11-27T19:28:00Z"));
  expect(shown).toContain("The plan changed at 2:10 PM The Enso Method was updated on this computer Nov 27, 2:08 PM. No longer in the plan: Design review, Refine the design. New in the plan: Review and refine the design. The plan has 5 stages where it had 6. Nothing already done is affected");
  expect(shown).toContain("Requirements plan 1 of 3 done");
  expect(shown).toMatch(/Write the PRD .* Ran on Claude Code · Fable · high Took 12 min · Pushed 7c2e4f1 Done/);
  expect(shown).toMatch(/Technical design .* Running on Claude Code · Fable · high Started 2:10 PM · 18 min Running/);
  expect(shown).toContain("A choice saved for review-technical-design no longer applies, since the plan no longer runs it. This stage runs on its default.");
});

it("shows the Fallback tag on the requirements stage that used it (AC-MODEL-06)", () => {
  const shown = page(view({ rows: [
    row("prd-writing-standards#1", "Write the PRD", { state: "done", model: {
      state: "ran_on", choice: choice("fable"), fallback: { used: true, limit: { agent: "Codex", label: "Weekly", percent: 97 }, threshold: 95 },
    } }),
  ] }), "implementing");
  expect(shown).toContain("Ran on Claude Code · Fable · high Fallback");
});

it("names the requirements stage running and where Kiln stops next in the header", async () => {
  const { headerState } = await import("../lib/progress.js");
  const base = runningSnapshot();
  const running = view({ rows: [row("prd-writing-standards#1", "Write the PRD", { state: "done" }), row("autonomous-prd-refinement#1", "Refine the PRD", { state: "running", stop: "early" }), row("kiln:early", "Early stakeholder review", { addedByKiln: "early" }), { key: "build", title: "Build", state: "planned" }] });
  const header = headerState({ ...base, feature: { ...base.feature, state: "implementing" }, requirements: running }, true, new Date("2026-11-27T19:28:00Z"));
  expect(header).toMatchObject({ kind: "implementing", label: "Running Refine the PRD", facts: ["1 of 3 requirements stages done", "Kiln stops next at the early review"] });
});
