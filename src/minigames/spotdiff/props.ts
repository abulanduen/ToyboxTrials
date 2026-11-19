/**
 * Odd Page Out: the prop library. Every spot-able thing in a picture is one of these chunky,
 * code-drawn storybook props, drawn around (0, 0) at nominal radius `s` (picture units) from a
 * small set of parameters. A slot's variants are just different parameters (colour, pattern,
 * shape, count, a feature on/off, rotation, a nudge, or missing altogether).
 *
 * Pure: shapes as data (shapes.ts), no DOM.
 */
import { PALETTE } from '../../game/palette';
import { C, E, G, INK, L, P, R, RC, bandPath, heartPath, n2, poly, polyline, shade, starPath, tint, type Shape } from './shapes';

const W = PALETTE.white;
const HL = { s: null, o: 0.5 } as const; // highlight style

export interface Params {
  /** Nominal radius in picture units. */
  s?: number;
  /** Main and second colour. */
  c?: string;
  c2?: string;
  /** Pattern: plain | stripes | dots | star | check (prop-specific). */
  pat?: string;
  /** Alternative shape (prop-specific). */
  shape?: string;
  /** A count (petals, candles, pips, bows…). */
  n?: number;
  /** A feature on or off (a flag, a cherry, a bow…). */
  on?: boolean;
  /** Rotation in degrees, a nudge in picture units, a mirror image and a scale. */
  rot?: number;
  dx?: number;
  dy?: number;
  flip?: boolean;
  sc?: number;
  /** Missing from this picture. */
  hide?: boolean;
}

type Draw = (p: Params & { s: number; c: string; c2: string }) => Shape[];

const hilite = (x: number, y: number, rx: number, ry: number) => E(x, y, rx, ry, W, HL);

/** Balls, yo-yos, beach balls: pattern plain / stripes / dots / star. */
const ball: Draw = ({ s, c, c2, pat }) => {
  const out: Shape[] = [C(0, 0, s, c, { s: null })];
  if (pat === 'stripes') out.push(P(bandPath(s, -s * 0.32, s * 0.32), c2, { s: null }));
  if (pat === 'dots') for (const [a, b] of [[-0.45, -0.35], [0.42, -0.42], [0.05, 0.12], [0.5, 0.45], [-0.45, 0.5]]) out.push(C(a * s, b * s, s * 0.17, c2, { s: null }));
  if (pat === 'star') out.push(P(starPath(0, 0, s * 0.6, s * 0.26), c2, { s: null }));
  out.push(hilite(-s * 0.38, -s * 0.42, s * 0.22, s * 0.13), C(0, 0, s, 'none'));
  return out;
};

/** A wooden toy block with a painted symbol (shape: star | heart | dot | tri). */
const block: Draw = ({ s, c, c2, shape }) => {
  const out: Shape[] = [P(poly([[-s, -s * 0.7], [-s * 0.7, -s], [s, -s], [s, s * 0.7], [s * 0.7, s], [-s, s]]), shade(c, 0.2)), RC(-s * 0.15, s * 0.15, s * 1.7, s * 1.7, c, 2)];
  const sym = s * 0.5;
  const cx = -s * 0.15;
  const cy = s * 0.15;
  if (shape === 'star') out.push(P(starPath(cx, cy, sym * 1.1, sym * 0.48), c2, { sw: 1.5 }));
  else if (shape === 'heart') out.push(P(heartPath(cx, cy, sym * 0.85), c2, { sw: 1.5 }));
  else if (shape === 'tri') out.push(P(poly([[cx, cy - sym], [cx + sym, cy + sym * 0.75], [cx - sym, cy + sym * 0.75]]), c2, { sw: 1.5 }));
  else out.push(C(cx, cy, sym * 0.8, c2, { sw: 1.5 }));
  return out;
};

const star: Draw = ({ s, c }) => [P(starPath(0, 0, s, s * 0.47), c, { sw: 2 })];
const heart: Draw = ({ s, c }) => [P(heartPath(0, 0, s * 0.95), c), hilite(-s * 0.45, -s * 0.35, s * 0.18, s * 0.12)];

/** A flower on a stem: n petals, coloured c; centre c2; on = has leaves. */
const flower: Draw = ({ s, c, c2, n = 5, on }) => {
  const out: Shape[] = [L(0, 0, 0, s * 1.6, PALETTE.feltDark, 2.5)];
  if (on) out.push(E(s * 0.38, s * 1.05, s * 0.36, s * 0.16, PALETTE.sage, { sw: 1.5 }));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push(C(Math.cos(a) * s * 0.52, Math.sin(a) * s * 0.52, s * 0.4, c, { sw: 1.6 }));
  }
  out.push(C(0, 0, s * 0.34, c2, { sw: 1.6 }));
  return out;
};

/** A fish facing right (flip faces left); pat stripes adds two bands. */
const fish: Draw = ({ s, c, c2, pat }) => {
  const out: Shape[] = [P(poly([[-s * 0.7, 0], [-s * 1.15, -s * 0.5], [-s * 1.15, s * 0.5]]), shade(c, 0.1)), E(0, 0, s, s * 0.6, c)];
  if (pat === 'stripes') for (const x of [-0.35, 0.15]) out.push(P(`M${n2(x * s)},${n2(-s * 0.55)}Q${n2(x * s + s * 0.15)},0 ${n2(x * s)},${n2(s * 0.55)}`, 'none', { s: c2, sw: s * 0.16 }));
  out.push(C(s * 0.5, -s * 0.12, s * 0.15, W, { sw: 1.2 }), C(s * 0.54, -s * 0.12, s * 0.07, INK, { s: null }));
  return out;
};

/** A toy sailing boat: hull c, sail c2; on = pennant at the masthead. */
const boat: Draw = ({ s, c, c2, on }) => {
  const out: Shape[] = [L(0, -s * 1.05, 0, s * 0.3, INK, 2), P(poly([[s * 0.08, -s * 0.95], [s * 0.85, s * 0.2], [s * 0.08, s * 0.2]]), c2), P(poly([[-s * 0.05, -s * 0.75], [-s * 0.65, s * 0.2], [-s * 0.05, s * 0.2]]), tint(c2, 0.5))];
  out.push(P(poly([[-s, s * 0.3], [s, s * 0.3], [s * 0.7, s * 0.8], [-s * 0.7, s * 0.8]]), c));
  if (on) out.push(P(poly([[0, -s * 1.05], [s * 0.5, -s * 0.92], [0, -s * 0.78]]), PALETTE.coral, { sw: 1.5 }));
  return out;
};

