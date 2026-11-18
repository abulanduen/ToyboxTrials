/**
 * Wind-Up Dash — a strip of dark felt track along the table, dressed with props: three rows of
 * dominoes, a spring pad beside a toy-block wall, a ruler across a spill of jam, three rows of
 * clockwork snap jaws, and a chequered finish. Everything is driven by the rules state.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { feltMat, paintMat, woodMat } from '../../scene/props';
import { matchBus } from '../session';
import type { MinigameSceneProps } from '../types';
import { ChaseCam, type ChaseShot } from '../shared/ChaseCam';
import { FinishGate } from '../shared/CourseBits';
import { Racer, type RacerView } from '../shared/Racer';
import { DEFAULT_CONFIG, DOMINO, JAW_SHUT_MS, JAW_WARN_MS, WALL_TOP, dashRules, jawPhase, type Course, type DashState, type Jaw } from './rules';

/** Same spot on the table as the Red Light runway: rules −z (forward) runs along world −x. */
const COURSE_POS: [number, number, number] = [-9, 0, -6];
const COURSE_ROT = Math.PI / 2;

/** Jam: the palette's coral, cooked darker. */
const JAM = `#${new THREE.Color(PALETTE.coral).offsetHSL(-0.04, 0.1, -0.17).getHexString()}`;

// Steeper than the Red Light camera: the toy must stay visible just past a row of dominoes.
const LANDSCAPE: ChaseShot = { height: 13, back: 17, ahead: 11, lookY: 2.2, followX: 0.7 };
const PORTRAIT: ChaseShot = { height: 21, back: 29, ahead: 14, lookY: 3, followX: 0.9 };

export function DashScene({ getState: rawState, contestants, localId }: MinigameSceneProps<DashState>) {
  // In a tournament the host still holds the previous trial's state while this trial's intro card
  // is up, so only accept a state that is really ours.
  const getState = useCallback(() => {
    const s = rawState() as DashState | null;
    return s && 'course' in s ? s : null;
  }, [rawState]);
  const frame = useRef<THREE.Group>(null);
  const padHit = useRef(-99);
  // Before the first countdown there's no state: show a sample course so the table isn't bare.
  const preview = useMemo(() => dashRules.init([], 1), []);
  const live = getState();
  const cfg = live?.config ?? DEFAULT_CONFIG;
  const course = live?.course ?? preview.course;
  const get = () => getState() ?? preview;

  useEffect(
    () =>
      matchBus.on('event', (e) => {
        const mine = e.id === localId;
        switch (e.type) {
          case 'start':
            sfx.signalGo();
            break;
          case 'domino':
            sfx.dominoClack();
            break;
          case 'spring':
            padHit.current = performance.now();
            sfx.flick();
            break;
          case 'jaw-shut':
            sfx.trapSnap(0.5);
            break;
          case 'snap':
            if (mine) {
              sfx.trapSnap(1);
              window.setTimeout(() => sfx.reject(), 120);
            }
            break;
          case 'finish':
            if (mine) sfx.finishLine();
            else sfx.promptIn();
            break;
        }
      }),
    [localId],
  );

  const views = useMemo(() => {
    const out = new Map<string, () => RacerView | null>();
    for (const c of contestants) {
      const v: RacerView = { m: null as never, tossK: -1, tossH: 7.5, dizzy: false, cheer: false };
      out.set(c.id, () => {
        const s = getState();
        const p = s?.players.find((x) => x.id === c.id);
        if (!s || !p) return null;
        v.m = p.m;
        v.tossK = p.toss ? Math.min(1, p.toss.t / s.config.springMs) : -1;
        v.dizzy = p.stunMs > 0;
        v.cheer = p.finished;
        return v;
      });
    }
    return out;
  }, [contestants, getState]);

  const hw = cfg.halfWidth;
  const length = cfg.startZ - cfg.finishZ;
  const midZ = (cfg.startZ + cfg.finishZ) / 2;

  return (
    <group ref={frame} position={COURSE_POS} rotation={[0, COURSE_ROT, 0]}>
      <ChaseCam
        frame={frame}
        target={() => {
          const p = getState()?.players.find((x) => x.id === localId);
          return p ? { x: p.m.x, y: 0, z: p.m.z } : { x: 0, y: 0, z: cfg.startZ };
        }}
        landscape={LANDSCAPE}
        portrait={PORTRAIT}
        maxX={hw - 3}
      />
      {/* track + kerbs */}
      <mesh position={[0, 0.05, midZ + 0.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={feltMat(PALETTE.inkPurple)}>
        <planeGeometry args={[hw * 2 + 3.2, length + 20]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (hw + 1), 0.5, midZ + 0.5]} castShadow receiveShadow material={woodMat(PALETTE.woodLight)}>
          <boxGeometry args={[1.2, 1, length + 20]} />
        </mesh>
      ))}
      <mesh position={[0, 0.1, cfg.startZ - 1.4]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.white, 0.9)}>
        <planeGeometry args={[hw * 2, 0.9]} />
      </mesh>
      <FinishGate z={cfg.finishZ} halfWidth={hw} />

      <DominoRows get={get} />
      <WallAndPad course={course} hw={hw} padHit={padHit} />
      <JamAndRuler course={course} hw={hw} />
      {course.jaws.map((j, i) => (
        <SnapJaw key={i} jaw={j} get={get} />
      ))}

      {contestants.map((c) => (
        <Racer key={c.id} c={c} view={views.get(c.id)!} />
      ))}
    </group>
  );
}

