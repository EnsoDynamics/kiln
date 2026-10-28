/** Public inspection results. The same object feeds both final serializers. */
export interface ControlError { code: string; message: string; retryable: boolean; next_command: string | null; next_argv: string[] | null }
export interface Result {
  schema_version: "1"; ok: boolean; observed_at: string; errors: ControlError[];
  prd_path?: string; execution_id?: string | null;
  [key: string]: unknown;
}
export class ControlFailure extends Error {
  constructor(readonly code: string, message: string, readonly exit = 4) { super(message); }
}
export function errorFact(code: string, message: string, next: string[] | null = null): ControlError {
  return { code, message, retryable: false, next_command: next ? commandText(next) : null, next_argv: next };
}
export function result(fields: Record<string, unknown> = {}, errors: ControlError[] = []): Result {
  return { schema_version: "1", ok: errors.length === 0, observed_at: new Date().toISOString(), ...fields, errors };
}
export function failed(error: unknown): Result {
  const known = error instanceof ControlFailure;
  return result({}, [errorFact(known ? error.code : "state_unavailable", known ? error.message : "Kiln could not read the requested state.")]);
}
export function exitFor(answer: Result): number {
  if (answer.ok) return 0;
  const codes = answer.errors.map(e => e.code);
  if (codes.some(c => ["inventory_incomplete", "controller_unreachable", "instance_incompatible", "state_unavailable", "provider_unavailable", "saved_output_unavailable", "operation_indeterminate", "check_unavailable"].includes(c))) return 4;
  return codes.some(c => ["control_unavailable", "ownership_mismatch", "busy", "stale_status_token", "unsent_reply_acknowledgement_required"].includes(c)) ? 3 : 2;
}
export function commandText(argv: string[]): string {
  return argv.map(s => /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`).join(" ");
}
function humanTime(value: string): string {
  const date = new Date(value);
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")} UTC${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
/** Stream arrays one record at a time, including disk-backed history arrays. */
export function* serializedChunks(value: unknown, json: boolean, depth = 0): Generator<string> {
  const pad = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (json) yield "[";
    else if (!value.length) yield "none";
    for (let i = 0; i < value.length; i++) {
      if (i) yield json ? "," : "\n";
      if (!json) yield `${pad}- `;
      yield* serializedChunks(value[i], json, depth + 1);
    }
    if (json) yield "]";
  } else if (value && typeof value === "object") {
    if (json) yield "{";
    let first = true;
    for (const [key, v] of Object.entries(value)) {
      if (v === undefined || typeof v === "function") continue;
      if (!first) yield json ? "," : "\n"; first = false;
      yield json ? `${JSON.stringify(key)}:` : `${pad}${key}: `;
      if (!json && typeof v === "string" && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) && /(^at$|_at$|At$|since$)/.test(key)) yield humanTime(v);
      else yield* serializedChunks(v, json, depth + 1);
    }
    if (json) yield "}";
  } else {
    const rendered = json ? JSON.stringify(value ?? null) : value === null ? "unknown" : String(value);
    // Individual state records are bounded before parsing; avoid copying a whole response.
    for (let start = 0; start < rendered.length;) {
      let end = Math.min(start + 32768, rendered.length);
      if (end < rendered.length && /[\uD800-\uDBFF]/.test(rendered[end - 1]!)) end--;
      yield rendered.slice(start, end); start = end;
    }
  }
}
export function serialize(answer: Result, json: boolean): string {
  return [...serializedChunks(answer, json), "\n"].join("");
}
