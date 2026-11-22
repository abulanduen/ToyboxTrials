/**
 * Toybox Siege rules core: a five-minute horde survival on one board per player.
 *
 * Deterministic and seeded (one mulberry32 stream in the state), stepped at a fixed 60 Hz by the
 * shared host. No DOM, no three.js, no wall-clock time: the same code can run on a game server.
 * The state is plain JSON (no Maps, no typed arrays, no class instances), so it serialises as is.
 *
 * Performance: every entity lives in a pool allocated once at init and recycled through an `on`
 * flag, so a step allocates nothing except the occasional event or level-up card. Collisions use
 * a uniform spatial hash rebuilt per board per step from scratch typed arrays that live outside
 * the state (they are derived data, so determinism and serialisation are unaffected).
 *
 * Time: `t` counts the whole match, `runT` the run after every toy has picked a class (the
 * clock players see). Each board also has its own clock `bt`, which stands still while that
 * player is choosing a card or deciding whether to revive: the board freezes, the run clock
 * (elites, the boss, the 5:00 cut-off) does not. `arenaT` counts the final arena.
 *
 * Phases: `pick` (class cards) → `run` (one board per toy; a toy that slays the boss, or is still
 * standing at 5:00, moves to its `prep` window) → `arena` (every toy still in, on one shared
 * board, `s.arena`) → `over`. See FINALE in config.ts and the README.
 */
import type { Contestant, MatchEvent, Placement, RulesCore } from '../types';
import {
  ARENA_HALF, AURA, BASE_PICKUP, BIGS, BOILER, BOSS_AT, BOSS_SUMMON_AT, BOSS_SUMMON_COUNT, CLASSES, CLASS_IDS, DEFAULT_CONFIG, ELITE_SCHEDULE, FINALE, HORN, HORN_MAX, overtime,
  MAX_LEVEL, MAX_PASSIVES, MAX_WEAPONS, MOBS, PASSIVE_IDS, PASSIVE_PER_LEVEL, PLAYER_RADIUS, POINTS, RANGER, SENT_GEM_XP, SENT_HP, SKY, SNACK_CHANCE,
  SNACK_HEAL, SPAWN_DIST, WAVE_MS, WEAPONS, WEAPON_IDS, dmgScale, hpScale, reviveCost, sentEliteFor, spawnRate, waveSize, xpToNext,
  type BigId, type ClassId, type EvoId, type PassiveId, type SiegeConfig, type WeaponId, type WeaponStats,
} from './config';

export * from './config';

// ---------------------------------------------------------------- state

export interface Mob { on: boolean; serial: number; kind: number; x: number; z: number; vx: number; vz: number; kx: number; kz: number;
  hp: number; maxHp: number; speed: number; dmg: number; r: number; xp: number; pts: number; hurt: number; yo: number; timer: number }
export interface Big { on: boolean; serial: number; type: BigId; x: number; z: number; hp: number; maxHp: number; r: number; speed: number; dmg: number; xp: number; pts: number;
  sent: boolean; from: string | null; mode: 0 | 1 | 2; modeT: number; dashT: number; ringT: number; summonT: number; aimX: number; aimZ: number; hurt: number; yo: number; summons: number }
/**
 * Player projectiles. kind 0 = cork, 1 = paper plane, 2 = Boiler Heart rivet. `own`: the shooter's player index in
 * the arena (−1 on a board). `homing` > 0: a Pop-Gun cork that flies straight at its target `ti` (on a board a mob
 * index, or −2 − i for elite i; in the arena a rival's player index j, or −2 − i for summoned boss i; −1 none), whose
 * hit id is `ts` (a mob's or boss's serial, or −(j + 1) for rival toy j). After each hit it picks the nearest foe
 * within RANGER.hop that it has not hit (`hits`, `nh`), until its `pierce` runs out.
 */
export interface Proj { on: boolean; kind: number; x: number; z: number; vx: number; vz: number; r: number; dmg: number; pierce: number; life: number;
  ox: number; oz: number; range: number; back: boolean; hits: number[]; nh: number; own: number; homing: number; ti: number; ts: number }
/** Enemy bullets (in the arena: a summoned boss's, `own` = its owner's player index). */
export interface Shot { on: boolean; x: number; z: number; vx: number; vz: number; r: number; dmg: number; life: number; own: number }
/** kind 0 = experience gem, 1 = biscuit (heals). */
export interface Gem { on: boolean; kind: number; x: number; z: number; v: number; pull: boolean }
export interface Chest { on: boolean; x: number; z: number }
/**
 * Area hits. kind 0 sweep (instant), 2 marble (falls), 3 revive shockwave, 6 Thunderhead sky strike (instant, radius `r`).
 * `age` counts up, damage lands at `delay`. Kinds 4 (a Prism Ray beam) and 5 (a Chain Lightning leap) are looks only,
 * born `done` (their chain did its damage at once): a segment from (x, z) along `ang`, `r` long, `w` half-wide.
 */
export interface Blast { on: boolean; kind: number; x: number; z: number; r: number; ang: number; arc: number; delay: number; age: number; life: number; dmg: number; knock: number; done: boolean; own: number; w: number }

export interface Board {
  bt: number;
  mobs: Mob[]; bigs: Big[]; projs: Proj[]; shots: Shot[]; gems: Gem[]; chests: Chest[]; blasts: Blast[];
  spawnAcc: number; waveT: number; nextElite: number; bossUp: boolean; bossDown: boolean; serial: number; gemCursor: number;
}

export interface WeaponSlot { id: WeaponId; level: number; evolved: boolean; cd: number; aux: number }
export interface PassiveSlot { id: PassiveId; level: number }

export type Option =
  | { kind: 'weapon'; id: WeaponId; level: number }
  | { kind: 'passive'; id: PassiveId; level: number }
  | { kind: 'horn'; level: number }
  | { kind: 'evolve'; id: EvoId }
  | { kind: 'bundle'; items: ({ kind: 'weapon'; id: WeaponId } | { kind: 'passive'; id: PassiveId })[] }
  | { kind: 'heal' }
  | { kind: 'send' };
export interface Choice { kind: 'level' | 'treasure'; options: Option[]; at: number }

export interface Stats { maxHp: number; armour: number; speed: number; dmg: number; cd: number; area: number; projSpeed: number; pickup: number; xp: number }
/**
 * picking → alive (the run) ⇄ downed → ghost (out). A toy that slays the boss, or is still standing
 * at 5:00, goes to `prep` (a cleared board, cards only), then to `arena` when the arena opens.
 * Knocked out of the arena: ghost again (with `inArena` set).
 */
export type Status = 'picking' | 'alive' | 'downed' | 'ghost' | 'prep' | 'arena';

export interface SiegePlayer {
  id: string;
  cls: ClassId | null;
  status: Status;
  x: number; z: number; fx: number; fz: number;
  /** Latched move input: ax right, ay forward (screen up). */
  ax: number; ay: number;
  hp: number; stat: Stats;
  level: number; xp: number; xpNext: number;
  kills: number; points: number; elites: number;
  weapons: WeaponSlot[]; passives: PassiveSlot[];
  /** The Rally Horn: its level (1–3) and when it is next ready; `evolved` = the Boiler Heart, which fires a ring every BOILER.cd (`cd` counts down; `aux` turns the ring). */
  horn: { level: number; readyAt: number; evolved: boolean; cd: number; aux: number } | null;
  choice: Choice | null; pendingLevels: number; pendingChests: number;
  /** Board time until which hits are ignored. */
  invuln: number;
  downedAt: number; revived: boolean;
  /** Run time at which this toy was knocked out of the run (-1 if never); run time it slew the boss (-1 if never). */
  outAt: number; victoryAt: number;
  /** Run time when the prep window's cards are settled (-1 before prep). */
  prepUntil: number;
  /** Took part in the final arena; arena time it was knocked out there (-1 = still standing); rivals it knocked out. */
  inArena: boolean; arenaOutAt: number; arenaKOs: number;
  /** Arena: who hit this toy last (credited with the knockout), and when it last sounded hurt. */
  lastHitBy: string | null; hurtAt: number;
  /** Preferred target for sent elites (null = the leader). */
  target: string | null;
  sendReadyAt: number; protectedUntil: number;
  /** Elites on their way to this board (from = sender id, at = run time of arrival). */
  incoming: { from: string; at: number }[];
  /** Spectating (only once the player chooses to, as a ghost or while waiting for the arena): whose board (null = your own), and the ghost's offset from that toy. */
  watching: string | null; gx: number; gz: number;
  board: Board;
}

export interface SiegeState {
  kind: 'toybox-siege';
  seed: number; rng: number;
  phase: 'pick' | 'run' | 'arena' | 'over';
  t: number; runT: number; arenaT: number;
  /** The final arena: one shared board (no swarm, no gems), null until it opens. */
  arena: Board | null;
  /** Arena yo-yo hit gaps per (attacker, victim) pair: arena time of the last hit, index attacker × players + victim. */
  arenaYo: number[];
  config: SiegeConfig;
  players: SiegePlayer[];
  events: MatchEvent[];
}

export type SiegeInput =
  | { type: 'move'; x: number; y: number }
  | { type: 'class'; cls: ClassId }
  | { type: 'choose'; index: number; target?: string | null }
  | { type: 'skill'; target?: string | null }
  | { type: 'target'; id: string | null }
  | { type: 'revive' }
  | { type: 'giveup' }
  | { type: 'watch'; dir: 1 | -1; id?: string }
  /** Out (or waiting for the arena): start watching other boards, or go back to your own. */
  | { type: 'spectate'; on: boolean };

// ---------------------------------------------------------------- helpers

