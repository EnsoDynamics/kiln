// The usage fallback (Kiln Phase Model Tiers, Phase 4: AC-FALLBACK-02 to AC-FALLBACK-04, with
// AC-PICK-06 and AC-PICK-07 for the fallback), through the engine against real Git with the
// stand-in claude, the Codex work stand-in and a Claude account reader whose reading the test
// sets: the usage reading is supplied at the reader's boundary, since an account can't be brought
// to the threshold on demand, and the session the decision names runs for real on the stand-ins.

import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { ScriptedClaude, signedIn, usageRow, type ScriptedReading } from "../test-support/scripted-claude.js";
import type { AccountView } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { Engine, type EngineOptions } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";

let harness: Harness | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; await codex?.sandbox.cleanup(); codex = undefined; });

const DIRECTORY = "docs/prds/customer-returns";

/** A Claude account reader that answers every reading at once with the reading the test set last. */
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

/** Codex's usage reading with one counted window at this percent. */
const codexUsage = (percent: number) => ({ accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: percent, windowDurationMins: 300 } } } });

async function fixture(sessions: ScenarioSession[], claude: ClaudeInfoSource, options: { withCodex?: boolean; codexPercent?: number; engineOptions?: Partial<EngineOptions> } = {}): Promise<Harness> {
  harness = await createHarness({ sessions, files: prdDirectoryFiles(), engineOptions: { claude, ...options.engineOptions } });
  const h = harness;
  if (options.withCodex) {
    codex = codexWorkFixture();
    Object.assign(h.tools, { codex: codex.options.executable });
    codex.configureEnvironment(h.env);
    codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: codexUsage(options.codexPercent ?? 10) });
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

const row = (engine: Engine, id: string): PhaseView => { const snapshot = buildSnapshot(engine); return [...(snapshot.activities ?? []), ...snapshot.phases].find(one => one.id === id)!; };
const weekly = (percent: number) => signedIn([usageRow("session", 20), usageRow("weekly_all", percent)]);

