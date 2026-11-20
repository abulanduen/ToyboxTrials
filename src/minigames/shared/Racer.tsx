/**
 * Render side of the shared movement core: one toy following a `Mover`.
 *
 * The local player is the full `WindupBot` (walk cycle, jump squash, footsteps); everyone else is
 * a cheap `MiniContender` with a little waddle. Positions come straight from the rules state each
 * frame (lightly smoothed), so nothing here is React state.
 *
 * Coordinates are the rules core's: place the Racer inside the same group as the course.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim, type ToyAnim } from '../../character/anim';
import { MiniContender, createMiniAnim, type MiniAnim } from '../../character/MiniContender';
import { blobShadowTexture } from '../../scene/textures';
import { matchBus } from '../session';
import type { Contestant } from '../types';
import { moverSpeed, type Mover } from './movement';
import { YouMarker } from './YouMarker';

export interface RacerView {
  m: Mover;
  /** 0..1 while being thrown through the air (knock-back, spring pad…), otherwise −1. */
  tossK: number;
  /** Height of the toss arc (cm). */
  tossH?: number;
  /** Stunned / held: wobbles on the spot. */
  dizzy: boolean;
  /** Finished: celebrates. */
  cheer: boolean;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function Racer({ c, view }: { c: Contestant; view: () => RacerView | null }) {
  const root = useRef<THREE.Group>(null!);
  const tilt = useRef<THREE.Group>(null!);
  const shadow = useRef<THREE.Mesh>(null!);
  const toy = useRef<ToyAnim>(createToyAnim());
  const mini = useRef<MiniAnim>(createMiniAnim());
  const st = useRef({ init: false, yaw: Math.PI, simYaw: Math.PI, groundY: 0, stepIdx: 0, phase: 0, cheerAt: 0 });
  const inner = useRef<THREE.Group>(null!);

  // Jump / land feedback comes from the rules core's events (ids match contestants).
  useEffect(
    () =>
      matchBus.on('event', (e) => {
        if (e.id !== c.id) return;
        if (e.type === 'jump' && c.isLocal) sfx.jump();
        if (e.type === 'land') {
          toy.current.landT = 0;
          toy.current.landImpact = (e.impact as number) ?? 1;
          if (c.isLocal) sfx.land(toy.current.landImpact);
        }
      }),
    [c.id, c.isLocal],
  );

  useFrame((state, rawDt) => {
    const v = view();
    root.current.visible = shadow.current.visible = !!v;
    if (!v) return;
    const dt = Math.min(rawDt, 1 / 20);
    const { m } = v;
    const s = st.current;
    const g = root.current;
    const tossing = v.tossK >= 0;
    const arc = tossing ? Math.sin(Math.min(1, v.tossK) * Math.PI) * (v.tossH ?? 7) : 0;

    // Follow the simulation; snap on the first frame and on big jumps (respawns).
    const far = Math.hypot(g.position.x - m.x, g.position.z - m.z) > 12;
    const k = !s.init || (far && !tossing) ? 1 : 1 - Math.exp(-28 * dt);
    g.position.x += (m.x - g.position.x) * k;
    g.position.z += (m.z - g.position.z) * k;
    g.position.y = m.y + arc;
    const dyaw = wrapAngle(m.yaw - s.yaw);
    s.yaw = s.init ? s.yaw + dyaw * (1 - Math.exp(-22 * dt)) : m.yaw;
    g.rotation.y = s.yaw;

    const speed = tossing ? 0 : moverSpeed(m);
    const t = state.clock.elapsedTime;
    // Tumble while thrown, wobble while dizzy.
    tilt.current.rotation.x = tossing ? -v.tossK * Math.PI * 2 : 0;
    tilt.current.rotation.z = v.dizzy && !tossing ? Math.sin(t * 9) * 0.14 : c.isLocal ? 0 : Math.sin(s.phase) * 0.09 * Math.min(1, speed / 8);
    const pivot = tossing ? 1.7 : 0; // spin about the middle, not the feet
    tilt.current.position.y = pivot;
    inner.current.position.y = -pivot;
    const simTurn = s.init && dt > 0 ? wrapAngle(m.yaw - s.simYaw) / dt : 0;
    s.simYaw = m.yaw;

    if (c.isLocal) {
      const a = toy.current;
      a.speed = speed;
      a.grounded = m.grounded && !tossing;
      a.vy = m.vy;
      a.turnRate += (THREE.MathUtils.clamp(simTurn, -13, 13) - a.turnRate) * (1 - Math.exp(-12 * dt));
      a.landT += dt;
      if (a.interactT >= 0) a.interactT = a.interactT + dt > 0.75 ? -1 : a.interactT + dt;
      if (v.cheer && a.interactT < 0 && t > s.cheerAt) {
        a.interactT = 0;
        s.cheerAt = t + 1.3;
      }
      if (a.grounded) {
        a.stepPhase += speed * dt * 1.35;
        const idx = Math.floor(a.stepPhase / Math.PI);
        if (idx !== s.stepIdx && speed > 1.5) sfx.footstep(idx % 2 === 0);
        s.stepIdx = idx;
      }
    } else {
      s.phase += speed * dt * 1.35;
      const a = mini.current;
      if (v.cheer && a.cheerT < 0) a.cheerT = 0;
      if (!v.cheer) a.cheerT = -1;
    }

    // Contact blob on the surface below (shadow maps are off on the Low tier).
    if (m.grounded) s.groundY = m.y;
    else if (m.y < s.groundY) s.groundY = Math.max(0, m.y);
    const sc = THREE.MathUtils.clamp(1 - (g.position.y - s.groundY) * 0.1, 0.4, 1);
    shadow.current.position.set(g.position.x, s.groundY + 0.12, g.position.z);
    s.init = true;
    shadow.current.scale.setScalar(sc * 3.1);
    (shadow.current.material as THREE.MeshBasicMaterial).opacity = sc * 0.9;
  });

  return (
    <>
      <group ref={root}>
        <group ref={tilt}>
          <group ref={inner}>
            {c.isLocal ? <WindupBot anim={toy} paint={c.paint} hat={c.hat} keySkin={c.keySkin} accessories={c.accessories} /> : <MiniContender paint={c.paint} anim={mini} scale={0.92} />}
          </group>
        </group>
        {c.isLocal && <YouMarker height={4.6} />}
        {c.isLocal && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, 0]} renderOrder={2}>
            <ringGeometry args={[1.55, 1.95, 28]} />
            <meshBasicMaterial color={PALETTE.honey} transparent opacity={0.85} depthWrite={false} />
          </mesh>
        )}
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blobShadowTexture()} transparent depthWrite={false} />
      </mesh>
    </>
  );
}
