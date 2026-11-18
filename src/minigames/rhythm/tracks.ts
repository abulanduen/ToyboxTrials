/**
 * Music Box Rhythm — the tracks (GAME_DESIGN.md §4 · 08, amendment A6).
 *
 * Three ORIGINAL tunes, composed in code for Toybox Trials (recorded in
 * public/assets/asset-manifest.json). Each is written bar by bar as a melody over a chord
 * progression; the accompaniment (bass, chord plucks, light percussion) and the note chart are
 * both derived from that score, so the chart always follows the tune:
 *
 *   - every chart note is a melody note, at the melody note's time;
 *   - the lane follows the melody's contour (higher pitch → one lane to the right, two for a
 *     leap, wrapping round; a repeated pitch stays in its lane);
 *   - sections carry a level, so complexity rises through the song:
 *       1 = only the notes that fall on a beat, 2 = every note, 3 = every note plus a second
 *       pin on each bar's downbeat.
 *
 * Pure data + pure functions: no DOM, no audio. The synthesis lives in ./music.ts.
 */

export type TrackId = 'tin-waltz' | 'clockwork-parade' | 'spring-loaded';
export type Lane = 0 | 1 | 2 | 3;

interface Section {
  /** One string per bar: space-separated `pitch:beats` tokens (`-` is a rest), e.g. `e5:1 g5:.5`. */
  bars: string[];
  /** One chord per bar. */
  chords: string[];
  level: 1 | 2 | 3;
}

export interface TrackDef {
  id: TrackId;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  blurb: string;
  bpm: number;
  beatsPerBar: number;
  style: 'waltz' | 'march' | 'gallop';
  /** Count-in bars before the first melody note. */
  leadInBars: number;
  sections: Section[];
}

export interface ChartNote {
  /** Song time of the note, ms. */
  t: number;
  lane: Lane;
}

export interface AudioEvent {
  t: number;
  voice: 'tine' | 'bass' | 'pluck' | 'tick' | 'shake';
  midi?: number;
  /** Seconds. */
  dur?: number;
  accent?: boolean;
}

export interface Song {
  id: TrackId;
  title: string;
  difficulty: TrackDef['difficulty'];
  blurb: string;
  bpm: number;
  beatsPerBar: number;
  beatMs: number;
  /** Song time of the first bar of the tune (after the count-in). */
  leadInMs: number;
  /** Song time at which the match ends (last bar + a short tail). */
  endMs: number;
  /** Number of beats including the count-in (beat i is at i × beatMs). */
  beats: number;
  chart: ChartNote[];
  audio: AudioEvent[];
}

// ------------------------------------------------------------------------------- the scores

// "Tin Waltz" — C major, 3/4. A gentle turning tune; mostly one note per beat.
const WALTZ_A = [
  'e5:1 g5:1 c6:1',
  'b5:1.5 a5:.5 g5:1',
  'd5:1 g5:1 b5:1',
  'a5:2 g5:1',
  'f5:1 a5:1 c6:1',
  'e6:1.5 d6:.5 c6:1',
  'b5:1 a5:1 b5:1',
  'c6:2 -:1',
];
const WALTZ_A2 = [
  'e5:.5 f5:.5 g5:1 c6:1',
  'b5:1 a5:.5 b5:.5 g5:1',
  'd5:.5 e5:.5 g5:1 b5:1',
  'a5:1 b5:.5 a5:.5 g5:1',
  'f5:.5 g5:.5 a5:1 c6:1',
  'e6:1 d6:.5 e6:.5 c6:1',
  'b5:.5 c6:.5 d6:1 b5:1',
  'c6:2 -:1',
];
const WALTZ_B = [
  'a5:1 c6:.5 b5:.5 a5:1',
  'g5:1 e5:1 g5:1',
  'f5:.5 g5:.5 a5:1 c6:1',
  'g5:2 e5:1',
  'd5:1 f5:.5 e5:.5 d5:1',
  'b4:1 d5:1 g5:1',
  'e5:.5 f5:.5 g5:.5 a5:.5 b5:.5 c6:.5',
  'd6:2 -:1',
];
const WALTZ_A_CH = ['C', 'C', 'G', 'G', 'F', 'C', 'G', 'C'];
const WALTZ_B_CH = ['Am', 'Em', 'F', 'C', 'Dm', 'G', 'C', 'G'];

