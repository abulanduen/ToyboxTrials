/**
 * Hoop Hustle bots: they shoot on a rhythm. Once a ball is in hand a bot waits a moment (shorter on
 * harder difficulties), picks a release time when the sliding hoop will hold still long enough,
 * charges for as long as its intended power needs, and lets go. Accuracy comes from the
 * difficulty: the intended power is the perfect one plus a seeded error, so a bot sometimes falls
 * short or goes long (the trial's power assist forgives small errors, as it does for players).
 * Reads only public state; its own seeded RNG.
 */
import type { BotDifficulty, BotPolicy } from '../types';
import { STEP_MS } from './physics';
import { holdForPower } from '../shared/shotMeter';
import { canShoot, hoopXAt, perfectPowerAt, type HoopInput, type HoopState } from './rules';

/** Spread of a bot's power error (standard deviation) and its pause before a shot (ms). */
export const BOT_SKILL: Record<BotDifficulty, { sd: number; wait: [number, number] }> = {
  easy: { sd: 0.09, wait: [800, 1500] },
  normal: { sd: 0.062, wait: [500, 1000] },
  hard: { sd: 0.04, wait: [320, 650] },
};

interface Plan {
  /** Shot number this plan is for (a new ball means a new plan). */
  shot: number;
  chargeAt: number;
  releaseAt: number;
  power: number;
  charging: boolean;
}

/** A normal-ish error from two uniforms (deterministic per RNG). */
function gauss(rng: () => number) {
  return (rng() + rng() + rng() - 1.5) * 2;
}

export function createHoopBot(): BotPolicy<HoopState, HoopInput> {
  const plans = new Map<string, Plan | null>();
  const nextLook = new Map<string, number>();
  return {
    decide(s, bot, _dt, rng) {
      const p = s.players.find((q) => q.id === bot.id);
      if (!p || !canShoot(s, p)) {
        plans.delete(bot.id);
        return [];
      }
      const skill = BOT_SKILL[bot.bot ?? 'normal'];
      let plan = plans.get(bot.id);
      if (plan && plan.shot !== p.shots) plan = null;
      if (!plan) {
        if (s.t < (nextLook.get(bot.id) ?? 0)) return [];
        // A release time after a short wait; while the hoop slides, wait for a moment it will hold.
        const spot = s.spots[p.spot];
        const wait = skill.wait[0] + rng() * (skill.wait[1] - skill.wait[0]);
        let releaseAt = -1;
        let perfect: number | null = null;
        for (let k = 0; k < 40; k++) {
          const at = Math.ceil((s.t + wait + k * 100) / STEP_MS) * STEP_MS;
          const pp = perfectPowerAt(s.config, spot, at);
          if (pp !== null && at - holdForPower(pp, s.config.chargeMs) >= s.t) {
            releaseAt = at;
            perfect = pp;
            break;
          }
        }
        if (perfect === null) {
          nextLook.set(bot.id, s.t + 250);
          return [];
        }
        const power = Math.max(0, Math.min(1, perfect + gauss(rng) * skill.sd));
        // Let go on the meter's first rise (it would wind back down if held on).
        plan = { shot: p.shots, chargeAt: releaseAt - holdForPower(power, s.config.chargeMs), releaseAt, power, charging: false };
        plans.set(bot.id, plan);
      }
      const out: HoopInput[] = [];
      const yaw = Math.atan2(hoopXAt(s.config, s.t) - s.spots[p.spot].x, -s.spots[p.spot].z);
      if (!plan.charging && s.t >= plan.chargeAt) {
        plan.charging = true;
        out.push({ type: 'aim', yaw }, { type: 'charge' });
      }
      if (plan.charging && s.t >= plan.releaseAt - 1e-6) {
        out.push({ type: 'throw', power: plan.power, yaw });
        plans.set(bot.id, null);
      }
      return out;
    },
  };
}
