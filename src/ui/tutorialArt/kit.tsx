/**
 * Building blocks for the tutorial pictures: a 260×150 frame, the wind-up contender, key caps,
 * the touch joystick and buttons, a tapping finger, arrows and marks. Everything is plain inline
 * SVG drawn in code from the palette (no icon packs, no emoji, no text except key-cap and button
 * labels). Animation is CSS only (`tutorialArt.css`, classes `ta-*`) and is switched off by the
 * global `prefers-reduced-motion` rule, so every picture must already explain its rule when still.
 *
 * Animation classes go on a wrapper `<g>` that has no `transform` attribute of its own (a CSS
 * transform replaces the attribute), so place things with an outer translate and animate inside.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { PAINT_JOBS, PALETTE, ROOM } from '../../game/palette';
import './tutorialArt.css';

export const W = 260;
export const H = 150;
export const INK = PALETTE.ink;

/** The local player (default paint) and four rivals, so "you" reads the same in every picture. */
export const YOU = PAINT_JOBS[0];
export const RIVALS = [PAINT_JOBS[1], PAINT_JOBS[2], PAINT_JOBS[3], PAINT_JOBS[4]] as const;
/** Body / trim / accent, as in a paint job. */
export interface Paint {
  body: string;
  trim: string;
  accent: string;
}
/** A knocked-out toy goes grey, like `MiniContender`. */
export const OUT: Paint = { body: PALETTE.tinGrey, trim: PALETTE.cream, accent: PALETTE.tinGrey };

export const line = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
export const thin = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

type Anim = { className?: string; style?: CSSProperties };
/** CSS custom properties for the animation classes (`--dx`, `--dy`, `--d` delay, `--t` duration…). */
export const vars = (v: Record<string, string | number>): CSSProperties => {
  const o: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) o[`--${k}`] = typeof val === 'number' ? `${val}px` : val;
  return o as CSSProperties;
};

/** The picture frame: a 260×150 SVG with a background. Decorative: the step text says the same. */
export function Art({ bg = PALETTE.cream, children }: { bg?: string; children: ReactNode }) {
  return (
    <svg className="ta" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <rect width={W} height={H} fill={bg} />
      {children}
    </svg>
  );
}

/** A group placed at (x, y), optionally scaled, with an animation wrapper inside. */
export function At({ x = 0, y = 0, s = 1, r = 0, className, style, children }: { x?: number; y?: number; s?: number; r?: number; children: ReactNode } & Anim) {
  return (
    <g transform={`translate(${x} ${y})${r ? ` rotate(${r})` : ''}${s !== 1 ? ` scale(${s})` : ''}`}>
      {className || style ? (
        <g className={className} style={style}>
          {children}
        </g>
      ) : (
        children
      )}
    </g>
  );
}

// ------------------------------------------------------------------------------- the contender

/**
 * The wind-up contender seen side-on (block body, head, turret eye, brass key on the back), feet
 * at (0, 0), about 50 units tall at s = 1, facing right (`face = -1` faces left).
 * `out` greys it and closes the eye. `keyTurn` animates the key. `hold` adds a held item in front.
 */
