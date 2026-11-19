/**
 * Toy Tower Tumble rules core: a random-merge tower defence, one 8×8 board per player.
 *
 * Deterministic and pure: no DOM, no three.js, no timers, no Math.random. Every random roll comes
 * from a per-player mulberry32 stream stored in the state (`rng`), so the state is plain,
 * serialisable data that a future authoritative server can step and send as it is.
 *
 * Waves are shared: every board spawns the same enemies at the same moment. A wave ends when
 * every board still in has cleared it (killed or leaked everything); then a short build phase
 * runs before the next wave. Building, merging and selling are allowed at any time.
 *
 * Render-side feedback (shots, deaths) is written into small fixed ring buffers on each board,
 * reused in place, so a busy wave allocates nothing for presentation. Rare happenings (builds,
 * merges, quests, leaks, bosses, knockouts) go out through `drainEvents`.
 */
import { seededRng, shuffle, subSeed } from '../rng';
import { rankByKey } from '../scoring';
import type { MatchEvent, RulesCore } from '../types';
import { BUILD_ORDER, GLIDE, WALK, dist2, isBuildable, pointAt, type Polyline } from './board';
import {
  BOSSES, BUILD_COST, BUILDER, ENEMIES, FAMILIES, LUCKY_CAP, MAX_BUILDER, MAX_TIER, QUESTS, START_GOLD, START_LIVES, TIER_POOLS, TOWERS, WAVES,
  bossBounty, sellValue, waveBonus, waveBounty, waveHp, type EnemyKind, type QuestId, type TowerDef,
} from './catalogue';

export interface Tower {
  id: number; def: string; cell: number;
  /** Milliseconds until the next shot (≤ 0 = ready). */
  cd: number; shots: number;
  /** Damage dealt by this tower (for the info panel). */
  dealt: number;
  /** Simulation time it appeared (build, merge or gift), for the arrival glow. */
  bornAt: number; how: 'build' | 'merge' | 'lucky' | 'gift';
  /** Strongest plush aura reaching it. */
  auraDamage: number; auraSpeed: number;
}
export interface Enemy {
  id: number; kind: EnemyKind; boss: boolean; flying: boolean;
  hp: number; maxHp: number; armour: number;
  /** Distance travelled along its route (board units), and where that is. */
  dist: number; x: number; z: number; speed: number;
  slow: number; slowUntil: number; stunUntil: number; burn: number; burnUntil: number; markUntil: number;
  bounty: number; leak: number;
}
/** One tower shot, for the effects layer. `hops` holds chain jumps as x,z pairs. */
export interface Shot { serial: number; t: number; tower: number; def: string; x: number; z: number; tx: number; tz: number; splash: number; hops: number[]; hopCount: number; effects: number }
/** A defeated or leaked enemy, for the effects layer. */
export interface Pop { serial: number; t: number; x: number; z: number; kind: EnemyKind; boss: boolean; leaked: boolean }
/** Status bits on a Shot, so effects can show what a hit did. */
export const FX_SLOW = 1, FX_BURN = 2, FX_STUN = 4, FX_MARK = 8, FX_SHRED = 16, FX_EXECUTE = 32, FX_FURY = 64;
export const SHOT_RING = 48, POP_RING = 24, MAX_HOPS = 6;

export interface TdPlayer {
  id: string; human: boolean;
  /** mulberry32 state for this board's build and merge rolls. */
  rng: number;
  gold: number; lives: number; builder: number;
  towers: Tower[]; enemies: Enemy[];
  out: boolean; outWave: number;
  /** Waves survived. */
  cleared: number;
  damage: number; kills: number; leaks: number; bonus: number;
  builds: number; merges: number; luckyMerges: number; maxTier: number;
  quests: Record<QuestId, boolean>;
  /** Waves in a row without a leak, and whether this wave has leaked yet. */
  streak: number; leakedThisWave: boolean;
  ready: boolean; spawnIdx: number;
  /** Free towers waiting for an empty square (boss rewards on a full board). */
  gifts: string[];
  shots: Shot[]; shotSerial: number; pops: Pop[]; popSerial: number;
  lastLeakAt: number; auraDirty: boolean; boardDirty: boolean;
}
export type TdInput =
  | { type: 'build'; cell?: number }
  | { type: 'merge'; from: number; to: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'sell'; cell: number }
  | { type: 'builder' }
  | { type: 'ready' }
  | { type: 'speed'; speed: number };

