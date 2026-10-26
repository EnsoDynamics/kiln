// Real SDK resolver and installed auth-status proof; synthetic secrets never make a model request.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createSandbox, type Sandbox } from "../test-support/git-repositories.js";
import { findExecutable } from "../platform/helper-process.js";
import { readAuthStatus } from "../account/claude-account.js";
import { boundedRead } from "./bounded-process.js";
import { extractInventory, ordinaryProfile } from "./contract.js";
import { readInventory, classify } from "./inspection.js";
let sandbox: Sandbox | undefined;
afterEach(async () => { await sandbox?.cleanup(); sandbox = undefined; });
const worker = fileURLToPath(new URL("../../dist/billing/settings-worker.js", import.meta.url));
function settings(path: string, value: unknown) { mkdirSync(join(path, ".claude"), { recursive: true }); writeFileSync(join(path, ".claude", "settings.json"), JSON.stringify(value)); }
describe("qualified passive settings boundary", () => {
  it("uses the real SDK cascade, preserves source/empty precedence and does not execute helper, hook or MCP canaries", async () => {
    sandbox = createSandbox(); const project = join(sandbox.root, "project"); mkdirSync(project);
    const canary = join(sandbox.root, "MUST-NOT-EXECUTE"); const command = `${JSON.stringify(process.execPath)} -e "require('fs').writeFileSync(${JSON.stringify(canary)},'ran')"`;
    writeFileSync(join(sandbox.env.CLAUDE_CONFIG_DIR!, "settings.json"), JSON.stringify({ env: { ANTHROPIC_API_KEY: "synthetic-user-canary", ANTHROPIC_AUTH_TOKEN: "synthetic-token" } }));
    settings(project, { env: { ANTHROPIC_API_KEY: "synthetic-project-canary", ANTHROPIC_BASE_URL: "https://proxy.example.test", ANTHROPIC_CUSTOM_HEADERS: "Authorization: Bearer synthetic-header" }, apiKeyHelper: command, hooks: { SessionStart: [{ hooks: [{ type: "command", command }] }] } });
    writeFileSync(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { canary: { command: process.execPath, args: ["-e", `require('fs').writeFileSync(${JSON.stringify(canary)},'ran')`] } } }));
    writeFileSync(join(project, ".claude", "settings.local.json"), JSON.stringify({ env: { ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "local-token" } }));
    const result = await boundedRead(process.execPath, [worker], { cwd: project, env: sandbox.env });
    expect(result.diagnostic).toBeUndefined(); const inventory = JSON.parse(result.stdout!);
    expect(inventory.env).toMatchObject({ ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "local-token", ANTHROPIC_BASE_URL: "https://proxy.example.test" });
    expect(inventory.sources.ANTHROPIC_AUTH_TOKEN).toBe("local settings · ANTHROPIC_AUTH_TOKEN");
    expect(inventory.sources.ANTHROPIC_BASE_URL).toBe("project settings · ANTHROPIC_BASE_URL");
    expect(inventory.helpers.apiKeyHelper.value).toBe(command); expect(existsSync(canary)).toBe(false);
    expect(result.stdout).not.toContain('"hooks"'); expect(result.stdout).not.toContain('"mcpServers"');
    // A changed helper definition is observed passively, rather than executing either definition.
    settings(project, { apiKeyHelper: `${command} changed`, env: { ANTHROPIC_API_KEY: "synthetic-project-canary" } });
    const changed = await boundedRead(process.execPath, [worker], { cwd: project, env: sandbox.env });
    expect(JSON.parse(changed.stdout!).helpers.apiKeyHelper.value).not.toBe(command); expect(existsSync(canary)).toBe(false);
  });
  // Installed-CLI qualification ran on macOS; CI without that CLI still runs the real SDK proof.
  it.skipIf(process.platform !== "darwin" || !findExecutable("claude", process.env))("qualifies projection against installed Claude auth status, and leaves unqualified/host profiles unprojected", async () => {
    const claude = findExecutable("claude", process.env);
    if (!claude) throw new Error("Installed Claude is required for this local qualification proof.");
    sandbox = createSandbox(); const project = join(sandbox.root, "project"); mkdirSync(project);
    const env = { ...sandbox.env }; for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) delete env[key];
    settings(project, { env: { ANTHROPIC_API_KEY: "synthetic-billing-project-canary" } });
    const read = await readInventory({ executable: claude, cwd: project, env });
    const contract = JSON.parse(readFileSync(new URL("../../test/fixtures/billing/claude-passive-contract.json", import.meta.url), "utf8"));
    expect(read.version).toBe(contract.cliVersion); expect(read.inventory.complete).toBe(true);
    expect(read.projected.ANTHROPIC_API_KEY).toBe("synthetic-billing-project-canary"); expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    const auth = await readAuthStatus({ claude, cwd: project, env: read.projected });
    expect(auth.error).toBeUndefined(); expect(auth.authMethod).toBe("api_key");
    const result = classify({ cwd: project, env, read, auth, at: new Date().toISOString() });
    expect(result.summary).toMatchObject({ route: "metered", sources: expect.arrayContaining(["project settings · ANTHROPIC_API_KEY"]) });
    expect(JSON.stringify(result.summary)).not.toContain("synthetic-billing-project-canary");
    const hostEnv = { ...env, CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "1", ANTHROPIC_API_KEY: "inherited-canary" };
    const host = await readInventory({ executable: claude, cwd: project, env: hostEnv });
    expect(host.inventory.complete).toBe(false); expect(host.projected.ANTHROPIC_API_KEY).toBe("inherited-canary");
    expect(ordinaryProfile(hostEnv)).toBe(false);
    const unknown = await readInventory({ executable: process.execPath, cwd: project, env: { ...env, ANTHROPIC_API_KEY: "inherited-canary" } });
    expect(unknown.inventory.diagnostics).toContain("inventory_contract_unqualified"); expect(unknown.projected.ANTHROPIC_API_KEY).toBe("inherited-canary");
  });
  it.skipIf(process.platform !== "darwin" || !findExecutable("claude", process.env))("keeps inactive project/local provider endpoints out of route evidence and approval identity through the real resolver", async () => {
    sandbox = createSandbox(); const project = join(sandbox.root, "project"); mkdirSync(project);
    const env = { ...sandbox.env };
    const cli = findExecutable("claude", env);
    if (!cli) throw new Error("Installed Claude is required for provider endpoint qualification.");
    for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) delete env[key];
    settings(project, { env: { AWS_ENDPOINT_URL: "https://unrelated-aws.example.test", ANTHROPIC_BEDROCK_BASE_URL: "https://inactive-bedrock.example.test", ANTHROPIC_API_KEY: "synthetic-route-canary" } });
    writeFileSync(join(project, ".claude", "settings.local.json"), JSON.stringify({ env: { ANTHROPIC_VERTEX_BASE_URL: "https://inactive-vertex.example.test" } }));
    const read = await readInventory({ executable: cli, cwd: project, env });
    expect(read.inventory.complete).toBe(true);
    expect(read.inventory.sources.ANTHROPIC_VERTEX_BASE_URL).toBe("local settings · ANTHROPIC_VERTEX_BASE_URL");
    const auth = await readAuthStatus({ claude: cli, cwd: project, env: read.projected });
    expect(auth).toMatchObject({ authMethod: "api_key", apiProvider: "firstParty" });
    const result = classify({ cwd: project, env, read, auth, at: "2026-10-26T20:00:00Z" });
    expect(result.summary).toMatchObject({ route: "metered", provider: "Anthropic API" });
    expect(result.summary.sources).toEqual(["Claude Code · ANTHROPIC_API_KEY", "project settings · ANTHROPIC_API_KEY"]);
    // Independent subscription readiness is scripted here; installed auth above proves
    // these same endpoint settings do not select a cloud route. No provider inference.
    settings(project, { env: { AWS_ENDPOINT_URL: "https://unrelated-aws.example.test", ANTHROPIC_BEDROCK_BASE_URL: "https://inactive-bedrock.example.test" } });
    const subscriptionRead = await readInventory({ executable: cli, cwd: project, env });
    const subscription = classify({ cwd: project, env, read: subscriptionRead, auth: { authMethod: "claude.ai", apiProvider: "firstParty", email: "fixture@example.test", orgId: "fixture-org" }, at: "2026-10-26T20:00:00Z" });
    expect(subscription.summary).toMatchObject({ route: "subscription", sources: [], email: "fixture@example.test", orgId: "fixture-org" });
    expect(subscription.identity).not.toHaveProperty("sourceDirectory");
    expect(JSON.stringify(result.summary)).not.toContain("synthetic-route-canary");
  });
  it("records the managed-policy limitation without invoking its helper", () => {
    // Generated contract evidence: real managed host unavailable; SDK 0.3.310 declarations
    // explicitly exclude policyHelper execution. This proves extraction, not native MDM.
    const declarations = readFileSync(new URL("../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts", import.meta.url), "utf8");
    expect(declarations).toContain('`policyHelper` subprocess is not executed');
    const inventory = extractInventory({ effective: { policyHelper: { command: "never-run" }, env: { ANTHROPIC_API_KEY: "managed-canary" } }, sources: [{ source: "managed", settings: { env: { ANTHROPIC_API_KEY: "managed-canary" } } }] });
    expect(inventory).toMatchObject({ complete: false, diagnostics: ["managed_policy_partial"] });
  });
  it.skipIf(process.platform !== "darwin" || !findExecutable("claude", process.env))("ignores inactive credentials and helpers from real project/local settings without losing selected credential changes", async () => {
    sandbox = createSandbox(); const project = join(sandbox.root, "project"); mkdirSync(project);
    const env = { ...sandbox.env }; const cli = findExecutable("claude", env)!;
    for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) delete env[key];
    writeFileSync(join(env.CLAUDE_CONFIG_DIR!, "settings.json"), JSON.stringify({ env: { ANTHROPIC_API_KEY: "synthetic-direct-canary" } }));
    const inspect = async () => {
      const read = await readInventory({ executable: cli, cwd: project, env });
      const auth = await readAuthStatus({ claude: cli, cwd: project, env: read.projected });
      expect(read.inventory.complete).toBe(true); expect(auth).toMatchObject({ authMethod: "api_key", apiProvider: "firstParty" });
      return classify({ cwd: project, env, read, auth, at: "2026-10-26T20:00:00Z" });
    };
    const base = await inspect();
    const canary = join(sandbox.root, "HELPER-MUST-NOT-RUN");
    const helper = `${JSON.stringify(process.execPath)} -e "require('fs').writeFileSync(${JSON.stringify(canary)},'ran')"`;
    settings(project, { env: { ANTHROPIC_FOUNDRY_API_KEY: "inactive-foundry-canary", ANTHROPIC_FOUNDRY_RESOURCE: "inactive-foundry-resource", AWS_PROFILE: "inactive-profile" }, awsAuthRefresh: helper, gcpAuthRefresh: helper });
    writeFileSync(join(project, ".claude", "settings.local.json"), JSON.stringify({ env: { GOOGLE_APPLICATION_CREDENTIALS: "/inactive/google.json", ANTHROPIC_VERTEX_PROJECT_ID: "inactive-project" } }));
    expect((await inspect()).identity).toEqual(base.identity);
    settings(project, { env: { ANTHROPIC_API_KEY: "changed-selected-canary" } });
    const changed = await inspect(); expect(changed.identity).not.toEqual(base.identity);
    expect(changed.summary.sources).toContain("project settings · ANTHROPIC_API_KEY");
    expect(existsSync(canary)).toBe(false); expect(JSON.stringify(changed.summary)).not.toContain("canary");
  });
  it("bounds extracted bytes, cumulative output, timeout and cancellation, discarding all raw failure output", async () => {
    sandbox = createSandbox(); const options = { cwd: sandbox.root, env: sandbox.env, resultLimit: 128, outputLimit: 4096, timeoutMs: 1500 };
    const overResult = await boundedRead(process.execPath, ["-e", "process.stdout.write('secret-canary'.repeat(100));setInterval(()=>{},1000)"], options);
    expect(overResult).toEqual({ diagnostic: "inventory_result_limit" });
    const overOutput = await boundedRead(process.execPath, ["-e", "process.stderr.write('secret-canary'.repeat(1000));setInterval(()=>{},1000)"], options);
    expect(overOutput).toEqual({ diagnostic: "inspection_output_limit" });
    const timeout = await boundedRead(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], options);
    expect(timeout).toEqual({ diagnostic: "inspection_timeout" });
    const abort = new AbortController(); const pending = boundedRead(process.execPath, ["-e", "setInterval(()=>{},1000)"], { ...options, signal: abort.signal }); abort.abort();
    expect(await pending).toEqual({ diagnostic: "inspection_cancelled" });
  });
});
