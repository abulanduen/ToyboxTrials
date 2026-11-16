import * as THREE from 'three';

/** Read-only snapshot of the local player for props/UI (written by PlayerController). */
export const player = {
  pos: new THREE.Vector3(0, 0, 22),
  yaw: Math.PI,
  grounded: true,
  eliminated: false,
};

export const SPAWN = { x: 0, z: 22, yaw: Math.PI };

/** Meshes that should stop the camera (big solid props). Registered via ref callbacks. */
export const cameraBlockers = new Set<THREE.Object3D>();
export function camBlock(o: THREE.Object3D | null) {
  if (o) cameraBlockers.add(o);
}
