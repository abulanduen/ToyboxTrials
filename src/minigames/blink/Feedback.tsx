/**
 * Blink Duel visual feedback (render-only; reads the deterministic rules state, never changes it):
 * - blink trail: a fading dotted path from where a toy blinked from to where it landed;
 * - knockout burst: gear-chip confetti and a shockwave ring where a toy is eliminated;
 * - whiff puff: a grey puff at the tip of a swing that hit nobody;
 * - danger ring: a pulsing coral ring around the local toy while it stands inside an enemy's
 *   wind-up cone, stronger as the swing charges.
 * Everything is pooled in instanced meshes (no per-frame allocation). Reduced motion keeps the
 * markers but drops the movement.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { inSwing, type BlinkState } from './rules';

const TRAIL_DOTS = 7;
const BURST = 14;
const MAX_PLAYERS = 8;
const TRAIL_MS = 450;
const BURST_MS = 750;
const WHIFF_MS = 380;
const CHIP_COLOURS = [PALETTE.honey, PALETTE.coral, PALETTE.brass, PALETTE.cream, PALETTE.toyBlue].map((c) => new THREE.Color(c));
const TRAIL_COLOUR = new THREE.Color(PALETTE.toyBlue);
const TRAIL_END = new THREE.Color(PALETTE.cream);
const SHOCK_COLOUR = new THREE.Color(PALETTE.cream);
const WHIFF_COLOUR = new THREE.Color('#B9AE9C');

/** Small stable hash so each toy's confetti scatters differently but identically every frame. */
const hash = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

/** True when the local toy stands inside a live enemy wind-up; returns the strongest charge 0..1. */
export function dangerCharge(s: BlinkState, localId: string): number {
  const me = s.players.find((p) => p.id === localId);
  if (!me?.alive) return 0;
  let best = -1;
  for (const p of s.players) {
    if (p === me || !p.alive || !p.attack) continue;
    if (inSwing(p.attack, me, s.config)) best = Math.max(best, Math.min(1, Math.max(0, (s.t - p.attack.start) / s.config.windupMs)));
  }
  // Inside a cone counts from the very first frame of the wind-up (charge 0), shown at a minimum strength.
  return best < 0 ? 0 : Math.max(0.05, best);
}

