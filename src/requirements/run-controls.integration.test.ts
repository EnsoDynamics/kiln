// A running requirements run's controls, plan and stage models (Kiln Requirements Stages, Phase 8):
// a plan read that lands mid-session shows at once, a billing hold on a stage is rechecked as its
// Needs you is and pushes, a review with no plan runs under the key and skill its row shows, and a
// PRD's first plan says a saved choice no longer applies. Real engine and disposable Git; the
// scripted stand-in plays each session, the plan read included.
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { PRD } from "../test-support/fixture-documents.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { git } from "../test-support/git-repositories.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { modelDefaultsPath } from "../models/model-defaults.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { planPath, readPlanFile } from "./plan.js";

let h: Harness;
afterEach(async () => { await h?.cleanup(); });

const folder = "count-boxes";
const dir = `docs/prds/${folder}`;
const prd = `${dir}/${folder}-prd.md`;
const review = `${dir}/${folder}-stakeholder-review.html`;

type Stage = [skill: string, title: string, reaches?: string[]];
const planBlock = (stages: Stage[]) => "```kiln-plan\n" + JSON.stringify({ kilnPlan: 1, stages: stages.map(([skill, title, reaches]) => ({ skill, title, reaches: reaches ?? [] })), reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } }) + "\n```";
const TODAY: Stage[] = [
  ["prd-writing-standards", "Write the PRD"], ["autonomous-prd-refinement", "Refine the PRD", ["prd_refined"]],
  ["technical-design-writing-standards", "Technical design"], ["review-technical-design", "Design review"],
  ["autonomous-design-refinement", "Refine the design", ["design_ready"]], ["phase-split", "Phase plan", ["requirements_finished"]],
];
const report = (ran: string[], next: string, milestones: string[], reaches: string[] = []) => ({ result: "```kiln-report\n" + JSON.stringify({
  kilnReport: 1, ran: ran.map(skill => ({ skill, title: skill })), finished: true,
  next: { kind: next === "build" ? "build" : "requirements", skill: next, title: next, reaches },
  milestones: milestones.map(name => ({ name, by: "this_session" })), prdDirectory: dir,
}) + "\n```" });
const view = () => buildSnapshot(h.engine).requirements!;

it("shows a plan read that finishes during the first session at once, with every entry planned from the first (AC-PLAN-05)", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-controls-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder,
    planSessions: [{ actions: [{ touch: join(signals, "reading") }, { waitForFile: join(signals, "read") }, { result: "The stages:\n" + planBlock(TODAY) }, { exit: 0 }] }],
    sessions: [{ actions: [{ touch: join(signals, "drafting") }, { waitForFile: join(signals, "go") }, { result: "Not finished." }, { exit: 0 }] }] });
  await h.engine.refreshAgents();
  await waitFor(() => existsSync(join(signals, "reading")), 20_000);
  // Start doesn't wait for the plan: the first session runs as the Next stage row.
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(join(signals, "drafting")), 20_000);
  expect(view().plan.status).toBe("reading");
  writeFileSync(join(signals, "read"), "");
  // The read lands while that session runs, and the PRD, which showed no plan, takes it at once.
  await waitFor(() => view().plan.status === "read", 20_000);
  expect(h.engine.record.requirements!.planFingerprint).toBeDefined();
  expect(view().plan.canReadAgain).toBe(true);
  expect(view().rows.map(row => [row.key, row.state])).toEqual([
    ["kiln:next", "running"], ["prd-writing-standards#1", "planned"], ["autonomous-prd-refinement#1", "planned"], ["kiln:early", "planned"],
    ["technical-design-writing-standards#1", "planned"], ["review-technical-design#1", "planned"], ["autonomous-design-refinement#1", "planned"],
    ["phase-split#1", "planned"], ["kiln:final", "planned"], ["build", "planned"],
  ]);
  writeFileSync(join(signals, "go"), "");
  await h.engine.settled();
});

