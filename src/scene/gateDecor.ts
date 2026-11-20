/**
 * Themed surroundings for every minigame gate, plus the painted faces of the gate name boards and
 * the signposts. Everything is code-built in the chunky toy style and merged through one Kit
 * (see kit.ts), so all eleven districts together cost a handful of draw calls.
 *
 * Each gate has two solid spots (GATE_DECOR in layout.ts, both with colliders): a tall "hero"
 * piece on the gate's left (local −x) and a low cluster on its right (+x). Anything else is flat
 * on the felt (≤ 0.45 cm, below the step height), kept beside the gate's path and in front of
 * the pillars, never on the path tiles. Gate-local frame: +z is the gate's front (towards its
 * road), y = 0 is the table.
 *
 * Pure three.js (no DOM): the unit tests build it to check the footprints.
 */
import * as THREE from 'three';
import { PALETTE } from '../game/palette';
import type { MinigameId } from '../minigames/types';
import type { DominoSpec } from './domino';
import { Kit } from './kit';
import type { SignAtlas } from './signAtlas';
import { BRIDGE, FOUNTAIN, GATE, GATES, GATE_DECOR, GATE_DISTRICTS, GATE_LOOP, PAVILION, SCOREBOARD, SHOP, SIGNPOSTS, WORKSHOP, frontOf, gateLocal, type HubGate, type SignpostId } from './layout';

const P = PALETTE;
const H = GATE_DECOR.hero;
const S = GATE_DECOR.side;
/** Flat decals sit this far above the table (the felt mat is at 0.075). */
const DECAL_Y = 0.13;
const STEEL = '#C9CED6';
const CHARCOAL = '#3E3742';
const SKIN = '#F2D7B8';

type Theme = (k: Kit, a: SignAtlas, g: HubGate, out: DecorExtras) => void;
export interface DecorExtras {
  /** Real (textured) dominoes, in world coordinates. */
  dominoes: DominoSpec[];
}

// ------------------------------------------------------------------ shared little figures

/** A tiny gentleman figurine (≈ 2.6 cm tall at s = 1), standing at the local origin. */
function gentleman(k: Kit, x: number, z: number, s: number, coat: string, tie: string, ry = 0) {
  k.push(x, 0, z, ry);
  k.cyl(0.55 * s, 0.6 * s, 0.18 * s, 0, 0.09 * s, 0, P.woodDark, 12);
  k.cyl(0.38 * s, 0.5 * s, 1.35 * s, 0, 0.85 * s, 0, coat, 10);
  k.ball(0.36 * s, 0, 1.78 * s, 0, SKIN, 10);
  k.cyl(0.52 * s, 0.52 * s, 0.05 * s, 0, 2.06 * s, 0, P.ink, 12); // bowler brim
  k.ball(0.3 * s, 0, 2.1 * s, 0, P.ink, 10, { s: [1, 0.9, 1] });
  k.with('detail', () => {
    k.cone(0.13 * s, 0.26 * s, -0.12 * s, 1.43 * s, 0.4 * s, tie, 4, { rz: Math.PI / 2 });
    k.cone(0.13 * s, 0.26 * s, 0.12 * s, 1.43 * s, 0.4 * s, tie, 4, { rz: -Math.PI / 2 });
    k.box(0.36 * s, 0.07 * s, 0.06 * s, 0, 1.68 * s, 0.33 * s, P.ink); // moustache
  });
  k.pop();
}

/** A toy soldier (≈ 6.4 cm at s = 1): coat, cross belts, tall fur hat with a plume. */
function soldier(k: Kit, x: number, y: number, z: number, s: number, coat: string, ry = 0) {
  k.push(x, y, z, ry);
  k.cyl(1.2 * s, 1.3 * s, 0.4 * s, 0, 0.2 * s, 0, P.sage, 14);
  for (const sx of [-0.3, 0.3]) k.box(0.45 * s, 1.6 * s, 0.5 * s, sx * s, 1.2 * s, 0, P.ink);
  k.cyl(0.62 * s, 0.7 * s, 2.0 * s, 0, 3.0 * s, 0, coat, 12);
  for (const sx of [-1, 1]) k.cyl(0.2 * s, 0.22 * s, 1.7 * s, sx * 0.86 * s, 3.05 * s, 0, coat, 8, { rz: sx * 0.12 });
  k.ball(0.55 * s, 0, 4.45 * s, 0, SKIN, 12);
  k.cyl(0.55 * s, 0.58 * s, 1.5 * s, 0, 5.45 * s, 0, P.ink, 12);
  k.with('detail', () => {
    k.box(0.16 * s, 2.0 * s, 0.05 * s, 0, 3.0 * s, 0.66 * s, P.white, { rz: 0.6 });
    k.box(0.16 * s, 2.0 * s, 0.05 * s, 0, 3.0 * s, 0.66 * s, P.white, { rz: -0.6 });
    k.ball(0.18 * s, 0.4 * s, 6.1 * s, 0.1 * s, P.coral, 8);
    k.box(0.6 * s, 0.12 * s, 0.1 * s, 0, 4.85 * s, 0.5 * s, P.honey); // hat badge
  });
  k.pop();
}

/** An AA battery bot standing at the origin: body, label band, button top, googly eyes, feet. */
function batteryBot(k: Kit, x: number, z: number, band: string, ry = 0, s = 1) {
  k.push(x, 0, z, ry);
  for (const sx of [-0.22, 0.22]) k.block(0.32 * s, 0.22 * s, 0.5 * s, sx * s, 0.11 * s, 0.08 * s, P.ink);
  k.cyl(0.45 * s, 0.45 * s, 1.9 * s, 0, 1.17 * s, 0, CHARCOAL, 14);
  k.cyl(0.46 * s, 0.46 * s, 0.9 * s, 0, 1.0 * s, 0, band, 14);
  k.cyl(0.18 * s, 0.18 * s, 0.18 * s, 0, 2.2 * s, 0, STEEL, 10);
  k.with('detail', () => {
    for (const sx of [-0.17, 0.17]) {
      k.ball(0.15 * s, sx * s, 1.75 * s, 0.38 * s, P.white, 8);
      k.ball(0.07 * s, sx * s, 1.75 * s, 0.5 * s, P.ink, 6);
    }
  });
  k.pop();
}

