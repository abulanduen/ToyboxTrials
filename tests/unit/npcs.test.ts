/**
 * The Hub's NPC toys (src/game/npcs.ts): every route keeps to walkable ground of its level and clear
 * of anything solid there, the clock moves them smoothly (no jumps, the loop joins up), the arcade's
 * players stand at the machines' spots facing them, the fans sit on the stands, and the Low tier keeps
 * a few in every place.
 */
import { describe, expect, it } from 'vitest';
import { NPCS, NPC_SPEED, npcLegs, npcPose } from '../../src/game/npcs';
import { LEVEL_WALK, LEVEL_Y, isWalkable } from '../../src/game/hubBounds';
import { STEP_HEIGHT, overlaps } from '../../src/game/collision';
import { MACHINES, STANDS, hubColliders, machineStand, standTier } from '../../src/scene/layout';

const R = 0.85;
const colliders = hubColliders();
const solidOn = (lv: 'table' | 'floor') => colliders.filter((c) => (c.lv ?? 'table') === lv && c.top > LEVEL_Y[lv] + STEP_HEIGHT);

describe('NPC toys', () => {
  it('have unique ids, a level and at least one stop', () => {
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(NPCS.length);
    for (const n of NPCS) expect(n.stops.length, n.id).toBeGreaterThan(0);
  });

  it('walk only on walkable ground of their level, clear of everything solid there', () => {
    for (const n of NPCS) {
      const solid = solidOn(n.level);
      const { legs } = npcLegs(n);
      for (const l of legs) {
        if (l.to.action === 'sit') continue; // sitting on a stand's bench (on purpose on its collider)
        const d = Math.hypot(l.to.x - l.from.x, l.to.z - l.from.z);
        for (let s = 0; s <= d; s += 0.5) {
          const k = d ? s / d : 0;
          const x = l.from.x + (l.to.x - l.from.x) * k;
          const z = l.from.z + (l.to.z - l.from.z) * k;
          expect(isWalkable(x, z, R, LEVEL_WALK[n.level]), `${n.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true);
          expect(solid.filter((c) => overlaps(c, x, z, R)).map((c) => c.id), `${n.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toEqual([]);
        }
      }
    }
  });

  it('move smoothly on the clock: no jumps, and the loop joins up', () => {
    for (const n of NPCS) {
      const { loop } = npcLegs(n);
      let prev = npcPose(n, -n.offset);
      for (let t = 0.05; t <= loop + 0.05; t += 0.05) {
        const p = npcPose(n, t - n.offset);
        expect(Math.hypot(p.x - prev.x, p.z - prev.z), `${n.id} at ${t.toFixed(2)}`).toBeLessThan(NPC_SPEED * 0.05 + 1e-6);
        prev = p;
      }
      // the same moment always gives the same pose (every player's screen agrees)
      expect(npcPose(n, 123.4)).toEqual(npcPose(n, 123.4));
    }
  });

  it('the arcade’s players play at a machine’s stand spot, facing it; fans sit on a stand’s bench facing the pitch', () => {
    let plays = 0;
    for (const n of NPCS) {
      for (const s of n.stops) {
        if (s.action === 'play') {
          plays++;
          const m = MACHINES.find((mc) => Math.hypot(machineStand(mc, 0.2).x - s.x, machineStand(mc, 0.2).z - s.z) < 0.01);
          expect(m, n.id).toBeDefined();
          expect(Math.cos(s.face - (m!.rot + Math.PI))).toBeCloseTo(1, 6);
          expect(n.level).toBe('floor');
        }
        if (s.action === 'sit') {
          const st = STANDS.find((x) => x.minX < s.x && s.x < x.maxX && [...Array(x.tiers).keys()].some((i) => Math.abs(standTier(x, i).z - s.z) < 0.01 && Math.abs(standTier(x, i).top - (s.y ?? 0)) < 0.01));
          expect(st, n.id).toBeDefined();
        }
      }
    }
    expect(plays).toBeGreaterThanOrEqual(12);
  });

  it('the Low tier keeps a few in the arcade, on the plaza and in the stands', () => {
    const low = NPCS.filter((n) => n.low);
    expect(low.filter((n) => n.level === 'floor').length).toBeGreaterThanOrEqual(2);
    expect(low.filter((n) => n.level === 'table' && n.stops.some((s) => s.action === 'sit')).length).toBeGreaterThanOrEqual(2);
    expect(low.filter((n) => n.level === 'table' && !n.stops.some((s) => s.action === 'sit')).length).toBeGreaterThanOrEqual(1);
    expect(low.length).toBeLessThanOrEqual(8);
  });
});
