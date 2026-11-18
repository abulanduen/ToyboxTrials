import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { matchBus } from '../session';
import type { MinigameSceneProps } from '../types';
import { ROSTER, type SquadState } from './rules';

const xPos = (x: number) => (x - 3.5) * 3.5;
function Piece({ slot, side, getState, localId }: { slot: number; side: 0 | 1; getState: () => SquadState | null; localId: string }) {
  const root = useRef<THREE.Group>(null!); const body = useRef<THREE.Mesh>(null!);
  const barrel = useRef<THREE.Mesh>(null!); const ears = useRef<THREE.Group>(null!); const hp = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const s = getState(); root.current.visible = false; if (s?.kind !== 'toy-squad') return;
    const p = s.players.find(p => p.id === localId);
    const battle = s.battles.find(b => b.owner === localId);
    const fighter = battle?.fighters.filter(u => u.side === side)[slot];
    const buildUnit = s.phase === 'build' && side === 0 ? p?.units[slot] : undefined;
    const unit = s.phase === 'build' ? buildUnit : fighter;
    if (!unit) return;
    root.current.visible = true;
    const x = buildUnit ? buildUnit.cell % 3 : fighter!.x;
    const z = buildUnit ? Math.floor(buildUnit.cell / 3) : fighter!.z;
    const alive = buildUnit || fighter!.hp > 0;
    root.current.position.set(xPos(x), alive ? 0.3 : 0.05, (z - 0.5) * 5);
    root.current.scale.setScalar(alive ? 1 + (unit.tier - 1) * 0.12 : 0.3);
    (body.current.material as THREE.MeshStandardMaterial).color.set(ROSTER[unit.kind].colour);
    barrel.current.visible = unit.kind === 'soldier'; ears.current.visible = unit.kind === 'hare';
    hp.current.scale.x = buildUnit ? 1 : Math.max(0.01, fighter!.hp / fighter!.maxHp);
  });
  return <group ref={root}>
    <mesh ref={body} position={[0, 1.1, 0]} castShadow><boxGeometry args={[1.5, 1.6, 1.4]} /><meshStandardMaterial roughness={0.45} /></mesh>
    <mesh position={[0, 2.15, 0]}><sphereGeometry args={[0.65, 12, 10]} /><meshStandardMaterial color={side === 0 ? PALETTE.cream : PALETTE.coral} /></mesh>
    <mesh position={[side === 0 ? 0.59 : -0.59, 2.2, 0]} rotation={[0, Math.PI / 2, 0]}><circleGeometry args={[0.21, 12]} /><meshBasicMaterial color={PALETTE.ink} side={THREE.DoubleSide} /></mesh>
    <mesh ref={barrel} position={[side === 0 ? 1 : -1, 1.2, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.15, 0.15, 1.2, 8]} /><meshStandardMaterial color={PALETTE.brass} /></mesh>
    <group ref={ears}>{[-0.3, 0.3].map(z => <mesh key={z} position={[0, 2.9, z]}><boxGeometry args={[0.25, 1, 0.25]} /><meshStandardMaterial color={PALETTE.honey} /></mesh>)}</group>
    {[-0.5, 0.5].map(z => <mesh key={z} position={[0, 0.2, z]}><boxGeometry args={[1.7, 0.35, 0.45]} /><meshStandardMaterial color={PALETTE.inkPurple} /></mesh>)}
    <mesh ref={hp} position={[0, 3.7, 0]}><boxGeometry args={[1.6, 0.2, 0.2]} /><meshBasicMaterial color={PALETTE.sage} /></mesh>
  </group>;
}

export function SquadScene({ getState, localId }: MinigameSceneProps<SquadState>) {
  const { camera } = useThree();
  useEffect(() => matchBus.on('event', e => {
    if (e.type === 'squad-buy') sfx.click();
    if (e.type === 'squad-upgrade') sfx.reward();
    if (e.type === 'squad-battle') sfx.bell();
    if (e.type === 'squad-recap') sfx.musicBox();
  }), []);
  useFrame(() => {
    const aspect = (camera as THREE.PerspectiveCamera).aspect;
    const build = getState()?.phase === 'build';
    const distance = Math.max(38, 22 / aspect);
    camera.position.set(0, distance, distance * 0.7);
    camera.lookAt(0, 0, build && aspect < 0.8 ? 10 : 0);
  });
  return <group>
    <mesh position={[0, -0.5, 0]} receiveShadow><boxGeometry args={[32, 1, 15]} /><meshStandardMaterial color={PALETTE.woodMid} /></mesh>
    {Array.from({ length: 16 }, (_, i) => <mesh key={i} position={[xPos(i % 8), 0.06, (Math.floor(i / 8) - 0.5) * 5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[3.35, 4.8]} /><meshStandardMaterial color={i % 8 < 3 ? PALETTE.felt : i % 8 > 4 ? PALETTE.cardboard : PALETTE.cream} />
    </mesh>)}
    {([0, 1] as const).flatMap(side => Array.from({ length: 6 }, (_, slot) => <Piece key={`${side}:${slot}`} slot={slot} side={side} getState={getState} localId={localId} />))}
  </group>;
}
