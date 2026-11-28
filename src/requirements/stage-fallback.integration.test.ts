// A requirements stage follows a phase's model rules for the fallback (Kiln Requirements Stages
// AC-MODEL-06): the heads-up on the row Kiln launches next, a stage stopped before it started and
// a stop's review with no plan included, while the stage is current why the fallback wasn't used,
// and the terminal line naming a stage that started on it. Real engine and Git; the Claude account
// reading is set at the reader's boundary, since an account can't be brought to the threshold on
// demand.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import { ScriptedClaude, signedIn, usageRow, type ScriptedReading } from "../test-support/scripted-claude.js";
import type { AccountView } from "../account/claude-account.js";
import type { ClaudeInfoSource } from "../account/claude-info.js";
import { buildSnapshot } from "../engine/snapshot.js";
import { modelDefaultsPath } from "../models/model-defaults.js";

let h: Harness | undefined;
let codex: ReturnType<typeof codexWorkFixture> | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; await codex?.sandbox.cleanup(); codex = undefined; });

/** A Claude account reader that answers every reading at once with the reading the test set. */
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
const rows = () => buildSnapshot(h!.engine).requirements!.rows;

it("says on the running stage's row why the fallback wasn't used", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-stage-fallback-"));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude: new SetClaude(weekly(97)) },
    sessions: [{ actions: [{ touch: join(signals, "running") }, { waitForFile: join(signals, "go") }, { result: "Not finished." }, { exit: 0 }] }] });
  writeModelDefaults(h.env, {}, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => rows().some(row => row.state === "running" && row.model?.fallback), 20_000);
  // Codex isn't installed, so the stage stays on its first choice, and its row says why while it is current.
  const running = rows().find(row => row.state === "running")!;
  expect(running.model).toMatchObject({ choice: { agent: "Claude Code", model: "fable" }, fallback: { used: false, threshold: 95, reason: expect.stringContaining("Codex is not on PATH") } });
  writeFileSync(join(signals, "go"), "");
  await h.engine.settled();
});

it("shows the heads-up on the requirements row Kiln launches next", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude: new SetClaude(weekly(97)) }, sessions: [] });
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
  // This Codex offers GPT Sol only, so the Requirements stages row falls back to it.
  writeModelDefaults(h.env, { requirements: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } } }, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  // The plan read's launch check reads auth alone; a full reading afterwards gives the usage the forecast reads.
  await waitFor(() => buildSnapshot(h!.engine).requirements!.plan.status === "failed", 20_000);
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending && !h!.engine.readers.codex.state.pending);
  await waitFor(() => !!h!.engine.headsUp(), 20_000);
  expect(h.engine.headsUp()!.key).toBe("req-next");
  const next = rows().find(row => row.key === "kiln:next")!;
  expect(next.model?.forecast).toMatchObject({ choice: { agent: "Codex" }, limit: { agent: "Claude Code", percent: 97 }, threshold: 95 });
});

it("keeps the heads-up on a stage stopped before it started, with its Change there, not on the stage after it", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude: new SetClaude(weekly(97)) }, sessions: [] });
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
  writeModelDefaults(h.env, { requirements: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } } }, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => buildSnapshot(h!.engine).requirements!.plan.status === "failed", 20_000);
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending && !h!.engine.readers.codex.state.pending);
  await waitFor(() => !!h!.engine.headsUp(), 20_000);
  // The stage launches on its fallback, whose Codex copy holds no method: it stops before its session starts.
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const stopped = h.engine.stoppedPhaseKey()!;
  expect(h.engine.record.phases[stopped]).toMatchObject({ sessionIds: [], stop: { kind: "selection" } });
  // The next launch is that stage's again, so the heads-up stays on its row, which offers its Change (Phase Model Tiers AC-FALLBACK-04, AC-PICK-06).
  expect(h.engine.headsUp()!.key).toBe(stopped);
  const row = rows().find(one => one.activityId && `req-${one.activityId}` === stopped)!;
  expect(row).toMatchObject({ state: "needs_you", model: { forecast: { choice: { agent: "Codex" }, threshold: 95 }, change: { available: true } } });
});

