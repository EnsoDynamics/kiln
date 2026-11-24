// Kiln Pause Now AC-PAUSE-02: Pause now is withheld, with reasons naming it, for a running Codex
// phase and for final delivery, through the real engine and its authenticated HTTP route; and
// `kiln status` names Pause now in its incompatibility report.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { Engine } from "../engine/engine.js";
import { prdTreeAtHead } from "../engine/worktree-setup.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";
import { createHarness, landingSession, waitFor, type Harness } from "../test-support/engine-harness.js";

const darwin = it.skipIf(process.platform !== "darwin");
const UNAVAILABLE = "Pause now needs an active supported Claude phase or audit.";
let h: Harness | undefined; let work: ReturnType<typeof codexWorkFixture> | undefined;
let hosted: Awaited<ReturnType<typeof startFixtureController>> | undefined;
afterEach(async () => {
  hosted?.release(); await hosted?.server.close(); hosted = undefined;
  await h?.cleanup(); h = undefined; await work?.sandbox.cleanup(); work = undefined;
});

async function host(engine: Engine) {
  hosted = await startFixtureController({ engine, folderName: "customer-returns", featureName: "Returns", token: engine.record.token });
  return `http://127.0.0.1:${hosted.port}`;
}
async function post(origin: string, path: string, body: unknown) {
  const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h!.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
async function status(json: boolean) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), "status", join(h!.repository, h!.engine.record.prdDirectory), ...(json ? ["--json"] : [])], { cwd: h!.sandbox.root, env: h!.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", b => { output += String(b); });
  await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  return output;
}
/** A target shaped like the running session's, as a browser would send it. */
const forged = (key: string, sessionId: string) => ({ executionId: h!.engine.record.executionId, activityId: "forged", activityKey: key, sessionId, providerSessionId: sessionId, attemptId: "forged" });

/** Pause now is withheld for the running session: no target, no view, the control's reason, and the route refuses. */
async function expectWithheld(key: string) {
  const engine = h!.engine;
  // Kiln's own launch of the session is an instruction too, and until it is recorded as dispatched every live control gives "Kiln is checking, dispatching…" as its reason; the reason under test shows after that.
  await waitFor(() => !engine.commands.busy);
  expect(engine.liveTarget()).toBeUndefined();
  expect(engine.liveView()).toBeUndefined();
  expect(engine.controlView().controls.find(c => c.name === "take-over")).toMatchObject({ available: false, reason: UNAVAILABLE });
  const origin = await host(engine);
  const refused = await post(origin, "live/take-over", { instructionId: "withheld", target: forged(key, engine.latestSession(key)!.sessionId) });
  expect(refused.status, JSON.stringify(refused.body)).toBe(409);
  expect(engine.record.liveControl).toBeUndefined();
}

darwin("withholds Pause now from a running Codex phase (AC-PAUSE-02)", async () => {
  h = await createHarness({ sessions: [], claude: join("missing", "claude") });
  work = codexWorkFixture(); Object.assign(h.tools, { codex: work.options.executable }); work.configureEnvironment(h.env);
  work.set({ dynamicRecord: true, stateDirectory: h.stateDirectory, version: "0.167.0", delayMs: 4000 }); h.engine.close();
  const prdTree = await prdTreeAtHead({ git: h.tools.git, env: h.env }, h.repository, h.engine.paths.prdDirectoryFromRoot);
  h.engine = new Engine({ prdTree: prdTree!, paths: h.engine.paths, record: h.engine.record, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, originRetryMs: 0, sleepReader: { next: async () => [] } });
  expect(await h.engine.changeSettings({ agentId: "codex" })).toMatchObject({ ok: true }); await h.engine.agents.refresh();
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  const engine = h.engine as unknown as { current?: { processRunning?: boolean; session?: { agentId: string; kind: string } } };
  await waitFor(() => !!engine.current?.processRunning && engine.current.session?.agentId === "codex" && !h!.engine.commands?.busy, 15000);
  await expectWithheld("1");
  await h.engine.settled();
}, 60000);

darwin("withholds Pause now during final delivery (AC-PAUSE-02)", async () => {
  h = await createHarness({ sessions: [] });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "pr-ready"); const release = join(h.sandbox.root, "pr-release");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), { actions: [{ touch: ready }, { waitForFile: release }, { openPullRequest: { number: 218, isDraft: false } }, { result: "Opened #218." }, { exit: 0 }] }] }));
  await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => existsSync(ready), 30000);
  const engine = h.engine as unknown as { current?: { processRunning?: boolean; phaseKey: string; session?: { agentId: string; kind: string } } };
  expect(engine.current).toMatchObject({ processRunning: true, session: { agentId: "claude_code", kind: "pull_request" } });
  await expectWithheld(engine.current!.phaseKey);
  writeFileSync(release, "done"); await h.engine.settled();
}, 90000);

darwin("names Pause now in kiln status's incompatibility report (AC-PAUSE-02)", async () => {
  h = await createHarness({ sessions: [] });
  h.env.KILN_STANDIN_VERSION = "stand-in";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "ready"); const release = join(h.sandbox.root, "release");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { waitForFile: release }, { result: "Yielded." }] }] }));
  await h.engine.start({ refinementConfirmed: true });
  await waitFor(() => existsSync(ready));
  expect(h.engine.record.compatibility?.map(n => n.feature)).toContain("takeover");
  await host(h.engine);
  const reason = "Pause now unavailable with Claude Code unrecognised: its --version output is not a version Kiln recognises.";
  // The text report: the live control's reason and the take-over control's reason both name Pause now.
  const text = await status(false);
  expect(text.split("\n").filter(line => line.trim() === `reason: ${reason}`)).toHaveLength(2);
  expect(text).not.toMatch(/Pause & take over|Take over/);
  // The JSON report: the takeover notice is listed, and the reasons it reaches name Pause now.
  const json = JSON.parse(await status(true)) as { compatibility: { feature: string; agent_version: string }[]; live_control: { reason: string }; controls: { name: string; reason: string | null }[] };
  expect(json.compatibility).toContainEqual(expect.objectContaining({ feature: "takeover", agent_version: "unrecognised" }));
  expect(json.live_control.reason).toBe(reason);
  expect(json.controls.find(c => c.name === "take-over")?.reason).toBe(reason);
  writeFileSync(release, "done"); await h.engine.settled();
}, 60000);