describe("Kiln decides only as it launches an activity that hasn't started (AC-FALLBACK-02, AC-FALLBACK-03)", () => {
  it("launches on the fallback when the first choice's account reads at or above the threshold, says so, and decides again for the next launch", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([landingSession("src/three.txt")], claude, { withCodex: true });
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    // The heads-up before Start: Phase 1 would launch on its fallback on the latest readings (AC-FALLBACK-04).
    expect(h.engine.headsUp()).toMatchObject({ key: "1", forecast: { choice: { agentId: "codex", model: "gpt-6.1-sol", effort: "high" }, limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95 } });
    // The decision reads usage for the launch itself: a scheduled reading at 97% is replaced by the fresh one.
    claude.reading = weekly(98);
    const asked = claude.asked;

    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.startedSessionOf("1") !== undefined || h.engine.stoppedPhaseKey() !== undefined);
    const first = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    // The phase launched on Codex · GPT Sol · high, with the decision saved on the session before its process started.
    expect(first).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", effort: "high", launch: { from: "model_defaults", fallback: { used: true, limit: { agentId: "claude_code", label: "Weekly", percent: 98 }, threshold: 95, first: { agentId: "claude_code", model: "opus", effort: "medium" } } } });
    expect(claude.asked).toBeGreaterThan(asked);
    expect(first.runs[0]?.codex?.firstResponseAt).toBeDefined();
    expect(h.engine.startedSessionOf("1")?.sessionId).toBe(first.sessionId);
    // No Claude Code session ran for it.
    expect(h.claudeCalls().filter(call => call.args.includes("--model"))).toEqual([]);
    // The terminal printed one line as it started on the fallback.
    const lines = h.events.filter(event => event.kind === "message" && event.text.includes("started on the fallback"));
    expect(lines).toEqual([{ kind: "message", text: expect.stringMatching(/^Phase 1 started on the fallback, Codex · GPT-6\.1-Sol · high: Claude Code's Weekly read 98%, at or above the 95% threshold, so it didn't start on Claude Code · Opus 5\.5 · medium\. It finishes on Codex\.$/) }]);
    // Its row shows Running on, then Ran on, with the fallback's choice and the Fallback tag; its phase detail keeps the facts.
    const shown = row(h.engine, "1");
    expect(shown.model).toMatchObject({ choice: { agent: "Codex", model: "gpt-6.1-sol", effort: "high" }, fallback: { used: true, limit: { agent: "Claude Code", label: "Weekly", percent: 98 }, threshold: 95, first: { agent: "Claude Code", modelName: "Opus 5.5", effort: "medium" }, from: "model_defaults" } });
    expect(["running_on", "ran_on"]).toContain(shown.model?.state);
    expect(shown.details?.fallback).toMatchObject({ used: true, threshold: 95, limit: { agent: "Claude Code", label: "Weekly", percent: 98 }, first: { agent: "Claude Code", modelName: "Opus 5.5" } });

    // Phase 1 stopped at Needs you (the stand-in doesn't close it). Having started, it keeps the fallback's choice whatever the readings (AC-PICK-04).
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    // The stopped session's facts name what it started on, with no place to change it (AC-PICK-06).
    expect(buildSnapshot(h.engine).needsYou?.choiceSource).toBe("Started on Codex · GPT-6.1-Sol · high, which it finishes on.");
    // A launch check failing for a later session of it (a carry-on or Start again) names what it started on, and no place to change it.
    const launchStopFact = (h.engine as unknown as { launchStopFact(key: string, message: string): string }).launchStopFact.bind(h.engine);
    expect(launchStopFact("1", "Codex isn't signed in. Run codex login.")).toBe("Codex isn't signed in. Run codex login. It started on Codex · GPT-6.1-Sol · high, which it finishes on.");
    claude.reading = weekly(40);
    await claude.refreshAccount();
    expect(h.engine.launchChoice("1")).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol" });
    // The next activity decides on its own: no heads-up while Claude Code is under the threshold, and one on Phase 2b once it isn't.
    expect(h.engine.headsUp()).toBeUndefined();
    claude.reading = weekly(96);
    await claude.refreshAccount();
    expect(h.engine.headsUp()).toMatchObject({ key: "2b", forecast: { choice: { agentId: "codex" }, limit: { percent: 96 } } });
    expect(row(h.engine, "2b").model?.forecast).toMatchObject({ choice: { agent: "Codex" }, threshold: 95 });
    expect(row(h.engine, "1").model?.forecast).toBeUndefined();
    expect(row(h.engine, "1").model?.fallback?.used).toBe(true);
  });

  it("stays on the first choice when the fallback can't take it, and the row says why while the activity is current", async () => {
    const claude = new SetClaude(weekly(97));
    // Codex isn't installed: the fallback's launch checks fail.
    const h = await fixture([landingSession("src/one.txt")], claude);
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    expect(h.engine.headsUp()).toBeUndefined();
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.isPhaseDone("1") || h.engine.stoppedPhaseKey() !== undefined);
    const session = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    expect(session).toMatchObject({ agentId: "claude_code", model: "opus", launch: { from: "model_defaults", fallback: { used: false, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95, reason: expect.stringContaining("Codex is not on PATH") } } });
    expect(h.events.some(event => event.kind === "message" && event.text.includes("started on the fallback"))).toBe(false);
    // Once finished, its row drops the note and its phase detail keeps it.
    await waitFor(() => h.engine.isPhaseDone("1"));
    const done = row(h.engine, "1");
    expect(done.model?.state).toBe("ran_on");
    expect(done.model?.fallback).toBeUndefined();
    expect(done.details?.fallback).toMatchObject({ used: false, reason: expect.stringContaining("Codex is not on PATH") });
  });

  it("reads nothing and launches on the first choice with the switch off, whatever the usage", async () => {
    const claude = new SetClaude(weekly(99));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    writeModelDefaults(h.env, {}, { enabled: false, threshold: 95 });
    h.engine.modelChoicesChanged();
    expect(h.engine.headsUp()).toBeUndefined();
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.isPhaseDone("1") || h.engine.stoppedPhaseKey() !== undefined);
    const session = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    expect(session).toMatchObject({ agentId: "claude_code", model: "opus", launch: { from: "model_defaults" } });
    expect(session.launch?.fallback).toBeUndefined();
  });

  it("never sends a first choice that can't be used to the fallback: the selection stop applies (AC-PICK-06)", async () => {
    const claude = new SetClaude(weekly(99));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "opus", effort: "ultra" } } }, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    expect(h.engine.headsUp()).toBeUndefined();
    h.engine.record.startedAt = new Date().toISOString();
    h.engine.record.executionId ??= "fallback-selection-proof";
    await (h.engine as unknown as { launchReadiness(key: string): Promise<boolean> }).launchReadiness("1");
    expect(h.engine.record.phases["1"]?.stop).toMatchObject({ kind: "selection" });
    expect(codex!.calls().some(call => call.method === "thread/start")).toBe(false);
  });

  it("uses the fallback's own reading: at or above the threshold there, the launch stays on the first choice", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true, codexPercent: 96 });
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    expect(h.engine.headsUp()).toBeUndefined();
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.isPhaseDone("1") || h.engine.stoppedPhaseKey() !== undefined);
    const session = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    expect(session).toMatchObject({ agentId: "claude_code", launch: { fallback: { used: false, reason: "Codex's codex · primary read 96%, at or above the 95% threshold." } } });
  });
});

