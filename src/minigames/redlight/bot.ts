/**
 * Red Light, Green Light bots. They react to the same tells a player gets: a short delay before
 * setting off on green, a reaction time to the Signalman's wind-up, and now and then they simply
 * don't stop in time (an over-run). Easy bots are slower off the mark, slower to react and greedier
 * than their brakes allow; hard bots are quick and almost never slip.
 */
import type { BotDifficulty, BotPolicy, Contestant } from '../types';
import { NO_INPUT, type MoveInput } from '../shared/movement';
import { currentCycle, type RlglInput, type RlglState } from './rules';

interface Tuning {
  /** Delay before moving once the light goes green (ms). */
  start: [number, number];
  /** Reaction time to the wind-up tell (ms). */
  react: [number, number];
  /** Chance per stop of not braking until after the light is red. */
  overrun: number;
  /** Fraction of top speed they dare to use. */
  pace: [number, number];
}

const TUNING: Record<BotDifficulty, Tuning> = {
  easy: { start: [450, 1000], react: [380, 760], overrun: 0.14, pace: [0.62, 0.8] },
  normal: { start: [280, 650], react: [260, 470], overrun: 0.06, pace: [0.82, 0.94] },
  hard: { start: [160, 380], react: [170, 300], overrun: 0.02, pace: [0.96, 1] },
};

interface Memory {
  /** `${cycle}:${phase}` this plan was made for. */
  key: string;
  /** Match time at which the bot starts moving (go) or stops moving (warn/stop). */
  at: number;
  pace: number;
  /** x it drifts towards (its lane, with a little wander). */
  aimX: number;
}

export function createRlglBot(): BotPolicy<RlglState, RlglInput> {
  const mem = new Map<string, Memory>();
  return {
    decide(s: RlglState, bot: Contestant, _dt: number, rng: () => number): RlglInput[] {
      const p = s.players.find((x) => x.id === bot.id);
      if (!p || s.phase === 'intro' || s.phase === 'over') return [NO_INPUT];
      // Home: trot a little past the line and wait there.
      if (p.finished) return [p.m.z > s.config.finishZ - 3 ? { ax: 0, ay: 0.7, run: false, jump: false } : NO_INPUT];
      const tune = TUNING[bot.bot ?? 'normal'];
      const between = (r: [number, number]) => r[0] + rng() * (r[1] - r[0]);
      let m = mem.get(bot.id);
      if (!m) mem.set(bot.id, (m = { key: '', at: 0, pace: between(tune.pace), aimX: p.m.x }));

      const key = `${s.cycle}:${s.phase}`;
      if (m.key !== key) {
        const from = m.key.split(':')[1];
        m.key = key;
        if (s.phase === 'go') {
          m.at = s.t + between(tune.start);
          m.pace = between(tune.pace);
          m.aimX = Math.max(-s.config.halfWidth + 2, Math.min(s.config.halfWidth - 2, m.aimX + (rng() - 0.5) * 3));
        } else if (s.phase === 'warn') {
          // Either react to the tell, or misjudge it and brake only after the light is already red.
          const cyc = currentCycle(s);
          m.at = rng() < tune.overrun ? s.t + cyc.warnMs + s.config.graceMs + between([60, 380]) : s.t + between(tune.react);
        } else if (s.phase === 'stop' && from !== 'warn') {
          m.at = 0; // joined mid-stop (shouldn't happen): stand still
        }
      }

      const moving = s.phase === 'go' ? s.t >= m.at : s.t < m.at;
      if (!moving || p.out) return [NO_INPUT];
      const dx = m.aimX - p.m.x;
      const out: MoveInput = { ax: Math.max(-0.35, Math.min(0.35, dx * 0.4)), ay: m.pace, run: true, jump: false };
      return [out];
    },
  };
}