/** A mug: body c; pat dots | stripes | plain; on = steam. */
const cup: Draw = ({ s, c, c2, pat, on }) => {
  const out: Shape[] = [P(`M${n2(s * 0.6)},${n2(-s * 0.35)}C${n2(s * 1.15)},${n2(-s * 0.35)} ${n2(s * 1.15)},${n2(s * 0.45)} ${n2(s * 0.6)},${n2(s * 0.45)}`, 'none', { sw: s * 0.22 }), R(-s * 0.7, -s * 0.6, s * 1.35, s * 1.35, c, s * 0.2)];
  if (pat === 'stripes') out.push(R(-s * 0.7, -s * 0.15, s * 1.35, s * 0.35, c2, 0, { s: null }));
  if (pat === 'dots') for (const [a, b] of [[-0.35, -0.25], [0.25, 0.05], [-0.3, 0.45], [0.3, 0.5]]) out.push(C(a * s, b * s, s * 0.12, c2, { s: null }));
  out.push(R(-s * 0.7, -s * 0.6, s * 1.35, s * 1.35, 'none', s * 0.2));
  if (on) for (const x of [-0.25, 0.2]) out.push(P(`M${n2(x * s)},${n2(-s * 0.75)}q${n2(-s * 0.2)},${n2(-s * 0.25)} 0,${n2(-s * 0.5)}q${n2(s * 0.2)},${n2(-s * 0.25)} 0,${n2(-s * 0.5)}`, 'none', { s: tint(INK, 0.55), sw: 1.8 }));
  return out;
};

/** An apple: c; on = leaf. */
const apple: Draw = ({ s, c, on }) => {
  const out: Shape[] = [L(0, -s * 0.75, s * 0.12, -s * 1.15, PALETTE.woodDark, 2.2)];
  if (on) out.push(P(`M${n2(s * 0.1)},${n2(-s * 1.0)}Q${n2(s * 0.6)},${n2(-s * 1.35)} ${n2(s * 0.85)},${n2(-s * 0.95)}Q${n2(s * 0.4)},${n2(-s * 0.7)} ${n2(s * 0.1)},${n2(-s * 1.0)}Z`, PALETTE.sage, { sw: 1.5 }));
  out.push(P(`M0,${n2(-s * 0.62)}C${n2(s * 0.6)},${n2(-s * 1.05)} ${n2(s * 1.15)},${n2(-s * 0.35)} ${n2(s * 0.8)},${n2(s * 0.45)}C${n2(s * 0.55)},${n2(s * 1.0)} ${n2(s * 0.15)},${n2(s * 0.95)} 0,${n2(s * 0.8)}C${n2(-s * 0.15)},${n2(s * 0.95)} ${n2(-s * 0.55)},${n2(s * 1.0)} ${n2(-s * 0.8)},${n2(s * 0.45)}C${n2(-s * 1.15)},${n2(-s * 0.35)} ${n2(-s * 0.6)},${n2(-s * 1.05)} 0,${n2(-s * 0.62)}Z`, c));
  out.push(hilite(-s * 0.4, -s * 0.2, s * 0.15, s * 0.25));
  return out;
};

/** Books standing on a shelf: n books (1–3) of colour c / c2, s = height / 2. */
const books: Draw = ({ s, c, c2, n = 3, shape }) => {
  const cols = [c, c2, tint(c, 0.35)];
  const out: Shape[] = [];
  const w = s * 0.42;
  for (let i = 0; i < n; i++) {
    const h = s * (2 - (i % 2) * 0.3);
    const x = -((n - 1) * w) / 2 + i * w;
    out.push(R(x - w / 2, s - h, w, h, cols[i % 3], 1.5));
    out.push(L(x - w * 0.25, s - h + 4, x + w * 0.25, s - h + 4, W, 1.5));
  }
  if (shape === 'lean') out.push(G(`rotate(18 ${n2(((n - 1) * w) / 2 + w)} ${n2(s)})`, [R(((n - 1) * w) / 2 + w * 0.5, -s * 0.8, w, s * 1.8, PALETTE.coral, 1.5)]));
  return out;
};

/** A diamond kite: c / c2 quarters; n bows on the tail. */
const kite: Draw = ({ s, c, c2, n = 3 }) => {
  const out: Shape[] = [P(polyline([[0, s * 1.1], [-s * 0.3, s * 1.5], [s * 0.2, s * 1.9], [-s * 0.2, s * 2.3]]), 'none', { sw: 1.5 })];
  for (let i = 0; i < n; i++) {
    const y = s * (1.45 + i * 0.38);
    out.push(P(poly([[-s * 0.25, y - s * 0.12], [s * 0.25, y + s * 0.12], [s * 0.25, y - s * 0.12], [-s * 0.25, y + s * 0.12]]), PALETTE.coral, { sw: 1.2 }));
  }
  out.push(P(poly([[0, -s * 1.1], [s * 0.75, -s * 0.15], [0, s * 1.1], [-s * 0.75, -s * 0.15]]), c));
  out.push(P(poly([[0, -s * 1.1], [s * 0.75, -s * 0.15], [0, -s * 0.15]]), c2, { sw: 1.5 }), P(poly([[0, s * 1.1], [-s * 0.75, -s * 0.15], [0, -s * 0.15]]), c2, { sw: 1.5 }));
  return out;
};

/** A balloon on a string (string runs down from the knot). */
const balloon: Draw = ({ s, c }) => [
  P(`M0,${n2(s * 1.1)}q${n2(-s * 0.3)},${n2(s * 0.5)} 0,${n2(s * 1.0)}q${n2(s * 0.3)},${n2(s * 0.4)} 0,${n2(s * 0.8)}`, 'none', { sw: 1.3 }),
  P(poly([[0, s * 1.0], [-s * 0.18, s * 1.25], [s * 0.18, s * 1.25]]), c, { sw: 1.5 }),
  E(0, 0, s * 0.85, s * 1.05, c),
  hilite(-s * 0.35, -s * 0.45, s * 0.18, s * 0.3),
];

