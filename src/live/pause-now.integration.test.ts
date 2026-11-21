// Kiln Pause Now (AC-PAUSE-02 to AC-PAUSE-05): the stop, Cancel, the Pause now state and its
// terminal and status lines, through the real engine, journal, checkpoint hook, gate and HTTP
// routes, with the scripted Claude stand-in running the hooks Kiln registers.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { buildSnapshot } from "../engine/snapshot.js";
import { startFixtureController } from "../test-support/controller-server.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";
import { formatDecisionLine, formatSummaryLine } from "../underway-output.js";
import { terminalColors } from "../terminal-output.js";
import type { Receipt } from "../control/commands.js";
import { processStartTime } from "../platform/process-start-time.js";
import { readGate, withGate } from "./gate.js";
import { pausedSentence, pausingRow } from "./pause-now.js";
import { writeSessionRecord } from "../state/records.js";
import type { LiveTarget } from "./target.js";

const darwin = it.skipIf(process.platform !== "darwin");
let h: Harness; let hosted: Awaited<ReturnType<typeof startFixtureController>> | undefined; let origin: string;
afterEach(async () => { hosted?.release(); await hosted?.server.close(); hosted = undefined; await h?.cleanup(); });

/** Starts Kiln on one scripted Claude session (and a second for a Resume), with its controller. */
async function start(actions: Record<string, unknown>[]) {
  h = await createHarness({ sessions: [] });
  h.env.KILN_STANDIN_VERSION = "2.1.311";
  mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
  writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: actions.map(a => JSON.parse(JSON.stringify(a).replaceAll("$SANDBOX", h.sandbox.root))) }, { actions: [{ result: "Continued the same activity." }] }] }));
  await h.engine.start({ refinementConfirmed: true });
  hosted = await startFixtureController({ engine: h.engine, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
  origin = `http://127.0.0.1:${hosted.port}`;
}
const file = (name: string) => join(h.sandbox.root, name);
async function post(path: string, body: unknown) {
  const response = await fetch(`${origin}/api/${path}`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
const gateOf = () => readGate(h.engine.latestSession("1")!.runs.at(-1)!.live!.gateDirectory);
const hookCalls = () => existsSync(`${h.scenarioPath}.hooks.jsonl`) ? readFileSync(`${h.scenarioPath}.hooks.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line) as { event: string; input: { tool_input?: { command?: string } }; stdout: string; status: number }) : [];
const deniedCommands = () => hookCalls().filter(call => call.event === "PreToolUse" && (call.status === 2 || call.stdout.includes("\"deny\""))).map(call => call.input.tool_input?.command);
const pauseNow = () => h.engine.liveView()?.pauseNow;
async function cli(args: string[], json = true) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli.js", import.meta.url)), ...args, join(h.repository, h.engine.record.prdDirectory), ...(json ? ["--json"] : [])], { cwd: h.sandbox.root, env: h.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", b => { output += String(b); });
  await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  return { output, body: json ? JSON.parse(output) as Record<string, unknown> : {} };
}
async function pressPauseNow(instructionId: string): Promise<LiveTarget> {
  const target = h.engine.liveTarget()!;
  const accepted = await post("live/take-over", { instructionId, target });
  expect(accepted.status, JSON.stringify(accepted.body)).toBe(202);
  return target;
}
async function waitForPaused(): Promise<void> {
  await waitFor(async () => { await h.engine.reconcileTakeover(); return pauseNow()?.phase === "paused"; }, 15000);
}

darwin("cancels during a running command: the session carries on with no denied call, and a later Pause now is a new instruction (AC-PAUSE-04)", async () => {
  await start([{ runUntil: { command: "npm test -- src/refunds", file: "$SANDBOX/release" } }, { bash: "echo next" }, { result: "Finished after the cancel." }]);
  const done = file("release");
  await waitFor(() => !!h.engine.latestSession("1")?.runs.at(-1)?.live && Object.values(gateOf().operations).some(o => o.label?.input === "npm test -- src/refunds"));

  // `kiln pause` is still admitted before Claude exits (technical design, surface table); it is the separately requested end-of-activity pause Cancel must leave alone.
  expect(h.engine.controlView().controls.find(c => c.name === "request-pause")).toMatchObject({ available: true });
  expect(h.engine.pause().ok).toBe(true);
  const attempt = h.engine.liveTarget()!.attemptId; const runs = h.engine.latestSession("1")!.runs.length;
  const target = await pressPauseNow("first");
  const view = pauseNow()!;
  expect(view).toMatchObject({ phase: "pausing", stopped: false, running: [{ tool: "Bash", input: "npm test -- src/refunds" }], cancel: { available: true } });
  // Message Claude names Pause now while the hold lasts (AC-PAUSE-02).
  expect(h.engine.liveView()?.input?.reason).toBe("Pause now is pausing or has paused this activity.");
  expect(pausingRow(view)).toMatchObject({ kind: "command", lines: ["Bash(npm test -- src/refunds)"], lid: true });
  // kiln run's lines while pausing: its stop line, the restart summary and the ● line (AC-PAUSE-03).
  const describeStop = () => (h.engine as unknown as { describeStop(): { text: string; grey?: string } }).describeStop();
  expect(describeStop()).toEqual({ text: "Kiln stopped while phase 1 was pausing.", grey: "kiln run picks it back up." });
  expect(formatSummaryLine(h.engine, terminalColors({ isTTY: false }, {}))).toContain("pausing in phase 1");
  expect(formatDecisionLine({ kind: "needs_you", phaseKey: "1", again: true }, h.engine, terminalColors({ isTTY: false }, {}))).toContain("Phase 1 is pausing. Kiln finishes the pause on its own.");
  expect((await cli(["status"])).body.pause_status).toBe("Pausing — finishing the command it is running. Bash(npm test -- src/refunds) Will pause after Phase 1 finishes. Current work continues.");
  // Cancel is browser only: absent from kiln status's controls and refused on the bot route.
  expect(h.engine.controlView().controls.map(c => c.name)).not.toContain("cancel-take-over");
  const bot = await fetch(`${origin}/api/control/v1/commands`, { method: "POST", headers: { Origin: origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify({ command_id: "bot-cancel", execution_id: target.executionId, status_token: h.engine.controlView().token, action: "cancel-take-over", inputs: { target, takeover_instruction_id: "first" } }) });
  expect(((await bot.json()) as { errors: { code: string }[] }).errors[0]!.code).toBe("invalid_input");

  const cancelled = await post("live/cancel-take-over", { instructionId: "cancel-1", target, takeoverInstructionId: "first" });
  expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(202);
  expect(cancelled.body).toMatchObject({ ok: true, outcome: "takeover_withdrawn" });
  expect((cancelled.body.receipt as Receipt).effects.takeover).toBe("withdrawn");
  expect(h.engine.record.liveControl).toBeUndefined();
  expect(gateOf().held).toBeUndefined(); expect(gateOf().stop).toBeUndefined();
  expect(h.engine.liveView()).toMatchObject({ available: true }); expect(pauseNow()).toBeUndefined();
  // The same attempt carries on, the end-of-activity pause is still pending, and kiln status no longer reports Pause now.
  expect(h.engine.liveTarget()!.attemptId).toBe(attempt); expect(h.engine.latestSession("1")!.runs).toHaveLength(runs);
  expect(h.engine.record.pause.requestedAt).toBeDefined();
  const afterCancel = await cli(["status"]);
  expect(afterCancel.body.pause_status).toBe("Will pause after Phase 1 finishes. Current work continues.");
  expect((afterCancel.body.live_control as { pauseNow?: unknown; takeover?: unknown }).pauseNow).toBeUndefined();
  expect((afterCancel.body.live_control as { takeover?: unknown }).takeover).toBeUndefined();
  // A same-ID retry returns the original receipt; the take-over receipt keeps its own outcome.
  const retried = await post("live/cancel-take-over", { instructionId: "cancel-1", target, takeoverInstructionId: "first" });
  expect(retried.status).toBe(202); expect((retried.body.receipt as Receipt).id).toBe((cancelled.body.receipt as Receipt).id);
  expect((h.engine.commands.lookup("first").operation as Receipt).outcome).toBe("takeover_requested");

  // Pressing Pause now again is a new instruction and a new hold; cancel it too.
  await pressPauseNow("second");
  expect(h.engine.record.liveControl?.takeover.instructionId).toBe("second");
  expect((await post("live/cancel-take-over", { instructionId: "cancel-2", target, takeoverInstructionId: "first" })).body).toMatchObject({ ok: false, code: "stale_target" });
  expect((await post("live/cancel-take-over", { instructionId: "cancel-3", target, takeoverInstructionId: "second" })).status).toBe(202);

  writeFileSync(done, "done"); await h.engine.settled();
  // The next command started with no denied call, and no takeover stop or "stopped" pause line was recorded for it.
  expect(hookCalls().some(call => call.event === "PreToolUse" && call.input.tool_input?.command === "echo next")).toBe(true);
  expect(deniedCommands()).toEqual([]);
  expect(h.events.filter(e => e.kind === "phase" && e.event === "paused")).toEqual([]);
  expect(h.engine.record.liveControl).toBeUndefined();
}, 120000);

darwin("refuses Cancel once the stop is recorded, prints the paused line once at the release, and reads Paused everywhere (AC-PAUSE-03 to AC-PAUSE-05)", async () => {
  await start([{ text: "Running the refund tests, then I'll wire store credit into the receipt email." }, { runUntil: { command: "npm test -- src/refunds", file: "$SANDBOX/release" } }, { text: "Answering the checkpoint." }, { bash: "echo after" }, { result: "" }]);
  const done = file("release");
  // What the record held each time the paused line printed: it prints when the pause completes, never at Claude's exit (PAUSE-009, AC-PAUSE-05).
  const releasedWhenPrinted: (string | undefined)[] = [];
  const push = h.events.push.bind(h.events);
  h.events.push = (...printed) => { for (const e of printed) if (e.kind === "phase" && e.event === "paused") releasedWhenPrinted.push(h.engine.record.liveControl?.takeover.releasedAt); return push(...printed); };
  await waitFor(() => !!h.engine.latestSession("1")?.runs.at(-1)?.live && Object.values(gateOf().operations).some(o => o.label?.input === "npm test -- src/refunds"));
  const target = await pressPauseNow("pause");
  expect(gateOf().held?.inFlight?.length).toBe(1);

  writeFileSync(done, "done");
  await waitFor(() => !!gateOf().stop);
  expect(gateOf().stop).toMatchObject({ by: "yield", operationId: h.engine.record.liveControl!.takeover.operationId });
  const refused = await post("live/cancel-take-over", { instructionId: "late-cancel", target, takeoverInstructionId: "pause" });
  expect(refused.status).toBe(409); expect(refused.body).toMatchObject({ ok: false, code: "already_paused", reason: "Kiln had already paused. Press Resume once it’s paused to carry on." });
  expect(h.engine.record.liveControl).toBeDefined();

  await h.engine.settled();
  // Claude's process has exited but the release may not be observed yet: no stopped line at the exit (PAUSE-009).
  expect(h.events.filter(e => e.kind === "phase" && e.event === "stopped")).toEqual([]);
  await waitForPaused();
  const view = pauseNow()!;
  expect(view).toMatchObject({ phase: "paused", stopped: true, lastCommand: { tool: "Bash", input: "npm test -- src/refunds" }, cancel: { available: false } });
  expect(view.releasedAt).toBe(h.engine.record.liveControl!.takeover.releasedAt);
  expect(view.lastSaid).toBe("Running the refund tests, then I'll wire store credit into the receipt email.");
  expect(pausedSentence(view)).toBe("Kiln stopped after npm test -- src/refunds finished. Nothing is running.");
  // The yielded turn ended before the later command; it was never run.
  expect(hookCalls().some(call => call.input.tool_input?.command === "echo after")).toBe(false);
  await h.engine.reconcileTakeover(); await h.engine.reconcileTakeover();
  const paused = h.events.filter(e => e.kind === "phase" && e.event === "paused");
  expect(paused).toHaveLength(1);
  expect(releasedWhenPrinted).toEqual([h.engine.record.liveControl!.takeover.releasedAt]);
  expect(h.events.filter(e => e.kind === "phase" && e.event === "stopped")).toEqual([]);

  // Snapshot: the command is offered from the release; the activity's state stays needs_you underneath.
  const snapshot = buildSnapshot(h.engine);
  expect(snapshot.feature.state).toBe("needs_you"); expect(snapshot.needsYou?.resumeCommand).toContain(target.sessionId);
  // `kiln pause` is refused once Claude has exited, naming Pause now.
  expect(h.engine.controlView().controls.find(c => c.name === "request-pause")).toMatchObject({ available: false, reason: "Phase 1 is pausing or paused, which offers no pause after." });
  // kiln run's summary and ● line after a restart (AC-PAUSE-05).
  const colors = terminalColors({ isTTY: false }, {});
  expect(formatSummaryLine(h.engine, colors)).toContain("paused in phase 1");
  expect(formatDecisionLine({ kind: "needs_you", phaseKey: "1", again: true }, h.engine, colors)).toContain("Paused in phase 1. Press Resume phase 1 to go on.");
  expect((h.engine as unknown as { describeStop(): { text: string; grey?: string } }).describeStop()).toEqual({ text: "Kiln stopped while paused in phase 1.", grey: "kiln run picks it back up." });
  // kiln status: "Paused.", the progress block's word, and the JSON state kept.
  const status = await cli(["status"]);
  expect(status.body.pause_status).toBe("Paused.");
  expect((status.body.progress as { key: string; state: string }[]).find(row => row.key === "1")?.state).toBe("needs_you");
  expect((status.body.live_control as { pauseNow?: { phase: string } }).pauseNow?.phase).toBe("paused");
  expect((status.body.live_control as { takeover?: { releasedAt?: string } }).takeover?.releasedAt).toBeDefined();
  const text = await cli(["status"], false);
  expect(text.output).toMatch(/1\s+Return intake\s+paused/);
  expect(text.output).not.toContain("needs you");

  // Opening Claude on the conversation is an obstacle on the paused page, never a return to pausing.
  const registry = join(h.env.CLAUDE_CONFIG_DIR!, "sessions", "open.json");
  writeFileSync(registry, JSON.stringify({ pid: process.pid, sessionId: target.providerSessionId, procStart: await processStartTime(process.pid) }));
  // A reconcile already in flight (the 1-second timer) may have read the registry before it was written: wait for one that sees it.
  await waitFor(async () => { await h.engine.reconcileTakeover(); return pauseNow()?.obstacle?.code === "terminal_in_use"; });
  expect(pauseNow()).toMatchObject({ phase: "paused", obstacle: { code: "terminal_in_use" } });
  expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toContain(target.sessionId);
  const recovery = buildSnapshot(h.engine).needsYou!.phaseRecovery!.target;
  const resume = await post("resume", { target: recovery });
  expect(resume.body, JSON.stringify(resume.body)).toMatchObject({ ok: false, reason: "Exit Claude in your terminal before handing this conversation back to Kiln." });
  const { unlinkSync } = await import("node:fs"); unlinkSync(registry);
  await waitFor(async () => { await h.engine.reconcileTakeover(); return pauseNow()?.obstacle === undefined; });
  expect(pauseNow()?.obstacle).toBeUndefined();
  expect(h.events.filter(e => e.kind === "phase" && e.event === "paused")).toHaveLength(1);

  // After the session split phase 1, the Pause now state names the leaf the running header names, not the launched key (AC-PAUSE-03, AC-PAUSE-05).
  const [launched, ...rest] = h.engine.record.plan!;
  const leaf = (id: string, title: string) => ({ id, title, file: `phase-${id}.md`, closed: false, repositories: launched!.repositories });
  h.engine.record.plan = [{ ...launched!, splitInto: ["1a", "1b"] }, leaf("1a", "Intake form"), leaf("1b", "Intake review"), ...rest];
  const split = buildSnapshot(h.engine);
  expect(split.feature.currentPhaseId).toBe("1a");
  expect(split.liveControl?.pauseNow).toMatchObject({ phase: "paused", activityKey: "1a", label: "phase 1a" });
  expect(split.liveControl?.pauseNow?.activityKey).toBe(split.feature.currentPhaseId);
  expect(formatSummaryLine(h.engine, colors)).toContain("paused in phase 1a");
  // kiln status's progress rows are keyed by the launched activity, and still read paused.
  expect((await cli(["status"], false)).output).toMatch(/1\s+Return intake\s+paused/);

  // A run an earlier Kiln saved without live control has no gate: the engine derives the gate-less card sentence (AC-PAUSE-05).
  const saved = h.engine.latestSession("1")!; delete saved.runs.at(-1)!.live; writeSessionRecord(h.stateDirectory, saved);
  const gateless = buildSnapshot(h.engine).liveControl!.pauseNow!;
  expect(gateless).toMatchObject({ phase: "paused", gateless: true });
  expect(pausedSentence(gateless)).toBe("The session ended on its own. Nothing is running.");
}, 120000);

darwin("shows the before-its-next-command row, then restores delivery recovery when a Pause now pressed from it is cancelled (AC-PAUSE-03, AC-PAUSE-04)", async () => {
  await start([{ touch: "$SANDBOX/ready" }, { waitForFile: "$SANDBOX/release" }, { bash: "echo next" }, { result: "Done." }]);
  const ready = file("ready"); const release = file("release");
  await waitFor(() => existsSync(ready));
  await waitFor(() => !!h.engine.liveView()?.available);
  const target = await pressPauseNow("idle-pause");
  expect(pausingRow(pauseNow()!)).toMatchObject({ kind: "before_next", lid: true });
  // An uncertain message on the attempt: a hold Cancel must give back (technical design, Cancel step 2).
  const receipt = h.engine.commands.all().find(r => r.command_id === "idle-pause")!;
  const uncertain: Receipt = { ...receipt, id: "uncertain-message", command_id: "uncertain-message", instruction: { ...receipt.instruction, command_id: "uncertain-message", action: "message", inputs: { target, text: "hello" } }, live_target: target, message: { text: "hello", uuid: "u-1", delivery: "uncertain", writeStartedAt: receipt.accepted_at }, state: "indeterminate", outcome: "delivery_uncertain", effects: { ...receipt.effects, message: "unknown" } };
  const receipts = h.engine.commands.all() as Receipt[];
  receipts.push(uncertain);
  const cancelled = await post("live/cancel-take-over", { instructionId: "idle-cancel", target, takeoverInstructionId: "idle-pause" });
  expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(202);
  expect(h.engine.record.liveControl?.takeover).toMatchObject({ kind: "delivery_recovery", operationId: "uncertain-message" });
  expect(pauseNow()).toBeUndefined();
  receipts.splice(receipts.indexOf(uncertain), 1);
  delete h.engine.record.liveControl;
  writeFileSync(release, "done"); await h.engine.settled();
  expect(deniedCommands()).toEqual([]);
}, 120000);

darwin("a cancel racing the gate's stop: whichever the gate critical section sees first wins, and a reading in flight applies nothing after a cancel", async () => {
  await start([{ touch: "$SANDBOX/ready" }, { waitForFile: "$SANDBOX/release" }, { result: "Done." }]);
  const ready = file("ready"); const release = file("release");
  await waitFor(() => existsSync(ready));
  await waitFor(() => !!h.engine.liveView()?.available);
  const directory = h.engine.latestSession("1")!.runs.at(-1)!.live!.gateDirectory;
  for (const by of ["deny", "yield", "seal"] as const) {
    const target = await pressPauseNow(`race-${by}`);
    // The gate acts first (a deny, a yield or a sealed input under the hold): Cancel is refused.
    await withGate(directory, state => { if (state.held && !state.stop) state.stop = { at: new Date().toISOString(), by, operationId: state.held.operationId }; });
    expect((await post("live/cancel-take-over", { instructionId: `race-${by}-cancel`, target, takeoverInstructionId: `race-${by}` })).body).toMatchObject({ code: "already_paused" });
    expect(pauseNow()).toMatchObject({ stopped: true, cancel: { available: false } });
    // Undo the simulated stop so the next order can run, then Cancel first: the gate no longer holds, so no hook can deny.
    await withGate(directory, state => { delete state.stop; });
    const reading = h.engine.reconcileTakeover();
    expect((await post("live/cancel-take-over", { instructionId: `race-${by}-cancel-first`, target, takeoverInstructionId: `race-${by}` })).status).toBe(202);
    await reading;
    expect(readGate(directory).held).toBeUndefined();
    expect(h.engine.record.liveControl).toBeUndefined();
  }
  writeFileSync(release, "done"); await h.engine.settled();
  // A cancel during an in-flight reading, then a normal exit, records no takeover stop and prints no paused or stopped-by-pause line.
  expect(h.events.filter(e => e.kind === "phase" && e.event === "paused")).toEqual([]);
}, 120000);

darwin("settles an unsettled cancel after a restart: a gate that no longer holds finishes the withdrawal, one that still holds keeps the pause", async () => {
  await start([{ touch: "$SANDBOX/ready" }, { waitForFile: "$SANDBOX/release" }, { result: "Done." }]);
  const ready = file("ready"); const release = file("release");
  await waitFor(() => existsSync(ready));
  await waitFor(() => !!h.engine.liveView()?.available);
  const target = h.engine.liveTarget()!;
  await waitFor(() => !h.engine.commands.busy);
  const take = h.engine.commands.submit({ command_id: "restart-pause", execution_id: target.executionId, status_token: JSON.stringify(target), action: "take-over", inputs: { target } });
  expect(take.ok, JSON.stringify(take)).toBe(true); await h.engine.commands.settled();
  const directory = h.engine.latestSession("1")!.runs.at(-1)!.live!.gateDirectory;
  // A crash between Cancel's two writes: the gate's hold is gone, the saved hold and an applying cancel receipt remain.
  await withGate(directory, state => { delete state.held; });
  const pending = (id: string): Receipt => {
    const base = h.engine.commands.lookup("restart-pause").operation as Receipt;
    return { ...base, id, command_id: id, sequence: base.sequence + 100, instruction: { command_id: id, execution_id: target.executionId, status_token: JSON.stringify(target), action: "cancel-take-over", inputs: { target, takeover_instruction_id: "restart-pause" } }, state: "in_progress", stage: "applying", outcome: null, reason: null };
  };
  const reconcile = (receipt: Receipt) => (h.engine as unknown as { reconcileControl(r: Receipt): Receipt | undefined }).reconcileControl(receipt);
  expect(reconcile(pending("crashed-cancel"))).toMatchObject({ state: "completed", outcome: "takeover_withdrawn", effects: { takeover: "withdrawn" } });
  expect(h.engine.record.liveControl).toBeUndefined();
  // A gate that still holds the take-over: the cancel never applied, and the pause continues.
  const again = h.engine.commands.submit({ command_id: "restart-pause-2", execution_id: target.executionId, status_token: JSON.stringify(target), action: "take-over", inputs: { target } });
  expect(again.ok).toBe(true); await h.engine.commands.settled();
  const second = { ...pending("held-cancel"), instruction: { ...pending("held-cancel").instruction, inputs: { target, takeover_instruction_id: "restart-pause-2" } } };
  expect(reconcile(second)).toMatchObject({ state: "failed", outcome: "not_applied" });
  expect(h.engine.record.liveControl?.takeover.instructionId).toBe("restart-pause-2");
  writeFileSync(release, "done"); await h.engine.settled();
}, 120000);

darwin("names a background Bash after the stop in the background row, not the command row, and leaves it out of the last command", async () => {
  await start([{ background: { command: "npm run dev", until: "$SANDBOX/server-stopped", result: "Started the dev server." } }, { touch: "$SANDBOX/ready" }, { result: "Done." }]);
  const server = file("server-stopped");
  // Claude's turn ended with only the background task left: the stop never comes on its own.
  await waitFor(() => !!h.engine.latestSession("1")?.runs.at(-1)?.live && !!gateOf().turnEndedAt && Object.values(gateOf().operations).some(o => o.backgrounded));
  await pressPauseNow("background-pause");
  const view = pauseNow()!;
  expect(view).toMatchObject({ phase: "pausing", stopped: false, running: [], background: [{ command: "npm run dev" }], cancel: { available: true } });
  expect(view.lastCommand).toBeUndefined();
  expect(pausingRow(view)).toMatchObject({ kind: "background", lines: ["npm run dev"], lid: false });
  writeFileSync(server, "stopped");
  await h.engine.settled();
  await waitForPaused();
  expect(pauseNow()?.background).toBeUndefined();
}, 120000);

darwin("records the real deny and seal stops and refuses Cancel after each, and keeps the status token while the pausing rows change (AC-PAUSE-04)", async () => {
  // Deny: Pause now while Claude runs no command; its next call is refused by the hook.
  await start([{ touch: "$SANDBOX/ready" }, { waitForFile: "$SANDBOX/release" }, { bash: "echo next" }, { result: "" }]);
  await waitFor(() => existsSync(file("ready")));
  await waitFor(() => !!h.engine.liveView()?.available);
  let target = await pressPauseNow("deny-pause");
  const token = h.engine.controlView().token;
  await h.engine.reconcileTakeover();
  expect(h.engine.controlView().token).toBe(token);
  writeFileSync(file("release"), "done");
  await waitFor(() => !!gateOf().stop);
  expect(gateOf().stop).toMatchObject({ by: "deny" });
  // The stand-in logs a hook call once the hook has answered, just after the gate write.
  await waitFor(() => deniedCommands().length > 0);
  expect(deniedCommands()).toEqual(["echo next"]);
  expect((await post("live/cancel-take-over", { instructionId: "deny-cancel", target, takeoverInstructionId: "deny-pause" })).body).toMatchObject({ code: "already_paused" });
  await h.engine.settled(); await waitForPaused();
  expect(pausedSentence(pauseNow()!)).toBe("Kiln stopped before Claude's next command. Nothing is running.");
  hosted?.release(); await hosted?.server.close(); hosted = undefined; await h.cleanup();

  // Seal: Pause now while Claude finishes its turn with nothing running; the drain seals its input under the hold.
  await start([{ touch: "$SANDBOX/ready" }, { waitForFile: "$SANDBOX/release" }, { text: "All done for now." }, { result: "Finished." }]);
  await waitFor(() => existsSync(file("ready")));
  await waitFor(() => !!h.engine.liveView()?.available);
  target = await pressPauseNow("seal-pause");
  writeFileSync(file("release"), "done");
  await waitFor(() => !!gateOf().stop);
  expect(gateOf().stop).toMatchObject({ by: "seal" });
  expect((await post("live/cancel-take-over", { instructionId: "seal-cancel", target, takeoverInstructionId: "seal-pause" })).body).toMatchObject({ code: "already_paused" });
  await h.engine.settled(); await waitForPaused();
  expect(pauseNow()?.lastSaid).toBe("All done for now.");
  // After the attempt ended, Cancel stays refused.
  expect((await post("live/cancel-take-over", { instructionId: "late-seal-cancel", target, takeoverInstructionId: "seal-pause" })).body).toMatchObject({ code: "already_paused" });
}, 180000);
