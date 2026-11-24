/**
 * Online own-toy prediction (Toybox Siege): the server numbers back the inputs it has stepped, and
 * the client replays the rest so the toy answers the stick at once. The last test plays a whole
 * round trip through a simulated 80 ms each-way link.
 */
import { describe, expect, it } from 'vitest';
import { GameRun } from '../../server/matchRunner';
import { MatchFlow, type FlowMember } from '../../server/lobbyMatch';
import { DEFAULT_LOBBY_SETTINGS, parseClientMessage, parseServerMessage, type LobbySettings } from '../../src/net/protocol';
import { DEFAULT_LOOK } from '../../server/sanitize';
import { makeBots } from '../../src/minigames/bots';
import { predictClock, predictSiege } from '../../src/minigames/siege/predict';
import type { SiegeInput, SiegeState } from '../../src/minigames/siege/rules';
import type { Contestant, PredictFrame } from '../../src/minigames/types';

const human = (id: string): Contestant => ({ ...makeBots(1, 1, 'normal')[0], id, name: id, bot: undefined });
const field = (bots: number, humans: string[]): Contestant[] => [...humans.map(human), ...makeBots(99, bots, 'normal')];
const TICK = 1000 / 30;

/** A Siege run with p1 (a Ranger) on the field, advanced into the run. */
function siegeInRun(seed = 11) {
  const run = new GameRun('toybox-siege', field(3, ['p1']), seed);
  run.input('p1', [{ type: 'class', cls: 'ranger' }]);
  for (let i = 0; i < 30 * 60 && (run.state as SiegeState).phase !== 'run'; i++) run.advance(TICK);
  expect((run.state as SiegeState).phase).toBe('run');
  return run;
}
const viewOf = (run: GameRun) => JSON.parse(JSON.stringify(run.viewFor(run.publicView(), 'p1'))) as SiegeState;
const meIn = (s: SiegeState) => s.players.find((p) => p.id === 'p1')!;

describe('input acknowledgements', () => {
  it('the input message number arrives through the protocol parser', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'in', m: 3, i: [], q: 7 }))).toEqual({ t: 'in', m: 3, i: [], q: 7 });
    expect(parseClientMessage(JSON.stringify({ t: 'in', m: 3, i: [] }))).toEqual({ t: 'in', m: 3, i: [] });
    expect(parseClientMessage(JSON.stringify({ t: 'in', m: 3, i: [], q: -1 }))).toEqual({ t: 'in', m: 3, i: [] });
    // and the acknowledgement survives the client's parser
    expect(parseServerMessage(JSON.stringify({ t: 'ms', m: 3, k: 0, d: { o: {} }, e: [], n: 5, a: 7 }))).toMatchObject({ a: 7 });
    expect(parseServerMessage(JSON.stringify({ t: 'ms', m: 3, k: 0, d: { o: {} }, e: [], n: 5 }))).not.toHaveProperty('a');
  });

  it('a match acknowledges a numbered input only once the rules have stepped it', () => {
    const run = siegeInRun();
    expect(run.ackFor('p1')).toBeUndefined();
    run.input('p1', [{ type: 'move', x: 1, y: 0 }], 4);
    expect(run.ackFor('p1')).toBeUndefined(); // received, not stepped
    run.advance(TICK);
    expect(run.ackFor('p1')).toBe(4);
    expect(run.ackAgeFor('p1')).toBe(Math.round(TICK)); // the state holds one tick of it
    run.input('p1', [], 5); // an empty message is acknowledged too
    run.advance(TICK);
    expect(run.ackFor('p1')).toBe(5);
  });

  it('the lobby sends the acknowledgement to that player only, even when nothing else changed', () => {
    const settings: LobbySettings = { ...DEFAULT_LOBBY_SETTINGS, mode: 'single', game: 'toybox-siege', cap: 3, botFill: true };
    const member = (id: string): FlowMember => ({ id, name: id, look: { ...DEFAULT_LOOK }, account: null, connected: true, ready: false, watch: null });
    const members = [member('p1'), member('p2')];
    const flow = new MatchFlow(settings, members, 8, 0, 1, 20);
    let now = 1000;
    for (let i = 0; i < 30 * 120 && flow.phase !== 'playing'; i++) flow.tick((now += TICK), members);
    expect(flow.phase).toBe('playing');
    flow.input('p1', flow.seq, [{ type: 'class', cls: 'mage' }], 1);
    const out = flow.tick((now += TICK), members);
    const toP1 = out.snapshots.filter((s) => s.to === 'p1').map((s) => s.msg);
    const toP2 = out.snapshots.filter((s) => s.to === 'p2').map((s) => s.msg);
    expect(toP1.some((m) => m.a === 1)).toBe(true);
    expect(toP2.every((m) => m.a === undefined)).toBe(true); // p2's client numbers nothing yet
  });
});

