// The stand-in itself: a test run killed before its cleanup must leave no stand-in behind.
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSandbox, installStandIns } from "./git-repositories.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map(close => close())); });
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe("the stand-in claude's lifetime", () => {
  it.skipIf(process.platform === "win32")("gives up waiting once the Kiln that launched it is gone, though the sandbox remains", async () => {
    const sandbox = createSandbox(); cleanups.push(() => sandbox.cleanup());
    const { claude } = installStandIns(join(sandbox.root, "bin"));
    const scenario = join(sandbox.root, "scenario.json");
    writeFileSync(scenario, JSON.stringify({ sessions: [{ actions: [{ waitForFile: join(sandbox.root, "never") }, { result: "Unreachable." }] }] }));
    // A launcher that starts the stand-in, hands it a prompt, reports its PID and exits at once,
    // as a Kiln in a killed test worker does, leaving the sandbox and its scenario in place.
    const launcher = `
      const { spawn } = require("node:child_process");
      const child = spawn(process.argv[1], ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--session-id", "orphan", "--model", "opus"], { cwd: process.argv[2], stdio: ["pipe", "ignore", "ignore"], detached: true });
      child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: "Use the implement-from-requirements skill." } }) + "\\n");
      setTimeout(() => { process.stdout.write(String(child.pid)); process.exit(0); }, 500);`;
    const run = spawnSync(process.execPath, ["-e", launcher, claude, sandbox.root], { env: { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario }, encoding: "utf8" });
    const pid = Number(run.stdout);
    expect(pid).toBeGreaterThan(0);
    const deadline = Date.now() + 5_000;
    while (alive(pid) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    const survived = alive(pid);
    if (survived) process.kill(pid);
    expect(survived).toBe(false);
    expect(existsSync(scenario)).toBe(true);
  });
});
