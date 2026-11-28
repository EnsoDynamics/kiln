// The usage fallback (Kiln Phase Model Tiers, Phase 4: AC-FALLBACK-02 to AC-FALLBACK-04, with
// AC-PICK-06 and AC-PICK-07 for the fallback), through the engine against real Git with the
// stand-in claude, the Codex work stand-in and a Claude account reader whose reading the test
// sets: the usage reading is supplied at the reader's boundary, since an account can't be brought
// to the threshold on demand, and the session the decision names runs for real on the stand-ins.

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type HarnessOptions, type ScenarioSession } from "../test-support/engine-harness.js";
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
import { buildSnapshot, claudeCommand, codexCommand, type PhaseView } from "./snapshot.js";
import { cacheSnapshot, handoffProjection, inspectionSnapshot } from "../control/projection.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";

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

async function fixture(sessions: ScenarioSession[], claude: ClaudeInfoSource, options: { withCodex?: boolean; codexPercent?: number; codexSkills?: string[]; engineOptions?: Partial<EngineOptions>; harness?: Pick<HarnessOptions, "extraFolders" | "preflight"> } = {}): Promise<Harness> {
  harness = await createHarness({ sessions, files: prdDirectoryFiles(), ...options.harness, engineOptions: { claude, ...options.engineOptions } });
  const h = harness;
  if (options.withCodex) {
    codex = codexWorkFixture();
    Object.assign(h.tools, { codex: codex.options.executable });
    codex.configureEnvironment(h.env);
    codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: codexUsage(options.codexPercent ?? 10), ...(options.codexSkills ? { additionalSkills: options.codexSkills } : {}) });
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
    expect(session.launch!.fallback!.limit!.percent).toBeUndefined();
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
    expect(buildSnapshot(h.engine).needsYou?.choiceSource).toBe("The fallback, from the Standard row's Fallback column in Model defaults. Change it in Model defaults.");
    // The stop also carries the fallback's agent, model and effort, which its Needs you line names.
    expect(buildSnapshot(h.engine).needsYou).toMatchObject({ agent: "Claude Code", model: h.engine.latestSession("1")!.modelDisplayName, effort: "high" });
    expect(h.engine.latestSession("1")).toMatchObject({ model: "sonnet" });
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
    expect(facts).toContain("Codex isn't signed in. Run codex login. This launch was on Codex · GPT-6.1-Sol · high. Chosen from: The fallback, from the Standard row's Fallback column in Model defaults. Change it in Model defaults.");
    expect(codex!.calls().some(call => call.method === "thread/start")).toBe(false);
    expect(h.claudeCalls()).toEqual([]);
    // Check again launches again: the decision names the fallback once more and the same check fails, so the stop names it again.
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")).catch(() => undefined); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(stopFacts(h.engine)).toContain("Codex isn't signed in. Run codex login. This launch was on Codex · GPT-6.1-Sol · high. Chosen from: The fallback, from the Standard row's Fallback column in Model defaults. Change it in Model defaults.");
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

