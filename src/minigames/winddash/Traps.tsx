/**
 * Wind-Up Dash — the ten trap sections, drawn from the generated course data (`course.ts`).
 * Everything that moves is driven by the rules state's match time, so what you see is exactly
 * what the rules core collides with. Geometries and materials are shared; repeated pieces are
 * instanced; nothing here allocates per frame or touches React state.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { feltMat, paintMat, woodMat } from '../../scene/props';
import {
  CRAYON_WARN_MS,
  DOMINO,
  JAW_SHUT_MS,
  JAW_WARN_MS,
  MARBLE_R,
  POST_TOP,
  TOP_HEIGHT,
  WALL_TOP,
  bobX,
  crayonOpenFor,
  jawPhase,
  marbleX,
  topX,
  topZ,
  type BooksSection,
  type ConveyorSection,
  type CrayonRow,
  type CrayonSection,
  type Jaw,
  type JamSection,
  type MarbleSection,
  type PendulumArm,
  type PendulumSection,
  type Section,
  type SpinTop,
  type SpringSection,
  type TopsSection,
} from './course';
import type { DashState } from './rules';

type Get = () => DashState;

/** Decorative motion (spinning, scrolling, wobbling) is skipped when the player asks for less. */
export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Jam: the palette's coral, cooked darker. */
const JAM = `#${new THREE.Color(PALETTE.coral).offsetHSL(-0.04, 0.1, -0.17).getHexString()}`;
const TINTS = [PALETTE.toyBlue, PALETTE.honey, PALETTE.sage, PALETTE.coral];

// ------------------------------------------------------------------- shared geometry + materials

/** Unit shapes, scaled per mesh, made once for the whole session. */
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  disc: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
  arrow: new THREE.CircleGeometry(1, 3, Math.PI / 2).rotateX(-Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  hex: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 12),
  tooth: new THREE.ConeGeometry(0.32, 0.7, 4),
  ball: new THREE.SphereGeometry(1, 16, 12),
};

const WHITE_PAINT = paintMat('#FFFFFF', 0.5);
const WHITE_WOOD = woodMat('#FFFFFF');
const GLASS = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.12, metalness: 0.15 });
const HAZARD = new THREE.MeshStandardMaterial({ color: PALETTE.honey, roughness: 0.9, transparent: true, opacity: 0.4, depthWrite: false });
const GROOVE = new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.9, transparent: true, opacity: 0.32, depthWrite: false });
const SHADE = new THREE.MeshBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.35, depthWrite: false });

export interface InstItem {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  color?: string;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Many copies of one shape in a single draw call (static: placed once). */
export function Inst({ geo, mat, items, shadow = true }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: InstItem[]; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      _q.setFromEuler(_e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0, 'YXZ'));
      mesh.setMatrixAt(i, _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1)));
      mesh.setColorAt(i, _c.set(it.color ?? '#FFFFFF'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={shadow} receiveShadow frustumCulled={false} />;
}

export function TrapView({ sec, get, padHit }: { sec: Section; get: Get; padHit: React.RefObject<number> }) {
  switch (sec.kind) {
    case 'dominoes':
      return null; // every domino of the course is one instanced mesh (DominoRows)
    case 'spring':
      return <WallAndPad sec={sec} padHit={padHit} />;
    case 'jam':
      return <JamAndRuler sec={sec} />;
    case 'jaws':
      return (
        <>
          {sec.jaws.map((j) => (
            <SnapJaw key={j.id} jaw={j} get={get} />
          ))}
        </>
      );
    case 'crayons':
      return <CrayonGates sec={sec} get={get} />;
    case 'marbles':
      return <MarbleRun sec={sec} get={get} />;
    case 'pendulum':
      return <Pendulums sec={sec} get={get} />;
    case 'tops':
      return <SpinningTops sec={sec} get={get} />;
    case 'conveyor':
      return <TapeBelts sec={sec} get={get} />;
    case 'books':
      return <BookSteps sec={sec} />;
  }
}

// ----------------------------------------------------------------------------------- dominoes

let dominoMat: THREE.MeshStandardMaterial | null = null;
/** Domino face: a centre line and pips (the box's thin edges just get a squashed copy). */
function dominoMaterial() {
  if (dominoMat) return dominoMat;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = PALETTE.white;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = PALETTE.ink;
  g.fillRect(8, 62, 48, 4);
  for (const [x, y] of [[18, 16], [32, 31], [46, 46], [18, 82], [46, 82], [18, 112], [46, 112]]) {
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (dominoMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }));
}

