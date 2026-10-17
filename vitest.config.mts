import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests sit beside the code they test. `*.integration.test.ts` runs real git against
    // temporary repositories and the built `kiln` command, from `npm run test:integration`,
    // which builds first; this default suite needs nothing but Node.
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
    environment: 'node',
  },
});
