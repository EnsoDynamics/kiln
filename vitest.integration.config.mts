import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * On macOS, `/usr/bin/git` is Apple's launcher: on every call it looks up the developer tools,
 * then runs the real git, about 16 ms a launch against 5 ms for the real git itself. One test
 * here launches git well over a hundred times, so the suite asks the launcher once where the
 * real git is (`xcrun --find git`) and puts that folder on PATH just ahead of `/usr/bin` for
 * the tests. Folders earlier on PATH keep their place, so the only tools that change are the
 * launchers in `/usr/bin`, which now resolve straight to the tools they would have launched.
 *
 * Returns nothing, and PATH stays as it is, wherever the first git on PATH is already a real
 * one (Linux, Windows, a Homebrew git on a Mac) or the launcher can't say where git is.
 */
function pathWithRealGitFirst(): string | undefined {
  if (process.platform !== 'darwin') return undefined;
  const folders = (process.env.PATH ?? '').split(delimiter);
  const first = folders.find((folder) => folder !== '' && existsSync(join(folder, 'git')));
  if (first !== '/usr/bin') return undefined;
  try {
    const real = execFileSync('/usr/bin/xcrun', ['--find', 'git'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
    if (real === '' || real === '/usr/bin/git' || !existsSync(real)) return undefined;
    folders.splice(folders.indexOf('/usr/bin'), 0, dirname(real));
    return folders.join(delimiter);
  } catch {
    return undefined;
  }
}

const realGitPath = pathWithRealGitFirst();

/**
 * The suite that runs real `git` against temporary repositories (a local bare repository
 * stands in for `origin`), and the built `kiln` command as a child process. It is separate
 * from the default suite because it spawns processes and needs `npm run build` first; it
 * needs no network and no credentials, so CI runs it on macOS, Linux and Windows.
 */
export default defineConfig({
  test: {
    environment: 'node',
    ...(realGitPath ? { env: { PATH: realGitPath } } : {}),
    // Each file spawns Git, SDK readers, CLI peers and sometimes Chrome. Four
    // simultaneous files pushed multi-round audit workflows past 60 seconds.
    // Keep the same two-file budget on shared workstations and CI runners.
    // Use --maxWorkers=1 for serial diagnosis.
    maxWorkers: Math.min(2, availableParallelism()),
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The 48 MiB child-heap proof must finish complete histories within the real
    // five-second read deadline. Run it without competing integration processes;
    // ordinary files still use the bounded parallel pool above.
    projects: [
      { extends: true, test: { name: 'history-memory', include: ['src/control/history-memory.integration.test.ts'], sequence: { groupOrder: 0 } } },
      { extends: true, test: { name: 'integration', include: ['src/**/*.integration.test.ts'], exclude: ['src/control/history-memory.integration.test.ts'], sequence: { groupOrder: 1 } } },
    ],
  },
});
