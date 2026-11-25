// An activity that hasn't started goes on in a new session (Kiln Phase Model Tiers AC-PICK-07),
// through the engine against real Git with the stand-in claude: a bot's `kiln reply` and
// `kiln resume`, submitted through the command journal as the CLI submits them, and Resume from a
// Pause now hold on a session that never got a response, each launch a new session on the
// activity's current choice and give it any reply, never reopening the refused conversation.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Receipt } from "../control/commands.js";
import { createHarness, landingSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { writeModelDefaults } from "../test-support/model-choices.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";
import { buildSnapshot } from "./snapshot.js";

let harness: Harness | undefined;
let hosted: Awaited<ReturnType<typeof startFixtureController>> | undefined;
afterEach(async () => { hosted?.release(); await hosted?.server.close(); hosted = undefined; await harness?.cleanup(); harness = undefined; });

const DIRECTORY = "docs/prds/customer-returns";
const flag = (args: string[], name: string) => args[args.indexOf(name) + 1];
/** A phase session refused by a usage limit before any model response. */
const refusedAtOnce: ScenarioSession = { actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] };
/** The choice the refused session didn't run on: the Standard row (phase 1 isn't rated) moved to Sonnet at low effort. */
const SONNET_LOW = { standard: { first: { agentId: "claude_code" as const, family: "sonnet", effort: "low" } } };

/**
 * Phase 1's second launch is a new session on Sonnet · low, not the earlier session reopened:
 * no `--resume`, its own session id, and a second session record on that choice. Returns the call.
 */
function expectNewSessionOnSonnet(h: Harness, earlierId: string) {
  const call = h.claudeCalls()[1]!;
  expect(call.args).not.toContain("--resume");
  expect([flag(call.args, "--model"), flag(call.args, "--effort")]).toEqual(["sonnet", "low"]);
  const sessions = h.engine.phaseSessions("1");
  expect(sessions.map(one => one.sessionId)).toEqual([earlierId, flag(call.args, "--session-id")]);
  expect(sessions[1]).toMatchObject({ model: "sonnet", effort: "low" });
  return call;
}

async function fixture(sessions: ScenarioSession[]): Promise<Harness> {
  harness = await createHarness({ sessions });
  const read = readPlanAt(harness.repository, DIRECTORY);
  if (!read.ok) throw new Error(read.problem);
  harness.engine.record.plan = recordedPlan(read.plan);
  harness.engine.modelChoicesChanged();
  await harness.engine.refreshAgents();
  return harness;
}

describe("a bot's reply and resume on an activity that hasn't started (AC-PICK-07)", () => {
  /** Phase 1 refused before any response, stopped at Needs you, then its choice moved to Sonnet · low. */
  async function refusedThenMoved() {
    const h = await fixture([refusedAtOnce, landingSession("src/one.txt")]);
    await h.engine.changeSettings({ resumeAfterUsageLimit: false });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("1");
    const refused = h.engine.latestSession("1")!;
    expect(refused.firstResponseAt).toBeUndefined();
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    const first = h.claudeCalls()[0]!;
    // The refused launch didn't run on the choice the activity is moved to.
    expect([flag(first.args, "--model"), flag(first.args, "--effort")]).not.toEqual(["sonnet", "low"]);
    writeModelDefaults(h.env, SONNET_LOW);
    h.engine.modelChoicesChanged();
    return { h, refused };
  }

  async function submit(h: Harness, id: string, action: "reply" | "resume", inputs: Record<string, unknown>): Promise<Receipt> {
    const view = h.engine.controlView();
    const answer = h.engine.commands.submit({ command_id: id, execution_id: h.engine.record.executionId!, status_token: view.token, action, inputs }, "caller", true);
    expect(answer.ok, JSON.stringify(answer.errors)).toBe(true);
    await h.engine.commands.settled();
    await h.engine.settled();
    return h.engine.commands.lookup(id).operation as Receipt;
  }

  it("`kiln reply` launches a new session on the current choice and gives it the reply", async () => {
    const { h, refused } = await refusedThenMoved();
    const receipt = await submit(h, "bot-reply", "reply", { message: "The import is merged now." });
    expect({ state: receipt.state, outcome: receipt.outcome, reason: receipt.reason }).toEqual({ state: "completed", outcome: "session_resumed", reason: null });
    expect(receipt.effects.reply).toMatch(/^(submitted|delivered)$/);
    const call = expectNewSessionOnSonnet(h, refused.sessionId);
    expect(call.prompt).toContain("The import is merged now.");
    expect(h.engine.isPhaseDone("1")).toBe(true);
  });

  it("`kiln resume` launches a new session on the current choice", async () => {
    const { h, refused } = await refusedThenMoved();
    const receipt = await submit(h, "bot-resume", "resume", {});
    expect({ state: receipt.state, outcome: receipt.outcome, reason: receipt.reason }).toEqual({ state: "completed", outcome: "session_resumed", reason: null });
    expectNewSessionOnSonnet(h, refused.sessionId);
    expect(h.engine.isPhaseDone("1")).toBe(true);
  });
});

const darwin = it.skipIf(process.platform !== "darwin");

describe("Resume from a Pause now hold on a session that never got a response (AC-PICK-07)", () => {
  darwin("launches a new session on the current choice and gives it the note", async () => {
    // The live session runs a Kiln checkpoint hook but sends no model response before it is paused and exits.
    const h = await fixture([]);
    h.env.KILN_STANDIN_VERSION = "2.1.311";
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "ready"); const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { waitForFile: release }, { exitNow: 0 }] }, landingSession("src/one.txt")] }));
    await h.engine.start({ refinementConfirmed: true });
    hosted = await startFixtureController({ engine: h.engine, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
    const origin = `http://127.0.0.1:${hosted.port}`;
    const post = async (path: string, body: unknown) => {
      const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    await waitFor(() => existsSync(ready));
    await waitFor(() => !!h.engine.liveView()?.available);
    const pressed = await post("live/take-over", { instructionId: "pause-before-response", target: h.engine.liveTarget()! });
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(202);
    writeFileSync(release, "done");
    await h.engine.settled();
    await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.liveView()?.pauseNow?.phase === "paused"; }, 15_000);
    const paused = h.engine.latestSession("1")!;
    expect(paused.firstResponseAt).toBeUndefined();
    expect(h.engine.startedSessionOf("1")).toBeUndefined();
    const first = h.claudeCalls()[0]!;
    expect([flag(first.args, "--model"), flag(first.args, "--effort")]).not.toEqual(["sonnet", "low"]);
    // The activity's choice moves while it is paused; Resume launches on the new one.
    writeModelDefaults(h.env, SONNET_LOW);
    h.engine.modelChoicesChanged();
    expect(buildSnapshot(h.engine).needsYou?.newSession).toBe(true);
    const resumed = await post("resume", { target: buildSnapshot(h.engine).needsYou!.phaseRecovery!.target, note: "Carry on with the intake form." });
    expect(resumed.body, JSON.stringify(resumed.body)).toMatchObject({ ok: true, outcome: "resume_requested" });
    await waitFor(() => h.engine.isPhaseDone("1"), 30_000); await h.engine.settled();
    const call = expectNewSessionOnSonnet(h, paused.sessionId);
    expect(call.prompt).toContain("Carry on with the intake form.");
    expect(h.engine.record.liveControl).toBeUndefined();
  }, 120_000);
});
