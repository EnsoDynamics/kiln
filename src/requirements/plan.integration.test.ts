// The plan and stage models (Kiln Requirements Stages, Phase 3): the plan read once from the
// installed method and kept, every stage shown before Start and while running with its model,
// Start while the plan is read or after it failed, a method updated mid-run, and each stage's
// model changed and remembered for every PRD. Real engine, HTTP and disposable Git; the scripted
// stand-in plays each session, the plan read included.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { processStartTime } from "../platform/process-start-time.js";
import { writeJsonAtomically } from "../state/state-files.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { DESIGN, PHASES, PRD } from "../test-support/fixture-documents.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { boundPort } from "../test-support/os-ports.js";
import { createGithubOrigin, git } from "../test-support/git-repositories.js";
import { modelDefaultsPath } from "../models/model-defaults.js";
import { stateRoot } from "../state/state-files.js";
import { readPlanFile } from "./plan.js";

let h: Harness;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });

const folder = "count-boxes";
const dir = `docs/prds/${folder}`;
const prd = `${dir}/${folder}-prd.md`;
const review = `${dir}/${folder}-stakeholder-review.html`;

type Stage = [skill: string, title: string, reaches?: string[]];
const planBlock = (stages: Stage[]) => "```kiln-plan\n" + JSON.stringify({ kilnPlan: 1, stages: stages.map(([skill, title, reaches]) => ({ skill, title, reaches: reaches ?? [] })), reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } }) + "\n```";
const planSession = (stages: Stage[], hold?: { touch: string; waitForFile: string }) => ({ actions: [...(hold ? [{ touch: hold.touch }, { waitForFile: hold.waitForFile }] : []), { result: "The method's stages:\n" + planBlock(stages) }, { exit: 0 }] });
const TODAY: Stage[] = [
  ["prd-writing-standards", "Write the PRD"], ["autonomous-prd-refinement", "Refine the PRD", ["prd_refined"]],
  ["technical-design-writing-standards", "Technical design"], ["review-technical-design", "Design review"],
  ["autonomous-design-refinement", "Refine the design", ["design_ready"]], ["phase-split", "Phase plan", ["requirements_finished"]],
];
// The updated method reviews and refines the design in one stage.
const UPDATED: Stage[] = [
  ["prd-writing-standards", "Write the PRD"], ["autonomous-prd-refinement", "Refine the PRD", ["prd_refined"]],
  ["technical-design-writing-standards", "Technical design"], ["design-review-and-refinement", "Review and refine the design", ["design_ready"]],
  ["phase-split", "Phase plan", ["requirements_finished"]],
];
const report = (ran: string[], next: string, milestones: string[], reaches: string[] = []) => ({ result: "```kiln-report\n" + JSON.stringify({
  kilnReport: 1, ran: ran.map(skill => ({ skill, title: TODAY.concat(UPDATED).find(([one]) => one === skill)?.[1] ?? skill })), finished: true,
  next: { kind: next === "build" ? "build" : "requirements", skill: next, title: TODAY.concat(UPDATED).find(([one]) => one === next)?.[1] ?? next, reaches },
  milestones: milestones.map(name => ({ name, by: "this_session" })), prdDirectory: dir,
}) + "\n```" });

async function serve() {
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: folder, token: h.engine.record.token });
  const origin = `http://127.0.0.1:${boundPort(server.address)}`;
  return async (path: string, body: unknown) => {
    const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
}
const view = () => buildSnapshot(h.engine).requirements!;
const rows = () => view().rows.map(row => ({ key: row.key, title: row.title, state: row.state, ...(row.stop ? { stop: row.stop } : {}), ...(row.addedByKiln ? { addedByKiln: row.addedByKiln } : {}) }));
const methodSkill = () => join(h.sandbox.root, "claude-config", "skills", "using-the-enso-method", "SKILL.md");
function hosted() {
  const remote = createGithubOrigin(h.sandbox, "acme", "acme-shop");
  git(h.sandbox, h.origin, "push", "-q", "--mirror", remote.bare);
  git(h.sandbox, h.repository, "remote", "set-url", "origin", remote.url);
  h.env.GIT_SSH_COMMAND = h.sandbox.env.GIT_SSH_COMMAND;
}