describe("a wait before the start ends when a reading's decision names the fallback (\"A Wait Before the Start\")", () => {
  it("launches a new session on the fallback, recording the refused run it follows", async () => {
    const claude = new SetClaude(signedIn([usageRow("session", 40)]));
    const refused: ScenarioSession = { actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] };
    const h = await fixture([refused], claude, { withCodex: true });
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    const first = h.engine.latestSession("1")!;
    expect(first).toMatchObject({ agentId: "claude_code", launch: { from: "model_defaults" } });
    // A reading after the refusal shows the five-hour window at 100%: the decision names the fallback, so the wait ends.
    claude.reading = signedIn([usageRow("session", 100)]);
    await claude.refreshAccount();
    await waitFor(() => h.engine.latestSession("1")?.agentId === "codex");
    const fresh = h.engine.latestSession("1")!;
    expect(fresh.sessionId).not.toBe(first.sessionId);
    expect(fresh).toMatchObject({ agentId: "codex", relaunchOf: { sessionId: first.sessionId, run: 0 }, launch: { fallback: { used: true, limit: { agentId: "claude_code", label: "5-hour window", percent: 100 }, threshold: 95 } } });
  });
});

describe("every launch path runs the decision (AC-FALLBACK-02, AC-PICK-07)", () => {
  it("sends the person's reply on an activity that hasn't started to the fallback, with the heads-up on it beforehand", async () => {
    const claude = new SetClaude(weekly(20));
    const refused: ScenarioSession = { actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] };
    const h = await fixture([refused], claude, { withCodex: true });
    h.engine.record.settings.resumeAfterUsageLimit = false;
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    // Under the threshold no heads-up; at 98% the stopped activity, Kiln's next launch, carries it.
    expect(h.engine.headsUp()).toBeUndefined();
    claude.reading = weekly(98);
    await claude.refreshAccount();
    expect(h.engine.headsUp()).toMatchObject({ key: "1", forecast: { choice: { agentId: "codex" }, limit: { percent: 98 } } });
    expect(row(h.engine, "1").model?.forecast).toMatchObject({ threshold: 95 });
    const snapshot = buildSnapshot(h.engine);
    expect([...(snapshot.activities ?? []), ...snapshot.phases].filter(one => one.model?.forecast).map(one => one.id)).toEqual(["1", "1"]);
    // A start Kiln can't read hides the heads-up: it can't say which activity it launches next.
    h.engine.unknownStarts.set("1", "History unreadable.");
    expect(h.engine.headsUp()).toBeUndefined();
    h.engine.unknownStarts.delete("1");
    // The person's reply launches a new session, decided like any launch: on the fallback.
    expect(await h.engine.resume({ ...recoveryRequest(h.engine), note: "Carry on." })).toMatchObject({ ok: true });
    await waitFor(() => h.engine.latestSession("1")?.agentId === "codex");
    expect(h.engine.latestSession("1")).toMatchObject({ agentId: "codex", launch: { fallback: { used: true, limit: { agentId: "claude_code", label: "Weekly", percent: 98 } } } });
    await h.engine.settled();
  });
});

