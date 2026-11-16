/**
 * Mutable animation state shared between a controller (player input, AI, network replica…)
 * and the toy's procedural animation. Plain object — written every frame, never React state.
 * Keeping this separate from the controller is what lets the same toy be driven by
 * a remote player later.
 */
export interface ToyAnim {
  /** Horizontal speed (units/s). */
  speed: number;
  /** Reference "full run" speed used to normalise gait. */
  maxSpeed: number;
  /** Signed yaw rate (rad/s) — drives lean into turns. */
  turnRate: number;
  grounded: boolean;
  /** Vertical velocity (units/s). */
  vy: number;
  /** Gait phase in radians (advanced by distance travelled). */
  stepPhase: number;
  /** Seconds since last landing, and how hard it was (0..2). */
  landT: number;
  landImpact: number;
  /** Seconds since an interaction began, or -1. */
  interactT: number;
  /** Seconds since elimination began, or -1. */
  elimT: number;
  /** Seconds since respawn, or -1. */
  respawnT: number;
  /** Speed boost active (wind-up key bonus). */
  boosted: boolean;
}

export function createToyAnim(): ToyAnim {
  return {
    speed: 0,
    maxSpeed: 14,
    turnRate: 0,
    grounded: true,
    vy: 0,
    stepPhase: 0,
    landT: 10,
    landImpact: 0,
    interactT: -1,
    elimT: -1,
    respawnT: -1,
    boosted: false,
  };
}

export const INTERACT_DURATION = 0.75;
export const ELIM_DURATION = 2.4;
export const RESPAWN_DURATION = 0.6;
