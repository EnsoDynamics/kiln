// A requirements stage held by Pause now (Kiln Requirements Stages AC-STAGE-04): Resume and carry
// on judge the stage as Check again does, so a stage the person finished and committed in their
// terminal moves on, and work left resumes the held session. Real engine, journal, checkpoint hook,
// gate and HTTP routes, with the scripted Claude stand-in running the hooks Kiln registers.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildSnapshot } from "../engine/snapshot.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { PRD } from "../test-support/fixture-documents.js";
import { git } from "../test-support/git-repositories.js";
import { boundPort } from "../test-support/os-ports.js";
import { startLocalServer, type LocalServer } from "../server/local-server.js";

const darwin = it.skipIf(process.platform !== "darwin");
let h: Harness; let server: LocalServer | undefined; let origin: string;
afterEach(async () => { await server?.close(); server = undefined; await h?.cleanup(); });

const folder = "count-boxes";
const prd = `docs/prds/${folder}/${folder}-prd.md`;

async function post(path: string, body: unknown) {
  const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

/** Starts a requirements run whose first stage session waits on `release`, and pauses it with Pause now. */
async function pausedStage(sessions: Record<string, unknown>[]) {
  h = await createHarness({ sourceBrief: "# Count boxes\n", folder, sessions: [] });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  const ready = join(h.sandbox.root, "ready"); const release = join(h.sandbox.root, "release");
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ touch: ready }, { waitForFile: release }, { result: "Paused mid-stage." }] }, ...sessions] }));
  expect(await h.engine.start()).toMatchObject({ ok: true });
  await waitFor(() => existsSync(ready), 20_000);
  server = await startLocalServer({ engine: h.engine, port: 0, folderName: folder, featureName: folder, token: h.engine.record.token });
  origin = `http://127.0.0.1:${boundPort(server.address)}`;
  await waitFor(() => !!h.engine.liveView()?.available, 20_000);
  const target = h.engine.liveTarget()!;
  expect(target.activityKey).toMatch(/^req-/);
  expect((await post("live/take-over", { instructionId: "pause-stage", target })).status).toBe(202);
  writeFileSync(release, "done");
  await h.engine.settled();
  await waitFor(async () => { await h.engine.reconcileTakeover(); return h.engine.record.liveControl?.takeover.state === "released"; }, 15_000);
  return target.activityKey;
}

darwin("moves on when the person finished and committed a held stage in their terminal, never judging it by phase documents", async () => {
  const key = await pausedStage([{ actions: [{ result: "Not finished." }, { exit: 0 }] }]);
  const recovery = buildSnapshot(h.engine).needsYou!.phaseRecovery!.target;
  // The person writes and commits the draft in their own session.
  mkdirSync(join(h.engine.worktreePath, `docs/prds/${folder}`), { recursive: true });
  writeFileSync(join(h.engine.worktreePath, prd), PRD);
  git(h.sandbox, h.engine.worktreePath, "add", prd);
  git(h.sandbox, h.engine.worktreePath, "commit", "-qm", "draft by hand");
  expect((await post("resume", { target: recovery, note: "Count crates as well." })).body).toMatchObject({ outcome: "advanced" });
  expect(h.engine.record.liveControl).toBeUndefined();
  expect(h.engine.record.phases[key]?.doneAt).toBeDefined();
  // The reply becomes feedback, and the next session finds where the PRD stands.
  expect(h.engine.record.requirements!.feedback.map(message => message.text)).toEqual(["Count crates as well."]);
  await h.engine.settled();
  expect(h.claudeCalls().length).toBeGreaterThan(1);
  expect(h.claudeCalls()[1]!.args).not.toContain("--resume");
}, 120_000);

darwin("resumes the held stage's own session when work is left", async () => {
  const key = await pausedStage([{ actions: [{ result: "Continued the stage." }] }]);
  const recovery = buildSnapshot(h.engine).needsYou!.phaseRecovery!.target;
  writeFileSync(join(h.engine.worktreePath, "notes.md"), "Notes.\n");
  expect((await post("resume", { target: recovery })).body).toMatchObject({ outcome: "resume_requested" });
  await h.engine.settled();
  expect(h.engine.record.liveControl).toBeUndefined();
  expect(h.claudeCalls()).toHaveLength(2);
  expect(h.claudeCalls()[1]!.args).toContain(h.engine.latestSession(key)!.sessionId);
}, 120_000);
