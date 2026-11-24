/**
 * Hoop Clash, drawn: a code-built toy court on the table (painted maple, white lines, a 3-point arc
 * and a key at each end, two hoops on stanchions behind the baselines), wooden bleachers with an
 * instanced crowd along the far side, the toys in their team jerseys, the Hub's basketball, the
 * shot's arc preview (gold when it will drop) and a burst of confetti for every basket.
 *
 * The court, the hoops and the bleachers are merged with the toy Kit (a few draw calls); the crowd
 * is two instanced meshes; nothing here is React state per frame. A broadcast camera on the near
 * sideline follows the play, framing your toy and the ball.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE, PAINT_JOBS } from '../../game/palette';
import { playHoopCue, playHubCue, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { useGame } from '../../game/store';
import { player } from '../../game/player';
import { WindupBot } from '../../character/WindupBot';
import { createToyAnim } from '../../character/anim';
import { MiniContender, createMiniAnim } from '../../character/MiniContender';
import type { JerseyLook } from '../../character/Jersey';
import { Kit } from '../../scene/kit';
import { ballGeometry, hoopNetGeometry, netTexture } from '../../scene/HubPlay';
import { DRIBBLE_SPEED } from '../../game/hubPlaySim';
import { BALL_R, BOARD, RIM, heldAt, predictCourtThrow } from '../shared/courtBall';
import { YouMarker } from '../shared/YouMarker';
import { matchBus, useMatch } from '../session';
import type { Contestant, MinigameSceneProps } from '../types';
import { COURT, COURT_SPEC, HOOPS, POST, STANDS, postOf } from './court';
import { attackHoop, shotPreview, solveShotFor, type HoopPlayer, type HoopState } from './rules';
import { clearHoopInput, mouseAct, mousePass } from './local';

export const TEAM_COLOURS = [PALETTE.teamRed, PALETTE.teamBlue] as const;

// ---------------------------------------------------------------- the court (static, merged)
const LINE = COURT.line;
const FLOOR_Y = 0.02;
const PAINT_Y = 0.035;
const LINE_Y = 0.05;

function courtGeometry(crowdRows: number) {
  const k = new Kit();
  const paint = new Kit();
  const L = COURT.halfL;
  const W = COURT.halfW;
  // The floor: maple inside the lines, a darker apron round it, under everything the stands' deck.
  k.box((STANDS.maxX + 1) * 2, 0.4, (STANDS.maxZ + 1) * 2, 0, -0.2 + FLOOR_Y - 0.01, 0, PALETTE.woodMid);
  paint.add(new THREE.PlaneGeometry(L * 2 + 1.2, W * 2 + 1.2), PALETTE.woodLight, 0, FLOOR_Y + 0.001, 0, { rx: -Math.PI / 2 });
  // The keys and the centre circle, painted.
  for (const s of [-1, 1]) {
    paint.add(new THREE.PlaneGeometry(COURT.keyLen, COURT.keyHalfW * 2), PALETTE.sage, s * (L - COURT.keyLen / 2), PAINT_Y, 0, { rx: -Math.PI / 2 });
  }
  paint.disc(COURT.centreR, 0, PAINT_Y, 0, PALETTE.honey, { rx: -Math.PI / 2 }, 32);
  // White lines.
  const strip = (w: number, d: number, x: number, z: number) => paint.add(new THREE.PlaneGeometry(w, d), PALETTE.white, x, LINE_Y, z, { rx: -Math.PI / 2 });
  strip(L * 2 + LINE, LINE, 0, -W);
  strip(L * 2 + LINE, LINE, 0, W);
  strip(LINE, W * 2, -L, 0);
  strip(LINE, W * 2, L, 0);
  strip(LINE, W * 2, 0, 0);
  paint.add(new THREE.RingGeometry(COURT.centreR - LINE, COURT.centreR, 40), PALETTE.white, 0, LINE_Y, 0, { rx: -Math.PI / 2 });
  for (const h of HOOPS) {
    const s = h.x > 0 ? 1 : -1;
    // The key's outline and the free-throw circle.
    const ftX = s * (L - COURT.keyLen);
    strip(LINE, COURT.keyHalfW * 2, ftX, 0);
    strip(COURT.keyLen, LINE, s * (L - COURT.keyLen / 2), -COURT.keyHalfW);
    strip(COURT.keyLen, LINE, s * (L - COURT.keyLen / 2), COURT.keyHalfW);
    paint.add(new THREE.RingGeometry(COURT.keyHalfW - LINE, COURT.keyHalfW, 28, 1, s > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), PALETTE.white, ftX, LINE_Y, 0, { rx: -Math.PI / 2 });
    // The 3-point arc, clipped where it meets the baseline.
    const reach = Math.acos(-COURT.rimIn / COURT.three);
    const start = s < 0 ? -reach : Math.PI - reach;
    paint.add(new THREE.RingGeometry(COURT.three - LINE / 2, COURT.three + LINE / 2, 56, 1, start, reach * 2), PALETTE.white, h.x, LINE_Y, h.z, { rx: -Math.PI / 2 });
    // The hoop: a padded stanchion behind the baseline, an arm over to the board, the board with
    // its target square, a bracket and the rim.
    const p = postOf(h);
    k.block(2.2, 1.2, 2.6, p.x + s * 0.5, 0.6, p.z, PALETTE.inkPurple, {}, 0.25);
    k.cyl(POST.r * 0.8, POST.r, BOARD.y + 0.6, p.x, (BOARD.y + 0.6) / 2, p.z, PALETTE.inkPurple, 12);
    const boardX = h.x - h.dx * BOARD.back;
    const armLen = Math.abs(p.x - boardX) - BOARD.t / 2;
    k.box(armLen, 0.45, 0.5, (p.x + boardX) / 2 + s * (BOARD.t / 4), BOARD.y + 0.2, 0, PALETTE.inkPurple);
    k.box(BOARD.t, BOARD.h, BOARD.w, boardX, BOARD.y, 0, PALETTE.white);
    k.add(new THREE.RingGeometry(0.95, 1.2, 4, 1, Math.PI / 4), PALETTE.coral, boardX + h.dx * (BOARD.t / 2 + 0.01), RIM.y + 1.2, 0, { ry: h.dx > 0 ? Math.PI / 2 : -Math.PI / 2 });
    const bracket = BOARD.back - RIM.r - BOARD.t / 2;
    k.box(bracket, 0.18, 0.5, boardX + h.dx * (BOARD.t / 2 + bracket / 2), RIM.y, 0, PALETTE.coral);
    k.torus(RIM.r, RIM.tube, h.x, RIM.y, h.z, PALETTE.coral, { rx: Math.PI / 2 }, Math.PI * 2, 24);
  }
  // Bleachers along the far sideline: three wooden steps, and a low bench at each corner.
  const benchZ = -(W + 3.6);
  for (let r = 0; r < crowdRows; r++) {
    k.box(L * 1.6, 0.9 + r * 1.3, 2.4, 0, (0.9 + r * 1.3) / 2, benchZ - r * 2.4, r % 2 ? PALETTE.woodMid : PALETTE.woodDark);
  }
  for (const s of [-1, 1]) {
    k.box(9, 0.9, 1.6, s * (L - 8), 0.45, W + 3.4, PALETTE.woodDark);
    k.box(9, 0.25, 1.9, s * (L - 8), 1.0, W + 3.4, s < 0 ? PALETTE.teamRed : PALETTE.teamBlue);
  }
  return { solid: k.build().solid!, paint: paint.build().solid! };
}

// ---------------------------------------------------------------- the crowd (instanced)
const CROWD_COLOURS = [PALETTE.coral, PALETTE.honey, PALETTE.toyBlue, PALETTE.sage, PALETTE.cream, PALETTE.inkPurple, PALETTE.woodLight, PALETTE.white];

function Crowd({ rows }: { rows: number }) {
  const low = useGame((s) => s.quality === 'low');
  const perRow = low ? 9 : 15;
  const n = rows * perRow;
  const bodies = useRef<THREE.InstancedMesh>(null!);
  const heads = useRef<THREE.InstancedMesh>(null!);
  const seats = useMemo(() => {
    const out: { x: number; y: number; z: number; ph: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < perRow; i++) {
        const x = (i / (perRow - 1) - 0.5) * COURT.halfL * 1.45 + ((r * 7 + i * 3) % 5) * 0.3;
        out.push({ x, y: 0.9 + r * 1.3, z: -(COURT.halfW + 3.6) - r * 2.4, ph: (i * 1.7 + r * 2.3) % 6.28 });
      }
    }
    return out;
  }, [rows, perRow]);
  const cheer = useRef({ at: -1e9, team: 0 });
  useEffect(() => matchBus.on('event', (e) => {
    if (e.type === 'score' || e.type === 'final') cheer.current = { at: performance.now(), team: (e.team as number) ?? 0 };
  }), []);
  useEffect(() => {
    const c = new THREE.Color();
    seats.forEach((_, i) => {
      bodies.current.setColorAt(i, c.set(CROWD_COLOURS[(i * 5 + 3) % CROWD_COLOURS.length]));
      heads.current.setColorAt(i, c.set(CROWD_COLOURS[(i * 3 + 1) % CROWD_COLOURS.length]));
    });
    if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true;
    if (heads.current.instanceColor) heads.current.instanceColor.needsUpdate = true;
  }, [seats]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const since = (performance.now() - cheer.current.at) / 1000;
    const loud = since < 2.2 ? 1 - since / 2.2 : 0;
    seats.forEach((p, i) => {
      const hop = Math.abs(Math.sin(t * 2 + p.ph)) * 0.08 + loud * Math.abs(Math.sin(t * 11 + p.ph)) * 0.9;
      m.makeTranslation(p.x, p.y + 0.55 + hop, p.z);
      bodies.current.setMatrixAt(i, m);
      m.makeTranslation(p.x, p.y + 1.45 + hop, p.z);
      heads.current.setMatrixAt(i, m);
    });
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="hoopclash:crowd">
      <instancedMesh ref={bodies} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[1.1, 1.1, 0.9]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[0.8, 0.65, 0.7]} />
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

// ---------------------------------------------------------------- the toys
interface RosterEntry {
  id: string;
  team: 0 | 1;
  num: number;
  local: boolean;
  c: Pick<Contestant, 'paint' | 'hat' | 'keySkin' | 'accessories'>;
}

/** Where each toy is drawn (smoothed towards the state), for the ball and the camera. */
const drawn = new Map<string, { x: number; y: number; z: number; yaw: number; speed: number; init: boolean }>();

