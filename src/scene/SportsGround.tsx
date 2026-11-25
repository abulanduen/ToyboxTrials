/**
 * The sports ground on the gates table (docs/ARCADE_PLAN.md phase 4): with the trials moved down to
 * the arcade, the table by the window is the Hub's ball games' ground. The marble football pitch
 * runs its whole length between the two nets, with a little wooden basketball court painted at its
 * east end under the hoop (src/game/hubPlay.ts: where the nets, the hoop and the ball are), and
 * stands of toy bricks along both sides (layout.ts STANDS), where toys can sit and watch.
 *
 * Cheap: the markings are one canvas texture on one plane just above the felt; every brick of every
 * stand is one instanced mesh; two team flags. No lights, and the only colliders are the stands'.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../game/palette';
import { HOOP, NETS, PITCH_AREA, PITCH_CENTRE } from '../game/hubPlay';
import { GATES_WALK } from '../game/hubBounds';
import { STANDS, STAND_TIER, standTier } from './layout';

/** The markings' plane: the gates table's play mat, and how finely they are painted (px per cm). */
const AREA = { minX: GATES_WALK.minX + 2, maxX: GATES_WALK.maxX - 2, minZ: GATES_WALK.minZ + 2, maxZ: GATES_WALK.maxZ - 2 };
const PX = 10;
/** The basketball court under the hoop (its baseline on the pitch's north touchline). */
export const COURT = { minX: HOOP.x - 14, maxX: HOOP.x + 14, minZ: PITCH_AREA.minZ, maxZ: PITCH_AREA.minZ + 28 };

