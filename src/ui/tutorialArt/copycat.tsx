/** Copycat Conductor: the cigar-box theatre, the bandleader and the four instruments. */
import { PALETTE } from '../../game/palette';
import { Arrow, Art, Cross, Finger, INK, Key, Note, Sparkle, Stopwatch, Toy, line, thin, vars } from './kit';

/** Drum, bell, xylophone, music box: the in-game colours and keys (copycat/Scene.tsx INSTRUMENTS). */
const INST = [
  { key: 'A', color: PALETTE.coral, x: 40 },
  { key: 'S', color: PALETTE.honey, x: 100 },
  { key: 'J', color: PALETTE.toyBlue, x: 160 },
  { key: 'K', color: PALETTE.sage, x: 220 },
] as const;
const BASE = 108;

function Drum() {
  return (
    <>
      <rect x={-15} y={-24} width={30} height={24} rx={3} fill={PALETTE.coral} {...line} />
      <path d="M-15 -20l7.5 14 7.5 -14 7.5 14 7.5 -14" fill="none" stroke={PALETTE.honey} strokeWidth={2.2} strokeLinejoin="round" />
      <ellipse cy={-24} rx={15} ry={5} fill={PALETTE.cream} {...line} />
      <path d="M-4 -26l-9 -12M5 -26l9 -11" stroke={PALETTE.woodLight} strokeWidth={3.5} strokeLinecap="round" />
    </>
  );
}
function Bell() {
  return (
    <>
      <rect x={-13} y={-4} width={26} height={4} rx={2} fill={PALETTE.woodMid} {...thin} />
      <path d="M-12 -6Q-13 -30 0 -31Q13 -30 12 -6z" fill={PALETTE.honey} {...line} />
      <rect x={-14} y={-8} width={28} height={4} rx={2} fill={PALETTE.brass} {...thin} />
      <circle cy={-34} r={3} fill={PALETTE.brass} {...thin} />
    </>
  );
}
function Xylophone() {
  return (
    <>
      <path d="M-18 -4L18 -10M-18 -2L18 -6" stroke={PALETTE.woodMid} strokeWidth={3} strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={-16 + i * 8.5} y={-26 + i * 3} width={7} height={24 - i * 4} rx={2} fill={i % 2 ? PALETTE.cream : PALETTE.toyBlue} {...thin} />
      ))}
    </>
  );
}
function MusicBox() {
  return (
    <>
      <rect x={-15} y={-20} width={30} height={20} rx={3} fill={PALETTE.sage} {...line} />
      <path d="M-15 -20L-11 -31H17L15 -20" fill={PALETTE.felt} {...line} />
      <rect x={-6} y={-13} width={12} height={6} rx={2} fill={PALETTE.cream} {...thin} />
      <path d="M15 -10h6v-7" fill="none" stroke={PALETTE.brass} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={21} cy={-18} r={2.5} fill={PALETTE.coral} {...thin} />
    </>
  );
}
const SHAPES = [Drum, Bell, Xylophone, MusicBox];

/** Curtains, stage boards and footlights. */
function Theatre({ children }: { children: React.ReactNode }) {
  return (
    <Art bg={PALETTE.inkPurple}>
      <rect y={92} width={260} height={58} fill={PALETTE.woodMid} />
      <rect y={92} width={260} height={4} fill={PALETTE.woodDark} />
      {[0, 242].map((x) => (
        <g key={x}>
          <rect x={x} width={18} height={150} fill={PALETTE.coral} />
          <path d={`M${x + 6} 0v150M${x + 12} 0v150`} stroke={INK} strokeWidth={1.4} opacity={0.35} />
        </g>
      ))}
      <path d="M0 0h260v12q-16 8 -32 0t-32 0t-32 0t-32 0t-32 0t-32 0t-32 0t-36 0z" fill={PALETTE.coral} {...thin} />
      {children}
    </Art>
  );
}

/** The bandleader: a honey toy with a baton, on a wooden podium. */
function Conductor({ x }: { x: number }) {
  return (
    <>
      <rect x={x - 16} y={74} width={32} height={20} rx={3} fill={PALETTE.woodLight} {...line} />
      <Toy x={x} y={76} s={0.64} paint={{ body: PALETTE.honey, trim: PALETTE.inkPurple, accent: PALETTE.coral }} hold={<path d="M0 0L14 -16" stroke={PALETTE.white} strokeWidth={3} strokeLinecap="round" />} className="ta-bob" />
    </>
  );
}

