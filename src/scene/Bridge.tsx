/**
 * The domino bridge between the spawn table and the gates table (layout.ts BRIDGE).
 *
 * Built like a child would build it: two rulers lie flat across the gap as beams, a deck of
 * dominoes lies face up across them (each turned across the walkway, scaled evenly so it keeps its
 * 1 : 2 face), a domino at each end tipped up as a ramp, and a long ruler stands on edge along each
 * side as a rail, resting on both table tops. The rails are camera blockers: the camera never
 * passes through them, and they stop the toy walking off (colliders in layout.ts; the walkable
 * strip itself is hubBounds.ts BRIDGE_WALK).
 *
 * Draw calls: deck + ramps (one instanced domino mesh), rails (2, the printed faces and the edges
 * share one multi-material box each), beams (1).
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { camBlock } from '../game/player';
import { DOMINO, type DominoSpec } from './domino';
import { BRIDGE, BRIDGE_RAIL_X } from './layout';
import { Dominoes } from './props';
import { rulerTexture } from './textures';

const RULER_EDGE = '#D9B77C';

/** Deck planks and the two end ramps, as domino specs (pure, for tests and rendering). */
export function bridgeDominoes(): DominoSpec[] {
  const b = BRIDGE;
  const s = b.s;
  const t = DOMINO.t * s;
  const out: DominoSpec[] = [];
  for (let i = 0; i < b.planks; i++) {
    // alternate which end the pips start from, so the deck doesn't look stamped
    out.push({ x: b.x, z: b.deckA - b.pitch * (i + 0.5), rot: i % 2 ? Math.PI / 2 : -Math.PI / 2, tilt: Math.PI / 2, y: b.beamT + t / 2, s });
  }
  // ramps: two dominoes side by side at each end, lying lengthwise, the top end resting on the deck
  const L = DOMINO.h * s;
  const a = Math.asin(b.top / L);
  for (const [end, dir] of [[b.deckA, 1], [b.deckB, -1]] as const) {
    const zMid = end + (dir * b.ramp) / 2;
    for (const side of [-1, 1]) {
      out.push({
        x: b.x + side * ((DOMINO.w * s) / 2 + 0.02),
        // centre = middle of the top face, pushed back along the face normal by half the thickness
        z: zMid - dir * Math.sin(a) * (t / 2),
        y: b.top / 2 - Math.cos(a) * (t / 2),
        rot: dir > 0 ? 0 : Math.PI,
        tilt: Math.PI / 2 - a,
        s,
      });
    }
  }
  return out;
}

export function Bridge() {
  const b = BRIDGE;
  const dominoes = useMemo(() => bridgeDominoes(), []);
  const mats = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ color: RULER_EDGE, roughness: 0.7 });
    const face = new THREE.MeshStandardMaterial({ map: rulerTexture(b.rail.len), roughness: 0.6 });
    // BoxGeometry face order: +x, −x, +y, −y, +z, −z. The printed faces are the two big sides.
    return { rail: [face, face, edge, edge, edge, edge], edge };
  }, [b.rail.len]);
  const beamGeo = useMemo(() => {
    const len = b.deckA - b.deckB;
    const g = new THREE.BoxGeometry(3.4, b.beamT, len);
    const g2 = g.clone();
    g.translate(b.x - 1.72, b.beamT / 2, (b.deckA + b.deckB) / 2);
    g2.translate(b.x + 1.72, b.beamT / 2, (b.deckA + b.deckB) / 2);
    const merged = new THREE.BufferGeometry();
    // two plain boxes in one geometry (non-indexed merge by hand keeps three's helpers out of it)
    const a1 = g.toNonIndexed();
    const a2 = g2.toNonIndexed();
    for (const name of ['position', 'normal', 'uv'] as const) {
      const x1 = a1.attributes[name].array as Float32Array;
      const x2 = a2.attributes[name].array as Float32Array;
      const arr = new Float32Array(x1.length + x2.length);
      arr.set(x1);
      arr.set(x2, x1.length);
      merged.setAttribute(name, new THREE.BufferAttribute(arr, a1.attributes[name].itemSize));
    }
    for (const x of [g, g2, a1, a2]) x.dispose();
    merged.computeBoundingSphere();
    return merged;
  }, [b]);
  return (
    <group>
      <Dominoes items={dominoes} />
      <mesh geometry={beamGeo} material={mats.edge} castShadow receiveShadow />
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[b.x + side * BRIDGE_RAIL_X, b.rail.h / 2, b.rail.z]}
          // the ruler's printed side faces outwards on both rails (numbers read the same way round)
          rotation={[0, side > 0 ? 0 : Math.PI, 0]}
          material={mats.rail}
          castShadow
          receiveShadow
          ref={camBlock}
        >
          <boxGeometry args={[b.rail.t, b.rail.h, b.rail.len]} />
        </mesh>
      ))}
    </group>
  );
}
