/**
 * Bakes Toy Squad model specs (`models.ts`) into render geometry. Presentation only.
 *
 * Every toy becomes ONE non-indexed, vertex-coloured BufferGeometry built from a shared set of
 * unit primitives, cached per roster id and drawn with one shared material. A fighter on the
 * board is therefore a single draw call, whatever its part count.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../../game/palette';
import { RARITY_COLOURS, type Rarity } from './catalogue';
import { TOY_SPECS, type Prim, type ToyPart } from './models';

const extrude = (points: [number, number][]) => {
  const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 }).translate(0, 0, -0.5);
};
const cog = (teeth: number, root: number) => extrude(Array.from({ length: teeth * 4 }, (_, i): [number, number] => {
  const a = (i + 0.5) / (teeth * 4) * Math.PI * 2, r = i % 4 < 2 ? 0.5 : root; return [Math.cos(a) * r, Math.sin(a) * r];
}));
const builders: Record<Prim, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  rbox: () => new RoundedBoxGeometry(1, 1, 1, 1, 0.16),
  ball: () => new THREE.SphereGeometry(0.5, 10, 7),
  dome: () => new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  hex: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  frust: () => new THREE.CylinderGeometry(0.325, 0.5, 1, 10),
  cone: () => new THREE.ConeGeometry(0.5, 1, 9),
  pyr: () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
  gem: () => new THREE.OctahedronGeometry(0.5),
  torus: () => new THREE.TorusGeometry(0.38, 0.12, 5, 12),
  hoop: () => new THREE.TorusGeometry(0.45, 0.05, 4, 14),
  arc: () => new THREE.TorusGeometry(0.38, 0.12, 5, 8, Math.PI),
  gear: () => cog(8, 0.38),
  crimp: () => cog(16, 0.44),
  star: () => extrude(Array.from({ length: 10 }, (_, i): [number, number] => { const a = i * Math.PI / 5, r = i % 2 ? 0.22 : 0.5; return [Math.sin(a) * r, Math.cos(a) * r]; })),
  prism: () => extrude([[-0.5, -0.5], [0.5, -0.5], [0, 0.5]]),
};
interface Unit { position: Float32Array; normal: Float32Array; count: number }
const units = new Map<Prim, Unit>();
function unit(prim: Prim): Unit {
  let u = units.get(prim);
  if (!u) {
    const source = builders[prim](), flat = source.index ? source.toNonIndexed() : source;
    // Faceted primitives keep hard normals; ExtrudeGeometry and friends already provide them.
    if (prim === 'gem' || prim === 'pyr') flat.computeVertexNormals();
    u = { position: flat.getAttribute('position').array as Float32Array, normal: flat.getAttribute('normal').array as Float32Array, count: flat.getAttribute('position').count };
    units.set(prim, u); if (flat !== source) flat.dispose(); source.dispose();
  }
  return u;
}

const matrix = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler();
const position = new THREE.Vector3(), scale = new THREE.Vector3(), v = new THREE.Vector3(), colour = new THREE.Color();
const light = new THREE.Vector3(0.3, 0.9, 0.35).normalize();
/**
 * Merge parts into one geometry. `ground` bakes a soft ground-up gradient into the vertex colours
 * (toys, lit by the scene); `lit` bakes a fixed key light for unlit effect shapes.
 */
export function bakeParts(parts: readonly ToyPart[], shading: 'ground' | 'lit' = 'ground'): THREE.BufferGeometry {
  const total = parts.reduce((n, p) => n + unit(p.g).count, 0);
  const positions = new Float32Array(total * 3), normals = new Float32Array(total * 3), colours = new Float32Array(total * 3);
  let o = 0;
  for (const part of parts) {
    const u = unit(part.g);
    quaternion.setFromEuler(euler.set(part.r[0], part.r[1], part.r[2], part.o));
    matrix.compose(position.set(part.p[0], part.p[1], part.p[2]), quaternion, scale.set(part.s[0], part.s[1], part.s[2]));
    normalMatrix.getNormalMatrix(matrix); colour.set(part.c);
    for (let i = 0; i < u.count; i++, o += 3) {
      v.fromArray(u.position, i * 3).applyMatrix4(matrix).toArray(positions, o);
      const height = v.y;
      v.fromArray(u.normal, i * 3).applyMatrix3(normalMatrix).normalize().toArray(normals, o);
      const shade = shading === 'ground' ? 0.8 + 0.2 * Math.min(1, Math.max(0, height / 2.4)) : 0.62 + 0.38 * Math.max(0, v.dot(light));
      colours[o] = colour.r * shade; colours[o + 1] = colour.g * shade; colours[o + 2] = colour.b * shade;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const cache = new Map<string, THREE.BufferGeometry>();
/** One cached geometry per roster id, built the first time that toy appears. */
export function toyGeometry(kind: string): THREE.BufferGeometry {
  let geometry = cache.get(kind);
  if (!geometry) { geometry = bakeParts((TOY_SPECS[kind] ?? TOY_SPECS.soldier).parts); cache.set(kind, geometry); }
  return geometry;
}
export const toyTriangles = (kind: string) => TOY_SPECS[kind].parts.reduce((n, p) => n + unit(p.g).count, 0) / 3;

/** Shared by every toy. The second material is the gold "will upgrade" glow. */
export const TOY_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
export const TOY_GLOW_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, emissive: PALETTE.honey, emissiveIntensity: 0.38 });

const stand = (top: string, rim: string, rarity: string) => bakeParts([
  // Outer band and front notch carry the rarity colour; the inner rim and top carry the team.
  { g: 'cyl', c: rarity, p: [0, 0.05, 0], s: [2.66, 0.1, 2.66], r: [0, 0, 0], o: 'XYZ' },
  { g: 'cyl', c: rim, p: [0, 0.09, 0], s: [2.3, 0.1, 2.3], r: [0, 0, 0], o: 'XYZ' },
  { g: 'cyl', c: top, p: [0, 0.13, 0], s: [2.02, 0.06, 2.02], r: [0, 0, 0], o: 'XYZ' },
  // A notch at the toy's front so facing reads even from directly above.
  { g: 'prism', c: rarity, p: [0, 0.1, 1.36], s: [0.6, 0.4, 0.08], r: [Math.PI / 2, 0, 0], o: 'XYZ' },
]);
const stands = new Map<string, THREE.BufferGeometry>();
/**
 * Team stands: the local squad is cream on toy blue, the opposing squad coral on ink. The outer
 * band is the unit's rarity colour. One cached geometry per team and rarity (ten at most).
 */
export function standGeometry(side: 0 | 1, rarity: Rarity): THREE.BufferGeometry {
  const key = `${side}:${rarity}`; let geometry = stands.get(key);
  if (!geometry) { geometry = side === 0 ? stand(PALETTE.cream, PALETTE.toyBlue, RARITY_COLOURS[rarity]) : stand(PALETTE.coral, PALETTE.ink, RARITY_COLOURS[rarity]); stands.set(key, geometry); }
  return geometry;
}

const starShape = (x: number): ToyPart => ({ g: 'star', c: PALETTE.honey, p: [x, 0, 0], s: [0.56, 0.56, 0.08], r: [-Math.PI / 2, 0, 0], o: 'XYZ' });
/** One geometry per star tier (1–3), so the tier marker is a single draw call. */
export const TIER_GEOMETRY = [[0], [-0.3, 0.3], [-0.58, 0, 0.58]].map(xs => bakeParts(xs.map(starShape)));
export const UNLIT_VERTEX_MATERIAL = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
