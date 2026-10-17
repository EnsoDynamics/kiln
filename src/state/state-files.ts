// Where Kiln keeps its state, outside every repository (PRD AC-GIT-03; technical design,
// "Kiln's State on Disk"), and the atomic writes every JSON file there uses.

import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The state root: `$XDG_STATE_HOME/kiln`, else `~/.local/state/kiln`, on macOS and Linux;
 * `%LOCALAPPDATA%\kiln` on Windows, which sits in the person's own profile and so is already
 * readable by its owner only.
 */
export function stateRoot(env: NodeJS.ProcessEnv): string {
  if (process.platform === "win32") {
    const localAppData = env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(localAppData, "kiln");
  }
  const xdg = env.XDG_STATE_HOME;
  return join(xdg && xdg !== "" ? xdg : join(homedir(), ".local", "state"), "kiln");
}

/**
 * One PRD's state directory: `<root>/<repository name>-<8-char hash of the main checkout's
 * path>/<PRD key>`, where the key is the PRD directory's path from the repository root with
 * `/` replaced by `--`. The main checkout and Kiln's worktree reach the same directory.
 *
 *   prdStateDirectory(root, "/home/a/acme-shop", "acme-shop", "docs/prds/customer-returns")
 *   // <root>/acme-shop-1a2b3c4d/docs--prds--customer-returns
 */
export function prdStateDirectory(root: string, mainCheckoutPath: string, repositoryName: string, prdDirectoryFromRoot: string): string {
  const hash = createHash("sha256").update(mainCheckoutPath).digest("hex").slice(0, 8);
  return join(root, `${repositoryName}-${hash}`, prdDirectoryFromRoot.split("/").join("--"));
}

/** Creates a directory and its parents readable by their owner only. */
export function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

/** Writes JSON to a temporary file and renames it into place, so a reader never sees half a file. */
export function writeJsonAtomically(path: string, value: unknown): void {
  ensurePrivateDirectory(dirname(path));
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function readJson<T>(path: string): T | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return JSON.parse(text) as T;
}

export function appendJsonLine(path: string, value: unknown): void {
  appendFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

export function readJsonLines<T>(path: string): T[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

/** A random 256-bit token, hex: the PRD's API token (technical design, "Local security"). */
export function newToken(): string {
  return randomBytes(32).toString("hex");
}
