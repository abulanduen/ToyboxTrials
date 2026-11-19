/**
 * Card art for every catalogue item: original inline SVG drawings (no icon packs, no emoji), in
 * the same chunky ink-outlined style as icons.tsx. Shared by the shop, the Workshop and the touch
 * Emote menu. Each drawing echoes its 3D model in src/character/.
 */
import type { ReactNode } from 'react';
import { PAINT_JOBS } from '../game/palette';
import { itemById } from '../game/cosmetics';
import type { EmoteId } from '../game/emotes';
import { HatIcon, KeySkinIcon, TickerBadge } from './icons';

const INK = '#2B2433';
const o = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      {children}
    </svg>
  );
}

/** The cog currency mark: a small brass gear. */
export function CogIcon({ size = 20 }: { size?: number }) {
  const teeth = Array.from({ length: 8 }, (_, i) => <rect key={i} x="20.5" y="3" width="7" height="9" rx="1.5" fill="#E2B24A" stroke={INK} strokeWidth="2.2" transform={`rotate(${i * 45} 24 24)`} />);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="cog-icon">
      {teeth}
      <circle cx="24" cy="24" r="14" fill="#E2B24A" stroke={INK} strokeWidth="2.5" />
      <circle cx="24" cy="24" r="5" fill="#FFF9EE" stroke={INK} strokeWidth="2.2" />
    </svg>
  );
}

function hat(id: string, size: number) {
  switch (id) {
    case 'partycone':
      return (
        <Svg size={size}>
          <circle cx="24" cy="38" r="8" fill="#6BA7C8" {...o} />
          <path d="M14 31 L25 6 L34 31 Z" fill="#E76B62" {...o} />
          <path d="M18 22 L30 22 M16 27 L32 27" stroke="#F4E8CE" strokeWidth="3" />
          <circle cx="25" cy="6" r="4" fill="#EFAE45" {...o} />
        </Svg>
      );
    case 'reeltop':
      return (
        <Svg size={size}>
          <circle cx="24" cy="38" r="8" fill="#6BA7C8" {...o} />
          <rect x="10" y="27" width="28" height="5" rx="2" fill="#D9A86C" {...o} />
          <rect x="15" y="11" width="18" height="16" fill="#6BA7C8" {...o} />
          <path d="M15 16 H33 M15 21 H33" stroke="#4E7F9E" strokeWidth="1.6" />
          <rect x="11" y="6" width="26" height="5" rx="2" fill="#D9A86C" {...o} />
        </Svg>
      );
    case 'propeller':
      return (
        <Svg size={size}>
          <circle cx="24" cy="38" r="8" fill="#6BA7C8" {...o} />
          <path d="M11 31 Q11 17 24 17 Q37 17 37 31 Z" fill="#6BA7C8" {...o} />
          <path d="M24 17 Q37 17 37 31 L24 31 Z" fill="#EFAE45" {...o} />
          <line x1="24" y1="17" x2="24" y2="10" {...o} />
          <path d="M8 9 Q16 6 24 10 Q32 14 40 11" fill="none" stroke="#E76B62" strokeWidth="4" strokeLinecap="round" />
        </Svg>
      );
    case 'laurel':
      return (
        <Svg size={size}>
          <circle cx="24" cy="36" r="10" fill="#6BA7C8" {...o} />
          {[-1, 1].map((side) =>
            [0, 1, 2, 3].map((i) => (
              <ellipse key={`${side}${i}`} cx={24 + side * (14 - i * 1.5)} cy={30 - i * 5} rx="3" ry="5.5" fill={i % 2 ? '#89B78A' : '#5F8A5C'} {...o} strokeWidth={1.8} transform={`rotate(${side * (40 - i * 12)} ${24 + side * (14 - i * 1.5)} ${30 - i * 5})`} />
            )),
          )}
          <circle cx="24" cy="25" r="3" fill="#F2C14E" {...o} strokeWidth={1.8} />
        </Svg>
      );
    default:
      return <HatIcon id={id} size={size} />;
  }
}

