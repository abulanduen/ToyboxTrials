/**
 * Odd Page Out: drawing primitives. Pictures are plain data (a list of shapes in picture units,
 * 400 × 300), so the rules core, the unit tests and the SVG renderer all see exactly the same
 * thing. Pure: no DOM, no React.
 */
import { PALETTE } from '../../game/palette';

export const PIC_W = 400;
export const PIC_H = 300;

/** Optional style on every shape. `s: null` = no outline; `f: 'none'` = no fill. */
export interface Style {
  f?: string;
  s?: string | null;
  /** Stroke width (default 2). */
  sw?: number;
  o?: number;
}

export type Shape =
  | ({ t: 'c'; x: number; y: number; r: number } & Style)
  | ({ t: 'e'; x: number; y: number; rx: number; ry: number } & Style)
  | ({ t: 'r'; x: number; y: number; w: number; h: number; rx?: number } & Style)
  | ({ t: 'p'; d: string } & Style)
  | { t: 'g'; tf?: string; o?: number; k: Shape[] };

export const INK = PALETTE.ink;

/** Round for compact, stable markup. */
export const n2 = (v: number) => Math.round(v * 100) / 100;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Mix two palette colours (t = 0 → a, 1 → b): tints and shades of palette colours. */
export function mix(a: string, b: string, t: number): string {
  const A = hex(a);
  const B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export const tint = (c: string, t = 0.45) => mix(c, PALETTE.white, t);
export const shade = (c: string, t = 0.25) => mix(c, PALETTE.ink, t);

export const C = (x: number, y: number, r: number, f: string, st: Style = {}): Shape => ({ t: 'c', x: n2(x), y: n2(y), r: n2(r), f, ...st });
export const E = (x: number, y: number, rx: number, ry: number, f: string, st: Style = {}): Shape => ({ t: 'e', x: n2(x), y: n2(y), rx: n2(rx), ry: n2(ry), f, ...st });
/** Rectangle by its top-left corner. */
export const R = (x: number, y: number, w: number, h: number, f: string, rx = 0, st: Style = {}): Shape => ({ t: 'r', x: n2(x), y: n2(y), w: n2(w), h: n2(h), rx: rx ? n2(rx) : undefined, f, ...st });
/** Rectangle by its centre. */
export const RC = (cx: number, cy: number, w: number, h: number, f: string, rx = 0, st: Style = {}): Shape => R(cx - w / 2, cy - h / 2, w, h, f, rx, st);
export const P = (d: string, f: string, st: Style = {}): Shape => ({ t: 'p', d, f, ...st });
export const G = (tf: string | undefined, k: Shape[], o?: number): Shape => ({ t: 'g', tf, o, k });
/** A line (stroke only). */
export const L = (x1: number, y1: number, x2: number, y2: number, s: string = INK, w = 2): Shape => P(`M${n2(x1)},${n2(y1)}L${n2(x2)},${n2(y2)}`, 'none', { s, sw: w });

/** Closed polygon path through points. */
export const poly = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join('L') + 'Z';
/** Open polyline path. */
export const polyline = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join('L');

/** Star with `k` points, outer radius r1, inner r2 (point up). */
export function starPath(cx: number, cy: number, r1: number, r2: number, k = 5, rot = 0): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < k * 2; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / k;
    const r = i % 2 ? r2 : r1;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
}

/** Heart centred on (cx, cy), about 2r wide. */
export function heartPath(cx: number, cy: number, r: number): string {
  const x = (v: number) => n2(cx + v * r);
  const y = (v: number) => n2(cy + v * r);
  return `M${x(0)},${y(0.95)}C${x(-0.4)},${y(0.6)} ${x(-1.05)},${y(0.2)} ${x(-1.0)},${y(-0.35)}C${x(-0.95)},${y(-0.95)} ${x(-0.2)},${y(-1.05)} ${x(0)},${y(-0.45)}C${x(0.2)},${y(-1.05)} ${x(0.95)},${y(-0.95)} ${x(1.0)},${y(-0.35)}C${x(1.05)},${y(0.2)} ${x(0.4)},${y(0.6)} ${x(0)},${y(0.95)}Z`;
}

/** A horizontal band across a circle of radius r (|y| ≤ b): beach-ball stripe. */
export function bandPath(r: number, y0: number, y1: number): string {
  const xa = Math.sqrt(Math.max(0, r * r - y0 * y0));
  const xb = Math.sqrt(Math.max(0, r * r - y1 * y1));
  return `M${n2(-xa)},${n2(y0)}L${n2(xa)},${n2(y0)}A${n2(r)},${n2(r)} 0 0 1 ${n2(xb)},${n2(y1)}L${n2(-xb)},${n2(y1)}A${n2(r)},${n2(r)} 0 0 1 ${n2(-xa)},${n2(y0)}Z`;
}

/** Serialise shapes to SVG markup (used by the unit tests to compare pictures, and by previews). */
export function toSvg(shapes: Shape[]): string {
  const st = (s: Style) => {
    let out = '';
    if (s.f !== undefined) out += ` fill="${s.f}"`;
    out += s.s === null ? ' stroke="none"' : ` stroke="${s.s ?? INK}" stroke-width="${s.sw ?? 2}"`;
    if (s.o !== undefined) out += ` opacity="${s.o}"`;
    return out;
  };
  const one = (sh: Shape): string => {
    switch (sh.t) {
      case 'c':
        return `<circle cx="${sh.x}" cy="${sh.y}" r="${sh.r}"${st(sh)}/>`;
      case 'e':
        return `<ellipse cx="${sh.x}" cy="${sh.y}" rx="${sh.rx}" ry="${sh.ry}"${st(sh)}/>`;
      case 'r':
        return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}"${sh.rx ? ` rx="${sh.rx}"` : ''}${st(sh)}/>`;
      case 'p':
        return `<path d="${sh.d}"${st(sh)}/>`;
      case 'g':
        return `<g${sh.tf ? ` transform="${sh.tf}"` : ''}${sh.o !== undefined ? ` opacity="${sh.o}"` : ''}>${sh.k.map(one).join('')}</g>`;
    }
  };
  return shapes.map(one).join('');
}
