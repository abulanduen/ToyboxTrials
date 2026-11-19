/**
 * Vertex normals that are zero length turn into NaN in the lighting shader (normalize(0)). One NaN
 * pixel is enough: bloom blurs it across the frame as a flash or a black screen. That only happens
 * when a pixel lands on the bad vertex, so it shows up as rare "blinking" while the camera moves.
 */
import type * as THREE from 'three';

const MIN = 1e-4;

/** Replace zero-length normals in place: the normal of another vertex at the same spot, else the
 * face normal, else straight up. Returns how many were repaired. */
export function repairNormals(g: THREE.BufferGeometry): number {
  const n = g.attributes.normal as THREE.BufferAttribute | undefined;
  const p = g.attributes.position as THREE.BufferAttribute | undefined;
  if (!n || !p) return 0;
  const len = (i: number) => Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
  const bad: number[] = [];
  for (let i = 0; i < n.count; i++) if (!(len(i) >= MIN)) bad.push(i);
  if (!bad.length) return 0;
  const key = (i: number) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const good = new Map<string, number>();
  for (let i = 0; i < n.count; i++) if (len(i) >= MIN && !good.has(key(i))) good.set(key(i), i);
  const index = g.index;
  const corner = (i: number, k: number) => {
    // The vertices of the (first) triangle that uses vertex i.
    if (!index) return Math.floor(i / 3) * 3 + k;
    for (let t = 0; t < index.count; t += 3) for (let c = 0; c < 3; c++) if (index.getX(t + c) === i) return index.getX(t + k);
    return i;
  };
  for (const i of bad) {
    const same = good.get(key(i));
    if (same !== undefined) { n.setXYZ(i, n.getX(same), n.getY(same), n.getZ(same)); continue; }
    const [a, b, c] = [corner(i, 0), corner(i, 1), corner(i, 2)];
    const ux = p.getX(b) - p.getX(a), uy = p.getY(b) - p.getY(a), uz = p.getZ(b) - p.getZ(a);
    const vx = p.getX(c) - p.getX(a), vy = p.getY(c) - p.getY(a), vz = p.getZ(c) - p.getZ(a);
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const fl = Math.hypot(fx, fy, fz);
    if (fl > 1e-12) n.setXYZ(i, fx / fl, fy / fl, fz / fl);
    else n.setXYZ(i, 0, 1, 0);
  }
  n.needsUpdate = true;
  return bad.length;
}
