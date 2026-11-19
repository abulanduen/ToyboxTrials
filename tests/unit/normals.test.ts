import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { repairNormals } from '../../src/scene/normals';
import { roundedBoxGeometry } from '../../src/scene/RoundedBox';

const zeroNormals = (g: THREE.BufferGeometry) => {
  const n = g.attributes.normal;
  let z = 0;
  for (let i = 0; i < n.count; i++) if (!(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) >= 1e-4)) z++;
  return z;
};

describe('safe normals (zero normals flashed the hub through bloom)', () => {
  it('repairs a zero normal from the face it belongs to', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, -1], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 0, 0, 0, 1, 0], 3));
    expect(repairNormals(g)).toBe(1);
    expect(zeroNormals(g)).toBe(0);
    expect(g.attributes.normal.getY(1)).toBeCloseTo(1);
  });

  it('rounded boxes used in the hub and room have no zero normals', () => {
    // Sizes from the hub: the tabletop (radius 0.8, smoothness 2), the Workshop toy box (radius 0.5),
    // its lid, the scoreboard and climbing blocks, and the defaults.
    const cases: [number, number, number, number, number][] = [
      [140, 3.6, 104.4 + 1.6, 0.8, 2],
      [15, 6, 7.5, 0.5, 2],
      [15, 0.8, 7.5, 0.35, 2],
      [3, 2, 1.5, 0.5, 2],
      [1, 1, 1, 0.05, 4],
      [4, 0.6, 4, 0.12, 3],
    ];
    for (const [w, h, d, r, s] of cases) expect(zeroNormals(roundedBoxGeometry(w, h, d, r, s)), `${w}x${h}x${d} r${r}`).toBe(0);
  });
});
