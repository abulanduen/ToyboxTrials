/**
 * The minigame gates, one per playable trial (layout.ts GATES), with their name boards, swinging
 * bells, welcome mats and themed surroundings (gateDecor.ts).
 *
 * Data-driven and cheap: the arches, pillars, flags and bells of all gates are instanced (one draw
 * call per part), the surroundings and every painted sign face (gate boards + fingerpost) are
 * merged per layer, and the signs share one canvas atlas. On the Low tier the small trim layer is
 * skipped.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PALETTE } from '../game/palette';
import { events } from '../game/events';
import { useGame } from '../game/store';
import { camBlock } from '../game/player';
import { Dominoes, useArchGeometry, woodMat, paintMat } from './props';
import { Kit, type KitLayer } from './kit';
import { SignAtlas, signAtlasTexture } from './signAtlas';
import { buildGateDecor, buildSignFaces, GATE_BOARD, type DecorExtras } from './gateDecor';
import { GATE, GATES } from './layout';

const PILLAR_H = GATE.height - 3;

// ------------------------------------------------------------------ build once, share across mounts

let built: { geos: Partial<Record<KitLayer, THREE.BufferGeometry>>; extras: DecorExtras; atlas: THREE.Texture } | null = null;
function hubDecor() {
  if (built) return built;
  const kit = new Kit();
  const atlas = new SignAtlas();
  const extras = buildGateDecor(kit, atlas);
  buildSignFaces(kit, atlas);
  built = { geos: kit.build(), extras, atlas: signAtlasTexture(atlas) };
  return built;
}

const gateMatrix = (g: (typeof GATES)[number]) => new THREE.Matrix4().makeRotationY(g.rot).setPosition(g.x, 0, g.z);
const local = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

/** An InstancedMesh with fixed matrices and colours (bounding sphere computed up front for raycasts). */
function useInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: { m: THREE.Matrix4; color?: string }[], shadows: boolean) {
  return useMemo(() => {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const c = new THREE.Color();
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.color) mesh.setColorAt(i, c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.computeBoundingSphere();
    return mesh;
  }, [geo, mat, items, shadows]);
}

// ------------------------------------------------------------------ gate structures

function GateStructures() {
  const pillarGeo = useMemo(() => new RoundedBoxGeometry(GATE.pillar, PILLAR_H / 2, GATE.depth, 1, 0.2), []);
  const archGeo = useArchGeometry(GATE.width, 3, GATE.depth, GATE.width / 2 - GATE.pillar);
  const white = woodMat('#ffffff');
  const pillars = useMemo(
    () =>
      GATES.flatMap((g) => {
        const gm = gateMatrix(g);
        return [-1, 1].flatMap((side) => [
          { m: gm.clone().multiply(local(side * (GATE.width / 2 - GATE.pillar / 2), PILLAR_H / 4, 0)), color: g.color },
          { m: gm.clone().multiply(local(side * (GATE.width / 2 - GATE.pillar / 2), (PILLAR_H * 3) / 4, 0)), color: PALETTE.cream },
        ]);
      }),
    [],
  );
  const arches = useMemo(() => GATES.map((g) => ({ m: gateMatrix(g).multiply(local(0, PILLAR_H, 0)), color: g.color })), []);
  const pillarMesh = useInstanced(pillarGeo, white, pillars, true);
  const archMesh = useInstanced(archGeo, white, arches, true);

  const poleGeo = useMemo(() => new THREE.CylinderGeometry(0.12, 0.12, 4, 6), []);
  const poles = useMemo(() => GATES.map((g) => ({ m: gateMatrix(g).multiply(local(0, GATE.height + 0.2, 0)) })), []);
  const poleMesh = useInstanced(poleGeo, woodMat(PALETTE.woodDark), poles, false);

  // name boards: wooden backs + dowel legs (the painted faces are in the merged decal layer)
  const boardGeo = useMemo(() => new THREE.BoxGeometry(GATE_BOARD.w, GATE_BOARD.h, GATE_BOARD.d), []);
  const boardFrame = (g: (typeof GATES)[number]) => gateMatrix(g).multiply(local(0, GATE_BOARD.y, GATE_BOARD.z, GATE_BOARD.tilt));
  const boards = useMemo(() => GATES.map((g) => ({ m: boardFrame(g) })), []);
  const boardMesh = useInstanced(boardGeo, woodMat(PALETTE.woodLight), boards, true);
  const legGeo = useMemo(() => new THREE.CylinderGeometry(0.15, 0.15, 0.9, 6), []);
  const legs = useMemo(() => GATES.flatMap((g) => [-3.2, 3.2].map((x) => ({ m: boardFrame(g).multiply(local(x, -1.25, -0.2)) }))), []);
  const legMesh = useInstanced(legGeo, woodMat(PALETTE.woodDark), legs, false);

  return (
    <group>
      <primitive object={pillarMesh} ref={camBlock} />
      <primitive object={archMesh} ref={camBlock} />
      <primitive object={poleMesh} />
      <primitive object={boardMesh} />
      <primitive object={legMesh} />
      <Flags />
      <Bells />
    </group>
  );
}

