import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5180, host: true },
  preview: { port: 4180, host: true },
  build: {
    outDir: 'dist', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0,
    // the deckbuilder (index.html) and the first-person prototype (fps.html, src/fps/)
    rollupOptions: { input: { main: 'index.html', fps: 'fps.html' } },
  },
});
