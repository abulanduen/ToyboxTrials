/**
 * Baldwyn (and every Not-Baldwyn) as a table of chunky parts. One table drives both renderers:
 * the instanced crowd (one InstancedMesh per part; parts nobody in the round wears are skipped)
 * and the single figure on the reference card. That way the card can never drift out of step
 * with the crowd.
 *
 * Each part reads the slots of a look (looks.ts) to decide whether the toy has it, where it goes
 * and what colour it is. Geometries are shared module-level objects (built once, never per toy).
 *
 * Toy space: 1 unit = 1 cm, feet on y = 0, facing +z (+x is the viewer's right). About 4.9 cm
 * tall with a bowler; a top hat adds ~0.5 cm.
 */
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { part, type Look, type Paint } from './looks';

export const TOY_HEIGHT = 4.9;
/** Roughly the middle of the toy, for picking and framing. */
export const TOY_MID = 2.45;

const col = (hex: string) => new THREE.Color(hex);
export const PAINT: Record<Paint, THREE.Color> = {
  sage: col(PALETTE.sage),
  blue: col(PALETTE.toyBlue),
  coral: col(PALETTE.coral),
  honey: col(PALETTE.honey),
  purple: col(PALETTE.inkPurple),
  cream: col(PALETTE.cream),
  ink: col(PALETTE.ink),
};
const C = {
  ...PAINT,
  white: col(PALETTE.white),
  brass: col(PALETTE.brass),
  wood: col(PALETTE.woodDark),
};

export type MatKind = 'paint' | 'brass';

export interface Part {
  name: string;
  geo: THREE.BufferGeometry;
  mat: MatKind;
  /** Too small to bother the shadow map with. */
  small?: boolean;
  /** Write the part's local matrix; return false if this toy doesn't have the part. `spin` turns the key. */
  place(look: Look, spin: number, out: THREE.Matrix4): boolean;
  colour(look: Look): THREE.Color;
}

const P = new THREE.Vector3();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const E = new THREE.Euler();
const M2 = new THREE.Matrix4();

function trs(out: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return out.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}

// ---------------------------------------------------------------------------------------------
// Bodies. All stand on the feet (bottom ≈ 0.45) and end at the neck (top ≈ 2.35–2.45), so heads,
// hats and keys sit at the same height whatever the body.

interface Body {
  /** Half-width (x) and half-depth (z) of the body at height y. */
  rx(y: number): number;
  rz(y: number): number;
  top: number;
  belt: { y: number; round: boolean };
}
const taper = (bottom: number, top: number) => (y: number) => bottom + (top - bottom) * THREE.MathUtils.clamp((y - 0.45) / 1.9, 0, 1);
const ellipse = (r: number, cy: number, ry: number) => (y: number) => r * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
const barrel = taper(1.3, 1.15);
const bell = taper(1.5, 0.82);
const BODIES: Record<string, Body> = {
  barrel: { rx: barrel, rz: barrel, top: 2.35, belt: { y: 0.92, round: true } },
  bell: { rx: bell, rz: bell, top: 2.35, belt: { y: 0.86, round: true } },
  box: { rx: () => 1.15, rz: () => 1.05, top: 2.35, belt: { y: 0.92, round: false } },
  ball: { rx: ellipse(1.38, 1.42, 1.05), rz: ellipse(1.3, 1.42, 1.05), top: 2.42, belt: { y: 0.92, round: true } },
};
const body = (look: Look) => BODIES[part(look, 'body')];
const KEY_Y = 1.75;
const BUTTON_R = 0.17;
const BUTTON_Y: Record<string, number[]> = { one: [1.7], two: [1.45, 1.95], three: [1.3, 1.68, 2.06] };
/** Side the key is on (+1 = viewer's right); held things go in a mitt on the other side. */
const keySide = (look: Look) => (part(look, 'keySide') === 'right' ? 1 : -1);

// ---------------------------------------------------------------------------------------------
// Heads, with where each face feature sits on them.

