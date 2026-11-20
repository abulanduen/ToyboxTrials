/**
 * The performance guard's rule, as pure numbers (unit tested; src/scene/PerformanceGuard.tsx runs it).
 *
 * It watches real frame times on the player's own device (the only place a frame rate means
 * anything) and asks for a step down when the game has been slow for a while: the average over a
 * 4-second window is under 40 fps, two windows in a row. Very long frames (a tab switch, a load,
 * a one-off shader compile) are left out, so a single hitch never lowers the quality.
 */
export const WINDOW_S = 4;
export const SLOW_FPS = 40;
export const SLOW_WINDOWS = 2;
/** Frames longer than this are stalls, not the game's pace: skipped. */
export const STALL_S = 1;

export interface GuardState {
  /** Seconds and frames in the current window. */
  t: number;
  n: number;
  /** Slow windows in a row. */
  slow: number;
}

export const guardStart = (): GuardState => ({ t: 0, n: 0, slow: 0 });

/**
 * Feed one frame. `watching` is false while nothing should be judged (paused, loading, a hidden
 * tab, the guard switched off): the window starts again. Returns true when it is time to step down.
 */
export function guardFrame(g: GuardState, dt: number, watching: boolean): boolean {
  if (!watching) {
    g.t = 0;
    g.n = 0;
    g.slow = 0;
    return false;
  }
  if (dt > STALL_S || dt <= 0) return false;
  g.t += dt;
  g.n++;
  if (g.t < WINDOW_S) return false;
  const fps = g.n / g.t;
  g.t = 0;
  g.n = 0;
  g.slow = fps < SLOW_FPS ? g.slow + 1 : 0;
  if (g.slow < SLOW_WINDOWS) return false;
  g.slow = 0;
  return true;
}

/**
 * The next step from `step` for a device on this quality tier: 1 renders at 1× pixels (skipped
 * when it already does), 2 turns post-processing off (skipped when the tier has none), 3 turns
 * shadows off (and saves Low). Returns `step` itself when there is nothing left to lower.
 */
export function nextStep(step: number, has: { hiDpr: boolean; post: boolean; shadows: boolean }): 0 | 1 | 2 | 3 {
  let s = step + 1;
  if (s === 1 && !has.hiDpr) s = 2;
  if (s === 2 && !has.post) s = 3;
  if (s === 3 && !has.shadows) return Math.min(3, step) as 0 | 1 | 2 | 3;
  return Math.min(3, s) as 0 | 1 | 2 | 3;
}
