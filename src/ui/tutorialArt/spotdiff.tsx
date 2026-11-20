/** Odd Page Out: an open picture book whose two pages differ in a few small things. */
import { PALETTE } from '../../game/palette';
import { Art, Burst, Cross, Finger, INK, Key, Mouse, Star, Stopwatch, Tick, line, thin, vars } from './kit';

/** Which things are changed on the second page. */
interface Changes {
  ball?: boolean;
  sun?: boolean;
  flag?: boolean;
  apples?: boolean;
}

/** One storybook page at (x, y), 104×104: sky, hill, a tree, a toy house with a flag, a ball. */
function Page({ x, y, alt = {} }: { x: number; y: number; alt?: Changes }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={104} height={104} rx={3} fill={PALETTE.white} {...thin} />
      <rect x={6} y={6} width={92} height={56} fill={PALETTE.roomSky} />
      <path d="M6 62q30 -18 60 -6t32 -4v50H6z" fill={PALETTE.sage} />
      {!alt.sun && (
        <>
          <circle cx={22} cy={22} r={9} fill={PALETTE.honey} {...thin} />
        </>
      )}
      {/* tree */}
      <rect x={74} y={46} width={6} height={22} fill={PALETTE.woodMid} {...thin} />
      <circle cx={77} cy={38} r={15} fill={PALETTE.feltDark} {...thin} />
      {!alt.apples && [
        [70, 34],
        [83, 40],
        [76, 28],
      ].map(([ax, ay]) => <circle key={`${ax}`} cx={ax} cy={ay} r={2.6} fill={PALETTE.coral} stroke={INK} strokeWidth={1} />)}
      {/* house with a flag */}
      <rect x={30} y={52} width={30} height={24} fill={PALETTE.cream} {...thin} />
      <path d="M26 53L45 36L64 53z" fill={PALETTE.coral} {...thin} />
      <rect x={41} y={64} width={8} height={12} fill={PALETTE.woodMid} {...thin} />
      <path d="M45 36V24" stroke={INK} strokeWidth={1.6} />
      <path d={alt.flag ? 'M45 24h-10l3 3 -3 3h10z' : 'M45 24h10l-3 3 3 3H45z'} fill={PALETTE.toyBlue} {...thin} />
      {/* ball */}
      <circle cx={24} cy={88} r={8} fill={alt.ball ? PALETTE.toyBlue : PALETTE.coral} {...thin} />
      <path d="M17 85q7 4 14 0" fill="none" stroke={PALETTE.white} strokeWidth={2} />
    </g>
  );
}

const ALT: Changes = { ball: true, sun: true, flag: true, apples: true };

/** The open book: left page as drawn, right page with `alt` changes. */
function Book({ x = 20, y = 12, alt = ALT }: { x?: number; y?: number; alt?: Changes }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-6 -4h232v120h-232z" fill={PALETTE.woodDark} {...line} />
      <Page x={4} y={4} />
      <Page x={116} y={4} alt={alt} />
      <path d="M112 -4v120" stroke={INK} strokeWidth={2.5} />
    </g>
  );
}

/** A circled difference on the second page (and its twin on the first). */
function Ring({ x, y, r = 11, d = '0s' }: { x: number; y: number; r?: number; d?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ta-pop" style={vars({ t: '3s', d })}>
        <circle r={r} fill="none" stroke={PALETTE.honey} strokeWidth={4} />
        <circle r={r} fill="none" stroke={INK} strokeWidth={1.2} />
      </g>
    </g>
  );
}

function Pages() {
  return (
    <Art bg={PALETTE.woodLight}>
      <Book />
      {/* the right page's differences glint */}
      {[
        [164, 104],
        [162, 38],
        [220, 54],
      ].map(([sx, sy], i) => (
        <g key={i} transform={`translate(${sx} ${sy})`}>
          <g className="ta-glow" style={vars({ d: `${-i * 0.4}s` })}>
            <circle r={14} fill={PALETTE.white} opacity={0.5} />
          </g>
        </g>
      ))}
    </Art>
  );
}

