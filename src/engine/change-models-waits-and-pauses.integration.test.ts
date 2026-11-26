// Changing a phase that hasn't started while the run waits or is paused (Kiln Phase Model Tiers
// AC-PICK-03), through the engine and its loopback API against real Git with the stand-in claude:
// a Change applied during a real usage-limit wait, at an end-of-phase pause and under a Pause now
// hold shows on the phase's row and is what the phase later launches on; a change covers that
// phase of that PRD only; and a changed phase keeps its choice when its tier line changes later.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPrdRecord } from "../state/records.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { commitFiles, git } from "../test-support/git-repositories.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import { readGate } from "../live/gate.js";
import type { Engine, EngineOptions } from "./engine.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot, type PhaseView } from "./snapshot.js";

let harness: Harness | undefined;
let hosted: Awaited<ReturnType<typeof startFixtureController>> | undefined;
afterEach(async () => {
  hosted?.release(); await hosted?.server.close(); hosted = undefined;
  await harness?.cleanup(); harness = undefined;
});

const DIRECTORY = "docs/prds/customer-returns";
const HAIKU_LOW = { agentId: "claude_code", model: "haiku", effort: "low" };

/** The fixture documents with Phase 1 demanding and Phase 2b mechanical; Phase 3 is not rated, 2a closed. */
function tieredFiles(): Record<string, string> {
  const files = prdDirectoryFiles();
  const line = (name: string, text: string) => { files[name] = files[name]!.replace(/\n\n/, `\n\n${text}\n\n`); };
  line("phase-1-return-intake.md", "**Model tier:** demanding — AC-RET-02 moves money on retries.");
  line("phase-2b-store-credit.md", "**Model tier:** mechanical - repeats the card refund flow.");
  return files;
}

