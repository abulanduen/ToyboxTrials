/**
 * Wind-Up Dash — a strip of dark felt road along the table that bends, narrows and widens,
 * dressed with whichever traps the match seed dealt (see `course.ts`) and a chequered finish.
 * Everything is driven by the rules state; the trap models live in `Traps.tsx`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx } from '../../game/audio';
import { feltMat, paintMat, woodMat } from '../../scene/props';
import { matchBus } from '../session';
import type { MinigameSceneProps } from '../types';
import { ChaseCam, type ChaseShot } from '../shared/ChaseCam';
import { FinishGate } from '../shared/CourseBits';
import { Racer, type RacerView } from '../shared/Racer';
import { START_HW, roadCx, roadHw, type Course } from './course';
import { dashRules, type DashState } from './rules';
import { Clutter, DominoRows, GEO, Inst, TrapView, type InstItem } from './Traps';

/** Centred on the table (it is 160 cm long): rules −z (forward) runs along world −x. */
const COURSE_POS: [number, number, number] = [0, 0, -6];
const COURSE_ROT = Math.PI / 2;

// Steeper than the Red Light camera: the toy must stay visible just past a row of dominoes, and
// the next trap has to be readable before the toy reaches it.
const LANDSCAPE: ChaseShot = { height: 13, back: 17, ahead: 11, lookY: 2.2, followX: 0.7 };
const PORTRAIT: ChaseShot = { height: 21, back: 29, ahead: 14, lookY: 3, followX: 0.9 };

export function DashScene({ getState: rawState, contestants, localId }: MinigameSceneProps<DashState>) {
  // In a tournament the host still holds the previous trial's state while this trial's intro card
  // is up, so only accept a state that is really ours.
  const getState = useCallback(() => {
    const s = rawState() as DashState | null;
    return s && 'course' in s && 'dominoes' in s ? s : null;
  }, [rawState]);
  const frame = useRef<THREE.Group>(null);
  const padHit = useRef(-99);
  // Before the first countdown there's no state: show a sample course so the table isn't bare.
  const preview = useMemo(() => dashRules.init([], 1), []);
  const get = useCallback(() => getState() ?? preview, [getState, preview]);
  // The course is rebuilt when a new match deals a new one (a one-off render, never per frame).
  const [course, setCourse] = useState<Course>(() => get().course);
  useFrame(() => {
    const now = get().course;
    if (now !== course) setCourse(now);
  });

  useEffect(
    () =>
      matchBus.on('event', (e) => {
        const mine = e.id === localId;
        const s = getState();
        const me = s?.players.find((p) => p.id === localId);
        /** Traps tick away all down the course: only the ones near the player are heard. */
        const near = (z: number) => !me || Math.abs(z - me.m.z) < 26;
        switch (e.type) {
          case 'start':
            sfx.signalGo();
            break;
          case 'domino':
            if (!s || near(s.dominoes[e.index as number]?.z ?? 0)) sfx.dominoClack();
            break;
          case 'spring':
            padHit.current = performance.now();
            sfx.flick();
            break;
          case 'jaw-shut': {
            const jaw = s?.course.sections.flatMap((q) => (q.kind === 'jaws' ? q.jaws : [])).find((j) => j.id === e.jaw);
            if (!jaw || near(jaw.z)) sfx.trapSnap(0.5);
            break;
          }
          case 'crayon-shut': {
            const row = s?.course.sections.flatMap((q) => (q.kind === 'crayons' ? q.rows : [])).find((r) => r.id === e.row);
            if (!row || near(row.z)) sfx.tick();
            break;
          }
          case 'snap':
            if (mine) {
              sfx.trapSnap(1);
              window.setTimeout(() => sfx.reject(), 120);
            }
            break;
          case 'bonk':
            if (mine) {
              sfx.knock();
              window.setTimeout(() => sfx.reject(), 120);
            } else sfx.bump();
            break;
          case 'bump':
            if (mine) sfx.pop();
            break;
          case 'finish':
            if (mine) sfx.finishLine();
            else sfx.promptIn();
            break;
        }
      }),
    [localId, getState],
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
        v.tossK = p.toss ? Math.min(1, p.toss.t / p.toss.ms) : -1;
        v.tossH = p.toss ? p.toss.h : 7.5;
        v.dizzy = p.stunMs > 0;
        v.cheer = p.finished;
        return v;
      });
    }
    return out;
  }, [contestants, getState]);

  const maxX = useMemo(() => Math.max(...course.road.map((p) => Math.abs(p.cx) + p.hw)) - 3, [course]);

  return (
    <group ref={frame} position={COURSE_POS} rotation={[0, COURSE_ROT, 0]}>
      <ChaseCam
        frame={frame}
        target={() => {
          const p = getState()?.players.find((x) => x.id === localId);
          return p ? { x: p.m.x, y: 0, z: p.m.z } : { x: 0, y: 0, z: course.startZ };
        }}
        landscape={LANDSCAPE}
        portrait={PORTRAIT}
        maxX={maxX}
      />
      <OverviewCam frame={frame} course={course} />
      <CourseView key={course.seed} course={course} get={get} padHit={padHit} />
      {contestants.map((c) => (
        <Racer key={c.id} c={c} view={views.get(c.id)!} />
      ))}
    </group>
  );
}

