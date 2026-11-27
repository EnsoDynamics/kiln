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