/** A rubber duck facing right: body c; on = sailor hat. */
const duck: Draw = ({ s, c, on }) => {
  const out: Shape[] = [P(`M${n2(-s)},${n2(-s * 0.05)}Q${n2(-s * 1.15)},${n2(s * 0.75)} ${n2(-s * 0.1)},${n2(s * 0.75)}L${n2(s * 0.45)},${n2(s * 0.75)}Q${n2(s * 1.0)},${n2(s * 0.7)} ${n2(s * 0.75)},${n2(s * 0.05)}Q${n2(s * 0.2)},${n2(-s * 0.05)} ${n2(-s)},${n2(-s * 0.05)}Z`, c)];
  out.push(C(s * 0.35, -s * 0.45, s * 0.48, c), P(poly([[s * 0.75, -s * 0.5], [s * 1.18, -s * 0.38], [s * 0.75, -s * 0.24]]), PALETTE.coral, { sw: 1.5 }));
  out.push(C(s * 0.48, -s * 0.58, s * 0.09, INK, { s: null }), P(`M${n2(-s * 0.45)},${n2(s * 0.15)}q${n2(s * 0.35)},${n2(s * 0.35)} ${n2(s * 0.7)},0`, 'none', { sw: 1.6 }));
  if (on) out.push(P(poly([[s * 0.0, -s * 0.85], [s * 0.7, -s * 0.85], [s * 0.35, -s * 1.35]]), W, { sw: 1.6 }), R(-s * 0.05, -s * 0.92, s * 0.8, s * 0.14, PALETTE.toyBlue, 0, { sw: 1.2 }));
  return out;
};

/** A toy car facing right: body c, window c2. */
const car: Draw = ({ s, c, c2 }) => [
  P(`M${n2(-s)},${n2(s * 0.35)}L${n2(-s)},${n2(-s * 0.05)}Q${n2(-s * 0.95)},${n2(-s * 0.25)} ${n2(-s * 0.6)},${n2(-s * 0.25)}L${n2(-s * 0.4)},${n2(-s * 0.7)}L${n2(s * 0.35)},${n2(-s * 0.7)}L${n2(s * 0.6)},${n2(-s * 0.25)}Q${n2(s)},${n2(-s * 0.22)} ${n2(s)},${n2(s * 0.1)}L${n2(s)},${n2(s * 0.35)}Z`, c),
  P(poly([[-s * 0.3, -s * 0.58], [s * 0.28, -s * 0.58], [s * 0.42, -s * 0.28], [-s * 0.42, -s * 0.28]]), c2, { sw: 1.5 }),
  C(-s * 0.55, s * 0.4, s * 0.28, INK, { s: null }),
  C(s * 0.55, s * 0.4, s * 0.28, INK, { s: null }),
  C(-s * 0.55, s * 0.4, s * 0.11, PALETTE.cream, { s: null }),
  C(s * 0.55, s * 0.4, s * 0.11, PALETTE.cream, { s: null }),
];

/** A round little bird facing right: body c, wing c2. */
const bird: Draw = ({ s, c, c2 }) => [
  P(poly([[-s * 0.75, -s * 0.1], [-s * 1.25, -s * 0.45], [-s * 1.15, s * 0.15]]), c, { sw: 1.6 }),
  E(0, 0, s * 0.85, s * 0.72, c),
  P(`M${n2(-s * 0.45)},${n2(-s * 0.05)}Q${n2(-s * 0.05)},${n2(s * 0.55)} ${n2(s * 0.3)},${n2(-s * 0.05)}Z`, c2, { sw: 1.5 }),
  P(poly([[s * 0.78, -s * 0.2], [s * 1.18, -s * 0.05], [s * 0.78, s * 0.08]]), PALETTE.honey, { sw: 1.4 }),
  C(s * 0.42, -s * 0.25, s * 0.1, INK, { s: null }),
];

/** A cloud (shape: puff | long). */
const cloud: Draw = ({ s, c, shape }) => {
  const parts: [number, number, number][] = shape === 'long' ? [[-0.9, 0.15, 0.4], [-0.35, -0.1, 0.55], [0.3, -0.05, 0.5], [0.9, 0.15, 0.4]] : [[-0.55, 0.1, 0.48], [0, -0.2, 0.65], [0.6, 0.1, 0.45]];
  return [
    ...parts.map(([x, y, r]) => C(x * s, y * s, r * s, c)),
    ...parts.map(([x, y, r]) => C(x * s, y * s, r * s - 1.2, c, { s: null })),
    R(-s * 0.9, s * 0.05, s * 1.8, s * 0.42, c, s * 0.2, { s: null }),
  ];
};

/** The sun: n rays (0 = none); on = smiling face. */
const sun: Draw = ({ s, c, n = 8, on }) => {
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(L(Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.85, Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3, c, 3.2));
  }
  out.push(C(0, 0, s * 0.8, c));
  if (on) out.push(C(-s * 0.28, -s * 0.15, s * 0.08, INK, { s: null }), C(s * 0.28, -s * 0.15, s * 0.08, INK, { s: null }), P(`M${n2(-s * 0.3)},${n2(s * 0.18)}q${n2(s * 0.3)},${n2(s * 0.3)} ${n2(s * 0.6)},0`, 'none', { sw: 1.8 }));
  return out;
};

/** A birthday cake: sponge c, icing c2, n candles; on = cherry. */
const cake: Draw = ({ s, c, c2, n = 2, on }) => {
  const out: Shape[] = [E(0, s * 0.62, s * 1.15, s * 0.22, PALETTE.white)];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -s * 0.5 + (i * s) / (n - 1);
    out.push(R(x - s * 0.07, -s * 0.85, s * 0.14, s * 0.45, PALETTE.toyBlue, 0, { sw: 1.2 }), E(x, -s * 0.95, s * 0.07, s * 0.13, PALETTE.honey, { s: null }));
  }
  out.push(R(-s * 0.9, -s * 0.4, s * 1.8, s * 1.0, c, s * 0.12));
  out.push(P(`M${n2(-s * 0.9)},${n2(-s * 0.1)}L${n2(-s * 0.9)},${n2(-s * 0.4)}L${n2(s * 0.9)},${n2(-s * 0.4)}L${n2(s * 0.9)},${n2(-s * 0.1)}Q${n2(s * 0.6)},${n2(s * 0.15)} ${n2(s * 0.3)},${n2(-s * 0.1)}Q0,${n2(s * 0.15)} ${n2(-s * 0.3)},${n2(-s * 0.1)}Q${n2(-s * 0.6)},${n2(s * 0.15)} ${n2(-s * 0.9)},${n2(-s * 0.1)}Z`, c2, { sw: 1.5 }));
  if (on) out.push(C(s * 0.55, -s * 0.52, s * 0.2, PALETTE.coral, { sw: 1.5 }));
  return out;
};