/** mulberry32 on the state's own counter. */
export function rand(s: SiegeState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** Math.hypot is slow in hot loops; every call here has two arguments. */
export const len = (x: number, z: number) => Math.sqrt(x * x + z * z);
const emit = (s: SiegeState, e: MatchEvent) => { if (s.events.length < 256) s.events.push(e); };

const blankStats = (): Stats => ({ maxHp: 100, armour: 0, speed: 10, dmg: 1, cd: 1, area: 1, projSpeed: 1, pickup: BASE_PICKUP, xp: 1 });

/**
 * The placeholder for pooled number fields that will hold fractions (positions, speeds, health,
 * timers). It is a fraction itself on purpose: V8 then stores those fields as doubles from the
 * start. Created as whole numbers (0), each field's representation is generalised the first time a
 * pooled entity is used, which deprecates the shared hidden class, and code reading the pools (the
 * bots' steering most of all) fell into an optimise/deoptimise loop that allocated ~30 KB per step.
 * Its value never matters: a pooled entity is only read while `on`, after being set.
 */
const D = 0.5;

function newBoard(c: Pick<SiegeConfig, 'mobCap' | 'bigCap' | 'projectileCap' | 'shotCap' | 'gemCap' | 'chestCap' | 'blastCap'>): Board {
  const n = <T>(k: number, f: () => T) => Array.from({ length: k }, f);
  return {
    bt: 0,
    mobs: n(c.mobCap, () => ({ on: false, serial: 0, kind: 0, x: D, z: D, vx: D, vz: D, kx: D, kz: D, hp: D, maxHp: D, speed: D, dmg: D, r: D, xp: 0, pts: 0, hurt: -1e9 - D, yo: -1e9 - D, timer: D })),
    bigs: n(c.bigCap, () => ({ on: false, serial: 0, type: 'bear' as BigId, x: D, z: D, hp: D, maxHp: D, r: D, speed: D, dmg: D, xp: 0, pts: 0, sent: false, from: null as string | null,
      mode: 0 as 0 | 1 | 2, modeT: D, dashT: D, ringT: D, summonT: D, aimX: D, aimZ: D, hurt: -1e9 - D, yo: -1e9 - D, summons: 0 })),
    projs: n(c.projectileCap, () => ({ on: false, kind: 0, x: D, z: D, vx: D, vz: D, r: D, dmg: D, pierce: 0, life: D, ox: D, oz: D, range: D, back: false, hits: [0, 0, 0, 0, 0, 0, 0, 0], nh: 0, own: -1, homing: D, ti: -1, ts: 0 })),
    shots: n(c.shotCap, () => ({ on: false, x: D, z: D, vx: D, vz: D, r: D, dmg: D, life: D, own: -1 })),
    gems: n(c.gemCap, () => ({ on: false, kind: 0, x: D, z: D, v: 0, pull: false })),
    chests: n(c.chestCap, () => ({ on: false, x: D, z: D })),
    blasts: n(c.blastCap, () => ({ on: false, kind: 0, x: D, z: D, r: D, ang: D, arc: D, delay: D, age: D, life: D, dmg: D, knock: D, done: false, own: -1, w: D })),
    spawnAcc: 0, waveT: WAVE_MS, nextElite: 0, bossUp: false, bossDown: false, serial: 0, gemCursor: 0,
  };
}

export const weaponStats = (slot: WeaponSlot): WeaponStats => (slot.evolved ? WEAPONS[slot.id].evolved : WEAPONS[slot.id].levels[slot.level - 1]);
export const passiveLevel = (p: SiegePlayer, id: PassiveId) => p.passives.find((x) => x.id === id)?.level ?? 0;
/**
 * The secret upgrade (evolution) a player qualifies for: a weapon at level 5, not yet evolved, with its partner
 * passive owned; else a Rally Horn at its top level (3), not yet the Boiler Heart. Weapons come first.
 */
export function evolutionReady(p: SiegePlayer): EvoId | null {
  for (const w of p.weapons) if (!w.evolved && w.level >= MAX_LEVEL && passiveLevel(p, WEAPONS[w.id].partner) > 0) return w.id;
  if (p.horn && !p.horn.evolved && p.horn.level >= HORN_MAX) return 'horn';
  return null;
}

export function recomputeStats(p: SiegePlayer) {
  if (!p.cls) return;
  const c = CLASSES[p.cls], L = (id: PassiveId) => passiveLevel(p, id), k = PASSIVE_PER_LEVEL, st = p.stat;
  const before = st.maxHp;
  st.maxHp = c.hp + k.hp * L('plating');
  st.armour = c.armour + k.armour * L('plating');
  st.speed = c.speed * (1 + k.speed * L('gears'));
  st.projSpeed = 1 + k.projSpeed * L('gears');
  st.dmg = 1 + k.dmg * L('crayon');
  st.cd = c.cdMul * (1 - k.cd * L('mainspring'));
  st.area = c.areaMul * (1 + k.area * L('magnifier'));
  st.pickup = BASE_PICKUP * c.pickupMul * (1 + k.pickup * L('magnet'));
  st.xp = 1 + k.xp * L('magnet');
  if (st.maxHp > before && p.hp > 0) p.hp += st.maxHp - before;
  p.hp = Math.min(p.hp, st.maxHp);
}

const playerById = (s: SiegeState, id: string | null | undefined) => (id ? s.players.find((p) => p.id === id) : undefined);

// ---------------------------------------------------------------- sending elites

/** Why `from` cannot send an elite to `to` right now (null = it can). */
export function sendBlock(s: SiegeState, from: SiegePlayer, to: SiegePlayer | undefined): 'self' | 'out' | 'cooldown' | 'protected' | 'full' | null {
  if (!to || to === from) return 'self';
  if (to.status !== 'alive' && to.status !== 'downed') return 'out';
  if (s.runT < from.sendReadyAt) return 'cooldown';
  if (s.runT < to.protectedUntil) return 'protected';
  const alive = to.board.bigs.reduce((n, b) => n + (b.on && b.sent ? 1 : 0), 0);
  if (alive + to.incoming.length >= s.config.maxSentAlive) return 'full';
  return null;
}
/** Rivals still in, best first: most points, then level, then id. */
export function standings(s: SiegeState, except?: SiegePlayer): SiegePlayer[] {
  return s.players.filter((p) => p !== except && (p.status === 'alive' || p.status === 'downed')).sort((a, b) => b.points - a.points || b.level - a.level || (a.id < b.id ? -1 : 1));
}
/** Where an elite from `from` would go: their chosen target if it can take one, else the best-placed rival that can. */
export function sendTarget(s: SiegeState, from: SiegePlayer, wanted?: string | null): SiegePlayer | undefined {
  const pick = playerById(s, wanted ?? from.target);
  if (pick && !sendBlock(s, from, pick)) return pick;
  return standings(s, from).find((p) => !sendBlock(s, from, p));
}
function trySend(s: SiegeState, from: SiegePlayer, wanted: string | null | undefined): boolean {
  const to = sendTarget(s, from, wanted);
  if (!to) {
    const reason = s.runT < from.sendReadyAt ? 'cooldown' : 'no-target';
    emit(s, { type: 'siege-send-blocked', id: from.id, reason });
    return false;
  }
  to.incoming.push({ from: from.id, at: s.runT + s.config.sendWarnMs });
  to.protectedUntil = s.runT + s.config.receiveCooldownMs;
  from.sendReadyAt = s.runT + s.config.sendCooldownMs;
  emit(s, { type: 'siege-sent', id: from.id, to: to.id, at: s.runT + s.config.sendWarnMs });
  return true;
}

// ---------------------------------------------------------------- init

function makePlayer(c: Contestant, config: SiegeConfig): SiegePlayer {
  return {
    id: c.id, cls: null, status: 'picking', x: 0, z: 0, fx: 0, fz: 1, ax: 0, ay: 0,
    hp: 100, stat: blankStats(), level: 1, xp: 0, xpNext: xpToNext(1), kills: 0, points: 0, elites: 0,
    weapons: [], passives: [], horn: null, choice: null, pendingLevels: 0, pendingChests: 0, invuln: 0,
    downedAt: -1, revived: false, outAt: -1, victoryAt: -1, prepUntil: -1, inArena: false, arenaOutAt: -1, arenaKOs: 0, lastHitBy: null, hurtAt: -1e9, target: null, sendReadyAt: 0, protectedUntil: 0, incoming: [],
    watching: null, gx: 0, gz: 0, board: newBoard(config),
  };
}

function pickClass(s: SiegeState, p: SiegePlayer, cls: ClassId) {
  if (p.cls || s.phase !== 'pick' || !CLASSES[cls]) return;
  p.cls = cls; p.status = 'alive';
  p.weapons.push({ id: CLASSES[cls].weapon, level: 1, evolved: false, cd: 400, aux: 0 });
  p.stat = blankStats(); p.hp = 1; recomputeStats(p); p.hp = p.stat.maxHp;
  emit(s, { type: 'siege-class', id: p.id, cls });
  if (s.players.every((q) => q.cls)) { s.phase = 'run'; s.runT = 0; emit(s, { type: 'siege-start' }); }
}

// ---------------------------------------------------------------- spatial hash (scratch, not state)

const CELL = 4;
const GRID = Math.ceil((ARENA_HALF * 2 + 8) / CELL);
const ORIGIN = ARENA_HALF + 4;
const head = new Int32Array(GRID * GRID);
let next = new Int32Array(256);
let near = new Int32Array(1024);
const cellOf = (v: number) => clamp(Math.floor((v + ORIGIN) / CELL), 0, GRID - 1);
function buildHash(mobs: Mob[]) {
  if (next.length < mobs.length) next = new Int32Array(mobs.length);
  head.fill(-1);
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (!m.on) continue;
    const c = cellOf(m.z) * GRID + cellOf(m.x);
    next[i] = head[c]; head[c] = i;
  }
}
/** Live mobs whose centre may be within `r` of (x, z): fills `near`, returns the count. */
function query(mobs: Mob[], x: number, z: number, r: number): number {
  const x0 = cellOf(x - r), x1 = cellOf(x + r), z0 = cellOf(z - r), z1 = cellOf(z + r);
  let n = 0;
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
    for (let i = head[cz * GRID + cx]; i >= 0; i = next[i]) {
      if (!mobs[i].on) continue;
      if (n >= near.length) { const grown = new Int32Array(near.length * 2); grown.set(near); near = grown; }
      near[n++] = i;
    }
  }
  return n;
}
/** The hash dimensions, so a unit test can check the grid covers the board. */
export const HASH = { CELL, GRID, ORIGIN };

// ---------------------------------------------------------------- spawning

function spawnPoint(s: SiegeState, p: SiegePlayer, out: { x: number; z: number }) {
  for (let tries = 0; tries < 3; tries++) {
    const a = rand(s) * Math.PI * 2, d = SPAWN_DIST[0] + rand(s) * (SPAWN_DIST[1] - SPAWN_DIST[0]);
    const x = clamp(p.x + Math.cos(a) * d, -ARENA_HALF + 1, ARENA_HALF - 1), z = clamp(p.z + Math.sin(a) * d, -ARENA_HALF + 1, ARENA_HALF - 1);
    out.x = x; out.z = z;
    if (len(x - p.x, z - p.z) >= 16) return;
  }
}
const spot = { x: 0, z: 0 };

function freeMob(b: Board): Mob | null {
  const list = b.mobs;
  for (let i = 0; i < list.length; i++) if (!list[i].on) return list[i];
  return null;
}
/** A free enemy bullet, or null (indexed loop: hot paths avoid iterators and closures). */
function freeShot(b: Board): Shot | null {
  const list = b.shots;
  for (let i = 0; i < list.length; i++) if (!list[i].on) return list[i];
  return null;
}
export function spawnMob(s: SiegeState, p: SiegePlayer, kind: number, x: number, z: number): Mob | null {
  const b = p.board, m = freeMob(b);
  if (!m) return null;
  const d = MOBS[kind], k = hpScale(s.runT);
  m.on = true; m.serial = ++b.serial; m.kind = kind; m.x = x; m.z = z; m.vx = 0; m.vz = 0; m.kx = 0; m.kz = 0;
  m.hp = m.maxHp = d.hp * k; m.speed = d.speed * (0.92 + rand(s) * 0.16); m.dmg = d.dmg * dmgScale(s.runT); m.r = d.r; m.xp = d.xp; m.pts = d.pts;
  m.hurt = -1e9; m.yo = -1e9; m.timer = rand(s) * 600;
  return m;
}
function rollKind(s: SiegeState): number {
  let total = 0;
  for (const d of MOBS) if (s.runT >= d.from) total += d.weight(s.runT);
  let r = rand(s) * total;
  for (let i = 0; i < MOBS.length; i++) {
    if (s.runT < MOBS[i].from) continue;
    r -= MOBS[i].weight(s.runT);
    if (r <= 0) return i;
  }
  return 0;
}
export function spawnBig(s: SiegeState, p: SiegePlayer, type: BigId, sent: boolean, from: string | null): Big | null {
  const b = p.board, g = b.bigs.find((x) => !x.on);
  if (!g) return null;
  // The last free slot is kept for the boss until it has been beaten, so a crowd of elites can delay
  // later elites (they queue) but never the boss.
  if (type !== 'baron' && !b.bossDown && b.bigs.reduce((n, x) => n + (x.on ? 0 : 1), 0) <= 1) return null;
  const d = BIGS[type];
  spawnPoint(s, p, spot);
  g.on = true; g.serial = ++b.serial; g.type = type; g.x = spot.x; g.z = spot.z;
  g.hp = g.maxHp = d.hp * (sent ? SENT_HP : 1); g.r = d.r; g.speed = d.speed; g.dmg = d.dmg; g.xp = sent ? SENT_GEM_XP : d.xp; g.pts = d.pts;
  g.sent = sent; g.from = from; g.mode = 0; g.modeT = 0; g.dashT = d.dashEvery * 0.6; g.ringT = d.ringEvery * 0.5; g.summonT = d.summonEvery;
  g.aimX = 0; g.aimZ = 1; g.hurt = -1e9; g.yo = -1e9; g.summons = 0;
  emit(s, type === 'baron' ? { type: 'siege-boss', id: p.id } : { type: 'siege-elite', id: p.id, elite: type, sent, from });
  return g;
}

// ---------------------------------------------------------------- damage

function dropGem(b: Board, cap: number, kind: number, x: number, z: number, v: number) {
  const gems = b.gems;
  for (let i = 0; i < gems.length; i++) { const g = gems[i]; if (!g.on) { g.on = true; g.kind = kind; g.x = x; g.z = z; g.v = v; g.pull = false; return; } }
  // Full: fold the value into an existing gem (round robin), so experience is never lost.
  b.gemCursor = (b.gemCursor + 1) % cap;
  const g = b.gems[b.gemCursor];
  if (g.kind === 0 && kind === 0) g.v += v;
}

function killMob(s: SiegeState, p: SiegePlayer, m: Mob) {
  m.on = false;
  p.kills++; p.points += m.pts;
  const b = p.board;
  if (rand(s) < SNACK_CHANCE) dropGem(b, s.config.gemCap, 1, m.x, m.z, 0);
  else dropGem(b, s.config.gemCap, 0, m.x, m.z, m.xp);
}
function hitMob(s: SiegeState, p: SiegePlayer, m: Mob, dmg: number, kx: number, kz: number, knock: number) {
  if (!m.on) return;
  m.hp -= dmg; m.hurt = p.board.bt;
  if (knock > 0) { m.kx += kx * knock; m.kz += kz * knock; }
  if (m.hp <= 0) killMob(s, p, m);
}
function hitBig(s: SiegeState, p: SiegePlayer, g: Big, dmg: number) {
  if (!g.on) return;
  g.hp -= dmg; g.hurt = p.board.bt;
  if (g.type === 'baron') {
    while (g.summons < BOSS_SUMMON_AT.length && g.hp > 0 && g.hp <= g.maxHp * BOSS_SUMMON_AT[g.summons]) {
      g.summons++;
      for (let i = 0; i < BOSS_SUMMON_COUNT; i++) { const a = (i / BOSS_SUMMON_COUNT) * Math.PI * 2; spawnMob(s, p, 1, clamp(g.x + Math.cos(a) * 5, -ARENA_HALF, ARENA_HALF), clamp(g.z + Math.sin(a) * 5, -ARENA_HALF, ARENA_HALF)); }
      emit(s, { type: 'siege-boss-summon', id: p.id });
    }
  }
  if (g.hp > 0) return;
  g.on = false;
  p.points += g.pts;
  const b = p.board;
  if (g.type === 'baron') {
    b.bossDown = true;
    p.victoryAt = s.runT; p.points += POINTS.victory;
    emit(s, { type: 'siege-victory', id: p.id });
    enterPrep(s, p, FINALE.bossChests, g.x, g.z);
    return;
  }
  p.elites++;
  if (g.sent) dropGem(b, s.config.gemCap, 0, g.x, g.z, g.xp);
  else {
    const c = b.chests.find((x) => !x.on);
    if (c) { c.on = true; c.x = g.x; c.z = g.z; } else p.pendingChests++;
    dropGem(b, s.config.gemCap, 0, g.x, g.z, g.xp);
  }
  emit(s, { type: 'siege-elite-down', id: p.id, elite: g.type, sent: g.sent });
}

