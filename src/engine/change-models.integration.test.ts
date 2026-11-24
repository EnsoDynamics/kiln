// Changing models through the engine and its loopback API (Kiln Phase Model Tiers, Phase 3:
// AC-PICK-03, AC-OTHER-01, AC-KEEP-02, AC-DEFAULT-02, AC-DEFAULT-03, AC-FALLBACK-01), against real
// Git with the stand-in claude: a phase that hasn't started is changed on Documents found and in a
// run, keeps its change across a restart and whatever its tier or Model defaults later say, returns
// to its tier with Use the default, and launches on what it was changed to; the Audits choice
// reaches the audits and the pull request session; Model defaults are changed for every PRD, with
// the same refusals the commands give; and a started or finished phase can't be changed.

import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { recoveryRequest } from "../test-support/phase-recovery-request.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";
import { modelDefaultsPath } from "../models/model-defaults.js";
import type { Engine } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";

let harness: Harness | undefined;
let server: LocalServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; await harness?.cleanup(); harness = undefined; });

const DIRECTORY = "docs/prds/customer-returns";

/** The fixture documents with Phase 1 demanding and Phase 2b mechanical; Phase 3 is not rated, 2a closed. */
function tieredFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  const line = (name: string, text: string) => { files[name] = files[name]!.replace(/\n\n/, `\n\n${text}\n\n`); };
  line("phase-1-return-intake.md", "**Model tier:** demanding — AC-RET-02 moves money on retries.");
  line("phase-2b-store-credit.md", "**Model tier:** mechanical - repeats the card refund flow.");
  return files;
}

