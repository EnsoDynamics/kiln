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