it("reads the plan once, shows every stage with its model before Start and while running, and follows a method updated mid-run", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-plan-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder,
    planSessions: [planSession(TODAY), planSession(UPDATED)],
    sessions: [
      // 1. The draft. While it runs the method is updated; the stage finishes on the copy it started with.
      { actions: [{ touch: join(signals, "drafting") }, { waitForFile: join(signals, "updated") }, { write: { path: prd, content: PRD } }, { commit: "draft" }, report(["prd-writing-standards"], "autonomous-prd-refinement", []), { exit: 0 }] },
      // 2. The refinement, on the plan read again before it launched.
      { actions: [{ write: { path: prd, content: PRD + "\nRefined.\n" } }, { commit: "refine" }, report(["autonomous-prd-refinement"], "technical-design-writing-standards", ["prd_refined"]), { exit: 0 }] },
      // 3. The early review.
      { actions: [{ write: { path: review, content: "<h1>Early review</h1>" } }, { commit: "review" }, { result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: "stakeholder-review-package", title: "Stakeholder review" }], finished: true }) + "\n```" }, { exit: 0 }] },
    ] });
  await h.engine.refreshAgents();
  // AC-PLAN-03: the read starts when kiln run starts, and the plan is kept for the method's fingerprint.
  await waitFor(() => h.engine.planView().status === "read", 20_000);
  // A second reader of the same method reuses the plan: no new read.
  const second = await h.engineFor(folder);
  await waitFor(() => second.planView().status === "read");
  expect(h.planReadCalls()).toHaveLength(1);
  second.close();
  hosted();
  expect(h.planReadCalls()).toHaveLength(1);
  expect(h.planReadCalls()[0]!.prompt).toContain(methodSkill().replace("SKILL.md", ""));
  const plan = view().plan;
  expect(plan).toMatchObject({ status: "read", agent: "Claude Code", canReadAgain: true });
  expect(plan.methodUpdatedAt).toBe(h.engine.planMethod!.updatedAt);
  expect(Date.parse(plan.methodUpdatedAt!)).toBeGreaterThan(Date.now() - 10 * 60_000);
  // AC-PLAN-01: every stage in order with the method's name for its skill, Kiln's review rows, both stops marked, then the build.
  expect(rows()).toEqual([
    { key: "prd-writing-standards#1", title: "Write the PRD", state: "next" },
    { key: "autonomous-prd-refinement#1", title: "Refine the PRD", state: "planned", stop: "early" },
    { key: "kiln:early", title: "Early stakeholder review", state: "planned", addedByKiln: "early" },
    { key: "technical-design-writing-standards#1", title: "Technical design", state: "planned" },
    { key: "review-technical-design#1", title: "Design review", state: "planned" },
    { key: "autonomous-design-refinement#1", title: "Refine the design", state: "planned" },
    { key: "phase-split#1", title: "Phase plan", state: "planned", stop: "final" },
    { key: "kiln:final", title: "Final stakeholder review", state: "planned", addedByKiln: "final" },
    { key: "build", title: "Build", state: "planned" },
  ]);
  // AC-MODEL-01, AC-MODEL-02: each stage shows what it will run on, with Change; the design refinement one model down.
  const model = (key: string) => view().rows.find(row => row.key === key)!.model!;
  expect(model("prd-writing-standards#1")).toMatchObject({ state: "will_run_on", from: "model_defaults", choice: { agent: "Claude Code", model: "fable", effort: "high" }, change: { available: true } });
  expect(model("autonomous-design-refinement#1")).toMatchObject({ choice: { model: "opus", effort: "high" } });
  // AC-MODEL-01, AC-MODEL-03: change one stage for this PRD, and remember another for every PRD.
  const post = await serve();
  expect(await post("model", { target: { stage: "technical-design-writing-standards#1" }, choice: { agentId: "claude_code", model: "sonnet", effort: "high" } })).toMatchObject({ status: 200 });
  expect(model("technical-design-writing-standards#1")).toMatchObject({ from: "changed", choice: { model: "sonnet" }, useDefault: true });
  expect(await post("model", { target: { stage: "review-technical-design#1" }, choice: { agentId: "claude_code", model: "sonnet", effort: "medium" }, remember: true })).toMatchObject({ status: 200 });
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8")).skills).toEqual({ "review-technical-design": { agentId: "claude_code", family: "sonnet", effort: "medium" } });
  expect(model("review-technical-design#1")).toMatchObject({ from: "saved", choice: { model: "sonnet", effort: "medium" }, useDefault: true });
  // Use the default opts this PRD's stage out of the saved choice, and Change back to it follows the saved choice again.
  expect(await post("model", { target: { stage: "review-technical-design#1" }, choice: "default" })).toMatchObject({ status: 200 });
  expect(model("review-technical-design#1")).toMatchObject({ from: "model_defaults", choice: { model: "fable" } });
  expect(await post("model", { target: { stage: "review-technical-design#1" }, choice: { agentId: "claude_code", model: "sonnet", effort: "medium" }, remember: true })).toMatchObject({ status: 200 });
  expect(model("review-technical-design#1")).toMatchObject({ from: "saved" });
  expect(await post("model", { target: { stage: "kiln:nope" }, choice: { agentId: "claude_code", model: "sonnet", effort: "high" } })).toMatchObject({ status: 422 });
  expect(await post("model", { target: { stage: "prd-writing-standards#1" }, choice: "default", remember: true })).toMatchObject({ status: 400 });

  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(join(signals, "drafting")));
  // AC-STAGE-03: the running stage shows its skill and model; the stages still to come follow it.
  expect(rows().slice(0, 2)).toEqual([{ key: "prd-writing-standards#1", title: "Write the PRD", state: "running" }, { key: "autonomous-prd-refinement#1", title: "Refine the PRD", state: "planned", stop: "early" }]);
  // A stage that has started keeps what it started on.
  expect(await post("model", { target: { stage: "prd-writing-standards#1" }, choice: { agentId: "claude_code", model: "opus", effort: "high" } })).toMatchObject({ status: 409 });

  // AC-PLAN-07: the method changes while the draft runs. The PRD keeps showing its plan until the session ends.
  writeFileSync(methodSkill(), readFileSync(methodSkill(), "utf8") + "\nUpdated.\n");
  await h.engine.refreshRequirementsPlan({ wait: true });
  expect(h.planReadCalls()).toHaveLength(2);
  expect(rows().map(row => row.key)).toEqual(["prd-writing-standards#1", "autonomous-prd-refinement#1", "kiln:early", "technical-design-writing-standards#1", "review-technical-design#1", "autonomous-design-refinement#1", "phase-split#1", "kiln:final", "build"]);
  expect(view().notice).toBeUndefined();
  writeFileSync(join(signals, "updated"), "");
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("early");
  const after = view();
  expect(after.notice?.changes).toEqual(["No longer in the plan: Design review, Refine the design.", "New in the plan: Review and refine the design.", "The plan has 5 stages where it had 6."]);
  expect(after.notice?.methodUpdatedAt).toBe(h.engine.requirementsPlan!.methodUpdatedAt);
  // Finished stages keep their record; the stages still to come are the updated method's.
  expect(rows()).toEqual([
    { key: "prd-writing-standards#1", title: "Write the PRD", state: "done" },
    { key: "autonomous-prd-refinement#1", title: "Refine the PRD", state: "done", stop: "early" },
    { key: "kiln:early", title: "Stakeholder review", state: "done", addedByKiln: "early" },
    { key: "technical-design-writing-standards#1", title: "Technical design", state: "next" },
    { key: "design-review-and-refinement#1", title: "Review and refine the design", state: "planned" },
    { key: "phase-split#1", title: "Phase plan", state: "planned", stop: "final" },
    { key: "kiln:final", title: "Final stakeholder review", state: "planned", addedByKiln: "final" },
    { key: "build", title: "Build", state: "planned" },
  ]);
  const done = view().rows.filter(row => row.state === "done");
  for (const row of done.slice(0, 2)) expect(row.pushedSha).toMatch(/^[0-9a-f]{40}$/);
  // The per-PRD change follows its key into the new plan; the remembered skill no longer runs, so the stage that replaced it says so (AC-MODEL-04).
  expect(model("technical-design-writing-standards#1")).toMatchObject({ from: "changed", choice: { model: "sonnet" } });
  const replaced = view().rows.find(row => row.key === "design-review-and-refinement#1")!;
  expect(replaced.savedChoiceUnmatched).toEqual({ skill: "review-technical-design" });
  expect(replaced.model).toMatchObject({ from: "model_defaults", choice: { model: "opus" } });
  // The refinement launched on the updated plan's model: Requirements stages.
  const refinement = h.engine.record.requirements!.stages[1]!;
  expect(h.engine.latestSession(`req-${refinement.activityId}`)).toMatchObject({ model: "fable", effort: "high" });
  // AC-STAGE-03: a plan read counts toward no PRD.
  expect(Object.keys(h.engine.record.phases).every(key => key.startsWith("req-") && h.engine.record.requirements!.stages.some(stage => `req-${stage.activityId}` === key))).toBe(true);
  expect(existsSync(join(stateRoot(h.env), "requirements-plan"))).toBe(true);
  // The record as the driver leaves it when the stage that replaced the remembered skill is launched next, and a review stage launched but not started:
  // the launched row still says the saved choice no longer applies (AC-MODEL-04), and the review row names its skill for Use this on every PRD (AC-MODEL-03).
  const state = h.engine.record.requirements!;
  const at = new Date().toISOString();
  state.stages.push({ activityId: "launched-review", key: "kiln:final", task: "review", ran: [], reaches: ["review_made"], startedAt: at },
    { activityId: "launched-replacement", key: "design-review-and-refinement#1", task: "stage", expected: { skill: "design-review-and-refinement", title: "Review and refine the design" }, ran: [], reaches: ["design_ready"], startedAt: at });
  const launched = (id: string) => view().rows.find(row => row.activityId === id)!;
  expect(launched("launched-replacement")).toMatchObject({ key: "design-review-and-refinement#1", savedChoiceUnmatched: { skill: "review-technical-design" }, model: { from: "model_defaults", change: { available: true } } });
  expect(launched("launched-review")).toMatchObject({ key: "kiln:final", title: "Final stakeholder review", skill: "stakeholder-review-package" });
});