async function fixture(sessions: ScenarioSession[], preflight = false) {
  harness = await createHarness({ sessions, files: tieredFiles(), ...(preflight ? { preflight: true } : {}) });
  const read = readPlanAt(harness.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  harness.engine.record.plan = recordedPlan(read.plan);
  harness.engine.modelChoicesChanged();
  await harness.engine.refreshAgents();
  server = await startLocalServer({ engine: harness.engine, port: 0, folderName: "customer-returns", featureName: "Customer returns", token: harness.engine.record.token });
  return harness;
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(path, server!.address), { method: "POST", headers: { "X-Kiln-Token": harness!.engine.record.token, "Content-Type": "application/json", Origin: new URL(server!.address).origin }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
async function get(path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(new URL(path, server!.address), { headers: { "X-Kiln-Token": harness!.engine.record.token } });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const rows = (engine: Engine): PhaseView[] => { const snapshot = buildSnapshot(engine); return snapshot.activities ?? snapshot.documents?.plan?.phases as unknown as PhaseView[] ?? snapshot.phases; };
const row = (engine: Engine, id: string): PhaseView => rows(engine).find(one => one.id === id)!;
const shown = (view: PhaseView) => [view.model?.choice?.modelName, view.model?.choice?.effort, view.model?.from];
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];
const launches = (h: Harness) => h.claudeCalls().filter(call => !call.args.includes("--resume")).map(call => [flag(call.args, "--model"), flag(call.args, "--effort")]);

describe("a phase that hasn't started can be changed and returned to its default (AC-PICK-03)", () => {
  it("changes a phase before Start, keeps it across a restart and a later default, and returns it with Use the default", async () => {
    const h = await fixture([]);
    expect(row(h.engine, "2b").model).toMatchObject({ change: { available: true } });
    expect(row(h.engine, "2b").model?.useDefault).toBeUndefined();

    expect(await post("/api/model", { target: { phase: "2b" }, choice: { agentId: "claude_code", model: "haiku", effort: "low" } })).toMatchObject({ status: 200, body: { ok: true } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect(row(h.engine, "2b").model).toMatchObject({ change: { available: true }, useDefault: true });
    // The change covers that phase only.
    expect(shown(row(h.engine, "3"))).toEqual(["Opus 5.5", "medium", "model_defaults"]);

    // Model defaults changing the mechanical row doesn't reach it; it does reach every other phase on that row.
    writeModelDefaults(h.env, { mechanical: { first: { agentId: "claude_code", family: "opus", effort: "low" } }, standard: { first: { agentId: "claude_code", family: "sonnet", effort: "low" } } });
    h.engine.modelChoicesChanged();
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect(shown(row(h.engine, "3"))).toEqual(["Sonnet 5.5", "low", "model_defaults"]);

    // Across a restart, the change is kept.
    const reopened = h.reopenFromDisk();
    await reopened.refreshAgents();
    expect(shown(row(reopened, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect(await reopened.changeModel({ phase: "2b" }, "default")).toEqual({ ok: true });
    expect(shown(row(reopened, "2b"))).toEqual(["Opus 5.5", "low", "model_defaults"]);
    expect(row(reopened, "2b").model?.useDefault).toBeUndefined();
    expect(reopened.record.settings.modelChoices.phases["2b"]).toBe("default");
  });

  it("refuses a phase Kiln doesn't build, a finished one, and a choice its agent doesn't offer or that names no effort", async () => {
    const h = await fixture([]);
    const opus = { agentId: "claude_code", model: "opus", effort: "high" };
    expect(await post("/api/model", { target: { phase: "2" }, choice: opus })).toEqual({ status: 422, body: { ok: false, reason: "2 isn't a phase Kiln builds in this plan. Phases: 1, 2a, 2b, 3." } });
    expect(await post("/api/model", { target: { phase: "2a" }, choice: opus })).toEqual({ status: 409, body: { ok: false, reason: "Phase 2a is finished; there is nothing to change." } });
    // A closed phase offers no Change.
    expect(row(h.engine, "2a").model?.change).toBeUndefined();
    expect(await post("/api/model", { target: { phase: "1" }, choice: { agentId: "claude_code", model: "opus" } })).toEqual({ status: 422, body: { ok: false, reason: "Choose an effort for Opus 5.5; no supported default was reported." } });
    expect(await post("/api/model", { target: { phase: "1" }, choice: { ...opus, effort: "" } })).toEqual({ status: 400, body: { ok: false, reason: "effort can't be empty; leave it out to use the agent's default." } });
    // Before Start, kiln model has nothing to change: the control says to use Documents found.
    expect(h.engine.controlView().controls.find(control => control.name === "model")).toEqual({ name: "model", available: false, reason: "No run is underway. Change models on Documents found." });
    expect(await post("/api/model", { target: { phase: "1" }, choice: { ...opus, model: "claude-opus-4-1" } })).toEqual({ status: 422, body: { ok: false, reason: "Claude Code doesn't offer claude-opus-4-1 on this account." } });
    expect(await post("/api/model", { target: { phase: "1" }, choice: { ...opus, effort: "ultra" } })).toEqual({ status: 422, body: { ok: false, reason: "Opus 5.5 doesn't offer ultra effort." } });
    // Codex isn't installed here, so its list can't be read and Change offers no choices on it.
    expect(await post("/api/model", { target: { phase: "1" }, choice: { agentId: "codex", model: "gpt-6.1-sol", effort: "high" } })).toMatchObject({ status: 422, body: { reason: "Codex isn't installed." } });
    expect(h.engine.record.settings.modelChoices.phases).toEqual({});
  });
});

describe("a choice kept from before this change (AC-KEEP-02)", () => {
  it("marks the kept choice Changed by you on every row, and returns one row at a time to its default", async () => {
    const h = await fixture([]);
    h.engine.record.settings.modelChoices.kept = { agentId: "claude_code", model: "sonnet", effort: "max" };
    h.engine.modelChoicesChanged();
    for (const id of ["1", "2b", "3"]) {
      expect(shown(row(h.engine, id))).toEqual(["Sonnet 5.5", "max", "changed"]);
      expect(row(h.engine, id).model).toMatchObject({ change: { available: true }, useDefault: true });
    }
    expect(buildSnapshot(h.engine).settings.models.audits).toMatchObject({ changedByYou: true, useDefault: true });
    expect(await post("/api/model", { target: { phase: "1" }, choice: "default" })).toMatchObject({ status: 200 });
    expect(shown(row(h.engine, "1"))).toEqual(["Fable 5.1", "high", "model_defaults"]);
    // The others keep the kept choice until each is changed on its own.
    expect(shown(row(h.engine, "2b"))).toEqual(["Sonnet 5.5", "max", "changed"]);
    expect(await post("/api/model", { target: { phase: "2b" }, choice: { agentId: "claude_code", model: "opus", effort: "low" } })).toMatchObject({ status: 200 });
    expect(shown(row(h.engine, "2b"))).toEqual(["Opus 5.5", "low", "changed"]);
    expect(shown(row(h.engine, "3"))).toEqual(["Sonnet 5.5", "max", "changed"]);
  });
});

describe("the Audits choice for one PRD (AC-OTHER-01)", () => {
  it("changes every activity that isn't a phase from Documents found's line, and the run launches each phase and the pull request on its choice", async () => {
    const h = await fixture([landingSession("src/one.txt"), landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()]);
    expect(buildSnapshot(h.engine).settings.models.audits).toMatchObject({ choice: { agent: "Claude Code", modelName: "Opus 5.5", effort: "high" }, changedByYou: false, change: { available: true } });
    expect(await post("/api/model", { target: "audits", choice: { agentId: "claude_code", model: "sonnet", effort: "medium" } })).toMatchObject({ status: 200 });
    expect(buildSnapshot(h.engine).settings.models.audits).toMatchObject({ choice: { modelName: "Sonnet 5.5", effort: "medium" }, changedByYou: true, useDefault: true });
    await h.engine.changeModel({ phase: "3" }, { agentId: "claude_code", model: "haiku", effort: "high" });
    // Both changes are kept across a restart.
    const reopened = h.reopenFromDisk();
    await reopened.refreshAgents();
    expect(buildSnapshot(reopened).settings.models.audits).toMatchObject({ choice: { modelName: "Sonnet 5.5", effort: "medium" }, changedByYou: true });

    expect(await reopened.start({ refinementConfirmed: true })).toEqual({ ok: true });
    await reopened.settled();
    expect(reopened.record.completedAt).toBeDefined();
    // Phase 1 on demanding's default, 2b on mechanical's, 3 on its change, the pull request on the changed Audits choice.
    expect(launches(h)).toEqual([["fable", "high"], ["sonnet", "high"], ["haiku", "high"], ["sonnet", "medium"]]);
    // A finished run has nothing left to change.
    expect(buildSnapshot(reopened).settings.models.audits.change).toEqual({ available: false, reason: "The run is complete; no activity is left to change." });
    expect(reopened.controlView().controls.find(control => control.name === "model")).toEqual({ name: "model", available: false, reason: "The run is complete; no activity is left to change." });
  });
});

describe("an Audits change reaches only Audits activities that haven't started (AC-OTHER-01, AC-PICK-05)", () => {
  it("keeps the preflight on what it ran on while the not-started Audits activities take the change", async () => {
    const { mkdtempSync, writeFileSync: touch, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "kiln-audits-"));
    const release = join(dir, "release");
    const ready: ScenarioSession = { actions: [{ skill: "enso-method:build-preflight" }, { result: "Preflight: ready\n\n3 phases. The build runs to the end without stopping." }, { exit: 0 }] };
    // Phase 1 holds after its first response, so the Audits choice changes while it runs.
    const held = landingSession("src/one.txt"); held.actions.unshift({ text: "Working on the intake." }, { waitForFile: release });
    const h = await fixture([ready, held], true);
    const starting = h.engine.start({ refinementConfirmed: true });
    await waitFor(() => row(h.engine, "1").model?.state === "running_on");
    expect(rows(h.engine).find(one => one.kind === "preflight")!.model).toMatchObject({ state: "ran_on", choice: { modelName: "Opus 5.5", effort: "high" } });
    expect(await post("/api/model", { target: "audits", choice: { agentId: "claude_code", model: "sonnet", effort: "low" } })).toMatchObject({ status: 200 });
    // The preflight finished on the Audits choice it started on; the change doesn't reach it.
    expect(rows(h.engine).find(one => one.kind === "preflight")!.model).toMatchObject({ state: "ran_on", choice: { modelName: "Opus 5.5", effort: "high" } });
    expect(row(h.engine, "planned-pull-request").model).toMatchObject({ state: "will_run_on", choice: { modelName: "Sonnet 5.5", effort: "low" }, from: "changed" });
    // The preflight launched on the Audits default it ran on; the pull request session launching on a changed Audits choice is proved above.
    expect(launches(h)[0]).toEqual(["opus", "high"]);
    touch(release, "");
    await starting; await h.engine.settled();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("changing models while Kiln works (AC-PICK-03)", () => {
  it("changes a later phase while a session of an earlier one runs", async () => {
    const { mkdtempSync, writeFileSync: touch, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "kiln-working-"));
    const release = join(dir, "release");
    const h = await fixture([{ actions: [{ text: "Working on the intake." }, { waitForFile: release }, { result: "I think this is done." }] } as ScenarioSession]);
    const starting = h.engine.start({ refinementConfirmed: true });
    await waitFor(() => row(h.engine, "1").model?.state === "running_on");
    expect(row(h.engine, "2b").model?.change).toEqual({ available: true });
    expect(await post("/api/model", { target: { phase: "2b" }, choice: { agentId: "claude_code", model: "haiku", effort: "low" } })).toMatchObject({ status: 200, body: { ok: true } });
    expect(h.engine.commands.all().at(-1)?.instruction).toMatchObject({ action: "model", inputs: { phase: "2b" } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect((await post("/api/model", { target: { phase: "1" }, choice: { agentId: "claude_code", model: "haiku", effort: "low" } })).status).toBe(409);
    touch(release, "");
    await starting; await h.engine.settled();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("changing models in a run underway (AC-PICK-03, AC-PICK-05)", () => {
  it("changes a later phase through the instruction journal, refuses the started one, and launches the later phase on its change", async () => {
    // Phase 1 answers and stops at Needs you: it has started.
    const h = await fixture([{ actions: [{ result: "I think this is done." }] }, landingSession("src/one.txt"), landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    expect(row(h.engine, "1").model?.state).toBe("running_on");
    expect(row(h.engine, "1").model?.change).toBeUndefined();
    expect(row(h.engine, "2b").model).toMatchObject({ state: "will_run_on", change: { available: true } });
    // The planned Delivery audit and Test audit rows offer Change; the pull request row doesn't.
    expect(row(h.engine, "planned-delivery-audit").model?.change).toEqual({ available: true });
    expect(row(h.engine, "planned-pull-request").model?.change).toBeUndefined();
    expect(h.engine.controlView().controls.find(control => control.name === "model")).toEqual({ name: "model", available: true, reason: null });

    expect(await post("/api/model", { target: { phase: "1" }, choice: { agentId: "claude_code", model: "haiku", effort: "low" } })).toEqual({ status: 409, body: { ok: false, reason: "Phase 1 has started, so it keeps the agent, model and effort it started on." } });
    expect(await post("/api/model", { target: { phase: "2b" }, choice: { agentId: "claude_code", model: "haiku", effort: "low" } })).toMatchObject({ status: 200, body: { ok: true } });
    expect(h.engine.commands.all().at(-1)?.instruction).toMatchObject({ action: "model", inputs: { phase: "2b", agent_id: "claude_code", model: "haiku", effort: "low" } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    // A changed default reaches phase 3, which hasn't started, never phase 1, which has (AC-DEFAULT-03).
    writeModelDefaults(h.env, { demanding: { first: { agentId: "claude_code", family: "haiku", effort: "high" } }, standard: { first: { agentId: "claude_code", family: "sonnet", effort: "high" } } });
    h.engine.modelChoicesChanged();
    expect(row(h.engine, "1").model).toMatchObject({ state: "running_on", choice: { modelName: "Fable 5.1", effort: "high" } });
    expect(shown(row(h.engine, "3"))).toEqual(["Sonnet 5.5", "high", "model_defaults"]);
    // A planned audit row's Change is the PRD's Audits choice.
    expect(await post("/api/model", { target: "audits", choice: { agentId: "claude_code", model: "sonnet", effort: "low" } })).toMatchObject({ status: 200 });
    expect(shown(row(h.engine, "planned-test-audit"))).toEqual(["Sonnet 5.5", "low", "changed"]);
    expect(row(h.engine, "planned-test-audit").model?.useDefault).toBe(true);

    // Phase 1 resumes and lands; the run goes on to 2b on its change.
    expect(await h.engine.resume(recoveryRequest(h.engine))).toMatchObject({ ok: true });
    await waitFor(() => h.engine.record.completedAt !== undefined || h.engine.stoppedPhaseKey() !== undefined && h.engine.stoppedPhaseKey() !== "1", 20000);
    await h.engine.settled();
    // After phase 1's resume, 2b launches on its change and 3 on the changed Standard row.
    expect(launches(h).slice(1, 3)).toEqual([["haiku", "low"], ["sonnet", "high"]]);
  });
});

describe("Change while a launch is under way or the start is unknown (\"Change while a launch of the activity is under way\")", () => {
  it("refuses Change for a phase whose launch is under way and for one whose start can't be read, and offers it again once each clears", async () => {
    const { mkdtempSync, writeFileSync: touch, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "kiln-launch-hold-"));
    const launched = join(dir, "launched"); const release = join(dir, "release");
    const h = await fixture([{ beforeInit: { touch: launched, waitForFile: release }, actions: [{ result: "I think this is done." }] } as ScenarioSession]);
    const starting = h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(launched));
    // Phase 1's launch has saved its decision and its process runs, with no response yet.
    expect(h.engine.sessionBusy("1")).toBe(true);
    expect(row(h.engine, "1").model).toMatchObject({ state: "will_run_on", change: { available: false, reason: "Phase 1 is launching or running on its saved choice. Change it once that session ends." } });
    expect(await post("/api/model", { target: { phase: "1" }, choice: { agentId: "claude_code", model: "haiku", effort: "low" } })).toEqual({ status: 409, body: { ok: false, reason: "Phase 1 is launching or running on its saved choice. Change it once that session ends." } });
    // A phase whose start can't be read is refused with the read's reason.
    h.engine.unknownStarts.set("2b", "Claude Code's conversation file can't be read.");
    expect(row(h.engine, "2b").model?.change).toEqual({ available: false, reason: "Kiln can't tell whether phase 2b has started, so its model can't be changed yet. Claude Code's conversation file can't be read." });
    expect((await post("/api/model", { target: { phase: "2b" }, choice: { agentId: "claude_code", model: "haiku", effort: "low" } })).status).toBe(409);
    h.engine.unknownStarts.delete("2b");
    expect(row(h.engine, "2b").model?.change).toEqual({ available: true });
    touch(release, "");
    await starting; await h.engine.settled();
    const { rmSync } = await import("node:fs"); rmSync(dir, { recursive: true, force: true });
    // Once the launch ended, phase 1 has started on what it launched on: it offers no Change.
    expect(h.engine.sessionBusy("1")).toBe(false);
    expect(row(h.engine, "1").model?.change).toBeUndefined();
  });
});

describe("Model defaults for every PRD (AC-DEFAULT-02, AC-DEFAULT-03, AC-FALLBACK-01)", () => {
  it("sets a row, refuses what the commands refuse, switches the fallback, and restores Kiln's defaults keeping the switch", async () => {
    const h = await fixture([]);
    const read = await get("/api/model-defaults");
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ rows: { standard: { first: { agent: "Claude Code", familyName: "Opus", modelName: "Opus 5.5", effort: "medium", set: false }, fallback: { agent: "Codex", familyName: "GPT Sol", effort: "high", set: false } } }, fallback: { enabled: false, threshold: 95 } });
    expect((read.body.agents as { agentId: string; families: { family: string }[] }[]).find(agent => agent.agentId === "claude_code")!.families.map(one => one.family)).toEqual(["opus", "fable", "sonnet", "haiku"]);

    const set = await post("/api/model-defaults", { set: { row: "standard", first: { agentId: "claude_code", family: "sonnet", effort: "low" } } });
    expect(set).toMatchObject({ status: 200, body: { rows: { standard: { first: { familyName: "Sonnet", effort: "low", set: true } } } } });
    // It reaches every activity that hasn't started, on the next resolution.
    await waitFor(() => shown(row(h.engine, "3"))[0] === "Sonnet 5.5");
    expect(shown(row(h.engine, "3"))).toEqual(["Sonnet 5.5", "low", "model_defaults"]);

    expect(await post("/api/model-defaults", { set: { row: "standard", fallback: { agentId: "claude_code", family: "opus", effort: "high" } } })).toEqual({ status: 422, body: { ok: false, reason: "The Standard row's first choice and fallback would both be on Claude Code. To move the row to Claude Code, change both sides in one save." } });
    expect(await post("/api/model-defaults", { set: { row: "audits", first: { agentId: "claude_code", family: "opus" } } })).toEqual({ status: 422, body: { ok: false, reason: "Choose an effort for Opus 5.5; no supported default was reported." } });
    expect(await post("/api/model-defaults", { set: { row: "audits", first: { agentId: "claude_code", family: "gemini", effort: "high" } } })).toEqual({ status: 422, body: { ok: false, reason: "Claude Code doesn't offer Gemini on this account." } });
    expect(await post("/api/model-defaults", { fallback: { threshold: 0 } })).toEqual({ status: 422, body: { ok: false, reason: "The threshold is a whole-number percent from 1 to 100." } });
    expect(await post("/api/model-defaults", { fallback: { threshold: 90.5 } })).toEqual({ status: 422, body: { ok: false, reason: "The threshold is a whole-number percent from 1 to 100." } });
    expect(await post("/api/model-defaults", { set: { row: "tiny", first: { agentId: "claude_code", family: "opus", effort: "high" } } })).toEqual({ status: 400, body: { ok: false, reason: "row is demanding, standard, mechanical or audits." } });

    expect(await post("/api/model-defaults", { fallback: { enabled: true, threshold: 90 } })).toMatchObject({ status: 200, body: { fallback: { enabled: true, threshold: 90 } } });
    expect(buildSnapshot(h.engine).settings.models.fallback).toMatchObject({ enabled: true, threshold: 90 });
    expect(await post("/api/model-defaults", { fallback: { enabled: false } })).toMatchObject({ status: 200, body: { fallback: { enabled: false, threshold: 90 } } });
    expect(buildSnapshot(h.engine).settings.models.fallback).toMatchObject({ enabled: false, threshold: 90 });
    expect(await post("/api/model-defaults", { fallback: { enabled: true } })).toMatchObject({ status: 200, body: { fallback: { enabled: true, threshold: 90 } } });

    expect(await post("/api/model-defaults", { restore: true })).toMatchObject({ status: 200, body: { rows: { standard: { first: { familyName: "Opus", effort: "medium", set: false } } }, fallback: { enabled: true, threshold: 90 } } });
    expect(shown(row(h.engine, "3"))).toEqual(["Opus 5.5", "medium", "model_defaults"]);
  });

  it("answers 409 over a file that doesn't parse, refuses saves, and restores it with the fallback off", async () => {
    const h = await fixture([]);
    writeFileSync(modelDefaultsPath(h.env), "{ not json");
    expect(await get("/api/model-defaults")).toMatchObject({ status: 409, body: { reason: expect.stringContaining("isn't valid JSON"), canRestore: true } });
    expect(await post("/api/model-defaults", { fallback: { enabled: true } })).toMatchObject({ status: 409, body: { reason: expect.stringContaining("isn't valid JSON") } });
    expect(await post("/api/model-defaults", { restore: true })).toMatchObject({ status: 200, body: { notice: "Kiln's defaults are restored, and the fallback is now off.", fallback: { enabled: false, threshold: 95 } } });
    writeFileSync(modelDefaultsPath(h.env), JSON.stringify({ schemaVersion: 2 }));
    expect(await post("/api/model-defaults", { restore: true })).toMatchObject({ status: 409, body: { reason: expect.stringContaining("written by a newer Kiln; update Kiln"), canRestore: false } });
  });
});
