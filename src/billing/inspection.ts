import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BILLING_CONTRACT, BILLING_KEYS, emptyInventory, ordinaryProfile, type Inventory } from "./contract.js";
import { boundedRead } from "./bounded-process.js";
import type { AccountStatus } from "../account/claude-account.js";
export interface WorkspaceCredits {
  bucketId: string;
  accountId: string;
  observedAt: string;
  scope: "workspace";
  balance?: string;
  hasCredits?: boolean;
}
export interface BillingSummary {
  agentId: "claude_code" | "codex";
  route: "subscription" | "metered" | "settings";
  provider?: string;
  sources: string[];
  email?: string;
  orgId?: string;
  accountId?: string;
  credits?: WorkspaceCredits[];
  plan?: string;
  observedAt: string;
  diagnostics: string[];
  overflow?: { enabled: boolean; observedAt: string };
  approved: boolean;
}
export interface Inspection {
  summary: BillingSummary;
  /** Private canonical material; never serialized to any record, error, log or browser. */
  identity: unknown;
  launchEnv: NodeJS.ProcessEnv;
  readinessError?: string;
}
export interface InventoryRead { inventory: Inventory; version: string; sdkVersion?: string; projected: NodeJS.ProcessEnv; }
const require = createRequire(import.meta.url);
function sdkVersion(): string {
  try { return (JSON.parse(readFileSync(join(dirname(require.resolve("@anthropic-ai/claude-agent-sdk")), "package.json"), "utf8")) as { version: string }).version; }
  catch { return "unavailable"; }
}
export async function readInventory(options: { executable: string; cwd: string; env: NodeJS.ProcessEnv; args?: string[]; signal?: AbortSignal }): Promise<InventoryRead> {
  const started = Date.now();
  const versionRead = await boundedRead(options.executable, ["--version"], { ...options, timeoutMs: 5000, resultLimit: 4096 });
  const version = /^(\d+\.\d+\.\d+)(?:\s|$)/.exec(versionRead.stdout?.trim() ?? "")?.[1] ?? "unqualified";
  const installedSdkVersion = sdkVersion();
  const qualified = version === "2.1.307" && installedSdkVersion === "0.3.310";
  let inventory = emptyInventory("inventory_contract_unqualified");
  if (qualified) {
    const result = await boundedRead(process.execPath, [fileURLToPath(new URL("../../dist/billing/settings-worker.js", import.meta.url))], { ...options, timeoutMs: Math.max(1001, 30_000 - (Date.now() - started)) });
    if (result.diagnostic) inventory = emptyInventory(result.diagnostic);
    else {
      try { inventory = JSON.parse(result.stdout!) as Inventory; }
      catch { inventory = emptyInventory("inventory_malformed"); }
    }
  }
  if (!ordinaryProfile(options.env) || (options.args ?? []).some(arg => ["--settings", "--setting-sources", "--managed-settings"].includes(arg))) {
    inventory.complete = false; inventory.diagnostics.push("inventory_launch_profile_partial");
  }
  const projected = { ...options.env };
  if (qualified && inventory.complete) for (const [key, value] of Object.entries(inventory.env)) projected[key] = value;
  return { inventory, version, sdkVersion: installedSdkVersion, projected };
}
const active = (value: string | undefined) => value !== undefined && value !== "" && value !== "0" && value !== "false";
const endpointOverride = (value: string) => {
  try { const url = new URL(value); return url.origin !== "https://api.anthropic.com" || !["", "/"].includes(url.pathname) || !!url.username || !!url.password || !!url.search; }
  catch { return true; }
};
const cloudKey = (key: string) => /^(AWS_|GOOGLE_|GCLOUD_|CLOUD_ML_)/.test(key);
// Provider-specific endpoints do not select a provider. CLI metadata resolves
// selection when available; otherwise retain the concrete active selector evidence.
const endpointProviders: Record<string, string[]> = {
  ANTHROPIC_BEDROCK_BASE_URL: ["bedrock"],
  ANTHROPIC_FOUNDRY_BASE_URL: ["foundry"],
  ANTHROPIC_AWS_BASE_URL: ["anthropic_aws"],
  ANTHROPIC_GOOGLE_CLOUD_BASE_URL: ["anthropic_google_cloud"],
  ANTHROPIC_BEDROCK_MANTLE_BASE_URL: ["mantle"],
  ANTHROPIC_VERTEX_BASE_URL: ["vertex"],
  AWS_ENDPOINT_URL: ["bedrock", "mantle", "anthropic_aws"],
  AWS_ENDPOINT_URL_BEDROCK: ["bedrock"],
  AWS_ENDPOINT_URL_BEDROCK_RUNTIME: ["bedrock"],
};
/** Deterministic classification, paired with real resolver and auth-status boundary tests. */
export function classify(options: { cwd: string; env: NodeJS.ProcessEnv; read: InventoryRead; auth: AccountStatus; at: string }): Inspection {
  const { read, auth } = options; const { inventory } = read;
  const effective: Record<string, string> = {};
  const provenance: Record<string, string> = {};
  for (const key of BILLING_KEYS) {
    const value = read.projected[key];
    if (value !== undefined) { effective[key] = value; provenance[key] = inventory.complete && Object.hasOwn(inventory.env, key) ? inventory.sources[key] ?? `Claude Code settings · ${key}` : `Kiln environment · ${key}`; }
  }
  // Partial cascades remain evidence; they cannot clear inherited overrides.
  if (!inventory.complete) for (const [key, value] of Object.entries(inventory.env)) if (value !== "") {
    effective[key] = value; provenance[key] = inventory.sources[key] ?? `Claude Code settings · ${key}`;
  }
  const evidence = new Set<string>();
  const add = (key: string) => { if (effective[key]) evidence.add(provenance[key]!); };
  for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"]) add(key);
  if (effective.ANTHROPIC_FEDERATION_RULE_ID && effective.ANTHROPIC_ORGANIZATION_ID) { add("ANTHROPIC_FEDERATION_RULE_ID"); add("ANTHROPIC_ORGANIZATION_ID"); }
  const selectors = Object.keys(effective).filter(key => key.startsWith("CLAUDE_CODE_USE_") && active(effective[key]));
  selectors.forEach(add);
  const selectedProviders = auth.apiProvider && !["firstParty", "configured"].includes(auth.apiProvider)
    ? [auth.apiProvider] : selectors.map(key => key.slice("CLAUDE_CODE_USE_".length).toLowerCase());
  const relevantEndpoint = (key: string) => !endpointProviders[key] || endpointProviders[key].some(provider => selectedProviders.includes(provider));
  const endpointOverrides = Object.keys(effective).filter(key => (key.includes("BASE_URL") || key.startsWith("AWS_ENDPOINT_URL")) && relevantEndpoint(key) && effective[key] && endpointOverride(effective[key]!));
  endpointOverrides.forEach(add);
  const headers = effective.ANTHROPIC_CUSTOM_HEADERS;
  if (headers && /(?:authorization|api[-_]key|token|organization|tenant|routing|host)\s*:/i.test(headers)) add("ANTHROPIC_CUSTOM_HEADERS");
  for (const [key, helper] of Object.entries(inventory.helpers)) if (helper.value && (key === "apiKeyHelper" || selectors.length)) evidence.add(helper.source);
  if (["api_key", "api_key_helper"].includes(auth.authMethod ?? "") || auth.apiKeySource) evidence.add(auth.apiKeySource === "ANTHROPIC_API_KEY" ? "Claude Code · ANTHROPIC_API_KEY" : "Claude Code configured API source");
  if (auth.apiProvider && auth.apiProvider !== "firstParty") evidence.add("Claude Code provider settings");
  const named: Record<string, string> = { firstParty: "Anthropic API", bedrock: "Amazon Bedrock", vertex: "Google Vertex AI", foundry: "Microsoft Foundry", mantle: "Amazon Bedrock Mantle" };
  let provider = auth.apiProvider ? named[auth.apiProvider] : undefined;
  if (provider === "Anthropic API" && (selectors.length || endpointOverrides.length)) provider = undefined;
  const route = evidence.size ? "metered" : inventory.complete && auth.authMethod === "claude.ai" && auth.apiProvider === "firstParty" ? "subscription" : "settings";
  const summary: BillingSummary = { agentId: "claude_code", route, sources: [...evidence].sort(), observedAt: options.at, diagnostics: [...new Set(inventory.diagnostics)], approved: false };
  if (route === "metered") {
    if (!provider && !selectors.length && !headers && !endpointOverrides.length && (effective.ANTHROPIC_API_KEY || ["api_key", "api_key_helper"].includes(auth.authMethod ?? ""))) provider = "Anthropic API";
    if (provider) summary.provider = provider;
    // Subscription identity is never substituted for an API payer.
  } else {
    if (auth.email) summary.email = auth.email;
    if (auth.orgId) summary.orgId = auth.orgId;
    if (auth.plan) summary.plan = auth.plan;
  }
  const privateEnv = Object.fromEntries(Object.entries(effective).filter(([key]) => relevantEndpoint(key)).filter(([key]) => !cloudKey(key) || selectors.length || auth.apiProvider && auth.apiProvider !== "firstParty").filter(([key]) => key !== "ANTHROPIC_CUSTOM_HEADERS" || evidence.has(provenance[key]!)).sort(([a], [b]) => a.localeCompare(b)));
  const privateHelpers = Object.fromEntries(Object.entries(inventory.helpers).filter(([key]) => key === "apiKeyHelper" || selectors.length || auth.apiProvider && auth.apiProvider !== "firstParty"));
  const localSources = Object.keys(privateEnv).some(key => /^(project|local) settings/.test(provenance[key]!)) || Object.values(privateHelpers).some(helper => /^(project|local) settings/.test(helper.source));
  return { summary, launchEnv: { ...options.env }, ...(auth.error ? { readinessError: auth.error } : {}), identity: { contract: BILLING_CONTRACT, launchProfile: Object.fromEntries(["CLAUDE_CONFIG_DIR", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_ENVIRONMENT_KIND", "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST", "CLAUDE_CODE_HOST_AUTH_ENV_VAR", "ANTHROPIC_UNIX_SOCKET"].filter(key => options.env[key] !== undefined).map(key => [key, options.env[key]])), version: read.version, sdkVersion: read.sdkVersion, route, provider, sources: summary.sources, payer: route === "metered" ? auth.authMethod === "claude.ai" ? undefined : { orgId: auth.orgId, email: auth.email } : { orgId: auth.orgId, email: auth.email }, env: privateEnv, ...(!inventory.complete ? { inherited: Object.fromEntries(Object.entries(options.env).filter(([key]) => BILLING_KEYS.includes(key) && relevantEndpoint(key) && (!cloudKey(key) || selectors.length))) } : {}), provenance: Object.fromEntries(Object.keys(privateEnv).map(k => [k, provenance[k]])), helpers: privateHelpers, ...(localSources ? { sourceDirectory: options.cwd } : {}) } };
}