function Toy({ e, getState }: { e: RosterEntry; getState: () => HoopState | null }) {
  const root = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const full = useRef(createToyAnim());
  const mini = useRef(createMiniAnim());
  const last = useRef({ swipe: 0, shot: 0 });
  const jersey = useMemo<JerseyLook>(() => ({ color: TEAM_COLOURS[e.team], number: e.num }), [e.team, e.num]);
  useEffect(() => {
    drawn.set(e.id, { x: 0, y: 0, z: 0, yaw: 0, speed: 0, init: false });
    return () => void drawn.delete(e.id);
  }, [e.id]);
  // Before the ball, the camera and the arc (default priority), which read where the toy is drawn.
  useFrame((_, rawDt) => {
    const s = getState();
    const p = s?.players.find((q) => q.id === e.id);
    root.current.visible = !!p;
    const d = drawn.get(e.id);
    if (!p || !s || !d) return;
    const dt = Math.min(rawDt, 1 / 20);
    // Smooth towards the state (online it arrives at snapshot rate); a jump (an inbound) cuts.
    const far = Math.hypot(p.x - d.x, p.z - d.z) > 6;
    const k = !d.init || far ? 1 : 1 - Math.exp(-dt * 22);
    const px = d.x;
    const pz = d.z;
    d.x += (p.x - d.x) * k;
    d.z += (p.z - d.z) * k;
    d.y += (p.y - d.y) * (d.init ? 1 - Math.exp(-dt * 30) : 1);
    const dy = Math.atan2(Math.sin(p.yaw - d.yaw), Math.cos(p.yaw - d.yaw));
    d.yaw += dy * (d.init ? 1 - Math.exp(-dt * 18) : 1);
    d.speed = d.init && !far ? Math.hypot(d.x - px, d.z - pz) / Math.max(dt, 1e-3) : 0;
    d.init = true;
    root.current.position.set(d.x, d.y, d.z);
    root.current.rotation.y = d.yaw;
    const a = full.current;
    a.speed = d.speed;
    a.maxSpeed = 14;
    a.stepPhase += d.speed * dt * 0.9;
    a.grounded = p.grounded;
    a.vy = p.vy;
    a.turnRate = dy / Math.max(dt, 1e-3) / 10;
    // A swipe or a shot: a little hop (the full toy's interact bob, the mini's hop).
    if (p.swipeT > 0 && last.current.swipe <= 0) {
      a.interactT = 0;
      mini.current.hopT = 0;
    }
    last.current.swipe = p.swipeT;
    if (a.interactT >= 0) a.interactT = a.interactT + dt > 0.75 ? -1 : a.interactT + dt;
    const winner = s.phase === 'final' || s.phase === 'over' ? s.winner : null;
    if (winner === p.team && mini.current.cheerT < 0) mini.current.cheerT = 0;
    if (winner !== p.team) mini.current.cheerT = -1;
    // The floor ring: team colour; brighter and bigger under the ball handler.
    const hold = s.ball.holder === p.id;
    ring.current.scale.setScalar(hold ? 1.25 : 1);
  }, -1);
  return (
    <group ref={root} name={`hoopclash:toy-${e.id}`}>
      {e.local ? (
        <WindupBot anim={full} paint={e.c.paint} hat={e.c.hat} keySkin={e.c.keySkin} accessories={e.c.accessories} jersey={jersey} />
      ) : (
        <MiniContender anim={mini} paint={e.c.paint} jersey={jersey} />
      )}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[1.05, 1.35, 24]} />
        <meshBasicMaterial color={e.local ? PALETTE.honey : TEAM_COLOURS[e.team]} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {e.local && <YouMarker />}
    </group>
  );
}

