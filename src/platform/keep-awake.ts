// Keeps the computer from sleeping when idle while a session works (PRD AC-KEEP-06; technical
// design, "Keep-awake"). Each platform's hold is a child process that also watches Kiln's PID,
// so the hold ends if Kiln dies without releasing it. Every hold stops idle sleep only:
// closing the lid still sleeps the computer (AC-KEEP-07).

import type { ChildProcess } from "node:child_process";
import { join } from "node:path";
import { endProcessTree, findExecutable, spawnDetached, WINDOWS_CTRL_C_GRACE_MS } from "./helper-process.js";

export type KeepAwakeTool = { ok: true; command: string; args: string[] } | { ok: false; missing: string };

/** What Kiln is told when keep-awake can't work, in the Documents found mockup's wording. */
export const keepAwakeMissingMessage = (tool: string) => `Can’t keep this computer awake: ${tool} isn’t available.`;

/** A command that exits once Kiln's process does, for the Linux tools to hold their lock around. */
const untilKilnExits = (pid: number) => ["sh", "-c", `while kill -0 ${pid} 2>/dev/null; do sleep 5; done`];

/**
 * The hold for this platform and session type. Kiln never falls back from one Linux tool to the
 * other: GNOME's automatic suspend honors only gnome-session's own inhibitors.
 *
 *   keepAwakeTool("darwin", process.env, process.pid, "Customer returns")
 *   // { ok: true, command: "/usr/bin/caffeinate", args: ["-i", "-w", "4242"] }
 */
export function keepAwakeTool(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, pid: number, featureName: string): KeepAwakeTool {
  const reason = `Kiln: ${featureName} is being implemented`;
  if (platform === "darwin") {
    return { ok: true, command: findExecutable("caffeinate", env) ?? "/usr/bin/caffeinate", args: ["-i", "-w", String(pid)] };
  }
  if (platform === "win32") {
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED, held until Kiln's process ends. Encoded, so no quoting
    // survives two command-line parsers.
    const script = [
      "$k = Add-Type -Name KilnPower -Namespace Kiln -PassThru -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint esFlags);'",
      "[void]$k::SetThreadExecutionState([uint32]2147483649)",
      `Wait-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    ].join("; ");
    const powershell = join(env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return { ok: true, command: powershell, args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")] };
  }
  if ((env.XDG_CURRENT_DESKTOP ?? "").split(":").some((desktop) => desktop.toUpperCase() === "GNOME")) {
    const tool = findExecutable("gnome-session-inhibit", env);
    if (!tool) return { ok: false, missing: "gnome-session-inhibit" };
    return { ok: true, command: tool, args: ["--inhibit", "suspend", "--app-id", "kiln", "--reason", reason, ...untilKilnExits(pid)] };
  }
  const tool = findExecutable("systemd-inhibit", env);
  if (!tool) return { ok: false, missing: "systemd-inhibit" };
  return { ok: true, command: tool, args: ["--what=sleep", "--mode=block", "--who=Kiln", `--why=${reason}`, ...untilKilnExits(pid)] };
}

/** What the engine needs from a keep-awake: hold or release it, and whether it can work. */
export interface KeepAwakeHolder {
  /** Holds while `on` is true, releases while it is false; applies at once. */
  set(on: boolean): void;
  /** Why keep-awake can't work, in words for the terminal and the setting. */
  readonly error: string | undefined;
}

export interface KeepAwakeOptions {
  featureName: string;
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Kiln's own PID, which the hold watches. */
  pid?: number;
  /** Called once when keep-awake turns out not to work. */
  onError?: (message: string) => void;
}

/**
 * The platform's keep-awake hold as a child process.
 *
 *   const keepAwake = new KeepAwake({ featureName: "Customer returns", env: process.env });
 *   keepAwake.set(true);   // a session's process started
 *   keepAwake.set(false);  // none is running
 */
export class KeepAwake implements KeepAwakeHolder {
  error: string | undefined;
  private child: ChildProcess | undefined;
  private readonly options: KeepAwakeOptions;

  constructor(options: KeepAwakeOptions) {
    this.options = options;
  }

  /** The holding process's PID while held. */
  get holderPid(): number | undefined {
    return this.child?.pid;
  }

  set(on: boolean): void {
    if (on) this.hold();
    else this.release();
  }

  private hold(): void {
    if (this.child) return;
    // Each hold is a fresh attempt; an earlier refusal shows only until one works.
    this.error = undefined;
    const tool = keepAwakeTool(this.options.platform ?? process.platform, this.options.env, this.options.pid ?? process.pid, this.options.featureName);
    if (!tool.ok) return this.fail(keepAwakeMissingMessage(tool.missing));
    const child = spawnDetached(tool.command, tool.args, { cwd: process.cwd(), env: this.options.env, stdin: "ignore" });
    let stderr = "";
    child.stdout?.resume();
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (text: string) => (stderr += text));
    child.on("error", (error) => {
      if (this.child === child) this.child = undefined;
      this.fail(`Can’t keep this computer awake: ${error.message}`);
    });
    child.on("exit", () => {
      const ended = () => {
        if (this.child !== child) return;
        // It ended while Kiln still holds it: the tool refused, so it isn't keeping anything awake.
        this.child = undefined;
        const reason = stderr.trim().split(/\r?\n/)[0];
        this.fail(`Can’t keep this computer awake: ${reason || `${tool.command} exited`}`);
      };
      // On Windows the hold shares Kiln's console, so a Ctrl+C ends it too: Kiln's stop releases
      // it within the grace, and that release isn't a refusal.
      if (process.platform === "win32") setTimeout(ended, WINDOWS_CTRL_C_GRACE_MS);
      else ended();
    });
    this.child = child;
  }

  private release(): void {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    endProcessTree(child.pid, "SIGTERM");
  }

  private readonly reported = new Set<string>();

  private fail(message: string): void {
    this.error = message;
    // Said once in the terminal, however many sessions meet it.
    if (this.reported.has(message)) return;
    this.reported.add(message);
    this.options.onError?.(message);
  }
}
