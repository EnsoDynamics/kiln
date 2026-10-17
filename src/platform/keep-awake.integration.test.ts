// Keep-awake against the real tool on the running platform (technical design, "Testing
// Approach": keep-awake): caffeinate on macOS, systemd-inhibit or gnome-session-inhibit on
// Linux, PowerShell's SetThreadExecutionState on Windows, held and then released, and the error
// shown when the tool for the session isn't there.

import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { isProcessLive, processStartTime } from "./process-start-time.js";
import { KeepAwake, keepAwakeMissingMessage, keepAwakeTool } from "./keep-awake.js";
import { waitFor } from "../test-support/engine-harness.js";

let keepAwake: KeepAwake | undefined;
afterEach(() => keepAwake?.set(false));

const alive = async (pid: number) => isProcessLive(pid, await processStartTime(pid));

describe("the keep-awake hold on this platform", () => {
  it("holds while set on and is gone once released", async () => {
    const tool = keepAwakeTool(process.platform, process.env, process.pid, "Customer returns");
    if (!tool.ok) {
      // Linux without the session's tool: says so rather than appearing on while doing nothing.
      const errors: string[] = [];
      keepAwake = new KeepAwake({ featureName: "Customer returns", env: process.env, onError: (message) => errors.push(message) });
      keepAwake.set(true);
      expect(keepAwake.error).toBe(keepAwakeMissingMessage(tool.missing));
      expect(errors).toEqual([keepAwakeMissingMessage(tool.missing)]);
      return;
    }
    keepAwake = new KeepAwake({ featureName: "Customer returns", env: process.env });
    keepAwake.set(true);
    const pid = keepAwake.holderPid!;
    expect(pid).toBeGreaterThan(0);

    if (process.platform === "darwin") {
      // macOS lists the hold as caffeinate's assertion against idle sleep.
      await waitFor(() => /PreventUserIdleSystemSleep/.test(assertionsOf(pid)), 5_000);
    } else if (process.platform === "linux") {
      // A runner whose logind refuses the lock reports why instead of holding nothing.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (keepAwake.error !== undefined) {
        expect(keepAwake.error).toMatch(/^Can’t keep this computer awake: /);
        return;
      }
      expect(execFileSync(tool.command.includes("gnome") ? "gnome-session-inhibit" : "systemd-inhibit", ["--list"], { encoding: "utf8" })).toContain("Kiln");
    } else {
      // PowerShell has set the state and is waiting on Kiln's process.
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      expect(keepAwake.error).toBeUndefined();
    }
    expect(await alive(pid)).toBe(true);

    keepAwake.set(false);
    expect(keepAwake.holderPid).toBeUndefined();
    await waitFor(async () => !(await alive(pid)), 10_000);
    expect(keepAwake.error).toBeUndefined();
  });
});

function assertionsOf(pid: number): string {
  const lines = execFileSync("pmset", ["-g", "assertions"], { encoding: "utf8" }).split("\n");
  return lines.filter((line) => line.includes(`pid ${pid}(caffeinate)`)).join("\n");
}
