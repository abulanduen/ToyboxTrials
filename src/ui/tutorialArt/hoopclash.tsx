/** Hoop Clash: Red against Blue in jerseys, the charged shot with its gold arc, passes and steals, the clocks. */
import { PALETTE } from '../../game/palette';
import { Arrow, Art, Bar, Burst, Finger, INK, Key, Mouse, PillBtn, Sparkle, Stopwatch, TapBtn, Toy, line, thin, vars, type Paint } from './kit';

const RED: Paint = { body: PALETTE.honey, trim: PALETTE.cream, accent: PALETTE.coral };
const BLUE: Paint = { body: PALETTE.sage, trim: PALETTE.cream, accent: PALETTE.toyBlue };

/** The maple court floor with a white line, under a pale wall of crowd. */
function Court({ arc = false }: { arc?: boolean }) {
  return (
    <>
      <rect width={260} height={150} fill={PALETTE.cream} />
      <rect y={104} width={260} height={46} fill={PALETTE.woodLight} />
      <path d="M0 104H260" {...line} />
      <path d="M0 128H260" stroke={PALETTE.white} strokeWidth={3} />
      {arc && <path d="M150 150Q170 112 260 110" fill="none" stroke={PALETTE.white} strokeWidth={3} />}
    </>
  );
}

/** A toy in a team jersey: the vest over its body, with a white collar and hem. */
function Player({ x, y, s = 1, face = 1, team, paint, hold, className, style }: { x: number; y: number; s?: number; face?: 1 | -1; team: 0 | 1; paint?: Paint; hold?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const jersey = team === 0 ? PALETTE.teamRed : PALETTE.teamBlue;
  return (
    <g className={className} style={style}>
      <Toy x={x} y={y} s={s} face={face} paint={paint ?? (team === 0 ? RED : BLUE)} hold={hold} />
      <g transform={`translate(${x} ${y}) scale(${face * s} ${s})`}>
        <rect x={-13} y={-27} width={26} height={19} rx={4} fill={jersey} {...thin} />
        <rect x={-13} y={-27} width={26} height={3} fill={PALETTE.white} />
        <rect x={-13} y={-11} width={26} height={2.5} fill={PALETTE.white} />
        <rect x={-4} y={-22} width={8} height={9} rx={2} fill={PALETTE.white} opacity={0.9} />
      </g>
    </g>
  );
}

const BallMark = ({ x = 0, y = 0, r = 6 }: { x?: number; y?: number; r?: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <circle r={r} fill={PALETTE.ballOrange} {...thin} />
    <path d={`M${-r} 0H${r}M0 ${-r}V${r}`} stroke={INK} strokeWidth={1.1} />
  </g>
);

/** A hoop on the right: stanchion, board with its square, the rim and the net. */
function Hoop({ x = 236, rim = 50 }: { x?: number; rim?: number }) {
  return (
    <g>
      <rect x={x + 10} y={rim - 26} width={6} height={130 - rim + 26} fill={PALETTE.inkPurple} {...thin} />
      <rect x={x + 2} y={rim - 30} width={8} height={30} rx={2} fill={PALETTE.white} {...line} />
      <rect x={x - 22} y={rim - 2} width={24} height={4} rx={2} fill={PALETTE.coral} {...thin} />
      <path d={`M${x - 20} ${rim + 2}L${x - 16} ${rim + 18}H${x - 4}L${x} ${rim + 2}M${x - 14} ${rim + 2}L${x - 12} ${rim + 18}M${x - 8} ${rim + 2}L${x - 8} ${rim + 18}`} fill="none" stroke={PALETTE.white} strokeWidth={1.6} />
    </g>
  );
}

/** Red against Blue: two jerseyed toys meet at centre for the jump ball. */
function Teams() {
  return (
    <Art>
      <Court />
      <ellipse cx={130} cy={130} rx={46} ry={9} fill="none" stroke={PALETTE.white} strokeWidth={3} />
      <Player x={96} y={128} team={0} s={1.1} />
      <Player x={164} y={128} team={1} s={1.1} face={-1} />
      <g className="ta-bob">
        <BallMark x={130} y={40} r={9} />
      </g>
      <Arrow x1={130} y1={22} x2={130} y2={34} color={PALETTE.honey} w={3} head={8} />
      {/* the crowd: red and blue flags */}
      {[22, 48, 212, 238].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={88} r={8} fill={i < 2 ? PALETTE.teamRed : PALETTE.teamBlue} {...thin} />
          <circle cx={x} cy={74} r={6} fill={PALETTE.cream} {...thin} />
        </g>
      ))}
    </Art>
  );
}