it("starts while the plan is read, says what holds, and when it can't be read says why, keeps going and reads again on request", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-plan-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder,
    planSessions: [planSession(TODAY, { touch: join(signals, "reading"), waitForFile: join(signals, "release") }), { actions: [{ result: "I could not find the method." }, { exit: 0 }] }, planSession(TODAY)],
    sessions: [
      { actions: [{ touch: join(signals, "drafting") }, { waitForFile: join(signals, "release") }, { write: { path: prd, content: PRD } }, { commit: "draft" }, report(["prd-writing-standards"], "autonomous-prd-refinement", []), { exit: 0 }] },
      { actions: [{ touch: join(signals, "refining") }, { waitForFile: join(signals, "go") }, { write: { path: prd, content: PRD + "\nRefined.\n" } }, { commit: "refine" }, report(["autonomous-prd-refinement"], "technical-design-writing-standards", ["prd_refined"]), { exit: 0 }] },
    ] });
  hosted();
  h.engine.record.settings.waitAtEarlyReview = false;
  await h.engine.refreshAgents();
  await waitFor(() => existsSync(join(signals, "reading")), 20_000);
  // AC-PLAN-04: reading, since when; AC-PLAN-05: Start works while it reads.
  expect(view().plan).toMatchObject({ status: "reading", canReadAgain: false });
  expect(view().plan.readingSince).toBe(readPlanFile(stateRoot(h.env)).reading!.startedAt);
  const post = await serve();
  expect(await post("requirements-plan/read", {})).toMatchObject({ status: 409 });
  expect(await h.engine.start()).toMatchObject({ ok: true });
  // AC-PLAN-05: the first stage doesn't wait for the read; it runs as the Next stage row while the plan is read.
  await waitFor(() => existsSync(join(signals, "drafting")), 20_000);
  expect(view().plan.status).toBe("reading");
  expect(h.claudeCalls()).toHaveLength(1);
  expect(rows()[0]).toEqual({ key: "kiln:next", title: "Next stage", state: "running" });
  writeFileSync(join(signals, "release"), "");
  await waitFor(() => existsSync(join(signals, "refining")), 20_000);
  expect(rows()[0]).toEqual({ key: "prd-writing-standards#1", title: "Write the PRD", state: "done" });
  // AC-PLAN-01: the running stage that reaches the early stop carries its mark, and the review follows it.
  expect(rows().slice(1, 3)).toEqual([{ key: "autonomous-prd-refinement#1", title: "Refine the PRD", state: "running", stop: "early" }, { key: "kiln:early", title: "Early stakeholder review", state: "planned", addedByKiln: "early" }]);
  // A method updated now is read before the next stage; this read fails, and the run goes on with the plan it last showed.
  writeFileSync(methodSkill(), readFileSync(methodSkill(), "utf8") + "\nUpdated.\n");
  writeFileSync(join(signals, "go"), "");
  await waitFor(() => h.planReadCalls().length === 2 && view().plan.status === "failed", 20_000);
  expect(view().plan.failure).toMatchObject({ reason: "The session reading the plan ended without returning a plan." });
  // Kiln doesn't retry by itself; Read again does.
  await h.engine.refreshRequirementsPlan({ wait: true });
  expect(h.planReadCalls()).toHaveLength(2);
  expect(rows().map(row => row.key)).toContain("phase-split#1");
  expect(await post("requirements-plan/read", {})).toMatchObject({ status: 200 });
  await waitFor(() => h.planReadCalls().length === 3 && view().plan.status === "read", 20_000);
  const file = readPlanFile(stateRoot(h.env));
  expect(Object.keys(file.plans.claude_code!)).toHaveLength(2);
  expect(file.reading).toBeUndefined();
  h.engine.close();
});

