/**
 * Online own-toy prediction for Hoop Clash: your toy and your shot meter answer at once, and the
 * power your meter showed is the power you get. The link tests run a real server-side GameRun
 * (validation included) through a simulated 80 ms each-way connection.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GameRun } from '../../server/matchRunner';
import { serverGame } from '../../server/games';
import { predictHoop } from '../../src/minigames/hoopclash/predict';
import { CHARGE_CLAIM, CHARGE_MS, TUNING, hoopRules, type HoopInput, type HoopState } from '../../src/minigames/hoopclash/rules';
import { COURT } from '../../src/minigames/hoopclash/court';
import { predictClock } from '../../src/minigames/shared/predictSmooth';
import { shotPower } from '../../src/minigames/shared/shotMeter';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant, MatchEvent, PredictFrame } from '../../src/minigames/types';

const human = (id: string): Contestant => ({ id, name: id.toUpperCase(), paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: false });
const TICK = 1000 / 30;
const STILL = { type: 'in' as const, ax: 0, ay: 0, run: false, act: false };
const P = (s: HoopState, id: string) => s.players.find((p) => p.id === id)!;

/** A 2-v-2 of four humans (nobody else moves), live, with p1 alone near a sideline. */
function liveRun(withBall: boolean) {
  const run = new GameRun('hoop-clash', ['p1', 'p2', 'p3', 'p4'].map(human), 5);
  const s = run.state as HoopState;
  for (let i = 0; i < 30 * 30 && s.phase !== 'live'; i++) run.advance(TICK);
  expect(s.phase).toBe('live');
  s.players.forEach((p, i) => Object.assign(p, { x: 10 + i * 6, z: -COURT.halfW + 2, vx: 0, vz: 0, charge: -1, in: { ...STILL } }));
  Object.assign(P(s, 'p1'), { x: -12, z: COURT.halfW - 3, yaw: Math.PI / 2 });
  if (withBall) {
    s.ball.holder = 'p1';
    s.ball.grabT = s.t;
    s.ball.lastTeam = P(s, 'p1').team;
    s.poss = P(s, 'p1').team;
    s.shotClock = s.config.shotMs;
  } else {
    s.ball.holder = 'p2';
  }
  return run;
}
const viewOf = (run: GameRun) => JSON.parse(JSON.stringify(run.viewFor(run.publicView(), 'p1'))) as HoopState;

/** Client and server through a `lat` ms each-way link: the client samples `stick(t)` every frame, as readHoopInput does. */
function playLinked(run: GameRun, stick: (t: number) => { ax: number; act: boolean }, endMs: number, frame = 1000 / 60, lat = 80) {
  let clock = 0;
  predictClock.now = () => clock;
  const queue: { at: number; run: () => void }[] = [];
  const later = (at: number, fn: () => void) => { queue.push({ at, run: fn }); queue.sort((a, b) => a.at - b.at); };
  let state = viewOf(run);
  let ack = -1, q = 0;
  let pending: HoopInput[] = [];
  let frames: (PredictFrame<HoopInput> & { q: number })[] = [];
  const shown: { t: number; x: number; charge: number }[] = [];
  const events: { t: number; e: MatchEvent }[] = [];
  let nextFrame = 0, nextFlush = 0, nextTick = 0;
  for (let t = 0; t <= endMs; t++) {
    clock = t;
    while (queue.length && queue[0].at <= t) queue.shift()!.run();
    if (t >= nextTick) {
      nextTick += TICK;
      run.advance(TICK);
      const view = viewOf(run), a = run.ackFor('p1'), ev = run.takeEvents();
      for (const e of ev) events.push({ t, e });
      later(t + lat, () => {
        state = view;
        if (a !== undefined) { ack = a; frames = frames.filter((f) => f.q > a); }
      });
    }
    if (t >= nextFrame) {
      nextFrame += frame;
      const want = stick(t);
      const drawn = ack >= 0 ? predictHoop(state, 'p1', frames) ?? state : state;
      const seen = P(drawn, 'p1').charge;
      const inp: HoopInput = !want.act && seen >= 0 ? { type: 'in', ax: want.ax, ay: 0, run: false, act: false, charge: Math.round(seen) } : { type: 'in', ax: want.ax, ay: 0, run: false, act: want.act };
      pending.push(inp);
      frames.push({ q: q + 1, dt: frame, inputs: [inp] });
      const out = ack >= 0 ? predictHoop(state, 'p1', frames) ?? state : state;
      shown.push({ t, x: P(out, 'p1').x, charge: P(out, 'p1').charge });
    }
    if (t >= nextFlush) {
      nextFlush += TICK;
      q++;
      const items = pending, n = q;
      pending = [];
      later(t + lat, () => run.input('p1', items, n));
    }
  }
  predictClock.now = () => performance.now();
  return { shown, events, state: () => state };
}

