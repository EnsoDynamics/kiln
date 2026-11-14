// Reset's availability and its apply on a real engine (run restart AC-RESET-01, 02, 06; technical
// design "Reset", Availability): unavailable while a session works, with the reason the line
// shows, and the one control left while Folder missing is set, listed by `kiln status` with its token.

import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Receipt } from "../control/commands.js";
import { readWork } from "../control/private-state.js";
import { statusProjection } from "../control/projection.js";
import { stateRoot } from "../state/state-files.js";
import { readPrdRecord } from "../state/records.js";
import { createHarness, waitFor, type Harness } from "../test-support/engine-harness.js";

let h: Harness | undefined;
afterEach(async () => { await h?.cleanup(); h = undefined; });

const resetOf = (harness: Harness) => harness.engine.controlView().controls.find(control => control.name === "reset")!;

it("is unavailable while a session works, saying how to stop it, refused as a command, and available once the phase stops", async () => {
  const release = join(process.cwd(), `.reset-release-${process.pid}`);
  h = await createHarness({ sessions: [{ actions: [{ waitForFile: release }, { result: "Waiting for a decision." }] }] });
  try {
    expect(h.engine.resetControl()).toEqual({ available: false, reason: "Not started; there is nothing to reset." });
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h!.engine.current?.processRunning === true);
    // While the launch is being dispatched no pause is offered either; the page then offers Pause after.
    await waitFor(() => !!h!.engine.controlView().controls.find(control => control.name === "request-pause")?.available);
    // Pause & take over is named only where it is offered; Pause after is offered here.
    const live = h.engine.liveView();
    const takeOver = "Reset isn't available while a session is working. Stop it now with Pause & take over above, or pause after the current phase or audit and reset once it ends.";
    const pauseAfter = "Reset isn't available while a session is working. Pause after the current phase or audit and reset once it ends.";
    for (const [available, reason] of [[true, takeOver], [false, pauseAfter]] as const) {
      const offered = vi.spyOn(h.engine, "liveView").mockReturnValue({ ...(live ?? {}), available } as NonNullable<typeof live>);
      expect(h.engine.resetControl(), String(available)).toEqual({ available: false, reason });
      expect(resetOf(h), String(available)).toMatchObject({ available: false, reason });
      offered.mockRestore();
    }
    const expected = live?.available ? takeOver : pauseAfter;
    expect(resetOf(h)).toMatchObject({ available: false, reason: expected });
    expect(h.engine.resetControl().reason).toBe(expected);
    const view = h.engine.controlView();
    const refused = h.engine.commands.submit({ command_id: "reset-while-working", execution_id: h.engine.record.executionId!, status_token: view.token, action: "reset", inputs: {} }, "caller", true);
    expect(refused.ok).toBe(false);
    expect(refused.errors[0]).toMatchObject({ code: "control_unavailable", message: expected });
    // Kiln's own work between sessions (its checks, here) makes reset unavailable too, and the command is refused.
    const internals = h.engine as unknown as { checking: boolean };
    const current = h.engine.current!;
    current.processRunning = false; internals.checking = true;
    try {
      const ownWork = "Reset isn't available while Kiln is working. Pause after the current phase or audit and reset once it ends.";
      expect(h.engine.resetControl()).toEqual({ available: false, reason: ownWork });
      expect(resetOf(h)).toMatchObject({ available: false, reason: ownWork });
      const working = h.engine.commands.submit({ command_id: "reset-while-kiln-works", execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: "reset", inputs: {} }, "caller", true);
      expect(working.ok).toBe(false);
      expect(working.errors[0]).toMatchObject({ code: "control_unavailable", message: ownWork });
    } finally { current.processRunning = true; internals.checking = false; }
    // Once a pause is requested, Pause after is no longer offered: the line waits for the session to end.
    expect(h.engine.pause().ok).toBe(true);
    expect(resetOf(h).reason).toBe("A session is still running. Reset becomes available when it ends.");
    writeFileSync(release, "");
    await waitFor(() => h!.engine.current?.processRunning !== true);
    await h.engine.settled();
    await waitFor(() => resetOf(h!).available);
    expect(readPrdRecord(h.stateDirectory)!.startedAt).toBeDefined();
    // With the phase stopped and nothing to pause after, Kiln's own work still makes reset wait, and refuses the command.
    internals.checking = true;
    try {
      const stillWorking = "Kiln is still working. Reset becomes available when that work ends.";
      expect(h.engine.resetControl()).toEqual({ available: false, reason: stillWorking });
      expect(resetOf(h)).toMatchObject({ available: false, reason: stillWorking });
      const refusedAtStop = h.engine.commands.submit({ command_id: "reset-while-checking", execution_id: h.engine.record.executionId!, status_token: h.engine.controlView().token, action: "reset", inputs: {} }, "caller", true);
      expect(refusedAtStop.ok).toBe(false);
      expect(refusedAtStop.errors[0]).toMatchObject({ code: "control_unavailable", message: stillWorking });
    } finally { internals.checking = false; }
    expect(resetOf(h)).toMatchObject({ available: true });
  } finally { rmSync(release, { force: true }); }
}, 60_000);

it("is the one control left while Folder missing is set: kiln status lists it with the status token, and the journal admits it", async () => {
  h = await createHarness({ sessions: [{ actions: [{ result: "Waiting for a decision." }] }] });
  await h.engine.start({ refinementConfirmed: true });
  await h.engine.settled();
  const before = h.engine.record.executionId!;
  rmSync(h.engine.record.repositories[0]!.worktreePath, { recursive: true, force: true });
  await h.engine.folderGuard();
  expect(h.engine.folderMissing).toBeDefined();
  expect(resetOf(h)).toMatchObject({ available: true, reason: null });
  const status = statusProjection(readWork(stateRoot(h.env), h.stateDirectory), h.engine);
  const data = status as unknown as { state: string; status_token: string | null; controls: { name: string; available: boolean; reason: string | null }[] };
  expect(data.state).toBe("folder_missing");
  expect(data.status_token).toBe(h.engine.controlView().token);
  expect(data.controls.find(control => control.name === "reset")).toMatchObject({ available: true });
  expect(data.controls.filter(control => control.name !== "reset").every(control => !control.available && control.reason === "This run’s folder is missing; set the run up again with kiln run.")).toBe(true);
  const answer = h.engine.commands.submit({ command_id: "reset-folder-missing", execution_id: before, status_token: h.engine.controlView().token, action: "reset", inputs: {} }, "caller", true);
  expect(answer.ok).toBe(true);
  await h.engine.commands.settled();
  expect(await h.engine.resetOutcome).toMatchObject({ ok: true });
  expect(h.engine.commands.lookup("reset-folder-missing").operation as Receipt).toMatchObject({ state: "completed", outcome: "reset" });
  const record = readPrdRecord(h.stateDirectory)!;
  expect(record.startedAt).toBeUndefined();
  expect(record.executionId).not.toBe(before);
  // Nothing in git is recreated or removed: the missing folder stays missing.
  expect(existsSync(h.engine.record.repositories[0]!.worktreePath)).toBe(false);
}, 60_000);
