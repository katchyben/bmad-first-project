import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Only /api is proxied; /docs stays on the backend. (Vite serves files in
    // frontend/ from its root, so :5173/openapi.json is the committed schema.)
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
