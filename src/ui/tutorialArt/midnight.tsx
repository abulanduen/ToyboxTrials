/** Midnight Hunger: draining energy, battery bots at night and roofed shelters by day. */
import { PALETTE, ROOM } from '../../game/palette';
import { Arrow, Art, Bar, Burst, Cross, INK, Key, MoveKeys, RIVALS, Stick, TapBtn, Toy, line, thin, vars } from './kit';

/** The felt board with a faint cell grid, from y down. */
function Floor({ y = 96, dark = false }: { y?: number; dark?: boolean }) {
  return (
    <>
      <rect y={y} width={260} height={150 - y} fill={PALETTE.feltDark} />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d={`M${i * 24 - 6} ${y}L${i * 24 - 18} 150`} stroke={INK} strokeWidth={1} opacity={0.18} />
      ))}
      <path d={`M0 ${y + 20}H260M0 ${y + 42}H260`} stroke={INK} strokeWidth={1} opacity={0.18} />
      {dark && <rect y={y} width={260} height={150 - y} fill={INK} opacity={0.35} />}
    </>
  );
}

/** A battery bot: honey box, brass cap, plus sign, purple wheels; `pips` hits left above it. */
function Battery({ x, y, pips = 3, fadePips = false, ghost = false }: { x: number; y: number; pips?: number; fadePips?: boolean; ghost?: boolean }) {
  if (ghost)
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect x={-12} y={-24} width={24} height={18} rx={3} fill="none" stroke={PALETTE.cream} strokeWidth={2.2} strokeDasharray="4 3" />
        <rect x={-4.5} y={-29} width={9} height={5} rx={1.5} fill="none" stroke={PALETTE.cream} strokeWidth={2} strokeDasharray="3 2" />
      </g>
    );
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ta-bob" style={vars({ t: '0.9s' })}>
        <circle cx={-7} cy={-4} r={4} fill={PALETTE.inkPurple} {...thin} />
        <circle cx={7} cy={-4} r={4} fill={PALETTE.inkPurple} {...thin} />
        <circle r={20} cy={-16} fill={PALETTE.honey} opacity={0.25} />
        <rect x={-12} y={-24} width={24} height={18} rx={3} fill={PALETTE.honey} {...line} />
        <rect x={-4.5} y={-29} width={9} height={5} rx={1.5} fill={PALETTE.brass} {...thin} />
        <path d="M0 -20v8M-4 -16h8" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
        {Array.from({ length: pips }, (_, i) => (
          <g key={i} transform={`translate(${(i - (pips - 1) / 2) * 9} -38)`}>
            <g className={fadePips ? 'ta-fade' : undefined} style={fadePips ? vars({ t: '2.4s', d: `${-1.2 + i * 0.35}s` }) : undefined}>
              <circle r={3.4} fill={PALETTE.cream} {...thin} />
            </g>
          </g>
        ))}
      </g>
    </g>
  );
}

function Drain() {
  return (
    <Art bg={ROOM.wallUpper}>
      <Floor y={104} />
      <Toy x={80} y={132} s={1.15} />
      <Bar x={80} y={40} w={84} h={13} k={0.55} fill={PALETTE.honey} frame={PALETTE.honey} drain style={vars({ to: 0.2, t: '3.2s' })} />
      <Arrow x1={136} y1={26} x2={136} y2={54} color={PALETTE.coral} w={4} />
      <Toy x={206} y={134} s={0.9} paint={RIVALS[0]} out tilt={-80} />
      <Bar x={206} y={72} w={52} h={10} k={0.04} fill={PALETTE.coral} />
      <Cross x={238} y={54} s={0.8} />
    </Art>
  );
}

