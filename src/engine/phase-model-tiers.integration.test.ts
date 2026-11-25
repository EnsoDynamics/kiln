// Each activity's model through the engine (Kiln Phase Model Tiers, Phase 1: AC-TIER-01,
// AC-TIER-02, AC-PICK-01, AC-PICK-02, AC-PICK-04, AC-PICK-06, AC-DEFAULT-01, AC-DEFAULT-04,
// AC-KEEP-01), against real Git with the stand-in claude and gh: the tier line picks the model
// each launch runs on, every row says what it will run on, runs on or ran on, the first model
// response starts the activity and a refusal before one doesn't, a started activity's later
// session runs on the concrete model it started on, and a choice that can't be used holds Start.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { SCHEMA_VERSION, writeSessionRecord, type SessionRecord } from "../state/records.js";
import { retainExecution } from "./continuation-state.js";
import { afterEach, describe, expect, it } from "vitest";
import type { Receipt } from "../control/commands.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import type { Engine } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";

let harness: Harness | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; });

const DIRECTORY = "docs/prds/customer-returns";
// The fixture plan's open leaves are 1, 2b and 3 (2a is closed), then final delivery.
const allPhases = (): ScenarioSession[] => [landingSession("src/one.txt"), landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()];

/** The fixture documents with Phase 1 demanding, Phase 2b mechanical and Phase 3 not rated. */
function tieredFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  const line = (name: string, text: string) => { files[name] = files[name]!.replace(/\n\n/, `\n\n${text}\n\n`); };
  line("phase-1-return-intake.md", "**Model tier:** demanding — AC-RET-02 moves money on retries.");
  line("phase-2a-card-refunds.md", "**Model tier:** standard");
  line("phase-2b-store-credit.md", "**Model tier:** mechanical - repeats the card refund flow.");
  return files;
}

async function fixture(sessions: ScenarioSession[], files = tieredFiles()) {
  harness = await createHarness({ sessions, files });
  const read = readPlanAt(harness.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  harness.engine.record.plan = recordedPlan(read.plan);
  harness.engine.modelChoicesChanged();
  await harness.engine.refreshAgents();
  return harness;
}

const row = (engine: Engine, id: string): PhaseView => (buildSnapshot(engine).activities ?? buildSnapshot(engine).phases).find(one => one.id === id)!;
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];
const choiceOf = (view: PhaseView) => view.model?.choice ? [view.model.state, view.model.choice.agent, view.model.choice.modelName, view.model.choice.effort] : [view.model?.state];

describe("the tier picks each phase's model (AC-TIER-01, AC-PICK-01, AC-DEFAULT-01)", () => {
  it("shows each phase's tag and the shipped choice for its tier before Start, then launches each session on it", async () => {
    const h = await fixture(allPhases());
    expect(row(h.engine, "1").tier).toEqual({ value: "demanding", reason: "AC-RET-02 moves money on retries." });
    expect(row(h.engine, "2a").tier).toEqual({ value: "standard" });
    expect(row(h.engine, "2b").tier).toEqual({ value: "mechanical", reason: "repeats the card refund flow." });
    expect(row(h.engine, "3").tier).toEqual({ value: "not_rated" });
    // Rows that aren't phases carry no tag.
    expect(row(h.engine, "2").tier).toBeUndefined();
    // Families resolve to the newest version the account offers: the stand-in's list has Fable 5.1.
    expect(choiceOf(row(h.engine, "1"))).toEqual(["will_run_on", "Claude Code", "Fable 5.1", "high"]);
    expect(choiceOf(row(h.engine, "2b"))).toEqual(["will_run_on", "Claude Code", "Sonnet 5.5", "high"]);
    expect(choiceOf(row(h.engine, "3"))).toEqual(["will_run_on", "Claude Code", "Opus 5.5", "medium"]);
    expect(row(h.engine, "1").model?.from).toBe("model_defaults");
    expect(buildSnapshot(h.engine).settings.models.tiers).toEqual({ demanding: 1, standard: 1, mechanical: 1, notRated: 1 });

    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    const launches = h.claudeCalls().filter(call => !call.args.includes("--resume")).map(call => [flag(call.args, "--model"), flag(call.args, "--effort")]);
    // Phase 1 on its demanding choice, 2b on mechanical's, 3 not rated as standard, the pull request on Audits'.
    expect(launches).toEqual([["fable", "high"], ["sonnet", "high"], ["opus", "medium"], ["opus", "high"]]);
    // Finished rows say what their session ran on, its model as the agent reported it.
    expect(choiceOf(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "Fable 5.1", "high"]);
    expect(choiceOf(row(h.engine, "3"))).toEqual(["ran_on", "Claude Code", "Opus 5.5", "medium"]);
    expect(row(h.engine, "1").model?.choice?.model).toBe("claude-fable-5-1");
    // A phase closed before the run has no session: nothing ran on a model here.
    expect(choiceOf(row(h.engine, "2a"))).toEqual(["none_recorded"]);
  });

  it("follows the tier line as read now, until the phase starts", async () => {
    const h = await fixture(allPhases());
    // The plan as the next read gives it, with phase 3's document now rated mechanical.
    h.engine.record.plan = h.engine.record.plan!.map(phase => phase.id === "3" ? { ...phase, modelTier: { tier: "mechanical", reason: "" } } : phase);
    expect(choiceOf(row(h.engine, "3"))).toEqual(["will_run_on", "Claude Code", "Sonnet 5.5", "high"]);
    expect(row(h.engine, "3").tier).toEqual({ value: "mechanical" });
  });
});

