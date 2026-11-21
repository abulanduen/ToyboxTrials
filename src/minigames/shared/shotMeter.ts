/**
 * The shared basketball shot meter: the Hub ball, Hoop Hustle and Hoop Clash all use it.
 *
 * Holding the shoot button winds the power back and forth, like a toy's key being wound one way and
 * then the other: empty to full in one sweep, full back to empty in the next, and so on for as long
 * as the button is held (a ping-pong, or triangle wave). Letting go shoots at the power the meter
 * shows at that moment, so the timing of the release matters; holding on never parks the meter at
 * full. A cancel (X, the right mouse button, or sliding the finger off the shoot button) drops the
 * charge without a shot: see each game's input adapter.
 *
 * Pure and deterministic (plain arithmetic on a held time): the rules cores and the online server
 * use it at fixed 60 Hz steps, the Hub on its own clock. No DOM, no wall clock, no randomness.
 */

/** One sweep of the meter, empty to full (or full back to empty), in ms: the Hub's old full charge. */
export const SHOT_SWEEP_MS = 1100;

/**
 * Power 0..1 after the shoot button has been held for `heldMs`: rises over the first sweep exactly
 * as the old one-way charge did, then falls back over the next, and so on.
 */
export function shotPower(heldMs: number, sweepMs = SHOT_SWEEP_MS): number {
  if (!(heldMs > 0) || !(sweepMs > 0)) return 0;
  if (!Number.isFinite(heldMs)) return 0;
  const phase = heldMs % (2 * sweepMs);
  return phase <= sweepMs ? phase / sweepMs : 2 - phase / sweepMs;
}

/** Is the meter rising (true) or falling back (false) after `heldMs` held? */
export function shotRising(heldMs: number, sweepMs = SHOT_SWEEP_MS): boolean {
  if (!(heldMs > 0) || !(sweepMs > 0) || !Number.isFinite(heldMs)) return true;
  return heldMs % (2 * sweepMs) < sweepMs;
}

/** How long to hold for `power` on the first rise (what a bot plans; the first rise is the quickest). */
export function holdForPower(power: number, sweepMs = SHOT_SWEEP_MS): number {
  const p = Number.isFinite(power) ? Math.max(0, Math.min(1, power)) : 0;
  return p * sweepMs;
}
