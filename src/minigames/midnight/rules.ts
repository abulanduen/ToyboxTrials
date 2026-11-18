/** Deterministic energy, movement and scarcity rules; independent of rendering/devices. */
import { seededRng, shuffle, subSeed } from '../rng';
import { rankByKey } from '../scoring';
import type { MatchEvent, RulesCore } from '../types';

export const SIZE = 11;
export const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
export type Direction = 0 | 1 | 2 | 3;
export interface Cell { x: number; z: number }
export const SHELTERS: readonly Cell[] = [{ x: 1, z: 1 }, { x: 9, z: 1 }, { x: 1, z: 9 }, { x: 9, z: 9 }];
export const sheltered = (p: Cell) => SHELTERS.some(c => Math.abs(c.x - p.x) <= 1 && Math.abs(c.z - p.z) <= 1);
export interface HungerInput { direction: Direction }
export interface HungerPlayer extends Cell {
  id: string; energy: number; alive: boolean; fed: boolean; batteries: number;
  facing: Direction; nextMove: number; outAt: number;
}
export interface Battery extends Cell { id: number; caughtBy: string | null }
export interface HungerConfig {
  nightMs: number; dayMs: number; maxMs: number; moveMs: number; targetMoveMs: number;
  maxEnergy: number; batteryEnergy: number; nightDrain: number; dayDrain: number; shelterDrain: number;
}
export const DEFAULT_CONFIG: HungerConfig = {
  nightMs: 10000, dayMs: 8000, maxMs: 180000, moveMs: 190, targetMoveMs: 750,
  maxEnergy: 100, batteryEnergy: 40, nightDrain: 2, dayDrain: 9, shelterDrain: 3,
};
export interface HungerState {
  kind: 'midnight-hunger'; seed: number; config: HungerConfig; t: number;
  phase: 'night' | 'day' | 'over'; phaseEnds: number; night: number;
  players: HungerPlayer[]; batteries: Battery[]; targetStep: number; nextTarget: number; events: MatchEvent[];
}
const inside = (p: Cell) => p.x >= 0 && p.x < SIZE && p.z >= 0 && p.z < SIZE;
const same = (a: Cell, b: Cell) => a.x === b.x && a.z === b.z;

function spawnNight(s: HungerState) {
  const rng = seededRng(subSeed(s.seed, s.night));
  const cells: Cell[] = [];
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
    const c = { x, z };
    if (!sheltered(c) && !s.players.some(p => p.alive && same(p, c))) cells.push(c);
  }
  const count = Math.max(0, s.players.filter(p => p.alive).length - 1);
  s.batteries = shuffle(rng, cells).slice(0, count).map((c, id) => ({ ...c, id, caughtBy: null }));
  for (const p of s.players) p.fed = false;
  s.targetStep = 0; s.nextTarget = s.t + s.config.targetMoveMs;
  s.events.push({ type: 'night', night: s.night, targets: count });
}

function collect(s: HungerState) {
  if (s.phase !== 'night') return;
  // Rotate equal-arrival priority each night rather than permanently favouring contestant order.
  const order = shuffle(seededRng(subSeed(s.seed, `catch:${s.night}`)), s.players);
  for (const p of order) {
    if (!p.alive || p.fed) continue;
    const battery = s.batteries.find(b => b.caughtBy === null && same(b, p));
    if (!battery) continue;
    battery.caughtBy = p.id; p.fed = true; p.batteries++;
    p.energy = Math.min(s.config.maxEnergy, p.energy + s.config.batteryEnergy);
    s.events.push({ type: 'battery', id: p.id });
  }
}

function moveTargets(s: HungerState) {
  const rng = seededRng(subSeed(s.seed, `targets:${s.night}:${s.targetStep++}`));
  for (const b of s.batteries) {
    if (b.caughtBy !== null) continue;
    const choices = shuffle(rng, DIRECTIONS).map(([dx, dz]) => ({ x: b.x + dx, z: b.z + dz }))
      .filter(c => inside(c) && !sheltered(c) && !s.batteries.some(other => other !== b && other.caughtBy === null && same(c, other)));
    if (choices[0]) Object.assign(b, choices[0]);
  }
  collect(s);
}

