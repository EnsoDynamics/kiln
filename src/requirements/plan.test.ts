// The requirements plan's own rules (Kiln Requirements Stages, "The Requirements Plan" and
// "Rows"): the plan block, the method fingerprint and its date, keys, what a plan change says,
// where the cursor goes, Kiln's review rows and the plan-read lock.
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { methodOf, planChanges, planKeys, readPlanBlock, readPlanFile, remapCursor, takePlanLock, updatePlanFile, type PlanStage, type RequirementsPlan } from "./plan.js";
import { rememberedForm } from "../models/model-defaults-edit.js";
import { advanceCursor, plannedNext, plannedRows } from "./rows.js";
import { newRequirements, type StageReport } from "./stages.js";

const block = (value: unknown) => "Here it is.\n```kiln-plan\n" + JSON.stringify(value) + "\n```";
const stage = (skill: string, reaches: string[] = []): PlanStage => ({ skill, title: skill, reaches: reaches as PlanStage["reaches"] });
const plan = (stages: PlanStage[]): RequirementsPlan => ({ methodUpdatedAt: "2026-11-19T00:00:00Z", readAt: "2026-11-27T00:00:00Z", usedAt: "2026-11-27T00:00:00Z", stages, reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } });
const report = (ran: string[], next: string, kind: "requirements" | "build" = "requirements"): StageReport => ({ ran: ran.map(skill => ({ skill, title: skill })), finished: true, next: { kind, skill: next, title: next, reaches: [] }, milestones: [] });

it("reads only a plan block that names known milestones, every stage and the review skill", () => {
  const good = { kilnPlan: 1, stages: [{ skill: "prd-writing-standards", title: "Write the PRD", reaches: [] }], reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } };
  expect(readPlanBlock(block(good))).toMatchObject({ stages: [{ skill: "prd-writing-standards" }], reviewSkill: { skill: "stakeholder-review-package" } });
  expect(readPlanBlock("No block.")).toEqual({ problem: "The session reading the plan ended without returning a plan." });
  expect(readPlanBlock(block({ ...good, kilnPlan: 2 }))).toEqual({ problem: "The plan the session returned isn't one Kiln reads." });
  expect(readPlanBlock(block({ ...good, stages: [] }))).toEqual({ problem: "The plan the session returned has no stages." });
  expect(readPlanBlock(block({ ...good, stages: [{ skill: "x", title: "X", reaches: ["shipped"] }] }))).toEqual({ problem: "The plan the session returned names a milestone Kiln doesn't know: shipped." });
  expect(readPlanBlock(block({ kilnPlan: 1, stages: good.stages }))).toEqual({ problem: "The plan the session returned doesn't name the stakeholder review's skill." });
  expect(readPlanBlock("```kiln-plan\n{nope\n```")).toEqual({ problem: "The plan the session returned isn't valid JSON." });
});

it("fingerprints every SKILL.md in the folder the entry skill resolves into, and dates it by the newest file or the plugin registry", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "kiln-method-")));
  const skills = join(root, "method", "skills");
  for (const name of ["using-the-enso-method", "prd-writing-standards"]) { mkdirSync(join(skills, name), { recursive: true }); writeFileSync(join(skills, name, "SKILL.md"), `# ${name}\n`); }
  utimesSync(join(skills, "prd-writing-standards", "SKILL.md"), new Date("2026-11-19T12:00:00Z"), new Date("2026-11-19T12:00:00Z"));
  utimesSync(join(skills, "using-the-enso-method", "SKILL.md"), new Date("2026-11-01T12:00:00Z"), new Date("2026-11-01T12:00:00Z"));
  // A loose skill linked from the method's own repository resolves into that repository's folder.
  const loose = join(root, "claude", "skills");
  mkdirSync(loose, { recursive: true });
  symlinkSync(join(skills, "using-the-enso-method"), join(loose, "using-the-enso-method"));
  const env = { CLAUDE_CONFIG_DIR: join(root, "claude") };
  const first = methodOf(join(loose, "using-the-enso-method", "SKILL.md"), env);
  expect(first).toMatchObject({ folder: skills, updatedAt: "2026-11-19T12:00:00.000Z" });
  writeFileSync(join(skills, "prd-writing-standards", "SKILL.md"), "# changed\n");
  expect(methodOf(join(skills, "using-the-enso-method", "SKILL.md"), env).fingerprint).not.toBe(first.fingerprint);
  mkdirSync(join(root, "claude", "plugins"), { recursive: true });
  writeFileSync(join(root, "claude", "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { "enso-method@enso-method": [{ installPath: join(root, "method"), lastUpdated: "2026-10-19T01:10:37.859Z" }] } }));
  expect(methodOf(join(skills, "using-the-enso-method", "SKILL.md"), env).updatedAt).toBe("2026-10-19T01:10:37.859Z");
});

