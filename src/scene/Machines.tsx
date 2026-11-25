/**
 * The arcade's machines (docs/ARCADE_PLAN.md phase 3; positions: layout.ts MACHINES): one cabinet
 * per playable trial on the arcade floor, in the trial's accent colour, its intro picture glowing on
 * the screen and its title on a lit marquee. Walk up and press Interact (or tap the prompt) to open
 * the trial's lobby; the screen flashes when someone does.
 *
 * Cheap: the cabinets, their dark trim and their controls are instanced (one draw each); every screen
 * and marquee is one merged mesh on one canvas atlas (one draw). The pictures are the trials'
 * thumbnails (public/assets/thumbs/<id>.webp, ~11 kB each), fetched once the Hub is up and drawn into
 * the atlas as they arrive; until then a screen shows its title on the trial's colour.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../game/palette';
import { events } from '../game/events';
import { LEVEL_Y } from '../game/hubBounds';
import { MACHINE, MACHINES } from './layout';

const Y = LEVEL_Y.floor;
const { w: W, d: D, h: H } = MACHINE;

// ------------------------------------------------------------------ cabinet geometry (machine-local: floor at y = 0, front +z)

/** The lower body (to the control deck), the screen housing set back above it, and the marquee box on top. */
const LOWER_H = 3.4;
const HOUSING = { z0: -D / 2, z1: 0.35, y0: LOWER_H, y1: H - 1.0 };
const MARQUEE = { y: H - 0.5, h: 1.0, d: 2.6, z: -D / 2 + 1.3 };
/** The screen: on the housing's front, tilted back a little; 16 : 9 like the pictures. */
const SCREEN = { w: 3.8, h: 3.8 * (9 / 16), y: (HOUSING.y0 + HOUSING.y1) / 2 + 0.1, z: HOUSING.z1 + 0.03, tilt: -0.12 };
const MARQUEE_FACE = { w: W - 0.5, h: 0.72, y: MARQUEE.y, z: MARQUEE.z + MARQUEE.d / 2 + 0.03 };
const DECK = { y: LOWER_H + 0.2, z: (HOUSING.z1 + D / 2) / 2, d: D / 2 - HOUSING.z1, tilt: 0.28 };

const fix = (g: THREE.BufferGeometry) => {
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
};

/** The parts painted in the machine's colour (white here: the instance colour tints them). */
function bodyGeometry(): THREE.BufferGeometry {
  const lower = new RoundedBoxGeometry(W, LOWER_H, D, 2, 0.3);
  lower.translate(0, LOWER_H / 2, 0);
  const housing = new RoundedBoxGeometry(W, HOUSING.y1 - HOUSING.y0 + 0.3, HOUSING.z1 - HOUSING.z0, 2, 0.25);
  housing.translate(0, (HOUSING.y0 + HOUSING.y1) / 2 - 0.15, (HOUSING.z0 + HOUSING.z1) / 2);
  const marquee = new RoundedBoxGeometry(W + 0.2, MARQUEE.h, MARQUEE.d, 2, 0.2);
  marquee.translate(0, MARQUEE.y, MARQUEE.z);
  return mergeGeometries([lower, housing, marquee].map(fix), false)!;
}

/** The dark parts: the screen's bezel, the control deck, the kick plate and the coin door. */
function trimGeometry(): THREE.BufferGeometry {
  const bezel = new THREE.BoxGeometry(SCREEN.w + 0.5, SCREEN.h + 0.5, 0.12);
  bezel.rotateX(SCREEN.tilt);
  bezel.translate(0, SCREEN.y, SCREEN.z - 0.05);
  const deck = new RoundedBoxGeometry(W - 0.1, 0.4, DECK.d + 0.2, 2, 0.12);
  deck.rotateX(DECK.tilt);
  deck.translate(0, DECK.y, DECK.z);
  const kick = new THREE.BoxGeometry(W - 0.4, 0.5, 0.08);
  kick.translate(0, 0.35, D / 2 + 0.01);
  const coin = new THREE.BoxGeometry(1.4, 1.1, 0.08);
  coin.translate(0, 1.6, D / 2 + 0.01);
  return mergeGeometries([bezel, deck, kick, coin].map(fix), false)!;
}