describe("Kiln reads each tier line each time it reads the plan, and never writes one (AC-TIER-01, AC-PICK-01)", () => {
  it("launches an open standard phase on Opus · medium, and a phase whose line changed or that was added during the run on its line as read then", async () => {
    const files = tieredFiles();
    files["phase-3-returns-dashboard.md"] = files["phase-3-returns-dashboard.md"]!.replace(/\n\n/, "\n\n**Model tier:** standard — dashboard reads only.\n\n");
    // Phase 1's session rates 2b standard instead of mechanical, and adds Phase 4, rated mechanical, after Phase 3.
    const twoB = files["phase-2b-store-credit.md"]!.replace("**Model tier:** mechanical - repeats the card refund flow.", "**Model tier:** standard — store credit has its own rules.");
    const four = "# Phase 4: Returns export\n\n**Model tier:** mechanical - one CSV export.\n\n## Acceptance criteria covered\nAC-DASH-01\n\n## Phase dependencies\nPhase 3.\n";
    const first = landingSession("src/one.txt");
    first.actions.splice(first.actions.findIndex(action => "commit" in action), 0, { write: { path: `${DIRECTORY}/phase-2b-store-credit.md`, content: twoB } }, { write: { path: `${DIRECTORY}/phase-4-returns-export.md`, content: four } });
    const h = await fixture([first, landingSession("src/two-b.txt"), landingSession("src/three.txt"), landingSession("src/four.txt"), pullRequestSession()], files);
    expect(row(h.engine, "3").tier).toEqual({ value: "standard", reason: "dashboard reads only." });
    expect(choiceOf(row(h.engine, "3"))).toEqual(["will_run_on", "Claude Code", "Opus 5.5", "medium"]);
    expect(choiceOf(row(h.engine, "2b"))).toEqual(["will_run_on", "Claude Code", "Sonnet 5.5", "high"]);

    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    const launches = h.claudeCalls().filter(call => !call.args.includes("--resume")).map(call => [flag(call.args, "--model"), flag(call.args, "--effort")]);
    // 1 demanding; 2b on standard's choice as Kiln re-read it; 3 standard; the added 4 mechanical; the pull request on Audits'.
    expect(launches).toEqual([["fable", "high"], ["opus", "medium"], ["opus", "medium"], ["sonnet", "high"], ["opus", "high"]]);
    expect(row(h.engine, "2b").tier).toEqual({ value: "standard", reason: "store credit has its own rules." });
    expect(row(h.engine, "4").tier).toEqual({ value: "mechanical", reason: "one CSV export." });
    expect(choiceOf(row(h.engine, "4"))).toEqual(["ran_on", "Claude Code", "Sonnet 5.5", "high"]);
    // Every tier line on the feature branch is the one a document's author wrote: Kiln wrote or changed none.
    const tierLines = (name: string) => execFileSync(h.tools.git, ["show", `origin/${h.engine.record.settings.featureBranch}:${DIRECTORY}/${name}`], { cwd: h.repository, env: h.env, encoding: "utf8" }).split("\n").filter(line => line.includes("Model tier"));
    expect(tierLines("phase-1-return-intake.md")).toEqual(["**Model tier:** demanding — AC-RET-02 moves money on retries."]);
    expect(tierLines("phase-2a-card-refunds.md")).toEqual(["**Model tier:** standard"]);
    expect(tierLines("phase-2b-store-credit.md")).toEqual(["**Model tier:** standard — store credit has its own rules."]);
    expect(tierLines("phase-3-returns-dashboard.md")).toEqual(["**Model tier:** standard — dashboard reads only."]);
    expect(tierLines("phase-4-returns-export.md")).toEqual(["**Model tier:** mechanical - one CSV export."]);
  });
});

