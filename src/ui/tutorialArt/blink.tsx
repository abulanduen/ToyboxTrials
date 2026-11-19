/** Blink Duel: one-hit toy swords, instant blinks, and striped wind-up cones. */
import { PALETTE } from '../../game/palette';
import { Arrow, Art, Burst, Key, Mouse, MoveKeys, PillBtn, RIVALS, Sparkle, Toy, line, thin, useArtId, vars } from './kit';

const Sword = ({ up = false }: { up?: boolean }) => (
  <g transform={up ? 'rotate(-70)' : 'rotate(-20)'}>
    <rect x={-2} y={-3} width={8} height={6} rx={2} fill={PALETTE.honey} {...thin} />
    <path d="M6 -2.5H26L30 0L26 2.5H6z" fill={PALETTE.white} {...thin} />
    <rect x={4} y={-6} width={3} height={12} rx={1.5} fill={PALETTE.brass} {...thin} />
  </g>
);

/** Cardboard arena floor with a rail along the back and front. */
function Arena() {
  return (
    <>
      <rect width={260} height={150} fill={PALETTE.cardboardDark} />
      <rect x={6} y={30} width={248} height={112} rx={6} fill={PALETTE.cardboard} {...line} />
      {[60, 120, 180].map((x) => (
        <path key={x} d={`M${x} 32v108`} stroke={PALETTE.cardboardDark} strokeWidth={1.2} opacity={0.6} />
      ))}
      <rect x={6} y={22} width={248} height={10} rx={3} fill={PALETTE.woodMid} {...line} />
    </>
  );
}

function Hit() {
  return (
    <Art>
      <Arena />
      <Toy x={84} y={124} s={1} hold={<Sword />} />
      <path d="M110 64q34 20 14 60q12 -30 -14 -60z" fill={PALETTE.white} {...thin} className="ta-glow" />
      <Burst x={150} y={92} r={22} fill={PALETTE.honey} className="ta-pulse" />
      <Toy x={170} y={126} s={1} paint={RIVALS[0]} face={-1} out tilt={40} className="ta-knock" style={vars({ dx: 40, dy: -6, r: '30deg', t: '2s' })} />
      <Sparkle x={196} y={54} r={7} />
      <Sparkle x={216} y={76} r={5} />
    </Art>
  );
}

function Dodge({ touch }: { touch?: boolean }) {
  return (
    <Art>
      <Arena />
      {/* where you were: a fading ghost and a puff */}
      <g opacity={0.35}>
        <Toy x={60} y={110} s={0.95} keyTurn={false} />
      </g>
      <Sparkle x={42} y={68} r={6} className="ta-fade" />
      <Sparkle x={76} y={54} r={5} className="ta-fade" />
      <Arrow x1={86} y1={74} x2={176} y2={74} bend={-22} dashed color={PALETTE.white} w={4} />
      {/* where you are: an instant later */}
      <Toy x={200} y={104} s={0.95} className="ta-appear" style={vars({ t: '2s' })} />
      <Sparkle x={178} y={50} r={7} fill={PALETTE.honey} className="ta-pop" />
      <Sparkle x={228} y={60} r={6} fill={PALETTE.honey} className="ta-pop" style={vars({ d: '0.1s' })} />
      {touch ? (
        <PillBtn x={128} y={132} w={70} h={24} label="Blink" press />
      ) : (
        <>
          <Key x={128} y={134} k="Space" w={62} press />
          <MoveKeys x={196} y={128} s={0.55} lit={['D']} />
        </>
      )}
    </Art>
  );
}

/** The striped wind-up cone from (x, y), pointing left, filling as the swing charges. */
function Cone({ x, y, r = 64, half = 45 }: { x: number; y: number; r?: number; half?: number }) {
  const id = useArtId();
  const a1 = ((180 - half) * Math.PI) / 180;
  const a2 = ((180 + half) * Math.PI) / 180;
  const d = `M${x} ${y}L${x + Math.cos(a1) * r} ${y + Math.sin(a1) * r}A${r} ${r} 0 0 1 ${x + Math.cos(a2) * r} ${y + Math.sin(a2) * r}z`;
  return (
    <>
      <defs>
        <pattern id={`st${id}`} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={10} height={10} fill={PALETTE.honey} />
          <rect width={5} height={10} fill={PALETTE.coral} />
        </pattern>
      </defs>
      <path d={d} fill={`url(#st${id})`} opacity={0.45} {...line} />
      <path d={d} fill={PALETTE.coral} opacity={0.55} className="ta-charge" style={vars({ ox: '100%', oy: '50%', t: '1.8s' })} />
      <path d={d} fill="none" {...line} />
    </>
  );
}

function Windup({ touch }: { touch?: boolean }) {
  return (
    <Art>
      <Arena />
      <Cone x={186} y={100} />
      <Toy x={204} y={128} s={1} paint={RIVALS[0]} face={-1} hold={<Sword up />} />
      {/* blink out of the cone */}
      <g opacity={0.35}>
        <Toy x={150} y={118} s={0.8} keyTurn={false} />
      </g>
      <Arrow x1={138} y1={78} x2={84} y2={58} bend={10} dashed color={PALETTE.white} w={4} />
      <Toy x={60} y={96} s={0.8} className="ta-appear" style={vars({ t: '1.8s' })} />
      {touch ? (
        <>
          <PillBtn x={36} y={130} w={56} h={22} label="Swing" fill={PALETTE.cream} />
          <PillBtn x={102} y={130} w={56} h={22} label="Blink" press />
        </>
      ) : (
        <>
          <Key x={22} y={130} k="J" />
          <Mouse x={50} y={128} s={0.7} click />
          <Key x={100} y={132} k="Space" w={52} fs={13} press />
        </>
      )}
    </Art>
  );
}

export const BLINK_ART = {
  'blink-hit': () => <Hit />,
  'blink-dodge': () => <Dodge />,
  'blink-dodge-touch': () => <Dodge touch />,
  'blink-windup': () => <Windup />,
  'blink-windup-touch': () => <Windup touch />,
};
