/**
 * The Playroom hub: felt playmat village square on the tabletop.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Instance, Instances } from '@react-three/drei';
import { PALETTE } from '../game/palette';
import { PLAY_BOUNDS } from '../game/collision';
import { feltTexture } from './textures';
import { Block, Bunting, Dominoes, FeltTree, woodMat, type DominoSpec } from './props';
import { Fountain, Gates, Pavilion, Scoreboard, Shop, Workshop } from './Buildings';
import { JackInTheBox, KeyTower, Marble, MusicBox, PencilLog, Train, TrainTrack } from './Interactive';
import { BLOCKS, BLOCK_SIZE, FOUNTAIN, GATES, PAVILION, SCOREBOARD, SHOP, TREES, WORKSHOP, frontOf, registerHubColliders } from './layout';

function roundedRectShape(minX: number, minZ: number, maxX: number, maxZ: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(minX + r, minZ);
  s.lineTo(maxX - r, minZ);
  s.quadraticCurveTo(maxX, minZ, maxX, minZ + r);
  s.lineTo(maxX, maxZ - r);
  s.quadraticCurveTo(maxX, maxZ, maxX - r, maxZ);
  s.lineTo(minX + r, maxZ);
  s.quadraticCurveTo(minX, maxZ, minX, maxZ - r);
  s.lineTo(minX, minZ + r);
  s.quadraticCurveTo(minX, minZ, minX + r, minZ);
  return s;
}

function Playmat() {
  const b = PLAY_BOUNDS;
  const geo = useMemo(() => {
    // Shape is in XY; we rotate -90° about X so shape Y becomes world -Z.
    const g = new THREE.ShapeGeometry(roundedRectShape(b.minX - 4, -(b.maxZ + 4), b.maxX + 4, -(b.minZ - 4), 9), 6);
    // planar UVs in world units for tiling
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 22, pos.getY(i) / 22);
    return g;
  }, [b]);
  const edgeGeo = useMemo(() => {
    const outer = roundedRectShape(b.minX - 4.6, -(b.maxZ + 4.6), b.maxX + 4.6, -(b.minZ - 4.6), 9.5);
    return new THREE.ShapeGeometry(outer, 6);
  }, [b]);
  const mat = useMemo(() => {
    const t = feltTexture(PALETTE.felt, [1, 1], 13).clone();
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }, []);
  return (
    <group>
      <mesh geometry={edgeGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <meshStandardMaterial color={PALETTE.honey} roughness={1} />
      </mesh>
      <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} receiveShadow material={mat} />
    </group>
  );
}

/** Wooden tile paths laid along polylines. */
function Paths() {
  const tiles = useMemo(() => {
    const lines: [number, number][][] = [
      [
        [0, 30],
        [0, FOUNTAIN.z + 8],
      ],
      [
        [0, FOUNTAIN.z - 8],
        [0, PAVILION.z + PAVILION.d / 2 + 0.5],
      ],
    ];
    const toFront = (x: number, z: number, rot: number, d: number) => {
      const p = frontOf(x, z, rot, d);
      return [p.x, p.z] as [number, number];
    };
    // Spokes from the fountain ring to each destination
    const ring = (x: number, z: number): [number, number] => {
      const a = Math.atan2(z - FOUNTAIN.z, x - FOUNTAIN.x);
      return [FOUNTAIN.x + Math.cos(a) * 8, FOUNTAIN.z + Math.sin(a) * 8];
    };
    const dests: [number, number][] = [
      toFront(WORKSHOP.x, WORKSHOP.z, WORKSHOP.rot, WORKSHOP.d / 2 + 1.5),
      toFront(SHOP.x, SHOP.z, SHOP.rot, SHOP.d / 2 + 6),
      toFront(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 2.5),
      ...GATES.map((g) => toFront(g.x, g.z, g.rot, 1.5)),
    ];
    for (const d of dests) lines.push([ring(d[0], d[1]), d]);

    const out: { x: number; z: number; rot: number; c: string }[] = [];
    const colors = [PALETTE.woodLight, '#E2BE8E', PALETTE.cardboard];
    let k = 0;
    for (const line of lines) {
      for (let s = 0; s < line.length - 1; s++) {
        const [ax, az] = line[s];
        const [bx, bz] = line[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / 2.1));
        const rot = Math.atan2(bx - ax, bz - az);
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const off = (i % 2 ? 0.55 : -0.55) * 1.0;
          out.push({ x: ax + (bx - ax) * t + Math.cos(rot) * off, z: az + (bz - az) * t - Math.sin(rot) * off, rot: rot + ((k * 37) % 7) * 0.03 - 0.09, c: colors[k++ % 3] });
        }
      }
    }
    // ring of tiles around the fountain
    const ringN = 26;
    for (let i = 0; i < ringN; i++) {
      const a = (i / ringN) * Math.PI * 2;
      out.push({ x: FOUNTAIN.x + Math.cos(a) * 7, z: FOUNTAIN.z + Math.sin(a) * 7, rot: -a, c: colors[i % 3] });
    }
    return out;
  }, []);
  return (
    <Instances limit={tiles.length} receiveShadow castShadow material={woodMat('#ffffff')}>
      <boxGeometry args={[1.9, 0.22, 1.9]} />
      {tiles.map((t, i) => (
        <Instance key={i} position={[t.x, 0.12, t.z]} rotation={[0, t.rot, 0]} color={t.c} />
      ))}
    </Instances>
  );
}

