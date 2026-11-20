/** Find the Original: Baldwyn, the wind-up gentleman, and his crowd of look-alikes on a tray. */
import { PALETTE } from '../../game/palette';
import { Art, Burst, Cross, Finger, INK, Key, Star, line, thin, vars } from './kit';

interface Look {
  body: string;
  belt: string;
  buttons: number;
  hat: 'top' | 'bowler' | 'fez' | 'none';
  hatPaint: string;
  tache: boolean;
  held: 'cane' | 'umbrella' | 'flower' | 'none';
  nose: string;
}

/** This picture's Baldwyn (the real one changes every match). */
const BALDWYN: Look = { body: PALETTE.sage, belt: PALETTE.honey, buttons: 3, hat: 'top', hatPaint: PALETTE.inkPurple, tache: true, held: 'cane', nose: PALETTE.coral };

/** Baldwyn seen from the front, feet at (x, y), about 72 tall with a top hat at s = 1. */
function Gent({ x, y, s = 1, look = BALDWYN, className, style }: { x: number; y: number; s?: number; look?: Look; className?: string; style?: React.CSSProperties }) {
  const l = look;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={className} style={style}>
        {/* key at his side */}
        <path d="M14 -24h6" stroke={PALETTE.brass} strokeWidth={3} />
        <ellipse cx={23} cy={-29} rx={3.2} ry={4.6} fill={PALETTE.brass} {...thin} />
        <ellipse cx={23} cy={-19} rx={3.2} ry={4.6} fill={PALETTE.brass} {...thin} />
        {l.held === 'cane' && <path d="M-19 -18V-1M-19 -18q0 -6 5 -6" fill="none" stroke={PALETTE.woodDark} strokeWidth={3.4} strokeLinecap="round" />}
        {l.held === 'umbrella' && (
          <>
            <path d="M-20 -32V-2q0 3 3 3" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" />
            <path d="M-30 -30q10 -14 20 0q-5 -3 -10 0q-5 -3 -10 0z" fill={PALETTE.coral} {...thin} />
          </>
        )}
        {l.held === 'flower' && (
          <>
            <path d="M-19 -18V-34" stroke={PALETTE.feltDark} strokeWidth={2.4} strokeLinecap="round" />
            <circle cx={-19} cy={-37} r={5} fill={PALETTE.honey} {...thin} />
            <circle cx={-19} cy={-37} r={2} fill={PALETTE.coral} />
          </>
        )}
        <ellipse cx={-6} cy={-2} rx={6} ry={3.5} fill={INK} />
        <ellipse cx={6} cy={-2} rx={6} ry={3.5} fill={INK} />
        <rect x={-14} y={-35} width={28} height={32} rx={10} fill={l.body} {...line} />
        <rect x={-14} y={-17} width={28} height={5} fill={l.belt} {...thin} />
        {Array.from({ length: l.buttons }, (_, i) => (
          <circle key={i} cy={-30 + i * 6 + (i > 1 ? 7 : 0)} r={2} fill={PALETTE.cream} {...thin} />
        ))}
        <circle cx={-16} cy={-18} r={4} fill={PALETTE.white} {...thin} />
        <circle cx={16} cy={-18} r={4} fill={PALETTE.white} {...thin} />
        <circle cy={-46} r={11.5} fill={PALETTE.cream} {...line} />
        <circle cx={-4.5} cy={-48} r={1.8} fill={INK} />
        <circle cx={4.5} cy={-48} r={1.8} fill={INK} />
        <circle cy={-43.5} r={2.8} fill={l.nose} {...thin} />
        {l.tache && <path d="M-1 -40q-5 -2 -9 1q4 -6 9 -3q5 -3 9 3q-4 -3 -9 -1z" fill={PALETTE.woodDark} stroke={INK} strokeWidth={1.2} />}
        {l.hat === 'top' && (
          <>
            <rect x={-9} y={-74} width={18} height={20} rx={2} fill={l.hatPaint} {...line} />
            <rect x={-9} y={-60} width={18} height={4} fill={PALETTE.coral} />
            <rect x={-15} y={-57} width={30} height={4} rx={2} fill={l.hatPaint} {...thin} />
          </>
        )}
        {l.hat === 'bowler' && (
          <>
            <path d="M-11 -55a11 11 0 0 1 22 0z" fill={l.hatPaint} {...line} />
            <rect x={-15} y={-57} width={30} height={4} rx={2} fill={l.hatPaint} {...thin} />
          </>
        )}
        {l.hat === 'fez' && (
          <>
            <path d="M-8 -55L-6 -69H6L8 -55z" fill={PALETTE.coral} {...line} />
            <path d="M0 -69q6 2 6 10" fill="none" stroke={PALETTE.honey} strokeWidth={2} />
          </>
        )}
      </g>
    </g>
  );
}

/** Baldwyn's reference card. */
function Card({ x, y, s = 1, children }: { x: number; y: number; s?: number; children?: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-44} y={-68} width={88} height={136} rx={8} fill={PALETTE.white} stroke={PALETTE.honey} strokeWidth={6} />
      <rect x={-44} y={-68} width={88} height={136} rx={8} fill="none" {...line} />
      {children}
    </g>
  );
}

