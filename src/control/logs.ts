/** Frozen output pages: bounded file reads, authenticated cursors, final stdout budget. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { openSync, closeSync, readSync, fstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeDurableMetadata } from "./durable-file.js";
import { checkedPath, privateJson, type SavedWork } from "./private-state.js";
import { ControlFailure, commandText, result, serialize, type Result } from "./result.js";

export const LOG_BYTES = 16384;
const CHUNK = 65536;
interface Snapshot {
  version: 1; id: string; execution: string; session: string; phase: string;
  generation: string; file_identity: string; frozen_byte_end: number; prefix_sha256: string;
  last_record_number: number; observed_at: string;
}
interface Position { snapshot: string; end: number; scalar: number | null }
interface Line { number: number; at: string; source: string; text: string; fragment: { start: number; end: number; total: number; unit: "unicode_scalar" } | null }
function unavailable(reason: string): never { throw new ControlFailure("saved_output_unavailable", reason); }
function deadlineCheck(deadline: number): void { if (Date.now() > deadline) unavailable("The saved-output validation deadline expired."); }
function previousNewline(fd: number, before: number, deadline: number): number {
  let end = before;
  while (end > 0) {
    deadlineCheck(deadline);
    const start = Math.max(0, end - CHUNK); const bytes = Buffer.allocUnsafe(end - start);
    const n = readSync(fd, bytes, 0, bytes.length, start);
    if (n !== bytes.length) unavailable("Saved output changed during the read.");
    const index = bytes.lastIndexOf(10); if (index >= 0) return start + index;
    end = start;
  }
  return -1;
}
function prefixHash(fd: number, end: number, deadline: number): string {
  const hash = createHash("sha256"); const bytes = Buffer.allocUnsafe(CHUNK);
  for (let position = 0; position < end;) {
    deadlineCheck(deadline);
    const n = readSync(fd, bytes, 0, Math.min(CHUNK, end - position), position);
    if (!n) unavailable("Saved output was shortened.");
    hash.update(bytes.subarray(0, n)); position += n;
  }
  return hash.digest("hex");
}
/** Output records have scalar fields. Stream the text string, retaining only a bounded suffix. */
function readRecord(fd: number, start: number, end: number, endpoint: number | null, deadline: number): { line: Line; total: number; selectedEnd: number } {
  const decoder = new TextDecoder("utf-8", { fatal: true }); const values: Record<string, unknown> = {};
  let state: "open" | "key" | "colon" | "value" | "comma" | "done" = "open";
  let inString = false; let key = ""; let token = ""; let escape = ""; let isKey = false;
  let total = 0; let pendingHigh = ""; const ring: string[] = new Array(LOG_BYTES); let retained = 0;
  const scalar = (s: string) => {
    if (key !== "text" || isKey) { token += s; if (token.length > LOG_BYTES) unavailable("Output metadata exceeds the bounded reader."); return; }
    if (pendingHigh) { if (s.length === 1 && /[\uDC00-\uDFFF]/.test(s)) { s = pendingHigh + s; pendingHigh = ""; } else { const high = pendingHigh; pendingHigh = ""; if (endpoint === null || total < endpoint) { ring[retained % LOG_BYTES] = high; retained++; } total++; } }
    if (s.length === 1 && /[\uD800-\uDBFF]/.test(s) && !pendingHigh) { pendingHigh = s; return; }
    if (endpoint === null || total < endpoint) { ring[retained % LOG_BYTES] = s; retained++; }
    total++;
  };
  const finishValue = () => { if (key !== "text") { try { values[key] = JSON.parse(token); } catch { unavailable("A saved output record is malformed."); } } state = "comma"; token = ""; };
  const consume = (chunk: string) => {
    for (const c of chunk) {
      if (inString) {
        if (escape) {
          escape += c;
          if (escape === "\\u" || (escape.startsWith("\\u") && escape.length < 6)) continue;
          let decoded: string;
          try { decoded = JSON.parse(`"${escape}"`) as string; } catch { unavailable("Invalid JSON escape in saved output."); }
          scalar(decoded); escape = ""; continue;
        }
        if (c === "\\") { escape = "\\"; continue; }
        if (c === '"') {
          if (pendingHigh) { const high = pendingHigh; pendingHigh = ""; if (endpoint === null || total < endpoint) { ring[retained % LOG_BYTES] = high; retained++; } total++; }
          inString = false;
          if (isKey) { key = token; token = ""; state = "colon"; }
          else { if (key !== "text") values[key] = token; else values.text = true; token = ""; state = "comma"; }
          continue;
        }
        if (c.codePointAt(0)! < 32) unavailable("Unescaped control character in saved output.");
        scalar(c); continue;
      }
      if (state === "value" && token && (c === "," || c === "}" || /\s/.test(c))) finishValue();
      if (/\s/.test(c)) continue;
      if (state === "open" && c === "{") { state = "key"; continue; }
      if ((state === "key" || state === "value") && c === '"') { inString = true; isKey = state === "key"; token = ""; continue; }
      if (state === "colon" && c === ":") { state = "value"; continue; }
      if (state === "value" && /[0-9.eE+\-a-z]/.test(c)) { token += c; if (token.length > 128) unavailable("Invalid output scalar."); continue; }
      if (state === "comma" && c === ",") { state = "key"; continue; }
      if (state === "comma" && c === "}") { state = "done"; continue; }
      unavailable("A saved output record is malformed.");
    }
  };
  const bytes = Buffer.allocUnsafe(CHUNK);
  for (let position = start; position < end;) {
    deadlineCheck(deadline);
    const n = readSync(fd, bytes, 0, Math.min(CHUNK, end - position), position);
    if (!n) unavailable("Saved output changed during the read.");
    try { consume(decoder.decode(bytes.subarray(0, n), { stream: true })); } catch (e) { if (e instanceof ControlFailure) throw e; unavailable("Saved output contains malformed UTF-8."); } position += n;
  }
  try { consume(decoder.decode()); } catch (e) { if (e instanceof ControlFailure) throw e; unavailable("Saved output contains malformed UTF-8."); }
  if ((state as string) !== "done" || inString || values.text !== true || !Number.isSafeInteger(values.line) || Number(values.line) < 1 || typeof values.at !== "string" || typeof values.source !== "string") unavailable("A saved output record is incomplete or malformed.");
  if (endpoint !== null && (endpoint < 0 || endpoint > total)) unavailable("Cursor text position is no longer valid.");
  const count = Math.min(retained, LOG_BYTES); const selectedEnd = endpoint ?? total;
  const suffix = Array.from({ length: count }, (_, i) => ring[(retained - count + i) % LOG_BYTES]!).join("");
  return { line: { number: Number(values.line), at: values.at, source: values.source, text: suffix, fragment: selectedEnd === total && count === total ? null : { start: selectedEnd - count, end: selectedEnd, total, unit: "unicode_scalar" } }, total, selectedEnd };
}
function signed(position: Position, token: string): string {
  const body = Buffer.from(JSON.stringify(position)).toString("base64url");
  return `${body}.${createHmac("sha256", token).update(body).digest("base64url")}`;
}
function decoded(cursor: string, token: string): Position {
  if (cursor.length > 1024) throw new ControlFailure("invalid_cursor", "Invalid output cursor.", 2);
  const [body, mac, extra] = cursor.split(".");
  const expected = createHmac("sha256", token).update(body ?? "").digest("base64url");
  if (!body || !mac || extra || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) throw new ControlFailure("invalid_cursor", "Invalid or foreign output cursor.", 2);
  let p: Position;
  try { p = JSON.parse(Buffer.from(body, "base64url").toString()) as Position; } catch { throw new ControlFailure("invalid_cursor", "Malformed output cursor.", 2); }
  if (!/^[a-f0-9]{64}$/.test(p.snapshot) || !Number.isSafeInteger(p.end) || p.end < 0 || (p.scalar !== null && (!Number.isSafeInteger(p.scalar) || p.scalar < 0))) throw new ControlFailure("invalid_cursor", "Invalid output cursor position.", 2);
  return p;
}
export function outputPage(work: SavedWork, selected: { phase: string; id: string } | null, options: { session?: string; cursor?: string; max: number; json: boolean }, deadline = Date.now() + 5000): Result {
  const { record, directory, root, canonical } = work;
  const base = { prd_path: canonical, execution_id: record.executionId!, session_id: selected?.id ?? null, response_byte_limit: LOG_BYTES, requested_lines: options.max };
  let position: Position | undefined; let snapshot: Snapshot | undefined;
  if (options.cursor) {
    position = decoded(options.cursor, record.token);
    const descriptor = join(directory, "output-snapshots", `${position.snapshot}.json`);
    try { snapshot = privateJson<Snapshot>(root, descriptor); } catch { unavailable("The output snapshot descriptor is unavailable."); }
    if (snapshot.version !== 1 || snapshot.id !== position.snapshot || snapshot.execution !== record.executionId || (options.session && options.session !== snapshot.session)) throw new ControlFailure("cursor_target_mismatch", "Cursor does not belong to this execution and session.", 2);
    selected = { id: snapshot.session, phase: snapshot.phase }; base.session_id = selected.id;
    if (position.end > snapshot.frozen_byte_end) throw new ControlFailure("invalid_cursor", "Invalid cursor byte position.", 2);
  }
  if (!selected) return result({ ...base, reason: "no_session", lines: [], range: null, has_older: false, next_before: null, next_command: null, next_argv: null });
  const path = join(directory, selected.phase, selected.id, "output.jsonl");
  let fd: number;
  try { checkedPath(root, path); fd = openSync(path, "r"); } catch { unavailable("Saved output is missing, unreadable or not owner controlled."); }
  try {
    const stat = fstatSync(fd); const identity = `${stat.dev}:${stat.ino}`;
    let session: { outputGeneration?: string };
    try { session = privateJson(root, join(directory, selected.phase, selected.id, "session.json")); }
    catch { unavailable("The saved session output generation is missing, corrupt or unreadable."); }
    const generation = session.outputGeneration ?? `legacy:${identity}`;
    if (!snapshot) {
      const end = previousNewline(fd, stat.size, deadline) + 1;
      if (end === 0 && stat.size > 0) unavailable("No complete saved output record is available yet.");
      const hash = prefixHash(fd, end, deadline);
      const id = createHash("sha256").update(JSON.stringify([record.executionId, selected.id, generation, identity, end, hash])).digest("hex");
      const descriptor = join(directory, "output-snapshots", `${id}.json`);
      if (existsSync(descriptor)) snapshot = privateJson<Snapshot>(root, descriptor);
      else {
        const last = end ? readRecord(fd, previousNewline(fd, end - 1, deadline) + 1, end, null, deadline).line.number : 0;
        snapshot = { version: 1, id, execution: record.executionId!, session: selected.id, phase: selected.phase, generation, file_identity: identity, frozen_byte_end: end, prefix_sha256: hash, last_record_number: last, observed_at: new Date().toISOString() };
        writeDurableMetadata(descriptor, snapshot);
      }
      position = { snapshot: snapshot.id, end: snapshot.frozen_byte_end, scalar: null };
    }
    if (snapshot.generation !== generation || snapshot.file_identity !== identity || stat.size < snapshot.frozen_byte_end || prefixHash(fd, snapshot.frozen_byte_end, deadline) !== snapshot.prefix_sha256) unavailable("Saved output was replaced, rebuilt, shortened or changed inside the frozen snapshot.");
    const collectedAt = new Date().toISOString();
    const lines: Line[] = []; let cursor = position!; let byteLimit = false;
    const answer = (next: Position, entries: Line[]): Result => {
      const older = next.end > 0;
      const token = older ? signed(next, record.token) : null;
      const argv = token ? ["kiln", "logs", canonical, "--older-output-cursor", token, "--max-lines", String(options.max), ...(options.json ? ["--json"] : [])] : null;
      return result({ ...base, observed_at: collectedAt, snapshot_id: snapshot!.id, snapshot_observed_at: snapshot!.observed_at, snapshot_end_line: snapshot!.last_record_number,
        byte_limit_reached: byteLimit, range: entries.length ? { first: entries[0]!.number, last: entries.at(-1)!.number } : null,
        lines: entries, has_older: older, next_before: token, next_command: argv ? commandText(argv) : null, next_argv: argv,
        ...(snapshot!.frozen_byte_end === 0 ? { reason: "no_output" } : cursor.end === 0 && !entries.length ? { reason: "end_of_history" } : {}) });
    };
    while (cursor.end > 0 && lines.length < options.max) {
      const start = previousNewline(fd, cursor.end - 1, deadline) + 1;
      const read = readRecord(fd, start, cursor.end, cursor.scalar, deadline);
      const scalars = Array.from(read.line.text);
      const make = (count: number) => {
        const offset = read.selectedEnd - count;
        const line = { ...read.line, text: scalars.slice(scalars.length - count).join(""), fragment: offset === 0 && read.selectedEnd === read.total ? null : { start: offset, end: read.selectedEnd, total: read.total, unit: "unicode_scalar" as const } };
        const next: Position = { snapshot: snapshot!.id, end: offset > 0 ? cursor.end : start, scalar: offset > 0 ? offset : null };
        return { line, next };
      };
      const whole = make(scalars.length);
      if (Buffer.byteLength(serialize(answer(whole.next, [whole.line, ...lines]), options.json)) <= LOG_BYTES) {
        lines.unshift(whole.line); cursor = whole.next;
        if (whole.line.fragment) { byteLimit = true; break; }
        continue;
      }
      byteLimit = true;
      if (lines.length) break;
      let low = 0; let high = scalars.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2); const candidate = make(mid);
        if (Buffer.byteLength(serialize(answer(candidate.next, [candidate.line]), options.json)) <= LOG_BYTES) low = mid; else high = mid - 1;
      }
      if (low === 0) throw new ControlFailure("metadata_too_large", "Output metadata leaves no space for content.", 2);
      const fragment = make(low); lines.unshift(fragment.line); cursor = fragment.next; break;
    }
    const final = answer(cursor, lines);
    if (Buffer.byteLength(serialize(final, options.json)) > LOG_BYTES) throw new ControlFailure("metadata_too_large", "Output metadata exceeds the response budget.", 2);
    deadlineCheck(deadline);
    return final;
  } finally { closeSync(fd); }
}

/** Bounded observation for status; creates no output snapshot or cursor. */
export function recentSavedOutput(work: SavedWork, phase: string, id: string, limit = 10, deadline = Date.now() + 5000): { line: number; at: string; source: string; text: string; fragment: Line["fragment"] }[] {
  const path = join(work.directory, phase, id, "output.jsonl");
  if (!existsSync(path)) return [];
  checkedPath(work.root, path); const fd = openSync(path, "r");
  try {
    let end = previousNewline(fd, fstatSync(fd).size, deadline) + 1; const rows = [];
    while (end > 0 && rows.length < limit) {
      const start = previousNewline(fd, end - 1, deadline) + 1;
      const record = readRecord(fd, start, end, null, deadline).line;
      rows.unshift({ line: record.number, at: record.at, source: record.source, text: record.text, fragment: record.fragment }); end = start;
    }
    return rows;
  } finally { closeSync(fd); }
}
