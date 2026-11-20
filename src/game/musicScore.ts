/**
 * Calm background music, composed in code (pure logic, no Web Audio: src/game/music.ts plays it).
 *
 * Every style is an original generative piece: a slow chord walk through its mode, a melody that
 * wanders by small steps and answers itself in four-bar phrases, a soft bass and an optional pad.
 * A seeded composer writes one bar at a time, so the music never loops back to a fixed recording
 * and never repeats a passage exactly, while staying recognisably the same piece (motifs come back
 * with new notes, and the density breathes over long arcs). Everything is deliberately gentle: low
 * tempos, quiet velocities, few notes, no drums.
 *
 * Music Box Rhythm keeps its own music, so it has no background style (`musicTargetFor`).
 */
import type { MinigameId } from '../minigames/ids';

export type MusicVoice = 'tine' | 'marimba' | 'celesta' | 'flute' | 'pluck' | 'pad' | 'bass' | 'tick';

export interface MusicStyle {
  id: string;
  /** Beats per minute (kept ≤ 92: calm). */
  bpm: number;
  beatsPerBar: 3 | 4;
  /** MIDI note of the tonic (lead register; bass and pad sit below it). */
  root: number;
  /** The mode: semitone offsets of its seven degrees from the tonic. */
  scale: readonly number[];
  /** Chord walk: from a degree (0 = I … 6 = vii) to weighted next degrees. */
  chords: Readonly<Record<number, readonly (readonly [number, number])[]>>;
  lead: MusicVoice;
  /** An occasional answering voice in quiet bars (or none). */
  answer: MusicVoice | null;
  /** Lead notes per beat, quietest and busiest moments. */
  density: readonly [number, number];
  pad: boolean;
  bass: 'root' | 'root-fifth' | 'none';
  /** A very soft tick on the beat (a clock in the room), or none. */
  tick: boolean;
  /** Late off-beats (0 = straight, 0.15 = lilting). */
  swing: number;
  /** Mix level of this style (0..1), so brighter pieces don't stand out. */
  level: number;
  /** Low-pass cutoff of the style's bus in Hz: lower is warmer and darker. */
  tone: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10] as const;
const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const;
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10] as const;

/** Gentle major-key chord walks: mostly I, IV, V and vi, with soft side steps. */
const MAJOR_WALK: MusicStyle['chords'] = {
  0: [[3, 3], [4, 2], [5, 2], [1, 1]],
  1: [[4, 3], [3, 1], [0, 1]],
  2: [[5, 2], [3, 2]],
  3: [[0, 3], [4, 2], [1, 1], [5, 1]],
  4: [[0, 4], [5, 2], [3, 1]],
  5: [[3, 3], [1, 2], [4, 1], [0, 1]],
  6: [[0, 1]],
};
/** Modal walks for the minor-ish and dreamy pieces: hover around i, with IV/VII colours. */
const MODAL_WALK: MusicStyle['chords'] = {
  0: [[3, 3], [6, 2], [2, 1], [5, 1]],
  1: [[0, 2], [4, 1]],
  2: [[3, 2], [0, 1]],
  3: [[0, 3], [6, 1], [4, 1]],
  4: [[0, 2], [3, 1]],
  5: [[3, 2], [6, 1], [0, 1]],
  6: [[0, 3], [3, 1]],
};

const style = (s: MusicStyle) => s;

/**
 * The Hub's tracks, chosen at the jukebox. Each is its own style; all are original and generated
 * here. `blurb` is shown on the jukebox list.
 */
