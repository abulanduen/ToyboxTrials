/**
 * Jack-in-the-Box bots. Each bot "knows" a random slice of the category, weighted by difficulty:
 * everyone knows the obvious answers, harder bots know more of the unusual ones. They answer the
 * obvious things first, slow down as their ideas run out, sometimes blurt something already said,
 * and freeze completely when they've got nothing left, which is exactly when the jack tends to pop.
 */
import type { BotDifficulty, BotPolicy, Contestant } from '../types';
import { indexCategory } from './matching';
import type { JackInput, JackState } from './rules';

interface Tuning {
  /** Chance of knowing an answer in each tier. */
  know: [number, number, number];
  /** Thinking time range (ms) when ideas are plentiful. */
  think: [number, number];
  /** Chance an attempt is a slip: repeating something already said. */
  slip: number;
}

const TUNING: Record<BotDifficulty, Tuning> = {
  easy: { know: [0.8, 0.22, 0.02], think: [2600, 5600], slip: 0.12 },
  normal: { know: [0.95, 0.5, 0.1], think: [1700, 4000], slip: 0.06 },
  hard: { know: [1, 0.85, 0.35], think: [1100, 2600], slip: 0.02 },
};

export function createJackBot(): BotPolicy<JackState, JackInput> {
  const known = new Map<string, number[]>(); // bot:round → known answer ids
  const nextAt = new Map<string, number>(); // bot → match time of the next attempt
  const turnOf = new Map<string, string>(); // bot → the turn its schedule belongs to

  return {
    decide(s: JackState, bot: Contestant, _dt: number, rng: () => number): JackInput[] {
      if (s.phase !== 'live' || s.holder !== bot.id) return [];
      const tune = TUNING[bot.bot ?? 'normal'];
      const idx = indexCategory(s.category);

      const kKey = `${bot.id}:${s.round}`;
      if (!known.has(kKey)) {
        known.set(
          kKey,
          idx.answers.filter((a) => rng() < tune.know[a.tier]).map((a) => a.id),
        );
      }
      const mine = known.get(kKey)!;
      const said = new Set(s.said.map((x) => x.id));
      const left = mine.filter((id) => !said.has(id));
      const between = (r: [number, number]) => r[0] + rng() * (r[1] - r[0]);

      // A new turn (the box just arrived, or the last attempt was rejected): schedule an attempt.
      const turn = `${s.round}:${s.said.length}`;
      if (turnOf.get(bot.id) !== turn) {
        turnOf.set(bot.id, turn);
        // Slower as ideas dry up; nothing left means a long, sweaty pause before a desperate guess.
        const scarcity = mine.length ? 1 - left.length / mine.length : 1;
        const ms = left.length ? between(tune.think) * (1 + scarcity * 1.4) : between([5000, 9000]);
        nextAt.set(bot.id, s.t + ms);
      }
      if (s.t < nextAt.get(bot.id)!) return [];

      // Attempt now. Afterwards wait a little before trying again (if the attempt is rejected).
      nextAt.set(bot.id, s.t + between([1400, 2800]));
      const slip = s.said.length > 0 && (left.length === 0 || rng() < tune.slip);
      if (slip) return [{ text: s.said[Math.floor(rng() * s.said.length)].display }];
      if (!left.length) return []; // frozen
      // Obvious answers first: usually the lowest tier still available.
      const minTier = Math.min(...left.map((id) => idx.answers[id].tier));
      const pool = rng() < 0.7 ? left.filter((id) => idx.answers[id].tier === minTier) : left;
      return [{ text: idx.answers[pool[Math.floor(rng() * pool.length)]].display }];
    },
  };
}