/** All dominoes as one instanced mesh; knocked ones tip over forwards and lie flat. */
export function DominoRows({ get }: { get: Get }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = get().dominoes.length;
  useFrame(() => {
    if (!mesh.current) return;
    const s = get();
    const h = DOMINO.top;
    const n = Math.min(count, s.dominoes.length);
    for (let i = 0; i < n; i++) {
      const d = s.dominoes[i];
      const k = d.state === 'up' ? 0 : d.state === 'down' ? 1 : Math.min(1, (s.t - d.at) / s.config.toppleMs);
      const a = -k * k * (Math.PI / 2 - 0.06); // tips towards −z, hinged on its far bottom edge
      // Centre of a box rotating about the edge at (z − hz, y 0).
      const cy = (h / 2) * Math.cos(a) + DOMINO.hz * Math.sin(-a);
      const cz = -(h / 2) * Math.sin(-a) + DOMINO.hz * Math.cos(a);
      _p.set(d.x, Math.max(DOMINO.hz, cy), d.z - DOMINO.hz + cz);
      _q.setFromEuler(_e.set(a, 0, 0));
      mesh.current.setMatrixAt(i, _m.compose(_p, _q, _s.set(DOMINO.hx * 2, h, DOMINO.hz * 2)));
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  if (!count) return null;
  return <instancedMesh ref={mesh} args={[GEO.box, dominoMaterial(), count]} castShadow frustumCulled={false} />;
}

// ------------------------------------------------------------------------- wall + spring pad

function WallAndPad({ sec, padHit }: { sec: SpringSection; padHit: React.RefObject<number> }) {
  const plate = useRef<THREE.Group>(null!);
  const { wall, pad, cx, hw } = sec;
  // Toy blocks either side of the gate.
  const blocks = useMemo(() => {
    const out: InstItem[] = [];
    const span = (from: number, to: number) => {
      if (to - from < 0.2) return;
      const n = Math.max(1, Math.round((to - from) / 3.4));
      const w = (to - from) / n;
      for (let i = 0; i < n; i++) out.push({ x: from + w * (i + 0.5), y: WALL_TOP / 2, z: wall.z, sx: w - 0.08, sy: WALL_TOP, sz: wall.hz * 2, color: TINTS[(out.length + 1) % TINTS.length] });
    };
    span(cx - hw, wall.gateX - wall.gateHalf);
    span(wall.gateX + wall.gateHalf, cx + hw);
    return out;
  }, [wall, cx, hw]);
  const arrows = useMemo<InstItem[]>(() => [-1, 0, 1].map((i) => ({ x: i * pad.hx * 0.55, y: 0.17, z: 0, sx: 0.8, sz: 0.8 })), [pad.hx]);
  useFrame(() => {
    const since = (performance.now() - padHit.current) / 1000;
    // Pops up and rings down after a launch.
    const k = since < 0.8 ? Math.sin(since * 26) * Math.exp(-since * 5) : 0;
    plate.current.position.y = 0.55 + Math.max(-0.3, k * 1.6);
  });
  return (
    <group>
      <Inst geo={GEO.box} mat={WHITE_WOOD} items={blocks} />
      {/* arrow on the floor pointing at the gate */}
      <mesh geometry={GEO.arrow} position={[wall.gateX, 0.09, wall.z + 3.2]} scale={1.2} material={paintMat(PALETTE.white, 0.9)} />
      <group position={[pad.x, 0, pad.z]}>
        <mesh geometry={GEO.cyl} position={[0, 0.25, 0]} scale={[1.3, 0.5, 1.3]} material={paintMat(PALETTE.brass, 0.32, 0.85)} />
        <group ref={plate} position={[0, 0.55, 0]}>
          <mesh geometry={GEO.box} castShadow scale={[pad.hx * 2, 0.3, pad.hz * 2]} material={paintMat(PALETTE.coral, 0.45)} />
          <Inst geo={GEO.arrow} mat={paintMat(PALETTE.white, 0.9)} items={arrows} shadow={false} />
        </group>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------------------- jam + ruler

function JamAndRuler({ sec }: { sec: JamSection }) {
  const { jam, path, cx, hw } = sec;
  const len = jam.z0 - jam.z1;
  // Blobby edges so it reads as a spill, not a carpet.
  const blobs = useMemo<InstItem[]>(() => [jam.z0, jam.z1].flatMap((z) => [-0.75, -0.25, 0.25, 0.75].map((k) => ({ x: cx + k * hw, y: 0.075, z, sx: hw * 0.27, sz: Math.min(1.9, hw * 0.27) }))), [jam, cx, hw]);
  const legs = useMemo(
    () =>
      path.slice(1).map((b, i) => {
        const a = path[i];
        const dx = b.x - a.x;
        const dz = a.z - b.z;
        const length = Math.hypot(dx, dz) + 2.2;
        // Each ruler runs from a to b: turn a box that's long in z to match.
        const ticks: InstItem[] = [];
        for (let k = 0, z = -length / 2 + 2; z < length / 2 - 1; k++, z += 2) ticks.push({ x: -sec.half + (k % 5 === 0 ? 0.7 : 0.4), y: 0.2, z, sx: k % 5 === 0 ? 1.4 : 0.8, sz: 0.14 });
        return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, yaw: Math.atan2(-dx, dz), length, ticks, y: i * 0.17 };
      }),
    [path, sec.half],
  );
  return (
    <group>
      <mesh geometry={GEO.plane} position={[cx, 0.08, (jam.z0 + jam.z1) / 2]} scale={[hw * 2, 1, len]} material={paintMat(JAM, 0.12)} />
      <Inst geo={GEO.disc} mat={paintMat(JAM, 0.12)} items={blobs} shadow={false} />
      {legs.map((l, i) => (
        <group key={i} position={[l.x, l.y, l.z]} rotation={[0, l.yaw, 0]}>
          <mesh geometry={GEO.box} position={[0, 0.11, 0]} scale={[sec.half * 2, 0.16, l.length]} receiveShadow material={woodMat(PALETTE.honey)} />
          <Inst geo={GEO.plane} mat={paintMat(PALETTE.ink, 0.8)} items={l.ticks} shadow={false} />
        </group>
      ))}
    </group>
  );
}

// --------------------------------------------------------------------------------- snap jaws

const JAW_COLOURS = { open: new THREE.Color(PALETTE.toyBlue), warn: new THREE.Color(PALETTE.honey), shut: new THREE.Color(PALETTE.coral) };

/**
 * A clockwork trap: two toothed flaps hinged along the middle. Open, they lie flat and a toy can
 * walk across. They rattle as a warning, then clap up together into a wall.
 */
function SnapJaw({ jaw, get }: { jaw: Jaw; get: Get }) {
  const near = useRef<THREE.Group>(null!);
  const far = useRef<THREE.Group>(null!);
  const plate = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(() => {
    const s = get();
    const phase = jawPhase(jaw, s.t);
    const k = (((s.t + jaw.offsetMs) % jaw.periodMs) + jaw.periodMs) % jaw.periodMs;
    const shutAt = jaw.periodMs - JAW_SHUT_MS;
    let up = 0; // 0 = flaps flat on the floor, 1 = clapped together upright
    if (phase === 'shut') up = Math.min(1, (k - shutAt) / 50, (jaw.periodMs - k) / 180);
    else if (phase === 'warn') up = 0.07 + 0.1 * Math.abs(Math.sin(s.t * 0.034)) + 0.1 * ((k - (shutAt - JAW_WARN_MS)) / JAW_WARN_MS);
    const a = Math.max(0, up) * (Math.PI / 2 - 0.07);
    near.current.rotation.x = -a;
    far.current.rotation.x = a;
    plate.current.color.copy(JAW_COLOURS[phase]);
  });
  const teeth = useMemo(() => {
    const n = Math.max(3, Math.round(jaw.hx / 0.9));
    return (dir: 1 | -1): InstItem[] => Array.from({ length: n }, (_, i) => ({ x: -jaw.hx + ((i + 0.5) * jaw.hx * 2) / n, y: 0, z: dir * (jaw.hz + 0.22), rx: (dir * Math.PI) / 2 }));
  }, [jaw.hx, jaw.hz]);
  const nearTeeth = useMemo(() => teeth(1), [teeth]);
  const farTeeth = useMemo(() => teeth(-1), [teeth]);
  // dir +1 is the flap on the near (+z) side of the hinge, −1 the far side.
  const flap = (ref: React.RefObject<THREE.Group>, dir: 1 | -1) => (
    <group ref={ref} position={[0, 0.2, 0]}>
      <mesh geometry={GEO.box} position={[0, 0, (dir * jaw.hz) / 2]} scale={[jaw.hx * 2 - 0.1, 0.16, jaw.hz]} castShadow material={paintMat(PALETTE.sage, 0.4, 0.3)} />
      <Inst geo={GEO.tooth} mat={paintMat(PALETTE.white, 0.4)} items={dir > 0 ? nearTeeth : farTeeth} shadow={false} />
    </group>
  );
  return (
    <group position={[jaw.x, 0, jaw.z]}>
      <mesh geometry={GEO.box} position={[0, 0.06, 0]} scale={[jaw.hx * 2, 0.12, jaw.hz * 2 + 0.6]} receiveShadow>
        <meshStandardMaterial ref={plate} roughness={0.6} />
      </mesh>
      {flap(near, 1)}
      {flap(far, -1)}
    </group>
  );
}

// ------------------------------------------------------------------------------ crayon gates

const CRAYON_COLOURS = [PALETTE.coral, PALETTE.honey, PALETTE.toyBlue];

/**
 * A fence of toy blocks with three doorways. Each doorway has a crayon for a barrier, hinged on
 * a peg like a level-crossing arm: down is shut, straight up is open. They lift in turn and
 * shiver just before they drop.
 */
function CrayonGates({ sec, get }: { sec: CrayonSection; get: Get }) {
  const posts = useMemo<InstItem[]>(() => sec.rows.flatMap((row) => row.posts.map((p, i) => ({ x: p.x, y: POST_TOP / 2, z: row.z, sx: p.hx * 2, sy: POST_TOP, sz: row.hz * 2 + 0.5, color: i % 2 ? PALETTE.sage : PALETTE.woodLight }))), [sec]);
  return (
    <group>
      <Inst geo={GEO.box} mat={WHITE_WOOD} items={posts} />
      {sec.rows.map((row) => row.doors.map((_, d) => <CrayonArm key={`${row.id}:${d}`} row={row} door={d} get={get} />))}
    </group>
  );
}

function CrayonArm({ row, door, get }: { row: CrayonRow; door: number; get: Get }) {
  const arm = useRef<THREE.Group>(null!);
  const d = row.doors[door];
  const len = d.half * 2 + 0.3;
  const colour = CRAYON_COLOURS[door % CRAYON_COLOURS.length];
  const openMs = row.open * row.slotMs;
  useFrame(() => {
    const s = get();
    const left = crayonOpenFor(row, door, s.t);
    // 0 = down across the doorway, 1 = standing straight up.
    let k = left > 0 ? Math.min(1, (openMs - left) / 140, left / 90) : 0;
    if (left > 0 && left < CRAYON_WARN_MS) k -= 0.1 * Math.abs(Math.sin(s.t * 0.03));
    arm.current.rotation.z = Math.max(0, k) * (Math.PI / 2);
  });
  return (
    <group position={[d.x - d.half - 0.1, 1.6, row.z]}>
      <mesh geometry={GEO.cyl} rotation={[Math.PI / 2, 0, 0]} scale={[0.5, row.hz * 2 + 0.9, 0.5]} material={paintMat(PALETTE.brass, 0.35, 0.8)} />
      <group ref={arm}>
        <mesh geometry={GEO.hex} position={[len / 2 - 0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.45, len - 0.7, 0.45]} castShadow material={paintMat(colour, 0.5)} />
        <mesh geometry={GEO.hex} position={[len * 0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.47, len * 0.3, 0.47]} material={paintMat(PALETTE.cream, 0.8)} />
        <mesh geometry={GEO.cone} position={[len - 0.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.45, 0.7, 0.45]} material={paintMat(colour, 0.4)} />
      </group>
    </group>
  );
}

// -------------------------------------------------------------------------------- marble run

/** Marbles roll out of a cardboard tunnel on one kerb, across a chalked lane, into the other. */
function MarbleRun({ sec, get }: { sec: MarbleSection; get: Get }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = sec.lanes.reduce((n, l) => n + l.count, 0);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    for (let i = 0; i < count; i++) mesh.current.setColorAt(i, _c.set(TINTS[i % TINTS.length]));
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [count]);
  useFrame(() => {
    if (!mesh.current) return;
    const t = get().t;
    let n = 0;
    for (const lane of sec.lanes)
      for (let i = 0; i < lane.count; i++) {
        _m.makeScale(MARBLE_R, MARBLE_R, MARBLE_R).setPosition(marbleX(lane, i, t), MARBLE_R, lane.z);
        mesh.current.setMatrixAt(n++, _m);
      }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  const lanes = useMemo<InstItem[]>(() => sec.lanes.map((l) => ({ x: sec.cx, y: 0.085, z: l.z, sx: sec.hw * 2, sz: MARBLE_R * 2 + 0.5 })), [sec]);
  const arrows = useMemo<InstItem[]>(() => sec.lanes.flatMap((l) => [-0.5, 0, 0.5].map((k) => ({ x: sec.cx + k * sec.hw, y: 0.1, z: l.z, ry: (-l.dir * Math.PI) / 2, sx: 0.6, sz: 0.6 }))), [sec]);
  const tunnels = useMemo<InstItem[]>(() => sec.lanes.flatMap((l) => [-1, 1].map((side) => ({ x: sec.cx + side * (sec.hw + 2.3), y: 1.4, z: l.z, sx: 3.4, sy: 2.8, sz: 3.2 }))), [sec]);
  const mouths = useMemo<InstItem[]>(() => sec.lanes.flatMap((l) => [-1, 1].map((side) => ({ x: sec.cx + side * (sec.hw + 0.58), y: 1.15, z: l.z, rz: Math.PI / 2, sx: 1.15, sy: 0.06, sz: 1.15 }))), [sec]);
  return (
    <group>
      <Inst geo={GEO.plane} mat={GROOVE} items={lanes} shadow={false} />
      <Inst geo={GEO.arrow} mat={paintMat(PALETTE.white, 0.9)} items={arrows} shadow={false} />
      <Inst geo={GEO.box} mat={paintMat(PALETTE.cardboard, 0.9)} items={tunnels} />
      <Inst geo={GEO.cyl} mat={paintMat(PALETTE.ink, 0.9)} items={mouths} shadow={false} />
      <instancedMesh ref={mesh} args={[GEO.ball, GLASS, count]} castShadow frustumCulled={false} />
    </group>
  );
}

// ---------------------------------------------------------------------------------- pendulum

/** Pivot height: tall enough that the bead stays near the floor right across the road. */
const PIVOT_Y = 17;

function Pendulums({ sec, get }: { sec: PendulumSection; get: Get }) {
  const posts = useMemo<InstItem[]>(() => sec.arms.flatMap((a) => [-1, 1].map((side) => ({ x: sec.cx + side * (sec.hw + 2.6), y: (PIVOT_Y + 0.6) / 2, z: a.z, sx: 0.55, sy: PIVOT_Y + 0.6, sz: 0.55, color: side < 0 ? PALETTE.honey : PALETTE.toyBlue }))), [sec]);
  const tips = useMemo<InstItem[]>(() => sec.arms.flatMap((a) => [-1, 1].map((side) => ({ x: sec.cx + side * (sec.hw + 2.6), y: PIVOT_Y + 1.5, z: a.z, sx: 0.55, sy: 1.8, sz: 0.55 }))), [sec]);
  const strips = useMemo<InstItem[]>(() => sec.arms.map((a) => ({ x: a.x, y: 0.085, z: a.z, sx: (a.amp + a.r) * 2, sz: a.hz * 2 })), [sec]);
  return (
    <group>
      <Inst geo={GEO.hex} mat={WHITE_PAINT} items={posts} />
      <Inst geo={GEO.cone} mat={woodMat(PALETTE.woodLight)} items={tips} />
      <Inst geo={GEO.plane} mat={HAZARD} items={strips} shadow={false} />
      {sec.arms.map((a, i) => (
        <PendulumArmView key={i} arm={a} span={sec.hw * 2 + 6.4} cx={sec.cx} get={get} />
      ))}
    </group>
  );
}

function PendulumArmView({ arm, span, cx, get }: { arm: PendulumArm; span: number; cx: number; get: Get }) {
  const swing = useRef<THREE.Group>(null!);
  const shade = useRef<THREE.Mesh>(null!);
  const L = PIVOT_Y - arm.r - 0.1;
  useFrame(() => {
    const x = bobX(arm, get().t);
    swing.current.rotation.z = Math.asin(Math.max(-1, Math.min(1, (x - arm.x) / L)));
    shade.current.position.x = x;
  });
  return (
    <group>
      <mesh geometry={GEO.box} position={[cx, PIVOT_Y, arm.z]} scale={[span, 0.7, 0.7]} castShadow material={woodMat(PALETTE.woodMid)} />
      <group ref={swing} position={[arm.x, PIVOT_Y, arm.z]}>
        <mesh geometry={GEO.cyl} position={[0, -L / 2, 0]} scale={[0.09, L, 0.09]} material={paintMat(PALETTE.ink, 0.8)} />
        <mesh geometry={GEO.ball} position={[0, -L, 0]} scale={arm.r} castShadow material={woodMat(PALETTE.coral)} />
        <mesh geometry={GEO.cyl} position={[0, -L, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[arm.r * 0.45, arm.r * 2.04, arm.r * 0.45]} material={paintMat(PALETTE.cream, 0.6)} />
      </group>
      {/* where the bead is over the road, readable from behind on any tier */}
      <mesh ref={shade} geometry={GEO.disc} position={[arm.x, 0.1, arm.z]} scale={arm.r * 1.15} material={SHADE} renderOrder={1} />
    </group>
  );
}

// ----------------------------------------------------------------------------- spinning tops

function SpinningTops({ sec, get }: { sec: TopsSection; get: Get }) {
  return (
    <group>
      {sec.tops.map((tp) => (
        <SpinningTop key={tp.id} top={tp} get={get} />
      ))}
    </group>
  );
}

function SpinningTop({ top, get }: { top: SpinTop; get: Get }) {
  const root = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const still = useRef(reducedMotion());
  const a = TINTS[top.id % TINTS.length];
  const b = TINTS[(top.id + 2) % TINTS.length];
  useFrame(() => {
    const t = get().t;
    root.current.position.set(topX(top, t), 0, topZ(top, t));
    if (still.current) return;
    // Spin and a lazy precession: looks only (the rules see a plain circle).
    body.current.rotation.y = t * 0.016 * top.dir;
    root.current.rotation.x = Math.sin(t * 0.004 + top.phase) * 0.1;
    root.current.rotation.z = Math.cos(t * 0.004 + top.phase) * 0.1;
  });
  const r = top.r;
  return (
    <group ref={root} position={[top.x, 0, top.z]}>
      <group ref={body}>
        <mesh geometry={GEO.cone} position={[0, 0.85, 0]} rotation={[Math.PI, 0, 0]} scale={[r, 1.7, r]} castShadow material={paintMat(a, 0.4)} />
        <mesh geometry={GEO.cyl} position={[0, 1.85, 0]} scale={[r, 0.34, r]} castShadow material={paintMat(b, 0.4)} />
        <mesh geometry={GEO.cyl} position={[0, 2.03, 0]} scale={[r * 0.55, 0.04, r * 0.55]} material={paintMat(PALETTE.cream, 0.6)} />
        <mesh geometry={GEO.box} position={[r * 0.72, 2.03, 0]} scale={[r * 0.3, 0.05, r * 0.3]} material={paintMat(PALETTE.cream, 0.6)} />
        <mesh geometry={GEO.cyl} position={[0, (2 + TOP_HEIGHT) / 2 + 0.1, 0]} scale={[0.2, TOP_HEIGHT - 1.8, 0.2]} material={paintMat(PALETTE.brass, 0.35, 0.8)} />
        <mesh geometry={GEO.ball} position={[0, TOP_HEIGHT + 0.25, 0]} scale={0.34} material={paintMat(PALETTE.brass, 0.35, 0.8)} />
      </group>
    </group>
  );
}

// -------------------------------------------------------------------- tape-measure conveyors

/** A strip of tape measure with tick marks and chevrons that point the way it runs. */
function tapeTexture(colour: string) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = PALETTE.honey;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = PALETTE.ink;
  for (let y = 0; y < 64; y += 8) {
    g.fillRect(0, y, y % 32 === 0 ? 14 : 8, 2);
    g.fillRect(y % 32 === 0 ? 50 : 56, y, 14, 2);
  }
  g.strokeStyle = colour;
  g.lineWidth = 9;
  g.lineJoin = 'miter';
  g.beginPath();
  g.moveTo(18, 44);
  g.lineTo(32, 22);
  g.lineTo(46, 44);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function TapeBelts({ sec, get }: { sec: ConveyorSection; get: Get }) {
  const still = useRef(reducedMotion());
  // One scrolling material per direction; belts of a kind share it.
  const mats = useMemo(() => {
    const mk = (colour: string) => new THREE.MeshStandardMaterial({ map: tapeTexture(colour), roughness: 0.55 });
    return { fwd: mk(PALETTE.feltDark), back: mk(PALETTE.coral) };
  }, []);
  useEffect(
    () => () => {
      for (const m of [mats.fwd, mats.back]) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [mats],
  );
  const speeds = useMemo(() => ({ fwd: Math.max(0, ...sec.belts.map((b) => b.v)), back: Math.max(0, ...sec.belts.map((b) => -b.v)) }), [sec]);
  useFrame(() => {
    if (still.current) return;
    const t = get().t / 1000;
    // The pattern travels the way the chevrons point (belts running back are drawn turned round).
    mats.fwd.map!.offset.y = -((t * speeds.fwd) / 4) % 1;
    mats.back.map!.offset.y = -((t * speeds.back) / 4) % 1;
  });
  const geos = useMemo(
    () =>
      sec.belts.map((b) => {
        const len = b.z0 - b.z1;
        const g = new THREE.PlaneGeometry(b.hx * 2, len).rotateX(-Math.PI / 2);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 4));
        return g;
      }),
    [sec],
  );
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  const rollers = useMemo<InstItem[]>(() => sec.belts.flatMap((b) => [b.z0, b.z1].map((z) => ({ x: b.x, y: 0.2, z, rz: Math.PI / 2, sx: 0.3, sy: b.hx * 2 + 0.3, sz: 0.3 }))), [sec]);
  return (
    <group>
      {sec.belts.map((b, i) => (
        <mesh key={i} geometry={geos[i]} position={[b.x, 0.1, (b.z0 + b.z1) / 2]} rotation={[0, b.v > 0 ? 0 : Math.PI, 0]} receiveShadow material={b.v > 0 ? mats.fwd : mats.back} />
      ))}
      <Inst geo={GEO.cyl} mat={paintMat(PALETTE.brass, 0.35, 0.8)} items={rollers} shadow={false} />
    </group>
  );
}

// -------------------------------------------------------------------------------- book steps

/** A wedge rising towards −z: `len` long, from height 0 up to `rise`. Unit width. */
function wedgeGeometry(len: number, rise: number) {
  const g = new THREE.BufferGeometry();
  // prettier-ignore
  const v = [
    // slope
    -0.5, 0, len, 0.5, 0, len, 0.5, rise, 0, -0.5, 0, len, 0.5, rise, 0, -0.5, rise, 0,
    // left and right sides
    -0.5, 0, len, -0.5, rise, 0, -0.5, 0, 0, 0.5, 0, len, 0.5, 0, 0, 0.5, rise, 0,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function BookSteps({ sec }: { sec: BooksSection }) {
  const covers = [PALETTE.toyBlue, PALETTE.coral];
  const parts = useMemo(() => {
    const cover: InstItem[] = [];
    const pages: InstItem[] = [];
    const labels: InstItem[] = [];
    sec.books.forEach((b, i) => {
      const colour = covers[i % covers.length];
      const w = b.hx * 2 + 2.4;
      cover.push({ x: b.x, y: b.top - 0.09, z: b.z, sx: w, sy: 0.18, sz: b.hz * 2, color: colour });
      cover.push({ x: b.x, y: 0.09, z: b.z, sx: w, sy: 0.18, sz: b.hz * 2, color: colour });
      cover.push({ x: b.x, y: b.top / 2, z: b.z - b.hz + 0.1, sx: w, sy: b.top, sz: 0.2, color: colour }); // spine, on the far side
      pages.push({ x: b.x, y: b.top / 2, z: b.z + 0.05, sx: w - 0.3, sy: b.top - 0.3, sz: b.hz * 2 - 0.25 });
      labels.push({ x: b.x, y: b.top + 0.012, z: b.z, sx: b.hx * 1.1, sz: b.hz * 0.7 });
    });
    return { cover, pages, labels };
  }, [sec]);
  const ramps = useMemo(() => sec.faces.map((f) => ({ f, geo: wedgeGeometry(f.rampLen, f.top - f.from) })), [sec]);
  useEffect(() => () => ramps.forEach((r) => r.geo.dispose()), [ramps]);
  return (
    <group>
      <Inst geo={GEO.box} mat={WHITE_PAINT} items={parts.cover} />
      <Inst geo={GEO.box} mat={paintMat(PALETTE.cream, 0.9)} items={parts.pages} />
      <Inst geo={GEO.plane} mat={paintMat(PALETTE.cream, 0.8)} items={parts.labels} shadow={false} />
      {ramps.map(({ f, geo }, i) => (
        <group key={i}>
          <mesh geometry={geo} position={[f.rampX, f.from + 0.02, f.z]} scale={[f.rampHalf * 2, 1, 1]} castShadow receiveShadow material={woodMat(PALETTE.honey)} />
          {/* chevron on the floor leading to the ramp */}
          <mesh geometry={GEO.arrow} position={[f.rampX, f.from + 0.1, f.z + f.rampLen + 1.6]} scale={1} material={paintMat(PALETTE.white, 0.9)} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------- roadside clutter

/** Blocks, buttons, cotton reels, pencils and felt trees scattered beside the road. */
export function Clutter({ decor }: { decor: DashState['course']['decor'] }) {
  const sets = useMemo(() => {
    const block: InstItem[] = [];
    const button: InstItem[] = [];
    const holes: InstItem[] = [];
    const reel: InstItem[] = [];
    const flange: InstItem[] = [];
    const pencil: InstItem[] = [];
    const lead: InstItem[] = [];
    const trunk: InstItem[] = [];
    const leaf: InstItem[] = [];
    for (const d of decor) {
      const k = d.size;
      const colour = TINTS[d.tint % TINTS.length];
      const cos = Math.cos(d.rot);
      const sin = Math.sin(d.rot);
      if (d.kind === 'block') block.push({ x: d.x, y: 1.3 * k, z: d.z, ry: d.rot, sx: 2.6 * k, sy: 2.6 * k, sz: 2.6 * k, color: colour });
      else if (d.kind === 'button') {
        button.push({ x: d.x, y: 0.2, z: d.z, ry: d.rot, sx: 1.5 * k, sy: 0.4, sz: 1.5 * k, color: colour });
        for (const o of [-1, 1]) holes.push({ x: d.x + cos * o * 0.4 * k, y: 0.41, z: d.z - sin * o * 0.4 * k, sx: 0.22 * k, sz: 0.22 * k });
      } else if (d.kind === 'spool') {
        reel.push({ x: d.x, y: 1.25 * k, z: d.z, sx: 0.95 * k, sy: 2.1 * k, sz: 0.95 * k, color: colour });
        for (const y of [0.15, 2.35]) flange.push({ x: d.x, y: y * k, z: d.z, sx: 1.3 * k, sy: 0.3 * k, sz: 1.3 * k });
      } else if (d.kind === 'pencil') {
        const len = 7 * k;
        pencil.push({ x: d.x, y: 0.36, z: d.z, ry: d.rot, rx: Math.PI / 2, sx: 0.36, sy: len, sz: 0.36, color: colour });
        lead.push({ x: d.x + sin * (len / 2 + 0.5), y: 0.36, z: d.z + cos * (len / 2 + 0.5), ry: d.rot, rx: Math.PI / 2, sx: 0.36, sy: 1, sz: 0.36 });
      } else {
        trunk.push({ x: d.x, y: 0.9 * k, z: d.z, sx: 0.4 * k, sy: 1.8 * k, sz: 0.4 * k });
        for (let i = 0; i < 2; i++) leaf.push({ x: d.x, y: (2.6 + i * 1.6) * k, z: d.z, sx: (2 - i * 0.55) * k, sy: 2.6 * k, sz: (2 - i * 0.55) * k });
      }
    }
    return { block, button, holes, reel, flange, pencil, lead, trunk, leaf };
  }, [decor]);
  return (
    <group>
      <Inst geo={GEO.box} mat={WHITE_WOOD} items={sets.block} />
      <Inst geo={GEO.cyl} mat={WHITE_PAINT} items={sets.button} />
      <Inst geo={GEO.disc} mat={paintMat(PALETTE.ink, 0.9)} items={sets.holes} shadow={false} />
      <Inst geo={GEO.cyl} mat={WHITE_PAINT} items={sets.reel} />
      <Inst geo={GEO.cyl} mat={woodMat(PALETTE.woodLight)} items={sets.flange} />
      <Inst geo={GEO.hex} mat={WHITE_PAINT} items={sets.pencil} />
      <Inst geo={GEO.cone} mat={woodMat(PALETTE.woodLight)} items={sets.lead} />
      <Inst geo={GEO.cyl} mat={woodMat(PALETTE.woodDark)} items={sets.trunk} />
      <Inst geo={GEO.cone} mat={feltMat(PALETTE.sage)} items={sets.leaf} />
    </group>
  );
}