/** A toy wand from a to b with a star on the tip. */
function wand(k: Kit, a: [number, number, number], b: [number, number, number], r: number, star: string) {
  k.rod(a, b, r, P.ink, 8);
  k.with('detail', () => {
    const t = 0.25;
    k.rod(a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], r * 1.25, P.brass, 8);
  });
  k.with('glow', () => {
    k.add(starGeometry(r * 3.2), star, b[0], b[1], b[2]);
  });
}

/** A chunky five-point star (extruded), facing +z. */
function starGeometry(r: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: r * 0.35, bevelEnabled: false });
  g.translate(0, 0, -r * 0.175);
  return g;
}

/** A four-point "blink" spark (two crossed flattened diamonds). */
function spark(k: Kit, x: number, y: number, z: number, r: number, color: string) {
  k.with('glow', () => {
    k.add(new THREE.OctahedronGeometry(r, 0), color, x, y, z, { s: [0.28, 1, 0.28] });
    k.add(new THREE.OctahedronGeometry(r, 0), color, x, y, z, { s: [1, 0.28, 0.28] });
  });
}

// ------------------------------------------------------------------ the eleven themes

const copycat: Theme = (k, a) => {
  // hero: a music stand with sheet music
  k.push(H.lx, 0, H.lz);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.5;
    k.rod([Math.cos(ang) * 1.5, 0.05, Math.sin(ang) * 1.5], [0, 1.6, 0], 0.11, P.ink, 6);
  }
  k.cyl(0.13, 0.13, 3.9, 0, 3.4, 0, P.ink, 8);
  k.push(0, 5.6, 0.15);
  k.box(3.4, 2.5, 0.16, 0, 0, 0, P.ink, { rx: -0.32 });
  k.box(3.4, 0.25, 0.4, 0, -1.25, 0.32, P.ink, { rx: -0.32 });
  k.with('decal', () => k.quad(3.0, 2.2, 0, 0.05, 0.1, a.small({ kind: 'sheet' }), '#ffffff', { rx: -0.32 }));
  k.pop();
  k.pop();
  // side: the four instruments, as the four buttons are coloured
  k.push(S.lx, 0, S.lz);
  k.cyl(1.0, 1.0, 1.3, -0.55, 0.65, -0.35, P.coral, 18); // drum
  k.cyl(1.02, 1.02, 0.16, -0.55, 1.3, -0.35, P.cream, 18);
  k.with('detail', () => {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      k.rod([-0.55 + Math.cos(ang) * 1.02, 0.1, -0.35 + Math.sin(ang) * 1.02], [-0.55 + Math.cos(ang + 0.5) * 1.02, 1.2, -0.35 + Math.sin(ang + 0.5) * 1.02], 0.04, P.honey, 4);
    }
    k.rod([-0.2, 1.4, -0.6], [0.5, 2.0, -0.1], 0.06, P.woodLight, 5); // drumstick
  });
  k.cyl(0.32, 0.72, 0.85, 0.95, 0.5, -0.75, P.honey, 14); // bell
  k.ball(0.18, 0.95, 1.02, -0.75, P.honey, 8);
  // xylophone: frame + five blue bars getting shorter
  k.push(0.6, 0, 0.75, 0.3);
  for (const sz of [-0.45, 0.45]) k.box(1.9, 0.18, 0.12, 0, 0.18, sz, P.woodDark);
  for (let i = 0; i < 5; i++) k.box(0.26, 0.12, 1.25 - i * 0.12, -0.75 + i * 0.37, 0.33, 0, P.toyBlue);
  k.pop();
  k.block(0.85, 0.7, 0.85, -0.65, 0.35, 1.05, P.sage); // little green music box
  k.box(0.85, 0.08, 0.6, -0.65, 0.95, 0.68, P.sage, { rx: -1.0 });
  k.pop();
  // the four instrument colours as a sticker strip on the lintel
  k.with('detail', () => {
    [P.coral, P.honey, P.toyBlue, P.sage].forEach((c, i) => k.disc(0.45, -1.8 + i * 1.2, GATE.height - 1.1, GATE.depth / 2 + 0.2, c, {}, 16));
  });
};

const jack: Theme = (k, a) => {
  // hero: a jack-in-the-box, sprung
  k.push(H.lx, 0, H.lz, 0.35);
  k.block(2.6, 2.6, 2.6, 0, 1.3, 0, P.toyBlue);
  k.box(2.6, 0.16, 2.6, 0, 2.7 + 1.2, -1.3 - 0.05, P.toyBlue, { rx: -1.45 }); // lid flung open
  k.with('detail', () => {
    for (const [x, z, ry] of [[0, 1.31, 0], [1.31, 0, Math.PI / 2], [-1.31, 0, -Math.PI / 2]] as const) k.add(starGeometry(0.75), P.coral, x, 1.3, z, { ry, s: [1, 1, 0.12] });
    k.rod([1.3, 1.4, 0], [1.9, 1.4, 0], 0.08, P.brass, 6); // crank
    k.rod([1.9, 1.4, 0], [1.9, 0.9, 0], 0.07, P.brass, 6);
    k.ball(0.16, 1.9, 0.85, 0, P.coral, 8);
  });
  for (let i = 0; i < 6; i++) k.torus(0.45, 0.09, 0, 2.75 + i * 0.32, 0, P.brass, { rx: Math.PI / 2 });
  k.torus(0.55, 0.22, 0, 4.7, 0, P.white, { rx: Math.PI / 2 }); // ruff collar
  k.ball(0.85, 0, 5.4, 0, SKIN, 14);
  k.ball(0.2, 0, 5.35, 0.85, P.coral, 8); // nose
  k.cone(0.7, 1.4, 0, 6.55, 0, P.coral, 10, { rz: 0.25 });
  k.ball(0.2, -0.3, 7.15, 0, P.honey, 8);
  k.with('detail', () => {
    for (const sx of [-0.3, 0.3]) k.ball(0.1, sx, 5.65, 0.78, P.ink, 6);
  });
  k.pop();
  // side: letter blocks spelling JACK
  k.push(S.lx, 0, S.lz);
  const blocks: [string, string, number, number, number, number][] = [
    ['J', P.coral, -0.72, 0, -0.42, 0.2],
    ['A', P.honey, 0.68, 0, -0.5, -0.15],
    ['C', P.sage, -0.05, 0, 0.78, 0.4],
    ['K', P.toyBlue, -0.1, 1.3, -0.35, -0.3],
  ];
  k.with('decal', () => {
    for (const [ch, c, x, y, z, ry] of blocks) k.add(new THREE.BoxGeometry(1.3, 1.3, 1.3), '#ffffff', x, y + 0.65, z, { ry }, a.small({ kind: 'letter', ch, color: c }));
  });
  k.pop();
  // confetti on the felt in front of the left pillar
  k.with('detail', () => {
    const cols = [P.coral, P.honey, P.toyBlue, P.sage, P.cream];
    for (let i = 0; i < 9; i++) k.disc(0.22, -5.2 + ((i * 1.37) % 3.2), DECAL_Y, 2.2 + ((i * 0.71) % 1.3), cols[i % 5], { rx: -Math.PI / 2 }, 6);
  });
};

