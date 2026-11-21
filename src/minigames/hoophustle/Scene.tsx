/**
 * Hoop Hustle on the table: a chunky toy court (code-built, merged through the Kit), the hoop on
 * its wind-up slide track, the toys on their spots (the full WindupBot for you, MiniContenders
 * for the rest), the balls in flight, your aim marker and the throw's arc preview, which turns
 * gold when the throw will drop (it runs the rules' own physics, assists included).
 *
 * The camera stands behind your toy and looks past it at the hoop; when you hop to a new spot it
 * orbits round the hoop to follow (never cutting through the toy). Everything per frame reads the
 * rules state and plain objects; nothing here is React state per frame.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { playHoopCue, playHubCue, sfx, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { pressVirtual, releaseVirtual } from '../../game/input';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim } from '../../character/anim';
import { MiniContender, createMiniAnim } from '../../character/MiniContender';
import { Kit } from '../../scene/kit';
import { YouMarker } from '../shared/YouMarker';
import { matchBus, useMatch } from '../session';
import type { Contestant, MinigameSceneProps } from '../types';
import { BALL_GRAVITY, BALL_R, BOARD, POLE, RIM, STEP_MS, predictShot } from './physics';
import { DEFAULT_CONFIG, assistedThrow, buildSpots, canShoot, hoopXAt, shooterPos, type HoopState } from './rules';
import { shotPower } from '../shared/shotMeter';
import { cancelHoopCharge, localAim, localCharge, resetHoopLocal, setHoopMouseYaw, setHoopViewYaw, stageHoopCharge } from './local';

const P = PALETTE;
/** Value colours: 1 point sage, 2 toy blue, 3 coral (the HUD uses the same). */
export const VALUE_COLOURS = ['', P.sage, P.toyBlue, P.coral] as const;
/** Where a held ball is drawn: in front of the toy's chest, clear of its head (it leaves from the Hub's release point). */
const HELD = { fwd: 1.45, y: 1.85 };
const COURT = { minX: -34, maxX: 34, minZ: -7, maxZ: 38 };
const TRACK_HALF = DEFAULT_CONFIG.slideAmp + 3.4;

const live = (getState: () => HoopState | null) => {
  const s = getState();
  return s?.kind === 'hoop-hustle' ? s : null;
};