function Night({ touch }: { touch?: boolean }) {
  return (
    <Art bg={PALETTE.ink}>
      {[
        [120, 16],
        [150, 30],
        [176, 12],
        [96, 36],
        [206, 40],
      ].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={1.8} fill={PALETTE.cream} className="ta-glow" style={vars({ d: `${(x % 7) * 0.2}s` })} />
      ))}
      <path d="M238 14a16 16 0 1 0 6 26a13 13 0 1 1 -6 -26z" fill={PALETTE.cream} {...thin} />
      <Floor y={82} dark />
      {/* you, facing a battery bot and knocking its three pips off */}
      <Toy x={34} y={128} s={0.78} />
      <Burst x={58} y={104} r={9} fill={PALETTE.white} className="ta-pulse" style={vars({ t: '0.8s' })} />
      <Battery x={74} y={128} fadePips />
      <Toy x={130} y={128} s={0.78} paint={RIVALS[1]} />
      <Battery x={168} y={128} pips={2} />
      {/* one battery too few: someone goes without */}
      <Battery x={204} y={128} ghost />
      <Toy x={238} y={128} s={0.78} paint={RIVALS[2]} face={-1} />
      {touch ? (
        <TapBtn x={40} y={36} r={21} label="Hit" fs={12} press delay="0s" />
      ) : (
        <>
          <Key x={42} y={30} k="Space" w={60} press />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={30 + i * 12} cy={54} r={4} fill={PALETTE.honey} {...thin} />
          ))}
        </>
      )}
    </Art>
  );
}

function Shelter({ x, y, w = 70 }: { x: number; y: number; w?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-6} width={w} height={14} rx={3} fill={PALETTE.sage} opacity={0.45} />
      <rect x={-w / 2 + 4} y={-62} width={5} height={60} fill={PALETTE.woodLight} {...thin} />
      <rect x={w / 2 - 9} y={-62} width={5} height={60} fill={PALETTE.woodLight} {...thin} />
      <path d={`M${-w / 2 - 8} -58L0 -80L${w / 2 + 8} -58z`} fill={PALETTE.sage} fillOpacity={0.85} {...line} />
    </g>
  );
}

function Day({ touch }: { touch?: boolean }) {
  return (
    <Art bg={ROOM.sunWarm}>
      <g transform="translate(26 26)">
        <g className="ta-spin" style={vars({ t: '12s' })}>
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d="M0 -21v-7" stroke={PALETTE.honey} strokeWidth={4} strokeLinecap="round" transform={`rotate(${i * 45})`} />
          ))}
        </g>
        <circle r={14} fill={PALETTE.honey} {...line} />
      </g>
      <Floor y={100} />
      <rect y={100} width={260} height={50} fill={PALETTE.honey} opacity={0.18} />
      {/* out in the sun: overheating, draining fast */}
      <Toy x={46} y={134} s={0.72} paint={RIVALS[2]} />
      <g stroke={PALETTE.coral} strokeWidth={2.4} fill="none" strokeLinecap="round" className="ta-glow">
        <path d="M30 78q4 -4 0 -8q-4 -4 0 -8M46 74q4 -4 0 -8q-4 -4 0 -8M62 78q4 -4 0 -8q-4 -4 0 -8" />
      </g>
      <Bar x={46} y={88} w={40} h={8} k={0.3} fill={PALETTE.coral} drain style={vars({ to: 0.1, t: '1.6s' })} />
      {/* under a roofed shelter: draining slowly; push a rival out of the way */}
      <Shelter x={196} y={136} w={86} />
      <Toy x={216} y={134} s={0.72} face={-1} />
      <Toy x={168} y={134} s={0.72} paint={RIVALS[0]} face={1} className="ta-knock" style={vars({ dx: -26, dy: 0, r: '0deg', t: '2.2s' })} />
      <Arrow x1={206} y1={88} x2={160} y2={88} w={3.5} head={10} />
      <Bar x={216} y={44} w={40} h={8} k={0.75} fill={PALETTE.sage} drain style={vars({ to: 0.85, t: '3s' })} />
      {touch ? <Stick x={112} y={34} r={19} kx={0.8} arrow /> : <MoveKeys x={112} y={32} s={0.62} arrows lit={['right']} />}
    </Art>
  );
}

export const MIDNIGHT_ART = {
  'midnight-drain': () => <Drain />,
  'midnight-night': () => <Night />,
  'midnight-night-touch': () => <Night touch />,
  'midnight-day': () => <Day />,
  'midnight-day-touch': () => <Day touch />,
};
