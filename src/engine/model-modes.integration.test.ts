// The modes in the engine (Kiln Model Modes, Phase 1: AC-MODE-02, AC-MODE-03, AC-WHEN-02,
// AC-WHEN-03, AC-ROW-01, AC-CARRY-01), through the engine against real Git with the stand-in
// claude and the Codex work stand-in. The settings are read from files written as this version
// saves them, Model defaults at the state root and a PRD's own in its state directory, and the
// session each resolution names runs for real on the stand-ins. Usage is supplied at the Claude
// account reader's boundary, to show that no launch reads it where the settings say not to.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type HarnessOptions, type ScenarioSession } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { writeModelDefaults, writePrdSettings, writeSettings, type SavedSettings } from "../test-support/model-choices.js";
import { ScriptedClaude, signedIn, usageRow, type ScriptedReading } from "../test-support/scripted-claude.js";
import type { AccountView } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import { modelDefaultsPath, prdSettingsPath, settingsRevision } from "../models/model-defaults.js";
import { requirement } from "../agents/tooling-minimums.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { readPrdRecord, SCHEMA_VERSION, type PrdRecord } from "../state/records.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { Engine, type EngineOptions } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";
import { rowModelTarget } from "../../view/src/lib/models.js";

let harness: Harness | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; await codex?.sandbox.cleanup(); codex = undefined; });

const DIRECTORY = "docs/prds/customer-returns";

/** A Claude account reader that answers every reading at once with the reading the test set, and counts how often it was asked. */
class SetClaude implements ClaudeInfoSource {
  account: AccountView | undefined;
  readonly models = new ScriptedClaude(() => new Date()).models;
  readonly modelListError = undefined;
  asked = 0;
  private readonly listeners = new Set<() => void>();
  constructor(public reading: ScriptedReading) {}
  refreshAccount(): Promise<void> {
    this.asked++;
    const startedAt = new Date().toISOString();
    return new Promise(resolve => setImmediate(() => {
      const updatedAt = new Date().toISOString();
      this.account = { limits: [], ...this.reading, startedAt, updatedAt, limitsObservedAt: updatedAt };
      for (const listener of this.listeners) listener();
      resolve();
    }));
  }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
const weekly = (percent: number) => signedIn([usageRow("session", 20), usageRow("weekly_all", percent)]);
const codexUsage = (percent: number) => ({ accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: percent, windowDurationMins: 300 } } } });

/** The fixture documents with Phase 1 demanding; Phase 2b and 3 carry no tier, and 2a is closed. */
function tieredFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  files["phase-1-return-intake.md"] = files["phase-1-return-intake.md"]!.replace(/\n\n/, "\n\n**Model tier:** demanding — AC-RET-02 moves money on retries.\n\n");
  return files;
}

async function fixture(sessions: ScenarioSession[], options: { claude?: ClaudeInfoSource; withCodex?: boolean; files?: Record<string, string>; engineOptions?: Partial<EngineOptions>; harness?: Pick<HarnessOptions, "preflight" | "extraFolders"> } = {}): Promise<Harness> {
  const claude = options.claude ?? new SetClaude(weekly(20));
  harness = await createHarness({ sessions, files: options.files ?? prdDirectoryFiles(), ...options.harness, engineOptions: { claude, ...options.engineOptions } });
  const h = harness;
  if (options.withCodex) {
    codex = codexWorkFixture();
    Object.assign(h.tools, { codex: codex.options.executable });
    codex.configureEnvironment(h.env);
    codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: codexUsage(10) });
    h.engine.close();
    const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
    h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] }, onTerminal: (event) => h.events.push(event), claude, ...options.engineOptions });
  }
  const read = readPlanAt(h.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => !h.engine.readers.claude_code.state.pending && (!options.withCodex || !h.engine.readers.codex.state.pending));
  return h;
}

/** Writes Model defaults and has the engine read them at once, as its watch on the file would. */
function saved(h: Harness, settings: SavedSettings): void { writeSettings(h.env, settings); h.engine.modelChoicesChanged(); }

/**
 * The fallback used for everything, on the Codex stand-in, which offers GPT Sol at high and low
 * only: the Audits and the Preflight and pull request rows' fallbacks are set to efforts it has.
 */
const EVERYTHING: SavedSettings = {
  fallback: { use: "everything" },
  rows: { audits: { fallback: { agentId: "codex", family: "sol", effort: "high" } }, preflight_pr: { fallback: { agentId: "codex", family: "sol", effort: "low" } } },
};

const row = (engine: Engine, id: string): PhaseView => { const snapshot = buildSnapshot(engine); return [...(snapshot.activities ?? []), ...snapshot.phases].find(one => one.id === id)!; };
const shown = (view: PhaseView) => [view.model?.choice?.agent, view.model?.choice?.modelName, view.model?.choice?.effort, view.model?.from];
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];
const launches = (h: Harness) => h.claudeCalls().filter(call => !call.args.includes("--resume")).map(call => [flag(call.args, "--model"), flag(call.args, "--effort")]);
const codexStarts = () => codex?.calls().filter(call => call.method === "thread/start").length ?? 0;
const allPhases = (): ScenarioSession[] => [landingSession("src/one.txt"), landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()];

