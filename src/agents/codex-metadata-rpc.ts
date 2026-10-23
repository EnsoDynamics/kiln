// Private, metadata-only JSONL transport. The allowlist makes starting a work turn impossible.
import { createInterface } from "node:readline";
import { endProcessTree, spawnDetached } from "../platform/helper-process.js";

const METHODS = new Set(["initialize", "model/list", "account/read", "account/rateLimits/read", "skills/list", "configRequirements/read", "config/read", "windowsSandbox/readiness"]);
export class CodexMetadataRpc {
  private child;
  private sequence = 0;
  private failure: Error | undefined;
  private closed = false;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private readonly deadline;
  private readonly timer;
  private readonly abort;
  constructor(executable: string, cwd: string, env: NodeJS.ProcessEnv, signal?: AbortSignal, timeoutMs = 30_000, args = ["app-server", "--listen", "stdio://"]) {
    this.deadline = Date.now() + timeoutMs;
    this.child = spawnDetached(executable, args, { cwd, env, stdin: "pipe" });
    this.timer = setTimeout(() => this.fail(new Error("Codex metadata timed out after 30 seconds.")), timeoutMs);
    this.abort = () => this.fail(new Error("Kiln is stopping."));
    signal?.addEventListener("abort", this.abort, { once: true });
    if (signal?.aborted) this.abort();
    this.signal = signal;
    let bytes = 0;
    this.child.stdout!.on("data", (data: Buffer) => { bytes += data.length; if (bytes > 16 * 1024 * 1024) this.fail(new Error("Codex metadata exceeds the bounded response size.")); });
    createInterface({ input: this.child.stdout! }).on("line", (line) => {
      try {
        const message = JSON.parse(line) as { id?: number; method?: string; result?: unknown; error?: unknown };
        if (message.method && message.id !== undefined) {
          this.child.stdin!.write(JSON.stringify({ id: message.id, error: { code: -32601, message: "Kiln metadata cannot answer human requests." } }) + "\n");
          this.fail(new Error(`Codex metadata requested ${message.method}; use Codex in a terminal to resolve it.`));
        } else if (message.id !== undefined) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) pending?.reject(new Error(`Codex ${JSON.stringify(message.error)}`));
          else pending?.resolve(message.result);
        }
      } catch { this.fail(new Error("Codex returned malformed metadata.")); }
    });
    // Drain stderr without exposing authentication or personal payloads in diagnostics.
    this.child.stderr!.resume();
    this.child.stdin!.on("error", () => this.fail(new Error("Codex metadata input disconnected.")));
    this.child.stdout!.on("error", () => this.fail(new Error("Codex metadata output disconnected.")));
    this.child.on("close", () => { this.closed = true; });
    this.child.on("error", () => this.fail(new Error("Could not start Codex. Check its installation in a terminal.")));
    this.child.on("exit", (code) => this.fail(new Error(`Codex metadata process exited (${code}).`)));
  }
  private signal: AbortSignal | undefined;
  private fail(error: Error): void {
    this.failure ??= error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    void endProcessTree(this.child.pid, "SIGTERM");
  }
  async call<T>(method: string, params: unknown = {}): Promise<T> {
    if (!METHODS.has(method)) throw new Error(`Work dispatch unavailable: ${method}.`);
    if (this.failure) throw this.failure;
    if (Date.now() >= this.deadline) throw new Error("Codex metadata deadline exceeded.");
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      this.child.stdin!.write(JSON.stringify({ id, method, params }) + "\n", (error) => { if (error) this.fail(error); });
    });
  }
  async initialize(): Promise<void> {
    await this.call("initialize", { clientInfo: { name: "kiln", version: "1.0.0" }, capabilities: { experimentalApi: true } });
    this.child.stdin!.write(JSON.stringify({ method: "initialized" }) + "\n");
  }
  async close(): Promise<void> {
    clearTimeout(this.timer);
    this.signal?.removeEventListener("abort", this.abort);
    if (this.closed) return;
    const exited = new Promise<void>((resolve) => this.child.once("close", () => resolve()));
    this.child.stdin!.end();
    const terminate = setTimeout(() => void endProcessTree(this.child.pid, "SIGTERM"), 500);
    const force = setTimeout(() => void endProcessTree(this.child.pid, "SIGKILL"), 1500);
    await exited;
    clearTimeout(terminate); clearTimeout(force);
  }
}
