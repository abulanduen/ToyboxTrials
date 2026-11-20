/**
 * Pipwick's welcome tour of the Hub, as pure data and a small state machine (no DOM, no three.js;
 * unit tested). src/game/welcome.ts drives it from the frame loop and the UI.
 *
 * Each stop has a spot for Pipwick to land on, a camera position and the point it looks at. Between
 * stops Pipwick flies along an arc and the camera glides along a raised arc of its own (high above
 * the table, so it never sweeps through the player's toy), then holds while she talks. The player
 * moves on with Next (or skips the lot); nothing advances on a timer while she is talking.
 */
import { JUKEBOX, PAVILION, PIPWICK_HOME, SCOREBOARD, SHOP, TV, WORKSHOP, frontOf } from '../scene/layout';
import { BRIDGE_X } from './hubBounds';
import { TOUR_LINES, type TourStopId } from './voiceLines';

export type Vec3 = readonly [number, number, number];

export interface TourStop {
  id: TourStopId;
  /** Where Pipwick lands (table top, y from `y`). */
  mascot: { x: number; z: number; y?: number };
  /** Camera position and look-at point while she talks there. */
  cam: Vec3;
  look: Vec3;
}

const front = (o: { x: number; z: number; rot: number }, d: number, side = 0) => {
  const p = frontOf(o.x, o.z, o.rot, d);
  return { x: p.x + Math.cos(o.rot) * side, z: p.z - Math.sin(o.rot) * side };
};

/** The tour, in order: the plaza's sights, across the bridge to the trials, back for the shops. */
export const TOUR_STOPS: TourStop[] = [
  { id: 'hello', mascot: { x: 2.6, z: 16.5 }, cam: [-3.5, 5.5, 29], look: [1.8, 2.6, 16.5] },
  {
    id: 'scoreboard',
    mascot: { x: (SCOREBOARD.x + TV.x) / 2 + 1, z: SCOREBOARD.z + 6 },
    cam: [-2, 7.5, 7],
    look: [-6.5, 5.5, SCOREBOARD.z],
  },
  { id: 'pavilion', mascot: front(PAVILION, PAVILION.d / 2 + 3.2, -3), cam: [12, 8.5, 6], look: [PAVILION.x - 3, 5, PAVILION.z] },
  { id: 'trials', mascot: { x: BRIDGE_X + 3, z: -113 }, cam: [BRIDGE_X - 2, 38, -88], look: [BRIDGE_X + 10, 0, -132] },
  { id: 'jukebox', mascot: front(JUKEBOX, JUKEBOX.d / 2 + 2.6, -4.2), cam: [JUKEBOX.x - 2, 8, JUKEBOX.z + 22], look: [JUKEBOX.x - 1.5, 3.4, JUKEBOX.z] },
  { id: 'workshop', mascot: front(WORKSHOP, WORKSHOP.d / 2 + 2.6, 3.6), cam: [-16, 8, 9], look: [WORKSHOP.x + 2, 4, WORKSHOP.z + 1] },
  { id: 'shop', mascot: front(SHOP, SHOP.d / 2 + 6.2, -3.8), cam: [-21, 8, 25], look: [SHOP.x + 4, 4, SHOP.z + 1] },
  { id: 'online', mascot: { x: -6.5, z: 6.5 }, cam: [2, 26, 40], look: [-2, 0, -2] },
  { id: 'bye', mascot: { x: PIPWICK_HOME.x, z: PIPWICK_HOME.z }, cam: [-2.5, 6, 30], look: [5.5, 2.6, 15] },
];

export type TourPhase = 'fly' | 'talk' | 'done';
export interface TourState {
  stop: number;
  phase: TourPhase;
  /** Seconds into the current phase. */
  t: number;
}

export const tourStart = (): TourState => ({ stop: 0, phase: 'fly', t: 0 });

/** Where Pipwick takes off from for a stop: the previous stop, or home for the first. */
export function flightFrom(stop: number) {
  return stop === 0 ? { x: PIPWICK_HOME.x, z: PIPWICK_HOME.z } : TOUR_STOPS[stop - 1].mascot;
}

/** Flight time to a stop (s): longer hops take longer, within limits. */
export function flyTime(stop: number): number {
  const a = flightFrom(stop);
  const b = TOUR_STOPS[stop].mascot;
  return Math.min(3.2, Math.max(1.1, 0.9 + Math.hypot(b.x - a.x, b.z - a.z) / 60));
}

/** Advance time: a finished flight turns into talking. */
export function tourStep(s: TourState, dt: number): TourState {
  if (s.phase === 'done') return s;
  const t = s.t + dt;
  if (s.phase === 'fly' && t >= flyTime(s.stop)) return { stop: s.stop, phase: 'talk', t: 0 };
  return { ...s, t };
}

/** Next: cut a flight short, or move on from a stop (the last stop ends the tour). */
export function tourNext(s: TourState): TourState {
  if (s.phase === 'fly') return { stop: s.stop, phase: 'talk', t: 0 };
  if (s.phase === 'talk') return s.stop + 1 < TOUR_STOPS.length ? { stop: s.stop + 1, phase: 'fly', t: 0 } : { stop: s.stop, phase: 'done', t: 0 };
  return s;
}

export const tourSkip = (s: TourState): TourState => ({ stop: s.stop, phase: 'done', t: 0 });

/** Smooth 0 → 1. */
export const ease = (k: number) => {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
};

/** A point on a raised arc from a to b: eased along the chord, lifted by `lift` at the middle. */
export function arcPoint(a: Vec3, b: Vec3, k: number, lift: number): [number, number, number] {
  const e = ease(k);
  const up = Math.sin(Math.PI * Math.min(1, Math.max(0, k))) * lift;
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e + up, a[2] + (b[2] - a[2]) * e];
}

/** How high the camera rises when gliding between two positions (cm): long glides go well above the table. */
export const cameraLift = (a: Vec3, b: Vec3) => Math.min(34, Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.28);

/** Pipwick's position during a flight (k = 0 → 1), from the previous spot to the stop's. */
export function mascotFlight(stop: number, k: number): [number, number, number] {
  const a = flightFrom(stop);
  const b = TOUR_STOPS[stop].mascot;
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  return arcPoint([a.x, 0, a.z], [b.x, b.y ?? 0, b.z], k, Math.min(22, 3 + d * 0.22));
}

export const TOUR_TEXT = (stop: number) => TOUR_LINES[TOUR_STOPS[stop].id];