/** A teddy bear's head and body: fur c; on = bow tie in c2. */
const teddy: Draw = ({ s, c, c2, on }) => {
  const out: Shape[] = [E(0, s * 0.45, s * 0.7, s * 0.6, c), C(-s * 0.55, -s * 0.75, s * 0.25, c), C(s * 0.55, -s * 0.75, s * 0.25, c), C(0, -s * 0.35, s * 0.6, c)];
  out.push(E(0, -s * 0.18, s * 0.27, s * 0.2, tint(c, 0.5), { sw: 1.4 }), C(0, -s * 0.25, s * 0.08, INK, { s: null }), C(-s * 0.22, -s * 0.5, s * 0.07, INK, { s: null }), C(s * 0.22, -s * 0.5, s * 0.07, INK, { s: null }));
  out.push(E(0, s * 0.55, s * 0.35, s * 0.3, tint(c, 0.4), { s: null }));
  if (on) out.push(P(poly([[0, s * 0.15], [-s * 0.4, -s * 0.05], [-s * 0.4, s * 0.35]]), c2, { sw: 1.4 }), P(poly([[0, s * 0.15], [s * 0.4, -s * 0.05], [s * 0.4, s * 0.35]]), c2, { sw: 1.4 }), C(0, s * 0.15, s * 0.1, c2, { sw: 1.2 }));
  return out;
};

/** A seashell fan: c. */
const shell: Draw = ({ s, c }) => {
  const out: Shape[] = [P(`M0,${n2(s * 0.8)}L${n2(-s * 0.95)},${n2(-s * 0.15)}Q0,${n2(-s * 1.25)} ${n2(s * 0.95)},${n2(-s * 0.15)}Z`, c)];
  for (const a of [-0.55, -0.2, 0.2, 0.55]) out.push(L(0, s * 0.75, a * s * 1.2, -s * 0.55 + Math.abs(a) * s * 0.5, shade(c, 0.35), 1.3));
  out.push(RC(0, s * 0.8, s * 0.5, s * 0.22, c, 2, { sw: 1.4 }));
  return out;
};

/** A jar of sweets: glass with contents c, lid c2. */
const jar: Draw = ({ s, c, c2 }) => {
  const out: Shape[] = [R(-s * 0.7, -s * 0.6, s * 1.4, s * 1.6, tint(PALETTE.roomSky, 0.4), s * 0.25)];
  for (const [a, b] of [[-0.35, 0.65], [0.1, 0.7], [0.4, 0.55], [-0.15, 0.35], [0.3, 0.25], [-0.4, 0.15]]) out.push(C(a * s, b * s, s * 0.2, c, { sw: 1.2 }));
  out.push(R(-s * 0.8, -s * 0.95, s * 1.6, s * 0.4, c2, s * 0.1), hilite(-s * 0.45, -s * 0.15, s * 0.08, s * 0.3));
  return out;
};

/** A table lamp: shade c, base c2; on = lit glow. */
const lamp: Draw = ({ s, c, c2, on }) => {
  const out: Shape[] = [];
  if (on) out.push(C(0, -s * 0.3, s * 1.15, PALETTE.honey, { s: null, o: 0.3 }));
  out.push(L(0, -s * 0.1, 0, s * 0.75, INK, 2.5), E(0, s * 0.85, s * 0.55, s * 0.18, c2), P(poly([[-s * 0.35, -s * 1.0], [s * 0.35, -s * 1.0], [s * 0.75, -s * 0.15], [-s * 0.75, -s * 0.15]]), c));
  return out;
};

/** A framed picture on a wall: frame c, picture shape: sun | tree | boat | heart. */
const frame: Draw = ({ s, c, shape }) => {
  const out: Shape[] = [L(-s * 0.6, -s * 0.7, 0, -s * 1.15, INK, 1.4), L(s * 0.6, -s * 0.7, 0, -s * 1.15, INK, 1.4), R(-s, -s * 0.75, s * 2, s * 1.5, c, 2), R(-s * 0.75, -s * 0.52, s * 1.5, s * 1.04, PALETTE.white, 1, { sw: 1.4 })];
  if (shape === 'sun') out.push(C(0, -s * 0.02, s * 0.32, PALETTE.honey, { sw: 1.4 }));
  else if (shape === 'tree') out.push(R(-s * 0.06, 0, s * 0.12, s * 0.42, PALETTE.woodDark, 0, { s: null }), C(0, -s * 0.12, s * 0.3, PALETTE.sage, { sw: 1.4 }));
  else if (shape === 'boat') out.push(P(poly([[-s * 0.4, s * 0.15], [s * 0.4, s * 0.15], [s * 0.25, s * 0.35], [-s * 0.25, s * 0.35]]), PALETTE.coral, { sw: 1.3 }), P(poly([[0, -s * 0.4], [s * 0.3, s * 0.1], [0, s * 0.1]]), PALETTE.toyBlue, { sw: 1.3 }));
  else out.push(P(heartPath(0, 0, s * 0.3), PALETTE.coral, { sw: 1.4 }));
  return out;
};

/** A plant in a pot: pot c, n leaves. */
const plant: Draw = ({ s, c, n = 3 }) => {
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55;
    out.push(G(`rotate(${n2((a * 180) / Math.PI + 90)} 0 ${n2(s * 0.05)})`, [E(0, -s * 0.5, s * 0.22, s * 0.55, PALETTE.sage, { sw: 1.5 })]));
  }
  out.push(P(poly([[-s * 0.6, s * 0.05], [s * 0.6, s * 0.05], [s * 0.45, s * 0.95], [-s * 0.45, s * 0.95]]), c), R(-s * 0.68, -s * 0.05, s * 1.36, s * 0.25, c, 1.5));
  return out;
};

/** A hat: shape top | party | cap, colour c, band c2. */
const hat: Draw = ({ s, c, c2, shape }) => {
  if (shape === 'party') return [P(poly([[0, -s], [s * 0.65, s * 0.7], [-s * 0.65, s * 0.7]]), c), P(polyline([[-s * 0.33, -s * 0.15], [s * 0.33, -s * 0.15]]), 'none', { s: c2, sw: 3 }), C(0, -s, s * 0.2, c2, { sw: 1.4 })];
  if (shape === 'cap') return [P(`M${n2(-s * 0.75)},${n2(s * 0.3)}Q${n2(-s * 0.75)},${n2(-s * 0.7)} 0,${n2(-s * 0.7)}Q${n2(s * 0.75)},${n2(-s * 0.7)} ${n2(s * 0.75)},${n2(s * 0.3)}Z`, c), P(`M${n2(s * 0.7)},${n2(s * 0.3)}L${n2(s * 1.25)},${n2(s * 0.4)}L${n2(s * 0.7)},${n2(s * 0.1)}Z`, c2, { sw: 1.5 }), C(0, -s * 0.72, s * 0.12, c2, { sw: 1.2 })];
  return [E(0, s * 0.6, s * 1.05, s * 0.25, c), R(-s * 0.6, -s * 0.8, s * 1.2, s * 1.4, c, 2), R(-s * 0.6, s * 0.15, s * 1.2, s * 0.3, c2, 0, { sw: 1.5 })];
};