export interface TdConfig {
  /** Build phase before wave 1, and between waves. */
  firstBuildMs: number; buildMs: number;
  /** Build phase when no human is still in (bots only). */
  botBuildMs: number;
  /** A wave that has not been cleared this long after it started ends anyway: what is left leaks. */
  waveCapMs: number;
  waves: number;
}
export const DEFAULT_CONFIG: TdConfig = { firstBuildMs: 20000, buildMs: 8000, botBuildMs: 3000, waveCapMs: 90000, waves: WAVES.length };
export const SPEEDS = [1, 2, 4] as const;

export interface TdState {
  kind: 'tower-tumble'; seed: number; config: TdConfig;
  t: number; phase: 'build' | 'wave' | 'over'; phaseEnds: number;
  /** Current (or next, during a build phase) wave, 1-based. */
  wave: number; waveT: number;
  spawns: { at: number; kind: EnemyKind }[];
  players: TdPlayer[]; nextId: number; events: MatchEvent[];
  /** Quest targets for this match ("own 3 of …"), the same for everyone. */
  orders: { t1: string; t2: string; t3: string };
  /** Who claimed "first tier 6 in the lobby" (several only if they reached it in the same step). */
  firstSix: string[]; firstSixAt: number;
  /** Spectator fast-forward, only once every human is knocked out. */
  speed: number;
  /** True once a board has cleared the final wave. */
  victory: boolean;
}

// ─────────────────────────────────────────────── helpers ───────────────────────────────────────────────