function markingsTexture(): THREE.CanvasTexture {
  const w = Math.round((AREA.maxX - AREA.minX) * PX);
  const h = Math.round((AREA.maxZ - AREA.minZ) * PX);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  // world (x, z) → canvas px (the plane is laid flat with canvas up = world −z)
  const X = (x: number) => (x - AREA.minX) * PX;
  const Z = (z: number) => (z - AREA.minZ) * PX;
  const chalk = 'rgba(255, 250, 238, 0.85)';
  const lineW = 0.45 * PX;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // each team's half, faintly tinted (Coral attacks the east net, so defends the west half)
  g.fillStyle = 'rgba(226, 122, 106, 0.10)';
  g.fillRect(X(PITCH_AREA.minX), Z(PITCH_AREA.minZ), X(PITCH_CENTRE.x) - X(PITCH_AREA.minX), Z(PITCH_AREA.maxZ) - Z(PITCH_AREA.minZ));
  g.fillStyle = 'rgba(96, 150, 205, 0.10)';
  g.fillRect(X(PITCH_CENTRE.x), Z(PITCH_AREA.minZ), X(PITCH_AREA.maxX) - X(PITCH_CENTRE.x), Z(PITCH_AREA.maxZ) - Z(PITCH_AREA.minZ));
  // the wooden court under the hoop
  g.fillStyle = 'rgba(214, 164, 104, 0.92)';
  g.fillRect(X(COURT.minX), Z(COURT.minZ), X(COURT.maxX) - X(COURT.minX), Z(COURT.maxZ) - Z(COURT.minZ));
  g.strokeStyle = 'rgba(160, 112, 62, 0.35)';
  g.lineWidth = 1;
  for (let x = COURT.minX + 2; x < COURT.maxX; x += 2) {
    g.beginPath();
    g.moveTo(X(x), Z(COURT.minZ));
    g.lineTo(X(x), Z(COURT.maxZ));
    g.stroke();
  }
  // the football pitch's lines
  g.strokeStyle = chalk;
  g.lineWidth = lineW;
  g.strokeRect(X(PITCH_AREA.minX), Z(PITCH_AREA.minZ), X(PITCH_AREA.maxX) - X(PITCH_AREA.minX), Z(PITCH_AREA.maxZ) - Z(PITCH_AREA.minZ));
  g.beginPath();
  g.moveTo(X(PITCH_CENTRE.x), Z(PITCH_AREA.minZ));
  g.lineTo(X(PITCH_CENTRE.x), Z(PITCH_AREA.maxZ));
  g.stroke();
  g.beginPath();
  g.arc(X(PITCH_CENTRE.x), Z(PITCH_CENTRE.z), 7 * PX, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = chalk;
  g.beginPath();
  g.arc(X(PITCH_CENTRE.x), Z(PITCH_CENTRE.z), 0.7 * PX, 0, Math.PI * 2);
  g.fill();
  for (const n of NETS) {
    // the goal box and the penalty spot in front of each net
    const x0 = n.mouthX;
    const x1 = n.mouthX + n.dir * 9;
    g.strokeRect(Math.min(X(x0), X(x1)), Z(n.z - 9), Math.abs(X(x1) - X(x0)), 18 * PX);
    g.beginPath();
    g.arc(X(n.mouthX + n.dir * 7), Z(n.z), 0.55 * PX, 0, Math.PI * 2);
    g.fill();
  }
  // the basketball court's lines: its edge, the key, the free-throw circle, the three-point arc
  g.strokeRect(X(COURT.minX), Z(COURT.minZ), X(COURT.maxX) - X(COURT.minX), Z(COURT.maxZ) - Z(COURT.minZ));
  const keyHalf = 3.6;
  const ft = HOOP.rim.z + 8;
  g.strokeRect(X(HOOP.x - keyHalf), Z(COURT.minZ), 2 * keyHalf * PX, Z(ft) - Z(COURT.minZ));
  g.beginPath();
  g.arc(X(HOOP.x), Z(ft), keyHalf * PX, 0, Math.PI);
  g.stroke();
  const r3 = 11;
  g.beginPath();
  g.moveTo(X(HOOP.x - r3), Z(COURT.minZ));
  g.lineTo(X(HOOP.x - r3), Z(HOOP.rim.z));
  g.arc(X(HOOP.x), Z(HOOP.rim.z), r3 * PX, Math.PI, 0, true);
  g.lineTo(X(HOOP.x + r3), Z(COURT.minZ));
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Where each brick of the stands goes (one column per brick, as tall as its tier), with its colour. */
const BRICK_W = 4.2;
const STAND_COLOURS: Record<string, string[]> = {
  'north-w': [PALETTE.coral, PALETTE.cream],
  'north-e': [PALETTE.toyBlue, PALETTE.cream],
  'south-w': [PALETTE.coral, PALETTE.honey],
  'south-e': [PALETTE.toyBlue, PALETTE.honey],
};
function brickSpots() {
  const out: { x: number; z: number; h: number; c: string }[] = [];
  for (const st of STANDS) {
    const n = Math.max(1, Math.round((st.maxX - st.minX) / BRICK_W));
    const w = (st.maxX - st.minX) / n;
    const cols = STAND_COLOURS[st.id] ?? [PALETTE.honey, PALETTE.cream];
    for (let i = 0; i < st.tiers; i++) {
      const t = standTier(st, i);
      for (let k = 0; k < n; k++) out.push({ x: st.minX + (k + 0.5) * w, z: t.z, h: t.top, c: cols[(k + i) % cols.length] });
    }
  }
  return out;
}

export function SportsGround() {
  const marks = useMemo(() => new THREE.MeshStandardMaterial({ map: markingsTexture(), transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, depthWrite: false }), []);
  const spots = useMemo(brickSpots, []);
  const bricks = useRef<THREE.InstancedMesh>(null!);
  // a brick 1 cm tall, scaled up to its tier's height
  const brickGeo = useMemo(() => {
    const g = new RoundedBoxGeometry(BRICK_W - 0.15, 1, STAND_TIER.d - 0.15, 1, 0.12);
    g.translate(0, 0.5, 0);
    return g;
  }, []);
  const brickMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.5 }), []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      o.position.set(s.x, 0, s.z);
      o.scale.set(1, s.h, 1);
      o.updateMatrix();
      bricks.current.setMatrixAt(i, o.matrix);
      bricks.current.setColorAt(i, c.set(s.c));
    });
    bricks.current.instanceMatrix.needsUpdate = true;
    bricks.current.instanceColor!.needsUpdate = true;
  }, [spots]);

  const w = AREA.maxX - AREA.minX;
  const d = AREA.maxZ - AREA.minZ;
  // a flag behind each net in the colour of the team that scores there (Blue in the west, Coral in the east)
  const flags = NETS.map((n) => ({ id: n.id, x: n.backX - n.dir * 4, z: PITCH_AREA.minZ - 3, colour: n.scorer === 1 ? PALETTE.toyBlue : PALETTE.coral }));
  return (
    <group name="sports-ground">
      <mesh position={[(AREA.minX + AREA.maxX) / 2, 0.1, (AREA.minZ + AREA.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={marks} receiveShadow renderOrder={1}>
        <planeGeometry args={[w, d]} />
      </mesh>
      <instancedMesh ref={bricks} args={[brickGeo, brickMat, spots.length]} castShadow receiveShadow />
      {flags.map((f) => (
        <group key={f.id} position={[f.x, 0, f.z]}>
          <mesh position={[0, 6, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.22, 12, 6]} />
            <meshStandardMaterial color={PALETTE.woodDark} roughness={0.7} />
          </mesh>
          <mesh position={[1.9, 10.6, 0]} castShadow>
            <boxGeometry args={[3.6, 2.4, 0.08]} />
            <meshStandardMaterial color={f.colour} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
