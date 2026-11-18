/**
 * Top-down arena framing shared by the duel minigames (Spellbox Showdown, Blink Duel): find the
 * closest camera distance at which a set of ground points fits inside a screen-space safe box
 * (clear of the HUD bands). The camera looks along a fixed direction at the focus point, so the
 * result depends only on the point layout relative to the focus, the aspect and the FOV — callers
 * cache it by those.
 */
import * as THREE from 'three';

/** Camera direction: up and towards +z (height : depth = 1 : 0.52), as the duel arenas always used. */
export const ARENA_CAMERA_DIR = new THREE.Vector3(0, 1, 0.52).normalize();

export function arenaFov(aspect: number) {
  return aspect < 1 ? 50 + (1 - aspect) * 40 : 50;
}

export interface SafeBox { left: number; right: number; bottom: number; top: number }

/** NDC box the arena must fit in: clear of the top banner and the bottom action buttons. */
export function arenaSafeBox(aspect: number): SafeBox {
  return aspect < 1 ? { left: -0.94, right: 0.94, bottom: -0.6, top: 0.7 } : { left: -0.9, right: 0.9, bottom: -0.72, top: 0.74 };
}

const scratch = new THREE.PerspectiveCamera();
const pt = new THREE.Vector3();

/** Smallest distance along ARENA_CAMERA_DIR from the focus (0,0,0) at which every ground point fits. */
export function fitArenaDistance(points: readonly (readonly [number, number])[], aspect: number, box = arenaSafeBox(aspect)): number {
  scratch.fov = arenaFov(aspect);
  scratch.aspect = aspect;
  scratch.near = 0.5;
  scratch.far = 2000;
  scratch.updateProjectionMatrix();
  const fits = (d: number) => {
    scratch.position.copy(ARENA_CAMERA_DIR).multiplyScalar(d);
    scratch.lookAt(0, 0, 0);
    scratch.updateMatrixWorld();
    for (const [x, z] of points) {
      pt.set(x, 0, z).project(scratch);
      if (pt.x < box.left || pt.x > box.right || pt.y < box.bottom || pt.y > box.top || pt.z > 1) return false;
    }
    return true;
  };
  let lo = 2, hi = 600;
  for (let k = 0; k < 28; k++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Points on a ground circle (slightly padded so the polygon never undershoots the true circle). */
export function circlePoints(radius: number, n = 64): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * radius * 1.003, Math.sin(a) * radius * 1.003] as [number, number];
  });
}

/** Corners and edge midpoints of a ground square of half-size `half`. */
export function squarePoints(half: number): [number, number][] {
  const out: [number, number][] = [];
  for (const x of [-half, 0, half]) for (const z of [-half, 0, half]) if (x || z) out.push([x, z]);
  return out;
}
