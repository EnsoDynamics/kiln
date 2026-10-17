// The real suspend record on the running platform: macOS's sysctl, Linux's /proc/uptime, or
// Windows's Kernel-Power events through PowerShell. A test machine doesn't sleep between two
// readings, so both find no sleep; what this proves is that the command runs and its output reads.

import { describe, expect, it } from "vitest";
import { platformSleepReader } from "./sleep-readings.js";

describe("the platform's sleep reader", () => {
  it("reads the operating system's suspend record twice and finds no sleep between", async () => {
    const reader = platformSleepReader();
    expect(await reader.next()).toEqual([]);
    expect(await reader.next()).toEqual([]);
  });
});
