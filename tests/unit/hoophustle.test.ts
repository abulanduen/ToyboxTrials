import { describe, expect, it } from 'vitest';
import { PAINT_JOBS } from '../../src/game/palette';
import { BALL, HOOP } from '../../src/game/hubPlay';
import { BALL_GRAVITY, THROW_ANGLE, THROW_MAX, THROW_MIN } from '../../src/game/hubPlaySim';
import type { BotDifficulty, Contestant, MatchEvent } from '../../src/minigames/types';
import { seededRng, subSeed } from '../../src/minigames/rng';
import { BALL_R, RIM, STEP_MS, launch, perfectPower, predictShot, yawToHoop } from '../../src/minigames/hoophustle/physics';
import { DEFAULT_CONFIG, assistBand, buildSpots, canShoot, freeSpots, hoopRules, hoopXAt, perfectPowerAt, type HoopInput, type HoopState } from '../../src/minigames/hoophustle/rules';
import { createHoopBot } from '../../src/minigames/hoophustle/bot';

const toy = (id: string, bot?: BotDifficulty): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you', ...(bot ? { bot } : {}) });
const field = (n: number, bot: BotDifficulty = 'normal') => [toy('you'), ...Array.from({ length: n - 1 }, (_, i) => toy(`b${i}`, bot))];

/** Step a state, collecting events. */
function run(s: HoopState, ms: number, inputs: () => Record<string, HoopInput[]> = () => ({}), events: MatchEvent[] = []) {
  for (let t = 0; t < ms && !hoopRules.isOver(s); t += STEP_MS) {
    hoopRules.step(s, inputs(), STEP_MS);
    events.push(...hoopRules.drainEvents(s));
  }
  return events;
}

/** A whole match with every seat but `you` played by bots (and `you` by a bot too unless told otherwise). */
function playMatch(seed: number, n: number, diff: BotDifficulty = 'normal', check?: (s: HoopState) => void) {
  const people = field(n, diff).map((c) => ({ ...c, bot: c.bot ?? diff }));
  const s = hoopRules.init(people, seed);
  const bot = createHoopBot();
  const rngs = new Map(people.map((c) => [c.id, seededRng(subSeed(seed, c.id))]));
  const events: MatchEvent[] = [];
  for (let i = 0; i < 200000 && !hoopRules.isOver(s); i++) {
    const inputs: Record<string, HoopInput[]> = {};
    for (const c of people) {
      const out = bot.decide(s, c, STEP_MS, rngs.get(c.id)!);
      if (out.length) inputs[c.id] = out;
    }
    hoopRules.step(s, inputs, STEP_MS);
    events.push(...hoopRules.drainEvents(s));
    check?.(s);
  }
  return { s, events };
}

describe('Hoop Hustle physics (the Hub basketball on the trial court)', () => {
  it('uses the Hub ball, rim and throw', () => {
    expect(BALL_R).toBe(BALL.r);
    expect(RIM.r).toBe(HOOP.rim.r);
    expect(RIM.y).toBe(HOOP.rim.y);
    const b = launch(0, 20, Math.PI, 1);
    expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(THROW_MAX * Math.cos(THROW_ANGLE), 6);
    expect(b.vy).toBeCloseTo(THROW_MAX * Math.sin(THROW_ANGLE), 6);
    expect(Math.hypot(launch(0, 20, 0, 0).vy, 0)).toBeCloseTo(THROW_MIN * Math.sin(THROW_ANGLE), 6);
    expect(BALL_GRAVITY).toBeGreaterThan(0);
  });

  it('every spot can score from mid-meter powers, with the hoop centred or at either end of its slide', () => {
    const spots = buildSpots(DEFAULT_CONFIG);
    for (const hx of [0, -DEFAULT_CONFIG.slideAmp, DEFAULT_CONFIG.slideAmp]) {
      for (const sp of spots) {
        const p = perfectPower(sp.x, sp.z, yawToHoop(sp.x, sp.z, hx), () => hx);
        expect(p, `spot ${sp.x.toFixed(1)},${sp.z.toFixed(1)} hoop ${hx}`).not.toBeNull();
        expect(p!).toBeGreaterThan(0.15);
        expect(p!).toBeLessThan(0.95);
        expect(predictShot(sp.x, sp.z, yawToHoop(sp.x, sp.z, hx), p!, () => hx, null).scores).toBe(true);
      }
    }
  });

  it('farther rings need more power; full power always overshoots (no free shots by holding)', () => {
    const spots = buildSpots(DEFAULT_CONFIG);
    const mid = (ring: number) => spots.filter((s) => s.ring === ring)[3];
    const pw = [0, 1, 2].map((r) => perfectPower(mid(r).x, mid(r).z, yawToHoop(mid(r).x, mid(r).z, 0), () => 0)!);
    expect(pw[0]).toBeLessThan(pw[1]);
    expect(pw[1]).toBeLessThan(pw[2]);
    for (const sp of spots) expect(predictShot(sp.x, sp.z, yawToHoop(sp.x, sp.z, 0), 1, () => 0, null).scores).toBe(false);
  });
});

