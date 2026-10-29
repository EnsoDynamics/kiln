// The signed-in Claude account and its usage limits, read from Claude Code itself (technical
// design, "Account and Usage"): `claude auth status --json` for the account and a headless
// `/usage` for the limits, which is answered locally and spends none of the person's usage.

import { boundedRead } from "../billing/bounded-process.js";
import { runHelper, type HelperResult } from "../platform/helper-process.js";

/** The usage-limit threshold (UI-001): a limit at 80% or more is near its limit. */
export const NEAR_LIMIT_PERCENT = 80;

/** The line shown in place of the account when Claude Code isn't signed in (UI-010 item 7). */
export const NOT_SIGNED_IN = "Not signed in to Claude Code. Run `claude auth login`.";

export interface UsageLimit {
  /** The row's `kind`: `session`, `weekly_all` or `weekly_scoped`. */
  kind: string;
  /** A `weekly_scoped` row's name and whether it came from `scope.model` or `scope.surface`. */
  scope?: { by: "model" | "surface"; name: string };
  /** Running and Paused's label: "5-hour window", "Weekly", "Weekly · Fable". */
  label: string;
  /** Documents found's short label: "5-hour", "weekly", "Fable". */
  shortLabel: string;
  percent: number;
  resetsAt?: string;
  nearLimit: boolean;
}

export interface AccountView {
  email?: string;
  /** Tells one email's personal plan from its Team seat (usage-limit recovery, "Account a refusal belongs to"). */
  orgId?: string;
  plan?: string;
  /** When the reading's calls started, so a reading is judged against a refusal by Kiln's clock. */
  startedAt: string;
  updatedAt: string;
  limitsObservedAt?: string | undefined;
  limitsUnavailable?: string;
  limits: UsageLimit[];
  extraUsage?: { enabled: boolean; observedAt: string; email?: string; orgId?: string };
  error?: string;
  limitsError?: string;
}

export interface AccountStatus {
  authMethod?: string;
  apiProvider?: string;
  apiKeySource?: string;
  email?: string;
  orgId?: string;
  plan?: string;
  error?: string;
}

/**
 * Reads `claude auth status --json`. Not signed in means `loggedIn` is false, whatever the exit
 * code; output Kiln can't parse is that call's error.
 *
 *   parseAuthStatus({ exitCode: 0, stdout: '{"loggedIn":true,"email":"a@b.dev","subscriptionType":"max"}', stderr: "" })
 *   // { email: "a@b.dev", plan: "Max plan" }
 */
export function parseAuthStatus(result: HelperResult): AccountStatus {
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return { error: helperError() };
  }
  if (typeof parsed !== "object" || parsed === null) return { error: helperError() };
  const status = parsed as { loggedIn?: unknown; email?: unknown; orgId?: unknown; subscriptionType?: unknown; authMethod?: unknown; apiProvider?: unknown; apiKeySource?: unknown };
  if (status.loggedIn === false) return { error: NOT_SIGNED_IN };
  if (status.loggedIn !== true || result.exitCode !== 0) return { error: helperError() };
  const account: AccountStatus = {};
  if (["claude.ai", "api_key", "api_key_helper", "oauth_token"].includes(String(status.authMethod))) account.authMethod = String(status.authMethod);
  if (["firstParty", "bedrock", "vertex", "foundry", "mantle"].includes(String(status.apiProvider))) account.apiProvider = String(status.apiProvider);
  else if (typeof status.apiProvider === "string" && status.apiProvider) account.apiProvider = "configured";
  if (typeof status.apiKeySource === "string" && status.apiKeySource && status.apiKeySource !== "none") account.apiKeySource = status.apiKeySource === "ANTHROPIC_API_KEY" ? "ANTHROPIC_API_KEY" : "configured";
  if (typeof status.email === "string" && status.email !== "") account.email = status.email;
  if (typeof status.orgId === "string" && status.orgId !== "") account.orgId = status.orgId;
  if (typeof status.subscriptionType === "string" && status.subscriptionType !== "") {
    account.plan = `${status.subscriptionType.charAt(0).toUpperCase()}${status.subscriptionType.slice(1)} plan`;
  }
  return account;
}

export interface UsageReading {
  /** Absent rows differ from an explicitly reported empty array, even without a plan. */
  limitsAvailable?: false;
  extraUsageEnabled?: boolean;
  limits: UsageLimit[];
  limitsError?: string;
}

const UNRECOGNIZED = "Claude Code reported its usage limits in a shape Kiln doesn't recognize.";
const NOT_REPORTED = "Claude Code didn't report this plan's usage limits.";

/**
 * Reads the limits from a headless `/usage`'s stream-json output: the event carrying
 * `usage_report`, its `rate_limits.limits[]` in the server's order, each labelled from its
 * `kind`. Rows of an unknown kind, and a scoped row with no name, are left out.
 *
 *   parseUsage(output, true).limits.map((limit) => limit.shortLabel)  // ["5-hour", "weekly", "Fable"]
 */