// "Clockwork Parade" — G major, 4/4. A toy-soldier march with skipping eighth notes.
const PARADE_A = [
  'g5:1 b5:.5 d6:.5 b5:1 g5:1',
  'a5:.5 b5:.5 a5:.5 g5:.5 d5:2',
  'e5:1 g5:.5 c6:.5 g5:1 e5:1',
  'd5:.5 g5:.5 b5:.5 g5:.5 d6:2',
  'e6:1 d6:.5 b5:.5 g5:1 b5:1',
  'c6:.5 b5:.5 a5:.5 g5:.5 e5:2',
  'f#5:1 a5:.5 d6:.5 c6:1 a5:1',
  'd6:1 a5:1 d5:1 -:1',
];
const PARADE_B = [
  'c6:.5 c6:.5 e6:1 c6:.5 g5:.5 e5:1',
  'd5:.5 d5:.5 g5:1 b5:.5 a5:.5 g5:1',
  'a5:.5 c6:.5 e6:.5 c6:.5 a5:1 e5:1',
  'f#5:.5 a5:.5 d6:1 a5:1 -:1',
  'e6:.5 d6:.5 c6:.5 e6:.5 g5:1 c6:1',
  'd6:.5 b5:.5 g5:.5 b5:.5 d5:1 g5:1',
  'a5:.5 b5:.5 c6:.5 d6:.5 e6:.5 f#6:.5 d6:1',
  'g6:1 d6:1 g5:1 -:1',
];
const PARADE_A_CH = ['G', 'G', 'C', 'G', 'Em', 'C', 'D', 'D'];
const PARADE_B_CH = ['C', 'G', 'Am', 'D', 'C', 'G', 'D', 'G'];

// "Spring-Loaded" — A minor, 4/4, fast. Running eighths that leap like an over-wound spring.
const SPRING_A = [
  'a5:.5 c6:.5 e6:.5 c6:.5 a5:.5 c6:.5 e6:1',
  'd6:.5 c6:.5 b5:.5 c6:.5 a5:1 e5:1',
  'f5:.5 a5:.5 c6:.5 a5:.5 f5:.5 a5:.5 c6:1',
  'b5:.5 d6:.5 g5:.5 b5:.5 d6:1 b5:1',
  'a5:.5 e6:.5 a5:.5 e6:.5 c6:.5 e6:.5 a6:1',
  'g6:.5 e6:.5 c6:.5 e6:.5 a5:1 c6:1',
  'f5:.5 g5:.5 a5:.5 c6:.5 f6:.5 e6:.5 c6:1',
  'b5:.5 g#5:.5 e5:.5 g#5:.5 b5:1 e6:1',
];
const SPRING_B = [
  'c6:1 e6:.5 g6:.5 e6:.5 c6:.5 g5:1',
  'b5:1 d6:.5 g6:.5 d6:.5 b5:.5 g5:1',
  'a5:.5 b5:.5 c6:.5 d6:.5 e6:1 a5:1',
  'f5:.5 a5:.5 c6:.5 f6:.5 e6:.5 c6:.5 a5:1',
  'g5:.5 c6:.5 e6:.5 c6:.5 g6:1 e6:1',
  'd6:.5 b5:.5 g5:.5 b5:.5 d6:.5 g6:.5 b5:1',
  'e6:.5 d6:.5 b5:.5 g#5:.5 e5:.5 g#5:.5 b5:1',
  'a5:1 e6:1 a6:1 -:1',
];
const SPRING_A_CH = ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'];
const SPRING_B_CH = ['C', 'G', 'Am', 'F', 'C', 'G', 'E', 'Am'];