describe('Hoop Hustle court and spots', () => {
  it('24 spots on three rings worth 1, 2 and 3, well apart', () => {
    const spots = buildSpots(DEFAULT_CONFIG);
    expect(spots).toHaveLength(24);
    expect(spots.filter((s) => s.value === 1)).toHaveLength(8);
    expect(spots.filter((s) => s.value === 3)).toHaveLength(8);
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThan(4);
  });

  it('starts everyone on a distinct 1-point spot facing the hoop, holding a ball', () => {
    const s = hoopRules.init(field(8), 5);
    expect(new Set(s.players.map((p) => p.spot)).size).toBe(8);
    for (const p of s.players) {
      expect(s.spots[p.spot].value).toBe(1);
      expect(p.holding).toBe(true);
      expect(canShoot(s, p)).toBe(true);
      const sp = s.spots[p.spot];
      expect(Math.abs(p.yaw - yawToHoop(sp.x, sp.z, 0))).toBeLessThan(1e-9);
    }
    expect(() => hoopRules.init([toy('a'), toy('a')], 1)).toThrow();
    expect(() => hoopRules.init(Array.from({ length: 9 }, (_, i) => toy(`t${i}`)), 1)).toThrow();
  });
});

describe('Hoop Hustle shooting', () => {
  it('a throw at the perfect power scores the spot value, then the toy hops to a new free spot', () => {
    const s = hoopRules.init(field(2), 11);
    const me = s.players[0];
    const from = me.spot;
    const p = perfectPowerAt(s.config, s.spots[from], s.t)!;
    let sent = false;
    const ev = run(s, 2500, () => (sent ? {} : ((sent = true), { you: [{ type: 'charge' }, { type: 'throw', power: p }] })));
    expect(ev.some((e) => e.type === 'hh-throw' && e.id === 'you')).toBe(true);
    expect(ev.find((e) => e.type === 'hh-score' && e.id === 'you')).toMatchObject({ points: 1, gold: false });
    expect(me.points).toBe(1);
    expect(me.makes).toBe(1);
    expect(me.spot).not.toBe(from);
    expect(ev.some((e) => e.type === 'hh-move' && e.id === 'you')).toBe(true);
    // The hop lands and a new ball arrives.
    expect(me.move).toBeNull();
    expect(me.holding).toBe(true);
  });

  it('the power assist: near the perfect power counts as perfect; far off misses short or long', () => {
    for (const [off, made, kind] of [[0.8, true, null], [-1.5, false, 'short'], [2.5, false, 'long']] as const) {
      const s = hoopRules.init(field(2), 4);
      const me = s.players[0];
      const sp = s.spots[me.spot];
      const perfect = perfectPowerAt(s.config, sp, 0)!;
      const power = perfect + off * assistBand(s.config, sp);
      let sent = false;
      const ev = run(s, 3000, () => (sent ? {} : ((sent = true), { you: [{ type: 'throw', power }] })));
      expect(ev.find((e) => e.type === 'hh-throw')?.perfect).toBe(made);
      expect(me.makes).toBe(made ? 1 : 0);
      if (!made) {
        expect(ev.find((e) => e.type === 'hh-miss')).toMatchObject({ id: 'you', kind });
        expect(me.spot).toBeDefined();
      }
    }
  });

  it('the aim assist only bends a facing roughly at the hoop', () => {
    const s = hoopRules.init(field(2), 4);
    const me = s.players[0];
    const sp = s.spots[me.spot];
    const perfect = perfectPowerAt(s.config, sp, 0)!;
    const off = yawToHoop(sp.x, sp.z, 0) + 1.2; // well to one side
    let sent = false;
    run(s, 3000, () => (sent ? {} : ((sent = true), { you: [{ type: 'aim', yaw: off }, { type: 'throw', power: perfect }] })));
    expect(me.makes).toBe(0);
    const s2 = hoopRules.init(field(2), 4);
    let sent2 = false;
    run(s2, 3000, () => (sent2 ? {} : ((sent2 = true), { you: [{ type: 'aim', yaw: yawToHoop(sp.x, sp.z, 0) + 0.5 }, { type: 'throw', power: perfect }] })));
    expect(s2.players[0].makes).toBe(1);
  });

  it('ignores throws without a ball and malformed inputs', () => {
    const s = hoopRules.init(field(2), 9);
    const bad = [{ type: 'throw', power: NaN }, { type: 'aim', yaw: Infinity }, { type: 'nope' }, null] as unknown as HoopInput[];
    run(s, 50, () => ({ you: bad }));
    expect(Number.isFinite(s.players[0].yaw)).toBe(true);
    // One throw (NaN power falls back to the charge timer: zero) uses up the ball; a second does nothing.
    expect(s.players[0].shots).toBe(1);
    run(s, 50, () => ({ you: [{ type: 'throw', power: 0.5 }] }));
    expect(s.players[0].shots).toBe(1);
  });

  it('the rules\' own meter winds back and forth: a throw with no power of its own uses where it has got to', () => {
    const s = hoopRules.init(field(2), 11);
    run(s, 100);
    let k = 0;
    // Charge, hold for one and a half sweeps (up to full, back to half), then let go.
    const hold = Math.round((s.config.chargeMs * 1.5) / STEP_MS);
    const ev = run(s, (hold + 2) * STEP_MS, () => (++k === 1 ? { you: [{ type: 'charge' }] } : k === hold + 1 ? { you: [{ type: 'throw' }] } : {}));
    const thrown = ev.find((e) => e.type === 'hh-throw' && e.id === 'you');
    expect(thrown).toBeDefined();
    // (the power assist may snap a near-perfect power, so compare against the meter, not exactly)
    if (!thrown!.perfect) expect(Math.abs((thrown!.power as number) - 0.5)).toBeLessThan(0.03);
  });

  it('cancel drops a charge without a throw', () => {
    const s = hoopRules.init(field(2), 11);
    run(s, 100);
    let k = 0;
    const ev = run(s, 900, () => (++k === 1 ? { you: [{ type: 'charge' }] } : k === 30 ? { you: [{ type: 'cancel' }] } : {}));
    expect(ev.filter((e) => e.type === 'hh-cancel')).toEqual([{ type: 'hh-cancel', id: 'you' }]);
    expect(ev.some((e) => e.type === 'hh-throw')).toBe(false);
    expect(s.players[0].charging).toBe(false);
    expect(s.players[0].holding).toBe(true);
    expect(s.players[0].shots).toBe(0);
  });

  it('honours a throw let go a little earlier (online lag), up to the limit', () => {
    const a = hoopRules.init(field(2), 21);
    run(a, 1000);
    const at = a.t;
    const b = structuredClone(a);
    let sentA = false;
    run(a, 200, () => (sentA ? {} : ((sentA = true), { you: [{ type: 'throw', power: 0.4 }] })));
    // b lets go "at the same moment" but the message arrives 6 steps later.
    let k = 0;
    run(b, 200 + 6 * STEP_MS, () => (++k === 7 ? { you: [{ type: 'throw', power: 0.4, at }] } : {}));
    const ba = a.balls.find((x) => x.owner === 'you')!;
    const bb = b.balls.find((x) => x.owner === 'you')!;
    expect(bb.born).toBeCloseTo(at, 6);
    expect(ba.born).toBeCloseTo(at, 6);
  });
});

