// Both agents in one run (Kiln Phase Model Tiers, Phase 2: AC-AGENTS-01 to AC-AGENTS-04 and
// AC-PICK-07), through the engine against real Git with the stand-in claude, the Codex work
// stand-in and a scripted Claude account reader: Kiln checks, bills and shows every agent the run
// can use, a stop or wait follows its activity's own agent, and an activity that hasn't started
// goes on in a new session on its current choice, never reopening a conversation that ran on
// another choice.

import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { Engine, type EngineOptions } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, claudeCommand, codexCommand, type PhaseView } from "./snapshot.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheSnapshot, handoffProjection, inspectionSnapshot, statusProjection } from "../control/projection.js";
import { releaseResult } from "../control/spool.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";

let harness: Harness | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; await codex?.sandbox.cleanup(); codex = undefined; });

const DIRECTORY = "docs/prds/customer-returns";
const CODEX_MECHANICAL = { mechanical: { first: { agentId: "codex" as const, family: "sol", effort: "high" }, fallback: { agentId: "claude_code" as const, family: "sonnet", effort: "high" } } };

/** The fixture documents with Phase 2b mechanical, the rest unrated. */
function tieredFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  files["phase-2b-store-credit.md"] = files["phase-2b-store-credit.md"]!.replace(/\n\n/, "\n\n**Model tier:** mechanical - repeats the card refund flow.\n\n");
  return files;
}

/**
 * A harness whose engine reads the plan and, with `withCodex`, has the Codex work stand-in
 * installed beside the stand-in claude: the engine is made again so it sees Codex installed.
 */
async function fixture(sessions: ScenarioSession[], options: { withCodex?: boolean; engineOptions?: Partial<EngineOptions> } = {}): Promise<Harness> {
  harness = await createHarness({ sessions, files: tieredFiles(), ...(options.engineOptions ? { engineOptions: options.engineOptions } : {}) });
  const h = harness;
  if (options.withCodex) {
    codex = codexWorkFixture();
    Object.assign(h.tools, { codex: codex.options.executable });
    codex.configureEnvironment(h.env);
    codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory });
    h.engine.close();
    const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
    h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] }, ...options.engineOptions });
  }
  const read = readPlanAt(h.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  h.engine.record.plan = recordedPlan(read.plan);
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  return h;
}

const row = (engine: Engine, id: string): PhaseView => (buildSnapshot(engine).activities ?? buildSnapshot(engine).phases).find(one => one.id === id)!;
const agentEntry = (engine: Engine, agentId: "claude_code" | "codex") => buildSnapshot(engine).agents.find(entry => entry.agentId === agentId);

