/**
 * Baldwyn (and every Not-Baldwyn) as a table of chunky parts. One table drives both renderers:
 * the instanced crowd (one InstancedMesh per part, so 24 toys cost ~17 draw calls) and the single
 * reference figure on the card. That way the card can never drift out of step with the crowd.
 *
 * Toy space: 1 unit = 1 cm, feet on y = 0, facing +z. About 4.9 cm tall with the hat.
 */
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { T } from './traits';

export const TOY_HEIGHT = 4.9;
/** Roughly the middle of the toy, for picking and framing. */
export const TOY_MID = 2.45;

const col = (hex: string) => new THREE.Color(hex);
const C = {
  sage: col(PALETTE.sage),
  blue: col(PALETTE.toyBlue),
  honey: col(PALETTE.honey),
  coral: col(PALETTE.coral),
  cream: col(PALETTE.cream),
  white: col(PALETTE.white),
  purple: col(PALETTE.inkPurple),
  ink: col(PALETTE.ink),
  brass: col(PALETTE.brass),
};

export type MatKind = 'paint' | 'brass';

export interface Part {
  name: string;
  geo: THREE.BufferGeometry;
  mat: MatKind;
  /** Write the part's local matrix; return false if this toy doesn't have the part. `spin` turns the key. */
  place(traits: number, spin: number, out: THREE.Matrix4): boolean;
  colour(traits: number): THREE.Color;
}

const P = new THREE.Vector3();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const E = new THREE.Euler();
const M2 = new THREE.Matrix4();

function trs(out: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return out.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}

const HAT_Y = 3.78;
const HAT_TILT = 0.3;
/** Hat pieces hang off a tilted pivot on top of the head. */
function hatPart(traits: number, y: number, out: THREE.Matrix4) {
  if (traits & T.noHat) return false;
  trs(out, 0, HAT_Y, -0.05, -0.08, 0, traits & T.tilt ? HAT_TILT : -HAT_TILT);
  out.multiply(trs(M2, 0, y, 0));
  return true;
}
const keySide = (traits: number) => (traits & T.keySide ? -1 : 1);

const sphere = new THREE.SphereGeometry(1, 14, 10);
const foot = new THREE.BoxGeometry(0.95, 0.45, 1.35);

