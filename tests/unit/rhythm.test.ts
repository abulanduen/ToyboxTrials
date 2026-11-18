import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  GOOD,
  MISS,
  PERFECT,
  accuracyOf,
  judge,
  multiplierFor,
  rhythmRules,
  type RhythmInput,
  type RhythmState,
} from '../../src/minigames/rhythm/rules';
import { TRACKS, TRACK_IDS, compileTrack, getSong, midiOf, parseBar, trackForSeed } from '../../src/minigames/rhythm/tracks';
import { createRhythmBot } from '../../src/minigames/rhythm/bot';
import { createSongClock, pressesToInputs, songTimeAt, syncSongClock } from '../../src/minigames/rhythm/timing';
import { makeBots } from '../../src/minigames/bots';
import { seededRng, subSeed } from '../../src/minigames/rng';
import { PAINT_JOBS } from '../../src/game/palette';
import type { BotDifficulty, Contestant } from '../../src/minigames/types';

const STEP = 1000 / 60;
const human = (id: string): Contestant => ({ id, name: id, paint: PAINT_JOBS[0], hat: 'none', keySkin: 'classic', isLocal: id === 'you' });
const me = (s: RhythmState, id = 'you') => s.players.find((p) => p.id === id)!;

/**
 * Run a match to the end. `plan(id)` gives, per player, the timing error (ms) to play note i with,
 * or null to leave it. Presses are delivered on the first step at or after their time, like the host.
 */
function play(s: RhythmState, plan: (id: string, note: number) => number | null) {
  const next = new Map(s.players.map((p) => [p.id, 0]));
  const events: { type: string; [k: string]: unknown }[] = [];
  while (!rhythmRules.isOver(s)) {
    const inputs: Record<string, RhythmInput[]> = {};
    const after = s.t + STEP;
    for (const p of s.players) {
      let i = next.get(p.id)!;
      const out: RhythmInput[] = [];
      while (i < s.chart.length) {
        const d = plan(p.id, i);
        if (d !== null) {
          if (s.chart[i].t + d > after) break;
          out.push({ lane: s.chart[i].lane, t: s.chart[i].t + d });
        }
        i++;
      }
      next.set(p.id, i);
      if (out.length) inputs[p.id] = out;
    }
    rhythmRules.step(s, inputs, STEP);
    events.push(...rhythmRules.drainEvents(s));
  }
  return events;
}

