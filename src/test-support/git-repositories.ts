// Real temporary Git repositories for integration tests, isolated from the person's own Git
// configuration, with a local bare repository available as `origin`.

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
    // Kiln's state goes in the sandbox, never the person's own state folder.
    XDG_STATE_HOME: join(root, "state"),
    LOCALAPPDATA: join(root, "state"),
  };
  // On Windows a folder can't be removed while a process that just ended still holds it; taskkill
  // returns before the tree it ends is gone, so cleanup waits up to 10 seconds there.
  const retries = process.platform === "win32" ? 50 : 10;
  const cleanup = () => {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: retries, retryDelay: 200 });
    } catch (error) {
      // Name what still holds the folder, so a failure says which process outlived its test.
      if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      const list = "Get-CimInstance Win32_Process | Where-Object { @('node.exe','cmd.exe','git.exe','sh.exe','bash.exe','sleep.exe','git-upload-pack.exe') -contains $_.Name } | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId) $($_.Name) $($_.CommandLine)\" }";
      const processes = spawnSync("powershell", ["-NoProfile", "-Command", list], { encoding: "utf8" });
      throw new Error(`${(error as Error).message}\nTest process ${process.pid}; processes that may hold it:\n${processes.stdout}`);
    }
  };
  return { root, env, cleanup };
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

/** A bare repository standing in for GitHub as `origin`. */
export function createBareOrigin(sandbox: Sandbox, name: string): string {
  const path = join(sandbox.root, `${name}.git`);
  git(sandbox, sandbox.root, "init", "-q", "--bare", "-b", "develop", path);
  return path;
}

/**
 * Installs the stand-in `claude` and `gh` (test/stand-ins/) in a folder as commands: a shell
 * script on macOS and Linux, a .cmd file on Windows, each running the script with this Node.
 */
export function installStandIns(directory: string): { claude: string; gh: string } {
  mkdirSync(directory, { recursive: true });
  const standIns = fileURLToPath(new URL("../../test/stand-ins/", import.meta.url));
  const install = (name: string, script: string) => {
    const target = join(standIns, script);
    if (process.platform === "win32") {
      const path = join(directory, `${name}.cmd`);
      writeFileSync(path, `@"${process.execPath}" "${target}" %*\r\n`);
      return path;
    }
    const path = join(directory, name);
    writeFileSync(path, `#!/bin/sh\nexec "${process.execPath}" "${target}" "$@"\n`);
    chmodSync(path, 0o755);
    return path;
  };
  return { claude: install("claude", "claude-stand-in.mjs"), gh: install("gh", "gh-stand-in.mjs") };
}

/**
 * A bare repository that Git reaches as `git@github.com:<owner>/<name>.git`, so the start
 * checks see origin on GitHub while every fetch and push stays on this machine: the sandbox's
 * GIT_SSH_COMMAND runs the requested `git-upload-pack` or `git-receive-pack` against
 * `<sandbox>/github/<owner>/<name>.git` instead of connecting anywhere. Returns the URL.
 */
export function createGithubOrigin(sandbox: Sandbox, owner: string, name: string): { url: string; bare: string } {
  const github = join(sandbox.root, "github");
  const bare = join(github, owner, `${name}.git`);
  mkdirSync(join(github, owner), { recursive: true });
  git(sandbox, sandbox.root, "init", "-q", "--bare", "-b", "develop", bare);
  const script = join(sandbox.root, "ssh-stand-in.sh");
  // git runs it as `<script> [options] git@github.com "git-upload-pack 'owner/name.git'"`.
  writeFileSync(script, `#!/bin/sh\nfor last; do :; done\ncd '${github.replace(/\\/g, "/")}' && eval "git \${last#git-}"\n`);
  chmodSync(script, 0o755);
  sandbox.env.GIT_SSH_COMMAND = `sh '${script.replace(/\\/g, "/")}'`;
  return { url: `git@github.com:${owner}/${name}.git`, bare };
}
