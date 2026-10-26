import { describe, expect, it } from "vitest";
import { BillingAuthority, newBillingState, assertBillingState } from "./authority.js";
import type { Inspection } from "./inspection.js";
const at = "2026-10-26T14:00:00Z";
const inspection = (identity: unknown = "A", route: "metered" | "subscription" | "settings" = "metered"): Inspection => ({ summary: { agentId: "claude_code", route, provider: "Anthropic API", sources: ["Kiln environment · ANTHROPIC_API_KEY"], observedAt: at, diagnostics: [], approved: false }, identity, launchEnv: {} });
function harness() {
  const state = newBillingState("execution-one"); let next = inspection(); let generation = 0; let busy = false; let writes = 0; let fail = false; let cancelled = false;
  const authority = new BillingAuthority({ state: () => state, generation: () => generation, inspect: async () => structuredClone(next), save: () => { if (fail) throw new Error("secret-canary"); writes++; }, changed: () => {}, busy: () => busy, readiness: () => true, cancelled: () => cancelled, completed: () => false, now: () => at });
  const read = () => authority.refresh("/repo", {});
  const body = () => ({ executionId: state.executionId, selectionGeneration: generation, readingId: authority.view.next!.readingId, approved: true });
  return { state, authority, read, body, next: (value: Inspection) => { next = value; }, generation: () => { generation++; }, busy: (value: boolean) => { busy = value; }, fail: () => { fail = true; }, cancel: () => { cancelled = true; }, writes: () => writes };
}
describe("execution-scoped billing approval", () => {
  it("requires a current reviewed reading, never exposes HMAC material, survives unchanged readings and timestamp-only changes", async () => {
    const h = harness(); await h.read(); expect(h.authority.view.canLaunch).toBe(false);
    const body = h.body(); await h.authority.command("approval", body, "/repo", {});
    expect(h.authority.view.canLaunch).toBe(true); expect(h.state.approval?.executionId).toBe("execution-one");
    expect(JSON.stringify(h.authority.view)).not.toContain(h.state.key);
    expect(JSON.stringify(h.authority.view)).not.toContain(h.state.current!.fingerprint);
    const unchanged = inspection(); unchanged.summary.observedAt = "2026-10-26T14:01:00Z"; h.next(unchanged); await h.read(); expect(h.authority.view.next?.approved).toBe(true);
  });
  it.each(["source", "provider", "payer", "credential", "contract"])("invalidates on observable %s change and never restores approval on A → B → A", async field => {
    const h = harness(); h.next(inspection({ [field]: "A" })); await h.read(); await h.authority.command("approval", h.body(), "/repo", {});
    const digest = h.state.current!.fingerprint;
    h.next(inspection({ [field]: "B" })); await h.read(); expect(h.state.approval).toBeUndefined(); expect(h.state.current!.fingerprint).not.toBe(digest);
    h.next(inspection({ [field]: "A" })); await h.read(); expect(h.state.current!.fingerprint).toBe(digest); expect(h.authority.view.canLaunch).toBe(false);
  });
  it("rejects stale clicks, changed selections, extra fields and concurrent work without granting or dispatching", async () => {
    const h = harness(); await h.read(); const old = h.body(); h.next(inspection("B"));
    await expect(h.authority.command("approval", old, "/repo", {})).rejects.toMatchObject({ code: "stale_billing_reading" });
    expect(h.state.approval).toBeUndefined();
    await expect(h.authority.command("approval", { ...h.body(), credential: "secret" }, "/repo", {})).rejects.toMatchObject({ code: "invalid_request" });
    h.busy(true); await expect(h.authority.command("approval", h.body(), "/repo", {})).rejects.toMatchObject({ code: "billing_busy" }); h.busy(false);
    const selected = h.body(); h.generation(); await expect(h.authority.command("approval", selected, "/repo", {})).rejects.toMatchObject({ code: "execution_changed" });
    expect(h.state.approval).toBeUndefined();
  });
  it("retains detected override evidence after optional failure and clears approval after switching away", async () => {
    const h = harness(); await h.read(); await h.authority.command("approval", h.body(), "/repo", {});
    const unavailable = inspection("unavailable", "settings"); unavailable.summary.sources = []; unavailable.summary.diagnostics = ["inspection_timeout"]; h.next(unavailable); await h.read();
    expect(h.authority.view.next).toMatchObject({ route: "metered", approved: false, sources: ["Kiln environment · ANTHROPIC_API_KEY"] });
    h.next(inspection("subscription", "subscription")); await h.read(); expect(h.state.approval).toBeUndefined(); expect(h.authority.view.canLaunch).toBe(true);
  });
  it("clears explicitly without launching and a new execution cannot inherit a grant", async () => {
    const h = harness(); await h.read(); await h.authority.command("approval", h.body(), "/repo", {});
    const body: Record<string, unknown> = h.body(); delete body.approved; await h.authority.command("clear", body, "/repo", {});
    expect(h.state.approval).toBeUndefined(); expect(h.authority.view.canLaunch).toBe(false);
    expect(newBillingState("new-execution")).not.toHaveProperty("approval");
    expect(() => assertBillingState(h.state, "different-execution")).toThrow("Invalid billing authorization");
  });
  it("fails closed on durable write failure, with sanitized errors and no retained credential", async () => {
    const h = harness(); h.next(inspection({ key: "credential-canary" })); await h.read(); h.fail();
    await expect(h.authority.command("approval", h.body(), "/repo", {})).rejects.toMatchObject({ code: "billing_state_write_failed", message: "Billing state could not be saved. No AI work was authorized." });
    expect(h.state.approval).toBeUndefined(); expect(JSON.stringify(h.state)).not.toContain("credential-canary"); expect(h.authority.view.canLaunch).toBe(false);
  });
});

