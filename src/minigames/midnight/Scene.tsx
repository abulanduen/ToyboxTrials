import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim, restingElimT } from '../../character/anim';
import { MiniContender, createMiniAnim } from '../../character/MiniContender';
import { matchBus } from '../session';
import type { Contestant, MinigameSceneProps } from '../types';
import { SHELTERS, SIZE, type HungerState } from './rules';
import { YouMarker } from '../shared/YouMarker';

const CELL = 3.5;
const coord = (n: number) => (n - 5) * CELL;
function Toy({ c, getState }: { c: Contestant; getState: () => HungerState | null }) {
  const root = useRef<THREE.Group>(null!);
  const health = useRef<THREE.Group>(null!);
  const energyFill = useRef<THREE.Mesh>(null!);
  const full = useRef(createToyAnim()); const mini = useRef(createMiniAnim());
  const previous = useRef({ x: 0, z: 0 });
  useFrame(({ camera, size }, dt) => {
    const s = getState(); const p = s?.kind === 'midnight-hunger' ? s.players.find(p => p.id === c.id) : undefined;
    root.current.visible = !!p;
    if (!p || !s) return;
    const fraction = THREE.MathUtils.clamp(p.energy / s.config.maxEnergy, 0, 1);
    health.current.visible = p.alive;
    energyFill.current.visible = fraction > 0;
    energyFill.current.scale.x = Math.max(0.001, fraction);
    energyFill.current.position.x = -1.4 * (1 - fraction);
    (energyFill.current.material as THREE.MeshBasicMaterial).color.set(
      fraction > 0.5 ? PALETTE.sage : fraction > 0.25 ? PALETTE.honey : PALETTE.coral,
    );
    const moved = previous.current.x !== p.x || previous.current.z !== p.z;
    if (moved) mini.current.hopT = 0;
    full.current.speed = moved ? 8 : full.current.speed * Math.exp(-dt * 12);
    full.current.stepPhase += full.current.speed * dt;
    full.current.elimT = p.alive ? -1 : restingElimT(Math.max(0, full.current.elimT) + dt);
    if (!p.alive && mini.current.outT < 0) mini.current.outT = 0;
    previous.current = { x: p.x, z: p.z };
    root.current.position.set(coord(p.x), 0.2, coord(p.z));
    root.current.rotation.y = Math.PI - p.facing * Math.PI / 2;
    // Keep the fill readable on short landscape screens as well as a large desktop canvas.
    const distance = Math.max(1, camera.position.distanceTo(root.current.position));
    const pixelsPerUnit = size.height / (2 * Math.tan((camera as THREE.PerspectiveCamera).fov * Math.PI / 360) * distance);
    health.current.scale.y = Math.max(1, 8 / (0.6 * pixelsPerUnit));
  });
  return <group ref={root}>
    {c.isLocal ? <WindupBot anim={full} paint={c.paint} hat={c.hat} keySkin={c.keySkin} /> : <MiniContender anim={mini} paint={c.paint} />}
    {c.isLocal && <YouMarker height={6.2} />}
    {c.isLocal && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}><ringGeometry args={[1.2, 1.5, 24]} /><meshBasicMaterial color={PALETTE.honey} /></mesh>}
    <Billboard ref={health} position={[0, 5, 0]} renderOrder={10}>
      <mesh><planeGeometry args={[3.1, 0.6]} /><meshBasicMaterial color={c.isLocal ? PALETTE.honey : PALETTE.cream} depthTest={false} depthWrite={false} toneMapped={false} fog={false} /></mesh>
      <mesh position={[0, 0, 0.01]}><planeGeometry args={[2.8, 0.3]} /><meshBasicMaterial color={PALETTE.inkPurple} depthTest={false} depthWrite={false} toneMapped={false} fog={false} /></mesh>
      <mesh ref={energyFill} position={[0, 0, 0.02]}><planeGeometry args={[2.8, 0.3]} /><meshBasicMaterial color={PALETTE.sage} depthTest={false} depthWrite={false} toneMapped={false} fog={false} /></mesh>
    </Billboard>
  </group>;
}

