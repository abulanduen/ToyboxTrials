/**
 * The hub's streets, as data: wooden tile paths (spokes from the fountain plaza, the road to the
 * domino bridge, and on the gates table the loop road past every gate) and the domino fences
 * round both play mats. Pure maths, no rendering, so the layout can be unit tested.
 */
import { overlaps, type Collider } from '../game/collision';
import { GATES_WALK, HUB_WALK, type WalkRect } from '../game/hubBounds';
import { PALETTE } from '../game/palette';
import type { DominoSpec } from './domino';
import {
  BOOKS,
  BRIDGE,
  BRIDGE_RAIL_X,
  DESK,
  FOUNTAIN,
  GATES,
  GATE_LOOP,
  GATE_ROAD,
  MUG,
  PAVILION,
  SCOREBOARD,
  SHOP,
  TV,
  WORKSHOP,
  frontOf,
  gateLocal,
  hubColliders,
  type HubGate,
} from './layout';

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
  /** What the street is for (`spoke:<building>`, `to-bridge`, `loop`, `stub:<gate id>`, …). */
  id: string;
  pts: Pt[];
  /** The street ends at a building's doorstep (its last centimetre may touch the building). */
  toBuilding?: boolean;
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

/** Where the road to the bridge bends, between the Scoreboard and the Pavilion. */
export const BRIDGE_ROAD_BEND: Pt = [19, -20];

/**
 * Every street in the hub.
 * Spawn table: the approach from spawn; the avenue to the Scoreboard; spokes to the Pavilion,
 * Workshop, shop and TV; and the road from the plaza past the Scoreboard to the bridge.
 * Gates table: from the bridge landing onto the loop road, which passes in front of every gate
 * (south lane, the two ends, north lane), the avenue straight on to Copycat, and a short stub up
 * to each arch.
 */
export function hubPathLines(): PathLine[] {
  const toFront = (x: number, z: number, rot: number, d: number): Pt => {
    const p = frontOf(x, z, rot, d);
    return [p.x, p.z];
  };
  const lines: PathLine[] = [
    { id: 'approach', pts: [[0, 30], [0, FOUNTAIN.z + RING_R]] },
    { id: 'avenue', pts: [[0, FOUNTAIN.z - RING_R], toFront(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 2.5)], toBuilding: true },
  ];
  const dests: [string, Pt][] = [
    ['pavilion', toFront(PAVILION.x, PAVILION.z, PAVILION.rot, PAVILION.d / 2 + 0.8)],
    ['workshop', toFront(WORKSHOP.x, WORKSHOP.z, WORKSHOP.rot, WORKSHOP.d / 2 + 1.5)],
    ['shop', toFront(SHOP.x, SHOP.z, SHOP.rot, SHOP.d / 2 + 6)],
    ['tv', toFront(TV.x, TV.z, TV.rot, TV.d / 2 + 2)],
  ];
  for (const [id, d] of dests) lines.push({ id: `spoke:${id}`, pts: [plazaEdge(d[0], d[1]), d], toBuilding: true });
  // to the bridge: past the Scoreboard's east end, then north to the foot of the ramp
  lines.push({ id: 'to-bridge', pts: [plazaEdge(...BRIDGE_ROAD_BEND), BRIDGE_ROAD_BEND, [BRIDGE.x, BRIDGE.deckA + BRIDGE.ramp + 0.6]] });

  // gates table
  const landing: Pt = [BRIDGE.x, GATE_LOOP.south];
  lines.push({ id: 'landing', pts: [[BRIDGE.x, BRIDGE.deckB - BRIDGE.ramp - 0.6], landing] });
  lines.push({ id: 'avenue-gates', pts: [landing, [BRIDGE.x, GATE_LOOP.north]] });
  const loop: Pt[] = [
    landing,
    roadPoint(gate('midnight-hunger')),
    roadPoint(gate('find-the-original')),
    roadPoint(gate('inferno-escape')),
    roadPoint(gate('toy-squad')),
    roadPoint(gate('jack-in-the-box')),
    roadPoint(gate('copycat-conductor')),
    roadPoint(gate('music-box-rhythm')),
    roadPoint(gate('wind-up-dash')),
    roadPoint(gate('spellbox-showdown')),
    roadPoint(gate('red-light-green-light')),
    roadPoint(gate('blink-duel')),
    roadPoint(gate('toy-tower-tumble')),
    landing,
  ];
  lines.push({ id: 'loop', pts: loop });
  for (const g of GATES) {
    const mat = gateLocal(g, 0, 1.5);
    lines.push({ id: `stub:${g.id}`, pts: [roadPoint(g), [mat.x, mat.z]] });
  }
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
  // Tiles never sit under something solid (a tree peg, a block, a gate pillar, the bridge ramp).
  const solids = hubColliders().filter((c) => c.top > 0.5 || c.id === 'bridge-ramp');
  const clear = (t: PathTile) => !solids.some((c) => overlaps(c, t.x, t.z, TILE_HALF * 0.9));
  // Drop any path tile that would land on top of one already placed (e.g. where a spoke
  // meets the ring) — coplanar overlapping tops are what caused the flickering.
  const kept: PathTile[] = [];
  for (const t of [...ringTiles, ...out]) {
    if (clear(t) && kept.every((k2) => Math.hypot(k2.x - t.x, k2.z - t.z) >= 1.55)) kept.push(t);
  }
  return withTileHeights(kept);
}