describe('Hoop Clash shot charge claim', () => {
  it('the server passes a claimed charge through validation, and refuses a bad one', () => {
    const v = serverGame('hoop-clash').validate;
    expect(v({ type: 'in', ax: 0, ay: 0, run: false, act: false, charge: 640 })).toEqual({ type: 'in', ax: 0, ay: 0, run: false, act: false, charge: 640 });
    expect(v({ type: 'in', ax: 0, ay: 0, run: false, act: false })).toEqual({ type: 'in', ax: 0, ay: 0, run: false, act: false });
    expect(v({ type: 'in', ax: 0, ay: 0, run: false, act: false, charge: 'lots' })).toBeNull();
    expect(v({ type: 'in', ax: 0, ay: 0, run: false, act: false, charge: Infinity })).toBeNull();
  });

  it.each([
    ['taken within the window', -120, true],
    ['ignored when too far behind', -(CHARGE_CLAIM.behind + 40), false],
    ['ignored when ahead of the count', CHARGE_CLAIM.ahead + 40, false],
  ])('a let-go claim is %s', (_l, off, honoured) => {
    const run = liveRun(true);
    const s = run.state as HoopState;
    run.input('p1', [{ ...STILL, act: true }]);
    for (let i = 0; i < 18; i++) run.advance(TICK); // ~0.6 s held
    run.takeEvents();
    const counted = P(s, 'p1').charge;
    const claim = counted + (off as number);
    run.input('p1', [{ ...STILL, charge: claim }]);
    run.advance(TICK);
    const shot = run.takeEvents().find((e) => e.type === 'shot')!;
    expect(shot).toBeDefined();
    const want = shotPower(honoured ? claim : counted + 1000 / 60, CHARGE_MS); // the rules count the let-go's own step first
    expect(shot.power).toBeCloseTo(Math.round(want * 100) / 100, 2);
  });
});

describe('predictHoop', () => {
  // The prediction's smoothing is per client; start each case afresh.
  beforeEach(() => void predictHoop(viewOf(liveRun(false)), 'nobody', []));
  it('replays unstepped input from the server position without touching the server state', () => {
    const s = viewOf(liveRun(false));
    const before = JSON.stringify(s);
    const x0 = P(s, 'p1').x;
    const frames: PredictFrame<HoopInput>[] = Array.from({ length: 12 }, () => ({ dt: 1000 / 60, inputs: [{ ...STILL, ax: 1 }] }));
    const out = predictHoop(s, 'p1', frames)!;
    expect(JSON.stringify(s)).toBe(before);
    expect(P(out, 'p1').x).toBeGreaterThan(x0 + 0.5);
    for (const q of out.players) if (q.id !== 'p1') expect(s.players).toContain(q);
  });

  it('pressing with the ball plants the feet and winds the meter at once; letting go ends it', () => {
    const s = viewOf(liveRun(true));
    const frames: PredictFrame<HoopInput>[] = [{ dt: 16, inputs: [{ ...STILL, ax: 1, act: true }] }];
    for (let i = 0; i < 30; i++) frames.push({ dt: 1000 / 60, inputs: [{ ...STILL, ax: 1, act: true }] });
    const held = P(predictHoop(s, 'p1', frames)!, 'p1');
    expect(held.charge).toBeCloseTo(30 * 1000 / 60, 3);
    expect(held.x).toBeCloseTo(P(s, 'p1').x, 3); // rooted while charging
    frames.push({ dt: 1000 / 60, inputs: [{ ...STILL, charge: 500 }] });
    expect(P(predictHoop(s, 'p1', frames)!, 'p1').charge).toBe(-1);
  });

  it('predicts nothing while play is frozen or for a toy the rules drive', () => {
    const s = viewOf(liveRun(false));
    expect(predictHoop({ ...s, phase: 'half' }, 'p1', [])).toBeNull();
    expect(predictHoop({ ...s, players: s.players.map((p) => (p.id === 'p1' ? { ...p, ai: 'normal' as const } : p)) }, 'p1', [])).toBeNull();
    expect(predictHoop(s, 'nobody', [])).toBeNull();
  });
});

describe('Hoop Clash through an 80 ms each-way link', () => {
  it.each([['60 fps', 1000 / 60], ['slow 220 ms frames', 220]])('(%s) the toy moves on the next frame, glides, and ends where the server puts it', (_l, FRAME) => {
    const run = liveRun(false);
    const PRESS = 400, RELEASE = 1400;
    const { shown, state } = playLinked(run, (t) => ({ ax: t >= PRESS && t < RELEASE ? 1 : 0, act: false }), 2600, FRAME);
    const x0 = shown[0].x;
    const firstMove = shown.find((s) => s.x > x0 + 1e-6)!;
    expect(firstMove.t - PRESS).toBeLessThanOrEqual(2 * FRAME + 1);
    // the server copy starts two trips later
    const at = (t: number) => shown.find((s) => s.t >= t)!;
    // no twitch: no frame moves more than a toy can walk in it (and a server tick's correction)
    for (let i = 1; i < shown.length; i++) expect(Math.abs(shown[i].x - shown[i - 1].x)).toBeLessThan(TUNING.walk * (FRAME + TICK) / 1000 + 0.15);
    expect(Math.abs(at(RELEASE + 400).x - at(RELEASE + 1000).x)).toBeLessThan(0.05);
    expect(shown[shown.length - 1].x).toBeCloseTo(P(state(), 'p1').x, 3);
  });

  it('the meter winds from the press, and the shot leaves with the power it showed on letting go', () => {
    const run = liveRun(true);
    const PRESS = 300, LETGO = 300 + 830; // let go on the way back down (the sweep is 1.1 s up)
    const { shown, events } = playLinked(run, (t) => ({ ax: 0, act: t >= PRESS && t < LETGO }), 2000);
    const firstCharge = shown.find((s) => s.charge >= 0)!;
    expect(firstCharge.t - PRESS).toBeLessThanOrEqual(2 * 1000 / 60 + 1); // the meter starts at once, not a round trip later
    const lastSeen = [...shown].reverse().find((s) => s.t < LETGO + 1000 / 60 && s.charge >= 0)!;
    const shot = events.find((e) => e.e.type === 'shot')!.e;
    expect(shot.power).toBeCloseTo(Math.round(shotPower(lastSeen.charge, CHARGE_MS) * 100) / 100, 2);
  });
});