function hurtPlayer(s: SiegeState, p: SiegePlayer, dmg: number) {
  const b = p.board;
  if (p.status !== 'alive' || b.bt < p.invuln) return;
  p.hp -= Math.max(1, dmg - p.stat.armour);
  p.invuln = b.bt + 400;
  emit(s, { type: 'siege-hurt', id: p.id });
  if (p.hp > 0) return;
  p.hp = 0; p.choice = null;
  if (!p.revived && p.points >= reviveCost(s.runT)) {
    p.status = 'downed'; p.downedAt = s.runT;
    emit(s, { type: 'siege-downed', id: p.id, cost: reviveCost(s.runT) });
  } else becomeGhost(s, p);
}

/** Out of the run for good. The ghost stays on its own board until its player chooses to watch the others. */
function becomeGhost(s: SiegeState, p: SiegePlayer) {
  p.status = 'ghost'; p.outAt = s.runT; p.choice = null; p.incoming.length = 0; p.gx = 0; p.gz = 0;
  p.watching = null;
  emit(s, { type: 'siege-ghost', id: p.id });
}
const stillIn = (q: SiegePlayer) => q.status === 'alive' || q.status === 'downed' || q.status === 'prep' || q.status === 'arena';
/** Who a spectator watches first: in the arena the best-placed fighter, else the leader still in (or anyone, once nobody is). */
function defaultWatch(s: SiegeState, p: SiegePlayer): string | null {
  const pool = s.players.filter((q) => q !== p && (s.phase === 'arena' ? q.status === 'arena' : stillIn(q)));
  pool.sort((a, b) => b.points - a.points || b.level - a.level || (a.id < b.id ? -1 : 1));
  return pool[0]?.id ?? s.players.find((q) => q !== p)?.id ?? null;
}

function revive(s: SiegeState, p: SiegePlayer) {
  const cost = reviveCost(s.runT);
  if (p.status !== 'downed' || p.revived || p.points < cost) return;
  p.points -= cost; p.revived = true; p.status = 'alive'; p.hp = Math.round(p.stat.maxHp * 0.6);
  p.invuln = p.board.bt + 2500;
  addBlast(p.board, 3, p.x, p.z, 10, 0, 360, 0, 500, 40, 18);
  emit(s, { type: 'siege-revive', id: p.id, cost });
}

// ---------------------------------------------------------------- level-ups and treasure

function owned(p: SiegePlayer, id: WeaponId) { return p.weapons.find((w) => w.id === id); }

/** Up to three upgrade cards (plus the Rally Horn as a fourth, sometimes). Never empty. */
export function levelOptions(s: SiegeState, p: SiegePlayer): Option[] {
  const pool: { o: Option; w: number }[] = [];
  for (const id of WEAPON_IDS) {
    const have = owned(p, id);
    if (have) { if (!have.evolved && have.level < MAX_LEVEL) pool.push({ o: { kind: 'weapon', id, level: have.level + 1 }, w: 3 }); }
    else if (p.weapons.length < MAX_WEAPONS) pool.push({ o: { kind: 'weapon', id, level: 1 }, w: 2 });
  }
  for (const id of PASSIVE_IDS) {
    const lv = passiveLevel(p, id);
    if (lv) { if (lv < MAX_LEVEL) pool.push({ o: { kind: 'passive', id, level: lv + 1 }, w: 2.5 }); }
    else if (p.passives.length < MAX_PASSIVES) pool.push({ o: { kind: 'passive', id, level: 1 }, w: 2 });
  }
  const out: Option[] = [];
  while (out.length < 3 && pool.length) {
    let total = 0;
    for (const e of pool) total += e.w;
    let r = rand(s) * total, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
    out.push(pool.splice(i, 1)[0].o);
  }
  if (!out.length) out.push({ kind: 'heal' });
  const hornLevel = p.horn?.level ?? 0;
  if (hornLevel < HORN_MAX && p.level >= HORN.offerFromLevel && s.players.length > 1 && rand(s) < HORN.offerChance) out.push({ kind: 'horn', level: hornLevel + 1 });
  return out;
}

/** A treasure chest: the evolution if one is ready, otherwise +1 level to up to two owned items. */
export function treasureOptions(s: SiegeState, p: SiegePlayer): Option[] {
  const evo = evolutionReady(p);
  let first: Option;
  if (evo) first = { kind: 'evolve', id: evo };
  else {
    const can: ({ kind: 'weapon'; id: WeaponId } | { kind: 'passive'; id: PassiveId })[] = [
      ...p.weapons.filter((w) => !w.evolved && w.level < MAX_LEVEL).map((w) => ({ kind: 'weapon' as const, id: w.id })),
      ...p.passives.filter((x) => x.level < MAX_LEVEL).map((x) => ({ kind: 'passive' as const, id: x.id })),
    ];
    const items: typeof can = [];
    while (items.length < 2 && can.length) items.push(can.splice(Math.floor(rand(s) * can.length), 1)[0]);
    first = items.length ? { kind: 'bundle', items } : { kind: 'heal' };
  }
  // Skipping a chest to send an elite only makes sense mid-run (not for the boss's chests).
  return s.players.length > 1 && p.status === 'alive' ? [first, { kind: 'send' }] : [first];
}

function addWeapon(p: SiegePlayer, id: WeaponId) {
  const have = owned(p, id);
  if (have) { if (!have.evolved && have.level < MAX_LEVEL) have.level++; }
  else if (p.weapons.length < MAX_WEAPONS) p.weapons.push({ id, level: 1, evolved: false, cd: 200, aux: 0 });
}
function addPassive(p: SiegePlayer, id: PassiveId) {
  const have = p.passives.find((x) => x.id === id);
  if (have) { if (have.level < MAX_LEVEL) have.level++; }
  else if (p.passives.length < MAX_PASSIVES) p.passives.push({ id, level: 1 });
  recomputeStats(p);
}

function applyOption(s: SiegeState, p: SiegePlayer, o: Option, target: string | null | undefined): boolean {
  switch (o.kind) {
    case 'weapon': addWeapon(p, o.id); emit(s, { type: 'siege-upgrade', id: p.id, item: o.id }); return true;
    case 'passive': addPassive(p, o.id); emit(s, { type: 'siege-upgrade', id: p.id, item: o.id }); return true;
    case 'horn':
      if (!p.horn) p.horn = { level: 1, readyAt: s.runT + HORN.firstReadyMs, evolved: false, cd: 0, aux: 0 };
      else if (p.horn.level < HORN_MAX) p.horn.level++;
      emit(s, { type: 'siege-upgrade', id: p.id, item: 'horn' }); return true;
    case 'evolve': {
      if (o.id === 'horn') {
        if (p.horn && p.horn.level >= HORN_MAX && !p.horn.evolved) { p.horn.evolved = true; p.horn.cd = 400; p.horn.aux = 0; emit(s, { type: 'siege-evolve', id: p.id, weapon: 'horn' }); }
        return true;
      }
      const w = owned(p, o.id);
      if (w && w.level >= MAX_LEVEL) { w.evolved = true; emit(s, { type: 'siege-evolve', id: p.id, weapon: o.id }); }
      return true;
    }
    case 'bundle': for (const it of o.items) it.kind === 'weapon' ? addWeapon(p, it.id) : addPassive(p, it.id); emit(s, { type: 'siege-treasure', id: p.id }); return true;
    case 'heal': p.hp = p.stat.maxHp; p.points += 50; return true;
    case 'send': return trySend(s, p, target);
  }
}

function choose(s: SiegeState, p: SiegePlayer, index: number, target: string | null | undefined) {
  const c = p.choice;
  if (!c || (p.status !== 'alive' && p.status !== 'prep')) return;
  const o = c.options[index];
  if (!o) return;
  if (!applyOption(s, p, o, target)) return; // a blocked send keeps the card open
  if (c.kind === 'level') p.pendingLevels = Math.max(0, p.pendingLevels - 1);
  else p.pendingChests = Math.max(0, p.pendingChests - 1);
  p.choice = null;
  openChoice(s, p);
}
function openChoice(s: SiegeState, p: SiegePlayer) {
  if (p.choice || (p.status !== 'alive' && p.status !== 'prep')) return;
  if (p.pendingLevels > 0) p.choice = { kind: 'level', options: levelOptions(s, p), at: s.t };
  else if (p.pendingChests > 0) { p.choice = { kind: 'treasure', options: treasureOptions(s, p), at: s.t }; emit(s, { type: 'siege-chest', id: p.id }); }
  if (p.choice) emit(s, { type: 'siege-choice', id: p.id, kind: p.choice.kind });
}

function gainXp(s: SiegeState, p: SiegePlayer, v: number) {
  p.xp += v * p.stat.xp;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext; p.level++; p.xpNext = xpToNext(p.level); p.pendingLevels++; p.points += POINTS.levelUp;
    emit(s, { type: 'siege-level', id: p.id, level: p.level });
  }
}

// ---------------------------------------------------------------- weapons

function addBlast(b: Board, kind: number, x: number, z: number, r: number, ang: number, arc: number, delay: number, life: number, dmg: number, knock: number, own = -1) {
  const list = b.blasts;
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (k.on) continue;
    k.on = true; k.kind = kind; k.x = x; k.z = z; k.r = r; k.ang = ang; k.arc = arc; k.delay = delay; k.age = 0; k.life = life; k.dmg = dmg; k.knock = knock; k.done = false; k.own = own; k.w = 0;
    return k;
  }
  return null;
}
function addProj(b: Board, kind: number, x: number, z: number, vx: number, vz: number, r: number, dmg: number, pierce: number, life: number, range: number, own = -1) {
  const list = b.projs;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (q.on) continue;
    q.on = true; q.kind = kind; q.x = x; q.z = z; q.vx = vx; q.vz = vz; q.r = r; q.dmg = dmg; q.pierce = pierce; q.life = life; q.ox = x; q.oz = z; q.range = range; q.back = false; q.nh = 0; q.own = own;
    q.homing = 0; q.ti = -1; q.ts = 0;
    return q;
  }
  return null;
}

/** Nearest live enemy (mob or elite/boss) within `range`, as a direction; false if none. */
const aim = { x: 0, z: 0, d: 0 };
function nearestEnemy(p: SiegePlayer, range: number): boolean {
  const b = p.board;
  let best = range * range, found = false;
  for (let i = 0; i < b.bigs.length; i++) { const g = b.bigs[i]; if (g.on) { const d = (g.x - p.x) ** 2 + (g.z - p.z) ** 2; if (d < best) { best = d; aim.x = g.x; aim.z = g.z; found = true; } } }
  const n = query(b.mobs, p.x, p.z, range);
  for (let k = 0; k < n; k++) { const m = b.mobs[near[k]]; const d = (m.x - p.x) ** 2 + (m.z - p.z) ** 2; if (d < best) { best = d; aim.x = m.x; aim.z = m.z; found = true; } }
  aim.d = Math.sqrt(best);
  return found;
}
/** A random enemy position within `range` (bigs count), or false. */
function randomEnemy(s: SiegeState, p: SiegePlayer, range: number): boolean {
  const b = p.board, n = query(b.mobs, p.x, p.z, range);
  let live = 0;
  for (let i = 0; i < b.bigs.length; i++) { const g = b.bigs[i]; if (g.on && len(g.x - p.x, g.z - p.z) <= range) live++; }
  let inRange = 0;
  for (let k = 0; k < n; k++) { const m = b.mobs[near[k]]; if ((m.x - p.x) ** 2 + (m.z - p.z) ** 2 <= range * range) near[inRange++] = near[k]; }
  const total = inRange + live;
  if (!total) return false;
  let pick = Math.floor(rand(s) * total);
  if (pick < inRange) { const m = b.mobs[near[pick]]; aim.x = m.x; aim.z = m.z; return true; }
  pick -= inRange;
  for (let i = 0; i < b.bigs.length; i++) { const g = b.bigs[i]; if (g.on && len(g.x - p.x, g.z - p.z) <= range) { if (pick-- === 0) { aim.x = g.x; aim.z = g.z; return true; } } }
  return false;
}

/** Nearest / a random enemy (on a board) or rival (in the arena, `own` ≥ 0) within `range`: sets `aim`. */
const nearestFoe = (s: SiegeState, p: SiegePlayer, range: number, own: number) => (own < 0 ? nearestEnemy(p, range) : foeNearest(s, p, range));
const randomFoe = (s: SiegeState, p: SiegePlayer, range: number, own: number) => (own < 0 ? randomEnemy(s, p, range) : foeRandom(s, p, range));
/** How long a Chain Lightning leap stays on screen (ms). */
export const BOLT_LIFE = 220;

// ---------------------------------------------------------------- targeting: the nearest few, and instant chains

/**
 * The foes found by `nearestFoes`, nearest first (scratch, not state): `tId` a target id (on a board a mob index, or
 * −2 − i for elite i; in the arena a rival's player index, or −2 − i for summoned boss i), `tS` its hit id (a serial,
 * or −(j + 1) for rival toy j), `tX`/`tZ` where it stands. Ties keep the scan order, which is deterministic.
 */