/** Things on the table margins the fences part round (fence dominoes are ~1.6 cm from their centre). */
function fenceObstacles(): Collider[] {
  const d = DESK;
  return [
    { kind: 'box', x: BOOKS.x, z: BOOKS.z, hx: BOOKS.hx, hz: BOOKS.hz, rot: 0, top: BOOKS.top },
    { kind: 'circle', x: MUG.x, z: MUG.z, r: MUG.r, top: MUG.top },
    { kind: 'circle', x: MUG.x + MUG.handleX, z: MUG.z, r: MUG.handleR, top: MUG.top },
    { kind: 'circle', x: d.lampBase.x, z: d.lampBase.z, r: d.lampBase.r, top: 3 },
    { kind: 'circle', x: d.pencilPot.x, z: d.pencilPot.z, r: d.pencilPot.r, top: 10 },
    { kind: 'circle', x: d.cactus.x, z: d.cactus.z, r: d.cactus.r, top: 10 },
    { kind: 'circle', x: d.notes.x, z: d.notes.z, r: d.notes.r, top: 1 },
    // the bridge: rails, ramps and deck
    { kind: 'box', x: BRIDGE.x, z: BRIDGE.rail.z, hx: BRIDGE_RAIL_X + 0.4, hz: BRIDGE.rail.len / 2, rot: 0, top: 4 },
  ];
}
const fenceBlocked = (x: number, z: number) => fenceObstacles().some((c) => overlaps(c, x, z, 1.6));

/** A domino fence round one play mat, 3.2 cm outside it. `fallen(x)` topples some on its south edge. */
function fenceAround(b: WalkRect, fallen: (x: number) => boolean, out: DominoSpec[], seed: number) {
  let k = seed;
  const jitter = () => ((k++ * 7919) % 11) / 11 - 0.5;
  const push = (d: DominoSpec) => {
    if (!fenceBlocked(d.x, d.z)) out.push(d);
  };
  // south edge (the precipice side on the spawn table)
  for (let x = b.minX - 2; x <= b.maxX + 2; x += 3.1) push({ x, z: b.maxZ + 3.2, rot: jitter() * 0.15, tilt: fallen(x) ? Math.PI / 2 : 0 });
  for (let z = b.minZ; z <= b.maxZ; z += 3.1) {
    push({ x: b.minX - 3.2, z, rot: Math.PI / 2 + jitter() * 0.15 });
    push({ x: b.maxX + 3.2, z, rot: Math.PI / 2 + jitter() * 0.15 });
  }
  for (let x = b.minX; x <= b.maxX; x += 3.1) push({ x, z: b.minZ - 3.2, rot: jitter() * 0.15 });
}

/** The domino fences round both play mats. A few have toppled; they part for the bridge and the big objects. */
export function hubFence(): DominoSpec[] {
  const out: DominoSpec[] = [];
  fenceAround(HUB_WALK, (x) => Math.abs(x - 12) < 4 || Math.abs(x + 30) < 2, out, 0);
  fenceAround(GATES_WALK, (x) => Math.abs(x - 80) < 2, out, 3);
  return out;
}