it("never waits at Start for a read of a method updated after the PRD showed its plan (AC-PLAN-05)", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-plan-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder,
    planSessions: [planSession(TODAY), planSession(UPDATED, { touch: join(signals, "reading"), waitForFile: join(signals, "release") })],
    sessions: [{ actions: [{ touch: join(signals, "drafting") }, { result: "I need a moment." }, { exit: 0 }] }] });
  hosted();
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "read", 20_000);
  expect(h.engine.record.requirements!.planFingerprint).toBeTruthy();
  writeFileSync(methodSkill(), readFileSync(methodSkill(), "utf8") + "\nUpdated.\n");
  void h.engine.refreshRequirementsPlan();
  await waitFor(() => existsSync(join(signals, "reading")), 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  // The first session launches while the updated method is still being read.
  await waitFor(() => existsSync(join(signals, "drafting")), 20_000);
  expect(view().plan.status).toBe("reading");
  writeFileSync(join(signals, "release"), "");
  await h.engine.settled();
  expect(h.planReadCalls()).toHaveLength(2);
});

it("with no plan, the Next stage row the latest report names shows and launches on its Change (AC-MODEL-01)", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-plan-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [
    { actions: [{ touch: join(signals, "drafting") }, { waitForFile: join(signals, "go") }, { write: { path: prd, content: PRD } }, { commit: "draft" }, report(["prd-writing-standards"], "autonomous-prd-refinement", []), { exit: 0 }] },
    { actions: [{ result: "Not finished." }, { exit: 0 }] },
  ] });
  hosted();
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "failed", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(join(signals, "drafting")), 20_000);
  h.engine.pause();
  writeFileSync(join(signals, "go"), "");
  await h.engine.settled();
  expect(h.engine.record.pause.activeSince).toBeDefined();
  const next = () => view().rows.find(row => row.state === "next")!;
  expect(next()).toMatchObject({ key: "autonomous-prd-refinement#1", skill: "autonomous-prd-refinement", model: { from: "model_defaults", choice: { model: "fable" }, change: { available: true } } });
  // While the design span is open the stage Kiln launches next runs on Refining the design, and its row says so.
  h.engine.record.requirements!.designSpan = true;
  expect(next().model).toMatchObject({ from: "model_defaults", choice: { model: "opus", effort: "high" } });
  h.engine.record.requirements!.designSpan = false;
  expect(await h.engine.changeStageModel("autonomous-prd-refinement#1", { agentId: "claude_code", model: "sonnet", effort: "high" }, false)).toEqual({ ok: true });
  expect(next().model).toMatchObject({ from: "changed", choice: { model: "sonnet", effort: "high" } });
  // Continue lifts the pause, as Start does on the paused screen.
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const refinement = h.engine.record.requirements!.stages[1]!;
  expect(refinement.key).toBe("autonomous-prd-refinement#1");
  expect(h.engine.latestSession(`req-${refinement.activityId}`)).toMatchObject({ model: "sonnet", effort: "high" });
});

