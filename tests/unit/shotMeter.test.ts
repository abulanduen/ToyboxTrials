/**
 * The shared basketball shot meter (src/minigames/shared/shotMeter.ts): held, it winds up and back
 * down like a toy key, for the Hub ball, Hoop Hustle and Hoop Clash alike.
 */
import { describe, expect, it } from 'vitest';
import { SHOT_SWEEP_MS, holdForPower, shotPower, shotRising } from '../../src/minigames/shared/shotMeter';
import { CHARGE_MS as CLASH_CHARGE_MS } from '../../src/minigames/hoopclash/rules';
import { DEFAULT_CONFIG as HUSTLE } from '../../src/minigames/hoophustle/rules';

const T = SHOT_SWEEP_MS;

describe('the shot meter winds back and forth', () => {
  it('rises over the first sweep exactly as the old one-way charge did', () => {
    for (let ms = 0; ms <= T; ms += 25) expect(shotPower(ms)).toBeCloseTo(ms / T, 12);
    expect(shotPower(T)).toBe(1);
  });

  it('then falls back to empty over the next sweep, and rises again: a ping-pong, never parked at full', () => {
    expect(shotPower(T * 1.25)).toBeCloseTo(0.75, 12);
    expect(shotPower(T * 1.5)).toBeCloseTo(0.5, 12);
    expect(shotPower(T * 2)).toBeCloseTo(0, 12);
    expect(shotPower(T * 2.4)).toBeCloseTo(0.4, 12);
    expect(shotPower(T * 3)).toBeCloseTo(1, 12);
    expect(shotPower(T * 3.5)).toBeCloseTo(0.5, 12);
    // Held for a long time it keeps swinging through the whole range.
    const seen = Array.from({ length: 2000 }, (_, i) => shotPower(i * (1000 / 60)));
    expect(Math.max(...seen)).toBeGreaterThan(0.98);
    expect(Math.min(...seen.slice(200))).toBeLessThan(0.02);
    for (const p of seen) expect(p >= 0 && p <= 1).toBe(true);
  });

  it('knows which way it is heading', () => {
    expect(shotRising(0)).toBe(true);
    expect(shotRising(T * 0.5)).toBe(true);
    expect(shotRising(T * 1.5)).toBe(false);
    expect(shotRising(T * 2.5)).toBe(true);
    expect(shotRising(T * 3.9)).toBe(false);
  });

  it('is continuous, and its steps are the same size up and down (no jump at either end)', () => {
    const step = 1000 / 60;
    for (let ms = step; ms < T * 6; ms += step) expect(Math.abs(shotPower(ms) - shotPower(ms - step))).toBeLessThanOrEqual(step / T + 1e-9);
  });

  it('is deterministic and safe on odd input', () => {
    expect(shotPower(-5)).toBe(0);
    expect(shotPower(NaN)).toBe(0);
    expect(shotPower(Infinity)).toBe(0);
    expect(shotPower(500, 0)).toBe(0);
    expect(shotPower(777.7)).toBe(shotPower(777.7));
  });

  it('a bot plans its hold on the first rise', () => {
    for (const p of [0, 0.3, 0.62, 1]) expect(shotPower(holdForPower(p))).toBeCloseTo(p, 12);
    expect(holdForPower(1.4)).toBe(T);
    expect(holdForPower(-1)).toBe(0);
  });

  it('Hoop Hustle and Hoop Clash use the same sweep as the Hub (src/hubplay/runtime.ts CHARGE_MS = SHOT_SWEEP_MS)', () => {
    expect(CLASH_CHARGE_MS).toBe(T);
    expect(HUSTLE.chargeMs).toBe(T);
  });
});
