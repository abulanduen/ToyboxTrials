/**
 * Hub layout — single source of truth for where things are and how they collide.
 * 1 unit = 1 cm. Table top is y = 0. The toy is ~3.5 tall.
 * Visual components read these numbers; `registerHubColliders()` turns them into collision.
 *
 * The hub spans two tables of the same height: the spawn table (fountain plaza, Scoreboard and
 * its TV, Pavilion, Workshop, shop, the secrets) and, across a 26 cm gap, the gates table (a desk
 * under the window) with every trial gate. A domino bridge joins them. Where you can walk is the
 * union of rectangles in src/game/hubBounds.ts, shared with the online server.
 */
import { addStatic, resetStatic, type Collider } from '../game/collision';
import { BRIDGE_WALK, BRIDGE_X, GATES_WALK, HUB_WALK, WALK_AREAS } from '../game/hubBounds';
import { PALETTE } from '../game/palette';
import { MINIGAMES } from '../minigames/registry';
import type { MinigameId } from '../minigames/types';
import { DOMINO } from './domino';

export { BRIDGE_WALK, GATES_WALK, HUB_WALK, WALK_AREAS };

/** The spawn table. */
export const TABLE = { minX: -80, maxX: 80, minZ: -60, maxZ: 46, thickness: 3.5, legHeight: 72 };
export const FLOOR_Y = -(TABLE.thickness + TABLE.legHeight);
/**
 * The gates table: a desk under the window, the same height as the spawn table. A 26 cm gap
 * separates the two; the domino bridge spans it.
 */
export const TABLE_B = { minX: -76, maxX: 130, minZ: -172, maxZ: -86, thickness: TABLE.thickness, legHeight: TABLE.legHeight };
export const TABLES = [TABLE, TABLE_B] as const;
/** Bounding box of both table tops (shadow frustum, room lighting). */
export const TABLES_BOX = {
  minX: Math.min(TABLE.minX, TABLE_B.minX),
  maxX: Math.max(TABLE.maxX, TABLE_B.maxX),
  minZ: Math.min(TABLE.minZ, TABLE_B.minZ),
  maxZ: Math.max(TABLE.maxZ, TABLE_B.maxZ),
};

// ------------------------------------------------------------------ spawn table

export const FOUNTAIN = { x: 0, z: -1, r: 5.2, top: 1.4 };
/** Tournament Pavilion: the east side of the plaza, its door facing the fountain. */
export const PAVILION = { x: 34, z: -10, rot: Math.atan2(0 - 34, -1 - -10), w: 14, d: 10, h: 7.5 };
export const WORKSHOP = { x: -36, z: -6, rot: 0.45, w: 15, d: 7.5, h: 6 };
export const SHOP = { x: -44, z: 12, rot: Math.PI / 2 - 0.25, w: 11, d: 6.5, h: 8.5 };
/**
 * Scoreboard (the leaderboard): the centrepiece behind the fountain, facing spawn. A card in a
 * frame of dominoes that keep their real 1 : 2 face, scaled uniformly (`s`); the frame is three
 * dominoes wide and two-and-a-bit tall.
 */
export const SCOREBOARD_DOMINO = 1.3;
export const SCOREBOARD = {
  x: 0,
  z: -19,
  rot: 0,
  s: SCOREBOARD_DOMINO,
  w: 3 * DOMINO.h * SCOREBOARD_DOMINO,
  h: (2 * DOMINO.h + DOMINO.w) * SCOREBOARD_DOMINO,
};
/** The little retro TV beside the Scoreboard (who is online, friends playing, the shop, records). */
export const TV = { x: -15.5, z: -16.5, rot: 0.3, w: 9, d: 6, h: 8.4 };
export const TRACK = { x: 19, z: 21.5, rx: 11, rz: 6.5 };
export const MUSICBOX = { x: 11, z: -27.5 };
export const JACK = { x: -35, z: -22 };

