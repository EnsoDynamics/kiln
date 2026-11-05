// Scratch indexes bound memory independently of conversation length. They are owner-only,
// removed after each scan, and never replace provider history as authoritative evidence.
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { TextDecoder } from "node:util";
import * as zlib from "node:zlib";

export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class EvidenceIndex {
  constructor(private readonly folder: string) { mkdirSync(folder, { recursive: true, mode: 0o700 }); }
  private file(group: string, key: string) { return join(this.folder, digest(group), digest(key) + ".json"); }
  get<T>(group: string, key: string): T | undefined {
    const path = this.file(group, key);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as T : undefined;
  }
  put(group: string, key: string, value: unknown): void {
    const path = this.file(group, key); mkdirSync(join(this.folder, digest(group)), { recursive: true, mode: 0o700 });
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  }
  unique(group: string, key: string, value: unknown): void {
    const previous = this.get<unknown>(group, key);
    if (previous !== undefined && digest(previous) !== digest(value)) throw new Error(`Conflicting ${group.split(":")[0]} identity.`);
    this.put(group, key, value);
  }
  async *values<T>(group: string): AsyncGenerator<T> {
    const folder = join(this.folder, digest(group));
    if (!existsSync(folder)) return;
    for await (const file of await opendir(folder)) yield JSON.parse(readFileSync(join(folder, file.name), "utf8")) as T;
  }
}

/**
 * Codex compresses idle rollouts to `<rollout>.jsonl.zst` (observed after about seven days) and
 * still reports the uncompressed path. The file Codex itself reads: the rollout, else its archive.
 *   existingRawHistory("~/.codex/sessions/2026/10/24/rollout-…-<id>.jsonl") // → "….jsonl.zst" once compressed
 */
export const existingRawHistory = (path: string): string => existsSync(path) || !existsSync(`${path}.zst`) ? path : `${path}.zst`;

/** Strict UTF-8/JSONL streaming, including a required newline on the final record. */
export async function* rawLines(path: string, signal: AbortSignal): AsyncGenerator<{ value: unknown; line: number }> {
  const file = createReadStream(path, { highWaterMark: 64 * 1024, signal });
  let stream: NodeJS.ReadableStream & { destroy(): void } = file;
  if (path.endsWith(".zst")) {
    if (typeof zlib.createZstdDecompress !== "function") { file.destroy(); throw new Error(`Reading compressed Codex history needs Node.js 22.15 or later; this is ${process.version}.`); }
    stream = file.pipe(zlib.createZstdDecompress());
    file.once("error", error => (stream as unknown as { destroy(error: Error): void }).destroy(error));
  }
  let pending = Buffer.alloc(0); let position = 0;
  try {
    for await (const chunk of stream) {
      const data = Buffer.concat([pending, chunk as Buffer]); let start = 0;
      for (let end = 0; end < data.length; end++) {
        if (end - start > 16 * 1024 * 1024) throw new Error("Codex raw record exceeds 16 MiB.");
        if (data[end] !== 10) continue;
        const line = new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(start, end));
        position++; start = end + 1;
        if (!line.trim()) throw new Error(`Empty Codex record at line ${position}.`);
        yield { value: JSON.parse(line), line: position };
      }
      pending = Buffer.from(data.subarray(start));
      if (pending.length > 16 * 1024 * 1024) throw new Error("Codex raw record exceeds 16 MiB.");
    }
    if (pending.length) throw new Error("Codex history has a truncated final record.");
    if (!position) throw new Error("Codex history is empty.");
  } finally { stream.destroy(); file.destroy(); }
}