// Compose the real context extractor with authority; artificial digest inputs alone would
// not notice accidentally omitting a helper/source/payer from the canonical identity.
import { classify, type InventoryRead } from "./inspection.js";
import { emptyInventory } from "./contract.js";
it("keeps approval across unrelated provider changes but revokes it for selected credentials, helpers and sources", async () => {
  let selected = "firstParty"; let env: Record<string, string> = { ANTHROPIC_API_KEY: "same-key" };
  let helpers: InventoryRead["inventory"]["helpers"] = {}; let source = "user";
  const state = newBillingState("execution");
  const a = new BillingAuthority({ state: () => state, generation: () => 0, inspect: async () => classify({ cwd: "/repo", env, read: { version: "2.1.307", sdkVersion: "0.3.310", projected: env, inventory: { ...emptyInventory(""), complete: true, diagnostics: [], env, sources: { ANTHROPIC_API_KEY: `${source} settings · ANTHROPIC_API_KEY` }, helpers } }, auth: { authMethod: "api_key", apiProvider: selected }, at }), save: () => {}, changed: () => {}, busy: () => false, cancelled: () => false, readiness: () => true, completed: () => false, now: () => at });
  const approve = async () => { await a.refresh("/repo", {}); await a.command("approval", { executionId: "execution", selectionGeneration: 0, readingId: a.view.next!.readingId, approved: true }, "/repo", {}); };
  await approve(); const digest = state.current!.fingerprint;
  env = { ...env, ANTHROPIC_FOUNDRY_RESOURCE: "unrelated-resource", GOOGLE_APPLICATION_CREDENTIALS: "/unrelated/google.json", AWS_PROFILE: "unrelated-aws" };
  helpers = { awsAuthRefresh: { value: "private-aws-helper", source: "project settings · awsAuthRefresh" }, gcpAuthRefresh: { value: "private-google-helper", source: "project settings · gcpAuthRefresh" } };
  await a.refresh("/repo", {}); expect(a.view.canLaunch).toBe(true); expect(state.current!.fingerprint).toBe(digest);
  selected = "bedrock"; await a.refresh("/repo", {}); expect(a.view.canLaunch).toBe(false);
  await approve(); const bedrock = state.current!.fingerprint;
  env.GOOGLE_APPLICATION_CREDENTIALS = "/another/google.json"; env.ANTHROPIC_FOUNDRY_RESOURCE = "another-unrelated-resource";
  helpers.gcpAuthRefresh!.value = "another-google-helper";
  await a.refresh("/repo", {}); expect(a.view.canLaunch).toBe(true); expect(state.current!.fingerprint).toBe(bedrock);
  env.AWS_PROFILE = "changed-selected-profile"; await a.refresh("/repo", {}); expect(a.view.canLaunch).toBe(false);
  await approve(); helpers.awsAuthRefresh!.value = "changed-selected-helper";
  await a.refresh("/repo", {}); expect(a.view.canLaunch).toBe(false);
  await approve(); source = "project";
  await a.refresh("/repo", {}); expect(a.view.canLaunch).toBe(false);
});
it.each(["source", "helper", "provider", "payer", "cliVersion", "sdkVersion", "launchProfile"])("invalidates extracted %s context and never restores its old grant", async kind => {
  const make = (which: "A" | "B") => {
    const env: Record<string, string> = { ANTHROPIC_API_KEY: "same-synthetic-credential" };
    const inventory = { ...emptyInventory(""), complete: true, diagnostics: [] as string[], env: {}, sources: {} as Record<string, string> };
    if (kind === "source") { inventory.env = { ANTHROPIC_API_KEY: "same-synthetic-credential" }; inventory.sources.ANTHROPIC_API_KEY = `${which === "A" ? "user" : "project"} settings · ANTHROPIC_API_KEY`; }
    if (kind === "helper") inventory.helpers.apiKeyHelper = { value: `synthetic-helper-${which}`, source: "project settings · apiKeyHelper" };
    if (kind === "provider") env.CLAUDE_CODE_USE_BEDROCK = "1";
    if (kind === "launchProfile") env.CLAUDE_CONFIG_DIR = `/synthetic-config-${which}`;
    const read: InventoryRead = { inventory, version: kind === "cliVersion" && which === "B" ? "2.1.308" : "2.1.307", sdkVersion: kind === "sdkVersion" && which === "B" ? "0.3.311" : "0.3.310", projected: env };
    return classify({ cwd: "/repo", env, read, auth: { authMethod: "api_key", apiProvider: kind === "provider" && which === "B" ? "bedrock" : "firstParty", orgId: kind === "payer" ? which : "same-org" }, at });
  };
  const state = newBillingState("execution"); let next = make("A");
  const a = new BillingAuthority({ state: () => state, generation: () => 0, inspect: async () => structuredClone(next), save: () => {}, changed: () => {}, busy: () => false, cancelled: () => false, readiness: () => true, completed: () => false, now: () => at });
  await a.refresh("/repo", {}); await a.command("approval", { executionId: "execution", selectionGeneration: 0, readingId: a.view.next!.readingId, approved: true }, "/repo", {});
  expect(a.view.next?.approved).toBe(true); const digest = state.current!.fingerprint;
  next = make("B"); await a.refresh("/repo", {}); expect(state.current!.fingerprint).not.toBe(digest); expect(state.approval).toBeUndefined();
  next = make("A"); await a.refresh("/repo", {}); expect(state.current!.fingerprint).toBe(digest); expect(a.view.next?.approved).toBe(false);
});
