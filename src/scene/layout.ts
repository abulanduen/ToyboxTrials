/**
 * Hub layout — single source of truth for where things are and how they collide.
 * 1 unit = 1 cm. Table top is y = 0. The toy is ~3.5 tall.
 * Visual components read these numbers; `registerHubColliders()` turns them into collision.
 *
 * The hub spans two tables of the same height: the spawn table (fountain plaza, Scoreboard and
 * its TV, Pavilion, Workshop, shop, the secrets) and, across a 26 cm gap, the gates table (a desk
 * under the window) with the ball games. A domino bridge joins them. Under the spawn table, on the
 * room floor, is the arcade with a machine for every trial (reached by the toy car, left by the
 * lift: src/game/hubRides.ts). Where you can walk is the union of rectangles per level in
 * src/game/hubBounds.ts, shared with the online server.
 */
import { addStatic, resetStatic, type Collider } from '../game/collision';
import { ARCADE_CEILING, BRIDGE_WALK, BRIDGE_X, GATES_WALK, HUB_WALK, LEVEL_Y, WALK_AREAS } from '../game/hubBounds';
import { hubPlayColliders } from '../game/hubPlay';
import { PALETTE } from '../game/palette';
import { JACK_BOX } from '../game/whoAmI';
import { MINIGAMES } from '../minigames/registry';
import type { MinigameId } from '../minigames/types';
import { DOMINO } from './domino';

export { BRIDGE_WALK, GATES_WALK, HUB_WALK, WALK_AREAS };
/** Hub play objects (the shared marble, the football nets, the basketball hoop): src/game/hubPlay.ts. */
export { BALL, HOOP, MARBLE, NET, NETS, PITCH_AREA, PITCH_CENTRE, hubPlayColliders } from '../game/hubPlay';

/** The spawn table. */
export const TABLE = { minX: -80, maxX: 80, minZ: -60, maxZ: 46, thickness: 3.5, legHeight: 72 };
export const FLOOR_Y = -(TABLE.thickness + TABLE.legHeight);
/**
 * The gates table: a desk under the window, the same height as the spawn table. A 26 cm gap
 * separates the two; the domino bridge spans it.
 */
export const TABLE_B = { minX: -76, maxX: 130, minZ: -172, maxZ: -86, thickness: TABLE.thickness, legHeight: TABLE.legHeight };
export const TABLES = [TABLE, TABLE_B] as const;

/**
 * The arcade on the room floor under the spawn table (docs/ARCADE_PLAN.md; walkable floor and
 * ceiling: hubBounds.ts ARCADE_WALK, ARCADE_CEILING). Its carpet reaches the table's legs; a low
 * wall of toy bricks runs round the walkable floor's edge, open at the front (`entrance`, where the
 * ride and the lift come in); strings of bulbs hang under the table's apron across x at `strands` z.
 */
export const ARCADE = {
  y: FLOOR_Y,
  carpet: { minX: -73, maxX: 73, minZ: -53, maxZ: 39 },
  wall: { minX: -72, maxX: 72, minZ: -52, maxZ: 38, h: 2.6, t: 2, brick: 4 },
  // wide enough for both ways in and out: the car track (hubRides.ts CAR.inX) and the lift's rails (LIFT.x)
  entrance: { x: 9, halfW: 18 },
  ceiling: ARCADE_CEILING,
  strands: [-42, -18, 6, 28],
  /** Each strand hangs from just under the apron and sags this far at its middle (cm). */
  sag: 5,
};
/** Bounding box of both table tops (shadow frustum, room lighting). */
export const TABLES_BOX = {
  minX: Math.min(TABLE.minX, TABLE_B.minX),
  maxX: Math.max(TABLE.maxX, TABLE_B.maxX),
  minZ: Math.min(TABLE.minZ, TABLE_B.minZ),
  maxZ: Math.max(TABLE.maxZ, TABLE_B.maxZ),
};

// ------------------------------------------------------------------ spawn table

/**
 * The plaza fountain: a basin you can hop onto (r, top: the rim; its water is walkable), and the
 * resin tiers in the middle (column: the pedestal's foot, too tall to climb; src/scene/fountainDecor.ts).
 */
export const FOUNTAIN = { x: 0, z: -1, r: 5.2, top: 1.4, column: { r: 1.95, top: 9 } };
/**
 * Tournament Pavilion: the east side of the plaza, its door facing the fountain. A hollow striped
 * gift box: walk in through the doorway in its front (local +z) and talk to the Tournament Curator.
 */
