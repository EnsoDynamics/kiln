// Kiln After Delivery, Phase 4: Exit Kiln on a finished run (AC-EXIT-01, AC-EXIT-02, AC-BOT-01,
// AC-BOT-02) with real Git, a local bare origin, scripted provider sessions, the gh stand-in
// replaying GitHub's recorded answers and the control journal. No paid model calls. The run's own
// end (exit code 0, the last line, the lock) is proved through a real `kiln run` in
// src/kiln-run-exit.integration.test.ts. Run with `umask 022` on a machine whose umask is 0002.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { git } from "../test-support/git-repositories.js";
import { recordedPullRequest } from "../test-support/recorded-pull-requests.js";
import { ScriptedClaude, signedIn, usageRow } from "../test-support/scripted-claude.js";
import { buildSnapshot } from "./snapshot.js";
import { statusProjection } from "../control/projection.js";
import { readWork } from "../control/private-state.js";
import { stateRoot } from "../state/state-files.js";
import { MERGE_KEY } from "../state/activity-keys.js";
import type { Receipt } from "../control/commands.js";
import type { Engine, ExitNotice, StopReport } from "./engine.js";

let h: Harness | undefined;
let claude: ScriptedClaude | undefined;
let exits: ExitNotice[] = [];
let reports: StopReport[] = [];
afterEach(async () => { await h?.cleanup(); h = undefined; claude = undefined; exits = []; reports = []; });

const MARK_MERGED = fileURLToPath(new URL("../../test/stand-ins/gh-mark-merged.mjs", import.meta.url));
const KEY = "acme/acme-shop#218";
const stopping = (message: string): ScenarioSession => ({ actions: [{ result: message }, { exit: 0 }] });
const refused = (): ScenarioSession => ({ actions: [{ text: "Bringing develop into the branch." }, { refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3_600 } }, { exit: 1 }] });
const hanging = (): ScenarioSession => ({ actions: [{ touch: "merge-started" }, { work: "npm test" }] });
const merging = (): ScenarioSession => ({ actions: [{ bash: `git push -q origin HEAD:develop && node "${MARK_MERGED}" ${KEY} "$(git rev-parse HEAD)"` }, { result: "Merged #218." }, { exit: 0 }] });

/** A finished run with pull request #218 open; Exit Kiln's end is the stop path a real `kiln run` takes (SIGTERM's, with the exit's line). */
async function finished(after: ScenarioSession[]): Promise<Harness> {
  claude = new ScriptedClaude(() => new Date());
  claude.queue(...Array.from({ length: 40 }, () => signedIn([usageRow("session", 40)])));
  h = await createHarness({
    sessions: [landingSession("src/intake.txt"), landingSession("src/credit.txt"), landingSession("src/dashboard.txt"), pullRequestSession(218), ...after],
    engineOptions: { claude, onExit: (exit) => { exits.push(exit); void h!.engine.stop("sigterm").then(report => reports.push(report)); } },
  });
  h.useGithubOrigin();
  expect(await h.engine.start({ refinementConfirmed: true })).toEqual({ ok: true });
  await h.engine.settled();
  expect(h.engine.record.completedAt).toBeDefined();
  show("open");
  expect((await h.engine.checkCompletedPlan()).status).toBe("awaiting_merge");
  return h;
}
function atLimit(): void {
  (claude as unknown as { queued: unknown[] }).queued.length = 0;
  claude!.queue(...Array.from({ length: 40 }, () => signedIn([usageRow("session", 100, new Date(Date.now() + 3_600_000).toISOString())])));
}
const featureHead = () => git(h!.sandbox, h!.engine.worktreePath, "rev-parse", "HEAD").trim();
const show = (state: "open" | "merged", mergeCommit?: string) => h!.setPullRequestViews({ [KEY]: recordedPullRequest(state, { number: 218, base: "develop", url: "https://github.com/acme/acme-shop/pull/218", head: featureHead(), ...(mergeCommit ? { mergeCommit } : {}) }) });
let commands = 0;
async function control(action: string, inputs: Record<string, unknown> = {}, engine: Engine = h!.engine): Promise<Receipt> {
  const command_id = `exit-${++commands}`;
  const answer = engine.commands.submit({ command_id, execution_id: engine.record.executionId!, status_token: engine.controlView().token, action, inputs });
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  await engine.commands.settled(); await engine.settled();
  return engine.commands.lookup(command_id).operation as Receipt;
}
const exitControl = (engine: Engine = h!.engine) => engine.controlView().controls.find(one => one.name === "exit")!;
const status = () => statusProjection(readWork(stateRoot(h!.env), h!.stateDirectory), h!.engine) as unknown as { controls: { name: string; available: boolean; reason: string | null; invocation: string[] }[] };
const savedRecord = () => readFileSync(join(h!.stateDirectory, "prd.json"), "utf8");
const gitState = () => ["show-ref", "worktree list --porcelain", "status --porcelain"].map(args => git(h!.sandbox, h!.repository, ...args.split(" "))).join("\n") + git(h!.sandbox, h!.engine.worktreePath, "status", "--porcelain");
const RUNNING_REASON = "Exit Kiln returns once the session ends, or once Kiln has started it. Ctrl+C still stops everything, the session included.";

