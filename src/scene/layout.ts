/**
 * Hub layout — single source of truth for where things are and how they collide.
 * 1 unit = 1 cm. Table top is y = 0. The toy is ~3.5 tall.
 * Visual components read these numbers; `registerHubColliders()` turns them into collision.
 */
import { addStatic, resetStatic, type Collider } from '../game/collision';
import { PALETTE } from '../game/palette';
import { MINIGAMES } from '../minigames/registry';
import type { MinigameId } from '../minigames/types';
import { DOMINO } from './domino';

export const TABLE = { minX: -80, maxX: 80, minZ: -60, maxZ: 46, thickness: 3.5, legHeight: 72 };
export const FLOOR_Y = -(TABLE.thickness + TABLE.legHeight);

export const FOUNTAIN = { x: 0, z: -1, r: 5.2, top: 1.4 };
export const PAVILION = { x: 0, z: -21, w: 14, d: 10, h: 7.5 };
export const WORKSHOP = { x: -26, z: -9, rot: 0.32, w: 15, d: 7.5, h: 6 };
export const SHOP = { x: -30, z: 11, rot: Math.PI / 2 - 0.25, w: 11, d: 6.5, h: 8.5 };
/**
 * Scoreboard: a card in a frame of dominoes. The dominoes keep their real 1 : 2 face and are
 * scaled uniformly (`s`); the frame is three dominoes wide and two-and-a-bit tall.
 */
export const SCOREBOARD_DOMINO = 1.15;
export const SCOREBOARD = {
  x: 31,
  z: 7,
  rot: Math.atan2(-31, -7),
  s: SCOREBOARD_DOMINO,
  w: 3 * DOMINO.h * SCOREBOARD_DOMINO,
  h: (2 * DOMINO.h + DOMINO.w) * SCOREBOARD_DOMINO,
};
export const TRACK = { x: 19, z: 21.5, rx: 11, rz: 6.5 };
export const MUSICBOX = { x: 11, z: -27.5 };
export const JACK = { x: -35, z: -22 };
/** Wooden fingerpost near spawn pointing at every destination. */
export const FINGERPOST = { x: -5.5, z: 14, h: 16.4 };

/**
 * Minigame gates: one building-block arch per playable trial, standing on the Trials Ring around
 * the village and facing the fountain. The ring road passes a few centimetres in front of each;
 * interacting at a gate opens that trial's lobby (the shared practice intro card).
 * Positions are data: add a playable game to the registry and give it a spot here.
 */
const GATE_SPOTS: Record<MinigameId, { x: number; z: number; spoke: boolean }> = {
  // north arc, west → east
  'jack-in-the-box': { x: -38, z: -30, spoke: true },
  'toy-squad': { x: -23, z: -36, spoke: true },
  'midnight-hunger': { x: 0, z: -38.5, spoke: false }, // tucked in the Pavilion's shadow
  'copycat-conductor': { x: 21.5, z: -36.5, spoke: true },
  'music-box-rhythm': { x: 35, z: -25.5, spoke: true },
  // east side
  'wind-up-dash': { x: 41.5, z: -9, spoke: true },
  'blink-duel': { x: 42, z: 8.5, spoke: false }, // behind the Scoreboard
  'red-light-green-light': { x: 39, z: 25, spoke: false }, // beside the toy railway
  // west side
  'inferno-escape': { x: -43.5, z: -13, spoke: false }, // behind the Workshop
  'find-the-original': { x: -43.5, z: 5, spoke: true },
  'spellbox-showdown': { x: -41, z: 26, spoke: false },
};

export interface HubGate {
  /** Interactable id, `gate-<game id>`. */
  id: string;
  game: MinigameId;
  title: string;
  /** Short line under the title on the gate's name board. */
  sub: string;
  x: number;
  z: number;
  /** Faces the fountain; local +z is the gate's front. */
  rot: number;
  color: string;
  /** Has its own street straight from the fountain plaza (the others are reached along the ring road). */
  spoke: boolean;
}

export const GATES: HubGate[] = MINIGAMES.filter((g) => g.status === 'playable' && GATE_SPOTS[g.id]).map((g) => {
  const p = GATE_SPOTS[g.id];
  return {
    id: `gate-${g.id}`,
    game: g.id,
    title: g.title,
    sub: `${g.category[0].toUpperCase()}${g.category.slice(1)} trial`,
    x: p.x,
    z: p.z,
    rot: Math.atan2(FOUNTAIN.x - p.x, FOUNTAIN.z - p.z),
    color: g.accent,
    spoke: p.spoke,
  };
});
export const gateFor = (game: MinigameId) => GATES.find((g) => g.game === game);
export const GATE = { width: 9, pillar: 2.6, height: 8.5, depth: 3 };
/** Where the player stands to use a gate, and where the ring road passes (cm in front of the arch). */
export const GATE_STAND = 2.2;
export const GATE_ROAD = 5.5;
/**
 * Themed props beside every gate (see `gateDecor.ts`), in gate-local centimetres: a tall "hero"
 * piece on the gate's left and a low cluster on its right. Both are solid.
 */
