/**
 * The Hub's NPC toys (docs/ARCADE_PLAN.md phase 5): little wind-up toys that live in the Hub. Each
 * follows a looping script on the room's clock (the dog's: the server's online, the page's offline),
 * so every player in a room sees the same toys in the same places with no network traffic. A script
 * is a list of stops: walk there in a straight line, then do something there for a while: play a
 * machine, watch, cheer, sit in the stands, or chat. They turn to look at a player who comes close
 * while they stand still, and otherwise don't react; toys pass through them (no colliders).
 *
 *  - In the arcade (floor level): players working the machines in each row and wing, walking the
 *    aisles in front of them, and a couple watching and chatting.
 *  - On the plaza (table level): strollers round the fountain, a reader at the Scoreboard and a
 *    viewer at the TV.
 *  - In the stands round the sports ground (table level): spectators sitting on the benches,
 *    cheering now and then.
 *
 * Pure (no DOM, no three.js); src/scene/Npcs.tsx draws them. `low: true` marks the ones kept on the
 * Low quality tier (phones). The unit tests walk every route against the colliders of its level.
 */
import { LEVEL_Y, type HubLevel } from './hubBounds';
import { FOUNTAIN, MACHINES, SCOREBOARD, STANDS, TV, frontOf, machineStand, standTier, type HubMachine } from '../scene/layout';
import type { MinigameId } from '../minigames/ids';

export type NpcAction = 'play' | 'watch' | 'cheer' | 'sit' | 'chat' | 'stroll';

/** One stop of a script: where, what, for how long (s), and which way to face (a yaw) while there. */
export interface NpcStop {
  x: number;
  z: number;
  action: NpcAction;
  hold: number;
  face: number;
  /** Feet height above the level's ground (a stand's tier). */
  y?: number;
}

export interface NpcDef {
  id: string;
  /** Index into PAINT_JOBS. */
  paint: number;
  level: HubLevel;
  /** Seconds into its loop at room time 0 (so they don't all start together). */
  offset: number;
  /** Kept on the Low tier. */
  low: boolean;
  stops: NpcStop[];
}

/** How fast an NPC walks between stops (cm/s): an unhurried toy. */
export const NPC_SPEED = 6;
/** How close (cm) a player must be for an idle NPC to turn and look at them. */
export const NPC_LOOK_R = 8;

// ------------------------------------------------------------------ helpers

const machine = (game: MinigameId): HubMachine => MACHINES.find((m) => m.game === game)!;
/** Out in front of a machine, in the aisle that runs along its row (cm from its front face). */
const AISLE = 7.6;
/** Playing a machine: at its stand spot, facing it. */
const play = (game: MinigameId, hold: number): NpcStop => {
  const m = machine(game);
  const p = machineStand(m, 0.2);
  return { ...p, action: 'play', hold, face: m.rot + Math.PI };
};
/** The aisle point in front of a machine (where an NPC turns off the aisle to play it). */
const aisle = (game: MinigameId): NpcStop => {
  const m = machine(game);
  const p = machineStand(m, AISLE - 2.6 + 0.2);
  return { ...p, action: 'stroll', hold: 0, face: m.rot + Math.PI };
};
/** A visit to a machine from the aisle: in, play, back out. */
const visit = (game: MinigameId, hold: number): NpcStop[] => [aisle(game), play(game, hold), aisle(game)];
const at = (x: number, z: number, action: NpcAction, hold: number, face: number, y?: number): NpcStop => ({ x, z, action, hold, face, ...(y !== undefined ? { y } : {}) });
const faceTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
/** A point on the fountain plaza's ring (radius r round the fountain), at angle a (0 = +x). */
const ring = (a: number, r = 7.4) => ({ x: FOUNTAIN.x + Math.cos(a) * r, z: FOUNTAIN.z + Math.sin(a) * r });
const plazaStop = (a: number, action: NpcAction, hold: number): NpcStop => {
  const p = ring(a);
  return at(p.x, p.z, action, hold, action === 'watch' ? faceTo(p.x, p.z, FOUNTAIN.x, FOUNTAIN.z) : a + Math.PI / 2);
};
/** Sitting on tier `i` of a stand at x, facing the pitch. */
const sit = (standId: string, i: number, x: number): NpcStop => {
  const st = STANDS.find((s) => s.id === standId)!;
  const t = standTier(st, i);
  return at(x, t.z, 'sit', 30, st.dir === -1 ? 0 : Math.PI, t.top);
};

// ------------------------------------------------------------------ the toys

