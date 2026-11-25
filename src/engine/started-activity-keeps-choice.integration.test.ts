// A started activity keeps its agent, model and effort (Kiln Phase Model Tiers, AC-PICK-04),
// through the engine against real Git with the stand-in claude, the Codex work stand-in and a
// Claude account reader the test drives: every later session of an activity that has started
// (a resume after a usage limit, a resume from Needs you or from a Pause now hold, the child phase
// its session split into) runs on the agent, model and effort it started on, and neither Model
// defaults, its tier line nor the fallback switch changes it or its row.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AccountView } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import { readGate } from "../live/gate.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { ScriptedClaude, signedIn, usageRow, type ScriptedReading } from "../test-support/scripted-claude.js";
import { Engine, type EngineOptions } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";
import { prdTreeAtHead } from "./worktree-setup.js";

let harness: Harness | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
let hosted: Awaited<ReturnType<typeof startFixtureController>> | undefined;
afterEach(async () => {
  hosted?.release(); await hosted?.server.close(); hosted = undefined;
  await harness?.cleanup(); harness = undefined;
  await codex?.sandbox.cleanup(); codex = undefined;
});

const DIRECTORY = "docs/prds/customer-returns";
const PHASE_1_DOC = "phase-1-return-intake.md";
const DEMANDING_LINE = "**Model tier:** demanding — AC-RET-02 moves money on retries.";

/** The fixture documents with Phase 1 demanding (Claude Code · Fable 5.1 · high by Kiln's defaults); the rest unrated. */
function tieredFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  files[PHASE_1_DOC] = files[PHASE_1_DOC]!.replace(/\n\n/, `\n\n${DEMANDING_LINE}\n\n`);
  return files;
}

/** A harness whose engine reads the plan, with `options.withCodex` the Codex work stand-in installed too. */
async function fixture(sessions: ScenarioSession[], options: { files?: Record<string, string>; withCodex?: boolean; engineOptions?: Partial<EngineOptions> } = {}): Promise<Harness> {
  harness = await createHarness({ sessions, files: options.files ?? tieredFiles(), ...(options.engineOptions ? { engineOptions: options.engineOptions } : {}) });
  const h = harness;
  if (options.withCodex) {
    codex = codexWorkFixture();
    Object.assign(h.tools, { codex: codex.options.executable });
    codex.configureEnvironment(h.env);
    codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
    h.engine.close();
    const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
    h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] }, onTerminal: (event) => h.events.push(event), ...options.engineOptions });
  }
  const read = readPlanAt(h.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  if (options.withCodex) await waitFor(() => !h.engine.readers.claude_code.state.pending && !h.engine.readers.codex.state.pending);
  return h;
}