export function Toy({
  x,
  y,
  s = 1,
  face = 1,
  paint = YOU,
  out = false,
  keyTurn = true,
  tilt = 0,
  hold,
  className,
  style,
}: {
  x: number;
  y: number;
  s?: number;
  face?: 1 | -1;
  paint?: Paint;
  out?: boolean;
  keyTurn?: boolean;
  /** Degrees, around the feet (e.g. −80 lies the toy on its back). */
  tilt?: number;
  hold?: ReactNode;
} & Anim) {
  const p = out ? OUT : paint;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        <g transform={`scale(${face * s} ${s})${tilt ? ` rotate(${tilt})` : ''}`}>
          {/* key on the back */}
          <rect x={-18} y={-20} width={7} height={3.4} fill={PALETTE.brass} {...thin} />
          <g transform="translate(-20 -18.3)">
            <g className={keyTurn && !out ? 'ta-key' : undefined}>
              <ellipse cx={0} cy={-5.2} rx={3.4} ry={4.8} fill={PALETTE.brass} {...thin} />
              <ellipse cx={0} cy={5.2} rx={3.4} ry={4.8} fill={PALETTE.brass} {...thin} />
            </g>
          </g>
          <rect x={-11} y={-6} width={23} height={6} rx={2.5} fill={p.body} {...thin} />
          <rect x={-12} y={-28} width={24} height={23} rx={5} fill={p.body} {...line} />
          <rect x={-12} y={-19} width={24} height={4.5} fill={p.trim} {...thin} />
          <rect x={-3} y={-24} width={8} height={12} rx={3.5} fill={p.accent} {...thin} />
          <rect x={-10} y={-40} width={20} height={13} rx={4} fill={p.body} {...line} />
          <rect x={-6} y={-51} width={14} height={12} rx={5} fill={p.accent} {...line} />
          <circle cx={8.2} cy={-45} r={4.6} fill={PALETTE.white} {...thin} />
          {out ? (
            <path d="M6.4 -46.8l3.6 3.6M10 -46.8l-3.6 3.6" {...thin} />
          ) : (
            <circle cx={9.6} cy={-45} r={2.1} fill={INK} />
          )}
          {hold && <g transform="translate(8 -18)">{hold}</g>}
        </g>
      </g>
    </g>
  );
}

