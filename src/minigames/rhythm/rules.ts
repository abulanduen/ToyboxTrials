/**
 * Music Box Rhythm — rules core (GAME_DESIGN.md §4 · 08). Deterministic; no DOM/three/audio/timers.
 *
 * Everyone plays the same chart at once. An input is `{ lane, t }`: `t` is the SONG time (ms) of
 * the physical press, measured by the client from high-resolution press timestamps (and already
 * corrected by the player's latency calibration) — so judging is not quantised to the 60 Hz step.
 * The rules only trust `t` within a small window around the match clock.
 *
 *   |t − note| ≤ 45 ms → Perfect (100)   ≤ 100 ms → Good (50)   otherwise no hit
 *   A note nobody hit by note + 220 ms is a Miss. A press with no note in reach is a stray.
 *   Misses and strays reset the combo. Multiplier: ×1, ×2 from 10, ×3 from 20, ×4 from 30.
 *   Accuracy = (Perfect + ½ Good) ÷ notes.  Ranked by score, then accuracy, then best combo.
 */
import { rankByKey } from '../scoring';
import type { Contestant, MatchEvent, RulesCore } from '../types';
import { getSong, trackForSeed, type ChartNote, type Lane, type TrackId } from './tracks';

export interface RhythmInput {
  lane: Lane;
  /** Song time of the press, ms. */
  t: number;
}

export interface RhythmConfig {
  /** Undefined → chosen from the seed. */
  track?: TrackId;
  perfectMs: number;
  goodMs: number;
  /** Extra time after the Good window before an unhit note is called a Miss (late inputs in flight). */
  missGraceMs: number;
  /** How far behind the match clock a press time may claim to be (must be ≤ missGraceMs). */
  maxInputAgeMs: number;
  /**
   * How far ahead of the step clock a press time may be. Inputs are delivered on the first fixed
   * step of a rendered frame, but the frame itself covers up to 100 ms of match time (the host's
   * cap), so presses late in a slow frame are legitimately "ahead" of that step.
   */
  maxInputLeadMs: number;
}

export const DEFAULT_CONFIG: RhythmConfig = {
  perfectMs: 45,
  goodMs: 100,
  missGraceMs: 120,
  maxInputAgeMs: 120,
  maxInputLeadMs: 120,
};

export const PERFECT_POINTS = 100;
export const GOOD_POINTS = 50;
export const MAX_MULTIPLIER = 4;
export const COMBO_PER_MULTIPLIER = 10;

export type Judgement = 'perfect' | 'good' | 'miss';
/** Per-note marks in `RhythmPlayer.judged`. */
export const PENDING = 0;
export const PERFECT = 1;
export const GOOD = 2;
export const MISS = 3;

export interface RhythmPlayer {
  id: string;
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  /** Presses with no note in reach. */
  stray: number;
  /** One mark per chart note (PENDING / PERFECT / GOOD / MISS). */
  judged: number[];
  /** Every note before this index has been judged. */
  cursor: number;
}

export interface RhythmState {
  config: RhythmConfig;
  track: TrackId;
  /** Song time, ms (the host's match clock). */
  t: number;
  chart: ChartNote[];
  endMs: number;
  players: RhythmPlayer[];
  over: boolean;
  events: MatchEvent[];
}

export const multiplierFor = (combo: number) => Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_PER_MULTIPLIER));

/** Accuracy in percent over the notes judged so far (100 before the first note). */
export function accuracyOf(p: Pick<RhythmPlayer, 'perfect' | 'good' | 'miss'>): number {
  const n = p.perfect + p.good + p.miss;
  return n === 0 ? 100 : ((p.perfect + p.good * 0.5) / n) * 100;
}

/** Judgement for a timing error, or null when it is outside the Good window. */
export function judge(deltaMs: number, cfg: Pick<RhythmConfig, 'perfectMs' | 'goodMs'> = DEFAULT_CONFIG): 'perfect' | 'good' | null {
  const d = Math.abs(deltaMs);
  return d <= cfg.perfectMs ? 'perfect' : d <= cfg.goodMs ? 'good' : null;
}

