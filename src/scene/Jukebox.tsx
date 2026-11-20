/**
 * The Hub's Jukebox: a chunky wooden music-box cabinet beside the Music Box Rhythm gate. Crank it
 * (interact) to open the track list and pick the Hub's background music (src/ui/WelcomeUI.tsx,
 * src/game/musicScore.ts HUB_TRACKS). Its pinned brass drum turns while music plays and little
 * notes drift up from the top.
 *
 * Code-built: the cabinet is one merged mesh; the drum, the crank and three notes move.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { events } from '../game/events';
import { useGame } from '../game/store';
import { camBlock } from '../game/player';
import { TRACK_OFF } from '../game/musicScore';
import { JUKEBOX } from './layout';
import { Kit } from './kit';

const P = PALETTE;
const BODY_H = 4.2;
const ARCH_R = JUKEBOX.w / 2 - 0.1;

let cabinet: THREE.BufferGeometry | null = null;
function cabinetGeo() {
  if (cabinet) return cabinet;
  const k = new Kit();
  const { w, d } = JUKEBOX;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.ball(0.35, sx * (w / 2 - 0.5), 0.3, sz * (d / 2 - 0.5), P.brass, 10, { s: [1, 0.8, 1] });
  k.block(w, BODY_H, d, 0, 0.5 + BODY_H / 2, 0, P.woodMid);
  // arched top: a half drum lying across, honey with a cream rim
  k.cyl(ARCH_R, ARCH_R, d - 0.2, 0, 0.5 + BODY_H, 0, P.honey, 24, { rx: Math.PI / 2 });
  k.cyl(ARCH_R - 0.5, ARCH_R - 0.5, d, 0, 0.5 + BODY_H, 0.02, P.cream, 24, { rx: Math.PI / 2 });
  k.cyl(ARCH_R - 0.75, ARCH_R - 0.75, d + 0.04, 0, 0.5 + BODY_H, 0.02, P.coral, 24, { rx: Math.PI / 2 });
  // front: a cream panel with a window onto the drum, a comb, and five little track buttons
  k.box(w - 0.7, BODY_H - 0.9, 0.08, 0, 0.5 + BODY_H / 2 - 0.15, d / 2 + 0.01, P.cream);
  k.box(w - 1.3, 1.5, 0.1, 0, 3.0, d / 2 + 0.03, P.ink);
  for (let i = 0; i < 9; i++) k.box(0.12, 0.5, 0.06, -1.3 + i * 0.32, 2.05, d / 2 + 0.06, P.steel);
  const btn = [P.coral, P.honey, P.sage, P.toyBlue, P.inkPurple];
  btn.forEach((c, i) => k.cyl(0.22, 0.24, 0.16, -1.4 + i * 0.7, 1.25, d / 2 + 0.08, c, 12, { rx: Math.PI / 2 }));
  // a brass horn on the top, turned towards the road
  k.cyl(0.18, 0.18, 0.8, 1.2, 0.5 + BODY_H + ARCH_R - 0.6, -0.3, P.brass, 8);
  k.cone(0.75, 1.1, 1.2, 0.5 + BODY_H + ARCH_R + 0.3, 0.2, P.brass, 16, { rx: -2.3 });
  // crank boss on the right side
  k.cyl(0.32, 0.32, 0.25, w / 2 + 0.1, 3.0, 0, P.brass, 12, { rz: Math.PI / 2 });
  cabinet = k.build().solid!;
  return cabinet;
}

const drumGeo = new THREE.CylinderGeometry(0.55, 0.55, 3.2, 16).rotateZ(Math.PI / 2);
const pinGeo = new THREE.SphereGeometry(0.07, 5, 4);
const noteHead = new THREE.SphereGeometry(0.28, 10, 8).scale(1.2, 0.85, 0.6);
const noteStem = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5).translate(0.28, 0.45, 0);

export function Jukebox() {
  const geo = useMemo(cabinetGeo, []);
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
      brass: new THREE.MeshStandardMaterial({ color: P.brass, roughness: 0.3, metalness: 0.85 }),
      knob: new THREE.MeshStandardMaterial({ color: P.woodDark, roughness: 0.6 }),
      notes: [P.coral, P.toyBlue, P.sage].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, transparent: true })),
    }),
    [],
  );
  const pins = useMemo(() => {
    const list: [number, number, number][] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      list.push([-1.4 + ((i * 7) % 13) * 0.22, Math.cos(a) * 0.56, Math.sin(a) * 0.56]);
    }
    return list;
  }, []);
  const drum = useRef<THREE.Group>(null!);
  const crank = useRef<THREE.Group>(null!);
  const notes = useRef<(THREE.Group | null)[]>([]);
  const spin = useRef(0);
  useEffect(() => events.on('prop:jukebox-crank', () => (spin.current = 1.4)), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const t = state.clock.elapsedTime;
    const on = useGame.getState().hubTrack !== TRACK_OFF;
    spin.current = Math.max(0, spin.current - dt);
    drum.current.rotation.x += dt * (on ? 0.6 : 0) + dt * spin.current * 4;
    crank.current.rotation.x += dt * spin.current * 9;
    notes.current.forEach((n, i) => {
      if (!n) return;
      const k = (t * 0.32 + i / 3) % 1;
      n.visible = on;
      n.position.set(-0.8 + i * 0.8 + Math.sin(t * 1.5 + i) * 0.3, JUKEBOX.h + 0.3 + k * 3.2, 0.2);
      n.rotation.z = Math.sin(t * 2 + i) * 0.3;
      (mats.notes[i] as THREE.MeshStandardMaterial).opacity = Math.sin(k * Math.PI);
    });
  });

  return (
    <group position={[JUKEBOX.x, 0, JUKEBOX.z]} rotation={[0, JUKEBOX.rot, 0]}>
      <mesh geometry={geo} material={mats.body} castShadow receiveShadow ref={camBlock} />
      <group ref={drum} position={[0, 3.0, JUKEBOX.d / 2 - 0.65]}>
        <mesh geometry={drumGeo} material={mats.brass} />
        {pins.map((p, i) => (
          <mesh key={i} geometry={pinGeo} material={mats.brass} position={p} />
        ))}
      </group>
      <group ref={crank} position={[JUKEBOX.w / 2 + 0.25, 3.0, 0]}>
        <mesh material={mats.brass} position={[0.1, 0.45, 0]}>
          <boxGeometry args={[0.14, 1.0, 0.14]} />
        </mesh>
        <mesh material={mats.knob} position={[0.35, 0.9, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.5, 8]} />
        </mesh>
      </group>
      {mats.notes.map((m, i) => (
        <group
          key={i}
          ref={(g) => {
            notes.current[i] = g;
          }}
        >
          <mesh geometry={noteHead} material={m} />
          <mesh geometry={noteStem} material={m} />
        </group>
      ))}
    </group>
  );
}
