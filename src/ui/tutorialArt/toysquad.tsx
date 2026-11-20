/** Toy Squad: the shop, merging copies for stars, the formation board and the ten-round season. */
import { PALETTE, RARITY } from '../../game/palette';
import { TraitIcon } from '../../minigames/toysquad/TraitIcon';
import { Arrow, Art, INK, PillBtn, RIVALS, Sparkle, Star, Tick, Toy, line, thin, vars, YOU } from './kit';

function Coin({ x, y, r = 6 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill={PALETTE.honey} {...thin} />
      <circle r={r * 0.55} fill="none" stroke={PALETTE.brass} strokeWidth={1.6} />
    </g>
  );
}

/** A shop card: rarity-coloured frame, a toy, its price in coins. */
function Card({ x, y, rarity, paint, price }: { x: number; y: number; rarity: string; paint: { body: string; trim: string; accent: string }; price: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-22} y={-26} width={44} height={52} rx={6} fill={rarity} {...line} />
      <rect x={-17} y={-21} width={34} height={32} rx={3} fill={PALETTE.cream} {...thin} />
      <Toy x={0} y={8} s={0.5} paint={paint} keyTurn={false} />
      {Array.from({ length: price }, (_, i) => (
        <Coin key={i} x={(i - (price - 1) / 2) * 9} y={18} r={4} />
      ))}
    </g>
  );
}

function Shop() {
  return (
    <Art bg={PALETTE.feltDark}>
      <rect x={6} y={6} width={248} height={62} rx={8} fill={PALETTE.woodDark} {...line} />
      <Card x={40} y={37} rarity={RARITY.common} paint={RIVALS[3]} price={1} />
      <Card x={94} y={37} rarity={RARITY.uncommon} paint={RIVALS[1]} price={2} />
      <Card x={148} y={37} rarity={RARITY.rare} paint={YOU} price={3} />
      {/* reroll */}
      <g transform="translate(210 37)">
        <circle r={20} fill={PALETTE.cream} {...line} />
        <g className="ta-spin" style={vars({ t: '3s' })}>
          <path d="M-9 -3a10 10 0 0 1 17 -4M9 3a10 10 0 0 1 -17 4" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <path d="M11 -12l-1 8 -7 -3zM-11 12l1 -8 7 3z" fill={INK} />
        </g>
      </g>
      {/* reserve bench */}
      <rect x={6} y={104} width={248} height={40} rx={6} fill={PALETTE.woodMid} {...line} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={14 + i * 40} y={110} width={34} height={28} rx={4} fill={PALETTE.felt} {...thin} />
      ))}
      <Toy x={31} y={136} s={0.5} paint={RIVALS[0]} />
      {/* buy: card down to the bench */}
      <Arrow x1={148} y1={70} x2={151} y2={108} w={4} />
      <Toy x={151} y={136} s={0.5} className="ta-pop" style={vars({ t: '2.4s' })} />
      {/* sell: a toy back onto the shop, coins back */}
      <Arrow x1={44} y1={100} x2={70} y2={72} bend={-10} color={PALETTE.coral} w={4} />
      <g className="ta-bob">
        <Coin x={84} y={86} r={6} />
        <Coin x={97} y={90} r={6} />
      </g>
    </Art>
  );
}

function Merge() {
  return (
    <Art bg={PALETTE.feltDark}>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={10 + i * 44} y={56} width={38} height={60} rx={6} fill={PALETTE.felt} {...thin} />
          <g className="ta-merge" style={vars({ dx: 44 - i * 44, dy: 0, t: '2.6s' })}>
            <Toy x={29 + i * 44} y={104} s={0.62} paint={RIVALS[1]} />
            <Star x={29 + i * 44} y={44} r={7} />
          </g>
        </g>
      ))}
      <Arrow x1={148} y1={86} x2={176} y2={86} w={5} />
      <g transform="translate(214 0)">
        <rect x={-34} y={20} width={68} height={112} rx={8} fill={PALETTE.felt} {...line} />
        <g className="ta-pop" style={vars({ t: '2.6s', d: '0.6s' })}>
          <Toy x={0} y={120} s={1.2} paint={RIVALS[1]} />
        </g>
        <Star x={-10} y={34} r={9} />
        <Star x={10} y={34} r={9} />
        <Sparkle x={-26} y={60} r={6} className="ta-pulse" />
        <Sparkle x={26} y={84} r={5} className="ta-pulse" style={vars({ d: '-0.5s' })} />
      </g>
    </Art>
  );
}