export const GATE_DECOR = {
  hero: { lx: -7.2, lz: -0.5, r: 2.0, top: 7 },
  side: { lx: 6.8, lz: -0.3, r: 1.8, top: 3.2 },
};

/** Big household objects on the table that reach into the play area. */
export const BOOKS = { x: 56, z: -36, hx: 15.6, hz: 11.6, top: 15.6 };
export const MUG = { x: 57, z: 14, r: 4.7, top: 11, handleX: -6.2, handleR: 2.2 };

/** The climbable "key tower": domino step → book → eraser → block (with the golden key). */
export const TOWER = {
  domino: { x: -20.6, z: 24, hx: DOMINO.h / 2, hz: DOMINO.w / 2, top: DOMINO.t },
  book: { x: -29, z: 24, hx: 6, hz: 4.5, top: 2.0 },
  eraser: { x: -27, z: 22.8, hx: 2, hz: 1.3, top: 3.5 },
  block: { x: -29.6, z: 25.2, hx: 1.5, hz: 1.5, top: 5.0 },
};

export const PENCIL = { x: -6, z: 28.5, rot: 0.18, length: 18, r: 0.75 };

export const TREES: [number, number, number][] = [
  // x, z, scale — kept off the streets, the ring road and the gates' props
  [-17, -20.5, 1.1],
  [-30.5, -1.4, 0.9],
  [-17, 6, 0.9],
  [13.5, -15.5, 0.8],
  [22, 12, 1.1],
  [-23, 30.6, 0.9],
  [27, 31.5, 0.8], // kept clear of the menu / Workshop camera paths near spawn
  [29.5, -3.5, 0.9],
  [-10, -28.6, 0.8],
  [5.5, -29, 0.7],
];

export const BLOCKS: { x: number; z: number; y: number; rot: number; color: string; s?: number }[] = [
  { x: 20, z: -9.2, y: 0, rot: 0.2, color: PALETTE.toyBlue },
  { x: 23.2, z: -9.7, y: 0, rot: -0.1, color: PALETTE.coral },
  { x: 21.6, z: -9.5, y: 3, rot: 0.5, color: PALETTE.honey },
  { x: 31, z: 31, y: 0, rot: 0.4, color: PALETTE.sage },
  { x: -18.4, z: 30.8, y: 0, rot: 0.1, color: PALETTE.honey },
  { x: 8.5, z: 10.5, y: 0, rot: 0.7, color: PALETTE.inkPurple, s: 0.8 },
  { x: -8, z: 12, y: 0, rot: 0.3, color: PALETTE.toyBlue, s: 0.8 },
];
export const BLOCK_SIZE = 3;

/** Gate-local point (lx to the gate's right, lz out of its front) in world xz. */
export function gateLocal(g: { x: number; z: number; rot: number }, lx: number, lz: number) {
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  return { x: g.x + lx * c + lz * s, z: g.z - lx * s + lz * c };
}

/** Every static hub collider, as data (also used by the layout unit tests). */
export function hubColliders(): Collider[] {
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
  list.push({ kind: 'box', id: 'scoreboard', x: SCOREBOARD.x, z: SCOREBOARD.z, hx: SCOREBOARD.w / 2, hz: 0.9, rot: SCOREBOARD.rot, top: SCOREBOARD.h });
  for (const g of GATES) {
    for (const side of [-1, 1]) {
      const p = gateLocal(g, side * (GATE.width / 2 - GATE.pillar / 2), 0);
      list.push({ kind: 'box', id: `${g.id}-pillar`, x: p.x, z: p.z, hx: GATE.pillar / 2, hz: GATE.depth / 2, rot: g.rot, top: GATE.height });
    }
    for (const [k, d] of Object.entries(GATE_DECOR)) {
      const p = gateLocal(g, d.lx, d.lz);
      list.push({ kind: 'circle', id: `${g.id}-${k}`, x: p.x, z: p.z, r: d.r, top: d.top });
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
  list.push({ kind: 'circle', id: 'fingerpost', x: FINGERPOST.x, z: FINGERPOST.z, r: 1.15, top: FINGERPOST.h });
  // the book cliffs and the mug stand on the edge of the bigger playmat
  list.push({ kind: 'box', id: 'books', x: BOOKS.x, z: BOOKS.z, hx: BOOKS.hx, hz: BOOKS.hz, rot: 0, top: BOOKS.top });
  list.push({ kind: 'circle', id: 'mug', x: MUG.x, z: MUG.z, r: MUG.r, top: MUG.top });
  list.push({ kind: 'circle', id: 'mug-handle', x: MUG.x + MUG.handleX, z: MUG.z, r: MUG.handleR, top: MUG.top });
  return list;
}

export function registerHubColliders() {
  resetStatic();
  addStatic(...hubColliders());
}

/** World point `dist` in front of an object rotated by `rot` (local +z is its front). */
export function frontOf(x: number, z: number, rot: number, dist: number) {
  return { x: x + Math.sin(rot) * dist, z: z + Math.cos(rot) * dist };
}
