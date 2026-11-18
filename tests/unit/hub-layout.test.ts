import { describe, expect, it } from 'vitest';
import { PLAY_BOUNDS, STEP_HEIGHT, clampToBounds, overlaps, type Collider } from '../../src/game/collision';
import { MINIGAMES } from '../../src/minigames/registry';
import { DOMINO, DOMINO_UV, dominoGeometry, dominoRestY } from '../../src/scene/domino';
import { FOUNTAIN, GATE, GATES, GATE_DECOR, GATE_ROAD, GATE_STAND, SCOREBOARD, TABLE, gateLocal, hubColliders } from '../../src/scene/layout';
import { hubFence, hubPathLines, hubPathTiles, tilesOverlap, TILE_STEP } from '../../src/scene/paths';
import { GATE_THEMES } from '../../src/scene/gateDecor';
import { Kit } from '../../src/scene/kit';
import { SignAtlas } from '../../src/scene/signAtlas';
import type { DominoSpec } from '../../src/scene/domino';

const PLAYER_R = 0.85;
const colliders = hubColliders();
const blocking = colliders.filter((c) => c.top > STEP_HEIGHT);
const inBounds = (x: number, z: number, r = PLAYER_R) => {
  const p = { x, z };
  clampToBounds(p, r);
  return Math.hypot(p.x - x, p.z - z) < 1e-9;
};
const hitsAt = (x: number, z: number, r: number, list: Collider[] = blocking) => list.filter((c) => overlaps(c, x, z, r)).map((c) => c.id);

describe('hub gates', () => {
  const playable = MINIGAMES.filter((g) => g.status === 'playable');

  it('every playable game has exactly one gate, in its accent colour', () => {
    expect(playable.length).toBe(11);
    for (const g of playable) {
      const mine = GATES.filter((x) => x.game === g.id);
      expect(mine.length, g.id).toBe(1);
      expect(mine[0].id).toBe(`gate-${g.id}`);
      expect(mine[0].color).toBe(g.accent);
      expect(mine[0].title).toBe(g.title);
    }
    expect(GATES.length).toBe(playable.length);
    expect(new Set(GATES.map((g) => g.id)).size).toBe(GATES.length);
  });

  it('gates stand inside the play area, face the fountain and keep their distance from each other', () => {
    for (const g of GATES) {
      expect(inBounds(g.x, g.z), g.id).toBe(true);
      // local +z (the front) points at the fountain
      const f = gateLocal(g, 0, 1);
      const toF = Math.hypot(FOUNTAIN.x - g.x, FOUNTAIN.z - g.z);
      expect(Math.hypot(FOUNTAIN.x - f.x, FOUNTAIN.z - f.z)).toBeCloseTo(toF - 1, 6);
      for (const o of GATES) if (o !== g) expect(Math.hypot(o.x - g.x, o.z - g.z), `${g.id} / ${o.id}`).toBeGreaterThan(15);
    }
  });

  it('the spot where you stand to open a gate is reachable and clear, and so is the way through the arch', () => {
    for (const g of GATES) {
      for (const lz of [GATE_ROAD, GATE_STAND, 1, 0]) {
        const p = gateLocal(g, 0, lz);
        expect(inBounds(p.x, p.z), `${g.id} lz=${lz}`).toBe(true);
        expect(hitsAt(p.x, p.z, PLAYER_R), `${g.id} lz=${lz}`).toEqual([]);
      }
    }
  });

  it("a gate's pillars and themed props do not overlap anything else that is solid", () => {
    for (const g of GATES) {
      const others = colliders.filter((c) => !c.id?.startsWith(g.id));
      const pts: { x: number; z: number; r: number; what: string }[] = [];
      for (const side of [-1, 1]) {
        // sample the pillar footprint
        for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
          const p = gateLocal(g, side * (GATE.width / 2 - GATE.pillar / 2) + (dx * GATE.pillar) / 2, (dz * GATE.depth) / 2);
          pts.push({ ...p, r: 0.05, what: 'pillar' });
        }
      }
      for (const [k, d] of Object.entries(GATE_DECOR)) pts.push({ ...gateLocal(g, d.lx, d.lz), r: d.r, what: k });
      for (const p of pts) expect(hitsAt(p.x, p.z, p.r, others), `${g.id} ${p.what}`).toEqual([]);
    }
  });
});

