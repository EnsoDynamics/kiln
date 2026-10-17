import { mkdtempSync, realpathSync, rmSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findExecutable, runHelper, STOPPING_FAILURE } from "./helper-process.js";

const root = realpathSync.native(mkdtempSync(join(tmpdir(), "kiln-helper-")));
// Windows holds a folder while a process killed in it is still exiting, so removal retries.
afterAll(() => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

describe("findExecutable", () => {
  it("finds the first match on the PATH and nothing for a name that isn't there", () => {
    const first = join(root, "first");
    const second = join(root, "second");
    mkdirSync(first);
    mkdirSync(second);
    const fileName = process.platform === "win32" ? "tool.cmd" : "tool";
    // npm puts an extensionless shell script beside claude.cmd; Windows must not pick it.
    if (process.platform === "win32") writeFileSync(join(first, "tool"), "");
    for (const directory of [first, second]) {
      writeFileSync(join(directory, fileName), "");
      if (process.platform !== "win32") chmodSync(join(directory, fileName), 0o755);
    }
    const env = { PATH: [join(root, "missing"), first, second].join(delimiter), PATHEXT: ".EXE;.cmd" };
    expect(findExecutable("tool", env)).toBe(join(first, fileName));
    expect(findExecutable("absent", env)).toBeUndefined();
  });

  it.skipIf(process.platform === "win32")("skips a file that isn't executable", () => {
    const directory = join(root, "not-executable");
    mkdirSync(directory);
    writeFileSync(join(directory, "plain"), "");
    expect(findExecutable("plain", { PATH: directory })).toBeUndefined();
  });
});

describe("runHelper", () => {
  const node = process.execPath;

  it("returns exit code and output, with stdin closed and terminal prompts off", async () => {
    const script = "process.stdin.resume(); process.stdin.on('end', () => { console.log(process.env.GIT_TERMINAL_PROMPT); console.error('err'); process.exit(3); });";
    const result = await runHelper(node, ["-e", script], { cwd: root });
    expect(result).toEqual({ exitCode: 3, stdout: "0\n", stderr: "err\n" });
  });

  it("ends a call that runs past its timeout and reports the timeout as its failure", async () => {
    const started = Date.now();
    const result = await runHelper(node, ["-e", "setTimeout(() => {}, 30000)"], { cwd: tmpdir(), timeoutMs: 300 });
    expect(result.exitCode).toBeNull();
    expect(result.failure).toBe("timed out after 0.3 seconds");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("reports an executable that can't be started", async () => {
    const result = await runHelper(join(root, "no-such-program"), [], { cwd: root });
    expect(result.exitCode).toBeNull();
    expect(result.failure).toMatch(/ENOENT/);
  });
});

describe("a helper call when Kiln stops", () => {
  const node = process.execPath;

  it("fails at once when the stop has already begun, and ends a running call, reading as the stop's result", async () => {
    const stopped = new AbortController();
    stopped.abort();
    expect(await runHelper(node, ["-e", "process.exit(0)"], { cwd: root, signal: stopped.signal })).toMatchObject({ exitCode: null, failure: STOPPING_FAILURE });

    const stopping = new AbortController();
    const began = Date.now();
    const running = runHelper(node, ["-e", "setTimeout(() => {}, 30000)"], { cwd: root, signal: stopping.signal });
    setTimeout(() => stopping.abort(), 200);
    expect(await running).toMatchObject({ exitCode: null, failure: STOPPING_FAILURE });
    expect(Date.now() - began).toBeLessThan(5_000);
  });

  it("reads a call the Ctrl+C ended before Kiln's handler ran as the stop's, on Windows, where the call shares Kiln's console", async () => {
    // The console's Ctrl+C ends the call (exit 130 here) a moment before Kiln's handler aborts.
    const stopping = new AbortController();
    const result = runHelper(node, ["-e", "process.exit(130)"], { cwd: root, signal: stopping.signal });
    setTimeout(() => stopping.abort(), 400);
    if (process.platform === "win32") expect(await result).toMatchObject({ exitCode: null, failure: STOPPING_FAILURE });
    // On macOS and Linux the call is in its own process group, so a Ctrl+C never reaches it: an exit is its own.
    else expect(await result).toMatchObject({ exitCode: 130 });
  });
});

