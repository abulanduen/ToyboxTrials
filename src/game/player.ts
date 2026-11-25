import * as THREE from 'three';
import { HUB_SPAWN } from './hubMotion';
import type { HubLevel } from './hubBounds';

/** Read-only snapshot of the local player for props/UI (written by PlayerController). */
export const player = {
  pos: new THREE.Vector3(0, 0, 22),
  yaw: Math.PI,
  grounded: true,
  /** Horizontal speed (cm/s), for the online movement updates. */
  speed: 0,
  eliminated: false,
  /** Which level the toy is on: the tables, or the arcade on the floor under the spawn table. */
  level: 'table' as HubLevel,
};

export const SPAWN = { x: HUB_SPAWN.x, z: HUB_SPAWN.z, yaw: HUB_SPAWN.yaw };

/** Meshes that should stop the camera (big solid props). Registered via ref callbacks. */
export const cameraBlockers = new Set<THREE.Object3D>();
export function camBlock(o: THREE.Object3D | null) {
  if (o) cameraBlockers.add(o);
}