/** A toadstool: cap c with white spots (n). */
const mushroom: Draw = ({ s, c, n = 3 }) => {
  const out: Shape[] = [R(-s * 0.25, -s * 0.1, s * 0.5, s * 0.95, PALETTE.cream, s * 0.15), P(`M${n2(-s)},0Q${n2(-s)},${n2(-s * 1.0)} 0,${n2(-s * 1.0)}Q${n2(s)},${n2(-s * 1.0)} ${n2(s)},0Z`, c)];
  const spots: [number, number][] = [[-0.5, -0.3], [0.1, -0.6], [0.55, -0.25], [-0.1, -0.2]];
  for (let i = 0; i < n; i++) out.push(C(spots[i][0] * s, spots[i][1] * s, s * 0.14, PALETTE.white, { s: null }));
  return out;
};

/** A butterfly: wings c, spots c2. */
const butterfly: Draw = ({ s, c, c2 }) => [
  E(-s * 0.5, -s * 0.35, s * 0.5, s * 0.42, c, { sw: 1.6 }),
  E(s * 0.5, -s * 0.35, s * 0.5, s * 0.42, c, { sw: 1.6 }),
  E(-s * 0.38, s * 0.35, s * 0.36, s * 0.3, c, { sw: 1.6 }),
  E(s * 0.38, s * 0.35, s * 0.36, s * 0.3, c, { sw: 1.6 }),
  C(-s * 0.5, -s * 0.38, s * 0.15, c2, { s: null }),
  C(s * 0.5, -s * 0.38, s * 0.15, c2, { s: null }),
  E(0, 0, s * 0.12, s * 0.65, INK, { s: null }),
  L(0, -s * 0.6, -s * 0.25, -s * 0.95, INK, 1.2),
  L(0, -s * 0.6, s * 0.25, -s * 0.95, INK, 1.2),
];

/** A bunting flag hanging from the top edge: shape tri | swallow | square, colour c. */
const flag: Draw = ({ s, c, shape }) => {
  if (shape === 'swallow') return [P(poly([[-s * 0.7, -s], [s * 0.7, -s], [s * 0.7, s], [0, s * 0.4], [-s * 0.7, s]]), c)];
  if (shape === 'square') return [R(-s * 0.7, -s, s * 1.4, s * 1.5, c, 1.5)];
  return [P(poly([[-s * 0.75, -s], [s * 0.75, -s], [0, s]]), c)];
};

/** A die showing n pips. */
const die: Draw = ({ s, c, n = 3 }) => {
  const out: Shape[] = [RC(0, 0, s * 1.8, s * 1.8, c, s * 0.35)];
  const k = s * 0.48;
  const pips: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  for (const [a, b] of pips[n] ?? pips[3]) out.push(C(a * k, b * k, s * 0.2, INK, { s: null }));
  return out;
};

/** A starfish: c. */
const starfish: Draw = ({ s, c }) => [P(starPath(0, 0, s, s * 0.5), c, { sw: 2.4 }), C(0, 0, s * 0.12, tint(c, 0.5), { s: null })];

/** A crab: c; on = claws raised. */
const crab: Draw = ({ s, c, on }) => {
  const out: Shape[] = [];
  for (const sx of [-1, 1]) {
    for (const k of [0, 1, 2]) out.push(L(sx * s * 0.5, s * 0.2, sx * s * (0.95 + k * 0.08), s * (0.25 + k * 0.25), INK, 2));
    const cy = on ? -s * 0.85 : -s * 0.15;
    out.push(L(sx * s * 0.55, -s * 0.1, sx * s * 0.9, cy + s * 0.15, INK, 2.2), C(sx * s * 0.95, cy, s * 0.28, c, { sw: 1.6 }));
  }
  out.push(E(0, 0, s * 0.75, s * 0.5, c), L(-s * 0.2, -s * 0.4, -s * 0.25, -s * 0.7, INK, 1.6), L(s * 0.2, -s * 0.4, s * 0.25, -s * 0.7, INK, 1.6));
  out.push(C(-s * 0.25, -s * 0.72, s * 0.1, W, { sw: 1.2 }), C(s * 0.25, -s * 0.72, s * 0.1, W, { sw: 1.2 }));
  return out;
};

/** An umbrella: canopy c with stripes c2 (pat stripes), handle down. */
const umbrella: Draw = ({ s, c, c2, pat }) => {
  const out: Shape[] = [P(`M0,${n2(-s * 0.1)}L0,${n2(s * 0.9)}q0,${n2(s * 0.25)} ${n2(-s * 0.25)},${n2(s * 0.25)}`, 'none', { sw: 2.2 }), P(`M${n2(-s)},0A${n2(s)},${n2(s * 0.9)} 0 0 1 ${n2(s)},0Q${n2(s * 0.5)},${n2(-s * 0.2)} 0,0Q${n2(-s * 0.5)},${n2(-s * 0.2)} ${n2(-s)},0Z`, c)];
  if (pat === 'stripes') out.push(P(`M${n2(-s * 0.15)},${n2(-s * 0.88)}L${n2(-s * 0.35)},${n2(-s * 0.08)}Q0,${n2(-s * 0.2)} ${n2(s * 0.35)},${n2(-s * 0.08)}L${n2(s * 0.15)},${n2(-s * 0.88)}Z`, c2, { sw: 1.4 }));
  return out;
};

