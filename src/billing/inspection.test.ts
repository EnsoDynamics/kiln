import { describe, expect, it } from "vitest";
import { classify, type InventoryRead } from "./inspection.js";
import { extractInventory, emptyInventory } from "./contract.js";
const at = "2026-10-26T14:00:00Z";
const auth = { authMethod: "claude.ai", apiProvider: "firstParty", email: "subscription@example.test", orgId: "org", plan: "Max plan" };
function read(env: Record<string, string>, complete = true): InventoryRead { return { version: "2.1.307", projected: env, inventory: { ...emptyInventory(""), diagnostics: complete ? [] : ["inventory_read_failed"], complete } }; }
const run = (env: Record<string, string>, ready = auth, complete = true) => classify({ cwd: "/repo", env, read: read(env, complete), auth: ready, at });
describe("billing evidence classification", () => {
  it("requires route evidence beyond a plan or email, and keeps optional failure neutral without overrides", () => {
    expect(run({}).summary).toMatchObject({ route: "subscription", email: "subscription@example.test" });
    expect(run({}, { ...auth, authMethod: "oauth_token" }).summary.route).toBe("settings");
    expect(run({}, auth, false).summary).toMatchObject({ route: "settings", diagnostics: ["inventory_read_failed"] });
    expect(run({ ANTHROPIC_API_KEY: "canary" }, auth, false).summary).toMatchObject({ route: "metered", provider: "Anthropic API" });
  });
  it.each(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX"])("retains concrete %s evidence without claiming the subscription's email as payer", key => {
    const result = run({ [key]: "private-canary" });
    expect(result.summary.route).toBe("metered"); expect(result.summary.email).toBeUndefined(); expect(JSON.stringify(result.summary)).not.toContain("private-canary"); expect(result.summary.sources).toContain(`Kiln environment · ${key}`);
  });
  it("does not select a cloud provider from unrelated AWS credentials or ordinary custom headers", () => {
    const base = run({}); const extra = run({ AWS_PROFILE: "other-work", ANTHROPIC_CUSTOM_HEADERS: "X-Trace: yes" });
    expect(extra.summary.route).toBe("subscription"); expect(extra.identity).toEqual(base.identity);
    expect(run({ ANTHROPIC_CUSTOM_HEADERS: "Authorization: Bearer canary" }).summary.route).toBe("metered");
    expect(run({ ANTHROPIC_BASE_URL: "https://api.anthropic.com" }).summary.route).toBe("subscription");
    expect(run({ ANTHROPIC_FEDERATION_RULE_ID: "rule", ANTHROPIC_ORGANIZATION_ID: "org" }).summary.route).toBe("metered");
  });
  const providerEndpoints = [
    ["ANTHROPIC_BEDROCK_BASE_URL", "BEDROCK", "bedrock"],
    ["ANTHROPIC_FOUNDRY_BASE_URL", "FOUNDRY", "foundry"],
    ["ANTHROPIC_AWS_BASE_URL", "ANTHROPIC_AWS", "configured"],
    ["ANTHROPIC_GOOGLE_CLOUD_BASE_URL", "ANTHROPIC_GOOGLE_CLOUD", "configured"],
    ["ANTHROPIC_BEDROCK_MANTLE_BASE_URL", "MANTLE", "mantle"],
    ["ANTHROPIC_VERTEX_BASE_URL", "VERTEX", "vertex"],
    ["AWS_ENDPOINT_URL", "BEDROCK", "bedrock"],
    ["AWS_ENDPOINT_URL_BEDROCK", "BEDROCK", "bedrock"],
    ["AWS_ENDPOINT_URL_BEDROCK_RUNTIME", "BEDROCK", "bedrock"],
  ];
  it.each(providerEndpoints)("scopes %s evidence and private identity to its selected provider", (key, selector, provider) => {
    const endpoint = { [key!]: "https://unrelated.example.test/private-canary" };
    for (const complete of [true, false]) {
      const base = run({}, auth, complete); const inactive = run(endpoint, auth, complete);
      expect(inactive.summary).toEqual(base.summary); expect(inactive.identity).toEqual(base.identity);
      expect(inactive.launchEnv).toEqual(endpoint); // Work environment is never rewritten.
      const api = { ANTHROPIC_API_KEY: "synthetic-key" };
      expect(run({ ...api, ...endpoint }, auth, complete).identity).toEqual(run(api, auth, complete).identity);
      const selected = run({ ...endpoint, [`CLAUDE_CODE_USE_${selector}`]: "1" }, { ...auth, apiProvider: provider! }, complete);
      expect(selected.summary).toMatchObject({ route: "metered", sources: expect.arrayContaining([`Kiln environment · ${key}`]) });
      expect(JSON.stringify(selected.summary)).not.toContain("private-canary");
      expect(run({ ...endpoint, [`CLAUDE_CODE_USE_${selector}`]: "" }, auth, complete).identity).toEqual(run({ [`CLAUDE_CODE_USE_${selector}`]: "" }, auth, complete).identity);
    }
  });
  it("uses reported provider selection without selectors and does not mistake another provider's endpoint for an override", () => {
    const providerAuth = { ...auth, apiProvider: "bedrock" };
    expect(run({ ANTHROPIC_BEDROCK_BASE_URL: "https://gateway.test" }, providerAuth).summary.sources).toContain("Kiln environment · ANTHROPIC_BEDROCK_BASE_URL");
    const base = run({}, providerAuth);
    expect(run({ ANTHROPIC_VERTEX_BASE_URL: "https://inactive.test" }, providerAuth).identity).toEqual(base.identity);
    expect(run({ CLAUDE_CODE_USE_VERTEX: "1", CLAUDE_CODE_USE_FOUNDRY: "1", ANTHROPIC_VERTEX_BASE_URL: "https://gateway.test" }, { ...auth, apiProvider: "configured" }).summary).toMatchObject({ route: "metered", sources: expect.arrayContaining(["Kiln environment · ANTHROPIC_VERTEX_BASE_URL"]) });
  });
  it("preserves neutral-route account and organization-only identity without fabricating an API payer", () => {
    expect(run({}, auth, false).summary).toMatchObject({ route: "settings", email: auth.email, orgId: auth.orgId });
    expect(run({}, { ...auth, email: undefined } as unknown as typeof auth).summary).toMatchObject({ route: "subscription", orgId: auth.orgId });
    const metered = run({ ANTHROPIC_BASE_URL: "https://gateway.test" }).summary;
    expect(metered.email).toBeUndefined(); expect(metered.orgId).toBeUndefined();
  });
  it("uses per-key source precedence, preserves literal empty overrides, and treats managed helpers as partial without executing them", () => {
    const inventory = extractInventory({ effective: { env: { ANTHROPIC_API_KEY: "", ANTHROPIC_BASE_URL: "https://proxy.test" }, policyHelper: { command: "never-execute" } }, sources: [ { source: "user", settings: { env: { ANTHROPIC_API_KEY: "canary" } } }, { source: "project", settings: { env: { ANTHROPIC_BASE_URL: "https://proxy.test" } } }, { source: "local", settings: { env: { ANTHROPIC_API_KEY: "" } } } ] });
    expect(inventory.env.ANTHROPIC_API_KEY).toBe(""); expect(inventory.sources).toEqual({ ANTHROPIC_API_KEY: "local settings · ANTHROPIC_API_KEY", ANTHROPIC_BASE_URL: "project settings · ANTHROPIC_BASE_URL" });
    expect(inventory).toMatchObject({ complete: false, diagnostics: ["managed_policy_partial"] });
  });
  it("keeps authentication failure separate from a detected override", () => {
    const result = run({ ANTHROPIC_API_KEY: "canary" }, { ...auth, error: "Sign in first" } as typeof auth);
    expect(result.readinessError).toBe("Sign in first"); expect(result.summary.route).toBe("metered");
  });
});
