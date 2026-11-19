/** Jack-in-the-Box: toys in a ring on a biscuit-tin lid, passing the wind-up box. */
import { PALETTE } from '../../game/palette';
import { Arrow, Art, Burst, Finger, INK, Key, PillBtn, RIVALS, Sparkle, Toy, line, thin, vars } from './kit';

/** The painted box: purple, a cream panel, a brass crank with a coral handle. */
function Box({ x, y, s = 1, open = false, spin = false }: { x: number; y: number; s?: number; open?: boolean; spin?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cy={1} rx={22} ry={5} fill={PALETTE.brass} {...thin} />
      <path d="M-16 -30L-6 -36H22L12 -30z" fill={PALETTE.inkPurple} {...line} />
      <path d="M12 -30L22 -36V-6L12 0z" fill={PALETTE.inkPurple} {...line} />
      <rect x={-16} y={-30} width={28} height={30} rx={2} fill={PALETTE.inkPurple} {...line} />
      <rect x={-10} y={-24} width={16} height={18} rx={3} fill={PALETTE.cream} {...thin} />
      <circle cx={-2} cy={-15} r={4} fill={PALETTE.coral} {...thin} />
      {/* crank */}
      <g transform="translate(19 -18)">
        <g className={spin ? 'ta-spin' : undefined} style={vars({ t: '1s' })}>
          <path d="M0 0L8 -8" stroke={PALETTE.brass} strokeWidth={3.5} strokeLinecap="round" />
          <circle cx={8} cy={-8} r={3.4} fill={PALETTE.coral} {...thin} />
          <circle r={2.6} fill={PALETTE.brass} {...thin} />
        </g>
      </g>
      {open && <path d="M-16 -30L-24 -48L4 -52L12 -30" fill={PALETTE.coral} {...line} />}
    </g>
  );
}

/** The jack on its spring, springing up from (x, y). */
function Jack({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ta-pop" style={vars({ t: '2.4s' })}>
        <path d="M0 0l-8 -6 16 -6 -16 -6 16 -6 -16 -6 8 -4" fill="none" stroke={PALETTE.tinGrey} strokeWidth={3} strokeLinejoin="round" />
        <path d="M0 0l-8 -6 16 -6 -16 -6 16 -6 -16 -6 8 -4" fill="none" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
        <circle cy={-46} r={13} fill={PALETTE.cream} {...line} />
        <path d="M-12 -52L0 -76L12 -52z" fill={PALETTE.coral} {...line} />
        <circle cy={-77} r={4} fill={PALETTE.honey} {...thin} />
        <circle cx={-5} cy={-48} r={2} fill={INK} />
        <circle cx={5} cy={-48} r={2} fill={INK} />
        <path d="M-6 -41q6 6 12 0" fill="none" {...thin} />
        <circle cx={-9} cy={-43} r={2.4} fill={PALETTE.coral} opacity={0.6} />
        <circle cx={9} cy={-43} r={2.4} fill={PALETTE.coral} opacity={0.6} />
        <rect x={-12} y={-34} width={24} height={6} rx={3} fill={PALETTE.honey} {...thin} />
      </g>
    </g>
  );
}

function Lid() {
  return (
    <>
      <ellipse cx={130} cy={110} rx={126} ry={40} fill={PALETTE.toyBlue} {...line} />
      <ellipse cx={130} cy={106} rx={116} ry={33} fill={PALETTE.inkPurple} {...thin} />
      <ellipse cx={130} cy={106} rx={104} ry={27} fill="none" stroke={PALETTE.honey} strokeWidth={2} opacity={0.7} />
    </>
  );
}

/** A fruit picture card with tape: the round's category, drawn rather than written. */
function CategoryCard({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-4)`}>
      <rect x={-26} y={-20} width={52} height={40} rx={4} fill={PALETTE.white} {...line} />
      <rect x={-12} y={-25} width={24} height={9} fill={PALETTE.cream} opacity={0.9} stroke={INK} strokeWidth={1} />
      <circle cx={-8} cy={3} r={10} fill={PALETTE.coral} {...thin} />
      <path d="M-8 -6q1 -5 4 -7" fill="none" {...thin} />
      <path d="M-6 -9q6 -6 10 -2q-5 5 -10 2z" fill={PALETTE.sage} {...thin} />
      <path d="M6 10q6 -2 11 -14q2 6 -3 12q-4 5 -8 2z" fill={PALETTE.honey} {...thin} />
    </g>
  );
}

const WHO = [RIVALS[0], RIVALS[1], RIVALS[2], RIVALS[3]];

function Category() {
  return (
    <Art bg={PALETTE.woodLight}>
      <Lid />
      <Toy x={70} y={92} s={0.6} paint={WHO[0]} />
      <Toy x={130} y={86} s={0.6} paint={WHO[1]} face={-1} />
      <Toy x={190} y={92} s={0.6} paint={WHO[2]} face={-1} />
      <Arrow x1={44} y1={98} x2={88} y2={70} bend={14} w={3.5} head={9} />
      <Arrow x1={172} y1={70} x2={218} y2={100} bend={14} w={3.5} head={9} />
      <Box x={130} y={118} s={0.85} />
      <Toy x={52} y={140} s={0.75} />
      <Toy x={208} y={140} s={0.75} paint={WHO[3]} face={-1} />
      <CategoryCard x={130} y={28} />
    </Art>
  );
}

function Answer({ touch }: { touch?: boolean }) {
  return (
    <Art bg={PALETTE.woodLight}>
      <Lid />
      <Toy x={44} y={136} s={0.9} />
      <Box x={92} y={136} s={0.95} spin />
      <Toy x={214} y={128} s={0.8} paint={WHO[0]} face={-1} className="ta-bob" />
      <Arrow x1={108} y1={92} x2={196} y2={80} bend={-22} w={4} />
      {/* the typed answer: a fruit that hasn't been said yet */}
      <g transform="translate(8 8)">
        <rect width={68} height={38} rx={10} fill={PALETTE.white} {...line} />
        <path d="M18 38l-4 12 14 -12" fill={PALETTE.white} {...line} />
        <path d="M17 38h13" stroke={PALETTE.white} strokeWidth={3} />
        <path d="M14 26q14 4 26 -14q4 10 -4 18q-12 8 -22 -4z" fill={PALETTE.honey} {...thin} />
        <rect x={50} y={10} width={3.5} height={20} rx={1} fill={INK} className="ta-blinkfast" />
      </g>
      {touch ? <PillBtn x={130} y={28} w={66} h={26} label="Crank!" press /> : <Key x={130} y={26} k="Enter" w={56} press />}
      {touch && <Finger x={140} y={32} />}
    </Art>
  );
}

function Pop() {
  return (
    <Art bg={PALETTE.woodLight}>
      <Lid />
      <Burst x={98} y={58} r={34} fill={PALETTE.honey} spikes={11} className="ta-pulse" />
      <Box x={110} y={132} open />
      <Jack x={106} y={100} />
      <Toy x={48} y={134} s={0.85} out tilt={-80} />
      <Sparkle x={36} y={86} r={6} />
      <Sparkle x={62} y={92} r={5} />
      <Toy x={186} y={124} s={0.75} paint={WHO[0]} face={-1} className="ta-bob" />
      <Toy x={232} y={130} s={0.75} paint={WHO[2]} face={-1} className="ta-bob" style={vars({ d: '-0.5s' })} />
    </Art>
  );
}

export const JACKBOX_ART = {
  'jackbox-category': () => <Category />,
  'jackbox-answer': () => <Answer />,
  'jackbox-answer-touch': () => <Answer touch />,
  'jackbox-pop': () => <Pop />,
};
