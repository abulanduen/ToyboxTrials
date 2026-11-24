/**
 * Seeing inside the Tournament Pavilion. While the local toy is inside (or in the doorway) the gift
 * box's lid lifts off and its walls fold down to a low rim, so the third-person camera looks in over
 * them instead of being trapped behind a wall; the camera also comes in a little closer
 * (src/character/PlayerController.tsx). A plain object, stepped by the player controller each frame
 * and read by the Pavilion (src/scene/Buildings.tsx) and the Curator (src/scene/Greeters.tsx).
 */
import { insidePavilion } from './layout';

export const pavilionView = {
  /** The toy is inside the Pavilion (with a little hysteresis at the door). */
  inside: false,
  /** 0 = walls up and lid on, 1 = lid off and walls down (eased toward `inside`). */
  cut: 0,
};

/** Seconds for the lid to come off (or go back on). */
const CUT_TIME = 0.45;

/** Advance the view: `active` is false off the Hub (menu, Workshop), where the box stays closed. */
export function stepPavilionView(x: number, z: number, active: boolean, dt: number) {
  const v = pavilionView;
  // in once the toy's centre is through the doorway's outer face; out once it is clear of it
  v.inside = active && (v.inside ? insidePavilion(x, z, 0.6) : insidePavilion(x, z, -0.1));
  const step = dt / CUT_TIME;
  v.cut = v.inside ? Math.min(1, v.cut + step) : Math.max(0, v.cut - step);
}

/** Smoothstep of the cut, for the animation. */
export const pavilionCutEased = () => {
  const k = pavilionView.cut;
  return k * k * (3 - 2 * k);
};