describe("a launch again on an activity that hasn't started, whose choice can't be used (AC-PICK-06, \"known before launch\")", () => {
  /** Phase 1's first session ended before any conversation began, then Model defaults moved to a model Claude Code doesn't offer. */
  async function stoppedThenUnusable() {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([{ noInit: true, actions: [] }, landingSession("src/one.txt")], claude);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    expect(h.engine.startAgainControl()).toMatchObject({ offered: true, available: true });
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "mythos", effort: "high" } } });
    h.engine.modelChoicesChanged();
    return h;
  }
  const MYTHOS_STOP = /^Phase 1 runs on Claude Code · Mythos · high from Model defaults \(Standard row\): .* Change the Standard row in Model defaults\.$/;

  it("Start again stops on the selection stop naming the choice, and nothing launches until the choice is one the agent offers", async () => {
    const h = await stoppedThenUnusable();
    expect(await h.engine.startAgain()).toMatchObject({ ok: true }); await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop).toMatchObject({ kind: "selection", checks: [{ name: "Agent selection and readiness", passed: false }] });
    expect(stopFacts(h.engine)).toEqual([expect.stringMatching(MYTHOS_STOP)]);
    expect(buildSnapshot(h.engine).needsYou).toMatchObject({ phaseId: "1" });
    expect(h.engine.current).toBeUndefined();
    expect(h.claudeCalls()).toHaveLength(1);
    // Back on a model the agent offers, Check again resolves again and the run launches it.
    writeModelDefaults(h.env, {});
    h.engine.modelChoicesChanged();
    expect(await h.engine.checkAgain(recoveryRequest(h.engine, "verify"))).toMatchObject({ ok: true });
    await waitFor(() => h.engine.isPhaseDone("1")); await h.engine.settled();
    expect(h.engine.record.phases["1"]!.sessionIds).toHaveLength(2);
  });

  it("Send reply & continue stops on the selection stop naming the choice, and the reply launches nothing", async () => {
    const claude = new SetClaude(weekly(20));
    // Phase 1's session reported init, then exited before any response, and kept no transcript to reopen.
    const h = await fixture([{ noTranscript: true, actions: [{ exit: 1 }] }, landingSession("src/one.txt")], claude);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    expect(h.engine.carryOnControl()).toMatchObject({ offered: true });
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "mythos", effort: "high" } } });
    h.engine.modelChoicesChanged();
    expect(await h.engine.carryOn({ ...recoveryRequest(h.engine), note: "The import is merged now." })).toMatchObject({ ok: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop).toMatchObject({ kind: "selection" });
    expect(stopFacts(h.engine)).toEqual([expect.stringMatching(MYTHOS_STOP)]);
    expect(h.engine.current).toBeUndefined();
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("Start again through the controller settles its receipt as not started, with the stop naming the choice", async () => {
    const h = await stoppedThenUnusable();
    const id = "start-again-unusable";
    h.engine.commands.submit({ command_id: id, execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: "start-again", inputs: {} }, "caller", true);
    await h.engine.commands.settled(); await h.engine.settled();
    expect(h.engine.commands.all().find(receipt => receipt.command_id === id)).toMatchObject({ state: "failed", outcome: "dispatch_not_started" });
    expect(stopFacts(h.engine)).toEqual([expect.stringMatching(MYTHOS_STOP)]);
    expect(h.claudeCalls()).toHaveLength(1);
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

describe("a first launch Codex refuses (AC-PICK-06, \"found at launch\")", () => {
  it("names the choice, where it came from and where to change it, at the stop and at Check again", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    // Codex answers the launch with another model than the one Kiln asked for: the launch settings check refuses it.
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: codexUsage(10), mismatch: true });
    writeModelDefaults(h.env, { standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.checks.map(check => check.name)).toContain("Codex launch settings");
    expect(stopFacts(h.engine)).toEqual(expect.arrayContaining([expect.stringMatching(/ This launch was on Codex · GPT-6\.1-Sol · high\. Chosen from: Model defaults\. Change it in Model defaults, or on its row in the phase plan\.$/)]));
    expect(h.claudeCalls()).toEqual([]);
    // Check again probes Codex again; still refused, the probe's row names the choice its next launch runs on.
    await h.engine.checkAgain(recoveryRequest(h.engine, "verify")).catch(() => undefined); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(stopFacts(h.engine)).toEqual(expect.arrayContaining([expect.stringMatching(/ Its next launch runs on Codex · GPT-6\.1-Sol · high\. Chosen from: Model defaults\. Change it in Model defaults, or on its row in the phase plan\.$/)]));
  });
});

describe("a phase that started on the fallback and whose session split it (AC-FALLBACK-03)", () => {
  it("keeps the fallback facts in its first child's phase detail", async () => {
    const claude = new SetClaude(weekly(20));
    const child = "# Phase 1a: Intake form\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\nNone.\n";
    const split: ScenarioSession = { actions: [{ text: "Splitting Phase 1." }, { split: [{ id: "1a", slug: "intake-form", title: "Intake form" }, { id: "1b", slug: "intake-email", title: "Intake email" }] }, { write: { path: `${DIRECTORY}/phase-1a-intake-form.md`, content: child } }, { commit: "docs: split phase 1" }, { push: true }, { result: "Split Phase 1; 1a is next." }] };
    const h = await fixture([split], claude, { withCodex: true });
    // Codex's ordinary usage is blocked, so Phase 1, first on Codex, starts on its Claude Code fallback.
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: false, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
    writeModelDefaults(h.env, { standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } }, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.plan?.find(phase => phase.id === "1")?.splitInto).toEqual(["1a", "1b"]);
    expect(h.engine.startedSessionOf("1")).toMatchObject({ agentId: "claude_code", launch: { fallback: { used: true } } });
    // 1a is shown with Phase 1's facts, so its detail keeps what the session that started it decided.
    expect(row(h.engine, "1a").details?.fallback).toMatchObject({ used: true, threshold: 95, limit: { agent: "Codex", label: "ordinary usage blocked" }, first: { agent: "Codex" } });
  });
});

