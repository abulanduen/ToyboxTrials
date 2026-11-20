/** Toy Squad progression, validated shop commands and round lifecycle. */
import { seededRng, shuffle, subSeed } from '../rng';
import { rankByKey } from '../scoring';
import type { MatchEvent, RulesCore } from '../types';
import { PASSIVES, ROSTER, SHOP_ODDS, UNIT_POOLS, type PassiveId, type UnitKind } from './catalogue';
import { makeFighters, tickBattle } from './combat';
import type { BuffStat } from './kits';
export { ROSTER, type UnitKind } from './catalogue';
export { tickBattle } from './combat';
export const BOARD_SIZE = 8, DEPLOY_CELLS = 32, MAX_UNITS = 10, BENCH_SIZE = 8, SHOP_SIZE = 5;
export const boardLimit = (level: number) => Math.min(MAX_UNITS, level + 2);
export const deploymentPosition = (cell: number, side: 0 | 1) => ({ x: cell % 8, z: side === 0 ? 4 + Math.floor(cell / 8) : 3 - Math.floor(cell / 8) });
export interface SquadUnit { id: number; kind: UnitKind; tier: number; cell: number; upgradedAt?: number }
export interface SquadPlayer {
  id: string; level: number; coins: number; units: SquadUnit[]; ready: boolean; points: number; health: number; wins: number;
  shop: (UnitKind | null)[]; roll: number; passives: PassiveId[]; passiveOffers: PassiveId[];
  /** How this player's battle went last round (public: the player rail marks the winners), or null before the first. */
  last: 'win' | 'loss' | 'draw' | null;
}
export type SquadInput = { type: 'buy'; slot: number } | { type: 'move'; unit: number; cell: number }
  | { type: 'merge'; unit: number; other: number } | { type: 'sell' | 'bench'; unit: number }
  | { type: 'ready' | 'reroll' } | { type: 'passive'; passive: PassiveId };