/**
 * Signposts: wooden fingerposts with an arrow board per destination (labels and colours in
 * gateDecor.ts `signposts()`): one by spawn, one at each end of the domino bridge.
 */
export const FINGERPOST = { x: -5.5, z: 14, h: 9.8 };
export const SIGNPOSTS = {
  spawn: FINGERPOST,
  'bridge-hub': { x: 31.5, z: -40.5, h: 5.3 },
  gates: { x: 15.5, z: -114, h: 8.3 },
} as const;
export type SignpostId = keyof typeof SIGNPOSTS;

// ------------------------------------------------------------------ the domino bridge

/**
 * The bridge between the tables, along x = BRIDGE_X (hubBounds.ts). Two rulers lie flat across the
 * gap as beams; on them a deck of dominoes lying face up, each turned across the walkway (scaled
 * evenly, `s`, so they keep their 1 : 2 face); a domino ramp at each end; and a long ruler on edge
 * along each side as a rail, resting on both table tops. North (−z) is the gates table.
 */
const DECK_N = 12;
const DECK_S = 1.6;
const DECK_PITCH = DOMINO.w * DECK_S + 0.04;
const DECK_MID = (TABLE.minZ + TABLE_B.maxZ) / 2;
const DECK_TOP = 0.32 + DOMINO.t * DECK_S;
export const BRIDGE = {
  x: BRIDGE_X,
  /** Domino scale for the deck and ramps. */
  s: DECK_S,
  planks: DECK_N,
  pitch: DECK_PITCH,
  /** Deck span: z of its spawn-table end (A) and its gates-table end (B). */
  deckA: DECK_MID + (DECK_N * DECK_PITCH) / 2,
  deckB: DECK_MID - (DECK_N * DECK_PITCH) / 2,
  /** Beam (a ruler lying flat) thickness; the deck rests on the beams. */
  beamT: 0.32,
  /** Top of the deck (what you walk on). */
  top: DECK_TOP,
  /** Half width of the deck (dominoes lying across, so their long side). */
  halfW: (DOMINO.h * DECK_S) / 2,
  /** Horizontal run of each end ramp: a domino lying lengthwise, its top end resting on the deck. */
  ramp: Math.sqrt((DOMINO.h * DECK_S) ** 2 - DECK_TOP ** 2),
  /** Rails: rulers on edge standing on both table tops just outside the deck. */
  rail: { len: 61, h: 3.4, t: 0.32, z: DECK_MID },
};
/** The rails' centre x offset from the bridge's centre line. */
export const BRIDGE_RAIL_X = BRIDGE.halfW + BRIDGE.rail.t / 2 + 0.02;
/** Number of collider steps per ramp (each rise is well under the step height). */
const RAMP_STEPS = 4;

// ------------------------------------------------------------------ gates table

/**
 * Minigame gates: one building-block arch per playable trial, all on the gates table. Five stand
 * along its north side facing south (Copycat in the middle, straight ahead off the bridge), four
 * along its south side facing north, either side of the bridge landing, and one at each end
 * facing in. A loop road passes GATE_ROAD in front of every arch; interacting at a gate opens that
 * trial's lobby (the shared practice intro card).
 * Positions are data: add a playable game to the registry and give it a spot here.
 */
