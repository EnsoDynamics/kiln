import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly' } },
  },
  globalIgnores(['dist/**', 'node_modules/**', 'test/fixtures/**']),
]);