it("names a planned stage whose saved choice can't be used by its title in Start's reason (AC-MODEL-06)", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, planSessions: [planSession(TODAY)], sessions: [] });
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "read", 20_000);
  writeFileSync(modelDefaultsPath(h.env), JSON.stringify({ schemaVersion: 1, rows: {}, skills: { "phase-split": { agentId: "claude_code", family: "opus", effort: "ultra" } } }));
  h.engine.modelChoicesChanged();
  await waitFor(() => !!h.engine.modelsProblem);
  expect(h.engine.modelsProblem).toMatch(/^Phase plan runs on Claude Code · Opus[^:]* · ultra from a choice saved for every PRD for this stage's skill: .* Change it on its row in the requirements plan\.$/);
});

it("never waits at a stage boundary for Read again of the method the PRD's plan came from (AC-PLAN-05)", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-plan-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder,
    planSessions: [planSession(TODAY), planSession(TODAY, { touch: join(signals, "reading"), waitForFile: join(signals, "release") })],
    sessions: [
      { actions: [{ touch: join(signals, "drafting") }, { waitForFile: join(signals, "go") }, { write: { path: prd, content: PRD } }, { commit: "draft" }, report(["prd-writing-standards"], "autonomous-prd-refinement", []), { exit: 0 }] },
      { actions: [{ touch: join(signals, "refining") }, { result: "Not finished." }, { exit: 0 }] },
    ] });
  hosted();
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "read", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(join(signals, "drafting")), 20_000);
  expect(await h.engine.readPlanAgain()).toEqual({ ok: true });
  await waitFor(() => existsSync(join(signals, "reading")), 20_000);
  writeFileSync(join(signals, "go"), "");
  // The next stage launches while the same method is read again.
  await waitFor(() => existsSync(join(signals, "refining")), 20_000);
  expect(view().plan.status).toBe("reading");
  writeFileSync(join(signals, "release"), "");
  await h.engine.settled();
});

