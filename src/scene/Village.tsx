/**
 * The Playroom hub: felt playmat village square on the tabletop.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Instance, Instances } from '@react-three/drei';
import { PALETTE } from '../game/palette';
import { GATES_WALK, HUB_WALK, WALK_AREAS, type WalkRect } from '../game/hubBounds';
import { events } from '../game/events';
import { INTERACTABLES } from '../game/interactables';
import { feltTexture } from './textures';
import { Blocks, Bunting, Dominoes, FeltTrees, woodMat } from './props';
import { Fountain, Pavilion, Scoreboard, Shop, Workshop } from './Buildings';
import { Arcade } from './Arcade';
import { Bridge } from './Bridge';
import { HubTV, TV_AERIAL_TIP } from './HubTV';
import { Gates } from './Gates';
import { DustMotes, Fingerpost } from './Ambience';
import { hubFence, hubPathTiles, TILE_SIZE } from './paths';
import { JackInTheBox, KeyTower, MusicBox, PencilLog, Train, TrainTrack } from './Interactive';
import { HubPlay } from './HubPlay';
import { BLOCKS, BLOCK_SIZE, BRIDGE, CURATOR, GATES, GATE_STAND, JUKEBOX, PAVILION, PIPWICK_HOME, SCOREBOARD, SHOP, TREES, TV, WORKSHOP, frontOf, gateLocal, pavilionLocal, registerHubColliders } from './layout';
import { exposeDebug } from '../game/debug';
import { HubWelcome } from './HubWelcome';
import { pavilionView } from './pavilionView';
import { player } from '../game/player';

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

/** The felt play mat on one table, with a honey-coloured border, a little larger than its walkable area. */
function Playmat({ b }: { b: WalkRect }) {
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

/** What an interactable belongs to, so a test hook can face it (gates, buildings). */
function facingTarget(id: string): { x: number; z: number } | null {
  const g = GATES.find((x) => x.id === id);
  if (g) return g;
  const b: Record<string, { x: number; z: number }> = { pavilion: CURATOR, workshop: WORKSHOP, shop: SHOP, scoreboard: SCOREBOARD, tv: TV, pipwick: PIPWICK_HOME, jukebox: JUKEBOX };
  return b[id] ?? null;
}

export function Village() {
  useEffect(() => {
    registerHubColliders();
    // ?debug only (tests): where each gate is and where to stand to open its lobby (facing the
    // arch); where to stand for any interactable; the walkable rectangles and the bridge.
    const spot = (id: string) => {
      const it = INTERACTABLES.find((x) => x.id === id);
      if (!it) return null;
      const t = facingTarget(id);
      const yaw = t ? Math.atan2(t.x - it.x, t.z - it.z) : Math.PI;
      return { id, x: it.x, z: it.z, yaw };
    };
    exposeDebug({
      hub: {
        gates: () =>
          GATES.map((g) => {
            const stand = frontOf(g.x, g.z, g.rot, GATE_STAND + 1.2);
            return { id: g.id, game: g.game, title: g.title, x: g.x, z: g.z, rot: g.rot, standX: stand.x, standZ: stand.z, yaw: g.rot + Math.PI };
          }),
        spot,
        /** Teleport in front of an interactable (e.g. 'pavilion': inside, facing the Tournament Curator), facing it. */
        goTo: (id: string) => {
          const s = spot(id);
          if (s) events.emit('player:teleport', { x: s.x, z: s.z, yaw: s.yaw });
          return s;
        },
        walkAreas: () => WALK_AREAS.map((a) => ({ ...a })),
        bridge: () => ({ x: BRIDGE.x, deckA: BRIDGE.deckA, deckB: BRIDGE.deckB, top: BRIDGE.top, ramp: BRIDGE.ramp, start: BRIDGE.deckA + BRIDGE.ramp + 1.5, end: BRIDGE.deckB - BRIDGE.ramp - 1.5 }),
        /** The Pavilion: where it is, the toy's Pavilion-local position (`me`, lz towards the door),
         *  whether the toy counts as inside, and how far the lid is off / walls folded down (`cut`). */
        pavilion: () => {
          const me = pavilionLocal(player.pos.x, player.pos.z);
          return { x: PAVILION.x, z: PAVILION.z, rot: PAVILION.rot, w: PAVILION.w, d: PAVILION.d, curator: { x: CURATOR.x, z: CURATOR.z }, me, inside: pavilionView.inside, cut: pavilionView.cut };
        },
        /** A Pavilion-local point in world xz, and the yaw that faces into the Pavilion through its door. */
        pavilionAt: (lx: number, lz: number) => ({ ...gateLocal(PAVILION, lx, lz), yawIn: PAVILION.rot + Math.PI }),
      },
    });
  }, []);

  // bunting: from the Scoreboard's top corners to the knob on the Pavilion's front corner post and the TV's aerial
  const pav = gateLocal(PAVILION, -PAVILION.w / 2, PAVILION.d / 2);
  const aerial = gateLocal(TV, TV_AERIAL_TIP[0], TV_AERIAL_TIP[2]);
  return (
    <group>
      <Playmat b={HUB_WALK} />
      <Playmat b={GATES_WALK} />
      <Paths />
      <DominoFence />
      <Bridge />
      <Fountain />
      <Pavilion />
      <Workshop />
      <Shop />
      <Scoreboard />
      <HubTV />
      <Gates />
      <Fingerpost />
      <DustMotes />
      <TrainTrack />
      <Train />
      {/* the shared marble, the football nets, the basketball hoop and its ball */}
      <HubPlay />
      <Arcade />
      <MusicBox />
      <JackInTheBox />
      <KeyTower />
      <PencilLog />
      <HubWelcome />
      {/* trees and blocks are instanced: a handful of draws for all of them */}
      <FeltTrees trees={TREES} />
      <Blocks items={BLOCKS.map((b) => ({ ...b, size: (b.s ?? 1) * BLOCK_SIZE }))} />
      <Bunting from={[SCOREBOARD.x + SCOREBOARD.w / 2 - 0.4, SCOREBOARD.h + 0.2, SCOREBOARD.z]} to={[pav.x, PAVILION.h + 0.25, pav.z]} sag={2.5} count={13} />
      <Bunting from={[SCOREBOARD.x - SCOREBOARD.w / 2 + 0.4, SCOREBOARD.h + 0.2, SCOREBOARD.z]} to={[aerial.x, TV_AERIAL_TIP[1], aerial.z]} sag={1.6} count={6} />
    </group>
  );
}