/** A sock: c with stripes in c2 when pat = stripes; heel and toe c2. */
const sock: Draw = ({ s, c, c2, pat }) => {
  const out: Shape[] = [P(`M${n2(-s * 0.4)},${n2(-s)}L${n2(s * 0.3)},${n2(-s)}L${n2(s * 0.3)},${n2(s * 0.2)}L${n2(s * 0.8)},${n2(s * 0.45)}Q${n2(s * 1.05)},${n2(s * 0.95)} ${n2(s * 0.55)},${n2(s * 0.95)}L${n2(-s * 0.1)},${n2(s * 0.75)}Q${n2(-s * 0.4)},${n2(s * 0.65)} ${n2(-s * 0.4)},${n2(s * 0.3)}Z`, c)];
  if (pat === 'stripes') for (const y of [-0.6, -0.15]) out.push(R(-s * 0.4, y * s, s * 0.7, s * 0.22, c2, 0, { sw: 1.2 }));
  out.push(R(-s * 0.45, -s * 1.05, s * 0.8, s * 0.25, W, 1.5, { sw: 1.4 }));
  return out;
};

/** A tin robot: body c; on = antenna; c2 = eyes/panel. */
const robot: Draw = ({ s, c, c2, on }) => {
  const out: Shape[] = [];
  if (on) out.push(L(0, -s * 0.85, 0, -s * 1.2, INK, 2), C(0, -s * 1.25, s * 0.13, PALETTE.coral, { sw: 1.2 }));
  out.push(R(-s * 0.4, s * 0.55, s * 0.25, s * 0.42, INK, 0, { s: null }), R(s * 0.15, s * 0.55, s * 0.25, s * 0.42, INK, 0, { s: null }));
  out.push(R(-s * 0.65, -s * 0.15, s * 1.3, s * 0.85, c, s * 0.12), R(-s * 0.5, -s * 0.88, s * 1.0, s * 0.72, c, s * 0.12));
  out.push(C(-s * 0.2, -s * 0.52, s * 0.13, c2, { sw: 1.2 }), C(s * 0.2, -s * 0.52, s * 0.13, c2, { sw: 1.2 }), R(-s * 0.3, s * 0.05, s * 0.6, s * 0.3, c2, 1.5, { sw: 1.2 }));
  return out;
};

/** A toy rocket pointing up: body c, fins c2; n portholes. */
const rocket: Draw = ({ s, c, c2, n = 1 }) => {
  const out: Shape[] = [P(poly([[-s * 0.35, s * 0.4], [-s * 0.7, s * 1.0], [-s * 0.3, s * 0.95]]), c2), P(poly([[s * 0.35, s * 0.4], [s * 0.7, s * 1.0], [s * 0.3, s * 0.95]]), c2)];
  out.push(P(`M0,${n2(-s * 1.1)}Q${n2(s * 0.55)},${n2(-s * 0.55)} ${n2(s * 0.38)},${n2(s * 0.95)}L${n2(-s * 0.38)},${n2(s * 0.95)}Q${n2(-s * 0.55)},${n2(-s * 0.55)} 0,${n2(-s * 1.1)}Z`, c));
  for (let i = 0; i < n; i++) out.push(C(0, -s * 0.3 + i * s * 0.48, s * 0.18, PALETTE.roomSky, { sw: 1.4 }));
  return out;
};

/** A spinning top: body c, band c2. */
const top: Draw = ({ s, c, c2 }) => [
  L(0, -s * 1.0, 0, -s * 0.45, INK, 2.6),
  P(`M${n2(-s)},${n2(-s * 0.2)}Q0,${n2(-s * 0.75)} ${n2(s)},${n2(-s * 0.2)}L0,${n2(s)}Z`, c),
  P(`M${n2(-s * 0.85)},${n2(-s * 0.06)}Q0,${n2(-s * 0.45)} ${n2(s * 0.85)},${n2(-s * 0.06)}L${n2(s * 0.62)},${n2(s * 0.2)}Q0,${n2(-s * 0.15)} ${n2(-s * 0.62)},${n2(s * 0.2)}Z`, c2, { sw: 1.4 }),
];

/** A toy drum: shell c, zigzag c2; on = drumsticks. */
const drum: Draw = ({ s, c, c2, on }) => {
  const out: Shape[] = [];
  if (on) out.push(L(-s * 0.7, -s * 1.15, s * 0.1, -s * 0.45, PALETTE.woodDark, 2.4), L(s * 0.75, -s * 1.15, -s * 0.05, -s * 0.45, PALETTE.woodDark, 2.4));
  out.push(R(-s * 0.85, -s * 0.45, s * 1.7, s * 1.2, c, 2), P(polyline([[-s * 0.85, -s * 0.4], [-s * 0.45, s * 0.7], [0, -s * 0.4], [s * 0.45, s * 0.7], [s * 0.85, -s * 0.4]]), 'none', { s: c2, sw: 2.4 }));
  out.push(E(0, -s * 0.45, s * 0.85, s * 0.25, PALETTE.cream), R(-s * 0.85, -s * 0.45, s * 1.7, s * 1.2, 'none', 2));
  return out;
};

/** A swirly lollipop: c. */
const lolly: Draw = ({ s, c }) => [
  L(0, s * 0.5, 0, s * 1.5, PALETTE.cream, 3.5),
  L(0, s * 0.5, 0, s * 1.5, INK, 1),
  C(0, 0, s * 0.7, c),
  P(`M0,0m${n2(-s * 0.15)},0a${n2(s * 0.15)},${n2(s * 0.15)} 0 1 1 ${n2(s * 0.3)},0a${n2(s * 0.3)},${n2(s * 0.3)} 0 1 1 ${n2(-s * 0.6)},0a${n2(s * 0.45)},${n2(s * 0.45)} 0 1 1 ${n2(s * 0.9)},0`, 'none', { s: PALETTE.white, sw: 2 }),
];

/** The moon (shape crescent | full), c; on = sleepy face. */
const moon: Draw = ({ s, c, shape, on }) => {
  const out: Shape[] = shape === 'full' ? [C(0, 0, s, c)] : [P(`M${n2(s * 0.25)},${n2(-s)}A${n2(s)},${n2(s)} 0 1 0 ${n2(s * 0.25)},${n2(s)}A${n2(s * 0.5)},${n2(s)} 0 0 1 ${n2(s * 0.25)},${n2(-s)}Z`, c)];
  if (on) out.push(P(`M${n2(-s * 0.55)},${n2(-s * 0.1)}q${n2(s * 0.15)},${n2(s * 0.15)} ${n2(s * 0.3)},0`, 'none', { sw: 1.6 }), P(`M${n2(-s * 0.55)},${n2(s * 0.35)}q${n2(s * 0.2)},${n2(s * 0.15)} ${n2(s * 0.35)},${n2(-s * 0.05)}`, 'none', { sw: 1.6 }));
  return out;
};

