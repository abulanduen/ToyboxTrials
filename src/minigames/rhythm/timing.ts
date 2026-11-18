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
const RATE_WINDOW_MS = 400;
/** Larger disagreements than this are a jump (pause, hitch, time-scale change): snap. */
const SNAP_MS = 40;

export interface SongClock {
  /** Estimated song time at `perf`. */
  est: number;
  /** Wall time (performance.now) of the last sync. */
  perf: number;
  /** Song ms per wall ms (1 in normal play; 0 when frozen/paused; k under `timeScale(k)`). */
  rate: number;
  /** Song ms the last frame advanced (bounds how far ahead of a sync the clock is extrapolated). */
  advance: number;
  started: boolean;
  /** Recent (wall, match) samples for the rate estimate. */
  samples: { perf: number; t: number }[];
}

export const createSongClock = (): SongClock => ({ est: 0, perf: 0, rate: 1, advance: 0, started: false, samples: [] });

export function resetSongClock(c: SongClock) {
  c.est = 0;
  c.perf = 0;
  c.rate = 1;
  c.advance = 0;
  c.started = false;
  c.samples.length = 0;
}

/**
 * Call at the start of each rendered frame — before the host steps the match — with the wall time
 * and the match clock. (That is where both the Scene's frame callback and `readLocalInput` run.)
 * `matchT` is therefore the clock as the previous frame left it: the frame that is starting adds
 * its own duration on top, which the estimate includes.
 */
export function syncSongClock(c: SongClock, perfNow: number, matchT: number) {
  const last = c.samples[c.samples.length - 1];
  if (!c.started || !last || matchT < last.t || perfNow < c.perf) {
    c.started = true;
    c.est = matchT;
    c.perf = perfNow;
    c.rate = 1;
    c.advance = 0;
    c.samples.length = 0;
    c.samples.push({ perf: perfNow, t: matchT });
    return;
  }
  const dPerf = perfNow - c.perf;
  if (dPerf < 0.5) return; // second call in the same frame
  if (c.rate === 0 && matchT > last.t) {
    // Starting again after a full stop (countdown → play, resume from pause): assume normal speed
    // until there is enough motion to measure, instead of averaging in the standstill.
    c.samples.length = 0;
    c.samples.push(last);
    c.rate = 1;
  }
  c.samples.push({ perf: perfNow, t: matchT });
  while (c.samples.length > 2 && perfNow - c.samples[1].perf >= RATE_WINDOW_MS) c.samples.shift();
  const first = c.samples[0];
  const span = perfNow - first.perf;
  if (span >= 60) {
    const r = (matchT - first.t) / span;
    c.rate = Math.abs(r - 1) < 0.08 ? 1 : Math.max(0, r);
  }
  c.advance = c.rate * dPerf;
  c.est += c.advance;
  c.perf = perfNow;
  const err = matchT + HALF_STEP * Math.min(1, c.rate) + dPerf * c.rate - c.est;
  if (Math.abs(err) > SNAP_MS) c.est += err;
  else c.est += err * 0.08;
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
