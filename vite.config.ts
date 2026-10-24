import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under /racewing/ and from any static server.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
