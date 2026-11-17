/**
 * Lightweight contender (~10 meshes vs ~70 for WindupBot) for opponents, audiences and crowds.
 * Same silhouette language — block body, turret eye, brass key — so it reads as the same species.
 * Animation is driven by a small mutable `MiniAnim` the owner updates (no React state per frame).
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE, type PaintJob } from '../game/palette';

export interface MiniAnim {
  /** Seconds since the last hop (e.g. pressed a note), or large. */
  hopT: number;
  /** Seconds since elimination started, or -1. */
  outT: number;
  /** Seconds since a celebration started, or -1. */
  cheerT: number;
}

export function createMiniAnim(): MiniAnim {
  return { hopT: 99, outT: -1, cheerT: -1 };
}

const geo = {
  body: new THREE.BoxGeometry(1.5, 1.4, 1.1),
  head: new THREE.BoxGeometry(1.15, 0.8, 0.95),
  turret: new THREE.CylinderGeometry(0.4, 0.42, 0.5, 14).rotateX(Math.PI / 2),
  eye: new THREE.CircleGeometry(0.3, 16),
  pupil: new THREE.CircleGeometry(0.14, 12),
  foot: new THREE.BoxGeometry(0.6, 0.35, 0.85),
  key: new THREE.TorusGeometry(0.22, 0.07, 6, 12),
  chest: new THREE.PlaneGeometry(0.8, 0.5),
};
const eyeMat = new THREE.MeshStandardMaterial({ color: '#FFFDF6', roughness: 0.3 });
const inkMat = new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.6 });
const brassMat = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.32, metalness: 0.85 });
const greyMat = new THREE.MeshStandardMaterial({ color: '#8E8A93', roughness: 0.8 });

export function MiniContender({ paint, anim, scale = 1 }: { paint: PaintJob; anim: React.RefObject<MiniAnim>; scale?: number }) {
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: paint.body, roughness: 0.45 }),
      trim: new THREE.MeshStandardMaterial({ color: paint.trim, roughness: 0.5 }),
      accent: new THREE.MeshStandardMaterial({ color: paint.accent, roughness: 0.45 }),
    }),
    [paint],
  );
  const root = useRef<THREE.Group>(null!);
  const keyRef = useRef<THREE.Group>(null!);
  const bodyMesh = useRef<THREE.Mesh>(null!);
  const headMesh = useRef<THREE.Mesh>(null!);
  const phase = useMemo(() => Math.random() * 10, []);

  useFrame((s, rawDt) => {
    const a = anim.current;
    if (!a) return;
    const dt = Math.min(rawDt, 1 / 20);
    const t = s.clock.elapsedTime + phase;
    a.hopT += dt;
    if (a.outT >= 0) a.outT += dt;
    if (a.cheerT >= 0) a.cheerT += dt;
    let y = Math.sin(t * 2.2) * 0.03;
    let rx = 0;
    let rz = 0;
    if (a.hopT < 0.35) y += Math.sin((a.hopT / 0.35) * Math.PI) * 0.5;
    if (a.cheerT >= 0) {
      y += Math.abs(Math.sin(a.cheerT * 9)) * 0.6;
      rz = Math.sin(a.cheerT * 9) * 0.12;
    }
    if (a.outT >= 0) {
      const k = Math.min(1, a.outT / 0.6);
      rx = -k * (Math.PI / 2) * 0.95; // topple backwards
      y += Math.sin(k * Math.PI) * 0.8 + k * 0.5;
    }
    root.current.position.y = y;
    root.current.rotation.set(rx, 0, rz);
    keyRef.current.rotation.z += dt * (a.outT >= 0 ? 0 : 2.5);
    const out = a.outT >= 0;
    bodyMesh.current.material = out ? greyMat : mats.body;
    headMesh.current.material = out ? greyMat : mats.body;
  });

  return (
    <group scale={scale}>
      <group ref={root}>
        {[-0.4, 0.4].map((x) => (
          <mesh key={x} geometry={geo.foot} position={[x, 0.18, 0.08]} material={mats.body} castShadow />
        ))}
        <mesh ref={bodyMesh} geometry={geo.body} position={[0, 1.05, 0]} material={mats.body} castShadow />
        <mesh geometry={geo.chest} position={[0, 1.1, 0.56]} material={mats.trim} />
        <mesh ref={headMesh} geometry={geo.head} position={[0, 2.15, 0]} material={mats.body} castShadow />
        <mesh geometry={geo.turret} position={[0, 2.85, 0.02]} material={mats.accent} castShadow />
        <mesh geometry={geo.eye} position={[0, 2.85, 0.28]} material={eyeMat} />
        <mesh geometry={geo.pupil} position={[0, 2.85, 0.29]} material={inkMat} />
        <group ref={keyRef} position={[0, 1.2, -0.75]}>
          <mesh geometry={geo.key} position={[0.25, 0, 0]} material={brassMat} />
          <mesh geometry={geo.key} position={[-0.25, 0, 0]} material={brassMat} />
        </group>
      </group>
    </group>
  );
}
