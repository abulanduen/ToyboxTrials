/**
 * Find the Original — a wooden tray of look-alike wind-up gentlemen seen from above and in front,
 * and a reference card with the real Baldwyn that stays in the corner of the screen.
 *
 * The crowd is instanced (one InstancedMesh per body part; parts nobody in the round has are
 * hidden). The reference card is drawn on its own crisp canvas over this one (card.ts), so the
 * scene's post-processing and resolution tier never blur it. Picking is done in screen space: every
 * frame the toys' on-screen positions are published to `local.ts`, and a tap/click picks the nearest
 * toy within a finger-sized radius, so targets stay usable on a phone however small the toys are.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../game/palette';
import { sfx, unlockAudio } from '../../game/audio';
import { exposeDebug } from '../../game/debug';
import { paintMat, woodMat } from '../../scene/props';
import { matchBus, useMatch } from '../session';
import type { MinigameSceneProps } from '../types';
import { originalIndex, toyPose, type FindState, type Toy } from './rules';
import { PARTS, TOY_HEIGHT, TOY_MID, instancedMaterial, partsUsed } from './figure';
import { MAX_TOYS, crowd, cursor, resetLocal, submitPick, toyAt } from './local';
import { ReferenceCard } from './card';
import './findoriginal.css';

/** Spot size on the tray (cm): across and front-to-back. */
const CU = 5.6;
const CV = 6.2;
const BASE_Y = 0.7;
/** Thickness of the tray's rim. */
const RIM = 0.9;
const ELEV = (44 * Math.PI) / 180;
/** Narrow lens from far away, so far rows are nearly as big as near ones. */
const FOV = 16;
/** Never come closer than this (cm): small crowds would otherwise get a wide-angle look and hide each other. */
const MIN_DIST = 72;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Where things go on screen (CSS px): the small reference card, the big one shown before each
 * round, and the area left for the crowd. Mirrors the HUD's CSS (see "Find the Original" in styles.css).
 */
export function screenLayout(w: number, h: number, inset = { left: 0, right: 0, top: 0, bottom: 0 }) {
  const portrait = h > w;
  const short = !portrait && h < 520;
  const top = inset.top + (portrait ? 124 : short ? 62 : 112);
  let card: { cx: number; cy: number; h: number };
  let area: Rect;
  if (portrait) {
    const ch = clamp(h * 0.17, 124, 170);
    card = { cx: inset.left + 12 + ch * 0.4, cy: top + ch / 2, h: ch };
    area = { x0: inset.left + 6, x1: w - inset.right - 6, y0: top + ch + 10, y1: h - inset.bottom - 14 };
  } else if (short) {
    // Phones in landscape: height is what limits the crowd, so the HUD sits in the left column
    // above the reference card and the crowd gets (almost) the full height — keeps the final
    // round's toys ≥ 56 px apart.
    const ch = clamp(h * 0.34, 120, 230);
    area = { x0: inset.left + 14 + ch * 0.8 + 12, x1: w - inset.right - 150, y0: inset.top + 10, y1: h - inset.bottom - 8 };
    card = { cx: inset.left + 14 + ch * 0.4, cy: h - inset.bottom - 10 - ch / 2, h: ch };
  } else {
    const ch = clamp(h * 0.36, 130, 230);
    area = { x0: inset.left + 14 + ch * 0.8 + 12, x1: w - inset.right - 150, y0: top, y1: h - inset.bottom - 12 };
    card = { cx: inset.left + 14 + ch * 0.4, cy: (area.y0 + area.y1) / 2, h: ch };
  }
  const bh = Math.min(h * 0.5, w * 0.8, 430);
  const big = { cx: w / 2, cy: top + (h - top - inset.bottom) / 2 - 10, h: bh };
  return { portrait, card, big, area };
}

/** Safe-area insets in px (notches), read once from CSS and refreshed on resize. */
function readInsets() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return out;
}

const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