describe("Kiln checks every agent the run can use before Start (AC-AGENTS-01)", () => {
  it("refuses Start while an agent an activity runs on isn't installed, naming the agent, the remedy and the activities", async () => {
    const h = await fixture([landingSession("src/one.txt")]);
    writeModelDefaults(h.env, CODEX_MECHANICAL);
    h.engine.modelChoicesChanged();
    expect(h.engine.installed("codex")).toBe(false);
    expect(h.engine.neededBy()).toEqual({ claude_code: { activities: ["Phase 1", "Phase 3", "the delivery audit", "the test audit", "the pull request session"], fallbackOnly: false }, codex: { activities: ["Phase 2b"], fallbackOnly: false } });
    const answer = await h.engine.start({ refinementConfirmed: true });
    expect(answer).toMatchObject({ ok: false, status: 409, reason: expect.stringMatching(/^Codex isn't ready: Codex is not on PATH\. Install Codex .* or later and sign in with codex login\. Needed by Phase 2b\.$/) });
    expect(h.claudeCalls()).toEqual([]);
    expect(agentEntry(h.engine, "codex")).toMatchObject({ installed: false, neededBy: { activities: ["Phase 2b"], fallbackOnly: false }, readinessErrors: [expect.stringContaining("Codex is not on PATH")] });
    expect(buildSnapshot(h.engine).settings.models.problem).toBe((answer as { reason: string }).reason);
  });

  it("keeps Start available, with the warning, when only a fallback names an agent that isn't installed", async () => {
    const h = await fixture([landingSession("src/one.txt")]);
    writeModelDefaults(h.env, {}, { enabled: true, threshold: 90 });
    h.engine.modelChoicesChanged();
    expect(h.engine.neededBy().codex).toEqual({ activities: [], fallbackOnly: true });
    expect(h.engine.modelsProblem).toBeUndefined();
    const settings = buildSnapshot(h.engine).settings.models;
    expect(settings.fallback).toMatchObject({ enabled: true, threshold: 90, warning: { agent: "Codex", agentId: "codex", problem: expect.stringContaining("Codex is not on PATH"), remedy: "Install Codex, then press Refresh agent information." } });
    expect(agentEntry(h.engine, "codex")).toMatchObject({ installed: false, neededBy: { activities: [], fallbackOnly: true } });
    // With the switch off, an agent nothing needs isn't listed and blocks nothing.
    writeModelDefaults(h.env, {});
    h.engine.modelChoicesChanged();
    expect(h.engine.neededBy().codex).toBeUndefined();
    expect(agentEntry(h.engine, "codex")).toBeUndefined();
    expect(buildSnapshot(h.engine).settings.models.fallback.warning).toBeUndefined();
  });
});

describe("billing and the account panel for each agent (AC-AGENTS-02, AC-AGENTS-03)", () => {
  it("shows both agents' accounts and billing when activities run on each, marks the in-use one and limits over the threshold", async () => {
    const h = await fixture([landingSession("src/one.txt")], { withCodex: true });
    writeModelDefaults(h.env, CODEX_MECHANICAL, { enabled: true, threshold: 80 });
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 0 } }, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 82, windowDurationMins: 10080, resetsAt: 1793000000 } }, other: { limitName: "Another allowance", primary: { usedPercent: 4 } } } } });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await waitFor(() => !h.engine.readers.codex.state.pending && !h.engine.readers.claude_code.state.pending);
    expect(h.engine.modelsProblem).toBeUndefined();
    const claude = agentEntry(h.engine, "claude_code")!;
    const codexEntry = agentEntry(h.engine, "codex")!;
    // Phase 1 is next, on Claude Code: it is in use; Codex is listed beside it with its own account and presentation-only billing.
    expect(claude).toMatchObject({ inUse: true, neededBy: { fallbackOnly: false }, billing: { executionId: h.engine.record.executionId } });
    expect(codexEntry).toMatchObject({ neededBy: { activities: ["Phase 2b"], fallbackOnly: false }, account: { agentId: "codex" }, billing: { next: { agentId: "codex", canApprove: false, canClear: false } } });
    expect(codexEntry.inUse).toBeUndefined();
    // The 82% window is at or above the 80% threshold and is marked; the 4% one isn't.
    const limits = codexEntry.account!.limits as { percent?: number; overThreshold?: true }[];
    expect(limits.find(limit => limit.percent === 82)).toMatchObject({ overThreshold: true });
    expect(limits.find(limit => limit.percent === 4)?.overThreshold).toBeUndefined();
  });

  it("reports the in-use agent's account in today's fields and every other needed agent in other_agents (kiln account)", async () => {
    const h = await fixture([landingSession("src/one.txt")], { withCodex: true });
    writeModelDefaults(h.env, CODEX_MECHANICAL, { enabled: true, threshold: 80 });
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 0 } }, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 82, windowDurationMins: 10080, resetsAt: 1793000000 } }, other: { limitName: "Another allowance", primary: { usedPercent: 4 } } } } });
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await waitFor(() => !h.engine.readers.codex.state.pending && !h.engine.readers.claude_code.state.pending);
    const status = statusProjection(readWork(stateRoot(h.env), h.stateDirectory), h.engine, true);
    try {
      const account = status.account as { agent: string; other_agents: { agent: string; usage: { value: { over_threshold: boolean; percent?: number }[] | null }; billing: unknown }[]; fallback: unknown };
      expect(account.agent).toBe("claude_code");
      expect(account.fallback).toEqual({ enabled: true, threshold: 80 });
      expect(account.other_agents.map(other => other.agent)).toEqual(["codex"]);
      const usage = account.other_agents[0]!.usage.value!;
      expect(usage.find(row => row.percent === 82)?.over_threshold).toBe(true);
      expect(usage.find(row => row.percent === 4)?.over_threshold).toBe(false);
      expect(account.other_agents[0]!.billing).toMatchObject({ next: { agentId: "codex", canApprove: false, canClear: false } });
      expect(JSON.stringify(account)).not.toContain("selectionGeneration");
    } finally { releaseResult(status); }
  });

  it("neither reads nor bills Claude Code while no activity or fallback needs it", async () => {
    const h = await fixture([], { withCodex: true });
    writeModelDefaults(h.env, Object.fromEntries((["demanding", "standard", "mechanical", "audits"] as const).map(row => [row, { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } }])));
    h.engine.modelChoicesChanged();
    expect(Object.keys(h.engine.neededBy())).toEqual(["codex"]);
    const claude = agentEntry(h.engine, "claude_code")!;
    // Installed, so its model list shows, but nothing else and nothing blocks.
    expect(claude.models?.length).toBeGreaterThan(0);
    expect(claude.billing).toBeUndefined(); expect(claude.account).toBeUndefined(); expect(claude.readinessErrors).toBeUndefined();
    await expect(h.engine.billingCommand("approval", {})).rejects.toThrow("No activity of this run uses Claude Code");
  });
});

