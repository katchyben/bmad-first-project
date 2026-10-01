import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const FETCH_MESSAGE =
  'Use the generated client (src/client) configured in src/api; no hand-written HTTP calls.';

export default defineConfig([
  // src/client/ is generated: it is the only code allowed to call fetch.
  globalIgnores(['dist', 'node_modules', 'playwright-report', 'test-results', 'src/client']),
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: FETCH_MESSAGE },
        { name: 'XMLHttpRequest', message: FETCH_MESSAGE },
        { name: 'EventSource', message: FETCH_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: FETCH_MESSAGE },
        { object: 'globalThis', property: 'fetch', message: FETCH_MESSAGE },
        { object: 'self', property: 'fetch', message: FETCH_MESSAGE },
        { object: 'navigator', property: 'sendBeacon', message: FETCH_MESSAGE },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'axios', message: FETCH_MESSAGE }],
          patterns: [{ group: ['axios/*'], message: FETCH_MESSAGE }],
        },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "ImportExpression[source.value=/^axios(\\u002F|$)/]", message: FETCH_MESSAGE },
        {
          selector: "CallExpression[callee.name='require'][arguments.0.value=/^axios(\\u002F|$)/]",
          message: FETCH_MESSAGE,
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Only src/api/ may touch the generated client instance and reconfigure it.
    // This repeats the axios ban because a later no-restricted-imports replaces it.
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['src/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'axios', message: FETCH_MESSAGE }],
          patterns: [
            { group: ['axios/*'], message: FETCH_MESSAGE },
            {
              group: ['**/client/client.gen', '**/client/client.gen.*'],
              message: 'Import the configured client from src/api, not src/client/client.gen.',
            },
          ],
        },
      ],
    },
  },
]);
