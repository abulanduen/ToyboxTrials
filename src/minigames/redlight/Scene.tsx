/**
 * Red Light, Green Light — a felt runway laid along the long side of the table. At the far end
 * stands the Signalman, a tall clockwork referee on a turntable: back turned and green paddle up
 * on go, key ratcheting as it swings round (the tell), then facing the runway with its red paddle
 * up. The rail lamps and its beacon show the same signal for toys too far away to see its face.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { paintMat, feltMat, woodMat } from '../../scene/props';
import { matchBus } from '../session';
import type { MinigameSceneProps } from '../types';
import { ChaseCam, type ChaseShot } from '../shared/ChaseCam';
import { FinishGate } from '../shared/CourseBits';
import { Racer, type RacerView } from '../shared/Racer';
import { DEFAULT_CONFIG, shownCycle, type RlglState } from './rules';

/** Where the runway sits on the table: rules −z (forward) runs along world −x. */
const COURSE_POS: [number, number, number] = [-9, 0, -6];
const COURSE_ROT = Math.PI / 2;

const LANDSCAPE: ChaseShot = { height: 9.5, back: 23, ahead: 14, lookY: 4.6, followX: 0.6 };
const PORTRAIT: ChaseShot = { height: 17, back: 42, ahead: 18, lookY: 5, followX: 0.85 };

/** Signal colours: the palette's sage / honey / coral, pushed brighter for the lamps. */
const lamp = (c: string) => `#${new THREE.Color(c).offsetHSL(0, 0.3, 0).getHexString()}`;
const SIGNAL = { go: lamp(PALETTE.sage), warn: lamp(PALETTE.honey), stop: lamp(PALETTE.coral) } as const;
const signalOf = (s: RlglState | null) => (!s || s.phase === 'intro' || s.phase === 'stop' || s.phase === 'over' ? SIGNAL.stop : s.phase === 'warn' ? SIGNAL.warn : SIGNAL.go);

const smooth = (k: number) => k * k * (3 - 2 * k);

