/** Hoop Hustle: spots worth 1, 2 and 3, hold-and-release with the gold arc, the sliding hoop and the gold ball. */
import { PALETTE } from '../../game/palette';
import { Arrow, Art, Key, Mouse, RIVALS, Sparkle, Star, Stick, TapBtn, Toy, line, thin, vars } from './kit';

const VALUE = ['', PALETTE.sage, PALETTE.toyBlue, PALETTE.coral];

/** A basketball (orange, or gold). */
function Ball({ x, y, r = 6, gold = false }: { x: number; y: number; r?: number; gold?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill={gold ? PALETTE.honey : PALETTE.ballOrange} {...thin} />
      <path d={`M${-r} 0H${r}M0 ${-r}V${r}M${-r * 0.6} ${-r * 0.8}Q${-r * 0.1} 0 ${-r * 0.6} ${r * 0.8}M${r * 0.6} ${-r * 0.8}Q${r * 0.1} 0 ${r * 0.6} ${r * 0.8}`} fill="none" stroke={PALETTE.ink} strokeWidth={1.1} />
    </g>
  );
}

/** The hoop on its pole, rim at (x, y). */
function Hoop({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-3} y={-30} width={6} height={95} fill={PALETTE.toyBlue} {...thin} />
      <rect x={-26} y={-40} width={52} height={32} rx={3} fill={PALETTE.white} {...line} />
      <rect x={-10} y={-26} width={20} height={14} fill="none" stroke={PALETTE.coral} strokeWidth={2.4} />
      <path d="M-14 0l3 16h22l3-16" fill="none" stroke={PALETTE.white} strokeWidth={2} />
      <path d="M-9 0l3 16M9 0l-3 16M-14 7h28" fill="none" stroke={PALETTE.white} strokeWidth={1.4} />
      <ellipse cx={0} cy={0} rx={15} ry={4} fill="none" stroke={PALETTE.coral} strokeWidth={3.2} />
    </g>
  );
}

/** The wooden court floor with three taped arcs. */
function Court({ arcs = true }: { arcs?: boolean }) {
  return (
    <>
      <rect width={260} height={150} fill={PALETTE.cream} />
      <path d="M0 96H260V150H0z" fill={PALETTE.woodLight} {...thin} />
      {arcs &&
        [40, 75, 110].map((r) => <path key={r} d={`M${130 - r * 1.1} 150A${r * 1.1} ${r * 0.42} 0 0 1 ${130 + r * 1.1} 150`} fill="none" stroke={PALETTE.white} strokeWidth={2.4} transform="translate(0 -30)" />)}
    </>
  );
}

/** A spot marker: coloured disc and 1–3 dots. */
function SpotMark({ x, y, v }: { x: number; y: number; v: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx={11} ry={4} fill={PALETTE.white} {...thin} />
      <ellipse rx={8} ry={2.8} fill={VALUE[v]} />
      {Array.from({ length: v }, (_, i) => (
        <circle key={i} cx={(i - (v - 1) / 2) * 7} cy={9} r={2.4} fill={VALUE[v]} {...thin} />
      ))}
    </g>
  );
}

function Spots() {
  return (
    <Art>
      <Court />
      <Hoop x={130} y={48} s={0.75} />
      <SpotMark x={92} y={128} v={1} />
      <SpotMark x={46} y={136} v={2} />
      <SpotMark x={214} y={136} v={3} />
      <Toy x={92} y={124} s={0.55} />
      <Toy x={46} y={132} s={0.55} paint={RIVALS[0]} />
      <Toy x={214} y={132} s={0.55} paint={RIVALS[1]} face={-1} />
      {/* a make, and the hop to a new spot */}
      <Arrow x1={98} y1={92} x2={124} y2={52} bend={-18} dashed color={PALETTE.ballOrange} w={3} head={8} />
      <Sparkle x={150} y={46} r={6} fill={PALETTE.honey} className="ta-pop" />
      <Arrow x1={104} y1={118} x2={160} y2={122} bend={-16} color={PALETTE.honey} w={3} head={8} />
      <g opacity={0.5}>
        <SpotMark x={170} y={130} v={2} />
      </g>
    </Art>
  );
}

