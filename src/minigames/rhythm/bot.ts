/**
 * Music Box Rhythm bots: they play every note with a human-like timing error (roughly normal,
 * wider for easier bots and in dense passages) and sometimes skip one or fumble an extra tap.
 */
import type { BotDifficulty, BotPolicy, Contestant } from '../types';
import type { RhythmInput, RhythmState } from './rules';
import type { Lane } from './tracks';

const TUNING: Record<BotDifficulty, { sd: number; skip: number; stray: number }> = {
  easy: { sd: 52, skip: 0.1, stray: 0.03 },
  normal: { sd: 31, skip: 0.04, stray: 0.012 },
  hard: { sd: 15, skip: 0.008, stray: 0.002 },
};

/** Standard normal from two uniforms (Box–Muller). */
function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function createRhythmBot(): BotPolicy<RhythmState, RhythmInput> {
  /** Per bot: index of the next note, and when it plans to press it (null = it will skip it). */
  const memory = new Map<string, { i: number; planned?: number | null }>();
  return {
    decide(s: RhythmState, bot: Contestant, _dt: number, rng: () => number): RhythmInput[] {
      const tune = TUNING[bot.bot ?? 'normal'];
      let m = memory.get(bot.id);
      if (!m) memory.set(bot.id, (m = { i: 0 }));
      const out: RhythmInput[] = [];
      while (m.i < s.chart.length) {
        const n = s.chart[m.i];
        if (m.planned === undefined) {
          // Notes right after another one are harder to place.
          const gap = m.i > 0 ? n.t - s.chart[m.i - 1].t : 1000;
          const tight = gap > 0 && gap < 260 ? 1.25 : 1;
          m.planned = rng() < tune.skip ? null : n.t + Math.max(-140, Math.min(140, gauss(rng) * tune.sd * tight));
        }
        if (m.planned === null) {
          if (s.t < n.t) break;
        } else {
          if (s.t < m.planned) break;
          out.push({ lane: n.lane, t: m.planned });
          if (rng() < tune.stray) out.push({ lane: ((n.lane + 1) % 4) as Lane, t: m.planned });
        }
        m.i++;
        m.planned = undefined;
      }
      return out;
    },
  };
}
