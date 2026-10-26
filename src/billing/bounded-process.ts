import { endProcessTree, spawnDetached } from "../platform/helper-process.js";
/** Secret-bearing output is bounded while reading and discarded completely on failure. No stderr escapes. */
export function boundedRead(executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal; timeoutMs?: number; resultLimit?: number; outputLimit?: number; allowNonzero?: boolean }): Promise<{ stdout?: string; diagnostic?: string; exitCode?: number }> {
  if (options.signal?.aborted) return Promise.resolve({ diagnostic: "inspection_cancelled" });
  return new Promise(resolve => {
    const child = spawnDetached(executable, args, { cwd: options.cwd, env: options.env, stdin: "ignore" });
    const chunks: Buffer[] = []; let total = 0; let resultSize = 0; let exitCode: number | undefined; let failure: string | undefined; let settled = false; let killTimer: NodeJS.Timeout | undefined;
    const finish = () => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(killTimer); options.signal?.removeEventListener("abort", abort);
      resolve(failure ? { diagnostic: failure } : { stdout: Buffer.concat(chunks).toString("utf8"), ...(exitCode !== undefined ? { exitCode } : {}) });
    };
    const terminate = (code: string) => {
      if (failure) return; failure = code; chunks.length = 0;
      void endProcessTree(child.pid, "SIGTERM");
      killTimer = setTimeout(() => { void endProcessTree(child.pid, "SIGKILL").then(finish); }, 1000);
    };
    const abort = () => terminate("inspection_cancelled");
    // Reserve one second for forced tree cleanup within the total deadline.
    const timer = setTimeout(() => terminate("inspection_timeout"), Math.max(1, (options.timeoutMs ?? 30_000) - 1000));
    options.signal?.addEventListener("abort", abort, { once: true });
    const consume = (chunk: Buffer, stdout: boolean) => {
      total += chunk.length; if (stdout) resultSize += chunk.length;
      if (total > (options.outputLimit ?? 4 * 1024 * 1024)) terminate("inspection_output_limit");
      else if (resultSize > (options.resultLimit ?? 2 * 1024 * 1024)) terminate("inventory_result_limit");
      else if (!failure && stdout) chunks.push(chunk);
    };
    child.stdout!.on("data", chunk => consume(chunk as Buffer, true));
    child.stderr!.on("data", chunk => consume(chunk as Buffer, false));
    child.on("error", () => { failure = "inspection_spawn_failed"; finish(); });
    child.on("close", code => {
      exitCode = code ?? undefined;
      if (!failure && code !== 0 && !options.allowNonzero) failure = "inspection_read_failed";
      // Kill the group even if its leader exited with pipe-inheriting children.
      void endProcessTree(child.pid, "SIGKILL").then(finish);
    });
    if (options.signal?.aborted) abort();
  });
}
