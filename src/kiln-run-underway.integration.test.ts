// `kiln run` on a feature already underway, as a person runs it: it re-checks a stop and carries
// on, says a PRD is already running, and shows a completed feature from its record, staying in
// the foreground with its browser view served until Ctrl+C (AC-KEEP-01).

import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runKilnCommand } from "./kiln-command.js";
import { endProcessTree } from "./platform/helper-process.js";
import { isProcessLive } from "./platform/process-start-time.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "./test-support/engine-harness.js";
import { git } from "./test-support/git-repositories.js";
import { readPrdRecord } from "./state/records.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");
let harness: Harness | undefined;
afterEach(() => harness?.cleanup());

function kilnEnv(h: Harness): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(h.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  return { ...env, PATH: [join(h.sandbox.root, "bin"), h.env.PATH ?? h.env.Path ?? ""].join(delimiter), KILN_NO_BROWSER: "1", KILN_PORT_RANGE: "41140-41159" };
}

/**
 * A runner whose logind refuses keep-awake (Linux CI) adds Kiln's one honest error line for it;
 * these tests are about the other lines, so it is left out of what they compare.
 */
const withoutKeepAwakeError = (stdout: string) =>
  stdout
    .split("\n")
    .filter((line) => !line.startsWith("✗ Can’t keep this computer awake"))
    .join("\n");

function kilnRun(h: Harness) {
  const result = spawnSync(process.execPath, [cli, "run", "docs/prds/customer-returns"], { cwd: h.repository, env: kilnEnv(h), encoding: "utf8", timeout: 50_000 });
  return { exitCode: result.status, stdout: withoutKeepAwakeError(result.stdout), stderr: result.stderr };
}

/**
 * `kiln run` in this process until its output shows `until`, then Ctrl+C, as a person stops a
 * Kiln that would otherwise stay in the foreground. The stop's own line is the output's last.
 */
async function kilnRunUntil(h: Harness, until: (stdout: string) => boolean, whileRunning?: (rawStdout: () => string) => Promise<void>) {
  let stdout = "";
  let stderr = "";
  const signals = new EventEmitter();
  /** Each browser open: the address, and how many sessions had been launched by then. */
  const opened: { address: string; claudeCalls: number }[] = [];
  const done = runKilnCommand(["run", "docs/prds/customer-returns"], {
    cwd: h.repository,
    env: kilnEnv(h),
    stdout: { write: (text: string) => (stdout += text) },
    stderr: { write: (text: string) => (stderr += text) },
    signals,
    openBrowser: async (address) => {
      opened.push({ address, claudeCalls: h.claudeCalls().length });
      return undefined;
    },
  });
  let ended = false;
  void done.then(() => (ended = true));
  let exitCode: number;
  try {
    await waitFor(() => ended || until(withoutKeepAwakeError(stdout)), 40_000);
    expect(until(withoutKeepAwakeError(stdout)), `kiln run ended before its output showed what the test waits for:\n${stdout}${stderr}`).toBe(true);
    // What Kiln does next settles before the stop, so the stop's line says where it waits.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await whileRunning?.(() => stdout);
  } finally {
    // An assertion or callback timeout must not leave this separate CLI engine/server
    // running: the harness owns the original engine, not the one runKilnCommand made.
    signals.emit("SIGINT");
    exitCode = await done;
  }
  return { exitCode, stdout: withoutKeepAwakeError(stdout), stderr, opened };
}

const time = String.raw`[ \d]\d:\d\d`;
const opened = String.raw` Opened http://127\.0\.0\.1:\d+/customer-returns`;