const TMAX = 16;
const tId = new Int32Array(TMAX), tS = new Int32Array(TMAX), tD = new Float64Array(TMAX), tX = new Float64Array(TMAX), tZ = new Float64Array(TMAX);
let tN = 0;
/** Keep (id, d²) if it is among the `k` nearest so far (insertion into the short sorted list). */
function offerFoe(id: number, hit: number, d: number, x: number, z: number, k: number) {
  if (tN === k && d >= tD[k - 1]) return;
  let i = tN < k ? tN++ : k - 1;
  while (i > 0 && tD[i - 1] > d) { tId[i] = tId[i - 1]; tS[i] = tS[i - 1]; tD[i] = tD[i - 1]; tX[i] = tX[i - 1]; tZ[i] = tZ[i - 1]; i--; }
  tId[i] = id; tS[i] = hit; tD[i] = d; tX[i] = x; tZ[i] = z;
}
/** Up to `k` nearest foes of `p` within `range` (board: mobs and elites; arena, `own` ≥ 0: rival toys and their bosses). Returns how many. */
function nearestFoes(s: SiegeState, p: SiegePlayer, b: Board, own: number, range: number, k: number): number {
  tN = 0;
  if (k > TMAX) k = TMAX;
  if (k < 1) return 0;
  const r2 = range * range;
  if (own < 0) {
    const n = query(b.mobs, p.x, p.z, range);
    for (let i = 0; i < n; i++) { const m = b.mobs[near[i]], d = (m.x - p.x) ** 2 + (m.z - p.z) ** 2; if (d <= r2) offerFoe(near[i], m.serial, d, m.x, m.z, k); }
  } else {
    for (let j = 0; j < s.players.length; j++) { const v = s.players[j]; if (j === own || v.status !== 'arena') continue; const d = (v.x - p.x) ** 2 + (v.z - p.z) ** 2; if (d <= r2) offerFoe(j, -(j + 1), d, v.x, v.z, k); }
  }
  for (let i = 0; i < b.bigs.length; i++) {
    const g = b.bigs[i];
    if (!g.on || (own >= 0 && g.from === p.id)) continue;
    const d = (g.x - p.x) ** 2 + (g.z - p.z) ** 2;
    if (d <= r2) offerFoe(-2 - i, g.serial, d, g.x, g.z, k);
  }
  return tN;
}
/** Is hit id `id` among the first `nh` of `hits`? */
function seen(hits: ArrayLike<number>, nh: number, id: number): boolean {
  for (let h = 0; h < nh; h++) if (hits[h] === id) return true;
  return false;
}
/**
 * The nearest foe within `r` of (x, z) not in `hits` (board, `own` < 0: mobs and elites; arena: rival toys and their
 * bosses, never `p`'s). Returns its target id (−1 if none) and sets `aim` to where it stands and `aimHit` to its hit id.
 */
let aimHit = 0;
function nextFoe(s: SiegeState, p: SiegePlayer, b: Board, own: number, x: number, z: number, r: number, hits: ArrayLike<number>, nh: number): number {
  let best = r * r, id = -1;
  if (own < 0) {
    const mobs = b.mobs, n = query(mobs, x, z, r);
    for (let k = 0; k < n; k++) {
      const m = mobs[near[k]], d = (m.x - x) ** 2 + (m.z - z) ** 2;
      if (d < best && !seen(hits, nh, m.serial)) { best = d; id = near[k]; aim.x = m.x; aim.z = m.z; aimHit = m.serial; }
    }
  } else {
    for (let j = 0; j < s.players.length; j++) {
      const v = s.players[j];
      if (j === own || v.status !== 'arena') continue;
      const d = (v.x - x) ** 2 + (v.z - z) ** 2;
      if (d < best && !seen(hits, nh, -(j + 1))) { best = d; id = j; aim.x = v.x; aim.z = v.z; aimHit = -(j + 1); }
    }
  }
  for (let i = 0; i < b.bigs.length; i++) {
    const g = b.bigs[i];
    if (!g.on || (own >= 0 && g.from === p.id)) continue;
    const d = (g.x - x) ** 2 + (g.z - z) ** 2;
    if (d < best && !seen(hits, nh, g.serial)) { best = d; id = -2 - i; aim.x = g.x; aim.z = g.z; aimHit = g.serial; }
  }
  return id;
}
/** Is target `id` (with hit id `hit`) still there to be hit? Sets `aim` to where it stands. */
function foeThere(s: SiegeState, b: Board, own: number, id: number, hit: number): boolean {
  if (id >= 0) {
    if (own < 0) { const m = b.mobs[id]; if (!m || !m.on || m.serial !== hit) return false; aim.x = m.x; aim.z = m.z; return true; }
    const v = s.players[id];
    if (!v || v.status !== 'arena' || id === own) return false;
    aim.x = v.x; aim.z = v.z; return true;
  }
  if (id > -2) return false;
  const g = b.bigs[-2 - id];
  if (!g || !g.on || g.serial !== hit) return false;
  aim.x = g.x; aim.z = g.z; return true;
}

/** Hit ids struck by the chain in progress (scratch). */
const chainHits = new Int32Array(32);
/**
 * An instant chain (Prism Ray beams, Chain Lightning): strike target `id` (hit id `hit`), then the nearest foe within
 * `hop` of the last one struck that this chain has not struck yet, `hops` more times. Damage lands at once; each leap
 * leaves a short-lived blast of `kind` (4 beam, 5 lightning; `w` half-wide, `life` ms) from the last point to the
 * next, for the renderer. If the first target fell to an earlier chain of the same volley, the chain starts at the
 * nearest foe within `reach` instead. In the arena the damage carries the arena multiplier.
 */
function chain(s: SiegeState, p: SiegePlayer, b: Board, own: number, id: number, hit: number, reach: number, hops: number, hop: number,
  dmg: number, knock: number, kind: number, w: number, life: number) {
  let nh = 0, x0 = p.x, z0 = p.z, x = 0, z = 0;
  if (foeThere(s, b, own, id, hit)) { x = aim.x; z = aim.z; }
  else { id = nextFoe(s, p, b, own, p.x, p.z, reach, chainHits, 0); hit = aimHit; x = aim.x; z = aim.z; }
  const mul = FINALE.weaponMul, cap = Math.min(hops + 1, chainHits.length);
  while (id !== -1) {
    const dx = x - x0, dz = z - z0, d = Math.sqrt(dx * dx + dz * dz) || 1e-3;
    const fx = addBlast(b, kind, x0, z0, d, Math.atan2(dx, dz), 0, 0, life, 0, 0, own);
    if (fx) { fx.done = true; fx.w = w; }
    chainHits[nh++] = hit;
    if (own < 0) {
      if (id >= 0) hitMob(s, p, b.mobs[id], dmg, dx / d, dz / d, knock);
      else { hitBig(s, p, b.bigs[-2 - id], dmg); if (p.status !== 'alive') return; }
    } else if (id >= 0) arenaHurt(s, s.players[id], dmg * mul, p);
    else allyHurt(s, b.bigs[-2 - id], dmg * mul);
    if (nh >= cap) return;
    x0 = x; z0 = z;
    id = nextFoe(s, p, b, own, x0, z0, hop, chainHits, nh); hit = aimHit; x = aim.x; z = aim.z;
  }
}

/** Thunderhead's clock (`w.aux` counts down): every SKY.every ms (× cooldowns) SKY.count bolts fall on random foes in reach. */
function skyStrikes(s: SiegeState, p: SiegePlayer, w: WeaponSlot, b: Board, own: number, dt: number) {
  w.aux -= dt;
  if (w.aux > 0) return;
  w.aux += Math.max(200, SKY.every * p.stat.cd);
  if (w.aux < 0) w.aux = 0;
  const r = SKY.radius * p.stat.area, dmg = SKY.dmg * p.stat.dmg;
  for (let k = 0; k < SKY.count; k++) if (randomFoe(s, p, SKY.range, own)) addBlast(b, 6, aim.x, aim.z, r, 0, 360, 0, SKY.life, dmg, 2, own);
}

/** Yo-Yo Cyclone's whirlwind (`w.cd` counts down): every AURA.tickMs (× cooldowns) it hurts every foe within its radius. */
function aura(s: SiegeState, p: SiegePlayer, w: WeaponSlot, b: Board, own: number, dt: number) {
  w.cd -= dt;
  if (w.cd > 0) return;
  w.cd += Math.max(120, AURA.tickMs * p.stat.cd);
  if (w.cd < 0) w.cd = 0;
  const r = AURA.radius * p.stat.area, dmg = AURA.dmg * p.stat.dmg;
  if (own < 0) {
    const mobs = b.mobs, n = query(mobs, p.x, p.z, r + 1.2);
    for (let i = 0; i < n; i++) { const m = mobs[near[i]]; if (m.on && (m.x - p.x) ** 2 + (m.z - p.z) ** 2 <= (r + m.r) ** 2) hitMob(s, p, m, dmg, 0, 0, 0); }
    for (let gi = 0; gi < b.bigs.length; gi++) { const g = b.bigs[gi]; if (g.on && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 <= (r + g.r) ** 2) { hitBig(s, p, g, dmg); if (p.status !== 'alive') return; } }
    return;
  }
  const mul = FINALE.weaponMul;
  for (let j = 0; j < s.players.length; j++) { const v = s.players[j]; if (j !== own && v.status === 'arena' && (v.x - p.x) ** 2 + (v.z - p.z) ** 2 <= (r + PLAYER_RADIUS) ** 2) arenaHurt(s, v, dmg * mul, p); }
  for (let gi = 0; gi < b.bigs.length; gi++) { const g = b.bigs[gi]; if (g.on && g.from !== p.id && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 <= (r + g.r) ** 2) allyHurt(s, g, dmg * mul); }
}

/**
 * A seeking cork strikes only the foe it is flying at (it passes over the others on its way, so a volley really does
 * reach the nearest few): on contact it hits, spends a hop (or ends) and will look for the next foe. False if the boss
 * fell (the board is cleared). In the arena `p` is the cork's owner and the damage carries the arena multiplier.
 */
function corkStrike(s: SiegeState, p: SiegePlayer, b: Board, q: Proj): boolean {
  const id = q.ti;
  let x = 0, z = 0, r = 0;
  if (id >= 0) {
    if (q.own < 0) { const m = b.mobs[id]; if (!m.on || m.serial !== q.ts) return true; x = m.x; z = m.z; r = m.r; }
    else { const v = s.players[id]; if (!v || v.status !== 'arena') return true; x = v.x; z = v.z; r = PLAYER_RADIUS; }
  } else {
    const g = b.bigs[-2 - id];
    if (!g || !g.on || g.serial !== q.ts) return true;
    x = g.x; z = g.z; r = g.r;
  }
  if ((x - q.x) ** 2 + (z - q.z) ** 2 > (r + q.r) ** 2) return true;
  if (q.nh < q.hits.length) q.hits[q.nh++] = q.ts;
  if (q.own < 0) {
    if (id >= 0) { const sp = Math.sqrt(q.vx * q.vx + q.vz * q.vz) || 1; hitMob(s, p, b.mobs[id], q.dmg, q.vx / sp, q.vz / sp, 3); }
    else { hitBig(s, p, b.bigs[-2 - id], q.dmg); if (p.status !== 'alive') return false; }
  } else if (id >= 0) arenaHurt(s, s.players[id], q.dmg * FINALE.weaponMul, p);
  else allyHurt(s, b.bigs[-2 - id], q.dmg * FINALE.weaponMul);
  if (q.pierce <= 0) q.on = false; else q.pierce--;
  q.ti = -1;
  return true;
}

/** A Pop-Gun cork's seeker: straight at its target while that is still there, else at the nearest foe within RANGER.hop it has not hit. */
function seek(s: SiegeState, p: SiegePlayer, b: Board, q: Proj) {
  if (!foeThere(s, b, q.own, q.ti, q.ts)) {
    q.ti = nextFoe(s, p, b, q.own, q.x, q.z, RANGER.hop, q.hits, q.nh); q.ts = aimHit;
    if (q.ti === -1) return; // nothing in reach: fly on
  }
  const dx = aim.x - q.x, dz = aim.z - q.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1e-6) return;
  const sp = Math.sqrt(q.vx * q.vx + q.vz * q.vz);
  q.vx = (dx / d) * sp; q.vz = (dz / d) * sp;
}

/** The Boiler Heart's volley: a ring of rivets all round the toy, turned half a gap from the last ring. */
function fireRing(p: SiegePlayer, b: Board, own: number) {
  const h = p.horn!, n = BOILER.count, sp = BOILER.speed * p.stat.projSpeed, dmg = BOILER.dmg * p.stat.dmg;
  for (let k = 0; k < n; k++) {
    const a = h.aux + (k / n) * Math.PI * 2;
    addProj(b, 2, p.x, p.z, Math.sin(a) * sp, Math.cos(a) * sp, BOILER.r, dmg, BOILER.pierce, BOILER.lifeMs, 0, own);
  }
  h.aux = (h.aux + Math.PI / n) % (Math.PI * 2);
}
/** The Boiler Heart's clock: fires a ring every BOILER.cd (scaled by cooldowns). */
function stepBoiler(p: SiegePlayer, b: Board, own: number, dt: number) {
  const h = p.horn;
  if (!h || !h.evolved) return;
  h.cd -= dt;
  if (h.cd > 0) return;
  h.cd += Math.max(120, BOILER.cd * p.stat.cd);
  if (h.cd < 0) h.cd = 0;
  fireRing(p, b, own);
}

/**
 * Fire one volley. On a board (`own` −1) weapons aim at the swarm; in the arena (`own` = the
 * shooter's player index) at rival toys and their summoned bosses, and every hit carries `own`.
 */