it("keys entries by skill and occurrence, says what a plan change did, and moves the cursor to the same key", () => {
  const before = [stage("a"), stage("b"), stage("c"), stage("b"), stage("d")];
  expect(planKeys(before)).toEqual(["a#1", "b#1", "c#1", "b#2", "d#1"]);
  const after = [stage("a"), stage("bc"), stage("d")];
  expect(planChanges(before, after)).toEqual(["No longer in the plan: b, c, b.", "New in the plan: bc.", "The plan has 3 stages where it had 5."]);
  expect(remapCursor(before, after, 4)).toBe(2);
  // The old cursor's key is gone: the entry after the latest earlier key the new plan holds.
  expect(remapCursor(before, after, 2)).toBe(1);
  expect(remapCursor(undefined, after, 3)).toBe(0);
});

it("moves the cursor by the standing's next, inserts a row the plan lacks, and goes past a method review that makes the stop's review", () => {
  const shown = plan([stage("write"), stage("refine", ["prd_refined"]), stage("stakeholder-review-package", ["review_made"]), stage("design", ["design_ready"]), stage("split", ["requirements_finished"])]);
  const state = newRequirements();
  expect(plannedNext(shown, state)).toMatchObject({ key: "write#1" });
  expect(advanceCursor(shown, state, "stage", report(["write"], "sanity"), false)).toEqual(["Kiln added sanity, which the method put next and the plan didn't have here."]);
  expect(plannedNext(shown, state)).toMatchObject({ key: "sanity#1" });
  expect(advanceCursor(shown, state, "stage", report(["sanity"], "refine"), false)).toEqual([]);
  expect(state.cursor).toBe(1);
  // The refinement reaches the early stop; the method's own review entry right after is the stop's review row.
  expect(advanceCursor(shown, state, "stage", report(["refine"], "stakeholder-review-package"), true)).toEqual([]);
  expect(state.cursor).toBe(3);
  expect(plannedRows(shown, state, { next: true }).map(row => [row.key, row.state, row.stop ?? "", row.addedByKiln ?? ""])).toEqual([["design#1", "next", "", ""], ["split#1", "planned", "final", ""], ["kiln:final", "planned", "", "final"]]);
  // A session at a stop that ran nothing in the plan: the next stage session runs as the Next stage row.
  advanceCursor(shown, state, "stage", report(["elsewhere"], "build", "build"), true);
  expect(state.cursorLost).toBe(true);
  expect(plannedNext(shown, state)).toBeUndefined();
});

it("counts every skill a session ran as run, so a merged stage passes none of them (AC-PLAN-06)", () => {
  const shown = plan([stage("A"), stage("B"), stage("C")]);
  const state = newRequirements();
  expect(advanceCursor(shown, state, "stage", report(["A", "B"], "C"), false)).toEqual([]);
  expect(state.cursor).toBe(2);
  // An entry between two that ran is named as passed.
  const skipped = newRequirements();
  expect(advanceCursor(plan([stage("A"), stage("B"), stage("C"), stage("D")]), skipped, "stage", report(["A", "C"], "D"), false)).toEqual(["Passed B, which the method didn't run for this PRD."]);
  expect(skipped.cursor).toBe(3);
});