describe("one model runs everything that hasn't started (AC-MODE-02)", () => {
  it("shows the one model on every row, keeps each phase's tier, and launches every phase and the pull request session on it", async () => {
    const h = await fixture(allPhases(), { files: tieredFiles() });
    saved(h, { mode: "one_model" });
    // Until the person picks, the one model is Claude Code · Opus · high, the family resolved to the newest version the account offers.
    for (const id of ["1", "2b", "3", "planned-delivery-audit"]) expect(h.engine.notStartedChoice(id === "planned-delivery-audit" ? "audit-planned" : id), id).toMatchObject({ agentId: "claude_code", model: "opus", modelName: "Opus 5.5", effort: "high", from: "one_model" });
    for (const key of ["pr", "preflight-planned", "merge", "plan-push-op-1"]) expect(h.engine.notStartedChoice(key), key).toMatchObject({ model: "opus", effort: "high", from: "one_model" });
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.settings.models).toMatchObject({ source: "defaults", mode: "one_model", oneModel: { agentId: "claude_code", agent: "Claude Code", family: "opus", familyName: "Opus", modelName: "Opus 5.5", effort: "high" } });
    expect(snapshot.settings.models.oneModel.problem).toBeUndefined();
    // Each phase still shows its tier, whatever model it runs on.
    expect(row(h.engine, "1").tier).toEqual({ value: "demanding", reason: "AC-RET-02 moves money on retries." });
    expect(shown(row(h.engine, "1"))).toEqual(["Claude Code", "Opus 5.5", "high", "one_model"]);
    expect(row(h.engine, "1").model).toMatchObject({ change: { available: true } });
    expect(row(h.engine, "1").model?.useDefault).toBeUndefined();

    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    // The demanding phase, the untiered ones and the pull request session all launched on the one model, not on their rows.
    expect(launches(h)).toEqual([["opus", "high"], ["opus", "high"], ["opus", "high"], ["opus", "high"]]);
    // Each launch saved where its choice came from.
    for (const key of ["1", "2b", "3", "pr"]) expect(h.engine.latestSession(key)?.launch, key).toEqual({ from: "one_model" });
  });

  it("leaves a phase the person changed on its change, and Use the default returns it to the one model", async () => {
    const h = await fixture([landingSession("src/one.txt"), { actions: [{ result: "I think this is done." }] }], { files: tieredFiles() });
    saved(h, { mode: "one_model", oneModel: { agentId: "claude_code", family: "sonnet", effort: "low" } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Claude Code", "Sonnet 5.5", "low", "one_model"]);
    expect(await h.engine.changeModel({ phase: "1" }, { agentId: "claude_code", model: "haiku", effort: "low" })).toEqual({ ok: true });
    expect(shown(row(h.engine, "1"))).toEqual(["Claude Code", "Haiku 5.5", "low", "changed"]);
    expect(row(h.engine, "1").model).toMatchObject({ change: { available: true }, useDefault: true });
    expect(await h.engine.changeModel({ phase: "1" }, "default")).toEqual({ ok: true });
    // The default a phase returns to is the one model, not its tier's choice.
    expect(shown(row(h.engine, "1"))).toEqual(["Claude Code", "Sonnet 5.5", "low", "one_model"]);
    expect(await h.engine.changeModel({ phase: "2b" }, { agentId: "claude_code", model: "haiku", effort: "low" })).toEqual({ ok: true });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(launches(h)).toEqual([["sonnet", "low"], ["haiku", "low"]]);
    expect(h.engine.latestSession("2b")?.launch).toEqual({ from: "changed" });
  });

  it("is Codex · GPT Sol · high on a computer where Claude Code isn't installed, for every activity", async () => {
    harness = await createHarness({ sessions: [], files: tieredFiles(), claude: join(tmpdir(), "kiln-no-such-claude") });
    const h = harness;
    const read = readPlanAt(h.repository, DIRECTORY);
    if (!read.ok) throw new Error(read.problem);
    h.engine.record.plan = recordedPlan(read.plan);
    saved(h, { mode: "one_model" });
    expect(h.engine.claudeCodeInstalled).toBe(false);
    // Not each row's Codex choice from its Fallback column (GPT Astra for the demanding phase): the one model.
    for (const key of ["1", "2b", "audit-planned", "pr"]) {
      const choice = h.engine.notStartedChoice(key);
      expect(choice, key).toMatchObject({ agentId: "codex", modelName: "GPT Sol", effort: "high", from: "one_model" });
      expect(choice.claudeCodeMissing, key).toBeUndefined();
    }
    expect(buildSnapshot(h.engine).settings.models.oneModel).toMatchObject({ agent: "Codex", familyName: "GPT Sol", effort: "high" });
    expect(Object.keys(h.engine.neededBy())).toEqual(["codex"]);
  });

  it("names the one model as where a choice that can't be used came from, and holds Start (AC-PICK-06)", async () => {
    const h = await fixture([], { files: tieredFiles() });
    saved(h, { mode: "one_model", oneModel: { agentId: "claude_code", family: "mythos", effort: "high" } });
    const problem = "Phase 1 runs on Claude Code · Mythos · high from the one model in Model defaults: Claude Code doesn't offer Mythos on this account. Change the one model in Model defaults, or on its row in the phase plan.";
    expect(h.engine.modelsProblem).toBe(problem);
    expect(buildSnapshot(h.engine).settings.models).toMatchObject({ problem, oneModel: { familyName: "Mythos", problem: "Claude Code doesn't offer Mythos on this account." } });
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false });
    expect(h.claudeCalls()).toEqual([]);
  });
});

