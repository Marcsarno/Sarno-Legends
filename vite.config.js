import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5180, host: true },
  preview: { port: 4180, host: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
});
