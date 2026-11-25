/**
 * The plaza fountain's geometry, built in code (pure three.js, no DOM): a round basin of stone blocks
 * and a two-tier cream resin fountain (a fluted pedestal, two scalloped bowls and a finial), like a
 * dollhouse garden ornament. Everything is in fountain-local space (the Fountain's group places it).
 * The footprint, rim height and pool level come from FOUNTAIN in src/scene/layout.ts; the collider is
 * still the basin alone (the tiers stand over the pool as the old spool did).
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../game/palette';
import { FOUNTAIN } from './layout';

/** The pool's surface. */
export const POOL_Y = FOUNTAIN.top - 0.25;
/** Inner face of the basin's blocks. */
const BASIN_IN = FOUNTAIN.r - 0.85;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The bowls: scallop count, the y band each covers, and where the scallops start and peak (radius). */
const BOWLS = [
  { lobes: 8, y0: 4.6, y1: 6.0, r0: 1.6, r1: 2.95, waterY: 5.5, waterR: 2.45 },
  { lobes: 6, y0: 6.7, y1: 7.7, r0: 1.1, r1: 1.95, waterY: 7.36, waterR: 1.7 },
] as const;
export const BOWL_WATER = BOWLS.map((b) => ({ y: b.waterY, r: b.waterR }));

/**
 * The tiers' cross-section (radius, height), walked with the solid on the left so the lathe faces
 * outwards: the foot, the fluted bulb, the stem, the lower bowl out and over its lip and down to its
 * water, the middle stem, the upper bowl the same way, then the finial up to its knob.
 */
const PROFILE: [number, number][] = [
  [0, POOL_Y - 0.05], [1.7, POOL_Y - 0.05], [1.85, 1.25], [1.9, 1.45], [1.85, 1.65], [1.7, 1.8], [1.45, 1.9], [1.3, 2.0],
  [1.25, 2.1], [1.45, 2.25], [1.6, 2.5], [1.62, 2.8], [1.55, 3.1], [1.38, 3.4], [1.12, 3.7], [0.9, 3.95],
  [0.95, 4.05], [0.95, 4.25], [0.7, 4.35], [0.6, 4.5],
  [0.75, 4.75], [1.3, 4.95], [2.0, 5.15], [2.6, 5.35], [2.95, 5.55], [3.08, 5.72], [3.05, 5.85], [2.9, 5.88], [2.8, 5.8],
  [2.6, 5.62], [2.2, 5.5], [1.8, 5.43], [0.85, 5.4],
  [0.85, 5.5], [0.95, 5.8], [0.9, 6.15], [0.7, 6.4], [0.55, 6.6],
  [0.7, 6.75], [1.2, 6.95], [1.7, 7.15], [1.98, 7.35], [2.06, 7.48], [2.0, 7.58], [1.88, 7.56],
  [1.7, 7.4], [1.3, 7.3], [0.45, 7.27],
  [0.4, 7.35], [0.35, 7.6], [0.38, 7.85], [0.55, 7.95], [0.66, 8.15], [0.62, 8.35], [0.45, 8.5], [0.28, 8.6],
  [0.3, 8.7], [0.27, 8.82], [0.15, 8.92], [0, 8.95],
];
/** Height of the finial's knob: the top of the fountain. */
export const FOUNTAIN_TOP = PROFILE[PROFILE.length - 1][1];

/** Fluted bands (vertical grooves): the pedestal's bulb and the finial's bulb. */
const FLUTES = [
  { y0: 2.15, y1: 3.9, n: 12, depth: 0.05 },
  { y0: 7.9, y1: 8.5, n: 8, depth: 0.06 },
] as const;

/** The resin tiers: one smooth lathe, with scalloped bowl lips and fluted bulbs. */
export function fountainTiersGeometry(): THREE.BufferGeometry {
  // Add in-between points so the scallops and flutes bend smoothly along the profile too.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, y0] = PROFILE[i];
    const [r1, y1] = PROFILE[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(r1 - r0, y1 - y0) / 0.4));
    for (let s = 0; s < steps; s++) pts.push(new THREE.Vector2(r0 + ((r1 - r0) * s) / steps, y0 + ((y1 - y0) * s) / steps));
  }
  const last = PROFILE[PROFILE.length - 1];
  pts.push(new THREE.Vector2(last[0], last[1]));

  let g: THREE.BufferGeometry = new THREE.LatheGeometry(pts, 48);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const a = Math.atan2(z, x);
    let k = 1;
    let dy = 0;
    for (const b of BOWLS) {
      if (y < b.y0 || y > b.y1) continue;
      const w = smooth(b.r0, b.r1, r);
      k *= 1 + 0.07 * Math.cos(b.lobes * a) * w;
      dy += 0.09 * Math.cos(b.lobes * a) * w;
    }
    for (const f of FLUTES) {
      const w = smooth(f.y0, f.y0 + 0.15, y) * (1 - smooth(f.y1 - 0.15, f.y1, y));
      k *= 1 - f.depth * w * (0.5 + 0.5 * Math.cos(f.n * a));
    }
    pos.setXYZ(i, x * k, y + dy, z * k);
  }
  // Weld the lathe's seam before the normals so it doesn't show as a crease.
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}