function fire(s: SiegeState, p: SiegePlayer, w: WeaponSlot, st: WeaponStats, b: Board = p.board, own = -1) {
  const area = st.area * p.stat.area, dmg = st.dmg * p.stat.dmg, face = Math.atan2(p.fx, p.fz);
  switch (w.id) {
    case 'sweep': {
      // Swings at the nearest enemy in reach (auto-aim), else the way the toy faces.
      const base = nearestFoe(s, p, area + 3, own) ? Math.atan2(aim.x - p.x, aim.z - p.z) : face;
      for (let k = 0; k < st.count; k++) {
        const ang = base + k * Math.PI;
        addBlast(b, 0, p.x, p.z, area, ang, st.arc, 0, 260, dmg, st.knock, own);
      }
      break;
    }
    case 'popgun': {
      const n = nearestFoes(s, p, b, own, w.evolved ? st.range : RANGER.acquire, st.count);
      if (w.evolved) {
        // The Prism Ray: one instant beam per cork, each at one of the nearest foes (extra beams go to the nearest
        // again), chaining on `pierce` times.
        for (let k = 0; k < st.count && n > 0; k++) {
          const t = k % n;
          chain(s, p, b, own, tId[t], tS[t], st.range, st.pierce, RANGER.hop, dmg, st.knock, 4, area, RANGER.beamLife);
          if (p.status !== (own < 0 ? 'alive' : 'arena')) return;
        }
        break;
      }
      // Corks: one at each of the nearest foes, extra corks at the nearest again (fanned out a little so they read
      // as separate corks); with nothing in reach they fan out the way the toy faces and look for a foe as they fly.
      const sp = st.speed * p.stat.projSpeed;
      for (let k = 0; k < st.count; k++) {
        const t = n > 0 ? k % n : 0, extra = n > 0 ? (k / n) | 0 : 0;
        const a = n > 0 ? Math.atan2(tX[t] - p.x, tZ[t] - p.z) + (extra & 1 ? 0.3 : -0.3) * ((extra + 1) >> 1) : face + (k - (st.count - 1) / 2) * 0.14;
        const q = addProj(b, 0, p.x, p.z, Math.sin(a) * sp, Math.cos(a) * sp, st.area, dmg, st.pierce, st.range, 0, own);
        if (q) { q.homing = 1; if (n > 0) { q.ti = tId[t]; q.ts = tS[t]; } }
      }
      break;
    }
    case 'spark': {
      // Chain Lightning: strikes the nearest foe, then leaps on (hitscan).
      const n = nearestFoes(s, p, b, own, st.range, st.count);
      for (let k = 0; k < st.count && n > 0; k++) {
        const t = k % n;
        chain(s, p, b, own, tId[t], tS[t], st.range, st.pierce, area, dmg, st.knock, 5, 0.5, BOLT_LIFE);
        if (p.status !== (own < 0 ? 'alive' : 'arena')) return;
      }
      break;
    }
    case 'marbles':
      for (let k = 0; k < st.count; k++) {
        if (!randomFoe(s, p, st.range, own)) { const a = rand(s) * Math.PI * 2, d = 3 + rand(s) * 10; aim.x = p.x + Math.cos(a) * d; aim.z = p.z + Math.sin(a) * d; }
        addBlast(b, 2, aim.x + (rand(s) - 0.5), aim.z + (rand(s) - 0.5), area, 0, 360, 450, 700, dmg, 2, own);
      }
      break;
    case 'planes': {
      const sp = st.speed * p.stat.projSpeed, spread = w.evolved ? (Math.PI * 2) / st.count : 0.45;
      for (let k = 0; k < st.count; k++) {
        const a = w.evolved ? face + k * spread : face + (k - (st.count - 1) / 2) * spread;
        addProj(b, 1, p.x, p.z, Math.sin(a) * sp, Math.cos(a) * sp, st.area * p.stat.area, dmg, -1, 6000, st.range * p.stat.area, own);
      }
      break;
    }
    case 'yoyo': break;
  }
}

/** Where a player's yo-yos are this instant (index k of `count`). Shared with the renderer. */
export function yoyoAt(p: SiegePlayer, w: WeaponSlot, k: number, out: { x: number; z: number }) {
  const st = weaponStats(w), a = w.aux + (k / st.count) * Math.PI * 2, r = st.area * p.stat.area;
  out.x = p.x + Math.cos(a) * r; out.z = p.z + Math.sin(a) * r;
  return out;
}
const yo = { x: 0, z: 0 };

function weapons(s: SiegeState, p: SiegePlayer, dt: number) {
  const b = p.board;
  for (let wi = 0; wi < p.weapons.length; wi++) {
    const w = p.weapons[wi];
    const st = weaponStats(w);
    if (w.id === 'yoyo') {
      w.aux = (w.aux + st.speed * (dt / 1000)) % (Math.PI * 2);
      const dmg = st.dmg * p.stat.dmg, gap = st.cd * p.stat.cd;
      for (let k = 0; k < st.count; k++) {
        yoyoAt(p, w, k, yo);
        const n = query(b.mobs, yo.x, yo.z, 2.2);
        for (let i = 0; i < n; i++) {
          const m = b.mobs[near[i]];
          if (!m.on || b.bt - m.yo < gap) continue;
          const dx = m.x - yo.x, dz = m.z - yo.z;
          if (dx * dx + dz * dz > (m.r + 0.9) ** 2) continue;
          m.yo = b.bt;
          const d = len(m.x - p.x, m.z - p.z) || 1;
          hitMob(s, p, m, dmg, (m.x - p.x) / d, (m.z - p.z) / d, 4);
        }
        for (let gi = 0; gi < b.bigs.length; gi++) { const g = b.bigs[gi]; if (g.on && b.bt - g.yo >= gap && len(g.x - yo.x, g.z - yo.z) < g.r + 0.9) { g.yo = b.bt; hitBig(s, p, g, dmg); } }
      }
      if (w.evolved && p.status === 'alive') aura(s, p, w, b, -1, dt);
      if (p.status !== 'alive') return; // the boss fell
      continue;
    }
    if (w.id === 'spark' && w.evolved) skyStrikes(s, p, w, b, -1, dt);
    w.cd -= dt;
    if (w.cd > 0) continue;
    w.cd += Math.max(120, st.cd * p.stat.cd);
    if (w.cd < 0) w.cd = 0;
    fire(s, p, w, st);
    if (p.status !== 'alive') return; // the boss fell
  }
  stepBoiler(p, b, -1, dt);
}

// ---------------------------------------------------------------- board step

/** Player movement (the latched stick / keys), inside a square of half-size `half`. Online clients replay it for their own toy (predict.ts). */
export function movePlayer(p: SiegePlayer, sec: number, half: number) {
  const m2 = len(p.ax, p.ay), mag = Math.min(1, m2);
  if (mag <= 0.05) return;
  const nx = p.ax / m2, nz = -p.ay / m2;
  p.x = clamp(p.x + nx * mag * p.stat.speed * sec, -half + PLAYER_RADIUS, half - PLAYER_RADIUS);
  p.z = clamp(p.z + nz * mag * p.stat.speed * sec, -half + PLAYER_RADIUS, half - PLAYER_RADIUS);
  p.fx = nx; p.fz = nz;
}

/**
 * One board's step. Split into a function per entity kind: each is a small, hot loop that the JIT
 * optimises (and inlines its helpers into) on its own, and every loop is indexed (no iterators,
 * closures or boxed numbers per entity). Each stage returns false once the toy is no longer alive
 * (downed, or the boss fell), which ends the board's step there.
 */
function stepBoard(s: SiegeState, p: SiegePlayer, dt: number) {
  const b = p.board, sec = dt / 1000;
  b.bt += dt;
  movePlayer(p, sec, ARENA_HALF);
  stepSchedule(s, p);
  stepSpawns(s, p, dt);
  if (!stepMobs(s, p, dt)) return;
  if (!stepBigs(s, p, dt)) return;
  if (!stepShots(s, p, dt)) return;
  // The hash again: positions changed above.
  buildHash(b.mobs);
  weapons(s, p, dt);
  if (p.status !== 'alive') return; // the boss fell: the run is won
  stepProjs(s, p, dt);
  if (p.status !== 'alive') return;
  stepBlasts(s, p, dt);
  if (p.status !== 'alive') return;
  stepPickups(s, p, dt);
  openChoice(s, p);
}

/** The run's schedule: one elite a minute, the boss at 4:00, and elites sent by rivals. */
function stepSchedule(s: SiegeState, p: SiegePlayer) {
  const b = p.board;
  if (b.nextElite < ELITE_SCHEDULE.length && s.runT >= ELITE_SCHEDULE[b.nextElite].at) { if (spawnBig(s, p, ELITE_SCHEDULE[b.nextElite].elite, false, null)) b.nextElite++; }
  if (!b.bossUp && s.runT >= BOSS_AT) { if (spawnBig(s, p, 'baron', false, null)) b.bossUp = true; }
  for (let i = p.incoming.length - 1; i >= 0; i--) {
    const inc = p.incoming[i];
    if (s.runT < inc.at) continue;
    if (spawnBig(s, p, sentEliteFor(s.runT), true, inc.from)) p.incoming.splice(i, 1); // full board: it waits
  }
}

/** The swarm grows: a steady trickle, and a ring of enemies every WAVE_MS. */
function stepSpawns(s: SiegeState, p: SiegePlayer, dt: number) {
  const b = p.board, c = s.config, mobs = b.mobs;
  let alive = 0;
  for (let i = 0; i < mobs.length; i++) if (mobs[i].on) alive++;
  b.spawnAcc += spawnRate(s.runT) * (dt / 1000) * (b.bossUp && !b.bossDown ? 0.5 : 1);
  while (b.spawnAcc >= 1) {
    b.spawnAcc -= 1;
    if (alive >= c.mobCap) continue;
    spawnPoint(s, p, spot);
    if (spawnMob(s, p, rollKind(s), spot.x, spot.z)) alive++;
  }
  b.waveT -= dt;
  if (b.waveT <= 0) {
    b.waveT += WAVE_MS;
    const n = waveSize(s.runT), kind = rollKind(s), r = SPAWN_DIST[0] - 2, a0 = rand(s) * Math.PI;
    for (let i = 0; i < n && alive < c.mobCap; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      if (spawnMob(s, p, kind, clamp(p.x + Math.cos(a) * r, -ARENA_HALF + 1, ARENA_HALF - 1), clamp(p.z + Math.sin(a) * r, -ARENA_HALF + 1, ARENA_HALF - 1))) alive++;
    }
  }
}

/** Mobs: steer, separate (own hash cell only, a few neighbours), shove off the player, bite. False once the toy is down. */
function stepMobs(s: SiegeState, p: SiegePlayer, dt: number): boolean {
  const b = p.board, sec = dt / 1000, mobs = b.mobs;
  buildHash(mobs);
  const reach = PLAYER_RADIUS, decay = Math.max(0, 1 - 6 * sec);
  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    if (!m.on) continue;
    let dx = p.x - m.x, dz = p.z - m.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d; dz /= d;
    m.timer -= dt;
    let sp = m.speed;
    switch (m.kind) {
      case 1: { // wind-up mouse: dash, pause, dash
        if (m.timer < 0) m.timer += 950;
        sp = m.timer > 250 ? m.speed * 1.35 : 0;
        m.vx = dx; m.vz = dz;
        break;
      }
      case 2: // marble: rolls in a straight line, re-aims every so often (so it overshoots)
        if (m.timer < 0) { m.timer += 2200; m.vx = dx; m.vz = dz; }
        break;
      case 3: { // paper plane: swoops side to side on the way in
        const wob = Math.sin(b.bt / 300 + m.serial) * 0.8;
        m.vx = dx - dz * wob; m.vz = dz + dx * wob;
        const l = Math.sqrt(m.vx * m.vx + m.vz * m.vz) || 1; m.vx /= l; m.vz /= l;
        break;
      }
      default: m.vx = dx; m.vz = dz;
    }
    m.x += (m.vx * sp + m.kx) * sec; m.z += (m.vz * sp + m.kz) * sec;
    m.kx *= decay; m.kz *= decay;
    // separation: a few neighbours in the same cell
    const cellIdx = cellOf(m.z) * GRID + cellOf(m.x);
    let seen = 0;
    for (let j = head[cellIdx]; j >= 0 && seen < 6; j = next[j]) {
      if (j === i) continue;
      const o = mobs[j];
      if (!o.on) continue;
      seen++;
      const ox = m.x - o.x, oz = m.z - o.z, rr = m.r + o.r, dd = ox * ox + oz * oz;
      if (dd >= rr * rr || dd < 1e-6) continue;
      const dl = Math.sqrt(dd), push = (rr - dl) * 0.5;
      m.x += (ox / dl) * push; m.z += (oz / dl) * push;
    }
    m.x = clamp(m.x, -ARENA_HALF, ARENA_HALF); m.z = clamp(m.z, -ARENA_HALF, ARENA_HALF);
    const px = m.x - p.x, pz = m.z - p.z, pd = Math.sqrt(px * px + pz * pz), touch = m.r + reach;
    if (pd < touch) {
      if (pd > 1e-6) { m.x = p.x + (px / pd) * touch; m.z = p.z + (pz / pd) * touch; }
      hurtPlayer(s, p, m.dmg);
      if (p.status !== 'alive') return false;
    }
  }
  return true;
}

