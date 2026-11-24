/**
 * Online own-toy prediction for Red Light, Green Light: through a simulated 80 ms each-way link
 * your toy answers the stick on the next frame and stops when you let go, instead of walking on for
 * a round trip (most visible on red), and ends where the server has it.
 */
import { describe, expect, it } from 'vitest';
import { GameRun } from '../../server/matchRunner';
import { predictRlgl } from '../../src/minigames/redlight/predict';
import type { RlglInput, RlglState } from '../../src/minigames/redlight/rules';
import { predictClock } from '../../src/minigames/shared/predictSmooth';
import { TOY_TUNING } from '../../src/minigames/shared/movement';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant, PredictFrame } from '../../src/minigames/types';

const human = (id: string): Contestant => ({ id, name: id.toUpperCase(), paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: false });
const TICK = 1000 / 30;
const P = (s: RlglState, id: string) => s.players.find((p) => p.id === id)!;
const viewOf = (run: GameRun) => JSON.parse(JSON.stringify(run.viewFor(run.publicView(), 'p1'))) as RlglState;

function goRun() {
  const run = new GameRun('red-light-green-light', ['p1', 'p2'].map(human), 9);
  for (let i = 0; i < 300 && (run.state as RlglState).phase !== 'go'; i++) run.advance(TICK);
  expect((run.state as RlglState).phase).toBe('go');
  return run;
}

function playLinked(run: GameRun, stickY: (t: number) => number, endMs: number, frame: number, lat = 80) {
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
      const inp: RlglInput = { ax: 0, ay: stickY(t), run: true, jump: false };
      pending.push(inp);
      frames.push({ q: q + 1, dt: frame, inputs: [inp] });
      const out = ack >= 0 ? predictRlgl(state, 'p1', frames, age) ?? state : state;
      shown.push({ t, z: P(out, 'p1').m.z });
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

describe('Red Light own-toy prediction', () => {
  it('predicts nothing while the toy is held, flung or before the start', () => {
    const s = viewOf(goRun());
    const f: PredictFrame<RlglInput>[] = [{ dt: 50, inputs: [{ ax: 0, ay: 1, run: true, jump: false }] }];
    expect(predictRlgl({ ...s, phase: 'intro' }, 'p1', f)).toBeNull();
    expect(predictRlgl({ ...s, players: s.players.map((p) => (p.id === 'p1' ? { ...p, held: true } : p)) }, 'p1', f)).toBeNull();
    const before = JSON.stringify(s);
    expect(predictRlgl(s, 'p1', [...f, { dt: 100, inputs: [] }])).not.toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });

  it.each([['60 fps', 1000 / 60], ['slow 220 ms frames', 220]])('(%s) through an 80 ms link the toy moves on the next frame, stops on letting go, and ends where the server puts it', (_l, FRAME) => {
    const run = goRun();
    const PRESS = 300, RELEASE = 1100; // inside the first green (after the first acknowledgement)
    const { shown, state } = playLinked(run, (t) => (t >= PRESS && t < RELEASE ? 1 : 0), RELEASE + 900 + 4 * FRAME, FRAME);
    const z0 = shown[0].z;
    const firstMove = shown.find((s) => s.z < z0 - 1e-6)!; // forward is −z
    expect(firstMove.t - PRESS).toBeLessThanOrEqual(2 * FRAME + 1);
    const final = P(state(), 'p1').m.z;
    const tickWalk = (TOY_TUNING.run * (TICK + Math.min(FRAME, TICK))) / 1000 + 0.05;
    // never walks on past where the server stops it (no snapping back)
    for (const s of shown) expect(s.z).toBeGreaterThan(final - tickWalk);
    expect(shown[shown.length - 1].z).toBeCloseTo(final, 3);
  });
});

describe('Red Light views without the hidden timings', () => {
  it('an online client gets no light timings, and the view accessor copes (the Scene froze reading them)', async () => {
    const { shownCycle, currentCycle } = await import('../../src/minigames/redlight/rules');
    const run = goRun();
    const view = viewOf(run);
    expect(view.cycles).toEqual([]);
    expect(shownCycle(view)).toBeUndefined();
    expect(shownCycle(run.state as RlglState)).toEqual(currentCycle(run.state as RlglState));
  });
});
