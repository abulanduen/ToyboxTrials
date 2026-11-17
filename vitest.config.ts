import { defineConfig } from 'vitest/config';

// Unit tests for pure game logic (rules cores, scoring, tournament selection). No DOM, no WebGL.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