/** Where water drips from: the tip of every scallop, and the water it falls into. */
export function dripPoints() {
  const out: { x: number; z: number; y: number; floor: number }[] = [];
  BOWLS.forEach((b, i) => {
    const rimR = i === 0 ? 3.08 * 1.07 : 2.06 * 1.07;
    const rimY = (i === 0 ? 5.72 : 7.48) + 0.09;
    const floor = i === 0 ? POOL_Y : BOWLS[0].waterY;
    for (let l = 0; l < b.lobes; l++) {
      const a = (l / b.lobes) * Math.PI * 2;
      out.push({ x: Math.cos(a) * rimR, z: Math.sin(a) * rimR, y: rimY, floor });
    }
  });
  return out;
}

/**
 * The basin: two staggered courses of bevelled stone blocks (vertex-coloured, each a touch lighter or
 * darker), with mortar showing in the joints. Outer face at FOUNTAIN.r, top at FOUNTAIN.top.
 */
export function fountainBasinGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stone = new THREE.Color(PALETTE.fountainStone);
  const mortar = new THREE.Color(PALETTE.fountainMortar);
  const paint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  };

  const courses = 2;
  const perCourse = 12;
  const ch = FOUNTAIN.top / courses;
  const bevel = 0.07;
  const gap = 0.05; // half the joint, each side
  const rIn = BASIN_IN + bevel;
  const rOut = FOUNTAIN.r - bevel;
  for (let c = 0; c < courses; c++) {
    for (let i = 0; i < perCourse; i++) {
      const a0 = ((i + c * 0.5) / perCourse) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / perCourse;
      const s = new THREE.Shape();
      const gi = (gap + bevel) / rIn;
      const go = (gap + bevel) / rOut;
      s.moveTo(Math.cos(a0 + gi) * rIn, Math.sin(a0 + gi) * rIn);
      s.absarc(0, 0, rOut, a0 + go, a1 - go, false);
      s.absarc(0, 0, rIn, a1 - gi, a0 + gi, true);
      const depth = ch - 2 * bevel - 2 * gap;
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 5 });
      // extruded along +z: stand it up (shape y → -z) and lift it onto its course
      g.rotateX(-Math.PI / 2);
      g.translate(0, c * ch + gap + bevel, 0);
      const shade = 1 + 0.07 * Math.sin(i * 12.9898 + c * 78.233) * Math.cos(i * 4.1 + c);
      paint(g, stone.clone().multiplyScalar(shade));
      parts.push(g.toNonIndexed());
    }
  }
  // Mortar behind the joints: the outer and inner faces and the top, set back a little.
  const outer = new THREE.CylinderGeometry(FOUNTAIN.r - 0.12, FOUNTAIN.r - 0.12, FOUNTAIN.top - 0.06, 36, 1, true);
  outer.translate(0, FOUNTAIN.top / 2, 0);
  const inner = new THREE.CylinderGeometry(BASIN_IN + 0.12, BASIN_IN + 0.12, FOUNTAIN.top - 0.06, 36, 1, true);
  inner.scale(-1, 1, 1); // mirrored so its faces turn inwards, towards the pool…
  const n = inner.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), n.getY(i), -n.getZ(i)); // …and its normals with them
  inner.translate(0, FOUNTAIN.top / 2, 0);
  const top = new THREE.RingGeometry(BASIN_IN + 0.12, FOUNTAIN.r - 0.12, 36);
  top.rotateX(-Math.PI / 2);
  top.translate(0, FOUNTAIN.top - 0.08, 0);
  for (const g of [outer, inner, top]) parts.push(paint(g, mortar).toNonIndexed());
  return mergeGeometries(parts, false)!;
}

/** Radius of the pool's water disc: tucked under the blocks so no edge shows. */
export const POOL_R = BASIN_IN + 0.08;
