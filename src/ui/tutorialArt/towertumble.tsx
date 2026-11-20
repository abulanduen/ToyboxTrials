/** Toy Tower Tumble: an 8×8 felt board, a zig-zag path, random towers that merge up the tiers. */
import { PALETTE, RARITY } from '../../game/palette';
import { Arrow, Art, Burst, Cross, Finger, INK, Key, PillBtn, Sparkle, Star, line, thin, vars } from './kit';

/** Tier colours, as in the game (towertumble/catalogue.ts TIER_COLOURS). */
const TIER = [RARITY.common, RARITY.uncommon, RARITY.rare, RARITY.epic, RARITY.legendary, PALETTE.coral, PALETTE.white];

/** The path squares, row by row (towertumble/board.ts): enemies zig-zag from the box to the chest. */
const PATH = new Set<number>([
  ...[0, 1, 2, 3, 4, 5, 6].map((c) => 8 + c),
  2 * 8 + 6,
  ...[1, 2, 3, 4, 5, 6].map((c) => 3 * 8 + c),
  4 * 8 + 1,
  ...[1, 2, 3, 4, 5, 6].map((c) => 5 * 8 + c),
  6 * 8 + 6,
  7 * 8 + 6,
]);

function Coin({ x, y, r = 6 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill={PALETTE.honey} {...thin} />
      <circle r={r * 0.55} fill="none" stroke={PALETTE.brass} strokeWidth={1.6} />
    </g>
  );
}

/** A chunky toy tower in its tier colour, standing at (x, y); `pips` shows the tier. */
export function Tower({ x, y, tier = 1, s = 1, className, style }: { x: number; y: number; tier?: number; s?: number; className?: string; style?: React.CSSProperties }) {
  const c = TIER[tier - 1];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={className} style={style}>
        <ellipse cy={-1} rx={11} ry={4} fill={PALETTE.woodDark} {...thin} />
        <rect x={-8} y={-22} width={16} height={21} rx={2} fill={c} {...line} />
        <path d="M-10 -22v-6h4v3h4v-3h4v3h4v-3h4v6z" fill={c} {...line} />
        <rect x={-2.5} y={-15} width={5} height={7} rx={2.5} fill={INK} />
        <path d="M0 -28v-9" stroke={PALETTE.woodDark} strokeWidth={2} />
        <path d="M0 -37h8l-3 3 3 3H0z" fill={PALETTE.coral} {...thin} />
        {Array.from({ length: tier }, (_, i) => (
          <circle key={i} cx={(i - (tier - 1) / 2) * 5} cy={-4.5} r={1.8} fill={PALETTE.honey} stroke={INK} strokeWidth={0.8} />
        ))}
      </g>
    </g>
  );
}

/** A clockwork mouse walking (facing right), feet at (x, y). */
function Mouse({ x, y, s = 1, face = 1, className, style }: { x: number; y: number; s?: number; face?: 1 | -1; className?: string; style?: React.CSSProperties }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        <g transform={`scale(${face * s} ${s})`}>
          <path d="M-9 -4q-6 -2 -6 -8" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
          <path d="M-9 0q0 -11 9 -11q9 0 12 9l-2 2z" fill={PALETTE.tinGrey} {...thin} />
          <circle cx={1} cy={-11} r={3.4} fill={PALETTE.cream} {...thin} />
          <circle cx={8} cy={-6} r={1.2} fill={INK} />
          <circle cx={12} cy={-2.5} r={1.4} fill={PALETTE.coral} />
          <ellipse cx={-4} cy={-13} rx={2} ry={3} fill={PALETTE.brass} {...thin} />
        </g>
      </g>
    </g>
  );
}

const C = 13;
/** The 8×8 board at (x, y): felt squares and the wooden path, with the toy box and chest. */
function Board({ x, y, pick }: { x: number; y: number; pick?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-4} y={-4} width={8 * C + 8} height={8 * C + 8} rx={4} fill={PALETTE.woodDark} {...line} />
      {Array.from({ length: 64 }, (_, i) => {
        const c = i % 8;
        const r = Math.floor(i / 8);
        const fill = PATH.has(i) ? PALETTE.woodLight : (c + r) % 2 ? PALETTE.felt : PALETTE.feltDark;
        return <rect key={i} x={c * C} y={r * C} width={C} height={C} fill={fill} />;
      })}
      {pick !== undefined && (
        <g transform={`translate(${(pick % 8) * C + C / 2} ${Math.floor(pick / 8) * C + C / 2})`}>
          <g className="ta-pulse">
            <rect x={-C / 2 - 1} y={-C / 2 - 1} width={C + 2} height={C + 2} rx={2} fill="none" stroke={PALETTE.white} strokeWidth={2.5} />
          </g>
        </g>
      )}
      {/* toy box in, toy chest out */}
      <rect x={-14} y={C - 2} width={12} height={C + 4} rx={2} fill={PALETTE.coral} {...thin} />
      <rect x={6 * C - 1} y={8 * C + 2} width={C + 2} height={9} rx={2} fill={PALETTE.toyBlue} {...thin} />
    </g>
  );
}

