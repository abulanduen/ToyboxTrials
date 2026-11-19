/**
 * Room lighting model + geometry builder for the giant room.
 *
 * The room layer is static, so its lighting is "baked" on the CPU into vertex colours when the
 * geometry is built: sky light from the window, direct sun where a vertex sits inside the sun
 * beam, warm bounce off the sunlit table, a hemisphere ambient and corner darkening. The result
 * renders with unlit MeshBasicMaterial (cheaper than any lit material, identical on every tier),
 * and whole groups of furniture merge into one draw call.
 *
 * The same constants (SUN_DIR, WINDOW) drive the real-time sun that lights the table and toys,
 * the light shafts and the window glow, so everything agrees on where the light comes from.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROOM } from '../../game/palette';
import { FLOOR_Y, TABLE, TABLES, TABLES_BOX } from '../layout';

/** Room shell extents (cm). Table top is y = 0, so the floor is at FLOOR_Y (negative). */
export const SHELL = { minX: -250, maxX: 300, minZ: -185, maxZ: 260, floorY: FLOOR_Y, ceilY: 185 };

/**
 * The sunlit window in the back (−z) wall. `zIn` is the room-side face of the wall, `zOut` the
 * garden side: the wall is thick, so the opening has real reveals that also shape the sun beam.
 */
export const WINDOW = {
  x0: -40,
  x1: 92,
  y0: 12,
  y1: 145,
  zIn: SHELL.minZ,
  zOut: SHELL.minZ - 14,
  /** Horizontal glazing bar: its shadow falls on the bare table behind the village. */
  transomY: 88,
  /** Vertical glazing bar. */
  mullionX: 26,
  bar: 3.2,
  frame: 5,
};

/**
 * Direction the sunlight travels (late afternoon, ~31° above the horizon, coming in through the
 * back window and raking across the table toward the camera's usual side).
 */
export const SUN_DIR = new THREE.Vector3(-0.184, -0.515, 0.837).normalize();

/**
 * Fixed sun + shadow frustum for the real-time sun (PlayroomScene). The light shines along SUN_DIR
 * (through the window in the back wall); its orthographic shadow camera is fitted once to both
 * table tops (the spawn table, the gates table and the bridge between them) and everything up to
 * 50 cm above them, so shadow texels never move and nothing swims as the player walks. The window
 * wall lies inside the same frustum (further up the rays), so it shapes the sun patch for real.
 * Returns the light's position and target and the shadow camera's left/right/bottom/top/near/far.
 */
export function sunRig() {
  const T = TABLES_BOX;
  const target = new THREE.Vector3((T.minX + T.maxX) / 2, 0, (T.minZ + T.maxZ) / 2);
  const position = target.clone().addScaledVector(SUN_DIR, -330);
  const view = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0)).setPosition(position).invert();
  const box = { l: Infinity, r: -Infinity, b: Infinity, t: -Infinity, far: 0 };
  const p = new THREE.Vector3();
  for (const tb of TABLES)
    for (const x of [tb.minX - 2, tb.maxX + 2])
      for (const z of [tb.minZ - 2, tb.maxZ + 2])
        for (const y of [-TABLE.thickness, 50]) {
          p.set(x, y, z).applyMatrix4(view);
          box.l = Math.min(box.l, p.x);
          box.r = Math.max(box.r, p.x);
          box.b = Math.min(box.b, p.y);
          box.t = Math.max(box.t, p.y);
          box.far = Math.max(box.far, -p.z);
        }
  return { target, position, view, ...box, near: 40, far: box.far + 4 };
}

/** Where a sun ray through window point (wx, wy) lands on the horizontal plane `y`. */
export function sunHit(wx: number, wy: number, y = 0, zWall = WINDOW.zIn) {
  const t = (y - wy) / SUN_DIR.y;
  return new THREE.Vector3(wx + SUN_DIR.x * t, y, zWall + SUN_DIR.z * t);
}

// ---------------------------------------------------------------------------------------------
// Irradiance model
// ---------------------------------------------------------------------------------------------

const lin = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const SKY_AMBIENT = lin('#D8CCBC', 0.52);
const GROUND_AMBIENT = lin('#B08A68', 0.34);
const WINDOW_LIGHT = lin(ROOM.skyFill, 1.25);
const SUN_LIGHT = lin(ROOM.sunWarm, 3.4);
const BOUNCE_LIGHT = lin(ROOM.bounceWarm, 0.9);