const findOriginal: Theme = (k) => {
  // hero: the original on a plinth, a little bigger than everyone else
  k.push(H.lx, 0, H.lz);
  k.cyl(1.45, 1.6, 0.4, 0, 0.2, 0, P.woodDark, 18);
  k.cyl(1.2, 1.25, 2.0, 0, 1.4, 0, P.cream, 18);
  k.cyl(1.4, 1.4, 0.3, 0, 2.55, 0, P.sage, 18);
  k.push(0, 2.7, 0);
  gentleman(k, 0, 0, 1.55, P.inkPurple, P.honey);
  k.pop();
  k.with('detail', () => k.torus(1.3, 0.06, 0, 2.72, 0, P.brass, { rx: Math.PI / 2 }));
  k.pop();
  // side: five look-alikes in a huddle; one bow tie is the wrong colour
  k.push(S.lx, 0, S.lz);
  const spots: [number, number][] = [[-0.95, -0.55], [0.1, -0.95], [1.0, -0.2], [-0.4, 0.55], [0.6, 0.85]];
  spots.forEach(([x, z], i) => gentleman(k, x, z, 0.82, P.inkPurple, i === 3 ? P.coral : P.honey, 0.2 - i * 0.15));
  k.pop();
  // a magnifying glass lying on the felt
  k.push(-4.6, 0, 2.5, -1.3);
  k.torus(0.95, 0.13, 0, 0.16, 0, P.brass, { rx: Math.PI / 2 });
  k.cyl(0.88, 0.88, 0.06, 0, 0.15, 0, '#CFE3F2', 22);
  k.rod([0, 0.16, 1.05], [0, 0.16, 2.3], 0.16, P.woodDark, 8);
  k.pop();
};

const redLight: Theme = (k) => {
  // hero: a signal lamp on a post
  k.push(H.lx, 0, H.lz);
  k.block(2.0, 0.5, 2.0, 0, 0.25, 0, P.cream);
  k.cyl(0.22, 0.26, 4.6, 0, 2.8, 0, P.ink, 10);
  k.block(1.5, 3.0, 1.0, 0, 5.6, 0, P.ink, {}, 0.18);
  k.with('glow', () => {
    k.disc(0.42, 0, 6.55, 0.56, '#FF5A4E', {}, 18); // red: on
    k.disc(0.42, 0, 4.65, 0.56, '#7CF08A', {}, 18); // green: on
  });
  k.disc(0.42, 0, 5.6, 0.56, '#7A6040', {}, 18); // amber: off
  k.with('detail', () => {
    for (const y of [6.55, 5.6, 4.65]) k.cyl(0.5, 0.5, 0.45, 0, y + 0.12, 0.62, P.ink, 14, { rx: Math.PI / 2 }, true);
    k.cone(0.55, 0.5, 0, 7.35, 0, P.coral, 4, { ry: Math.PI / 4 });
  });
  k.pop();
  // side: starting blocks and a traffic cone
  k.push(S.lx, 0, S.lz);
  for (const x of [-0.7, 0.5]) k.box(0.9, 0.9, 1.4, x, 0.4, -0.2, P.honey, { rx: 0.5 });
  k.cone(0.6, 1.8, 0.3, 0.9, 0.95, P.coral, 12);
  k.with('detail', () => k.cyl(0.36, 0.44, 0.3, 0.3, 0.9, 0.95, P.white, 12, {}, true));
  k.box(1.3, 0.12, 1.3, 0.3, 0.06, 0.95, P.coral);
  k.pop();
  // the runway's chequered start line, both sides of the path
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      for (let r = 0; r < 2; r++) {
        const x = side * (2.3 + i * 0.6 + 0.3);
        k.box(0.6, 0.04, 0.6, x, DECAL_Y + 0.02, 2.5 + r * 0.6, (i + r) % 2 ? P.ink : P.white);
      }
    }
  }
};

const windUpDash: Theme = (k, _a, g, out) => {
  // hero: a domino run caught mid-topple (real textured dominoes)
  const run: [number, number][] = [[-1.3, 0], [0, 0], [1.3, 0.11]]; // the last one leans on its neighbour
  for (const [lx, tilt] of run) {
    const p = gateLocal(g, H.lx + lx, H.lz);
    out.dominoes.push({ x: p.x, z: p.z, rot: g.rot + Math.PI / 2, tilt });
  }
  // side: a spring pad
  k.push(S.lx, 0, S.lz);
  k.cyl(1.4, 1.5, 0.3, 0, 0.15, 0, P.toyBlue, 20);
  for (let i = 0; i < 4; i++) k.torus(0.9 - i * 0.04, 0.11, 0, 0.45 + i * 0.28, 0, STEEL, { rx: Math.PI / 2 });
  k.cyl(1.25, 1.25, 0.25, 0, 1.6, 0, P.honey, 20);
  k.with('detail', () => k.ring(0.4, 0.7, 0, 1.74, 0, P.coral, 18));
  k.pop();
  // a wooden ruler on the felt: the start ramp
  k.push(5.4, 0, 2.6, 0.08);
  k.box(6.2, 0.22, 1.1, 0, 0.19, 0, '#E9CF9A');
  k.with('detail', () => {
    for (let i = 0; i <= 12; i++) k.box(0.05, 0.02, i % 2 ? 0.25 : 0.45, -2.9 + i * 0.48, 0.31, -0.55 + (i % 2 ? 0.125 : 0.225), P.ink);
  });
  k.pop();
};