function Build({ touch }: { touch?: boolean }) {
  const bx = 22;
  const by = 18;
  const pick = 2 * 8 + 3;
  return (
    <Art bg={PALETTE.woodMid}>
      <Board x={bx} y={by} pick={pick} />
      {[0, 3, 6].map((c, i) => (
        <Mouse key={c} x={bx + c * C + 6} y={by + 2 * C - 2} s={0.55} className="ta-run" style={vars({ dx: 30, t: '2.4s', d: `${-i * 0.8}s` })} />
      ))}
      <Tower x={bx + 3 * C + C / 2} y={by + 3 * C - 1} tier={1} s={0.62} className="ta-pop" style={vars({ t: '2.4s' })} />
      <Tower x={bx + 5 * C + C / 2} y={by + 5 * C - 1 - C} tier={2} s={0.62} />
      <Tower x={bx + 2 * C + C / 2} y={by + 7 * C - 1} tier={1} s={0.62} />
      <g transform="translate(150 0)">
        <rect x={6} y={18} width={96} height={112} rx={10} fill={PALETTE.cream} {...line} />
        {/* a random tower: one of these, by luck */}
        <Tower x={30} y={66} tier={1} s={0.8} />
        <Tower x={54} y={66} tier={2} s={0.8} />
        <Tower x={78} y={66} tier={3} s={0.8} />
        <path d="M18 74h72" stroke={INK} strokeWidth={1.4} opacity={0.4} />
        {touch ? (
          <>
            <PillBtn x={54} y={104} w={78} h={26} label="Build here" fs={11} press />
            <Finger x={-82} y={52} anim="tap" />
          </>
        ) : (
          <>
            <Key x={34} y={104} k="B" press />
            <Coin x={64} y={104} r={7} />
            <Coin x={78} y={100} r={7} />
          </>
        )}
      </g>
    </Art>
  );
}

function Merge({ touch }: { touch?: boolean }) {
  return (
    <Art bg={PALETTE.feltDark}>
      {[44, 104].map((x, i) => (
        <g key={x}>
          <rect x={x - 24} y={50} width={48} height={48} rx={4} fill={i ? PALETTE.felt : PALETTE.feltDark} stroke={INK} strokeWidth={1.4} />
          <g transform={`translate(${x} 92)`}>
            <g className="ta-pulse">
              <ellipse rx={20} ry={7} fill="none" stroke={PALETTE.honey} strokeWidth={3} />
            </g>
          </g>
          <Tower x={x} y={90} tier={2} s={1.3} className={i === 0 ? 'ta-merge' : undefined} style={i === 0 ? vars({ dx: 60, dy: 0, t: '2.6s' }) : undefined} />
        </g>
      ))}
      <Arrow x1={58} y1={34} x2={98} y2={34} bend={-10} w={4} />
      {touch && <Finger x={48} y={70} anim="none" />}
      <Arrow x1={136} y1={76} x2={166} y2={76} w={5} />
      {/* Touch: taps only select the pair; the sheet's Merge button (two squares into one) merges. */}
      {touch && (
        <g>
          <rect x={126} y={88} width={50} height={28} rx={8} fill={PALETTE.honey} {...line} />
          <rect x={134} y={97} width={9} height={9} rx={2} fill={TIER[1]} {...thin} />
          <rect x={146} y={97} width={9} height={9} rx={2} fill={TIER[1]} {...thin} />
          <path d="M157 101.5h6m-3-3 3 3-3 3" fill="none" stroke={INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <rect x={164} y={96} width={7} height={11} rx={2} fill={TIER[2]} {...thin} />
          <Finger x={152} y={110} delay="1.2s" />
        </g>
      )}
      <g transform="translate(212 0)">
        <rect x={-30} y={34} width={60} height={70} rx={6} fill={PALETTE.felt} {...line} />
        <Burst x={0} y={70} r={26} fill={TIER[2]} className="ta-pulse" />
        <g className="ta-pop" style={vars({ t: '2.6s', d: '0.5s' })}>
          <Tower x={0} y={98} tier={3} s={1.5} />
        </g>
        <Sparkle x={-22} y={44} r={6} className="ta-pulse" />
        <Sparkle x={24} y={52} r={5} className="ta-pulse" style={vars({ d: '-0.5s' })} />
      </g>
      {/* up to tier 7 */}
      {TIER.map((c, i) => (
        <rect key={i} x={70 + i * 18} y={124} width={14} height={14} rx={3} fill={c} {...thin} />
      ))}
      <Star x={206} y={131} r={8} />
    </Art>
  );
}

function Odds() {
  return (
    <Art bg={PALETTE.woodMid}>
      {[6, 90, 174].map((x) => (
        <rect key={x} x={x} y={10} width={80} height={130} rx={8} fill={PALETTE.cream} {...line} />
      ))}
      {/* builder level: better odds */}
      <g transform="translate(46 0)">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={-26 + i * 18} y={98 - (i + 1) * 20} width={14} height={(i + 1) * 20} rx={2} fill={TIER[i]} {...thin} />
        ))}
        <Arrow x1={-22} y1={44} x2={18} y2={22} w={4} head={10} />
        <Tower x={0} y={128} tier={2} s={0.9} />
      </g>
      {/* quick quest: gold */}
      <g transform="translate(130 0)">
        <rect x={-22} y={24} width={44} height={56} rx={4} fill={PALETTE.white} {...line} />
        <path d="M-14 38h28M-14 50h22M-14 62h26" stroke={INK} strokeWidth={2} opacity={0.35} strokeLinecap="round" />
        <path d="M-12 72l4 4 8 -9" fill="none" stroke={PALETTE.sage} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <g className="ta-bob">
          <Coin x={-12} y={104} r={9} />
          <Coin x={8} y={110} r={9} />
          <Coin x={-2} y={124} r={9} />
        </g>
      </g>
      {/* boss waves drop a free high tower */}
      <g transform="translate(214 0)">
        <Mouse x={2} y={66} s={2.2} />
        <Cross x={22} y={30} s={0.7} />
        <Arrow x1={0} y1={74} x2={0} y2={92} w={3.5} head={9} />
        <Tower x={0} y={132} tier={5} s={1} className="ta-pop" style={vars({ t: '2.4s' })} />
      </g>
    </Art>
  );
}