export function parseUsage(stdout: string, hasPlan: boolean): UsageReading {
  let report: unknown;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.includes('"usage_report"')) continue;
    try {
      const event = JSON.parse(line) as { usage_report?: unknown };
      if (event.usage_report !== undefined) {
        report = event.usage_report;
        break;
      }
    } catch {
      // Not an event line.
    }
  }
  const rateLimits = (report as { rate_limits?: { limits?: unknown; extra_usage?: { is_enabled?: unknown } | null } | null } | null | undefined)?.rate_limits;
  // SDKUsageReport permits null usage rows independently of reported overflow.
  const extra = rateLimits?.extra_usage?.is_enabled;
  const overflow = typeof extra === "boolean" ? { extraUsageEnabled: extra } : {};
  const limits = rateLimits?.limits;
  if (limits === undefined || limits === null) return { limits: [], limitsAvailable: false, ...overflow, ...(hasPlan ? { limitsError: NOT_REPORTED } : {}) };
  if (!Array.isArray(limits)) return { limits: [], ...overflow, limitsError: UNRECOGNIZED };

  const rows: UsageLimit[] = [];
  for (const row of limits as Record<string, unknown>[]) {
    const kind = row?.kind;
    if (typeof kind !== "string") return { limits: [], ...overflow, limitsError: UNRECOGNIZED };
    const labels = limitLabels(kind, row.scope);
    if (labels === undefined) continue;
    if (typeof row.percent !== "number" || !Number.isFinite(row.percent)) return { limits: [], ...overflow, limitsError: UNRECOGNIZED };
    rows.push({
      kind,
      ...labels,
      percent: row.percent,
      ...(typeof row.resets_at === "string" ? { resetsAt: row.resets_at } : {}),
      nearLimit: row.percent >= NEAR_LIMIT_PERCENT,
    });
  }
  return { limits: rows, ...overflow };
}

function limitLabels(kind: string, scope: unknown): Pick<UsageLimit, "label" | "shortLabel" | "scope"> | undefined {
  if (kind === "session") return { label: "5-hour window", shortLabel: "5-hour" };
  if (kind === "weekly_all") return { label: "Weekly", shortLabel: "weekly" };
  if (kind !== "weekly_scoped") return undefined;
  const named = scope as { model?: { display_name?: unknown } | null; surface?: { display_name?: unknown } | null } | null | undefined;
  const text = (value: unknown): value is string => typeof value === "string" && value !== "";
  const by = text(named?.model?.display_name) ? "model" : text(named?.surface?.display_name) ? "surface" : undefined;
  if (by === undefined) return undefined;
  const name = (by === "model" ? named!.model!.display_name : named!.surface!.display_name) as string;
  return { label: `Weekly · ${name}`, shortLabel: name, scope: { by, name } };
}

export interface AccountReadOptions {
  claude: string;
  env: NodeJS.ProcessEnv;
  /** The PRD's state directory, so no project's hooks or settings load. */
  cwd: string;
  signal?: AbortSignal;
  now?: () => Date;
}

/**
 * Reads the account and its usage together: the account line and the limits Documents found,
 * Running and Paused show. Never throws; every failure becomes the view's `error` or
 * `limitsError`.
 */
export async function readAccount(options: AccountReadOptions): Promise<AccountView> {
  const startedAt = (options.now?.() ?? new Date()).toISOString();
  const call = (args: string[]) => runHelper(options.claude, args, { cwd: options.cwd, env: options.env, ...(options.signal ? { signal: options.signal } : {}) });
  const auth = await call(["auth", "status", "--json"]);
  let updatedAt = (options.now?.() ?? new Date()).toISOString();
  const usage = await call(["-p", "/usage", "--output-format", "stream-json", "--verbose", "--no-session-persistence"]);
  const usageAt = (options.now?.() ?? new Date()).toISOString();
  const status = parseAuthStatus(auth);
  if (status.error !== undefined) return { startedAt, updatedAt, limits: [], error: status.error };
  const account: AccountView = { ...status, startedAt, updatedAt, limits: [] };
  if (usage.exitCode !== 0) {
    account.limitsError = helperError();
    return account;
  }
  const reading = parseUsage(usage.stdout, status.plan !== undefined);
  // Usage has no account identity of its own. Bracket every successful usage read,
  // including reports without overflow, before assigning gauges to an account.
  const after = parseAuthStatus(await call(["auth", "status", "--json"]));
  updatedAt = (options.now?.() ?? new Date()).toISOString();
  if (after.error || !(status.email || status.orgId) || status.email !== after.email || status.orgId !== after.orgId || status.plan !== after.plan || status.authMethod !== after.authMethod || status.apiProvider !== after.apiProvider || status.apiKeySource !== after.apiKeySource) {
    return { ...after, startedAt, updatedAt, limits: [], limitsError: "Usage could not be bound to a stable authenticated account across the reading. Refresh account information." };
  }
  account.updatedAt = updatedAt;
  if (reading.limitsAvailable === false) account.limitsUnavailable = NOT_REPORTED;
  else if (!reading.limitsError) account.limitsObservedAt = usageAt;
  if (reading.extraUsageEnabled !== undefined) {
    account.extraUsage = { enabled: reading.extraUsageEnabled, observedAt: usageAt, ...(status.email ? { email: status.email } : {}), ...(status.orgId ? { orgId: status.orgId } : {}) };
  }
  account.limits = reading.limits;
  if (reading.limitsError !== undefined) account.limitsError = reading.limitsError;
  return account;
}

/** Required auth read. Projection changes its inputs, never the work environment. */
export async function readAuthStatus(options: AccountReadOptions): Promise<AccountStatus> {
  const result = await boundedRead(options.claude, ["auth", "status", "--json"], { ...options, timeoutMs: 120_000, resultLimit: 256 * 1024, allowNonzero: true });
  if (result.diagnostic) return { error: "Could not read Claude Code authentication. Run `claude auth status`, then recheck." };
  return parseAuthStatus({ exitCode: result.exitCode ?? null, stdout: result.stdout!, stderr: "" });
}
function helperError(): string {
  return "Could not read Claude Code account information. Check `claude auth status` in a terminal, then recheck.";
}
