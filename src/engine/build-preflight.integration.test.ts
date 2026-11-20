// The build preflight through whole runs of the engine (Kiln Build Preflight PRD, Phase 1), against
// real Git with the stand-in claude and gh: when it runs, how its report's first line is read, its
// stop, Check Preflight again, Mark complete, the refused controls, its row and terminal lines.

import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { git } from "../test-support/git-repositories.js";
import { prdDirectoryFiles } from "../test-support/fixture-documents.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { resolveSkill } from "../audit/workflow.js";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, installPreflightSkill, landingSession, pullRequestSession, waitFor, type Harness, type ScenarioSession } from "../test-support/engine-harness.js";
import { formatTerminalEvent } from "../kiln-command.js";
import { readPrdRecord, SCHEMA_VERSION } from "../state/records.js";
import { isPreflightKey } from "../state/activity-keys.js";
import { PREFLIGHT_PAUSE_REASON, PREFLIGHT_STOP_REASON, preflightSettled } from "./preflight.js";
import { buildSnapshot, documentsFound } from "./snapshot.js";
import { Engine } from "./engine.js";
import { createCometContinuation } from "../test-support/comet-continuation-fixture.js";
import { readPlanAt, recordedPlan } from "./plan-reading.js";

const plain = { green: (s: string) => s, amber: (s: string) => s, red: (s: string) => s, grey: (s: string) => s, bold: (s: string) => s } as unknown as Parameters<typeof formatTerminalEvent>[2];
let harness: Harness | undefined;
afterEach(async () => { await harness?.cleanup(); harness = undefined; });

const ready: ScenarioSession = { actions: [{ skill: "enso-method:build-preflight" }, { result: "Preflight: ready\n\n4 phases. The build runs to the end without stopping." }, { exit: 0 }] };
const ITEMS_REPORT = "Preflight: 2 items need you\n\n1. The cloud sign-in expires in 8 hours. Run `aws sso login --profile app-dev`.\n2. Phase 3 needs the vendor's API key,\n   which the account owner provides.\n\n**The build will stop** at phase 3, which needs you at the console.";
const items: ScenarioSession = { actions: [{ skill: "enso-method:build-preflight" }, { result: ITEMS_REPORT }, { exit: 0 }] };
const noReport: ScenarioSession = { actions: [{ result: "I ran out of time before writing the report." }, { exit: 0 }] };
// The fixture plan's open leaves are 1, 2b and 3 (2a is closed), then final delivery.
const allPhases = [landingSession("src/one.txt"), landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()];

let commandCount = 0;
/** Submits one journal instruction as a caller does, against the current status token, and waits for it to settle. */
async function submit(engine: Engine, action: string, inputs: Record<string, unknown> = {}) {
  const id = `preflight-${++commandCount}`;
  engine.commands.submit({ command_id: id, execution_id: engine.record.executionId, status_token: engine.controlView().token, action, inputs }, "caller", true);
  await engine.commands.settled();
  return engine.commands.all().find(r => r.command_id === id)!;
}

async function fixture(preflightSessions: ScenarioSession[], sessions: ScenarioSession[] = allPhases, preflight = true) {
  harness ??= await createHarness({ sessions, preflight });
  writeFileSync(harness.scenarioPath, JSON.stringify({ sessions, preflightSessions }));
  // `kiln run` passes Start the plan Documents found showed, which Start saves; the harness's engine has none.
  const read = readPlanAt(harness.repository, "docs/prds/customer-returns");
  if (read.ok) harness.engine.record.plan = recordedPlan(read.plan);
  return harness;
}
const prompts = (h: Harness) => h.claudeCalls().map(call => String((call as { prompt: string }).prompt));
const isPreflightPrompt = (prompt: string) => prompt.startsWith("Run the Enso Method's build preflight");
const preflightRows = (engine: Engine) => (buildSnapshot(engine).activities ?? []).filter(row => row.kind === "preflight");
const terminal = (h: Harness) => h.events.map(event => formatTerminalEvent(event, h.engine.record, plain));

describe("the preflight comes before anything else the run does (AC-PREFLIGHT-01, AC-PREFLIGHT-02, AC-PREFLIGHT-08)", () => {
  it("runs first after Start, goes straight on when ready, and its row says what it found", async () => {
    const h = await fixture([ready]);
    expect(buildSnapshot(h.engine).preflight).toEqual({ planned: { before: "end" } });
    expect(await h.engine.start({ refinementConfirmed: true })).toMatchObject({ ok: true });
    await h.engine.settled();
    const all = prompts(h);
    expect(isPreflightPrompt(all[0]!)).toBe(true);
    expect(all.slice(1).some(isPreflightPrompt)).toBe(false);
    expect(all[1]).toContain("phase-1-return-intake.md");
    expect(h.engine.record.completedAt).toBeDefined();
    // No stop was ever recorded for it, and its row shows Ready with its Found line.
    expect(h.events.filter(event => event.kind === "audit" && event.event === "stopped")).toEqual([]);
    const [row] = preflightRows(h.engine);
    expect(row).toMatchObject({ kind: "preflight", title: "Preflight", file: "", state: "done", preflight: { outcome: "ready", found: "Nothing to settle" } });
    expect(row!.details?.sessionId).toBeDefined();
    // Directly above the activity it came before: Phase 1 on a new branch.
    const ids = buildSnapshot(h.engine).activities!.map(one => one.id);
    expect(ids[ids.indexOf("1") - 1]).toBe(row!.id);
    expect(preflightSettled(h.engine.record)).toBe(true);
    // The preflight never counts in "N of M done".
    expect(buildSnapshot(h.engine).feature.phasesTotal).toBe(4);
    expect(terminal(h).find(line => line.includes("PF") && line.includes("Preflight") && line.includes("started"))).toBeDefined();
    expect(terminal(h).find(line => /PF\s+Preflight\s+complete · Ready/.test(line))).toBeDefined();
    // The prompt changes nothing in the worktrees and gives no pinned CLI or report path.
    expect(all[0]).toContain("Change, stage, commit and push nothing");
    expect(all[0]).not.toContain("Pinned CLI");
  });

  it("a run whose agent has no build-preflight skill starts as it does today, with no Preflight row (AC-PREFLIGHT-05)", async () => {
    const h = await fixture([], allPhases, false);
    expect(buildSnapshot(h.engine).preflight).toBeUndefined();
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(prompts(h).some(isPreflightPrompt)).toBe(false);
    expect(prompts(h)[0]).toContain("phase-1-return-intake.md");
    expect(preflightRows(h.engine)).toEqual([]);
    expect(h.engine.record.preflight?.activities ?? []).toEqual([]);
  });

  it("refuses a pause while the preflight runs, and offers it no live control", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const releasePath = join(harness.sandbox.root, "preflight-release");
    const h = await fixture([{ actions: [{ waitForFile: releasePath }, ...ready.actions] }]);
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => h.engine.current?.processRunning === true && isPreflightKey(h.engine.current.phaseKey));
    expect(h.engine.pause()).toMatchObject({ ok: false, reason: PREFLIGHT_PAUSE_REASON });
    expect(h.engine.controlView().controls.find(one => one.name === "request-pause")).toMatchObject({ available: false, reason: PREFLIGHT_PAUSE_REASON });
    expect(h.engine.liveView()).toBeUndefined();
    // By command too, Message Claude and Pause & take over are refused, saying why, once no instruction is in flight (AC-PREFLIGHT-08).
    await waitFor(() => !h.engine.commands.busy);
    for (const name of ["message", "take-over"]) expect(h.engine.controlView().controls.find(one => one.name === name)).toMatchObject({ available: false, reason: expect.stringMatching(/^Live messages, terminal takeover and a pause are unavailable during the preflight\./) });
    expect(h.engine.resetControl().reason).not.toMatch(/Pause after the current/);
    expect(buildSnapshot(h.engine).feature.currentPhaseId).toMatch(/^preflight-/);
    writeFileSync(releasePath, "");
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("a Start that ends a pause runs another preflight, though one already reported ready", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "phase-one-release");
    const sessions = [{ actions: [{ waitForFile: release }, ...landingSession("src/one.txt").actions] }, ...allPhases.slice(1)];
    const h = await fixture([ready, ready], sessions);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 2);
    expect(h.engine.pause()).toMatchObject({ ok: true });
    writeFileSync(release, "");
    await waitFor(() => h.engine.record.pause.activeSince !== undefined);
    await h.engine.settled();
    expect(buildSnapshot(h.engine).preflight).toEqual({ planned: { before: "2b" } });
    expect(await h.engine.start()).toMatchObject({ ok: true });
    await h.engine.settled();
    const all = prompts(h);
    expect(all.map(isPreflightPrompt)).toEqual([true, false, true, false, false, false]);
    expect(h.engine.record.preflight!.activities.map(one => one.trigger)).toEqual(["start", "unpause"]);
    expect(h.engine.record.completedAt).toBeDefined();
  });
});