describe("one model has no fallback (AC-MODE-03)", () => {
  it("launches on the one model without reading usage though the fallback setting says to use it, and needs no agent a fallback names", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([landingSession("src/one.txt"), { actions: [{ result: "I think this is done." }] }], { claude, withCodex: true });
    // The same rows and threshold, without one model: Phase 1 would launch on Codex, and Codex is needed for it.
    saved(h, { fallback: { use: "threshold", threshold: 95 } });
    expect(h.engine.headsUp()).toMatchObject({ key: "1", forecast: { choice: { agentId: "codex" } } });
    expect(h.engine.neededBy().codex).toEqual({ activities: [], fallbackOnly: true });
    expect(h.engine.fallbackThreshold).toBe(95);

    for (const use of ["threshold", "everything"] as const) {
      saved(h, { mode: "one_model", fallback: { use, threshold: 95 } });
      expect(h.engine.fallbackOf("1"), use).toBeUndefined();
      expect(h.engine.fallbackThreshold, use).toBeUndefined();
      expect(h.engine.headsUp(), use).toBeUndefined();
      // Only the agent the activities will run on is checked, billed and shown.
      expect(Object.keys(h.engine.neededBy()), use).toEqual(["claude_code"]);
      const snapshot = buildSnapshot(h.engine);
      expect(snapshot.agents.filter(agent => agent.neededBy.activities.length > 0 || agent.neededBy.fallbackOnly).map(agent => agent.agentId), use).toEqual(["claude_code"]);
      // No limit is read against a threshold (`fallbackThreshold` is what marks one as above it), and no row is tagged or forecast.
      expect(row(h.engine, "1").model?.fallback ?? row(h.engine, "1").model?.forecast ?? row(h.engine, "1").model?.noFallback, use).toBeUndefined();
      // The setting is still reported as saved, for when models are picked for each phase again.
      expect(snapshot.settings.models.fallback, use).toEqual({ use, threshold: 95, enabled: true });
    }

    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.isPhaseDone("1") || h.engine.stoppedPhaseKey() !== undefined);
    await h.engine.settled();
    const first = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    expect(first).toMatchObject({ agentId: "claude_code", model: "opus", effort: "high", launch: { from: "one_model" } });
    expect(first.launch?.fallback).toBeUndefined();
    // Claude Code read 97%, above the saved threshold: no launch went to Codex, and no decision recorded a limit.
    expect(codexStarts()).toBe(0);
    expect(launches(h)[0]).toEqual(["opus", "high"]);
    expect(h.events.some(event => event.kind === "message" && event.text.includes("started on the fallback"))).toBe(false);
  });

  it("waits at a usage limit and picks up again, as with the fallback set to Never", async () => {
    let clock = Date.parse("2026-11-27T12:00:00.000Z");
    const now = () => new Date(clock);
    const claude = new ScriptedClaude(now);
    claude.queue(signedIn([usageRow("session", 97)]), signedIn([usageRow("session", 97)]));
    const reset = Math.floor(now().getTime() / 1000) + 3_600;
    const refused: ScenarioSession = { actions: [{ skill: "enso-method:implement-from-requirements" }, { refuse: { rateLimitType: "five_hour", resetsAt: reset } }, { exit: 1 }] };
    const h = await fixture([refused, landingSession("src/one.txt"), { actions: [{ result: "I think this is done." }] }], { claude, withCodex: true, engineOptions: { now } });
    saved(h, { mode: "one_model", fallback: { use: "threshold", threshold: 90 } });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    // Refused before any response on a limit above the threshold: the run waits on the one model's account, and nothing goes to Codex.
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.engine.waitAgent("1")).toBe("claude_code");
    expect(codexStarts()).toBe(0);
    // A reading with usage left ends the wait, and the phase launches again on the one model.
    clock += 60_000;
    claude.queue(...Array.from({ length: 12 }, () => signedIn([usageRow("session", 2)])));
    void claude.refreshAccount();
    await waitFor(() => h.engine.isPhaseDone("1"), 30_000);
    await h.engine.settled();
    expect(launches(h).slice(0, 2)).toEqual([["opus", "high"], ["opus", "high"]]);
    expect(codexStarts()).toBe(0);
  }, 60_000);
});

