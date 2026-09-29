import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under /orb-voice-visualizer/.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
