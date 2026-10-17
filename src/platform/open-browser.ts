// Opens the browser view in the person's default browser (PRD AC-START-03; technical design,
// "Dependencies"): `open` on macOS, `xdg-open` on Linux, `cmd /c start` on Windows.

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

/** How long an opener that hasn't exited is waited for: one still running is taken to be the browser itself. */
const OPENER_WAIT_MS = 5_000;

/**
 * Opens the address and resolves with the reason it couldn't, or undefined once it did. The
 * opener is spawned detached with no pipes, so an `xdg-open` that runs the browser in the
 * foreground neither holds Kiln up nor goes down with it; only a spawn error or a non-zero exit
 * within a few seconds counts as a failure.
 *
 *   await openBrowser("http://127.0.0.1:4700/customer-returns", process.env)  // undefined
 */
export function openBrowser(address: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
  const opener = browserCommand(platform, address, env);
  if ("missing" in opener) return Promise.resolve(`${opener.missing} isn’t on the PATH`);
  return new Promise((resolve) => {
    const child = spawn(opener.command, opener.args, { env, detached: platform !== "win32", windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.unref();
      resolve(undefined);
    }, OPENER_WAIT_MS);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve(error.message);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve(code === 0 ? undefined : `${opener.command} exited with ${code === null ? signal : `code ${code}`}`);
    });
  });
}