// ---------------------------------------------------------------- static court (merged)
function courtGeometry() {
  const k = new Kit();
  const spots = buildSpots(DEFAULT_CONFIG);
  const half = (DEFAULT_CONFIG.arcDeg * Math.PI) / 180;
  // The table under it all, and the court board on it (its top is the felt plane, y = 0).
  k.box(96, 1.2, 64, 0, -0.9, 14, P.woodMid);
  k.block(COURT.maxX - COURT.minX, 0.6, COURT.maxZ - COURT.minZ, 0, -0.3, (COURT.minZ + COURT.maxZ) / 2, P.woodLight, {}, 0.25);
  // A cardboard rim round the court, low enough to see over.
  for (const s of [-1, 1]) k.box(0.8, 1.2, COURT.maxZ - COURT.minZ + 0.8, s * (COURT.maxX + 0.4), 0, (COURT.minZ + COURT.maxZ) / 2, P.cardboard);
  k.box(COURT.maxX - COURT.minX + 1.6, 1.2, 0.8, 0, 0, COURT.maxZ + 0.4, P.cardboard);
  k.box(COURT.maxX - COURT.minX + 1.6, 2.4, 0.8, 0, 0.6, COURT.minZ - 0.4, P.cardboard);
  // The wind-up slide track behind the hoop: a rail with end stops and a key on the right end.
  k.block(TRACK_HALF * 2, 0.6, 1.6, 0, 0.3, POLE.z, P.inkPurple, {}, 0.12);
  k.box(TRACK_HALF * 2 - 0.6, 0.12, 0.35, 0, 0.62, POLE.z, P.brass);
  for (const s of [-1, 1]) k.block(0.9, 1.3, 1.9, s * (TRACK_HALF + 0.45), 0.65, POLE.z, P.coral, {}, 0.15);
  k.cyl(0.85, 0.95, 1.6, TRACK_HALF + 2.4, 0.8, POLE.z, P.inkPurple, 14);
  // Decals on the court (flat, just above it).
  k.with('decal', () => {
    // the painted lane under the hoop and its free-throw cap
    k.add(new THREE.PlaneGeometry(7, 9.5), P.coral, 0, 0.012, 4.2, { rx: -Math.PI / 2 });
    k.add(new THREE.CircleGeometry(3.5, 24, 0, Math.PI), P.coral, 0, 0.012, 8.95, { rx: -Math.PI / 2, rz: Math.PI });
    k.add(new THREE.RingGeometry(3.3, 3.55, 28, 1, Math.PI, Math.PI), P.white, 0, 0.02, 8.95, { rx: -Math.PI / 2 });
    k.add(new THREE.PlaneGeometry(7.4, 0.25), P.white, 0, 0.02, 8.95, { rx: -Math.PI / 2 });
    // a line along the baseline
    k.add(new THREE.PlaneGeometry(COURT.maxX - COURT.minX - 1.6, 0.3), P.white, 0, 0.02, -1.2, { rx: -Math.PI / 2 });
    // the taped arcs, one per ring, a little past the end spots
    for (const r of DEFAULT_CONFIG.rings) {
      const a = half + 0.12;
      k.add(new THREE.RingGeometry(r + 2.5, r + 2.85, 64, 1, -Math.PI / 2 - a, a * 2), P.white, 0, 0.02, 0, { rx: -Math.PI / 2 });
    }
    // every spot: a coloured disc with a white rim, and a tape label behind it with 1–3 dots
    for (const sp of spots) {
      const col = VALUE_COLOURS[sp.value];
      k.add(new THREE.CircleGeometry(1.75, 24), P.white, sp.x, 0.022, sp.z, { rx: -Math.PI / 2 });
      k.add(new THREE.CircleGeometry(1.45, 24), col, sp.x, 0.03, sp.z, { rx: -Math.PI / 2 });
      const out = Math.hypot(sp.x, sp.z);
      const ux = sp.x / out;
      const uz = sp.z / out;
      const lx = sp.x + ux * 2.55;
      const lz = sp.z + uz * 2.55;
      const yaw = Math.atan2(ux, uz);
      k.add(new THREE.PlaneGeometry(0.9 + sp.value * 0.75, 1.15), P.cream, lx, 0.025, lz, { rx: -Math.PI / 2, rz: yaw });
      for (let i = 0; i < sp.value; i++) {
        const o = (i - (sp.value - 1) / 2) * 0.72;
        k.add(new THREE.CircleGeometry(0.27, 12), col, lx + Math.cos(yaw) * o, 0.035, lz - Math.sin(yaw) * o, { rx: -Math.PI / 2 });
      }
    }
  });
  return k.build();
}

/** The hoop's moving parts (centred on x = 0): base on the rail, pole, backboard, arm and rim. */
function hoopGeometry() {
  const k = new Kit();
  k.block(2.8, 1.0, 2.4, 0, 1.1, POLE.z, P.toyBlue, {}, 0.18);
  k.cyl(POLE.r * 0.75, POLE.r * 0.85, POLE.top - 1.6, 0, 1.6 + (POLE.top - 1.6) / 2, POLE.z, P.toyBlue, 12);
  k.block(BOARD.w, BOARD.h, BOARD.t, 0, BOARD.y, BOARD.z, P.white, {}, 0.08);
  k.box(BOARD.w + 0.1, 0.3, BOARD.t + 0.06, 0, BOARD.y + BOARD.h / 2, BOARD.z, P.coral);
  k.add(new THREE.RingGeometry(0.95, 1.2, 4, 1, Math.PI / 4), P.coral, 0, RIM.y + 1.25, BOARD.z + BOARD.t / 2 + 0.01);
  const armLen = -BOARD.z - RIM.r;
  k.box(0.5, 0.2, armLen, 0, RIM.y, BOARD.z + armLen / 2 + BOARD.t / 2, P.coral);
  k.torus(RIM.r, RIM.tube + 0.03, 0, RIM.y, 0, P.coral, { rx: Math.PI / 2 }, Math.PI * 2, 28);
  return k.build().solid!;
}