// ---------------------------------------------------------------- the ball
/** The dribble as drawn: bounces per second at a walk (more with speed), hand height. The Hub's. */
const DRIBBLE = { hz: 1.9, perSpeed: 0.06, hand: 2.1, fwd: 1.05, side: 0.5 };

function Ball({ getState, material, localId }: { getState: () => HoopState | null; material: THREE.Material; localId: string }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const geo = useMemo(ballGeometry, []);
  const v = useRef({ x: 0, y: BALL_R, z: 0, init: false, drib: { id: null as string | null, phase: 0, k: 0 } });
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, rawDt) => {
    const s = getState();
    if (!s) return;
    const dt = Math.min(rawDt, 1 / 20);
    const b = s.ball;
    const vv = v.current;
    const px = vv.x;
    const pz = vv.z;
    const holder = b.holder ? drawn.get(b.holder) : null;
    const hp = b.holder ? s.players.find((p) => p.id === b.holder) : null;
    if (holder && hp) {
      const h = heldAt({ id: hp.id, x: holder.x, y: holder.y, z: holder.z, yaw: holder.yaw });
      Object.assign(vv, h);
      // On the move with it: the Hub's dribble, drawn only (the rules keep it at the hands).
      const d = vv.drib;
      if (d.id !== hp.id) Object.assign(d, { id: hp.id, phase: 0, k: 0 });
      const moving = hp.grounded && holder.speed >= DRIBBLE_SPEED && hp.charge < 0 && s.phase === 'live';
      d.k += ((moving ? 1 : 0) - d.k) * Math.min(1, dt * 9);
      if (d.k > 0.01) {
        const before = d.phase;
        if (moving || d.phase % 1 > 0.02) d.phase += dt * (DRIBBLE.hz + Math.min(holder.speed, 20) * DRIBBLE.perSpeed);
        if (Math.floor(d.phase - 0.5) > Math.floor(before - 0.5)) playHubCue('bounce', hp.id === localId ? 0.3 : 0.14);
        const u = d.phase % 1;
        const x = Math.abs(2 * u - 1);
        const fx = Math.sin(holder.yaw);
        const fz = Math.cos(holder.yaw);
        const tx = holder.x + fx * DRIBBLE.fwd - fz * DRIBBLE.side;
        const tz = holder.z + fz * DRIBBLE.fwd + fx * DRIBBLE.side;
        const ty = holder.y + BALL_R + (DRIBBLE.hand - BALL_R) * (1 - (1 - x) * (1 - x));
        vv.x += (tx - vv.x) * d.k;
        vv.y += (ty - vv.y) * d.k;
        vv.z += (tz - vv.z) * d.k;
      }
    } else {
      vv.drib.id = null;
      const far = Math.hypot(b.x - vv.x, b.y - vv.y, b.z - vv.z) > 8;
      const k = !vv.init || far ? 1 : 1 - Math.exp(-dt * 30);
      vv.x += (b.x - vv.x) * k;
      vv.y += (b.y - vv.y) * k;
      vv.z += (b.z - vv.z) * k;
    }
    vv.init = true;
    const moved = Math.hypot(vv.x - px, vv.z - pz);
    if (!b.holder && moved > 1e-4 && moved < 5) {
      axis.set(vv.z - pz, 0, -(vv.x - px)).normalize();
      q.setFromAxisAngle(axis, moved / BALL_R);
      mesh.current.quaternion.premultiply(q);
    }
    mesh.current.position.set(vv.x, Math.max(BALL_R, vv.y), vv.z);
    ballAt.x = vv.x;
    ballAt.y = vv.y;
    ballAt.z = vv.z;
  });
  return <mesh ref={mesh} geometry={geo} material={material} castShadow name="hoopclash:ball" />;
}
const ballAt = { x: 0, y: BALL_R, z: 0 };