/** A phase session refused by a usage limit at once, before any response. */
const refusedAtOnce = (reset: number): ScenarioSession => ({ actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: reset } }, { exit: 1 }] });

describe("an activity that hasn't started goes on in a new session (AC-PICK-07, AC-AGENTS-04)", () => {
  /** Phase 1 refused before any response and waiting, with the scripted account reader. */
  async function waitingBeforeStart(after: ScenarioSession[]) {
    let offset = 0;
    const now = () => new Date(Date.now() + offset);
    const claude = new ScriptedClaude(now);
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
    const reset = Math.floor(Date.now() / 1000) + 3_600;
    const h = await fixture([refusedAtOnce(reset), ...after], { engineOptions: { claude, now } });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    const refused = h.engine.latestSession("1")!;
    expect(refused.firstResponseAt).toBeUndefined();
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    return { h, claude, reset, refused, advance: (ms: number) => void (offset += ms) };
  }

  it("launches a new session on the changed choice when its account has usage, never resuming the refused conversation", async () => {
    const s = await waitingBeforeStart([landingSession("src/one.txt")]);
    // The person moves Phase 1 to Sonnet while it waits: the refusal says nothing about that choice.
    writeModelDefaults(s.h.env, { standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } });
    s.h.engine.modelChoicesChanged();
    expect(row(s.h.engine, "1").model).toMatchObject({ state: "will_run_on", choice: { model: "sonnet", effort: "low" } });
    // A weekly Opus window at 100% doesn't count for Sonnet; no counted limit at 100% ends the wait.
    const opusWeek = { ...usageRow("weekly_all", 100), scope: { by: "model" as const, name: "opus" } };
    s.claude.deliver(signedIn([opusWeek, usageRow("session", 100)]));
    expect(s.h.engine.waitingPhaseKey()).toBe("1");
    expect(s.h.claudeCalls()).toHaveLength(1);
    s.claude.queue(signedIn([opusWeek, usageRow("session", 10)]), signedIn([usageRow("session", 10)]), signedIn([usageRow("session", 10)]));
    void s.claude.refreshAccount();
    await waitFor(() => s.h.engine.isPhaseDone("1"));
    await s.h.engine.settled();
    // The refused launch, then the new session (later calls are the next phases).
    const calls = s.h.claudeCalls();
    const fresh = s.h.engine.latestSession("1")!;
    expect(fresh.sessionId).not.toBe(s.refused.sessionId);
    expect(fresh).toMatchObject({ model: "sonnet", effort: "low", relaunchOf: { sessionId: s.refused.sessionId, run: 0 } });
    expect(fresh.runs[0]!.cause).toBe("launch");
    expect(calls[1]!.args).not.toContain("--resume");
    expect(calls[1]!.args).toEqual(expect.arrayContaining(["--model", "sonnet", "--effort", "low"]));
  });

  it("ends the wait with a stop naming the choice, where it came from and where to change it, when its agent isn't installed (AC-PICK-06)", async () => {
    const s = await waitingBeforeStart([]);
    // While Phase 1 waits, Model defaults moves it to Codex, which isn't installed here.
    writeModelDefaults(s.h.env, { standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } });
    s.h.engine.modelChoicesChanged();
    // The wait's next reading, as its timer asks for one.
    (s.h.engine as unknown as { askReading(): void }).askReading();
    await waitFor(() => s.h.engine.stoppedPhaseKey() === "1"); await s.h.engine.settled();
    expect(s.h.engine.waitingPhaseKey()).toBeUndefined();
    const facts = buildSnapshot(s.h.engine).needsYou!.checks.flatMap(check => check.facts.map(fact => typeof fact === "string" ? fact : (fact as { text: string }).text));
    expect(facts).toEqual([expect.stringMatching(/^Phase 1 runs on Codex · GPT Sol · high from Model defaults \(Standard row\): Codex is not on PATH\. Install Codex .* and sign in with codex login\. Change the Standard row in Model defaults\.$/)]);
    // Nothing ran in its place.
    expect(s.h.claudeCalls()).toHaveLength(1);
  });

  it("gives the person's reply to a new session on the current choice, and withdraws the reopen command once the choice changes", async () => {
    const h = await fixture([{ actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] }, landingSession("src/one.txt")]);
    h.engine.record.settings.resumeAfterUsageLimit = false;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    const refused = h.engine.latestSession("1")!;
    // Unchanged choice: the saved conversation may be reopened in a terminal, as today.
    expect(h.engine.reopenMatchesChoice("1", refused)).toBe(true);
    // With Kiln not running, `kiln handoff` reads the snapshot Kiln saved last: the choice is unchanged, so it reopens.
    const offline = async () => { cacheSnapshot(h.engine, inspectionSnapshot(h.engine)); return (await handoffProjection(readWork(stateRoot(h.env), h.stateDirectory), refused.sessionId, h.env)).data as Record<string, unknown>; };
    expect((await offline()).resume_command).toEqual(expect.stringContaining(refused.sessionId));
    // Moved to Codex: the reopen command is withdrawn and the terminal gets Codex's fresh-session command (AC-PICK-07).
    writeModelDefaults(h.env, { standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } });
    h.engine.modelChoicesChanged();
    expect(h.engine.reopenMatchesChoice("1", refused)).toBe(false);
    const stop = buildSnapshot(h.engine).needsYou!;
    expect(stop.resumeCommand).toBeUndefined();
    expect(stop.freshSessionCommand).toBe(codexCommand(h.engine.sessionFolder));
    // `kiln handoff` says why it returns no reopen command, and gives the fresh-session instructions.
    const handoff = await handoffProjection(readWork(stateRoot(h.env), h.stateDirectory), refused.sessionId, h.env, h.engine);
    expect(handoff.data).toMatchObject({ resume_command: null, resume_argv: null, reason: expect.stringContaining("isn't reopened"), fresh_session_instructions: { command: expect.stringContaining("codex") } });
    // And with Kiln not running, from the saved snapshot's row: no reopen command, the reason, and Codex's fresh-session command.
    expect(await offline()).toMatchObject({ resume_command: null, resume_argv: null, resumable: false, reason: expect.stringContaining("isn't reopened. Start a fresh Codex session"), fresh_session_instructions: { command: codexCommand(h.engine.sessionFolder) } });
    // A choice that can't be used (Model defaults that don't parse) isn't the one the session ran on either: offline, nothing is reopened.
    writeFileSync(h.engine.modelDefaultsFile, "{ broken");
    h.engine.modelChoicesChanged();
    expect(await offline()).toMatchObject({ resume_command: null, resumable: false, fresh_session_instructions: { command: claudeCommand(h.engine.sessionFolder) } });
    // Back on its own choice, the person's reply goes to a new session, with the reply in its first message.
    writeModelDefaults(h.env, {});
    h.engine.modelChoicesChanged();
    expect(h.engine.resumeOffered("1")).toBe(true);
    expect(await h.engine.resume({ ...recoveryRequest(h.engine), note: "The import is merged now." })).toMatchObject({ ok: true });
    await waitFor(() => h.engine.isPhaseDone("1")); await h.engine.settled();
    const fresh = h.engine.latestSession("1")!;
    expect(fresh.sessionId).not.toBe(refused.sessionId);
    const call = h.claudeCalls()[1]!;
    expect(call.args).not.toContain("--resume");
    expect(call.prompt).toContain("The import is merged now.");
  });

  it("withdraws `kiln handoff`'s reopen command with Kiln not running after a Model defaults or tier change made once Kiln stopped", async () => {
    const h = await fixture([{ actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] }], { withCodex: true });
    await waitFor(() => !h.engine.readers.codex.state.pending);
    h.engine.record.settings.resumeAfterUsageLimit = false;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    const refused = h.engine.latestSession("1")!;
    // Kiln saves its last snapshot and stops; nothing changes the saved snapshot afterwards.
    cacheSnapshot(h.engine, inspectionSnapshot(h.engine));
    h.engine.close();
    const offline = async () => (await handoffProjection(readWork(stateRoot(h.env), h.stateDirectory), refused.sessionId, h.env)).data as Record<string, unknown>;
    expect((await offline()).resume_command).toEqual(expect.stringContaining(refused.sessionId));
    // `kiln model-defaults` moves the Standard row to Codex with no controller: the reopen command is withdrawn.
    writeModelDefaults(h.env, { standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } });
    expect(await offline()).toMatchObject({ resume_command: null, resume_argv: null, resumable: false, reason: expect.stringContaining("isn't reopened. Start a fresh Codex session"), fresh_session_instructions: { command: codexCommand(h.engine.sessionFolder) } });
    // The same row's effort only: the agent stays, but the model choice no longer matches.
    writeModelDefaults(h.env, { standard: { first: { agentId: "claude_code", family: refused.model, effort: "low" } } });
    expect(await offline()).toMatchObject({ resume_command: null, resume_argv: null, fresh_session_instructions: { command: claudeCommand(h.engine.sessionFolder) } });
    writeModelDefaults(h.env, {});
    expect((await offline()).resume_command).toEqual(expect.stringContaining(refused.sessionId));
    // A tier change in the phase document: Phase 1 is now mechanical, whose row runs on Codex.
    writeModelDefaults(h.env, CODEX_MECHANICAL);
    expect((await offline()).resume_command).toEqual(expect.stringContaining(refused.sessionId));
    const file = join(h.engine.worktreePath, DIRECTORY, "phase-1-return-intake.md");
    writeFileSync(file, readFileSync(file, "utf8").replace(/\n\n/, "\n\n**Model tier:** mechanical - one form.\n\n"));
    expect(await offline()).toMatchObject({ resume_command: null, resume_argv: null, fresh_session_instructions: { command: codexCommand(h.engine.sessionFolder) } });
  });

  it("launches nothing while a session's history exists but can't be read, and stops with the reason", async () => {
    const h = await fixture([{ actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] }]);
    h.engine.record.settings.resumeAfterUsageLimit = false;
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    const refused = h.engine.latestSession("1")!;
    // The session is recorded as a Codex one whose thread Kiln can't reach: Codex isn't installed.
    refused.agentId = "codex"; refused.conversation = { threadId: "thread-unreachable" } as NonNullable<typeof refused.conversation>;
    const { writeSessionRecord } = await import("../state/records.js");
    writeSessionRecord(h.stateDirectory, refused);
    expect(await h.engine.readStart("1")).toBe("unknown");
    expect(h.engine.resumeOffered("1")).toBe(false);
    expect(h.engine.unknownStarts.get("1")).toContain("Codex isn't installed");
    // A launch stops with the reason; Check again reads the history again and keeps the stop while it still can't be read.
    expect(await h.engine.startAgain()).toMatchObject({ ok: true }); await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop).toMatchObject({ kind: "selection" });
    await h.engine.checkAgain(); await h.engine.settled();
    expect(buildSnapshot(h.engine).needsYou?.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Whether the activity has started", passed: false })]));
    expect(h.claudeCalls()).toHaveLength(1);
  });

  it("goes to Needs you when the launch ending a wait is refused again by the same limit on the same account (AC-AUTO-05 across sessions)", async () => {
    const s = await waitingBeforeStart([refusedAtOnce(Math.floor(Date.now() / 1000) + 3_600)]);
    s.claude.queue(signedIn([usageRow("session", 10)]), signedIn([usageRow("session", 10)]), signedIn([usageRow("session", 10)]));
    s.claude.deliver(signedIn([usageRow("session", 10)]));
    await waitFor(() => s.h.engine.stoppedPhaseKey() === "1"); await s.h.engine.settled();
    const relaunched = s.h.engine.latestSession("1")!;
    expect(relaunched.sessionId).not.toBe(s.refused.sessionId);
    expect(relaunched.relaunchOf).toEqual({ sessionId: s.refused.sessionId, run: 0 });
    expect(s.h.engine.waitingPhaseKey()).toBeUndefined();
    expect(s.h.engine.record.phases["1"]!.stop!.limit).toMatchObject({ refusedAgainAt: relaunched.runs[0]!.startedAt });
    expect(s.h.claudeCalls()).toHaveLength(2);
  });

  it("ends the wait with the selection stop when a reading finds the current choice can't be used", async () => {
    const s = await waitingBeforeStart([]);
    writeModelDefaults(s.h.env, { standard: { first: { agentId: "claude_code", family: "mythos", effort: "high" } } });
    s.h.engine.modelChoicesChanged();
    // The wait's next reading, as its timer asks for one.
    (s.h.engine as unknown as { askReading(): void }).askReading();
    await waitFor(() => s.h.engine.stoppedPhaseKey() === "1");
    expect(s.h.engine.waitingPhaseKey()).toBeUndefined();
    expect(s.h.engine.record.phases["1"]!.stop).toMatchObject({ kind: "selection", checks: [{ facts: [expect.stringContaining("Mythos")] }] });
    expect(s.h.claudeCalls()).toHaveLength(1);
  });
});

