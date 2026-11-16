/**
 * Hub layout — single source of truth for where things are and how they collide.
 * 1 unit = 1 cm. Table top is y = 0. The toy is ~3.5 tall.
 * Visual components read these numbers; `registerHubColliders()` turns them into collision.
 */
import { addStatic, resetStatic, type Collider } from '../game/collision';
import { PALETTE } from '../game/palette';

export const TABLE = { minX: -80, maxX: 80, minZ: -60, maxZ: 46, thickness: 3.5, legHeight: 72 };
export const FLOOR_Y = -(TABLE.thickness + TABLE.legHeight);

export const FOUNTAIN = { x: 0, z: -1, r: 5.2, top: 1.4 };
export const PAVILION = { x: 0, z: -21, w: 14, d: 10, h: 7.5 };
export const WORKSHOP = { x: -26, z: -9, rot: 0.32, w: 15, d: 7.5, h: 6 };
export const SHOP = { x: -30, z: 11, rot: Math.PI / 2 - 0.25, w: 11, d: 6.5, h: 8.5 };
export const SCOREBOARD = { x: 31, z: 7, rot: Math.atan2(-31, -7) };
export const TRACK = { x: 19, z: 21.5, rx: 11, rz: 6.5 };
export const MUSICBOX = { x: 11, z: -27.5 };
export const JACK = { x: -35, z: -22 };

/** Minigame gates: arches of building blocks facing the fountain. */
export const GATES = [
  { id: 'gate-copycat', x: 15, z: -24, color: PALETTE.honey, active: true },
  { id: 'gate-inferno', x: 26.5, z: -18.5, color: PALETTE.coral, active: false },
  { id: 'gate-dash', x: 34.5, z: -8, color: PALETTE.toyBlue, active: false },
].map((g) => ({ ...g, rot: Math.atan2(-g.x, -g.z) }));
export const GATE = { width: 9, pillar: 2.6, height: 8.5, depth: 3 };

/** The climbable "key tower": domino step → book → eraser → block (with the golden key). */
export const TOWER = {
  domino: { x: -20.6, z: 24, hx: 2.4, hz: 1.2, top: 0.75 },
  book: { x: -29, z: 24, hx: 6, hz: 4.5, top: 2.0 },
  eraser: { x: -27, z: 22.8, hx: 2, hz: 1.3, top: 3.5 },
  block: { x: -29.6, z: 25.2, hx: 1.5, hz: 1.5, top: 5.0 },
};

export const PENCIL = { x: -6, z: 28.5, rot: 0.18, length: 18, r: 0.75 };

export const TREES: [number, number, number][] = [
  // x, z, scale
  [-14, -18, 1.1],
  [-36, -2, 1.3],
  [-17, 6, 0.9],
  [9, -12, 0.8],
  [37, 18, 1.2],
  [-37, 3.5, 0.9],
  [6, 31, 0.8],
  [38, -20, 1],
];

export const BLOCKS: { x: number; z: number; y: number; rot: number; color: string; s?: number }[] = [
  { x: -12, z: -26, y: 0, rot: 0.2, color: PALETTE.toyBlue },
  { x: -15.2, z: -26.5, y: 0, rot: -0.1, color: PALETTE.coral },
  { x: -13.6, z: -26.3, y: 3, rot: 0.5, color: PALETTE.honey },
  { x: 37, z: 30, y: 0, rot: 0.4, color: PALETTE.sage },
  { x: 33.5, z: 31, y: 0, rot: -0.3, color: PALETTE.coral },
  { x: -38, z: 30, y: 0, rot: 0.1, color: PALETTE.honey },
  { x: 10, z: 8, y: 0, rot: 0.7, color: PALETTE.inkPurple, s: 0.8 },
  { x: -8, z: 12, y: 0, rot: 0.3, color: PALETTE.toyBlue, s: 0.8 },
];
export const BLOCK_SIZE = 3;

