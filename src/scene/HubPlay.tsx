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
import { Kit } from './kit';

// ---------------------------------------------------------------- a net texture (white mesh on clear)
let netTex: THREE.CanvasTexture | null = null;
function netTexture() {
  if (netTex) return netTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff';
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

// ---------------------------------------------------------------- the static pieces, merged (Kit)
const HALF = NET.width / 2 + NET.post;

/** One net's mesh (back, sides, roof), in the net's own frame: +x out of the mouth, the back at −depth. */
function netGeometry(depth: number) {
  const k = new Kit();
  const cell = 1.2; // cm per square of mesh
  const uv = (w: number, h: number) => [0, 0, w / cell, h / cell] as const;
  k.add(new THREE.PlaneGeometry(HALF * 2, NET.h - 0.4), PALETTE.white, -depth, (NET.h - 0.4) / 2, 0, { ry: Math.PI / 2 }, uv(HALF * 2, NET.h));
  for (const s of [-1, 1]) k.add(new THREE.PlaneGeometry(depth, NET.h - 0.2), PALETTE.white, -depth / 2, (NET.h - 0.2) / 2, s * HALF, {}, uv(depth, NET.h));
  // the roof slopes from the crossbar down to the back bar
  const roof = new THREE.PlaneGeometry(Math.hypot(depth, 0.4), HALF * 2).rotateX(-Math.PI / 2).rotateZ(Math.atan2(0.4, depth));
  k.add(roof, PALETTE.white, -depth / 2, NET.h - 0.2, 0, {}, uv(depth, HALF * 2));
  return k.build().solid!;
}

/** The hoop's net: an open, tapering tube hanging from the rim (its top at the origin). */
function hoopNetGeometry() {
  const k = new Kit();
  k.add(new THREE.CylinderGeometry(HOOP.rim.r * 0.97, HOOP.rim.r * 0.6, 1.9, 16, 1, true), PALETTE.white, 0, -0.95, 0, {}, [0, 0, 6, 2]);
  return k.build().solid!;
}

/** Posts, crossbars, flags and the hoop (one draw), and the chalk marks on the felt (one draw). */
function staticGeometry() {
  const k = new Kit();
  const chalk = new Kit();
  for (const n of NETS) {
    const depth = Math.abs(n.backX - n.mouthX);
    const team = n.scorer === 1 ? PALETTE.coral : PALETTE.toyBlue; // the colour of the team defending it
    k.push(n.mouthX, 0, n.z, n.dir === 1 ? 0 : Math.PI);
    for (const s of [-1, 1]) {
      k.cyl(NET.post, NET.post, NET.h, 0, NET.h / 2, s * HALF, PALETTE.white, 10);
      k.cyl(NET.post + 0.03, NET.post + 0.03, 0.6, 0, NET.h * 0.55, s * HALF, team, 10);
      k.cyl(0.16, 0.16, NET.h - 0.4, -depth, (NET.h - 0.4) / 2, s * HALF, PALETTE.white, 6);
      k.rod([0, NET.h, s * HALF], [-depth, NET.h - 0.4, s * HALF], 0.12, PALETTE.white);
    }
    k.rod([0, NET.h, -HALF - NET.post], [0, NET.h, HALF + NET.post], NET.post, PALETTE.white, 10);
    k.rod([-depth, NET.h - 0.4, -HALF], [-depth, NET.h - 0.4, HALF], 0.16, PALETTE.white);
    // a team flag on the far post
    k.cyl(0.06, 0.06, 1.4, 0, NET.h + 0.7, HALF, PALETTE.white, 5);
    k.box(1.1, 0.7, 0.05, 0.55, NET.h + 1.0, HALF, team);
    k.pop();
    // the goal line
    chalk.push(n.mouthX, 0, n.z, n.dir === 1 ? 0 : Math.PI);
    chalk.add(new THREE.PlaneGeometry(0.35, HALF * 2), PALETTE.white, 0.25, 0.12, 0, { rx: -Math.PI / 2 });
    chalk.pop();
  }
  // the hoop: weighted base, pole, backboard with a target square, an arm and the rim
  k.cyl(1.3, 1.5, 0.7, HOOP.x, 0.35, HOOP.z, PALETTE.woodMid, 14);
  k.cyl(HOOP.pole.r * 0.7, HOOP.pole.r * 0.8, HOOP.pole.top, HOOP.x, HOOP.pole.top / 2, HOOP.z, PALETTE.toyBlue, 10);
  k.box(HOOP.board.w, HOOP.board.h, HOOP.board.t, HOOP.x, HOOP.board.y, HOOP.board.z, PALETTE.white);
  k.add(new THREE.RingGeometry(0.95, 1.2, 4, 1, Math.PI / 4), PALETTE.coral, HOOP.x, HOOP.rim.y + 1.2, HOOP.board.z + HOOP.board.t / 2 + 0.01);
  const armLen = HOOP.rim.z - HOOP.board.z - HOOP.rim.r;
  k.box(0.5, 0.18, armLen, HOOP.x, HOOP.rim.y, HOOP.board.z + armLen / 2 + HOOP.board.t / 2, PALETTE.coral);
  k.torus(HOOP.rim.r, HOOP.rim.tube, HOOP.rim.x, HOOP.rim.y, HOOP.rim.z, PALETTE.coral, { rx: Math.PI / 2 }, Math.PI * 2, 24);
  // chalk: the centre spot and ring, the ball's spot
  chalk.disc(0.5, PITCH_CENTRE.x, 0.12, PITCH_CENTRE.z, PALETTE.white, { rx: -Math.PI / 2 }, 16);
  chalk.add(new THREE.RingGeometry(5.6, 6, 40), PALETTE.white, PITCH_CENTRE.x, 0.12, PITCH_CENTRE.z, { rx: -Math.PI / 2 });
  chalk.add(new THREE.RingGeometry(1.25, 1.5, 24), PALETTE.white, BALL.spot.x, 0.12, BALL.spot.z, { rx: -Math.PI / 2 });
  return { solid: k.build().solid!, chalk: chalk.build().solid! };
}

/** The basketball, seams and all, as one mesh. */
function ballGeometry() {
  const k = new Kit();
  k.ball(BALL.r, 0, 0, 0, PALETTE.ballOrange, 20);
  const seam = (xf: { rx?: number; ry?: number }) => k.torus(BALL.r * 1.005, 0.045, 0, 0, 0, PALETTE.ink, xf, Math.PI * 2, 28);
  seam({ rx: Math.PI / 2 });
  seam({});
  seam({ ry: Math.PI / 2 });
  return k.build().solid!;
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
const throwSpot = { x: 0, z: 0 };
function Ball({ material }: { material: THREE.Material }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const last = useRef({ x: view.ball.x, z: view.ball.z });
  const q = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(), []);
  const geo = useMemo(ballGeometry, []);
  useFrame(() => {
    const b = view.ball;
    const dx = b.x - last.current.x;
    const dz = b.z - last.current.z;
    const moved = Math.hypot(dx, dz);
    if (!b.held && moved > 1e-4 && moved < 5) {
      axis.set(dz, 0, -dx).normalize();
      q.setFromAxisAngle(axis, moved / BALL.r);
      mesh.current.quaternion.premultiply(q);
    }
    last.current.x = b.x;
    last.current.z = b.z;
    mesh.current.position.set(b.x, b.y, b.z);
    livePositions.set('ball', b);
    // "Hold to throw" is always in reach while you hold the ball, but anything nearer (a gate's
    // spot, the marble at your feet) comes first, so you can still walk into a trial carrying it.
    throwSpot.x = player.pos.x + Math.sin(player.yaw) * 2.9;
    throwSpot.z = player.pos.z + Math.cos(player.yaw) * 2.9;
    livePositions.set('ball-throw', throwSpot);
  });
  return <mesh ref={mesh} geometry={geo} material={material} castShadow name="hubplay:ball" />;
}

// ---------------------------------------------------------------- the moving parts of the nets and the hoop
function NetMesh({ n, material }: { n: Net; material: THREE.Material }) {
  const wobble = useRef<THREE.Group>(null!);
  const depth = Math.abs(n.backX - n.mouthX);
  const geo = useMemo(() => netGeometry(depth), [depth]);
  useFrame(() => {
    const k = Math.max(0, 1 - (performance.now() - fxClock.goalAt[n.id]) / 850);
    wobble.current.scale.set(1 + Math.sin(k * 30) * k * 0.12, 1, 1);
  });
  return (
    <group position={[n.mouthX, 0, n.z]} rotation={[0, n.dir === 1 ? 0 : Math.PI, 0]} name={`hubplay:net-${n.id}`}>
      {/* the net bulges from its back after a goal */}
      <group ref={wobble} position={[-depth, 0, 0]}>
        <mesh geometry={geo} material={material} position={[depth, 0, 0]} />
      </group>
    </group>
  );
}

function HoopNet({ material }: { material: THREE.Material }) {
  const net = useRef<THREE.Group>(null!);
  const geo = useMemo(hoopNetGeometry, []);
  useFrame(() => {
    const k = Math.max(0, 1 - (performance.now() - fxClock.hoopAt) / 450);
    net.current.scale.set(1 - k * 0.15, 1 + Math.sin(k * 9) * k * 0.35, 1 - k * 0.15);
  });
  return (
    <group ref={net} position={[HOOP.rim.x, HOOP.rim.y, HOOP.rim.z]} name="hubplay:hoop-net">
      <mesh geometry={geo} material={material} />
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
      // a burst: half of the pieces, from the net's mouth, the rim or a guessed Who Am I? card
      let k = 0;
      for (const p of parts) {
        if (p.life > 0 && k < n / 2) continue;
        const a = Math.random() * Math.PI * 2;
        const up = f.kind === 'goal' ? 20 : 14;
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
  const geos = useMemo(staticGeometry, []);
  const mats = useMemo(
    () => ({
      solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }),
      chalk: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
      net: new THREE.MeshStandardMaterial({ vertexColors: true, map: netTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    }),
    [],
  );
  return (
    <group name="hubplay">
      <Driver />
      <Marble />
      <Ball material={mats.solid} />
      {/* posts, crossbars, flags and the hoop: one draw; the chalk marks: one more */}
      <mesh geometry={geos.solid} material={mats.solid} castShadow receiveShadow name="hubplay:nets-and-hoop" />
      <mesh geometry={geos.chalk} material={mats.chalk} receiveShadow name="hubplay:chalk" />
      {NETS.map((n) => (
        <NetMesh key={n.id} n={n} material={mats.net} />
      ))}
      <HoopNet material={mats.net} />
      <ThrowArc />
      <Confetti />
      <Pusher />
    </group>
  );
}
