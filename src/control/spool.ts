import { serializedChunks, type Result } from "./result.js";
import { deadlineCheck } from "./private-state.js";
/** Request-local disk arrays keep full histories out of the JS heap. Never retained state. */
import { closeSync, mkdtempSync, openSync, readSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const releases = new WeakMap<object, () => void>();
const deadlines = new WeakMap<object, number>();
export function releaseResult(value: object): void { const release = releases.get(value); releases.delete(value); release?.(); }
export function ownResult<T extends object>(value: T, release: () => void, deadline?: number): T { releases.set(value, release); if (deadline !== undefined) deadlines.set(value, deadline); return value; }
export class InspectionSpool {
  private directory = mkdtempSync(join(tmpdir(), "kiln-inspection-"));
  private files: number[] = [];
  private closed = false;
  list<T>(): { values: T[]; append(value: T): void } {
    let fd: number;
    try { fd = openSync(join(this.directory, `${this.files.length}.jsonl`), "wx+", 0o600); this.files.push(fd); }
    catch (error) { this.close(); throw error; }
    const offsets: { start: number; size: number }[] = []; let end = 0;
    const array: T[] = [];
    const values = new Proxy(array, { get: (target, key, receiver) => {
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) return Reflect.get(target, key, receiver) as unknown;
      const position = offsets[Number(key)]; if (!position) return undefined;
      const bytes = Buffer.allocUnsafe(position.size);
      let n = 0; while (n < bytes.length) { const count = readSync(fd, bytes, n, bytes.length - n, position.start + n); if (!count) throw new Error("Incomplete inspection spool"); n += count; }
      return JSON.parse(bytes.toString("utf8")) as T;
    }, has: (target, key) => typeof key === "string" && /^(0|[1-9]\d*)$/.test(key) ? Number(key) < offsets.length : Reflect.has(target, key) });
    return { values, append: value => {
      const bytes = Buffer.from(JSON.stringify(value)); let n = 0;
      while (n < bytes.length) n += writeSync(fd, bytes, n, bytes.length - n, end + n);
      offsets.push({ start: end, size: bytes.length }); end += bytes.length; array.length = offsets.length;
    } };
  }
  close(): void { if (this.closed) return; this.closed = true; for (const fd of this.files) closeSync(fd); rmSync(this.directory, { recursive: true, force: true }); }
}

/** Finalize before emitting a byte: late reads/deadlines must never produce partial JSON. */
export class ResponseSpool {
  private directory = mkdtempSync(join(tmpdir(), "kiln-response-"));
  private fd: number;
  constructor() {
    try { this.fd = openSync(join(this.directory, "body"), "wx+", 0o600); }
    catch (error) { rmSync(this.directory, { recursive: true, force: true }); throw error; }
  }
  private closed = false;
  bytes = 0;
  append(bytes: Uint8Array): void { let n = 0; while (n < bytes.length) n += writeSync(this.fd, bytes, n, bytes.length - n, this.bytes + n); this.bytes += n; }
  *chunks(): Generator<Uint8Array> {
    for (let start = 0; start < this.bytes;) { const bytes = Buffer.allocUnsafe(Math.min(65536, this.bytes - start)); const n = readSync(this.fd, bytes, 0, bytes.length, start); if (!n) throw new Error("Incomplete response spool"); start += n; yield bytes.subarray(0, n); }
  }
  async writeTo(output: { write(text: string): unknown; once?: (event: string, listener: () => void) => unknown }): Promise<void> {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
      for (const chunk of this.chunks()) {
        const text = decoder.decode(chunk, { stream: true });
        if (output.write(text) === false && output.once) await new Promise<void>(resolve => output.once!("drain", resolve));
      }
      const last = decoder.decode(); if (last) output.write(last);
    } finally { this.close(); }
  }
  stream(): ReadableStream<Uint8Array> {
    const chunks = this.chunks();
    return new ReadableStream({ pull: controller => { try { const next = chunks.next(); if (next.done) { controller.close(); this.close(); } else controller.enqueue(next.value); } catch (error) { controller.error(error); this.close(); } }, cancel: () => { this.close(); } });
  }
  close(): void { if (this.closed) return; this.closed = true; closeSync(this.fd); rmSync(this.directory, { recursive: true, force: true }); }
}
export function spoolResult(answer: Result, json: boolean, deadline = Date.now() + 5000): ResponseSpool {
  deadline = Math.min(deadline, deadlines.get(answer) ?? deadline);
  let spool: ResponseSpool | undefined;
  try {
    const output = new ResponseSpool(); spool = output;
    let buffered = "";
    const flush = () => { deadlineCheck(deadline); output.append(Buffer.from(buffered)); buffered = ""; };
    // Batch small serializer fragments into bounded writes: large histories must
    // not spend their read deadline issuing thousands of temporary-file writes.
    for (const chunk of serializedChunks(answer, json)) {
      deadlineCheck(deadline);
      buffered += chunk;
      if (buffered.length >= 256 * 1024) flush();
    }
    buffered += "\n"; flush(); deadlineCheck(deadline); return output;
  } catch (error) { spool?.close(); throw error; }
  finally { releaseResult(answer); }
}
