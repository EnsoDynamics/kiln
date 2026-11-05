// Work-only private stdio transport. Metadata and evidence retain their separate allowlists.
import { endProcessTree, spawnDetached } from "../platform/helper-process.js";
import { codexWindowsJob } from "../platform/codex-windows-job.js";

const METHODS = new Set(["initialize", "thread/start", "thread/resume", "thread/read", "thread/turns/list", "thread/list", "thread/loaded/list", "thread/backgroundTerminals/list", "thread/backgroundTerminals/clean", "turn/start", "turn/interrupt"]);
export interface CodexMessage { id?: string | number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown }

/** Only verified client request contracts receive a response. No authority is auto-granted. */
export function codexRequestDecision(method: string): { result?: unknown; error?: unknown; stop: boolean } {
  if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(method)) return { result: { decision: "decline" }, stop: false };
  if (method === "item/permissions/requestApproval") return { result: { permissions: {}, scope: "turn" }, stop: false };
  if (method === "mcpServer/elicitation/request") return { result: { action: "decline" }, stop: false };
  return { error: { code: -32601, message: "Kiln cannot supply a human answer. Resume this conversation in a terminal." }, stop: true };
}

export class CodexWorkRpc {
  readonly child;
  readonly closed: Promise<void>;
  readonly failed: Promise<Error>;
  failure: Error | undefined;
  private failPromise!: (error: Error) => void;
  private sequence = 0;
  private closing = false;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();

  constructor(options: { executable: string; args?: string[]; cwd: string; env: NodeJS.ProcessEnv; onMessage(message: CodexMessage): void; onStderr(text: string): void; timeoutMs?: number }) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.failed = new Promise(resolve => { this.failPromise = resolve; });
    const args = options.args ?? ["app-server", "--listen", "stdio://"];
    if (process.platform === "win32" && !options.env.KILN_CODEX_JOB_POWERSHELL) throw new Error("The qualified Windows PowerShell supervisor is unavailable.");
    const command = process.platform === "win32" ? codexWindowsJob(options.executable, args, options.cwd, options.env.KILN_CODEX_JOB_POWERSHELL!, options.env) : { executable: options.executable, args, env: options.env };
    this.child = spawnDetached(command.executable, command.args, { cwd: options.cwd, env: command.env, stdin: "pipe" });
    this.closed = new Promise(resolve => this.child.once("close", () => { if (!this.closing) this.fail(new Error("Codex work server disconnected before cleanup.")); resolve(); }));
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";
    const receive = (line: string) => {
      if (this.failure || !line.trim()) return;
      try {
        const message: unknown = JSON.parse(line);
        if (typeof message !== "object" || message === null || Array.isArray(message)) throw new Error("Invalid RPC envelope.");
        const value = message as CodexMessage;
        options.onMessage(value); // Durable decisions/identities are saved before settling the call.
        if (value.id !== undefined && !value.method) {
          if (typeof value.id !== "number") throw new Error("Unrecognized response ID.");
          const pending = this.pending.get(value.id);
          if (!pending) return;
          this.pending.delete(value.id); clearTimeout(pending.timer);
          if (value.error !== undefined) pending.reject(new Error(`Codex RPC: ${JSON.stringify(value.error)}`));
          else pending.resolve(value.result);
        }
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    };
    this.child.stdout!.on("data", (chunk: Buffer) => {
      try { buffer += decoder.decode(chunk, { stream: true }); } catch { this.fail(new Error("Invalid UTF-8 in Codex work transport.")); return; }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        if (Buffer.byteLength(buffer.slice(0, newline)) > 16 * 1024 * 1024) { this.fail(new Error("Oversized Codex work frame.")); return; }
        receive(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      }
      if (Buffer.byteLength(buffer) > 16 * 1024 * 1024) this.fail(new Error("Oversized Codex work frame."));
    });
    this.child.stdout!.on("end", () => { try { buffer += decoder.decode(); } catch { this.fail(new Error("Invalid UTF-8 in Codex work transport.")); } if (buffer.trim()) this.fail(new Error("Truncated Codex work frame.")); });
    this.child.stderr!.setEncoding("utf8");
    this.child.stderr!.on("data", (text: string) => { try { options.onStderr(text); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); } });
    this.child.on("error", error => this.fail(error));
    this.child.stdin!.on("error", error => { if (!this.closing) this.fail(error); });
    this.child.stdout!.on("error", error => this.fail(error));
  }
  private readonly timeoutMs: number;

  fail(error: Error): void {
    if (this.failure) return;
    this.failure = error; this.failPromise(error);
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    this.pending.clear();
    void endProcessTree(this.child.pid, "SIGTERM");
  }
  send(message: CodexMessage): void {
    if (this.failure) throw this.failure;
    this.child.stdin!.write(JSON.stringify(message) + "\n", error => { if (error && !this.closing) this.fail(error); });
  }
  call<T>(method: string, params: unknown): Promise<T> {
    if (!METHODS.has(method)) return Promise.reject(new Error(`Work transport forbids ${method}.`));
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Codex ${method} exceeded its RPC deadline.`)), this.timeoutMs);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      try { this.send({ id, method, params: params as Record<string, unknown> }); } catch (error) { this.fail(error as Error); }
    });
  }
  async initialize(): Promise<{ codexHome: string; platformOs: string }> {
    const result = await this.call<{ codexHome: string; platformOs: string }>("initialize", { clientInfo: { name: "kiln", version: "1.0.0" }, capabilities: { experimentalApi: true } });
    this.send({ method: "initialized" });
    return result;
  }
  async close(endOwned?: () => Promise<void>): Promise<void> {
    this.closing = true;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Codex transport closed.")); }
    this.pending.clear();
    this.child.stdin!.end();
    // Kill the group even when its leader already exited: a tool may still own the pipes.
    const term = setTimeout(() => void endProcessTree(this.child.pid, "SIGTERM"), 500);
    const kill = setTimeout(() => void endProcessTree(this.child.pid, "SIGKILL"), 5500);
    // A detached tool can retain the pipes after the leader exits. Reach identity-checked
    // descendant cleanup before awaiting EOF, or `close` can never become observable.
    let grace: NodeJS.Timeout | undefined;
    let cleanupError: unknown;
    await Promise.race([this.closed, new Promise<void>(resolve => { grace = setTimeout(resolve, 500); })]);
    clearTimeout(grace);
    try { await endOwned?.(); } catch (error) { cleanupError = error; }
    let eofTimer: NodeJS.Timeout | undefined;
    await Promise.race([this.closed, new Promise<void>(resolve => { eofTimer = setTimeout(() => {
      cleanupError ??= new Error("Codex output pipes remain held after process cleanup; cleanup is unknown.");
      this.child.stdin!.destroy(); this.child.stdout!.destroy(); this.child.stderr!.destroy(); resolve();
    }, 6500); })]);
    clearTimeout(eofTimer);
    clearTimeout(term); clearTimeout(kill);
    if (cleanupError) throw cleanupError;
  }
}