let netTex: THREE.CanvasTexture | null = null;
function netTexture() {
  if (netTex) return netTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 64);
    g.moveTo(i + 16, 0);
    g.lineTo(i, 64);
    g.stroke();
  }
  netTex = new THREE.CanvasTexture(c);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(5, 1.5);
  netTex.colorSpace = THREE.SRGBColorSpace;
  return netTex;
}

function ballGeometry(body: string, seam: string) {
  const k = new Kit();
  k.ball(BALL_R, 0, 0, 0, body, 18);
  for (const xf of [{ rx: Math.PI / 2 }, {}, { ry: Math.PI / 2 }]) k.torus(BALL_R * 1.006, 0.05, 0, 0, 0, seam, xf, Math.PI * 2, 24);
  return k.build().solid!;
}

// ---------------------------------------------------------------- the hoop
function Hoop({ getState, materials }: { getState: () => HoopState | null; materials: { solid: THREE.Material; net: THREE.Material } }) {
  const group = useRef<THREE.Group>(null!);
  const net = useRef<THREE.Group>(null!);
  const key = useRef<THREE.Group>(null!);
  const flash = useRef<THREE.Mesh>(null!);
  const arrows = useRef<THREE.Group>(null!);
  const geo = useMemo(hoopGeometry, []);
  const fx = useRef({ swishAt: -1e9 });
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => matchBus.on('event', (e) => {
    if (e.type === 'hh-swish') fx.current.swishAt = performance.now();
  }), []);
  useFrame((_, dt) => {
    const s = live(getState);
    if (!s) return;
    const c = s.config;
    const warn = s.t >= c.slideAt - c.slideWarnMs && s.t < c.slideAt;
    const sliding = s.t >= c.slideAt;
    // A wobble on its base while the track winds up: it is about to go.
    const shake = warn && !reduced.current ? Math.sin(s.t / 22) * 0.12 * ((s.t - (c.slideAt - c.slideWarnMs)) / c.slideWarnMs) : 0;
    group.current.position.x = hoopXAt(c, s.t) + shake;
    key.current.rotation.x += dt * (warn ? 9 : sliding ? 2.2 : 0);
    arrows.current.visible = (warn && Math.floor(s.t / 250) % 2 === 0) || (sliding && s.t < c.slideAt + 2500);
    const k = Math.max(0, 1 - (performance.now() - fx.current.swishAt) / 450);
    net.current.scale.set(1 - k * 0.15, 1 + Math.sin(k * 9) * k * 0.35, 1 - k * 0.15);
    flash.current.visible = k > 0;
    flash.current.scale.setScalar(1 + (1 - k) * 1.2);
    (flash.current.material as THREE.MeshBasicMaterial).opacity = k * 0.8;
  });
  return (
    <>
      <group ref={group} name="hoophustle:hoop">
        <mesh geometry={geo} material={materials.solid} castShadow />
        {/* the net hangs from the rim (its top at the rim) and bulges after a swish */}
        <group ref={net} position={[0, RIM.y, 0]}>
          <mesh position={[0, -0.95, 0]} material={materials.net}>
            <cylinderGeometry args={[RIM.r * 0.97, RIM.r * 0.6, 1.9, 16, 1, true]} />
          </mesh>
        </group>
        <mesh ref={flash} position={[0, RIM.y + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <ringGeometry args={[RIM.r * 0.9, RIM.r * 1.25, 28]} />
          <meshBasicMaterial color={P.honey} transparent depthWrite={false} />
        </mesh>
      </group>
      {/* the track's wind-up key (spins while it winds and while the hoop slides) */}
      <group ref={key} position={[TRACK_HALF + 2.4, 1.0, POLE.z]}>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.9, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 1.8, 8]} />
          <meshStandardMaterial color={P.brass} metalness={0.6} roughness={0.35} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[1.9, s * 0.75, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.7, 0.2, 8, 16]} />
            <meshStandardMaterial color={P.brass} metalness={0.6} roughness={0.35} />
          </mesh>
        ))}
      </group>
      {/* left/right arrows on the court that flash while the hoop winds up */}
      <group ref={arrows} visible={false}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (TRACK_HALF - 1.5), 0.05, 1.2]} rotation={[-Math.PI / 2, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2]}>
            <circleGeometry args={[1.3, 3]} />
            <meshBasicMaterial color={P.honey} />
          </mesh>
        ))}
      </group>
    </>
  );
}