/** The engine on the tiered fixture with its plan read, as Documents found shows it, and its controller serving the API. */
async function fixture(sessions: ScenarioSession[], options: { engineOptions?: Partial<EngineOptions>; extraFolders?: string[] } = {}): Promise<Harness> {
  harness = await createHarness({ sessions, files: tieredFiles(), ...options });
  recordPlan(harness.engine, harness.repository, DIRECTORY);
  await harness.engine.refreshAgents();
  hosted = await startFixtureController({ engine: harness.engine, folderName: "customer-returns", featureName: "Customer returns", token: harness.engine.record.token });
  return harness;
}
function recordPlan(engine: Engine, repository: string, directory: string): void {
  const read = readPlanAt(repository, directory);
  if (!read.ok) throw new Error(read.problem);
  engine.record.plan = recordedPlan(read.plan);
  engine.modelChoicesChanged();
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const origin = `http://127.0.0.1:${hosted!.port}`;
  const response = await fetch(`${origin}${path}`, { method: "POST", headers: { "X-Kiln-Token": harness!.engine.record.token, "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const rows = (engine: Engine): PhaseView[] => { const snapshot = buildSnapshot(engine); return snapshot.activities ?? snapshot.documents?.plan?.phases as unknown as PhaseView[] ?? snapshot.phases; };
const row = (engine: Engine, id: string): PhaseView => rows(engine).find(one => one.id === id)!;
const shown = (view: PhaseView) => [view.model?.choice?.modelName, view.model?.choice?.effort, view.model?.from];
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];
/** Each new session's model and effort, in launch order (resumes left out). */
const launches = (h: Harness) => h.claudeCalls().filter(call => !call.args.includes("--resume")).map(call => [flag(call.args, "--model"), flag(call.args, "--effort")]);
const rest = (): ScenarioSession[] => [landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()];

/** Phase 1's session, held until `release` exists, then landing. */
function heldLanding(release: string): ScenarioSession {
  const session = landingSession("src/one.txt");
  session.actions.unshift({ waitForFile: release });
  return session;
}

describe("Change during a usage-limit wait (AC-PICK-03)", () => {
  it("changes a later phase while phase 1 waits for usage, and 2b launches on the change once the wait ends", async () => {
    const offset = 0;
    const now = () => new Date(Date.now() + offset);
    const claude = new ScriptedClaude(now);
    claude.queue(signedIn([usageRow("session", 40)]), signedIn([usageRow("session", 40)]));
    const reset = Math.floor(now().getTime() / 1000) + 3_600;
    const refused: ScenarioSession = { actions: [{ skill: "enso-method:implement-from-requirements" }, { text: "Building the intake form." }, { refuse: { rateLimitType: "five_hour", resetsAt: reset } }, { exit: 1 }] };
    const h = await fixture([refused, landingSession("src/one.txt"), ...rest()], { engineOptions: { claude, now } });

    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(buildSnapshot(h.engine).feature.state).toBe("waiting");
    expect(row(h.engine, "2b").model).toMatchObject({ state: "will_run_on", change: { available: true } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Sonnet 5.5", "high", "model_defaults"]);

    expect(await post("/api/model", { target: { phase: "2b" }, choice: HAIKU_LOW })).toMatchObject({ status: 200, body: { ok: true } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect(row(h.engine, "2b").model).toMatchObject({ change: { available: true }, useDefault: true });
    // The wait is still the wait: nothing launched.
    expect(h.engine.waitingPhaseKey()).toBe("1");
    expect(h.claudeCalls()).toHaveLength(1);

    // A reading with usage left ends the wait; phase 1 resumes and lands, and 2b launches on its change.
    claude.queue(...Array.from({ length: 12 }, () => signedIn([usageRow("session", 2)])));
    void claude.refreshAccount();
    await waitFor(() => h.engine.record.completedAt !== undefined, 30_000);
    await h.engine.settled();
    expect(h.engine.latestSession("1")!.runs[1]!.cause).toBe("limit_resume");
    expect(launches(h)).toEqual([["fable", "high"], ["haiku", "low"], ["opus", "medium"], ["opus", "high"]]);
    expect(row(h.engine, "2b").model).toMatchObject({ state: "ran_on", choice: { modelName: "Haiku 5.5", effort: "low" }, from: "changed" });
  }, 60_000);
});

describe("Change while paused (AC-PICK-03)", () => {
  it("changes the next phase at an end-of-phase pause, and Start launches it on the change", async () => {
    const h = await fixture([]);
    const release = join(h.sandbox.root, "release-phase-1");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [heldLanding(release), ...rest()] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    expect(h.engine.pause()).toEqual({ ok: true });
    writeFileSync(release, "");
    await h.engine.settled();
    expect(buildSnapshot(h.engine).feature.state).toBe("paused");
    expect(h.claudeCalls()).toHaveLength(1);

    expect(row(h.engine, "2b").model).toMatchObject({ state: "will_run_on", change: { available: true } });
    expect(row(h.engine, "1").model?.change).toBeUndefined();
    expect(await post("/api/model", { target: { phase: "2b" }, choice: HAIKU_LOW })).toMatchObject({ status: 200, body: { ok: true } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect(row(h.engine, "2b").model).toMatchObject({ change: { available: true }, useDefault: true });
    expect(buildSnapshot(h.engine).feature.state).toBe("paused");

    expect(await h.engine.start()).toEqual({ ok: true });
    await waitFor(() => h.engine.record.completedAt !== undefined, 30_000);
    await h.engine.settled();
    expect(launches(h)).toEqual([["fable", "high"], ["haiku", "low"], ["opus", "medium"], ["opus", "high"]]);
  }, 60_000);

  it.skipIf(process.platform !== "darwin")("changes a later phase under a Pause now hold, refuses the paused phase, and the later phase launches on the change after Resume", async () => {
    const h = await fixture([]);
    h.env.KILN_STANDIN_VERSION = "2.1.311";
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const done = join(h.sandbox.root, "release");
    const phase1: ScenarioSession = { actions: [{ text: "Running the intake tests." }, { runUntil: { command: "npm test -- src/intake", file: done } }, { bash: "echo after" }, { result: "" }] };
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [phase1, landingSession("src/one.txt"), ...rest()] }));
    await h.engine.start({ refinementConfirmed: true });
    const gate = () => readGate(h.engine.latestSession("1")!.runs.at(-1)!.live!.gateDirectory);
    await waitFor(() => !!h.engine.latestSession("1")?.runs.at(-1)?.live && Object.values(gate().operations).some(o => o.label?.input === "npm test -- src/intake"));
    const target = h.engine.liveTarget()!;
    const accepted = await post("/api/live/take-over", { instructionId: "pause-now", target });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(202);
    writeFileSync(done, "done");
    await h.engine.settled();
    await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.liveView()?.pauseNow?.phase === "paused"; }, 15_000);

    // Phase 1 has started and is held; 2b hasn't.
    expect(row(h.engine, "1").model?.change).toBeUndefined();
    expect((await post("/api/model", { target: { phase: "1" }, choice: HAIKU_LOW })).status).toBe(409);
    expect(row(h.engine, "2b").model).toMatchObject({ state: "will_run_on", change: { available: true } });
    expect(await post("/api/model", { target: { phase: "2b" }, choice: HAIKU_LOW })).toMatchObject({ status: 200, body: { ok: true } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect(row(h.engine, "2b").model).toMatchObject({ change: { available: true }, useDefault: true });
    expect(h.engine.liveView()?.pauseNow?.phase).toBe("paused");

    const recovery = buildSnapshot(h.engine).needsYou!.phaseRecovery!.target;
    const resumed = await post("/api/resume", { target: recovery });
    expect(resumed.body, JSON.stringify(resumed.body)).toMatchObject({ ok: true });
    await waitFor(() => h.engine.record.completedAt !== undefined, 30_000);
    await h.engine.settled();
    expect(launches(h)).toEqual([["fable", "high"], ["haiku", "low"], ["opus", "medium"], ["opus", "high"]]);
  }, 120_000);
});

describe("a change covers that phase of that PRD only (AC-PICK-03)", () => {
  it("leaves another PRD's same phase on its tier's choice, whether its engine was open at the change or opened after", async () => {
    const h = await fixture([], { extraFolders: ["gift-cards"] });
    // The other PRD's documents carry the same tier lines, so 2b is mechanical there too.
    const files = Object.fromEntries(Object.entries(tieredFiles()).map(([name, text]) => [name === "customer-returns-prd.md" ? "gift-cards-prd.md" : name, text]));
    commitFiles(h.sandbox, h.repository, "docs/prds/gift-cards", files);
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    const before = await h.engineFor("gift-cards");
    recordPlan(before, h.repository, "docs/prds/gift-cards");
    expect(shown(row(before, "2b"))).toEqual(["Sonnet 5.5", "high", "model_defaults"]);

    expect(await post("/api/model", { target: { phase: "2b" }, choice: HAIKU_LOW })).toMatchObject({ status: 200, body: { ok: true } });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect(readPrdRecord(h.stateDirectory)!.settings.modelChoices.phases["2b"]).toMatchObject(HAIKU_LOW);
    // The same PRD's other phases keep their own choices.
    expect(shown(row(h.engine, "1"))).toEqual(["Fable 5.1", "high", "model_defaults"]);
    expect(shown(row(h.engine, "3"))).toEqual(["Opus 5.5", "medium", "model_defaults"]);

    before.modelChoicesChanged();
    expect(shown(row(before, "2b"))).toEqual(["Sonnet 5.5", "high", "model_defaults"]);
    expect(row(before, "2b").model?.useDefault).toBeUndefined();
    expect(before.record.settings.modelChoices.phases).toEqual({});
    const after = await h.engineFor("gift-cards");
    recordPlan(after, h.repository, "docs/prds/gift-cards");
    expect(shown(row(after, "2b"))).toEqual(["Sonnet 5.5", "high", "model_defaults"]);
    expect(after.record.settings.modelChoices.phases).toEqual({});
    before.close(); after.close();
  });
});

describe("a changed phase keeps its choice when its tier line changes (AC-PICK-03)", () => {
  it("keeps 2b on its change after phase 1 rewrites 2b's tier line, while an unchanged phase follows its rewritten line", async () => {
    const h = await fixture([]);
    const release = join(h.sandbox.root, "release-phase-1");
    const files = tieredFiles();
    // Phase 1's session rates 2b demanding instead of mechanical, and rates phase 3 mechanical.
    const twoB = files["phase-2b-store-credit.md"]!.replace("**Model tier:** mechanical - repeats the card refund flow.", "**Model tier:** demanding — store credit moves money.");
    const three = files["phase-3-returns-dashboard.md"]!.replace(/\n\n/, "\n\n**Model tier:** mechanical - one read-only screen.\n\n");
    const first = heldLanding(release);
    first.actions.splice(first.actions.findIndex(action => "commit" in action), 0, { write: { path: `${DIRECTORY}/phase-2b-store-credit.md`, content: twoB } }, { write: { path: `${DIRECTORY}/phase-3-returns-dashboard.md`, content: three } });
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [first, ...rest()] }));

    expect(await post("/api/model", { target: { phase: "2b" }, choice: HAIKU_LOW })).toMatchObject({ status: 200, body: { ok: true } });
    expect(row(h.engine, "2b").tier).toEqual({ value: "mechanical", reason: "repeats the card refund flow." });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);

    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    // Pause after phase 1, to read the rows as Kiln re-read the plan.
    expect(h.engine.pause()).toEqual({ ok: true });
    writeFileSync(release, "");
    await h.engine.settled();
    expect(buildSnapshot(h.engine).feature.state).toBe("paused");
    expect(row(h.engine, "2b").tier).toEqual({ value: "demanding", reason: "store credit moves money." });
    expect(shown(row(h.engine, "2b"))).toEqual(["Haiku 5.5", "low", "changed"]);
    expect(row(h.engine, "2b").model).toMatchObject({ state: "will_run_on", change: { available: true }, useDefault: true });
    // The unchanged phase 3 follows its line as re-read: mechanical's choice.
    expect(row(h.engine, "3").tier).toEqual({ value: "mechanical", reason: "one read-only screen." });
    expect(shown(row(h.engine, "3"))).toEqual(["Sonnet 5.5", "high", "model_defaults"]);

    expect(await h.engine.start()).toEqual({ ok: true });
    await waitFor(() => h.engine.record.completedAt !== undefined, 30_000);
    await h.engine.settled();
    // 1 demanding; 2b on its change, not demanding's Fable; 3 on mechanical's Sonnet; the pull request on Audits'.
    expect(launches(h)).toEqual([["fable", "high"], ["haiku", "low"], ["sonnet", "high"], ["opus", "high"]]);
    expect(row(h.engine, "2b").model).toMatchObject({ state: "ran_on", choice: { modelName: "Haiku 5.5", effort: "low" }, from: "changed" });
  }, 60_000);
});