/** A Claude account reader that answers every reading at once with the reading the test set last. */
class SetClaude implements ClaudeInfoSource {
  account: AccountView | undefined;
  readonly models = new ScriptedClaude(() => new Date()).models;
  readonly modelListError = undefined;
  private readonly listeners = new Set<() => void>();
  constructor(public reading: ScriptedReading) {}
  refreshAccount(): Promise<void> {
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

const row = (engine: Engine, id: string): PhaseView => { const snapshot = buildSnapshot(engine); return [...(snapshot.activities ?? []), ...snapshot.phases].find(one => one.id === id)!; };
/** A row's state and what it shows: agent, the model as passed or reported, its display name, effort. */
const shown = (view: PhaseView) => [view.model?.state, view.model?.choice?.agent, view.model?.choice?.model, view.model?.choice?.modelName, view.model?.choice?.effort];
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];
/** Every `--resume` launch of the stand-in claude: the session it resumes, its model and effort. */
const resumes = (h: Harness) => h.claudeCalls().filter(call => call.args.includes("--resume")).map(call => [flag(call.args, "--resume"), flag(call.args, "--model"), flag(call.args, "--effort")]);
/** Every launch of a new conversation: its model and effort. */
const launches = (h: Harness) => h.claudeCalls().filter(call => !call.args.includes("--resume")).map(call => [flag(call.args, "--model"), flag(call.args, "--effort")]);

describe("a resume runs on what the activity started on, whatever Model defaults now say (AC-PICK-04)", () => {
  it("resumes the same session after a usage-limit wait on its started model and effort", async () => {
    // Phase 1 is unrated, so it launches on the Standard row: Claude Code · Opus 5.5 · medium.
    const clock = (() => { let offset = 0; return { now: () => new Date(Date.now() + offset), advance: (ms: number) => void (offset += ms) }; })();
    const claude = new ScriptedClaude(clock.now);
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
    const reset = Math.floor(clock.now().getTime() / 1000) + 3_600;
    const refused: ScenarioSession = { actions: [{ skill: "enso-method:implement-from-requirements" }, { text: "Building the intake form." }, { write: { path: "src/partial.txt", content: "half done\n" } }, { refuse: { rateLimitType: "five_hour", resetsAt: reset } }, { exit: 1 }] };
    // The harness as usage-limit recovery's tests make it: no extra agent refresh, so the queued readings meet the launch.
    const h = harness = await createHarness({ sessions: [refused, landingSession("src/intake.txt")], engineOptions: { claude, now: clock.now } });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.engine.startedSessionOf("1")).toBeDefined();
    expect(launches(h)).toEqual([["opus", "medium"]]);

    // While it waits, Model defaults move the Standard row to Haiku · low.
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "haiku", effort: "low" } } });
    h.engine.modelChoicesChanged();
    expect(shown(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "claude-opus-5-5", "Opus 5.5", "medium"]);
    expect(row(h.engine, "1").model?.change).toBeUndefined();
    // A phase that hasn't started takes the change, so the change did reach the engine.
    expect(shown(row(h.engine, "3"))).toEqual(["will_run_on", "Claude Code", "haiku", "Haiku 5.5", "low"]);

    // The window resets: Kiln resumes the same session on its started model and effort.
    claude.deliver(signedIn([usageRow("session", 100, new Date(reset * 1000).toISOString())]));
    clock.advance(reset * 1000 + 61_000 - clock.now().getTime());
    claude.queue(signedIn([usageRow("session", 0)]), signedIn([usageRow("session", 0)]));
    void claude.refreshAccount();
    await waitFor(() => h.engine.isPhaseDone("1"));
    const session = h.engine.latestSession("1")!;
    expect(session.runs.map(run => run.cause)).toEqual(["launch", "limit_resume"]);
    expect(resumes(h)).toEqual([[session.sessionId, "claude-opus-5-5", "medium"]]);
    expect(shown(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "claude-opus-5-5", "Opus 5.5", "medium"]);
  });

  it("resumes from Needs you on its started model and effort", async () => {
    const h = await fixture([{ actions: [{ result: "I think this is done." }] }, landingSession("src/one.txt")]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(launches(h)).toEqual([["fable", "high"]]);
    writeModelDefaults(h.env, { demanding: { first: { agentId: "claude_code", family: "haiku", effort: "low" } } });
    h.engine.modelChoicesChanged();
    expect(shown(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "claude-fable-5-1", "Fable 5.1", "high"]);
    expect(row(h.engine, "1").model?.change).toBeUndefined();

    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await waitFor(() => h.engine.isPhaseDone("1"));
    const session = h.engine.latestSession("1")!;
    expect(h.engine.phaseSessions("1")).toHaveLength(1);
    expect(resumes(h)).toEqual([[session.sessionId, "claude-fable-5-1", "high"]]);
    expect(shown(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "claude-fable-5-1", "Fable 5.1", "high"]);
  });

  it.skipIf(process.platform !== "darwin")("resumes from a Pause now hold on its started model and effort", async () => {
    // As Kiln Pause Now's tests start it: one scripted session held on a command, a second for Resume; Phase 1 unrated, so Opus 5.5 · medium.
    const h = harness = await createHarness({ sessions: [] });
    h.env.KILN_STANDIN_VERSION = "2.1.311";
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ text: "Running the refund tests." }, { runUntil: { command: "npm test -- src/refunds", file: release } }, { result: "" }] }, { actions: [{ result: "Continued the same activity." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    hosted = await startFixtureController({ engine: h.engine, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
    const origin = `http://127.0.0.1:${hosted.port}`;
    const post = async (path: string, body: unknown) => {
      const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    const gateOf = () => readGate(h.engine.latestSession("1")!.runs.at(-1)!.live!.gateDirectory);
    await waitFor(() => !!h.engine.latestSession("1")?.runs.at(-1)?.live && Object.values(gateOf().operations).some(o => o.label?.input === "npm test -- src/refunds"));
    const pressed = await post("live/take-over", { instructionId: "pause", target: h.engine.liveTarget()! });
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(202);
    writeFileSync(release, "done");
    await h.engine.settled();
    await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.liveView()?.pauseNow?.phase === "paused"; }, 15000);
    expect(launches(h)).toEqual([["opus", "medium"]]);

    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: "haiku", effort: "low" } } });
    h.engine.modelChoicesChanged();
    expect(shown(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "claude-opus-5-5", "Opus 5.5", "medium"]);
    expect(row(h.engine, "1").model?.change).toBeUndefined();

    const resumed = await post("resume", { target: buildSnapshot(h.engine).needsYou!.phaseRecovery!.target });
    expect(resumed.body, JSON.stringify(resumed.body)).toMatchObject({ ok: true, outcome: "resume_requested" });
    await h.engine.settled();
    const session = h.engine.latestSession("1")!;
    expect(h.engine.phaseSessions("1")).toHaveLength(1);
    expect(resumes(h)).toEqual([[session.sessionId, "claude-opus-5-5", "medium"]]);
    expect(shown(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "claude-opus-5-5", "Opus 5.5", "medium"]);
  }, 120000);
});