describe("a Codex wait before the start (AC-PICK-07, AC-AGENTS-04)", () => {
  it("watches Codex, launches one new session when usage is allowed, records the attempt on the activity, and an unchanged reading buys no second", async () => {
    const h = await fixture([], { withCodex: true });
    const set = (value: Record<string, unknown>) => codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usageRefusal: true, ...value });
    const refresh = async (value: Record<string, unknown>) => { set(value); await h.engine.refreshAgents(); await h.engine.refreshAgents(); await h.engine.settled(); };
    const threads = () => codex!.calls().filter(call => call.method === "thread/start");
    set({ ordinaryUsageAllowed: false });
    const { runPrdOn } = await import("../test-support/model-choices.js");
    await runPrdOn(h.engine);
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    await h.engine.refreshAgents(); await h.engine.settled();
    const refused = h.engine.latestSession("1")!;
    // Refused before the model issued anything: the phase hasn't started, and its wait reads Codex.
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    expect(h.engine.waitAgent("1")).toBe("codex");
    expect(threads()).toHaveLength(1);
    await refresh({ ordinaryUsageAllowed: true });
    await waitFor(() => (h.engine.latestSession("1")?.sessionId !== refused.sessionId) && h.engine.latestSession("1")!.runs[0]?.endedAt !== undefined);
    await h.engine.refreshAgents(); await h.engine.settled();
    const fresh = h.engine.latestSession("1")!;
    expect(fresh).toMatchObject({ relaunchOf: { sessionId: refused.sessionId, run: 0 }, runs: [{ cause: "launch", codex: { automaticUsageEvidence: { accountId: "proof-account" } } }] });
    expect(fresh.conversation?.threadId).not.toBe(refused.conversation?.threadId);
    expect(threads()).toHaveLength(2);
    // The attempt was saved on the activity's own record; refused again, it waits, and an unchanged reading launches nothing.
    const consumed = h.engine.record.phases["1"]!.codexUsageRecovery?.consumed;
    expect(consumed).toMatchObject({ accountId: "proof-account" });
    expect(h.engine.waitingPhaseKey()).toBe("1");
    await refresh({ ordinaryUsageAllowed: true });
    expect(threads()).toHaveLength(2);
    expect(h.engine.record.phases["1"]!.codexUsageRecovery?.consumed).toEqual(consumed);
    expect(buildSnapshot(h.engine).waiting?.limit.recovery?.reason).toContain("One automatic attempt used");
    expect(h.claudeCalls()).toEqual([]);
  });

  it("moves a Claude Code wait to Codex when the choice moves there, and launches on Codex once its usage is allowed", async () => {
    const now = () => new Date();
    const claude = new ScriptedClaude(now);
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
    const h = await fixture([refusedAtOnce(Math.floor(Date.now() / 1000) + 3_600)], { withCodex: true, engineOptions: { claude, now } });
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, ordinaryUsageAllowed: false });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.engine.waitAgent("1")).toBe("claude_code");
    const refused = h.engine.latestSession("1")!;
    writeModelDefaults(h.env, { standard: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } } });
    h.engine.modelChoicesChanged();
    expect(h.engine.waitAgent("1")).toBe("codex");
    // Claude Code's account freeing up no longer ends the wait; Codex's reading does.
    claude.deliver(signedIn([usageRow("session", 0)]));
    expect(h.engine.waitingPhaseKey()).toBe("1");
    codex!.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, ordinaryUsageAllowed: true });
    // Claude Code is still needed by the other phases, so its reader answers too.
    for (let i = 0; i < 8; i++) claude.queue(signedIn([usageRow("session", 0)]));
    await h.engine.readers.codex.refresh(); await h.engine.readers.codex.refresh();
    await waitFor(() => h.engine.latestSession("1")?.agentId === "codex" && h.engine.latestSession("1")!.runs[0]?.endedAt !== undefined);
    await h.engine.settled();
    const fresh = h.engine.latestSession("1")!;
    expect(fresh).toMatchObject({ agentId: "codex", relaunchOf: { sessionId: refused.sessionId, run: 0 }, runs: [{ cause: "launch" }] });
    expect(h.claudeCalls()).toHaveLength(1);
  });
});