export const TRACKS: TrackDef[] = [
  {
    id: 'tin-waltz',
    title: 'Tin Waltz',
    difficulty: 'easy',
    blurb: 'A gentle one-two-three.',
    bpm: 112,
    beatsPerBar: 3,
    style: 'waltz',
    leadInBars: 2,
    sections: [
      { bars: WALTZ_A, chords: WALTZ_A_CH, level: 1 },
      { bars: WALTZ_B, chords: WALTZ_B_CH, level: 1 },
      { bars: WALTZ_A2, chords: WALTZ_A_CH, level: 2 },
      { bars: WALTZ_B, chords: WALTZ_B_CH, level: 2 },
      { bars: WALTZ_A2, chords: WALTZ_A_CH, level: 3 },
    ],
  },
  {
    id: 'clockwork-parade',
    title: 'Clockwork Parade',
    difficulty: 'medium',
    blurb: 'A toy-soldier march with a skip in it.',
    bpm: 124,
    beatsPerBar: 4,
    style: 'march',
    leadInBars: 2,
    sections: [
      { bars: PARADE_A, chords: PARADE_A_CH, level: 1 },
      { bars: PARADE_B, chords: PARADE_B_CH, level: 2 },
      { bars: PARADE_A, chords: PARADE_A_CH, level: 2 },
      { bars: PARADE_B, chords: PARADE_B_CH, level: 3 },
    ],
  },
  {
    id: 'spring-loaded',
    title: 'Spring-Loaded',
    difficulty: 'hard',
    blurb: 'Fast, leaping runs. Hold on.',
    bpm: 150,
    beatsPerBar: 4,
    style: 'gallop',
    leadInBars: 2,
    sections: [
      { bars: SPRING_A, chords: SPRING_A_CH, level: 2 },
      { bars: SPRING_B, chords: SPRING_B_CH, level: 2 },
      { bars: SPRING_A, chords: SPRING_A_CH, level: 3 },
      { bars: SPRING_B, chords: SPRING_B_CH, level: 3 },
      { bars: SPRING_A, chords: SPRING_A_CH, level: 3 },
    ],
  },
];

export const TRACK_IDS = TRACKS.map((t) => t.id);
/** How long the match runs after the final bar (the last note rings out). */
export const TAIL_MS = 1600;

// ------------------------------------------------------------------------------- compiling

const PITCH: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** `f#5` → MIDI 78. Throws on anything it can't read (caught by the unit tests). */
export function midiOf(name: string): number {
  const m = /^([a-g])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`bad pitch "${name}"`);
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export function parseBar(bar: string): { midi: number | null; beats: number }[] {
  return bar
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [p, d] = tok.split(':');
      const beats = Number(d);
      if (!(beats > 0)) throw new Error(`bad duration in "${tok}"`);
      return { midi: p === '-' ? null : midiOf(p), beats };
    });
}