describe("kiln run on a feature underway", () => {
  it("closes its test CLI server even when the browser callback fails", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ result: "Waiting for a decision." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const calls = h.claudeCalls();
    let address: string | undefined;
    await expect(kilnRunUntil(h, stdout => / Opened http/.test(stdout), async stdout => {
      address = /Opened (\S+)/.exec(stdout())![1]!;
      throw new Error("Browser callback failed.");
    })).rejects.toThrow("Browser callback failed.");
    expect(address).toBeDefined();
    await expect(fetch(address!)).rejects.toThrow();
    expect(h.claudeCalls()).toEqual(calls);
  });
  it("checks a stopped phase again, and carries on with the next phase once the person has finished it", async () => {
    harness = await createHarness({
      sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Done." }] }, landingSession("src/b.txt"), { actions: [{ result: "I need a decision on the dashboard's columns." }] }],
    });
    const h = harness;
    // Settings chosen before Start are kept for the PRD: a later kiln run starts its sessions with them (AC-START-06).
    expect(await h.engine.changeSettings({ agentId: "claude_code", selectionGeneration: 0, model: "sonnet", effort: "max" })).toEqual({ ok: true });
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop).toBeDefined();

    // Nothing changed yet: it still needs the person, and nothing starts (AC-STOP-08).
    // While it waits at Needs you, its browser view and event stream are served (AC-VIEW-05).
    let servedAtNeedsYou: { page: number; state?: string } | undefined;
    const still = await kilnRunUntil(
      h,
      (stdout) => stdout.includes("● Phase 1 still needs you."),
      async (stdout) => {
        const address = /Opened (\S+)/.exec(stdout())![1]!;
        const page = (await fetch(address)).status;
        const abort = new AbortController();
        const events = await fetch(`${new URL(address).origin}/api/events?token=${h.engine.record.token}`, { signal: abort.signal });
        const reader = events.body!.pipeThrough(new TextDecoderStream()).getReader();
        let text = "";
        while (!/^event: snapshot\ndata: .*$/m.test(text)) text += (await reader.read()).value ?? "";
        abort.abort();
        servedAtNeedsYou = { page, state: JSON.parse(/^event: snapshot\ndata: (.*)$/m.exec(text)![1]!).feature.state };
      },
    );
    expect(servedAtNeedsYou).toEqual({ page: 200, state: "needs_you" });
    const stillLines = still.stdout.trimEnd().split("\n");
    expect(stillLines[0]).toBe("Customer returns  ·  2 of 4 phases done  ·  phase 1 needs you");
    expect(stillLines[1]).toMatch(new RegExp(`^● Phase 1 still needs you\\.${opened}$`));
    expect(stillLines.at(-1)).toBe("Kiln stopped. Phase 1 still needs you; kiln run checks it again.");
    expect(h.claudeCalls()).toHaveLength(1);

    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    // A feature underway skips the start checks (AC-START-02): the main checkout's own changes and a missing design don't stop it.
    writeFileSync(join(h.repository, "scratch.txt"), "the person's own work\n");
    rmSync(join(h.repository, "docs", "prds", "customer-returns", "technical-design.md"));
    const result = await kilnRunUntil(h, (stdout) => stdout.includes("Returns dashboard  stopped"));
    expect(result.stderr).toBe("");
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toBe("Customer returns  ·  2 of 4 phases done  ·  phase 1 needs you");
    expect(lines[1]).toMatch(new RegExp(`^● Phase 1 is done, finished by you\\. Starting phase 2b, Store credit\\.${opened}$`));
    expect(lines[2]).toMatch(new RegExp(`^${time}  2b  Store credit       started$`));
    expect(lines[3]).toMatch(new RegExp(`^${time}  2b  Store credit       done · pushed [0-9a-f]{7}$`));
    expect(lines[4]).toMatch(new RegExp(`^${time}  3   Returns dashboard  started$`));
    expect(lines[5]).toMatch(new RegExp(`^${time}  3   Returns dashboard  stopped$`));
    // Kiln waited at Needs you in the foreground until Ctrl+C (AC-KEEP-01).
    expect(lines[6]).toBe("Kiln stopped. Phase 3 still needs you; kiln run checks it again.");
    expect(lines).toHaveLength(7);
    expect(result.exitCode).toBe(130);
    expect(h.claudeCalls()).toHaveLength(3);
    for (const call of h.claudeCalls().slice(1)) expect(call.args.join(" ")).toContain("--model sonnet --effort max");
    // The browser opened on the address the ● line gives, before the next phase's session spawned (AC-START-03).
    expect(result.opened).toEqual([{ address: /Opened (\S+)$/.exec(lines[1]!)![1], claudeCalls: 1 }]);
  });

  it("says the PRD is already running, with its address, and starts nothing, while another kiln run holds it", async () => {
    harness = await createHarness({ sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Done." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ result: "unused" }] }, { actions: [{ waitForFile: release }, { result: "Stopping." }] }] }));

    const holder = spawn(process.execPath, [cli, "run", "docs/prds/customer-returns"], { cwd: h.repository, env: kilnEnv(h), stdio: "ignore" });
    const exited = new Promise((resolve) => holder.once("exit", resolve));
    let holderAddress: string | undefined;
    const deadline = Date.now() + 30_000;
    while (h.claudeCalls().length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(h.claudeCalls()).toHaveLength(2);

    try {
      const second = kilnRun(h);
      expect(second.stdout).toMatch(/^Customer returns is already running at http:\/\/127\.0\.0\.1:\d+\/customer-returns\n$/);
      expect(second.exitCode).toBe(1);
      expect(h.claudeCalls()).toHaveLength(2);
      holderAddress = /at (\S+)\n/.exec(second.stdout)![1];
      // The address it gives is the holder's own browser view.
      expect((await fetch(holderAddress!)).status).toBe(200);
    } finally {
      writeFileSync(release, "");
      // The holder stays in the foreground at Needs you; it is stopped as a person would.
      // On Windows a kill ends only Kiln's own process, so its children are ended with it.
      if (process.platform === "win32") endProcessTree(holder.pid, "SIGTERM");
      else holder.kill("SIGINT");
      await exited;
    }
  });

  it("serves its view on a paused feature, where Start carries on (AC-VIEW-05, AC-VIEW-02)", async () => {
    harness = await createHarness({ sessions: [] });
    const h = harness;
    const release = join(h.sandbox.root, "release");
    writeFileSync(h.scenarioPath, JSON.stringify({ sessions: [{ actions: [{ waitForFile: release }, ...landingSession().actions] }, { actions: [{ result: "Stopping here." }] }] }));
    await h.engine.start({ refinementConfirmed: true });
    await waitFor(() => h.claudeCalls().length === 1);
    h.engine.pause();
    writeFileSync(release, "");
    await h.engine.settled();
    expect(h.engine.record.pause.activeSince).toBeDefined();

    let served: { page: number; state?: string; start: number } | undefined;
    await kilnRunUntil(
      h,
      (stdout) => / Opened http/.test(stdout),
      async (stdout) => {
        const address = /Opened (\S+)/.exec(stdout())![1]!;
        const origin = new URL(address).origin;
        const page = (await fetch(address)).status;
        const abort = new AbortController();
        const events = await fetch(`${origin}/api/events?token=${h.engine.record.token}`, { signal: abort.signal });
        const reader = events.body!.pipeThrough(new TextDecoderStream()).getReader();
        let text = "";
        while (!/^event: snapshot\ndata: .*$/m.test(text)) text += (await reader.read()).value ?? "";
        abort.abort();
        const state = JSON.parse(/^event: snapshot\ndata: (.*)$/m.exec(text)![1]!).feature.state;
        const start = (await fetch(`${origin}/api/start`, { method: "POST", headers: { "X-Kiln-Token": h.engine.record.token, Origin: origin } })).status;
        await waitFor(() => h.claudeCalls().length === 2);
        served = { page, state, start };
      },
    );
    expect(served).toEqual({ page: 200, state: "paused", start: 200 });
    expect(h.claudeCalls()[1]!.prompt).toContain("phase-2b-store-credit.md");
  });

  it("shows a completed feature and automatically backfills delivery history without starting a session", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), pullRequestSession(218)] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const ghCalls = h.ghCalls().length;
    const modelCalls = h.claudeCalls().length;
    const completedAt = h.engine.record.completedAt;
    const pullRequests = structuredClone(h.engine.record.pullRequests);
    const result = await kilnRunUntil(h, (stdout) => stdout.includes("ready for review"), async () => {
      await waitFor(() => readPrdRecord(h.stateDirectory)?.deliveryHistory !== undefined, 10_000);
      const record = readPrdRecord(h.stateDirectory)!;
      expect(record.completedAt).toBe(completedAt);
      expect(record.pullRequests).toEqual(pullRequests);
      expect(record.deliveryHistory?.repositories[0]?.workCommitCount).toBe(3);
    });
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toBe("Customer returns  ·  4 of 4 phases done  ·  complete");
    expect(lines[1]).toMatch(new RegExp(`^● Pull request #218 is ready for review\\.${opened}$`));
    expect(lines[2]).toBe("Kiln stopped. Customer returns is complete.");
    expect(result.exitCode).toBe(130);
    expect(h.claudeCalls()).toHaveLength(modelCalls);
    expect(h.ghCalls().slice(ghCalls)).toHaveLength(3);
    expect(h.ghCalls().slice(ghCalls).every(args => args[0] === "api" && args.some(arg => arg.includes("/commits/") && arg.endsWith("/pulls?per_page=100")))).toBe(true);
  });
});

