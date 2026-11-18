/** Toy Squad: pure shop, formation and simultaneous auto-combat rules. */
import { seededRng, shuffle, subSeed } from '../rng';
import { rankByKey } from '../scoring';
import type { MatchEvent, RulesCore } from '../types';
import { PALETTE } from '../../game/palette';

export const ROSTER = {
  soldier: { name: 'Tin Soldier', cost: 3, hp: 8, damage: 2, range: 1, colour: PALETTE.toyBlue, role: 'Balanced front line' },
  robot: { name: 'Wind-up Robot', cost: 4, hp: 14, damage: 1, range: 1, colour: PALETTE.sage, role: 'Durable defender' },
  hare: { name: 'Spring Hare', cost: 4, hp: 5, damage: 1, range: 3, colour: PALETTE.honey, role: 'Fragile ranged attacker' },
} as const;
export type UnitKind = keyof typeof ROSTER;
export interface SquadUnit { id: number; kind: UnitKind; tier: number; cell: number }
export interface SquadPlayer {
  id: string; coins: number; units: SquadUnit[]; ready: boolean; points: number; health: number; wins: number;
}
export type SquadInput = { type: 'buy'; kind: UnitKind } | { type: 'move'; unit: number; cell: number }
  | { type: 'upgrade' | 'sell'; unit: number } | { type: 'ready' };
export interface Fighter { id: number; kind: UnitKind; tier: number; side: 0 | 1; x: number; z: number; hp: number; maxHp: number }
export interface Battle {
  owner: string; opponent: string; fighters: Fighter[]; done: boolean;
  outcome: 'win' | 'loss' | 'draw' | null; health: number;
}
export interface SquadConfig { rounds: number; buildMs: number; battleMs: number; recapMs: number; tickMs: number; income: number }
export const DEFAULT_CONFIG: SquadConfig = { rounds: 3, buildMs: 30000, battleMs: 20000, recapMs: 3000, tickMs: 500, income: 10 };
export interface SquadState {
  kind: 'toy-squad'; seed: number; config: SquadConfig; t: number; phase: 'build' | 'battle' | 'recap' | 'over';
  phaseEnds: number; nextTick: number; round: number; nextId: number; players: SquadPlayer[]; battles: Battle[]; events: MatchEvent[];
}
const validCell = (cell: number) => Number.isInteger(cell) && cell >= 0 && cell < 6;
export const unitHp = (u: Pick<SquadUnit, 'kind' | 'tier'>) => ROSTER[u.kind].hp + (u.tier - 1) * 5;
const damage = (u: Fighter) => ROSTER[u.kind].damage + u.tier - 1;

function shop(s: SquadState, p: SquadPlayer, input: SquadInput) {
  if (p.ready) return;
  if (input.type === 'ready') { p.ready = true; return; }
  if (input.type === 'buy') {
    if (!Object.hasOwn(ROSTER, input.kind)) return;
    const def = ROSTER[input.kind];
    if (p.coins < def.cost || p.units.length >= 6) return;
    const cell = Array.from({ length: 6 }, (_, i) => i).find(c => !p.units.some(u => u.cell === c))!;
    p.units.push({ id: s.nextId++, kind: input.kind, tier: 1, cell }); p.coins -= def.cost;
    s.events.push({ type: 'squad-buy', id: p.id }); return;
  }
  const unit = p.units.find(u => u.id === input.unit);
  if (!unit) return;
  if (input.type === 'move' && validCell(input.cell)) {
    const other = p.units.find(u => u.cell === input.cell);
    if (other) other.cell = unit.cell; unit.cell = input.cell;
  } else if (input.type === 'upgrade' && unit.tier < 3 && p.coins >= 3) {
    unit.tier++; p.coins -= 3; s.events.push({ type: 'squad-upgrade', id: p.id });
  } else if (input.type === 'sell') {
    p.units = p.units.filter(u => u !== unit); p.coins += Math.max(1, ROSTER[unit.kind].cost - 1);
  }
}

function fighters(units: SquadUnit[], side: 0 | 1): Fighter[] {
  return units.map(u => ({ ...u, side, x: side === 0 ? u.cell % 3 : 7 - u.cell % 3,
    z: Math.floor(u.cell / 3), hp: unitHp(u), maxHp: unitHp(u) }));
}

