import { describe, expect, it } from 'vitest';
import { SLOW_FPS, SLOW_WINDOWS, WINDOW_S, guardFrame, guardStart, nextStep } from '../../src/game/perfGuard';

/** Run `seconds` of frames at `fps`; returns how many step-downs were asked for. */
function run(g: ReturnType<typeof guardStart>, fps: number, seconds: number, watching = true) {
  let asks = 0;
  for (let t = 0; t < seconds; t += 1 / fps) if (guardFrame(g, 1 / fps, watching)) asks++;
  return asks;
}

describe('performance guard', () => {
  it('leaves a device that keeps up alone (60 fps, and 45 fps)', () => {
    const g = guardStart();
    expect(run(g, 60, 120)).toBe(0);
    expect(run(g, 45, 120)).toBe(0);
  });

  it('steps down after two slow windows in a row (8 s under 40 fps), then again only after two more', () => {
    const g = guardStart();
    expect(run(g, 25, WINDOW_S * SLOW_WINDOWS - 0.5)).toBe(0);
    expect(run(g, 25, 1)).toBe(1); // at 8 s
    expect(run(g, 25, WINDOW_S * SLOW_WINDOWS - 1.5)).toBe(0); // up to 14.5 s
    expect(run(g, 25, 2)).toBe(1); // at 16 s
  });

  it('a slow window followed by a smooth one starts the count again', () => {
    const g = guardStart();
    run(g, 20, WINDOW_S);
    run(g, 60, WINDOW_S);
    expect(run(g, 20, WINDOW_S - 0.2)).toBe(0);
  });

  it('ignores stalls (a tab switch, a load) and anything while not watching (paused, hidden, switched off)', () => {
    const g = guardStart();
    for (let i = 0; i < 30; i++) expect(guardFrame(g, 2.5, true)).toBe(false);
    expect(run(g, 10, 60, false)).toBe(0);
    expect(g.slow).toBe(0);
  });

  it('just under the threshold is slow, at it is not', () => {
    expect(run(guardStart(), SLOW_FPS - 2, WINDOW_S * SLOW_WINDOWS + 0.5)).toBe(1);
    expect(run(guardStart(), SLOW_FPS + 2, 60)).toBe(0);
  });

  it('steps through what this tier has: 1× pixels, then no post-processing, then no shadows; then stops', () => {
    const all = { hiDpr: true, post: true, shadows: true };
    expect(nextStep(0, all)).toBe(1);
    expect(nextStep(1, all)).toBe(2);
    expect(nextStep(2, all)).toBe(3);
    expect(nextStep(3, all)).toBe(3);
    // already 1× pixels: straight to post-processing; Low (no post, no shadows) at 1×: nothing to lower
    expect(nextStep(0, { hiDpr: false, post: true, shadows: true })).toBe(2);
    expect(nextStep(0, { hiDpr: true, post: false, shadows: false })).toBe(1);
    expect(nextStep(1, { hiDpr: true, post: false, shadows: false })).toBe(1);
    expect(nextStep(0, { hiDpr: false, post: false, shadows: false })).toBe(0);
  });
});
