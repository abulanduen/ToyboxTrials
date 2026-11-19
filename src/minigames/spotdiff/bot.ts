/**
 * Odd Page Out bots. A bot spots one difference every so often (the gap scales with difficulty and
 * varies), in its own random order, and taps it like a player would: a point inside the
 * difference's hit circle, in normalised picture coordinates. Now and then it taps something that
 * isn't a difference instead, and sits out the lockout like everyone else.
 *
 * Everything comes from the seeded rng the host gives each bot, so a match replays from its seed.
 */
import type { BotDifficulty, BotPolicy, Contestant } from '../types';
import { PIC_H, PIC_W } from './shapes';
import { themeById } from './themes';
import type { SpotInput, SpotState } from './rules';

interface Tuning {
  /** Before the first find (ms). */
  first: number;
  /** Average gap between finds (ms); each gap is ±40 % of it. */
  gap: number;
  /** Chance that a tap is a wrong one. */
  slip: number;
}

export const TUNING: Record<BotDifficulty, Tuning> = {
  easy: { first: 2200, gap: 3000, slip: 0.16 },
  normal: { first: 1500, gap: 2000, slip: 0.08 },
  hard: { first: 1000, gap: 1400, slip: 0.035 },
};

interface Plan {
  round: number;
  /** Differences still to find, in this bot's order. */
  todo: number[];
  nextAt: number;
}

export function createSpotBot(): BotPolicy<SpotState, SpotInput> {
  const plans = new Map<string, Plan>();

  return {
    decide(s: SpotState, bot: Contestant, _dt: number, rng: () => number): SpotInput[] {
      if (s.phase !== 'search') return [];
      const me = s.players.find((p) => p.id === bot.id);
      if (!me || me.done) return [];
      const tune = TUNING[bot.bot ?? 'normal'];

      let plan = plans.get(bot.id);
      if (!plan || plan.round !== s.round) {
        const todo = s.data.diffs.slice();
        for (let i = todo.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [todo[i], todo[j]] = [todo[j], todo[i]];
        }
        plan = { round: s.round, todo, nextAt: tune.first * (0.7 + rng() * 0.6) };
        plans.set(bot.id, plan);
      }
      if (me.lockMs > 0) {
        plan.nextAt = Math.max(plan.nextAt, s.phaseT + me.lockMs + 200);
        return [];
      }
      if (s.phaseT < plan.nextAt) return [];
      plan.nextAt = s.phaseT + tune.gap * (0.6 + rng() * 0.8);

      const theme = themeById(s.data.theme);
      if (rng() < tune.slip) {
        // A wrong tap: the middle of a slot that is the same on both pages and isn't inside
        // any difference's hit circle (so it really is a miss).
        const decoys = theme.slots
          .map((sl, i) => ({ sl, i }))
          .filter(({ sl, i }) => !s.data.diffs.includes(i) && s.data.diffs.every((d) => Math.hypot(theme.slots[d].x - sl.x, theme.slots[d].y - sl.y) > theme.slots[d].r + 1));
        if (decoys.length) {
          const { sl } = decoys[Math.floor(rng() * decoys.length)];
          return [{ x: sl.x / PIC_W, y: sl.y / PIC_H }];
        }
      }
      // Skip anything already found (it can't be by anyone else's taps, but stay robust).
      while (plan.todo.length && me.found.includes(plan.todo[0])) plan.todo.shift();
      const next = plan.todo.shift();
      if (next === undefined) return [];
      const sl = theme.slots[next];
      const a = rng() * Math.PI * 2;
      const d = rng() * sl.r * 0.5;
      return [{ x: (sl.x + Math.cos(a) * d) / PIC_W, y: (sl.y + Math.sin(a) * d) / PIC_H }];
    },
  };
}