function BatteryToy({ id, getState }: { id: number; getState: () => HungerState | null }) {
  const root = useRef<THREE.Group>(null!);
  const pips = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const s = getState(); const b = s?.kind === 'midnight-hunger' && s.phase === 'night' ? s.batteries.find(b => b.id === id && b.caughtBy === null) : undefined;
    root.current.visible = !!b;
    if (b) root.current.position.set(coord(b.x), 0.8 + Math.sin(clock.elapsedTime * 5 + id) * 0.12, coord(b.z));
    pips.current.children.forEach((pip, i) => { pip.visible = !!b && i < 3 - b.hits; });
  });
  return <group ref={root}>
    <group ref={pips} position={[0, 1.6, 0]}>{[-0.6, 0, 0.6].map(x => <mesh key={x} position={[x, 0, 0]}><sphereGeometry args={[0.2, 8, 8]} /><meshBasicMaterial color={PALETTE.cream} /></mesh>)}</group>
    <mesh castShadow><boxGeometry args={[1.4, 1.1, 1.2]} /><meshStandardMaterial color={PALETTE.honey} emissive={PALETTE.honey} emissiveIntensity={0.4} /></mesh>
    <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.45, 0.45, 0.45, 10]} /><meshStandardMaterial color={PALETTE.brass} /></mesh>
    <mesh position={[0, 0, 0.62]}><boxGeometry args={[0.65, 0.18, 0.08]} /><meshBasicMaterial color={PALETTE.ink} /></mesh>
    <mesh position={[0, 0, 0.63]}><boxGeometry args={[0.18, 0.65, 0.08]} /><meshBasicMaterial color={PALETTE.ink} /></mesh>
    {[-0.5, 0.5].map(x => <mesh key={x} position={[x, -0.7, 0]}><sphereGeometry args={[0.3, 8, 8]} /><meshStandardMaterial color={PALETTE.inkPurple} /></mesh>)}
  </group>;
}

export function HungerScene({ getState, contestants }: MinigameSceneProps<HungerState>) {
  const floor = useRef<THREE.Mesh>(null!); const lamp = useRef<THREE.Mesh>(null!);
  const { camera } = useThree();
  useEffect(() => matchBus.on('event', e => {
    if (e.type === 'battery') sfx.reward();
    if (e.type === 'battery-hit') sfx.bump();
    if (e.type === 'night') sfx.musicBox();
    if (e.type === 'day') sfx.bell();
    if (e.type === 'eliminated') sfx.eliminate();
  }), []);
  useFrame(() => {
    const distance = Math.max(56, 31 / (camera as THREE.PerspectiveCamera).aspect);
    camera.position.set(0, distance, distance * 0.52); camera.lookAt(0, 0, 1);
    const s = getState(); const night = s?.kind !== 'midnight-hunger' || s.phase === 'night';
    (floor.current.material as THREE.MeshStandardMaterial).color.set(night ? PALETTE.inkPurple : PALETTE.sage);
    (lamp.current.material as THREE.MeshBasicMaterial).color.set(night ? PALETTE.toyBlue : PALETTE.honey);
  });
  return <group>
    <mesh position={[0, -0.4, 0]} receiveShadow><boxGeometry args={[SIZE * CELL + 2, 0.8, SIZE * CELL + 2]} /><meshStandardMaterial color={PALETTE.woodMid} /></mesh>
    <mesh ref={floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow><planeGeometry args={[SIZE * CELL, SIZE * CELL]} /><meshStandardMaterial roughness={1} /></mesh>
    {SHELTERS.map((c, i) => <group key={i} position={[coord(c.x), 0, coord(c.z)]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><planeGeometry args={[CELL * 3, CELL * 3]} /><meshStandardMaterial color={PALETTE.felt} /></mesh>
      {[-4.7, 4.7].flatMap(x => [-4.7, 4.7].map(z => <mesh key={`${x}:${z}`} position={[x, 2.5, z]}><cylinderGeometry args={[0.2, 0.2, 5, 8]} /><meshStandardMaterial color={PALETTE.woodDark} /></mesh>))}
      {/* Raised translucent cardboard roofs keep the protected footprint and occupants readable. */}
      <mesh position={[0, 5.2, 0]}><boxGeometry args={[CELL * 3, 0.4, CELL * 3]} /><meshStandardMaterial color={PALETTE.cardboard} transparent opacity={0.28} depthWrite={false} /></mesh>
    </group>)}
    <mesh ref={lamp} position={[0, 0.1, -17]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.8, 24]} /><meshBasicMaterial /></mesh>
    {contestants.map(c => <Toy key={c.id} c={c} getState={getState} />)}
    {Array.from({ length: 7 }, (_, id) => <BatteryToy key={id} id={id} getState={getState} />)}
  </group>;
}