function key(id: string, size: number) {
  const shaft = <rect x="21" y="26" width="6" height="18" rx="2" fill="#C8973A" {...o} />;
  switch (id) {
    case 'clover':
      return (
        <Svg size={size}>
          {shaft}
          {[
            [17, 11],
            [31, 11],
            [17, 24],
            [31, 24],
          ].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="7" fill="#89B78A" {...o} />
          ))}
          <circle cx="24" cy="17.5" r="3.5" fill="#5F8A5C" {...o} strokeWidth={1.8} />
        </Svg>
      );
    case 'moon':
      return (
        <Svg size={size}>
          {shaft}
          <path d="M28 4 A13 13 0 0 0 28 30 A15 15 0 0 1 28 4 Z" fill="#F4E8CE" {...o} />
          <path d="M36 8 l1.2 2.4 2.4 1.2 -2.4 1.2 -1.2 2.4 -1.2 -2.4 -2.4 -1.2 2.4 -1.2z" fill="#EFAE45" />
        </Svg>
      );
    case 'gear': {
      const teeth = Array.from({ length: 8 }, (_, i) => <rect key={i} x="21" y="2" width="6" height="7" rx="1" fill="#9AA3A8" {...o} strokeWidth={2} transform={`rotate(${i * 45} 24 17)`} />);
      return (
        <Svg size={size}>
          {shaft}
          {teeth}
          <circle cx="24" cy="17" r="11" fill="#9AA3A8" {...o} />
          <circle cx="24" cy="17" r="4" fill="#FFF9EE" {...o} strokeWidth={2} />
        </Svg>
      );
    }
    default:
      return <KeySkinIcon id={id} size={size} />;
  }
}

