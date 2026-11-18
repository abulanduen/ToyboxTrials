import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { matchBus, useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { MAX_UNITS, ROSTER, deploymentPosition, type AttackEffect, type SquadState } from './rules';
import { boardToWorld, CELL_SIZE, worldToDeployment } from './board';
import { submitSquadInput } from './local';
import { RARITY_COLOURS } from './catalogue';

interface Drag { unit: number; pointer: number; x: number; z: number; cell: number | null; release: () => void }
type PointerHandler = (e: ThreeEvent<PointerEvent>, id?: number) => void;
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
const starShape = new THREE.Shape();
for (let i = 0; i < 10; i++) { const angle = i * Math.PI / 5, r = i % 2 ? 0.12 : 0.28; if (i) starShape.lineTo(Math.sin(angle) * r, Math.cos(angle) * r); else starShape.moveTo(0, r); }
starShape.closePath();
const starGeometry = new THREE.ShapeGeometry(starShape);
const editable = (s: SquadState | null, id: string) => s?.kind === 'toy-squad' && s.phase === 'build'
  && !s.players.find(p => p.id === id)?.ready && !useMatch.getState().paused && useMatch.getState().phase === 'playing';

function Piece({ slot, side, getState, localId, drag, down, move, up, cancel }: {
  slot: number; side: 0 | 1; getState: () => SquadState | null; localId: string;
  drag: RefObject<Drag | null>; down: PointerHandler; move: PointerHandler; up: PointerHandler; cancel: () => void;
}) {
  const root = useRef<THREE.Group>(null!); const model = useRef<THREE.Group>(null!); const body = useRef<THREE.Mesh>(null!);
  const barrel = useRef<THREE.Mesh>(null!); const ears = useRef<THREE.Group>(null!); const hp = useRef<THREE.Mesh>(null!);
  const currentId = useRef<number | null>(null); const yaw = useRef(0);
  const stars = useRef<THREE.Group>(null!);
  const mana = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    const s = getState(); root.current.visible = false; currentId.current = null;
    if (s?.kind !== 'toy-squad') return;
    const p = s.players.find(p => p.id === localId);
    const battle = s.battles.find(b => b.owner === localId);
    const fighter = battle?.fighters.filter(u => u.side === side)[slot];
    const buildUnit = s.phase === 'build' && side === 0 ? p?.units.filter(u => u.cell >= 0)[slot] : undefined;
    const unit = s.phase === 'build' ? buildUnit : fighter;
    if (!unit) return;
    currentId.current = buildUnit?.id ?? null; root.current.visible = true;
    const pos = buildUnit ? deploymentPosition(buildUnit.cell, side) : fighter!;
    const dragging = buildUnit && drag.current?.unit === buildUnit.id ? drag.current : null;
    const alive = !!buildUnit || fighter!.hp > 0;
    if (!alive) { root.current.visible = false; currentId.current = null; return; }
    root.current.position.set(dragging?.x ?? boardToWorld(pos.x), dragging ? 1.1 : alive ? 0.3 : 0.05, dragging?.z ?? boardToWorld(pos.z));
    root.current.scale.setScalar(alive ? 1 + (unit.tier - 1) * 0.12 : 0.3);
    const targetYaw = buildUnit ? Math.PI : fighter!.facing ?? (side === 0 ? Math.PI : 0);
    const delta = Math.atan2(Math.sin(targetYaw - yaw.current), Math.cos(targetYaw - yaw.current));
    yaw.current += delta * (1 - Math.exp(-dt * 14)); model.current.rotation.y = yaw.current;
    (body.current.material as THREE.MeshStandardMaterial).color.set(ROSTER[unit.kind].colour);
    barrel.current.visible = ROSTER[unit.kind].range > 1; ears.current.visible = ROSTER[unit.kind].shape === 'beast';
    body.current.scale.set(ROSTER[unit.kind].shape === 'robot' ? 1.2 : 1, 1, ROSTER[unit.kind].shape === 'beast' ? 1.2 : 1);
    (hp.current.material as THREE.MeshBasicMaterial).color.set(RARITY_COLOURS[ROSTER[unit.kind].rarity]);
    hp.current.scale.x = buildUnit ? 1 : Math.max(0.01, fighter!.hp / fighter!.maxHp);
    mana.current.visible = !buildUnit;
    mana.current.scale.x = buildUnit ? 0.01 : Math.max(0.01, fighter!.magic.mana / fighter!.magic.maxMana);
    stars.current.children.forEach((mesh, i) => { mesh.visible = i < unit.tier; });
  });
  return <group ref={root} onPointerDown={e => { if (currentId.current !== null) down(e, currentId.current); }}
    onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    <mesh position={[0, 0.1, 0]}><boxGeometry args={[2.8, 0.3, 2.8]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    <group ref={model}>
      <mesh ref={body} position={[0, 1.1, 0]} castShadow><boxGeometry args={[1.5, 1.6, 1.4]} /><meshStandardMaterial roughness={0.45} /></mesh>
      <mesh position={[0, 2.15, 0]}><sphereGeometry args={[0.65, 12, 10]} /><meshStandardMaterial color={side === 0 ? PALETTE.cream : PALETTE.coral} /></mesh>
      <mesh position={[0, 2.2, 0.6]}><circleGeometry args={[0.21, 12]} /><meshBasicMaterial color={PALETTE.ink} side={THREE.DoubleSide} /></mesh>
      <mesh ref={barrel} position={[0, 1.2, 1]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 1.2, 8]} /><meshStandardMaterial color={PALETTE.brass} /></mesh>
      <group ref={ears}>{[-0.3, 0.3].map(x => <mesh key={x} position={[x, 2.9, 0]}><boxGeometry args={[0.25, 1, 0.25]} /><meshStandardMaterial color={PALETTE.honey} /></mesh>)}</group>
      {[-0.5, 0.5].map(x => <mesh key={x} position={[x, 0.2, 0]}><boxGeometry args={[0.45, 0.35, 1.7]} /><meshStandardMaterial color={PALETTE.inkPurple} /></mesh>)}
    </group>
    <mesh ref={hp} position={[0, 3.7, 0]}><boxGeometry args={[1.6, 0.2, 0.2]} /><meshBasicMaterial color={PALETTE.sage} /></mesh>
    <mesh ref={mana} position={[0, 3.4, 0]}><boxGeometry args={[1.6, 0.12, 0.2]} /><meshBasicMaterial color={PALETTE.toyBlue} /></mesh>
    <group ref={stars} position={[0, 4.15, 0]}>{[-0.5,0,0.5].map(x => <mesh key={x} position={[x,0,0]} rotation={[-Math.PI / 2,0,0]} geometry={starGeometry} dispose={null}><meshBasicMaterial color={PALETTE.honey} side={THREE.DoubleSide} /></mesh>)}</group>
  </group>;
}

