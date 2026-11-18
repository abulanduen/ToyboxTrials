/**
 * The Playroom hub: felt playmat village square on the tabletop.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Instance, Instances } from '@react-three/drei';
import { PALETTE } from '../game/palette';
import { PLAY_BOUNDS } from '../game/collision';
import { feltTexture } from './textures';
import { Block, Bunting, Dominoes, FeltTree, woodMat } from './props';
import { Fountain, Pavilion, Scoreboard, Shop, Workshop } from './Buildings';
import { Gates } from './Gates';
import { DustMotes, Fingerpost } from './Ambience';
import { hubFence, hubPathTiles, TILE_SIZE } from './paths';
import { JackInTheBox, KeyTower, Marble, MusicBox, PencilLog, Train, TrainTrack } from './Interactive';
import { BLOCKS, BLOCK_SIZE, GATES, GATE_STAND, PAVILION, TREES, WORKSHOP, frontOf, gateFor, registerHubColliders } from './layout';
import { exposeDebug } from '../game/debug';

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
      <mesh geometry={edgeGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
        <meshStandardMaterial color={PALETTE.honey} roughness={1} />
      </mesh>
      <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]} receiveShadow material={mat} />
    </group>
  );
}

// Path-tile maths lives in paths.ts (pure, unit tested); re-exported for the older tile tests.
export { TILE_STEP, tilesOverlap, withTileHeights } from './paths';

/** Wooden tile paths: the plaza ring, the streets from it and the Trials Ring road past every gate. */
function Paths() {
  const tiles = useMemo(() => hubPathTiles(), []);
  return (
    <Instances limit={tiles.length} receiveShadow castShadow material={woodMat('#ffffff')}>
      <boxGeometry args={[TILE_SIZE, 0.22, TILE_SIZE]} />
      {tiles.map((t, i) => (
        <Instance key={i} position={[t.x, t.y, t.z]} rotation={[0, t.rot, 0]} color={t.c} />
      ))}
    </Instances>
  );
}

function DominoFence() {
  const items = useMemo(() => hubFence(), []);
  return <Dominoes items={items} />;
}

export function Village() {
  useEffect(() => {
    registerHubColliders();
    // ?debug only: where each gate is and where to stand to open its lobby (facing the arch)
    exposeDebug({
      hub: {
        gates: () =>
          GATES.map((g) => {
            const stand = frontOf(g.x, g.z, g.rot, GATE_STAND + 1.2);
            return { id: g.id, game: g.game, title: g.title, x: g.x, z: g.z, rot: g.rot, standX: stand.x, standZ: stand.z, yaw: g.rot + Math.PI };
          }),
      },
    });
  }, []);

  const copycat = gateFor('copycat-conductor');
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
      <Fingerpost />
      <DustMotes />
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
      {copycat && <Bunting from={[PAVILION.w / 2, PAVILION.h + 0.6, PAVILION.z + PAVILION.d / 2]} to={[copycat.x - 3, 8.6, copycat.z + 1]} sag={2.5} count={12} />}
    </group>
  );
}