export function RlglScene({ getState: rawState, contestants, localId }: MinigameSceneProps<RlglState>) {
  // In a tournament the host still holds the previous trial's state while this trial's intro card
  // is up, so only accept a state that is really ours.
  const getState = useCallback(() => {
    const s = rawState() as RlglState | null;
    return s && 'cycles' in s ? s : null;
  }, [rawState]);
  const course = useRef<THREE.Group>(null);
  const swat = useRef(-99); // clock time of the last catch (the Signalman lunges)
  // This warning's length, from the 'warn' event: online the light timings (`cycles`) are hidden
  // from clients, so the Scene must not read them (it threw every frame of the turn and froze the
  // screen until red).
  const warnMs = useRef(0);
  // Before the first countdown there is no state yet: show the empty runway from the start line.
  const cfg = getState()?.config ?? DEFAULT_CONFIG;

  useEffect(
    () =>
      matchBus.on('event', (e) => {
        switch (e.type) {
          case 'go':
            sfx.signalGo();
            break;
          case 'warn':
            warnMs.current = e.ms as number;
            sfx.signalWarn(e.ms as number);
            break;
          case 'stop':
            sfx.signalStop();
            break;
          case 'caught':
            swat.current = performance.now();
            sfx.flick();
            if (e.id === localId) window.setTimeout(() => sfx.reject(), 260);
            break;
          case 'finish':
            if (e.id === localId) sfx.finishLine();
            else sfx.promptIn();
            break;
        }
      }),
    [localId],
  );

  const views = useMemo(() => {
    const out = new Map<string, () => RacerView | null>();
    for (const c of contestants) {
      const v: RacerView = { m: null as never, tossK: -1, tossH: 9, dizzy: false, cheer: false, down: 0 };
      out.set(c.id, () => {
        const s = getState();
        const p = s?.players.find((x) => x.id === c.id);
        if (!s || !p) return null;
        v.m = p.m;
        v.tossK = -1;
        // Knocked out: topples over where it was caught (on the shown clock, so it falls smoothly online too).
        v.down = p.out ? Math.min(1, Math.max(0, s.t - p.outT) / 420) : 0;
        v.dizzy = false;
        v.cheer = p.finished;
        return v;
      });
    }
    return out;
  }, [contestants, getState]);

  const length = cfg.startZ - cfg.finishZ;
  const midZ = (cfg.startZ + cfg.finishZ) / 2;
  const refZ = cfg.finishZ - 9.6;

  return (
    <group ref={course} position={COURSE_POS} rotation={[0, COURSE_ROT, 0]}>
      <ChaseCam
        frame={course}
        target={() => {
          const p = getState()?.players.find((x) => x.id === localId);
          return p ? { x: p.m.x, y: 0, z: p.m.z } : { x: 0, y: 0, z: cfg.startZ };
        }}
        landscape={LANDSCAPE}
        portrait={PORTRAIT}
        maxX={cfg.halfWidth - 4}
      />
      <Runway halfWidth={cfg.halfWidth} startZ={cfg.startZ} finishZ={cfg.finishZ} length={length} midZ={midZ} />
      <RailLamps getState={getState} halfWidth={cfg.halfWidth} startZ={cfg.startZ} finishZ={cfg.finishZ} />
      <group position={[0, 0, refZ]}>
        <Signalman getState={getState} swat={swat} warnMs={warnMs} />
      </group>
      {contestants.map((c) => (
        <Racer key={c.id} c={c} view={views.get(c.id)!} />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------------------------ runway

function Runway({ halfWidth, startZ, finishZ, length, midZ }: { halfWidth: number; startZ: number; finishZ: number; length: number; midZ: number }) {
  const w = halfWidth * 2;
  // Tenth-of-the-way marks painted across the felt.
  const marks = useMemo(() => Array.from({ length: 9 }, (_, i) => startZ - ((i + 1) * length) / 10), [startZ, length]);
  const guards = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < 6; i++) for (const side of [-1, 1]) out.push({ x: side * (halfWidth + 4.2), z: startZ - 8 - i * (length / 6) });
    return out;
  }, [halfWidth, startZ, length]);
  return (
    <group>
      {/* felt runner, with room behind the start and past the finish for the Signalman */}
      <mesh position={[0, 0.05, midZ - 6.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={feltMat(PALETTE.feltDark)}>
        <planeGeometry args={[w + 5, length + 27]} />
      </mesh>
      {marks.map((z, i) => (
        <mesh key={z} position={[0, 0.09, z]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.cream, 0.9)}>
          <planeGeometry args={[w - 1, i === 4 ? 0.7 : 0.3]} />
        </mesh>
      ))}
      {/* start line */}
      <mesh position={[0, 0.1, startZ - 1.4]} rotation={[-Math.PI / 2, 0, 0]} material={paintMat(PALETTE.white, 0.9)}>
        <planeGeometry args={[w, 0.9]} />
      </mesh>
      <FinishGate z={finishZ} halfWidth={halfWidth} />
      {/* wooden kerbs */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (halfWidth + 1), 0.5, midZ - 1.5]} castShadow receiveShadow material={woodMat(PALETTE.woodLight)}>
          <boxGeometry args={[1.2, 1, length + 11]} />
        </mesh>
      ))}
      {/* peg guards lining the runway */}
      {guards.map((g) => (
        <group key={`${g.x}:${g.z}`} position={[g.x, 0, g.z]}>
          <mesh position={[0, 1.5, 0]} castShadow material={paintMat(PALETTE.coral, 0.5)}>
            <cylinderGeometry args={[0.75, 0.95, 3, 10]} />
          </mesh>
          <mesh position={[0, 3.55, 0]} material={paintMat(PALETTE.cream, 0.5)}>
            <sphereGeometry args={[0.7, 10, 8]} />
          </mesh>
          <mesh position={[0, 4.6, 0]} material={paintMat(PALETTE.ink, 0.6)}>
            <cylinderGeometry args={[0.55, 0.6, 1.3, 10]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Signal lamps along both kerbs: one instanced mesh, one material whose colour is the signal. */
function RailLamps({ getState, halfWidth, startZ, finishZ }: { getState: () => RlglState | null; halfWidth: number; startZ: number; finishZ: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const mat = useRef<THREE.MeshBasicMaterial>(null!);
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    const n = 14;
    for (let i = 0; i <= n; i++) for (const side of [-1, 1]) out.push([side * (halfWidth + 1), startZ + 2 - (i * (startZ - finishZ + 2)) / n]);
    return out;
  }, [halfWidth, startZ, finishZ]);
  useEffect(() => {
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => mesh.current.setMatrixAt(i, m4.makeTranslation(x, 1.45, z)));
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame((st) => {
    const s = getState();
    col.set(signalOf(s));
    // The tell flickers so it reads even in peripheral vision.
    if (s?.phase === 'warn' && Math.sin(st.clock.elapsedTime * 30) > 0) col.multiplyScalar(0.55);
    mat.current.color.copy(col);
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, spots.length]} frustumCulled={false}>
      <sphereGeometry args={[0.6, 10, 8]} />
      <meshBasicMaterial ref={mat} toneMapped={false} />
    </instancedMesh>
  );
}

// --------------------------------------------------------------------------------- Signalman

/** The referee. Its front is +z (towards the start line) at yaw 0. */
function Signalman({ getState, swat, warnMs }: { getState: () => RlglState | null; swat: React.RefObject<number>; warnMs: React.RefObject<number> }) {
  const turn = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const key = useRef<THREE.Group>(null!);
  const armGo = useRef<THREE.Group>(null!);
  const armStop = useRef<THREE.Group>(null!);
  const beacon = useRef<THREE.MeshBasicMaterial>(null!);
  const eye = useRef<THREE.MeshBasicMaterial>(null!);
  const pose = useRef({ go: 0, stop: 1 });
  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const s = getState();
    if (!s) return;
    const t = st.clock.elapsedTime;
    // Facing comes straight from the rules clock, so the turn always ends exactly on red.
    let yaw = 0;
    let wind = 0;
    if (s.phase === 'go') yaw = Math.PI * smooth(Math.min(1, s.phaseT / 280));
    else if (s.phase === 'warn') {
      // Locally the timings are known; online (hidden) the 'warn' event's length, else the middle of the range.
      const ms = shownCycle(s)?.warnMs ?? (warnMs.current || (s.config.warnMs[0] + s.config.warnMs[1]) / 2);
      const k = Math.min(1, s.phaseT / ms);
      // Shudder on the spot first, then whip round in the last 60%.
      yaw = Math.PI * (1 - smooth(Math.max(0, (k - 0.4) / 0.6)));
      wind = 1;
    }
    turn.current.rotation.y = yaw;
    turn.current.rotation.z = wind ? Math.sin(t * 46) * 0.035 : 0;
    key.current.rotation.z += dt * (wind ? 22 : s.phase === 'go' ? 3 : 0);
    // Scanning head on red; a lunge when it catches someone.
    const since = (performance.now() - swat.current) / 1000;
    const lunge = since < 0.5 ? Math.sin((since / 0.5) * Math.PI) : 0;
    head.current.rotation.y = s.phase === 'stop' ? Math.sin(s.phaseT * 0.0032) * 0.5 : 0;
    turn.current.position.y = lunge * 0.8;
    turn.current.rotation.x = lunge * 0.22;
    const p = pose.current;
    const e = 1 - Math.exp(-14 * dt);
    p.go += ((s.phase === 'go' ? 1 : 0) - p.go) * e;
    p.stop += ((s.phase === 'stop' || s.phase === 'intro' || s.phase === 'over' ? 1 : 0) - p.stop) * e;
    armGo.current.rotation.z = -0.35 - p.go * 2.3;
    armStop.current.rotation.z = 0.35 + p.stop * 2.3 + lunge * 0.4;
    beacon.current.color.set(signalOf(s));
    eye.current.color.set(signalOf(s));
  });
  const tin = paintMat(PALETTE.inkPurple, 0.45, 0.25);
  const brass = paintMat(PALETTE.brass, 0.32, 0.85);
  return (
    <group scale={1.7}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow material={brass}>
        <cylinderGeometry args={[4.4, 4.8, 1, 24]} />
      </mesh>
      <group ref={turn}>
        {/* body */}
        <mesh position={[0, 5, 0]} castShadow material={tin}>
          <cylinderGeometry args={[2.3, 3.7, 8, 20]} />
        </mesh>
        <mesh position={[0, 2.2, 0]} rotation={[Math.PI / 2, 0, 0]} material={paintMat(PALETTE.honey, 0.5)}>
          <torusGeometry args={[3.45, 0.32, 8, 24]} />
        </mesh>
        {[3.6, 5.2, 6.8].map((y) => (
          <mesh key={y} position={[0, y, 3.25 - (y - 3.6) * 0.17]} material={brass}>
            <sphereGeometry args={[0.32, 8, 6]} />
          </mesh>
        ))}
        {/* arms with signal paddles: green on its right, red on its left */}
        <group ref={armGo} position={[-2.5, 8.2, 0]}>
          <mesh position={[0, -1.9, 0]} material={tin}>
            <cylinderGeometry args={[0.42, 0.42, 3.8, 8]} />
          </mesh>
          <mesh position={[0, -4.6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow material={paintMat(SIGNAL.go, 0.45)}>
            <cylinderGeometry args={[1.9, 1.9, 0.35, 20]} />
          </mesh>
        </group>
        <group ref={armStop} position={[2.5, 8.2, 0]}>
          <mesh position={[0, -1.9, 0]} material={tin}>
            <cylinderGeometry args={[0.42, 0.42, 3.8, 8]} />
          </mesh>
          <mesh position={[0, -4.6, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow material={paintMat(SIGNAL.stop, 0.45)}>
            <cylinderGeometry args={[1.9, 1.9, 0.35, 8]} />
          </mesh>
        </group>
        {/* head: one big lantern eye, peaked cap, beacon on top */}
        <group ref={head} position={[0, 10.9, 0]}>
          <mesh castShadow material={paintMat(PALETTE.cream, 0.45)}>
            <sphereGeometry args={[2.35, 20, 14]} />
          </mesh>
          <mesh position={[0, 0.1, 2.05]} rotation={[Math.PI / 2, 0, 0]} material={paintMat(PALETTE.ink, 0.5)}>
            <cylinderGeometry args={[1.35, 1.35, 0.6, 20]} />
          </mesh>
          <mesh position={[0, 0.1, 2.25]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[1.05, 1.05, 0.5, 20]} />
            <meshBasicMaterial ref={eye} toneMapped={false} />
          </mesh>
          <mesh position={[0, 1.75, 0]} castShadow material={paintMat(PALETTE.toyBlue, 0.5)}>
            <cylinderGeometry args={[2.2, 2.5, 1.3, 20]} />
          </mesh>
          <mesh position={[0, 1.25, 2.3]} material={paintMat(PALETTE.ink, 0.5)}>
            <boxGeometry args={[3.4, 0.25, 1.6]} />
          </mesh>
          <mesh position={[0, 2.9, 0]}>
            <sphereGeometry args={[1.0, 14, 10]} />
            <meshBasicMaterial ref={beacon} toneMapped={false} />
          </mesh>
        </group>
        {/* wind-up key on its back: the tell */}
        <group position={[0, 5.6, -3.3]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.5]} material={brass}>
            <cylinderGeometry args={[0.22, 0.22, 1.4, 8]} />
          </mesh>
          <group ref={key} position={[0, 0, -0.3]}>
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[sx * 0.95, 0, 0]} material={brass}>
                <torusGeometry args={[0.85, 0.24, 8, 16]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}