export const PAVILION = { x: 34, z: -10, rot: Math.atan2(0 - 34, -1 - -10), w: 14, d: 10, h: 7.5 };
/**
 * The Pavilion's cardboard walls: thickness `t` (the colliders reach `pad` further out), the doorway
 * (width and the top of its arch), and the height the walls drop to while you are inside (the lid
 * lifts off and the walls fold down so the camera can see in: src/scene/pavilionView.ts).
 */
export const PAVILION_WALL = { t: 0.5, pad: 0.3, doorW: 4.6, doorH: 5.6, cutH: 1.4 };
/**
 * The Tournament Curator (src/scene/Greeters.tsx), inside the Pavilion by the back wall, facing the
 * door; talking to them opens the tournament panel. `lz` is Pavilion-local (towards the door).
 */
export const CURATOR = { lz: -2.5, ...gateLocal(PAVILION, 0, -2.5), r: 0.9, top: 3.4, yaw: PAVILION.rot };
/**
 * Pavilion furniture, in Pavilion-local boxes (lx right, lz towards the door): the trophy shelf and
 * the winners' podium (first in the middle, highest; hop up on it), and the sign's two legs.
 */
export const PAVILION_PROPS = {
  shelf: { lx: -4.9, lz: -3.95, hx: 1.6, hz: 0.55, top: 4.3 },
  podium: [
    { lx: 3.45, lz: -3.75, hx: 0.6, hz: 0.75, top: 1.2, place: 2 },
    { lx: 4.65, lz: -3.75, hx: 0.6, hz: 0.75, top: 1.8, place: 1 },
    { lx: 5.85, lz: -3.75, hx: 0.6, hz: 0.75, top: 0.85, place: 3 },
  ],
  sign: { lz: -4.05, legX: 1.7, w: 4.2, h: 1.7, y: 4.7 },
} as const;

/** Pavilion-local coordinates (lx to its right, lz out of its front) of a world point. */
export function pavilionLocal(x: number, z: number) {
  const c = Math.cos(PAVILION.rot);
  const s = Math.sin(PAVILION.rot);
  const dx = x - PAVILION.x;
  const dz = z - PAVILION.z;
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}
/** Is a world point inside the Pavilion's walls (the doorway counts), grown by `pad`? */
export function insidePavilion(x: number, z: number, pad = 0) {
  const { lx, lz } = pavilionLocal(x, z);
  return Math.abs(lx) < PAVILION.w / 2 + pad && lz > -PAVILION.d / 2 - pad && lz < PAVILION.d / 2 + pad;
}
/**
 * The Pavilion's solid parts as Pavilion-local boxes: the back wall, the two side walls and the front
 * wall either side of the doorway, each reaching `pad` outside the cardboard.
 */
export function pavilionWalls() {
  const { w, d } = PAVILION;
  const { t, pad, doorW } = PAVILION_WALL;
  const th = (t + pad) / 2; // half thickness of a wall collider
  const side = (w / 2 + pad - doorW / 2) / 2; // half width of each front piece
  return [
    { id: 'pavilion-back', lx: 0, lz: -(d / 2 + pad) + th, hx: w / 2 + pad, hz: th },
    { id: 'pavilion-left', lx: -(w / 2 + pad) + th, lz: 0, hx: th, hz: d / 2 + pad },
    { id: 'pavilion-right', lx: w / 2 + pad - th, lz: 0, hx: th, hz: d / 2 + pad },
    { id: 'pavilion-front', lx: -(doorW / 2 + side), lz: d / 2 + pad - th, hx: side, hz: th },
    { id: 'pavilion-front', lx: doorW / 2 + side, lz: d / 2 + pad - th, hx: side, hz: th },
  ];
}
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
/** The jack-in-the-box: its spot lives in src/game/whoAmI.ts, where the server reads it (Who Am I? cards). */
export const JACK = JACK_BOX;

/**
 * Signposts: wooden fingerposts with an arrow board per destination (labels and colours in
 * signposts.ts `signposts()`): one by spawn, one at each end of the domino bridge.
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

// ------------------------------------------------------------------ the arcade's machines

/**
 * One arcade machine per playable trial, on the arcade floor under the spawn table
 * (docs/ARCADE_PLAN.md phase 3; src/scene/Machines.tsx): six along its back wall facing the way in,
 * three down each side wall facing in, and two back-to-back pairs in the middle. Walk up and press
 * Interact (or tap the prompt) to open that trial's lobby (the shared practice intro card).
 * Positions are data: add a playable game to the registry and give it a spot here.
 * Machine-local +z is the machine's front (its screen); `rot` is three.js rotation.y.
 */
