/**
 * Toy-kit geometry builder for the lit toy layer (gate surroundings, sign boards).
 *
 * Primitives are placed in nested local frames, flat-coloured through a vertex colour and sorted
 * into a few layers; `build()` merges each layer into one BufferGeometry, so a whole district of
 * props costs one draw call per layer. Unlike the room's baked builder (room/bake.ts) normals are
 * kept: these props are lit in real time and cast shadows. Pure three.js, no DOM.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * - `solid`: the main painted pieces (cast shadows);
 * - `detail`: small trim that is skipped on the Low tier;
 * - `glow`: unlit lamps, embers and sparks (vertex colour ≤ 1, so they never trip the bloom);
 * - `decal`: pieces textured from the hub sign atlas (UVs kept), tinted by the vertex colour.
 */
export type KitLayer = 'solid' | 'detail' | 'glow' | 'decal';
export const KIT_LAYERS: KitLayer[] = ['solid', 'detail', 'glow', 'decal'];

export interface Xf {
  rx?: number;
  ry?: number;
  rz?: number;
  /** Non-uniform scale (fine for plain painted parts; never used on textured dominoes). */
  s?: [number, number, number];
}

const ONE = new THREE.Vector3(1, 1, 1);

export class Kit {
  private parts: Record<KitLayer, THREE.BufferGeometry[]> = { solid: [], detail: [], glow: [], decal: [] };
  private m = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  private tmp = new THREE.Matrix4();
  /** Layer used by the primitive helpers until changed. */
  layer: KitLayer = 'solid';

  /** Enter a local frame (position + yaw, three.js rotation.y convention). */
  push(x: number, y: number, z: number, ry = 0) {
    this.stack.push(this.m.clone());
    this.m.multiply(this.tmp.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), ONE));
    return this;
  }
  pop() {
    this.m.copy(this.stack.pop()!);
    return this;
  }
  /** Run `fn` with `layer` as the current layer. */
  with(layer: KitLayer, fn: () => void) {
    const prev = this.layer;
    this.layer = layer;
    fn();
    this.layer = prev;
    return this;
  }

  /** Add any geometry, local to the current frame. `uvRect` remaps its UVs into an atlas cell. */
  add(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, xf: Xf = {}, uvRect?: readonly [number, number, number, number]) {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(xf.rx ?? 0, xf.ry ?? 0, xf.rz ?? 0, 'YXZ')),
      xf.s ? new THREE.Vector3(...xf.s) : ONE,
    );
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.m, local));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (uvRect) {
      const uv = g.attributes.uv;
      const [u0, v0, u1, v1] = uvRect;
      for (let i = 0; i < n; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts[this.layer].push(g);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, xf: Xf = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, xf);
  }
  /** Bevelled block (painted wood). */
  block(w: number, h: number, d: number, x: number, y: number, z: number, color: string, xf: Xf = {}, radius = Math.min(w, h, d) * 0.12) {
    return this.add(new RoundedBoxGeometry(w, h, d, 1, radius), color, x, y, z, xf);
  }
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: string, seg = 12, xf: Xf = {}, open = false) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), color, x, y, z, xf);
  }
  cone(r: number, h: number, x: number, y: number, z: number, color: string, seg = 10, xf: Xf = {}) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y, z, xf);
  }
  ball(r: number, x: number, y: number, z: number, color: string, seg = 10, xf: Xf = {}) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7))), color, x, y, z, xf);
  }
  torus(r: number, tube: number, x: number, y: number, z: number, color: string, xf: Xf = {}, arc = Math.PI * 2, seg = 18) {
    return this.add(new THREE.TorusGeometry(r, tube, 6, seg, arc), color, x, y, z, xf);
  }
  /** Flat disc lying on the ground (or a pie slice with `arc`). */
  disc(r: number, x: number, y: number, z: number, color: string, xf: Xf = { rx: -Math.PI / 2 }, seg = 20, start = 0, arc = Math.PI * 2) {
    return this.add(new THREE.CircleGeometry(r, seg, start, arc), color, x, y, z, xf);
  }
  ring(r0: number, r1: number, x: number, y: number, z: number, color: string, seg = 28) {
    return this.add(new THREE.RingGeometry(r0, r1, seg), color, x, y, z, { rx: -Math.PI / 2 });
  }
  /** Rod between two local points. */
  rod(a: [number, number, number], b: [number, number, number], r: number, color: string, seg = 6) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const mid = va.add(vb).multiplyScalar(0.5);
    return this.add(new THREE.CylinderGeometry(r, r, len, seg, 1), color, mid.x, mid.y, mid.z, { rx: e.x, ry: e.y, rz: e.z });
  }
  /** Textured quad facing local +z, UVs from an atlas cell. */
  quad(w: number, h: number, x: number, y: number, z: number, uvRect: readonly [number, number, number, number], color = '#ffffff', xf: Xf = {}) {
    return this.add(new THREE.PlaneGeometry(w, h), color, x, y, z, xf, uvRect);
  }

  /** Current local → world transform. */
  get matrix() {
    return this.m;
  }

  /** Number of primitives queued per layer (for tests and budgets). */
  counts() {
    return Object.fromEntries(KIT_LAYERS.map((l) => [l, this.parts[l].length])) as Record<KitLayer, number>;
  }

  /** Merge each non-empty layer into one geometry. */
  build(): Partial<Record<KitLayer, THREE.BufferGeometry>> {
    const out: Partial<Record<KitLayer, THREE.BufferGeometry>> = {};
    for (const l of KIT_LAYERS) {
      if (!this.parts[l].length) continue;
      const g = mergeGeometries(this.parts[l], false)!;
      for (const p of this.parts[l]) p.dispose();
      this.parts[l] = [];
      g.computeBoundingSphere();
      g.computeBoundingBox();
      out[l] = g;
    }
    return out;
  }
}
