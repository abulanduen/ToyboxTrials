/** Inferno Escape: a field of cardboard blocks, one blue wall each, and the wind-up furnace. */
import type { ReactNode } from 'react';
import { PALETTE } from '../../game/palette';
import { Arrow, Art, Cross, INK, Key, MoveKeys, PillBtn, RIVALS, SpeedLines, Stick, Stopwatch, TapBtn, Toy, line, thin, vars } from './kit';

type Tile = 'rock' | 'floor' | 'wall';
const CW = 24;
const CH = 21;
const LIFT = 8;

/** A board of tiles seen from above and in front; `at(c, r)` gives each tile. */
function Board({ x, y, cols, rows, at, glow, fade, children }: { x: number; y: number; cols: number; rows: number; at: (c: number, r: number) => Tile; glow?: [number, number]; fade?: [number, number]; children?: ReactNode }) {
  const tiles: ReactNode[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const t = at(c, r);
      if (t === 'floor') continue;
      const px = x + c * CW;
      const py = y + r * CH;
      const top = t === 'wall' ? PALETTE.toyBlue : PALETTE.cardboard;
      const front = t === 'wall' ? PALETTE.toyBlue : PALETTE.cardboardDark;
      const isGlow = glow && glow[0] === c && glow[1] === r;
      const isFade = fade && fade[0] === c && fade[1] === r;
      tiles.push(
        <g key={`${c}-${r}`} className={isFade ? 'ta-fade' : undefined}>
          <rect x={px + 1} y={py + CH - LIFT} width={CW - 2} height={LIFT} fill={front} {...thin} />
          {t === 'wall' && <rect x={px + 1} y={py + CH - LIFT} width={CW - 2} height={LIFT} fill={INK} opacity={0.25} />}
          <rect x={px + 1} y={py - LIFT + 1} width={CW - 2} height={CH - 2} rx={2} fill={top} {...thin} />
          {isGlow && <rect x={px + 1} y={py - LIFT + 1} width={CW - 2} height={CH - 2} rx={2} fill={PALETTE.coral} className="ta-blink" />}
          {isFade && <path d={`M${px + 6} ${py - 3}l5 5 -2 4 5 3`} fill="none" {...thin} />}
        </g>,
      );
    }
  return (
    <>
      <rect x={x - 6} y={y - LIFT - 5} width={cols * CW + 12} height={rows * CH + LIFT + 10} rx={5} fill={PALETTE.woodDark} {...line} />
      <rect x={x} y={y - LIFT + 1} width={cols * CW} height={rows * CH + LIFT - 2} fill={PALETTE.feltDark} />
      {tiles}
      {children}
    </>
  );
}

/** Feet position of a toy standing on tile (c, r). */
const cell = (x: number, y: number, c: number, r: number) => ({ x: x + c * CW + CW / 2, y: y + r * CH + CH / 2 - 1 });

/** The honey target ring on the tile you face. */
function Target({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ta-pulse">
        <path d="M0 -11L13 -2L0 7L-13 -2z" fill="none" stroke={PALETTE.honey} strokeWidth={3} strokeLinejoin="round" />
      </g>
    </g>
  );
}

function Furnace({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 1].map((i) => (
        <g key={i} className="ta-slide" style={vars({ dx: 4, dy: -16, t: '1.6s', d: `${i * 0.8}s` })}>
          <circle cx={4} cy={-36} r={4 + i} fill={PALETTE.cream} opacity={0.8} />
        </g>
      ))}
      <rect x={1} y={-34} width={7} height={10} rx={1.5} fill={PALETTE.brass} {...thin} />
      <rect x={-12} y={-26} width={24} height={26} rx={4} fill={PALETTE.coral} {...line} />
      <rect x={-8} y={-17} width={16} height={11} rx={3} fill={INK} />
      <rect x={-6} y={-15} width={12} height={7} rx={2} fill={PALETTE.honey} className="ta-glow" />
      <circle cx={-8} cy={-22} r={1.6} fill={PALETTE.brass} />
      <circle cx={8} cy={-22} r={1.6} fill={PALETTE.brass} />
    </g>
  );
}

const BX = 8;
const BY = 30;
/** Rocks everywhere but a 3×3 clearing at columns 3–5, rows 1–3. */
const field = (c: number, r: number): Tile => (c >= 2 && c <= 4 && r >= 1 && r <= 3 ? 'floor' : 'rock');