/** Three short speed lines trailing a running toy (drawn behind it, to its left when facing right). */
export function SpeedLines({ x, y, face = 1, s = 1, color = INK }: { x: number; y: number; face?: 1 | -1; s?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${face * s} ${s})`} stroke={color} strokeWidth={2.5} strokeLinecap="round" opacity={0.75}>
      <path d="M-30 -36h-12M-28 -26h-16M-30 -16h-10" />
    </g>
  );
}

// ------------------------------------------------------------------------------------ controls

/** A key cap in the look of the UI's `KeyCap`: paper face, ink rim and a 3-unit ink shadow. */
export function Key({
  x,
  y,
  k,
  w = 26,
  arrow,
  lit = false,
  press = false,
  delay,
  fs = 15,
}: {
  x: number;
  y: number;
  /** Label (centred on (x, y)). */
  k?: string;
  w?: number;
  /** Draw an arrow glyph instead of a label. */
  arrow?: 'up' | 'down' | 'left' | 'right';
  /** Held down and highlighted. */
  lit?: boolean;
  /** Animate a press (optionally after `delay`). */
  press?: boolean;
  delay?: string;
  fs?: number;
}) {
  const h = 26;
  const rot = { up: 0, right: 90, down: 180, left: 270 }[arrow ?? 'up'];
  const face = (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6} fill={lit ? PALETTE.honey : PALETTE.white} stroke={INK} strokeWidth={2} />
      {arrow ? (
        <path d="M0 -6l6 6.5h-3.6v5.5h-4.8v-5.5h-3.6z" fill={INK} transform={`rotate(${rot})`} />
      ) : (
        <text x={0} y={fs * 0.36} textAnchor="middle" fontSize={fs} className="ta-label" fill={INK}>
          {k}
        </text>
      )}
    </>
  );
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2 + 3} width={w} height={h} rx={6} fill={INK} />
      {lit ? <g transform="translate(0 2.5)">{face}</g> : <g className={press ? 'ta-press' : undefined} style={delay ? vars({ d: delay }) : undefined}>{face}</g>}
    </g>
  );
}

/** W A S D (or arrows) as a cluster; `lit` names the key(s) shown held. */
export function MoveKeys({ x, y, s = 1, lit = [], arrows = false, press = false }: { x: number; y: number; s?: number; lit?: string[]; arrows?: boolean; press?: boolean }) {
  const ks = arrows ? (['up', 'left', 'down', 'right'] as const) : (['W', 'A', 'S', 'D'] as const);
  const pos = [
    [0, -15],
    [-29, 15],
    [0, 15],
    [29, 15],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {ks.map((k, i) => (
        <Key key={k} x={pos[i][0]} y={pos[i][1]} k={arrows ? undefined : k} arrow={arrows ? (k as 'up') : undefined} lit={lit.includes(k)} press={press && i === 0} />
      ))}
    </g>
  );
}

/** The touch joystick: felt ring, wooden knob. `kx, ky` push the knob (−1…1); `arrow` shows the push. */
export function Stick({ x, y, r = 24, kx = 0, ky = 0, arrow = false, className, style }: { x: number; y: number; r?: number; kx?: number; ky?: number; arrow?: boolean } & Anim) {
  const kr = r * 0.46;
  const reach = r - kr * 0.55;
  const ang = Math.atan2(ky, kx);
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} cy={3} fill={INK} opacity={0.35} />
      <circle r={r} fill={PALETTE.feltDark} stroke={INK} strokeWidth={2.5} />
      <circle r={r * 0.62} fill="none" stroke={PALETTE.cream} strokeWidth={1.4} opacity={0.35} />
      {arrow && (kx || ky) ? (
        <path d={`M${Math.cos(ang) * r * 0.2} ${Math.sin(ang) * r * 0.2}L${Math.cos(ang) * (r + 9)} ${Math.sin(ang) * (r + 9)}`} stroke={PALETTE.honey} strokeWidth={4} strokeLinecap="round" />
      ) : null}
      <g className={className} style={style}>
        <g transform={`translate(${kx * reach} ${ky * reach})`}>
          <circle r={kr} cy={2.5} fill={INK} opacity={0.5} />
          <circle r={kr} fill={PALETTE.woodLight} stroke={INK} strokeWidth={2.5} />
          <circle r={kr * 0.42} cx={-kr * 0.3} cy={-kr * 0.32} fill={PALETTE.cream} opacity={0.55} />
        </g>
      </g>
      {arrow && (kx || ky) ? <ArrowHead x={Math.cos(ang) * (r + 13)} y={Math.sin(ang) * (r + 13)} a={ang} size={8} color={PALETTE.honey} /> : null}
    </g>
  );
}

/** A round on-screen button (honey by default) with its in-game label. */
export function TapBtn({ x, y, r = 20, label, fill = PALETTE.honey, fs = 11, down = false, press = false, delay }: { x: number; y: number; r?: number; label?: string; fill?: string; fs?: number; down?: boolean; press?: boolean; delay?: string }) {
  const face = (
    <>
      <circle r={r} fill={fill} stroke={INK} strokeWidth={2.5} />
      <circle r={r * 0.55} cx={-r * 0.3} cy={-r * 0.35} fill={PALETTE.white} opacity={0.3} />
      {label && (
        <text y={fs * 0.36} textAnchor="middle" fontSize={fs} className="ta-label" fill={INK}>
          {label}
        </text>
      )}
    </>
  );
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} cy={4} fill={INK} />
      {down ? <g transform="translate(0 3)">{face}</g> : <g className={press ? 'ta-press' : undefined} style={delay ? vars({ d: delay }) : undefined}>{face}</g>}
    </g>
  );
}

/** A rounded on-screen pill button (e.g. "Crank!", "Ready"). */
export function PillBtn({ x, y, w = 56, h = 24, label, fill = PALETTE.honey, fs = 12, press = false, delay }: { x: number; y: number; w?: number; h?: number; label: string; fill?: string; fs?: number; press?: boolean; delay?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2 + 3.5} width={w} height={h} rx={h / 2.4} fill={INK} />
      <g className={press ? 'ta-press' : undefined} style={delay ? vars({ d: delay }) : undefined}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2.4} fill={fill} stroke={INK} strokeWidth={2.2} />
        <text y={fs * 0.36} textAnchor="middle" fontSize={fs} className="ta-label" fill={INK}>
          {label}
        </text>
      </g>
    </g>
  );
}

/**
 * A fingertip touching (x, y), reaching in from below right (or from above, for key caps).
 * `anim`: 'tap' presses and ripples, 'lift' rises off (let go), 'none' rests.
 */
export function Finger({ x, y, from = 'below', anim = 'tap', delay, t, flip = false }: { x: number; y: number; from?: 'below' | 'above'; anim?: 'tap' | 'lift' | 'none'; delay?: string; t?: string; flip?: boolean }) {
  const st = delay || t ? vars({ d: delay ?? '0s', t: t ?? '1.6s' }) : undefined;
  return (
    <g transform={`translate(${x} ${y})`}>
      {anim === 'tap' && (
        <g className="ta-ripple" style={st}>
          <circle r={9} fill="none" stroke={PALETTE.white} strokeWidth={2.5} />
        </g>
      )}
      <g className={anim === 'tap' ? 'ta-tap' : anim === 'lift' ? 'ta-lift' : undefined} style={st}>
        <g transform={`scale(${flip ? -1 : 1} ${from === 'above' ? -1 : 1}) rotate(-28)`}>
          <rect x={-7} y={1} width={14} height={38} rx={7} fill={ROOM.teddyLight} {...line} />
          <rect x={-4} y={3.5} width={8} height={9} rx={3.5} fill={PALETTE.white} {...thin} />
          <path d="M-4 22.5h8M-4 26h8" fill="none" {...thin} />
        </g>
      </g>
    </g>
  );
}

/** A computer mouse, left button highlighted when `click`. */
export function Mouse({ x, y, s = 1, click = false }: { x: number; y: number; s?: number; click?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-11} y={-16} width={22} height={32} rx={11} fill={PALETTE.white} {...line} />
      <path d="M-11 -4h22M0 -16v12" fill="none" {...thin} />
      {click && <path d="M-9.6 -5.2v-1.8a9.6 9.6 0 0 1 8.6 -7.6v9.4z" fill={PALETTE.honey} className="ta-blinkfast" />}
    </g>
  );
}

// -------------------------------------------------------------------------------------- arrows

export function ArrowHead({ x, y, a, size = 9, color = INK }: { x: number; y: number; a: number; size?: number; color?: string }) {
  const p = (da: number, r: number) => `${x + Math.cos(a + da) * r} ${y + Math.sin(a + da) * r}`;
  return <path d={`M${p(0, size * 0.55)}L${p(2.4, size)}L${p(-2.4, size)}z`} fill={color} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />;
}

/** A straight or bent (quadratic) arrow from (x1, y1) to (x2, y2). `bend` pushes the middle sideways. */
export function Arrow({ x1, y1, x2, y2, bend = 0, color = PALETTE.honey, w = 4, dashed = false, head = 11, className, style }: { x1: number; y1: number; x2: number; y2: number; bend?: number; color?: string; w?: number; dashed?: boolean; head?: number } & Anim) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const cx = mx + (-(y2 - y1) / len) * bend;
  const cy = my + ((x2 - x1) / len) * bend;
  const a = Math.atan2(y2 - cy, x2 - cx);
  // Stop the shaft short of the tip so the head covers its end.
  const ex = x2 - Math.cos(a) * head * 0.5;
  const ey = y2 - Math.sin(a) * head * 0.5;
  const d = bend ? `M${x1} ${y1}Q${cx} ${cy} ${ex} ${ey}` : `M${x1} ${y1}L${ex} ${ey}`;
  return (
    <g className={className} style={style}>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 3} strokeLinecap="round" strokeDasharray={dashed ? '1 9' : undefined} opacity={dashed ? 0 : 1} />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeDasharray={dashed ? `${w * 1.6} ${w * 1.5}` : undefined} />
      <ArrowHead x={x2} y={y2} a={a} size={head} color={color} />
    </g>
  );
}

// --------------------------------------------------------------------------------------- marks

/** A coral cross: wrong, out, not allowed. */
export function Cross({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r={11} fill={PALETTE.coral} stroke={INK} strokeWidth={2.2} />
      <path d="M-4.6 -4.6l9.2 9.2M4.6 -4.6l-9.2 9.2" stroke={PALETTE.white} strokeWidth={3.2} strokeLinecap="round" />
    </g>
  );
}

/** A sage tick: right, safe. */
export function Tick({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r={11} fill={PALETTE.sage} stroke={INK} strokeWidth={2.2} />
      <path d="M-5 0.5l3.4 3.6 6.4 -7.4" fill="none" stroke={PALETTE.white} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** Five-point star sticker. */
export function Star({ x, y, r = 9, fill = PALETTE.honey, className, style }: { x: number; y: number; r?: number; fill?: string } & Anim) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  }).join(' ');
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        <polygon points={pts} fill={fill} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** A four-point sparkle. */
export function Sparkle({ x, y, r = 7, fill = PALETTE.white, className, style }: { x: number; y: number; r?: number; fill?: string } & Anim) {
  const k = r * 0.28;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        <path d={`M0 ${-r}Q${k} ${-k} ${r} 0Q${k} ${k} 0 ${r}Q${-k} ${k} ${-r} 0Q${-k} ${-k} 0 ${-r}z`} fill={fill} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** A spiky comic burst (a hit, a pop). */
export function Burst({ x, y, r = 16, fill = PALETTE.honey, spikes = 9, className, style }: { x: number; y: number; r?: number; fill?: string; spikes?: number } & Anim) {
  const pts = Array.from({ length: spikes * 2 }, (_, i) => {
    const a = (i * Math.PI) / spikes;
    const rr = i % 2 ? r * 0.55 : r;
    return `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  }).join(' ');
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        <polygon points={pts} fill={fill} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** A music note glyph (drawn, not a font character). */
export function Note({ x, y, s = 1, fill = INK, className, style }: { x: number; y: number; s?: number; fill?: string } & Anim) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={className} style={style}>
        <ellipse cx={-3} cy={6} rx={5} ry={3.8} fill={fill} stroke={INK} strokeWidth={1.4} transform="rotate(-20 -3 6)" />
        <path d="M1.4 5V-10l7 3.6" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

