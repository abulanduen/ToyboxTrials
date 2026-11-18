import type { BotPolicy } from '../types';
import { ahead, DIRECTIONS, distances, index, tileAt, type Direction, type InfernoInput, type InfernoState } from './rules';

export function createInfernoBot(): BotPolicy<InfernoState, InfernoInput> {
  const next = new Map<string, number>();
  return { decide(s, bot, _dt, rng) {
    const p = s.players.find(p => p.id === bot.id);
    if (!p?.alive || s.phase === 'over' || s.t < (next.get(bot.id) ?? 0)) return [];
    next.set(bot.id, s.t + (bot.bot === 'hard' ? 240 : bot.bot === 'easy' ? 600 : 380));
    const a = ahead(p);
    if (s.phase === 'prepare' && !p.wallUsed && s.t > s.config.prepMs * 0.6 && tileAt(s, a.x, a.z) === 'floor') return [{ action: 'build' }];
    const danger = distances(s);
    const choices = DIRECTIONS.map(([dx, dz], direction) => ({ direction: direction as Direction, x: p.x + dx, z: p.z + dz, noise: rng() }))
      .filter(c => tileAt(s, c.x, c.z) !== 'edge' && (tileAt(s, c.x, c.z) !== 'wall' || s.wallOwners[index(c.x, c.z)] === p.id) && !s.players.some(other => other.alive && other.x === c.x && other.z === c.z));
    choices.sort((a, b) => {
      const value = (c: typeof a) => (tileAt(s, c.x, c.z) === 'floor' ? 10 : 0)
        + (s.phase === 'prepare' ? (Math.abs(c.x - 5) + Math.abs(c.z - 5)) * 8 : Math.min(30, danger[index(c.x, c.z)] / s.config.furnaceMs)) + c.noise * 5;
      return value(b) - value(a);
    });
    const c = choices[0];
    return c ? [{ direction: c.direction, ...(tileAt(s, c.x, c.z) === 'floor' ? {} : { action: 'break' as const }) }] : [];
  } };
}