function Dig({ touch }: { touch?: boolean }) {
  const me = cell(BX, BY, 4, 2);
  const t = cell(BX, BY, 5, 2);
  return (
    <Art bg={PALETTE.woodLight}>
      <Board x={BX} y={BY} cols={8} rows={5} at={field} fade={[5, 2]}>
        <Toy {...cell(BX, BY, 2, 1)} s={0.6} paint={RIVALS[0]} />
        <Toy {...cell(BX, BY, 3, 3)} s={0.6} paint={RIVALS[1]} />
        <Toy {...me} s={0.66} />
        <Target x={t.x} y={t.y - 3} />
      </Board>
      {touch ? (
        <>
          <Stick x={230} y={108} r={18} kx={0.8} arrow />
          <TapBtn x={232} y={44} r={20} label="Break" fs={10} press />
        </>
      ) : (
        <>
          <Key x={232} y={40} k="Space" w={46} fs={12} press />
          <MoveKeys x={232} y={104} s={0.6} lit={['D']} />
        </>
      )}
    </Art>
  );
}

function Wall({ touch }: { touch?: boolean }) {
  const at = (c: number, r: number): Tile => (c === 5 && r === 2 ? 'floor' : field(c, r));
  return (
    <Art bg={PALETTE.woodLight}>
      <Board x={BX} y={BY} cols={8} rows={5} at={at}>
        <Toy {...cell(BX, BY, 3, 2)} s={0.66} />
        {/* the one wall, dropped in front */}
        <g className="ta-pop" style={vars({ t: '2.4s' })}>
          <rect x={BX + 4 * CW + 1} y={BY + 2 * CH + CH - LIFT} width={CW - 2} height={LIFT} fill={PALETTE.toyBlue} {...thin} />
          <rect x={BX + 4 * CW + 1} y={BY + 2 * CH + CH - LIFT} width={CW - 2} height={LIFT} fill={INK} opacity={0.25} />
          <rect x={BX + 4 * CW + 1} y={BY + 2 * CH - LIFT + 1} width={CW - 2} height={CH - 2} rx={2} fill={PALETTE.toyBlue} {...thin} />
        </g>
        {/* never a second one */}
        <rect x={BX + 2 * CW + 2} y={BY + 1 * CH - LIFT + 2} width={CW - 4} height={CH - 4} rx={2} fill="none" stroke={PALETTE.toyBlue} strokeWidth={2.5} strokeDasharray="4 3" />
        <Cross x={BX + 2 * CW + CW / 2} y={BY + CH - 4} s={0.6} />
      </Board>
      <Stopwatch x={232} y={42} r={13} used={0.6} />
      {touch ? <PillBtn x={226} y={104} w={60} h={34} label="Build wall" fs={9.5} press /> : <Key x={232} y={104} k="R" w={30} press />}
    </Art>
  );
}

function Hunt() {
  const X = 10;
  const Y = BY + 2;
  const at = (c: number, r: number): Tile => {
    if (r === 2 && c >= 1 && c <= 8 && c !== 4) return 'floor';
    if (c === 8 && r === 1) return 'wall';
    if (c === 6 && r === 3) return 'floor';
    return 'rock';
  };
  const f = cell(X, Y, 3, 2);
  const me = cell(X, Y, 7, 2);
  return (
    <Art bg={PALETTE.woodLight}>
      <Board x={X} y={Y} cols={10} rows={5} at={at} glow={[4, 2]}>
        <Toy {...cell(X, Y, 1, 2)} s={0.6} paint={RIVALS[0]} out tilt={-80} />
        <Furnace x={f.x} y={f.y + 2} />
        <Arrow x1={f.x + 6} y1={f.y - 38} x2={me.x - 8} y2={me.y - 34} bend={-14} color={PALETTE.coral} w={3.5} head={10} />
        <SpeedLines x={me.x} y={me.y} s={0.6} />
        <Toy {...me} s={0.62} className="ta-bob" style={vars({ t: '0.4s' })} />
      </Board>
    </Art>
  );
}

export const INFERNO_ART = {
  'inferno-dig': () => <Dig />,
  'inferno-dig-touch': () => <Dig touch />,
  'inferno-wall': () => <Wall />,
  'inferno-wall-touch': () => <Wall touch />,
  'inferno-hunt': () => <Hunt />,
};