describe("Model defaults reach every activity that hasn't started (AC-PICK-01)", () => {
  it("reads the file as it is now, and a file that doesn't parse holds Start naming it", async () => {
    const h = await fixture(allPhases());
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } }, audits: { first: { agentId: "claude_code", family: "haiku" } } });
    h.engine.modelChoicesChanged();
    expect(choiceOf(row(h.engine, "3"))).toEqual(["will_run_on", "Claude Code", "Sonnet 5.5", "low"]);
    // The demanding row wasn't set, so it stays Kiln's own.
    expect(choiceOf(row(h.engine, "1"))).toEqual(["will_run_on", "Claude Code", "Fable 5.1", "high"]);

    const path = writeModelDefaults(h.env, {});
    writeFileSync(path, "{ not json");
    h.engine.modelChoicesChanged();
    expect(row(h.engine, "3").model?.problem).toContain(path);
    const answer = await h.engine.start({ refinementConfirmed: true });
    expect(answer).toMatchObject({ ok: false });
    expect((answer as { reason: string }).reason).toContain(path);
    expect(buildSnapshot(h.engine).settings.models.problem).toContain(path);
    expect(h.claudeCalls()).toEqual([]);
  });

  it("holds Start, naming the choice and where to change it, when the agent doesn't offer a row's model (AC-PICK-06)", async () => {
    const h = await fixture(allPhases());
    writeModelDefaults(h.env, { demanding: { first: { agentId: "claude_code", family: "mythos", effort: "high" } } });
    h.engine.modelChoicesChanged();
    expect(row(h.engine, "1").model).toMatchObject({ state: "will_run_on", choice: { modelName: "Mythos", effort: "high" }, problem: "Claude Code doesn't offer Mythos on this account." });
    const answer = await h.engine.start({ refinementConfirmed: true });
    expect(answer).toEqual({ ok: false, status: 409, reason: "Phase 1 runs on Claude Code · Mythos · high from Model defaults (Demanding row): Claude Code doesn't offer Mythos on this account. Change the Demanding row in Model defaults." });
    expect(h.claudeCalls()).toEqual([]);
  });
});

describe("a computer without Claude Code (AC-DEFAULT-04)", () => {
  it("gives each activity its row's Codex choice from the Fallback column, with the note", async () => {
    harness = await createHarness({ sessions: allPhases(), files: tieredFiles(), claude: "/nonexistent/claude" });
    const read = readPlanAt(harness.repository, DIRECTORY);
    if (!read.ok) throw new Error(read.problem);
    harness.engine.record.plan = recordedPlan(read.plan);
    harness.engine.modelChoicesChanged();
    expect(harness.engine.claudeCodeInstalled).toBe(false);
    for (const id of ["1", "2b", "3"]) expect(row(harness.engine, id).model).toMatchObject({ claudeCodeMissing: true, from: "model_defaults", choice: { agentId: "codex", agent: "Codex" } });
    // Each row's Codex choice is its tier's Fallback column: GPT Astra · high for demanding, GPT Sol · high for the rest, GPT Sol · extra high for audits.
    const notStarted = (key: string) => harness!.engine.notStartedChoice(key);
    expect(notStarted("1")).toMatchObject({ agentId: "codex", modelName: "GPT Astra", effort: "high", row: "demanding" });
    expect(notStarted("2b")).toMatchObject({ agentId: "codex", modelName: "GPT Sol", effort: "high", row: "mechanical" });
    expect(notStarted("3")).toMatchObject({ agentId: "codex", modelName: "GPT Sol", effort: "high", row: "standard" });
    expect(notStarted("pr")).toMatchObject({ agentId: "codex", modelName: "GPT Sol", effort: "xhigh", row: "audits" });
    expect(harness.engine.agentOf("1")).toBe("codex");
    expect(harness.engine.agentOf("pr")).toBe("codex");
    expect(Object.keys(harness.engine.neededBy())).toEqual(["codex"]);
  });
});