describe("a Codex first choice falls back to Claude Code (AC-FALLBACK-02, AC-FALLBACK-03, AC-PICK-06)", () => {
  const CODEX_FIRST = { standard: { first: { agentId: "codex" as const, family: "sol", effort: "high" }, fallback: { agentId: "claude_code" as const, family: "sonnet", effort: "high" } } };
  const blocked = { accountId: "proof-account", ordinaryUsageAllowed: false, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } };

  it("treats Codex's ordinary-usage block as at the threshold and starts on Claude Code, which reads Ran on with the Fallback tag", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: blocked });
    writeModelDefaults(h.env, CODEX_FIRST, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.isPhaseDone("1") || h.engine.stoppedPhaseKey() !== undefined);
    const session = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    expect(session).toMatchObject({ agentId: "claude_code", model: "sonnet", launch: { fallback: { used: true, limit: { agentId: "codex", label: "ordinary usage blocked" }, threshold: 95, first: { agentId: "codex", model: "gpt-6.1-sol" } } } });
    expect(session.launch!.fallback!.limit.percent).toBeUndefined();
    expect(codex!.calls().some(call => call.method === "thread/start")).toBe(false);
    expect(h.engine.isPhaseDone("1")).toBe(true);
    expect(row(h.engine, "1").model).toMatchObject({ state: "ran_on", choice: { agent: "Claude Code" }, fallback: { used: true, limit: { agent: "Codex", label: "ordinary usage blocked" } } });
    expect(h.events.filter(event => event.kind === "message" && event.text.startsWith("Phase 1 started on the fallback"))).toEqual([{ kind: "message", text: "Phase 1 started on the fallback, Claude Code · Sonnet 5.5 · high: Codex: ordinary usage blocked, so it didn't start on Codex · GPT-6.1-Sol · high. It finishes on Claude Code." }]);
  });

  it("stops a launch on the fallback refused before any response, naming the fallback as where its choice came from, and prints no start line", async () => {
    const claude = new SetClaude(weekly(20));
    const refused: ScenarioSession = { actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] };
    const h = await fixture([refused], claude, { withCodex: true });
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: blocked });
    h.engine.record.settings.resumeAfterUsageLimit = false;
    writeModelDefaults(h.env, CODEX_FIRST, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    expect(h.engine.latestSession("1")).toMatchObject({ agentId: "claude_code", launch: { fallback: { used: true } } });
    expect(buildSnapshot(h.engine).needsYou?.choiceSource).toBe("The fallback, from Model defaults' Fallback column. Change it in Model defaults.");
    expect(h.events.some(event => event.kind === "message" && event.text.includes("started on the fallback"))).toBe(false);
    // With no response, the row returns to the resolver's choice: the next launch decides again.
    expect(row(h.engine, "1").model).toMatchObject({ state: "will_run_on", choice: { agentId: "codex" } });
  });
});

describe("a fallback whose launch check fails after the decision (AC-PICK-06, \"found at launch\")", () => {
  it("stops naming the check, that the choice was the fallback, where it came from and where to change it", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    // The decision's own checks pass; the check just before the launch then fails on the fallback's agent,
    // as when Codex signs out between the two. Only that later check is replaced, and only for the decided fallback.
    const engine = h.engine as unknown as { selectionIssue(key: string | undefined, ignorePending?: boolean): string | undefined; decisions: Map<string, { choice: { agentId: string } }> };
    const original = engine.selectionIssue.bind(h.engine);
    engine.selectionIssue = (key, ignorePending) => key !== undefined && engine.decisions.get(key)?.choice.agentId === "codex" ? "Codex isn't signed in. Run codex login." : original(key, ignorePending);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(h.engine.latestSession("1")).toBeUndefined();
    const facts = buildSnapshot(h.engine).needsYou!.checks.flatMap(check => check.facts.map(fact => typeof fact === "string" ? fact : (fact as { text: string }).text));
    expect(facts).toContain("Codex isn't signed in. Run codex login. This launch was on Codex · GPT-6.1-Sol · high. Chosen from: The fallback, from Model defaults' Fallback column. Change it in Model defaults.");
    expect(codex!.calls().some(call => call.method === "thread/start")).toBe(false);
    expect(h.claudeCalls()).toEqual([]);
    // Check again launches again: the decision names the fallback once more and the same check fails, so the stop names it again.
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")).catch(() => undefined); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(stopFacts(h.engine)).toContain("Codex isn't signed in. Run codex login. This launch was on Codex · GPT-6.1-Sol · high. Chosen from: The fallback, from Model defaults' Fallback column. Change it in Model defaults.");
  });

  it("names the first choice at a launch on it, and at a Check again that still fails, its next launch's choice", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([landingSession("src/one.txt")], claude);
    const engine = h.engine as unknown as { selectionIssue(key: string | undefined, ignorePending?: boolean): string | undefined };
    const original = engine.selectionIssue.bind(h.engine);
    // Claude Code signs out after the readiness checks Start ran; only the check at launch, and at Check again, sees it.
    let signedOut = false;
    engine.selectionIssue = (key, ignorePending) => signedOut && key === "1" ? "Claude Code isn't signed in. Run claude auth login." : original(key, ignorePending);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true });
    signedOut = true;
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(stopFacts(h.engine)).toContain("Claude Code isn't signed in. Run claude auth login. This launch was on Claude Code · Opus 5.5 · medium. Chosen from: Model defaults. Change it in Model defaults, or on its row in the phase plan.");
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")).catch(() => undefined); await h.engine.settled();
    expect(stopFacts(h.engine)).toContain("Claude Code isn't signed in. Run claude auth login. Its next launch runs on Claude Code · Opus 5.5 · medium. Chosen from: Model defaults. Change it in Model defaults, or on its row in the phase plan.");
    expect(h.claudeCalls()).toEqual([]);
  });
});

