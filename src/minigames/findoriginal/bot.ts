/**
 * Find the Original bots. A bot "scans" the crowd: its time to spot Baldwyn grows with the size of
 * the crowd and how subtle the round is, and shrinks with skill. Sometimes it jumps the gun and
 * picks the decoy that looks most like him first, eats the lockout, and only then gets it right.
 * On the hardest rounds the weaker bots sometimes run out of time altogether.
 *
 * Each bot plans its picks once per round from the seeded rng it is given, so a match replays
 * identically from its seed.
 */
import type { BotDifficulty, BotPolicy, Contestant } from '../types';
import { originalIndex, type FindInput, type FindState } from './rules';
import { traitCount } from './traits';

interface Tuning {
  /** Reaction time before the scan starts (ms). */
  base: number;
  /** Scan time per toy in the crowd (ms), before the round's hardness is applied. */
  perToy: number;
  /** Chance of a wrong pick on the easiest round, and how much the hardest round adds. */
  slip: number;
  slipHard: number;
}

export const TUNING: Record<BotDifficulty, Tuning> = {
  easy: { base: 2200, perToy: 330, slip: 0.3, slipHard: 0.2 },
  normal: { base: 1500, perToy: 210, slip: 0.14, slipHard: 0.14 },
  hard: { base: 1000, perToy: 120, slip: 0.04, slipHard: 0.08 },
};

interface Plan {
  round: number;
  picks: { at: number; toy: number }[];
}

export function createFindBot(): BotPolicy<FindState, FindInput> {
  const plans = new Map<string, Plan>();

  return {
    decide(s: FindState, bot: Contestant, _dt: number, rng: () => number): FindInput[] {
      if (s.phase !== 'search') return [];
      const me = s.players.find((p) => p.id === bot.id);
      if (!me || me.found) return [];

      let plan = plans.get(bot.id);
      if (!plan || plan.round !== s.round) {
        const tune = TUNING[bot.bot ?? 'normal'];
        const h = s.spec.hardness;
        const target = originalIndex(s);
        // Baldwyn turns up somewhere between a third of the way and the very end of the scan.
        let findAt = tune.base * (0.7 + rng() * 0.6) + s.toys.length * tune.perToy * (0.3 + rng() * 0.7) * (1 + 1.6 * h);
        const picks: Plan['picks'] = [];
        if (rng() < tune.slip + tune.slipHard * h) {
          // The most convincing Not-Baldwyn: fewest mistakes (ties broken by the rng).
          let best = -1;
          let bestScore = Infinity;
          s.toys.forEach((toy, i) => {
            if (i === target) return;
            const score = traitCount(toy.traits) + rng() * 0.9;
            if (score < bestScore) {
              bestScore = score;
              best = i;
            }
          });
          if (best >= 0) {
            picks.push({ at: findAt * (0.45 + rng() * 0.4), toy: best });
            findAt += s.config.lockMs + 500 + rng() * 900;
          }
        }
        picks.push({ at: findAt, toy: target });
        plan = { round: s.round, picks };
        plans.set(bot.id, plan);
      }

      if (me.lockMs > 0 || !plan.picks.length || s.phaseT < plan.picks[0].at) return [];
      return [{ pick: plan.picks.shift()!.toy }];
    },
  };
}
