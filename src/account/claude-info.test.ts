// While `kiln run` runs, the account and its usage are read every 5 minutes (PRD AC-WATCH-09).
// The reads themselves are tested against the stand-in claude (claude-info.integration.test.ts);
// here only the timer, with the reads replaced.

import { afterEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ account: 0 }));
vi.mock("./claude-account.js", () => ({
  readAccount: async () => {
    reads.account++;
    return { updatedAt: new Date().toISOString(), limits: [] };
  },
}));
vi.mock("./model-list.js", () => ({ readModelList: () => new Promise(() => undefined), modelListErrorMessage: String }));

const { ACCOUNT_REFRESH_MS, ClaudeInfo } = await import("./claude-info.js");

afterEach(() => vi.useRealTimers());

describe("the account refresh timer", () => {
  it("reads the account again every 5 minutes by default, and not before", async () => {
    expect(ACCOUNT_REFRESH_MS).toBe(300_000);
    vi.useFakeTimers();
    const info = new ClaudeInfo({ claude: "claude", env: {}, cwd: "." });
    info.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads.account).toBe(1);
    await vi.advanceTimersByTimeAsync(300_000 - 1);
    expect(reads.account).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads.account).toBe(2);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(reads.account).toBe(3);
    info.close();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(reads.account).toBe(3);
  });
});