const musicBox: Theme = (k) => {
  // hero: the music-box movement: pinned cylinder, steel comb, crank, and a big eighth note
  k.push(H.lx, 0, H.lz);
  k.block(3.2, 0.4, 2.2, 0, 0.2, 0, P.brass, {}, 0.1);
  for (const x of [-1.3, 1.3]) k.box(0.3, 1.6, 0.5, x, 1.2, -0.2, P.brass);
  k.cyl(0.75, 0.75, 2.3, 0, 1.7, -0.2, P.honey, 18, { rz: Math.PI / 2 });
  k.with('detail', () => {
    for (let i = 0; i < 14; i++) {
      const ang = i * 2.4;
      k.ball(0.07, -0.95 + ((i * 0.53) % 1.9), 1.7 + Math.sin(ang) * 0.76, -0.2 + Math.cos(ang) * 0.76, STEEL, 4);
    }
    k.rod([1.45, 1.7, -0.2], [1.75, 1.7, -0.2], 0.06, P.brass, 5);
    k.rod([1.75, 1.7, -0.2], [1.75, 1.0, -0.2], 0.06, P.brass, 5);
    k.ball(0.15, 1.75, 0.95, -0.2, P.woodDark, 8);
  });
  // comb: nine steel teeth, longest at the bass end
  k.box(2.2, 0.3, 0.4, 0, 0.55, 0.85, STEEL);
  for (let i = 0; i < 9; i++) k.box(0.16, 0.08, 0.5 + (8 - i) * 0.04, -0.95 + i * 0.24, 0.72, 0.55 - (8 - i) * 0.02, STEEL, { rx: 0.12 });
  // the note
  k.ball(0.62, -0.6, 3.2, -0.6, P.ink, 12, { s: [1.3, 0.9, 0.9], rz: 0.4 });
  k.cyl(0.13, 0.13, 3.6, 0.15, 4.95, -0.6, P.ink, 8);
  k.torus(0.8, 0.14, 0.95, 6.1, -0.6, P.ink, { rz: -0.4 }, Math.PI * 0.75);
  k.pop();
  // side: a little open music box
  k.push(S.lx, 0, S.lz, -0.2);
  k.block(2.0, 1.1, 1.4, 0, 0.55, 0, P.woodMid, {}, 0.12);
  k.box(1.7, 0.1, 1.1, 0, 1.06, 0, P.coral);
  k.box(2.0, 1.25, 0.14, 0, 1.75, -0.75, P.woodMid, { rx: -0.25 });
  k.with('detail', () => {
    k.box(1.5, 0.9, 0.04, 0, 1.75, -0.66, P.coral, { rx: -0.25 });
    k.cyl(0.25, 0.25, 0.9, 0.2, 1.25, 0.1, P.honey, 10, { rz: Math.PI / 2 });
    k.rod([1.0, 0.6, 0], [1.4, 0.6, 0], 0.05, P.brass, 5);
  });
  k.pop();
  // four note lanes painted on the felt, with the hit line across them
  [P.coral, P.honey, P.toyBlue, P.sage].forEach((c, i) => k.box(0.42, 0.04, 2.0, -2.5 - i * 0.55, DECAL_Y + 0.02, 2.65, c));
  k.box(2.4, 0.04, 0.16, -3.35, DECAL_Y + 0.06, 3.2, P.cream);
};

const inferno: Theme = (k) => {
  // hero: a little pot-bellied furnace with a tall chimney
  k.push(H.lx, 0, H.lz);
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) k.cyl(0.18, 0.22, 0.5, x, 0.25, z, CHARCOAL, 6);
  k.cyl(1.35, 1.5, 0.5, 0, 0.75, 0, CHARCOAL, 18);
  k.ball(1.6, 0, 2.3, 0, CHARCOAL, 18, { s: [1, 0.85, 1] });
  k.cyl(1.2, 1.5, 0.6, 0, 3.6, 0, CHARCOAL, 18);
  k.cyl(0.38, 0.38, 3.2, 0.4, 5.4, -0.3, '#5A4F55', 10);
  k.cyl(0.55, 0.45, 0.35, 0.4, 7.05, -0.3, CHARCOAL, 10);
  k.torus(1.62, 0.1, 0, 2.3, 0, P.brass, { rx: Math.PI / 2 }, Math.PI * 2, 24);
  k.with('glow', () => {
    k.disc(0.7, 0, 2.2, 1.62, '#FF8A3C', {}, 16);
    k.disc(0.4, 0, 2.2, 1.67, '#FFD27A', {}, 12);
  });
  k.with('detail', () => {
    for (const x of [-0.35, 0, 0.35]) k.box(0.1, 1.3, 0.1, x, 2.2, 1.74, CHARCOAL);
  });
  k.pop();
  // side: a heap of rock blocks, one still glowing
  k.push(S.lx, 0, S.lz);
  const rocks: [number, number, number, number, string][] = [
    [-0.75, 0.55, -0.4, 0.75, '#8C7F78'],
    [0.7, 0.5, -0.55, 0.7, '#6F6466'],
    [0.1, 0.45, 0.75, 0.65, '#A69481'],
    [-0.05, 1.3, -0.35, 0.6, '#7D7270'],
  ];
  rocks.forEach(([x, y, z, r, c], i) => k.add(new THREE.DodecahedronGeometry(r, 0), c, x, y, z, { ry: i * 0.9, rx: i * 0.4 }));
  k.with('glow', () => k.add(new THREE.DodecahedronGeometry(0.32, 0), '#FF7A3A', 0.95, 0.3, 0.55, { ry: 0.3 }));
  k.pop();
  // scorched floor tiles beside the path
  for (let i = 0; i < 6; i++) k.box(0.95, 0.04, 0.95, -2.8 - (i % 3) * 1.05, DECAL_Y + 0.02, 2.2 + Math.floor(i / 3) * 1.05, i % 2 ? '#B9824A' : '#A06A3E');
};