export function BlinkFeedback({ getState, localId }: { getState: () => BlinkState | null; localId: string }) {
  const dots = useRef<THREE.InstancedMesh>(null!);
  const chips = useRef<THREE.InstancedMesh>(null!);
  const rings = useRef<THREE.InstancedMesh>(null!);
  const danger = useRef<THREE.Mesh>(null!);
  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useFrame(() => {
    const s = getState();
    let nd = 0, nc = 0, nr = 0;
    danger.current.visible = false;
    if (s?.kind === 'blink-duel') {
      const still = reduced.current;
      for (const p of s.players) {
        // Blink trail
        if (p.lastBlink && s.t - p.lastBlink.at < TRAIL_MS) {
          const age = (s.t - p.lastBlink.at) / TRAIL_MS;
          const b = p.lastBlink;
          for (let i = 0; i < TRAIL_DOTS; i++) {
            const k = i / (TRAIL_DOTS - 1);
            // Dots vanish from the start of the path towards the landing point.
            const life = Math.max(0, 1 - age * 1.6 + k * 0.6);
            if (life <= 0) continue;
            o.position.set(b.x + (b.tx - b.x) * k, 0.5 + Math.sin(k * Math.PI) * (still ? 0 : 0.9), b.z + (b.tz - b.z) * k);
            o.rotation.set(0, 0, 0);
            o.scale.setScalar(0.32 * Math.min(1, life) * (0.6 + k * 0.4));
            o.updateMatrix();
            dots.current.setMatrixAt(nd, o.matrix);
            dots.current.setColorAt(nd, c.copy(TRAIL_COLOUR).lerp(TRAIL_END, age));
            nd++;
          }
        }
        // Knockout burst + shockwave
        if (!p.alive && p.outAt >= 0 && s.t - p.outAt < BURST_MS) {
          const age = (s.t - p.outAt) / BURST_MS;
          const seed = hash(p.id);
          for (let i = 0; i < BURST; i++) {
            const a = (i / BURST) * Math.PI * 2 + seed * 6.283;
            const spread = still ? 1.6 : 1.2 + 4.2 * (1 - (1 - age) * (1 - age)) * (0.7 + ((i * 37) % 10) / 25);
            const up = still ? 1.2 : 0.6 + 5 * age - 7 * age * age;
            o.position.set(p.x + Math.cos(a) * spread, Math.max(0.15, up + 1.2), p.z + Math.sin(a) * spread);
            o.rotation.set(still ? 0 : age * 9 + i, still ? 0 : age * 7 + i * 0.5, 0);
            o.scale.setScalar(0.42 * (1 - age * 0.8));
            o.updateMatrix();
            chips.current.setMatrixAt(nc, o.matrix);
            chips.current.setColorAt(nc, CHIP_COLOURS[i % CHIP_COLOURS.length]);
            nc++;
          }
          o.position.set(p.x, 0.12, p.z);
          o.rotation.set(-Math.PI / 2, 0, 0);
          o.scale.setScalar(still ? 2.4 : 1 + age * 4.5);
          o.updateMatrix();
          rings.current.setMatrixAt(nr, o.matrix);
          rings.current.setColorAt(nr, c.copy(SHOCK_COLOUR).multiplyScalar(1 - age * 0.7));
          nr++;
        }
        // Whiff: a swing that landed with nobody knocked out at that moment
        if (p.lastStrike && s.t - p.lastStrike.at < WHIFF_MS) {
          const at = p.lastStrike.at;
          const hitSomeone = s.players.some((q) => q !== p && !q.alive && q.outAt === at);
          if (!hitSomeone) {
            const age = (s.t - at) / WHIFF_MS;
            const r = s.config.attackRange * 0.75;
            o.position.set(p.lastStrike.x + Math.sin(p.lastStrike.angle) * r, 0.14, p.lastStrike.z + Math.cos(p.lastStrike.angle) * r);
            o.rotation.set(-Math.PI / 2, 0, 0);
            o.scale.setScalar(still ? 0.9 : 0.5 + age * 1.2);
            o.updateMatrix();
            rings.current.setMatrixAt(nr, o.matrix);
            rings.current.setColorAt(nr, c.copy(WHIFF_COLOUR).multiplyScalar(1 - age * 0.6));
            nr++;
          }
        }
      }
      // Danger ring around the local toy
      const charge = dangerCharge(s, localId);
      const me = s.players.find((p) => p.id === localId);
      if (charge > 0 && me) {
        danger.current.visible = true;
        danger.current.position.set(me.x, 0.1, me.z);
        const pulse = still ? 1 : 1 + Math.sin(s.t / (charge > 0.7 ? 45 : 90)) * 0.08;
        danger.current.scale.setScalar((1.5 + charge * 0.6) * pulse);
        (danger.current.material as THREE.MeshBasicMaterial).opacity = 0.45 + charge * 0.5;
      }
    }
    dots.current.count = nd;
    chips.current.count = nc;
    rings.current.count = nr;
    for (const m of [dots.current, chips.current, rings.current]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={dots} args={[undefined, undefined, MAX_PLAYERS * TRAIL_DOTS]} frustumCulled={false} raycast={() => {}}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={chips} args={[undefined, undefined, MAX_PLAYERS * BURST]} frustumCulled={false} raycast={() => {}}>
        {/* Gear-ish chips: a squat octagonal prism */}
        <cylinderGeometry args={[1, 1, 0.45, 8]} />
        <meshStandardMaterial roughness={0.5} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, MAX_PLAYERS * 2]} frustumCulled={false} raycast={() => {}}>
        <ringGeometry args={[0.85, 1, 32]} />
        <meshBasicMaterial transparent opacity={0.85} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
      <mesh ref={danger} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <ringGeometry args={[0.92, 1.12, 40]} />
        <meshBasicMaterial color={PALETTE.coral} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
