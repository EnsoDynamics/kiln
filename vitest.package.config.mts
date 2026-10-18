import { defineConfig } from 'vitest/config';

/**
 * The check that the package npm would publish works once installed (PRD AC-INSTALL-01): it
 * packs Kiln, installs the tarball globally into a temporary prefix, and runs that `kiln`. It
 * is separate from the other suites because installing reads the npm registry for Kiln's
 * dependencies; CI runs it on macOS, Linux and Windows, and the release workflow before publishing.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.package.test.ts'],
    environment: 'node',
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
