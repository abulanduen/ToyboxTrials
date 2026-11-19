/** Wind-Up Dash: a felt road across the table, its dealt traps and the chequered finish. */
import { PALETTE, ROOM } from '../../game/palette';
import { Arrow, Art, INK, Key, MoveKeys, SpeedLines, Stick, TapBtn, Toy, line, thin, vars } from './kit';

/** A strip of felt road with wooden kerbs, top edge at y. */
function Road({ x = 0, y, w = 260, h = 24 }: { x?: number; y: number; w?: number; h?: number }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={PALETTE.inkPurple} />
      <rect x={x} y={y - 3} width={w} height={4} fill={PALETTE.woodLight} {...thin} />
      <rect x={x} y={y + h - 1} width={w} height={4} fill={PALETTE.woodLight} {...thin} />
    </>
  );
}

function Finish({ x, y, h = 24 }: { x: number; y: number; h?: number }) {
  const n = Math.round(h / 6);
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: n * 2 }, (_, i) => (
        <rect key={i} x={(i % 2) * 6} y={Math.floor(i / 2) * 6} width={6} height={6} fill={(i + Math.floor(i / 2)) % 2 ? INK : PALETTE.white} />
      ))}
      <path d={`M14 ${h}V-34`} stroke={PALETTE.woodDark} strokeWidth={3} strokeLinecap="round" />
      <path d="M15 -34h22l-5 7 5 7H15z" fill={PALETTE.coral} {...thin} />
    </g>
  );
}

function Domino({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-6} y={-14} width={12} height={14} rx={2} fill={PALETTE.white} {...line} />
      <path d="M-6 -7h12" {...thin} />
      <circle cy={-10.5} r={1.4} fill={INK} />
      <circle cx={-2} cy={-3.5} r={1.4} fill={INK} />
      <circle cx={2} cy={-3.5} r={1.4} fill={INK} />
    </g>
  );
}

function Chevrons({ x, y, n = 3 }: { x: number; y: number; n?: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={PALETTE.honey} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${i * 11} -6l6 6 -6 6`} />
      ))}
    </g>
  );
}

function Room() {
  return (
    <>
      <rect width={260} height={96} fill={ROOM.wallUpper} />
      <rect y={96} width={260} height={54} fill={PALETTE.woodLight} />
    </>
  );
}

function Sprint({ touch }: { touch?: boolean }) {
  return (
    <Art>
      <Room />
      <Road y={106} />
      <Finish x={224} y={106} />
      <Domino x={128} y={126} />
      <path d="M100 100q28 -46 58 0" fill="none" stroke={PALETTE.white} strokeWidth={2.5} strokeDasharray="4 5" strokeLinecap="round" />
      <SpeedLines x={60} y={126} s={0.8} />
      <Toy x={100} y={126} s={0.8} className="ta-hop" style={vars({ dx: 58, dy: -34, t: '2.2s' })} />
      {touch ? (
        <>
          <Stick x={36} y={48} r={22} kx={0.75} arrow />
          <TapBtn x={150} y={46} r={20} label="Jump" press />
        </>
      ) : (
        <>
          <MoveKeys x={44} y={42} s={0.85} lit={['D']} />
          <Key x={142} y={54} k="Space" w={70} press />
        </>
      )}
    </Art>
  );
}

function Deal() {
  return (
    <Art>
      <Room />
      {/* one dealt course: floor arrows, a ramp, a ruler bridge and a low domino to hop */}
      <Road y={38} />
      <Chevrons x={14} y={50} />
      <path d="M58 61L96 40V61z" fill={PALETTE.woodMid} {...line} />
      <rect x={96} y={36} width={56} height={7} fill={PALETTE.honey} {...thin} />
      {[104, 112, 120, 128, 136, 144].map((x) => (
        <path key={x} d={`M${x} 36v3.5`} {...thin} />
      ))}
      <Domino x={190} y={58} />
      <path d="M160 46q30 -40 56 0" fill="none" stroke={PALETTE.white} strokeWidth={2.5} strokeDasharray="4 5" strokeLinecap="round" />
      <Toy x={170} y={56} s={0.55} className="ta-hop" style={vars({ dx: 40, dy: -26, t: '2.2s' })} />
      {/* the next race deals a different road */}
      <Road y={108} />
      <circle cx={46} cy={124} r={6} fill={PALETTE.coral} {...line} />
      <circle cx={70} cy={126} r={5} fill={PALETTE.toyBlue} {...line} />
      <rect x={110} y={102} width={32} height={10} rx={2} fill={PALETTE.toyBlue} {...line} />
      <rect x={114} y={94} width={26} height={9} rx={2} fill={PALETTE.coral} {...line} />
      <Chevrons x={164} y={120} n={2} />
      <Finish x={212} y={108} />
      {/* shuffle: re-dealt */}
      <Arrow x1={10} y1={80} x2={40} y2={80} bend={-9} w={3.5} head={9} />
      <Arrow x1={40} y1={92} x2={10} y2={92} bend={-9} w={3.5} head={9} />
    </Art>
  );
}

function Moves() {
  return (
    <Art>
      <Room />
      <Road y={106} />
      <Finish x={228} y={106} />
      {/* gantry and swinging pendulum */}
      <rect x={110} y={20} width={6} height={88} fill={PALETTE.woodMid} {...thin} />
      <rect x={186} y={20} width={6} height={88} fill={PALETTE.woodMid} {...thin} />
      <rect x={104} y={14} width={94} height={9} rx={2} fill={PALETTE.woodDark} {...line} />
      <g transform="translate(151 22)">
        <g className="ta-swing" style={vars({ r: '30deg', t: '1.3s' })}>
          <rect x={-2} y={0} width={4} height={70} fill={PALETTE.brass} {...thin} />
          <circle cy={80} r={14} fill={PALETTE.coral} {...line} />
          <circle cx={-4} cy={75} r={4} fill={PALETTE.white} opacity={0.5} />
        </g>
      </g>
      <circle cx={151} cy={22} r={3.5} fill={PALETTE.brass} {...thin} />
      {/* wait for the gap... */}
      <Toy x={62} y={126} s={0.8} className="ta-bob" />
      <Arrow x1={82} y1={96} x2={210} y2={96} w={4} dashed color={PALETTE.white} />
      {/* ...on the beat */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${40 + i * 18} 30)`}>
          <g className={`ta-seq${i === 0 ? ' ta-seq--first' : ''}`} style={vars({ d: `${i * 0.43}s`, t: '1.3s' })}>
            <circle r={6} fill={PALETTE.honey} {...thin} />
          </g>
        </g>
      ))}
    </Art>
  );
}

export const WINDDASH_ART = {
  'winddash-sprint': () => <Sprint />,
  'winddash-sprint-touch': () => <Sprint touch />,
  'winddash-deal': () => <Deal />,
  'winddash-moves': () => <Moves />,
};