describe("kiln run on a feature waiting for usage (usage-limit recovery AC-AUTO-03, AC-LIMIT-05)", () => {
  it("says it is waiting, starts the wait again with a fresh reading, and resumes the session once the account has usage left", async () => {
    const reset = Math.floor(Date.now() / 1000) + 3_600;
    harness = await createHarness({
      sessions: [{ actions: [{ text: "Building the intake form." }, { refuse: { rateLimitType: "five_hour", resetsAt: reset } }, { exit: 1 }] }, landingSession("src/intake.txt")],
    });
    const h = harness;
    // The first kiln run had no account reader: the wait was recorded, and Kiln was stopped.
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.waitingPhaseKey()).toBe("1");
    h.engine.close();

    // The stand-in's /usage shows the 5-hour window at 5%: the restarted wait's reading has usage left.
    const result = await kilnRunUntil(h, (stdout) => /Return intake +done/.test(stdout));
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toMatch(/^Customer returns {2}· {2}\d of 4 phases done {2}· {2}phase 1 is waiting for usage$/);
    expect(lines[1]).toMatch(new RegExp(`^● Phase 1 is waiting for usage \\(5-hour window, resets \\d{1,2}:\\d\\d [AP]M\\)\\.${opened}$`));
    expect(lines[2]).toMatch(new RegExp(`^${time}  1   Return intake      resumed$`));
    expect(lines[3]).toMatch(new RegExp(`^${time}  1   Return intake      done · pushed [0-9a-f]{7}$`));
    const runs = h.engine.latestSession("1")!.runs;
    expect(h.claudeCalls()[1]!.args).toContain("--resume");
    expect(h.claudeCalls()[1]!.prompt).toContain("because Claude Code's usage limit (the 5-hour usage limit) refused its request.");
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ cause: "limit_resume", account: { email: "alex@acme-shop.dev" } });
  });
});

