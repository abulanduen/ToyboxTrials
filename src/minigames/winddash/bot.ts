/**
 * Wind-Up Dash bots. They run the course by aiming at a line through each obstacle (a domino gap,
 * the spring pad or the gate, the ruler, the open jaw) with sideways noise, and by timing the snap
 * jaws. Easy bots are slower, wobble off the ruler, barge through dominoes and misjudge the jaws;
 * hard bots hold a clean line and wait for the jaws properly.
 */
import type { BotDifficulty, BotPolicy, Contestant } from '../types';
import { NO_INPUT } from '../shared/movement';
import { DOMINO, JAW_SHUT_MS, jawPhase, rulerX, type DashInput, type DashState, type Jaw } from './rules';

interface Tuning {
  pace: [number, number];
  /** Sideways aiming error (cm), re-rolled per obstacle. */
  wobble: number;
  /** Chance of ignoring a domino row's gaps and barging through. */
  barge: number;
  /** Chance of taking the gate instead of the spring pad. */
  gate: number;
  /** Chance of walking into a jaw without checking its timing. */
  rash: number;
  /** Delay before setting off (ms). */
  start: [number, number];
}

const TUNING: Record<BotDifficulty, Tuning> = {
  easy: { pace: [0.66, 0.8], wobble: 2.4, barge: 0.5, gate: 0.45, rash: 0.45, start: [350, 900] },
  normal: { pace: [0.84, 0.94], wobble: 1.2, barge: 0.2, gate: 0.2, rash: 0.15, start: [200, 500] },
  hard: { pace: [0.97, 1], wobble: 0.45, barge: 0.04, gate: 0.05, rash: 0.03, start: [80, 260] },
};

interface Memory {
  zone: string;
  aimX: number;
  /** Extra decisions for the current zone. */
  flag: boolean;
  pace: number;
  startAt: number;
}

/** Ms until the jaw is next shut (0 if shut now), and how long it then stays that way. */
function untilShut(j: Jaw, t: number): number {
  const k = (((t + j.offsetMs) % j.periodMs) + j.periodMs) % j.periodMs;
  const shutAt = j.periodMs - JAW_SHUT_MS;
  return k >= shutAt ? 0 : shutAt - k;
}

export function createDashBot(): BotPolicy<DashState, DashInput> {
  const mem = new Map<string, Memory>();
  return {
    decide(s: DashState, bot: Contestant, _dt: number, rng: () => number): DashInput[] {
      const p = s.players.find((x) => x.id === bot.id);
      if (!p || p.finished || s.phase !== 'race' || p.toss) return [NO_INPUT];
      const tune = TUNING[bot.bot ?? 'normal'];
      const between = (r: [number, number]) => r[0] + rng() * (r[1] - r[0]);
      const c = s.course;
      const hw = s.config.halfWidth;
      let m = mem.get(bot.id);
      if (!m) mem.set(bot.id, (m = { zone: '', aimX: p.m.x, flag: false, pace: between(tune.pace), startAt: s.t + between(tune.start) }));
      if (s.t < m.startAt) return [NO_INPUT];
      const { x, z } = p.m;
      const noise = () => (rng() * 2 - 1) * tune.wobble;
      const clampX = (v: number) => Math.max(-hw + 1.2, Math.min(hw - 1.2, v));

      // Which obstacle is next? (Zones are entered a little before the obstacle itself.)
      const row = c.rows.find((r) => z > r.z - 0.5);
      const jawRow = [0, 2, 4].find((i) => z > c.jaws[i].z - c.jaws[i].hz - 0.2);
      let zone = 'run';
      if (row) zone = `dom:${row.z}`;
      else if (z > c.wall.z) zone = 'wall';
      else if (z > c.jam.z1) zone = 'jam';
      else if (jawRow !== undefined) zone = `jaw:${jawRow}`;

      let go = true;
      if (zone !== m.zone) {
        m.zone = zone;
        m.pace = between(tune.pace);
        m.flag = false;
        if (row) {
          // Nearest gap that's still worth it, or (sometimes) straight through the dominoes.
          const standing = s.dominoes.filter((d) => d.row === c.rows.indexOf(row) && d.state === 'up');
          const open = [...row.gaps, ...s.dominoes.filter((d) => d.row === c.rows.indexOf(row) && d.state === 'down').map((d) => d.x)];
          const nearest = open.reduce((best, g) => (Math.abs(g - x) < Math.abs(best - x) ? g : best), open[0]);
          m.aimX = rng() < tune.barge || standing.length === 0 ? x + noise() : nearest + noise() * 0.35;
        } else if (zone === 'wall') {
          m.flag = rng() < tune.gate; // true: squeeze through the gate
          m.aimX = m.flag ? c.wall.gateX + noise() * 0.3 : c.pad.x + noise();
        } else if (zone === 'jam') {
          m.aimX = noise(); // used as an offset from the ruler's centre line
        } else if (jawRow !== undefined) {
          m.flag = rng() < tune.rash; // true: don't check the timing
          const side = Math.abs(x) < 1 ? (rng() < 0.5 ? -1 : 1) : Math.sign(x);
          m.aimX = (side * hw) / 2 + noise();
        }
      }

      let aim = m.aimX;
      if (zone === 'jam') {
        // Look a little ahead along the ruler so the bot turns with it.
        aim = rulerX(c, z - 1.5) + m.aimX * 0.6;
      } else if (zone === 'wall' && m.flag && z < c.wall.z + 6) {
        aim = c.wall.gateX; // line up properly for the gate
      } else if (jawRow !== undefined) {
        const j = c.jaws[jawRow + (aim > 0 ? 1 : 0)];
        const near = j.z + j.hz + 1.3; // stop line just short of the jaw
        if (!m.flag && z <= near + 2.5 && z > j.z - j.hz) {
          // Crossing takes about this long at this pace; only go if the jaw stays open that long.
          const need = ((2 * j.hz + 2.4) / (14 * m.pace)) * 1000 + 180;
          const phase = jawPhase(j, s.t);
          const inside = z < j.z + j.hz + 0.9;
          if (!inside && (phase === 'shut' || untilShut(j, s.t) < need)) go = false;
        }
      } else if (row && Math.abs(z - row.z) < DOMINO.hz + 1.2) {
        aim = m.aimX; // committed
      }

      if (!go) return [NO_INPUT];
      const dx = clampX(aim) - x;
      const ax = Math.max(-1, Math.min(1, dx * 0.9));
      // Slow the forward push while a big sideways correction is still needed.
      const ay = m.pace * (Math.abs(dx) > 2.2 && zone !== 'run' ? 0.45 : 1);
      return [{ ax: ax * m.pace, ay, run: true, jump: false }];
    },
  };
}