interface Head {
  y: number;
  /** Eye centre (x = ± this), and the head's front surface at eye height. */
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  faceZ: number;
  noseY: number;
  noseZ: number;
  tacheY: number;
  tacheZ: number;
  /** Where the hat pivots. */
  hatY: number;
}
const HEADS: Record<string, Head> = {
  round: { y: 3.05, eyeX: 0.4, eyeY: 3.22, eyeZ: 0.88, faceZ: 0.98, noseY: 2.98, noseZ: 1.02, tacheY: 2.68, tacheZ: 0.9, hatY: 3.78 },
  square: { y: 3.08, eyeX: 0.42, eyeY: 3.27, eyeZ: 0.86, faceZ: 0.86, noseY: 3.0, noseZ: 0.93, tacheY: 2.7, tacheZ: 0.9, hatY: 3.95 },
  tall: { y: 3.18, eyeX: 0.34, eyeY: 3.38, eyeZ: 0.88, faceZ: 0.94, noseY: 3.08, noseZ: 0.99, tacheY: 2.76, tacheZ: 0.88, hatY: 4.1 },
};
const head = (look: Look) => HEADS[part(look, 'head')];

// ---------------------------------------------------------------------------------------------
// Hats hang off a tilted pivot on top of the head.

const TILT: Record<string, number> = { left: -0.3, right: 0.3, straight: 0 };
function hatPart(look: Look, kinds: string[], out: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, rz = 0) {
  if (!kinds.includes(part(look, 'hat'))) return false;
  trs(out, 0, head(look).hatY, -0.05, -0.08, 0, TILT[part(look, 'tilt')]);
  out.multiply(trs(M2, x, y, z, 0, 0, rz, sx, sy, sz));
  return true;
}
const hatPaint = (look: Look) => PAINT[part(look, 'hatPaint')];
const bandPaint = (look: Look) => PAINT[part(look, 'band')];

// ---------------------------------------------------------------------------------------------
// Keys stick out of the side and turn about the shaft.

function keyPart(look: Look, styles: string[], spin: number, out: THREE.Matrix4, gap: number, ly: number, extraRx = 0) {
  if (!styles.includes(part(look, 'key'))) return false;
  const side = keySide(look);
  trs(out, side * (body(look).rx(KEY_Y) + gap), KEY_Y, 0, spin * side + extraRx, 0, 0);
  if (ly !== 0) out.multiply(trs(M2, 0, ly, 0));
  return true;
}

// ---------------------------------------------------------------------------------------------
// Held things: a cream mitt on the side away from the key, and what it holds.

const HELD_Y = 1.6;
const heldX = (look: Look, out: number) => -keySide(look) * (body(look).rx(HELD_Y) + out);
const holds = (look: Look, ...items: string[]) => items.includes(part(look, 'held'));
const CANE_TOP = 2.45;
const CROOK_R = 0.26;

// ---------------------------------------------------------------------------------------------
// Shared geometries.

const sphere = new THREE.SphereGeometry(1, 14, 10);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 18);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const foot = new THREE.BoxGeometry(0.95, 0.45, 1.35);

const eyeShut = (look: Look, right: boolean) => {
  const e = part(look, 'eyes');
  return e === 'sleepy' || (right && e === 'wink');
};
function eye(look: Look, right: boolean, out: THREE.Matrix4) {
  const h = head(look);
  const x = (right ? 1 : -1) * h.eyeX;
  // A shut eye is a flat dash.
  if (eyeShut(look, right)) trs(out, x, h.eyeY - 0.02, h.eyeZ + 0.03, 0, 0, 0, 0.26, 0.06, 0.1);
  else trs(out, x, h.eyeY, h.eyeZ, 0, 0, 0, 0.17);
  return true;
}
function button(look: Look, i: number, out: THREE.Matrix4) {
  const ys = BUTTON_Y[part(look, 'buttons')];
  if (i >= ys.length) return false;
  const y = ys[i];
  trs(out, 0, y, body(look).rz(y) + 0.03, 0, 0, 0, BUTTON_R);
  return true;
}
function spec(look: Look, right: boolean, out: THREE.Matrix4) {
  const w = part(look, 'eyewear');
  if (w === 'none' || (w === 'monocle' && !right)) return false;
  const h = head(look);
  trs(out, (right ? 1 : -1) * h.eyeX, h.eyeY, Math.max(h.eyeZ, h.faceZ - 0.1) + 0.1);
  return true;
}