const midnight: Theme = (k) => {
  // hero: a moon-and-sun dial on a post
  k.push(H.lx, 0, H.lz);
  k.cyl(1.0, 1.15, 0.4, 0, 0.2, 0, P.woodDark, 14);
  k.cyl(0.24, 0.28, 4.4, 0, 2.6, 0, P.woodDark, 10);
  k.push(0, 4.9, 0);
  k.cyl(1.95, 1.95, 0.3, 0, 0, 0, P.brass, 28, { rx: Math.PI / 2 });
  k.disc(1.75, 0, 0, 0.16, P.inkPurple, {}, 24, Math.PI / 2, Math.PI); // night half (left)
  k.disc(1.75, 0, 0, 0.16, P.honey, {}, 24, -Math.PI / 2, Math.PI); // day half (right)
  k.with('glow', () => {
    k.disc(0.55, -0.85, 0.35, 0.21, '#F6EED8', {}, 18);
    for (const [x, y] of [[-1.1, -0.6], [-0.45, -1.05], [-1.35, 0.25]]) k.disc(0.1, x, y, 0.21, '#FFF3C4', {}, 5);
  });
  k.disc(0.5, -0.65, 0.45, 0.26, P.inkPurple, {}, 18); // bite out of the moon: a crescent
  k.ball(0.45, 0.85, 0.3, 0.2, '#F39A3A', 12, { s: [1, 1, 0.35] }); // the sun
  k.with('detail', () => {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      k.box(0.08, 0.32, 0.05, 0.85 + Math.cos(ang) * 0.68, 0.3 + Math.sin(ang) * 0.68, 0.22, '#F39A3A', { rz: ang - Math.PI / 2 });
    }
  });
  k.box(0.12, 1.45, 0.08, 0.2, 0.55, 0.34, P.ink, { rz: -0.35 }); // hand
  k.ball(0.16, 0, 0, 0.36, P.ink, 8);
  k.pop();
  k.pop();
  // side: three hungry battery bots on a night rug
  k.push(S.lx, 0, S.lz);
  k.disc(1.95, 0, DECAL_Y, 0, '#3F3852', { rx: -Math.PI / 2 }, 24);
  batteryBot(k, -0.7, -0.45, P.coral, 0.3);
  batteryBot(k, 0.7, -0.55, P.toyBlue, -0.2);
  batteryBot(k, 0.05, 0.75, P.sage, 0.05, 0.85);
  k.pop();
};

const toySquad: Theme = (k) => {
  // hero: a sentry toy soldier
  soldier(k, H.lx, 0, H.lz, 1.05, P.coral);
  // side: a chessboard tile with three little soldiers in formation
  k.push(S.lx, 0, S.lz, 0.2);
  k.box(2.5, 0.35, 2.5, 0, 0.175, 0, P.woodDark);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) k.box(0.56, 0.04, 0.56, -0.9 + i * 0.6, 0.37, -0.9 + j * 0.6, P.cream);
  soldier(k, -0.6, 0.35, -0.6, 0.4, P.toyBlue);
  soldier(k, 0.6, 0.35, -0.6, 0.4, P.toyBlue);
  soldier(k, 0, 0.35, 0.6, 0.4, P.coral);
  k.pop();
};

const blink: Theme = (k) => {
  // hero: two oversized toy swords crossed in a block
  k.push(H.lx, 0, H.lz);
  k.block(2.0, 1.3, 1.6, 0, 0.65, 0, P.cardboard);
  for (const side of [-1, 1]) {
    k.push(0, 1.2, 0, 0);
    const tilt = side * 0.36;
    k.box(0.38, 4.8, 0.12, -Math.sin(tilt) * 2.6, Math.cos(tilt) * 2.6, side * 0.1, STEEL, { rz: tilt });
    k.box(1.6, 0.28, 0.3, -Math.sin(tilt) * 0.15, Math.cos(tilt) * 0.15, side * 0.1, P.honey, { rz: tilt });
    k.cyl(0.14, 0.14, 0.8, Math.sin(tilt) * 0.3, -Math.cos(tilt) * 0.2 + 0.1, side * 0.1, P.woodDark, 8, { rz: tilt });
    k.pop();
  }
  k.pop();
  spark(k, H.lx - 1.3, 5.2, H.lz + 0.5, 0.5, '#BFE4FF');
  spark(k, H.lx + 1.4, 3.6, H.lz + 0.6, 0.38, '#FFE3A0');
  spark(k, H.lx + 0.3, 6.6, H.lz + 0.3, 0.32, '#BFE4FF');
  // side: a spring-pop ring on its stand
  k.push(S.lx, 0, S.lz);
  k.box(1.8, 0.3, 0.8, 0, 0.15, 0, P.woodMid);
  k.torus(1.15, 0.16, 0, 1.55, 0, P.toyBlue, {}, Math.PI * 2, 24);
  k.torus(0.85, 0.08, 0, 1.55, 0, P.brass, {}, Math.PI * 2, 24);
  k.pop();
  spark(k, S.lx - 0.8, 2.9, S.lz + 0.4, 0.3, '#FFE3A0');
  spark(k, S.lx + 0.9, 0.9, S.lz + 0.6, 0.26, '#BFE4FF');
  // a felt practice mat with the striped warning sector
  k.disc(2.0, -4.6, DECAL_Y, 2.9, '#4E5A78', { rx: -Math.PI / 2 }, 20, 0, Math.PI);
  for (let i = 0; i < 4; i++) k.disc(1.9, -4.6, DECAL_Y + 0.04, 2.9, i % 2 ? P.honey : P.ink, { rx: -Math.PI / 2 }, 6, 0.4 + i * 0.25, 0.25);
};