describe('Hoop Hustle twists and the clock', () => {
  it('the hoop holds still until half time, then slides within its track (and rests at the ends)', () => {
    const c = DEFAULT_CONFIG;
    expect(c.slideAt).toBe(c.durationMs / 2);
    expect(hoopXAt(c, 0)).toBe(0);
    expect(hoopXAt(c, c.slideAt)).toBe(0);
    let atEnd = 0;
    const n = 600;
    for (let i = 1; i <= n; i++) {
      const x = hoopXAt(c, c.slideAt + (i / n) * c.slidePeriodMs);
      expect(Math.abs(x)).toBeLessThanOrEqual(c.slideAmp + 1e-9);
      if (Math.abs(x) === c.slideAmp) atEnd++;
    }
    expect(atEnd / n).toBeGreaterThan(0.4);
  });

  it('warns, slides, turns the next ball gold, sounds the buzzer, and ends after the last ball', () => {
    const { s, events } = playMatch(7, 4);
    const order = ['hh-slide-warn', 'hh-slide', 'hh-gold', 'hh-buzzer'].map((t) => events.findIndex((e) => e.type === t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(s.phase).toBe('over');
    expect(s.t).toBeGreaterThanOrEqual(s.config.durationMs);
    expect(s.t).toBeLessThan(s.config.durationMs + s.config.flightMaxMs + s.config.moveMs + s.config.endingMs + 100);
    // Every toy shot a gold ball (worth double) in the last 15 seconds, and no gold before.
    const golds = events.filter((e) => e.type === 'hh-throw' && e.gold);
    expect(new Set(golds.map((e) => e.id)).size).toBe(4);
    expect(golds.length).toBe(4);
    for (const e of events.filter((e) => e.type === 'hh-score' && e.gold)) expect([2, 4, 6]).toContain(e.points);
  });

  it('a shot in the air at the buzzer still counts', () => {
    // (A still hoop, so the perfect power exists whenever we like.)
    const s = hoopRules.init(field(2), 3, { slideAmp: 0 });
    run(s, s.config.durationMs - 120);
    const me = s.players[0];
    expect(me.holding).toBe(true);
    expect(me.gold).toBe(true);
    const p = perfectPowerAt(s.config, s.spots[me.spot], s.t)!;
    const value = s.spots[me.spot].value * 2;
    const before = me.points;
    let sent = false;
    const ev = run(s, 4000, () => (sent ? {} : ((sent = true), { you: [{ type: 'throw', power: p }] })));
    const buzz = ev.findIndex((e) => e.type === 'hh-buzzer');
    const score = ev.findIndex((e) => e.type === 'hh-score' && e.id === 'you');
    expect(buzz).toBeGreaterThanOrEqual(0);
    expect(score).toBeGreaterThan(buzz);
    expect(me.points).toBe(before + value);
    expect(s.phase).toBe('over');
  });
});

describe('Hoop Hustle matches with bots', () => {
  it('is deterministic for a seed, keeps spots unshared every step, and ranks by points then baskets', () => {
    const check = (s: HoopState) => {
      const taken = s.players.flatMap((p) => (p.move ? [p.spot] : [p.spot]));
      expect(new Set(taken).size).toBe(taken.length);
      expect(freeSpots(s).length).toBe(s.spots.length - s.players.length);
    };
    const a = playMatch(42, 8, 'normal', check);
    const b = playMatch(42, 8, 'normal');
    expect(a.s.players.map((p) => [p.points, p.makes, p.shots])).toEqual(b.s.players.map((p) => [p.points, p.makes, p.shots]));
    expect(a.events.length).toBe(b.events.length);
    const r = hoopRules.result(a.s);
    expect(r.placements).toHaveLength(8);
    for (let i = 1; i < r.placements.length; i++) {
      const prev = a.s.players.find((p) => p.id === r.placements[i - 1].contestantId)!;
      const cur = a.s.players.find((p) => p.id === r.placements[i].contestantId)!;
      expect(prev.points > cur.points || (prev.points === cur.points && prev.makes >= cur.makes)).toBe(true);
      if (prev.points === cur.points && prev.makes === cur.makes) expect(r.placements[i].place).toBe(r.placements[i - 1].place);
      else expect(r.placements[i].place).toBe(i + 1);
    }
    expect(r.placements[0].score).toBe(Math.max(...a.s.players.map((p) => p.points)));
    expect(a.s.players.reduce((n, p) => n + p.makes, 0)).toBeGreaterThan(20);
  });

  it('shares a place on equal points and baskets, and breaks equal points by baskets', () => {
    const s = hoopRules.init(field(3), 1);
    Object.assign(s.players[0], { points: 6, makes: 3 });
    Object.assign(s.players[1], { points: 6, makes: 2 });
    Object.assign(s.players[2], { points: 6, makes: 3 });
    const r = hoopRules.result(s);
    expect(r.placements.map((p) => [p.contestantId, p.place])).toEqual([['you', 1], ['b1', 1], ['b0', 3]]);
  });

  it('harder bots score more than easy ones', () => {
    let easy = 0;
    let hard = 0;
    for (const seed of [1, 2, 3]) {
      easy += playMatch(seed, 4, 'easy').s.players.reduce((n, p) => n + p.makes / Math.max(1, p.shots), 0);
      hard += playMatch(seed, 4, 'hard').s.players.reduce((n, p) => n + p.makes / Math.max(1, p.shots), 0);
    }
    expect(hard).toBeGreaterThan(easy * 1.25);
  });

  it('a forfeiting player stops shooting but keeps their points', () => {
    const s = hoopRules.init(field(2), 8);
    s.players[0].points = 5;
    hoopRules.forfeit(s, 'you');
    run(s, 3000);
    expect(s.players[0].shots).toBe(0);
    expect(s.players[0].points).toBe(5);
    expect(JSON.parse(JSON.stringify(s)).players[0].readyAt).toBe(1e12);
  });
});
