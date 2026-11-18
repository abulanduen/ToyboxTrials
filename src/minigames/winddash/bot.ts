/**
 * Wind-Up Dash bots. They read the generated course: for whichever trap comes next they pick a
 * line through it (a domino gap, the spring pad or the gate, the ruler, an open jaw or crayon
 * gate, a gap between tops, the quick belt, the hop or the ramp) with sideways noise, and they
 * time the traps that move. Easy bots are slower, wobble off their line, barge through dominoes,
 * queue for ramps and walk into things; hard bots hold a clean line and wait properly.
 */
import type { BotDifficulty, BotPolicy, Contestant } from '../types';
import { NO_INPUT, TOY_TUNING } from '../shared/movement';
import { DOMINO, MARBLE_R, bobX, crayonOpenFor, crayonOpensIn, jawPhase, jawUntilShut, marbleX, roadCx, roadHw, rulerX, type Section } from './course';
import type { DashInput, DashState } from './rules';

interface Tuning {
  pace: [number, number];
  /** Sideways aiming error (cm), re-rolled per obstacle. */
  wobble: number;
  /** Chance of ignoring a domino row's gaps and barging through. */
  barge: number;
  /** Chance of taking the slow way round (the wall's gate, a book's ramp). */
  detour: number;
  /** Chance of walking into a timed trap without checking it. */
  rash: number;
  /** Chance of picking a belt or a gate without looking for the best one. */
  careless: number;
  /** Delay before setting off (ms). */
  start: [number, number];
}

const TUNING: Record<BotDifficulty, Tuning> = {
  easy: { pace: [0.66, 0.8], wobble: 2.4, barge: 0.5, detour: 0.45, rash: 0.45, careless: 0.7, start: [350, 900] },
  normal: { pace: [0.84, 0.94], wobble: 1.2, barge: 0.2, detour: 0.2, rash: 0.15, careless: 0.3, start: [200, 500] },
  hard: { pace: [0.97, 1], wobble: 0.45, barge: 0.04, detour: 0.05, rash: 0.03, careless: 0.04, start: [80, 260] },
};

interface Memory {
  /** Trap index × 10 + step within it (row, lane, book…). */
  zone: number;
  aimX: number;
  /** Extra decision for the current step (take the gate, don't check the timing, use the ramp…). */
  flag: boolean;
  /** Which door / jaw / belt was picked. */
  pick: number;
  pace: number;
  startAt: number;
  /** Furthest point reached, and when: a bot that has been stuck for a while stops being careful. */
  bestZ: number;
  bestT: number;
  /** Knocks and bites taken so far: one more and the bot starts watching this trap properly. */
  hurt: number;
}

const R = TOY_TUNING.radius;
const RUN = TOY_TUNING.run;

/** Which step of a trap comes next for a toy at depth z (rows and lanes count from the near side). */
function stepOf(sec: Section, z: number): number {
  const count = (zs: readonly number[], past: number) => {
    let i = 0;
    while (i < zs.length - 1 && z < zs[i] - past) i++;
    return i;
  };
  switch (sec.kind) {
    case 'dominoes':
      return count(sec.rows.map((r) => r.z), 0.5);
    case 'jaws':
      return count(sec.jaws.filter((_, i) => i % 2 === 0).map((j) => j.z), j0(sec.jaws[0].hz));
    case 'crayons':
      return count(sec.rows.map((r) => r.z), 1);
    case 'marbles':
      return count(sec.lanes.map((l) => l.z), MARBLE_R + R);
    case 'pendulum':
      return count(sec.arms.map((a) => a.z), a0(sec.arms[0].hz));
    case 'tops':
      return count(sec.rows.map((r) => r.z), 0.5);
    case 'conveyor':
      return count(sec.segments.map((g) => g.z1), 0);
    case 'books':
      return count(sec.faces.map((f) => f.z), 0.3);
    default:
      return 0;
  }
}
const j0 = (hz: number) => hz + 0.2;
const a0 = (hz: number) => hz + 0.2;