describe("Ctrl+C and a closed terminal", () => {
  /** Phase 1 finished by the person, so the next kiln run starts phase 2b, whose session works until interrupted. */
  async function underwayAtPhase2b(working: (h: Harness) => string) {
    harness = await createHarness({ sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Done." }] }] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
    writeFileSync(
      h.scenarioPath,
      JSON.stringify({
        sessions: [
          { actions: [{ result: "unused" }] },
          { actions: [{ write: { path: "src/credit.txt", content: "half\n" } }, { touch: working(h) }, { work: "npm test" }] },
          landingSession("src/credit.txt"),
        ],
      }),
    );
    return h;
  }

  // macOS and Linux: Windows's hold is a PowerShell process with no command line to find it by.
  it.skipIf(process.platform === "win32")("keeps the computer awake while a phase's session works, and lets it sleep once Kiln stops (AC-KEEP-06)", async () => {
    const h = await underwayAtPhase2b((harness) => join(harness.sandbox.root, "working"));
    // Kiln's own hold, tied to this process: `caffeinate -i -w <pid>` on macOS, a wait on the pid under systemd-inhibit or gnome-session-inhibit on Linux.
    const held = () => spawnSync("pgrep", ["-f", process.platform === "darwin" ? `caffeinate -i -w ${process.pid}$` : `while kill -0 ${process.pid} 2>`]).status === 0;
    expect(held()).toBe(false);
    let whileWorking: { held: boolean; saidItCant: boolean } | undefined;
    await kilnRunUntil(
      h,
      () => existsSync(join(h.sandbox.root, "working")),
      async (stdout) => {
        // Linux runners whose logind refuses the hold get Kiln's line saying so instead.
        whileWorking = { held: held(), saidItCant: stdout().includes("✗ Can’t keep this computer awake") };
      },
    );
    expect(whileWorking!.held || whileWorking!.saidItCant).toBe(true);
    if (process.platform === "darwin") expect(whileWorking!.held).toBe(true);
    await waitFor(() => !held(), 10_000);
  });

  it.skipIf(process.platform === "win32")("interrupts the phase in progress, prints the drawn line and exits; the next kiln run resumes that session", async () => {
    // A terminal's Ctrl+C sends SIGINT to its foreground process group: Kiln, but not the
    // session, which Kiln spawned in its own group.
    const working = (h: Harness) => join(h.sandbox.root, "working");
    const h = await underwayAtPhase2b(working);
    const kiln = spawn(process.execPath, [cli, "run", "docs/prds/customer-returns"], { cwd: h.repository, env: kilnEnv(h), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    kiln.stdout!.setEncoding("utf8").on("data", (text: string) => (stdout += text));
    const exited = new Promise<number | null>((resolve) => kiln.once("exit", (code) => resolve(code)));
    await waitFor(() => existsSync(working(h)));
    kiln.kill("SIGINT");
    expect(await exited).toBe(130);

    // A runner whose logind refuses keep-awake adds its one error line, which this test isn't about.
    const lines = withoutKeepAwakeError(stdout).trimEnd().split("\n");
    expect(lines[1]).toMatch(new RegExp(`^● Phase 1 is done, finished by you\\. Starting phase 2b, Store credit\\.${opened}$`));
    expect(lines[2]).toMatch(new RegExp(`^${time}  2b  Store credit       started$`));
    expect(lines.at(-1)).toBe("Interrupted phase 2b, Store credit. Its session and uncommitted work are kept.");
    expect(lines).toHaveLength(4);
    const session = h.reopenFromDisk().latestSession("2b")!;
    const run = session.runs[0]!;
    expect(run).toMatchObject({ interruptedBy: "sigint", endedAt: expect.any(String) });
    expect(await isProcessLive(run.pid!, run.processStartTime)).toBe(false);

    const result = await kilnRunUntil(h, (stdout) => stdout.includes("Store credit       done"));
    const next = result.stdout.trimEnd().split("\n");
    expect(next[0]).toBe("Customer returns  ·  2 of 4 phases done  ·  phase 2b was interrupted");
    expect(next[1]).toMatch(new RegExp(`^● Resuming phase 2b’s session ${session.sessionId.slice(0, 8)}\\.${opened}$`));
    expect(next[2]).toMatch(new RegExp(`^${time}  2b  Store credit       resumed$`));
    expect(next[3]).toMatch(new RegExp(`^${time}  2b  Store credit       done · pushed [0-9a-f]{7}$`));
    expect(h.claudeCalls()[2]!.args).toContain("--resume");
  });

  /** Runs kiln run in this process, sending it `signal` once phase 2b's session is working. */
  async function runAndSignal(h: Harness, working: string, signal: NodeJS.Signals) {
    const signals = new EventEmitter();
    let stdout = "";
    let finished: number | undefined;
    const done = runKilnCommand(["run", "docs/prds/customer-returns"], {
      cwd: h.repository,
      env: kilnEnv(h),
      stdout: { write: (text: string) => (stdout += text) },
      stderr: { write: (text: string) => (stdout += text) },
      signals,
    }).then((code) => (finished = code));
    // A kiln run that ends before the session works says why, rather than leaving a bare timeout.
    await waitFor(() => {
      if (finished !== undefined) throw new Error(`kiln run ended with ${finished} before the session worked:\n${stdout}`);
      return existsSync(working);
    });
    signals.emit(signal);
    return { code: await done, stdout };
  }

  it("stops the same way wherever the signal comes from, on every platform", async () => {
    const working = (h: Harness) => join(h.sandbox.root, "working");
    const h = await underwayAtPhase2b(working);
    const result = await runAndSignal(h, working(h), "SIGINT");
    expect(result.code).toBe(130);
    expect(withoutKeepAwakeError(result.stdout).trimEnd().split("\n").at(-1)).toBe("Interrupted phase 2b, Store credit. Its session and uncommitted work are kept.");
    const run = h.reopenFromDisk().latestSession("2b")!.runs[0]!;
    expect(run.interruptedBy).toBe("sigint");
    expect(await isProcessLive(run.pid!, run.processStartTime)).toBe(false);
  });

  it("prints nothing when the terminal closed, and records it as the cause", async () => {
    const working = (h: Harness) => join(h.sandbox.root, "working");
    const h = await underwayAtPhase2b(working);
    const result = await runAndSignal(h, working(h), "SIGHUP");
    expect(result.code).toBe(129);
    expect(result.stdout).not.toContain("Interrupted");
    expect(h.reopenFromDisk().latestSession("2b")!.runs[0]!.interruptedBy).toBe("sighup");
  });
});
