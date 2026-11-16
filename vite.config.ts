import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build can be hosted from any sub-path (e.g. Base44 / static hosting).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],
        },
      },
    },
  },
});
