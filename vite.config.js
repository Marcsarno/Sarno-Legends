import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5180, host: true },
  preview: { port: 4180, host: true },
  build: {
    outDir: 'dist', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0,
    // the game, plus the voice audition page so Marc can pick voices on the live site (/labs/voice.html)
    rollupOptions: { input: { main: 'index.html', voice: 'labs/voice.html' } },
  },
});
