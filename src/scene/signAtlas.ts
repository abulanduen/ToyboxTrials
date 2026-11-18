/**
 * One canvas atlas for the hub's painted signs and decals: the gate name boards, both faces of
 * every fingerpost board, the letter blocks and the sheet music. Sharing it lets all of them
 * merge into a couple of draw calls.
 *
 * Layout (1024 × 2048): "board" cells are 512 × 128, two per row; "small" cells are 128 × 128,
 * eight per row, in the last two rows. The layout maths is pure (unit-testable); `signAtlasTexture`
 * draws it in the browser.
 */
import * as THREE from 'three';
import { PALETTE } from '../game/palette';

export const ATLAS_W = 1024;
export const ATLAS_H = 2048;
const BOARD_W = 512;
const BOARD_H = 128;
const SMALL = 128;
/** Board cells fill rows 0–13; small cells start at row 14. */
export const MAX_BOARDS = 28;
const SMALL_Y0 = 14 * BOARD_H;

export type UvRect = readonly [number, number, number, number];

const rect = (x: number, y: number, w: number, h: number): UvRect => [x / ATLAS_W, 1 - (y + h) / ATLAS_H, (x + w) / ATLAS_W, 1 - y / ATLAS_H];
/** Pixel rectangle of board cell `i`. */
const boardPx = (i: number) => ({ x: (i % 2) * BOARD_W, y: Math.floor(i / 2) * BOARD_H, w: BOARD_W, h: BOARD_H });
const smallPx = (i: number) => ({ x: (i % 8) * SMALL, y: SMALL_Y0 + Math.floor(i / 8) * SMALL, w: SMALL, h: SMALL });
/** Inset by a couple of pixels so mipmaps don't bleed in the neighbouring cell. */
const inset = (p: { x: number; y: number; w: number; h: number }, d = 3): UvRect => rect(p.x + d, p.y + d, p.w - d * 2, p.h - d * 2);

export interface BoardSpec {
  title: string;
  sub: string;
  accent: string;
  /** Fingerpost boards: which end carries the arrow's colour band. */
  arrow: 'left' | 'right' | null;
}
export type SmallSpec = { kind: 'letter'; ch: string; color: string } | { kind: 'sheet' };

/** Collects the cells to draw and hands out their UV rectangles. */
export class SignAtlas {
  boards: BoardSpec[] = [];
  smalls: SmallSpec[] = [];
  private keys = new Map<string, UvRect>();

  board(b: BoardSpec): UvRect {
    const k = `b:${b.title}|${b.sub}|${b.accent}|${b.arrow}`;
    let r = this.keys.get(k);
    if (!r) {
      if (this.boards.length >= MAX_BOARDS) throw new Error('sign atlas: out of board cells');
      r = inset(boardPx(this.boards.length));
      this.boards.push(b);
      this.keys.set(k, r);
    }
    return r;
  }
  small(s: SmallSpec): UvRect {
    const k = s.kind === 'letter' ? `l:${s.ch}|${s.color}` : 'sheet';
    let r = this.keys.get(k);
    if (!r) {
      if (this.smalls.length >= 16) throw new Error('sign atlas: out of small cells');
      r = inset(smallPx(this.smalls.length), 6);
      this.smalls.push(s);
      this.keys.set(k, r);
    }
    return r;
  }
}

function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    g.strokeStyle = `rgba(110,70,35,${0.05 + rnd() * 0.08})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    const yy = y + rnd() * h;
    g.moveTo(x, yy);
    g.bezierCurveTo(x + w / 3, yy + 6, x + (2 * w) / 3, yy - 6, x + w, yy + 2);
    g.stroke();
  }
}

/** Draw every collected cell. Browser only. */
export function signAtlasTexture(atlas: SignAtlas) {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d')!;
  atlas.boards.forEach((b, i) => {
    const p = boardPx(i);
    g.save();
    g.beginPath();
    g.rect(p.x, p.y, p.w, p.h);
    g.clip();
    g.fillStyle = PALETTE.woodLight;
    g.fillRect(p.x, p.y, p.w, p.h);
    grain(g, p.x, p.y, p.w, p.h, 17 + i * 31);
    g.fillStyle = b.accent;
    if (b.arrow === 'right') g.fillRect(p.x + p.w - 42, p.y, 42, p.h);
    else if (b.arrow === 'left') g.fillRect(p.x, p.y, 42, p.h);
    else g.fillRect(p.x, p.y + p.h - 20, p.w, 20);
    g.fillStyle = PALETTE.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cx = p.x + (b.arrow === 'right' ? 235 : b.arrow === 'left' ? 277 : 256);
    g.font = `700 ${b.sub ? 48 : 58}px Fredoka, "Trebuchet MS", sans-serif`;
    g.fillText(b.title, cx, p.y + (b.sub ? 46 : 62), 410);
    if (b.sub) {
      g.font = `700 ${b.sub.length > 30 ? 26 : 30}px Nunito, "Trebuchet MS", sans-serif`;
      g.fillStyle = '#6B4A2E';
      g.fillText(b.sub, cx, p.y + 92, 420);
    }
    g.restore();
  });
  atlas.smalls.forEach((s, i) => {
    const p = smallPx(i);
    if (s.kind === 'letter') {
      // block face in the block's paint with a cream letter and a debossed border
      g.fillStyle = s.color;
      g.fillRect(p.x, p.y, p.w, p.h);
      g.strokeStyle = 'rgba(43,36,51,0.22)';
      g.lineWidth = 6;
      g.strokeRect(p.x + 12, p.y + 12, p.w - 24, p.h - 24);
      g.fillStyle = PALETTE.cream;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 84px Fredoka, "Trebuchet MS", sans-serif';
      g.fillText(s.ch, p.x + p.w / 2, p.y + p.h / 2 + 4);
    } else {
      // a page of sheet music: two staves of five lines with a scatter of note heads
      g.fillStyle = PALETTE.white;
      g.fillRect(p.x, p.y, p.w, p.h);
      g.strokeStyle = PALETTE.ink;
      g.fillStyle = PALETTE.ink;
      g.lineWidth = 2;
      for (const top of [26, 74]) {
        for (let l = 0; l < 5; l++) {
          g.beginPath();
          g.moveTo(p.x + 10, p.y + top + l * 6);
          g.lineTo(p.x + p.w - 10, p.y + top + l * 6);
          g.stroke();
        }
        for (let n = 0; n < 6; n++) {
          const nx = p.x + 22 + n * 17;
          const ny = p.y + top + ((n * 7) % 5) * 5 + 2;
          g.beginPath();
          g.ellipse(nx, ny, 4.5, 3.4, -0.4, 0, Math.PI * 2);
          g.fill();
          g.fillRect(nx + 3, ny - 16, 2, 16);
        }
      }
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