// ----------------------------------------------------------------------------------- dominoes

/** Domino face: a centre line and pips (the box's thin edges just get a squashed copy). */
function dominoFace() {
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
  return t;
}

/** All dominoes as one instanced mesh; knocked ones tip over forwards and lie flat. */
function DominoRows({ get }: { get: () => DashState }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const count = get().dominoes.length;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: dominoFace(), roughness: 0.35 }), []);
  useEffect(
    () => () => {
      mat.map?.dispose();
      mat.dispose();
    },
    [mat],
  );
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), e: new THREE.Euler() }), []);
  useFrame(() => {
    const s = get();
    const h = DOMINO.top;
    s.dominoes.forEach((d, i) => {
      if (i >= count) return;
      const k = d.state === 'up' ? 0 : d.state === 'down' ? 1 : Math.min(1, (s.t - d.at) / s.config.toppleMs);
      const a = -k * k * (Math.PI / 2 - 0.06); // tips towards −z, hinged on its far bottom edge
      // Centre of a box rotating about the edge at (z − hz, y 0).
      const cy = (h / 2) * Math.cos(a) + DOMINO.hz * Math.sin(-a);
      const cz = -(h / 2) * Math.sin(-a) + DOMINO.hz * Math.cos(a);
      tmp.p.set(d.x, Math.max(DOMINO.hz, cy), d.z - DOMINO.hz + cz);
      tmp.q.setFromEuler(tmp.e.set(a, 0, 0));
      mesh.current.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} castShadow frustumCulled={false} material={mat}>
      <boxGeometry args={[DOMINO.hx * 2, DOMINO.top, DOMINO.hz * 2]} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------------- wall + spring pad

function WallAndPad({ course, hw, padHit }: { course: Course; hw: number; padHit: React.RefObject<number> }) {
  const plate = useRef<THREE.Group>(null!);
  const { wall, pad } = course;
  // Toy blocks either side of the gate.
  const blocks = useMemo(() => {
    const out: { x: number; w: number; c: string }[] = [];
    const cols = [PALETTE.toyBlue, PALETTE.honey, PALETTE.sage, PALETTE.coral];
    const span = (from: number, to: number) => {
      const n = Math.max(1, Math.round((to - from) / 3.4));
      const w = (to - from) / n;
      for (let i = 0; i < n; i++) out.push({ x: from + w * (i + 0.5), w, c: cols[(out.length + 1) % cols.length] });
    };
    if (wall.gateX - wall.gateHalf > -hw + 0.2) span(-hw, wall.gateX - wall.gateHalf);
    if (wall.gateX + wall.gateHalf < hw - 0.2) span(wall.gateX + wall.gateHalf, hw);
    return out;
  }, [wall, hw]);
  useFrame(() => {
    const since = (performance.now() - padHit.current) / 1000;
    // Pops up and rings down after a launch.
    const k = since < 0.8 ? Math.sin(since * 26) * Math.exp(-since * 5) : 0;
    plate.current.position.y = 0.55 + Math.max(-0.3, k * 1.6);
  });
  return (
    <group>
      {blocks.map((b) => (
        <mesh key={b.x} position={[b.x, WALL_TOP / 2, wall.z]} castShadow receiveShadow material={woodMat(b.c)}>
          <boxGeometry args={[b.w - 0.08, WALL_TOP, wall.hz * 2]} />
        </mesh>
      ))}
      {/* arrow on the floor pointing at the gate */}
      <mesh position={[wall.gateX, 0.09, wall.z + 3.2]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.white, 0.9)}>
        <circleGeometry args={[1.2, 3, Math.PI / 2]} />
      </mesh>
      {/* spring pad */}
      <group position={[pad.x, 0, pad.z]}>
        <mesh position={[0, 0.25, 0]} material={paintMat(PALETTE.brass, 0.32, 0.85)}>
          <cylinderGeometry args={[1.2, 1.4, 0.5, 12]} />
        </mesh>
        <group ref={plate} position={[0, 0.55, 0]}>
          <mesh castShadow material={paintMat(PALETTE.coral, 0.45)}>
            <boxGeometry args={[pad.hx * 2, 0.3, pad.hz * 2]} />
          </mesh>
          {[-1, 0, 1].map((i) => (
            <mesh key={i} position={[i * pad.hx * 0.55, 0.17, 0]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.white, 0.9)}>
              <circleGeometry args={[0.8, 3, Math.PI / 2]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

// ------------------------------------------------------------------------------- jam + ruler

function JamAndRuler({ course, hw }: { course: Course; hw: number }) {
  const { jam, ruler } = course;
  const len = jam.z0 - jam.z1;
  const dx = ruler.x1 - ruler.x0;
  const rulerLen = Math.hypot(dx, len) + 2.5;
  // The ruler runs from (x0, z0) to (x1, z1): turn a box that's long in z to match.
  const yaw = Math.atan2(-dx, len);
  const ticks = useMemo(() => Array.from({ length: Math.floor(rulerLen / 2) - 1 }, (_, i) => -rulerLen / 2 + 2 + i * 2), [rulerLen]);
  return (
    <group>
      <mesh position={[0, 0.08, (jam.z0 + jam.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(JAM, 0.12)}>
        <planeGeometry args={[hw * 2, len]} />
      </mesh>
      {/* blobby edges so it reads as a spill, not a carpet */}
      {[-1, 1].map((end) =>
        [-0.75, -0.25, 0.25, 0.75].map((k) => (
          <mesh key={`${end}:${k}`} position={[k * hw, 0.075, end > 0 ? jam.z0 : jam.z1]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(JAM, 0.12)}>
            <circleGeometry args={[hw * 0.27, 14]} />
          </mesh>
        )),
      )}
      <group position={[(ruler.x0 + ruler.x1) / 2, 0, (jam.z0 + jam.z1) / 2]} rotation={[0, yaw, 0]}>
        <mesh position={[0, 0.11, 0]} receiveShadow material={woodMat(PALETTE.honey)}>
          <boxGeometry args={[ruler.half * 2, 0.16, rulerLen]} />
        </mesh>
        {ticks.map((z, i) => (
          <mesh key={z} position={[-ruler.half + (i % 5 === 0 ? 0.7 : 0.4), 0.2, z]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.ink, 0.8)}>
            <planeGeometry args={[i % 5 === 0 ? 1.4 : 0.8, 0.14]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// --------------------------------------------------------------------------------- snap jaws

/**
 * A clockwork trap: two toothed flaps hinged along the middle. Open, they lie flat and a toy can
 * walk across. They rattle as a warning, then clap up together into a wall.
 */
function SnapJaw({ jaw, get }: { jaw: Jaw; get: () => DashState }) {
  const near = useRef<THREE.Group>(null!);
  const far = useRef<THREE.Group>(null!);
  const plate = useRef<THREE.MeshStandardMaterial>(null!);
  const colours = useMemo(() => ({ open: new THREE.Color(PALETTE.toyBlue), warn: new THREE.Color(PALETTE.honey), shut: new THREE.Color(PALETTE.coral) }), []);
  useFrame((st) => {
    const s = get();
    const phase = jawPhase(jaw, s.t);
    const k = (((s.t + jaw.offsetMs) % jaw.periodMs) + jaw.periodMs) % jaw.periodMs;
    const shutAt = jaw.periodMs - JAW_SHUT_MS;
    let up = 0; // 0 = flaps flat on the floor, 1 = clapped together upright
    if (phase === 'shut') up = Math.min(1, (k - shutAt) / 50, (jaw.periodMs - k) / 180);
    else if (phase === 'warn') up = 0.07 + 0.1 * Math.abs(Math.sin(st.clock.elapsedTime * 34)) + 0.1 * ((k - (shutAt - JAW_WARN_MS)) / JAW_WARN_MS);
    const a = Math.max(0, up) * (Math.PI / 2 - 0.07);
    near.current.rotation.x = -a;
    far.current.rotation.x = a;
    plate.current.color.copy(colours[phase]);
  });
  const flap = paintMat(PALETTE.sage, 0.4, 0.3);
  const teeth = useMemo(() => {
    const n = Math.max(3, Math.round(jaw.hx / 0.9));
    return Array.from({ length: n }, (_, i) => -jaw.hx + ((i + 0.5) * jaw.hx * 2) / n);
  }, [jaw.hx]);
  // dir +1 is the flap on the near (+z) side of the hinge, −1 the far side.
  const half = (ref: React.RefObject<THREE.Group>, dir: 1 | -1) => (
    <group ref={ref} position={[0, 0.2, 0]}>
      <mesh position={[0, 0, (dir * jaw.hz) / 2]} castShadow material={flap}>
        <boxGeometry args={[jaw.hx * 2 - 0.1, 0.16, jaw.hz]} />
      </mesh>
      {teeth.map((x) => (
        <mesh key={x} position={[x, 0, dir * (jaw.hz + 0.22)]} rotation={[(dir * Math.PI) / 2, 0, 0]} material={paintMat(PALETTE.white, 0.4)}>
          <coneGeometry args={[0.32, 0.7, 4]} />
        </mesh>
      ))}
    </group>
  );
  return (
    <group position={[jaw.x, 0, jaw.z]}>
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[jaw.hx * 2, 0.12, jaw.hz * 2 + 0.6]} />
        <meshStandardMaterial ref={plate} roughness={0.6} />
      </mesh>
      {half(near, 1)}
      {half(far, -1)}
    </group>
  );
}
