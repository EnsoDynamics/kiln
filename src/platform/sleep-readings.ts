// The operating system's own record of suspend, read every 10 seconds and around every
// `claude` process (technical design, "Interruptions, sleep and resume", "Detecting sleep").
// Kiln never compares two clocks it keeps itself: Node's monotonic clock counts sleep on macOS
// but not on Linux, and neither source here moves with the wall clock, so an NTP step or a
// clock change never looks like a sleep.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runHelper } from "./helper-process.js";

/** One sleep the readings found: when it began, and how long it lasted. */
export interface Sleep {
  /** When the computer went to sleep (UTC ISO 8601). */
  at: string;
  seconds: number;
}

/** Reads the platform's suspend record; each call returns the sleeps since the previous call. */
export interface SleepReader {
  next(): Promise<Sleep[]>;
}

// ---- macOS: `sysctl -n kern.sleeptime kern.waketime` ------------------------------------------

export interface MacSleepWake {
  /** Seconds since the epoch; 0 when the computer hasn't slept since boot. */
  sleep: number;
  wake: number;
}

/**
 * Parses the two timevals `sysctl -n kern.sleeptime kern.waketime` prints.
 *
 *   parseMacSleepWake("{ sec = 1792249524, usec = 371856 } Sat Oct 17 11:05:24 2026\n{ sec = 1792249623, usec = 975601 } Sat Oct 17 11:07:03 2026")
 *   // { sleep: 1792249524.371856, wake: 1792249623.975601 }
 */
export function parseMacSleepWake(stdout: string): MacSleepWake | undefined {
  const values = [...stdout.matchAll(/\{\s*sec\s*=\s*(\d+),\s*usec\s*=\s*(\d+)\s*\}/g)].map((match) => Number(match[1]) + Number(match[2]) / 1e6);
  if (values.length !== 2) return undefined;
  return { sleep: values[0]!, wake: values[1]! };
}

/** A non-zero wake time different from the last reading means the computer slept from `sleep` to `wake`. */
export function macSleepSince(previous: MacSleepWake | undefined, next: MacSleepWake): Sleep | undefined {
  if (previous === undefined || next.wake === 0 || next.wake === previous.wake) return undefined;
  return { at: new Date(next.sleep * 1000).toISOString(), seconds: Math.max(0, Math.round(next.wake - next.sleep)) };
}

class MacSleepReader implements SleepReader {
  private previous: MacSleepWake | undefined;

  async next(): Promise<Sleep[]> {
    // Always /usr/sbin/sysctl, which doesn't depend on the PATH Kiln was started with.
    const result = await runHelper("/usr/sbin/sysctl", ["-n", "kern.sleeptime", "kern.waketime"], { cwd: "/" });
    const reading = result.exitCode === 0 ? parseMacSleepWake(result.stdout) : undefined;
    if (reading === undefined) return [];
    const sleep = macSleepSince(this.previous, reading);
    this.previous = reading;
    return sleep ? [sleep] : [];
  }
}

// ---- Linux: /proc/uptime (suspend included) against the monotonic clock (suspend excluded) ----

/** Growth of more than this many seconds in uptime-minus-monotonic is a sleep. */
export const LINUX_SLEEP_THRESHOLD_SECONDS = 2;

export interface LinuxReading {
  /** /proc/uptime's first number minus the monotonic clock, in seconds. */
  offset: number;
  /** When Kiln took the reading (UTC ISO 8601): a sleep found next began after it. */
  at: string;
}

/**
 * The offset between time since boot with suspend and without it.
 *
 *   linuxOffset("12345.67 54321.00\n", 12000.5)  // 345.17
 */
export function linuxOffset(procUptime: string, monotonicSeconds: number): number | undefined {
  const uptime = Number(procUptime.trim().split(/\s+/)[0]);
  return Number.isFinite(uptime) ? uptime - monotonicSeconds : undefined;
}