describe('predictSiege', () => {
  it('replays unstepped stick input from the server position without touching the server state', () => {
    const s = viewOf(siegeInRun());
    const before = JSON.stringify(s);
    const me = meIn(s);
    const frames: PredictFrame<SiegeInput>[] = [{ dt: 100, inputs: [{ type: 'move', x: 1, y: 0 }] }, { dt: 100, inputs: [] }];
    const out = predictSiege(s, 'p1', frames)!;
    expect(JSON.stringify(s)).toBe(before);
    const p = meIn(out);
    // the first frame's time passed before the stick moved; the second walks, and the drawn toy
    // runs on by the newest frame's time (capped at 50 ms), as offline play would show it
    expect(p.x).toBeCloseTo(me.x + me.stat.speed * (0.1 + 0.05), 5);
    expect(p.z).toBeCloseTo(me.z, 5);
    // everyone else is the server's own object
    for (const q of out.players) if (q.id !== 'p1') expect(s.players).toContain(q);
  });

  it('predicts nothing while a card choice holds the board, or for a toy that is not there', () => {
    const s = viewOf(siegeInRun());
    const choosing = { ...s, players: s.players.map((p) => (p.id === 'p1' ? { ...p, choice: { at: 0 } as never } : p)) };
    expect(predictSiege(choosing, 'p1', [{ dt: 50, inputs: [{ type: 'move', x: 1, y: 0 }] }])).toBeNull();
    expect(predictSiege(s, 'nobody', [])).toBeNull();
  });

  it.each([
    ['60 fps', 1000 / 60],
    ['slow 220 ms frames', 220],
    ['very slow 650 ms frames', 650],
  ])('through an 80 ms link (%s) the toy moves on the first frame, glides, and ends where the server puts it', (_label, FRAME) => {
    const run = siegeInRun(21);
    const LAT = 80;
    const slow = FRAME > 50;
    let clock = 0;
    predictClock.now = () => clock;
    type Ev = { at: number; run: () => void };
    const queue: Ev[] = [];
    const later = (at: number, fn: () => void) => { queue.push({ at, run: fn }); queue.sort((a, b) => a.at - b.at); };

    let state = viewOf(run);
    let ack = -1, age = 0;
    let q = 0;
    let pending: SiegeInput[] = [];
    let frames: (PredictFrame<SiegeInput> & { q: number })[] = [];
    const x0 = meIn(state).x;
    const speed = meIn(state).stat.speed;
    const PRESS = 500, RELEASE = 1500;
    let axis = 0;
    const shown: { t: number; x: number }[] = [];
    let nextFrame = 0, nextFlush = 0, nextTick = 0;

    for (let t = 0; t <= 3000 + 6 * FRAME; t++) {
      clock = t;
      while (queue.length && queue[0].at <= t) queue.shift()!.run();
      if (t >= nextTick) {
        nextTick += TICK;
        run.advance(TICK);
        const view = viewOf(run), a = run.ackFor('p1'), g = run.ackAgeFor('p1') ?? 0;
        later(t + LAT, () => {
          state = view;
          if (a !== undefined) { ack = a; age = g; frames = frames.filter((f) => f.q > a); }
        });
      }
      if (t >= nextFrame) {
        nextFrame += FRAME;
        const want = t >= PRESS && t < RELEASE ? 1 : 0;
        const inputs: SiegeInput[] = want !== axis ? [{ type: 'move', x: want, y: 0 }] : [];
        axis = want;
        pending.push(...inputs);
        frames.push({ q: q + 1, dt: FRAME, inputs });
        const out = ack >= 0 ? predictSiege(state, 'p1', frames, age) : null;
        shown.push({ t, x: meIn(out ?? state).x });
        // as remote.ts: a frame flushes its inputs if a flush interval has passed (never between frames)
        if (t < nextFlush) continue;
        nextFlush = t + TICK;
        q++;
        const items = pending, n = q;
        pending = [];
        later(t + LAT, () => run.input('p1', items, n));
      }
    }
    predictClock.now = () => performance.now();

    const at = (t: number) => shown.find((s) => s.t >= t)!;
    // it moves on the next frame after the press is read (without prediction: two trips, 160 ms+, later)
    const firstMove = shown.find((s) => s.x > x0 + 1e-6)!;
    expect(firstMove.t - PRESS).toBeLessThanOrEqual(2 * FRAME + 1);
    // while held it tracks where the stick says (within a fraction of a cm)
    const track = slow ? speed * FRAME / 1000 + 0.6 : 0.6;
    for (let t = PRESS + 300; t < RELEASE; t += 50) expect(Math.abs(at(t).x - (x0 + speed * (t - PRESS) / 1000))).toBeLessThan(track);
    // no twitch: no frame moves more than the toy can walk in it, plus at most one server tick's
    // worth of correction (the server starts and stops an input on its 30 Hz tick)
    for (let i = 1; i < shown.length; i++) expect(Math.abs(shown[i].x - shown[i - 1].x)).toBeLessThan(speed * (FRAME + TICK) / 1000 + 0.1);
    // it stops on release and settles exactly where the server has the toy: any catching up is at
    // most a server tick and a frame's walk (the server takes an input on its 30 Hz tick, and the
    // client sends on a frame, so a press and a release can start and end its walk that far apart)
    const tickWalk = speed * (TICK + Math.min(FRAME, TICK)) / 1000 + 0.05;
    expect(Math.abs(at(RELEASE + 2 * FRAME).x - at(RELEASE + 400 + 2 * FRAME).x)).toBeLessThan(tickWalk);
    expect(shown[shown.length - 1].x).toBeCloseTo(meIn(state).x, 3);
    // and never runs past where it stops (no snapping back on release)
    const final = meIn(state).x;
    for (const s of shown) expect(s.x).toBeLessThan(final + tickWalk);
  });
});
