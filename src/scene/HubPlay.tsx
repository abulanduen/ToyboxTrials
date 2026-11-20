/**
 * Hub play objects, drawn: the shared marble, the two football nets, the basketball hoop and its
 * ball, the throw's arc preview and the little celebrations. Code-built in the toy style.
 *
 * Every frame this steps src/hubplay/runtime.ts (offline physics, or the server's state online)
 * and reads its `view`; nothing here is React state per frame. It also turns walking into the
 * marble into pushes, and the held throw button into a charged throw (both through the shared
 * action layer).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import { setDynamic } from '../game/collision';
import { livePositions } from '../game/interactables';
import { player } from '../game/player';
import { getMoveAxis, isDown, stickRunning } from '../game/input';
import { inputBlocked, useGame } from '../game/store';
import { BALL, HOOP, MARBLE, NET, NETS, PITCH_CENTRE, rollFloorAt, type Net } from '../game/hubPlay';
import { BODY_R, PUSH_POWER, predictThrow, type PlayBody } from '../game/hubPlaySim';
import { aimYaw, cancelCharge, chargePower, fxClock, fxQueue, iHold, pushMarble, releaseCharge, selfId, stepHubPlayView, view } from '../hubplay/runtime';
import { meter } from '../hubplay/store';
import { paintMat, woodMat } from './props';

// ---------------------------------------------------------------- a net texture (white mesh on clear)
let netTex: THREE.CanvasTexture | null = null;
function netTexture() {
  if (netTex) return netTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = PALETTE.white;
  g.lineWidth = 5;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  netTex = new THREE.CanvasTexture(c);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.colorSpace = THREE.SRGBColorSpace;
  return netTex;
}

function netMat(repeatX: number, repeatY: number) {
  const t = netTexture().clone();
  t.needsUpdate = true;
  t.repeat.set(repeatX, repeatY);
  return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.9 });
}

// ---------------------------------------------------------------- the marble
function Marble() {
  const mesh = useRef<THREE.Mesh>(null!);
  const last = useRef({ x: view.marble.x, z: view.marble.z });
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => setDynamic('marble', []), []);
  useFrame(() => {
    const m = view.marble;
    const dx = m.x - last.current.x;
    const dz = m.z - last.current.z;
    const moved = Math.hypot(dx, dz);
    if (moved > 1e-4 && moved < 5) {
      axis.set(dz, 0, -dx).normalize();
      q.setFromAxisAngle(axis, moved / MARBLE.r);
      mesh.current.quaternion.premultiply(q);
    }
    last.current.x = m.x;
    last.current.z = m.z;
    mesh.current.position.set(m.x, m.y, m.z);
    // the local toy walks into it (and pushes it) rather than through it
    livePositions.set('marble', m);
    setDynamic('marble', [{ kind: 'circle', id: 'marble:0', x: m.x, z: m.z, r: MARBLE.r, top: m.y + MARBLE.r }]);
  });
  return (
    <mesh ref={mesh} castShadow name="hubplay:marble">
      <sphereGeometry args={[MARBLE.r, 28, 20]} />
      <meshPhysicalMaterial color="#9FD0E6" roughness={0.2} clearcoat={0.6} clearcoatRoughness={0.3} transparent opacity={0.85} />
      {/* inner swirl */}
      <mesh rotation={[0.4, 0, 0.8]}>
        <torusGeometry args={[0.7, 0.16, 6, 20, Math.PI * 1.3]} />
        <meshStandardMaterial color={PALETTE.honey} emissive={PALETTE.honey} emissiveIntensity={0.25} />
      </mesh>
    </mesh>
  );
}

