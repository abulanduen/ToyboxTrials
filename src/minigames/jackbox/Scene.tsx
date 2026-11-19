/**
 * Jack-in-the-Box — the toys sit in a ring on an old biscuit-tin lid. A painted wind-up box in the
 * middle turns to face whoever holds it; each good answer cranks the handle (and plays the box's
 * tune) and swings it to the next toy. When the hidden fuse runs out, the lid bangs open and the
 * jack springs out at the holder.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '../../scene/RoundedBox';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim, type ToyAnim } from '../../character/anim';
import { MiniContender, createMiniAnim, type MiniAnim } from '../../character/MiniContender';
import { matchBus } from '../session';
import { paintMat, feltMat } from '../../scene/props';
import type { Contestant, MinigameSceneProps } from '../types';
import type { JackState } from './rules';

const LID_Y = 1.2;

interface Seat {
  c: Contestant;
  /** Angle around the ring (x = cos, z = sin). */
  a: number;
  x: number;
  z: number;
}

/** Seats around the ring, clockwise from above, with the local toy at the front (towards the camera). */
export function layoutSeats(contestants: Contestant[], localId: string) {
  const n = contestants.length;
  const r = ringRadius(n);
  const li = Math.max(0, contestants.findIndex((c) => c.id === localId));
  return contestants.map((c, i) => {
    const a = Math.PI / 2 + ((i - li) * Math.PI * 2) / n;
    return { c, a, x: Math.cos(a) * r, z: Math.sin(a) * r };
  });
}
const ringRadius = (n: number) => (n <= 3 ? 8 : n <= 5 ? 9.5 : 9.5 + (n - 5) * 1.3);

interface Bubble {
  text: string;
  kind: 'say' | 'no';
  at: number;
  v: number;
}

export function JackScene({ getState, contestants, localId }: MinigameSceneProps<JackState>) {
  const clock = useThree((s) => s.clock);
  const seats = useMemo(() => layoutSeats(contestants, localId), [contestants, localId]);
  const localAnim = useRef<ToyAnim>(createToyAnim());
  const miniAnims = useRef(new Map<string, MiniAnim>());
  for (const c of contestants) if (!c.isLocal && !miniAnims.current.has(c.id)) miniAnims.current.set(c.id, createMiniAnim());
  const bubbles = useRef(new Map<string, Bubble>());
  const box = useRef({ cranks: 0, crankAt: -99, popAt: -99, popped: false });

  useEffect(() => {
    let v = 0;
    const say = (id: string, text: string, kind: Bubble['kind']) => bubbles.current.set(id, { text, kind, at: clock.elapsedTime, v: ++v });
    const off = matchBus.on('event', (e) => {
      const now = clock.elapsedTime;
      switch (e.type) {
        case 'round-start':
          box.current.popped = false;
          bubbles.current.clear();
          sfx.windUp(6);
          break;
        case 'live':
          if (e.holder === localId) sfx.interact();
          break;
        case 'accept': {
          box.current.cranks++;
          box.current.crankAt = now;
          sfx.crank(box.current.cranks);
          say(e.id as string, e.display as string, 'say');
          if (e.id === localId) {
            localAnim.current.landT = 0;
            localAnim.current.landImpact = 0.5;
          } else {
            const a = miniAnims.current.get(e.id as string);
            if (a) a.hopT = 0;
          }
          if (e.to === localId) window.setTimeout(() => sfx.promptIn(), 120);
          break;
        }
        case 'reject':
          say(e.id as string, e.text as string, 'no');
          if (e.id === localId) sfx.reject();
          else sfx.bump();
          break;
        case 'pop': {
          box.current.popAt = now;
          box.current.popped = true;
          sfx.jackPop();
          if (e.id === localId) localAnim.current.elimT = 0;
          else {
            const a = miniAnims.current.get(e.id as string);
            if (a) a.outT = 0;
          }
          break;
        }
        case 'over': {
          const s = getState();
          for (const p of s?.players ?? []) {
            if (!p.alive) continue;
            if (p.id === localId) localAnim.current.interactT = 0;
            const a = miniAnims.current.get(p.id);
            if (a) a.cheerT = 0;
          }
          break;
        }
      }
    });
    return off;
  }, [clock, localId, getState]);

  // Advance the local toy's one-shot animations (the hub's controller isn't running here).
  useFrame((_, dt) => {
    const a = localAnim.current;
    a.landT += dt;
    if (a.interactT >= 0) a.interactT = a.interactT + dt > 0.75 ? -1 : a.interactT + dt;
    if (a.elimT >= 0) a.elimT = Math.min(2.0, a.elimT + dt);
  });

  return (
    <group>
      <CameraRig n={contestants.length} />
      <spotLight position={[0, 50, 20]} target-position={[0, 0, 0]} angle={0.55} penumbra={0.8} intensity={1.1} decay={0} distance={0} color="#FFF0D6" />
      <TinLid r={ringRadius(contestants.length) + 4.5} />
      <HolderRing getState={getState} seats={seats} />
      <group position={[0, LID_Y, 0]}>
        <TheBox getState={getState} seats={seats} box={box} clock={clock} />
      </group>
      {seats.map((s) => {
        const face = Math.atan2(-Math.cos(s.a), -Math.sin(s.a));
        return (
          <group key={s.c.id} position={[s.x, LID_Y, s.z]} rotation={[0, face, 0]}>
            {s.c.isLocal ? (
              <group scale={1.1}>
                <WindupBot anim={localAnim} paint={s.c.paint} hat={s.c.hat} keySkin={s.c.keySkin} />
              </group>
            ) : (
              <MiniContender paint={s.c.paint} anim={{ current: miniAnims.current.get(s.c.id)! }} />
            )}
          </group>
        );
      })}
      {seats.map((s) => (
        <NameTag key={s.c.id} seat={s} local={s.c.id === localId} bubbles={bubbles} clock={clock} getState={getState} />
      ))}
    </group>
  );
}

