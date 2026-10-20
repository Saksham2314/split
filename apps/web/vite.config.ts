import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
// vitest/config re-exports Vite's defineConfig with the extra `test` option typed.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the browser talks only to Vite (localhost:5173); Vite forwards /api to the
    // Express API. The browser sees one origin, exactly like production behind Caddy, so the
    // session cookie works without any CORS configuration.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