const BACK_Z = -46;
const SIDE_X = 66;
const ISLAND_X = 20;
const ISLAND_Z = -12;
/** A cabinet: footprint (w across, d deep) and height (cm): about twice a toy's height, like a real arcade cabinet beside a child. */
export const MACHINE = { w: 4.8, d: 3.6, h: 7.6 };
/** Where a toy stands to play (cm in front of the cabinet's front face). */
export const MACHINE_STAND = 2.6;
const ISLAND_HALF = MACHINE.d / 2 + 0.15;
const MACHINE_SPOTS: Record<MinigameId, { x: number; z: number; rot: number; short: string }> = {
  // the back wall, facing the way in: the memory and music games in the middle
  'toy-squad': { x: -50, z: BACK_Z, rot: 0, short: 'Toy Squad' },
  'jack-in-the-box': { x: -30, z: BACK_Z, rot: 0, short: 'Jack' },
  'copycat-conductor': { x: -10, z: BACK_Z, rot: 0, short: 'Copycat' },
  'music-box-rhythm': { x: 10, z: BACK_Z, rot: 0, short: 'Music Box' },
  'wind-up-dash': { x: 30, z: BACK_Z, rot: 0, short: 'Dash' },
  'red-light-green-light': { x: 50, z: BACK_Z, rot: 0, short: 'Red Light' },
  // the west wall, facing east: the looking games
  'find-the-original': { x: -SIDE_X, z: -28, rot: Math.PI / 2, short: 'Find the Original' },
  'odd-page-out': { x: -SIDE_X, z: -8, rot: Math.PI / 2, short: 'Odd Page' },
  'midnight-hunger': { x: -SIDE_X, z: 12, rot: Math.PI / 2, short: 'Midnight' },
  // the east wall, facing west: the duels and the escape
  'blink-duel': { x: SIDE_X, z: -28, rot: -Math.PI / 2, short: 'Blink Duel' },
  'spellbox-showdown': { x: SIDE_X, z: -8, rot: -Math.PI / 2, short: 'Spellbox' },
  'inferno-escape': { x: SIDE_X, z: 12, rot: -Math.PI / 2, short: 'Inferno' },
  // the middle: back-to-back pairs, the building games west, the ball games east
  'toy-tower-tumble': { x: -ISLAND_X, z: ISLAND_Z + ISLAND_HALF, rot: 0, short: 'Towers' },
  'toybox-siege': { x: -ISLAND_X, z: ISLAND_Z - ISLAND_HALF, rot: Math.PI, short: 'Siege' },
  'hoop-hustle': { x: ISLAND_X, z: ISLAND_Z + ISLAND_HALF, rot: 0, short: 'Hoops' },
  'hoop-clash': { x: ISLAND_X, z: ISLAND_Z - ISLAND_HALF, rot: Math.PI, short: 'Hoop Clash' },
};

const CATEGORY_LABEL: Record<string, string> = { pvp: 'Versus' };

export interface HubMachine {
  /** Interactable id, `machine-<game id>`. */
  id: string;
  game: MinigameId;
  title: string;
  /** Short name (TV cards). */
  short: string;
  /** Short line under the title on the machine's marquee. */
  sub: string;
  x: number;
  z: number;
  /** Local +z is the machine's front (its screen). */
  rot: number;
  color: string;
}

export const MACHINES: HubMachine[] = MINIGAMES.filter((g) => g.status === 'playable' && MACHINE_SPOTS[g.id]).map((g) => {
  const p = MACHINE_SPOTS[g.id];
  const cat = CATEGORY_LABEL[g.category] ?? `${g.category[0].toUpperCase()}${g.category.slice(1)}`;
  const players = g.players.min === g.players.max ? `${g.players.min}` : `${g.players.min}–${g.players.max}`;
  return { id: `machine-${g.id}`, game: g.id, title: g.title, short: p.short, sub: `${cat} · ${players} players`, x: p.x, z: p.z, rot: p.rot, color: g.accent };
});
export const machineFor = (game: MinigameId) => MACHINES.find((g) => g.game === game);
/** Where a toy stands to play a machine (on the arcade floor), facing it. */
export const machineStand = (m: HubMachine, extra = 0) => frontOf(m.x, m.z, m.rot, MACHINE.d / 2 + MACHINE_STAND + extra);

