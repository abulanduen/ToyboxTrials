/** Spellbox Showdown: a three-spell build, damage that adds knockback, and a shrinking ring. */
import { PALETTE } from '../../game/palette';
import { Arrow, Art, Bar, Cross, Finger, INK, Key, Mouse, PillBtn, RIVALS, Sparkle, Tick, Toy, line, thin, vars } from './kit';

type Glyph = 'rocket' | 'marble' | 'ribbon' | 'fan' | 'pinwheel' | 'mine' | 'bubble' | 'stitch' | 'blink';

/** Small drawn spell marks in each spell's colour (spellbox/spells.ts). */
function SpellGlyph({ g }: { g: Glyph }) {
  switch (g) {
    case 'rocket':
      return (
        <g transform="rotate(-45)">
          <path d="M-8 -3.5H4Q10 0 4 3.5H-8z" fill={PALETTE.coral} {...thin} />
          <path d="M-8 -3.5l-3 -3v13l3 -3" fill={PALETTE.honey} {...thin} />
        </g>
      );
    case 'marble':
      return (
        <>
          <circle r={7} fill={PALETTE.toyBlue} {...thin} />
          <circle cx={-2.5} cy={-2.5} r={2.2} fill={PALETTE.white} />
        </>
      );
    case 'ribbon':
      return <path d="M-9 3q3 -9 6 0t6 0t6 -3" fill="none" stroke={PALETTE.inkPurple} strokeWidth={3.4} strokeLinecap="round" />;
    case 'fan':
      return <path d="M-7 5L7 -9A14 14 0 0 1 9 5z" fill={PALETTE.honey} {...thin} />;
    case 'pinwheel':
      return (
        <g fill={PALETTE.coral} {...thin}>
          {[0, 90, 180, 270].map((a) => (
            <path key={a} d="M0 0L0 -8L6 -5z" transform={`rotate(${a})`} />
          ))}
        </g>
      );
    case 'mine':
      return (
        <>
          <circle r={7.5} fill={PALETTE.brass} {...thin} />
          {[
            [-2.2, -2.2],
            [2.2, -2.2],
            [-2.2, 2.2],
            [2.2, 2.2],
          ].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={1.2} fill={INK} />
          ))}
        </>
      );
    case 'bubble':
      return (
        <>
          <circle r={7.5} fill={PALETTE.sage} fillOpacity={0.4} stroke={PALETTE.feltDark} strokeWidth={2} />
          <path d="M-4 -2a4.5 4.5 0 0 1 3 -3" fill="none" stroke={PALETTE.white} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case 'stitch':
      return (
        <>
          <path d="M-2.5 -8h5v5.5h5.5v5h-5.5v5.5h-5v-5.5h-5.5v-5h5.5z" fill={PALETTE.sage} {...thin} />
          <path d="M0 -5v10M-5 0h10" stroke={PALETTE.white} strokeWidth={1.2} strokeDasharray="2 1.5" />
        </>
      );
    case 'blink':
      return <path d="M-8 4l5 -7 3 5 7 -9M7 -7h-4M7 -7v4" fill="none" stroke={PALETTE.toyBlue} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />;
  }
}

function Orb({ x, y, g, picked = false, r = 12 }: { x: number; y: number; g: Glyph; picked?: boolean; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {picked && (
        <g className="ta-pulse">
          <circle r={r + 4} fill={PALETTE.honey} {...thin} />
        </g>
      )}
      <circle r={r} fill={PALETTE.white} {...thin} />
      <SpellGlyph g={g} />
    </g>
  );
}

const SLOTS: { key: string; offers: Glyph[]; pick: number }[] = [
  { key: 'Q', offers: ['rocket', 'marble', 'ribbon'], pick: 0 },
  { key: 'E', offers: ['fan', 'pinwheel', 'mine'], pick: 0 },
  { key: 'R', offers: ['bubble', 'stitch', 'blink'], pick: 2 },
];