const GREY = new THREE.Color('#A39CA6');
const tmpColor = new THREE.Color();
const mBase = new THREE.Matrix4();
const mPart = new THREE.Matrix4();
const mOut = new THREE.Matrix4();
const vPos = new THREE.Vector3();
const vScale = new THREE.Vector3();
const qRot = new THREE.Quaternion();
const eRot = new THREE.Euler();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const pose = { u: 0, v: 0, yaw: 0 };

export function FindScene({ getState, localId }: MinigameSceneProps<FindState>) {
  const { camera, size, gl, clock } = useThree();
  const insets = useMemo(() => readInsets(), [size.width, size.height]);

  /** Render-only reactions to the local player's picks (seconds on the render clock; -1 = none). */
  const fx = useRef({ wrongAt: new Float32Array(MAX_TOYS).fill(-1), foundAt: -1, revealAt: -1 });
  /** Smoothed camera framing and card placement. */
  const view = useRef({ d: 0, target: new THREE.Vector3(), tray: new THREE.Vector2(20, 14), card: { cx: 0, cy: 0, h: 0, show: 0 } });

  // ---- instanced crowd ----
  const meshes = useMemo(() => {
    const mats = { paint: instancedMaterial('paint'), brass: instancedMaterial('brass') };
    return PARTS.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geo, mats[part.mat], MAX_TOYS);
      mesh.count = 0;
      mesh.frustumCulled = false; // instances move; the base bounding sphere means nothing
      mesh.castShadow = !part.small;
      mesh.visible = false;
      mesh.setColorAt(0, GREY); // allocate the colour buffer up front
      return mesh;
    });
  }, []);
  /** The parts this round's crowd uses (recomputed when a new crowd arrives). */
  const active = useRef<{ toys: Toy[] | null; parts: number[] }>({ toys: null, parts: [] });
  const shadows = useMemo(() => {
    const mesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1.7, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#3A2A1E', transparent: true, opacity: 0.2, depthWrite: false, fog: false }),
      MAX_TOYS,
    );
    mesh.count = 0;
    mesh.frustumCulled = false;
    return mesh;
  }, []);
  useEffect(
    () => () => {
      for (const m of meshes) m.dispose();
      (meshes[0].material as THREE.Material).dispose();
      (meshes.find((m) => m.material !== meshes[0].material)?.material as THREE.Material | undefined)?.dispose();
      shadows.geometry.dispose();
      (shadows.material as THREE.Material).dispose();
      shadows.dispose();
    },
    [meshes, shadows],
  );

  const tray = useRef<THREE.Group>(null!);
  const trayMats = useMemo(() => ({ board: paintMat('#E9D9B8', 0.9), rim: woodMat(PALETTE.woodDark) }), []);
  const foundRing = useRef<THREE.Group>(null!);
  const cursorRing = useRef<THREE.Group>(null!);

  // ---- reference card (its own canvas over this one) ----
  const card = useRef<ReferenceCard | null>(null);
  useEffect(() => {
    const c = new ReferenceCard(gl.domElement.parentElement!, ELEV);
    card.current = c;
    return () => {
      card.current = null;
      c.dispose();
    };
  }, [gl]);

  // ---- events: sounds and local reactions ----
  useEffect(() => {
    resetLocal();
    const off = matchBus.on('event', (e) => {
      const now = clock.elapsedTime;
      switch (e.type) {
        case 'round-start':
          fx.current.wrongAt.fill(-1);
          fx.current.foundAt = -1;
          fx.current.revealAt = -1;
          cursor.index = -1;
          sfx.windUp(5);
          break;
        case 'search':
          sfx.promptIn();
          break;
        case 'found':
          if (e.id === localId) {
            fx.current.foundAt = now;
            sfx.spotted();
          } else sfx.tick();
          break;
        case 'hurry':
          if (!getState()?.players.find((p) => p.id === localId)?.found) sfx.knock();
          break;
        case 'wrong':
          if (e.id === localId) {
            fx.current.wrongAt[e.toy as number] = now;
            sfx.reject();
            sfx.windDown();
          }
          break;
        case 'unlock':
          if (e.id === localId) sfx.click();
          break;
        case 'reveal':
          fx.current.revealAt = now;
          if (fx.current.foundAt < 0) sfx.bell(undefined, 0.1);
          break;
      }
    });
    return () => {
      off();
      resetLocal();
    };
  }, [clock, localId, getState]);

  // ---- picking: taps and clicks on the canvas ----
  useEffect(() => {
    const el = gl.domElement;
    const at = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return toyAt(e.clientX - r.left, e.clientY - r.top);
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || !crowd.open || useMatch.getState().paused) return;
      unlockAudio();
      const i = at(e);
      if (i < 0) return;
      // Wound down: the rules will ignore this pick, so say so with a dull knock.
      if ((getState()?.players.find((p) => p.id === localId)?.lockMs ?? 0) > 0) sfx.bump();
      cursor.index = e.pointerType === 'mouse' ? i : -1;
      submitPick(i);
    };
    // A mouse gets a ring under the toy it is over (touch needs no hover: the tap is the pick).
    // Browsers re-send "moves" for a resting mouse when the page changes under it; only real
    // movement counts, or a parked mouse would keep stealing the ring from the keyboard.
    let lastX = -1;
    let lastY = -1;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || (e.clientX === lastX && e.clientY === lastY)) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (crowd.open) cursor.index = at(e);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
    };
  }, [gl, getState, localId]);

  useEffect(() => {
    exposeDebug({
      find: {
        /** On-screen targets (CSS px) and which one is the original: for the e2e tests only. */
        crowd: () => Array.from({ length: crowd.count }, (_, i) => ({ x: crowd.x[i], y: crowd.y[i], r: crowd.r[i] })),
        original: () => {
          const s = getState();
          return s ? originalIndex(s) : -1;
        },
        open: () => crowd.open,
        cursor: () => cursor.index,
        /** This match's Baldwyn (slot → option index) and the card's on-screen state. */
        baldwyn: () => getState()?.baldwyn ?? null,
        card: () => card.current?.info() ?? null,
        layout: () => screenLayout(size.width, size.height, insets),
      },
    });
  }, [getState, size, insets]);

  useFrame((_, rawDt) => {
    const s = getState();
    const now = clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    const W = size.width;
    const H = size.height;
    const lay = screenLayout(W, H, insets);
    const spec = s?.spec ?? { cols: 3, rows: 2 };
    // Portrait screens get the grid turned on its side: more rows, fewer columns.
    const nx = lay.portrait ? spec.rows : spec.cols;
    const nz = lay.portrait ? spec.cols : spec.rows;

    // ---- camera: fit the crowd into the free area of the screen ----
    if (Math.abs(cam.fov - FOV) > 0.01) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
    const tanHalf = Math.tan((FOV * Math.PI) / 360);
    const sinE = Math.sin(ELEV);
    const cosE = Math.cos(ELEV);
    const aw = Math.max(40, lay.area.x1 - lay.area.x0);
    const ah = Math.max(40, lay.area.y1 - lay.area.y0);
    const projW = nx * CU;
    // When the width is what limits the zoom (tall phones), spread the rows out to use the spare
    // height: more room between toys front-to-back, so they hide each other less.
    const wppWide = Math.max(projW / (aw * 0.96), (MIN_DIST * 2 * tanHalf) / H);
    const cv = clamp((ah * 0.94 * wppWide - TOY_HEIGHT * cosE) / (nz * sinE), CV, CV * 1.45);
    const projH = nz * cv * sinE + TOY_HEIGHT * cosE;
    let wpp = Math.max(wppWide, projH / (ah * 0.94));
    let d = (wpp * H) / (2 * tanHalf);
    wpp *= 1 + (nz * cv * 0.5 * cosE) / d; // the nearest row is a little bigger than the middle one
    d = (wpp * H) / (2 * tanHalf);
    const ox = (lay.area.x0 + lay.area.x1) / 2 - W / 2;
    const oy = (lay.area.y0 + lay.area.y1) / 2 - H / 2;
    const upC = (TOY_HEIGHT * cosE) / 2 + oy * wpp; // along the camera's up vector (0, cosE, -sinE)
    v1.set(-ox * wpp, BASE_Y + upC * cosE, -upC * sinE);
    const vw = view.current;
    const smoothDt = Math.min(rawDt, 0.3); // easing must still land on time at very low frame rates
    const k = vw.d === 0 ? 1 : 1 - Math.exp(-smoothDt * 7);
    vw.d += (d - vw.d) * k;
    vw.target.lerp(v1, k);
    cam.position.set(vw.target.x, vw.target.y + sinE * vw.d, vw.target.z + cosE * vw.d);
    cam.lookAt(vw.target);
    cam.updateMatrixWorld();

    // ---- tray ----
    vw.tray.x += (nx * CU + 2.5 - vw.tray.x) * k;
    vw.tray.y += (nz * cv + 2.5 - vw.tray.y) * k;
    const tw = vw.tray.x;
    const td = vw.tray.y;
    const [board, rimL, rimR, rimF, rimB] = tray.current.children;
    board.scale.set(tw, 1, td);
    rimL.position.x = -(tw / 2 + RIM / 2);
    rimR.position.x = tw / 2 + RIM / 2;
    rimL.scale.z = rimR.scale.z = td + RIM * 2;
    rimB.position.z = -(td / 2 + RIM / 2);
    rimF.position.z = td / 2 + RIM / 2;
    rimF.scale.x = rimB.scale.x = tw;

    // ---- crowd ----
    const n = s ? Math.min(MAX_TOYS, s.toys.length) : 0;
    const me = s?.players.find((p) => p.id === localId);
    const phase = s?.phase ?? 'intro';
    const shown = phase === 'search' || phase === 'reveal' || phase === 'over';
    const revealed = phase === 'reveal' || phase === 'over';
    const target = s && (revealed || me?.found) ? originalIndex(s) : -1;
    const f = fx.current;
    crowd.count = shown ? n : 0;
    crowd.open = phase === 'search' && !!me && !me.found;
    const act = active.current;
    if (s && s.toys !== act.toys) {
      act.toys = s.toys;
      act.parts = partsUsed(s.toys.map((t) => t.look));
      meshes.forEach((m, p) => (m.visible = act.parts.includes(p)));
    }
    let ringX = 0;
    let ringZ = 0;
    let curX = 0;
    let curZ = 0;
    for (let i = 0; i < n && s && shown; i++) {
      const toy = s.toys[i];
      toyPose(s, i, pose);
      const x = ((lay.portrait ? pose.v : pose.u) - nx / 2) * CU;
      const z = ((lay.portrait ? pose.u : pose.v) - nz / 2) * cv;
      let scale = phase === 'search' ? easeOutBack(clamp((s.searchT - i * 16) / 280, 0, 1)) : 1;
      let squash = 1;
      let y = BASE_Y;
      let yaw = pose.yaw;
      let grey = 0;
      const wrongAge = f.wrongAt[i] >= 0 ? now - f.wrongAt[i] : -1;
      if (wrongAge >= 0) {
        // "Not me!": a quick head-shake, then the decoy slumps and goes grey.
        yaw += Math.sin(wrongAge * 38) * 0.45 * Math.exp(-wrongAge * 5);
        squash = 1 - 0.22 * clamp(wrongAge / 0.3, 0, 1);
        grey = 0.8 * clamp(wrongAge / 0.3, 0, 1);
      }
      if (i === target) {
        const age = now - (f.foundAt >= 0 ? f.foundAt : f.revealAt);
        y += Math.abs(Math.sin(age * 7.5)) * 0.9 * (0.35 + 0.65 * Math.exp(-age * 0.9));
        scale *= 1.12;
        ringX = x;
        ringZ = z;
      } else if (revealed) {
        const a = clamp((now - f.revealAt) / 0.35, 0, 1);
        scale *= 1 - 0.14 * a;
        grey = Math.max(grey, 0.6 * a);
      }
      if (i === cursor.index) {
        curX = x;
        curZ = z;
      }
      mBase.compose(vPos.set(x, y, z), qRot.setFromEuler(eRot.set(0, yaw, 0)), vScale.set(scale, scale * squash, scale));
      const spin = now * 2.2 + toy.ph;
      for (const p of act.parts) {
        const part = PARTS[p];
        if (part.place(toy.look, wrongAge >= 0 ? toy.ph : spin, mPart)) mOut.multiplyMatrices(mBase, mPart);
        else mOut.makeScale(0, 0, 0);
        meshes[p].setMatrixAt(i, mOut);
        tmpColor.copy(part.colour(toy.look));
        if (grey > 0) tmpColor.lerp(GREY, grey);
        meshes[p].setColorAt(i, tmpColor);
      }
      shadows.setMatrixAt(i, mOut.compose(vPos.set(x, BASE_Y + 0.03, z), qRot.identity(), vScale.set(scale, 1, scale)));

      // Screen-space target for picking and the keyboard cursor.
      v2.set(x, BASE_Y + TOY_MID, z).project(cam);
      crowd.x[i] = (v2.x * 0.5 + 0.5) * W;
      crowd.y[i] = (-v2.y * 0.5 + 0.5) * H;
      crowd.r[i] = (TOY_HEIGHT * cosE + 1.2 * sinE) / wpp / 2;
    }
    for (const m of meshes) {
      m.count = shown ? n : 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    shadows.count = shown ? n : 0;
    shadows.instanceMatrix.needsUpdate = true;

    foundRing.current.visible = target >= 0;
    if (target >= 0) {
      foundRing.current.position.set(ringX, BASE_Y + 0.12, ringZ);
      const pulse = 1 + Math.sin(now * 6) * 0.06;
      foundRing.current.scale.set(pulse, 1, pulse);
    }
    const showCursor = crowd.open && cursor.index >= 0 && cursor.index < n;
    cursorRing.current.visible = showCursor;
    if (showCursor) cursorRing.current.position.set(curX, BASE_Y + 0.1, curZ);

    // ---- reference card: big before the round, then tucked into the corner ----
    const wantCard = phase === 'study' ? lay.big : lay.card;
    const c = vw.card;
    const show = phase === 'intro' ? 0 : 1;
    const kc = c.h === 0 ? 1 : 1 - Math.exp(-smoothDt * 9);
    c.cx += (wantCard.cx - c.cx) * kc;
    c.cy += (wantCard.cy - c.cy) * kc;
    c.h += (wantCard.h - c.h) * kc;
    c.show += (show - c.show) * (1 - Math.exp(-smoothDt * 10));
    if (s) card.current?.setLook(s.baldwyn);
    card.current?.update(c, wantCard, c.show, phase === 'study' ? Math.sin(now * 1.6) * 0.3 : 0, now * 2.2);
  });

  return (
    <group>
      {/* a wooden serving tray on the table */}
      <group ref={tray}>
        <mesh position={[0, BASE_Y / 2, 0]} receiveShadow material={trayMats.board}>
          <boxGeometry args={[1, BASE_Y, 1]} />
        </mesh>
        {[0, 1].map((i) => (
          <mesh key={`side${i}`} position={[0, (BASE_Y + 0.9) / 2, 0]} castShadow receiveShadow material={trayMats.rim}>
            <boxGeometry args={[RIM, BASE_Y + 0.9, 1]} />
          </mesh>
        ))}
        {[0, 1].map((i) => (
          <mesh key={`end${i}`} position={[0, (BASE_Y + 0.9) / 2, 0]} castShadow receiveShadow material={trayMats.rim}>
            <boxGeometry args={[1, BASE_Y + 0.9, RIM]} />
          </mesh>
        ))}
      </group>
      <primitive object={shadows} />
      {meshes.map((m, i) => (
        <primitive key={PARTS[i].name} object={m} />
      ))}
      <group ref={foundRing} visible={false}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.3, 0.3, 6, 28]} />
          <meshBasicMaterial color={PALETTE.honey} fog={false} />
        </mesh>
      </group>
      <group ref={cursorRing} visible={false}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.2, 0.2, 6, 28]} />
          <meshBasicMaterial color={PALETTE.white} fog={false} />
        </mesh>
      </group>
    </group>
  );
}
