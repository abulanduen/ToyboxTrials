/**
 * Pipwick, the Hub's welcome mascot: a small wind-up tin songbird in a postman's cap with a brass
 * key in his back (original design, code-built in the chunky toy style). He waits by the plaza
 * (layout.ts PIPWICK_HOME), turns to watch you when you come near, and on your first visit flies
 * you round the Hub (src/game/welcome.ts). Talking to him replays the tour.
 *
 * Cheap: the static body is one merged mesh; the two wings and the key are separate so they can
 * flap and turn. Also drives the tour each frame, and reads the tour's Next/Skip keys through the
 * shared action layer before the player controller ends the input frame.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { player } from '../game/player';
import { wasPressed } from '../game/input';
import { tourFlag } from '../game/tourFlag';
import { stepWelcome, tourNextPressed, tourRt, tourSkipPressed, useWelcome, chatChoose } from '../game/welcome';
import { TOUR_STOPS, flyTime, mascotFlight } from '../game/tour';
import { PIPWICK_HOME } from './layout';
import { Kit } from './kit';
import { blobShadowTexture } from './textures';

/** A little bigger than a contender, so he reads from across the table during the tour. */
const SCALE = 1.2;
const BODY = PALETTE.coral;
const BELLY = PALETTE.cream;
const WING = PALETTE.toyBlue;
const CAP = PALETTE.inkPurple;

/** The merged static body, built once (≈ 3.5 cm tall to the top of the cap, before SCALE). */
let bodyGeo: THREE.BufferGeometry | null = null;
function pipwickBody() {
  if (bodyGeo) return bodyGeo;
  const k = new Kit();
  // feet and wire legs
  for (const sx of [-0.32, 0.32]) {
    k.ball(0.22, sx, 0.1, 0.18, PALETTE.brass, 10, { s: [1, 0.45, 1.5] });
    k.rod([sx, 0.12, 0.08], [sx * 0.8, 0.95, 0], 0.07, PALETTE.brass, 6);
  }
  // round tin body, cream belly, head
  k.ball(1.0, 0, 1.65, 0, BODY, 18, { s: [0.95, 0.9, 1.1] });
  k.ball(0.8, 0, 1.55, 0.5, BELLY, 16, { s: [0.82, 0.78, 0.55] });
  k.ball(0.68, 0, 2.72, 0.38, BODY, 16);
  // painted tin seam round the middle
  k.torus(0.93, 0.05, 0, 1.68, 0, PALETTE.brass, { rx: Math.PI / 2, s: [1, 1.16, 1] });
  // beak and face
  k.cone(0.2, 0.5, 0, 2.66, 1.1, PALETTE.honey, 10, { rx: Math.PI / 2 });
  for (const sx of [-1, 1]) {
    k.ball(0.17, sx * 0.27, 2.88, 0.93, PALETTE.white, 10);
    k.ball(0.09, sx * 0.29, 2.9, 1.06, PALETTE.ink, 8);
    k.ball(0.1, sx * 0.44, 2.6, 0.86, PALETTE.blush, 8, { s: [1, 0.6, 0.4] });
  }
  // postman's cap with a little badge
  k.cyl(0.46, 0.5, 0.32, 0, 3.33, 0.3, CAP, 16);
  k.cyl(0.47, 0.47, 0.06, 0, 3.5, 0.3, CAP, 16);
  k.box(0.7, 0.05, 0.42, 0, 3.2, 0.82, CAP, { rx: -0.25 });
  k.ball(0.09, 0, 3.36, 0.79, PALETTE.honey, 8);
  // tail feathers, fanned
  for (const a of [-0.45, 0, 0.45]) k.box(0.22, 0.05, 0.9, Math.sin(a) * 0.35, 1.45 + Math.abs(a) * 0.1, -1.25, WING, { ry: a, rx: -0.55 });
  bodyGeo = k.build().solid!;
  return bodyGeo;
}