/** Presses Exit, and checks what AC-EXIT-02 promises: the receipt, the pages told, the run's end, nothing else written. */
async function pressExit(via: "browser" | "command_line" = "browser"): Promise<void> {
  const before = { record: savedRecord(), git: gitState(), gh: h!.ghCalls().length };
  const told: ExitNotice[] = []; h!.engine.onExited(exit => told.push(exit));
  const pressedAt = Date.now();
  expect(await control("exit", { via })).toMatchObject({ state: "completed", outcome: "exited" });
  expect(told).toEqual([{ at: expect.any(String), via, command: "kiln run docs/prds/customer-returns" }]);
  // The page's exit time is the press's own time, not a saved or made-up one.
  expect(Date.parse(told[0]!.at)).toBeGreaterThanOrEqual(pressedAt);
  expect(Date.parse(told[0]!.at)).toBeLessThanOrEqual(Date.now());
  await waitFor(() => reports.length > 0);
  expect(exits).toEqual(told);
  expect(reports[0]).toEqual({ text: `Kiln exited from ${via === "browser" ? "the page" : "the command line"}.`, grey: "Run kiln run docs/prds/customer-returns to open it again." });
  expect(savedRecord()).toBe(before.record);
  expect(gitState()).toBe(before.git);
  // No pull request is changed on GitHub: no gh call that writes to one after the press.
  expect(h!.ghCalls().slice(before.gh).filter(call => call[0] === "pr" && ["merge", "close", "edit", "ready", "comment", "reopen", "create"].includes(call[1]!))).toEqual([]);
  expect(h!.ghCalls().slice(before.gh).filter(call => call[0] === "api" && call.some(arg => /^(-X|--method)$/.test(arg)))).toEqual([]);
  expect(h!.engine.current?.processRunning ?? false).toBe(false);
}