export const hungerRules: RulesCore<HungerState, HungerInput, HungerConfig> = {
  init(contestants, seed, config) {
    if (contestants.length < 2 || contestants.length > 8) throw new Error('Midnight Hunger requires 2–8 contenders.');
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (Object.values(cfg).some(v => !Number.isFinite(v) || v <= 0) || cfg.dayDrain <= cfg.nightDrain || cfg.shelterDrain >= cfg.dayDrain) throw new Error('Invalid Hunger balance settings.');
    const spawns = [[4, 4], [6, 6], [6, 4], [4, 6], [5, 4], [5, 6], [4, 5], [6, 5]];
    const s: HungerState = { kind: 'midnight-hunger', seed, config: cfg, t: 0, phase: 'night',
      phaseEnds: cfg.nightMs, night: 1, batteries: [], nextTarget: 0, targetStep: 0, events: [],
      players: contestants.map((c, i) => ({ id: c.id, x: spawns[i][0], z: spawns[i][1],
        energy: cfg.maxEnergy, alive: true, fed: false, batteries: 0, facing: 2, nextMove: 0, outAt: 0 })) };
    spawnNight(s); return s;
  },
  step(s, inputs, dtMs) {
    if (s.phase === 'over' || !Number.isFinite(dtMs) || dtMs <= 0) return s;
    for (const p of s.players) {
      if (!p.alive || s.t < p.nextMove) continue;
      const input = (inputs[p.id] ?? []).find(i => Number.isInteger(i.direction) && i.direction >= 0 && i.direction < 4);
      if (!input) continue;
      p.facing = input.direction; p.nextMove = s.t + s.config.moveMs;
      const [dx, dz] = DIRECTIONS[input.direction]; const c = { x: p.x + dx, z: p.z + dz };
      // Players may pass through one another; shelters never become body-blocked.
      if (inside(c)) Object.assign(p, c);
    }
    collect(s);
    let remaining = dtMs;
    while (remaining > 0) {
      const alive = s.players.filter(p => p.alive);
      const rate = (p: HungerPlayer) => s.phase === 'night' ? s.config.nightDrain : sheltered(p) ? s.config.shelterDrain : s.config.dayDrain;
      const deathIn = Math.min(...alive.map(p => p.energy / rate(p) * 1000));
      const delta = Math.min(remaining, s.phaseEnds - s.t, s.config.maxMs - s.t,
        s.phase === 'night' ? s.nextTarget - s.t : Infinity, deathIn);
      s.t += delta; remaining -= delta;
      for (const p of alive) {
        p.energy = Math.max(0, p.energy - rate(p) * delta / 1000);
        if (p.energy < 1e-8) { p.energy = 0; p.alive = false; p.outAt = s.t; s.events.push({ type: 'eliminated', id: p.id }); }
      }
      if (s.players.filter(p => p.alive).length <= 1 || s.t >= s.config.maxMs) { s.phase = 'over'; s.events.push({ type: 'over' }); break; }
      if (s.t >= s.phaseEnds) {
        if (s.phase === 'night') {
          s.phase = 'day'; s.phaseEnds = s.t + s.config.dayMs; s.batteries = [];
          s.events.push({ type: 'day' });
        } else {
          s.phase = 'night'; s.phaseEnds = s.t + s.config.nightMs; s.night++; spawnNight(s);
        }
      } else if (s.phase === 'night' && s.t >= s.nextTarget) {
        moveTargets(s); s.nextTarget = s.t + s.config.targetMoveMs;
      }
    }
    return s;
  },
  isOver: s => s.phase === 'over',
  result(s) {
    const ordered = [...s.players].sort((a, b) => Number(b.alive) - Number(a.alive) || b.outAt - a.outAt);
    return { durationMs: s.t, placements: rankByKey(ordered.map(p => ({ contestantId: p.id,
      score: Math.floor((p.alive ? s.t : p.outAt) / 1000), eliminated: !p.alive,
      key: p.alive ? 'survivor' : `out:${p.outAt}` }))),
      stats: { nights: s.night, batteries: s.players.reduce((n, p) => n + p.batteries, 0) } };
  },
  drainEvents(s) { const events = s.events; s.events = []; return events; },
};