function Heart({ x, y, on = true, className }: { x: number; y: number; on?: boolean; className?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className}>
        <path d="M0 6l-7 -7a4.5 4.5 0 0 1 7 -5a4.5 4.5 0 0 1 7 5z" fill={on ? PALETTE.coral : PALETTE.tinGrey} {...thin} />
      </g>
    </g>
  );
}

function Hold() {
  return (
    <Art bg={PALETTE.woodMid}>
      {/* the end of the path and the toy chest */}
      <rect x={10} y={84} width={150} height={24} fill={PALETTE.woodLight} {...line} />
      <path d="M14 96h142" stroke={PALETTE.cream} strokeWidth={1.6} strokeDasharray="5 4" />
      <Tower x={60} y={80} tier={3} s={1} />
      <Mouse x={30} y={100} s={1} className="ta-run" style={vars({ dx: 120, t: '2.6s' })} />
      <g transform="translate(184 116)">
        <rect x={-22} y={-30} width={44} height={30} rx={4} fill={PALETTE.toyBlue} {...line} />
        <path d="M-22 -30q22 -16 44 0" fill={PALETTE.toyBlue} {...line} />
        <rect x={-4} y={-22} width={8} height={9} rx={2} fill={PALETTE.brass} {...thin} />
      </g>
      {/* leaks cost lives */}
      <Heart x={170} y={30} />
      <Heart x={190} y={30} />
      <Heart x={210} y={30} on={false} className="ta-blink" />
      <Arrow x1={190} y1={72} x2={196} y2={46} w={3} head={8} color={PALETTE.coral} />
      {/* twenty waves, then the trophy */}
      {Array.from({ length: 20 }, (_, i) => (
        <circle key={i} cx={16 + i * 10.5} cy={134} r={4} fill={i < 12 ? PALETTE.honey : PALETTE.cream} stroke={INK} strokeWidth={1.2} />
      ))}
      <g transform="translate(240 132)">
        <path d="M-9 -12h18v6a9 9 0 0 1 -18 0z" fill={PALETTE.honey} {...line} />
        <path d="M-2 3h4v5h-4zM-7 8h14v4h-14z" fill={PALETTE.brass} {...thin} />
      </g>
    </Art>
  );
}

export const TOWERTUMBLE_ART = {
  'towertumble-build': () => <Build />,
  'towertumble-build-touch': () => <Build touch />,
  'towertumble-merge': () => <Merge />,
  'towertumble-merge-touch': () => <Merge touch />,
  'towertumble-odds': () => <Odds />,
  'towertumble-hold': () => <Hold />,
};