describe("Exit Kiln on the finished page (AC-EXIT-01, AC-EXIT-02)", () => {
  it("is offered on the finished page and in kiln status, and ends Kiln, writing nothing but its receipt", async () => {
    await finished([]);
    expect(exitControl()).toMatchObject({ available: true, reason: null });
    expect(buildSnapshot(h!.engine).exit).toEqual({ available: true, command: "kiln run docs/prds/customer-returns" });
    expect(status().controls.find(one => one.name === "exit")).toMatchObject({ available: true, invocation: ["kiln", "exit", expect.any(String)] });
    await pressExit();
  });

  it("replays the same exit command once, with no second exit (AC-BOT-01 retry protection)", async () => {
    await finished([]);
    const told: ExitNotice[] = []; h!.engine.onExited(exit => told.push(exit));
    const submit = () => h!.engine.commands.submit({ command_id: "kiln-exit-retry", execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action: "exit", inputs: { via: "command_line" } });
    const token = h!.engine.controlView().token;
    expect(submit().ok).toBe(true);
    await h!.engine.commands.settled(); await h!.engine.settled();
    expect(h!.engine.commands.lookup("kiln-exit-retry").operation).toMatchObject({ state: "completed", outcome: "exited" });
    // The same command id again, as a retried `kiln exit` sends it: the saved receipt, no second exit.
    const again = h!.engine.commands.submit({ command_id: "kiln-exit-retry", execution_id: h!.engine.record.executionId!, status_token: token, action: "exit", inputs: { via: "command_line" } });
    expect(again.ok, JSON.stringify(again)).toBe(true);
    await h!.engine.commands.settled();
    expect(h!.engine.commands.lookup("kiln-exit-retry").operation).toMatchObject({ state: "completed", outcome: "exited" });
    await waitFor(() => reports.length > 0);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(told).toHaveLength(1);
    expect(exits).toHaveLength(1);
    expect(reports).toHaveLength(1);
  });

  it("is unavailable, saying why, while the merge session runs, and offered again at its Needs you stop", async () => {
    await finished([hanging()]);
    expect(h!.engine.commands.submit({ command_id: "merge-press", execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action: "merge", inputs: {} }).ok).toBe(true);
    await h!.engine.commands.settled();
    await waitFor(() => existsSync(join(h!.engine.worktreePath, "merge-started")));
    // Kiln's own session launch is an instruction too; a press made before it settles is refused as busy instead.
    await waitFor(() => !h!.engine.commands.busy);
    expect(exitControl()).toMatchObject({ available: false, reason: RUNNING_REASON });
    expect(buildSnapshot(h!.engine).exit).toMatchObject({ available: false, reason: RUNNING_REASON });
    // A press made anyway is refused, and nothing ends.
    const refused = h!.engine.commands.submit({ command_id: "exit-while-running", execution_id: h!.engine.record.executionId!, status_token: h!.engine.controlView().token, action: "exit", inputs: { via: "command_line" } });
    expect(refused.ok).toBe(false);
    expect(refused.errors[0]).toMatchObject({ message: RUNNING_REASON });
    expect(exits).toEqual([]);
  });

  it("is offered at a merge stop, on the Needs you page, and ends Kiln there", async () => {
    await finished([stopping("A required review is missing on #218.")]);
    await control("merge");
    expect(h!.engine.stoppedPhaseKey()).toBe(MERGE_KEY);
    expect(buildSnapshot(h!.engine)).toMatchObject({ feature: { state: "needs_you" }, exit: { available: true } });
    await pressExit("command_line");
  });

  it("is offered on the Waiting screen of a merge session's usage wait, and ends the wait", async () => {
    await finished([refused()]);
    atLimit();
    await control("merge");
    expect(h!.engine.waitingPhaseKey()).toBe(MERGE_KEY);
    expect(buildSnapshot(h!.engine)).toMatchObject({ feature: { state: "waiting" }, exit: { available: true } });
    await pressExit();
    // The next kiln run holds the session until Resume (AC-AUTO-03 as replaced by AC-EXIT-01).
    h!.engine = h!.reopenFromDisk();
    await h!.engine.refreshAgents();
    expect(await h!.engine.prepare()).toEqual({ ok: true });
    expect(await h!.engine.decide({ review: true })).toMatchObject({ phaseKey: MERGE_KEY });
    expect(buildSnapshot(h!.engine)).toMatchObject({ restartReview: { activityKey: MERGE_KEY }, exit: { available: true } });
  });

  it("is offered on the Merged page", async () => {
    await finished([merging()]);
    await control("merge");
    expect(h!.engine.record.afterDelivery!.merge!.closedAt).toBeDefined();
    // The check Kiln runs unasked once it confirms the merge (AC-WAIT-03) finishes first.
    await waitFor(() => h!.engine.record.completedPlanCheck?.status === "unchanged");
    expect(buildSnapshot(h!.engine)).toMatchObject({ feature: { state: "complete" }, exit: { available: true } });
    await pressExit();
  });

  it("is offered while Kiln reads GitHub and checks for new phases, and abandons that check, saving nothing", async () => {
    await finished([]);
    // GitHub's answer is held, so the check is still in flight when Kiln ends.
    writeFileSync(h!.ghStatePath, JSON.stringify({ ...JSON.parse(readFileSync(h!.ghStatePath, "utf8")) as object, viewDelayMs: 20_000 }));
    const views = () => h!.ghCalls().filter(call => call[0] === "pr" && call[1] === "view").length;
    const before = views();
    const check = h!.engine.checkCompletedPlan({ press: true }).catch(() => undefined);
    await waitFor(() => views() > before);
    expect(exitControl()).toMatchObject({ available: true });
    await pressExit();
    await check;
  });

  it("is never offered on a run still in progress", async () => {
    claude = new ScriptedClaude(() => new Date());
    claude.queue(...Array.from({ length: 10 }, () => signedIn([usageRow("session", 40)])));
    h = await createHarness({ sessions: [stopping("Waiting for a decision.")], engineOptions: { claude } });
    await h.engine.start({ refinementConfirmed: true }); await h.engine.settled();
    expect(exitControl()).toMatchObject({ available: false, reason: "Exit Kiln is offered once every phase is done. Ctrl+C stops Kiln now." });
    expect(buildSnapshot(h.engine).exit).toBeUndefined();
  });
});