const spellbox: Theme = (k) => {
  // hero: the spellbox itself, with a giant wand standing in it
  k.push(H.lx, 0, H.lz, 0.2);
  k.block(2.6, 1.6, 2.0, 0, 0.8, 0, P.toyBlue);
  k.box(2.6, 0.18, 2.0, 0, 2.0, -1.2, P.toyBlue, { rx: -1.2 });
  k.with('detail', () => {
    k.box(2.66, 0.25, 2.06, 0, 1.2, 0, P.brass);
    k.box(0.4, 0.5, 0.08, 0, 1.2, 1.04, P.brass);
  });
  wand(k, [0.1, 1.2, 0.1], [0.35, 6.0, 0.25], 0.16, '#FFE3A0');
  k.with('glow', () => {
    k.ball(0.28, -0.7, 2.5, 0.3, '#BFE4FF', 10);
    k.ball(0.2, 0.8, 2.9, -0.2, '#F4C6F0', 10);
  });
  k.pop();
  // side: a little rack of wand toys and a crystal, inside a painted spell ring
  k.push(S.lx, 0, S.lz);
  k.box(1.8, 0.35, 0.7, 0, 0.175, -0.5, P.woodMid);
  wand(k, [-0.6, 0.3, -0.5], [0.3, 2.9, -0.4], 0.09, '#BFE4FF');
  wand(k, [0.6, 0.3, -0.5], [-0.2, 2.8, -0.55], 0.09, '#F4C6F0');
  k.cyl(0.4, 0.5, 0.5, 0.4, 0.25, 0.75, P.woodDark, 10);
  k.add(new THREE.OctahedronGeometry(0.55, 0), P.toyBlue, 0.4, 1.1, 0.75, { s: [0.8, 1.3, 0.8] });
  k.ring(2.05, 2.35, 0, DECAL_Y, 0, P.toyBlue, 40);
  k.with('detail', () => {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      k.disc(0.16, Math.cos(ang) * 2.2, DECAL_Y + 0.04, Math.sin(ang) * 2.2, P.honey, { rx: -Math.PI / 2 }, 5);
    }
  });
  k.pop();
};

const oddPageOut: Theme = (k) => {
  // hero: a picture book open on a reading stand; the right page has one thing different, ringed
  k.push(H.lx, 0, H.lz);
  k.cyl(1.1, 1.25, 0.3, 0, 0.15, 0, P.woodDark, 16);
  k.cyl(0.18, 0.22, 4.3, 0, 2.45, -0.2, P.woodDark, 8);
  const a = 0.55; // the stand's tilt: front edge down
  const at = (x: number, y: number, z: number): [number, number, number] => [x, 4.6 + y * Math.cos(a) - z * Math.sin(a), -0.2 + y * Math.sin(a) + z * Math.cos(a)];
  k.box(3.6, 0.2, 2.0, ...at(0, 0, 0), P.woodMid, { rx: a });
  k.box(3.6, 0.35, 0.15, ...at(0, 0.2, 1.0), P.woodMid, { rx: a });
  k.box(3.9, 0.12, 2.3, ...at(0, 0.16, 0), '#4C7E9C', { rx: a });
  for (const side of [-1, 1]) k.box(1.85, 0.18, 2.1, ...at(side * 0.95, 0.3, 0), P.white, { rx: a, rz: side * 0.06 });
  k.with('detail', () => {
    for (const side of [-1, 1]) {
      const x0 = side * 0.95;
      k.disc(0.24, ...at(x0 - 0.35, 0.41, -0.4), P.honey, { rx: a - Math.PI / 2 }, 12);
      k.disc(0.3, ...at(x0 + 0.3, 0.41, 0.35), side < 0 ? P.sage : P.coral, { rx: a - Math.PI / 2 }, 12);
    }
    k.torus(0.48, 0.06, ...at(0.95 + 0.3, 0.44, 0.35), '#2F9A55', { rx: a - Math.PI / 2 }, Math.PI * 2, 20);
  });
  k.pop();
  // side: a stack of storybooks with a pencil on top
  k.push(S.lx, 0, S.lz);
  const stack: [string, number][] = [[P.coral, 0.15], [P.honey, -0.2], [P.toyBlue, 0.3]];
  stack.forEach(([col, ry], i) => k.block(2.3, 0.5, 1.6, 0, 0.25 + i * 0.52, 0, col, { ry }, 0.06));
  k.rod([-0.9, 1.72, -0.35], [0.95, 1.72, 0.3], 0.13, P.honey, 6);
  k.cone(0.13, 0.35, 1.09, 1.72, 0.35, P.woodLight, 6, { rz: -Math.PI / 2, ry: -0.34 });
  k.pop();
  // two picture cards on the felt, one with a difference circled
  for (const [x, ringed] of [[-3.1, false], [-4.9, true]] as const) {
    k.box(1.5, 0.04, 1.1, x, DECAL_Y + 0.02, 2.8, P.white);
    k.with('detail', () => {
      k.disc(0.22, x - 0.3, DECAL_Y + 0.06, 2.65, P.honey, { rx: -Math.PI / 2 }, 10);
      k.disc(0.22, x + 0.3, DECAL_Y + 0.06, 2.95, ringed ? P.coral : P.toyBlue, { rx: -Math.PI / 2 }, 10);
      if (ringed) k.ring(0.32, 0.42, x + 0.3, DECAL_Y + 0.07, 2.95, '#2F9A55', 18);
    });
  }
};

const towerTumble: Theme = (k) => {
  // hero: a teetering tower of building blocks with a tin sentry on top
  k.push(H.lx, 0, H.lz, 0.15);
  const blocks = [P.honey, P.coral, P.toyBlue, P.sage];
  blocks.forEach((c, i) => k.block(1.7 - i * 0.12, 1.45, 1.7 - i * 0.12, (i % 2 ? 0.12 : -0.08), 0.725 + i * 1.45, 0, c, { ry: i * 0.22 }));
  soldier(k, 0.05, 5.8, 0, 0.22, P.toyBlue);
  k.pop();
  // side: a little felt defence board with a zig-zag cardboard path, two towers and a wind-up mouse
  k.push(S.lx, 0, S.lz, -0.1);
  k.box(2.8, 0.3, 2.8, 0, 0.15, 0, P.feltDark);
  k.with('detail', () => {
    k.box(2.8, 0.06, 0.55, 0, 0.33, -0.8, P.cardboard);
    k.box(0.55, 0.06, 1.6, 0.9, 0.33, 0, P.cardboard);
    k.box(2.0, 0.06, 0.55, 0.2, 0.33, 0.8, P.cardboard);
  });
  for (const [x, z, c] of [[-0.8, 0.05, P.coral], [0.0, 0.05, P.honey]] as const) {
    k.cyl(0.42, 0.48, 0.18, x, 0.39, z, c, 12);
    k.cyl(0.24, 0.3, 0.9, x, 0.93, z, P.cream, 10);
    k.cone(0.32, 0.5, x, 1.63, z, c, 10);
  }
  k.ball(0.22, 0.9, 0.55, 0.2, '#C9CED6', 10);
  k.pop();
};

