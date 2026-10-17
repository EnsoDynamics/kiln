import { spawn } from "node:child_process";
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
}

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
  // Node refuses to spawn a .cmd or .bat file directly on Windows; those go through cmd.exe.
  const viaShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(executable);
  const command = viaShell ? quoteForCmd(executable) : executable;
  const commandArgs = viaShell ? args.map(quoteForCmd) : args;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: HelperResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env,
      detached: true,
      windowsHide: true,
      shell: viaShell,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      endProcessGroup(child.pid);
      finish({ exitCode: null, stdout, stderr, failure: `timed out after ${timeoutMs / 1000} seconds` });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error) => finish({ exitCode: null, stdout, stderr, failure: error.message }));
    child.on("close", (code, signal) =>
      finish(code === null ? { exitCode: null, stdout, stderr, failure: `ended by ${signal}` } : { exitCode: code, stdout, stderr }),
    );
  });
}

function endProcessGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    // On Windows only taskkill ends the whole tree, so a .cmd shim's real process goes too.
    if (process.platform === "win32") spawn("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
    else process.kill(-pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}

function quoteForCmd(value: string): string {
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
