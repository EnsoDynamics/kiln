// The account and usage stay current while `kiln run` runs (PRD AC-WATCH-09): read at start,
// again on a timer, and a refresh asked for while one runs joins it, against the stand-in claude
// that answers `auth status --json` and `/usage` the way Claude Code does. A refresh asked for by
// a listener hearing of a reading starts a fresh one, as a wait's start needs when the reading it
// joined began before the refusal (usage-limit recovery AC-AUTO-02, technical design "While it lasts").

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { waitFor } from "../test-support/engine-harness.js";
import { ScriptedClaude, signedIn } from "../test-support/scripted-claude.js";
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

  it("are read afresh when a listener hearing of a reading asks again, as the engine does for one older than a refusal", async () => {
    sandbox = createSandbox();
    const { claude } = installStandIns(join(sandbox.root, "bin"));
    const scenario = join(sandbox.root, "scenario.json");
    writeFileSync(scenario, JSON.stringify({ sessions: [] }));
    const usageCalls = () =>
      existsSync(`${scenario}.helpers.jsonl`) ? readFileSync(`${scenario}.helpers.jsonl`, "utf8").trim().split("\n").filter((line) => (JSON.parse(line) as { kind: string }).kind === "usage").length : 0;
    info = new ClaudeInfo({ claude, env: { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario }, cwd: sandbox.root });

    const readings: string[] = [];
    let askedAgain: Promise<void> | undefined;
    info.onChange(() => {
      readings.push(info!.account!.startedAt);
      if (readings.length === 1) askedAgain = info!.refreshAccount();
    });
    const first = info.refreshAccount();
    await first;
    // The listener's ask didn't join the reading it heard of: a second call is under way.
    expect(askedAgain).toBeDefined();
    expect(askedAgain).not.toBe(first);
    await askedAgain;
    expect(usageCalls()).toBe(2);
    expect(readings).toHaveLength(2);
    expect(Date.parse(readings[1]!)).toBeGreaterThan(Date.parse(readings[0]!));
  });

  it("are read afresh the same way by the engine tests' scripted reader, so those tests prove what the real one does", async () => {
    const scripted = new ScriptedClaude(() => new Date());
    let askedAgain: Promise<void> | undefined;
    scripted.onChange(() => {
      if (scripted.asked === 1) askedAgain = scripted.refreshAccount();
    });
    const first = scripted.refreshAccount();
    scripted.deliver(signedIn([]));
    await first;
    expect(askedAgain).not.toBe(first);
    expect(scripted.asked).toBe(2);
    expect(scripted.waiting).toBe(true);
  });
});