/** Chord name (`C`, `Am`, `G7`…) → pitch classes [root, third, fifth]. */
function chordTones(name: string): [number, number, number] {
  const m = /^([A-G])(#|b)?(m)?7?$/.exec(name);
  if (!m) throw new Error(`bad chord "${name}"`);
  const root = (PITCH[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
  return [root, (root + (m[3] ? 3 : 4)) % 12, (root + 7) % 12];
}

/** Lowest MIDI note ≥ `floor` with the given pitch class. */
const above = (pc: number, floor: number) => floor + ((((pc - floor) % 12) + 12) % 12);

export function compileTrack(def: TrackDef): Song {
  const beatMs = 60000 / def.bpm;
  const barBeats = def.beatsPerBar;
  const leadInBeats = def.leadInBars * barBeats;
  const audio: AudioEvent[] = [];
  const chart: ChartNote[] = [];
  const at = (beat: number) => beat * beatMs;
  const sec = (beats: number) => (beats * beatMs) / 1000;

  // Count-in: one tick per beat, accented on each bar.
  for (let b = 0; b < leadInBeats; b++) audio.push({ t: at(b), voice: 'tick', accent: b % barBeats === 0 });

  let lane: Lane = 1;
  let prevMidi: number | null = null;
  let bar = def.leadInBars;
  for (const section of def.sections) {
    if (section.bars.length !== section.chords.length) throw new Error(`${def.id}: bars/chords mismatch`);
    section.bars.forEach((text, i) => {
      const bar0 = bar * barBeats;
      const [root, third, fifth] = chordTones(section.chords[i]);

      // ---- accompaniment
      const bass = above(root, 43);
      const bass5 = above(fifth, 43);
      const plucks = [above(third, 60), above(fifth, 60)];
      const pluck = (beat: number) => plucks.forEach((midi) => audio.push({ t: at(bar0 + beat), voice: 'pluck', midi, dur: sec(0.6) }));
      if (def.style === 'waltz') {
        audio.push({ t: at(bar0), voice: 'bass', midi: bass, dur: sec(1.6) });
        pluck(1);
        pluck(2);
        if (section.level > 1) audio.push({ t: at(bar0), voice: 'shake', accent: true });
      } else if (def.style === 'march') {
        audio.push({ t: at(bar0), voice: 'bass', midi: bass, dur: sec(1.4) }, { t: at(bar0 + 2), voice: 'bass', midi: bass5, dur: sec(1.4) });
        pluck(1);
        pluck(3);
        for (let b = 0; b < barBeats; b++) audio.push({ t: at(bar0 + b), voice: 'shake', accent: b === 0 });
      } else {
        for (let b = 0; b < barBeats; b++) {
          audio.push({ t: at(bar0 + b), voice: 'bass', midi: b % 2 ? bass5 : bass, dur: sec(0.8) });
          audio.push({ t: at(bar0 + b), voice: 'shake', accent: b % 2 === 0 });
          audio.push({ t: at(bar0 + b + 0.5), voice: 'shake' });
          audio.push({ t: at(bar0 + b + 0.5), voice: 'pluck', midi: plucks[b % 2], dur: sec(0.35) });
        }
      }

      // ---- melody + chart
      let beat = 0;
      for (const n of parseBar(text)) {
        if (n.midi !== null) {
          const t = at(bar0 + beat);
          audio.push({ t, voice: 'tine', midi: n.midi, dur: sec(n.beats) });
          const onBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
          if (section.level > 1 || onBeat) {
            if (prevMidi !== null && n.midi !== prevMidi) {
              const leap = Math.abs(n.midi - prevMidi) >= 7 ? 2 : 1;
              lane = ((((lane + (n.midi > prevMidi ? leap : -leap)) % 4) + 4) % 4) as Lane;
            }
            prevMidi = n.midi;
            chart.push({ t, lane });
            // Level 3: the downbeat gets a second pin, two lanes across.
            if (section.level === 3 && beat === 0) chart.push({ t, lane: ((lane + 2) % 4) as Lane });
          }
        }
        beat += n.beats;
      }
      if (Math.abs(beat - barBeats) > 1e-6) throw new Error(`${def.id}: bar "${text}" has ${beat} beats, expected ${barBeats}`);
      bar++;
    });
  }
  audio.sort((a, b) => a.t - b.t);
  chart.sort((a, b) => a.t - b.t || a.lane - b.lane);
  return {
    id: def.id,
    title: def.title,
    difficulty: def.difficulty,
    blurb: def.blurb,
    bpm: def.bpm,
    beatsPerBar: barBeats,
    beatMs,
    leadInMs: at(leadInBeats),
    endMs: at(bar * barBeats) + TAIL_MS,
    beats: bar * barBeats,
    chart,
    audio,
  };
}

const cache = new Map<TrackId, Song>();
export function getSong(id: TrackId): Song {
  let s = cache.get(id);
  if (!s) {
    const def = TRACKS.find((t) => t.id === id);
    if (!def) throw new Error(`unknown track "${id}"`);
    s = compileTrack(def);
    cache.set(id, s);
  }
  return s;
}

/** Tournaments (and anything else that doesn't choose) get a track from the match seed. */
export const trackForSeed = (seed: number): TrackId => TRACK_IDS[(seed >>> 0) % TRACK_IDS.length];
