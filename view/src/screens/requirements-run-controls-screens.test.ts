// A running requirements run's controls, as the screens show them (Kiln Requirements Stages,
// Phase 8): the plan's source line kept while it is read again or after a read fails (AC-PLAN-03),
// both reviews' header with the review waited at and the PRD totals (AC-STAGE-03), Message Claude
// taking feedback over 4,000 characters (AC-TALK-01), and a stopped stage's Change, with its
// remember box, on Needs you (AC-MODEL-01, AC-MODEL-03, AC-MODEL-06). The engine side is proved
// in src/requirements/run-controls.integration.test.ts.
process.env.TZ = "America/New_York";

import { render } from "svelte/server";
import { expect, it } from "vitest";
import type { RequirementsRow, RequirementsView, Snapshot } from "../../../src/engine/snapshot.js";
import { handBackSnapshot, runningSnapshot } from "../../../src/test-support/sample-snapshots.js";
import RequirementsPlan from "../components/RequirementsPlan.svelte";
import LiveComposer from "../components/LiveComposer.svelte";
import ModelChanges from "../components/ModelChanges.svelte";
import { liveDraft } from "../lib/live-drafts.svelte.js";
import Requirements from "./Requirements.svelte";
import NeedsYou from "./NeedsYou.svelte";

const text = (markup: string) => markup.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").replace(/ ([.,])/g, "$1").trim();
const buttons = (markup: string) => [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map(match => text(match[1]!));
const choice = (model: string) => ({ agentId: "claude_code" as const, agent: "Claude Code", model, modelName: model.charAt(0).toUpperCase() + model.slice(1), effort: "high" });
const row = (key: string, title: string, change: Partial<RequirementsRow> = {}): RequirementsRow => ({ key, title, skill: key.split("#")[0]!, state: "planned", model: { state: "will_run_on", choice: choice("fable"), from: "model_defaults", change: { available: true } }, ...change });
const requirements = (change: Partial<RequirementsView> = {}): RequirementsView => ({
  origin: { kind: "brief", path: "source-material/count-boxes", title: "Count boxes", files: ["source-material/count-boxes/count-boxes-brief.md"], commit: "a".repeat(40), committedAt: "2026-11-27T13:00:00Z" },
  plan: { status: "read", agent: "Claude Code", methodUpdatedAt: "2026-11-19T15:00:00Z", readAt: "2026-11-27T13:01:00Z", canReadAgain: true },
  rows: [row("prd-writing-standards#1", "Write the PRD", { state: "done", pushedSha: "7c2e4f1aaaaaaaa" }), row("autonomous-prd-refinement#1", "Refine the PRD"), { key: "build", title: "Build", state: "planned" }],
  feedback: [],
  ...change,
});
const withRequirements = (view: RequirementsView, state: Snapshot["feature"]["state"] = "implementing"): Snapshot => {
  const base = runningSnapshot();
  return { ...base, feature: { ...base.feature, state, startedAt: "2026-11-27T13:00:00Z", timing: { runningMs: 95 * 60_000, waitingMs: 25 * 60_000, asOf: "2026-11-27T15:00:00Z" } }, requirements: view };
};

it("keeps where the shown plan came from while the plan is read again, and after a read fails (AC-PLAN-03)", () => {
  const plan = (status: RequirementsView["plan"]) => text(render(RequirementsPlan, { props: { snapshot: withRequirements(requirements({ plan: status })), connected: true, now: Date.parse("2026-11-27T13:00:40Z") } }).body);
  const source = "Read from the Enso Method installed on this computer, last updated Nov 19.";
  const installed = { status: "read", agent: "Claude Code", methodUpdatedAt: "2026-11-19T15:00:00Z", readAt: "2026-11-27T12:00:00Z", canReadAgain: true, methodVersion: "9.9.9" } as const;
  expect(plan(installed)).toContain(source);
  expect(plan(installed)).not.toContain(installed.methodVersion);
  const reading = plan({ status: "reading", agent: "Claude Code", methodUpdatedAt: "2026-11-19T15:00:00Z", readAt: "2026-11-27T12:00:00Z", readingSince: "2026-11-27T13:00:00Z", canReadAgain: false });
  expect(reading).toContain(source);
  expect(reading).toContain("Reading the plan from the Enso Method installed here · 40 seconds so far");
  const failed = plan({ status: "failed", agent: "Claude Code", methodUpdatedAt: "2026-11-19T15:00:00Z", readAt: "2026-11-27T12:00:00Z", failure: { reason: "The session reading the plan ended without returning a plan.", at: "2026-11-27T13:21:00Z" }, canReadAgain: true });
  expect(failed).toContain(source);
  expect(failed).toContain("Kiln couldn't read the plan.");
  // With no plan shown yet, there is no source to name.
  expect(plan({ status: "reading", agent: "Claude Code", methodUpdatedAt: "2026-11-19T15:00:00Z", readingSince: "2026-11-27T13:00:00Z", canReadAgain: false })).not.toContain(source);
});

it("names the review the run waits at in the header, with the PRD total line, at both reviews (AC-STAGE-03)", () => {
  for (const [kind, label] of [["early", "At the early stakeholder review"], ["final", "At the final stakeholder review"]] as const) {
    const review = { kind, file: "docs/prds/count-boxes/count-boxes-stakeholder-review.html", readySince: "2026-11-27T15:00:00Z", openAssumptions: 2, freshSessionCommand: "claude" };
    const snapshot = withRequirements(requirements({ review }), kind === "early" ? "early_review" : "final_review");
    const body = render(Requirements, { props: { snapshot, config: { base: "", token: "t" } as never, connected: true, now: Date.parse("2026-11-27T16:00:00Z") } }).body;
    const shown = text(body);
    expect(shown).toContain(label);
    expect(shown).toContain("1 of 2 requirements stages done");
    expect(shown).toContain("PRD total 1h 35m running · ");
    expect(buttons(body).filter(label => /^Pause (now|after)\b/i.test(label))).toEqual([]);
  }
});

it("offers a resumable requirements stage's reply, terminal command and Resume without pause controls (AC-STAGE-04)", () => {
  const snapshot = handBackSnapshot();
  const stop = snapshot.needsYou!;
  const key = "req-refinement";
  stop.phaseId = key;
  delete stop.phaseRecovery;
  snapshot.requirements = requirements();
  const body = render(NeedsYou, { props: { snapshot, now: Date.parse("2026-11-27T16:00:00Z") } }).body;
  expect(body).toMatch(/<textarea[^>]*maxlength="4000"/);
  expect(body).toContain(stop.resumeCommand);
  expect(buttons(body)).toContain("Resume");
  expect(buttons(body).filter(label => /^Pause (now|after)\b/i.test(label))).toEqual([]);
});

it("takes Message Claude over 4,000 characters to a requirements session as feedback a fresh session applies (AC-TALK-01)", () => {
  const target = { executionId: "e", activityId: "a", activityKey: "req-a", sessionId: "s", providerSessionId: "s", attemptId: "long" };
  liveDraft(target).text = "Reply: " + "z".repeat(4100);
  const reason = "Kiln sends this as feedback: this stage's session reads it at its next opportunity.";
  const markup = render(LiveComposer, { props: { view: { target, label: "Write the PRD", observedAt: "2026-11-27T15:00:00Z", available: true, reason: "", input: { available: true, reason, pending: 0, feedback: true } }, connected: true } }).body;
  expect(text(markup)).toContain("4,107 characters · Too long to send to this session: a fresh session applies it before the next stage");
  expect(markup).not.toMatch(/<button[^>]*disabled[^>]*>Send message/);
  // To a build session the live limit stands.
  const build = { ...target, activityKey: "1", attemptId: "build" };
  liveDraft(build).text = "z".repeat(4100);
  const refused = render(LiveComposer, { props: { view: { target: build, label: "Phase 1", observedAt: "2026-11-27T15:00:00Z", available: true, reason: "", input: { available: true, reason: "", pending: 0 } }, connected: true } }).body;
  expect(text(refused)).toContain("Over the message limit");
  expect(refused).toMatch(/<button[^>]*disabled[^>]*>Send message/);
});

it("offers a stopped stage's Change, with its remember box, on Needs you, first (AC-MODEL-01, AC-MODEL-03, AC-MODEL-06)", () => {
  const view = requirements({ rows: [
    row("prd-writing-standards#1", "Write the PRD", { state: "done", pushedSha: "7c2e4f1aaaaaaaa" }),
    row("autonomous-prd-refinement#1", "Refine the PRD", { state: "needs_you", activityId: "stopped" }),
    row("technical-design-writing-standards#1", "Technical design"),
    { key: "build", title: "Build", state: "planned" },
  ] });
  const shown = text(render(ModelChanges, { props: { snapshot: withRequirements(view, "needs_you"), phaseId: "req-stopped", connected: true } }).body);
  expect(shown).toMatch(/^Models Refine the PRD autonomous-prd-refinement Will run on Claude Code · Fable · high Change Technical design/);
  expect(shown).not.toContain("Write the PRD");
});
