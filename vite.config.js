import { defineConfig } from 'vite';

// GV_HMR=0 turns off hot reload (used for scripted screenshot/playtest runs so concurrent file edits never reload the page)
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, hmr: process.env.GV_HMR === '0' ? false : undefined },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
