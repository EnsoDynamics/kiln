import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

/**
 * The suite that runs real `git` against temporary repositories (a local bare repository
 * stands in for `origin`), and the built `kiln` command as a child process. It is separate
 * from the default suite because it spawns processes and needs `npm run build` first; it
 * needs no network and no credentials, so CI runs it on macOS, Linux and Windows.
 */
export default defineConfig({
  test: {
    environment: 'node',
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
