// Qualified passive billing contract. Values stay inside inspection/HMAC memory.
export const BILLING_CONTRACT = "claude-2.1.307-sdk-0.3.310-v1";
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
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Extract only the defined map, with per-key precedence rather than top-level env provenance. */
export function extractInventory(raw: unknown): Inventory {
  const input = object(raw); const effective = object(input.effective);
  const result: Inventory = { complete: true, env: {}, sources: {}, helpers: {}, diagnostics: [] };
  if (!Array.isArray(input.sources) || !input.effective) return emptyInventory("inventory_malformed");
  const tiers = input.sources.map(object).sort((a, b) => sources.indexOf(a.source as Source) - sources.indexOf(b.source as Source));
  for (const tier of tiers) {
    if (!sources.includes(tier.source as Source)) { result.complete = false; result.diagnostics.push("inventory_source_unknown"); continue; }
    const settings = object(tier.settings);
    for (const key of BILLING_KEYS) if (Object.hasOwn(object(settings.env), key)) result.sources[key] = `${tier.source} settings · ${key}`;
    if (tier.source === "managed" || settings.policyHelper !== undefined) { result.complete = false; result.diagnostics.push("managed_policy_partial"); }
    for (const key of HELPERS) if (Object.hasOwn(settings, key) && typeof settings[key] === "string") result.helpers[key] = { value: settings[key], source: `${tier.source} settings · ${key}` };
  }
  for (const key of BILLING_KEYS) if (Object.hasOwn(object(effective.env), key)) {
    const value = object(effective.env)[key];
    if (typeof value === "string") result.env[key] = value;
    else { result.complete = false; result.diagnostics.push("inventory_field_malformed"); }
  }
  for (const key of HELPERS) {
    const value = effective[key];
    if (typeof value === "string") result.helpers[key] = { value, source: result.helpers[key]?.source ?? `Claude Code ${key}` };
    else if (value !== undefined) { result.complete = false; result.diagnostics.push("inventory_field_malformed"); }
    else delete result.helpers[key];
  }
  if (effective.policyHelper !== undefined) { result.complete = false; result.diagnostics.push("managed_policy_partial"); }
  result.diagnostics = [...new Set(result.diagnostics)];
  return result;
}
export function ordinaryProfile(env: NodeJS.ProcessEnv): boolean {
  return !["claude-desktop", "claude-desktop-3p", "local-agent"].includes(env.CLAUDE_CODE_ENTRYPOINT ?? "") && env.CLAUDE_CODE_ENVIRONMENT_KIND !== "byoc" && !["CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST", "CLAUDE_CODE_HOST_AUTH_ENV_VAR", "ANTHROPIC_UNIX_SOCKET"].some(k => !!env[k]);
}