/** One mulberry32 draw from a player's stream (same generator as `seededRng`). */
function rand(p: TdPlayer): number {
  p.rng = (p.rng + 0x6d2b79f5) >>> 0;
  let t = p.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(p: TdPlayer, items: readonly T[]) => items[Math.floor(rand(p) * items.length)];
export const towerAt = (p: TdPlayer, cell: number) => p.towers.find((t) => t.cell === cell);
export const defOf = (t: Tower): TowerDef => TOWERS[t.def];
export const humansIn = (s: TdState) => s.players.filter((p) => p.human && !p.out).length;
export const allHumansOut = (s: TdState) => s.players.some((p) => p.human) && humansIn(s) === 0;
/** The next builder level's price, or null at the top level. */
export const builderCost = (p: TdPlayer) => (p.builder < MAX_BUILDER ? BUILDER[p.builder].cost : null);
/** Towers on this board with the same id as `t` (its merge partners). */
export const twinsOf = (p: TdPlayer, t: Tower) => p.towers.filter((o) => o !== t && o.def === t.def && TOWERS[t.def].tier < MAX_TIER);
export const freeCell = (p: TdPlayer) => BUILD_ORDER.find((c) => !p.towers.some((t) => t.cell === c));
export const canBuild = (s: TdState, p: TdPlayer) => s.phase !== 'over' && !p.out && p.gold >= BUILD_COST && freeCell(p) !== undefined;

/** Roll a build: a tier from the builder odds, then a tower from that tier. */
export function rollBuild(p: TdPlayer): string {
  const odds = BUILDER[p.builder - 1].build, r = rand(p) * 100;
  const tier = r < odds[0] ? 1 : r < odds[0] + odds[1] ? 2 : 3;
  return pick(p, TIER_POOLS[tier - 1]);
}
/** Roll a merge of two tier-`tier` towers: usually the next tier; a lucky merge jumps two (never past LUCKY_CAP). */
export function rollMerge(p: TdPlayer, tier: number): { def: string; lucky: boolean } {
  const lucky = tier + 2 <= LUCKY_CAP && rand(p) * 100 < BUILDER[p.builder - 1].lucky;
  const next = Math.min(MAX_TIER, tier + (lucky ? 2 : 1));
  return { def: pick(p, TIER_POOLS[next - 1]), lucky };
}

function place(s: TdState, p: TdPlayer, def: string, cell: number, how: Tower['how']) {
  p.towers.push({ id: s.nextId++, def, cell, cd: 0, shots: 0, dealt: 0, bornAt: s.t, how, auraDamage: 0, auraSpeed: 0 });
  p.maxTier = Math.max(p.maxTier, TOWERS[def].tier);
  p.auraDirty = true; p.boardDirty = true;
}
function placeGifts(s: TdState, p: TdPlayer) {
  while (p.gifts.length) {
    const cell = freeCell(p);
    if (cell === undefined) return;
    const def = p.gifts.shift()!;
    place(s, p, def, cell, 'gift');
    s.events.push({ type: 'td-gift', id: p.id, def, cell });
  }
}
function grantQuest(s: TdState, p: TdPlayer, q: QuestId) {
  if (p.quests[q]) return;
  const def = QUESTS[q];
  p.quests[q] = true; p.gold += def.gold; p.lives += def.lives ?? 0;
  if (def.builder && p.builder < MAX_BUILDER) p.builder++;
  s.events.push({ type: 'td-quest', id: p.id, quest: q });
}
/** Progress towards every quest, as [have, need]. Pure: the HUD uses it too. */
export function questProgress(s: TdState, p: TdPlayer): Record<QuestId, [number, number]> {
  const count = new Map<string, number>();
  for (const t of p.towers) count.set(t.def, (count.get(t.def) ?? 0) + 1);
  const n = (id: string) => count.get(id) ?? 0;
  const families = new Set(p.towers.filter((t) => TOWERS[t.def].tier >= 3).map((t) => TOWERS[t.def].family));
  return {
    collect5: [TIER_POOLS[0].filter((id) => n(id) > 0).length, 5],
    triple2: [Math.max(0, ...TIER_POOLS[1].map(n)), 3],
    order1: [n(s.orders.t1), 3], order2: [n(s.orders.t2), 3], order3: [n(s.orders.t3), 3],
    first6: [p.maxTier >= 6 ? 1 : 0, 1],
    clean5: [p.streak, 5],
    album: [families.size, FAMILIES.length],
  };
}
function checkQuests(s: TdState, p: TdPlayer) {
  const prog = questProgress(s, p);
  for (const q of ['collect5', 'triple2', 'order1', 'order2', 'order3', 'album'] as const) if (prog[q][0] >= prog[q][1]) grantQuest(s, p, q);
  // Lobby-wide: the first to own a tier 6 (anyone who gets there in the same step shares it).
  if (!p.quests.first6 && p.towers.some((t) => TOWERS[t.def].tier >= 6) && (!s.firstSix.length || s.firstSixAt === s.t)) {
    if (!s.firstSix.length) s.firstSixAt = s.t;
    s.firstSix.push(p.id); grantQuest(s, p, 'first6');
  }
}
function recomputeAuras(p: TdPlayer) {
  for (const t of p.towers) { t.auraDamage = 0; t.auraSpeed = 0; }
  for (const src of p.towers) {
    const d = TOWERS[src.def];
    if (!d.aura) continue;
    for (const t of p.towers) {
      if (t === src || dist2(t.cell, src.cell % 8, Math.floor(src.cell / 8)) > d.aura * d.aura) continue;
      t.auraDamage = Math.max(t.auraDamage, d.auraDamage); t.auraSpeed = Math.max(t.auraSpeed, d.auraSpeed);
    }
  }
  p.auraDirty = false;
}

// ─────────────────────────────────────────────── inputs ───────────────────────────────────────────────

function apply(s: TdState, p: TdPlayer, input: TdInput) {
  if (input.type === 'speed') {
    if (p.human && allHumansOut(s) && (SPEEDS as readonly number[]).includes(input.speed)) s.speed = input.speed;
    return;
  }
  if (p.out || s.phase === 'over') return;
  switch (input.type) {
    case 'ready': if (s.phase === 'build') p.ready = true; return;
    case 'builder': {
      const cost = builderCost(p);
      if (cost === null || p.gold < cost) return;
      p.gold -= cost; p.builder++; s.events.push({ type: 'td-builder', id: p.id, level: p.builder }); return;
    }
    case 'build': {
      if (p.gold < BUILD_COST) return;
      let cell = input.cell;
      if (cell === undefined) cell = freeCell(p);
      else if (!isBuildable(cell) || towerAt(p, cell)) return;
      if (cell === undefined) return;
      const def = rollBuild(p);
      p.gold -= BUILD_COST; p.builds++;
      place(s, p, def, cell, 'build');
      s.events.push({ type: 'td-build', id: p.id, def, cell }); return;
    }
    case 'merge': {
      const a = towerAt(p, input.from), b = towerAt(p, input.to);
      if (!a || !b || a === b || a.def !== b.def || TOWERS[a.def].tier >= MAX_TIER) return;
      const { def, lucky } = rollMerge(p, TOWERS[a.def].tier);
      p.towers = p.towers.filter((t) => t !== a);
      b.def = def; b.cd = 0; b.shots = 0; b.bornAt = s.t; b.how = lucky ? 'lucky' : 'merge';
      p.merges++; if (lucky) p.luckyMerges++;
      p.maxTier = Math.max(p.maxTier, TOWERS[def].tier); p.auraDirty = true; p.boardDirty = true;
      s.events.push({ type: 'td-merge', id: p.id, def, cell: b.cell, lucky });
      placeGifts(s, p); return;
    }
    case 'move': {
      const a = towerAt(p, input.from);
      if (!a || !isBuildable(input.to) || input.from === input.to) return;
      const b = towerAt(p, input.to);
      if (b) b.cell = a.cell;
      a.cell = input.to; p.auraDirty = true; return;
    }
    case 'sell': {
      const a = towerAt(p, input.cell);
      if (!a) return;
      p.towers = p.towers.filter((t) => t !== a);
      p.gold += sellValue(TOWERS[a.def].tier); p.auraDirty = true; p.boardDirty = true;
      s.events.push({ type: 'td-sell', id: p.id, def: a.def, cell: a.cell });
      placeGifts(s, p); return;
    }
  }
}

// ─────────────────────────────────────────────── waves ───────────────────────────────────────────────

function scheduleWave(s: TdState) {
  const spawns: TdState['spawns'] = [];
  for (const g of WAVES[s.wave - 1]) for (let i = 0; i < g.count; i++) spawns.push({ at: (g.delayMs ?? 0) + i * g.gapMs, kind: g.kind });
  spawns.sort((a, b) => a.at - b.at);
  s.spawns = spawns;
}
function startWave(s: TdState) {
  scheduleWave(s);
  s.phase = 'wave'; s.waveT = 0;
  for (const p of s.players) { p.spawnIdx = 0; p.ready = false; p.leakedThisWave = false; }
  s.events.push({ type: 'td-wave', wave: s.wave, boss: s.wave in BOSSES });
}
function startBuild(s: TdState, first = false) {
  s.phase = 'build';
  s.phaseEnds = s.t + (humansIn(s) ? (first ? s.config.firstBuildMs : s.config.buildMs) : s.config.botBuildMs);
  for (const p of s.players) p.ready = false;
}
function spawn(s: TdState, p: TdPlayer, kind: EnemyKind) {
  const def = ENEMIES[kind], w = s.wave, boss = kind === 'boss', b = BOSSES[w];
  const hp = Math.round(waveHp(w) * (boss ? b?.hp ?? 20 : def.hp));
  const e: Enemy = {
    id: s.nextId++, kind, boss, flying: boss ? !!b?.flying : def.flying, hp, maxHp: hp, armour: Math.round(def.armour * w * 10) / 10,
    dist: 0, x: 0, z: 0, speed: def.speed, slow: 0, slowUntil: 0, stunUntil: 0, burn: 0, burnUntil: 0, markUntil: 0,
    bounty: boss ? bossBounty(w) : Math.max(1, Math.round(def.bounty * waveBounty(w))), leak: def.leak,
  };
  pointAt(e.flying ? GLIDE : WALK, 0, e);
  p.enemies.push(e);
}
function knockOut(s: TdState, p: TdPlayer) {
  p.out = true; p.outWave = s.wave; p.lives = 0; p.enemies.length = 0; p.ready = false;
  s.events.push({ type: 'td-out', id: p.id, wave: s.wave });
}
function pop(s: TdState, p: TdPlayer, e: Enemy, leaked: boolean) {
  const slot = p.pops[p.popSerial % POP_RING];
  p.popSerial++;
  slot.serial = p.popSerial; slot.t = s.t; slot.x = e.x; slot.z = e.z; slot.kind = e.kind; slot.boss = e.boss; slot.leaked = leaked;
}
function leak(s: TdState, p: TdPlayer, e: Enemy) {
  e.hp = 0; p.lives -= e.leak; p.leaks++; p.leakedThisWave = true; p.lastLeakAt = s.t;
  pop(s, p, e, true);
  s.events.push({ type: 'td-leak', id: p.id, lives: Math.max(0, p.lives), boss: e.boss });
  if (p.lives <= 0) knockOut(s, p);
}
function endWave(s: TdState) {
  for (const p of s.players) {
    if (p.out) continue;
    p.cleared = s.wave; p.gold += waveBonus(s.wave);
    p.streak = p.leakedThisWave ? 0 : p.streak + 1;
    if (p.streak >= 5) grantQuest(s, p, 'clean5');
  }
  s.events.push({ type: 'td-cleared', wave: s.wave });
  if (s.wave >= s.config.waves) { s.victory = true; finish(s); return; }
  s.wave++;
  startBuild(s);
}
function finish(s: TdState) {
  if (s.phase === 'over') return;
  s.phase = 'over'; s.events.push({ type: 'over' });
}

// ─────────────────────────────────────────────── combat ───────────────────────────────────────────────

const routeOf = (e: Enemy): Polyline => (e.flying ? GLIDE : WALK);
/** The enemy furthest along its route (as a fraction) within range of `cell`, skipping `skip`. */
function leader(p: TdPlayer, cell: number, range: number, skip: Enemy | null): Enemy | null {
  const r2 = range * range;
  let best: Enemy | null = null, bestK = -1;
  for (const e of p.enemies) {
    if (e.hp <= 0 || e === skip || dist2(cell, e.x, e.z) > r2) continue;
    const k = e.dist / routeOf(e).length;
    if (k > bestK) { bestK = k; best = e; }
  }
  return best;
}
function hit(s: TdState, p: TdPlayer, tower: Tower, d: TowerDef, e: Enemy, damage: number, primary: boolean): number {
  if (e.hp <= 0) return 0;
  let fx = 0;
  let dmg = d.abilities.includes('pierce') ? damage : Math.max(1, damage - e.armour);
  if (e.markUntil > s.t) dmg *= 1.25;
  e.hp -= dmg; p.damage += dmg; tower.dealt += dmg;
  if (d.slow) {
    const slow = Math.min(0.6, e.boss ? d.slow / 2 : d.slow);
    if (e.slowUntil <= s.t || slow >= e.slow) { e.slow = slow; e.slowUntil = s.t + d.slowMs; }
    fx |= FX_SLOW;
  }
  for (const a of d.abilities) {
    if (a === 'burn') { const burn = dmg * 0.3; if (e.burnUntil <= s.t || burn >= e.burn) { e.burn = burn; e.burnUntil = s.t + 3000; } fx |= FX_BURN; }
    else if (a === 'shred') { e.armour = Math.max(0, e.armour - d.tier); fx |= FX_SHRED; }
    else if (a === 'mark') { e.markUntil = s.t + 2500; fx |= FX_MARK; }
    else if (a === 'stun' && primary && !e.boss && tower.shots % 4 === 3) { e.stunUntil = s.t + 600; fx |= FX_STUN; }
    else if (a === 'execute' && !e.boss && e.hp > 0 && e.hp < e.maxHp * 0.15) { p.damage += e.hp; tower.dealt += e.hp; e.hp = 0; fx |= FX_EXECUTE; }
  }
  if (e.hp <= 0) kill(s, p, e);
  return fx;
}
function kill(s: TdState, p: TdPlayer, e: Enemy) {
  e.hp = 0; p.gold += e.bounty; p.kills++;
  pop(s, p, e, false);
  if (e.boss) {
    s.events.push({ type: 'td-boss-down', id: p.id, wave: s.wave });
    const tier = s.wave === 5 ? 4 : s.wave === 10 || s.wave === 15 ? 5 : 0;
    if (tier) p.gifts.push(pick(p, TIER_POOLS[tier - 1]));
    if (s.wave === 15 && p.builder < MAX_BUILDER) p.builder++;
    if (s.wave === 20) p.bonus += 500;
    placeGifts(s, p);
  }
}
function record(s: TdState, p: TdPlayer, tower: Tower, e: Enemy, splash: number): Shot {
  const shot = p.shots[p.shotSerial % SHOT_RING];
  p.shotSerial++;
  shot.serial = p.shotSerial; shot.t = s.t; shot.tower = tower.id; shot.def = tower.def;
  shot.x = tower.cell % 8; shot.z = Math.floor(tower.cell / 8); shot.tx = e.x; shot.tz = e.z; shot.splash = splash; shot.hopCount = 0; shot.effects = 0;
  return shot;
}
function fire(s: TdState, p: TdPlayer, tower: Tower, d: TowerDef, target: Enemy) {
  tower.shots++;
  let damage = d.damage * (1 + tower.auraDamage);
  let fury = 0;
  if (d.abilities.includes('fury') && tower.shots % 3 === 0) { damage *= 2; fury = FX_FURY; }
  const shot = record(s, p, tower, target, d.splash);
  const tx = target.x, tz = target.z;
  if (d.splash) {
    const r2 = d.splash * d.splash, inner = r2 / 4;
    let fx = 0;
    for (const e of p.enemies) {
      if (e.hp <= 0) continue;
      const dd = (e.x - tx) ** 2 + (e.z - tz) ** 2;
      if (dd <= r2) fx |= hit(s, p, tower, d, e, dd <= inner ? damage : damage * 0.6, e === target);
    }
    shot.effects = fx | fury;
  } else if (d.chain) {
    let fx = hit(s, p, tower, d, target, damage, true), from = target, dmg = damage;
    // Each jump goes to the nearest enemy not yet struck, within 1.6 squares of the last one.
    const struck: Enemy[] = [target];
    for (let j = 0; j < d.chain && j < MAX_HOPS; j++) {
      let next: Enemy | null = null, best = 1.6 * 1.6;
      for (const e of p.enemies) {
        if (e.hp <= 0 || struck.includes(e)) continue;
        const dd = (e.x - from.x) ** 2 + (e.z - from.z) ** 2;
        if (dd <= best) { best = dd; next = e; }
      }
      if (!next) break;
      dmg *= 0.75; struck.push(next);
      shot.hops[shot.hopCount * 2] = next.x; shot.hops[shot.hopCount * 2 + 1] = next.z; shot.hopCount++;
      fx |= hit(s, p, tower, d, next, dmg, false);
      from = next;
    }
    shot.effects = fx | fury;
  } else shot.effects = hit(s, p, tower, d, target, damage, true) | fury;
  if (d.abilities.includes('multishot')) {
    const second = leader(p, tower.cell, d.range, target);
    if (second) { const extra = record(s, p, tower, second, d.splash); extra.effects = hit(s, p, tower, d, second, damage, false); }
  }
}

function advanceBoard(s: TdState, p: TdPlayer, dt: number) {
  if (p.auraDirty) recomputeAuras(p);
  while (p.spawnIdx < s.spawns.length && s.spawns[p.spawnIdx].at <= s.waveT) spawn(s, p, s.spawns[p.spawnIdx++].kind);
  const sec = dt / 1000;
  for (const e of p.enemies) {
    if (e.hp <= 0) continue;
    if (e.burnUntil > s.t) { const b = Math.min(e.hp, e.burn * sec); e.hp -= b; p.damage += b; if (e.hp <= 0.0001) { kill(s, p, e); continue; } }
    if (e.stunUntil <= s.t) {
      e.dist += e.speed * (1 - (e.slowUntil > s.t ? e.slow : 0)) * sec;
      const route = routeOf(e);
      pointAt(route, e.dist, e);
      if (e.dist >= route.length) { leak(s, p, e); if (p.out) return; }
    }
  }
  for (const tower of p.towers) {
    tower.cd -= dt * (1 + tower.auraSpeed);
    if (tower.cd > 0) continue;
    const d = TOWERS[tower.def], target = leader(p, tower.cell, d.range, null);
    if (!target) { tower.cd = 0; continue; }
    fire(s, p, tower, d, target);
    tower.cd += d.cooldownMs;
  }
  // Drop the dead (kills and leaks) in place.
  let n = 0;
  for (const e of p.enemies) if (e.hp > 0) p.enemies[n++] = e;
  p.enemies.length = n;
}

function advance(s: TdState, dt: number) {
  s.t += dt;
  if (s.phase === 'build') {
    const humans = s.players.filter((p) => p.human && !p.out);
    if (s.t >= s.phaseEnds || (humans.length > 0 && humans.every((p) => p.ready))) startWave(s);
    return;
  }
  if (s.phase !== 'wave') return;
  s.waveT += dt;
  for (const p of s.players) if (!p.out) advanceBoard(s, p, dt);
  if (s.players.every((p) => p.out)) { finish(s); return; }
  const live = s.players.filter((p) => !p.out);
  const spawned = live.every((p) => p.spawnIdx >= s.spawns.length);
  if (spawned && live.every((p) => p.enemies.length === 0)) { endWave(s); return; }
  if (s.waveT >= s.config.waveCapMs) {
    // Too long: whatever is left gets through.
    for (const p of live) {
      while (p.spawnIdx < s.spawns.length) spawn(s, p, s.spawns[p.spawnIdx++].kind);
      for (const e of p.enemies) if (!p.out && e.hp > 0) leak(s, p, e);
      p.enemies.length = 0;
    }
    if (s.players.every((p) => p.out)) finish(s); else endWave(s);
  }
}

// ─────────────────────────────────────────────── the core ───────────────────────────────────────────────

const finished = (s: TdState) => s.phase === 'over';
const blankQuests = (): Record<QuestId, boolean> => ({ collect5: false, triple2: false, order1: false, order2: false, order3: false, first6: false, clean5: false, album: false });
const blankShot = (): Shot => ({ serial: 0, t: 0, tower: 0, def: '', x: 0, z: 0, tx: 0, tz: 0, splash: 0, hops: new Array(MAX_HOPS * 2).fill(0), hopCount: 0, effects: 0 });
const blankPop = (): Pop => ({ serial: 0, t: 0, x: 0, z: 0, kind: 'walker', boss: false, leaked: false });

export const tumbleRules: RulesCore<TdState, TdInput, TdConfig> = {
  init(contestants, seed, config) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (!contestants.length || contestants.length > 8) throw new Error('Toy Tower Tumble needs 1–8 players.');
    if (!Number.isInteger(cfg.waves) || cfg.waves < 1 || cfg.waves > WAVES.length) throw new Error('Invalid Toy Tower Tumble configuration.');
    const orderRng = seededRng(subSeed(seed, 'orders'));
    const s: TdState = {
      kind: 'tower-tumble', seed, config: cfg, t: 0, phase: 'build', phaseEnds: 0, wave: 1, waveT: 0, spawns: [], nextId: 1, events: [],
      orders: { t1: shuffle(orderRng, TIER_POOLS[0])[0], t2: shuffle(orderRng, TIER_POOLS[1])[0], t3: shuffle(orderRng, TIER_POOLS[2])[0] },
      firstSix: [], firstSixAt: -1, speed: 1, victory: false,
      players: contestants.map((c) => ({
        id: c.id, human: !c.bot, rng: subSeed(seed, `board:${c.id}`), gold: START_GOLD, lives: START_LIVES, builder: 1, towers: [], enemies: [],
        out: false, outWave: 0, cleared: 0, damage: 0, kills: 0, leaks: 0, bonus: 0, builds: 0, merges: 0, luckyMerges: 0, maxTier: 0,
        quests: blankQuests(), streak: 0, leakedThisWave: false, ready: false, spawnIdx: 0, gifts: [],
        shots: Array.from({ length: SHOT_RING }, blankShot), shotSerial: 0, pops: Array.from({ length: POP_RING }, blankPop), popSerial: 0,
        lastLeakAt: -1e9, auraDirty: false, boardDirty: false,
      })),
    };
    startBuild(s, true);
    return s;
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over' || !Number.isFinite(dtMs) || dtMs <= 0) return s;
    for (const p of s.players) {
      for (const input of inputs[p.id] ?? []) apply(s, p, input);
      if (p.boardDirty && !p.out) { p.boardDirty = false; checkQuests(s, p); }
    }
    if (!allHumansOut(s)) s.speed = 1;
    for (let i = 0; i < s.speed && !finished(s); i++) {
      advance(s, dtMs);
      for (const p of s.players) if (p.boardDirty && !p.out) { p.boardDirty = false; checkQuests(s, p); }
    }
    return s;
  },
  isOver: (s) => s.phase === 'over',
  result(s) {
    const score = (p: TdPlayer) => Math.round(p.damage / 10) + p.bonus;
    const ordered = [...s.players].sort((a, b) => b.cleared - a.cleared || Math.max(0, b.lives) - Math.max(0, a.lives) || score(b) - score(a));
    return {
      durationMs: s.t,
      placements: rankByKey(ordered.map((p) => ({ contestantId: p.id, score: p.cleared, key: `${p.cleared}:${Math.max(0, p.lives)}:${score(p)}`, eliminated: p.out }))),
      stats: { wave: Math.min(s.wave, s.config.waves), victory: s.victory ? 1 : 0 },
    };
  },
  drainEvents(s) { const events = s.events; s.events = []; return events; },
};

/** Score shown on the HUD and used as the last tie-break: damage / 10, plus the final boss bounty. */
export const boardScore = (p: TdPlayer) => Math.round(p.damage / 10) + p.bonus;

// ─────────────────────────────────────────────── spectating ───────────────────────────────────────────────

/** Boards worth watching, in seat order: everyone still in, then (if nobody is) every board. */
export function watchable(s: TdState): string[] {
  const live = s.players.filter((p) => !p.out).map((p) => p.id);
  return live.length ? live : s.players.map((p) => p.id);
}
/** The next board to watch from `current`, cycling `dir` (±1) through `watchable`. */
export function cycleWatch(s: TdState, current: string, dir: 1 | -1): string {
  const list = watchable(s);
  const i = list.indexOf(current);
  if (i < 0) return list[dir > 0 ? 0 : list.length - 1];
  return list[(i + dir + list.length) % list.length];
}
/** Which board a viewer should see: their own while they are in, otherwise the requested one if still watchable. */
export function viewedBoard(s: TdState, viewer: string, requested: string | null): string {
  const me = s.players.find((p) => p.id === viewer);
  if (me && !me.out) return viewer;
  const list = watchable(s);
  if (requested && list.includes(requested)) return requested;
  return list[0] ?? viewer;
}
