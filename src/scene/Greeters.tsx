/**
 * The gate greeters: a small wind-up peg-doll toy at the front of every trial's arch, dressed for
 * its game (a conductor by Copycat, a jester by Jack-in-the-Box, a knight by the Siege fort…). It
 * turns to face you as you approach, hops, and a speech bubble (src/ui/WelcomeUI.tsx) says hello,
 * pitches the game and asks if you want a go; the gate's usual Play prompt opens the trial.
 * Lines: src/game/voiceLines.ts GREETERS.
 *
 * Cheap: each greeter is one merged, vertex-coloured mesh (14 draws, one shared material), and
 * the per-frame work is a turn and a bob. Positions and colliders: layout.ts GREETER.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE, PAINT_JOBS } from '../game/palette';
import { player } from '../game/player';
import { inputBlocked, useGame } from '../game/store';
import { greeterBubble, setGreeter, useWelcome } from '../game/welcome';
import type { MinigameId } from '../minigames/ids';
import { GATES, greeterSpot, type HubGate } from './layout';
import { Kit } from './kit';

const P = PALETTE;
const SKIN = P.cream;
/** Within this distance (cm) a greeter turns to watch you; within BUBBLE_R it talks. */
const WATCH_R = 14;
const BUBBLE_R = 8.5;
/** Height of the bubble's anchor above the table (just over the tallest hat). */
export const GREETER_BUBBLE_Y = 4.4;


// ------------------------------------------------------------------ building the toys

/** The shared peg-doll body, facing +z, ≈ 2.6 cm to the top of the head. `hand`: right hand point. */
function pegDoll(k: Kit, coat: string, trim: string) {
  k.cyl(0.62, 0.68, 0.2, 0, 0.1, 0, P.woodDark, 14);
  k.cyl(0.46, 0.6, 1.45, 0, 0.92, 0, coat, 14);
  k.cyl(0.47, 0.47, 0.16, 0, 1.2, 0, trim, 14);
  k.ball(0.47, 0, 2.08, 0, SKIN, 14);
  for (const sx of [-1, 1]) {
    k.ball(0.075, sx * 0.17, 2.14, 0.43, P.ink, 8);
    k.ball(0.08, sx * 0.3, 1.98, 0.38, P.blush, 8, { s: [1, 0.6, 0.4] });
  }
  k.torus(0.1, 0.025, 0, 2.0, 0.44, P.ink, { rz: Math.PI }, Math.PI, 8); // smile
  // arms: left down by the side, right raised a little to hold a prop at (0.72, 1.25, 0.25)
  k.rod([-0.48, 1.55, 0], [-0.68, 1.0, 0.12], 0.13, coat, 8);
  k.ball(0.13, -0.68, 0.98, 0.12, SKIN, 8);
  k.rod([0.48, 1.55, 0], [0.72, 1.22, 0.25], 0.13, coat, 8);
  k.ball(0.13, 0.72, 1.22, 0.27, SKIN, 8);
  // wind-up key in the back
  k.rod([0, 1.3, -0.55], [0, 1.3, -0.8], 0.05, P.brass, 6);
  for (const sx of [-0.18, 0.18]) k.torus(0.15, 0.05, sx, 1.3, -0.85, P.brass, { ry: 0 }, Math.PI * 2, 12);
}

const HAND: [number, number, number] = [0.72, 1.22, 0.27];

/** A hat sitting on the head (top of head ≈ 2.55). */
const HEAD_TOP = 2.5;

