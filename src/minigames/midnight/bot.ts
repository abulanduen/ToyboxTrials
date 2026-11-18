import type { BotPolicy } from '../types';
import { DIRECTIONS, SHELTERS, sheltered, type Cell, type Direction, type HungerInput, type HungerState } from './rules';
const distance = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

export function createHungerBot(): BotPolicy<HungerState, HungerInput> {
  const next = new Map<string, number>();
  return { decide(s, bot, _dt, rng) {
    const p = s.players.find(p => p.id === bot.id);
    if (!p?.alive || s.phase === 'over' || s.t < (next.get(bot.id) ?? 0)) return [];
    next.set(bot.id, s.t + (bot.bot === 'hard' ? 200 : bot.bot === 'easy' ? 420 : 280));
    const remainingNight = s.phaseEnds - s.t;
    const targets: Cell[] = s.phase === 'night' && !p.fed && remainingNight > (bot.bot === 'easy' ? 400 : 1600)
      ? s.batteries.filter(b => b.caughtBy === null) : [];
    if (!targets.length && sheltered(p)) return [{ direction: null }];
    const pool = targets.length ? targets : SHELTERS;
    const goal = [...pool].sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (!goal) return [];
    if (targets.length && distance(p, goal) === 1) {
      const direction = DIRECTIONS.findIndex(([dx, dz]) => p.x + dx === goal.x && p.z + dz === goal.z) as Direction;
      return [{ direction, hit: true }];
    }
    const choices = DIRECTIONS.map(([dx, dz], direction) => ({ x: p.x + dx, z: p.z + dz, direction: direction as Direction, noise: rng() }))
      .filter(c => c.x >= 0 && c.x < 11 && c.z >= 0 && c.z < 11)
      .sort((a, b) => distance(a, goal) - distance(b, goal) || a.noise - b.noise);
    return choices[0] ? [{ direction: choices[0].direction }] : [];
  } };
}
