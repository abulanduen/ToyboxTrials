/**
 * Spellbox Showdown camera framing. The ring fills the screen between the HUD bands instead of
 * sitting small in the middle; on big rings (more than two players) the camera frames a window
 * around the local toy, sliding toward the centre so the nearest edge stays in view. Spectators
 * and the draft see the whole ring.
 */
import { ARENA_CAMERA_DIR, arenaFov, arenaSafeBox, circlePoints, fitArenaDistance } from '../shared/arenaCamera';

/** Largest ground half-extent framed around the local toy while it is alive (cm). */
export const VIEW_WINDOW = 19;
/** Extra ground beyond the ring edge: the rim, and toys standing right at the edge. */
export const RING_PAD = 1.6;

export const CAMERA_DIR = ARENA_CAMERA_DIR;
export const fovFor = arenaFov;
export const safeBox = arenaSafeBox;

/** Smallest camera distance at which a ground circle of radius `half` fits inside the safe box. */
export function fitDistance(half: number, aspect: number): number {
  return fitArenaDistance(circlePoints(half), aspect);
}

/**
 * What to frame: a focus point on the ground and the half-extent around it.
 * `player` is the local toy while it is alive and fighting, otherwise null (spectating / draft).
 */
export function framing(radius: number, player: { x: number; z: number } | null) {
  const whole = radius + RING_PAD;
  if (!player || whole <= VIEW_WINDOW) return { x: 0, z: 0, half: whole };
  // Slide the window from the toy towards the centre just enough to keep the ring edge near the
  // toy on screen: at the edge the window's far side reaches the rim.
  const k = Math.max(0, 1 - VIEW_WINDOW / whole);
  return { x: player.x * k, z: player.z * k, half: VIEW_WINDOW };
}