export const HUB_TRACKS = [
  {
    name: 'Windowsill Waltz',
    blurb: 'A slow waltz on music-box tines, warm as afternoon sun.',
    style: style({ id: 'windowsill-waltz', bpm: 72, beatsPerBar: 3, root: 72, scale: MAJOR, chords: MAJOR_WALK, lead: 'tine', answer: 'marimba', density: [0.45, 1.05], pad: true, bass: 'root', tick: false, swing: 0, level: 0.85, tone: 3600 }),
  },
  {
    name: 'Felt and Sawdust',
    blurb: 'Wooden marimba and a felted bass, ambling along.',
    style: style({ id: 'felt-and-sawdust', bpm: 80, beatsPerBar: 4, root: 67, scale: MAJOR, chords: MAJOR_WALK, lead: 'marimba', answer: 'tine', density: [0.4, 1.0], pad: false, bass: 'root-fifth', tick: false, swing: 0.12, level: 0.85, tone: 3000 }),
  },
  {
    name: 'Tin Lullaby',
    blurb: 'Very slow and sleepy: celesta over a soft hum.',
    style: style({ id: 'tin-lullaby', bpm: 58, beatsPerBar: 3, root: 74, scale: DORIAN, chords: MODAL_WALK, lead: 'celesta', answer: null, density: [0.3, 0.75], pad: true, bass: 'root', tick: false, swing: 0, level: 0.8, tone: 2600 }),
  },
  {
    name: 'Clockwork Afternoon',
    blurb: 'A gentle tick-tock with a dreamy, floating tune.',
    style: style({ id: 'clockwork-afternoon', bpm: 76, beatsPerBar: 4, root: 70, scale: LYDIAN, chords: MAJOR_WALK, lead: 'tine', answer: 'flute', density: [0.35, 0.9], pad: true, bass: 'root', tick: true, swing: 0.06, level: 0.8, tone: 3200 }),
  },
  {
    name: 'Rainy Playroom',
    blurb: 'Soft, thoughtful and a little grey, like rain on the window.',
    style: style({ id: 'rainy-playroom', bpm: 64, beatsPerBar: 4, root: 69, scale: AEOLIAN, chords: MODAL_WALK, lead: 'flute', answer: 'celesta', density: [0.3, 0.8], pad: true, bass: 'root', tick: false, swing: 0, level: 0.8, tone: 2400 }),
  },
] as const;
export type HubTrackId = (typeof HUB_TRACKS)[number]['style']['id'];
/** The jukebox's "no music" choice. */
export const TRACK_OFF = 'off';
export const DEFAULT_HUB_TRACK: HubTrackId = 'windowsill-waltz';

/** Moods for the trials: calm or a little brighter as fits each game, never intense. */
const MOODS = {
  bright: style({ id: 'mood-bright', bpm: 76, beatsPerBar: 4, root: 72, scale: MAJOR, chords: MAJOR_WALK, lead: 'tine', answer: 'pluck', density: [0.35, 0.8], pad: true, bass: 'root', tick: false, swing: 0, level: 0.7, tone: 3200 }),
  playful: style({ id: 'mood-playful', bpm: 84, beatsPerBar: 4, root: 67, scale: MIXOLYDIAN, chords: MAJOR_WALK, lead: 'marimba', answer: 'pluck', density: [0.4, 0.95], pad: false, bass: 'root-fifth', tick: false, swing: 0.14, level: 0.75, tone: 3000 }),
  curious: style({ id: 'mood-curious', bpm: 70, beatsPerBar: 4, root: 69, scale: DORIAN, chords: MODAL_WALK, lead: 'celesta', answer: 'marimba', density: [0.3, 0.75], pad: true, bass: 'root', tick: true, swing: 0, level: 0.7, tone: 2800 }),
  breezy: style({ id: 'mood-breezy', bpm: 88, beatsPerBar: 4, root: 74, scale: MAJOR, chords: MAJOR_WALK, lead: 'marimba', answer: 'tine', density: [0.45, 1.0], pad: false, bass: 'root-fifth', tick: false, swing: 0.1, level: 0.7, tone: 3400 }),
  warm: style({ id: 'mood-warm', bpm: 66, beatsPerBar: 4, root: 64, scale: DORIAN, chords: MODAL_WALK, lead: 'flute', answer: 'marimba', density: [0.3, 0.7], pad: true, bass: 'root', tick: false, swing: 0, level: 0.7, tone: 2200 }),
  night: style({ id: 'mood-night', bpm: 60, beatsPerBar: 3, root: 69, scale: AEOLIAN, chords: MODAL_WALK, lead: 'celesta', answer: null, density: [0.25, 0.6], pad: true, bass: 'root', tick: false, swing: 0, level: 0.7, tone: 2000 }),
  thoughtful: style({ id: 'mood-thoughtful', bpm: 68, beatsPerBar: 4, root: 65, scale: MAJOR, chords: MAJOR_WALK, lead: 'tine', answer: 'flute', density: [0.3, 0.7], pad: true, bass: 'root', tick: true, swing: 0, level: 0.75, tone: 2800 }),
  focus: style({ id: 'mood-focus', bpm: 72, beatsPerBar: 4, root: 62, scale: DORIAN, chords: MODAL_WALK, lead: 'marimba', answer: null, density: [0.25, 0.6], pad: true, bass: 'root', tick: false, swing: 0, level: 0.65, tone: 2400 }),
  twinkle: style({ id: 'mood-twinkle', bpm: 74, beatsPerBar: 3, root: 76, scale: LYDIAN, chords: MAJOR_WALK, lead: 'celesta', answer: 'tine', density: [0.35, 0.85], pad: true, bass: 'root', tick: false, swing: 0, level: 0.65, tone: 3600 }),
  storybook: style({ id: 'mood-storybook', bpm: 66, beatsPerBar: 3, root: 72, scale: MAJOR, chords: MAJOR_WALK, lead: 'flute', answer: 'celesta', density: [0.3, 0.75], pad: true, bass: 'root', tick: false, swing: 0, level: 0.7, tone: 3000 }),
  gallant: style({ id: 'mood-gallant', bpm: 80, beatsPerBar: 4, root: 67, scale: MIXOLYDIAN, chords: MAJOR_WALK, lead: 'flute', answer: 'marimba', density: [0.35, 0.85], pad: true, bass: 'root-fifth', tick: false, swing: 0, level: 0.7, tone: 2800 }),
  /** Results, standings, the tournament picker: a calm, warm interlude. */
  interlude: style({ id: 'mood-interlude', bpm: 68, beatsPerBar: 4, root: 67, scale: MAJOR, chords: MAJOR_WALK, lead: 'tine', answer: 'celesta', density: [0.3, 0.7], pad: true, bass: 'root', tick: false, swing: 0, level: 0.75, tone: 3000 }),
} as const;