describe("a changed tier line doesn't change a started activity (AC-PICK-04, AC-TIER-01)", () => {
  it("keeps a started phase's row and its resume on what it started on when its tier line is rewritten", async () => {
    // Phase 1 (demanding: Fable 5.1 · high) answers, rewrites its own tier line to mechanical (Sonnet 5.5 · high) and stops at Needs you.
    const files = tieredFiles();
    const rewritten = files[PHASE_1_DOC]!.replace(DEMANDING_LINE, "**Model tier:** mechanical - only a form.");
    const h = await fixture([
      { actions: [{ text: "Re-rating the phase." }, { write: { path: `${DIRECTORY}/${PHASE_1_DOC}`, content: rewritten } }, { commit: "docs: re-rate phase 1" }, { push: true }, { result: "I think this is done." }] },
      landingSession("src/one.txt"),
    ], { files });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(launches(h)).toEqual([["fable", "high"]]);

    // Resume reads the plan again: the new tier line is what Kiln read, and the row still shows what Phase 1 started on.
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await waitFor(() => h.engine.isPhaseDone("1"));
    expect(h.engine.record.plan!.find(phase => phase.id === "1")!.modelTier).toMatchObject({ tier: "mechanical" });
    expect(row(h.engine, "1").tier).toEqual({ value: "mechanical", reason: "only a form." });
    const session = h.engine.latestSession("1")!;
    expect(resumes(h)).toEqual([[session.sessionId, "claude-fable-5-1", "high"]]);
    expect(shown(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "claude-fable-5-1", "Fable 5.1", "high"]);
  });

  it("keeps a running phase's row when the plan as read now gives it another tier", async () => {
    const h = await fixture([{ actions: [{ result: "I think this is done." }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    h.engine.record.plan = h.engine.record.plan!.map(phase => phase.id === "1" ? { ...phase, modelTier: { tier: "mechanical", reason: "" } } : phase);
    expect(row(h.engine, "1").tier).toEqual({ value: "mechanical" });
    expect(shown(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "claude-fable-5-1", "Fable 5.1", "high"]);
    expect(h.engine.launchChoice("1")).toMatchObject({ agentId: "claude_code", model: "claude-fable-5-1", effort: "high" });
  });
});

describe("the fallback switch doesn't change a started activity (AC-PICK-04, AC-FALLBACK-02)", () => {
  it("keeps a phase started on Codex by the fallback on Codex after the fallback is switched off", async () => {
    const claude = new SetClaude(weekly(98));
    const h = await fixture([], { files: prdDirectoryFiles(), withCodex: true, engineOptions: { claude } });
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    const started = h.engine.startedSessionOf("1")!;
    expect(started).toMatchObject({ agentId: "codex", model: "gpt-6.1-sol", effort: "high", launch: { fallback: { used: true } } });
    const turnsBefore = codex!.calls().filter(call => call.method === "turn/start").length;

    // The fallback is switched off, and Claude Code is under the threshold again.
    writeModelDefaults(h.env, {}, { enabled: false, threshold: 95 });
    claude.reading = weekly(20);
    await claude.refreshAccount();
    h.engine.modelChoicesChanged();
    expect(shown(row(h.engine, "1"))).toEqual(["running_on", "Codex", "gpt-6.1-sol", "GPT-6.1-Sol", "high"]);
    expect(row(h.engine, "1").model?.fallback?.used).toBe(true);
    expect(row(h.engine, "1").model?.change).toBeUndefined();
    // A phase that hasn't started now runs on its first choice.
    expect(row(h.engine, "3").model?.choice).toMatchObject({ agent: "Claude Code", modelName: "Opus 5.5", effort: "medium" });

    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await waitFor(() => codex!.calls().filter(call => call.method === "turn/start").length > turnsBefore);
    await h.engine.settled();
    // The same Codex thread goes on, on the model and effort it started on; no Claude Code session ran for it.
    expect(h.engine.phaseSessions("1").map(one => one.sessionId)).toEqual([started.sessionId]);
    const turns = codex!.calls().filter(call => call.method === "turn/start").map(call => [call.params?.threadId, call.params?.model, call.params?.effort]);
    expect(turns.at(-1)).toEqual([started.conversation!.threadId, "gpt-6.1-sol", "high"]);
    expect(h.claudeCalls()).toEqual([]);
  });

  it("keeps a phase started on Claude Code on it after the fallback is switched on with Claude Code over the threshold", async () => {
    const claude = new SetClaude(weekly(20));
    const h = await fixture([{ actions: [{ result: "I think this is done." }] }, landingSession("src/one.txt")], { files: prdDirectoryFiles(), withCodex: true, engineOptions: { claude } });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(launches(h)).toEqual([["opus", "medium"]]);

    writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
    claude.reading = weekly(98);
    await claude.refreshAccount();
    h.engine.modelChoicesChanged();
    expect(shown(row(h.engine, "1"))).toEqual(["running_on", "Claude Code", "claude-opus-5-5", "Opus 5.5", "medium"]);
    expect(row(h.engine, "1").model?.fallback?.used).not.toBe(true);
    // A phase that hasn't started would now launch on its fallback.
    expect(row(h.engine, "2b").model?.forecast).toMatchObject({ choice: { agent: "Codex" }, threshold: 95 });

    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await waitFor(() => h.engine.isPhaseDone("1"));
    const session = h.engine.latestSession("1")!;
    expect(h.engine.phaseSessions("1")).toHaveLength(1);
    expect(resumes(h)).toEqual([[session.sessionId, "claude-opus-5-5", "medium"]]);
    expect(codex!.calls().some(call => call.method === "thread/start" || call.method === "turn/start")).toBe(false);
    expect(shown(row(h.engine, "1"))).toEqual(["ran_on", "Claude Code", "claude-opus-5-5", "Opus 5.5", "medium"]);
  });
});

describe("the child phase a session goes on building after a split (AC-PICK-04)", () => {
  it("shows what the splitting session ran on, not its own tier's choice, and resumes on it", async () => {
    // Phase 1 (demanding: Fable 5.1 · high) splits itself and rates 1a mechanical (Sonnet 5.5 · high).
    const child = "# Phase 1a: Intake form\n\n**Model tier:** mechanical - one form.\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\nNone.\n";
    const sibling = "# Phase 1b: Intake email\n\n**Model tier:** mechanical - one email template.\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\nPhase 1a.\n";
    const split: ScenarioSession = { actions: [{ text: "Splitting Phase 1." }, { split: [{ id: "1a", slug: "intake-form", title: "Intake form" }, { id: "1b", slug: "intake-email", title: "Intake email" }] }, { write: { path: `${DIRECTORY}/phase-1a-intake-form.md`, content: child } }, { write: { path: `${DIRECTORY}/phase-1b-intake-email.md`, content: sibling } }, { commit: "docs: split phase 1" }, { push: true }, { result: "Split Phase 1; 1a is next." }] };
    const h = await fixture([split, { actions: [{ result: "Still on 1a." }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.plan?.find(phase => phase.id === "1")?.splitInto).toEqual(["1a", "1b"]);
    expect(buildSnapshot(h.engine).needsYou?.phaseId).toBe("1a");
    expect(row(h.engine, "1a").tier).toEqual({ value: "mechanical", reason: "one form." });
    expect(shown(row(h.engine, "1a"))).toEqual(["running_on", "Claude Code", "claude-fable-5-1", "Fable 5.1", "high"]);
    expect(row(h.engine, "1a").model?.change).toBeUndefined();
    // 1b, which no session has launched, follows its own tier.
    expect(shown(row(h.engine, "1b"))).toEqual(["will_run_on", "Claude Code", "sonnet", "Sonnet 5.5", "high"]);

    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await waitFor(() => resumes(h).length > 0);
    await h.engine.settled();
    const session = h.engine.latestSession("1")!;
    expect(resumes(h)).toEqual([[session.sessionId, "claude-fable-5-1", "high"]]);
    expect(launches(h)).toEqual([["fable", "high"]]);
    expect(shown(row(h.engine, "1a"))).toEqual(["running_on", "Claude Code", "claude-fable-5-1", "Fable 5.1", "high"]);
  });
});