type District = 'west' | 'centre' | 'east';
const N_ROW = -148;
const S_ROW = -104;
const END_W = -61;
const END_E = 115;
const END_Z = -126;
const GATE_SPOTS: Record<MinigameId, { x: number; z: number; rot: number; district: District; short: string }> = {
  // north row, facing south (towards the bridge and the spawn table)
  'toy-squad': { x: -50, z: N_ROW, rot: 0, district: 'west', short: 'Toy Squad' },
  'jack-in-the-box': { x: -14, z: N_ROW, rot: 0, district: 'west', short: 'Jack' },
  'copycat-conductor': { x: BRIDGE_X, z: N_ROW, rot: 0, district: 'centre', short: 'Copycat' },
  'music-box-rhythm': { x: 60, z: N_ROW, rot: 0, district: 'east', short: 'Music Box' },
  'wind-up-dash': { x: 96, z: N_ROW, rot: 0, district: 'east', short: 'Dash' },
  // south row, facing north, either side of the bridge landing
  'find-the-original': { x: -54, z: S_ROW, rot: Math.PI, district: 'west', short: 'Find the Original' },
  'midnight-hunger': { x: -20, z: S_ROW, rot: Math.PI, district: 'west', short: 'Midnight' },
  'blink-duel': { x: 68, z: S_ROW, rot: Math.PI, district: 'east', short: 'Blink Duel' },
  'red-light-green-light': { x: 102, z: S_ROW, rot: Math.PI, district: 'east', short: 'Red Light' },
  // the two ends, facing in
  'inferno-escape': { x: END_W, z: END_Z, rot: Math.PI / 2, district: 'west', short: 'Inferno' },
  'spellbox-showdown': { x: END_E, z: END_Z, rot: -Math.PI / 2, district: 'east', short: 'Spellbox' },
  // south row, between Midnight and the bridge landing
  'odd-page-out': { x: 3, z: S_ROW, rot: Math.PI, district: 'west', short: 'Odd Page' },
  // south row, between the bridge landing and Blink Duel (Odd Page Out's mirror on the east side)
  'toy-tower-tumble': { x: 45, z: S_ROW, rot: Math.PI, district: 'east', short: 'Towers' },
  // inside the loop, east of the avenue, facing it: a fort in the middle of the table (both
  // south-row spots beside the bridge landing are taken)
  'toybox-siege': { x: 46, z: -127, rot: -Math.PI / 2, district: 'east', short: 'Siege' },
};

const CATEGORY_LABEL: Record<string, string> = { pvp: 'Versus' };

export interface HubGate {
  /** Interactable id, `gate-<game id>`. */
  id: string;
  game: MinigameId;
  title: string;
  /** Short name for the signposts. */
  short: string;
  /** Short line under the title on the gate's name board. */
  sub: string;
  x: number;
  z: number;
  /** Local +z is the gate's front; it faces the loop road. */
  rot: number;
  color: string;
  district: District;
}

export const GATES: HubGate[] = MINIGAMES.filter((g) => g.status === 'playable' && GATE_SPOTS[g.id]).map((g) => {
  const p = GATE_SPOTS[g.id];
  const cat = CATEGORY_LABEL[g.category] ?? `${g.category[0].toUpperCase()}${g.category.slice(1)}`;
  const players = g.players.min === g.players.max ? `${g.players.min}` : `${g.players.min}–${g.players.max}`;
  return {
    id: `gate-${g.id}`,
    game: g.id,
    title: g.title,
    short: p.short,
    sub: `${cat} · ${players} players`,
    x: p.x,
    z: p.z,
    rot: p.rot,
    color: g.accent,
    district: p.district,
  };
});
/** The gates signpost's trial boards: one per wing. */
export const GATE_DISTRICTS: { id: District; label: string }[] = [
  { id: 'west', label: 'West wing' },
  { id: 'centre', label: 'Straight on' },
  { id: 'east', label: 'East wing' },
];
export const gateFor = (game: MinigameId) => GATES.find((g) => g.game === game);
export const GATE = { width: 9, pillar: 2.6, height: 8.5, depth: 3 };
/** Where the player stands to use a gate, and where the loop road passes (cm in front of the arch). */
export const GATE_STAND = 2.2;
export const GATE_ROAD = 5.5;
/** The loop road on the gates table: its north and south lanes (z) and its west and east ends (x). */
export const GATE_LOOP = { north: N_ROW + GATE_ROAD, south: S_ROW - GATE_ROAD, west: END_W + GATE_ROAD, east: END_E - GATE_ROAD, z: END_Z };
/**
 * Themed props beside every gate (see `gateDecor.ts`), in gate-local centimetres: a tall "hero"
 * piece on the gate's left and a low cluster on its right. Both are solid.
 */