/** A sleep, when the offset grew by more than the threshold since the last reading; it began after that reading. */
export function linuxSleepSince(previous: LinuxReading | undefined, next: LinuxReading): Sleep | undefined {
  if (previous === undefined) return undefined;
  const growth = next.offset - previous.offset;
  if (growth <= LINUX_SLEEP_THRESHOLD_SECONDS) return undefined;
  return { at: previous.at, seconds: Math.round(growth) };
}

class LinuxSleepReader implements SleepReader {
  private previous: LinuxReading | undefined;

  next(): Promise<Sleep[]> {
    let uptime: string;
    try {
      uptime = readFileSync("/proc/uptime", "utf8");
    } catch {
      return Promise.resolve([]);
    }
    const offset = linuxOffset(uptime, Number(process.hrtime.bigint()) / 1e9);
    if (offset === undefined) return Promise.resolve([]);
    const reading = { offset, at: new Date().toISOString() };
    const sleep = linuxSleepSince(this.previous, reading);
    this.previous = reading;
    return Promise.resolve(sleep ? [sleep] : []);
  }
}

// ---- Windows: the System log's Kernel-Power events 42 (entering sleep) and 107 (resumed) -----

export interface PowerEvent {
  id: 42 | 107;
  recordId: number;
  /** UTC ISO 8601. */
  time: string;
}

const WINDOWS_POWER_EVENTS_SCRIPT = [
  "$e = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-Kernel-Power'; Id=42,107} -MaxEvents 20 -ErrorAction SilentlyContinue",
  "@($e | ForEach-Object { [pscustomobject]@{ id = $_.Id; recordId = $_.RecordId; time = $_.TimeCreated.ToUniversalTime().ToString('o') } }) | ConvertTo-Json -Compress",
].join("; ");

/** Reads PowerShell's JSON of power events, newest first or in any order. */
export function parsePowerEvents(stdout: string): PowerEvent[] {
  const text = stdout.trim();
  if (text === "") return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .filter((row): row is PowerEvent => typeof row === "object" && row !== null && ((row as PowerEvent).id === 42 || (row as PowerEvent).id === 107) && typeof (row as PowerEvent).recordId === "number" && typeof (row as PowerEvent).time === "string")
      .sort((a, b) => a.recordId - b.recordId);
  } catch {
    return [];
  }
}

/**
 * The sleeps whose resume (event 107) is newer than `lastRecordId`, each paired with the
 * latest event 42 before it. The first reading only sets the baseline.
 */
export function windowsSleepsSince(lastRecordId: number | undefined, events: PowerEvent[]): Sleep[] {
  if (lastRecordId === undefined) return [];
  const sleeps: Sleep[] = [];
  for (const [index, event] of events.entries()) {
    if (event.id !== 107 || event.recordId <= lastRecordId) continue;
    const entering = events.slice(0, index).reverse().find((candidate) => candidate.id === 42);
    if (!entering) continue;
    sleeps.push({ at: new Date(entering.time).toISOString(), seconds: Math.max(0, Math.round((Date.parse(event.time) - Date.parse(entering.time)) / 1000)) });
  }
  return sleeps;
}

class WindowsSleepReader implements SleepReader {
  private lastRecordId: number | undefined;
  private baselined = false;

  async next(): Promise<Sleep[]> {
    const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const result = await runHelper(powershell, ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_POWER_EVENTS_SCRIPT], { cwd: process.cwd() });
    if (result.exitCode !== 0) return [];
    const events = parsePowerEvents(result.stdout);
    const newest = events.at(-1)?.recordId;
    const sleeps = this.baselined ? windowsSleepsSince(this.lastRecordId ?? 0, events) : [];
    this.baselined = true;
    if (newest !== undefined) this.lastRecordId = Math.max(newest, this.lastRecordId ?? 0);
    return sleeps;
  }
}

/** The reader for the platform Kiln runs on. */
export function platformSleepReader(platform: NodeJS.Platform = process.platform): SleepReader {
  if (platform === "darwin") return new MacSleepReader();
  if (platform === "win32") return new WindowsSleepReader();
  return new LinuxSleepReader();
}
