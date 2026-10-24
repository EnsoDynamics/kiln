import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory } from "../state/state-files.js";
import { AuditRefusal } from "./contracts.js";

export const REPORT_LIMIT = 8 * 1024 * 1024;
export const hashBytes = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
export const hashValue = (value: unknown): string => hashBytes(JSON.stringify(value));

/** JSON's normal last-key-wins behavior is unsafe for a signed-off audit record. */
export function strictJson(text: string, limit = REPORT_LIMIT): unknown {
  if (Buffer.byteLength(text) > limit) throw new AuditRefusal("report_too_large", `Maximum report size is ${limit} bytes.`, 413);
  let at = 0;
  const space = () => { while (/\s/.test(text[at] ?? "") && at < text.length) at++; };
  const string = (): string => {
    const start = at++; let escaped = false;
    while (at < text.length) { const c = text[at++]!; if (c === '"' && !escaped) return JSON.parse(text.slice(start, at)) as string; escaped = c === "\\" && !escaped; }
    throw new Error("Unterminated string");
  };
  const value = (depth: number): void => {
    if (depth > 100) throw new Error("JSON nesting exceeds 100");
    space(); const c = text[at];
    if (c === '"') { string(); return; }
    if (c === "{" || c === "[") {
      at++; space(); const end = c === "{" ? "}" : "]"; const keys = new Set<string>();
      if (text[at] === end) { at++; return; }
      while (at < text.length) {
        space();
        if (c === "{") {
          if (text[at] !== '"') throw new Error("Expected object key");
          const key = string(); if (keys.has(key)) throw new Error(`Duplicate JSON key: ${key}`); keys.add(key);
          space(); if (text[at++] !== ":") throw new Error("Expected colon");
        }
        value(depth + 1); space(); const delimiter = text[at++];
        if (delimiter === end) return;
        if (delimiter !== ",") throw new Error("Expected comma");
      }
      throw new Error("Unterminated container");
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at));
    if (!match) throw new Error("Expected JSON value"); at += match[0].length;
  };
  try { value(0); space(); if (at !== text.length) throw new Error("Trailing JSON data"); return JSON.parse(text) as unknown; }
  catch (error) { throw new AuditRefusal("invalid_report", `Invalid JSON: ${(error as Error).message}`); }
}

/** Content-addressed, immutable private sidecars; never rewrite an accepted source. */
export class AuditStore {
  constructor(private readonly stateDirectory: string) {}
  put(value: unknown): string { return this.putBytes(JSON.stringify(value)); }
  putBytes(bytes: string): string {
    const id = hashBytes(bytes); const path = this.path(id); ensurePrivateDirectory(join(this.stateDirectory, "audit-evidence"));
    try { writeFileSync(path, bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || this.bytes(id) !== bytes) throw error; }
    return id;
  }
  path(id: string): string {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new AuditRefusal("missing_evidence", "Invalid private evidence reference.");
    return join(this.stateDirectory, "audit-evidence", `${id}.json`);
  }
  bytes(id: string): string {
    const path = this.path(id);
    if (!existsSync(path)) throw new AuditRefusal("missing_evidence", `Missing accepted evidence: ${path}`);
    const bytes = readFileSync(path, "utf8");
    if (hashBytes(bytes) !== id) throw new AuditRefusal("missing_evidence", `Changed retained evidence: ${path}`);
    return bytes;
  }
  read<T>(id: string): T { return JSON.parse(this.bytes(id)) as T; }
}