export const GATE_DECOR = {
  hero: { lx: -7.2, lz: -0.5, r: 2.0, top: 7 },
  side: { lx: 6.8, lz: -0.3, r: 1.8, top: 3.2 },
};

/**
 * The gate greeters (src/scene/Greeters.tsx): a small toy at the front of every arch, to the
 * right of its path as you walk up, in front of the gate's low prop. Gate-local cm. Solid, but
 * clear of the arch, the gate's stub path, the loop road and the spot where you stand to play.
 */
export const GREETER = { lx: 5.0, lz: 2.6, r: 0.9, top: 3 };
/** Gates whose greeter stands on the other side (the Siege fort's right-hand side is on the loop road). */
const GREETER_LEFT: readonly MinigameId[] = ['toybox-siege'];
export const greeterSpot = (g: { x: number; z: number; rot: number; game: MinigameId }) => gateLocal(g, GREETER_LEFT.includes(g.game) ? -GREETER.lx : GREETER.lx, GREETER.lz);

/** Where Pipwick, the welcome mascot, waits between tours: by the plaza, ahead-right of spawn. */
export const PIPWICK_HOME = { x: 7, z: 15, r: 1.2, top: 3.8, yaw: Math.PI + 0.5 };
/**
 * The Jukebox (src/scene/Jukebox.tsx): on the gates table's north row, just east of the Music Box
 * Rhythm gate, facing the road like the arches. Picks the Hub's background track.
 */
export const JUKEBOX = { x: 73, z: -150, rot: 0, w: 5, d: 3.4, h: 6.6 };

// ------------------------------------------------------------------ household objects and props

/** Big household objects on the spawn table that reach into the play area. */
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

/**
 * Real things lying on the spawn table's margin, outside the play mat (Tabletop.tsx draws them;
 * the domino fence parts round them). Footprint radii in cm.
 */
export const DESK = {
  lampBase: { x: -62, z: -54, r: 11 },
  pencilPot: { x: -74, z: 17, r: 4.4 },
  cactus: { x: 75, z: -12, r: 3.6 },
  notes: { x: 74.5, z: 41, rot: 0.35, r: 5.4 },
  sparePencil: { x: 40, z: 43.2, rot: -0.1 },
};

export const TREES: [number, number, number][] = [
  // x, z, scale — kept off the streets, the loop road and the gates' props
  // spawn table: a few round the edges, so the plaza stays open
  [-20, -30, 1.1],
  [-52, -34, 1.0],
  [-57, -12, 0.9],
  [-58, 29, 0.9],
  [-6, -32, 0.8],
  [32, -29, 0.9],
  [47, 5, 1.0],
  [22, 12, 1.1],
  [27, 31.5, 0.8], // kept clear of the menu / Workshop camera paths near spawn
  [-40, 31, 0.8],
  // gates table: the green inside the loop road, and its corners
  [-36, -126, 1.0],
  [-4, -130, 0.9],
  [52, -130, 0.9],
  [84, -124, 1.0],
  [-61, -157, 0.9],
  [116, -157, 0.9],
  [116, -98, 0.8],
];

export const BLOCKS: { x: number; z: number; y: number; rot: number; color: string; s?: number }[] = [
  // a little block stack in the middle of the train loop
  { x: 17.4, z: 21.2, y: 0, rot: 0.2, color: PALETTE.toyBlue },
  { x: 20.6, z: 21.7, y: 0, rot: -0.1, color: PALETTE.coral },
  { x: 19, z: 21.5, y: 3, rot: 0.5, color: PALETTE.honey },
  { x: 31, z: 31, y: 0, rot: 0.4, color: PALETTE.sage },
  { x: -18.4, z: 30.8, y: 0, rot: 0.1, color: PALETTE.honey },
  { x: 8.5, z: 10.5, y: 0, rot: 0.7, color: PALETTE.inkPurple, s: 0.8 },
  { x: -8, z: 12, y: 0, rot: 0.3, color: PALETTE.toyBlue, s: 0.8 },
  // gates table, behind the north row
  { x: 41, z: -157, y: 0, rot: 0.3, color: PALETTE.coral },
  { x: -32, z: -157, y: 0, rot: -0.2, color: PALETTE.toyBlue },
  { x: -32, z: -157, y: 3, rot: 0.4, color: PALETTE.honey, s: 0.8 },
];
export const BLOCK_SIZE = 3;