type Outfit = (k: Kit, g: HubGate) => void;
const OUTFITS: Record<MinigameId, Outfit> = {
  'copycat-conductor': (k) => {
    pegDoll(k, P.ink, P.honey);
    k.cone(0.12, 0.2, 0, 1.62, 0.47, P.coral, 4, { rz: Math.PI / 2 }); // bow tie
    k.cone(0.12, 0.2, 0, 1.62, 0.47, P.coral, 4, { rz: -Math.PI / 2 });
    k.rod(HAND, [1.0, 2.1, 0.5], 0.04, P.white, 6); // baton
    k.ball(0.32, 0, HEAD_TOP - 0.05, -0.05, P.ink, 10, { s: [1.05, 0.5, 1.05] }); // slicked hair
  },
  'jack-in-the-box': (k) => {
    pegDoll(k, P.coral, P.honey);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.cone(0.16, 0.32, Math.sin(a) * 0.5, 1.62, Math.cos(a) * 0.5, i % 2 ? P.honey : P.toyBlue, 4, { rx: Math.PI / 2 + 0.6, ry: a });
    }
    for (const sx of [-1, 1]) {
      k.cone(0.22, 0.75, sx * 0.25, HEAD_TOP + 0.25, 0, sx < 0 ? P.honey : P.toyBlue, 8, { rz: -sx * 0.7 });
      k.ball(0.11, sx * 0.62, HEAD_TOP + 0.48, 0, P.brass, 8);
    }
  },
  'find-the-original': (k) => {
    pegDoll(k, P.sage, P.woodDark);
    k.cyl(0.42, 0.44, 0.22, 0, HEAD_TOP, 0, P.feltDark, 12); // flat cap
    k.box(0.5, 0.06, 0.35, 0, HEAD_TOP - 0.08, 0.42, P.feltDark);
    k.rod(HAND, [0.8, 1.7, 0.4], 0.05, P.woodDark, 6); // magnifying glass
    k.torus(0.26, 0.05, 0.82, 1.95, 0.42, P.brass, {}, Math.PI * 2, 14);
    k.disc(0.24, 0.82, 1.95, 0.42, P.roomSky, {}, 14);
  },
  'red-light-green-light': (k) => {
    pegDoll(k, P.honey, P.white);
    k.cyl(0.42, 0.46, 0.25, 0, HEAD_TOP, 0, P.toyBlue, 12); // peaked cap
    k.box(0.55, 0.06, 0.32, 0, HEAD_TOP - 0.1, 0.42, P.ink);
    k.rod(HAND, [0.78, 2.6, 0.3], 0.05, P.woodLight, 6); // lollipop sign
    k.cyl(0.42, 0.42, 0.08, 0.78, 2.95, 0.3, P.coral, 18, { rx: Math.PI / 2 });
    k.cyl(0.3, 0.3, 0.1, 0.78, 2.95, 0.3, P.sage, 18, { rx: Math.PI / 2 });
  },
  'wind-up-dash': (k) => {
    pegDoll(k, P.toyBlue, P.white);
    k.ball(0.49, 0, 2.13, 0, P.coral, 12, { s: [1, 0.95, 1] }); // helmet
    k.box(0.62, 0.16, 0.12, 0, 2.18, 0.44, P.ink); // goggles strap
    for (const sx of [-0.16, 0.16]) k.cyl(0.12, 0.12, 0.08, sx, 2.18, 0.5, P.roomSky, 10, { rx: Math.PI / 2 });
    k.rod(HAND, [0.8, 2.5, 0.25], 0.04, P.ink, 6); // chequered flag
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.box(0.2, 0.2, 0.03, 0.92 + i * 0.2, 2.35 - j * 0.2, 0.25, (i + j) % 2 ? P.ink : P.white);
  },
  'music-box-rhythm': (k) => {
    pegDoll(k, P.honey, P.white);
    k.cyl(0.95, 0.95, 0.12, 0, 1.2, 0, PAINT_JOBS[9].body, 16); // tutu
    k.cyl(0.85, 0.85, 0.1, 0, 1.32, 0, P.blush, 16);
    k.ball(0.2, 0, HEAD_TOP + 0.05, -0.2, P.woodDark, 10); // hair bun
    k.cone(0.14, 0.24, 0, HEAD_TOP + 0.1, 0.1, P.brass, 5); // tiara point
    k.rod([0.48, 1.55, 0], [0.55, 2.5, 0.1], 0.12, P.honey, 8); // arm up, dancing
  },
  'inferno-escape': (k) => {
    pegDoll(k, P.coral, P.honey);
    k.ball(0.5, 0, 2.2, 0, P.coral, 12, { s: [1, 0.75, 1] }); // fire helmet
    k.cyl(0.66, 0.66, 0.06, 0, 2.12, -0.05, P.coral, 14);
    k.box(0.22, 0.28, 0.06, 0, 2.38, 0.46, P.honey); // badge
    k.cyl(0.24, 0.2, 0.36, 0.78, 1.0, 0.3, P.steel, 10); // bucket
    k.torus(0.2, 0.025, 0.78, 1.22, 0.3, P.ink, { rx: Math.PI / 2 }, Math.PI, 8);
  },
  'midnight-hunger': (k) => {
    pegDoll(k, P.inkPurple, P.cream);
    k.cone(0.46, 1.05, 0, HEAD_TOP + 0.4, -0.05, P.toyBlue, 10, { rx: -0.35 }); // nightcap
    k.ball(0.14, 0, HEAD_TOP + 0.85, -0.42, P.white, 8);
    k.cyl(0.24, 0.26, 0.08, 0.78, 1.2, 0.3, P.brass, 10); // candle holder
    k.cyl(0.09, 0.09, 0.42, 0.78, 1.45, 0.3, P.cream, 8);
    k.ball(0.08, 0.78, 1.72, 0.3, P.honey, 8, { s: [1, 1.6, 1] }); // flame
  },
  'toy-squad': (k) => {
    pegDoll(k, P.coral, P.white);
    k.cyl(0.36, 0.4, 0.72, 0, HEAD_TOP + 0.25, 0, P.ink, 12); // tall hat
    k.ball(0.1, 0.22, HEAD_TOP + 0.65, 0.12, P.coral, 8);
    k.rod(HAND, [0.75, 2.9, 0.25], 0.035, P.woodDark, 6); // little flag
    k.box(0.55, 0.35, 0.03, 1.03, 2.7, 0.25, P.sage);
  },
  'blink-duel': (k) => {
    pegDoll(k, P.inkPurple, P.honey);
    k.box(1.0, 1.3, 0.06, 0, 1.15, -0.5, P.coral, { rx: 0.12 }); // cape
    k.ball(0.49, 0, 2.08, 0.04, P.ink, 12, { s: [1, 1, 0.98] }); // fencing mask
    k.box(0.5, 0.42, 0.04, 0, 2.08, 0.47, P.steel);
    k.rod(HAND, [1.25, 2.2, 0.55], 0.03, P.steel, 6); // foil
    k.ball(0.07, 1.25, 2.2, 0.55, P.toyBlue, 6); // blink spark
  },
  'spellbox-showdown': (k) => {
    pegDoll(k, P.toyBlue, P.honey);
    k.cyl(0.62, 0.62, 0.05, 0, HEAD_TOP - 0.02, 0, P.inkPurple, 16); // wizard hat
    k.cone(0.42, 1.1, 0, HEAD_TOP + 0.52, 0, P.inkPurple, 12, { rz: 0.15 });
    k.ball(0.08, 0.18, HEAD_TOP + 0.5, 0.3, P.honey, 6);
    k.rod(HAND, [0.85, 2.15, 0.45], 0.04, P.woodDark, 6); // wand
    k.ball(0.11, 0.85, 2.2, 0.45, P.honey, 8); // star
  },
  'odd-page-out': (k) => {
    pegDoll(k, P.toyBlue, P.cream);
    k.ball(0.36, 0, HEAD_TOP - 0.08, -0.06, P.coral, 10, { s: [1.2, 0.6, 1.2] }); // hair
    for (const sx of [-0.17, 0.17]) k.torus(0.12, 0.025, sx, 2.15, 0.46, P.ink, {}, Math.PI * 2, 12); // glasses
    k.box(0.7, 0.5, 0.12, 0.6, 1.2, 0.42, P.coral, { ry: -0.3 }); // picture book
    k.box(0.66, 0.46, 0.13, 0.6, 1.2, 0.43, P.cream, { ry: -0.3, s: [1, 1, 0.8] });
  },
  'toy-tower-tumble': (k) => {
    pegDoll(k, P.sage, P.honey);
    k.ball(0.5, 0, 2.18, 0, P.honey, 12, { s: [1, 0.7, 1] }); // hard hat
    k.cyl(0.62, 0.62, 0.06, 0, 2.12, 0.04, P.honey, 14);
    k.block(0.55, 0.55, 0.55, 0.85, 1.25, 0.35, P.coral); // a building block
  },
  'hoop-hustle': (k) => {
    pegDoll(k, P.ballOrange, P.white);
    k.ball(0.5, 0, 2.2, -0.02, P.toyBlue, 12, { s: [1, 0.62, 1] }); // cap
    k.box(0.62, 0.06, 0.45, 0, 2.27, 0.55, P.toyBlue, { rx: -0.15 }); // peak
    k.torus(0.42, 0.02, 0, 1.75, 0.08, P.white, { rx: Math.PI / 2 + 0.4 }, Math.PI * 2, 12); // whistle cord
    k.cyl(0.07, 0.07, 0.2, 0.08, 1.42, 0.5, P.brass, 8, { rz: Math.PI / 2 }); // whistle
    k.ball(0.32, 0.86, 1.32, 0.42, P.ballOrange, 12); // a basketball
    k.torus(0.322, 0.02, 0.86, 1.32, 0.42, P.ink, { ry: Math.PI / 2 }, Math.PI * 2, 12);
  },
  'toybox-siege': (k) => {
    pegDoll(k, P.toyBlue, P.honey);
    k.ball(0.5, 0, 2.12, 0, P.steel, 12); // helmet
    k.box(0.5, 0.08, 0.06, 0, 2.15, 0.47, P.ink); // visor slit
    k.cone(0.12, 0.6, 0, HEAD_TOP + 0.4, -0.1, P.coral, 8, { rx: -0.4 }); // plume
    k.cyl(0.45, 0.45, 0.1, -0.62, 1.15, 0.3, P.coral, 16, { rx: Math.PI / 2, rz: 0 }); // shield
    k.cyl(0.18, 0.18, 0.12, -0.62, 1.15, 0.33, P.honey, 12, { rx: Math.PI / 2 });
    k.cone(0.16, 0.5, 0.8, 1.45, 0.35, P.brass, 10, { rz: -0.9 }); // rally horn
  },
  'hoop-clash': (k) => {
    // a referee: a striped shirt, a whistle on a cord, the game ball under one arm
    pegDoll(k, P.white, P.ink);
    for (const y of [0.55, 0.85, 1.48]) k.cyl(0.5 + (1.6 - y) * 0.09, 0.5 + (1.6 - y) * 0.09, 0.1, 0, y, 0, P.ink, 14);
    k.ball(0.49, 0, 2.2, -0.04, P.ink, 12, { s: [1, 0.55, 1] }); // cap
    k.box(0.6, 0.06, 0.42, 0, 2.27, 0.5, P.ink, { rx: -0.15 }); // peak
    k.torus(0.4, 0.02, 0, 1.75, 0.1, P.coral, { rx: Math.PI / 2 + 0.45 }, Math.PI * 2, 12); // whistle cord
    k.cyl(0.07, 0.07, 0.2, 0.06, 1.42, 0.5, P.steel, 8, { rz: Math.PI / 2 }); // whistle
    k.ball(0.34, 0.86, 1.3, 0.4, P.ballOrange, 12); // the game ball
    k.torus(0.342, 0.022, 0.86, 1.3, 0.4, P.ink, { ry: Math.PI / 2 }, Math.PI * 2, 12);
  },
};