export const NPCS: NpcDef[] = [
  // --- the arcade
  { id: 'arcade-back-a', paint: 2, level: 'floor', offset: 0, low: true, stops: [...visit('copycat-conductor', 14), ...visit('music-box-rhythm', 11), ...visit('wind-up-dash', 9)] },
  { id: 'arcade-back-b', paint: 5, level: 'floor', offset: 7, low: false, stops: [...visit('red-light-green-light', 10), ...visit('jack-in-the-box', 12), ...visit('toy-squad', 9)] },
  { id: 'arcade-west', paint: 7, level: 'floor', offset: 3, low: true, stops: [...visit('find-the-original', 12), ...visit('odd-page-out', 10), ...visit('midnight-hunger', 11)] },
  { id: 'arcade-east', paint: 3, level: 'floor', offset: 11, low: false, stops: [...visit('blink-duel', 10), ...visit('inferno-escape', 12), ...visit('spellbox-showdown', 9)] },
  { id: 'arcade-middle', paint: 9, level: 'floor', offset: 5, low: true, stops: [...visit('toy-tower-tumble', 12), ...visit('hoop-hustle', 12)] },
  {
    // a watcher: looks over the shoulder at the middle machines, cheers, then chats by the way in
    id: 'arcade-watcher',
    paint: 1,
    level: 'floor',
    offset: 2,
    low: false,
    stops: [at(-14, 6, 'watch', 9, faceTo(-14, 6, -20, -6)), at(-14, 6, 'cheer', 2.5, faceTo(-14, 6, -20, -6)), at(4, 14, 'chat', 8, Math.PI), at(14, 6, 'watch', 9, faceTo(14, 6, 20, -6))],
  },
  // --- the plaza
  { id: 'plaza-stroller', paint: 4, level: 'table', offset: 0, low: true, stops: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => plazaStop((k * Math.PI) / 4, k === 2 ? 'watch' : 'stroll', k === 2 ? 6 : 0)) },
  {
    id: 'plaza-reader',
    paint: 6,
    level: 'table',
    offset: 4,
    low: false,
    stops: (() => {
      const sb = frontOf(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 5);
      const r = ring(-Math.PI / 2 - 0.5);
      return [at(sb.x - 3, sb.z, 'watch', 12, SCOREBOARD.rot + Math.PI), at(r.x, r.z, 'chat', 7, faceTo(r.x, r.z, FOUNTAIN.x, FOUNTAIN.z))];
    })(),
  },
  {
    id: 'plaza-viewer',
    paint: 8,
    level: 'table',
    offset: 9,
    low: false,
    stops: (() => {
      const tv = frontOf(TV.x, TV.z, TV.rot, TV.d / 2 + 5);
      const r = ring(-Math.PI / 2 + 0.5 + Math.PI);
      return [at(tv.x, tv.z, 'watch', 10, TV.rot + Math.PI), at(r.x, r.z, 'stroll', 0, 0), at(r.x, r.z, 'cheer', 2, faceTo(r.x, r.z, FOUNTAIN.x, FOUNTAIN.z))];
    })(),
  },
  // --- the stands round the sports ground
  { id: 'fan-north-1', paint: 0, level: 'table', offset: 0, low: true, stops: [sit('north-w', 1, -30)] },
  { id: 'fan-north-2', paint: 10, level: 'table', offset: 3.3, low: false, stops: [sit('north-w', 0, -8)] },
  { id: 'fan-north-3', paint: 2, level: 'table', offset: 6.1, low: true, stops: [sit('north-w', 2, 18)] },
  { id: 'fan-north-4', paint: 5, level: 'table', offset: 1.7, low: false, stops: [sit('north-e', 1, 98)] },
  { id: 'fan-south-1', paint: 7, level: 'table', offset: 4.4, low: true, stops: [sit('south-w', 0, -24)] },
  { id: 'fan-south-2', paint: 11, level: 'table', offset: 8.2, low: false, stops: [sit('south-e', 1, 62)] },
];

// ------------------------------------------------------------------ the clock → a pose

interface Leg {
  /** Start time in the loop, walking time, then the hold. */
  t0: number;
  walk: number;
  hold: number;
  from: NpcStop;
  to: NpcStop;
}
const legsCache = new Map<string, { legs: Leg[]; loop: number }>();
/** An NPC's loop: from each stop to the next (walking), then holding there. */
export function npcLegs(def: NpcDef): { legs: Leg[]; loop: number } {
  const hit = legsCache.get(def.id);
  if (hit) return hit;
  const legs: Leg[] = [];
  let t = 0;
  const n = def.stops.length;
  for (let i = 0; i < n; i++) {
    const from = def.stops[(i - 1 + n) % n];
    const to = def.stops[i];
    const walk = n === 1 ? 0 : Math.hypot(to.x - from.x, to.z - from.z) / NPC_SPEED;
    legs.push({ t0: t, walk, hold: to.hold, from, to });
    t += walk + to.hold;
  }
  const out = { legs, loop: Math.max(t, 0.001) };
  legsCache.set(def.id, out);
  return out;
}

export interface NpcPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  action: NpcAction;
  walking: boolean;
  /** Seconds into the current hold (or walk). */
  into: number;
}

/** Where an NPC is at room time `now` (s), and what it is doing. */
export function npcPose(def: NpcDef, now: number, out?: NpcPose): NpcPose {
  const o: NpcPose = out ?? { x: 0, y: 0, z: 0, yaw: 0, action: 'stroll', walking: false, into: 0 };
  const { legs, loop } = npcLegs(def);
  const t = (((now + def.offset) % loop) + loop) % loop;
  let leg = legs[legs.length - 1];
  for (const l of legs) {
    if (t < l.t0 + l.walk + l.hold) {
      leg = l;
      break;
    }
  }
  const dt = t - leg.t0;
  const ground = LEVEL_Y[def.level];
  if (dt < leg.walk) {
    const k = dt / leg.walk;
    o.x = leg.from.x + (leg.to.x - leg.from.x) * k;
    o.z = leg.from.z + (leg.to.z - leg.from.z) * k;
    o.y = ground + (leg.from.y ?? 0) + ((leg.to.y ?? 0) - (leg.from.y ?? 0)) * k;
    o.yaw = Math.atan2(leg.to.x - leg.from.x, leg.to.z - leg.from.z);
    o.action = 'stroll';
    o.walking = true;
    o.into = dt;
  } else {
    o.x = leg.to.x;
    o.z = leg.to.z;
    o.y = ground + (leg.to.y ?? 0);
    o.yaw = leg.to.face;
    o.action = leg.to.action;
    o.walking = false;
    o.into = dt - leg.walk;
  }
  return o;
}