/** Gate-local point (lx to the gate's right, lz out of its front) in world xz. */
export function gateLocal(g: { x: number; z: number; rot: number }, lx: number, lz: number) {
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  return { x: g.x + lx * c + lz * s, z: g.z - lx * s + lz * c };
}

/** Collider boxes of the domino bridge: deck, stepped ramps and the two rails. */
export function bridgeColliders(): Collider[] {
  const b = BRIDGE;
  const list: Collider[] = [];
  list.push({ kind: 'box', id: 'bridge-deck', x: b.x, z: (b.deckA + b.deckB) / 2, hx: b.halfW, hz: (b.deckA - b.deckB) / 2, rot: 0, top: b.top });
  for (const [end, dir] of [[b.deckA, 1], [b.deckB, -1]] as const) {
    // the ramp runs from the deck end (high) out onto the table (low), in RAMP_STEPS steps
    const seg = b.ramp / RAMP_STEPS;
    for (let i = 0; i < RAMP_STEPS; i++) {
      const z = end + dir * seg * (i + 0.5);
      list.push({ kind: 'box', id: 'bridge-ramp', x: b.x, z, hx: b.halfW, hz: seg / 2, rot: 0, top: (b.top * (RAMP_STEPS - i - 0.5)) / RAMP_STEPS });
    }
  }
  for (const side of [-1, 1]) list.push({ kind: 'box', id: 'bridge-rail', x: b.x + side * BRIDGE_RAIL_X, z: b.rail.z, hx: b.rail.t / 2, hz: b.rail.len / 2, rot: 0, top: b.rail.h });
  return list;
}