/** Elites and the boss: chase, telegraph and charge, fire rings of bullets, summon. False once the toy is down. */
function stepBigs(s: SiegeState, p: SiegePlayer, dt: number): boolean {
  const b = p.board, sec = dt / 1000, reach = PLAYER_RADIUS;
  for (let gi = 0; gi < b.bigs.length; gi++) {
    const g = b.bigs[gi];
    if (!g.on) continue;
    const d = BIGS[g.type];
    let dx = p.x - g.x, dz = p.z - g.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= dist; dz /= dist;
    if (g.mode === 0) {
      g.x += dx * g.speed * sec; g.z += dz * g.speed * sec;
      if (d.dashEvery) { g.dashT -= dt; if (g.dashT <= 0 && dist < 26) { g.mode = 1; g.modeT = d.windup; g.aimX = dx; g.aimZ = dz; } }
    } else if (g.mode === 1) {
      g.modeT -= dt;
      if (g.modeT <= 0) { g.mode = 2; g.modeT = d.dashMs; }
    } else {
      g.x += g.aimX * d.dashSpeed * sec; g.z += g.aimZ * d.dashSpeed * sec;
      g.modeT -= dt;
      if (g.modeT <= 0) { g.mode = 0; g.dashT = d.dashEvery; }
    }
    g.x = clamp(g.x, -ARENA_HALF, ARENA_HALF); g.z = clamp(g.z, -ARENA_HALF, ARENA_HALF);
    if (d.ringEvery) {
      g.ringT -= dt;
      if (g.ringT <= 0) {
        g.ringT += d.ringEvery;
        const off = rand(s) * Math.PI;
        for (let k = 0; k < d.ringCount; k++) {
          const a = off + (k / d.ringCount) * Math.PI * 2;
          const shot = freeShot(b);
          if (!shot) break;
          shot.on = true; shot.x = g.x; shot.z = g.z; shot.vx = Math.cos(a) * d.ringSpeed; shot.vz = Math.sin(a) * d.ringSpeed; shot.r = 0.7; shot.dmg = d.ringDmg; shot.life = 4000; shot.own = -1;
        }
      }
    }
    if (d.summonEvery) {
      g.summonT -= dt;
      if (g.summonT <= 0) {
        g.summonT += d.summonEvery;
        for (let k = 0; k < d.summonCount; k++) { const a = (k / d.summonCount) * Math.PI * 2; spawnMob(s, p, 1, clamp(g.x + Math.cos(a) * 4, -ARENA_HALF, ARENA_HALF), clamp(g.z + Math.sin(a) * 4, -ARENA_HALF, ARENA_HALF)); }
      }
    }
    if (len(p.x - g.x, p.z - g.z) < g.r + reach) {
      hurtPlayer(s, p, g.dmg);
      if (p.status !== 'alive') return false;
    }
  }
  return true;
}

/** Enemy bullets. False once the toy is down. */
function stepShots(s: SiegeState, p: SiegePlayer, dt: number): boolean {
  const shots = p.board.shots, sec = dt / 1000, reach = PLAYER_RADIUS;
  for (let i = 0; i < shots.length; i++) {
    const sh = shots[i];
    if (!sh.on) continue;
    sh.x += sh.vx * sec; sh.z += sh.vz * sec; sh.life -= dt;
    if (sh.life <= 0 || Math.abs(sh.x) > ARENA_HALF + 2 || Math.abs(sh.z) > ARENA_HALF + 2) { sh.on = false; continue; }
    if ((sh.x - p.x) ** 2 + (sh.z - p.z) ** 2 < (sh.r + reach) ** 2) {
      sh.on = false; hurtPlayer(s, p, sh.dmg);
      if (p.status !== 'alive') return false;
    }
  }
  return true;
}

/** Has projectile `q` already hit the entity with this serial? */
function projSeen(q: Proj, serial: number): boolean {
  for (let h = 0; h < q.nh; h++) if (q.hits[h] === serial) return true;
  return false;
}

/** Player projectiles: Pop-Gun corks (they seek their targets), paper planes and Boiler Heart rivets. */
function stepProjs(s: SiegeState, p: SiegePlayer, dt: number) {
  const b = p.board, sec = dt / 1000, projs = b.projs, mobs = b.mobs;
  for (let qi = 0; qi < projs.length; qi++) {
    const q = projs[qi];
    if (!q.on) continue;
    q.life -= dt;
    if (q.kind === 1) { // paper plane: out to its range, then home back to the toy
      if (!q.back && (q.x - q.ox) ** 2 + (q.z - q.oz) ** 2 >= q.range * q.range) { q.back = true; q.nh = 0; }
      if (q.back) {
        const dx = p.x - q.x, dz = p.z - q.z, dl = Math.sqrt(dx * dx + dz * dz) || 1, sp = Math.sqrt(q.vx * q.vx + q.vz * q.vz);
        q.vx = (dx / dl) * sp; q.vz = (dz / dl) * sp;
        if (dl < 1.5) { q.on = false; continue; }
      }
    } else if (q.homing > 0) seek(s, p, b, q);
    q.x += q.vx * sec; q.z += q.vz * sec;
    if (q.life <= 0 || Math.abs(q.x) > ARENA_HALF + 4 || Math.abs(q.z) > ARENA_HALF + 4) { q.on = false; continue; }
    if (q.homing > 0 && q.ti !== -1) { if (!corkStrike(s, p, b, q)) return; continue; }
    const n = query(mobs, q.x, q.z, q.r + 1.2);
    for (let k = 0; k < n && q.on; k++) {
      const m = mobs[near[k]];
      if (!m.on || (m.x - q.x) ** 2 + (m.z - q.z) ** 2 > (m.r + q.r) ** 2) continue;
      if (projSeen(q, m.serial)) continue;
      if (q.nh < q.hits.length) q.hits[q.nh++] = m.serial;
      else { q.hits[0] = m.serial; } // planes pierce forever: keep the newest hits only
      const sp = Math.sqrt(q.vx * q.vx + q.vz * q.vz) || 1;
      hitMob(s, p, m, q.dmg, q.vx / sp, q.vz / sp, q.kind === 1 ? 1.5 : 3);
      if (q.pierce >= 0) { if (q.pierce === 0) q.on = false; else q.pierce--; }
      q.ti = -1; // a cork hops on to the nearest foe it has not hit
    }
    for (let gi = 0; gi < b.bigs.length; gi++) {
      const g = b.bigs[gi];
      if (!q.on || !g.on || (g.x - q.x) ** 2 + (g.z - q.z) ** 2 > (g.r + q.r) ** 2) continue;
      if (projSeen(q, g.serial)) continue;
      if (q.nh < q.hits.length) q.hits[q.nh++] = g.serial;
      hitBig(s, p, g, q.dmg);
      if (p.status !== 'alive') return; // the boss fell
      if (q.pierce >= 0) { if (q.pierce === 0) q.on = false; else q.pierce--; }
      q.ti = -1;
    }
  }
}

/** Area hits (sweeps, marbles, the revive shockwave, Thunderhead's sky strikes); beams and leaps only fade. */
function stepBlasts(s: SiegeState, p: SiegePlayer, dt: number) {
  const b = p.board, blasts = b.blasts, mobs = b.mobs;
  for (let bi = 0; bi < blasts.length; bi++) {
    const k = blasts[bi];
    if (!k.on) continue;
    k.age += dt;
    if (!k.done && k.age >= k.delay) {
      k.done = true;
      const n = query(mobs, k.x, k.z, k.r + 1.2), half = (k.arc / 2) * (Math.PI / 180);
      for (let i = 0; i < n; i++) {
        const m = mobs[near[i]];
        const dx = m.x - k.x, dz = m.z - k.z, dd = Math.sqrt(dx * dx + dz * dz);
        if (dd > k.r + m.r) continue;
        if (k.arc < 360 && dd > 0.5) { let da = Math.atan2(dx, dz) - k.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > half) continue; }
        hitMob(s, p, m, k.dmg, dd ? dx / dd : 0, dd ? dz / dd : 0, k.knock);
      }
      for (let gi = 0; gi < b.bigs.length; gi++) {
        const g = b.bigs[gi];
        if (!g.on) continue;
        const dx = g.x - k.x, dz = g.z - k.z, dd = Math.sqrt(dx * dx + dz * dz);
        if (dd > k.r + g.r) continue;
        if (k.arc < 360 && dd > 0.5) { let da = Math.atan2(dx, dz) - k.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > half + 0.3) continue; }
        hitBig(s, p, g, k.dmg);
        if (p.status !== 'alive') return; // the boss fell
      }
      if (k.kind === 3) for (let i = 0; i < b.shots.length; i++) { const sh = b.shots[i]; if (sh.on && len(sh.x - k.x, sh.z - k.z) < k.r) sh.on = false; }
    }
    if (k.age >= k.life) k.on = false;
  }
}

/** Gems, biscuits and chests. */
function stepPickups(s: SiegeState, p: SiegePlayer, dt: number) {
  const b = p.board, sec = dt / 1000, gems = b.gems;
  const pick2 = p.stat.pickup * p.stat.pickup;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    if (!g.on) continue;
    const dx = p.x - g.x, dz = p.z - g.z, dd = dx * dx + dz * dz;
    if (!g.pull && dd < pick2) g.pull = true;
    if (!g.pull) continue;
    const dl = Math.sqrt(dd);
    if (dl < 1.3) {
      g.on = false;
      if (g.kind === 1) p.hp = Math.min(p.stat.maxHp, p.hp + p.stat.maxHp * SNACK_HEAL);
      else gainXp(s, p, g.v);
      continue;
    }
    const step = Math.min(dl, 34 * sec);
    g.x += (dx / dl) * step; g.z += (dz / dl) * step;
  }
  for (let i = 0; i < b.chests.length; i++) { const ch = b.chests[i]; if (ch.on && len(ch.x - p.x, ch.z - p.z) < 2.6) { ch.on = false; p.pendingChests++; emit(s, { type: 'siege-chest-pick', id: p.id }); } }
}

// ---------------------------------------------------------------- prep: after the boss, or at 5:00

/**
 * The boss fell (`chests` = FINALE.bossChests at the boss) or the run ended (`chests` 0): clear the
 * board, pull every gem and chest to the toy, and give it `prepMs` to take its cards. Cards stay
 * open as they are; the board does not freeze for them (nothing on it can hurt you any more).
 */
function enterPrep(s: SiegeState, p: SiegePlayer, chests: number, x: number, z: number) {
  const b = p.board;
  for (const m of b.mobs) m.on = false;
  for (const g of b.bigs) g.on = false;
  for (const sh of b.shots) sh.on = false;
  for (const q of b.projs) q.on = false;
  for (const k of b.blasts) k.on = false;
  b.bossDown = true;
  for (let i = 0; i < chests; i++) {
    const c = b.chests.find((q) => !q.on);
    const a = (i / Math.max(1, chests)) * Math.PI * 2;
    if (c) { c.on = true; c.x = clamp(x + Math.cos(a) * 3, -ARENA_HALF + 1, ARENA_HALF - 1); c.z = clamp(z + Math.sin(a) * 3, -ARENA_HALF + 1, ARENA_HALF - 1); }
    else p.pendingChests++;
  }
  for (const g of b.gems) if (g.on) g.pull = true;
  p.status = 'prep'; p.prepUntil = s.runT + s.config.prepMs; p.incoming.length = 0; p.invuln = 0; p.watching = null;
  emit(s, { type: 'siege-prep', id: p.id, chests });
}

/** Collect everything still on the board at once and settle every card with its first option. */
function flushPrep(s: SiegeState, p: SiegePlayer) {
  const b = p.board;
  for (const g of b.gems) if (g.on) { g.on = false; if (g.kind === 1) p.hp = p.stat.maxHp; else gainXp(s, p, g.v); }
  for (const c of b.chests) if (c.on) { c.on = false; p.pendingChests++; }
  for (let n = 0; n < 200 && (p.choice || p.pendingLevels > 0 || p.pendingChests > 0); n++) {
    if (!p.choice) openChoice(s, p);
    if (!p.choice) break;
    choose(s, p, 0, null);
  }
}

function stepPrep(s: SiegeState, p: SiegePlayer, dt: number) {
  const b = p.board, sec = dt / 1000;
  b.bt += dt;
  if (!p.choice) movePlayer(p, sec, ARENA_HALF);
  const step = FINALE.vacuumSpeed * sec;
  for (let i = 0; i < b.gems.length; i++) {
    const g = b.gems[i];
    if (!g.on) continue;
    const dx = p.x - g.x, dz = p.z - g.z, dl = len(dx, dz);
    if (dl < 1.3 + step) { g.on = false; if (g.kind === 1) p.hp = Math.min(p.stat.maxHp, p.hp + p.stat.maxHp * SNACK_HEAL); else gainXp(s, p, g.v); continue; }
    g.pull = true; g.x += (dx / dl) * step; g.z += (dz / dl) * step;
  }
  for (const c of b.chests) {
    if (!c.on) continue;
    const dx = p.x - c.x, dz = p.z - c.z, dl = len(dx, dz), cs = step * 0.5; // chests drift in a little slower than gems
    if (dl < 2.6 + cs) { c.on = false; p.pendingChests++; emit(s, { type: 'siege-chest-pick', id: p.id }); continue; }
    c.x += (dx / dl) * cs; c.z += (dz / dl) * cs;
  }
  for (const k of b.blasts) if (k.on) { k.age += dt; if (k.age >= k.life) k.on = false; }
  if (s.runT >= p.prepUntil) flushPrep(s, p);
  else openChoice(s, p);
}

// ---------------------------------------------------------------- the final arena

/** Arena pools: no swarm, gems or chests; room for every toy's volleys and one summoned boss each. */
function arenaBoard(c: SiegeConfig, players: number): Board {
  return newBoard({ mobCap: 0, gemCap: 0, chestCap: 0, bigCap: Math.max(1, players), projectileCap: c.projectileCap * 2, shotCap: c.shotCap * 2, blastCap: c.blastCap * 2 });
}

