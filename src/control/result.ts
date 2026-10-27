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
  if (codes.some(c => ["inventory_incomplete", "controller_unreachable", "instance_incompatible", "state_unavailable", "provider_unavailable", "saved_output_unavailable"].includes(c))) return 4;
  return codes.some(c => ["control_unavailable", "ownership_mismatch", "busy"].includes(c)) ? 3 : 2;
}
export function commandText(argv: string[]): string {
  return argv.map(s => /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`).join(" ");
}
function textValue(value: unknown, depth: number): string {
  const pad = "  ".repeat(depth);
  if (value === null) return "unknown";
  if (typeof value === "string") {
    // Timestamps in observation fields get an explicit local timezone. Session text is literal.
    return value;
  }
  if (Array.isArray(value)) return value.length ? value.map(v => `${pad}- ${textValue(v, depth + 1)}`).join("\n") : "none";
  if (typeof value === "object" && value) return Object.entries(value).map(([key, v]) => {
    const shown = typeof v === "string" && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) && /(^at$|_at$|At$|since$)/.test(key)
      ? new Date(v).toLocaleString(undefined, { timeZoneName: "short" }) : textValue(v, depth + 1);
    return `${pad}${key}: ${shown}`;
  }).join("\n");
  return String(value);
}
export function serialize(answer: Result, json: boolean): string {
  return json ? `${JSON.stringify(answer)}\n` : `${textValue(answer, 0)}\n`;
}
