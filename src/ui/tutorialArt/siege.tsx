/** Toybox Siege: one toy on its own patch, a swarm closing in, gems, upgrade cards, elites, chests and the boss. */
import { PALETTE, ROOM } from '../../game/palette';
import { Arrow, Art, At, Bar, Burst, INK, MoveKeys, RIVALS, Sparkle, SpeedLines, Star, Stick, Toy, line, thin, vars } from './kit';

/** A dust bunny (grey fluff, two flopped ears, button eyes), feet at (x, y). */
function Bunny({ x, y, s = 1, className, style }: { x: number; y: number; s?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={className} style={style}>
        <ellipse cx={-5} cy={-15} rx={3} ry={6} fill={PALETTE.roomFabric} transform="rotate(-25 -5 -15)" {...thin} />
        <ellipse cx={5} cy={-15} rx={3} ry={6} fill={PALETTE.roomFabric} transform="rotate(25 5 -15)" {...thin} />
        <circle cy={-7} r={8} fill={PALETTE.roomFabric} {...thin} />
        <circle cx={-3} cy={-8} r={1.3} fill={INK} />
        <circle cx={3} cy={-8} r={1.3} fill={INK} />
      </g>
    </g>
  );
}

/** An experience gem. */
function Gem({ x, y, fill = PALETTE.toyBlue, className, style }: { x: number; y: number; fill?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        <path d="M0 -6l5 6l-5 6l-5 -6z" fill={fill} {...thin} />
      </g>
    </g>
  );
}

/** A treasure chest, base at (x, y). */
function Chest({ x, y, s = 1, open = false }: { x: number; y: number; s?: number; open?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-14} y={-14} width={28} height={14} rx={2} fill={PALETTE.woodMid} {...line} />
      <rect x={-14} y={-9} width={28} height={3} fill={PALETTE.brass} {...thin} />
      {open ? <path d="M-14 -14l4 -12h28l-4 12z" fill={PALETTE.woodLight} {...line} /> : <path d="M-14 -14q14 -12 28 0z" fill={PALETTE.woodLight} {...line} />}
      <rect x={-3} y={-12} width={6} height={6} rx={1} fill={PALETTE.brass} {...thin} />
    </g>
  );
}

/** An upgrade card with five level pips, `level` of them filled. */
function Card({ x, y, fill, level, lit = false }: { x: number; y: number; fill: string; level: number; lit?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-20} y={-30} width={40} height={56} rx={5} fill={lit ? PALETTE.cream : PALETTE.white} stroke={fill} strokeWidth={lit ? 4 : 2.5} />
      <rect x={-11} y={-22} width={22} height={22} rx={5} fill={fill} {...thin} />
      {Array.from({ length: 5 }, (_, i) => (
        <rect key={i} x={-15 + i * 6.5} y={10} width={4.5} height={8} rx={1} fill={i < level ? PALETTE.inkPurple : ROOM.rugAccent} />
      ))}
    </g>
  );
}

function Move({ touch }: { touch?: boolean }) {
  return (
    <Art bg={PALETTE.felt}>
      {/* the swarm closes in from both sides */}
      {[
        [18, 70],
        [30, 112],
        [52, 136],
        [172, 140],
        [196, 86],
      ].map(([x, y], i) => (
        <Bunny key={i} x={x} y={y} s={1} className="ta-bob" style={vars({ d: `${-i * 0.3}s` })} />
      ))}
      {/* our toy runs; its weapon fires on its own */}
      <SpeedLines x={112} y={118} />
      <Toy x={112} y={118} s={1} className="ta-bob" />
      <path d="M128 90l44 -6" stroke={PALETTE.coral} strokeWidth={3} strokeLinecap="round" strokeDasharray="6 6" />
      <circle cx={178} cy={83} r={4.5} fill={ROOM.terracotta} {...thin} />
      <Burst x={196} y={76} r={11} fill={PALETTE.honey} className="ta-pulse" />
      <Arrow x1={70} y1={30} x2={126} y2={30} w={4} />
      {touch ? <Stick x={220} y={122} r={18} kx={6} arrow /> : <MoveKeys x={214} y={32} s={0.7} lit={['D']} press />}
    </Art>
  );
}