// ---------------------------------------------------------------- nets, arc, confetti
function Nets({ material }: { material: THREE.Material }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const geo = useMemo(hoopNetGeometry, []);
  const at = useRef([-1e9, -1e9]);
  useEffect(() => matchBus.on('event', (e) => {
    if (e.type === 'score') at.current[e.hoop as number] = performance.now();
  }), []);
  useFrame(() => {
    HOOPS.forEach((_, i) => {
      const g = refs.current[i];
      if (!g) return;
      const k = Math.max(0, 1 - (performance.now() - at.current[i]) / 450);
      g.scale.set(1 - k * 0.15, 1 + Math.sin(k * 9) * k * 0.35, 1 - k * 0.15);
    });
  });
  return (
    <>
      {HOOPS.map((h, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} position={[h.x, RIM.y, h.z]}>
          <mesh geometry={geo} material={material} />
        </group>
      ))}
    </>
  );
}

const ARC_POINTS = 28;
function ShotArc({ getState, localId }: { getState: () => HoopState | null; localId: string }) {
  const inst = useRef<THREE.InstancedMesh>(null!);
  const pts = useMemo(() => new Float32Array(ARC_POINTS * 3), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.85, depthWrite: false }), []);
  const white = useMemo(() => new THREE.Color(PALETTE.white), []);
  const gold = useMemo(() => new THREE.Color(PALETTE.honey), []);
  useFrame(() => {
    const s = getState();
    const pv = s ? shotPreview(s, localId) : null;
    if (!s || !pv) {
      inst.current.count = 0;
      arcState.gold = false;
      return;
    }
    const r = predictCourtThrow(COURT_SPEC, pv.body, pv.yaw, pv.power, pts, ARC_POINTS, 3);
    const me = s.players.find((p) => p.id === localId)!;
    arcState.gold = r.hoop === attackHoop(s, me.team);
    mat.color.copy(arcState.gold ? gold : white);
    for (let i = 0; i < r.n; i++) {
      const sc = i === r.n - 1 ? 1.6 : 1;
      m.makeScale(sc, sc, sc).setPosition(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      inst.current.setMatrixAt(i, m);
    }
    inst.current.count = r.n;
    inst.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, ARC_POINTS]} material={mat} frustumCulled={false} name="hoopclash:arc">
      <sphereGeometry args={[0.2, 8, 6]} />
    </instancedMesh>
  );
}
/** Whether the local shot preview is gold right now (for the HUD's meter and the tests). */
export const arcState = { gold: false };

