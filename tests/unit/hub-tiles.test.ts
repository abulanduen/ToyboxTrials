import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TILE_STEP, tilesOverlap, withTileHeights } from '../../src/scene/Village';

/** Brute-force reference with real three.js transforms: does any sample of tile b fall inside tile a (half-size h)? */
function overlapReference(a: { x: number; z: number; rot: number }, b: { x: number; z: number; rot: number }, h: number) {
  const m = (t: typeof a) => new THREE.Matrix4().compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.rot, 0)), new THREE.Vector3(1, 1, 1));
  const inv = m(a).invert();
  const mb = m(b);
  const v = new THREE.Vector3();
  for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) {
    v.set(-0.95 + (1.9 * i) / 60, 0, -0.95 + (1.9 * j) / 60).applyMatrix4(mb).applyMatrix4(inv);
    if (Math.abs(v.x) < h && Math.abs(v.z) < h) return true;
  }
  return false;
}

describe('hub path tiles', () => {
  it('overlap test agrees with real three.js transforms (clear cases)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let clear = 0;
    for (let k = 0; k < 400; k++) {
      const a = { x: 0, z: 0, rot: rnd() * Math.PI };
      const b = { x: (rnd() - 0.5) * 5, z: (rnd() - 0.5) * 5, rot: rnd() * Math.PI };
      // Clear when a slightly shrunken and a slightly grown tile a agree; skip near-touching pairs.
      const inner = overlapReference(a, b, 0.85), outer = overlapReference(a, b, 1.05);
      if (inner !== outer) continue;
      clear++;
      expect(tilesOverlap(a, b), JSON.stringify({ a, b })).toBe(inner);
    }
    expect(clear).toBeGreaterThan(300);
  });

  it('the fountain ring: overlapping neighbours never share a height (no z-fighting)', () => {
    const ring = Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2;
      return { x: Math.cos(a) * 7, z: Math.sin(a) * 7 - 1, rot: -a };
    });
    const tiles = withTileHeights(ring);
    let pairs = 0;
    for (let i = 0; i < tiles.length; i++)
      for (let j = i + 1; j < tiles.length; j++)
        if (tilesOverlap(tiles[i], tiles[j])) {
          pairs++;
          expect(Math.abs(tiles[i].y - tiles[j].y)).toBeGreaterThanOrEqual(TILE_STEP - 1e-9);
        }
    // The first and last ring tiles overlap: the old `i % 3` heights gave them the same top.
    expect(tilesOverlap(tiles[0], tiles[21])).toBe(true);
    expect(pairs).toBeGreaterThanOrEqual(22);
    expect(Math.max(...tiles.map((t) => t.level))).toBeLessThanOrEqual(3);
  });
});