// ---------------------------------------------------------------- the basketball
function Ball() {
  const g = useRef<THREE.Group>(null!);
  const last = useRef({ x: view.ball.x, z: view.ball.z });
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  const seam = useMemo(() => paintMat(PALETTE.ink, 0.7), []);
  useFrame(() => {
    const b = view.ball;
    const dx = b.x - last.current.x;
    const dz = b.z - last.current.z;
    const moved = Math.hypot(dx, dz);
    if (!b.held && moved > 1e-4 && moved < 5) {
      axis.set(dz, 0, -dx).normalize();
      q.setFromAxisAngle(axis, moved / BALL.r);
      g.current.quaternion.premultiply(q);
    }
    last.current.x = b.x;
    last.current.z = b.z;
    g.current.position.set(b.x, b.y, b.z);
    livePositions.set('ball', b);
    livePositions.set('ball-throw', player.pos);
  });
  return (
    <group ref={g} name="hubplay:ball">
      <mesh castShadow material={paintMat('#E8893F', 0.75)}>
        <sphereGeometry args={[BALL.r, 20, 14]} />
      </mesh>
      {/* the seams: one round the middle, two crossing over the top */}
      <mesh material={seam} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[BALL.r * 1.005, 0.045, 4, 28]} />
      </mesh>
      <mesh material={seam}>
        <torusGeometry args={[BALL.r * 1.005, 0.045, 4, 28]} />
      </mesh>
      <mesh material={seam} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[BALL.r * 1.005, 0.045, 4, 28]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- the nets
function FootballNet({ n, color }: { n: Net; color: string }) {
  const wobble = useRef<THREE.Group>(null!);
  const depth = Math.abs(n.backX - n.mouthX);
  const half = NET.width / 2 + NET.post;
  const post = useMemo(() => paintMat(PALETTE.white, 0.45), []);
  const band = useMemo(() => paintMat(color, 0.5), [color]);
  const back = useMemo(() => netMat(NET.width / 1.2, NET.h / 1.2), []);
  const side = useMemo(() => netMat(depth / 1.2, NET.h / 1.2), [depth]);
  const top = useMemo(() => netMat(NET.width / 1.2, depth / 1.2), [depth]);
  useFrame(() => {
    const k = Math.max(0, 1 - (performance.now() - fxClock.goalAt[n.id]) / 850);
    wobble.current.scale.set(1 + Math.sin(k * 30) * k * 0.12, 1, 1);
  });
  // group in the net's frame: +x points into the pitch (out of the mouth)
  return (
    <group position={[n.mouthX, 0, n.z]} rotation={[0, n.dir === 1 ? 0 : Math.PI, 0]} name={`hubplay:net-${n.id}`}>
      {/* posts and crossbar, with a team-coloured band */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[0, NET.h / 2, s * half]} castShadow material={post}>
            <cylinderGeometry args={[NET.post, NET.post, NET.h, 10]} />
          </mesh>
          <mesh position={[0, NET.h * 0.55, s * half]} material={band}>
            <cylinderGeometry args={[NET.post + 0.03, NET.post + 0.03, 0.6, 10]} />
          </mesh>
          {/* the back corner posts and the bar along the top of each side net */}
          <mesh position={[-depth, (NET.h - 0.4) / 2, s * half]} material={post}>
            <cylinderGeometry args={[0.16, 0.16, NET.h - 0.4, 6]} />
          </mesh>
          <mesh position={[-depth / 2, NET.h - 0.2, s * half]} rotation={[0, 0, Math.PI / 2 - Math.atan2(0.4, depth)]} material={post}>
            <cylinderGeometry args={[0.12, 0.12, Math.hypot(depth, 0.4), 6]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, NET.h, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow material={post}>
        <cylinderGeometry args={[NET.post, NET.post, half * 2 + NET.post * 2, 10]} />
      </mesh>
      <mesh position={[-depth, NET.h - 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} material={post}>
        <cylinderGeometry args={[0.16, 0.16, half * 2, 6]} />
      </mesh>
      {/* a flag on top of the far post */}
      <mesh position={[0.5, NET.h + 0.9, half]} material={band}>
        <boxGeometry args={[1.1, 0.7, 0.05]} />
      </mesh>
      <mesh position={[0, NET.h + 0.7, half]} material={post}>
        <cylinderGeometry args={[0.06, 0.06, 1.4, 5]} />
      </mesh>
      {/* the net: back, sides and roof, wobbling after a goal */}
      <group ref={wobble} position={[-depth, 0, 0]}>
        <group position={[depth, 0, 0]}>
          <mesh position={[-depth, (NET.h - 0.4) / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={back}>
            <planeGeometry args={[half * 2, NET.h - 0.4]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[-depth / 2, (NET.h - 0.2) / 2, s * half]} material={side}>
              <planeGeometry args={[depth, NET.h - 0.2]} />
            </mesh>
          ))}
          <mesh position={[-depth / 2, NET.h - 0.2, 0]} rotation={[Math.PI / 2 - Math.atan2(0.4, depth), 0, 0]} material={top}>
            <planeGeometry args={[depth, half * 2]} />
          </mesh>
        </group>
      </group>
      {/* goal line, a chalk stripe on the felt */}
      <mesh position={[0.25, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.white, 0.9)}>
        <planeGeometry args={[0.35, half * 2]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- the hoop
function Hoop() {
  const net = useRef<THREE.Group>(null!);
  const pole = useMemo(() => paintMat(PALETTE.toyBlue, 0.5), []);
  const board = useMemo(() => paintMat(PALETTE.white, 0.4), []);
  const rimMat = useMemo(() => paintMat(PALETTE.coral, 0.35, 0.2), []);
  const netM = useMemo(() => netMat(6, 2), []);
  const armLen = HOOP.rim.z - HOOP.board.z - HOOP.rim.r;
  useFrame(() => {
    const k = Math.max(0, 1 - (performance.now() - fxClock.hoopAt) / 450);
    net.current.scale.set(1 - k * 0.15, 1 + Math.sin(k * 9) * k * 0.35, 1 - k * 0.15);
  });
  return (
    <group name="hubplay:hoop">
      {/* weighted base and pole */}
      <mesh position={[HOOP.x, 0.35, HOOP.z]} castShadow receiveShadow material={woodMat(PALETTE.woodMid)}>
        <cylinderGeometry args={[1.3, 1.5, 0.7, 14]} />
      </mesh>
      <mesh position={[HOOP.x, HOOP.pole.top / 2, HOOP.z]} castShadow material={pole}>
        <cylinderGeometry args={[HOOP.pole.r * 0.7, HOOP.pole.r * 0.8, HOOP.pole.top, 10]} />
      </mesh>
      {/* backboard with a target square */}
      <mesh position={[HOOP.x, HOOP.board.y, HOOP.board.z]} castShadow material={board}>
        <boxGeometry args={[HOOP.board.w, HOOP.board.h, HOOP.board.t]} />
      </mesh>
      <mesh position={[HOOP.x, HOOP.rim.y + 1.2, HOOP.board.z + HOOP.board.t / 2 + 0.01]} material={rimMat}>
        <ringGeometry args={[0.95, 1.2, 4, 1, Math.PI / 4]} />
      </mesh>
      {/* rim on a little arm */}
      <mesh position={[HOOP.x, HOOP.rim.y, HOOP.board.z + armLen / 2 + HOOP.board.t / 2]} material={rimMat}>
        <boxGeometry args={[0.5, 0.18, armLen]} />
      </mesh>
      <mesh position={[HOOP.rim.x, HOOP.rim.y, HOOP.rim.z]} rotation={[Math.PI / 2, 0, 0]} castShadow material={rimMat}>
        <torusGeometry args={[HOOP.rim.r, HOOP.rim.tube, 6, 24]} />
      </mesh>
      {/* the net: an open, tapering tube hanging from the rim */}
      <group ref={net} position={[HOOP.rim.x, HOOP.rim.y, HOOP.rim.z]}>
        <mesh position={[0, -0.95, 0]} material={netM}>
          <cylinderGeometry args={[HOOP.rim.r * 0.97, HOOP.rim.r * 0.6, 1.9, 16, 1, true]} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- pitch markings
function PitchMarks() {
  const chalk = useMemo(() => paintMat(PALETTE.white, 0.95), []);
  return (
    <group>
      {/* centre spot and ring */}
      <mesh position={[PITCH_CENTRE.x, 0.12, PITCH_CENTRE.z]} rotation={[-Math.PI / 2, 0, 0]} material={chalk}>
        <circleGeometry args={[0.5, 16]} />
      </mesh>
      <mesh position={[PITCH_CENTRE.x, 0.12, PITCH_CENTRE.z]} rotation={[-Math.PI / 2, 0, 0]} material={chalk}>
        <ringGeometry args={[5.6, 6, 40]} />
      </mesh>
      {/* the ball's spot by the hoop */}
      <mesh position={[BALL.spot.x, 0.12, BALL.spot.z]} rotation={[-Math.PI / 2, 0, 0]} material={chalk}>
        <ringGeometry args={[1.25, 1.5, 24]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- arc preview and celebrations
const ARC_POINTS = 26;
function ThrowArc() {
  const inst = useRef<THREE.InstancedMesh>(null!);
  const pts = useMemo(() => new Float32Array(ARC_POINTS * 3), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.85, depthWrite: false }), []);
  const white = useMemo(() => new THREE.Color(PALETTE.white), []);
  const gold = useMemo(() => new THREE.Color(PALETTE.honey), []);
  useFrame(() => {
    const p = chargePower();
    const g = useGame.getState();
    if (p !== null && (!isDown('interact') || inputBlocked(g))) {
      if (inputBlocked(g)) cancelCharge();
      else releaseCharge();
    }
    const c = chargePower();
    if (meter.wrap) meter.wrap.style.display = c === null ? 'none' : '';
    if (c === null || !iHold()) {
      inst.current.count = 0;
      return;
    }
    if (meter.el) meter.el.style.transform = `scaleX(${c.toFixed(3)})`;
    const yaw = aimYaw();
    const body: PlayBody = { id: selfId(), x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw };
    const r = predictThrow(body, yaw, c, pts, ARC_POINTS, 3);
    mat.color.copy(r.scores ? gold : white);
    for (let i = 0; i < r.n; i++) {
      const s = i === r.n - 1 ? 1.6 : 1;
      m.makeScale(s, s, s).setPosition(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      inst.current.setMatrixAt(i, m);
    }
    inst.current.count = r.n;
    inst.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, ARC_POINTS]} material={mat} frustumCulled={false} name="hubplay:arc">
      <sphereGeometry args={[0.2, 8, 6]} />
    </instancedMesh>
  );
}

const CONFETTI = 40;
function Confetti() {
  const quality = useGame((s) => s.quality);
  const n = quality === 'low' ? 24 : CONFETTI;
  const inst = useRef<THREE.InstancedMesh>(null!);
  const parts = useMemo(() => Array.from({ length: n }, () => ({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, r: 0, life: 0 })), [n]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const qq = useMemo(() => new THREE.Quaternion(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const live = useRef(0);
  useEffect(() => {
    const cols = [PALETTE.coral, PALETTE.honey, PALETTE.toyBlue, PALETTE.sage, PALETTE.white, PALETTE.inkPurple].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) inst.current.setColorAt(i, cols[i % cols.length]);
    if (inst.current.instanceColor) inst.current.instanceColor.needsUpdate = true;
  }, [n]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    while (fxQueue.length) {
      const f = fxQueue.shift()!;
      // a burst: half of the pieces, from the net's mouth or the rim
      let k = 0;
      for (const p of parts) {
        if (p.life > 0 && k < n / 2) continue;
        const a = Math.random() * Math.PI * 2;
        const up = f.kind === 'hoop' ? 14 : 20;
        Object.assign(p, { x: f.x, y: f.y, z: f.z, vx: Math.cos(a) * (4 + Math.random() * 8), vy: up + Math.random() * 10, vz: Math.sin(a) * (4 + Math.random() * 8), r: Math.random() * 6, life: 1.4 + Math.random() * 0.6 });
        if (++k >= n / 2) break;
      }
      live.current = 2;
    }
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
        p.vx *= Math.exp(-1.5 * dt);
        p.vz *= Math.exp(-1.5 * dt);
        p.x += p.vx * dt;
        p.y = Math.max(0.15, p.y + p.vy * dt);
        p.z += p.vz * dt;
        p.r += dt * 8;
      }
      const s = p.life > 0 ? Math.min(1, p.life * 2) : 0;
      e.set(p.r, p.r * 0.7, 0);
      qq.setFromEuler(e);
      pos.set(p.x, p.y, p.z);
      m.compose(pos, qq, one.set(s, s, s));
      inst.current.setMatrixAt(i, m);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={inst} args={[undefined, undefined, n]} frustumCulled={false} visible={false} name="hubplay:confetti">
      <boxGeometry args={[0.35, 0.05, 0.22]} />
      <meshStandardMaterial roughness={0.8} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------- pushing the marble by walking into it
function Pusher() {
  useFrame(() => {
    const g = useGame.getState();
    if (g.screen !== 'playing' || inputBlocked(g) || player.eliminated) return;
    const m = view.marble;
    const dx = m.x - player.pos.x;
    const dz = m.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > MARBLE.r + BODY_R + 0.45 || d < 1e-3 || m.inNet) return;
    if (player.pos.y - rollFloorAt(player.pos.x, player.pos.z) > 1) return;
    const axis = getMoveAxis();
    if (axis.magnitude < 0.3) return;
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    if ((fx * dx + fz * dz) / d < 0.5) return;
    pushMarble(fx, fz, isDown('run') || stickRunning() ? PUSH_POWER + 0.17 : PUSH_POWER);
  });
  return null;
}

/** Steps hub play every frame (before the objects read the view). */
function Driver() {
  useFrame((_, rawDt) => stepHubPlayView(Math.min(rawDt, 0.25)), -1);
  return null;
}

export function HubPlay() {
  return (
    <group name="hubplay">
      <Driver />
      <Marble />
      <Ball />
      {NETS.map((n) => (
        <FootballNet key={n.id} n={n} color={n.scorer === 1 ? PALETTE.coral : PALETTE.toyBlue} />
      ))}
      <Hoop />
      <PitchMarks />
      <ThrowArc />
      <Confetti />
      <Pusher />
    </group>
  );
}