/** Open the arena for every toy in prep (downed toys that have not revived become ghosts). Fewer than two: no arena, the match ends. */
function openArena(s: SiegeState) {
  for (const p of s.players) if (p.status === 'downed') becomeGhost(s, p);
  const fighters = s.players.filter((p) => p.status === 'prep');
  for (const p of fighters) flushPrep(s, p);
  if (fighters.length < 2) { s.phase = 'over'; emit(s, { type: 'siege-over' }); return; }
  s.phase = 'arena'; s.arenaT = 0;
  s.arena = arenaBoard(s.config, s.players.length);
  s.arenaYo = new Array(s.players.length * s.players.length).fill(-1e9);
  fighters.forEach((p, k) => {
    const a = (k / fighters.length) * Math.PI * 2 + Math.PI / 4;
    p.x = Math.cos(a) * FINALE.startRadius; p.z = Math.sin(a) * FINALE.startRadius;
    const d = len(p.x, p.z) || 1; p.fx = -p.x / d; p.fz = -p.z / d;
    p.status = 'arena'; p.inArena = true; p.arenaOutAt = -1; p.hp = p.stat.maxHp; p.invuln = 0; p.lastHitBy = null; p.hurtAt = -1e9;
    p.choice = null; p.watching = null;
    for (const w of p.weapons) { w.cd = 500 + k * 60; w.aux = 0; }
    if (p.horn) { p.horn.readyAt = FINALE.ally.firstReadyMs; p.horn.cd = 500 + k * 60; }
  });
  for (const p of s.players) if (p.status === 'ghost' && p.watching && playerById(s, p.watching)?.status !== 'arena') p.watching = null;
  emit(s, { type: 'siege-arena', fighters: fighters.length });
}

/** Nearest rival toy or rival's summoned boss within `range` (sets `aim`). */
function foeNearest(s: SiegeState, p: SiegePlayer, range: number): boolean {
  let best = range * range, found = false;
  for (const q of s.players) if (q !== p && q.status === 'arena') { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < best) { best = d; aim.x = q.x; aim.z = q.z; found = true; } }
  for (const g of s.arena!.bigs) if (g.on && g.from !== p.id) { const d = (g.x - p.x) ** 2 + (g.z - p.z) ** 2; if (d < best) { best = d; aim.x = g.x; aim.z = g.z; found = true; } }
  aim.d = Math.sqrt(best);
  return found;
}
/** A random rival toy or rival's summoned boss within `range` (sets `aim`). */
function foeRandom(s: SiegeState, p: SiegePlayer, range: number): boolean {
  const r2 = range * range;
  let n = 0;
  for (const q of s.players) if (q !== p && q.status === 'arena' && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 <= r2) n++;
  for (const g of s.arena!.bigs) if (g.on && g.from !== p.id && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 <= r2) n++;
  if (!n) return false;
  let pick = Math.floor(rand(s) * n);
  for (const q of s.players) if (q !== p && q.status === 'arena' && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 <= r2 && pick-- === 0) { aim.x = q.x; aim.z = q.z; return true; }
  for (const g of s.arena!.bigs) if (g.on && g.from !== p.id && (g.x - p.x) ** 2 + (g.z - p.z) ** 2 <= r2 && pick-- === 0) { aim.x = g.x; aim.z = g.z; return true; }
  return false;
}

/** Damage a toy in the arena: overtime and armour apply; at 0 it is knocked out of the arena. */
function arenaHurt(s: SiegeState, v: SiegePlayer, dmg: number, from: SiegePlayer | undefined) {
  if (v.status !== 'arena' || dmg <= 0) return;
  v.hp -= dmg * overtime(s.arenaT) * (1 - Math.min(FINALE.armourCap, v.stat.armour * FINALE.armourPct));
  if (from && from !== v) v.lastHitBy = from.id;
  if (s.arenaT - v.hurtAt >= 300) { v.hurtAt = s.arenaT; emit(s, { type: 'siege-hurt', id: v.id }); }
  if (v.hp > 0) return;
  v.hp = 0; v.status = 'ghost'; v.arenaOutAt = s.arenaT; v.watching = null; v.gx = 0; v.gz = 0;
  for (const g of s.arena!.bigs) if (g.on && g.from === v.id) g.on = false;
  const by = playerById(s, v.lastHitBy);
  if (by && by.status === 'arena') { by.arenaKOs++; by.points += FINALE.koPoints; }
  emit(s, { type: 'siege-ko', id: v.id, by: by?.id ?? null });
}
/** Damage a summoned boss. */
function allyHurt(s: SiegeState, g: Big, dmg: number) {
  if (!g.on) return;
  g.hp -= dmg * overtime(s.arenaT); g.hurt = s.arenaT;
  if (g.hp <= 0) { g.on = false; emit(s, { type: 'siege-ally-down', id: g.from }); }
}

/** The Rally Horn in the arena: a Boiler Baron fights for its owner (one at a time, then a cooldown). */
function summonAlly(s: SiegeState, p: SiegePlayer) {
  const a = s.arena!, A = FINALE.ally;
  if (!p.horn || s.arenaT < p.horn.readyAt || a.bigs.some((g) => g.on && g.from === p.id)) return;
  const g = a.bigs.find((x) => !x.on);
  if (!g) return;
  const lv = p.horn.level;
  g.on = true; g.serial = ++a.serial; g.type = 'baron'; g.sent = false; g.from = p.id;
  g.x = clamp(p.x + p.fx * 3, -FINALE.half + 2, FINALE.half - 2); g.z = clamp(p.z + p.fz * 3, -FINALE.half + 2, FINALE.half - 2);
  g.hp = g.maxHp = A.hp[lv - 1]; g.r = A.r; g.speed = A.speed; g.dmg = A.contact; g.xp = 0; g.pts = 0;
  g.mode = 0; g.modeT = 0; g.dashT = A.dashEvery * 0.5; g.ringT = A.ringEvery * 0.5; g.summonT = 0; g.aimX = p.fx; g.aimZ = p.fz; g.hurt = -1e9; g.yo = -1e9; g.summons = 0;
  p.horn.readyAt = s.arenaT + A.cooldowns[lv - 1];
  emit(s, { type: 'siege-ally', id: p.id });
}

function arenaWeapons(s: SiegeState, p: SiegePlayer, own: number, dt: number) {
  const a = s.arena!, n = s.players.length, mul = FINALE.weaponMul;
  for (const w of p.weapons) {
    const st = weaponStats(w);
    if (w.id === 'yoyo') {
      w.aux = (w.aux + st.speed * (dt / 1000)) % (Math.PI * 2);
      const dmg = st.dmg * p.stat.dmg * mul, gap = st.cd * p.stat.cd;
      for (let k = 0; k < st.count; k++) {
        yoyoAt(p, w, k, yo);
        for (let j = 0; j < n; j++) {
          const v = s.players[j];
          if (j === own || v.status !== 'arena' || a.bt - s.arenaYo[own * n + j] < gap || len(v.x - yo.x, v.z - yo.z) > PLAYER_RADIUS + 0.9) continue;
          s.arenaYo[own * n + j] = a.bt;
          arenaHurt(s, v, dmg, p);
        }
        for (const g of a.bigs) if (g.on && g.from !== p.id && a.bt - g.yo >= gap && len(g.x - yo.x, g.z - yo.z) < g.r + 0.9) { g.yo = a.bt; allyHurt(s, g, dmg); }
      }
      if (w.evolved) aura(s, p, w, a, own, dt);
      continue;
    }
    if (w.id === 'spark' && w.evolved) skyStrikes(s, p, w, a, own, dt);
    w.cd -= dt;
    if (w.cd > 0) continue;
    w.cd += Math.max(120, st.cd * p.stat.cd);
    if (w.cd < 0) w.cd = 0;
    fire(s, p, w, st, a, own);
  }
  stepBoiler(p, a, own, dt);
}

function stepAllies(s: SiegeState, dt: number) {
  const a = s.arena!, A = FINALE.ally, sec = dt / 1000;
  for (const g of a.bigs) {
    if (!g.on) continue;
    const owner = playerById(s, g.from);
    if (!owner || owner.status !== 'arena') { g.on = false; continue; }
    const own = s.players.indexOf(owner);
    let t: SiegePlayer | null = null, best = Infinity;
    for (const q of s.players) if (q !== owner && q.status === 'arena') { const d = (q.x - g.x) ** 2 + (q.z - g.z) ** 2; if (d < best) { best = d; t = q; } }
    if (!t) continue;
    let dx = t.x - g.x, dz = t.z - g.z;
    const dist = len(dx, dz) || 1;
    dx /= dist; dz /= dist;
    if (g.mode === 0) {
      g.x += dx * g.speed * sec; g.z += dz * g.speed * sec;
      g.dashT -= dt;
      if (g.dashT <= 0 && dist < 20) { g.mode = 1; g.modeT = A.windup; g.aimX = dx; g.aimZ = dz; }
    } else if (g.mode === 1) {
      g.modeT -= dt;
      if (g.modeT <= 0) { g.mode = 2; g.modeT = A.dashMs; }
    } else {
      g.x += g.aimX * A.dashSpeed * sec; g.z += g.aimZ * A.dashSpeed * sec;
      g.modeT -= dt;
      if (g.modeT <= 0) { g.mode = 0; g.dashT = A.dashEvery; }
    }
    g.x = clamp(g.x, -FINALE.half + g.r, FINALE.half - g.r); g.z = clamp(g.z, -FINALE.half + g.r, FINALE.half - g.r);
    g.ringT -= dt;
    if (g.ringT <= 0) {
      g.ringT += A.ringEvery;
      const off = rand(s) * Math.PI;
      for (let k = 0; k < A.ringCount; k++) {
        const shot = freeShot(a);
        if (!shot) break;
        const ang = off + (k / A.ringCount) * Math.PI * 2;
        shot.on = true; shot.x = g.x; shot.z = g.z; shot.vx = Math.cos(ang) * A.ringSpeed; shot.vz = Math.sin(ang) * A.ringSpeed; shot.r = 0.7; shot.dmg = A.ringDmg; shot.life = 3000; shot.own = own;
      }
    }
    for (const q of s.players) {
      if (q === owner || q.status !== 'arena' || a.bt < q.invuln || len(q.x - g.x, q.z - g.z) >= g.r + PLAYER_RADIUS) continue;
      q.invuln = a.bt + 500;
      arenaHurt(s, q, A.contact, owner);
    }
  }
}

function stepArena(s: SiegeState, dt: number) {
  const a = s.arena!, sec = dt / 1000, mul = FINALE.weaponMul, half = FINALE.half;
  s.arenaT += dt; a.bt = s.arenaT;
  s.players.forEach((p, i) => {
    if (p.status !== 'arena') return;
    movePlayer(p, sec, half);
    arenaWeapons(s, p, i, dt);
  });
  stepAllies(s, dt);

  // Projectiles: corks and planes hit rival toys and their summoned bosses.
  for (let qi = 0; qi < a.projs.length; qi++) {
    const q = a.projs[qi];
    if (!q.on) continue;
    const owner = s.players[q.own];
    if (!owner || owner.status !== 'arena') { q.on = false; continue; }
    q.life -= dt;
    if (q.kind === 1) {
      if (!q.back && (q.x - q.ox) ** 2 + (q.z - q.oz) ** 2 >= q.range * q.range) { q.back = true; q.nh = 0; }
      if (q.back) {
        const dx = owner.x - q.x, dz = owner.z - q.z, dl = len(dx, dz) || 1, sp = len(q.vx, q.vz);
        q.vx = (dx / dl) * sp; q.vz = (dz / dl) * sp;
        if (dl < 1.5) { q.on = false; continue; }
      }
    } else if (q.homing > 0) seek(s, owner, a, q);
    q.x += q.vx * sec; q.z += q.vz * sec;
    if (q.life <= 0 || Math.abs(q.x) > half + 4 || Math.abs(q.z) > half + 4) { q.on = false; continue; }
    if (q.homing > 0 && q.ti !== -1) { corkStrike(s, owner, a, q); continue; }
    for (let j = 0; j < s.players.length && q.on; j++) {
      const v = s.players[j];
      if (j === q.own || v.status !== 'arena' || (v.x - q.x) ** 2 + (v.z - q.z) ** 2 > (PLAYER_RADIUS + q.r) ** 2) continue;
      if (!markHit(q, -(j + 1))) continue;
      arenaHurt(s, v, q.dmg * mul, owner);
      if (q.pierce >= 0) { if (q.pierce === 0) q.on = false; else q.pierce--; }
      q.ti = -1;
    }
    for (const g of a.bigs) {
      if (!q.on || !g.on || g.from === owner.id || (g.x - q.x) ** 2 + (g.z - q.z) ** 2 > (g.r + q.r) ** 2) continue;
      if (!markHit(q, g.serial)) continue;
      allyHurt(s, g, q.dmg * mul);
      if (q.pierce >= 0) { if (q.pierce === 0) q.on = false; else q.pierce--; }
      q.ti = -1;
    }
  }

  // Area hits (sweeps, marbles, sky strikes); beams and leaps only fade.
  for (let bi = 0; bi < a.blasts.length; bi++) {
    const k = a.blasts[bi];
    if (!k.on) continue;
    k.age += dt;
    if (!k.done && k.age >= k.delay) {
      k.done = true;
      const owner = s.players[k.own], half2 = (k.arc / 2) * (Math.PI / 180);
      const inArc = (x: number, z: number, r: number, slack: number) => {
        const dx = x - k.x, dz = z - k.z, dd = len(dx, dz);
        if (dd > k.r + r) return false;
        if (k.arc >= 360 || dd <= 0.5) return true;
        let da = Math.atan2(dx, dz) - k.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
        return Math.abs(da) <= half2 + slack;
      };
      if (owner && owner.status === 'arena') {
        s.players.forEach((v, j) => { if (j !== k.own && v.status === 'arena' && inArc(v.x, v.z, PLAYER_RADIUS, 0.3)) arenaHurt(s, v, k.dmg * mul, owner); });
        for (const g of a.bigs) if (g.on && g.from !== owner.id && inArc(g.x, g.z, g.r, 0.3)) allyHurt(s, g, k.dmg * mul);
      }
    }
    if (k.age >= k.life) k.on = false;
  }

  // A summoned boss's bullets.
  for (let si = 0; si < a.shots.length; si++) {
    const sh = a.shots[si];
    if (!sh.on) continue;
    sh.x += sh.vx * sec; sh.z += sh.vz * sec; sh.life -= dt;
    if (sh.life <= 0 || Math.abs(sh.x) > half + 2 || Math.abs(sh.z) > half + 2) { sh.on = false; continue; }
    const owner = s.players[sh.own];
    for (let j = 0; j < s.players.length && sh.on; j++) {
      const v = s.players[j];
      if (j === sh.own || v.status !== 'arena' || (sh.x - v.x) ** 2 + (sh.z - v.z) ** 2 >= (sh.r + PLAYER_RADIUS) ** 2) continue;
      sh.on = false;
      arenaHurt(s, v, sh.dmg, owner);
    }
  }

  const left = s.players.filter((p) => p.status === 'arena');
  if (left.length <= 1 || s.arenaT >= s.config.arenaMs) {
    if (left.length === 1) { left[0].points += FINALE.championPoints; emit(s, { type: 'siege-champion', id: left[0].id }); }
    s.phase = 'over';
    emit(s, { type: 'siege-over' });
  }
}
/** Remember that projectile `q` hit `id` (false if it already had). Planes pierce forever: they keep the newest hits only. */
function markHit(q: Proj, id: number): boolean {
  for (let h = 0; h < q.nh; h++) if (q.hits[h] === id) return false;
  if (q.nh < q.hits.length) q.hits[q.nh++] = id; else q.hits[0] = id;
  return true;
}