describe("a pull request session that started on the fallback (AC-FALLBACK-03)", () => {
  /** A run whose pull request session, first on Codex by the Audits row, starts on its Claude Code fallback because Codex's ordinary usage is blocked. */
  async function fallbackPullRequest(pullRequest: ScenarioSession): Promise<Harness> {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([landingSession("src/one.txt"), landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequest], claude, { withCodex: true });
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: false, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
    writeModelDefaults(h.env, { audits: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } }, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.startedSessionOf("pr")).toMatchObject({ agentId: "claude_code", launch: { fallback: { used: true } } });
    return h;
  }
  const FACTS = { used: true, threshold: 95, limit: { agent: "Codex", label: "ordinary usage blocked" }, first: { agent: "Codex" } };

  it("keeps the fallback facts in its phase detail once it stopped", async () => {
    const h = await fallbackPullRequest({ actions: [{ result: "I couldn't open the pull request." }] });
    expect(h.engine.stoppedPhaseKey()).toBe("pr");
    const pr = row(h.engine, "pr");
    expect(pr.model).toMatchObject({ state: "running_on", choice: { agent: "Claude Code" }, fallback: { used: true } });
    expect(pr.details?.fallback).toMatchObject(FACTS);
  });

  it("keeps the fallback facts in its phase detail once it finished", async () => {
    const h = await fallbackPullRequest(pullRequestSession());
    expect(h.engine.record.completedAt).toBeDefined();
    const pr = row(h.engine, "pr");
    expect(pr.model).toMatchObject({ state: "ran_on", choice: { agent: "Claude Code" }, fallback: { used: true } });
    expect(pr.details?.fallback).toMatchObject(FACTS);
  });
});

describe("an audit whose skill doesn't resolve on the agent the decision named (AC-PICK-06, \"found at launch\")", () => {
  it("stops naming the decided choice, where it came from and where to change it", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([], claude, { withCodex: true });
    // An audit that last ran on Claude Code, now decided onto Codex, where its skill can't be resolved.
    const key = "audit-a1";
    const audit = { activityId: "a1", kind: "delivery_audit", skill: { name: "delivery-audit", path: "/skills/delivery-audit/SKILL.md" } };
    h.engine.record.phases[key] = { sessionIds: ["s1"] } as unknown as (typeof h.engine.record.phases)[string];
    const engine = h.engine as unknown as {
      auditActivity(key: string): unknown; sessionRecord(key: string, id: string): unknown;
      decisions: Map<string, unknown>; skillForDecision(key: string, decided: unknown): Promise<boolean>;
    };
    engine.auditActivity = (one) => one === key ? audit : undefined;
    engine.sessionRecord = (one, id) => one === key && id === "s1" ? { sessionId: "s1", agentId: "claude_code", model: "opus", modelDisplayName: "Opus 5.5", runs: [] } : undefined;
    const decided = { choice: { agentId: "codex", model: "gpt-6.1-sol", modelName: "GPT-6.1-Sol", effort: "high" }, launch: { from: "model_defaults" } };
    engine.decisions.set(key, decided);
    expect(await engine.skillForDecision(key, decided)).toBe(false);
    const facts = h.engine.record.phases[key]!.stop!.checks.flatMap(check => check.facts.map(fact => typeof fact === "string" ? fact : (fact as { text: string }).text));
    expect(facts).toEqual([expect.stringMatching(/^Codex metadata failed\..* This launch was on Codex · GPT-6\.1-Sol · high\. Chosen from: Model defaults\. Change the Audits row in Model defaults, or the Audits line in Documents found's delivery panel or the run's settings\.$/)]);
  });
});