const BCW = 21;
const BCH = 15;
function Formation() {
  const bx = 10;
  const by = 22;
  const at = (c: number, r: number) => ({ x: bx + c * BCW + BCW / 2, y: by + r * BCH + BCH / 2 + 3 });
  const a = at(2, 2);
  const b = at(4, 1);
  return (
    <Art bg={PALETTE.inkPurple}>
      <rect x={bx - 5} y={by - 5} width={8 * BCW + 10} height={4 * BCH + 10} rx={5} fill={PALETTE.woodDark} {...line} />
      {Array.from({ length: 32 }, (_, i) => (
        <rect key={i} x={bx + (i % 8) * BCW + 1} y={by + Math.floor(i / 8) * BCH + 1} width={BCW - 2} height={BCH - 2} rx={2} fill={(i + Math.floor(i / 8)) % 2 ? PALETTE.felt : PALETTE.feltDark} />
      ))}
      {/* two toys that share a trait light each other up */}
      <path d={`M${a.x} ${a.y - 12}L${b.x} ${b.y - 12}`} stroke={PALETTE.honey} strokeWidth={5} strokeLinecap="round" className="ta-glow" />
      <Toy {...at(2, 2)} s={0.4} paint={RIVALS[1]} />
      <Toy {...at(4, 1)} s={0.4} paint={YOU} />
      <Toy {...at(6, 3)} s={0.4} paint={RIVALS[3]} />
      <g transform={`translate(${a.x - 8} ${a.y - 40})`}>
        <TraitIcon trait="Vanguard" size={16} />
      </g>
      <g transform={`translate(${b.x - 8} ${b.y - 40})`}>
        <TraitIcon trait="Vanguard" size={16} />
      </g>
      {/* drag one up from the reserve */}
      <rect x={bx - 5} y={by + 4 * BCH + 14} width={8 * BCW + 10} height={30} rx={5} fill={PALETTE.woodMid} {...line} />
      <Toy x={bx + 1.5 * BCW} y={by + 4 * BCH + 40} s={0.4} paint={RIVALS[0]} />
      <Arrow x1={bx + 1.5 * BCW + 8} y1={by + 4 * BCH + 14} x2={at(1, 3).x + 4} y2={at(1, 3).y - 2} bend={-12} w={3.5} head={9} />
      {/* trait bonuses at the side */}
      <rect x={190} y={16} width={64} height={70} rx={6} fill={PALETTE.cream} {...line} />
      <g transform="translate(196 22)">
        <TraitIcon trait="Vanguard" size={22} />
      </g>
      {[0, 1].map((i) => (
        <circle key={i} cx={228 + i * 11} cy={33} r={4} fill={PALETTE.honey} {...thin} />
      ))}
      <g transform="translate(196 54)">
        <TraitIcon trait="Clockwork" size={22} />
      </g>
      <circle cx={228} cy={65} r={4} fill={PALETTE.honey} {...thin} />
      <circle cx={239} cy={65} r={4} fill={PALETTE.cream} {...thin} />
      <PillBtn x={222} y={128} w={58} h={26} label="Ready" press />
    </Art>
  );
}

function Rounds() {
  return (
    <Art bg={PALETTE.feltDark}>
      <path d="M20 34H222" stroke={PALETTE.cream} strokeWidth={4} strokeLinecap="round" />
      {Array.from({ length: 10 }, (_, i) => {
        const x = 20 + i * 22;
        const pick = i === 2 || i === 5 || i === 8;
        return (
          <g key={i} transform={`translate(${x} 34)`}>
            <circle r={pick ? 9 : 6.5} fill={i < 4 ? PALETTE.honey : PALETTE.cream} {...line} />
            {pick && <path d="M-4 -4h8v8h-8z" fill={PALETTE.coral} stroke={INK} strokeWidth={1.2} />}
          </g>
        );
      })}
      {/* trophy for the most points */}
      <g transform="translate(244 34)">
        <path d="M-9 -12h18v6a9 9 0 0 1 -18 0z" fill={PALETTE.honey} {...line} />
        <path d="M-9 -9h-4v3a4 4 0 0 0 4 4M9 -9h4v3a4 4 0 0 1 -4 4" fill="none" {...thin} />
        <path d="M-2 3h4v5h-4zM-7 8h14v4h-14z" fill={PALETTE.brass} {...thin} />
      </g>
      {/* a win is worth three, a draw one */}
      <rect x={10} y={62} width={110} height={34} rx={8} fill={PALETTE.felt} {...line} />
      <Tick x={30} y={79} s={0.9} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={60 + i * 18} cy={79} r={6} fill={PALETTE.honey} {...thin} />
      ))}
      <rect x={10} y={104} width={110} height={34} rx={8} fill={PALETTE.felt} {...line} />
      <g transform="translate(30 121)">
        <circle r={11} fill={PALETTE.cream} stroke={INK} strokeWidth={2.2} />
        <path d="M-5 -3h10M-5 3h10" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      </g>
      <circle cx={60} cy={121} r={6} fill={PALETTE.honey} {...thin} />
      {/* rounds 3, 6 and 9: pick one of three passive bonuses */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${160 + i * 32} ${104 - (i === 1 ? 6 : 0)}) rotate(${(i - 1) * 8})`}>
          <rect x={-14} y={-24} width={28} height={44} rx={5} fill={i === 1 ? PALETTE.honey : PALETTE.cream} {...line} />
          <Star x={0} y={-4} r={8} fill={i === 1 ? PALETTE.white : PALETTE.sage} />
        </g>
      ))}
      <Arrow x1={64} y1={46} x2={150} y2={74} bend={-14} w={3} head={8} color={PALETTE.coral} dashed />
    </Art>
  );
}

export const TOYSQUAD_ART = {
  'toysquad-shop': () => <Shop />,
  'toysquad-merge': () => <Merge />,
  'toysquad-formation': () => <Formation />,
  'toysquad-rounds': () => <Rounds />,
};
