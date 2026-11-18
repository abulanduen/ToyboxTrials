/**
 * The hub's streets, as data: wooden tile paths (spokes from the fountain, the Trials Ring road
 * past every gate) and the domino fence around the playmat. Pure maths, no rendering, so the
 * layout can be unit tested.
 */
import { PLAY_BOUNDS, overlaps, type Collider } from '../game/collision';
import { PALETTE } from '../game/palette';
import type { DominoSpec } from './domino';
import { BOOKS, FOUNTAIN, GATES, GATE_ROAD, MUG, PAVILION, SCOREBOARD, SHOP, WORKSHOP, frontOf, gateLocal, hubColliders, type HubGate } from './layout';

/** Height step between overlapping path tiles: big enough to survive a 16-bit depth buffer on phones. */
export const TILE_STEP = 0.05;
export const TILE_SIZE = 1.9;
const TILE_HALF = TILE_SIZE / 2;

/** True when two 1.9 cm square tiles (rotated about Y) overlap: separating-axis test on their four edge normals. */
export function tilesOverlap(a: { x: number; z: number; rot: number }, b: { x: number; z: number; rot: number }) {
  // three.js rotation.y turns +x towards -z, so work in mirrored z to keep the edge axes at angle `rot`.
  const dx = b.x - a.x, dz = a.z - b.z;
  if (Math.hypot(dx, dz) >= TILE_HALF * 2 * Math.SQRT2) return false;
  for (const r of [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2]) {
    const ax = Math.cos(r), az = Math.sin(r);
    const proj = (q: number) => TILE_HALF * (Math.abs(Math.cos(q) * ax + Math.sin(q) * az) + Math.abs(-Math.sin(q) * ax + Math.cos(q) * az));
    if (Math.abs(dx * ax + dz * az) >= proj(a.rot) + proj(b.rot) - 1e-6) return false;
  }
  return true;
}

/**
 * Give each tile a height level so that no two overlapping tiles share one (greedy graph colouring).
 * Overlapping tiles with equal tops z-fight, which shows as flicker when the camera turns, worst
 * around the fountain ring where the inner edges and the spokes overlap.
 */
export function withTileHeights<T extends { x: number; z: number; rot: number }>(tiles: T[]): (T & { y: number; level: number })[] {
  const levels: number[] = [];
  tiles.forEach((t, i) => {
    const used = new Set<number>();
    for (let j = 0; j < i; j++) if (tilesOverlap(t, tiles[j])) used.add(levels[j]);
    let l = 0;
    while (used.has(l)) l++;
    levels.push(l);
  });
  return tiles.map((t, i) => ({ ...t, level: levels[i], y: 0.12 + levels[i] * TILE_STEP }));
}

type Pt = [number, number];
export interface PathLine {
  /** What the street is for (`spoke:<gate id>`, `ring`, `stub:<gate id>`, …). */
  id: string;
  pts: Pt[];
}

const RING_R = 8;
/** Point on the fountain plaza's edge in the direction of (x, z). */
function plazaEdge(x: number, z: number): Pt {
  const a = Math.atan2(z - FOUNTAIN.z, x - FOUNTAIN.x);
  return [FOUNTAIN.x + Math.cos(a) * RING_R, FOUNTAIN.z + Math.sin(a) * RING_R];
}
const roadPoint = (g: HubGate): Pt => {
  const p = gateLocal(g, 0, GATE_ROAD);
  return [p.x, p.z];
};
const gate = (id: string) => GATES.find((g) => g.game === id)!;

/**
 * Every street in the hub.
 *  - the approach from spawn and the avenue to the Pavilion;
 *  - spokes from the plaza to the Workshop, Shop, Scoreboard and to the gates that have a clear
 *    line of sight from the fountain;
 *  - the Trials Ring: a road around the west, north and east of the village passing in front of
 *    every gate, with a short stub up to each arch.
 */
export function hubPathLines(): PathLine[] {
  const lines: PathLine[] = [
    { id: 'approach', pts: [[0, 30], [0, FOUNTAIN.z + RING_R]] },
    { id: 'avenue', pts: [[0, FOUNTAIN.z - RING_R], [0, PAVILION.z + PAVILION.d / 2 + 0.5]] },
  ];
  const toFront = (x: number, z: number, rot: number, d: number): Pt => {
    const p = frontOf(x, z, rot, d);
    return [p.x, p.z];
  };
  const dests: [string, Pt][] = [
    ['workshop', toFront(WORKSHOP.x, WORKSHOP.z, WORKSHOP.rot, WORKSHOP.d / 2 + 1.5)],
    ['shop', toFront(SHOP.x, SHOP.z, SHOP.rot, SHOP.d / 2 + 6)],
    ['scoreboard', toFront(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 2.5)],
  ];
  for (const [id, d] of dests) lines.push({ id: `spoke:${id}`, pts: [plazaEdge(d[0], d[1]), d] });
  for (const g of GATES) {
    const road = roadPoint(g);
    if (g.spoke) lines.push({ id: `spoke:${g.id}`, pts: [plazaEdge(road[0], road[1]), road] });
    const mat = gateLocal(g, 0, 1.5);
    lines.push({ id: `stub:${g.id}`, pts: [road, [mat.x, mat.z]] });
  }
  // The ring road, south-west round to south-east. The Jack gate sits in the north-west corner at
  // the end of its own street; the road cuts the corner past the suspicious box instead.
  const jr = roadPoint(gate('jack-in-the-box'));
  const jd = Math.hypot(FOUNTAIN.x - jr[0], FOUNTAIN.z - jr[1]);
  const jackCorner: Pt = [jr[0] + ((FOUNTAIN.x - jr[0]) / jd) * GATE_ROAD, jr[1] + ((FOUNTAIN.z - jr[1]) / jd) * GATE_ROAD];
  const ring: Pt[] = [
    roadPoint(gate('spellbox-showdown')),
    roadPoint(gate('find-the-original')),
    roadPoint(gate('inferno-escape')),
    [-35, -15.5],
    jackCorner,
    roadPoint(gate('toy-squad')),
    roadPoint(gate('midnight-hunger')),
    roadPoint(gate('copycat-conductor')),
    roadPoint(gate('music-box-rhythm')),
    roadPoint(gate('wind-up-dash')),
    roadPoint(gate('blink-duel')),
    roadPoint(gate('red-light-green-light')),
  ];
  lines.push({ id: 'ring', pts: ring });
  return lines;
}