function Circle({ touch }: { touch?: boolean }) {
  return (
    <Art bg={PALETTE.woodLight}>
      <Book y={6} />
      {/* the ball: found on either page, circled on both */}
      <Ring x={48} y={98} />
      <Ring x={160} y={98} />
      <Ring x={186} y={36} d="0.5s" />
      {touch ? (
        <Finger x={160} y={98} t="3s" />
      ) : (
        <>
          <Mouse x={182} y={116} s={0.7} click />
          <Key x={30} y={136} arrow="left" />
          <Key x={60} y={136} arrow="right" />
          <Key x={100} y={136} k="Enter" w={50} fs={13} press />
        </>
      )}
    </Art>
  );
}

function Score() {
  return (
    <Art bg={PALETTE.woodLight}>
      {[6, 90, 174].map((x) => (
        <rect key={x} x={x} y={10} width={80} height={130} rx={8} fill={PALETTE.cream} {...line} />
      ))}
      {/* a find scores */}
      <g transform="translate(46 0)">
        <circle cy={58} r={14} fill={PALETTE.coral} {...thin} />
        <circle cy={58} r={20} fill="none" stroke={PALETTE.honey} strokeWidth={4} />
        <Tick x={0} y={100} />
        <Star x={0} y={126} r={9} className="ta-pop" />
      </g>
      {/* a wrong tap holds you up */}
      <g transform="translate(130 0)">
        <Cross x={0} y={52} s={1.1} />
        <Stopwatch x={0} y={104} r={15} used={0.25} />
      </g>
      {/* all fifteen: a bonus, biggest for the first */}
      <g transform="translate(214 0)">
        <Burst x={0} y={66} r={30} fill={PALETTE.honey} spikes={12} className="ta-pulse" />
        <Star x={0} y={66} r={16} fill={PALETTE.white} />
        <path d="M-9 108h18v6a9 9 0 0 1 -18 0z" fill={PALETTE.honey} {...line} />
        <path d="M-2 120h4v5h-4zM-7 125h14v4h-14z" fill={PALETTE.brass} {...thin} />
      </g>
    </Art>
  );
}

function Four() {
  const scenes = [PALETTE.roomSky, PALETTE.sage, PALETTE.toyBlue, PALETTE.cardboard];
  return (
    <Art bg={PALETTE.woodLight}>
      {scenes.map((c, i) => (
        <g key={i} transform={`translate(${10 + i * 62} 30) rotate(${(i - 1.5) * 3})`}>
          <rect width={52} height={66} rx={3} fill={PALETTE.white} {...line} />
          <rect x={5} y={5} width={42} height={42} fill={c} />
          <circle cx={18} cy={20} r={6} fill={[PALETTE.honey, PALETTE.coral, PALETTE.white, PALETTE.toyBlue][i]} {...thin} />
          <rect x={26} y={28} width={16} height={14} rx={2} fill={[PALETTE.coral, PALETTE.honey, PALETTE.coral, PALETTE.sage][i]} {...thin} />
          <Stopwatch x={26} y={86} r={10} used={0.5} />
        </g>
      ))}
      <g transform="translate(130 128)">
        <path d="M-9 -12h18v6a9 9 0 0 1 -18 0z" fill={PALETTE.honey} {...line} />
        <path d="M-2 3h4v5h-4zM-7 8h14v4h-14z" fill={PALETTE.brass} {...thin} />
      </g>
    </Art>
  );
}

export const SPOTDIFF_ART = {
  'spotdiff-pages': () => <Pages />,
  'spotdiff-circle': () => <Circle />,
  'spotdiff-circle-touch': () => <Circle touch />,
  'spotdiff-score': () => <Score />,
  'spotdiff-four': () => <Four />,
};
