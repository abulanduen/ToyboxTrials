/**
 * The Tournament Pavilion's geometry, built in code (pure three.js, no DOM): its hollow striped walls
 * with the arched doorway, and everything inside as one merged, vertex-coloured mesh (corner posts,
 * the trophy shelf, the winners' podium, the sign's frame and legs, and a string of bunting).
 * Everything is in Pavilion-local space (the Pavilion's group places and turns it). Sizes and the
 * solid parts' footprints: src/scene/layout.ts (PAVILION, PAVILION_WALL, PAVILION_PROPS).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../game/palette';
import { Kit } from './kit';
import { PAVILION, PAVILION_PROPS, PAVILION_WALL } from './layout';

const P = PALETTE;

/** The doorway's outline (arch) at half width `r` and arch top `top`, as points from bottom left round to bottom right. */
function archPath(path: THREE.Path, r: number, top: number) {
  path.lineTo(-r, top - r);
  path.absarc(0, top - r, r, Math.PI, 0, true);
  path.lineTo(r, 0);
}

/**
 * The four walls as one geometry, standing on y = 0 (the Pavilion scales it down in y to fold the
 * walls away). The front wall is an extruded outline that goes round the doorway; the stripes run
 * once across each face, as on the old solid box.
 */
export function pavilionWallGeometry(): THREE.BufferGeometry {
  const { w, d, h } = PAVILION;
  const { t, doorW, doorH } = PAVILION_WALL;
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-doorW / 2, 0);
  archPath(s, doorW / 2, doorH);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.lineTo(-w / 2, 0);
  const front = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 14 });
  front.translate(0, 0, d / 2 - t);
  const pos = front.attributes.position;
  const uv = front.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
  const parts: THREE.BufferGeometry[] = [front];
  const back = new THREE.BoxGeometry(w, h, t).toNonIndexed();
  back.translate(0, h / 2, -(d / 2 - t / 2));
  parts.push(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.BoxGeometry(t, h, d - 2 * t).toNonIndexed();
    side.translate(sx * (w / 2 - t / 2), h / 2, 0);
    parts.push(side);
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

/** The honey trim round the doorway, on the front face (a flat arch band). */
export function doorTrimGeometry(band = 0.35): THREE.BufferGeometry {
  const { doorW, doorH } = PAVILION_WALL;
  const r = doorW / 2;
  const R = r + band;
  const s = new THREE.Shape();
  s.moveTo(-R, 0);
  s.lineTo(-R, doorH - r);
  s.absarc(0, doorH - r, R, Math.PI, 0, true);
  s.lineTo(R, 0);
  s.lineTo(r, 0);
  s.lineTo(r, doorH - r);
  s.absarc(0, doorH - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  s.lineTo(-R, 0);
  return new THREE.ShapeGeometry(s, 14);
}

/** A flat pennant (both faces), pointing down from (0, 0). */
function pennant(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const a = [-0.42, 0, 0, 0.42, 0, 0, 0, -0.95, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, a[0], a[1], a[2], a[6], a[7], a[8], a[3], a[4], a[5]], 3));
  g.computeVertexNormals();
  return g;
}

/** A string of bunting between two local points, sagging in the middle. */
function bunting(k: Kit, a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const pts = curve.getPoints(10);
  for (let i = 0; i < pts.length - 1; i++) k.rod(pts[i].toArray() as [number, number, number], pts[i + 1].toArray() as [number, number, number], 0.035, P.cream, 4);
  const colors = [P.coral, P.honey, P.toyBlue, P.sage, P.cream];
  for (let i = 0; i < n; i++) {
    const p = curve.getPoint((i + 0.5) / n);
    const tan = curve.getTangent((i + 0.5) / n);
    k.add(pennant(), colors[i % colors.length], p.x, p.y, p.z, { ry: Math.atan2(-tan.z, tan.x) });
  }
}

/** A little trophy cup standing at (x, y, z). */
function cup(k: Kit, x: number, y: number, z: number, color: string, s = 1) {
  k.cyl(0.32 * s, 0.38 * s, 0.18 * s, x, y + 0.09 * s, z, P.woodDark, 10);
  k.cyl(0.07 * s, 0.16 * s, 0.4 * s, x, y + 0.38 * s, z, color, 8);
  k.cyl(0.36 * s, 0.12 * s, 0.5 * s, x, y + 0.83 * s, z, color, 12);
  for (const sx of [-1, 1]) k.torus(0.14 * s, 0.035 * s, x + sx * 0.36 * s, y + 0.86 * s, z, color, { rz: sx * 0.3 }, Math.PI * 2, 10);
}