function Confetti() {
  const low = useGame((s) => s.quality === 'low');
  const n = low ? 24 : 40;
  const inst = useRef<THREE.InstancedMesh>(null!);
  const parts = useMemo(() => Array.from({ length: n }, () => ({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, r: 0, life: 0 })), [n]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const qq = useMemo(() => new THREE.Quaternion(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);
  const live = useRef(0);
  useEffect(() => matchBus.on('event', (ev) => {
    if (ev.type !== 'score') return;
    const team = ev.team as number;
    const cols = [new THREE.Color(TEAM_COLOURS[team]), new THREE.Color(PALETTE.honey), new THREE.Color(PALETTE.white)];
    parts.forEach((p, i) => {
      const a = Math.random() * Math.PI * 2;
      Object.assign(p, { x: ev.x as number, y: RIM.y, z: ev.z as number, vx: Math.cos(a) * (4 + Math.random() * 8), vy: 12 + Math.random() * 10, vz: Math.sin(a) * (4 + Math.random() * 8), r: Math.random() * 6, life: 1.3 + Math.random() * 0.6 });
      inst.current.setColorAt(i, cols[i % 3]);
    });
    if (inst.current.instanceColor) inst.current.instanceColor.needsUpdate = true;
    live.current = 2;
  }), [parts]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    if (live.current <= 0) {
      inst.current.visible = false;
      return;
    }
    live.current -= dt;
    inst.current.visible = true;
    parts.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 45 * dt;
        p.x += p.vx * dt;
        p.y = Math.max(0.15, p.y + p.vy * dt);
        p.z += p.vz * dt;
        p.r += dt * 8;
      }
      const sc = p.life > 0 ? Math.min(1, p.life * 2) : 0;
      e.set(p.r, p.r * 0.7, 0);
      qq.setFromEuler(e);
      m.compose(pos.set(p.x, p.y, p.z), qq, scl.set(sc, sc, sc));
      inst.current.setMatrixAt(i, m);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, n]} frustumCulled={false} visible={false}>
      <boxGeometry args={[0.35, 0.05, 0.22]} />
      <meshStandardMaterial roughness={0.8} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------- camera
/** Broadcast framing: height and distance back from the focus, and the field of view. */
const SHOT = {
  landscape: { h: 27, back: 32, fov: 46, look: -2, lead: 0.35 },
  portrait: { h: 31, back: 25, fov: 60, look: -1, lead: 0.25 },
};

function useBroadcastCamera(getState: () => HoopState | null, localId: string) {
  const { camera, size } = useThree();
  const f = useRef({ x: 0, z: 0, init: false });
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const cam = camera as THREE.PerspectiveCamera;
    const portrait = size.width < size.height;
    const shot = portrait ? SHOT.portrait : SHOT.landscape;
    if (Math.abs(cam.fov - shot.fov) > 0.1) {
      cam.fov = shot.fov;
      cam.updateProjectionMatrix();
    }
    const s = getState();
    const me = drawn.get(localId);
    // Follow your toy, leaning towards the ball (a spectator follows the ball).
    let tx = 0;
    let tz = 0;
    if (s) {
      const meIn = me && me.init && s.players.some((p) => p.id === localId);
      tx = meIn ? me!.x + (ballAt.x - me!.x) * shot.lead : ballAt.x;
      tz = meIn ? me!.z + (ballAt.z - me!.z) * shot.lead : ballAt.z;
      if (s.phase === 'jump' || s.phase === 'half') tx = tz = 0;
    }
    // Lean towards the nearer end, so the hoop stays in the picture near either basket.
    tx *= 1.25;
    const maxX = portrait ? COURT.halfL - 4 : COURT.halfL - 8;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    tz = Math.max(-COURT.halfW * 0.5, Math.min(COURT.halfW * 0.4, tz * 0.5));
    const k = f.current.init ? 1 - Math.exp(-dt * 3.2) : 1;
    f.current.x += (tx - f.current.x) * k;
    f.current.z += (tz - f.current.z) * k;
    f.current.init = true;
    camera.position.set(f.current.x, shot.h, f.current.z + shot.back);
    camera.lookAt(f.current.x, 1.5, f.current.z + shot.look);
    // The shadow frustum and the audio listener sit with the play.
    player.pos.set(f.current.x, 0, f.current.z);
  });
}

