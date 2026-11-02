import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :4000 and Vite proxies /api to it, so the browser sees ONE origin
// (same as production) - this keeps the httpOnly cookie, SSE and CSRF origin check identical in both.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:4000', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