function Throw({ touch }: { touch?: boolean }) {
  // The arc: white dots that turn gold as the charge reaches the gold zone.
  const dots = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return { x: 62 + t * 120, y: 104 - Math.sin(t * Math.PI * 0.92) * 66 - t * 10 };
  });
  return (
    <Art>
      <Court arcs={false} />
      <Hoop x={192} y={46} s={0.85} />
      <Toy x={52} y={128} s={0.75} hold={<Ball x={6} y={-10} r={5.5} />} />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={i === dots.length - 1 ? 4 : 3} fill={PALETTE.honey} {...thin} className="ta-glow" style={vars({ d: `${i * 0.05}s`, t: '1.6s' })} />
      ))}
      {/* the charge meter, with its gold zone */}
      <g transform="translate(96 120)">
        <rect width={84} height={12} rx={6} fill={PALETTE.cream} {...line} />
        <rect x={44} width={14} height={12} fill={PALETTE.honey} stroke={PALETTE.brass} strokeWidth={1.4} />
        <g className="ta-charge" style={vars({ ox: '0%', oy: '50%', t: '1.6s' })}>
          <rect width={50} height={12} rx={6} fill={PALETTE.coral} opacity={0.7} />
        </g>
        <rect width={84} height={12} rx={6} fill="none" {...line} />
      </g>
      {touch ? (
        <>
          <TapBtn x={224} y={124} r={19} label="Throw" fs={10} fill={PALETTE.ballOrange} press />
          <Stick x={22} y={52} r={15} kx={0.4} ky={-0.6} />
        </>
      ) : (
        <>
          <Key x={200} y={130} k="Space" w={48} fs={11} press />
          <Mouse x={236} y={124} s={0.6} click />
          <Key x={14} y={44} k="A" />
          <Key x={42} y={44} k="D" />
        </>
      )}
    </Art>
  );
}

function Twists() {
  return (
    <Art>
      <Court arcs={false} />
      {/* the wind-up track and the hoop sliding along it */}
      <rect x={50} y={92} width={110} height={8} rx={4} fill={PALETTE.inkPurple} {...thin} />
      <rect x={44} y={86} width={8} height={14} rx={2} fill={PALETTE.coral} {...thin} />
      <rect x={158} y={86} width={8} height={14} rx={2} fill={PALETTE.coral} {...thin} />
      <g transform="translate(172 94)">
        <g className="ta-spin" style={vars({ t: '1.4s' })}>
          <ellipse cx={0} cy={-6} rx={3.6} ry={5.2} fill={PALETTE.brass} {...thin} />
          <ellipse cx={0} cy={6} rx={3.6} ry={5.2} fill={PALETTE.brass} {...thin} />
        </g>
      </g>
      <Arrow x1={88} y1={20} x2={60} y2={20} color={PALETTE.honey} w={3} head={8} />
      <Arrow x1={122} y1={20} x2={150} y2={20} color={PALETTE.honey} w={3} head={8} />
      <g transform="translate(105 36)">
        <g className="ta-sway" style={vars({ dx: '34px', t: '3s' })}>
          <Hoop x={0} y={10} s={0.6} />
        </g>
      </g>
      {/* the gold ball: double points */}
      <Toy x={214} y={136} s={0.62} paint={RIVALS[2]} face={-1} hold={<Ball x={6} y={-10} r={6} gold />} />
      {/* worth double: two stars */}
      <Star x={214} y={60} r={11} className="ta-pulse" />
      <Star x={240} y={60} r={11} className="ta-pulse" style={vars({ d: '0.2s' })} />
      <Sparkle x={200} y={74} r={6} fill={PALETTE.honey} className="ta-pop" />
    </Art>
  );
}

export const HOOPHUSTLE_ART = {
  'hoophustle-spots': () => <Spots />,
  'hoophustle-throw': () => <Throw />,
  'hoophustle-throw-touch': () => <Throw touch />,
  'hoophustle-twists': () => <Twists />,
};
