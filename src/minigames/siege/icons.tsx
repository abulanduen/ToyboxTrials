/**
 * Toybox Siege item icons: small, original, code-drawn SVGs (no emoji, no icon packs), one per
 * weapon, passive and card kind. Used on the level-up / treasure cards and the HUD's kit strip.
 * 24 × 24 view box, palette colours only, a dark outline so they read on any card colour.
 */
import type { ReactElement } from 'react';
import { PALETTE as P } from '../../game/palette';
import { TOY_COLOURS as C } from '../toysquad/models';
import type { EvoId, PassiveId, WeaponId } from './config';

export type SiegeIconId = WeaponId | PassiveId | 'horn' | 'evolve' | 'chest' | 'heal' | 'send' | 'arena' | 'laser' | 'flame' | 'boiler';

const S = { stroke: P.ink, strokeWidth: 1.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

const ICONS: Record<SiegeIconId, ReactElement> = {
  // ---- weapons
  sweep: <g {...S}>
    <path d="M4 17 A10 10 0 0 1 17 4" fill="none" stroke={P.white} strokeWidth={3.2} />
    <path d="M4 17 A10 10 0 0 1 17 4" fill="none" />
    <path d="M9 18l9-9l2.5-3.5l-3.5 2.5l-9 9z" fill={C.silver} />
    <path d="M7 16.5l3 3" />
    <path d="M5.5 20.5l2.5-2.5" stroke={P.woodMid} strokeWidth={2.4} />
  </g>,
  popgun: <g {...S}>
    <rect x={3} y={10} width={13} height={5} rx={1.5} fill={P.coral} />
    <path d="M6 15l-1.5 5h3.5l1.5-5z" fill={P.woodMid} />
    <path d="M16 9.5h2.5l1.5 1v4l-1.5 1H16z" fill={C.cork} />
    <path d="M21 8l1.5-1.5M21.5 12.5h1.5M21 17l1.5 1.5" />
  </g>,
  chime: <g {...S}>
    <path d="M12 3.5c-3.5 0-5 3-5 7v3.5l-2 3h14l-2-3V10.5c0-4-1.5-7-5-7z" fill={C.lilac} />
    <circle cx={12} cy={19.5} r={1.8} fill={P.honey} />
    <path d="M3 9.5a9 9 0 0 1 2-4M21 9.5a9 9 0 0 0-2-4" fill="none" />
  </g>,
  yoyo: <g {...S}>
    <circle cx={13} cy={14} r={6.5} fill={P.toyBlue} />
    <circle cx={13} cy={14} r={2.2} fill={P.honey} />
    <path d="M13 7.5V3" />
    <path d="M3.5 14a9.5 9.5 0 0 1 3-6.5" fill="none" strokeDasharray="1.6 1.8" />
  </g>,
  planes: <g {...S}>
    <path d="M2.5 12.5L21 5l-6.5 15l-3.5-5.5z" fill={P.white} />
    <path d="M11 14.5L21 5" fill="none" />
    <path d="M11 14.5l-1 5l3-3" fill={P.cream} />
  </g>,
  marbles: <g {...S}>
    <circle cx={8} cy={15} r={4.5} fill={C.glass} />
    <circle cx={16.5} cy={16} r={3.8} fill={P.coral} />
    <circle cx={12.5} cy={7.5} r={3.6} fill={P.sage} />
    <path d="M6.5 13.2a2 2 0 0 1 2-1M15.4 14.6a1.5 1.5 0 0 1 1.5-.8M11.4 6.2a1.4 1.4 0 0 1 1.4-.8" stroke={P.white} />
  </g>,
  // ---- passives
  plating: <g {...S}>
    <path d="M12 2.5l7.5 3v6c0 5-3.5 8.5-7.5 10c-4-1.5-7.5-5-7.5-10v-6z" fill={C.tin} />
    <path d="M12 6l4.5 2v3.5c0 3-2 5.2-4.5 6.3z" fill={P.white} strokeWidth={1} />
    <circle cx={7.5} cy={8} r={0.7} fill={P.ink} /><circle cx={7.5} cy={13} r={0.7} fill={P.ink} />
  </g>,
  crayon: <g {...S}>
    <path d="M5 19l11-11l3 3l-11 11h-3z" fill={P.coral} />
    <path d="M16 8l2.5-4.5l2 2l-1.5 5.5z" fill={C.cork} />
    <path d="M18.5 3.5l2 2" stroke={P.coral} strokeWidth={2} />
    <path d="M8 16l3 3M11 13l3 3" strokeWidth={1} />
  </g>,
  mainspring: <g {...S} fill="none">
    <path d="M12 12m-1.2 0a1.2 1.2 0 1 1 2.4 0a2.6 2.6 0 1 1-5.2 0a4 4 0 1 1 8 0a5.4 5.4 0 1 1-10.8 0a6.8 6.8 0 1 1 13.6 0" stroke={P.brass} strokeWidth={2.4} />
    <path d="M12 12m-1.2 0a1.2 1.2 0 1 1 2.4 0a2.6 2.6 0 1 1-5.2 0a4 4 0 1 1 8 0a5.4 5.4 0 1 1-10.8 0a6.8 6.8 0 1 1 13.6 0" strokeWidth={0.8} />
  </g>,
  magnifier: <g {...S}>
    <path d="M14.5 14.5l6 6" stroke={P.woodMid} strokeWidth={3.4} />
    <path d="M14.5 14.5l6 6" fill="none" strokeWidth={0.8} />
    <circle cx={10} cy={10} r={6.5} fill={C.sky} />
    <path d="M6.8 8.5a3.5 3.5 0 0 1 2.7-2.6" stroke={P.white} strokeWidth={1.6} fill="none" />
  </g>,
  gears: <g {...S}>
    <path d="M12 3l1.6 2.4l2.8-.7l.5 2.8l2.8.6l-.7 2.8L21 12l-2.4 1.6l.7 2.8l-2.8.5l-.6 2.8l-2.8-.7L12 21l-1.6-2.4l-2.8.7l-.5-2.8l-2.8-.6l.7-2.8L3 12l2.4-1.6l-.7-2.8l2.8-.5l.6-2.8l2.8.7z" fill={P.honey} />
    <circle cx={12} cy={12} r={3} fill={P.cream} />
  </g>,
  magnet: <g {...S}>
    <circle cx={12} cy={12} r={8.5} fill={C.wine} />
    <circle cx={12} cy={12} r={6} fill="none" strokeWidth={0.9} />
    <circle cx={9.8} cy={9.8} r={1.3} fill={P.cream} /><circle cx={14.2} cy={9.8} r={1.3} fill={P.cream} />
    <circle cx={9.8} cy={14.2} r={1.3} fill={P.cream} /><circle cx={14.2} cy={14.2} r={1.3} fill={P.cream} />
  </g>,
  // ---- secret upgrades with their own look
  /** Prism Ray: a toy ray gun and its beam. */
  laser: <g {...S}>
    <path d="M2.5 12h19.5" stroke={P.coral} strokeWidth={4.2} />
    <path d="M2.5 12h19.5" stroke={P.white} strokeWidth={1.4} />
    <path d="M3 8.5h8.5l2 2v3l-2 2H3z" fill={C.lilac} />
    <path d="M5 15.5l-1 4.5h3l1-4.5z" fill={P.woodMid} />
    <circle cx={7} cy={12} r={1.4} fill={P.honey} />
  </g>,
  /** Firebell Meteors: a meteor and the pool of flame it leaves. */
  flame: <g {...S}>
    <ellipse cx={12} cy={19} rx={9} ry={3} fill={P.coral} />
    <path d="M8 19c-1.5-3 1-5 2-7c.5 2 2 2.5 2 2.5c0-3 1.5-5 3-6.5c.5 3 3 5 1.5 11z" fill={P.honey} />
    <circle cx={17.5} cy={5.5} r={2.6} fill={C.lilac} />
    <path d="M15.6 7.4l-3 3M19.4 7.6l-1.6 2.2" fill="none" />
  </g>,
  /** Boiler Heart: a brass boiler with rivets flying out all round. */
  boiler: <g {...S}>
    <circle cx={12} cy={12} r={5.2} fill={P.brass} />
    <circle cx={12} cy={12} r={2} fill={P.coral} />
    <circle cx={12} cy={2.8} r={1.3} fill={P.honey} /><circle cx={12} cy={21.2} r={1.3} fill={P.honey} />
    <circle cx={2.8} cy={12} r={1.3} fill={P.honey} /><circle cx={21.2} cy={12} r={1.3} fill={P.honey} />
    <circle cx={5.5} cy={5.5} r={1.1} fill={P.honey} /><circle cx={18.5} cy={18.5} r={1.1} fill={P.honey} />
    <circle cx={18.5} cy={5.5} r={1.1} fill={P.honey} /><circle cx={5.5} cy={18.5} r={1.1} fill={P.honey} />
  </g>,
  // ---- card kinds
  horn: <g {...S}>
    <path d="M3 10.5h4l10-6v15l-10-6H3z" fill={P.honey} />
    <path d="M17 4.5c2.5 1.5 3.5 4.5 3.5 7.5s-1 6-3.5 7.5" fill={P.brass} />
    <path d="M5 13.5l1 5h2.5l-1-5" fill={P.woodMid} />
  </g>,
  evolve: <g {...S}>
    <path d="M12 2.5l2.7 6l6.5.6l-4.9 4.3l1.5 6.4L12 16.5l-5.8 3.3l1.5-6.4l-4.9-4.3l6.5-.6z" fill={P.honey} />
    <path d="M12 7l1.2 2.8l3 .3" fill="none" stroke={P.white} />
  </g>,
  chest: <g {...S}>
    <path d="M3.5 11h17v9h-17z" fill={P.woodMid} />
    <path d="M3.5 11c0-4 3.5-6.5 8.5-6.5s8.5 2.5 8.5 6.5z" fill={P.woodLight} />
    <path d="M3.5 13h17" stroke={P.brass} strokeWidth={2} />
    <rect x={10.3} y={11} width={3.4} height={4} rx={0.8} fill={P.brass} />
  </g>,
  heal: <g {...S}>
    <path d="M6 9h9v11H6z" fill={C.silver} />
    <path d="M15 11l5-4l1 1.5l-5 4.5z" fill={C.silver} />
    <path d="M8 9V6.5h5V9" fill={P.brass} />
    <path d="M10.5 12v5M8 14.5h5" stroke={P.coral} strokeWidth={1.8} />
  </g>,
  send: <g {...S}>
    <path d="M3 14h10v-4l8 7l-8 7v-4H3z" fill={P.coral} transform="translate(0 -5)" />
    <path d="M7 3.5v4" stroke={P.ink} strokeWidth={2} />
    <circle cx={7} cy={20} r={1.2} fill={P.ink} />
  </g>,
  arena: <g {...S}>
    <path d="M3 18l9-4l9 4l-9 4z" fill={P.coral} />
    <path d="M5 17V8M19 17V8M12 13.5V5" fill="none" stroke={P.woodMid} strokeWidth={2} />
    <path d="M5 10l7-3.5l7 3.5" fill="none" stroke={P.cream} strokeWidth={1.4} />
  </g>,
};

/** The icon of an evolved weapon or horn: the three the owner asked for have their own; the rest share the star. */
export const EVOLVED_ICON: Record<EvoId, SiegeIconId> = { sweep: 'evolve', popgun: 'laser', chime: 'flame', yoyo: 'evolve', planes: 'evolve', marbles: 'evolve', horn: 'boiler' };

/** A siege item icon, `size` px square. Decorative: the card or chip carries the name. */
export function SiegeIcon({ id, size = 24 }: { id: SiegeIconId; size?: number }) {
  return <svg className="siege-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONS[id]}</svg>;
}
