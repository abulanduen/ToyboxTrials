/** Music Box Rhythm: coloured pins ride the turning cylinder down to the bright strike line. */
import { PALETTE } from '../../game/palette';
import { Arrow, Art, Burst, Cross, Finger, INK, Key, Sparkle, Tick, line, thin, vars } from './kit';

/** The four lanes: the instrument colours and keys (rhythm/lanes.ts). */
const LANES = [
  { key: 'A', color: PALETTE.coral },
  { key: 'S', color: PALETTE.honey },
  { key: 'J', color: PALETTE.toyBlue },
  { key: 'K', color: PALETTE.sage },
] as const;
const TOP = 8;
const LINE = 90;
/** x of lane edge e (0…4) at depth t (0 = far top, 1 = strike line). */
const edge = (e: number, t: number) => {
  const l = 104 + (40 - 104) * t;
  const r = 156 + (220 - 156) * t;
  return l + ((r - l) * e) / 4;
};
const centre = (lane: number, t: number) => (edge(lane, t) + edge(lane + 1, t)) / 2;

function Cylinder() {
  return (
    <>
      <path d={`M${edge(0, 0)} ${TOP}H${edge(4, 0)}L${edge(4, 1.12)} ${LINE + 10}H${edge(0, 1.12)}z`} fill={PALETTE.brass} {...line} />
      {[1, 2, 3].map((e) => (
        <path key={e} d={`M${edge(e, 0)} ${TOP}L${edge(e, 1.12)} ${LINE + 10}`} stroke={INK} strokeWidth={1.4} opacity={0.4} />
      ))}
      {/* the bright strike line */}
      <rect x={edge(0, 1) - 6} y={LINE - 4} width={edge(4, 1) - edge(0, 1) + 12} height={8} rx={4} fill={PALETTE.white} opacity={0.5} className="ta-glow" />
      <rect x={edge(0, 1) - 4} y={LINE - 2} width={edge(4, 1) - edge(0, 1) + 8} height={4} rx={2} fill={PALETTE.white} {...thin} />
      {/* the steel comb */}
      {LANES.map((l, i) => (
        <g key={l.key}>
          <rect x={centre(i, 1) - 6} y={LINE + 8} width={12} height={14} rx={2} fill={PALETTE.cream} {...thin} />
          <rect x={centre(i, 1) - 6} y={LINE + 8} width={12} height={5} rx={2} fill={l.color} {...thin} />
        </g>
      ))}
    </>
  );
}

/** A pin travelling down lane `lane`, starting at depth `t0`, on a `t` cycle. */
function Pin({ lane, t0 = 0, d = '0s', t = '2.4s', still }: { lane: number; t0?: number; d?: string; t?: string; still?: number }) {
  const at = still ?? t0;
  const x = centre(lane, at);
  const y = TOP + (LINE - TOP) * at;
  const r = 4 + 3.5 * at;
  const dot = <circle r={r + 1.5} fill={LANES[lane].color} {...line} />;
  if (still !== undefined) return <g transform={`translate(${x} ${y})`}>{dot}</g>;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ta-slide" style={vars({ dx: centre(lane, 1) - x, dy: LINE - y, t, d })}>
        {dot}
      </g>
    </g>
  );
}

function Pins() {
  return (
    <Art bg={PALETTE.woodDark}>
      <Cylinder />
      <Pin lane={0} d="0s" />
      <Pin lane={2} d="-0.8s" />
      <Pin lane={1} d="-1.6s" />
      <Pin lane={3} d="-2s" />
      {/* still frame: pins on their way down */}
      <Pin lane={1} still={0.35} />
      <Pin lane={3} still={0.7} />
      <Arrow x1={232} y1={22} x2={232} y2={84} w={4} color={PALETTE.white} />
    </Art>
  );
}

function Play({ touch }: { touch?: boolean }) {
  return (
    <Art bg={PALETTE.woodDark}>
      <Cylinder />
      <Pin lane={0} still={0.3} />
      <Pin lane={3} still={0.55} />
      <Pin lane={2} still={1} />
      <Burst x={centre(2, 1)} y={LINE} r={17} fill={PALETTE.white} className="ta-pulse" style={vars({ t: '0.8s' })} />
      <Pin lane={2} still={1} />
      <Sparkle x={centre(2, 1) + 22} y={LINE - 18} r={7} fill={PALETTE.honey} className="ta-pulse" />
      {touch
        ? LANES.map((l, i) => (
            <g key={l.key} transform={`translate(${32 + i * 65} 140)`}>
              <rect x={-28} y={-11} width={56} height={20} rx={8} fill={INK} />
              <g className={i === 2 ? 'ta-press' : undefined} style={vars({ t: '0.8s' })}>
                <rect x={-28} y={-14} width={56} height={20} rx={8} fill={l.color} stroke={INK} strokeWidth={2.2} />
              </g>
            </g>
          ))
        : LANES.map((l, i) => <Key key={l.key} x={centre(i, 1)} y={132} k={l.key} lit={i === 2} />)}
      {touch && (
        <>
          <Finger x={162} y={134} t="0.8s" />
          <Finger x={34} y={134} anim="none" flip />
        </>
      )}
    </Art>
  );
}

/** The combo meter: four steps, `n` lit. */
function Meter({ x, y, n, broken = false }: { x: number; y: number; n: number; broken?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${i * 20} ${-i * 6})`}>
          <g className={!broken && i === n - 1 ? 'ta-pulse' : undefined}>
            <path d="M-8 6L0 -6L8 6z" fill={i < n ? PALETTE.honey : PALETTE.tinGrey} {...line} transform={`scale(${1 + i * 0.18})`} />
          </g>
        </g>
      ))}
      {broken && <path d="M-6 -16l12 10 -6 4 14 10" fill="none" stroke={PALETTE.coral} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
}

function Combo() {
  return (
    <Art bg={PALETTE.woodDark}>
      <rect x={8} y={8} width={118} height={134} rx={8} fill={PALETTE.inkPurple} {...line} />
      <rect x={134} y={8} width={118} height={134} rx={8} fill={PALETTE.inkPurple} {...line} />
      {/* hits on the line build the combo */}
      <rect x={18} y={96} width={98} height={5} rx={2.5} fill={PALETTE.white} {...thin} />
      {[0, 2, 1].map((lane, i) => (
        <g key={i} transform={`translate(${34 + i * 32} 98)`}>
          <circle r={7} fill={LANES[lane].color} {...line} />
          <Tick x={0} y={26} s={0.65} />
        </g>
      ))}
      <Meter x={36} y={50} n={4} />
      {/* a miss breaks it */}
      <rect x={144} y={96} width={98} height={5} rx={2.5} fill={PALETTE.white} {...thin} />
      <circle cx={192} cy={122} r={7} fill={LANES[3].color} {...line} opacity={0.75} />
      <Cross x={216} y={122} s={0.7} />
      <Meter x={162} y={50} n={0} broken />
    </Art>
  );
}

export const RHYTHM_ART = {
  'rhythm-pins': () => <Pins />,
  'rhythm-play': () => <Play />,
  'rhythm-play-touch': () => <Play touch />,
  'rhythm-combo': () => <Combo />,
};