/**
 * The machine greeters (src/scene/Greeters.tsx): a small toy beside every machine, on its right as
 * you face it, a little forward. Machine-local cm. Solid, but clear of the cabinet, of the spot where
 * you stand to play, and of the next machine.
 */
export const GREETER = { lx: 4.4, lz: 1.6, r: 0.9, top: 3 };
export const greeterSpot = (m: { x: number; z: number; rot: number }) => gateLocal(m, -GREETER.lx, GREETER.lz);

/** Where Pipwick, the welcome mascot, waits between tours: by the plaza, ahead-right of spawn. */
export const PIPWICK_HOME = { x: 7, z: 15, r: 1.2, top: 3.8, yaw: Math.PI + 0.5 };
/**
 * The Jukebox (src/scene/Jukebox.tsx): on the gates table's north side, by the window, behind the
 * basketball hoop. Picks the Hub's background track.
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
  // x, z, scale — kept off the streets and the props
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
  [-30, -138, 1.0], // off the pitch's centre line (the west net is at x = -49)
  [-4, -130, 0.9],
  [52, -130, 0.9],
  [90, -114, 1.0], // off the pitch's centre line (the east net is at x = 101)
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

/** Object-local point (lx to its right, lz out of its front; a machine, the Pavilion, the TV…) in world xz. */
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
  list.push({ kind: 'circle', id: 'fountain-column', x: FOUNTAIN.x, z: FOUNTAIN.z, r: FOUNTAIN.column.r, top: FOUNTAIN.column.top });
  // the Pavilion: hollow, with a doorway in front; the Curator and the furniture inside
  for (const wl of pavilionWalls()) list.push({ kind: 'box', id: wl.id, ...gateLocal(PAVILION, wl.lx, wl.lz), hx: wl.hx, hz: wl.hz, rot: PAVILION.rot, top: 14 });
  list.push({ kind: 'circle', id: 'curator', x: CURATOR.x, z: CURATOR.z, r: CURATOR.r, top: CURATOR.top });
  {
    const { shelf, podium, sign } = PAVILION_PROPS;
    list.push({ kind: 'box', id: 'pavilion-shelf', ...gateLocal(PAVILION, shelf.lx, shelf.lz), hx: shelf.hx, hz: shelf.hz, rot: PAVILION.rot, top: shelf.top });
    for (const p of podium) list.push({ kind: 'box', id: 'pavilion-podium', ...gateLocal(PAVILION, p.lx, p.lz), hx: p.hx, hz: p.hz, rot: PAVILION.rot, top: p.top });
    for (const sx of [-1, 1]) list.push({ kind: 'circle', id: 'pavilion-sign', ...gateLocal(PAVILION, sx * sign.legX, sign.lz), r: 0.2, top: sign.y + sign.h / 2 });
  }
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
  // the arcade's machines and their greeters, down on the floor
  for (const m of MACHINES) {
    list.push({ kind: 'box', id: m.id, x: m.x, z: m.z, hx: MACHINE.w / 2, hz: MACHINE.d / 2, rot: m.rot, top: LEVEL_Y.floor + MACHINE.h, lv: 'floor' });
    const gr = greeterSpot(m);
    list.push({ kind: 'circle', id: `${m.id}-greeter`, x: gr.x, z: gr.z, r: GREETER.r, top: LEVEL_Y.floor + GREETER.top, lv: 'floor' });
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
  // The desk things on the table's margin (Tabletop.tsx). The domino fence parts round them, so a toy
  // can reach them. The lamp's base is a low brass disc (2.4 cm: a hop lands on it) with the post rising
  // from its middle; the pencil pot is a wall. (The cactus and the sticky notes are drawn only above the
  // Low tier, so they stay without colliders: collision must match on every tier and on the server.)
  list.push({ kind: 'circle', id: 'lamp-base', x: DESK.lampBase.x, z: DESK.lampBase.z, r: DESK.lampBase.r, top: 2.4 });
  list.push({ kind: 'circle', id: 'lamp-post', x: DESK.lampBase.x, z: DESK.lampBase.z, r: 2.4, top: 40 });
  list.push({ kind: 'circle', id: 'pencil-pot', x: DESK.pencilPot.x, z: DESK.pencilPot.z, r: DESK.pencilPot.r, top: 10.8 });
  list.push(...bridgeColliders());
  list.push(...hubPlayColliders());
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