// ---------------------------------------------------------------- the rules

export const siegeRules: RulesCore<SiegeState, SiegeInput, Partial<SiegeConfig>> = {
  init(contestants, seed, config) {
    const cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };
    return { kind: 'toybox-siege', seed, rng: seed >>> 0, phase: 'pick', t: 0, runT: 0, arenaT: 0, arena: null, arenaYo: [], config: cfg, players: contestants.map((c) => makePlayer(c, cfg)), events: [] };
  },

  step(s, inputs, dtMs) {
    if (s.phase === 'over') return s;
    s.t += dtMs;
    for (const p of s.players) {
      const list = inputs[p.id];
      if (!list) continue;
      for (const i of list) applyInput(s, p, i);
    }
    if (s.phase === 'pick') {
      if (s.config.pickTimeoutMs > 0 && s.t >= s.config.pickTimeoutMs) for (const p of s.players) if (!p.cls) pickClass(s, p, CLASS_IDS[0]);
      return s;
    }
    if (s.phase === 'arena') { stepArena(s, dtMs); return s; }
    s.runT += dtMs;
    for (const p of s.players) {
      // The run ends at 5:00: anyone still fighting is pulled out to prepare for the arena.
      if (p.status === 'alive' && s.runT >= s.config.durationMs) enterPrep(s, p, 0, p.x, p.z);
      if (p.status === 'alive') {
        if (p.choice) {
          if (s.config.choiceTimeoutMs > 0 && s.t - p.choice.at >= s.config.choiceTimeoutMs) choose(s, p, 0, null);
          continue; // the board waits while you choose
        }
        stepBoard(s, p, dtMs);
      } else if (p.status === 'prep') {
        if (p.choice && s.config.choiceTimeoutMs > 0 && s.t - p.choice.at >= s.config.choiceTimeoutMs) choose(s, p, 0, null);
        stepPrep(s, p, dtMs);
      } else if (p.status === 'downed') {
        if (s.runT - p.downedAt >= s.config.reviveWindowMs) becomeGhost(s, p);
      }
    }
    moveGhosts(s, dtMs);
    const inRun = s.players.some((p) => p.status === 'alive' || p.status === 'downed');
    const prepping = s.players.filter((p) => p.status === 'prep');
    if (!inRun && !prepping.length) {
      s.phase = 'over';
      emit(s, { type: 'siege-over' });
    } else if (prepping.length && (s.runT >= s.config.durationMs + s.config.prepMs || (!inRun && prepping.every((p) => s.runT >= p.prepUntil)))) {
      openArena(s);
    }
    return s;
  },

  isOver: (s) => s.phase === 'over',

  result(s) {
    const ranked = ranking(s);
    const placements: Placement[] = [];
    ranked.forEach((p, i) => {
      const prev = ranked[i - 1];
      const tie = prev && sameRank(s, prev, p);
      placements.push({ contestantId: p.id, place: tie ? placements[i - 1].place : i + 1, score: Math.round(p.points), eliminated: p.status === 'ghost' });
    });
    const me = s.players[0];
    return { placements, durationMs: s.t, stats: { kills: me?.kills ?? 0, level: me?.level ?? 1, survivedSec: Math.round(survival(s, me) / 1000), bossDefeated: (me?.victoryAt ?? -1) >= 0 ? 1 : 0, arenaKOs: me?.arenaKOs ?? 0 } };
  },

  drainEvents(s) {
    if (!s.events.length) return [];
    const out = s.events;
    s.events = [];
    return out;
  },
};

/** Out of the action (a ghost, or waiting for the arena with no card open): may watch other boards. */
const canSpectate = (p: SiegePlayer) => p.status === 'ghost' || (p.status === 'prep' && !p.choice);

function applyInput(s: SiegeState, p: SiegePlayer, i: SiegeInput) {
  switch (i.type) {
    case 'move':
      p.ax = clamp(Number(i.x) || 0, -1, 1); p.ay = clamp(Number(i.y) || 0, -1, 1);
      break;
    case 'class': pickClass(s, p, i.cls); break;
    case 'choose': if (s.phase === 'run') choose(s, p, i.index, i.target); break;
    case 'skill':
      if (s.phase === 'arena') { if (p.status === 'arena') summonAlly(s, p); break; }
      if (s.phase === 'run' && p.status === 'alive' && p.horn && !p.choice && s.runT >= p.horn.readyAt) {
        if (trySend(s, p, i.target)) p.horn.readyAt = s.runT + HORN.cooldowns[p.horn.level - 1];
      }
      break;
    case 'target': p.target = i.id && playerById(s, i.id) && i.id !== p.id ? i.id : null; break;
    case 'revive': if (s.phase === 'run') revive(s, p); break;
    case 'giveup': if (s.phase === 'run' && p.status === 'downed') becomeGhost(s, p); break;
    case 'spectate':
      if (!canSpectate(p)) break;
      p.watching = i.on ? defaultWatch(s, p) : null;
      p.gx = 0; p.gz = 0;
      break;
    case 'watch': {
      if (!canSpectate(p)) break;
      const others = s.players.filter((q) => q !== p && (s.phase !== 'arena' || q.status === 'arena'));
      if (!others.length) break;
      if (i.id && others.some((q) => q.id === i.id)) { p.watching = i.id; break; }
      if (!p.watching) { p.watching = defaultWatch(s, p); break; } // the first press starts watching
      const at = others.findIndex((q) => q.id === p.watching);
      p.watching = others[(at + i.dir + others.length * 2) % others.length].id;
      break;
    }
  }
}

/** Ghosts drift with the stick around the toy they are watching (render-side helper uses the same clamp). */
export const GHOST_RADIUS = 9;
export function moveGhosts(s: SiegeState, dtMs: number) {
  for (const p of s.players) {
    if (p.status !== 'ghost' || !p.watching) continue;
    p.gx = clamp(p.gx + p.ax * 12 * dtMs / 1000, -GHOST_RADIUS, GHOST_RADIUS);
    p.gz = clamp(p.gz - p.ay * 12 * dtMs / 1000, -GHOST_RADIUS, GHOST_RADIUS);
  }
}

// ---------------------------------------------------------------- placement

/** How long a toy lasted in the run: boss slayers count to their kill, toys that reached the arena (or 5:00) the whole run. */
export function survival(s: SiegeState, p: SiegePlayer | undefined): number {
  if (!p) return 0;
  if (p.victoryAt >= 0) return p.victoryAt;
  if (p.status === 'ghost' && !p.inArena) return p.outAt;
  if (p.status === 'alive' || p.status === 'downed') return Math.min(s.runT, s.config.durationMs);
  return s.config.durationMs;
}
/**
 * Arena toys first, by arena survival (still standing, then later knockouts first); then the run:
 * victory (earlier boss kill first), survival time, knockouts, points.
 */
export function compare(s: SiegeState, a: SiegePlayer, b: SiegePlayer): number {
  if (a.inArena !== b.inArena) return a.inArena ? -1 : 1;
  if (a.inArena) {
    const ao = a.arenaOutAt < 0 ? Infinity : a.arenaOutAt, bo = b.arenaOutAt < 0 ? Infinity : b.arenaOutAt;
    if (ao !== bo) return ao > bo ? -1 : 1;
  }
  const va = a.victoryAt >= 0, vb = b.victoryAt >= 0;
  if (va !== vb) return va ? -1 : 1;
  if (va && vb && a.victoryAt !== b.victoryAt) return a.victoryAt - b.victoryAt;
  return survival(s, b) - survival(s, a) || b.kills - a.kills || b.points - a.points;
}
const sameRank = (s: SiegeState, a: SiegePlayer, b: SiegePlayer) => compare(s, a, b) === 0;
export const ranking = (s: SiegeState) => s.players.slice().sort((a, b) => compare(s, a, b) || (a.id < b.id ? -1 : 1));

/**
 * The toy on screen for the local player: their own, or the one they chose to watch. In the arena,
 * a toy that never reached it watches a fighter (there is no board of its own to show any more).
 */
export function viewedPlayer(s: SiegeState, localId: string): SiegePlayer | undefined {
  const me = s.players.find((p) => p.id === localId);
  if (!me) return undefined;
  let v = me;
  if ((me.status === 'ghost' || me.status === 'prep') && me.watching) v = playerById(s, me.watching) ?? me;
  if (s.phase === 'arena' && !v.inArena) v = s.players.find((p) => p.status === 'arena') ?? s.players.find((p) => p.inArena) ?? v;
  return v;
}

/** The board a viewer sees: the arena once it is open, else the viewed toy's own board. */
export const viewedBoard = (s: SiegeState, v: SiegePlayer): Board => (s.phase === 'arena' || (s.phase === 'over' && s.arena && v.inArena) ? s.arena! : v.board);

export type EvoHint =
  /** Taking this card completes a weapon's evolution pair (or maxes the Rally Horn): the next chest evolves it. */
  | { kind: 'ready'; weapon: EvoId }
  /** Taking this card pairs a weapon with its partner passive (the weapon still needs level 5), or raises the Rally Horn short of its top level. */
  | { kind: 'pair'; weapon: EvoId; levelsLeft: number }
  /** The weapon reaches level 5 but still needs its partner passive. */
  | { kind: 'needs'; weapon: WeaponId }
  /** The evolution itself (a treasure card). */
  | { kind: 'evolve'; weapon: EvoId };
/** What a card does for the "secret upgrade" (a weapon's evolution), for the card's badge. Null = nothing. */
export function evolutionHint(p: SiegePlayer, o: Option): EvoHint | null {
  if (o.kind === 'evolve') return { kind: 'evolve', weapon: o.id };
  // The Rally Horn has no partner: its three levels are the price of its secret upgrade (the Boiler Heart).
  if (o.kind === 'horn') return o.level >= HORN_MAX ? { kind: 'ready', weapon: 'horn' } : { kind: 'pair', weapon: 'horn', levelsLeft: HORN_MAX - o.level };
  if (o.kind === 'weapon') {
    if (owned(p, o.id)?.evolved) return null;
    const paired = passiveLevel(p, WEAPONS[o.id].partner) > 0;
    if (o.level >= MAX_LEVEL) return paired ? { kind: 'ready', weapon: o.id } : { kind: 'needs', weapon: o.id };
    return paired ? { kind: 'pair', weapon: o.id, levelsLeft: MAX_LEVEL - o.level } : null;
  }
  if (o.kind === 'passive' && o.level === 1) {
    // A new passive that is the partner of a weapon you hold. (Upgrading a partner you already have changes nothing.)
    const w = p.weapons.find((x) => !x.evolved && WEAPONS[x.id].partner === o.id);
    if (!w) return null;
    return w.level >= MAX_LEVEL ? { kind: 'ready', weapon: w.id } : { kind: 'pair', weapon: w.id, levelsLeft: MAX_LEVEL - w.level };
  }
  return null;
}

/** Debug/test helper: total live entities on a board. */
export function boardCounts(b: Board) {
  const n = (list: { on: boolean }[]) => list.reduce((k, x) => k + (x.on ? 1 : 0), 0);
  return { mobs: n(b.mobs), bigs: n(b.bigs), projs: n(b.projs), shots: n(b.shots), gems: n(b.gems), chests: n(b.chests), blasts: n(b.blasts) };
}