/**
 * Each trial's mood, and how loud the music sits while the trial is being played (the rest of the
 * time — intro card, results — it plays at full level). Games where listening matters get little or
 * none: Copycat Conductor is a listening game, so its music rests while you play.
 * `null`: no background music at all (Music Box Rhythm plays its own).
 */
export const GAME_MOODS: Record<MinigameId, { mood: keyof typeof MOODS; playing: number } | null> = {
  'copycat-conductor': { mood: 'bright', playing: 0 },
  'jack-in-the-box': { mood: 'playful', playing: 0.45 },
  'find-the-original': { mood: 'curious', playing: 0.7 },
  'red-light-green-light': { mood: 'breezy', playing: 0.55 },
  'wind-up-dash': { mood: 'breezy', playing: 0.65 },
  'music-box-rhythm': null,
  'inferno-escape': { mood: 'warm', playing: 0.6 },
  'midnight-hunger': { mood: 'night', playing: 0.7 },
  'toy-squad': { mood: 'thoughtful', playing: 0.8 },
  'blink-duel': { mood: 'focus', playing: 0.55 },
  'spellbox-showdown': { mood: 'twinkle', playing: 0.55 },
  'odd-page-out': { mood: 'storybook', playing: 0.7 },
  'toy-tower-tumble': { mood: 'thoughtful', playing: 0.8 },
  'toybox-siege': { mood: 'gallant', playing: 0.6 },
  'hoop-hustle': { mood: 'breezy', playing: 0.5 },
};

export const ALL_STYLES: MusicStyle[] = [...HUB_TRACKS.map((t) => t.style), ...Object.values(MOODS)];
export const styleById = (id: string): MusicStyle | undefined => ALL_STYLES.find((s) => s.id === id);
export const isHubTrack = (id: string): id is HubTrackId => HUB_TRACKS.some((t) => t.style.id === id);

// ---------------------------------------------------------------- what should be playing

export interface MusicSituation {
  screen: 'menu' | 'playing' | 'workshop' | 'minigame';
  /** The trial on screen (screen 'minigame'). */
  gameId: MinigameId | null;
  /** The match host's phase (src/minigames/session.ts). */
  phase: string;
  /** The player's jukebox choice. */
  hubTrack: string;
}
export interface MusicTarget {
  /** Style to play, or null for silence. */
  style: string | null;
  /** Level for that style (0..1); the player's Music volume is applied on top. */
  level: number;
}

/** Phases in which a trial is actually being played (music sits back, or rests). */
const PLAY_PHASES = new Set(['countdown', 'playing']);

