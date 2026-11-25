/**
 * The plaza fountain's code-built geometry (src/scene/fountainDecor.ts) must sit inside its collider
 * (the basin: FOUNTAIN.r, FOUNTAIN.top), keep the pool and bowl water tucked inside their walls, and
 * stay within a modest triangle budget (it is drawn in the main and shadow passes on every tier).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOWL_WATER, FOUNTAIN_TOP, POOL_R, POOL_Y, dripPoints, fountainBasinGeometry, fountainTiersGeometry } from '../../src/scene/fountainDecor';
import { FOUNTAIN } from '../../src/scene/layout';

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};
const maxR = (g: THREE.BufferGeometry) => {
  const p = g.attributes.position;
  let m = 0;
  for (let i = 0; i < p.count; i++) m = Math.max(m, Math.hypot(p.getX(i), p.getZ(i)));
  return m;
};

describe('fountain geometry', () => {
  const basin = fountainBasinGeometry();
  const tiers = fountainTiersGeometry();

  it('the basin fills the collider: outer face at FOUNTAIN.r, rim at FOUNTAIN.top, standing on the table', () => {
    const b = box(basin);
    expect(maxR(basin)).toBeLessThanOrEqual(FOUNTAIN.r + 0.01);
    expect(maxR(basin)).toBeGreaterThan(FOUNTAIN.r - 0.1);
    expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(b.max.y).toBeLessThanOrEqual(FOUNTAIN.top + 0.01);
    expect(b.max.y).toBeGreaterThan(FOUNTAIN.top - 0.1);
  });

  it('the tiers stand in the pool, inside the basin, as tall as FOUNTAIN_TOP', () => {
    const b = box(tiers);
    expect(b.min.y).toBeGreaterThanOrEqual(POOL_Y - 0.1);
    expect(b.max.y).toBeCloseTo(FOUNTAIN_TOP, 1);
    expect(maxR(tiers)).toBeLessThan(POOL_R);
  });

  it('the column collider covers the pedestal and is as tall as the tiers', () => {
    // the pedestal's foot (the widest part below the lower bowl) fits inside the column's circle
    const p = tiers.attributes.position;
    let foot = 0;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 4.6) foot = Math.max(foot, Math.hypot(p.getX(i), p.getZ(i)));
    expect(foot).toBeLessThanOrEqual(FOUNTAIN.column.r + 0.01);
    expect(foot).toBeGreaterThan(FOUNTAIN.column.r - 0.2);
    expect(FOUNTAIN.column.top).toBeGreaterThanOrEqual(FOUNTAIN_TOP);
  });

  it('drips start at the bowl tips and fall into water inside the basin', () => {
    for (const d of dripPoints()) {
      expect(Math.hypot(d.x, d.z)).toBeLessThan(POOL_R);
      expect(d.y).toBeGreaterThan(d.floor);
      expect([POOL_Y, ...BOWL_WATER.map((w) => w.y)]).toContain(d.floor);
    }
  });

  it('stays within its triangle budget', () => {
    console.log(`fountain triangles: basin ${tris(basin)}, tiers ${tris(tiers)}`);
    expect(tris(basin) + tris(tiers)).toBeLessThan(12000);
  });
});