describe('hub streets', () => {
  const lines = hubPathLines();

  it('every gate is on a street: a stub to its arch from the ring road or its own spoke', () => {
    for (const g of GATES) {
      expect(lines.some((l) => l.id === `stub:${g.id}`), g.id).toBe(true);
      const road = gateLocal(g, 0, GATE_ROAD);
      const onRoad = lines.some((l) => (l.id === 'ring' || l.id === `spoke:${g.id}`) && l.pts.some(([x, z]) => Math.hypot(x - road.x, z - road.z) < 1e-6));
      expect(onRoad, g.id).toBe(true);
    }
  });

  it('walking lanes are clear: nothing solid stands on a street', () => {
    for (const l of lines) {
      for (let s = 0; s < l.pts.length - 1; s++) {
        const [ax, az] = l.pts[s];
        const [bx, bz] = l.pts[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        // streets to a building stop at its doorstep; the last centimetre may touch the building
        const toBuilding = l.id === 'avenue' || (l.id.startsWith('spoke:') && !l.id.includes('gate-'));
        const stop = toBuilding && s === l.pts.length - 2 ? len - 1.5 : len;
        for (let d = 0; d <= stop; d += 0.5) {
          const x = ax + ((bx - ax) * d) / len;
          const z = az + ((bz - az) * d) / len;
          // the pencil log lies across the approach on purpose: you hop it
          expect(hitsAt(x, z, 1.0).filter((id) => !(l.id === 'approach' && id === 'pencil')), `${l.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toEqual([]);
          expect(inBounds(x, z), `${l.id} at ${x.toFixed(1)}, ${z.toFixed(1)}`).toBe(true);
        }
      }
    }
  });

  it('tiles: none under a solid prop, none coplanar with a tile it overlaps', () => {
    const tiles = hubPathTiles();
    expect(tiles.length).toBeGreaterThan(200);
    expect(tiles.length).toBeLessThan(700);
    for (const t of tiles) expect(hitsAt(t.x, t.z, 0.5, colliders.filter((c) => c.top > 0.5)), `${t.x},${t.z}`).toEqual([]);
    for (let i = 0; i < tiles.length; i++)
      for (let j = i + 1; j < tiles.length; j++)
        if (tilesOverlap(tiles[i], tiles[j])) expect(Math.abs(tiles[i].y - tiles[j].y)).toBeGreaterThanOrEqual(TILE_STEP - 1e-9);
    expect(Math.max(...tiles.map((t) => t.level))).toBeLessThanOrEqual(4);
  });
});

describe('hub bounds and fence', () => {
  it('the play area and its fence fit on the table', () => {
    const b = PLAY_BOUNDS;
    expect(b.minX - 6).toBeGreaterThan(TABLE.minX);
    expect(b.maxX + 6).toBeLessThan(TABLE.maxX);
    expect(b.minZ - 6).toBeGreaterThan(TABLE.minZ);
    expect(b.maxZ + 6).toBeLessThan(TABLE.maxZ);
    const fence = hubFence();
    expect(fence.length).toBeGreaterThan(80);
    for (const d of fence) {
      expect(d.x).toBeGreaterThan(TABLE.minX + 2);
      expect(d.x).toBeLessThan(TABLE.maxX - 2);
      expect(d.z).toBeGreaterThan(TABLE.minZ + 2);
      expect(d.z).toBeLessThan(TABLE.maxZ - 2);
      // the fence parts for the book cliffs and the mug
      expect(hitsAt(d.x, d.z, 1.2, colliders.filter((c) => c.id === 'books' || c.id?.startsWith('mug')))).toEqual([]);
    }
  });

  it('spawn, the plaza and the existing landmarks stay where they were', () => {
    expect(inBounds(0, 22)).toBe(true);
    expect(hitsAt(0, 22, PLAYER_R)).toEqual([]);
    const at = (id: string) => colliders.find((c) => c.id === id)!;
    expect([at('fountain').x, at('fountain').z]).toEqual([0, -1]);
    expect([at('pavilion').x, at('pavilion').z]).toEqual([0, -21]);
    expect([at('workshop').x, at('workshop').z]).toEqual([-26, -9]);
    expect([at('shop').x, at('shop').z]).toEqual([-30, 11]);
    expect([SCOREBOARD.x, SCOREBOARD.z]).toEqual([31, 7]);
    // its collider is shifted back a little to cover the rear braces
    expect(Math.hypot(at('scoreboard').x - 31, at('scoreboard').z - 7)).toBeLessThan(1);
    expect([at('jack').x, at('jack').z]).toEqual([-35, -22]);
    expect([at('musicbox').x, at('musicbox').z]).toEqual([11, -27.5]);
    expect(at('tower-block').top).toBe(5);
  });
});

describe('dominoes', () => {
  it('have a 1 : 2 face and are thick', () => {
    expect(DOMINO.h / DOMINO.w).toBeCloseTo(2, 9);
    expect(DOMINO.t / DOMINO.w).toBeGreaterThan(0.25);
  });

  it('pips are mapped onto the two big faces only; the four edges use the plain patch', () => {
    const g = dominoGeometry();
    const n = g.attributes.normal;
    const uv = g.attributes.uv;
    let big = 0;
    let edge = 0;
    const [fu0, , fu1] = DOMINO_UV.face;
    const [pu0, pv0, pu1, pv1] = DOMINO_UV.plain;
    // the pip half and the plain patch must not touch
    expect(fu1).toBeLessThanOrEqual(0.5);
    expect(pu0).toBeGreaterThan(0.55);
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (Math.abs(n.getZ(i)) > 0.9) {
        big++;
        expect(u).toBeGreaterThanOrEqual(fu0 - 1e-6);
        expect(u).toBeLessThanOrEqual(fu1 + 1e-6);
      } else {
        edge++;
        expect(u).toBeGreaterThanOrEqual(pu0 - 1e-6);
        expect(u).toBeLessThanOrEqual(pu1 + 1e-6);
        expect(v).toBeGreaterThanOrEqual(pv0 - 1e-6);
        expect(v).toBeLessThanOrEqual(pv1 + 1e-6);
      }
    }
    expect(big).toBe(8); // two faces
    expect(edge).toBe(16); // four edges
    // each big face spans the whole pip picture, top to bottom
    const vs = Array.from({ length: uv.count }, (_, i) => i).filter((i) => Math.abs(n.getZ(i)) > 0.9).map((i) => uv.getY(i));
    expect(Math.min(...vs)).toBe(0);
    expect(Math.max(...vs)).toBe(1);
  });

  it('rest on the table whichever way they are turned, and the scoreboard frame is built from whole dominoes', () => {
    expect(dominoRestY({ x: 0, z: 0, rot: 0 })).toBeCloseTo(DOMINO.h / 2, 9);
    expect(dominoRestY({ x: 0, z: 0, rot: 0, tilt: Math.PI / 2 })).toBeCloseTo(DOMINO.t / 2, 9);
    expect(dominoRestY({ x: 0, z: 0, rot: 0, roll: Math.PI / 2, s: 2 })).toBeCloseTo(DOMINO.w, 9);
    expect(SCOREBOARD.w / (DOMINO.h * SCOREBOARD.s)).toBeCloseTo(3, 9);
    expect(SCOREBOARD.h / SCOREBOARD.s).toBeCloseTo(2 * DOMINO.h + DOMINO.w, 9);
  });
});

describe('gate surroundings', () => {
  const tiles = hubPathTiles();
  const tileHalf = 0.95;
  const onTile = (x: number, z: number) =>
    tiles.some((t) => {
      // into the tile's frame (three.js rotation.y)
      const dx = x - t.x;
      const dz = z - t.z;
      const c = Math.cos(t.rot);
      const s = Math.sin(t.rot);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      return Math.abs(lx) < tileHalf && Math.abs(lz) < tileHalf;
    });

  it('every playable game has a theme, and each theme builds its own props', () => {
    for (const g of GATES) {
      expect(GATE_THEMES[g.game], g.game).toBeTypeOf('function');
      const k = new Kit();
      const extras = { dominoes: [] as DominoSpec[] };
      k.push(g.x, 0, g.z, g.rot);
      GATE_THEMES[g.game](k, new SignAtlas(), g, extras);
      k.pop();
      const c = k.counts();
      expect(c.solid + c.decal + extras.dominoes.length, g.game).toBeGreaterThan(5);
    }
  });

  it('anything taller than a step stands inside the gate’s two solid spots; flat decals keep off the path tiles', () => {
    for (const g of GATES) {
      const k = new Kit();
      const extras = { dominoes: [] as DominoSpec[] };
      k.push(g.x, 0, g.z, g.rot);
      GATE_THEMES[g.game](k, new SignAtlas(), g, extras);
      k.pop();
      const geos = k.build();
      const spots = Object.values(GATE_DECOR).map((d) => ({ ...gateLocal(g, d.lx, d.lz), r: d.r + 0.35, top: d.top + 0.6 }));
      for (const [layer, geo] of Object.entries(geos)) {
        const pos = geo!.attributes.position;
        const v = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0 }));
        for (let t = 0; t < pos.count; t += 3) {
          for (let j = 0; j < 3; j++) v[j] = { x: pos.getX(t + j), y: pos.getY(t + j), z: pos.getZ(t + j) };
          for (const { x, y, z } of v) {
            if (y > GATE.height - 2.5) continue; // the lintel stickers sit on the arch itself
            const spot = spots.find((sp) => Math.hypot(x - sp.x, z - sp.z) <= sp.r);
            if (y > STEP_HEIGHT) {
              expect(spot, `${g.game} ${layer} vertex at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`).toBeDefined();
              expect(y, g.game).toBeLessThanOrEqual(spot!.top);
            } else if (!spot) {
              expect(onTile(x, z), `${g.game} ${layer} piece at ${x.toFixed(2)}, ${z.toFixed(2)} lies on a path tile`).toBe(false);
            }
          }
          // upward-facing flat faces near the felt (0.075) would z-fight with it: keep them ≥ 0.04 above
          const ux = v[1].x - v[0].x, uy = v[1].y - v[0].y, uz = v[1].z - v[0].z;
          const wx = v[2].x - v[0].x, wy = v[2].y - v[0].y, wz = v[2].z - v[0].z;
          const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
          const up = ny / (Math.hypot(nx, ny, nz) || 1);
          if (up > 0.99 && v[0].y < STEP_HEIGHT) expect(v[0].y, `${g.game} ${layer} flat face at ${v[0].x.toFixed(2)}, ${v[0].z.toFixed(2)}`).toBeGreaterThanOrEqual(0.075 + 0.04 - 1e-6);
        }
      }
      // real dominoes (Wind-Up Dash) stand in the hero spot
      for (const d of extras.dominoes) {
        const hero = spots[0];
        expect(Math.hypot(d.x - hero.x, d.z - hero.z), g.game).toBeLessThan(hero.r);
      }
    }
  });
});
