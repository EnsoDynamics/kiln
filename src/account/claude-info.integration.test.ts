// The account and usage stay current while `kiln run` runs (PRD AC-WATCH-09): read at start,
// again on a timer, and a refresh asked for while one runs joins it, against the stand-in claude
// that answers `auth status --json` and `/usage` the way Claude Code does.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { waitFor } from "../test-support/engine-harness.js";
import { ClaudeInfo } from "./claude-info.js";

let sandbox: Sandbox | undefined;
let info: ClaudeInfo | undefined;
afterEach(async () => {
  info?.close();
  await sandbox?.cleanup();
});

describe("Claude Code's account and usage", () => {
  it("are read at start and again on the refresh timer, and a refresh asked for mid-read joins it", async () => {
    sandbox = createSandbox();
    const { claude } = installStandIns(join(sandbox.root, "bin"));
    const scenario = join(sandbox.root, "scenario.json");
    writeFileSync(scenario, JSON.stringify({ sessions: [] }));
    const helpers = () => (existsSync(`${scenario}.helpers.jsonl`) ? readFileSync(`${scenario}.helpers.jsonl`, "utf8").trim().split("\n").map((line) => (JSON.parse(line) as { kind: string }).kind) : []);
    info = new ClaudeInfo({ claude, env: { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario }, cwd: sandbox.root });

    info.start(1_500);
    // Two refreshes asked for while the first read runs join it: one account call, one usage call.
    await Promise.all([info.refreshAccount(), info.refreshAccount()]);
    expect(info.account).toMatchObject({ email: "alex@acme-shop.dev", plan: "Max plan" });
    expect(helpers().filter((kind) => kind === "account")).toHaveLength(1);
    expect(helpers().filter((kind) => kind === "usage")).toHaveLength(1);
    const firstUpdate = info.account!.updatedAt;

    // The timer reads them again, with no session and no prompt (AC-WATCH-09).
    await waitFor(() => helpers().filter((kind) => kind === "usage").length >= 2, 30_000);
    await waitFor(() => info!.account!.updatedAt !== firstUpdate, 30_000);
    expect(helpers().filter((kind) => kind === "account").length).toBeGreaterThanOrEqual(2);

    // Closing stops the timer.
    info.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const after = helpers().length;
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(helpers().length).toBe(after);
  });
});
