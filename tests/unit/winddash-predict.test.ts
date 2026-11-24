/**
 * Online own-toy prediction for Wind-Up Dash: through a simulated each-way link your toy answers the
 * stick on the next frame and stops when you let go, instead of a round trip later, and ends where
 * the server has it.
 */
import { describe, expect, it } from 'vitest';
import { GameRun } from '../../server/matchRunner';
import { predictDash } from '../../src/minigames/winddash/predict';
import type { DashInput as RlglInput, DashState as RlglState } from '../../src/minigames/winddash/rules';
import { predictClock } from '../../src/minigames/shared/predictSmooth';
import { TOY_TUNING } from '../../src/minigames/shared/movement';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant, PredictFrame } from '../../src/minigames/types';

const human = (id: string): Contestant => ({ id, name: id.toUpperCase(), paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: false });
const TICK = 1000 / 30;
const P = (s: RlglState, id: string) => s.players.find((p) => p.id === id)!;
const viewOf = (run: GameRun) => JSON.parse(JSON.stringify(run.viewFor(run.publicView(), 'p1'))) as RlglState;

function goRun() {
  const run = new GameRun('wind-up-dash', ['p1', 'p2'].map(human), 9);
  for (let i = 0; i < 300 && (run.state as RlglState).phase !== 'race'; i++) run.advance(TICK);
  expect((run.state as RlglState).phase).toBe('race');
  return run;
}

function playLinked(run: GameRun, stickX: (t: number) => number, endMs: number, frame: number, lat = 80) {
  let clock = 0;
  predictClock.now = () => clock;
  const queue: { at: number; run: () => void }[] = [];
  const later = (at: number, fn: () => void) => { queue.push({ at, run: fn }); queue.sort((a, b) => a.at - b.at); };
  let state = viewOf(run);
  let ack = -1, age = 0, q = 0, nextFrame = 0, nextFlush = 0, nextTick = 0;
  let pending: RlglInput[] = [];
  let frames: (PredictFrame<RlglInput> & { q: number })[] = [];
  const shown: { t: number; z: number }[] = [];
  for (let t = 0; t <= endMs; t++) {
    clock = t;
    while (queue.length && queue[0].at <= t) queue.shift()!.run();
    if (t >= nextTick) {
      nextTick += TICK;
      run.advance(TICK);
      const view = viewOf(run), a = run.ackFor('p1'), g = run.ackAgeFor('p1') ?? 0;
      later(t + lat, () => {
        state = view;
        if (a !== undefined) { ack = a; age = g; frames = frames.filter((f) => f.q > a); }
      });
    }
    if (t >= nextFrame) {
      nextFrame += frame;
      const inp: RlglInput = { ax: stickX(t), ay: 0, run: true, jump: false };
      pending.push(inp);
      frames.push({ q: q + 1, dt: frame, inputs: [inp] });
      const out = ack >= 0 ? predictDash(state, 'p1', frames, age) ?? state : state;
      shown.push({ t, z: P(out, 'p1').m.x });
      if (t < nextFlush) continue;
      nextFlush = t + TICK;
      q++;
      const items = pending, n = q;
      pending = [];
      later(t + lat, () => run.input('p1', items, n));
    }
  }
  predictClock.now = () => performance.now();
  return { shown, state: () => state };
}

describe('Wind-Up Dash own-toy prediction', () => {
  it('predicts nothing before the start, or while the toy is thrown, stunned or home', () => {
    const s = viewOf(goRun());
    const f: PredictFrame<RlglInput>[] = [{ dt: 50, inputs: [{ ax: 1, ay: 0, run: true, jump: false }] }];
    const me = (patch: object) => ({ ...s, players: s.players.map((p) => (p.id === 'p1' ? { ...p, ...patch } : p)) });
    expect(predictDash({ ...s, phase: 'intro' }, 'p1', f)).toBeNull();
    expect(predictDash(me({ stunMs: 300 }), 'p1', f)).toBeNull();
    expect(predictDash(me({ finished: true }), 'p1', f)).toBeNull();
    expect(predictDash(me({ toss: { t: 0, ms: 500, fromZ: 0, toZ: -10, h: 7, stun: 0 } }), 'p1', f)).toBeNull();
    const before = JSON.stringify(s);
    expect(predictDash(s, 'p1', [...f, { dt: 100, inputs: [] }])).not.toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });

  it.each([['60 fps', 1000 / 60, 80], ['slow 220 ms frames', 220, 80], ['60 fps, 150 ms each way', 1000 / 60, 150]])('(%s) the toy moves on the next frame, stops on letting go, and ends where the server puts it', (_l, FRAME, LAT) => {
    const run = goRun();
    const PRESS = 400, RELEASE = 900; // a short strafe across the start (after the first acknowledgement)
    const { shown, state } = playLinked(run, (t) => (t >= PRESS && t < RELEASE ? 1 : 0), RELEASE + 1000 + 4 * FRAME, FRAME, LAT);
    const x0 = shown[0].z; // (x here)
    const firstMove = shown.find((s) => s.z > x0 + 1e-6)!; // right is +x
    expect(firstMove.t - PRESS).toBeLessThanOrEqual(2 * FRAME + 1);
    const final = P(state(), 'p1').m.x;
    expect(final).toBeGreaterThan(x0 + 3);
    const tickWalk = (TOY_TUNING.run * (TICK + Math.min(FRAME, TICK))) / 1000 + 0.05;
    // never walks on past where the server stops it (no snapping back)
    for (const s of shown) expect(s.z).toBeLessThan(final + tickWalk);
    expect(shown[shown.length - 1].z).toBeCloseTo(final, 3);
  });
});