/** Every fact of the stop's checks, as text. */
function stopFacts(engine: Engine): string[] {
  return buildSnapshot(engine).needsYou!.checks.flatMap(check => check.facts.map(fact => typeof fact === "string" ? fact : (fact as { text: string }).text));
}

describe("an activity that started on the fallback and goes on in a new session (AC-FALLBACK-03)", () => {
  const CODEX_FIRST = { standard: { first: { agentId: "codex" as const, family: "sol", effort: "high" }, fallback: { agentId: "claude_code" as const, family: "sonnet", effort: "high" } } };
  const blocked = { accountId: "proof-account", ordinaryUsageAllowed: false, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } };

  it("keeps the card's started-on-the-fallback facts while the carry-on runs, and the Fallback tag once it Ran on", async () => {
    const claude = new SetClaude(weekly(20));
    const stuck: ScenarioSession = { noTranscript: true, actions: [{ text: "Building." }, { write: { path: "src/partial.txt", content: "half\n" } }, { commit: "wip: intake" }, { result: "Blocked: waiting on the import." }] };
    const landing = landingSession("src/one.txt");
    const carryOn: ScenarioSession = { actions: [{ text: "Carrying on." }, { touch: "carry-on-running" }, { sleepFor: 1500 }, ...landing.actions] };
    const h = await fixture([stuck, carryOn], claude, { withCodex: true });
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: blocked });
    writeModelDefaults(h.env, CODEX_FIRST, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const first = h.engine.startedSessionOf("1")!;
    expect(first).toMatchObject({ agentId: "claude_code", launch: { fallback: { used: true } } });
    expect(buildSnapshot(h.engine).needsYou?.carryOn).toMatchObject({ available: true });
    const view = h.engine.controlView();
    const answer = h.engine.commands.submit({ command_id: "carry-fallback", execution_id: h.engine.record.executionId!, status_token: view.token, action: "carry-on", inputs: { message: "The import is merged." } }, "caller", true);
    expect(answer.ok, JSON.stringify(answer.errors)).toBe(true);
    // While the carry-on session is current, its card still says the activity started on the fallback.
    await waitFor(() => h.engine.current?.session !== undefined && h.engine.current.session.sessionId !== first.sessionId && h.engine.current.processRunning === true);
    const second = h.engine.current!.session!;
    expect(second.launch).toBeUndefined();
    expect(buildSnapshot(h.engine).current?.fallback).toMatchObject({ used: true, threshold: 95, limit: { agent: "Codex", label: "ordinary usage blocked" }, first: { agent: "Codex" } });
    await h.engine.commands.settled(); await h.engine.settled();
    expect(h.engine.isPhaseDone("1")).toBe(true);
    // Its Ran on row, read from the carry-on session, keeps the Fallback tag of the session that started it.
    expect(row(h.engine, "1").model).toMatchObject({ state: "ran_on", choice: { agent: "Claude Code" }, fallback: { used: true, limit: { agent: "Codex", label: "ordinary usage blocked" } } });
  });
});
