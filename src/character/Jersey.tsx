/**
 * A team jersey for a toy: a code-built vest in the team colour with a white collar and hem and the
 * player's number on the front and back. A shared option of both renderers (`jersey` on WindupBot
 * and MiniContender); unset, nothing changes. The numbers are small canvas textures, made once per
 * number and shared.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { RoundedBox } from '../scene/RoundedBox';

export interface JerseyLook {
  /** Vest colour (PALETTE.teamRed / teamBlue). */
  color: string;
  number: number;
}

const numberTex = new Map<number, THREE.CanvasTexture>();
/** The number in white with an ink outline, on a clear background. */
function numberTexture(n: number): THREE.CanvasTexture {
  const hit = numberTex.get(n);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const text = String(n);
  g.font = `bold ${text.length > 1 ? 84 : 100}px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = PALETTE.ink;
  g.strokeText(text, 64, 70);
  g.fillStyle = PALETTE.white;
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  numberTex.set(n, t);
  return t;
}

const plane = new THREE.PlaneGeometry(1, 1);
const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.white, roughness: 0.6 });
const vestMats = new Map<string, THREE.MeshStandardMaterial>();
const vestMat = (c: string) => {
  let m = vestMats.get(c);
  if (!m) vestMats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.62 })));
  return m;
};
const numMats = new Map<number, THREE.MeshStandardMaterial>();
const numMat = (n: number) => {
  let m = numMats.get(n);
  if (!m) numMats.set(n, (m = new THREE.MeshStandardMaterial({ map: numberTexture(n), transparent: true, alphaTest: 0.35, roughness: 0.6, depthWrite: false })));
  return m;
};

/** Sizes for each renderer's torso (cm, in the toy's own frame). */
const FIT = {
  /** The full WindupBot: over its rounded body and chest gauge. */
  full: { w: 1.62, h: 0.84, d: 1.28, y: 1.36, num: 0.62, numY: 1.36, backY: 1.52 },
  /** MiniContender: over its block body. */
  mini: { w: 1.6, h: 1.0, d: 1.2, y: 1.18, num: 0.66, numY: 1.18, backY: 1.25 },
} as const;

export function Jersey({ look, fit }: { look: JerseyLook; fit: keyof typeof FIT }) {
  const f = FIT[fit];
  const vest = vestMat(look.color);
  const num = useMemo(() => numMat(Math.max(0, Math.min(99, Math.round(look.number)))), [look.number]);
  return (
    <group name="jersey">
      <RoundedBox args={[f.w, f.h, f.d]} radius={0.12} smoothness={2} position={[0, f.y, 0]} material={vest} castShadow />
      {/* collar and hem stripes */}
      <mesh position={[0, f.y + f.h / 2 - 0.05, 0]} material={trimMat}>
        <boxGeometry args={[f.w + 0.02, 0.09, f.d + 0.02]} />
      </mesh>
      <mesh position={[0, f.y - f.h / 2 + 0.07, 0]} material={trimMat}>
        <boxGeometry args={[f.w + 0.02, 0.07, f.d + 0.02]} />
      </mesh>
      {/* the number, front and back */}
      <mesh geometry={plane} material={num} position={[0, f.numY, f.d / 2 + 0.012]} scale={[f.num, f.num, 1]} />
      <mesh geometry={plane} material={num} position={[0, f.backY, -f.d / 2 - 0.012]} rotation={[0, Math.PI, 0]} scale={[f.num, f.num, 1]} />
    </group>
  );
}