/** A round tree: canopy c, n apples. */
const tree: Draw = ({ s, c, n = 0 }) => {
  const out: Shape[] = [R(-s * 0.16, s * 0.3, s * 0.32, s * 0.9, PALETTE.woodMid, 1.5), C(0, -s * 0.15, s * 0.75, c), C(-s * 0.45, s * 0.15, s * 0.42, c, { s: null }), C(s * 0.45, s * 0.12, s * 0.42, c, { s: null })];
  const spots: [number, number][] = [[-0.35, -0.4], [0.3, -0.25], [-0.05, 0.1], [0.45, 0.25], [-0.45, 0.2]];
  for (let i = 0; i < n; i++) out.push(C(spots[i][0] * s, spots[i][1] * s, s * 0.13, PALETTE.coral, { sw: 1.2 }));
  return out;
};

/** A gift box: paper c, ribbon c2; on = bow on top. */
const gift: Draw = ({ s, c, c2, on }) => {
  const out: Shape[] = [R(-s * 0.85, -s * 0.5, s * 1.7, s * 1.35, c, 1.5), R(-s * 0.95, -s * 0.75, s * 1.9, s * 0.4, c, 1.5), R(-s * 0.16, -s * 0.75, s * 0.32, s * 1.6, c2, 0, { sw: 1.3 })];
  if (on) out.push(E(-s * 0.35, -s * 0.95, s * 0.35, s * 0.2, c2, { sw: 1.4 }), E(s * 0.35, -s * 0.95, s * 0.35, s * 0.2, c2, { sw: 1.4 }), C(0, -s * 0.9, s * 0.13, c2, { sw: 1.3 }));
  return out;
};

/** A sand bucket: c, band c2; on = handle up. */
const bucket: Draw = ({ s, c, c2, on }) => [
  on ? P(`M${n2(-s * 0.7)},${n2(-s * 0.5)}Q0,${n2(-s * 1.55)} ${n2(s * 0.7)},${n2(-s * 0.5)}`, 'none', { sw: 2 }) : P(`M${n2(-s * 0.7)},${n2(-s * 0.5)}Q${n2(-s * 0.2)},${n2(s * 0.35)} ${n2(s * 0.25)},${n2(s * 0.5)}`, 'none', { sw: 2 }),
  P(poly([[-s * 0.8, -s * 0.55], [s * 0.8, -s * 0.55], [s * 0.6, s * 0.85], [-s * 0.6, s * 0.85]]), c),
  P(poly([[-s * 0.75, -s * 0.25], [s * 0.75, -s * 0.25], [s * 0.71, 0], [-s * 0.71, 0]]), c2, { sw: 1.3 }),
];

/** A ladybird: shell c, n spots. */
const ladybird: Draw = ({ s, c, n = 4 }) => {
  const out: Shape[] = [C(0, -s * 0.7, s * 0.38, INK, { s: null }), C(0, 0, s * 0.8, c), L(0, -s * 0.8, 0, s * 0.8, INK, 1.6)];
  const spots: [number, number][] = [[-0.38, -0.3], [0.38, -0.3], [-0.4, 0.3], [0.4, 0.3], [0, 0.0], [0, 0.5]];
  for (let i = 0; i < n; i++) out.push(C(spots[i][0] * s, spots[i][1] * s, s * 0.14, INK, { s: null }));
  return out;
};

/** A towel hanging on a rail: c with stripes c2 (pat stripes | plain). */
const towel: Draw = ({ s, c, c2, pat }) => {
  const out: Shape[] = [R(-s * 0.7, -s, s * 1.4, s * 2, c, 2)];
  if (pat === 'stripes') for (const y of [0.45, 0.7]) out.push(R(-s * 0.7, y * s, s * 1.4, s * 0.14, c2, 0, { s: null }));
  else if (pat === 'dots') for (const [a, b] of [[-0.35, -0.4], [0.3, -0.1], [-0.25, 0.3], [0.35, 0.6]]) out.push(C(a * s, b * s, s * 0.13, c2, { s: null }));
  out.push(R(-s * 0.7, -s, s * 1.4, s * 2, 'none', 2), R(-s * 0.8, -s * 1.05, s * 1.6, s * 0.25, tint(c, 0.4), 2, { sw: 1.5 }));
  return out;
};

/** A bottle: c, label c2; shape round | tall. */
const bottle: Draw = ({ s, c, c2, shape }) => {
  if (shape === 'round') return [R(-s * 0.18, -s * 1.0, s * 0.36, s * 0.45, c2, 1, { sw: 1.4 }), C(0, s * 0.25, s * 0.72, c), RC(0, s * 0.3, s * 0.8, s * 0.4, PALETTE.white, 1.5, { sw: 1.2 })];
  return [R(-s * 0.18, -s * 1.05, s * 0.36, s * 0.35, c2, 1, { sw: 1.4 }), R(-s * 0.45, -s * 0.72, s * 0.9, s * 1.72, c, s * 0.2), RC(0, s * 0.2, s * 0.9, s * 0.5, PALETTE.white, 0, { sw: 1.2 })];
};

/** A bubble cluster: n bubbles (soap). */
const bubbles: Draw = ({ s, n = 3 }) => {
  const spots: [number, number, number][] = [[0, 0, 0.55], [0.6, -0.45, 0.35], [-0.55, -0.5, 0.3], [0.5, 0.5, 0.3], [-0.5, 0.45, 0.25]];
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, r] = spots[i];
    out.push(C(x * s, y * s, r * s, tint(PALETTE.roomSky, 0.5), { s: PALETTE.toyBlue, sw: 1.5 }), E((x - r * 0.35) * s, (y - r * 0.4) * s, r * s * 0.25, r * s * 0.15, W, { s: null }));
  }
  return out;
};

