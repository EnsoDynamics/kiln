import { defineConfig } from 'vitest/config';

/**
 * The suite that runs real `git` against temporary repositories (a local bare repository
 * stands in for `origin`), and the built `kiln` command as a child process. It is separate
 * from the default suite because it spawns processes and needs `npm run build` first; it
 * needs no network and no credentials, so CI runs it on macOS, Linux and Windows.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
