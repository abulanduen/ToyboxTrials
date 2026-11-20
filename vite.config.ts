import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, rmSync } from 'node:fs';
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

/**
 * `virtual:voice-files`: the ids of the voice lines that have a recording in
 * public/assets/audio/voice/ (`<id>.mp3`), read from disk at build time (and on dev-server start or
 * when a file is added there). src/game/voice.ts only fetches lines on this list, so lines that
 * are not recorded yet stay silent without a 404 per line.
 */
export function voiceFiles(): Plugin {
  const dir = resolve(__dirname, 'public/assets/audio/voice');
  const id = 'virtual:voice-files';
  const resolved = '\0' + id;
  const list = () => {
    try {
      return readdirSync(dir).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
    } catch {
      return [];
    }
  };
  return {
    name: 'toybox:voice-files',
    resolveId: (s) => (s === id ? resolved : undefined),
    load: (s) => (s === resolved ? `export default ${JSON.stringify(list())};` : undefined),
    configureServer(server) {
      server.watcher.add(dir);
      const changed = (file: string) => {
        if (!file.startsWith(dir) || !file.endsWith('.mp3')) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
    },
  };
}

// Relative base so the build can be hosted from any sub-path (e.g. Base44 / static hosting).
export default defineConfig({
  base: './',
  plugins: [react(), stripConceptArt(), voiceFiles()],
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