describe("Claude Code's billing approval follows why it is needed (AC-AGENTS-02)", () => {
  it("holds Start on a missing approval when an activity runs on Claude Code, but not when only a fallback names it", async () => {
    const h = await fixture([], { withCodex: true });
    h.env.ANTHROPIC_API_KEY = "fallback-billing-canary";
    await h.engine.refreshAgents(); await h.engine.refreshBilling();
    await waitFor(() => !h.engine.billing.pending && !h.engine.readers.claude_code.state.pending);
    expect(h.engine.billing.view).toMatchObject({ canLaunch: false, next: { route: "metered" } });
    // The reason names the agent, what to do and the activities that need it (AC-AGENTS-01's table).
    const refused = await h.engine.start({ refinementConfirmed: true });
    expect(refused).toMatchObject({ ok: false, reason: "Claude Code isn't ready: its billing setup isn't approved. Review and approve it, or change its source and recheck. Needed by Phase 1, Phase 2b, Phase 3, the delivery audit, the test audit and the pull request session." });
    expect(h.engine.record.startedAt).toBeUndefined();
    // Every activity on Codex, Claude Code only a fallback: the unapproved metered route leaves Start available, with the warning.
    writeModelDefaults(h.env, Object.fromEntries((["demanding", "standard", "mechanical", "audits"] as const).map(row => [row, { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "sonnet", effort: "high" } }])), { enabled: true, threshold: 95 });
    h.engine.modelChoicesChanged();
    await waitFor(() => !h.engine.billing.pending && !h.engine.readers.codex.state.pending);
    expect(h.engine.neededBy().claude_code).toEqual({ activities: [], fallbackOnly: true });
    expect(h.engine.modelsProblem).toBeUndefined();
    expect(buildSnapshot(h.engine).settings.models.fallback.warning).toMatchObject({ agentId: "claude_code", remedy: expect.stringContaining("approve") });
    expect(h.claudeCalls()).toEqual([]);
    // The launch check uses the agent of the activity about to launch: Phase 1 launches on Codex.
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true }); await h.engine.settled();
    expect(codex!.calls().some(call => call.method === "thread/start")).toBe(true);
    expect(h.engine.latestSession("1")!.agentId).toBe("codex");
    expect(h.claudeCalls()).toEqual([]);
  });

  it("keeps each agent's billing at its own latest launch in a run on both agents", async () => {
    const h = await fixture([landingSession("src/one.txt")], { withCodex: true });
    writeModelDefaults(h.env, CODEX_MECHANICAL);
    h.engine.modelChoicesChanged();
    await h.engine.refreshAgents();
    await waitFor(() => !h.engine.billing.pending && !h.engine.readers.codex.state.pending && !h.engine.readers.claude_code.state.pending);
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true });
    // Phase 1 lands on Claude Code; Phase 2b then launches on Codex.
    await waitFor(() => h.engine.latestSession("2b")?.runs[0]?.endedAt !== undefined); await h.engine.settled();
    expect(h.engine.latestSession("1")!.agentId).toBe("claude_code");
    expect(h.engine.latestSession("2b")!.agentId).toBe("codex");
    const lastLaunch = h.engine.record.billing!.lastLaunch!;
    expect(lastLaunch.claude_code).toMatchObject({ agentId: "claude_code" });
    expect(lastLaunch.codex).toMatchObject({ agentId: "codex" });
    expect(agentEntry(h.engine, "claude_code")!.billing?.lastLaunch).toMatchObject({ agentId: "claude_code" });
    expect(agentEntry(h.engine, "codex")!.billing?.lastLaunch).toMatchObject({ agentId: "codex" });
  });
});

