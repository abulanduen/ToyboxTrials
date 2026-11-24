/**
 * Online own-toy prediction for Inferno Escape: through a simulated each-way link your toy turns,
 * moves and breaks rock on the next frame after you press, never takes a step the server then takes
 * back, and ends on the server's tile.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GameRun } from '../../server/matchRunner';
import { predictInferno } from '../../src/minigames/inferno/predict';
import { index, type InfernoInput, type InfernoState } from '../../src/minigames/inferno/rules';
import { PAINT_JOBS } from '../../src/game/palette';
import type { Contestant, PredictFrame } from '../../src/minigames/types';
import { predictClock } from '../../src/minigames/shared/predictGrid';

const human = (id: string): Contestant => ({ id, name: id.toUpperCase(), paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: false });
const TICK = 1000 / 30;
const P = (s: InfernoState, id: string) => s.players.find((p) => p.id === id)!;
const viewOf = (run: GameRun) => JSON.parse(JSON.stringify(run.viewFor(run.publicView(), 'p1'))) as InfernoState;

/** p1 starts at (4,4); open the row to its left so it has room to walk. */
function openRun() {
  const run = new GameRun('inferno-escape', ['p1', 'p2'].map(human), 5);
  const s = run.state as InfernoState;
  for (let x = 1; x < 4; x++) s.tiles[index(x, 4)] = 'floor';
  return run;
}

function playLinked(run: GameRun, input: (t: number) => InfernoInput[], endMs: number, frame: number, lat: number) {
  let clock = 0;
  predictClock.now = () => clock;
  const queue: { at: number; run: () => void }[] = [];
  const later = (at: number, fn: () => void) => { queue.push({ at, run: fn }); queue.sort((a, b) => a.at - b.at); };
  let state = viewOf(run);
  let ack = -1, age = 0, q = 0, nextFrame = 0, nextFlush = 0, nextTick = 0;
  let pending: InfernoInput[] = [];
  let frames: (PredictFrame<InfernoInput> & { q: number })[] = [];
  let held: readonly InfernoInput[] = [];
  const shown: { t: number; x: number; z: number; out: InfernoState }[] = [];
  for (let t = 0; t <= endMs; t++) {
    clock = t;
    while (queue.length && queue[0].at <= t) queue.shift()!.run();
    if (t >= nextTick) {
      nextTick += TICK;
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
      const inp = input(t);
      pending.push(...inp);
      frames.push({ q: q + 1, dt: frame, inputs: inp });
      const out = ack >= 0 ? predictInferno(state, 'p1', frames, age, held) ?? state : state;
      shown.push({ t, x: P(out, 'p1').x, z: P(out, 'p1').z, out });
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

const cases = [1000 / 60, 50, 120].flatMap((f) => [20, 80, 150].map((l) => [`${Math.round(f)} ms frames, ${l} ms each way`, f, l] as [string, number, number]));

describe('Inferno Escape own-toy prediction', () => {
  // Each test starts on a fresh clock (earlier than the last), which starts the shown-hop memory afresh.
  let base = 0;
  beforeEach(() => {
    const at = (base -= 1e6);
    predictClock.now = () => at;
  });

  it('predicts nothing for a toy that is out, and leaves the state alone', () => {
    const s = viewOf(openRun());
    const f: PredictFrame<InfernoInput>[] = [{ dt: 50, inputs: [{ direction: 3 }] }];
    expect(predictInferno({ ...s, players: s.players.map((p) => (p.id === 'p1' ? { ...p, alive: false } : p)) }, 'p1', f)).toBeNull();
    const before = JSON.stringify(s);
    const out = predictInferno(s, 'p1', f)!;
    expect(P(out, 'p1').x).toBe(3);
    expect(P(out, 'p1').facing).toBe(3);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('turns but does not move into rock, and breaking clears it at once', () => {
    const s = viewOf(new GameRun('inferno-escape', ['p1', 'p2'].map(human), 5));
    const turned = predictInferno(s, 'p1', [{ dt: 50, inputs: [{ direction: 3 }] }])!;
    expect([P(turned, 'p1').x, P(turned, 'p1').facing]).toEqual([4, 3]);
    const broke = predictInferno(s, 'p1', [{ dt: 50, inputs: [{ direction: 3 }, { action: 'break' }] }])!;
    expect(broke.tiles[index(3, 4)]).toBe('floor');
    expect(s.tiles[index(3, 4)]).toBe('rock');
  });

  it.each(cases)('(%s) the toy moves on the next frame and ends on the server\'s tile without stepping back', (_l, FRAME, LAT) => {
    const run = openRun();
    const PRESS = 300, RELEASE = PRESS + 560;
    const { shown, state } = playLinked(run, (t) => (t >= PRESS && t < RELEASE ? [{ direction: 3 }] : []), RELEASE + 800, FRAME, LAT);
    const firstMove = shown.find((s) => s.x < 4)!;
    expect(firstMove.t - PRESS).toBeLessThanOrEqual(FRAME + 1);
    const final = P(state(), 'p1').x;
    expect(final).toBeLessThan(3);
    for (let k = 1; k < shown.length; k++) expect(shown[k].x).toBeLessThanOrEqual(shown[k - 1].x);
    expect(shown[shown.length - 1].x).toBe(final);
  });

  it.each(cases)('(%s) a held break clears the rock ahead on the next frame and it stays cleared', (_l, FRAME, LAT) => {
    const run = new GameRun('inferno-escape', ['p1', 'p2'].map(human), 5);
    const PRESS = 300;
    const { shown, state } = playLinked(run, (t) => (t >= PRESS && t < PRESS + 200 ? [{ direction: 3 }, { action: 'break' }] : []), PRESS + 900, FRAME, LAT);
    const rock = index(3, 4);
    const cleared = shown.findIndex((s) => s.out.tiles[rock] === 'floor');
    expect(shown[cleared].t - PRESS).toBeLessThanOrEqual(FRAME + 1);
    for (const s of shown.slice(cleared)) expect(s.out.tiles[rock]).toBe('floor');
    expect(state().tiles[rock]).toBe('floor');
  });
});