function Draft() {
  return (
    <Art bg={PALETTE.inkPurple}>
      {SLOTS.map((s, i) => {
        const x = 48 + i * 82;
        return (
          <g key={s.key}>
            <rect x={x - 32} y={12} width={64} height={102} rx={9} fill={PALETTE.cream} {...line} />
            <Key x={x} y={28} k={s.key} />
            {s.offers.map((g, j) => (
              <Orb key={g} x={x - 12 + (j % 2) * 24} y={j < 2 ? 60 : 92} g={g} picked={j === s.pick} r={10} />
            ))}
          </g>
        );
      })}
      <Sparkle x={236} y={84} r={7} fill={PALETTE.honey} className="ta-pulse" />
      {/* lock it in */}
      <g transform="translate(78 134)">
        <rect x={-7} y={-5} width={14} height={11} rx={2} fill={PALETTE.brass} {...thin} />
        <path d="M-4 -5v-3a4 4 0 0 1 8 0v3" fill="none" {...thin} strokeWidth={2.2} />
      </g>
      <PillBtn x={136} y={132} w={92} h={24} label="Lock build" press />
    </Art>
  );
}

/** The round arena: wooden rim, felt floor. */
function Ring({ shrink = false }: { shrink?: boolean }) {
  return (
    <>
      <rect width={260} height={150} fill={PALETTE.cardboardDark} />
      <ellipse cx={130} cy={100} rx={122} ry={44} fill={PALETTE.woodMid} {...line} />
      <ellipse cx={130} cy={97} rx={112} ry={38} fill={PALETTE.felt} {...thin} />
      {shrink && (
        <g transform="translate(130 97)">
          <g className="ta-shrink" style={vars({ to: 0.72, t: '3s' })}>
            <ellipse rx={100} ry={33} fill="none" stroke={PALETTE.coral} strokeWidth={3} strokeDasharray="7 5" className="ta-blink" />
          </g>
        </g>
      )}
    </>
  );
}

function Push({ touch }: { touch?: boolean }) {
  return (
    <Art>
      <Ring />
      <Toy x={44} y={112} s={0.72} hold={<path d="M0 0L12 -10" stroke={PALETTE.woodDark} strokeWidth={3} strokeLinecap="round" />} />
      {/* little damage: a little shove */}
      <Toy x={124} y={96} s={0.66} paint={RIVALS[1]} face={-1} />
      <Bar x={124} y={50} w={30} h={7} k={0.25} fill={PALETTE.sage} />
      <Arrow x1={140} y1={70} x2={160} y2={70} w={3.5} head={9} />
      {/* lots of damage: sent flying */}
      <g transform="translate(70 0)">
        <Orb x={50} y={98} g="rocket" r={8} />
      </g>
      <Toy x={186} y={124} s={0.72} paint={RIVALS[0]} face={-1} className="ta-knock" style={vars({ dx: 40, dy: -30, r: '40deg', t: '2.2s' })} />
      <Bar x={186} y={76} w={30} h={7} k={0.95} fill={PALETTE.coral} />
      <Arrow x1={200} y1={100} x2={252} y2={78} w={4.5} color={PALETTE.coral} />
      {touch ? (
        <>
          {SLOTS.map((s, i) => (
            <g key={s.key} transform={`translate(${24 + i * 34} 22)`}>
              <circle r={14} cy={3} fill={INK} />
              <circle r={14} fill={PALETTE.cream} {...line} />
              <SpellGlyph g={s.offers[s.pick]} />
            </g>
          ))}
          <Finger x={24} y={22} />
          <Finger x={180} y={40} delay="0.8s" />
        </>
      ) : (
        <>
          <Key x={22} y={22} k="Q" press />
          <Key x={52} y={22} k="E" />
          <Key x={82} y={22} k="R" />
          <Mouse x={116} y={24} s={0.75} click />
        </>
      )}
    </Art>
  );
}

function Edge() {
  return (
    <Art>
      <Ring shrink />
      <Arrow x1={22} y1={97} x2={46} y2={97} w={3.5} head={9} color={PALETTE.coral} />
      <Arrow x1={130} y1={142} x2={130} y2={126} w={3.5} head={9} color={PALETTE.coral} />
      <Toy x={106} y={110} s={0.7} />
      <Tick x={106} y={56} s={0.7} />
      <Toy x={150} y={92} s={0.62} paint={RIVALS[1]} face={-1} />
      {/* over the edge: out */}
      <Toy x={232} y={140} s={0.7} paint={RIVALS[0]} out tilt={50} className="ta-knock" style={vars({ dx: 12, dy: 10, r: '30deg', t: '2.4s' })} />
      <Cross x={232} y={44} s={0.85} />
    </Art>
  );
}

export const SPELLBOX_ART = {
  'spellbox-draft': () => <Draft />,
  'spellbox-push': () => <Push />,
  'spellbox-push-touch': () => <Push touch />,
  'spellbox-ring': () => <Edge />,
};
