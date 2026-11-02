// Codex launch settings probe (kiln-completion-waivers, AC-WAIVE-02). Starts a short-lived
// Codex app-server, opens an ephemeral thread with the next launch's thread parameters and
// compares what Codex returns exactly as a launch does, apart from the durable identity an
// ephemeral thread never has. It never sends `turn/start`: nothing is dispatched, billed or
// saved to Codex history. The server and every process it started end before it returns.
import { randomUUID } from "node:crypto";
import { processStartTime } from "../platform/process-start-time.js";
import type { SessionRun } from "../state/records.js";
import { CODEX_NATIVE_CLEANUP_WARNING } from "./codex-background-terminals.js";
import { assertCodexEffectiveProfile, codexServerArguments, codexThreadParameters, type CodexEffectiveSettings, type PreparedCodexLaunch } from "./codex-launch-profile.js";
import { CodexOwnedProcesses, stopCodexOwnedProcesses } from "./codex-owned-processes.js";
import { CodexWorkRpc, codexRequestDecision, type CodexMessage } from "./codex-work-rpc.js";

/** The only requests the probe sends. `turn/start` cannot reach its server. */
const PROBE_METHODS = new Set(["initialize", "thread/start"]);
const PROBE_DEADLINE_MS = 60_000;

export interface CodexLaunchProbeOptions {
  /** The executable and environment the next launch passes to `runCodexSession`. */
  executable: string; env: NodeJS.ProcessEnv;
  /** `prepareCodexLaunch`'s result for the next launch's options. A failure there is the caller's Agent selection and readiness row. */
  prepared: PreparedCodexLaunch;
  signal?: AbortSignal;
  /** Whole-probe deadline, from start through cleanup's start. */
  timeoutMs?: number;
}
export type CodexLaunchProbeResult = { ok: true } | { ok: false; message: string };

/**
 * `ok: false` when Codex refuses or changes the launch settings, with a message that reads like
 * the launch's `verificationFailure`. Throws when the check could not finish: Codex could not
 * start, it asked for a human answer, the deadline passed or Kiln is stopping, or a process it
 * started could not be stopped.
 */
export async function probeCodexLaunchSettings(options: CodexLaunchProbeOptions): Promise<CodexLaunchProbeResult> {
  if (options.signal?.aborted) throw new Error("Kiln is stopping.");
  const { prepared } = options;
  const processOwner = randomUUID();
  // In memory only: the probe allocates no session run. It carries the ownership facts the
  // launch's process tracking reads, so the probe's cleanup is the launch's own.
  const at = new Date().toISOString();
  const run: SessionRun = { startedAt: at, cause: "launch", codex: { intentAt: at, requested: prepared.choice, account: prepared.account, profile: prepared.profile, humanRequests: [], modelActivityAt: [], processOwner, cleanupWarning: CODEX_NATIVE_CLEANUP_WARNING } };
  let inventoryFailure: unknown;
  // `thread/start` can start configured MCP servers in their own process groups, without the
  // owner marker. Inventory the live tree before the server is stopped, so a server started
  // moments earlier is owned before it can be reparented and outlive the probe.
  const inventory = async () => {
    if (!run.processStartTime) return;
    const scan = new CodexOwnedProcesses(run, () => undefined, () => undefined);
    try { await scan.start(); } catch (error) { inventoryFailure ??= error; } finally { await scan.close(); }
  };
  let stopping = false;
  const stop = (error: Error) => {
    if (stopping || rpc.failure) return;
    stopping = true;
    void inventory().finally(() => rpc.fail(error));
  };
  const receive = (message: CodexMessage) => {
    if (!message.method || message.id === undefined) return;
    const decision = codexRequestDecision(message.method);
    rpc.send({ id: message.id, ...(decision.result !== undefined ? { result: decision.result } : { error: decision.error }) });
    if (decision.stop) stop(new Error(`Codex asked for ${message.method} while Kiln checked its launch settings. Resolve it in a terminal.`));
  };
  const timeoutMs = options.timeoutMs ?? PROBE_DEADLINE_MS;
  const rpc = new CodexWorkRpc({
    executable: options.executable, args: codexServerArguments(processOwner), cwd: prepared.profile.cwd,
    env: { ...options.env, KILN_CODEX_PROCESS_OWNER: processOwner, ...(prepared.profile.powerShell ? { KILN_CODEX_JOB_POWERSHELL: prepared.profile.powerShell.executable } : {}) },
    onMessage: receive, onStderr: () => undefined, timeoutMs,
  });
  const call = <T>(method: string, params: unknown): Promise<T> => PROBE_METHODS.has(method) ? rpc.call<T>(method, params) : Promise.reject(new Error(`The launch settings probe forbids ${method}.`));
  const owned = new CodexOwnedProcesses(run, () => undefined, error => rpc.fail(error));
  const abort = () => stop(new Error("Kiln is stopping."));
  const deadline = setTimeout(() => stop(new Error("Codex launch settings check exceeded its deadline.")), timeoutMs);
  options.signal?.addEventListener("abort", abort, { once: true });
  let outcome: CodexLaunchProbeResult | undefined;
  let failure: unknown;
  try {
    if (!rpc.child.pid) throw new Error("Could not start Codex to check its launch settings.");
    run.pid = rpc.child.pid;
    const startTime = await processStartTime(run.pid);
    if (!startTime) throw new Error("Could not establish Codex process ownership for the launch settings check.");
    run.processStartTime = startTime;
    await owned.start();
    if (options.signal?.aborted) throw new Error("Kiln is stopping.");
    if (rpc.failure) throw rpc.failure;
    await rpc.initialize();
    let result: CodexEffectiveSettings;
    try { result = await call<CodexEffectiveSettings>("thread/start", { ...codexThreadParameters(prepared), ephemeral: true, allowProviderModelFallback: false }); }
    catch (error) {
      if (rpc.failure) throw rpc.failure; // Transport, deadline, abort or human request: not an answer.
      outcome = { ok: false, message: `Codex refused the recorded launch settings: ${(error as Error).message.replace(/^Codex RPC: /, "")}; no work was dispatched.` };
    }
    if (!outcome) outcome = compare(result!, prepared);
  } catch (error) { failure = error; }
  finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener("abort", abort);
    await owned.close();
    await inventory();
    try { await rpc.close(() => stopCodexOwnedProcesses(run)); } catch (error) { failure ??= error; }
    failure ??= owned.failure ?? inventoryFailure;
  }
  if (failure) throw failure;
  return outcome!;
}

/** The launch's comparison, without its durable-identity requirement. */
function compare(result: CodexEffectiveSettings, prepared: PreparedCodexLaunch): CodexLaunchProbeResult {
  if (result.thread?.ephemeral !== true) return { ok: false, message: "Codex did not keep the launch settings check's conversation ephemeral; no work was dispatched." };
  try { assertCodexEffectiveProfile(result, prepared); }
  catch (error) { return { ok: false, message: (error as Error).message }; }
  return { ok: true };
}