describe("For everything launches each activity on its fallback (AC-WHEN-02, AC-WHEN-03)", () => {
  it("hides AC-FALLBACK-04's warning line that the threshold setting shows for the same readings (AC-WHEN-03)", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([], { claude, withCodex: true });
    // Under the threshold setting, Claude Code at 97% would send Phase 1 to Codex: its row warns.
    saved(h, { ...EVERYTHING, fallback: { use: "threshold", threshold: 95 } });
    expect(h.engine.headsUp()).toMatchObject({ key: "1", forecast: { choice: { agentId: "codex" }, limit: { percent: 97 }, threshold: 95 } });
    expect(row(h.engine, "1").model?.forecast).toBeDefined();
    // For everything, with the same readings: no row carries the warning line.
    saved(h, EVERYTHING);
    expect(h.engine.headsUp()).toBeUndefined();
    const snapshot = buildSnapshot(h.engine);
    const rows = [...(snapshot.activities ?? []), ...snapshot.phases];
    expect(rows.length).toBeGreaterThan(3);
    for (const view of rows) expect(view.model?.forecast, view.id).toBeUndefined();
    expect(row(h.engine, "1").model).toMatchObject({ state: "will_run_on", choice: { agent: "Codex" }, fallback: { used: true, forEverything: true } });
  });

  it("shows each row's fallback before Start, launches on it without reading usage, and says the setting is why", async () => {
    const claude = new SetClaude(weekly(5));
    const h = await fixture([landingSession("src/three.txt")], { claude, withCodex: true });
    saved(h, EVERYTHING);
    // Every row that hasn't started shows its fallback as its model choice, tagged, with its first choice kept.
    for (const id of ["1", "2b", "3"]) {
      expect(row(h.engine, id).model, id).toMatchObject({ state: "will_run_on", from: "model_defaults", choice: { agent: "Codex", modelName: "GPT-6.1-Sol", effort: "high" }, fallback: { used: true, forEverything: true, first: { agent: "Claude Code", modelName: "Opus 5.5", effort: "medium" }, from: "model_defaults" }, change: { available: true } });
      expect(row(h.engine, id).model?.fallback, id).not.toHaveProperty("limit");
      expect(row(h.engine, id).model?.fallback, id).not.toHaveProperty("threshold");
    }
    const before = buildSnapshot(h.engine);
    expect(before.settings.models.fallback).toEqual({ use: "everything", threshold: 95, enabled: true });
    expect(before.settings.models.audits).toMatchObject({ choice: { agent: "Codex", modelName: "GPT-6.1-Sol", effort: "high" }, changedByYou: false, fallback: { used: true, forEverything: true, first: { agent: "Claude Code", modelName: "Opus 5.5", effort: "high" } } });
    // The agent an activity will run on is its fallback's: Codex is needed by every row, and Claude Code by none.
    expect(h.engine.neededBy()).toEqual({ codex: { activities: ["Phase 1", "Phase 2b", "Phase 3", "the delivery audit", "the test audit", "the pull request session"], fallbackOnly: false } });
    expect(before.agents.find(agent => agent.agentId === "codex")).toMatchObject({ inUse: true, neededBy: { fallbackOnly: false } });
    expect(before.agents.find(agent => agent.agentId === "claude_code")?.account).toBeUndefined();
    // AC-FALLBACK-04's warning line isn't shown, and no limit is marked as above a threshold.
    expect(h.engine.headsUp()).toBeUndefined();
    expect(before.settings.models.fallback.warning).toBeUndefined();
    expect(h.engine.fallbackOf("1")).toBeUndefined();
    expect(h.engine.modelsProblem).toBeUndefined();

    const asked = claude.asked;
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.startedSessionOf("1") !== undefined || h.engine.stoppedPhaseKey() !== undefined);
    const first = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    // Claude Code read 5%: the launch went to Codex anyway, and the decision records the setting, with the first choice and no limit or threshold.
    expect(first).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", effort: "high" });
    expect(first.launch).toEqual({ from: "model_defaults", fallback: { used: true, forEverything: true, first: { agentId: "claude_code", model: "opus", modelName: "Opus 5.5", effort: "medium" } } });
    expect(h.engine.startedSessionOf("1")?.sessionId).toBe(first.sessionId);
    expect(claude.asked).toBe(asked);
    expect(h.claudeCalls().filter(call => call.args.includes("--model"))).toEqual([]);
    // The terminal's line gives the setting as the reason, in place of a limit reading.
    expect(h.events.filter(event => event.kind === "message" && event.text.includes("started on the fallback"))).toEqual([{ kind: "message", text: "Phase 1 started on the fallback, Codex · GPT-6.1-Sol · high: the fallback is used for everything, so it didn't start on Claude Code · Opus 5.5 · medium. It finishes on Codex." }]);
    // Its row, its card and its phase detail show what AC-FALLBACK-03 says, from the saved decision.
    const started = row(h.engine, "1");
    expect(started.model).toMatchObject({ choice: { agent: "Codex", model: "gpt-6.1-sol", effort: "high" }, fallback: { used: true, forEverything: true, first: { agent: "Claude Code", modelName: "Opus 5.5", effort: "medium" }, from: "model_defaults" } });
    expect(["running_on", "ran_on"]).toContain(started.model?.state);
    expect(started.model?.fallback).not.toHaveProperty("limit");
    expect(started.details?.fallback).toEqual({ from: "model_defaults", used: true, forEverything: true, first: { agentId: "claude_code", agent: "Claude Code", model: "opus", modelName: "Opus 5.5", effort: "medium" } });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(buildSnapshot(h.engine).needsYou?.choiceSource).toBe("Started on Codex · GPT-6.1-Sol · high, which it finishes on.");
    // A usage limit on it now waits for the fallback's account, never the first choice's.
    expect(h.engine.waitAgent("2b")).toBe("codex");

    // The setting changed back reaches what hasn't started; the started phase keeps what it started on (AC-PICK-04).
    saved(h, { fallback: { use: "never" } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Claude Code", "Opus 5.5", "medium", "model_defaults"]);
    expect(row(h.engine, "2b").model?.fallback).toBeUndefined();
    expect(h.engine.launchChoice("1")).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol" });
    expect(row(h.engine, "1").model).toMatchObject({ state: "running_on", choice: { agent: "Codex" }, fallback: { used: true, forEverything: true } });
  });

  it("gives the setting as the reason on the card of a phase running on its fallback", async () => {
    const h = await fixture([], { withCodex: true });
    // The model issues an item and the turn stays open: Phase 1 has started on Codex and is still running.
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: codexUsage(10), itemFirst: true, hang: true });
    saved(h, EVERYTHING);
    const starting = h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.startedSessionOf("1") !== undefined);
    const current = buildSnapshot(h.engine).current!;
    expect(current).toMatchObject({ phaseId: "1", choice: { agent: "Codex", modelName: "GPT-6.1-Sol", effort: "high" } });
    expect(current.fallback).toEqual({ from: "model_defaults", used: true, forEverything: true, first: { agentId: "claude_code", agent: "Claude Code", model: "opus", modelName: "Opus 5.5", effort: "medium" } });
    expect(row(h.engine, "1").model).toMatchObject({ state: "running_on", choice: { agent: "Codex" }, fallback: { used: true, forEverything: true } });
    await h.engine.stop("sigint"); await starting.catch(() => undefined); await h.engine.settled();
  });

  it("wins over a choice the person changed or the PRD kept, whose entry, mark and Use the default stay", async () => {
    const h = await fixture([], { withCodex: true });
    saved(h, EVERYTHING);
    expect(await h.engine.changeModel({ phase: "1" }, { agentId: "claude_code", model: "sonnet", effort: "low" })).toEqual({ ok: true });
    // Changed by you on Claude Code: it launches on its row's Codex fallback, and its own choice is its first choice.
    expect(row(h.engine, "1").model).toMatchObject({ from: "changed", choice: { agent: "Codex", modelName: "GPT-6.1-Sol", effort: "high" }, fallback: { used: true, forEverything: true, from: "changed", first: { agent: "Claude Code", modelName: "Sonnet 5.5", effort: "low" } }, change: { available: true }, useDefault: true });
    expect(h.engine.record.settings.modelChoices.phases["1"]).toEqual({ agentId: "claude_code", model: "sonnet", effort: "low" });
    expect(h.engine.agentOf("1")).toBe("codex");
    // A PRD saved before agent selection, kept on Claude Code, launches on its Codex fallbacks and needs Codex ready (AC-COMPAT-01).
    h.engine.record.settings.modelChoices.kept = { agentId: "claude_code", model: "opus", effort: "high" };
    h.engine.modelChoicesChanged();
    for (const id of ["2b", "3"]) expect(row(h.engine, id).model, id).toMatchObject({ from: "changed", choice: { agent: "Codex" }, fallback: { forEverything: true, first: { agent: "Claude Code", modelName: "Opus 5.5", effort: "high" } } });
    expect(Object.keys(h.engine.neededBy())).toEqual(["codex"]);
    // Its own choice returns when the setting changes.
    saved(h, {});
    expect(shown(row(h.engine, "1"))).toEqual(["Claude Code", "Sonnet 5.5", "low", "changed"]);
    expect(row(h.engine, "1").model?.fallback).toBeUndefined();
  });

  it("launches an activity with no fallback on its own choice, and its row says it has none", async () => {
    const h = await fixture([], { withCodex: true });
    saved(h, EVERYTHING);
    // A model the person picked on the fallback's own agent leaves the phase with no fallback (mockup 7, state B).
    expect(await h.engine.changeModel({ phase: "3" }, { agentId: "codex", model: "gpt-6.1-sol", effort: "low" })).toEqual({ ok: true });
    const model = row(h.engine, "3").model!;
    expect(model).toMatchObject({ state: "will_run_on", from: "changed", choice: { agent: "Codex", modelName: "GPT-6.1-Sol", effort: "low" }, noFallback: true, change: { available: true }, useDefault: true });
    expect(model.fallback).toBeUndefined();
    expect(h.engine.launchChoice("3")).toEqual({ agentId: "codex", model: "gpt-6.1-sol", modelName: "GPT-6.1-Sol", effort: "low" });
    expect(h.engine.notStartedFallbackOf("3")).toEqual({ noFallback: true });
  });

  it("keeps Start unavailable when a fallback can't be used, and never launches on the first choice", async () => {
    // Codex isn't installed: every row's fallback is a choice that can't be used.
    const h = await fixture([landingSession("src/one.txt")]);
    saved(h, { fallback: { use: "everything" } });
    expect(shown(row(h.engine, "1"))).toEqual(["Codex", "GPT Sol", "high", "model_defaults"]);
    expect(h.engine.modelsProblem).toBe(`Codex isn't ready: Codex is not on PATH. Install ${requirement("codex")} and sign in with codex login. Needed by Phase 1, Phase 2b, Phase 3, the delivery audit, the test audit and the pull request session.`);
    expect(buildSnapshot(h.engine).settings.models.problem).toContain("Codex isn't ready: Codex is not on PATH.");
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false });
    expect(h.claudeCalls()).toEqual([]);
    expect(h.engine.record.startedAt).toBeUndefined();
  });

  it("holds Start on a fallback whose effort its agent doesn't offer, naming the row's Fallback column and the setting", async () => {
    const h = await fixture([], { withCodex: true });
    // Kiln's own Preflight and pull request fallback is GPT Sol · medium, an effort the stand-in's GPT Sol doesn't offer.
    saved(h, { fallback: { use: "everything" }, rows: { audits: { fallback: { agentId: "codex", family: "sol", effort: "high" } } } });
    expect(h.engine.modelsProblem).toBe("The preflight and the pull request session run on Codex · GPT-6.1-Sol · medium from the Preflight and pull request row's Fallback column in Model defaults, used for everything: GPT-6.1-Sol doesn't offer medium effort. Change that row's fallback, or the fallback setting, in Model defaults.");
    // The same row, not used for everything, keeps its first choice, which can be used.
    saved(h, { rows: { audits: { fallback: { agentId: "codex", family: "sol", effort: "high" } } } });
    expect(h.engine.modelsProblem).toBeUndefined();
  });

  it("resumes a phase that started before the setting on what it started on, and stops the next launch on a fallback that can't be used", async () => {
    // Codex isn't installed. Phase 1 answers and stops at Needs you under the recommended setting: it has started on Claude Code.
    const h = await fixture([{ actions: [{ result: "I think this is done." }] }, landingSession("src/one.txt"), landingSession("src/two-b.txt")]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(h.engine.startedSessionOf("1")).toBeDefined();
    saved(h, { fallback: { use: "everything" } });
    // The started phase is untouched (AC-PICK-04): its row, its agent and its next session keep what it started on.
    expect(row(h.engine, "1").model).toMatchObject({ state: "running_on", choice: { agent: "Claude Code", modelName: "Opus 5.5", effort: "medium" } });
    expect(row(h.engine, "1").model?.fallback).toBeUndefined();
    expect(h.engine.agentOf("1")).toBe("claude_code");
    expect(h.engine.launchChoice("1")).toMatchObject({ agentId: "claude_code", effort: "medium" });
    expect(row(h.engine, "2b").model).toMatchObject({ choice: { agent: "Codex" }, fallback: { forEverything: true } });
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await waitFor(() => h.engine.isPhaseDone("1") && h.engine.stoppedPhaseKey() === "2b", 30_000);
    await h.engine.settled();
    // The resume reopened Phase 1's own Claude Code conversation; nothing of it moved to the fallback.
    const calls = h.claudeCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.args).toContain("--resume");
    expect(h.engine.record.phases["1"]!.sessionIds.map(id => h.engine.sessionRecord("1", id)!.agentId)).toEqual(["claude_code"]);
    // Phase 2b's launch stops on its fallback, which can't be used; it never runs on Opus.
    expect(h.engine.record.phases["2b"]?.stop?.kind).toBe("selection");
    expect(h.engine.record.phases["2b"]?.sessionIds ?? []).toEqual([]);
    expect(launches(h)).toEqual([["opus", "medium"]]);
    const facts = buildSnapshot(h.engine).needsYou!.checks.flatMap(check => check.facts.map(fact => typeof fact === "string" ? fact : (fact as { text: string }).text));
    expect(facts.join(" ")).toContain("Codex is not on PATH.");
  });

  it("waits for the fallback's account at a usage limit, and launches again on the fallback, never on the first choice", async () => {
    const claude = new SetClaude(weekly(5));
    const h = await fixture([landingSession("src/one.txt")], { claude, withCodex: true });
    const set = (value: Record<string, unknown>) => codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usageRefusal: true, ...value });
    const threads = () => codex!.calls().filter(call => call.method === "thread/start");
    // Codex refuses at its usage limit; Claude Code, the first choice, has nearly all of its usage left.
    set({ ordinaryUsageAllowed: false });
    saved(h, EVERYTHING);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    await h.engine.refreshAgents(); await h.engine.settled();
    const refused = h.engine.latestSession("1")!;
    expect(refused).toMatchObject({ agentId: "codex", launch: { fallback: { used: true, forEverything: true } } });
    // Refused before any response: the run waits, on the fallback's account, and nothing ran on Claude Code.
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    expect(h.engine.waitAgent("1")).toBe("codex");
    expect(threads()).toHaveLength(1);
    expect(h.claudeCalls()).toEqual([]);
    // Claude Code's account being free doesn't end the wait.
    await claude.refreshAccount(); await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.claudeCalls()).toEqual([]);
    // Codex's usage allowed again ends it: one new session, on Codex again, recording the setting again.
    set({ ordinaryUsageAllowed: true });
    await h.engine.refreshAgents(); await h.engine.refreshAgents(); await h.engine.settled();
    await waitFor(() => h.engine.latestSession("1")?.sessionId !== refused.sessionId && h.engine.latestSession("1")!.runs[0]?.endedAt !== undefined);
    await h.engine.refreshAgents(); await h.engine.settled();
    const fresh = h.engine.latestSession("1")!;
    expect(fresh).toMatchObject({ agentId: "codex", relaunchOf: { sessionId: refused.sessionId, run: 0 }, launch: { from: "model_defaults", fallback: { used: true, forEverything: true, first: { agentId: "claude_code", model: "opus" } } } });
    expect(threads()).toHaveLength(2);
    expect(h.claudeCalls()).toEqual([]);
  }, 60_000);
});