export interface Fighter {
  id: number; kind: UnitKind; tier: number; side: 0 | 1; x: number; z: number; hp: number; maxHp: number;
  facing: number; armour: number; shield: number; poison: number; stunnedUntil: number; attacks: number;
  bonusDamage: number; range: number;
  /** Read-only battle tally for the damage overview: health damage dealt (all, and the part from spells and passives) and taken. Never read by the rules. */
  stats: { dealt: number; spell: number; taken: number };
  magic: {
    mana: number; maxMana: number; nextCast: number; casts: number; lastSpell: string; baseRange: number;
    spellPower: number; healPower: number; attackMana: number; markBonus: number;
    poisonPower: number; markedUntil: number; markPower: number; silencedUntil: number; hurtCount: number; wounded: boolean;
    buffs: { key: string; stat: BuffStat; amount: number; until: number }[];
  };
}
export interface AttackEffect { serial: number; from: number; to: number; kind: UnitKind; x: number; z: number; tx: number; tz: number; spell?: string; radius?: number }
export interface DamageEffect { serial: number; unit: number; x: number; z: number; amount: number }
export interface Battle {
  owner: string; opponent: string; fighters: Fighter[]; done: boolean; outcome: 'win' | 'loss' | 'draw' | null;
  health: number; attacks: AttackEffect[]; damages: DamageEffect[]; tick: number; homePassives: PassiveId[]; awayPassives: PassiveId[];
}
export interface SquadConfig { rounds: number; buildMs: number; battleMs: number; recapMs: number; tickMs: number; income: number; rerollCost: number }
export const DEFAULT_CONFIG: SquadConfig = { rounds: 10, buildMs: 35000, battleMs: 25000, recapMs: 3000, tickMs: 500, income: 10, rerollCost: 2 };
export interface SquadState {
  kind: 'toy-squad'; seed: number; config: SquadConfig; t: number; phase: 'build' | 'battle' | 'recap' | 'over';
  phaseEnds: number; nextTick: number; round: number; nextId: number; players: SquadPlayer[]; battles: Battle[]; events: MatchEvent[];
}
const validCell = (c: number) => Number.isInteger(c) && c >= -BENCH_SIZE && c < DEPLOY_CELLS;
export const unitHp = (u: Pick<SquadUnit, 'kind' | 'tier'>) => ROSTER[u.kind].hp * 2 ** (u.tier - 1);
export const rerollPrice = (s: SquadState, p: SquadPlayer) => Math.max(1, s.config.rerollCost - (p.passives.includes('bargain') ? 1 : 0));
export function rollShop(seed: number, level: number): UnitKind[] {
  const rng = seededRng(seed), odds = SHOP_ODDS[Math.min(10, Math.max(1, level)) - 1];
  return Array.from({ length: SHOP_SIZE }, () => {
    const roll = rng() * 100; let cumulative = 0, rarity = 0;
    for (; rarity < 4; rarity++) { cumulative += odds[rarity]; if (roll < cumulative) break; }
    const pool = UNIT_POOLS[rarity]; return pool[Math.floor(rng() * pool.length)];
  });
}
function refresh(s: SquadState, p: SquadPlayer) { p.shop = rollShop(subSeed(s.seed, `${s.round}:${p.id}:${p.roll++}`), p.level); }
function passiveOffers(s: SquadState, p: SquadPlayer) {
  p.passiveOffers = [3, 6, 9].includes(s.round) ? shuffle(seededRng(subSeed(s.seed, `passive:${s.round}:${p.id}`)), (Object.keys(PASSIVES) as PassiveId[]).filter(id => !p.passives.includes(id))).slice(0, 3) : [];
}
const freeBench = (p: SquadPlayer) => Array.from({ length: BENCH_SIZE }, (_, i) => -i - 1).find(c => !p.units.some(u => u.cell === c));
export const canMerge = (a: SquadUnit, b: SquadUnit) => a.id !== b.id && a.kind === b.kind && a.tier === b.tier && a.tier < 3;
function merge(s: SquadState, p: SquadPlayer, source: SquadUnit, target: SquadUnit) {
  if (!canMerge(source, target)) return;
  target.tier++; target.upgradedAt = s.t; p.units = p.units.filter(u => u !== source); s.events.push({ type: 'squad-upgrade', id: p.id });
}
const mergeOrder = (a: SquadUnit, b: SquadUnit) => Number(a.cell < 0) - Number(b.cell < 0) || a.id - b.id;
/** Preview all existing recipients in a purchase's automatic chain, preferring deployed toys. */
export function purchaseUpgradeTargets(p: SquadPlayer, kind: UnitKind): SquadUnit[] {
  const targets: SquadUnit[] = [];
  for (let tier = 1; tier < 3; tier++) {
    const target = p.units.filter(u => u.kind === kind && u.tier === tier).sort(mergeOrder)[0];
    if (!target) break; targets.push(target);
  }
  return targets;
}
/** Coins refunded for selling a unit: its base cost times the copies it represents, minus one (minimum 1). */
export const sellValue = (unit: Pick<SquadUnit, 'kind' | 'tier'>) => Math.max(1, ROSTER[unit.kind].cost * 2 ** (unit.tier - 1) - 1);
export function canBuy(p: SquadPlayer, kind: UnitKind) {
  return p.coins >= ROSTER[kind].cost && (purchaseUpgradeTargets(p, kind).length > 0 || p.units.filter(u => u.cell >= 0).length < boardLimit(p.level) || freeBench(p) !== undefined);
}
function autoMergePairs(s: SquadState, p: SquadPlayer) {
  for (;;) {
    const ordered = [...p.units].sort(mergeOrder);
    const target = ordered.find(u => ordered.some(other => canMerge(u, other)));
    if (!target) return;
    merge(s, p, ordered.find(u => canMerge(u, target))!, target);
  }
}
function shop(s: SquadState, p: SquadPlayer, input: SquadInput) {
  if (p.ready) return;
  if (input.type === 'passive') {
    if (p.passiveOffers.includes(input.passive)) { p.passives.push(input.passive); p.passiveOffers = []; }
    return;
  }
  if (input.type === 'ready') { if (!p.passiveOffers.length) p.ready = true; return; }
  if (input.type === 'reroll') { const cost = rerollPrice(s, p); if (p.coins >= cost) { p.coins -= cost; refresh(s, p); } return; }
  if (input.type === 'buy') {
    if (!Number.isInteger(input.slot) || input.slot < 0 || input.slot >= SHOP_SIZE) return;
    const kind = p.shop[input.slot]; if (!kind || !canBuy(p, kind)) return;
    const recipient = purchaseUpgradeTargets(p, kind)[0];
    const board = p.units.filter(u => u.cell >= 0);
    const cell = board.length < boardLimit(p.level) ? Array.from({ length: DEPLOY_CELLS }, (_, i) => i).find(c => !board.some(u => u.cell === c)) : freeBench(p);
    if (cell === undefined && !recipient) return;
    const bought = { id: s.nextId++, kind, tier: 1, cell: cell ?? recipient.cell };
    if (recipient) { p.units.push(bought); merge(s, p, bought, recipient); }
    else p.units.push(bought);
    autoMergePairs(s, p); p.coins -= ROSTER[kind].cost; p.shop[input.slot] = null;
    s.events.push({ type: 'squad-buy', id: p.id }); return;
  }
  if (!('unit' in input)) return;
  const unit = p.units.find(u => u.id === input.unit); if (!unit) return;
  if (input.type === 'merge') { const target = p.units.find(u => u.id === input.other); if (target) merge(s, p, unit, target); }
  else if (input.type === 'bench') { const cell = freeBench(p); if (cell !== undefined) unit.cell = cell; }
  else if (input.type === 'move' && validCell(input.cell)) {
    const other = p.units.find(u => u.cell === input.cell);
    if (other && canMerge(unit, other)) { merge(s, p, unit, other); return; }
    if (unit.cell < 0 && input.cell >= 0 && !other && p.units.filter(u => u.cell >= 0).length >= boardLimit(p.level)) return;
    if (other) other.cell = unit.cell; unit.cell = input.cell;
  } else if (input.type === 'sell') {
    p.units = p.units.filter(u => u !== unit); p.coins += sellValue(unit);
  }
}
function startBattle(s: SquadState) {
  const order = shuffle(seededRng(subSeed(s.seed, s.round)), s.players);
  for (const p of s.players) if (p.passiveOffers[0]) { p.passives.push(p.passiveOffers[0]); p.passiveOffers = []; }
  s.battles = order.map((p, i) => {
    const opponent = order[(i + 1) % order.length];
    const enemy: SquadUnit[] = order.length > 1 ? opponent.units.filter(u => u.cell >= 0) : Array.from({ length: boardLimit(s.round) }, (_, n) => ({
      id: -n - 1, kind: rollShop(subSeed(s.seed, `npc:${s.round}:${n}`), s.round)[0], tier: s.round >= 7 && n < 2 ? 2 : 1,
      cell: n < 8 ? n : 8 + n % 8,
    }));
    const awayPassives = order.length > 1 ? opponent.passives : [];
    return { owner: p.id, opponent: order.length > 1 ? opponent.id : 'clockwork', fighters: [
      ...makeFighters(p.units.filter(u => u.cell >= 0), 0, p.passives), ...makeFighters(enemy, 1, awayPassives),
    ], done: false, outcome: null, health: 0, attacks: [], damages: [], tick: 0, homePassives: [...p.passives], awayPassives: [...awayPassives] };
  });
  s.phase = 'battle'; s.phaseEnds = s.t + s.config.battleMs; s.nextTick = s.t + s.config.tickMs;
  s.events.push({ type: 'squad-battle', round: s.round });
}
function recap(s: SquadState) {
  for (const b of s.battles) {
    if (!b.done) { b.done = true; b.outcome = 'draw'; b.health = b.fighters.filter(u => u.side === 0 && u.hp > 0).reduce((n, u) => n + u.hp, 0); }
    const p = s.players.find(p => p.id === b.owner)!;
    p.points += b.outcome === 'win' ? 3 : b.outcome === 'draw' ? 1 : 0; p.health += b.health;
    if (b.outcome === 'win') p.wins++;
    p.last = b.outcome;
  }
  s.phase = 'recap'; s.phaseEnds = s.t + s.config.recapMs; s.events.push({ type: 'squad-recap', round: s.round });
}
/** Standings order (the same as the final placements): points, then surviving health. */
export const standings = (s: SquadState) => [...s.players].sort((a, b) => b.points - a.points || b.health - a.health);
export const squadRules: RulesCore<SquadState, SquadInput, SquadConfig> = {
  init(contestants, seed, config) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (!contestants.length || contestants.length > 8 || Object.values(cfg).some(v => !Number.isFinite(v) || v <= 0) || !Number.isInteger(cfg.rounds) || !Number.isInteger(cfg.income)) throw new Error('Invalid Toy Squad configuration.');
    const s: SquadState = { kind: 'toy-squad', seed, config: cfg, t: 0, phase: 'build', phaseEnds: cfg.buildMs, nextTick: 0, round: 1, nextId: 1, battles: [], events: [],
      players: contestants.map(c => ({ id: c.id, level: 1, coins: cfg.income, units: [], ready: false, points: 0, health: 0, wins: 0, shop: [], roll: 0, passives: [], passiveOffers: [], last: null })) };
    for (const p of s.players) refresh(s, p); return s;
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over' || !Number.isFinite(dtMs) || dtMs <= 0) return s;
    if (s.phase === 'build') {
      for (const p of s.players) {
        if (!p.ready) autoMergePairs(s, p);
        for (const input of inputs[p.id] ?? []) shop(s, p, input);
      }
      if (s.players.every(p => p.ready)) startBattle(s);
    }
    let remaining = dtMs;
    while (remaining > 0) {
      const delta = Math.min(remaining, s.phaseEnds - s.t, s.phase === 'battle' ? s.nextTick - s.t : Infinity);
      s.t += delta; remaining -= delta;
      if (s.phase === 'battle' && s.t >= s.nextTick) {
        s.battles.forEach(tickBattle); s.nextTick += s.config.tickMs;
        if (s.battles.every(b => b.done)) { recap(s); continue; }
      }
      if (s.t >= s.phaseEnds) {
        if (s.phase === 'build') startBattle(s);
        else if (s.phase === 'battle') recap(s);
        else if (s.round >= s.config.rounds) { s.phase = 'over'; s.events.push({ type: 'over' }); break; }
        else {
          s.round++; s.phase = 'build'; s.phaseEnds = s.t + s.config.buildMs;
          for (const p of s.players) { p.level = Math.min(10, s.round); p.coins += s.config.income + (p.passives.includes('allowance') ? 2 : 0); p.ready = false; p.roll = 0; refresh(s, p); passiveOffers(s, p); }
          s.events.push({ type: 'squad-build', round: s.round });
        }
      }
    }
    return s;
  },
  isOver: s => s.phase === 'over',
  result(s) {
    const ordered = standings(s);
    return { durationMs: s.t, placements: rankByKey(ordered.map(p => ({ contestantId: p.id, score: p.points, key: `${p.points}:${p.health}` }))), stats: { rounds: s.round } };
  },
  drainEvents(s) { const events = s.events; s.events = []; return events; },
};