function applyPress(s: RhythmState, p: RhythmPlayer, inp: RhythmInput) {
  const cfg = s.config;
  if (!(inp.lane >= 0 && inp.lane <= 3) || !Number.isFinite(inp.t)) return;
  // A press can only claim a time close to the step clock (see RhythmConfig).
  const t = Math.min(s.t + cfg.maxInputLeadMs, Math.max(s.t - cfg.maxInputAgeMs, inp.t));
  // Earliest pending note in this lane within the Good window.
  for (let i = p.cursor; i < s.chart.length; i++) {
    const n = s.chart[i];
    if (n.t > t + cfg.goodMs) break;
    if (n.lane !== inp.lane || p.judged[i] !== PENDING) continue;
    const j = judge(t - n.t, cfg);
    if (!j) continue;
    p.judged[i] = j === 'perfect' ? PERFECT : GOOD;
    p.combo++;
    p.maxCombo = Math.max(p.maxCombo, p.combo);
    if (j === 'perfect') p.perfect++;
    else p.good++;
    const points = (j === 'perfect' ? PERFECT_POINTS : GOOD_POINTS) * multiplierFor(p.combo);
    p.score += points;
    s.events.push({ type: 'judge', id: p.id, lane: n.lane, note: i, judgement: j, delta: t - n.t, combo: p.combo, points });
    return;
  }
  p.stray++;
  const broke = p.combo >= COMBO_PER_MULTIPLIER;
  p.combo = 0;
  s.events.push({ type: 'stray', id: p.id, lane: inp.lane, broke });
}

export const rhythmRules: RulesCore<RhythmState, RhythmInput, RhythmConfig> = {
  init(contestants: Contestant[], seed: number, config?: Partial<RhythmConfig>): RhythmState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const track = cfg.track ?? trackForSeed(seed);
    const song = getSong(track);
    return {
      config: cfg,
      track,
      t: 0,
      chart: song.chart,
      endMs: song.endMs,
      players: contestants.map((c) => ({
        id: c.id,
        score: 0,
        combo: 0,
        maxCombo: 0,
        perfect: 0,
        good: 0,
        miss: 0,
        stray: 0,
        judged: new Array<number>(song.chart.length).fill(PENDING),
        cursor: 0,
      })),
      over: false,
      events: [],
    };
  },

  step(s, inputs, dtMs) {
    if (s.over) return s;
    s.t += dtMs;
    const missAt = s.t - s.config.goodMs - s.config.missGraceMs;
    for (const p of s.players) {
      const mine = inputs[p.id];
      if (mine) for (const inp of mine) applyPress(s, p, inp);
      // Notes that have gone by unhit.
      while (p.cursor < s.chart.length) {
        const i = p.cursor;
        if (p.judged[i] === PENDING) {
          if (s.chart[i].t > missAt) break;
          p.judged[i] = MISS;
          p.miss++;
          const broke = p.combo >= COMBO_PER_MULTIPLIER;
          p.combo = 0;
          s.events.push({ type: 'judge', id: p.id, lane: s.chart[i].lane, note: i, judgement: 'miss', broke });
        }
        p.cursor++;
      }
    }
    if (s.t >= s.endMs) {
      s.over = true;
      s.events.push({ type: 'over' });
    }
    return s;
  },

  isOver: (s) => s.over,

  result(s) {
    const total = s.chart.length;
    const acc = (p: RhythmPlayer) => (total ? (p.perfect + p.good * 0.5) / total : 0);
    const ordered = s.players
      .slice()
      .sort((a, b) => b.score - a.score || acc(b) - acc(a) || b.maxCombo - a.maxCombo)
      .map((p) => ({ contestantId: p.id, score: p.score, key: `${p.score}|${acc(p).toFixed(6)}|${p.maxCombo}` }));
    const best = ordered.length ? s.players.find((p) => p.id === ordered[0].contestantId)! : null;
    return {
      placements: rankByKey(ordered),
      durationMs: s.t,
      stats: {
        notes: total,
        topScore: best?.score ?? 0,
        topAccuracy: best ? Math.round(acc(best) * 1000) / 10 : 0,
        topCombo: best?.maxCombo ?? 0,
      },
    };
  },

  drainEvents(s) {
    const e = s.events;
    s.events = [];
    return e;
  },
};