function DominoFence() {
  const items = useMemo(() => {
    const b = PLAY_BOUNDS;
    const out: DominoSpec[] = [];
    let k = 0;
    const jitter = () => ((k++ * 7919) % 11) / 11 - 0.5;
    // front edge (the precipice side) — a few have toppled
    for (let x = b.minX - 2; x <= b.maxX + 2; x += 3.1) {
      const fallen = Math.abs(x - 12) < 4 || Math.abs(x + 30) < 2;
      out.push({ x, z: b.maxZ + 3.2, rot: jitter() * 0.15, tilt: fallen ? Math.PI / 2 : 0 });
    }
    for (let z = b.minZ; z <= b.maxZ; z += 3.1) {
      out.push({ x: b.minX - 3.2, z, rot: Math.PI / 2 + jitter() * 0.15 });
      out.push({ x: b.maxX + 3.2, z, rot: Math.PI / 2 + jitter() * 0.15 });
    }
    for (let x = b.minX + 4; x <= b.maxX - 4; x += 3.1) {
      if (Math.abs(x - PAVILION.x) < PAVILION.w / 2) continue;
      out.push({ x, z: b.minZ - 3.2, rot: jitter() * 0.15 });
    }
    return out;
  }, []);
  return <Dominoes items={items} />;
}

export function Village() {
  useEffect(() => {
    registerHubColliders();
  }, []);

  const g0 = GATES[0];
  return (
    <group>
      <Playmat />
      <Paths />
      <DominoFence />
      <Fountain />
      <Pavilion />
      <Workshop />
      <Shop />
      <Scoreboard />
      <Gates />
      <TrainTrack />
      <Train />
      <Marble />
      <MusicBox />
      <JackInTheBox />
      <KeyTower />
      <PencilLog />
      {TREES.map(([x, z, s], i) => (
        <FeltTree key={i} x={x} z={z} s={s} />
      ))}
      {BLOCKS.map((b, i) => (
        <Block key={i} x={b.x} y={b.y} z={b.z} rot={b.rot} color={b.color} size={(b.s ?? 1) * BLOCK_SIZE} />
      ))}
      {/* bunting strung from the pavilion */}
      <Bunting from={[-PAVILION.w / 2, PAVILION.h + 0.6, PAVILION.z + PAVILION.d / 2]} to={[WORKSHOP.x + 5, WORKSHOP.h + 1, WORKSHOP.z]} sag={2} count={10} />
      <Bunting from={[PAVILION.w / 2, PAVILION.h + 0.6, PAVILION.z + PAVILION.d / 2]} to={[g0.x - 3, 8.6, g0.z + 1]} sag={1.5} count={8} />
      <Bunting from={[GATES[1].x, 8.6, GATES[1].z]} to={[GATES[2].x, 8.6, GATES[2].z]} sag={2} count={10} />
    </group>
  );
}