describe("`kiln handoff` with Kiln not running (AC-PICK-07)", () => {
  const CODEX_FIRST = { standard: { first: { agentId: "codex" as const, family: "sol", effort: "high" }, fallback: { agentId: "claude_code" as const, family: "sonnet", effort: "high" } } };
  const offline = async (h: Harness, selector?: string) => (await handoffProjection(readWork(stateRoot(h.env), h.stateDirectory), selector, h.env)).data as Record<string, unknown>;

  it("gives a stop with no saved session the agent and fresh-session command of its current choice, resolved now", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    // Phase 1 stops at a launch check before any session exists.
    const engine = h.engine as unknown as { selectionIssue(key: string | undefined, ignorePending?: boolean): string | undefined };
    const original = engine.selectionIssue.bind(h.engine);
    let signedOut = false;
    engine.selectionIssue = (key, ignorePending) => signedOut && key === "1" ? "Claude Code isn't signed in. Run claude auth login." : original(key, ignorePending);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true });
    signedOut = true;
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(h.engine.latestSession("1")).toBeUndefined();
    // Kiln saves its last snapshot and stops.
    cacheSnapshot(h.engine, inspectionSnapshot(h.engine));
    const folder = h.engine.sessionFolder;
    h.engine.close();
    expect(await offline(h)).toMatchObject({ session_id: null, phase_key: "1", agent: "claude_code", fresh_session_instructions: { command: claudeCommand(folder) } });
    // `kiln model-defaults` moves Phase 1 to Codex with no controller: the handoff names Codex and its command.
    writeModelDefaults(h.env, CODEX_FIRST);
    expect(await offline(h)).toMatchObject({ session_id: null, phase_key: "1", agent: "codex", fresh_session_instructions: { command: codexCommand(folder), prompt: expect.any(String) } });
  });

  it("on a computer without Claude Code, resolves a Claude Code first choice to its fallback, so an unchanged Codex choice isn't treated as moved", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    // Codex refuses the first launch's settings, leaving a Codex session on Phase 1, which hasn't started.
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: codexUsage(10), mismatch: true });
    writeModelDefaults(h.env, CODEX_FIRST);
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    const session = h.engine.latestSession("1")!;
    expect(session).toMatchObject({ agentId: "codex", effort: "high" });
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    // The snapshot Kiln saved last, on a computer where Claude Code isn't installed and nothing needs it: no Claude Code entry.
    const snapshot = inspectionSnapshot(h.engine);
    cacheSnapshot(h.engine, { ...snapshot, agents: snapshot.agents.filter(entry => entry.agentId !== "claude_code") });
    const folder = h.engine.sessionFolder;
    h.engine.close();
    // Model defaults now puts the Standard row first on Claude Code, falling back to the same Codex choice the session ran on.
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "opus", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } } });
    const handoff = await offline(h, session.sessionId);
    expect(handoff.reason).not.toEqual(expect.stringContaining("isn't reopened"));
    expect(handoff).toMatchObject({ agent: "codex", fresh_session_instructions: { command: codexCommand(folder) } });
  });
});

