import { defineConfig } from '@hey-api/openapi-ts';

// Generates src/client/ from the committed openapi.json, which
// `npm run generate` first re-exports from the backend offline (no server
// needed). Never edit src/client/ by hand: change the backend, then run
// `npm run generate`.
export default defineConfig({
  input: './openapi.json',
  output: {
    path: 'src/client',
    header: ({ defaultValue }) => [
      ...defaultValue,
      '// Generated code. Do not edit by hand; run `npm run generate` instead.',
    ],
  },
  plugins: ['@hey-api/client-fetch', '@hey-api/typescript', '@hey-api/sdk', '@tanstack/react-query'],
});