/** A treasure chest: wood c, bands c2; on = open with gold. */
const chest: Draw = ({ s, c, c2, on }) => {
  const out: Shape[] = [];
  if (on) {
    out.push(P(poly([[-s * 0.9, -s * 0.2], [s * 0.9, -s * 0.2], [s * 0.75, -s * 1.05], [-s * 0.75, -s * 1.05]]), shade(c, 0.15)));
    out.push(C(-s * 0.35, -s * 0.25, s * 0.25, PALETTE.honey, { sw: 1.2 }), C(s * 0.15, -s * 0.3, s * 0.25, PALETTE.honey, { sw: 1.2 }), C(s * 0.5, -s * 0.2, s * 0.2, PALETTE.honey, { sw: 1.2 }));
  } else out.push(P(`M${n2(-s * 0.9)},${n2(-s * 0.15)}Q${n2(-s * 0.9)},${n2(-s * 0.85)} 0,${n2(-s * 0.85)}Q${n2(s * 0.9)},${n2(-s * 0.85)} ${n2(s * 0.9)},${n2(-s * 0.15)}Z`, c));
  out.push(R(-s * 0.9, -s * 0.15, s * 1.8, s * 0.95, c, 1.5), R(-s * 0.7, -s * 0.15, s * 0.22, s * 0.95, c2, 0, { sw: 1.2 }), R(s * 0.48, -s * 0.15, s * 0.22, s * 0.95, c2, 0, { sw: 1.2 }), RC(0, s * 0.1, s * 0.3, s * 0.35, c2, 1, { sw: 1.2 }));
  return out;
};

/** A slipper: c with a pom-pom c2 (on). */
const slipper: Draw = ({ s, c, c2, on }) => {
  const out: Shape[] = [E(0, 0, s, s * 0.45, c), P(`M${n2(-s * 0.05)},${n2(-s * 0.4)}Q${n2(s * 0.9)},${n2(-s * 0.55)} ${n2(s * 0.95)},${n2(s * 0.05)}Q${n2(s * 0.5)},${n2(s * 0.3)} ${n2(-s * 0.05)},${n2(s * 0.35)}Z`, shade(c, 0.12), { sw: 1.6 })];
  if (on) out.push(C(s * 0.35, -s * 0.35, s * 0.25, c2, { sw: 1.4 }));
  return out;
};

/** A clock: rim c, hands at `rot` (big hand) and a fixed small hand. */
const clock: Draw = ({ s, c, n = 0 }) => {
  const a = ((n % 12) / 12) * Math.PI * 2 - Math.PI / 2;
  const out: Shape[] = [C(0, 0, s, c), C(0, 0, s * 0.78, PALETTE.white, { sw: 1.5 })];
  for (let i = 0; i < 12; i += 3) {
    const b = (i / 12) * Math.PI * 2;
    out.push(C(Math.cos(b) * s * 0.62, Math.sin(b) * s * 0.62, s * 0.06, INK, { s: null }));
  }
  out.push(L(0, 0, Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6, INK, 2.4), L(0, 0, 0, -s * 0.38, INK, 2.8), C(0, 0, s * 0.09, INK, { s: null }));
  return out;
};

/** A star mobile charm / night-sky twinkle: four-point sparkle c. */
const twinkle: Draw = ({ s, c }) => [P(`M0,${n2(-s)}Q${n2(s * 0.15)},${n2(-s * 0.15)} ${n2(s)},0Q${n2(s * 0.15)},${n2(s * 0.15)} 0,${n2(s)}Q${n2(-s * 0.15)},${n2(s * 0.15)} ${n2(-s)},0Q${n2(-s * 0.15)},${n2(-s * 0.15)} 0,${n2(-s)}Z`, c, { sw: 1.5 })];

/** A sandwich triangle: bread c, filling c2. */
const sandwich: Draw = ({ s, c, c2 }) => [
  P(poly([[-s, s * 0.6], [s, s * 0.6], [-s * 0.2, -s * 0.8]]), c),
  P(polyline([[-s * 0.85, s * 0.42], [s * 0.75, s * 0.42]]), 'none', { s: c2, sw: 4 }),
  P(poly([[-s, s * 0.6], [s, s * 0.6], [-s * 0.2, -s * 0.8]]), 'none'),
];

/** A pirate flag on a pole: cloth c, mark c2 (shape skull | stripe | star). */
const pennant: Draw = ({ s, c, c2, shape }) => {
  const out: Shape[] = [L(-s * 0.8, -s, -s * 0.8, s * 1.1, PALETTE.woodDark, 2.6), P(`M${n2(-s * 0.8)},${n2(-s)}Q${n2(0)},${n2(-s * 1.2)} ${n2(s * 0.8)},${n2(-s)}L${n2(s * 0.8)},${n2(s * 0.1)}Q0,${n2(-s * 0.1)} ${n2(-s * 0.8)},${n2(s * 0.1)}Z`, c)];
  if (shape === 'skull') out.push(C(0, -s * 0.55, s * 0.25, c2, { s: null }), R(-s * 0.13, -s * 0.38, s * 0.26, s * 0.15, c2, 1, { s: null }), C(-s * 0.09, -s * 0.57, s * 0.06, c, { s: null }), C(s * 0.09, -s * 0.57, s * 0.06, c, { s: null }));
  else if (shape === 'star') out.push(P(starPath(0, -s * 0.47, s * 0.32, s * 0.14), c2, { s: null }));
  else out.push(R(-s * 0.8, -s * 0.6, s * 1.6, s * 0.22, c2, 0, { s: null }));
  return out;
};

export const PROPS = {
  ball,
  block,
  star,
  heart,
  flower,
  fish,
  boat,
  cup,
  apple,
  books,
  kite,
  balloon,
  duck,
  car,
  bird,
  cloud,
  sun,
  cake,
  teddy,
  shell,
  jar,
  lamp,
  frame,
  plant,
  hat,
  mushroom,
  butterfly,
  flag,
  die,
  starfish,
  crab,
  umbrella,
  sock,
  robot,
  rocket,
  top,
  drum,
  lolly,
  moon,
  tree,
  gift,
  bucket,
  ladybird,
  towel,
  bottle,
  bubbles,
  chest,
  slipper,
  clock,
  twinkle,
  sandwich,
  pennant,
} satisfies Record<string, Draw>;

export type PropKind = keyof typeof PROPS;

/** Draw one prop with its parameters, placed at (x, y) (applies dx/dy, rot, flip, sc, hide). */
export function drawProp(kind: PropKind, x: number, y: number, p: Params): Shape[] {
  if (p.hide) return [];
  const s = p.s ?? 14;
  const shapes = PROPS[kind]({ ...p, s, c: p.c ?? PALETTE.coral, c2: p.c2 ?? PALETTE.white });
  const sc = p.sc ?? 1;
  let tf = `translate(${n2(x + (p.dx ?? 0))} ${n2(y + (p.dy ?? 0))})`;
  if (p.rot) tf += ` rotate(${n2(p.rot)})`;
  if (p.flip || sc !== 1) tf += ` scale(${n2(p.flip ? -sc : sc)} ${n2(sc)})`;
  return [G(tf, shapes)];
}
