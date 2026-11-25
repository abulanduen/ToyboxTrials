import { LEVEL_MAX_RISE } from './hubBounds';

/**
 * Hub movement tuning for the local contender (cm and seconds). Pure numbers, shared by
 * PlayerController and the online server, which uses them to reject impossible moves.
 */
export const HUB_MOTION = {
  /** Collision radius of the toy. */
  radius: 0.85,
  walk: 9,
  run: 14,
  /** Speed multiplier while the wind-up key boost is active. */
  boost: 1.45,
  jumpV: 16.5,
  gravity: 56,
  turnRate: 13,
} as const;

/** Fastest legitimate horizontal speed in the hub: running with the boost (cm/s). */
export const HUB_MAX_SPEED = HUB_MOTION.run * HUB_MOTION.boost;

/** Where a contender (re)spawns in the hub. */
export const HUB_SPAWN = { x: 0, z: 22, yaw: Math.PI } as const;

/**
 * Highest a contender's feet can legitimately be above the table top (cm): the tallest thing you
 * can stand on is about 16 cm, plus a jump. Used by the online server's position clamp (the
 * arcade's is LEVEL_MAX_RISE.floor above the room floor).
 */
export const HUB_MAX_Y = LEVEL_MAX_RISE.table;