describe("each launch is decided on its own, for every phase, and only a usable fallback takes it (AC-FALLBACK-02, AC-AGENTS-02)", () => {
  /** Phase 1's landing session, held after its first response until the test creates the gate file. */
  const gatedLanding = (gate: string): ScenarioSession => ({ actions: [{ text: "Building phase 1." }, { waitForFile: gate }, ...landingSession("src/one.txt").actions] });
  const CODEX_FIRST = { standard: { first: { agentId: "codex" as const, family: "sol", effort: "high" }, fallback: { agentId: "claude_code" as const, family: "sonnet", effort: "high" } } };
  const blocked = { accountId: "proof-account", ordinaryUsageAllowed: false, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } };

  it("falls back for a phase the person changed by hand, naming the changed choice as the first", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    expect(await h.engine.changeModel({ phase: "1" }, { agentId: "claude_code", model: "sonnet", effort: "high" })).toEqual({ ok: true });
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.startedSessionOf("1") !== undefined || h.engine.stoppedPhaseKey() !== undefined);
    const first = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    expect(first).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", effort: "high", launch: { from: "changed", fallback: { used: true, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95, first: { agentId: "claude_code", model: "sonnet", effort: "high" } } } });
    expect(h.claudeCalls().filter(call => call.args.includes("--model"))).toEqual([]);
    await h.engine.settled();
  });

  it("returns the next activity to its first choice once that account is back under the threshold", async () => {
    const claude = new SetClaude(weekly(20));
    const gate = join(tmpdir(), `kiln-fallback-gate-${process.pid}-${Date.now()}`);
    const h = await fixture([gatedLanding(gate)], claude, { withCodex: true });
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: blocked });
    writeModelDefaults(h.env, CODEX_FIRST, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await h.engine.start({ refinementConfirmed: true });
    // Codex's ordinary usage is blocked: Phase 1 starts on Claude Code, its fallback.
    await waitFor(() => h.engine.startedSessionOf("1") !== undefined);
    expect(h.engine.latestSession("1")).toMatchObject({ agentId: "claude_code", model: "sonnet", launch: { fallback: { used: true, limit: { agentId: "codex", label: "ordinary usage blocked" } } } });
    // Codex's account frees up while Phase 1 runs; Phase 2b's launch reads it fresh and starts on its first choice.
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: codexUsage(10) });
    writeFileSync(gate, "");
    await waitFor(() => h.engine.latestSession("2b") !== undefined);
    await h.engine.settled();
    expect(h.engine.isPhaseDone("1")).toBe(true);
    const next = h.engine.latestSession("2b")!;
    expect(next).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", effort: "high", launch: { from: "model_defaults" } });
    expect(next.launch?.fallback?.used).not.toBe(true);
    expect(h.claudeCalls().filter(call => call.args.includes("--model"))).toHaveLength(1);
  });

  it("leaves the fallback unused while its agent doesn't offer the fallback's model, saying why", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    writeModelDefaults(h.env, { standard: { fallback: { agentId: "codex", family: "astra", effort: "high" } } }, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.isPhaseDone("1") || h.engine.stoppedPhaseKey() !== undefined);
    const session = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    expect(session).toMatchObject({ agentId: "claude_code", model: "opus", launch: { fallback: { used: false, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95, reason: "Codex doesn't offer a GPT Astra model on this account." } } });
    expect(codex!.calls().some(call => call.method === "thread/start")).toBe(false);
    await h.engine.settled();
  });

  it("says on the current row why the fallback wasn't used, while its session runs", async () => {
    const claude = new SetClaude(weekly(97));
    const gate = join(tmpdir(), `kiln-fallback-gate-${process.pid}-${Date.now()}`);
    // Codex isn't installed: the fallback's launch checks fail.
    const h = await fixture([gatedLanding(gate)], claude);
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.startedSessionOf("1") !== undefined);
    expect(row(h.engine, "1").model).toMatchObject({ state: "running_on", choice: { agent: "Claude Code" }, fallback: { used: false, limit: { agent: "Claude Code", label: "Weekly", percent: 97 }, threshold: 95, reason: expect.stringContaining("Codex is not on PATH") } });
    writeFileSync(gate, "");
    await waitFor(() => h.engine.isPhaseDone("1") || h.engine.stoppedPhaseKey() !== undefined);
    await h.engine.settled();
  });

  it("never sends a launch the account refuses to the fallback: with the switch on and usage under the threshold, the run stops", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    // Codex answers the launch with another model than the one Kiln asked for.
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: codexUsage(10), mismatch: true });
    writeModelDefaults(h.env, CODEX_FIRST, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(buildSnapshot(h.engine).needsYou!.checks.map(check => check.name)).toContain("Codex launch settings");
    expect(h.engine.record.phases["1"]!.sessionIds.map(id => h.engine.sessionRecord("1", id)!.agentId)).toEqual(["codex"]);
    expect(h.engine.latestSession("1")!.launch?.fallback?.used).not.toBe(true);
    expect(h.claudeCalls()).toEqual([]);
  });

  it("leaves a Claude Code fallback on an unapproved metered route unused until approved, then the next launch takes it", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([landingSession("src/one.txt")], claude, { withCodex: true });
    h.env.ANTHROPIC_API_KEY = "fallback-billing-canary";
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: blocked });
    writeModelDefaults(h.env, Object.fromEntries((["demanding", "standard", "mechanical", "audits"] as const).map(row => [row, CODEX_FIRST.standard])), { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents(); await h.engine.refreshBilling();
    await waitFor(() => !h.engine.billing.pending && !h.engine.readers.codex.state.pending && !h.engine.readers.claude_code.state.pending);
    expect(h.engine.billing.view).toMatchObject({ canLaunch: false, next: { route: "metered" } });
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true });
    await waitFor(() => h.engine.latestSession("1") !== undefined); await h.engine.settled();
    // The fallback's billing isn't approved: the launch stays on Codex, saying why, and no Claude Code session runs.
    const stayed = h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)!;
    expect(stayed).toMatchObject({ agentId: "codex", launch: { fallback: { used: false, limit: { agentId: "codex", label: "ordinary usage blocked" }, reason: expect.stringMatching(/billing/i) } } });
    expect(h.claudeCalls()).toEqual([]);
    // Approved, the next launch of an activity that hasn't started (Phase 2b) takes the fallback.
    const decide = (key: string) => (h.engine as unknown as { decideLaunch(key: string, endsWait: boolean): Promise<{ choice: { agentId: string; model: string }; launch: { fallback?: { used: boolean; reason?: string } } } | undefined> }).decideLaunch(key, false);
    expect(await decide("2b")).toMatchObject({ choice: { agentId: "codex" }, launch: { fallback: { used: false, reason: stayed.launch!.fallback!.reason } } });
    await h.engine.refreshBilling(); await waitFor(() => !h.engine.billing.pending);
    await h.engine.billingCommand("approval", { executionId: h.engine.record.executionId, readingId: h.engine.billing.view.next!.readingId, approved: true });
    expect(h.engine.billing.view).toMatchObject({ canLaunch: true });
    expect(await decide("2b")).toMatchObject({ choice: { agentId: "claude_code", model: "sonnet" }, launch: { fallback: { used: true, limit: { agentId: "codex", label: "ordinary usage blocked" } } } });
    expect(h.claudeCalls()).toEqual([]);
  });
});

