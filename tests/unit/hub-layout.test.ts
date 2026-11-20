import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PLAY_BOUNDS, STEP_HEIGHT, clampToBounds, groundHeightAt, overlaps, resolve, resetStatic, addStatic, type Collider } from '../../src/game/collision';
import { BRIDGE_WALK, GATES_WALK, HUB_WALK, WALK_AREAS, isWalkable } from '../../src/game/hubBounds';
import { HUB_SPAWN } from '../../src/game/hubMotion';
import { INTERACTABLES } from '../../src/game/interactables';
import { MINIGAMES } from '../../src/minigames/registry';
import { DOMINO, DOMINO_UV, dominoGeometry, dominoRestY } from '../../src/scene/domino';
import {
  BRIDGE,
  BRIDGE_RAIL_X,
  FOUNTAIN,
  GATE,
  GATES,
  GATE_DECOR,
  GATE_ROAD,
  GATE_STAND,
  JACK,
  MUSICBOX,
  PAVILION,
  SCOREBOARD,
  SIGNPOSTS,
  TABLE,
  TABLES,
  TABLE_B,
  TOWER,
  gateLocal,
  hubColliders,
} from '../../src/scene/layout';
import { hubFence, hubPathLines, hubPathTiles, tilesOverlap, TILE_STEP } from '../../src/scene/paths';
import { GATE_THEMES, POST_BOARD, signpostTop, signposts } from '../../src/scene/gateDecor';
import { bridgeDominoes } from '../../src/scene/Bridge';
import { sunRig } from '../../src/scene/room/bake';
import { Kit } from '../../src/scene/kit';
import { MAX_BOARDS, SignAtlas } from '../../src/scene/signAtlas';
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
    expect(playable.length).toBe(15);
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

  it('gates all stand on the gates table, face the loop road and keep their distance from each other', () => {
    const loop = hubPathLines().find((l) => l.id === 'loop')!;
    for (const g of GATES) {
      expect(isWalkable(g.x, g.z, PLAYER_R, [GATES_WALK]), g.id).toBe(true);
      // the road point in front of the arch (local +z) is a corner of the loop road
      const road = gateLocal(g, 0, GATE_ROAD);
      expect(loop.pts.some(([x, z]) => Math.hypot(x - road.x, z - road.z) < 1e-6), g.id).toBe(true);
      for (const o of GATES) if (o !== g) expect(Math.hypot(o.x - g.x, o.z - g.z), `${g.id} / ${o.id}`).toBeGreaterThan(22);
    }
    // nothing of the trials is left on the spawn table
    for (const g of GATES) expect(isWalkable(g.x, g.z, 0, [HUB_WALK]), g.id).toBe(false);
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

  it('every gate is on a street: a stub to its arch from the loop road, which the bridge landing joins', () => {
    for (const g of GATES) expect(lines.some((l) => l.id === `stub:${g.id}`), g.id).toBe(true);
    const loop = lines.find((l) => l.id === 'loop')!;
    const landing = lines.find((l) => l.id === 'landing')!;
    const end = landing.pts[landing.pts.length - 1];
    expect(loop.pts[0]).toEqual(end);
    expect(loop.pts[loop.pts.length - 1]).toEqual(end);
    // the road to the bridge ends at the foot of the ramp, on the bridge's centre line
    const toBridge = lines.find((l) => l.id === 'to-bridge')!;
    const foot = toBridge.pts[toBridge.pts.length - 1];
    expect(foot[0]).toBeCloseTo(BRIDGE.x, 6);
    expect(foot[1]).toBeGreaterThan(BRIDGE.deckA + BRIDGE.ramp);
    expect(landing.pts[0][1]).toBeLessThan(BRIDGE.deckB - BRIDGE.ramp);
  });

  it('walking lanes are clear: nothing solid stands on a street', () => {
    for (const l of lines) {
      for (let s = 0; s < l.pts.length - 1; s++) {
        const [ax, az] = l.pts[s];
        const [bx, bz] = l.pts[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        // streets to a building stop at its doorstep; the last centimetre may touch the building
        const stop = l.toBuilding && s === l.pts.length - 2 ? len - 1.5 : len;
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
  it('each play mat and its fence fit on its own table', () => {
    for (const [b, t] of [[HUB_WALK, TABLE], [GATES_WALK, TABLE_B]] as const) {
      expect(b.minX - 6).toBeGreaterThan(t.minX);
      expect(b.maxX + 6).toBeLessThan(t.maxX);
      expect(b.minZ - 6).toBeGreaterThan(t.minZ);
      expect(b.maxZ + 6).toBeLessThan(t.maxZ);
    }
    expect(PLAY_BOUNDS).toBe(HUB_WALK);
    const fence = hubFence();
    expect(fence.length).toBeGreaterThan(150);
    for (const d of fence) {
      const t = TABLES.find((tb) => d.x > tb.minX + 2 && d.x < tb.maxX - 2 && d.z > tb.minZ + 2 && d.z < tb.maxZ - 2);
      expect(t, `fence domino at ${d.x.toFixed(1)}, ${d.z.toFixed(1)}`).toBeDefined();
      // the fence parts for the book cliffs, the mug and the bridge
      expect(hitsAt(d.x, d.z, 1.2, colliders.filter((c) => c.id === 'books' || c.id?.startsWith('mug') || c.id?.startsWith('bridge')))).toEqual([]);
      // and never stands on walkable ground
      expect(isWalkable(d.x, d.z, 0)).toBe(false);
    }
  });

  it('the two tables are apart: the gap between them is not walkable except on the bridge', () => {
    expect(TABLE_B.maxZ).toBeLessThan(TABLE.minZ - 20);
    const gapZ = (TABLE.minZ + TABLE_B.maxZ) / 2;
    expect(isWalkable(BRIDGE.x, gapZ, PLAYER_R)).toBe(true);
    for (const x of [BRIDGE.x - 6, BRIDGE.x + 6, 0, 60, -40]) expect(isWalkable(x, gapZ, 0), `x=${x}`).toBe(false);
    // walking off the side of the bridge puts you back on it
    const p = { x: BRIDGE.x + 20, z: gapZ };
    clampToBounds(p, PLAYER_R);
    expect(p.z).toBeCloseTo(gapZ, 6);
    expect(p.x).toBeCloseTo(BRIDGE_WALK.maxX - PLAYER_R, 6);
    // the walkway stops at the inner faces of the rails
    expect(BRIDGE_WALK.maxX - BRIDGE.x).toBeLessThanOrEqual(BRIDGE_RAIL_X - BRIDGE.rail.t / 2 + 1e-9);
    // far away points come back to the nearest mat
    const q = { x: 500, z: -130 };
    clampToBounds(q, PLAYER_R);
    expect(isWalkable(q.x, q.z, PLAYER_R, [GATES_WALK])).toBe(true);
  });

  it('spawn, the fountain and the secrets stay where they were; the Scoreboard is the centrepiece seen from spawn', () => {
    expect([HUB_SPAWN.x, HUB_SPAWN.z]).toEqual([0, 22]);
    expect(isWalkable(0, 22, PLAYER_R)).toBe(true);
    expect(hitsAt(0, 22, PLAYER_R)).toEqual([]);
    const at = (id: string) => colliders.find((c) => c.id === id)!;
    expect([at('fountain').x, at('fountain').z]).toEqual([0, -1]);
    expect([at('jack').x, at('jack').z]).toEqual([-35, -22]);
    expect([at('musicbox').x, at('musicbox').z]).toEqual([11, -27.5]);
    expect([JACK.x, JACK.z, MUSICBOX.x, MUSICBOX.z]).toEqual([-35, -22, 11, -27.5]);
    expect(at('tower-block').top).toBe(5);
    expect([TOWER.block.x, TOWER.block.z]).toEqual([-29.6, 25.2]);
    const marble = INTERACTABLES.find((i) => i.id === 'marble')!;
    expect([marble.x, marble.z]).toEqual([-9, -6]);
    // the Scoreboard stands behind the fountain on the line of sight from spawn, facing spawn
    expect(SCOREBOARD.x).toBe(0);
    expect(SCOREBOARD.z).toBeLessThan(FOUNTAIN.z - FOUNTAIN.r - 6);
    expect(SCOREBOARD.rot).toBe(0);
    // the Pavilion faces the fountain
    const door = gateLocal(PAVILION, 0, 1);
    expect(Math.hypot(FOUNTAIN.x - door.x, FOUNTAIN.z - door.z)).toBeCloseTo(Math.hypot(FOUNTAIN.x - PAVILION.x, FOUNTAIN.z - PAVILION.z) - 1, 6);
  });

  it('every interactable stands on walkable ground with its spot clear of anything solid', () => {
    for (const it of INTERACTABLES) {
      expect(isWalkable(it.x, it.z, PLAYER_R), it.id).toBe(true);
      if (it.id === 'key' || it.id === 'marble') continue; // on top of the tower / the marble itself
      expect(hitsAt(it.x, it.z, PLAYER_R), it.id).toEqual([]);
    }
  });
});

describe('the domino bridge', () => {
  /** Walk in a straight line with the real collision code, as the player controller does. */
  function walk(from: [number, number], to: [number, number], speed = 14, dt = 1 / 60) {
    resetStatic();
    addStatic(...colliders);
    const pos = { x: from[0], z: from[1] };
    let y = groundHeightAt(pos.x, pos.z, PLAYER_R, 0);
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const dir = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
    let maxRise = 0;
    let stuck = 0;
    for (let i = 0; i < 20000; i++) {
      const before = { ...pos };
      pos.x += dir[0] * speed * dt;
      pos.z += dir[1] * speed * dt;
      resolve(pos, PLAYER_R, y);
      const g = groundHeightAt(pos.x, pos.z, PLAYER_R, y);
      maxRise = Math.max(maxRise, g - y);
      y = g; // walking: snap to the ground (no jumps)
      if (Math.hypot(pos.x - before.x, pos.z - before.z) < 1e-4) stuck++;
      if (Math.hypot(to[0] - pos.x, to[1] - pos.z) < speed * dt) break;
      if (stuck > 30) break;
    }
    resetStatic();
    return { pos, y, maxRise, stuck };
  }

  it('is walkable end to end in both directions without jumping, stepping up at most a step at a time', () => {
    const a: [number, number] = [BRIDGE.x, -36];
    const b: [number, number] = [BRIDGE.x, -112];
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const r = walk(from, to);
      expect(r.stuck, `${from} → ${to}`).toBe(0);
      expect(Math.hypot(r.pos.x - to[0], r.pos.z - to[1])).toBeLessThan(0.5);
      expect(r.maxRise).toBeLessThanOrEqual(STEP_HEIGHT);
    }
  });

  it('is walked at deck height over the gap, and you cannot leave it sideways', () => {
    resetStatic();
    addStatic(...colliders);
    const mid = (TABLE.minZ + TABLE_B.maxZ) / 2;
    expect(groundHeightAt(BRIDGE.x, mid, PLAYER_R, BRIDGE.top)).toBeCloseTo(BRIDGE.top, 6);
    for (const side of [-1, 1]) {
      const p = { x: BRIDGE.x + side * 1, z: mid };
      for (let i = 0; i < 120; i++) {
        p.x += side * 0.3;
        resolve(p, PLAYER_R, BRIDGE.top);
      }
      expect(Math.abs(p.x - BRIDGE.x)).toBeLessThanOrEqual(BRIDGE_WALK.maxX - BRIDGE.x - PLAYER_R + 1e-6);
      // the rails are too tall to jump onto from the deck... and there is nothing to land on beyond
      expect(isWalkable(BRIDGE.x + side * (BRIDGE_RAIL_X + 1), mid, 0)).toBe(false);
    }
    resetStatic();
    // the rails stand higher than a jump from the table, so you cannot hop onto them from the side
    const jump = 16.5 ** 2 / (2 * 56);
    expect(BRIDGE.rail.h - STEP_HEIGHT).toBeGreaterThan(jump);
  });

  it('is made of whole dominoes scaled evenly, lying flat across the deck, with ramps that meet the deck', () => {
    const items = bridgeDominoes();
    expect(items.length).toBe(BRIDGE.planks + 4);
    for (const d of items) expect(d.s).toBe(BRIDGE.s);
    const deck = items.slice(0, BRIDGE.planks);
    for (const d of deck) {
      expect(d.tilt).toBeCloseTo(Math.PI / 2, 9);
      expect(Math.abs(Math.cos(d.rot))).toBeLessThan(1e-9); // long side across the walkway
      expect(d.y! + (DOMINO.t * BRIDGE.s) / 2).toBeCloseTo(BRIDGE.top, 6);
    }
    // the deck spans the gap and rests on both tables
    expect(BRIDGE.deckA).toBeGreaterThan(TABLE.minZ);
    expect(BRIDGE.deckB).toBeLessThan(TABLE_B.maxZ);
    // each ramp's top face rises from the table to the deck top over its run
    for (const d of items.slice(BRIDGE.planks)) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(d.x, d.y, d.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-(d.tilt ?? 0), d.rot, d.roll ?? 0, 'YXZ')),
        new THREE.Vector3(d.s, d.s, d.s),
      );
      const ends = [-1, 1].map((k) => new THREE.Vector3(0, (k * DOMINO.h) / 2, DOMINO.t / 2).applyMatrix4(m));
      const ys = ends.map((e) => e.y).sort((p, q) => p - q);
      expect(ys[0]).toBeCloseTo(0, 6);
      expect(ys[1]).toBeCloseTo(BRIDGE.top, 6);
      for (const e of ends) expect(Math.abs(e.x - BRIDGE.x)).toBeLessThan(BRIDGE.halfW);
    }
  });

  it('has a signpost at each end, inside the walkable area, clear of the paths', () => {
    const posts = signposts();
    expect(posts.map((p) => p.id).sort()).toEqual(['bridge-hub', 'gates', 'spawn']);
    expect(isWalkable(SIGNPOSTS['bridge-hub'].x, SIGNPOSTS['bridge-hub'].z, 1.15, [HUB_WALK])).toBe(true);
    expect(isWalkable(SIGNPOSTS.gates.x, SIGNPOSTS.gates.z, 1.15, [GATES_WALK])).toBe(true);
    for (const p of posts) {
      expect(signpostTop(p.boards.length)).toBeCloseTo(SIGNPOSTS[p.id].h, 6);
      expect(p.boards.every((b, i) => b.y === POST_BOARD.y0 + i * POST_BOARD.step)).toBe(true);
    }
    // the spawn post's lowest board (the one in view) points the way to the trials
    expect(posts.find((p) => p.id === 'spawn')!.boards[0].label).toBe('Trials table');
    // every board face fits in the sign atlas
    const atlas = new SignAtlas();
    for (const p of posts) for (const b of p.boards) for (const arrow of ['left', 'right'] as const) atlas.board({ title: b.label, sub: b.sub, accent: b.accent, arrow });
    for (const g of GATES) atlas.board({ title: g.title, sub: g.sub, accent: g.color, arrow: null });
    expect(atlas.boards.length).toBeLessThanOrEqual(MAX_BOARDS);
  });
});

describe('lighting', () => {
  it("the sun's fixed shadow frustum covers both tables (and 50 cm above them)", () => {
    const rig = sunRig();
    const p = new THREE.Vector3();
    for (const tb of TABLES)
      for (const x of [tb.minX, tb.maxX])
        for (const z of [tb.minZ, tb.maxZ])
          for (const y of [0, 50]) {
            p.set(x, y, z).applyMatrix4(rig.view);
            expect(p.x).toBeGreaterThanOrEqual(rig.l);
            expect(p.x).toBeLessThanOrEqual(rig.r);
            expect(p.y).toBeGreaterThanOrEqual(rig.b);
            expect(p.y).toBeLessThanOrEqual(rig.t);
            expect(-p.z).toBeGreaterThan(rig.near);
            expect(-p.z).toBeLessThan(rig.far);
          }
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