export function createDashBot(): BotPolicy<DashState, DashInput> {
  const mem = new Map<string, Memory>();
  return {
    decide(s: DashState, bot: Contestant, _dt: number, rng: () => number): DashInput[] {
      const p = s.players.find((x) => x.id === bot.id);
      if (!p || p.finished || s.phase !== 'race' || p.toss || p.stunMs > 0) return [NO_INPUT];
      const tune = TUNING[bot.bot ?? 'normal'];
      const between = (r: [number, number]) => r[0] + rng() * (r[1] - r[0]);
      const course = s.course;
      let m = mem.get(bot.id);
      if (!m) mem.set(bot.id, (m = { zone: -1, aimX: p.m.x, flag: false, pick: 0, pace: between(tune.pace), startAt: s.t + between(tune.start), bestZ: p.m.z, bestT: s.t, hurt: 0 }));
      if (s.t < m.startAt) return [NO_INPUT];
      const { x, z } = p.m;
      if (z < m.bestZ - 0.5) {
        m.bestZ = z;
        m.bestT = s.t;
      }
      const stuck = s.t - m.bestT > 3500; // been held up for ages: stop waiting politely
      const noise = () => (rng() * 2 - 1) * tune.wobble;
      const speed = RUN * m.pace;

      // The next trap not yet behind us (traps are planned from the road leading up to them).
      const sec = course.sections.find((q) => z > q.z1) ?? null;
      const step = sec ? stepOf(sec, z) : 0;
      const zone = sec ? sec.index * 10 + step : 99;
      const fresh = zone !== m.zone;
      if (fresh) {
        m.zone = zone;
        m.pace = between(tune.pace);
        m.flag = false;
        m.pick = 0;
        m.aimX = x;
      }

      // Once bitten: a bot that walked into a trap blind watches it the next time.
      if (p.bonks + p.snaps > m.hurt) {
        m.hurt = p.bonks + p.snaps;
        m.flag = false;
      }

      let aim = m.aimX;
      let go = true;
      let jump = false;
      let careful = false; // line up before pushing on
      let back = false; // waiting, and too close: step back

      /** Is it safe to cross a hazard `depth` cm deep starting `lead` cm ahead, given where it is over time? */
      const clear = (lead: number, depth: number, blocked: (t: number) => boolean) => {
        const t0 = s.t + (Math.max(0, lead) / speed) * 1000;
        const t1 = t0 + (depth / speed) * 1000 + 160; // setting off from a standstill costs a little
        for (let t = t0 - 60; t <= t1; t += 45) if (blocked(t)) return false;
        return true;
      };

      if (!sec) {
        aim = roadCx(course, z - 4); // the run to the line
      } else
        switch (sec.kind) {
          case 'dominoes': {
            const row = sec.rows[step];
            if (fresh) {
              // Nearest way through that's open (a gap, or a domino somebody already knocked down), or barge.
              const fallen = s.dominoes.filter((d) => d.sec === sec.index && d.row === step && d.state === 'down').map((d) => d.x);
              const open = [...row.gaps, ...fallen];
              const nearest = open.reduce((best, g) => (Math.abs(g - x) < Math.abs(best - x) ? g : best), open[0]);
              m.aimX = rng() < tune.barge ? x + noise() : nearest + noise() * 0.35;
            }
            aim = m.aimX;
            careful = Math.abs(z - row.z) > DOMINO.hz + 1.2;
            break;
          }
          case 'spring': {
            if (fresh) {
              m.flag = rng() < tune.detour; // true: squeeze through the gate
              m.aimX = m.flag ? sec.wall.gateX + noise() * 0.3 : sec.pad.x + noise() * Math.min(1, sec.pad.hx / 3);
            }
            const beyond = z < sec.wall.z - sec.wall.hz - R;
            // Walked past the pad without touching it: the gate is the only way left.
            const missed = !m.flag && z < sec.pad.z - sec.pad.hz - 0.5;
            if (beyond) aim = x;
            else if (missed || (m.flag && z < sec.wall.z + 6)) aim = sec.wall.gateX; // line up properly
            else aim = m.aimX;
            careful = !beyond;
            break;
          }
          case 'jam': {
            if (fresh) m.aimX = noise(); // an offset from the ruler's centre line
            // Look a little ahead along the ruler so the bot turns with it.
            aim = rulerX(sec, z - 1.5) + m.aimX * 0.6;
            careful = z > sec.jam.z0;
            break;
          }
          case 'jaws': {
            if (fresh) {
              m.flag = rng() < tune.rash; // true: don't check the timing
              const mid = sec.cx;
              const side = Math.abs(x - mid) < 1 ? (rng() < 0.5 ? -1 : 1) : Math.sign(x - mid);
              m.pick = side > 0 ? 1 : 0;
              m.aimX = mid + (side * sec.hw) / 2 + noise();
            }
            const j = sec.jaws[step * 2 + m.pick];
            const near = j.z + j.hz + 1.3; // stop line just short of the jaw
            if (!m.flag && !stuck && z <= near + 2.5 && z > j.z - j.hz) {
              // Crossing takes about this long at this pace; only go if the jaw stays open that long.
              const need = ((2 * j.hz + 2.4) / speed) * 1000 + 180;
              const inside = z < j.z + j.hz + 0.9;
              if (!inside && (jawPhase(j, s.t) === 'shut' || jawUntilShut(j, s.t) < need)) go = false;
            }
            break;
          }
          case 'crayons': {
            const row = sec.rows[step];
            const line = row.z + row.hz + R + 0.5; // where a toy waits
            const need = ((2 * row.hz + 2 * R + 1) / speed) * 1000 + 200;
            if (fresh) {
              m.flag = rng() < tune.careless; // true: head for the nearest gate whatever it is doing
              let best = 0;
              let bestCost = Infinity;
              row.doors.forEach((d, i) => {
                // Whichever is later: getting there, or the gate opening.
                const walk = ((Math.hypot(d.x - x, Math.max(0, z - line)) / speed) * 1000) | 0;
                const opens = crayonOpenFor(row, i, s.t + walk) >= need ? 0 : crayonOpensIn(row, i, s.t + walk) || row.slotMs * (row.doors.length - row.open);
                const cost = m!.flag ? Math.abs(d.x - x) : walk + opens;
                if (cost < bestCost) {
                  bestCost = cost;
                  best = i;
                }
              });
              m.pick = best;
              m.aimX = row.doors[best].x + noise() * 0.25;
            }
            aim = m.aimX;
            careful = z > row.z;
            if (z <= line + 1.2 && z > row.z + row.hz && !stuck) {
              const left = crayonOpenFor(row, m.pick, s.t);
              if (left < need * (Math.abs(x - aim) < 1 ? 1 : 1.4)) go = false;
            }
            break;
          }
          case 'marbles': {
            const lane = sec.lanes[step];
            const reach = MARBLE_R + R;
            if (fresh) {
              m.flag = rng() < tune.rash;
              m.aimX = x + noise() * 0.5;
            }
            aim = m.aimX;
            const lead = z - (lane.z + reach);
            if (!m.flag && !stuck && lead > -0.2 && lead < 2.8) {
              const hit = (t: number) => {
                for (let i = 0; i < lane.count; i++) if (Math.abs(marbleX(lane, i, t) - x) < reach + 0.3) return true;
                return false;
              };
              if (!clear(lead, 2 * reach, hit)) go = false;
            }
            break;
          }
          case 'pendulum': {
            const arm = sec.arms[step];
            if (fresh) {
              m.flag = rng() < tune.rash;
              m.aimX = x + noise() * 0.5;
            }
            aim = m.aimX;
            const lead = z - (arm.z + arm.hz);
            if (!m.flag && !stuck && lead > -0.2 && lead < 3) {
              if (!clear(lead, 2 * arm.hz, (t) => Math.abs(bobX(arm, t) - x) < arm.r + 1.3)) go = false;
            }
            break;
          }
          case 'tops': {
            const row = sec.rows[step];
            if (fresh) {
              const nearest = row.gaps.reduce((best, g) => (Math.abs(g - x) < Math.abs(best - x) ? g : best), row.gaps[0]);
              m.aimX = nearest + noise() * 0.4;
            }
            aim = m.aimX;
            careful = z > row.z + 1.5;
            break;
          }
          case 'conveyor': {
            const seg = sec.segments[step];
            if (fresh) {
              const lane = (sec.hw * 2) / 3;
              const lanes = [0, 1, 2].map((i) => {
                const lx = sec.cx - sec.hw + lane * (i + 0.5);
                const b = sec.belts.find((q) => q.z0 === seg.z0 && Math.abs(q.x - lx) < 0.1);
                return { x: lx, v: b ? b.v : 0 };
              });
              // Careless bots just carry straight on (unless that means the worst belt on purpose).
              const here = lanes.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
              const best = lanes.reduce((a, b) => (b.v > a.v ? b : a));
              m.aimX = (rng() < tune.careless ? here : best).x + noise() * 0.5;
            }
            aim = m.aimX;
            break;
          }
          case 'books': {
            const f = sec.faces[step];
            if (fresh) {
              m.flag = rng() < tune.detour; // true: walk round to the ramp
              m.aimX = m.flag ? f.rampX + noise() * 0.3 : x + noise() * 0.5;
              // How far out to take off (cm from the face); a bad guess just means a second hop.
              m.pick = 2 + rng() * (2 + tune.wobble);
            }
            if (stuck) m.flag = false; // the ramp isn't working out: hop it
            const up = p.m.y >= f.top - 0.05 || z < f.z - 0.3;
            if (up) aim = x;
            else if (m.flag) {
              aim = m.aimX;
              // Line up with the ramp before starting up it; back off if the steps are in the way.
              const foot = f.z + f.rampLen;
              careful = z > foot + 0.5;
              if (z < foot + 2.5 && Math.abs(x - f.rampX) > f.rampHalf - R - 0.2 && p.m.y < f.from + 0.1) {
                go = false;
                back = z < foot + 1.2;
              }
            } else {
              // Not on the ramp side: keep off its steps, they would only get in the way.
              aim = Math.abs(m.aimX - f.rampX) < f.rampHalf + R + 0.4 ? f.rampX - Math.sign(f.rampX - sec.cx) * (f.rampHalf + R + 0.8) : m.aimX;
              jump = p.m.grounded && z - f.z - R < m.pick && z > f.z;
            }
            break;
          }
        }

      // Stay on the road through the bends.
      const reach = roadHw(course, z - 2) - R - 0.3;
      const mid = roadCx(course, z - 2);
      aim = Math.max(mid - reach, Math.min(mid + reach, aim));
      const dx = aim - x;
      const ax = Math.max(-1, Math.min(1, dx * 0.9));
      if (!go) return [{ ax: Math.abs(dx) > 0.4 ? ax * m.pace : 0, ay: back ? -0.8 : 0, run: true, jump: false }];
      // Slow the forward push while a big sideways correction is still needed.
      const ay = m.pace * (careful && Math.abs(dx) > 2.2 ? 0.45 : 1);
      return [{ ax: ax * m.pace, ay, run: true, jump }];
    },
  };
}