describe("the switch is one for the whole computer, read at each launch (AC-FALLBACK-01)", () => {
  /** Phase 1's landing session, held after its first response until the test creates the gate file. */
  const gatedLanding = (gate: string): ScenarioSession => ({ actions: [{ text: "Building phase 1." }, { waitForFile: gate }, ...landingSession("src/one.txt").actions] });

  it("turned on during a run, takes the run's next launch to the fallback", async () => {
    const claude = new SetClaude(weekly(97));
    const gate = join(tmpdir(), `kiln-fallback-gate-${process.pid}-${Date.now()}`);
    const h = await fixture([gatedLanding(gate)], claude, { withCodex: true });
    // The switch is off as the run starts: Phase 1 launches on its first choice, whatever the usage.
    writeModelDefaults(h.env, {}, { enabled: false, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.startedSessionOf("1") !== undefined);
    expect(h.engine.latestSession("1")).toMatchObject({ agentId: "claude_code", model: "opus" });
    expect(h.engine.latestSession("1")!.launch?.fallback).toBeUndefined();
    expect(h.engine.headsUp()).toBeUndefined();
    // Turned on in Model defaults while Phase 1 runs, as the page or another Kiln writes it: nothing tells this run but the file.
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    await waitFor(() => h.engine.headsUp()?.key === "2b");
    writeFileSync(gate, "");
    await waitFor(() => h.engine.latestSession("2b") !== undefined);
    expect(h.engine.latestSession("2b")).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", effort: "high", launch: { fallback: { used: true, limit: { agentId: "claude_code", label: "Weekly", percent: 97 }, threshold: 95 } } });
    // Phase 1, already started, stayed on Claude Code.
    expect(h.engine.sessionRecord("1", h.engine.record.phases["1"]!.sessionIds[0]!)).toMatchObject({ agentId: "claude_code" });
    await h.engine.settled();
  });

  it("applies to every PRD on the computer: another PRD's engine sees it on, and off once it's turned off", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([], claude, { withCodex: true, harness: { extraFolders: ["store-pickup"] } });
    // Switched on once, for the computer, with nothing set on either PRD.
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    expect(h.engine.headsUp()).toMatchObject({ key: "1", forecast: { choice: { agentId: "codex" } } });
    const other = await h.engineFor("store-pickup");
    const read = readPlanAt(h.repository, "docs/prds/store-pickup");
    if (!read.ok) throw new Error(read.problem);
    other.record.plan = recordedPlan(read.plan);
    other.modelChoicesChanged();
    await other.refreshAgents();
    await waitFor(() => !other.readers.claude_code.state.pending && !other.readers.codex.state.pending);
    expect(other.record.settings.modelChoices.phases).toEqual({});
    expect(other.headsUp()).toMatchObject({ key: "1", forecast: { choice: { agentId: "codex", model: "gpt-6.1-sol", effort: "high" }, limit: { agent: "Claude Code", percent: 97 }, threshold: 95 } });
    // Until the person turns it off: then neither PRD falls back.
    writeModelDefaults(h.env, {}, { enabled: false, threshold: 95 });
    expect(other.headsUp()).toBeUndefined();
    expect(h.engine.headsUp()).toBeUndefined();
  });
});