it("waits to read the plan until billing is approved on a metered route", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, planSessions: [{ actions: [{ result: "No plan." }, { exit: 0 }] }, planSession(TODAY)], sessions: [] });
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "failed", 20_000);
  h.env.ANTHROPIC_API_KEY = "plan-read-canary";
  await h.engine.refreshBilling();
  expect(await h.engine.readPlanAgain()).toEqual({ ok: true });
  await waitFor(() => h.engine.planWaitsForBilling, 20_000);
  expect(h.planReadCalls()).toHaveLength(1);
  expect(await h.engine.readPlanAgain()).toMatchObject({ ok: false });
  const post = await serve();
  expect(await post("requirements-plan/read", {})).toMatchObject({ status: 409 });
  await h.engine.billingCommand("approval", { executionId: h.engine.record.executionId, readingId: h.engine.billing.view.next!.readingId, approved: true });
  await waitFor(() => view().plan.status === "read", 20_000);
  expect(h.planReadCalls()).toHaveLength(2);
});

it("runs a design stage the plan expects on Refining the design, and a stage the method put next that the plan lacks on a row of its own", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, planSessions: [planSession(TODAY)],
    sessions: [
      // The draft reports a step the plan doesn't have next: Kiln inserts it at the cursor.
      { actions: [{ write: { path: prd, content: PRD } }, { commit: "draft" }, report(["prd-writing-standards"], "prd-sanity-check", []), { exit: 0 }] },
      { actions: [{ write: { path: prd, content: PRD + "\nChecked.\n" } }, { commit: "check" }, report(["prd-sanity-check"], "autonomous-prd-refinement", []), { exit: 0 }] },
      { actions: [{ write: { path: prd, content: PRD + "\nChecked.\nRefined.\n" } }, { commit: "refine" }, report(["autonomous-prd-refinement"], "technical-design-writing-standards", ["prd_refined"]), { exit: 0 }] },
      { actions: [{ write: { path: review, content: "<h1>Early</h1>" } }, { commit: "review" }, { result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: "stakeholder-review-package", title: "Stakeholder review" }], finished: true }) + "\n```" }, { exit: 0 }] },
      // The design skips the design review: the cursor passes it.
      { actions: [{ write: { path: `${dir}/technical-design.md`, content: DESIGN } }, { commit: "design" }, report(["technical-design-writing-standards"], "autonomous-design-refinement", ["prd_refined"], ["design_ready"]), { exit: 0 }] },
      { actions: [{ write: { path: `${dir}/technical-design.md`, content: DESIGN + "\nRefined.\n" } }, { write: { path: `${dir}/phase-1-return-intake.md`, content: PHASES["phase-1-return-intake.md"]! } }, { commit: "refine design" }, report(["autonomous-design-refinement"], "build", ["prd_refined", "design_ready", "requirements_finished"]), { exit: 0 }] },
      { actions: [{ write: { path: review, content: "<h1>Final</h1>" } }, { commit: "final review" }, { result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: "stakeholder-review-package", title: "Stakeholder review" }], finished: true }) + "\n```" }, { exit: 0 }] },
    ] });
  hosted();
  h.engine.record.settings.waitAtEarlyReview = false;
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "read", 20_000);
  // AC-MODEL-01, AC-MODEL-03: a change for this PRD and choices saved for every PRD are what those stages launch on, the inserted row's included.
  expect(await h.engine.changeStageModel("technical-design-writing-standards#1", { agentId: "claude_code", model: "sonnet", effort: "high" }, false)).toEqual({ ok: true });
  expect(await h.engine.changeStageModel("autonomous-prd-refinement#1", { agentId: "claude_code", model: "sonnet", effort: "medium" }, true)).toEqual({ ok: true });
  writeFileSync(modelDefaultsPath(h.env), JSON.stringify({ ...JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8")), skills: { ...JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8")).skills, "prd-sanity-check": { agentId: "claude_code", family: "haiku", effort: "low" } } }));
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.reviewStop).toBe("final");
  const stages = h.engine.record.requirements!.stages;
  expect(stages.map(stage => stage.key)).toEqual(["prd-writing-standards#1", "prd-sanity-check#1", "autonomous-prd-refinement#1", "kiln:early", "technical-design-writing-standards#1", "autonomous-design-refinement#1", "kiln:final"]);
  const session = (i: number) => h.engine.latestSession(`req-${stages[i]!.activityId}`)!;
  // AC-MODEL-02: the stage the plan expects to make the design ready runs on Refining the design, every other on Requirements stages.
  expect(session(5)).toMatchObject({ model: "opus", effort: "high" });
  expect(session(4)).toMatchObject({ model: "sonnet", effort: "high" });
  expect(session(2)).toMatchObject({ model: "sonnet", effort: "medium" });
  expect(h.engine.latestSession(`req-${stages[2]!.activityId}`)!.launch?.from).toBe("saved");
  expect(session(1)).toMatchObject({ model: "haiku", effort: "low" });
  expect(session(0)).toMatchObject({ model: "fable" });
  // The choice is kept as its family, so a newer Sonnet is used when it ships.
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8")).skills["autonomous-prd-refinement"]).toEqual({ agentId: "claude_code", family: "sonnet", effort: "medium" });
  expect(h.engine.record.requirements!.designSpan).toBe(false);
  // AC-PLAN-06: what changed when a report passed the plan.
  expect(h.engine.record.requirements!.notice?.changes).toEqual(["Passed Design review, which the method didn't run for this PRD."]);
});