describe('Music Box Rhythm tracks and charts', () => {
  it('has at least three tracks: easy, medium, hard', () => {
    expect(TRACKS.length).toBeGreaterThanOrEqual(3);
    expect(TRACKS.map((t) => t.difficulty)).toEqual(expect.arrayContaining(['easy', 'medium', 'hard']));
    expect(new Set(TRACK_IDS).size).toBe(TRACKS.length);
  });

  it('parses the score notation', () => {
    expect(midiOf('a4')).toBe(69);
    expect(midiOf('f#5')).toBe(78);
    expect(parseBar('e5:1 -:.5 g5:1.5')).toEqual([
      { midi: 76, beats: 1 },
      { midi: null, beats: 0.5 },
      { midi: 79, beats: 1.5 },
    ]);
    expect(() => parseBar('h5:1')).toThrow();
    expect(() => compileTrack({ ...TRACKS[0], sections: [{ bars: ['e5:1 g5:1'], chords: ['C'], level: 1 }] })).toThrow(/beats/);
  });

  for (const def of TRACKS) {
    describe(def.title, () => {
      const song = getSong(def.id);
      it('chart is sorted, in lanes 0–3, inside the song, after the count-in', () => {
        expect(song.chart.length).toBeGreaterThan(60);
        for (let i = 0; i < song.chart.length; i++) {
          const n = song.chart[i];
          expect([0, 1, 2, 3]).toContain(n.lane);
          expect(n.t).toBeGreaterThanOrEqual(song.leadInMs);
          expect(n.t).toBeLessThan(song.endMs - 1000);
          if (i > 0) expect(n.t).toBeGreaterThanOrEqual(song.chart[i - 1].t);
        }
        expect(song.leadInMs).toBeGreaterThanOrEqual(2500); // time to pick up the tempo
      });

      it('is playable: no duplicates, ≥ 190 ms between notes in a lane, at most two notes at once', () => {
        const lastInLane = [-1e9, -1e9, -1e9, -1e9];
        const at = new Map<number, number>();
        for (const n of song.chart) {
          expect(n.t - lastInLane[n.lane]).toBeGreaterThanOrEqual(190);
          lastInLane[n.lane] = n.t;
          at.set(n.t, (at.get(n.t) ?? 0) + 1);
        }
        expect(Math.max(...at.values())).toBeLessThanOrEqual(2);
        // Distinct note times are never closer than a fast eighth note.
        const times = [...at.keys()].sort((a, b) => a - b);
        for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(190);
      });

      it('follows the music: every chart note sits on a melody note, and uses all four lanes', () => {
        const melody = new Set(song.audio.filter((e) => e.voice === 'tine').map((e) => e.t));
        for (const n of song.chart) expect(melody.has(n.t)).toBe(true);
        expect(new Set(song.chart.map((n) => n.lane)).size).toBe(4);
      });

      it('gets denser as it goes (rising complexity)', () => {
        const span = song.endMs - song.leadInMs;
        const firstThird = song.chart.filter((n) => n.t < song.leadInMs + span / 3).length;
        const lastThird = song.chart.filter((n) => n.t >= song.leadInMs + (2 * span) / 3).length;
        expect(lastThird).toBeGreaterThan(firstThird);
      });

      it('runs 45–100 s and has a full accompaniment', () => {
        expect(song.endMs).toBeGreaterThan(45_000);
        expect(song.endMs).toBeLessThan(100_000);
        for (const v of ['tine', 'bass', 'pluck', 'tick'] as const) expect(song.audio.some((e) => e.voice === v)).toBe(true);
        for (let i = 1; i < song.audio.length; i++) expect(song.audio[i].t).toBeGreaterThanOrEqual(song.audio[i - 1].t);
      });
    });
  }

  it('harder tracks are faster and denser', () => {
    const rate = (id: (typeof TRACK_IDS)[number]) => getSong(id).chart.length / (getSong(id).endMs / 1000);
    expect(rate('tin-waltz')).toBeLessThan(rate('clockwork-parade'));
    expect(rate('clockwork-parade')).toBeLessThan(rate('spring-loaded'));
  });

  it('the seed picks the track when none is chosen', () => {
    expect(new Set([0, 1, 2, 3, 4, 5].map(trackForSeed)).size).toBe(3);
    expect(rhythmRules.init([human('you')], 7).track).toBe(trackForSeed(7));
    expect(rhythmRules.init([human('you')], 7, { track: 'spring-loaded' }).track).toBe('spring-loaded');
  });
});