describe("the heads-up on a planned audit or Preflight row (AC-FALLBACK-04)", () => {
  /** Phase 3's landing session, held after its first response until the test creates the gate file. */
  const gatedLast = (gate: string): ScenarioSession => ({ actions: [{ text: "Building phase 3." }, { waitForFile: gate }, ...landingSession("src/three.txt").actions] });
  // The Codex stand-in offers GPT Sol at high and low only, so the Audits fallback is set to GPT Sol · low:
  // apart from every tier's fallback (GPT Sol or Astra · high), so only the Audits row can give it.
  const AUDITS = { audits: { fallback: { agentId: "codex" as const, family: "sol", effort: "low" } } };
  const AUDITS_FALLBACK = { agentId: "codex", model: "gpt-6.1-sol", effort: "low" };

  it("names the planned Delivery audit row, on the Audits fallback, while the last phase runs", async () => {
    const claude = new SetClaude(weekly(20));
    const gate = join(tmpdir(), `kiln-fallback-gate-${process.pid}-${Date.now()}`);
    const h = await fixture([landingSession("src/one.txt"), landingSession("src/two.txt"), gatedLast(gate)], claude, { withCodex: true });
    writeModelDefaults(h.env, AUDITS, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true });
    // Phases 1 and 2b land on Claude Code under the threshold; Phase 3, the last, is running.
    await waitFor(() => h.engine.startedSessionOf("3") !== undefined && h.engine.isPhaseDone("2b"));
    expect(h.engine.latestSession("3")).toMatchObject({ agentId: "claude_code" });
    expect(h.engine.headsUp()).toBeUndefined();
    // Claude Code reads 97% and Codex is ready: the next activity is the delivery audit, which would launch on the Audits fallback.
    claude.reading = weekly(97);
    await claude.refreshAccount();
    expect(h.engine.headsUp()).toEqual({ key: "audit-planned", forecast: { choice: expect.objectContaining({ ...AUDITS_FALLBACK, agent: "Codex" }), limit: expect.objectContaining({ agent: "Claude Code", label: "Weekly", percent: 97 }), threshold: 95 } });
    const snapshot = buildSnapshot(h.engine);
    const rows = [...(snapshot.activities ?? []), ...snapshot.phases];
    expect(rows.filter(one => one.model?.forecast).map(one => one.id)).toEqual(["planned-delivery-audit"]);
    expect(rows.find(one => one.id === "planned-delivery-audit")!.model).toMatchObject({ choice: { agent: "Claude Code", model: "opus", effort: "high" }, forecast: { choice: { agent: "Codex", model: "gpt-6.1-sol", effort: "low" }, threshold: 95 } });
    writeFileSync(gate, "");
    await waitFor(() => h.engine.isPhaseDone("3") || h.engine.stoppedPhaseKey() !== undefined);
  });

  it("names the planned Preflight row before Start, on the Audits fallback", async () => {
    const claude = new SetClaude(weekly(97));
    const h = await fixture([], claude, { withCodex: true, codexSkills: ["build-preflight"], harness: { preflight: true } });
    writeModelDefaults(h.env, AUDITS, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.readers.codex.state.pending);
    expect(h.engine.headsUp()).toEqual({ key: "preflight-planned", forecast: { choice: expect.objectContaining({ ...AUDITS_FALLBACK, agent: "Codex" }), limit: expect.objectContaining({ agent: "Claude Code", label: "Weekly", percent: 97 }), threshold: 95 } });
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.preflight?.planned?.model).toMatchObject({ choice: { agent: "Claude Code", model: "opus", effort: "high" }, forecast: { choice: { agent: "Codex", model: "gpt-6.1-sol", effort: "low" }, threshold: 95 } });
    expect([...(snapshot.activities ?? []), ...snapshot.phases].filter(one => one.model?.forecast)).toEqual([]);
  });
});
