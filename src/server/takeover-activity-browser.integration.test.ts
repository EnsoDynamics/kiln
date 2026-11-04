// AC-TAKE-05: real engine, journal, Git, history, tracked process and built Chrome.
// The injected engine clock proves the elapsed-time display; provider safety remains
// qualified by live-takeover.mjs, not by this scripted provider subprocess.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildSnapshot } from "../engine/snapshot.js";
import { readGate, withGate, unsettled } from "../live/gate.js";
import { processStartTime } from "../platform/process-start-time.js";
import { sessionFiles } from "../session/claude-session.js";
import { findTranscripts } from "../session/transcripts.js";
import { appendJsonLine } from "../state/state-files.js";
import { createHarness, waitFor } from "../test-support/engine-harness.js";
import { launchChrome, type HeadlessChrome } from "../test-support/headless-chrome.js";
import { boundPort } from "../test-support/os-ports.js";
import { startLocalServer } from "./local-server.js";

let chrome: HeadlessChrome;
beforeAll(async () => { chrome = await launchChrome(); });
afterAll(async () => { await chrome?.close(); });

it.skipIf(process.platform !== "darwin").each([1200, 390])("preserves elapsed waiting through replay and restart with unresolved ownership at %i", async width => {
  let clock = Date.now();
  const h = await createHarness({ sessions: [], engineOptions: { now: () => new Date(clock) } });
  let controller: Awaited<ReturnType<typeof startLocalServer>> | undefined;
  let page: Awaited<ReturnType<HeadlessChrome["open"]>> | undefined;
  const release = join(h.sandbox.root, "release");
  const child = spawn(process.execPath, ["-e", "process.stdin.resume();process.stdin.on('end',()=>process.exit(0));"], { stdio: ["pipe", "ignore", "ignore"] });
  const exit = once(child, "exit");
  try {
    h.env.KILN_STANDIN_VERSION = "2.1.311";
    mkdirSync(join(h.env.CLAUDE_CONFIG_DIR!, "sessions"), { recursive: true });
    const ready = join(h.sandbox.root, "ready");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ text: "Current operation output retained" }, { touch: ready }, { waitForFile: release }, { result: "Yielded with unfinished work" }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => existsSync(ready));
    let port = 0;
    const serve = () => startLocalServer({ engine: h.engine, port, folderName: "customer-returns", featureName: "Returns", token: h.engine.record.token });
    controller = await serve(); port = boundPort(controller.address);
    const target = h.engine.liveTarget()!;
    const response = await fetch(new URL("/api/live/take-over", controller.address), { method: "POST", headers: { Origin: new URL(controller.address).origin, "X-Kiln-Token": h.engine.record.token, "Content-Type": "application/json" }, body: JSON.stringify({ instructionId: "activity-time", target }) });
    expect(response.status).toBe(202);
    const session = h.engine.latestSession("1")!;
    const directory = session.runs.at(-1)!.live!.gateDirectory;
    const startTime = await processStartTime(child.pid!);
    expect(startTime).toBeDefined();
    await withGate(directory, state => {
      state.tracked.push({ pid: child.pid!, startTime: startTime! });
    });
    // The admitted attempt exits naturally; retained work still prevents release.
    writeFileSync(release, "finish naturally"); await h.engine.settled();
    const streamAt = new Date(Math.max(Date.now(), Date.parse(readGate(directory).observedAt)) + 1000).toISOString();
    const activityAt = new Date(Date.parse(streamAt) + 1000).toISOString();
    await withGate(directory, state => {
      state.operations.blocker = { name: "Bash", admittedAt: streamAt, hookSettled: true };
      for (const id of ["stream", "history", "undated"]) state.operations[id] = { name: "Read", admittedAt: streamAt, hookSettled: true };
    });
    const result = (id: string) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: `${id} completed` }] } });
    appendJsonLine(sessionFiles(h.stateDirectory, session).events, { at: streamAt, event: result("stream") });
    const history = findTranscripts(h.env.CLAUDE_CONFIG_DIR!, session.sessionId).main!;
    appendJsonLine(history, { ...result("history"), timestamp: activityAt });
    appendJsonLine(history, result("undated"));
    clock = Date.parse(activityAt) + 29_000;
    for (let i = 0; i < 3; i++) await h.engine.reconcileTakeover();
    expect(unsettled(readGate(directory))).toEqual(["Bash blocker"]);
    expect(h.engine.record.liveControl!.takeover).toMatchObject({ state: "pending", latestActivityAt: activityAt, observedAt: new Date(clock).toISOString() });
    page = await chrome.open(controller.address, { width, height: 1000 });
    await page.waitFor(`document.body.innerText.includes('Bash blocker')`);
    expect(await page.evaluate("document.body.innerText")).not.toContain("seconds since the last observed activity");
    const assertWaiting = async () => {
      await page!.waitFor(`document.body.innerText.includes('Waiting 45 seconds since the last observed activity.')`);
      const text = await page!.evaluate<string>("document.body.innerText");
      expect(text).toContain("There is no automatic cancellation deadline.");
      expect(text).toContain("Wait before opening Claude");
      expect(text).toContain("Full session output");
      expect(text).toContain("Yielded with unfinished work");
      expect(await page!.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Copy resume command'))`)).toBe(false);
      expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toBeUndefined();
      expect(h.engine.record.phases["1"]!.doneAt).toBeUndefined();
      expect(h.claudeCalls()).toHaveLength(1);
      expect(await processStartTime(child.pid!)).toBe(startTime);
      expect(await page!.evaluate("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
    };
    clock = Date.parse(activityAt) + 45_000;
    for (let i = 0; i < 3; i++) await h.engine.reconcileTakeover();
    await assertWaiting();
    // Fresh dated history advances activity immediately and resets elapsed waiting.
    const freshAt = new Date(clock).toISOString();
    appendJsonLine(history, { ...result("blocker"), timestamp: freshAt });
    // The takeover's one-second timer may already be reading history; a call
    // joins that read, so only a later one is sure to see the appended result.
    for (let i = 0; i < 3; i++) await h.engine.reconcileTakeover();
    expect(unsettled(readGate(directory))).toEqual([]);
    expect(h.engine.record.liveControl!.takeover.latestActivityAt).toBe(freshAt);
    await page.waitFor(`!document.body.innerText.includes('seconds since the last observed activity')`);
    expect(h.engine.record.liveControl!.takeover.reason).toContain("still owns");
    clock += 45_000;
    await h.engine.reconcileTakeover(); await assertWaiting();
    // Restart reconstructs the same saved evidence without refreshing its activity time.
    await page.close(); page = undefined; await controller.close(); controller = undefined;
    h.engine = h.reopenFromDisk(); await h.engine.prepare();
    expect((await h.engine.decide()).kind).toBe("needs_you");
    for (let i = 0; i < 3; i++) await h.engine.reconcileTakeover();
    expect(h.engine.record.liveControl!.takeover.latestActivityAt).toBe(freshAt);
    controller = await serve();
    page = await chrome.open(controller.address, { width, height: 1000 });
    await assertWaiting();
    writeFileSync(`/tmp/kiln-takeover-activity-${width}.png`, await page.screenshot());
    expect(page.problems).toEqual([]);
    // No elapsed-time deadline signals the tracked child; only natural exit releases it.
    child.stdin!.end(); expect((await exit)[0]).toBe(0);
    await h.engine.reconcileTakeover();
    expect(h.engine.record.liveControl!.takeover.state).toBe("released");
    expect(buildSnapshot(h.engine).needsYou?.resumeCommand).toContain(target.sessionId);
    expect(h.claudeCalls()).toHaveLength(1);
  } finally {
    child.stdin!.end(); await exit;
    await page?.close(); await controller?.close();
    writeFileSync(release, "finish naturally"); await h.engine.settled(); await h.cleanup();
  }
});