async function cli(args: string[]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = ""; child.stdout.on("data", data => stdout += String(data)); child.stderr.on("data", data => stderr += String(data));
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 30000);
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => clearTimeout(watchdog));
  return { code, stdout, stderr, json: () => JSON.parse(stdout) as Record<string, unknown> };
}

it("changes a stage's model, remembers it for every PRD and forgets it from a terminal (needs dist/)", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, planSessions: [planSession(TODAY)],
    sessions: [{ actions: [{ write: { path: prd, content: PRD } }, { commit: "draft" }, { result: "I need a moment." }, { exit: 0 }] }] });
  hosted();
  await h.engine.refreshAgents();
  await waitFor(() => view().plan.status === "read", 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.engine.stoppedPhaseKey()).toMatch(/^req-/);
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: folder, token: h.engine.record.token });
  writeJsonAtomically(join(h.stateDirectory, "instance.lock"), { pid: process.pid, processStartTime: await processStartTime(process.pid), port: boundPort(server.address) });
  const path = "source-material/" + folder;
  const status = await cli(["status", join(h.repository, path), "--json"]);
  expect(status.code, status.stdout + status.stderr).toBe(0);
  const listed = (status.json().requirements as { rows: { key: string; model?: { change?: { available: boolean } } }[] }).rows;
  expect(listed.find(row => row.key === "technical-design-writing-standards#1")?.model?.change).toEqual({ available: true });
  const token = status.json().status_token as string;
  const changed = await cli(["model", join(h.repository, path), "--stage", "technical-design-writing-standards#1", "--agent", "claude_code", "--model", "opus", "--effort", "high", "--remember", "--only-if-status-matches", token, "--command-id", "design-on-opus", "--json"]);
  expect(changed.code, changed.stdout + changed.stderr).toBe(0);
  await h.engine.commands.settled();
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8")).skills["technical-design-writing-standards"]).toEqual({ agentId: "claude_code", family: "opus", effort: "high" });
  expect(view().rows.find(row => row.key === "technical-design-writing-standards#1")!.model).toMatchObject({ from: "saved", choice: { model: "opus" } });
  // The stopped draft has started, so it keeps what it started on.
  const started = await cli(["model", join(h.repository, path), "--stage", "prd-writing-standards#1", "--agent", "claude_code", "--model", "opus", "--effort", "high", "--only-if-status-matches", (await cli(["status", join(h.repository, path), "--json"])).json().status_token as string, "--command-id", "draft-on-opus", "--json"]);
  expect(started.code).toBe(3);
  const back = await cli(["model", join(h.repository, path), "--stage", "technical-design-writing-standards#1", "--use-default", "--only-if-status-matches", (await cli(["status", join(h.repository, path), "--json"])).json().status_token as string, "--command-id", "design-default", "--json"]);
  expect(back.code, back.stdout).toBe(0);
  await h.engine.commands.settled();
  expect(view().rows.find(row => row.key === "technical-design-writing-standards#1")!.model).toMatchObject({ from: "model_defaults", choice: { model: "fable" } });
  const row = await cli(["model-defaults", "set", "--row", "refining-design", "--first-agent", "claude_code", "--first-model", "sonnet", "--first-effort", "high", "--json"]);
  expect(row.code, row.stdout).toBe(0);
  expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8")).rows.refining_design.first).toEqual({ agentId: "claude_code", family: "sonnet", effort: "high" });
  await waitFor(() => view().rows.find(one => one.key === "autonomous-design-refinement#1")!.model!.choice?.model === "sonnet");
  const remembered = await cli(["model-defaults", "remember", "--skill", "phase-split", "--agent", "claude_code", "--model", "sonnet", "--effort", "high", "--json"]);
  expect(remembered.code, remembered.stdout).toBe(0);
  expect((remembered.json().data as { skills: { skill: string }[] }).skills.map(one => one.skill)).toEqual(["technical-design-writing-standards", "phase-split"]);
  const forgot = await cli(["model-defaults", "forget", "--skill", "technical-design-writing-standards"]);
  expect(forgot.code).toBe(0);
  expect(forgot.stdout).toContain("Saved for every PRD, phase-split: Claude Code · Sonnet · high");
  expect(forgot.stdout).not.toContain("technical-design-writing-standards");
  await waitFor(() => view().rows.find(row => row.key === "technical-design-writing-standards#1")!.model!.from === "model_defaults");
  expect((await cli(["model-defaults", "forget", "--skill", "nothing-saved"])).code).toBe(2);
});

it("saves no failure for a plan read Kiln stopped, so the next Kiln reads again", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-plan-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, planSessions: [planSession(TODAY, { touch: join(signals, "reading"), waitForFile: join(signals, "never") }), planSession(TODAY)], sessions: [] });
  await h.engine.refreshAgents();
  await waitFor(() => existsSync(join(signals, "reading")), 20_000);
  h.engine.close();
  await waitFor(() => readPlanFile(stateRoot(h.env)).reading === undefined, 20_000);
  expect(readPlanFile(stateRoot(h.env)).failures).toEqual({});
  const next = await h.engineFor(folder);
  await waitFor(() => next.planView().status === "read", 20_000);
  expect(h.planReadCalls()).toHaveLength(2);
  next.close();
});
