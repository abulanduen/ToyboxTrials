/**
 * The arcade: a den on the room floor under the spawn table (docs/ARCADE_PLAN.md, phase 1: the
 * shell). Toys get here on the toy-car ride and leave by the toy lift (phase 2); the trials' machines
 * come in phase 3. For now: a glow-in-the-dark arcade carpet, a low wall of toy bricks round it (open
 * at the front), strings of bulbs hung under the table's apron, and the sign over the way in.
 *
 * Cheap on purpose (a handful of draw calls: instanced bricks and bulbs, one merged wire) and lit by
 * the Hub's own lights: the bulbs and the carpet's confetti glow (emissive, picked up by the bloom)
 * rather than adding real lights, which every lit surface in the scene would pay for.
 * Positions: src/scene/layout.ts ARCADE; the walkable floor: src/game/hubBounds.ts ARCADE_WALK.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../game/palette';
import { ARCADE } from './layout';
import { arcadeCarpetTexture, arcadeSignTexture } from './textures';

const A = ARCADE;
const BRICK_COLOURS = [PALETTE.honey, PALETTE.coral, PALETTE.toyBlue, PALETTE.sage, PALETTE.cream];
const BULB_COLOURS = [PALETTE.honey, PALETTE.coral, PALETTE.toyBlue, PALETTE.sage, PALETTE.cream];
const BULBS_PER_STRAND = 30;
/** The sign's centre (6.6 cm tall board), and the cords from its top up to the apron. */
const SIGN_Y = A.ceiling - 4.5;
const CORD = A.ceiling - (SIGN_Y + 3.3);

/** Where the bricks go: along each side of the wall, skipping the entrance at the front. */
function brickSpots() {
  const { minX, maxX, minZ, maxZ, brick } = A.wall;
  const out: { x: number; z: number; rot: number }[] = [];
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / (brick + 0.2)));
    const rot = Math.atan2(-(z1 - z0), x1 - x0); // three.js rotation.y: local +x along the run
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      out.push({ x: x0 + (x1 - x0) * f, z: z0 + (z1 - z0) * f, rot });
    }
  };
  run(minX, minZ, maxX, minZ); // back
  run(minX, minZ + 2, minX, maxZ - 2); // left
  run(maxX, minZ + 2, maxX, maxZ - 2); // right
  run(minX, maxZ, A.entrance.x - A.entrance.halfW, maxZ); // front, left of the way in
  run(A.entrance.x + A.entrance.halfW, maxZ, maxX, maxZ); // front, right of it
  return out;
}

/** A strand of bulbs across the den at depth z: from just under the apron at each end, sagging in the middle. */
function strandPoint(z: number, f: number, out: THREE.Vector3) {
  const x0 = A.wall.minX + 1;
  const x1 = A.wall.maxX - 1;
  const top = A.ceiling - 0.6;
  return out.set(x0 + (x1 - x0) * f, top - A.sag * Math.sin(Math.PI * f), z);
}

export function Arcade() {
  const carpet = useMemo(() => {
    const map = arcadeCarpetTexture().clone();
    const glow = arcadeCarpetTexture(true).clone();
    const w = A.carpet.maxX - A.carpet.minX;
    const d = A.carpet.maxZ - A.carpet.minZ;
    // one 512 px tile every 30 cm: confetti a few cm across, toy-sized
    for (const t of [map, glow]) {
      t.repeat.set(w / 30, d / 30);
      t.needsUpdate = true;
    }
    return new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 1 });
  }, []);

  const spots = useMemo(brickSpots, []);
  const bricks = useRef<THREE.InstancedMesh>(null!);
  const brickGeo = useMemo(() => new RoundedBoxGeometry(A.wall.brick, A.wall.h, A.wall.t, 2, 0.35), []);
  const brickMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55 }), []);

  const bulbs = useRef<THREE.InstancedMesh>(null!);
  const bulbCount = A.strands.length * BULBS_PER_STRAND;
  const bulbMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const wires = useMemo(() => {
    const p = new THREE.Vector3();
    const geos = A.strands.map((z) => {
      const pts = Array.from({ length: 24 }, (_, i) => strandPoint(z, i / 23, p).clone());
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.12, 4);
    });
    return mergeGeometries(geos, false)!;
  }, []);

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    spots.forEach((s, i) => {
      o.position.set(s.x, A.y + A.wall.h / 2, s.z);
      o.rotation.set(0, s.rot, 0);
      o.updateMatrix();
      bricks.current.setMatrixAt(i, o.matrix);
      bricks.current.setColorAt(i, c.set(BRICK_COLOURS[i % BRICK_COLOURS.length]));
    });
    bricks.current.instanceMatrix.needsUpdate = true;
    bricks.current.instanceColor!.needsUpdate = true;
    let k = 0;
    for (const z of A.strands) {
      for (let i = 0; i < BULBS_PER_STRAND; i++) {
        strandPoint(z, (i + 0.5) / BULBS_PER_STRAND, o.position);
        o.position.y -= 0.5;
        o.rotation.set(0, 0, 0);
        o.updateMatrix();
        bulbs.current.setMatrixAt(k, o.matrix);
        // bright enough to bloom (not tone-mapped)
        bulbs.current.setColorAt(k, c.set(BULB_COLOURS[(i + k) % BULB_COLOURS.length]).multiplyScalar(2.2));
        k++;
      }
    }
    bulbs.current.instanceMatrix.needsUpdate = true;
    bulbs.current.instanceColor!.needsUpdate = true;
  }, [spots]);

  // the bulbs twinkle gently, a strand at a time
  const twinkle = useRef({ next: 0 });
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (t < twinkle.current.next) return;
    twinkle.current.next = t + 0.25;
    bulbMat.color.setScalar(0.85 + 0.15 * Math.sin(t * 2.1));
  });

  const sign = useMemo(() => new THREE.MeshBasicMaterial({ map: arcadeSignTexture('ARCADE'), toneMapped: false }), []);
  const cx = (A.carpet.minX + A.carpet.maxX) / 2;
  const cz = (A.carpet.minZ + A.carpet.maxZ) / 2;

  return (
    <group name="arcade">
      <mesh position={[cx, A.y + 0.06, cz]} rotation={[-Math.PI / 2, 0, 0]} material={carpet} receiveShadow>
        <planeGeometry args={[A.carpet.maxX - A.carpet.minX, A.carpet.maxZ - A.carpet.minZ]} />
      </mesh>
      <instancedMesh ref={bricks} args={[brickGeo, brickMat, spots.length]} castShadow receiveShadow />
      <mesh geometry={wires}>
        <meshStandardMaterial color={PALETTE.ink} roughness={0.8} />
      </mesh>
      <instancedMesh ref={bulbs} args={[undefined, bulbMat, bulbCount]}>
        <sphereGeometry args={[0.55, 10, 8]} />
      </instancedMesh>
      {/* the sign over the way in, facing out into the room, hung from the apron on two cords */}
      <group position={[A.entrance.x, SIGN_Y, A.wall.maxZ + 1.5]}>
        <mesh material={sign}>
          <planeGeometry args={[19.2, 6]} />
        </mesh>
        <mesh position={[0, 0, -0.3]}>
          <boxGeometry args={[20, 6.6, 0.5]} />
          <meshStandardMaterial color={PALETTE.woodDark} roughness={0.8} />
        </mesh>
        {[-7, 7].map((x) => (
          <mesh key={x} position={[x, 3.3 + CORD / 2, -0.3]}>
            <cylinderGeometry args={[0.12, 0.12, CORD, 5]} />
            <meshStandardMaterial color={PALETTE.ink} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