describe("the start line (AC-PICK-02, AC-PICK-04)", () => {
  it("starts an activity at its session's first model response, and its row reads Running on", async () => {
    const h = await fixture([{ actions: [{ text: "Reading the phase." }, { waitForFile: "release-start-line" }, { result: "Stopped." }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.record.phases["1"]?.startedSessionId !== undefined);
    const session = h.engine.latestSession("1")!;
    expect(h.engine.record.phases["1"]!.startedSessionId).toBe(session.sessionId);
    expect(session.firstResponseAt).toBeDefined();
    expect(choiceOf(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "Fable 5.1", "high"]);
    expect(buildSnapshot(h.engine).current).toMatchObject({ tier: { value: "demanding" }, choice: { agent: "Claude Code", modelName: "Fable 5.1", effort: "high" } });
    // A started activity keeps what it started on, whatever Model defaults say now.
    writeModelDefaults(h.env, { demanding: { first: { agentId: "claude_code", family: "opus", effort: "low" } } });
    h.engine.modelChoicesChanged();
    expect(choiceOf(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "Fable 5.1", "high"]);
    writeFileSync(`${h.engine.worktreePath}/release-start-line`, "go");
    await h.engine.settled();
  });

  it("leaves an activity refused before any response not started, so it still follows its current choice", async () => {
    const h = await fixture([{ actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3600 } }, { exit: 1 }] }]);
    await h.engine.changeSettings({ resumeAfterUsageLimit: false });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(buildSnapshot(h.engine).needsYou?.phaseId).toBe("1");
    expect(h.engine.latestSession("1")!.firstResponseAt).toBeUndefined();
    expect(h.engine.record.phases["1"]!.startedSessionId).toBeUndefined();
    writeModelDefaults(h.env, { demanding: { first: { agentId: "claude_code", family: "opus", effort: "low" } } });
    h.engine.modelChoicesChanged();
    expect(choiceOf(row(h.engine, "1"))).toEqual(["will_run_on", "Claude Code", "Opus 5.5", "low"]);
  });

  it("runs a started activity's carry-on session on the concrete model it started on, skipping the newer defaults (AC-PICK-04)", async () => {
    const h = await fixture([{ noTranscript: true, actions: [{ text: "Building." }, { write: { path: "src/partial.txt", content: "half\n" } }, { commit: "wip: intake" }, { result: "Blocked: waiting on the import." }] }, landingSession("src/one.txt")]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(buildSnapshot(h.engine).needsYou?.carryOn).toMatchObject({ available: true });
    // Model defaults change after the activity started; its carry-on still runs on what it started on.
    writeModelDefaults(h.env, { demanding: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } });
    h.engine.modelChoicesChanged();
    const view = h.engine.controlView();
    const answer = h.engine.commands.submit({ command_id: "carry-1", execution_id: h.engine.record.executionId!, status_token: view.token, action: "carry-on", inputs: { message: "The import is merged." } }, "caller", true);
    expect(answer.ok, JSON.stringify(answer.errors)).toBe(true);
    await h.engine.commands.settled();
    await h.engine.settled();
    expect((h.engine.commands.lookup("carry-1").operation as Receipt).effects.session).toBe("started");
    const second = h.claudeCalls()[1]!;
    expect(second.args).not.toContain("--resume");
    expect(flag(second.args, "--model")).toBe("claude-fable-5-1");
    expect(flag(second.args, "--effort")).toBe("high");
    expect(h.engine.phaseSessions("1")[1]).toMatchObject({ model: "claude-fable-5-1", effort: "high", startedAs: "carry_on" });
  });
});