/** A prize rosette, facing +z: frilled disc, centre button and two ribbon tails. */
export function rosette(k: Kit, x: number, y: number, z: number, s: number, ring: string, centre: string, tails: string) {
  for (const sx of [-1, 1]) k.box(0.16 * s, 0.55 * s, 0.03 * s, x + sx * 0.1 * s, y - 0.38 * s, z - 0.02 * s, tails, { rz: sx * 0.25 });
  k.cyl(0.3 * s, 0.3 * s, 0.05 * s, x, y, z, ring, 12, { rx: Math.PI / 2 });
  k.cyl(0.17 * s, 0.17 * s, 0.07 * s, x, y, z + 0.02 * s, centre, 10, { rx: Math.PI / 2 });
}

/**
 * Everything inside the Pavilion that is not the Curator (Greeters.tsx), the rug or the sign's
 * painted face (Buildings.tsx): one merged mesh.
 */
export function buildPavilionInterior(k: Kit) {
  const { w, d, h } = PAVILION;
  const { shelf, podium, sign } = PAVILION_PROPS;

  // corner posts (cardboard tubes) with brass knobs: they stay up when the walls fold down, and hold the bunting
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.cyl(0.42, 0.42, h, sx * (w / 2), h / 2, sz * (d / 2), P.cardboardDark, 12);
      k.ball(0.55, sx * (w / 2), h + 0.25, sz * (d / 2), P.honey, 12);
    }
  // one string along the back, over the sign (strings across the room swung through the camera's view).
  // Just inside the back wall: hung from the corner knobs at the wall's outer face, the pennants lay in
  // that face and flickered against the stripes when seen from outside.
  const bz = -d / 2 + PAVILION_WALL.t + 0.15; // between the wall (−4.5) and the sign's legs (−4.25)
  bunting(k, new THREE.Vector3(-w / 2 + 0.5, h + 0.05, bz), new THREE.Vector3(w / 2 - 0.5, h + 0.05, bz), 1.3, 13);

  // the trophy shelf against the back wall, left of the Curator
  {
    const { lx, lz, hx, hz, top } = shelf;
    k.box(hx * 2, top, 0.12, lx, top / 2, lz - hz + 0.06, P.woodDark); // back board
    for (const sx of [-1, 1]) k.box(0.16, top, hz * 2, lx + sx * (hx - 0.08), top / 2, lz, P.woodMid);
    for (const y of [0.1, 1.45, 2.85, top - 0.08]) k.box(hx * 2, 0.16, hz * 2, lx, y, lz, P.woodLight);
    cup(k, lx - 0.85, 0.18, lz + 0.05, P.honey, 1.05);
    cup(k, lx + 0.15, 0.18, lz + 0.05, P.steel, 0.9);
    k.block(0.6, 0.6, 0.6, lx + 0.95, 0.48, lz + 0.05, P.coral);
    cup(k, lx - 0.6, 1.53, lz + 0.05, P.woodMid, 0.85);
    rosette(k, lx + 0.5, 2.1, lz - hz + 0.14, 1.1, P.toyBlue, P.honey, P.toyBlue);
    cup(k, lx - 0.2, 2.93, lz + 0.05, P.honey, 1.2);
    k.ball(0.22, lx + 0.85, 3.17, lz + 0.05, P.roomSky, 10); // a glass marble, a prize of old
  }

  // the winners' podium: first in the middle (highest), pips on the fronts, the big cup on top
  for (const p of podium) {
    const color = p.place === 1 ? P.honey : p.place === 2 ? P.steel : P.coral;
    k.block(p.hx * 2, p.top, p.hz * 2, p.lx, p.top / 2, p.lz, color);
    for (let i = 0; i < p.place; i++) {
      const px = p.lx + (i - (p.place - 1) / 2) * 0.32;
      k.disc(0.11, px, p.top * 0.55, p.lz + p.hz + 0.005, P.cream, {}, 12);
    }
  }
  {
    const first = podium.find((p) => p.place === 1)!;
    cup(k, first.lx, first.top, first.lz, P.honey, 1.35);
  }

  // the sign: a painted board on two legs behind the Curator (its face is a separate textured quad)
  k.block(sign.w + 0.36, sign.h + 0.36, 0.2, 0, sign.y, sign.lz, P.woodDark);
  for (const sx of [-1, 1]) k.cyl(0.13, 0.15, sign.y + sign.h / 2, sx * sign.legX, (sign.y + sign.h / 2) / 2, sign.lz - 0.05, P.woodMid, 8);
  rosette(k, 0, sign.y + sign.h / 2 + 0.1, sign.lz + 0.14, 1.2, P.coral, P.honey, P.coral);
}