it("names every entry a report at a stop moves the cursor past without running it (AC-PLAN-06)", () => {
  const shown = plan([stage("A"), stage("B"), stage("C", ["prd_refined"]), stage("D")]);
  // Between two that ran: [A, C] at the early review passes B.
  const between = newRequirements();
  expect(advanceCursor(shown, between, "stage", report(["A", "C"], "stakeholder-review-package"), true)).toEqual(["Passed B, which the method didn't run for this PRD."]);
  expect(between.cursor).toBe(3);
  // Before the first that ran: [C] from the start passes A and B.
  const before = newRequirements();
  expect(advanceCursor(shown, before, "stage", report(["C"], "stakeholder-review-package"), true)).toEqual(["The session ran C where the plan had A next.", "Passed A, B, which the method didn't run for this PRD."]);
  expect(before.cursor).toBe(3);
  // A merged stage that ran every entry up to the stop passes none.
  const merged = newRequirements();
  expect(advanceCursor(shown, merged, "stage", report(["A", "B", "C"], "stakeholder-review-package"), true)).toEqual([]);
});

it("at a stop, passes and names the entries up to the one reaching its milestone, from an earlier entry the session ran, an unknown standing or a feedback report (AC-PLAN-06)", () => {
  const reached = (r: StageReport, ...names: string[]): StageReport => ({ ...r, milestones: names.map(name => ({ name, by: "this_session" })) as NonNullable<StageReport["milestones"]> });
  const shown = plan([stage("Write"), stage("Refine", ["prd_refined"]), stage("Design"), stage("Split", ["requirements_finished"])]);
  // The session ran Write and reported prd_refined: Refine is passed and named, and the cursor goes past it.
  const early = newRequirements();
  expect(advanceCursor(shown, early, "stage", reached(report(["Write"], "stakeholder-review-package"), "prd_refined"), true)).toEqual(["Passed Refine, which the method didn't run for this PRD."]);
  expect(early.cursor).toBe(2);
  expect(plannedRows(shown, early, { next: true }).map(row => row.key)).toEqual(["kiln:early", "Design#1", "Split#1", "kiln:final"]);
  // At the final stop the design session put the build next: Split is passed and named, not dropped silently.
  const final = newRequirements();
  final.cursor = 2;
  expect(advanceCursor(shown, final, "stage", reached(report(["Design"], "build", "build"), "prd_refined", "requirements_finished"), true)).toEqual(["Passed Split, which the method didn't run for this PRD."]);
  expect(final.cursor).toBe(4);
  // From an unknown standing, a session that ran a plan entry says where Kiln continues from.
  const unknown = newRequirements();
  unknown.standing = { unknown: true, at: "2026-11-28T00:00:00Z" };
  expect(advanceCursor(shown, unknown, "stage", reached(report(["Refine"], "stakeholder-review-package"), "prd_refined"), true)).toEqual(["Kiln continues from Design, where the method found this PRD stands."]);
  expect(unknown.cursor).toBe(2);
  // A feedback report at a stop moves the cursor past the entries its milestones put behind the work, and names them.
  const feedback = newRequirements();
  expect(advanceCursor(shown, feedback, "feedback", reached(report([], "stakeholder-review-package"), "prd_refined"), true)).toEqual(["Passed Write, Refine, which the method didn't run for this PRD."]);
  expect(feedback.cursor).toBe(2);
  expect(feedback.cursorLost).toBeUndefined();
  const unknownFeedback = newRequirements();
  unknownFeedback.standing = { unknown: true, at: "2026-11-28T00:00:00Z" };
  expect(advanceCursor(shown, unknownFeedback, "feedback", reached(report([], "stakeholder-review-package"), "prd_refined"), true)).toEqual(["Kiln continues from Design, where the method found this PRD stands."]);
  // Feedback at a stop the cursor is already past moves nothing and says nothing.
  expect(advanceCursor(shown, feedback, "feedback", reached(report([], "stakeholder-review-package"), "prd_refined"), true)).toEqual([]);
  expect(feedback.cursor).toBe(2);
});