/** Pure: what the background music should be doing right now. */
export function musicTargetFor(s: MusicSituation): MusicTarget {
  const hub = isHubTrack(s.hubTrack) ? s.hubTrack : s.hubTrack === TRACK_OFF ? null : DEFAULT_HUB_TRACK;
  if (s.screen !== 'minigame') return hub ? { style: hub, level: s.screen === 'menu' ? 0.8 : 1 } : { style: null, level: 0 };
  if (!s.gameId || s.phase === 'picker' || s.phase === 'standings' || s.phase === 'final' || s.phase === 'reveal' || s.phase === 'lobby')
    return { style: MOODS.interlude.id, level: 0.9 };
  const m = GAME_MOODS[s.gameId];
  if (!m) return { style: null, level: 0 };
  const style = MOODS[m.mood].id;
  if (PLAY_PHASES.has(s.phase)) return m.playing > 0 ? { style, level: m.playing } : { style: null, level: 0 };
  return { style, level: 1 };
}

// ---------------------------------------------------------------- the composer

export interface NoteEvent {
  /** Onset within the bar, in beats. */
  beat: number;
  /** Length in beats. */
  dur: number;
  midi: number;
  voice: MusicVoice;
  /** 0..1 */
  vel: number;
}

export interface Composer {
  style: MusicStyle;
  rng: () => number;
  bar: number;
  chord: number;
  /** Lead pitch as an index into the extended scale (see `pitch`). */
  lead: number;
  /** The phrase's rhythm motif (onsets in eighths), reused with new notes. */
  motif: number[];
  /** Slowly drifting phase of the density arc. */
  arc: number;
}