describe("the preflight and the pull request session share a row of their own (AC-ROW-01)", () => {
  const ready: ScenarioSession = { actions: [{ skill: "enso-method:build-preflight" }, { result: "Preflight: ready\n\n3 phases. The build runs to the end without stopping." }, { exit: 0 }] };

  it("runs the preflight and the pull request session on the new row's choice, the audits on theirs, and follows a change to the row", async () => {
    const h = await fixture(allPhases(), { harness: { preflight: true } });
    // The preflight's session is scripted apart from the phases'.
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: allPhases(), preflightSessions: [ready] }));
    expect(buildSnapshot(h.engine).preflight?.planned?.model).toMatchObject({ choice: { agent: "Claude Code", modelName: "Opus 5.5", effort: "medium" }, from: "model_defaults", change: { available: true } });
    expect(h.engine.notStartedChoice("audit-planned")).toMatchObject({ model: "opus", effort: "high", row: "audits" });
    // The row is changed like the others, for every PRD.
    writeModelDefaults(h.env, {});
    saved(h, { rows: { preflight_pr: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } } });
    expect(buildSnapshot(h.engine).preflight?.planned?.model).toMatchObject({ choice: { modelName: "Sonnet 5.5", effort: "low" }, from: "model_defaults" });
    expect(h.engine.notStartedChoice("audit-planned")).toMatchObject({ model: "opus", effort: "high" });
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    // The preflight first and the pull request session last, both on the row; the phases between on their tier's choice.
    expect(launches(h)).toEqual([["sonnet", "low"], ["opus", "medium"], ["opus", "medium"], ["opus", "medium"], ["sonnet", "low"]]);
    // The merge and Continue's push session resolve on the same row, and a finished run offers no Change for it.
    for (const key of ["merge", "plan-push-op-1"]) expect(h.engine.notStartedChoice(key), key).toMatchObject({ model: "sonnet", effort: "low", from: "model_defaults", row: "preflight_pr" });
    expect(h.engine.checkModelChange("preflight_pr", "default")).toEqual({ ok: false, status: 409, reason: "The run is complete; no activity is left to change." });
    expect(row(h.engine, "pr").model?.change).toBeUndefined();
  });

  it("changes the row's choice for one PRD from the Preflight row, reaching the pull request session, the merge and the push, and never the audits", async () => {
    const h = await fixture([], { harness: { preflight: true } });
    expect(await h.engine.changeModel("preflight_pr", { agentId: "claude_code", model: "haiku", effort: "low" })).toEqual({ ok: true });
    expect(h.engine.record.settings.modelChoices).toEqual({ phases: {}, preflightPr: { agentId: "claude_code", model: "haiku", effort: "low" } });
    for (const key of ["preflight-planned", "pr", "merge", "plan-push-op-1"]) expect(h.engine.notStartedChoice(key), key).toMatchObject({ model: "haiku", from: "changed" });
    expect(h.engine.notStartedChoice("audit-planned")).toMatchObject({ model: "opus", effort: "high", from: "model_defaults" });
    expect(buildSnapshot(h.engine).preflight?.planned?.model).toMatchObject({ from: "changed", change: { available: true }, useDefault: true });
    // It is kept across a restart, and undone as AC-PICK-03 says.
    const reopened = h.reopenFromDisk();
    await reopened.refreshAgents();
    expect(reopened.notStartedChoice("pr")).toMatchObject({ model: "haiku", from: "changed" });
    expect(await reopened.changeModel("preflight_pr", "default")).toEqual({ ok: true });
    expect(reopened.notStartedChoice("pr")).toMatchObject({ model: "opus", effort: "medium", from: "model_defaults" });
  });

  it("changes the row's choice from the pull request row while the pull request session is next but hasn't launched", async () => {
    const h = await fixture(allPhases());
    // Paused during Phase 3: once it closes, the pull request session is next and nothing has launched it.
    let requested = false;
    const off = h.engine.onChange(() => { if (!requested && h.engine.current?.phaseKey === "3" && h.engine.current.session) { requested = true; h.engine.pause(); } });
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled(); off();
    expect(h.engine.record.nextActivityKey).toBe("pr");
    expect(h.engine.latestSession("pr")).toBeUndefined();
    // The row is the pull request's, so its Change targets the Preflight and pull request choice, not a phase.
    const pr = row(h.engine, "pr");
    expect(pr).toMatchObject({ kind: "final_delivery", state: "next", model: { change: { available: true } } });
    expect(rowModelTarget(pr)).toBe("preflight_pr");
    expect(await h.engine.changeModel("preflight_pr", { agentId: "claude_code", model: "haiku", effort: "low" })).toEqual({ ok: true });
    expect(row(h.engine, "pr").model).toMatchObject({ choice: { modelName: "Haiku 5.5", effort: "low" }, from: "changed", useDefault: true });
    expect(h.engine.notStartedChoice("pr")).toMatchObject({ model: "haiku", from: "changed" });
  });

  it("changes the row's choice from the pull request row when its launch stopped on a choice that can't be used", async () => {
    const h = await fixture(allPhases());
    // While Phase 3 runs, the row's first choice moves to an agent this computer doesn't have, so the pull request session can't launch.
    let changed = false;
    const off = h.engine.onChange(() => { if (!changed && h.engine.current?.phaseKey === "3" && h.engine.current.session) { changed = true; saved(h, { rows: { preflight_pr: { first: { agentId: "codex", family: "sol", effort: "high" } } } }); } });
    expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await h.engine.settled(); off();
    expect(h.engine.record.phases.pr?.stop?.kind).toBe("selection");
    expect(h.engine.latestSession("pr")).toBeUndefined();
    const pr = row(h.engine, "pr");
    expect(pr).toMatchObject({ kind: "final_delivery", state: "needs_you", model: { change: { available: true } } });
    expect(rowModelTarget(pr)).toBe("preflight_pr");
    expect(await h.engine.changeModel("preflight_pr", { agentId: "claude_code", model: "haiku", effort: "low" })).toEqual({ ok: true });
    expect(h.engine.notStartedChoice("pr")).toMatchObject({ model: "haiku", from: "changed" });
  });

  it("looks up the audits' skill on the Audits choice's agent and the preflight's on the Preflight and pull request choice's", async () => {
    const h = await fixture([], { withCodex: true });
    expect([h.engine.auditsAgent, h.engine.preflightPrAgent]).toEqual(["claude_code", "claude_code"]);
    await h.engine.changeModel("audits", { agentId: "codex", model: "gpt-6.1-sol", effort: "high" });
    expect([h.engine.auditsAgent, h.engine.preflightPrAgent]).toEqual(["codex", "claude_code"]);
    await h.engine.changeModel("audits", "default");
    await h.engine.changeModel("preflight_pr", { agentId: "codex", model: "gpt-6.1-sol", effort: "high" });
    expect([h.engine.auditsAgent, h.engine.preflightPrAgent]).toEqual(["claude_code", "codex"]);
    // The agents needed follow each activity's own choice.
    expect(h.engine.neededBy()).toMatchObject({ claude_code: { activities: expect.arrayContaining(["Phase 1", "the delivery audit", "the test audit"]) }, codex: { activities: ["the pull request session"], fallbackOnly: false } });
  });
});