function accessory(id: string, size: number) {
  switch (id) {
    case 'backpack':
      return (
        <Svg size={size}>
          <path d="M16 12 Q16 6 24 6 Q32 6 32 12" fill="none" {...o} />
          <rect x="10" y="12" width="28" height="30" rx="7" fill="#B9824A" {...o} />
          <path d="M10 22 Q10 14 17 14 H31 Q38 14 38 22 Z" fill="#7E5332" {...o} />
          <circle cx="18" cy="32" r="4" fill="#E76B62" {...o} strokeWidth={2} />
          <circle cx="30" cy="32" r="4" fill="#EFAE45" {...o} strokeWidth={2} />
        </Svg>
      );
    case 'balloon':
      return (
        <Svg size={size}>
          <path d="M24 32 Q20 38 24 42 Q28 45 25 47" fill="none" {...o} strokeWidth={2} />
          <ellipse cx="24" cy="18" rx="12" ry="14" fill="#E76B62" {...o} />
          <path d="M21 32 L24 29 L27 32 Z" fill="#E76B62" {...o} strokeWidth={2} />
          <ellipse cx="19" cy="12" rx="2.5" ry="4" fill="#FFE3DA" />
        </Svg>
      );
    case 'cape':
      return (
        <Svg size={size}>
          <path d="M14 8 H34 L42 42 Q24 46 6 42 Z" fill="#B8434A" {...o} />
          <rect x="11" y="5" width="26" height="7" rx="3" fill="#B8434A" {...o} />
          <circle cx="15" cy="9" r="2.5" fill="#EFAE45" {...o} strokeWidth={1.6} />
          <circle cx="33" cy="9" r="2.5" fill="#EFAE45" {...o} strokeWidth={1.6} />
          <path d="M18 14 L14 40 M30 14 L34 40" stroke="#8E2F36" strokeWidth="2" />
        </Svg>
      );
    case 'wings':
      return (
        <Svg size={size}>
          {[-1, 1].map((s) => (
            <path key={s} d={`M24 26 Q${24 + s * 6} 8 ${24 + s * 20} 8 Q${24 + s * 20} 20 ${24 + s * 13} 25 Q${24 + s * 18} 33 ${24 + s * 9} 36 Q${24 + s * 3} 34 24 26 Z`} fill="#FFF9EE" {...o} />
          ))}
          <path d="M28 22 L40 11 M20 22 L8 11" stroke="#C9BBA2" strokeWidth="1.6" />
        </Svg>
      );
    case 'monocle':
      return (
        <Svg size={size}>
          <circle cx="20" cy="20" r="13" fill="#CFE8F5" {...o} />
          <circle cx="20" cy="20" r="13" fill="none" stroke="#C8973A" strokeWidth="4" />
          <circle cx="20" cy="20" r="15" fill="none" stroke={INK} strokeWidth="1.6" />
          <path d="M15 14 Q18 12 21 13" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M31 28 Q36 36 40 44" fill="none" stroke="#C8973A" strokeWidth="2.5" strokeDasharray="1 3.2" strokeLinecap="round" />
        </Svg>
      );
    case 'goggles':
      return (
        <Svg size={size}>
          <rect x="3" y="20" width="42" height="8" rx="3" fill="#7E5332" {...o} />
          <circle cx="24" cy="24" r="15" fill="#C8973A" {...o} />
          <circle cx="24" cy="24" r="10.5" fill="#6BA7C8" {...o} />
          <path d="M19 19 Q22 17 25 18" stroke="#DDEFF8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </Svg>
      );
    case 'moustache':
      return (
        <Svg size={size}>
          <path d="M24 22 Q18 14 10 20 Q5 24 4 18 Q2 30 12 30 Q20 30 24 25 Q28 30 36 30 Q46 30 44 18 Q43 24 38 20 Q30 14 24 22 Z" fill="#7E5332" {...o} />
        </Svg>
      );
    case 'beadnose':
      return (
        <Svg size={size}>
          <circle cx="24" cy="24" r="14" fill="#E76B62" {...o} />
          <ellipse cx="19" cy="18" rx="4" ry="3" fill="#FFF" />
        </Svg>
      );
    case 'bowtie':
      return (
        <Svg size={size}>
          <path d="M24 24 L6 12 L6 36 Z" fill="#6BA7C8" {...o} />
          <path d="M24 24 L42 12 L42 36 Z" fill="#6BA7C8" {...o} />
          <rect x="19" y="18" width="10" height="12" rx="4" fill="#4E86A8" {...o} />
        </Svg>
      );
    case 'scarf':
      return (
        <Svg size={size}>
          <path d="M6 14 Q24 24 42 14 L42 22 Q24 32 6 22 Z" fill="#EFAE45" {...o} />
          <path d="M14 24 L12 44 L22 44 L22 27 Z" fill="#EFAE45" {...o} />
          <path d="M12.6 33 H22 M12.2 38 H22" stroke="#E76B62" strokeWidth="3" />
        </Svg>
      );
    case 'bellcollar':
      return (
        <Svg size={size}>
          <path d="M5 12 Q24 24 43 12 L43 18 Q24 30 5 18 Z" fill="#E76B62" {...o} />
          <circle cx="24" cy="33" r="9" fill="#E2B24A" {...o} />
          <path d="M18 35 H30" {...o} />
          <circle cx="24" cy="23" r="2.5" fill="none" {...o} strokeWidth={2} />
        </Svg>
      );
    case 'medal':
      return (
        <Svg size={size}>
          <path d="M12 4 L21 24 L27 24 L18 4 Z" fill="#6BA7C8" {...o} strokeWidth={2} />
          <path d="M36 4 L27 24 L21 24 L30 4 Z" fill="#E76B62" {...o} strokeWidth={2} />
          <path
            d={Array.from({ length: 20 }, (_, i) => {
              const a = (i / 20) * Math.PI * 2;
              const r = i % 2 ? 11 : 13;
              return `${i ? 'L' : 'M'}${(24 + Math.cos(a) * r).toFixed(1)} ${(33 + Math.sin(a) * r).toFixed(1)}`;
            }).join(' ') + ' Z'}
            fill="#F2C14E"
            {...o}
          />
          <path d="M24 27 l1.8 3.6 4 .5 -2.9 2.8 .7 4 -3.6 -1.9 -3.6 1.9 .7 -4 -2.9 -2.8 4 -.5z" fill="#E76B62" />
        </Svg>
      );
    default:
      return null;
  }
}

