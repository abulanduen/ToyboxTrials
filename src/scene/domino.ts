/**
 * Domino geometry. A domino is a thick tile with a 1 : 2 face: pips belong on the two big faces
 * only, and the four thin edges are plain ivory.
 *
 * One texture serves the whole tile so every domino in the hub stays a single instanced draw:
 * the left half of the texture is the pip face, the right half is plain ivory. The box's ±Z faces
 * are mapped onto the pip half and its four edge faces onto a patch of the plain half.
 * (Pure module: no DOM, so the mapping can be unit tested.)
 */
import * as THREE from 'three';

/** Width × height × thickness in cm. Scale uniformly (never per axis) for bigger dominoes. */
export const DOMINO = { w: 2.4, h: 4.8, t: 0.75 };

/** UV rectangles in the shared domino texture: [u0, v0, u1, v1]. */
export const DOMINO_UV = {
  face: [0.004, 0, 0.496, 1] as const,
  plain: [0.7, 0.4, 0.8, 0.6] as const,
};

/** BoxGeometry face order: +x, -x, +y, -y, +z, -z (four vertices each). */
const FACE_PZ = 4;

export function dominoGeometry() {
  const g = new THREE.BoxGeometry(DOMINO.w, DOMINO.h, DOMINO.t);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const big = Math.floor(i / 4) >= FACE_PZ;
    const [u0, v0, u1, v1] = big ? DOMINO_UV.face : DOMINO_UV.plain;
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return g;
}

export interface DominoSpec {
  x: number;
  z: number;
  /** Turn about the vertical axis (three.js rotation.y). */
  rot: number;
  /** 0 = standing, π/2 = lying flat face-up */
  tilt?: number;
  /** Centre height; defaults to resting on the table. */
  y?: number;
  /** Turn in the plane of the face (π/2 lays a standing domino on its long edge). */
  roll?: number;
  /** Uniform scale. */
  s?: number;
}

/** Centre height of a domino resting on the table for a given tilt/roll/scale. */
export function dominoRestY(d: DominoSpec) {
  const s = d.s ?? 1;
  const tilt = d.tilt ?? 0;
  const long = Math.abs(Math.cos(d.roll ?? 0)) > 0.5 ? DOMINO.h : DOMINO.w;
  if (tilt > 1) return (DOMINO.t / 2) * s;
  return ((long / 2) * Math.cos(tilt) + (DOMINO.t / 2) * Math.sin(tilt)) * s;
}
