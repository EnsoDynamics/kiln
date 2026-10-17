// Real temporary Git repositories for integration tests, isolated from the person's own Git
// configuration, with a local bare repository available as `origin`.

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Sandbox {
  root: string;
  /** Environment for every git call in the test and for Kiln itself: no global or system Git config. */
  env: NodeJS.ProcessEnv;
  cleanup(): void;
}

export function createSandbox(): Sandbox {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "kiln-test-")));
  const globalConfig = join(root, "empty.gitconfig");
  writeFileSync(globalConfig, "");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Kiln Test",
    GIT_AUTHOR_EMAIL: "kiln-test@example.com",
    GIT_COMMITTER_NAME: "Kiln Test",
    GIT_COMMITTER_EMAIL: "kiln-test@example.com",
    NO_COLOR: "1",
  };
  return { root, env, cleanup: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}

export function git(sandbox: Sandbox, cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: sandbox.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** A repository on `develop` with one commit, its `origin` set to `originUrl` when given. */
export function createRepository(sandbox: Sandbox, name: string, originUrl?: string): string {
  const path = join(sandbox.root, name);
  mkdirSync(path, { recursive: true });
  git(sandbox, path, "init", "-q", "-b", "develop");
  writeFileSync(join(path, "README.md"), `# ${name}\n`);
  git(sandbox, path, "add", "-A");
  git(sandbox, path, "commit", "-q", "-m", "initial commit");
  if (originUrl) git(sandbox, path, "remote", "add", "origin", originUrl);
  return path;
}

/** Writes files into a directory of the repository and commits them. */
export function commitFiles(sandbox: Sandbox, repository: string, directory: string, files: Record<string, string>): void {
  const target = join(repository, directory);
  mkdirSync(target, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(target, name), content);
  git(sandbox, repository, "add", "-A");
  git(sandbox, repository, "commit", "-q", "-m", `add ${directory}`);
}

/**
 * Writes a stand-in executable that prints `stderr` and exits with `exitCode`: a shell script
 * on macOS and Linux, a .cmd file on Windows. Given `expectedArgs`, it exits 2 for any other
 * arguments, so a test also proves how Kiln called it. Returns its path.
 */
export function writeStandIn(directory: string, name: string, exitCode: number, stderr = "", expectedArgs?: string): string {
  mkdirSync(directory, { recursive: true });
  if (process.platform === "win32") {
    const path = join(directory, `${name}.cmd`);
    const guard = expectedArgs ? `if not "%*"=="${expectedArgs}" exit /b 2\r\n` : "";
    writeFileSync(path, `@echo off\r\n${guard}${stderr ? `echo ${stderr} 1>&2\r\n` : ""}exit /b ${exitCode}\r\n`);
    return path;
  }
  const path = join(directory, name);
  const guard = expectedArgs ? `[ "$*" = "${expectedArgs}" ] || exit 2\n` : "";
  writeFileSync(path, `#!/bin/sh\n${guard}${stderr ? `echo '${stderr}' >&2\n` : ""}exit ${exitCode}\n`);
  chmodSync(path, 0o755);
  return path;
}
