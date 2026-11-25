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

const runAlone = ['src/control/history-memory.integration.test.ts', 'src/billing/passive-boundary.integration.test.ts'];

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
    // Each file spawns Git, SDK readers, CLI peers and sometimes Chrome, so budget about
    // three cores for a file: two files at once on a four-core CI runner, six on an
    // 18-core workstation. Use --maxWorkers=1 for serial diagnosis.
    maxWorkers: Math.min(availableParallelism(), Math.max(2, Math.floor(availableParallelism() / 3))),
    // With a 60-second limit, four files at once pushed multi-round audit workflows past
    // it. The workstations this suite runs on are usually busy with other sessions' builds
    // and suites too, and a test that only ran slowly costs a whole rerun when it is
    // reported as a failure, so the limit is twice what the slowest tests need alone.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Two files read real deadlines in the product, so they run one at a time, after the
    // parallel pool has finished (Vitest runs a project with file parallelism off last):
    // the 48 MiB child-heap proof must finish complete histories within the five-second
    // read deadline, and the passive boundary's `claude --version` read has five seconds
    // too, which the installed CLI misses while other files are spawning processes.
    projects: [
      { extends: true, test: { name: 'integration', include: ['src/**/*.integration.test.ts'], exclude: runAlone } },
      { extends: true, test: { name: 'alone', include: runAlone, fileParallelism: false } },
    ],
  },
});
