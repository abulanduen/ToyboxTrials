/** Red Light, Green Light: the felt runway, rail lamps and the Signalman at the far end. */
import { PALETTE, ROOM } from '../../game/palette';
import { Arrow, Art, Burst, Finger, INK, Key, RIVALS, SpeedLines, Stick, Tick, Toy, line, thin, vars } from './kit';

const GO = PALETTE.sage;
const WARN = PALETTE.honey;
const STOP = PALETTE.coral;

function Lamp({ x, color, blink }: { x: number; color: string; blink?: boolean }) {
  return (
    <g transform={`translate(${x} 104)`}>
      <rect x={-2.5} y={-30} width={5} height={30} fill={PALETTE.woodLight} {...thin} />
      <g className={blink ? 'ta-blink' : undefined}>
        <circle cy={-37} r={12} fill={color} opacity={0.35} />
        <rect x={-7} y={-44} width={14} height={14} rx={4} fill={PALETTE.cream} {...thin} />
        <circle cy={-37} r={5} fill={color} {...thin} />
      </g>
    </g>
  );
}

/** Wall, table, runway, start line and three rail lamps. */
function Runway({ lamp, blink }: { lamp: string; blink?: boolean }) {
  return (
    <>
      <rect width={260} height={98} fill={ROOM.wallUpper} />
      <rect y={98} width={260} height={52} fill={PALETTE.woodLight} />
      <rect y={106} width={200} height={26} fill={PALETTE.feltDark} {...thin} />
      {[40, 80, 120, 160].map((x) => (
        <rect key={x} x={x} y={118} width={14} height={2.5} rx={1} fill={PALETTE.cream} opacity={0.6} />
      ))}
      <rect x={16} y={106} width={5} height={26} fill={PALETTE.white} />
      {[66, 116, 166].map((x) => (
        <Lamp key={x} x={x} color={lamp} blink={blink} />
      ))}
    </>
  );
}

/**
 * The Signalman in profile, feet at (x, y). `face = 1` has its back to the runway (to the left),
 * so the key faces the toys; `face = -1` turns its lantern eye on them.
 */