/** A joystick and three buttons on the deck, and the coin slot's glow: vertex-coloured. */
function controlsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const out = fix(g);
    const n = out.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    out.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return out;
  };
  const onDeck = (g: THREE.BufferGeometry, x: number, dz: number, lift: number) => {
    g.translate(0, lift, 0);
    g.rotateX(DECK.tilt);
    g.translate(x, DECK.y + 0.2, DECK.z + dz);
    return g;
  };
  parts.push(paint(onDeck(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), -1.2, 0, 0.35), PALETTE.ink));
  parts.push(paint(onDeck(new THREE.SphereGeometry(0.26, 10, 8), -1.2, 0, 0.72), PALETTE.coral));
  const buttons = [PALETTE.honey, PALETTE.toyBlue, PALETTE.sage];
  buttons.forEach((c, i) => parts.push(paint(onDeck(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 12), 0.2 + i * 0.6, i === 1 ? -0.15 : 0.1, 0.08), c)));
  const slot = new THREE.BoxGeometry(0.5, 0.12, 0.05);
  slot.translate(0, 1.8, D / 2 + 0.06);
  parts.push(paint(slot, PALETTE.honey));
  return mergeGeometries(parts, false)!;
}

// ------------------------------------------------------------------ screens and marquees (one atlas)

const CELL = 512;
const COLS = 4;
const SHOT_H = 288; // the picture's band in a cell (512 × 288, 16 : 9)
const MARQ_Y = 320;
const MARQ_H = 112;