const wingGeo = new THREE.SphereGeometry(0.62, 12, 8).scale(0.22, 0.72, 1).translate(0, -0.45, 0);
const keyGeo = new THREE.TorusGeometry(0.2, 0.065, 6, 14);
const keyStemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6).rotateX(Math.PI / 2);

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function Pipwick() {
  const geo = useMemo(pipwickBody, []);
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.15 }),
      wing: new THREE.MeshStandardMaterial({ color: WING, roughness: 0.4, metalness: 0.15 }),
      brass: new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.32, metalness: 0.85 }),
      shadow: new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    }),
    [],
  );
  const root = useRef<THREE.Group>(null!);
  const bird = useRef<THREE.Group>(null!);
  const wingL = useRef<THREE.Mesh>(null!);
  const wingR = useRef<THREE.Mesh>(null!);
  const key = useRef<THREE.Group>(null!);
  const shadow = useRef<THREE.Mesh>(null!);
  const st = useRef({ x: PIPWICK_HOME.x, z: PIPWICK_HOME.z, y: 0, yaw: PIPWICK_HOME.yaw, flap: 0, hop: 0, nextHop: 3 });

  // Tour keys go through the shared action layer. This runs before the player controller
  // (priority −1), which clears the frame's presses at its end. Keys pressed on a focused DOM
  // button are left to the button (no double step).
  useFrame(() => {
    tourFlag.ate = false;
    if (!tourFlag.active) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && el.tagName === 'BUTTON') return;
    const mode = useWelcome.getState().mode;
    if (mode === 'tour') {
      if (wasPressed('pause')) tourSkipPressed();
      else if (wasPressed('interact') || wasPressed('jump')) tourNextPressed();
      else return;
      tourFlag.ate = true;
    } else if (mode === 'chat' && wasPressed('pause')) {
      chatChoose('bye');
      tourFlag.ate = true;
    }
  }, -1);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const t = state.clock.elapsedTime;
    stepWelcome(dt);
    const s = st.current;
    const w = useWelcome.getState();
    const tour = w.mode === 'tour' ? tourRt.state : null;
    let flying = false;
    let faceYaw: number | null = null;
    if (tour && tour.phase !== 'done') {
      const stop = TOUR_STOPS[tour.stop];
      if (tour.phase === 'fly') {
        const k = Math.min(1, tour.t / flyTime(tour.stop));
        const [x, y, z] = mascotFlight(tour.stop, k);
        if (Math.hypot(x - s.x, z - s.z) > 1e-3) faceYaw = Math.atan2(x - s.x, z - s.z);
        s.x = x;
        s.y = y;
        s.z = z;
        flying = k < 1;
      } else {
        s.x = stop.mascot.x;
        s.z = stop.mascot.z;
        s.y = stop.mascot.y ?? 0;
        faceYaw = Math.atan2(stop.cam[0] - s.x, stop.cam[2] - s.z); // talk to the camera
      }
    } else {
      // at home: settle back down and keep an eye on the player when they are close
      s.x += (PIPWICK_HOME.x - s.x) * Math.min(1, dt * 4);
      s.z += (PIPWICK_HOME.z - s.z) * Math.min(1, dt * 4);
      s.y = Math.max(0, s.y - dt * 8);
      const d = player.level === 'table' ? Math.hypot(player.pos.x - s.x, player.pos.z - s.z) : Infinity;
      faceYaw = d < 10 || w.mode === 'chat' ? Math.atan2(player.pos.x - s.x, player.pos.z - s.z) : PIPWICK_HOME.yaw;
      if (t > s.nextHop) {
        s.hop = 0.001;
        s.nextHop = t + (w.mode === 'chat' ? 1.6 : 4 + Math.random() * 5);
      }
    }
    if (tour?.phase === 'talk' && t > s.nextHop) {
      s.hop = 0.001;
      s.nextHop = t + 1.4 + Math.random();
    }
    if (faceYaw !== null) s.yaw += wrap(faceYaw - s.yaw) * Math.min(1, dt * (flying ? 10 : 6));

    // little hops, flapping wings, turning key
    let hopY = 0;
    if (s.hop > 0) {
      s.hop += dt;
      hopY = Math.sin(Math.min(1, s.hop / 0.32) * Math.PI) * 0.6;
      if (s.hop > 0.32) s.hop = 0;
    }
    s.flap += dt * (flying ? 26 : s.hop > 0 ? 14 : 0);
    const flapA = flying || s.hop > 0 ? 0.35 + Math.sin(s.flap) * 0.6 : 0.12 + Math.sin(t * 1.3) * 0.03;
    root.current.position.set(s.x, s.y, s.z);
    root.current.rotation.y = s.yaw;
    bird.current.position.y = hopY * SCALE + 0.08 + (flying ? 0 : Math.sin(t * 2.4) * 0.04);
    bird.current.rotation.x = flying ? 0.25 : 0;
    wingL.current.rotation.z = flapA;
    wingR.current.rotation.z = -flapA;
    key.current.rotation.z += dt * (flying ? 9 : 1.6);
    shadow.current.position.set(s.x, 0.11, s.z);
    const sc = Math.max(0.35, 1 - (s.y + hopY) * 0.08);
    shadow.current.scale.setScalar(2.4 * sc);
    mats.shadow.opacity = 0.8 * sc;
  });

  return (
    <>
      <group ref={root} position={[PIPWICK_HOME.x, 0, PIPWICK_HOME.z]}>
        <group ref={bird} scale={SCALE}>
          <mesh geometry={geo} material={mats.body} castShadow />
          <mesh ref={wingL} geometry={wingGeo} material={mats.wing} position={[0.9, 2.05, -0.05]} castShadow />
          <mesh ref={wingR} geometry={wingGeo} material={mats.wing} position={[-0.9, 2.05, -0.05]} castShadow />
          <group ref={key} position={[0, 2.15, -1.25]}>
            <mesh geometry={keyStemGeo} material={mats.brass} position={[0, 0, 0.12]} />
            <mesh geometry={keyGeo} material={mats.brass} position={[0.22, 0, -0.05]} />
            <mesh geometry={keyGeo} material={mats.brass} position={[-0.22, 0, -0.05]} />
          </group>
        </group>
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} material={mats.shadow} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}
