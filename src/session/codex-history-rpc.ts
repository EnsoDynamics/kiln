// Evidence-only private transport: this process cannot start, resume or interrupt work.
import { createInterface } from "node:readline";
import { endProcessTree, spawnDetached } from "../platform/helper-process.js";

const METHODS = new Set(["initialize", "thread/read", "thread/turns/list", "thread/list"]);
export interface HistoryRpc { call<T>(method: string, params: unknown): Promise<T> }
export class CodexHistoryRpc implements HistoryRpc {
  private readonly child;
  private sequence = 0;
  private failure: Error | undefined;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private readonly closed: Promise<void>;
  private readonly abort: () => void;
  constructor(executable: string, cwd: string, env: NodeJS.ProcessEnv, private readonly signal: AbortSignal) {
    this.child = spawnDetached(executable, ["app-server", "--listen", "stdio://"], { cwd, env, stdin: "pipe" });
    this.closed = new Promise((resolve) => this.child.once("close", resolve));
    this.abort = () => this.fail(new Error("Codex evidence scan stopped or timed out."));
    signal.addEventListener("abort", this.abort, { once: true });
    if (signal.aborted) this.abort();
    let buffered = 0;
    this.child.stdout!.on("data", (chunk: Buffer) => {
      // Bound individual frames, not the lifetime number of paginated reads.
      for (const byte of chunk) { buffered = byte === 10 ? 0 : buffered + 1; if (buffered > 16 * 1024 * 1024) { this.fail(new Error("Oversized Codex history frame.")); break; } }
    });
    createInterface({ input: this.child.stdout! }).on("line", (line) => {
      if (this.failure) return;
      try {
        const message = JSON.parse(line) as { id?: number; method?: string; error?: unknown; result?: unknown };
        if (message.method && message.id !== undefined) {
          this.child.stdin!.write(JSON.stringify({ id: message.id, error: { code: -32601, message: "Evidence scans cannot answer requests." } }) + "\n");
          this.fail(new Error(`Codex history requested ${message.method}.`));
        } else if (message.id !== undefined) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(`Codex history RPC failed: ${JSON.stringify(message.error)}`)); else pending.resolve(message.result);
        }
      } catch { this.fail(new Error("Malformed Codex history response.")); }
    });
    this.child.stderr!.resume();
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", () => this.fail(new Error("Codex history process exited.")));
    this.child.stdin!.on("error", (error) => this.fail(error));
    this.child.stdout!.on("error", (error) => this.fail(error));
  }
  private fail(error: Error): void {
    this.failure ??= error;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(this.failure); }
    this.pending.clear();
    void endProcessTree(this.child.pid, "SIGTERM");
  }
  call<T>(method: string, params: unknown): Promise<T> {
    if (!METHODS.has(method)) return Promise.reject(new Error(`Evidence-only transport forbids ${method}.`));
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Codex ${method} exceeded 30 seconds.`)), 30_000);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.child.stdin!.write(JSON.stringify({ id, method, params }) + "\n", (error) => { if (error) this.fail(error); });
    });
  }
  async initialize(): Promise<void> {
    await this.call("initialize", { clientInfo: { name: "kiln", version: "1.0.0" }, capabilities: { experimentalApi: true } });
    this.child.stdin!.write(JSON.stringify({ method: "initialized" }) + "\n");
  }
  async close(): Promise<void> {
    this.signal.removeEventListener("abort", this.abort);
    this.fail(new Error("Codex history transport closed."));
    this.child.stdin!.end();
    const force = setTimeout(() => void endProcessTree(this.child.pid, "SIGKILL"), 1500);
    await this.closed;
    clearTimeout(force);
  }
}