describe("a phase its session split (AC-AGENTS-03)", () => {
  it("keeps the launched phase's agent for its first child in the needed agents and the in-use mark", async () => {
    // Phase 1's session, on Claude Code, splits it and rates 1a mechanical, which Model defaults puts on Codex.
    const child = "# Phase 1a: Intake form\n\n**Model tier:** mechanical - one form.\n\n## Acceptance criteria covered\nAC-RET-01\n\n## Phase dependencies\nNone.\n";
    const split: ScenarioSession = { actions: [{ text: "Splitting Phase 1." }, { split: [{ id: "1a", slug: "intake-form", title: "Intake form" }, { id: "1b", slug: "intake-email", title: "Intake email" }] }, { write: { path: `${DIRECTORY}/phase-1a-intake-form.md`, content: child } }, { commit: "docs: split phase 1" }, { push: true }, { result: "Split Phase 1; 1a is next." }] };
    const h = await fixture([split], { withCodex: true });
    writeModelDefaults(h.env, CODEX_MECHANICAL);
    h.engine.modelChoicesChanged();
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.record.plan?.find(phase => phase.id === "1")?.splitInto).toEqual(["1a", "1b"]);
    expect(h.engine.startedSessionOf("1")?.agentId ?? "claude_code").toBe("claude_code");
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.needsYou?.phaseId).toBe("1a");
    // 1a's facts are Phase 1's: it needs Claude Code, which its session runs on, not its own tier's Codex.
    const needs = h.engine.neededBy();
    expect(needs.claude_code?.activities).toContain("Phase 1a");
    expect(needs.codex?.activities ?? []).not.toContain("Phase 1a");
    expect(needs.codex?.activities).toContain("Phase 2b");
    expect(snapshot.agents.filter(entry => entry.inUse).map(entry => entry.agentId)).toEqual(["claude_code"]);
    // Its session has started it, so its model can't be changed (AC-PICK-05).
    expect(h.engine.modelChangeRefusal("1a", "Phase 1a")).toBe("Phase 1a has started, so it keeps the agent, model and effort it started on.");
  });
});
