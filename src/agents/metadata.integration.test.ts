// Real SDK and process-pipe regression for Claude readiness. Command names match the
// installed Claude plugin's supportedCommands() response, checked without a model turn.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { METHOD_SKILLS } from "./codex-metadata.js";
import { AgentInfo } from "./metadata.js";
import { createSandbox, installStandIns, type Sandbox } from "../test-support/git-repositories.js";
import { ScriptedClaude, signedIn } from "../test-support/scripted-claude.js";
import { codexWorkFixture } from "../test-support/codex-work-fixture.js";

let sandbox: Sandbox;
let info: AgentInfo | undefined;
afterEach(async () => { info?.close(); info = undefined; await sandbox?.cleanup(); });

function setup(commands?: string[] | Record<string, string[]>) {
  sandbox = createSandbox();
  const { claude } = installStandIns(join(sandbox.root, "bin"));
  const scenario = join(sandbox.root, "scenario.json");
  const commandsFile = join(sandbox.root, "commands.json");
  writeFileSync(scenario, JSON.stringify({ sessions: [] }));
  if (commands) writeFileSync(commandsFile, JSON.stringify(commands));
  const account = new ScriptedClaude(() => new Date());
  // Account details are unrelated to skill discovery; the skill read uses the real SDK.
  account.refreshAccount = async () => { account.account = { ...signedIn([]), startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), limits: [] }; };
  const env: NodeJS.ProcessEnv = { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario, ...(commands ? { KILN_STANDIN_COMMANDS: commandsFile } : {}) };
  info = new AgentInfo({ agentId: "claude_code", claude: account, executable: { claude }, cwd: sandbox.root, claudeCwd: sandbox.root, env });
  return { scenario, commandsFile, env };
}
const pluginSkills = METHOD_SKILLS.map(name => `enso-method:${name}`);