/** A stopwatch (timer pressure), with a honey wedge of time used. */
export function Stopwatch({ x, y, r = 12, used = 0.7 }: { x: number; y: number; r?: number; used?: number }) {
  const a = -Math.PI / 2 + used * Math.PI * 2;
  const large = used > 0.5 ? 1 : 0;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-3} y={-r - 6} width={6} height={5} rx={1.5} fill={PALETTE.brass} {...thin} />
      <circle r={r} fill={PALETTE.white} {...line} />
      <path d={`M0 0V${-r + 2.5}A${r - 2.5} ${r - 2.5} 0 ${large} 1 ${Math.cos(a) * (r - 2.5)} ${Math.sin(a) * (r - 2.5)}z`} fill={PALETTE.honey} />
      <path d={`M0 0L${Math.cos(a) * (r - 3)} ${Math.sin(a) * (r - 3)}`} {...thin} />
      <circle r={1.8} fill={INK} />
    </g>
  );
}

/** A small energy / progress bar with a frame; `k` (0…1) is the fill. `drain` animates it down. */
export function Bar({ x, y, w = 40, h = 8, k = 1, fill = PALETTE.sage, frame = PALETTE.cream, drain = false, style }: { x: number; y: number; w?: number; h?: number; k?: number; fill?: string; frame?: string; drain?: boolean; style?: CSSProperties }) {
  return (
    <g transform={`translate(${x - w / 2} ${y - h / 2})`}>
      <rect x={-2} y={-2} width={w + 4} height={h + 4} rx={3} fill={frame} stroke={INK} strokeWidth={1.8} />
      <rect width={w} height={h} rx={1.5} fill={INK} opacity={0.75} />
      <g className={drain ? 'ta-drain' : undefined} style={style}>
        <rect width={w * k} height={h} rx={1.5} fill={fill} />
      </g>
    </g>
  );
}

/** Unique ids for clip paths / patterns inside one picture (several pictures share a page). */
export function useArtId(): string {
  return useId().replace(/[^a-zA-Z0-9_-]/g, '');
}