export function gateLocal(g: (typeof GATES)[number], lx: number, lz: number) {
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  return { x: g.x + lx * c + lz * s, z: g.z - lx * s + lz * c };
}

export function registerHubColliders() {
  resetStatic();
  const list: Collider[] = [];
  list.push({ kind: 'circle', id: 'fountain', x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.r, top: FOUNTAIN.top });
  list.push({ kind: 'box', id: 'pavilion', x: PAVILION.x, z: PAVILION.z, hx: PAVILION.w / 2 + 0.3, hz: PAVILION.d / 2 + 0.3, rot: 0, top: 14 });
  list.push({ kind: 'box', id: 'workshop', x: WORKSHOP.x, z: WORKSHOP.z, hx: WORKSHOP.w / 2, hz: WORKSHOP.d / 2, rot: WORKSHOP.rot, top: 10 });
  list.push({ kind: 'box', id: 'shop', x: SHOP.x, z: SHOP.z, hx: SHOP.w / 2, hz: SHOP.d / 2, rot: SHOP.rot, top: SHOP.h });
  // shop counter (pulled-out matchbox drawer) — low enough to hop onto
  {
    const c = Math.cos(SHOP.rot);
    const s = Math.sin(SHOP.rot);
    const lz = SHOP.d / 2 + 2.2;
    list.push({ kind: 'box', id: 'shop-counter', x: SHOP.x + lz * s, z: SHOP.z + lz * c, hx: SHOP.w / 2 - 0.5, hz: 2.2, rot: SHOP.rot, top: 1.8 });
  }
  list.push({ kind: 'box', id: 'scoreboard', x: SCOREBOARD.x, z: SCOREBOARD.z, hx: 7.5, hz: 0.9, rot: SCOREBOARD.rot, top: 12 });
  for (const g of GATES) {
    for (const side of [-1, 1]) {
      const p = gateLocal(g, side * (GATE.width / 2 - GATE.pillar / 2), 0);
      list.push({ kind: 'box', id: `${g.id}-pillar`, x: p.x, z: p.z, hx: GATE.pillar / 2, hz: GATE.depth / 2, rot: g.rot, top: GATE.height });
    }
  }
  const t = TOWER;
  for (const [id, b] of Object.entries(t)) list.push({ kind: 'box', id: `tower-${id}`, x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: 0, top: b.top });
  list.push({ kind: 'box', id: 'pencil', x: PENCIL.x, z: PENCIL.z, hx: PENCIL.length / 2, hz: PENCIL.r, rot: PENCIL.rot, top: PENCIL.r * 2 });
  for (const [x, z, s] of TREES) list.push({ kind: 'circle', id: 'tree', x, z, r: 1.4 * s, top: 9 * s });
  for (const b of BLOCKS) {
    const h = (b.s ?? 1) * BLOCK_SIZE;
    if (b.y > 0) continue; // stacked blocks are covered by the block underneath (top raised below)
    const stackTop = BLOCKS.filter((o) => o.y > 0 && Math.hypot(o.x - b.x, o.z - b.z) < BLOCK_SIZE).reduce((m, o) => Math.max(m, o.y + BLOCK_SIZE), h);
    list.push({ kind: 'box', id: 'block', x: b.x, z: b.z, hx: h / 2, hz: h / 2, rot: b.rot, top: stackTop });
  }
  list.push({ kind: 'box', id: 'musicbox', x: MUSICBOX.x, z: MUSICBOX.z, hx: 2.6, hz: 1.9, rot: 0, top: 2.6 });
  list.push({ kind: 'circle', id: 'jack', x: JACK.x, z: JACK.z, r: 2.1, top: 4.2 });
  addStatic(...list);
}

/** World point `dist` in front of an object rotated by `rot` (local +z is its front). */
export function frontOf(x: number, z: number, rot: number, dist: number) {
  return { x: x + Math.sin(rot) * dist, z: z + Math.cos(rot) * dist };
}