describe("Claude Code enabled-skill readiness", () => {
  it("does not let auth-only or model-only readiness redate usage or reattach another account's gauges", async () => {
    sandbox = createSandbox();
    const { claude } = installStandIns(join(sandbox.root, "bin"));
    const auth = join(sandbox.root, "auth.json"); const scenario = join(sandbox.root, "scenario.json");
    writeFileSync(scenario, JSON.stringify({ sessions: [] }));
    const signIn = (email: string) => writeFileSync(auth, JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email, subscriptionType: "max" }));
    signIn("first@example.invalid");
    const env = { ...sandbox.env, KILN_STANDIN_ACCOUNT: auth, KILN_STANDIN_SCENARIO: scenario };
    info = new AgentInfo({ agentId: "claude_code", executable: { claude }, cwd: sandbox.root, claudeCwd: sandbox.root, env });
    await info.refresh();
    const original = structuredClone(info.state.account!);
    expect(original.limits).toHaveLength(3); expect(Date.parse(original.limitsObservedAt!)).toBeLessThan(Date.parse(original.updatedAt));
    await info.refreshClaudeForLaunch(sandbox.root, env, AbortSignal.timeout(10000));
    expect(info.state.blockers).toEqual([]);
    expect(info.state.account).toMatchObject({ email: original.email, limits: original.limits, limitsObservedAt: original.limitsObservedAt, limitsStale: true });
    expect(info.state.account!.updatedAt).not.toBe(original.updatedAt);
    signIn("second@example.invalid"); await info.refreshClaudeForLaunch(sandbox.root, env, AbortSignal.timeout(10000));
    const second = structuredClone(info.state.account!);
    expect(second).toMatchObject({ email: "second@example.invalid", limits: [], limitsError: expect.any(String) });
    expect(second.limitsObservedAt).toBeUndefined();
    await info.refreshClaudeModels();
    expect(info.state.account).toEqual(second);
    signIn("first@example.invalid"); await info.refreshClaudeForLaunch(sandbox.root, env, AbortSignal.timeout(10000));
    expect(info.state.account).toMatchObject({ email: "first@example.invalid", limits: original.limits, limitsObservedAt: original.limitsObservedAt, limitsStale: true });
    signIn("second@example.invalid"); await info.refreshClaudeForLaunch(sandbox.root, env, AbortSignal.timeout(10000));
    expect(info.state.account).toMatchObject({ email: "second@example.invalid", limits: [] });
    expect(info.state.account!.limitsObservedAt).toBeUndefined();
    const helpers = readFileSync(`${scenario}.helpers.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line) as { kind: string });
    expect(helpers.filter(row => row.kind === "usage")).toHaveLength(1);
    expect(existsSync(`${scenario}.calls.jsonl`)).toBe(false);
    await info.refresh();
    expect(info.state.account).toMatchObject({ email: "second@example.invalid", limits: original.limits });
    expect(info.state.account!.limitsObservedAt).not.toBe(original.limitsObservedAt);
  });
  it("accepts the installed plugin without flat skill folders, and sends no implementation prompt", async () => {
    const { scenario } = setup(pluginSkills);
    rmSync(join(sandbox.env.CLAUDE_CONFIG_DIR!, "skills"), { recursive: true });
    await info!.refresh();
    expect(info!.state.blockers).toEqual([]);
    expect(info!.state.pending).toBe(false);
    expect(info!.state.models?.length).toBeGreaterThan(0);
    expect(existsSync(`${scenario}.calls.jsonl`)).toBe(false);
    expect(readFileSync(`${scenario}.helpers.jsonl`, "utf8")).toContain('"kind":"skills"');
  });

  it("continues to accept ordinary personal skills", async () => {
    setup();
    await info!.refresh();
    expect(info!.state.blockers).toEqual([]);
  });

  it("checks every launch directory and clears a disabled-skill blocker after refresh", async () => {
    const { commandsFile } = setup({});
    const added = join(sandbox.root, "added-worktree");
    mkdirSync(added);
    const missing = pluginSkills.filter(name => name !== "enso-method:deliverable-review");
    writeFileSync(commandsFile, JSON.stringify({ [sandbox.root]: pluginSkills, [added]: missing }));
    await info!.refresh([sandbox.root, added]);
    expect(info!.state.blockers).toEqual([`Enable or install the Enso Method deliverable-review skill for Claude Code in ${added}.`]);
    writeFileSync(commandsFile, JSON.stringify({ [sandbox.root]: pluginSkills, [added]: pluginSkills }));
    await info!.refresh();
    expect(info!.state.blockers).toEqual([]);
  });

  it("keeps a failed skill lookup blocked with its directory and recovers on refresh", async () => {
    const { commandsFile, scenario } = setup(pluginSkills);
    writeFileSync(commandsFile, "invalid JSON");
    await info!.refresh();
    expect(info!.state.blockers).toEqual([expect.stringContaining(`Could not inspect enabled Claude Code skills in ${sandbox.root}:`)]);
    expect(info!.state.pending).toBe(false);
    expect(existsSync(`${scenario}.calls.jsonl`)).toBe(false);
    writeFileSync(commandsFile, JSON.stringify(pluginSkills));
    await info!.refresh();
    expect(info!.state.blockers).toEqual([]);
  });

  // AC-AGENT-05: Claude Code below its minimum is a readiness blocker when selected, read on
  // Documents found and again before every launch; the minimum and every later version are ready.
  it("blocks Claude Code below its minimum with the update command, and accepts the minimum, later and unreadable versions", async () => {
    // AgentInfo reads the environment it was given at each read, so the test changes the version there.
    const { env } = setup(pluginSkills);
    env.KILN_STANDIN_VERSION = "2.1.310 (Claude Code)";
    const blocker = "Claude Code 2.1.310 is older than Kiln supports. Install Claude Code 2.1.311 or later: claude update";
    await info!.refresh();
    expect(info!.state.blockers).toEqual([blocker]);
    await info!.refreshClaudeForLaunch(sandbox.root, env, AbortSignal.timeout(10000));
    expect(info!.state.blockers).toEqual([blocker]);
    for (const version of ["2.1.311 (Claude Code)", "2.1.318 (Claude Code)", "3.0.0", "stand-in"]) {
      env.KILN_STANDIN_VERSION = version;
      await info!.refreshClaudeForLaunch(sandbox.root, env, AbortSignal.timeout(10000));
      expect(info!.state.blockers, version).toEqual([]);
      await info!.refresh();
      expect(info!.state.blockers, version).toEqual([]);
    }
  });

  it("does not accept an unrelated plugin's matching skill names", async () => {
    setup(METHOD_SKILLS.map(name => `other-plugin:${name}`));
    await info!.refresh();
    expect(info!.state.blockers).toHaveLength(METHOD_SKILLS.length);
    expect(info!.state.blockers.join(" ")).toContain("implement-from-requirements");
  });
});

it('keeps launch authentication dated before independently delayed models and skills finish', async () => {
  sandbox = createSandbox(); const { claude } = installStandIns(join(sandbox.root, 'bin'));
  const scenario = join(sandbox.root, 'scenario.json'); writeFileSync(scenario, JSON.stringify({ sessions: [] }));
  const modelsGate = join(sandbox.root, 'models'); const skillsGate = join(sandbox.root, 'skills'); const observed = join(sandbox.root, 'auth-observed');
  const env = { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario, KILN_STANDIN_MODELS_WAIT: modelsGate, KILN_STANDIN_SKILLS_WAIT: skillsGate, KILN_STANDIN_AUTH_OBSERVED: observed };
  info = new AgentInfo({ agentId: 'claude_code', executable: { claude }, cwd: sandbox.root, claudeCwd: sandbox.root, env });
  const pending = info.refreshClaudeForLaunch(sandbox.root, env, AbortSignal.timeout(10000));
  const { waitFor } = await import('../test-support/engine-harness.js');
  await waitFor(() => existsSync(observed));
  await new Promise(resolve => setTimeout(resolve, 60)); const modelsReleasedAt = Date.now(); writeFileSync(modelsGate, '');
  await new Promise(resolve => setTimeout(resolve, 60)); const skillsReleasedAt = Date.now(); writeFileSync(skillsGate, '');
  expect(await pending).not.toHaveProperty('error');
  expect(Date.parse(info.state.account!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(readFileSync(observed, 'utf8')));
  expect(Date.parse(info.state.account!.updatedAt)).toBeLessThan(modelsReleasedAt); expect(Date.parse(info.state.account!.updatedAt)).toBeLessThan(skillsReleasedAt);
  expect(info.state.account!.limitsObservedAt).toBeUndefined(); expect(info.state.blockers).toEqual([]);
});

it('keeps a Claude launch readiness read that ends after a switch to Codex out of the Codex catalogue and account', async () => {
  sandbox = createSandbox(); const { claude } = installStandIns(join(sandbox.root, 'bin'));
  const scenario = join(sandbox.root, 'scenario.json'); writeFileSync(scenario, JSON.stringify({ sessions: [] }));
  const codex = codexWorkFixture();
  try {
    const env = { ...sandbox.env, KILN_STANDIN_SCENARIO: scenario }; codex.configureEnvironment(env);
    info = new AgentInfo({ agentId: 'claude_code', executable: { claude, codex: codex.options.executable }, cwd: codex.root, claudeCwd: sandbox.root, env });
    await info.refresh();
    expect(info.state.models!.some(entry => entry.value === 'gpt-6.1-sol')).toBe(false);
    // The engine's billing inspection reaches Claude readiness only after its own inventory read, by which time a person may have chosen Codex.
    info.select('codex'); await info.refresh();
    const catalogue = structuredClone(info.state.models); const account = structuredClone(info.state.account); const blockers = structuredClone(info.state.blockers);
    expect(catalogue!.map(entry => entry.value)).toEqual(['gpt-6.1-sol']);
    expect(await info.refreshClaudeForLaunch(sandbox.root, env, AbortSignal.timeout(10000))).toEqual({ error: 'Claude readiness check was cancelled.' });
    expect(info.state.agentId).toBe('codex'); expect(info.state.models).toEqual(catalogue); expect(info.state.account).toEqual(account); expect(info.state.blockers).toEqual(blockers);
  } finally { await codex.sandbox.cleanup(); }
});
