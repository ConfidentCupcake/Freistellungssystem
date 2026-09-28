import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The .env lives at the repo root and is shared with the Express server, so
// point Vite there instead of at its own root (client/). Only VITE_-prefixed
// variables from it are ever exposed to browser code.
const envDir = fileURLToPath(new URL('.', import.meta.url));

// The client lives in client/ and builds into client/dist, which app.js serves
// statically in production. In development Vite serves it and proxies /api to
// the Express server so the session cookie stays same-origin.
export default defineConfig(({ mode }) => {
  // Prefix '' so PORT is readable here; it stays server-side, this is config.
  const env = loadEnv(mode, envDir, '');

  return {
    root: 'client',
    envDir,
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true
    },
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:' + (process.env.PORT || env.PORT || 3000)
      }
    }
  };
});