describe("a phase finished in an earlier execution (AC-PICK-02)", () => {
  it("reads Ran on from the retained execution's latest session that got a response, and No model recorded otherwise", async () => {
    const h = await fixture(allPhases());
    const earlier = structuredClone(h.engine.record);
    earlier.executionId = randomUUID(); earlier.startedAt = "2026-10-01T10:00:00.000Z"; earlier.completedAt = "2026-10-01T12:00:00.000Z";
    const old = (id: string, model: string, initModel: string, effort: string, firstResponseAt?: string): SessionRecord => ({ schemaVersion: SCHEMA_VERSION, executionId: earlier.executionId!, agentId: "claude_code", sessionId: id, phaseId: "1", kind: "phase", createdAt: "2026-10-01T10:00:00.000Z", model, initModel, modelDisplayName: model === "fable" ? "Fable 5.1" : "Opus 5.5", effort, ...(firstResponseAt ? { firstResponseAt } : {}), runs: [{ startedAt: firstResponseAt ?? "2026-10-01T10:30:00.000Z", endedAt: "2026-10-01T11:00:00.000Z", cause: "launch" }], sleeps: [], steps: [] });
    writeSessionRecord(h.stateDirectory, old("old-1a", "opus", "claude-opus-5-5", "medium", "2026-10-01T10:01:00.000Z"));
    writeSessionRecord(h.stateDirectory, old("old-1b", "fable", "claude-fable-5-1", "high", "2026-10-01T10:40:00.000Z"));
    // Phase 3 was finished by the person after a launch that never got a response.
    writeSessionRecord(h.stateDirectory, { ...old("old-3", "opus", "claude-opus-5-5", "medium"), phaseId: "3" });
    earlier.phases = { "1": { sessionIds: ["old-1a", "old-1b"], doneAt: "2026-10-01T11:00:00.000Z", finishedByPerson: false, repositories: {} }, "3": { sessionIds: ["old-3"], doneAt: "2026-10-01T11:30:00.000Z", finishedByPerson: true, repositories: {} } };
    const archiveId = retainExecution(h.stateDirectory, earlier);
    h.engine.record.continuation = { formatVersion: 1, journalIndexed: true, acceptances: [], executions: [{ executionId: earlier.executionId!, archiveId, startedAt: earlier.startedAt, completedAt: earlier.completedAt, branch: "feature/customer-returns", deliveries: [] }] };
    h.engine.record.plan = h.engine.record.plan!.map(phase => phase.id === "1" || phase.id === "3" ? { ...phase, closed: true } : phase);
    expect(choiceOf(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "Fable 5.1", "high"]);
    expect(choiceOf(row(h.engine, "3"))).toEqual(["none_recorded"]);
    // A phase closed outside Kiln has no sessions anywhere.
    expect(choiceOf(row(h.engine, "2a"))).toEqual(["none_recorded"]);
    expect(row(h.engine, "2a").model?.problem).toBeUndefined();
  });
});

describe("a phase that started on the fallback in an earlier execution (AC-FALLBACK-03)", () => {
  it.each([["names it", true], ["is found by its first response, when the record names none", false]])("keeps its Fallback tag on the Ran on row, from the session that started it: the record %s", async (_, named) => {
    const h = await fixture(allPhases());
    const earlier = structuredClone(h.engine.record);
    earlier.executionId = randomUUID(); earlier.startedAt = "2026-10-01T10:00:00.000Z"; earlier.completedAt = "2026-10-01T12:00:00.000Z";
    const old = (id: string, at: string, launch?: SessionRecord["launch"]): SessionRecord => ({ schemaVersion: SCHEMA_VERSION, executionId: earlier.executionId!, agentId: "codex", sessionId: id, phaseId: "1", kind: "phase", createdAt: at, model: "gpt-6.1-sol", modelDisplayName: "GPT-6.1-Sol", effort: "high", firstResponseAt: at, ...(launch ? { launch } : {}), runs: [{ startedAt: at, endedAt: "2026-10-01T11:00:00.000Z", cause: "launch" }], sleeps: [], steps: [] });
    // It started on its Codex fallback; a carry-on session, with no decision of its own, finished it.
    writeSessionRecord(h.stateDirectory, old("old-start", "2026-10-01T10:01:00.000Z", { from: "changed", fallback: { used: true, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95, first: { agentId: "claude_code", model: "opus", modelName: "Opus 5.5", effort: "medium" } } }));
    writeSessionRecord(h.stateDirectory, old("old-carry-on", "2026-10-01T10:40:00.000Z"));
    earlier.phases = { "1": { sessionIds: ["old-start", "old-carry-on"], ...(named ? { startedSessionId: "old-start" } : {}), doneAt: "2026-10-01T11:00:00.000Z", finishedByPerson: false, repositories: {} } };
    const archiveId = retainExecution(h.stateDirectory, earlier);
    h.engine.record.continuation = { formatVersion: 1, journalIndexed: true, acceptances: [], executions: [{ executionId: earlier.executionId!, archiveId, startedAt: earlier.startedAt, completedAt: earlier.completedAt, branch: "feature/customer-returns", deliveries: [] }] };
    h.engine.record.plan = h.engine.record.plan!.map(phase => phase.id === "1" ? { ...phase, closed: true } : phase);
    expect(row(h.engine, "1").model).toMatchObject({ state: "ran_on", choice: { agent: "Codex", modelName: "GPT-6.1-Sol" }, from: "changed", fallback: { used: true, limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95, first: { agent: "Claude Code" } } });
  });
});

