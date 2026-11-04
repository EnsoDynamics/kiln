import { describe, expect, it } from "vitest";
import { classify, type InventoryRead } from "./inspection.js";
import { extractInventory, emptyInventory, resolveInventory } from "./contract.js";
const at = "2026-10-26T14:00:00Z";
const auth = { authMethod: "claude.ai", apiProvider: "firstParty", email: "subscription@example.test", orgId: "org", plan: "Max plan" };
function read(env: Record<string, string>, complete = true): InventoryRead { return { version: "2.1.311", projected: env, inventory: { ...emptyInventory(""), diagnostics: complete ? [] : ["inventory_read_failed"], complete } }; }
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
  it("scopes provider credentials, cloud context, skip-auth and helpers to the effective provider in complete and partial inventories", () => {
    const groups = [
      { provider: "bedrock", keys: ["AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ROLE_ARN", "AWS_WEB_IDENTITY_TOKEN_FILE", "CLAUDE_CODE_SKIP_BEDROCK_AUTH"], helpers: ["awsCredentialExport", "awsAuthRefresh"] },
      { provider: "foundry", keys: ["ANTHROPIC_FOUNDRY_API_KEY", "ANTHROPIC_FOUNDRY_AUTH_TOKEN", "ANTHROPIC_FOUNDRY_RESOURCE", "CLAUDE_CODE_SKIP_FOUNDRY_AUTH"], helpers: [] },
      { provider: "anthropic_aws", keys: ["ANTHROPIC_AWS_API_KEY", "ANTHROPIC_AWS_WORKSPACE_ID", "CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH"], helpers: ["awsCredentialExport"] },
      { provider: "vertex", keys: ["ANTHROPIC_VERTEX_PROJECT_ID", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "GOOGLE_CLOUD_QUOTA_PROJECT", "CLOUD_ML_REGION", "CLAUDE_CODE_SKIP_VERTEX_AUTH"], helpers: ["gcpAuthRefresh"] },
      { provider: "anthropic_google_cloud", keys: ["ANTHROPIC_GOOGLE_CLOUD_PROJECT", "ANTHROPIC_GOOGLE_CLOUD_LOCATION", "ANTHROPIC_GOOGLE_CLOUD_WORKSPACE_ID", "CLAUDE_CODE_SKIP_ANTHROPIC_GOOGLE_CLOUD_AUTH"], helpers: ["gcpAuthRefresh"] },
      { provider: "mantle", keys: ["AWS_PROFILE", "CLAUDE_CODE_SKIP_MANTLE_AUTH"], helpers: ["awsAuthRefresh"] },
    ];
    for (const complete of [true, false]) for (const group of groups) {
      for (const key of group.keys) {
        const base = { ANTHROPIC_API_KEY: "synthetic-direct-key" };
        const extra = { ...base, [key]: "private-context-canary" };
        expect(run(extra, auth, complete).identity).toEqual(run(base, auth, complete).identity);
        const selected = { ...auth, apiProvider: group.provider };
        expect(run(extra, selected, complete).identity).not.toEqual(run(base, selected, complete).identity);
        const other = { ...auth, apiProvider: group.provider === "foundry" ? "bedrock" : "foundry" };
        expect(run(extra, other, complete).identity).toEqual(run(base, other, complete).identity);
        // Incomplete inventories retain conflicting inherited and settings evidence.
        const env = { ...base, [key]: "inherited-canary" }; const reading = read(env, complete);
        reading.inventory.env[key] = "settings-canary"; reading.inventory.sources[key] = `project settings · ${key}`;
        const inspect = classify({ cwd: "/repo", env, read: reading, auth: selected, at });
        expect(JSON.stringify(inspect.identity)).toContain(complete ? "inherited-canary" : "settings-canary");
        if (!complete) expect(inspect.identity).toHaveProperty(`inherited.${key}`, "inherited-canary");
        expect(JSON.stringify(inspect.summary)).not.toContain("canary");
      }
      for (const key of group.helpers) {
        const env = { ANTHROPIC_API_KEY: "synthetic-direct-key" }; const reading = read(env, complete);
        reading.inventory.helpers[key] = { value: "private-helper-canary", source: `project settings · ${key}` };
        const inspect = (provider: string) => classify({ cwd: "/repo", env, read: reading, auth: { ...auth, apiProvider: provider }, at });
        expect(inspect("firstParty").identity).toEqual(run(env, auth, complete).identity);
        expect(JSON.stringify(inspect(group.provider).identity)).toContain("private-helper-canary");
        expect(inspect(group.provider).summary.sources).toContain(`project settings · ${key}`);
        expect(JSON.stringify(inspect(group.provider).summary)).not.toContain("private-helper-canary");
      }
    }
  });
  it("preserves neutral-route account and organization-only identity without fabricating an API payer", () => {
    expect(run({}, auth, false).summary).toMatchObject({ route: "settings", email: auth.email, orgId: auth.orgId });
    expect(run({}, { ...auth, email: undefined } as unknown as typeof auth).summary).toMatchObject({ route: "subscription", orgId: auth.orgId });
    const metered = run({ ANTHROPIC_BASE_URL: "https://gateway.test" }).summary;
    expect(metered.email).toBeUndefined(); expect(metered.orgId).toBeUndefined();
  });
  it("retains inherited provider candidates when partial settings clear or replace their selectors", () => {
    for (const apiProvider of [undefined, "configured", "firstParty"]) for (const override of ["0", "false"]) {
      const env = { CLAUDE_CODE_USE_BEDROCK: "1", AWS_PROFILE: "payer-a" };
      const reading = read(env, false);
      reading.inventory.env = { CLAUDE_CODE_USE_BEDROCK: override, CLAUDE_CODE_USE_VERTEX: "1" };
      reading.inventory.helpers.awsAuthRefresh = { value: "selected-helper-a", source: "project settings · awsAuthRefresh" };
      const ready = { authMethod: auth.authMethod, email: auth.email, orgId: auth.orgId, ...(apiProvider ? { apiProvider } : {}) };
      const inspect = () => classify({ cwd: "/repo", env, read: reading, auth: ready, at });
      const base = structuredClone(inspect());
      expect(base.summary).toMatchObject({ route: "metered", sources: expect.arrayContaining(["Kiln environment · CLAUDE_CODE_USE_BEDROCK", "project settings · awsAuthRefresh"]) });
      expect(base.summary.provider).toBeUndefined();
      expect(base.identity).toHaveProperty("env.AWS_PROFILE", "payer-a");
      expect(base.identity).toHaveProperty("inherited.AWS_PROFILE", "payer-a");
      env.AWS_PROFILE = "payer-b"; expect(inspect().identity).not.toEqual(base.identity);
      env.AWS_PROFILE = "payer-a"; reading.inventory.helpers.awsAuthRefresh.value = "selected-helper-b";
      expect(inspect().identity).not.toEqual(base.identity);
    }
  });
  it("retains observable context for an unnamed configured provider without recognizing unrelated selector names", () => {
    expect(run({ CLAUDE_CODE_USE_UNRELATED: "1" }, auth, false).summary).toEqual(run({}, auth, false).summary);
    for (const complete of [true, false]) {
      const env = { AWS_PROFILE: "payer-a", ANTHROPIC_FOUNDRY_RESOURCE: "resource-a" }; const reading = read(env, complete);
      reading.inventory.helpers.gcpAuthRefresh = { value: "helper-a", source: "project settings · gcpAuthRefresh" };
      const inspect = () => classify({ cwd: "/repo", env, read: reading, auth: { authMethod: "oauth_token", apiProvider: "configured" }, at });
      const base = structuredClone(inspect()); expect(base.summary.route).toBe("metered"); expect(base.summary.provider).toBeUndefined();
      expect(base.identity).toHaveProperty("env.AWS_PROFILE", "payer-a");
      expect(base.identity).toHaveProperty("env.ANTHROPIC_FOUNDRY_RESOURCE", "resource-a");
      env.AWS_PROFILE = "payer-b"; expect(inspect().identity).not.toEqual(base.identity);
      env.AWS_PROFILE = "payer-a"; reading.inventory.helpers.gcpAuthRefresh.value = "helper-b";
      expect(inspect().identity).not.toEqual(base.identity);
    }
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
  // Recognition is the only billing gate now that no version qualifies it (AC-AGENT-02, AC-AGENT-07).
  it("confirms a subscription only from a resolver result it fully recognises, ignoring fields it doesn't read", () => {
    const viaResolver = (raw: unknown, ready = auth) => classify({ cwd: "/repo", env: {}, read: { version: "2.1.318", projected: {}, inventory: extractInventory(raw) }, auth: ready, at }).summary;
    const recognised = { effective: { env: {}, someFutureSetting: { nested: true } }, sources: [{ source: "user", settings: { env: {}, futureKey: 1 } }], futureTopLevel: "ignored" };
    expect(viaResolver(recognised)).toMatchObject({ route: "subscription", email: "subscription@example.test", diagnostics: [] });
    expect(viaResolver({ effective: { env: {} } })).toMatchObject({ route: "settings", diagnostics: ["inventory_malformed"] });
    expect(viaResolver({ effective: { env: {} }, sources: [{ source: "enterprise-cloud", settings: {} }] })).toMatchObject({ route: "settings", diagnostics: ["inventory_source_unknown"] });
    expect(viaResolver({ effective: { env: { ANTHROPIC_BASE_URL: 42 } }, sources: [] })).toMatchObject({ route: "settings", diagnostics: ["inventory_field_malformed"] });
    expect(viaResolver({ effective: { env: {}, apiKeyHelper: { command: "x" } }, sources: [] })).toMatchObject({ route: "settings", diagnostics: ["inventory_field_malformed"] });
    expect(viaResolver(recognised, { ...auth, authMethod: "future_login_method" }).route).toBe("settings");
  });
  it("reads no inventory from an Agent SDK that doesn't provide the settings resolver, and passes the launch directory to one that does", async () => {
    expect(await resolveInventory({}, "/repo")).toEqual(emptyInventory("inventory_resolver_unavailable"));
    expect(await resolveInventory({ resolveSettings: "not a function" }, "/repo")).toMatchObject({ complete: false, diagnostics: ["inventory_resolver_unavailable"] });
    const calls: unknown[] = [];
    const inventory = await resolveInventory({ resolveSettings: async (options: unknown) => { calls.push(options); return { effective: { env: {} }, sources: [] }; } }, "/repo");
    expect(calls).toEqual([{ cwd: "/repo", settingSources: ["user", "project", "local"] }]); expect(inventory).toMatchObject({ complete: true, diagnostics: [] });
  });
});