/** Every gate's pennant, waving in the same breeze (one geometry, one draw). */
function Flags() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2.2, 1.3, 6, 1);
    g.translate(1.1, 0, 0);
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }), []);
  const items = useMemo(() => GATES.map((g) => ({ m: gateMatrix(g).multiply(local(0, GATE.height + 1.6, 0)), color: g.color })), []);
  const mesh = useInstanced(geo, mat, items, true);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(x * 2.2 - t * 5) * 0.18 * x);
    }
    pos.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

/** The bells hanging in the arches (they ring when a gate opens) and the pulsing welcome mats. */
function Bells() {
  const n = GATES.length;
  const parts = useMemo(() => {
    const string = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), paintMat(PALETTE.ink, 0.6), n);
    const bell = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 1.0, 1.4, 16, 1, true), paintMat(PALETTE.honey, 0.25, 0.85), n);
    const clapper = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8), paintMat(PALETTE.coral, 0.4), n);
    bell.castShadow = true;
    for (const m of [string, bell, clapper]) m.frustumCulled = false;
    return { string, bell, clapper };
  }, [n]);
  const frames = useMemo(() => GATES.map((g) => gateMatrix(g).multiply(local(0, PILLAR_H + 0.2, 0))), []);
  const offsets = useMemo(() => [local(0, -0.5, 0), local(0, -1.5, 0), local(0, -2.25, 0)], []);
  const ring = useRef(new Float32Array(n));
  const tmp = useMemo(() => ({ swing: new THREE.Matrix4(), m: new THREE.Matrix4() }), []);
  useEffect(
    () =>
      events.on('gate:open', ({ id }) => {
        const i = GATES.findIndex((g) => g.id === id);
        if (i >= 0) ring.current[i] = 1.2;
      }),
    [],
  );
  const matGeo = useMemo(() => new THREE.CircleGeometry(3, 32), []);
  const matMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false }), []);
  const mats = useMemo(() => GATES.map((g) => ({ m: gateMatrix(g).multiply(local(0, 0.14, 1.5, -Math.PI / 2)), color: g.color })), []);
  const matMesh = useInstanced(matGeo, matMat, mats, false);
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    matMat.opacity = 0.35 + Math.sin(t * 2.5) * 0.15;
    const meshes = [parts.string, parts.bell, parts.clapper];
    for (let i = 0; i < n; i++) {
      ring.current[i] = Math.max(0, ring.current[i] - dt);
      tmp.swing.makeRotationZ(Math.sin(t * 2 + i) * 0.08 + Math.sin(t * 22) * 0.5 * ring.current[i]);
      for (let p = 0; p < 3; p++) {
        tmp.m.multiplyMatrices(frames[i], tmp.swing).multiply(offsets[p]);
        meshes[p].setMatrixAt(i, tmp.m);
      }
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <primitive object={parts.string} />
      <primitive object={parts.bell} />
      <primitive object={parts.clapper} />
      <primitive object={matMesh} />
    </group>
  );
}

// ------------------------------------------------------------------ surroundings + painted signs

function GateSurroundings() {
  const low = useGame((s) => s.quality) === 'low';
  const { geos, extras, atlas } = hubDecor();
  const mats = useMemo(
    () => ({
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      decal: new THREE.MeshStandardMaterial({ vertexColors: true, map: atlas, roughness: 0.85 }),
    }),
    [atlas],
  );
  return (
    <group>
      {geos.solid && <mesh geometry={geos.solid} material={mats.solid} castShadow receiveShadow />}
      {geos.detail && !low && <mesh geometry={geos.detail} material={mats.solid} />}
      {geos.glow && <mesh geometry={geos.glow} material={mats.glow} />}
      {geos.decal && <mesh geometry={geos.decal} material={mats.decal} castShadow receiveShadow />}
      <Dominoes items={extras.dominoes} />
    </group>
  );
}

export function Gates() {
  return (
    <>
      <GateStructures />
      <GateSurroundings />
    </>
  );
}
