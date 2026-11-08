// Opens the browser view in the person's default browser (PRD AC-START-03; technical design,
// "Dependencies" and "Opening the view"): `open` on macOS, `xdg-open` on Linux, `cmd /c start`
// on Windows. Over SSH nothing is opened: a browser on the remote machine isn't the person's.

import { spawn } from "node:child_process";
import { findExecutable } from "./helper-process.js";

/** The command that opens an address, for this platform. */
export function browserCommand(platform: NodeJS.Platform, address: string, env: NodeJS.ProcessEnv): { command: string; args: string[] } | { missing: string } {
  if (platform === "darwin") return { command: findExecutable("open", env) ?? "/usr/bin/open", args: [address] };
  // Node writes an empty argument as "", which `start` takes as the window title.
  if (platform === "win32") return { command: env.ComSpec ?? "cmd.exe", args: ["/c", "start", "", address] };
  const xdgOpen = findExecutable("xdg-open", env);
  return xdgOpen ? { command: xdgOpen, args: [address] } : { missing: "xdg-open" };
}

/**
 * What came of opening the view: opened; not tried, because Kiln runs over SSH; not tried,
 * because the machine has no opener; or the opener failed, with why.
 */
export type BrowserOpening = { kind: "opened" } | { kind: "remote" } | { kind: "no_opener" } | { kind: "failed"; reason: string };

/** Whether Kiln runs in an SSH login, where any browser it opened would be on the remote machine. */
export function overSsh(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SSH_CONNECTION || env.SSH_TTY);
}

/** How long an opener that hasn't exited is waited for: one still running is taken to be the browser itself. */
const OPENER_WAIT_MS = 5_000;

/**
 * Opens the address and resolves with what came of it. Over SSH, or with no opener on the
 * machine, nothing is tried. The opener is spawned detached with no pipes, so an `xdg-open`
 * that runs the browser in the foreground neither holds Kiln up nor goes down with it; only a
 * spawn error or a non-zero exit within a few seconds counts as a failure.
 *
 *   await openBrowser("http://127.0.0.1:4700/customer-returns", process.env)  // { kind: "opened" }
 */
export function openBrowser(address: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): Promise<BrowserOpening> {
  if (overSsh(env)) return Promise.resolve({ kind: "remote" });
  const opener = browserCommand(platform, address, env);
  if ("missing" in opener) return Promise.resolve({ kind: "no_opener" });
  return new Promise((resolve) => {
    const child = spawn(opener.command, opener.args, { env, detached: platform !== "win32", windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.unref();
      resolve({ kind: "opened" });
    }, OPENER_WAIT_MS);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ kind: "failed", reason: error.message });
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve(code === 0 ? { kind: "opened" } : { kind: "failed", reason: `${opener.command} exited with ${code === null ? signal : `code ${code}`}` });
    });
  });
}