// ---------------------------------------------------------------- sounds
function useSounds(localId: string) {
  useEffect(
    () =>
      matchBus.on('event', (e) => {
        switch (e.type) {
          case 'shot':
            playHubCue('throw', e.by === localId ? 0.9 : 0.6);
            break;
          case 'uncharge':
            if (e.by === localId) playHoopCue('uncharge', 0.7);
            break;
          case 'pass':
            playHubCue('throw', 0.45);
            break;
          case 'rim':
            playHubCue('rim', Math.min(1, (e.v as number) / 30));
            break;
          case 'board':
            playHubCue('board', Math.min(1, (e.v as number) / 30));
            break;
          case 'bounce':
            playHubCue('bounce', Math.min(1, (e.v as number) / 40));
            break;
          case 'wall':
            playHubCue('clack', Math.min(1, (e.v as number) / 30));
            break;
          case 'score':
            playHubCue('swish', 1);
            if (e.pts === 3) window.setTimeout(() => playHubCue('goal', 0.6), 180);
            break;
          case 'catch':
          case 'grab':
          case 'snatch':
          case 'steal':
          case 'intercept':
          case 'block':
            playHubCue('grab', e.by === localId ? 1 : 0.6);
            break;
          case 'whistle':
            playHubCue('whistle', 0.8);
            break;
          case 'buzzer':
            playHubCue('buzzer', 0.9);
            break;
          case 'final':
            window.setTimeout(() => playHubCue('goal', 0.9), 300);
            break;
        }
      }),
    [localId],
  );
}