const siege: Theme = (k) => {
  // hero: a cardboard toy-fort tower with battlements and a pennant
  k.push(H.lx, 0, H.lz);
  k.cyl(1.35, 1.5, 4.6, 0, 2.3, 0, P.cardboard, 14);
  k.cyl(1.55, 1.55, 0.35, 0, 4.75, 0, P.cardboardDark, 14);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.box(0.55, 0.6, 0.4, Math.cos(a) * 1.3, 5.2, Math.sin(a) * 1.3, P.cardboard, { ry: -a });
  }
  k.with('detail', () => {
    k.box(0.7, 1.1, 0.08, 0, 1.0, 1.5, P.woodDark); // door
    k.box(0.36, 0.5, 0.08, 0, 3.2, 1.45, P.ink); // arrow slit
  });
  k.cyl(0.07, 0.07, 1.8, 0, 5.9, 0, P.woodDark, 6);
  k.box(0.9, 0.5, 0.05, 0.45, 6.5, 0, P.coral);
  k.pop();
  // side: an open treasure chest guarded by three dust bunnies
  k.push(S.lx, 0, S.lz, -0.25);
  k.block(1.5, 0.9, 1.0, 0, 0.45, 0, P.woodMid);
  k.box(1.56, 0.14, 1.06, 0, 0.62, 0, P.brass);
  k.box(1.5, 0.12, 0.95, 0, 1.25, -0.62, P.woodLight, { rx: -1.1 });
  k.with('glow', () => k.ball(0.32, 0, 0.95, 0.05, P.honey, 8));
  for (const [x, z, s] of [[-1.2, 0.6, 0.5], [1.15, 0.7, 0.42], [0.1, 1.25, 0.36]] as const) {
    k.ball(s, x, s, z, P.roomFabric, 8);
    k.ball(s * 0.32, x - s * 0.4, s * 1.75, z, P.roomFabric, 6, { s: [0.8, 1.8, 0.7] });
    k.ball(s * 0.32, x + s * 0.4, s * 1.75, z, P.roomFabric, 6, { s: [0.8, 1.8, 0.7] });
  }
  k.pop();
  // a little patchwork play mat on the felt
  for (let i = 0; i < 4; i++) k.box(1.05, 0.04, 1.05, -5.7 + (i % 2) * 1.1, DECAL_Y, 2.0 + Math.floor(i / 2) * 1.1, [P.sage, P.honey, P.coral, P.toyBlue][i]);
};

const hoopHustle: Theme = (k) => {
  // hero: a toy basketball stand: weighted base, pole, backboard, rim and net, a ball on the base
  k.push(H.lx, 0, H.lz);
  k.cyl(1.5, 1.7, 0.6, 0, 0.3, -0.2, P.inkPurple, 16);
  k.cyl(0.18, 0.22, 5.6, 0, 3.4, -0.6, P.toyBlue, 10);
  k.block(2.6, 1.8, 0.22, 0, 6.1, -0.4, P.white, {}, 0.06);
  k.box(1.0, 0.08, 0.05, 0, 5.85, -0.27, P.coral);
  k.box(0.08, 0.7, 0.05, -0.46, 6.15, -0.27, P.coral);
  k.box(0.08, 0.7, 0.05, 0.46, 6.15, -0.27, P.coral);
  k.box(0.2, 0.1, 0.6, 0, 5.4, 0.0, P.coral);
  k.torus(0.62, 0.07, 0, 5.4, 0.62, P.coral, { rx: Math.PI / 2 }, Math.PI * 2, 18);
  k.cyl(0.6, 0.4, 0.7, 0, 5.03, 0.62, P.white, 10, {}, true);
  k.ball(0.55, 0.85, 1.15, 0.55, P.ballOrange, 14);
  k.with('detail', () => {
    k.torus(0.556, 0.03, 0.85, 1.15, 0.55, P.ink, {}, Math.PI * 2, 16);
    k.torus(0.556, 0.03, 0.85, 1.15, 0.55, P.ink, { ry: Math.PI / 2 }, Math.PI * 2, 16);
  });
  k.pop();
  // side: a little rack of three balls
  k.push(S.lx, 0, S.lz, 0.2);
  k.block(2.4, 0.5, 1.1, 0, 0.25, 0, P.woodMid, {}, 0.1);
  for (const [x, c] of [[-0.75, P.ballOrange], [0, P.honey], [0.75, P.ballOrange]] as const) {
    k.ball(0.42, x, 0.92, 0, c, 12);
    k.with('detail', () => k.torus(0.425, 0.025, x, 0.92, 0, P.ink, { ry: Math.PI / 2 }, Math.PI * 2, 14));
  }
  k.pop();
  // a little painted half-court on the felt, with a taped arc and the three spot colours (on the
  // right: both roads to this gate come in on its left)
  k.disc(1.7, 6.4, DECAL_Y, 3.3, P.woodLight, { rx: -Math.PI / 2 }, 20, 0, Math.PI);
  k.add(new THREE.RingGeometry(1.1, 1.25, 20, 1, 0, Math.PI), P.white, 6.4, DECAL_Y + 0.03, 3.3, { rx: -Math.PI / 2 });
  for (const [x, c] of [[5.6, P.sage], [6.4, P.toyBlue], [7.2, P.coral]] as const) k.disc(0.2, x, DECAL_Y + 0.04, 3.95, c, { rx: -Math.PI / 2 }, 10);
};

