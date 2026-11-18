/**
 * Room furniture: the things that make the playroom feel like a real, lived-in, giant room.
 *
 * Loaded lazily (its own chunk) once the hub is interactive. Everything is built in code, baked
 * (bake.ts) and merged, so the whole lot is three draw calls: solid furniture, wall art (one small
 * atlas) and the rug. Nothing here has a collider: all of it sits off the table.
 *
 * From toy height only things taller than the table (75 cm) are visible, so the layout favours
 * tall pieces: bookshelf, wardrobe, chair backs, floor lamps, a big plant, things on high shelves.
 *
 * Floor kept clear for the family dog (docs/06, docs/07): the strip in front of the table,
 * roughly x −180…140, z 60…200 (the rug). Its bed spot is the rug; its walk goes round the
 * right-hand chair to the table's front edge.
 *
 * Placeholders a generated GLB could replace (see docs/07-asset-requests.md): PLANT, TEDDY, SOFA
 * cushions (sleeping cat spot), GLOBE, the armchair-side floor lamp.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ROOM } from '../../game/palette';
import { ATLAS, roomAtlasTexture, rugTexture } from '../textures';
import { Builder, SHELL, WINDOW, bakeGeometry, bakedMaterial, irradiance } from './bake';

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

function bed(b: Builder) {
  b.push(204, F, 14, -0.12);
  b.box(110, 30, 200, 0, 21, 0, ROOM.bedFrame);
  b.soft(112, 22, 150, 0, 49, 22, ROOM.blanket, 8);
  b.soft(108, 16, 46, 0, 45, -76, ROOM.throwBlanket, 6);
  b.soft(70, 14, 34, 0, 56, -74, ROOM.pillow, 6, { rx: -0.25 });
  b.box(118, 96, 6, 0, 72, -101, ROOM.bedFrame);
  b.box(124, 6, 9, 0, 121, -101, ROOM.shelfWood);
  b.pop();
}

function sofa(b: Builder) {
  b.push(34, F, SHELL.maxZ - 46, Math.PI); // faces the table
  b.box(196, 20, 84, 0, 20, 0, ROOM.sofaDark);
  for (const s of [-1, 1]) {
    b.soft(96, 18, 70, s * 48.5, 38, 8, ROOM.sofa, 6);
    b.soft(92, 44, 18, s * 48.5, 68, -22, ROOM.sofa, 7, { rx: -0.14 });
    b.soft(22, 46, 88, s * 109, 40, 0, ROOM.sofa, 8);
  }
  b.soft(204, 60, 20, 0, 62, -36, ROOM.sofaDark, 8);
  // cushions; the left seat is left free for the sleeping-cat asset (docs/07)
  b.soft(36, 36, 12, 72, 62, -8, ROOM.cushionA, 5, { rx: -0.3, ry: -0.2 });
  b.soft(32, 32, 11, 40, 60, -6, ROOM.cushionB, 5, { rx: -0.35, ry: 0.25 });
  b.box(30, 2, 60, -109, 64, 4, ROOM.throwBlanket);
  b.box(2, 30, 60, -121, 49, 4, ROOM.throwBlanket);
  b.pop();
}

function cubeStorage(b: Builder, detail: boolean) {
  const cell = 32;
  const cols = 3;
  const rows = 4;
  const w = cols * cell + 4;
  const h = rows * cell + 4;
  const d = 36;
  b.push(-150, F, SHELL.maxZ - d / 2 - 1.5, Math.PI);
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
  floorLamp(b, 152, -150, 152);
  plant(b, 226, -138, detail);
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

  // ----- right wall: bed, shelf of treasures, pictures, pennants -----
  bed(b);
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

  // ----- wall behind the usual camera: sofa, cube storage, lamp, boxes -----
  sofa(b);
  cubeStorage(b, detail);
  floorLamp(b, 168, SHELL.maxZ - 34, 148);
  b.push(0, 0, SHELL.maxZ, Math.PI);
  // local x = −world x
  framed(b, q, 0, -60, 96, 60, 44);
  framed(b, q, 1, -6, 104, 36, 36, ROOM.shelfWood);
  framed(b, q, 2, 36, 92, 30, 40);
  // a swag of fairy lights above the sofa (tiny self-lit bulbs: they bokeh nicely on High)
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

  // ----- around the table -----
  chair(b, -106, -6, Math.PI / 2);
  chair(b, 118, 12, -Math.PI / 2 + 0.3);
  // pendant lamp over the table
  b.rod([0, SHELL.ceilY, -8], [0, 134, -8], 0.5, ROOM.lampMetal, 5);
  b.cyl(5, 6, 3, 0, SHELL.ceilY - 1.5, -8, ROOM.trim, 12);
  b.cyl(7, 31, 24, 0, 122, -8, ROOM.pendant, 20);
  b.cyl(28, 28, 1.2, 0, 109.8, -8, ROOM.lampShade, 20, { glow: 0.5 });

  // ----- rug (its own texture) -----
  const rug = new THREE.PlaneGeometry(270, 190, 9, 7);
  rug.rotateX(-Math.PI / 2);
  rug.translate(36, F + 0.6, 134);
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
    </group>
  );
}