export const PARTS: Part[] = [
  { name: 'footL', geo: foot, mat: 'paint', place: (_t, _s, o) => (trs(o, -0.6, 0.225, 0.2), true), colour: () => C.purple },
  { name: 'footR', geo: foot, mat: 'paint', place: (_t, _s, o) => (trs(o, 0.6, 0.225, 0.2), true), colour: () => C.purple },
  {
    name: 'body',
    geo: new THREE.CylinderGeometry(1.15, 1.3, 1.9, 18),
    mat: 'paint',
    place: (_t, _s, o) => (trs(o, 0, 1.4, 0), true),
    colour: (t) => (t & T.body ? C.blue : C.sage),
  },
  {
    name: 'belt',
    geo: new THREE.CylinderGeometry(1.33, 1.38, 0.4, 18),
    mat: 'paint',
    place: (_t, _s, o) => (trs(o, 0, 0.95, 0), true),
    colour: (t) => (t & T.belt ? C.coral : C.honey),
  },
  { name: 'button1', geo: sphere, mat: 'paint', place: (_t, _s, o) => (trs(o, 0, 1.5, 1.24, 0, 0, 0, 0.19), true), colour: () => C.white },
  {
    name: 'button2',
    geo: sphere,
    mat: 'paint',
    place: (t, _s, o) => (t & T.button ? false : (trs(o, 0, 2.0, 1.18, 0, 0, 0, 0.19), true)),
    colour: () => C.white,
  },
  { name: 'head', geo: sphere, mat: 'paint', place: (_t, _s, o) => (trs(o, 0, 3.05, 0, 0, 0, 0, 1.06, 0.92, 1), true), colour: () => C.cream },
  { name: 'eyeL', geo: sphere, mat: 'paint', place: (_t, _s, o) => (trs(o, -0.4, 3.22, 0.88, 0, 0, 0, 0.17), true), colour: () => C.ink },
  {
    name: 'eyeR',
    geo: sphere,
    mat: 'paint',
    // A shut eye is a flat dash.
    place: (t, _s, o) => (t & T.wink ? trs(o, 0.4, 3.2, 0.9, 0, 0, 0, 0.26, 0.06, 0.1) : trs(o, 0.4, 3.22, 0.88, 0, 0, 0, 0.17), true),
    colour: () => C.ink,
  },
  {
    name: 'nose',
    geo: sphere,
    mat: 'paint',
    place: (_t, _s, o) => (trs(o, 0, 2.98, 1.02, 0, 0, 0, 0.25), true),
    colour: (t) => (t & T.nose ? C.blue : C.coral),
  },
  {
    name: 'moustache',
    geo: new THREE.BoxGeometry(1.35, 0.2, 0.22),
    mat: 'paint',
    place: (t, _s, o) => (t & T.noTache ? false : (trs(o, 0, 2.68, 0.9), true)),
    colour: () => C.ink,
  },
  {
    name: 'hatBrim',
    geo: new THREE.CylinderGeometry(1.02, 1.02, 0.14, 18),
    mat: 'paint',
    place: (t, _s, o) => hatPart(t, 0.07, o),
    colour: (t) => (t & T.hatColour ? C.coral : C.purple),
  },
  {
    name: 'hatBand',
    geo: new THREE.CylinderGeometry(0.74, 0.76, 0.28, 18),
    mat: 'paint',
    place: (t, _s, o) => hatPart(t, 0.28, o),
    colour: (t) => (t & T.band ? C.white : t & T.hatColour ? C.purple : C.coral),
  },
  {
    name: 'hatCrown',
    geo: new THREE.CylinderGeometry(0.62, 0.7, 0.62, 18),
    mat: 'paint',
    place: (t, _s, o) => hatPart(t, 0.73, o),
    colour: (t) => (t & T.hatColour ? C.coral : C.purple),
  },
  {
    name: 'keyShaft',
    geo: new THREE.CylinderGeometry(0.11, 0.11, 0.7, 8),
    mat: 'brass',
    place: (t, _s, o) => (trs(o, keySide(t) * 1.5, 1.75, 0, 0, 0, Math.PI / 2), true),
    colour: () => C.brass,
  },
  {
    name: 'keyRing',
    geo: new THREE.TorusGeometry(0.36, 0.12, 6, 14),
    mat: 'brass',
    place: (t, spin, o) => (trs(o, keySide(t) * 2.1, 1.75, 0, spin * keySide(t), 0, 0), true),
    colour: () => C.brass,
  },
];

/** Material for an instanced part: white, tinted per instance. Fog is off so far rows stay crisp. */
export function instancedMaterial(kind: MatKind) {
  return kind === 'brass'
    ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.85, fog: false })
    : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, fog: false });
}

/** A single stand-alone figure (the reference card). Dispose its materials with `disposeFigure`. */
export function createFigure(traits: number): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Matrix4();
  for (const part of PARTS) {
    if (!part.place(traits, 0.6, m)) continue;
    const mat = instancedMaterial(part.mat);
    mat.color.copy(part.colour(traits));
    const mesh = new THREE.Mesh(part.geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(m);
    mesh.userData.part = part;
    g.add(mesh);
  }
  g.userData.traits = traits;
  return g;
}

/** Turn the figure's wind-up key, like the crowd's (so a still key never reads as a difference). */
export function spinFigureKey(g: THREE.Group, spin: number) {
  for (const mesh of g.children) {
    const part = mesh.userData.part as Part | undefined;
    if (part?.name === 'keyRing') part.place(g.userData.traits as number, spin, mesh.matrix);
  }
}

export function disposeFigure(g: THREE.Group) {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
  });
}