it("places Kiln's early review after the entry that refines the PRD, unless the method makes one there or it was held", () => {
  const shown = plan([stage("write"), stage("refine", ["prd_refined"]), stage("design"), stage("split", ["requirements_finished"])]);
  const state = newRequirements();
  expect(plannedRows(shown, state, { next: false }).map(row => row.key)).toEqual(["write#1", "refine#1", "kiln:early", "design#1", "split#1", "kiln:final"]);
  expect(plannedRows(shown, state, { next: false })[1]).toMatchObject({ stop: "early" });
  // While the refining entry runs, the early review still follows it.
  state.cursor = 1;
  expect(plannedRows(shown, state, { next: false, currentKey: "refine#1" }).map(row => row.key)).toEqual(["kiln:early", "design#1", "split#1", "kiln:final"]);
  state.cursor = 0;
  state.earlyReviewHeld = true;
  expect(plannedRows(shown, state, { next: false, currentKey: "write#1" }).map(row => row.key)).toEqual(["refine#1", "design#1", "split#1", "kiln:final"]);
});

it("lets one process read at a time, and takes over a lock whose holder died", async () => {
  const root = mkdtempSync(join(tmpdir(), "kiln-plan-lock-"));
  const holder = { agentId: "claude_code", fingerprint: "f", startedAt: "2026-11-27T00:00:00Z", pid: process.pid, processStartTime: "" };
  updatePlanFile(root, () => {});
  const { processStartTime } = await import("../platform/process-start-time.js");
  const live = { ...holder, processStartTime: (await processStartTime(process.pid))! };
  const release = await takePlanLock(root, live);
  expect(release).toBeDefined();
  expect(readPlanFile(root).reading).toEqual(live);
  expect(await takePlanLock(root, { ...live, startedAt: "2026-11-27T00:01:00Z" })).toBeUndefined();
  release!();
  expect(readPlanFile(root).reading).toBeUndefined();
  // A holder that no longer runs leaves its lock behind; the next reader takes it.
  await takePlanLock(root, { ...holder, pid: 999_999, processStartTime: "gone" });
  const next = await takePlanLock(root, live);
  expect(next).toBeDefined();
  next!();
});

it("keeps a remembered stage choice as its model's family, or the exact model when it has none", () => {
  expect(rememberedForm({ agentId: "claude_code", model: "claude-opus-5-5", effort: "high" })).toEqual({ agentId: "claude_code", family: "opus", effort: "high" });
  expect(rememberedForm({ agentId: "claude_code", model: "sonnet" })).toEqual({ agentId: "claude_code", family: "sonnet" });
  expect(rememberedForm({ agentId: "codex", model: "gpt-6.2-sol", effort: "xhigh" })).toEqual({ agentId: "codex", family: "sol", effort: "xhigh" });
  expect(rememberedForm({ agentId: "codex", model: "o9-preview" })).toEqual({ agentId: "codex", model: "o9-preview" });
});

it("from an unknown standing, a PRD started by hand, lists every entry from the first, and the first report says which stage Kiln continues from (AC-BEGIN-04)", () => {
  const shown = plan([stage("write"), stage("refine", ["prd_refined"]), stage("design"), stage("split", ["requirements_finished"])]);
  const state = { ...newRequirements(), standing: { unknown: true as const, at: "2026-11-27T00:00:00Z" } };
  // Before the first report the plan shows every entry from the first, with nothing marked done.
  expect(plannedRows(shown, state, { next: false, fromStart: true }).map(row => row.key)).toEqual(["write#1", "refine#1", "kiln:early", "design#1", "split#1", "kiln:final"]);
  // The session found the PRD written and refined it: the rows before the design drop away, and the notice says so, not that the method passed them.
  expect(advanceCursor(shown, state, "stage", report(["refine"], "design"), false)).toEqual(["Kiln continues from design, where the method found this PRD stands."]);
  expect(state.cursor).toBe(2);
});