export const GATE_THEMES: Record<MinigameId, Theme> = {
  'hoop-hustle': hoopHustle,
  'toybox-siege': siege,
  'copycat-conductor': copycat,
  'jack-in-the-box': jack,
  'find-the-original': findOriginal,
  'red-light-green-light': redLight,
  'wind-up-dash': windUpDash,
  'music-box-rhythm': musicBox,
  'inferno-escape': inferno,
  'midnight-hunger': midnight,
  'toy-squad': toySquad,
  'blink-duel': blink,
  'spellbox-showdown': spellbox,
  'odd-page-out': oddPageOut,
  'toy-tower-tumble': towerTumble,
};

/** Build every gate's surroundings into `k` (gate-local frames are pushed here). */
export function buildGateDecor(k: Kit, atlas: SignAtlas): DecorExtras {
  const out: DecorExtras = { dominoes: [] };
  for (const g of GATES) {
    const theme = GATE_THEMES[g.game];
    if (!theme) continue;
    k.push(g.x, 0, g.z, g.rot);
    theme(k, atlas, g, out);
    k.pop();
  }
  return out;
}

// ------------------------------------------------------------------ boards

/** Gate name board, in gate-local space. */
export const GATE_BOARD = { y: GATE.height + 1.25, z: 0.9, tilt: -0.12, w: 8.6, h: 2.1, d: 0.3 };

/** Signpost arrow boards: size, vertical spacing and the height of the lowest. */
export const POST_BOARD = { len: 7, h: 1.3, step: 1.5, y0: 2.6 };

export interface PostBoard {
  label: string;
  sub: string;
  accent: string;
  /** Yaw of the board (its arrow points along local +x). */
  rotY: number;
  y: number;
}
export interface Signpost {
  id: SignpostId;
  x: number;
  z: number;
  boards: PostBoard[];
}

/** Height of a signpost's pole for a number of boards (the collider tops in layout.ts match). */
export const signpostTop = (boards: number) => POST_BOARD.y0 + (boards - 1) * POST_BOARD.step + 1.2;

/**
 * Every signpost and its boards, lowest first (the lowest are in view at toy height):
 *  - by spawn: the way to the trials (over the bridge), then the spawn table's buildings;
 *  - at the spawn-table end of the bridge: on to the trials, back to the plaza;
 *  - on the gates table by the bridge landing: each wing of gates (listing its trials), and back.
 */
export function signposts(): Signpost[] {
  const toTrials = { label: 'Trials table', sub: `All ${GATES.length} trials · over the bridge`, accent: P.honey };
  const gatesCentre = { x: BRIDGE.x, z: (GATE_LOOP.north + GATE_LOOP.south) / 2 };
  const districts = GATE_DISTRICTS.map((d) => {
    const gs = GATES.filter((g) => g.district === d.id);
    const stands = gs.map((g) => gateLocal(g, 0, 2.2));
    const x = stands.reduce((s, p) => s + p.x, 0) / stands.length;
    const z = stands.reduce((s, p) => s + p.z, 0) / stands.length;
    return { label: d.label, sub: gs.map((g) => g.short).join(' · '), accent: gs[0]?.color ?? P.honey, x, z };
  });
  const lists: Record<SignpostId, { label: string; sub: string; accent: string; x: number; z: number }[]> = {
    spawn: [
      { ...toTrials, x: BRIDGE.x, z: BRIDGE.deckA },
      { label: 'Scoreboard', sub: 'Records · secrets', accent: P.coral, ...frontOf(SCOREBOARD.x, SCOREBOARD.z, SCOREBOARD.rot, 3) },
      { label: 'Pavilion', sub: 'Tournaments', accent: P.inkPurple, ...frontOf(PAVILION.x, PAVILION.z, PAVILION.rot, PAVILION.d / 2) },
      { label: 'Workshop', sub: 'Paint · hats · keys', accent: P.toyBlue, ...frontOf(WORKSHOP.x, WORKSHOP.z, WORKSHOP.rot, 5) },
      { label: 'Odds & Ends', sub: 'Shop', accent: P.sage, ...frontOf(SHOP.x, SHOP.z, SHOP.rot, 8) },
    ],
    'bridge-hub': [
      { ...toTrials, ...gatesCentre },
      { label: 'Plaza', sub: 'Scoreboard · Pavilion · shop', accent: P.coral, x: FOUNTAIN.x, z: FOUNTAIN.z },
    ],
    gates: [...districts, { label: 'Back to the plaza', sub: 'Over the bridge', accent: P.coral, x: BRIDGE.x, z: BRIDGE.deckB }],
  };
  return (Object.keys(lists) as SignpostId[]).map((id) => {
    const post = SIGNPOSTS[id];
    return {
      id,
      x: post.x,
      z: post.z,
      boards: lists[id].map((t, i) => ({ label: t.label, sub: t.sub, accent: t.accent, rotY: Math.atan2(-(t.z - post.z), t.x - post.x), y: POST_BOARD.y0 + i * POST_BOARD.step })),
    };
  });
}

/** The spawn signpost's boards. */
export const fingerpostBoards = () => signposts().find((p) => p.id === 'spawn')!.boards;

/** Painted faces of every gate board and fingerpost board, into the decal layer. */
export function buildSignFaces(k: Kit, atlas: SignAtlas) {
  k.with('decal', () => {
    for (const g of GATES) {
      const r = atlas.board({ title: g.title, sub: g.sub, accent: g.color, arrow: null });
      k.push(g.x, 0, g.z, g.rot);
      k.quad(GATE_BOARD.w - 0.3, GATE_BOARD.h - 0.25, 0, GATE_BOARD.y, GATE_BOARD.z + 0.16, r, '#ffffff', { rx: GATE_BOARD.tilt });
      k.pop();
    }
    const L = POST_BOARD.len;
    for (const post of signposts()) {
      for (const b of post.boards) {
        k.push(post.x, b.y, post.z, b.rotY);
        const cx = L / 2 + 0.2 - 0.35;
        // the front reads left → right with the point on the right; so does the back
        k.quad(L - 0.9, POST_BOARD.h - 0.15, cx, 0, 0.22, atlas.board({ title: b.label, sub: b.sub, accent: b.accent, arrow: 'right' }));
        k.quad(L - 0.9, POST_BOARD.h - 0.15, cx, 0, -0.22, atlas.board({ title: b.label, sub: b.sub, accent: b.accent, arrow: 'left' }), '#ffffff', { ry: Math.PI });
        k.pop();
      }
    }
  });
}
