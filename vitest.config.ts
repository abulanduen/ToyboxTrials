import { defineConfig } from 'vitest/config';
import { voiceFiles } from './vite.config';

// Unit tests for pure game logic (rules cores, scoring, tournament selection). No DOM, no WebGL.
export default defineConfig({
  // the scene modules import `virtual:voice-files` (which voice lines are recorded)
  plugins: [voiceFiles()],
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
