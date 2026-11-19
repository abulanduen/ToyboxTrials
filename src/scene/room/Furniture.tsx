/**
 * Room furniture: everything that makes the room around the two tables a real, lived-in kid's
 * bedroom. Positions are data in roomLayout.ts (with the family dog's route and the slots for the
 * generated models).
 *
 * Loaded lazily (its own chunk) once the hub is interactive. Everything is built in code, baked
 * (bake.ts) and merged, so the whole lot is three draw calls: solid furniture, wall art (one small
 * atlas) and the rug. Nothing here has a collider: all of it sits off the tables.
 *
 * From toy height only things taller than the tables (75 cm) are visible, so the layout favours
 * tall pieces: bookshelf, wardrobe, the bed's headboard and the pictures over it, the chest of
 * drawers and what stands on it, floor lamps, a big plant, things on high shelves.
 *
 * The layout: the desk (gates table) under the window with the bookshelf beside it; the bed in the
 * right-hand corner, headboard to the window wall, with a bedside table and lamp; a chest of
 * drawers on the right wall; the wardrobe and the door on the left wall; the toy chest, a beanbag,
 * the cube storage (with the teddy) and the moving boxes along the wall behind the usual camera;
 * a rug in front of the spawn table, where the sun lands; slippers by the bed; the dog's bed and
 * water bowl by the cube storage. The floor between them is kept clear for the dog (roomLayout.ts
 * DOG_PATH, a 60 cm corridor at least).
 *
 * Placeholders a generated GLB could replace (docs/07-asset-requests.md, asset manifest): PLANT,
 * TEDDY, GLOBE, the dog stand-in (RoomDog.tsx); the beanbag is the sleeping cat's spot.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ROOM } from '../../game/palette';
import { ATLAS, roomAtlasTexture, rugTexture } from '../textures';
import { Builder, SHELL, WINDOW, bakeGeometry, bakedMaterial, irradiance } from './bake';
import { ROOM_LAYOUT as RL } from './roomLayout';
import { RoomDog } from './RoomDog';

const F = SHELL.floorY;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Flat textured quads (pictures, posters, clock) sharing the room atlas; lighting baked per corner. */
class Quads {
  private pos: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  /** Quad centred at local (x, y, z) of the builder's current frame, facing local +z. */
  add(b: Builder, cell: number, x: number, y: number, z: number, w: number, h: number) {
    const m = b.matrix;
    const n = new THREE.Vector3(0, 0, 1).transformDirection(m);
    const u0 = (cell % ATLAS.cols) / ATLAS.cols;
    const v1 = 1 - Math.floor(cell / ATLAS.cols) / ATLAS.rows;
    const du = 1 / ATLAS.cols;
    const dv = 1 / ATLAS.rows;
    const e = new THREE.Color();
    const corner = (sx: number, sy: number) => {
      const p = new THREE.Vector3(x + (sx * w) / 2, y + (sy * h) / 2, z).applyMatrix4(m);
      irradiance(p.x, p.y, p.z, n.x, n.y, n.z, e);
      this.pos.push(p.x, p.y, p.z);
      this.uv.push(u0 + (sx > 0 ? du : 0), v1 - (sy > 0 ? 0 : dv));
      this.col.push(e.r, e.g, e.b);
    };
    corner(-1, -1);
    corner(1, -1);
    corner(1, 1);
    corner(-1, -1);
    corner(1, 1);
    corner(-1, 1);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** A framed picture on the wall: four frame bars with the art quad recessed between them. */
function framed(b: Builder, q: Quads, cell: number, x: number, y: number, w: number, h: number, frame: string = ROOM.windowFrame) {
  const t = 3.2;
  b.box(w + t * 2, t, 3, x, y + h / 2 + t / 2, 0.6, frame);
  b.box(w + t * 2, t, 3, x, y - h / 2 - t / 2, 0.6, frame);
  b.box(t, h, 3, x - w / 2 - t / 2, y, 0.6, frame);
  b.box(t, h, 3, x + w / 2 + t / 2, y, 0.6, frame);
  q.add(b, cell, x, y, 1.1, w, h);
}

function chair(b: Builder, x: number, z: number, ry: number) {
  const c = ROOM.chairWood;
  b.push(x, F, z, ry);
  b.box(42, 3.5, 42, 0, 45, 0, c);
  for (const sx of [-18, 18]) {
    b.box(4, 44, 4, sx, 22, 18, c);
    b.box(4.2, 108, 4.2, sx, 54, -19, c); // back legs run up into the back posts
  }
  b.box(40, 4, 3, 0, 20, 18, c);
  for (const y of [66, 80]) b.box(34, 6, 2.4, 0, y, -19, c);
  b.box(44, 10, 3.6, 0, 103, -19, c);
  b.pop();
}

function floorLamp(b: Builder, x: number, z: number, h: number) {
  b.cyl(13, 15, 3, x, F + 1.5, z, ROOM.lampMetal, 16);
  b.rod([x, F + 3, z], [x, F + h, z], 1.4, ROOM.lampMetal, 6);
  b.cyl(15, 22, 30, x, F + h + 6, z, ROOM.lampShade, 18, { glow: 0.5 });
}

function bookshelf(b: Builder, detail: boolean) {
  const w = 88;
  const d = 30;
  const h = 202;
  const r = rng(12);
  b.push(-124, F, SHELL.minZ + d / 2 + 1.5);
  b.box(3, h, d, -w / 2 + 1.5, h / 2, 0, ROOM.shelfWood);
  b.box(3, h, d, w / 2 - 1.5, h / 2, 0, ROOM.shelfWood);
  b.box(w + 4, 4, d + 3, 0, h, 0.5, ROOM.shelfWood);
  b.box(w - 6, h, 1.5, 0, h / 2, -d / 2 + 1, ROOM.darkWood);
  const shelves = [5, 45, 85, 124, 163];
  shelves.forEach((y, row) => {
    b.box(w - 6, 2.6, d - 3, 0, y, 0.5, ROOM.shelfWood);
    const gap = (shelves[row + 1] ?? h - 2) - y - 4;
    const visible = F + y > -30; // rows below the table top are never seen from toy height
    if (!visible || !detail) {
      for (let i = 0; i < 3; i++) b.box(22, gap * (0.7 + r() * 0.2), 19, -26 + i * 26, y + 1.3 + (gap * 0.8) / 2, 2, ROOM.bookSpines[(row + i) % ROOM.bookSpines.length]);
      return;
    }
    let x = -w / 2 + 5;
    while (x < w / 2 - 9) {
      if (r() < 0.07) {
        x += 6 + r() * 6; // a gap, sometimes with a book lying flat
        continue;
      }
      const bw = 2.6 + r() * 3.6;
      const bh = Math.min(gap, 20 + r() * 12);
      const lean = r() < 0.1 ? 0.16 : 0;
      b.box(bw, bh, 18 + r() * 5, x + bw / 2 + lean * 5, y + 1.3 + bh / 2, 2.5, ROOM.bookSpines[Math.floor(r() * ROOM.bookSpines.length)], { rz: -lean });
      x += bw + 0.35 + lean * 8;
    }
  });
  // On top: a globe (GLOBE placeholder), a trailing plant and a storage box.
  b.cyl(6, 7, 2, -22, h + 3, 0, ROOM.darkWood, 12);
  b.rod([-22, h + 4, 0], [-22, h + 9, 0], 1, ROOM.darkWood);
  b.ball(11.5, -22, h + 19, 0, ROOM.globeSea, 14);
  if (detail) {
    for (const [ax, ay, az, s] of [
      [5, 4, 8, 5],
      [-7, -3, 7, 6],
      [-2, 7, -8, 5],
      [8, -5, -4, 4],
    ])
      b.ball(s, -22 + ax, h + 19 + ay, az, ROOM.globeLand, 7, [1, 0.8, 0.5]);
  }
  b.box(26, 16, 22, 22, h + 10, 0, ROOM.bin);
  b.box(27, 3, 23, 22, h + 19, 0, ROOM.cardboardBox);
  b.pop();
}

function wardrobe(b: Builder) {
  const depth = 58;
  const len = 104;
  const h = 196;
  b.push(SHELL.minX + depth / 2, F, -128, Math.PI / 2); // local +z → room +x (the doors)
  b.box(len, h, depth, 0, h / 2, 0, ROOM.wardrobe);
  b.box(len + 6, 5, depth + 4, 0, h + 1, 1, ROOM.wardrobe);
  b.box(len + 2, 8, depth + 1, 0, 4, 0.6, ROOM.darkWood);
  for (const s of [-1, 1]) {
    b.box(len / 2 - 4, h - 26, 3, (s * len) / 4, h / 2 + 4, depth / 2, ROOM.wardrobe);
    b.box(len / 2 - 16, h - 50, 4.2, (s * len) / 4, h / 2 + 4, depth / 2, ROOM.paleWood);
    b.ball(2.2, s * 5, h / 2, depth / 2 + 3, ROOM.curtainRod, 8);
  }
  // suitcase + rolled blanket on top
  b.box(60, 20, 38, -12, h + 14, -4, ROOM.cardboardBox);
  b.box(62, 3, 40, -12, h + 14, -4, ROOM.darkWood);
  b.cyl(9, 9, 44, 30, h + 13, 2, ROOM.blanket, 12, { rx: Math.PI / 2 });
  b.pop();
}

function bed(b: Builder, detail: boolean) {
  b.push(RL.bed.x, F, RL.bed.z, 0);
  b.box(110, 30, 200, 0, 21, 0, ROOM.bedFrame);
  b.soft(112, 22, 150, 0, 49, 22, ROOM.blanket, 8);
  b.soft(108, 16, 46, 0, 45, -76, ROOM.throwBlanket, 6);
  b.soft(70, 14, 34, 0, 56, -74, ROOM.pillow, 6, { rx: -0.25 });
  b.box(118, 96, 6, 0, 72, -101, ROOM.bedFrame);
  b.box(124, 6, 9, 0, 121, -101, ROOM.shelfWood);
  // quilt hanging over the side facing the room, and a plush rabbit on the pillow
  b.box(3, 26, 140, -57, 44, 22, ROOM.blanket);
  if (detail) {
    b.ball(7, 22, 66, -66, ROOM.teddyLight, 10, [1, 1.1, 0.9]);
    b.ball(5, 22, 77, -66, ROOM.teddyLight, 10);
    for (const s of [-1, 1]) b.ball(1.6, 22 + s * 2.5, 86, -66, ROOM.teddyLight, 6, [1, 3.2, 0.8]);
  }
  b.pop();
}

/** Bedside table with a drawer, a lamp, a book and a glass of water. */
function nightstand(b: Builder) {
  const n = RL.nightstand;
  b.push(n.x, F, n.z, 0);
  b.box(n.w, n.h - 4, n.d, 0, (n.h - 4) / 2 + 4, 0, ROOM.drawers);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(3, 4, 3, sx * (n.w / 2 - 3), 2, sz * (n.d / 2 - 3), ROOM.darkWood);
  b.box(n.w - 6, 14, 1.5, 0, n.h - 12, n.d / 2 + 0.4, ROOM.paleWood);
  b.ball(1.4, 0, n.h - 12, n.d / 2 + 1.8, ROOM.curtainRod, 6);
  // table lamp
  b.cyl(6, 7, 2, -6, n.h + 1, -4, ROOM.lampMetal, 14);
  b.rod([-6, n.h + 2, -4], [-6, n.h + 30, -4], 0.8, ROOM.lampMetal, 6);
  b.cyl(8, 12, 15, -6, n.h + 34, -4, ROOM.lampShade, 16, { glow: 0.55 });
  b.box(14, 3, 10, 8, n.h + 1.5, 6, ROOM.bookSpines[3], { ry: 0.3 });
  b.cyl(2.6, 2.3, 9, 9, n.h + 7.5, -6, ROOM.radiator, 10);
  b.pop();
}

/** Chest of drawers on the right wall: four rows of drawers, a photo, a trophy and a piggy bank on top. */
function chestOfDrawers(b: Builder, detail: boolean) {
  const c = RL.drawers;
  b.push(c.x, F, c.z, -Math.PI / 2); // local +z → room −x (the drawer fronts)
  b.box(c.w, c.h - 6, c.d, 0, (c.h - 6) / 2 + 6, 0, ROOM.drawers);
  b.box(c.w + 4, 3, c.d + 3, 0, c.h + 0.5, 0.5, ROOM.paleWood);
  b.box(c.w - 4, 6, c.d - 4, 0, 3, 0, ROOM.darkWood);
  const rows = 4;
  const rh = (c.h - 14) / rows;
  for (let r = 0; r < rows; r++)
    for (const sx of r === 0 ? [-1, 1] : [0]) {
      const w = r === 0 ? c.w / 2 - 5 : c.w - 6;
      const y = 8 + rh * (r + 0.5);
      b.box(w, rh - 3, 2, sx * (c.w / 4), y, c.d / 2 + 0.6, ROOM.drawers);
      for (const kx of r === 0 ? [0] : [-c.w / 4, c.w / 4]) b.ball(1.8, sx * (c.w / 4) + kx, y, c.d / 2 + 2.2, ROOM.curtainRod, 8);
    }
  // on top: a framed photo (art cell added by the caller), a trophy and a piggy bank
  b.box(18, 24, 2, -28, c.h + 14, -8, ROOM.darkWood, { rx: -0.12 });
  b.cyl(5, 6, 3, 10, c.h + 3.5, 0, ROOM.darkWood, 12);
  b.cyl(1.4, 2.4, 8, 10, c.h + 9, 0, ROOM.cushionA, 10);
  b.cyl(6, 2, 8, 10, c.h + 17, 0, ROOM.cushionA, 14);
  if (detail) {
    b.ball(8, 32, c.h + 9, 4, ROOM.slipper, 12, [1.25, 1, 1]);
    b.ball(3, 42, c.h + 10, 4, ROOM.slipper, 8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(1.5, 1.5, 4, 32 + sx * 5, c.h + 2, 4 + sz * 4, ROOM.slipper, 6);
  }
  b.pop();
}

/** Toy chest with its lid propped open, a ball and a toy rocket peeking out. */
function toyChest(b: Builder, detail: boolean) {
  const t = RL.toyChest;
  b.push(t.x, F, t.z, Math.PI); // local +z → room −z (faces the tables)
  b.box(t.w, t.h, t.d, 0, t.h / 2, 0, ROOM.toyChest);
  for (const x of [-t.w / 2 + 14, t.w / 2 - 14]) b.box(6, t.h + 0.4, t.d + 0.6, x, t.h / 2, 0, ROOM.toyChestTrim);
  b.box(t.w + 1, 4, t.d + 1, 0, 2, 0, ROOM.toyChestTrim);
  // lid hinged at the back, propped half open
  b.push(0, t.h, -t.d / 2, 0);
  b.box(t.w + 2, 3, t.d + 2, 0, 1.5, t.d / 2, ROOM.toyChest, { rx: -0.85 });
  b.pop();
  b.ball(11, -20, t.h + 4, 4, ROOM.cushionB, 12);
  if (detail) {
    b.cyl(4, 4, 26, 18, t.h + 6, -2, ROOM.windowFrame, 10, { rz: 0.5 });
    b.add(new THREE.ConeGeometry(4, 8, 10), ROOM.cushionB, 18 - Math.sin(0.5) * 17, t.h + 6 + Math.cos(0.5) * 17, -2, { rz: 0.5 });
    b.box(9, 9, 9, 34, t.h + 1, 6, ROOM.cushionA, { ry: 0.4, rz: 0.2 });
  }
  b.pop();
}

/** A squashy beanbag (the sleeping cat's spot when that model arrives). */
function beanbag(b: Builder) {
  const g = RL.beanbag;
  b.ball(g.r, g.x, F + g.r * 0.55, g.z, ROOM.beanbag, 16, [1, 0.6, 1]);
  b.ball(g.r * 0.7, g.x + 6, F + g.r * 0.95, g.z + 10, ROOM.beanbag, 14, [1, 0.55, 0.9]);
}

/** The dog's round bed and water bowl. */
function dogCorner(b: Builder) {
  const d = RL.dogBed;
  b.cyl(d.r, d.r + 2, 6, d.x, F + 3, d.z, ROOM.dogBed, 24);
  b.add(new THREE.TorusGeometry(d.r - 5, 6, 8, 24), ROOM.dogBed, d.x, F + 9, d.z, { rx: Math.PI / 2 });
  b.cyl(d.r - 9, d.r - 9, 4, d.x, F + 7, d.z, ROOM.dogBedCushion, 22);
  const w = RL.waterBowl;
  b.cyl(9, 11, 6, w.x, F + 3, w.z, ROOM.bowl, 16);
  b.cyl(7.5, 7.5, 0.6, w.x, F + 5.4, w.z, ROOM.globeSea, 16);
}

/** A pair of slippers by the bed. */
function slippers(b: Builder) {
  const s = RL.slippers;
  b.soft(10, 5, 25, s.x - 7, F + 2.5, s.z, ROOM.slipper, 2.4, { ry: 0.15 });
  b.soft(10, 5, 25, s.x + 7, F + 2.5, s.z + 4, ROOM.slipper, 2.4, { ry: -0.1 });
}

function cubeStorage(b: Builder, detail: boolean) {
  const cell = 32;
  const cols = 3;
  const rows = 4;
  const w = cols * cell + 4;
  const h = rows * cell + 4;
  const d = 36;
  b.push(RL.cubes.x, F, RL.cubes.z, Math.PI);
  b.box(w, h, d - 2, 0, h / 2, -1, ROOM.darkWood); // dark interior
  for (let i = 0; i <= cols; i++) b.box(3, h, d, -w / 2 + 1.5 + i * (cell + 0.33), h / 2, 0, ROOM.paleWood);
  for (let j = 0; j <= rows; j++) b.box(w, 3, d, 0, 1.5 + j * (cell + 0.33), 0, ROOM.paleWood);
  const bins = [ROOM.bin, ROOM.cushionB, ROOM.sofa, ROOM.cushionA, ROOM.leaf];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if ((i + j * 2) % 5 === 4) continue; // an open cubby
      b.box(cell - 5, cell - 6, 8, -w / 2 + 2 + cell / 2 + i * (cell + 0.33), 3 + cell / 2 + j * (cell + 0.33), d / 2 - 3, bins[(i * 2 + j) % bins.length]);
    }
  // TEDDY placeholder: a soft bear sitting on top, watching the table.
  const tx = 26;
  const ty = h + 1;
  b.ball(12, tx, ty + 11, 0, ROOM.teddy, 12, [1, 1.1, 0.9]);
  b.ball(8.5, tx, ty + 29, 1, ROOM.teddy, 12);
  b.ball(3.4, tx, ty + 27, 8.4, ROOM.teddyLight, 8);
  for (const s of [-1, 1]) {
    b.ball(3.2, tx + s * 6.4, ty + 36, 0, ROOM.teddy, 8);
    b.ball(4.2, tx + s * 11, ty + 15, 3, ROOM.teddy, 8, [1, 1.7, 1], { rz: s * 0.5 });
    b.ball(4.6, tx + s * 7, ty + 3.5, 9, ROOM.teddy, 8, [1, 1, 1.7]);
  }
  if (detail) {
    // board-game boxes
    b.box(40, 6, 28, -26, h + 4, 0, ROOM.cushionB, { ry: 0.1 });
    b.box(38, 5, 26, -25, h + 9.5, 0, ROOM.sofa, { ry: -0.12 });
    b.box(30, 5, 24, -27, h + 14.5, 0, ROOM.cushionA, { ry: 0.3 });
  }
  b.pop();
}

function plant(b: Builder, x: number, z: number, detail: boolean) {
  // PLANT placeholder: a tall fiddle-leaf-style houseplant.
  const r = rng(31);
  b.cyl(18, 13, 36, x, F + 18, z, ROOM.terracotta, 14);
  b.cyl(16.5, 16.5, 2, x, F + 35.4, z, ROOM.darkWood, 14);
  b.rod([x, F + 36, z], [x + 3, F + 150, z - 2], 2, ROOM.darkWood, 6);
  const n = detail ? 20 : 11;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const a = i * 2.4;
    const y = F + 72 + k * 92;
    const out = 16 + (1 - k) * 12 + r() * 6;
    b.ball(
      1,
      x + 3 * k + Math.cos(a) * out,
      y + r() * 6,
      z + Math.sin(a) * out,
      i % 3 === 0 ? ROOM.leafDark : ROOM.leaf,
      7,
      [15 + r() * 5, 1.6, 9 + r() * 3],
      { ry: -a, rz: 0.35 + r() * 0.5 },
    );
  }
}

function buildFurniture(detail: boolean) {
  const b = new Builder();
  const q = new Quads();
  const W = WINDOW;

  // ----- window wall (the hero view) -----
  bookshelf(b, detail);
  nightstand(b);
  // on the sill, silhouetted against the garden
  {
    const sy = W.y0 + 0.6;
    const sz = W.zIn + 3;
    b.cyl(7.5, 5.5, 11, -14, sy + 5.5, sz, ROOM.terracotta, 12);
    const r = rng(8);
    for (let i = 0; i < (detail ? 9 : 5); i++) {
      const a = i * 2.2;
      b.ball(1, -14 + Math.cos(a) * 5, sy + 17 + r() * 9, sz + Math.sin(a) * 3, i % 2 ? ROOM.leaf : ROOM.leafDark, 6, [2.6, 9 + r() * 5, 2.6], { rz: Math.cos(a) * 0.5, rx: Math.sin(a) * 0.3 });
    }
    if (detail) {
      b.box(20, 3.2, 14, 66, sy + 1.6, sz, ROOM.bookSpines[0], { ry: 0.2 });
      b.box(18, 2.8, 13, 66.5, sy + 4.6, sz, ROOM.bookSpines[1], { ry: -0.1 });
      b.cyl(3.6, 3, 5, 82, sy + 2.5, sz, ROOM.pendant, 10);
      b.ball(4.2, 82, sy + 8, sz, ROOM.leaf, 8, [1, 1.25, 1]);
    }
  }
  if (detail) {
    // radiator under the sill
    const cx = (W.x0 + W.x1) / 2;
    for (let i = 0; i < 15; i++) b.box(4.4, 58, 9, cx - 49 + i * 7, F + 43, W.zIn + 7, ROOM.radiator);
    b.box(108, 3, 6, cx, F + 70, W.zIn + 7, ROOM.radiator);
    b.box(108, 3, 6, cx, F + 17, W.zIn + 7, ROOM.radiator);
  }
  // clock + pictures to the right of the window
  b.push(0, 0, SHELL.minZ, 0);
  b.cyl(18.5, 18.5, 3, 150, 128, 1, ROOM.darkWood, 20, { rx: Math.PI / 2 });
  q.add(b, 4, 150, 128, 2.9, 31, 31);
  framed(b, q, 3, 204, 108, 40, 52);
  framed(b, q, 1, 256, 96, 30, 30, ROOM.shelfWood);
  b.pop();

  // ----- left wall: wardrobe, posters, (door is part of the shell) -----
  wardrobe(b);
  b.push(SHELL.minX, 0, 0, Math.PI / 2);
  // local x runs along −z here: a picture at local x sits at world z = −x
  framed(b, q, 6, 47, 96, 40, 54, ROOM.darkWood);
  q.add(b, 7, 2, 86, 0.9, 28, 78);
  b.pop();

  // ----- right-hand corner and right wall: bed, chest of drawers, shelf of treasures, pictures, pennants -----
  bed(b, detail);
  chestOfDrawers(b, detail);
  slippers(b);
  {
    // the photo on the chest of drawers (the frame is part of chestOfDrawers)
    b.push(RL.drawers.x, F, RL.drawers.z, -Math.PI / 2);
    q.add(b, 3, -28, RL.drawers.h + 14.3, -8 + 1.2, 14, 20);
    b.pop();
  }
  b.push(SHELL.maxX, 0, 0, -Math.PI / 2);
  // local x runs along +z here
  b.box(120, 3, 20, -40, 62, 10, ROOM.shelfWood);
  for (const x of [-88, 8]) b.box(3, 12, 16, x, 55, 8, ROOM.shelfWood);
  // toys on the shelf: rocket, stacked blocks, ball, a few books
  b.cyl(5, 5, 16, -80, 71.5, 10, ROOM.windowFrame, 10);
  b.add(new THREE.ConeGeometry(5, 9, 10), ROOM.cushionB, -80, 84, 10);
  b.box(10, 10, 10, -56, 68.5, 10, ROOM.sofa, { ry: 0.3 });
  b.box(10, 10, 10, -55, 78.5, 10, ROOM.cushionA, { ry: -0.2 });
  b.ball(8, -32, 71.5, 10, ROOM.cushionB, 10);
  for (let i = 0; i < 5; i++) b.box(4 + (i % 2), 18 + ((i * 5) % 7), 14, -10 + i * 5.2, 73 + ((i * 5) % 7) / 2, 10, ROOM.bookSpines[(i + 2) % ROOM.bookSpines.length]);
  framed(b, q, 0, -52, 118, 56, 40);
  framed(b, q, 2, 14, 112, 34, 34, ROOM.shelfWood);
  q.add(b, 5, 62, 84, 0.9, 30, 30);
  if (detail) {
    // pennant string across the bed corner
    const cols = [ROOM.cushionA, ROOM.sofa, ROOM.cushionB, ROOM.leaf, ROOM.bin];
    const n = 13;
    let prev: [number, number, number] | null = null;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const p: [number, number, number] = [-176 + k * 150, 158 - Math.sin(k * Math.PI) * 14, 2.2];
      if (prev) b.rod(prev, p, 0.35, ROOM.darkWood, 4);
      if (i > 0 && i < n) b.add(new THREE.ConeGeometry(6.5, 13, 3), cols[i % cols.length], p[0], p[1] - 7, p[2], { rx: Math.PI, ry: Math.PI / 3 }, [1, 1, 0.12]);
      prev = p;
    }
  }
  b.pop();

