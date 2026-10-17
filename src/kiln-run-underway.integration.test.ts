// `kiln run` on a feature already underway, as a person runs it: it re-checks a stop and carries
// on, says a PRD is already running, and shows a completed feature from its record, staying in
// the foreground with its browser view served until Ctrl+C (AC-KEEP-01).

import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runKilnCommand } from "./kiln-command.js";
import { isProcessLive } from "./platform/process-start-time.js";
import { createHarness, landingSession, pullRequestSession, waitFor, type Harness } from "./test-support/engine-harness.js";
import { git } from "./test-support/git-repositories.js";

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
async function kilnRunUntil(h: Harness, until: (stdout: string) => boolean) {
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
  await waitFor(() => until(withoutKeepAwakeError(stdout)), 40_000);
  // What Kiln does next settles before the stop, so the stop's line says where it waits.
  await new Promise((resolve) => setTimeout(resolve, 200));
  signals.emit("SIGINT");
  const exitCode = await done;
  return { exitCode, stdout: withoutKeepAwakeError(stdout), stderr, opened };
}

const time = String.raw`[ \d]\d:\d\d`;
const opened = String.raw` Opened http://127\.0\.0\.1:\d+/customer-returns`;

describe("kiln run on a feature underway", () => {
  it("checks a stopped phase again, and carries on with the next phase once the person has finished it", async () => {
    harness = await createHarness({
      sessions: [{ actions: [{ close: true }, { commit: "feat: intake" }, { result: "Done." }] }, landingSession("src/b.txt"), { actions: [{ result: "I need a decision on the dashboard's columns." }] }],
    });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    expect(h.engine.record.phases["1"]!.stop).toBeDefined();

    // Nothing changed yet: it still needs the person, and nothing starts (AC-STOP-08).
    const still = await kilnRunUntil(h, (stdout) => stdout.includes("● Phase 1 still needs you."));
    const stillLines = still.stdout.trimEnd().split("\n");
    expect(stillLines[0]).toBe("Customer returns  ·  2 of 4 phases done  ·  phase 1 needs you");
    expect(stillLines[1]).toMatch(new RegExp(`^● Phase 1 still needs you\\.${opened}$`));
    expect(stillLines.at(-1)).toBe("Kiln stopped. Phase 1 still needs you; kiln run checks it again.");
    expect(h.claudeCalls()).toHaveLength(1);

    git(h.sandbox, h.engine.worktreePath, "push", "-q", "-u", "origin", "feature/customer-returns");
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
      holder.kill(process.platform === "win32" ? undefined : "SIGINT");
      await exited;
    }
  });

  it("shows a completed feature from its record alone", async () => {
    harness = await createHarness({ sessions: [landingSession("a"), landingSession("b"), landingSession("c"), pullRequestSession(218)] });
    const h = harness;
    await h.engine.start({ refinementConfirmed: true });
    await h.engine.settled();
    const ghCalls = h.ghCalls().length;
    const result = await kilnRunUntil(h, (stdout) => stdout.includes("ready for review"));
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines[0]).toBe("Customer returns  ·  4 of 4 phases done  ·  complete");
    expect(lines[1]).toMatch(new RegExp(`^● Pull request #218 is ready for review\\.${opened}$`));
    expect(lines[2]).toBe("Kiln stopped. Customer returns is complete.");
    expect(result.exitCode).toBe(130);
    expect(h.ghCalls()).toHaveLength(ghCalls);
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
