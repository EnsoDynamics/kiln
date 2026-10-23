// A process's start time, read the same way for Kiln itself and for its children, so a
// recorded PID is never mistaken for a different process that reused it (technical design,
// "Ports and one Kiln per PRD", "Process start time").

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runHelper } from "./helper-process.js";

/**
 * The process's start time as the operating system reports it, or undefined when the process
 * is gone. Values are opaque: compare them only with values from this same reader.
 *
 *   await processStartTime(process.pid)  // "1234567" on Linux, "Sat Oct 17 18:48:00 2026" on macOS
 */
export async function processStartTime(pid: number, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<string | undefined> {
  options.signal?.throwIfAborted();
  if (process.platform === "linux") return linuxStartTime(pid);
  if (process.platform === "win32") {
    // By its full path, which doesn't depend on the PATH Kiln was started with.
    const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = await runHelper(
      powershell,
      ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`],
      { cwd: process.cwd(), ...options },
    );
    options.signal?.throwIfAborted();
    if (result.failure && options.timeoutMs !== undefined) throw new Error(`Process identity lookup failed: ${result.failure}`);
    const ticks = result.stdout.trim();
    return result.exitCode === 0 && /^\d+$/.test(ticks) ? ticks : undefined;
  }
  // macOS: `ps` prints the start time in the local zone and locale unless told otherwise. It is
  // always /bin/ps there, which doesn't depend on the PATH Kiln was started with.
  const result = await runHelper("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: "UTC", LC_ALL: "C" },
    ...options,
  });
  options.signal?.throwIfAborted();
  if (result.failure && options.timeoutMs !== undefined) throw new Error(`Process identity lookup failed: ${result.failure}`);
  const started = result.stdout.trim();
  return result.exitCode === 0 && started !== "" ? started : undefined;
}

/**
 * Field 22 of `/proc/<pid>/stat`, counted after the last `)`, since the command name in field 2
 * can hold spaces and parentheses.
 *
 *   linuxStartTimeFromStat("42 (my (odd) name) S 1 42 42 0 -1 ...")  // field 22
 */
export function linuxStartTimeFromStat(stat: string): string | undefined {
  const afterName = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/);
  // afterName[0] is field 3, so field 22 is index 19.
  return afterName[19];
}

function linuxStartTime(pid: number): string | undefined {
  try {
    return linuxStartTimeFromStat(readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch {
    return undefined;
  }
}

/** True when the process with this PID is running and started at `startTime`. */
export async function isProcessLive(pid: number, startTime: string | undefined): Promise<boolean> {
  if (startTime === undefined) return false;
  return (await processStartTime(pid)) === startTime;
}