  // ----- wall behind the usual camera: toy chest, beanbag, cube storage, dog corner, lamp, boxes, plant -----
  toyChest(b, detail);
  beanbag(b);
  cubeStorage(b, detail);
  dogCorner(b);
  floorLamp(b, RL.floorLamp.x, RL.floorLamp.z, 148);
  plant(b, RL.plant.x, RL.plant.z, detail);
  b.push(0, 0, SHELL.maxZ, Math.PI);
  // local x = −world x
  framed(b, q, 0, -60, 96, 60, 44);
  framed(b, q, 1, -6, 104, 36, 36, ROOM.shelfWood);
  framed(b, q, 2, 36, 92, 30, 40);
  // a swag of fairy lights above the toy chest (tiny self-lit bulbs: they bokeh nicely on High)
  {
    const n = detail ? 16 : 9;
    let prev: [number, number, number] | null = null;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const p: [number, number, number] = [-150 + k * 230, 138 - Math.sin(k * Math.PI) * 13 - Math.sin(k * Math.PI * 3) * 3, 2.5];
      if (prev) b.rod(prev, p, 0.3, ROOM.darkWood, 4);
      if (i > 0 && i < n) b.ball(1.7, p[0], p[1] - 2.2, p[2], ROOM.fairyLight, 6, undefined, { glow: 2.6 });
      prev = p;
    }
  }
  // a wall shelf with a trailing plant, left of the pictures as you face the wall
  b.box(64, 3, 18, 96, 66, 9, ROOM.shelfWood);
  b.cyl(7, 5.5, 10, 112, 72.5, 9, ROOM.terracotta, 10);
  for (let i = 0; i < (detail ? 8 : 4); i++) b.ball(1, 112 + Math.cos(i * 2.3) * 7, 74 - i * 2.6, 11 + Math.sin(i * 2.3) * 5, i % 2 ? ROOM.leaf : ROOM.leafDark, 6, [4.5, 6.5, 2.5], { rz: Math.cos(i * 2.3) * 0.5 });
  for (let i = 0; i < 4; i++) b.box(4 + (i % 2), 17 + ((i * 3) % 5), 13, 74 + i * 5.2, 76 + ((i * 3) % 5) / 2, 9, ROOM.bookSpines[(i + 4) % ROOM.bookSpines.length]);
  b.pop();
  // moving boxes in the corner with a ball on top
  b.box(62, 46, 48, 262, F + 23, 226, ROOM.cardboardBox, { ry: 0.12 });
  b.box(52, 40, 42, 264, F + 66, 228, ROOM.cardboardBox, { ry: -0.2 });
  b.box(40, 34, 36, 262, F + 103, 228, ROOM.cardboardBox, { ry: 0.3 });
  b.ball(13, 262, F + 133, 228, ROOM.cushionB, 12);

  // ----- around the spawn table -----
  chair(b, RL.chair.x, RL.chair.z, RL.chair.ry);
  // pendant lamp over the table
  b.rod([0, SHELL.ceilY, -8], [0, 134, -8], 0.5, ROOM.lampMetal, 5);
  b.cyl(5, 6, 3, 0, SHELL.ceilY - 1.5, -8, ROOM.trim, 12);
  b.cyl(7, 31, 24, 0, 122, -8, ROOM.pendant, 20);
  b.cyl(28, 28, 1.2, 0, 109.8, -8, ROOM.lampShade, 20, { glow: 0.5 });

  // ----- rug (its own texture) -----
  const rug = new THREE.PlaneGeometry(RL.rug.w, RL.rug.d, 10, 5);
  rug.rotateX(-Math.PI / 2);
  rug.translate(RL.rug.x, F + 0.6, RL.rug.z);
  bakeGeometry(rug, '#FFFFFF');

  return { solid: b.build(), art: q.build(), rug };
}

/** `detail = false` (Low tier) drops the small clutter and keeps the big silhouettes. */
export default function RoomFurniture({ detail }: { detail: boolean }) {
  const o = useMemo(() => {
    const g = buildFurniture(detail);
    return {
      ...g,
      mat: bakedMaterial(),
      artMat: bakedMaterial({ map: roomAtlasTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      rugMat: bakedMaterial({ map: rugTexture(ROOM.rug, ROOM.rugAccent), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    };
  }, [detail]);
  useEffect(
    () => () => {
      o.solid.dispose();
      o.art.dispose();
      o.rug.dispose();
      o.mat.dispose();
      o.artMat.dispose();
      o.rugMat.dispose();
    },
    [o],
  );
  return (
    <group>
      <mesh geometry={o.solid} material={o.mat} />
      <mesh geometry={o.art} material={o.artMat} />
      <mesh geometry={o.rug} material={o.rugMat} />
      <RoomDog />
    </group>
  );
}