describe("a PRD's own settings are read in place of Model defaults (\"Settings in Force\")", () => {
  it("takes its choices from model-settings.json in its state directory as soon as it exists, and follows the defaults again once it is gone", async () => {
    const h = await fixture([landingSession("src/one.txt"), { actions: [{ result: "I think this is done." }] }]);
    saved(h, { rows: { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } } });
    expect(shown(row(h.engine, "1"))).toEqual(["Claude Code", "Sonnet 5.5", "low", "model_defaults"]);
    const defaultsOnly = buildSnapshot(h.engine).settings.models;
    expect(defaultsOnly).toMatchObject({ source: "defaults", mode: "recommended" });

    // The running Kiln notices the PRD's own settings with no other step, and republishes its page. Only that notice
    // records the files' revision it last saw, so the recorded revision is what shows it noticed.
    const noticed = () => (h.engine as unknown as { settingsSeen: string }).settingsSeen === settingsRevision(h.engine.settingsPaths);
    let published = 0;
    const off = h.engine.onChange(() => { published++; });
    const own = writePrdSettings(h.stateDirectory, { mode: "one_model", oneModel: { agentId: "claude_code", family: "haiku", effort: "low" } });
    expect(own).toBe(prdSettingsPath(h.stateDirectory));
    expect(noticed()).toBe(false);
    await waitFor(noticed);
    expect(published).toBeGreaterThan(0);
    off();
    const withOwn = buildSnapshot(h.engine).settings.models;
    expect(withOwn).toMatchObject({ source: "prd", mode: "one_model", oneModel: { agent: "Claude Code", familyName: "Haiku", modelName: "Haiku 5.5", effort: "low" } });
    expect(withOwn.revision).not.toBe(defaultsOnly.revision);
    expect(withOwn.revision).toBe(settingsRevision(h.engine.settingsPaths));
    expect(shown(row(h.engine, "1"))).toEqual(["Claude Code", "Haiku 5.5", "low", "one_model"]);
    // Model defaults are unchanged, and a change to them doesn't reach this PRD.
    saved(h, { rows: { standard: { first: { agentId: "claude_code", family: "fable", effort: "high" } } } });
    expect(shown(row(h.engine, "1"))).toEqual(["Claude Code", "Haiku 5.5", "low", "one_model"]);
    expect(JSON.parse(readFileSync(modelDefaultsPath(h.env), "utf8"))).not.toHaveProperty("mode");

    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.isPhaseDone("1"));
    // The launch saved that the settings in force were the PRD's own.
    expect(h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!.launch).toEqual({ from: "one_model", ownSettings: true });
    expect(launches(h)[0]).toEqual(["haiku", "low"]);
    await h.engine.settled();

    // They are kept across a restart, and a run picked up after it still reads them.
    const reopened = h.reopenFromDisk();
    await reopened.refreshAgents();
    expect(buildSnapshot(reopened).settings.models).toMatchObject({ source: "prd", mode: "one_model" });
    expect(reopened.notStartedChoice("3")).toMatchObject({ model: "haiku", from: "one_model", ownSettings: true });
    // Removed, the PRD follows the defaults again.
    unlinkSync(own);
    reopened.modelChoicesChanged();
    expect(buildSnapshot(reopened).settings.models).toMatchObject({ source: "defaults", mode: "recommended", revision: expect.stringMatching(/\|missing$/) });
    expect(reopened.notStartedChoice("3")).toMatchObject({ model: "fable", effort: "high", from: "model_defaults" });
    expect(reopened.notStartedChoice("3").ownSettings).toBeUndefined();
  });

  it("keeps a PRD's own settings across an upgrade of Kiln: a record saved by an earlier version still reads them, and the file is left as it was (AC-SAVE-04)", async () => {
    const h = await fixture([]);
    saved(h, { rows: { standard: { first: { agentId: "claude_code", family: "fable", effort: "high" } } } });
    const own = writePrdSettings(h.stateDirectory, { mode: "one_model", oneModel: { agentId: "claude_code", family: "haiku", effort: "low" }, fallback: { use: "never" } });
    const before = readFileSync(own, "utf8");
    // The PRD's record as the earlier version saved it.
    const recordPath = join(h.stateDirectory, "prd.json");
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as PrdRecord;
    record.schemaVersion = SCHEMA_VERSION - 1;
    writeFileSync(recordPath, JSON.stringify(record));

    const upgraded = h.reopenFromDisk();
    await upgraded.refreshAgents();
    expect(upgraded.record.schemaVersion).toBe(SCHEMA_VERSION);
    // The settings in force are still the PRD's own, and its activities that haven't started take their choices from them.
    expect(upgraded.settingsInForce.source).toBe("prd");
    expect(buildSnapshot(upgraded).settings.models).toMatchObject({ source: "prd", mode: "one_model", fallback: { use: "never" }, oneModel: { familyName: "Haiku", effort: "low" } });
    for (const key of ["1", "3", "audit-planned", "pr"]) expect(upgraded.notStartedChoice(key), key).toMatchObject({ model: "haiku", effort: "low", from: "one_model", ownSettings: true });
    expect(upgraded.fallbackThreshold).toBeUndefined();
    // Reading them changed nothing in the file.
    expect(readFileSync(own, "utf8")).toBe(before);
  });

  it("uses the fallback for everything for this PRD alone, naming its own settings as where a choice came from", async () => {
    const h = await fixture([], { harness: { extraFolders: ["store-credit"] } });
    writePrdSettings(h.stateDirectory, { fallback: { use: "everything" } });
    h.engine.modelChoicesChanged();
    // Codex isn't installed: the choice can't be used, and the stop names this PRD's own settings.
    expect(h.engine.notStartedChoice("1")).toMatchObject({ agentId: "codex", from: "model_defaults", ownSettings: true, row: "standard" });
    // Another PRD on the computer, with no settings of its own, still follows Model defaults.
    const other = await h.engineFor("store-credit");
    try {
      expect(existsSync(prdSettingsPath(other.stateDirectory))).toBe(false);
      expect(other.notStartedChoice("1")).toMatchObject({ agentId: "claude_code", from: "model_defaults" });
      expect(buildSnapshot(other).settings.models).toMatchObject({ source: "defaults", fallback: { use: "never" } });
    } finally { other.close(); }
  });

  it("makes every choice unusable, with the file's path, when its own settings can't be read, and never reads Model defaults over them", async () => {
    const h = await fixture([landingSession("src/one.txt")]);
    // Phase 1 is changed for this PRD: before a fallback could be used for everything, such a choice launched without the settings.
    expect(await h.engine.changeModel({ phase: "1" }, { agentId: "claude_code", model: "sonnet", effort: "low" })).toEqual({ ok: true });
    const own = prdSettingsPath(h.stateDirectory);
    writeFileSync(own, "{ broken");
    h.engine.modelChoicesChanged();
    const reason = `This PRD's own settings at ${own} isn't valid JSON. Fix the file, or put this PRD back on your defaults: press Use my defaults here on its Model defaults page, or run kiln model-defaults use-defaults with --prd and this PRD's path.`;
    expect(h.engine.notStartedChoice("2b")).toMatchObject({ from: "model_defaults", ownSettings: true, problem: reason });
    // The unread file may say the fallback is used for everything, which wins over a changed choice: it can't launch either.
    expect(h.engine.notStartedChoice("1")).toMatchObject({ model: "sonnet", from: "changed", ownSettings: true, problem: `${reason} Until it reads, Kiln can't tell whether the fallback is used for everything, so nothing launches.` });
    expect(row(h.engine, "1").model).toMatchObject({ from: "changed", choice: { modelName: "Sonnet 5.5", effort: "low" }, problem: expect.stringContaining(own) });
    expect(h.engine.modelsProblem).toBe(`Phase 1 runs on Claude Code · Sonnet 5.5 · low from a change for this PRD: ${reason} Until it reads, Kiln can't tell whether the fallback is used for everything, so nothing launches.`);
    expect(buildSnapshot(h.engine).settings.models).toMatchObject({ source: "prd", problem: expect.stringContaining(own) });
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false });
    expect(h.claudeCalls()).toEqual([]);
    // The same holds over Model defaults that can't be read, for a PRD that follows them.
    unlinkSync(own);
    writeFileSync(modelDefaultsPath(h.env), "{ broken");
    h.engine.modelChoicesChanged();
    expect(h.engine.notStartedChoice("1")).toMatchObject({ from: "changed", settingsUnreadable: true, problem: expect.stringContaining(modelDefaultsPath(h.env)) });
    expect(h.engine.notStartedChoice("1").ownSettings).toBeUndefined();
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: false });
    expect(h.claudeCalls()).toEqual([]);
  });
});

