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
  it.each([true, undefined])("discards unbound usage after an account switch, with overflow=%s", async overflow => {
    sandbox = createSandbox(); const { claude } = installStandIns(join(sandbox.root, "bin"));
    const scenario = join(sandbox.root, "scenario.json"); writeFileSync(scenario, JSON.stringify({ sessions: [] }));
    const account = join(sandbox.root, "account.json"); const usage = join(sandbox.root, "usage.jsonl"); const release = join(sandbox.root, "release-usage");
    writeFileSync(account, JSON.stringify({ loggedIn: true, email: "before@example.test", orgId: "before-org", subscriptionType: "max" }));
    writeFileSync(usage, JSON.stringify({ usage_report: { rate_limits: { limits: [{ kind: "session", percent: 42 }], ...(overflow === undefined ? {} : { extra_usage: { is_enabled: overflow } }) } } }));
    const reading = readAccount({ claude, cwd: sandbox.root, env: { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario, KILN_STANDIN_ACCOUNT: account, KILN_STANDIN_USAGE: usage, KILN_STANDIN_USAGE_WAIT: release } });
    await waitFor(() => existsSync(`${scenario}.helpers.jsonl`) && readFileSync(`${scenario}.helpers.jsonl`, "utf8").includes('"usage"'));
    writeFileSync(account, JSON.stringify({ loggedIn: true, email: "after@example.test", orgId: "after-org", subscriptionType: "max" })); writeFileSync(release, "");
    const result = await reading;
    expect(result.extraUsage).toBeUndefined(); expect(result.error).toBeUndefined();
    // Phase 6: usage carries no independent identity; a changed bracket makes it unavailable.
    expect(result.email).toBe("after@example.test"); expect(result.orgId).toBe("after-org");
    expect(result.limits).toEqual([]); expect(result.limitsError).toContain("stable authenticated account");
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
    expect(result.extraUsage).toEqual({ enabled: true, observedAt: expect.any(String), email: "same@example.test", orgId: "same-org" });
    expect(Date.parse(result.extraUsage!.observedAt)).toBeLessThan(Date.parse(result.updatedAt));
    expect(result.limitsObservedAt).toBeUndefined();
    expect(result.limits).toEqual([]); expect(result.limitsError).toContain("didn't report"); expect(result.error).toBeUndefined();
    const release = join(sandbox.root, "release-usage");
    const before = readFileSync(`${scenario}.helpers.jsonl`, "utf8").split("\n").filter(line => line.includes('"usage"')).length;
    const pending = readAccount({ claude, cwd: sandbox.root, env: { ...env, KILN_STANDIN_USAGE_WAIT: release } });
    await waitFor(() => readFileSync(`${scenario}.helpers.jsonl`, "utf8").split("\n").filter(line => line.includes('"usage"')).length > before);
    writeFileSync(account, JSON.stringify({ loggedIn: true, email: "other@example.test", orgId: "other-org", subscriptionType: "max" })); writeFileSync(release, "");
    expect((await pending).extraUsage).toBeUndefined();
  });

  it("leaves successful usage unavailable when authentication supplies no account identity", async () => {
    sandbox = createSandbox(); const { claude } = installStandIns(join(sandbox.root, "bin"));
    const account = join(sandbox.root, "unknown-account.json");
    writeFileSync(account, JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "max" }));
    const result = await readAccount({ claude, cwd: sandbox.root, env: { ...sandbox.env, KILN_STANDIN_ACCOUNT: account } });
    expect(result.error).toBeUndefined(); expect(result.email).toBeUndefined(); expect(result.orgId).toBeUndefined();
    expect(result.limits).toEqual([]); expect(result.extraUsage).toBeUndefined();
    expect(result.limitsError).toContain("stable authenticated account");
  });

});

it('dates auth and usage independently across delayed calls, including the final corroborating auth', async () => {
  sandbox = createSandbox(); const { claude } = installStandIns(join(sandbox.root, 'bin'));
  const scenario = join(sandbox.root, 'scenario.json'); writeFileSync(scenario, JSON.stringify({ sessions: [] }));
  const authGate = join(sandbox.root, 'initial-auth'); const usageGate = join(sandbox.root, 'usage'); const afterGate = join(sandbox.root, 'after-auth');
  const observed = join(sandbox.root, 'auth-observed');
  const env = { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario, KILN_STANDIN_AUTH_WAIT: authGate, KILN_STANDIN_USAGE_WAIT: usageGate, KILN_STANDIN_AUTH_AFTER_WAIT: afterGate, KILN_STANDIN_AUTH_OBSERVED: observed };
  const reading = readAccount({ claude, cwd: sandbox.root, env });
  const helpers = () => existsSync(`${scenario}.helpers.jsonl`) ? readFileSync(`${scenario}.helpers.jsonl`, 'utf8') : '';
  await waitFor(() => helpers().includes('"account"')); writeFileSync(authGate, '');
  await waitFor(() => helpers().includes('"usage"'));
  const initialAuthAt = readFileSync(observed, 'utf8');
  await new Promise(resolve => setTimeout(resolve, 40)); writeFileSync(usageGate, '');
  await waitFor(() => helpers().split('\n').filter(line => line.includes('"account"')).length === 2);
  const usageFinishedBefore = Date.now();
  await new Promise(resolve => setTimeout(resolve, 40)); writeFileSync(afterGate, '');
  const result = await reading;
  expect(Date.parse(result.limitsObservedAt!)).toBeGreaterThan(Date.parse(initialAuthAt));
  expect(Date.parse(result.limitsObservedAt!)).toBeLessThanOrEqual(usageFinishedBefore);
  expect(Date.parse(result.updatedAt)).toBeGreaterThan(usageFinishedBefore);
  expect(Date.parse(result.updatedAt)).toBeGreaterThanOrEqual(Date.parse(readFileSync(observed, 'utf8')));
});

it.each([undefined, null, []])('keeps absent no-plan usage unavailable and explicitly empty usage dated: %s', async limits => {
  sandbox = createSandbox(); const { claude } = installStandIns(join(sandbox.root, 'bin'));
  const auth = join(sandbox.root, 'auth.json'); const usage = join(sandbox.root, 'usage.jsonl');
  writeFileSync(auth, JSON.stringify({ loggedIn: true, authMethod: 'api_key', email: 'api@example.invalid' }));
  writeFileSync(usage, JSON.stringify({ usage_report: { rate_limits: { limits } } }));
  const result = await readAccount({ claude, cwd: sandbox.root, env: { ...sandbox.env, KILN_STANDIN_ACCOUNT: auth, KILN_STANDIN_USAGE: usage } });
  expect(result.error).toBeUndefined(); expect(result.limitsError).toBeUndefined(); expect(result.limits).toEqual([]);
  if (Array.isArray(limits)) { expect(result.limitsObservedAt).toEqual(expect.any(String)); expect(result.limitsUnavailable).toBeUndefined(); }
  else { expect(result.limitsObservedAt).toBeUndefined(); expect(result.limitsUnavailable).toContain("didn't report"); }
});