it("rechecks a billing hold on a stage by Everything committed, pushes and moves on, never by phase documents (AC-STAGE-02, AC-STAGE-04)", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    // The draft leaves a file uncommitted: Needs you, as a phase stops.
    { actions: [{ write: { path: prd, content: PRD } }, { commit: "draft" }, { write: { path: `${dir}/notes.md`, content: "Notes.\n" } }, report(["prd-writing-standards"], "autonomous-prd-refinement", []), { exit: 0 }] },
    { actions: [{ result: "Not finished." }, { exit: 0 }] },
  ] });
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "failed", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const key = h.engine.stoppedPhaseKey()!;
  expect(key).toMatch(/^req-/);
  // A changed credential holds Resume before the session runs again: a resume hold on a session with runs.
  h.env.ANTHROPIC_AUTH_TOKEN = "changed-credential-canary";
  expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.billing?.hold).toMatchObject({ phaseKey: key });
  expect(h.claudeCalls()).toHaveLength(1);
  // Check again with the work still uncommitted names it, on the hold.
  expect(await h.engine.checkAgain(recoveryRequest(h.engine))).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.billing?.hold?.checks?.find(check => check.name === "Everything committed")).toMatchObject({ passed: false, facts: [expect.stringContaining("notes.md")] });
  expect(h.engine.record.phases[key]!.doneAt).toBeUndefined();
  // The person commits it; Check again finds everything committed, pushes and moves on.
  git(h.sandbox, h.engine.worktreePath, "add", "-A");
  git(h.sandbox, h.engine.worktreePath, "commit", "-q", "-m", "notes");
  const head = git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim();
  expect(await h.engine.checkAgain(recoveryRequest(h.engine))).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.phases[key]!.doneAt).toBeDefined();
  expect(h.engine.record.requirements!.stages[0]!.pushedSha).toBe(head);
  expect(git(h.sandbox, h.origin, "rev-parse", `refs/heads/${h.engine.record.settings.featureBranch}`).trim()).toBe(head);
  // The session's report said it finished its stage, so Kiln records it from that report.
  expect(h.engine.record.requirements!.standing).toMatchObject({ next: { skill: "autonomous-prd-refinement" } });
  // The next stage's launch meets the same unapproved billing: a launch hold on a stage that never ran.
  const next = `req-${h.engine.record.requirements!.stages[1]!.activityId}`;
  expect(h.engine.record.billing?.hold).toMatchObject({ phaseKey: next });
  expect(h.claudeCalls()).toHaveLength(1);
  // Check again there, with billing still unapproved and everything committed, moves on as a stage finished by hand does, without running a session or reading phase documents.
  expect(await h.engine.checkAgain(recoveryRequest(h.engine))).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.phases[next]!.doneAt).toBeDefined();
  expect(h.engine.latestSession(next)?.runs ?? []).toHaveLength(0);
  expect(h.engine.record.requirements!.standing).toMatchObject({ unknown: true });
  expect(h.claudeCalls()).toHaveLength(1);
  // A stage that ran nothing is no row of its own.
  expect(view().rows.filter(row => row.state === "done").map(row => row.key)).toEqual([h.engine.record.requirements!.stages[0]!.key]);
  // Once billing is approved, Check again at the next launch hold clears it and the stage launches.
  const third = `req-${h.engine.record.requirements!.stages[2]!.activityId}`;
  expect(h.engine.record.billing?.hold).toMatchObject({ phaseKey: third });
  await h.engine.billingCommand("approval", { executionId: h.engine.record.executionId, readingId: h.engine.billing.view.next!.readingId, approved: true });
  expect(await h.engine.checkAgain(recoveryRequest(h.engine))).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.claudeCalls()).toHaveLength(2);
  expect(h.engine.record.phases[third]!.doneAt).toBeUndefined();
});

it("carries a reply at Needs you into the new session of a stage whose session never got a response, as a phase's (AC-STAGE-04)", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    // Refused by a usage limit before any response.
    { actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] },
    { actions: [{ result: "Not finished." }, { exit: 0 }] },
  ] });
  await h.engine.changeSettings({ resumeAfterUsageLimit: false });
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "failed", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const key = h.engine.stoppedPhaseKey()!;
  expect(key).toMatch(/^req-/);
  expect(h.engine.startedSessionOf(key)).toBeUndefined();
  // Work is left in the worktree, so Resume goes on in a new session, which is given the reply.
  writeFileSync(join(h.engine.worktreePath, "notes.md"), "Notes.\n");
  expect(await h.engine.resume({ ...recoveryRequest(h.engine), note: "Count crates as well." })).toMatchObject({ ok: true });
  await h.engine.settled();
  const call = h.claudeCalls()[1]!;
  expect(call.args).not.toContain("--resume");
  expect(call.prompt).toContain("Count crates as well.");
});