// ---------------------------------------------------------------- the scene
export function HoopScene({ getState: rawState, contestants, localId }: MinigameSceneProps<HoopState>) {
  // The host can still hold another trial's state while this one's intro card is up.
  const getState = useCallback(() => {
    const s = rawState() as HoopState | null;
    return s && s.kind === 'hoop-clash' ? s : null;
  }, [rawState]);
  const low = useGame((s) => s.quality === 'low');
  const rows = low ? 2 : 3;
  const geos = useMemo(() => courtGeometry(rows), [rows]);
  const mats = useMemo(
    () => ({
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
      paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
      net: new THREE.MeshStandardMaterial({ vertexColors: true, map: netTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    }),
    [],
  );
  useEffect(() => () => {
    geos.solid.dispose();
    geos.paint.dispose();
  }, [geos]);

  // The roster changes only when a match starts: React state set then, never per frame.
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const rosterKey = useRef('');
  useFrame(() => {
    const s = getState();
    // Not the seed: online it is hidden (always 0), so a rematch with reshuffled teams kept old jerseys.
    const key = s ? s.players.map((p) => `${p.id}:${p.team}:${p.num}`).join(',') : '';
    if (key === rosterKey.current) return;
    rosterKey.current = key;
    setRoster(
      (s?.players ?? []).map((p: HoopPlayer) => {
        const c = contestants.find((x) => x.id === p.id);
        const look = c ?? { paint: PAINT_JOBS[p.look?.paint ?? 0], hat: p.look?.hat ?? 'none', keySkin: p.look?.keySkin ?? 'classic' };
        return { id: p.id, team: p.team, num: p.num, local: p.id === localId, c: look };
      }),
    );
  });

  useBroadcastCamera(getState, localId);
  useSounds(localId);

  // The mouse on the court: hold the left button for the action, right click to pass.
  const { gl, camera } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const live = () => useMatch.getState().phase === 'playing' && !useMatch.getState().paused;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !live()) return;
      unlockAudio();
      if (e.button === 0) mouseAct(true);
      if (e.button === 2) mousePass();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button === 0) mouseAct(false);
    };
    const menu = (e: MouseEvent) => e.preventDefault();
    const off = useMatch.subscribe((s) => {
      if (s.paused || s.phase !== 'playing') clearHoopInput();
    });
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    el.addEventListener('contextmenu', menu);
    window.addEventListener('blur', clearHoopInput);
    return () => {
      off();
      clearHoopInput();
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('contextmenu', menu);
      window.removeEventListener('blur', clearHoopInput);
    };
  }, [gl]);

  // ?debug test hooks: screen points, the solved charge for your shot, the arc colour.
  useEffect(() => {
    exposeDebug({
      hoop: {
        point: (x: number, z: number, y = 0.1) => {
          const p = new THREE.Vector3(x, y, z).project(camera);
          const r = gl.domElement.getBoundingClientRect();
          return { x: r.left + ((p.x + 1) * r.width) / 2, y: r.top + ((1 - p.y) * r.height) / 2 };
        },
        /** The power that sinks a shot from where your toy stands (null: out of range). */
        perfect: () => {
          const s = getState();
          const me = s?.players.find((p) => p.id === localId);
          return s && me ? solveShotFor(s, me) : null;
        },
        gold: () => arcState.gold,
      },
    });
  }, [camera, gl, getState, localId]);

  return (
    <group name="hoopclash">
      <mesh geometry={geos.solid} material={mats.solid} castShadow receiveShadow name="hoopclash:court" />
      <mesh geometry={geos.paint} material={mats.paint} receiveShadow name="hoopclash:lines" />
      <Crowd rows={rows} />
      <Nets material={mats.net} />
      {roster.map((e) => (
        <Toy key={e.id} e={e} getState={getState} />
      ))}
      <Ball getState={getState} material={mats.solid} localId={localId} />
      <ShotArc getState={getState} localId={localId} />
      <Confetti />
    </group>
  );
}
