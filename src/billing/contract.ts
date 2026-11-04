// Revision of Kiln's passive billing detection rules. It names no Claude Code or
// Agent SDK version: an update of either alone keeps an approval, while a change
// to these rules voids it. Values stay inside inspection/HMAC memory.
export const BILLING_CONTRACT = "claude-settings-v4";
export const PROVIDERS = ["BEDROCK", "FOUNDRY", "ANTHROPIC_AWS", "ANTHROPIC_GOOGLE_CLOUD", "MANTLE", "VERTEX"] as const;
export const BILLING_KEYS = [
  "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN",
  ...PROVIDERS.map(p => `CLAUDE_CODE_USE_${p}`),
  "ANTHROPIC_BASE_URL", ...["BEDROCK", "FOUNDRY", "AWS", "GOOGLE_CLOUD", "BEDROCK_MANTLE", "VERTEX"].map(p => `ANTHROPIC_${p}_BASE_URL`),
  "AWS_ENDPOINT_URL", "AWS_ENDPOINT_URL_BEDROCK", "AWS_ENDPOINT_URL_BEDROCK_RUNTIME",
  "AWS_BEARER_TOKEN_BEDROCK", "ANTHROPIC_FOUNDRY_API_KEY", "ANTHROPIC_FOUNDRY_AUTH_TOKEN", "ANTHROPIC_AWS_API_KEY", "ANTHROPIC_FOUNDRY_RESOURCE", "ANTHROPIC_VERTEX_PROJECT_ID", "ANTHROPIC_AWS_WORKSPACE_ID", "ANTHROPIC_GOOGLE_CLOUD_PROJECT", "ANTHROPIC_GOOGLE_CLOUD_LOCATION", "ANTHROPIC_GOOGLE_CLOUD_WORKSPACE_ID",
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_REGION", "AWS_DEFAULT_REGION", "AWS_ROLE_ARN", "AWS_WEB_IDENTITY_TOKEN_FILE", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "GOOGLE_CLOUD_QUOTA_PROJECT", "CLOUD_ML_REGION",
  "ANTHROPIC_PROFILE", "ANTHROPIC_CONFIG_DIR", "ANTHROPIC_FEDERATION_RULE_ID", "ANTHROPIC_ORGANIZATION_ID", "ANTHROPIC_WORKSPACE_ID", "ANTHROPIC_IDENTITY_TOKEN_FILE", "ANTHROPIC_CUSTOM_HEADERS",
  ...PROVIDERS.map(p => `CLAUDE_CODE_SKIP_${p}_AUTH`),
];
export const HELPERS = ["apiKeyHelper", "awsCredentialExport", "awsAuthRefresh", "gcpAuthRefresh"] as const;
export type Source = "user" | "project" | "local" | "flag" | "managed";
export interface Inventory {
  complete: boolean;
  env: Record<string, string>;
  sources: Record<string, string>;
  helpers: Record<string, { value: string; source: string }>;
  diagnostics: string[];
}
export const emptyInventory = (code: string): Inventory => ({ complete: false, env: {}, sources: {}, helpers: {}, diagnostics: [code] });
const sources: Source[] = ["user", "project", "local", "flag", "managed"];
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const object = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
/** Extract only the defined map, with per-key precedence rather than top-level env provenance. Every object Kiln
 * reads must be an object when present (technical design, Billing recognition); a wrong type leaves the inventory
 * incomplete so billing shows Claude Code settings, never Claude subscription. */
export function extractInventory(raw: unknown): Inventory {
  if (!isRecord(raw) || !Array.isArray(raw.sources) || !isRecord(raw.effective) || !raw.sources.every(isRecord)) return emptyInventory("inventory_malformed");
  const input = raw; const effective = raw.effective;
  const result: Inventory = { complete: true, env: {}, sources: {}, helpers: {}, diagnostics: [] };
  const malformed = () => { result.complete = false; result.diagnostics.push("inventory_field_malformed"); };
  const optionalObject = (value: unknown): Record<string, unknown> => { if (value !== undefined && !isRecord(value)) malformed(); return object(value); };
  const tiers = (input.sources as Record<string, unknown>[]).slice().sort((a, b) => sources.indexOf(a.source as Source) - sources.indexOf(b.source as Source));
  for (const tier of tiers) {
    if (!sources.includes(tier.source as Source)) { result.complete = false; result.diagnostics.push("inventory_source_unknown"); continue; }
    const settings = optionalObject(tier.settings); const tierEnv = optionalObject(settings.env);
    for (const key of BILLING_KEYS) if (Object.hasOwn(tierEnv, key)) result.sources[key] = `${tier.source} settings · ${key}`;
    if (tier.source === "managed" || settings.policyHelper !== undefined) { result.complete = false; result.diagnostics.push("managed_policy_partial"); }
    for (const key of HELPERS) if (Object.hasOwn(settings, key) && typeof settings[key] === "string") result.helpers[key] = { value: settings[key], source: `${tier.source} settings · ${key}` };
  }
  const effectiveEnv = optionalObject(effective.env);
  for (const key of BILLING_KEYS) if (Object.hasOwn(effectiveEnv, key)) {
    const value = effectiveEnv[key];
    if (typeof value === "string") result.env[key] = value;
    else malformed();
  }
  for (const key of HELPERS) {
    const value = effective[key];
    if (typeof value === "string") result.helpers[key] = { value, source: result.helpers[key]?.source ?? `Claude Code ${key}` };
    else if (value !== undefined) malformed();
    else delete result.helpers[key];
  }
  if (effective.policyHelper !== undefined) { result.complete = false; result.diagnostics.push("managed_policy_partial"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return result;
}
/** The settings worker's read: an Agent SDK without the resolver yields no inventory (technical design, Billing gate). */
export async function resolveInventory(sdk: { resolveSettings?: unknown }, cwd: string): Promise<Inventory> {
  if (typeof sdk.resolveSettings !== "function") return emptyInventory("inventory_resolver_unavailable");
  const resolve = sdk.resolveSettings as (options: { cwd: string; settingSources: string[] }) => Promise<unknown>;
  return extractInventory(await resolve({ cwd, settingSources: ["user", "project", "local"] }));
}
export function ordinaryProfile(env: NodeJS.ProcessEnv): boolean {
  return !["claude-desktop", "claude-desktop-3p", "local-agent"].includes(env.CLAUDE_CODE_ENTRYPOINT ?? "") && env.CLAUDE_CODE_ENVIRONMENT_KIND !== "byoc" && !["CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST", "CLAUDE_CODE_HOST_AUTH_ENV_VAR", "ANTHROPIC_UNIX_SOCKET"].some(k => !!env[k]);
}