/** Everything that depends on the course: remounted when a new course is dealt. */
function CourseView({ course, get, padHit }: { course: Course; get: () => DashState; padHit: React.RefObject<number> }) {
  return (
    <group>
      <Road course={course} />
      <mesh geometry={GEO.plane} position={[0, 0.1, course.startZ - 1.4]} scale={[START_HW * 2, 1, 0.9]} material={paintMat(PALETTE.white, 0.9)} />
      <group position={[roadCx(course, course.finishZ), 0, 0]}>
        <FinishGate z={course.finishZ} halfWidth={roadHw(course, course.finishZ)} />
      </group>
      <DominoRows get={get} />
      {course.sections.map((sec) => (
        <TrapView key={sec.index} sec={sec} get={get} padHit={padHit} />
      ))}
      <Clutter decor={course.decor} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------- road

/** The felt strip (one mesh that follows the road outline) and its wooden kerbs (one instanced mesh). */
function Road({ course }: { course: Course }) {
  const felt = useMemo(() => {
    const pts = course.road;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      // The road's first and last points sit a little inside the mat, as on the old fixed track.
      const z = i === 0 ? p.z + 3 : i === pts.length - 1 ? p.z - 3 : p.z;
      for (const side of [-1, 1]) {
        const x = p.cx + side * (p.hw + 1.6);
        pos.push(x, 0.05, z);
        uv.push(x / 24, z / 24);
      }
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [course]);
  useEffect(() => () => felt.dispose(), [felt]);
  const kerbs = useMemo(() => {
    const out: InstItem[] = [];
    const pts = course.road;
    for (let i = 1; i < pts.length; i++)
      for (const side of [-1, 1]) {
        const ax = pts[i - 1].cx + side * (pts[i - 1].hw + 1);
        const bx = pts[i].cx + side * (pts[i].hw + 1);
        const dz = pts[i].z - pts[i - 1].z;
        out.push({ x: (ax + bx) / 2, y: 0.5, z: (pts[i - 1].z + pts[i].z) / 2, ry: Math.atan2(bx - ax, dz), sx: 1.2, sy: 1, sz: Math.hypot(bx - ax, dz) + 0.5 });
      }
    return out;
  }, [course]);
  return (
    <group>
      <mesh geometry={felt} receiveShadow material={feltMat(PALETTE.inkPurple)} />
      <Inst geo={GEO.box} mat={woodMat(PALETTE.woodLight)} items={kerbs} />
    </group>
  );
}

// ------------------------------------------------------------------------------------- cameras

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * Test aid: with `?debug`, setting `window.__toybox.dashCam = 'overview'` swaps the chase camera
 * for a high side view of the whole course (used for the e2e screenshots). Play never needs it.
 */
function OverviewCam({ frame, course }: { frame: React.RefObject<THREE.Group | null>; course: Course }) {
  const { camera, size } = useThree();
  // After the chase camera (same priority, mounted later), so this one wins while it is on.
  useFrame(() => {
    const hook = (window as unknown as { __toybox?: { dashCam?: string } }).__toybox;
    const f = frame.current;
    if (!f || hook?.dashCam !== 'overview') return;
    const mid = (course.startZ + course.finishZ) / 2;
    const wide = size.width >= size.height;
    f.updateWorldMatrix(true, false);
    _pos.set(wide ? 64 : 110, wide ? 74 : 150, mid);
    _look.set(0, 0, mid);
    f.localToWorld(_pos);
    f.localToWorld(_look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
  });
  return null;
}