/** The four instruments; `lit` lists [instrument, delay] pairs that light in turn over a 3 s cycle. */
function Instruments({ lit, keys = false, pads = false }: { lit: [number, string][]; keys?: boolean; pads?: boolean }) {
  return (
    <>
      {INST.map((ins, i) => {
        const Shape = SHAPES[i];
        const on = lit.find((l) => l[0] === i);
        return (
          <g key={ins.key} transform={`translate(${ins.x} ${BASE})`}>
            {on && (
              <g className={`ta-seq${on[1] === '0s' ? ' ta-seq--first' : ''}`} style={vars({ d: on[1], t: '3s' })}>
                <circle cy={-16} r={24} fill={ins.color} opacity={0.55} />
                <circle cy={-16} r={24} fill="none" stroke={PALETTE.white} strokeWidth={2} opacity={0.8} />
              </g>
            )}
            <Shape />
          </g>
        );
      })}
      {keys &&
        INST.map((ins) => {
          const on = lit.find((l) => INST[l[0]] === ins);
          return <Key key={ins.key} x={ins.x} y={128} k={ins.key} press={!!on} delay={on?.[1]} />;
        })}
      {pads &&
        INST.map((ins) => {
          const on = lit.find((l) => INST[l[0]] === ins);
          return (
            <g key={ins.key} transform={`translate(${ins.x} 130)`}>
              <rect x={-24} y={-11} width={48} height={24} rx={9} fill={INK} />
              <g className={on ? 'ta-press' : undefined} style={on ? vars({ d: on[1], t: '3s' }) : undefined}>
                <rect x={-24} y={-14} width={48} height={24} rx={9} fill={ins.color} stroke={INK} strokeWidth={2.2} />
                <rect x={-18} y={-11} width={20} height={6} rx={3} fill={PALETTE.white} opacity={0.4} />
              </g>
            </g>
          );
        })}
    </>
  );
}

/** A paper ticket showing a tune as coloured dots (instrument indices). */
function Tune({ x, y, notes, grow = false }: { x: number; y: number; notes: number[]; grow?: boolean }) {
  const w = notes.length * 16 + 10;
  return (
    <g transform={`translate(${x - w / 2} ${y})`}>
      <rect x={0} y={-11} width={w} height={22} rx={5} fill={PALETTE.white} {...line} />
      {notes.map((n, i) => {
        const last = grow && i === notes.length - 1;
        return (
          <g key={i} transform={`translate(${13 + i * 16} 0)`}>
            <g className={last ? 'ta-pulse' : undefined}>
              <circle r={last ? 6.5 : 5.5} fill={INST[n].color} {...thin} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

const TUNE = [0, 2, 1];
const LIT: [number, string][] = [
  [0, '0s'],
  [2, '1s'],
  [1, '2s'],
];

function Watch() {
  return (
    <Theatre>
      <Tune x={130} y={25} notes={TUNE} />
      <Conductor x={130} />
      <Instruments lit={LIT} />
      <Note x={30} y={60} s={1.1} fill={PALETTE.cream} className="ta-bob" />
      <Note x={172} y={58} fill={PALETTE.cream} className="ta-bob" style={vars({ d: '-0.6s' })} />
      <Note x={92} y={50} s={0.9} fill={PALETTE.cream} className="ta-bob" style={vars({ d: '-0.3s' })} />
    </Theatre>
  );
}

function Play({ touch }: { touch?: boolean }) {
  return (
    <Theatre>
      <Tune x={130} y={28} notes={TUNE} />
      <Arrow x1={130} y1={44} x2={130} y2={60} w={4} head={10} />
      <Instruments lit={LIT} keys={!touch} pads={touch} />
      {touch && <Finger x={INST[0].x + 4} y={128} t="3s" />}
    </Theatre>
  );
}

function Grow() {
  return (
    <Theatre>
      <Tune x={70} y={36} notes={TUNE} />
      <Arrow x1={70} y1={52} x2={70} y2={72} w={4} head={10} />
      <Tune x={70} y={88} notes={[...TUNE, 3]} grow />
      <Sparkle x={104} y={74} r={8} className="ta-pulse" />
      {/* faster: double chevrons */}
      <path d="M118 82l7 6 -7 6M127 82l7 6 -7 6" fill="none" stroke={PALETTE.honey} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
      {/* knocked out by a wrong note or the clock */}
      <Toy x={196} y={126} s={0.8} out tilt={-80} />
      <Note x={176} y={58} s={1.3} fill={PALETTE.coral} />
      <Cross x={190} y={46} s={0.85} />
      <Stopwatch x={222} y={56} r={11} used={0.97} />
      <Cross x={234} y={44} s={0.7} />
    </Theatre>
  );
}

export const COPYCAT_ART = {
  'copycat-watch': () => <Watch />,
  'copycat-play': () => <Play />,
  'copycat-play-touch': () => <Play touch />,
  'copycat-grow': () => <Grow />,
};
