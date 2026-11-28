// The build preflight when the run's agent is Codex (Kiln Build Preflight PRD, AC-PREFLIGHT-05):
// Codex lists its skills through its own app server, not Claude Code's, so whether the installed
// method has `build-preflight` is read and resolved on a separate path. Real engine and Git, with
// the deterministic Codex peer; the Claude Code cases are in build-preflight.integration.test.ts.
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { prdTreeAtHead } from "./worktree-setup.js";
import { Engine } from "./engine.js";
import { buildSnapshot } from "./snapshot.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { runPrdOn, writeModelDefaults, writeSettings } from "../test-support/model-choices.js";

let h: Harness | undefined;
let f: ReturnType<typeof codexWorkFixture> | undefined;
afterEach(async () => { await h?.cleanup(); await f?.sandbox.cleanup(); h = undefined; f = undefined; });

async function codexRun(additionalSkills: string[]) {
  h = await createHarness({ sessions: [], claude: join("missing", "claude") });
  f = codexWorkFixture();
  Object.assign(h.tools, { codex: f.options.executable });
  f.configureEnvironment(h.env);
  f.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, additionalSkills });
  h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (read.ok) h.engine.record.plan = recordedPlan(read.plan);
  await runPrdOn(h.engine);
  expect(h.engine.selectionError).toBeUndefined();
  return { h, f };
}
const turns = (fixture: ReturnType<typeof codexWorkFixture>) => fixture.calls().filter(call => call.method === "turn/start").map(call => JSON.stringify(call.params?.input));

describe("an older method under Codex is not an error (AC-PREFLIGHT-05)", () => {
  it("with no build-preflight skill in Codex's list, the plan shows no Preflight row and the first session is Phase 1", async () => {
    const { h, f } = await codexRun([]);
    expect(h.engine.readers.codex.state.optionalSkills).toEqual({ buildPreflight: false });
    expect(buildSnapshot(h.engine).preflight).toBeUndefined();
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => turns(f).length >= 1);
    expect(turns(f)[0]).toContain("phase-1-return-intake.md");
    expect(turns(f)[0]).not.toContain("build preflight");
    expect(h.engine.record.preflight?.activities ?? []).toEqual([]);
    expect((buildSnapshot(h.engine).activities ?? []).some(row => row.kind === "preflight")).toBe(false);
    await h.engine.settled();
  });

  it("with the skill in Codex's list, the plan shows the Preflight row and the preflight is the first session", async () => {
    const { h, f } = await codexRun(["build-preflight"]);
    expect(h.engine.readers.codex.state.optionalSkills).toEqual({ buildPreflight: true });
    // With no Documents found passed, the planned row has no activity to sit above.
    // It reads Will run on with the PRD's Codex choice (Kiln Phase Model Tiers AC-PICK-02).
    expect(buildSnapshot(h.engine).preflight).toEqual({ planned: { before: "end", model: { state: "will_run_on", from: "changed", choice: { agentId: "codex", agent: "Codex", model: "gpt-6.1-sol", modelName: "GPT-6.1-Sol", effort: "high" }, change: { available: true }, useDefault: true } } });
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => turns(f).length >= 1);
    expect(turns(f)[0]).toContain("Run the Enso Method's build preflight");
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    await h.engine.settled();
  });
});

/**
 * A run on both agents: Claude Code and Codex installed, the phase rows on `phases`' agent and
 * Audits on the other, with `build-preflight` installed only in `skillIn`'s method.
 */
async function mixedRun(phases: "claude_code" | "codex", skillIn: "claude_code" | "codex") {
  h = await createHarness({ sessions: [], preflight: skillIn === "claude_code" });
  f = codexWorkFixture();
  Object.assign(h.tools, { codex: f.options.executable });
  f.configureEnvironment(h.env);
  f.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, additionalSkills: skillIn === "codex" ? ["build-preflight"] : [] });
  // Each row's fallback sits on the other agent, as Model defaults requires; the fallback switch stays off.
  const codex = { agentId: "codex" as const, family: "sol", effort: "high" };
  const claude = { agentId: "claude_code" as const, family: "sonnet", effort: "high" };
  const codexRow = { first: codex, fallback: claude };
  const claudeRow = { first: claude, fallback: codex };
  const phaseRow = phases === "codex" ? codexRow : claudeRow;
  writeModelDefaults(h.env, { demanding: phaseRow, standard: phaseRow, mechanical: phaseRow, audits: phases === "codex" ? claudeRow : codexRow });
  h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (read.ok) h.engine.record.plan = recordedPlan(read.plan);
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  expect(h.engine.selectionError).toBeUndefined();
  return { h, f };
}
const claudePrompts = (harness: Harness) => harness.claudeCalls().map(call => String((call as { prompt: string }).prompt));