// ---------------------------------------------------------------- toys
function Shooter({ c, getState, ballGeo, goldGeo, ballMat }: { c: Contestant; getState: () => HoopState | null; ballGeo: THREE.BufferGeometry; goldGeo: THREE.BufferGeometry; ballMat: THREE.Material }) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const ball = useRef<THREE.Mesh>(null!);
  const full = useRef(createToyAnim());
  const mini = useRef(createMiniAnim());
  const last = useRef({ t: 0, x: 0, z: 0, shots: 0, makes: 0 });
  useFrame((_, rawDt) => {
    const s = live(getState);
    const p = s?.players.find((q) => q.id === c.id);
    root.current.visible = !!p;
    if (!s || !p) return;
    const dt = Math.min(0.1, rawDt);
    const pos = shooterPos(s, p);
    const moving = !!p.move;
    const hop = moving ? Math.abs(Math.sin(pos.hop * Math.PI * 3)) * 1.1 : 0;
    root.current.position.set(pos.x, 0, pos.z);
    body.current.position.y = hop;
    const yaw = moving ? Math.atan2(s.spots[p.move!.to].x - s.spots[p.move!.from].x, s.spots[p.move!.to].z - s.spots[p.move!.from].z) : c.isLocal ? (localAim() ?? p.yaw) : p.yaw;
    root.current.rotation.y = yaw;
    const step = Math.hypot(pos.x - last.current.x, pos.z - last.current.z);
    full.current.speed = moving ? Math.min(10, step / Math.max(0.001, dt)) : 0;
    full.current.stepPhase += full.current.speed * dt;
    full.current.grounded = hop < 0.05;
    if (p.shots > last.current.shots) {
      full.current.interactT = 0;
      mini.current.hopT = 0;
    }
    if (p.makes > last.current.makes) mini.current.cheerT = 0;
    if (full.current.interactT >= 0) full.current.interactT += dt;
    if (full.current.interactT > 0.75) full.current.interactT = -1;
    mini.current.hopT += dt;
    if (mini.current.cheerT >= 0) mini.current.cheerT = mini.current.cheerT + dt > 1.2 ? -1 : mini.current.cheerT + dt;
    last.current = { t: s.t, x: pos.x, z: pos.z, shots: p.shots, makes: p.makes };
    // The ball in hand rises as the throw charges.
    ball.current.visible = p.holding && s.phase === 'play';
    if (ball.current.visible) {
      const charge = c.isLocal ? (localCharge(s) ?? 0) : p.charging ? shotPower(s.t - p.chargeAt, s.config.chargeMs) : 0;
      ball.current.position.set(0, HELD.y + hop + charge * 0.9, HELD.fwd - charge * 0.2);
      ball.current.geometry = p.gold ? goldGeo : ballGeo;
    }
  });
  return (
    <group ref={root} name={`hoophustle:toy-${c.id}`}>
      <group ref={body}>
        {c.isLocal ? <WindupBot anim={full} paint={c.paint} hat={c.hat} keySkin={c.keySkin} accessories={c.accessories} /> : <MiniContender anim={mini} paint={c.paint} />}
      </group>
      <mesh ref={ball} geometry={ballGeo} material={ballMat} castShadow />
      {c.isLocal && (
        <>
          <YouMarker />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <ringGeometry args={[1.5, 1.8, 28]} />
            <meshBasicMaterial color={P.honey} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- balls in flight
const MAX_BALLS = 10;
function Balls({ getState, ballGeo, goldGeo, ballMat }: { getState: () => HoopState | null; ballGeo: THREE.BufferGeometry; goldGeo: THREE.BufferGeometry; ballMat: THREE.Material }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, rawDt) => {
    const s = live(getState);
    const balls = s?.balls ?? [];
    const dt = Math.min(0.1, rawDt);
    for (let i = 0; i < MAX_BALLS; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      const b = balls[i];
      m.visible = !!b && !!s;
      if (!b || !s) continue;
      // Online snapshots arrive a few times a frame apart: carry the ball on along its flight.
      const k = Math.max(0, Math.min(0.1, (s.t - b.at) / 1000));
      m.position.set(b.x + b.vx * k, Math.max(BALL_R, b.y + b.vy * k - 0.5 * BALL_GRAVITY * k * k), b.z + b.vz * k);
      m.geometry = b.gold ? goldGeo : ballGeo;
      const v = Math.hypot(b.vx, b.vz);
      if (v > 0.5) {
        axis.set(b.vz, 0, -b.vx).normalize();
        q.setFromAxisAngle(axis, (v * dt) / BALL_R);
        m.quaternion.premultiply(q);
      }
    }
  });
  return (
    <>
      {Array.from({ length: MAX_BALLS }, (_, i) => (
        <mesh key={i} ref={(m) => void (meshes.current[i] = m)} geometry={ballGeo} material={ballMat} castShadow visible={false} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- your aim and the arc preview
const ARC_POINTS = 28;
const AIM_DOTS = 5;
function AimAndArc({ getState, localId }: { getState: () => HoopState | null; localId: string }) {
  const arc = useRef<THREE.InstancedMesh>(null!);
  const aim = useRef<THREE.InstancedMesh>(null!);
  const pts = useMemo(() => new Float32Array(ARC_POINTS * 3), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const arcMat = useMemo(() => new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.9, depthWrite: false }), []);
  const aimMat = useMemo(() => new THREE.MeshBasicMaterial({ color: P.white, transparent: true, opacity: 0.85, depthWrite: false }), []);
  const white = useMemo(() => new THREE.Color(P.white), []);
  const gold = useMemo(() => new THREE.Color(P.honey), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const qq = useMemo(() => new THREE.Quaternion(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  useEffect(() => () => {
    arcMat.dispose();
    aimMat.dispose();
  }, [arcMat, aimMat]);
  useFrame(() => {
    const s = live(getState);
    const me = s?.players.find((p) => p.id === localId);
    arc.current.count = 0;
    aim.current.count = 0;
    if (!s || !me || !canShoot(s, me) || useMatch.getState().paused) return;
    const sp = s.spots[me.spot];
    const yaw = localAim() ?? me.yaw;
    const charge = localCharge(s);
    if (charge === null) {
      // Not charging: a short dotted line where you are facing, gold once it bends onto the hoop.
      const shot = assistedThrow(s, sp, yaw, 0, s.t);
      const bent = Math.abs(shot.yaw - yaw) > 1e-9 || shot.perfect !== null;
      aimMat.color.copy(bent ? gold : white);
      for (let i = 0; i < AIM_DOTS; i++) {
        const d = 2.4 + i * 1.5;
        e.set(-Math.PI / 2, 0, 0);
        qq.setFromEuler(e);
        pos.set(sp.x + Math.sin(shot.yaw) * d, 0.08, sp.z + Math.cos(shot.yaw) * d);
        m.compose(pos, qq, scale.setScalar(1 - i * 0.1));
        aim.current.setMatrixAt(i, m);
      }
      aim.current.count = AIM_DOTS;
      aim.current.instanceMatrix.needsUpdate = true;
      return;
    }
    const shot = assistedThrow(s, sp, yaw, charge, s.t);
    const r = predictShot(sp.x, sp.z, shot.yaw, shot.power, (i) => hoopXAt(s.config, s.t + i * STEP_MS), pts, ARC_POINTS, 3);
    arcMat.color.copy(r.scores ? gold : white);
    for (let i = 0; i < r.n; i++) {
      const k = i === r.n - 1 ? 1.7 : 1;
      m.makeScale(k, k, k).setPosition(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      arc.current.setMatrixAt(i, m);
    }
    arc.current.count = r.n;
    arc.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={arc} args={[undefined, undefined, ARC_POINTS]} material={arcMat} frustumCulled={false} name="hoophustle:arc">
        <sphereGeometry args={[0.22, 8, 6]} />
      </instancedMesh>
      <instancedMesh ref={aim} args={[undefined, undefined, AIM_DOTS]} material={aimMat} frustumCulled={false} name="hoophustle:aim">
        <circleGeometry args={[0.38, 3]} />
      </instancedMesh>
    </>
  );
}

// ---------------------------------------------------------------- camera
const scratchCam = new THREE.PerspectiveCamera();
const scratchV = new THREE.Vector3();

/** Vertical FOV: wider on tall screens so the hoop and your toy both fit. */
const fovFor = (aspect: number) => (aspect < 1 ? 50 + (1 - aspect) * 34 : 46);

/** How far round the hoop (radians) the camera stands from straight behind your toy: off to the court's
 * middle, so a throw's arc reads as a curve rather than end-on. */
const SIDE_OFFSET = 0.5;

interface Pose {
  /** Polar angle (round the hoop) and distance of the look-at point, its height. */
  theta: number;
  targetR: number;
  targetY: number;
  /** Direction the camera stands in from the look-at point (polar), its distance and elevation. */
  phi: number;
  dist: number;
  elev: number;
}

/**
 * Camera pose for spot (x, z): it looks at a point between your toy and the hoop, from behind and
 * off to the court's middle; the distance is fitted so your toy, the rim and the top of the
 * backboard (at either end of its slide) stay inside the screen's safe box.
 */
function cameraPose(x: number, z: number, aspect: number): Pose {
  const theta = Math.atan2(x, z);
  const r = Math.hypot(x, z);
  // Less off to the side on tall screens, where width is short.
  const side = aspect < 1 ? SIDE_OFFSET * 0.55 : SIDE_OFFSET;
  const phi = theta + (theta > 0.12 ? -side : side);
  const elev = (aspect < 1 ? 34 : 25) * (Math.PI / 180);
  const targetR = r * 0.5;
  const targetY = 5;
  const box = aspect < 1 ? { l: -0.9, r: 0.9, b: -0.4, t: 0.62 } : aspect < 1.6 ? { l: -0.62, r: 0.82, b: -0.62, t: 0.68 } : { l: -0.7, r: 0.82, b: -0.66, t: 0.72 };
  scratchCam.fov = fovFor(aspect);
  scratchCam.aspect = aspect;
  scratchCam.near = 0.5;
  scratchCam.far = 2000;
  scratchCam.updateProjectionMatrix();
  const tx = Math.sin(theta) * targetR;
  const tz = Math.cos(theta) * targetR;
  const cx = Math.sin(phi) * Math.cos(elev);
  const cz = Math.cos(phi) * Math.cos(elev);
  const cy = Math.sin(elev);
  const ux = Math.sin(theta);
  const uz = Math.cos(theta);
  const amp = DEFAULT_CONFIG.slideAmp;
  const pts: [number, number, number][] = [
    [x, 0, z],
    [x, 4.6, z],
    [x + ux * 2.2, 0, z + uz * 2.2],
    [-amp, BOARD.y + BOARD.h / 2, BOARD.z],
    [amp, BOARD.y + BOARD.h / 2, BOARD.z],
    [-amp, RIM.y, RIM.r],
    [amp, RIM.y, RIM.r],
  ];
  const fits = (d: number) => {
    scratchCam.position.set(tx + cx * d, targetY + cy * d, tz + cz * d);
    scratchCam.lookAt(tx, targetY, tz);
    scratchCam.updateMatrixWorld();
    for (const [px, py, pz] of pts) {
      scratchV.set(px, py, pz).project(scratchCam);
      if (scratchV.x < box.l || scratchV.x > box.r || scratchV.y < box.b || scratchV.y > box.t || scratchV.z > 1) return false;
    }
    return true;
  };
  let lo = 5;
  let hi = 300;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return { theta, targetR, targetY, phi, dist: hi, elev };
}

const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function CameraRig({ getState, localId }: { getState: () => HoopState | null; localId: string }) {
  const { camera } = useThree();
  const cur = useRef<Pose | null>(null);
  const fit = useRef({ key: '', pose: cameraPose(0, 20, 1.6) });
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useFrame((_, rawDt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = cam.aspect;
    const fov = fovFor(aspect);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const s = live(getState);
    const me = s?.players.find((p) => p.id === localId) ?? s?.players[0];
    const sp = s && me ? s.spots[me.spot] : { x: 0, z: 20 };
    const key = `${sp.x.toFixed(2)},${sp.z.toFixed(2)},${aspect.toFixed(3)}`;
    if (fit.current.key !== key) fit.current = { key, pose: cameraPose(sp.x, sp.z, aspect) };
    const want = fit.current.pose;
    if (!cur.current) cur.current = { ...want };
    const c = cur.current;
    // Swing round the hoop to a new spot (every part eased in polar terms): an orbit, never a
    // straight line through the toy.
    const k = reduced.current ? 1 : 1 - Math.exp(-Math.min(0.1, rawDt) * 3.2);
    c.theta += angleTo(c.theta, want.theta) * k;
    c.phi += angleTo(c.phi, want.phi) * k;
    c.targetR += (want.targetR - c.targetR) * k;
    c.targetY += (want.targetY - c.targetY) * k;
    c.dist += (want.dist - c.dist) * k;
    c.elev += (want.elev - c.elev) * k;
    const tx = Math.sin(c.theta) * c.targetR;
    const tz = Math.cos(c.theta) * c.targetR;
    camera.position.set(tx + Math.sin(c.phi) * Math.cos(c.elev) * c.dist, c.targetY + Math.sin(c.elev) * c.dist, tz + Math.cos(c.phi) * Math.cos(c.elev) * c.dist);
    camera.lookAt(tx, c.targetY, tz);
    // The joystick aims relative to the screen: tell the input which way the camera looks.
    setHoopViewYaw(Math.atan2(tx - camera.position.x, tz - camera.position.z));
  });
  return null;
}

// ---------------------------------------------------------------- sounds
function useSounds(localId: string) {
  useEffect(
    () =>
      matchBus.on('event', (e) => {
        const mine = e.id === localId;
        const near = mine ? 1 : 0.55;
        switch (e.type) {
          case 'hh-throw':
            playHubCue('throw', 0.8 * near);
            break;
          case 'hh-charge':
            if (mine) playHoopCue('charge', 0.7);
            break;
          case 'hh-cancel':
            if (mine) playHoopCue('uncharge', 0.7);
            break;
          case 'hh-swish':
            playHubCue('swish', mine ? 1 : 0.6);
            break;
          case 'hh-score':
            if (mine && e.gold) playHoopCue('gold', 0.8);
            break;
          case 'hh-rim':
            playHubCue('rim', Math.min(1, (e.v as number) / 30) * 0.8);
            break;
          case 'hh-board':
            playHubCue('board', Math.min(1, (e.v as number) / 30) * 0.8);
            break;
          case 'hh-bounce':
            playHubCue('bounce', Math.min(1, (e.v as number) / 40) * 0.5);
            break;
          case 'hh-move':
            if (mine) sfx.jump();
            break;
          case 'hh-slide-warn':
            playHoopCue('windup');
            break;
          case 'hh-gold':
            playHoopCue('gold');
            break;
          case 'hh-buzzer':
            playHoopCue('buzzer');
            break;
        }
      }),
    [localId],
  );
}

// ---------------------------------------------------------------- the scene
export function HoopScene({ getState: rawGet, contestants, localId }: MinigameSceneProps<HoopState>) {
  const getState = rawGet as () => HoopState | null;
  const { camera, gl } = useThree();
  const court = useMemo(courtGeometry, []);
  const geos = useMemo(() => ({ ball: ballGeometry(P.ballOrange, P.ink), gold: ballGeometry(P.honey, P.brass) }), []);
  const mats = useMemo(
    () => ({
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
      decal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      net: new THREE.MeshStandardMaterial({ color: P.white, map: netTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
      ball: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(court)) g?.dispose();
      geos.ball.dispose();
      geos.gold.dispose();
      for (const m of Object.values(mats)) m.dispose();
    },
    [court, geos, mats],
  );
  useSounds(localId);

  // Mouse: point to aim, hold the left button to charge. Touch uses the joystick and Throw button.
  useEffect(() => {
    resetHoopLocal();
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let held = false;
    const active = () => {
      const m = useMatch.getState();
      return m.phase === 'playing' && !m.paused;
    };
    const point = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !active()) return;
      const s = live(getState);
      const me = s?.players.find((p) => p.id === localId);
      if (!s || !me) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, 1 - ((e.clientY - rect.top) / rect.height) * 2);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) return;
      const sp = s.spots[me.spot];
      if (Math.hypot(hit.x - sp.x, hit.z - sp.z) < 1) return;
      setHoopMouseYaw(Math.atan2(hit.x - sp.x, hit.z - sp.z));
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !active()) return;
      unlockAudio();
      point(e);
      held = true;
      pressVirtual('slot1');
    };
    const up = () => {
      if (!held) return;
      held = false;
      releaseVirtual('slot1');
    };
    const blur = () => {
      up();
      cancelHoopCharge();
    };
    const off = useMatch.subscribe((m, prev) => {
      if ((m.paused && !prev.paused) || (m.phase !== 'playing' && prev.phase === 'playing')) blur();
    });
    const old = gl.domElement.style.touchAction;
    gl.domElement.style.touchAction = 'none';
    gl.domElement.addEventListener('pointermove', point);
    gl.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', blur);
    return () => {
      off();
      up();
      gl.domElement.style.touchAction = old;
      gl.domElement.removeEventListener('pointermove', point);
      gl.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', blur);
      resetHoopLocal();
    };
  }, [camera, gl, getState, localId]);

  useEffect(() => {
    exposeDebug({
      hoop: {
        /** Screen position of a court point (e2e tests). */
        point: (x: number, y: number, z: number) => {
          const p = new THREE.Vector3(x, y, z).project(camera);
          const r = gl.domElement.getBoundingClientRect();
          return { x: r.left + ((p.x + 1) * r.width) / 2, y: r.top + ((1 - p.y) * r.height) / 2 };
        },
        aim: () => localAim(),
        /** The perfect power for your throw right now (null: none). */
        perfect: () => {
          const s = live(getState);
          const me = s?.players.find((p) => p.id === localId);
          return s && me ? assistedThrow(s, s.spots[me.spot], localAim() ?? me.yaw, 0, s.t).perfect : null;
        },
        /** Stage a held charge of `power` for pictures (null lets go without throwing). */
        charge: (power: number | null) => {
          const s = live(getState);
          if (!s) return;
          if (power === null) {
            stageHoopCharge(s, null);
            releaseVirtual('slot1');
          } else {
            pressVirtual('slot1');
            stageHoopCharge(s, power);
          }
        },
      },
    });
  }, [camera, gl, getState, localId]);

  return (
    // Lifted a hair off the stage's own table top, so the court never fights it for depth.
    <group name="hoophustle" position={[0, 0.06, 0]}>
      <CameraRig getState={getState} localId={localId} />
      <mesh geometry={court.solid} material={mats.solid} receiveShadow name="hoophustle:court" />
      <mesh geometry={court.decal} material={mats.decal} receiveShadow name="hoophustle:lines" />
      <Hoop getState={getState} materials={mats} />
      {contestants.map((c) => (
        <Shooter key={c.id} c={c} getState={getState} ballGeo={geos.ball} goldGeo={geos.gold} ballMat={mats.ball} />
      ))}
      <Balls getState={getState} ballGeo={geos.ball} goldGeo={geos.gold} ballMat={mats.ball} />
      <AimAndArc getState={getState} localId={localId} />
    </group>
  );
}
