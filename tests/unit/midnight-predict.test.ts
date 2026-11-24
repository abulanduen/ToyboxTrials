/**
 * Online own-toy prediction for Midnight Hunger: through a simulated each-way link your toy
 * turns and hops on the next frame after you press, stops hopping when you let go (no hop the server
 * then takes back), and ends on the server's cell.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GameRun } from '../../server/matchRunner';
import { predictHunger } from '../../src/minigames/midnight/predict';
import type { HungerInput, HungerState } from '../../src/minigames/midnight/rules';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant, PredictFrame } from '../../src/minigames/types';
import { predictClock } from '../../src/minigames/shared/predictGrid';

const human = (id: string): Contestant => ({ id, name: id.toUpperCase(), paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: false });
const TICK = 1000 / 30;
const P = (s: HungerState, id: string) => s.players.find((p) => p.id === id)!;
const viewOf = (run: GameRun) => JSON.parse(JSON.stringify(run.viewFor(run.publicView(), 'p1'))) as HungerState;

/** A run where p1 has a clear row to its left (direction 3) for a few cells. */
function clearRun(seed: number) {
  const run = new GameRun('midnight-hunger', ['p1', 'p2'].map(human), seed);
  const s = run.state as HungerState;
  s.batteries = s.batteries.filter((b) => b.z !== P(s, 'p1').z);
  return run;
}

function playLinked(run: GameRun, dir: (t: number) => HungerInput['direction'], endMs: number, frame: number, lat: number) {
  let clock = 0;
  predictClock.now = () => clock;
  const queue: { at: number; run: () => void }[] = [];
  const later = (at: number, fn: () => void) => { queue.push({ at, run: fn }); queue.sort((a, b) => a.at - b.at); };
  let state = viewOf(run);
  let ack = -1, age = 0, q = 0, nextFrame = 0, nextFlush = 0, nextTick = 0;
  let pending: HungerInput[] = [];
  let frames: (PredictFrame<HungerInput> & { q: number })[] = [];
  let held: readonly HungerInput[] = [];
  const shown: { t: number; x: number; facing: number }[] = [];
  for (let t = 0; t <= endMs; t++) {
    clock = t;
    while (queue.length && queue[0].at <= t) queue.shift()!.run();
    if (t >= nextTick) {
      nextTick += TICK;
      // Keep the row clear of batteries (they wander) so the test is about timing only.
      const live = run.state as HungerState;
      live.batteries = live.batteries.filter((b) => b.z !== P(live, 'p1').z);
      run.advance(TICK);
      const view = viewOf(run), a = run.ackFor('p1'), g = run.ackAgeFor('p1') ?? 0;
      later(t + lat, () => {
        state = view;
        if (a !== undefined) {
          const acked = frames.filter((f) => f.q === a);
          if (acked.length) held = acked.flatMap((f) => f.inputs);
          ack = a; age = g; frames = frames.filter((f) => f.q > a);
        }
      });
    }
    if (t >= nextFrame) {
      nextFrame += frame;
      const inp: HungerInput = { direction: dir(t), hit: false };
      pending.push(inp);
      frames.push({ q: q + 1, dt: frame, inputs: [inp] });
      const out = ack >= 0 ? predictHunger(state, 'p1', frames, age, held) ?? state : state;
      shown.push({ t, x: P(out, 'p1').x, facing: P(out, 'p1').facing });
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

describe('Midnight Hunger own-toy prediction', () => {
  // Each test starts on a fresh clock (earlier than the last), which starts the shown-hop memory afresh.
  let base = 0;
  beforeEach(() => {
    const at = (base -= 1e6);
    predictClock.now = () => at;
  });

  it('predicts nothing for a toy that is out, and leaves the state alone', () => {
    const s = viewOf(clearRun(3));
    const f: PredictFrame<HungerInput>[] = [{ dt: 50, inputs: [{ direction: 3, hit: false }] }, { dt: 50, inputs: [] }];
    expect(predictHunger({ ...s, players: s.players.map((p) => (p.id === 'p1' ? { ...p, alive: false } : p)) }, 'p1', f)).toBeNull();
    const before = JSON.stringify(s);
    const out = predictHunger(s, 'p1', f)!;
    expect(P(out, 'p1').x).toBe(P(s, 'p1').x - 1);
    expect(P(out, 'p1').facing).toBe(3);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('does not walk into another toy (a push is the server\'s call) or off the board', () => {
    const s = viewOf(clearRun(3));
    const me = P(s, 'p1'), other = P(s, 'p2');
    other.x = me.x - 1; other.z = me.z;
    const out = predictHunger(s, 'p1', [{ dt: 50, inputs: [{ direction: 3, hit: false }] }]);
    expect(out && P(out, 'p1').x).toBe(me.x);
    me.x = 0;
    const edge = predictHunger(s, 'p1', [{ dt: 50, inputs: [{ direction: 3, hit: false }] }]);
    expect(edge && P(edge, 'p1').x).toBe(0);
  });

  const cases = [1000 / 60, 50, 120].flatMap((f) => [20, 80, 150].map((l) => [`${Math.round(f)} ms frames, ${l} ms each way`, f, l] as [string, number, number]));
  it.each(cases)('(%s) the toy hops on the next frame and ends on the server\'s cell without hopping back', (_l, FRAME, LAT) => {
    const run = clearRun(3);
    const x0 = P(run.state as HungerState, 'p1').x;
    const PRESS = 300, RELEASE = PRESS + 560; // about three hops left
    const { shown, state } = playLinked(run, (t) => (t >= PRESS && t < RELEASE ? 3 : null), RELEASE + 800, FRAME, LAT);
    const firstHop = shown.find((s) => s.x < x0)!;
    expect(firstHop.t - PRESS).toBeLessThanOrEqual(FRAME + 1);
    const final = P(state(), 'p1').x;
    expect(final).toBeLessThan(x0 - 1);
    // only ever moves left (a hop the server took back would step right again)
    for (let k = 1; k < shown.length; k++) expect(shown[k].x).toBeLessThanOrEqual(shown[k - 1].x);
    expect(shown[shown.length - 1].x).toBe(final);
  });
});