it("names the entries before the first one a session ran, away from a stop too (AC-PLAN-06)", () => {
  const shown = plan([stage("A"), stage("B"), stage("C"), stage("D")]);
  const state = newRequirements();
  expect(advanceCursor(shown, state, "stage", report(["C"], "D"), false)).toEqual(["The session ran C where the plan had A next.", "Passed A, B, which the method didn't run for this PRD."]);
  expect(state.cursor).toBe(3);
  // A report whose next comes before what it ran passes only the entries before the new cursor.
  const back = newRequirements();
  expect(advanceCursor(shown, back, "stage", report(["C"], "B"), false)).toEqual(["The session ran C where the plan had A next.", "Passed A, which the method didn't run for this PRD."]);
  expect(back.cursor).toBe(1);
});

it("at a stop where the session ran nothing, drops the entries the milestones put behind, and the next report names what it passes (AC-PLAN-06)", () => {
  const shown = plan([stage("write"), stage("refine", ["prd_refined"]), stage("design", ["design_ready"]), stage("split", ["requirements_finished"])]);
  const atRefined = (ran: string[], next: string): StageReport => ({ ...report(ran, next), milestones: [{ name: "prd_refined", by: "earlier" }] });
  // A PRD refined by hand: the first session from the unknown standing runs nothing and reports the early review.
  const byHand = { ...newRequirements(), standing: { unknown: true as const, at: "2026-11-27T00:00:00Z" } };
  expect(advanceCursor(shown, byHand, "stage", atRefined([], "stakeholder-review-package"), true)).toEqual(["Kiln continues from design, where the method found this PRD stands."]);
  expect(byHand.cursor).toBe(2);
  expect(byHand.cursorLost).toBe(true);
  expect(plannedRows(shown, byHand, { next: false }).map(row => row.key)).toEqual(["kiln:early", "design#1", "split#1", "kiln:final"]);
  // From a known standing the passed entries are named.
  const known = { ...newRequirements(), standing: { next: { kind: "requirements" as const, skill: "write", title: "write", reaches: [] }, milestones: [], at: "2026-11-27T00:00:00Z" } };
  expect(advanceCursor(shown, known, "stage", atRefined([], "stakeholder-review-package"), true)).toEqual(["Passed write, refine, which the method didn't run for this PRD."]);
  expect(known.cursor).toBe(2);
  // A cursor lost before entries were dropped: Continue's session ran the design, and the entries it passes are named.
  const lost = { ...known, cursor: 0, cursorLost: true as const };
  expect(advanceCursor(shown, lost, "stage", report(["design"], "split"), false)).toEqual(["The session ran design where the plan had write next.", "Passed write, refine, which the method didn't run for this PRD."]);
  expect(lost.cursor).toBe(3);
  expect(lost.cursorLost).toBeUndefined();
  // At the final review with nothing run, every entry is behind.
  const finished = { ...newRequirements(), cursor: 2, standing: known.standing };
  expect(advanceCursor(shown, finished, "stage", report([], "build", "build"), true)).toEqual(["Passed design, split, which the method didn't run for this PRD."]);
  expect(finished.cursor).toBe(4);
  // With no entry reaching requirements_finished, the last entry is the one the final review follows.
  const noSplit = plan([stage("write"), stage("refine", ["prd_refined"]), stage("design")]);
  const ended = { ...newRequirements(), cursor: 2, standing: known.standing };
  expect(advanceCursor(noSplit, ended, "stage", report([], "build", "build"), true)).toEqual(["Passed design, which the method didn't run for this PRD."]);
  expect(ended.cursor).toBe(3);
  // The method's own review entry right after the refining one is the stop's review row, so the cursor goes past it too, and it isn't named as passed.
  const reviewed = plan([stage("write"), stage("refine", ["prd_refined"]), stage("stakeholder-review-package", ["review_made"]), stage("design")]);
  const atReview = { ...newRequirements(), standing: known.standing };
  expect(advanceCursor(reviewed, atReview, "stage", atRefined([], "stakeholder-review-package"), true)).toEqual(["Passed write, refine, which the method didn't run for this PRD."]);
  expect(atReview.cursor).toBe(3);
  expect(plannedRows(reviewed, atReview, { next: false }).map(row => row.key)).toEqual(["design#1", "kiln:final"]);
});
