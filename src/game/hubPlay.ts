/**
 * Hub play objects: where the shared marble, the two football nets, the basketball hoop and its
 * ball are, as pure numbers (1 unit = 1 cm, table top y = 0). No imports beyond the collision
 * types, so the online server can use them (like hubBounds.ts); src/scene/layout.ts re-exports
 * them and adds `hubPlayColliders()` to the hub's colliders.
 *
 * The marble lives on the spawn table (a playroom secret, where it always was). The pitch is the
 * green inside the loop road on the trials table: a net at each end, just inside the road, with
 * the end arches (Inferno Escape, Spellbox Showdown) standing behind them across the road, so
 * nothing blocks a net's mouth. The hoop stands on the pitch's north edge, east of the Siege fort.
 */
import type { Collider } from './collision';

// ------------------------------------------------------------------ the marble
export const MARBLE = {
  /** Radius (cm): about three-quarters of the toy's height across. */
  r: 1.3,
  /** Where it starts: on the spawn table, between the fountain and the Workshop. */
  home: { x: -9, z: -6 },
};

// ------------------------------------------------------------------ the pitch and its two nets
export type NetId = 'w' | 'e';
/**
 * A football net. `mouthX` is the goal line (between the posts), `backX` the back of the net;
 * `dir` is +1 when the mouth faces +x (the west net) and −1 when it faces −x (the east net).
 */
export interface Net {
  id: NetId;
  mouthX: number;
  backX: number;
  z: number;
  dir: 1 | -1;
  /** The team that scores when the marble goes into this net. */
  scorer: 0 | 1;
}
/** Inner width between the posts, post radius, height of the crossbar. */
export const NET = { width: 7, post: 0.35, h: 4.2, side: 0.15 };
export const PITCH_Z = -126;
export const NETS: readonly Net[] = [
  // west net, in front of the Inferno Escape arch: a goal here scores for Blue
  { id: 'w', mouthX: -49, backX: -52.4, z: PITCH_Z, dir: 1, scorer: 1 },
  // east net, in front of the Spellbox Showdown arch: a goal here scores for Coral
  { id: 'e', mouthX: 101, backX: 104.4, z: PITCH_Z, dir: -1, scorer: 0 },
];
/** Team names and colours, in score order: [Coral, Blue]. Coral attacks the east net. */
export const TEAMS = ['Coral', 'Blue'] as const;
/** Where the marble is put back after a goal: the middle of the pitch. */
export const PITCH_CENTRE = { x: (NETS[0].mouthX + NETS[1].mouthX) / 2, z: PITCH_Z };
/** The pitch (the green inside the loop road): for the HUD's score chip. */
export const PITCH_AREA = { minX: -58, maxX: 112, minZ: -145, maxZ: -106 };

// ------------------------------------------------------------------ the basketball hoop
/**
 * The hoop: a pole on the north edge of the pitch with the backboard and rim facing south (+z).
 * `rim` is the rim's centre; the ball scores when it drops through the rim's circle.
 */
export const HOOP = {
  x: 76,
  z: -140,
  pole: { r: 0.5, top: 12.6 },
  board: { w: 6, h: 4, t: 0.35, y: 11.4, z: -139.4 },
  rim: { x: 76, y: 9.6, z: -137.2, r: 1.75, tube: 0.15 },
};
/** The basketball's radius and where it waits (and goes back to when left alone). */
export const BALL = { r: 1.0, spot: { x: 76, z: -128 } };

/**
 * The domino bridge's deck and ramps, which the marble and the ball roll over (rising onto the
 * deck). Mirrors BRIDGE in src/scene/layout.ts, which needs three.js for its dominoes; the layout
 * unit tests check the two agree.
 */
const DECK_PITCH = 2.4 * 1.6 + 0.04;
const DECK_TOP = 0.32 + 0.75 * 1.6;
export const BRIDGE_DECK = {
  x: 24,
  halfW: (4.8 * 1.6) / 2,
  top: DECK_TOP,
  deckA: -73 + (12 * DECK_PITCH) / 2,
  deckB: -73 - (12 * DECK_PITCH) / 2,
  ramp: Math.sqrt((4.8 * 1.6) ** 2 - DECK_TOP ** 2),
};

/** Height of the floor a rolling thing rests on at (x, z): the table, or the bridge deck and ramps. */
export function rollFloorAt(x: number, z: number): number {
  const b = BRIDGE_DECK;
  if (Math.abs(x - b.x) > b.halfW) return 0;
  if (z <= b.deckA && z >= b.deckB) return b.top;
  if (z > b.deckA && z < b.deckA + b.ramp) return (b.top * (b.deckA + b.ramp - z)) / b.ramp;
  if (z < b.deckB && z > b.deckB - b.ramp) return (b.top * (z - (b.deckB - b.ramp))) / b.ramp;
  return 0;
}

/** Colliders of the nets (posts, side nets, backs) and the hoop's pole, for walking and rolling. */
export function hubPlayColliders(): Collider[] {
  const list: Collider[] = [];
  const half = NET.width / 2 + NET.post;
  for (const n of NETS) {
    const midX = (n.mouthX + n.backX) / 2;
    const depth = Math.abs(n.backX - n.mouthX);
    for (const s of [-1, 1]) {
      list.push({ kind: 'circle', id: `hp-net-${n.id}-post`, x: n.mouthX, z: n.z + s * half, r: NET.post, top: NET.h });
      list.push({ kind: 'box', id: `hp-net-${n.id}-side`, x: midX, z: n.z + s * half, hx: depth / 2, hz: NET.side, rot: 0, top: NET.h - 0.4 });
    }
    list.push({ kind: 'box', id: `hp-net-${n.id}-back`, x: n.backX, z: n.z, hx: NET.side, hz: half, rot: 0, top: NET.h - 0.4 });
  }
  list.push({ kind: 'circle', id: 'hp-hoop-pole', x: HOOP.x, z: HOOP.z, r: HOOP.pole.r, top: HOOP.pole.top });
  return list;
}