export const PARTS: Part[] = [
  { name: 'footL', geo: foot, mat: 'paint', place: (_l, _s, o) => (trs(o, -0.6, 0.225, 0.2), true), colour: () => C.purple },
  { name: 'footR', geo: foot, mat: 'paint', place: (_l, _s, o) => (trs(o, 0.6, 0.225, 0.2), true), colour: () => C.purple },

  // ---- bodies ----
  {
    name: 'bodyBarrel',
    geo: new THREE.CylinderGeometry(1.15, 1.3, 1.9, 18),
    mat: 'paint',
    place: (l, _s, o) => part(l, 'body') === 'barrel' && (trs(o, 0, 1.4, 0), true),
    colour: (l) => PAINT[part(l, 'bodyPaint')],
  },
  {
    name: 'bodyBell',
    geo: new THREE.CylinderGeometry(0.82, 1.5, 1.9, 18),
    mat: 'paint',
    place: (l, _s, o) => part(l, 'body') === 'bell' && (trs(o, 0, 1.4, 0), true),
    colour: (l) => PAINT[part(l, 'bodyPaint')],
  },
  {
    name: 'bodyBox',
    geo: new THREE.BoxGeometry(2.3, 1.9, 2.1),
    mat: 'paint',
    place: (l, _s, o) => part(l, 'body') === 'box' && (trs(o, 0, 1.4, 0), true),
    colour: (l) => PAINT[part(l, 'bodyPaint')],
  },
  {
    name: 'bodyBall',
    geo: sphere,
    mat: 'paint',
    place: (l, _s, o) => part(l, 'body') === 'ball' && (trs(o, 0, 1.42, 0, 0, 0, 0, 1.38, 1.05, 1.3), true),
    colour: (l) => PAINT[part(l, 'bodyPaint')],
  },
  {
    name: 'beltRound',
    geo: unitCyl,
    mat: 'paint',
    place: (l, _s, o) => {
      const b = body(l);
      if (!b.belt.round) return false;
      // As wide as the body gets across the belt's height, so it never sinks in.
      const y = b.belt.y;
      const r = (f: (y: number) => number) => Math.max(f(y - 0.18), f(y + 0.18)) + 0.06;
      trs(o, 0, y, 0, 0, 0, 0, r(b.rx), 0.36, r(b.rz));
      return true;
    },
    colour: (l) => PAINT[part(l, 'trim')],
  },
  {
    name: 'beltBox',
    geo: unitBox,
    mat: 'paint',
    place: (l, _s, o) => !body(l).belt.round && (trs(o, 0, body(l).belt.y, 0, 0, 0, 0, 2.42, 0.36, 2.22), true),
    colour: (l) => PAINT[part(l, 'trim')],
  },
  ...[0, 1, 2].map(
    (i): Part => ({
      name: `button${i + 1}`,
      geo: sphere,
      mat: 'paint',
      small: true,
      place: (l, _s, o) => button(l, i, o),
      colour: (l) => PAINT[part(l, 'buttonPaint')],
    }),
  ),

  // ---- heads and faces ----
  {
    name: 'headRound',
    geo: sphere,
    mat: 'paint',
    place: (l, _s, o) => part(l, 'head') === 'round' && (trs(o, 0, HEADS.round.y, 0, 0, 0, 0, 1.06, 0.92, 1), true),
    colour: () => C.cream,
  },
  {
    name: 'headSquare',
    geo: unitBox,
    mat: 'paint',
    place: (l, _s, o) => part(l, 'head') === 'square' && (trs(o, 0, HEADS.square.y, 0, 0, 0, 0, 1.8, 1.6, 1.7), true),
    colour: () => C.cream,
  },
  {
    name: 'headTall',
    geo: sphere,
    mat: 'paint',
    place: (l, _s, o) => part(l, 'head') === 'tall' && (trs(o, 0, HEADS.tall.y, 0, 0, 0, 0, 0.9, 1.15, 0.95), true),
    colour: () => C.cream,
  },
  { name: 'eyeL', geo: sphere, mat: 'paint', small: true, place: (l, _s, o) => eye(l, false, o), colour: () => C.ink },
  { name: 'eyeR', geo: sphere, mat: 'paint', small: true, place: (l, _s, o) => eye(l, true, o), colour: () => C.ink },
  {
    name: 'nose',
    geo: sphere,
    mat: 'paint',
    small: true,
    place: (l, _s, o) => (trs(o, 0, head(l).noseY, head(l).noseZ, 0, 0, 0, 0.25), true),
    colour: (l) => PAINT[part(l, 'nose')],
  },
  {
    name: 'tache',
    geo: unitBox,
    mat: 'paint',
    small: true,
    place: (l, _s, o) => {
      const t = part(l, 'tache');
      if (t === 'none') return false;
      const h = head(l);
      // A walrus is a big bushy droop; bar and handlebar share a slim bar.
      if (t === 'walrus') trs(o, 0, h.tacheY - 0.06, h.tacheZ + 0.02, 0, 0, 0, 1.6, 0.42, 0.3);
      else trs(o, 0, h.tacheY, h.tacheZ, 0, 0, 0, 1.35, 0.2, 0.22);
      return true;
    },
    colour: () => C.ink,
  },
  ...[-1, 1].map(
    (side): Part => ({
      name: side < 0 ? 'tacheTipL' : 'tacheTipR',
      geo: unitBox,
      mat: 'paint',
      small: true,
      // Handlebar: the ends curl up.
      place: (l, _s, o) => {
        if (part(l, 'tache') !== 'handlebar') return false;
        const h = head(l);
        trs(o, side * 0.74, h.tacheY + 0.14, h.tacheZ - 0.02, 0, 0, -side * 0.55, 0.16, 0.42, 0.18);
        return true;
      },
      colour: () => C.ink,
    }),
  ),
  ...[false, true].map(
    (right): Part => ({
      name: right ? 'specR' : 'specL',
      geo: new THREE.TorusGeometry(0.27, 0.055, 6, 18),
      mat: 'brass',
      small: true,
      place: (l, _s, o) => spec(l, right, o),
      colour: () => C.brass,
    }),
  ),
  {
    name: 'specBridge',
    geo: unitBox,
    mat: 'brass',
    small: true,
    place: (l, _s, o) => {
      if (part(l, 'eyewear') !== 'specs') return false;
      const h = head(l);
      trs(o, 0, h.eyeY + 0.04, Math.max(h.eyeZ, h.faceZ - 0.1) + 0.1, 0, 0, 0, h.eyeX * 2 - 0.5, 0.06, 0.06);
      return true;
    },
    colour: () => C.brass,
  },

  // ---- hats ----
  {
    name: 'hatBrim',
    geo: unitCyl,
    mat: 'paint',
    place: (l, _s, o) => (part(l, 'hat') === 'top' ? hatPart(l, ['top'], o, 0, 0.07, 0, 1.02, 0.14, 1.02) : hatPart(l, ['bowler'], o, 0, 0.06, 0, 0.95, 0.12, 0.95)),
    colour: hatPaint,
  },
  {
    name: 'hatBand',
    geo: unitCyl,
    mat: 'paint',
    place: (l, _s, o) => (part(l, 'hat') === 'top' ? hatPart(l, ['top'], o, 0, 0.29, 0, 0.73, 0.28, 0.73) : hatPart(l, ['bowler'], o, 0, 0.2, 0, 0.715, 0.2, 0.715)),
    colour: bandPaint,
  },
  {
    name: 'hatTopCrown',
    geo: new THREE.CylinderGeometry(0.66, 0.7, 1, 18),
    mat: 'paint',
    place: (l, _s, o) => hatPart(l, ['top'], o, 0, 0.72, 0, 1, 1.12, 1),
    colour: hatPaint,
  },
  {
    name: 'hatDome',
    geo: sphere,
    mat: 'paint',
    place: (l, _s, o) => hatPart(l, ['bowler'], o, 0, 0.12, 0, 0.7, 0.62, 0.7),
    colour: hatPaint,
  },
  {
    name: 'fez',
    geo: new THREE.CylinderGeometry(0.48, 0.66, 0.85, 18),
    mat: 'paint',
    place: (l, _s, o) => hatPart(l, ['fez'], o, 0, 0.4, 0, 1),
    colour: hatPaint,
  },
  {
    name: 'fezCord',
    geo: unitBox,
    mat: 'paint',
    small: true,
    place: (l, _s, o) => hatPart(l, ['fez'], o, 0.26, 0.84, 0.05, 0.55, 0.07, 0.07, -0.25),
    colour: bandPaint,
  },
  {
    name: 'fezTassel',
    geo: new THREE.CylinderGeometry(0.09, 0.17, 0.46, 10),
    mat: 'paint',
    place: (l, _s, o) => hatPart(l, ['fez'], o, 0.6, 0.5, 0.1, 1),
    colour: bandPaint,
  },
  {
    name: 'beret',
    geo: sphere,
    mat: 'paint',
    place: (l, _s, o) => hatPart(l, ['beret'], o, 0, 0.16, 0, 1.12, 0.32, 1.12),
    colour: hatPaint,
  },
  {
    name: 'beretNub',
    geo: new THREE.CylinderGeometry(0.07, 0.1, 0.24, 8),
    mat: 'paint',
    small: true,
    place: (l, _s, o) => hatPart(l, ['beret'], o, 0, 0.52, 0, 1),
    colour: hatPaint,
  },

  // ---- wind-up key ----
  {
    name: 'keyShaft',
    geo: new THREE.CylinderGeometry(0.11, 0.11, 0.7, 8),
    mat: 'brass',
    place: (l, _s, o) => {
      const side = keySide(l);
      trs(o, side * (body(l).rx(KEY_Y) + 0.3), KEY_Y, 0, 0, 0, Math.PI / 2);
      return true;
    },
    colour: () => C.brass,
  },
  {
    name: 'keyLoop',
    geo: new THREE.TorusGeometry(0.36, 0.12, 6, 14),
    mat: 'brass',
    place: (l, spin, o) => keyPart(l, ['loop'], spin, o, 0.9, 0),
    colour: () => C.brass,
  },
  ...[-1, 1].map(
    (lobe): Part => ({
      name: lobe < 0 ? 'keyBowA' : 'keyBowB',
      geo: new THREE.TorusGeometry(0.26, 0.1, 6, 14),
      mat: 'brass',
      // A butterfly key: two loops either side of the shaft.
      place: (l, spin, o) => keyPart(l, ['bow'], spin, o, 0.78, lobe * 0.3),
      colour: () => C.brass,
    }),
  ),
  {
    name: 'keyPaddle',
    geo: new THREE.CylinderGeometry(0.44, 0.44, 0.12, 16),
    mat: 'brass',
    // A flat round plate.
    place: (l, spin, o) => keyPart(l, ['paddle'], spin, o, 0.86, 0, Math.PI / 2),
    colour: () => C.brass,
  },

  // ---- neckwear ----
  ...[-1, 1].map(
    (side): Part => ({
      name: side < 0 ? 'bowtieL' : 'bowtieR',
      geo: new THREE.ConeGeometry(0.22, 0.44, 10),
      mat: 'paint',
      place: (l, _s, o) => {
        if (part(l, 'neck') !== 'bowtie') return false;
        const b = body(l);
        // Each wing is a cone pointing in at the knot.
        trs(o, side * 0.24, b.top + 0.15, b.rz(b.top) - 0.05, 0, 0, (side * Math.PI) / 2);
        return true;
      },
      colour: (l) => PAINT[part(l, 'neckPaint')],
    }),
  ),
  {
    name: 'bowtieKnot',
    geo: sphere,
    mat: 'paint',
    small: true,
    place: (l, _s, o) => {
      if (part(l, 'neck') !== 'bowtie') return false;
      const b = body(l);
      trs(o, 0, b.top + 0.15, b.rz(b.top) - 0.0, 0, 0, 0, 0.13);
      return true;
    },
    colour: (l) => PAINT[part(l, 'neckPaint')],
  },
  {
    name: 'scarfRing',
    geo: new THREE.TorusGeometry(1, 0.24, 8, 22),
    mat: 'paint',
    place: (l, _s, o) => {
      if (part(l, 'neck') !== 'scarf') return false;
      const b = body(l);
      trs(o, 0, b.top + 0.04, 0, Math.PI / 2, 0, 0, Math.max(b.rx(b.top), 0.95) * 0.92, Math.max(b.rz(b.top), 0.95) * 0.92, 1.1);
      return true;
    },
    colour: (l) => PAINT[part(l, 'neckPaint')],
  },
  {
    name: 'scarfTail',
    geo: unitBox,
    mat: 'paint',
    place: (l, _s, o) => {
      if (part(l, 'neck') !== 'scarf') return false;
      const b = body(l);
      // Hangs down the front, off to the viewer's left so it never covers the buttons.
      const y = b.top - 0.45;
      trs(o, -0.62, y, b.rz(y) + 0.06, 0.12, 0, 0.1, 0.42, 0.95, 0.14);
      return true;
    },
    colour: (l) => PAINT[part(l, 'neckPaint')],
  },

  // ---- held things ----
  {
    name: 'mitt',
    geo: sphere,
    mat: 'paint',
    place: (l, _s, o) => !holds(l, 'none') && (trs(o, heldX(l, 0.12), HELD_Y, 0.42, 0, 0, 0, 0.3), true),
    colour: () => C.cream,
  },
  {
    name: 'caneShaft',
    geo: new THREE.CylinderGeometry(0.09, 0.09, CANE_TOP - 0.05, 8),
    mat: 'paint',
    place: (l, _s, o) => holds(l, 'cane', 'umbrella') && (trs(o, heldX(l, 0.42), (CANE_TOP + 0.05) / 2, 0.55), true),
    colour: () => C.wood,
  },
  {
    name: 'caneCrook',
    geo: new THREE.TorusGeometry(CROOK_R, 0.09, 6, 12, Math.PI),
    mat: 'paint',
    place: (l, _s, o) => {
      if (!holds(l, 'cane', 'umbrella')) return false;
      // Half a ring from the top of the shaft, curling back towards the toy.
      const side = -keySide(l);
      trs(o, heldX(l, 0.42) - side * CROOK_R, CANE_TOP, 0.55, 0, side < 0 ? Math.PI : 0, 0);
      return true;
    },
    colour: () => C.wood,
  },
  {
    name: 'umbrella',
    geo: new THREE.ConeGeometry(0.42, 1.75, 10),
    mat: 'paint',
    // Furled: a long cone, point down.
    place: (l, _s, o) => holds(l, 'umbrella') && (trs(o, heldX(l, 0.42), 1.12, 0.55, Math.PI, 0, 0), true),
    colour: () => C.purple,
  },
  {
    name: 'flowerStem',
    geo: new THREE.CylinderGeometry(0.05, 0.05, 1.35, 6),
    mat: 'paint',
    small: true,
    place: (l, _s, o) => holds(l, 'flower') && (trs(o, heldX(l, 0.22), HELD_Y + 0.55, 0.6), true),
    colour: () => C.sage,
  },
  {
    name: 'flowerPetals',
    geo: sphere,
    mat: 'paint',
    place: (l, _s, o) => holds(l, 'flower') && (trs(o, heldX(l, 0.22), HELD_Y + 1.3, 0.62, 0, 0, 0, 0.44, 0.44, 0.14), true),
    colour: () => C.coral,
  },
  {
    name: 'flowerHeart',
    geo: sphere,
    mat: 'paint',
    small: true,
    place: (l, _s, o) => holds(l, 'flower') && (trs(o, heldX(l, 0.22), HELD_Y + 1.3, 0.72, 0, 0, 0, 0.16), true),
    colour: () => C.honey,
  },
];