function Signalman({ x, y, face, signal, raise, ratchet = false }: { x: number; y: number; face: 1 | -1; signal: string; raise: 'go' | 'stop' | 'none'; ratchet?: boolean }) {
  const up = (c: string) => (
    <>
      <path d="M-2 -56L-14 -80" stroke={PALETTE.inkPurple} strokeWidth={6} strokeLinecap="round" />
      <path d="M-2 -56L-14 -80" fill="none" {...thin} strokeWidth={1.2} />
      <circle cx={-16} cy={-86} r={9} fill={c} {...line} />
    </>
  );
  const down = (c: string, dx: number) => (
    <>
      <path d={`M${dx} -54L${dx + 5} -32`} stroke={PALETTE.inkPurple} strokeWidth={6} strokeLinecap="round" />
      <circle cx={dx + 6} cy={-26} r={7.5} fill={c} {...line} />
    </>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${face} 1)`}>
      <ellipse cy={-4} rx={26} ry={7} fill={PALETTE.brass} {...line} />
      {/* the far arm (behind the body) */}
      {raise === 'go' ? down(STOP, -6) : raise === 'stop' ? down(GO, -6) : down(GO, -6)}
      <path d="M-17 -9L17 -9L11 -62H-11z" fill={PALETTE.inkPurple} {...line} />
      <path d="M-15.5 -24H15.5L14.8 -18H-14.8z" fill={PALETTE.honey} {...thin} />
      {[-32, -42, -52].map((cy) => (
        <circle key={cy} cx={9} cy={cy} r={2.2} fill={PALETTE.brass} {...thin} />
      ))}
      {/* wind-up key on its back */}
      <rect x={-22} y={-42} width={10} height={4} fill={PALETTE.brass} {...thin} />
      <g transform="translate(-28 -40)">
        {ratchet && (
          <g className="ta-tick" stroke={INK} strokeWidth={2.4} strokeLinecap="round">
            <path d="M-13 -15l-4 -4M-17 0h-5M-13 15l-4 4" />
          </g>
        )}
        <g className={ratchet ? 'ta-ratchet' : undefined}>
          <circle cy={-8} r={7} fill={PALETTE.brass} {...line} />
          <circle cy={8} r={7} fill={PALETTE.brass} {...line} />
          <circle cy={-8} r={2.4} fill={ROOM.wallUpper} {...thin} />
          <circle cy={8} r={2.4} fill={ROOM.wallUpper} {...thin} />
        </g>
      </g>
      {/* head, lantern eye, cap and beacon */}
      <circle cy={-75} r={14} fill={PALETTE.cream} {...line} />
      <circle cx={10} cy={-75} r={7} fill={INK} />
      <circle cx={12} cy={-75} r={4.6} fill={signal} />
      <rect x={-12} y={-94} width={24} height={10} rx={3} fill={PALETTE.toyBlue} {...line} />
      <rect x={4} y={-86.5} width={18} height={3.5} rx={1.5} fill={INK} />
      <circle cy={-101} r={11} fill={signal} opacity={0.35} />
      <circle cy={-101} r={6} fill={signal} {...line} />
      {/* the near arm */}
      {raise === 'go' ? up(GO) : raise === 'stop' ? up(STOP) : down(STOP, 2)}
    </g>
  );
}

const RIVAL = RIVALS[0];

function Go({ touch }: { touch?: boolean }) {
  return (
    <Art>
      <Runway lamp={GO} />
      <Signalman x={222} y={126} face={1} signal={GO} raise="go" />
      <SpeedLines x={44} y={126} s={0.8} />
      <Toy x={44} y={126} s={0.8} paint={RIVAL} className="ta-run" style={vars({ dx: 64, t: '2.6s', d: '-1.1s' })} />
      <SpeedLines x={92} y={126} s={0.8} />
      <Toy x={92} y={126} s={0.8} className="ta-run" style={vars({ dx: 64, t: '2.6s' })} />
      {touch ? (
        <>
          <Stick x={36} y={54} r={22} className="ta-push" style={vars({ dx: 0, dy: -12 })} />
          <Arrow x1={36} y1={28} x2={36} y2={12} w={4} head={10} />
        </>
      ) : (
        <>
          <Key x={30} y={30} k="W" press />
          <Key x={62} y={30} arrow="up" press />
        </>
      )}
    </Art>
  );
}

function Ratchet({ touch }: { touch?: boolean }) {
  return (
    <Art>
      <Runway lamp={WARN} blink />
      <Signalman x={222} y={126} face={1} signal={WARN} raise="none" ratchet />
      <Toy x={60} y={126} s={0.8} paint={RIVAL} className="ta-bob" />
      <Toy x={112} y={126} s={0.8} className="ta-bob" style={vars({ d: '-0.4s' })} />
      {touch ? (
        <>
          <Stick x={36} y={46} r={22} className="ta-recentre" style={vars({ dx: 0, dy: -11 })} />
          <Finger x={36} y={46} anim="lift" />
        </>
      ) : (
        <>
          <Key x={30} y={46} k="W" />
          <Key x={62} y={46} arrow="up" />
          <Finger x={30} y={34} from="above" anim="lift" />
          <Finger x={62} y={34} from="above" anim="lift" flip />
        </>
      )}
    </Art>
  );
}

function Caught() {
  return (
    <Art>
      <Runway lamp={STOP} />
      <Signalman x={222} y={126} face={-1} signal={STOP} raise="stop" />
      <Arrow x1={140} y1={78} x2={24} y2={100} bend={-34} color={PALETTE.coral} dashed w={4} />
      <Toy x={86} y={126} s={0.8} />
      <Tick x={94} y={68} s={0.8} />
      <Burst x={146} y={104} r={20} fill={PALETTE.coral} />
      <SpeedLines x={150} y={126} s={0.8} />
      <Toy x={150} y={126} s={0.8} paint={RIVAL} className="ta-flick" style={vars({ dx: -124, dy: -50, t: '2.8s' })} />
    </Art>
  );
}

export const REDLIGHT_ART = {
  'redlight-go': () => <Go />,
  'redlight-go-touch': () => <Go touch />,
  'redlight-ratchet': () => <Ratchet />,
  'redlight-ratchet-touch': () => <Ratchet touch />,
  'redlight-caught': () => <Caught />,
};
