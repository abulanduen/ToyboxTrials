/**
 * Music Box Rhythm — timing helpers (pure; unit-tested).
 *
 * The host's match clock (`state.t`, advanced in fixed 60 Hz steps) is authoritative, so pause
 * and the `timeScale` test hook keep working. But a 60 Hz step is ±8 ms of noise, too coarse for
 * a ±45 ms Perfect window. `SongClock` follows the match clock smoothly against the
 * high-resolution wall clock (performance.now), so that
 *   - a press stamped at wall time P can be converted to the song time it happened at, and
 *   - the pins and the music can be placed between steps.
 */
import type { Action } from '../../game/input';
import type { RhythmInput } from './rules';
import type { Lane } from './tracks';

const STEP_MS = 1000 / 60;
/** The match clock is on average half a step behind the true accumulated time. */
const HALF_STEP = STEP_MS / 2;
/** The host never advances more than this much real time per rendered frame (session.ts). */
const HOST_MAX_FRAME_MS = 100;
const SCALE_WINDOW_MS = 400;
/** Larger disagreements than this are a jump (pause, hitch, time-scale change): snap. */
const SNAP_MS = 40;

export interface SongClock {
  /** Estimated song time at `perf`. */
  est: number;
  /** Wall time (performance.now) of the last sync. */
  perf: number;
  /** The host's time scale as measured (1 in normal play; 0 when frozen/paused; k under `timeScale(k)`). */
  scale: number;
  /** Song ms per wall ms over the frame that just ended (= scale, unless the frame hit the host's cap). */
  rate: number;
  /** Song ms the last frame advanced (bounds how far ahead of a sync the clock is extrapolated). */
  advance: number;
  started: boolean;
  /** Recent syncs: wall time, match clock, and the (capped) duration of the frame that started there. */
  samples: { perf: number; t: number; frame: number }[];
}

export const createSongClock = (): SongClock => ({ est: 0, perf: 0, scale: 1, rate: 1, advance: 0, started: false, samples: [] });

export function resetSongClock(c: SongClock) {
  c.est = 0;
  c.perf = 0;
  c.scale = 1;
  c.rate = 1;
  c.advance = 0;
  c.started = false;
  c.samples.length = 0;
}

/**
 * Call at the start of each rendered frame — before the host steps the match — with the wall time
 * and the match clock. (That is where both the Scene's frame callback and `readLocalInput` run.)
 * `matchT` is therefore the clock as the previous frame left it; the frame that is starting will
 * add its own (capped) duration × the time scale on top, which the estimate includes.
 */
export function syncSongClock(c: SongClock, perfNow: number, matchT: number) {
  const last = c.samples[c.samples.length - 1];
  if (!c.started || !last || matchT < last.t || perfNow < c.perf) {
    resetSongClock(c);
    c.started = true;
    c.est = matchT;
    c.perf = perfNow;
    c.samples.push({ perf: perfNow, t: matchT, frame: 0 });
    return;
  }
  const dPerf = perfNow - c.perf;
  if (dPerf < 0.5) return; // second call in the same frame
  const frame = Math.min(dPerf, HOST_MAX_FRAME_MS);
  if (c.scale === 0 && matchT > last.t) {
    // Starting again after a full stop (countdown → play, resume from pause): assume normal speed
    // until there is enough motion to measure, instead of averaging in the standstill.
    c.samples.length = 0;
    c.samples.push({ perf: last.perf, t: last.t, frame: 0 });
    c.scale = 1;
  }
  c.samples.push({ perf: perfNow, t: matchT, frame });
  // The steps taken between two syncs were driven by the duration of the frame that started at
  // the first of them, so pair each clock change with that frame. Measure over the last ~400 ms
  // of (capped) frame time: enough for the 16.7 ms step quantisation to average out.
  let stepped = 0;
  let real = 0;
  for (let i = c.samples.length - 1; i >= 1; i--) {
    const from = c.samples[i - 1];
    if (from.frame <= 0) continue;
    stepped += c.samples[i].t - from.t;
    real += from.frame;
    if (real >= SCALE_WINDOW_MS) {
      c.samples.splice(0, i - 1); // older samples are no longer needed
      break;
    }
  }
  if (real >= 60) {
    const k = stepped / real;
    c.scale = Math.abs(k - 1) < 0.08 ? 1 : Math.max(0, k);
  }
  c.advance = frame * c.scale;
  c.rate = c.advance / dPerf;
  // Where the estimate should have been before this frame's advance: the stepped clock + half a step.
  const err = matchT + HALF_STEP * Math.min(1, c.scale) - c.est;
  c.est += Math.abs(err) > SNAP_MS ? err : err * 0.08;
  c.est += c.advance;
  c.perf = perfNow;
}

/**
 * Song time at wall time `perf`. Presses are converted after the frame's sync, so `perf` is
 * normally at or before it (interpolation). Looking ahead of the sync is capped at one frame's
 * advance: the match clock can't move further than that before the next sync corrects it.
 */
export const songTimeAt = (c: SongClock, perf: number) => c.est + Math.min((perf - c.perf) * c.rate, Math.max(c.advance, 0));

const SLOTS: Action[] = ['slot1', 'slot2', 'slot3', 'slot4'];

/**
 * Turn the frame's ordered press log + parallel high-resolution press times into rules inputs.
 * `offsetMs` is the player's latency calibration: how late their taps arrive (subtracted).
 * A missing timestamp falls back to the time of the last clock sync.
 */
export function pressesToInputs(presses: readonly Action[], times: readonly number[], clock: SongClock, offsetMs: number): RhythmInput[] {
  const out: RhythmInput[] = [];
  for (let i = 0; i < presses.length; i++) {
    const lane = SLOTS.indexOf(presses[i]);
    if (lane < 0) continue;
    const perf = times[i] ?? clock.perf;
    out.push({ lane: lane as Lane, t: songTimeAt(clock, perf) - offsetMs });
  }
  return out;
}

// ------------------------------------------------------------------ latency calibration

/** The "tap to the beat" test: listen to four ticks, tap along with the next eight. */
export const TAP_TEST = { beatMs: 500, listenBeats: 4, tapBeats: 8, minTaps: 5 };
export const OFFSET_MIN = -150;
export const OFFSET_MAX = 250;
export const clampOffset = (ms: number) => Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(ms)));

/**
 * Timing offset from a tap test: the median error of the taps against the beats they were meant
 * for (beat i is at `t0 + i × beatMs`; taps during the listening beats are ignored), rounded to
 * 5 ms and clamped. Null with too few usable taps.
 */
export function offsetFromTaps(taps: readonly number[], t0: number, cfg = TAP_TEST): number | null {
  const total = cfg.listenBeats + cfg.tapBeats;
  const deltas: number[] = [];
  for (const tap of taps) {
    const i = Math.round((tap - t0) / cfg.beatMs);
    if (i < cfg.listenBeats || i >= total) continue;
    const d = tap - (t0 + i * cfg.beatMs);
    if (Math.abs(d) <= cfg.beatMs * 0.45) deltas.push(d);
  }
  if (deltas.length < cfg.minTaps) return null;
  deltas.sort((a, b) => a - b);
  const mid = deltas.length >> 1;
  const median = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  return clampOffset(Math.round(median / 5) * 5);
}