/** mulberry32: small, fast, seeded. */
function rngFrom(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createComposer(style: MusicStyle, seed: number): Composer {
  const rng = rngFrom(seed);
  return { style, rng, bar: 0, chord: 0, lead: 7 + 2, motif: [], arc: rng() * Math.PI * 2 };
}

/** MIDI note of scale step `i` (0 = tonic; 7 = an octave up; may be negative) in a style. */
export function pitch(style: MusicStyle, i: number): number {
  const n = style.scale.length;
  const oct = Math.floor(i / n);
  return style.root + oct * 12 + style.scale[((i % n) + n) % n];
}

/** Scale steps of a chord's triad on `degree`. */
const triad = (degree: number) => [degree, degree + 2, degree + 4];

function pickWeighted<T>(rng: () => number, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}

/** Lead range, in scale steps above the tonic: about an octave and a half. */
const LEAD_LO = 0;
const LEAD_HI = 11;

/**
 * Compose the next bar. Phrases are four bars: a new rhythm motif in bar 1, an answer that reuses
 * it with new notes, a free bar, and a cadence that comes to rest on a chord tone. A density arc
 * about 24 bars long makes passages fuller and sparser in turn; every so often a bar breathes with
 * the melody silent.
 */
export function composeBar(c: Composer): { chord: number; events: NoteEvent[] } {
  const s = c.style;
  const { rng } = c;
  const beats = s.beatsPerBar;
  const eighths = beats * 2;
  const pos = c.bar % 4;
  const events: NoteEvent[] = [];

  // chord: phrases start on the tonic every 16 bars so the piece keeps finding home
  if (c.bar > 0) c.chord = c.bar % 16 === 0 ? 0 : pickWeighted(rng, s.chords[c.chord] ?? [[0, 1]]);
  const chordSteps = triad(c.chord);

  // density for this bar
  const arc = 0.5 + 0.5 * Math.sin(c.arc + (c.bar / 24) * Math.PI * 2);
  const density = (s.density[0] + (s.density[1] - s.density[0]) * arc) * (0.85 + rng() * 0.3);
  const resting = pos === 3 ? false : rng() < 0.08;

  // lead rhythm
  let onsets: number[];
  if (resting) onsets = [];
  else if (pos === 0 || c.motif.length === 0) {
    const want = Math.max(1, Math.min(eighths - 1, Math.round(density * beats)));
    const set = new Set<number>([0]);
    while (set.size < want) {
      // favour on-beats (even eighths)
      const e = Math.floor(rng() * eighths);
      if (e % 2 === 0 || rng() < 0.45) set.add(e);
    }
    onsets = [...set].sort((a, b) => a - b);
    c.motif = onsets;
  } else if (pos === 1 || (pos === 2 && rng() < 0.5)) {
    onsets = c.motif.slice();
    if (rng() < 0.4 && onsets.length > 1) onsets.splice(1 + Math.floor(rng() * (onsets.length - 1)), 1); // vary it
  } else if (pos === 3) {
    onsets = beats === 3 ? [0, 2] : rng() < 0.5 ? [0, 4] : [0, 2, 4];
  } else {
    const want = Math.max(1, Math.round(density * beats));
    const set = new Set<number>();
    while (set.size < want) set.add(Math.floor(rng() * eighths));
    onsets = [...set].sort((a, b) => a - b);
  }

  // lead pitches: small steps, chord tones on strong beats, a cadence onto a chord tone
  const chordTonesInRange = [] as number[];
  for (let i = LEAD_LO; i <= LEAD_HI; i++) if (chordSteps.some((t) => ((i - t) % 7 + 7) % 7 === 0)) chordTonesInRange.push(i);
  onsets.forEach((e, k) => {
    const strong = e % (beats === 3 ? 6 : 4) === 0;
    const last = k === onsets.length - 1;
    let next: number;
    if ((strong && rng() < 0.7) || (pos === 3 && last)) {
      // nearest chord tone, with a little randomness
      const sorted = chordTonesInRange.slice().sort((a, b) => Math.abs(a - c.lead) - Math.abs(b - c.lead));
      next = sorted[rng() < 0.75 ? 0 : Math.min(1, sorted.length - 1)];
    } else {
      const step = pickWeighted(rng, [[-2, 1], [-1, 4], [1, 4], [2, 1], [0, 1], [3, 0.4], [-3, 0.4]] as const);
      next = c.lead + step;
    }
    if (next < LEAD_LO) next = LEAD_LO + (LEAD_LO - next);
    if (next > LEAD_HI) next = LEAD_HI - (next - LEAD_HI);
    c.lead = next;
    const gap = (last ? eighths : onsets[k + 1]) - e;
    const dur = Math.max(0.5, gap / 2) * (pos === 3 && last ? 1.6 : 1);
    const swing = e % 2 === 1 ? s.swing : 0;
    events.push({ beat: e / 2 + swing, dur, midi: pitch(s, next), voice: s.lead, vel: (strong ? 0.62 : 0.5) + rng() * 0.12 });
  });

  // an answering voice in sparse or cadence bars
  if (s.answer && (resting || pos === 3 || (onsets.length <= 2 && rng() < 0.35))) {
    const start = pos === 3 ? beats - 1 : 1 + Math.floor(rng() * (beats - 1));
    const n = 1 + Math.floor(rng() * 2);
    let a = chordSteps[Math.floor(rng() * 3)] + (rng() < 0.5 ? 7 : 0);
    for (let i = 0; i < n; i++) {
      events.push({ beat: start + i * 0.5, dur: 0.75, midi: pitch(s, a - 7), voice: s.answer, vel: 0.36 + rng() * 0.08 });
      a += rng() < 0.5 ? 1 : -1;
    }
  }

  // pad: the chord, held, below the melody (re-struck every bar, softly)
  if (s.pad) for (const t of chordSteps) events.push({ beat: 0, dur: beats, midi: pitch(s, t - 7), voice: 'pad', vel: 0.32 });

  // bass
  if (s.bass !== 'none') {
    events.push({ beat: 0, dur: s.bass === 'root-fifth' ? beats / 2 : beats * 0.9, midi: pitch(s, c.chord - 14), voice: 'bass', vel: 0.55 });
    if (s.bass === 'root-fifth') events.push({ beat: beats === 3 ? 2 : 2, dur: beats / 2, midi: pitch(s, c.chord + 4 - 14), voice: 'bass', vel: 0.42 });
  }

  // the room's clock, barely there
  if (s.tick) for (let b = 0; b < beats; b++) events.push({ beat: b, dur: 0.1, midi: 0, voice: 'tick', vel: b === 0 ? 0.22 : 0.14 });

  c.bar++;
  return { chord: c.chord, events };
}

/** Seconds per bar of a style. */
export const barSeconds = (s: MusicStyle) => (60 / s.bpm) * s.beatsPerBar;

/**
 * Lookahead scheduling: the start times of the bars that should be composed now, given the next
 * unscheduled bar's start, the audio clock and how far ahead to schedule. If the clock has run
 * past the next bar (a stalled tab), playback skips ahead to the next bar line instead of
 * cramming the missed bars in at once.
 */
export function barsDue(nextBarAt: number, now: number, lookahead: number, barLen: number): number[] {
  let t = nextBarAt;
  if (t < now) t = now + 0.05 + (barLen - ((now - t) % barLen)) % barLen;
  const out: number[] = [];
  while (t < now + lookahead && out.length < 8) {
    out.push(t);
    t += barLen;
  }
  return out;
}
