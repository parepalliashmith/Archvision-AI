import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // server.js serves static files from ../public — this makes `npm run build`
    // (run from client/) land the production bundle exactly where it's expected,
    // and clears out whatever was there before (a stale pre-React build, if this
    // is the first build after the client was rewritten).
    outDir: '../public',
    emptyOutDir: true,
  },
});