function Spot({ x, y, r = 11, d = '0s' }: { x: number; y: number; r?: number; d?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ta-pulse" style={vars({ d })}>
        <circle r={r} fill="none" stroke={PALETTE.coral} strokeWidth={3} strokeDasharray="5 3.5" />
      </g>
    </g>
  );
}

function Meet() {
  return (
    <Art bg={PALETTE.woodDark}>
      <Card x={110} y={75}>
        <Gent x={0} y={56} s={1.45} />
      </Card>
      <Spot x={110} y={-0 + 33} r={15} />
      <Spot x={110} y={93} r={12} d="-0.4s" />
      <Spot x={82} y={104} r={12} d="-0.8s" />
      {/* magnifying glass */}
      <g transform="translate(158 96)">
        <path d="M14 14l22 22" stroke={PALETTE.woodLight} strokeWidth={8} strokeLinecap="round" />
        <path d="M14 14l22 22" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.5} />
        <circle r={22} fill={PALETTE.roomSky} fillOpacity={0.55} stroke={PALETTE.brass} strokeWidth={6} />
        <circle r={22} fill="none" {...line} />
        <path d="M-12 -6q4 -10 14 -12" fill="none" stroke={PALETTE.white} strokeWidth={3} strokeLinecap="round" />
      </g>
    </Art>
  );
}

const CROWD: Look[] = [
  { ...BALDWYN, hat: 'bowler' },
  { ...BALDWYN, body: PALETTE.toyBlue },
  BALDWYN,
  { ...BALDWYN, tache: false },
  { ...BALDWYN, held: 'umbrella' },
];

/** The wooden tray of look-alikes, the real one ringed in honey. */
function Tray({ pick = 2, y = 112 }: { pick?: number; y?: number }) {
  return (
    <>
      <rect x={8} y={y - 62} width={244} height={74} rx={8} fill={PALETTE.woodLight} {...line} />
      <rect x={14} y={y - 56} width={232} height={62} rx={5} fill={PALETTE.woodMid} opacity={0.35} />
      <ellipse cx={46 + pick * 42} cy={y - 1} rx={20} ry={6} fill={PALETTE.honey} {...thin} />
      {CROWD.map((l, i) => (
        <Gent key={i} x={46 + i * 42} y={y} s={0.72} look={l} />
      ))}
      <g transform={`translate(${46 + pick * 42} ${y - 28})`}>
        <g className="ta-pulse">
          <rect x={-21} y={-34} width={42} height={64} rx={12} fill="none" stroke={PALETTE.honey} strokeWidth={4} />
          <rect x={-21} y={-34} width={42} height={64} rx={12} fill="none" stroke={INK} strokeWidth={1.2} />
        </g>
      </g>
    </>
  );
}

function Crowd({ touch }: { touch?: boolean }) {
  return (
    <Art bg={PALETTE.woodDark}>
      <Tray y={104} />
      <Card x={22} y={22} s={0.28}>
        <Gent x={0} y={56} s={1.45} />
      </Card>
      {touch ? (
        <Finger x={140} y={84} />
      ) : (
        <>
          <Key x={92} y={134} arrow="left" />
          <Key x={124} y={134} arrow="right" />
          <Key x={172} y={134} k="Enter" w={54} press />
        </>
      )}
    </Art>
  );
}

function Hourglass({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g>
        <rect x={-11} y={-17} width={22} height={4} rx={2} fill={PALETTE.woodMid} {...thin} />
        <rect x={-11} y={13} width={22} height={4} rx={2} fill={PALETTE.woodMid} {...thin} />
        <path d="M-8 -13H8L1.5 0L8 13H-8L-1.5 0z" fill={PALETTE.roomSky} {...thin} />
        <path d="M-5 9H5L0 3z" fill={PALETTE.honey} />
        <path d="M-5 -11H5L0 -5z" fill={PALETTE.honey} />
      </g>
    </g>
  );
}

function Fast() {
  return (
    <Art bg={PALETTE.woodDark}>
      <rect x={8} y={8} width={118} height={112} rx={8} fill={PALETTE.woodLight} {...line} />
      <rect x={134} y={8} width={118} height={112} rx={8} fill={PALETTE.woodLight} {...line} />
      <Burst x={50} y={72} r={34} fill={PALETTE.honey} spikes={12} className="ta-pulse" />
      <Gent x={50} y={108} s={0.95} />
      <Star x={98} y={34} r={12} className="ta-pop" />
      <Star x={98} y={62} r={10} className="ta-pop" style={vars({ d: '0.15s' })} />
      <Star x={98} y={86} r={8} className="ta-pop" style={vars({ d: '0.3s' })} />
      <Gent x={176} y={108} s={0.95} look={CROWD[0]} />
      <Cross x={176} y={22} s={0.9} />
      <Hourglass x={226} y={64} />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={90 + i * 20} cy={136} r={6} fill={i < 2 ? PALETTE.honey : PALETTE.cream} {...thin} />
      ))}
    </Art>
  );
}

export const FINDORIGINAL_ART = {
  'findoriginal-meet': () => <Meet />,
  'findoriginal-crowd': () => <Crowd />,
  'findoriginal-crowd-touch': () => <Crowd touch />,
  'findoriginal-fast': () => <Fast />,
};