describe("items stop the run at Needs you (AC-PREFLIGHT-03)", () => {
  it("stops before anything else, shows the headline and items, refuses every other control, and Mark complete goes on with the items as the waiver", async () => {
    const h = await fixture([items]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.claudeCalls()).toHaveLength(1);
    const key = h.engine.preflightStopKey()!;
    expect(key).toMatch(/^preflight-/);
    const snapshot = buildSnapshot(h.engine);
    expect(snapshot.feature.state).toBe("needs_you");
    expect(snapshot.needsYou).toMatchObject({
      kind: "preflight", resumeOffered: false,
      preflight: {
        headline: "Preflight: 2 items need you",
        items: ["The cloud sign-in expires in 8 hours. Run `aws sso login --profile app-dev`.", "Phase 3 needs the vendor's API key, which the account owner provides."],
        nextActivity: { kind: "phase", key: "1" },
        // Phase 2a is closed in the fixture plan, so the line does not open with "Nothing has been built."
        line: "Settle these and check again, and Kiln starts Phase 1.",
      },
      markComplete: { offered: true, label: "Mark complete", heading: "", sentence: ["Check Preflight again runs a fresh preflight. Mark complete starts Phase 1 with the items as they are, and the Preflight row shows it was marked complete."] },
    });
    expect(snapshot.needsYou!.carryOn).toBeUndefined();
    expect(snapshot.needsYou!.startAgain).toBeUndefined();
    expect(snapshot.needsYou!.freshSessionPrompt.startsWith("Run the Enso Method's build preflight")).toBe(true);
    expect(JSON.stringify(snapshot.needsYou!.preflight)).not.toContain("The build will stop");
    // Only Check Preflight again and Mark complete; the others are refused with the reason naming them.
    for (const name of ["reply", "resume", "carry-on", "start-again", "verify-and-advance"]) expect(h.engine.controlView().controls.find(one => one.name === name)).toMatchObject({ available: false, reason: PREFLIGHT_STOP_REASON });
    expect(await submit(h.engine, "reply", { message: "It is fine." })).toMatchObject({ state: "refused", reason: PREFLIGHT_STOP_REASON });
    expect(await h.engine.resume({})).toMatchObject({ ok: false, reason: PREFLIGHT_STOP_REASON });
    expect(await h.engine.startAgain()).toMatchObject({ ok: false, reason: PREFLIGHT_STOP_REASON });
    expect(h.claudeCalls()).toHaveLength(1);
    // A stale page is refused.
    const offer = h.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    expect(await submit(h.engine, "waive-and-advance", { check_run_id: "00000000-0000-4000-8000-000000000000", via: "browser" })).toMatchObject({ state: "refused", outcome: "stale_check_run" });
    const receipt = await submit(h.engine, "waive-and-advance", { check_run_id: offer.checkRunId, via: "command_line", by: "ops-bot" });
    expect(receipt).toMatchObject({ state: "completed", outcome: "marked_complete" });
    const waiver = h.engine.record.waivers!.find(one => one.waiverId === receipt.waiver_id)!;
    expect(waiver).toMatchObject({ activityKey: key, activityKind: "preflight", effect: "completed", source: { via: "command_line", by: "ops-bot" } });
    expect(waiver.items.map(item => [item.check, item.kind, item.text, item.against])).toEqual([
      ["Preflight", "other", "The cloud sign-in expires in 8 hours. Run `aws sso login --profile app-dev`.", ""],
      ["Preflight", "other", "Phase 3 needs the vendor's API key, which the account owner provides.", ""],
    ]);
    expect(h.engine.record.phases[key]!.waiverId).toBe(waiver.waiverId);
    expect(preflightSettled(h.engine.record)).toBe(true);
    await h.engine.settled();
    // Mark complete launched nothing itself; the run went on to Phase 1, then to the end.
    expect(prompts(h).filter(isPreflightPrompt)).toHaveLength(1);
    expect(prompts(h)[1]).toContain("phase-1-return-intake.md");
    expect(preflightRows(h.engine)[0]).toMatchObject({ state: "done", waivedChecks: 1, preflight: { outcome: "items" } });
    expect(readPrdRecord(h.stateDirectory)!.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("Check Preflight again starts a fresh session under the same activity and reads its report as it read the first", async () => {
    const h = await fixture([items, ready]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const key = h.engine.preflightStopKey()!;
    const receipt = await submit(h.engine, "check-again");
    expect(receipt).toMatchObject({ state: "completed", outcome: "session_started", starts_session: true, effects: { session: "started" } });
    await h.engine.settled();
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    expect(h.engine.record.phases[key]!.sessionIds).toHaveLength(2);
    expect(h.engine.record.preflight!.activities[0]!.result).toMatchObject({ outcome: "ready" });
    expect(preflightRows(h.engine)).toHaveLength(1);
    expect(prompts(h).map(isPreflightPrompt).slice(0, 3)).toEqual([true, true, false]);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("a Check Preflight again whose skill no longer resolves ends the preflight as No report with the resolution message", async () => {
    const h = await fixture([items]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const key = h.engine.preflightStopKey()!;
    // Both names listed is unresolvable, never absent.
    const both = join(h.sandbox.root, "claude-config", "skills", "enso-method:build-preflight");
    mkdirSync(both, { recursive: true });
    writeFileSync(join(both, "SKILL.md"), "---\nname: enso-method:build-preflight\n---\n");
    const receipt = await submit(h.engine, "check-again");
    // No session started, so the receipt says so and never claims the next activity's launch.
    expect(receipt).toMatchObject({ state: "failed", outcome: "dispatch_not_started", effects: { session: "not_started" } });
    expect(receipt.phase_key).toBeUndefined();
    await h.engine.settled();
    expect(h.engine.record.preflight!.activities[0]!.result).toMatchObject({ outcome: "no_report", reason: expect.stringContaining("build-preflight") });
    expect(h.engine.record.phases[key]!.sessionIds).toHaveLength(1);
    expect(h.engine.record.completedAt).toBeDefined();
  });
});

describe("a preflight with no report does not hold up the run (AC-PREFLIGHT-06)", () => {
  it("goes on with a No report row that says the session ended without a report", async () => {
    const h = await fixture([noReport]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.completedAt).toBeDefined();
    expect(preflightRows(h.engine)[0]).toMatchObject({ state: "done", preflight: { outcome: "no_report", found: "Ended without a report" } });
    expect(preflightRows(h.engine)[0]!.preflight!.reason).toBeUndefined();
    expect(preflightSettled(h.engine.record)).toBe(false);
    expect(terminal(h).find(line => /PF\s+Preflight\s+complete · No report/.test(line))).toBeDefined();
  });

  it("a preflight that cannot be resolved launches nothing and shows why, with no session to open", async () => {
    const h = await fixture([]);
    installPreflightSkill(h.sandbox.root);
    const both = join(h.sandbox.root, "claude-config", "skills", "enso-method:build-preflight");
    mkdirSync(both, { recursive: true });
    writeFileSync(join(both, "SKILL.md"), "---\nname: enso-method:build-preflight\n---\n");
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(prompts(h).some(isPreflightPrompt)).toBe(false);
    const [row] = preflightRows(h.engine);
    expect(row).toMatchObject({ state: "done", preflight: { outcome: "no_report", found: "Ended without a report", reason: expect.stringContaining("build-preflight") } });
    expect(row!.details).toBeUndefined();
    const line = terminal(h).find(one => one.includes("No report"))!;
    expect(line.split("\n")[1]).toContain("build-preflight");
    expect(h.engine.record.completedAt).toBeDefined();
  });
});

describe("Resume runs a preflight only while none has settled (AC-PREFLIGHT-01, resume)", () => {
  async function interruptedRun(preflightSessions: ScenarioSession[]) {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "phase-one-release");
    const sessions = [{ actions: [{ waitForFile: release }, ...landingSession("src/one.txt").actions] }, { actions: landingSession("src/one.txt").actions }, ...allPhases.slice(1)];
    const h = await fixture(preflightSessions, sessions);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 2 && h.engine.current?.processRunning === true && h.engine.current.phaseKey === "1");
    await h.engine.stop("sigterm");
    writeFileSync(release, "");
    h.reopenFromDisk(); await h.engine.agents.refresh();
    await h.engine.decide({ review: true });
    return h;
  }

  it("an interrupted phase a preflight ran ahead of is still resumed, not started fresh, after Kiln restarts at the preflight stop", async () => {
    const h = await interruptedRun([noReport, items]);
    await h.engine.start();
    await h.engine.settled();
    const key = h.engine.preflightStopKey()!;
    expect(h.engine.preflightActivity(key)).toMatchObject({ before: "1" });
    expect(buildSnapshot(h.engine).needsYou!.preflight!.line).toContain("Kiln resumes Phase 1");
    h.reopenFromDisk(); await h.engine.agents.refresh();
    expect(await h.engine.decide({ review: true })).toMatchObject({ kind: "needs_you", phaseKey: key });
    await h.engine.continue();
    const offer = h.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    expect(await submit(h.engine, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).toMatchObject({ outcome: "marked_complete" });
    await h.engine.settled();
    // The phase kept its one conversation, carried on with its saved history.
    expect(h.engine.record.phases["1"]!.sessionIds).toHaveLength(1);
    const phaseOne = prompts(h).filter(prompt => !isPreflightPrompt(prompt))[1]!;
    expect(phaseOne).toContain("Carry on with");
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("none after Resume once the preflight reported ready", async () => {
    const h = await interruptedRun([ready]);
    expect(h.engine.restartReview).toBeDefined();
    expect(buildSnapshot(h.engine).preflight).toBeUndefined();
    await h.engine.start();
    await h.engine.settled();
    expect(prompts(h).filter(isPreflightPrompt)).toHaveLength(1);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("one after Resume following no report, run ahead of the interrupted phase and drawn directly above its row", async () => {
    const h = await interruptedRun([noReport, ready]);
    expect(buildSnapshot(h.engine).preflight).toEqual({ planned: { before: "1" } });
    await h.engine.start();
    await waitFor(() => (h.engine.record.preflight?.activities.length ?? 0) === 2);
    await h.engine.settled();
    const [first, second] = h.engine.record.preflight!.activities;
    expect(first!.result?.outcome).toBe("no_report");
    expect(second).toMatchObject({ trigger: "resume", before: "1", result: { outcome: "ready" } });
    // The third launch is the second preflight; the phase's session is resumed after it.
    expect(isPreflightPrompt(prompts(h)[2]!)).toBe(true);
    const ids = buildSnapshot(h.engine).activities!.map(row => row.id);
    expect(ids.indexOf(`preflight-${second!.activityId}`)).toBe(ids.indexOf("1") - 1);
    expect(h.engine.record.completedAt).toBeDefined();
  });
});

describe("more entry points and the preflight stop across a restart (AC-PREFLIGHT-01, AC-PREFLIGHT-03)", () => {
  it("a Start with every phase closed runs the preflight before the next activity", async () => {
    const files = prdDirectoryFiles();
    for (const file of ["phase-1-return-intake.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"]) {
      const lines = files[file]!.split("\n");
      files[file] = [lines[0], "**Closed:** 2026-11-01", ...lines.slice(1)].join("\n");
    }
    harness = await createHarness({ sessions: [], preflight: true, files });
    const h = await fixture([ready], [pullRequestSession()]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    // The preflight ran first; with nothing built on the branch, final delivery then found the work already integrated.
    expect(prompts(h).map(isPreflightPrompt)).toEqual([true]);
    expect(h.engine.record.preflight!.activities[0]).toMatchObject({ trigger: "start", result: { outcome: "ready" } });
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("`kiln run <path> --resume` runs a preflight first while none has settled", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "phase-one-release");
    const h = await fixture([noReport, ready], [{ actions: [{ waitForFile: release }, ...landingSession("src/one.txt").actions] }, { actions: landingSession("src/one.txt").actions }, ...allPhases.slice(1)]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 2 && h.engine.current?.processRunning === true && h.engine.current.phaseKey === "1");
    await h.engine.stop("sigterm");
    writeFileSync(release, "");
    h.reopenFromDisk(); await h.engine.agents.refresh();
    expect((await h.engine.decide({ resume: true })).kind).toBe("resume");
    expect(h.engine.record.preflight!.due).toMatchObject({ trigger: "resume" });
    await h.engine.continue();
    expect(isPreflightPrompt(prompts(h)[2]!)).toBe(true);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("a preflight stopped at Needs you stays stopped across a restart, and Check Preflight again then runs one fresh session", async () => {
    const h = await fixture([items, ready]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const key = h.engine.preflightStopKey()!;
    h.reopenFromDisk(); await h.engine.agents.refresh();
    expect(await h.engine.decide({ review: true })).toMatchObject({ kind: "needs_you", phaseKey: key });
    await h.engine.continue();
    expect(h.engine.preflightStopKey()).toBe(key);
    expect(h.claudeCalls()).toHaveLength(1);
    expect(await submit(h.engine, "check-again")).toMatchObject({ outcome: "session_started" });
    await h.engine.settled();
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    expect(prompts(h).filter(isPreflightPrompt)).toHaveLength(2);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("`kiln waive-and-advance` without --confirm at a preflight stop returns the offer and runs nothing", async () => {
    const h = await fixture([items]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const hosted = await startFixtureController({ engine: h.engine, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
    try {
      const address = new URL(hosted.server.address).origin;
      const response = await fetch(`${address}/api/control/v1/commands`, { method: "POST", headers: { Origin: address, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify({ command_id: "offer-only", execution_id: h.engine.record.executionId, status_token: h.engine.controlView().token, action: "waive-and-advance", inputs: { confirm: false } }) });
      const answer = await response.json() as { mark_complete: { offered: boolean; label: string; sentence: string[] } };
      expect(answer.mark_complete).toMatchObject({ offered: true, label: "Mark complete", sentence: [expect.stringContaining("Mark complete starts Phase 1")] });
      await h.engine.settled();
      expect(h.claudeCalls()).toHaveLength(1);
      expect(h.engine.commands.all().some(r => r.command_id === "offer-only")).toBe(false);
      expect(h.engine.preflightStopKey()).toBeDefined();
    } finally { await hosted.server.close(); hosted.release(); }
  });
});

describe("resolving the installed skill (When the Preflight Is Due, step 1)", () => {
  it("finds a directory marketplace's skill where Claude Code loads it, not in the stale install cache", async () => {
    harness = await createHarness({ sessions: [] });
    const config = join(harness.sandbox.root, "claude-config");
    const source = join(harness.sandbox.root, "method"); const cache = join(harness.sandbox.root, "cache");
    mkdirSync(join(source, ".claude-plugin"), { recursive: true }); mkdirSync(join(source, "skills", "build-preflight"), { recursive: true }); mkdirSync(join(cache, "skills"), { recursive: true });
    writeFileSync(join(source, ".claude-plugin", "marketplace.json"), JSON.stringify({ name: "enso-method", plugins: [{ name: "enso-method", source: "." }] }));
    writeFileSync(join(source, "skills", "build-preflight", "SKILL.md"), "# build-preflight\n");
    mkdirSync(join(config, "plugins"), { recursive: true });
    writeFileSync(join(config, "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { "enso-method@enso-method": [{ installPath: cache }] } }));
    writeFileSync(join(config, "plugins", "known_marketplaces.json"), JSON.stringify({ "enso-method": { source: { source: "directory", path: source } } }));
    const commands = join(harness.sandbox.root, "commands.json");
    writeFileSync(commands, JSON.stringify(["enso-method:build-preflight"]));
    const env = { ...harness.env, KILN_STANDIN_COMMANDS: commands };
    const found = await resolveSkill({ name: "build-preflight", agent: "claude_code", claude: harness.tools.claude, cwd: harness.repository, env, signal: AbortSignal.timeout(60_000) });
    expect(found).toMatchObject({ kind: "found", skill: { name: "build-preflight", path: realpathSync(join(source, "skills", "build-preflight", "SKILL.md")) } });
    writeFileSync(commands, JSON.stringify([]));
    expect(await resolveSkill({ name: "build-preflight", agent: "claude_code", claude: harness.tools.claude, cwd: harness.repository, env, signal: AbortSignal.timeout(60_000) })).toMatchObject({ kind: "absent" });
    writeFileSync(commands, JSON.stringify(["build-preflight", "enso-method:build-preflight"]));
    expect(await resolveSkill({ name: "build-preflight", agent: "claude_code", claude: harness.tools.claude, cwd: harness.repository, env, signal: AbortSignal.timeout(60_000) })).toMatchObject({ kind: "unresolvable" });
  });
});

describe("hardening: a preflight's session across interruptions, limits and Continue (AC-PREFLIGHT-01, AC-PREFLIGHT-06)", () => {
  async function interruptedPreflight(first: ScenarioSession, second: ScenarioSession) {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "preflight-release");
    const h = await fixture([{ ...first, actions: [{ waitForFile: release }, ...first.actions] }, second]);
    await h.engine.start({ refinementConfirmed: true });
    // The session has its prompt and is working when Kiln is stopped.
    await waitFor(() => h.claudeCalls().length === 1 && h.engine.current?.processRunning === true && isPreflightKey(h.engine.current.phaseKey));
    await h.engine.stop("sigterm");
    writeFileSync(release, "");
    h.reopenFromDisk(); await h.engine.agents.refresh();
    return h;
  }

  it("an interrupted preflight is resumed in its own conversation with the preflight's own tail, and its report is read afterwards", async () => {
    const h = await interruptedPreflight(ready, ready);
    expect(await h.engine.decide({ review: true })).toMatchObject({ kind: "resume" });
    expect(h.engine.restartReview).toMatchObject({ activityKey: expect.stringMatching(/^preflight-/), action: "resume" });
    await h.engine.start();
    await h.engine.settled();
    const key = `preflight-${h.engine.record.preflight!.activities[0]!.activityId}`;
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    expect(h.engine.record.phases[key]!.sessionIds).toHaveLength(1);
    expect(prompts(h)[1]).toContain("Carry on with the build preflight");
    expect(prompts(h)[1]).not.toContain("Carry on with `");
    expect(h.engine.record.preflight!.activities[0]!.result).toMatchObject({ outcome: "ready", run: 1 });
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("an interrupted preflight whose conversation cannot be reopened has ended and reads as No report; Resume then runs a fresh one", async () => {
    const h = await interruptedPreflight({ ...ready, noTranscript: true }, ready);
    await h.engine.decide({ review: true });
    expect(h.engine.record.preflight!.activities[0]!.result?.outcome).toBe("no_report");
    await h.engine.start();
    await h.engine.settled();
    expect(h.engine.record.preflight!.activities.map(one => one.result?.outcome)).toEqual(["no_report", "ready"]);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("a session ending with no final message reads as No report and the run goes on", async () => {
    const h = await fixture([{ actions: [{ exit: 1 }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.preflight!.activities[0]!.result).toMatchObject({ outcome: "no_report" });
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("a preflight refused by a usage limit with Resume after a usage limit off has ended: No report, and the run goes on", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    harness.engine.record.settings.resumeAfterUsageLimit = false;
    const h = await fixture([{ actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3600 } }, { exit: 1 }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const key = `preflight-${h.engine.record.preflight!.activities[0]!.activityId}`;
    expect(h.engine.record.phases[key]!.wait).toBeUndefined();
    expect(h.engine.record.preflight!.activities[0]!.result).toMatchObject({ outcome: "no_report" });
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("a preflight refused by a usage limit with the setting on waits, and nothing else starts while it waits", async () => {
    const h = await fixture([{ actions: [{ refuse: { rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 3600 } }, { exit: 1 }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.engine.waitingPhaseKey() !== undefined);
    expect(isPreflightKey(h.engine.waitingPhaseKey())).toBe(true);
    expect(h.engine.record.preflight!.activities[0]!.result).toBeUndefined();
    expect(buildSnapshot(h.engine).feature.state).toBe("waiting");
    expect(prompts(h)).toHaveLength(1);
  });

  it("`kiln continue` at a pause runs a preflight first", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "phase-one-release");
    const h = await fixture([ready, ready], [{ actions: [{ waitForFile: release }, ...landingSession("src/one.txt").actions] }, ...allPhases.slice(1)]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 2);
    h.engine.pause();
    writeFileSync(release, "");
    await waitFor(() => h.engine.record.pause.activeSince !== undefined);
    await h.engine.settled();
    expect(await submit(h.engine, "continue")).toMatchObject({ state: "completed" });
    await h.engine.settled();
    expect(h.engine.record.preflight!.activities.map(one => one.trigger)).toEqual(["start", "unpause"]);
    expect(prompts(h).map(isPreflightPrompt).slice(0, 3)).toEqual([true, false, true]);
  });

  it("carry-on and verify-and-advance submitted at a preflight stop are refused with the reason naming the two controls, and the terminal printed the stop", async () => {
    const h = await fixture([items]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    for (const action of ["carry-on", "verify-and-advance", "resume", "start-again"]) expect(await submit(h.engine, action)).toMatchObject({ state: "refused", reason: PREFLIGHT_STOP_REASON });
    expect(terminal(h).find(line => /PF\s+Preflight\s+stopped/.test(line))).toBeDefined();
    expect(h.claudeCalls()).toHaveLength(1);
  });
});

describe("hardening: Continue runs a preflight before the first added phase (AC-PREFLIGHT-01, AC-PREFLIGHT-08)", () => {
  it("the fresh execution's first session is the preflight, triggered by Continue", async () => {
    const f = await createCometContinuation(); harness = f.h; f.integrate();
    const h = harness;
    installPreflightSkill(h.sandbox.root);
    h.engine.close();
    h.engine = new Engine({ paths: { ...h.engine.paths, repositoryName: "comet-library" }, tools: h.tools, env: h.env, stateDirectory: h.stateDirectory, record: readPrdRecord(h.stateDirectory)!, sleepReader: { next: async () => [] }, originRetryMs: 0 });
    await waitFor(() => !h.engine.agents.state.pending && !h.engine.billing.pending && !h.engine.billing.busy);
    const before = h.claudeCalls().length;
    const check = await h.engine.checkCompletedPlan();
    expect(buildSnapshot(h.engine).preflight).toEqual({ planned: { before: "end" } });
    expect((await h.engine.continuationCommand("accept", { proposalId: check.result!.proposal!.id, commandId: "continue-with-preflight", executionId: h.engine.record.executionId!, statusToken: h.engine.controlView().token })).ok).toBe(true);
    await waitFor(() => h.claudeCalls().length >= before + 2);
    const after = prompts(h).slice(before);
    expect(isPreflightPrompt(after[0]!)).toBe(true);
    expect(isPreflightPrompt(after[1]!)).toBe(false);
    expect(h.engine.record.preflight!.activities[0]).toMatchObject({ trigger: "continue", result: { outcome: "ready" } });
    // After the earlier execution's closed phases, directly above the first added phase.
    const rows = buildSnapshot(h.engine).activities!;
    const at = rows.findIndex(one => one.id === `preflight-${h.engine.record.preflight!.activities[0]!.activityId}`);
    expect(rows.slice(0, at).every(one => one.state === "done")).toBe(true);
    expect(rows[at + 1]!.state).not.toBe("done");
  });
});

describe("test audit: where the row sits and what opening it shows (AC-PREFLIGHT-08, AC-PREFLIGHT-02, AC-PREFLIGHT-06)", () => {
  const DIRECTORY = "docs/prds/customer-returns";
  const STOP_LINE = "**The build will stop** at phase 3, which needs you at the console.";
  // As Claude Code streams it: the final message as an assistant text block, then the result.
  const READY_WITH_STOP = `Preflight: ready\n\n4 phases.\n\n${STOP_LINE}`;
  const readyWithStop: ScenarioSession = { actions: [{ skill: "enso-method:build-preflight" }, { text: READY_WITH_STOP }, { result: READY_WITH_STOP }, { exit: 0 }] };
  const ENDED = "I ran out of time before writing the report.";
  const noReportStreamed: ScenarioSession = { actions: [{ text: ENDED }, { result: ENDED }, { exit: 0 }] };
  /** The fixture documents with the named phase documents marked closed. */
  function closing(...names: string[]): Record<string, string> {
    const files = prdDirectoryFiles();
    for (const file of names) {
      const lines = files[file]!.split("\n");
      files[file] = [lines[0], "**Closed:** 2026-11-01", ...lines.slice(1)].join("\n");
    }
    return files;
  }
  const ALL_OPEN = ["phase-1-return-intake.md", "phase-2b-store-credit.md", "phase-3-returns-dashboard.md"];
  /** Documents found as `kiln run` builds it from the committed documents, which the snapshot reads `before` from. */
  function found(h: Harness) {
    const read = readPlanAt(h.repository, DIRECTORY);
    if (!read.ok) throw new Error(read.problem);
    return documentsFound(join(h.repository, DIRECTORY), "customer-returns", read.plan, { designFile: "technical-design.md", assumptionsFile: "assumptions.md", phaseDocCount: 5, repositories: [] }, "acme-shop");
  }
  /** One session's output as opening its row loads it, through the controller's session-output route. */
  async function opened(h: Harness, sessionId: string): Promise<string[]> {
    const hosted = await startFixtureController({ engine: h.engine, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
    try {
      const response = await fetch(`${new URL(hosted.server.address).origin}/api/sessions/${sessionId}/output?limit=1000`, { headers: { "X-Kiln-Token": h.engine.record.token } });
      expect(response.status).toBe(200);
      return ((await response.json()) as { lines: { text: string }[] }).lines.map(line => line.text);
    } finally { await hosted.server.close(); hosted.release(); }
  }

  it.each([
    ["Phase 1 on a new branch", [] as string[], "1"],
    ["the first open phase on a branch with closed phases", ["phase-1-return-intake.md"], "2b"],
    ["the end, after the closed phases, when every phase is closed", ALL_OPEN, "end"],
  ])("Documents found plans the row above %s", async (_name, closed, before) => {
    harness = await createHarness({ sessions: [], preflight: true, files: closing(...closed) });
    const h = await fixture([]);
    await h.engine.agents.refresh();
    expect(buildSnapshot(h.engine, found(h)).preflight).toEqual({ planned: { before } });
  });

  it("the run's plan draws the row directly above the first open phase, below the closed one, on a branch with closed phases", async () => {
    harness = await createHarness({ sessions: [], preflight: true, files: closing("phase-1-return-intake.md") });
    const h = await fixture([ready], allPhases.slice(1));
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const ids = buildSnapshot(h.engine).activities!.map(row => row.id);
    const at = ids.indexOf(preflightRows(h.engine)[0]!.id);
    expect(ids[at + 1]).toBe("2b");
    expect(ids.indexOf("1")).toBeLessThan(at);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("with every phase closed and completion audits on, the row sits directly above the delivery audit", async () => {
    harness = await createHarness({ sessions: [], preflight: true, auditCycles: true, files: closing(...ALL_OPEN) });
    const h = await fixture([ready], [{ actions: [{ result: "The audit ended early." }, { exit: 0 }] }]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const ids = buildSnapshot(h.engine).activities!.map(row => row.id);
    const at = ids.indexOf(preflightRows(h.engine)[0]!.id);
    expect(at).toBeGreaterThan(-1);
    expect(ids[at + 1]).toMatch(/^audit-/);
    expect(h.engine.auditActivity(ids[at + 1]!)!.kind).toBe("delivery_audit");
    expect(isPreflightPrompt(prompts(h)[0]!)).toBe(true);
    expect(isPreflightPrompt(prompts(h)[1]!)).toBe(false);
  });

  it("a clean row shows how long it took and leaves out the report's stops, which opening it shows in the full report", async () => {
    const h = await fixture([readyWithStop]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const [row] = preflightRows(h.engine);
    const facts = h.engine.record.phases[row!.id]!;
    const session = h.engine.sessionRecord(row!.id, facts.sessionIds[0]!)!;
    // How long it took: from its session's start to when it finished.
    expect(row).toMatchObject({ state: "done", sessionStartedAt: session.runs[0]!.startedAt, doneAt: facts.doneAt, preflight: { outcome: "ready", found: "Nothing to settle" } });
    expect(Date.parse(row!.doneAt!)).toBeGreaterThanOrEqual(Date.parse(row!.sessionStartedAt!));
    expect(row!.details).toMatchObject({ from: session.runs[0]!.startedAt, to: facts.doneAt, sessionId: session.sessionId });
    expect(h.engine.record.preflight!.activities[0]!.result).toEqual(expect.objectContaining({ outcome: "ready" }));
    expect(JSON.stringify(row)).not.toContain("The build will stop");
    expect(JSON.stringify(h.engine.record.preflight)).not.toContain("The build will stop");
    expect((await opened(h, session.sessionId)).join("\n")).toContain(STOP_LINE);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("opening a No report row shows how its session ended", async () => {
    const h = await fixture([noReportStreamed]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const [row] = preflightRows(h.engine);
    expect(row).toMatchObject({ preflight: { outcome: "no_report", found: "Ended without a report" } });
    const lines = await opened(h, row!.details!.sessionId);
    expect(lines).toContain(ENDED);
    expect(lines.at(-1)).toBe("Process exited with code 0");
  });
});

describe("test audit, second fixing chat: Folder missing Starts, Resume after Mark complete, appended phases and no setting (AC-PREFLIGHT-01)", () => {
  const panelOf = (h: Harness) => {
    const panel = h.engine.folderPanel;
    if (!panel || "blocked" in panel) throw new Error(`No setup panel: ${JSON.stringify(panel)}`);
    return panel;
  };
  let starts = 0;
  /** Presses Start on the Folder missing page with the starting point it shows selected, or the one named. */
  async function folderStart(h: Harness, start?: "base" | "branch") {
    if (start) await h.engine.changeFolderPanel({ start, fields: {} });
    const panel = panelOf(h);
    return h.engine.folderSetupStartCommand({ commandId: `folder-start-${++starts}`, factsId: h.engine.folderMissing!.factsId, previewId: panel.previewId, start: panel.selected, fields: {} });
  }
  /** The worktree deleted from disk, with git still recording it, then the Folder missing page gathered. */
  async function deleteFolder(h: Harness) {
    rmSync(h.engine.worktreePath, { recursive: true, force: true });
    expect(await h.engine.folderGuard({ gather: true })).toBe(false);
  }
  const triggers = (h: Harness) => h.engine.record.preflight!.activities.map(one => one.trigger);
  // Phase 1 lands; Phase 2b then stops at Needs you; afterwards 2b, 3 and final delivery.
  const stopAt2b = [landingSession("src/one.txt"), { actions: [{ result: "I need a decision." }, { exit: 0 }] }, landingSession("src/two-b.txt"), landingSession("src/three.txt"), pullRequestSession()];

  it("a Start on the Folder missing page from the base branch runs a preflight first in the new execution, before the remaining plan", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const h = await fixture([ready, ready], stopAt2b);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    const oldExecution = h.engine.record.executionId;
    git(h.sandbox, h.repository, "fetch", "-q", "origin");
    git(h.sandbox, h.repository, "merge", "-q", "--no-ff", "-m", "Merge the feature", "origin/feature/customer-returns");
    git(h.sandbox, h.repository, "push", "-q", "origin", "develop");
    await deleteFolder(h);
    expect(panelOf(h).selected).toBe("base");
    const before = h.claudeCalls().length;
    expect(await folderStart(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.executionId).not.toBe(oldExecution);
    // The new execution's first launch is its preflight, in the new folder, then Phase 2b.
    const launched = h.claudeCalls().slice(before).map(call => call as { prompt: string; cwd: string });
    expect(isPreflightPrompt(launched[0]!.prompt)).toBe(true);
    expect(launched[0]!.cwd).toBe(h.engine.worktreePath);
    expect(launched[1]!.prompt).toContain("phase-2b-store-credit.md");
    expect(launched.slice(1).some(call => isPreflightPrompt(call.prompt))).toBe(false);
    expect(triggers(h)).toEqual(["start"]);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("a Start on the Folder missing page from the existing feature branch runs a preflight first while none has settled, ahead of the interrupted phase", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "phase-one-release");
    const h = await fixture([noReport, ready], [{ actions: [{ waitForFile: release }, ...landingSession("src/one.txt").actions] }, { actions: landingSession("src/one.txt").actions }, ...allPhases.slice(1)]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 2 && h.engine.current?.processRunning === true && h.engine.current.phaseKey === "1");
    await h.engine.stop("sigterm");
    writeFileSync(release, "");
    h.reopenFromDisk(); await h.engine.agents.refresh();
    await deleteFolder(h);
    const execution = h.engine.record.executionId;
    expect(await folderStart(h, "branch")).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.record.executionId).toBe(execution);
    expect(h.engine.record.preflight!.activities.map(one => [one.trigger, one.result?.outcome])).toEqual([["start", "no_report"], ["resume", "ready"]]);
    expect(prompts(h).map(isPreflightPrompt).slice(0, 4)).toEqual([true, false, true, false]);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("a Start on the Folder missing page from the existing feature branch runs none while the run is held in Needs you", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const h = await fixture([noReport], stopAt2b);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    expect(preflightSettled(h.engine.record)).toBe(false);
    await deleteFolder(h);
    expect(panelOf(h).selected).toBe("branch");
    const before = h.claudeCalls().length;
    expect(await folderStart(h)).toEqual({ ok: true, status: 200 });
    await h.engine.settled();
    expect(h.engine.stoppedPhaseKey()).toBe("2b");
    expect(h.claudeCalls()).toHaveLength(before);
    expect(h.engine.record.preflight!.due).toBeUndefined();
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
  });

  it("a Start on the Folder missing page that ends a pause runs a preflight first, though one already reported ready", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "phase-one-release");
    const h = await fixture([ready, ready], [{ actions: [{ waitForFile: release }, ...landingSession("src/one.txt").actions] }, ...allPhases.slice(1)]);
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 2);
    expect(h.engine.pause()).toMatchObject({ ok: true });
    writeFileSync(release, "");
    await waitFor(() => h.engine.record.pause.activeSince !== undefined);
    await h.engine.settled();
    expect(preflightSettled(h.engine.record)).toBe(true);
    await deleteFolder(h);
    expect(panelOf(h).selected).toBe("branch");
    expect(await folderStart(h)).toEqual({ ok: true, status: 200 });
    // The pause's request ends with it, so the run is not paused again before the preflight.
    expect(h.engine.record.pause).toEqual({});
    await h.engine.settled();
    expect(triggers(h)).toEqual(["start", "unpause"]);
    expect(prompts(h).map(isPreflightPrompt)).toEqual([true, false, true, false, false, false]);
    expect(prompts(h)[3]).toContain("phase-2b-store-credit.md");
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("Resume after Mark complete at an items stop runs no second preflight", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "phase-one-release");
    const h = await fixture([items, ready], [{ actions: [{ waitForFile: release }, ...landingSession("src/one.txt").actions] }, { actions: landingSession("src/one.txt").actions }, ...allPhases.slice(1)]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const offer = h.engine.markCompleteOffer();
    if (!offer.offered) throw new Error(offer.reason);
    expect(await submit(h.engine, "waive-and-advance", { check_run_id: offer.checkRunId, via: "browser" })).toMatchObject({ outcome: "marked_complete" });
    await waitFor(() => h.claudeCalls().length === 2 && h.engine.current?.processRunning === true && h.engine.current.phaseKey === "1");
    await h.engine.stop("sigterm");
    writeFileSync(release, "");
    h.reopenFromDisk(); await h.engine.agents.refresh();
    await h.engine.decide({ review: true });
    expect(h.engine.restartReview).toBeDefined();
    expect(buildSnapshot(h.engine).preflight).toBeUndefined();
    expect(await h.engine.start()).toMatchObject({ ok: true });
    expect(h.engine.record.preflight!.due).toBeUndefined();
    await h.engine.settled();
    expect(prompts(h).filter(isPreflightPrompt)).toHaveLength(1);
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    expect(h.engine.record.completedAt).toBeDefined();
  });

  it("phases a delivery audit appends while the run is underway get no preflight", { timeout: 120_000 }, async () => {
    const directory = "docs/prds/proof";
    const files = {
      "proof-prd.md": "# PRD: Audit value\n\n## Acceptance Criteria\n- [ ] **AC-PROOF-01 — Return value.** The exported function returns 42.\n",
      "technical-design.md": "# Design\nExport value from value.mjs. Test using node value.test.mjs.\n",
      "phase-1-value.md": "# Phase 1: Return value\n\n**Closed:** 2026-10-24\n\n## Acceptance criteria covered\nAC-PROOF-01\n\n## Phase dependencies\nNone.\n",
      "value.mjs": "export const value = () => 42;\n",
      "value.test.mjs": "import {value} from './value.mjs'; import assert from 'node:assert/strict'; assert.equal(value(),42);\n",
    };
    const audit = (behavior: Record<string, unknown> = {}) => ({ actions: [{ auditReport: behavior }, { result: "Audit ended." }, { exit: 0 }] });
    const sessions = [landingSession(`${directory}/value.mjs`, files["value.mjs"]), pullRequestSession()];
    harness = await createHarness({ folder: "proof", files, sessions, auditCycles: true, preflight: true });
    const h = harness;
    writeFileSync(join(h.repository, ".gitignore"), ".proof/\n"); git(h.sandbox, h.repository, "add", "--", ".gitignore"); git(h.sandbox, h.repository, "commit", "-m", "test(audit): ignore transient requests"); git(h.sandbox, h.repository, "push", "origin", "develop");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions, auditSessions: [audit({ gap: true }), audit(), audit()], preflightSessions: [ready] }));
    const hosted = await startFixtureController({ engine: h.engine, folderName: "proof", featureName: "Audit value", token: h.engine.record.token });
    try {
      await h.engine.start({ refinementConfirmed: true });
      await h.engine.settled();
      expect(h.engine.record.completedAt).toBeDefined();
      // The audit appended Phase 2, which was built with no preflight ahead of it.
      expect(buildSnapshot(h.engine).activities!.map(row => row.title)).toEqual(["Return value", "Preflight", "Delivery audit", "Repair value", "Delivery audit", "Test audit", "Final pull request"]);
      expect(h.events.flatMap(e => e.kind === "phase" && e.event === "started" ? [`Phase ${e.phaseId}`] : [])).toContain("Phase 2");
      expect(prompts(h).filter(isPreflightPrompt)).toHaveLength(1);
      expect(isPreflightPrompt(prompts(h)[0]!)).toBe(true);
      expect(h.engine.record.preflight!.activities.map(one => one.trigger)).toEqual(["start"]);
    } finally { await hosted.server.close(); hosted.release(); }
  });

  it("no setting turns the preflight off: neither the saved settings nor the settings route know one", async () => {
    const h = await fixture([ready]);
    const hosted = await startFixtureController({ engine: h.engine, folderName: "customer-returns", featureName: "Customer returns", token: h.engine.record.token });
    try {
      const address = new URL(hosted.server.address).origin;
      for (const name of ["preflight", "buildPreflight", "skipPreflight"]) {
        const response = await fetch(`${address}/api/settings`, { method: "POST", headers: { Origin: address, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify({ [name]: false }) });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ reason: `Unknown setting: ${name}.` });
      }
    } finally { await hosted.server.close(); hosted.release(); }
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(Object.keys(h.engine.record.settings).filter(key => /preflight/i.test(key))).toEqual([]);
    expect(Object.keys(buildSnapshot(h.engine).settings).filter(key => /preflight/i.test(key))).toEqual([]);
    expect(prompts(h).filter(isPreflightPrompt)).toHaveLength(1);
  });
});

describe("test audit, second fixing chat: the preflight stop's terminal command, its rerun and the untouched worktree (AC-PREFLIGHT-03)", () => {
  /** HEAD, the staged index and `git status --porcelain` of the run's worktree. */
  const worktreeState = (h: Harness) => ({
    head: git(h.sandbox, h.engine.worktreePath, "rev-parse", "HEAD").trim(),
    index: git(h.sandbox, h.engine.worktreePath, "diff", "--cached", "--binary"),
    status: git(h.sandbox, h.engine.worktreePath, "status", "--porcelain", "--untracked-files=all"),
  });

  it("Kiln's preflight changes nothing in the worktree: HEAD, the index and the status are the same at the stop and after Check Preflight again as when it began", async () => {
    harness = await createHarness({ sessions: [], preflight: true });
    const release = join(harness.sandbox.root, "preflight-release");
    const h = await fixture([{ actions: [{ waitForFile: release }, ...items.actions] }, items]);
    h.engine.start({ refinementConfirmed: true }).catch(() => {});
    await waitFor(() => h.engine.current?.processRunning === true && isPreflightKey(h.engine.current.phaseKey));
    // The person's own work in progress: a staged change and an untracked file.
    writeFileSync(join(h.engine.worktreePath, "notes-staged.txt"), "staged\n");
    git(h.sandbox, h.engine.worktreePath, "add", "--", "notes-staged.txt");
    writeFileSync(join(h.engine.worktreePath, "notes-untracked.txt"), "untracked\n");
    const began = worktreeState(h);
    expect(began.status).toContain("A  notes-staged.txt");
    expect(began.status).toContain("?? notes-untracked.txt");
    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.engine.preflightStopKey()).toBeDefined();
    expect(worktreeState(h)).toEqual(began);
    expect(await submit(h.engine, "check-again")).toMatchObject({ outcome: "session_started" });
    await h.engine.settled();
    expect(h.engine.preflightStopKey()).toBeDefined();
    expect(worktreeState(h)).toEqual(began);
  });

  it("the stop shows the copyable command that reopens the preflight session in a terminal", async () => {
    const h = await fixture([items]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const key = h.engine.preflightStopKey()!;
    const sessionId = h.engine.record.phases[key]!.sessionIds[0]!;
    const command = buildSnapshot(h.engine).needsYou!.resumeCommand!;
    expect(command).toContain(`claude --resume ${sessionId}`);
    expect(command).toContain(h.engine.worktreePath.replace(process.env.HOME ?? "\0", "~"));
  });

  const itemsAgain: ScenarioSession = { actions: [{ skill: "enso-method:build-preflight" }, { result: "Preflight: 1 item needs you\n\n1. Run `gh auth login`." }, { exit: 0 }] };
  it.each<[string, ScenarioSession[], "items" | "no_report"]>([
    ["items again: the run stays stopped at a fresh stop with the new items", [items, itemsAgain], "items"],
    ["no report: the run goes on as after a clean preflight", [items, noReport], "no_report"],
  ])("after Check Preflight again, a second report of %s", async (_name, sessions, outcome) => {
    const h = await fixture(sessions);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const key = h.engine.preflightStopKey()!;
    expect(await submit(h.engine, "check-again")).toMatchObject({ outcome: "session_started" });
    await h.engine.settled();
    expect(h.engine.record.preflight!.activities).toHaveLength(1);
    expect(h.engine.record.preflight!.activities[0]!.result).toMatchObject({ outcome });
    expect(h.engine.record.phases[key]!.sessionIds).toHaveLength(2);
    if (outcome === "items") {
      expect(h.engine.preflightStopKey()).toBe(key);
      expect(buildSnapshot(h.engine).needsYou!.preflight).toMatchObject({ headline: "Preflight: 1 item needs you", items: ["Run `gh auth login`."] });
      // Nothing past the preflight started.
      expect(prompts(h).every(isPreflightPrompt)).toBe(true);
      expect(h.engine.record.completedAt).toBeUndefined();
    } else {
      expect(h.engine.preflightStopKey()).toBeUndefined();
      expect(preflightRows(h.engine)[0]).toMatchObject({ state: "done", preflight: { outcome: "no_report", found: "Ended without a report" } });
      expect(prompts(h).filter(isPreflightPrompt)).toHaveLength(2);
      expect(prompts(h)[2]).toContain("phase-1-return-intake.md");
      expect(h.engine.record.completedAt).toBeDefined();
    }
  });

  it("the refusal's reason names the stop's two controls in words", async () => {
    const h = await fixture([items]);
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(await submit(h.engine, "reply", { message: "Done." })).toMatchObject({ state: "refused", reason: "At a preflight stop, use Check Preflight again or Mark complete." });
  });
});
