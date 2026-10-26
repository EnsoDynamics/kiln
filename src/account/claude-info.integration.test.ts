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
import { readAccount } from "./claude-account.js";
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
    // Refreshes join one bracketed account/usage/account reading (AC-BILL-03 attribution).
    await Promise.all([info.refreshAccount(), info.refreshAccount()]);
    expect(info.account).toMatchObject({ email: "alex@acme-shop.dev", plan: "Max plan" });
    expect(helpers().filter((kind) => kind === "account")).toHaveLength(2);
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
  it("discards overflow when the account switches across the usage read while keeping independently available usage gauges", async () => {
    sandbox = createSandbox(); const { claude } = installStandIns(join(sandbox.root, "bin"));
    const scenario = join(sandbox.root, "scenario.json"); writeFileSync(scenario, JSON.stringify({ sessions: [] }));
    const account = join(sandbox.root, "account.json"); const usage = join(sandbox.root, "usage.jsonl"); const release = join(sandbox.root, "release-usage");
    writeFileSync(account, JSON.stringify({ loggedIn: true, email: "before@example.test", orgId: "before-org", subscriptionType: "max" }));
    writeFileSync(usage, JSON.stringify({ usage_report: { rate_limits: { limits: [{ kind: "session", percent: 42 }], extra_usage: { is_enabled: true } } } }));
    const reading = readAccount({ claude, cwd: sandbox.root, env: { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario, KILN_STANDIN_ACCOUNT: account, KILN_STANDIN_USAGE: usage, KILN_STANDIN_USAGE_WAIT: release } });
    await waitFor(() => existsSync(`${scenario}.helpers.jsonl`) && readFileSync(`${scenario}.helpers.jsonl`, "utf8").includes('"usage"'));
    writeFileSync(account, JSON.stringify({ loggedIn: true, email: "after@example.test", orgId: "after-org", subscriptionType: "max" })); writeFileSync(release, "");
    const result = await reading;
    expect(result.extraUsage).toBeUndefined(); expect(result.error).toBeUndefined();
    expect(result.limits).toMatchObject([{ kind: "session", percent: 42 }]);
  });

  it("attributes reported overflow without usage meters and still rejects an account switch across that read", async () => {
    sandbox = createSandbox(); const { claude } = installStandIns(join(sandbox.root, "bin"));
    const scenario = join(sandbox.root, "scenario.json"); writeFileSync(scenario, JSON.stringify({ sessions: [] }));
    const account = join(sandbox.root, "account.json"); const usage = join(sandbox.root, "usage.jsonl");
    writeFileSync(account, JSON.stringify({ loggedIn: true, email: "same@example.test", orgId: "same-org", subscriptionType: "max" }));
    // SDK 0.3.310 explicitly permits limits:null independently of extra_usage.
    writeFileSync(usage, JSON.stringify({ usage_report: { rate_limits: { limits: null, extra_usage: { is_enabled: true } } } }));
    const env = { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario, KILN_STANDIN_ACCOUNT: account, KILN_STANDIN_USAGE: usage };
    const result = await readAccount({ claude, cwd: sandbox.root, env });
    expect(result.extraUsage).toEqual({ enabled: true, observedAt: result.updatedAt, email: "same@example.test", orgId: "same-org" });
    expect(result.limits).toEqual([]); expect(result.limitsError).toContain("didn't report"); expect(result.error).toBeUndefined();
    const release = join(sandbox.root, "release-usage");
    const before = readFileSync(`${scenario}.helpers.jsonl`, "utf8").split("\n").filter(line => line.includes('"usage"')).length;
    const pending = readAccount({ claude, cwd: sandbox.root, env: { ...env, KILN_STANDIN_USAGE_WAIT: release } });
    await waitFor(() => readFileSync(`${scenario}.helpers.jsonl`, "utf8").split("\n").filter(line => line.includes('"usage"')).length > before);
    writeFileSync(account, JSON.stringify({ loggedIn: true, email: "other@example.test", orgId: "other-org", subscriptionType: "max" })); writeFileSync(release, "");
    expect((await pending).extraUsage).toBeUndefined();
  });

});