/** Charge, let go: the arc turns gold when it goes in; beyond the arc it is worth three. */
function Shoot({ touch }: { touch?: boolean }) {
  return (
    <Art>
      <Court arc />
      <Hoop />
      <Player x={58} y={128} team={0} hold={<BallMark x={4} y={-14} r={6} />} />
      <path d="M72 82Q140 -10 214 50" fill="none" stroke={PALETTE.honey} strokeWidth={4} strokeDasharray="2 7" strokeLinecap="round" className="ta-glow" />
      <Sparkle x={206} y={36} r={7} fill={PALETTE.honey} className="ta-pop" />
      <Bar x={58} y={30} w={56} h={9} k={0.62} fill={PALETTE.honey} />
      {touch ? (
        <>
          <TapBtn x={150} y={126} r={18} label="Shoot" fill={PALETTE.ballOrange} fs={9} down />
          <Finger x={156} y={130} anim="lift" t="2.4s" />
        </>
      ) : (
        <>
          <Key x={128} y={128} k="Space" w={52} lit />
          <Key x={168} y={128} k="E" lit />
          <Mouse x={198} y={124} s={0.8} click />
        </>
      )}
    </Art>
  );
}

/** Pass to the teammate you face; without the ball, swipe it off a dribbler or out of the air. */
function Steal({ touch }: { touch?: boolean }) {
  return (
    <Art>
      <Court />
      {/* a Blue dribbler, a Red swipe */}
      <Player x={112} y={124} team={1} face={-1} />
      <g className="ta-bob" style={vars({ t: '0.6s' })}>
        <BallMark x={96} y={112} r={6} />
      </g>
      <Player x={70} y={124} team={0} className="ta-push" style={vars({ dx: 8, dy: 0 })} />
      <Burst x={92} y={92} r={13} fill={PALETTE.honey} className="ta-pulse" />
      {/* a pass across to a teammate */}
      <Player x={196} y={124} team={1} face={-1} />
      <Arrow x1={126} y1={84} x2={182} y2={86} bend={-10} color={PALETTE.white} w={4} dashed />
      {touch ? (
        <>
          <TapBtn x={40} y={44} r={18} label="Steal" fill={PALETTE.ballOrange} fs={9} press />
          <PillBtn x={220} y={40} w={52} label="Pass" fill={PALETTE.toyBlue} press delay="0.8s" />
        </>
      ) : (
        <>
          <Key x={40} y={42} k="E" press />
          <Key x={210} y={40} k="Q" press delay="0.8s" />
          <Mouse x={238} y={38} s={0.7} />
        </>
      )}
    </Art>
  );
}

/** The shot clock and the two halves: switch ends at halftime, overtime if it's tied. */
function Clocks() {
  return (
    <Art>
      <Court />
      {/* the scoreboard: Red's half, the clock, Blue's half */}
      <rect x={60} y={14} width={140} height={44} rx={8} fill={INK} {...line} />
      <rect x={66} y={20} width={44} height={32} rx={5} fill={PALETTE.teamRed} />
      <rect x={150} y={20} width={44} height={32} rx={5} fill={PALETTE.teamBlue} />
      <rect x={114} y={22} width={32} height={18} rx={4} fill={PALETTE.honey} />
      <circle cx={130} cy={47} r={3.5} fill={PALETTE.coral} className="ta-blink" />
      <Stopwatch x={36} y={42} r={15} used={0.8} />
      {/* switching ends */}
      <Player x={92} y={128} team={0} />
      <Player x={168} y={128} team={1} face={-1} />
      <Arrow x1={104} y1={78} x2={156} y2={78} bend={-14} color={PALETTE.teamRed} w={3.5} />
      <Arrow x1={156} y1={92} x2={104} y2={92} bend={14} color={PALETTE.teamBlue} w={3.5} />
      <BallMark x={226} y={110} r={8} />
    </Art>
  );
}

export const HOOPCLASH_ART = {
  'hoopclash-teams': () => <Teams />,
  'hoopclash-shoot': () => <Shoot />,
  'hoopclash-shoot-touch': () => <Shoot touch />,
  'hoopclash-steal': () => <Steal />,
  'hoopclash-steal-touch': () => <Steal touch />,
  'hoopclash-clocks': () => <Clocks />,
};