const WIN_C = new THREE.Vector3((WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.y0 + WINDOW.y1) / 2, WINDOW.zIn);
/** Centre of the sunlit tabletop, treated as a warm upward-facing emitter. */
const BOUNCE_C = new THREE.Vector3(-8, 0, -6);

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0..1: how much of the sun disc reaches point p through the window opening (and past the table). */
export function sunVisibility(px: number, py: number, pz: number) {
  if (pz <= WINDOW.zOut) return 1; // outside
  const d = SUN_DIR;
  let vis = 1;
  // The beam has to clear the opening at both faces of the thick wall.
  for (const zw of [WINDOW.zOut, WINDOW.zIn]) {
    if (pz <= zw) continue;
    const t = (pz - zw) / d.z;
    const sx = px - d.x * t;
    const sy = py - d.y * t;
    const soft = 1.5 + t * 0.012;
    vis *= smooth(0, soft, sx - WINDOW.x0) * smooth(0, soft, WINDOW.x1 - sx) * smooth(0, soft, sy - WINDOW.y0) * smooth(0, soft, WINDOW.y1 - sy);
    if (vis <= 0) return 0;
  }
  // Below the table tops: the tables themselves are in the way.
  if (py < -0.5) {
    const t = py / d.y;
    const x = px - d.x * t;
    const z = pz - d.z * t;
    for (const tb of TABLES) if (x > tb.minX && x < tb.maxX && z > tb.minZ && z < tb.maxZ) return 0;
  }
  return vis;
}

const PLANES: { n: [number, number, number]; d: (x: number, y: number, z: number) => number; r: number }[] = [
  { n: [1, 0, 0], d: (x) => x - SHELL.minX, r: 80 },
  { n: [-1, 0, 0], d: (x) => SHELL.maxX - x, r: 80 },
  { n: [0, 0, 1], d: (_x, _y, z) => z - SHELL.minZ, r: 80 },
  { n: [0, 0, -1], d: (_x, _y, z) => SHELL.maxZ - z, r: 80 },
  { n: [0, 1, 0], d: (_x, y) => y - SHELL.floorY, r: 45 },
  { n: [0, -1, 0], d: (_x, y) => SHELL.ceilY - y, r: 60 },
];

/**
 * Incoming light at world point p with normal n (linear RGB, written to `out`).
 * Cheap analytic stand-in for a light bake: no occlusion between pieces of furniture.
 */
export function irradiance(px: number, py: number, pz: number, nx: number, ny: number, nz: number, out: THREE.Color) {
  // hemisphere ambient
  const h = ny * 0.5 + 0.5;
  let r = GROUND_AMBIENT.r + (SKY_AMBIENT.r - GROUND_AMBIENT.r) * h;
  let g = GROUND_AMBIENT.g + (SKY_AMBIENT.g - GROUND_AMBIENT.g) * h;
  let b = GROUND_AMBIENT.b + (SKY_AMBIENT.b - GROUND_AMBIENT.b) * h;

  // sky light from the window (an area light facing +z)
  {
    let lx = WIN_C.x - px;
    let ly = WIN_C.y - py;
    let lz = WIN_C.z - pz;
    const d2 = lx * lx + ly * ly + lz * lz;
    const d = Math.sqrt(d2) || 1;
    lx /= d;
    ly /= d;
    lz /= d;
    const wrap = Math.max(0, (nx * lx + ny * ly + nz * lz + 0.35) / 1.35);
    const emit = Math.max(0, -lz) * 0.85 + 0.15;
    const k = (wrap * emit * 36000) / (d2 + 110 * 110);
    r += WINDOW_LIGHT.r * k;
    g += WINDOW_LIGHT.g * k;
    b += WINDOW_LIGHT.b * k;
  }

  // warm bounce off the sunlit table and village
  {
    let lx = BOUNCE_C.x - px;
    let ly = BOUNCE_C.y - py;
    let lz = BOUNCE_C.z - pz;
    const d2 = lx * lx + ly * ly + lz * lz;
    const d = Math.sqrt(d2) || 1;
    lx /= d;
    ly /= d;
    lz /= d;
    const wrap = Math.max(0, (nx * lx + ny * ly + nz * lz + 0.3) / 1.3);
    const emit = Math.max(0, -ly) * 0.9 + 0.1; // the emitter faces up
    const k = (wrap * emit * 15000) / (d2 + 85 * 85);
    r += BOUNCE_LIGHT.r * k;
    g += BOUNCE_LIGHT.g * k;
    b += BOUNCE_LIGHT.b * k;
  }

  // direct sun
  const ndl = -(nx * SUN_DIR.x + ny * SUN_DIR.y + nz * SUN_DIR.z);
  if (ndl > 0) {
    const vis = sunVisibility(px, py, pz);
    if (vis > 0) {
      const k = ndl * vis;
      r += SUN_LIGHT.r * k;
      g += SUN_LIGHT.g * k;
      b += SUN_LIGHT.b * k;
    }
  }

  // corner / contact darkening against the room shell
  let ao = 1;
  for (const p of PLANES) {
    if (nx * p.n[0] + ny * p.n[1] + nz * p.n[2] > 0.7) continue; // lying on (or parallel to) this surface
    const dist = p.d(px, py, pz);
    ao *= 0.66 + 0.34 * smooth(0, p.r, dist);
  }
  // under the tables it is dim
  if (py < -TABLE.thickness) {
    const m = 26;
    let inside = 0;
    for (const tb of TABLES) inside = Math.max(inside, smooth(tb.minX - m, tb.minX + m, px) * smooth(tb.maxX + m, tb.maxX - m, px) * smooth(tb.minZ - m, tb.minZ + m, pz) * smooth(tb.maxZ + m, tb.maxZ - m, pz));
    ao *= 1 - 0.45 * inside * smooth(-TABLE.thickness - 80, -TABLE.thickness, py);
  }
  ao = Math.max(ao, 0.42);
  out.setRGB(r * ao, g * ao, b * ao);
  return out;
}

