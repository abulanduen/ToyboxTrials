/**
 * Copycat Conductor bots: they "watch" the demonstration, then repeat it with human-like
 * reaction times and a per-note mistake chance that rises with round and difficulty.
 */
import type { BotDifficulty, BotPolicy, Contestant } from '../types';
import { lengthFor, type CopycatInput, type CopycatState, type Slot } from './rules';

const TUNING: Record<BotDifficulty, { first: [number, number]; next: [number, number]; err: number; errPerRound: number }> = {
  easy: { first: [700, 1200], next: [380, 700], err: 0.03, errPerRound: 0.011 },
  normal: { first: [500, 900], next: [260, 520], err: 0.012, errPerRound: 0.0065 },
  hard: { first: [380, 650], next: [190, 380], err: 0.004, errPerRound: 0.0035 },
};

export function createCopycatBot(): BotPolicy<CopycatState, CopycatInput> {
  // Per bot+round scheduling memory (phase time of the next press).
  const nextAt = new Map<string, number>();
  return {
    decide(s: CopycatState, bot: Contestant, _dt: number, rng: () => number): CopycatInput[] {
      if (s.phase !== 'input') return [];
      const p = s.players.find((x) => x.id === bot.id);
      if (!p || !p.alive || p.finished) return [];
      const tune = TUNING[bot.bot ?? 'normal'];
      const key = `${bot.id}:${s.round}`;
      const between = (r: [number, number]) => r[0] + rng() * (r[1] - r[0]);
      if (!nextAt.has(key)) nextAt.set(key, s.phaseT + between(tune.first));
      if (s.phaseT < nextAt.get(key)!) return [];
      nextAt.set(key, s.phaseT + between(tune.next));
      // Longer sequences are harder to hold in memory.
      const pErr = tune.err + tune.errPerRound * (s.round - 1) + 0.002 * Math.max(0, lengthFor(s) - 6);
      const correct = s.sequence[p.progress];
      if (rng() < pErr) {
        const wrong = ((correct + 1 + Math.floor(rng() * 3)) % 4) as Slot;
        return [{ slot: wrong }];
      }
      return [{ slot: correct }];
    },
  };
}
