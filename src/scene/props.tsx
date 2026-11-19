/**
 * Reusable toy-world building pieces: wooden blocks, dominoes, felt trees, bunting, block arches.
 * Repeated pieces use instancing so the hub stays cheap to draw.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { Instance, Instances } from '@react-three/drei';
import { RoundedBox } from './RoundedBox';
import { PALETTE } from '../game/palette';
import { woodTexture, feltTexture } from './textures';
import { dominoGeometry, dominoRestY, type DominoSpec } from './domino';

// ---------- shared materials ----------
const matCache = new Map<string, THREE.Material>();
export function paintMat(color: string, rough = 0.55, metal = 0) {
  const k = `paint:${color}:${rough}:${metal}`;
  let m = matCache.get(k);
  if (!m) matCache.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m as THREE.MeshStandardMaterial;
}
export function woodMat(tint: string = PALETTE.woodLight) {
  const k = `wood:${tint}`;
  let m = matCache.get(k);
  if (!m) matCache.set(k, (m = new THREE.MeshStandardMaterial({ color: tint, map: woodTexture('#F7EFE2', [0.5, 0.5], 4), roughness: 0.7 })));
  return m as THREE.MeshStandardMaterial;
}
export function feltMat(color: string) {
  const k = `felt:${color}`;
  let m = matCache.get(k);
  if (!m) matCache.set(k, (m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: feltTexture(color, [1, 1], color.length), roughness: 1 })));
  return m as THREE.MeshStandardMaterial;
}

// ---------- domino texture: the pip face on the left half, plain ivory on the right (see domino.ts) ----------
let dominoTex: THREE.Texture | null = null;
function dominoTexture() {
  if (dominoTex) return dominoTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = PALETTE.white;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(120,100,80,0.10)';
  for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  g.fillStyle = PALETTE.ink;
  g.fillRect(14, 125, 100, 6);
  const pip = (x: number, y: number) => {
    g.beginPath();
    g.arc(x, y, 11, 0, Math.PI * 2);
    g.fill();
  };
  // 3 on top, 5 on bottom
  pip(34, 30);
  pip(64, 64);
  pip(94, 98);
  pip(34, 160);
  pip(94, 160);
  pip(64, 192);
  pip(34, 224);
  pip(94, 224);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  dominoTex = t;
  return t;
}

export type { DominoSpec } from './domino';

let dominoMaterial: THREE.MeshStandardMaterial | null = null;
let dominoGeo: THREE.BufferGeometry | null = null;

/**
 * Instanced dominoes (2.4 × 4.8 × 0.75, a 1 : 2 face). Pips are on the two big faces only; the
 * thin edges are plain (see domino.ts). `s` scales a domino uniformly, so it is never stretched.
 */
export function Dominoes({ items }: { items: DominoSpec[] }) {
  const mat = (dominoMaterial ??= new THREE.MeshStandardMaterial({ map: dominoTexture(), roughness: 0.42 }));
  const geo = (dominoGeo ??= dominoGeometry());
  return (
    <Instances limit={items.length} castShadow receiveShadow material={mat} geometry={geo}>
      {items.map((d, i) => (
        <Instance key={i} position={[d.x, d.y ?? dominoRestY(d), d.z]} rotation={[-(d.tilt ?? 0), d.rot, d.roll ?? 0, 'YXZ']} scale={d.s ?? 1} />
      ))}
    </Instances>
  );
}

/** A chunky painted wooden block with bevelled edges and a debossed star. */
export function Block({ x, y = 0, z, rot = 0, color, size = 3 }: { x: number; y?: number; z: number; rot?: number; color: string; size?: number }) {
  return (
    <group position={[x, y + size / 2, z]} rotation={[0, rot, 0]}>
      <RoundedBox args={[size, size, size]} radius={size * 0.08} smoothness={2} castShadow receiveShadow material={woodMat(color)} />
      {/* painted face emblems */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((r) => (
        <mesh key={r} rotation={[0, r, 0]} position={[Math.sin(r) * (size / 2 + 0.01), 0, Math.cos(r) * (size / 2 + 0.01)]} material={paintMat(PALETTE.cream, 0.6)}>
          <circleGeometry args={[size * 0.28, 5]} />
        </mesh>
      ))}
    </group>
  );
}

/** Felt cone tree on a wooden peg — stacked tiers so it reads as a toy, not a real tree. */
export function FeltTree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow material={woodMat(PALETTE.woodMid)}>
        <cylinderGeometry args={[1.1, 1.25, 0.5, 14]} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow material={woodMat(PALETTE.woodDark)}>
        <cylinderGeometry args={[0.35, 0.4, 2, 8]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 3.2 + i * 1.7, 0]} castShadow receiveShadow material={feltMat(i % 2 ? PALETTE.sage : PALETTE.feltDark)}>
          <coneGeometry args={[2.3 - i * 0.55, 2.8, 9]} />
        </mesh>
      ))}
      <mesh position={[0, 8.2, 0]} castShadow material={paintMat(PALETTE.honey, 0.4)}>
        <sphereGeometry args={[0.35, 10, 8]} />
      </mesh>
    </group>
  );
}

/** Pennant bunting hung on a sagging string between two points. */
export function Bunting({ from, to, sag = 2.5, count = 12 }: { from: [number, number, number]; to: [number, number, number]; sag?: number; count?: number }) {
  const { flags, curve } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const colors = [PALETTE.coral, PALETTE.honey, PALETTE.toyBlue, PALETTE.sage, PALETTE.cream];
    const flags = Array.from({ length: count }, (_, i) => {
      const t = (i + 0.5) / count;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      return { p, yaw: Math.atan2(-tan.z, tan.x), color: colors[i % colors.length] };
    });
    return { flags, curve };
  }, [from, to, sag, count]);
  const flagGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.55, 0, 0, 0.55, 0, 0, 0, -1.3, 0], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const flagMat = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }), []);
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 24, 0.04, 4, false]} />
        <meshStandardMaterial color={PALETTE.cream} roughness={1} />
      </mesh>
      <Instances limit={flags.length} material={flagMat} geometry={flagGeo} castShadow>
        {flags.map((f, i) => (
          <Instance key={i} position={f.p} rotation={[0, f.yaw, 0]} color={f.color} />
        ))}
      </Instances>
    </group>
  );
}

/** Arch shape (rectangle with a semicircular opening) extruded into a building-block arch. */
export function useArchGeometry(width: number, height: number, depth: number, openingR: number) {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-width / 2, 0);
    s.lineTo(width / 2, 0);
    s.lineTo(width / 2, height);
    s.lineTo(-width / 2, height);
    s.lineTo(-width / 2, 0);
    const hole = new THREE.Path();
    hole.moveTo(openingR, 0);
    hole.absarc(0, 0, openingR, 0, Math.PI, false);
    hole.lineTo(openingR, 0);
    s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2, curveSegments: 16 });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [width, height, depth, openingR]);
}