function startBattle(s: SquadState) {
  const order = shuffle(seededRng(subSeed(s.seed, s.round)), s.players);
  s.battles = order.map((p, i) => {
    const opponent = order[(i + 1) % order.length];
    const enemy: SquadUnit[] = order.length > 1 ? opponent.units : Array.from({ length: s.round + 1 }, (_, n) => ({
      id: -n - 1, kind: (['soldier', 'robot', 'hare'] as UnitKind[])[(n + s.round) % 3], tier: s.round === 3 && n === 0 ? 2 : 1, cell: n,
    }));
    return { owner: p.id, opponent: order.length > 1 ? opponent.id : 'clockwork',
      fighters: [...fighters(p.units, 0), ...fighters(enemy, 1)], done: false, outcome: null, health: 0 };
  });
  s.phase = 'battle'; s.phaseEnds = s.t + s.config.battleMs; s.nextTick = s.t + s.config.tickMs;
  s.events.push({ type: 'squad-battle', round: s.round });
}

const dist = (a: Fighter, b: Fighter) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
function finishBattle(b: Battle, timeout = false) {
  const home = b.fighters.filter(u => u.side === 0 && u.hp > 0);
  const away = b.fighters.filter(u => u.side === 1 && u.hp > 0);
  if (!timeout && home.length && away.length) return;
  b.done = true;
  b.health = home.reduce((n, u) => n + u.hp, 0);
  b.outcome = home.length && !away.length ? 'win' : away.length && !home.length ? 'loss' : 'draw';
}

/** Attack intents use the same snapshot; damage is applied together to avoid first-strike bias. */
export function tickBattle(b: Battle) {
  if (b.done) return;
  finishBattle(b); if (b.done) return;
  const live = b.fighters.filter(u => u.hp > 0);
  const hits = new Map<Fighter, number>();
  const moves: { unit: Fighter; x: number; z: number }[] = [];
  for (const unit of live) {
    const enemy = live.filter(u => u.side !== unit.side).sort((a, c) => dist(unit, a) - dist(unit, c) || a.id - c.id)[0];
    if (!enemy) continue;
    if (dist(unit, enemy) <= ROSTER[unit.kind].range) hits.set(enemy, (hits.get(enemy) ?? 0) + damage(unit));
    else {
      const dx = Math.sign(enemy.x - unit.x) * 0.5, dz = Math.sign(enemy.z - unit.z);
      const choices = [{ x: unit.x + dx, z: unit.z }, { x: unit.x, z: unit.z + dz }]
        .filter(c => c.x >= 0 && c.x <= 7 && c.z >= 0 && c.z <= 1 && (c.x !== unit.x || c.z !== unit.z)
          && !live.some(u => u.x === c.x && u.z === c.z));
      if (choices[0]) moves.push({ unit, ...choices[0] });
    }
  }
  // Competing moves into one square all wait; no dependence on player iteration order.
  for (const move of moves) if (moves.filter(m => m.x === move.x && m.z === move.z).length === 1) {
    move.unit.x = move.x; move.unit.z = move.z;
  }
  for (const [target, amount] of hits) target.hp = Math.max(0, target.hp - amount);
  finishBattle(b);
}

function recap(s: SquadState) {
  for (const b of s.battles) {
    finishBattle(b, true);
    const p = s.players.find(p => p.id === b.owner)!;
    p.points += b.outcome === 'win' ? 3 : b.outcome === 'draw' ? 1 : 0;
    p.health += b.health; if (b.outcome === 'win') p.wins++;
  }
  s.phase = 'recap'; s.phaseEnds = s.t + s.config.recapMs;
  s.events.push({ type: 'squad-recap', round: s.round });
}

export const squadRules: RulesCore<SquadState, SquadInput, SquadConfig> = {
  init(contestants, seed, config) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (!contestants.length || contestants.length > 8 || Object.values(cfg).some(v => !Number.isFinite(v) || v <= 0) || !Number.isInteger(cfg.rounds) || !Number.isInteger(cfg.income)) throw new Error('Invalid Toy Squad configuration.');
    return { kind: 'toy-squad', seed, config: cfg, t: 0, phase: 'build', phaseEnds: cfg.buildMs,
      nextTick: 0, round: 1, nextId: 1, battles: [], events: [],
      players: contestants.map(c => ({ id: c.id, coins: cfg.income, units: [], ready: false, points: 0, health: 0, wins: 0 })) };
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over' || !Number.isFinite(dtMs) || dtMs <= 0) return s;
    if (s.phase === 'build') {
      for (const p of s.players) for (const input of inputs[p.id] ?? []) shop(s, p, input);
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
          for (const p of s.players) { p.coins += s.config.income; p.ready = false; }
          s.events.push({ type: 'squad-build', round: s.round });
        }
      }
    }
    return s;
  },
  isOver: s => s.phase === 'over',
  result(s) {
    const ordered = [...s.players].sort((a, b) => b.points - a.points || b.health - a.health);
    return { durationMs: s.t, placements: rankByKey(ordered.map(p => ({ contestantId: p.id,
      score: p.points, key: `${p.points}:${p.health}` }))), stats: { rounds: s.round } };
  },
  drainEvents(s) { const events = s.events; s.events = []; return events; },
};
