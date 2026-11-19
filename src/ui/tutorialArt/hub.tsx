/**
 * The Playroom Hub controls for the main menu's How to play sheet: each picture shows the
 * keyboard-and-mouse control on the left, the touch control on the right, and the toy between.
 */
import type { ReactNode } from 'react';
import { PALETTE, ROOM } from '../../game/palette';
import { Arrow, Art, Finger, INK, Key, Mouse, MoveKeys, SpeedLines, Stick, TapBtn, Toy, line, thin, vars } from './kit';

function Panels({ left, right, children }: { left: ReactNode; right: ReactNode; children: ReactNode }) {
  return (
    <Art bg={ROOM.wallUpper}>
      <rect y={100} width={260} height={50} fill={PALETTE.woodLight} />
      <rect x={6} y={8} width={76} height={134} rx={10} fill={PALETTE.white} fillOpacity={0.75} {...thin} />
      <rect x={178} y={8} width={76} height={134} rx={10} fill={PALETTE.white} fillOpacity={0.75} {...thin} />
      {left}
      {right}
      {children}
    </Art>
  );
}

function Move() {
  return (
    <Panels
      left={
        <>
          <MoveKeys x={44} y={50} s={0.78} lit={['W']} press />
          <Key x={44} y={106} k="Shift" w={58} fs={13} />
        </>
      }
      right={<Stick x={216} y={76} r={28} kx={0} ky={-1} arrow className="ta-push" style={vars({ dx: 0, dy: -4 })} />}
    >
      <SpeedLines x={128} y={124} s={0.85} />
      <Toy x={128} y={124} s={0.85} className="ta-bob" style={vars({ t: '0.35s' })} />
    </Panels>
  );
}

function Look() {
  return (
    <Panels
      left={
        <>
          <Mouse x={44} y={76} s={1.1} />
          <Arrow x1={30} y1={34} x2={58} y2={34} bend={-8} w={3.5} head={9} />
          <Arrow x1={58} y1={118} x2={30} y2={118} bend={-8} w={3.5} head={9} />
        </>
      }
      right={
        <>
          <Arrow x1={196} y1={50} x2={238} y2={50} w={3.5} head={9} />
          <g className="ta-slide" style={vars({ dx: 20, dy: 0, t: '1.6s' })}>
            <Finger x={198} y={74} anim="none" />
          </g>
        </>
      }
    >
      {/* the camera swings round the toy */}
      <ellipse cx={130} cy={112} rx={40} ry={14} fill="none" stroke={PALETTE.honey} strokeWidth={3} strokeDasharray="6 5" />
      <Toy x={130} y={118} s={0.85} />
      <g transform="translate(166 100)">
        <g className="ta-bob">
          <rect x={-9} y={-7} width={18} height={14} rx={3} fill={PALETTE.inkPurple} {...line} />
          <circle r={4} fill={PALETTE.roomSky} {...thin} />
          <rect x={-5} y={-11} width={7} height={4} rx={1} fill={INK} />
        </g>
      </g>
    </Panels>
  );
}

function Jump() {
  return (
    <Panels left={<Key x={44} y={76} k="Space" w={64} press />} right={<TapBtn x={216} y={76} r={26} label="Jump" fs={13} press />}>
      <path d="M104 118q26 -64 52 0" fill="none" stroke={PALETTE.white} strokeWidth={2.5} strokeDasharray="4 5" strokeLinecap="round" />
      <rect x={122} y={110} width={16} height={12} rx={2} fill={PALETTE.coral} {...line} />
      <Toy x={104} y={124} s={0.7} className="ta-hop" style={vars({ dx: 52, dy: -40, t: '2s' })} />
    </Panels>
  );
}

function Interact() {
  return (
    <Panels left={<Key x={44} y={76} k="E" w={30} press />} right={<TapBtn x={216} y={76} r={24} label="Enter" fs={11} fill={PALETTE.coral} press />}>
      {/* a trial gate */}
      <path d="M100 124V62a30 30 0 0 1 60 0v62" fill="none" stroke={PALETTE.woodMid} strokeWidth={10} />
      <path d="M100 124V62a30 30 0 0 1 60 0v62" fill="none" stroke={INK} strokeWidth={1.6} />
      <rect x={112} y={22} width={36} height={14} rx={3} fill={PALETTE.honey} {...line} />
      <path d="M110 124V64a20 20 0 0 1 40 0v60z" fill={PALETTE.inkPurple} opacity={0.5} />
      <Toy x={130} y={126} s={0.8} className="ta-bob" />
      <g className="ta-pulse">
        <circle cx={130} cy={50} r={8} fill={PALETTE.coral} {...thin} />
        <circle cx={130} cy={50} r={3} fill={PALETTE.white} />
      </g>
    </Panels>
  );
}

export const HUB_ART = {
  'hub-move': () => <Move />,
  'hub-look': () => <Look />,
  'hub-jump': () => <Jump />,
  'hub-interact': () => <Interact />,
};
