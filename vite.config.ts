import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Concept art lives in public/assets/concepts/ for the art-direction package, but it is
 * reference material, not a production asset — strip it from the shipped build.
 */
function stripConceptArt(): Plugin {
  return {
    name: 'toybox:strip-concept-art',
    apply: 'build',
    closeBundle() {
      rmSync(resolve(__dirname, 'dist/assets/concepts'), { recursive: true, force: true });
    },
  };
}

// Relative base so the build can be hosted from any sub-path (e.g. Base44 / static hosting).
export default defineConfig({
  base: './',
  plugins: [react(), stripConceptArt()],
  server: { host: true, port: 5173 },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three') || id.includes('postprocessing')) return 'r3f';
          return undefined;
        },
      },
    },
  },
});
