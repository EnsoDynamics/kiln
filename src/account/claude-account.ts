// The signed-in Claude account and its usage limits, read from Claude Code itself (technical
// design, "Account and Usage"): `claude auth status --json` for the account and a headless
// `/usage` for the limits, which is answered locally and spends none of the person's usage.

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
  limits: UsageLimit[];
  error?: string;
  limitsError?: string;
}

export interface AccountStatus {
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
    return { error: helperError(result) };
  }
  if (typeof parsed !== "object" || parsed === null) return { error: helperError(result) };
  const status = parsed as { loggedIn?: unknown; email?: unknown; orgId?: unknown; subscriptionType?: unknown };
  if (status.loggedIn === false) return { error: NOT_SIGNED_IN };
  if (status.loggedIn !== true) return { error: helperError(result) };
  const account: AccountStatus = {};
  if (typeof status.email === "string" && status.email !== "") account.email = status.email;
  if (typeof status.orgId === "string" && status.orgId !== "") account.orgId = status.orgId;
  if (typeof status.subscriptionType === "string" && status.subscriptionType !== "") {
    account.plan = `${status.subscriptionType.charAt(0).toUpperCase()}${status.subscriptionType.slice(1)} plan`;
  }
  return account;
}

export interface UsageReading {
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
  const limits = (report as { rate_limits?: { limits?: unknown } | null } | null | undefined)?.rate_limits?.limits;
  if (limits === undefined || limits === null) return hasPlan ? { limits: [], limitsError: NOT_REPORTED } : { limits: [] };
  if (!Array.isArray(limits)) return { limits: [], limitsError: UNRECOGNIZED };

  const rows: UsageLimit[] = [];
  for (const row of limits as Record<string, unknown>[]) {
    const kind = row?.kind;
    if (typeof kind !== "string") return { limits: [], limitsError: UNRECOGNIZED };
    const labels = limitLabels(kind, row.scope);
    if (labels === undefined) continue;
    if (typeof row.percent !== "number" || !Number.isFinite(row.percent)) return { limits: [], limitsError: UNRECOGNIZED };
    rows.push({
      kind,
      ...labels,
      percent: row.percent,
      ...(typeof row.resets_at === "string" ? { resetsAt: row.resets_at } : {}),
      nearLimit: row.percent >= NEAR_LIMIT_PERCENT,
    });
  }
  return { limits: rows };
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
  const [auth, usage] = await Promise.all([
    call(["auth", "status", "--json"]),
    call(["-p", "/usage", "--output-format", "stream-json", "--verbose", "--no-session-persistence"]),
  ]);
  const updatedAt = (options.now?.() ?? new Date()).toISOString();
  const status = parseAuthStatus(auth);
  if (status.error !== undefined) return { startedAt, updatedAt, limits: [], error: status.error };
  const account: AccountView = { ...status, startedAt, updatedAt, limits: [] };
  if (usage.exitCode !== 0) {
    account.limitsError = helperError(usage);
    return account;
  }
  const reading = parseUsage(usage.stdout, status.plan !== undefined);
  account.limits = reading.limits;
  if (reading.limitsError !== undefined) account.limitsError = reading.limitsError;
  return account;
}

function helperError(result: HelperResult): string {
  const text = (result.stderr || result.failure || result.stdout || `exit code ${result.exitCode}`).trim();
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").join(" ");
}
