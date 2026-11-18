import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim, restingElimT } from '../../character/anim';
import { MiniContender, createMiniAnim } from '../../character/MiniContender';
import { matchBus } from '../session';
import type { Contestant, MinigameSceneProps } from '../types';
import { DIRECTIONS, SIZE, type InfernoState } from './rules';

const CELL = 3.8;
const coord = (n: number) => (n - 5) * CELL;

function Block({ i, getState }: { i: number; getState: () => InfernoState | null }) {
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const tile = getState()?.tiles?.[i];
    mesh.current.visible = !!tile && tile !== 'floor';
    const mat = mesh.current.material as THREE.MeshStandardMaterial;
    mat.color.set(tile === 'wall' ? PALETTE.toyBlue : tile === 'edge' ? PALETTE.woodDark : PALETTE.cardboard);
    const attack = getState()?.attack;
    mat.emissive.set(attack && attack.x === i % SIZE && attack.z === Math.floor(i / SIZE) ? PALETTE.coral : '#000000');
    mat.emissiveIntensity = 0.45;
    mesh.current.scale.y = tile === 'edge' ? 0.45 : 1;
  });
  return <mesh ref={mesh} position={[coord(i % SIZE), 1, coord(Math.floor(i / SIZE))]} castShadow receiveShadow>
    <boxGeometry args={[CELL - 0.18, 2, CELL - 0.18]} /><meshStandardMaterial roughness={0.9} />
  </mesh>;
}

function Toy({ c, getState }: { c: Contestant; getState: () => InfernoState | null }) {
  const root = useRef<THREE.Group>(null!);
  const marker = useRef<THREE.Mesh>(null!);
  const full = useRef(createToyAnim());
  const mini = useRef(createMiniAnim());
  useFrame((_, dt) => {
    const state = getState();
    const p = state?.furnace ? state.players.find(p => p.id === c.id) : undefined;
    root.current.visible = !!p;
    if (!p) return;
    root.current.position.set(coord(p.x), 0.2, coord(p.z));
    root.current.rotation.y = Math.PI - p.facing * Math.PI / 2;
    if (!p.alive) { full.current.elimT = restingElimT(Math.max(0, full.current.elimT) + dt); if (mini.current.outT < 0) mini.current.outT = 0; }
    else { full.current.elimT = -1; mini.current.outT = -1; }
    marker.current.visible = c.isLocal && p.alive;
  });
  return <group ref={root}>
    {c.isLocal ? <WindupBot anim={full} paint={c.paint} hat={c.hat} keySkin={c.keySkin} /> : <MiniContender anim={mini} paint={c.paint} />}
    <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}><ringGeometry args={[1.3, 1.6, 24]} /><meshBasicMaterial color={PALETTE.honey} /></mesh>
  </group>;
}

export function InfernoScene({ getState, contestants }: MinigameSceneProps<InfernoState>) {
  const furnace = useRef<THREE.Group>(null!);
  const target = useRef<THREE.Mesh>(null!);
  const { camera } = useThree();
  useEffect(() => matchBus.on('event', e => {
    if (e.type === 'broken') sfx.bump();
    if (e.type === 'built') sfx.click();
    if (e.type === 'hunt') sfx.bell();
    if (e.type === 'eliminated') sfx.eliminate();
  }), []);
  useFrame(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    // Fit the full board above the thumb controls in either orientation.
    const distance = Math.max(58, 32 / perspective.aspect);
    camera.position.set(0, distance, distance * 0.52);
    camera.lookAt(0, 0, 1);
    const s = getState();
    furnace.current.visible = !!s?.furnace && s.phase !== 'prepare';
    if (!s?.furnace) { target.current.visible = false; return; }
    furnace.current.position.set(coord(s.furnace.x), 0.3, coord(s.furnace.z));
    const local = s.players.find(p => p.id === contestants.find(c => c.isLocal)?.id);
    target.current.visible = !!local?.alive;
    if (local) { const [dx, dz] = DIRECTIONS[local.facing]; target.current.position.set(coord(local.x + dx), 2.2, coord(local.z + dz)); }
  });
  return <group>
    <mesh position={[0, -0.4, 0]} receiveShadow><boxGeometry args={[SIZE * CELL + 2, 0.8, SIZE * CELL + 2]} /><meshStandardMaterial color={PALETTE.woodMid} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow><planeGeometry args={[SIZE * CELL, SIZE * CELL]} /><meshStandardMaterial color={PALETTE.feltDark} /></mesh>
    {Array.from({ length: SIZE * SIZE }, (_, i) => <Block key={i} i={i} getState={getState} />)}
    {contestants.map(c => <Toy key={c.id} c={c} getState={getState} />)}
    <mesh ref={target} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.7, 1, 4]} /><meshBasicMaterial color={PALETTE.honey} side={THREE.DoubleSide} /></mesh>
    <group ref={furnace}>
      <mesh position={[0, 1.2, 0]} castShadow><boxGeometry args={[2.7, 2.4, 2.7]} /><meshStandardMaterial color={PALETTE.coral} roughness={0.5} /></mesh>
      <mesh position={[0, 2.8, 0]}><cylinderGeometry args={[0.5, 0.7, 1, 12]} /><meshStandardMaterial color={PALETTE.brass} metalness={0.7} roughness={0.4} /></mesh>
      <mesh position={[0, 1.2, 1.38]}><planeGeometry args={[1.8, 1.1]} /><meshStandardMaterial color={PALETTE.ink} emissive={PALETTE.honey} emissiveIntensity={0.6} /></mesh>
    </group>
  </group>;
}