describe("planned rows and a choice found unusable during the run (AC-PICK-02, AC-PICK-06)", () => {
  it("shows planned Delivery audit, Test audit and pull request rows on the Audits choice while a phase runs", async () => {
    const h = await fixture([{ actions: [{ text: "Working." }, { waitForFile: "release-planned" }, { result: "Stopped." }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.record.phases["1"]?.startedSessionId !== undefined);
    const rows = buildSnapshot(h.engine).activities!;
    const planned = rows.filter(one => one.plannedActivity);
    expect(planned.map(one => [one.id, one.kind, one.title])).toEqual([["planned-delivery-audit", "delivery_audit", "Delivery audit"], ["planned-test-audit", "test_audit", "Test audit"], ["planned-pull-request", "final_delivery", "Pull request"]]);
    expect(rows.slice(-3)).toEqual(planned);
    for (const one of planned) expect(choiceOf(one)).toEqual(["will_run_on", "Claude Code", "Opus 5.5", "high"]);
    // Rows that aren't phases carry no tier tag (AC-TIER-02), while the running phase does.
    for (const one of planned) expect(one.tier).toBeUndefined();
    expect(rows.find(one => one.id === "1")!.tier).toEqual({ value: "demanding", reason: "AC-RET-02 moves money on retries." });
    // Planned rows don't count as phases.
    expect(buildSnapshot(h.engine).feature.phasesTotal).toBe(4);
    writeFileSync(`${h.engine.worktreePath}/release-planned`, "go");
    await h.engine.settled();
  });

  it("stops at a phase whose choice became unusable mid-run, naming it and launching nothing in its place", async () => {
    const h = await fixture([{ actions: [{ text: "Working." }, { waitForFile: "release-midrun" }, { close: true }, { commit: "feat: intake" }, { push: true }, { result: "Done." }] }, landingSession("src/two-b.txt")]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.record.phases["1"]?.startedSessionId !== undefined);
    // Model defaults change while phase 1 runs: mechanical phases now name a model the account doesn't offer.
    writeModelDefaults(h.env, { mechanical: { first: { agentId: "claude_code", family: "mythos", effort: "high" } } });
    writeFileSync(`${h.engine.worktreePath}/release-midrun`, "go");
    await h.engine.settled();
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop).toMatchObject({ phaseId: "2b", kind: "selection" });
    expect(stop.checks[0]!.facts[0]).toBe("Phase 2b runs on Claude Code · Mythos · high from Model defaults (Mechanical row): Claude Code doesn't offer Mythos on this account. Change the Mechanical row in Model defaults.");
    // Phase 1 ran; nothing launched for 2b on anything else.
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("republishes the page when the Model defaults file changes, without being told", async () => {
    const h = await fixture(allPhases());
    let published = 0;
    h.engine.onChange(() => { published++; });
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "haiku", effort: "low" } } });
    await waitFor(() => published > 0 && choiceOf(row(h.engine, "3"))[2] === "Haiku 5.5");
    expect(choiceOf(row(h.engine, "3"))).toEqual(["will_run_on", "Claude Code", "Haiku 5.5", "low"]);
  });
});
