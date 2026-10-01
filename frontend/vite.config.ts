import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Only /api is proxied; /openapi.json and /docs stay on the backend.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