it("with a plan, keeps the heads-up on the stopped stage's row and takes a Change made there at its relaunch (AC-PICK-06)", async () => {
  const plan = "```kiln-plan\n" + JSON.stringify({ kilnPlan: 1, stages: [{ skill: "prd-writing-standards", title: "Write the PRD", reaches: [] }, { skill: "autonomous-prd-refinement", title: "Refine the PRD", reaches: ["prd_refined"] }, { skill: "phase-split", title: "Phase plan", reaches: ["requirements_finished"] }], reviewSkill: { skill: "stakeholder-review-package", title: "Stakeholder review" } }) + "\n```";
  const claude = new SetClaude(weekly(97));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude },
    planSessions: [{ actions: [{ result: plan }, { exit: 0 }] }], sessions: [{ actions: [{ result: "Not finished." }, { exit: 0 }] }] });
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
  writeModelDefaults(h.env, { requirements: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } } }, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => buildSnapshot(h!.engine).requirements!.plan.status === "read", 20_000);
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending && !h!.engine.readers.codex.state.pending);
  await waitFor(() => !!h!.engine.headsUp(), 20_000);
  expect(h.engine.headsUp()!.key).toBe("req-row:prd-writing-standards#1");
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const stopped = h.engine.stoppedPhaseKey()!;
  expect(h.engine.record.phases[stopped]).toMatchObject({ sessionIds: [], stop: { kind: "selection" } });
  // The stopped stage is the next launch: the heads-up is on its row, not on the planned stage after it.
  expect(h.engine.headsUp()!.key).toBe(stopped);
  const shown = rows();
  expect(shown.find(one => one.activityId && `req-${one.activityId}` === stopped)).toMatchObject({ key: "prd-writing-standards#1", state: "needs_you", model: { forecast: { choice: { agent: "Codex" } }, change: { available: true } } });
  expect(shown.filter(one => one.model?.forecast)).toHaveLength(1);
  // A Change made on that row, as Needs you offers it, is what the relaunch runs on.
  const activityId = stopped.slice("req-".length);
  expect(await h.engine.changeStageModel(activityId, { agentId: "claude_code", model: "opus", effort: "high" }, false)).toEqual({ ok: true });
  // Claude Code's allowance has recovered, so the relaunch decides on the changed choice itself.
  claude.reading = weekly(10);
  await claude.refreshAccount();
  expect(await h.engine.checkAgain({})).toMatchObject({ ok: true });
  await h.engine.settled();
  const call = h.claudeCalls().at(-1)!;
  expect(call.args[call.args.indexOf("--model") + 1]).toBe("opus");
});

it("names the requirements stage in the terminal line when it starts on the fallback (Phase Model Tiers AC-FALLBACK-03)", async () => {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude: new SetClaude(weekly(10)) }, sessions: [{ actions: [{ result: "Not finished." }, { exit: 0 }] }] });
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 97, windowDurationMins: 300 } } } } });
  // Codex first, at 97%: the stage starts on its Claude Code fallback.
  writeModelDefaults(h.env, { requirements: { first: { agentId: "codex", family: "sol", effort: "high" }, fallback: { agentId: "claude_code", family: "fable", effort: "high" } } }, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => buildSnapshot(h!.engine).requirements!.plan.status === "failed", 20_000);
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending && !h!.engine.readers.codex.state.pending);
  await waitFor(() => !!h!.engine.headsUp(), 20_000);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const stage = rows().find(row => row.activityId)!;
  expect(stage.model).toMatchObject({ choice: { agent: "Claude Code", model: "claude-fable-5-1", effort: "high" }, fallback: { used: true, limit: { agent: "Codex", percent: 97 }, threshold: 95 } });
  const lines = h.events.filter(event => event.kind === "message" && event.text.includes("started on the fallback"));
  expect(lines).toEqual([{ kind: "message", text: expect.stringMatching(/^Next requirements stage started on the fallback, Claude Code · Fable [0-9.]* · high: Codex's .* read 97%, at or above the 95% threshold/) }]);
});

it("with no plan, puts the heads-up on the stop's review row when the review is Kiln's next launch (Phase Model Tiers AC-FALLBACK-04, AC-PICK-06)", async () => {
  const signals = mkdtempSync(join(tmpdir(), "kiln-stage-fallback-"));
  const dir = "docs/prds/count-boxes";
  const report = (ran: string, next: string, milestones: string[], reaches: string[] = []) => ({ result: "```kiln-report\n" + JSON.stringify({ kilnReport: 1, ran: [{ skill: ran, title: ran }], finished: true,
    next: { kind: "requirements", skill: next, title: next, reaches }, milestones: milestones.map(name => ({ name, by: "this_session" })), prdDirectory: dir }) + "\n```" });
  const claude = new SetClaude(weekly(10));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude }, sessions: [
    { actions: [{ write: { path: `${dir}/count-boxes-prd.md`, content: "# Count boxes PRD\n" } }, { commit: "draft" }, report("prd-writing-standards", "autonomous-prd-refinement", []), { exit: 0 }] },
    // The refinement reaches the early stop, and its report names the method's review skill next.
    { actions: [{ touch: join(signals, "refining") }, { waitForFile: join(signals, "go") }, { write: { path: `${dir}/count-boxes-prd.md`, content: "# Count boxes PRD\n\nRefined.\n" } }, { commit: "refine" }, report("autonomous-prd-refinement", "stakeholder-review-package", ["prd_refined"], ["review_made"]), { exit: 0 }] },
  ] });
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
  writeModelDefaults(h.env, { requirements: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } } }, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => buildSnapshot(h!.engine).requirements!.plan.status === "failed", 20_000);
  await h.engine.refreshAgents();
  await waitFor(() => !h!.engine.readers.claude_code.state.pending && !h!.engine.readers.codex.state.pending);
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(join(signals, "refining")), 20_000);
  // Pause after: Kiln holds before the review session the refinement's stop calls for.
  h.engine.pause();
  writeFileSync(join(signals, "go"), "");
  await h.engine.settled();
  expect(h.engine.record.pause.activeSince).toBeDefined();
  // Claude Code's allowance now stands past the threshold, so the review's launch would fall back.
  claude.reading = weekly(97);
  await claude.refreshAccount();
  await waitFor(() => !!h!.engine.headsUp(), 20_000);
  expect(h.engine.headsUp()!.key).toBe("req-row:kiln:early");
  const shown = rows();
  expect(shown.find(row => row.state === "next")).toMatchObject({ key: "kiln:early", model: { forecast: { choice: { agent: "Codex" }, limit: { agent: "Claude Code", percent: 97 } } } });
  expect(shown.filter(row => row.model?.forecast)).toHaveLength(1);
  // The choice checks read the same row: a choice saved for the review's skill that can't be used names the review row.
  const path = modelDefaultsPath(h.env);
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), skills: { "stakeholder-review-package": { agentId: "claude_code", family: "opus", effort: "ultra" } } }));
  h.engine.modelChoicesChanged();
  await waitFor(() => !!h!.engine.modelsProblem);
  expect(h.engine.modelsProblem).toMatch(/^Early stakeholder review runs on Claude Code · Opus[^:]* · ultra from a choice saved for every PRD for this stage's skill: /);
});