let built: Map<string, THREE.BufferGeometry> | null = null;
function greeterGeos() {
  if (built) return built;
  built = new Map();
  for (const g of GATES) {
    const k = new Kit();
    OUTFITS[g.game](k, g);
    built.set(g.id, k.build().solid!);
  }
  return built;
}

// ------------------------------------------------------------------ the scene component

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function Greeters() {
  const geos = useMemo(greeterGeos, []);
  const low = useGame((s) => s.quality) === 'low';
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), []);
  const spots = useMemo(() => GATES.map((g) => ({ g, ...greeterSpot(g), yaw: g.rot + 0.35, hop: 0, phase: Math.random() * 6 })), []);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const t = state.clock.elapsedTime;
    const g = useGame.getState();
    const talkOk = !inputBlocked(g) && useWelcome.getState().mode === null;
    let nearest: (typeof spots)[number] | null = null;
    let nearestD = BUBBLE_R;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const m = refs.current[i];
      if (!m) continue;
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      const want = d < WATCH_R ? Math.atan2(player.pos.x - s.x, player.pos.z - s.z) : s.g.rot + 0.35;
      s.yaw += wrap(want - s.yaw) * Math.min(1, dt * 5);
      if (d < nearestD && talkOk) {
        nearest = s;
        nearestD = d;
      }
      let y = Math.abs(Math.sin(t * 2 + s.phase)) * 0.05;
      if (s.hop > 0) {
        s.hop += dt;
        y += Math.sin(Math.min(1, s.hop / 0.3) * Math.PI) * 0.45;
        if (s.hop > 0.3) s.hop = 0;
      }
      m.position.set(s.x, y, s.z);
      m.rotation.set(0, s.yaw, s.hop > 0 && s.hop < 0.3 ? Math.sin(s.hop * 20) * 0.08 : 0);
    }
    const cur = useWelcome.getState().greeter;
    const next = nearest ? nearest.g.game : null;
    if (next !== cur) {
      if (nearest) nearest.hop = 0.001;
      setGreeter(next, t);
    }
    // keep the DOM bubble over the greeter's head
    const el = greeterBubble.el;
    if (el && nearest) {
      v.set(nearest.x, GREETER_BUBBLE_Y, nearest.z).project(camera);
      const vis = v.z < 1;
      el.style.opacity = vis ? '1' : '0';
      // keep the whole bubble on screen (it is centred above its anchor point)
      const hw = el.offsetWidth / 2 + 8;
      const x = Math.min(size.width - hw, Math.max(hw, (v.x * 0.5 + 0.5) * size.width));
      const y = Math.max(el.offsetHeight + 20, (-v.y * 0.5 + 0.5) * size.height);
      el.style.setProperty('--bx', `${x}px`);
      el.style.setProperty('--by', `${y}px`);
    }
  });

  return (
    <group>
      {spots.map((s, i) => (
        <mesh
          key={s.g.id}
          ref={(m) => {
            refs.current[i] = m;
          }}
          geometry={geos.get(s.g.id)}
          material={mat}
          position={[s.x, 0, s.z]}
          rotation={[0, s.yaw, 0]}
          castShadow={!low}
        />
      ))}
    </group>
  );
}