interface Spark { effect: AttackEffect; born: number; bit: number }
function AttackParticles({ getState, localId }: { getState: () => SquadState | null; localId: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null!); const particles = useRef<Spark[]>([]);
  const seen = useRef(''); const marker = useRef(new THREE.Object3D()); const colour = useRef(new THREE.Color());
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useFrame(() => {
    const s = getState(); const b = s?.kind === 'toy-squad' && s.phase !== 'build' ? s.battles.find(b => b.owner === localId) : undefined;
    const now = s?.kind === 'toy-squad' ? s.t / 1000 : 0;
    const key = b && s ? `${s.seed}:${s.round}:${b.tick}` : '';
    if (key !== seen.current) {
      seen.current = key;
      for (const effect of b?.attacks ?? []) for (let bit = 0; bit < (reduced.current ? 1 : effect.spell ? 12 : 5); bit++) particles.current.push({ effect, born: now, bit });
    }
    particles.current = particles.current.filter(p => now - p.born < 0.4).slice(-96);
    if (!b) particles.current = [];
    mesh.current.count = particles.current.length;
    particles.current.forEach((p, i) => {
      const age = (now - p.born) / 0.4; const e = p.effect;
      const travel = reduced.current ? 1 : Math.min(1, age * 2);
      const spread = reduced.current ? 0 : Math.sin(age * Math.PI) * p.bit * 0.13;
      const obj = marker.current;
      obj.position.set(boardToWorld(e.x + (e.tx - e.x) * travel) + Math.cos(p.bit * 2.4) * spread,
        1.7 + (reduced.current ? 0 : Math.sin(age * Math.PI) * 0.8), boardToWorld(e.z + (e.tz - e.z) * travel) + Math.sin(p.bit * 2.4) * spread);
      obj.scale.setScalar((1 - age) * (p.bit === 0 ? 0.32 : 0.17)); obj.updateMatrix();
      if (e.spell) {
        const radius = reduced.current ? 0 : (e.radius ?? 1) * CELL_SIZE * age;
        obj.position.set(boardToWorld(e.tx) + Math.cos(p.bit * Math.PI / 6) * radius, 0.6 + Math.sin(age * Math.PI), boardToWorld(e.tz) + Math.sin(p.bit * Math.PI / 6) * radius);
        obj.scale.setScalar((1 - age) * 0.45); obj.updateMatrix();
      }
      mesh.current.setMatrixAt(i, obj.matrix); colour.current.set(ROSTER[e.kind].colour); mesh.current.setColorAt(i, colour.current);
    });
    mesh.current.instanceMatrix.needsUpdate = true; if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, 96]} frustumCulled={false} raycast={() => {}}><sphereGeometry args={[1, 6, 6]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>;
}

function DamageNumbers({ getState, localId }: { getState: () => SquadState | null; localId: string }) {
  const group = useMemo(() => new THREE.Group(), []);
  const sprites = useMemo(() => Array.from({ length: 40 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); s.visible = false; group.add(s); return s; }), [group]);
  const textures = useRef(new Map<number, THREE.CanvasTexture>());
  const values = useRef<{ x: number; z: number; amount: number; born: number }[]>([]), seen = useRef('');
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => () => { sprites.forEach(s => s.material.dispose()); textures.current.forEach(t => t.dispose()); }, [sprites]);
  useFrame(() => {
    const s = getState(), b = s?.kind === 'toy-squad' && s.phase !== 'build' ? s.battles.find(b => b.owner === localId) : undefined;
    const now = s?.kind === 'toy-squad' ? s.t / 1000 : 0, key = b && s ? `${s.round}:${b.tick}` : '';
    if (key !== seen.current) { seen.current = key; for (const hit of b?.damages ?? []) values.current.push({ ...hit, born: now }); }
    values.current = b ? values.current.filter(v => now - v.born < 0.9).slice(-40) : [];
    sprites.forEach((sprite, i) => {
      const v = values.current[i]; sprite.visible = !!v; if (!v) return;
      const amount = Math.min(999, Math.round(v.amount));
      if (!textures.current.has(amount)) {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext('2d')!; ctx.font = 'bold 44px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 7; ctx.strokeStyle = PALETTE.ink; ctx.strokeText(String(amount), 64, 32); ctx.fillStyle = PALETTE.cream; ctx.fillText(String(amount), 64, 32);
        textures.current.set(amount, new THREE.CanvasTexture(canvas));
      }
      const texture = textures.current.get(amount)!;
      if (sprite.material.map !== texture) { sprite.material.map = texture; sprite.material.needsUpdate = true; }
      const age = (now - v.born) / 0.9; sprite.material.opacity = 1 - age;
      sprite.position.set(boardToWorld(v.x), 3.5 + (reduced.current ? 0 : age * 2.5), boardToWorld(v.z)); sprite.scale.set(2.4, 1.2, 1);
    });
  });
  return <primitive object={group} />;
}