function atlasCanvas(): { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } {
  const rows = Math.ceil(MACHINES.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = CELL * COLS;
  canvas.height = CELL * rows;
  const g = canvas.getContext('2d')!;
  MACHINES.forEach((m, i) => {
    const x = (i % COLS) * CELL;
    const y = Math.floor(i / COLS) * CELL;
    // the screen until its picture arrives: the title on the trial's colour
    g.fillStyle = m.color;
    g.fillRect(x, y, CELL, SHOT_H);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.font = '700 44px Fredoka, "Baloo 2", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(m.title, x + CELL / 2, y + SHOT_H / 2, CELL - 40);
    // the marquee: the title in cream on ink, with a stripe of the trial's colour
    g.fillStyle = PALETTE.ink;
    g.fillRect(x, y + MARQ_Y, CELL, MARQ_H);
    g.fillStyle = m.color;
    g.fillRect(x, y + MARQ_Y + MARQ_H - 16, CELL, 16);
    g.fillStyle = PALETTE.cream;
    g.font = '700 52px Fredoka, "Baloo 2", system-ui, sans-serif';
    g.fillText(m.title.toUpperCase(), x + CELL / 2, y + MARQ_Y + (MARQ_H - 16) / 2 + 2, CELL - 36);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { canvas, tex };
}

/** Every screen and marquee as quads in world space, their UVs on the atlas. */
function facesGeometry(rows: number): THREE.BufferGeometry {
  const quads: THREE.BufferGeometry[] = [];
  const o = new THREE.Object3D();
  const quad = (w: number, h: number, u0: number, v0: number, u1: number, v1: number, m: THREE.Matrix4) => {
    const q = new THREE.PlaneGeometry(w, h);
    const uv = q.attributes.uv as THREE.BufferAttribute;
    // PlaneGeometry's corners: (0,1) (1,1) (0,0) (1,0)
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    q.applyMatrix4(m);
    quads.push(q);
  };
  const W_ATLAS = CELL * COLS;
  const H_ATLAS = CELL * rows;
  MACHINES.forEach((mc, i) => {
    const cx = (i % COLS) * CELL;
    const cy = Math.floor(i / COLS) * CELL;
    // canvas y runs down, texture v runs up
    const u = (px: number) => px / W_ATLAS;
    const v = (py: number) => 1 - py / H_ATLAS;
    o.position.set(mc.x, Y, mc.z);
    o.rotation.set(0, mc.rot, 0);
    o.updateMatrix();
    const screen = new THREE.Matrix4().makeRotationX(SCREEN.tilt).setPosition(0, SCREEN.y, SCREEN.z + 0.02);
    quad(SCREEN.w, SCREEN.h, u(cx + 2), v(cy + SHOT_H - 2), u(cx + CELL - 2), v(cy + 2), o.matrix.clone().multiply(screen));
    const marq = new THREE.Matrix4().makeTranslation(0, MARQUEE_FACE.y, MARQUEE_FACE.z);
    quad(MARQUEE_FACE.w, MARQUEE_FACE.h, u(cx + 2), v(cy + MARQ_Y + MARQ_H - 2), u(cx + CELL - 2), v(cy + MARQ_Y + 2), o.matrix.clone().multiply(marq));
  });
  return mergeGeometries(quads, false)!;
}

// ------------------------------------------------------------------ the scene

export function Machines() {
  const body = useMemo(bodyGeometry, []);
  const trim = useMemo(trimGeometry, []);
  const controls = useMemo(controlsGeometry, []);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.45 }), []);
  const trimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.6 }), []);
  const ctrlMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }), []);
  const atlas = useMemo(atlasCanvas, []);
  const faces = useMemo(() => facesGeometry(Math.ceil(MACHINES.length / COLS)), []);
  // the screens glow (unlit, not tone-mapped: the bloom picks them up), dimmed a touch so the pictures read
  const faceMat = useMemo(() => new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false, color: new THREE.Color(0.95, 0.95, 0.95) }), [atlas]);
  const bodies = useRef<THREE.InstancedMesh>(null!);
  const trims = useRef<THREE.InstancedMesh>(null!);
  const ctrls = useRef<THREE.InstancedMesh>(null!);

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    MACHINES.forEach((m, i) => {
      o.position.set(m.x, Y, m.z);
      o.rotation.set(0, m.rot, 0);
      o.updateMatrix();
      for (const r of [bodies, trims, ctrls]) r.current.setMatrixAt(i, o.matrix);
      bodies.current.setColorAt(i, c.set(m.color));
    });
    for (const r of [bodies, trims, ctrls]) r.current.instanceMatrix.needsUpdate = true;
    bodies.current.instanceColor!.needsUpdate = true;
  }, []);

  // the trials' pictures, drawn into the atlas as they arrive
  useEffect(() => {
    let live = true;
    const g = atlas.canvas.getContext('2d')!;
    MACHINES.forEach((m, i) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (!live) return;
        g.drawImage(img, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, SHOT_H);
        atlas.tex.needsUpdate = true;
      };
      img.src = `${import.meta.env.BASE_URL}assets/thumbs/${m.game}.webp`;
    });
    return () => {
      live = false;
    };
  }, [atlas]);

  // a flash of the screens when a trial is opened at its machine
  const flash = useRef(0);
  useEffect(() => events.on('machine:open', () => void (flash.current = 1)), []);
  useFrame((_, dt) => {
    if (flash.current <= 0) return;
    flash.current = Math.max(0, flash.current - dt * 1.5);
    faceMat.color.setScalar(0.95 + flash.current * 0.6);
  });

  return (
    <group name="machines">
      <instancedMesh ref={bodies} args={[body, bodyMat, MACHINES.length]} castShadow receiveShadow />
      <instancedMesh ref={trims} args={[trim, trimMat, MACHINES.length]} castShadow />
      <instancedMesh ref={ctrls} args={[controls, ctrlMat, MACHINES.length]} />
      <mesh geometry={faces} material={faceMat} />
    </group>
  );
}
