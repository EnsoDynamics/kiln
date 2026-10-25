import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** Two minutes: the limit on every git, gh and helper claude call (technical design, "Dependencies"). */
export const HELPER_TIMEOUT_MS = 2 * 60 * 1000;

export interface HelperResult {
  /** The exit code, or null when the process couldn't start, timed out or was ended by a signal. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Why the call has no exit code: a spawn error or the timeout. */
  failure?: string;
}

export interface HelperOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /**
   * Aborted when Kiln is stopping: a running call is ended (SIGINT to its group; its tree on
   * Windows) and a new one fails at once, so a stop never waits on git or gh.
   */
  signal?: AbortSignal;
}

/**
 * How long, on Windows, a child's abnormal end waits before it is handled: a Ctrl+C reaches
 * every process in Kiln's console at once, and Kiln's own handler must run first.
 */
export const WINDOWS_CTRL_C_GRACE_MS = 1000;

/** The failure of a helper call made, or still running, once Kiln began to stop. */
export const STOPPING_FAILURE = "Kiln is stopping";

/**
 * Finds an executable on the PATH the way a shell would, without running it. On Windows it
 * tries only the PATHEXT extensions, as cmd.exe does, so `claude` finds `claude.cmd` and never
 * the extensionless shell script npm installs beside it.
 *
 *   findExecutable("git", process.env)  // "/usr/bin/git", or undefined when it isn't on the PATH
 */
export function findExecutable(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const pathValue = env.PATH ?? env.Path ?? "";
  const extensions =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, name + extension);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return undefined;
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    if (process.platform !== "win32") accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs a helper command (git, gh) the way the technical design requires of every call Kiln
 * makes other than a session: detached in its own process group, with stdin closed, no
 * terminal prompt for credentials, and a timeout. A credential prompt or a hung network call
 * becomes the call's failure instead of a stall.
 *
 *   const result = await runHelper(gitPath, ["status", "--porcelain"], { cwd: checkout });
 */
export function runHelper(executable: string, args: string[], options: HelperOptions): Promise<HelperResult> {
  const timeoutMs = options.timeoutMs ?? HELPER_TIMEOUT_MS;
  const env = { ...(options.env ?? process.env), GIT_TERMINAL_PROMPT: "0" };

  if (options.signal?.aborted) return Promise.resolve({ exitCode: null, stdout: "", stderr: "", failure: STOPPING_FAILURE });

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let closed = false;
    let failure: string | undefined;
    let exitGrace: ReturnType<typeof setTimeout> | undefined;
    // A cancelled helper must close before its caller can remove files it was using.
    // Cooperative shutdown gets one second, then its complete process group is killed.
    const terminate = (reason: string, signal: NodeJS.Signals) => {
      failure = reason;
      if (closed) { finish({ exitCode: null, stdout, stderr, failure }); return; }
      endProcessTree(child.pid, signal);
      clearTimeout(timer);
      timer = setTimeout(() => { void endProcessTree(child.pid, "SIGKILL"); }, 1000);
    };
    const onAbort = () => {
      terminate(STOPPING_FAILURE, "SIGINT");
    };
    const finish = (result: HelperResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(exitGrace);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const child = spawnDetached(executable, args, { cwd: options.cwd, env, stdin: "ignore" });
    let timer = setTimeout(() => terminate(`timed out after ${timeoutMs / 1000} seconds`, "SIGTERM"), timeoutMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout!.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr!.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error) => finish({ exitCode: null, stdout, stderr, failure: error.message }));
    child.on("close", (code, signal) => {
      closed = true;
      if (failure !== undefined) { finish({ exitCode: null, stdout, stderr, failure }); return; }
      const result = code === null ? { exitCode: null, stdout, stderr, failure: `ended by ${signal}` } : { exitCode: code, stdout, stderr };
      // On Windows a Ctrl+C reaches the call as well as Kiln, and the call can end before Kiln's
      // signal handler runs; an abnormal end waits a moment, so the stop is seen first and the
      // call's result reads as the stop's, never as git's or gh's answer.
      const abnormal = code === null || code < 0 || code >= 128;
      if (process.platform === "win32" && options.signal && abnormal) exitGrace = setTimeout(() => finish(result), WINDOWS_CTRL_C_GRACE_MS);
      else finish(result);
    });
  });
}

/**
 * Spawns a process with stdout and stderr piped. On macOS and Linux it is detached, in its own
 * process group, so the terminal's Ctrl+C reaches only Kiln. On Windows it stays in Kiln's
 * console: Node's detached spawn there gives the child no console at all, so the program a
 * .cmd shim starts gets a new console in place of Kiln's pipes, and PowerShell's output is lost
 * (technical design, "Windows"). Node refuses to spawn a .cmd or .bat file directly on Windows,
 * so those go through cmd.exe with their arguments quoted for it.
 */
export function spawnDetached(executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; stdin: "ignore" | "pipe" }): ChildProcess {
  const viaShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(executable);
  return spawn(viaShell ? quoteForCmd(executable) : executable, viaShell ? args.map(quoteForCmd) : args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    windowsHide: true,
    shell: viaShell,
    stdio: [options.stdin, "pipe", "pipe"],
  });
}

/**
 * Ends a child Kiln spawned together with everything it started: a signal to its process
 * group on macOS and Linux, where every child leads its own group; `taskkill /T /F` on
 * Windows, where Node can only end a process outright and only taskkill reaches the whole tree,
 * so a .cmd shim's real process goes too.
 *
 *   endProcessTree(child.pid, "SIGTERM")
 *   await endProcessTree(child.pid, "SIGTERM")  // on Windows, once taskkill has finished
 */
export function endProcessTree(pid: number | undefined, signal: NodeJS.Signals): Promise<void> {
  if (pid === undefined) return Promise.resolve();
  try {
    if (process.platform === "win32") {
      // Resolves once taskkill has ended the tree, for a caller that must not outlive it.
      return new Promise((resolve) => {
        const taskkill = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
        taskkill.on("error", () => resolve());
        taskkill.on("exit", () => resolve());
      });
    }
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
  return Promise.resolve();
}

function quoteForCmd(value: string): string {
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