describe('Music Box Rhythm judging', () => {
  it('windows: Perfect ±45 ms, Good ±100 ms, otherwise nothing', () => {
    expect(judge(0)).toBe('perfect');
    expect(judge(45)).toBe('perfect');
    expect(judge(-45)).toBe('perfect');
    expect(judge(46)).toBe('good');
    expect(judge(-100)).toBe('good');
    expect(judge(100.5)).toBeNull();
    expect(judge(-101)).toBeNull();
    expect(DEFAULT_CONFIG).toMatchObject({ perfectMs: 45, goodMs: 100 });
  });

  it('judges the press time, not the step it arrives on', () => {
    const s = rhythmRules.init([human('you')], 1, { track: 'tin-waltz' });
    const n0 = s.chart[0];
    while (s.t < n0.t + 60) rhythmRules.step(s, {}, STEP); // the step clock is 60+ ms past the note…
    rhythmRules.step(s, { you: [{ lane: n0.lane, t: n0.t + 10 }] }, STEP); // …but the press happened 10 ms after it
    const ev = rhythmRules.drainEvents(s).find((e) => e.type === 'judge')!;
    expect(ev.judgement).toBe('perfect');
    expect(ev.delta).toBeCloseTo(10, 5);
    expect(me(s).judged[0]).toBe(PERFECT);
  });

  it('early and late presses inside the Good window are Good; outside it they are strays', () => {
    const s = rhythmRules.init([human('you')], 1, { track: 'tin-waltz' });
    const [a, b, c] = s.chart;
    const pressAt = (lane: number, t: number) => {
      while (s.t + STEP < t) rhythmRules.step(s, {}, STEP);
      rhythmRules.step(s, { you: [{ lane: lane as 0, t }] }, STEP);
      return rhythmRules.drainEvents(s).filter((e) => e.type !== 'over');
    };
    expect(pressAt(a.lane, a.t - 80)[0]).toMatchObject({ type: 'judge', judgement: 'good' });
    expect(pressAt(b.lane, b.t - 140)[0]).toMatchObject({ type: 'stray' }); // too early: nothing in reach
    expect(me(s).combo).toBe(0);
    expect(pressAt(b.lane, b.t + 90)[0]).toMatchObject({ type: 'judge', judgement: 'good', note: 1 });
    expect(pressAt((c.lane + 1) % 4, c.t)[0]).toMatchObject({ type: 'stray' }); // wrong lane
    expect(me(s)).toMatchObject({ good: 2, perfect: 0, stray: 2 });
  });

  it('a press cannot claim a time in the future or long in the past', () => {
    const s = rhythmRules.init([human('you')], 1, { track: 'tin-waltz' });
    const n0 = s.chart[0];
    while (s.t < n0.t - 400) rhythmRules.step(s, {}, STEP);
    rhythmRules.step(s, { you: [{ lane: n0.lane, t: n0.t }] }, STEP); // "I pressed 400 ms from now"
    expect(me(s)).toMatchObject({ perfect: 0, good: 0, stray: 1 });
    while (s.t < n0.t + 205) rhythmRules.step(s, {}, STEP);
    rhythmRules.step(s, { you: [{ lane: n0.lane, t: n0.t }] }, STEP); // "I pressed 220 ms ago": capped at 120 ms
    expect(me(s)).toMatchObject({ perfect: 0, good: 0, stray: 2 });
  });

  it('unpressed notes become Misses and never pressing scores 0', () => {
    const s = rhythmRules.init([human('you')], 1, { track: 'tin-waltz' });
    const events = play(s, () => null);
    const p = me(s);
    expect(p.miss).toBe(s.chart.length);
    expect(p.judged.every((j) => j === MISS)).toBe(true);
    expect(p).toMatchObject({ score: 0, perfect: 0, good: 0, maxCombo: 0 });
    expect(events.filter((e) => e.type === 'judge' && e.judgement === 'miss').length).toBe(s.chart.length);
    expect(accuracyOf(p)).toBe(0);
    expect(events[events.length - 1].type).toBe('over');
  });

  it('a miss is only called once a late press can no longer arrive', () => {
    const s = rhythmRules.init([human('you')], 1, { track: 'tin-waltz' });
    const n0 = s.chart[0];
    while (s.t < n0.t + 200) rhythmRules.step(s, {}, STEP);
    expect(me(s).miss).toBe(0);
    while (s.t < n0.t + 240) rhythmRules.step(s, {}, STEP);
    expect(me(s).miss).toBe(1);
  });

  it('combo, multiplier and score maths', () => {
    expect([0, 9, 10, 19, 20, 29, 30, 500].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    const s = rhythmRules.init([human('you')], 1, { track: 'tin-waltz' });
    // All Perfect except note 12, which is skipped.
    play(s, (_id, i) => (i === 12 ? null : 0));
    const p = me(s);
    const n = s.chart.length;
    expect(p).toMatchObject({ perfect: n - 1, good: 0, miss: 1, stray: 0, combo: n - 13, maxCombo: n - 13 });
    let expected = 0;
    for (let c = 1; c <= 12; c++) expected += 100 * multiplierFor(c);
    for (let c = 1; c <= n - 13; c++) expected += 100 * multiplierFor(c);
    expect(p.score).toBe(expected);
    expect(accuracyOf(p)).toBeCloseTo(((n - 1) / n) * 100, 6);
  });

  it('accuracy counts a Good as half a Perfect', () => {
    expect(accuracyOf({ perfect: 0, good: 0, miss: 0 })).toBe(100);
    expect(accuracyOf({ perfect: 3, good: 2, miss: 1 })).toBeCloseTo((4 / 6) * 100, 6);
    const s = rhythmRules.init([human('you')], 1, { track: 'tin-waltz' });
    play(s, (_id, i) => (i % 2 ? 70 : -10));
    const p = me(s);
    expect(p.miss).toBe(0);
    expect(p.good).toBe(Math.floor(s.chart.length / 2));
    expect(accuracyOf(p)).toBeCloseTo(((p.perfect + p.good / 2) / s.chart.length) * 100, 6);
    expect(p.judged.filter((j) => j === GOOD).length).toBe(p.good);
  });

  it('two notes at once (level 3 downbeats) can both be hit', () => {
    const s = rhythmRules.init([human('you')], 1, { track: 'spring-loaded' });
    expect(s.chart.some((n, i) => i > 0 && n.t === s.chart[i - 1].t)).toBe(true);
    play(s, () => 5);
    expect(me(s)).toMatchObject({ perfect: s.chart.length, miss: 0, stray: 0 });
  });
});

describe('Music Box Rhythm results', () => {
  it('ranks by score; equal score → accuracy; identical → shared place', () => {
    const ids = ['you', 'b', 'c', 'd', 'e'];
    const s = rhythmRules.init(ids.map(human), 3, { track: 'tin-waltz' });
    play(s, (id, i) => {
      if (id === 'you') return 0; // flawless
      if (id === 'b') return i === 40 ? null : 0; // one miss
      if (id === 'c') return i === 40 ? null : 0; // identical to b
      if (id === 'd') return 80; // all Good
      return null; // e never plays
    });
    const r = rhythmRules.result(s);
    expect(r.placements.map((p) => [p.contestantId, p.place])).toEqual([
      ['you', 1],
      ['b', 2],
      ['c', 2],
      ['d', 4],
      ['e', 5],
    ]);
    expect(r.placements[0].score).toBe(me(s).score);
    expect(r.stats).toMatchObject({ notes: s.chart.length, topAccuracy: 100, topCombo: s.chart.length });
    expect(r.durationMs).toBeGreaterThanOrEqual(s.endMs);
  });

  it('tie-break: same score, better accuracy wins', () => {
    const s = rhythmRules.init([human('a'), human('b')], 3, { track: 'tin-waltz' });
    rhythmRules.step(s, {}, STEP);
    // Force equal scores with different accuracy (the tie-break path is otherwise very rare).
    Object.assign(s.players[0], { score: 5000, perfect: 40, good: 20, maxCombo: 30 });
    Object.assign(s.players[1], { score: 5000, perfect: 45, good: 12, maxCombo: 12 });
    expect(rhythmRules.result(s).placements.map((p) => [p.contestantId, p.place])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });
});

describe('Music Box Rhythm bots', () => {
  function botMatch(seed: number, difficulty: BotDifficulty, track: (typeof TRACK_IDS)[number], n = 4) {
    const bots = makeBots(subSeed(seed, 'bots'), n, difficulty);
    const s = rhythmRules.init(bots, seed, { track });
    const policy = createRhythmBot();
    const rngs = new Map(bots.map((b) => [b.id, seededRng(subSeed(seed, b.id))]));
    let steps = 0;
    while (!rhythmRules.isOver(s) && steps++ < 20_000) {
      const inputs: Record<string, RhythmInput[]> = {};
      for (const b of bots) inputs[b.id] = policy.decide(s, b, STEP, rngs.get(b.id)!);
      rhythmRules.step(s, inputs, STEP);
      rhythmRules.drainEvents(s);
    }
    return s;
  }
  const mean = (s: RhythmState, f: (p: RhythmState['players'][number]) => number) => s.players.reduce((a, p) => a + f(p), 0) / s.players.length;

  it('a bots-only match finishes on every track, with every note judged', () => {
    for (const track of TRACK_IDS) {
      const s = botMatch(11, 'normal', track);
      expect(rhythmRules.isOver(s)).toBe(true);
      for (const p of s.players) {
        expect(p.perfect + p.good + p.miss).toBe(s.chart.length);
        expect(p.score).toBeGreaterThan(0);
      }
      expect(rhythmRules.result(s).placements.length).toBe(4);
    }
  });

  it('harder bots score more and are more accurate', () => {
    for (const track of TRACK_IDS) {
      const [easy, normal, hard] = (['easy', 'normal', 'hard'] as const).map((d) => botMatch(5, d, track, 6));
      expect(mean(easy, (p) => p.score)).toBeLessThan(mean(normal, (p) => p.score));
      expect(mean(normal, (p) => p.score)).toBeLessThan(mean(hard, (p) => p.score));
      expect(mean(easy, accuracyOf)).toBeLessThan(mean(hard, accuracyOf));
      expect(mean(hard, accuracyOf)).toBeGreaterThan(90);
      expect(mean(easy, accuracyOf)).toBeGreaterThan(45); // easy bots are beatable, not broken
    }
  });

  it('is deterministic: same seed → same match; different seed → different scores', () => {
    const a = botMatch(42, 'normal', 'clockwork-parade');
    const b = botMatch(42, 'normal', 'clockwork-parade');
    expect(b.players.map((p) => [p.score, p.perfect, p.good, p.miss, p.stray])).toEqual(a.players.map((p) => [p.score, p.perfect, p.good, p.miss, p.stray]));
    const c = botMatch(43, 'normal', 'clockwork-parade');
    expect(c.players.map((p) => p.score)).not.toEqual(a.players.map((p) => p.score));
  });
});

describe('Music Box Rhythm timing (press timestamps → song time)', () => {
  /** Simulate rendered frames: wall clock advances by `frameMs`, match clock in whole 60 Hz steps × scale. */
  function runClock(frames: number, frameMs: number, scale = 1, c = createSongClock(), startPerf = 5000) {
    let acc = 0;
    let t = 0;
    let perf = startPerf;
    let trueT = 0;
    syncSongClock(c, perf, t);
    for (let i = 0; i < frames; i++) {
      perf += frameMs;
      acc += frameMs * scale;
      trueT += frameMs * scale;
      while (acc >= STEP) {
        t += STEP;
        acc -= STEP;
      }
      syncSongClock(c, perf, t);
    }
    return { c, perf, t, trueT };
  }

  it('tracks the match clock to within a few ms at 60 Hz and 120 Hz', () => {
    for (const frameMs of [1000 / 60, 1000 / 120, 1000 / 90, 33.4]) {
      const { c, perf, trueT } = runClock(600, frameMs);
      expect(c.rate).toBe(1);
      expect(Math.abs(songTimeAt(c, perf) - trueT)).toBeLessThan(9);
    }
  });

  it('follows timeScale: slowed, and frozen', () => {
    const slow = runClock(400, 1000 / 60, 0.25);
    expect(slow.c.rate).toBeCloseTo(0.25, 1);
    expect(Math.abs(songTimeAt(slow.c, slow.perf) - slow.trueT)).toBeLessThan(12);
    const c = runClock(200, 1000 / 60).c;
    const before = c.est;
    for (let i = 1; i <= 120; i++) syncSongClock(c, c.perf + 1000 / 60, c.samples[c.samples.length - 1].t); // match clock stopped
    expect(c.rate).toBe(0);
    expect(Math.abs(c.est - before)).toBeLessThan(45);
  });

  it('restarts cleanly when a new match begins (match clock goes back to 0)', () => {
    const { c, perf } = runClock(300, 1000 / 60);
    syncSongClock(c, perf + 16, 0);
    expect(c.est).toBe(0);
    expect(c.rate).toBe(1);
  });

  it('press timestamps flow through to inputs: a press between frames gets its own song time', () => {
    const { c, perf } = runClock(300, 1000 / 60);
    const now = songTimeAt(c, perf);
    const inputs = pressesToInputs(['slot3', 'pause', 'slot1', 'slot4'], [perf - 12, perf - 9, perf - 3.5, perf], c, 0);
    expect(inputs.map((i) => i.lane)).toEqual([2, 0, 3]); // non-lane actions are dropped, order kept
    expect(inputs[0].t).toBeCloseTo(now - 12, 6);
    expect(inputs[1].t).toBeCloseTo(now - 3.5, 6);
    expect(inputs[2].t).toBeCloseTo(now, 6);
  });

  it('calibration offset shifts the judged time (and so the judgement)', () => {
    const { c, perf } = runClock(300, 1000 / 60);
    const now = songTimeAt(c, perf);
    const [raw] = pressesToInputs(['slot1'], [perf], c, 0);
    const [cal] = pressesToInputs(['slot1'], [perf], c, 60);
    expect(raw.t - cal.t).toBeCloseTo(60, 6);
    // A player whose taps land 60 ms late: uncalibrated it is a Good, calibrated a Perfect.
    const noteT = now - 60;
    expect(judge(raw.t - noteT)).toBe('good');
    expect(judge(cal.t - noteT)).toBe('perfect');
    // Negative offsets work too (taps arriving early).
    expect(pressesToInputs(['slot2'], [perf], c, -25)[0].t).toBeCloseTo(now + 25, 6);
  });

  it('under a slowed clock, wall-time gaps shrink to song time; a missing timestamp uses the frame time', () => {
    const { c, perf } = runClock(400, 1000 / 60, 0.25);
    const [a, b] = pressesToInputs(['slot1', 'slot2'], [perf - 40], c, 0);
    expect(b.t - a.t).toBeCloseTo(40 * c.rate, 6);
    expect(b.t).toBeCloseTo(songTimeAt(c, perf), 6);
  });

  it('end to end: timestamps → inputs → rules give Perfect / Good / stray as pressed', () => {
    const s = rhythmRules.init([human('you')], 1, { track: 'tin-waltz' });
    const c = createSongClock();
    let perf = 1000;
    const frame = (presses: { lane: number; song: number }[]) => {
      // Presses carry the wall time at which the song clock read `song`.
      const acts = presses.map((p) => (['slot1', 'slot2', 'slot3', 'slot4'] as const)[p.lane]);
      const times = presses.map((p) => c.perf + (p.song - c.est) / c.rate);
      const inputs = pressesToInputs(acts, times, c, 0);
      rhythmRules.step(s, inputs.length ? { you: inputs } : {}, STEP);
      perf += STEP;
      syncSongClock(c, perf, s.t);
    };
    syncSongClock(c, perf, s.t);
    const [n0, n1, n2] = s.chart;
    const plan = [
      { lane: n0.lane, song: n0.t + 20 },
      { lane: n1.lane, song: n1.t - 75 },
      { lane: n2.lane, song: n2.t - 160 },
    ];
    while (s.t < n2.t + 400) {
      const due = plan.filter((p) => p.song <= c.est);
      for (const d of due) plan.splice(plan.indexOf(d), 1);
      frame(due);
    }
    expect(me(s)).toMatchObject({ perfect: 1, good: 1, miss: 1, stray: 1 });
  });
});