const _c = new THREE.Color();
/** Irradiance as a colour, e.g. to tint a textured, unlit quad (pictures, rug). */
export function lightAt(p: [number, number, number], n: [number, number, number], albedo?: string) {
  const c = irradiance(p[0], p[1], p[2], n[0], n[1], n[2], new THREE.Color());
  if (albedo) c.multiply(_c.set(albedo));
  return c;
}

/**
 * Bake lighting into a geometry's `color` attribute. The geometry must already be in world space.
 * Existing colours are treated as albedo; `unlit` (attribute, optional) adds self-illumination.
 */
export function bakeGeometry(geo: THREE.BufferGeometry, albedo?: string) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  let col = geo.attributes.color as THREE.BufferAttribute | undefined;
  const base = albedo ? new THREE.Color(albedo) : null;
  if (!col) {
    col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', col);
    if (!base) for (let i = 0; i < pos.count; i++) col.setXYZ(i, 1, 1, 1);
  }
  const glow = geo.attributes.glow as THREE.BufferAttribute | undefined;
  const e = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    irradiance(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), e);
    const ar = base ? base.r : col.getX(i);
    const ag = base ? base.g : col.getY(i);
    const ab = base ? base.b : col.getZ(i);
    const u = glow ? glow.getX(i) : 0;
    col.setXYZ(i, ar * (e.r + u), ag * (e.g + u), ab * (e.b + u));
  }
  col.needsUpdate = true;
  if (glow) geo.deleteAttribute('glow');
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Builder: collects primitives in world space, then merges + bakes them into one geometry.
// ---------------------------------------------------------------------------------------------

interface Xf {
  ry?: number;
  rx?: number;
  rz?: number;
  /** Self-illumination added to the baked light (lamp shades, translucent curtains). */
  glow?: number;
}

const segs = (len: number, per = 55, max = 8) => Math.min(max, Math.max(1, Math.ceil(len / per)));

export class Builder {
  private parts: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  private tmp = new THREE.Matrix4();
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();
  private one = new THREE.Vector3(1, 1, 1);

  /** Enter a local frame (position + yaw); every primitive until `pop()` is placed inside it. */
  push(x: number, y: number, z: number, ry = 0) {
    this.stack.push(this.m.clone());
    this.m.multiply(this.tmp.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e.set(0, ry, 0)), this.one));
    return this;
  }
  pop() {
    this.m.copy(this.stack.pop()!);
    return this;
  }

  /** Add any geometry (local to the current frame), flat-coloured with `color`. */
  add(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, xf: Xf = {}, scale?: [number, number, number]) {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(xf.rx ?? 0, xf.ry ?? 0, xf.rz ?? 0, 'YXZ')),
      scale ? new THREE.Vector3(...scale) : this.one,
    );
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g !== geo) geo.dispose();
    g.applyMatrix4(this.tmp.multiplyMatrices(this.m, local));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    const glow = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      glow[i] = xf.glow ?? 0;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    this.parts.push(g);
    return this;
  }

  /** Box centred at (x, y, z). Large faces are subdivided so the baked light has gradients. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, xf: Xf = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d, segs(w), segs(h), segs(d)), color, x, y, z, xf);
  }
  /** Soft-edged box (cushions, mattresses). */
  soft(w: number, h: number, d: number, x: number, y: number, z: number, color: string, radius: number, xf: Xf = {}) {
    return this.add(new RoundedBoxGeometry(w, h, d, 2, radius), color, x, y, z, xf);
  }
  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: string, seg = 12, xf: Xf = {}, open = false) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, segs(h, 60, 4), open), color, x, y, z, xf);
  }
  ball(r: number, x: number, y: number, z: number, color: string, seg = 10, scale?: [number, number, number], xf: Xf = {}) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7))), color, x, y, z, xf, scale);
  }
  /** Cylinder between two points (poles, cords, rails). */
  rod(a: [number, number, number], b: [number, number, number], r: number, color: string, seg = 6, glow = 0) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const d = vb.clone().sub(va);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const mid = va.add(vb).multiplyScalar(0.5);
    return this.add(new THREE.CylinderGeometry(r, r, len, seg, segs(len, 60, 4)), color, mid.x, mid.y, mid.z, { rx: e.x, ry: e.y, rz: e.z, glow });
  }

  /** Current local → world transform (for callers that place their own geometry). */
  get matrix() {
    return this.m;
  }

  /** Merge everything and bake the room lighting into vertex colours. */
  build() {
    const merged = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    bakeGeometry(merged);
    merged.deleteAttribute('normal'); // unlit from here on
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Unlit material for baked geometry (vertex colours carry the lighting). */
export function bakedMaterial(opts: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, ...opts });
}