/** Every static hub collider, as data (also used by the layout unit tests). */
export function hubColliders(): Collider[] {
  const list: Collider[] = [];
  list.push({ kind: 'circle', id: 'fountain', x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.r, top: FOUNTAIN.top });
  list.push({ kind: 'box', id: 'pavilion', x: PAVILION.x, z: PAVILION.z, hx: PAVILION.w / 2 + 0.3, hz: PAVILION.d / 2 + 0.3, rot: PAVILION.rot, top: 14 });
  list.push({ kind: 'box', id: 'workshop', x: WORKSHOP.x, z: WORKSHOP.z, hx: WORKSHOP.w / 2, hz: WORKSHOP.d / 2, rot: WORKSHOP.rot, top: 10 });
  list.push({ kind: 'box', id: 'shop', x: SHOP.x, z: SHOP.z, hx: SHOP.w / 2, hz: SHOP.d / 2, rot: SHOP.rot, top: SHOP.h });
  // shop counter (pulled-out matchbox drawer) — low enough to hop onto
  {
    const c = frontOf(SHOP.x, SHOP.z, SHOP.rot, SHOP.d / 2 + 2.2);
    list.push({ kind: 'box', id: 'shop-counter', x: c.x, z: c.z, hx: SHOP.w / 2 - 0.5, hz: 2.2, rot: SHOP.rot, top: 1.8 });
  }
  {
    // the frame and its feet (1.3 cm out front) and rear braces (2.3 cm behind)
    const c = frontOf(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, -0.5);
    list.push({ kind: 'box', id: 'scoreboard', x: c.x, z: c.z, hx: SCOREBOARD.w / 2, hz: 1.8, rot: SCOREBOARD.rot, top: SCOREBOARD.h });
  }
  list.push({ kind: 'box', id: 'tv', x: TV.x, z: TV.z, hx: TV.w / 2, hz: TV.d / 2, rot: TV.rot, top: TV.h });
  for (const g of GATES) {
    for (const side of [-1, 1]) {
      const p = gateLocal(g, side * (GATE.width / 2 - GATE.pillar / 2), 0);
      list.push({ kind: 'box', id: `${g.id}-pillar`, x: p.x, z: p.z, hx: GATE.pillar / 2, hz: GATE.depth / 2, rot: g.rot, top: GATE.height });
    }
    for (const [k, d] of Object.entries(GATE_DECOR)) {
      const p = gateLocal(g, d.lx, d.lz);
      list.push({ kind: 'circle', id: `${g.id}-${k}`, x: p.x, z: p.z, r: d.r, top: d.top });
    }
    const gr = greeterSpot(g);
    list.push({ kind: 'circle', id: `${g.id}-greeter`, x: gr.x, z: gr.z, r: GREETER.r, top: GREETER.top });
  }
  list.push({ kind: 'circle', id: 'pipwick', x: PIPWICK_HOME.x, z: PIPWICK_HOME.z, r: PIPWICK_HOME.r, top: PIPWICK_HOME.top });
  list.push({ kind: 'box', id: 'jukebox', x: JUKEBOX.x, z: JUKEBOX.z, hx: JUKEBOX.w / 2, hz: JUKEBOX.d / 2, rot: JUKEBOX.rot, top: JUKEBOX.h });
  const t = TOWER;
  for (const [id, b] of Object.entries(t)) list.push({ kind: 'box', id: `tower-${id}`, x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: 0, top: b.top });
  list.push({ kind: 'box', id: 'pencil', x: PENCIL.x, z: PENCIL.z, hx: PENCIL.length / 2, hz: PENCIL.r, rot: PENCIL.rot, top: PENCIL.r * 2 });
  for (const [x, z, s] of TREES) list.push({ kind: 'circle', id: 'tree', x, z, r: 1.4 * s, top: 9 * s });
  for (const b of BLOCKS) {
    const h = (b.s ?? 1) * BLOCK_SIZE;
    if (b.y > 0) continue; // stacked blocks are covered by the block underneath (top raised below)
    const stackTop = BLOCKS.filter((o) => o.y > 0 && Math.hypot(o.x - b.x, o.z - b.z) < BLOCK_SIZE).reduce((m, o) => Math.max(m, o.y + (o.s ?? 1) * BLOCK_SIZE), h);
    list.push({ kind: 'box', id: 'block', x: b.x, z: b.z, hx: h / 2, hz: h / 2, rot: b.rot, top: stackTop });
  }
  list.push({ kind: 'box', id: 'musicbox', x: MUSICBOX.x, z: MUSICBOX.z, hx: 2.6, hz: 1.9, rot: 0, top: 2.6 });
  list.push({ kind: 'circle', id: 'jack', x: JACK.x, z: JACK.z, r: 2.1, top: 4.2 });
  for (const [id, p] of Object.entries(SIGNPOSTS)) list.push({ kind: 'circle', id: id === 'spawn' ? 'fingerpost' : `signpost-${id}`, x: p.x, z: p.z, r: 1.15, top: p.h });
  // the book cliffs and the mug stand on the edge of the spawn table's play mat
  list.push({ kind: 'box', id: 'books', x: BOOKS.x, z: BOOKS.z, hx: BOOKS.hx, hz: BOOKS.hz, rot: 0, top: BOOKS.top });
  list.push({ kind: 'circle', id: 'mug', x: MUG.x, z: MUG.z, r: MUG.r, top: MUG.top });
  list.push({ kind: 'circle', id: 'mug-handle', x: MUG.x + MUG.handleX, z: MUG.z, r: MUG.handleR, top: MUG.top });
  list.push(...bridgeColliders());
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