/** Material for an instanced part: white, tinted per instance. Fog is off so far rows stay crisp. */
export function instancedMaterial(kind: MatKind) {
  return kind === 'brass'
    ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.85, fog: false })
    : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, fog: false });
}

/** Indices of the parts any of these looks has (the rest can be skipped this round). */
export function partsUsed(looks: Iterable<Look>): number[] {
  const used = new Set<number>();
  const m = new THREE.Matrix4();
  for (const look of looks) PARTS.forEach((p, i) => p.place(look, 0, m) && used.add(i));
  return [...used].sort((a, b) => a - b);
}

/** A single stand-alone figure (the reference card). Dispose its materials with `disposeFigure`. */
export function createFigure(look: Look): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Matrix4();
  for (const p of PARTS) {
    if (!p.place(look, 0.6, m)) continue;
    const mat = instancedMaterial(p.mat);
    mat.color.copy(p.colour(look));
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(m);
    mesh.userData.part = p;
    g.add(mesh);
  }
  g.userData.look = look;
  return g;
}

/** Turn the figure's wind-up key, like the crowd's (so a still key never reads as a difference). */
export function spinFigureKey(g: THREE.Group, spin: number) {
  for (const mesh of g.children) {
    const p = mesh.userData.part as Part | undefined;
    if (p && p.name.startsWith('key') && p.name !== 'keyShaft') p.place(g.userData.look as Look, spin, mesh.matrix);
  }
}

export function disposeFigure(g: THREE.Group) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
  });
}