describe("the installed method checked is the preflight's own agent, from its Audits choice (Kiln Phase Model Tiers AC-AGENTS-04)", () => {
  it("phases on Claude Code, Audits on Codex, the skill only in Codex's method: the Preflight row shows and the preflight launches on Codex", async () => {
    const { h, f } = await mixedRun("claude_code", "codex");
    expect(h.engine.readers.claude_code.state.optionalSkills).toEqual({ buildPreflight: false });
    expect(h.engine.readers.codex.state.optionalSkills).toEqual({ buildPreflight: true });
    expect(buildSnapshot(h.engine).preflight).toMatchObject({ planned: { model: { state: "will_run_on", choice: { agentId: "codex" } } } });
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => turns(f).length >= 1);
    expect(turns(f)[0]).toContain("Run the Enso Method's build preflight");
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    expect(claudePrompts(h).some(prompt => prompt.startsWith("Run the Enso Method's build preflight"))).toBe(false);
    await h.engine.settled();
  });

  it("phases on Codex, Audits on Claude Code, the skill only in Claude Code's method: the Preflight row shows and the preflight launches on Claude Code", async () => {
    const { h, f } = await mixedRun("codex", "claude_code");
    expect(h.engine.readers.claude_code.state.optionalSkills).toEqual({ buildPreflight: true });
    expect(h.engine.readers.codex.state.optionalSkills).toEqual({ buildPreflight: false });
    expect(buildSnapshot(h.engine).preflight).toMatchObject({ planned: { model: { state: "will_run_on", choice: { agentId: "claude_code" } } } });
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => h.claudeCalls().length >= 1);
    expect(claudePrompts(h)[0]).toMatch(/^Run the Enso Method's build preflight/);
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    expect(turns(f).some(turn => turn.includes("Run the Enso Method's build preflight"))).toBe(false);
    await h.engine.settled();
  });
});

/**
 * A run on both agents with a schema 2 Model defaults file: the phases and Audits on `audits`'
 * agent, the Preflight and pull request row on `preflightPr`'s, and `build-preflight` installed
 * only in `skillIn`'s method.
 */
async function rowsRun(audits: "claude_code" | "codex", preflightPr: "claude_code" | "codex", skillIn: "claude_code" | "codex") {
  h = await createHarness({ sessions: [], preflight: skillIn === "claude_code" });
  f = codexWorkFixture();
  Object.assign(h.tools, { codex: f.options.executable });
  f.configureEnvironment(h.env);
  f.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, additionalSkills: skillIn === "codex" ? ["build-preflight"] : [] });
  const codex = { agentId: "codex" as const, family: "sol", effort: "high" };
  const claude = { agentId: "claude_code" as const, family: "sonnet", effort: "high" };
  const on = (agent: "claude_code" | "codex") => agent === "codex" ? { first: codex, fallback: claude } : { first: claude, fallback: codex };
  writeSettings(h.env, { rows: { demanding: on(audits), standard: on(audits), mechanical: on(audits), audits: on(audits), preflight_pr: on(preflightPr) } });
  h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  const read = readPlanAt(h.repository, "docs/prds/customer-returns");
  if (read.ok) h.engine.record.plan = recordedPlan(read.plan);
  h.engine.modelChoicesChanged();
  await h.engine.refreshAgents();
  expect(h.engine.selectionError).toBeUndefined();
  expect([h.engine.auditsAgent, h.engine.preflightPrAgent]).toEqual([audits, preflightPr]);
  return { h, f };
}

describe("the installed method checked is the Preflight and pull request row's agent, not the Audits row's (Kiln Model Modes AC-ROW-01)", () => {
  it("Audits on Claude Code, the new row on Codex, the skill only in Codex's method: the Preflight row shows and the preflight launches on Codex", async () => {
    const { h, f } = await rowsRun("claude_code", "codex", "codex");
    expect(h.engine.readers.claude_code.state.optionalSkills).toEqual({ buildPreflight: false });
    expect(h.engine.readers.codex.state.optionalSkills).toEqual({ buildPreflight: true });
    expect(buildSnapshot(h.engine).preflight).toMatchObject({ planned: { model: { state: "will_run_on", choice: { agentId: "codex" } } } });
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => turns(f).length >= 1);
    expect(turns(f)[0]).toContain("Run the Enso Method's build preflight");
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    expect(claudePrompts(h).some(prompt => prompt.startsWith("Run the Enso Method's build preflight"))).toBe(false);
    await h.engine.settled();
  });

  it("Audits on Codex, the new row on Claude Code, the skill only in Codex's method: no Preflight row, and the first session is Phase 1", async () => {
    const { h } = await rowsRun("codex", "claude_code", "codex");
    expect(h.engine.readers.claude_code.state.optionalSkills).toEqual({ buildPreflight: false });
    expect(h.engine.readers.codex.state.optionalSkills).toEqual({ buildPreflight: true });
    expect(buildSnapshot(h.engine).preflight).toBeUndefined();
    expect((buildSnapshot(h.engine).activities ?? []).some(row => row.kind === "preflight")).toBe(false);
  });
});