it("with no plan, runs the stop's review under the key and skill its row shows, with its Change and the choice remembered for that skill (AC-MODEL-01, AC-MODEL-03)", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-controls-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ write: { path: prd, content: PRD } }, { commit: "draft" }, report(["prd-writing-standards"], "autonomous-prd-refinement", []), { exit: 0 }] },
    // The refinement reaches the early stop, and its report names the method's review skill next.
    { actions: [{ touch: join(signals, "refining") }, { waitForFile: join(signals, "go") }, { write: { path: prd, content: PRD + "\nRefined.\n" } }, { commit: "refine" }, report(["autonomous-prd-refinement"], "stakeholder-review-package", ["prd_refined"], ["review_made"]), { exit: 0 }] },
    { actions: [{ write: { path: review, content: "<h1>Early review</h1>" } }, { commit: "review" }, { result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: "stakeholder-review-package", title: "Stakeholder review" }], finished: true }) + "\n```" }, { exit: 0 }] },
  ] });
  writeFileSync(modelDefaultsPath(h.env), JSON.stringify({ schemaVersion: 1, rows: {}, skills: { "stakeholder-review-package": { agentId: "claude_code", family: "sonnet", effort: "medium" } } }));
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "failed", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(join(signals, "refining")), 20_000);
  h.engine.pause();
  writeFileSync(join(signals, "go"), "");
  await h.engine.settled();
  expect(h.engine.record.pause.activeSince).toBeDefined();
  // The Next row is the early review, keyed as its launch is, with the report's skill and the choice saved for it.
  const next = () => view().rows.find(row => row.state === "next")!;
  expect(next()).toMatchObject({ key: "kiln:early", title: "Early stakeholder review", skill: "stakeholder-review-package", model: { from: "saved", choice: { model: "sonnet", effort: "medium" }, change: { available: true } } });
  // A Change on that row is the one the launch uses.
  expect(await h.engine.changeStageModel("kiln:early", { agentId: "claude_code", model: "opus", effort: "high" }, false)).toEqual({ ok: true });
  expect(next().model).toMatchObject({ from: "changed", choice: { model: "opus", effort: "high" } });
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("early");
  const launched = h.engine.record.requirements!.stages[2]!;
  expect(launched).toMatchObject({ key: "kiln:early", task: "review", expected: { skill: "stakeholder-review-package" } });
  const args = h.claudeCalls()[2]!.args;
  expect(args[args.indexOf("--model") + 1]).toBe("opus");
  // Once launched, the review row keeps the skill, so its Change can remember it for every PRD.
  expect(view().rows.find(row => row.key === "kiln:early")).toMatchObject({ skill: "stakeholder-review-package", state: "done" });
});

it("says on a PRD's first plan that a saved choice no longer applies, when the method changed after it was saved (AC-MODEL-04)", async () => {
  const UPDATED: Stage[] = [
    ["prd-writing-standards", "Write the PRD"], ["autonomous-prd-refinement", "Refine the PRD", ["prd_refined"]],
    ["technical-design-writing-standards", "Technical design"], ["design-review-and-refinement", "Review and refine the design", ["design_ready"]],
    ["phase-split", "Phase plan", ["requirements_finished"]],
  ];
  const signals = mkdtempSync(join(tmpdir(), "kiln-controls-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, planSessions: [{ actions: [{ waitForFile: join(signals, "read") }, { result: planBlock(UPDATED) }, { exit: 0 }] }], sessions: [] });
  // The computer's earlier plan, from the method as it stood when the choice was saved, still in use within the last 30 days.
  const root = h.engine.planRoot;
  const used = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  writeJsonAtomically(planPath(root), { ...readPlanFile(root), plans: { claude_code: { "earlier-method": { methodUpdatedAt: "2026-10-01T00:00:00Z", readAt: "2026-10-01T00:00:00Z", usedAt: used, stages: TODAY.map(([skill, title, reaches]) => ({ skill, title, reaches: reaches ?? [] })), reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } } } } });
  writeFileSync(modelDefaultsPath(h.env), JSON.stringify({ schemaVersion: 1, rows: {}, skills: { "review-technical-design": { agentId: "claude_code", family: "sonnet", effort: "medium" } } }));
  h.engine.modelChoicesChanged();
  writeFileSync(join(signals, "read"), "");
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "read", 20_000);
  const row = (key: string) => view().rows.find(one => one.key === key)!;
  // The stage that replaced the saved skill runs on its default and says so; a stage the earlier plan had says nothing.
  expect(row("design-review-and-refinement#1")).toMatchObject({ savedChoiceUnmatched: { skill: "review-technical-design" }, model: { from: "model_defaults" } });
  expect(row("technical-design-writing-standards#1").savedChoiceUnmatched).toBeUndefined();
  expect(view().notice).toBeUndefined();
});
