/**
 * Seeded randomness. Every random decision that affects fairness (sequences, game order, bot
 * choices) goes through these, so the same seed gives the same match on every client and on a
 * future game server.
 */

/** mulberry32: tiny, fast, good enough for gameplay. Returns floats in [0, 1). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Derive a stable sub-seed (e.g. per round, per bot) from a parent seed and a label. */
export function subSeed(seed: number, label: string | number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const s = String(label);
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** A fresh, non-deterministic seed for starting a new match. */
export function newSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