export function SquadScene({ getState, localId }: MinigameSceneProps<SquadState>) {
  const { camera, gl } = useThree(); const drag = useRef<Drag | null>(null); const highlight = useRef<THREE.Mesh>(null!);
  const point = useRef(new THREE.Vector3());
  const cancel = () => { const previous = drag.current; drag.current = null; gl.domElement.style.cursor = ''; previous?.release(); };
  const move: PointerHandler = e => {
    const d = drag.current; if (!d || e.pointerId !== d.pointer) return;
    e.stopPropagation(); if (!editable(getState(), localId)) { cancel(); return; }
    if (e.ray.intersectPlane(floorPlane, point.current)) { d.x = point.current.x; d.z = point.current.z; d.cell = worldToDeployment(d.x, d.z); }
  };
  const down: PointerHandler = (e, id) => {
    if (id === undefined || drag.current || !editable(getState(), localId)) return;
    e.stopPropagation(); unlockAudio();
    const target = e.target as unknown as { setPointerCapture(id: number): void; releasePointerCapture(id: number): void };
    target.setPointerCapture(e.pointerId); e.ray.intersectPlane(floorPlane, point.current);
    drag.current = { unit: id, pointer: e.pointerId, x: point.current.x, z: point.current.z, cell: worldToDeployment(point.current.x, point.current.z),
      release: () => { try { target.releasePointerCapture(e.pointerId); } catch { /* capture already released */ } } };
    gl.domElement.style.cursor = 'grabbing';
  };
  const up: PointerHandler = e => {
    if (!drag.current || e.pointerId !== drag.current.pointer) return;
    move(e); const d = drag.current;
    if (d && d.cell !== null && editable(getState(), localId)) submitSquadInput({ type: 'move', unit: d.unit, cell: d.cell });
    cancel();
  };
  useEffect(() => {
    const previousTouch = gl.domElement.style.touchAction; gl.domElement.style.touchAction = 'none';
    const off = useMatch.subscribe(s => { if (s.paused || s.phase !== 'playing') cancel(); });
    const blur = () => cancel(); window.addEventListener('blur', blur);
    return () => { off(); window.removeEventListener('blur', blur); cancel(); gl.domElement.style.touchAction = previousTouch; };
  }, [gl]);
  useEffect(() => matchBus.on('event', e => {
    if (e.type === 'squad-buy') sfx.click(); if (e.type === 'squad-upgrade') sfx.reward();
    if (e.type === 'squad-battle') sfx.bell(); if (e.type === 'squad-recap') sfx.musicBox();
  }), []);
  useEffect(() => {
    exposeDebug({ squad: { point: (x: number, z: number, height = 0.1) => {
      const projected = new THREE.Vector3(boardToWorld(x), height, boardToWorld(z)).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (1 - projected.y) * rect.height / 2 };
    } } });
  }, [camera, gl]);
  useFrame(() => {
    const aspect = (camera as THREE.PerspectiveCamera).aspect; const distance = Math.max(42, 31 / aspect);
    camera.position.set(0, distance, distance * 0.58);
    camera.lookAt(0, 0, getState()?.phase === 'build' ? 10 : 2.5);
    if (drag.current && !editable(getState(), localId)) cancel();
    const d = drag.current; highlight.current.visible = !!d;
    if (d) {
      highlight.current.position.set(d.cell === null ? d.x : boardToWorld(d.cell % 8), 0.15, d.cell === null ? d.z : boardToWorld(4 + Math.floor(d.cell / 8)));
      (highlight.current.material as THREE.MeshBasicMaterial).color.set(d.cell === null ? PALETTE.coral : PALETTE.honey);
    }
  });
  return <group>
    <mesh position={[0, -0.5, 0]} receiveShadow><boxGeometry args={[30, 1, 30]} /><meshStandardMaterial color={PALETTE.woodMid} /></mesh>
    {Array.from({ length: 64 }, (_, i) => <mesh key={i} position={[boardToWorld(i % 8), 0.06, boardToWorld(Math.floor(i / 8))]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[CELL_SIZE - 0.12, CELL_SIZE - 0.12]} /><meshStandardMaterial color={(i % 8 + Math.floor(i / 8)) % 2 ? PALETTE.cardboard : PALETTE.cream} />
    </mesh>)}
    <mesh position={[0, 0.1, 0]}><boxGeometry args={[28, 0.07, 0.14]} /><meshBasicMaterial color={PALETTE.coral} /></mesh>
    <mesh ref={highlight} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}><planeGeometry args={[3.3, 3.3]} /><meshBasicMaterial transparent opacity={0.5} depthWrite={false} /></mesh>
    {([0, 1] as const).flatMap(side => Array.from({ length: MAX_UNITS }, (_, slot) => <Piece key={`${side}:${slot}`} slot={slot} side={side} getState={getState} localId={localId} drag={drag} down={down} move={move} up={up} cancel={cancel} />))}
    <AttackParticles getState={getState} localId={localId} />
    <DamageNumbers getState={getState} localId={localId} />
  </group>;
}
