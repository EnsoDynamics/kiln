// Each activity's model through the engine (Kiln Phase Model Tiers, Phase 1: AC-TIER-01,
// AC-TIER-02, AC-PICK-01, AC-PICK-02, AC-PICK-04, AC-PICK-06, AC-DEFAULT-01, AC-DEFAULT-04,
// AC-KEEP-01), against real Git with the stand-in claude and gh: the tier line picks the model
// each launch runs on, every row says what it will run on, runs on or ran on, the first model
// response starts the activity and a refusal before one doesn't, a started activity's later
// session runs on the concrete model it started on, and a choice that can't be used holds Start.

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
  await harness.engine.agents.refresh();
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

  it("refuses Start while the plan's activities resolve to both agents, until Kiln checks both", async () => {
    const h = await fixture(allPhases());
    writeModelDefaults(h.env, { mechanical: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } });
    h.engine.modelChoicesChanged();
    expect(h.engine.neededAgents().sort()).toEqual(["claude_code", "codex"]);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false, reason: expect.stringContaining("run on both Claude Code and Codex") });
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
    expect(harness.engine.agents.state.agentId).toBe("codex");
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
