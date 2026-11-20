import { describe, expect, it } from 'vitest';
import { ALL_STYLES, DEFAULT_HUB_TRACK, GAME_MOODS, HUB_TRACKS, TRACK_OFF, barSeconds, barsDue, composeBar, createComposer, musicTargetFor, pitch, styleById, type NoteEvent } from '../../src/game/musicScore';
import { MINIGAMES } from '../../src/minigames/registry';

const bars = (styleId: string, seed: number, n: number) => {
  const c = createComposer(styleById(styleId)!, seed);
  return Array.from({ length: n }, () => composeBar(c).events);
};
const sig = (ev: NoteEvent[]) => ev.filter((e) => e.voice !== 'tick').map((e) => `${e.voice}:${e.midi}@${e.beat.toFixed(2)}`).join(',');

describe('background music styles', () => {
  it('are calm: slow tempos, quiet notes, no more than a couple of lead notes a beat', () => {
    expect(ALL_STYLES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ALL_STYLES.map((s) => s.id)).size).toBe(ALL_STYLES.length);
    for (const s of ALL_STYLES) {
      expect(s.bpm, s.id).toBeGreaterThanOrEqual(54);
      expect(s.bpm, s.id).toBeLessThanOrEqual(92);
      expect(s.level).toBeLessThanOrEqual(1);
      expect(s.density[1]).toBeLessThanOrEqual(1.2);
      for (const ev of bars(s.id, 7, 48)) {
        const lead = ev.filter((e) => e.voice === s.lead);
        expect(lead.length, s.id).toBeLessThanOrEqual(s.beatsPerBar * 2);
        for (const e of ev) {
          expect(e.vel, s.id).toBeGreaterThan(0);
          expect(e.vel, s.id).toBeLessThanOrEqual(0.8);
          expect(e.beat, s.id).toBeGreaterThanOrEqual(0);
          expect(e.beat, s.id).toBeLessThan(s.beatsPerBar);
          expect(e.dur, s.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every note is in the piece’s mode, inside a comfortable range', () => {
    for (const s of ALL_STYLES) {
      const pcs = new Set(s.scale.map((x) => (s.root + x) % 12));
      for (const ev of bars(s.id, 3, 64))
        for (const e of ev) {
          if (e.voice === 'tick') continue;
          expect(pcs.has(((e.midi % 12) + 12) % 12), `${s.id} ${e.voice} ${e.midi}`).toBe(true);
          expect(e.midi, s.id).toBeGreaterThanOrEqual(30);
          expect(e.midi, s.id).toBeLessThanOrEqual(96);
        }
    }
  });

  it('is deterministic for a seed and different for another', () => {
    const a = bars('windowsill-waltz', 42, 16).map(sig);
    expect(bars('windowsill-waltz', 42, 16).map(sig)).toEqual(a);
    expect(bars('windowsill-waltz', 43, 16).map(sig)).not.toEqual(a);
  });

  it('never loops: over five minutes no eight-bar passage repeats, and most bars are new', () => {
    for (const t of HUB_TRACKS) {
      const s = t.style;
      const n = Math.ceil(300 / barSeconds(s));
      const seq = bars(s.id, 11, n).map(sig);
      expect(new Set(seq).size / n, s.id).toBeGreaterThan(0.6);
      const windows = new Set<string>();
      for (let i = 0; i + 8 <= n; i++) {
        const w = seq.slice(i, i + 8).join('|');
        expect(windows.has(w), `${s.id} bars ${i}..${i + 7}`).toBe(false);
        windows.add(w);
      }
    }
  });

  it('keeps finding home: phrases cadence, and the tonic chord comes back every sixteen bars', () => {
    const s = styleById('felt-and-sawdust')!;
    const c = createComposer(s, 5);
    for (let i = 0; i < 64; i++) {
      const { chord } = composeBar(c);
      if (i % 16 === 0) expect(chord).toBe(0);
    }
    expect(pitch(s, 0)).toBe(s.root);
    expect(pitch(s, 7)).toBe(s.root + 12);
    expect(pitch(s, -7)).toBe(s.root - 12);
  });

  it('breathes: the number of melody notes per bar varies', () => {
    const s = styleById('rainy-playroom')!;
    const counts = bars(s.id, 9, 64).map((ev) => ev.filter((e) => e.voice === s.lead).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeGreaterThanOrEqual(2);
  });
});

describe('what plays where', () => {
  const at = (p: Partial<Parameters<typeof musicTargetFor>[0]>) => musicTargetFor({ screen: 'playing', gameId: null, phase: 'idle', hubTrack: DEFAULT_HUB_TRACK, ...p });

  it('the Hub plays the jukebox choice (softer on the menu); "off" is silence; unknown falls back', () => {
    for (const t of HUB_TRACKS) expect(at({ hubTrack: t.style.id })).toEqual({ style: t.style.id, level: 1 });
    expect(at({ screen: 'workshop', hubTrack: 'tin-lullaby' }).style).toBe('tin-lullaby');
    expect(at({ screen: 'menu' }).level).toBeLessThan(1);
    expect(at({ hubTrack: TRACK_OFF }).style).toBeNull();
    expect(at({ hubTrack: 'nonsense' }).style).toBe(DEFAULT_HUB_TRACK);
    expect(HUB_TRACKS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(HUB_TRACKS.map((t) => t.name)).size).toBe(HUB_TRACKS.length);
  });

  it('every trial has a mood, except Music Box Rhythm, which keeps its own music', () => {
    for (const g of MINIGAMES.filter((m) => m.status === 'playable')) {
      expect(g.id in GAME_MOODS, g.id).toBe(true);
      const intro = at({ screen: 'minigame', gameId: g.id, phase: 'intro' });
      const play = at({ screen: 'minigame', gameId: g.id, phase: 'playing' });
      if (g.id === 'music-box-rhythm') {
        expect(intro.style).toBeNull();
        expect(play.style).toBeNull();
        continue;
      }
      expect(styleById(intro.style!), g.id).toBeDefined();
      expect(intro.level).toBe(1);
      // while playing the music sits back (or rests completely)
      expect(play.level, g.id).toBeLessThan(1);
    }
    // the trial's music never depends on the jukebox
    expect(at({ screen: 'minigame', gameId: 'blink-duel', phase: 'intro', hubTrack: TRACK_OFF }).style).toBe(at({ screen: 'minigame', gameId: 'blink-duel', phase: 'intro' }).style);
  });

  it('Copycat Conductor is a listening game: no music while you play it', () => {
    expect(at({ screen: 'minigame', gameId: 'copycat-conductor', phase: 'playing' }).style).toBeNull();
    expect(at({ screen: 'minigame', gameId: 'copycat-conductor', phase: 'results' }).style).not.toBeNull();
  });

  it('tournament picker and standings get the calm interlude', () => {
    expect(at({ screen: 'minigame', gameId: null, phase: 'picker' }).style).toBe('mood-interlude');
    expect(at({ screen: 'minigame', gameId: 'toy-squad', phase: 'standings' }).style).toBe('mood-interlude');
  });
});

describe('lookahead scheduling', () => {
  it('composes the bars that start inside the lookahead window, in order', () => {
    expect(barsDue(10, 9.5, 1.6, 2.5)).toEqual([10]);
    expect(barsDue(10, 9.0, 1.6, 0.5)).toEqual([10, 10.5]);
    expect(barsDue(12, 9.5, 1.6, 2.5)).toEqual([]);
  });
  it('after a stall it skips ahead to the next bar line instead of cramming missed bars', () => {
    const due = barsDue(10, 17.2, 1.6, 2.5); // bars at 10, 12.5, 15 were missed
    expect(due.length).toBe(1);
    expect(due[0]).toBeGreaterThan(17.2);
    expect(due[0]).toBeCloseTo(17.5 + 0.05, 6);
  });
  it('never schedules more than eight bars at once', () => {
    expect(barsDue(0, 0, 100, 0.1).length).toBe(8);
  });
});