/** Elevated three-quarter view from behind the local toy; pulled back for bigger rings and portrait. */
function CameraRig({ n }: { n: number }) {
  const { camera, size } = useThree();
  useFrame((s) => {
    const cam = camera as THREE.PerspectiveCamera;
    const portrait = size.width < size.height;
    const fov = portrait ? 50 + (1 - size.width / size.height) * 36 : 46;
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const k = ringRadius(n) / 9.5;
    const t = s.clock.elapsedTime;
    // Steep enough that the box never hides the toy opposite you; the ring sits below the HUD.
    const z = (portrait ? 30 : 22) * k;
    const y = (portrait ? 42 : 37) * k;
    cam.position.set(Math.sin(t * 0.08) * 1.2, y, z);
    // Aim past the centre so the far side of the ring clears the category card and answer box.
    // Short, wide screens (phones in landscape) need more room above the ring for the HUD.
    const wide = size.width / size.height > 1.9 ? 1.6 : 1;
    cam.lookAt(0, 0, portrait ? -1.5 * k : -6 * k * wide);
  });
  return null;
}

/** A biscuit-tin lid on a cork coaster: the arena. */
function TinLid({ r }: { r: number }) {
  const dots = useMemo(() => Array.from({ length: 28 }, (_, i) => (i / 28) * Math.PI * 2), []);
  return (
    <group>
      <mesh position={[0, 0.3, 0]} receiveShadow material={paintMat('#B9875A', 0.95)}>
        <cylinderGeometry args={[r + 1.6, r + 1.6, 0.6, 48]} />
      </mesh>
      <mesh position={[0, 0.6 + (LID_Y - 0.6) / 2, 0]} castShadow receiveShadow material={paintMat(PALETTE.toyBlue, 0.35, 0.55)}>
        <cylinderGeometry args={[r, r + 0.15, LID_Y - 0.6, 48]} />
      </mesh>
      <mesh position={[0, LID_Y + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={feltMat('#6E4C72')}>
        <circleGeometry args={[r - 0.6, 48]} />
      </mesh>
      <mesh position={[0, LID_Y + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.honey, 0.4, 0.5)}>
        <ringGeometry args={[r - 0.6, r, 48]} />
      </mesh>
      {dots.map((a) => (
        <mesh key={a} position={[Math.cos(a) * (r + 0.1), 0.9, Math.sin(a) * (r + 0.1)]} rotation={[0, -a + Math.PI / 2, 0]} material={paintMat(PALETTE.cream, 0.5)}>
          <circleGeometry args={[0.16, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** A glowing ring on the felt under whoever holds the box. */
function HolderRing({ getState, seats }: { getState: () => JackState | null; seats: Seat[] }) {
  const ring = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const pos = useRef(new THREE.Vector3());
  useFrame((st, rawDt) => {
    const s = getState();
    const seat = s && seats.find((x) => x.c.id === s.holder);
    const show = !!seat && (s!.phase === 'reveal' || s!.phase === 'live');
    ring.current.visible = show;
    if (!seat) return;
    pos.current.set(seat.x, LID_Y + 0.05, seat.z);
    ring.current.position.lerp(pos.current, 1 - Math.exp(-14 * Math.min(rawDt, 0.05)));
    const k = 0.5 + Math.sin(st.clock.elapsedTime * 6) * 0.2;
    mat.current.opacity = s!.phase === 'live' ? k : 0.3;
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.8, 2.6, 32]} />
      <meshBasicMaterial ref={mat} color={PALETTE.honey} transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}

function TheBox({
  getState,
  seats,
  box,
  clock,
}: {
  getState: () => JackState | null;
  seats: Seat[];
  box: React.RefObject<{ cranks: number; crankAt: number; popAt: number; popped: boolean }>;
  clock: THREE.Clock;
}) {
  const turn = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const crank = useRef<THREE.Group>(null!);
  const lid = useRef<THREE.Group>(null!);
  const jack = useRef<THREE.Group>(null!);
  const lastTick = useRef(0);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = getState();
    const b = box.current!;
    const now = clock.elapsedTime;
    // Face the holder (crank side towards them), taking the short way round.
    const seat = s && seats.find((x) => x.c.id === s.holder);
    if (seat) {
      const target = -seat.a;
      let d = target - turn.current.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      turn.current.rotation.y += d * (1 - Math.exp(-9 * dt));
    }
    // Crank: one full turn per accepted answer.
    const ck = Math.min(1, (now - b.crankAt) / 0.45);
    crank.current.rotation.x = (b.cranks - 1 + ck) * Math.PI * 2;
    // Tension wobble grows with time held this round (not with the hidden fuse, which stays secret).
    const live = s?.phase === 'live';
    const held = live ? s!.fuseTotalMs - s!.fuseMs : 0;
    const tension = live ? Math.min(1, held / 20000) : 0;
    const w = tension * 0.07 + (live ? 0.01 : 0);
    body.current.rotation.z = Math.sin(now * (14 + tension * 16)) * w;
    body.current.rotation.x = Math.cos(now * (11 + tension * 14)) * w * 0.6;
    if (live && now - lastTick.current > 1.1 - tension * 0.6) {
      lastTick.current = now;
      sfx.tick();
    }
    // The pop.
    const pk = b.popped ? now - b.popAt : -1;
    let ext = 0;
    if (pk >= 0) ext = pk < 0.12 ? pk / 0.12 : 1 + Math.sin(pk * 13) * Math.exp(-pk * 2.2) * 0.3;
    jack.current.visible = ext > 0.02;
    jack.current.position.y = 3.6 + ext * 3.2;
    jack.current.scale.y = 0.2 + ext * 0.8;
    jack.current.rotation.z = pk >= 0 ? -0.35 * ext + Math.sin(pk * 8) * 0.12 * Math.exp(-pk) : 0;
    lid.current.rotation.z = THREE.MathUtils.lerp(lid.current.rotation.z, ext > 0.02 ? 2.1 : 0, 1 - Math.exp(-16 * dt));
  });
  const sides = [PALETTE.honey, PALETTE.coral, PALETTE.toyBlue, PALETTE.sage];
  return (
    <group ref={turn}>
      <mesh position={[0, 0.15, 0]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
        <cylinderGeometry args={[2.4, 2.6, 0.3, 24]} />
      </mesh>
      <group ref={body} position={[0, 0.3, 0]} scale={1.2}>
        <RoundedBox args={[3.4, 3.2, 3.4]} radius={0.22} smoothness={2} position={[0, 1.6, 0]} castShadow receiveShadow material={paintMat(PALETTE.inkPurple, 0.55)} />
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((r, i) => (
          <group key={r} rotation={[0, r, 0]}>
            <mesh position={[0, 1.6, 1.72]} material={paintMat(sides[i], 0.5)}>
              <circleGeometry args={[1.0, 4]} />
            </mesh>
            <mesh position={[0, 1.6, 1.73]} material={paintMat(PALETTE.cream, 0.5)}>
              <circleGeometry args={[0.35, 5]} />
            </mesh>
          </group>
        ))}
        {/* crank on the +x side, which turns to face the holder */}
        <group ref={crank} position={[1.75, 1.8, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[0.25, 0, 0]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
            <cylinderGeometry args={[0.12, 0.12, 0.6, 8]} />
          </mesh>
          <mesh position={[0.55, 0.45, 0]} material={paintMat(PALETTE.brass, 0.3, 0.85)}>
            <boxGeometry args={[0.16, 1.0, 0.16]} />
          </mesh>
          <mesh position={[0.8, 0.9, 0]} rotation={[0, 0, Math.PI / 2]} material={paintMat(PALETTE.coral, 0.5)}>
            <cylinderGeometry args={[0.16, 0.16, 0.55, 8]} />
          </mesh>
        </group>
        <group ref={lid} position={[-1.7, 3.2, 0]}>
          <RoundedBox args={[3.5, 0.3, 3.5]} radius={0.1} smoothness={2} position={[1.7, 0.15, 0]} castShadow material={paintMat(PALETTE.coral, 0.5)} />
          <mesh position={[1.7, 0.36, 0]} material={paintMat(PALETTE.honey, 0.4)}>
            <sphereGeometry args={[0.3, 10, 8]} />
          </mesh>
        </group>
        <group ref={jack} position={[0, 3.6, 0]} visible={false}>
          <mesh position={[0, -1.6, 0]} material={paintMat('#D9D2C3', 0.35, 0.3)}>
            <cylinderGeometry args={[0.45, 0.45, 3.2, 10, 6, true]} />
          </mesh>
          <mesh position={[0, 0.4, 0]} castShadow material={paintMat(PALETTE.cream, 0.4)}>
            <sphereGeometry args={[1.2, 16, 12]} />
          </mesh>
          {/* ruff */}
          <mesh position={[0, -0.6, 0]} rotation={[Math.PI / 2, 0, 0]} material={paintMat(PALETTE.honey, 0.5)}>
            <torusGeometry args={[0.9, 0.3, 6, 12]} />
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow material={paintMat(PALETTE.coral, 0.5)}>
            <coneGeometry args={[0.95, 1.7, 10]} />
          </mesh>
          <mesh position={[0, 2.65, 0]} material={paintMat(PALETTE.honey, 0.4)}>
            <sphereGeometry args={[0.3, 8, 6]} />
          </mesh>
          {/* face looks out along +x (towards the holder) */}
          <mesh position={[1.15, 0.35, 0]} material={paintMat(PALETTE.coral, 0.4)}>
            <sphereGeometry args={[0.25, 8, 6]} />
          </mesh>
          {[-0.4, 0.4].map((z) => (
            <mesh key={z} position={[1.02, 0.75, z]} material={paintMat(PALETTE.ink, 0.5)}>
              <sphereGeometry args={[0.13, 8, 6]} />
            </mesh>
          ))}
          <mesh position={[1.0, 0.0, 0]} rotation={[0, Math.PI / 2, 0]} material={paintMat(PALETTE.ink, 0.5)}>
            <torusGeometry args={[0.35, 0.06, 6, 12, Math.PI]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/** Name label above each toy; becomes a speech bubble with their answer for a moment. */
function NameTag({
  seat,
  local,
  bubbles,
  clock,
  getState,
}: {
  seat: Seat;
  local: boolean;
  bubbles: React.RefObject<Map<string, Bubble>>;
  clock: THREE.Clock;
  getState: () => JackState | null;
}) {
  const sprite = useRef<THREE.Sprite>(null!);
  const drawn = useRef('');
  const { canvas, tex } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { canvas, tex };
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(() => {
    const b = bubbles.current!.get(seat.c.id);
    const fresh = b && clock.elapsedTime - b.at < (b.kind === 'say' ? 2.6 : 1.6);
    const p = getState()?.players.find((x) => x.id === seat.c.id);
    const out = !!p && !p.alive;
    const label = local ? 'You' : seat.c.name;
    const key = fresh ? `${b!.kind}|${b!.v}` : `name|${out}`;
    if (key !== drawn.current) {
      drawn.current = key;
      draw(canvas, fresh ? b!.text : label, fresh ? b!.kind : out ? 'out' : local ? 'me' : 'name');
      tex.needsUpdate = true;
    }
    // sizeAttenuation is off: scale is a fraction of the view height, so far toys stay readable.
    const big = fresh ? 0.075 : 0.05;
    sprite.current.scale.set(big * 4, big, 1);
    sprite.current.position.y = LID_Y + (local ? 6.4 : 4.6) + (fresh ? 0.6 : 0);
  });
  return (
    <sprite ref={sprite} position={[seat.x, LID_Y + 5, seat.z]} renderOrder={10}>
      <spriteMaterial map={tex} transparent depthTest={false} sizeAttenuation={false} />
    </sprite>
  );
}

function draw(c: HTMLCanvasElement, text: string, kind: 'say' | 'no' | 'name' | 'me' | 'out') {
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const bubble = kind === 'say' || kind === 'no';
  let size = bubble ? 60 : 46;
  g.font = `700 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
  while (g.measureText(text).width > c.width - 70 && size > 26) {
    size -= 2;
    g.font = `700 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
  }
  const w = Math.min(c.width - 8, g.measureText(text).width + 48);
  const h = bubble ? 100 : 72;
  const x = (c.width - w) / 2;
  const y = (c.height - h) / 2;
  const fill = kind === 'say' ? '#FFF9EE' : kind === 'no' ? '#F3B1AB' : kind === 'me' ? '#FFE3A3' : kind === 'out' ? 'rgba(255,249,238,0.45)' : 'rgba(255,249,238,0.85)';
  g.fillStyle = fill;
  g.strokeStyle = '#2B2433';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
  g.stroke();
  g.fillStyle = kind === 'out' ? 'rgba(43,36,51,0.5)' : '#2B2433';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 3);
  if (kind === 'no' || kind === 'out') {
    // strike-through
    const tw = Math.min(w - 30, g.measureText(text).width);
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(c.width / 2 - tw / 2, c.height / 2 + 2);
    g.lineTo(c.width / 2 + tw / 2, c.height / 2 + 2);
    g.stroke();
  }
}