describe("settings and records saved before the upgrade keep their meaning (AC-CARRY-01)", () => {
  it("reads a schema 1 Model defaults file and a schema 27 record as the table says, and rewrites neither until something changes", async () => {
    // Phase 1 answered before the upgrade, on Kiln's Standard choice then: it has started.
    const h = await fixture([{ actions: [{ result: "I think this is done." }] }]);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const startedOn = h.engine.launchChoice("1");
    expect(startedOn).toMatchObject({ agentId: "claude_code", effort: "medium" });
    // Saved by the earlier version: a changed Standard row, a changed Audits row, and the fallback on at 88.
    const path = writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } }, audits: { first: { agentId: "claude_code", family: "haiku" } } }, { enabled: true, threshold: 88 });
    const before = readFileSync(path, "utf8");
    // A record of schema 27, with an Audits choice changed for this PRD and no entry for the new row.
    const record = JSON.parse(readFileSync(join(h.stateDirectory, "prd.json"), "utf8")) as PrdRecord;
    record.schemaVersion = 27;
    record.settings.modelChoices = { phases: {}, audits: { agentId: "claude_code", model: "sonnet", effort: "max" } };
    writeFileSync(join(h.stateDirectory, "prd.json"), JSON.stringify(record));
    const upgraded = h.reopenFromDisk();
    await upgraded.refreshAgents();

    const models = buildSnapshot(upgraded).settings.models;
    // The mode is the recommended model for each phase, no PRD has its own settings, and the switch reads as the threshold setting.
    expect(models).toMatchObject({ source: "defaults", mode: "recommended", fallback: { use: "threshold", threshold: 88, enabled: true } });
    expect(existsSync(prdSettingsPath(h.stateDirectory))).toBe(false);
    expect(upgraded.fallbackThreshold).toBe(88);
    // A row's first choice is kept, for what hasn't started; the activity that started is untouched (AC-PICK-04).
    expect(upgraded.notStartedChoice("3")).toMatchObject({ model: "sonnet", effort: "low", from: "model_defaults" });
    expect(upgraded.startedSessionOf("1")).toBeDefined();
    expect(upgraded.launchChoice("1")).toEqual(startedOn);
    expect(row(upgraded, "1").model).toMatchObject({ state: "running_on", choice: { agent: "Claude Code", modelName: "Opus 5.5", effort: "medium" } });
    // The Audits choice changed for one PRD is kept for its audits, and for its preflight, pull request, merge and push sessions.
    expect(upgraded.record.schemaVersion).toBe(SCHEMA_VERSION);
    expect(upgraded.record.settings.modelChoices).toEqual({ phases: {}, audits: { agentId: "claude_code", model: "sonnet", effort: "max" }, preflightPr: { agentId: "claude_code", model: "sonnet", effort: "max" } });
    for (const key of ["audit-planned", "preflight-planned", "pr", "merge", "plan-push-op-1"]) expect(upgraded.notStartedChoice(key), key).toMatchObject({ model: "sonnet", effort: "max", from: "changed" });
    // Undone for this PRD, the new row starts from the Audits row as it was changed for every PRD (CARRY-001).
    expect(await upgraded.changeModel("preflight_pr", "default")).toEqual({ ok: true });
    expect(upgraded.notStartedChoice("pr")).toMatchObject({ model: "haiku", from: "model_defaults", row: "preflight_pr" });
    expect(upgraded.fallbackOf("pr")).toMatchObject({ agentId: "codex", modelName: "GPT Sol", effort: "xhigh" });
    expect(readPrdRecord(h.stateDirectory)!.settings.modelChoices.preflightPr).toBe("default");
    // Reading the old file changed nothing in it: it is rewritten as schema 2 only when the person next saves.
    expect(readFileSync(path, "utf8")).toBe(before);
  });
});