function Level() {
  return (
    <Art bg={PALETTE.feltDark}>
      {/* gems fly to the toy and fill the bar */}
      <Toy x={40} y={128} s={0.9} />
      {[
        [80, 120],
        [96, 104],
        [72, 96],
      ].map(([x, y], i) => (
        <Gem key={i} x={x} y={y} fill={i === 2 ? PALETTE.honey : PALETTE.toyBlue} className="ta-bob" style={vars({ d: `${-i * 0.4}s` })} />
      ))}
      <Arrow x1={70} y1={84} x2={48} y2={70} w={3} head={8} />
      <Bar x={52} y={22} w={70} h={8} k={0.85} fill={PALETTE.toyBlue} />
      <Star x={98} y={22} r={8} className="ta-pulse" />
      {/* pick one card: weapons and passives, up to five levels */}
      <Card x={130} y={82} fill={PALETTE.coral} level={2} />
      <Card x={177} y={82} fill={PALETTE.honey} level={5} lit />
      <Card x={224} y={82} fill={PALETTE.sage} level={1} />
      <Sparkle x={195} y={46} r={6} className="ta-pulse" />
    </Art>
  );
}

function Elite() {
  return (
    <Art bg={PALETTE.woodMid}>
      {/* a big elite toy, beaten, drops a chest */}
      <g transform="translate(40 120)">
        <ellipse cx={0} cy={-26} rx={24} ry={24} fill={PALETTE.woodLight} {...line} />
        <circle cx={-14} cy={-48} r={7} fill={PALETTE.woodLight} {...thin} />
        <circle cx={14} cy={-48} r={7} fill={PALETTE.woodLight} {...thin} />
        <circle cx={-7} cy={-30} r={2.4} fill={INK} />
        <circle cx={7} cy={-30} r={2.4} fill={INK} />
        <rect x={-26} y={-58} width={52} height={6} rx={3} fill={INK} />
        <rect x={-26} y={-58} width={8} height={6} rx={3} fill={PALETTE.coral} />
      </g>
      <Arrow x1={70} y1={92} x2={102} y2={92} w={4} />
      <Chest x={128} y={110} s={1.1} open />
      <Sparkle x={128} y={72} r={7} className="ta-pulse" />
      {/* open it (evolve or upgrade) … */}
      <Arrow x1={148} y1={80} x2={186} y2={44} w={3.5} head={9} />
      <Star x={202} y={34} r={12} className="ta-pulse" />
      {/* … or skip it and send an elite to a rival's board */}
      <Arrow x1={150} y1={112} x2={186} y2={118} w={3.5} head={9} color={PALETTE.coral} dashed />
      <rect x={192} y={90} width={60} height={50} rx={5} fill={PALETTE.felt} {...line} />
      <Toy x={222} y={136} s={0.62} paint={RIVALS[0]} />
      <circle cx={244} cy={100} r={6} fill={PALETTE.coral} className="ta-blink" {...thin} />
    </Art>
  );
}

function Boss() {
  return (
    <Art bg={PALETTE.felt}>
      {/* the boss at 4:00, with its health bar */}
      <g transform="translate(60 132)">
        <rect x={-34} y={-62} width={68} height={56} rx={10} fill={PALETTE.brass} {...line} />
        <rect x={-20} y={-80} width={10} height={20} rx={2} fill={ROOM.terracotta} {...thin} />
        <rect x={10} y={-76} width={10} height={16} rx={2} fill={ROOM.terracotta} {...thin} />
        <circle cx={0} cy={-36} r={12} fill={INK} {...thin} />
        <circle cx={0} cy={-36} r={6} fill={PALETTE.honey} className="ta-pulse" />
        <rect x={-30} y={-8} width={18} height={8} rx={3} fill={ROOM.lampMetal} {...thin} />
        <rect x={12} y={-8} width={18} height={8} rx={3} fill={ROOM.lampMetal} {...thin} />
      </g>
      <Bar x={60} y={20} w={80} h={8} k={0.3} fill={PALETTE.coral} drain />
      <Toy x={140} y={130} s={0.85} face={-1} />
      <Burst x={98} y={86} r={12} fill={PALETTE.honey} className="ta-pulse" />
      {/* knocked down once: pay to revive; after that, a ghost watches the other boards */}
      <At x={196} y={70} className="ta-bob">
        <g opacity={0.5}>
          <Toy x={0} y={0} s={0.7} out />
        </g>
      </At>
      <Arrow x1={196} y1={84} x2={236} y2={110} w={3} head={8} dashed />
      <rect x={214} y={110} width={40} height={32} rx={4} fill={PALETTE.feltDark} {...thin} />
      <Toy x={234} y={140} s={0.42} paint={RIVALS[1]} />
    </Art>
  );
}

export const SIEGE_ART = {
  'siege-move': () => <Move />,
  'siege-move-touch': () => <Move touch />,
  'siege-level': () => <Level />,
  'siege-elite': () => <Elite />,
  'siege-boss': () => <Boss />,
};