/** Little drawn glyphs for the gestures (emote buttons, shop cards). */
export function GestureGlyph({ id, size = 26 }: { id: EmoteId; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: INK, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (id) {
    case 'wave':
      return (
        <svg {...common}>
          <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.6 0-4.2-1.4-5.4-3.6L4 13.6a1.4 1.4 0 0 1 2.4-1.4L8 14.5" />
          <path d="M19.5 4.5c1 1 1.5 2.2 1.5 3.5M3 7.5c0-1.3.5-2.5 1.5-3.5" />
        </svg>
      );
    case 'cheer':
      return (
        <svg {...common}>
          <path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5L12 14.4 7.5 16.8l.9-5L4.8 8.3l5-.7z" />
          <path d="M5 20h14" />
        </svg>
      );
    case 'spin':
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.3-5.7" />
          <path d="M20 4v4.5h-4.5" />
        </svg>
      );
    case 'bow':
      return (
        <svg {...common}>
          <circle cx="15.5" cy="6.5" r="2.3" />
          <path d="M14 9.5L9 13l-1 8M9 13l6 1.5M8 21h4" />
        </svg>
      );
    case 'dance':
      return (
        <svg {...common}>
          <circle cx="12" cy="4.5" r="2.2" />
          <path d="M12 7v7M12 9l-5-3M12 9l5 1.5M12 14l-4 6M12 14l3 3 3-1" />
          <path d="M3 13c1-1 1-2 0-3M21 7c1 1 1 2 0 3" />
        </svg>
      );
    case 'laugh':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M7.5 9.5l2 1-2 1M16.5 9.5l-2 1 2 1" />
          <path d="M7 14h10c-.5 3-2.5 4.5-5 4.5S7.5 17 7 14z" />
        </svg>
      );
    case 'sit':
      return (
        <svg {...common}>
          <circle cx="8" cy="5" r="2.2" />
          <path d="M8 8v7h7l2 5M8 11l5 1" />
          <path d="M3 20h18" />
        </svg>
      );
    case 'salute':
      return (
        <svg {...common}>
          <circle cx="11" cy="6" r="2.4" />
          <path d="M11 9v7M11 16l-3 5M11 16l3 5M11 10.5l5-1.5-3-4.5" />
          <path d="M8 10.5l-2 4" />
        </svg>
      );
    case 'juggle':
      return (
        <svg {...common}>
          <circle cx="6" cy="10" r="2.4" />
          <circle cx="12" cy="4.5" r="2.4" />
          <circle cx="18" cy="10" r="2.4" />
          <path d="M5 20c1-4 4-6 7-6s6 2 7 6" />
        </svg>
      );
    case 'faint':
      return (
        <svg {...common}>
          <path d="M3 18h18" />
          <rect x="5" y="12" width="13" height="5" rx="2" />
          <path d="M18 10.5l2 2m0-2l-2 2" />
          <path d="M8 8c1-2 3-2 4 0s3 2 4 0" />
        </svg>
      );
  }
}

/** Card art for a catalogue item (or the bare-turret / empty-slot choices: 'none'). */
export function ItemIcon({ id, size = 40, category }: { id: string; size?: number; category?: string }) {
  const item = itemById(id);
  const cat = item?.category ?? category;
  if (cat === 'paint' && item?.paintIndex !== undefined) {
    const p = PAINT_JOBS[item.paintIndex];
    return <TickerBadge size={size} body={p.body} trim={p.trim} accent={p.accent} />;
  }
  if (cat === 'hat') return hat(id, size);
  if (cat === 'key') return key(id, size);
  if (cat === 'gesture') return <GestureGlyph id={id as EmoteId} size={size * 0.8} />;
  if (cat === 'accessory') {
    if (id === 'none')
      return (
        <Svg size={size}>
          <circle cx="24" cy="24" r="14" fill="none" stroke={INK} strokeWidth="2.5" strokeDasharray="4 4" />
        </Svg>
      );
    return accessory(id, size);
  }
  return null;
}
