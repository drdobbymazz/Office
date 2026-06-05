// Standalone web build of the renderer — the local-LLM office sandbox as a
// plain static SPA (no Electron). This is what deploys to Vercel.
//
// At runtime there's no preload bridge, so main.tsx installs the browser
// adapter (platform/cthWeb.ts): config in localStorage, Ollama over fetch.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@brand': resolve(__dirname, 'docs')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000
  }
});