export interface PathTile {
  x: number;
  z: number;
  rot: number;
  c: string;
}

/** Tiles for every street: two staggered rows along each line, plus the ring round the fountain. */
export function hubPathTiles(): (PathTile & { y: number; level: number })[] {
  const out: PathTile[] = [];
  const colors = [PALETTE.woodLight, '#E2BE8E', PALETTE.cardboard];
  let k = 0;
  for (const line of hubPathLines()) {
    for (let s = 0; s < line.pts.length - 1; s++) {
      const [ax, az] = line.pts[s];
      const [bx, bz] = line.pts[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2.1));
      const rot = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const off = i % 2 ? 0.55 : -0.55;
        out.push({ x: ax + (bx - ax) * t + Math.cos(rot) * off, z: az + (bz - az) * t - Math.sin(rot) * off, rot: rot + ((k * 37) % 7) * 0.03 - 0.09, c: colors[k++ % 3] });
      }
    }
  }
  // Ring of tiles around the fountain. 22 tiles on a 7 cm radius ≈ 2.0 cm apart, so the
  // 1.9 cm tiles sit edge to edge instead of overlapping (overlaps z-fight and flicker).
  const ringN = 22;
  const ringTiles: PathTile[] = [];
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    ringTiles.push({ x: FOUNTAIN.x + Math.cos(a) * 7, z: FOUNTAIN.z + Math.sin(a) * 7, rot: -a, c: colors[i % 3] });
  }
  // Tiles never sit under something solid (a tree peg, a block, a gate pillar).
  const solids = hubColliders().filter((c) => c.top > 0.5);
  const clear = (t: PathTile) => !solids.some((c) => overlaps(c, t.x, t.z, TILE_HALF * 0.9));
  // Drop any path tile that would land on top of one already placed (e.g. where a spoke
  // meets the ring) — coplanar overlapping tops are what caused the flickering.
  const kept: PathTile[] = [];
  for (const t of [...ringTiles, ...out]) {
    if (clear(t) && kept.every((k2) => Math.hypot(k2.x - t.x, k2.z - t.z) >= 1.55)) kept.push(t);
  }
  return withTileHeights(kept);
}

/** Does a fence domino at (x, z) collide with one of the big household objects on the table edge? */
function fenceBlocked(x: number, z: number) {
  const big: Collider[] = [
    { kind: 'box', x: BOOKS.x, z: BOOKS.z, hx: BOOKS.hx, hz: BOOKS.hz, rot: 0, top: BOOKS.top },
    { kind: 'circle', x: MUG.x, z: MUG.z, r: MUG.r, top: MUG.top },
    { kind: 'circle', x: MUG.x + MUG.handleX, z: MUG.z, r: MUG.handleR, top: MUG.top },
  ];
  return big.some((c) => overlaps(c, x, z, 1.6));
}

/** The domino fence round the playmat. A few have toppled; it parts for the books and the mug. */
export function hubFence(): DominoSpec[] {
  const b = PLAY_BOUNDS;
  const out: DominoSpec[] = [];
  let k = 0;
  const jitter = () => ((k++ * 7919) % 11) / 11 - 0.5;
  const push = (d: DominoSpec) => {
    if (!fenceBlocked(d.x, d.z)) out.push(d);
  };
  // front edge (the precipice side) — a few have toppled
  for (let x = b.minX - 2; x <= b.maxX + 2; x += 3.1) {
    const fallen = Math.abs(x - 12) < 4 || Math.abs(x + 30) < 2;
    push({ x, z: b.maxZ + 3.2, rot: jitter() * 0.15, tilt: fallen ? Math.PI / 2 : 0 });
  }
  for (let z = b.minZ; z <= b.maxZ; z += 3.1) {
    push({ x: b.minX - 3.2, z, rot: Math.PI / 2 + jitter() * 0.15 });
    push({ x: b.maxX + 3.2, z, rot: Math.PI / 2 + jitter() * 0.15 });
  }
  for (let x = b.minX; x <= b.maxX; x += 3.1) push({ x, z: b.minZ - 3.2, rot: jitter() * 0.15 });
  return out;
}