it("keeps a started requirements stage on its original agent when the default and usage change (AC-MODEL-01, AC-MODEL-06)", async () => {
  const claude = new SetClaude(weekly(10));
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder: "count-boxes", engineOptions: { claude }, sessions: [
    { actions: [{ write: { path: "draft-notes.md", content: "Partial stage work.\n" } }, { result: "Need the user's input." }, { exit: 0 }] },
    { actions: [{ result: "Still drafting." }, { exit: 0 }] },
  ] });
  codex = codexWorkFixture();
  Object.assign(h.tools, { codex: codex.options.executable });
  codex.configureEnvironment(h.env);
  codex.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, usage: { accountId: "proof-account", ordinaryUsageAllowed: true, rateLimits: {}, rateLimitsByLimitId: { codex: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 300 } } } } });
  writeModelDefaults(h.env, { requirements: { first: { agentId: "claude_code", family: "fable", effort: "high" }, fallback: { agentId: "codex", family: "sol", effort: "high" } } }, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  await waitFor(() => h!.engine.planView().status === "failed");
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await h.engine.settled();
  const key = h.engine.stoppedPhaseKey()!;
  const started = h.engine.startedSessionOf(key)!;
  expect(started).toMatchObject({ agentId: "claude_code", model: "fable", effort: "high" });
  claude.reading = weekly(97);
  await claude.refreshAccount();
  writeModelDefaults(h.env, { requirements: { first: { agentId: "claude_code", family: "sonnet", effort: "low" }, fallback: { agentId: "codex", family: "sol", effort: "high" } } }, { enabled: true, threshold: 95 });
  h.engine.modelChoicesChanged();
  expect(rows().find(row => row.activityId === key.slice("req-".length))?.model)
    .toMatchObject({ state: "running_on", choice: { agent: "Claude Code", model: "claude-fable-5-1", effort: "high" } });
  expect(await h.engine.resume()).toMatchObject({ ok: true });
  await h.engine.settled();
  expect(h.claudeCalls()).toHaveLength(2);
  expect(h.claudeCalls()[1]!.args).toEqual(expect.arrayContaining(["--resume", started.sessionId, "--model", "claude-fable-5-1", "--effort", "high"]));
  expect(h.engine.latestSession(key)).toMatchObject({ sessionId: started.sessionId, agentId: "claude_code", model: "fable", effort: "high" });
});
